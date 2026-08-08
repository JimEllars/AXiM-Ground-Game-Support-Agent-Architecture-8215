import React, { useState } from 'react';
import SafeIcon from '../common/SafeIcon';

export default function CommandModal({ isOpen, onClose, onSendCommand }) {
  const [targetId, setTargetId] = useState('');
  const [command, setCommand] = useState('flush_buffer');
  const [toast, setToast] = useState(null);
  
  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSendCommand({ targetDeviceId: targetId, command });
    setToast(`Command '${command}' successfully dispatched to ${targetId}`);
    setTargetId('');
    setTimeout(() => {
      setToast(null);
      onClose();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
        {toast && (
          <div className="bg-green-500/20 border-b border-green-500/50 text-green-400 px-5 py-3 text-sm font-medium flex items-center justify-center">
            {toast}
          </div>
        )}
        <div className="flex justify-between items-center p-5 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <SafeIcon name="Cpu" className="text-indigo-400" />
            Send Remote Command
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <SafeIcon name="X" className="text-xl" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Target Device ID</label>
            <input 
              type="text" 
              required
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder="e.g. DEV-88392-AX"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Action / Command</label>
            <select 
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 appearance-none"
            >
              <option value="flush_buffer">Flush Offline Buffer</option>
              <option value="reissue_token">Reissue Ephemeral Token</option>
              <option value="clear_address_lock">Clear Address Lock</option>
              <option value="reset_rate_limit">Reset Rate Limit</option>
            </select>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20"
            >
              <SafeIcon name="Send" />
              Dispatch Command
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
