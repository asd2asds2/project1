const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Тот же volume, что и у documents.js (см. docker-compose.yml, uploads_data:/app/uploads) —
// нужен здесь, чтобы при полном удалении закупки подчистить и её файлы служебок с диска.
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');

// Файл для импорта нужен только на время разбора — в памяти, на диск не пишем.
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.use(requireAuth);

// ---------------------------------------------------------------------------
// Сводка для главной страницы
// ---------------------------------------------------------------------------
router.get('/summary', async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();

  try {
    const byQuarter = await pool.query(
      `SELECT quarter, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS items
       FROM purchases
       WHERE year = $1 AND status <> 'cancelled'
       GROUP BY quarter
       ORDER BY quarter`,
      [year]
    );

    // Суммы по филиалам — учитываем и старые закупки с одним branch_id,
    // и новые с разбивкой в purchase_branch_shares (закупка может попасть
    // в обе категории быть не может — branch_id и shares взаимоисключающие).
    const byBranch = await pool.query(
      `WITH branch_amounts AS (
         SELECT p.branch_id, p.amount
         FROM purchases p
         WHERE p.year = $1 AND p.status <> 'cancelled' AND p.branch_id IS NOT NULL
         UNION ALL
         SELECT s.branch_id, s.amount
         FROM purchase_branch_shares s
         JOIN purchases p ON p.id = s.purchase_id
         WHERE p.year = $1 AND p.status <> 'cancelled'
       )
       SELECT b.id AS branch_id, b.name AS branch_name, COALESCE(SUM(ba.amount), 0) AS total
       FROM branches b
       LEFT JOIN branch_amounts ba ON ba.branch_id = b.id
       WHERE b.is_active = true
       GROUP BY b.id, b.name
       ORDER BY b.name`,
      [year]
    );

    const pendingReview = await pool.query(
      `SELECT COUNT(*) AS cnt FROM purchases
       WHERE year = $1 AND source = 'branch' AND reviewed_at IS NULL AND status <> 'cancelled'`,
      [year]
    );

    res.json({
      status: 'ok',
      byQuarter: byQuarter.rows,
      byBranch: byBranch.rows,
      pendingReview: Number(pendingReview.rows[0].cnt),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// ---------------------------------------------------------------------------
// Список закупок с фильтрами: year (обязателен), quarter, pending=1, search
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const { quarter, pending, search } = req.query;

  const conditions = ['p.year = $1'];
  const values = [year];
  let idx = 2;

  if (quarter) {
    conditions.push(`p.quarter = $${idx++}`);
    values.push(Number(quarter));
  }
  if (pending === '1') {
    conditions.push(`p.source = 'branch' AND p.reviewed_at IS NULL`);
  }
  if (search) {
    conditions.push(
      `(p.name ILIKE $${idx} OR p.okpd2 ILIKE $${idx} OR b.name ILIKE $${idx}
        OR EXISTS (
          SELECT 1 FROM purchase_branch_shares s2
          JOIN branches bb2 ON bb2.id = s2.branch_id
          WHERE s2.purchase_id = p.id AND bb2.name ILIKE $${idx}
        ))`
    );
    values.push(`%${search}%`);
    idx++;
  }

  try {
    const result = await pool.query(
      `SELECT p.*,
              b.name AS branch_name_legacy,
              COALESCE(
                (SELECT json_agg(json_build_object('branch_id', bb.id, 'branch_name', bb.name, 'amount', s.amount) ORDER BY bb.name)
                 FROM purchase_branch_shares s
                 JOIN branches bb ON bb.id = s.branch_id
                 WHERE s.purchase_id = p.id),
                '[]'
              ) AS shares,
              ROW_NUMBER() OVER (PARTITION BY p.quarter ORDER BY p.created_at) AS item_no
       FROM purchases p
       LEFT JOIN branches b ON b.id = p.branch_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.quarter, p.created_at`,
      values
    );

    const purchases = result.rows.map((p) => {
      const { branch_name_legacy, ...rest } = p;
      const branchName =
        rest.shares && rest.shares.length > 0
          ? rest.shares.map((s) => s.branch_name).join(', ')
          : branch_name_legacy || '—';
      return { ...rest, branch_name: branchName };
    });

    res.json({ status: 'ok', purchases });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// ---------------------------------------------------------------------------
// Создание закупки — всегда через "доли" по филиалам (shares), даже если
// филиал один. admin/financier (центр) или branch_editor (филиал, требует
// последующей проверки центром).
// Тело: { year, quarter, name, product_group, method, justification,
//         tz_date, notice_date, deadline, okpd2, comment,
//         shares: [{ branch_id, amount }, ...] }
// ---------------------------------------------------------------------------
router.post('/', requireRole('admin', 'financier', 'branch_editor'), async (req, res) => {
  const {
    year, quarter, name, product_group, method,
    justification, tz_date, notice_date, deadline, okpd2, comment, shares,
  } = req.body;

  if (!year || !quarter || !name) {
    return res.status(400).json({ status: 'error', message: 'Заполните обязательные поля' });
  }

  const cleanShares = Array.isArray(shares)
    ? shares
        .map((s) => ({ branch_id: Number(s.branch_id), amount: Number(s.amount) }))
        .filter((s) => s.branch_id && s.amount > 0)
    : [];

  if (cleanShares.length === 0) {
    return res.status(400).json({ status: 'error', message: 'Укажите хотя бы один филиал и сумму' });
  }

  const amountTotal = cleanShares.reduce((sum, s) => sum + s.amount, 0);
  const source = req.user.role === 'branch_editor' ? 'branch' : 'center';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const purchaseResult = await client.query(
      `INSERT INTO purchases
        (year, quarter, branch_id, name, product_group, method, justification,
         tz_date, notice_date, amount, deadline, okpd2, comment, source, created_by)
       VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        year, quarter, name, product_group || null, method || null,
        justification || null, tz_date || null, notice_date || null, amountTotal,
        deadline || null, okpd2 || null, comment || null, source, req.user.userId,
      ]
    );
    const purchaseId = purchaseResult.rows[0].id;

    for (const s of cleanShares) {
      await client.query(
        `INSERT INTO purchase_branch_shares (purchase_id, branch_id, amount) VALUES ($1,$2,$3)`,
        [purchaseId, s.branch_id, s.amount]
      );
    }

    await client.query('COMMIT');

    const full = await fetchPurchaseWithShares(purchaseId);
    res.json({ status: 'ok', purchase: full });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// Редактирование закупки — полностью заменяет набор долей по филиалам.
// Если правит филиал (branch_editor) — сбрасываем reviewed_at.
// ---------------------------------------------------------------------------
router.put('/:id', requireRole('admin', 'financier', 'branch_editor'), async (req, res) => {
  const { id } = req.params;
  const {
    quarter, name, product_group, method, justification,
    tz_date, notice_date, deadline, okpd2, comment, shares,
  } = req.body;

  const cleanShares = Array.isArray(shares)
    ? shares
        .map((s) => ({ branch_id: Number(s.branch_id), amount: Number(s.amount) }))
        .filter((s) => s.branch_id && s.amount > 0)
    : [];

  if (cleanShares.length === 0) {
    return res.status(400).json({ status: 'error', message: 'Укажите хотя бы один филиал и сумму' });
  }

  const amountTotal = cleanShares.reduce((sum, s) => sum + s.amount, 0);
  const resetReview = req.user.role === 'branch_editor';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updateResult = await client.query(
      `UPDATE purchases SET
         quarter = COALESCE($1, quarter),
         branch_id = NULL,
         name = COALESCE($2, name),
         product_group = $3,
         method = $4,
         justification = $5,
         tz_date = $6,
         notice_date = $7,
         amount = $8,
         deadline = $9,
         okpd2 = $10,
         comment = $11,
         reviewed_at = CASE WHEN $12 THEN NULL ELSE reviewed_at END,
         updated_at = now()
       WHERE id = $13
       RETURNING id`,
      [
        quarter, name, product_group || null, method || null, justification || null,
        tz_date || null, notice_date || null, amountTotal, deadline || null,
        okpd2 || null, comment || null, resetReview, id,
      ]
    );

    if (!updateResult.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Закупка не найдена' });
    }

    await client.query('DELETE FROM purchase_branch_shares WHERE purchase_id = $1', [id]);
    for (const s of cleanShares) {
      await client.query(
        `INSERT INTO purchase_branch_shares (purchase_id, branch_id, amount) VALUES ($1,$2,$3)`,
        [id, s.branch_id, s.amount]
      );
    }

    await client.query('COMMIT');

    const full = await fetchPurchaseWithShares(id);
    res.json({ status: 'ok', purchase: full });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// Отметить как просмотренное центром (снимает жёлтую подсветку)
router.post('/:id/review', requireRole('admin', 'financier'), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE purchases SET reviewed_at = now(), updated_at = now() WHERE id = $1 RETURNING id`,
      [id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ status: 'error', message: 'Закупка не найдена' });
    }
    res.json({ status: 'ok', purchase: await fetchPurchaseWithShares(id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// Перенос закупки в другой квартал
router.post('/:id/transfer', requireRole('admin', 'financier'), async (req, res) => {
  const { id } = req.params;
  const { to_quarter, reason } = req.body;

  if (!to_quarter || !reason) {
    return res.status(400).json({ status: 'error', message: 'Укажите квартал и причину переноса' });
  }

  try {
    const result = await pool.query(
      `UPDATE purchases SET
         transfer_note = COALESCE(transfer_note || '; ', '')
           || 'Перенесено из кв. ' || quarter || ' в кв. ' || $1 || ': ' || $2,
         quarter = $1,
         updated_at = now()
       WHERE id = $3
       RETURNING id`,
      [Number(to_quarter), reason, id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ status: 'error', message: 'Закупка не найдена' });
    }
    res.json({ status: 'ok', purchase: await fetchPurchaseWithShares(id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// Отмена закупки
router.post('/:id/cancel', requireRole('admin', 'financier'), async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({ status: 'error', message: 'Укажите причину отмены' });
  }

  try {
    const result = await pool.query(
      `UPDATE purchases SET status = 'cancelled', cancel_reason = $1, updated_at = now()
       WHERE id = $2
       RETURNING id`,
      [reason, id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ status: 'error', message: 'Закупка не найдена' });
    }
    res.json({ status: 'ok', purchase: await fetchPurchaseWithShares(id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// ---------------------------------------------------------------------------
// Полное удаление закупки — только если она уже отменена (status = 'cancelled').
// Заодно удаляет её файлы служебок (и метаданные, и сами файлы с диска).
// purchase_branch_shares / purchase_cancellations / purchase_transfers удалятся
// автоматически через ON DELETE CASCADE.
// ---------------------------------------------------------------------------
router.delete('/:id', requireRole('admin', 'financier'), async (req, res) => {
  const { id } = req.params;

  try {
    const check = await pool.query('SELECT status FROM purchases WHERE id = $1', [id]);

    if (!check.rows[0]) {
      return res.status(404).json({ status: 'error', message: 'Закупка не найдена' });
    }
    if (check.rows[0].status !== 'cancelled') {
      return res.status(400).json({
        status: 'error',
        message: 'Удалить можно только отменённую закупку — сначала отмените её',
      });
    }

    const docs = await pool.query(
      `SELECT file_path FROM documents WHERE entity_type = 'purchase' AND entity_id = $1`,
      [id]
    );

    await pool.query(`DELETE FROM documents WHERE entity_type = 'purchase' AND entity_id = $1`, [id]);
    await pool.query('DELETE FROM purchases WHERE id = $1', [id]);

    for (const doc of docs.rows) {
      fs.unlink(path.join(UPLOAD_DIR, doc.file_path), () => {});
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// ---------------------------------------------------------------------------
// Импорт плана из Excel (файлы от филиалов/центра — формат "План закупочных
// мероприятий"). multipart/form-data: file, year, quarter (необязательно —
// нужен только если в файле нет разделов "1 квартал"/"2 квартал"/...).
// ---------------------------------------------------------------------------
router.post('/import', requireRole('admin', 'financier'), (req, res, next) => {
  memoryUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ status: 'error', message: 'Файл слишком большой (макс. 20 МБ)' });
      }
      console.error(err);
      return res.status(400).json({ status: 'error', message: 'Не удалось прочитать файл' });
    }
    next();
  });
}, async (req, res) => {
  const year = Number(req.body.year);
  const quarterOverride = req.body.quarter ? Number(req.body.quarter) : null;

  if (!req.file) {
    return res.status(400).json({ status: 'error', message: 'Файл не передан' });
  }
  if (!year) {
    return res.status(400).json({ status: 'error', message: 'Укажите год' });
  }

  let groups;
  try {
    groups = parsePlanSheet(req.file.buffer, quarterOverride);
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }

  if (groups.length === 0) {
    return res.status(400).json({ status: 'error', message: 'В файле не найдено ни одной строки с закупкой' });
  }

  let branchRows;
  try {
    branchRows = (await pool.query('SELECT id, name FROM branches WHERE is_active = true')).rows;
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }

  const norm = (s) => String(s || '').trim().toLowerCase();
  const branchByName = new Map(branchRows.map((b) => [norm(b.name), b.id]));

  const unmatchedBranches = new Set();
  const skipped = [];
  let created = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const g of groups) {
      if (!g.quarter) {
        skipped.push(`«${g.name}»: не удалось определить квартал (нет разделов "N квартал" в файле и не указан квартал по умолчанию)`);
        continue;
      }

      const resolvedShares = [];
      for (const s of g.shares) {
        const branchId = branchByName.get(norm(s.branchNameRaw));
        if (!branchId) {
          unmatchedBranches.add(s.branchNameRaw);
          continue;
        }
        resolvedShares.push({ branch_id: branchId, amount: s.amount });
      }

      if (resolvedShares.length === 0) {
        skipped.push(`«${g.name}»: филиал(ы) не найдены в системе (${g.shares.map((s) => s.branchNameRaw).join(', ')})`);
        continue;
      }

      const amountTotal = resolvedShares.reduce((sum, s) => sum + s.amount, 0);

      const purchaseResult = await client.query(
        `INSERT INTO purchases
          (year, quarter, branch_id, name, product_group, method, justification,
           tz_date, notice_date, amount, deadline, okpd2, comment, source, created_by)
         VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL,'center',$12)
         RETURNING id`,
        [
          year, g.quarter, g.name, g.product_group, g.method, g.justification,
          g.tz_date, g.notice_date, amountTotal, g.deadline, g.okpd2, req.user.userId,
        ]
      );
      const purchaseId = purchaseResult.rows[0].id;

      for (const s of resolvedShares) {
        await client.query(
          `INSERT INTO purchase_branch_shares (purchase_id, branch_id, amount) VALUES ($1,$2,$3)`,
          [purchaseId, s.branch_id, s.amount]
        );
      }

      created += 1;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ status: 'error', message: 'Ошибка при импорте: ' + err.message });
  } finally {
    client.release();
  }

  res.json({
    status: 'ok',
    created,
    skipped,
    unmatchedBranches: [...unmatchedBranches],
  });
});

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

async function fetchPurchaseWithShares(id) {
  const result = await pool.query(
    `SELECT p.*,
            b.name AS branch_name_legacy,
            COALESCE(
              (SELECT json_agg(json_build_object('branch_id', bb.id, 'branch_name', bb.name, 'amount', s.amount) ORDER BY bb.name)
               FROM purchase_branch_shares s
               JOIN branches bb ON bb.id = s.branch_id
               WHERE s.purchase_id = p.id),
              '[]'
            ) AS shares
     FROM purchases p
     LEFT JOIN branches b ON b.id = p.branch_id
     WHERE p.id = $1`,
    [id]
  );
  const p = result.rows[0];
  if (!p) return null;
  const { branch_name_legacy, ...rest } = p;
  const branchName =
    rest.shares && rest.shares.length > 0
      ? rest.shares.map((s) => s.branch_name).join(', ')
      : branch_name_legacy || '—';
  return { ...rest, branch_name: branchName };
}

// Разбор листа "План закупочных мероприятий" в список групп-закупок.
// Каждая группа — одна закупка, возможно, с несколькими филиалами (shares).
//
// Логика: строка со числом в колонке "№ п/п" начинает новую закупку; строки
// без номера, но с суммой и филиалом — это ещё один филиал ТОЙ ЖЕ закупки
// (в исходных файлах так оформлены закупки на несколько филиалов).
// Строки "N квартал" переключают текущий квартал для следующих строк.
// Строки "Итого..." игнорируются.
function parsePlanSheet(buffer, quarterOverride) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

  let headerRowIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some((c) => String(c).replace(/\s+/g, '').toLowerCase().includes('№п/п'))) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) {
    throw new Error('Не найдена строка заголовка таблицы (ожидается колонка "№ п/п")');
  }
  const headerRow = rows[headerRowIdx];

  const findCol = (patterns) => {
    for (let c = 0; c < headerRow.length; c++) {
      const cellText = String(headerRow[c] || '').toLowerCase();
      if (patterns.some((p) => cellText.includes(p))) return c;
    }
    return -1;
  };

  const col = {
    num: findCol(['№ п/п', '№п/п', '№']),
    name: findCol(['наименование']),
    productGroup: findCol(['группа продукции', 'асгор']),
    method: findCol(['способ размещения']),
    justification: findCol(['обоснование']),
    tzDate: findCol(['подачи тз', 'подачи спецификации', 'родачи тз']),
    noticeDate: findCol(['размещения извещения']),
    amount: findCol(['нмц']),
    branch: findCol(['потребител']),
    deadline: findCol(['срок исполнения']),
    okpd2: findCol(['окпд']),
  };

  if (col.name === -1 || col.amount === -1 || col.branch === -1) {
    throw new Error('Не удалось распознать колонки листа (нужны минимум "Наименование", "НМЦ" и "Потребители")');
  }

  const text = (v) => (v === null || v === undefined ? '' : String(v).trim());

  const parseAmount = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const excelDateToSQL = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') {
      const d = XLSX.SSF.parse_date_code(v);
      if (d && d.y) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
      return null;
    }
    const m = String(v).match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
  };

  const deadlineText = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') {
      const d = XLSX.SSF.parse_date_code(v);
      if (d && d.y) return `${String(d.d).padStart(2, '0')}.${String(d.m).padStart(2, '0')}.${d.y}`;
    }
    return text(v) || null;
  };

  const groups = [];
  let currentQuarter = quarterOverride;
  let currentGroup = null;

  const flush = () => {
    if (currentGroup) groups.push(currentGroup);
    currentGroup = null;
  };

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    // Маркеры "N квартал" / "Итого ..." в исходных файлах всегда стоят
    // именно в колонке "№ п/п" — проверяем только её. Проверка по всей
    // строке ошибочна: например, название филиала "Магнитогорск"
    // содержит подстроку "итого" и ложно принималось бы за итоговую строку.
    const numTextLower = text(row[col.num]).toLowerCase();
    const numText = text(row[col.num]);

    if (numTextLower.includes('квартал')) {
      const m = numTextLower.match(/\d/);
      if (m) currentQuarter = Number(m[0]);
      flush();
      continue;
    }
    if (numTextLower.includes('итог')) {
      flush();
      continue;
    }

    const nameVal = text(row[col.name]);
    const amountVal = parseAmount(row[col.amount]);
    const branchVal = text(row[col.branch]);

    if (!nameVal && amountVal === null && !branchVal) continue; // пустая строка-разделитель

    const isNewItem = /^\d+$/.test(numText);

    if (isNewItem) {
      flush();
      currentGroup = {
        quarter: currentQuarter,
        name: nameVal,
        product_group: col.productGroup !== -1 ? text(row[col.productGroup]) || null : null,
        method: col.method !== -1 ? text(row[col.method]) || null : null,
        justification: col.justification !== -1 ? text(row[col.justification]) || null : null,
        tz_date: col.tzDate !== -1 ? excelDateToSQL(row[col.tzDate]) : null,
        notice_date: col.noticeDate !== -1 ? excelDateToSQL(row[col.noticeDate]) : null,
        deadline: col.deadline !== -1 ? deadlineText(row[col.deadline]) : null,
        okpd2: col.okpd2 !== -1 ? text(row[col.okpd2]) || null : null,
        shares: [],
      };
      if (amountVal !== null && branchVal) {
        currentGroup.shares.push({ branchNameRaw: branchVal, amount: amountVal });
      }
    } else if (currentGroup && amountVal !== null && branchVal) {
      // Продолжение предыдущей закупки — ещё один филиал с своей суммой
      currentGroup.shares.push({ branchNameRaw: branchVal, amount: amountVal });
    }
  }
  flush();

  return groups.filter((g) => g.name && g.shares.length > 0);
}

module.exports = router;