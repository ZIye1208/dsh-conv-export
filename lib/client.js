window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-conv-export",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/extract.ts
		/**
		* Conversation extraction: walks the rendered transcript and produces a
		* role-ordered message list the exporters (Markdown / PDF / long image)
		* share.
		*
		* Selectors come from the stock web app's rendered DOM (verified against a
		* live session): user turns hang under a row whose CSS-module class ends in
		* `_userRow` (bubble text inside `[class*="_bubble"]`); assistant turns are
		* rendered markdown under `[class*="_markdown_"]`. Class names are
		* hash-prefixed (`gdEzaW_userRow`), so attribute-contains matching is the
		* stable contract.
		*
		* No cordis, no React — pure DOM helpers, unit-testable against jsdom.
		*/
		/** Selector of the conversation scrollport the extractor operates within. */
		const SCROLL_SELECTOR = "[data-conversation-scroll]";
		/** Selector matching a user turn row. */
		const USER_ROW_SELECTOR = "[class*=\"_userRow\"]";
		/** Selector matching an assistant turn's rendered markdown container. */
		const ASSISTANT_MD_SELECTOR = "[class*=\"_markdown_\"]";
		/** Selector of the header breadcrumb segment carrying the session title. */
		const TITLE_SELECTOR = "[class*=\"crumbSeg\"]";
		/**
		* Resolve the conversation scrollport from anywhere in the document.
		* @param from - any element or the document itself.
		* @returns the scrollport element, or null when no conversation is rendered.
		*/
		function resolveScope(from = document) {
			return from.querySelector(SCROLL_SELECTOR);
		}
		/**
		* Read the session title from the header breadcrumb.
		* @returns the trimmed title, or null when absent.
		*/
		function readTitle() {
			const text = document.querySelector(TITLE_SELECTOR)?.textContent?.trim();
			return text === "" || text === void 0 ? null : text ?? null;
		}
		/**
		* Extract every rendered turn in document order. User rows and assistant
		* markdown containers are collected with one combined querySelectorAll,
		* which returns document order — so the interleaving is exactly what the
		* reader sees.
		* @param scope - the conversation scrollport (defaults to resolving one).
		* @returns the ordered turns; empty when nothing is rendered.
		*/
		function extractMessages(scope) {
			const port = scope ?? resolveScope();
			if (port === null) return [];
			const nodes = port.querySelectorAll(`${USER_ROW_SELECTOR}, ${ASSISTANT_MD_SELECTOR}`);
			const out = [];
			for (const node of nodes) if (node.matches("[class*=\"_userRow\"]")) {
				const text = ((node.querySelector("[class*=\"_bubble\"]") ?? node).textContent ?? "").trim();
				if (text !== "") out.push({
					role: "user",
					text,
					html: ""
				});
			} else {
				const text = (node.textContent ?? "").trim();
				if (text !== "") out.push({
					role: "assistant",
					text,
					html: node.innerHTML
				});
			}
			return out;
		}
		/**
		* Sanitize a string into a safe download-file stem: path/hostile characters
		* and runs of whitespace collapse to '-', capped at 60 chars.
		* @param raw - the proposed file name stem (e.g. the session title).
		* @returns the sanitized stem (never empty).
		*/
		function safeFileStem(raw) {
			const cleaned = raw.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
			return cleaned === "" ? "conversation" : cleaned;
		}
		//#endregion
		//#region src/client/i18n.ts
		/**
		* Tiny self-contained i18n for the export menu. The menu renders outside the
		* slot render tree (fixed overlay), so it carries its own dictionaries and
		* picks the language from the document/navigator instead of the locale
		* service — zero extra service dependencies.
		*/
		/** Simplified Chinese dictionary (key-set source of truth). */
		const zh = {
			"action.label": "对话导出",
			"action.aria": "导出当前对话 (Markdown / PDF / 长图)",
			"action.hint": "导出当前对话",
			"menu.markdown": "Markdown (.md)",
			"menu.pdf": "PDF (下载)",
			"menu.image": "长图 (PNG)",
			"menu.select": "选择回合导出…",
			"role.user": "用户",
			"role.assistant": "助手",
			"toast.imageFail": "长图生成失败，请改用 Markdown 或 PDF",
			"toast.cancelled": "导出已取消",
			"panel.title": "选择要导出的对话回合",
			"panel.selectAll": "全选",
			"panel.selectNone": "全不选",
			"panel.selected": "已选",
			"panel.format": "格式",
			"panel.export": "导出",
			"panel.cancel": "取消",
			"panel.empty": "请至少选择一个回合"
		};
		/** English dictionary, complete against the zh key set. */
		const en = {
			"action.label": "Export conversation",
			"action.aria": "Export this conversation (Markdown / PDF / long image)",
			"action.hint": "Export this conversation",
			"menu.markdown": "Markdown (.md)",
			"menu.pdf": "PDF (download)",
			"menu.image": "Long image (PNG)",
			"menu.select": "Select turns…",
			"role.user": "User",
			"role.assistant": "Assistant",
			"toast.imageFail": "Long-image render failed — use Markdown or PDF instead",
			"toast.cancelled": "Export cancelled",
			"panel.title": "Select turns to export",
			"panel.selectAll": "All",
			"panel.selectNone": "None",
			"panel.selected": "Selected",
			"panel.format": "Format",
			"panel.export": "Export",
			"panel.cancel": "Cancel",
			"panel.empty": "Select at least one turn"
		};
		/**
		* Detect the UI language once: the document lang attribute wins, then the
		* navigator; anything Chinese-prefixed maps to zh, everything else to en.
		* @returns the active dictionary.
		*/
		function detectDict() {
			return (document.documentElement.lang || navigator.language || "en").toLowerCase().startsWith("zh") ? zh : en;
		}
		let active;
		/**
		* Translate one key.
		* @param key - dictionary key.
		* @returns the localized text.
		*/
		function t(key) {
			active ??= detectDict();
			return active[key];
		}
		//#endregion
		//#region src/client/markdown.ts
		/**
		* Serialize one inline subtree (no block structure) into markdown text.
		* @param node - the inline root.
		* @returns the inline markdown.
		*/
		function inline(node) {
			if (node.nodeType === Node.TEXT_NODE) return (node.nodeValue ?? "").replace(/\s+/g, " ");
			if (node.nodeType !== Node.ELEMENT_NODE) return "";
			const el = node;
			const kids = () => Array.from(el.childNodes).map(inline).join("");
			switch (el.tagName) {
				case "STRONG":
				case "B": {
					const text = kids().trim();
					return text === "" ? "" : `**${text}**`;
				}
				case "EM":
				case "I": {
					const text = kids().trim();
					return text === "" ? "" : `*${text}*`;
				}
				case "DEL":
				case "S": {
					const text = kids().trim();
					return text === "" ? "" : `~~${text}~~`;
				}
				case "CODE": {
					const text = (el.textContent ?? "").trim();
					return text === "" ? "" : `\`${text}\``;
				}
				case "A": {
					const text = kids().trim();
					const href = el.getAttribute("href") ?? "";
					if (text === "" || href === "") return text;
					return `[${text}](${href})`;
				}
				case "BR": return "\n";
				case "IMG": {
					const alt = el.getAttribute("alt") ?? "";
					const src = el.getAttribute("src") ?? "";
					return src === "" ? alt : `![${alt}](${src})`;
				}
				default: return kids();
			}
		}
		/**
		* Serialize one list element (ul/ol) with nesting indentation.
		* @param el - the list element.
		* @param depth - nesting depth (0 = top level).
		* @returns the markdown list lines.
		*/
		function list(el, depth) {
			const ordered = el.tagName === "OL";
			const pad = "  ".repeat(depth);
			const lines = [];
			let n = 1;
			for (const li of Array.from(el.children).filter((c) => c.tagName === "LI")) {
				const bullet = ordered ? `${n}. ` : "- ";
				n += 1;
				const inlineParts = Array.from(li.childNodes).filter((c) => !(c.nodeType === Node.ELEMENT_NODE && c.tagName === "UL" || c.nodeType === Node.ELEMENT_NODE && c.tagName === "OL")).map(inline).join("");
				const nested = Array.from(li.children).filter((c) => c.tagName === "UL" || c.tagName === "OL").map((c) => list(c, depth + 1)).join("");
				lines.push(`${pad}${bullet}${inlineParts.trim()}${nested === "" ? "" : `\n${nested}`}`);
			}
			return lines.join("\n");
		}
		/**
		* Serialize a table into a GitHub-flavored markdown table.
		* @param el - the table element.
		* @returns the markdown table text.
		*/
		function table(el) {
			const rows = Array.from(el.querySelectorAll("tr"));
			if (rows.length === 0) return "";
			const cells = (tr) => Array.from(tr.querySelectorAll("th, td")).map((td) => inline(td).trim().replace(/\|/g, "\\|"));
			const out = [];
			rows.forEach((tr, i) => {
				out.push(`| ${cells(tr).join(" | ")} |`);
				if (i === 0) out.push(`| ${cells(tr).map(() => "---").join(" | ")} |`);
			});
			return out.join("\n");
		}
		/**
		* Serialize one block-level subtree into markdown.
		* @param node - the block root.
		* @returns the block markdown (blank-line separated).
		*/
		function block(node) {
			if (node.nodeType === Node.TEXT_NODE) {
				const text = (node.nodeValue ?? "").trim();
				return text === "" ? "" : text;
			}
			if (node.nodeType !== Node.ELEMENT_NODE) return "";
			const el = node;
			const kids = () => Array.from(el.childNodes).map(block).filter((s) => s !== "").join("\n\n");
			switch (el.tagName) {
				case "H1": return `# ${inline(el).trim()}`;
				case "H2": return `## ${inline(el).trim()}`;
				case "H3": return `### ${inline(el).trim()}`;
				case "H4": return `#### ${inline(el).trim()}`;
				case "H5": return `##### ${inline(el).trim()}`;
				case "H6": return `###### ${inline(el).trim()}`;
				case "PRE": {
					const code = el.querySelector("code");
					return `\`\`\`${(code?.getAttribute("class") ?? "").match(/language-([\w+-]+)/)?.[1] ?? ""}\n${(code?.textContent ?? el.textContent ?? "").replace(/\n$/, "")}\n\`\`\``;
				}
				case "UL":
				case "OL": return list(el, 0);
				case "BLOCKQUOTE": return kids().split("\n").map((l) => `> ${l}`).join("\n");
				case "HR": return "---";
				case "TABLE": return table(el);
				case "P":
				case "DIV":
				case "SECTION":
				case "ARTICLE": return kids();
				case "BR": return "";
				default: return el.children.length === 0 ? inline(el).trim() : kids();
			}
		}
		/**
		* Convert one assistant turn's rendered HTML back into markdown.
		* @param html - the markdown container's innerHTML.
		* @returns the serialized markdown (trimmed).
		*/
		function htmlToMarkdown(html) {
			const holder = document.createElement("div");
			holder.innerHTML = html;
			return Array.from(holder.childNodes).map(block).filter((s) => s !== "").join("\n\n").trim();
		}
		/**
		* Assemble the full export document.
		* @param title - the session title (null → generic heading).
		* @param messages - the extracted turns, in order.
		* @returns the markdown document text.
		*/
		function buildMarkdown(title, messages) {
			const parts = [];
			parts.push(`# ${title ?? "Conversation"}`);
			for (const msg of messages) {
				parts.push(`### ${msg.role === "user" ? t("role.user") : t("role.assistant")}`);
				parts.push(msg.role === "user" ? msg.text : htmlToMarkdown(msg.html));
			}
			return `${parts.join("\n\n")}\n`;
		}
		//#endregion
		//#region src/client/exporters.ts
		/** 光栅宽度（CSS px；2x 视网膜下实际像素翻倍）。 */
		const IMAGE_WIDTH = 800;
		/** 光栅缩放系数（2x 视网膜）。 */
		const IMAGE_SCALE = 2;
		/** PDF 单页高度（IMAGE_WIDTH 宽下的 CSS px，A4 纵横比）。 */
		const PAGE_CSS_HEIGHT = Math.round(IMAGE_WIDTH * 297 / 210);
		/** 分片高度（CSS px）。 */
		const TILE_CSS_HEIGHT = PAGE_CSS_HEIGHT * 2;
		/**
		* 整篇对话光栅总高上限（CSS px，≈176 页 A4）：产品理智上限，
		* 防御极端内存/时长；PNG/PDF 路径共用。
		*/
		const MAX_TOTAL_CSS_HEIGHT = 2e5;
		/** 旧路径单 canvas 高度上限（无 CompressionStream 环境的降级截断）。 */
		const LEGACY_MAX_HEIGHT = 16e3;
		/**
		* 导出文档根声明（原 body 规则的声明部分）：foreignObject 内没有
		* `<body>` 元素，`body {}` 选择器不生效，故光栅化时把声明直接落到
		* 克隆根节点上；离屏测高阶段仍由真实 DOM 的 body 规则承担。
		*/
		const ROOT_DECL = "font: 14px/1.7 -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; color: #1f2328; margin: 0;";
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
`;
		/**
		* 触发客户端文件下载。
		* @param filename - 下载文件名。
		* @param mime - blob MIME 类型。
		* @param data - blob 载荷。
		*/
		function downloadBlob(filename, mime, data) {
			const blob = new Blob([data], { type: mime });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			a.remove();
			setTimeout(() => {
				URL.revokeObjectURL(url);
			}, 4e3);
		}
		/**
		* 组装导出正文 HTML（PDF 页与长图共享）。
		* @param title - 会话标题。
		* @param messages - 抽取出的对话回合。
		* @returns 正文标记字符串。
		*/
		function buildExportHtml(title, messages) {
			const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
			const turns = messages.map((m) => m.role === "user" ? `<div class="x-turn"><p class="x-role">${esc(t("role.user"))}</p><div class="x-user">${esc(m.text)}</div></div>` : `<div class="x-turn"><p class="x-role">${esc(t("role.assistant"))}</p><div class="x-md">${m.html}</div></div>`).join("");
			return `<div class="x-wrap"><h1 class="x-title">${esc(title)}</h1>${turns}</div>`;
		}
		/**
		* 将容器内全部 `<img>` 内联为 data: URL，使 SVG foreignObject 光栅可嵌入
		* 图片（SVG 图像内部禁止外部资源请求）。
		* @param root - 就地内联图片的容器。
		*/
		async function inlineImages(root) {
			const imgs = Array.from(root.querySelectorAll("img"));
			await Promise.all(imgs.map(async (img) => {
				const src = img.getAttribute("src") ?? "";
				if (src === "" || src.startsWith("data:")) return;
				try {
					const res = await fetch(src);
					if (!res.ok) return;
					const blob = await res.blob();
					const dataUrl = await new Promise((resolve, reject) => {
						const reader = new FileReader();
						reader.onload = () => {
							resolve(String(reader.result));
						};
						reader.onerror = () => {
							reject(reader.error);
						};
						reader.readAsDataURL(blob);
					});
					img.setAttribute("src", dataUrl);
				} catch {
					img.remove();
				}
			}));
		}
		/**
		* 光栅舞台：导出文档的离屏渲染宿主，存活期内保持挂载（克隆源），
		* 支持按窗口分片光栅化。
		*/
		var RasterStage = class RasterStage {
			stage;
			totalHeight;
			constructor(stage, totalHeight) {
				this.stage = stage;
				this.totalHeight = totalHeight;
			}
			/**
			* 构建舞台：组装导出 HTML → 离屏挂载 → 内联图片 → 布局沉淀 → 测高。
			* @param title - 会话标题。
			* @param messages - 抽取出的对话回合。
			*/
			static async create(title, messages) {
				const stage = document.createElement("div");
				stage.style.cssText = `position:fixed;left:-100000px;top:0;width:${IMAGE_WIDTH}px;pointer-events:none;z-index:-1;`;
				const style = document.createElement("style");
				style.textContent = EXPORT_CSS;
				stage.appendChild(style);
				const content = document.createElement("div");
				content.innerHTML = buildExportHtml(title, messages);
				stage.appendChild(content);
				document.body.appendChild(stage);
				try {
					await inlineImages(stage);
					await new Promise((resolve) => {
						setTimeout(resolve, 60);
					});
					const totalHeight = Math.max(1, Math.min(Math.ceil(stage.scrollHeight), MAX_TOTAL_CSS_HEIGHT));
					return new RasterStage(stage, totalHeight);
				} catch (error) {
					stage.remove();
					throw error;
				}
			}
			/** 移除离屏舞台（幂等）。 */
			dispose() {
				this.stage.remove();
			}
			/**
			* 光栅化 `[offset, offset + height)` 窗口到 2x canvas。
			* 窗口经克隆根的 `translateY(−offset)` 位移实现：foreignObject 视口
			* 裁剪视口外内容，浏览器只为窗口内像素付出光栅成本。
			* @param offset - 窗口在整篇文档中的纵向偏移（CSS px）。
			* @param height - 窗口高度（CSS px）。
			* @throws 运行环境无法光栅化时抛出（无 canvas / SVG 解析失败）。
			*/
			async tile(offset, height) {
				const clone = this.stage.cloneNode(true);
				clone.setAttribute("style", `${ROOT_DECL}width:${IMAGE_WIDTH}px;background:#ffffff;transform:translateY(-${offset}px);`);
				clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
				const serialized = new XMLSerializer().serializeToString(clone);
				const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${height}"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;
				if (new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("parsererror") !== null) throw new Error("svg serialize failed");
				const img = new Image();
				img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
				await img.decode();
				const canvas = document.createElement("canvas");
				canvas.width = IMAGE_WIDTH * IMAGE_SCALE;
				canvas.height = height * IMAGE_SCALE;
				const ctx = canvas.getContext("2d", { willReadFrequently: true });
				if (ctx === null) throw new Error("no 2d context");
				ctx.scale(IMAGE_SCALE, IMAGE_SCALE);
				ctx.fillStyle = "#ffffff";
				ctx.fillRect(0, 0, IMAGE_WIDTH, height);
				ctx.drawImage(img, 0, 0, IMAGE_WIDTH, height);
				return canvas;
			}
		};
		/** PNG 签名（8 字节）。 */
		const PNG_SIGNATURE = new Uint8Array([
			137,
			80,
			78,
			71,
			13,
			10,
			26,
			10
		]);
		/** CRC-32 查表（多项式 0xedb88320，与 PNG/ZIP 一致）。 */
		const PNG_CRC_TABLE = (() => {
			const table = /* @__PURE__ */ new Uint32Array(256);
			for (let n = 0; n < 256; n += 1) {
				let c = n;
				for (let k = 0; k < 8; k += 1) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
				table[n] = c >>> 0;
			}
			return table;
		})();
		/**
		* CRC-32（多段输入）。纯函数，导出仅为单测。
		* @param parts - 逐段参与校验的字节。
		* @returns CRC-32 值（无符号 32 位）。
		*/
		function crc32Parts(parts) {
			let crc = 4294967295;
			for (const part of parts) for (let i = 0; i < part.byteLength; i += 1) crc = PNG_CRC_TABLE[(crc ^ part[i]) & 255] ^ crc >>> 8;
			return (crc ^ 4294967295) >>> 0;
		}
		/** ASCII 字节（PNG chunk 类型固定 4 字节 ASCII）。 */
		function asciiBytes(text) {
			const out = new Uint8Array(text.length);
			for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 127;
			return out;
		}
		/**
		* 组装一个 PNG chunk：`length(BE) + type + data + crc32(type ∥ data)(BE)`。
		* 纯函数，导出仅为单测。
		* @param type - 4 字节 ASCII chunk 类型。
		* @param data - chunk 载荷。
		*/
		function pngChunk(type, data) {
			const typeBytes = asciiBytes(type);
			const out = new Uint8Array(12 + data.byteLength);
			const view = new DataView(out.buffer);
			view.setUint32(0, data.byteLength);
			out.set(typeBytes, 4);
			out.set(data, 8);
			view.setUint32(8 + data.byteLength, crc32Parts([typeBytes, data]));
			return out;
		}
		/**
		* IHDR 载荷：宽/高(BE) + 位深 8 + 颜色类型 6(RGBA) + 压缩/过滤/隔行 0。
		* 纯函数，导出仅为单测。
		*/
		function ihdrBytes(width, height) {
			const out = /* @__PURE__ */ new Uint8Array(13);
			const view = new DataView(out.buffer);
			view.setUint32(0, width);
			view.setUint32(4, height);
			out[8] = 8;
			out[9] = 6;
			out[10] = 0;
			out[11] = 0;
			out[12] = 0;
			return out;
		}
		/**
		* Paeth 预测子（PNG 过滤器 4）。纯函数，导出仅为单测。
		* @param a - 左邻像素字节。
		* @param b - 上邻像素字节。
		* @param c - 左上邻像素字节。
		*/
		function paethPredictor(a, b, c) {
			const p = a + b - c;
			const pa = Math.abs(p - a);
			const pb = Math.abs(p - b);
			const pc = Math.abs(p - c);
			if (pa <= pb && pa <= pc) return a;
			if (pb <= pc) return b;
			return c;
		}
		const PNG_FILTERS = [
			0,
			1,
			2,
			4
		];
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
		function applyFilter(filter, raw, rowStart, bytesPerRow, prevData, prevStart, out, outAt) {
			for (let i = 0; i < bytesPerRow; i += 1) {
				const x = raw[rowStart + i];
				if (filter === 0) {
					out[outAt + i] = x;
					continue;
				}
				const left = i >= 4 ? raw[rowStart + i - 4] : 0;
				const up = prevData !== void 0 ? prevData[prevStart + i] : 0;
				let predictor;
				if (filter === 1) predictor = left;
				else if (filter === 2) predictor = up;
				else predictor = paethPredictor(left, up, prevData !== void 0 && i >= 4 ? prevData[prevStart + i - 4] : 0);
				out[outAt + i] = x - predictor;
			}
		}
		/** 过滤器的编码代价启发式：过滤后字节的符号幅值总和，越小越优。 */
		function filterCost(filter, raw, rowStart, bytesPerRow, prevData, prevStart) {
			let cost = 0;
			for (let i = 0; i < bytesPerRow; i += 1) {
				const x = raw[rowStart + i];
				if (filter === 0) {
					cost += x < 128 ? x : 256 - x;
					continue;
				}
				const left = i >= 4 ? raw[rowStart + i - 4] : 0;
				const up = prevData !== void 0 ? prevData[prevStart + i] : 0;
				let predictor;
				if (filter === 1) predictor = left;
				else if (filter === 2) predictor = up;
				else predictor = paethPredictor(left, up, prevData !== void 0 && i >= 4 ? prevData[prevStart + i - 4] : 0);
				const v = x - predictor & 255;
				cost += v < 128 ? v : 256 - v;
			}
			return cost;
		}
		/**
		* 片级自适应过滤器选择：均匀采样若干行，对候选过滤器累计代价取最小。
		* 逐行全量自适应在超长图（数十万行）下代价过高，片级选择把选择开销
		* 压到可忽略，同时保留主要的压缩收益。
		*/
		function pickTileFilter(data, width, height, carriedPrev) {
			const bytesPerRow = width * 4;
			const step = Math.max(1, Math.floor(height / 16));
			const costs = [
				0,
				0,
				0,
				0
			];
			for (let y = 0; y < height; y += step) {
				const rowStart = y * bytesPerRow;
				for (let c = 0; c < PNG_FILTERS.length; c += 1) {
					const filter = PNG_FILTERS[c];
					if (y === 0) costs[c] = costs[c] + filterCost(filter, data, rowStart, bytesPerRow, carriedPrev, 0);
					else costs[c] = costs[c] + filterCost(filter, data, rowStart, bytesPerRow, data, rowStart - bytesPerRow);
				}
			}
			let best = 0;
			for (let c = 1; c < costs.length; c += 1) if (costs[c] < costs[best]) best = c;
			return PNG_FILTERS[best];
		}
		/**
		* 流式 PNG 编码器：逐片消费 canvas 像素，增量产出 zlib 压缩的 IDAT
		* 数据，finish 时组装完整 PNG Blob。峰值内存 ≈ 单片原始像素 + 压缩输出。
		*/
		var StreamingPngEncoder = class {
			widthPx;
			heightPx;
			writer;
			outputChunks = [];
			pump;
			pumpError;
			carriedPrev;
			finished = false;
			constructor(widthPx, heightPx) {
				this.widthPx = widthPx;
				this.heightPx = heightPx;
				const streams = new CompressionStream("deflate");
				this.writer = streams.writable.getWriter();
				const reader = streams.readable.getReader();
				this.pump = (async () => {
					for (;;) {
						const { done, value } = await reader.read();
						if (done) break;
						if (value !== void 0) this.outputChunks.push(value instanceof Uint8Array ? value : new Uint8Array(value));
					}
				})().catch((error) => {
					this.pumpError = error;
				});
			}
			/** 消费一片 canvas：逐行过滤（片级自适应过滤器）→ 单次 write 增量压缩。 */
			async pushTile(tile) {
				if (this.finished) throw new Error("png encoder already finished");
				const ctx = tile.getContext("2d", { willReadFrequently: true });
				if (ctx === null) throw new Error("no 2d context");
				const { data, width, height } = ctx.getImageData(0, 0, tile.width, tile.height);
				const bytesPerRow = width * 4;
				const filter = pickTileFilter(data, width, height, this.carriedPrev);
				const out = new Uint8Array((bytesPerRow + 1) * height);
				let at = 0;
				for (let y = 0; y < height; y += 1) {
					out[at] = filter;
					at += 1;
					const rowStart = y * bytesPerRow;
					if (y === 0) applyFilter(filter, data, rowStart, bytesPerRow, this.carriedPrev, 0, out, at);
					else applyFilter(filter, data, rowStart, bytesPerRow, data, rowStart - bytesPerRow, out, at);
					at += bytesPerRow;
				}
				this.carriedPrev = data.slice((height - 1) * bytesPerRow, height * bytesPerRow);
				await this.writer.write(out);
			}
			/** 关闭压缩流并组装完整 PNG Blob。 */
			async finish() {
				if (this.finished) throw new Error("png encoder already finished");
				this.finished = true;
				let closeError;
				try {
					await this.writer.close();
				} catch (error) {
					closeError = error;
				}
				await this.pump;
				if (this.pumpError !== void 0) throw this.pumpError;
				if (closeError !== void 0) throw closeError;
				const parts = [PNG_SIGNATURE, pngChunk("IHDR", ihdrBytes(this.widthPx, this.heightPx))];
				for (const chunk of this.outputChunks) parts.push(pngChunk("IDAT", chunk));
				parts.push(pngChunk("IEND", /* @__PURE__ */ new Uint8Array(0)));
				return new Blob(parts, { type: "image/png" });
			}
		};
		/**
		* 组装最小多页 PDF：每页一张 JPEG。
		* @param pages - 按顺序的页面载荷。
		* @returns PDF 文件字节。
		*/
		function buildPdf(pages) {
			const enc = new TextEncoder();
			const chunks = [];
			let offset = 0;
			const offsets = [];
			const push = (data) => {
				const bytes = typeof data === "string" ? enc.encode(data) : data;
				chunks.push(bytes);
				offset += bytes.length;
			};
			const beginObj = (num) => {
				offsets[num] = offset;
				push(`${num} 0 obj\n`);
			};
			const endObj = () => {
				push("endobj\n");
			};
			const count = pages.length;
			push("%PDF-1.4\n");
			beginObj(1);
			push("<< /Type /Catalog /Pages 2 0 R >>\n");
			endObj();
			beginObj(2);
			push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] /Count ${count} >>\n`);
			endObj();
			pages.forEach((page, i) => {
				const pageNum = 3 + i * 3;
				const imgNum = pageNum + 1;
				const contentNum = pageNum + 2;
				const wPt = (page.widthPx * .75).toFixed(2);
				const hPt = (page.heightPx * .75).toFixed(2);
				beginObj(pageNum);
				push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}] /Resources << /XObject << /Im0 ${imgNum} 0 R >> >> /Contents ${contentNum} 0 R >>\n`);
				endObj();
				beginObj(imgNum);
				push(`<< /Type /XObject /Subtype /Image /Width ${page.widthPx * IMAGE_SCALE} /Height ${page.heightPx * IMAGE_SCALE} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`);
				push(page.jpeg);
				push("\nendstream\n");
				endObj();
				const stream = `q\n${wPt} 0 0 ${hPt} 0 0 cm\n/Im0 Do\nQ\n`;
				beginObj(contentNum);
				push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream\n`);
				endObj();
			});
			const total = 2 + count * 3;
			const xrefAt = offset;
			push(`xref\n0 ${total + 1}\n0000000000 65535 f \n`);
			for (let n = 1; n <= total; n += 1) push(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
			push(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
			const out = new Uint8Array(offset);
			let at = 0;
			for (const chunk of chunks) {
				out.set(chunk, at);
				at += chunk.length;
			}
			return out;
		}
		/** 取消信号已触发时抛出 AbortError（分片循环的检查点）。 */
		function throwIfAborted(signal) {
			if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
		}
		/**
		* 逐片迭代舞台窗口：按 TILE_CSS_HEIGHT 分片，产出每片的
		* `(offset, height, index, total)`。
		*/
		async function* iterTiles(stage, signal) {
			const total = Math.ceil(stage.totalHeight / TILE_CSS_HEIGHT);
			for (let index = 0; index < total; index += 1) {
				throwIfAborted(signal);
				const offset = index * TILE_CSS_HEIGHT;
				yield {
					offset,
					height: Math.min(TILE_CSS_HEIGHT, stage.totalHeight - offset),
					index,
					total
				};
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
		async function exportPdf(title, messages, options) {
			const stage = await RasterStage.create(title, messages);
			try {
				const pages = [];
				const pageCount = Math.ceil(stage.totalHeight / PAGE_CSS_HEIGHT);
				let done = 0;
				for await (const piece of iterTiles(stage, options?.signal)) {
					const tile = await stage.tile(piece.offset, piece.height);
					for (let y = 0; y < piece.height; y += PAGE_CSS_HEIGHT) {
						const sliceDevH = Math.min(PAGE_CSS_HEIGHT, piece.height - y) * IMAGE_SCALE;
						const yDev = y * IMAGE_SCALE;
						const slice = document.createElement("canvas");
						slice.width = tile.width;
						slice.height = sliceDevH;
						const ctx = slice.getContext("2d");
						if (ctx === null) throw new Error("no 2d context");
						ctx.fillStyle = "#ffffff";
						ctx.fillRect(0, 0, slice.width, sliceDevH);
						ctx.drawImage(tile, 0, yDev, tile.width, sliceDevH, 0, 0, tile.width, sliceDevH);
						const jpeg = await new Promise((resolve) => {
							slice.toBlob(resolve, "image/jpeg", .92);
						});
						if (jpeg === null) throw new Error("toBlob failed");
						pages.push({
							jpeg: new Uint8Array(await jpeg.arrayBuffer()),
							widthPx: IMAGE_WIDTH,
							heightPx: Math.ceil(sliceDevH / IMAGE_SCALE)
						});
						done += 1;
						options?.onProgress?.(done, pageCount);
					}
				}
				downloadBlob(`${safeFileStem(title)}.pdf`, "application/pdf", buildPdf(pages));
			} finally {
				stage.dispose();
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
		async function exportImage(title, messages, options) {
			if (typeof CompressionStream === "undefined") {
				await exportImageLegacy(title, messages, options);
				return;
			}
			const stage = await RasterStage.create(title, messages);
			try {
				const encoder = new StreamingPngEncoder(IMAGE_WIDTH * IMAGE_SCALE, stage.totalHeight * IMAGE_SCALE);
				for await (const piece of iterTiles(stage, options?.signal)) {
					const tile = await stage.tile(piece.offset, piece.height);
					await encoder.pushTile(tile);
					options?.onProgress?.(piece.index + 1, piece.total);
				}
				downloadBlob(`${safeFileStem(title)}.png`, "image/png", await encoder.finish());
			} finally {
				stage.dispose();
			}
		}
		/**
		* 旧路径降级：单 canvas 光栅化（截断至 LEGACY_MAX_HEIGHT）+ toBlob。
		* 仅在无 CompressionStream 的环境使用。
		*/
		async function exportImageLegacy(title, messages, options) {
			const stage = await RasterStage.create(title, messages);
			try {
				throwIfAborted(options?.signal);
				const height = Math.min(stage.totalHeight, LEGACY_MAX_HEIGHT);
				const canvas = await stage.tile(0, height);
				const blob = await new Promise((resolve) => {
					canvas.toBlob(resolve, "image/png");
				});
				if (blob === null) throw new Error("toBlob failed");
				downloadBlob(`${safeFileStem(title)}.png`, "image/png", blob);
			} finally {
				stage.dispose();
			}
		}
		//#endregion
		//#region src/client/controller.ts
		/**
		* The export controller: owns the header-triggered dropdown menu (plain DOM
		* — no React, so it never couples to the shell's React version) and
		* dispatches the three sinks (Markdown download, PDF download, long PNG).
		* Extraction runs at click time, so the export always reflects the
		* transcript exactly as the reader sees it.
		*
		* 光栅导出（PDF/PNG）带分片进度：进行中菜单项实时显示「done/total」
		* 计数；再次点击同一菜单项取消进行中的导出（AbortError → 已取消提示）。
		*
		* 选择导出（turn selection）：菜单第四项打开回合选择面板，逐回合勾选
		* （角色 + 内容预览，默认全选）、全选/全不选、挑选格式，确认后仅导出
		* 选中回合。面板同为纯 DOM（遮罩 + 对话框），与菜单共用同一套生命周期、
		* 键盘/外点关闭纪律与设计令牌；导出进行中确认按钮显示分片进度，
		* 再次点击或「取消」中止。
		*
		* Lifecycle: `install()` from the cordis apply (menu mount + outside-click
		* close), `uninstall()` on plugin unload.
		*/
		/**
		* 回合预览文案：压缩空白并截断至 80 字符（选择面板条目）。
		* 纯函数，导出仅为单测。
		* @param message - 抽取出的对话回合。
		*/
		function previewOf(message) {
			const flat = message.text.replace(/\s+/g, " ").trim();
			return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat;
		}
		/**
		* The singleton controller. A page hosts exactly one conversation pane, so
		* a module-level instance is the right ownership; cordis install/uninstall
		* bracket its DOM effects.
		*/
		var ExportController = class {
			menu = null;
			/** 选择面板（backdrop 元素）；null = 未打开。 */
			panel = null;
			installed = false;
			running = null;
			/** Install the menu DOM and document listeners. Idempotent. */
			install() {
				if (this.installed) return;
				this.installed = true;
				this.mountMenu();
				document.addEventListener("pointerdown", this.onOutside, true);
				document.addEventListener("keydown", this.onKeyDown, true);
			}
			/** Remove every installed effect. Idempotent. */
			uninstall() {
				if (!this.installed) return;
				this.installed = false;
				document.removeEventListener("pointerdown", this.onOutside, true);
				document.removeEventListener("keydown", this.onKeyDown, true);
				this.menu?.remove();
				this.menu = null;
				this.closePanel();
			}
			/**
			* Toggle the dropdown (the header action button's gesture), anchoring it
			* under the triggering button. 选择面板打开时不弹菜单。
			* @param anchor - the header action button (positions the menu).
			*/
			toggle(anchor) {
				if (this.menu === null) return;
				if (this.panel !== null) return;
				if (resolveScope() === null) return;
				const open = this.menu.hidden !== false;
				this.menu.hidden = !open;
				if (open && anchor instanceof HTMLElement) {
					const rect = anchor.getBoundingClientRect();
					const width = this.menu.offsetWidth;
					const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
					this.menu.style.top = `${Math.round(rect.bottom + 6)}px`;
					this.menu.style.left = `${Math.round(left)}px`;
				}
				this.syncActionButton(open);
			}
			/** Close the dropdown. */
			close() {
				if (this.menu === null || this.menu.hidden) return;
				this.menu.hidden = true;
				this.syncActionButton(false);
			}
			/** Build the dropdown once and hide it until opened. */
			mountMenu() {
				const menu = document.createElement("div");
				menu.setAttribute("data-dsh-conv-export-menu", "");
				menu.hidden = true;
				menu.setAttribute("role", "menu");
				const entries = [
					{
						kind: "markdown",
						label: t("menu.markdown")
					},
					{
						kind: "pdf",
						label: t("menu.pdf")
					},
					{
						kind: "image",
						label: t("menu.image")
					},
					{
						kind: "select",
						label: t("menu.select")
					}
				];
				for (const entry of entries) {
					if (entry.kind === "select") {
						const divider = document.createElement("hr");
						menu.appendChild(divider);
					}
					const btn = document.createElement("button");
					btn.type = "button";
					btn.setAttribute("role", "menuitem");
					btn.setAttribute("data-export-kind", entry.kind);
					btn.textContent = entry.label;
					btn.addEventListener("click", () => {
						if (entry.kind === "select") {
							this.openSelection();
							return;
						}
						this.run(entry.kind);
					});
					menu.appendChild(btn);
				}
				document.body.appendChild(menu);
				this.menu = menu;
			}
			/** Mirror the open state onto the header action button. */
			syncActionButton(open) {
				const btn = document.querySelector(".dsh-conv-export-action");
				if (btn === null) return;
				btn.setAttribute("aria-pressed", String(open));
			}
			/** Close on any pointer-down outside the menu and its action button. */
			onOutside = (e) => {
				const target = e.target;
				if (!(target instanceof Node)) return;
				if (this.panel !== null) {
					if (this.panel === target && this.running === null) this.closePanel();
					return;
				}
				if (this.menu === null || this.menu.hidden) return;
				if (this.menu.contains(target)) return;
				if (target instanceof Element && target.closest(".dsh-conv-export-action") !== null) return;
				this.close();
			};
			/** Escape closes the menu / the idle selection panel. */
			onKeyDown = (e) => {
				if (e.key !== "Escape") return;
				if (this.panel !== null) {
					if (this.running === null) this.closePanel();
					return;
				}
				this.close();
			};
			/** 菜单基础标签文案（进度显示复用）。 */
			menuLabel(kind) {
				return kind === "markdown" ? t("menu.markdown") : kind === "pdf" ? t("menu.pdf") : t("menu.image");
			}
			/**
			* Run one export sink against the currently rendered transcript.
			* 光栅导出进行中时，再次点击同一菜单项触发取消。
			* @param kind - which sink to run.
			*/
			async run(kind) {
				if (this.running !== null) {
					if (this.running.kind === kind) this.running.abort.abort();
					return;
				}
				const messages = extractMessages();
				if (messages.length === 0) return;
				const button = this.menu?.querySelector(`[data-export-kind="${kind}"]`) ?? null;
				try {
					await this.execute(kind, messages, {
						el: button instanceof HTMLElement ? button : null,
						baseLabel: this.menuLabel(kind)
					});
				} finally {
					this.close();
				}
			}
			/**
			* 执行一次导出（菜单全量与面板筛选共用）：进度写入宿主元素
			* 「基础标签 done/total」，完成后复位；取消以 AbortError 落入已取消提示。
			* @param kind - 导出汇。
			* @param messages - 导出的回合列表（面板路径为筛选后的子集）。
			* @param progress - 进度宿主（可缺省）。
			*/
			async execute(kind, messages, progress) {
				const title = readTitle() ?? "Conversation";
				const stem = safeFileStem(title);
				const abort = new AbortController();
				this.running = {
					kind,
					abort
				};
				const onProgress = (done, total) => {
					if (progress !== void 0 && progress.el !== null) progress.el.textContent = `${progress.baseLabel} ${done}/${total}`;
				};
				try {
					if (kind === "markdown") downloadBlob(`${stem}.md`, "text/markdown;charset=utf-8", buildMarkdown(title, messages));
					else if (kind === "pdf") await exportPdf(title, messages, {
						signal: abort.signal,
						onProgress
					});
					else await exportImage(title, messages, {
						signal: abort.signal,
						onProgress
					});
				} catch (error) {
					if (error instanceof DOMException && error.name === "AbortError") this.toast(t("toast.cancelled"));
					else this.toast(t("toast.imageFail"));
				} finally {
					this.running = null;
					if (progress !== void 0 && progress.el !== null) progress.el.textContent = progress.baseLabel;
				}
			}
			/** 关闭选择面板（幂等）。 */
			closePanel() {
				this.panel?.remove();
				this.panel = null;
			}
			/**
			* 打开回合选择面板：逐回合勾选（默认全选）+ 格式挑选，确认后仅导出
			* 选中回合。导出期间确认按钮显示分片进度，再次点击或「取消」中止；
			* 面板随导出结束（含取消）自动关闭。
			*/
			openSelection() {
				const messages = extractMessages();
				if (messages.length === 0) return;
				this.close();
				this.closePanel();
				const checked = messages.map(() => true);
				let format = "markdown";
				const backdrop = document.createElement("div");
				backdrop.setAttribute("data-dsh-conv-export-panel-backdrop", "");
				const panel = document.createElement("div");
				panel.setAttribute("data-dsh-conv-export-panel", "");
				panel.setAttribute("role", "dialog");
				panel.setAttribute("aria-modal", "true");
				panel.setAttribute("aria-label", t("panel.title"));
				const title = document.createElement("div");
				title.setAttribute("data-dsh-conv-export-panel-title", "");
				title.textContent = t("panel.title");
				panel.appendChild(title);
				const toolbar = document.createElement("div");
				toolbar.setAttribute("data-dsh-conv-export-panel-toolbar", "");
				const allBtn = document.createElement("button");
				allBtn.type = "button";
				allBtn.textContent = t("panel.selectAll");
				const noneBtn = document.createElement("button");
				noneBtn.type = "button";
				noneBtn.textContent = t("panel.selectNone");
				const count = document.createElement("span");
				count.setAttribute("data-dsh-conv-export-panel-count", "");
				toolbar.append(allBtn, noneBtn, count);
				panel.appendChild(toolbar);
				const list = document.createElement("div");
				list.setAttribute("data-dsh-conv-export-panel-list", "");
				const boxes = [];
				messages.forEach((message, i) => {
					const row = document.createElement("label");
					row.setAttribute("data-dsh-conv-export-panel-item", "");
					const box = document.createElement("input");
					box.type = "checkbox";
					box.checked = true;
					box.addEventListener("change", () => {
						checked[i] = box.checked;
						sync();
					});
					boxes.push(box);
					const role = document.createElement("span");
					role.setAttribute("data-dsh-conv-export-panel-item-role", "");
					role.textContent = t(message.role === "user" ? "role.user" : "role.assistant");
					const text = document.createElement("span");
					text.setAttribute("data-dsh-conv-export-panel-item-text", "");
					text.textContent = previewOf(message);
					row.append(box, role, text);
					list.appendChild(row);
				});
				panel.appendChild(list);
				const formatRow = document.createElement("div");
				formatRow.setAttribute("data-dsh-conv-export-panel-format", "");
				const formatLabel = document.createElement("span");
				formatLabel.setAttribute("data-dsh-conv-export-panel-format-label", "");
				formatLabel.textContent = t("panel.format");
				formatRow.appendChild(formatLabel);
				const formatBtns = /* @__PURE__ */ new Map();
				for (const kind of [
					"markdown",
					"pdf",
					"image"
				]) {
					const btn = document.createElement("button");
					btn.type = "button";
					btn.setAttribute("data-dsh-conv-export-panel-format-option", "");
					btn.setAttribute("aria-pressed", String(kind === format));
					btn.textContent = this.menuLabel(kind);
					btn.addEventListener("click", () => {
						format = kind;
						for (const [k, b] of formatBtns) b.setAttribute("aria-pressed", String(k === format));
					});
					formatBtns.set(kind, btn);
					formatRow.appendChild(btn);
				}
				panel.appendChild(formatRow);
				const footer = document.createElement("div");
				footer.setAttribute("data-dsh-conv-export-panel-footer", "");
				const cancelBtn = document.createElement("button");
				cancelBtn.type = "button";
				cancelBtn.setAttribute("data-dsh-conv-export-panel-secondary", "");
				cancelBtn.textContent = t("panel.cancel");
				const confirmBtn = document.createElement("button");
				confirmBtn.type = "button";
				confirmBtn.setAttribute("data-dsh-conv-export-panel-primary", "");
				footer.append(cancelBtn, confirmBtn);
				panel.appendChild(footer);
				/** 同步计数与导出按钮（导出进行中不打扰进度文案）。 */
				const sync = () => {
					const n = checked.filter(Boolean).length;
					count.textContent = `${t("panel.selected")} ${n}/${messages.length}`;
					if (this.running === null) {
						confirmBtn.disabled = n === 0;
						confirmBtn.textContent = n === 0 ? t("panel.empty") : `${t("panel.export")} (${n})`;
					}
				};
				sync();
				allBtn.addEventListener("click", () => {
					checked.fill(true);
					for (const box of boxes) box.checked = true;
					sync();
				});
				noneBtn.addEventListener("click", () => {
					checked.fill(false);
					for (const box of boxes) box.checked = false;
					sync();
				});
				cancelBtn.addEventListener("click", () => {
					if (this.running !== null) {
						this.running.abort.abort();
						return;
					}
					this.closePanel();
				});
				confirmBtn.addEventListener("click", () => {
					if (this.running !== null) {
						this.running.abort.abort();
						return;
					}
					const selected = messages.filter((_, i) => checked[i]);
					if (selected.length === 0) return;
					this.execute(format, selected, {
						el: confirmBtn,
						baseLabel: `${t("panel.export")} (${selected.length})`
					}).then(() => {
						this.closePanel();
					});
				});
				backdrop.appendChild(panel);
				document.body.appendChild(backdrop);
				this.panel = backdrop;
			}
			/**
			* Show a transient toast (bottom-center) for export failures.
			* @param text - the message to show.
			*/
			toast(text) {
				const el = document.createElement("div");
				el.setAttribute("data-dsh-conv-export-toast", "");
				el.textContent = text;
				document.body.appendChild(el);
				setTimeout(() => {
					el.remove();
				}, 3200);
			}
		};
		/** The page-wide controller instance. */
		const controller = new ExportController();
		//#endregion
		//#region src/client/styles.ts
		/**
		* Global stylesheet adoption: the export dropdown chrome, the header action
		* button, the turn-selection panel, and the failure toast. Injected once
		* into document.head with a stable id so repeated plugin loads never
		* double-inject.
		*/
		/** Stable id of the injected <style> element. */
		const STYLE_ID = "dsh-conv-export-style";
		/**
		* The full stylesheet. Uses the harness --dsw-alias-* design tokens so the
		* menu follows the active theme, with plain-color fallbacks.
		*/
		const STYLE_TEXT = `
