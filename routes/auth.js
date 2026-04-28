const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { generateCode, sendVerificationEmail } = require('../services/email');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'ecosen_secret_key_2024';

// ─── STEP 1: Send verification code ──────────────────────────────────────────
router.post('/send-code', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Имя, email и пароль обязательны' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Пароль минимум 6 символов' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'Неверный формат email' });

    const normalEmail = email.toLowerCase().trim();

    const existing = await pool.query('SELECT id, is_verified FROM users WHERE email = $1', [normalEmail]);
    if (existing.rows.length > 0 && existing.rows[0].is_verified)
      return res.status(409).json({ error: 'Этот email уже зарегистрирован' });

    // Rate limit: max 3 requests per email per hour
    const recentCodes = await pool.query(
      "SELECT COUNT(*) FROM email_verifications WHERE email = $1 AND created_at > NOW() - INTERVAL '1 hour'",
      [normalEmail]
    );
    if (parseInt(recentCodes.rows[0].count) >= 3)
      return res.status(429).json({ error: 'Слишком много попыток. Подождите 1 час' });

    await pool.query('DELETE FROM email_verifications WHERE email = $1', [normalEmail]);

    const pass_hash = await bcrypt.hash(password, 10);
    const code = generateCode();
    const expires_at = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      'INSERT INTO email_verifications (email, name, pass_hash, code, expires_at) VALUES ($1,$2,$3,$4,$5)',
      [normalEmail, name.trim(), pass_hash, code, expires_at]
    );

    try {
      await sendVerificationEmail(normalEmail, name.trim(), code);
    } catch (emailErr) {
      console.error('Email send error:', emailErr.message);
      await pool.query('DELETE FROM email_verifications WHERE email = $1', [normalEmail]);
      return res.status(500).json({ error: 'Не удалось отправить письмо. Проверьте email.' });
    }

    res.json({ success: true, message: `Код отправлен на ${normalEmail}`, expires_in: 900 });
  } catch (err) {
    console.error('send-code error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ─── STEP 2: Verify code → create user ───────────────────────────────────────
router.post('/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email и код обязательны' });

    const normalEmail = email.toLowerCase().trim();
    const result = await pool.query(
      'SELECT * FROM email_verifications WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
      [normalEmail]
    );

    if (result.rows.length === 0)
      return res.status(400).json({ error: 'Код не найден. Запросите новый' });

    const pending = result.rows[0];

    if (new Date() > new Date(pending.expires_at)) {
      await pool.query('DELETE FROM email_verifications WHERE email = $1', [normalEmail]);
      return res.status(400).json({ error: 'Код истёк. Запросите новый' });
    }

    if (pending.attempts >= 5) {
      await pool.query('DELETE FROM email_verifications WHERE email = $1', [normalEmail]);
      return res.status(400).json({ error: 'Слишком много неверных попыток. Начните заново' });
    }

    if (pending.code !== String(code).trim()) {
      await pool.query('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = $1', [pending.id]);
      const left = 4 - pending.attempts;
      return res.status(400).json({ error: `Неверный код. Осталось попыток: ${left}` });
    }

    // ✅ Correct code — create user
    const alreadyExists = await pool.query('SELECT id FROM users WHERE email = $1', [normalEmail]);
    if (alreadyExists.rows.length > 0) {
      await pool.query('DELETE FROM email_verifications WHERE email = $1', [normalEmail]);
      return res.status(409).json({ error: 'Этот email уже зарегистрирован' });
    }

    const userResult = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_verified)
       VALUES ($1,$2,$3,TRUE)
       RETURNING id, name, email, points, scans, trust_score, is_verified, created_at`,
      [pending.name, normalEmail, pending.pass_hash]
    );

    await pool.query('DELETE FROM email_verifications WHERE email = $1', [normalEmail]);

    const user = userResult.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ user, token });

  } catch (err) {
    console.error('verify-code error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ─── RESEND CODE ──────────────────────────────────────────────────────────────
router.post('/resend-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email обязателен' });
    const normalEmail = email.toLowerCase().trim();

    const pending = await pool.query(
      'SELECT * FROM email_verifications WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
      [normalEmail]
    );
    if (pending.rows.length === 0)
      return res.status(400).json({ error: 'Сначала начните регистрацию заново' });

    const secondsSinceLast = (Date.now() - new Date(pending.rows[0].created_at)) / 1000;
    if (secondsSinceLast < 60) {
      const wait = Math.ceil(60 - secondsSinceLast);
      return res.status(429).json({ error: `Подождите ${wait} сек перед повторной отправкой` });
    }

    const { name, pass_hash } = pending.rows[0];
    await pool.query('DELETE FROM email_verifications WHERE email = $1', [normalEmail]);
    const code = generateCode();
    const expires_at = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      'INSERT INTO email_verifications (email, name, pass_hash, code, expires_at) VALUES ($1,$2,$3,$4,$5)',
      [normalEmail, name, pass_hash, code, expires_at]
    );
    await sendVerificationEmail(normalEmail, name, code);

    res.json({ success: true, message: `Новый код отправлен на ${normalEmail}` });
  } catch (err) {
    console.error('resend error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' });

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (result.rows.length === 0)
      return res.status(401).json({ error: 'Неверный email или пароль' });

    const user = result.rows[0];
    if (!user.is_verified)
      return res.status(403).json({ error: 'Email не подтверждён. Завершите регистрацию', needsVerification: true });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Неверный email или пароль' });

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, token });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ─── GET ME ───────────────────────────────────────────────────────────────────
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, telegram_id, points, scans, trust_score, is_verified, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Cleanup expired codes (called from server.js cron)
async function cleanupExpiredCodes() {
  try {
    const r = await pool.query('DELETE FROM email_verifications WHERE expires_at < NOW()');
    if (r.rowCount > 0) console.log(`[cleanup] Удалено ${r.rowCount} истёкших кодов`);
  } catch (err) {
    console.warn('[cleanup] Ошибка:', err.message);
  }
}

module.exports = router;
module.exports.cleanupExpiredCodes = cleanupExpiredCodes;
