-- migrations/002_add_enrichment_flag.sql
-- Добавляет книге флаг "использовать веб-поиск для обогащения фактурой"
-- (для исторических/научно-популярных книг) и поле с кратким содержанием
-- предыдущих глав, которое накапливается по ходу генерации — чтобы не
-- перечитывать полный текст всех предыдущих глав при каждом запросе к ИИ.

ALTER TABLE books
    ADD COLUMN IF NOT EXISTS use_web_enrichment BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE chapters
    ADD COLUMN IF NOT EXISTS summary TEXT; -- краткое содержание главы для контекста следующих глав
