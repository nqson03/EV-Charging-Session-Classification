import {
  buildLookup, classify, DEFAULT_RULES, firmwareGeneration, parseFirmware,
  type FirmwareDim, type Generation, type RuleDto, type StopReasonRule,
} from "@evsa/core";

export const now = () => new Date().toISOString();

// ---------------------------------------------------------------- settings / versioning

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export const bumpVersionStmt = (db: D1Database) =>
  db.prepare("UPDATE settings SET value = CAST(value AS INTEGER) + 1 WHERE key = 'data_version'");

// ---------------------------------------------------------------- rules

interface RuleRow {
  name: string; code: string | null; aliases: string; category: RuleDto["category"];
  source: RuleDto["source"]; updated_at: string; updated_by: string;
}

export const toRuleDto = (r: RuleRow): RuleDto => ({
  name: r.name, code: r.code, aliases: JSON.parse(r.aliases) as string[], category: r.category,
  source: r.source, updatedAt: r.updated_at, updatedBy: r.updated_by,
});

export const toStopReasonRule = (r: RuleDto): StopReasonRule => ({
  name: r.name, code: r.code, aliases: r.aliases, category: r.category,
});

export const insertRuleStmt = (db: D1Database, r: StopReasonRule, source: "spec" | "custom", user: string) =>
  db.prepare(
    `INSERT INTO rules (name, code, aliases, category, source, updated_at, updated_by)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(name) DO UPDATE SET code = excluded.code, aliases = excluded.aliases,
       category = excluded.category, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).bind(r.name, r.code, JSON.stringify(r.aliases), r.category, source, now(), user);

export const seedSpecStmts = (db: D1Database) =>
  DEFAULT_RULES.map((r) => insertRuleStmt(db, r, "spec", "spec v2.0"));

/** Current rule set. The table is seeded from the spec (section 4) on first use. */
export async function loadRules(db: D1Database): Promise<RuleDto[]> {
  let { results } = await db.prepare("SELECT * FROM rules ORDER BY code IS NULL, code, name").all<RuleRow>();
  if (results.length === 0) {
    await db.batch(seedSpecStmts(db));
    ({ results } = await db.prepare("SELECT * FROM rules ORDER BY code IS NULL, code, name").all<RuleRow>());
  }
  return results.map(toRuleDto);
}

interface ReasonRow {
  id: number; reason: string; emsp_empty: number; category: string; label: string; code: string | null; step: number;
}

/**
 * Re-applies the rule set to every distinct (reason, eMSP-empty) pair ever seen.
 * Returns the UPDATE statements for rows whose result changed.
 */
export async function reclassifyStmts(db: D1Database, rules: StopReasonRule[]): Promise<D1PreparedStatement[]> {
  const lookup = buildLookup(rules);
  const { results } = await db.prepare("SELECT id, reason, emsp_empty, category, label, code, step FROM reason_dim").all<ReasonRow>();
  const out: D1PreparedStatement[] = [];
  for (const r of results) {
    const c = classify(r.reason || null, r.emsp_empty === 1, lookup);
    if (c.category !== r.category || c.label !== r.label || c.code !== r.code || c.step !== r.step) {
      out.push(
        db.prepare("UPDATE reason_dim SET category = ?1, label = ?2, code = ?3, step = ?4 WHERE id = ?5")
          .bind(c.category, c.label, c.code, c.step, r.id),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------- firmware

export interface FirmwareRow {
  firmware: string; build: string | null; generation: Generation; model: FirmwareDim["model"];
  rating_kw: number | null; manual: number;
}

export const toFirmwareDto = (r: FirmwareRow): FirmwareDim => ({
  firmware: r.firmware, build: r.build, generation: r.generation, model: r.model,
  ratingKw: r.rating_kw, manual: r.manual === 1,
});

export function deriveFirmware(firmware: string, newFrom: string) {
  const info = parseFirmware(firmware);
  return {
    build: info.build,
    generation: (firmwareGeneration(info, newFrom) ?? "unknown") as Generation,
    model: info.model,
    ratingKw: info.ratingKw,
  };
}

export async function refreshFirmwareStmts(db: D1Database, newFrom: string): Promise<D1PreparedStatement[]> {
  const { results } = await db.prepare("SELECT * FROM firmware_dim WHERE manual = 0").all<FirmwareRow>();
  const out: D1PreparedStatement[] = [];
  for (const r of results) {
    const d = deriveFirmware(r.firmware, newFrom);
    if (d.generation !== r.generation || d.model !== r.model || d.build !== r.build || d.ratingKw !== r.rating_kw) {
      out.push(
        db.prepare("UPDATE firmware_dim SET build = ?1, generation = ?2, model = ?3, rating_kw = ?4 WHERE firmware = ?5")
          .bind(d.build, d.generation, d.model, d.ratingKw, r.firmware),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------- periods

/** SQL expression turning fact.date into the period key. Weeks start on Monday. */
export function periodExpr(period: "day" | "week" | "month", col = "f.date"): string {
  switch (period) {
    case "day":
      return col;
    case "week":
      return `date(${col}, '-' || ((CAST(strftime('%w', ${col}) AS INTEGER) + 6) % 7) || ' days')`;
    case "month":
      return `substr(${col}, 1, 7)`;
  }
}

/** D1 batches are atomic; keep each one to a sane size. */
export async function runBatches(db: D1Database, stmts: D1PreparedStatement[], size = 100) {
  for (let i = 0; i < stmts.length; i += size) await db.batch(stmts.slice(i, i + size));
}
