require('dotenv').config();

const express = require('express');
const cors = require('cors');

const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const branchesRoutes = require('./routes/branches');
const purchasesRoutes = require('./routes/purchases');

const app = express();

app.use(cors());
app.use(express.json());

// Роуты
app.use('/api', healthRoutes);           // /api/health, /api/db-check
app.use('/api/auth', authRoutes);        // /api/auth/login, /api/auth/me
app.use('/api/branches', branchesRoutes);// /api/branches
app.use('/api/purchases', purchasesRoutes); // /api/purchases, /api/purchases/summary...

// 404
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Маршрут не найден' });
});

// Общий обработчик ошибок (на случай, если где-то забыли try/catch)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ status: 'error', message: 'Внутренняя ошибка сервера' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend запущен на порту ${PORT}`);
});
