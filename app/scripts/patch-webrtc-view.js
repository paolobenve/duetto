#!/usr/bin/env node
/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
/**
 * Lets the video view say when it has stopped drawing.
 *
 * On 9 October the edge saw the POCO's picture frozen for minutes while
 * its own journal had 30 frames a second arriving and decoded: the view
 * that draws them had stopped, and nothing could tell - the app counts
 * frames decoded, not frames drawn. Switching the video off and on did
 * not help; leaving and coming back, which builds the view anew, did.
 *
 * The view lives in react-native-webrtc, in node_modules. Here a few
 * lines are added to it, always the same ones: a light sink that counts
 * the frames reaching the view, and every two seconds a question to the
 * renderer - "has a frame been drawn since?" - by a frame listener with
 * no bitmap, which costs nothing. Frames arriving and none drawn for two
 * questions running, the view tells the app (duetto-render-stalled), and
 * the app builds it anew.
 *
 * Idempotent: if the lines are already there, it does nothing; if the
 * library changed so that they no longer fit, it says so and stops.
 */
const fs = require('fs');
const path = require('path');

const file = path.join(
  __dirname, '..', 'node_modules', 'react-native-webrtc', 'android', 'src', 'main',
  'java', 'com', 'oney', 'WebRTCModule', 'WebRTCView.java',
);

if (!fs.existsSync(file)) {
  console.log('WebRTCView.java not found: run npm install first');
  process.exit(0);
}

let java = fs.readFileSync(file, 'utf8');
const MARK = 'Duetto: the picture drawn, watched';
if (java.includes(MARK)) {
  console.log('WebRTCView: already watched');
  process.exit(0);
}

const edits = [
  [
    '    private boolean onDimensionsChangeEnabled = false;\n',
    `    private boolean onDimensionsChangeEnabled = false;

    // ${MARK} - see scripts/patch-webrtc-view.js in Duetto.
    private final java.util.concurrent.atomic.AtomicInteger duettoArrived =
            new java.util.concurrent.atomic.AtomicInteger();
    private volatile boolean duettoPending = false;
    private int duettoStalledTicks = 0;
    private final org.webrtc.VideoSink duettoCounter = frame -> duettoArrived.incrementAndGet();
    private final org.webrtc.EglRenderer.FrameListener duettoDrawn = bitmap -> duettoPending = false;
    private final Runnable duettoWatch = this::duettoTick;
`,
  ],
  [
    '                    videoTrack.addSink(surfaceViewRenderer);\n',
    '                    videoTrack.addSink(surfaceViewRenderer);\n'
      + '                    videoTrack.addSink(duettoCounter);\n',
  ],
  [
    '                        videoTrack.removeSink(surfaceViewRenderer);\n',
    '                        videoTrack.removeSink(surfaceViewRenderer);\n'
      + '                        videoTrack.removeSink(duettoCounter);\n',
  ],
  [
    '            rendererAttached = true;\n',
    '            rendererAttached = true;\n'
      + '            duettoStalledTicks = 0;\n'
      + '            duettoPending = false;\n'
      + '            duettoArrived.set(0);\n'
      + '            removeCallbacks(duettoWatch);\n'
      + '            postDelayed(duettoWatch, 2000);\n',
  ],
  [
    '            rendererAttached = false;\n',
    '            rendererAttached = false;\n'
      + '            removeCallbacks(duettoWatch);\n',
  ],
];

for (const [from, to] of edits) {
  const at = java.indexOf(from);
  if (at < 0 || java.indexOf(from, at + 1) >= 0) {
    console.error(`WebRTCView: the library changed, cannot patch near: ${from.trim()}`);
    process.exit(1);
  }
  java = java.replace(from, to);
}

const end = java.lastIndexOf('}');
java = java.slice(0, end) + `
    /**
     * Every two seconds while rendering: frames reaching the view, and none
     * drawn since the last question, twice running - the view says so.
     * A new question is asked only once the last one has been answered: a
     * renderer that has stopped would never take the old ones off its list.
     */
    private void duettoTick() {
        if (!rendererAttached || videoTrack == null) return;
        int arrived = duettoArrived.getAndSet(0);
        if (duettoPending && arrived > 10) {
            duettoStalledTicks++;
        } else {
            duettoStalledTicks = 0;
        }
        if (duettoStalledTicks >= 2) {
            duettoStalledTicks = 0;
            try {
                WritableMap m = Arguments.createMap();
                m.putString("streamURL", streamURL);
                m.putInt("arrived", arrived);
                ((ReactContext) getContext())
                        .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                        .emit("duetto-render-stalled", m);
            } catch (Throwable tr) {
                Log.w(TAG, "render stalled, not told: " + tr);
            }
        }
        if (!duettoPending) {
            duettoPending = true;
            try {
                surfaceViewRenderer.addFrameListener(duettoDrawn, 0f);
            } catch (Throwable tr) {
                duettoPending = false;
            }
        }
        postDelayed(duettoWatch, 2000);
    }
}
`;

fs.writeFileSync(file, java);
console.log('WebRTCView: the picture drawn, watched');
