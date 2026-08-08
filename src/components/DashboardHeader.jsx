import React, { useState, useEffect } from 'react';
import SafeIcon from '../common/SafeIcon';

export default function DashboardHeader({ onOpenCommand, isLive, onToggleLive, metrics }) {
  const [healthStatus, setHealthStatus] = useState(null);
  const [latency, setLatency] = useState(null);

  useEffect(() => {
    const checkHealth = async () => {
      const start = Date.now();
      try {
        const res = await fetch('/health'); // Relative path, assuming proxy or same origin for edge worker in production
        if (res.ok) {
          setLatency(Date.now() - start);
          setHealthStatus('online');
        } else {
          setHealthStatus('offline');
        }
      } catch (err) {
        setHealthStatus('offline');
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);
  return (
    <header className="bg-gray-900 border-b border-gray-800 p-6 flex justify-between items-center">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-indigo-500/20 rounded-lg">
          <SafeIcon name="Activity" className="text-indigo-400 text-2xl" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">AXiM Ground Game</h1>
          <p className="text-sm text-gray-400">Support Agent Operator Dashboard</p>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        {healthStatus && (
          <div className="flex items-center gap-2 mr-4 px-3 py-1.5 rounded-full bg-gray-800 border border-gray-700 text-xs font-medium">
            <span className={`w-2 h-2 rounded-full ${healthStatus === 'online' ? 'bg-green-500' : 'bg-red-500'}`}></span>
            <span className="text-gray-300">
              {healthStatus === 'online' ? `Edge Online • ${latency}ms` : 'Edge Offline'}
            </span>
          </div>
        )}
        <button
          onClick={onToggleLive}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-md transition-colors text-xs font-medium mr-4 border border-gray-700"
        >
          <SafeIcon name={isLive ? "Pause" : "Play"} className="text-sm" />
          <span>{isLive ? "Pause Live Feed" : "Resume Live Feed"}</span>
        </button>

        <div className="flex gap-6 mr-6">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Self-Healed</span>
            <span className="text-lg font-mono text-green-400">{metrics.selfHealedRate}%</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Active Escalations</span>
            <span className="text-lg font-mono text-amber-400">{metrics.escalatedCount}</span>
          </div>
        </div>
        <button 
          onClick={onOpenCommand}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-md transition-colors font-medium text-sm"
        >
          <SafeIcon name="Terminal" />
          <span>Remote Command</span>
        </button>
      </div>
    </header>
  );
}
