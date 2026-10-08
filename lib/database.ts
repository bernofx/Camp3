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
  `CREATE TABLE IF NOT EXISTS category_settings (category_code TEXT PRIMARY KEY, admission_method TEXT NOT NULL DEFAULT 'top2_each', placement_mode TEXT NOT NULL DEFAULT 'top2', entry_round TEXT NOT NULL DEFAULT 'semifinals', home_and_away INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS tournament_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, category_code TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, UNIQUE(category_code, code))`,
  `CREATE TABLE IF NOT EXISTS teams (code TEXT PRIMARY KEY, name TEXT NOT NULL, category_code TEXT NOT NULL, group_code TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS courts (code TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS tournament_days (code TEXT PRIMARY KEY, name TEXT NOT NULL, day_date TEXT NOT NULL UNIQUE, start_time TEXT NOT NULL DEFAULT '09:00', end_time TEXT NOT NULL DEFAULT '23:59', sort_order INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS tournament_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS staff (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, can_referee INTEGER NOT NULL DEFAULT 0, can_scorekeeper INTEGER NOT NULL DEFAULT 0, can_court_manager INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS matches (game_id TEXT PRIMARY KEY, category_code TEXT NOT NULL, group_code TEXT NOT NULL DEFAULT '', phase TEXT NOT NULL DEFAULT 'girone', match_date TEXT NOT NULL, match_time TEXT NOT NULL, court TEXT NOT NULL DEFAULT '', home_ref TEXT NOT NULL, away_ref TEXT NOT NULL, scorekeeper TEXT NOT NULL DEFAULT '', referee TEXT NOT NULL DEFAULT '', court_manager TEXT NOT NULL DEFAULT '', result TEXT NOT NULL DEFAULT '', set_1 TEXT NOT NULL DEFAULT '', set_2 TEXT NOT NULL DEFAULT '', set_3 TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'scheduled')`,
  `CREATE TABLE IF NOT EXISTS final_links (target_game_id TEXT PRIMARY KEY, category_code TEXT NOT NULL, section_title TEXT NOT NULL DEFAULT 'Fase finale', section_order INTEGER NOT NULL DEFAULT 0, target_order INTEGER NOT NULL DEFAULT 0, home_kind TEXT NOT NULL, home_ref TEXT NOT NULL, away_kind TEXT NOT NULL, away_ref TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS result_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT NOT NULL, category TEXT NOT NULL, result TEXT NOT NULL DEFAULT '', set_1 TEXT NOT NULL DEFAULT '', set_2 TEXT NOT NULL DEFAULT '', set_3 TEXT NOT NULL DEFAULT '', user_id INTEGER NOT NULL, submission_id INTEGER, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS notices (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, message TEXT NOT NULL, accent INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, created_by INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS incident_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, incident_type TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '{}', user_id INTEGER NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS team_withdrawals (team_code TEXT PRIMARY KEY, reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, created_by INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS qr_access_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, token_hash TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, reference TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, expires_at TEXT, created_by INTEGER NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS score_uploads (photo_key TEXT PRIMARY KEY, token_hash TEXT NOT NULL, photo_mime TEXT NOT NULL, photo_size INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS score_submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, public_code TEXT NOT NULL UNIQUE, game_id TEXT NOT NULL, category_code TEXT NOT NULL, scorekeeper_name TEXT NOT NULL, result TEXT NOT NULL DEFAULT '', set_1 TEXT NOT NULL DEFAULT '', set_2 TEXT NOT NULL DEFAULT '', set_3 TEXT NOT NULL DEFAULT '', photo_key TEXT NOT NULL, photo_mime TEXT NOT NULL, photo_size INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', submitted_at TEXT NOT NULL, reviewed_at TEXT, reviewed_by INTEGER, review_note TEXT NOT NULL DEFAULT '')`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(match_date, match_time)`,
  `CREATE INDEX IF NOT EXISTS idx_matches_category ON matches(category_code)`,
  `CREATE INDEX IF NOT EXISTS idx_notices_created_at ON notices(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_incident_audit_created_at ON incident_audit(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_qr_access_tokens_reference ON qr_access_tokens(kind, reference, active)`,
  `CREATE INDEX IF NOT EXISTS idx_score_submissions_status ON score_submissions(status, submitted_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_score_submissions_game ON score_submissions(game_id, submitted_at DESC)`,
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
    const categorySettingColumns=await db.prepare("PRAGMA table_info(category_settings)").all<{name:string}>();
    if(!categorySettingColumns.results.some(column=>column.name==="placement_mode")){
      await db.prepare("ALTER TABLE category_settings ADD COLUMN placement_mode TEXT NOT NULL DEFAULT 'top2'").run();
      await db.prepare(`UPDATE category_settings SET placement_mode=CASE
        WHEN EXISTS(SELECT 1 FROM matches WHERE category_code=category_settings.category_code AND UPPER(home_ref) LIKE '%7°%8°%') THEN 'top8'
        WHEN EXISTS(SELECT 1 FROM matches WHERE category_code=category_settings.category_code AND UPPER(home_ref) LIKE '%3°%4°%') THEN 'top4'
        ELSE 'top2' END`).run();
    }
    if(!categorySettingColumns.results.some(column=>column.name==="entry_round")){
      await db.prepare("ALTER TABLE category_settings ADD COLUMN entry_round TEXT NOT NULL DEFAULT 'semifinals'").run();
      await db.prepare(`UPDATE category_settings SET entry_round=CASE
        WHEN EXISTS(SELECT 1 FROM matches WHERE category_code=category_settings.category_code AND phase='ottavi') THEN 'round_of_16'
        WHEN EXISTS(SELECT 1 FROM matches WHERE category_code=category_settings.category_code AND phase='quarti') THEN 'quarterfinals'
        WHEN EXISTS(SELECT 1 FROM matches WHERE category_code=category_settings.category_code AND phase='fase-finale') THEN 'semifinals'
        ELSE 'final' END`).run();
    }
    if(!categorySettingColumns.results.some(column=>column.name==="home_and_away"))await db.prepare("ALTER TABLE category_settings ADD COLUMN home_and_away INTEGER NOT NULL DEFAULT 0").run();
    const resultAuditColumns=await db.prepare("PRAGMA table_info(result_audit)").all<{name:string}>();
    if(!resultAuditColumns.results.some(column=>column.name==="submission_id"))await db.prepare("ALTER TABLE result_audit ADD COLUMN submission_id INTEGER").run();
    const tournamentDayColumns=await db.prepare("PRAGMA table_info(tournament_days)").all<{name:string}>();
    if(!tournamentDayColumns.results.some(column=>column.name==="end_time"))await db.prepare("ALTER TABLE tournament_days ADD COLUMN end_time TEXT NOT NULL DEFAULT '23:59'").run();
    const infrastructure = [
      db.prepare("INSERT OR IGNORE INTO tournament_settings(key,value) VALUES('match_duration_minutes','70')"),
      db.prepare("INSERT OR IGNORE INTO tournament_settings(key,value) SELECT 'tournament_state',CASE WHEN EXISTS(SELECT 1 FROM tournament_settings WHERE key='plan_confirmed' AND value='1') THEN 'confirmed' ELSE 'planning' END"),
      db.prepare("UPDATE teams SET category_code='U15' WHERE category_code='U16'"),
      db.prepare("UPDATE teams SET category_code='U17' WHERE category_code='U18'"),
      ...["1","2","3","4","5"].map((code,index)=>db.prepare("INSERT OR IGNORE INTO courts(code,name,sort_order,active) VALUES(?,?,?,1)").bind(code,`Campo ${code}`,index+1)),
    ];
    const links = [
      ["0116","U13","Dal 5° all’8° posto",2,2,"loser","0112","loser","0113"], ["0117","U13","Dal 5° all’8° posto",2,1,"winner","0112","winner","0113"],
      ["0118","U13","Titolo e podio",1,2,"loser","0114","loser","0115"], ["0119","U13","Titolo e podio",1,1,"winner","0114","winner","0115"],
      ["0208","U14","Titolo e podio",1,2,"loser","0206","loser","0207"], ["0209","U14","Titolo e podio",1,1,"winner","0206","winner","0207"],
      ["0316","U15","Dal 5° all’8° posto",2,2,"loser","0312","loser","0313"], ["0317","U15","Dal 5° all’8° posto",2,1,"winner","0312","winner","0313"],
      ["0318","U15","Titolo e podio",1,2,"loser","0314","loser","0315"], ["0319","U15","Titolo e podio",1,1,"winner","0314","winner","0315"],
      ["0416","U17","Dal 5° all’8° posto",2,2,"loser","0412","loser","0413"], ["0417","U17","Dal 5° all’8° posto",2,1,"winner","0412","winner","0413"],
      ["0418","U17","Titolo e podio",1,2,"loser","0414","loser","0415"], ["0419","U17","Titolo e podio",1,1,"winner","0414","winner","0415"],
    ];
    const staffRoles=new Map<string,{referee:number;scorekeeper:number}>();
    for(const match of seed.matches){
      if(match.referee){const role=staffRoles.get(match.referee)||{referee:0,scorekeeper:0};role.referee=1;staffRoles.set(match.referee,role);}
      if(match.scorekeeper){const role=staffRoles.get(match.scorekeeper)||{referee:0,scorekeeper:0};role.scorekeeper=1;staffRoles.set(match.scorekeeper,role);}
    }
    infrastructure.push(...[...staffRoles.entries()].map(([name,roles])=>db.prepare("INSERT OR IGNORE INTO staff(name,can_referee,can_scorekeeper,can_court_manager,active) VALUES(?,?,?,?,1)").bind(name,roles.referee,roles.scorekeeper,0)));
    await db.batch(infrastructure);
    await db.prepare(`DELETE FROM final_links
      WHERE target_game_id NOT IN (SELECT game_id FROM matches)
         OR (home_kind IN ('winner','loser') AND home_ref NOT IN (SELECT game_id FROM matches))
         OR (away_kind IN ('winner','loser') AND away_ref NOT IN (SELECT game_id FROM matches))`).run();
    await db.prepare("INSERT OR IGNORE INTO tournament_settings(key,value) SELECT 'plan_confirmed',CASE WHEN EXISTS(SELECT 1 FROM matches) THEN '1' ELSE '0' END").run();
    await db.prepare("INSERT OR IGNORE INTO category_settings(category_code,admission_method,placement_mode,entry_round) SELECT code,'top2_each','top2','semifinals' FROM categories").run();
    const dayCount=await db.prepare("SELECT COUNT(*) AS count FROM tournament_days").first<{count:number}>();
    if(!Number(dayCount?.count||0)){const dates=await db.prepare("SELECT DISTINCT match_date AS date FROM matches WHERE match_date<>'' ORDER BY match_date").all<{date:string}>();if(dates.results.length)await db.batch(dates.results.map((item,index)=>db.prepare("INSERT OR IGNORE INTO tournament_days(code,name,day_date,start_time,sort_order) VALUES(?,?,?,?,?)").bind(`G${index+1}`,`G${index+1}`,item.date,"09:00",index+1)));}
    const count = await db.prepare("SELECT COUNT(*) AS count FROM categories").first<{count:number}>();
    if (Number(count?.count || 0) > 0) return;
    const seedStatements = [];
    for (const item of categoryDefaults) seedStatements.push(db.prepare("INSERT OR IGNORE INTO categories(code,name,color,sort_order,active) VALUES(?,?,?,?,1)").bind(...item));
    for (const category of categoryDefaults.map(item => item[0])) {
      const groupCodes = category === "U14" ? ["A"] : ["A","B"];
      for (const [index, code] of groupCodes.entries()) seedStatements.push(db.prepare("INSERT OR IGNORE INTO tournament_groups(category_code,code,name,sort_order) VALUES(?,?,?,?)").bind(category,code,`Girone ${code}`,index));
    }
    for (const [code,name] of Object.entries(seed.teams)) {
      const category = code.startsWith("16") ? "U15" : code.startsWith("18") ? "U17" : `U${code.slice(0,2)}`;
      seedStatements.push(db.prepare("INSERT OR IGNORE INTO teams(code,name,category_code,group_code,active) VALUES(?,?,?,?,1)").bind(code,name,category,groupByTeam[code] || ""));
    }
    for (const match of seed.matches) {
      const [home,away] = splitMatchup(match.matchup);
      const phase = /^FINALE/i.test(match.matchup) ? "finale" : /[CD][1-4]/.test(match.matchup) ? "fase-finale" : "girone";
      seedStatements.push(db.prepare(`INSERT OR IGNORE INTO matches(game_id,category_code,group_code,phase,match_date,match_time,court,home_ref,away_ref,scorekeeper,referee,court_manager,result,set_1,set_2,set_3,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(match.gameId,match.category,"",phase,match.date,match.time,match.court,home,away,match.scorekeeper,match.referee,"",match.result,match.sets[0]||"",match.sets[1]||"",match.sets[2]||"",match.result?"completed":"scheduled"));
    }
    seedStatements.push(...links.map(item=>db.prepare(`INSERT OR IGNORE INTO final_links(target_game_id,category_code,section_title,section_order,target_order,home_kind,home_ref,away_kind,away_ref) VALUES(?,?,?,?,?,?,?,?,?)`).bind(...item)));
    await db.batch(seedStatements);
    await db.prepare("UPDATE tournament_settings SET value='1' WHERE key='plan_confirmed'").run();
    await db.prepare("INSERT OR IGNORE INTO category_settings(category_code,admission_method,placement_mode,entry_round) SELECT code,'top2_each','top2','semifinals' FROM categories").run();
    const dates=await db.prepare("SELECT DISTINCT match_date AS date FROM matches WHERE match_date<>'' ORDER BY match_date").all<{date:string}>();if(dates.results.length)await db.batch(dates.results.map((item,index)=>db.prepare("INSERT OR IGNORE INTO tournament_days(code,name,day_date,start_time,sort_order) VALUES(?,?,?,?,?)").bind(`G${index+1}`,`G${index+1}`,item.date,"09:00",index+1)));
  })();
  return ready;
}
