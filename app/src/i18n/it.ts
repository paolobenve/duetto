import type { Dictionary } from './en';

/** Le parole italiane. La struttura la detta `en`, che è il riferimento. */
export const it: Dictionary = {
  errors: {
    permissionDenied: 'Permesso negato',
    noMicrophone: 'Senza microfono non puoi usare il canale.',
    noCamera: 'Serve il permesso camera per attivare il video.',
    cameraError: 'Errore camera',
    micError: 'Errore microfono',
    differentKeys: 'Chiavi diverse',
    differentKeysBody: 'I due telefoni non condividono la stessa chiave: rifate l’accoppiamento.',
  },

  news: {
    reachableAgain: '{who} è di nuovo raggiungibile ({at}).',
    versionsDiffer: 'Versioni diverse: qui {here}, di là {there}',
    versionsDifferOlder: 'Versioni diverse: qui {here}, di là una più vecchia',
  },

  quality: {
    saver: 'Risparmio',
    saverNote: 'fino a 640×360 · tetto 300 kbit/s',
    standard: 'Standard',
    standardNote: 'fino a 960×540 · tetto 1,2 Mbit/s',
    better: 'Migliore',
    betterNote: 'fino a 1280×720 · tetto 2,5 Mbit/s',
    best: 'Massima',
    bestNote: 'fino a 1920×1080 · tetto 4 Mbit/s',
  },

  audio: {
    speaker: 'Vivavoce',
    earpiece: 'Telefono',
    wired: 'Cuffie',
    bluetooth: 'Bluetooth',
  },

  death: {
    theOther: 'L’altro telefono',
    outOfMemory: 'il telefono era senza memoria',
    crashed: 'l’app è andata in errore',
    frozen: 'l’app si era bloccata',
    stoppedByHand: 'l’app è stata fermata a mano',
    closed: 'l’app è stata chiusa',
    resources: 'il telefono l’ha chiusa per consumi',
    permissions: 'sono cambiati i permessi',
    phoneClosedIt: 'il telefono l’ha chiusa',
    unknown: 'non si sa perché',
    atTime: 'alle {time}',
    onDayAtTime: 'il {date} alle {time}',
    story: '{who} è sparito {when}: {why}. È tornato alle {back}.',
  },

  presence: {
    theOther: 'l’altro',
    inChannel: 'Sei nel canale',
    waiting: 'In attesa',
    bothWaiting: 'In attesa tutti e due',
    noServer: '{ours} · senza collegamento al server',
    withPeer: 'Nel canale con {who}',
    peerInChannel: '{ours} · {who} è nel canale',
    peerWaiting: '{ours} · {who} in attesa',
    peerWaitingTornDown: '{ours} · {who} in attesa (app chiusa dal telefono)',
    peerDetached: '{ours} · {who} si è staccato',
    peerUnreachable: '{ours} · {who} non raggiungibile',
  },

  alert: {
    knockFrom: '{who} ti aspetta nel canale',
    knock: 'Ti aspettano nel canale',
    callingYouFrom: '{who} ti sta chiamando',
    callingYou: 'Ti stanno chiamando',
    joinedNamed: '{who} è nel canale',
    joined: 'C’è qualcuno nel canale',
  },

  language: {
    auto: 'Come il telefono',
    it: 'Italiano',
    en: 'English',
  },
};
