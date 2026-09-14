const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Для защищенных соединений (например, Supabase) часто требуется SSL:
  ssl: { rejectUnauthorized: false }
});

// Функция автоматического создания таблиц при старте
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
    console.log(" Таблица 'users' успешно проверена/создана");
  } catch (err) {
    console.error("Ошибка при создании таблиц:", err);
  }
}

// Запускаем инициализацию перед стартом сервера
initDB().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
});
