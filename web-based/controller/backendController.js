const mysql = require('mysql2');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { error } = require('console');

const dbPool = mysql.createPool({
  host: process.env.DATABASE_NAME,
  port: process.env.DATABASE_PORT,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASS,
  database: process.env.DATABASE,
  waitForConnections: true
});

//Admin Login
exports.Login = async (req, res) => {
  try {
    const email = req.body.email?.trim();
    const password = req.body.password;

    if (!email || !password) {
      return res.render('Login', { message: 'Please enter username and password' });
    }

    const [results] = await dbPool.promise().query(
  `SELECT 
      a.admin_id,
      a.email,
      a.password,
      r.role_name,
      i.first_name,
      i.middle_name,
      i.last_name,
      i.contact_number
   FROM adminAuth a
   JOIN roles r ON a.role_id = r.role_id
   JOIN Admin_info i ON a.admin_id = i.admin_id
   WHERE a.email = ?`,
  [email]
  );

    if (results.length === 0) {
      return res.render('Login', { message: 'Incorrect email or password' });
    }

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.render('Login', { message: 'Incorrect email or password' });
    }

    const token = jwt.sign(
      { admin_id: user.admin_id },
      process.env.TOKEN_PASSWORD,
      { expiresIn: process.env.TOKEN_EXPIRATION }
    );

    const randomToken = crypto.randomBytes(32).toString('hex');

    req.session.adminAuth = {
    admin_id: user.admin_id,
    email: user.email,
    role: user.role_name,
    first_name: user.first_name,
    last_name: user.last_name
};

    const cookieOptions = {
      expires: new Date(
        Date.now() + parseInt(process.env.COOKIE_EXPIRATION) * 24 * 60 * 60 * 1000
      ),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production'
    };

    res.cookie('jwT', token, cookieOptions);
    res.cookie('randomSession', randomToken, cookieOptions);

    return res.redirect('/Dashboard');

  } catch (error) {
    console.log(error);
    return res.render('Login', { message: 'Server error. Please try again later.' });
  }
};

//Admin Login validation operation function
exports.isLoggedIn = async (req, res, next) => {
  try {
    if (req.session.adminAuth) {
      res.locals.adminAuth = req.session.adminAuth;
      return next();
    }

    const token = req.cookies.jwT;
    const randomSession = req.cookies.randomSession;

    if (token && randomSession) {
      const decoded = jwt.verify(token, process.env.TOKEN_PASSWORD);

      dbPool.query(
        `SELECT 
          a.admin_id,
          a.email,
          r.role_name,
          i.first_name,
          i.last_name,
          i.contact_number
        FROM adminAuth a
        JOIN roles r ON a.role_id = r.role_id
        JOIN Admin_info i ON a.admin_id = i.admin_id
        WHERE a.admin_id = ?`,
        [decoded.admin_id],
        (err, results) => {
          if (err) {
            console.log('DB error in isLoggedIn:', err);
            return res.redirect('/Login');
          }

          if (results.length === 0) {
            return res.redirect('/Login');
          }

          const user = results[0];
          req.session.adminAuth = {
            admin_id: user.admin_id,
            email: user.email,
            role: user.role_name,
            first_name: user.first_name,
            last_name: user.last_name,
          };
          res.locals.adminAuth = req.session.adminAuth;
          next();
        }
      );
    } else {
      return res.redirect('/Login');
    }
  } catch (error) {
    console.log('JWT or other error in isLoggedIn:', error);
    return res.redirect('/Login'); 
  }
};

// Admin Logout
exports.logout = async (req, res) => {
  try {
    // Destroy the session
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error:', err);
        // Still attempt to clear cookies even if session destroy fails
      }

      // Clear both authentication cookies
      res.clearCookie('jwT', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
      res.clearCookie('randomSession', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });

      // Redirect to login page (or send JSON if you prefer API-style)
      return res.redirect('/Login');
    });
  } catch (error) {
    console.error('Logout error:', error);
    // Fallback: clear cookies and redirect anyway
    res.clearCookie('jwT');
    res.clearCookie('randomSession');
    return res.redirect('/Login');
  }
};

