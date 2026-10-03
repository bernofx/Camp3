# Configurazione VolleyStars 2026 v2

La v2 è un sito separato dalla versione attuale. Il pubblico può consultarlo senza login. Solo gli account `editor` e `admin` vedono la matita e possono inviare risultati.

## Prima configurazione

1. Nelle impostazioni del Site aggiungere il segreto `ADMIN_SETUP_TOKEN`.
2. Aprire la v2, premere **Accedi** e inserire la chiave, lo username e la password del primo amministratore.
3. Nel tab **Info**, l'amministratore può creare gli altri utenti scegliendo username, password iniziale e ruolo.

Le password sono salvate nel database D1 esclusivamente come hash PBKDF2 con salt. La sessione dura 12 ore ed è conservata in un cookie `HttpOnly`, `Secure`, `SameSite=Strict`.

## Collegamento al foglio ufficiale

1. Il proprietario apre il foglio ufficiale e crea un progetto da **Estensioni > Apps Script**.
2. Incolla [Code.gs](google-apps-script/Code.gs) e crea una proprietà script chiamata `WRITE_SECRET` con un valore casuale lungo.
3. Distribuisce lo script come **App web**, eseguito come proprietario e accessibile a chiunque. Google chiede al proprietario l'autorizzazione una sola volta.
4. Nelle impostazioni del Site aggiunge:
   - `GOOGLE_WRITE_URL`: URL della distribuzione Apps Script.
   - `GOOGLE_WRITE_SECRET`: lo stesso valore di `WRITE_SECRET`.
5. Ridistribuisce la v2.

Gli editor non accedono a Google e non vedono il segreto. La v2 controlla la loro sessione, quindi inoltra il risultato al collegamento che scrive nel foglio per conto del proprietario.
