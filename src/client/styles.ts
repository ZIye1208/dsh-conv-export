/**
 * Global stylesheet adoption: the export dropdown chrome, the header action
 * button, the turn-selection panel, the batch session panel, and the failure
 * toast. Injected once into document.head with a stable id so repeated
 * plugin loads never double-inject.
 */

/** Stable id of the injected <style> element. */
const STYLE_ID = 'dsh-conv-export-style'

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
  background: rgba(17, 24, 39, .4);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: dsh-conv-export-fade-in .16s ease-out;
}
[data-dsh-conv-export-panel] {
  background: var(--dsw-alias-bg-base, #fff);
  border: 1px solid var(--dsw-alias-line-border, rgba(127, 127, 127, .22));
  border-radius: 16px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, .28), 0 4px 16px rgba(0, 0, 0, .12);
  color: var(--dsw-alias-label-primary, #111827);
  display: flex;
  flex-direction: column;
  max-height: min(82vh, 680px);
  width: min(560px, 92vw);
  overflow: hidden;
  animation: dsh-conv-export-panel-in .2s cubic-bezier(.2, .9, .3, 1);
}
[data-dsh-conv-export-panel-title] {
  border-bottom: 1px solid var(--dsw-alias-line-border, rgba(127, 127, 127, .16));
  font-size: 16px;
  font-weight: 650;
  letter-spacing: .2px;
  padding: 18px 20px 14px;
}
[data-dsh-conv-export-panel-toolbar] {
  align-items: center;
  border-bottom: 1px solid var(--dsw-alias-line-border, rgba(127, 127, 127, .16));
  display: flex;
  gap: 8px;
  padding: 10px 20px;
}
[data-dsh-conv-export-panel-toolbar] button {
  appearance: none;
  background: transparent;
  border: 1px solid var(--dsw-alias-line-border, rgba(127, 127, 127, .24));
  border-radius: 999px;
  color: var(--dsw-alias-label-secondary, inherit);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  padding: 4px 12px;
  transition: background .12s ease, color .12s ease;
}
[data-dsh-conv-export-panel-toolbar] button:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .12));
  color: var(--dsw-alias-label-primary, inherit);
}
[data-dsh-conv-export-panel-count] {
  background: rgba(127, 127, 127, .12);
  border-radius: 999px;
  color: var(--dsw-alias-label-secondary, inherit);
  font-size: 12px;
  font-weight: 500;
  margin-left: auto;
  padding: 4px 12px;
}
[data-dsh-conv-export-panel-list] {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 10px 12px;
  scrollbar-width: thin;
  scrollbar-color: rgba(127, 127, 127, .35) transparent;
}
[data-dsh-conv-export-panel-list]::-webkit-scrollbar {
  width: 10px;
}
[data-dsh-conv-export-panel-list]::-webkit-scrollbar-thumb {
  background: rgba(127, 127, 127, .3);
  background-clip: content-box;
  border: 3px solid transparent;
  border-radius: 8px;
}
[data-dsh-conv-export-panel-item] {
  align-items: flex-start;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  display: flex;
  gap: 10px;
  padding: 9px 10px;
  transition: background .12s ease, border-color .12s ease;
}
[data-dsh-conv-export-panel-item]:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .1));
}
/* 勾选行：淡色底 + 细边框，一眼区分「将导出 / 已排除」。 */
[data-dsh-conv-export-panel-item]:has(input:checked) {
  background: rgba(59, 130, 246, .06);
  border-color: rgba(59, 130, 246, .18);
}
[data-dsh-conv-export-panel-item]:focus-within {
  outline: 2px solid rgba(59, 130, 246, .45);
  outline-offset: 1px;
}
[data-dsh-conv-export-panel-item] input {
  accent-color: #3b82f6;
  flex: none;
  margin: 3px 0 0;
}
/* 未勾选行：角色与正文整体降透明度（被排除的视觉信号）。 */
[data-dsh-conv-export-panel-item]:not(:has(input:checked)) [data-dsh-conv-export-panel-item-role],
[data-dsh-conv-export-panel-item]:not(:has(input:checked)) [data-dsh-conv-export-panel-item-text] {
  opacity: .5;
}
[data-dsh-conv-export-panel-item-role] {
  border-radius: 999px;
  flex: none;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
  margin-top: 1px;
  padding: 1px 9px;
}
/* 角色徽章分色：用户 = 蓝、助手 = 绿（半透明底在明暗主题下均可读）。 */
[data-dsh-conv-export-panel-item][data-role="user"] [data-dsh-conv-export-panel-item-role] {
  background: rgba(59, 130, 246, .14);
  color: #3b82f6;
}
[data-dsh-conv-export-panel-item][data-role="assistant"] [data-dsh-conv-export-panel-item-role] {
  background: rgba(16, 185, 129, .14);
  color: #10b981;
}
[data-dsh-conv-export-panel-item-text] {
  color: var(--dsw-alias-label-secondary, inherit);
  display: -webkit-box;
  font-size: 13px;
  line-height: 1.55;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  padding-top: 2px;
  word-break: break-word;
}
[data-dsh-conv-export-panel-item]:has(input:checked) [data-dsh-conv-export-panel-item-text] {
  color: var(--dsw-alias-label-primary, inherit);
}
[data-dsh-conv-export-panel-format] {
  align-items: center;
  border-top: 1px solid var(--dsw-alias-line-border, rgba(127, 127, 127, .16));
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px 20px;
}
[data-dsh-conv-export-panel-format-label] {
  color: var(--dsw-alias-label-tertiary, #6b7280);
  font-size: 12px;
  font-weight: 500;
  margin-right: 2px;
}
[data-dsh-conv-export-panel-format-option] {
  appearance: none;
  background: transparent;
  border: 1px solid var(--dsw-alias-line-border, rgba(127, 127, 127, .24));
  border-radius: 999px;
  color: var(--dsw-alias-label-secondary, inherit);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  padding: 5px 13px;
  transition: background .12s ease, color .12s ease, border-color .12s ease;
}
[data-dsh-conv-export-panel-format-option]:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .12));
}
/* 激活格式：反色填充，与主按钮同一强调语言。 */
[data-dsh-conv-export-panel-format-option][aria-pressed="true"] {
  background: var(--dsw-alias-bg-inverse, #111827);
  border-color: transparent;
  color: var(--dsw-alias-label-inverse, #f9fafb);
  font-weight: 600;
}
[data-dsh-conv-export-panel-format-option]:focus-visible,
[data-dsh-conv-export-panel-toolbar] button:focus-visible,
[data-dsh-conv-export-panel-secondary]:focus-visible,
[data-dsh-conv-export-panel-primary]:focus-visible {
  outline: 2px solid rgba(59, 130, 246, .45);
  outline-offset: 1px;
}
[data-dsh-conv-export-panel-footer] {
  border-top: 1px solid var(--dsw-alias-line-border, rgba(127, 127, 127, .16));
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 14px 20px 18px;
}
[data-dsh-conv-export-panel-secondary] {
  appearance: none;
  background: transparent;
  border: 1px solid var(--dsw-alias-line-border, rgba(127, 127, 127, .24));
  border-radius: 10px;
  color: var(--dsw-alias-label-secondary, inherit);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 8px 16px;
  transition: background .12s ease;
}
[data-dsh-conv-export-panel-secondary]:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .12));
  color: var(--dsw-alias-label-primary, inherit);
}
[data-dsh-conv-export-panel-primary] {
  appearance: none;
  background: var(--dsw-alias-bg-inverse, #111827);
  border: 0;
  border-radius: 10px;
  color: var(--dsw-alias-label-inverse, #f9fafb);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  min-width: 96px;
  padding: 8px 18px;
  transition: filter .12s ease, transform .06s ease;
}
[data-dsh-conv-export-panel-primary]:hover {
  filter: brightness(1.15);
}
[data-dsh-conv-export-panel-primary]:active {
  transform: translateY(1px);
}
[data-dsh-conv-export-panel-primary]:disabled {
  cursor: not-allowed;
  filter: grayscale(.4);
  opacity: .55;
  transform: none;
}
/* 入场动画 + 减动效偏好。 */
@keyframes dsh-conv-export-fade-in {
  from { opacity: 0 }
  to { opacity: 1 }
}
@keyframes dsh-conv-export-panel-in {
  from { opacity: 0; transform: translateY(10px) scale(.97) }
  to { opacity: 1; transform: translateY(0) scale(1) }
}
@media (prefers-reduced-motion: reduce) {
  [data-dsh-conv-export-panel-backdrop],
  [data-dsh-conv-export-panel] {
    animation: none;
  }
}

/* ---- batch session panel (shares panel chrome; adds search + note rows + session rows) ---- */
[data-dsh-conv-export-batch-search] {
  background: transparent;
  border: 1px solid var(--dsw-alias-line-border, rgba(127, 127, 127, .24));
  border-radius: 10px;
  color: var(--dsw-alias-label-primary, inherit);
  font: inherit;
  font-size: 13px;
  margin: 10px 20px 0;
  padding: 7px 12px;
}
[data-dsh-conv-export-batch-search]:focus {
  outline: 2px solid rgba(59, 130, 246, .45);
  outline-offset: 1px;
}
/* 列表提示行：加载中 / 加载失败（含重试按钮）/ 空 / 无匹配。 */
[data-dsh-conv-export-panel-note] {
  color: var(--dsw-alias-label-tertiary, #6b7280);
  font-size: 13px;
  padding: 20px 10px;
  text-align: center;
}
[data-dsh-conv-export-panel-note] button {
  appearance: none;
  background: transparent;
  border: 1px solid var(--dsw-alias-line-border, rgba(127, 127, 127, .24));
  border-radius: 999px;
  color: var(--dsw-alias-label-secondary, inherit);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  margin-left: 8px;
  padding: 4px 12px;
  transition: background .12s ease;
}
[data-dsh-conv-export-panel-note] button:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .12));
}
/* 会话行：标题（单行截断）+ 创建时间（右侧固定）。 */
[data-dsh-conv-export-batch-name] {
  color: var(--dsw-alias-label-secondary, inherit);
  flex: 1;
  font-size: 13px;
  line-height: 1.55;
  min-width: 0;
  overflow: hidden;
  padding-top: 2px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-dsh-conv-export-panel-item]:has(input:checked) [data-dsh-conv-export-batch-name] {
  color: var(--dsw-alias-label-primary, inherit);
}
[data-dsh-conv-export-panel-item]:not(:has(input:checked)) [data-dsh-conv-export-batch-name],
[data-dsh-conv-export-panel-item]:not(:has(input:checked)) [data-dsh-conv-export-batch-time] {
  opacity: .5;
}
[data-dsh-conv-export-batch-time] {
  color: var(--dsw-alias-label-tertiary, #6b7280);
  flex: none;
  font-size: 11px;
  padding-top: 4px;
  white-space: nowrap;
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
`

/**
 * Inject the stylesheet once. Safe to call from multiple mount paths.
 */
export function adoptStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = STYLE_TEXT
  document.head.appendChild(style)
}
