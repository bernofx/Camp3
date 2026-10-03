import { json } from "../../../lib/auth";
import { database, ensureDatabase } from "../../../lib/database";

export async function GET() {
  await ensureDatabase();
  const db = database();
  const [categories,groups,teams,matches] = await Promise.all([
    db.prepare("SELECT code,name,color,sort_order AS sortOrder FROM categories WHERE active=1 ORDER BY sort_order,code").all(),
    db.prepare("SELECT id,category_code AS categoryCode,code,name,sort_order AS sortOrder FROM tournament_groups ORDER BY category_code,sort_order,code").all(),
    db.prepare("SELECT code,name,category_code AS categoryCode,group_code AS groupCode FROM teams WHERE active=1 ORDER BY category_code,group_code,name").all(),
    db.prepare(`SELECT game_id AS gameId,category_code AS category,group_code AS groupCode,phase,match_date AS date,match_time AS time,court,home_ref AS homeRef,away_ref AS awayRef,scorekeeper,referee,court_manager AS courtManager,result,set_1 AS set1,set_2 AS set2,set_3 AS set3,status FROM matches ORDER BY match_date,match_time,game_id`).all(),
  ]);
  return json({ok:true,categories:categories.results,groups:groups.results,teams:teams.results,matches:matches.results});
}