/* ---- header action button (mirrors dsh-conv-search's) ---- */
.dsh-conv-export-action {
  appearance: none;
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 8px;
  color: var(--dsw-alias-label-tertiary, currentColor);
  cursor: pointer;
  display: inline-flex;
  height: 28px;
  justify-content: center;
  margin: 0;
  padding: 6px;
  width: 28px;
}
.dsh-conv-export-action:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .12));
  color: var(--dsw-alias-label-secondary, currentColor);
}
.dsh-conv-export-action[aria-pressed="true"] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .16));
  color: var(--dsw-alias-label-primary, currentColor);
}

/* ---- dropdown menu ---- */
[data-dsh-conv-export-menu] {
  position: fixed;
  z-index: 1300;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 176px;
  padding: 6px;
  background: var(--dsw-alias-bg-base, #fff);
  border: 1px solid var(--dsw-alias-line-border, rgba(127, 127, 127, .22));
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, .18);
  color: var(--dsw-alias-label-primary, #111827);
}
[data-dsh-conv-export-menu][hidden] {
  display: none;
}
[data-dsh-conv-export-menu] button {
  appearance: none;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  text-align: left;
  padding: 7px 10px;
  border-radius: 8px;
  white-space: nowrap;
}
[data-dsh-conv-export-menu] button:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .12));
}
[data-dsh-conv-export-menu] hr {
  border: 0;
  border-top: 1px solid var(--dsw-alias-line-border, rgba(127, 127, 127, .18));
  margin: 4px 6px;
}

