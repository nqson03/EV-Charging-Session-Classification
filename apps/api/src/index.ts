import { Hono, type Context } from "hono";
import {
  buildLookup, Category, classify, DEFAULT_RULES, INGEST_CHUNK,
  type IngestBeginRequest, type IngestBeginResponse, type IngestRowsRequest, type Meta, type Period,
  type ReasonDimDto, type ReportResponse, type ReportRow, type RuleChangeDto, type RuleDto, type RulesResponse,
  type StationRow, type StationsResponse, type StopReasonRule, type Upload,
} from "@evsa/core";
import { identifyUser } from "./auth";
import {
  bumpVersionStmt, deriveFirmware, getSetting, insertRuleStmt, loadRules, now, periodExpr,
  reclassifyStmts, refreshFirmwareStmts, runBatches, seedSpecStmts, toFirmwareDto, toStopReasonRule,
  type FirmwareRow,
} from "./db";
import type { AppEnv } from "./env";

const app = new Hono<AppEnv>().basePath("/api");

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Internal error" }, 500);
});

class HttpError extends Error {
  constructor(public status: 400 | 404 | 409 | 422, message: string) {
    super(message);
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_STATION_RANGE_DAYS = 92;
const CATEGORIES_FOR_RULES = [Category.EvcsFault, Category.NonEvcsFault] as const;

function isoDate(v: unknown, name: string): string {
  if (typeof v !== "string" || !ISO_DATE.test(v) || Number.isNaN(Date.parse(v))) {
    throw new HttpError(400, `${name} must be a YYYY-MM-DD date`);
  }
  return v;
}

function range(c: Context<AppEnv>) {
  const from = isoDate(c.req.query("from"), "from");
  const to = isoDate(c.req.query("to"), "to");
  if (from > to) throw new HttpError(400, "from must be on or before to");
  return { from, to };
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;

async function body<T>(c: Context<AppEnv>): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
}

/**
 * Read-through cache keyed on data_version, which every write bumps. Keeps repeated
 * dashboard loads off D1's daily read quota.
 */
async function cached<T>(c: Context<AppEnv>, key: string, compute: () => Promise<T>): Promise<T> {
  const kv = c.env.CACHE;
  if (!kv) return compute();
  const version = await getSetting(c.env.DB, "data_version");
  const k = `v${version}:${key}`;
  const hit = await kv.get<T>(k, "json");
  if (hit) return hit;
  const value = await compute();
  c.executionCtx.waitUntil(kv.put(k, JSON.stringify(value), { expirationTtl: 60 * 60 * 24 * 7 }));
  return value;
}

app.get("/health", (c) => c.json({ ok: true }));
app.use("*", identifyUser);

// ------------------------------------------------------------------------ meta

app.get("/meta", async (c) => {
  const db = c.env.DB;
  const [version, newFrom, uploads] = await Promise.all([
    getSetting(db, "data_version"),
    getSetting(db, "new_firmware_from"),
    db.prepare(
      `SELECT date, file_name AS fileName, total_rows AS totalRows, status, uploaded_at AS uploadedAt,
              uploaded_by AS uploadedBy FROM uploads ORDER BY date DESC`,
    ).all<Upload>(),
  ]);
  const meta: Meta = {
    user: c.get("user"),
    dataVersion: Number(version ?? 1),
    newFirmwareFrom: newFrom ?? "260421",
    uploads: uploads.results,
  };
  return c.json(meta);
});

// ------------------------------------------------------------------------ reports

app.get("/report", async (c) => {
  const { from, to } = range(c);
  const period = (c.req.query("period") ?? "day") as Period;
  if (!["day", "week", "month"].includes(period)) throw new HttpError(400, "period must be day, week or month");

  const result = await cached(c, `report:${from}:${to}:${period}`, async () => {
    const db = c.env.DB;
    const [rows, dates, firmware] = await db.batch([
      db.prepare(
        `SELECT ${periodExpr(period)} AS p, f.firmware AS fw, r.category AS cat, r.label, r.code, SUM(f.count) AS n
           FROM fact_segment f
           JOIN reason_dim r ON r.id = f.reason_id
           JOIN uploads u ON u.date = f.date AND u.status = 'complete'
          WHERE f.date BETWEEN ?1 AND ?2
          GROUP BY p, fw, cat, r.label, r.code`,
      ).bind(from, to),
      db.prepare("SELECT date FROM uploads WHERE status = 'complete' AND date BETWEEN ?1 AND ?2 ORDER BY date").bind(from, to),
      db.prepare(
        `SELECT * FROM firmware_dim WHERE firmware IN
           (SELECT DISTINCT firmware FROM fact_segment WHERE date BETWEEN ?1 AND ?2) ORDER BY firmware`,
      ).bind(from, to),
    ]);
    const res: ReportResponse = {
      from, to, period,
      dates: (dates!.results as { date: string }[]).map((d) => d.date),
      rows: rows!.results as unknown as ReportRow[],
      firmware: (firmware!.results as unknown as FirmwareRow[]).map(toFirmwareDto),
    };
    return res;
  });
  return c.json(result);
});

app.get("/stations", async (c) => {
  const { from, to } = range(c);
  if (daysBetween(from, to) > MAX_STATION_RANGE_DAYS) {
    throw new HttpError(400, `Station view is limited to ${MAX_STATION_RANGE_DAYS} days per query`);
  }
  const result = await cached(c, `stations:${from}:${to}`, async () => {
    const { results } = await c.env.DB.prepare(
      `SELECT f.station, r.category AS cat, r.label, SUM(f.count) AS n
         FROM fact_station f
         JOIN reason_dim r ON r.id = f.reason_id
         JOIN uploads u ON u.date = f.date AND u.status = 'complete'
        WHERE f.date BETWEEN ?1 AND ?2
        GROUP BY f.station, cat, r.label`,
    ).bind(from, to).all<StationRow>();
    const res: StationsResponse = { from, to, rows: results };
    return res;
  });
  return c.json(result);
});

// ------------------------------------------------------------------------ ingest

app.post("/ingest/begin", async (c) => {
  const req = await body<IngestBeginRequest>(c);
  const date = isoDate(req.date, "date");
  if (typeof req.fileName !== "string" || !req.fileName) throw new HttpError(400, "fileName is required");
  if (!Number.isInteger(req.totalRows) || req.totalRows <= 0) throw new HttpError(400, "totalRows must be a positive integer");
  if (!Array.isArray(req.reasons) || req.reasons.length === 0 || req.reasons.length > 5000) {
    throw new HttpError(400, "reasons must be a non-empty array");
  }
  if (!Array.isArray(req.firmwares) || req.firmwares.length > 5000) throw new HttpError(400, "firmwares must be an array");

  const db = c.env.DB;
  const user = c.get("user");
  const [rules, newFrom, existing] = await Promise.all([
    loadRules(db),
    getSetting(db, "new_firmware_from"),
    db.prepare("SELECT date FROM uploads WHERE date = ?").bind(date).first(),
  ]);
  const lookup = buildLookup(rules.map(toStopReasonRule));

  const reasonStmts = req.reasons.map(({ reason, emspEmpty }) => {
    const key = typeof reason === "string" ? reason.trim() : "";
    const cls = classify(key || null, Boolean(emspEmpty), lookup);
    return db.prepare(
      `INSERT INTO reason_dim (reason, emsp_empty, category, label, code, step, first_seen, last_seen)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
       ON CONFLICT(reason, emsp_empty) DO UPDATE SET
         first_seen = min(first_seen, excluded.first_seen), last_seen = max(last_seen, excluded.last_seen)
       RETURNING id`,
    ).bind(key, emspEmpty ? 1 : 0, cls.category, cls.label, cls.code, cls.step, date);
  });
  const fwStmts = req.firmwares.map((fw) => {
    const d = deriveFirmware(String(fw), newFrom ?? "260421");
    return db.prepare(
      `INSERT INTO firmware_dim (firmware, build, generation, model, rating_kw) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(firmware) DO NOTHING`,
    ).bind(String(fw), d.build, d.generation, d.model, d.ratingKw);
  });

  const results = await db.batch([
    ...reasonStmts,
    ...fwStmts,
    db.prepare("DELETE FROM fact_segment WHERE date = ?").bind(date),
    db.prepare("DELETE FROM fact_station WHERE date = ?").bind(date),
    db.prepare(
      `INSERT INTO uploads (date, file_name, total_rows, status, uploaded_at, uploaded_by)
       VALUES (?1, ?2, ?3, 'pending', ?4, ?5)
       ON CONFLICT(date) DO UPDATE SET file_name = excluded.file_name, total_rows = excluded.total_rows,
         status = 'pending', uploaded_at = excluded.uploaded_at, uploaded_by = excluded.uploaded_by`,
    ).bind(date, req.fileName.slice(0, 255), req.totalRows, now(), user),
    bumpVersionStmt(db),
  ]);

  const res: IngestBeginResponse = {
    reasonIds: results.slice(0, reasonStmts.length).map((r) => (r.results[0] as { id: number }).id),
    replaced: existing != null,
  };
  return c.json(res);
});

app.post("/ingest/rows", async (c) => {
  const req = await body<IngestRowsRequest>(c);
  const date = isoDate(req.date, "date");
  if (req.table !== "segment" && req.table !== "station") throw new HttpError(400, "table must be segment or station");
  if (!Array.isArray(req.rows) || req.rows.length === 0 || req.rows.length > INGEST_CHUNK) {
    throw new HttpError(400, `rows must hold 1–${INGEST_CHUNK} tuples`);
  }
  for (const t of req.rows) {
    if (!Array.isArray(t) || typeof t[0] !== "string" || !Number.isInteger(t[1]) || !Number.isInteger(t[2]) || t[2] < 1) {
      throw new HttpError(400, "rows must be [key, reasonId, count] tuples");
    }
  }
  const db = c.env.DB;
  const upload = await db.prepare("SELECT status FROM uploads WHERE date = ?").bind(date).first<{ status: string }>();
  if (upload?.status !== "pending") throw new HttpError(409, "No upload in progress for this date");

  const [table, keyCol] = req.table === "segment" ? ["fact_segment", "firmware"] : ["fact_station", "station"];
  // One bound JSON parameter instead of 4 params per row (D1 caps bound parameters at 100).
  await db.prepare(
    `INSERT INTO ${table} (date, ${keyCol}, reason_id, count)
     SELECT ?1, json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]')
       FROM json_each(?2) WHERE true
     ON CONFLICT DO UPDATE SET count = count + excluded.count`,
  ).bind(date, JSON.stringify(req.rows)).run();
  return c.json({ ok: true });
});

app.post("/ingest/commit", async (c) => {
  const { date: d } = await body<{ date: string }>(c);
  const date = isoDate(d, "date");
  const db = c.env.DB;
  const check = await db.prepare(
    `SELECT u.total_rows AS expected,
            (SELECT COALESCE(SUM(count), 0) FROM fact_segment WHERE date = ?1) AS segment,
            (SELECT COALESCE(SUM(count), 0) FROM fact_station WHERE date = ?1) AS station
       FROM uploads u WHERE u.date = ?1 AND u.status = 'pending'`,
  ).bind(date).first<{ expected: number; segment: number; station: number }>();
  if (!check) throw new HttpError(409, "No upload in progress for this date");
  if (check.segment !== check.expected || check.station !== check.expected) {
    throw new HttpError(422, `Row counts do not reconcile (expected ${check.expected}, got ${check.segment} / ${check.station})`);
  }
  await db.batch([
    db.prepare("UPDATE uploads SET status = 'complete' WHERE date = ?").bind(date),
    bumpVersionStmt(db),
  ]);
  return c.json({ ok: true });
});

app.delete("/uploads/:date", async (c) => {
  const date = isoDate(c.req.param("date"), "date");
  const db = c.env.DB;
  const res = await db.batch([
    db.prepare("DELETE FROM fact_segment WHERE date = ?").bind(date),
    db.prepare("DELETE FROM fact_station WHERE date = ?").bind(date),
    db.prepare("DELETE FROM uploads WHERE date = ?").bind(date),
    bumpVersionStmt(db),
  ]);
  if (res[2]!.meta.changes === 0) throw new HttpError(404, "No upload for this date");
  return c.json({ ok: true });
});

// ------------------------------------------------------------------------ rules

app.get("/rules", async (c) => {
  const db = c.env.DB;
  const rules = await loadRules(db);
  const [observed, changes] = await db.batch([
    db.prepare(
      `SELECT reason, emsp_empty AS emspEmpty, category, label, code, step, first_seen AS firstSeen, last_seen AS lastSeen
         FROM reason_dim ORDER BY category, label`,
    ),
    db.prepare("SELECT at, by, action, name FROM rule_changes ORDER BY id DESC LIMIT 30"),
  ]);
  const res: RulesResponse = {
    rules,
    observed: (observed!.results as (Omit<ReasonDimDto, "emspEmpty"> & { emspEmpty: number })[])
      .map((r) => ({ ...r, emspEmpty: r.emspEmpty === 1 })),
    changes: changes!.results as unknown as RuleChangeDto[],
  };
  return c.json(res);
});

function parseRule(name: string, input: Partial<RuleDto>): StopReasonRule {
  const n = name.trim();
  if (!n || n.length > 100) throw new HttpError(400, "name is required (max 100 characters)");
  if (!CATEGORIES_FOR_RULES.includes(input.category as never)) {
    throw new HttpError(400, `category must be "${Category.EvcsFault}" or "${Category.NonEvcsFault}"`);
  }
  const code = typeof input.code === "string" && input.code.trim() ? input.code.trim().toUpperCase() : null;
  if (code && !/^[A-Z]{2}\d{4}$/.test(code)) throw new HttpError(400, "code must look like SR0019");
  const aliases = Array.isArray(input.aliases)
    ? [...new Set(input.aliases.map((a) => String(a).trim()).filter(Boolean))]
    : [];
  return { name: n, code, aliases, category: input.category as StopReasonRule["category"] };
}

function validateRuleSet(rules: StopReasonRule[]) {
  try {
    buildLookup(rules);
  } catch (e) {
    throw new HttpError(409, (e as Error).message);
  }
}

const auditStmt = (db: D1Database, user: string, action: string, name: string, before: unknown, after: unknown) =>
  db.prepare("INSERT INTO rule_changes (at, by, action, name, before, after) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(now(), user, action, name, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after));

app.put("/rules/:name", async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const name = decodeURIComponent(c.req.param("name"));
  const rule = parseRule(name, await body<Partial<RuleDto>>(c));
  const current = await loadRules(db);
  const before = current.find((r) => r.name === rule.name);
  const next = [...current.filter((r) => r.name !== rule.name).map(toStopReasonRule), rule];
  validateRuleSet(next);

  await db.batch([
    insertRuleStmt(db, rule, before?.source ?? "custom", user),
    auditStmt(db, user, before ? "update" : "create", rule.name, before ?? null, rule),
    ...(await reclassifyStmts(db, next)),
    bumpVersionStmt(db),
  ]);
  return c.json({ ok: true });
});

app.delete("/rules/:name", async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const name = decodeURIComponent(c.req.param("name"));
  const current = await loadRules(db);
  const before = current.find((r) => r.name === name);
  if (!before) throw new HttpError(404, "Rule not found");
  const next = current.filter((r) => r.name !== name).map(toStopReasonRule);
  await db.batch([
    db.prepare("DELETE FROM rules WHERE name = ?").bind(name),
    auditStmt(db, user, "delete", name, before, null),
    ...(await reclassifyStmts(db, next)),
    bumpVersionStmt(db),
  ]);
  return c.json({ ok: true });
});

app.post("/rules/reset", async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  await db.batch([
    db.prepare("DELETE FROM rules"),
    ...seedSpecStmts(db),
    auditStmt(db, user, "reset", "(all rules)", null, null),
    ...(await reclassifyStmts(db, DEFAULT_RULES)),
    bumpVersionStmt(db),
  ]);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------------ firmware

app.get("/firmware", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM firmware_dim ORDER BY firmware").all<FirmwareRow>();
  return c.json({
    newFirmwareFrom: (await getSetting(c.env.DB, "new_firmware_from")) ?? "260421",
    firmware: results.map(toFirmwareDto),
  });
});

app.put("/settings/firmware", async (c) => {
  const { newFirmwareFrom } = await body<{ newFirmwareFrom: string }>(c);
  if (typeof newFirmwareFrom !== "string" || !/^\d{6}$/.test(newFirmwareFrom)) {
    throw new HttpError(400, "newFirmwareFrom must be a yymmdd build stamp, e.g. 260421");
  }
  const db = c.env.DB;
  await db.prepare("UPDATE settings SET value = ? WHERE key = 'new_firmware_from'").bind(newFirmwareFrom).run();
  await runBatches(db, [...(await refreshFirmwareStmts(db, newFirmwareFrom)), bumpVersionStmt(db)]);
  return c.json({ ok: true });
});

app.put("/firmware/:fw", async (c) => {
  const fw = decodeURIComponent(c.req.param("fw"));
  const { generation, model } = await body<{ generation: string; model: string }>(c);
  if (!["old", "new", "unknown"].includes(generation)) throw new HttpError(400, "generation must be old, new or unknown");
  if (!["Core", "Kern", "AC", "Other"].includes(model)) throw new HttpError(400, "model must be Core, Kern, AC or Other");
  const db = c.env.DB;
  const res = await db.batch([
    db.prepare("UPDATE firmware_dim SET generation = ?1, model = ?2, manual = 1 WHERE firmware = ?3").bind(generation, model, fw),
    bumpVersionStmt(db),
  ]);
  if (res[0]!.meta.changes === 0) throw new HttpError(404, "Unknown firmware");
  return c.json({ ok: true });
});

app.delete("/firmware/:fw/override", async (c) => {
  const fw = decodeURIComponent(c.req.param("fw"));
  const db = c.env.DB;
  const d = deriveFirmware(fw, (await getSetting(db, "new_firmware_from")) ?? "260421");
  await db.batch([
    db.prepare("UPDATE firmware_dim SET build = ?1, generation = ?2, model = ?3, rating_kw = ?4, manual = 0 WHERE firmware = ?5")
      .bind(d.build, d.generation, d.model, d.ratingKw, fw),
    bumpVersionStmt(db),
  ]);
  return c.json({ ok: true });
});

app.all("*", (c) => c.json({ error: "Not found" }, 404));

export default app;
