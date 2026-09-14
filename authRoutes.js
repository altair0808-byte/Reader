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
router.post('/register', async (req, res) => {
    try {
        const { email, password, displayName } = req.body;

        // ЕСЛИ username не пришел с формы, берем в качестве username почту или displayName
        const username = req.body.username || email; 

        // Проверка, что все обязательные поля есть
        if (!email || !password) {
            return res.status(400).json({ error: 'Заполните все обязательные поля' });
        }

        // ... дальше идет ваш код хэширования пароля и сохранения в базу данных ...
        // Убедитесь, что в SQL-запрос INSERT передается переменная username:
        // INSERT INTO users (username, email, display_name, password_hash) VALUES ($1, $2, $3, $4)

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера при регистрации' });
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