/* ---- turn-selection panel ---- */
[data-dsh-conv-export-panel-backdrop] {
  position: fixed;
  inset: 0;
  z-index: 1350;
  background: rgba(0, 0, 0, .32);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
[data-dsh-conv-export-panel] {
  background: var(--dsw-alias-bg-base, #fff);
  border: 1px solid var(--dsw-alias-line-border, rgba(127, 127, 127, .22));
  border-radius: 14px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, .24);
  color: var(--dsw-alias-label-primary, #111827);
  display: flex;
  flex-direction: column;
  max-height: min(80vh, 640px);
  width: min(520px, 92vw);
  overflow: hidden;
}
[data-dsh-conv-export-panel-title] {
  font-size: 15px;
  font-weight: 600;
  padding: 16px 18px 8px;
}
[data-dsh-conv-export-panel-toolbar] {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 18px 10px;
}
[data-dsh-conv-export-panel-toolbar] button {
  appearance: none;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 6px;
}
[data-dsh-conv-export-panel-toolbar] button:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .12));
}
[data-dsh-conv-export-panel-count] {
  margin-left: auto;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #6b7280);
}
[data-dsh-conv-export-panel-list] {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  padding: 0 10px;
}
[data-dsh-conv-export-panel-item] {
  align-items: flex-start;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  gap: 10px;
  padding: 8px;
}
[data-dsh-conv-export-panel-item]:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .12));
}
[data-dsh-conv-export-panel-item] input {
  flex: none;
  margin: 3px 0 0;
}
[data-dsh-conv-export-panel-item-role] {
  flex: none;
  font-size: 11px;
  font-weight: 600;
  min-width: 26px;
  padding-top: 2px;
  color: var(--dsw-alias-label-tertiary, #6b7280);
}
[data-dsh-conv-export-panel-item-text] {
  display: -webkit-box;
  font-size: 13px;
  line-height: 1.5;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  word-break: break-word;
}
[data-dsh-conv-export-panel-format] {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px 18px 0;
}
[data-dsh-conv-export-panel-format-label] {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #6b7280);
}
[data-dsh-conv-export-panel-format-option] {
  appearance: none;
  background: transparent;
  border: 1px solid var(--dsw-alias-line-border, rgba(127, 127, 127, .22));
  border-radius: 8px;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  padding: 5px 10px;
}
[data-dsh-conv-export-panel-format-option]:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .12));
}
[data-dsh-conv-export-panel-format-option][aria-pressed="true"] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .16));
  color: var(--dsw-alias-label-primary, currentColor);
}
[data-dsh-conv-export-panel-footer] {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 14px 18px 16px;
}
[data-dsh-conv-export-panel-secondary] {
  appearance: none;
  background: transparent;
  border: 1px solid var(--dsw-alias-line-border, rgba(127, 127, 127, .22));
  border-radius: 8px;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  padding: 7px 14px;
}
[data-dsh-conv-export-panel-secondary]:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .12));
}
[data-dsh-conv-export-panel-primary] {
  appearance: none;
  background: var(--dsw-alias-bg-inverse, #111827);
  border: 0;
  border-radius: 8px;
  color: var(--dsw-alias-label-inverse, #f9fafb);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  padding: 7px 14px;
}
[data-dsh-conv-export-panel-primary]:disabled {
  opacity: .5;
  cursor: not-allowed;
}

/* ---- failure toast ---- */
[data-dsh-conv-export-toast] {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1400;
  background: #111827;
  color: #f9fafb;
  font-size: 13px;
  padding: 8px 16px;
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, .28);
}
`;
		/**
		* Inject the stylesheet once. Safe to call from multiple mount paths.
		*/
		function adoptStyles() {
			if (document.getElementById(STYLE_ID) !== null) return;
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = STYLE_TEXT;
			document.head.appendChild(style);
		}
		//#endregion
		//#region src/client/index.ts
		/**
		* dsh-conv-export browser half: export the current conversation as
		* Markdown, PDF, or a long PNG image.
		*
		* One contribution: an export icon button in the session header's action
		* row, registered into the harness's `conversation.session.header.actions`
		* slot (the additive seat for per-session controls beside the title). The
		* button opens a dropdown with the three sinks; extraction runs at click
		* time over the rendered transcript, so exports always match what the
		* reader sees.
		*
		* Zero core changes: everything rides cordis effects and the declared slot.
		*/
		/** Stable Cordis plugin name (matches the manifest id). */
		const name = "@dsh-external/dsh-conv-export";
		/** Required services: the slot registry (the header action seat rides it). */
		const inject = ["slots"];
		/**
		* The session-header export button: toggles the dropdown. Pure presentation
		* over the global controller.
		* @param _props - the slot's standard kit (unused).
		* @returns the icon button.
		*/
		function ExportActionButton(_props) {
			const icon = (0, react.createElement)("svg", {
				viewBox: "0 0 16 16",
				width: 16,
				height: 16,
				fill: "none",
				"aria-hidden": true
			}, (0, react.createElement)("path", {
				d: "M8 2v8m0 0 3-3M8 10 5 7",
				stroke: "currentColor",
				strokeWidth: 1.5,
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}), (0, react.createElement)("path", {
				d: "M3 12.5v1A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-1",
				stroke: "currentColor",
				strokeWidth: 1.5,
				strokeLinecap: "round"
			}));
			return (0, react.createElement)("button", {
				type: "button",
				className: "dsh-conv-export-action",
				title: t("action.hint"),
				"aria-label": t("action.aria"),
				"aria-pressed": "false",
				onClick: (e) => {
					controller.toggle(e.currentTarget);
				}
			}, icon);
		}
		/**
		* Browser plugin body: install the controller's document effects and
		* register the header action button into the session header slot.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			adoptStyles();
			ctx.effect(() => {
				controller.install();
				return () => {
					controller.uninstall();
				};
			}, "dsh-conv-export: controller");
			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "dsh-conv-export-action",
				order: 110,
				inject: () => ({})
			}, ExportActionButton));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
