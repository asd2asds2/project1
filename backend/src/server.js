const express = require('express');
const cors = require('cors');
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const branchesRoutes = require('./routes/branches');
const purchasesRoutes = require('./routes/purchases');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/branches', branchesRoutes);
app.use('/api/purchases', purchasesRoutes);

app.listen(PORT, () => {
  console.log(`Backend запущен на порту ${PORT}`);
});
