/**
 * 批量导出服务函数（HTTP 端点与未来的命令面板共用）。
 *
 * 语义对齐 dsh-companion 模块 A 的批量纪律：
 * - sessionIds 先去重，去重后超过 MAX_BATCH_SESSIONS（100）→ 400；
 * - 单会话读取/渲染失败跳过并计数（其余照常入包），循环外的系统性错误上抛；
 * - 条目重名经 -2/-3 后缀去重；全部失败 → 404；
 * - 条目为日志派生的 Markdown（含元信息头与时间戳，见 ./transcript.ts）。
 */
import { HttpError } from './http.ts';
import type { SessionQueryEngine } from './types.ts';
/** 批量导出会话数上限（去重后计数）。 */
export declare const MAX_BATCH_SESSIONS = 100;
/** 批量导出结果（字节未 base64，HTTP 层负责编码）。 */
export interface BatchZipResult {
    fileName: string;
    bytes: Uint8Array;
    /** 读取失败被跳过的会话数。 */
    skipped: number;
}
/**
 * 解析 POST /conv-export/batch 的请求体 sessionIds 字段。
 * @throws 形状不符（非对象 / 非数组 / 空数组 / 含非字符串项）→ 400。
 */
export declare function parseSessionIds(body: unknown): string[];
/**
 * 批量导出多个会话并打包为 Markdown ZIP。
 * @param sessionQuery 会话查询服务（对宿主的唯一依赖）。
 * @param sessionIds 会话 id 列表：先经 Set 去重，去重后数量不得超过
 * MAX_BATCH_SESSIONS；单个会话读取失败会被跳过并计入 skipped，
 * 系统性错误（ZIP 组装等）上抛。
 */
export declare function buildBatchZip(sessionQuery: SessionQueryEngine, sessionIds: readonly string[]): Promise<BatchZipResult>;
/**
 * 将错误收敛为用户安全的 HttpError：
 * HttpError 原样透传；其余错误以通用文案包装，避免泄漏内部细节。
 */
export declare function toSafeHttpError(error: unknown, fallbackMessage: string): HttpError;
