const express = require('express');
const pool = require('../db');

const router = express.Router();

// Простая проверка, что бэкенд жив
router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend работает' });
});

// Проверка подключения к базе данных
router.get('/db-check', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', dbTime: result.rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
