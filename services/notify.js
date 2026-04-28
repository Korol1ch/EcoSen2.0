const { pool } = require('../db');
const nodemailer = require('nodemailer');
const https = require('https');
const http = require('http');

// ── Mailer ────────────────────────────────────────────────────────────────────
let transporter = null;
function getMailer() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
  }
  return transporter;
}

// ── Telegram webhook ─────────────────────────────────────────────────────────
// Your Telegram bot should expose a webhook at TELEGRAM_BOT_WEBHOOK_URL
// that accepts: POST { telegram_id, type, title, body }
async function sendTelegramWebhook(telegramId, payload) {
  const webhookUrl = process.env.TELEGRAM_BOT_WEBHOOK_URL;
  if (!webhookUrl || !telegramId) return;

  const data = JSON.stringify({ telegram_id: telegramId, ...payload });
  const url = new URL(webhookUrl);
  const lib = url.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      resolve(res.statusCode);
    });
    req.on('error', (e) => {
      console.warn('[notify] Telegram webhook error:', e.message);
      resolve(null);
    });
    req.write(data);
    req.end();
  });
}

// ── Main notify function ──────────────────────────────────────────────────────
// type: 'points' | 'achievement' | 'promo' | 'system'
async function notify(userId, { type, title, body, sendEmail = false, emailSubject }) {
  try {
    // 1. Save to DB (in-app notification)
    await pool.query(
      'INSERT INTO notifications (user_id, type, title, body) VALUES ($1,$2,$3,$4)',
      [userId, type, title, body || null]
    );

    // 2. Get user details for external channels
    const userRes = await pool.query(
      'SELECT email, telegram_id FROM users WHERE id = $1',
      [userId]
    );
    if (!userRes.rows.length) return;
    const { email, telegram_id } = userRes.rows[0];

    // 3. Telegram bot webhook
    if (telegram_id) {
      await sendTelegramWebhook(telegram_id, { type, title, body });
    }

    // 4. Email (opt-in per call)
    if (sendEmail && email) {
      try {
        await getMailer().sendMail({
          from: `"EcoSen 🌿" <${process.env.EMAIL_USER}>`,
          to: email,
          subject: emailSubject || title,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:auto">
              <h2 style="color:#22c55e">${title}</h2>
              <p style="color:#374151">${body || ''}</p>
              <hr style="border-color:#e5e7eb"/>
              <small style="color:#9ca3af">EcoSen — платформа для переработки отходов</small>
            </div>
          `,
        });
      } catch (e) {
        console.warn('[notify] email error:', e.message);
      }
    }
  } catch (err) {
    console.error('[notify] error:', err.message);
  }
}

// Bulk notify (e.g. promos to all users)
async function notifyAll({ type, title, body }) {
  try {
    const users = await pool.query('SELECT id FROM users WHERE is_verified = TRUE');
    for (const u of users.rows) {
      await notify(u.id, { type, title, body });
    }
  } catch (err) {
    console.error('[notifyAll] error:', err.message);
  }
}

module.exports = { notify, notifyAll };
