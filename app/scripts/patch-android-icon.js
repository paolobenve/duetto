#!/usr/bin/env node
/**
 * Puts Duetto's icon inside android/.
 *
 * WHY A SCRIPT
 * The android/ folder is not in the repository: bootstrap.sh generates
 * it again with React Native's CLI, and the template's icons - the
 * little green robot - would come back with it. Everything that has to
 * survive that regeneration is put back from here, as for the manifest,
 * the ABIs and the theme.
 *
 * WHERE THE ICON COMES FROM
 * assets/icon.png: two telephone handsets, one blue and one green,
 * facing each other and joined by the twisted cord. It is a drawing,
 * not a vector, so nothing is translated here: it is cropped, resized
 * and written in the sizes Android expects.
 *
 * WHAT IT WRITES
 *  - the adaptive icon (Android 8+): a plain white background and a
 *    foreground with the handsets alone, which the phone crops with
 *    whatever mask it likes - round, square, teardrop. The foreground
 *    keeps the handsets inside the safe area, or on a phone with a
 *    round mask the cord would be cut off;
 *  - the monochrome version, which Android 13+ uses for icons tinted to
 *    match the wallpaper: the silhouette, without colours;
 *  - the images for phones before Android 8, in the five sizes, square
 *    and round.
 *
 * It needs ImageMagick. Without it the icons stay as they are and the
 * script says so instead of failing.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const appDir = path.join(__dirname, '..');
const res = path.join(appDir, 'android', 'app', 'src', 'main', 'res');
const source = path.join(appDir, 'assets', 'icon.png');

/** The white of the background: the drawing's own, rounded off. */
const BACKGROUND = '#FFFFFF';

/** The five sizes Android expects for the old icons. */
const SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

/**
 * How much of the canvas the handsets take in the adaptive icon.
 *
 * The adaptive icon's canvas is 108, but the phone shows at most 72 of
 * it, and with a round mask it only guarantees the circle of 66:
 * whatever falls outside that can be cut. The handsets sit inside 66 out
 * of 108, that is 61%, with a margin of safety.
 */
const SAFE_SHARE = 0.62;

if (!fs.existsSync(res)) {
  console.log('icons: android/ is not there yet, skipping.');
  process.exit(0);
}
if (!fs.existsSync(source)) {
  console.log('icons: assets/icon.png is missing, skipping.');
  process.exit(0);
}

function magick(args) {
  execFileSync('convert', args, { stdio: 'pipe' });
}

try {
  execFileSync('convert', ['-version'], { stdio: 'pipe' });
} catch {
  console.log('icons: ImageMagick is not installed, leaving the ones there are.');
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'duetto-icons-'));
const inTmp = (n) => path.join(tmp, n);

// --- 1) The corners -------------------------------------------------------
// The drawing is a white square with round corners on a BLACK ground:
// that black is not part of the icon, it is the emptiness around it. It
// is filled starting from the four corners, so that the colour spreads
// only there and does not touch the dark parts inside the handsets -
// the speakers are black too, but they do not reach the edge.
const SIDE = 1254;
const corners = ['0,0', `${SIDE - 1},0`, `0,${SIDE - 1}`, `${SIDE - 1},${SIDE - 1}`];
const fill = (colour, out) => magick([
  source,
  '-alpha', 'set',
  // A wide fuzz: between the black outside and the white inside there is
  // a gradient of greys - the drawing's softened edge - and leaving it
  // out would mean a grey thread around the icon, which shows plainly on
  // a white ground. The white inside stays out of the reckoning: it is
  // too far from black for this tolerance to take it.
  '-fill', colour, '-fuzz', '48%',
  ...corners.flatMap((p) => ['-draw', `color ${p} floodfill`]),
  out,
]);

// For the adaptive icon's foreground the emptiness becomes white:
// underneath is the white background, and no edge shows.
fill(BACKGROUND, inTmp('full.png'));
// For the old icons it becomes transparent: there the rounded square is
// the icon itself, and filling it with white would make it look like a
// postage stamp.
fill('none', inTmp('cropped.png'));

// --- 2) The foreground ----------------------------------------------------
// The handsets take 933 pixels out of 1254, that is 74% of the drawing.
// Bringing them to 62% of the canvas means widening the canvas around
// them, not shrinking the drawing: white is added all around.
const HANDSETS = 933;
const CANVAS = Math.round(HANDSETS / SAFE_SHARE);
magick([
  inTmp('full.png'),
  '-background', BACKGROUND, '-gravity', 'center',
  '-extent', `${CANVAS}x${CANVAS}`,
  inTmp('foreground.png'),
]);

