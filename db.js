// db.js
const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

// Build SSL config only if explicitly enabled
let ssl;
if (String(process.env.MYSQL_SSL).toLowerCase() === 'true') {
  const caPath = process.env.MYSQL_CA || 'ca.pem';
  ssl = { ca: fs.readFileSync(caPath, 'utf8') };
}

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,

  // Connection behavior
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,

  // Data handling
  // Return DATETIME/TIMESTAMP as strings to avoid timezone surprises
  dateStrings: true,
  // Never enable multiple statements unless you absolutely need it
  multipleStatements: false,

  // Only set ssl if provided
  ...(ssl ? { ssl } : {})
});

// Optional: quick startup ping & helpful console log
(async () => {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log(
      `[DB] Connected to MySQL ${process.env.MYSQL_HOST}:${process.env.MYSQL_PORT} / ${process.env.MYSQL_DATABASE} (SSL=${!!ssl})`
    );
  } catch (err) {
    console.error('[DB] MySQL connection failed:', err.message);
  }
})();

module.exports = pool;
