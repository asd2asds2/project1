import { useParams } from "react-router-dom";
import PurchasesTable from "../components/PurchasesTable";
import NoYearNotice from "../components/NoYearNotice";
import { useYear } from "../context/YearContext";

export default function QuarterPage() {
  const { quarter } = useParams();
  const q = Number(quarter);
  const { year } = useYear();
  if (!year) return <NoYearNotice />;

  return (
    <PurchasesTable
      key={`${year}-${q}`}
      year={year}
      quarter={q}
      title={`${q} квартал ${year}`}
    />
  );
}
