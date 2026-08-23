/**
 * 宿主批量导出管线的纯函数测试（zip / transcript / batch）。
 * 与仓库其余 spec 同一纪律：零 mock——所有被测函数均以注入依赖
 * （fake sessionQuery）或纯字节输入工作；ZIP 为 STORE 方式（不压缩），
 * 条目名与内容以明文出现在字节流中，可用 latin1 解码直接断言。
 */
import { describe, expect, it } from 'vitest'
import {
  buildBatchZip,
  MAX_BATCH_SESSIONS,
  parseSessionIds,
  toSafeHttpError,
} from '../src/host/batch.ts'
import { HttpError } from '../src/host/http.ts'
import {
  extractContentText,
  transcriptFromLog,
  transcriptToMarkdown,
} from '../src/host/transcript.ts'
import type { SessionLogSnapshot, SessionQueryEngine } from '../src/host/types.ts'
import { buildZip, sanitizeFileName } from '../src/host/zip.ts'

/** 构造日志快照：events 按 seq 递增，data 形状模拟真实日志。 */
function snapshot(
  id: string,
  title: string,
  events: ReadonlyArray<{ type: string; data?: unknown }>,
): SessionLogSnapshot {
  const base = 1_700_000_000_000
  return {
    session: { id, title, createdAt: base },
    events: events.map((event, index) => ({
      type: event.type,
      seq: index + 1,
      time: base + index * 1000,
      data: event.data,
    })),
  }
}

/** fake 会话查询引擎：failIds 模拟单会话读取失败。 */
function fakeQuery(
  snapshots: Record<string, SessionLogSnapshot>,
  failIds: ReadonlySet<string> = new Set(),
): SessionQueryEngine {
  return {
    listSessions: async () => Object.values(snapshots).map((snap) => snap.session),
    readSession: async (id: string) => {
      if (failIds.has(id)) throw new Error('read failed')
      const snap = snapshots[id]
      if (snap === undefined) throw new Error('missing session')
      return snap
    },
  }
}

/** latin1 解码（STORE 方式 ZIP 的明文断言用）。 */
function latin1(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes)
}

describe('sanitizeFileName', () => {
  it('replaces path-hostile characters with underscores', () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j')
  })

  it('neutralizes leading dots and caps length at 120', () => {
    // 前导点整段折叠为单个下划线（/^\.+/ → '_'）。
    expect(sanitizeFileName('..hidden')).toBe('_hidden')
    expect(sanitizeFileName('x'.repeat(200)).length).toBe(120)
  })

  it('falls back to untitled when nothing remains', () => {
    expect(sanitizeFileName('.')).toBe('_')
  })
})

describe('buildZip (STORE)', () => {
  it('emits valid local header + EOCD with the entry count', () => {
    const bytes = buildZip([
      { name: 'alpha.md', data: new TextEncoder().encode('# alpha\n') },
      { name: 'beta.md', data: new TextEncoder().encode('# beta\n') },
    ])
    // 局部文件头签名 PK\x03\x04。
    expect(latin1(bytes.slice(0, 4))).toBe('PK\u0003\u0004')
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const eocd = bytes.byteLength - 22
    expect(view.getUint32(eocd, true)).toBe(0x06054b50)
    expect(view.getUint16(eocd + 10, true)).toBe(2)
  })

  it('stores entry names and content verbatim (no compression)', () => {
    const bytes = buildZip([{ name: 'alpha.md', data: new TextEncoder().encode('# alpha body\n') }])
    const text = latin1(bytes)
    expect(text).toContain('alpha.md')
    expect(text).toContain('# alpha body')
  })
})

describe('extractContentText', () => {
  it('passes strings through and flattens content blocks', () => {
    expect(extractContentText('hello')).toBe('hello')
    expect(extractContentText([
      { type: 'text', text: 'part one' },
      { type: 'tool_use', name: 'grep' },
      { type: 'tool_result' },
      { type: 'text', text: 'part two' },
    ])).toBe('part one\n[工具调用：grep]\n[工具结果]\npart two')
  })

  it('returns empty for non-content shapes', () => {
    expect(extractContentText(undefined)).toBe('')
    expect(extractContentText(42)).toBe('')
    expect(extractContentText([{ type: 'image' }])).toBe('')
  })
})

describe('transcriptFromLog', () => {
  it('extracts user/assistant turns in seq order and skips empty/other events', () => {
    const snap = snapshot('s1', 'alpha', [
      { type: 'user/message', data: { content: 'question' } },
      { type: 'session/renamed', data: { title: 'x' } },
      { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'answer' }] } } },
      { type: 'user/message', data: { content: '' } },
    ])
    const turns = transcriptFromLog(snap)
    expect(turns.map((turn) => turn.role)).toEqual(['user', 'assistant'])
    expect(turns[0]?.text).toBe('question')
    expect(turns[1]?.text).toBe('answer')
  })

  it('sorts defensively by seq when events arrive out of order', () => {
    const base = 1_700_000_000_000
    const snap: SessionLogSnapshot = {
      session: { id: 's1', title: 't', createdAt: base },
      events: [
        { type: 'assistant/message', seq: 2, time: base + 2, data: { content: 'answer' } },
        { type: 'user/message', seq: 1, time: base + 1, data: { content: 'question' } },
      ],
    }
    expect(transcriptFromLog(snap).map((turn) => turn.text)).toEqual(['question', 'answer'])
  })
})

