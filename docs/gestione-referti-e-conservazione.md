# Gestione referti: ricevute, eliminazione e conservazione

## Obiettivo

Gestire i referti inviati tramite QR senza login del refertista, rendendo semplice la riconciliazione telefonica con l’amministratore e liberando lo spazio delle fotografie al termine del torneo.

Il sistema deve consentire:

- ricevuta locale dell’invio sul telefono del refertista;
- PDF completo scaricato dopo l’invio;
- ricerca amministrativa tramite codice referto;
- eliminazione definitiva di un singolo referto rifiutato;
- pulizia di tutte le fotografie quando il torneo è concluso.

## Principi

- Il risultato ufficiale è sempre quello approvato dall’amministratore sulla gara.
- Il referto QR è una proposta con fotografia di supporto.
- Senza login, il sistema può ricordare gli invii sullo stesso browser ma non riconoscere in modo affidabile una persona che cambia telefono, browser o cancella i dati locali.
- Le eliminazioni fisiche sono riservate agli amministratori e chiedono una conferma esplicita.

## 1. Codice referto numerico

Il codice restituito al termine dell’invio deve essere soltanto numerico, breve e facile da comunicare al telefono.

Formato proposto: **6 cifre**, ad esempio `482731`.

Regole:

- generazione casuale crittograficamente sicura;
- unicità verificata nel database prima del salvataggio;
- nessun significato legato a gara, data o persona;
- visualizzato con spazi per facilitarne la lettura, ad esempio `482 731`, ma memorizzato senza spazi;
- ricerca amministrativa tollerante agli spazi digitati o dettati.

Il codice non è una password e non autorizza modifiche. Serve per identificare rapidamente un invio specifico durante una telefonata.

## 2. Ricevuta e sezione “I miei invii”

Dopo l’invio riuscito, la pagina mostra una ricevuta con:

- codice numerico del referto;
- data e ora dell’invio;
- categoria e codice gara;
- nomi squadre e codici;
- giornata, campo e orario previsto;
- risultato finale e parziali proposti;
- refertista, arbitro e responsabile di campo se indicati;
- stato iniziale: `In attesa di verifica amministrativa`.

La ricevuta viene salvata nel `localStorage` del browser. Nella pagina QR compare una sezione richiudibile **I miei invii**, con l’elenco degli invii fatti da quel browser:

- data e ora;
- gara, squadre e risultato;
- codice referto;
- pulsante per scaricare di nuovo il PDF;
- pulsante per rimuovere solo la ricevuta locale.

La sezione deve indicare chiaramente che gli invii restano disponibili solo sullo stesso telefono e browser e possono sparire se vengono cancellati i dati del browser o si usa la navigazione anonima.

## 3. PDF automatico della ricevuta

Al termine di ogni invio riuscito, il browser avvia il download di un PDF completo. Il download viene avviato come conseguenza diretta del tocco su **Invia per verifica**; se il browser lo impedisce, restano disponibili i pulsanti **Scarica ricevuta PDF** nella conferma e in **I miei invii**.

Nome file:

`VolleyStars_referto_<codice-numerico>_gara-<codice-gara>.pdf`

Esempio:

`VolleyStars_referto_482731_gara-0013.pdf`

### Contenuto obbligatorio del PDF

Il PDF contiene tutti i dati, non una semplice ricevuta testuale:

1. intestazione `VolleyStars · Referto inviato per verifica`;
2. codice referto numerico ben visibile;
3. data e ora di invio;
4. categoria, gara, squadre con nomi e codici;
5. giornata, campo e orario previsto;
6. risultato e parziali inviati;
7. refertista, arbitro e responsabile di campo, se presenti;
8. fotografia originale del referto, incorporata nel PDF e ridimensionata senza tagliarla;
9. nota `Il risultato sarà ufficiale solo dopo la verifica dell’amministratore`.

Il PDF è generato nel flusso di invio usando la fotografia appena selezionata, quindi non dipende dalla sua successiva conservazione sul server. Anche dopo la pulizia finale delle foto, il PDF già scaricato dal refertista resta completo.

## 4. Riconciliazione amministrativa

Nel tab **Referti ricevuti** l’amministratore deve avere una ricerca unica per:

- codice referto numerico;
- codice gara;
- categoria;
- squadra;
- nome del refertista;
- stato del referto.

