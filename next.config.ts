import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";

// Build info shown in Settings → About: app version (latest git tag), build number (UTC build time) and commit.
const git = (cmd: string) => {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
};

/**
 * Version from the newest release tag (v0.1.2 → "0.1.2"); commits made since then are appended ("0.1.2+3").
 * Falls back to package.json where tags aren't cloned (e.g. Vercel), which `npm run release` keeps in step.
 */
function appVersion() {
  const m = git(`git describe --tags --long --match "v[0-9]*"`).match(/^v\.?(.+)-(\d+)-g[0-9a-f]+$/);
  if (m) return m[2] === "0" ? m[1] : `${m[1]}+${m[2]}`;
  return JSON.parse(readFileSync("./package.json", "utf8")).version as string;
}

const builtAt = new Date();
const buildInfo = {
  NEXT_PUBLIC_APP_VERSION: appVersion(),
  NEXT_PUBLIC_BUILD_NUMBER: builtAt.toISOString().slice(2, 16).replace(/[-:]/g, "").replace("T", "."),
  NEXT_PUBLIC_BUILD_TIME: builtAt.toISOString(),
  NEXT_PUBLIC_COMMIT: (process.env.VERCEL_GIT_COMMIT_SHA || git("git rev-parse HEAD")).slice(0, 7),
};

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
  env: buildInfo,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// BotID: proxies its challenge script through this site (see src/instrumentation-client.ts and src/lib/guard.ts).
export default withBotId(nextConfig);
