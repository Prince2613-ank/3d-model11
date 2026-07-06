// Best-effort detection of mobile / low-power devices so we can pick lighter
// model variants and cheaper render settings without touching desktop quality.

interface NavigatorConnection {
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
  saveData?: boolean;
}

interface ExtendedNavigator extends Navigator {
  deviceMemory?: number;
  connection?: NavigatorConnection;
}

let cached: boolean | null = null;

export function isLowPowerDevice(): boolean {
  if (cached !== null) return cached;

  const nav = navigator as ExtendedNavigator;

  const isSmallViewport = window.matchMedia("(max-width: 820px)").matches;
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const lowMemory = typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4;
  const lowCores = typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4;
  const slowConnection = Boolean(
    nav.connection?.saveData ||
    (nav.connection?.effectiveType && ["slow-2g", "2g", "3g"].includes(nav.connection.effectiveType))
  );

  cached = (isSmallViewport && isCoarsePointer) || lowMemory || lowCores || slowConnection;
  return cached;
}
