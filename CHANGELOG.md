# Cambiamenti

Cosa cambia **per chi usa l'app**, versione per versione. I dettagli tecnici stanno nei
messaggi dei commit; qui c'è solo ciò che si nota usandola.

I primi due numeri si alzano a mano, in `app/version.json`, quando cambia davvero cosa
l'app è. L'ultimo avanza a ogni compilazione: così ogni APK ha un nome proprio, e chiedere
«che versione hai» basta a sapere cosa sta girando. Qui c'è una voce solo per le versioni in
cui si nota qualcosa.

## 1.0.18

**Riprendendo il microfono, DuoTalk se lo riprende davvero.** Rilasciandolo si lasciava
cadere anche il regime audio della conversazione, che è ciò che tiene il microfono per noi:
riaccendendolo restava disponibile ad altre app — la tastiera se lo prendeva. Ora il regime
viene ridichiarato, insieme all'uscita audio scelta.

## 1.0.17

**Il microfono viene rilasciato quando lo spegni**: prima restava occupato — l'indicatore di
registrazione di Android restava acceso e nessun'altra app poteva usarlo finché eri nel
canale. Ora spegnerlo lo libera davvero, e riaccenderlo lo riprende.

**L'etichetta sul riquadrino** è una pastiglia come quella del video grande, non più una
fascia grigia da bordo a bordo che copriva una fetta di immagine.

## 1.0.16

**Cambiare risoluzione riapre la camera**, con mezzo secondo di nero, su tutti i telefoni
allo stesso modo. Il tentativo di evitarlo scendendo — ridurre solo ciò che esce
dall'encoder — non funziona ovunque, e riconoscere i telefoni che lo onorano richiedeva una
misura che si è rivelata inaffidabile: dava per sordo anche un telefono che ubbidiva. Un
meccanismo che non si attiva mai e non lo dice è peggio del difetto che voleva evitare.

## 1.0.14

**I comandi si spengono piano**, con un calo continuo di dieci secondi che parte subito.
Prima restavano fermi qualche secondo e poi calavano di colpo: un salto che attira l'occhio
proprio mentre si vuole guardare altro.

## 1.0.11

**Correzione urgente**: accendendo il video l'app si chiudeva. La rete di sicurezza che
tiene il riquadrino dentro i bordi scriveva la posizione dentro l'ascoltatore della
posizione stessa, che la faceva riscattare all'infinito.

## 1.0.10

**Il riquadrino non può più uscire dai bordi**, comunque ci sia arrivato: prima veniva
rimesso dentro solo alla fine di un gesto, e ogni strada che lo spostava senza passare di lì
lo lasciava fuori.

## 1.0.9

**Al ritorno della rete l'immagine resta ferma** sull'ultimo fotogramma invece di diventare
nera: il collegamento si riaccende senza smontare il video. È lo stesso motivo per cui le
altre app di videochiamata non mostrano il nero — non salvano nulla, semplicemente non
distruggono niente.

## 1.0.8

**Tenendo premuto «Video»** si scelgono le quattro risoluzioni, come già si fa con «Audio»
per l'uscita del suono. La qualità si giudica guardando, e andarla a cercare nelle
impostazioni fa perdere di vista proprio ciò che si sta valutando.

## 1.0.7

**«Tu» / «Non tu» si attenua** insieme agli altri comandi, invece di restare acceso sopra
l'immagine. Non sparisce mai del tutto: chi si sta guardando è l'unica cosa che non si
ricava osservando lo schermo.

## 1.0.6

**Le note di rilascio scorrono** e stanno dentro lo schermo. Non si chiudono più toccando
lo sfondo — era proprio quella comodità a contendere il gesto allo scorrimento, che infatti
funzionava solo a tratti.

## 1.0.5

**«Tu» / «Non tu» sempre in alto a sinistra**, anche con due video: toccando il riquadrino i
due si scambiano, ed è facile perdere il conto di chi si sta guardando. Non si attenua mai
insieme agli altri comandi.

**Audio e video accesi sono pastiglie bianche**, spenti restano scuri: a doversi vedere di
più è ciò che sta funzionando.

## 1.0.3

**Icone leggibili.** I comandi non usano più le emoji, che hanno colori propri e una forma
decisa dal produttore del telefono: videocamera e microfono, in piccolo, si distinguevano
male. Ora sono disegni a tratto bianco, uguali ovunque, con una barra diagonale quando la
funzione è spenta. L'ingranaggio delle impostazioni è diventato tre cursori: a raggi, in
piccolo, sembrava un sole.

**Niente più scheda durante un cambio di rete.** Cambiando wifi o cella ricompariva
«L'altro è nel canale», che a ogni transizione diventava un lampeggio. Ora resta il nero: il
video sta per tornare, e non è successo nulla che valga la pena raccontare.

**Il tuo video resta nel riquadrino** quando la rete cambia, invece di salire a schermo
intero e tornare indietro un istante dopo.

**Un tocco sull'immagine** nasconde i comandi, invece di limitarsi a richiamarli.

**Il pulsante «Gira» dice quale camera è accesa**: una persona sola per la frontale, più
persone per quella dietro. Prima la freccia circolare diceva solo cosa avrebbe fatto il
pulsante, e per sapere da che parte si era bisognava guardare l'immagine.

**Con un solo video a schermo intero** compare «Tu» o «Non tu»: senza riquadrino manca il
termine di paragone, e inquadrando una stanza vuota non si capisce chi si sta guardando.

**Toccando il nome dell'app** si leggono le note di questa versione e delle precedenti.

**Nelle impostazioni**: la qualità si applica al tocco senza «Salva», il server si vede ma
si modifica solo chiedendolo, e si possono nascondere del tutto i comandi invece di
attenuarli. Le due righe tecniche sotto ai pulsanti — risoluzione, banda, percorso — sono
ora facoltative e spente di default.

**Ogni compilazione ha il suo numero di versione**: l'ultimo numero avanza da sé, così
chiedere «che versione hai» basta a sapere esattamente cosa sta girando.

## 1.0.0

Prima versione completa.

**Un canale, non una chiamata.** Apri l'app e sei dentro; se c'è anche l'altro vi collegate
da soli, altrimenti resti raggiungibile e vieni avvisato appena arriva — anche dopo un
riavvio del telefono.

**Audio e video cifrati end-to-end** direttamente fra i due telefoni. Il server serve solo a
farvi trovare, e quando le vostre reti impediscono il collegamento diretto fa da ponte senza
poter leggere nulla.

**Accoppiamento con otto cifre** dettate a voce, una volta sola e per sempre. Da un telefono
già accoppiato si può rifare l'accoppiamento senza sciogliere anche dall'altra parte.

**Quattro profili di qualità**, sincronizzati fra i due telefoni: cambiandolo da uno cambia
anche all'altro.

**Il video**: chi è a schermo intero non viene mai tagliato, il riquadrino ha le proporzioni
della sua camera, è trascinabile e ridimensionabile, e resta dove l'hai messo anche dopo
aver chiuso l'app. Il tasto Indietro mette l'app nella finestrella di sistema invece di
farti uscire.
