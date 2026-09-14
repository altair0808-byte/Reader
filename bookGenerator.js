const db = require('../config/db');

/**
 * Асинхронно генерирует книгу по главам.
 * Здесь — место для интеграции с LLM API (например, Anthropic API)
 * и, опционально, с веб-поиском/внешними API для обогащения фактуры
 * (исторические даты, географические названия, термины и т.д.).
 *
 * Обновляет статус книги/глав по ходу генерации, чтобы фронтенд
 * мог показывать прогресс через поллинг GET /api/books/:id.
 */
async function generateBookAsync(bookId) {
    const { rows } = await db.query('SELECT * FROM books WHERE id = $1', [bookId]);
    const book = rows[0];
    if (!book) return;

    try {
        // 1. (опционально) Обогащение: поиск фактов/контекста по теме
        //    const enrichment = await fetchEnrichmentData(book.short_description);
        //    await db.query('UPDATE books SET enrichment_sources = $1 WHERE id = $2',
        //        [JSON.stringify(enrichment.sources), bookId]);

        // 2. Генерация плана книги (заголовок + список глав) через LLM
        const plan = await generateBookPlan(book.short_description, book.total_chapters_plan);

        await db.query('UPDATE books SET title = $1 WHERE id = $2', [plan.title, bookId]);

        // 3. Последовательная (или батчами) генерация текста каждой главы
        for (const chapterPlan of plan.chapters) {
            const { rows: chapterRows } = await db.query(
                `INSERT INTO chapters (book_id, chapter_number, title, status)
                 VALUES ($1, $2, $3, 'generating')
                 RETURNING id`,
                [bookId, chapterPlan.number, chapterPlan.title]
            );
            const chapterId = chapterRows[0].id;

            const content = await generateChapterContent(book, chapterPlan);

            await db.query(
                `UPDATE chapters
                 SET content = $1, word_count = $2, status = 'completed'
                 WHERE id = $3`,
                [content, content.split(/\s+/).length, chapterId]
            );
        }

        await db.query("UPDATE books SET status = 'completed' WHERE id = $1", [bookId]);
    } catch (err) {
        await db.query(
            "UPDATE books SET status = 'failed', generation_error = $1 WHERE id = $2",
            [err.message, bookId]
        );
        throw err;
    }
}

// --- Заглушки для интеграции с реальным LLM-провайдером ---

async function generateBookPlan(shortDescription, chaptersCount) {
    // TODO: вызов LLM (например, Anthropic Messages API) с промптом,
    // просящим вернуть JSON { title, chapters: [{number, title, summary}] }
    throw new Error('generateBookPlan: интеграция с LLM не настроена');
}

async function generateChapterContent(book, chapterPlan) {
    // TODO: вызов LLM с контекстом книги + summary главы -> полный текст главы
    throw new Error('generateChapterContent: интеграция с LLM не настроена');
}

module.exports = { generateBookAsync };
