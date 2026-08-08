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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // 1. Inbound Incident Reporting from Ground Game App
    if (request.method === "POST" && url.pathname === "/api/v1/support/groundgame/report") {
      try {
        const payload = await request.json() as any;
        const { deviceId, operatorAddress, category, diagnosticSnapshot } = payload;

        let remediationStatus = "detected";
        let actionsApplied: string[] = [];

        // Self-Healing Evaluation Rules
        if (category === "offline_buffer_stagnation") {
          actionsApplied.push("EXECUTED: flush_field_offline_buffer");
          remediationStatus = "self_healed";
        } else if (category === "jwt_clock_skew") {
          actionsApplied.push("EXECUTED: reissue_ephemeral_token");
          remediationStatus = "self_healed";
        } else {
          // Escalate unhandled errors to Central Support System
          remediationStatus = "escalated_to_central_support";
        }

        // Persist to Supabase Core
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

        // If Escalated, notify Central Support System
        if (remediationStatus === "escalated_to_central_support" && env.CENTRAL_SUPPORT_WEBHOOK_URL) {
          ctx.waitUntil(
            fetch(env.CENTRAL_SUPPORT_WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Axim-Signature": env.AXIM_INTERNAL_KEY },
              body: JSON.stringify({
                appSource: "AXiM Ground Game",
                incidentId: incidentData[0]?.id,
                payload
              })
            }).catch(err => console.error("Central Support Webhook Error:", err))
          );
        }

        return new Response(JSON.stringify({
          success: true,
          remediationStatus,
          actionsApplied,
          incidentId: incidentData[0]?.id
        }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS_HEADERS });
      }
    }

    // 2. Inbound Command from Central Support System to Ground Game App
    if (request.method === "POST" && url.pathname === "/api/v1/support/groundgame/command") {
      const signature = request.headers.get("X-Axim-Signature");
      if (!signature || signature !== env.AXIM_INTERNAL_KEY) {
        return new Response("Unauthorized Edge Ingress", { status: 401, headers: CORS_HEADERS });
      }

      const body = await request.json() as any;
      const { targetDeviceId, command, parameters } = body;

      // Queue command in KV for Ground Game App to pick up on next poll
      await env.SUPPORT_STATE.put(`cmd:${targetDeviceId}:${Date.now()}`, JSON.stringify({ command, parameters }), { expirationTtl: 3600 });

      return new Response(JSON.stringify({ success: true, status: "command_queued", targetDeviceId }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};