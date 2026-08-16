import { motion } from "framer-motion";
import { useState } from "react";
import {
  GitBranch, Layers, Route, Repeat, Play, Pause,
  ZoomIn, ZoomOut, Maximize, Target, AlertTriangle
} from "lucide-react";
import { KPICard } from "@/components/KPICard";
import { usePulse } from "@/hooks/use-live-data";
import { useRingsQuery } from "@/hooks/use-queries";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04 } } };

export default function GraphIntelligencePage() {
  const [playing, setPlaying] = useState(false);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const pulse = usePulse(2500);

  const { data: rings, isLoading } = useRingsQuery();

  if (isLoading || !rings) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent flex items-center justify-center rounded-full animate-spin" />
      </div>
    );
  }

  const topRings = (rings || []).sort((a: any, b: any) => b.risk_score - a.risk_score);
  const selectedCluster = topRings.find((r: any) => r.ring_id === selectedClusterId) || topRings[0];
  const totalRings = rings.length;
  const novelRingsCount = rings.filter((r: any) => r.is_novel).length;

  // Derive counts from actual data
  const suspiciousPaths = topRings.reduce((sum: number, r: any) => sum + r.transaction_count, 0);
  const circularTxns = topRings.filter((r: any) => r.pattern === "circular_loop").length;
  const graphNodes = topRings.reduce((sum: number, r: any) => sum + r.account_count, 0);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Graph Intelligence</h1>
        <p className="text-sm text-muted-foreground mt-1">Interactive ML cluster investigation & ring generation</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard title="Active Clusters" value={totalRings.toString()} icon={Layers} variant="critical" live liveBase={totalRings} liveVariance={0} />
        <KPICard title="Suspicious Links" value={suspiciousPaths.toString()} icon={Route} variant="warning" />
        <KPICard title="Circular Txns" value={circularTxns.toString()} icon={Repeat} variant="critical" />
        <KPICard title="Graph Nodes" value={(graphNodes / 1000).toFixed(1) + 'k'} icon={GitBranch} variant="telemetry" />
        <KPICard title="Novel Patterns" value={novelRingsCount.toString()} icon={Target} variant="default" />
      </div>

      {/* Main graph */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">
            {selectedCluster?.pattern.replace(/_/g, ' ').toUpperCase() || 'Cluster'} Network Visualization
          </h3>
          <div className="flex items-center gap-3">
            <button className="p-1.5 rounded-lg bg-secondary hover:bg-accent transition-colors"><ZoomIn className="w-3.5 h-3.5 text-foreground" /></button>
            <button className="p-1.5 rounded-lg bg-secondary hover:bg-accent transition-colors"><ZoomOut className="w-3.5 h-3.5 text-foreground" /></button>
            <button className="p-1.5 rounded-lg bg-secondary hover:bg-accent transition-colors"><Maximize className="w-3.5 h-3.5 text-foreground" /></button>
          </div>
        </div>
        <div className="relative rounded-xl bg-[#141720] border border-border overflow-hidden flex flex-col md:flex-row" style={{ height: 600 }}>
          {/* Left panel: Cluster IDs */}
          <div className="w-full md:w-56 flex-shrink-0 border-b md:border-b-0 md:border-r border-border bg-[#0F1117] flex flex-col overflow-y-auto">
            <div className="p-3 border-b border-border font-semibold text-sm text-center text-foreground sticky top-0 bg-[#0F1117] z-10 flex justify-between items-center">
              <span>Cluster IDs</span>
              <span className="text-[10px] bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">{topRings.length} Total</span>
            </div>
            {topRings.map((c: any) => (
              <div 
                key={c.ring_id} 
                onClick={() => setSelectedClusterId(c.ring_id)}
                className={`p-3 border-b border-border cursor-pointer transition-colors ${selectedCluster?.ring_id === c.ring_id ? 'bg-primary/20 border-l-2 border-l-primary' : 'hover:bg-accent/50 group'}`}
              >
                <div className={`text-sm font-bold mono ${selectedCluster?.ring_id === c.ring_id ? 'text-primary' : 'text-foreground group-hover:text-primary/80'}`}>{c.ring_id.slice(-10)}</div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-[10px] text-muted-foreground capitalize">{c.pattern.replace(/_/g, ' ').substring(0, 15)}</span>
                  <span className={`text-[10px] px-1.5 rounded-sm font-bold ${c.risk_score >= 0.9 ? 'bg-risk-critical/20 text-risk-critical' : 'bg-risk-high/20 text-risk-high'}`}>
                    {(c.risk_score * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Right panel: Static ML Image */}
          <div className="flex-1 relative overflow-auto flex items-center justify-center bg-[#141720]">
            {selectedCluster ? (
              <img 
                src={`http://localhost:5000/ring_images/${selectedCluster.image_file}`} 
                alt={`Cluster ${selectedCluster.ring_id}`} 
                className="max-w-none max-h-none block object-contain"
                style={{ width: '100%', height: '100%' }}
              />
            ) : (
              <div className="text-muted-foreground text-sm">Select a cluster to view it</div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
