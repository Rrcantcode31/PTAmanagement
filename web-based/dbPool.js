const mysql = require('mysql2'); // plain mysql2, NOT mysql2/promise
const dotenv = require("dotenv");
dotenv.config();

const dbPool = mysql.createPool({
    host: process.env.MYSQLHOST,
    port: Number(process.env.MYSQLPORT),
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    waitForConnections: true,
    connectionLimit: 10
});

module.exports = dbPool;