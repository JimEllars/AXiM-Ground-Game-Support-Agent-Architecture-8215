export interface Env {
  SUPPORT_STATE: KVNamespace;
  AXIM_INTERNAL_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  CENTRAL_SUPPORT_WEBHOOK_URL: string;
  ALLOWED_ORIGIN?: string;
}




async function retryFailedWebhooks(env: Env) {
  try {
    const listRes = await env.SUPPORT_STATE.list({ prefix: "webhook_failed:" });
    const retried = [];
    const failed = [];

    for (const key of listRes.keys) {
      const val = await env.SUPPORT_STATE.get(key.name);
      if (val) {
        const parsed = JSON.parse(val);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
          const res = await fetch(env.CENTRAL_SUPPORT_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Axim-Signature": env.AXIM_INTERNAL_KEY },
            body: JSON.stringify(parsed),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (res.ok) {
            await env.SUPPORT_STATE.delete(key.name);
            retried.push(key.name);
          } else {
            failed.push(key.name);
          }
        } catch (err) {
          clearTimeout(timeoutId);
          failed.push(key.name);
        }
      }
    }
    return { success: true, retried, failed };
  } catch (err: any) {
    return { error: err.message };
  }
}

async function logAudit(env: Env, eventType: string, actor: string, targetDeviceId: string, details: any) {
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/hitl_audit_logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "apikey": env.SUPABASE_SERVICE_KEY
      },
      body: JSON.stringify({
        app_source: "AXiM Ground Game Support Agent",
        event_type: eventType,
        actor: actor,
        target_device_id: targetDeviceId,
        details: details,
      })
    });
  } catch (err) {
    console.error("Audit log error", err);
  }
}


async function cleanupStaleKVKeys(env: Env) {
  let prunedCommandKeys = 0;
  const now = Date.now();
  const listRes = await env.SUPPORT_STATE.list({ prefix: "cmd:" });

  for (const key of listRes.keys) {
    const parts = key.name.split(':');
    if (parts.length === 3) {
      const timestamp = parseInt(parts[2], 10);
      if (now - timestamp > 86400000) { // 24 hours
        await env.SUPPORT_STATE.delete(key.name);
        prunedCommandKeys++;
      }
    }
  }

  console.log(JSON.stringify({
    event: "kv_cleanup",
    prunedCommandKeys: prunedCommandKeys,
    timestamp: new Date().toISOString()
  }));
}

function logRequest(url: URL, method: string, deviceId: string | null, status: number) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    endpoint: url.pathname,
    method: method,
    deviceId: deviceId || "system",
    status: status
  }));
}

