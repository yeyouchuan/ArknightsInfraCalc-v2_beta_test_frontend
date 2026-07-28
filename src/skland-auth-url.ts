const SKLAND_UNIVERSAL_LINK = "https://bbs.hycdn.cn/u-link/download.html";
const SUPPORTED_SCAN_PROTOCOLS = new Set(["hypergryph:", "https:"]);

export function buildSklandMobileAuthUrl(scanUrl: string): string | null {
  let target: URL;
  try {
    target = new URL(scanUrl.trim());
  } catch {
    return null;
  }
  if (!SUPPORTED_SCAN_PROTOCOLS.has(target.protocol)) return null;

  const universalLink = new URL(SKLAND_UNIVERSAL_LINK);
  universalLink.searchParams.set("schema", target.toString());
  return universalLink.toString();
}
