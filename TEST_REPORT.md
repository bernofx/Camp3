# Rapporto test

Data verifica: 2 ottobre 2026.

## Foglio TEST

- Copia creata con ID `1-9EeieQQrgSHsV83W124Y__qtTnrwS9B_reX6DnqZ0s`.
- Tab verificati: `U13`, `U14`, `U15`, `U17`.
- Le aree operative `A1:AA45` della copia corrispondono all'originale.
- Inseriti due risultati sintetici in `U13!H4:K5`: `2-0` e `1-2`, con i relativi set.
- La rilettura ha confermato valori, formato e celle di destinazione.

## Applicazione

- Sintassi JavaScript verificata con Node.js.
- Navigazione Agenda/Squadre/Info verificata nel browser.
- Filtri categoria e selettore squadra verificati.
- Rendering responsive e fallback offline verificati.
- Il collegamento rapido apre il foglio TEST configurato.

## Lettura live

Il browser di prova non dispone dell'accesso pubblico al foglio e mostra correttamente il fallback offline. Per il collaudo live con volontari, il foglio definitivo o un endpoint di sola lettura deve essere accessibile agli utenti dell'app. L'app usa Google Visualization JSONP, evitando il blocco CORS delle richieste CSV dirette.
