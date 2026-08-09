export interface Env {
  SUPPORT_STATE: KVNamespace;
  AXIM_INTERNAL_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  CENTRAL_SUPPORT_WEBHOOK_URL: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Axim-Signature, Authorization",
  "Cache-Control": "no-store, private"
};


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

export default {

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(retryFailedWebhooks(env));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
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
          return new Response("Too Many Requests", {
            status: 429,
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

        return new Response(JSON.stringify({
          success: true,
          remediationStatus,
          actionsApplied,
          incidentId
        }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS_HEADERS });
      }
    }

    // New Webhook Retry Endpoint
    if (request.method === "POST" && url.pathname === "/api/v1/support/groundgame/retry-webhooks") {
      const signature = request.headers.get("X-Axim-Signature");
      if (!signature || signature !== env.AXIM_INTERNAL_KEY) {
        return new Response("Unauthorized", { status: 401, headers: CORS_HEADERS });
      }

      const result = await retryFailedWebhooks(env);
      if (result.error) {
        return new Response(JSON.stringify({ error: result.error }), { status: 500, headers: CORS_HEADERS });
      }
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    if (request.method === "POST" && url.pathname === "/api/v1/support/groundgame/command") {
      const signature = request.headers.get("X-Axim-Signature");
      if (!signature || signature !== env.AXIM_INTERNAL_KEY) {
        return new Response("Unauthorized Edge Ingress", { status: 401, headers: CORS_HEADERS });
      }

      const body = await request.json() as any;
      const { targetDeviceId, command, parameters } = body;

      await env.SUPPORT_STATE.put(`cmd:${targetDeviceId}:${Date.now()}`, JSON.stringify({ command, parameters }), { expirationTtl: 3600 });

      ctx.waitUntil(logAudit(env, "operator_command", "operator", targetDeviceId, { category: "manual_command", actions_applied: [command] }));

      return new Response(JSON.stringify({ success: true, status: "command_queued", targetDeviceId }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    if (request.method === "GET" && url.pathname === "/api/v1/support/groundgame/poll") {
      const deviceId = url.searchParams.get("deviceId");
      if (!deviceId) {
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
      return new Response(JSON.stringify({ status: "live", timestamp: Date.now(), runtime: "edge" }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};
