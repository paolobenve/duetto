/**
 * The English wording. This file is the reference.
 *
 * Every other language is checked against it by the compiler: a key
 * added here and forgotten elsewhere is an error before the app is even
 * built. The keys read as short sentences rather than codes -
 * `channel.peerWaiting` and not `str_042` - because whoever comes back
 * to a line of code six months later should not have to look the string
 * up somewhere else to know what it says.
 *
 * A `{name}` inside a value is a hole to be filled in at the point of
 * use; the same holes must appear in every translation.
 */
export const en = {
  audio: {
    speaker: 'Speaker',
    // "Earpiece" would suggest headphones: this is the little speaker
    // you hold against your ear.
    earpiece: 'Phone',
    wired: 'Headphones',
    bluetooth: 'Bluetooth',
  },

  death: {
    theOther: 'The other phone',
    outOfMemory: 'the phone had run out of memory',
    crashed: 'the app hit an error',
    frozen: 'the app had frozen',
    stoppedByHand: 'the app was stopped by hand',
    closed: 'the app was closed',
    resources: 'the phone closed it over resource use',
    permissions: 'permissions changed',
    phoneClosedIt: 'the phone closed it',
    unknown: 'nobody knows why',
    atTime: 'at {time}',
    onDayAtTime: 'on {date} at {time}',
    story: '{who} disappeared {when}: {why}. Back at {back}.',
  },

  presence: {
    theOther: 'the other phone',
    inChannel: 'You are in the channel',
    waiting: 'Waiting',
    bothWaiting: 'Both waiting',
    noServer: '{ours} · no link to the server',
    withPeer: 'In the channel with {who}',
    peerInChannel: '{ours} · {who} is in the channel',
    peerWaiting: '{ours} · {who} waiting',
    peerWaitingTornDown: '{ours} · {who} waiting (app closed by the phone)',
    peerDetached: '{ours} · {who} has disconnected',
    peerUnreachable: '{ours} · {who} unreachable',
  },

  alert: {
    knockFrom: '{who} is waiting for you in the channel',
    knock: 'Someone is waiting for you in the channel',
    joinedNamed: '{who} is in the channel',
    joined: 'Someone is in the channel',
  },

  language: {
    auto: 'Same as the phone',
    it: 'Italiano',
    en: 'English',
  },
};

/**
 * The shape every language has to have.
 *
 * Taken from the English one, with the strings widened to `string`: the
 * point is that the KEYS match, not that the words do.
 */
export type Dictionary = {
  [K in keyof typeof en]: { [J in keyof (typeof en)[K]]: string };
};
