const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

/**
 * GET /api/users/me
 */
router.get('/me', authenticate, (req, res) => {
    res.json({ user: req.user });
});

/**
 * PATCH /api/users/me/reader-settings
 * Body: { font_family?, font_size?, line_height?, theme? }
 * Доступно любому авторизованному пользователю — это личные настройки чтения.
 */
router.patch('/me/reader-settings', authenticate, async (req, res, next) => {
    const allowedKeys = ['font_family', 'font_size', 'line_height', 'theme'];
    const updates = {};
    for (const key of allowedKeys) {
        if (key in req.body) updates[key] = req.body[key];
    }

    try {
        const { rows } = await db.query(
            `UPDATE users
             SET reader_settings = reader_settings || $1::jsonb
             WHERE id = $2
             RETURNING reader_settings`,
            [JSON.stringify(updates), req.user.id]
        );
        res.json({ reader_settings: rows[0].reader_settings });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
