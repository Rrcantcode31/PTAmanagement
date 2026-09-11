import db from "../config/env.js";
import {
  findZoneContainingPoint,
  getQueuePosition,
} from "./helper/geofence.js";

export function registerQueueHandlers(io, socket) {

  // ============================================
  // DRIVER: JOIN QUEUE
  // ============================================
  socket.on("queue:join", async ({ driverId, boundsId, latitude, longitude }) => {
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

      // Refuse duplicate active entries
      const [existing] = await db.promise().query(
        `SELECT queue_id FROM vehicle_queue
          WHERE driver_info_id = ?
            AND queue_status IN ('WAITING','DISPATCHED')
          LIMIT 1`,
        [driverId]
      );
      if (existing.length > 0) {
        return socket.emit("queue:join:error", {
          message: "You already have an active queue entry.",
          queue_id: existing[0].queue_id
        });
      }

      const [result] = await db.promise().query(
        `INSERT INTO vehicle_queue
           (driver_info_id, vehicle_id, bounds_id, queue_status,
            joined_at, joined_latitude, joined_longitude,
            is_within_geofence, zone_id)
         VALUES (?, ?, ?, 'WAITING', NOW(), ?, ?, 1, ?)`,
        [driverId, vehicleId, boundsId, latitude, longitude, zone.zone_id]
      );

      const queueEntry = {
        queue_id: result.insertId,
        driverId,
        vehicleId,
        boundsId,
        zone_id: zone.zone_id,
        zone_name: zone.zone_name,
        joined_at: Date.now(),
        position: await getQueuePosition(result.insertId, zone.zone_id, boundsId),
      };

      socket.emit("queue:joined", queueEntry);
      io.to("admins").emit("queue:driver_joined", queueEntry);

    } catch (err) {
      console.error("queue:join error:", err);
      socket.emit("queue:join:error", { message: "Server error" });
    }
  });

  // ============================================
  // DRIVER: LEAVE QUEUE (voluntary cancel)
  // ============================================
  socket.on("queue:leave", async ({ driverId }) => {
    try {
      if (!driverId) return;

      const [result] = await db.promise().query(
        `UPDATE vehicle_queue
            SET queue_status = 'CANCELLED'
          WHERE driver_info_id = ?
            AND queue_status = 'WAITING'`,
        [driverId]
      );

      if (result.affectedRows === 0) {
        return socket.emit("queue:leave:error", {
          message: "No active queue entry to cancel."
        });
      }

      socket.emit("queue:left", { driverId });
      io.to("admins").emit("queue:driver_left", { driverId });

    } catch (err) {
      console.error("queue:leave error:", err);
      socket.emit("queue:leave:error", { message: "Server error" });
    }
  });
}