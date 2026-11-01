const express = require('express');
const XLSX = require('xlsx');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { ready } = require('../initApprovals');

const router = express.Router();

router.use(requireAuth);
router.use((req, res, next) => {
  ready.then(() => next()).catch(() => {
    res.status(500).json({ status: 'error', message: 'Не удалось подготовить таблицы' });
  });
});

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Пустая «корзина» показателей
function bucket() {
  return {
    plan: 0, plan_count: 0,                 // плановые закупки (НМЦ)
    unplanned: 0, unplanned_count: 0,       // внеплановые (НМЦ)
    executed: 0, executed_count: 0,         // сумма договоров по исполненным
    executed_nmc: 0,                        // НМЦ исполненных закупок
    executed_plan: 0, executed_unplanned: 0,// сумма договоров: плановые / внеплановые
    economy: 0, overrun: 0,                 // экономия (НМЦ > договор) / перерасход (договор > НМЦ)
    in_progress: 0, in_progress_count: 0,   // НМЦ ещё не исполненных
  };
}

// Добавляем закупку в корзину; k — доля закупки (для разбивки по филиалам)
function addTo(b, p, k = 1) {
  const nmc = p.nmc * k;
  if (p.unplanned) { b.unplanned += nmc; b.unplanned_count += k === 1 ? 1 : 0; }
  else { b.plan += nmc; b.plan_count += k === 1 ? 1 : 0; }
  if (p.executed) {
    const contract = p.contract * k;
    b.executed += contract;
    b.executed_nmc += nmc;
    b.executed_count += k === 1 ? 1 : 0;
    if (p.unplanned) b.executed_unplanned += contract; else b.executed_plan += contract;
    const diff = nmc - contract;
    if (diff >= 0) b.economy += diff; else b.overrun += -diff;
  } else {
    b.in_progress += nmc;
    b.in_progress_count += k === 1 ? 1 : 0;
  }
}

function finish(b) {
  const out = {};
  for (const [k, v] of Object.entries(b)) out[k] = k.endsWith('_count') ? v : r2(v);
  out.total_nmc = r2(b.plan + b.unplanned);
  out.net_economy = r2(b.economy - b.overrun);
  out.execution_percent = out.total_nmc > 0 ? r2((b.executed_nmc / out.total_nmc) * 100) : 0;
  return out;
}

async function buildReport(year, quarter) {
  const params = [year];
  let qCond = '';
  if (quarter) { params.push(quarter); qCond = ' AND p.quarter = $2'; }

  const rows = (await pool.query(
    `SELECT p.id, p.quarter, p.name, p.status, p.amount, p.is_unplanned, p.contract_amount,
            p.executed_at, p.contract_no, p.supplier, p.branch_id, b.name AS legacy_branch,
            COALESCE((SELECT json_agg(json_build_object('branch_id', bb.id, 'branch_name', bb.name, 'amount', s.amount) ORDER BY bb.name)
                        FROM purchase_branch_shares s JOIN branches bb ON bb.id = s.branch_id
                       WHERE s.purchase_id = p.id), '[]') AS shares
       FROM purchases p LEFT JOIN branches b ON b.id = p.branch_id
      WHERE p.year = $1${qCond}
      ORDER BY p.quarter, COALESCE(p.sort_order, 2147483647), p.created_at`,
    params
  )).rows;

  const targets = (await pool.query(`SELECT quarter, amount FROM plan_targets WHERE year = $1`, [year])).rows;
  const targetByQ = Object.fromEntries(targets.map((t) => [t.quarter, Number(t.amount)]));

  const total = bucket();
  const byQuarter = { 1: bucket(), 2: bucket(), 3: bucket(), 4: bucket() };
  const byBranch = new Map();
  const cancelled = { count: 0, sum: 0 };
  const list = [];

  for (const r of rows) {
    const nmc = Number(r.amount);
    if (r.status === 'cancelled') {
      cancelled.count += 1;
      cancelled.sum += nmc;
      continue;
    }
    const p = {
      nmc,
      unplanned: r.is_unplanned || r.status === 'unplanned',
      executed: r.contract_amount !== null && r.contract_amount !== undefined,
      contract: r.contract_amount !== null ? Number(r.contract_amount) : 0,
    };
    addTo(total, p);
    addTo(byQuarter[r.quarter], p);

    // Разбивка по филиалам: сумма договора делится пропорционально долям НМЦ
    const parts = r.shares && r.shares.length
      ? r.shares.map((s) => ({ id: s.branch_id, name: s.branch_name, k: nmc > 0 ? Number(s.amount) / nmc : 0 }))
      : r.branch_id ? [{ id: r.branch_id, name: r.legacy_branch, k: 1 }] : [];
    for (const part of parts) {
      if (!byBranch.has(part.id)) byBranch.set(part.id, { branch_id: part.id, branch_name: part.name, ...{ b: bucket() } });
      // счётчики штук считаем у каждого филиала целиком (k=1 для счётчика), суммы — по доле
      const entry = byBranch.get(part.id).b;
      const share = { ...p };
      addTo(entry, share, part.k);
      if (part.k !== 1) {
        if (p.unplanned) entry.unplanned_count += 1; else entry.plan_count += 1;
        if (p.executed) entry.executed_count += 1; else entry.in_progress_count += 1;
      }
    }

    list.push({
      id: r.id,
      quarter: r.quarter,
      name: r.name,
      branches: parts.map((x) => x.name).join(', ') || '—',
      nmc: r2(nmc),
      unplanned: p.unplanned,
      executed: p.executed,
      contract_amount: p.executed ? r2(p.contract) : null,
      economy: p.executed ? r2(nmc - p.contract) : null,
      executed_at: r.executed_at,
      contract_no: r.contract_no,
      supplier: r.supplier,
    });
  }

  const target = quarter ? targetByQ[quarter] || 0 : targetByQ[0] || 0;

  return {
    year,
    quarter: quarter || null,
    plan_target: r2(target),
    totals: finish(total),
    byQuarter: [1, 2, 3, 4].map((q) => ({ quarter: q, plan_target: r2(targetByQ[q] || 0), ...finish(byQuarter[q]) })),
    byBranch: [...byBranch.values()]
      .map((e) => ({ branch_id: e.branch_id, branch_name: e.branch_name, ...finish(e.b) }))
      .sort((a, b) => a.branch_name.localeCompare(b.branch_name, 'ru')),
    cancelled: { count: cancelled.count, sum: r2(cancelled.sum) },
    purchases: list,
  };
}

