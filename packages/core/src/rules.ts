import { Category, type StopReasonRule } from "./types";

const EVCS = Category.EvcsFault;
const NON = Category.NonEvcsFault;

/** Section 4 of the business spec (v2.0 FINAL, 12/09/2026). */
export const DEFAULT_RULES: StopReasonRule[] = [
  { code: "SR0002", name: "DeAuthorized", aliases: [], category: NON },
  { code: "SR0003", name: "EMERGENCY STOP", aliases: ["EmergencyStop"], category: NON },
  { code: "SR0004", name: "EVDisconnected", aliases: [], category: EVCS },
  { code: "SR0005", name: "HardReset", aliases: [], category: NON },
  { code: "SR0006", name: "Local", aliases: [], category: NON },
  { code: "SR0007", name: "Other", aliases: [], category: EVCS },
  { code: "SR0008", name: "PowerLoss", aliases: [], category: NON },
  { code: "SR0010", name: "Remote", aliases: [], category: NON },
  { code: "SR0011", name: "SoftReset", aliases: [], category: NON },
  { code: "SR0012", name: "UnlockCommand", aliases: [], category: EVCS },
  { code: "SR0014", name: "SeccCommunicationLost", aliases: ["SeccCommunicationLoss"], category: EVCS },
  { code: "SR0018", name: "HighTemperature", aliases: [], category: EVCS },
  { code: "SR0019", name: "DoorOpen", aliases: [], category: EVCS },
  { code: "SR0020", name: "LightningProtection", aliases: [], category: EVCS },
  { code: "SR0029", name: "PEFault", aliases: [], category: EVCS },
  { code: "SR0033", name: "ChargePoint", aliases: [], category: EVCS },
  { code: "SR0037", name: "PowerModule", aliases: [], category: EVCS },
  { code: "SR0039", name: "MeterFault", aliases: ["DCMeter"], category: EVCS },
  { code: "SR0040", name: "DCContactorFault", aliases: ["ContactorFault"], category: EVCS },
  { code: "SR0045", name: "InsulationFault", aliases: [], category: EVCS },
  { code: "SR0059", name: "Reserved", aliases: [], category: NON },
  { code: "SR0061", name: "EVBattTempInhibit", aliases: [], category: EVCS },
  { code: "SR0062", name: "ConnectorTempFault", aliases: [], category: EVCS },
  { code: "SR0065", name: "EVLockFault", aliases: [], category: EVCS },
  { code: "SR0066", name: "TimeoutV2G", aliases: [], category: EVCS },
  // Legacy values without an official error code.
  { code: null, name: "REASON_REBOOT", aliases: [], category: EVCS },
  { code: null, name: "Loi_sac", aliases: [], category: EVCS },
  { code: null, name: "GroundFault", aliases: [], category: EVCS },
];

export type RuleLookup = ReadonlyMap<string, StopReasonRule>;

export const normalizeKey = (s: string) => s.trim().toLowerCase();

/** Builds a case-insensitive lookup over names and aliases. Throws on conflicting duplicates. */
export function buildLookup(rules: readonly StopReasonRule[]): RuleLookup {
  const map = new Map<string, StopReasonRule>();
  for (const rule of rules) {
    for (const key of [rule.name, ...rule.aliases].map(normalizeKey)) {
      const existing = map.get(key);
      if (existing && existing !== rule) {
        throw new Error(`Stop reason "${key}" is defined by both ${existing.name} and ${rule.name}`);
      }
      map.set(key, rule);
    }
  }
  return map;
}
