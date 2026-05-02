require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const https = require('https');
const { initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(o => o.trim())
  : ['https://korol1ch.github.io'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*'))
      return callback(null, true);
    callback(new Error('CORS: origin not allowed'));
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Required for Render (and other reverse proxies) — fixes express-rate-limit ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
app.set('trust proxy', 1);

// Rate limiter
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' },
}));

// ─── ROUTES ──────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/user',          require('./routes/user'));
app.use('/api/stations',      require('./routes/stations'));
app.use('/api/operators',     require('./routes/operators'));
app.use('/api/ai',            require('./routes/ai'));
app.use('/api/achievements',  require('./routes/achievements'));
app.use('/api/notifications', require('./routes/notifications'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'EcoSen API v2' });
});

app.get('/', (req, res) => {
  res.json({
    name: 'EcoSen API',
    version: '2.0.0',
    endpoints: {
      auth: [
        'POST /api/auth/send-code',
        'POST /api/auth/verify-code',
        'POST /api/auth/resend-code',
        'POST /api/auth/login',
        'GET  /api/auth/me',
      ],
      user: [
        'GET  /api/user/me',
        'GET  /api/user/history',
        'GET  /api/user/leaderboard',
        'POST /api/user/scan',
        'PATCH /api/user/profile',
      ],
      operators: [
        'POST /api/operators/login',
        'POST /api/operators/drop          ← фиксация веса на станции',
        'GET  /api/operators/station/transactions',
        'GET  /api/operators/station/report',
        'POST /api/operators/create        ← admin only',
        'GET  /api/operators/anomalies     ← admin only',
        'PATCH /api/operators/anomalies/:id/resolve',
      ],
      ai: [
        'GET  /api/ai/advice/:material     ← советы по типу мусора',
        'POST /api/ai/advice               ← с весом + станцией → preview баллов',
        'GET  /api/ai/materials            ← список всех материалов',
        'POST /api/ai/chat                 ← чат с EcoBot (Gemini AI)',
        'POST /api/ai/analyze              ← анализ мусора по описанию (Gemini AI)',
      ],
      achievements: [
        'GET  /api/achievements            ← все + статус для пользователя',
        'GET  /api/achievements/my         ← только заработанные',
        'GET  /api/achievements/co2        ← CO₂ профиль',
      ],
      notifications: [
        'GET  /api/notifications',
        'GET  /api/notifications/unread-count',
        'PATCH /api/notifications/read-all',
        'PATCH /api/notifications/:id/read',
        'POST /api/notifications/send      ← admin only',
      ],
      stations: [
        'GET  /api/stations',
      ],
    },
  });
});

// Serve frontend (index.html)
const path = require('path');
app.use(express.static(__dirname));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── KEEP-ALIVE (Render free tier) ───────────────────────────────────────────
function keepAlive() {
  const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  const target = url.startsWith('https') ? https : require('http');
  try {
    target.get(`${url}/health`, (res) => {
      console.log(`[keep-alive] ${res.statusCode} at ${new Date().toLocaleTimeString()}`);
    }).on('error', (e) => console.warn('[keep-alive] error:', e.message));
  } catch (e) {
    console.warn('[keep-alive] failed:', e.message);
  }
}
cron.schedule('*/14 * * * *', keepAlive);

// Cleanup expired codes every 30 min
const { cleanupExpiredCodes } = require('./routes/auth');
cron.schedule('*/30 * * * *', cleanupExpiredCodes);

// ─── START ────────────────────────────────────────────────────────────────────
async function start() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`\n🌿 EcoSen API v2 running on port ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   Env: ${process.env.NODE_ENV || 'development'}\n`);
  });
}

start();
