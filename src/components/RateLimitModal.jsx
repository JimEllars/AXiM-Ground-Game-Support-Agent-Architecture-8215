import React, { useState, useEffect } from 'react';
import SafeIcon from '../common/SafeIcon';
import { useAgentTelemetry } from '../lib/useAgentTelemetry';


export default function RateLimitModal({ isOpen, onClose, onSendCommand }) {
  const { rateLimits, isLive } = useAgentTelemetry(10000);
  const [throttledDevices, setThrottledDevices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    if (rateLimits && rateLimits.throttledDevices) {
        setThrottledDevices(rateLimits.throttledDevices);
        setIsLoading(false);
    }


    /* old fetch logic commented out by patch */
  }, [isOpen, rateLimits]);


  const handleReset = async (deviceId) => {
    await onSendCommand({ targetDeviceId: deviceId, command: 'reset_rate_limit' });
    // Refresh list optimistically or by re-fetching
    setThrottledDevices(prev => prev.filter(d => d.deviceId !== deviceId));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-[600px] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
          <div className="flex items-center gap-2 text-orange-400">
            <SafeIcon name="Flame" className="text-xl" />
            <h2 className="text-lg font-semibold text-white">SOC Rate-Limit Inspector</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <SafeIcon name="X" />
          </button>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="text-center text-gray-500 py-8">Loading rate limits...</div>
          ) : throttledDevices.length === 0 ? (
            <div className="text-center text-gray-500 py-8 flex flex-col items-center">
              <SafeIcon name="CheckCircle" className="text-green-500 text-3xl mb-2" />
              <p>No active rate-limited devices.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {throttledDevices.map((device) => (
                <div key={device.deviceId} className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex justify-between items-center">
                  <div>
                    <div className="font-mono text-white text-sm mb-1">{device.deviceId}</div>
                    <div className="text-xs text-gray-400 flex gap-4">
                      <span>Requests: <span className="text-orange-400 font-bold">{device.requestCount}</span></span>
                      <span>Cooldown TTL: <span className="text-blue-400">{device.expiresInSeconds}s</span></span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleReset(device.deviceId)}
                    className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-md text-xs font-medium transition-colors border border-gray-600"
                  >
                    <SafeIcon name="RefreshCcw" className="text-[12px]" />
                    Reset Cooldown
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
