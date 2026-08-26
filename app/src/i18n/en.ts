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
  errors: {
    permissionDenied: 'Permission denied',
    noMicrophone: 'Without a microphone you cannot use the channel.',
    noCamera: 'The camera permission is needed to switch the video on.',
    cameraError: 'Camera error',
    micError: 'Microphone error',
    differentKeys: 'Different keys',
    differentKeysBody: 'The two phones do not share the same key: pair them again.',
  },

  news: {
    reachableAgain: '{who} is reachable again ({at}).',
    versionsDiffer: 'Different versions: {here} here, {there} over there',
    versionsDifferOlder: 'Different versions: {here} here, an older one over there',
  },

  quality: {
    saver: 'Saver',
    saverNote: 'up to 640×360 · 300 kbit/s ceiling',
    standard: 'Standard',
    standardNote: 'up to 960×540 · 1.2 Mbit/s ceiling',
    better: 'Better',
    betterNote: 'up to 1280×720 · 2.5 Mbit/s ceiling',
    best: 'Best',
    bestNote: 'up to 1920×1080 · 4 Mbit/s ceiling',
  },

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
    callingYouFrom: '{who} is calling you',
    callingYou: 'Somebody is calling you',
    joinedNamed: '{who} is in the channel',
    joined: 'Someone is in the channel',
  },

  buttons: {
    video: 'Video',
    audio: 'Audio',
    muted: 'Muted',
    flip: 'Flip',
    call: 'Call',
    called: 'Called',
    leave: 'Leave',
  },

  channel: {
    connectionLost: 'Connection lost, reconnecting…',
    linkLost: 'Link lost, reconnecting…',
    linkInterrupted: 'Link interrupted, waiting…',
    youAreInChannel: 'You are in the channel.',
    touchPrefix: ': touch ',
    touchSuffix: ' to let them know.',
    detachedOnPurpose: ': they disconnected Duetto on purpose.',
    phoneNotConnected: ': their phone is not connected.',
    tapToDismiss: 'tap to dismiss',
    leaving: 'Leaving, one moment…',
    peerVoice: 'Their voice',
    muted: 'muted',
    you: 'You',
    notYou: 'Not you',
    hearsYou: 'hears you {pct}',
    youHear: 'you hear {pct}',
    resolution: 'Resolution',
    resolutionHint: 'It holds for both phones: changing it here changes it for the other person too.',
    callThem: 'Call them',
    alarmHint: 'It plays on their phone, at the alarm volume: it is heard even with the ringer low and the phone across the room.',
    leaveTitle: 'Leave the channel?',
    leaveStay: 'Leave and stay available',
    leaveStayNote: 'The channel closes, but you stay reachable and their call still comes through.',
    leaveDetach: 'Leave and become unavailable',
    leaveDetachNote: 'Duetto disconnects altogether: no calls, no notification, and to the other person you are unreachable. Until you open the app again.',
    stayInChannel: 'Stay in the channel',
    audioOutput: 'Audio output',
    moreOutputsHint: 'Connect headphones or a Bluetooth device for more choices.',
    phoneVolume: 'phone {volume}/{max}',
    voiceHint: 'This is how loud you are hearing the other person: the phone\'s call volume, and once that is at its top Duetto keeps raising on its own. It works even where the volume keys change nothing.',
    theOther: 'The other person',
    peerIsWaiting: '{who} is waiting',
    peerMadeUnreachable: '{who} has made themselves unreachable',
    peerUnreachable: '{who} is unreachable',
    connecting: 'connecting…',
    noServer: 'no server',
    here: 'here',
    disconnected: 'disconnected',
    waiting: 'waiting',
    unreachable: 'unreachable',
    connectingToChannel: 'Connecting to the channel...',
    serverUnreachable: 'Server unreachable',
    retryingAutomatically: 'Retrying automatically...',
    youAreInChannelShort: 'You are in the channel',
    phoneClosedApp: ': their phone closed the app on them.',
    callArrivesAnyway: 'The call reaches them all the same. Touch ',
    notInChannelButCall: ': they are not in the channel, but the call reaches them.',
    touchWord: 'Touch ',
    backWhenReopened: 'They will be reachable again when they reopen the app.',
    untilBackNoCall: 'Until they are back, the call cannot reach them.',
    peerInChannel: '{who} is in the channel',
    audioLinkedNoVideo: 'Audio connected · video off',
    micMuted: 'Their microphone is muted',
    directFailed: 'The direct link failed.\nWithout a TURN server some networks prevent it.',
    establishingDirect: 'Establishing the direct link…',
    state: 'state: {state}',
    resolutionLabel: 'Resolution: {quality}',
    linkLabel: 'Link: {path}',
    audioRate: 'audio {kbps} kbit/s',
    latency: 'latency r/t {ms} ms',
    pathLocal: 'direct, same network',
    pathDirect: 'direct between the phones',
    pathRelay: 'through the server',
  },

  alarms: {
    drums: 'Drums',
    drumsNote: 'A short drum roll, twice over. Hard to ignore.',
    kit: 'Drum kit',
    kitNote: 'Two turns around the kit. More music than alarm, but not ignorable.',
    fanfare: 'Fanfare',
    fanfareNote: 'Trumpets, "ta-daaa". Nobody minds being woken like that.',
    horn: 'Car horn',
    hornNote: 'A car horn. Wakes anybody, and annoys them.',
    rooster: 'Rooster',
    roosterNote: 'Cock-a-doodle-doo. It makes whoever was dozing off smile.',
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
