// next.config.ts injects this as a compile-time literal so production minification
// can remove the entire client-side Skland branch instead of merely hiding it.
export const CLIENT_SKLAND_ENABLED = process.env.APP_CLIENT_SKLAND_ENABLED !== "0";
