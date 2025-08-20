// server.js
require("dotenv").config();

const express = require("express");
const fs = require("fs");
const https = require("https");
const http = require("http");
const path = require("path");
const cors = require("cors");

const pool = require('./db');
const authRoutes = require("./routes/auth.routes");

const app = express();

/* ── Middleware ── */
app.use(express.json());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  })
);

/* ── Static ── */
const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));
app.get("/", (_req, res) => res.sendFile(path.join(publicPath, "index.html")));

/* ── DB bootstrap ── */
async function initializeDatabase() {
  const sql = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      fullName VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      role ENUM('student','researcher','gardener','educator','hobbyist','other') NOT NULL,
      password VARCHAR(255) NOT NULL,
      otp VARCHAR(6),
      otpExpires DATETIME,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;
  const conn = await pool.getConnection();
  try {
    await conn.query(sql);
    console.log("✅ Database initialized");
  } finally {
    conn.release();
  }
}

/* ── Routes ── */
app.use("/api/auth", authRoutes);
app.get("/health", (_req, res) => res.json({ ok: true }));

/* ── Server ── */
const PORT = Number(process.env.PORT) || 3000;

async function start() {
  try {
    await initializeDatabase();
  } catch (err) {
    console.error("❌ Database initialization error:", err);
    // Don’t start the server if DB failed — uncomment if you prefer hard fail:
    // process.exit(1);
  }

  const keyPath = path.join(__dirname, "certs", "key.pem");
  const certPath = path.join(__dirname, "certs", "cert.pem");
  const useHttps = fs.existsSync(keyPath) && fs.existsSync(certPath);

  if (useHttps) {
    try {
      const credentials = {
        key: fs.readFileSync(keyPath, "utf8"),
        cert: fs.readFileSync(certPath, "utf8"),
      };
      https.createServer(credentials, app).listen(PORT, () => {
        console.log(`🔐 HTTPS server running at https://localhost:${PORT}`);
      });
      return;
    } catch (e) {
      console.warn("⚠️ Failed to load HTTPS certs, falling back to HTTP:", e.message);
    }
  } else {
    console.warn("⚠️ No SSL certs found in ./certs — starting HTTP server.");
  }

  http.createServer(app).listen(PORT, () => {
    console.log(`🔓 HTTP server running at http://localhost:${PORT}`);
  });
}

start();
