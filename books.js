const express = require('express');
const router = express.Router();
const pool = require('./db');
const { authenticate } = require('./auth');
const { generateBookAsync } = require('./bookGenerator');

// Роут для создания книги — запускает НАСТОЯЩУЮ генерацию через Gemini
// (bookGenerator.js), а не заглушку. Отвечаем сразу, генерация идёт в фоне,
// т.к. может занимать несколько минут (пауза между запросами к Gemini +
// генерация каждой главы по отдельности).
router.post('/generate', authenticate, async (req, res) => {
    try {
        const { title, prompt, genre, chapters, use_web_enrichment } = req.body;
        const userId = req.user.id;

        if (!title || !prompt) {
            return res.status(400).json({ error: 'Укажите название и описание (промпт) для книги' });
        }

        const chaptersCount = Number.isInteger(chapters) && chapters > 0 ? chapters : 5;

        const inserted = await pool.query(
            `INSERT INTO books
                (user_id, title, genre, prompt, short_description, total_chapters_plan, use_web_enrichment, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'generating')
             RETURNING *`,
            [userId, title, genre || 'Общий', prompt, prompt, chaptersCount, !!use_web_enrichment]
        );

        const book = inserted.rows[0];

        // Не ждём завершения генерации — отвечаем клиенту сразу.
        generateBookAsync(book.id).catch((err) => {
            console.error(`❌ Генерация книги #${book.id} упала:`, err);
        });

        res.status(202).json({ message: 'Генерация книги запущена', book });

    } catch (err) {
        console.error("❌ ОШИБКА запуска генерации книги:", err);
        res.status(500).json({ error: 'Ошибка сервера при генерации книги' });
    }
});

// Роут для получения списка книг текущего пользователя
router.get('/', authenticate, async (req, res) => {
    try {
        const books = await pool.query(
            `SELECT id, title, genre, status, short_description, created_at
             FROM books WHERE user_id = $1 ORDER BY created_at DESC`,
            [req.user.id]
        );
        res.json({ books: books.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения книг' });
    }
});

// Роут для проверки статуса одной книги (для поллинга во время генерации)
router.get('/:id', authenticate, async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT * FROM books WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Книга не найдена' });
        res.json({ book: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения книги' });
    }
});

// Роут для получения глав книги
router.get('/:id/chapters', authenticate, async (req, res) => {
    try {
        const book = await pool.query('SELECT id FROM books WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        if (!book.rows[0]) return res.status(404).json({ error: 'Книга не найдена' });

        const chapters = await pool.query(
            'SELECT id, chapter_number, title, content, status, word_count FROM chapters WHERE book_id = $1 ORDER BY chapter_number',
            [req.params.id]
        );
        res.json({ chapters: chapters.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения глав' });
    }
});

// Роут для получения ОДНОЙ главы по номеру — именно его использует reader.html
// (GET /api/books/:id/chapters/:chapterNumber), в отличие от роута выше,
// который отдаёт сразу все главы списком.
router.get('/:id/chapters/:number', authenticate, async (req, res) => {
    try {
        const book = await pool.query('SELECT id FROM books WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        if (!book.rows[0]) return res.status(404).json({ error: 'Книга не найдена' });

        const { rows } = await pool.query(
            'SELECT id, chapter_number, title, content, status, word_count FROM chapters WHERE book_id = $1 AND chapter_number = $2',
            [req.params.id, req.params.number]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Глава не найдена' });

        res.json({ chapter: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения главы' });
    }
});

// Роут для загрузки ГОТОВОЙ книги (без ИИ) — например, книги, написанной
// самим пользователем или взятой из другого источника. Весь текст
// сохраняется как одна законченная глава.
router.post('/upload', authenticate, async (req, res) => {
    try {
        const { title, genre, content } = req.body;
        const userId = req.user.id;

        if (!title || !content || !content.trim()) {
            return res.status(400).json({ error: 'Укажите название и текст книги' });
        }

        const inserted = await pool.query(
            `INSERT INTO books
                (user_id, title, genre, short_description, status, total_chapters_plan)
             VALUES ($1, $2, $3, $4, 'completed', 1)
             RETURNING *`,
            [userId, title, genre || 'Общий', content.slice(0, 300)]
        );

        const book = inserted.rows[0];
        const wordCount = content.trim().split(/\s+/).length;

        await pool.query(
            `INSERT INTO chapters (book_id, chapter_number, title, content, word_count, status)
             VALUES ($1, 1, $2, $3, $4, 'completed')`,
            [book.id, title, content, wordCount]
        );

        res.status(201).json({ message: 'Книга успешно загружена!', book });

    } catch (err) {
        console.error("❌ ОШИБКА загрузки книги:", err);
        res.status(500).json({ error: 'Ошибка сервера при загрузке книги' });
    }
});

module.exports = router;
