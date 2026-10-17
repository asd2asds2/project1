import { useSearchParams } from "react-router-dom";
import PurchasesTable from "../components/PurchasesTable";
import NoYearNotice from "../components/NoYearNotice";
import { useYear } from "../context/YearContext";

export default function SearchPage() {
  const [params] = useSearchParams();
  const { year } = useYear();
  const q = params.get("q") || "";
  const pendingOnly = params.get("pending") === "1";
  if (!year) return <NoYearNotice />;

  return (
    <PurchasesTable
      key={year}
      year={year}
      quarter={null}
      search={q}
      pending={pendingOnly}
      showQuarterColumn
      title={pendingOnly ? "Закупки, ожидающие проверки" : `Результаты поиска: «${q}»`}
    />
  );
}
