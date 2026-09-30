import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";

const nextConfig: NextConfig = {
  /* config options here */
};

// BotID: proxies its challenge script through this site (see src/instrumentation-client.ts and src/lib/guard.ts).
export default withBotId(nextConfig);
