const express = require('express');
const router = express.Router();
const db = require('./db');
const { authenticate, requireSuperAdmin } = require('./auth');

router.get('/me', authenticate, (req, res) => {
    res.json({ user: req.user });
});

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

// Список пользователей — только superadmin (используется на странице
// управления пользователями).
router.get('/', authenticate, requireSuperAdmin, async (req, res, next) => {
    try {
        const { rows } = await db.query(
            'SELECT id, email, username, display_name, role, created_at FROM users ORDER BY created_at DESC'
        );
        res.json({ users: rows });
    } catch (err) {
        next(err);
    }
});

// Удаление пользователя — только superadmin. Запрещаем удалять самого себя,
// чтобы не остаться без доступа к панели управления.
router.delete('/:id', authenticate, requireSuperAdmin, async (req, res, next) => {
    try {
        const targetId = parseInt(req.params.id, 10);
        if (targetId === req.user.id) {
            return res.status(400).json({ error: 'Нельзя удалить самого себя' });
        }

        const { rows } = await db.query('DELETE FROM users WHERE id = $1 RETURNING id', [targetId]);
        if (!rows[0]) return res.status(404).json({ error: 'Пользователь не найден' });

        res.json({ message: 'Пользователь удалён' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
