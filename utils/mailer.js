// utils/mailer.js
require('dotenv').config();
const nodemailer = require('nodemailer');

/**
 * Sends an OTP email to the given address
 * @param {string} to - Recipient's email
 * @param {string} otp - The OTP code
 */
async function sendOtpEmail(to, otp) {
  const subject = 'Your Virtual Herbal Garden Admin OTP';
  const text = `Your OTP is ${otp}. It expires in 10 minutes.`;

  const html = `
    <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 30px;">
      <div style="max-width: 600px; margin: auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
        
        <!-- Header with Logo -->
        <div style="background-color: #4CAF50; padding: 20px; text-align: center;">
          <img src="https://i.postimg.cc/pXmq7b3r/download-3.jpg" alt="Virtual Herbal Garden" style="max-width: 80px; border-radius: 50%; background: white; padding: 5px;" />
          <h1 style="color: white; margin: 10px 0 0 0; font-size: 22px;">Virtual Herbal Garden</h1>
        </div>

        <!-- Body Content -->
        <div style="padding: 20px;">
          <h2 style="color: #4CAF50; text-align: center;">OTP Verification</h2>
          <p style="font-size: 16px; color: #333; text-align: center;">
            Use the following One-Time Password to complete your admin signup:
          </p>

          <div style="font-size: 28px; font-weight: bold; letter-spacing: 4px; margin: 20px auto; padding: 10px 20px; background: #e8f5e9; color: #2e7d32; border-radius: 5px; text-align: center; width: fit-content;">
            ${otp}
          </div>

          <p style="text-align: center; font-size: 14px; color: #666;">
            This code will expire in <strong>10 minutes</strong>.
          </p>
          <p style="text-align: center; font-size: 14px; color: #999;">
            If you did not request this, please ignore this email.
          </p>
        </div>

        <!-- Footer -->
        <div style="background-color: #f1f1f1; padding: 15px; text-align: center; font-size: 12px; color: #777;">
          &copy; ${new Date().getFullYear()} Virtual Herbal Garden. All rights reserved.
        </div>
      </div>
    </div>
  `;

  try {
    // Create a transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail', // or "smtp.yourmailserver.com"
      auth: {
        user: process.env.EMAIL_USER, // your email address
        pass: process.env.EMAIL_PASS, // your email password or app password
      },
    });

    // Send the mail
    const info = await transporter.sendMail({
      from: `"Virtual Herbal Garden" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });

    console.log(`[MAILER] OTP sent to ${to} | Message ID: ${info.messageId}`);
  } catch (error) {
    console.error('[MAILER] Error sending OTP email:', error);
    throw new Error('Failed to send OTP email');
  }
}

module.exports = { sendOtpEmail };
