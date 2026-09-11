import db from "../../config/env.js"; // adjust path
import * as turf from "@turf/turf";

export async function findZoneContainingPoint(terminalId, latitude, longitude) {
  const [zones] = await db.promise().query(
    `SELECT zone_id, zone_name, ST_AsGeoJSON(boundary) AS boundary
       FROM dispatch_zones
      WHERE terminal_id = ? AND is_active = 1`,
    [terminalId]
  );

  const point = turf.point([longitude, latitude]);

  for (const z of zones) {
    const geo =
      typeof z.boundary === "string" ? JSON.parse(z.boundary) : z.boundary;
    if (turf.booleanPointInPolygon(point, turf.polygon(geo.coordinates))) {
      return z;
    }
  }
  return null;
}

export async function getQueuePosition(queueId, zoneId, boundsId) {
  const [rows] = await db.promise().query(
    `SELECT COUNT(*) AS ahead
       FROM vehicle_queue
      WHERE zone_id = ?
        AND bounds_id = ?
        AND queue_status = 'WAITING'
        AND queue_id <> ?
        AND joined_at < (SELECT joined_at FROM vehicle_queue WHERE queue_id = ?)`,
    [zoneId, boundsId, queueId, queueId]
  );
  return (rows[0]?.ahead || 0) + 1;
}