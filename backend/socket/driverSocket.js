import db from "../config/env.js";
import { findZoneContainingPoint } from "./helper/geofence.js";

const SLOT_DURATION_MINUTES = Number(process.env.SLOT_DURATION_MINUTES || 30);

export function registerDriverHandlers(io, socket) {

  socket.on("location:update", async ({
    driverId,
    latitude,
    longitude,
    boundsId = null,
  }) => {
    try {
      if (!driverId || latitude == null || longitude == null) return;

      // ---------- 1. Driver + vehicle + terminal ----------
      const [driverRows] = await db.promise().query(
        `SELECT terminal_id, vehicle_id FROM driver_info WHERE driver_id = ?`,
        [driverId]
      );
      if (driverRows.length === 0) return;

      const { terminal_id: terminalId, vehicle_id: vehicleId } = driverRows[0];

      // ---------- 2. Previous status (edge detection) ----------
      const [statusRows] = await db.promise().query(
        `SELECT status FROM driverauth WHERE driver_id = ?`,
        [driverId]
      );
      const previousStatus = statusRows[0]?.status || "INACTIVE";

      // ---------- 3. Geofence ----------
      const matchedZone = await findZoneContainingPoint(terminalId, latitude, longitude);
      const insideZone  = matchedZone !== null;
      const newStatus   = insideZone ? "ACTIVE" : "INACTIVE";

      // ---------- 4. Persist status ----------
      await db.promise().query(
        `UPDATE driverauth SET status = ? WHERE driver_id = ?`,
        [newStatus, driverId]
      );

      // ---------- 5. Only act on INACTIVE -> ACTIVE ----------
      const justEntered = previousStatus !== "ACTIVE" && newStatus === "ACTIVE";

      console.log("[queue-debug]", {
        driverId,
        vehicleId,
        boundsId,
        previousStatus,
        newStatus,
        insideZone,
        zone: matchedZone?.zone_name || null,
        justEntered,
        lat: latitude,
        lng: longitude,
      });

      if (justEntered && vehicleId) {

        // 5a. Skip if already WAITING — never duplicate.
        const [waitingRows] = await db.promise().query(
          `SELECT queue_id FROM vehicle_queue
            WHERE driver_info_id = ?
              AND queue_status = 'WAITING'
            LIMIT 1`,
          [driverId]
        );
        const hasWaiting = waitingRows.length > 0;

        if (!hasWaiting) {

          // 5b. Compute slot
          const [schedRows] = await db.promise().query(
            `SELECT MAX(scheduled_dispatch_at) AS latest
               FROM vehicle_queue
              WHERE queue_status = 'WAITING'`
          );
          const latest = schedRows[0]?.latest;

          const baseTime = latest ? new Date(latest) : new Date();
          const scheduledDispatchAt = new Date(
            baseTime.getTime() + SLOT_DURATION_MINUTES * 60 * 1000
          );

          const scheduledStr = scheduledDispatchAt
            .toISOString()
            .slice(0, 19)
            .replace("T", " ");

          console.log("[queue-debug] inserting", {
            driverId,
            vehicleId,
            boundsId,
            scheduledStr,
            zoneId: matchedZone.zone_id,
          });

          const [result] = await db.promise().query(
            `INSERT INTO vehicle_queue
               (driver_info_id, vehicle_id, bounds_id, queue_status,
                joined_at, scheduled_dispatch_at,
                joined_latitude, joined_longitude,
                is_within_geofence, zone_id)
             VALUES (?, ?, ?, 'WAITING', NOW(), ?, ?, ?, 1, ?)`,
            [
              driverId,
              vehicleId,
              boundsId,
              scheduledStr,
              latitude,
              longitude,
              matchedZone.zone_id,
            ]
          );

          const joinedEntry = {
            queue_id:              result.insertId,
            driverId,
            vehicleId,
            boundsId,
            zone_id:               matchedZone.zone_id,
            zone_name:             matchedZone.zone_name,
            joined_at:             Date.now(),
            scheduled_dispatch_at: scheduledStr,
            slot_duration_minutes: SLOT_DURATION_MINUTES,
          };

          io.to("admins").emit("queue:driver_joined", joinedEntry);
          socket.emit("queue:joined", joinedEntry);
        } 
      }

      // ---------- 6. Broadcast location ----------
      io.to("admins").emit("driver:location", {
        driverId,
        latitude,
        longitude,
        status:    newStatus,
        zone:      insideZone ? matchedZone.zone_name : null,
        timestamp: Date.now(),
      });

    } catch (err) {
      console.error("[queue-debug] FAILED:", err.message, err.code);
    }
  });
}