import { describe, expect, it } from 'vitest'
import { buildArchiveManifest, buildArchiveViewerHtml, type ArchiveSessionData } from '../src/host/archive.ts'

const sessions: ArchiveSessionData[] = [
  {
    id: 's1',
    title: '分片光栅化讨论',
    createdAt: 1_700_000_000_000,
    turnCount: 2,
    markdown: '# 分片光栅化讨论\n\n### 用户（2023-11-14 22:13）\n\n长图导出怎么做？\n\n### 助手（2023-11-14 22:14）\n\n分片光栅化…',
  },
  {
    id: 's2',
    title: 'ZIP 规范',
    createdAt: 1_700_000_100_000,
    updatedAt: 1_700_000_200_000,
    turnCount: 1,
    markdown: '# ZIP 规范\n\n### 用户（2023-11-14 22:15）\n\nCRC32 是什么？',
  },
]

describe('buildArchiveManifest', () => {
  it('produces a machine-readable index with id→file mapping', () => {
    const json = buildArchiveManifest(
      [
        { id: 's1', title: '分片光栅化讨论', createdAt: 1, turns: 2, file: '分片光栅化讨论.md' },
        { id: 's2', title: 'ZIP 规范', createdAt: 2, updatedAt: 3, turns: 1, file: 'ZIP 规范.md' },
      ],
      { exportedAt: 1_700_000_000_000 },
    )
    const parsed = JSON.parse(json)
    expect(parsed.kind).toBe('dsh-conv-export-archive')
    expect(parsed.version).toBe(1)
    expect(parsed.exportedAt).toBe(1_700_000_000_000)
    expect(parsed.sessions).toEqual([
      { id: 's1', title: '分片光栅化讨论', createdAt: 1, turns: 2, file: '分片光栅化讨论.md' },
      { id: 's2', title: 'ZIP 规范', createdAt: 2, updatedAt: 3, turns: 1, file: 'ZIP 规范.md' },
    ])
  })
})

describe('buildArchiveViewerHtml', () => {
  const html = buildArchiveViewerHtml(sessions, { exportedAt: 1_700_000_000_000 })

  it('is a self-contained HTML document with embedded session data', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('<script id="dsh-archive" type="application/json">')
    expect(html).toContain('</html>')
    // 无外部资源引用：离线 / file:// 可用（无 src=、href= 外链）。
    expect(html).not.toMatch(/(src|href)\s*=\s*["']https?:/)
  })

  it('embeds a valid JSON payload with all sessions and markdown sources', () => {
    const m = /<script id="dsh-archive" type="application\/json">([\s\S]*?)<\/script>/.exec(html)
    expect(m).not.toBeNull()
    const parsed = JSON.parse(m![1]!)
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toMatchObject({ id: 's1', title: '分片光栅化讨论', turnCount: 2 })
    expect(parsed[1]!.markdown).toContain('CRC32')
  })

  it('neutralizes </script> sequences inside embedded data', () => {
    const evil: ArchiveSessionData[] = [
      { id: 'x', title: '</script><script>alert(1)</script>', createdAt: 0, turnCount: 0, markdown: '</script>' },
    ]
    const evilHtml = buildArchiveViewerHtml(evil, { exportedAt: 0 })
    // 嵌入串内不允许出现裸的 </script>（会被解析为标签提前闭合）。
    const payload = /<script id="dsh-archive" type="application\/json">([\s\S]*?)<\/script>/.exec(evilHtml)![1]!
    expect(payload).not.toContain('</script>')
    expect(JSON.parse(payload)[0]!.title).toContain('</script>')
  })

  it('renders interactive controls (search, copy, download, raw view)', () => {
    expect(html).toContain('id="q"')
    expect(html).toContain('id="copy"')
    expect(html).toContain('id="save"')
    expect(html).toContain('id="toggle"')
    // 全文搜索数据源：title + markdown 均已嵌入。
    expect(html).toContain('长图导出怎么做？')
  })
})
