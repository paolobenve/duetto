# Cambiamenti

Cosa cambia **per chi usa l'app**, versione per versione. I dettagli tecnici stanno nei
messaggi dei commit; qui c'è solo ciò che si nota usandola.

I primi due numeri si alzano a mano, in `app/version.json`, quando cambia davvero cosa
l'app è. L'ultimo avanza a ogni compilazione: così ogni APK ha un nome proprio, e chiedere
«che versione hai» basta a sapere cosa sta girando. Qui c'è una voce solo per le versioni in
cui si nota qualcosa.

## 1.1.30

**I tasti del volume ora regolano la voce dell'altro.** Su certi telefoni — il Motorola
Edge 50 Fusion fra questi — premerli non cambiava nulla: il suono della conversazione esce
dal volume "chiamata", mentre i tasti agivano su quello multimedia, e chi ascoltava se lo
teneva com'era, spesso altissimo. Su altri telefoni funzionava già, perché Android tirava a
indovinare bene; ora glielo diciamo, invece di sperare.

## 1.1.29

**L'app si chiama Duetto.** Cambia il nome dappertutto: l'icona, la notifica fissa, gli
avvisi, l'indirizzo del server. Per Android però non è la stessa app con un nome nuovo, è
un'app diversa: la vecchia DuoTalk resta installata finché non la togli a mano, e Duetto
parte vuota. Vanno rifatti l'abbinamento — dettandosi di nuovo il codice a voce o di
persona — e le impostazioni, comprese quelle di sistema (batteria senza limiti, avvio
automatico), perché Android le tiene legate all'app e non le trasferisce.

## 1.0.28

**L'avvio automatico ora dice la verità.** La spunta si accendeva solo perché avevi aperto
la schermata di sistema, anche senza toccare niente: dichiarava «a posto» senza saperlo.
Quell'autorizzazione nessuna app può leggerla — è una schermata del produttore — ma si può
sapere se ha funzionato: l'app si annota quando riparte da sola dopo un riavvio, e la spunta
si accende solo allora. Finché non riavvii il telefono resta aperta, ed è onesto.

## 1.0.27

**Tolti anche i campi del relay** dalle impostazioni avanzate: indirizzo e credenziali li
manda il server nel messaggio di ingresso, quindi digitarli sul telefono non serviva più. Ne
resta una sola da mantenere, sul server, e cambiando la password non si tocca nessun
telefono.

## 1.0.26

**Tolto l'access token.** Era un campo nelle impostazioni avanzate e un controllo sul
server, pensato contro gli abusi; sul server era già disattivo da tempo, e la protezione
vera è altrove — l'identificativo della coppia nasce da un codice di otto cifre e nulla di
ciò che passa dal server è leggibile. Una impostazione in meno da capire.

## 1.0.25

**L'app pesa la metà e si installa molto più in fretta.** L'APK conteneva le librerie per
quattro architetture: due vere e due che servono solo agli emulatori da PC — 46 MB su 88 che
il telefono doveva comunque verificare e scompattare, ed erano i trenta secondi di «app in
preparazione». Ora ci sono solo quelle dei telefoni.

## 1.0.24

**Tolta l'alta fedeltà**: non faceva niente. In react-native-webrtc soppressione del rumore
e livellamento si configurano una volta per tutta l'app, non sulla singola presa audio, e i
vincoli passati al microfono su Android vengono ignorati. L'interruttore riapriva davvero il
microfono, ma con gli stessi identici parametri. Resta **Voce più ricca**, che si misura e
si sente.

## 1.0.23

**Spegnendo «voce più ricca» l'audio torna davvero giù.** Prima si toglieva il tetto invece
di riportarlo al valore normale, e togliere un limite non fa scendere nessuno: restava a 64
kbit/s come se l'opzione non avesse ritorno.

## 1.0.22

**Le opzioni audio valgono per tutti e due i telefoni**, come già la risoluzione.
Cambiandole da uno cambiano anche all'altro — ed è necessario: la voce che senti la manda
lui, quindi alzarla solo dalla tua parte non ti fa sentire nessuna differenza.

## 1.0.21

**Correzione**: attivando l'alta fedeltà il microfono si riapriva muto e l'altro smetteva di
sentirti. Si leggeva se era acceso dopo averlo fermato, e fermarlo lo spegne.

**La riga tecnica mostra anche l'audio in uscita**, così «voce più ricca» si può verificare
invece di crederci: da spenta sta intorno ai 30 kbit/s, da accesa sale.

**Le impostazioni sono divise per sezione**: le opzioni della schermata non stanno più sotto
il titolo «Audio», dove sembravano riguardare il suono.

## 1.0.20

**Un'opzione per l'audio**, spenta di default, nelle impostazioni.

**Voce più ricca** raddoppia il tetto dell'audio, da circa 32 a 64 kbit/s: su Opus la
differenza si sente, la voce smette di suonare telefonica. Costa 4 kB/s in più per
direzione, niente rispetto al video.

## 1.0.19

**Il microfono torna a restare preso** finché sei nel canale, muto compreso. Rilasciarlo
quando lo spegni sembrava giusto — lo lasciava usare alle altre app — ma riprendendolo il
sistema non restituisce la precedenza, e la dettatura della tastiera se lo prendeva anche a
microfono acceso. Su Android l'esclusiva non si può imporre: una presa continua è l'unica
cosa che le somiglia.

## 1.0.18

**Riprendendo il microfono, Duetto se lo riprende davvero.** Rilasciandolo si lasciava
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