Ogni card e la finestra di consultazione devono mostrare il codice referto. Durante una telefonata, l’amministratore può quindi digitare il codice ricevuto e aprire il referto corrispondente.

### Coerenza visiva delle card referto

Ogni card del referto nell’archivio amministrativo usa uno sfondo leggermente colorato con la tinta della categoria della gara, nello stesso modo in cui le gare sono già riconoscibili nelle altre schermate dell’app.

- U13, U14, U15 e U17 mantengono i rispettivi colori configurati nella categoria;
- il colore resta tenue, così testo, stato del referto e miniatura della fotografia rimangono leggibili;
- il badge di stato (`Da verificare`, `Accettato`, `Rifiutato`, `Duplicato`) continua a usare il proprio colore semantico e non viene sostituito dal colore categoria;
- la finestra di dettaglio del referto riprende lo stesso accento categoria, senza alterare i colori di errore o di conferma.

## 5. Eliminazione definitiva di un referto rifiutato

### Disponibilità

Il pulsante **Elimina definitivamente** è disponibile solo per referti con stato `Rifiutato`.

Non deve comparire per referti in attesa, approvati o duplicati: per questi si mantiene lo storico. Un risultato approvato continua a essere correggibile dalla gara secondo le regole già presenti.

### Comportamento

La conferma mostra codice referto, gara e squadre e richiede l’accettazione esplicita dell’operazione.

L’operazione deve:

1. eliminare la fotografia dallo storage;
2. eliminare il record del referto dal database;
3. mantenere, se necessario, soltanto un evento tecnico di audit senza foto, dati personali o risultato proposto.

Se l’eliminazione della fotografia fallisce, il record non viene eliminato e l’amministratore riceve un errore riprovabile.

## 6. Pulizia fotografica al termine del torneo

### Comando

Nel tab Referti, solo quando lo stato torneo è `concluso`, compare il comando:

**Elimina tutte le fotografie dei referti**

Non deve essere disponibile in pianificazione, durante il torneo o dopo una sua riapertura.

### Effetto

Il comando elimina fisicamente tutte le fotografie dei referti, a prescindere dal loro stato: in attesa, accettati, rifiutati e duplicati.

Mantiene invece lo storico leggero:

- codice referto;
- gara, categoria, squadre e programmazione;
- risultati e parziali proposti;
- staff indicato;
- stato, note e date di verifica;
- indicazione `Fotografia eliminata al termine del torneo`.

La conferma richiede di digitare `ELIMINA FOTO`, mostra quante fotografie saranno interessate e restituisce un riepilogo di file eliminati, file non eliminati e spazio liberato quando disponibile.

Se alcuni file non possono essere rimossi, i relativi record sono marcati `foto da pulire`; l’operazione può essere ripetuta. Non deve essere dichiarata completa se restano fotografie.

## 7. Dati e API necessari

### Invio

- Il codice pubblico passa da alfanumerico a numerico di 6 cifre.
- La risposta dell’API include un oggetto `receipt` completo, usato sia dalla pagina sia dal PDF.
- La fotografia e i dati della gara devono essere disponibili al client prima del download PDF.

### Archivio

- L’API amministrativa accetta una ricerca `q` e normalizza gli spazi del codice numerico.
- Restituisce sempre il codice referto nelle card e nella finestra di dettaglio.

### Stato della fotografia

Aggiungere o rendere espliciti i campi:

- `photoState`: `available`, `purged`, `cleanup_failed`;
- `photoPurgedAt`;
- `photoPurgedBy`.

Quando `photoState` non è `available`, la miniatura e il link non vengono mostrati.

### Azioni amministrative

- `deleteRejected`: elimina definitivamente un referto, dopo verifica server-side dello stato `rejected`;
- `purgePhotos`: elimina tutte le foto, disponibile solo a torneo concluso e solo dopo conferma testuale.

## 8. Criteri di accettazione

- Il codice referto contiene solo sei cifre.
- Il refertista vede, salva localmente e può riscaricare la ricevuta dal medesimo browser.
- Il PDF scaricato include fotografia, gara, squadre, staff, risultato e parziali inviati.
- L’amministratore trova un referto digitando il codice numerico.
- Solo un referto rifiutato può essere eliminato definitivamente.
- A torneo concluso è possibile eliminare tutte le fotografie mantenendo lo storico leggero.
- Un refertista senza login non può modificare risultati né consultare invii di altri dispositivi.
