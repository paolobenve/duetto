import type { Dictionary } from './en';

/** Le parole italiane. La struttura la detta `en`, che è il riferimento. */
export const it: Dictionary = {
  quality: {
    saver: 'Risparmio',
    saverNote: 'fino a 640\u00d7360 \u00b7 tetto 300 kbit/s',
    standard: 'Standard',
    standardNote: 'fino a 960\u00d7540 \u00b7 tetto 1,2 Mbit/s',
    better: 'Migliore',
    betterNote: 'fino a 1280\u00d7720 \u00b7 tetto 2,5 Mbit/s',
    best: 'Massima',
    bestNote: 'fino a 1920\u00d71080 \u00b7 tetto 4 Mbit/s',
  },

  audio: {
    speaker: 'Vivavoce',
    earpiece: 'Telefono',
    wired: 'Cuffie',
    bluetooth: 'Bluetooth',
  },

  death: {
    theOther: 'L\u2019altro telefono',
    outOfMemory: 'il telefono era senza memoria',
    crashed: 'l\u2019app \u00e8 andata in errore',
    frozen: 'l\u2019app si era bloccata',
    stoppedByHand: 'l\u2019app \u00e8 stata fermata a mano',
    closed: 'l\u2019app \u00e8 stata chiusa',
    resources: 'il telefono l\u2019ha chiusa per consumi',
    permissions: 'sono cambiati i permessi',
    phoneClosedIt: 'il telefono l\u2019ha chiusa',
    unknown: 'non si sa perch\u00e9',
    atTime: 'alle {time}',
    onDayAtTime: 'il {date} alle {time}',
    story: '{who} \u00e8 sparito {when}: {why}. \u00c8 tornato alle {back}.',
  },

  presence: {
    theOther: 'l\u2019altro',
    inChannel: 'Sei nel canale',
    waiting: 'In attesa',
    bothWaiting: 'In attesa tutti e due',
    noServer: '{ours} \u00b7 senza collegamento al server',
    withPeer: 'Nel canale con {who}',
    peerInChannel: '{ours} \u00b7 {who} \u00e8 nel canale',
    peerWaiting: '{ours} \u00b7 {who} in attesa',
    peerWaitingTornDown: '{ours} \u00b7 {who} in attesa (app chiusa dal telefono)',
    peerDetached: '{ours} \u00b7 {who} si \u00e8 staccato',
    peerUnreachable: '{ours} \u00b7 {who} non raggiungibile',
  },

  alert: {
    knockFrom: '{who} ti aspetta nel canale',
    knock: 'Ti aspettano nel canale',
    joinedNamed: '{who} \u00e8 nel canale',
    joined: 'C\u2019\u00e8 qualcuno nel canale',
  },

  language: {
    auto: 'Come il telefono',
    it: 'Italiano',
    en: 'English',
  },
};
