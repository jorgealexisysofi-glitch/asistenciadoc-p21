// Genera los iconos PWA (192x192 y 512x512) en naranja UdeG sin dependencias externas.
// Dibuja un escudo blanco/azul con el texto "P21" sobre fondo naranja y codifica el PNG a mano.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const NARANJA = [0xe8, 0x77, 0x22]
const AZUL = [0x00, 0x3d, 0xa5]
const BLANCO = [0xff, 0xff, 0xff]

// --- Codificación PNG -------------------------------------------------------

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePNG(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  // bytes 10-12: compresión, filtro, entrelazado = 0

  // Cada fila lleva un byte de filtro (0 = None) al inicio
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1)
    raw[rowStart] = 0
    pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- Dibujo ------------------------------------------------------------------

// Fuente pixel 5x7 para "P21"
const FONT = {
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  2: ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
}

/** ¿El punto (u,v) en coords normalizadas [0,1] cae dentro del escudo? */
function dentroDeEscudo(u, v) {
  if (u < 0 || u > 1 || v < 0 || v > 1) return false
  if (v <= 0.6) return true
  // Parte inferior: se estrecha linealmente hasta la punta
  const mitad = 0.5 * (1 - (v - 0.6) / 0.4)
  return Math.abs(u - 0.5) <= mitad
}

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4)
  const k = size / 512 // factor de escala respecto al diseño base de 512px

  // Escudo exterior (blanco) y escudo interior (azul)
  const ext = { x: 104 * k, y: 72 * k, w: 304 * k, h: 384 * k }
  const inset = 30 * k
  const int = {
    x: ext.x + inset,
    y: ext.y + inset,
    w: ext.w - inset * 2,
    h: ext.h - inset * 2,
  }

  // Texto "P21" (5x7 por glifo + 1 col de espacio = 17x7)
  const scale = Math.max(1, Math.round(13 * k))
  const textW = 17 * scale
  const textH = 7 * scale
  const textX = Math.round((size - textW) / 2)
  const textY = Math.round(int.y + int.h * 0.32)
  const glyphs = ['P', '2', '1']

  function textoEn(x, y) {
    const col = Math.floor((x - textX) / scale)
    const row = Math.floor((y - textY) / scale)
    if (row < 0 || row >= 7 || col < 0 || col >= 17) return false
    const glifo = Math.floor(col / 6)
    const colGlifo = col % 6
    if (colGlifo === 5) return false // columna de espacio
    return FONT[glyphs[glifo]][row][colGlifo] === '1'
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color = NARANJA
      const uExt = (x - ext.x) / ext.w
      const vExt = (y - ext.y) / ext.h
      if (dentroDeEscudo(uExt, vExt)) {
        color = BLANCO
        const uInt = (x - int.x) / int.w
        const vInt = (y - int.y) / int.h
        if (dentroDeEscudo(uInt, vInt)) {
          color = textoEn(x, y) ? BLANCO : AZUL
        }
      }
      const i = (y * size + x) * 4
      pixels[i] = color[0]
      pixels[i + 1] = color[1]
      pixels[i + 2] = color[2]
      pixels[i + 3] = 255
    }
  }

  return encodePNG(size, pixels)
}

// --- Salida ------------------------------------------------------------------

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'icons')
mkdirSync(outDir, { recursive: true })

for (const size of [192, 512]) {
  const file = join(outDir, `icon-${size}.png`)
  writeFileSync(file, drawIcon(size))
  console.log(`✔ generado ${file}`)
}
