import PurchasesTable from "../components/PurchasesTable";

export default function AnnualPlanPage() {
  return (
    <PurchasesTable
      year={2026}
      quarter={null}
      showQuarterColumn
      title="Годовой план 2026 (Центр + филиалы)"
    />
  );
}
