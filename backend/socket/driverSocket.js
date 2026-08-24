import db from "../config/env.js"; // adjust to your actual db import path

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

      // Check if the point falls inside an active dispatch zone
      // for the driver's assigned terminal
      const [zoneMatch] = await db.promise().query(
        `SELECT zone_id, zone_name
           FROM dispatch_zones
          WHERE terminal_id = ?
            AND is_active = 1
            AND ST_Contains(boundary, ST_SRID(POINT(?, ?), 4326))
          LIMIT 1`,
        [terminalId, longitude, latitude]
      );

      const insideZone = zoneMatch.length > 0;
      const newStatus = insideZone ? "ACTIVE" : "INACTIVE";

      // Only the status is written to the DB — lat/lng is never stored
      await db.promise().query(
        `UPDATE driverauth SET status = ? WHERE driver_id = ?`,
        [newStatus, driverId]
      );

      // Broadcast the driver's live position + status to all subscribed admins
      io.to("admins").emit("driver:location", {
        driverId,
        latitude,
        longitude,
        status: newStatus,
        zone: insideZone ? zoneMatch[0].zone_name : null,
        timestamp: Date.now(),
      });

    } catch (err) {
      console.error("Socket location update error:", err);
    }
  });
}