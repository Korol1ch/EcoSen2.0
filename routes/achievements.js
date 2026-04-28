const express = require('express');
const { pool } = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/achievements — all achievements + which ones user has earned
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*,
              ua.earned_at,
              (ua.id IS NOT NULL) AS earned
       FROM achievements a
       LEFT JOIN user_achievements ua
         ON ua.achievement_id = a.id AND ua.user_id = $1
       ORDER BY earned DESC, a.points_reward DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/achievements/my — only earned
router.get('/my', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, ua.earned_at
       FROM user_achievements ua
       JOIN achievements a ON ua.achievement_id = a.id
       WHERE ua.user_id = $1
       ORDER BY ua.earned_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/achievements/co2 — CO₂ profile
router.get('/co2', async (req, res) => {
  try {
    const userRes = await pool.query(
      'SELECT co2_saved_kg FROM users WHERE id=$1', [req.user.id]
    );
    const co2 = parseFloat(userRes.rows[0]?.co2_saved_kg || 0);

    const byMaterial = await pool.query(
      `SELECT material, SUM(co2_saved) AS co2, SUM(weight_kg) AS kg
       FROM transactions WHERE user_id=$1
       GROUP BY material ORDER BY co2 DESC`,
      [req.user.id]
    );

    // Equivalents
    const trees_equivalent = Math.round(co2 / 21);       // avg tree absorbs 21 kg CO₂/year
    const km_car_equivalent = Math.round(co2 / 0.21);    // avg car 210g CO₂/km
    const phone_charges     = Math.round(co2 / 0.005);   // ~5g CO₂ per phone charge

    res.json({
      total_co2_saved_kg: co2,
      equivalents: {
        trees_year: trees_equivalent,
        car_km_saved: km_car_equivalent,
        phone_charges_equivalent: phone_charges,
      },
      by_material: byMaterial.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
