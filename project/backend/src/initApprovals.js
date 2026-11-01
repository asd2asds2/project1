// Автосоздание таблиц утверждения плана и журнала импортов (идемпотентно, как initYears.js).
const pool = require('./db');

async function init() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(727002)');

    // Утверждённая версия плана года: неизменяемый снимок.
    await c.query(`CREATE TABLE IF NOT EXISTS plan_approvals (
      id SERIAL PRIMARY KEY,
      year INT NOT NULL,
      version INT NOT NULL,
      note TEXT,
      items_count INT NOT NULL DEFAULT 0,
      total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
      approved_by INT REFERENCES users(id),
      approved_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (year, version)
    )`);

    await c.query(`CREATE TABLE IF NOT EXISTS plan_approval_items (
      id SERIAL PRIMARY KEY,
      approval_id INT NOT NULL REFERENCES plan_approvals(id) ON DELETE CASCADE,
      purchase_id INT NOT NULL,
      ord INT NOT NULL DEFAULT 0,
      data JSONB NOT NULL
    )`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_approval_items_approval ON plan_approval_items(approval_id)`);

    // Защита на уровне БД: строки снимка нельзя менять и удалять (кроме каскада при удалении самой версии).
    await c.query(`CREATE OR REPLACE FUNCTION plan_approval_items_immutable() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'Утверждённый план нельзя изменять';
      END; $$ LANGUAGE plpgsql`);
    await c.query(`DROP TRIGGER IF EXISTS trg_approval_items_no_update ON plan_approval_items`);
    await c.query(`CREATE TRIGGER trg_approval_items_no_update
      BEFORE UPDATE ON plan_approval_items FOR EACH ROW EXECUTE FUNCTION plan_approval_items_immutable()`);

    // Журнал импортов Excel: по хэшу файла видно, что такой файл уже загружали.
    await c.query(`CREATE TABLE IF NOT EXISTS plan_imports (
      id SERIAL PRIMARY KEY,
      year INT NOT NULL,
      file_hash TEXT NOT NULL,
      file_name TEXT,
      created_count INT NOT NULL DEFAULT 0,
      skipped_duplicates INT NOT NULL DEFAULT 0,
      imported_by INT REFERENCES users(id),
      imported_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_plan_imports_hash ON plan_imports(year, file_hash)`);

    await c.query('COMMIT');
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('initApprovals error:', err);
    throw err;
  } finally {
    c.release();
  }
}

const ready = init();
ready.catch(() => {});

module.exports = { ready };
