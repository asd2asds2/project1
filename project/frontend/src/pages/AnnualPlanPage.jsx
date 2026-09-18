import PurchasesTable from "../components/PurchasesTable";

export default function AnnualPlanPage() {
  return (
    <PurchasesTable
      year={2026}
      quarter={null}
      showQuarterColumn
      title=" 1Z Годовой план 2026 (Центр + филиалы)"
    />
  );
}
