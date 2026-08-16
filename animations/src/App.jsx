import React, { useState, useEffect } from 'react';
import { Activity, Network, DollarSign, RefreshCw } from 'lucide-react';
import NetworkGraph from './components/NetworkGraph';
import { streamTransactionsRealtime } from './utils/dataParser';

const App = () => {
  const [data, setData] = useState({ nodes: [], links: [] });
  const [latestStats, setLatestStats] = useState({ type: '-', amount: 0 });
  const [isLive, setIsLive] = useState(true);

  useEffect(() => {
    streamTransactionsRealtime(
      (newData, recentData) => {
        setData(newData);
        setLatestStats(recentData);
      },
      () => {
        setIsLive(false);
      }
    );
  }, []);

  return (
    <div className="dashboard-layout">
      <div className="graph-container">
        <NetworkGraph data={data} />
      </div>

      <div className="overlay-ui">
        <div className="header">
          <div className="title-section">
            {isLive ? <div className="pulse-indicator"></div> : <RefreshCw size={18} color="#94a3b8" />}
            <h1>Advanced AML Intelligence</h1>
          </div>
          
          <div className="metrics-container">
            <div className="metric-card">
              <span className="metric-label">Nodes Processed</span>
              <span className="metric-value">
                <Network size={20} color="#3b82f6" /> 
                {data.nodes.length}
              </span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Live Edges</span>
              <span className="metric-value">
                <Activity size={20} color="#10b981" /> 
                {data.links.length}
              </span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Latest Transfer</span>
              <span className="metric-value highlight">
                <DollarSign size={20} color="#60a5fa" />
                {latestStats.amount > 0 ? (latestStats.amount / 1000).toFixed(1) + 'k' : 0}
              </span>
            </div>
          </div>
        </div>

        <div className="legend-panel">
          <h3 className="legend-title">Transaction Channels</h3>
          <div className="legend-items">
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: '#3b82f6', boxShadow: '0 0 8px #3b82f6' }}></div>
              <span>UPI Network</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: '#10b981', boxShadow: '0 0 8px #10b981' }}></div>
              <span>Mobile App</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: '#8b5cf6', boxShadow: '0 0 8px #8b5cf6' }}></div>
              <span>Digital Wallet</span>
            </div>
            <div className="legend-item" style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed rgba(255,255,255,0.1)'}}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>* Particles denote flow direction</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
