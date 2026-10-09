# VolleyStars V1

Applicazione completa per configurare, pianificare e gestire tornei di pallavolo. Questa è la versione di sviluppo **V1** con backend e database interni: non legge il calendario da Google Sheets.

## Funzioni principali

- consultazione pubblica di agenda, squadre, classifiche, fasi finali e avvisi;
- accesso amministratore per categorie, squadre, gironi e generazione automatica delle gare;
- pianificazione su campi e giornate, controlli di coerenza e gestione degli imprevisti;
- inserimento e approvazione dei risultati, QR per campo o gara e fotografie dei referti;
- esportazione Excel di controllo;
- interfaccia mobile e regia desktop sullo stesso database.

## Struttura del progetto

- `public/`: interfaccia V1 e PWA;
- `app/`: pagine e API del backend;
- `lib/`: database, autenticazione e logica del torneo;
- `migrations/`: schema e aggiornamenti del database;
- `scripts/`: avvio, compilazione e supporto al deploy;
- `Dockerfile`: pubblicazione dell'app completa su Render.

La cartella principale non contiene una seconda copia statica dell'app. Il punto di ingresso pubblico è `public/index.html`.

## Avvio locale

Richiede Node.js 22 o successivo.

```text
npm install
npm run dev
```

Per creare la versione distribuibile:

```text
npm run build
```

## Pubblicazione su Render

Creare un **Web Service** con runtime **Docker**, branch `main`, root directory vuota e Dockerfile `./Dockerfile`. Le istruzioni complete sono in [RENDER.md](RENDER.md).

Il piano gratuito è adatto solo alle prove perché database e fotografie possono essere cancellati dopo un riavvio o un nuovo deploy. Per conservare i dati serve un disco persistente oppure, in una futura configurazione multi-cliente, un database e un archivio file esterni.
