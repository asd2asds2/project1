const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// Сводка для главной страницы: суммы по кварталам, по филиалам, счётчик
// "ждут проверки"
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

    const byBranch = await pool.query(
      `SELECT b.id AS branch_id, b.name AS branch_name, COALESCE(SUM(p.amount), 0) AS total
       FROM branches b
       LEFT JOIN purchases p
         ON p.branch_id = b.id AND p.year = $1 AND p.status <> 'cancelled'
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

// Список закупок с фильтрами: year (обязателен), quarter, pending=1, search
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
    conditions.push(`(p.name ILIKE $${idx} OR p.okpd2 ILIKE $${idx} OR b.name ILIKE $${idx})`);
    values.push(`%${search}%`);
    idx++;
  }

  try {
    const result = await pool.query(
      `SELECT p.*, b.name AS branch_name,
              ROW_NUMBER() OVER (PARTITION BY p.quarter ORDER BY p.created_at) AS item_no
       FROM purchases p
       JOIN branches b ON b.id = p.branch_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.quarter, p.created_at`,
      values
    );
    res.json({ status: 'ok', purchases: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// Создание закупки — admin/financier (центр) или branch_editor (филиал,
// требует последующей проверки центром)
router.post('/', requireRole('admin', 'financier', 'branch_editor'), async (req, res) => {
  const {
    year, quarter, branch_id, name, product_group, method,
    justification, tz_date, notice_date, amount, deadline, okpd2, comment,
  } = req.body;

  if (!year || !quarter || !branch_id || !name || amount === undefined || amount === '') {
    return res.status(400).json({ status: 'error', message: 'Заполните обязательные поля' });
  }

  const source = req.user.role === 'branch_editor' ? 'branch' : 'center';

  try {
    const result = await pool.query(
      `INSERT INTO purchases
        (year, quarter, branch_id, name, product_group, method, justification,
         tz_date, notice_date, amount, deadline, okpd2, comment, source, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        year, quarter, branch_id, name, product_group || null, method || null,
        justification || null, tz_date || null, notice_date || null, amount,
        deadline || null, okpd2 || null, comment || null, source, req.user.userId,
      ]
    );
    res.json({ status: 'ok', purchase: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// Редактирование закупки. Если правит филиал (branch_editor) — сбрасываем
// reviewed_at, чтобы центр увидел изменения заново (жёлтая подсветка).
router.put('/:id', requireRole('admin', 'financier', 'branch_editor'), async (req, res) => {
  const { id } = req.params;
  const {
    quarter, branch_id, name, product_group, method, justification,
    tz_date, notice_date, amount, deadline, okpd2, comment,
  } = req.body;

  const resetReview = req.user.role === 'branch_editor';

  try {
    const result = await pool.query(
      `UPDATE purchases SET
         quarter = COALESCE($1, quarter),
         branch_id = COALESCE($2, branch_id),
         name = COALESCE($3, name),
         product_group = COALESCE($4, product_group),
         method = COALESCE($5, method),
         justification = COALESCE($6, justification),
         tz_date = COALESCE($7, tz_date),
         notice_date = COALESCE($8, notice_date),
         amount = COALESCE($9, amount),
         deadline = COALESCE($10, deadline),
         okpd2 = COALESCE($11, okpd2),
         comment = COALESCE($12, comment),
         reviewed_at = CASE WHEN $13 THEN NULL ELSE reviewed_at END,
         updated_at = now()
       WHERE id = $14
       RETURNING *`,
      [
        quarter, branch_id, name, product_group, method, justification,
        tz_date, notice_date, amount, deadline, okpd2, comment, resetReview, id,
      ]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ status: 'error', message: 'Закупка не найдена' });
    }
    res.json({ status: 'ok', purchase: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// Отметить как просмотренное центром (снимает жёлтую подсветку)
router.post('/:id/review', requireRole('admin', 'financier'), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE purchases SET reviewed_at = now(), updated_at = now() WHERE id = $1 RETURNING *`,
      [id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ status: 'error', message: 'Закупка не найдена' });
    }
    res.json({ status: 'ok', purchase: result.rows[0] });
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
       RETURNING *`,
      [Number(to_quarter), reason, id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ status: 'error', message: 'Закупка не найдена' });
    }
    res.json({ status: 'ok', purchase: result.rows[0] });
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
       RETURNING *`,
      [reason, id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ status: 'error', message: 'Закупка не найдена' });
    }
    res.json({ status: 'ok', purchase: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

module.exports = router;
