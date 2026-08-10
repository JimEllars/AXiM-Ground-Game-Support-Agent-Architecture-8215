import React, { useState, useEffect } from 'react';
import SafeIcon from '../common/SafeIcon';

export default function DashboardHeader(props) {
  const { onOpenCommand, isLive, onToggleLive, metrics, onOpenAudit, onOpenRateLimit, onOpenFleet } = props;

  const [healthStatus, setHealthStatus] = useState(null);
  const [latency, setLatency] = useState(null);
  const [pendingFailedWebhooks, setPendingFailedWebhooks] = useState(0);
  const [activeCommandQueues, setActiveCommandQueues] = useState(0);
  const [activeAddressLocks, setActiveAddressLocks] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showQueuePopover, setShowQueuePopover] = useState(false);
  const [staleDeviceCount, setStaleDeviceCount] = useState(0);


  useEffect(() => {
    const checkHealth = async () => {
      const start = Date.now();
      try {
        const edgeUrl = import.meta.env.VITE_EDGE_URL || '';
        const res = await fetch(`${edgeUrl}/health`);
        if (res.ok) {
          const data = await res.json();
          setLatency(Date.now() - start);
          setHealthStatus('online');
          if (data.pendingFailedWebhooks !== undefined) {
             setPendingFailedWebhooks(data.pendingFailedWebhooks);
          }
          if (data.activeCommandQueues !== undefined) {
             setActiveCommandQueues(data.activeCommandQueues);
          }
          if (data.activeAddressLocks !== undefined) {
             setActiveAddressLocks(data.activeAddressLocks);
          }
        } else {
          setHealthStatus('offline');
        }
      } catch (err) {
        setHealthStatus('offline');
      }
    };

    const checkFleet = async () => {
      try {
        const edgeUrl = import.meta.env.VITE_EDGE_URL || '';
        const res = await fetch(`${edgeUrl}/api/v1/support/groundgame/fleet`, {
          method: 'GET',
          headers: {
            'X-Axim-Signature': import.meta.env.VITE_AXIM_INTERNAL_KEY || ''
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.staleDeviceCount !== undefined) {
             setStaleDeviceCount(data.staleDeviceCount);
          }
        }
      } catch (err) {
        // silently fail for fleet background check
      }
    };

    checkHealth();
    checkFleet();
    const interval = setInterval(checkHealth, 30000);
    const fleetInterval = setInterval(checkFleet, 60000); // Check fleet every 60s
    return () => {
      clearInterval(interval);
      clearInterval(fleetInterval);
    };
  }, []);


  const handleRefreshKV = async () => {
      const start = Date.now();
      try {
        const edgeUrl = import.meta.env.VITE_EDGE_URL || '';
        const res = await fetch(`${edgeUrl}/health`);
        if (res.ok) {
          const data = await res.json();
          setLatency(Date.now() - start);
          setHealthStatus('online');
          if (data.pendingFailedWebhooks !== undefined) setPendingFailedWebhooks(data.pendingFailedWebhooks);
          if (data.activeCommandQueues !== undefined) setActiveCommandQueues(data.activeCommandQueues);
          if (data.activeAddressLocks !== undefined) setActiveAddressLocks(data.activeAddressLocks);
        } else {
          setHealthStatus('offline');
        }
      } catch (err) {
        setHealthStatus('offline');
      }
  };

  const handleManualRetry = async () => {
    setIsRetrying(true);
    try {
      const edgeUrl = import.meta.env.VITE_EDGE_URL || '';
      const response = await fetch(`${edgeUrl}/api/v1/support/groundgame/retry-webhooks`, {
        method: 'POST',
        headers: {
          'X-Axim-Signature': import.meta.env.VITE_AXIM_INTERNAL_KEY || ''
        }
      });
      const result = await response.json();
      if (result.success && props.onRetryWebhooks) {
        props.onRetryWebhooks(result.retried ? result.retried.length : 0);
      }

      // Re-check health after a short delay
      setTimeout(() => {
        fetch(`${edgeUrl}/health`).then(res => res.ok && res.json()).then(data => {
          if (data && data.pendingFailedWebhooks !== undefined) {
            setPendingFailedWebhooks(data.pendingFailedWebhooks);
          }
          if (data && data.activeCommandQueues !== undefined) {
             setActiveCommandQueues(data.activeCommandQueues);
          }
          if (data && data.activeAddressLocks !== undefined) {
             setActiveAddressLocks(data.activeAddressLocks);
          }
        }).catch(() => {});
      }, 1000);
    } catch (err) {
      console.error('Failed to retry webhooks:', err);
    } finally {
      setIsRetrying(false);
    }
  };

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
          <div className="relative">
            <div
              className="flex items-center gap-2 mr-4 px-3 py-1.5 rounded-full bg-gray-800 border border-gray-700 text-xs font-medium cursor-pointer hover:bg-gray-700 transition-colors"
              onClick={() => setShowQueuePopover(!showQueuePopover)}
            >
              <span className={`w-2 h-2 rounded-full ${healthStatus === 'online' ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span className="text-gray-300">
                {healthStatus === 'online' ? `Edge Online • ${latency}ms` : 'Edge Offline'}
              </span>
            </div>

            {showQueuePopover && (
              <div className="absolute top-full left-0 mt-2 w-56 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 p-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">KV Queue State</h4>
                  <button
                    onClick={handleRefreshKV}
                    className="text-gray-400 hover:text-white transition-colors"
                    title="Refresh KV Telemetry"
                  >
                    <SafeIcon name="RefreshCw" className="text-[12px]" />
                  </button>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">Pending Commands:</span>
                    <span className="font-mono text-white">{activeCommandQueues}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">Address Locks:</span>
                    <span className="font-mono text-white">{activeAddressLocks}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">Retry Webhooks:</span>
                    <span className="font-mono text-amber-400">{pendingFailedWebhooks}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {pendingFailedWebhooks > 0 && (
          <button
            onClick={handleManualRetry}
            disabled={isRetrying}
            className="flex items-center gap-2 mr-4 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-400 text-xs font-medium hover:bg-amber-500/30 transition-colors"
          >
            <SafeIcon name="AlertTriangle" className="text-[10px]" />
            <span>Retry Webhooks: {pendingFailedWebhooks}</span>
            {isRetrying && <SafeIcon name="RefreshCw" className="text-[10px] animate-spin ml-1" />}
          </button>
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
        {staleDeviceCount > 0 && (
          <button
            onClick={onOpenFleet}
            className="flex items-center gap-2 mr-4 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-400 text-xs font-medium hover:bg-amber-500/30 transition-colors"
          >
            <SafeIcon name="AlertTriangle" className="text-[10px]" />
            <span>⚠️ Offline/Stale: {staleDeviceCount}</span>
          </button>
        )}
        <button
          onClick={onOpenFleet}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-blue-400 px-4 py-2 rounded-md transition-colors font-medium text-sm mr-2"
        >
          <SafeIcon name="Smartphone" />
          <span>Fleet Health</span>
        </button>
        <button
          onClick={onOpenAudit}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white px-4 py-2 rounded-md transition-colors font-medium text-sm mr-2"
        >
          <SafeIcon name="Shield" />
          <span>Audit Trail</span>
        </button>

        <button
          onClick={onOpenRateLimit}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-orange-400 px-4 py-2 rounded-md transition-colors font-medium text-sm mr-2"
        >
          <SafeIcon name="Flame" />
          <span>Rate Limits</span>
        </button>
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
