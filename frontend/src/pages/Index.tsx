import { Navbar } from "@/components/Navbar";
import { AppSidebar } from "@/components/AppSidebar";
import { useRole } from "@/hooks/use-role";
import { RegulatorDashboard } from "@/components/dashboards/RegulatorDashboard";
import { AnalystDashboard } from "@/components/dashboards/AnalystDashboard";
import { DeveloperDashboard } from "@/components/dashboards/DeveloperDashboard";
import AlertsPage from "@/pages/AlertsPage";
import GraphIntelligencePage from "@/pages/GraphIntelligencePage";
import ReportsPage from "@/pages/ReportsPage";
import JurisdictionRiskPage from "@/pages/JurisdictionRiskPage";
import PaymentRailsPage from "@/pages/PaymentRailsPage";
import { AnimatePresence, motion } from "framer-motion";

export type PageKey = "dashboard" | "alerts" | "graph" | "reports" | "jurisdiction" | "payment";

interface IndexProps {
  page?: PageKey;
}

const Index = ({ page = "dashboard" }: IndexProps) => {
  const { role, switchRole } = useRole();

  const renderPage = () => {
    switch (page) {
      case "alerts": return <AlertsPage />;
      case "graph": return <GraphIntelligencePage />;
      case "reports": return <ReportsPage />;
      case "jurisdiction": return <JurisdictionRiskPage />;
      case "payment": return <PaymentRailsPage />;
      default:
        if (role === "regulator") return <RegulatorDashboard />;
        if (role === "analyst") return <AnalystDashboard />;
        return <DeveloperDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar role={role} onSwitch={switchRole} />
      <div className="flex">
        <AppSidebar role={role} activePage={page} />
        <main className="flex-1 p-6 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={page + (page === "dashboard" ? role : "")}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              {renderPage()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

export default Index;
