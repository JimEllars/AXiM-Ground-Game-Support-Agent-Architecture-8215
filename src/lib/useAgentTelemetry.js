import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase';

const MAX_BACKOFF = 30000;
const INITIAL_BACKOFF = 1000;

export function useAgentTelemetry(pollingInterval = 10000) {
  const [healthData, setHealthData] = useState(null);
  const [rateLimits, setRateLimits] = useState(null);
  const [isLive, setIsLive] = useState(true);
  const [error, setError] = useState(null);

  const backoffRef = useRef(INITIAL_BACKOFF);
  const timerRef = useRef(null);

  const edgeUrl = import.meta.env.VITE_EDGE_URL || '';
  const aximKey = import.meta.env.VITE_AXIM_INTERNAL_KEY || '';

  const fetchTelemetry = useCallback(async () => {
    try {
      const [healthRes, rateLimitRes] = await Promise.all([
        fetch(`${edgeUrl}/api/telemetry/health`, {
          headers: {
            'X-Axim-Signature': aximKey
          }
        }),
        fetch(`${edgeUrl}/api/ratelimits`, {
          headers: {
            'X-Axim-Signature': aximKey
          }
        })
      ]);

      if (!healthRes.ok || !rateLimitRes.ok) {
        throw new Error('Edge connection failed');
      }

      const health = await healthRes.json();
      const limits = await rateLimitRes.json();

      setHealthData(health);
      setRateLimits(limits);
      setIsLive(true);
      setError(null);
      backoffRef.current = INITIAL_BACKOFF; // Reset backoff on success

    } catch (err) {
      setIsLive(false);
      setError(err.message);


      // Fallback to Supabase for some stats if edge fails?
      try {
          // Simplistic fallback: grab something from hitl_audit_logs to show db connection is alive
          const { count } = await supabase.from('hitl_audit_logs').select('*', { count: 'exact', head: true });
          setHealthData(prev => ({
              ...prev,
              status: "degraded",
              fleet_status: "edge_offline",
              fallback_db_count: count
          }));
      } catch (dbErr) {
          console.error("Fallback DB error", dbErr);
      }


      // Exponential backoff logic
      backoffRef.current = Math.min(backoffRef.current * 1.5, MAX_BACKOFF);
    }
  }, [edgeUrl, aximKey]);

  useEffect(() => {
    fetchTelemetry();

    const loop = () => {
      timerRef.current = setTimeout(async () => {
        await fetchTelemetry();
        loop();
      }, isLive ? pollingInterval : backoffRef.current);
    };

    loop();

    return () => clearTimeout(timerRef.current);
  }, [fetchTelemetry, pollingInterval, isLive]);

  return {
    healthData,
    rateLimits,
    isLive,
    error,
    refresh: fetchTelemetry
  };
}
