#!/usr/bin/env node
/* ===========================================================================
 * Bolão Copa do Mundo — daily results updater
 * ---------------------------------------------------------------------------
 * Pulls finished World Cup matches from ESPN's public JSON scoreboard (no API
 * key needed) and writes their scores into the Bolão's Firebase Realtime DB at
 * /bolao/results/<matchId>. The website recomputes all points client-side from
 * these raw results, so writing the scores is all that's needed to "adjust the
 * points" — draft points AND the daily Confronto are resolved automatically.
 *
 * USAGE
 *   node tools/bolao-update.mjs              # yesterday (America/Sao_Paulo)
 *   node tools/bolao-update.mjs 2026-06-13   # a specific day (repeatable args)
 *   node tools/bolao-update.mjs --catchup    # every day from the start to yesterday
 *   node tools/bolao-update.mjs --today      # include today (matches finished so far)
 *   node tools/bolao-update.mjs --dry-run    # print what would be written, write nothing
 *   node tools/bolao-update.mjs --force      # re-write results even if already present
 *
 * WHY THIS IS SAFE TO RUN DAILY (and repeatedly):
 *   - It only writes matches ESPN marks `completed`.
 *   - By default it SKIPS matches already in the DB, so it never clobbers a
 *     manual admin correction and a daily --catchup is cheap (use --force to
 *     overwrite). It never touches picks, confrontos, trades, or the draft.
 *
 * DATES: matches are filed under their America/Sao_Paulo calendar date, which
 * is what the site (and the admin's confronto schedule) uses. ESPN timestamps
 * are UTC, so we fetch the UTC day AND the next UTC day and keep the matches
 * whose São Paulo date equals the target.
 * =========================================================================== */

const DB_BASE     = "https://bolao-a6f50-default-rtdb.firebaseio.com/bolao";
const ESPN_SCORES = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=";
const TZ          = "America/Sao_Paulo";
const TOURNEY_START = "2026-06-11";

/* FIFA 3-letter code (ESPN `team.abbreviation`) -> Bolão code (ISO-2 flag id).
 * Covers all 48 nations in the 2026 field. Names are kept only as a comment. */
const FIFA_TO_CODE = {
  USA: "us", MEX: "mx", CAN: "ca", ARG: "ar", BRA: "br", URU: "uy", COL: "co",
  ECU: "ec", PAR: "py", FRA: "fr", ENG: "gb-eng", ESP: "es", GER: "de",
  POR: "pt", NED: "nl", BEL: "be", CRO: "hr", SUI: "ch", AUT: "at", NOR: "no",
  SWE: "se", SCO: "gb-sct", CZE: "cz", TUR: "tr", BIH: "ba", MAR: "ma",
  SEN: "sn", TUN: "tn", ALG: "dz", EGY: "eg", GHA: "gh", CIV: "ci", RSA: "za",
  CPV: "cv", COD: "cd", JPN: "jp", KOR: "kr", IRN: "ir", AUS: "au", KSA: "sa",
  QAT: "qa", UZB: "uz", JOR: "jo", IRQ: "iq", PAN: "pa", CUW: "cw", HAI: "ht",
  NZL: "nz"
};
/* Fallback: normalized English display name -> Bolão code (in case ESPN ever
 * sends an abbreviation we don't recognize). */
const NAME_TO_CODE = {
  "united states": "us", "mexico": "mx", "canada": "ca", "argentina": "ar",
  "brazil": "br", "uruguay": "uy", "colombia": "co", "ecuador": "ec",
  "paraguay": "py", "france": "fr", "england": "gb-eng", "spain": "es",
  "germany": "de", "portugal": "pt", "netherlands": "nl", "belgium": "be",
  "croatia": "hr", "switzerland": "ch", "austria": "at", "norway": "no",
  "sweden": "se", "scotland": "gb-sct", "czechia": "cz", "czech republic": "cz",
  "turkiye": "tr", "turkey": "tr", "bosnia and herzegovina": "ba", "bosnia": "ba",
  "morocco": "ma", "senegal": "sn", "tunisia": "tn", "algeria": "dz",
  "egypt": "eg", "ghana": "gh", "ivory coast": "ci", "cote d'ivoire": "ci",
  "south africa": "za", "cape verde": "cv", "cabo verde": "cv",
  "dr congo": "cd", "congo dr": "cd", "japan": "jp", "south korea": "kr",
  "korea republic": "kr", "iran": "ir", "australia": "au",
  "saudi arabia": "sa", "qatar": "qa", "uzbekistan": "uz", "jordan": "jo",
  "iraq": "iq", "panama": "pa", "curacao": "cw", "haiti": "ht",
  "new zealand": "nz"
};

const argv = process.argv.slice(2);
const DRY   = argv.includes("--dry-run");
const FORCE = argv.includes("--force"); // re-write results that are already in the DB
const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z' ]/g, "").trim();

/* Confronto pairings (sorted "codeA_codeB" -> [dates]) loaded from Firebase.
 * The admin sometimes schedules a confronto a day off from the real fixture
 * (timezone/calendar). When a match matches a scheduled confronto within ±2
 * days, we file the result under the CONFRONTO's date so the pot resolves. */
