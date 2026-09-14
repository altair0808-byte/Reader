require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();

// Настройка пула подключения к базе данных
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Функция автоматического создания таблицы пользователей при старте
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(50) DEFAULT 'reader',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Таблица 'users' успешно проверена/создана");
  } catch (err) {
    console.error("Ошибка при создании таблиц:", err);
  }
}

app.use(express.json());

app.use('/api/auth', require('./authRoutes'));
app.use('/api/books', require('./books'));
app.use('/api/admin', require('./admin'));
app.use('/api/users', require('./users'));

// Статичный скрипт для клиента
app.get('/auth-client.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'auth-client.js'));
});

// HTML-страницы
const pages = ['index', 'login', 'register', 'reader', 'admin-users', 'create-book'];
pages.forEach((name) => {
    const routePath = name === 'index' ? '/' : `/${name}.html`;
    app.get(routePath, (req, res) => {
        res.sendFile(path.join(__dirname, `${name}.html`));
    });
});

// Централизованная обработка ошибок
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

const PORT = process.env.PORT || 3000;

// Инициализируем БД и запускаем сервер
initDB().then(() => {
    app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
});
