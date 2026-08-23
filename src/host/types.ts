/**
 * dsh-conv-export 消费的最小宿主服务契约（批量导出专用）。
 *
 * 本插件历史上是纯浏览器插件（宿主半为空注册壳）；批量导出需要跨会话
 * 读取历史对话——浏览器侧无法访问当前会话之外的转录——故宿主半新增
 * 一个只读服务面：webServer（挂载 /conv-export 私有路由）与
 * sessionQuery（列出/读取会话）。接口形状对齐 DeepSeek Harness
 * docs/subsystems/web-server.md 与 session-query.md（与 dsh-companion
 * 的适配层同源）；无存储域、无出站网络请求、无状态。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

/** 会话头信息（listSessions 的返回项）。 */
export interface SessionHeader {
  readonly id: string
  readonly title?: string
  readonly createdAt: number
  readonly updatedAt?: number
}

/** 会话日志事件（append-only、类型化；载荷保持宽松）。 */
export interface SessionEvent {
  readonly type: string
  readonly seq: number
  readonly time: number
  readonly data: unknown
}

/** readSession 的返回：会话头 + 完整事件日志。 */
export interface SessionLogSnapshot {
  readonly session: SessionHeader
  readonly events: readonly SessionEvent[]
}

/** 会话查询引擎（本插件只消费 listSessions / readSession 两个方法）。 */
export interface SessionQueryEngine {
  listSessions(signal?: AbortSignal): Promise<readonly SessionHeader[]>
  readSession(sessionId: string, signal?: AbortSignal): Promise<SessionLogSnapshot>
}

/** Web 路由注册描述符。 */
export interface WebRoute {
  readonly kind: 'exact' | 'prefix'
  /** 绝对路径，不以斜杠结尾。 */
  readonly path: string
  readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

/** Web 服务 seam（宿主提供的同源路由挂载点）。 */
export interface WebServer {
  register(route: WebRoute): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    webServer: WebServer
    sessionQuery: SessionQueryEngine
  }
}
