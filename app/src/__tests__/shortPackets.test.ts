import { LossWatch, LONG_AFTER_MS, askPacketLength } from '../shortPackets';

/** readings every `every` ms, `got` and `lost` each, from `from`; the last answer */
function feed(w: LossWatch, from: number, n: number, every: number, got: number, lost: number) {
  let said: ReturnType<LossWatch['add']> = null;
  let at = from;
  for (let i = 0; i < n; i++) {
    at = from + i * every;
    const r = w.add(at, got, lost);
    if (r) said = r;
  }
  return { said, at };
}

describe('short packets for the road', () => {
  test('a road that loses asks for them, at the slow pace too', () => {
    const w = new LossWatch();
    // ten seconds of voice at sixty milliseconds: about 166 packets
    expect(w.add(0, 160, 10)).toBeNull();
    const r = w.add(10_000, 160, 10);
    expect(r?.short).toBe(true);
    expect(r!.pct).toBeCloseTo(5.9, 1);
    expect(w.short).toBe(true);
  });

  test('one bad reading is not a road', () => {
    const w = new LossWatch();
    expect(w.add(0, 100, 40)).toBeNull();
    expect(w.add(10_000, 160, 0)).toBeNull();
    expect(w.add(20_000, 160, 0)).toBeNull();
    expect(w.short).toBe(false);
  });

  test('a loss in a silence is not a road', () => {
    const w = new LossWatch();
    // what DTX sends in silence: a couple of packets a second
    const { said } = feed(w, 0, 10, 2_000, 5, 1);
    expect(said).toBeNull();
  });

  test('a little loss leaves them long', () => {
    const w = new LossWatch();
    const { said } = feed(w, 0, 30, 2_000, 33, 1);
    expect(said).toBeNull();
  });

  test('long again after five calm minutes, not before', () => {
    const w = new LossWatch();
    feed(w, 0, 6, 2_000, 30, 5);
    expect(w.short).toBe(true);
    const almost = feed(w, 20_000, 30, 10_000, 500, 0);
    expect(almost.said).toBeNull();
    expect(w.add(almost.at - 10_000 + LONG_AFTER_MS + 10_000, 500, 0)?.short).toBe(false);
    expect(w.short).toBe(false);
  });

  test('a loss in the calm starts the five minutes again', () => {
    const w = new LossWatch();
    feed(w, 0, 6, 2_000, 30, 5);
    feed(w, 20_000, 20, 10_000, 500, 0);
    expect(w.add(220_000, 500, 20)).toBeNull();
    const { said } = feed(w, 230_000, 25, 10_000, 500, 0);
    expect(said).toBeNull();
    expect(w.short).toBe(true);
  });

  test('a rebuilt counter says nothing', () => {
    const w = new LossWatch();
    expect(w.add(0, -5, 0)).toBeNull();
    expect(w.add(0, 0, 0)).toBeNull();
  });
});

describe('the length our own description asks for', () => {
  // a description offered again, shaped: libwebrtc has copied the old
  // length onto a line of its own, beside the new parameter
  const sdp = [
    'v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111 63',
    'a=rtpmap:111 opus/48000/2',
    'a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1;ptime=20;maxptime=120',
    'a=ptime:60',
    'a=maxptime:120',
    'm=video 9 UDP/TLS/RTP/SAVPF 96',
    'a=rtpmap:96 VP8/90000',
    'a=ptime:60',
    '',
  ].join('\r\n');

  test('goes on the line libwebrtc reads, in the voice alone', () => {
    const [voice, video] = askPacketLength(sdp, 20).split('m=video');
    expect(voice).toContain('a=ptime:20\r\n');
    expect(voice).not.toContain('a=ptime:60');
    expect(voice).toContain('a=maxptime:120\r\n');
    expect(video).toContain('a=ptime:60');
  });

  test('and back', () => {
    expect(askPacketLength(askPacketLength(sdp, 20), 60)).toBe(sdp);
  });

  test('with no such line, as in a first offer, the parameter is enough', () => {
    const first = sdp.replace(/a=ptime:60\r\n/g, '');
    expect(askPacketLength(first, 20)).toBe(first);
  });
});
