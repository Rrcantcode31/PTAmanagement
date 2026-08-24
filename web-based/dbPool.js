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
    connectionLimit: 10
});

module.exports = dbPool;