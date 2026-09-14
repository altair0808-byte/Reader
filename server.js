require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());

app.use('/api/books', require('./books'));
app.use('/api/admin', require('./admin'));
app.use('/api/users', require('./users'));
// app.use('/api/auth', require('./authRoutes')); // логин/регистрация — добавим отдельно

// Отдаём HTML-страницы читалки и админ-панели явными роутами
// (не через express.static, чтобы не раздавать весь репозиторий целиком).
app.get('/reader.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'reader.html'));
});
app.get('/admin-users.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-users.html'));
});

// Централизованная обработка ошибок
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
