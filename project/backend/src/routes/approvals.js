const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ready } = require('../initApprovals');

const router = express.Router();

router.use(requireAuth);
router.use((req, res, next) => {
  ready.then(() => next()).catch(() => {
    res.status(500).json({ status: 'error', message: 'Не удалось подготовить таблицы утверждения плана' });
  });
});

// Сколько изменений в рабочем плане после утверждения версии:
// новые/изменённые закупки + закупки, которых в рабочем плане уже нет.
async function changesSince(db, approval) {
  const r = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM purchases p
         WHERE p.year = $1 AND p.updated_at > $2) AS changed,
       (SELECT COUNT(*) FROM plan_approval_items i
         WHERE i.approval_id = $3
           AND NOT EXISTS (SELECT 1 FROM purchases p WHERE p.id = i.purchase_id)) AS removed`,
    [approval.year, approval.approved_at, approval.id]
  );
  return Number(r.rows[0].changed) + Number(r.rows[0].removed);
}

// Список утверждённых версий года (новые сверху) + число правок рабочего плана после последней.
router.get('/', async (req, res) => {
  const year = Number(req.query.year);
  if (!year) return res.status(400).json({ status: 'error', message: 'Укажите год' });
  try {
    const r = await pool.query(
      `SELECT a.id, a.year, a.version, a.note, a.items_count, a.total_amount, a.approved_at,
              u.full_name AS approved_by_name
         FROM plan_approvals a LEFT JOIN users u ON u.id = a.approved_by
        WHERE a.year = $1 ORDER BY a.version DESC`,
      [year]
    );
    const approvals = r.rows.map((a) => ({ ...a, total_amount: Number(a.total_amount) }));
    const changes = approvals.length ? await changesSince(pool, approvals[0]) : 0;

    const cur = await pool.query(
      `SELECT COUNT(*) AS n, COALESCE(SUM(amount) FILTER (WHERE status <> 'cancelled'), 0) AS total
         FROM purchases WHERE year = $1`,
      [year]
    );
    res.json({
      status: 'ok',
      approvals,
      changes_since_last: changes,
      current: { items_count: Number(cur.rows[0].n), total_amount: Number(cur.rows[0].total) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// Утвердить план года: сохраняем неизменяемый снимок всех закупок. Рабочий план
// (таблица purchases) не трогаем — он остаётся редактируемым.
router.post('/', requireRole('admin', 'financier'), async (req, res) => {
  const year = Number(req.body.year);
  const note = String(req.body.note || '').trim() || null;
  if (!year) return res.status(400).json({ status: 'error', message: 'Укажите год' });

  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock($1)', [920000 + year]);

    const rows = await c.query(
      `SELECT p.*,
              b.name AS branch_name_legacy,
              COALESCE(
                (SELECT json_agg(json_build_object('branch_id', bb.id, 'branch_name', bb.name, 'amount', s.amount) ORDER BY bb.name)
                   FROM purchase_branch_shares s JOIN branches bb ON bb.id = s.branch_id
                  WHERE s.purchase_id = p.id), '[]') AS shares,
              (SELECT COUNT(*) FROM purchase_notes n WHERE n.purchase_id = p.id) AS notes_count,
              (SELECT COUNT(*) FROM documents d WHERE d.entity_type = 'purchase' AND d.entity_id = p.id) AS documents_count,
              ROW_NUMBER() OVER (
                PARTITION BY p.quarter
                ORDER BY COALESCE(p.sort_order, 2147483647),
                         CASE WHEN p.method = 'Р' THEN 1 ELSE 0 END, p.product_group, p.created_at) AS item_no
         FROM purchases p LEFT JOIN branches b ON b.id = p.branch_id
        WHERE p.year = $1
        ORDER BY p.quarter, COALESCE(p.sort_order, 2147483647),
                 CASE WHEN p.method = 'Р' THEN 1 ELSE 0 END, p.product_group, p.created_at`,
      [year]
    );
    if (rows.rows.length === 0) {
      throw Object.assign(new Error('В плане нет закупок — утверждать нечего'), { http: 400 });
    }

    const total = rows.rows
      .filter((p) => p.status !== 'cancelled')
      .reduce((s, p) => s + Number(p.amount), 0);

    const v = await c.query(`SELECT COALESCE(MAX(version), 0) + 1 AS v FROM plan_approvals WHERE year = $1`, [year]);
    const version = Number(v.rows[0].v);

    const a = await c.query(
      `INSERT INTO plan_approvals (year, version, note, items_count, total_amount, approved_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, year, version, note, items_count, total_amount, approved_at`,
      [year, version, note, rows.rows.length, total, req.user.userId]
    );
    const approval = a.rows[0];

    // Одним запросом: jsonb-массив → строки снимка
    const payload = rows.rows.map((p, i) => {
      const { branch_name_legacy, ...rest } = p;
      const branchName = rest.shares?.length
        ? rest.shares.map((s) => s.branch_name).join(', ')
        : branch_name_legacy || '—';
      return { purchase_id: p.id, ord: i, data: { ...rest, branch_name: branchName, item_no: Number(rest.item_no) } };
    });
    await c.query(
      `INSERT INTO plan_approval_items (approval_id, purchase_id, ord, data)
       SELECT $1, (x->>'purchase_id')::int, (x->>'ord')::int, x->'data'
         FROM jsonb_array_elements($2::jsonb) x`,
      [approval.id, JSON.stringify(payload)]
    );

    await c.query(
      `INSERT INTO audit_log (entity_type, entity_id, action, new_value, changed_by, comment)
       VALUES ('plan_approval', $1, 'approve', $2, $3, $4)`,
      [approval.id, `год ${year}, версия ${version}`, req.user.userId, note]
    );

    await c.query('COMMIT');
    res.json({ status: 'ok', approval: { ...approval, total_amount: Number(approval.total_amount) } });
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    if (err.http) return res.status(err.http).json({ status: 'error', message: err.message });
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  } finally {
    c.release();
  }
});

// Закупки утверждённой версии — в том же формате, что и GET /api/purchases (только чтение).
router.get('/:id/purchases', async (req, res) => {
  const id = Number(req.params.id);
  const quarter = req.query.quarter ? Number(req.query.quarter) : null;
  const search = String(req.query.search || '').trim().toLowerCase();
  try {
    const r = await pool.query(
      `SELECT data FROM plan_approval_items
        WHERE approval_id = $1 AND ($2::int IS NULL OR (data->>'quarter')::int = $2)
        ORDER BY ord`,
      [id, quarter]
    );
    let purchases = r.rows.map((x) => x.data);
    if (search) {
      purchases = purchases.filter((p) =>
        [p.name, p.okpd2, p.branch_name].some((v) => String(v || '').toLowerCase().includes(search))
      );
    }
    res.json({ status: 'ok', purchases });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

module.exports = router;
