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
 * Lets the camera say when it has been taken away.
 *
 * On 10 October, in the channel, the POCO's camera was opened by the
 * phone's own camera app and then by Google Lens: Android gave it to
 * them, as it does to whatever is in front, and took it from Duetto.
 * The video library is told - "camera disconnected" - and only writes
 * it in the log: for Duetto the camera stayed on, the picture going out
 * stood still, and closing the other apps did not bring it back.
 *
 * Here the camera's own events - disconnected, or an error - end the
 * track, as a browser does with a camera that goes away: the library
 * already has the way to say so (onCapturerEnded, "mediaStreamTrackEnded"
 * in JavaScript), used until now only for screen sharing. The app
 * hears the track end and opens the camera again when it can.
 *
 * Idempotent: if the lines are already there, it does nothing; if the
 * library changed so that they no longer fit, it says so and stops.
 */
const fs = require('fs');
const path = require('path');

const file = path.join(
  __dirname, '..', 'node_modules', 'react-native-webrtc', 'android', 'src', 'main',
  'java', 'com', 'oney', 'WebRTCModule', 'CameraCaptureController.java',
);

if (!fs.existsSync(file)) {
  console.log('CameraCaptureController.java not found: run npm install first');
  process.exit(0);
}

let java = fs.readFileSync(file, 'utf8');
const MARK = 'Duetto: the camera taken away ends the track';
if (java.includes(MARK)) {
  console.log('CameraCaptureController: already told');
  process.exit(0);
}

const edits = [
  [
    '            CameraCaptureController.this.currentDeviceId = cameraIndex == -1 ? null : String.valueOf(cameraIndex);\n'
      + '        }\n'
      + '    };\n',
    '            CameraCaptureController.this.currentDeviceId = cameraIndex == -1 ? null : String.valueOf(cameraIndex);\n'
      + '        }\n'
      + '\n'
      + `        // ${MARK} - see scripts/patch-webrtc-camera.js in Duetto.\n`
      + '        @Override\n'
      + '        public void onCameraDisconnected() {\n'
      + '            super.onCameraDisconnected();\n'
      + '            duettoEnded("disconnected");\n'
      + '        }\n'
      + '\n'
      + '        @Override\n'
      + '        public void onCameraError(String errorDescription) {\n'
      + '            super.onCameraError(errorDescription);\n'
      + '            duettoEnded("error: " + errorDescription);\n'
      + '        }\n'
      + '    };\n'
      + '\n'
      + '    private void duettoEnded(String why) {\n'
      + '        Log.w(TAG, "camera lost (" + why + "): the track ends");\n'
      + '        if (capturerEventsListener != null) capturerEventsListener.onCapturerEnded();\n'
      + '    }\n',
  ],
];

for (const [from, to] of edits) {
  const at = java.indexOf(from);
  if (at < 0 || java.indexOf(from, at + 1) >= 0) {
    console.error(`CameraCaptureController: the library changed, cannot patch near: ${from.trim().slice(0, 80)}`);
    process.exit(1);
  }
  java = java.replace(from, to);
}

fs.writeFileSync(file, java);
console.log('CameraCaptureController: the camera taken away, told');
