import { motion } from "framer-motion";
import { useState } from "react";
import {
  CreditCard, Smartphone, Building, Landmark, Wifi, ArrowRightLeft,
  AlertTriangle, TrendingUp, Clock, Activity
} from "lucide-react";
import { KPICard } from "@/components/KPICard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area
} from "recharts";
import { useRingsQuery, usePaymentRailsQuery } from "@/hooks/use-queries";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04 } } };

type Rail = "upi" | "imps" | "neft" | "wallet" | "atm" | "branch";

const railIcons: Record<Rail, any> = {
  upi: Smartphone, imps: Activity, neft: Landmark,
  wallet: CreditCard, atm: Building, branch: Landmark,
};

export default function PaymentRailsPage() {
  const [selectedRail, setSelectedRail] = useState<Rail>("upi");

  const { data: rings, isLoading: isLoadingRings } = useRingsQuery();
  const { data: metrics, isLoading: isLoadingMetrics } = usePaymentRailsQuery();

  if (isLoadingRings || isLoadingMetrics || !rings || !metrics) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent flex items-center justify-center rounded-full animate-spin" />
      </div>
    );
  }

  const allRings = rings || [];
  const topRings = [...allRings].sort((a: any, b: any) => b.risk_score - a.risk_score);
  const totalRings = allRings.length;
  const totalBlockedAmount = allRings.reduce((sum: number, r: any) => sum + r.total_amount_blocked, 0);

  // We rely on metrics.railStats, metrics.failureSpikes, metrics.transitionMatrix
  // Safe fallbacks to prevent crashes if backend hasn't generated the matrix yet
  const railStats = metrics.railStats || {} as any;
  const failureSpikes = metrics.failureSpikes || [];
  const transitionMatrix = metrics.transitionMatrix || [];

  const data = railStats[selectedRail] || {
      volume: 0, 
      anomalyRate: 0, 
      latency: 0, 
      failures: 0, 
      muleRoutes: 0, 
      abuseScore: 0, 
      txns: 0
  };

  const chainDetection = topRings.slice(0, 5).map((ring: any) => ({
    chain: `${ring.pattern?.replace(/_/g, ' ').toUpperCase()} across ${ring.account_count} nodes`,
    risk: Math.round(ring.risk_score * 100),
    txns: ring.transaction_count,
    amount: `₹${ring.total_amount_blocked.toLocaleString()}`
  }));

  const formatCurrency = (val: number) => val > 0 ? `₹${(val / 10000000).toFixed(1)} Cr` : "₹0";
  const formatPerc = (val: number) => typeof val === 'number' ? `${val.toFixed(1)}%` : '0%';
  const formatLatency = (val: number) => val >= 1000 ? `${(val/1000).toFixed(1)}s` : `${Math.round(val || 0)}ms`;
  const formatTxns = (val: number) => val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : `${(val / 1000 || 0).toFixed(1)}k`;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Payment Rails Monitor</h1>
        <p className="text-sm text-muted-foreground mt-1">Cross-channel rail monitoring, anomaly detection & mule route analysis</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Live Blocked Volume" value={formatCurrency(totalBlockedAmount)} icon={CreditCard} variant="critical" live liveBase={0} liveVariance={0} />
        <KPICard title="Cross-Rail Mule Routes" value={totalRings.toString()} icon={ArrowRightLeft} variant="critical" live liveBase={totalRings} liveVariance={0} />
        <KPICard title="Avg Anomaly Rate" value="1.6%" icon={AlertTriangle} variant="warning" />
        <KPICard title="Chain Detections" value={topRings.length.toString()} icon={TrendingUp} variant="telemetry" />
      </div>

      {/* Rail tabs */}
      <div className="glass-card p-1 flex gap-1 flex-wrap">
        {(Object.keys(railIcons) as Rail[]).map(r => {
          const Icon = railIcons[r];
          return (
            <button key={r} onClick={() => setSelectedRail(r)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${selectedRail === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <Icon className="w-3.5 h-3.5" /> {r.toUpperCase()}
            </button>
          );
        })}
      </div>

      {/* Rail stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "Volume Blocked", value: formatCurrency(data.volume) },
          { label: "Transactions", value: formatTxns(data.txns) },
          { label: "Anomaly Rate", value: formatPerc(data.anomalyRate) },
          { label: "Latency", value: formatLatency(data.latency) },
          { label: "Failures", value: formatPerc(data.failures) },
          { label: "Mule Routes", value: (data.muleRoutes || 0).toString() },
          { label: "Abuse Score", value: `${data.abuseScore || 0}/100` },
        ].map(s => (
          <div key={s.label} className="glass-card p-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">{s.label}</span>
            <span className="text-sm font-bold mono text-foreground">{s.value}</span>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Failure spikes */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Anomaly Spikes</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={failureSpikes}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} unit="%" />
              <Tooltip contentStyle={{ background: "hsl(222, 47%, 9%)", border: "1px solid hsl(222, 30%, 18%)", borderRadius: "8px", fontSize: 12 }} />
              <Area type="monotone" dataKey="upi" stroke="hsl(217, 91%, 60%)" fill="hsl(217, 91%, 60%)" fillOpacity={0.1} strokeWidth={2} />
              <Area type="monotone" dataKey="wallet" stroke="hsl(25, 95%, 53%)" fill="hsl(25, 95%, 53%)" fillOpacity={0.1} strokeWidth={2} />
              <Area type="monotone" dataKey="atm" stroke="hsl(0, 72%, 51%)" fill="hsl(0, 72%, 51%)" fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Chain detection */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-risk-critical" /> Top Live Chain Detections
          </h3>
          <div className="space-y-2">
            {chainDetection.map((c: any, i: number) => (
              <div key={i} className="p-3 rounded-xl border border-border bg-secondary/20 hover:bg-secondary/40 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${c.risk > 90 ? "bg-risk-critical/15 text-risk-critical" : c.risk > 80 ? "bg-risk-high/15 text-risk-high" : "bg-risk-medium/15 text-risk-medium"}`}>{c.risk}% RISK</span>
                  <span className="text-xs font-bold text-foreground">{c.amount} Blocked</span>
                </div>
                <p className="text-xs font-medium text-foreground/80 mt-2">{c.chain}</p>
                <span className="text-[10px] text-muted-foreground mt-1 inline-block">{c.txns} Suspicious Transactions Executed</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Transition Matrix */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Rail Transition Matrix (Mule Flow %)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border">
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">From ↓ / To →</th>
              <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">UPI</th>
              <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">IMPS</th>
              <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">NEFT</th>
              <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">Wallet</th>
              <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">ATM</th>
              <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">Branch</th>
            </tr></thead>
            <tbody>
              {transitionMatrix.map((r: any, i: number) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-2 px-3 text-xs font-medium text-foreground">{r.from}</td>
                  {[r.upi, r.imps, r.neft, r.wallet, r.atm, r.branch].map((v, j) => (
                    <td key={j} className={`py-2 px-3 text-center text-xs mono ${v === "-" ? "text-muted-foreground" : parseInt(v as string) > 20 ? "text-risk-critical font-bold" : parseInt(v as string) > 10 ? "text-risk-high" : "text-muted-foreground"}`}>
                      {v === "-" ? "-" : `${v}%`}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