function parseQuery(req) {
  const year = Number(req.query.year) || new Date().getFullYear();
  const quarter = req.query.quarter ? Number(req.query.quarter) : null;
  return { year, quarter: quarter >= 1 && quarter <= 4 ? quarter : null };
}

router.get('/execution', async (req, res) => {
  const { year, quarter } = parseQuery(req);
  try {
    res.json({ status: 'ok', report: await buildReport(year, quarter) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

// Выгрузка отчёта в Excel
router.get('/execution.xlsx', async (req, res) => {
  const { year, quarter } = parseQuery(req);
  try {
    const r = await buildReport(year, quarter);
    const t = r.totals;
    const wb = XLSX.utils.book_new();
    const add = (name, aoa, widths) => {
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = widths.map((w) => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    };

    add('Сводка', [
      [`Отчёт об исполнении закупок ${year}${quarter ? `, ${quarter} квартал` : ''}`],
      [],
      ['Показатель', 'Сумма, ₽', 'Закупок'],
      ['Установленный план (вручную)', r.plan_target, ''],
      ['План закупок (НМЦ, без внеплана)', t.plan, t.plan_count],
      ['Внеплан (НМЦ)', t.unplanned, t.unplanned_count],
      ['Всего по НМЦ', t.total_nmc, t.plan_count + t.unplanned_count],
      ['Исполнено (сумма договоров)', t.executed, t.executed_count],
      ['  из них по плану', t.executed_plan, ''],
      ['  из них внеплан', t.executed_unplanned, ''],
      ['Экономия', t.economy, ''],
      ['Перерасход', t.overrun, ''],
      ['Чистая экономия', t.net_economy, ''],
      ['В работе (не исполнено, НМЦ)', t.in_progress, t.in_progress_count],
      ['Отменено (НМЦ)', r.cancelled.sum, r.cancelled.count],
      ['% исполнения (по НМЦ)', t.execution_percent, ''],
    ], [42, 18, 12]);

    const cols = ['План', 'Внеплан', 'Исполнено', 'Экономия', 'Перерасход', 'В работе', '% исполнения'];
    const rowOf = (x) => [x.plan, x.unplanned, x.executed, x.economy, x.overrun, x.in_progress, x.execution_percent];
    add('По кварталам', [
      ['Квартал', 'Уст. план', ...cols],
      ...r.byQuarter.map((q) => [`${q.quarter} кв.`, q.plan_target, ...rowOf(q)]),
      ['Итого', r.byQuarter.reduce((s, q) => s + q.plan_target, 0), ...rowOf(t)],
    ], [12, 16, 16, 16, 16, 16, 16, 16, 14]);

    add('По филиалам', [
      ['Филиал', ...cols],
      ...r.byBranch.map((b) => [b.branch_name, ...rowOf(b)]),
    ], [28, 16, 16, 16, 16, 16, 16, 14]);

    add('Закупки', [
      ['Кв.', 'Наименование', 'Филиалы', 'Тип', 'НМЦ', 'Статус', 'Сумма договора', 'Экономия', 'Дата исполнения', '№ договора', 'Поставщик'],
      ...r.purchases.map((p) => [
        p.quarter, p.name, p.branches, p.unplanned ? 'Внеплан' : 'План', p.nmc,
        p.executed ? 'Исполнено' : 'В работе', p.contract_amount ?? '', p.economy ?? '',
        p.executed_at ? new Date(p.executed_at).toLocaleDateString('ru-RU') : '', p.contract_no || '', p.supplier || '',
      ]),
    ], [6, 60, 28, 10, 16, 12, 16, 14, 16, 16, 28]);

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fname = `Исполнение_закупок_${year}${quarter ? `_кв${quarter}` : ''}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`);
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
  }
});

module.exports = router;
