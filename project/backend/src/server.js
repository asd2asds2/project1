const express = require('express');
const cors = require('cors');
const healthRoutes = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Все роуты, относящиеся к health/БД, вынесены в отдельный файл —
// сюда просто добавляй require('./routes/твой-файл') по мере роста проекта
app.use('/api', healthRoutes);

app.listen(PORT, () => {
  console.log(`Backend запущен на порту ${PORT}`);
});
