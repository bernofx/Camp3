# Piano di sviluppo v1

## Refertisti e QR di campo

### Obiettivo

La configurazione iniziale assegna il referto a una squadra, non necessariamente a una persona già nota. L'associazione può essere:

- squadra di casa;
- squadra ospite;
- squadra specifica;
- posizione di classifica futura, per esempio `C1`, `C2` o `D3`;
- persona già conosciuta.

Quando una posizione di classifica viene risolta, anche la squadra responsabile del referto viene risolta automaticamente. Il nome del refertista presente può essere confermato successivamente tramite QR oppure inserito e corretto da un amministratore.

Nel match vengono mostrati separatamente:

- **Referto previsto:** squadra responsabile;
- **Refertista presente:** nome confermato e ora della conferma.

### QR per campo

Ogni campo ha un QR stabile e stampabile prima del torneo. Il codice contiene un token casuale non prevedibile e apre la pagina di registrazione del campo senza richiedere login.

La pagina permette soltanto di:

1. scegliere una partita non ancora iniziata;
2. confermare il campo effettivo;
3. inserire il nome del refertista presente.

Non permette di modificare risultati, squadre, orari o altre informazioni amministrative.

### Selezione della partita e cambi campo

La scansione non limita la scelta alle sole partite programmate sul campo del QR. Mostra tutte le gare compatibili non ancora iniziate, ordinate per plausibilità.

Ordine proposto:

1. gara prevista sul campo scansionato con orario più vicino;
2. gare in ritardo previste su altri campi, ordinate dalla più vicina all'orario corrente;
3. gare previste entro i successivi 90 minuti, ordinate per orario;
4. altre gare della giornata non ancora iniziate;
5. comando secondario **Mostra tutte** per le gare future fuori dalla finestra ordinaria.

Ogni proposta mostra numero gara, categoria, squadre, orario previsto, campo previsto e motivo della priorità, per esempio **Prevista qui**, **In ritardo di 15 min** o **In programma tra 20 min**.

Se viene scelta sul campo 5 una gara prevista sul campo 4, la pagina chiede una conferma esplicita:

> La gara 0112 era prevista sul campo 4. Confermi lo svolgimento sul campo 5?

La conferma conserva il campo pianificato e registra separatamente il campo effettivo. Agenda, tabellone e area amministrativa mostrano subito il campo effettivo, con un'indicazione del cambio.

### Regole di compatibilità

Una gara è selezionabile dal QR quando:

- lo stato è `programmata` o `in attesa`;
- non ha un risultato finale;
- non è già stata avviata su un altro campo;
- nessuna delle due squadre risulta impegnata in una gara in corso;
- il campo scansionato non risulta occupato da un'altra gara in corso.

Se il campo risulta occupato, il sistema blocca la conferma e mostra la gara che lo sta utilizzando. Un amministratore può correggere lo stato della gara o forzare lo spostamento dall'area Gestione.

La conferma deve essere atomica: due telefoni non possono assegnare contemporaneamente gare diverse allo stesso campo.

### Protezioni e correzioni

- Il QR usa un token casuale salvato nel database solo come hash.
- La pagina accetta registrazioni soltanto durante le giornate del torneo.
- La prima conferma registra partita, campo effettivo, nome del refertista, data e ora.
- Il QR non sovrascrive una conferma esistente senza mostrare un avviso.
- Un amministratore può modificare o annullare campo effettivo e refertista.
- Ogni variazione viene salvata nello storico con valore precedente, valore nuovo, origine `QR` o `admin` e timestamp.

### Modello dati proposto

In `matches`:

- `scheduled_court`: campo pianificato;
- `actual_court`: campo effettivo, inizialmente vuoto;
- `status`: `scheduled`, `waiting`, `in_progress`, `completed`, `cancelled`;
- `actual_start_at`: inizio effettivo;
- `scorekeeper_source_kind`: `home`, `away`, `team`, `rank`, `person`;
- `scorekeeper_source_ref`: squadra, posizione o persona prevista;
- `scorekeeper_name`: persona presente;
- `scorekeeper_confirmed_at`: data e ora della conferma.

Nuove tabelle:

- `court_qr_tokens`: token QR per campo, stato e data di revoca;
- `match_checkins`: conferme effettuate dal QR;
- `audit_events`: storico delle modifiche operative.

### Excel di controllo

Il file esportato distingue:

- campo pianificato;
- campo effettivo;
- squadra responsabile del referto;
- refertista confermato;
- ora della conferma.

Le squadre o le posizioni `C1`, `C2`, `D3` usate come responsabili del referto non vengono trattate come persone e non generano conflitti di staff. Il foglio `QR campi` contiene un riquadro stampabile per ciascun campo, con QR, nome del campo e breve istruzione.

### Sequenza di implementazione

1. Migrazione del modello dati per campo effettivo, stato e responsabilità del referto.
2. Adeguamento dell'area Gestione e dell'editor della partita.
3. Generazione e stampa dei QR per campo.
4. Pagina pubblica di selezione plausibile e conferma del refertista.
5. Controlli atomici per campo e squadre, con storico delle variazioni.
6. Aggiornamento immediato di Agenda, Squadre, Finali ed Excel.
7. Test di cambio campo, ritardo, doppia scansione, gara già iniziata e correzione amministrativa.
