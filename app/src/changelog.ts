/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
// Written by scripts/build-changelog.js: do not edit by hand.
// The source is CHANGELOG.md at the root of the project.
export type ReleaseNote = {
  version: string;
  paragraphs: { strong: string; text: string }[];
};

export const CHANGELOG: ReleaseNote[] = [
  {
    "version": "0.9.2 build 172",
    "paragraphs": [
      {
        "strong": "Duetto parla anche spagnolo, portoghese e francese.",
        "text": "Tutta l'interfaccia, dagli avvisi alle impostazioni. La lingua resta del collegamento, come sempre: lo stesso telefono può parlare spagnolo con una persona e italiano con un'altra; chi non sceglie ha la lingua del telefono."
      }
    ]
  },
  {
    "version": "0.9.1 build 171",
    "paragraphs": [
      {
        "strong": "Il relay veste i panni del web.",
        "text": "Certe reti mobili falciano a orologeria ogni flusso che non sembri web — quaranta secondi e giù — ed era questa la caduta e ricostruzione al minuto, con buchi di audio e video, di chi passava dal server. Ora il relay si raggiunge soltanto dentro TLS, l'unico abito che quelle reti rispettano: sul campo il collegamento è passato da una vita di quaranta secondi a nessuna caduta. Chi ha una strada diretta non paga nulla: lì il relay non trasporta niente."
      },
      {
        "strong": "Le marce se ne vanno.",
        "text": "La scalata «tutto per il relay», «porta TCP del relay» esisteva solo perché il relay aveva gambe falciabili; vestito di TLS, non c'è più marcia migliore da ingranare. E con la scalata se ne va la sua memoria, che con una lezione vecchia costringeva intere serate a passare dal server: ogni ingresso nel canale ora riparte libero e prova davvero le strade dirette."
      },
      {
        "strong": "Dove la diretta non esiste, non è colpa dell'app.",
        "text": "Su certe reti mobili (IPv4 dietro la NAT chiusa dell'operatore, niente IPv6) la strada diretta non può proprio esserci: lì la conversazione passa dal server — adesso senza cadute."
      }
    ]
  },
  {
    "version": "0.9.1 build 170",
    "paragraphs": [
      {
        "strong": "Un solo orologio per le morti.",
        "text": "Allo scoccare della pazienza partivano due medicine insieme — la scala vecchia e il cambio di marcia — e le due negoziazioni si pestavano i piedi: era la catena «prima un telefono, poi l'altro». Ora per una morte comanda un orologio solo, che ingrana la marcia dove serve e dà la medicina ordinaria dove no."
      },
      {
        "strong": "Niente scambi di binario mentre si ricuce.",
        "text": "Una caduta fa sfarfallare gli schermi, lo sfarfallio faceva rimbalzare il «sta guardando/non sta guardando», e ogni rimbalzo cambiava il binario del video — innescando una rinegoziazione nel bel mezzo della riparazione: era la catena dei singhiozzi doppi, prima un telefono e poi l'altro. Ora il desiderio si annota e si esaudisce a collegamento tornato intero."
      },
      {
        "strong": "Il minuto della camera misura l'interruzione, non l'ultimo tocco.",
        "text": "Rientrando pochi secondi dopo un aggiornamento, il video non tornava: l'orologio del cassetto partiva dall'ultima pressione del pulsante, magari di minuti prima. Ora il cassetto si rinfresca da solo mentre si è nel canale, e il minuto conta da quando l'app è morta davvero."
      },
      {
        "strong": "Un collegamento sano non si rinegozia per uno starnuto.",
        "text": "Certi telefoni ruotano gli indirizzi della wifi ogni minuto, e a ogni rotazione si rifaceva la ricerca delle strade: una serata tranquilla in casa si riempiva di scosse tutte nostre. Ora solo il cambio di rete vero rimescola le carte di un collegamento in salute."
      },
      {
        "strong": "Prima la pazienza, poi le marce.",
        "text": "Sulle reti che uccidono il collegamento a orologeria, quello si ricuce da solo in un paio di secondi quasi ogni volta — e le cure immediate trasformavano ogni rammendo invisibile in una demolizione con lo schermo nero. Ora ogni morte ha otto secondi per disfarsi da sé; solo quella che resta morta fa scattare la marcia successiva. Le reti di sicurezza hanno imparato la stessa calma: agiscono al secondo giro da malato, non al primo."
      },
      {
        "strong": "Le marce si ricordano.",
        "text": "La marcia che la strada ha insegnato resta in memoria fino al cambio di rete: rientrando nel canale si parte già in quella giusta, senza ripetere la lezione a suon di schermi neri."
      },
      {
        "strong": "Il cambio di marcia rifà la connessione da entrambi i lati.",
        "text": "Il lato che aspetta le offerte mandava l'ordine e teneva la propria connessione vecchia — politica vecchia e, peggio, socket inchiodati alla rete di prima: tornati sul wifi si continuava a passare dall'operatore. Ora smonta anche la sua, e l'offerta in arrivo la ricostruisce sulla rete giusta."
      }
    ]
  },
  {
    "version": "0.9.1 build 161",
    "paragraphs": [
      {
        "strong": "La seconda marcia dell'autostrada: il relay raggiunto in TCP.",
        "text": "Certe NAT degli operatori falciano ogni percorso UDP ogni quaranta secondi — perfino l'autostrada, il cui tratto verso il relay era UDP anche lui. Se muore pure quella, i due telefoni ora tengono sul tavolo la sola porta TCP del relay: una connessione che la NAT deve rispettare. Nel pannello, accanto a «relay», ora si legge anche il tratto: (udp) o (tcp)."
      }
    ]
  },
  {
    "version": "0.9.1 build 160",
    "paragraphs": [
      {
        "strong": "Sull'autostrada al primo inciampo, quando si è già via server.",
        "text": "La pazienza dei tre inciampi resta per abbandonare una strada diretta, che qualcosa costa; ma se a morire è la strada mista attraverso il relay, non c'è nulla da rimpiangere: si passa subito al percorso tutto-relay."
      },
      {
        "strong": "Il volume che non si muove non viene più creduto.",
        "text": "Su parecchi telefoni il costruttore inchioda il volume di chiamata in vivavoce: l'app credeva di averlo abbassato, passo dopo passo la sua idea del volume divergeva dalla realtà, e si finiva ad ascoltare al 46% col telefono in verità a palla. Ora dopo ogni mossa si verifica: se il telefono non s'è mosso, il comando passa al guadagno, che obbedisce sempre."
      },
      {
        "strong": "Il journal dice anche quanto forte stavi sentendo.",
        "text": "Accanto al volume di sistema ora c'è `level=NN%`, il prodotto vero delle due manopole: prima nessuno dei due numeri, da solo, spiegava un «non ti sento»."
      }
    ]
  },
  {
    "version": "0.9.1 build 158",
    "paragraphs": [
      {
        "strong": "La strada che continua a morire si abbandona per l'autostrada.",
        "text": "Su certe reti cellulari il collegamento inciampava ogni quaranta secondi: la strada «economica» attraverso la NAT dell'operatore muore e risorge in continuazione. Alla seconda recidiva i due telefoni ora si accordano e passano tutto attraverso il proprio relay, da entrambi i lati — la strada che nei log restava in piedi mentre le altre morivano. Si torna alle strade aperte al primo cambio di rete."
      },
      {
        "strong": "Chi trasmette molto meglio dell'altro si abbassa un po', e guarda.",
        "text": "Quando le due immagini sono assurdamente diseguali, il mittente forte cala il proprio tetto un gradino alla volta finché non sono abbastanza pari, e lo rialza appena l'altro tiene il passo. Solo il tetto di banda: nessuna camera da riaprire, nessun fotogramma nero."
      },
      {
        "strong": "Il microfono torna sempre com'era stato lasciato.",
        "text": "Prima valeva per cinque minuti; ora vale e basta, anche dopo una notte. La camera conserva la sua finestra di un minuto: riaccendersi da sola, quella, è un'altra faccenda."
      }
    ]
  },
  {
    "version": "0.9.0 build 155",
    "paragraphs": [
      {
        "strong": "Uscendo di casa, la conversazione salta sui dati in pochi secondi.",
        "text": "Il wifi che si allontana diventa sordo molto prima che il telefono lo lasci, e in mezzo c'era fino a un minuto di silenzio. Ora, se il collegamento cade mentre voce o video stanno passando, l'app interroga il server: se tace anche lui, la sordità è nostra — e accende da sé la rete dati, portandoci sopra tutta la conversazione senza aspettare che il telefono si decida. Quando il wifi torna in salute si rientra da soli, con calma. La corsia costa radio e per questo vive solo in conversazione: in attesa, o con microfoni e camere spenti, resta la via lenta che non consuma nulla."
      },
      {
        "strong": "I pulsanti seguono il bordo vero del video.",
        "text": "Quando l'encoder stringe l'immagine per una rete magra, il fotogramma esce di un formato leggermente diverso da quello della camera, e i pulsanti restavano allineati al bordo di un video che non c'era più. Ora la forma dichiarata viene corretta con le misure dei fotogrammi che arrivano davvero."
      }
    ]
  },
  {
    "version": "0.9.0 build 153",
    "paragraphs": [
      {
        "strong": "Cambiando rete, il collegamento cerca le strade nuove da solo.",
        "text": "Il telefono passa spesso da una rete all'altra senza che nulla si rompa — la nuova arriva prima che la vecchia se ne vada — e il collegamento diretto restava sulla strada vecchia: capitava di stare sulla stessa wifi passando ancora dal server, col video schiacciato a niente e la connessione che inciampava ogni quaranta secondi. Ora il cambio di rete fa ripartire la ricerca, e riapre anche il tentativo di lasciare il relay."
      },
      {
        "strong": "E una strada marcia viene abbandonata.",
        "text": "Tre inciampi in pochi minuti non sono sfortuna: sono un giudizio sulla strada, e si va a cercarne un'altra."
      }
    ]
  },
  {
    "version": "0.9.0 build 152",
    "paragraphs": [
      {
        "strong": "Nella tendina, il presente sta sopra il passato.",
        "text": "Le notifiche di Duetto ora hanno un ordine fisso: prima lo stato delle cose («Nel canale con l'altro»), poi gli avvisi, in fondo le notizie. Prima l'ordine era per età, e la notizia «è sparito…» restava seduta sopra uno stato che diceva il contrario. La notizia del ritorno, inoltre, ora comincia dal ritorno: anche troncata dice la cosa giusta."
      },
      {
        "strong": "Le righe tecniche si dispongono attorno a ciò che viaggia.",
        "text": "Con la sola voce, due righe: la banda accanto al profilo, sotto percorso, latenza e attese. Col video, tre: le risoluzioni riempiono la prima, e le attese hanno una riga tutta loro invece di rimpicciolirsi con il resto."
      },
      {
        "strong": "«Sempre visibili» non si dimentica più al riavvio.",
        "text": "Il traduttore delle vecchie impostazioni non conosceva il grado nuovo e lo riportava al default a ogni avvio dell'app."
      },
      {
        "strong": "Percorso e ritardi non spariscono più sulla rete cellulare.",
        "text": "Dopo un cambio di rete il telefono non ritrovava la coppia di candidati vincente e il pannello perdeva percorso, latenza e attese: ora la chiede nel modo che lo standard prevede, con i vecchi dialetti come ripiego."
      }
    ]
  },
  {
    "version": "0.9.0 build 150",
    "paragraphs": [
      {
        "strong": "Sconfitto lo stallo del «sto stabilendo la connessione».",
        "text": "Da sempre, ogni tanto, i due telefoni restavano lì a fissarsi: ognuno convinto che nulla fosse rotto, nessuno dei due collegato. Succedeva quando l'offerta di collegamento cadeva in un buco (un riaggancio al momento sbagliato) e la connessione rimaneva «nuova» per sempre — mai malata, quindi mai curata dalle reti di sicurezza. Ora il silenzio prolungato è riconosciuto per quello che è, e dopo dieci secondi scatta la solita medicina."
      },
      {
        "strong": "La finestrella dice solo l'essenziale.",
        "text": "Andando in Picture-in-Picture col tasto indietro, su molti telefoni la finestrella mostrava pulsanti e righe tecniche accatastati su un francobollo: l'app non veniva avvisata del rimpicciolimento. Ora è Android stesso a dirglielo, e nella finestrella restano la faccia e una parola: c'è, in attesa, non raggiungibile."
      },
      {
        "strong": "Una pressione lunga sul video sceglie quanto sfumano i pulsanti.",
        "text": "Mezzo secondo col dito fermo sull'immagine grande (o sullo schermo, se video non ce n'è) apre il menu con i gradi di attenuazione — senza passare dalle impostazioni. E tra i gradi ora c'è anche «Sempre visibili», per chi i pulsanti li vuole lì, fissi."
      },
      {
        "strong": "Il ritardo scritto è quello di ciò che viaggia.",
        "text": "Solo voce: il ritardo della voce. Col video acceso: quello dei fotogrammi, ai quali la voce è tenuta dietro dalla sincronizzazione. Prima i due si mescolavano cambiando catena di nascosto, e il numero calava proprio quando accendevi la camera."
      }
    ]
  },
  {
    "version": "0.9.0 build 146",
    "paragraphs": [
      {
        "strong": "In attesa si consuma molto meno.",
        "text": "Il blocco che teneva sveglio il processore, finora tenuto sempre, ora si tiene solo dentro al canale: aspettando, il telefono dorme davvero. A vegliare restano gli annunci della rete, i rari pacchetti del server — che svegliano il telefono da soli — e una sveglia di sistema che ogni dieci minuti guarda che la presenza ci sia ancora. La sveglia è anche la rete di sicurezza che mancava: se il telefono uccide il servizio d'ascolto, entro dieci minuti viene rimesso in piedi, cosa che prima non faceva nessuno."
      },
      {
        "strong": "L'ascolto senza interfaccia ha le stesse orecchie dell'app.",
        "text": "Dopo un riavvio, o quando il sistema smonta l'app, la connessione era sorvegliata solo dai timer di JavaScript — che a schermo spento non suonano. Ora il battito nativo e gli annunci della rete vegliano anche lì: un socket morto in silenzio viene rifatto in secondi, non scoperto dopo minuti."
      },
      {
        "strong": "Una chiamata che muore in tasca si ripara in tasca.",
        "text": "Ogni riparazione del collegamento diretto dipendeva da timer che a schermo spento stanno fermi: la cura partiva nell'istante in cui si riaccendeva lo schermo. Ora la dà anche il battito, che nel canale suona pure a schermo spento, e mentre il collegamento sta male accelera: la riparazione arriva in una quindicina di secondi."
      },
      {
        "strong": "Chi cade e torna subito non «esce» più.",
        "text": "Un cambio di rete faceva lampeggiare «si è disconnesso» sull'altro telefono, per poi smentirlo un attimo dopo. Ora il server aspetta qualche secondo prima di annunciare una caduta: se sei già tornato, nessuno si accorge di niente. E una bussata arrivata proprio in quel buco non sparisce più: ti aspetta sulla soglia e ti viene consegnata al rientro."
      },
      {
        "strong": "I fatti non si perdono più nei buchi.",
        "text": "Il diario, il «non me ne sono andato», il suono per richiamarti: se partivano mentre il server era irraggiungibile o l'altro stava riagganciando, sparivano in silenzio. Ora aspettano in tasca e vengono consegnati appena c'è di nuovo qualcuno ad ascoltare."
      },
      {
        "strong": "«Esci e diventa irraggiungibile» sopravvive al riavvio.",
        "text": "La scelta viveva solo nella memoria dell'app: riavviando il telefono tornavi raggiungibile senza volerlo. Ora resta scritta dove il riavvio non la cancella."
      },
      {
        "strong": "Negare il microfono non ti rende più invisibile.",
        "text": "Rifiutando il permesso, l'app rinunciava anche ad ascoltare: restavi irraggiungibile senza saperlo. Per ascoltare il microfono non serve — serve solo per entrare nel canale — e ora l'ascolto resta."
      },
      {
        "strong": "Se le restrizioni batteria tornano, te lo dice.",
        "text": "Il permesso chiesto alla prima installazione può essere revocato in silenzio dal sistema o da un «ottimizzatore»: era il modo classico di diventare irraggiungibili senza saperlo. Ora l'app se ne accorge quando la riapri e te lo dice."
      },
      {
        "strong": "Niente più server di Google.",
        "text": "Per anni un indirizzo STUN pubblico di Google faceva da ripiego nei telefoni: l'unica dipendenza esterna di un progetto che si regge da solo. Non serviva: il tuo relay risponde già anche a quello, e ora i telefoni usano solo indirizzi tuoi."
      }
    ]
  },
  {
    "version": "1.1.122",
    "paragraphs": [
      {
        "strong": "Un telefono in tasca non preme più niente.",
        "text": "Finché qualcosa copre lo schermo - una tasca, una cover chiusa - i comandi non rispondono. Con il vivavoce acceso il sistema non spegne il display, e tutto quello che tocca il vetro arrivava ai pulsanti: è così che sono comparse uscite dal canale che nessuno aveva premuto."
      }
    ]
  },
  {
    "version": "1.1.121",
    "paragraphs": [
      {
        "strong": "Il volume regolato da un'altra app diventa quello di Duetto.",
        "text": "Se muovi il volume di chiamata da fuori, l'amplificazione di Duetto torna a 1: mettendolo a metà ti ritrovi a metà, non a tre quarti. Il muto invece resiste: lo si toglie da Duetto, e allora si riparte dal volume che il telefono ha in quel momento."
      },
      {
        "strong": "«Il suo telefono gli ha chiuso l'app» solo quando conta.",
        "text": "Su certi telefoni la finestra viene smontata pochi secondi dopo ogni uscita: dirlo anche allora faceva leggere quella frase - vera, ma fuorviante - subito dopo un'uscita che l'altro aveva scelto."
      }
    ]
  },
  {
    "version": "1.1.120",
    "paragraphs": [
      {
        "strong": "Uscendo di casa si torna in linea prima.",
        "text": "Il wifi che si allontana smette di far passare dati molto prima che il telefono lo molli - a schermo spento anche per mezzo minuto - e in quel tempo Duetto restava scollegato. Ora, dopo due tentativi a vuoto, chiede ad Android di verificare quella rete: se non porta a internet, il traffico passa ai dati da sé."
      },
      {
        "strong": "E ci riprova quattro volte più spesso.",
        "text": "A schermo spento l'unico motore che gira è il battito, quindi il suo passo è anche il passo dei tentativi: resta di un minuto quando va tutto bene, e scende a quindici secondi finché non si è tornati in linea."
      },
      {
        "strong": "Il microfono e la camera si riprendono con due attese diverse",
        "text": "dopo un'uscita: cinque minuti il microfono, un minuto la camera. Una camera che si riaccende da sola riprende una stanza e una faccia, e dopo un minuto non è più chiaramente la stessa scena di prima."
      }
    ]
  },
  {
    "version": "1.1.119",
    "paragraphs": [
      {
        "strong": "Via il venticinque per cento di troppo.",
        "text": "Diventando il prodotto delle due metà, il volume di Duetto ha cambiato significato: il moltiplicatore di prima, traghettato sulle quattro uscite, restava come un'amplificazione fissa sopra qualunque cosa - e sulla cornetta suonava come un vivavoce. Ora riparte da 1 dappertutto, e il livello è quello del volume di chiamata del telefono, che ha già una memoria per ogni uscita."
      },
      {
        "strong": "Il tocco su «Esci» non esce",
        "text": ": apre lo stesso pannello della pressione lunga, con le due uscite scritte per esteso e una riga «Resta nel canale». La conferma piccola sotto l'icona non si vedeva, ed era proprio nel caso in cui serve - quando quel tocco non l'hai fatto tu."
      }
    ]
  },
  {
    "version": "1.1.118",
    "paragraphs": [
      {
        "strong": "Il volume scende fino al silenzio, e sotto il minimo del telefono.",
        "text": "In vivavoce il primo scalino di certi telefoni è ancora fortissimo, e più giù Android non va: da lì in poi attenua Duetto, fino a un quarto, e un altro tocco zittisce del tutto. Dal silenzio, il primo tocco in su riporta al minimo del telefono."
      },
      {
        "strong": "Uscendo e rientrando entro dieci secondi si riprende com'era",
        "text": ", microfono e camera compresi: un'uscita e un rientro immediati quasi sempre non sono una scelta, e ritrovarsi il video da riaccendere a mano era una punizione per qualcosa che non si è fatto."
      }
    ]
  },
  {
    "version": "1.1.117",
    "paragraphs": [
      {
        "strong": "Uscire dal canale chiede conferma.",
        "text": "Il primo tocco su «Esci» arma il pulsante - diventa «Sicuro?» per tre secondi - e solo il secondo esce. Sono comparse uscite dal canale che nessuno aveva premuto, di notte e in pieno giorno: qualunque cosa le produca, un tocco solo non basta più. Tenendo premuto, il menu con le due uscite resta com'era."
      },
      {
        "strong": "Il diario registra ogni pressione dei comandi",
        "text": "con il punto dello schermo e quanto è durato il contatto. Su un telefono lontano è l'unico modo di sapere cosa è arrivato davvero all'app."
      },
      {
        "strong": "La notifica fissa si può scacciare",
        "text": "su Android 13 e successivi: il servizio continua a girare e resti raggiungibile lo stesso."
      }
    ]
  },
  {
    "version": "1.1.116",
    "paragraphs": [
      {
        "strong": "Il volume adesso è un numero solo, e dice la verità.",
        "text": "Prima Duetto mostrava soltanto la propria parte, e il volume di chiamata del telefono - che ha una manopola per ogni uscita e la muovono anche le altre app - non lo guardava: potevi leggere 150% mentre il telefono stava a uno su otto. Ora il livello è il prodotto dei due, si aggiorna anche quando lo cambi da fuori, ed è quello che viaggia all'altro: «ti sente 25%» è diventata una frase esatta."
      },
      {
        "strong": "E ogni uscita ha il suo.",
        "text": "Salendo, i tasti portano prima al massimo il volume di chiamata - che Android ricorda già separato per cornetta, vivavoce, cuffie e bluetooth - e solo dopo moltiplicano; scendendo fanno il contrario. Quello che avevi impostato vale ora per tutte e quattro le uscite, e da lì in poi si separano."
      },
      {
        "strong": "Quando il telefono ti chiude l'app, l'altro lo sa.",
        "text": "Su certi telefoni Duetto viene smontato da solo, anche di notte: all'altro compariva «in attesa», identico a quando esci tu. Ora dice «in attesa (app chiusa dal telefono)», nel riquadro e nella notifica."
      },
      {
        "strong": "La connessione si controlla ogni minuto, anche a schermo spento.",
        "text": "I cronometri di React Native seguono il ritmo dei fotogrammi: a schermo spento non scadono, e nessuna delle reti di sicurezza partiva - una notte la connessione è rimasta caduta otto minuti e mezzo, fino al momento in cui lo schermo si è acceso. Ora il controllo lo sveglia un battito nativo."
      }
    ]
  },
  {
    "version": "1.1.115",
    "paragraphs": [
      {
        "strong": "Correzione di un guaio introdotto dalla 1.1.114",
        "text": ": i due telefoni si vedevano sparire a vicenda ogni pochi secondi. L'ascolto dei cambi di rete era troppo nervoso e rifaceva connessioni sanissime. Ora, quando la rete cambia, prima si chiede al server se il collegamento è ancora vivo, e lo si rifà solo se non risponde."
      }
    ]
  },
  {
    "version": "1.1.114",
    "paragraphs": [
      {
        "strong": "Il cambio di cella non si vede più.",
        "text": "Duetto ora si accorge da sé quando la rete del telefono cambia - cella, wifi, indirizzo nuovo - e rifà subito il collegamento invece di aspettare che qualcuno inciampi in un socket morto. E la scritta «senza collegamento al server» aspetta cinque secondi prima di comparire: un cambio di rete si sistema in uno o due, e non merita un allarme."
      }
    ]
  },
  {
    "version": "1.1.113",
    "paragraphs": [
      {
        "strong": "«Senza collegamento al server» quando il collegamento c'era.",
        "text": "Cambiando cella o passando dal wifi ai dati, la connessione muore e l'app ne apre subito un'altra - ma la notizia della morte della prima arriva con minuti di ritardo, e finiva per dichiarare scollegata una connessione nuova e funzionante. Ora chi parla deve essere la connessione in uso, e quella abbandonata si chiude sul serio."
      },
      {
        "strong": "La rete di sicurezza adesso scatta davvero.",
        "text": "Doveva rifare tutto da capo dopo qualche secondo senza server, e in giorni di diario non è mai partita: il conto ripartiva a ogni tentativo. Ora conta dall'ultima connessione funzionante, e dopo dieci secondi di buio rifà da capo."
      },
      {
        "strong": "L'avviso della morte dice l'ora vera del ritorno.",
        "text": "«È tornato alle 17:04», mandata da chi è tornato: prima diceva l'ora in cui la notizia arrivava a te, che se eri scollegato è tutt'altra cosa."
      }
    ]
  },
  {
    "version": "1.1.112",
    "paragraphs": [
      {
        "strong": "Un tocco distratto non ti fa più uscire dal canale.",
        "text": "Con un video acceso i comandi sbiadiscono, e se non li tocchi da un minuto adesso dormono: il primo tocco li riaccende e basta, senza premere niente. Vale anche per «Esci», che prima usciva al primo tocco senza chiedere."
      },
      {
        "strong": "Il diario diceva «schermo acceso» anche a schermo spento.",
        "text": "Chiedeva ad Android una cosa che somiglia ma non è: durante una conversazione il telefono resta «interattivo» mentre il sensore di prossimità spegne il display. Ora si guarda lo stato del display vero - acceso, spento, o l'orologio sempre visibile."
      }
    ]
  },
  {
    "version": "1.1.111",
    "paragraphs": [
      {
        "strong": "L'uscita audio non torna più indietro da sola.",
        "text": "Dopo un aggiornamento il vivavoce poteva ridiventare cornetta: una vecchia memoria, rimasta da quando l'uscita era una sola per tutta l'app, veniva ritravasata a ogni avvio ogni volta che la scelta era quella di partenza. Ora si legge una volta e si cancella. Valeva anche per il volume della voce dell'altro."
      }
    ]
  },
  {
    "version": "1.1.110",
    "paragraphs": [
      {
        "strong": "Il riquadrino non salta più.",
        "text": "Spegnendo e riaccendendo il video, al trascinamento successivo saltava in un'altra posizione e ripartiva da lì - e nei casi peggiori finiva fuori dallo schermo. Ora resta dove lo lasci, sempre."
      }
    ]
  },
  {
    "version": "1.1.107",
    "paragraphs": [
      {
        "strong": "Chi bussa sente bussare.",
        "text": "Al posto del rullo di tamburi, due colpi su una porta: mezzo secondo, il riscontro che l'avviso è partito davvero. Il rullo resta fra i suoni da mandare all'altro."
      },
      {
        "strong": "«Avvisa» si spegne quando non c'è dove bussare.",
        "text": "Grigio e non premibile quando il telefono dell'altro al server non è collegato - staccato di proposito, o senza rete - perché lì l'avviso non ha dove arrivare. Resta acceso quando è in attesa e anche quando siete tutti e due nel canale, che è il caso in cui insistere serve. Con lui è sparita la finestrella «Non raggiungibile», che diceva a cose fatte quello che ora si vede prima."
      }
    ]
  },
  {
    "version": "1.1.105",
    "paragraphs": [
      {
        "strong": "Il nome del collegamento si vede in ogni notifica",
        "text": ", in corsivo, in testa al testo: «*Casa* · Sei nel canale · Anna in attesa». Stava nel titolo, che con la notifica ripiegata su parecchi telefoni non si vede - e «Sei nel canale», con più collegamenti configurati, non dice in quale. Lo stesso nome, sempre in corsivo, nella pastiglia in alto e nel riepilogo al centro."
      },
      {
        "strong": "Una notifica scacciata non torna più.",
        "text": "Veniva riscritta ogni minuto per rimediare a un aggiornamento perso, e una notifica riscritta rinasce: ora si riscrive solo quando il testo cambia davvero, e riprova soltanto se la scrittura è fallita."
      }
    ]
  },
  {
    "version": "1.1.101",
    "paragraphs": [
      {
        "strong": "Il riquadrino non si perde più fuori dallo schermo.",
        "text": "Si poteva trascinare ovunque e rientrava solo alla fine del gesto: se quella fine non arrivava - gesto rubato da un altro tocco - restava fuori, e niente lo recuperava. Adesso il bordo lo ferma mentre lo muovi, come le finestrelle di WhatsApp o FaceTime, e lo stesso vale allargandolo."
      }
    ]
  },
  {
    "version": "1.1.100",
    "paragraphs": [
      {
        "strong": "Con la camera accesa da solo puoi andare a schermo intero.",
        "text": "Un tocco sul riquadrino porta la tua immagine grande, un altro ti riporta al riepilogo; prima la scelta cadeva nello stesso istante in cui la facevi. Il riquadrino resta lì vuoto, e dice com'è messo l'altro con le parole vere - il suo nome se è nel canale, «in attesa», «si è staccato», «non raggiungibile» - invece di un «in attesa» buono per tutte le stagioni."
      },
      {
        "strong": "Niente più versioni vecchie inventate.",
        "text": "Quando l'altro usciva dal canale, l'app continuava a dire «di là una più vecchia»: è il segno con cui si riconosce un Duetto vecchio, cioè non dichiarare la versione, ma uscendo non la dichiara nessuno."
      }
    ]
  },
  {
    "version": "1.1.99",
    "paragraphs": [
      {
        "strong": "I volumi si leggono anche quando ha il video solo lui.",
        "text": "Prima, con il suo video a tutto schermo, sparivano insieme il riepilogo al centro (coperto) e il riquadrino (che non c'è): con le righe tecniche accese compare una seconda pastiglia in alto, «Tu», con la tua uscita audio e il tuo volume accanto alla sua."
      },
      {
        "strong": "Nel riepilogo ogni volume ha il segno di chi ascolta",
        "text": ": il suo davanti a «ti sente», il tuo dopo «lo senti». Prima ce n'era uno solo in testa alla riga, e sembrava valere per tutti e due."
      }
    ]
  },
  {
    "version": "1.1.98",
    "paragraphs": [
      {
        "strong": "Una notizia sola.",
        "text": "«È di nuovo raggiungibile» compariva sia nella tendina di Android sia nel riquadro dentro l'app: adesso solo nella tendina."
      },
      {
        "strong": "Le righe tecniche non escono più dallo schermo.",
        "text": "«andata e ritorno 42 ms» è diventato «latenza a/r 42 ms», e quella riga si rimpicciolisce da sola quando serve, come già faceva quella della risoluzione."
      },
      {
        "strong": "Il volume che viaggia è giusto dal primo istante.",
        "text": "La sessione nasceva annunciando 100% e si correggeva un attimo dopo: se quella correzione si perdeva, dall'altra parte restava un numero mai stato vero."
      }
    ]
  },
  {
    "version": "1.1.97",
    "paragraphs": [
      {
        "strong": "Sai a che volume l'altro ti sente.",
        "text": "Con le righe tecniche accese, ogni pastiglia dice come suona il telefono di cui porta il nome: accanto a «Non tu» da dove esce il suo suono e a che volume lui sta ascoltando **te**, accanto a «Tu» la tua uscita e il tuo volume. Il numero che conta è il suo: era l'unica cosa che non potevi sapere in nessun modo, e spiega da sola i «non ti sento» — se ti ha al 25%, adesso si vede. Il dato viaggia da sé e si aggiorna appena lui tocca i tasti del volume."
      },
      {
        "strong": "Se l'altro non ha il video, nel riquadrino c'è il tuo.",
        "text": "Prima, accendendo il video da solo, non restava niente a dire che dall'altra parte c'era qualcuno: ora il posto grande tiene il riepilogo di com'è messo lui, e il tuo video sta nel riquadrino."
      },
      {
        "strong": "Il rullo di tamburi lo senti anche tu.",
        "text": "Bussando all'altro, il suono suona anche qui: è il riscontro che l'avviso è partito davvero."
      },
      {
        "strong": "La latenza tra le righe tecniche.",
        "text": "«Andata e ritorno 42 ms»: quanto ci mette la voce a fare il giro."
      },
      {
        "strong": "Le notifiche parlano tutte allo stesso modo, e non invecchiano.",
        "text": "Il nome del collegamento sta nel titolo — «Duetto · Casa» — e non più a volte lì e a volte in mezzo al testo. «È di nuovo raggiungibile» sparisce appena risparisce; «ti aspetta nel canale» sparisce quando esce dal canale; e ogni notizia si toglie comunque da sola dopo dieci minuti, invece di restare a raccontare una cosa di stamattina. La riga fissa si riscrive ogni minuto: se un aggiornamento va perso — capita, il sistema può rifiutarlo — non resta più appeso un «senza collegamento al server» a collegamento tornato."
      },
      {
        "strong": "I riquadri dentro l'app sbiadiscono.",
        "text": "Dopo dieci secondi se ne vanno da soli; toccarli li toglie subito, come prima."
      }
    ]
  },
  {
    "version": "1.1.95",
    "paragraphs": [
      {
        "strong": "La presenza sopravvive al telefono che mette via l'app.",
        "text": "Su certi telefoni — un Motorola recente, per esempio — l'app viene smantellata **tre secondi** dopo essere finita in secondo piano, senza che nessuno l'abbia chiusa: da lì l'altro ti vedeva «non raggiungibile» finché non riaprivi Duetto. Ora in quel momento la presenza passa all'ascolto senza interfaccia, che riapre la connessione da solo, e il servizio non si spegne più insieme alla finestra."
      },
      {
        "strong": "Ogni collegamento ricorda le sue impostazioni.",
        "text": "Nome con cui ti presenti, qualità del video, voce più ricca, righe tecniche, sfumatura dei comandi, suono e vibrazione dell'avviso, uscita audio, volume della voce dell'altro, camera: cambiando collegamento tornano quelle di quella persona. Prima erano una sola per tutta l'app, e con la seconda persona ti ritrovavi addosso le scelte fatte per la prima. La camera, poi, non era ricordata affatto: ogni volta si ripartiva dalla frontale."
      },
      {
        "strong": "Uscendo, il diario parte prima di chiudere.",
        "text": "Premendo «Esci» compare «Sto uscendo, un momento…» per una frazione di secondo: è il tempo di mandare all'altro telefono le ultime righe, finché la connessione è ancora aperta. Prima restavano lì fino al collegamento successivo, e se l'app moriva nel frattempo raccontavano una storia che non arrivava a nessuno."
      },
      {
        "strong": "L'ingrandimento del video non torna più indietro come un elastico.",
        "text": "Il numero dell'ingrandimento lo teneva il sistema e noi ne avevamo una copia che smetteva di aggiornarsi: lo schermo ingrandiva, il codice credeva di no, e al rilascio riportava tutto a schermo pieno. Ora il pizzico riparte da dove sei, il rilascio tiene, e il doppio tocco fa avanti e indietro. E l'ingrandimento non si azzera più quando l'immagine dell'altro si interrompe e ricompare."
      },
      {
        "strong": "Il diario racconta cosa fate.",
        "text": "Microfono, camera, qualità, avvisi, ingrandimento, uscite: le tue azioni e le sue, ciascuna con la sua riga, più una riga d'apertura che dice con che impostazioni quel collegamento è partito. Serve a ricostruire dopo cos'è successo, e a capire cosa vuol dire non aver cambiato niente."
      },
      {
        "strong": "Chi si stacca apposta lo si vede.",
        "text": "Il server distingue chi saluta da chi sparisce, e per chi resta la differenza è tutta: da un tunnel si esce, da una scelta no. Se l'altro sceglie «esci e renditi non disponibile», ora leggi «si è reso non raggiungibile: ha staccato Duetto di proposito», invece di un «non raggiungibile» che sembra un guasto da aspettare."
      },
      {
        "strong": "Tenendo premuto «Esci» si sceglie come uscire.",
        "text": "Il tocco fa quello di sempre — chiudi il canale ma resti raggiungibile, e il suo avviso ti arriva. La pressione lunga aggiunge l'altra: *esci e renditi non disponibile*, che stacca Duetto del tutto — niente connessione, niente notifica, niente avvisi, e all'altro risulti non raggiungibile, che è la verità. Dura finché non riapri l'app: riaprirla è già dire «ci sono»."
      },
      {
        "strong": "Dalla schermata «Collega i due telefoni» si può tornare indietro.",
        "text": "Chi ci arrivava per aggiungere un collegamento non aveva nessun modo di cambiare idea: il tasto Indietro chiudeva l'app, e l'unica via era «Cambia server», che promette tutt'altro. Ora c'è «Annulla», e il tasto Indietro riporta alle impostazioni."
      },
      {
        "strong": "Se l'app di uno dei due muore, l'altro lo viene a sapere.",
        "text": "Nessuno può avvisare mentre muore — un processo ucciso dal sistema non riceve nessun preavviso — ma riaccendendosi il telefono si ricorda com'è andata, e allora lo dice: «Anna è sparita alle 23:04: il telefono era senza memoria. Adesso è tornata». Arriva come notizia silenziosa, non come avviso: non suona e non vibra. E se l'assenza è durata più di un minuto senza essere una morte, il ritorno viene annunciato lo stesso, qualche secondo dopo — giusto il tempo di lasciar passare avanti il racconto, quando c'è. La stessa frase compare anche dentro l'app, in un cartellino in alto che va via toccandolo: la tendina delle notifiche non la apre chi sta già guardando lo schermo."
      },
      {
        "strong": "L'app pesa 28 MB invece di 43.",
        "text": "Dentro c'erano le librerie native per due architetture: arm64, che è ogni telefono degli ultimi dieci anni, e quella a 32 bit, che non usa più nessuno. Tolta la seconda, il file da passare all'altra persona è quasi la metà, si installa prima, e sul telefono c'è meno codice da tenere in memoria."
      },
      {
        "strong": "Nelle impostazioni c'è scritto da dove vengono i suoni.",
        "text": "Sono registrazioni di altri, e chi le ha fatte va nominato: la fanfara lo chiede la sua licenza (CC BY-NC 4.0), gli altri tre no — ma citare solo quello obbligatorio sarebbe una cortesia a metà."
      },
      {
        "strong": "Cinque suoni per richiamare, e sono registrazioni vere",
        "text": ": tamburi, batteria, fanfara, strombazzata, canto del gallo. Solo la strombazzata resta fatta in casa — un clacson sono letteralmente due note con le armoniche dispari, e viene meglio così che cercandone una registrazione pulita. Gli altri quattro erano sintetizzati e si sentiva: un «chicchirichì» costruito resta una macchietta, una batteria costruita è un tonfo senza pelle."
      },
      {
        "strong": "Tenendo premuto «Avvisa», quando siete tutti e due nel canale, puoi richiamarlo con un suono.",
        "text": "Serve per quando c'è ma non risponde: si è addormentato, o ha lasciato il telefono dall'altra parte della stanza e a voce non lo raggiungi. Cinque suoni, ben diversi fra loro — **tamburi**, **batteria**, **fanfara**, **strombazzata**, **canto del gallo** — e suonano sul suo telefono al volume della sveglia, non a quello della conversazione: si sentono anche se la voce era bassa. Viaggiano dentro la busta cifrata della conversazione, quindi il server non sa nemmeno che è successo."
      },
      {
        "strong": "Nel canale, i tasti del volume regolano la voce dell'altro.",
        "text": "Non il volume del telefono: quanto Duetto alza quella voce prima di suonarla, cosa che nessun telefono può ignorare. Premendo compare «Voce dell'altro 75%» al posto della barretta di sistema. Lo stesso comando c'è anche a mano, tenendo premuto «Audio»."
      },
      {
        "strong": "",
        "text": "Il motivo è nei dati: su un Motorola Edge 50 Fusion i tasti arrivavano al posto giusto e l'indice del volume di chiamata scendeva da 4/8 a 2/8 — il sistema si muoveva eccome — e all'orecchio non cambiava niente. Il telefono registra il numero e lo ignora, e da fuori un volume che scende senza effetto è indistinguibile da uno che scende davvero. Il volume di sistema resta dov'è e si regola fuori dal canale, come ogni altro volume."
      },
      {
        "strong": "Il diario dice di che telefono è",
        "text": ": marca, modello e versione di Android, sulla riga d'avvio. Leggendo il diario di qualcun altro è la prima domanda, perché metà del comportamento dell'audio dipende da quello."
      },
      {
        "strong": "Le barre di sistema, sopra e sotto, sono nere come l'app.",
        "text": "Su un telefono in tema chiaro la barra di stato veniva grigia e quella dei tasti bianca con i tasti scuri: due fasce chiare ai bordi che spezzavano l'immagine proprio dove dovrebbe continuare. Ora il fondo è lo stesso nero dell'app e i simboli sono chiari, tema del telefono o no."
      },
      {
        "strong": "Il simbolo della videocamera ha gli angoli tondi come il suo pulsante.",
        "text": "Erano appena smussati, e a video acceso — dove il disegno è scuro su una pastiglia chiara e riempie quasi tutto — quel rettangolo quasi retto faceva sembrare che fosse il pulsante ad avere gli spigoli vivi, diverso da tutti gli altri della fila."
      },
      {
        "strong": "Il diario registra anche come sta il suono",
        "text": ": da che modo passa l'audio del telefono, a che punto stanno il volume della voce e quello del multimedia, se il suono esce dal vivavoce, e se i tasti laterali comandano la voce. Su un telefono lontano quelle tre cose non si possono guardare, e senza di esse un «non si sente» resta un'ipotesi."
      },
      {
        "strong": "Le righe tecniche sotto ai pulsanti si leggono anche attenuate.",
        "text": "Erano di un grigio da nota a piè di pagina: appena i comandi cominciavano a farsi da parte sparivano, perché l'attenuazione moltiplica quel poco contrasto che c'era. Ora sono più chiare, con un'ombra sotto che le stacca dall'immagine."
      },
      {
        "strong": "I comandi che si fanno da parte adesso hanno tre modi.",
        "text": "«Poco sfumati» è quello di sempre (40%, restano leggibili), «molto sfumati» li riduce a un'ombra (15%), «nascosti» li toglie del tutto. In tutti e tre restano premibili e un tocco ovunque li richiama: cambia solo quanta immagine lasciano vedere. Chi aveva acceso «Nascondi i comandi» si ritrova su «nascosti», senza riscegliere niente."
      },
      {
        "strong": "Con il video acceso la voce si fa ricca da sé.",
        "text": "L'audio migliore costa 4 kB/s per direzione: accanto a mezzo megabit di video non si notano, e rinunciare alla voce buona per risparmiarli è un cattivo affare. Ora, quando il video supera i 320 kbit/s, il tetto dell'audio si alza da solo; torna all'impostazione quando il video scende sotto i 160 o si spegne. L'impostazione non viene toccata, e se l'hai accesa tu resta accesa comunque."
      },
      {
        "strong": "Scartare l'app dai recenti non ti rende più irraggiungibile.",
        "text": "Era una scorciatoia che sembrava ragionevole — chi butta via l'app vuole chiuderla — ma i diari di tre telefoni diversi raccontano un'altra storia: dopo quel gesto il processo restava lì senza servizio, e mezz'ora dopo Android lo riciclava per far posto ad altro. Chi aveva scartato l'app solo per riordinare i recenti si ritrovava irraggiungibile senza averlo chiesto e senza modo di accorgersene. Per non essere raggiungibili c'è «esci e renditi non disponibile», che lo dice con parole sue — e quando quella scorciatoia è stata scritta non esisteva ancora."
      },
      {
        "strong": "Basta con «si è staccato» detto di chi non si è staccato affatto.",
        "text": "Il saluto che dice all'altro «me ne vado di proposito» partiva a ogni chiusura della connessione — anche quando si chiudeva per riaprirla un istante dopo, cosa che succede ogni volta che riprendi in mano il telefono e l'app subentra all'ascolto senza interfaccia. Chi guardava leggeva che l'altro aveva staccato apposta, e smetteva di aspettarlo. Ora il saluto parte solo quando è vero: «esci e renditi non disponibile», o lo scioglimento di un collegamento. Tutto il resto è una caduta, dopo la quale è normale tornare."
      },
      {
        "strong": "Con la camera posteriore l'immagine non è più rovesciata.",
        "text": "Lo specchio ha senso per la camera frontale — chi si guarda si aspetta lo specchio, ed è così che ci si sistema i capelli — ma inquadrando il mondo è sbagliato e basta: le scritte si leggono al contrario e ci si muove dalla parte opposta a quella che si vede. L'altro riceveva comunque l'immagine giusta: lo specchio era solo nell'anteprima."
      },
      {
        "strong": "Anche le notifiche hanno l'icona nuova.",
        "text": "Erano rimaste con un simbolo di sistema, uguale a quello di cento altre app."
      },
      {
        "strong": "L'icona dell'app.",
        "text": "Due cornette di telefono, una blu e una verde, una di fronte all'altra e unite dal filo attorcigliato. Al posto del robottino del modello, che era rimasto lì dal primo giorno."
      },
      {
        "strong": "Se i comandi sono spariti del tutto, non si premono.",
        "text": "Con «nascosti» restavano premibili anche invisibili, e un dito appoggiato dove prima c'era un pulsante spegneva il video o usciva dal canale senza che niente lo annunciasse. Ora il primo tocco li richiama e basta: poi si decide guardando. Sbiaditi al 15% invece si premono, che si vedono ancora."
      },
      {
        "strong": "Con più collegamenti, l'avviso dice su quale è arrivato.",
        "text": "«Duetto · Casa» invece di «Duetto»: chi ti cerca è uno solo dei due o tre che conosci, e prima per sapere quale bisognava aprire l'app."
      },
      {
        "strong": "Nella finestrella, aspettando l'altro, ora c'è una faccia e una parola.",
        "text": "Premendo Indietro l'app resta in un rettangolo grande come un pollice, e lì il riepilogo «Sei nel canale…» non ci stava: usciva dai bordi e si leggeva mezza parola. Chi ha premuto Indietro non sta leggendo, sta tenendo d'occhio."
      },
      {
        "strong": "Se i due telefoni hanno versioni diverse di Duetto, le righe tecniche lo dicono.",
        "text": "In giallo, sotto ai pulsanti: «Versioni diverse: qui 1.1.65, di là 1.1.55». È la spiegazione di metà delle stranezze — una cosa che qui c'è e lì no, un pulsante che si comporta in due modi — e prima bisognava chiederselo a voce. Se le versioni sono uguali non compare niente. Chi ha una versione più vecchia di questa non dichiara la sua: allora si legge «di là una più vecchia», che è comunque la cosa che conta."
      },
      {
        "strong": "Ogni collegamento ha il suo diario, separato dagli altri.",
        "text": "Con più collegamenti configurati finiva tutto in un file solo: righe identiche fra loro, di telefoni diversi, e nessun modo di separarle dopo, perché le righe non dicono di chi sono. Ora il file porta il nome che hai dato al collegamento. Anche il conto delle righe già spedite è per collegamento: prima era uno solo, e quello che avevi mandato a uno risultava mandato pure all'altro, che quelle righe non le avrebbe viste mai."
      },
      {
        "strong": "Il diario non si perde più quando l'altro sta ascoltando senza app aperta.",
        "text": "Dopo un riavvio del telefono — o dopo che il sistema ha ucciso l'app e la presenza è ripartita da sé — l'altro è raggiungibile ma senza interfaccia, e lì il diario che gli mandavi arrivava a un pezzo di app che non lo guardava: chi l'aveva mandato aveva già segnato quelle righe come spedite, e sparivano. Erano proprio le righe che raccontano perché quel telefono era morto. Ora vengono raccolte anche lì, e lì arriva anche la notizia della morte."
      },
      {
        "strong": "Il diario passa all'altro telefono ogni cinque minuti",
        "text": "invece che ogni ora: un diario che arriva subito racconta cos'è appena successo dall'altra parte, uno che arriva con un'ora di ritardo racconta una storia vecchia."
      },
      {
        "strong": "Quando l'app sparisce, adesso resta scritto perché.",
        "text": "Android sa sempre come è morto un processo — memoria finita, errore, blocco, arresto forzato, o una decisione del gestore batteria del produttore — ma non lo dice a nessuno finché non glielo si chiede. Ora Duetto glielo chiede a ogni avvio e mette la risposta nel diario, con quanta memoria occupava e quanto contava agli occhi del sistema in quel momento. E siccome il diario i due telefoni se lo scambiano, si scopre anche perché è sparita sul telefono dell'altro, senza cavi e senza doverglielo chiedere."
      },
      {
        "strong": "Se il sistema uccide l'app, la presenza torna da sé.",
        "text": "Quando Android chiude Duetto per fare posto ad altro, il servizio ripartiva mostrando la notifica ma senza connessione: una presenza dichiarata e inesistente. Ora in quel caso riparte anche il motore che tiene la connessione, per la stessa strada che si usa dopo il riavvio del telefono. Se invece sei tu a togliere l'app dai recenti, resta chiusa: quella è una decisione, non un incidente."
      },
      {
        "strong": "A ogni collegamento puoi dare un nome.",
        "text": "Non è il nome della persona — quello se lo dà lei, o non ce l'ha — è il nome del filo che vi unisce: «Casa», «Ufficio». Con più collegamenti in elenco diventavano tutti «Senza nome» e non si distinguevano; ora la matita accanto a ciascuno apre il campo dove scriverlo. Il nome compare sulla pastiglia in alto, al posto di «Duetto», e in testa alla notifica fissa, così sai sempre in quale collegamento sei. Resta su questo telefono: l'altro non lo vede e non lo saprà mai. Nel riquadro di ogni collegamento c'è anche il server su cui è stato fatto."
      },
      {
        "strong": "Un telefono può tenere più collegamenti e passare dall'uno all'altro.",
        "text": "Prima accoppiarsi con qualcun altro voleva dire buttare via il collegamento di prima, e per tornare indietro rifare tutto da capo — con l'altra persona presente, il telefono in mano e il codice da dettarsi a voce. Ora ogni accoppiamento resta: nelle impostazioni c'è l'elenco, quello in uso è il primo e ha il bordo acceso, e toccarne un altro ci passa. All'avvio si riprende sempre l'ultimo usato, quindi chi ne ha uno solo non si accorge di niente."
      },
      {
        "strong": "",
        "text": "Ogni collegamento si ricorda anche il server su cui è nato, e se lo porta dietro quando lo si riprende. Il nome dell'altro si aggiorna da sé a ogni ingresso: in un elenco è l'unica cosa che distingue un collegamento dall'altro."
      },
      {
        "strong": "La schermata d'attesa ora dice se l'altro è in attesa o non è raggiungibile.",
        "text": "Prima diceva soltanto «non c'è ancora», che sono due cose molto diverse: se è in attesa non è nel canale ma l'avviso gli arriva; se non è raggiungibile il suo telefono al server non è collegato, e l'avviso non ha dove andare — quindi non ti si propone nemmeno di bussare."
      },
      {
        "strong": "Lo stato si rinfresca da sé",
        "text": ": ogni minuto nel primo quarto d'ora, poi ogni cinque, e subito ogni volta che riaccendi lo schermo. Serve perché la caduta di chi sta solo in attesa il server la scopre con comodo — il suo battito è di quattro minuti, ed è così apposta per non tenere sveglia la radio tutta la notte — e fino ad allora la riga direbbe «in attesa» di qualcuno che non c'è più."
      },
      {
        "strong": "Anche la notifica fissa lo dice",
        "text": ", e «In ascolto» è diventato «In attesa»: «In attesa tutti e due» quando ci siete entrambi e nessuno è ancora entrato, «In attesa · Anna è nel canale» quando ti sta aspettando dentro, «Sei nel canale · Anna in attesa» quando sei entrato tu e lei no, «Nel canale con Anna» quando ci siete tutti e due, e «non raggiungibile» al posto dell'attesa quando il suo telefono non è collegato. Vale anche per la notifica che compare da sola dopo un riavvio del telefono, che è l'unica cosa che parla finché non apri l'app."
      },
      {
        "strong": "Nel riquadro «Non tu» ora si vede come ti sta ascoltando l'altro.",
        "text": "Accanto alla scritta c'è il segno della sua uscita audio — vivavoce, orecchio, cuffie, bluetooth — e se ha il microfono spento il segno è sbarrato. Sono le due cose che durante una conversazione ci si chiede a voce di continuo, «mi senti?», «sei in vivavoce?», e che il telefono sa già. Quando non c'è nessun video, il segno sta nel riepilogo al centro, sopra la riga dell'audio."
      },
      {
        "strong": "Il pulsante «Avvisa» resta acceso anche quando siete tutti e due nel canale.",
        "text": "Prima si spegneva, con l'idea che lì non ci fosse più nulla da avvisare; ma il pulsante lì è premibile eccome, ed è anzi il caso in cui serve di più — l'altro c'è e non risponde. Sembrava guasto un pulsante che funzionava."
      },
      {
        "strong": "Il riquadrino non salta più appena lo si prende.",
        "text": "All'inizio del movimento schizzava altrove, e solo dopo seguiva il dito: al primo spostamento si portava dietro il residuo dei tocchi precedenti. Ora il conto parte da dove il dito si è posato davvero. Lo stesso valeva per la maniglia che lo ridimensiona."
      }
    ]
  },
  {
    "version": "1.1.38",
    "paragraphs": [
      {
        "strong": "La vibrazione dell'avviso ora funziona anche se il telefono non vibra per le altre notifiche.",
        "text": "Era il caso che conta di più: chi tiene il telefono muto e fermo per tutto il resto, e vuole sentire solo questo. La vibrazione stava nel canale di notifica, e da lì un'impostazione di sistema la può spegnere; ora la fa l'app, dichiarandola per quello che è — qualcuno che ti sta cercando, non una notifica qualunque."
      },
      {
        "strong": "E l'avviso si sente anche mentre siete già collegati.",
        "text": "Prima restava muto proprio nel momento in cui serve di più — l'altro c'è ma non risponde — perché durante una conversazione il telefono silenzia le notifiche, come fa quando sei al telefono. Ora il suono passa dalla via della conversazione, quella dell'avviso di chiamata in attesa."
      }
    ]
  },
  {
    "version": "1.1.37",
    "paragraphs": [
      {
        "strong": "Il video dell'altro compariva a fatica, e a volte solo riavviando l'app.",
        "text": "Colpa di una modifica di due versioni fa: da quando il microfono si apre solo all'arrivo dell'altro, fra il controllo «la connessione c'è già?» e la sua creazione passava mezzo secondo, e in quel mezzo secondo ne nascevano due. La seconda vinceva, la prima restava viva a ricevere un video che nessuno guardava più. Ora chi arriva mentre la connessione si sta creando aspetta quella, invece di farne un'altra."
      }
    ]
  },
  {
    "version": "1.1.35",
    "paragraphs": [
      {
        "strong": "L'app tiene un diario dei consumi.",
        "text": "Una riga ogni cinque minuti — livello della batteria, schermo acceso o spento, rete, e cosa stava facendo Duetto — per capire quanto costa davvero tenerla in ascolto, invece di discuterne. Ogni telefono manda il proprio diario all'altro una volta all'ora, dentro la stessa busta cifrata di tutto il resto: così collegandone uno solo a un computer si leggono tutti e due. Nel diario non c'è nulla di personale: numeri della batteria e stato dell'app, nessun contenuto di quello che vi dite."
      }
    ]
  },
  {
    "version": "1.1.33",
    "paragraphs": [
      {
        "strong": "Il promemoria «Sei nel canale, tocca Avvisa per farglielo sapere» si vede anche con la camera accesa.",
        "text": "Prima stava solo al posto del video: accendendo la propria camera spariva, e restava la propria immagine senza niente che spiegasse perché non succedeva nulla. Ora compare in sovrimpressione, senza la faccia dell'altro — sopra l'immagine peserebbe, e chi guarda sa già chi sta aspettando — e si attenua insieme ai comandi, perché è un promemoria e non un allarme."
      }
    ]
  },
  {
    "version": "1.1.32",
    "paragraphs": [
      {
        "strong": "Si sceglie come deve farsi sentire l'avviso.",
        "text": "Nelle impostazioni, sotto «Quando l'altro ti avvisa»: vibrazione — come decide il telefono, sempre, mai — e suono — quello di notifica, nessuno, oppure uno scelto fra quelli del telefono. Un suono diverso dagli altri fa capire chi è senza guardare. Vale per gli avvisi che arrivi tu: quello che sente l'altro lo decide lui."
      },
      {
        "strong": "\"Avvisa\" risponde al dito.",
        "text": "Premendolo la campanella si mette a suonare — inclinata, con le onde ai lati — e il pulsante perde l'azzurro per un attimo, per poi riaccendersi: prima cambiava solo la scritta sotto, l'azzurro restava spento due secondi buoni, e bussando di nuovo in quell'intervallo non tornava affatto — sembrava un pulsante guastatosi in mano. Il segno parte al tocco, senza aspettare la conferma del server, che può tardare proprio quando la rete va piano."
      },
      {
        "strong": "Quando l'altro esce, il tuo video torna subito a schermo intero.",
        "text": "Restava piccolo, in attesa di un video che non sarebbe più arrivato: uscendo, il suo stato — microfono e camera accesi — rimaneva scritto da qualche parte come se fosse ancora lì. Ora si distingue chi se n'è andato da chi è caduto: a chi cade il posto resta per sei secondi, che è il tempo di un cambio di rete, così non si vede il proprio video salire a schermo intero e tornare indietro per niente. Lo dice il server, che sa se il telefono ha salutato o è sparito."
      },
      {
        "strong": "\"Gira\" si accende quando riprende la camera frontale.",
        "text": "Pastiglia bianca con la frontale, spenta con quella dietro: la sola differenza fra le due sagome — una persona o più — si coglie leggendola, mentre il pieno o il vuoto si vede da lontano."
      },
      {
        "strong": "Nella schermata dell'accoppiamento, accanto a «Cambia server» c'è scritto qual è.",
        "text": "Era l'unica cosa che si voleva sapere prima di toccare quella riga, e bisognava entrarci per scoprirlo."
      }
    ]
  },
  {
    "version": "1.1.31",
    "paragraphs": [
      {
        "strong": "Aspettare costa molto meno.",
        "text": "Entrando nel canale il microfono non si apre più subito: si apre quando dall'altra parte arriva davvero qualcuno. Chi entra per primo può aspettare a lungo, e in quell'attesa il telefono registrava per nessuno — con l'indicatore di ascolto acceso, per giunta. Insieme a questa, una modifica sul server: il colpetto che tiene viva la connessione era ogni 30 secondi anche di notte, cioè 120 risvegli della radio ogni ora per non fare niente, e ora si dirada finché si sta soltanto in ascolto. Si infittisce da solo quando si entra nel canale, e quando qualcuno bussa l'altro viene interrogato all'istante: se non c'è più, lo si scopre subito invece di restare davanti a un \"avvisato\" rivolto a nessuno."
      },
      {
        "strong": "\"Gira\" si può premere anche a video spento.",
        "text": "Non gira niente lì per lì: sceglie con quale camera si accenderà, e l'icona lo mostra. Così si inquadra qualcosa senza far vedere prima, per un istante, la propria faccia. Nello stesso giro sparisce un fastidio: cambiando risoluzione mentre si riprendeva con la camera posteriore, la ripresa tornava sulla frontale da sé."
      }
    ]
  },
  {
    "version": "1.1.30",
    "paragraphs": [
      {
        "strong": "I tasti del volume ora regolano la voce dell'altro.",
        "text": "Su certi telefoni — il Motorola Edge 50 Fusion fra questi — premerli non cambiava nulla: il suono della conversazione esce dal volume \"chiamata\", mentre i tasti agivano su quello multimedia, e chi ascoltava se lo teneva com'era, spesso altissimo. Su altri telefoni funzionava già, perché Android tirava a indovinare bene; ora glielo diciamo, invece di sperare."
      }
    ]
  },
  {
    "version": "1.1.29",
    "paragraphs": [
      {
        "strong": "L'app si chiama Duetto.",
        "text": "Cambia il nome dappertutto: l'icona, la notifica fissa, gli avvisi, l'indirizzo del server. Per Android però non è la stessa app con un nome nuovo, è un'app diversa: la vecchia DuoTalk resta installata finché non la togli a mano, e Duetto parte vuota. Vanno rifatti l'abbinamento — dettandosi di nuovo il codice a voce o di persona — e le impostazioni, comprese quelle di sistema (batteria senza limiti, avvio automatico), perché Android le tiene legate all'app e non le trasferisce."
      }
    ]
  },
  {
    "version": "1.0.28",
    "paragraphs": [
      {
        "strong": "L'avvio automatico ora dice la verità.",
        "text": "La spunta si accendeva solo perché avevi aperto la schermata di sistema, anche senza toccare niente: dichiarava «a posto» senza saperlo. Quell'autorizzazione nessuna app può leggerla — è una schermata del produttore — ma si può sapere se ha funzionato: l'app si annota quando riparte da sola dopo un riavvio, e la spunta si accende solo allora. Finché non riavvii il telefono resta aperta, ed è onesto."
      }
    ]
  },
  {
    "version": "1.0.27",
    "paragraphs": [
      {
        "strong": "Tolti anche i campi del relay",
        "text": "dalle impostazioni avanzate: indirizzo e credenziali li manda il server nel messaggio di ingresso, quindi digitarli sul telefono non serviva più. Ne resta una sola da mantenere, sul server, e cambiando la password non si tocca nessun telefono."
      }
    ]
  },
  {
    "version": "1.0.26",
    "paragraphs": [
      {
        "strong": "Tolto l'access token.",
        "text": "Era un campo nelle impostazioni avanzate e un controllo sul server, pensato contro gli abusi; sul server era già disattivo da tempo, e la protezione vera è altrove — l'identificativo della coppia nasce da un codice di otto cifre e nulla di ciò che passa dal server è leggibile. Una impostazione in meno da capire."
      }
    ]
  },
  {
    "version": "1.0.25",
    "paragraphs": [
      {
        "strong": "L'app pesa la metà e si installa molto più in fretta.",
        "text": "L'APK conteneva le librerie per quattro architetture: due vere e due che servono solo agli emulatori da PC — 46 MB su 88 che il telefono doveva comunque verificare e scompattare, ed erano i trenta secondi di «app in preparazione». Ora ci sono solo quelle dei telefoni."
      }
    ]
  },
  {
    "version": "1.0.24",
    "paragraphs": [
      {
        "strong": "Tolta l'alta fedeltà",
        "text": ": non faceva niente. In react-native-webrtc soppressione del rumore e livellamento si configurano una volta per tutta l'app, non sulla singola presa audio, e i vincoli passati al microfono su Android vengono ignorati. L'interruttore riapriva davvero il microfono, ma con gli stessi identici parametri. Resta **Voce più ricca**, che si misura e si sente."
      }
    ]
  },
  {
    "version": "1.0.23",
    "paragraphs": [
      {
        "strong": "Spegnendo «voce più ricca» l'audio torna davvero giù.",
        "text": "Prima si toglieva il tetto invece di riportarlo al valore normale, e togliere un limite non fa scendere nessuno: restava a 64 kbit/s come se l'opzione non avesse ritorno."
      }
    ]
  },
  {
    "version": "1.0.22",
    "paragraphs": [
      {
        "strong": "Le opzioni audio valgono per tutti e due i telefoni",
        "text": ", come già la risoluzione. Cambiandole da uno cambiano anche all'altro — ed è necessario: la voce che senti la manda lui, quindi alzarla solo dalla tua parte non ti fa sentire nessuna differenza."
      }
    ]
  },
  {
    "version": "1.0.21",
    "paragraphs": [
      {
        "strong": "Correzione",
        "text": ": attivando l'alta fedeltà il microfono si riapriva muto e l'altro smetteva di sentirti. Si leggeva se era acceso dopo averlo fermato, e fermarlo lo spegne."
      },
      {
        "strong": "La riga tecnica mostra anche l'audio in uscita",
        "text": ", così «voce più ricca» si può verificare invece di crederci: da spenta sta intorno ai 30 kbit/s, da accesa sale."
      },
      {
        "strong": "Le impostazioni sono divise per sezione",
        "text": ": le opzioni della schermata non stanno più sotto il titolo «Audio», dove sembravano riguardare il suono."
      }
    ]
  },
  {
    "version": "1.0.20",
    "paragraphs": [
      {
        "strong": "Un'opzione per l'audio",
        "text": ", spenta di default, nelle impostazioni."
      },
      {
        "strong": "Voce più ricca",
        "text": "raddoppia il tetto dell'audio, da circa 32 a 64 kbit/s: su Opus la differenza si sente, la voce smette di suonare telefonica. Costa 4 kB/s in più per direzione, niente rispetto al video."
      }
    ]
  },
  {
    "version": "1.0.19",
    "paragraphs": [
      {
        "strong": "Il microfono torna a restare preso",
        "text": "finché sei nel canale, muto compreso. Rilasciarlo quando lo spegni sembrava giusto — lo lasciava usare alle altre app — ma riprendendolo il sistema non restituisce la precedenza, e la dettatura della tastiera se lo prendeva anche a microfono acceso. Su Android l'esclusiva non si può imporre: una presa continua è l'unica cosa che le somiglia."
      }
    ]
  },
  {
    "version": "1.0.18",
    "paragraphs": [
      {
        "strong": "Riprendendo il microfono, Duetto se lo riprende davvero.",
        "text": "Rilasciandolo si lasciava cadere anche il regime audio della conversazione, che è ciò che tiene il microfono per noi: riaccendendolo restava disponibile ad altre app — la tastiera se lo prendeva. Ora il regime viene ridichiarato, insieme all'uscita audio scelta."
      }
    ]
  },
  {
    "version": "1.0.17",
    "paragraphs": [
      {
        "strong": "Il microfono viene rilasciato quando lo spegni",
        "text": ": prima restava occupato — l'indicatore di registrazione di Android restava acceso e nessun'altra app poteva usarlo finché eri nel canale. Ora spegnerlo lo libera davvero, e riaccenderlo lo riprende."
      },
      {
        "strong": "L'etichetta sul riquadrino",
        "text": "è una pastiglia come quella del video grande, non più una fascia grigia da bordo a bordo che copriva una fetta di immagine."
      }
    ]
  },
  {
    "version": "1.0.16",
    "paragraphs": [
      {
        "strong": "Cambiare risoluzione riapre la camera",
        "text": ", con mezzo secondo di nero, su tutti i telefoni allo stesso modo. Il tentativo di evitarlo scendendo — ridurre solo ciò che esce dall'encoder — non funziona ovunque, e riconoscere i telefoni che lo onorano richiedeva una misura che si è rivelata inaffidabile: dava per sordo anche un telefono che ubbidiva. Un meccanismo che non si attiva mai e non lo dice è peggio del difetto che voleva evitare."
      }
    ]
  },
  {
    "version": "1.0.14",
    "paragraphs": [
      {
        "strong": "I comandi si spengono piano",
        "text": ", con un calo continuo di dieci secondi che parte subito. Prima restavano fermi qualche secondo e poi calavano di colpo: un salto che attira l'occhio proprio mentre si vuole guardare altro."
      }
    ]
  },
  {
    "version": "1.0.11",
    "paragraphs": [
      {
        "strong": "Correzione urgente",
        "text": ": accendendo il video l'app si chiudeva. La rete di sicurezza che tiene il riquadrino dentro i bordi scriveva la posizione dentro l'ascoltatore della posizione stessa, che la faceva riscattare all'infinito."
      }
    ]
  },
  {
    "version": "1.0.10",
    "paragraphs": [
      {
        "strong": "Il riquadrino non può più uscire dai bordi",
        "text": ", comunque ci sia arrivato: prima veniva rimesso dentro solo alla fine di un gesto, e ogni strada che lo spostava senza passare di lì lo lasciava fuori."
      }
    ]
  },
  {
    "version": "1.0.9",
    "paragraphs": [
      {
        "strong": "Al ritorno della rete l'immagine resta ferma",
        "text": "sull'ultimo fotogramma invece di diventare nera: il collegamento si riaccende senza smontare il video. È lo stesso motivo per cui le altre app di videochiamata non mostrano il nero — non salvano nulla, semplicemente non distruggono niente."
      }
    ]
  },
  {
    "version": "1.0.8",
    "paragraphs": [
      {
        "strong": "Tenendo premuto «Video»",
        "text": "si scelgono le quattro risoluzioni, come già si fa con «Audio» per l'uscita del suono. La qualità si giudica guardando, e andarla a cercare nelle impostazioni fa perdere di vista proprio ciò che si sta valutando."
      }
    ]
  },
  {
    "version": "1.0.7",
    "paragraphs": [
      {
        "strong": "«Tu» / «Non tu» si attenua",
        "text": "insieme agli altri comandi, invece di restare acceso sopra l'immagine. Non sparisce mai del tutto: chi si sta guardando è l'unica cosa che non si ricava osservando lo schermo."
      }
    ]
  },
  {
    "version": "1.0.6",
    "paragraphs": [
      {
        "strong": "Le note di rilascio scorrono",
        "text": "e stanno dentro lo schermo. Non si chiudono più toccando lo sfondo — era proprio quella comodità a contendere il gesto allo scorrimento, che infatti funzionava solo a tratti."
      }
    ]
  },
  {
    "version": "1.0.5",
    "paragraphs": [
      {
        "strong": "«Tu» / «Non tu» sempre in alto a sinistra",
        "text": ", anche con due video: toccando il riquadrino i due si scambiano, ed è facile perdere il conto di chi si sta guardando. Non si attenua mai insieme agli altri comandi."
      },
      {
        "strong": "Audio e video accesi sono pastiglie bianche",
        "text": ", spenti restano scuri: a doversi vedere di più è ciò che sta funzionando."
      }
    ]
  },
  {
    "version": "1.0.3",
    "paragraphs": [
      {
        "strong": "Icone leggibili.",
        "text": "I comandi non usano più le emoji, che hanno colori propri e una forma decisa dal produttore del telefono: videocamera e microfono, in piccolo, si distinguevano male. Ora sono disegni a tratto bianco, uguali ovunque, con una barra diagonale quando la funzione è spenta. L'ingranaggio delle impostazioni è diventato tre cursori: a raggi, in piccolo, sembrava un sole."
      },
      {
        "strong": "Niente più scheda durante un cambio di rete.",
        "text": "Cambiando wifi o cella ricompariva «L'altro è nel canale», che a ogni transizione diventava un lampeggio. Ora resta il nero: il video sta per tornare, e non è successo nulla che valga la pena raccontare."
      },
      {
        "strong": "Il tuo video resta nel riquadrino",
        "text": "quando la rete cambia, invece di salire a schermo intero e tornare indietro un istante dopo."
      },
      {
        "strong": "Un tocco sull'immagine",
        "text": "nasconde i comandi, invece di limitarsi a richiamarli."
      },
      {
        "strong": "Il pulsante «Gira» dice quale camera è accesa",
        "text": ": una persona sola per la frontale, più persone per quella dietro. Prima la freccia circolare diceva solo cosa avrebbe fatto il pulsante, e per sapere da che parte si era bisognava guardare l'immagine."
      },
      {
        "strong": "Con un solo video a schermo intero",
        "text": "compare «Tu» o «Non tu»: senza riquadrino manca il termine di paragone, e inquadrando una stanza vuota non si capisce chi si sta guardando."
      },
      {
        "strong": "Toccando il nome dell'app",
        "text": "si leggono le note di questa versione e delle precedenti."
      },
      {
        "strong": "Nelle impostazioni",
        "text": ": la qualità si applica al tocco senza «Salva», il server si vede ma si modifica solo chiedendolo, e si possono nascondere del tutto i comandi invece di attenuarli. Le due righe tecniche sotto ai pulsanti — risoluzione, banda, percorso — sono ora facoltative e spente di default."
      },
      {
        "strong": "Ogni compilazione ha il suo numero di versione",
        "text": ": l'ultimo numero avanza da sé, così chiedere «che versione hai» basta a sapere esattamente cosa sta girando."
      }
    ]
  },
  {
    "version": "1.0.0",
    "paragraphs": [
      {
        "strong": "",
        "text": "Prima versione completa."
      },
      {
        "strong": "Un canale, non una chiamata.",
        "text": "Apri l'app e sei dentro; se c'è anche l'altro vi collegate da soli, altrimenti resti raggiungibile e vieni avvisato appena arriva — anche dopo un riavvio del telefono."
      },
      {
        "strong": "Audio e video cifrati end-to-end",
        "text": "direttamente fra i due telefoni. Il server serve solo a farvi trovare, e quando le vostre reti impediscono il collegamento diretto fa da ponte senza poter leggere nulla."
      },
      {
        "strong": "Accoppiamento con otto cifre",
        "text": "dettate a voce, una volta sola e per sempre. Da un telefono già accoppiato si può rifare l'accoppiamento senza sciogliere anche dall'altra parte."
      },
      {
        "strong": "Quattro profili di qualità",
        "text": ", sincronizzati fra i due telefoni: cambiandolo da uno cambia anche all'altro."
      },
      {
        "strong": "Il video",
        "text": ": chi è a schermo intero non viene mai tagliato, il riquadrino ha le proporzioni della sua camera, è trascinabile e ridimensionabile, e resta dove l'hai messo anche dopo aver chiuso l'app. Il tasto Indietro mette l'app nella finestrella di sistema invece di farti uscire."
      }
    ]
  }
];
