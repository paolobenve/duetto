// Generato da scripts/build-changelog.js: non modificare a mano.
// La sorgente è CHANGELOG.md alla radice del progetto.
export type NotaVersione = {
  versione: string;
  paragrafi: { forte: string; testo: string }[];
};

export const CHANGELOG: NotaVersione[] = [
  {
    "versione": "1.1.38",
    "paragrafi": [
      {
        "forte": "La vibrazione dell'avviso ora funziona anche se il telefono non vibra per le altre notifiche.",
        "testo": "Era il caso che conta di più: chi tiene il telefono muto e fermo per tutto il resto, e vuole sentire solo questo. La vibrazione stava nel canale di notifica, e da lì un'impostazione di sistema la può spegnere; ora la fa l'app, dichiarandola per quello che è — qualcuno che ti sta cercando, non una notifica qualunque."
      },
      {
        "forte": "E l'avviso si sente anche mentre siete già collegati.",
        "testo": "Prima restava muto proprio nel momento in cui serve di più — l'altro c'è ma non risponde — perché durante una conversazione il telefono silenzia le notifiche, come fa quando sei al telefono. Ora il suono passa dalla via della conversazione, quella dell'avviso di chiamata in attesa."
      }
    ]
  },
  {
    "versione": "1.1.37",
    "paragrafi": [
      {
        "forte": "Il video dell'altro compariva a fatica, e a volte solo riavviando l'app.",
        "testo": "Colpa di una modifica di due versioni fa: da quando il microfono si apre solo all'arrivo dell'altro, fra il controllo «la connessione c'è già?» e la sua creazione passava mezzo secondo, e in quel mezzo secondo ne nascevano due. La seconda vinceva, la prima restava viva a ricevere un video che nessuno guardava più. Ora chi arriva mentre la connessione si sta creando aspetta quella, invece di farne un'altra."
      }
    ]
  },
  {
    "versione": "1.1.35",
    "paragrafi": [
      {
        "forte": "L'app tiene un diario dei consumi.",
        "testo": "Una riga ogni cinque minuti — livello della batteria, schermo acceso o spento, rete, e cosa stava facendo Duetto — per capire quanto costa davvero tenerla in ascolto, invece di discuterne. Ogni telefono manda il proprio diario all'altro una volta all'ora, dentro la stessa busta cifrata di tutto il resto: così collegandone uno solo a un computer si leggono tutti e due. Nel diario non c'è nulla di personale: numeri della batteria e stato dell'app, nessun contenuto di quello che vi dite."
      }
    ]
  },
  {
    "versione": "1.1.33",
    "paragrafi": [
      {
        "forte": "Il promemoria «Sei nel canale, tocca Avvisa per farglielo sapere» si vede anche con la camera accesa.",
        "testo": "Prima stava solo al posto del video: accendendo la propria camera spariva, e restava la propria immagine senza niente che spiegasse perché non succedeva nulla. Ora compare in sovrimpressione, senza la faccia dell'altro — sopra l'immagine peserebbe, e chi guarda sa già chi sta aspettando — e si attenua insieme ai comandi, perché è un promemoria e non un allarme."
      }
    ]
  },
  {
    "versione": "1.1.32",
    "paragrafi": [
      {
        "forte": "Si sceglie come deve farsi sentire l'avviso.",
        "testo": "Nelle impostazioni, sotto «Quando l'altro ti avvisa»: vibrazione — come decide il telefono, sempre, mai — e suono — quello di notifica, nessuno, oppure uno scelto fra quelli del telefono. Un suono diverso dagli altri fa capire chi è senza guardare. Vale per gli avvisi che arrivi tu: quello che sente l'altro lo decide lui."
      },
      {
        "forte": "\"Avvisa\" risponde al dito.",
        "testo": "Premendolo la campanella si mette a suonare — inclinata, con le onde ai lati — e il pulsante perde l'azzurro per un attimo, per poi riaccendersi: prima cambiava solo la scritta sotto, l'azzurro restava spento due secondi buoni, e bussando di nuovo in quell'intervallo non tornava affatto — sembrava un pulsante guastatosi in mano. Il segno parte al tocco, senza aspettare la conferma del server, che può tardare proprio quando la rete va piano."
      },
      {
        "forte": "Quando l'altro esce, il tuo video torna subito a schermo intero.",
        "testo": "Restava piccolo, in attesa di un video che non sarebbe più arrivato: uscendo, il suo stato — microfono e camera accesi — rimaneva scritto da qualche parte come se fosse ancora lì. Ora si distingue chi se n'è andato da chi è caduto: a chi cade il posto resta per sei secondi, che è il tempo di un cambio di rete, così non si vede il proprio video salire a schermo intero e tornare indietro per niente. Lo dice il server, che sa se il telefono ha salutato o è sparito."
      },
      {
        "forte": "\"Gira\" si accende quando riprende la camera frontale.",
        "testo": "Pastiglia bianca con la frontale, spenta con quella dietro: la sola differenza fra le due sagome — una persona o più — si coglie leggendola, mentre il pieno o il vuoto si vede da lontano."
      },
      {
        "forte": "Nella schermata dell'accoppiamento, accanto a «Cambia server» c'è scritto qual è.",
        "testo": "Era l'unica cosa che si voleva sapere prima di toccare quella riga, e bisognava entrarci per scoprirlo."
      }
    ]
  },
  {
    "versione": "1.1.31",
    "paragrafi": [
      {
        "forte": "Aspettare costa molto meno.",
        "testo": "Entrando nel canale il microfono non si apre più subito: si apre quando dall'altra parte arriva davvero qualcuno. Chi entra per primo può aspettare a lungo, e in quell'attesa il telefono registrava per nessuno — con l'indicatore di ascolto acceso, per giunta. Insieme a questa, una modifica sul server: il colpetto che tiene viva la connessione era ogni 30 secondi anche di notte, cioè 120 risvegli della radio ogni ora per non fare niente, e ora si dirada finché si sta soltanto in ascolto. Si infittisce da solo quando si entra nel canale, e quando qualcuno bussa l'altro viene interrogato all'istante: se non c'è più, lo si scopre subito invece di restare davanti a un \"avvisato\" rivolto a nessuno."
      },
      {
        "forte": "\"Gira\" si può premere anche a video spento.",
        "testo": "Non gira niente lì per lì: sceglie con quale camera si accenderà, e l'icona lo mostra. Così si inquadra qualcosa senza far vedere prima, per un istante, la propria faccia. Nello stesso giro sparisce un fastidio: cambiando risoluzione mentre si riprendeva con la camera posteriore, la ripresa tornava sulla frontale da sé."
      }
    ]
  },
  {
    "versione": "1.1.30",
    "paragrafi": [
      {
        "forte": "I tasti del volume ora regolano la voce dell'altro.",
        "testo": "Su certi telefoni — il Motorola Edge 50 Fusion fra questi — premerli non cambiava nulla: il suono della conversazione esce dal volume \"chiamata\", mentre i tasti agivano su quello multimedia, e chi ascoltava se lo teneva com'era, spesso altissimo. Su altri telefoni funzionava già, perché Android tirava a indovinare bene; ora glielo diciamo, invece di sperare."
      }
    ]
  },
  {
    "versione": "1.1.29",
    "paragrafi": [
      {
        "forte": "L'app si chiama Duetto.",
        "testo": "Cambia il nome dappertutto: l'icona, la notifica fissa, gli avvisi, l'indirizzo del server. Per Android però non è la stessa app con un nome nuovo, è un'app diversa: la vecchia DuoTalk resta installata finché non la togli a mano, e Duetto parte vuota. Vanno rifatti l'abbinamento — dettandosi di nuovo il codice a voce o di persona — e le impostazioni, comprese quelle di sistema (batteria senza limiti, avvio automatico), perché Android le tiene legate all'app e non le trasferisce."
      }
    ]
  },
  {
    "versione": "1.0.28",
    "paragrafi": [
      {
        "forte": "L'avvio automatico ora dice la verità.",
        "testo": "La spunta si accendeva solo perché avevi aperto la schermata di sistema, anche senza toccare niente: dichiarava «a posto» senza saperlo. Quell'autorizzazione nessuna app può leggerla — è una schermata del produttore — ma si può sapere se ha funzionato: l'app si annota quando riparte da sola dopo un riavvio, e la spunta si accende solo allora. Finché non riavvii il telefono resta aperta, ed è onesto."
      }
    ]
  },
  {
    "versione": "1.0.27",
    "paragrafi": [
      {
        "forte": "Tolti anche i campi del relay",
        "testo": "dalle impostazioni avanzate: indirizzo e credenziali li manda il server nel messaggio di ingresso, quindi digitarli sul telefono non serviva più. Ne resta una sola da mantenere, sul server, e cambiando la password non si tocca nessun telefono."
      }
    ]
  },
  {
    "versione": "1.0.26",
    "paragrafi": [
      {
        "forte": "Tolto l'access token.",
        "testo": "Era un campo nelle impostazioni avanzate e un controllo sul server, pensato contro gli abusi; sul server era già disattivo da tempo, e la protezione vera è altrove — l'identificativo della coppia nasce da un codice di otto cifre e nulla di ciò che passa dal server è leggibile. Una impostazione in meno da capire."
      }
    ]
  },
  {
    "versione": "1.0.25",
    "paragrafi": [
      {
        "forte": "L'app pesa la metà e si installa molto più in fretta.",
        "testo": "L'APK conteneva le librerie per quattro architetture: due vere e due che servono solo agli emulatori da PC — 46 MB su 88 che il telefono doveva comunque verificare e scompattare, ed erano i trenta secondi di «app in preparazione». Ora ci sono solo quelle dei telefoni."
      }
    ]
  },
  {
    "versione": "1.0.24",
    "paragrafi": [
      {
        "forte": "Tolta l'alta fedeltà",
        "testo": ": non faceva niente. In react-native-webrtc soppressione del rumore e livellamento si configurano una volta per tutta l'app, non sulla singola presa audio, e i vincoli passati al microfono su Android vengono ignorati. L'interruttore riapriva davvero il microfono, ma con gli stessi identici parametri. Resta **Voce più ricca**, che si misura e si sente."
      }
    ]
  },
  {
    "versione": "1.0.23",
    "paragrafi": [
      {
        "forte": "Spegnendo «voce più ricca» l'audio torna davvero giù.",
        "testo": "Prima si toglieva il tetto invece di riportarlo al valore normale, e togliere un limite non fa scendere nessuno: restava a 64 kbit/s come se l'opzione non avesse ritorno."
      }
    ]
  },
  {
    "versione": "1.0.22",
    "paragrafi": [
      {
        "forte": "Le opzioni audio valgono per tutti e due i telefoni",
        "testo": ", come già la risoluzione. Cambiandole da uno cambiano anche all'altro — ed è necessario: la voce che senti la manda lui, quindi alzarla solo dalla tua parte non ti fa sentire nessuna differenza."
      }
    ]
  },
  {
    "versione": "1.0.21",
    "paragrafi": [
      {
        "forte": "Correzione",
        "testo": ": attivando l'alta fedeltà il microfono si riapriva muto e l'altro smetteva di sentirti. Si leggeva se era acceso dopo averlo fermato, e fermarlo lo spegne."
      },
      {
        "forte": "La riga tecnica mostra anche l'audio in uscita",
        "testo": ", così «voce più ricca» si può verificare invece di crederci: da spenta sta intorno ai 30 kbit/s, da accesa sale."
      },
      {
        "forte": "Le impostazioni sono divise per sezione",
        "testo": ": le opzioni della schermata non stanno più sotto il titolo «Audio», dove sembravano riguardare il suono."
      }
    ]
  },
  {
    "versione": "1.0.20",
    "paragrafi": [
      {
        "forte": "Un'opzione per l'audio",
        "testo": ", spenta di default, nelle impostazioni."
      },
      {
        "forte": "Voce più ricca",
        "testo": "raddoppia il tetto dell'audio, da circa 32 a 64 kbit/s: su Opus la differenza si sente, la voce smette di suonare telefonica. Costa 4 kB/s in più per direzione, niente rispetto al video."
      }
    ]
  },
  {
    "versione": "1.0.19",
    "paragrafi": [
      {
        "forte": "Il microfono torna a restare preso",
        "testo": "finché sei nel canale, muto compreso. Rilasciarlo quando lo spegni sembrava giusto — lo lasciava usare alle altre app — ma riprendendolo il sistema non restituisce la precedenza, e la dettatura della tastiera se lo prendeva anche a microfono acceso. Su Android l'esclusiva non si può imporre: una presa continua è l'unica cosa che le somiglia."
      }
    ]
  },
  {
    "versione": "1.0.18",
    "paragrafi": [
      {
        "forte": "Riprendendo il microfono, Duetto se lo riprende davvero.",
        "testo": "Rilasciandolo si lasciava cadere anche il regime audio della conversazione, che è ciò che tiene il microfono per noi: riaccendendolo restava disponibile ad altre app — la tastiera se lo prendeva. Ora il regime viene ridichiarato, insieme all'uscita audio scelta."
      }
    ]
  },
  {
    "versione": "1.0.17",
    "paragrafi": [
      {
        "forte": "Il microfono viene rilasciato quando lo spegni",
        "testo": ": prima restava occupato — l'indicatore di registrazione di Android restava acceso e nessun'altra app poteva usarlo finché eri nel canale. Ora spegnerlo lo libera davvero, e riaccenderlo lo riprende."
      },
      {
        "forte": "L'etichetta sul riquadrino",
        "testo": "è una pastiglia come quella del video grande, non più una fascia grigia da bordo a bordo che copriva una fetta di immagine."
      }
    ]
  },
  {
    "versione": "1.0.16",
    "paragrafi": [
      {
        "forte": "Cambiare risoluzione riapre la camera",
        "testo": ", con mezzo secondo di nero, su tutti i telefoni allo stesso modo. Il tentativo di evitarlo scendendo — ridurre solo ciò che esce dall'encoder — non funziona ovunque, e riconoscere i telefoni che lo onorano richiedeva una misura che si è rivelata inaffidabile: dava per sordo anche un telefono che ubbidiva. Un meccanismo che non si attiva mai e non lo dice è peggio del difetto che voleva evitare."
      }
    ]
  },
  {
    "versione": "1.0.14",
    "paragrafi": [
      {
        "forte": "I comandi si spengono piano",
        "testo": ", con un calo continuo di dieci secondi che parte subito. Prima restavano fermi qualche secondo e poi calavano di colpo: un salto che attira l'occhio proprio mentre si vuole guardare altro."
      }
    ]
  },
  {
    "versione": "1.0.11",
    "paragrafi": [
      {
        "forte": "Correzione urgente",
        "testo": ": accendendo il video l'app si chiudeva. La rete di sicurezza che tiene il riquadrino dentro i bordi scriveva la posizione dentro l'ascoltatore della posizione stessa, che la faceva riscattare all'infinito."
      }
    ]
  },
  {
    "versione": "1.0.10",
    "paragrafi": [
      {
        "forte": "Il riquadrino non può più uscire dai bordi",
        "testo": ", comunque ci sia arrivato: prima veniva rimesso dentro solo alla fine di un gesto, e ogni strada che lo spostava senza passare di lì lo lasciava fuori."
      }
    ]
  },
  {
    "versione": "1.0.9",
    "paragrafi": [
      {
        "forte": "Al ritorno della rete l'immagine resta ferma",
        "testo": "sull'ultimo fotogramma invece di diventare nera: il collegamento si riaccende senza smontare il video. È lo stesso motivo per cui le altre app di videochiamata non mostrano il nero — non salvano nulla, semplicemente non distruggono niente."
      }
    ]
  },
  {
    "versione": "1.0.8",
    "paragrafi": [
      {
        "forte": "Tenendo premuto «Video»",
        "testo": "si scelgono le quattro risoluzioni, come già si fa con «Audio» per l'uscita del suono. La qualità si giudica guardando, e andarla a cercare nelle impostazioni fa perdere di vista proprio ciò che si sta valutando."
      }
    ]
  },
  {
    "versione": "1.0.7",
    "paragrafi": [
      {
        "forte": "«Tu» / «Non tu» si attenua",
        "testo": "insieme agli altri comandi, invece di restare acceso sopra l'immagine. Non sparisce mai del tutto: chi si sta guardando è l'unica cosa che non si ricava osservando lo schermo."
      }
    ]
  },
  {
    "versione": "1.0.6",
    "paragrafi": [
      {
        "forte": "Le note di rilascio scorrono",
        "testo": "e stanno dentro lo schermo. Non si chiudono più toccando lo sfondo — era proprio quella comodità a contendere il gesto allo scorrimento, che infatti funzionava solo a tratti."
      }
    ]
  },
  {
    "versione": "1.0.5",
    "paragrafi": [
      {
        "forte": "«Tu» / «Non tu» sempre in alto a sinistra",
        "testo": ", anche con due video: toccando il riquadrino i due si scambiano, ed è facile perdere il conto di chi si sta guardando. Non si attenua mai insieme agli altri comandi."
      },
      {
        "forte": "Audio e video accesi sono pastiglie bianche",
        "testo": ", spenti restano scuri: a doversi vedere di più è ciò che sta funzionando."
      }
    ]
  },
  {
    "versione": "1.0.3",
    "paragrafi": [
      {
        "forte": "Icone leggibili.",
        "testo": "I comandi non usano più le emoji, che hanno colori propri e una forma decisa dal produttore del telefono: videocamera e microfono, in piccolo, si distinguevano male. Ora sono disegni a tratto bianco, uguali ovunque, con una barra diagonale quando la funzione è spenta. L'ingranaggio delle impostazioni è diventato tre cursori: a raggi, in piccolo, sembrava un sole."
      },
      {
        "forte": "Niente più scheda durante un cambio di rete.",
        "testo": "Cambiando wifi o cella ricompariva «L'altro è nel canale», che a ogni transizione diventava un lampeggio. Ora resta il nero: il video sta per tornare, e non è successo nulla che valga la pena raccontare."
      },
      {
        "forte": "Il tuo video resta nel riquadrino",
        "testo": "quando la rete cambia, invece di salire a schermo intero e tornare indietro un istante dopo."
      },
      {
        "forte": "Un tocco sull'immagine",
        "testo": "nasconde i comandi, invece di limitarsi a richiamarli."
      },
      {
        "forte": "Il pulsante «Gira» dice quale camera è accesa",
        "testo": ": una persona sola per la frontale, più persone per quella dietro. Prima la freccia circolare diceva solo cosa avrebbe fatto il pulsante, e per sapere da che parte si era bisognava guardare l'immagine."
      },
      {
        "forte": "Con un solo video a schermo intero",
        "testo": "compare «Tu» o «Non tu»: senza riquadrino manca il termine di paragone, e inquadrando una stanza vuota non si capisce chi si sta guardando."
      },
      {
        "forte": "Toccando il nome dell'app",
        "testo": "si leggono le note di questa versione e delle precedenti."
      },
      {
        "forte": "Nelle impostazioni",
        "testo": ": la qualità si applica al tocco senza «Salva», il server si vede ma si modifica solo chiedendolo, e si possono nascondere del tutto i comandi invece di attenuarli. Le due righe tecniche sotto ai pulsanti — risoluzione, banda, percorso — sono ora facoltative e spente di default."
      },
      {
        "forte": "Ogni compilazione ha il suo numero di versione",
        "testo": ": l'ultimo numero avanza da sé, così chiedere «che versione hai» basta a sapere esattamente cosa sta girando."
      }
    ]
  },
  {
    "versione": "1.0.0",
    "paragrafi": [
      {
        "forte": "",
        "testo": "Prima versione completa."
      },
      {
        "forte": "Un canale, non una chiamata.",
        "testo": "Apri l'app e sei dentro; se c'è anche l'altro vi collegate da soli, altrimenti resti raggiungibile e vieni avvisato appena arriva — anche dopo un riavvio del telefono."
      },
      {
        "forte": "Audio e video cifrati end-to-end",
        "testo": "direttamente fra i due telefoni. Il server serve solo a farvi trovare, e quando le vostre reti impediscono il collegamento diretto fa da ponte senza poter leggere nulla."
      },
      {
        "forte": "Accoppiamento con otto cifre",
        "testo": "dettate a voce, una volta sola e per sempre. Da un telefono già accoppiato si può rifare l'accoppiamento senza sciogliere anche dall'altra parte."
      },
      {
        "forte": "Quattro profili di qualità",
        "testo": ", sincronizzati fra i due telefoni: cambiandolo da uno cambia anche all'altro."
      },
      {
        "forte": "Il video",
        "testo": ": chi è a schermo intero non viene mai tagliato, il riquadrino ha le proporzioni della sua camera, è trascinabile e ridimensionabile, e resta dove l'hai messo anche dopo aver chiuso l'app. Il tasto Indietro mette l'app nella finestrella di sistema invece di farti uscire."
      }
    ]
  }
];
