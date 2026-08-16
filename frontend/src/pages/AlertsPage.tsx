import { motion } from "framer-motion";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Filter, UserCheck, Clock, FileText, Ban,
  CheckCircle, XCircle, ArrowUpRight, MessageSquare, ChevronRight,
  Search, RefreshCw
} from "lucide-react";
import { KPICard } from "@/components/KPICard";
import { usePulse } from "@/hooks/use-live-data";
import { useRingsQuery, useCaseNotesQuery, alertAction } from "@/hooks/use-queries";
import { apiClient } from "@/lib/api-client";

type AlertStatus = "new" | "investigating" | "escalated" | "closed";
type Priority = "critical" | "high" | "medium" | "low";

const statusColors: Record<AlertStatus, string> = {
  new: "bg-primary/15 text-primary border-primary/30",
  investigating: "bg-risk-medium/15 text-risk-medium border-risk-medium/30",
  escalated: "bg-risk-critical/15 text-risk-critical border-risk-critical/30",
  closed: "bg-muted text-muted-foreground border-border",
};

const priorityStyles: Record<Priority, string> = {
  critical: "priority-critical",
  high: "priority-high",
  medium: "priority-medium",
  low: "priority-low",
};

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04 } } };

export default function AlertsPage() {
  const [statusFilter, setStatusFilter] = useState<AlertStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const pulse = usePulse(3000);
  const queryClient = useQueryClient();

  const { data: rings, isLoading } = useRingsQuery();
  const { data: caseNotes = [] } = useCaseNotesQuery(selectedAlertId);
  
  const mutation = useMutation({
    mutationFn: ({ id, action }: { id: string, action: string }) => alertAction(id, action),
    onSuccess: () => {
      // In a real app we might refetch alerts / queries or show toast
      queryClient.invalidateQueries({ queryKey: ["rings"] });
    }
  });

  if (isLoading || !rings) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent flex items-center justify-center rounded-full animate-spin" />
      </div>
    );
  }

  const allRings = rings || [];
  const totalRings = allRings.length;
  const criticalRingsCount = allRings.filter((r: any) => r.risk_score >= 0.9).length;
  const novelRingsCount = allRings.filter((r: any) => r.is_novel).length;

  const topRings = [...allRings].sort((a, b) => {
    if (b.risk_score !== a.risk_score) return b.risk_score - a.risk_score;
    return b.total_amount_blocked - a.total_amount_blocked;
  });

  const mlAlerts = topRings.map((ring: any, i: number) => {
    return {
      id: ring.ring_id,
      priority: ring.priority || "low",
      status: ring.status || "new",
      message: ring.short_message || `${ring.pattern?.replace(/_/g, ' ').toUpperCase()}: ${ring.account_count} accounts involved. Risk: ${(ring.risk_score * 100).toFixed(0)}%. ${ring.is_novel ? '[NOVEL]' : ''}`,
      bank: "Multiple",
      analyst: ring.assigned_analyst || "Unassigned",
      time: "Latest",
      entities: ring.account_count,
      amountBlocked: ring.total_amount_blocked,
      sarReady: ring.priority === "critical" || ring.status === "escalated",
      ring
    };
  });

  const filtered = mlAlerts.filter((a: any) =>
    (statusFilter === "all" || a.status === statusFilter) &&
    (priorityFilter === "all" || a.priority === priorityFilter)
  );

  const selectedAlert = selectedAlertId 
    ? mlAlerts.find((a: any) => a.id === selectedAlertId) || mlAlerts[0]
    : mlAlerts[0];

  const handleAction = (action: string) => {
    if (selectedAlert) mutation.mutate({ id: selectedAlert.id, action });
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Alert Triage Center</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time alerts directly from the XGBoost + GNN inference engine</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full bg-risk-critical ${pulse ? "animate-pulse-glow" : ""}`} />
          <span className="text-xs text-muted-foreground">Real-time ML Queue</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Total Detected Rings" value={totalRings.toString()} icon={AlertTriangle} variant="critical" live liveBase={totalRings} liveVariance={0} />
        <KPICard title="Critical Alerts" value={criticalRingsCount.toString()} icon={Search} variant="warning" />
        <KPICard title="Novel Patterns" value={novelRingsCount.toString()} icon={ArrowUpRight} variant="default" />
        <KPICard title="Avg Resolution" value="Automated" icon={Clock} variant="safe" />
      </div>

      {/* Filters */}
      <div className="glass-card p-3 flex items-center gap-3 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <div className="flex gap-1.5">
          {(["all", "new", "investigating", "escalated", "closed"] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
              {s === "all" ? "All Status" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="w-px h-5 bg-border" />
        <div className="flex gap-1.5">
          {(["all", "critical", "high", "medium", "low"] as const).map(p => (
            <button key={p} onClick={() => setPriorityFilter(p)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${priorityFilter === p ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
              {p === "all" ? "All Priority" : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-4">
        {/* Left Column: Alert queue */}
        <div className="lg:col-span-3 glass-card p-4 max-h-[750px] overflow-y-auto scrollbar-thin">
          <div className="space-y-2">
            {filtered.map((alert: any, i: number) => (
              <motion.div key={alert.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.01, 0.5) }}
                onClick={() => setSelectedAlertId(alert.id)}
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${selectedAlert?.id === alert.id ? "bg-primary/20 border-primary/50" : "bg-card/40 border-border hover:bg-card/60"}`}>
                <div className="flex flex-col">
                   <span className="text-sm font-bold text-foreground mono">{alert.id.slice(-10)}</span>
                   <span className="text-[9px] text-muted-foreground mt-0.5">{alert.ring.pattern.substring(0,15)}...</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${priorityStyles[alert.priority as Priority]}`}>{alert.priority}</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Middle Column: Graph and Case info */}
        <div className="lg:col-span-6 space-y-4">
          <div className="glass-card p-4 h-[350px] flex flex-col relative overflow-hidden">
             <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">{selectedAlert?.id} Pattern Graph</h3>
             <div className="flex-1 flex items-center justify-center relative bg-[#141720] rounded-xl border border-border/50 overflow-hidden">
               {selectedAlert && (
                 <img 
                   src={`${apiClient.defaults.baseURL || 'http://localhost:5000'}/ring_images/${selectedAlert.ring.image_file}`} 
                   alt="ML Cluster" 
                   className="mt-4 max-h-[140%] object-contain"
                 />
               )}
             </div>
          </div>

          {selectedAlert && (
            <div className="glass-card p-4">
               <div className="flex items-center justify-between mb-3">
                 <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Case Information</h3>
                 <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColors[selectedAlert.status as AlertStatus]}`}>{selectedAlert.status}</span>
               </div>
               <p className="text-sm text-foreground/90 mb-4 bg-background/30 p-3 rounded-lg border border-border">{selectedAlert.message}</p>
               <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-secondary/30 border border-border">
                  <span className="text-[10px] text-muted-foreground block mb-1">Blocked Amount</span>
                  <span className="text-sm font-medium text-risk-critical">₹{selectedAlert.amountBlocked.toLocaleString()}</span>
                </div>
                <div className="p-3 rounded-xl bg-secondary/30 border border-border">
                  <span className="text-[10px] text-muted-foreground block mb-1">Entities</span>
                  <span className="text-sm font-medium text-foreground mono">{selectedAlert.entities}</span>
                </div>
                <div className="p-3 rounded-xl bg-secondary/30 border border-border">
                  <span className="text-[10px] text-muted-foreground block mb-1">Confidence</span>
                  <span className="text-sm font-medium text-foreground">{selectedAlert.ring.confidence ? (selectedAlert.ring.confidence * 100).toFixed(0) + '%' : 'N/A (Novel)'}</span>
                </div>
                <div className="p-3 rounded-xl bg-secondary/30 border border-border">
                  <span className="text-[10px] text-muted-foreground block mb-1">Analyst</span>
                  <span className="text-sm font-medium text-foreground">{selectedAlert.analyst}</span>
                </div>
               </div>
            </div>
          )}
        </div>

        {/* Right Column: Call to action */}
        <div className="lg:col-span-3 space-y-4">
          <div className="glass-card p-4 text-center bg-primary/5 border border-primary/20">
            <h3 className="text-sm font-semibold text-primary mb-4 tracking-wider uppercase">Call For Action</h3>
            <div className="flex flex-col gap-3">
              <button onClick={() => handleAction('freeze')} className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg bg-risk-critical/15 text-risk-critical border border-risk-critical/30 text-sm font-medium hover:bg-risk-critical/25 transition-all w-full">
                <Ban className="w-4 h-4" /> Freeze Accounts
              </button>
              <button onClick={() => handleAction('sar')} className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg bg-primary/15 text-primary border border-primary/30 text-sm font-medium hover:bg-primary/25 transition-all w-full">
                <FileText className="w-4 h-4" /> Generate SAR
              </button>
              <button onClick={() => handleAction('escalate')} className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg bg-risk-high/15 text-risk-high border border-risk-high/30 text-sm font-medium hover:bg-risk-high/25 transition-all w-full">
                <ArrowUpRight className="w-4 h-4" /> Escalate RBI
              </button>
              <button onClick={() => handleAction('false-positive')} className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg bg-muted text-muted-foreground border border-border text-sm font-medium hover:bg-accent transition-all w-full">
                <XCircle className="w-4 h-4" /> False Positive
              </button>
            </div>
          </div>

          {/* Case notes */}
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2 tracking-wider uppercase">
              <MessageSquare className="w-4 h-4 text-primary" /> Case Notes
            </h3>
            <div className="space-y-2 max-h-[160px] overflow-y-auto scrollbar-thin">
              {caseNotes.map((n: any, i: number) => (
                <div key={i} className="p-2 rounded-lg bg-secondary/30 border border-border">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] mono text-muted-foreground">{n.timestamp}</span>
                    <span className="text-[10px] font-medium text-foreground">{n.author}</span>
                  </div>
                  <p className="text-xs text-foreground/80">{n.content}</p>
                </div>
              ))}
              {caseNotes.length === 0 && (
                <div className="text-center py-4 text-xs text-muted-foreground">
                  No notes added yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
