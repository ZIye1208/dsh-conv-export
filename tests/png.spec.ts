import { describe, expect, it } from 'vitest'
import {
  applyFilter,
  crc32Parts,
  ihdrBytes,
  paethPredictor,
  pngChunk,
} from '../src/client/exporters.ts'

/** ASCII → 字节。 */
function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe('crc32Parts', () => {
  it('matches the canonical CRC-32 check value', () => {
    // "123456789" → 0xCBF43926（CRC-32/ISO-HDLC 标准检验值）。
    expect(crc32Parts([bytes('123456789')])).toBe(0xcbf43926)
  })

  it('is order-sensitive across parts but equals the concatenated input', () => {
    const a = bytes('hello ')
    const b = bytes('world')
    expect(crc32Parts([a, b])).toBe(crc32Parts([bytes('hello world')]))
    expect(crc32Parts([b, a])).not.toBe(crc32Parts([a, b]))
  })
})

describe('pngChunk', () => {
  it('lays out length(BE) + type + data + crc32(BE)', () => {
    const data = bytes('payload')
    const chunk = pngChunk('IHDR', data)
    expect(chunk).toHaveLength(12 + data.byteLength)
    const view = new DataView(chunk.buffer)
    expect(view.getUint32(0)).toBe(data.byteLength)
    expect(new TextDecoder('latin1').decode(chunk.subarray(4, 8))).toBe('IHDR')
    expect(Array.from(chunk.subarray(8, 8 + data.byteLength))).toEqual(Array.from(data))
    // 尾部 CRC 与 crc32Parts(type ∥ data) 一致。
    expect(view.getUint32(8 + data.byteLength)).toBe(crc32Parts([bytes('IHDR'), data]))
  })

  it('emits an empty-payload IEND with a valid CRC', () => {
    const chunk = pngChunk('IEND', new Uint8Array(0))
    expect(chunk).toHaveLength(12)
    expect(new DataView(chunk.buffer).getUint32(0)).toBe(0)
    expect(new TextDecoder('latin1').decode(chunk.subarray(4, 8))).toBe('IEND')
  })
})

describe('ihdrBytes', () => {
  it('encodes width/height big-endian with 8-bit RGBA and zero flags', () => {
    const ihdr = ihdrBytes(1600, 20000)
    const view = new DataView(ihdr.buffer)
    expect(view.getUint32(0)).toBe(1600)
    expect(view.getUint32(4)).toBe(20000)
    expect(ihdr[8]).toBe(8) // 位深
    expect(ihdr[9]).toBe(6) // 颜色类型 RGBA
    expect(ihdr[10]).toBe(0) // 压缩
    expect(ihdr[11]).toBe(0) // 过滤
    expect(ihdr[12]).toBe(0) // 隔行
  })

  it('supports dimensions beyond the legacy 16000px canvas cap', () => {
    const view = new DataView(ihdrBytes(1600, 400000).buffer)
    expect(view.getUint32(4)).toBe(400000)
  })
})

describe('paethPredictor', () => {
  it('returns the nearest of a/b/c (PNG spec examples)', () => {
    // 经典规格样例：等距时按 a → b → c 优先。
    expect(paethPredictor(0, 0, 0)).toBe(0)
    expect(paethPredictor(10, 10, 10)).toBe(10)
    expect(paethPredictor(10, 0, 0)).toBe(10) // pa 最小
    expect(paethPredictor(0, 10, 0)).toBe(10) // pb 最小
    expect(paethPredictor(0, 0, 10)).toBe(0) // pc 最小时回退 a（a=0）
    expect(paethPredictor(5, 9, 3)).toBe(9) // p=11：|6| |2| |8| → pb 最小 → b=9
  })
})

describe('applyFilter', () => {
  /** 造一片 2 像素宽 × 2 行的 RGBA 原始数据（值刻意非平凡）。 */
  const width = 2
  const bytesPerRow = width * 4
  const raw = new Uint8ClampedArray([
    10, 20, 30, 255, 40, 50, 60, 255,
    70, 80, 90, 255, 100, 110, 120, 255,
  ])

  /** 按 PNG 规范反向解码一行（重构原始字节）。 */
  function decodeRow(
    filter: number,
    filtered: Uint8Array,
    at: number,
    prev: Uint8ClampedArray | Uint8Array | undefined,
    prevAt: number,
  ): Uint8Array {
    const row = new Uint8Array(bytesPerRow)
    for (let i = 0; i < bytesPerRow; i += 1) {
      const left = i >= 4 ? row[i - 4]! : 0
      const up = prev !== undefined ? prev[prevAt + i]! : 0
      const upLeft = prev !== undefined && i >= 4 ? prev[prevAt + i - 4]! : 0
      let predictor = 0
      if (filter === 1) predictor = left
      else if (filter === 2) predictor = up
      else if (filter === 4) predictor = paethPredictor(left, up, upLeft)
      row[i] = (filtered[at + i]! + predictor) & 0xff
    }
    return row
  }

  it.each([0, 1, 2, 4] as const)('filter %i round-trips the raw bytes', (filter) => {
    const out = new Uint8Array(bytesPerRow * 2)
    applyFilter(filter, raw, 0, bytesPerRow, undefined, 0, out, 0) // 首行（无上行）
    applyFilter(filter, raw, bytesPerRow, bytesPerRow, raw, 0, out, bytesPerRow) // 次行
    // 解码回首行 + 次行，与原始字节一致（过滤器可逆性）。
    const row0 = decodeRow(filter, out, 0, undefined, 0)
    const row1 = decodeRow(filter, out, bytesPerRow, raw, 0)
    expect(Array.from(row0)).toEqual(Array.from(raw.subarray(0, bytesPerRow)))
    expect(Array.from(row1)).toEqual(Array.from(raw.subarray(bytesPerRow)))
  })

  it('filter 2 (Up) subtracts the previous row bytes', () => {
    const out = new Uint8Array(bytesPerRow)
    applyFilter(2, raw, bytesPerRow, bytesPerRow, raw, 0, out, 0)
    for (let i = 0; i < bytesPerRow; i += 1) {
      expect(out[i]).toBe((raw[bytesPerRow + i]! - raw[i]!) & 0xff)
    }
  })

  it('filter 1 (Sub) subtracts the left pixel with 0 for the first pixel', () => {
    const out = new Uint8Array(bytesPerRow)
    applyFilter(1, raw, 0, bytesPerRow, undefined, 0, out, 0)
    expect(Array.from(out.subarray(0, 4))).toEqual(Array.from(raw.subarray(0, 4)))
    for (let i = 4; i < bytesPerRow; i += 1) {
      expect(out[i]).toBe(raw[i]! - raw[i - 4]!)
    }
  })
})
