import React, { useState, useEffect, useCallback } from 'react';
import DashboardHeader from './DashboardHeader';
import IncidentList from './IncidentList';
import CommandModal from './CommandModal';
import RateLimitModal from './RateLimitModal';
import HITLAuditModal from './HITLAuditModal';
import FleetHealthModal from './FleetHealthModal';
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
  const [isRateLimitModalOpen, setRateLimitModalOpen] = useState(false);
  const [isAuditModalOpen, setAuditModalOpen] = useState(false);
  const [isFleetModalOpen, setFleetModalOpen] = useState(false);
  const [incidents, setIncidents] = useState([]);
  const [isLive, setIsLive] = useState(true);
  const [toastMessage, setToastMessage] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIncidents, setSelectedIncidents] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all');
  const [realtimeStatus, setRealtimeStatus] = useState('CONNECTING');

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
    let reconnectTimeoutId = null;
    let reconnectAttempts = 0;

    const setupSubscription = () => {
      subscription = supabase
        .channel('schema-db-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'groundgame_support_incidents',
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              const newIncident = payload.new;

              if (newIncident.remediation_status === 'self_healed') {
                const config = {
                  gps_telemetry_drift: { label: 'GPS Drift', color: 'bg-blue-500' },
                  offline_buffer_stagnation: { label: 'Buffer Stagnation', color: 'bg-yellow-500' },
                  jwt_clock_skew: { label: 'JWT Skew', color: 'bg-purple-500' },
                  data_sync_conflict: { label: 'Sync Conflict', color: 'bg-red-500' },
                  api_rate_limit_lock: { label: 'Rate Limit', color: 'bg-orange-500' }
                };
                const catLabel = config[newIncident.category]?.label || newIncident.category;
                setToastMessage(`⚡ Autonomous Self-Healing Applied: ${catLabel} for Device ${newIncident.agent_device_id} (<50ms)`);
                setTimeout(() => setToastMessage(null), 4000);
              }

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
            } else if (payload.eventType === 'UPDATE') {
              const updatedIncident = payload.new;
              setIncidents(prev => prev.map(inc =>
                inc.id === updatedIncident.id ?
                { ...inc, status: updatedIncident.remediation_status, resolvedAt: updatedIncident.resolved_at } : inc
              ));
            }
          }
        )
        .subscribe((status) => {
          setRealtimeStatus(status);
          if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            if (isLive) {
              const backoff = Math.min(8000, 2000 * Math.pow(2, reconnectAttempts));
              reconnectAttempts++;
              reconnectTimeoutId = setTimeout(setupSubscription, backoff);
            }
          } else if (status === 'SUBSCRIBED') {
            reconnectAttempts = 0;
          }
        });
    };

    if (isLive) {
      setupSubscription();
    } else {
       setRealtimeStatus('CLOSED');
    }

    return () => {
      if (subscription) {
        supabase.removeChannel(subscription);
      }
      if (reconnectTimeoutId) {
        clearTimeout(reconnectTimeoutId);
      }
    };
  }, [fetchIncidents, isLive]);

  const handleSendCommand = async (cmdData) => {
    try {
      const edgeUrl = import.meta.env.VITE_EDGE_URL || '';
      const response = await fetch(`${edgeUrl}/api/v1/support/groundgame/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Axim-Signature': import.meta.env.VITE_AXIM_INTERNAL_KEY || ''
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

  const handleBulkAcknowledge = async () => {
    if (selectedIncidents.length === 0) return;

    try {
      const edgeUrl = import.meta.env.VITE_EDGE_URL || '';
      const requests = selectedIncidents.map(incidentId => {
        const incident = incidents.find(i => i.id === incidentId);
        return fetch(`${edgeUrl}/api/v1/support/groundgame/acknowledge`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Axim-Signature': import.meta.env.VITE_AXIM_INTERNAL_KEY || ''
          },
          body: JSON.stringify({
            incidentId,
            operatorAddress: incident ? incident.operatorAddress : 'system'
          })
        });
      });

      await Promise.all(requests);
      setToastMessage(`Successfully resolved ${selectedIncidents.length} incidents.`);
      setSelectedIncidents([]);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (error) {
      console.error("Failed to bulk acknowledge incidents:", error);
      setToastMessage(`Failed to resolve selected incidents.`);
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const handleAcknowledgeIncident = async (incidentId, operatorAddress) => {
    try {
      const edgeUrl = import.meta.env.VITE_EDGE_URL || '';
      const response = await fetch(`${edgeUrl}/api/v1/support/groundgame/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Axim-Signature': import.meta.env.VITE_AXIM_INTERNAL_KEY || ''
        },
        body: JSON.stringify({
          incidentId,
          operatorAddress
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      setToastMessage(`Incident ${incidentId.substring(0,8)} resolved by ${operatorAddress}`);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (error) {
      console.error("Failed to acknowledge incident:", error);
      setToastMessage(`Failed to acknowledge incident ${incidentId.substring(0,8)}`);
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const filteredIncidents = incidents.filter(i => {
    if (categoryFilter !== 'all' && i.category !== categoryFilter) return false;
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;

    if (timeFilter !== 'all') {
      const incidentTime = new Date(i.createdAt || i.created_at).getTime();
      const now = Date.now();
      if (timeFilter === '1h' && now - incidentTime > 3600000) return false;
      if (timeFilter === '6h' && now - incidentTime > 21600000) return false;
    }

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

  // Category Distribution
  const categoryCounts = incidents.reduce((acc, i) => {
    acc[i.category] = (acc[i.category] || 0) + 1;
    return acc;
  }, {});

  const categoriesConfig = {
    gps_telemetry_drift: { label: 'GPS Drift', color: 'bg-blue-500' },
    offline_buffer_stagnation: { label: 'Buffer Stagnation', color: 'bg-yellow-500' },
    jwt_clock_skew: { label: 'JWT Skew', color: 'bg-purple-500' },
    data_sync_conflict: { label: 'Sync Conflict', color: 'bg-red-500' },
    api_rate_limit_lock: { label: 'Rate Limit', color: 'bg-orange-500' }
  };

  return (
    <div className="min-h-screen bg-black text-gray-100 font-sans selection:bg-indigo-500/30 relative">
      <DashboardHeader
        onOpenCommand={() => setCommandModalOpen(true)}
        onOpenAudit={() => setAuditModalOpen(true)}
        onOpenRateLimit={() => setRateLimitModalOpen(true)}
        onOpenFleet={() => setFleetModalOpen(true)}
        isLive={isLive}
        onToggleLive={() => setIsLive(!isLive)}
        metrics={metrics}
        onRetryWebhooks={(count) => {
          setToastMessage(`Successfully retried ${count} webhooks`);
          setTimeout(() => setToastMessage(null), 4000);
        }}
      />
      
      {toastMessage && (
        <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-50 bg-green-500 text-white px-4 py-2 rounded shadow-lg transition-opacity">
          {toastMessage}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 pt-6">

        {realtimeStatus !== 'SUBSCRIBED' && isLive && (
          <div className="mb-4 text-xs font-medium bg-amber-900/30 text-amber-400 border border-amber-500/50 rounded-md px-3 py-2 flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            Realtime Disconnected — Retrying...
          </div>
        )}

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


        {/* Category Distribution Bar */}
        {totalIncidents > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-400 mb-2">Category Distribution</h3>
            <div className="flex h-3 w-full rounded-full overflow-hidden bg-gray-800">
              {Object.entries(categoryCounts).map(([cat, count]) => {
                const percentage = ((count / totalIncidents) * 100).toFixed(1);
                const config = categoriesConfig[cat] || { label: cat, color: 'bg-gray-500' };
                return (
                  <div
                    key={cat}
                    className={`${config.color} h-full transition-all duration-500 group relative`}
                    style={{ width: `${percentage}%` }}
                  >
                    <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-800 text-white text-xs py-1 px-2 rounded pointer-events-none z-10 shadow-lg">
                      {config.label}: {count} ({percentage}%)
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-2 flex-wrap">
              {Object.entries(categoryCounts).map(([cat, count]) => {
                const config = categoriesConfig[cat] || { label: cat, color: 'bg-gray-500' };
                return (
                  <div key={cat} className="flex items-center gap-1.5 text-xs text-gray-400">
                    <span className={`w-2 h-2 rounded-full ${config.color}`}></span>
                    <span>{config.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-between items-end mb-4">

          <div>
            <h2 className="text-lg font-medium text-white mb-1">Live Incident Stream</h2>
            <p className="text-sm text-gray-400">Real-time autonomic telemetry from AXiM field edge agents.</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => {
                const headers = ['Incident ID', 'Device ID', 'Operator Address', 'Category', 'Status', 'Diagnostic Snapshot', 'Created At'];
                const csvRows = [headers.join(',')];

                filteredIncidents.forEach(inc => {
                  const values = [
                    inc.id,
                    inc.deviceId,
                    inc.operatorAddress,
                    inc.category,
                    inc.status,
                    inc.diagnosticSnapshot ? JSON.stringify(inc.diagnosticSnapshot).replace(/"/g, '""') : '',
                    inc.createdAt
                  ];
                  csvRows.push(values.map(v => `"${v}"`).join(','));
                });

                const csvString = csvRows.join('\n');
                const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.setAttribute('href', url);
                link.setAttribute('download', 'axim_incidents_export.csv');
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-1.5 transition-colors shadow-sm"
            >
              Export CSV
            </button>
            <input
              type="text"
              placeholder="Search Device or Operator..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 w-64"
            />
            <select
              value={timeFilter}
              onChange={e => setTimeFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-sm text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Time (24h)</option>
              <option value="1h">Last 1 Hour</option>
              <option value="6h">Last 6 Hours</option>
            </select>
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
        
        {selectedIncidents.length > 0 && (
          <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50">
            <button
              onClick={handleBulkAcknowledge}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-full px-6 py-3 shadow-lg shadow-indigo-900/50 transition-all flex items-center gap-2"
            >
              <SafeIcon name="Check" className="text-sm" />
              Bulk Acknowledge Selected ({selectedIncidents.length})
            </button>
          </div>
        )}
        <IncidentList
          incidents={filteredIncidents}
          onAcknowledge={handleAcknowledgeIncident}
          selectedIncidents={selectedIncidents}
          setSelectedIncidents={setSelectedIncidents}
        />
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
      <FleetHealthModal
        isOpen={isFleetModalOpen}
        onClose={() => setFleetModalOpen(false)}
        onSendCommand={handleSendCommand}
      />
      <RateLimitModal
        isOpen={isRateLimitModalOpen}
        onClose={() => setRateLimitModalOpen(false)}
        onSendCommand={handleSendCommand}
      />
    </div>
  );
}
