require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());

app.use('/api/auth', require('./authRoutes'));
app.use('/api/books', require('./books'));
app.use('/api/admin', require('./admin'));
app.use('/api/users', require('./users'));

// Статичный JS-модуль для работы с токеном авторизации на клиенте
app.get('/auth-client.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'auth-client.js'));
});

// HTML-страницы — явными роутами (не через express.static, чтобы
// не отдавать наружу весь репозиторий целиком, включая server.js и т.п.)
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
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
