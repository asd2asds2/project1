const { Pool } = require('pg');

// DATABASE_URL приходит из docker-compose.yml (переменная окружения контейнера)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = pool;
