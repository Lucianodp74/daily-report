const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

// query() legata al pool — destructuring non perde il contesto this
const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
