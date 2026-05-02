const express = require('express');
const { pool } = require('../db');
const authMiddleware = require('../middleware/auth');
const { calcCO2, checkAndGrantAchievements } = require('../services/achievements');
const { notify } = require('../services/notify');

const router = express.Router();

// Admin-only middleware
router.use(authMiddleware);
router.use((req, res, next) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Доступ только для администратора' });
  next();
});

// GET /api/admin/material-rates — list all material rates
router.get('/material-rates', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM material_rates ORDER BY points_per_kg DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PATCH /api/admin/material-rates/:material — update rate for a material
router.patch('/material-rates/:material', async (req, res) => {
  try {
    const { points_per_kg, co2_per_kg } = req.body;
    const result = await pool.query(
      `UPDATE material_rates SET points_per_kg=COALESCE($1,points_per_kg), co2_per_kg=COALESCE($2,co2_per_kg), updated_at=NOW()
       WHERE material=$3 RETURNING *`,
      [points_per_kg || null, co2_per_kg || null, req.params.material]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Материал не найден' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/admin/award — award points to user by username
// Body: { username, material, weight_kg }
router.post('/award', async (req, res) => {
  try {
    const { username, material, weight_kg } = req.body;
    if (!username || !material || !weight_kg)
      return res.status(400).json({ error: 'username, material и weight_kg обязательны' });
    if (weight_kg <= 0 || weight_kg > 10000)
      return res.status(400).json({ error: 'Вес должен быть от 0.001 до 10000 кг' });

    // Find user by username
    const userResult = await pool.query(
      'SELECT id, name, username, points FROM users WHERE username = $1',
      [username.toLowerCase().trim()]
    );
    if (userResult.rows.length === 0)
      return res.status(404).json({ error: `Пользователь @${username} не найден` });

    const user = userResult.rows[0];

    // Get material rate
    const rateResult = await pool.query(
      'SELECT * FROM material_rates WHERE material = $1',
      [material]
    );
    if (rateResult.rows.length === 0)
      return res.status(404).json({ error: `Материал "${material}" не найден` });

    const rate = rateResult.rows[0];
    const points = Math.round(rate.points_per_kg * weight_kg);
    const co2Saved = rate.co2_per_kg * weight_kg;

    // Insert transaction
    await pool.query(
      `INSERT INTO transactions (user_id, material, weight_kg, points, co2_saved, icon, source)
       VALUES ($1,$2,$3,$4,$5,$6,'station')`,
      [user.id, material, weight_kg, points, co2Saved, rate.icon]
    );

    // Update user stats
    const updated = await pool.query(
      `UPDATE users SET points=points+$1, scans=scans+1, co2_saved_kg=co2_saved_kg+$2, updated_at=NOW()
       WHERE id=$3 RETURNING id, name, username, points, scans, co2_saved_kg`,
      [points, co2Saved, user.id]
    );

    // Check achievements
    let newAchievements = [];
    try {
      newAchievements = await checkAndGrantAchievements(user.id);
      for (const ach of newAchievements) {
        await notify(user.id, {
          type: 'achievement',
          title: `${ach.icon} Достижение: ${ach.name}`,
          body: ach.description,
          sendEmail: false,
        });
      }
      // Notify user about points
      await notify(user.id, {
        type: 'points',
        title: `+${points} баллов начислено`,
        body: `Вы сдали ${weight_kg} кг ${rate.name_ru}. Сэкономлено ${co2Saved.toFixed(2)} кг CO₂.`,
        sendEmail: false,
      });
    } catch (e) {
      console.warn('[admin/award] Non-critical notification error:', e.message);
    }

    res.json({
      success: true,
      user: updated.rows[0],
      awarded_points: points,
      weight_kg,
      material: rate.name_ru,
      co2_saved: co2Saved,
      new_achievements: newAchievements,
    });
  } catch (err) {
    console.error('[admin/award] Error:', err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/admin/users — search users by username/name/email
router.get('/users', async (req, res) => {
  try {
    const { q } = req.query;
    let result;
    if (q) {
      result = await pool.query(
        `SELECT id, name, username, email, points, scans, co2_saved_kg, is_admin, created_at
         FROM users WHERE username ILIKE $1 OR name ILIKE $1 OR email ILIKE $1
         ORDER BY points DESC LIMIT 20`,
        [`%${q}%`]
      );
    } else {
      result = await pool.query(
        `SELECT id, name, username, email, points, scans, co2_saved_kg, is_admin, created_at
         FROM users ORDER BY points DESC LIMIT 50`
      );
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/admin/transactions — recent transactions
router.get('/transactions', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.id, t.material, t.weight_kg, t.points, t.co2_saved, t.source, t.created_at,
              u.name AS user_name, u.username AS user_username
       FROM transactions t
       JOIN users u ON t.user_id = u.id
       ORDER BY t.created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
