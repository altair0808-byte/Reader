require('dotenv').config();
const express = require('express');
const path = require('path');
const pool = require('./db');

const app = express();

// Функция автоматического создания и обновления таблицы пользователей
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

    console.log("Таблица 'users' успешно проверена/обновлена");
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
async function initDB() {
  try {
    // Создаем таблицу пользователей
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

    // <-- ВСТАВЛЯЕМ СЮДА создание таблицы для книг -->
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

    console.log("Таблицы 'users' и 'books' успешно проверены/обновлены");
  } catch (err) {
    console.error("Ошибка при создании таблиц:", err);
  }
}
