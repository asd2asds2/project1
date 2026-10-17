import PurchasesTable from "../components/PurchasesTable";
import NoYearNotice from "../components/NoYearNotice";
import { useYear } from "../context/YearContext";

export default function AnnualPlanPage() {
  const { year } = useYear();
  if (!year) return <NoYearNotice />;

  return (
    <PurchasesTable
      key={year}
      year={year}
      quarter={null}
      showQuarterColumn
      title={`Годовой план ${year} (Центр + филиалы)`}
    />
  );
}
