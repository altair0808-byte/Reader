const jwt = require('jsonwebtoken');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET не задан в переменных окружения');
}

/**
 * Базовая проверка: пользователь аутентифицирован.
 * Достаёт актуальную роль из БД (а не только из токена),
 * чтобы разжалование/повышение применялось мгновенно,
 * а не только после переиздания токена.
 */
async function authenticate(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const token = header.slice('Bearer '.length);

    let payload;
    try {
        payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return res.status(401).json({ error: 'Невалидный или истёкший токен' });
    }

    try {
        const { rows } = await db.query(
            'SELECT id, email, role, display_name, reader_settings FROM users WHERE id = $1',
            [payload.sub]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }

        req.user = rows[0]; // { id, email, role, display_name, reader_settings }
        next();
    } catch (err) {
        next(err);
    }
}

/**
 * Фабрика middleware: пускает только пользователей с одной из
 * перечисленных ролей.
 *
 * requireRole('admin', 'superadmin') -> админка книг
 * requireRole('superadmin')          -> управление ролями
 */
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Требуется авторизация' });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Недостаточно прав',
                required: allowedRoles,
                current: req.user.role,
            });
        }
        next();
    };
}

const requireSuperAdmin = requireRole('superadmin');
const requireAdminOrAbove = requireRole('admin', 'superadmin');

module.exports = {
    authenticate,
    requireRole,
    requireSuperAdmin,
    requireAdminOrAbove,
};
