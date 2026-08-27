import db from "../config/env.js"; // adjust to your actual db import path
import * as turf from "@turf/turf";

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

      // Fetch active zones for this terminal, with boundary as GeoJSON
      const [zones] = await db.promise().query(
        `SELECT zone_id, zone_name, ST_AsGeoJSON(boundary) AS boundary
           FROM dispatch_zones
          WHERE terminal_id = ?
            AND is_active = 1`,
        [terminalId]
      );

      const driverPoint = turf.point([longitude, latitude]);

      let matchedZone = null;

      for (const zone of zones) {
        const geoJson =
          typeof zone.boundary === "string"
            ? JSON.parse(zone.boundary)
            : zone.boundary;

        const polygon = turf.polygon(geoJson.coordinates);

        // Buffer the polygon by 15 meters (true geodesic distance,
        // accounts for real-world GPS drift near buildings/foliage)
        const bufferedPolygon = turf.buffer(polygon, 0.015, { units: "kilometers" });

        if (turf.booleanPointInPolygon(driverPoint, bufferedPolygon)) {
          matchedZone = zone;
          break;
        }
      }

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