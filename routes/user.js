const express = require('express');
const { pool } = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// All routes require auth
router.use(authMiddleware);

// GET /api/user/me — full profile
router.get('/me', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, telegram_id, points, scans, trust_score, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/user/history — last 50 transactions
router.get('/history', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.id, t.material, t.weight_kg, t.points, t.icon, t.source, t.created_at,
              s.name AS station_name
       FROM transactions t
       LEFT JOIN stations s ON t.station_id = s.id
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/user/leaderboard — top 10 + current user rank
router.get('/leaderboard', async (req, res) => {
  try {
    const top = await pool.query(
      `SELECT id, name, points, scans,
              RANK() OVER (ORDER BY points DESC) AS rank
       FROM users ORDER BY points DESC LIMIT 10`
    );
    const myRank = await pool.query(
      `SELECT rank FROM (
         SELECT id, RANK() OVER (ORDER BY points DESC) AS rank FROM users
       ) ranked WHERE id = $1`,
      [req.user.id]
    );
    res.json({
      leaderboard: top.rows,
      my_rank: myRank.rows[0]?.rank || null
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/user/scan — record AI scan result and award points
router.post('/scan', async (req, res) => {
  try {
    const { material, points, icon, confidence, source = 'ai_scan' } = req.body;

    if (!material || !points) {
      return res.status(400).json({ error: 'material and points required' });
    }

    // ── Anti-fraud: daily limit check ──────────────────────────────────────
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dailyCheck = await pool.query(
      `SELECT COALESCE(SUM(points), 0) AS daily_pts,
              COUNT(*) AS daily_scans
       FROM transactions
       WHERE user_id = $1 AND created_at >= $2`,
      [req.user.id, today]
    );
    const dailyPts = parseInt(dailyCheck.rows[0].daily_pts);
    const dailyScans = parseInt(dailyCheck.rows[0].daily_scans);

    if (dailyPts >= 500) {
      await pool.query(
        `INSERT INTO anomaly_logs (user_id, type, description, severity)
         VALUES ($1, 'DAILY_LIMIT', 'User exceeded 500 pts/day limit', 'medium')`,
        [req.user.id]
      );
      return res.status(429).json({ error: 'Daily points limit reached (500 pts/day)' });
    }
    if (dailyScans >= 30) {
      return res.status(429).json({ error: 'Daily scan limit reached (30 scans/day)' });
    }

    // Insert transaction
    await pool.query(
      `INSERT INTO transactions (user_id, material, points, icon, source)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, material, points, icon || '♻️', source]
    );

    // Update user points and scans
    const updated = await pool.query(
      `UPDATE users SET points = points + $1, scans = scans + 1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, points, scans, trust_score`,
      [points, req.user.id]
    );

    res.json({
      success: true,
      awarded: points,
      user: updated.rows[0]
    });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/user/profile — update name or telegram_id
router.patch('/profile', async (req, res) => {
  try {
    const { name, telegram_id } = req.body;
    const result = await pool.query(
      `UPDATE users SET
         name = COALESCE($1, name),
         telegram_id = COALESCE($2, telegram_id),
         updated_at = NOW()
       WHERE id = $3
       RETURNING id, name, email, telegram_id, points, scans`,
      [name || null, telegram_id || null, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
