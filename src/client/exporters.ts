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
import type { ExtractedMessage } from './extract.ts'
import { safeFileStem } from './extract.ts'
import { t } from './i18n.ts'

/** 光栅宽度（CSS px；2x 视网膜下实际像素翻倍）。 */
const IMAGE_WIDTH = 800
/** 光栅缩放系数（2x 视网膜）。 */
const IMAGE_SCALE = 2
/** PDF 单页高度（IMAGE_WIDTH 宽下的 CSS px，A4 纵横比）。 */
const PAGE_CSS_HEIGHT = Math.round((IMAGE_WIDTH * 297) / 210)
/** 单个光栅分片承载的 A4 页数：片高 = 页高 × 此值（页界与片界对齐）。 */
const PAGES_PER_TILE = 2
/** 分片高度（CSS px）。 */
const TILE_CSS_HEIGHT = PAGE_CSS_HEIGHT * PAGES_PER_TILE
/**
 * 整篇对话光栅总高上限（CSS px，≈176 页 A4）：产品理智上限，
 * 防御极端内存/时长；PNG/PDF 路径共用。
 */
const MAX_TOTAL_CSS_HEIGHT = 200_000
/** 旧路径单 canvas 高度上限（无 CompressionStream 环境的降级截断）。 */
const LEGACY_MAX_HEIGHT = 16000

/**
 * 导出文档根声明（原 body 规则的声明部分）：foreignObject 内没有
 * `<body>` 元素，`body {}` 选择器不生效，故光栅化时把声明直接落到
 * 克隆根节点上；离屏测高阶段仍由真实 DOM 的 body 规则承担。
 */
const ROOT_DECL = 'font: 14px/1.7 -apple-system, \'Segoe UI\', \'PingFang SC\', \'Microsoft YaHei\', sans-serif;'
  + ' color: #1f2328; margin: 0;'

/** 光栅与 PDF 页共享的导出样式表。 */
const EXPORT_CSS = `
  body { ${ROOT_DECL} background: #fff; }
  .x-wrap { max-width: 720px; margin: 0 auto; padding: 32px 24px; }
  .x-title { font-size: 22px; font-weight: 700; margin: 0 0 4px; }
  .x-turn { margin: 0 0 20px; }
  .x-role { font-size: 12px; font-weight: 600; color: #4b5563; margin: 0 0 6px; }
  .x-user { background: #f3f4f6; border-radius: 10px; padding: 10px 14px; white-space: pre-wrap; }
  .x-md pre { background: #f6f8fa; border: 1px solid #e5e7eb; border-radius: 8px;
              padding: 10px 12px; overflow-x: auto; font-size: 12.5px; line-height: 1.55; }
  .x-md code { font-family: ui-monospace, 'Cascadia Code', Consolas, monospace; font-size: .92em; }
  .x-md pre code { background: none; }
  .x-md :not(pre) > code { background: #f3f4f6; border-radius: 4px; padding: 1px 5px; }
  .x-md h1, .x-md h2, .x-md h3 { line-height: 1.35; margin: 18px 0 8px; }
  .x-md h1 { font-size: 19px; } .x-md h2 { font-size: 17px; } .x-md h3 { font-size: 15px; }
  .x-md ul, .x-md ol { padding-left: 22px; margin: 8px 0; }
  .x-md blockquote { border-left: 3px solid #d1d5db; margin: 8px 0; padding: 2px 12px; color: #4b5563; }
  .x-md table { border-collapse: collapse; } .x-md td, .x-md th { border: 1px solid #e5e7eb; padding: 4px 10px; }
`

/**
 * 触发客户端文件下载。
 * @param filename - 下载文件名。
 * @param mime - blob MIME 类型。
 * @param data - blob 载荷。
 */
export function downloadBlob(filename: string, mime: string, data: BlobPart): void {
  const blob = new Blob([data], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => { URL.revokeObjectURL(url) }, 4000)
}

/**
 * 组装导出正文 HTML（PDF 页与长图共享）。
 * @param title - 会话标题。
 * @param messages - 抽取出的对话回合。
 * @returns 正文标记字符串。
 */
export function buildExportHtml(title: string, messages: readonly ExtractedMessage[]): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const turns = messages.map(m => m.role === 'user'
    ? `<div class="x-turn"><p class="x-role">${esc(t('role.user'))}</p><div class="x-user">${esc(m.text)}</div></div>`
    : `<div class="x-turn"><p class="x-role">${esc(t('role.assistant'))}</p><div class="x-md">${m.html}</div></div>`)
    .join('')
  return `<div class="x-wrap"><h1 class="x-title">${esc(title)}</h1>${turns}</div>`
}

