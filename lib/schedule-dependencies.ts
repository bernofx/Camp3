export type ScheduleMatch={gameId:string;category:string;groupCode:string;phase:string;date:string;time:string;court:string;homeRef:string;awayRef:string;result?:string;status?:string};
export type ScheduleLink={targetGameId:string;category:string;homeKind:string;homeRef:string;awayKind:string;awayRef:string};
export type ScheduleGroup={category:string;code:string;sortOrder:number};

const allocated=(match:ScheduleMatch)=>Boolean(match.date&&match.time&&match.court);
const start=(match:ScheduleMatch)=>{const [year,month,day]=match.date.split("-").map(Number),[hour,minute]=match.time.split(":").map(Number);return Date.UTC(year,month-1,day,hour,minute)/60000;};

function rankGroups(category:string,ref:string,groups:ScheduleGroup[]){
  const categoryGroups=groups.filter(group=>group.category===category).sort((a,b)=>a.sortOrder-b.sortOrder||a.code.localeCompare(b.code));
  if(ref.toUpperCase()==="BEST2")return categoryGroups;
  const match=ref.toUpperCase().match(/^(.+?)(\d+)$/);if(!match)return [];
  const legacyIndex=match[1].length===1?match[1].charCodeAt(0)-67:-1;
  if(legacyIndex>=0&&categoryGroups[legacyIndex])return [categoryGroups[legacyIndex]];
  const exact=categoryGroups.find(group=>group.code.toUpperCase()===match[1]);return exact?[exact]:[];
}

export function dependencyOrderError(matches:ScheduleMatch[],links:ScheduleLink[],groups:ScheduleGroup[],duration:number){
  const byId=new Map(matches.map(match=>[match.gameId,match])),byTarget=new Map(links.map(link=>[link.targetGameId,link]));
  for(const target of matches.filter(match=>match.phase!=="girone"&&allocated(match))){
    const link=byTarget.get(target.gameId),sources=link?[[link.homeKind,link.homeRef],[link.awayKind,link.awayRef]]:[["rank",target.homeRef],["rank",target.awayRef]];
    for(const [kind,ref] of sources){
      let prerequisites:ScheduleMatch[]=[];
      if(kind==="winner"||kind==="loser"){
        const source=byId.get(ref);if(!source)return `Gara ${target.gameId}: la gara sorgente ${ref} non esiste.`;prerequisites=[source];
      }else if(kind==="rank"){
        const selected=rankGroups(target.category,ref,groups);if(!selected.length)continue;
        const codes=new Set(selected.map(group=>group.code));prerequisites=matches.filter(match=>match.category===target.category&&match.phase==="girone"&&codes.has(match.groupCode));
      }
      for(const source of prerequisites){
        if(!allocated(source))return `La gara ${target.gameId} non può essere allocata prima della gara necessaria ${source.gameId}.`;
        if(start(target)<start(source)+duration)return `La gara ${target.gameId} deve iniziare dopo la fine prevista della gara ${source.gameId}.`;
      }
    }
  }
  return "";
}
