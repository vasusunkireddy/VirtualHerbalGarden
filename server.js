// server.js
require('dotenv').config();

const express = require('express');
const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');
const cors = require('cors');

const pool = require('./db'); // ✅ shared MySQL pool
const authRoutes = require('./routes/auth.routes'); // ✅ routes file

const app = express();

/* ──────────────────────────────
   Middleware
──────────────────────────────── */
app.use(express.json());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  })
);

/* ──────────────────────────────
   Serve Static Files
──────────────────────────────── */
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// When visiting `/`, send back index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

/* ──────────────────────────────
   DB bootstrap
──────────────────────────────── */
async function initializeDatabase() {
  const sql = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      fullName VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      role ENUM('student', 'researcher', 'gardener', 'educator', 'hobbyist', 'other') NOT NULL,
      password VARCHAR(255) NOT NULL,
      otp VARCHAR(6),
      otpExpires DATETIME,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  try {
    const conn = await pool.getConnection();
    await conn.query(sql);
    conn.release();
    console.log('✅ Database initialized');
  } catch (err) {
    console.error('❌ Database initialization error:', err);
  }
}

/* ──────────────────────────────
   API Routes
──────────────────────────────── */
app.use('/api/auth', authRoutes);
app.get('/health', (_req, res) => res.json({ ok: true }));

/* ──────────────────────────────
   Server (HTTPS if certs exist, else HTTP)
──────────────────────────────── */
const PORT = Number(process.env.PORT) || 3000;

async function start() {
  await initializeDatabase();

  const keyPath = path.join(__dirname, 'certs', 'key.pem');
  const certPath = path.join(__dirname, 'certs', 'cert.pem');

  let server;
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    try {
      const credentials = {
        key: fs.readFileSync(keyPath, 'utf8'),
        cert: fs.readFileSync(certPath, 'utf8'),
      };
      server = https.createServer(credentials, app);
      server.listen(PORT, () =>
        console.log(`🔐 HTTPS server running at https://localhost:${PORT}`)
      );
      return;
    } catch (e) {
      console.warn('⚠️ Failed to load HTTPS certs, falling back to HTTP:', e.message);
    }
  } else {
    console.warn('⚠️ No SSL certs found in ./certs — starting HTTP server.');
  }

  // HTTP fallback
  server = http.createServer(app);
  server.listen(PORT, () =>
    console.log(`🔓 HTTP server running at http://localhost:${PORT}`)
  );
}

start();
