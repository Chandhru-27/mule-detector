import { motion } from "framer-motion";
import { useState } from "react";
import { Globe, AlertTriangle, Shield, TrendingUp, ArrowRightLeft, MapPin, Search, ChevronDown, ChevronUp } from "lucide-react";
import { KPICard } from "@/components/KPICard";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import riskConfig from "../../risk_config.json";
import sanctionsList from "../../sanctions_list.json";
import { useJurisdictionRiskQuery } from "@/hooks/use-queries";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04 } } };

export default function JurisdictionRiskPage() {
  const [tab, setTab] = useState<"overview" | "sanctions" | "corridors" | "countries">("overview");
  const [showAllSanctions, setShowAllSanctions] = useState(false);
  const [sanctionSearch, setSanctionSearch] = useState("");

  const { data, isLoading } = useJurisdictionRiskQuery('latest');

  if (isLoading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent flex items-center justify-center rounded-full animate-spin" />
      </div>
    );
  }

  const formatCurrency = (val: number) => val > 0 ? `₹${(val / 10000000).toFixed(1)} Cr` : "₹0";

  // Generate exposure chart dynamically from all jurisdictions
  const exposureChart = [
    ...(data.fatf_greylist || []),
    ...(data.fatf_blacklist || [])
  ]
    .filter(item => item.exposure > 0)
    .sort((a, b) => b.exposure - a.exposure)
    .slice(0, 7)
    .map(item => ({
      country: item.country,
      exposure: item.exposure / 10000000, // Normalized for chart
      risk: item.risk
    }));

  // If no exposures, provide placeholder data for visualization fallback
  if (exposureChart.length === 0 && data.fatf_greylist?.length > 0) {
      data.fatf_greylist.slice(0, 5).forEach((item: any) => {
          exposureChart.push({ country: item.country, exposure: 0, risk: item.risk });
      });
  }

  const liveBlockedVolume = data.suspicious_corridors?.reduce((sum: number, c: any) => sum + (c.volume || 0), 0) || 0;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Jurisdiction Risk Intelligence</h1>
        <p className="text-sm text-muted-foreground mt-1">FATF monitoring, cross-border exposure & sanctions screening</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="High-Risk Jurisdictions" value={(data.jurisdiction_metrics?.high_risk_jurisdictions_count || 0).toString()} icon={Globe} variant="critical" />
        <KPICard title="FATF Blacklisted" value={(data.jurisdiction_metrics?.fatf_blacklisted_count || 0).toString()} icon={AlertTriangle} variant="critical" />
        <KPICard title="Cross-Border Cases" value={(data.suspicious_corridors?.reduce((acc: number, val: any) => acc + val.alerts, 0) || 0).toString()} icon={Shield} variant="warning" />
        <KPICard title="Live Blocked Volume" value={formatCurrency(liveBlockedVolume)} icon={TrendingUp} variant="default" live liveBase={0} liveVariance={0} />
      </div>

      <div className="glass-card p-1 flex flex-wrap gap-1">
        {(["overview", "sanctions", "corridors", "countries"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "overview" ? "FATF Overview" : t === "sanctions" ? "Sanctions" : t === "corridors" ? "Corridors" : "All Countries"}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          {/* Blacklist */}
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-risk-critical mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> FATF Blacklist
            </h3>
            <div className="grid md:grid-cols-3 gap-3">
              {(data.fatf_blacklist || []).map((c: any) => (
                <div key={c.country} className="p-3 rounded-xl border border-risk-critical/30 bg-risk-critical/5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{c.flag}</span>
                    <span className="text-sm font-bold text-foreground">{c.country}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-risk-critical/20 text-risk-critical">BLOCKED</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Risk: <span className="text-risk-critical font-bold mono">{c.risk}</span> • Exposure: {formatCurrency(c.exposure)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Greylist */}
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-risk-medium mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4" /> FATF Greylist — Live Mule Detections
            </h3>
            <div className="space-y-2">
              {(data.fatf_greylist || []).map((c: any, i: number) => (
                <motion.div key={c.country} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  className="p-3 rounded-xl border border-border bg-card/40 hover:bg-card/60 transition-all flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{c.flag}</span>
                    <div>
                      <span className="text-sm font-medium text-foreground">{c.country}</span>
                      <span className="text-[10px] text-muted-foreground block">{c.mules || 0} mule clusters detected</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className="text-xs text-muted-foreground block">Exposure</span>
                      <span className="text-sm mono font-bold text-foreground">{formatCurrency(c.exposure)}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${c.risk > 85 ? "bg-risk-critical/15 text-risk-critical" : c.risk > 75 ? "bg-risk-high/15 text-risk-high" : "bg-risk-medium/15 text-risk-medium"}`}>{c.risk}</span>
                    <span className={`text-xs ${c.trend === "up" ? "text-risk-critical" : c.trend === "down" ? "text-risk-safe" : "text-muted-foreground"}`}>
                      {c.trend === "up" ? "↑" : c.trend === "down" ? "↓" : "→"}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Country-wise Blocked Extrapolations (₹ Cr)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={exposureChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
                <XAxis dataKey="country" tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} />
                <Tooltip contentStyle={{ background: "hsl(222, 47%, 9%)", border: "1px solid hsl(222, 30%, 18%)", borderRadius: "8px", fontSize: 12 }} />
                <Bar dataKey="exposure" radius={[4, 4, 0, 0]}>
                  {exposureChart.map((e, i) => (
                    <motion.rect key={i} fill={e.risk > 85 ? "hsl(0, 72%, 51%)" : e.risk > 70 ? "hsl(25, 95%, 53%)" : "hsl(217, 91%, 60%)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab === "sanctions" && (
        <div className="space-y-4">
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-risk-critical" /> Sanctions Overlap Detector
            </h3>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border">
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Entity</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Type</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Sanctions List</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Country</th>
                <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">Match Score</th>
              </tr></thead>
              <tbody>
                {(data.sanctions_overlap || []).map((s: any, i: number) => (
                  <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                    className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="py-2 px-3 text-xs font-medium text-foreground">{s.entity}</td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{s.type}</td>
                    <td className="py-2 px-3"><span className="text-xs px-2 py-0.5 rounded-full bg-risk-critical/15 text-risk-critical border border-risk-critical/30">{s.list}</span></td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{s.country}</td>
                    <td className="py-2 px-3 text-center"><span className={`text-xs font-bold ${s.matchScore > 90 ? "text-risk-critical" : "text-risk-high"}`}>{s.matchScore}%</span></td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>


          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3 text-sm font-semibold text-foreground cursor-pointer" onClick={() => setShowAllSanctions(!showAllSanctions)}>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-risk-critical" /> Comprehensive Sanctions List ({(sanctionsList as any).total_names} entities)
              </div>
              <button className="p-1 rounded-md hover:bg-secondary transition-colors">
                {showAllSanctions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            {showAllSanctions && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-4">
                <div className="relative mb-3">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input type="text" placeholder="Search sanctions list..." value={sanctionSearch} onChange={e => setSanctionSearch(e.target.value)} className="w-full bg-background/50 border border-border rounded-lg pl-9 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary transition-all" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
                  {(sanctionsList as any).sdn_names.filter((n: string) => n.toLowerCase().includes(sanctionSearch.toLowerCase())).map((name: string, i: number) => (
                    <div key={i} className="px-3 py-2 rounded-lg border border-border bg-card/40 flex items-center justify-between group hover:bg-card/80 transition-colors">
                      <span className="text-xs text-foreground font-medium truncate" title={name}>{name}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-risk-critical/10 text-risk-critical border border-risk-critical/20 ml-2 whitespace-nowrap">UN/OFAC</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      )}

      {tab === "corridors" && (
        <div className="space-y-4">
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-risk-high" /> Suspicious Corridor Ranking
            </h3>
            <div className="space-y-2">
              {(data.suspicious_corridors || []).map((c: any, i: number) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                  className="p-3 rounded-xl border border-border bg-card/40 hover:bg-card/60 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-xs font-medium text-foreground">
                        <MapPin className="w-3 h-3 text-primary" /> {c.from} → {c.to}
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-secondary text-muted-foreground">{c.type}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs mono text-foreground">{formatCurrency(c.volume)}</span>
                      <span className="text-[10px] text-muted-foreground">{c.alerts} alerts</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${c.risk > 85 ? "bg-risk-critical/15 text-risk-critical" : c.risk > 70 ? "bg-risk-high/15 text-risk-high" : "bg-risk-medium/15 text-risk-medium"}`}>{c.risk}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-primary" /> Corridor Multipliers Setup
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {Object.entries((riskConfig as any).corridor_multiplier || {})
                .filter(([c]) => c !== "default")
                .sort((a: any, b: any) => b[1] - a[1]) // Sort descending
                .map(([corridor, multiplier]: [string, any], i) => (
                  <motion.div key={corridor} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.015 }}
                    className="p-3 rounded-xl border border-border bg-card/40 hover:bg-card/60 transition-all flex flex-col justify-between"
                  >
                    <span className="text-sm font-bold text-foreground mb-2 truncate" title={corridor}>{corridor}</span>
                    <div className="flex items-center justify-between mt-auto">
                      <span className="text-[10px] text-muted-foreground">Multiplier</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${multiplier >= 1.4 ? "bg-risk-critical/15 text-risk-critical" : multiplier >= 1.25 ? "bg-risk-high/15 text-risk-high" : "bg-risk-medium/15 text-risk-medium"}`}>{multiplier.toFixed(2)}x</span>
                    </div>
                  </motion.div>
                ))}
            </div>
          </div>
        </div>
      )}

      {tab === "countries" && (
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" /> Monitored Jurisdictions
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {Object.entries((riskConfig as any).country_risk || {})
              .filter(([c]) => c !== "default")
              .sort((a: any, b: any) => b[1] - a[1]) // Sort by risk descending
              .map(([country, riskValue]: [string, any], i) => {
                const risk = riskValue * 100;
                return (
                  <motion.div key={country} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.015 }}
                    className="p-3 rounded-xl border border-border bg-card/40 hover:bg-card/60 transition-all flex flex-col justify-between"
                  >
                    <span className="text-sm font-bold text-foreground mb-2 truncate" title={country}>{country}</span>
                    <div className="flex items-center justify-between mt-auto">
                      <span className="text-[10px] text-muted-foreground">Risk Score</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${risk > 85 ? "bg-risk-critical/15 text-risk-critical" : risk > 50 ? "bg-risk-high/15 text-risk-high" : risk > 25 ? "bg-risk-medium/15 text-risk-medium" : "bg-risk-safe/15 text-risk-safe"}`}>{risk.toFixed(0)}</span>
                    </div>
                  </motion.div>
                );
              })}
          </div>
        </div>
      )}
    </motion.div>
  );
}
