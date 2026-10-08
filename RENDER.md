# Pubblicazione di prova su Render

Questa configurazione esegue l'app completa come **Web Service Docker**. Mantiene le API, il login, il database e le fotografie usando il runtime locale compatibile con D1/R2.

## Configurazione consigliata

1. Accedi a [Render](https://dashboard.render.com/) e collega l'account GitHub che può leggere `bernofx/Camp3`.
2. Seleziona **New > Web Service**.
3. Cerca `Camp3` e premi **Connect**.
4. Imposta:
   - **Name:** `volleystars-test`
   - **Region:** Frankfurt
   - **Branch:** `main`
   - **Root Directory:** lascia vuoto
   - **Runtime:** Docker
   - **Dockerfile Path:** `./Dockerfile`
   - **Health Check Path:** `/api/data`
   - **Auto-Deploy:** Yes
5. Scegli un piano a pagamento compatibile con i dischi persistenti, per esempio **Starter**.
6. Apri **Advanced**, aggiungi un disco e imposta:
   - **Name:** `volleystars-data`
   - **Mount Path:** `/var/data`
   - **Size:** 1 GB
7. Aggiungi la variabile d'ambiente:
   - `RENDER_DISK_PATH=/var/data`
8. Non impostare `PORT`: Render la fornisce automaticamente.
9. Premi **Create Web Service** e attendi che il deploy risulti **Live**.
10. Apri l'indirizzo `https://<nome-servizio>.onrender.com`.

Al primo accesso amministratore usa le credenziali di inizializzazione già previste dall'app. Dopo il primo login l'utente viene salvato nel database persistente.

## Verifica della persistenza

1. Accedi come amministratore.
2. Crea un avviso o un QR di prova.
3. Dal pannello Render seleziona **Manual Deploy > Deploy latest commit**.
4. Dopo il nuovo deploy verifica che avviso e QR siano ancora presenti.

## Prova gratuita

È possibile scegliere il piano Free senza disco, ma database, configurazione e fotografie possono andare persi a ogni riavvio o nuovo deploy. Va usato soltanto per controllare che l'interfaccia si avvii.

## Limiti di questa configurazione

È adatta a un collaudo con una sola istanza. Per il servizio definitivo destinato a più società o tornei occorre migrare il database a PostgreSQL e le fotografie a un archivio oggetti, così da supportare più istanze e backup indipendenti dall'applicazione.
