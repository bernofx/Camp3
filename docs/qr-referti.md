# Invio dei referti tramite QR

## Fattibilità

La funzione è compatibile con l’architettura attuale. Il database D1 può conservare proposte, stato di revisione e audit; le fotografie devono invece essere salvate in uno storage a oggetti R2, non nel database. La configurazione Sites corrente non ha ancora un bucket R2 associato (`r2: null`).

Il risultato inviato dal refertista non deve aggiornare direttamente la gara. Crea una proposta in stato `pending`; un amministratore apre foto e dati, quindi approva o respinge. Solo l’approvazione usa le stesse validazioni già applicate dall’API amministrativa dei risultati.

## Esperienza del refertista

1. Un QR stampato sul tavolo identifica il campo tramite un token non prevedibile e revocabile. In alternativa si può stampare un QR specifico per gara.
2. La pagina mostra prima la gara prevista su quel campo e, se necessario, le altre gare senza risultato ordinate per plausibilità: stesso campo, vicinanza all’orario, stessa giornata, quindi tutte le altre.
3. Il refertista seleziona la gara, indica il proprio nome, risultato e parziali, poi fotografa o allega il referto.
4. Prima dell’invio vede un riepilogo. Dopo l’invio riceve un codice breve e la conferma “In attesa di verifica”.
5. Il QR non concede accesso alla gestione del torneo e non consente di modificare una proposta già inviata.

Il criterio “gara disponibile” resta quello concordato: gara senza risultato confermato. L’orario trascorso da solo non dimostra che sia iniziata. Le gare marcate esplicitamente “in corso” possono essere mostrate in testa.

## Esperienza dell’amministratore

Nel menu amministrativo compare una voce **Referti da verificare** con badge numerico. Ogni scheda presenta:

- gara, categoria, giorno, ora e campo;
- squadre risolte, anche nelle fasi finali;
- nome dichiarato del refertista;
- risultato e parziali proposti;
- miniatura della foto, con apertura a schermo intero e zoom;
- eventuale confronto con una proposta già presente o con un risultato già confermato.

Le azioni sono **Approva**, **Correggi e approva**, **Respingi** e **Segna come duplicato**. L’approvazione aggiorna la gara, risolve gli accoppiamenti dipendenti e produce le normali notifiche di risultato. L’autore dell’invio non riceve una notifica duplicata nella stessa sessione.

## Modello dati

Nuova tabella `score_submissions`:

- `id`, identificativo interno;
- `public_code`, codice breve mostrato al refertista;
- `game_id`, `category_code`;
- `scorekeeper_name`;
- `result`, `set_1`, `set_2`, `set_3`;
- `photo_key`, chiave privata del file R2;
- `photo_mime`, `photo_size`, `photo_sha256`;
- `status`: `pending`, `approved`, `rejected`, `duplicate`;
- `submitted_at`, `reviewed_at`, `reviewed_by`;
- `review_note`, `submitter_fingerprint_hash` per limitare abusi senza conservare dati identificativi in chiaro.

Nuova tabella `qr_access_tokens`:

- token memorizzato solo come hash;
- tipo `court` o `match` e relativo riferimento;
- validità temporale, stato attivo/revocato e limite di utilizzo opzionale;
- torneo/cliente di appartenenza quando verrà introdotto il supporto multi-tenant.

L’audit del risultato deve collegare l’eventuale `submission_id`, così rimane verificabile chi ha approvato quale fotografia.

## API

- `GET /api/score-entry/:token`: valida il QR e restituisce solo le gare candidate e i dati pubblici necessari.
- `POST /api/score-entry/:token/photo`: accetta JPEG, PNG o HEIC, verifica dimensione e firma reale del file, normalizza orientamento e crea una miniatura.
- `POST /api/score-entry/:token/submit`: salva la proposta collegandola alla foto già caricata.
- `GET /api/admin/submissions`: coda amministrativa filtrabile per stato, campo e categoria.
- `GET /api/admin/submissions/:id/photo`: restituisce un URL firmato R2 a breve durata.
- `POST /api/admin/submissions/:id/review`: approva, corregge, respinge o marca come duplicato in una transazione logica con audit.

Per evitare upload orfani è preferibile creare prima una sessione di invio breve, caricare la foto con URL firmato e completare la proposta entro 15 minuti. Un processo periodico elimina i file mai collegati.

## Sicurezza e limiti

- Token QR casuali di almeno 128 bit, revocabili e separati dalle sessioni admin.
- Nessun elenco completo delle gare esposto senza token valido.
- Rate limit per token e impronta di rete, CAPTCHA solo se emergono abusi reali.
- File massimi di circa 8 MB; ricodifica server-side in JPEG/WebP e rimozione dei metadati EXIF, compresa la posizione GPS.
- Accesso alle immagini solo agli amministratori tramite URL firmati brevi; bucket non pubblico.
- Controllo MIME tramite contenuto, non tramite estensione, e rifiuto di SVG/PDF in questa prima versione.
- Conservazione configurabile: per esempio eliminazione delle foto 90 giorni dopo la chiusura del torneo, mantenendo audit e dati del risultato.
- Informativa breve nella pagina di invio: fotografare solo il referto ed evitare persone o altri dati non necessari.

## Gestione di spostamenti e casi limite

Il QR di campo continua a funzionare se una gara viene spostata: propone prima le gare attualmente allocate sul campo, ma permette di scegliere tutte quelle senza risultato. Il QR specifico di gara apre direttamente quella gara e offre “La gara è stata spostata” per tornare alla ricerca.

Se arrivano due proposte per la stessa gara, entrambe restano visibili e vengono confrontate. Se l’amministratore ha già confermato il risultato, una nuova proposta viene segnalata come tardiva e non sovrascrive nulla. Una foto può essere riutilizzata solo nella propria proposta; l’hash aiuta a riconoscere duplicati.

## Sequenza di implementazione

1. Collegare un bucket R2 privato all’ambiente V1 e aggiungere schema/migrazione D1.
2. Implementare token QR, pagina pubblica mobile e generazione/stampa dei QR per campo e gara.
3. Implementare upload diretto firmato, normalizzazione immagini e pulizia degli upload incompleti.
4. Aggiungere la coda amministrativa con anteprima, zoom e badge.
5. Riutilizzare in approvazione le validazioni dei risultati, comprese le dipendenze delle fasi finali.
6. Aggiungere notifiche, audit, gestione duplicati e criteri di conservazione.
7. Testare cambio campo, gara oltre orario, invii simultanei, rete mobile intermittente, file troppo grandi, token revocato e risultato già approvato.

La prima versione può partire con QR per campo, nome libero del refertista, una sola foto e approvazione obbligatoria. Firma del refertista, più foto e riconoscimento automatico del risultato dalla fotografia possono essere aggiunti in seguito.
