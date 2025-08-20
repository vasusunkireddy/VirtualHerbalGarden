// db.js
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

function must(k) {
  const v = process.env[k];
  if (!v) throw new Error(`[env] Missing ${k}`);
  return v.trim();
}

const useSSL = (process.env.MYSQL_SSL || "").toLowerCase() === "true";
let ssl;
if (useSSL) {
  const caPath = must("MYSQL_SSL_CA");           // e.g. certs/ca.pem
  const absCa = path.isAbsolute(caPath) ? caPath : path.join(__dirname, caPath);
  ssl = {
    ca: fs.readFileSync(absCa, "utf8"),
    rejectUnauthorized: true,
    minVersion: "TLSv1.2",
  };
}

const pool = mysql.createPool({
  host: must("MYSQL_HOST"),
  port: Number(must("MYSQL_PORT")),
  user: must("MYSQL_USER"),
  password: must("MYSQL_PASSWORD"),
  database: must("MYSQL_DATABASE"),
  ssl, // Aiven requires SSL
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// quick probe so boot logs are clear
(async () => {
  try {
    const conn = await pool.getConnection();
    await conn.query("SELECT 1");
    conn.release();
    console.log("[DB] ✅ MySQL connected");
  } catch (err) {
    console.error("[DB] ❌ MySQL connection failed:", err.message);
  }
})();

module.exports = pool;
