const db = require('./db');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-4-6';

/**
 * Низкоуровневый вызов Anthropic Messages API.
 * @param {object} opts
 * @param {string} opts.system - системный промпт
 * @param {Array}  opts.messages - история сообщений [{role, content}]
 * @param {Array}  [opts.tools] - опциональные инструменты (например, web_search)
 * @param {number} [opts.maxTokens]
 */
async function callClaude({ system, messages, tools, maxTokens = 4096 }) {
    const res = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
            model: MODEL,
            max_tokens: maxTokens,
            system,
            messages,
            ...(tools ? { tools } : {}),
        }),
    });

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Anthropic API error ${res.status}: ${errBody}`);
    }

    const data = await res.json();

    // Собираем весь текстовый контент из всех блоков ответа
    // (при использовании web_search ответ может содержать несколько
    // text-блоков вперемешку с блоками использования инструмента).
    return data.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');
}

/**
 * Достаёт JSON из ответа модели, даже если она обернула его в ```json ... ```
 * или добавила пояснение до/после (на случай, если модель не идеально
 * следует инструкции "верни только JSON").
 */
function extractJson(text) {
    const cleaned = text.replace(/```json|```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) {
        throw new Error('Модель не вернула JSON. Ответ: ' + text.slice(0, 300));
    }
    return JSON.parse(cleaned.slice(start, end + 1));
}

/**
 * ШАГ 0 (опционально, RAG): собираем реальные факты по теме книги
 * через встроенный веб-поиск Anthropic API, если книга требует
 * фактической опоры (историческая, научно-популярная и т.п.).
 */
async function fetchEnrichmentFacts(shortDescription) {
    const text = await callClaude({
        system: `Ты — научный консультант для писателя. По краткому описанию книги
найди в интернете релевантные реальные факты (даты, имена, места, события,
термины), которые можно использовать как фактурную опору для сюжета.
Собери 8-12 конкретных фактов. Ответь ТОЛЬКО JSON без пояснений в формате:
{"facts": ["факт 1", "факт 2", ...], "sources": ["url1", "url2", ...]}`,
        messages: [{ role: 'user', content: shortDescription }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        maxTokens: 2048,
    });

    try {
        return extractJson(text);
    } catch {
        // Если модель не уложилась в формат — просто возвращаем сырой текст
        // как единственный факт, чтобы не ронять всю генерацию книги.
        return { facts: [text], sources: [] };
    }
}

/**
 * ШАГ 1: генерация оглавления (плана книги).
 * Возвращает { title, chapters: [{number, title, summary}] }.
 */
async function generateBookPlan(shortDescription, chaptersCount, enrichment) {
    const enrichmentBlock = enrichment?.facts?.length
        ? `\n\nИспользуй при построении сюжета следующие реальные факты:\n- ${enrichment.facts.join('\n- ')}`
        : '';

    const system = `Ты — опытный писатель и редактор. Составь подробное оглавление
для книги на основе краткого описания. Разбей сюжет ровно на ${chaptersCount} глав
с чёткой драматургической аркой (завязка, развитие, кульминация, развязка).
Ответь ТОЛЬКО валидным JSON, без пояснений и markdown-разметки, в формате:
{
  "title": "Название книги",
  "chapters": [
    {"number": 1, "title": "Название главы", "summary": "Краткое содержание главы (3-5 предложений)"}
  ]
}`;

    const text = await callClaude({
        system,
        messages: [{ role: 'user', content: shortDescription + enrichmentBlock }],
        maxTokens: 4096,
    });

    const plan = extractJson(text);

    if (!Array.isArray(plan.chapters) || plan.chapters.length === 0) {
        throw new Error('План книги пуст или некорректен');
    }

    return plan;
}

/**
 * ШАГ 2: генерация полного текста одной главы.
 * В контекст передаём краткое содержание ВСЕХ предыдущих глав
 * (а не полный текст) — это держит объём промпта под контролем
 * даже для книг на 40+ глав.
 */
async function generateChapterContent(book, chapterPlan, previousSummaries, enrichment) {
    const contextBlock = previousSummaries.length
        ? `\n\nКраткое содержание предыдущих глав (для соблюдения связности сюжета):\n` +
          previousSummaries.map((s, i) => `Глава ${i + 1}: ${s}`).join('\n')
        : '';

    const enrichmentBlock = enrichment?.facts?.length
        ? `\n\nМожешь опираться на эти реальные факты, если уместно:\n- ${enrichment.facts.join('\n- ')}`
        : '';

    const system = `Ты пишешь художественную книгу "${book.title || book.short_description}".
Пиши в увлекательном литературном стиле, с диалогами и описаниями,
без выдуманных предупреждений и мета-комментариев о том, что ты ИИ.
Объём главы — 3000-5000 символов.`;

    const userPrompt = `${contextBlock}${enrichmentBlock}

Напиши полноценный текст Главы ${chapterPlan.number}: "${chapterPlan.title}".
Краткое содержание этой главы (раскрой его художественно, не пересказывай сухо): ${chapterPlan.summary}`;

    const content = await callClaude({
        system,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 4096,
    });

    return content.trim();
}

/**
 * Короткое резюме только что сгенерированной главы — для контекста
 * следующих глав (дешевле и компактнее, чем прогонять полный текст).
 */
async function summarizeChapter(content) {
    const text = await callClaude({
        system: 'Сожми текст главы книги до 2-3 предложений, сохранив ключевые сюжетные события. Ответь только текстом резюме, без пояснений.',
        messages: [{ role: 'user', content }],
        maxTokens: 300,
    });
    return text.trim();
}

/**
 * Главная функция: последовательно проходит все шаги алгоритма
 * и по ходу пишет прогресс в БД, чтобы фронтенд мог поллить статус.
 */
async function generateBookAsync(bookId) {
    const { rows } = await db.query('SELECT * FROM books WHERE id = $1', [bookId]);
    const book = rows[0];
    if (!book) return;

    try {
        // Шаг 0: опциональное обогащение реальными фактами (RAG)
        let enrichment = null;
        if (book.use_web_enrichment) {
            enrichment = await fetchEnrichmentFacts(book.short_description);
            await db.query('UPDATE books SET enrichment_sources = $1 WHERE id = $2', [
                JSON.stringify(enrichment.sources || []),
                bookId,
            ]);
        }

        // Шаг 1: план книги
        const plan = await generateBookPlan(book.short_description, book.total_chapters_plan, enrichment);
        await db.query('UPDATE books SET title = $1 WHERE id = $2', [plan.title, bookId]);
        book.title = plan.title;

        // Шаг 2: поглавная генерация с нарастающим контекстом
        const previousSummaries = [];
        for (const chapterPlan of plan.chapters.sort((a, b) => a.number - b.number)) {
            const { rows: chapterRows } = await db.query(
                `INSERT INTO chapters (book_id, chapter_number, title, status)
                 VALUES ($1, $2, $3, 'generating')
                 RETURNING id`,
                [bookId, chapterPlan.number, chapterPlan.title]
            );
            const chapterId = chapterRows[0].id;

            const content = await generateChapterContent(book, chapterPlan, previousSummaries, enrichment);
            const summary = await summarizeChapter(content);
            previousSummaries.push(summary);

            // Шаг 3: сохранение главы
            await db.query(
                `UPDATE chapters
                 SET content = $1, summary = $2, word_count = $3, status = 'completed'
                 WHERE id = $4`,
                [content, summary, content.split(/\s+/).length, chapterId]
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

module.exports = { generateBookAsync };
