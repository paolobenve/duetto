// Generato da scripts/build-changelog.js: non modificare a mano.
// La sorgente è CHANGELOG.md alla radice del progetto.
export type NotaVersione = {
  versione: string;
  paragrafi: { forte: string; testo: string }[];
};

export const CHANGELOG: NotaVersione[] = [
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
