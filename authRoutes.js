const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET;

function issueToken(user) {
    return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '30d' });
}

function publicUser(user) {
    return {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
        reader_settings: user.reader_settings,
    };
}

/**
 * POST /api/auth/register
 * Body: { email, password, displayName? }
 *
 * Всегда создаёт пользователя с ролью 'reader' — повышение до admin
 * делается только суперадмином через /api/admin/users/:id/role.
 */
router.post('/register', async (req, res, next) => {
    const { email, password, displayName } = req.body;

    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Укажите корректный email' });
    }
    if (!password || password.length < 8) {
        return res.status(400).json({ error: 'Пароль должен быть не короче 8 символов' });
    }

    try {
        const { rows: existing } = await db.query('SELECT id FROM users WHERE email = $1', [
            email.toLowerCase(),
        ]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Пользователь с таким email уже существует' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const { rows } = await db.query(
            `INSERT INTO users (email, password_hash, display_name, role)
             VALUES ($1, $2, $3, 'reader')
             RETURNING *`,
            [email.toLowerCase(), passwordHash, displayName || null]
        );

        const user = rows[0];
        res.status(201).json({ token: issueToken(user), user: publicUser(user) });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post('/login', async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Укажите email и пароль' });
    }

    try {
        const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [
            email.toLowerCase(),
        ]);

        // Одинаковая ошибка и для "нет юзера", и для "неверный пароль" —
        // чтобы не палить, какие email зарегистрированы.
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        const user = rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        res.json({ token: issueToken(user), user: publicUser(user) });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
