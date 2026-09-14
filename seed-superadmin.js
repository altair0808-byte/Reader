/**
 * Разовый скрипт для создания первого суперадмина.
 * Публичного API-эндпоинта для этого нет намеренно — иначе любой
 * зарегистрированный пользователь мог бы сам себя назначить суперадмином.
 *
 * Запуск (локально или через Render Shell, там где доступен DATABASE_URL):
 *   node seed-superadmin.js owner@example.com "СложныйПароль123"
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

async function main() {
    const [, , email, password, displayName] = process.argv;

    if (!email || !password) {
        console.error('Использование: node seed-superadmin.js <email> <пароль> [имя]');
        process.exit(1);
    }
    if (password.length < 8) {
        console.error('Пароль должен быть не короче 8 символов');
        process.exit(1);
    }

    const { rows: existingSuperadmin } = await db.query(
        "SELECT id, email FROM users WHERE role = 'superadmin'"
    );
    if (existingSuperadmin.length > 0) {
        console.error(
            `Суперадмин уже существует: ${existingSuperadmin[0].email}. ` +
            `Если нужно сменить — сначала вручную понизь его роль в БД.`
        );
        process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { rows: existingUser } = await db.query('SELECT id FROM users WHERE email = $1', [
        email.toLowerCase(),
    ]);

    let user;
    if (existingUser.length > 0) {
        // Пользователь уже регистрировался как reader — повышаем его же аккаунт
        const { rows } = await db.query(
            `UPDATE users SET role = 'superadmin', password_hash = $1 WHERE id = $2 RETURNING *`,
            [passwordHash, existingUser[0].id]
        );
        user = rows[0];
    } else {
        const { rows } = await db.query(
            `INSERT INTO users (email, password_hash, display_name, role)
             VALUES ($1, $2, $3, 'superadmin')
             RETURNING *`,
            [email.toLowerCase(), passwordHash, displayName || null]
        );
        user = rows[0];
    }

    console.log(`Готово: ${user.email} теперь суперадмин.`);
    process.exit(0);
}

main().catch((err) => {
    console.error('Ошибка:', err.message);
    process.exit(1);
});
