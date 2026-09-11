import db from "../config/env.js";
import { findZoneContainingPoint } from "./helper/geofence.js";

export function registerDriverHandlers(io, socket) {
  socket.on("location:update", async ({ driverId, latitude, longitude }) => {
    try {
      if (!driverId || latitude == null || longitude == null) return;

      // Get the driver's assigned terminal
      const [driverRows] = await db.promise().query(
        `SELECT terminal_id FROM driver_info WHERE driver_id = ?`,
        [driverId]
      );
      if (driverRows.length === 0) return;

      const terminalId = driverRows[0].terminal_id;

      // Reuse the shared geofence helper
      const matchedZone = await findZoneContainingPoint(
        terminalId,
        latitude,
        longitude
      );

      const insideZone = matchedZone !== null;
      const newStatus = insideZone ? "ACTIVE" : "INACTIVE";

      await db.promise().query(
        `UPDATE driverauth SET status = ? WHERE driver_id = ?`,
        [newStatus, driverId]
      );

      io.to("admins").emit("driver:location", {
        driverId,
        latitude,
        longitude,
        status: newStatus,
        zone: insideZone ? matchedZone.zone_name : null,
        timestamp: Date.now(),
      });

    } catch (err) {
      console.error("Socket location update error:", err);
    }
  });
}