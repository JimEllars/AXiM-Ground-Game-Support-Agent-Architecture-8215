import React, { useState } from 'react';
import DashboardHeader from './DashboardHeader';
import IncidentList from './IncidentList';
import CommandModal from './CommandModal';

const MOCK_INCIDENTS = [
  {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    deviceId: 'DEV-88392-AX',
    operatorAddress: '0x71C...392A',
    category: 'offline_buffer_stagnation',
    status: 'self_healed',
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString()
  },
  {
    id: 'a89c310b-12cc-4172-b567-0e02b2c3a111',
    deviceId: 'DEV-99102-BX',
    operatorAddress: '0x88D...112B',
    category: 'jwt_clock_skew',
    status: 'self_healed',
    createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString()
  },
  {
    id: 'b12cc10b-58cc-4372-a567-0e02b2c3d999',
    deviceId: 'DEV-11234-CX',
    operatorAddress: '0x11A...992C',
    category: 'unknown_field_fault',
    status: 'escalated_to_central_support',
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString()
  }
];

export default function GroundGameSupportDashboard() {
  const [isCommandModalOpen, setCommandModalOpen] = useState(false);
  const [incidents, setIncidents] = useState(MOCK_INCIDENTS);

  const handleSendCommand = (cmdData) => {
    console.log("Command Dispatched to KV:", cmdData);
    alert(`Command '${cmdData.command}' queued for ${cmdData.targetDeviceId}`);
    setCommandModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-black text-gray-100 font-sans selection:bg-indigo-500/30">
      <DashboardHeader onOpenCommand={() => setCommandModalOpen(true)} />
      
      <main className="max-w-7xl mx-auto">
        <div className="px-6 pt-6">
          <h2 className="text-lg font-medium text-white mb-2">Live Incident Stream</h2>
          <p className="text-sm text-gray-400 mb-4">Real-time autonomic telemetry from AXiM field edge agents.</p>
        </div>
        
        <IncidentList incidents={incidents} />
      </main>

      <CommandModal 
        isOpen={isCommandModalOpen} 
        onClose={() => setCommandModalOpen(false)}
        onSendCommand={handleSendCommand}
      />
    </div>
  );
}