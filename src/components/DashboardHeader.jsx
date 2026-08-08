import React from 'react';
import SafeIcon from '../common/SafeIcon';

export default function DashboardHeader({ onOpenCommand }) {
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
        <div className="flex gap-6 mr-6">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Self-Healed</span>
            <span className="text-lg font-mono text-green-400">94.2%</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Active Escalations</span>
            <span className="text-lg font-mono text-amber-400">12</span>
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