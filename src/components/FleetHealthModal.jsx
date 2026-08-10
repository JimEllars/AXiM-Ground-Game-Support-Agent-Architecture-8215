import React, { useState, useEffect } from 'react';
import SafeIcon from '../common/SafeIcon';

export default function FleetHealthModal({ isOpen, onClose, onSendCommand }) {
  const [fleetData, setFleetData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [commandSuccess, setCommandSuccess] = useState({});

  useEffect(() => {
    if (isOpen) {
      fetchFleetHealth();
      const interval = setInterval(fetchFleetHealth, 15000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const fetchFleetHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const edgeUrl = import.meta.env.VITE_EDGE_URL || '';
      const response = await fetch(`${edgeUrl}/api/v1/support/groundgame/fleet`, {
        method: 'GET',
        headers: {
          'X-Axim-Signature': import.meta.env.VITE_AXIM_INTERNAL_KEY || ''
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch fleet data');
      }
      const data = await response.json();
      setFleetData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
          <div className="flex items-center gap-2">
            <SafeIcon name="Smartphone" className="text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Active Fleet Health</h3>
            {loading && <SafeIcon name="RefreshCw" className="text-gray-400 animate-spin text-sm ml-2" />}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <SafeIcon name="X" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {error ? (
            <div className="text-red-400 text-sm text-center py-4 bg-red-900/20 rounded-lg">
              Error fetching fleet data: {error}
            </div>
          ) : !fleetData ? (
            <div className="text-gray-400 text-sm text-center py-8">Loading fleet data...</div>
          ) : fleetData.activeFleetCount === 0 ? (
             <div className="text-gray-400 text-sm text-center py-8 border border-gray-800 border-dashed rounded-lg">
                No active devices found in the last 5 minutes.
             </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fleetData.devices.sort((a,b) => b.lastSeen - a.lastSeen).map((device) => (
                <div key={device.deviceId} className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex flex-col gap-3 relative overflow-hidden">
                   <div className="flex justify-between items-start">
                     <div>
                       <div className="font-mono text-sm text-white font-medium">{device.deviceId}</div>
                       <div className="text-xs text-gray-500 mt-0.5">
                         Last seen: {Math.floor((Date.now() - device.lastSeen) / 1000)}s ago
                       </div>
                     </div>
                     <div className="flex items-center gap-2">
                       {commandSuccess[device.deviceId] && (
                          <div className="text-green-400 text-xs font-medium flex items-center gap-1 animate-pulse">
                            <SafeIcon name="Check" className="text-[10px]" /> Sent
                          </div>
                       )}
                       <div className="relative group">
                         <button className="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-xs text-white border border-gray-600 transition-colors flex items-center gap-1">
                           <SafeIcon name="Terminal" className="text-[10px]" />
                           Action
                         </button>
                         <div className="absolute right-0 mt-1 w-36 bg-gray-800 border border-gray-700 rounded-md shadow-lg hidden group-hover:block z-10 overflow-hidden">
                           <button
                             onClick={() => {
                               if(onSendCommand) {
                                 onSendCommand({ targetDeviceId: device.deviceId, command: 'flush_buffer' });
                                 setCommandSuccess(prev => ({...prev, [device.deviceId]: true}));
                                 setTimeout(() => setCommandSuccess(prev => ({...prev, [device.deviceId]: false})), 3000);
                               }
                             }}
                             className="block w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 hover:text-white"
                           >
                             Flush Buffer
                           </button>
                           <button
                             onClick={() => {
                               if(onSendCommand) {
                                 onSendCommand({ targetDeviceId: device.deviceId, command: 'reissue_token' });
                                 setCommandSuccess(prev => ({...prev, [device.deviceId]: true}));
                                 setTimeout(() => setCommandSuccess(prev => ({...prev, [device.deviceId]: false})), 3000);
                               }
                             }}
                             className="block w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 hover:text-white"
                           >
                             Reissue Token
                           </button>
                           <button
                             onClick={() => {
                               if(onSendCommand) {
                                 onSendCommand({ targetDeviceId: device.deviceId, command: 'reset_rate_limit' });
                                 setCommandSuccess(prev => ({...prev, [device.deviceId]: true}));
                                 setTimeout(() => setCommandSuccess(prev => ({...prev, [device.deviceId]: false})), 3000);
                               }
                             }}
                             className="block w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 hover:text-white"
                           >
                             Reset Rate Limit
                           </button>
                         </div>
                       </div>
                       <div className="bg-gray-900 px-2 py-1 rounded text-xs text-gray-400 border border-gray-700">
                          v{device.appVersion || 'Unknown'}
                       </div>
                     </div>
                   </div>

                   <div className="grid grid-cols-2 gap-3 mt-1">
                      <div className="bg-gray-900/50 rounded-md p-2 border border-gray-700/50">
                         <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                           <SafeIcon name="Battery" className="text-gray-400 text-[10px]" /> Battery
                         </div>
                         <div className="flex items-center gap-2">
                           <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                             <div
                               className={`h-full ${device.battery > 50 ? 'bg-green-500' : device.battery > 20 ? 'bg-yellow-500' : 'bg-red-500'}`}
                               style={{ width: `${Math.max(0, Math.min(100, device.battery || 0))}%` }}
                             ></div>
                           </div>
                           <span className="text-xs font-mono text-gray-300 w-8">{device.battery || 0}%</span>
                         </div>
                      </div>

                      <div className="bg-gray-900/50 rounded-md p-2 border border-gray-700/50">
                         <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                           <SafeIcon name="MapPin" className="text-gray-400 text-[10px]" /> GPS Accuracy
                         </div>
                         <div className="text-sm text-white font-medium">
                           {device.gpsAccuracyMeters ? (
                             <span className={device.gpsAccuracyMeters < 10 ? 'text-green-400' : device.gpsAccuracyMeters < 30 ? 'text-yellow-400' : 'text-red-400'}>
                               {device.gpsAccuracyMeters}m
                             </span>
                           ) : (
                             <span className="text-gray-500">N/A</span>
                           )}
                         </div>
                      </div>

                      <div className="col-span-2 bg-gray-900/50 rounded-md p-2 border border-gray-700/50 flex justify-between items-center">
                         <div className="text-xs text-gray-500 flex items-center gap-1">
                           <SafeIcon name="Database" className="text-gray-400 text-[10px]" /> Offline Sync Buffer
                         </div>
                         <div className="text-sm font-mono font-medium">
                           {device.unsyncedBufferCount > 0 ? (
                             <span className="text-yellow-400">{device.unsyncedBufferCount} pending</span>
                           ) : (
                             <span className="text-green-400">0 pending</span>
                           )}
                         </div>
                      </div>
                   </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
