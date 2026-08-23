import type { SessionHeader, SessionLogSnapshot } from './types.ts';
export interface TranscriptTurn {
    role: 'user' | 'assistant' | 'system' | 'tool';
    text: string;
    time: number;
    seq: number;
}
/** 从日志快照提取对话轮次（提取后按 seq 稳定排序，防御上游乱序）。 */
export declare function transcriptFromLog(snapshot: SessionLogSnapshot): TranscriptTurn[];
/** 将消息 content（字符串或内容块数组）压平为纯文本。 */
export declare function extractContentText(content: unknown): string;
/** 完整的 Markdown 导出文档（含元信息头）。 */
export declare function transcriptToMarkdown(session: SessionHeader, turns: readonly TranscriptTurn[], options: {
    timestamps: boolean;
}): string;
