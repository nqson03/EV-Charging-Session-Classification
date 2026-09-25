/** The four output labels. Wording is fixed by the business spec (section 3). */
export const Category = {
  Success: "Success",
  EvcsFault: "EVCS Fault",
  NonEvcsFault: "Non-EVCS Fault",
  Unclassified: "Unclassified - needs rule update",
} as const;
export type Category = (typeof Category)[keyof typeof Category];

/** Categories a mapping rule may assign. Success is only ever reached through Step 1. */
export type RuleCategory = typeof Category.EvcsFault | typeof Category.NonEvcsFault;

export interface StopReasonRule {
  /** Official error code, e.g. "SR0004". Null for legacy values that never had one. */
  code: string | null;
  /** Canonical name used as the statistics label. */
  name: string;
  /** Other spellings seen in source systems. Matched case-insensitively, like `name`. */
  aliases: string[];
  category: RuleCategory;
}

export interface Classification {
  category: Category;
  /** Statistics label: the stop reason used in Top 3 / trend / breakdowns. */
  label: string;
  /** Error code of the matched rule, when there is one. */
  code: string | null;
  /** Which step of the 3-step procedure decided the result. */
  step: 1 | 2 | 3;
}

/**
 * One row of pre-aggregated data. This is what leaves the browser: counts grouped by
 * raw, *unclassified* dimensions, so the server can re-apply the current rule set to
 * history at query time.
 */
export interface AggregateRow {
  /** Report date, YYYY-MM-DD, from thoi_gian_ket_thuc (local time as recorded). */
  date: string;
  station: string;
  firmware: string;
  /** li_do_dung_sac, trimmed. Null when empty. */
  reason: string | null;
  /** True when ma_giao_dich_tren_emsp is empty. */
  emspEmpty: boolean;
  count: number;
}
