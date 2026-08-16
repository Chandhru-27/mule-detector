import React, { useRef, useEffect, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

const NetworkGraph = ({ data }) => {
  const fgRef = useRef();

  // Highlight channels with distinct colors
  const getLinkColor = (link) => {
    switch(link.channel) {
      case 'UPI': return 'rgba(59, 130, 246, 0.4)'; // blue
      case 'App': return 'rgba(16, 185, 129, 0.4)'; // green
      case 'Wallet': return 'rgba(139, 92, 246, 0.4)'; // purple
      default: return 'rgba(148, 163, 184, 0.3)'; // gray
    }
  };

  const getParticleColor = (link) => {
    switch(link.channel) {
      case 'UPI': return '#3b82f6';
      case 'App': return '#10b981';
      case 'Wallet': return '#8b5cf6';
      default: return '#94a3b8';
    }
  };

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ForceGraph2D
        ref={fgRef}
        graphData={data}
        nodeColor={node => node.group === 'sender' ? '#ef4444' : '#f59e0b'}
        nodeVal={node => node.val || 2}
        linkColor={getLinkColor}
        linkWidth={link => Math.max(1, Math.min(4, link.amount / 100000))}
        
        // Dynamic labels on edges
        linkLabel={link => `Channel: ${link.channel} | Amount: ₹${link.amount.toLocaleString()}`}
        
        // Show particles for flow
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={2}
        linkDirectionalParticleColor={getParticleColor}
        linkDirectionalParticleSpeed={d => Math.max(0.005, Math.min(0.015, d.amount / 1000000))}
        
        // Premium Node drawing: Circle + ID inside or above
        nodeCanvasObject={(node, ctx, globalScale) => {
          const label = node.id;
          const fontSize = 12/globalScale;
          ctx.font = `${fontSize}px Inter, sans-serif`;
          const textWidth = ctx.measureText(label).width;
          const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2); // some padding

          // Draw node circle
          const r = Math.sqrt(Math.max(0, node.val || 1)) * 4;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
          ctx.fillStyle = node.group === 'sender' ? '#ef4444' : '#f59e0b';
          ctx.fill();
          
          // Glow effect
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 15;
          
          // Draw text label below node
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.fillText(label, node.x, node.y + r + fontSize * 1.2);
          
          ctx.shadowBlur = 0; // reset glow
        }}

        // Premium Link drawing: Show Channel and Amount on edge
        linkCanvasObjectMode={() => 'after'}
        linkCanvasObject={(link, ctx, globalScale) => {
          const MAX_FONT_SIZE = 4;
          const labelFontSize = Math.min(MAX_FONT_SIZE, 10 / globalScale);
          
          if (globalScale < 1.5) return; // Only show edge labels when zoomed in for clarity

          ctx.font = `${labelFontSize}px Inter`;
          const label = `${link.channel} - ₹${(link.amount/1000).toFixed(1)}k`;
          
          const start = link.source;
          const end = link.target;
          if (typeof start !== 'object' || typeof end !== 'object') return;

          // calculate label position (middle of edge)
          const midX = start.x + (end.x - start.x) / 2;
          const midY = start.y + (end.y - start.y) / 2;

          // Rotate text to follow edge
          const relX = end.x - start.x;
          const relY = end.y - start.y;
          const angle = Math.atan2(relY, relX);

          ctx.save();
          ctx.translate(midX, midY);
          ctx.rotate(angle);
          
          // Background for text readability
          const textWidth = ctx.measureText(label).width;
          ctx.fillStyle = 'rgba(11, 15, 25, 0.6)';
          ctx.fillRect(-textWidth/2 - 1, -labelFontSize/2 - 1, textWidth + 2, labelFontSize + 2);
          
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.fillText(label, 0, 0);
          ctx.restore();
        }}

        backgroundColor="transparent"
        d3VelocityDecay={0.3}
        cooldownTicks={100}
      />
    </div>
  );
};

export default NetworkGraph;
