const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// GET /api/stations — all active stations
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, lat, lng, city, material_rates FROM stations WHERE is_active = TRUE ORDER BY name'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
