import { describe, expect, it } from 'vitest'
import { buildHtmlDocument } from '../src/client/exporters.ts'

describe('buildHtmlDocument', () => {
  it('emits a self-contained document with charset, viewport, title, and inlined styles', () => {
    const doc = buildHtmlDocument('我的会话', '<div class="x-wrap"><h1 class="x-title">我的会话</h1></div>')
    expect(doc.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(doc).toContain('<meta charset="utf-8">')
    expect(doc).toContain('<meta name="viewport"')
    expect(doc).toContain('<title>我的会话</title>')
    // 导出样式表整体内联（无外部依赖）。
    expect(doc).toContain('.x-wrap')
    expect(doc).toContain('.x-md pre')
    expect(doc).toContain('@media print')
    expect(doc).toContain('<body>')
    expect(doc.trimEnd().endsWith('</html>')).toBe(true)
  })

  it('escapes the title for the <title> element', () => {
    const doc = buildHtmlDocument('a<b>&c', '<div></div>')
    expect(doc).toContain('<title>a&lt;b&gt;&amp;c</title>')
  })

  it('embeds the body markup verbatim', () => {
    const doc = buildHtmlDocument('t', '<div class="x-turn"><div class="x-user">你好</div></div>')
    expect(doc).toContain('<div class="x-turn"><div class="x-user">你好</div></div>')
  })
})
