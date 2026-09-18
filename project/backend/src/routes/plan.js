const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

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

module.exports = router;
