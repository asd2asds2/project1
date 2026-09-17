const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { login, password } = req.body;

  if (!login || !password) {
    return res.status(400).json({ status: 'error', message: 'Введите логин и пароль' });
  }

  try {
    const result = await pool.query(
      'SELECT id, login, password_hash, full_name, role, branch_id, is_active FROM users WHERE login = $1',
      [login]
    );

    const user = result.rows[0];

    if (!user || !user.is_active) {
      return res.status(401).json({ status: 'error', message: 'Неверный логин или пароль' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ status: 'error', message: 'Неверный логин или пароль' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    res.json({
      status: 'ok',
      token,
      user: {
        id: user.id,
        login: user.login,
        full_name: user.full_name,
        role: user.role,
        branch_id: user.branch_id,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: 'Токен не передан' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const result = await pool.query(
      'SELECT id, login, full_name, role, branch_id FROM users WHERE id = $1',
      [payload.userId]
    );

    if (!result.rows[0]) {
      return res.status(401).json({ status: 'error', message: 'Пользователь не найден' });
    }

    res.json({ status: 'ok', user: result.rows[0] });
  } catch (err) {
    res.status(401).json({ status: 'error', message: 'Недействительный токен' });
  }
});

module.exports = router;
