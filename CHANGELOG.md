# Cambiamenti

Cosa cambia **per chi usa l'app**, versione per versione. I dettagli tecnici stanno nei
messaggi dei commit; qui c'è solo ciò che si nota usandola.

I primi due numeri si alzano a mano, in `app/version.json`, quando cambia davvero cosa
l'app è. L'ultimo avanza a ogni compilazione: così ogni APK ha un nome proprio, e chiedere
«che versione hai» basta a sapere cosa sta girando. Qui c'è una voce solo per le versioni in
cui si nota qualcosa.

## 1.1.99

**I volumi si leggono anche quando ha il video solo lui.** Prima, con il suo video a tutto
schermo, sparivano insieme il riepilogo al centro (coperto) e il riquadrino (che non c'è): con
le righe tecniche accese compare una seconda pastiglia in alto, «Tu», con la tua uscita audio e
il tuo volume accanto alla sua.

**Nel riepilogo ogni volume ha il segno di chi ascolta**: il suo davanti a «ti sente», il tuo
dopo «lo senti». Prima ce n'era uno solo in testa alla riga, e sembrava valere per tutti e due.

## 1.1.98

**Una notizia sola.** «È di nuovo raggiungibile» compariva sia nella tendina di Android sia
nel riquadro dentro l'app: adesso solo nella tendina.

**Le righe tecniche non escono più dallo schermo.** «andata e ritorno 42 ms» è diventato
«latenza a/r 42 ms», e quella riga si rimpicciolisce da sola quando serve, come già faceva
quella della risoluzione.

**Il volume che viaggia è giusto dal primo istante.** La sessione nasceva annunciando 100% e
si correggeva un attimo dopo: se quella correzione si perdeva, dall'altra parte restava un
numero mai stato vero.

## 1.1.97

**Sai a che volume l'altro ti sente.** Con le righe tecniche accese, ogni pastiglia dice come
suona il telefono di cui porta il nome: accanto a «Non tu» da dove esce il suo suono e a che
volume lui sta ascoltando **te**, accanto a «Tu» la tua uscita e il tuo volume. Il numero che
conta è il suo: era l'unica cosa che non potevi sapere in nessun modo, e spiega da sola i «non
ti sento» — se ti ha al 25%, adesso si vede. Il dato viaggia da sé e si aggiorna appena lui
tocca i tasti del volume.

**Se l'altro non ha il video, nel riquadrino c'è il tuo.** Prima, accendendo il video da solo,
non restava niente a dire che dall'altra parte c'era qualcuno: ora il posto grande tiene il
riepilogo di com'è messo lui, e il tuo video sta nel riquadrino.

**Il rullo di tamburi lo senti anche tu.** Bussando all'altro, il suono suona anche qui: è il
riscontro che l'avviso è partito davvero.

**La latenza tra le righe tecniche.** «Andata e ritorno 42 ms»: quanto ci mette la voce a fare
il giro.

**Le notifiche parlano tutte allo stesso modo, e non invecchiano.** Il nome del collegamento sta
nel titolo — «Duetto · Casa» — e non più a volte lì e a volte in mezzo al testo. «È di nuovo
raggiungibile» sparisce appena risparisce; «ti aspetta nel canale» sparisce quando esce dal
canale; e ogni notizia si toglie comunque da sola dopo dieci minuti, invece di restare a
raccontare una cosa di stamattina. La riga fissa si riscrive ogni minuto: se un aggiornamento
va perso — capita, il sistema può rifiutarlo — non resta più appeso un «senza collegamento al
server» a collegamento tornato.

**I riquadri dentro l'app sbiadiscono.** Dopo dieci secondi se ne vanno da soli; toccarli li
toglie subito, come prima.

## 1.1.95

**La presenza sopravvive al telefono che mette via l'app.** Su certi telefoni — un Motorola
recente, per esempio — l'app viene smantellata **tre secondi** dopo essere finita in secondo
piano, senza che nessuno l'abbia chiusa: da lì l'altro ti vedeva «non raggiungibile» finché
non riaprivi Duetto. Ora in quel momento la presenza passa all'ascolto senza interfaccia,
che riapre la connessione da solo, e il servizio non si spegne più insieme alla finestra.

**Ogni collegamento ricorda le sue impostazioni.** Nome con cui ti presenti, qualità del
video, voce più ricca, righe tecniche, sfumatura dei comandi, suono e vibrazione
dell'avviso, uscita audio, volume della voce dell'altro, camera: cambiando collegamento
tornano quelle di quella persona. Prima erano una sola per tutta l'app, e con la seconda
persona ti ritrovavi addosso le scelte fatte per la prima. La camera, poi, non era ricordata
affatto: ogni volta si ripartiva dalla frontale.

**Uscendo, il diario parte prima di chiudere.** Premendo «Esci» compare «Sto uscendo, un
momento…» per una frazione di secondo: è il tempo di mandare all'altro telefono le ultime
righe, finché la connessione è ancora aperta. Prima restavano lì fino al collegamento
successivo, e se l'app moriva nel frattempo raccontavano una storia che non arrivava a
nessuno.

**L'ingrandimento del video non torna più indietro come un elastico.** Il numero
dell'ingrandimento lo teneva il sistema e noi ne avevamo una copia che smetteva di
aggiornarsi: lo schermo ingrandiva, il codice credeva di no, e al rilascio riportava tutto a
schermo pieno. Ora il pizzico riparte da dove sei, il rilascio tiene, e il doppio tocco fa
avanti e indietro. E l'ingrandimento non si azzera più quando l'immagine dell'altro si
interrompe e ricompare.

**Il diario racconta cosa fate.** Microfono, camera, qualità, avvisi, ingrandimento, uscite:
le tue azioni e le sue, ciascuna con la sua riga, più una riga d'apertura che dice con che
impostazioni quel collegamento è partito. Serve a ricostruire dopo cos'è successo, e a
capire cosa vuol dire non aver cambiato niente.

**Chi si stacca apposta lo si vede.** Il server distingue chi saluta da chi sparisce, e per
chi resta la differenza è tutta: da un tunnel si esce, da una scelta no. Se l'altro sceglie
«esci e renditi non disponibile», ora leggi «si è reso non raggiungibile: ha staccato Duetto
di proposito», invece di un «non raggiungibile» che sembra un guasto da aspettare.

**Tenendo premuto «Esci» si sceglie come uscire.** Il tocco fa quello di sempre — chiudi il
canale ma resti raggiungibile, e il suo avviso ti arriva. La pressione lunga aggiunge
l'altra: *esci e renditi non disponibile*, che stacca Duetto del tutto — niente
connessione, niente notifica, niente avvisi, e all'altro risulti non raggiungibile, che è
la verità. Dura finché non riapri l'app: riaprirla è già dire «ci sono».

**Dalla schermata «Collega i due telefoni» si può tornare indietro.** Chi ci arrivava per
aggiungere un collegamento non aveva nessun modo di cambiare idea: il tasto Indietro
chiudeva l'app, e l'unica via era «Cambia server», che promette tutt'altro. Ora c'è
«Annulla», e il tasto Indietro riporta alle impostazioni.

**Se l'app di uno dei due muore, l'altro lo viene a sapere.** Nessuno può avvisare mentre
muore — un processo ucciso dal sistema non riceve nessun preavviso — ma riaccendendosi il
telefono si ricorda com'è andata, e allora lo dice: «Anna è sparita alle 23:04: il telefono
era senza memoria. Adesso è tornata». Arriva come notizia silenziosa, non come avviso: non
suona e non vibra. E se l'assenza è durata più di un minuto senza essere una morte, il
ritorno viene annunciato lo stesso, qualche secondo dopo — giusto il tempo di lasciar
passare avanti il racconto, quando c'è. La stessa frase compare anche dentro l'app, in un
cartellino in alto che va via toccandolo: la tendina delle notifiche non la apre chi sta
già guardando lo schermo.

**L'app pesa 28 MB invece di 43.** Dentro c'erano le librerie native per due architetture:
arm64, che è ogni telefono degli ultimi dieci anni, e quella a 32 bit, che non usa più
nessuno. Tolta la seconda, il file da passare all'altra persona è quasi la metà, si installa
prima, e sul telefono c'è meno codice da tenere in memoria.

**Nelle impostazioni c'è scritto da dove vengono i suoni.** Sono registrazioni di altri, e
chi le ha fatte va nominato: la fanfara lo chiede la sua licenza (CC BY-NC 4.0), gli altri
tre no — ma citare solo quello obbligatorio sarebbe una cortesia a metà.

**Cinque suoni per richiamare, e sono registrazioni vere**: tamburi, batteria, fanfara,
strombazzata, canto del gallo. Solo la strombazzata resta fatta in casa — un clacson sono
letteralmente due note con le armoniche dispari, e viene meglio così che cercandone una
registrazione pulita. Gli altri quattro erano sintetizzati e si sentiva: un «chicchirichì»
costruito resta una macchietta, una batteria costruita è un tonfo senza pelle.

**Tenendo premuto «Avvisa», quando siete tutti e due nel canale, puoi richiamarlo con un
suono.** Serve per quando c'è ma non risponde: si è addormentato, o ha lasciato il telefono
dall'altra parte della stanza e a voce non lo raggiungi. Cinque suoni, ben diversi fra loro —
**tamburi**, **batteria**, **fanfara**, **strombazzata**, **canto del gallo** — e suonano sul suo telefono al volume
della sveglia, non a quello della conversazione: si sentono anche se la voce era bassa.
Viaggiano dentro la busta cifrata della conversazione, quindi il server non sa nemmeno che è
successo.

**Nel canale, i tasti del volume regolano la voce dell'altro.** Non il volume del telefono:
quanto Duetto alza quella voce prima di suonarla, cosa che nessun telefono può ignorare.
Premendo compare «Voce dell'altro 75%» al posto della barretta di sistema. Lo stesso comando
c'è anche a mano, tenendo premuto «Audio».

Il motivo è nei dati: su un Motorola Edge 50 Fusion i tasti arrivavano al posto giusto e
l'indice del volume di chiamata scendeva da 4/8 a 2/8 — il sistema si muoveva eccome — e
all'orecchio non cambiava niente. Il telefono registra il numero e lo ignora, e da fuori un
volume che scende senza effetto è indistinguibile da uno che scende davvero. Il volume di
sistema resta dov'è e si regola fuori dal canale, come ogni altro volume.

**Il diario dice di che telefono è**: marca, modello e versione di Android, sulla riga
d'avvio. Leggendo il diario di qualcun altro è la prima domanda, perché metà del
comportamento dell'audio dipende da quello.

**Le barre di sistema, sopra e sotto, sono nere come l'app.** Su un telefono in tema chiaro
la barra di stato veniva grigia e quella dei tasti bianca con i tasti scuri: due fasce
chiare ai bordi che spezzavano l'immagine proprio dove dovrebbe continuare. Ora il fondo è
lo stesso nero dell'app e i simboli sono chiari, tema del telefono o no.

**Il simbolo della videocamera ha gli angoli tondi come il suo pulsante.** Erano appena
smussati, e a video acceso — dove il disegno è scuro su una pastiglia chiara e riempie quasi
tutto — quel rettangolo quasi retto faceva sembrare che fosse il pulsante ad avere gli
spigoli vivi, diverso da tutti gli altri della fila.

**Il diario registra anche come sta il suono**: da che modo passa l'audio del telefono, a
che punto stanno il volume della voce e quello del multimedia, se il suono esce dal
vivavoce, e se i tasti laterali comandano la voce. Su un telefono
lontano quelle tre cose non si possono guardare, e senza di esse un «non si sente» resta
un'ipotesi.

**Le righe tecniche sotto ai pulsanti si leggono anche attenuate.** Erano di un grigio da
nota a piè di pagina: appena i comandi cominciavano a farsi da parte sparivano, perché
l'attenuazione moltiplica quel poco contrasto che c'era. Ora sono più chiare, con un'ombra
sotto che le stacca dall'immagine.

**I comandi che si fanno da parte adesso hanno tre modi.** «Poco sfumati» è quello di sempre
(40%, restano leggibili), «molto sfumati» li riduce a un'ombra (15%), «nascosti» li toglie
del tutto. In tutti e tre restano premibili e un tocco ovunque li richiama: cambia solo
quanta immagine lasciano vedere. Chi aveva acceso «Nascondi i comandi» si ritrova su
«nascosti», senza riscegliere niente.

**Con il video acceso la voce si fa ricca da sé.** L'audio migliore costa 4 kB/s per
direzione: accanto a mezzo megabit di video non si notano, e rinunciare alla voce buona per
risparmiarli è un cattivo affare. Ora, quando il video supera i 320 kbit/s, il tetto
dell'audio si alza da solo; torna all'impostazione quando il video scende sotto i 160 o si
spegne. L'impostazione non viene toccata, e se l'hai accesa tu resta accesa comunque.

**Scartare l'app dai recenti non ti rende più irraggiungibile.** Era una scorciatoia che
sembrava ragionevole — chi butta via l'app vuole chiuderla — ma i diari di tre telefoni
diversi raccontano un'altra storia: dopo quel gesto il processo restava lì senza servizio, e
mezz'ora dopo Android lo riciclava per far posto ad altro. Chi aveva scartato l'app solo per
riordinare i recenti si ritrovava irraggiungibile senza averlo chiesto e senza modo di
accorgersene. Per non essere raggiungibili c'è «esci e renditi non disponibile», che lo dice
con parole sue — e quando quella scorciatoia è stata scritta non esisteva ancora.

**Basta con «si è staccato» detto di chi non si è staccato affatto.** Il saluto che dice
all'altro «me ne vado di proposito» partiva a ogni chiusura della connessione — anche quando
si chiudeva per riaprirla un istante dopo, cosa che succede ogni volta che riprendi in mano
il telefono e l'app subentra all'ascolto senza interfaccia. Chi guardava leggeva che l'altro
aveva staccato apposta, e smetteva di aspettarlo. Ora il saluto parte solo quando è vero:
«esci e renditi non disponibile», o lo scioglimento di un collegamento. Tutto il resto è una
caduta, dopo la quale è normale tornare.

**Con la camera posteriore l'immagine non è più rovesciata.** Lo specchio ha senso per la
camera frontale — chi si guarda si aspetta lo specchio, ed è così che ci si sistema i
capelli — ma inquadrando il mondo è sbagliato e basta: le scritte si leggono al contrario e
ci si muove dalla parte opposta a quella che si vede. L'altro riceveva comunque l'immagine
giusta: lo specchio era solo nell'anteprima.

**Anche le notifiche hanno l'icona nuova.** Erano rimaste con un simbolo di sistema, uguale
a quello di cento altre app.

**L'icona dell'app.** Due cornette di telefono, una blu e una verde, una di fronte all'altra
e unite dal filo attorcigliato. Al posto del robottino del modello, che era rimasto lì dal
primo giorno.

**Se i comandi sono spariti del tutto, non si premono.** Con «nascosti» restavano premibili
anche invisibili, e un dito appoggiato dove prima c'era un pulsante spegneva il video o
usciva dal canale senza che niente lo annunciasse. Ora il primo tocco li richiama e basta:
poi si decide guardando. Sbiaditi al 15% invece si premono, che si vedono ancora.

**Con più collegamenti, l'avviso dice su quale è arrivato.** «Duetto · Casa» invece di
«Duetto»: chi ti cerca è uno solo dei due o tre che conosci, e prima per sapere quale
bisognava aprire l'app.

**Nella finestrella, aspettando l'altro, ora c'è una faccia e una parola.** Premendo
Indietro l'app resta in un rettangolo grande come un pollice, e lì il riepilogo «Sei nel
canale…» non ci stava: usciva dai bordi e si leggeva mezza parola. Chi ha premuto Indietro
non sta leggendo, sta tenendo d'occhio.

**Se i due telefoni hanno versioni diverse di Duetto, le righe tecniche lo dicono.** In
giallo, sotto ai pulsanti: «Versioni diverse: qui 1.1.65, di là 1.1.55». È la spiegazione di
metà delle stranezze — una cosa che qui c'è e lì no, un pulsante che si comporta in due modi
— e prima bisognava chiederselo a voce. Se le versioni sono uguali non compare niente. Chi
ha una versione più vecchia di questa non dichiara la sua: allora si legge «di là una più
vecchia», che è comunque la cosa che conta.

**Ogni collegamento ha il suo diario, separato dagli altri.** Con più collegamenti
configurati finiva tutto in un file solo: righe identiche fra loro, di telefoni diversi, e
nessun modo di separarle dopo, perché le righe non dicono di chi sono. Ora il file porta il
nome che hai dato al collegamento. Anche il conto delle righe già spedite è per
collegamento: prima era uno solo, e quello che avevi mandato a uno risultava mandato pure
all'altro, che quelle righe non le avrebbe viste mai.

**Il diario non si perde più quando l'altro sta ascoltando senza app aperta.** Dopo un
riavvio del telefono — o dopo che il sistema ha ucciso l'app e la presenza è ripartita da
sé — l'altro è raggiungibile ma senza interfaccia, e lì il diario che gli mandavi arrivava a
un pezzo di app che non lo guardava: chi l'aveva mandato aveva già segnato quelle righe come
spedite, e sparivano. Erano proprio le righe che raccontano perché quel telefono era morto.
Ora vengono raccolte anche lì, e lì arriva anche la notizia della morte.

**Il diario passa all'altro telefono ogni cinque minuti** invece che ogni ora: un diario che
arriva subito racconta cos'è appena successo dall'altra parte, uno che arriva con un'ora di
ritardo racconta una storia vecchia.

**Quando l'app sparisce, adesso resta scritto perché.** Android sa sempre come è morto un
processo — memoria finita, errore, blocco, arresto forzato, o una decisione del gestore
batteria del produttore — ma non lo dice a nessuno finché non glielo si chiede. Ora Duetto
glielo chiede a ogni avvio e mette la risposta nel diario, con quanta memoria occupava e
quanto contava agli occhi del sistema in quel momento. E siccome il diario i due telefoni se
lo scambiano, si scopre anche perché è sparita sul telefono dell'altro, senza cavi e senza
doverglielo chiedere.

**Se il sistema uccide l'app, la presenza torna da sé.** Quando Android chiude Duetto per
fare posto ad altro, il servizio ripartiva mostrando la notifica ma senza connessione: una
presenza dichiarata e inesistente. Ora in quel caso riparte anche il motore che tiene la
connessione, per la stessa strada che si usa dopo il riavvio del telefono. Se invece sei tu
a togliere l'app dai recenti, resta chiusa: quella è una decisione, non un incidente.

**A ogni collegamento puoi dare un nome.** Non è il nome della persona — quello se lo dà
lei, o non ce l'ha — è il nome del filo che vi unisce: «Casa», «Ufficio». Con più
collegamenti in elenco diventavano tutti «Senza nome» e non si distinguevano; ora la matita
accanto a ciascuno apre il campo dove scriverlo. Il nome compare sulla pastiglia in alto, al
posto di «Duetto», e in testa alla notifica fissa, così sai sempre in quale collegamento
sei. Resta su questo telefono: l'altro non lo vede e non lo saprà mai. Nel riquadro di ogni
collegamento c'è anche il server su cui è stato fatto.

**Un telefono può tenere più collegamenti e passare dall'uno all'altro.** Prima accoppiarsi
con qualcun altro voleva dire buttare via il collegamento di prima, e per tornare indietro
rifare tutto da capo — con l'altra persona presente, il telefono in mano e il codice da
dettarsi a voce. Ora ogni accoppiamento resta: nelle impostazioni c'è l'elenco, quello in
uso è il primo e ha il bordo acceso, e toccarne un altro ci passa. All'avvio si riprende
sempre l'ultimo usato, quindi chi ne ha uno solo non si accorge di niente.

Ogni collegamento si ricorda anche il server su cui è nato, e se lo porta dietro quando lo
si riprende. Il nome dell'altro si aggiorna da sé a ogni ingresso: in un elenco è l'unica
cosa che distingue un collegamento dall'altro.

**La schermata d'attesa ora dice se l'altro è in attesa o non è raggiungibile.** Prima
diceva soltanto «non c'è ancora», che sono due cose molto diverse: se è in attesa non è nel
canale ma l'avviso gli arriva; se non è raggiungibile il suo telefono al server non è
collegato, e l'avviso non ha dove andare — quindi non ti si propone nemmeno di bussare.

**Lo stato si rinfresca da sé**: ogni minuto nel primo quarto d'ora, poi ogni cinque, e
subito ogni volta che riaccendi lo schermo. Serve perché la caduta di chi sta solo in
attesa il server la scopre con comodo — il suo battito è di quattro minuti, ed è così
apposta per non tenere sveglia la radio tutta la notte — e fino ad allora la riga direbbe
«in attesa» di qualcuno che non c'è più.

**Anche la notifica fissa lo dice**, e «In ascolto» è diventato «In attesa»: «In attesa
tutti e due» quando ci siete entrambi e nessuno è ancora entrato, «In attesa · Anna è nel
canale» quando ti sta aspettando dentro, «Sei nel canale · Anna in attesa» quando sei
entrato tu e lei no, «Nel canale con Anna» quando ci siete tutti e due, e «non
raggiungibile» al posto dell'attesa quando il suo telefono non è collegato. Vale anche per
la notifica che compare da sola dopo un riavvio del telefono, che è l'unica cosa che parla
finché non apri l'app.

**Nel riquadro «Non tu» ora si vede come ti sta ascoltando l'altro.** Accanto alla scritta
c'è il segno della sua uscita audio — vivavoce, orecchio, cuffie, bluetooth — e se ha il
microfono spento il segno è sbarrato. Sono le due cose che durante una conversazione ci si
chiede a voce di continuo, «mi senti?», «sei in vivavoce?», e che il telefono sa già. Quando
non c'è nessun video, il segno sta nel riepilogo al centro, sopra la riga dell'audio.

**Il pulsante «Avvisa» resta acceso anche quando siete tutti e due nel canale.** Prima si
spegneva, con l'idea che lì non ci fosse più nulla da avvisare; ma il pulsante lì è
premibile eccome, ed è anzi il caso in cui serve di più — l'altro c'è e non risponde.
Sembrava guasto un pulsante che funzionava.

**Il riquadrino non salta più appena lo si prende.** All'inizio del movimento schizzava
altrove, e solo dopo seguiva il dito: al primo spostamento si portava dietro il residuo dei
tocchi precedenti. Ora il conto parte da dove il dito si è posato davvero. Lo stesso valeva
per la maniglia che lo ridimensiona.

## 1.1.38

**La vibrazione dell'avviso ora funziona anche se il telefono non vibra per le altre
notifiche.** Era il caso che conta di più: chi tiene il telefono muto e fermo per tutto il
resto, e vuole sentire solo questo. La vibrazione stava nel canale di notifica, e da lì
un'impostazione di sistema la può spegnere; ora la fa l'app, dichiarandola per quello che
è — qualcuno che ti sta cercando, non una notifica qualunque.

**E l'avviso si sente anche mentre siete già collegati.** Prima restava muto proprio nel
momento in cui serve di più — l'altro c'è ma non risponde — perché durante una
conversazione il telefono silenzia le notifiche, come fa quando sei al telefono. Ora il
suono passa dalla via della conversazione, quella dell'avviso di chiamata in attesa.

## 1.1.37

**Il video dell'altro compariva a fatica, e a volte solo riavviando l'app.** Colpa di una
modifica di due versioni fa: da quando il microfono si apre solo all'arrivo dell'altro,
fra il controllo «la connessione c'è già?» e la sua creazione passava mezzo secondo, e in
quel mezzo secondo ne nascevano due. La seconda vinceva, la prima restava viva a ricevere
un video che nessuno guardava più. Ora chi arriva mentre la connessione si sta creando
aspetta quella, invece di farne un'altra.

## 1.1.35

**L'app tiene un diario dei consumi.** Una riga ogni cinque minuti — livello della batteria,
schermo acceso o spento, rete, e cosa stava facendo Duetto — per capire quanto costa
davvero tenerla in ascolto, invece di discuterne. Ogni telefono manda il proprio diario
all'altro una volta all'ora, dentro la stessa busta cifrata di tutto il resto: così
collegandone uno solo a un computer si leggono tutti e due. Nel diario non c'è nulla di
personale: numeri della batteria e stato dell'app, nessun contenuto di quello che vi dite.

## 1.1.33

**Il promemoria «Sei nel canale, tocca Avvisa per farglielo sapere» si vede anche con la
camera accesa.** Prima stava solo al posto del video: accendendo la propria camera spariva, e restava la propria
immagine senza niente che spiegasse perché non succedeva nulla. Ora compare in
sovrimpressione, senza la faccia dell'altro — sopra l'immagine peserebbe, e chi guarda sa
già chi sta aspettando — e si attenua insieme ai comandi, perché è un promemoria e non un
allarme.

## 1.1.32

**Si sceglie come deve farsi sentire l'avviso.** Nelle impostazioni, sotto «Quando l'altro
ti avvisa»: vibrazione — come decide il telefono, sempre, mai — e suono — quello di
notifica, nessuno, oppure uno scelto fra quelli del telefono. Un suono diverso dagli altri
fa capire chi è senza guardare. Vale per gli avvisi che arrivi tu: quello che sente l'altro
lo decide lui.

**"Avvisa" risponde al dito.** Premendolo la campanella si mette a suonare — inclinata, con
le onde ai lati — e il pulsante perde l'azzurro per un attimo, per poi riaccendersi: prima
cambiava solo la scritta sotto, l'azzurro restava spento due secondi buoni, e bussando di
nuovo in quell'intervallo non tornava affatto — sembrava un pulsante guastatosi in mano. Il
segno parte al tocco, senza aspettare la conferma del server, che può tardare proprio
quando la rete va piano.

**Quando l'altro esce, il tuo video torna subito a schermo intero.** Restava piccolo, in
attesa di un video che non sarebbe più arrivato: uscendo, il suo stato — microfono e camera
accesi — rimaneva scritto da qualche parte come se fosse ancora lì. Ora si distingue chi se
n'è andato da chi è caduto: a chi cade il posto resta per sei secondi, che è il tempo di un
cambio di rete, così non si vede il proprio video salire a schermo intero e tornare indietro
per niente. Lo dice il server, che sa se il telefono ha salutato o è sparito.

**"Gira" si accende quando riprende la camera frontale.** Pastiglia bianca con la frontale,
spenta con quella dietro: la sola differenza fra le due sagome — una persona o più — si
coglie leggendola, mentre il pieno o il vuoto si vede da lontano.

**Nella schermata dell'accoppiamento, accanto a «Cambia server» c'è scritto qual è.** Era
l'unica cosa che si voleva sapere prima di toccare quella riga, e bisognava entrarci per
scoprirlo.

## 1.1.31

**Aspettare costa molto meno.** Entrando nel canale il microfono non si apre più subito:
si apre quando dall'altra parte arriva davvero qualcuno. Chi entra per primo può aspettare
a lungo, e in quell'attesa il telefono registrava per nessuno — con l'indicatore di
ascolto acceso, per giunta. Insieme a questa, una modifica sul server: il colpetto che
tiene viva la connessione era ogni 30 secondi anche di notte, cioè 120 risvegli della
radio ogni ora per non fare niente, e ora si dirada finché si sta soltanto in ascolto. Si
infittisce da solo quando si entra nel canale, e quando qualcuno bussa l'altro viene
interrogato all'istante: se non c'è più, lo si scopre subito invece di restare davanti a
un "avvisato" rivolto a nessuno.

**"Gira" si può premere anche a video spento.** Non gira niente lì per lì: sceglie con
quale camera si accenderà, e l'icona lo mostra. Così si inquadra qualcosa senza far vedere
prima, per un istante, la propria faccia. Nello stesso giro sparisce un fastidio: cambiando
risoluzione mentre si riprendeva con la camera posteriore, la ripresa tornava sulla
frontale da sé.

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
