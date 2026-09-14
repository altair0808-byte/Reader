const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

// Все роуты этого файла — только для суперадмина
router.use(authenticate, requireSuperAdmin);

/**
 * GET /api/admin/users
 * Список всех пользователей для панели управления.
 */
router.get('/users', async (req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT id, email, display_name, role, created_at
             FROM users
             ORDER BY created_at DESC`
        );
        res.json({ users: rows });
    } catch (err) {
        next(err);
    }
});

/**
 * PATCH /api/admin/users/:id/role
 * Body: { role: 'admin' | 'reader' }
 *
 * Суперадмин может повышать читателя до админа и понижать
 * админа обратно до читателя. Роль 'superadmin' через этот
 * эндпоинт не назначается и не отбирается — это осознанное
 * ограничение: в системе должен быть один суперадмин,
 * назначаемый только на уровне инфраструктуры/сида.
 */
router.patch('/users/:id/role', async (req, res, next) => {
    const { id } = req.params;
    const { role } = req.body;

    const ALLOWED_TARGET_ROLES = ['admin', 'reader'];
    if (!ALLOWED_TARGET_ROLES.includes(role)) {
        return res.status(400).json({
            error: `Роль должна быть одной из: ${ALLOWED_TARGET_ROLES.join(', ')}`,
        });
    }

    // Нельзя менять роль самому себе через этот эндпоинт
    // (страховка от случайного самопонижения суперадмина)
    if (id === req.user.id) {
        return res.status(400).json({ error: 'Нельзя менять собственную роль' });
    }

    try {
        const { rows: targetRows } = await db.query(
            'SELECT id, role FROM users WHERE id = $1',
            [id]
        );

        if (targetRows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        if (targetRows[0].role === 'superadmin') {
            return res.status(403).json({ error: 'Нельзя менять роль суперадмина' });
        }

        const { rows } = await db.query(
            `UPDATE users
             SET role = $1
             WHERE id = $2
             RETURNING id, email, display_name, role`,
            [role, id]
        );

        res.json({ user: rows[0] });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
