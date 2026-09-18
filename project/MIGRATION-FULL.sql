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
