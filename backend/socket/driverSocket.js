import db from "../config/env.js";
import { findZoneContainingPoint } from "./helper/geofence.js";

const SLOT_DURATION_MINUTES   = Number(process.env.SLOT_DURATION_MINUTES || 30);
const DEPARTURE_GRACE_SECONDS = Number(process.env.DEPARTURE_GRACE_SECONDS || 60);

// Koronadal City = the hub terminal that all routes originate from
const HUB_TERMINAL_ID = Number(process.env.HUB_TERMINAL_ID || 1);

// Module-level, survives socket reconnects
const pendingDepartureTimers = new Map();

export function registerDriverHandlers(io, socket) {

  socket.on("location:update", async ({
    driverId,
    latitude,
    longitude,
    boundsId = null,          // still accepted if the app sends one
  }) => {
    try {
      if (!driverId || latitude == null || longitude == null) return;

      const [driverRows] = await db.promise().query(
        `SELECT terminal_id, vehicle_id FROM driver_info WHERE driver_id = ?`,
        [driverId]
      );
      if (driverRows.length === 0) return;
      const { terminal_id: terminalId, vehicle_id: vehicleId } = driverRows[0];

      const [statusRows] = await db.promise().query(
        `SELECT status FROM driverauth WHERE driver_id = ?`,
        [driverId]
      );
      const previousStatus = statusRows[0]?.status || "INACTIVE";

      const matchedZone = await findZoneContainingPoint(terminalId, latitude, longitude);
      const insideZone  = matchedZone !== null;
      const newStatus   = insideZone ? "ACTIVE" : "INACTIVE";

      await db.promise().query(
        `UPDATE driverauth SET status = ? WHERE driver_id = ?`,
        [newStatus, driverId]
      );

      const justEntered = previousStatus !== "ACTIVE" && newStatus === "ACTIVE";
      const justLeft    = previousStatus === "ACTIVE" && newStatus !== "ACTIVE";

      // ==================================================
      // ENTER: auto-join the queue
      // ==================================================
      if (justEntered && vehicleId) {

        // Cancel any pending departure — they came back
        if (pendingDepartureTimers.has(driverId)) {
          clearTimeout(pendingDepartureTimers.get(driverId));
          pendingDepartureTimers.delete(driverId);
          console.log(`[queue] cancelled pending departure for driver ${driverId}`);
        }

        // ---- Resolve bounds_id ----
        // Priority:
        //   1. Use the app-provided value if present
        //   2. Fall back to looking up the route via the driver's terminal assignment
        let resolvedBoundsId = boundsId;

        if (!resolvedBoundsId) {
          if (terminalId && terminalId !== HUB_TERMINAL_ID) {
            const [boundsRows] = await db.promise().query(
              `SELECT bounds_id FROM terminal_bounds
                WHERE (from_terminal_id = ? AND to_terminal_id = ?)
                   OR (from_terminal_id = ? AND to_terminal_id = ?)
                LIMIT 1`,
              [terminalId, HUB_TERMINAL_ID, HUB_TERMINAL_ID, terminalId]
            );
            resolvedBoundsId = boundsRows[0]?.bounds_id || null;
          }
        }

        if (!resolvedBoundsId) {
          console.warn(
            `[queue] no bounds_id for driver ${driverId} (terminal ${terminalId}) — skipping join`
          );
          return socket.emit("queue:join:error", {
            message: "No route is assigned to your terminal. Contact the dispatcher.",
          });
        }

        // Skip if already WAITING
        const [waitingRows] = await db.promise().query(
          `SELECT queue_id FROM vehicle_queue
            WHERE driver_info_id = ? AND queue_status = 'WAITING' LIMIT 1`,
          [driverId]
        );
        if (waitingRows.length > 0) return;

        // Compute slot
        const [schedRows] = await db.promise().query(
          `SELECT MAX(scheduled_dispatch_at) AS latest
             FROM vehicle_queue WHERE queue_status = 'WAITING'`
        );
        const latest = schedRows[0]?.latest;
        const baseTime = latest ? new Date(latest) : new Date();
        const scheduledDispatchAt = new Date(
          baseTime.getTime() + SLOT_DURATION_MINUTES * 60 * 1000
        );
        const scheduledStr = scheduledDispatchAt
          .toISOString().slice(0, 19).replace("T", " ");

        const [result] = await db.promise().query(
          `INSERT INTO vehicle_queue
             (driver_info_id, vehicle_id, bounds_id, queue_status,
              joined_at, scheduled_dispatch_at,
              joined_latitude, joined_longitude,
              is_within_geofence, zone_id)
           VALUES (?, ?, ?, 'WAITING', NOW(), ?, ?, ?, 1, ?)`,
          [driverId, vehicleId, resolvedBoundsId, scheduledStr,
           latitude, longitude, matchedZone.zone_id]
        );

        const entry = {
          queue_id: result.insertId,
          driverId, vehicleId,
          boundsId: resolvedBoundsId,
          zone_id: matchedZone.zone_id,
          zone_name: matchedZone.zone_name,
          joined_at: Date.now(),
          scheduled_dispatch_at: scheduledStr,
        };
        io.to("admins").emit("queue:driver_joined", entry);
        socket.emit("queue:joined", entry);
      }

      // ==================================================
      // LEAVE: auto-dispatch only if driver is at FRONT of line
      // ==================================================
      if (justLeft && vehicleId) {

        const [qRows] = await db.promise().query(
          `SELECT
             q.queue_id,
             q.bounds_id,
             q.vehicle_id,
             q.zone_id,
             q.scheduled_dispatch_at,
             (SELECT COUNT(*) FROM vehicle_queue q2
                WHERE q2.queue_status = 'WAITING'
                  AND q2.queue_id <> q.queue_id
                  AND (
                       q2.scheduled_dispatch_at < q.scheduled_dispatch_at
                    OR (q2.scheduled_dispatch_at = q.scheduled_dispatch_at
                        AND q2.joined_at < q.joined_at)
                  )
             ) AS ahead
           FROM vehicle_queue q
           WHERE q.driver_info_id = ? AND q.queue_status = 'WAITING'
           LIMIT 1`,
          [driverId]
        );

        if (qRows.length > 0) {
          const q = qRows[0];

          if (q.ahead > 0) {
            console.log(`[queue] driver ${driverId} left but is #${q.ahead + 1} — no auto-dispatch`);
          } else {
            if (pendingDepartureTimers.has(driverId)) {
              clearTimeout(pendingDepartureTimers.get(driverId));
            }

            const timer = setTimeout(async () => {
              try {
                const [checkRows] = await db.promise().query(
                  `SELECT status FROM driverauth WHERE driver_id = ?`,
                  [driverId]
                );
                if (checkRows[0]?.status === "ACTIVE") {
                  console.log(`[queue] driver ${driverId} returned — aborting dispatch`);
                  pendingDepartureTimers.delete(driverId);
                  return;
                }

                const [stillWaiting] = await db.promise().query(
                  `SELECT queue_id, bounds_id, vehicle_id, zone_id
                     FROM vehicle_queue
                    WHERE queue_id = ? AND queue_status = 'WAITING'`,
                  [q.queue_id]
                );
                if (stillWaiting.length === 0) {
                  pendingDepartureTimers.delete(driverId);
                  return;
                }

                const [aheadRows] = await db.promise().query(
                  `SELECT COUNT(*) AS ahead FROM vehicle_queue
                    WHERE queue_status = 'WAITING'
                      AND queue_id <> ?
                      AND scheduled_dispatch_at < ?`,
                  [q.queue_id, q.scheduled_dispatch_at]
                );
                if (aheadRows[0].ahead > 0) {
                  console.log(`[queue] driver ${driverId} no longer #1 — aborting`);
                  pendingDepartureTimers.delete(driverId);
                  return;
                }

                await db.promise().query(
                  `UPDATE vehicle_queue
                      SET queue_status = 'DISPATCHED', served_at = NOW()
                    WHERE queue_id = ?`,
                  [q.queue_id]
                );

                const [logResult] = await db.promise().query(
                  `INSERT INTO departure_logs
                     (queue_id, driver_info_id, vehicle_id, bounds_id,
                      departure_time, approved_by, approval_type,
                      remarks, created_at, zone_id)
                   VALUES (?, ?, ?, ?, NOW(), NULL, 'AUTO', NULL, NOW(), ?)`,
                  [q.queue_id, driverId, q.vehicle_id, q.bounds_id, q.zone_id]
                );

                console.log(`[queue] auto-dispatched driver ${driverId}, log ${logResult.insertId}`);

                io.to("admins").emit("queue:driver_dispatched", {
                  queue_id: q.queue_id,
                  driver_info_id: driverId,
                  departure_id: logResult.insertId,
                });

                socket.emit("trip:started", {
                  departure_id: logResult.insertId,
                  queue_id: q.queue_id,
                  bounds_id: q.bounds_id,
                  departed_at: Date.now(),
                });

                pendingDepartureTimers.delete(driverId);
              } catch (err) {
                console.error("[queue] departure timer failed:", err);
                pendingDepartureTimers.delete(driverId);
              }
            }, DEPARTURE_GRACE_SECONDS * 1000);

            pendingDepartureTimers.set(driverId, timer);
            console.log(`[queue] driver ${driverId} (#1) left — dispatching in ${DEPARTURE_GRACE_SECONDS}s`);
          }
        }
      }

      io.to("admins").emit("driver:location", {
        driverId, latitude, longitude,
        status: newStatus,
        zone: insideZone ? matchedZone.zone_name : null,
        timestamp: Date.now(),
      });

    } catch (err) {
      console.error("[queue] location:update FAILED:", err.message, err.code);
    }
  });
}