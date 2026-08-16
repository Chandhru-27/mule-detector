import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import AlertsPage from "./pages/AlertsPage.tsx";
import GraphIntelligencePage from "./pages/GraphIntelligencePage.tsx";
import ReportsPage from "./pages/ReportsPage.tsx";
import JurisdictionRiskPage from "./pages/JurisdictionRiskPage.tsx";
import PaymentRailsPage from "./pages/PaymentRailsPage.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/alerts" element={<Index page="alerts" />} />
          <Route path="/graph-intelligence" element={<Index page="graph" />} />
          <Route path="/reports" element={<Index page="reports" />} />
          <Route path="/jurisdiction-risk" element={<Index page="jurisdiction" />} />
          <Route path="/payment-rails" element={<Index page="payment" />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
