import { motion } from "framer-motion";
import { Role, roleLabels } from "@/hooks/use-role";
import { Shield, TrendingUp, Terminal } from "lucide-react";

const roleIcons: Record<Role, React.ReactNode> = {
  regulator: <Shield className="w-4 h-4" />,
  developer: <Terminal className="w-4 h-4" />,
};

interface RoleSwitcherProps {
  role: Role;
  onSwitch: (r: Role) => void;
}

export function RoleSwitcher({ role, onSwitch }: RoleSwitcherProps) {
  const roles: Role[] = ["regulator", "developer"];

  return (
    <div className="relative flex items-center gap-1 rounded-xl bg-secondary/80 p-1 backdrop-blur-sm border border-border">
      {roles.map((r) => (
        <button
          key={r}
          onClick={() => onSwitch(r)}
          className="relative z-10 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200"
          style={{ color: role === r ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))" }}
        >
          {role === r && (
            <motion.div
              layoutId="role-bg"
              className="absolute inset-0 rounded-lg bg-primary glow-primary"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          <span className="relative flex items-center gap-2">
            {roleIcons[r]}
            <span className="hidden md:inline">{roleLabels[r]}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
