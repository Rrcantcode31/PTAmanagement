const mysql = require('mysql2');
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
    queueLimit: 0,

    idleTimeout: 60000,
    maxIdle: 10,


    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,  

    connectTimeout: 20000,  

    charset: 'utf8mb4_unicode_ci',
    decimalNumbers: true,        
});

module.exports = dbPool;