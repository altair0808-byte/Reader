const express = require('express');
const router = express.Router();
const pool = require('./db');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Функция безопасного хеширования пароля через встроенный crypto
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

// Функция проверки пароля
function verifyPassword(password, storedHash) {
    const [salt, key] = storedHash.split(':');
    const hashedBuffer = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(Buffer.from(key, 'hex'), hashedBuffer);
}

// Роут регистрации
router.post('/register', async (req, res) => {
    console.log("🔥 Начало регистрации, данные:", req.body);
    
    try {
        const { email, password, displayName } = req.body;
        const username = req.body.username || email; 

        if (!email || !password) {
            return res.status(400).json({ error: 'Заполните все обязательные поля' });
        }

        // Проверяем, есть ли пользователь
        const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
        }

        // Хэшируем пароль
        const passwordHash = hashPassword(password);

        // Сохраняем в базу
        const newUser = await pool.query(
            `INSERT INTO users (username, email, display_name, password_hash, role) 
             VALUES ($1, $2, $3, $4, 'reader') RETURNING id, username, email, role`,
            [username, email, displayName || '', passwordHash]
        );

        const user = newUser.rows[0];

        // Генерируем JWT токен
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET || 'secret_key_fallback',
            { expiresIn: '24h' }
        );

        res.json({ token, user });

    } catch (err) {
        console.error("❌ ОШИБКА в /register:", err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

module.exports = router;
