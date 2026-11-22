import { afterEach, describe, expect, it, vi } from 'vitest'
import { timestampedStem } from '../src/client/exporters.ts'

afterEach(() => { vi.useRealTimers() })

describe('timestampedStem', () => {
  it('prefixes the local yyyyMMdd-HHmm timestamp and sanitizes the title', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 23, 0, 36))
    expect(timestampedStem('a/b c')).toBe('20261123-0036-a-b-c')
  })

  it('falls back to conversation for an empty title', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 2, 9, 5))
    expect(timestampedStem('///')).toBe('20260102-0905-conversation')
  })
})
