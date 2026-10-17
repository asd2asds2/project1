const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ready } = require('../initYears');

const router = express.Router();

router.use(requireAuth);
router.use((req, res, next) => {
  ready.then(() => next()).catch(() => {
    res.status(500).json({ status: 'error', message: 'Не удалось подготовить таблицы годов плана' });
  });
});

async function defaultDepartmentId(db) {
  const r = await db.query(
    `SELECT id FROM departments WHERE is_active ORDER BY sort_order, id LIMIT 1`
  );
  return r.rows[0]?.id || null;
}

async function loadYears(db, departmentId) {
  const years = await db.query(
    `SELECT py.id, py.year, py.department_id, py.template_id, py.status, py.created_at,
            t.name AS template_name,
            (SELECT COUNT(*) FROM purchases p WHERE p.year = py.year) AS purchases_count
     FROM plan_years py
     LEFT JOIN plan_templates t ON t.id = py.template_id
     WHERE py.department_id = $1
     ORDER BY py.year DESC`,
    [departmentId]
  );
  if (!years.rows.length) return [];
  const items = await db.query(
    `SELECT plan_year_id, kind, quarter, label, icon, sort_order
     FROM plan_year_items
     WHERE plan_year_id = ANY($1::int[])
     ORDER BY sort_order, id`,
    [years.rows.map((y) => y.id)]
  );
  return years.rows.map((y) => ({
    ...y,
    purchases_count: Number(y.purchases_count),
    items: items.rows.filter((i) => i.plan_year_id === y.id).map(({ plan_year_id, ...rest }) => rest),
  }));
}

// Годы выбранного отдела + отделы + шаблоны (для окна «Создать план на год»)
router.get('/', async (req, res) => {
  try {
    const departments = await pool.query(
      `SELECT id, code, name FROM departments WHERE is_active ORDER BY sort_order, id`
    );
    const requested = Number(req.query.department_id);
    const departmentId = departments.rows.some((d) => d.id === requested)
      ? requested
      : departments.rows[0]?.id;
    if (!departmentId) {
      return res.json({ status: 'ok', departments: [], templates: [], years: [] });
    }

    const templates = await pool.query(
      `SELECT id, code, name, description, is_default FROM plan_templates ORDER BY is_default DESC, id`
    );
    const tItems = await pool.query(
      `SELECT template_id, kind, quarter, label, icon, sort_order
       FROM plan_template_items ORDER BY sort_order, id`
    );

    res.json({
      status: 'ok',
      departments: departments.rows,
      department_id: departmentId,
      templates: templates.rows.map((t) => ({
        ...t,
        items: tItems.rows.filter((i) => i.template_id === t.id).map(({ template_id, ...rest }) => rest),
      })),
      years: await loadYears(pool, departmentId),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// Создание плана на год по шаблону — только admin.
router.post('/', requireRole('admin'), async (req, res) => {
  const year = Number(req.body.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ status: 'error', message: 'Укажите год от 2000 до 2100' });
  }
  const copyFrom = req.body.copy_from_year ? Number(req.body.copy_from_year) : null;
  if (copyFrom !== null && !Number.isInteger(copyFrom)) {
    return res.status(400).json({ status: 'error', message: 'Некорректный год для копирования' });
  }

  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    const departmentId = Number(req.body.department_id) || (await defaultDepartmentId(c));
    if (!departmentId) throw Object.assign(new Error('Нет отделов'), { http: 400 });

    let templateId = Number(req.body.template_id) || null;
    if (!templateId) {
      const d = await c.query(`SELECT id FROM plan_templates WHERE is_default ORDER BY id LIMIT 1`);
      templateId = d.rows[0]?.id || null;
    }
    if (!templateId) throw Object.assign(new Error('Не найден шаблон плана'), { http: 400 });

    const dup = await c.query(
      `SELECT 1 FROM plan_years WHERE department_id = $1 AND year = $2`,
      [departmentId, year]
    );
    if (dup.rows[0]) {
      throw Object.assign(new Error(`План на ${year} год уже создан`), { http: 409 });
    }

    const created = await c.query(
      `INSERT INTO plan_years (year, department_id, template_id, created_by)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [year, departmentId, templateId, req.user.userId]
    );
    const planYearId = created.rows[0].id;

    const copied = await c.query(
      `INSERT INTO plan_year_items (plan_year_id, kind, quarter, label, icon, sort_order)
       SELECT $1::int, kind, quarter, REPLACE(label, '{year}', $2::text), icon, sort_order
       FROM plan_template_items WHERE template_id = $3`,
      [planYearId, String(year), templateId]
    );
    if (!copied.rowCount) throw Object.assign(new Error('В шаблоне нет разделов'), { http: 400 });

    // Плановые суммы (год + 4 квартала): нули или копия из выбранного года
    await c.query(
      `INSERT INTO plan_targets (year, quarter, amount, updated_by, updated_at)
       SELECT $1::int, q, COALESCE((SELECT amount FROM plan_targets WHERE year = $2::int AND quarter = q), 0), $3, NOW()
       FROM generate_series(0, 4) q
       ON CONFLICT (year, quarter) DO NOTHING`,
      [year, copyFrom, req.user.userId]
    );

    await c.query('COMMIT');
    const years = await loadYears(pool, departmentId);
    res.json({ status: 'ok', year: years.find((y) => y.year === year), years });
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    if (err.http) return res.status(err.http).json({ status: 'error', message: err.message });
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  } finally {
    c.release();
  }
});

// Удаление пустого года (если в нём нет закупок) — только admin.
router.delete('/:year', requireRole('admin'), async (req, res) => {
  const year = Number(req.params.year);
  try {
    const departmentId = Number(req.query.department_id) || (await defaultDepartmentId(pool));
    const cnt = await pool.query(`SELECT COUNT(*) AS n FROM purchases WHERE year = $1`, [year]);
    const n = Number(cnt.rows[0].n);
    if (n > 0) {
      return res.status(409).json({
        status: 'error',
        message: `В ${year} году есть закупки (${n}). Сначала удалите их — год с данными удалить нельзя.`,
      });
    }
    const del = await pool.query(
      `DELETE FROM plan_years WHERE department_id = $1 AND year = $2`,
      [departmentId, year]
    );
    if (!del.rowCount) return res.status(404).json({ status: 'error', message: 'Год не найден' });
    await pool.query(`DELETE FROM plan_targets WHERE year = $1`, [year]);
    res.json({ status: 'ok', years: await loadYears(pool, departmentId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

module.exports = router;
