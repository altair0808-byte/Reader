-- =========================================================
-- Схема БД для платформы AI-генерации книг
-- PostgreSQL 14+
-- =========================================================

CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'reader');
CREATE TYPE book_status AS ENUM ('draft', 'generating', 'completed', 'failed');

-- ---------------------------------------------------------
-- Пользователи
-- ---------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    display_name    VARCHAR(100),
    role            user_role NOT NULL DEFAULT 'reader',

    -- Настройки режима чтения (шрифт, размер, тема и т.д.)
    reader_settings JSONB NOT NULL DEFAULT '{
        "font_family": "serif",
        "font_size": 18,
        "line_height": 1.6,
        "theme": "light"
    }'::jsonb,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Гарантируем, что в системе не может быть больше одного superadmin
-- (при желании можно убрать этот индекс, если допускаешь нескольких)
CREATE UNIQUE INDEX one_superadmin_only
    ON users (role)
    WHERE role = 'superadmin';

-- ---------------------------------------------------------
-- Книги
-- ---------------------------------------------------------
CREATE TABLE books (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title               VARCHAR(255) NOT NULL,
    short_description   TEXT NOT NULL,          -- то, что ввёл пользователь
    genre               VARCHAR(100),
    cover_image_url     TEXT,
    status              book_status NOT NULL DEFAULT 'draft',
    total_chapters_plan INTEGER DEFAULT 0,       -- сколько глав запланировано генератором
    generation_error    TEXT,                    -- если status = failed

    -- источники обогащения сюжета (например, факты из веб-поиска/API)
    enrichment_sources  JSONB DEFAULT '[]'::jsonb,

    created_by          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_books_status ON books (status);
CREATE INDEX idx_books_created_by ON books (created_by);

-- ---------------------------------------------------------
-- Главы
-- ---------------------------------------------------------
CREATE TABLE chapters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id         UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_number  INTEGER NOT NULL,
    title           VARCHAR(255),
    content         TEXT,                     -- сгенерированный текст главы
    word_count      INTEGER DEFAULT 0,
    status          book_status NOT NULL DEFAULT 'generating',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (book_id, chapter_number)
);

CREATE INDEX idx_chapters_book_id ON chapters (book_id);

-- ---------------------------------------------------------
-- Прогресс чтения (опционально, но полезно для UX читалки)
-- ---------------------------------------------------------
CREATE TABLE reading_progress (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id     UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_id  UUID REFERENCES chapters(id) ON DELETE SET NULL,
    scroll_position NUMERIC DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (user_id, book_id)
);

-- ---------------------------------------------------------
-- Триггер для updated_at
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_books_updated_at BEFORE UPDATE ON books
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_chapters_updated_at BEFORE UPDATE ON chapters
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------
-- Сид первого суперадмина (пароль задаётся отдельным скриптом,
-- см. scripts/seed-superadmin.js — никогда не хардкодь хэш здесь)
-- ---------------------------------------------------------
-- INSERT INTO users (email, password_hash, role, display_name)
-- VALUES ('owner@example.com', '<bcrypt-hash>', 'superadmin', 'Owner');
