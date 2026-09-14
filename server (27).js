require('dotenv').config();
const express = require('express');
const app = express();

app.use(express.json());
app.use(express.static('public'));

app.use('/api/books', require('./routes/books'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/users', require('./routes/users'));
// app.use('/api/auth', require('./routes/auth')); // логин/регистрация — по образу и подобию above

// Централизованная обработка ошибок
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