/**
 * 将容器内全部 `<img>` 内联为 data: URL，使 SVG foreignObject 光栅可嵌入
 * 图片（SVG 图像内部禁止外部资源请求）。
 * @param root - 就地内联图片的容器。
 */
async function inlineImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'))
  await Promise.all(imgs.map(async img => {
    const src = img.getAttribute('src') ?? ''
    if (src === '' || src.startsWith('data:')) return
    try {
      const res = await fetch(src)
      if (!res.ok) return
      const blob = await res.blob()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => { resolve(String(reader.result)) }
        reader.onerror = () => { reject(reader.error) }
        reader.readAsDataURL(blob)
      })
      img.setAttribute('src', dataUrl)
    } catch {
      // 不可达的图片：直接移除，避免污染/拖垮光栅化。
      img.remove()
    }
  }))
}

/** 导出进度回调：done 已完成片/页数，total 总数。 */
export type RasterProgress = (done: number, total: number) => void

/** 光栅导出选项：进度回调与取消信号。 */
export interface RasterExportOptions {
  /** 分片进度回调（PNG 按片计数，PDF 按页计数）。 */
  readonly onProgress?: RasterProgress
  /** 取消信号：触发后正在进行的导出以 AbortError 拒绝。 */
  readonly signal?: AbortSignal
}

/**
 * 光栅舞台：导出文档的离屏渲染宿主，存活期内保持挂载（克隆源），
 * 支持按窗口分片光栅化。
 */
class RasterStage {
  private constructor(
    private readonly stage: HTMLElement,
    /** 整篇内容高度（CSS px，已封顶 MAX_TOTAL_CSS_HEIGHT）。 */
    readonly totalHeight: number,
  ) {}

  /**
   * 构建舞台：组装导出 HTML → 离屏挂载 → 内联图片 → 布局沉淀 → 测高。
   * @param title - 会话标题。
   * @param messages - 抽取出的对话回合。
   */
  static async create(title: string, messages: readonly ExtractedMessage[]): Promise<RasterStage> {
    const stage = document.createElement('div')
    stage.style.cssText = 'position:fixed;left:-100000px;top:0;'
      + `width:${IMAGE_WIDTH}px;pointer-events:none;z-index:-1;`
    const style = document.createElement('style')
    style.textContent = EXPORT_CSS
    stage.appendChild(style)
    const content = document.createElement('div')
    content.innerHTML = buildExportHtml(title, messages)
    stage.appendChild(content)
    document.body.appendChild(stage)
    try {
      await inlineImages(stage)
      // 等待内联图片完成布局沉淀。
      await new Promise(resolve => { setTimeout(resolve, 60) })
      const totalHeight = Math.max(1, Math.min(Math.ceil(stage.scrollHeight), MAX_TOTAL_CSS_HEIGHT))
      return new RasterStage(stage, totalHeight)
    } catch (error) {
      stage.remove()
      throw error
    }
  }

  /** 移除离屏舞台（幂等）。 */
  dispose(): void {
    this.stage.remove()
  }

  /**
   * 光栅化 `[offset, offset + height)` 窗口到 2x canvas。
   * 窗口经克隆根的 `translateY(−offset)` 位移实现：foreignObject 视口
   * 裁剪视口外内容，浏览器只为窗口内像素付出光栅成本。
   * @param offset - 窗口在整篇文档中的纵向偏移（CSS px）。
   * @param height - 窗口高度（CSS px）。
   * @throws 运行环境无法光栅化时抛出（无 canvas / SVG 解析失败）。
   */
  async tile(offset: number, height: number): Promise<HTMLCanvasElement> {
    // 序列化干净克隆：不带离屏偏移（否则内容会移出 SVG 视口），显式
    // XHTML 命名空间保证 foreignObject 载荷格式合法；原 body 样式声明
    // 直接落到克隆根节点（foreignObject 内无 body 元素）。
    const clone = this.stage.cloneNode(true) as HTMLElement
    clone.setAttribute(
      'style',
      `${ROOT_DECL}width:${IMAGE_WIDTH}px;background:#ffffff;transform:translateY(-${offset}px);`,
    )
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
    const serialized = new XMLSerializer().serializeToString(clone)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${height}">`
      + `<foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`

    // 光栅化前先校验 XML 良构性。
    const probe = new DOMParser().parseFromString(svg, 'image/svg+xml')
    if (probe.querySelector('parsererror') !== null) throw new Error('svg serialize failed')

    const img = new Image()
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    await img.decode()

    const canvas = document.createElement('canvas')
    canvas.width = IMAGE_WIDTH * IMAGE_SCALE
    canvas.height = height * IMAGE_SCALE
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (ctx === null) throw new Error('no 2d context')
    ctx.scale(IMAGE_SCALE, IMAGE_SCALE)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, IMAGE_WIDTH, height)
    ctx.drawImage(img, 0, 0, IMAGE_WIDTH, height)
    return canvas
  }
}

