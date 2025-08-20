// routes/auth.routes.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config();

const pool = require('../db'); // ✅ use the shared pool that loads Aiven CA

const router = express.Router();

/* ──────────────────────────────
   Email (Gmail App Password)
──────────────────────────────── */
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

/* ──────────────────────────────
   Helpers
──────────────────────────────── */
const VALID_ROLES = ['student', 'researcher', 'gardener', 'educator', 'hobbyist', 'other'];

function bad(res, message, code = 400) {
  return res.status(code).json({ success: false, message });
}

/* ──────────────────────────────
   Signup
──────────────────────────────── */
router.post('/signup', async (req, res) => {
  try {
    const { fullName, email, role, password } = req.body || {};

    if (!fullName || !email || !role || !password) {
      return bad(res, 'All fields are required');
    }
    if (!VALID_ROLES.includes(role)) {
      return bad(res, 'Invalid role');
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) {
      return bad(res, 'Email already exists');
    }

    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (fullName, email, role, password) VALUES (?, ?, ?, ?)',
      [fullName, email, role, hashed]
    );

    return res.status(201).json({ success: true, message: 'User registered successfully' });
  } catch (err) {
    console.error('Signup error:', err);
    return bad(res, 'Server error', 500);
  }
});

/* ──────────────────────────────
   Login
──────────────────────────────── */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return bad(res, 'Email and password are required');
    }

    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows?.[0];
    if (!user) return bad(res, 'Invalid email or password');

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return bad(res, 'Invalid email or password');

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES || '7d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Login error:', err);
    return bad(res, 'Server error', 500);
  }
});

/* ──────────────────────────────
   Forgot Password → Send OTP
──────────────────────────────── */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return bad(res, 'Email is required');

    const [rows] = await pool.query('SELECT id, fullName FROM users WHERE email = ?', [email]);
    const user = rows?.[0];
    if (!user) return bad(res, 'Email not found');

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    await pool.query('UPDATE users SET otp = ?, otpExpires = ? WHERE id = ?', [otp, otpExpires, user.id]);

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Virtual Herbal Garden - Password Reset OTP',
      text: `Hi ${user.fullName || ''},\n\nYour OTP is: ${otp}\nIt is valid for 10 minutes.\n\nIf you didn’t request this, you can ignore this email.`,
    });

    return res.status(200).json({ success: true, message: 'OTP sent to your email' });
  } catch (err) {
    console.error('Forgot password error:', err);
    return bad(res, 'Server error', 500);
  }
});

/* ──────────────────────────────
   Verify OTP
──────────────────────────────── */
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    if (!email || !otp) return bad(res, 'Email and OTP are required');

    const [rows] = await pool.query('SELECT otp, otpExpires FROM users WHERE email = ?', [email]);
    const user = rows?.[0];
    if (!user) return bad(res, 'Invalid or expired OTP');

    const expired = user.otpExpires ? new Date(user.otpExpires).getTime() < Date.now() : true;
    if (user.otp !== otp || expired) {
      return bad(res, 'Invalid or expired OTP');
    }

    return res.status(200).json({ success: true, message: 'OTP verified successfully' });
  } catch (err) {
    console.error('OTP verification error:', err);
    return bad(res, 'Server error', 500);
  }
});

/* ──────────────────────────────
   Reset Password
──────────────────────────────── */
router.post('/reset-password', async (req, res) => {
  try {
    const { email, newPassword, confirmNewPassword } = req.body || {};
    if (!email || !newPassword || !confirmNewPassword) {
      return bad(res, 'All fields are required');
    }
    if (newPassword !== confirmNewPassword) {
      return bad(res, 'Passwords do not match');
    }

    const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    const user = rows?.[0];
    if (!user) return bad(res, 'User not found');

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password = ?, otp = NULL, otpExpires = NULL WHERE id = ?',
      [hashed, user.id]
    );

    return res.status(200).json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    return bad(res, 'Server error', 500);
  }
});

module.exports = router;
