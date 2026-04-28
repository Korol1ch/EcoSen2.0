const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { operatorAuth, adminOnly } = require('../middleware/operatorAuth');
const { checkUserLimits, checkStationSpike, logAnomaly, rewardHonestTransaction } = require('../services/antiFraud');
const { calcCO2, checkAndGrantAchievements } = require('../services/achievements');
const { notify } = require('../services/notify');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'ecosen_secret_key_2024';

// ── POST /api/operators/login ─────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email и пароль обязательны' });

    const result = await pool.query(
      `SELECT o.*, s.name AS station_name
       FROM operators o
       LEFT JOIN stations s ON o.station_id = s.id
       WHERE o.email = $1`,
      [email.toLowerCase().trim()]
    );
    if (!result.rows.length)
      return res.status(401).json({ error: 'Неверный email или пароль' });

    const op = result.rows[0];
    if (!op.is_active)
      return res.status(403).json({ error: 'Аккаунт деактивирован' });

    const valid = await bcrypt.compare(password, op.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Неверный email или пароль' });

    const token = jwt.sign(
      { operator_id: op.id, email: op.email, role: op.role, station_id: op.station_id },
      JWT_SECRET,
      { expiresIn: '12h' }
    );
    const { password_hash, ...safe } = op;
    res.json({ operator: safe, token });
  } catch (err) {
    console.error('operator login error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── POST /api/operators/drop ──────────────────────────────────────────────────
// Operator confirms a physical waste drop-off and awards points to the user.
// Body: { user_id, material, weight_kg }
router.post('/drop', operatorAuth, async (req, res) => {
  try {
    const { user_id, material, weight_kg } = req.body;
    if (!user_id || !material || weight_kg == null)
      return res.status(400).json({ error: 'user_id, material, weight_kg обязательны' });
    if (weight_kg <= 0 || weight_kg > 1000)
      return res.status(400).json({ error: 'Некорректный вес' });

    const stationId = req.operator.station_id;
    if (!stationId)
      return res.status(403).json({ error: 'Оператор не привязан к станции' });

    // Get station rates
    const stationRes = await pool.query('SELECT * FROM stations WHERE id=$1 AND is_active=TRUE', [stationId]);
    if (!stationRes.rows.length)
      return res.status(404).json({ error: 'Станция не найдена или неактивна' });
    const station = stationRes.rows[0];

    // Get user + trust_score
    const userRes = await pool.query('SELECT id, name, trust_score FROM users WHERE id=$1', [user_id]);
    if (!userRes.rows.length)
      return res.status(404).json({ error: 'Пользователь не найден' });
    const user = userRes.rows[0];

    // Calculate points
    const rates = station.material_rates;
    const rate = rates[material.toLowerCase()] ?? 5;
    const rawPoints = Math.round(weight_kg * rate * user.trust_score);
    const co2Saved = calcCO2(material, weight_kg);

    // ── Anti-fraud checks ──────────────────────────────────────────────────
    const userCheck = await checkUserLimits(user_id, rawPoints, weight_kg);
    if (!userCheck.ok) {
      await logAnomaly({
        userId: user_id, stationId,
        operatorId: req.operator.operator_id,
        type: 'USER_LIMIT_EXCEEDED',
        description: userCheck.reason,
        severity: 'medium',
      });
      return res.status(429).json({ error: userCheck.reason });
    }

    const spikeCheck = await checkStationSpike(stationId, weight_kg);
    if (spikeCheck.spiked) {
      await logAnomaly({
        stationId, operatorId: req.operator.operator_id,
        type: 'STATION_SPIKE',
        description: `Сегодня ${spikeCheck.today_kg} кг vs средний ${spikeCheck.avg_kg} кг/день`,
        severity: 'high',
      });
      // Still allow — just flag. Admin reviews in anomaly_logs.
    }
    // ─────────────────────────────────────────────────────────────────────

    // Create transaction
    const txRes = await pool.query(
      `INSERT INTO transactions
         (user_id, station_id, operator_id, material, weight_kg, points, co2_saved, source, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'station','confirmed')
       RETURNING *`,
      [user_id, stationId, req.operator.operator_id, material.toLowerCase(), weight_kg, rawPoints, co2Saved]
    );

    // Update user stats
    await pool.query(
      `UPDATE users
       SET points = points + $1, scans = scans + 1, co2_saved_kg = co2_saved_kg + $2, updated_at=NOW()
       WHERE id = $3`,
      [rawPoints, co2Saved, user_id]
    );

    // Reward honest transaction
    await rewardHonestTransaction(user_id);

    // Check achievements
    const newAchievements = await checkAndGrantAchievements(user_id);

    // Notify user
    await notify(user_id, {
      type: 'points',
      title: `+${rawPoints} баллов начислено!`,
      body: `${weight_kg} кг ${material} сдано на станции "${station.name}". Сохранено ${co2Saved} кг CO₂.`,
    });

    // Notify for each new achievement
    for (const ach of newAchievements) {
      await notify(user_id, {
        type: 'achievement',
        title: `${ach.icon} Достижение разблокировано: ${ach.name}`,
        body: ach.description,
        sendEmail: true,
        emailSubject: `EcoSen: Новое достижение — ${ach.name}`,
      });
    }

    res.status(201).json({
      success: true,
      transaction: txRes.rows[0],
      awarded_points: rawPoints,
      co2_saved: co2Saved,
      station_spike: spikeCheck.spiked,
      new_achievements: newAchievements,
    });
  } catch (err) {
    console.error('operator drop error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── GET /api/operators/station/transactions ───────────────────────────────────
// Operator sees today's transactions at their station
router.get('/station/transactions', operatorAuth, async (req, res) => {
  try {
    const stationId = req.operator.station_id;
    const days = Math.min(parseInt(req.query.days) || 1, 30);

    const result = await pool.query(
      `SELECT t.*, u.name AS user_name, u.email AS user_email
       FROM transactions t
       JOIN users u ON t.user_id = u.id
       WHERE t.station_id = $1
         AND t.created_at >= NOW() - ($2 || ' days')::INTERVAL
       ORDER BY t.created_at DESC
       LIMIT 200`,
      [stationId, days]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── GET /api/operators/station/report ────────────────────────────────────────
// Station stats summary
router.get('/station/report', operatorAuth, async (req, res) => {
  try {
    const stationId = req.operator.station_id;

    const summary = await pool.query(
      `SELECT
         COUNT(*)                        AS total_ops,
         COALESCE(SUM(weight_kg),0)      AS total_weight_kg,
         COALESCE(SUM(points),0)         AS total_points,
         COALESCE(SUM(co2_saved),0)      AS total_co2_saved,
         COALESCE(AVG(weight_kg),0)      AS avg_weight_per_op
       FROM transactions
       WHERE station_id=$1 AND created_at >= NOW() - INTERVAL '30 days'`,
      [stationId]
    );

    const byMaterial = await pool.query(
      `SELECT material, SUM(weight_kg) AS kg, SUM(points) AS pts, COUNT(*) AS ops
       FROM transactions
       WHERE station_id=$1 AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY material ORDER BY kg DESC`,
      [stationId]
    );

    const anomalies = await pool.query(
      `SELECT * FROM anomaly_logs WHERE station_id=$1 AND resolved=FALSE ORDER BY created_at DESC LIMIT 20`,
      [stationId]
    );

    res.json({
      period: '30 days',
      summary: summary.rows[0],
      by_material: byMaterial.rows,
      open_anomalies: anomalies.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── ADMIN: POST /api/operators/create ─────────────────────────────────────────
// Create a new operator (admin only)
router.post('/create', operatorAuth, adminOnly, async (req, res) => {
  try {
    const { name, email, password, station_id, role = 'operator' } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'name, email, password обязательны' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO operators (name, email, password_hash, station_id, role)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, station_id, role, created_at`,
      [name.trim(), email.toLowerCase().trim(), hash, station_id || null, role]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email уже используется' });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── ADMIN: GET /api/operators/anomalies ──────────────────────────────────────
router.get('/anomalies', operatorAuth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT al.*, u.name AS user_name, s.name AS station_name
       FROM anomaly_logs al
       LEFT JOIN users u ON al.user_id = u.id
       LEFT JOIN stations s ON al.station_id = s.id
       WHERE al.resolved = FALSE
       ORDER BY al.created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── ADMIN: PATCH /api/operators/anomalies/:id/resolve ────────────────────────
router.patch('/anomalies/:id/resolve', operatorAuth, adminOnly, async (req, res) => {
  try {
    await pool.query('UPDATE anomaly_logs SET resolved=TRUE WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
