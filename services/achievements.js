const { pool } = require('../db');

// CO₂ коэффициенты (кг CO₂ на 1 кг материала)
const CO2_RATES = {
  plastic : 1.5,
  glass   : 0.3,
  paper   : 0.9,
  metal   : 2.0,
  cardboard: 0.7,
  aluminum: 9.0,
  default : 0.5,
};

function calcCO2(material, weight_kg) {
  const rate = CO2_RATES[material?.toLowerCase()] ?? CO2_RATES.default;
  return Math.round(rate * (weight_kg || 0) * 100) / 100;
}

// Check all achievements for a user and grant any newly earned ones.
// Returns array of newly earned achievement objects (for notification).
async function checkAndGrantAchievements(userId) {
  try {
    // Get current user stats
    const userRes = await pool.query(
      'SELECT points, scans, co2_saved_kg FROM users WHERE id = $1',
      [userId]
    );
    if (!userRes.rows.length) return [];
    const { points, scans, co2_saved_kg } = userRes.rows[0];

    // Station drops (transactions with source='station')
    const stationRes = await pool.query(
      "SELECT COUNT(*) FROM transactions WHERE user_id=$1 AND source='station'",
      [userId]
    );
    const stationDrops = parseInt(stationRes.rows[0].count);

    // Streak: count distinct days with at least one transaction, consecutive up to today
    const streakRes = await pool.query(
      `SELECT DISTINCT DATE(created_at) AS day
       FROM transactions WHERE user_id=$1
       ORDER BY day DESC LIMIT 30`,
      [userId]
    );
    const days = streakRes.rows.map(r => r.day.toISOString().slice(0, 10));
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < days.length; i++) {
      const expected = new Date(today);
      expected.setDate(expected.getDate() - i);
      const exp = expected.toISOString().slice(0, 10);
      if (days[i] === exp) streak++;
      else break;
    }

    // All achievements not yet earned by this user
    const allRes = await pool.query(`
      SELECT a.* FROM achievements a
      WHERE a.id NOT IN (
        SELECT achievement_id FROM user_achievements WHERE user_id = $1
      )
    `, [userId]);

    const newlyEarned = [];

    for (const ach of allRes.rows) {
      const { type, threshold } = ach.condition;
      let earned = false;

      if      (type === 'scans'        && scans         >= threshold) earned = true;
      else if (type === 'points'       && points        >= threshold) earned = true;
      else if (type === 'co2'          && co2_saved_kg  >= threshold) earned = true;
      else if (type === 'station_drop' && stationDrops  >= threshold) earned = true;
      else if (type === 'streak_days'  && streak        >= threshold) earned = true;

      if (earned) {
        await pool.query(
          'INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, ach.id]
        );
        // Award bonus points if any
        if (ach.points_reward > 0) {
          await pool.query(
            'UPDATE users SET points = points + $1, updated_at = NOW() WHERE id = $2',
            [ach.points_reward, userId]
          );
        }
        newlyEarned.push(ach);
      }
    }

    return newlyEarned;
  } catch (err) {
    console.error('[achievements] check error:', err.message);
    return [];
  }
}

module.exports = { calcCO2, checkAndGrantAchievements, CO2_RATES };
