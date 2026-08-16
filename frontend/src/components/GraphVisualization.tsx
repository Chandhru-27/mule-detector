import { motion } from "framer-motion";
import { graphNodes, graphEdges } from "@/lib/mock-data";
import { usePulse } from "@/hooks/use-live-data";

const nodePositions: Record<string, { x: number; y: number }> = {
  "ACC-001": { x: 300, y: 200 },
  "WAL-001": { x: 150, y: 100 },
  "WAL-002": { x: 150, y: 300 },
  "UPI-001": { x: 450, y: 100 },
  "ATM-001": { x: 450, y: 300 },
  "BEN-001": { x: 50, y: 200 },
  "BEN-002": { x: 50, y: 350 },
  "ACC-002": { x: 550, y: 150 },
  "ACC-003": { x: 600, y: 250 },
};

const riskColors = {
  critical: "hsl(0, 72%, 51%)",
  high: "hsl(25, 95%, 53%)",
  medium: "hsl(45, 93%, 47%)",
  low: "hsl(160, 84%, 39%)",
};

const typeIcons: Record<string, string> = {
  account: "A",
  wallet: "W",
  upi: "U",
  atm: "T",
  beneficiary: "B",
};

interface GraphVisualizationProps {
  title?: string;
  compact?: boolean;
}

export function GraphVisualization({ title = "Network Graph", compact = false }: GraphVisualizationProps) {
  const pulse = usePulse(2500);
  const height = compact ? 300 : 420;
  const scale = compact ? 0.7 : 1;

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full bg-risk-critical ${pulse ? "animate-pulse-glow" : ""}`} />
          <span className="text-xs text-muted-foreground">Live Graph</span>
        </div>
      </div>
      <div className="relative rounded-xl bg-background/50 border border-border overflow-hidden" style={{ height }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${660 * scale + 40} ${height}`}>
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g transform={`translate(${compact ? 10 : 20}, ${compact ? 10 : 20}) scale(${scale})`}>
            {graphEdges.map((edge, i) => {
              const from = nodePositions[edge.from];
              const to = nodePositions[edge.to];
              if (!from || !to) return null;
              return (
                <g key={i}>
                  <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="hsl(217, 91%, 60%)" strokeWidth="1.5" strokeOpacity="0.3" />
                  <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 6} fill="hsl(215, 20%, 55%)" fontSize="9" textAnchor="middle">{edge.label}</text>
                </g>
              );
            })}
            {graphNodes.map((node) => {
              const pos = nodePositions[node.id];
              if (!pos) return null;
              const color = riskColors[node.risk as keyof typeof riskColors] || riskColors.low;
              return (
                <g key={node.id} filter={node.risk === "critical" ? "url(#glow)" : undefined}>
                  <circle cx={pos.x} cy={pos.y} r={node.risk === "critical" ? 22 : 18} fill={color} fillOpacity="0.15" stroke={color} strokeWidth="2" />
                  <text x={pos.x} y={pos.y + 1} fill={color} fontSize="12" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
                    {typeIcons[node.type]}
                  </text>
                  <text x={pos.x} y={pos.y + 32} fill="hsl(210, 40%, 75%)" fontSize="8" textAnchor="middle">{node.label}</text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
