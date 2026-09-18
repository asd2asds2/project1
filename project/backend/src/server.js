const express = require('express');
const cors = require('cors');
const path = require('path');

// 1. Импорт всех роутеров из папки routes
const authRouter = require('./routes/auth');
const branchesRouter = require('./routes/branches');
const purchasesRouter = require('./routes/purchases'); // <--- ваш purchases.js
const documentsRouter = require('./routes/documents');
const healthRouter = require('./routes/health');

const app = express();

// Мидлвары
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Статическая папка для загруженных документов (если применимо)
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
app.use('/uploads', express.static(uploadDir));

// 2. Регистрация маршрутов API
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/branches', branchesRouter);
app.use('/api/purchases', purchasesRouter); // <--- Подключение закупок
app.use('/api/documents', documentsRouter);

// Глобальная обработка ошибок
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ status: 'error', message: 'Внутренняя ошибка сервера' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});