require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const https = require('https');
const { initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL 
    ? process.env.FRONTEND_URL.split(',') 
    : ['https://korol1ch.github.io'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiter: max 100 requests per 15 min per IP
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' }
}));

// ─── ROUTES ──────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/stations', require('./routes/stations'));

// Health check (also used for keep-alive)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'EcoSen API' });
});

app.get('/', (req, res) => {
  res.json({
    name: 'EcoSen API',
    version: '1.0.0',
    docs: 'https://github.com/your-repo/ecosen',
    endpoints: [
      'POST /api/auth/send-code  — шаг 1: отправить код на email',
      'POST /api/auth/verify-code — шаг 2: подтвердить код и создать аккаунт',
      'POST /api/auth/resend-code — повторная отправка кода',
      'POST /api/auth/login',
      'GET  /api/auth/me',
      'GET  /api/user/me',
      'GET  /api/user/history',
      'GET  /api/user/leaderboard',
      'POST /api/user/scan',
      'GET  /api/stations',
    ]
  });
});

// Serve frontend (index.html)
const path = require('path');
app.use(express.static(__dirname));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── KEEP-ALIVE for Render free tier ─────────────────────────────────────────
// Render free instances sleep after 15 min of inactivity.
// This pings the server every 14 minutes to keep it awake.
function keepAlive() {
  const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  const target = url.startsWith('https') ? https : require('http');
  try {
    target.get(`${url}/health`, (res) => {
      console.log(`[keep-alive] ping → ${res.statusCode} at ${new Date().toLocaleTimeString()}`);
    }).on('error', (e) => {
      console.warn('[keep-alive] error:', e.message);
    });
  } catch (e) {
    console.warn('[keep-alive] failed:', e.message);
  }
}

// Ping every 14 minutes (Render sleeps after 15 min)
cron.schedule('*/14 * * * *', keepAlive);

// Clean up expired verification codes every 30 minutes
const { cleanupExpiredCodes } = require('./routes/auth');
cron.schedule('*/30 * * * *', cleanupExpiredCodes);

// ─── START ────────────────────────────────────────────────────────────────────
async function start() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`\n🌿 EcoSen API running on port ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   Env: ${process.env.NODE_ENV || 'development'}\n`);
  });
}

start();
