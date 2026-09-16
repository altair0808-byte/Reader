const db = require('./db');

// Модель по умолчанию — из бесплатного тира Gemini API (без карты).
// Если Google переименует линейку, поменяй в переменной окружения GEMINI_MODEL,
// код менять не нужно.
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Бесплатный тир Gemini ограничен по запросам в минуту (обычно 10-15 RPM
// для Flash-моделей). Ставим паузу между запросами, чтобы не словить 429
// раньше времени — при генерации книги запросов идёт много подряд.
const MIN_DELAY_MS = parseInt(process.env.GEMINI_MIN_DELAY_MS || '4500', 10);

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function geminiUrl(model) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
}

/**
 * Низкоуровневый вызов Gemini API с ретраями при превышении лимита (HTTP 429)
 * — экспоненциальная задержка, до 5 попыток. Без этого генерация книги
 * почти гарантированно упадёт на бесплатном тире где-то в середине.
 */
async function callGemini({ system, prompt, tools, maxTokens = 4096 }, attempt = 1) {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY не задан в переменных окружения');
    }

    const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (tools) body.tools = tools;

    const res = await fetch(geminiUrl(MODEL), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    // Даём боту "отдышаться" между запросами независимо от результата,
    // чтобы держаться в рамках RPM бесплатного тира.
    await sleep(MIN_DELAY_MS);

    if ((res.status === 429 || res.status === 503) && attempt <= 5) {
        const reason = res.status === 429 ? 'лимит запросов' : 'модель перегружена';
        const backoff = MIN_DELAY_MS * attempt * 2;
        console.warn(`Gemini ${res.status} (${reason}), попытка ${attempt}, жду ${backoff}мс`);
        await sleep(backoff);
        return callGemini({ system, prompt, tools, maxTokens }, attempt + 1);
    }

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${errBody}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];

    if (!candidate) {
        // Частая причина — сработал safety-фильтр Gemini и модель ничего не вернула
        throw new Error('Gemini не вернул текст: ' + JSON.stringify(data).slice(0, 300));
    }

    return (candidate.content?.parts || [])
        .map((p) => p.text || '')
        .join('\n');
}

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
 * ШАГ 0 (опционально, RAG): факты через встроенный Google Search grounding.
 * Примечание: grounding у Gemini имеет отдельную квоту и на некоторых
 * бесплатных ключах может быть недоступен — в этом случае просто
 * пропускаем обогащение и генерация продолжается без него.
 */
async function fetchEnrichmentFacts(shortDescription) {
    try {
        const text = await callGemini({
            system: `Ты — научный консультант для писателя. По краткому описанию книги
найди релевантные реальные факты (даты, имена, места, события, термины),
которые можно использовать как фактурную опору для сюжета.
Собери 8-12 конкретных фактов. Ответь ТОЛЬКО JSON без пояснений в формате:
{"facts": ["факт 1", "факт 2", ...], "sources": ["url1", "url2", ...]}`,
            prompt: shortDescription,
            tools: [{ google_search: {} }],
            maxTokens: 2048,
        });
        return extractJson(text);
    } catch (err) {
        console.warn('Веб-обогащение недоступно, продолжаю без него:', err.message);
        return { facts: [], sources: [] };
    }
}

/**
 * ШАГ 1: план книги — { title, chapters: [{number, title, summary}] }
 */
async function generateBookPlan(shortDescription, chaptersCount, enrichment) {
    const enrichmentBlock = enrichment?.facts?.length
        ? `\n\nИспользуй при построении сюжета следующие реальные факты:\n- ${enrichment.facts.join('\n- ')}`
        : '';

    const system = `Ты — опытный писатель и редактор. Составь подробное оглавление
для книги на основе краткого описания. Разбей сюжет ровно на ${chaptersCount} глав
с чёткой драматургической аркой (завязка, развитие, кульминация, развязка).
Также напиши привлекательную аннотацию книги (как на обложке) — 3-5 предложений,
которая заинтересует читателя, но не раскрывает всю интригу.
Ответь ТОЛЬКО валидным JSON, без пояснений и markdown-разметки, в формате:
{
  "title": "Название книги",
  "description": "Аннотация книги для читателей (3-5 предложений)",
  "chapters": [
    {"number": 1, "title": "Название главы", "summary": "Краткое содержание главы (3-5 предложений)"}
  ]
}`;

    // Лимит ответа зависит от числа глав — план на 100 глав в JSON занимает
    // намного больше места, чем на 5. Без этого при большом chaptersCount
    // ответ Gemini обрывается на середине и JSON.parse падает с ошибкой.
    // gemini-3.6-flash допускает максимум 65536 токенов на выход — оставляем запас.
    const planMaxTokens = Math.min(60000, Math.max(4096, 300 * chaptersCount));

    const text = await callGemini({
        system,
        prompt: shortDescription + enrichmentBlock,
        maxTokens: planMaxTokens,
    });

    const plan = extractJson(text);
    if (!Array.isArray(plan.chapters) || plan.chapters.length === 0) {
        throw new Error('План книги пуст или некорректен');
    }
    return plan;
}

/**
 * ШАГ 2: полный текст одной главы. В контекст идут краткие резюме
 * предыдущих глав (не полный текст) — держим объём промпта под контролем.
 */
async function generateChapterContent(book, chapterPlan, previousSummaries, enrichment) {
    const contextBlock = previousSummaries.length
        ? `\n\nКраткое содержание предыдущих глав (для связности сюжета):\n` +
          previousSummaries.map((s, i) => `Глава ${i + 1}: ${s}`).join('\n')
        : '';

    const enrichmentBlock = enrichment?.facts?.length
        ? `\n\nМожешь опираться на эти реальные факты, если уместно:\n- ${enrichment.facts.join('\n- ')}`
        : '';

    const system = `Ты пишешь художественную книгу "${book.title || book.short_description}".
Пиши в увлекательном литературном стиле, с диалогами и описаниями,
без мета-комментариев о том, что ты ИИ. Объём главы — 3000-5000 символов.`;

    const prompt = `${contextBlock}${enrichmentBlock}

Напиши полноценный текст Главы ${chapterPlan.number}: "${chapterPlan.title}".
Краткое содержание этой главы (раскрой его художественно, не пересказывай сухо): ${chapterPlan.summary}`;

    const content = await callGemini({ system, prompt, maxTokens: 4096 });
    return content.trim();
}

async function summarizeChapter(content) {
    const text = await callGemini({
        system: 'Сожми текст главы книги до 2-3 предложений, сохранив ключевые сюжетные события. Ответь только текстом резюме.',
        prompt: content,
        maxTokens: 300,
    });
    return text.trim();
}

async function generateBookAsync(bookId) {
    const { rows } = await db.query('SELECT * FROM books WHERE id = $1', [bookId]);
    const book = rows[0];
    if (!book) return;

    try {
        let enrichment = null;
        if (book.use_web_enrichment) {
            enrichment = await fetchEnrichmentFacts(book.short_description);
            await db.query('UPDATE books SET enrichment_sources = $1 WHERE id = $2', [
                JSON.stringify(enrichment.sources || []),
                bookId,
            ]);
        }

        const plan = await generateBookPlan(book.short_description, book.total_chapters_plan, enrichment);
        await db.query('UPDATE books SET title = $1, description = $2 WHERE id = $3', [plan.title, plan.description || null, bookId]);
        book.title = plan.title;

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
