const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Supabase (в т.ч. через connection pooler) требует SSL.
    // rejectUnauthorized: false — принимаем сертификат пула Supabase
    // без полной цепочки проверки (стандартная практика для managed Postgres
    // с самоподписанным/промежуточным сертификатом на стороне провайдера).
    ssl: { rejectUnauthorized: false },
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool,
};
