require('dotenv').config();
const express = require('express');
const path = require('path');
const pool = require('./db');

const app = express();

app.use(express.json());

// Подключаем только существующие роуты
app.use('/api/auth', require('./authRoutes'));
app.use('/api/books', require('./books'));

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