// --- 3) The silhouette, for the tinted icons ------------------------------
// Everything that is not white becomes solid black; the white
// disappears. It is not a new drawing: it is the same image seen against
// the light. Solid black where the drawing is dark, transparent where it
// is white: the silhouette has to be handed over like that, because it
// is the phone that colours it with its wallpaper's tint. An image
// without transparency would become a big square of solid colour.
magick([
  '(', '-size', `${CANVAS}x${CANVAS}`, 'xc:black', ')',
  '(', inTmp('foreground.png'), '-colorspace', 'gray', '-threshold', '88%', '-negate', ')',
  '-alpha', 'off', '-compose', 'copy_opacity', '-composite',
  inTmp('silhouette.png'),
]);

// --- 4) The sizes ---------------------------------------------------------
let written = 0;
for (const [dpi, side] of Object.entries(SIZES)) {
  const folder = path.join(res, `mipmap-${dpi}`);
  fs.mkdirSync(folder, { recursive: true });

  // The classic icon: the square with round corners, as in the drawing.
  magick([
    inTmp('cropped.png'), '-resize', `${side}x${side}`,
    path.join(folder, 'ic_launcher.png'),
  ]);

  // Round: the same one, cropped to a circle.
  const r = side / 2;
  magick([
    inTmp('full.png'), '-resize', `${side}x${side}`,
    '(', '+clone', '-alpha', 'transparent', '-fill', 'white',
    '-draw', `circle ${r},${r} ${r},0`, ')',
    '-compose', 'copyopacity', '-composite',
    path.join(folder, 'ic_launcher_round.png'),
  ]);

  // Adaptive: a canvas of 108, that is 2.25 times the classic icon.
  const canvas = Math.round(side * 2.25);
  magick([
    inTmp('foreground.png'), '-resize', `${canvas}x${canvas}`,
    path.join(folder, 'ic_launcher_foreground.png'),
  ]);
  magick([
    inTmp('silhouette.png'), '-resize', `${canvas}x${canvas}`,
    path.join(folder, 'ic_launcher_monochrome.png'),
  ]);
  written += 4;
}

// --- 5) The notification icon ---------------------------------------------
// Android draws it in white on a transparent ground, inside a very small
// square: nothing is left of the colours, only the outline counts. It is
// cropped tight around the handsets, because at 24 points the white
// margin of the adaptive canvas would reduce it to a dot.
//
// It goes into the module's resources, not into android/: the code that
// uses it is there, and that folder is regenerated by nobody.
const moduleRes = path.join(
  appDir, 'modules', 'duetto-platform', 'android', 'src', 'main', 'res',
);
const NOTIFICATION_SIZES = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 };
magick([
  inTmp('silhouette.png'),
  '-trim', '+repage',
  '-bordercolor', 'none', '-border', '6%',
  inTmp('silhouette-tight.png'),
]);
for (const [dpi, side] of Object.entries(NOTIFICATION_SIZES)) {
  const folder = path.join(moduleRes, `drawable-${dpi}`);
  fs.mkdirSync(folder, { recursive: true });
  magick([
    inTmp('silhouette-tight.png'),
    '-resize', `${side}x${side}`,
    '-background', 'none', '-gravity', 'center', '-extent', `${side}x${side}`,
    path.join(folder, 'ic_notification.png'),
  ]);
  written += 1;
}

// --- 6) The descriptions --------------------------------------------------
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<!-- Written by scripts/patch-android-icon.js: do not edit by hand. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
`;
const anydpi = path.join(res, 'mipmap-anydpi-v26');
fs.mkdirSync(anydpi, { recursive: true });
fs.writeFileSync(path.join(anydpi, 'ic_launcher.xml'), adaptive);
fs.writeFileSync(path.join(anydpi, 'ic_launcher_round.xml'), adaptive);

fs.mkdirSync(path.join(res, 'values'), { recursive: true });
fs.writeFileSync(
  path.join(res, 'values', 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<!-- Written by scripts/patch-android-icon.js: do not edit by hand. -->
<resources>
    <color name="ic_launcher_background">${BACKGROUND}</color>
</resources>
`,
);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`icons: ${written} images and 3 descriptions, from the handsets of assets/icon.png`);
