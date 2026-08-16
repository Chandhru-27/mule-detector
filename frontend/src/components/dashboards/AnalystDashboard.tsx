import { motion } from "framer-motion";
import {
  Activity, AlertTriangle, Ban, Users, Target,
  Fingerprint, Smartphone, CreditCard, Wifi, UserX,
  Lock, RefreshCw, Share2, ArrowUpRight, FileText
} from "lucide-react";
import { KPICard } from "@/components/KPICard";
import { GraphVisualization } from "@/components/GraphVisualization";
import { useLiveAlertsQueue } from "@/hooks/use-live-data";
import { useAccountSearchQuery, useRiskScoresQuery, useAnalystMetricsQuery } from "@/hooks/use-queries";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const priorityStyles = {
  critical: "priority-critical",
  high: "priority-high",
  medium: "priority-medium",
  low: "priority-low",
};

function RiskBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-32 truncate">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8 }}
          className={`h-full rounded-full ${value > 85 ? "bg-risk-critical" : value > 70 ? "bg-risk-high" : value > 50 ? "bg-risk-medium" : "bg-risk-safe"}`}
        />
      </div>
      <span className="text-xs mono font-bold text-foreground w-8 text-right">{value}</span>
    </div>
  );
}

export function AnalystDashboard() {
  const alerts = useLiveAlertsQueue();
  const { data: suspiciousAccount, isLoading: isAccLoading } = useAccountSearchQuery("DEFAULT_PAN");
  const { data: riskScores, isLoading: isRiskLoading } = useRiskScoresQuery();

  const bankKPIs = { 
    liveTPS: 450, 
    totalFlaggedTxns: 124, 
    flaggedAmount: 85600000,
    flaggedTxns: 124,
    blockedAccounts: 0,
    suspiciousAccounts: 0,
    falsePositiveRate: "1.2%"
  }; // Placeholder

  if (isAccLoading || isRiskLoading || !suspiciousAccount || !riskScores) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent flex items-center justify-center rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">AML Investigation War Room</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time Fraud Detection & Analysis</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard title="Live TPS" value={bankKPIs.liveTPS.toLocaleString()} icon={Activity} variant="telemetry" live liveBase={12847} liveVariance={200} />
        <KPICard title="Flagged Txns" value={bankKPIs.flaggedTxns.toLocaleString()} icon={AlertTriangle} variant="critical" live liveBase={2341} liveVariance={10} />
        <KPICard title="Blocked Accounts" value={bankKPIs.blockedAccounts} icon={Ban} variant="warning" />
        <KPICard title="Suspicious Accounts" value={bankKPIs.suspiciousAccounts} icon={Users} variant="warning" live liveBase={892} liveVariance={3} />
        <KPICard title="False Positive Rate" value={bankKPIs.falsePositiveRate} icon={Target} variant="safe" />
      </div>

      {/* Alerts + Account 360 */}
      <div className="grid lg:grid-cols-5 gap-4">
        {/* Live alerts */}
        <div className="lg:col-span-2 glass-card p-4 max-h-[420px] overflow-y-auto scrollbar-thin">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-risk-critical" />
            Live Alerts Queue
          </h3>
          <div className="space-y-2">
            {alerts.map((alert, i) => (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className={`p-3 rounded-xl border bg-card/40 hover:bg-card/60 transition-all cursor-pointer ${alert.priority === "critical" ? "border-risk-critical/30" : "border-border"}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${priorityStyles[alert.priority]}`}>
                      {alert.priority}
                    </span>
                    <span className="text-[10px] text-muted-foreground mono">{alert.id}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{alert.time}</span>
                </div>
                <p className="text-xs text-foreground/90">{alert.message}</p>
                <span className="text-[10px] text-muted-foreground mt-1 block">{alert.bank}</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Account 360 */}
        <div className="lg:col-span-3 glass-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Fingerprint className="w-4 h-4 text-primary" />
            Suspicious Account 360°
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-secondary/40 border border-border">
                <div className="flex items-center gap-2 mb-1.5">
                  <Fingerprint className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">PAN Hash</span>
                </div>
                <span className="text-sm mono font-bold text-foreground">{suspiciousAccount.panHash}</span>
              </div>
              <div className="p-3 rounded-xl bg-secondary/40 border border-border">
                <div className="flex items-center gap-2 mb-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Linked Devices</span>
                </div>
                {suspiciousAccount.deviceIds.map((d) => (
                  <span key={d} className="text-xs mono text-foreground/80 block">{d}</span>
                ))}
              </div>
              <div className="p-3 rounded-xl bg-secondary/40 border border-border">
                <div className="flex items-center gap-2 mb-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Wallets</span>
                </div>
                {suspiciousAccount.wallets.map((w) => (
                  <span key={w} className="text-xs mono text-foreground/80 block">{w}</span>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-secondary/40 border border-border">
                <div className="flex items-center gap-2 mb-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">ATM Cards</span>
                </div>
                {suspiciousAccount.atmCards.map((c) => (
                  <span key={c} className="text-xs mono text-foreground/80 block">{c}</span>
                ))}
              </div>
              <div className="p-3 rounded-xl bg-secondary/40 border border-border">
                <div className="flex items-center gap-2 mb-1.5">
                  <Wifi className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">IP Addresses</span>
                </div>
                {suspiciousAccount.ips.map((ip) => (
                  <span key={ip} className="text-xs mono text-foreground/80 block">{ip}</span>
                ))}
              </div>
              <div className="p-3 rounded-xl bg-secondary/40 border border-border">
                <div className="flex items-center gap-2 mb-1.5">
                  <UserX className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk Score</span>
                </div>
                <span className="text-2xl font-bold text-risk-critical mono">{suspiciousAccount.riskScore}</span>
                <span className="text-xs text-muted-foreground ml-1">/ 100</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Graph + Risk Scores */}
      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <GraphVisualization title="Investigation Graph: Account → Wallet → UPI → ATM → Beneficiary" />
        </div>
        <div className="lg:col-span-2 glass-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Behaviour Risk Scores</h3>
          <div className="space-y-3">
            <RiskBar label="Fan In" value={riskScores.fanIn} />
            <RiskBar label="Fan Out" value={riskScores.fanOut} />
            <RiskBar label="Hop Depth" value={riskScores.hopDepth} />
            <RiskBar label="Fragmentation" value={riskScores.fragmentation} />
            <RiskBar label="Structuring" value={riskScores.structuring} />
            <RiskBar label="Layering Complexity" value={riskScores.layeringComplexity} />
            <RiskBar label="Jurisdiction Risk" value={riskScores.jurisdictionRisk} />
            <RiskBar label="Sanctions" value={riskScores.sanctionsBehaviour} />
            <RiskBar label="GNN Confidence" value={riskScores.gnnConfidence} />
          </div>
        </div>
      </div>

      {/* SAR Preview + Actions */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            SAR Auto-Report Preview
          </h3>
          <div className="p-4 rounded-xl bg-secondary/30 border border-border space-y-3">
            <div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Summary</span>
              <p className="text-sm text-foreground mt-1">Detected mule ring involving 47 accounts across SBI, HDFC, and ICICI banks. Primary hub account shows fan-out pattern with ₹4.9L transferred via Paytm wallet to UAE beneficiary. GNN confidence: 96%.</p>
            </div>
            <div className="flex items-center gap-4">
              <div>
                <span className="text-[10px] text-muted-foreground uppercase">Confidence</span>
                <span className="block text-lg font-bold text-risk-safe mono">96%</span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase">Evidence Nodes</span>
                <span className="block text-lg font-bold text-foreground mono">47</span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase">Timeline</span>
                <span className="block text-lg font-bold text-foreground mono">72h</span>
              </div>
            </div>
            <button className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              Export PDF Report
            </button>
          </div>
        </div>

        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h3>
          <div className="space-y-2">
            {[
              { label: "Block Account", icon: Ban, variant: "bg-risk-critical/15 text-risk-critical border-risk-critical/30 hover:bg-risk-critical/25" },
              { label: "Freeze Transaction", icon: Lock, variant: "bg-risk-high/15 text-risk-high border-risk-high/30 hover:bg-risk-high/25" },
              { label: "Escalate to RBI", icon: ArrowUpRight, variant: "bg-primary/15 text-primary border-primary/30 hover:bg-primary/25" },
              { label: "Refresh KYC", icon: RefreshCw, variant: "bg-risk-medium/15 text-risk-medium border-risk-medium/30 hover:bg-risk-medium/25" },
              { label: "Share Fingerprint", icon: Share2, variant: "bg-telemetry/15 text-telemetry border-telemetry/30 hover:bg-telemetry/25" },
            ].map((action) => (
              <button
                key={action.label}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${action.variant}`}
              >
                <action.icon className="w-4 h-4" />
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