// AddterminalLocation
exports.AddterminalLocation = async (req, res) => {
  try {
    const { terminal_name, terminal_address, latitude, longitude } = req.body;

    if (!terminal_name || !terminal_address || latitude == null || longitude == null) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    // Optional duplicate check
    const [existing] = await dbPool.promise().query(
      "SELECT * FROM terminal_locations WHERE terminal_name = ?",
      [terminal_name]
    );

    if (existing.length > 0) {
      return res.status(409).json({ error: "Terminal already exists." });
    }

    // Insert
    const [result] = await dbPool.promise().query(
      `INSERT INTO terminal_locations
       (terminal_name, terminal_address, latitude, longitude)
       VALUES (?, ?, ?, ?)`,
      [terminal_name, terminal_address, latitude, longitude]
    );

    return res.status(201).json({
      message: "Terminal location added successfully",
      terminal_id: result.insertId
    });
  } catch (error) {
    console.error("AddTerminalLocation Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Update terminal info
exports.UpdateTerminalLocation = async (req, res) => {
  try {
    const { terminal_id, terminal_name, terminal_address, latitude, longitude } = req.body;

    if (!terminal_id || !terminal_name || !terminal_address || latitude == null || longitude == null) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const [result] = await dbPool.promise().query(
      `UPDATE terminal_locations
       SET terminal_name = ?, terminal_address = ?, latitude = ?, longitude = ?
       WHERE terminal_id = ?`,
      [terminal_name, terminal_address, latitude, longitude, terminal_id]
    );

    // Optional: check if anything was actually updated
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Terminal not found." });
    }

    return res.status(200).json({
      message: "Terminal info updated successfully",
      data: {
        terminal_id,
        terminal_name,
        terminal_address,
        latitude,
        longitude
      }
    });

  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: "Failed to update location" });
  }
};

