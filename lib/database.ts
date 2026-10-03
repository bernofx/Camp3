import { env } from "cloudflare:workers";
import seed from "./seed-data.json";

let ready: Promise<void> | null = null;

export function database() {
  if (!env.DB) throw new Error("Database non disponibile");
  return env.DB;
}

const schema = [
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS categories (code TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#dff4ea', sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS tournament_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, category_code TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, UNIQUE(category_code, code))`,
  `CREATE TABLE IF NOT EXISTS teams (code TEXT PRIMARY KEY, name TEXT NOT NULL, category_code TEXT NOT NULL, group_code TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS matches (game_id TEXT PRIMARY KEY, category_code TEXT NOT NULL, group_code TEXT NOT NULL DEFAULT '', phase TEXT NOT NULL DEFAULT 'girone', match_date TEXT NOT NULL, match_time TEXT NOT NULL, court TEXT NOT NULL DEFAULT '', home_ref TEXT NOT NULL, away_ref TEXT NOT NULL, scorekeeper TEXT NOT NULL DEFAULT '', referee TEXT NOT NULL DEFAULT '', court_manager TEXT NOT NULL DEFAULT '', result TEXT NOT NULL DEFAULT '', set_1 TEXT NOT NULL DEFAULT '', set_2 TEXT NOT NULL DEFAULT '', set_3 TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'scheduled')`,
  `CREATE TABLE IF NOT EXISTS result_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT NOT NULL, category TEXT NOT NULL, result TEXT NOT NULL DEFAULT '', set_1 TEXT NOT NULL DEFAULT '', set_2 TEXT NOT NULL DEFAULT '', set_3 TEXT NOT NULL DEFAULT '', user_id INTEGER NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(match_date, match_time)`,
  `CREATE INDEX IF NOT EXISTS idx_matches_category ON matches(category_code)`,
];

const categoryDefaults = [
  ["U13", "Under 13", "#ff9900", 13], ["U14", "Under 14", "#00b0f0", 14],
  ["U15", "Under 15", "#b6d7a8", 15], ["U17", "Under 17", "#ffff00", 17],
] as const;

const groupByTeam: Record<string,string> = {
  "131":"A","132":"A","133":"A","134":"A","135":"B","136":"B","137":"B","138":"B",
  "141":"A","142":"A","143":"A","144":"A",
  "161":"A","162":"A","163":"A","164":"A","165":"B","166":"B","167":"B","168":"B",
  "181":"A","182":"A","183":"A","184":"A","185":"B","186":"B","187":"B","188":"B",
};

function splitMatchup(value: string) {
  if (/^FINALE\b/i.test(String(value || ""))) return [value, ""];
  const parts = String(value || "").split(/\s+-\s+/);
  return parts.length === 2 ? parts : [value, ""];
}

export async function ensureDatabase() {
  ready ??= (async () => {
    const db = database();
    await db.batch(schema.map(statement => db.prepare(statement)));
    const count = await db.prepare("SELECT COUNT(*) AS count FROM categories").first<{count:number}>();
    if (Number(count?.count || 0) > 0) return;
    const seedStatements = [];
    for (const item of categoryDefaults) seedStatements.push(db.prepare("INSERT OR IGNORE INTO categories(code,name,color,sort_order,active) VALUES(?,?,?,?,1)").bind(...item));
    for (const category of categoryDefaults.map(item => item[0])) {
      const groupCodes = category === "U14" ? ["A"] : ["A","B"];
      for (const [index, code] of groupCodes.entries()) seedStatements.push(db.prepare("INSERT OR IGNORE INTO tournament_groups(category_code,code,name,sort_order) VALUES(?,?,?,?)").bind(category,code,`Girone ${code}`,index));
    }
    for (const [code,name] of Object.entries(seed.teams)) {
      const category = `U${code.slice(0,2)}`;
      seedStatements.push(db.prepare("INSERT OR IGNORE INTO teams(code,name,category_code,group_code,active) VALUES(?,?,?,?,1)").bind(code,name,category,groupByTeam[code] || ""));
    }
    for (const match of seed.matches) {
      const [home,away] = splitMatchup(match.matchup);
      const phase = /^FINALE/i.test(match.matchup) ? "finale" : /[CD][1-4]/.test(match.matchup) ? "fase-finale" : "girone";
      seedStatements.push(db.prepare(`INSERT OR IGNORE INTO matches(game_id,category_code,group_code,phase,match_date,match_time,court,home_ref,away_ref,scorekeeper,referee,court_manager,result,set_1,set_2,set_3,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(match.gameId,match.category,"",phase,match.date,match.time,match.court,home,away,match.scorekeeper,match.referee,"",match.result,match.sets[0]||"",match.sets[1]||"",match.sets[2]||"",match.result?"completed":"scheduled"));
    }
    await db.batch(seedStatements);
  })();
  return ready;
}
