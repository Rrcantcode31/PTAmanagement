import db from "../config/env.js";
import { findZoneContainingPoint } from "./helper/geofence.js";

// ============================================================
// CONFIG
// ============================================================
const SLOT_DURATION_MINUTES   = Number(process.env.SLOT_DURATION_MINUTES || 30);
const DEPARTURE_GRACE_SECONDS = Number(process.env.DEPARTURE_GRACE_SECONDS || 60);

const HUB_TERMINAL_ID = Number(process.env.HUB_TERMINAL_ID || 1);
const REQUIRED_INSIDE_MS = Number(process.env.REQUIRED_INSIDE_MS || 15000);
const REQUIRED_OUTSIDE_MS = Number(process.env.REQUIRED_OUTSIDE_MS || 45000);
const REQUEUE_COOLDOWN_SECONDS = Number(process.env.REQUEUE_COOLDOWN_SECONDS || 60);

// ============================================================
// OVERDUE SAFETY NET
// ============================================================
// If a driver's scheduled slot expired more than this many minutes ago,
// force-dispatch them regardless of GPS status. This catches drivers
// whose app is closed, phone is off, or GPS is not sending pings.
const OVERDUE_MARGIN_MINUTES = Number(process.env.OVERDUE_MARGIN_MINUTES || 5);
const OVERDUE_CHECK_INTERVAL_MS = 60000; // Run every 60s

// ============================================================
// MODULE-LEVEL STATE
// ============================================================
const pendingDepartureTimers = new Map();
const insideSince            = new Map();
const outsideSince           = new Map();

let overdueDispatcherStarted = false;

// ============================================================
// OVERDUE DISPATCHER — start once, runs globally
// ============================================================
function startOverdueDispatcher(io) {
  console.log(
    `[overdue] Safety net started — will force-dispatch WAITING entries ` +
    `that are ${OVERDUE_MARGIN_MINUTES}+ min past their scheduled slot. ` +
    `Checking every ${OVERDUE_CHECK_INTERVAL_MS / 1000}s.`
  );

  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - OVERDUE_MARGIN_MINUTES * 60 * 1000);
      const cutoffStr = cutoff.toISOString().slice(0, 19).replace("T", " ");

      const [overdueRows] = await db.promise().query(
        `SELECT queue_id, driver_info_id, vehicle_id, bounds_id, zone_id,
                scheduled_dispatch_at
           FROM vehicle_queue
          WHERE queue_status = 'WAITING'
            AND scheduled_dispatch_at IS NOT NULL
            AND scheduled_dispatch_at < ?
          ORDER BY scheduled_dispatch_at ASC
          LIMIT 5`,
        [cutoffStr]
      );

      if (overdueRows.length === 0) return;

      for (const q of overdueRows) {
        const overdueMin = Math.round(
          (Date.now() - new Date(q.scheduled_dispatch_at).getTime()) / 60000
        );
        console.log(
          `[overdue] queue_id ${q.queue_id} (driver ${q.driver_info_id}) ` +
          `is ${overdueMin}m overdue — force-dispatching`
        );

        const conn = await db.promise().getConnection();
        await conn.beginTransaction();

        try {
          // Lock the row and re-verify
          const [still] = await conn.query(
            `SELECT queue_id FROM vehicle_queue
              WHERE queue_id = ? AND queue_status = 'WAITING'
              FOR UPDATE`,
            [q.queue_id]
          );
          if (still.length === 0) {
            await conn.rollback();
            conn.release();
            continue;
          }

          // 1. Mark DISPATCHED
          await conn.query(
            `UPDATE vehicle_queue
                SET queue_status = 'DISPATCHED', served_at = NOW()
              WHERE queue_id = ?`,
            [q.queue_id]
          );

          // 2. Write departure log
          await conn.query(
            `INSERT INTO departure_logs
               (queue_id, driver_info_id, vehicle_id, bounds_id,
                departure_time, approved_by, approval_type,
                remarks, created_at, zone_id)
             VALUES (?, ?, ?, ?, NOW(), NULL, 'OVERDUE_AUTO',
                     'Auto-dispatched: scheduled slot expired', NOW(), ?)`,
            [q.queue_id, q.driver_info_id, q.vehicle_id, q.bounds_id, q.zone_id]
          );

          // 3. Promote the next QUEUED
          const [next] = await conn.query(
            `SELECT queue_id FROM vehicle_queue
              WHERE queue_status = 'QUEUED'
                AND zone_id = ?
                AND bounds_id = ?
              ORDER BY scheduled_dispatch_at ASC, joined_at ASC
              LIMIT 1`,
            [q.zone_id, q.bounds_id]
          );

          let promotedId = null;
          if (next.length > 0) {
            await conn.query(
              `UPDATE vehicle_queue
                  SET queue_status = 'WAITING'
                WHERE queue_id = ?`,
              [next[0].queue_id]
            );
            promotedId = next[0].queue_id;
          }

          await conn.commit();
          conn.release();

          console.log(
            `[overdue] dispatched queue_id ${q.queue_id}` +
            (promotedId ? `, promoted ${promotedId} to WAITING` : "")
          );

          // Clean up any pending timer for this driver
          if (pendingDepartureTimers.has(q.driver_info_id)) {
            clearTimeout(pendingDepartureTimers.get(q.driver_info_id));
            pendingDepartureTimers.delete(q.driver_info_id);
          }

          io.to("admins").emit("queue:driver_dispatched", {
            queue_id: q.queue_id,
            driver_info_id: q.driver_info_id,
            promoted_queue_id: promotedId,
            reason: 'OVERDUE_AUTO',
          });
        } catch (err) {
          await conn.rollback();
          conn.release();
          console.error(`[overdue] failed to dispatch ${q.queue_id}:`, err.message);
        }
      }
    } catch (err) {
      console.error("[overdue] interval error:", err.message);
    }
  }, OVERDUE_CHECK_INTERVAL_MS);
}

