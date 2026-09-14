const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, requireAdminOrAbove } = require('../middleware/auth');
const { generateBookAsync } = require('../services/bookGenerator');

/**
 * GET /api/books
 * Список книг — доступен любому авторизованному пользователю
 * (включая reader).
 */
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT id, title, short_description, genre, cover_image_url,
                    status, total_chapters_plan, created_at
             FROM books
             ORDER BY created_at DESC`
        );
        res.json({ books: rows });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/books/:id/chapters/:chapterNumber
 * Текст конкретной главы — для режима чтения.
 */
router.get('/:id/chapters/:chapterNumber', authenticate, async (req, res, next) => {
    try {
        const { id, chapterNumber } = req.params;
        const { rows } = await db.query(
            `SELECT id, chapter_number, title, content, status
             FROM chapters
             WHERE book_id = $1 AND chapter_number = $2`,
            [id, chapterNumber]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Глава не найдена' });
        }
        res.json({ chapter: rows[0] });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/books
 * Body: { shortDescription, genre?, chaptersCount? }
 *
 * Создаёт книгу и запускает асинхронную генерацию глав.
 * Доступно только admin/superadmin.
 */
router.post('/', authenticate, requireAdminOrAbove, async (req, res, next) => {
    const { shortDescription, genre, chaptersCount = 10 } = req.body;

    if (!shortDescription || shortDescription.trim().length < 10) {
        return res.status(400).json({
            error: 'Нужно краткое описание книги (минимум 10 символов)',
        });
    }

    try {
        const { rows } = await db.query(
            `INSERT INTO books (title, short_description, genre, status,
                                 total_chapters_plan, created_by)
             VALUES ($1, $2, $3, 'generating', $4, $5)
             RETURNING *`,
            [
                shortDescription.slice(0, 60), // временный тайтл, LLM его переопределит
                shortDescription,
                genre || null,
                chaptersCount,
                req.user.id,
            ]
        );

        const book = rows[0];

        // Генерация запускается в фоне — эндпоинт сразу отдаёт 202,
        // клиент опрашивает /api/books/:id для отслеживания статуса.
        generateBookAsync(book.id).catch((err) => {
            console.error(`Ошибка генерации книги ${book.id}:`, err);
        });

        res.status(202).json({ book });
    } catch (err) {
        next(err);
    }
});

/**
 * DELETE /api/books/:id — admin/superadmin
 */
router.delete('/:id', authenticate, requireAdminOrAbove, async (req, res, next) => {
    try {
        await db.query('DELETE FROM books WHERE id = $1', [req.params.id]);
        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

module.exports = router;
