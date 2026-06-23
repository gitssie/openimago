// gen-filmstrips — precompute timeline filmstrip SPRITE SHEETS for the mock
// videos (openimago-78m9). Each output is ONE horizontal strip of N evenly-spaced
// 9:16 frames; the NLE timeline renders it statically via CSS background-position
// (no client-side WebCodecs extraction — that was the lag/flicker/white-frame
// source). Run: `node scripts/gen-filmstrips.mjs` from packages/web.
//
// PRODUCTION PATH (real frames): with system ffmpeg OR @ffmpeg/core (WASM)
// available, extract real frames. The exact, reproducible ffmpeg command per
// input (documented so the sprites can be regenerated from real video):
//
//   N=24; W=28; H=50
//   ffmpeg -i <in>.mp4 \
//     -vf "select='not(mod(n\,floor(max(1\,T*FR/N))))',scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},tile=${N}x1" \
//     -frames:v 1 -y <name>.filmstrip.webp
//
// (select every ⌊totalFrames/N⌋-th frame → center-cover scale/crop to 28×50 →
//  tile into one 1×N strip → single webp.) The backend will run the equivalent
//  at artifact-creation time and set result.access.filmstrip; the client path is
//  identical regardless of who generated the sprite.
//
// THIS SANDBOX has no system ffmpeg and @ffmpeg/core (WASM) is not installed
// (only the @ffmpeg/ffmpeg loader, which fetches core from a CDN and needs a
// browser Worker), so this script FALLS BACK to a deterministic gradient sprite
// (hand-rolled PNG via Node zlib — no deps) so the static-render mechanism is
// demoable end-to-end. Replace with the ffmpeg command above for real frames.

import { existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { deflateSync } from 'node:zlib'

const HERE = dirname(fileURLToPath(import.meta.url))
const MOCK_DIR = join(HERE, '..', 'public', 'mock')

const FRAME_W = 28
const FRAME_H = 50
const FRAME_COUNT = 24

// (name, baseHueDeg) — distinct hue per clip so frames read as different content.
const VIDEOS = [
  ['shot-s01', 200],
  ['shot-s02', 280],
  ['shot-s03', 20],
  ['shot-s04', 140],
  ['shot-s05', 330],
  ['shot-s06', 50],
  ['flova-demo', 170],
]

// ── Minimal PNG encoder (RGBA, no deps) ───────────────────────────────────────

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  // 10,11,12 = compression/filter/interlace = 0
  // Raw scanlines with filter byte 0 per row.
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idat = deflateSync(raw)
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// HSL→RGB (s,l in 0..1, h in deg).
function hsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

// Build a 1×N strip: each frame a vertical gradient with a per-frame hue shift +
// a brightness band, so the sprite reads as a varied filmstrip (placeholder for
// real decoded frames).
function buildSprite(baseHue) {
  const W = FRAME_W * FRAME_COUNT
  const H = FRAME_H
  const rgba = Buffer.alloc(W * H * 4)
  for (let f = 0; f < FRAME_COUNT; f++) {
    const hue = (baseHue + f * (200 / FRAME_COUNT)) % 360
    for (let y = 0; y < H; y++) {
      const l = 0.28 + 0.34 * (y / H) // top darker → bottom lighter
      const [r, g, b] = hsl(hue, 0.55, l)
      for (let x = 0; x < FRAME_W; x++) {
        const px = ((y * W) + (f * FRAME_W + x)) * 4
        // faint 1px right separator per frame
        const sep = x === FRAME_W - 1
        rgba[px] = sep ? 10 : r
        rgba[px + 1] = sep ? 10 : g
        rgba[px + 2] = sep ? 15 : b
        rgba[px + 3] = 255
      }
    }
  }
  return encodePng(W, H, rgba)
}

let wrote = 0
for (const [name, hue] of VIDEOS) {
  const mp4 = join(MOCK_DIR, `${name}.mp4`)
  if (!existsSync(mp4)) {
    console.warn(`skip ${name}: ${mp4} not found`)
    continue
  }
  const out = join(MOCK_DIR, `${name}.filmstrip.png`)
  writeFileSync(out, buildSprite(hue))
  wrote++
  console.log(`wrote ${out} (${FRAME_COUNT} frames, ${FRAME_W}x${FRAME_H} each)`)
}
console.log(`\nDone: ${wrote} sprite sheet(s). Frame contract: count=${FRAME_COUNT} w=${FRAME_W} h=${FRAME_H}.`)
console.log('NOTE: gradient placeholders (no system ffmpeg / @ffmpeg/core here).')
console.log('For real frames, run the ffmpeg command in this file header per input.')
