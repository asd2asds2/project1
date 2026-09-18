const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Физическое хранилище файлов — том Docker (см. docker-compose.yml, volume
// uploads_data:/app/uploads), чтобы файлы не терялись при пересборке контейнера.
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_ENTITY_TYPES = ['purchase', 'transfer', 'cancellation', 'unplanned'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 МБ на файл
});

router.use(requireAuth);

// ---------------------------------------------------------------------------
// Список файлов по сущности: GET /api/documents?entity_type=purchase&entity_id=1
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  const { entity_type: entityType, entity_id: entityId } = req.query;

  if (!entityType || !ALLOWED_ENTITY_TYPES.includes(entityType) || !entityId) {
    return res.status(400).json({ status: 'error', message: 'Не указаны entity_type/entity_id' });
  }

  try {
    const result = await pool.query(
      `SELECT d.id, d.entity_type, d.entity_id, d.file_name, d.file_size,
              d.description, d.uploaded_at, u.full_name AS uploaded_by_name
       FROM documents d
       LEFT JOIN users u ON u.id = d.uploaded_by
       WHERE d.entity_type = $1 AND d.entity_id = $2
       ORDER BY d.uploaded_at DESC`,
      [entityType, Number(entityId)]
    );

    res.json({ status: 'ok', documents: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// ---------------------------------------------------------------------------
// Загрузка файла: POST /api/documents (multipart: file, entity_type, entity_id, description)
// Загружать может любой, кто может редактировать закупку.
// ---------------------------------------------------------------------------
router.post(
  '/',
  requireRole('admin', 'financier', 'branch_editor'),
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ status: 'error', message: 'Файл больше 20 МБ — уменьшите размер' });
        }
        console.error(err);
        return res.status(400).json({ status: 'error', message: 'Не удалось загрузить файл' });
      }
      next();
    });
  },
  async (req, res) => {
    const { entity_type: entityType, entity_id: entityId, description } = req.body;

    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'Файл не передан' });
    }

    if (!entityType || !ALLOWED_ENTITY_TYPES.includes(entityType) || !entityId) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ status: 'error', message: 'Не указаны entity_type/entity_id' });
    }

    try {
      const result = await pool.query(
        `INSERT INTO documents
           (entity_type, entity_id, file_name, stored_name, file_size, description, uploaded_by, uploaded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING id, entity_type, entity_id, file_name, file_size, description, uploaded_at`,
        [
          entityType,
          Number(entityId),
          req.file.originalname,
          req.file.filename,
          req.file.size,
          description || null,
          req.user.userId,
        ]
      );

      const doc = result.rows[0];
      const userRow = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.userId]);

      res.json({
        status: 'ok',
        document: { ...doc, uploaded_by_name: userRow.rows[0]?.full_name || null },
      });
    } catch (err) {
      console.error(err);
      fs.unlink(req.file.path, () => {});
      res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
    }
  }
);

// ---------------------------------------------------------------------------
// Скачивание: GET /api/documents/:id/download
// ---------------------------------------------------------------------------
router.get('/:id/download', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT file_name, stored_name FROM documents WHERE id = $1',
      [req.params.id]
    );
    const doc = result.rows[0];

    if (!doc) {
      return res.status(404).json({ status: 'error', message: 'Файл не найден' });
    }

    const filePath = path.join(UPLOAD_DIR, doc.stored_name);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ status: 'error', message: 'Файл отсутствует на диске' });
    }

    res.download(filePath, doc.file_name);
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// ---------------------------------------------------------------------------
// Удаление: DELETE /api/documents/:id — только admin/financier
// ---------------------------------------------------------------------------
router.delete('/:id', requireRole('admin', 'financier'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM documents WHERE id = $1 RETURNING stored_name',
      [req.params.id]
    );
    const doc = result.rows[0];

    if (!doc) {
      return res.status(404).json({ status: 'error', message: 'Файл не найден' });
    }

    fs.unlink(path.join(UPLOAD_DIR, doc.stored_name), () => {});

    res.json({ status: 'ok' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

module.exports = router;