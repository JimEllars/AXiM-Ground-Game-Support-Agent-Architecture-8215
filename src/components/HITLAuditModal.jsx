import React, { useState, useEffect } from 'react';
import SafeIcon from '../common/SafeIcon';
import { supabase } from '../lib/supabase';

export default function HITLAuditModal({ isOpen, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchLogs();

      const subscription = supabase
        .channel('public:hitl_audit_logs')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'hitl_audit_logs' },
          (payload) => {
            setLogs((currentLogs) => [payload.new, ...currentLogs].slice(0, 25));
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(subscription);
      };
    }
  }, [isOpen]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hitl_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(25);

      if (error) {
        console.error('Error fetching audit logs:', error);
      } else if (data) {
        setLogs(data);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-4xl max-h-[80vh] shadow-2xl flex flex-col">
        <div className="flex justify-between items-center p-5 border-b border-gray-800 shrink-0">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <SafeIcon name="Shield" className="text-indigo-400" />
            Audit Activity Log
          </h2>
          <div className="flex gap-4">
            <button
              onClick={() => {
                const jsonString = JSON.stringify(logs, null, 2);
                const blob = new Blob([jsonString], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.setAttribute('href', url);
                link.setAttribute('download', 'axim_audit_logs_export.json');
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors border border-gray-700 mr-2"
            >
              Export JSON
            </button>
            <button onClick={fetchLogs} className="text-gray-400 hover:text-white transition-colors" title="Refresh">
               <SafeIcon name="RefreshCw" className="text-lg" />
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
              <SafeIcon name="X" className="text-xl" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <span className="text-gray-400">Loading audit logs...</span>
            </div>
          ) : logs.length === 0 ? (
             <div className="flex justify-center items-center h-32">
              <span className="text-gray-500">No audit logs found.</span>
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map(log => (
                <div key={log.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-sm flex gap-4">
                   <div className="w-1/4 shrink-0">
                      <div className="text-gray-400 text-xs mb-1">{new Date(log.created_at).toLocaleString()}</div>
                      <div className="text-white font-medium break-all">{log.target_device_id}</div>
                      <div className="text-gray-500 text-xs mt-1">Actor: {log.actor}</div>
                   </div>
                   <div className="w-3/4">
                      <div className="mb-2">
                         <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                           log.event_type === 'automated_self_healing' ? 'bg-green-100 text-green-800' :
                           log.event_type === 'operator_command' ? 'bg-blue-100 text-blue-800' :
                           'bg-red-100 text-red-800'
                         }`}>
                            {log.event_type}
                         </span>
                      </div>
                      <div className="text-gray-300 whitespace-pre-wrap font-mono text-xs bg-gray-900 p-2 rounded">
                        {JSON.stringify(log.details, null, 2)}
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
