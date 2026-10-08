import db from "../config/env.js";
import {
  findZoneContainingPoint,
  getQueuePosition,
} from "./helper/geofence.js";

const SLOT_DURATION_MINUTES = Number(process.env.SLOT_DURATION_MINUTES || 30);

export function registerQueueHandlers(io, socket) {

  // ============================================
  // DRIVER: JOIN QUEUE
  // ============================================
  socket.on("queue:join", async ({ driverId, boundsId, latitude, longitude }) => {
    let conn;
    try {
      if (!driverId || !boundsId) {
        return socket.emit("queue:join:error", {
          message: "Missing driverId or boundsId."
        });
      }

      const [driverRows] = await db.promise().query(
        `SELECT terminal_id, vehicle_id
           FROM driver_info WHERE driver_id = ?`,
        [driverId]
      );
      if (driverRows.length === 0) {
        return socket.emit("queue:join:error", { message: "Driver not found." });
      }

      const { terminal_id: terminalId, vehicle_id: vehicleId } = driverRows[0];

      if (!vehicleId) {
        return socket.emit("queue:join:error", {
          message: "No vehicle assigned to your account."
        });
      }

      const zone = await findZoneContainingPoint(terminalId, latitude, longitude);
      if (!zone) {
        return socket.emit("queue:join:error", {
          message: "You must be inside a dispatch zone to join the queue."
        });
      }

      // ---- Begin transaction ----
      conn = await db.promise().getConnection();
      await conn.beginTransaction();

      // ---- Refuse duplicate active entries (WAITING or QUEUED only) ----
      const [existing] = await conn.query(
        `SELECT queue_id FROM vehicle_queue
          WHERE driver_info_id = ?
            AND queue_status IN ('WAITING','QUEUED')
          LIMIT 1
          FOR UPDATE`,
        [driverId]
      );
      if (existing.length > 0) {
        await conn.rollback();
        conn.release();
        return socket.emit("queue:join:error", {
          message: "You already have an active queue entry.",
          queue_id: existing[0].queue_id
        });
      }

      // ---- Decide starting status: WAITING if group is empty ----
      const [waitingCount] = await conn.query(
        `SELECT COUNT(*) AS n
           FROM vehicle_queue
          WHERE queue_status = 'WAITING'
            AND zone_id = ?
            AND bounds_id = ?
          FOR UPDATE`,
        [zone.zone_id, boundsId]
      );
      const startingStatus = waitingCount[0].n === 0 ? 'WAITING' : 'QUEUED';

      // ---- Compute scheduled slot ----
      const [schedRows] = await conn.query(
        `SELECT MAX(scheduled_dispatch_at) AS latest
           FROM vehicle_queue
          WHERE queue_status IN ('WAITING','QUEUED')
            AND zone_id = ?
            AND bounds_id = ?`,
        [zone.zone_id, boundsId]
      );
      const latest = schedRows[0]?.latest;
      const baseTime = latest ? new Date(latest) : new Date();
      const scheduledAt = new Date(
        baseTime.getTime() + SLOT_DURATION_MINUTES * 60 * 1000
      );
      const scheduledStr = scheduledAt
        .toISOString().slice(0, 19).replace("T", " ");

      // ---- Insert ----
      const [result] = await conn.query(
        `INSERT INTO vehicle_queue
           (driver_info_id, vehicle_id, bounds_id, queue_status,
            joined_at, scheduled_dispatch_at,
            joined_latitude, joined_longitude,
            is_within_geofence, zone_id)
         VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, 1, ?)`,
        [driverId, vehicleId, boundsId, startingStatus,
         scheduledStr, latitude, longitude, zone.zone_id]
      );

      await conn.commit();
      conn.release();
      conn = null;

      const queueEntry = {
        queue_id: result.insertId,
        driverId,
        vehicleId,
        boundsId,
        zone_id: zone.zone_id,
        zone_name: zone.zone_name,
        queue_status: startingStatus,
        joined_at: Date.now(),
        scheduled_dispatch_at: scheduledStr,
        position: await getQueuePosition(result.insertId, zone.zone_id, boundsId),
      };

      console.log(`[queue] driver ${driverId} joined as ${startingStatus}`);
      socket.emit("queue:joined", queueEntry);
      io.to("admins").emit("queue:driver_joined", queueEntry);

    } catch (err) {
      if (conn) {
        try { await conn.rollback(); } catch {}
        conn.release();
      }
      console.error("queue:join error:", err);
      socket.emit("queue:join:error", { message: "Server error" });
    }
  });

  // ============================================
  // DRIVER: LEAVE QUEUE (voluntary cancel)
  // ============================================
  socket.on("queue:leave", async ({ driverId }) => {
    let conn;
    try {
      if (!driverId) return;

      conn = await db.promise().getConnection();
      await conn.beginTransaction();

      // Find the driver's active entry (WAITING or QUEUED)
      const [rows] = await conn.query(
        `SELECT queue_id, queue_status, zone_id, bounds_id
           FROM vehicle_queue
          WHERE driver_info_id = ?
            AND queue_status IN ('WAITING','QUEUED')
          LIMIT 1
          FOR UPDATE`,
        [driverId]
      );

      if (rows.length === 0) {
        await conn.rollback();
        conn.release();
        return socket.emit("queue:leave:error", {
          message: "No active queue entry to cancel."
        });
      }

      const entry = rows[0];

      // 👇 CHANGED: DELETE the row entirely instead of updating to 'CANCELLED'
      await conn.query(
        `DELETE FROM vehicle_queue
          WHERE queue_id = ?`,
        [entry.queue_id]
      );

      // If the leaving driver was WAITING, promote the next QUEUED
      if (entry.queue_status === 'WAITING') {
        const [nextInLine] = await conn.query(
          `SELECT queue_id FROM vehicle_queue
            WHERE queue_status = 'QUEUED'
              AND zone_id = ?
              AND bounds_id = ?
            ORDER BY scheduled_dispatch_at ASC, joined_at ASC
            LIMIT 1
            FOR UPDATE`,
          [entry.zone_id, entry.bounds_id]
        );

        if (nextInLine.length > 0) {
          await conn.query(
            `UPDATE vehicle_queue
                SET queue_status = 'WAITING'
              WHERE queue_id = ?`,
            [nextInLine[0].queue_id]
          );
          console.log(
            `[queue] promoted queue ${nextInLine[0].queue_id} to WAITING after driver ${driverId} left`
          );
          io.to("admins").emit("queue:driver_promoted", {
            queue_id: nextInLine[0].queue_id,
            zone_id: entry.zone_id,
            bounds_id: entry.bounds_id,
          });
        }
      }

      await conn.commit();
      conn.release();
      conn = null;

      socket.emit("queue:left", { driverId });
      io.to("admins").emit("queue:driver_left", { driverId });

    } catch (err) {
      if (conn) {
        try { await conn.rollback(); } catch {}
        conn.release();
      }
      console.error("queue:leave error:", err);
      socket.emit("queue:leave:error", { message: "Server error" });
    }
  });
}