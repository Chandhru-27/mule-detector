export interface GraphNode {
  id: string;
  type: string;
  risk: string;
  label: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label: string;
}

export const graphNodes: GraphNode[] = [
  { id: "ACC-001", type: "account", risk: "critical", label: "John Doe" },
  { id: "WAL-001", type: "wallet", risk: "medium", label: "Crypto Wallet" },
  { id: "WAL-002", type: "wallet", risk: "low", label: "Exchange Wallet" },
  { id: "UPI-001", type: "upi", risk: "high", label: "UPI ID 1" },
  { id: "ATM-001", type: "atm", risk: "low", label: "Downtown ATM" },
  { id: "BEN-001", type: "beneficiary", risk: "medium", label: "Jane Doe" },
  { id: "BEN-002", type: "beneficiary", risk: "low", label: "Alice Smith" },
  { id: "ACC-002", type: "account", risk: "low", label: "Bob Brown" },
  { id: "ACC-003", type: "account", risk: "low", label: "Company LLC" },
];

export const graphEdges: GraphEdge[] = [
  { from: "ACC-001", to: "WAL-001", label: "$5,000" },
  { from: "WAL-001", to: "WAL-002", label: "$4,500" },
  { from: "ACC-001", to: "UPI-001", label: "$2,000" },
  { from: "UPI-001", to: "ATM-001", label: "$500" },
  { from: "ACC-001", to: "BEN-001", label: "$1,000" },
  { from: "BEN-001", to: "BEN-002", label: "$300" },
  { from: "ACC-002", to: "ACC-001", label: "$10,000" },
  { from: "ACC-003", to: "ACC-002", label: "$15,000" },
];
