import { Role } from "@/hooks/use-role";
import { PageKey } from "@/pages/Index";
import {
  LayoutDashboard, AlertTriangle, GitBranch, FileText,
  Globe, CreditCard, ChevronLeft
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

const menuItems: { icon: typeof LayoutDashboard; label: string; page: PageKey; path: string }[] = [
  { icon: LayoutDashboard, label: "Dashboard", page: "dashboard", path: "/" },
  { icon: AlertTriangle, label: "Alerts", page: "alerts", path: "/alerts" },
  { icon: FileText, label: "Reports", page: "reports", path: "/reports" },
  { icon: Globe, label: "Jurisdiction Risk", page: "jurisdiction", path: "/jurisdiction-risk" },
  { icon: CreditCard, label: "Payment Rails", page: "payment", path: "/payment-rails" },
];

interface AppSidebarProps {
  role: Role;
  activePage?: PageKey;
}

export function AppSidebar({ role, activePage = "dashboard" }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

  return (
    <motion.aside
      animate={{ width: collapsed ? 60 : 220 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="h-[calc(100vh-3.5rem)] bg-sidebar border-r border-sidebar-border flex flex-col sticky top-14 overflow-hidden"
    >
      <nav className="flex-1 p-2 space-y-1 mt-2">
        {menuItems.map((item) => (
          <button
            key={item.label}
            onClick={() => navigate(item.path)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
              activePage === item.page
                ? "bg-sidebar-accent text-sidebar-primary font-medium"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            }`}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="whitespace-nowrap"
                >
                  {item.label}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        ))}
      </nav>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="p-3 border-t border-sidebar-border text-sidebar-foreground hover:text-sidebar-accent-foreground transition-colors"
      >
        <ChevronLeft className={`w-4 h-4 mx-auto transition-transform ${collapsed ? "rotate-180" : ""}`} />
      </button>
    </motion.aside>
  );
}
