'use strict';

/**
 * Regenerates the social preview image and the favicon package.
 *
 *   node tools/make-images.js
 *
 * Fonts are downloaded to tools/.fonts on first run and are gitignored: the
 * committed PNGs are the deliverable, this script is how to reproduce them.
 */

const fs = require('node:fs');
const path = require('node:path');
const { Resvg } = require('@resvg/resvg-js');
const pngToIco = require('png-to-ico').default;

const ROOT = path.join(__dirname, '..');
const FONT_DIR = path.join(__dirname, '.fonts');
const OUT = path.join(ROOT, 'public');

const FONTS = {
  'BricolageGrotesque.ttf':
    'https://github.com/google/fonts/raw/main/ofl/bricolagegrotesque/BricolageGrotesque%5Bopsz,wdth,wght%5D.ttf',
  'IBMPlexMono-Regular.ttf':
    'https://github.com/google/fonts/raw/main/ofl/ibmplexmono/IBMPlexMono-Regular.ttf',
  'IBMPlexMono-Medium.ttf':
    'https://github.com/google/fonts/raw/main/ofl/ibmplexmono/IBMPlexMono-Medium.ttf',
  'IBMPlexMono-SemiBold.ttf':
    'https://github.com/google/fonts/raw/main/ofl/ibmplexmono/IBMPlexMono-SemiBold.ttf',
  'IBMPlexMono-Bold.ttf':
    'https://github.com/google/fonts/raw/main/ofl/ibmplexmono/IBMPlexMono-Bold.ttf'
};

// Site palette, from public/styles.css.
const PAPER = '#e4e6e1';
const INK = '#1a201d';
const INK_FAINT = '#8b928c';
const STRIKE = '#9d3626';
const KEEP = '#1e5c48';

// IBM Plex Mono is monospaced at 600/1000 em, so text width is exact.
const MONO_ADVANCE = 0.6;
const monoWidth = (text, size) => text.length * MONO_ADVANCE * size;

async function ensureFonts() {
  fs.mkdirSync(FONT_DIR, { recursive: true });
  for (const [name, url] of Object.entries(FONTS)) {
    const dest = path.join(FONT_DIR, name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 10000) continue;
    process.stdout.write(`fetching ${name} ... `);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    console.log('done');
  }
}

function render(svg, width) {
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { fontDirs: [FONT_DIR], loadSystemFonts: false, defaultFontFamily: 'IBM Plex Mono' }
  });
  return r.render().asPng();
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ------------------------------------------------------------ social card */

