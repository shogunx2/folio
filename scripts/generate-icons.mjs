// Generates Folio PWA icons from a serif "F" glyph rendered with the real
// Instrument Serif font (the app's display face) on a deep-ink background with
// the emerald accent. Pure JS rasterizer (@resvg/resvg-js) — no system deps.
//
//   node scripts/generate-icons.mjs
//
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const outDir = join(root, 'public')
mkdirSync(outDir, { recursive: true })

const fontBuffer = readFileSync(join(here, 'assets', 'InstrumentSerif-Regular.ttf'))

const INK = '#0a0a0c' // deep editorial ink (matches dark --paper family)
const EMERALD = '#1fe08a' // dark-theme accent — vivid on ink

// Build an SVG for a square icon.
// glyphRatio = cap glyph font-size as a fraction of the canvas (controls safe zone).
// rounded = draw a rounded-rect background (for "any" maskable=false icons);
//           false = full-bleed square (maskable / apple-touch, OS applies the mask).
function buildSvg({ size, glyphRatio, rounded }) {
  const fs = Math.round(size * glyphRatio)
  // Instrument Serif cap height ≈ 0.70em; center the cap block vertically.
  const baseline = Math.round(size / 2 + fs * 0.35)
  const bg = rounded
    ? `<rect x="0" y="0" width="${size}" height="${size}" rx="${Math.round(
        size * 0.22,
      )}" ry="${Math.round(size * 0.22)}" fill="${INK}"/>`
    : `<rect x="0" y="0" width="${size}" height="${size}" fill="${INK}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${bg}
  <text x="50%" y="${baseline}" text-anchor="middle" font-family="Instrument Serif" font-size="${fs}" fill="${EMERALD}">F</text>
</svg>`
}

function render(svg, size, outName) {
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    font: { fontBuffers: [fontBuffer], defaultFontFamily: 'Instrument Serif', loadSystemFonts: false },
  })
  const png = r.render().asPng()
  writeFileSync(join(outDir, outName), png)
  console.log('wrote', outName, `(${png.length} bytes)`)
}

const targets = [
  // Standard "any" icons — rounded app-tile look.
  { name: 'pwa-192x192.png', size: 192, glyphRatio: 0.66, rounded: true },
  { name: 'pwa-512x512.png', size: 512, glyphRatio: 0.66, rounded: true },
  // Maskable — full-bleed, glyph inside the ~80% safe zone.
  { name: 'maskable-512x512.png', size: 512, glyphRatio: 0.5, rounded: false },
  // Apple touch icon — iOS rounds corners itself; full-bleed, no transparency.
  { name: 'apple-touch-icon.png', size: 180, glyphRatio: 0.62, rounded: false },
]

for (const t of targets) {
  render(buildSvg({ size: t.size, glyphRatio: t.glyphRatio, rounded: t.rounded }), t.size, t.name)
}
console.log('done')
