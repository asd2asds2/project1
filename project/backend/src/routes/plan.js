const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// Таблица ручного плана создаётся автоматически при первом запуске —
// вручную выполнять SQL в базе не нужно.
const ensureManualTable = pool
  .query(`CREATE TABLE IF NOT EXISTS plan_manual_items (
    id SERIAL PRIMARY KEY,
    year INT NOT NULL,
    quarter INT NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    amount NUMERIC(18,2) NOT NULL DEFAULT 0,
    comment TEXT NOT NULL DEFAULT '',
    updated_by INT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`)
  .catch((e) => console.error('plan_manual_items init:', e.message));
router.use('/manual', (req, res, next) => { ensureManualTable.then(() => next()); });

// ---------------------------------------------------------------------------
// Ручной план — цифры, которые финансист/админ вводит руками (не считаются
// из закупок), чтобы было с чем сравнивать факт. quarter=0 — план на год
// целиком, quarter=1..4 — план на конкретный квартал. Доступен на чтение
// всем авторизованным (нужен и на дашборде, и на странице плана/квартала).
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();

  try {
    const result = await pool.query(
      `SELECT quarter, amount FROM plan_targets WHERE year = $1`,
      [year]
    );
    const plan = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const row of result.rows) {
      plan[row.quarter] = Number(row.amount);
    }
    res.json({ status: 'ok', year, plan });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// Установка/изменение плана на год (quarter=0) или на конкретный квартал —
// только admin/financier, как и остальные плановые правки.
router.put('/', requireRole('admin', 'financier'), async (req, res) => {
  const year = Number(req.body.year);
  const quarter = Number(req.body.quarter);
  const amount = Number(req.body.amount);

  if (!year || Number.isNaN(quarter) || quarter < 0 || quarter > 4 || Number.isNaN(amount) || amount < 0) {
    return res.status(400).json({ status: 'error', message: 'Некорректные данные плана' });
  }

  try {
    await pool.query(
      `INSERT INTO plan_targets (year, quarter, amount, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (year, quarter)
       DO UPDATE SET amount = $3, updated_by = $4, updated_at = NOW()`,
      [year, quarter, amount, req.user.userId]
    );
    res.json({ status: 'ok', year, quarter, amount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// ---------------------------------------------------------------------------
// Ручной план — произвольные строки плана, которые вводятся руками
// (название, квартал 0..4, сумма, комментарий). Читать могут все, менять —
// admin/financier.
// ---------------------------------------------------------------------------
router.get('/manual', async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  try {
    const result = await pool.query(
      `SELECT id, year, quarter, name, amount, comment FROM plan_manual_items
       WHERE year = $1 ORDER BY quarter, id`,
      [year]
    );
    res.json({ status: 'ok', items: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

function parseManual(body) {
  const name = String(body.name || '').trim();
  const quarter = Number(body.quarter);
  const amount = Number(body.amount);
  if (!name || !Number.isInteger(quarter) || quarter < 0 || quarter > 4 || !Number.isFinite(amount) || amount < 0) {
    return null;
  }
  return { name, quarter, amount, comment: String(body.comment || '').trim() };
}

router.post('/manual', requireRole('admin', 'financier'), async (req, res) => {
  const year = Number(req.body.year);
  const d = parseManual(req.body);
  if (!year || !d) return res.status(400).json({ status: 'error', message: 'Некорректные данные' });
  try {
    const r = await pool.query(
      `INSERT INTO plan_manual_items (year, quarter, name, amount, comment, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, year, quarter, name, amount, comment`,
      [year, d.quarter, d.name, d.amount, d.comment, req.user.userId]
    );
    res.json({ status: 'ok', item: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

router.put('/manual/:id', requireRole('admin', 'financier'), async (req, res) => {
  const d = parseManual(req.body);
  if (!d) return res.status(400).json({ status: 'error', message: 'Некорректные данные' });
  try {
    const r = await pool.query(
      `UPDATE plan_manual_items SET quarter=$1, name=$2, amount=$3, comment=$4, updated_by=$5, updated_at=NOW()
       WHERE id=$6 RETURNING id, year, quarter, name, amount, comment`,
      [d.quarter, d.name, d.amount, d.comment, req.user.userId, Number(req.params.id)]
    );
    if (!r.rows[0]) return res.status(404).json({ status: 'error', message: 'Не найдено' });
    res.json({ status: 'ok', item: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

router.delete('/manual/:id', requireRole('admin', 'financier'), async (req, res) => {
  try {
    await pool.query(`DELETE FROM plan_manual_items WHERE id=$1`, [Number(req.params.id)]);
    res.json({ status: 'ok' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

module.exports = router;