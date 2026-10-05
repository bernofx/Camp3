# Piano di sviluppo v1

## Generazione e completezza della configurazione

- La modalità di ammissione alla fase finale è una proprietà obbligatoria della categoria. Il valore predefinito è **prime 2 di ogni girone**.
- Con un solo girone vengono generate la finale tra prima e seconda; con due gironi vengono generate le semifinali incrociate e le finali 1°-2° e 3°-4°.
- Con tre gironi la modalità standard viene bloccata perché produce sei qualificate senza definire teste di serie e bye. Le alternative previste sono **tre vincitrici + migliore seconda** (solo con gironi della stessa dimensione) e **girone finale tra le tre vincitrici**.
- Dopo categorie, gironi e squadre, il sistema genera automaticamente tutti gli accoppiamenti del girone all’italiana e assegna i numeri gara. Una seconda generazione aggiunge soltanto le gare mancanti.
- Le gare generate nascono in stato `draft`. L’amministratore sceglie la gara da una lista e assegna soltanto campo, data in formato `gg/MM/aaaa`, ora e staff.
- Codici squadra, codici girone progressivi e numeri gara non vengono richiesti all’utente nei moduli ordinari.
- Le bozze non appaiono in Agenda, Squadre, Classifica o Finali finché non sono allocate.
- La configurazione è completa soltanto quando tutte le gare previste sono state generate e allocate, ogni girone contiene almeno due squadre, la modalità di ammissione è compatibile e non esistono sovrapposizioni di campo, squadra o staff.
- Il foglio Excel di controllo segnala ogni gara non allocata come errore.

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

1. scegliere una partita che non ha ancora un risultato finale;
2. confermare il campo effettivo;
3. inserire il nome del refertista presente.

Non permette di modificare risultati, squadre, orari o altre informazioni amministrative.

### Selezione della partita e cambi campo

La scansione non limita la scelta alle sole partite programmate sul campo del QR. Mostra tutte le gare della giornata che non hanno ancora un risultato finale, ordinate per plausibilità. L'orario pianificato serve per l'ordinamento, non viene usato per dedurre che una partita sia iniziata o terminata.

Ordine proposto:

1. gara già confermata sul campo scansionato e ancora senza risultato;
2. gara prevista sul campo scansionato con orario più vicino;
3. gare in ritardo previste su altri campi, ordinate dalla più vicina all'orario corrente;
4. gare previste entro i successivi 90 minuti, ordinate per orario;
5. altre gare della giornata senza risultato;
6. comando secondario **Mostra tutte** per le gare future fuori dalla finestra ordinaria.

Ogni proposta mostra numero gara, categoria, squadre, orario previsto, campo previsto e motivo della priorità, per esempio **Prevista qui**, **In ritardo di 15 min** o **In programma tra 20 min**.

Se viene scelta sul campo 5 una gara prevista sul campo 4, la pagina chiede una conferma esplicita:

> La gara 0112 era prevista sul campo 4. Confermi lo svolgimento sul campo 5?

La conferma conserva il campo pianificato e registra separatamente il campo effettivo. Agenda, tabellone e area amministrativa mostrano subito il campo effettivo, con un'indicazione del cambio.

### Regole di compatibilità

Una gara è selezionabile dal QR quando:

- non ha un risultato finale;
- non è annullata;
- appartiene alla giornata del torneo in corso, salvo l'uso del comando **Mostra tutte**.

Il sistema non prova a dedurre lo stato `in corso` dall'orario, perché non esiste un evento affidabile di inizio. L'evento certo di conclusione è l'inserimento del risultato finale, che rimuove automaticamente la gara dall'elenco QR.

Le conferme QR precedenti vengono usate come segnale operativo, senza blocchi rigidi:

- se la gara risulta già confermata su un altro campo, viene mostrato un avviso e la nuova conferma la trasferisce sul campo scansionato;
- se sul campo scansionato risulta confermata un'altra gara ancora senza risultato, viene mostrato un avviso e l'utente può confermare comunque la nuova assegnazione;
- se una squadra compare in un'altra gara senza risultato vicina nello stesso orario, viene mostrato un avviso di verifica, ma non viene imposto un blocco.

Questo permette di gestire ritardi, risultati non ancora caricati e cambi campo senza richiedere l'intervento di un amministratore. La nuova conferma diventa l'assegnazione operativa attiva; la precedente resta nello storico.

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
- `status`: `scheduled`, `completed`, `cancelled`; lo stato `completed` deriva dalla presenza di un risultato finale valido;
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

1. Migrazione del modello dati per campo effettivo, conclusione derivata dal risultato e responsabilità del referto.
2. Adeguamento dell'area Gestione e dell'editor della partita.
3. Generazione e stampa dei QR per campo.
4. Pagina pubblica di selezione plausibile e conferma del refertista.
5. Controlli atomici per campo e squadre, con storico delle variazioni.
6. Aggiornamento immediato di Agenda, Squadre, Finali ed Excel.
7. Test di cambio campo, ritardo, doppia scansione, gara già iniziata e correzione amministrativa.

## Pianificazione per campi e giornate

L’allocazione ha un tab amministrativo dedicato, **Pianifica**, separato dalle anagrafiche di **Gestione**. L’amministratore sceglie una giornata configurata come G1, G2 e così via, poi apre un campo alla volta. Le gare ancora da allocare possono essere trascinate nella corsia del campo o aggiunte con un pulsante, utile anche da telefono.

L’ordine verticale determina gli orari a partire dall’ora iniziale della giornata e dalla durata indicativa della gara. Prima del salvataggio il sistema controlla sovrapposizioni di campo, squadre, arbitri e responsabili di campo, comprese le dipendenze tra semifinali e finali. Una funzione separata sposta una gara e tutte le successive dello stesso campo di un numero di minuti positivo o negativo, così da inserire pause o assorbire ritardi.

Le gare generate restano in bozza finché non ricevono giornata, campo e orario. La configurazione è completa soltanto quando ogni gara è allocata e tutti i controlli sono superati. È disponibile anche un comando protetto dalla conferma testuale `SVUOTA` che elimina gare, risultati e collegamenti delle fasi finali, conservando categorie, gironi, squadre, campi, giornate e staff per una nuova generazione.

Le schede di gare e squadre usano una tinta leggera della categoria. Nelle viste Classifica e Fase finale la tinta viene invece applicata allo sfondo della categoria selezionata, lasciando leggibili tabelle e tabelloni.

## Composizione dei gironi e conferma del piano

La creazione di una squadra richiede soltanto nome e categoria. L’amministratore compone successivamente i gironi nel tab dedicato **Gironi**, trascinando le squadre tra “Non assegnate” e le tabelle dei gironi disponibili; un menu su ogni squadra offre la stessa funzione sui dispositivi touch. La composizione viene bloccata appena esiste una gara: per rifarla occorre usare lo svuotamento completo e rigenerare il calendario.

La Classifica diventa pubblica soltanto dopo la conferma del piano. Ogni modifica strutturale o temporale annulla la conferma; per confermare nuovamente il sistema richiede gare presenti e completamente allocate, nessuna squadra senza girone e nessun conflitto di calendario.

Nel tab **Pianifica**, il pannello di dettaglio della singola gara consente di modificare data, ora, campo, refertista, arbitro e responsabile. Il refertista resta facoltativo perché può essere registrato successivamente tramite QR o dall’amministratore.
