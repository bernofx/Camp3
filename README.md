# VolleyStars 2026

PWA mobile installabile su Android per agenda, risultati e informazioni dei volontari.

## Avvio locale

Serve il progetto da questa cartella con un server HTTP statico, quindi apri l'indirizzo mostrato dal server. L'app parte in ambiente `TEST`.

## Configurazioni

- `?env=test` usa la copia `Risultati VolleyStars 2026 - TEST APP`.
- `?env=prod` usa il foglio originale.

Gli ID e i link sono centralizzati in `config.js`. Il passaggio finale a produzione può essere fatto cambiando `activeName` o mantenendo il parametro `?env=prod` nel link distribuito.

## Dati live

L'app legge i quattro tab attraverso l'esportazione CSV di Google Visualization. Il foglio deve consentire la lettura agli utenti dell'app. Se l'esportazione non è disponibile, il calendario incorporato continua a funzionare e l'app segnala chiaramente che i risultati non sono sincronizzati.

## Installazione su Android

Da Chrome: menu ⋮ → **Aggiungi a schermata Home** / **Installa app**. Per rendere disponibile l'installazione a tutti, pubblicare questa cartella su HTTPS.

## Origine dei dati

- programma ufficiale delle gare per date, orari e campi;
- foglio refertisti/assistenti per le assegnazioni;
- Google Sheet per risultati e set.

Gli orari del campo 5 di venerdì usano il programma ufficiale: 18:00, 19:10 e 20:20.
