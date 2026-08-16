import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { useLiveCounter } from "@/hooks/use-live-data";

interface KPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  variant?: "default" | "critical" | "warning" | "safe" | "telemetry";
  live?: boolean;
  liveBase?: number;
  liveVariance?: number;
}

const variantStyles = {
  default: "border-border",
  critical: "border-risk-critical/30 glow-critical",
  warning: "border-risk-high/30",
  safe: "border-risk-safe/30",
  telemetry: "border-telemetry/30 glow-telemetry",
};

const iconVariantStyles = {
  default: "text-primary bg-primary/10",
  critical: "text-risk-critical bg-risk-critical/10",
  warning: "text-risk-high bg-risk-high/10",
  safe: "text-risk-safe bg-risk-safe/10",
  telemetry: "text-telemetry bg-telemetry/10",
};

export function KPICard({ title, value, icon: Icon, trend, variant = "default", live, liveBase, liveVariance }: KPICardProps) {
  const liveValue = useLiveCounter(liveBase || 0, liveVariance || 10);
  const displayValue = live && liveBase ? liveValue.toLocaleString() : value;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`kpi-card ${variantStyles[variant]}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
        <div className={`p-2 rounded-lg ${iconVariantStyles[variant]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold text-foreground mono">{displayValue}</span>
        {trend && (
          <span className={`text-xs font-medium mb-1 ${trend.startsWith("+") ? "text-risk-critical" : "text-risk-safe"}`}>
            {trend}
          </span>
        )}
      </div>
    </motion.div>
  );
}
