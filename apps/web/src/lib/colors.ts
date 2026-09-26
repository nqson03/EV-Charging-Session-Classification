/**
 * Categorical slots in validated order. Colour follows the entity, never its rank:
 * each stop reason keeps its slot whatever the date range does to the ranking.
 */
export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);

export const KPI_COLORS = {
  failed: SERIES[0]!,
  evcs: SERIES[1]!,
  nonEvcs: SERIES[2]!,
} as const;

export const GENERATION_COLORS = { new: SERIES[0]!, old: SERIES[1]!, unknown: "var(--ink-3)" } as const;

const REASON_SLOTS: Record<string, number> = {
  EVDisconnected: 0,
  Not_Start_Charging: 1,
  TimeoutV2G: 2,
  Other: 3,
  REASON_REBOOT: 4,
  PowerModule: 5,
  SeccCommunicationLost: 6,
};

/**
 * Colours for a set of stop reasons shown together. Known reasons keep their reserved
 * slot; any other reason takes the first slot not used by that set.
 */
export function reasonColors(labels: readonly string[]): Map<string, string> {
  const used = new Set<number>();
  const out = new Map<string, string>();
  for (const l of labels) {
    const s = REASON_SLOTS[l];
    if (s !== undefined && !used.has(s)) {
      used.add(s);
      out.set(l, SERIES[s]!);
    }
  }
  for (const l of labels) {
    if (out.has(l)) continue;
    const free = [7, 6, 5, 4, 3, 2, 1, 0].find((i) => !used.has(i)) ?? 7;
    used.add(free);
    out.set(l, SERIES[free]!);
  }
  return out;
}
