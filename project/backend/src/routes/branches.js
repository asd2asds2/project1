const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Общая палитра — тот же список и в том же порядке, что и во frontend
// (frontend/src/theme/branchPalette.js), чтобы цвет по умолчанию для
// филиала без явно заданного color совпадал везде.
const PALETTE = [
  '#2f6fed', '#1a8a4e', '#b6780f', '#8a4fd1',
  '#d1477a', '#0f9aa6', '#c0392b', '#5a6b8c',
  '#7a9e1e', '#b8860b', '#4a5fd1', '#c2185b',
];
function paletteColor(id) {
  return PALETTE[Number(id) % PALETTE.length];
}

// Список филиалов — доступен всем авторизованным (нужен для выпадающих
// списков и таблицы закупок, не только на странице "Филиалы")
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, code, address, is_active, color FROM branches ORDER BY name'
    );
    // Если цвет не задан руками — подставляем цвет из палитры по id, чтобы
    // на фронте всегда была цветовая метка, даже для филиалов, заведённых
    // до появления этой функции.
    const branches = result.rows.map((b) => ({ ...b, color: b.color || paletteColor(b.id) }));
    res.json({ status: 'ok', branches });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// Создание филиала — только admin/financier. Цвет можно передать явно
// (color, hex) — например, чтобы сразу задать свой; если не передан,
// подставляется цвет из палитры по id нового филиала.
router.post('/', requireAuth, requireRole('admin', 'financier'), async (req, res) => {
  const { name, code, address, color } = req.body;

  if (!name || !code) {
    return res.status(400).json({ status: 'error', message: 'Укажите название и код филиала' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO branches (name, code, address, is_active, color)
       VALUES ($1, $2, $3, true, $4)
       RETURNING id, name, code, address, is_active, color`,
      [name, code, address || null, color || null]
    );
    const branch = result.rows[0];
    branch.color = branch.color || paletteColor(branch.id);
    res.json({ status: 'ok', branch });
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
  const { name, code, address, is_active, color } = req.body;

  const fields = [];
  const values = [];
  let idx = 1;

  if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
  if (code !== undefined) { fields.push(`code = $${idx++}`); values.push(code); }
  if (address !== undefined) { fields.push(`address = $${idx++}`); values.push(address); }
  if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(is_active); }
  // color === null — осознанный сброс на "авто" (снова брать цвет из палитры
  // по id), color === '' с фронта не присылается, только валидный hex или null.
  if (color !== undefined) { fields.push(`color = $${idx++}`); values.push(color); }

  if (fields.length === 0) {
    return res.status(400).json({ status: 'error', message: 'Нечего обновлять' });
  }

  values.push(id);

  try {
    const result = await pool.query(
      `UPDATE branches SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, name, code, address, is_active, color`,
      values
    );
    if (!result.rows[0]) {
      return res.status(404).json({ status: 'error', message: 'Филиал не найден' });
    }
    const branch = result.rows[0];
    branch.color = branch.color || paletteColor(branch.id);
    res.json({ status: 'ok', branch });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

module.exports = router;
