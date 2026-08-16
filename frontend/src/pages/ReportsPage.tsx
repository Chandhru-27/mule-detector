import { motion } from "framer-motion";
import { useState, useRef } from "react";
import {
  FileText, Download, FileSpreadsheet, TrendingUp, Users,
  Target, BarChart3, PieChart as PieChartIcon, Calendar, Clock
} from "lucide-react";
import { KPICard } from "@/components/KPICard";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell
} from "recharts";
import { useRingsQuery, useReportsMetricsQuery } from "@/hooks/use-queries";
import { downloadSAR } from "@/lib/sar-pdf";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04 } } };

const colors = ["hsl(0, 72%, 51%)", "hsl(25, 95%, 53%)", "hsl(45, 93%, 47%)", "hsl(187, 92%, 55%)", "hsl(217, 91%, 60%)", "hsl(160, 84%, 39%)", "#8E44AD", "#C0392B", "#FF8C00", "#16A085"];

const statusColors: Record<string, string> = {
  Filed: "bg-risk-safe/15 text-risk-safe border-risk-safe/30",
  Pending: "bg-risk-medium/15 text-risk-medium border-risk-medium/30",
  Draft: "bg-muted text-muted-foreground border-border",
};

export default function ReportsPage() {
  const [tab, setTab] = useState<"sar" | "compliance">("sar");

  const { data: rings, isLoading: ringsLoading } = useRingsQuery();
  const { data: metrics, isLoading: metricsLoading } = useReportsMetricsQuery();

  if (ringsLoading || metricsLoading || !rings || !metrics) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent flex items-center justify-center rounded-full animate-spin" />
      </div>
    );
  }

  const allRings = rings || [];
  const topRings = [...allRings].sort((a: any, b: any) => b.risk_score - a.risk_score);
  const totalRings = allRings.length;

  const patternCounts = allRings.reduce((acc: any, r: any) => {
    acc[r.pattern] = (acc[r.pattern] || 0) + 1;
    return acc;
  }, {});

  const typologies = Object.keys(patternCounts).map((key, index) => ({
    name: key?.replace(/_/g, ' '),
    value: patternCounts[key],
    fill: colors[index % colors.length]
  }));

  // Dynamic Metrics loaded from API
  const sarReports = metrics.sarReports || [];
  const weeklyTrend = metrics.weeklyTrend || [];
  const modelMetrics = metrics.modelMetrics || [];
  const analystMetrics = metrics.analystMetrics || [];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Reports & Compliance</h1>
          <p className="text-sm text-muted-foreground mt-1">Executive reporting, SAR management & regulatory exports</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="SARs This Month" value={sarReports.length.toString()} icon={FileText} variant="default" />
        <KPICard title="Filing Rate" value="94.2%" icon={Target} variant="safe" />
        <KPICard title="Avg Confidence" value="95.2%" icon={BarChart3} variant="telemetry" />
        <KPICard title="RBI Submissions" value="387" icon={TrendingUp} variant="default" />
      </div>

      {/* Tabs */}
      <div className="glass-card p-1 inline-flex gap-1" data-html2canvas-ignore>
        {(["sar", "compliance"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "sar" ? "SAR Reports" : "RBI Compliance"}
          </button>
        ))}
      </div>

      {tab === "sar" && (
        <div className="space-y-4">
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">SAR Report Queue</h3>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto w-full scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#0F1117] z-10">
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">SAR ID</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Date</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Bank</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Typology</th>
                    <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">Entities</th>
                    <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">Confidence</th>
                    <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground" data-html2canvas-ignore>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sarReports.map((r: any, i: number) => (
                    <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.02, 0.5) }}
                      className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="py-2 px-3 mono text-xs font-medium text-primary">{r.id}</td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">{r.date}</td>
                      <td className="py-2 px-3 text-xs text-foreground">{r.bank}</td>
                      <td className="py-2 px-3 text-xs text-foreground capitalize truncate max-w-[120px]" title={r.type}>{r.type}</td>
                      <td className="py-2 px-3 text-center mono text-xs text-muted-foreground">{r.entities}</td>
                      <td className="py-2 px-3 text-center"><span className={`text-xs font-bold ${r.confidence > 90 ? "text-risk-safe" : "text-risk-medium"}`}>{r.confidence ? `${r.confidence}%` : 'Novel'}</span></td>
                      <td className="py-2 px-3 text-center"><span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusColors[r.status] || "bg-muted text-muted-foreground border-border"}`}>{r.status}</span></td>
                      <td className="py-2 px-3 text-center">
                        <button onClick={() => downloadSAR(r.id)} className="p-1 rounded hover:bg-secondary transition-colors"><Download className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "compliance" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Weekly Fraud Trend</h3>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={weeklyTrend}>
                <defs>
                  <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} />
                <Tooltip contentStyle={{ background: "hsl(222, 47%, 9%)", border: "1px solid hsl(222, 30%, 18%)", borderRadius: "8px", fontSize: 12 }} />
                <Area type="monotone" dataKey="total" stroke="hsl(217, 91%, 60%)" fill="url(#trendGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="critical" stroke="hsl(0, 72%, 51%)" fill="hsl(0, 72%, 51%)" fillOpacity={0.1} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Top Mule Typologies</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={typologies} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {typologies.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(222, 47%, 9%)", border: "1px solid hsl(222, 30%, 18%)", borderRadius: "8px", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-3 mt-2">
              {typologies.map(t => (
                <div key={t.name} className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: t.fill }} /><span className="text-[10px] text-muted-foreground capitalize">{t.name.substring(0, 10)}...</span></div>
              ))}
            </div>
          </div>

          <div className="glass-card p-4 lg:col-span-2">
            <h3 className="text-sm font-semibold text-foreground mb-3">Model Performance</h3>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border">
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Model</th>
                <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">Precision</th>
                <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">Recall</th>
                <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">F1 Score</th>
                <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">AUC-ROC</th>
              </tr></thead>
              <tbody>
                {modelMetrics.map((m: any, i: number) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="py-2 px-3 text-xs font-medium text-foreground">{m.model}</td>
                    <td className="py-2 px-3 text-center text-xs mono text-risk-safe">{m.precision}</td>
                    <td className="py-2 px-3 text-center text-xs mono text-risk-medium">{m.recall}</td>
                    <td className="py-2 px-3 text-center text-xs mono text-foreground font-bold">{m.f1}</td>
                    <td className="py-2 px-3 text-center text-xs mono text-primary">{m.auc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </motion.div>
  );
}
