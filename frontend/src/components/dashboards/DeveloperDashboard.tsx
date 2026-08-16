import { motion } from "framer-motion";
import {
  Cpu, Database, HardDrive, Wifi, Zap, GitBranch,
  BarChart3, Activity, Server, Gauge
} from "lucide-react";
import { KPICard } from "@/components/KPICard";
import { useLiveMetrics } from "@/hooks/use-live-data";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar
} from "recharts";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

function MetricRow({ label, value, unit, status }: { label: string; value: string | number; unit?: string; status?: "ok" | "warn" | "error" }) {
  const statusColor = status === "error" ? "bg-risk-critical" : status === "warn" ? "bg-risk-high" : "bg-risk-safe";
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm mono font-medium text-foreground">{value}{unit}</span>
        {status && <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />}
      </div>
    </div>
  );
}

function GaugeBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = (value / max) * 100;
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs mono font-bold text-foreground">{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1 }}
          className={`h-full rounded-full ${pct > 80 ? "bg-risk-critical" : pct > 60 ? "bg-risk-medium" : "bg-telemetry"}`}
        />
      </div>
    </div>
  );
}

export function DeveloperDashboard() {
  const metrics = useLiveMetrics();

  if (!metrics) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent flex items-center justify-center rounded-full animate-spin" />
      </div>
    );
  }

  const { infraHealth: devKPIs, kafkaTopics, latencyTimeline, shapFeatures } = metrics;
  const apiLat = devKPIs.apiLatency;
  const xgLat = devKPIs.xgboostLatency;
  const gnnLat = devKPIs.gnnLatency;
  const cpuVal = devKPIs.cpuUsage;
  const ramVal = devKPIs.ramUsage;
  const gpuVal = devKPIs.gpuUsage;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">System Operations & ML Infrastructure</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time Pipeline Observability</p>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <KPICard title="API Latency" value={`${apiLat}ms`} icon={Zap} variant="telemetry" />
        <KPICard title="XGBoost Latency" value={`${xgLat}ms`} icon={Cpu} variant="safe" />
        <KPICard title="GNN Latency" value={`${gnnLat}ms`} icon={GitBranch} variant="default" />
        <KPICard title="Cache Hit Rate" value={devKPIs.redisCacheHit} icon={Database} variant="safe" />
        <KPICard title="Graph Nodes" value={devKPIs.graphNodes} icon={Activity} variant="default" />
        <KPICard title="SLA Uptime" value={devKPIs.slaUptime} icon={Gauge} variant="safe" />
      </div>

      {/* Kafka + ML Pipeline */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Kafka */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Server className="w-4 h-4 text-telemetry" />
            Kafka Stream Monitor
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-[10px] font-medium text-muted-foreground uppercase">Topic</th>
                  <th className="text-right py-2 px-2 text-[10px] font-medium text-muted-foreground uppercase">Throughput</th>
                  <th className="text-right py-2 px-2 text-[10px] font-medium text-muted-foreground uppercase">Lag</th>
                  <th className="text-right py-2 px-2 text-[10px] font-medium text-muted-foreground uppercase">Partitions</th>
                </tr>
              </thead>
              <tbody>
                {kafkaTopics.map((t: any) => (
                  <tr key={t.topic} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="py-2 px-2 text-xs mono text-foreground">{t.topic}</td>
                    <td className="py-2 px-2 text-xs mono text-telemetry text-right">{t.throughput.toLocaleString()}/s</td>
                    <td className="py-2 px-2 text-xs mono text-right">
                      <span className={t.lag > 10 ? "text-risk-high" : "text-risk-safe"}>{t.lag}</span>
                    </td>
                    <td className="py-2 px-2 text-xs mono text-muted-foreground text-right">{t.partitions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            <MetricRow label="DLQ Count" value={devKPIs.dlqCount} status={devKPIs.dlqCount > 10 ? "warn" : "ok"} />
          </div>
        </div>

        {/* ML Pipeline Latency Chart */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            ML Pipeline Latency (ms)
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={latencyTimeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} />
              <Tooltip contentStyle={{ background: "hsl(222, 47%, 9%)", border: "1px solid hsl(222, 30%, 18%)", borderRadius: "8px", fontSize: 12 }} />
              <Line type="monotone" dataKey="xgboost" stroke="hsl(160, 84%, 39%)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="gnn" stroke="hsl(217, 91%, 60%)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="api" stroke="hsl(187, 92%, 55%)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-2">
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-risk-safe" /><span className="text-xs text-muted-foreground">XGBoost</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary" /><span className="text-xs text-muted-foreground">GNN</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-telemetry" /><span className="text-xs text-muted-foreground">API</span></div>
          </div>
        </div>
      </div>

      {/* Infra Health + Graph Engine + SHAP */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Infra Health */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-telemetry" />
            Infrastructure Health
          </h3>
          <div className="space-y-3">
            <GaugeBar label="CPU Usage" value={cpuVal > 100 ? 100 : cpuVal < 0 ? 0 : cpuVal} />
            <GaugeBar label="RAM Usage" value={ramVal > 100 ? 100 : ramVal < 0 ? 0 : ramVal} />
            <GaugeBar label="GPU Usage" value={gpuVal > 100 ? 100 : gpuVal < 0 ? 0 : gpuVal} />
          </div>
          <div className="mt-3 space-y-0">
            <MetricRow label="Redis" value={`${apiLat + 2}ms`} status="ok" />
            <MetricRow label="Neo4j" value={`${gnnLat - 10}ms`} status="ok" />
            <MetricRow label="Kafka Brokers" value="3/3" status="ok" />
          </div>
        </div>

        {/* Graph Engine */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-primary" />
            Graph Engine Health
          </h3>
          <div className="space-y-0">
            <MetricRow label="Nodes" value={devKPIs.graphNodes} status="ok" />
            <MetricRow label="Edges" value={devKPIs.graphEdges} status="ok" />
            <MetricRow label="Communities" value="342" status="ok" />
            <MetricRow label="Hot Subgraphs" value="12" status="warn" />
            <MetricRow label="Louvain Updates" value={`${gnnLat + 15}ms`} />
            <MetricRow label="Graph DB Latency" value={`${gnnLat - 10}ms`} status="ok" />
          </div>
        </div>

        {/* SHAP Features */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Wifi className="w-4 h-4 text-risk-medium" />
            Explainability Console (SHAP)
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={shapFeatures} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
              <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} />
              <YAxis type="category" dataKey="feature" tick={{ fontSize: 9, fill: "hsl(215, 20%, 55%)" }} width={110} />
              <Tooltip contentStyle={{ background: "hsl(222, 47%, 9%)", border: "1px solid hsl(222, 30%, 18%)", borderRadius: "8px", fontSize: 12 }} />
              <Bar dataKey="importance" fill="hsl(217, 91%, 60%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </motion.div>
  );
}
