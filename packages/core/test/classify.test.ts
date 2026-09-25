import { describe, expect, it } from "vitest";
import {
  buildLookup, Category, classify, DEFAULT_RULES, LABEL_CUSTOMER_OWES, LABEL_NOT_STARTED,
} from "../src";

const lookup = buildLookup(DEFAULT_RULES);
const TXN = "6ab2b395e53efc845c889255";

describe("classify — 3-step procedure", () => {
  it("Step 1: Day_Pin is Success regardless of case or eMSP", () => {
    expect(classify("Day_Pin", TXN, lookup).category).toBe(Category.Success);
    expect(classify(" day_pin ", null, lookup)).toMatchObject({ category: Category.Success, step: 1 });
    expect(classify("DAY_PIN", "", lookup).category).toBe(Category.Success);
  });

  it("Step 2: empty eMSP → Non-EVCS, label is the reason", () => {
    expect(classify("EVDisconnected", null, lookup)).toMatchObject({
      category: Category.NonEvcsFault, label: "EVDisconnected", step: 2,
    });
    // Even an unknown reason is Non-EVCS at step 2 — the mapping is never consulted.
    expect(classify("DoorAccess", "  ", lookup)).toMatchObject({ category: Category.NonEvcsFault, label: "DoorAccess" });
  });

  it("Step 2: both empty → Stopped - Customer Owes Payment", () => {
    expect(classify(null, null, lookup)).toMatchObject({ category: Category.NonEvcsFault, label: LABEL_CUSTOMER_OWES });
    expect(classify("   ", undefined, lookup).label).toBe(LABEL_CUSTOMER_OWES);
  });

  it("Step 3: eMSP present, reason empty → EVCS Not_Start_Charging", () => {
    expect(classify(null, TXN, lookup)).toMatchObject({ category: Category.EvcsFault, label: LABEL_NOT_STARTED, step: 3 });
  });

  it("Step 3: mapping, including aliases, case-insensitive", () => {
    expect(classify("EMERGENCY STOP", TXN, lookup)).toMatchObject({ category: Category.NonEvcsFault, code: "SR0003" });
    expect(classify("emergencystop", TXN, lookup)).toMatchObject({ label: "EMERGENCY STOP", code: "SR0003" });
    expect(classify("SeccCommunicationLoss", TXN, lookup)).toMatchObject({
      category: Category.EvcsFault, label: "SeccCommunicationLost", code: "SR0014",
    });
    expect(classify("ContactorFault", TXN, lookup).label).toBe("DCContactorFault");
    expect(classify("DCMeter", TXN, lookup).label).toBe("MeterFault");
    expect(classify("REASON_REBOOT", TXN, lookup)).toMatchObject({ category: Category.EvcsFault, code: null });
  });

  it("Step 3: unknown reason is Unclassified, never guessed", () => {
    expect(classify("DoorAccess", TXN, lookup)).toMatchObject({ category: Category.Unclassified, label: "DoorAccess" });
  });

  it("every rule in the spec table classifies to its own category", () => {
    for (const r of DEFAULT_RULES) {
      for (const name of [r.name, ...r.aliases]) {
        expect(classify(name, TXN, lookup).category, name).toBe(r.category);
      }
    }
    expect(DEFAULT_RULES).toHaveLength(28);
  });

  it("rejects a rule table that defines the same name twice", () => {
    expect(() =>
      buildLookup([...DEFAULT_RULES, { code: "X", name: "evdisconnected", aliases: [], category: Category.NonEvcsFault }]),
    ).toThrow(/defined by both/);
  });
});