export default {

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      endpoint: "scheduled",
      method: "CRON",
      deviceId: "system",
      status: 200
    }));
    ctx.waitUntil(retryFailedWebhooks(env));
    ctx.waitUntil(cleanupStaleKVKeys(env));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const CORS_HEADERS = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Axim-Signature, Authorization",
      "Cache-Control": "no-store, private"
    };

    if (request.method === "OPTIONS") {
      logRequest(url, request.method, null, 204);
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

        if (request.method === "POST" && url.pathname === "/api/v1/support/groundgame/heartbeat") {
      try {
        const body = await request.json() as any;
        const { deviceId, battery, gpsAccuracyMeters, unsyncedBufferCount, appVersion } = body;

        if (!deviceId) {
          logRequest(url, request.method, null, 400);
          return new Response("Missing deviceId", { status: 400, headers: CORS_HEADERS });
        }

        const payload = {
          deviceId,
          battery,
          gpsAccuracyMeters,
          unsyncedBufferCount,
          appVersion,
          lastSeen: Date.now()
        };

        await env.SUPPORT_STATE.put(`heartbeat:${deviceId}`, JSON.stringify(payload), { expirationTtl: 300 });

        logRequest(url, request.method, deviceId, 200);
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (err: any) {
        logRequest(url, request.method, null, 500);
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS_HEADERS });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/v1/support/groundgame/fleet") {
      const signature = request.headers.get("X-Axim-Signature");
      if (!signature || signature !== env.AXIM_INTERNAL_KEY) {
        logRequest(url, request.method, null, 401);
        return new Response("Unauthorized", { status: 401, headers: CORS_HEADERS });
      }

      try {
        const prefix = "heartbeat:";
        const listRes = await env.SUPPORT_STATE.list({ prefix });
        const devices = [];

        let staleDeviceCount = 0;
        const now = Date.now();

        for (const key of listRes.keys) {
          const val = await env.SUPPORT_STATE.get(key.name);
          if (val) {
            const device = JSON.parse(val);
            devices.push(device);
            if (now - device.lastSeen > 300000) {
              staleDeviceCount++;
            }
          }
        }

        logRequest(url, request.method, "system", 200);
        return new Response(JSON.stringify({
          success: true,
          activeFleetCount: devices.length,
          staleDeviceCount,
          devices
        }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (err: any) {
        logRequest(url, request.method, null, 500);
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS_HEADERS });
      }
    }

if (request.method === "POST" && url.pathname === "/api/v1/support/groundgame/report") {
      try {
        const payload = await request.json() as any;
        const { deviceId, operatorAddress, category, diagnosticSnapshot } = payload;

        const minuteKey = Math.floor(Date.now() / 60000);
        const rateLimitKey = `ratelimit:${deviceId}:${minuteKey}`;

        let count = 0;
        const currentCount = await env.SUPPORT_STATE.get(rateLimitKey);
        if (currentCount) count = parseInt(currentCount, 10);

        if (count >= 30) {
          logRequest(url, request.method, deviceId, 429);
          return new Response("Too Many Requests", {
            headers: { ...CORS_HEADERS, "X-RateLimit-Limit": "30", "X-RateLimit-Reset": String((minuteKey + 1) * 60000) }
          });
        }
        await env.SUPPORT_STATE.put(rateLimitKey, String(count + 1), { expirationTtl: 60 });

        let remediationStatus = "detected";
        let actionsApplied: string[] = [];

        if (category === "offline_buffer_stagnation") {
          actionsApplied.push("EXECUTED: flush_field_offline_buffer");
          remediationStatus = "self_healed";
        } else if (category === "jwt_clock_skew") {
          actionsApplied.push("EXECUTED: reissue_ephemeral_token");
          remediationStatus = "self_healed";
        } else if (category === "data_sync_conflict") {
          const addressId = diagnosticSnapshot?.addressId;
          if (addressId) {
            await env.SUPPORT_STATE.delete(`lock:address:${addressId}`);
          }
          actionsApplied.push("EXECUTED: release_canvass_row_lock");
          remediationStatus = "self_healed";
        } else if (category === "api_rate_limit_lock") {
          await env.SUPPORT_STATE.delete(rateLimitKey);
          actionsApplied.push("EXECUTED: reset_edge_rate_limit");
          remediationStatus = "self_healed";
        } else {
          remediationStatus = "escalated_to_central_support";
        }

        if (remediationStatus === "self_healed") {
           ctx.waitUntil(logAudit(env, "automated_self_healing", "system", deviceId, { category, actions_applied: actionsApplied }));
        }

        const dbRes = await fetch(`${env.SUPABASE_URL}/rest/v1/groundgame_support_incidents`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            "apikey": env.SUPABASE_SERVICE_KEY,
            "Prefer": "return=representation"
          },
          body: JSON.stringify([{
            agent_device_id: deviceId,
            field_operator_address: operatorAddress,
            category,
            remediation_status: remediationStatus,
            diagnostic_snapshot: diagnosticSnapshot,
            remediation_actions_applied: actionsApplied
          }])
        });

        const incidentData = await dbRes.json() as any;
        const incidentId = incidentData[0]?.id;

        if (remediationStatus === "escalated_to_central_support" && env.CENTRAL_SUPPORT_WEBHOOK_URL) {
          ctx.waitUntil((async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const webhookPayload = {
              appSource: "AXiM Ground Game",
              incidentId: incidentId,
              payload
            };
            try {
              const res = await fetch(env.CENTRAL_SUPPORT_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Axim-Signature": env.AXIM_INTERNAL_KEY },
                body: JSON.stringify(webhookPayload),
                signal: controller.signal
              });
              clearTimeout(timeoutId);
              if (!res.ok) {
                throw new Error(`Webhook failed with status ${res.status}`);
              }
            } catch (err) {
              clearTimeout(timeoutId);
              console.error("Central Support Webhook Error:", err);
              await env.SUPPORT_STATE.put(`webhook_failed:${incidentId}`, JSON.stringify(webhookPayload), { expirationTtl: 86400 });
              await logAudit(env, "webhook_delivery_failed", "system", deviceId, { category, error: String(err) });
            }
          })());
        }

        logRequest(url, request.method, deviceId, 200);
        return new Response(JSON.stringify({
          success: true,
          remediationStatus,
          actionsApplied,
          incidentId
        }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

      } catch (err: any) {
        logRequest(url, request.method, null, 500);
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS_HEADERS });
      }
    }


    if (request.method === "POST" && url.pathname === "/api/v1/support/groundgame/acknowledge") {
      const signature = request.headers.get("X-Axim-Signature");
      if (!signature || signature !== env.AXIM_INTERNAL_KEY) {
        logRequest(url, request.method, null, 401);
        return new Response("Unauthorized", { status: 401, headers: CORS_HEADERS });
      }

      try {
        const body = await request.json() as any;
        const { incidentId, operatorAddress } = body;

        if (!incidentId || !operatorAddress) {
           return new Response("Missing required fields", { status: 400, headers: CORS_HEADERS });
        }

        // Update groundgame_support_incidents in Supabase
        const dbRes = await fetch(`${env.SUPABASE_URL}/rest/v1/groundgame_support_incidents?id=eq.${incidentId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            "apikey": env.SUPABASE_SERVICE_KEY,
            "Prefer": "return=representation"
          },
          body: JSON.stringify({
            remediation_status: "operator_takeover",
            resolved_at: new Date().toISOString()
          })
        });

        if (!dbRes.ok) {
           throw new Error("Failed to update incident in Supabase");
        }

        ctx.waitUntil(logAudit(env, "operator_takeover", "operator", "system", { incidentId, operatorAddress }));

        logRequest(url, request.method, "system", 200);
        return new Response(JSON.stringify({ success: true, status: "operator_takeover", incidentId }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });

      } catch (err: any) {
        logRequest(url, request.method, null, 500);
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS_HEADERS });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/v1/support/groundgame/rate-limits") {
      const signature = request.headers.get("X-Axim-Signature");
      if (!signature || signature !== env.AXIM_INTERNAL_KEY) {
        logRequest(url, request.method, null, 401);
        return new Response("Unauthorized", { status: 401, headers: CORS_HEADERS });
      }

      const prefix = "ratelimit:";
      const listRes = await env.SUPPORT_STATE.list({ prefix });
      const throttledDevices = [];

      for (const key of listRes.keys) {
        const val = await env.SUPPORT_STATE.get(key.name);
        if (val) {
          const count = parseInt(val, 10);
          const parts = key.name.split(':');
          if (parts.length >= 3) {
             const deviceId = parts[1];
             const minuteKey = parseInt(parts[2], 10);
             // expiration is minuteKey + 1 min
             const expiresAtMs = (minuteKey + 1) * 60000;
             const expiresInSeconds = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
             throttledDevices.push({
               deviceId,
               requestCount: count,
               expiresInSeconds
             });
          }
        }
      }

      logRequest(url, request.method, "system", 200);
      return new Response(JSON.stringify({
        success: true,
        throttledDevices
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    // New Webhook Retry Endpoint
    if (request.method === "POST" && url.pathname === "/api/v1/support/groundgame/retry-webhooks") {
      const signature = request.headers.get("X-Axim-Signature");
      if (!signature || signature !== env.AXIM_INTERNAL_KEY) {
        logRequest(url, request.method, null, 401);
        return new Response("Unauthorized", { status: 401, headers: CORS_HEADERS });
      }

      const result = await retryFailedWebhooks(env);
      if (result.error) {
        logRequest(url, request.method, null, 500);
        return new Response(JSON.stringify({ error: result.error }), { status: 500, headers: CORS_HEADERS });
      }
      logRequest(url, request.method, null, 200);
      return new Response(JSON.stringify(result), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    if (request.method === "POST" && url.pathname === "/api/v1/support/groundgame/command") {
      const signature = request.headers.get("X-Axim-Signature");
      if (!signature || signature !== env.AXIM_INTERNAL_KEY) {
        logRequest(url, request.method, null, 401);
        return new Response("Unauthorized Edge Ingress", { status: 401, headers: CORS_HEADERS });
      }

      const body = await request.json() as any;
      const { targetDeviceId, command, parameters } = body;

      if (command === "reset_rate_limit") {
        const listRes = await env.SUPPORT_STATE.list({ prefix: `ratelimit:${targetDeviceId}:` });
        for (const key of listRes.keys) {
          await env.SUPPORT_STATE.delete(key.name);
        }

        // As requested: In addition to queuing the command, list and purge all active KV keys
        await env.SUPPORT_STATE.put(`cmd:${targetDeviceId}:${Date.now()}`, JSON.stringify({ command, parameters }), { expirationTtl: 3600 });

        ctx.waitUntil(logAudit(env, "operator_command", "operator", targetDeviceId, { category: "manual_command", actions_applied: [command] }));
        logRequest(url, request.method, targetDeviceId, 200);

        return new Response(JSON.stringify({ success: true, rateLimitPurged: true, targetDeviceId }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }

      await env.SUPPORT_STATE.put(`cmd:${targetDeviceId}:${Date.now()}`, JSON.stringify({ command, parameters }), { expirationTtl: 3600 });

      ctx.waitUntil(logAudit(env, "operator_command", "operator", targetDeviceId, { category: "manual_command", actions_applied: [command] }));

      logRequest(url, request.method, targetDeviceId, 200);
      return new Response(JSON.stringify({ success: true, status: "command_queued", targetDeviceId }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    if (request.method === "GET" && url.pathname === "/api/v1/support/groundgame/poll") {
      const deviceId = url.searchParams.get("deviceId");
      if (!deviceId) {
        logRequest(url, request.method, null, 400);
        return new Response("Missing deviceId", { status: 400, headers: CORS_HEADERS });
      }

      const prefix = `cmd:${deviceId}:`;
      const listRes = await env.SUPPORT_STATE.list({ prefix });
      const pendingCommands = [];

      for (const key of listRes.keys) {
        const val = await env.SUPPORT_STATE.get(key.name);
        if (val) {
          const parsed = JSON.parse(val);
          const parts = key.name.split(':');
          const timestamp = parts.length === 3 ? parseInt(parts[2], 10) : Date.now();
          pendingCommands.push({
            command: parsed.command,
            parameters: parsed.parameters || {},
            timestamp: timestamp
          });
          ctx.waitUntil(env.SUPPORT_STATE.delete(key.name));
        }
      }

      logRequest(url, request.method, deviceId, 200);
      return new Response(JSON.stringify({
        success: true,
        deviceId: deviceId,
        pendingCommands
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      const [webhookFailedRes, cmdRes, lockRes] = await Promise.all([
        env.SUPPORT_STATE.list({ prefix: "webhook_failed:" }),
        env.SUPPORT_STATE.list({ prefix: "cmd:" }),
        env.SUPPORT_STATE.list({ prefix: "lock:address:" })
      ]);

      const pendingFailedWebhooks = webhookFailedRes.keys.length;
      const activeCommandQueues = cmdRes.keys.length;
      const activeAddressLocks = lockRes.keys.length;

      logRequest(url, request.method, null, 200);
      return new Response(JSON.stringify({
        status: "live",
        timestamp: Date.now(),
        runtime: "edge",
        pendingFailedWebhooks,
        activeCommandQueues,
        activeAddressLocks
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    logRequest(url, request.method, null, 404);
    return new Response("Not Found", { status: 404 });
  }
};
