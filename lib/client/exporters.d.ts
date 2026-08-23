/**
 * 三个导出汇：Markdown 下载、PDF 下载、PNG 长图。三者共享抽取出的
 * 对话回合列表；均不触碰在线转录 DOM。
 *
 * PDF 路径绝不打开打印窗口：`window.print()` 在部分平台（尤其 Windows
 * Chrome）是窗口模态对话框，会冻结整个浏览器（包括应用标签页）直至
 * 关闭。对话被光栅化后按页高切片、JPEG 编码、组装为最小多页 PDF，
 * 像普通文件一样下载。零对话框、零冻结。
 *
 * 分片光栅 + 流式 PNG（创新回植自 dsh-companion）：
 * - 分片光栅（tiled rasterization）：整篇对话按片高（A4 页高整数倍）
 *   逐片光栅化，片内经 SVG foreignObject 窗口（translateY 位移）渲染到
 *   独立 2x canvas——单 canvas 高度不再是上限，PDF 页数无上限、页界与
 *   片界对齐（页永不跨片），峰值内存恒为「单片」量级；
 * - PNG 长图：流式 PNG 编码器（StreamingPngEncoder）逐片取像素 → 逐行
 *   PNG 过滤（片级自适应选过滤器，跨片行连续性经原始行携带）→
 *   CompressionStream('deflate')（恰为 PNG 规范要求的 zlib 流）增量压缩
 *   → Blob 直下。PNG 规范本身无高度上限，突破旧 16000px 截断；
 * - 无 CompressionStream 的环境退回旧的单 canvas 截断路径（16000px）。
 *
 * 不依赖 cordis 与 React——纯 DOM/canvas 辅助，可对 jsdom 单测
 * （无 canvas 环境下光栅路径优雅降级）。
 */
import type { ExtractedMessage } from './extract.ts';
/**
 * 触发客户端文件下载。
 * @param filename - 下载文件名。
 * @param mime - blob MIME 类型。
 * @param data - blob 载荷。
 */
export declare function downloadBlob(filename: string, mime: string, data: BlobPart): void;
/**
 * 组装导出正文 HTML（PDF 页与长图共享）。
 * @param title - 会话标题。
 * @param messages - 抽取出的对话回合。
 * @returns 正文标记字符串。
 */
export declare function buildExportHtml(title: string, messages: readonly ExtractedMessage[]): string;
/** 导出进度回调：done 已完成片/页数，total 总数。 */
export type RasterProgress = (done: number, total: number) => void;
/** 光栅导出选项：进度回调与取消信号。 */
export interface RasterExportOptions {
    /** 分片进度回调（PNG 按片计数，PDF 按页计数）。 */
    readonly onProgress?: RasterProgress;
    /** 取消信号：触发后正在进行的导出以 AbortError 拒绝。 */
    readonly signal?: AbortSignal;
}
/**
 * CRC-32（多段输入）。纯函数，导出仅为单测。
 * @param parts - 逐段参与校验的字节。
 * @returns CRC-32 值（无符号 32 位）。
 */
export declare function crc32Parts(parts: readonly Uint8Array[]): number;
/**
 * 组装一个 PNG chunk：`length(BE) + type + data + crc32(type ∥ data)(BE)`。
 * 纯函数，导出仅为单测。
 * @param type - 4 字节 ASCII chunk 类型。
 * @param data - chunk 载荷。
 */
export declare function pngChunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer>;
/**
 * IHDR 载荷：宽/高(BE) + 位深 8 + 颜色类型 6(RGBA) + 压缩/过滤/隔行 0。
 * 纯函数，导出仅为单测。
 */
export declare function ihdrBytes(width: number, height: number): Uint8Array<ArrayBuffer>;
/**
 * Paeth 预测子（PNG 过滤器 4）。纯函数，导出仅为单测。
 * @param a - 左邻像素字节。
 * @param b - 上邻像素字节。
 * @param c - 左上邻像素字节。
 */
export declare function paethPredictor(a: number, b: number, c: number): number;
/** 上一原始行的引用（跨分片连续：过滤器 2/4 需要真实的上一行字节）。 */
type PrevRow = Uint8ClampedArray | Uint8Array | undefined;
/**
 * 对一行原始像素应用过滤器，写入 `out[outAt..)`（不含行首 filter 字节）。
 * 纯函数，导出仅为单测。
 * @param filter - PNG 过滤器类型。
 * @param raw - 原始像素数组。
 * @param rowStart - 本行在 raw 中的起始下标。
 * @param bytesPerRow - 每行字节数（宽 × 4，RGBA）。
 * @param prevData - 上一原始行所在数组（undefined = 全零，即整图首行）。
 * @param prevStart - 上一行在 prevData 中的起始下标。
 * @param out - 过滤输出缓冲。
 * @param outAt - 输出起始下标。
 */
export declare function applyFilter(filter: number, raw: Uint8ClampedArray, rowStart: number, bytesPerRow: number, prevData: PrevRow, prevStart: number, out: Uint8Array, outAt: number): void;
/** 单页 PDF 的图像载荷。 */
interface PdfPage {
    /** JPEG 字节（DCTDecode）。 */
    readonly jpeg: Uint8Array;
    /** 逻辑宽度（CSS px）。 */
    readonly widthPx: number;
    /** 逻辑高度（CSS px）。 */
    readonly heightPx: number;
}
/**
 * 组装最小多页 PDF：每页一张 JPEG。
 * @param pages - 按顺序的页面载荷。
 * @returns PDF 文件字节。
 */
export declare function buildPdf(pages: readonly PdfPage[]): Uint8Array<ArrayBuffer>;
/**
 * 导出为 PDF：分片光栅 → 按页切片 → JPEG → 组装自包含多页 PDF 下载。
 * 无打印对话框——应用标签页永不冻结。片高为页高整数倍，页界与片界
 * 对齐（页永不跨片）；页数无上限，峰值内存恒为单片量级。
 * @param title - 会话标题（同时为文件名词干，经安全化）。
 * @param messages - 抽取出的对话回合。
 * @param options - 进度回调与取消信号（可选）。
 * @throws 运行环境无法光栅化时抛出；取消信号触发 AbortError。
 */
export declare function exportPdf(title: string, messages: readonly ExtractedMessage[], options?: RasterExportOptions): Promise<void>;
/**
 * 导出为 PNG 长图：分片光栅 + 流式 PNG 编码 → 单张纵向长图下载。
 * PNG 规范无高度上限，超长对话不再被截断（产品上限见
 * MAX_TOTAL_CSS_HEIGHT，≈176 页 A4）。无 CompressionStream 的环境退回
 * 旧的单 canvas 截断路径（16000px）。
 * @param title - 会话标题（同时为文件名词干，经安全化）。
 * @param messages - 抽取出的对话回合。
 * @param options - 进度回调与取消信号（可选）。
 * @throws 运行环境无法光栅化/编码时抛出；取消信号触发 AbortError。
 */
export declare function exportImage(title: string, messages: readonly ExtractedMessage[], options?: RasterExportOptions): Promise<void>;
export {};
