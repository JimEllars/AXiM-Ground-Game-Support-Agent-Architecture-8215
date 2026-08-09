import React, { useState, useEffect, useCallback } from 'react';
import DashboardHeader from './DashboardHeader';
import IncidentList from './IncidentList';
import CommandModal from './CommandModal';
import HITLAuditModal from './HITLAuditModal';
import { supabase } from '../lib/supabase';

const MOCK_INCIDENTS = [
  {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    deviceId: 'DEV-88392-AX',
    operatorAddress: '0x71C...392A',
    category: 'offline_buffer_stagnation',
    status: 'self_healed',
    diagnosticSnapshot: { battery: 45, memory: "120MB" },
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString()
  },
  {
    id: 'a89c310b-12cc-4172-b567-0e02b2c3a111',
    deviceId: 'DEV-99102-BX',
    operatorAddress: '0x88D...112B',
    category: 'jwt_clock_skew',
    status: 'self_healed',
    diagnosticSnapshot: { battery: 45, memory: "120MB" },
    createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString()
  },
  {
    id: 'b12cc10b-58cc-4372-a567-0e02b2c3d999',
    deviceId: 'DEV-11234-CX',
    operatorAddress: '0x11A...992C',
    category: 'api_rate_limit_lock',
    status: 'escalated_to_central_support',
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString()
  }
];

export default function GroundGameSupportDashboard() {
  const [isCommandModalOpen, setCommandModalOpen] = useState(false);
  const [isAuditModalOpen, setAuditModalOpen] = useState(false);
  const [incidents, setIncidents] = useState([]);
  const [isLive, setIsLive] = useState(true);
  const [toastMessage, setToastMessage] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchIncidents = useCallback(async () => {
    if (!isLive) return;
    try {
      const { data, error } = await supabase
        .from('groundgame_support_incidents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching incidents:', error);
        return;
      }

      if (data) {
        const mappedIncidents = data.map(inc => ({
          id: inc.id,
          deviceId: inc.agent_device_id,
          operatorAddress: inc.field_operator_address,
          category: inc.category,
          status: inc.remediation_status,
          diagnosticSnapshot: inc.diagnostic_snapshot,
          createdAt: inc.created_at
        }));
        setIncidents(mappedIncidents);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    }
  }, [isLive]);

  useEffect(() => {
    fetchIncidents();

    let subscription = null;

    if (isLive) {
      subscription = supabase
        .channel('schema-db-changes')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'groundgame_support_incidents',
          },
          (payload) => {
            const newIncident = payload.new;
            setIncidents(prev => {
              const mapped = {
                id: newIncident.id,
                deviceId: newIncident.agent_device_id,
                operatorAddress: newIncident.field_operator_address,
                category: newIncident.category,
                status: newIncident.remediation_status,
                diagnosticSnapshot: newIncident.diagnostic_snapshot,
                createdAt: newIncident.created_at
              };
              return [mapped, ...prev].slice(0, 50);
            });
          }
        )
        .subscribe();
    }

    return () => {
      if (subscription) {
        supabase.removeChannel(subscription);
      }
    };
  }, [fetchIncidents, isLive]);

  const handleSendCommand = async (cmdData) => {
    try {
      const edgeUrl = import.meta.env.VITE_EDGE_URL || 'http://localhost:8787';
      const response = await fetch(`${edgeUrl}/api/v1/support/groundgame/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Axim-Signature': import.meta.env.VITE_AXIM_INTERNAL_KEY || 'development_key'
        },
        body: JSON.stringify({
          targetDeviceId: cmdData.targetDeviceId,
          command: cmdData.command,
          parameters: {}
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // setToastMessage(`Command '${cmdData.command}' successfully dispatched to ${cmdData.targetDeviceId}`);
    } catch (error) {
      console.error("Failed to dispatch command:", error);
      // setToastMessage(`Failed to dispatch command '${cmdData.command}' to ${cmdData.targetDeviceId}`);
    }
  };
  const filteredIncidents = incidents.filter(i => {
    if (categoryFilter !== 'all' && i.category !== categoryFilter) return false;
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!i.deviceId.toLowerCase().includes(q) && !i.operatorAddress.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  // KPI Metrics Calculation
  const totalIncidents = incidents.length;
  const selfHealedCount = incidents.filter(i => i.status === 'self_healed').length;
  const selfHealedRate = totalIncidents > 0 ? ((selfHealedCount / totalIncidents) * 100).toFixed(1) : 0;
  const escalatedCount = incidents.filter(i => i.status === 'escalated_to_central_support').length;
  const activeDevicesCount = new Set(incidents.map(i => i.deviceId)).size;

  const metrics = { selfHealedRate, escalatedCount };

  return (
    <div className="min-h-screen bg-black text-gray-100 font-sans selection:bg-indigo-500/30 relative">
      <DashboardHeader
        onOpenCommand={() => setCommandModalOpen(true)}
        onOpenAudit={() => setAuditModalOpen(true)}
        isLive={isLive}
        onToggleLive={() => setIsLive(!isLive)}
        metrics={metrics}
      />
      
      {toastMessage && (
        <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-50 bg-green-500 text-white px-4 py-2 rounded shadow-lg transition-opacity">
          {toastMessage}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 pt-6">

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-900 border border-gray-800 p-4 rounded-xl">
            <div className="text-sm text-gray-400 mb-1">Total Incidents (24h)</div>
            <div className="text-2xl font-bold text-white">{totalIncidents}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 p-4 rounded-xl">
            <div className="text-sm text-gray-400 mb-1">Self-Healing Success</div>
            <div className="text-2xl font-bold text-green-400">{selfHealedRate}%</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 p-4 rounded-xl">
            <div className="text-sm text-gray-400 mb-1">Escalated Tickets</div>
            <div className="text-2xl font-bold text-amber-400">{escalatedCount}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 p-4 rounded-xl">
            <div className="text-sm text-gray-400 mb-1">Active Field Devices</div>
            <div className="text-2xl font-bold text-blue-400">{activeDevicesCount}</div>
          </div>
        </div>

        <div className="flex justify-between items-end mb-4">
          <div>
            <h2 className="text-lg font-medium text-white mb-1">Live Incident Stream</h2>
            <p className="text-sm text-gray-400">Real-time autonomic telemetry from AXiM field edge agents.</p>
          </div>
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="Search Device or Operator..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 w-64"
            />
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-sm text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Categories</option>
              <option value="gps_telemetry_drift">GPS Telemetry Drift</option>
              <option value="offline_buffer_stagnation">Offline Buffer Stagnation</option>
              <option value="jwt_clock_skew">JWT Clock Skew</option>
              <option value="data_sync_conflict">Data Sync Conflict</option>
              <option value="api_rate_limit_lock">API Rate Limit Lock</option>
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-sm text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Statuses</option>
              <option value="self_healed">Self-Healed</option>
              <option value="escalated_to_central_support">Escalated</option>
              <option value="detected">Detected</option>
            </select>
          </div>
        </div>
        
        <IncidentList incidents={filteredIncidents} />
      </main>

      <CommandModal 
        isOpen={isCommandModalOpen} 
        onClose={() => setCommandModalOpen(false)}
        onSendCommand={handleSendCommand}
      />
      <HITLAuditModal
        isOpen={isAuditModalOpen}
        onClose={() => setAuditModalOpen(false)}
      />
    </div>
  );
}