let CONFRONTO_DATES = {};
async function loadConfrontos() {
  const c = (await (await fetch(`${DB_BASE}/confrontos.json`)).json()) || {};
  for (const date of Object.keys(c)) {
    const v = c[date];
    if (!v || !v.teamA || !v.teamB) continue;
    (CONFRONTO_DATES[[v.teamA, v.teamB].sort().join("_")] ||= []).push(date);
  }
}
function fileDate(espnSpDate, codeA, codeB) {
  const dates = CONFRONTO_DATES[[codeA, codeB].sort().join("_")] || [];
  let best = null, bestDiff = 3;
  for (const d of dates) {
    const diff = Math.abs((Date.parse(d) - Date.parse(espnSpDate)) / 86400000);
    if (diff <= 2 && diff < bestDiff) { best = d; bestDiff = diff; }
  }
  return best || espnSpDate;
}

function spDateOf(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function addDays(ymd, n) {
  const p = ymd.split("-").map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
}
function codeFor(team) {
  return FIFA_TO_CODE[team.abbreviation] || NAME_TO_CODE[norm(team.displayName)] || null;
}
function matchId(date, a, b) { return date + "_" + [a, b].sort().join("_"); }

// Which target São Paulo dates to process.
function targetDates() {
  const today = spDateOf(new Date());
  const yesterday = addDays(today, -1);
  const explicit = argv.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  if (explicit.length) return explicit;
  if (argv.includes("--catchup")) {
    const end = argv.includes("--today") ? today : yesterday;
    const out = [];
    for (let d = TOURNEY_START; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }
  return [argv.includes("--today") ? today : yesterday];
}

async function fetchEspnDay(utcDay) {
  const url = ESPN_SCORES + utcDay.replace(/-/g, "");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN ${utcDay} -> HTTP ${res.status}`);
  const j = await res.json();
  return j.events || [];
}

// All completed matches whose São Paulo date == target.
async function matchesForSpDate(target) {
  const utcDays = [target, addDays(target, 1)]; // a SP-date-D match is UTC in [D, D+1]
  const events = (await Promise.all(utcDays.map(fetchEspnDay))).flat();
  const seen = new Set(), out = [];
  for (const e of events) {
    if (seen.has(e.id)) continue; seen.add(e.id);
    if (spDateOf(new Date(e.date)) !== target) continue;
    if (!e.status?.type?.completed) continue;
    const c = e.competitions[0], cs = c.competitors;
    const A = cs.find((x) => x.homeAway === "home") || cs[0];
    const B = cs.find((x) => x.homeAway === "away") || cs[1];
    const codeA = codeFor(A.team), codeB = codeFor(B.team);
    if (!codeA || !codeB) {
      console.warn(`  ! skip (unmapped team): ${A.team.displayName} [${A.team.abbreviation}] vs ${B.team.displayName} [${B.team.abbreviation}]`);
      continue;
    }
    const filed = fileDate(target, codeA, codeB);
    out.push({ date: filed, teamA: codeA, teamB: codeB, scoreA: Number(A.score), scoreB: Number(B.score),
               label: `${A.team.displayName} ${A.score}-${B.score} ${B.team.displayName}` + (filed !== target ? `  (confronto -> ${filed})` : "") });
  }
  return out;
}

async function main() {
  await loadConfrontos();
  const existing = (await (await fetch(`${DB_BASE}/results.json?shallow=true`)).json()) || {};
  const dates = targetDates();
  console.log(`Bolão updater — dates: ${dates.join(", ")}${DRY ? "  (DRY RUN)" : ""}${FORCE ? "  (FORCE)" : ""}`);
  const payload = {};
  let n = 0, skipped = 0;
  for (const date of dates) {
    const matches = await matchesForSpDate(date);
    if (!matches.length) { console.log(`${date}: no finished matches`); continue; }
    for (const m of matches) {
      const id = matchId(m.date, m.teamA, m.teamB);
      if (existing[id] && !FORCE) { console.log(`${date}: ${m.label}  ->  ${id}  (already in DB, skip)`); skipped++; continue; }
      payload[id] = { date: m.date, teamA: m.teamA, teamB: m.teamB, scoreA: m.scoreA, scoreB: m.scoreB };
      console.log(`${date}: ${m.label}  ->  ${id}  (NEW)`);
      n++;
    }
  }
  if (!n) { console.log(`Nothing new to write${skipped ? ` (${skipped} already present)` : ""}.`); return; }
  if (DRY) { console.log(`\nDRY RUN — would PATCH ${n} new result(s) (${skipped} already present).`); return; }

  const res = await fetch(`${DB_BASE}/results.json`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Firebase PATCH failed: HTTP ${res.status} ${await res.text()}`);
  console.log(`\n✅ Wrote ${n} new result(s) to Firebase${skipped ? ` (${skipped} already present)` : ""}. Points recompute automatically on the site.`);
}

main().catch((err) => { console.error("ERROR:", err.message); process.exit(1); });
