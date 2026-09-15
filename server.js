require('dotenv').config();
const express = require('express');
const path = require('path');
const pool = require('./db');

const app = express();

app.use(express.json());

// Подключаем только существующие роуты
app.use('/api/auth', require('./authRoutes'));
app.use('/api/books', require('./books'));
app.use('/api/users', require('./users'));

// Функция автоматического создания таблиц
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(255) UNIQUE NOT NULL,
          email VARCHAR(255),
          display_name VARCHAR(255),
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(50) DEFAULT 'reader',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reader_settings JSONB DEFAULT '{}';
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS books (
          id SERIAL PRIMARY KEY,
          user_id INT REFERENCES users(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL,
          genre VARCHAR(100),
          prompt TEXT,
          content TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Колонки, которые ожидает bookGenerator.js (генерация по главам,
    // статус, веб-обогащение фактами) — добавляем, если их ещё нет,
    // чтобы не потерять уже существующие книги.
    await pool.query(`
      ALTER TABLE books ADD COLUMN IF NOT EXISTS short_description TEXT;
      ALTER TABLE books ADD COLUMN IF NOT EXISTS total_chapters_plan INT DEFAULT 5;
      ALTER TABLE books ADD COLUMN IF NOT EXISTS use_web_enrichment BOOLEAN DEFAULT FALSE;
      ALTER TABLE books ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'draft';
      ALTER TABLE books ADD COLUMN IF NOT EXISTS enrichment_sources JSONB DEFAULT '[]';
      ALTER TABLE books ADD COLUMN IF NOT EXISTS generation_error TEXT;
    `);

    // Главы книги — генерируются и сохраняются по одной через bookGenerator.js
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chapters (
          id SERIAL PRIMARY KEY,
          book_id INT REFERENCES books(id) ON DELETE CASCADE,
          chapter_number INT NOT NULL,
          title VARCHAR(255),
          content TEXT,
          summary TEXT,
          word_count INT,
          status VARCHAR(50) DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (book_id, chapter_number)
      );
    `);

    console.log("✅ База данных успешно инициализирована");
  } catch (err) {
    console.error("❌ Ошибка при инициализации БД:", err);
  }
}

// Статичный файл клиента
app.get('/auth-client.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'auth-client.js'));
});

// HTML-страницы
const pages = ['index', 'login', 'register', 'reader', 'create-book'];
pages.forEach((name) => {
    const routePath = name === 'index' ? '/' : `/${name}.html`;
    app.get(routePath, (req, res) => {
        res.sendFile(path.join(__dirname, `${name}.html`));
    });
});

// Централизованная обработка ошибок
app.use((err, req, res, next) => {
    console.error("❌ Глобальная ошибка:", err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

const PORT = process.env.PORT || 3000;

// Сначала инициализируем базу, потом запускаем сервер
initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Сервер успешно запущен на порту ${PORT}`);
    });
});
