import db from "../config/env.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";


// Login  for driver and commuter
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password",
      });
    }

    // ================= STEP 1: CHECK USERAUTH =================
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
      // ================= STEP 2: CHECK DRIVERAUTH =================
      const [drivers] = await db.promise().query(
        `SELECT 
            d.driver_id AS id,
            d.email,
            d.password,
            r.role_name,
            di.first_name,
            di.last_name,
            'driver' AS type
         FROM driverauth d
         JOIN roles r ON d.role_id = r.role_id
         LEFT JOIN driver_info di ON d.driver_id = di.driver_id
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
        type: account.type, // 🔥 important (user or driver)
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
        role: account.role_name, // from roles table
        type: account.type,      // 'user' or 'driver'
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

// Getter driver info
export const getDriverInfo = async (req, res) => {
  try{
    const getInfo = 
      `SELECT   
      v.type_name, 
      d.first_name, 
      d.middle_name, 
      d.last_name, 
      d.contact_number, 
      r.status,
      t.plate_number,
      v.seat_capacity
      FROM  driver_info d
      LEFT JOIN driverauth r ON d.driver_id = r.driver_id
      LEFT JOIN vehicles t ON d.vehicle_id = t.vehicle_id
      LEFT JOIN vehicle_types v ON  t.type_id = v.type_id
      `;

      const [rows] = await db.promise().query(getInfo);

    res.json(rows);
  } catch {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch fare prices' });
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
