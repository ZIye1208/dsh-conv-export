import { describe, expect, it } from 'vitest'
import { previewOf } from '../src/client/controller.ts'

describe('previewOf', () => {
  it('collapses whitespace into single spaces', () => {
    const message = { role: 'user' as const, text: 'a\n\n  b\t\tc  ', html: '' }
    expect(previewOf(message)).toBe('a b c')
  })

  it('truncates beyond 80 chars with an ellipsis', () => {
    const message = { role: 'user' as const, text: 'x'.repeat(100), html: '' }
    const preview = previewOf(message)
    expect(preview).toHaveLength(81) // 80 字符 + 省略号
    expect(preview.endsWith('…')).toBe(true)
    expect(preview.slice(0, 80)).toBe('x'.repeat(80))
  })

  it('keeps short text as-is', () => {
    const message = { role: 'assistant' as const, text: 'short answer', html: '<p>short answer</p>' }
    expect(previewOf(message)).toBe('short answer')
  })

  it('truncates after whitespace collapse, not before', () => {
    // 100 个字符、其中含大量空白：先压缩再截断，预览仍以省略号收尾。
    const message = { role: 'user' as const, text: `${'a b '.repeat(25)}tail`, html: '' }
    const preview = previewOf(message)
    expect(preview.endsWith('…')).toBe(true)
    expect(preview).toHaveLength(81)
  })
})
