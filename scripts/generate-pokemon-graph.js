// scripts/generate-pokemon-graph.js
// This script fetches the public GitHub contributions SVG for a user,
// parses each day cell, maps the contribution count to a Pokémon sprite,
// and generates a new SVG (assets/pokemon-contribution-graph.svg) that
// replaces the "fill" of each day with the corresponding sprite image.
// It is designed to be run in a GitHub Actions workflow (node environment).

const https = require('https');
const fs = require('fs');


const path = require('path');

// GitHub username whose profile contributions are fetched
const USER = process.env.GITHUB_USER || 'jayeshamundkar06-bit';

const spriteMap = [
  {max: 0, file: null}, // keep empty square (no overlay)
  {max: 1, file: 'charmander.png'},
  {max: 3, file: 'charmeleon.png'},
  {max: 6, file: 'charizard.png'},
  {max: 9, file: 'mega-charizard-x.png'},
  {max: Infinity, file: 'mega-charizard-y.png'},
];

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const OUTPUT_SVG = path.join('assets', 'pokemon-contribution-graph.svg');

// Mapping of contribution count ranges to sprite file names.
// Updated to embed PNG data as Base64 data URIs.


// Pre‑load PNG assets as Base64 data URIs for self‑contained SVG.
const base64Sprites = {};
for (const entry of spriteMap) {
  if (entry.file) {
    const filePath = path.join(__dirname, '..', 'assets', entry.file);
    const data = fs.readFileSync(filePath);
    base64Sprites[entry.file] = `data:image/png;base64,${data.toString('base64')}`;
  }
}



function getSprite(count) {
  for (const entry of spriteMap) {
    if (count <= entry.max) return entry.file; // may be null for 0
  }
  return null;
}

function fetchContributionsSvg(username) {
  const url = `https://github.com/users/${username}/contributions`;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseAndGenerate(originalSvg) {
  // Extract the <svg ...> element contents.
  const match = originalSvg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/);
  if (!match) throw new Error('Unable to locate <svg> in contributions page');
  const inner = match[1];
  const header = originalSvg.slice(0, match.index + match[0].indexOf('>') + 1);
  const footer = originalSvg.slice(match.index + match[0].lastIndexOf('<'));

  // Regex for each <rect ... data-count="N" ... x="X" y="Y" ... >
  const rectRegex = /<rect([^>]*?)data-count="(\d+)"([^>]*?)x="(\d+)" y="(\d+)"([^>]*?)\/?>/g;
  let result;
  let newContent = inner;
  while ((result = rectRegex.exec(inner)) !== null) {
    const [full, pre1, countStr, pre2, x, y, post] = result;
    const count = Number(countStr);
    const sprite = getSprite(count);
    if (!sprite) continue; // zero contributions – keep original rect
    const imgHref = base64Sprites[sprite]; // embedded data URI
    // Replace the <rect ...> with an <image> element preserving position and size (width="10" height="10" typical)
    // Determine width/height from existing attributes if present, else default to 10.
    const widthMatch = full.match(/width="(\d+)"/);
    const heightMatch = full.match(/height="(\d+)"/);
    const width = widthMatch ? widthMatch[1] : '10';
    const height = heightMatch ? heightMatch[1] : '10';
    const imageTag = `<image href="${imgHref}" x="${x}" y="${y}" width="${width}" height="${height}"/>`;
    newContent = newContent.replace(full, imageTag);
  }

  // Assemble final SVG.
  return `${header}\n${newContent}\n${footer}`;
}

(async () => {
  try {
    const rawSvg = await fetchContributionsSvg(USER);
    const newSvg = parseAndGenerate(rawSvg);
    // Ensure assets directory exists.
    if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, {recursive: true});
    fs.writeFileSync(path.join(__dirname, '..', OUTPUT_SVG), newSvg, 'utf8');
    console.log('Generated Pokémon contribution SVG at', OUTPUT_SVG);
  } catch (err) {
    console.error('Failed to generate graph:', err);
    process.exit(1);
  }
})();
