# AXiM-Ground-Game-Support-Agent-Architecture-8215

The dashboard and its edge API deploy together as the
`groundgame-support-edge` Cloudflare Worker. The Worker serves the Vite build
and uses the existing `GROUND_GAME_SYNC_LOCKS` KV namespace for command,
rate-limit, and webhook retry state.

## Deployment

```sh
npm install
npm run build
npx wrangler deploy --config groundgame-support-edge/wrangler.jsonc
```

Before enabling incident persistence or webhook delivery, configure these
production Worker secrets interactively:

```sh
npx wrangler secret put AXIM_INTERNAL_KEY --config groundgame-support-edge/wrangler.jsonc
npx wrangler secret put SUPABASE_URL --config groundgame-support-edge/wrangler.jsonc
npx wrangler secret put SUPABASE_SERVICE_KEY --config groundgame-support-edge/wrangler.jsonc
npx wrangler secret put CENTRAL_SUPPORT_WEBHOOK_URL --config groundgame-support-edge/wrangler.jsonc
```

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are public browser
configuration values. Provide them at build time only after Supabase row-level
security policies allow the dashboard's required reads. Never set
`VITE_AXIM_INTERNAL_KEY`: Vite embeds values in the public JavaScript bundle.