// Delete marked location
exports.DeleteTerminalLocation = async (req, res) => {
  try {
    const { terminal_id } = req.params;

    const [result] = await dbPool.promise().query(
      'DELETE FROM terminal_locations WHERE terminal_id = ?',
      [terminal_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Terminal not found" });
    }

    return res.status(200).json({
      message: "Terminal deleted successfully",
      terminal_id
    });

  } catch (err) { 
    console.log(err);
    return res.status(500).json({ error: "Failed to delete location" });
  }
};

// GetAllTerminalLocations
exports.GetAllTerminalLocations = async (req, res) => {
  try {
    const [rows] = await dbPool.promise().query('SELECT * FROM terminal_locations');
    res.json({ terminals: rows });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch terminals' });
  }
};

// Get All Vehicles
exports.getVehicles =async (req, res) => {
 try {
  const [row] = await dbPool.promise().query('SELECT * FROM vehicle_types');
  res.json({vehicles: row});

 } catch (err){
 console.log(err)
 res.status(500).json({error: 'Failed to fetch Vehicles'})
 }
}

// Admin Insert driver info and auth
exports.InsertDriverCred = async (req, res) => {
  try {
    const {
      email,
      password,
      role_id,
      first_name,
      middle_name,
      last_name,
      contact_number,
      plate_number,
      type_id,     // preferred
      vehicle_id,  // fallback (your current frontend uses this for vehicle_types.type_id)

      terminal_id,
      status, // optional, default "Inactive"
    } = req.body;

    // Normalize IDs coming from <select> ("" -> null)
    const terminalIdNormalized =
      terminal_id === "" || terminal_id === undefined ? null : terminal_id;

    const typeIdNormalizedRaw =
      type_id !== undefined ? type_id : vehicle_id; // fallback for your current HTML name="vehicle_id"
    const typeIdNormalized =
      typeIdNormalizedRaw === "" || typeIdNormalizedRaw === undefined
        ? null
        : typeIdNormalizedRaw;

    // Validation
    if (
      !email ||
      !password ||
      !first_name ||
      !last_name ||
      !contact_number ||
      !plate_number
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    if (!terminalIdNormalized) {
      return res
        .status(400)
        .json({ success: false, message: "Terminal is required" });
    }

    if (!typeIdNormalized) {
      return res
        .status(400)
        .json({ success: false, message: "Vehicle type is required" });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    // Force role = Driver only
    if (Number(role_id) !== 2) {
      return res.status(400).json({
        success: false,
        message: "Only Driver role allowed",
      });
    }

    // Check existing email
    const [existingUsers] = await dbPool
      .promise()
      .query("SELECT driver_id FROM driverauth WHERE email = ?", [email]);

    if (existingUsers.length > 0) {
      return res
        .status(409)
        .json({ success: false, message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const connection = await dbPool.promise().getConnection();
    await connection.beginTransaction();

    try {
      // Insert into driverauth
      const [userResult] = await connection.query(
        `INSERT INTO driverauth
         (email, password, role_id, status, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [email, hashedPassword, 2, status || "Inactive"]
      );

      const driverId = userResult.insertId;

      // Insert into vehicles (new vehicle assigned to driver)
      const [vehicleResult] = await connection.query(
        `INSERT INTO vehicles
         (plate_number, type_id, terminal_id)
         VALUES (?, ?, ?)`,
        [plate_number, typeIdNormalized, terminalIdNormalized]
      );

      const newVehicleId = vehicleResult.insertId;

      // Insert into driver_info
      await connection.query(
        `INSERT INTO driver_info
         (driver_id, vehicle_id, terminal_id, first_name, middle_name, last_name, contact_number)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          driverId,
          newVehicleId,
          terminalIdNormalized,
          first_name,
          middle_name || null,
          last_name,
          contact_number,
        ]
      );

      await connection.commit();

      return res.status(201).json({
        success: true,
        message: "Driver created successfully",
        user: {
          driverId,
          email,
          first_name,
          last_name,
          role: "Driver",
        },
        vehicle: {
          vehicle_id: newVehicleId,
          plate_number,
          type_id: typeIdNormalized,
          terminal_id: terminalIdNormalized,
          
        },
      });
    } catch (err) {
      await connection.rollback();
      console.error("Transaction error:", err);
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("InsertDriverCred error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
};

//Admin update driver info and auth
exports.UpdateDriverCred = async (req, res) => {
  try {
    const {
      driver_id, // REQUIRED

      // driverauth
      email,
      password,
      status,

      // driver_info
      first_name,
      middle_name,
      last_name,
      contact_number,
      terminal_id,

      // vehicle fields (updates the vehicle assigned to this driver)
      plate_number,
      type_id,     // preferred
      vehicle_id,  // fallback for type_id (frontend mismatch)
      vehicle_status,
    } = req.body;

    if (!driver_id) {
      return res
        .status(400)
        .json({ success: false, message: "driver_id is required" });
    }

    const terminalIdNormalized =
      terminal_id === "" || terminal_id === undefined ? undefined : terminal_id;

    const typeIdNormalizedRaw =
      type_id !== undefined ? type_id : vehicle_id; // fallback
    const typeIdNormalized =
      typeIdNormalizedRaw === "" || typeIdNormalizedRaw === undefined
        ? undefined
        : typeIdNormalizedRaw;

    if (password !== undefined && password !== null && password !== "") {
      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 8 characters",
        });
      }
    }

    const connection = await db.promise().getConnection();
    await connection.beginTransaction();

    try {
      // Get current driver_info (includes vehicle_id)
      const [infoRows] = await connection.query(
        `SELECT driver_id, vehicle_id FROM driver_info WHERE driver_id = ?`,
        [driver_id]
      );

      if (infoRows.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Driver not found" });
      }

      const assignedVehicleId = infoRows[0].vehicle_id;

      // Email uniqueness check if changing email
      if (email) {
        const [dup] = await connection.query(
          `SELECT driver_id FROM driverauth WHERE email = ? AND driver_id <> ?`,
          [email, driver_id]
        );
        if (dup.length > 0) {
          return res
            .status(409)
            .json({ success: false, message: "Email already registered" });
        }
      }

      // Update driverauth dynamically
      const authSets = [];
      const authVals = [];

      if (email !== undefined) {
        authSets.push("email = ?");
        authVals.push(email);
      }

      if (password !== undefined && password !== null && password !== "") {
        const hashed = await bcrypt.hash(password, 10);
        authSets.push("password = ?");
        authVals.push(hashed);
      }

      if (status !== undefined) {
        authSets.push("status = ?");
        authVals.push(status);
      }

      if (authSets.length > 0) {
        await connection.query(
          `UPDATE driverauth SET ${authSets.join(", ")} WHERE driver_id = ?`,
          [...authVals, driver_id]
        );
      }

      // Update driver_info dynamically
      const infoSets = [];
      const infoVals = [];

      if (first_name !== undefined) {
        infoSets.push("first_name = ?");
        infoVals.push(first_name);
      }
      if (middle_name !== undefined) {
        infoSets.push("middle_name = ?");
        infoVals.push(middle_name || null);
      }
      if (last_name !== undefined) {
        infoSets.push("last_name = ?");
        infoVals.push(last_name);
      }
      if (contact_number !== undefined) {
        infoSets.push("contact_number = ?");
        infoVals.push(contact_number);
      }
      if (terminalIdNormalized !== undefined) {
        infoSets.push("terminal_id = ?");
        infoVals.push(terminalIdNormalized);
      }

      if (infoSets.length > 0) {
        await connection.query(
          `UPDATE driver_info SET ${infoSets.join(", ")} WHERE driver_id = ?`,
          [...infoVals, driver_id]
        );
      }

      // Update vehicle dynamically (the one assigned to the driver)
      const vehSets = [];
      const vehVals = [];

      if (plate_number !== undefined) {
        vehSets.push("plate_number = ?");
        vehVals.push(plate_number);
      }
      if (typeIdNormalized !== undefined) {
        vehSets.push("type_id = ?");
        vehVals.push(typeIdNormalized);
      }
      if (terminalIdNormalized !== undefined) {
        vehSets.push("terminal_id = ?");
        vehVals.push(terminalIdNormalized);
      }
      if (vehicle_status !== undefined) {
        vehSets.push("status = ?");
        vehVals.push(vehicle_status);
      }

      if (vehSets.length > 0) {
        await connection.query(
          `UPDATE vehicles SET ${vehSets.join(", ")} WHERE vehicle_id = ?`,
          [...vehVals, assignedVehicleId]
        );
      }

      await connection.commit();

      return res.status(200).json({
        success: true,
        message: "Driver updated successfully",
      });
    } catch (err) {
      await connection.rollback();
      console.error("Update transaction error:", err);
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("UpdateDriverCred error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
};

// Get driver info for driver list
exports.getDriverInfo = async (req, res) => {
  try {
    const driver_info = `
      SELECT
      d.driver_id,
      r.email,
      v.type_id,
      v.type_name,
      d.first_name,
      d.middle_name,
      d.last_name,
      d.contact_number,
      d.terminal_id,
      r.status,
      t.vehicle_id,
      t.plate_number
      FROM  driver_info d
      LEFT JOIN driverauth r ON d.driver_id = r.driver_id
      LEFT JOIN vehicles t ON d.vehicle_id = t.vehicle_id
      LEFT JOIN vehicle_types v ON  t.type_id = v.type_id
      `;

      dbPool.query(driver_info, (err, result) => {
        if (err) {
          console.error('SQL Error:' , err);
          return res.status(500).json({error: err.sqlMessage });
        }
        res.json(result);
      });

  } catch(err) {
    console.log(err)
  }
};

// Admin Insert Fare Prices
exports.InsertFarePrice = async (req, res) => {
        try{
      const {from_terminal_id,
             to_terminal_id,
             kilometer,
             
             bounds_id,
             regular_t,
             discounted_t,
             regular_m,
             discounted_m} = req.body;

         const fromTerminalId = from_terminal_id === "" || from_terminal_id === undefined ? null : from_terminal_id;
      
         const toTerminalId = to_terminal_id === "" || to_terminal_id === undefined ? null : to_terminal_id;

         const boundIdNormalization = bounds_id === "" || bounds_id === undefined ? null : bounds_id;


        if( 
          !kilometer ||
          !regular_t || 
          !discounted_t ||
          !regular_m || 
          !discounted_m ) {

         return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
  
        }     

        if (!fromTerminalId) {
          return res
            .status(400)
            .json({ success: false, message: "Terminal is required" });
        }   

        if (!toTerminalId) {
          return res
            .status(400)
            .json({ success: false, message: "Terminal is required" });
        }

        const connection = await dbPool.promise().getConnection();
        await connection.beginTransaction();
        
        try {

        const [terminalResult] = await connection.query(
          ` INSERT INTO terminal_bounds
           (from_terminal_id, to_terminal_id, kilometer)
           VALUES (?, ?, ?)`,
           [fromTerminalId, toTerminalId, kilometer]
        );

        const terminalBoundId = terminalResult.insertId;

         await connection.query(
        `INSERT INTO fare_prices
         (bounds_id, regular_t, discounted_t, regular_m, discounted_m)
         VALUES (?, ?, ?, ?, ?)`,
        [
          terminalBoundId,
          regular_t,
          discounted_t,
          regular_m,
          discounted_m
        ]
      );

      await connection.commit();

      return res.status(201).json({
        success: true,
        message: "Fare created successfully",
        terminalBoundId
      });
           
        } catch (err) {
      await connection.rollback();
      console.error("Transaction error:", err);
      return res.status(500).json({
        success: false,
        message: "Transaction failed",
      });
    } finally {
      connection.release();
    }

  } catch (err) {
    console.error("InsertFarePrice error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Admin Permanently delete a driver (and their vehicle, if unshared)
exports.DeleteDriverInfo = async (req, res) => {
  try {
    const { driver_id } = req.body;

    if (!driver_id) {
      return res
        .status(400)
        .json({ success: false, message: "driver_id is required" });
    }

    const connection = await db.promise().getConnection();
    await connection.beginTransaction();

    try {
      const [infoRows] = await connection.query(
        `SELECT vehicle_id FROM driver_info WHERE driver_id = ?`,
        [driver_id]
      );

      if (infoRows.length === 0) {
        await connection.rollback();
        connection.release();
        return res.status(404).json({ success: false, message: "Driver not found" });
      }

      const vehicleId = infoRows[0].vehicle_id;

      // Remove driver_info first (references driverauth + vehicles)
      await connection.query(`DELETE FROM driver_info WHERE driver_id = ?`, [driver_id]);
      await connection.query(`DELETE FROM driverauth WHERE driver_id = ?`, [driver_id]);

      // Only delete the vehicle if no other driver is still using it
      if (vehicleId) {
        const [stillUsed] = await connection.query(
          `SELECT driver_id FROM driver_info WHERE vehicle_id = ?`,
          [vehicleId]
        );
        if (stillUsed.length === 0) {
          await connection.query(`DELETE FROM vehicles WHERE vehicle_id = ?`, [vehicleId]);
        }
      }

      await connection.commit();
      return res.status(200).json({ success: true, message: "Driver deleted successfully" });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("DeleteDriverInfo error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
};

//get fare price data
exports.getFarePrices = async (req, res) => {
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

    const [rows] = await dbPool.promise().query(priceInfo);

    res.json(rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch fare prices' });
  }
};

// DISPATCH ZONE BACKEND
exports.getDispatchZoneArea = async (req, res) => {
  try {

    const [rows] = await dbPool.promise().query(`
      SELECT
        dz.zone_id,
        dz.terminal_id,
        t.terminal_name,
        dz.zone_name,
        dz.zone_type,
        ST_AsGeoJSON(dz.boundary) AS boundary,
        dz.is_active,
        dz.created_by,
        dz.created_at,
        dz.updated_at
      FROM dispatch_zones dz
      LEFT JOIN terminal_locations t
        ON dz.terminal_id = t.terminal_id
      WHERE dz.is_active = 1
      ORDER BY dz.zone_id ASC
    `);

    const dispatchZones = rows.map(zone => {

      // ST_AsGeoJSON sometimes comes back already parsed as an object
      // depending on mysql2's type casting — only JSON.parse if it's
      // actually still a string, otherwise use it as-is.
      const geoJson =
        typeof zone.boundary === "string"
          ? JSON.parse(zone.boundary)
          : zone.boundary;

      return {
        zone_id: zone.zone_id,
        terminal_id: zone.terminal_id,
        terminal_name: zone.terminal_name,
        zone_name: zone.zone_name,
        zone_type: zone.zone_type,
        boundary: geoJson,
        is_active: zone.is_active,
        created_by: zone.created_by,
        created_at: zone.created_at,
        updated_at: zone.updated_at
      };

    });

    return res.status(200).json({
      success: true,
      data: dispatchZones
    });

  } catch (err) {

    console.error("getDispatchZoneArea error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch dispatch zones",
      error: err.message
    });

  }
};

// DISPATCH ZONE BACKEND
exports.postDispatchZoneArea = async (req, res) => {
  try {
    const {
      terminal_id,
      zone_name,
      zone_type,
      boundary
    } = req.body;

    // ---------------------------------------------
    // Validation
    // ---------------------------------------------
    if (!terminal_id) {
      return res.status(400).json({
        success: false,
        message: "Terminal is required"
      });
    }

    if (!zone_name || !zone_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Zone name is required"
      });
    }

    if (!zone_type) {
      return res.status(400).json({
        success: false,
        message: "Zone type is required"
      });
    }

    if (!boundary) {
      return res.status(400).json({
        success: false,
        message: "Zone boundary is required"
      });
    }

    // ---------------------------------------------
    // Validate GeoJSON boundary
    // ---------------------------------------------
    let boundaryData;

    try {
      boundaryData =
        typeof boundary === "string"
          ? JSON.parse(boundary)
          : boundary;
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid zone boundary format"
      });
    }

    if (
      boundaryData.type !== "Polygon" ||
      !Array.isArray(boundaryData.coordinates) ||
      boundaryData.coordinates.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Boundary must be a valid GeoJSON Polygon"
      });
    }

    // ---------------------------------------------
    // Get admin who created the zone
    // ---------------------------------------------
    const createdBy = req.session?.adminAuth?.admin_id || null;

    // ---------------------------------------------
    // Insert dispatch zone
    // ---------------------------------------------
    const [result] = await dbPool.promise().query(
      `
        INSERT INTO dispatch_zones
        (
          terminal_id,
          zone_name,
          zone_type,
          boundary,
          is_active,
          created_by,
          created_at,
          updated_at
        )
        VALUES (
          ?,
          ?,
          ?,
          ST_GeomFromGeoJSON(?),
          1,
          ?,
          NOW(),
          NOW()
        )
      `,
      [
        terminal_id,
        zone_name.trim(),
        zone_type,
        JSON.stringify(boundaryData),
        createdBy
      ]
    );

    // ---------------------------------------------
    // Success response
    // ---------------------------------------------
    return res.status(201).json({
      success: true,
      message: "Dispatch zone created successfully",
      zone_id: result.insertId
    });

  } catch (error) {

    console.error(
      "postDispatchZoneArea error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to create dispatch zone",
      error: error.message
    });
  }
};

// DISPATCH ZONE BACKEND — UPDATE BOUNDARY (for reshaped/edited polygons)
exports.putDispatchZoneArea = async (req, res) => {
  try {

    const { zone_id } = req.params;
    const { boundary } = req.body;

    // ---------------------------------------------
    // Validation
    // ---------------------------------------------
    if (!zone_id) {
      return res.status(400).json({
        success: false,
        message: "Zone ID is required"
      });
    }

    if (!boundary) {
      return res.status(400).json({
        success: false,
        message: "Zone boundary is required"
      });
    }

    // ---------------------------------------------
    // Validate GeoJSON boundary
    // ---------------------------------------------
    let boundaryData;

    try {
      boundaryData =
        typeof boundary === "string"
          ? JSON.parse(boundary)
          : boundary;
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid zone boundary format"
      });
    }

    if (
      boundaryData.type !== "Polygon" ||
      !Array.isArray(boundaryData.coordinates) ||
      boundaryData.coordinates.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Boundary must be a valid GeoJSON Polygon"
      });
    }

    // ---------------------------------------------
    // Update dispatch zone boundary
    // ---------------------------------------------
    const [result] = await dbPool.promise().query(
      `
        UPDATE dispatch_zones
        SET
          boundary = ST_GeomFromGeoJSON(?),
          updated_at = NOW()
        WHERE zone_id = ?
      `,
      [
        JSON.stringify(boundaryData),
        zone_id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Dispatch zone not found"
      });
    }

    // ---------------------------------------------
    // Success response
    // ---------------------------------------------
    return res.status(200).json({
      success: true,
      message: "Dispatch zone boundary updated successfully"
    });

  } catch (error) {

    console.error(
      "putDispatchZoneArea error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update dispatch zone",
      error: error.message
    });

  }
};