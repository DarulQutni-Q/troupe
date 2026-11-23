/**
 * Pixel diff of two same-sized frames, counted two ways and in three parts.
 *
 * - `exact` counts any channel difference. On a dark theme it is the count
 *   that says how much of the frame really matches.
 * - `perceptual` counts pixelmatch's YIQ distance above
 *   {@link PERCEPTUAL_THRESHOLD}, which ignores small shade differences and
 *   anti-aliased edges, so it flatters the result.
 * - `parts` splits both counts by what the reference painted at the pixel:
 *   `text` (glyph boxes), `icons` (svg and img boxes) and `boxes` (everything
 *   else). Glyph rasterisation differs between renderers, so a layout change
 *   reads in `boxes` and is not hidden among glyph edges.
 */

import { perceptualMask } from './perceptual'
import { blankImage, blit, type Image, readPng, writePng } from './png'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface DiffCount {
  mismatched: number
  /** Share of the pixels counted, 0 to 100. */
  percent: number
}

export const PARTS = ['text', 'icons', 'boxes'] as const
export type Part = (typeof PARTS)[number]

/** Where the reference painted text and icons, in frame pixels. Everything else is a box. */
export interface PartRects {
  text: Rect[]
  icons: Rect[]
}

export interface PartDiff {
  /** Pixels of the frame in this part. */
  pixels: number
  /** Percent of this part's pixels. */
  exact: DiffCount
  perceptual: DiffCount
}

export interface DiffResult {
  width: number
  height: number
  total: number
  exact: DiffCount
  perceptual: DiffCount
  parts: Record<Part, PartDiff>
}

/** pixelmatch's 0..1 colour distance below which two pixels count as equal. */
export const PERCEPTUAL_THRESHOLD = 0.1

/** A part map's byte values, by index. */
const CODE_PART: readonly Part[] = ['boxes', 'text', 'icons']
const TEXT = CODE_PART.indexOf('text')
const ICONS = CODE_PART.indexOf('icons')

/** One byte per pixel naming its part. An icon wins over text where they overlap. */
export function partMap(width: number, height: number, rects?: PartRects): Uint8Array {
  const map = new Uint8Array(width * height)
  const mark = (rect: Rect, code: number) => {
    const x0 = Math.max(0, Math.floor(rect.x))
    const y0 = Math.max(0, Math.floor(rect.y))
    const x1 = Math.min(width, Math.ceil(rect.x + rect.width))
    const y1 = Math.min(height, Math.ceil(rect.y + rect.height))
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) map[y * width + x] = code
  }
  for (const rect of rects?.text ?? []) mark(rect, TEXT)
  for (const rect of rects?.icons ?? []) mark(rect, ICONS)
  return map
}

/** `rects` moved into the coordinates of the `crop` region and clipped to it. */
export function cropRects(rects: PartRects, crop: Rect): PartRects {
  const move = (list: Rect[]) =>
    list
      .map((r) => ({ x: r.x - crop.x, y: r.y - crop.y, width: r.width, height: r.height }))
      .filter(
        (r) => r.x + r.width > 0 && r.y + r.height > 0 && r.x < crop.width && r.y < crop.height
      )
  return { text: move(rects.text), icons: move(rects.icons) }
}

const count = (mismatched: number, of: number): DiffCount => ({
  mismatched,
  percent: of ? (mismatched / of) * 100 : 0
})

export function diffImages(
  a: Image,
  b: Image,
  rects?: PartRects
): { result: DiffResult; image: Image } {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`size mismatch: ${a.width}x${a.height} against ${b.width}x${b.height}`)
  }
  const { width, height } = a
  const total = width * height
  const parts = partMap(width, height, rects)
  const perceptual = perceptualMask(a, b, PERCEPTUAL_THRESHOLD)
  const tally = CODE_PART.map(() => ({ pixels: 0, exact: 0, perceptual: 0 }))
  const image = blankImage(width, height, 255)
  let exact = 0
  let perceptualTotal = 0
  for (let p = 0; p < total; p++) {
    const i = p * 4
    const differs =
      a.data[i] !== b.data[i] ||
      a.data[i + 1] !== b.data[i + 1] ||
      a.data[i + 2] !== b.data[i + 2] ||
      a.data[i + 3] !== b.data[i + 3]
    const part = tally[parts[p]]
    part.pixels++
    if (differs) {
      exact++
      part.exact++
    }
    if (perceptual[p]) {
      perceptualTotal++
      part.perceptual++
      image.data.set([255, 0, 0, 255], i)
    } else if (differs) {
      image.data.set([255, 200, 0, 255], i)
    } else {
      const gray = 255 + (rgbLuma(a.data, i) - 255) * 0.1
      image.data.set([gray, gray, gray, 255], i)
    }
  }
  const partDiffs = Object.fromEntries(
    tally.map((t, code) => [
      CODE_PART[code],
      {
        pixels: t.pixels,
        exact: count(t.exact, t.pixels),
        perceptual: count(t.perceptual, t.pixels)
      }
    ])
  ) as Record<Part, PartDiff>
  return {
    result: {
      width,
      height,
      total,
      exact: count(exact, total),
      perceptual: count(perceptualTotal, total),
      parts: partDiffs
    },
    image
  }
}

const rgbLuma = (data: Uint8Array, i: number) =>
  data[i] * 0.29889531 + data[i + 1] * 0.58662247 + data[i + 2] * 0.11448223

/**
 * Diff two PNG files and write the diff image to `outPath`: red where the
 * frames differ perceptually, amber where they differ only exactly, faded
 * reference elsewhere.
 */
export function diffPngs(
  aPath: string,
  bPath: string,
  outPath: string,
  rects?: PartRects
): DiffResult {
  const { result, image } = diffImages(readPng(aPath), readPng(bPath), rects)
  writePng(outPath, image)
  return result
}

/** Write the `rect` part of a PNG to `outPath`, clamped to the image. Returns the clamped rect. */
export function cropPng(inPath: string, rect: Rect, outPath: string): Rect {
  const src = readPng(inPath)
  const x = Math.max(0, Math.round(rect.x))
  const y = Math.max(0, Math.round(rect.y))
  const width = Math.min(src.width - x, Math.round(rect.width))
  const height = Math.min(src.height - y, Math.round(rect.height))
  const out = blankImage(width, height)
  blit(src, out, x, y, width, height, 0, 0)
  writePng(outPath, out)
  return { x, y, width, height }
}
