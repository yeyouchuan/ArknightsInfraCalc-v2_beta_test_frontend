import type { NextConfig } from "next";

import buildTracingPolicy from "./build-tracing-policy.json";
import { isSklandFeatureEnabled } from "./src/deployment";

const outputFileTracingExcludes = [
  ...buildTracingPolicy.excludedDirectories.map((directory) => `./${directory}/**/*`),
  ...buildTracingPolicy.excludedFiles.map((file) => `./${file}`),
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/images/operator-portraits/:asset",
        has: [{ type: "query", key: "v", value: "\\d+-[0-9a-f]{12}" }],
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  env: {
    APP_CLIENT_SKLAND_ENABLED: isSklandFeatureEnabled() ? "1" : "0",
  },
  outputFileTracingExcludes: {
    "/*": outputFileTracingExcludes,
  },
  experimental: {
    cpus: 4,
  },
  typedRoutes: false,
};

export default nextConfig;
