(function () {
  const teams = {
    "131":"Intercomunale blu", "132":"Cassano", "133":"S. Agata", "134":"Turate",
    "135":"Intercomunale gialla", "136":"Appiano", "137":"Induno", "138":"Cabiate",
    "141":"Intercomunale", "142":"Induno", "143":"Como Volley", "144":"S. Agata",
    "161":"Intercomunale", "162":"Como Volley", "163":"Brenna", "164":"Col Verde",
    "165":"Cassano", "166":"Carimate", "167":"Appiano", "168":"Cabiate",
    "181":"Intercomunale", "182":"Longone", "183":"Col Verde", "184":"Induno",
    "185":"Cassano", "186":"S. Agata", "187":"Agorà", "188":"Cabiate"
  };

  const rows = [];
  const add = (category, date, gameId, time, court, matchup, scorekeeper, referee) => rows.push({
    category, date, gameId, time, court, matchup, scorekeeper, referee,
    result:"", sets:["", "", ""]
  });

  add("U13","2026-10-02","0100","18:00","5","132 - 134","TURATE","GRAVANTE");
  add("U13","2026-10-02","0101","18:00","4","135 - 136","APPIANO","LIARDO");
  add("U13","2026-10-02","0102","19:10","5","131 - 132","CASSANO","PICCOLO");
  add("U13","2026-10-02","0103","19:10","3","133 - 134","S.AGATA","LIVIO");
  add("U13","2026-10-02","0104","19:10","4","135 - 138","CABIATE","LIARDO");
  add("U13","2026-10-02","0105","20:20","5","131 - 133","POLISPORTIVA","PICCOLO");
  add("U13","2026-10-02","0106","20:20","4","137 - 138","INDUNO","VIOLETTI");
  add("U13","2026-10-03","0107","14:30","5","131 - 134","TURATE","TOMMY");
  add("U13","2026-10-03","0108","15:40","5","132 - 133","S.AGATA","TOMMY");
  add("U13","2026-10-03","0109","16:50","5","135 - 137","INTERCOMUNALE","AFFINI");
  add("U13","2026-10-03","0110","18:00","5","136 - 138","APPIANO","AFFINI");
  add("U13","2026-10-03","0111","19:10","5","136 - 137","INDUNO","BOERO");
  [["0112","09:00","C3 - D4","C3","VIOLETTI"],["0113","10:10","D3 - C4","D3","CANTAGALLI"],["0114","11:20","C1 - D2","C1","RELLA"],["0115","12:30","D1 - C2","D1","VIOLETTI"],["0116","13:30","FINALE 7°-8°","DA DEFINIRE","AFFINI"],["0117","14:45","FINALE 5°-6°","DA DEFINIRE","AFFINI"],["0118","16:00","FINALE 3°-4°","INTERCOMUNALE","FEDERALI"]].forEach(x=>add("U13","2026-10-04",x[0],x[1],"5",x[2],x[3],x[4]));
  add("U13","2026-10-04","0119","17:15","2","FINALE 1°-2°","INTERCOMUNALE","FEDERALI");

  add("U14","2026-10-02","0200","21:30","4","141 - 143","POLISPORTIVA","SARCHI");
  [["0201","14:30","143 - 144","SANTAGATA","RELLA"],["0202","15:40","142 - 144","SANTAGATA","LIVIO"],["0203","16:50","142 - 143","INDUNO","RELLA"],["0204","18:00","141 - 142","INDUNO","NOEMI"],["0205","19:10","141 - 144","POLISPORTIVA","CANTAGALLI"]].forEach(x=>add("U14","2026-10-03",x[0],x[1],"4",x[2],x[3],x[4]));
  add("U14","2026-10-04","0206","09:00","4","C2 - C3","C2","LIARDO");
  add("U14","2026-10-04","0207","10:10","4","C1 - C4","C1","LIARDO");
  add("U14","2026-10-04","0208","14:45","2","FINALE 3°-4°","POLISPORTIVA","FEDERALI");
  add("U14","2026-10-04","0209","16:00","2","FINALE 1°-2°","POLISPORTIVA","FEDERALI");

  [["0300","18:00","2","161 - 163","INTERCOMUNALE","CANTAGALLI"],["0301","18:00","3","165 - 167","CASSANO","LIVIO"],["0302","20:20","2","165 - 168","CABIATE","CANTAGALLI"],["0303","20:20","3","162 - 164","COMO","SARCHI"],["0304","21:30","3","163 - 164","BRENNA","SANTINON"]].forEach(x=>add("U15","2026-10-02",...x));
  [["0305","14:30","2","161 - 164","INTERCOMUNALE","CANTAGALLI"],["0306","14:30","3","165 - 166","CASSANO","BOERO"],["0307","15:40","2","162 - 161","COMO","SARCHI"],["0308","15:40","3","166 - 168","CARIMATE","BOERO"],["0309","16:50","2","162 - 163","BRENNA","SANTINON"],["0310","16:50","3","167 - 168","CABIATE","NOEMI"],["0311","18:00","3","166 - 167","CARIMATE","LIVIO"]].forEach(x=>add("U15","2026-10-03",...x));
  [["0312","09:00","C3 - D4","C3","BRENNA"],["0313","10:10","D3 - C4","D3","BRENNA"],["0314","11:20","C1 - D2","C1","BRENNA"],["0315","12:30","D1 - C2","D1","BRENNA"],["0316","13:30","FINALE 7°-8°","DA DEFINIRE","SARCHI"],["0317","14:45","FINALE 5°-6°","DA DEFINIRE","CANTAGALLI"],["0318","16:00","FINALE 3°-4°","POLISPORTIVA","FEDERALI"],["0319","17:15","FINALE 1°-2°","POLISPORTIVA","FEDERALI"]].forEach(x=>add("U15","2026-10-04",x[0],x[1],"3",x[2],x[3],x[4]));

  [["0400","18:00","1","185 - 187","INDUNO","GANDINI"],["0401","19:10","1","181 - 183","POLISPORTIVA","GANDINI"],["0402","19:10","2","185 - 186","CASSANO","SANTINON"],["0403","20:20","1","181 - 184","INDUNO","BRENNA"],["0404","21:30","1","183 - 184","COLVERDE","BRENNA"]].forEach(x=>add("U17","2026-10-02",...x));
  [["0405","14:30","1","186 - 188","CABIATE","SANTINON"],["0406","15:40","1","182 - 183","LONGONE","SANTINON"],["0407","16:50","1","187 - 188","AGORA'","BRENNA"],["0408","18:00","1","181 - 182","POLISPORTIVA","BRENNA"],["0409","18:00","2","185 - 188","CASSANO","CANTAGALLI"],["0410","19:10","1","182 - 184","INDUNO","BRENNA"],["0411","19:10","2","186 - 187","SANTAGATA","SARCHI"]].forEach(x=>add("U17","2026-10-03",...x));
  [["0412","09:00","C3 - D4","C3","RELLA"],["0413","10:10","D3 - C4","D3","GANDINI"],["0414","11:20","C1 - D2","C1","GANDINI"],["0415","12:30","D1 - C2","D1","BOERO"],["0416","13:30","FINALE 7°-8°","DA DEFINIRE","BOERO"],["0417","14:45","FINALE 5°-6°","DA DEFINIRE","BOERO"],["0418","16:00","FINALE 3°-4°","POLISPORTIVA","FEDERALI"],["0419","17:15","FINALE 1°-2°","POLISPORTIVA","FEDERALI"]].forEach(x=>add("U17","2026-10-04",x[0],x[1],"1",x[2],x[3],x[4]));

  window.VOLLEYSTARS_STATIC = { teams, matches: rows };
})();
