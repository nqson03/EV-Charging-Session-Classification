export type ChargerModel = "Core" | "Kern" | "AC" | "Other";
export type FirmwareGeneration = "old" | "new";

export interface FirmwareInfo {
  raw: string;
  /** Leading 6-digit build stamp (yymmdd), e.g. "260421". Null if absent. */
  build: string | null;
  /** Build stamp as an ISO date, e.g. "2026-04-21". */
  buildDate: string | null;
  model: ChargerModel;
  /** Rated power in kW when the string carries one (CCDC120Core → 120). */
  ratingKw: number | null;
  /** "_L" suffix variant. */
  variant: string | null;
}

/**
 * Source strings are not consistent (`251024CCDC30Kern_L` vs `251024CCDCKern20_L`),
 * so every part is found by pattern rather than by position.
 */
export function parseFirmware(raw: string): FirmwareInfo {
  const s = raw.trim();
  const buildMatch = /^(\d{2})(\d{2})(\d{2})/.exec(s);
  const build = buildMatch ? buildMatch[0] : null;
  const buildDate = buildMatch ? `20${buildMatch[1]}-${buildMatch[2]}-${buildMatch[3]}` : null;
  const rest = build ? s.slice(6) : s;

  let model: ChargerModel = "Other";
  if (/core/i.test(rest)) model = "Core";
  else if (/kern/i.test(rest)) model = "Kern";
  else if (/AC/.test(rest.replace(/^CCDC/i, ""))) model = "AC";

  const rating = /(\d+)/.exec(rest);
  const variant = /_([A-Za-z0-9]+)$/.exec(rest);

  return {
    raw: s,
    build,
    buildDate,
    model,
    ratingKw: rating ? Number(rating[1]) : null,
    variant: variant ? variant[1]! : null,
  };
}

/**
 * Old vs new firmware line. The cut-off is configuration, not code: builds stamped on or
 * after `newFrom` (yymmdd) count as "new".
 */
export function firmwareGeneration(info: FirmwareInfo, newFrom: string): FirmwareGeneration | null {
  if (!info.build) return null;
  return info.build >= newFrom ? "new" : "old";
}
