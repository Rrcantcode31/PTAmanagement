const mysql = require('mysql2'); // plain mysql2, NOT mysql2/promise
const dotenv = require("dotenv");
dotenv.config();

const dbPool = mysql.createPool({
    host: process.env.DATABASE_NAME,
    port: Number(process.env.DATABASE_PORT),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASS,
    database: process.env.DATABASE,
    waitForConnections: true,
    connectionLimit: 10,


    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,

    // ---- Idle protection ----
    // Kill idle connections before MySQL/Railway does it for us.
    // 60 seconds is safe for any server whose wait_timeout is >= 60s.
    idleTimeout: 60000,
    maxIdle: 10,

    // ---- Socket keepalive ----
    // Sends TCP keepalive packets so intermediary proxies don't drop
    // the connection during quiet periods.
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,   // 10s before first keepalive probe

    // ---- Timeouts ----
    connectTimeout: 20000,          // 20s to establish a connection

    // ---- Charset / parsing ----
    charset: 'utf8mb4_unicode_ci',
    decimalNumbers: true,           // DECIMAL columns come back as JS numbers
    });

module.exports = dbPool;