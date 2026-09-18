import { useSearchParams } from "react-router-dom";
import PurchasesTable from "../components/PurchasesTable";

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get("q") || "";
  const pendingOnly = params.get("pending") === "1";

  return (
    <PurchasesTable
      year={2026}
      quarter={null}
      search={q}
      pending={pendingOnly}
      showQuarterColumn
      title={pendingOnly ? "Закупки, ожидающие проверки" : `Результаты поиска: «${q}»`}
    />
  );
}
