const { pool } = require('../db');

// ── Limits ────────────────────────────────────────────────────────────────────
const LIMITS = {
  user: {
    daily_points  : 500,
    daily_scans   : 30,
    daily_weight_kg: 200,
  },
  station: {
    // If today's total weight > STATION_SPIKE_MULTIPLIER * 30-day daily avg → flag
    spike_multiplier: 3,
  },
};

// trust_score deltas
const TRUST = {
  honest_op   :  0.01,  // each confirmed transaction
  anomaly_low :  -0.05,
  anomaly_med :  -0.15,
  anomaly_high:  -0.30,
  min         :  0.10,  // floor
};

// ── Log anomaly + adjust trust ────────────────────────────────────────────────
async function logAnomaly({ userId, stationId, operatorId, type, description, severity }) {
  await pool.query(
    `INSERT INTO anomaly_logs (user_id, station_id, operator_id, type, description, severity)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [userId || null, stationId || null, operatorId || null, type, description, severity]
  );

  if (userId) {
    const delta = severity === 'high' ? TRUST.anomaly_high
                : severity === 'medium' ? TRUST.anomaly_med
                : TRUST.anomaly_low;
    await pool.query(
      `UPDATE users
       SET trust_score = GREATEST(trust_score + $1, $2), updated_at = NOW()
       WHERE id = $3`,
      [delta, TRUST.min, userId]
    );
  }
}

// ── User daily check ──────────────────────────────────────────────────────────
// Returns { ok, reason } — call before creating any transaction
async function checkUserLimits(userId, incomingPoints, incomingWeightKg = 0) {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const res = await pool.query(
    `SELECT COALESCE(SUM(points),0)    AS pts,
            COUNT(*)                   AS scans,
            COALESCE(SUM(weight_kg),0) AS weight
     FROM transactions
     WHERE user_id=$1 AND created_at >= $2`,
    [userId, today]
  );
  const { pts, scans, weight } = res.rows[0];

  if (parseInt(pts) + incomingPoints > LIMITS.user.daily_points)
    return { ok: false, reason: `Дневной лимит баллов (${LIMITS.user.daily_points}) исчерпан` };
  if (parseInt(scans) >= LIMITS.user.daily_scans)
    return { ok: false, reason: `Дневной лимит операций (${LIMITS.user.daily_scans}) исчерпан` };
  if (parseFloat(weight) + incomingWeightKg > LIMITS.user.daily_weight_kg)
    return { ok: false, reason: `Дневной лимит веса (${LIMITS.user.daily_weight_kg} кг) исчерпан` };

  return { ok: true };
}

// ── Station spike check ───────────────────────────────────────────────────────
// Returns { spiked: bool, today_kg, avg_kg }
async function checkStationSpike(stationId, incomingWeightKg = 0) {
  // 30-day average (excluding today)
  const avgRes = await pool.query(
    `SELECT COALESCE(AVG(daily_total), 0) AS avg_kg
     FROM (
       SELECT DATE(created_at) AS day, SUM(weight_kg) AS daily_total
       FROM transactions
       WHERE station_id=$1
         AND created_at >= NOW() - INTERVAL '30 days'
         AND DATE(created_at) < CURRENT_DATE
       GROUP BY day
     ) sub`,
    [stationId]
  );
  const avg_kg = parseFloat(avgRes.rows[0].avg_kg);

  // Today so far
  const todayRes = await pool.query(
    `SELECT COALESCE(SUM(weight_kg),0) AS today_kg
     FROM transactions
     WHERE station_id=$1 AND created_at >= CURRENT_DATE`,
    [stationId]
  );
  const today_kg = parseFloat(todayRes.rows[0].today_kg) + incomingWeightKg;

  const threshold = avg_kg * LIMITS.station.spike_multiplier;
  const spiked = avg_kg > 0 && today_kg > threshold;

  return { spiked, today_kg, avg_kg: Math.round(avg_kg * 10) / 10, threshold };
}

// ── Post-transaction positive trust bump ──────────────────────────────────────
async function rewardHonestTransaction(userId) {
  await pool.query(
    `UPDATE users
     SET trust_score = LEAST(trust_score + $1, 1.0), updated_at = NOW()
     WHERE id = $2`,
    [TRUST.honest_op, userId]
  );
}

module.exports = { checkUserLimits, checkStationSpike, logAnomaly, rewardHonestTransaction, LIMITS };
