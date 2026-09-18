// Единая палитра цветов филиалов — используется везде, где нужно показать
// цветовую метку филиала (таблица закупок, дашборд, страница "Филиалы").
// Если у филиала не задан свой цвет (b.color === null/undefined) — берём
// цвет из этой палитры по остатку от деления id, чтобы каждый филиал
// стабильно получал какой-то определённый (но конкретный — какой именно,
// не важно) цвет без ручной настройки. То же самое делает и backend
// (см. branches.js) — оба места используют один и тот же список, чтобы
// цвет не "прыгал" между перезагрузками страниц.
export const BRANCH_PALETTE = [
  "#2f6fed", "#1a8a4e", "#b6780f", "#8a4fd1",
  "#d1477a", "#0f9aa6", "#c0392b", "#5a6b8c",
  "#7a9e1e", "#b8860b", "#4a5fd1", "#c2185b",
];

export function colorForBranch(branch) {
  if (!branch) return "var(--text-muted)";
  if (branch.color) return branch.color;
  const id = Number(branch.id) || 0;
  return BRANCH_PALETTE[id % BRANCH_PALETTE.length];
}

// Быстрый доступ по branch_id, когда под рукой только id, а не весь объект
// филиала (например, при разборе p.shares, где есть branch_id и branch_name,
// но полного списка филиалов может не быть под рукой без поиска).
export function colorForBranchId(branches, branchId) {
  const b = branches.find((x) => Number(x.id) === Number(branchId));
  return colorForBranch(b || { id: branchId });
}
