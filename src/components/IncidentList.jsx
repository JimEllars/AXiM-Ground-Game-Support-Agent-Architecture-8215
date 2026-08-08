import React, { useState } from 'react';
import SafeIcon from '../common/SafeIcon';

const getStatusBadge = (status) => {
  switch (status) {
    case 'self_healed':
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20"><SafeIcon name="CheckCircle" className="text-[10px]" /> Self-Healed</span>;
    case 'escalated_to_central_support':
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20"><SafeIcon name="AlertTriangle" className="text-[10px]" /> Escalated</span>;
    default:
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20"><SafeIcon name="Clock" className="text-[10px]" /> Detected</span>;
  }
};

const getCategoryLabel = (cat) => {
  return cat.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

export default function IncidentList({ incidents }) {
  const [expandedId, setExpandedId] = useState(null);

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleCopy = (data) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  };

  return (
    <div className="p-6">
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-800/50 border-b border-gray-800 text-xs uppercase tracking-wider text-gray-400">
                <th className="p-4 font-semibold">Incident ID</th>
                <th className="p-4 font-semibold">Device / Operator</th>
                <th className="p-4 font-semibold">Issue Category</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold">Timestamp</th>
                <th className="p-4 font-semibold">Telemetry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {incidents.map((incident) => (
                <React.Fragment key={incident.id}>
                  <tr className="hover:bg-gray-800/30 transition-colors">
                    <td className="p-4 text-sm font-mono text-gray-300">
                      {incident.id.substring(0, 8)}...
                    </td>
                    <td className="p-4">
                      <div className="text-sm font-medium text-white">{incident.deviceId}</div>
                      <div className="text-xs text-gray-500 font-mono mt-0.5">{incident.operatorAddress}</div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <SafeIcon name="Shield" className="text-gray-500" />
                        <span className="text-sm text-gray-300">{getCategoryLabel(incident.category)}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      {getStatusBadge(incident.status)}
                    </td>
                    <td className="p-4 text-sm text-gray-500">
                      {new Date(incident.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => toggleExpand(incident.id)}
                        className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        {expandedId === incident.id ? 'Hide' : 'Inspect Diagnostic Telemetry'}
                      </button>
                    </td>
                  </tr>
                  {expandedId === incident.id && (
                    <tr className="bg-gray-800/20">
                      <td colSpan="6" className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Diagnostic Snapshot</span>
                          <button
                            onClick={() => handleCopy(incident.diagnosticSnapshot)}
                            className="text-xs flex items-center gap-1 bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded transition-colors"
                          >
                            <SafeIcon name="Copy" className="text-[10px]" /> Copy JSON
                          </button>
                        </div>
                        <pre className="bg-gray-900 border border-gray-800 p-3 rounded-lg text-xs text-green-400 font-mono overflow-x-auto whitespace-pre-wrap">
                          {incident.diagnosticSnapshot ? JSON.stringify(incident.diagnosticSnapshot, null, 2) : 'No diagnostic data available.'}
                        </pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {incidents.length === 0 && (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-gray-500 text-sm">
                    No active incidents. The field is clear.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
