import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";

// Baseline browser hardening for every response. The CSP only sets the directives that can't break the app
// (framing, <base>, plugins, form targets); a script-src policy would need per-request nonces.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // frame-ancestors 'self' matches what BotID sets on its own path, so the two never conflict.
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self' https://accounts.google.com" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// BotID: proxies its challenge script through this site (see src/instrumentation-client.ts and src/lib/guard.ts).
export default withBotId(nextConfig);
