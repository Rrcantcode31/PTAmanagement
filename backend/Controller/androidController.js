import db from "../config/env.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";


// Login for driver and commuter
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password",
      });
    }

    const [users] = await db.promise().query(
      `SELECT 
          u.user_id AS id,
          u.email,
          u.password,
          r.role_name,
          ui.first_name,
          ui.last_name,
          'user' AS type
       FROM userauth u
       JOIN roles r ON u.role_id = r.role_id
       LEFT JOIN user_info ui ON u.user_id = ui.user_id
       WHERE u.email = ?`,
      [email]
    );

    let account = null;

    if (users.length > 0) {
      account = users[0];
    } else {

      const [drivers] = await db.promise().query(
          `SELECT 
              d.driver_id AS id,
              d.email,
              d.password,
              r.role_name,
              di.first_name,
              di.last_name,
              di.terminal_id,
              tl.terminal_name,
              tl.latitude,
              tl.longitude,
              'driver' AS type
          FROM driverauth d
          JOIN roles r ON d.role_id = r.role_id
          LEFT JOIN driver_info di         ON d.driver_id    = di.driver_id
          LEFT JOIN terminal_locations tl  ON di.terminal_id = tl.terminal_id
          WHERE d.email = ?`,
          [email]
        );

      if (drivers.length > 0) {
        account = drivers[0];
      }
    }

    // ❌ If no account found
    if (!account) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // ================= PASSWORD CHECK =================
    const isValidPassword = await bcrypt.compare(
      password,
      account.password
    );

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // ================= TOKEN =================
    const token = jwt.sign(
      {
        id: account.id,
        role: account.role_name,
        type: account.type,
      },
      process.env.TOKEN_PASSWORD,
      { expiresIn: process.env.TOKEN_EXPIRATION || "90d" }
    );

    // ================= RESPONSE =================
    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
          id: account.id,
          email: account.email,
          firstName: account.first_name,
          lastName: account.last_name,
          role: account.role_name,
          type: account.type,

          // Driver-only fields (null for commuters)
          terminal_id:      account.terminal_id      ?? null,
          terminal_name:    account.terminal_name    ?? null,
          terminal_lat:     account.latitude  != null ? Number(account.latitude)  : null,
          terminal_lng:     account.longitude != null ? Number(account.longitude) : null,
        },
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// SIGNUP for commuters only
export const signup = async (req, res) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      middleName,
      contactNumber,
      fareCategory,   // 'regular' | 'student' | 'pwd' | 'senior'
    } = req.body;

    // ---------- 1. Required fields ----------
    if (!email || !password || !firstName || !lastName || !fareCategory) {
      return res.status(400).json({
        success: false,
        message: "Please provide email, password, first name, last name, and fare category",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    // ---------- 2. Server-side allowlist ----------
    // Matching your roles table:
    //   3 = Regular, 4 = Student, 5 = PWD, 6 = Senior citizen
    const COMMUTER_ROLE_MAP = {
      regular: 3,
      student: 4,
      pwd:     5,
      senior:  6,
    };

    const role_id = COMMUTER_ROLE_MAP[fareCategory.toLowerCase()];

    if (!role_id) {
      return res.status(400).json({
        success: false,
        message: "Invalid fare category",
      });
    }

    // ---------- 3. Duplicate check ----------
    const [existingUsers] = await db.promise().query(
      "SELECT user_id FROM userauth WHERE email = ?",
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    // ---------- 4. Hash password ----------
    const hashedPassword = await bcrypt.hash(password, 10);

    // ---------- 5. Insert into userauth + user_info ----------
    const connection = await db.promise().getConnection();
    await connection.beginTransaction();

    try {
      const [userResult] = await connection.query(
        `INSERT INTO userauth (email, password, role_id, created_at)
         VALUES (?, ?, ?, NOW())`,
        [email, hashedPassword, role_id]
      );

      const userId = userResult.insertId;

      await connection.query(
        `INSERT INTO user_info
           (user_id, first_name, middle_name, last_name, contact_number)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, firstName, middleName || null, lastName, contactNumber || null]
      );

      await connection.commit();

      // ---------- 6. Get role_name ----------
      const [roleRows] = await db.promise().query(
        "SELECT role_name FROM roles WHERE role_id = ?",
        [role_id]
      );
      const role_name = roleRows[0]?.role_name || "Regular";

      // ---------- 7. JWT — same shape as login ----------
      const token = jwt.sign(
        {
          id: userId,
          role: role_name,
          type: "user",
        },
        process.env.TOKEN_PASSWORD,
        { expiresIn: process.env.TOKEN_EXPIRATION || "90d" }
      );

      // ---------- 8. Respond — same shape as login ----------
      return res.status(201).json({
        success: true,
        message: "User registered successfully",
        token,
        user: {
          id: userId,
          email,
          firstName,
          lastName,
          role: role_name,
          type: "user",
        },
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// GET ROLES 
export const getRoles = async (req, res) => {
  try {
    const [roles] = await db.promise().query(
      "SELECT role_id, role_name FROM roles WHERE role_id IN (3, 4, 5, 6)"
    );

    res.json({
      success: true,
      roles,
    });
  } catch (error) {
    console.error("Get roles error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// GetAllTerminalLocations
export const GetAllTerminalLocations = async (req, res) => {
  try {
    const [rows] = await db.promise().query('SELECT * FROM terminal_locations');
    res.json({ terminals: rows });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch terminals' });
  }
};

export const getFarePrices = async (req, res) => {
  try {
    const priceInfo = `
      SELECT 
        t_from.terminal_name AS from_terminal,
        t_to.terminal_name AS to_terminal,
        t.kilometer,
        f.regular_t,
        f.discounted_t,
        f.regular_m,
        f.discounted_m
      FROM terminal_bounds t

      LEFT JOIN terminal_locations t_from 
        ON t.from_terminal_id = t_from.terminal_id

      LEFT JOIN terminal_locations t_to 
        ON t.to_terminal_id = t_to.terminal_id

      LEFT JOIN fare_prices f 
        ON t.bounds_id = f.bounds_id;
    `;

    const [rows] = await db.promise().query(priceInfo);

    res.json(rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch fare prices' });
  }
};

export const getDriverQueue = async (req, res) => {
  try {
    const { driver_id } = req.query;
    if (!driver_id) {
      return res.status(400).json({ success: false, message: "driver_id required" });
    }

    const HUB_TERMINAL_ID = 1;

    const [driverRows] = await db.promise().query(
      `SELECT
         d.driver_id,
         d.terminal_id,
         d.vehicle_id,
         d.first_name, d.middle_name, d.last_name,
         v.plate_number,
         vt.type_name AS vehicle_type
       FROM driver_info d
       LEFT JOIN vehicles v       ON d.vehicle_id = v.vehicle_id
       LEFT JOIN vehicle_types vt ON v.type_id    = vt.type_id
       WHERE d.driver_id = ?`,
      [driver_id]
    );

    if (driverRows.length === 0) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }

    const driver = driverRows[0];

    // ---- 2. Route for the driver's terminal ----
    let route = null;
    if (driver.terminal_id && driver.terminal_id !== HUB_TERMINAL_ID) {
      const [routeRows] = await db.promise().query(
        `SELECT
           b.bounds_id,
           b.kilometer,
           tf.terminal_id   AS from_id,
           tf.terminal_name AS from_name,
           tf.latitude      AS from_lat,
           tf.longitude     AS from_lng,
           tt.terminal_id   AS to_id,
           tt.terminal_name AS to_name,
           tt.latitude      AS to_lat,
           tt.longitude     AS to_lng
         FROM terminal_bounds b
         LEFT JOIN terminal_locations tf ON b.from_terminal_id = tf.terminal_id
         LEFT JOIN terminal_locations tt ON b.to_terminal_id   = tt.terminal_id
         WHERE (b.from_terminal_id = ? AND b.to_terminal_id = ?)
            OR (b.from_terminal_id = ? AND b.to_terminal_id = ?)
         LIMIT 1`,
        [driver.terminal_id, HUB_TERMINAL_ID, HUB_TERMINAL_ID, driver.terminal_id]
      );
      route = routeRows[0] || null;
    }

    // ---- 3. Queue at the driver's terminal ----
    const [queueRows] = await db.promise().query(
      `SELECT
         q.queue_id,
         q.driver_info_id AS driver_id,
         q.queue_status,
         ROW_NUMBER() OVER (
           ORDER BY
             CASE q.queue_status WHEN 'WAITING' THEN 0 ELSE 1 END,
             q.scheduled_dispatch_at ASC,
             q.joined_at ASC
         ) AS queue_position,
         d.first_name, d.middle_name, d.last_name,
         v.plate_number,
         vt.type_name AS vehicle_type
       FROM vehicle_queue q
       JOIN driver_info d        ON q.driver_info_id = d.driver_id
       JOIN vehicles v           ON q.vehicle_id     = v.vehicle_id
       LEFT JOIN vehicle_types vt ON v.type_id       = vt.type_id
       LEFT JOIN dispatch_zones dz ON q.zone_id      = dz.zone_id
       WHERE q.queue_status IN ('WAITING', 'QUEUED')
         AND (
           dz.terminal_id = ?
           OR (? IS NOT NULL AND q.bounds_id = ?)
         )
       ORDER BY queue_position ASC`,
      [
        driver.terminal_id,
        route?.bounds_id ?? null,
        route?.bounds_id ?? null,
      ]
    );

    return res.json({
      success: true,
      data: {
        driver: {
          driver_id:    driver.driver_id,
          driver_name:  [driver.first_name, driver.middle_name, driver.last_name]
            .filter(Boolean).join(" "),
          plate_number: driver.plate_number,
          vehicle_type: driver.vehicle_type,
          terminal_id:  driver.terminal_id,
        },
        route: route ? {
          bounds_id: route.bounds_id,
          kilometer: route.kilometer,
          from: {
            id:   route.from_id,
            name: route.from_name,
            lat:  Number(route.from_lat),
            lng:  Number(route.from_lng),
          },
          to: {
            id:   route.to_id,
            name: route.to_name,
            lat:  Number(route.to_lat),
            lng:  Number(route.to_lng),
          },
        } : null,
        queue: queueRows.map(q => ({
          queue_id:       q.queue_id,
          driver_id:      q.driver_id,
          driver_name:    [q.first_name, q.middle_name, q.last_name].filter(Boolean).join(" "),
          plate_number:   q.plate_number,
          vehicle_type:   q.vehicle_type,
          queue_position: q.queue_position,
          queue_status:   q.queue_status,
        })),
      },
    });
  } catch (err) {
    console.error("getDriverQueue error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getTerminalQueue = async (req, res) => {
  try {
    const { terminal_id } = req.query;
    if (!terminal_id) {
      return res.status(400).json({ success: false, message: "terminal_id required" });
    }

    const HUB_TERMINAL_ID = 1; // Koronadal

    // ---- Get hub + selected terminal coords ----
    const [termRows] = await db.promise().query(
      `SELECT terminal_id, terminal_name, latitude, longitude
         FROM terminal_locations
        WHERE terminal_id IN (?, ?)`,
      [HUB_TERMINAL_ID, terminal_id]
    );

    const hub  = termRows.find(t => t.terminal_id === HUB_TERMINAL_ID);
    const dest = termRows.find(t => t.terminal_id === Number(terminal_id));

    if (!hub || !dest) {
      return res.status(404).json({ success: false, message: "Terminal not found" });
    }

    // ---- Queue for the selected terminal ----
    const [queueRows] = await db.promise().query(
      `SELECT
         q.queue_id,
         q.driver_info_id AS driver_id,
         q.queue_status,
         q.scheduled_dispatch_at,              -- ← now returned to the client
         ROW_NUMBER() OVER (
           ORDER BY
             CASE q.queue_status WHEN 'WAITING' THEN 0 ELSE 1 END,
             q.scheduled_dispatch_at ASC,
             q.joined_at ASC
         ) AS queue_position,
         d.first_name, d.middle_name, d.last_name,
         v.plate_number,
         vt.type_name AS vehicle_type
       FROM vehicle_queue q
       JOIN driver_info d         ON q.driver_info_id = d.driver_id
       JOIN vehicles v            ON q.vehicle_id     = v.vehicle_id
       LEFT JOIN vehicle_types vt ON v.type_id        = vt.type_id
       LEFT JOIN dispatch_zones dz ON q.zone_id       = dz.zone_id
       WHERE q.queue_status IN ('WAITING', 'QUEUED')
         AND dz.terminal_id = ?
       ORDER BY queue_position ASC`,
      [terminal_id]
    );

    return res.json({
      success: true,
      data: {
        hub: {
          id:   hub.terminal_id,
          name: hub.terminal_name,
          lat:  Number(hub.latitude),
          lng:  Number(hub.longitude),
        },
        dest: {
          id:   dest.terminal_id,
          name: dest.terminal_name,
          lat:  Number(dest.latitude),
          lng:  Number(dest.longitude),
        },
        queue: queueRows.map(q => ({
          queue_id:              q.queue_id,
          driver_id:             q.driver_id,
          plate_number:          q.plate_number,
          vehicle_type:          q.vehicle_type,
          queue_position:        q.queue_position,
          queue_status:          q.queue_status,
          scheduled_dispatch_at: q.scheduled_dispatch_at,   // ← ADD
        })),
      },
    });
  } catch (err) {
    console.error("getTerminalQueue error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /api/auth/nearbyTerminals?lat=X&lng=Y
export const getNearbyTerminals = async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: "lat and lng required" });
    }

    const latitude  = Number(lat);
    const longitude = Number(lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({ success: false, message: "Invalid coordinates" });
    }

    const [rows] = await db.promise().query(
      `SELECT
         t.terminal_id,
         t.terminal_name,
         t.terminal_address,
         t.latitude,
         t.longitude,
         (6371 * ACOS(
           LEAST(1, GREATEST(-1,
             COS(RADIANS(?)) * COS(RADIANS(t.latitude)) *
             COS(RADIANS(t.longitude) - RADIANS(?)) +
             SIN(RADIANS(?)) * SIN(RADIANS(t.latitude))
           ))
         )) AS distance_km,
         (
           SELECT COUNT(*)
             FROM vehicle_queue q
             LEFT JOIN dispatch_zones dz ON q.zone_id = dz.zone_id
            WHERE q.queue_status IN ('WAITING', 'QUEUED')
              AND dz.terminal_id = t.terminal_id
         ) AS queue_count
       FROM terminal_locations t
       ORDER BY distance_km ASC
       LIMIT 5`,
      [latitude, longitude, latitude]
    );

    return res.json({
      success: true,
      data: rows.map(r => ({
        terminal_id:      r.terminal_id,
        terminal_name:    r.terminal_name,
        terminal_address: r.terminal_address,
        latitude:         Number(r.latitude),
        longitude:        Number(r.longitude),
        distance_km:      Number(r.distance_km),
        queue_count:      Number(r.queue_count),
      })),
    });
  } catch (err) {
    console.error("getNearbyTerminals error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /api/auth/tripEstimate?from_terminal_id=X&to_terminal_id=Y
export const getTripEstimate = async (req, res) => {
  try {
    const { from_terminal_id, to_terminal_id } = req.query;

    if (!from_terminal_id || !to_terminal_id) {
      return res.status(400).json({
        success: false,
        message: "from_terminal_id and to_terminal_id required",
      });
    }

    // ---- 1. Look up both terminals ----
    const [termRows] = await db.promise().query(
      `SELECT terminal_id, terminal_name, latitude, longitude
         FROM terminal_locations
        WHERE terminal_id IN (?, ?)`,
      [from_terminal_id, to_terminal_id]
    );

    const from = termRows.find(t => t.terminal_id === Number(from_terminal_id));
    const to   = termRows.find(t => t.terminal_id === Number(to_terminal_id));

    if (!from || !to) {
      return res.status(404).json({ success: false, message: "Terminal not found" });
    }

    // ---- 2. Look up bounds + fares between them ----
    const [fareRows] = await db.promise().query(
      `SELECT
         b.bounds_id,
         b.kilometer,
         f.regular_t,
         f.discounted_t,
         f.regular_m,
         f.discounted_m
       FROM terminal_bounds b
       LEFT JOIN fare_prices f ON f.bounds_id = b.bounds_id
       WHERE (b.from_terminal_id = ? AND b.to_terminal_id = ?)
          OR (b.from_terminal_id = ? AND b.to_terminal_id = ?)
       LIMIT 1`,
      [from_terminal_id, to_terminal_id, to_terminal_id, from_terminal_id]
    );

    const fare = fareRows[0] || null;

    return res.json({
      success: true,
      data: {
        from: {
          terminal_id:   from.terminal_id,
          terminal_name: from.terminal_name,
          latitude:      Number(from.latitude),
          longitude:     Number(from.longitude),
        },
        to: {
          terminal_id:   to.terminal_id,
          terminal_name: to.terminal_name,
          latitude:      Number(to.latitude),
          longitude:     Number(to.longitude),
        },
        fare: fare ? {
          bounds_id:     fare.bounds_id,
          kilometer:     Number(fare.kilometer),
          regular_t:     Number(fare.regular_t),
          discounted_t:  Number(fare.discounted_t),
          regular_m:     Number(fare.regular_m),
          discounted_m:  Number(fare.discounted_m),
        } : null,
      },
    });
  } catch (err) {
    console.error("getTripEstimate error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /api/auth/driverStats?driver_id=X
export const getDriverStats = async (req, res) => {
  try {
    const { driver_id } = req.query;
    if (!driver_id) {
      return res.status(400).json({ success: false, message: "driver_id required" });
    }

    const [rows] = await db.promise().query(
      `SELECT
         COALESCE(SUM(DATE(departure_time) = CURDATE()), 0)                                       AS trips_today,
         COALESCE(SUM(departure_time >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)), 0) AS trips_this_week,
         COALESCE(SUM(departure_time >= DATE_FORMAT(CURDATE(), '%Y-%m-01')), 0)                   AS trips_this_month
       FROM departure_logs
       WHERE driver_info_id = ?`,
      [driver_id]
    );

    const r = rows[0] || {};
    return res.json({
      success: true,
      data: {
        tripsToday:     Number(r.trips_today)      || 0,
        tripsThisWeek:  Number(r.trips_this_week)  || 0,
        tripsThisMonth: Number(r.trips_this_month) || 0,
      },
    });
  } catch (err) {
    console.error("getDriverStats error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

