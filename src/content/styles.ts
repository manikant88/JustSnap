export const styles = `
  :host, * { box-sizing: border-box; }
  :host {
    --docksnip-glass-background:
      radial-gradient(circle at 28% 0%, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.07) 30%, rgba(255, 255, 255, 0) 56%),
      linear-gradient(105deg, rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.035) 38%, rgba(255, 255, 255, 0.095) 72%, rgba(255, 255, 255, 0.045)),
      linear-gradient(180deg, rgba(31, 37, 46, 0.72), rgba(17, 21, 29, 0.66));
    --docksnip-glass-border: rgba(255, 255, 255, 0.24);
    --docksnip-glass-shadow:
      inset 0 1px 1px rgba(255, 255, 255, 0.32),
      inset 0 -1px 1px rgba(255, 255, 255, 0.1),
      0 18px 42px rgba(3, 7, 18, 0.28);
  }
  :host, :host * {
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  }
  button, input { font: inherit; }
  .justsnap-hidden { opacity: 0 !important; pointer-events: none !important; }
  .justsnap-rail {
    position: fixed;
    top: 50%;
    right: 14px;
    z-index: 2147483646;
    width: max(56px, var(--justsnap-rail-surface, 74px));
    height: auto;
    max-height: min(90vh, calc(100vh - 24px));
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: center;
    color: rgba(246, 250, 255, 0.92);
    background: var(--docksnip-glass-background);
    border: 1px solid var(--docksnip-glass-border);
    border-radius: 16px;
    box-shadow: var(--docksnip-glass-shadow);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    overflow: visible;
    translate: 0 -50%;
    backdrop-filter: blur(26px) saturate(190%) brightness(1.08);
    -webkit-backdrop-filter: blur(26px) saturate(190%) brightness(1.08);
    pointer-events: none;
    animation: docksnip-surface-enter 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .justsnap-rail-expanded {
    max-height: none;
  }
  .justsnap-rail::before,
  .justsnap-rail::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
  }
  .justsnap-rail::before {
    z-index: 0;
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.035) 24%, rgba(255, 255, 255, 0) 56%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0) 18%, rgba(255, 255, 255, 0.06) 100%);
    opacity: 0.82;
    mix-blend-mode: screen;
  }
  .justsnap-rail::after {
    z-index: 0;
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.1),
      inset 0 0 28px rgba(255, 255, 255, 0.045),
      inset 0 -18px 30px rgba(0, 0, 0, 0.13);
  }
  .justsnap-rail-control-slot {
    position: relative;
    z-index: 10;
    width: 100%;
    height: calc(var(--justsnap-dock-base, 52px) + max(4px, var(--justsnap-dock-gap, 12px)));
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 7px;
    pointer-events: none;
  }
  .justsnap-rail-control {
    position: relative;
    width: var(--justsnap-dock-base, 52px);
    min-width: 0;
    height: var(--justsnap-dock-base, 52px);
    border: 0;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: rgba(245, 250, 255, 0.9);
    background: transparent;
    cursor: pointer;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0);
    transition: background 120ms ease, color 120ms ease, scale 120ms ease, box-shadow 120ms ease;
    pointer-events: auto;
  }
  .justsnap-rail-control::before,
  .justsnap-rail-control::after {
    position: absolute;
    top: 50%;
    translate: 0 -50%;
    opacity: 0;
    pointer-events: none;
    transition: opacity 90ms ease, translate 90ms ease;
  }
  .justsnap-rail-control::before {
    content: attr(data-tooltip);
    right: calc(100% + 11px);
    z-index: 20;
    max-width: 220px;
    padding: 8px 10px;
    border-radius: 7px;
    color: #fff;
    background: rgba(17, 17, 17, 0.96);
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.24);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.12;
    letter-spacing: 0;
    white-space: nowrap;
  }
  .justsnap-rail-control::after {
    content: "";
    right: calc(100% + 4px);
    z-index: 21;
    width: 0;
    height: 0;
    border-top: 7px solid transparent;
    border-bottom: 7px solid transparent;
    border-left: 7px solid rgba(17, 17, 17, 0.96);
  }
  .justsnap-rail-control svg {
    width: min(20px, max(13px, calc(var(--justsnap-dock-base, 52px) * 0.42)));
    height: min(20px, max(13px, calc(var(--justsnap-dock-base, 52px) * 0.42)));
  }
  .justsnap-rail-control:hover:not(:disabled),
  .justsnap-rail-control:focus-visible {
    color: #fff;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.08)),
      rgba(255, 255, 255, 0.08);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.24),
      inset 0 -1px 0 rgba(255, 255, 255, 0.08),
      0 8px 18px rgba(3, 7, 18, 0.16);
    outline: none;
    scale: 1.06;
  }
  .justsnap-rail-control:hover::before,
  .justsnap-rail-control:hover::after,
  .justsnap-rail-control:focus-visible::before,
  .justsnap-rail-control:focus-visible::after {
    opacity: 1;
    translate: -4px -50%;
  }
  .justsnap-rail-control:disabled { opacity: 0.45; cursor: not-allowed; }
  .justsnap-settings-control-hidden { display: none; }

  .justsnap-toolbar-notice {
    position: fixed;
    top: 76px;
    left: 50%;
    translate: -50% 0;
    z-index: 2147483647;
    width: min(440px, calc(100vw - 28px));
    min-height: 44px;
    padding: 8px 8px 8px 13px;
    border: 1px solid rgba(248, 113, 113, 0.38);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    background: var(--docksnip-glass-background);
    color: #fff;
    box-shadow: var(--docksnip-glass-shadow);
    backdrop-filter: blur(26px) saturate(190%) brightness(1.08);
    -webkit-backdrop-filter: blur(26px) saturate(190%) brightness(1.08);
    animation: docksnip-notice-enter 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .justsnap-toolbar-notice-icon {
    flex: 0 0 auto;
    color: rgba(252, 165, 165, 0.96);
  }
  .justsnap-toolbar-notice-message {
    flex: 1 1 auto;
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
    letter-spacing: 0;
  }
  .justsnap-toolbar-notice-action {
    min-width: 42px;
    height: 30px;
    padding: 0 11px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 9px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    color: #fff;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.06)),
      rgba(255, 255, 255, 0.06);
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
  }
  .justsnap-toolbar-notice-action:hover,
  .justsnap-toolbar-notice-action:focus-visible {
    background: rgba(255, 255, 255, 0.18);
    outline: none;
  }
  .justsnap-page-image-add {
    position: fixed;
    z-index: 2147483645;
    width: 42px;
    height: 42px;
    border: 1px solid rgba(255, 255, 255, 0.38);
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: rgba(248, 250, 252, 0.96);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.05)),
      rgba(15, 23, 42, 0.76);
    box-shadow:
      0 12px 28px rgba(3, 7, 18, 0.26),
      0 0 0 3px rgba(14, 165, 233, 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.24);
    cursor: pointer;
    translate: -50% -50%;
    backdrop-filter: blur(12px) saturate(150%);
    -webkit-backdrop-filter: blur(12px) saturate(150%);
    transition: background 120ms ease, color 120ms ease, scale 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
  }
  .justsnap-page-image-add::before,
  .justsnap-page-image-add::after {
    position: absolute;
    top: 50%;
    translate: 0 -50%;
    opacity: 0;
    pointer-events: none;
    transition: opacity 90ms ease, translate 90ms ease;
  }
  .justsnap-page-image-add::before {
    content: attr(data-tooltip);
    right: calc(100% + 11px);
    padding: 8px 10px;
    border-radius: 7px;
    color: #fff;
    background: rgba(17, 17, 17, 0.96);
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.24);
    font-size: 13px;
    font-weight: 650;
    line-height: 1.12;
    white-space: nowrap;
  }
  .justsnap-page-image-add::after {
    content: "";
    right: calc(100% + 4px);
    width: 0;
    height: 0;
    border-top: 7px solid transparent;
    border-bottom: 7px solid transparent;
    border-left: 7px solid rgba(17, 17, 17, 0.96);
  }
  .justsnap-page-image-add:hover,
  .justsnap-page-image-add:focus-visible {
    color: #fff;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.26), rgba(255, 255, 255, 0.08)),
      rgba(14, 165, 233, 0.78);
    box-shadow:
      0 14px 32px rgba(3, 7, 18, 0.3),
      0 0 0 4px rgba(14, 165, 233, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.32);
    outline: none;
    scale: 1.06;
  }
  .justsnap-page-image-add:hover::before,
  .justsnap-page-image-add:hover::after,
  .justsnap-page-image-add:focus-visible::before,
  .justsnap-page-image-add:focus-visible::after {
    opacity: 1;
    translate: -4px -50%;
  }
  .justsnap-page-image-add-saving {
    opacity: 0.72;
    cursor: wait;
  }
  .justsnap-page-image-add-saved {
    color: #fff;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.06)),
      rgba(34, 197, 94, 0.82);
    box-shadow:
      0 12px 28px rgba(3, 7, 18, 0.24),
      0 0 0 4px rgba(34, 197, 94, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.26);
  }
  .justsnap-page-image-add svg {
    width: 18px;
    height: 18px;
  }
  .justsnap-rail-separator-slot {
    position: relative;
    z-index: 10;
    width: 100%;
    height: max(12px, calc(var(--justsnap-dock-base, 52px) * 0.42));
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 7px;
    pointer-events: none;
  }
  .justsnap-rail-separator {
    width: calc(100% - 20px);
    height: 1px;
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0));
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.2);
  }
  .justsnap-control-badge {
    position: absolute;
    top: 7px;
    right: 7px;
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: rgba(239, 68, 68, 0.9);
    box-shadow: 0 0 0 2px rgba(18, 22, 29, 0.78);
  }
  .justsnap-library {
    position: relative;
    z-index: 1;
    flex: 0 0 auto;
    align-self: flex-end;
    width: min(380px, calc(100vw - 16px));
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    justify-content: center;
    align-items: flex-end;
    overflow: visible;
    padding: 0 9px 0 0;
    background: transparent;
    outline: none;
    pointer-events: none;
  }
  .justsnap-dock-slot {
    position: relative;
    width: 52px;
    height: 64px;
    flex: 0 0 auto;
    transition: width 120ms ease-out, height 120ms ease-out;
    overflow: visible;
    pointer-events: none;
  }
  .justsnap-dock-slot::before,
  .justsnap-dock-slot::after {
    content: "";
    position: absolute;
    right: 0;
    z-index: 8;
    width: max(34px, var(--justsnap-rail-surface, 74px));
    height: 3px;
    border-radius: 999px;
    background: #0ea5e9;
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.16), 0 8px 16px rgba(14, 165, 233, 0.24);
    opacity: 0;
    pointer-events: none;
    transition: opacity 100ms ease-out;
  }
  .justsnap-dock-slot::before { top: -2px; }
  .justsnap-dock-slot::after { bottom: -2px; }
  .justsnap-drop-before::before,
  .justsnap-drop-after::after {
    opacity: 1;
  }
  .justsnap-dock-image-button {
    position: absolute;
    top: 50%;
    right: 0;
    z-index: 1;
    width: 52px;
    height: 52px;
    border: 0;
    border-radius: 10px;
    padding: 0;
    overflow: hidden;
    background: rgba(24, 30, 39, 0.56);
    box-shadow: 0 3px 10px rgba(3, 7, 18, 0.14);
    cursor: grab;
    transform-origin: center right;
    translate: 0 calc(-50% + var(--justsnap-preview-offset-y, 0px));
    transition: width 140ms ease-out, height 140ms ease-out, border-color 150ms ease, box-shadow 150ms ease, filter 150ms ease;
    will-change: width, height;
    pointer-events: auto;
  }
  .justsnap-dock-image-new {
    animation: justsnap-capture-added 520ms cubic-bezier(0.18, 0.9, 0.22, 1.18);
  }
  .justsnap-dock-image-added-focus {
    border: 2px solid #0ea5e9;
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.22), 0 10px 24px rgba(15, 32, 48, 0.24);
    z-index: 3;
  }
  @keyframes justsnap-capture-added {
    0% { scale: 0.72; opacity: 0.35; }
    58% { scale: 1.12; opacity: 1; }
    100% { scale: 1; opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .justsnap-dock-image-new { animation: none; }
  }
  .justsnap-dock-image-button:hover,
  .justsnap-dock-image-button:focus-visible {
    border: 1px solid rgba(125, 211, 252, 0.92);
    box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.16), 0 14px 30px rgba(3, 7, 18, 0.26);
    filter: saturate(1.04) brightness(1.02);
    z-index: 2;
  }
  .justsnap-drop-create-folder .justsnap-dock-image-button,
  .justsnap-drop-add-folder .justsnap-dock-folder-button,
  .justsnap-drop-add-folder .justsnap-dock-image-button {
    border: 2px solid #22c55e !important;
    box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.18), 0 12px 28px rgba(15, 32, 48, 0.24) !important;
  }
  .justsnap-drop-create-folder .justsnap-dock-image-button::after,
  .justsnap-drop-add-folder .justsnap-dock-folder-button::after,
  .justsnap-drop-add-folder .justsnap-dock-image-button::after {
    content: "+";
    position: absolute;
    right: 5px;
    bottom: 5px;
    z-index: 3;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    background: #22c55e;
    box-shadow: 0 3px 8px rgba(15, 23, 42, 0.24);
    font-size: 13px;
    font-weight: 900;
    line-height: 1;
  }
  .justsnap-dock-image-button:active { cursor: grabbing; }
  .justsnap-dock-folder-button {
    position: absolute;
    top: 50%;
    right: 0;
    z-index: 1;
    width: 52px;
    height: 52px;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 10px !important;
    padding: 4px !important;
    overflow: hidden;
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.13), rgba(255, 255, 255, 0.035)),
      rgba(25, 31, 40, 0.64) !important;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 4px 12px rgba(3, 7, 18, 0.16);
    cursor: grab;
    transform-origin: center right;
    translate: 0 -50%;
    transition: width 140ms ease-out, height 140ms ease-out, border-color 150ms ease, box-shadow 150ms ease, background 150ms ease;
    will-change: width, height;
    pointer-events: auto;
  }
  .justsnap-dock-folder-button:hover,
  .justsnap-dock-folder-button:focus-visible {
    border-color: rgba(125, 211, 252, 0.9) !important;
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.055)),
      rgba(25, 31, 40, 0.7) !important;
    box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.14), 0 14px 30px rgba(3, 7, 18, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.18);
    z-index: 2;
  }
  .justsnap-dock-add-target-folder {
    border-color: #0ea5e9 !important;
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.22), 0 10px 24px rgba(15, 32, 48, 0.24), inset 0 0 0 1px rgba(148, 163, 184, 0.32) !important;
  }
  .justsnap-dock-folder-button:active { cursor: grabbing; }
  .justsnap-folder-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: 3px;
    width: 100%;
    height: 100%;
  }
  .justsnap-folder-grid img {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    border-radius: 5px;
    object-fit: cover;
    display: block;
    background: rgba(255, 255, 255, 0.08);
  }
  .justsnap-dock-add {
    --justsnap-add-size: clamp(18px, calc(var(--justsnap-dock-base, 52px) * 0.38), 22px);
    --justsnap-add-inset: max(5px, calc(var(--justsnap-dock-base, 52px) * 0.1));
    position: absolute;
    top: calc(50% + var(--justsnap-add-offset-y, 0px) + var(--justsnap-add-item-half, 26px) - var(--justsnap-add-size) - var(--justsnap-add-inset));
    right: var(--justsnap-add-inset);
    z-index: 4;
    width: var(--justsnap-add-size);
    min-width: var(--justsnap-add-size);
    height: var(--justsnap-add-size);
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.035)),
      rgba(16, 21, 29, 0.82);
    box-shadow: 0 6px 16px rgba(3, 7, 18, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.16);
    line-height: 0;
    cursor: pointer;
    backdrop-filter: blur(8px) saturate(140%);
    -webkit-backdrop-filter: blur(8px) saturate(140%);
    transition: background 120ms ease, scale 120ms ease, color 120ms ease;
    pointer-events: auto;
  }
  .justsnap-dock-add:hover,
  .justsnap-dock-add:focus-visible {
    color: #fff;
    background:
      linear-gradient(180deg, rgba(125, 211, 252, 0.3), rgba(14, 165, 233, 0.15)),
      rgba(16, 21, 29, 0.86);
    box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.16), 0 8px 18px rgba(3, 7, 18, 0.3);
    outline: none;
    scale: 1.08;
  }
  .justsnap-dock-add svg {
    display: block;
    flex: 0 0 auto;
    width: 13px;
    height: 13px;
  }
  .justsnap-dock-image-button img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    background: #f7f9fc;
    image-rendering: auto;
  }
  .justsnap-dock-remove {
    position: absolute;
    top: calc(50% + var(--justsnap-preview-offset-y, 0px) - var(--justsnap-dock-item-half, 26px) + 7px);
    right: 7px;
    z-index: 5;
    width: 24px !important;
    min-width: 24px !important;
    height: 24px !important;
    border: 1px solid rgba(20, 32, 48, 0.12) !important;
    border-radius: 999px !important;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #243449;
    background: rgba(255,255,255,0.9) !important;
    box-shadow: 0 6px 14px rgba(15, 32, 48, 0.18);
    cursor: pointer;
    line-height: 0;
    pointer-events: auto;
  }
  .justsnap-dock-remove:hover {
    color: #b42318;
    background: #fff !important;
  }
  .justsnap-dock-remove svg {
    display: block;
    flex: 0 0 auto;
  }
  .justsnap-group-flyout {
    position: absolute;
    top: 50%;
    right: calc(100% + 8px);
    z-index: 4;
    width: min(380px, calc(100vw - 120px));
    max-height: min(420px, calc(100vh - 28px));
    padding: 10px 9px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    justify-content: center;
    align-items: flex-end;
    overflow: visible;
    background: transparent;
    translate: 0 -50%;
    pointer-events: none;
    animation: docksnip-flyout-enter 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .justsnap-group-flyout::before {
    content: "";
    position: absolute;
    inset: 0 0 0 auto;
    z-index: 0;
    width: var(--justsnap-rail-surface, 74px);
    border-radius: 14px 0 0 14px;
    pointer-events: none;
  }
  .justsnap-group-flyout > * {
    position: relative;
    z-index: 1;
  }
  .justsnap-group-flyout-slot { flex: 0 0 auto; }
  .justsnap-card-loading { cursor: wait; opacity: 0.78; }
  .justsnap-capture-layer {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    cursor: crosshair;
    background: rgba(7, 14, 24, 0.24);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
  }
  .justsnap-capture-layer * {
    user-select: none;
    -webkit-user-select: none;
  }
  .justsnap-capture-layer.justsnap-capture-frame-clean {
    background: transparent;
  }
  .justsnap-capture-layer.justsnap-capture-frame-clean .justsnap-selection {
    opacity: 0;
  }
  .justsnap-capture-toolbar {
    position: fixed;
    top: 14px;
    left: 50%;
    translate: -50% 0;
    min-height: 48px;
    padding: 7px 8px 7px 16px;
    border: 1px solid var(--docksnip-glass-border);
    border-radius: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    color: #fff;
    background: var(--docksnip-glass-background);
    box-shadow: var(--docksnip-glass-shadow);
    backdrop-filter: blur(26px) saturate(190%) brightness(1.08);
    -webkit-backdrop-filter: blur(26px) saturate(190%) brightness(1.08);
    z-index: 2147483647;
    animation: docksnip-surface-enter 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .justsnap-capture-toolbar-copy {
    display: grid;
    gap: 1px;
    line-height: 1.15;
    max-width: min(320px, 34vw);
  }
  .justsnap-capture-toolbar-copy strong {
    font-size: 14px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .justsnap-capture-toolbar-copy small {
    color: rgba(255,255,255,0.72);
    font-size: 11.5px;
    font-weight: 500;
  }
  .justsnap-capture-toolbar button {
    min-width: 34px;
    height: 34px;
    padding: 0 10px;
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 9px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: #fff;
    background: rgba(255,255,255,0.08);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    transition: background 140ms ease, color 140ms ease, scale 140ms ease, box-shadow 140ms ease;
  }
  .justsnap-capture-modes {
    padding: 3px;
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 11px;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    background: rgba(6, 10, 18, 0.34);
  }
  .justsnap-capture-toolbar .justsnap-capture-modes button {
    height: 30px;
    border: 0;
    border-radius: 8px;
    color: rgba(255,255,255,0.72);
    background: transparent;
  }
  .justsnap-capture-toolbar .justsnap-capture-modes .justsnap-capture-mode-active {
    color: #fff;
    background:
      linear-gradient(180deg, rgba(56, 189, 248, 0.32), rgba(14, 116, 144, 0.24)),
      rgba(14, 165, 233, 0.16);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.18),
      inset 0 0 0 1px rgba(125, 211, 252, 0.32);
  }
  .justsnap-toolbar-destination {
    width: 34px;
    height: 34px;
    padding: 3px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 9px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: 2px;
    flex: 0 0 auto;
    overflow: hidden;
    background: rgba(10, 14, 21, 0.36);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }
  .justsnap-toolbar-destination img {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    border-radius: 4px;
    display: block;
    object-fit: cover;
  }
  .justsnap-toolbar-destination img:only-child {
    grid-column: 1 / -1;
    grid-row: 1 / -1;
  }
  .justsnap-capture-toolbar .justsnap-capture-done {
    background: rgba(14, 165, 233, 0.28);
    border-color: rgba(125, 211, 252, 0.46);
  }
  .justsnap-capture-toolbar .justsnap-capture-escape {
    padding: 0 9px;
    color: rgba(255,255,255,0.86);
    background: rgba(255,255,255,0.06);
  }
  .justsnap-capture-toolbar .justsnap-capture-close {
    width: 34px;
    padding: 0;
    color: rgba(255, 255, 255, 0.78);
    background: rgba(255, 255, 255, 0.045);
  }
  .justsnap-capture-toolbar .justsnap-capture-close:hover,
  .justsnap-capture-toolbar .justsnap-capture-close:focus-visible {
    color: #fff;
    background: rgba(248, 113, 113, 0.18);
    border-color: rgba(252, 165, 165, 0.34);
  }
  .justsnap-dock-group-slot {
    overflow: visible;
  }
  .justsnap-dock-group-slot .justsnap-dock-folder-button {
    top: calc(var(--justsnap-folder-item-gap, 8px) / 2);
    translate: 0 0;
  }
  .justsnap-dock-group-slot .justsnap-dock-add {
    top: calc(
      var(--justsnap-folder-item-gap, 8px) / 2 +
      var(--justsnap-folder-size, 52px) -
      var(--justsnap-add-size) -
      var(--justsnap-add-inset)
    );
  }
  .justsnap-dock-group-slot .justsnap-dock-remove {
    top: calc(var(--justsnap-folder-item-gap, 8px) / 2 + 7px);
  }
  .justsnap-dock-group-slot > .justsnap-group-flyout {
    top: calc(var(--justsnap-folder-item-gap, 8px) / 2 + var(--justsnap-folder-size, 52px) / 2);
  }
  .justsnap-empty-folder-icon {
    grid-column: 1 / -1;
    grid-row: 1 / -1;
    place-self: center;
    color: rgba(255, 255, 255, 0.72);
  }
  .justsnap-empty-folder-message {
    width: 92px;
    padding: 8px;
    color: rgba(15, 23, 42, 0.62);
    font-size: 10px;
    line-height: 1.25;
    text-align: center;
  }
  .justsnap-dock-navigator {
    position: relative;
    z-index: 10;
    width: calc(100% - 10px);
    min-height: 92px;
    margin: 2px 5px 6px;
    padding: 3px;
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 11px;
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: 27px 30px 27px;
    align-items: center;
    gap: 1px;
    background: rgba(7, 11, 18, 0.22);
    pointer-events: auto;
  }
  .justsnap-dock-navigator button {
    width: 100%;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    color: rgba(255, 255, 255, 0.86);
    background: transparent;
    font: 700 12px/1 Inter, ui-sans-serif, system-ui, sans-serif !important;
    cursor: pointer;
  }
  .justsnap-dock-navigator button:nth-child(2) {
    border-top: 1px solid rgba(255, 255, 255, 0.13);
    border-bottom: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.07);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }
  .justsnap-dock-navigator button:hover:not(:disabled),
  .justsnap-dock-navigator button:focus-visible {
    color: #fff;
    background: rgba(255, 255, 255, 0.17);
    outline: none;
  }
  .justsnap-dock-navigator button:disabled { opacity: 0.28; cursor: default; }
  .justsnap-rail-switching { animation: docksnip-dock-switch 420ms cubic-bezier(0.2, 0.8, 0.2, 1); }
  .justsnap-rail-overview-hidden {
    opacity: 0;
    pointer-events: none;
    translate: 18px -50%;
  }

  .justsnap-dock-overview-backdrop {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    padding: 18px 18px 18px 24px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    background: transparent;
  }
  .justsnap-dock-overview {
    position: relative;
    width: fit-content;
    max-width: calc(100vw - 42px);
    height: min(650px, calc(100vh - 44px));
    padding: 12px;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 26px;
    overflow: visible;
    color: #fff;
    background:
      linear-gradient(145deg, rgba(255,255,255,0.16), rgba(255,255,255,0.035) 50%, rgba(255,255,255,0.08)),
      rgba(18,23,31,0.74);
    box-shadow:
      0 24px 64px rgba(3,7,18,0.34),
      inset 0 1px 0 rgba(255,255,255,0.25),
      inset 0 -1px 0 rgba(255,255,255,0.07);
    backdrop-filter: blur(24px) saturate(155%);
    -webkit-backdrop-filter: blur(24px) saturate(155%);
    animation: docksnip-overview-shelf-enter 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .justsnap-dock-overview-list {
    width: max-content;
    max-width: calc(100vw - 66px);
    height: 100%;
    padding: 3px 4px 7px;
    display: flex;
    align-items: stretch;
    gap: 10px;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.24) transparent;
    scroll-snap-type: x proximity;
  }
  .justsnap-overview-dock {
    position: relative;
    inset: auto;
    flex: 0 0 auto;
    width: var(--justsnap-rail-surface, 74px);
    min-width: var(--justsnap-rail-surface, 74px);
    height: auto;
    max-height: none;
    translate: none;
    scroll-snap-align: end;
    animation: none;
  }
  .justsnap-overview-dock-active {
    border-color: rgba(74,222,128,0.82);
    box-shadow: 0 0 0 2px rgba(34,197,94,0.2), var(--docksnip-glass-shadow);
  }
  .justsnap-overview-dock-new { animation: docksnip-new-dock 700ms ease 2; }
  .justsnap-library-overview {
    width: 100%;
    align-self: stretch;
  }
  .justsnap-library-overview .justsnap-dock-image-button,
  .justsnap-library-overview .justsnap-dock-folder-button {
    cursor: grab;
  }
  .justsnap-overview-dock-name,
  .justsnap-overview-dock-name-input {
    width: calc(100% - 8px);
    min-width: 0;
    height: 34px;
    margin: 0 4px;
    padding: 0 5px;
    border: 1px solid transparent;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    color: #fff;
    background: rgba(7,11,18,0.42);
    font-size: 10px;
    font-weight: 750;
    text-align: center;
    cursor: pointer;
    pointer-events: auto;
  }
  .justsnap-overview-dock-name span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .justsnap-overview-dock-name svg { flex: 0 0 auto; }
  .justsnap-overview-dock-name-input {
    border-color: rgba(125,211,252,0.65);
    outline: none;
    cursor: text;
  }
  .justsnap-overview-dock-actions {
    width: calc(100% - 10px);
    margin: 2px 5px 6px;
    padding: 4px;
    border: 1px solid rgba(255,255,255,0.13);
    border-radius: 11px;
    display: grid;
    grid-template-rows: 34px 34px;
    gap: 2px;
    background: rgba(7,11,18,0.22);
    pointer-events: auto;
  }
  .justsnap-overview-dock-actions button {
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: 7px;
    display: grid;
    place-items: center;
    color: rgba(255,255,255,0.64);
    background: transparent;
    cursor: pointer;
  }
  .justsnap-overview-dock-actions button:hover,
  .justsnap-overview-dock-actions button:focus-visible { color: #fff; background: rgba(255,255,255,0.1); outline: none; }
  .justsnap-overview-dock-actions .justsnap-overview-dock-select-active { color: #22c55e; }
  .justsnap-overview-dock-actions button:last-child { color: rgba(252,165,165,0.88); }
  .justsnap-dock-create-card {
    appearance: none;
    -webkit-appearance: none;
    flex: 0 0 var(--justsnap-rail-surface, 74px);
    width: var(--justsnap-rail-surface, 74px);
    min-width: var(--justsnap-rail-surface, 74px);
    height: 100%;
    border: 1px dashed rgba(255,255,255,0.15);
    border-radius: 16px;
    scroll-snap-align: end;
    border-style: dashed;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 10px;
    padding: 12px;
    color: rgba(255,255,255,0.76);
    background:
      linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.025) 52%, rgba(255,255,255,0.06)),
      rgba(14, 19, 27, 0.72);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.18),
      inset 0 -1px 0 rgba(255,255,255,0.06);
    backdrop-filter: blur(22px) saturate(145%);
    -webkit-backdrop-filter: blur(22px) saturate(145%);
    cursor: pointer;
  }
  .justsnap-dock-create-card span { max-width: 62px; font-size: 12px; font-weight: 750; line-height: 1.2; text-align: center; }
  .justsnap-dock-create-card:hover {
    color: #fff;
    border-color: rgba(125,211,252,0.46);
    background:
      linear-gradient(145deg, rgba(125,211,252,0.16), rgba(255,255,255,0.025) 52%, rgba(255,255,255,0.07)),
      rgba(14, 19, 27, 0.76);
  }
  .justsnap-dock-overview-close {
    position: absolute;
    top: -8px;
    right: -8px;
    z-index: 5;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid rgba(255,255,255,0.22);
    border-radius: 999px;
    display: grid;
    place-items: center;
    color: #fff;
    background: rgba(15,20,28,0.9);
    box-shadow: 0 8px 20px rgba(3,7,18,0.3);
    cursor: pointer;
  }
  .justsnap-dock-delete-confirm {
    position: fixed;
    top: 76px;
    left: 50%;
    z-index: 2147483647;
    width: min(440px, calc(100vw - 28px));
    min-height: 52px;
    padding: 9px 9px 9px 13px;
    border: 1px solid rgba(248,113,113,0.42);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    translate: -50% 0;
    color: #fff;
    background: var(--docksnip-glass-background);
    box-shadow: var(--docksnip-glass-shadow);
    backdrop-filter: blur(26px) saturate(190%) brightness(1.08);
    -webkit-backdrop-filter: blur(26px) saturate(190%) brightness(1.08);
    animation: docksnip-notice-enter 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .justsnap-dock-delete-confirm-icon { flex: 0 0 auto; color: rgba(252,165,165,0.96); }
  .justsnap-dock-delete-confirm > span { flex: 1 1 auto; display: grid; gap: 2px; line-height: 1.25; }
  .justsnap-dock-delete-confirm strong { font-size: 13px; }
  .justsnap-dock-delete-confirm small { color: rgba(255,255,255,0.68); font-size: 11px; }
  .justsnap-dock-delete-confirm > div { display: flex; gap: 7px; }
  .justsnap-dock-delete-confirm button { height: 32px; padding: 0 11px; border: 1px solid rgba(255,255,255,0.2); border-radius: 9px; color: #fff; background: rgba(255,255,255,0.08); font-size: 12px; font-weight: 700; cursor: pointer; }
  .justsnap-dock-delete-confirm button:hover,
  .justsnap-dock-delete-confirm button:focus-visible { background: rgba(255,255,255,0.18); outline: none; }
  .justsnap-dock-delete-confirm .justsnap-danger-button { background: rgba(220,38,38,0.28); border-color: rgba(248,113,113,0.42); }
  @keyframes docksnip-overview-shelf-enter {
    from { opacity: 0; translate: 18px 0; }
    to { opacity: 1; translate: 0 0; }
  }
  @keyframes docksnip-dock-switch { 50% { translate: -5px -50%; } }
  @keyframes docksnip-new-dock { 50% { border-color: rgba(56,189,248,0.9); box-shadow: 0 0 0 4px rgba(14,165,233,0.16); } }
  .justsnap-selection {
    position: fixed;
    border: 2px solid #45a6ff;
    background: rgba(69, 166, 255, 0.12);
    box-shadow: 0 0 0 9999px rgba(7, 14, 24, 0.34);
  }
  @keyframes docksnip-surface-enter {
    from { opacity: 0; scale: 0.97; }
    to { opacity: 1; scale: 1; }
  }
  @keyframes docksnip-notice-enter {
    from { opacity: 0; translate: -50% -4px; }
    to { opacity: 1; translate: -50% 0; }
  }
  @keyframes docksnip-flyout-enter {
    from { opacity: 0; translate: 5px -50%; }
    to { opacity: 1; translate: 0 -50%; }
  }
  @media (prefers-reduced-motion: reduce) {
    .justsnap-rail,
    .justsnap-capture-toolbar,
    .justsnap-toolbar-notice,
    .justsnap-group-flyout {
      animation: none;
    }
  }
`;
