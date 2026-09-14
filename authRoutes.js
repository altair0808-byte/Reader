const express = require('express');
const router = express.Router();
const pool = require('./db');
const bcrypt = require('bcrypt'); // если используется
const jwt = require('jsonwebtoken'); // если используется
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
router.post('/register', async (req, res) => {
    console.log("1. Начало регистрации, данные:", req.body);
    
    try {
        const { email, password, displayName } = req.body;
        const username = req.body.username || email; 

        console.log("2. Проверяем, есть ли уже такой пользователь...");
        // Добавьте таймаут или проверьте этот запрос к БД:
        const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        console.log("3. Проверка завершена, найдено строк:", userCheck.rows.length);

        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
        }

        // ... ваш код дальше ...

    } catch (err) {
        console.error("❌ ОШИБКА в /register:", err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
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
