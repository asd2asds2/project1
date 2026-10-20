const { Pool, types } = require('pg');

// Колонки типа DATE (OID 1082) отдаём как строку "ГГГГ-ММ-ДД", а не как JS Date.
// Иначе pg превращает дату в полночь по локальному времени сервера, а JSON отправляет её
// в UTC — и дата уезжает на сутки назад (15.07 -> 14.07), если часовой пояс сервера не UTC.
// Каждое открытие и сохранение закупки сдвигало бы даты ещё на день.
types.setTypeParser(1082, (v) => v);

// DATABASE_URL приходит из docker-compose.yml (переменная окружения контейнера)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = pool;
