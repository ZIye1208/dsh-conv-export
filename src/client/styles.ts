/**
 * Global stylesheet adoption: the export dropdown chrome, the header action
 * button, the turn-selection panel, and the failure toast. Injected once
 * into document.head with a stable id so repeated plugin loads never
 * double-inject.
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
