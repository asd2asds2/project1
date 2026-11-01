-- Полная миграция для объединённого проекта.
-- Выполнять в psql (Containers → myapp_postgres → Console → /bin/bash → psql -U appuser -d appdb),
-- вставляя блоки по одному.
--
-- Блоки идемпотентны (IF NOT EXISTS), поэтому если что-то из этого у вас уже
-- применялось раньше — повторный запуск ничего не сломает.

-- ---------------------------------------------------------------------------
-- 1. Файлы служебок (таблица documents)
-- Если у вас эта таблица уже была создана раньше (см. README-INTEGRATION.md,
-- где сказано, что таблица documents уже существует) — СНАЧАЛА проверьте её
-- реальную структуру командой \d documents и сверьте с колонками ниже
-- (entity_type, entity_id, file_name, stored_name, file_size, mime_type,
-- description, uploaded_by, uploaded_at). Если структура отличается —
-- либо переименуйте колонки под routes/documents.js, либо наоборот.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(30) NOT NULL,
    entity_id INTEGER NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type VARCHAR(255),
    description TEXT,
    uploaded_by INTEGER REFERENCES users(id),
    uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- 2. Закупка на несколько филиалов с разными суммами
-- ---------------------------------------------------------------------------
ALTER TABLE purchases ALTER COLUMN branch_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS purchase_branch_shares (
    id SERIAL PRIMARY KEY,
    purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    UNIQUE (purchase_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_purchase_shares_purchase ON purchase_branch_shares(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_shares_branch ON purchase_branch_shares(branch_id);

-- Проверка:
-- \d documents           -- таблица файлов
-- \d purchases           -- branch_id должен быть nullable
-- \dt                    -- purchase_branch_shares должна быть в списке

-- ---------------------------------------------------------------------------
-- 3. Утверждение плана + журнал импортов (проверка дублей)
-- Эти таблицы backend создаёт сам при запуске (initApprovals.js), вручную
-- выполнять НЕ обязательно. Блок оставлен для справки / ручного применения.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plan_approvals (
    id SERIAL PRIMARY KEY,
    year INT NOT NULL,
    version INT NOT NULL,
    note TEXT,
    items_count INT NOT NULL DEFAULT 0,
    total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    approved_by INT REFERENCES users(id),
    approved_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (year, version)
);
CREATE TABLE IF NOT EXISTS plan_approval_items (
    id SERIAL PRIMARY KEY,
    approval_id INT NOT NULL REFERENCES plan_approvals(id) ON DELETE CASCADE,
    purchase_id INT NOT NULL,
    ord INT NOT NULL DEFAULT 0,
    data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_approval_items_approval ON plan_approval_items(approval_id);
CREATE TABLE IF NOT EXISTS plan_imports (
    id SERIAL PRIMARY KEY,
    year INT NOT NULL,
    file_hash TEXT NOT NULL,
    file_name TEXT,
    created_count INT NOT NULL DEFAULT 0,
    skipped_duplicates INT NOT NULL DEFAULT 0,
    imported_by INT REFERENCES users(id),
    imported_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_plan_imports_hash ON plan_imports(year, file_hash);

-- ---------------------------------------------------------------------------
-- 4. Исполнение закупок (отчёт). Backend добавляет эти колонки сам при старте
-- (initApprovals.js) — вручную выполнять не обязательно.
-- ---------------------------------------------------------------------------
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS contract_amount NUMERIC(15,2) CHECK (contract_amount IS NULL OR contract_amount >= 0),
  ADD COLUMN IF NOT EXISTS executed_at DATE,
  ADD COLUMN IF NOT EXISTS contract_no TEXT,
  ADD COLUMN IF NOT EXISTS supplier TEXT,
  ADD COLUMN IF NOT EXISTS is_unplanned BOOLEAN NOT NULL DEFAULT FALSE;
