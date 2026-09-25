import { normalizeKey, type RuleLookup } from "./rules";
import { Category, type Classification } from "./types";

export const SUCCESS_REASON = "Day_Pin";
export const LABEL_CUSTOMER_OWES = "Stopped - Customer Owes Payment";
export const LABEL_NOT_STARTED = "Not_Start_Charging";

const isBlank = (v: string | null | undefined): v is null | undefined | "" =>
  v == null || v.trim() === "";

/**
 * The 3-step procedure from section 3 of the business spec.
 *
 * @param reason  li_do_dung_sac
 * @param emspTxn ma_giao_dich_tren_emsp — only emptiness matters
 */
export function classify(
  reason: string | null | undefined,
  emspTxn: string | null | undefined | boolean,
  lookup: RuleLookup,
): Classification {
  const reasonBlank = isBlank(reason);
  const emspEmpty = typeof emspTxn === "boolean" ? emspTxn : isBlank(emspTxn);

  // Step 1 — li_do_dung_sac = "Day_Pin" (case-insensitive) → Success.
  if (!reasonBlank && normalizeKey(reason) === normalizeKey(SUCCESS_REASON)) {
    return { category: Category.Success, label: SUCCESS_REASON, code: null, step: 1 };
  }

  // Step 2 — empty eMSP transaction → Non-EVCS Fault.
  if (emspEmpty) {
    if (reasonBlank) {
      return { category: Category.NonEvcsFault, label: LABEL_CUSTOMER_OWES, code: null, step: 2 };
    }
    // Statistics label is the stop reason itself; use the canonical name when we know it
    // so that aliases (e.g. EmergencyStop / EMERGENCY STOP) count as one reason.
    const rule = lookup.get(normalizeKey(reason));
    return {
      category: Category.NonEvcsFault,
      label: rule?.name ?? reason.trim(),
      code: rule?.code ?? null,
      step: 2,
    };
  }

  // Step 3 — second look at li_do_dung_sac.
  if (reasonBlank) {
    return { category: Category.EvcsFault, label: LABEL_NOT_STARTED, code: null, step: 3 };
  }
  const rule = lookup.get(normalizeKey(reason));
  if (!rule) {
    // Never guess: surface it so the rule table can be updated.
    return { category: Category.Unclassified, label: reason.trim(), code: null, step: 3 };
  }
  return { category: rule.category, label: rule.name, code: rule.code, step: 3 };
}
