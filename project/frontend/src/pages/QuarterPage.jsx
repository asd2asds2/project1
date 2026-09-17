import { useParams } from "react-router-dom";
import PurchasesTable from "../components/PurchasesTable";

export default function QuarterPage() {
  const { quarter } = useParams();
  const q = Number(quarter);

  return (
    <PurchasesTable
      year={2026}
      quarter={q}
      title={`${q} квартал 2026`}
    />
  );
}
