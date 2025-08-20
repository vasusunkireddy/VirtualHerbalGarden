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
  if (process.env.MYSQL_SSL_CA_B64) {
    const ca = Buffer.from(process.env.MYSQL_SSL_CA_B64, "base64").toString("utf8");
    ssl = { ca, rejectUnauthorized: true, minVersion: "TLSv1.2" };
  } else if (process.env.MYSQL_SSL_CA) {
    const caPath = path.isAbsolute(process.env.MYSQL_SSL_CA)
      ? process.env.MYSQL_SSL_CA
      : path.join(__dirname, process.env.MYSQL_SSL_CA);
    const ca = fs.readFileSync(caPath, "utf8");
    ssl = { ca, rejectUnauthorized: true, minVersion: "TLSv1.2" };
  } else {
    console.warn("[DB] SSL requested but no CA provided");
    ssl = { rejectUnauthorized: true, minVersion: "TLSv1.2" }; // will likely fail; better to provide CA
  }
}

const pool = mysql.createPool({
  host: must("MYSQL_HOST"),
  port: Number(must("MYSQL_PORT")),
  user: must("MYSQL_USER"),
  password: must("MYSQL_PASSWORD"),
  database: must("MYSQL_DATABASE"),
  ssl,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// quick probe
(async () => {
  try {
    const c = await pool.getConnection();
    await c.query("SELECT 1");
    c.release();
    console.log("[DB] ✅ MySQL connected");
  } catch (e) {
    console.error("[DB] ❌ MySQL connection failed:", e.message);
  }
})();

module.exports = pool;
