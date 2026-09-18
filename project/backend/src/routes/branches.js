const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Список филиалов — доступен всем авторизованным (нужен для выпадающих
// списков и таблицы закупок, не только на странице "Филиалы")
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, code, address, is_active FROM branches ORDER BY name'
    );
    res.json({ status: 'ok', branches: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// Создание филиала — только admin/financier
router.post('/', requireAuth, requireRole('admin', 'financier'), async (req, res) => {
  const { name, code, address } = req.body;

  if (!name || !code) {
    return res.status(400).json({ status: 'error', message: 'Укажите название и код филиала' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO branches (name, code, address, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING id, name, code, address, is_active`,
      [name, code, address || null]
    );
    res.json({ status: 'ok', branch: result.rows[0] });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      return res.status(400).json({ status: 'error', message: 'Филиал с таким кодом уже существует' });
    }
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// Редактирование филиала (в т.ч. частичное — например, только is_active
// при включении/отключении) — только admin/financier
router.put('/:id', requireAuth, requireRole('admin', 'financier'), async (req, res) => {
  const { id } = req.params;
  const { name, code, address, is_active } = req.body;

  const fields = [];
  const values = [];
  let idx = 1;

  if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
  if (code !== undefined) { fields.push(`code = $${idx++}`); values.push(code); }
  if (address !== undefined) { fields.push(`address = $${idx++}`); values.push(address); }
  if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(is_active); }

  if (fields.length === 0) {
    return res.status(400).json({ status: 'error', message: 'Нечего обновлять' });
  }

  values.push(id);

  try {
    const result = await pool.query(
      `UPDATE branches SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, name, code, address, is_active`,
      values
    );
    if (!result.rows[0]) {
      return res.status(404).json({ status: 'error', message: 'Филиал не найден' });
    }
    res.json({ status: 'ok', branch: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

module.exports = router;
