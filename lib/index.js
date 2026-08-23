//#region src/host/http.ts
/** 带状态码的业务错误。 */
var HttpError = class extends Error {
	status;
	constructor(message, status = 400) {
		super(message);
		this.status = status;
		this.name = "HttpError";
	}
};
/**
* 创建路由器。
* @param basePath 前缀路径（默认 /conv-export）。
*/
function createRouter(basePath = "/conv-export") {
	const routes = /* @__PURE__ */ new Map();
	return {
		add(method, path, handler) {
			const key = `${method} ${path}`;
			if (routes.has(key)) throw new Error(`conv-export http: duplicate route ${key}`);
			routes.set(key, handler);
			return () => {
				if (routes.get(key) === handler) routes.delete(key);
			};
		},
		async handle(req, res) {
			let url;
			try {
				url = new URL(req.url ?? "/", "http://localhost");
			} catch {
				return sendJson(res, 400, { error: "bad request url" });
			}
			if (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) return sendJson(res, 404, { error: "not found" });
			const sub = url.pathname.slice(basePath.length) || "/";
			const key = `${req.method ?? "GET"} ${sub}`;
			const handler = routes.get(key);
			if (!handler) return sendJson(res, 404, { error: `no route: ${key}` });
			try {
				const body = req.method === "GET" || req.method === "HEAD" ? void 0 : await readJsonBody(req);
				await handler(req, res, {
					query: url.searchParams,
					body
				});
			} catch (error) {
				try {
					if (error instanceof HttpError) sendJson(res, error.status, { error: error.message });
					else sendJson(res, 500, { error: error instanceof Error ? error.message : "internal error" });
				} catch {
					res.destroy();
				}
			}
		}
	};
}
/** 发送 JSON 响应。 */
function sendJson(res, status, payload) {
	if (res.writableEnded) return;
	if (res.headersSent) {
		res.end();
		return;
	}
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	res.end(JSON.stringify(payload));
}
/** 请求体读取默认超时（毫秒）。 */
const BODY_READ_TIMEOUT_MS = 3e4;
/**
* 读取并解析 JSON 请求体（大小上限默认 8 MB；空正文返回 {}）。
* @param req 请求对象。
* @param limitBytes 大小上限（字节）。
* @param timeoutMs 读取超时（默认 30 秒）：慢速/停滞的 body 不会无限挂起，超时抛 408。
*/
async function readJsonBody(req, limitBytes = 8388608, timeoutMs = BODY_READ_TIMEOUT_MS) {
	const chunks = await new Promise((resolve, reject) => {
		const buffer = [];
		let size = 0;
		let settled = false;
		const timer = setTimeout(() => {
			fail(new HttpError("request body read timeout", 408));
			req.destroy();
		}, timeoutMs);
		const fail = (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			reject(error);
		};
		req.on("data", (chunk) => {
			if (settled) return;
			size += chunk.byteLength;
			if (size > limitBytes) {
				fail(new HttpError("request body too large", 413));
				req.destroy();
				return;
			}
			buffer.push(chunk);
		});
		req.on("end", () => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(buffer);
		});
		req.on("error", (error) => fail(error));
		req.on("close", () => {
			fail(new HttpError("request body stream closed early", 400));
		});
	});
	if (chunks.length === 0) return {};
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		throw new HttpError("request body is not valid JSON", 400);
	}
}
//#endregion
//#region src/host/time.ts
/**
* 北京时间（UTC+8，无夏令时）工具（与 dsh-companion 的 core/time.ts
* 同源，仅保留批量导出所需的最小面）。批量 ZIP 文件名与 Markdown
* 元信息头的时间戳都以北京时间为准，与宿主机时区无关（CI/容器友好）。
*/
const BEIJING_OFFSET_MS = 288e5;
/** 北京时间日期键 YYYY-MM-DD。 */
function beijingDayKey(ts) {
	const d = new Date(ts + BEIJING_OFFSET_MS);
	return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
/** 北京时间格式化 YYYY-MM-DD HH:mm:ss。 */
function formatBeijingTime(ts) {
	const d = new Date(ts + BEIJING_OFFSET_MS);
	return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}
function pad2(n) {
	return n < 10 ? `0${n}` : String(n);
}
//#endregion
//#region src/host/transcript.ts
/**
* 会话转录：从 session-query 的原始日志快照派生人类可读对话文本，
* 并渲染为 Markdown（批量导出的条目内容）。
*
* 与 dsh-companion 的 core/transcript.ts 同源：Harness 会话是
* append-only 的类型化事件日志，这里只提取 `user/message` 与
* `assistant/message` 两类表面事件；提取后按 seq 稳定排序，防御
* 上游乱序。
*
* 注意：与单会话导出不同，批量条目由日志派生（原始文本 + 元信息头），
* 不经渲染 HTML 反向序列化——其他会话没有已渲染的 DOM 可读。
*/
/** 从日志快照提取对话轮次（提取后按 seq 稳定排序，防御上游乱序）。 */
function transcriptFromLog(snapshot) {
	const turns = [];
	for (const event of snapshot.events) if (event.type === "user/message") {
		const data = event.data;
		const text = extractContentText(data?.content ?? event.data);
		if (text) turns.push({
			role: "user",
			text,
			time: event.time,
			seq: event.seq
		});
	} else if (event.type === "assistant/message") {
		const data = event.data;
		const text = extractContentText(data?.message?.content ?? data?.content);
		if (text) turns.push({
			role: "assistant",
			text,
			time: event.time,
			seq: event.seq
		});
	}
	turns.sort((a, b) => a.seq - b.seq);
	return turns;
}
/** 将消息 content（字符串或内容块数组）压平为纯文本。 */
function extractContentText(content) {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts = [];
	for (const block of content) {
		if (!block || typeof block !== "object") continue;
		const b = block;
		if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
		else if (b.type === "tool_use") parts.push(`[工具调用${typeof b.name === "string" ? `：${b.name}` : ""}]`);
		else if (b.type === "tool_result") parts.push("[工具结果]");
	}
	return parts.join("\n");
}
/** 渲染为 Markdown 转录文本。 */
function formatTranscript(turns, options) {
	const lines = [];
	for (const turn of turns) {
		const speaker = turn.role === "user" ? "用户" : turn.role === "assistant" ? "助手" : turn.role;
		const stamp = options.timestamps ? `（${formatBeijingTime(turn.time)}）` : "";
		lines.push(`### ${speaker}${stamp}`, "", turn.text, "");
	}
	return lines.join("\n").trimEnd();
}
/** 完整的 Markdown 导出文档（含元信息头）。 */
function transcriptToMarkdown(session, turns, options) {
	return [
		...[
			`# ${session.title || "未命名对话"}`,
			"",
			`- 会话 ID：${session.id}`,
			`- 创建时间：${formatBeijingTime(session.createdAt)}`,
			`- 导出时间：${formatBeijingTime(Date.now())}`,
			`- 消息轮次：${turns.length}`,
			"",
			"---",
			""
		],
		formatTranscript(turns, options),
		""
	].join("\n");
}
//#endregion
//#region src/host/zip.ts
const CRC_TABLE = (() => {
	const table = /* @__PURE__ */ new Uint32Array(256);
	for (let n = 0; n < 256; n += 1) {
		let c = n;
		for (let k = 0; k < 8; k += 1) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();
function crc32(data) {
	let crc = 4294967295;
	for (let i = 0; i < data.byteLength; i += 1) crc = CRC_TABLE[(crc ^ data[i]) & 255] ^ crc >>> 8;
	return (crc ^ 4294967295) >>> 0;
}
/** 清理文件名中的非法字符，防止 ZIP 目录穿越。 */
function sanitizeFileName(name) {
	return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "_").slice(0, 120) || "untitled";
}
/** ZIP（非 ZIP64）条目数上限：EOCD 计数字段为 16 位。 */
const MAX_ENTRIES = 65535;
/** ZIP（非 ZIP64）单条目字节上限：局部头/中心目录的长度字段为 32 位。 */
const MAX_ENTRY_BYTES = 4294967295;
/**
* 构建 ZIP 文件字节流。
* @param entries 条目列表（名称在内部统一经 sanitizeFileName 强制清理）。
* @returns 完整的 .zip 字节。
* @throws 条目数超过 65535，或单条目超过 4GB（不支持 ZIP64）。
*/
function buildZip(entries) {
	if (entries.length > MAX_ENTRIES) throw new Error(`zip: too many entries (${entries.length} > ${MAX_ENTRIES}); ZIP64 is not supported`);
	const encoder = new TextEncoder();
	const chunks = [];
	const centralChunks = [];
	let offset = 0;
	let centralSize = 0;
	for (const entry of entries) {
		if (entry.data.byteLength > MAX_ENTRY_BYTES) throw new Error(`zip: entry "${entry.name}" exceeds the 4GB size limit; ZIP64 is not supported`);
		const nameBytes = encoder.encode(sanitizeFileName(entry.name));
		const crc = crc32(entry.data);
		const size = entry.data.byteLength;
		const local = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(30));
		local.setUint32(0, 67324752, true);
		local.setUint16(4, 20, true);
		local.setUint16(6, 2048, true);
		local.setUint16(8, 0, true);
		local.setUint16(10, 0, true);
		local.setUint16(12, 33, true);
		local.setUint32(14, crc, true);
		local.setUint32(18, size, true);
		local.setUint32(22, size, true);
		local.setUint16(26, nameBytes.byteLength, true);
		local.setUint16(28, 0, true);
		chunks.push(new Uint8Array(local.buffer), nameBytes, entry.data);
		const central = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(46));
		central.setUint32(0, 33639248, true);
		central.setUint16(4, 20, true);
		central.setUint16(6, 20, true);
		central.setUint16(8, 2048, true);
		central.setUint16(10, 0, true);
		central.setUint16(12, 0, true);
		central.setUint16(14, 33, true);
		central.setUint32(16, crc, true);
		central.setUint32(20, size, true);
		central.setUint32(24, size, true);
		central.setUint16(28, nameBytes.byteLength, true);
		central.setUint32(42, offset, true);
		centralChunks.push(new Uint8Array(central.buffer), nameBytes);
		offset += 30 + nameBytes.byteLength + size;
		centralSize += 46 + nameBytes.byteLength;
	}
	const eocd = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(22));
	eocd.setUint32(0, 101010256, true);
	eocd.setUint16(8, entries.length, true);
	eocd.setUint16(10, entries.length, true);
	eocd.setUint32(12, centralSize, true);
	eocd.setUint32(16, offset, true);
	return concatBytes([
		...chunks,
		...centralChunks,
		new Uint8Array(eocd.buffer)
	]);
}
function concatBytes(parts) {
	const total = parts.reduce((sum, p) => sum + p.byteLength, 0);
	const out = new Uint8Array(total);
	let pos = 0;
	for (const part of parts) {
		out.set(part, pos);
		pos += part.byteLength;
	}
	return out;
}
/** 文本编码器（条目内容统一 UTF-8）。 */
const encoder = new TextEncoder();
/**
* 解析 POST /conv-export/batch 的请求体 sessionIds 字段。
* @throws 形状不符（非对象 / 非数组 / 空数组 / 含非字符串项）→ 400。
*/
function parseSessionIds(body) {
	if (typeof body !== "object" || body === null || Array.isArray(body)) throw new HttpError("请求体必须是 JSON 对象");
	const raw = body.sessionIds;
	if (!Array.isArray(raw) || raw.length === 0) throw new HttpError("sessionIds 必填且必须为非空数组");
	const ids = [];
	for (const item of raw) {
		if (typeof item !== "string" || item.trim().length === 0) throw new HttpError("sessionIds 必须全部为非空字符串");
		ids.push(item.trim());
	}
	return ids;
}
/**
* 批量导出多个会话并打包为 Markdown ZIP。
* @param sessionQuery 会话查询服务（对宿主的唯一依赖）。
* @param sessionIds 会话 id 列表：先经 Set 去重，去重后数量不得超过
* MAX_BATCH_SESSIONS；单个会话读取失败会被跳过并计入 skipped，
* 系统性错误（ZIP 组装等）上抛。
*/
async function buildBatchZip(sessionQuery, sessionIds) {
	if (sessionIds.length === 0) throw new HttpError("sessionIds 不能为空", 400);
	const uniqueIds = [...new Set(sessionIds)];
	if (uniqueIds.length > 100) throw new HttpError(`批量导出一次最多支持 100 个会话`, 400);
	const entries = [];
	const usedNames = /* @__PURE__ */ new Set();
	let skipped = 0;
	for (const sessionId of uniqueIds) try {
		const snapshot = await sessionQuery.readSession(sessionId);
		const session = snapshot.session;
		const turns = transcriptFromLog(snapshot);
		const base = sanitizeFileName(session.title || session.id);
		entries.push({
			name: uniqueEntryName(usedNames, `${base}.md`),
			data: encoder.encode(transcriptToMarkdown(session, turns, { timestamps: true }))
		});
	} catch {
		skipped += 1;
	}
	if (entries.length === 0) throw new HttpError("没有可导出的会话", 404);
	return {
		fileName: `dsh-conversations-${beijingDayKey(Date.now())}.zip`,
		bytes: buildZip(entries),
		skipped
	};
}
/**
* 将错误收敛为用户安全的 HttpError：
* HttpError 原样透传；其余错误以通用文案包装，避免泄漏内部细节。
*/
function toSafeHttpError(error, fallbackMessage) {
	if (error instanceof HttpError) return error;
	return new HttpError(fallbackMessage, 500);
}
/** ZIP 条目名去重：重名时在扩展名前插入 -2/-3… 序号，防止覆盖。 */
function uniqueEntryName(used, name) {
	if (!used.has(name)) {
		used.add(name);
		return name;
	}
	const dot = name.lastIndexOf(".");
	const stem = dot > 0 ? name.slice(0, dot) : name;
	const ext = dot > 0 ? name.slice(dot) : "";
	for (let suffix = 2;; suffix += 1) {
		const candidate = `${stem}-${suffix}${ext}`;
		if (!used.has(candidate)) {
			used.add(candidate);
			return candidate;
		}
	}
}
//#endregion
//#region src/index.ts
/** Stable Cordis plugin name (matches the manifest id). */
const name = "@dsh-external/dsh-conv-export";
/** 依赖服务：同源路由挂载点与会话查询（批量导出专用，只读）。 */
const inject = ["webServer", "sessionQuery"];
/**
* 宿主入口：注册 /conv-export 前缀路由与两个批量导出端点。
* 全部注册经 ctx.effect，随插件卸载自动回卷；错误一律收敛为
* HttpError，不泄漏内部细节。
* @param ctx - host root context（经 inject 提供 webServer / sessionQuery）。
*/
function apply(ctx) {
	const router = createRouter("/conv-export");
	ctx.effect(() => {
		const disposers = [
			ctx.webServer.register({
				kind: "prefix",
				path: "/conv-export",
				handler: (req, res) => router.handle(req, res)
			}),
			router.add("GET", "/sessions", async (_req, res) => {
				try {
					sendJson(res, 200, { sessions: await ctx.sessionQuery.listSessions() });
				} catch (error) {
					throw toSafeHttpError(error, "获取会话列表失败");
				}
			}),
			router.add("POST", "/batch", async (_req, res, hctx) => {
				try {
					const sessionIds = parseSessionIds(hctx.body);
					const result = await buildBatchZip(ctx.sessionQuery, sessionIds);
					sendJson(res, 200, {
						kind: "file",
						fileName: result.fileName,
						mimeType: "application/zip",
						contentBase64: toBase64(result.bytes)
					});
				} catch (error) {
					throw toSafeHttpError(error, "批量导出失败");
				}
			})
		];
		return () => {
			for (const dispose of [...disposers].reverse()) dispose();
		};
	}, "dsh-conv-export: host routes");
}
/** 字节内容 base64 编码（HTTP 响应中字节一律 base64）。 */
function toBase64(bytes) {
	return Buffer.from(bytes).toString("base64");
}
//#endregion
export { apply, inject, name };
