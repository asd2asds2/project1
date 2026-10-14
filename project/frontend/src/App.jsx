import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./theme/ThemeContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";
import BranchesPage from "./pages/BranchesPage";
import AnnualPlanPage from "./pages/AnnualPlanPage";
import QuarterPage from "./pages/QuarterPage";
import SearchPage from "./pages/SearchPage";
import ManualPlanPage from "./pages/ManualPlanPage";

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<HomePage />} />
              <Route path="branches" element={<BranchesPage />} />
              <Route path="plan/annual" element={<AnnualPlanPage />} />
              <Route path="plan/q/:quarter" element={<QuarterPage />} />
              <Route path="plan/manual" element={<ManualPlanPage />} />
              <Route path="search" element={<SearchPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App