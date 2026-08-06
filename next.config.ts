import type { NextConfig } from "next";

import { isSklandFeatureEnabled } from "./src/deployment";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  env: {
    APP_CLIENT_SKLAND_ENABLED: isSklandFeatureEnabled() ? "1" : "0",
  },
  typedRoutes: false,
};

export default nextConfig;
