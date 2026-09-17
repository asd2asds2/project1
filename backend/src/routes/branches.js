const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Список филиалов — видят все авторизованные
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, code, address, is_active, created_at FROM branches ORDER BY name'
    );
    res.json({ status: 'ok', branches: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// Создать филиал — только admin/financier
router.post('/', requireAuth, requireRole('admin', 'financier'), async (req, res) => {
  const { name, code, address } = req.body;

  if (!name || !code) {
    return res.status(400).json({ status: 'error', message: 'Название и код обязательны' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO branches (name, code, address)
       VALUES ($1, $2, $3)
       RETURNING id, name, code, address, is_active, created_at`,
      [name, code, address || null]
    );
    res.status(201).json({ status: 'ok', branch: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ status: 'error', message: 'Филиал с таким кодом уже есть' });
    }
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// Обновить филиал
router.put('/:id', requireAuth, requireRole('admin', 'financier'), async (req, res) => {
  const { id } = req.params;
  const { name, code, address, is_active } = req.body;

  try {
    const result = await pool.query(
      `UPDATE branches
       SET name = COALESCE($1, name),
           code = COALESCE($2, code),
           address = COALESCE($3, address),
           is_active = COALESCE($4, is_active)
       WHERE id = $5
       RETURNING id, name, code, address, is_active, created_at`,
      [name, code, address, is_active, id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ status: 'error', message: 'Филиал не найден' });
    }

    res.json({ status: 'ok', branch: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ status: 'error', message: 'Филиал с таким кодом уже есть' });
    }
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

module.exports = router;