function socialCard() {
  const W = 1200;
  const H = 630;
  const PAD = 72;

  // One kept parameter and two stripped ones: enough to read the idea at
  // thumbnail size without becoming a wall of text.
  const rows = [
    { sep: '?', key: 'v', value: 'dQw4w9WgXcQ', note: 'kept', cut: false },
    { sep: '&', key: 'list', value: 'RDdQw4w9WgXcQ', note: 'Playlist ID', cut: true },
    { sep: '&', key: 'si', value: '8fK2q', note: 'Share fingerprint', cut: true }
  ];

  const ROW_SIZE = 27;
  const ROW_GAP = 43;
  const rowTop = 428;

  let body = '';

  rows.forEach((row, i) => {
    const y = rowTop + i * ROW_GAP;
    const colour = row.cut ? STRIKE : KEEP;
    const pair = `${row.key}=${row.value}`;
    const pairX = PAD + 34;

    body += `<text x="${PAD}" y="${y}" font-family="IBM Plex Mono" font-weight="400" font-size="${ROW_SIZE}" fill="${INK_FAINT}">${esc(row.sep)}</text>`;
    body += `<text x="${pairX}" y="${y}" font-family="IBM Plex Mono" font-weight="500" font-size="${ROW_SIZE}" fill="${colour}">${esc(pair)}</text>`;

    if (row.cut) {
      // Drawn rather than text-decoration, which resvg does not implement.
      const x2 = pairX + monoWidth(pair, ROW_SIZE);
      body += `<rect x="${pairX}" y="${y - ROW_SIZE * 0.3}" width="${x2 - pairX}" height="2" fill="${colour}"/>`;
    }

    body += `<text x="${W - PAD}" y="${y}" text-anchor="end" font-family="IBM Plex Mono" font-weight="400" font-size="20" fill="${colour}">${esc(row.note)}</text>`;

    // Hairline under every row but the last.
    if (i < rows.length - 1) {
      body += `<rect x="${PAD}" y="${y + 16}" width="${W - PAD * 2}" height="1" fill="${INK}" opacity="0.1"/>`;
    }
  });

  const markName = 'untrackme';
  const markTail = '?si=8fK2q';
  const markSize = 30;
  const tailX = PAD + markName.length * 0.56 * markSize;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>

  <!-- wordmark -->
  <text x="${PAD}" y="${PAD + 24}" font-family="Bricolage Grotesque" font-size="${markSize}" fill="${INK}">${markName}</text>
  <text x="${tailX}" y="${PAD + 24}" font-family="IBM Plex Mono" font-weight="600" font-size="${markSize - 4}" fill="${STRIKE}">${esc(markTail)}</text>
  <rect x="${tailX}" y="${PAD + 13}" width="${monoWidth(markTail, markSize - 4)}" height="3" fill="${STRIKE}"/>

  <!-- headline -->
  <text x="${PAD}" y="${228}" font-family="Bricolage Grotesque" font-size="76" fill="${INK}">Every link you copy</text>
  <text x="${PAD}" y="${306}" font-family="Bricolage Grotesque" font-size="76" fill="${INK}">is carrying something.</text>

  <!-- the dissection -->
  <rect x="${PAD}" y="342" width="${W - PAD * 2}" height="1" fill="${INK}" opacity="0.18"/>
  <text x="${PAD}" y="${384}" font-family="IBM Plex Mono" font-weight="500" font-size="${ROW_SIZE}" fill="${INK}">https://www.youtube.com/watch</text>
  <rect x="${PAD}" y="400" width="${W - PAD * 2}" height="1" fill="${INK}" opacity="0.1"/>
  ${body}

  <!-- footer -->
  <rect x="${PAD}" y="${H - 92}" width="${W - PAD * 2}" height="1" fill="${INK}" opacity="0.18"/>
  <text x="${PAD}" y="${H - 52}" font-family="IBM Plex Mono" font-weight="400" font-size="21" fill="${INK_FAINT}">untrackme.narek.actcollege.am</text>
  <text x="${W - PAD}" y="${H - 52}" text-anchor="end" font-family="IBM Plex Mono" font-weight="400" font-size="21" fill="${INK_FAINT}">No cookies. No analytics. No logs.</text>
</svg>`;
}

/* ------------------------------------------------------------------- icon */

/**
 * The mark is the site's idea at its smallest: a query string with a line
 * through it. At 16px only the strike survives legibly, which is the point.
 */
function iconSvg(size) {
  const s = size;
  const r = Math.round(s * 0.16);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${(r / s) * 32}" fill="${INK}"/>
  <text x="16" y="23.5" text-anchor="middle" font-family="IBM Plex Mono" font-weight="700" font-size="21" fill="${PAPER}">?</text>
  <rect x="3.5" y="14.5" width="25" height="3.2" rx="1.6" fill="#c8503c"/>
</svg>`;
}

/* ------------------------------------------------------------------- main */

(async () => {
  await ensureFonts();

  fs.writeFileSync(path.join(OUT, 'og.png'), render(socialCard(), 1200));
  console.log('public/og.png            1200x630');

  const sizes = [
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512]
  ];
  for (const [name, size] of sizes) {
    fs.writeFileSync(path.join(OUT, name), render(iconSvg(size), size));
    console.log(`public/${name.padEnd(24)} ${size}x${size}`);
  }

  const ico = await pngToIco([render(iconSvg(32), 32), render(iconSvg(48), 48)]);
  fs.writeFileSync(path.join(OUT, 'favicon.ico'), ico);
  console.log('public/favicon.ico       32 + 48');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
