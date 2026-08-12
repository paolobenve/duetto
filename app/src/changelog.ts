// Generato da scripts/build-changelog.js: non modificare a mano.
// La sorgente è CHANGELOG.md alla radice del progetto.
export type NotaVersione = {
  versione: string;
  paragrafi: { forte: string; testo: string }[];
};

export const CHANGELOG: NotaVersione[] = [
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
        "forte": "Due opzioni per l'audio",
        "testo": ", spente di default, nelle impostazioni."
      },
      {
        "forte": "Voce più ricca",
        "testo": "raddoppia il tetto dell'audio, da circa 32 a 64 kbit/s: su Opus la differenza si sente, la voce smette di suonare telefonica. Costa 4 kB/s in più per direzione, niente rispetto al video."
      },
      {
        "forte": "Alta fedeltà",
        "testo": "toglie soppressione del rumore e livellamento automatico: passa tutto, musica compresa, invece di buttare via ciò che non è la voce di chi sta vicino al telefono. La cancellazione dell'eco resta accesa in ogni caso — senza, in vivavoce ti sentiresti di ritorno e la conversazione diventerebbe impossibile. Cambiandola il microfono si riapre, con un istante di silenzio."
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
        "forte": "Riprendendo il microfono, DuoTalk se lo riprende davvero.",
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