// ============================================================
// HANDLERS
// ============================================================
export function registerDriverHandlers(io, socket) {

  // Start the overdue dispatcher once
  if (!overdueDispatcherStarted) {
    overdueDispatcherStarted = true;
    startOverdueDispatcher(io);
  }

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

      // ---------- 2. Previous status ----------
      const [statusRows] = await db.promise().query(
        `SELECT status FROM driverauth WHERE driver_id = ?`,
        [driverId]
      );
      const previousStatus = statusRows[0]?.status || "INACTIVE";

      // ---------- 3. Geofence ----------
      const matchedZone = await findZoneContainingPoint(terminalId, latitude, longitude);
      const insideZone  = matchedZone !== null;

      // ---------- 4. Sustained-inside tracking ----------
      if (insideZone) {
        if (!insideSince.has(driverId)) {
          insideSince.set(driverId, Date.now());
        }
      } else {
        insideSince.delete(driverId);
      }

      const sustainedInsideMs = insideSince.has(driverId)
        ? Date.now() - insideSince.get(driverId)
        : 0;
      const sustainedInside = sustainedInsideMs >= REQUIRED_INSIDE_MS;

      // ---------- 4b. Sustained-outside tracking ----------
      if (!insideZone) {
        if (!outsideSince.has(driverId)) {
          outsideSince.set(driverId, Date.now());
        }
      } else {
        outsideSince.delete(driverId);
      }

      const sustainedOutsideMs = outsideSince.has(driverId)
        ? Date.now() - outsideSince.get(driverId)
        : 0;
      const sustainedOutside = sustainedOutsideMs >= REQUIRED_OUTSIDE_MS;

      // ---------- 5. Debounced status decision ----------
      let newStatus;
      if (!insideZone) {
        newStatus = "INACTIVE";
      } else if (sustainedInside || previousStatus === "ACTIVE") {
        newStatus = "ACTIVE";
      } else {
        newStatus = "INACTIVE";
      }

      if (newStatus !== previousStatus) {
        await db.promise().query(
          `UPDATE driverauth SET status = ? WHERE driver_id = ?`,
          [newStatus, driverId]
        );
      }

      socket.emit("driver:status", {
        status: newStatus,
        insideZone,
        zone: insideZone ? matchedZone.zone_name : null,
        latitude,
        longitude,
      });

      const justEntered = previousStatus !== "ACTIVE" && newStatus === "ACTIVE";
      const justLeft = sustainedOutside;

      // ==================================================
      // ENTER: auto-join the queue
      // ==================================================
      if (justEntered && vehicleId) {

        outsideSince.delete(driverId);

        if (pendingDepartureTimers.has(driverId)) {
          clearTimeout(pendingDepartureTimers.get(driverId));
          pendingDepartureTimers.delete(driverId);
          console.log(`[queue] cancelled pending departure for driver ${driverId}`);
        }

        const cooldownTime = new Date(Date.now() - REQUEUE_COOLDOWN_SECONDS * 1000);

        const [recentDispatch] = await db.promise().query(
          `SELECT departure_id, departure_time
             FROM departure_logs
            WHERE driver_info_id = ?
              AND departure_time > ?
            ORDER BY departure_time DESC
            LIMIT 1`,
          [driverId, cooldownTime]
        );

        if (recentDispatch.length > 0) {
          const minsAgo = Math.round(
            (Date.now() - new Date(recentDispatch[0].departure_time).getTime()) / 60000
          );
          console.warn(
            `[queue] driver ${driverId} re-entered but was dispatched ${minsAgo}m ago ` +
            `(cooldown ${REQUEUE_COOLDOWN_SECONDS / 60}m) — skipping`
          );
          return socket.emit("queue:join:error", {
            message: `Please wait before re-joining the queue.`,
          });
        }

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

        const [existingRows] = await db.promise().query(
          `SELECT queue_id FROM vehicle_queue
            WHERE driver_info_id = ?
              AND queue_status IN ('WAITING', 'QUEUED')
            LIMIT 1`,
          [driverId]
        );
        if (existingRows.length > 0) return;

        const [waitingCount] = await db.promise().query(
          `SELECT COUNT(*) AS n
             FROM vehicle_queue
            WHERE queue_status = 'WAITING'
              AND zone_id = ?
              AND bounds_id = ?`,
          [matchedZone.zone_id, resolvedBoundsId]
        );
        const startingStatus = waitingCount[0].n === 0 ? 'WAITING' : 'QUEUED';

        const [schedRows] = await db.promise().query(
          `SELECT MAX(scheduled_dispatch_at) AS latest
             FROM vehicle_queue
            WHERE queue_status IN ('WAITING', 'QUEUED')`
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
           VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, 1, ?)`,
          [driverId, vehicleId, resolvedBoundsId, startingStatus,
           scheduledStr, latitude, longitude, matchedZone.zone_id]
        );

        const entry = {
          queue_id: result.insertId,
          driverId, vehicleId,
          boundsId: resolvedBoundsId,
          zone_id: matchedZone.zone_id,
          zone_name: matchedZone.zone_name,
          queue_status: startingStatus,
          joined_at: Date.now(),
          scheduled_dispatch_at: scheduledStr,
        };
        console.log(`[queue] driver ${driverId} joined as ${startingStatus}`);
        io.to("admins").emit("queue:driver_joined", entry);
        socket.emit("queue:joined", entry);
      }

      // ==================================================
      // LEAVE: auto-dispatch only if driver is WAITING
      // ==================================================
      if (justLeft && vehicleId) {

        const [qRows] = await db.promise().query(
          `SELECT queue_id, bounds_id, vehicle_id, zone_id, scheduled_dispatch_at
             FROM vehicle_queue
            WHERE driver_info_id = ?
              AND queue_status = 'WAITING'
            LIMIT 1`,
          [driverId]
        );

        if (qRows.length > 0) {
          const q = qRows[0];

          if (pendingDepartureTimers.has(driverId)) {
            console.log(
              `[queue] driver ${driverId} still outside ` +
              `(${Math.round(sustainedOutsideMs / 1000)}s) — timer already running`
            );
            return;
          }

          console.log(
            `[queue] driver ${driverId} has been outside for ` +
            `${Math.round(sustainedOutsideMs / 1000)}s — starting ${DEPARTURE_GRACE_SECONDS}s grace period`
          );

          const timer = setTimeout(async () => {
            const conn = await db.promise().getConnection();
            await conn.beginTransaction();

            try {
              const [checkRows] = await conn.query(
                `SELECT status FROM driverauth WHERE driver_id = ?`,
                [driverId]
              );
              if (checkRows[0]?.status === "ACTIVE") {
                console.log(`[queue] driver ${driverId} returned — aborting dispatch`);
                await conn.rollback();
                conn.release();
                pendingDepartureTimers.delete(driverId);
                return;
              }

              const [stillWaiting] = await conn.query(
                `SELECT queue_id, bounds_id, vehicle_id, zone_id
                   FROM vehicle_queue
                  WHERE queue_id = ? AND queue_status = 'WAITING'
                  FOR UPDATE`,
                [q.queue_id]
              );
              if (stillWaiting.length === 0) {
                await conn.rollback();
                conn.release();
                pendingDepartureTimers.delete(driverId);
                return;
              }

              await conn.query(
                `UPDATE vehicle_queue
                    SET queue_status = 'DISPATCHED', served_at = NOW()
                  WHERE queue_id = ?`,
                [q.queue_id]
              );

              const [logResult] = await conn.query(
                `INSERT INTO departure_logs
                    (queue_id, driver_info_id, vehicle_id, bounds_id,
                      departure_time, approved_by, approval_type,
                      remarks, created_at, zone_id)
                  VALUES (?, ?, ?, ?, NOW(), NULL, 'system', NULL, NOW(), ?)`,
                [q.queue_id, driverId, q.vehicle_id, q.bounds_id, q.zone_id]
              );

              const [nextInLine] = await conn.query(
                `SELECT queue_id FROM vehicle_queue
                  WHERE queue_status = 'QUEUED'
                    AND zone_id = ?
                    AND bounds_id = ?
                  ORDER BY scheduled_dispatch_at ASC, joined_at ASC
                  LIMIT 1`,
                [q.zone_id, q.bounds_id]
              );

              let promotedId = null;
              if (nextInLine.length > 0) {
                await conn.query(
                  `UPDATE vehicle_queue
                      SET queue_status = 'WAITING'
                    WHERE queue_id = ?`,
                  [nextInLine[0].queue_id]
                );
                promotedId = nextInLine[0].queue_id;
              }

              await conn.commit();
              conn.release();

              console.log(`[queue] auto-dispatched driver ${driverId}, log ${logResult.insertId}`);
              if (promotedId) {
                console.log(`[queue] promoted queue ${promotedId} to WAITING`);
              }

              io.to("admins").emit("queue:driver_dispatched", {
                queue_id: q.queue_id,
                driver_info_id: driverId,
                departure_id: logResult.insertId,
                promoted_queue_id: promotedId,
              });

              socket.emit("trip:started", {
                departure_id: logResult.insertId,
                queue_id: q.queue_id,
                bounds_id: q.bounds_id,
                departed_at: Date.now(),
              });

              pendingDepartureTimers.delete(driverId);
            } catch (err) {
              await conn.rollback();
              conn.release();
              console.error("[queue] departure transaction failed:", err);
              pendingDepartureTimers.delete(driverId);
            }
          }, DEPARTURE_GRACE_SECONDS * 1000);

          pendingDepartureTimers.set(driverId, timer);
        } else {
          console.log(`[queue] driver ${driverId} left but was not WAITING — no dispatch`);
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
      console.error(err.stack);
    }
  });
}