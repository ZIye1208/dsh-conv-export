/**
 * 批量导出服务函数（HTTP 端点与未来的命令面板共用）。
 *
 * 语义对齐 dsh-companion 模块 A 的批量纪律：
 * - sessionIds 先去重，去重后超过 MAX_BATCH_SESSIONS（100）→ 400；
 * - 单会话读取/渲染失败跳过并计数（其余照常入包），循环外的系统性错误上抛；
 * - 条目重名经 -2/-3 后缀去重；全部失败 → 404；
 * - 条目为日志派生的 Markdown（含元信息头与时间戳，见 ./transcript.ts）。
 */
import { HttpError } from './http.ts'
import { beijingDayKey } from './time.ts'
import { transcriptFromLog, transcriptToMarkdown } from './transcript.ts'
import type { SessionQueryEngine } from './types.ts'
import { buildZip, sanitizeFileName, type ZipEntry } from './zip.ts'

/** 批量导出会话数上限（去重后计数）。 */
export const MAX_BATCH_SESSIONS = 100

/** 文本编码器（条目内容统一 UTF-8）。 */
const encoder = new TextEncoder()

/** 批量导出结果（字节未 base64，HTTP 层负责编码）。 */
export interface BatchZipResult {
  fileName: string
  bytes: Uint8Array
  /** 读取失败被跳过的会话数。 */
  skipped: number
}

/**
 * 解析 POST /conv-export/batch 的请求体 sessionIds 字段。
 * @throws 形状不符（非对象 / 非数组 / 空数组 / 含非字符串项）→ 400。
 */
export function parseSessionIds(body: unknown): string[] {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError('请求体必须是 JSON 对象')
  }
  const raw = (body as Record<string, unknown>).sessionIds
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpError('sessionIds 必填且必须为非空数组')
  }
  const ids: string[] = []
  for (const item of raw as readonly unknown[]) {
    if (typeof item !== 'string' || item.trim().length === 0) {
      throw new HttpError('sessionIds 必须全部为非空字符串')
    }
    ids.push(item.trim())
  }
  return ids
}

/**
 * 批量导出多个会话并打包为 Markdown ZIP。
 * @param sessionQuery 会话查询服务（对宿主的唯一依赖）。
 * @param sessionIds 会话 id 列表：先经 Set 去重，去重后数量不得超过
 * MAX_BATCH_SESSIONS；单个会话读取失败会被跳过并计入 skipped，
 * 系统性错误（ZIP 组装等）上抛。
 */
export async function buildBatchZip(
  sessionQuery: SessionQueryEngine,
  sessionIds: readonly string[],
): Promise<BatchZipResult> {
  if (sessionIds.length === 0) throw new HttpError('sessionIds 不能为空', 400)
  // 去重：避免同一会话被重复导出打包。
  const uniqueIds = [...new Set(sessionIds)]
  if (uniqueIds.length > MAX_BATCH_SESSIONS) {
    throw new HttpError(`批量导出一次最多支持 ${MAX_BATCH_SESSIONS} 个会话`, 400)
  }

  const entries: ZipEntry[] = []
  const usedNames = new Set<string>()
  let skipped = 0
  for (const sessionId of uniqueIds) {
    try {
      const snapshot = await sessionQuery.readSession(sessionId)
      const session = snapshot.session
      const turns = transcriptFromLog(snapshot)
      const base = sanitizeFileName(session.title || session.id)
      entries.push({
        name: uniqueEntryName(usedNames, `${base}.md`),
        data: encoder.encode(transcriptToMarkdown(session, turns, { timestamps: true })),
      })
    } catch {
      // 单会话读取/渲染失败：跳过，其余照常入包。
      skipped += 1
    }
  }
  if (entries.length === 0) throw new HttpError('没有可导出的会话', 404)
  return {
    fileName: `dsh-conversations-${beijingDayKey(Date.now())}.zip`,
    bytes: buildZip(entries),
    skipped,
  }
}

/**
 * 将错误收敛为用户安全的 HttpError：
 * HttpError 原样透传；其余错误以通用文案包装，避免泄漏内部细节。
 */
export function toSafeHttpError(error: unknown, fallbackMessage: string): HttpError {
  if (error instanceof HttpError) return error
  return new HttpError(fallbackMessage, 500)
}

/** ZIP 条目名去重：重名时在扩展名前插入 -2/-3… 序号，防止覆盖。 */
function uniqueEntryName(used: Set<string>, name: string): string {
  if (!used.has(name)) {
    used.add(name)
    return name
  }
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${stem}-${suffix}${ext}`
    if (!used.has(candidate)) {
      used.add(candidate)
      return candidate
    }
  }
}
