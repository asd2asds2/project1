// Автосоздание таблиц отделов / шаблонов / годов плана при старте сервера
// (так же, как раньше создавалась plan_manual_items — вручную гонять SQL не нужно).
// Всё идемпотентно: повторный запуск ничего не ломает и не дублирует.
const pool = require('./db');

// Базовый шаблон: из каких разделов состоит план года.
// [kind, quarter, label, icon, sort_order]; {year} подставляется при создании года.
const BASE_ITEMS = [
  ['home', null, 'Главная', '📊', 1],
  ['branches', null, 'Филиалы', '🏬', 2],
  ['annual', null, 'Годовой план {year}', '🗓️', 3],
  ['quarter', 1, '1 квартал', '1️⃣', 4],
  ['quarter', 2, '2 квартал', '2️⃣', 5],
  ['quarter', 3, '3 квартал', '3️⃣', 6],
  ['quarter', 4, '4 квартал', '4️⃣', 7],
];

async function init() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    // Чтобы два запущенных экземпляра backend не гонялись друг с другом
    await c.query('SELECT pg_advisory_xact_lock(727001)');

    await c.query(`CREATE TABLE IF NOT EXISTS departments (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);

    await c.query(`CREATE TABLE IF NOT EXISTS plan_templates (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);

    await c.query(`CREATE TABLE IF NOT EXISTS plan_template_items (
      id SERIAL PRIMARY KEY,
      template_id INT NOT NULL REFERENCES plan_templates(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('home','branches','annual','quarter')),
      quarter INT CHECK (quarter BETWEEN 1 AND 4),
      label TEXT NOT NULL,
      icon TEXT,
      sort_order INT NOT NULL DEFAULT 0
    )`);

    await c.query(`CREATE TABLE IF NOT EXISTS plan_years (
      id SERIAL PRIMARY KEY,
      year INT NOT NULL,
      department_id INT NOT NULL REFERENCES departments(id),
      template_id INT REFERENCES plan_templates(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_by INT REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (department_id, year)
    )`);

    // Снимок разделов шаблона на момент создания года: позже правка шаблона
    // не меняет уже созданные годы.
    await c.query(`CREATE TABLE IF NOT EXISTS plan_year_items (
      id SERIAL PRIMARY KEY,
      plan_year_id INT NOT NULL REFERENCES plan_years(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      quarter INT,
      label TEXT NOT NULL,
      icon TEXT,
      sort_order INT NOT NULL DEFAULT 0
    )`);

    // Пока только IT-отдел. Остальные отделы позже добавляются обычным INSERT.
    await c.query(
      `INSERT INTO departments (code, name, sort_order) VALUES ('it', 'IT-отдел', 1)
       ON CONFLICT (code) DO NOTHING`
    );

    // Базовый шаблон
    let t = await c.query(`SELECT id FROM plan_templates WHERE code = 'base'`);
    if (!t.rows[0]) {
      t = await c.query(
        `INSERT INTO plan_templates (code, name, description, is_default)
         VALUES ('base', 'Базовый план', 'Главная, Филиалы, Годовой план, 1–4 квартал', TRUE)
         RETURNING id`
      );
      for (const [kind, quarter, label, icon, sort] of BASE_ITEMS) {
        await c.query(
          `INSERT INTO plan_template_items (template_id, kind, quarter, label, icon, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [t.rows[0].id, kind, quarter, label, icon, sort]
        );
      }
    }

    // Годы, по которым в базе уже есть данные (у вас это 2026), оформляем как
    // созданные планы IT-отдела по базовому шаблону.
    await c.query(
      `INSERT INTO plan_years (year, department_id, template_id)
       SELECT y.year, d.id, t.id
       FROM (SELECT DISTINCT year FROM purchases UNION SELECT DISTINCT year FROM plan_targets) y
       CROSS JOIN (SELECT id FROM departments WHERE code = 'it') d
       CROSS JOIN (SELECT id FROM plan_templates WHERE code = 'base') t
       ON CONFLICT (department_id, year) DO NOTHING`
    );
    await c.query(
      `INSERT INTO plan_year_items (plan_year_id, kind, quarter, label, icon, sort_order)
       SELECT py.id, i.kind, i.quarter, REPLACE(i.label, '{year}', py.year::text), i.icon, i.sort_order
       FROM plan_years py
       JOIN plan_template_items i ON i.template_id = py.template_id
       WHERE NOT EXISTS (SELECT 1 FROM plan_year_items x WHERE x.plan_year_id = py.id)`
    );

    await c.query('COMMIT');
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    c.release();
  }
}

// Промис, который роуты ждут перед первым запросом.
const ready = init().catch((e) => {
  console.error('initYears:', e.message);
  throw e;
});
ready.catch(() => {}); // чтобы отказ не валил процесс как unhandled rejection

module.exports = { ready };
