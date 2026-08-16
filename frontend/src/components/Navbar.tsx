import { RoleSwitcher } from "./RoleSwitcher";
import { Role } from "@/hooks/use-role";
import { Bell, Search, Shield } from "lucide-react";
import { usePulse } from "@/hooks/use-live-data";

interface NavbarProps {
  role: Role;
  onSwitch: (r: Role) => void;
}

export function Navbar({ role, onSwitch }: NavbarProps) {
  const pulse = usePulse(4000);

  return (
    <header className="h-14 flex items-center justify-between px-4 border-b border-border bg-card/60 backdrop-blur-xl sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          <span className="font-bold text-sm tracking-wide text-foreground">SHIELD<span className="text-primary">AML</span></span>
        </div>
      </div>

      <RoleSwitcher role={role} onSwitch={onSwitch} />

      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/60 border border-border text-sm text-muted-foreground">
          <Search className="w-3.5 h-3.5" />
          <span>Search...</span>
          <kbd className="ml-2 text-xs bg-accent px-1.5 py-0.5 rounded">⌘K</kbd>
        </div>

        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${pulse ? "bg-risk-safe/20 text-risk-safe" : "bg-risk-safe/10 text-risk-safe/80"} transition-all`}>
          <span className={`w-1.5 h-1.5 rounded-full bg-risk-safe ${pulse ? "animate-pulse-glow" : ""}`} />
          LIVE
        </div>

        <button className="relative p-2 rounded-lg hover:bg-secondary transition-colors">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-risk-critical rounded-full" />
        </button>

        <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
          AO
        </div>
      </div>
    </header>
  );
}