// ---------------------------------------------------------------------------
// 流式 PNG 编码器（零依赖，仅浏览器内置能力）
// ---------------------------------------------------------------------------

/** PNG 签名（8 字节）。 */
const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** CRC-32 查表（多项式 0xedb88320，与 PNG/ZIP 一致）。 */
const PNG_CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

/**
 * CRC-32（多段输入）。纯函数，导出仅为单测。
 * @param parts - 逐段参与校验的字节。
 * @returns CRC-32 值（无符号 32 位）。
 */
export function crc32Parts(parts: readonly Uint8Array[]): number {
  let crc = 0xffffffff
  for (const part of parts) {
    for (let i = 0; i < part.byteLength; i += 1) {
      crc = PNG_CRC_TABLE[(crc ^ part[i]!) & 0xff]! ^ (crc >>> 8)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** ASCII 字节（PNG chunk 类型固定 4 字节 ASCII）。 */
function asciiBytes(text: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 0x7f
  return out
}

/**
 * 组装一个 PNG chunk：`length(BE) + type + data + crc32(type ∥ data)(BE)`。
 * 纯函数，导出仅为单测。
 * @param type - 4 字节 ASCII chunk 类型。
 * @param data - chunk 载荷。
 */
export function pngChunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const typeBytes = asciiBytes(type)
  const out = new Uint8Array(12 + data.byteLength)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.byteLength)
  out.set(typeBytes, 4)
  out.set(data, 8)
  view.setUint32(8 + data.byteLength, crc32Parts([typeBytes, data]))
  return out
}

/**
 * IHDR 载荷：宽/高(BE) + 位深 8 + 颜色类型 6(RGBA) + 压缩/过滤/隔行 0。
 * 纯函数，导出仅为单测。
 */
export function ihdrBytes(width: number, height: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(13)
  const view = new DataView(out.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  out[8] = 8
  out[9] = 6
  out[10] = 0
  out[11] = 0
  out[12] = 0
  return out
}

/**
 * Paeth 预测子（PNG 过滤器 4）。纯函数，导出仅为单测。
 * @param a - 左邻像素字节。
 * @param b - 上邻像素字节。
 * @param c - 左上邻像素字节。
 */
export function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/** PNG 行过滤器候选（0=None 1=Sub 2=Up 4=Paeth；3=Average 极少胜出，略）。 */
type PngFilter = 0 | 1 | 2 | 4
const PNG_FILTERS: readonly PngFilter[] = [0, 1, 2, 4]

/** 上一原始行的引用（跨分片连续：过滤器 2/4 需要真实的上一行字节）。 */
type PrevRow = Uint8ClampedArray | Uint8Array | undefined

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
export function applyFilter(
  filter: number,
  raw: Uint8ClampedArray,
  rowStart: number,
  bytesPerRow: number,
  prevData: PrevRow,
  prevStart: number,
  out: Uint8Array,
  outAt: number,
): void {
  for (let i = 0; i < bytesPerRow; i += 1) {
    const x = raw[rowStart + i]!
    if (filter === 0) {
      out[outAt + i] = x
      continue
    }
    const left = i >= 4 ? raw[rowStart + i - 4]! : 0
    const up = prevData !== undefined ? prevData[prevStart + i]! : 0
    let predictor: number
    if (filter === 1) predictor = left
    else if (filter === 2) predictor = up
    else predictor = paethPredictor(left, up, prevData !== undefined && i >= 4 ? prevData[prevStart + i - 4]! : 0)
    out[outAt + i] = x - predictor
  }
}

/** 过滤器的编码代价启发式：过滤后字节的符号幅值总和，越小越优。 */
function filterCost(
  filter: PngFilter,
  raw: Uint8ClampedArray,
  rowStart: number,
  bytesPerRow: number,
  prevData: PrevRow,
  prevStart: number,
): number {
  let cost = 0
  for (let i = 0; i < bytesPerRow; i += 1) {
    const x = raw[rowStart + i]!
    if (filter === 0) {
      cost += x < 128 ? x : 256 - x
      continue
    }
    const left = i >= 4 ? raw[rowStart + i - 4]! : 0
    const up = prevData !== undefined ? prevData[prevStart + i]! : 0
    let predictor: number
    if (filter === 1) predictor = left
    else if (filter === 2) predictor = up
    else predictor = paethPredictor(left, up, prevData !== undefined && i >= 4 ? prevData[prevStart + i - 4]! : 0)
    const v = (x - predictor) & 0xff
    cost += v < 128 ? v : 256 - v
  }
  return cost
}

/**
 * 片级自适应过滤器选择：均匀采样若干行，对候选过滤器累计代价取最小。
 * 逐行全量自适应在超长图（数十万行）下代价过高，片级选择把选择开销
 * 压到可忽略，同时保留主要的压缩收益。
 */
function pickTileFilter(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  carriedPrev: PrevRow,
): PngFilter {
  const bytesPerRow = width * 4
  const step = Math.max(1, Math.floor(height / 16))
  const costs = [0, 0, 0, 0]
  for (let y = 0; y < height; y += step) {
    const rowStart = y * bytesPerRow
    for (let c = 0; c < PNG_FILTERS.length; c += 1) {
      const filter = PNG_FILTERS[c]!
      if (y === 0) {
        costs[c] = costs[c]! + filterCost(filter, data, rowStart, bytesPerRow, carriedPrev, 0)
      } else {
        costs[c] = costs[c]! + filterCost(filter, data, rowStart, bytesPerRow, data, rowStart - bytesPerRow)
      }
    }
  }
  let best = 0
  for (let c = 1; c < costs.length; c += 1) {
    if (costs[c]! < costs[best]!) best = c
  }
  return PNG_FILTERS[best]!
}

/** CompressionStream 的结构化视图（规避各端 DOM 类型声明差异）。 */
interface DeflateStreamParts {
  readonly writable: WritableStream<Uint8Array | ArrayBuffer>
  readonly readable: ReadableStream<Uint8Array | ArrayBuffer>
}

/**
 * 流式 PNG 编码器：逐片消费 canvas 像素，增量产出 zlib 压缩的 IDAT
 * 数据，finish 时组装完整 PNG Blob。峰值内存 ≈ 单片原始像素 + 压缩输出。
 */
class StreamingPngEncoder {
  private readonly writer: WritableStreamDefaultWriter<Uint8Array | ArrayBuffer>
  private readonly outputChunks: Uint8Array[] = []
  private readonly pump: Promise<void>
  private pumpError: unknown
  private carriedPrev: PrevRow
  private finished = false

  constructor(
    private readonly widthPx: number,
    private readonly heightPx: number,
  ) {
    // 'deflate' 恰产出 zlib(RFC1950) 流——正是 PNG IDAT 的规范格式。
    const streams = new CompressionStream('deflate') as unknown as DeflateStreamParts
    this.writer = streams.writable.getWriter()
    const reader = streams.readable.getReader()
    // 并行泵：边写入边收集压缩输出（TransformStream 背压自动节流写入侧）。
    this.pump = (async () => {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (value !== undefined) {
          this.outputChunks.push(value instanceof Uint8Array ? value : new Uint8Array(value))
        }
      }
    })().catch((error: unknown) => {
      this.pumpError = error
    })
  }

  /** 消费一片 canvas：逐行过滤（片级自适应过滤器）→ 单次 write 增量压缩。 */
  async pushTile(tile: HTMLCanvasElement): Promise<void> {
    if (this.finished) throw new Error('png encoder already finished')
    const ctx = tile.getContext('2d', { willReadFrequently: true })
    if (ctx === null) throw new Error('no 2d context')
    const { data, width, height } = ctx.getImageData(0, 0, tile.width, tile.height)
    const bytesPerRow = width * 4
    const filter = pickTileFilter(data, width, height, this.carriedPrev)
    const out = new Uint8Array((bytesPerRow + 1) * height)
    let at = 0
    for (let y = 0; y < height; y += 1) {
      out[at] = filter
      at += 1
      const rowStart = y * bytesPerRow
      if (y === 0) {
        applyFilter(filter, data, rowStart, bytesPerRow, this.carriedPrev, 0, out, at)
      } else {
        applyFilter(filter, data, rowStart, bytesPerRow, data, rowStart - bytesPerRow, out, at)
      }
      at += bytesPerRow
    }
    // 携带本片最后一行原始字节：下一片首行的 Up/Paeth 过滤需要真实上一行。
    this.carriedPrev = data.slice((height - 1) * bytesPerRow, height * bytesPerRow)
    await this.writer.write(out)
  }

  /** 关闭压缩流并组装完整 PNG Blob。 */
  async finish(): Promise<Blob> {
    if (this.finished) throw new Error('png encoder already finished')
    this.finished = true
    let closeError: unknown
    try {
      await this.writer.close()
    } catch (error) {
      closeError = error
    }
    await this.pump
    if (this.pumpError !== undefined) throw this.pumpError
    if (closeError !== undefined) throw closeError
    const parts: BlobPart[] = [PNG_SIGNATURE, pngChunk('IHDR', ihdrBytes(this.widthPx, this.heightPx))]
    for (const chunk of this.outputChunks) parts.push(pngChunk('IDAT', chunk))
    parts.push(pngChunk('IEND', new Uint8Array(0)))
    return new Blob(parts, { type: 'image/png' })
  }
}

// ---------------------------------------------------------------------------
// PDF 组装与导出
// ---------------------------------------------------------------------------

/** 单页 PDF 的图像载荷。 */
interface PdfPage {
  /** JPEG 字节（DCTDecode）。 */
  readonly jpeg: Uint8Array
  /** 逻辑宽度（CSS px）。 */
  readonly widthPx: number
  /** 逻辑高度（CSS px）。 */
  readonly heightPx: number
}

/**
 * 组装最小多页 PDF：每页一张 JPEG。
 * @param pages - 按顺序的页面载荷。
 * @returns PDF 文件字节。
 */
export function buildPdf(pages: readonly PdfPage[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  let offset = 0
  const offsets: number[] = []
  const push = (data: string | Uint8Array): void => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data
    chunks.push(bytes)
    offset += bytes.length
  }
  const beginObj = (num: number): void => {
    offsets[num] = offset
    push(`${num} 0 obj\n`)
  }
  const endObj = (): void => { push('endobj\n') }

  const count = pages.length
  push('%PDF-1.4\n')
  beginObj(1)
  push('<< /Type /Catalog /Pages 2 0 R >>\n')
  endObj()
  beginObj(2)
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')
  push(`<< /Type /Pages /Kids [${kids}] /Count ${count} >>\n`)
  endObj()
  pages.forEach((page, i) => {
    const pageNum = 3 + i * 3
    const imgNum = pageNum + 1
    const contentNum = pageNum + 2
    const wPt = (page.widthPx * 0.75).toFixed(2)
    const hPt = (page.heightPx * 0.75).toFixed(2)
    beginObj(pageNum)
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}] `
      + `/Resources << /XObject << /Im0 ${imgNum} 0 R >> >> /Contents ${contentNum} 0 R >>\n`)
    endObj()
    beginObj(imgNum)
    push(`<< /Type /XObject /Subtype /Image /Width ${page.widthPx * IMAGE_SCALE} `
      + `/Height ${page.heightPx * IMAGE_SCALE} /ColorSpace /DeviceRGB /BitsPerComponent 8 `
      + `/Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`)
    push(page.jpeg)
    push('\nendstream\n')
    endObj()
    const stream = `q\n${wPt} 0 0 ${hPt} 0 0 cm\n/Im0 Do\nQ\n`
    beginObj(contentNum)
    push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream\n`)
    endObj()
  })

  const total = 2 + count * 3
  const xrefAt = offset
  push(`xref\n0 ${total + 1}\n0000000000 65535 f \n`)
  for (let n = 1; n <= total; n += 1) {
    push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
  }
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`)

  const out = new Uint8Array(offset)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

// ---------------------------------------------------------------------------
// 导出汇
// ---------------------------------------------------------------------------

/** 取消信号已触发时抛出 AbortError（分片循环的检查点）。 */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException('Export cancelled', 'AbortError')
  }
}

/**
 * 逐片迭代舞台窗口：按 TILE_CSS_HEIGHT 分片，产出每片的
 * `(offset, height, index, total)`。
 */
async function* iterTiles(
  stage: RasterStage,
  signal: AbortSignal | undefined,
): AsyncGenerator<{ offset: number; height: number; index: number; total: number }> {
  const total = Math.ceil(stage.totalHeight / TILE_CSS_HEIGHT)
  for (let index = 0; index < total; index += 1) {
    throwIfAborted(signal)
    const offset = index * TILE_CSS_HEIGHT
    yield { offset, height: Math.min(TILE_CSS_HEIGHT, stage.totalHeight - offset), index, total }
  }
}

/**
 * 导出为 PDF：分片光栅 → 按页切片 → JPEG → 组装自包含多页 PDF 下载。
 * 无打印对话框——应用标签页永不冻结。片高为页高整数倍，页界与片界
 * 对齐（页永不跨片）；页数无上限，峰值内存恒为单片量级。
 * @param title - 会话标题（同时为文件名词干，经安全化）。
 * @param messages - 抽取出的对话回合。
 * @param options - 进度回调与取消信号（可选）。
 * @throws 运行环境无法光栅化时抛出；取消信号触发 AbortError。
 */
export async function exportPdf(
  title: string,
  messages: readonly ExtractedMessage[],
  options?: RasterExportOptions,
): Promise<void> {
  const stage = await RasterStage.create(title, messages)
  try {
    const pages: PdfPage[] = []
    const pageCount = Math.ceil(stage.totalHeight / PAGE_CSS_HEIGHT)
    let done = 0
    for await (const piece of iterTiles(stage, options?.signal)) {
      const tile = await stage.tile(piece.offset, piece.height)
      // 切页：片内按 A4 页高切片（末页取余量）。
      for (let y = 0; y < piece.height; y += PAGE_CSS_HEIGHT) {
        const pageCssHeight = Math.min(PAGE_CSS_HEIGHT, piece.height - y)
        const sliceDevH = pageCssHeight * IMAGE_SCALE
        const yDev = y * IMAGE_SCALE
        const slice = document.createElement('canvas')
        slice.width = tile.width
        slice.height = sliceDevH
        const ctx = slice.getContext('2d')
        if (ctx === null) throw new Error('no 2d context')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, slice.width, sliceDevH)
        ctx.drawImage(tile, 0, yDev, tile.width, sliceDevH, 0, 0, tile.width, sliceDevH)
        const jpeg = await new Promise<Blob | null>(resolve => { slice.toBlob(resolve, 'image/jpeg', 0.92) })
        if (jpeg === null) throw new Error('toBlob failed')
        pages.push({
          jpeg: new Uint8Array(await jpeg.arrayBuffer()),
          widthPx: IMAGE_WIDTH,
          heightPx: Math.ceil(sliceDevH / IMAGE_SCALE),
        })
        done += 1
        options?.onProgress?.(done, pageCount)
      }
    }
    downloadBlob(`${safeFileStem(title)}.pdf`, 'application/pdf', buildPdf(pages))
  } finally {
    stage.dispose()
  }
}

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
export async function exportImage(
  title: string,
  messages: readonly ExtractedMessage[],
  options?: RasterExportOptions,
): Promise<void> {
  if (typeof CompressionStream === 'undefined') {
    await exportImageLegacy(title, messages, options)
    return
  }
  const stage = await RasterStage.create(title, messages)
  try {
    const encoder = new StreamingPngEncoder(IMAGE_WIDTH * IMAGE_SCALE, stage.totalHeight * IMAGE_SCALE)
    for await (const piece of iterTiles(stage, options?.signal)) {
      const tile = await stage.tile(piece.offset, piece.height)
      await encoder.pushTile(tile)
      options?.onProgress?.(piece.index + 1, piece.total)
    }
    downloadBlob(`${safeFileStem(title)}.png`, 'image/png', await encoder.finish())
  } finally {
    stage.dispose()
  }
}

/**
 * 旧路径降级：单 canvas 光栅化（截断至 LEGACY_MAX_HEIGHT）+ toBlob。
 * 仅在无 CompressionStream 的环境使用。
 */
async function exportImageLegacy(
  title: string,
  messages: readonly ExtractedMessage[],
  options?: RasterExportOptions,
): Promise<void> {
  const stage = await RasterStage.create(title, messages)
  try {
    throwIfAborted(options?.signal)
    const height = Math.min(stage.totalHeight, LEGACY_MAX_HEIGHT)
    const canvas = await stage.tile(0, height)
    const blob = await new Promise<Blob | null>(resolve => { canvas.toBlob(resolve, 'image/png') })
    if (blob === null) throw new Error('toBlob failed')
    downloadBlob(`${safeFileStem(title)}.png`, 'image/png', blob)
  } finally {
    stage.dispose()
  }
}