describe('transcriptToMarkdown', () => {
  it('renders a metadata header plus turn sections', () => {
    const snap = snapshot('s1', 'alpha', [
      { type: 'user/message', data: { content: 'question' } },
      { type: 'assistant/message', data: { content: 'answer' } },
    ])
    const md = transcriptToMarkdown(snap.session, transcriptFromLog(snap), { timestamps: true })
    expect(md).toContain('# alpha')
    expect(md).toContain('会话 ID：s1')
    expect(md).toContain('### 用户')
    expect(md).toContain('### 助手')
    expect(md).toContain('question')
    expect(md).toContain('answer')
  })
})

describe('parseSessionIds', () => {
  it('accepts and trims a non-empty string array', () => {
    expect(parseSessionIds({ sessionIds: [' a ', 'b'] })).toEqual(['a', 'b'])
  })

  it('rejects missing, empty, or malformed payloads', () => {
    expect(() => parseSessionIds({})).toThrow(HttpError)
    expect(() => parseSessionIds({ sessionIds: [] })).toThrow(HttpError)
    expect(() => parseSessionIds({ sessionIds: ['a', 1] })).toThrow(HttpError)
    expect(() => parseSessionIds('nope')).toThrow(HttpError)
  })
})

describe('buildBatchZip', () => {
  const alpha = snapshot('s1', 'alpha', [
    { type: 'user/message', data: { content: 'question one' } },
  ])
  const beta = snapshot('s2', 'beta', [
    { type: 'user/message', data: { content: 'question two' } },
  ])

  it('packs each readable session as a Markdown entry and counts skips', async () => {
    const query = fakeQuery(
      { s1: alpha, s2: beta, s3: alpha },
      new Set(['s3']),
    )
    const result = await buildBatchZip(query, ['s1', 's2', 's3'])
    expect(result.skipped).toBe(1)
    expect(result.fileName).toMatch(/^dsh-conversations-\d{4}-\d{2}-\d{2}\.zip$/)
    const text = latin1(result.bytes)
    expect(text).toContain('alpha.md')
    expect(text).toContain('beta.md')
    expect(text).toContain('# alpha')
    expect(text).toContain('# beta')
    // EOCD 条目数 = 2。
    const view = new DataView(result.bytes.buffer, result.bytes.byteOffset, result.bytes.byteLength)
    expect(view.getUint16(result.bytes.byteLength - 22 + 10, true)).toBe(2)
  })

  it('deduplicates repeated session ids', async () => {
    const query = fakeQuery({ s1: alpha })
    const result = await buildBatchZip(query, ['s1', 's1', 's1'])
    expect(result.skipped).toBe(0)
    const view = new DataView(result.bytes.buffer, result.bytes.byteOffset, result.bytes.byteLength)
    expect(view.getUint16(result.bytes.byteLength - 22 + 10, true)).toBe(1)
  })

  it('suffixes duplicate entry names with -2/-3', async () => {
    const twin = snapshot('s2', 'alpha', [
      { type: 'user/message', data: { content: 'twin body' } },
    ])
    const query = fakeQuery({ s1: alpha, s2: twin })
    const text = latin1((await buildBatchZip(query, ['s1', 's2'])).bytes)
    expect(text).toContain('alpha.md')
    expect(text).toContain('alpha-2.md')
  })

  it('rejects more than MAX_BATCH_SESSIONS unique ids', async () => {
    const query = fakeQuery({})
    const ids = Array.from({ length: MAX_BATCH_SESSIONS + 1 }, (_, i) => `s${i}`)
    await expect(buildBatchZip(query, ids)).rejects.toMatchObject({ status: 400 })
  })

  it('throws 404 when no session is readable', async () => {
    const query = fakeQuery({ s1: alpha }, new Set(['s1']))
    await expect(buildBatchZip(query, ['s1'])).rejects.toMatchObject({ status: 404 })
  })
})

describe('toSafeHttpError', () => {
  it('passes HttpError through and wraps everything else as 500', () => {
    const http = new HttpError('bad input', 400)
    expect(toSafeHttpError(http, 'fallback')).toBe(http)
    const wrapped = toSafeHttpError(new Error('internal detail'), 'fallback')
    expect(wrapped.status).toBe(500)
    expect(wrapped.message).toBe('fallback')
  })
})
