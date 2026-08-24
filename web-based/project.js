const express = require("express");
const app = express();
const mysql = require('mysql2/promise');
const path = require("path");
const dotenv = require("dotenv");
const cookieParser = require('cookie-parser');
const hbs = require('hbs');
const session = require('express-session');
const cors = require('cors');

dotenv.config({path: './.env' });

const routeAuth = require('./routes/auth');
const pagesAuth = require('./routes/pages');

hbs.registerHelper('eq', (a, b) => a === b);

const publicDirectory = path.join(__dirname, './public');
app.use(express.static(publicDirectory));


const dbPool = mysql.createPool({
    host: process.env.MYSQLHOST,
    port: Number(process.env.MYSQLPORT),
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    waitForConnections: true,
    connectionLimit: 10
});

dbPool.getConnection()
    .then(connection => {
        connection.release();
        console.log("✅ Database connected successfully!");
    })
    .catch(err => {
        console.error("❌ Database Connection failed:", err);
        console.error("Error code:", err.code);
        console.error("Error errno:", err.errno);
        console.error("Full error stringified:", JSON.stringify(err, null, 2));
    });

module.exports = dbPool;


app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());

app.use(session({
    secret: 'mysecretkey',
    resave: false,
    saveUninitialized: false
}));

app.use((req, res, next) => {
    res.locals.admin = req.session.admin || null;
    next();
});

hbs.registerHelper('ifEquals', (a, b, options) => {
    return a == b ? options.fn(this) : options.inverse(this);
});

app.set('view engine', 'hbs');

app.use('/', pagesAuth);
app.use('/', routeAuth);

const PORT = process.env.PORT || 4560;

function PortListener() {
    console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
}

app.listen(PORT, '0.0.0.0', PortListener);