const express = require('express');
const { pool } = require('../db');
const authMiddleware = require('../middleware/auth');
const { notify, notifyAll } = require('../services/notify');
const { operatorAuth, adminOnly } = require('../middleware/operatorAuth');

const router = express.Router();

// GET /api/notifications — current user's notifications
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications WHERE user_id=$1 ORDER BY sent_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/notifications/unread-count
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND is_read=FALSE',
      [req.user.id]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PATCH /api/notifications/read-all — mark all as read
router.patch('/read-all', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read=TRUE WHERE user_id=$1 AND is_read=FALSE',
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/notifications/send — admin sends promo to all users
router.post('/send', operatorAuth, adminOnly, async (req, res) => {
  try {
    const { title, body, user_id } = req.body;
    if (!title) return res.status(400).json({ error: 'title обязателен' });

    if (user_id) {
      await notify(user_id, { type: 'promo', title, body });
      res.json({ success: true, sent_to: 'single user' });
    } else {
      await notifyAll({ type: 'promo', title, body });
      res.json({ success: true, sent_to: 'all users' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
