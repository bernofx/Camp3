import { json } from "../../../lib/auth";
import { database, ensureDatabase } from "../../../lib/database";

export async function GET() {
  await ensureDatabase();
  const db = database();
  const [categories,groups,teams,courts,staff,settings,matches,finalLinks] = await Promise.all([
    db.prepare("SELECT c.code,c.name,c.color,c.sort_order AS sortOrder,COALESCE(s.admission_method,'top2_each') AS admissionMethod FROM categories c LEFT JOIN category_settings s ON s.category_code=c.code WHERE c.active=1 ORDER BY c.sort_order,c.code").all(),
    db.prepare("SELECT id,category_code AS categoryCode,code,name,sort_order AS sortOrder FROM tournament_groups ORDER BY category_code,sort_order,code").all(),
    db.prepare("SELECT code,name,category_code AS categoryCode,group_code AS groupCode FROM teams WHERE active=1 ORDER BY category_code,group_code,name").all(),
    db.prepare("SELECT code,name,sort_order AS sortOrder FROM courts WHERE active=1 ORDER BY sort_order,code").all(),
    db.prepare("SELECT id,name,can_referee AS canReferee,can_scorekeeper AS canScorekeeper,can_court_manager AS canCourtManager FROM staff WHERE active=1 ORDER BY name").all(),
    db.prepare("SELECT key,value FROM tournament_settings").all(),
    db.prepare(`SELECT game_id AS gameId,category_code AS category,group_code AS groupCode,phase,match_date AS date,match_time AS time,court,home_ref AS homeRef,away_ref AS awayRef,scorekeeper,referee,court_manager AS courtManager,result,set_1 AS set1,set_2 AS set2,set_3 AS set3,status FROM matches ORDER BY match_date,match_time,game_id`).all(),
    db.prepare(`SELECT target_game_id AS targetGameId,category_code AS categoryCode,section_title AS sectionTitle,section_order AS sectionOrder,target_order AS targetOrder,home_kind AS homeKind,home_ref AS homeRef,away_kind AS awayKind,away_ref AS awayRef FROM final_links ORDER BY category_code,section_order,target_order`).all(),
  ]);
  return json({ok:true,categories:categories.results,groups:groups.results,teams:teams.results,courts:courts.results,staff:staff.results,settings:Object.fromEntries(settings.results.map((item:any)=>[item.key,item.value])),matches:matches.results,finalLinks:finalLinks.results});
}
