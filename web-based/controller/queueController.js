const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { error } = require('console');
const dbPool = require('../database/dbPool')

// ============================================
// GET /queue?zone_id=1&bounds_id=5
// List all WAITING drivers, optionally filtered
// ============================================
exports.getQueueByZone = async (req, res) => { 
  try {
    const { zone_id, bounds_id } = req.query;

    const [rows] = await dbPool.promise().query(
      `SELECT
         q.queue_id,
         q.queue_status,
         q.joined_at,
         q.joined_latitude,
         q.joined_longitude,
         q.zone_id,
         q.bounds_id,
         q.driver_info_id,
         d.first_name,
         d.middle_name,
         d.last_name,
         d.contact_number,
         v.vehicle_id,
         v.plate_number,
         v.type_id,
         vt.type_name,
         b.from_terminal_id,
         b.to_terminal_id,
         tf.terminal_name AS from_terminal,
         tt.terminal_name AS to_terminal,
         dz.zone_name
       FROM vehicle_queue q
       JOIN driver_info d          ON q.driver_info_id = d.driver_id
       JOIN vehicles v             ON q.vehicle_id     = v.vehicle_id
       LEFT JOIN vehicle_types vt  ON v.type_id        = vt.type_id
       LEFT JOIN terminal_bounds b ON q.bounds_id      = b.bounds_id
       LEFT JOIN terminal_locations tf ON b.from_terminal_id = tf.terminal_id
       LEFT JOIN terminal_locations tt ON b.to_terminal_id   = tt.terminal_id
       LEFT JOIN dispatch_zones dz ON q.zone_id        = dz.zone_id
       WHERE q.queue_status = 'WAITING'
         AND (? IS NULL OR q.zone_id = ?)
         AND (? IS NULL OR q.bounds_id = ?)
       ORDER BY q.joined_at ASC`,
      [
        zone_id || null, zone_id || null,
        bounds_id || null, bounds_id || null,
      ]
    );

    // Position in line (1-based)
    const data = rows.map((row, index) => ({
      ...row,
      position: index + 1,
    }));

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error("getQueueByZone error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch queue",
      error: err.message,
    });
  }
};

// ============================================
// POST /queue/dispatch
// Body: { queue_id, approval_type?, remarks? }
// Marks queue entry DISPATCHED + writes departure_logs
// ============================================
exports.dispatchDriver = async (req, res) => {
  const { queue_id, approval_type = "MANUAL", remarks = null } = req.body;

  if (!queue_id) {
    return res.status(400).json({
      success: false,
      message: "queue_id is required",
    });
  }

  const conn = await dbPool.promise().getConnection();
  await conn.beginTransaction();

  try {
    // Lock the row so two admins can't dispatch the same driver
    const [qRows] = await conn.query(
      `SELECT *
         FROM vehicle_queue
        WHERE queue_id = ?
          AND queue_status = 'WAITING'
        FOR UPDATE`,
      [queue_id]
    );

    if (qRows.length === 0) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({
        success: false,
        message: "Queue entry not found or already dispatched.",
      });
    }

    const q = qRows[0];

    await conn.query(
      `UPDATE vehicle_queue
          SET queue_status = 'DISPATCHED',
              served_at    = NOW()
        WHERE queue_id = ?`,
      [queue_id]
    );

    // In web-based, this comes from the session set during admin Login
    const adminId = req.session?.adminAuth?.admin_id || null;

    const [logResult] = await conn.query(
      `INSERT INTO departure_logs
         (queue_id, driver_info_id, vehicle_id, bounds_id,
          departure_time, approved_by, approval_type,
          remarks, created_at, zone_id)
       VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, NOW(), ?)`,
      [
        queue_id,
        q.driver_info_id,
        q.vehicle_id,
        q.bounds_id,
        adminId,
        approval_type,
        remarks,
        q.zone_id,
      ]
    );

    await conn.commit();
    conn.release();

    return res.status(201).json({
      success: true,
      message: "Driver dispatched successfully.",
      departure_id: logResult.insertId,
      queue_id,
    });
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error("dispatchDriver error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to dispatch driver",
      error: err.message,
    });
  }
};

// ============================================
// GET /queue/logs?zone_id=1&driver_info_id=5
// Past departures
// ============================================
exports.getDepartureLogs = async (req, res) => {
  try {
    const { zone_id, driver_info_id, limit = 100 } = req.query;

    const [rows] = await dbPool.promise().query(
      `SELECT
         dl.departure_id,
         dl.queue_id,
         dl.driver_info_id,
         dl.driver_info_id,
         dl.vehicle_id,
         dl.bounds_id,
         dl.departure_time,
         dl.approval_type,
         dl.remarks,
         dl.created_at,
         dl.zone_id,
         d.first_name,
         d.last_name,
         v.plate_number,
         tf.terminal_name AS from_terminal,
         tt.terminal_name AS to_terminal
       FROM departure_logs dl
       LEFT JOIN driver_info d     ON dl.driver_info_id = d.driver_id
       LEFT JOIN vehicles v        ON dl.vehicle_id     = v.vehicle_id
       LEFT JOIN terminal_bounds b ON dl.bounds_id      = b.bounds_id
       LEFT JOIN terminal_locations tf ON b.from_terminal_id = tf.terminal_id
       LEFT JOIN terminal_locations tt ON b.to_terminal_id   = tt.terminal_id
       WHERE (? IS NULL OR dl.zone_id = ?)
         AND (? IS NULL OR dl.driver_info_id = ?)
       ORDER BY dl.departure_time DESC
       LIMIT ?`,
      [
        zone_id || null, zone_id || null,
        driver_info_id || null, driver_info_id || null,
        Number(limit),
      ]
    );

    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error("getDepartureLogs error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch departure logs",
      error: err.message,
    });
  }
};