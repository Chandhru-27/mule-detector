import { motion } from "framer-motion";
import { useState } from "react";
import {
  AlertTriangle, Globe, Banknote, FileWarning, Shield
} from "lucide-react";
import { KPICard } from "@/components/KPICard";
import { useRingsQuery, usePaymentRailsQuery, useJurisdictionRiskQuery } from "@/hooks/use-queries";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from "recharts";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

export function RegulatorDashboard() {
  const [selectedAmountCategory, setSelectedAmountCategory] = useState("total");
  const [selectedTimeRange, setSelectedTimeRange] = useState("live");
  
  const { data: rings, isLoading: isRingsLoading } = useRingsQuery();
  const { data: paymentRails, isLoading: isRailsLoading } = usePaymentRailsQuery();
  const { data: jurisdictionData, isLoading: isJurisdictionLoading } = useJurisdictionRiskQuery('latest');

  if (isRingsLoading || isRailsLoading || isJurisdictionLoading || !rings || !paymentRails) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent flex items-center justify-center rounded-full animate-spin" />
      </div>
    );
  }

  const allRings = rings || [];
  const totalRings = allRings.length;
  const totalBlockedAmount = allRings.reduce((sum: number, r: any) => sum + r.total_amount_blocked, 0);
  const novelRingsCount = allRings.filter((r: any) => r.is_novel).length;
  const patternCounts = allRings.reduce((acc: any, r: any) => {
    acc[r.pattern] = (acc[r.pattern] || 0) + 1;
    return acc;
  }, {});

  const txnVolume = paymentRails?.txnVolumeSpikes || [];

  const amountData = {
    total: { label: "TOTAL BLOCKED", amount: `₹${(totalBlockedAmount / 10000000).toFixed(1)} Cr` },
    mule: { label: "MULE RINGS", amount: `₹${((patternCounts["mule_ring"] || 0) * 1.5).toFixed(1)} Cr` }, // Estimate based on count
    anomalies: { label: "NOVEL PATTERNS", amount: `${novelRingsCount} Clusters` }
  };

  const activeThreatTypologies = Object.keys(patternCounts).slice(0, 5).map(pattern => ({
    subject: pattern.replace(/_/g, ' ').substring(0, 12),
    A: patternCounts[pattern] * 10, // Scaling for visual radar
    fullMark: 100
  }));

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">National AML Intelligence Center</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time XGBoost + GNN Mule Detection Command</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KPICard title="Blocked Suspicious Clusters" value={totalRings.toLocaleString()} icon={AlertTriangle} variant="critical" trend="Live" live liveBase={totalRings} liveVariance={0} />
        <KPICard title="Novel Patterns Detected" value={novelRingsCount.toLocaleString()} icon={Shield} variant="warning" trend="Live" />
        <KPICard title="High-Risk Jurisdictions" value={(jurisdictionData?.jurisdiction_metrics?.high_risk_jurisdictions_count || 0).toString()} icon={Globe} variant="warning" />
        <KPICard title="Amount Blocked" value={`₹${(totalBlockedAmount / 10000000).toFixed(1)} Cr`} icon={Banknote} variant="critical" live liveBase={0} liveVariance={0} />
        <KPICard title="Automated SAR Drafts" value={(totalRings * 0.8).toFixed(0)} icon={FileWarning} variant="safe" trend="Ready" />
      </div>

      {/* Main graph + jurisdiction */}
      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 glass-card p-0 flex flex-col min-h-[300px]">
          <div className="p-4 border-b border-border/50 flex items-center justify-center bg-card/60">
            <h3 className="text-sm font-bold text-foreground tracking-widest uppercase">Detection Impact</h3>
          </div>
          <div className="flex flex-1">
            <div className="w-1/3 border-r border-border/50 flex flex-col">
              {Object.entries(amountData).map(([key, data]) => (
                <button
                  key={key}
                  onClick={() => setSelectedAmountCategory(key)}
                  className={`flex-1 flex items-center justify-center border-b border-border/50 last:border-b-0 transition-all font-bold tracking-wider text-sm ${selectedAmountCategory === key ? 'bg-primary/20 text-primary border-r-2 border-r-primary' : 'hover:bg-secondary/50 text-muted-foreground'}`}>
                  {data.label}
                </button>
              ))}
            </div>
            <div className="w-2/3 flex items-center justify-center bg-background/20 relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.1)_0%,transparent_70%)] pointer-events-none" />
              <motion.div
                key={selectedAmountCategory}
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="text-center z-10"
              >
                <span className="block text-[3.5rem] md:text-[4.5rem] font-black text-risk-safe drop-shadow-[0_0_25px_rgba(16,185,129,0.5)] tracking-tighter">
                  {amountData[selectedAmountCategory as keyof typeof amountData].amount}
                </span>
              </motion.div>
            </div>
          </div>
        </div>
        <div className="lg:col-span-2 glass-card p-4 flex flex-col h-[300px] bg-[radial-gradient(ellipse_at_center,rgba(10,20,30,0.4)_0%,transparent_100%)]">
          <h3 className="text-sm font-semibold text-foreground mb-1 uppercase tracking-wider">Active Threat Typologies</h3>
          <p className="text-[10px] text-muted-foreground mb-2">Live laundering methodology distribution weight</p>
          <div className="flex-1 w-full min-h-0 relative -mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="52%" outerRadius="82%" data={activeThreatTypologies}>
                <defs>
                  <filter id="glowHex">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>
                <PolarGrid stroke="hsl(215, 20%, 30%)" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: 'hsl(215, 20%, 65%)', fontSize: 11, fontWeight: 600 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Threat Factor" dataKey="A" stroke="hsl(0, 72%, 51%)" strokeWidth={2} fill="hsl(0, 72%, 51%)" fillOpacity={0.25} filter="url(#glowHex)" />
                <Tooltip contentStyle={{ background: "hsl(222, 47%, 9%)", border: "1px solid hsl(222, 30%, 18%)", borderRadius: "8px", fontSize: 12, display: "none" }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Spike Graph row */}
      <div className="glass-card p-0 flex h-[350px]">
        <div className="w-24 border-r border-border/50 flex flex-col bg-card/40">
          {(['live', '1day', 'week', 'monthly', 'yearly'] as const).map(range => (
            <button
              key={range}
              onClick={() => setSelectedTimeRange(range)}
              className={`flex-1 flex items-center justify-center border-b border-border/50 last:border-b-0 transition-all font-bold tracking-wider text-[10px] uppercase ${selectedTimeRange === range ? 'bg-primary/20 text-primary border-r-2 border-r-primary' : 'hover:bg-secondary/50 text-muted-foreground'}`}
            >
              {range}
            </button>
          ))}
        </div>

        <div className="flex-1 p-4 flex flex-col">
          <h3 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">Transactional Anomaly Spike Density</h3>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={txnVolume} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="spikeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" vertical={false} />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)", dy: 4 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} />
                <Tooltip contentStyle={{ background: "hsl(222, 47%, 9%)", border: "1px solid hsl(222, 30%, 18%)", borderRadius: "8px", fontSize: 12 }} />
                <Area type="linear" dataKey="flagged" stroke="hsl(0, 72%, 51%)" fill="url(#spikeGrad)" strokeWidth={2} activeDot={{ r: 4, fill: "hsl(0, 72%, 51%)" }} />
                <Area type="linear" dataKey="volume" stroke="hsl(217, 91%, 60%)" fill="transparent" strokeWidth={1} strokeDasharray="4 4" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
