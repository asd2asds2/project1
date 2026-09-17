const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const LIST_QUERY = `
  SELECT p.*, b.name AS branch_name, b.code AS branch_code
  FROM purchases p
  JOIN branches b ON b.id = p.branch_id
`;

// Список закупок с фильтрами: год, квартал, филиал, статус, поиск по названию/ОКПД2
router.get('/', requireAuth, async (req, res) => {
  const { year, quarter, branch_id, status, search, pending } = req.query;

  const conditions = [];
  const params = [];

  if (pending === '1') {
    conditions.push(`p.source = 'branch' AND p.reviewed_at IS NULL`);
  }

  if (year) {
    params.push(year);
    conditions.push(`p.year = $${params.length}`);
  }
  if (quarter) {
    params.push(quarter);
    conditions.push(`p.quarter = $${params.length}`);
  }
  if (branch_id) {
    params.push(branch_id);
    conditions.push(`p.branch_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`p.status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(p.name ILIKE $${params.length} OR p.okpd2 ILIKE $${params.length} OR b.name ILIKE $${params.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await pool.query(
      `${LIST_QUERY} ${where} ORDER BY p.quarter, p.item_no NULLS LAST, p.id`,
      params
    );
    res.json({ status: 'ok', purchases: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// Итоги по кварталам/филиалам — для дашборда
router.get('/summary', requireAuth, async (req, res) => {
  const { year } = req.query;
  if (!year) {
    return res.status(400).json({ status: 'error', message: 'Укажите год' });
  }

  try {
    const byQuarter = await pool.query(
      `SELECT quarter, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS items
       FROM purchases
       WHERE year = $1 AND status != 'cancelled'
       GROUP BY quarter ORDER BY quarter`,
      [year]
    );
    const byBranch = await pool.query(
      `SELECT b.id AS branch_id, b.name AS branch_name, COALESCE(SUM(p.amount), 0) AS total
       FROM branches b
       LEFT JOIN purchases p ON p.branch_id = b.id AND p.year = $1 AND p.status != 'cancelled'
       GROUP BY b.id, b.name ORDER BY b.name`,
      [year]
    );
    const pendingReview = await pool.query(
      `SELECT COUNT(*) AS count FROM purchases
       WHERE year = $1 AND source = 'branch' AND reviewed_at IS NULL`,
      [year]
    );

    res.json({
      status: 'ok',
      byQuarter: byQuarter.rows,
      byBranch: byBranch.rows,
      pendingReview: Number(pendingReview.rows[0].count),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// Создать позицию закупки
router.post('/', requireAuth, async (req, res) => {
  const {
    year, quarter, item_no, branch_id, name, product_group, method,
    justification, tz_date, notice_date, amount, deadline, okpd2, comment,
  } = req.body;

  if (!year || !quarter || !branch_id || !name) {
    return res.status(400).json({ status: 'error', message: 'Год, квартал, филиал и название обязательны' });
  }

  const source = req.user.role === 'branch_editor' ? 'branch' : 'center';
  const reviewedAt = source === 'branch' ? null : new Date();

  try {
    const result = await pool.query(
      `INSERT INTO purchases
        (year, quarter, item_no, branch_id, name, product_group, method, justification,
         tz_date, notice_date, amount, deadline, okpd2, comment, source, reviewed_at,
         reviewed_by, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18)
       RETURNING *`,
      [year, quarter, item_no || null, branch_id, name, product_group || null, method || null,
        justification || null, tz_date || null, notice_date || null, amount || 0, deadline || null,
        okpd2 || null, comment || null, source, reviewedAt, source === 'branch' ? null : req.user.userId,
        req.user.userId]
    );
    res.status(201).json({ status: 'ok', purchase: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// Обновить позицию — если правит филиал, помечаем source='branch' и сбрасываем reviewed_at
// (это и есть подсветка "новое от филиала" на фронте, пока центр не откроет и не подтвердит)
router.put('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const fields = [
    'quarter', 'item_no', 'branch_id', 'name', 'product_group', 'method',
    'justification', 'tz_date', 'notice_date', 'amount', 'deadline', 'okpd2', 'comment',
  ];

  const updates = [];
  const params = [];

  fields.forEach((f) => {
    if (req.body[f] !== undefined) {
      params.push(req.body[f]);
      updates.push(`${f} = $${params.length}`);
    }
  });

  if (!updates.length) {
    return res.status(400).json({ status: 'error', message: 'Нечего обновлять' });
  }

  const isBranchEdit = req.user.role === 'branch_editor';
  params.push(isBranchEdit ? 'branch' : 'center');
  updates.push(`source = $${params.length}`);

  if (isBranchEdit) {
    updates.push(`reviewed_at = NULL`);
  } else {
    params.push(req.user.userId);
    updates.push(`reviewed_at = NOW(), reviewed_by = $${params.length}`);
  }

  params.push(req.user.userId);
  updates.push(`updated_by = $${params.length}`);
  updates.push(`updated_at = NOW()`);

  params.push(id);

  try {
    const result = await pool.query(
      `UPDATE purchases SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
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

// Отметить как просмотренное центром (снимает подсветку)
router.post('/:id/review', requireAuth, requireRole('admin', 'financier'), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE purchases SET reviewed_at = NOW(), reviewed_by = $1 WHERE id = $2 RETURNING *`,
      [req.user.userId, id]
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

// Перенос в другой квартал
router.post('/:id/transfer', requireAuth, requireRole('admin', 'financier'), async (req, res) => {
  const { id } = req.params;
  const { to_quarter, reason } = req.body;

  if (!to_quarter || !reason) {
    return res.status(400).json({ status: 'error', message: 'Укажите квартал и причину переноса' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT quarter FROM purchases WHERE id = $1 FOR UPDATE', [id]);
    if (!current.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Закупка не найдена' });
    }
    await client.query(
      `INSERT INTO purchase_transfers (purchase_id, from_quarter, to_quarter, reason, requested_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, current.rows[0].quarter, to_quarter, reason, req.user.userId]
    );
    const updated = await client.query(
      `UPDATE purchases SET quarter = $1, status = 'transferred', updated_by = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [to_quarter, req.user.userId, id]
    );
    await client.query('COMMIT');
    res.json({ status: 'ok', purchase: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// Отмена закупки
router.post('/:id/cancel', requireAuth, requireRole('admin', 'financier'), async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({ status: 'error', message: 'Укажите причину отмены' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO purchase_cancellations (purchase_id, reason, requested_by) VALUES ($1, $2, $3)`,
      [id, reason, req.user.userId]
    );
    const updated = await client.query(
      `UPDATE purchases SET status = 'cancelled', updated_by = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [req.user.userId, id]
    );
    await client.query('COMMIT');
    if (!updated.rows[0]) {
      return res.status(404).json({ status: 'error', message: 'Закупка не найдена' });
    }
    res.json({ status: 'ok', purchase: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

module.exports = router;
