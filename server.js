// server.js
require("dotenv").config();

const express = require("express");
const fs = require("fs");
const https = require("https");
const http = require("http");
const path = require("path");
const cors = require("cors");

const pool = require("./db");
const authRoutes = require("./routes/auth.routes");

const app = express();

/* ── Middleware ── */
app.use(express.json());

// Always allow your Render URL + localhost for dev
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://virtualherbalgarden-mr5z.onrender.com",
    ],
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
const HOST = "0.0.0.0";

async function start() {
  try {
    await initializeDatabase();
  } catch (err) {
    console.error("❌ Database initialization error:", err);
  }

  const keyPath = path.join(__dirname, "certs", "key.pem");
  const certPath = path.join(__dirname, "certs", "cert.pem");
  const hasLocalHttps = fs.existsSync(keyPath) && fs.existsSync(certPath);

  if (hasLocalHttps) {
    try {
      const credentials = {
        key: fs.readFileSync(keyPath, "utf8"),
        cert: fs.readFileSync(certPath, "utf8"),
      };
      https.createServer(credentials, app).listen(PORT, HOST, () => {
        console.log(`🔐 HTTPS server running at https://localhost:${PORT}`);
      });
      return;
    } catch (e) {
      console.warn("⚠️ Failed to load HTTPS certs, falling back to HTTP:", e.message);
    }
  } else {
    console.warn("ℹ️ No local HTTPS certs found — starting HTTP server (expected on Render).");
  }

  http.createServer(app).listen(PORT, HOST, () => {
    console.log(`🔓 HTTP server running at http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  });
}

start();
