const express = require('express');
const { pool } = require('../db');
const authMiddleware = require('../middleware/auth');
const { checkUserLimits, logAnomaly, rewardHonestTransaction } = require('../services/antiFraud');
const { calcCO2, checkAndGrantAchievements } = require('../services/achievements');
const { notify } = require('../services/notify');

const router = express.Router();
router.use(authMiddleware);

// GET /api/user/me — full profile
router.get('/me', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, telegram_id, points, scans, trust_score, co2_saved_kg, created_at
       FROM users WHERE id = $1`,
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
      `SELECT t.id, t.material, t.weight_kg, t.points, t.co2_saved, t.icon, t.source, t.status, t.created_at,
              s.name AS station_name
       FROM transactions t
       LEFT JOIN stations s ON t.station_id = s.id
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[GET /history] Error:', err.message, err.stack);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

// GET /api/user/leaderboard — top 10 + current user rank
router.get('/leaderboard', async (req, res) => {
  try {
    const top = await pool.query(
      `SELECT id, name, points, scans, co2_saved_kg,
              RANK() OVER (ORDER BY points DESC) AS rank
       FROM users ORDER BY points DESC LIMIT 10`
    );
    const myRank = await pool.query(
      `SELECT rank FROM (
         SELECT id, RANK() OVER (ORDER BY points DESC) AS rank FROM users
       ) ranked WHERE id = $1`,
      [req.user.id]
    );
    res.json({ leaderboard: top.rows, my_rank: myRank.rows[0]?.rank || null });
  } catch (err) {
    console.error('[GET /leaderboard] Error:', err.message, err.stack);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

// POST /api/user/scan — AI scan result → award points
router.post('/scan', async (req, res) => {
  try {
    const { material, points, icon, weight_kg = 0, source = 'ai_scan' } = req.body;
    if (!material || !points)
      return res.status(400).json({ error: 'material and points required' });

    // Anti-fraud
    const check = await checkUserLimits(req.user.id, points, weight_kg);
    if (!check.ok) {
      await logAnomaly({
        userId: req.user.id,
        type: 'USER_LIMIT_EXCEEDED',
        description: check.reason,
        severity: 'medium',
      });
      return res.status(429).json({ error: check.reason });
    }

    const co2Saved = calcCO2(material, weight_kg);

    // Insert transaction
    await pool.query(
      `INSERT INTO transactions (user_id, material, weight_kg, points, co2_saved, icon, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.user.id, material, weight_kg || null, points, co2Saved, icon || '♻️', source]
    );

    // Update user
    const updated = await pool.query(
      `UPDATE users
       SET points=points+$1, scans=scans+1, co2_saved_kg=co2_saved_kg+$2, updated_at=NOW()
       WHERE id=$3
       RETURNING id, name, points, scans, trust_score, co2_saved_kg`,
      [points, co2Saved, req.user.id]
    );

    await rewardHonestTransaction(req.user.id);

    // Check achievements
    const newAchievements = await checkAndGrantAchievements(req.user.id);
    for (const ach of newAchievements) {
      await notify(req.user.id, {
        type: 'achievement',
        title: `${ach.icon} Достижение: ${ach.name}`,
        body: ach.description,
        sendEmail: true,
        emailSubject: `EcoSen: Новое достижение — ${ach.name}`,
      });
    }

    res.json({
      success: true,
      awarded: points,
      co2_saved: co2Saved,
      user: updated.rows[0],
      new_achievements: newAchievements,
    });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/user/profile
router.patch('/profile', async (req, res) => {
  try {
    const { name, telegram_id } = req.body;
    const result = await pool.query(
      `UPDATE users SET
         name=COALESCE($1,name),
         telegram_id=COALESCE($2,telegram_id),
         updated_at=NOW()
       WHERE id=$3
       RETURNING id, name, email, telegram_id, points, scans, co2_saved_kg`,
      [name||null, telegram_id||null, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
