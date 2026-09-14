const express = require('express');
const router = express.Router();
const pool = require('./db');
const jwt = require('jsonwebtoken');

// Промежуточный слой (middleware) для проверки авторизации по токену
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401.json({ error: 'Требуется авторизация' }));

    jwt.verify(token, process.env.JWT_SECRET || 'secret_key_fallback', (err, user) => {
        if (err) return res.status(403.json({ error: 'Недействительный токен' }));
        req.user = user;
        next();
    });
}

// Роут для создания книги
router.post('/generate', authenticateToken, async (req, res) => {
    try {
        const { title, prompt, genre } = req.body;
        const userId = req.user.id;

        if (!title || !prompt) {
            return res.status(400).json({ error: 'Укажите название и описание (промпт) для книги' });
        }

        // Здесь можно подключить реальный вызов OpenAI API, но пока для теста 
        // сделаем заглушку-генератор, чтобы всё гарантированно работало:
        const generatedContent = `Глава 1. Начало пути.\n\nЭта книга была сгенерирована искусственным интеллектом на основе вашего запроса: "${prompt}".\n\nЖанр: ${genre || 'Художественная литература'}.\n\nЗдесь будет разворачиваться увлекательный сюжет...`;

        // Сохраняем книгу в базу данных PostgreSQL
        const newBook = await pool.query(
            `INSERT INTO books (user_id, title, genre, content, prompt) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [userId, title, genre || 'Общий', generatedContent, prompt]
        );

        res.json({ message: 'Книга успешно создана!', book: newBook.rows[0] });

    } catch (err) {
        console.error("❌ ОШИБКА генерации книги:", err);
        res.status(500).json({ error: 'Ошибка сервера при генерации книги' });
    }
});

// Роут для получения списка книг текущего пользователя
router.get('/', authenticateToken, async (req, res) => {
    try {
        const books = await pool.query('SELECT id, title, genre, created_at FROM books WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
        res.json(books.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения книг' });
    }
});

module.exports = router;
