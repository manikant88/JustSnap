export const styles = `
  :host, * { box-sizing: border-box; }
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
    background:
      radial-gradient(circle at 32% 4%, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.07) 28%, rgba(255, 255, 255, 0) 54%),
      linear-gradient(105deg, rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.035) 38%, rgba(255, 255, 255, 0.095) 72%, rgba(255, 255, 255, 0.045)),
      linear-gradient(180deg, rgba(31, 37, 46, 0.58), rgba(17, 21, 29, 0.5));
    border: 1px solid rgba(255, 255, 255, 0.24);
    border-radius: 16px;
    box-shadow:
      inset 0 1px 1px rgba(255, 255, 255, 0.34),
      inset 0 -1px 1px rgba(255, 255, 255, 0.12),
      inset 1px 0 0 rgba(255, 255, 255, 0.12),
      inset -1px 0 0 rgba(0, 0, 0, 0.16),
      0 22px 52px rgba(3, 7, 18, 0.3),
      0 2px 8px rgba(255, 255, 255, 0.08);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    overflow: visible;
    translate: 0 -50%;
    backdrop-filter: blur(26px) saturate(190%) brightness(1.08);
    -webkit-backdrop-filter: blur(26px) saturate(190%) brightness(1.08);
    pointer-events: none;
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
    background: rgba(255, 255, 255, 0.025);
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
  .justsnap-empty {
    margin: 18px auto;
    width: 52px;
    height: 52px;
    border: 1px dashed #c8d3e0;
    border-radius: 10px;
    display: grid;
    place-items: center;
    color: #66768a;
    background: rgba(255,255,255,0.74);
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
  .justsnap-activity {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0 12px 18px;
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
    border-radius: 8px;
    padding: 0;
    overflow: hidden;
    background: #e8eef5;
    cursor: grab;
    transform-origin: center right;
    translate: 0 calc(-50% + var(--justsnap-preview-offset-y, 0px));
    transition: width 120ms ease-out, height 120ms ease-out, border-color 150ms ease, box-shadow 150ms ease;
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
    border: 2px solid #0ea5e9;
    box-shadow: 0 10px 24px rgba(15, 32, 48, 0.24);
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
    border: 2px solid transparent !important;
    border-radius: 8px !important;
    padding: 4px !important;
    overflow: hidden;
    background: linear-gradient(135deg, rgba(255,255,255,0.86), rgba(226,232,240,0.88)) !important;
    box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.32);
    cursor: grab;
    transform-origin: center right;
    translate: 0 -50%;
    transition: width 120ms ease-out, height 120ms ease-out, border-color 150ms ease, box-shadow 150ms ease;
    will-change: width, height;
    pointer-events: auto;
  }
  .justsnap-dock-folder-button:hover,
  .justsnap-dock-folder-button:focus-visible {
    border-color: #0ea5e9 !important;
    box-shadow: 0 10px 24px rgba(15, 32, 48, 0.24), inset 0 0 0 1px rgba(148, 163, 184, 0.32);
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
    background: #fff;
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
    border: 1px solid rgba(255, 255, 255, 0.34);
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    background: rgba(15, 23, 42, 0.82);
    box-shadow: 0 5px 14px rgba(15, 23, 42, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.2);
    line-height: 0;
    cursor: pointer;
    backdrop-filter: blur(8px) saturate(140%);
    -webkit-backdrop-filter: blur(8px) saturate(140%);
    transition: background 120ms ease, scale 120ms ease, color 120ms ease;
    pointer-events: auto;
  }
  .justsnap-dock-add:hover,
  .justsnap-dock-add:focus-visible {
    color: #0f172a;
    background: rgba(255,255,255,0.95);
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
  .justsnap-activity { display: grid; gap: 8px; align-content: start; }
  .justsnap-activity article {
    padding: 10px;
    border: 1px solid #dde6f0;
    border-radius: 8px;
    display: grid;
    gap: 3px;
    background: #fff;
  }
  .justsnap-activity article strong { font-size: 12px; }
  .justsnap-activity article span, .justsnap-activity article small { font-size: 11px; }
  .justsnap-capture-layer {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    cursor: crosshair;
    background: rgba(7, 14, 24, 0.24);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .justsnap-capture-toolbar {
    position: fixed;
    top: 14px;
    left: 50%;
    translate: -50% 0;
    min-height: 48px;
    padding: 7px 8px 7px 16px;
    border: 1px solid rgba(255,255,255,0.22);
    border-radius: 10px;
    display: flex;
    align-items: center;
    gap: 12px;
    color: #fff;
    background: rgba(15, 23, 42, 0.9);
    box-shadow: 0 14px 30px rgba(0,0,0,0.24);
    z-index: 2147483647;
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
  }
  .justsnap-capture-modes {
    padding: 3px;
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 11px;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    background: rgba(2, 6, 23, 0.34);
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
    background: rgba(14, 165, 233, 0.34);
    box-shadow: inset 0 0 0 1px rgba(125, 211, 252, 0.32);
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
  .justsnap-selection {
    position: fixed;
    border: 2px solid #45a6ff;
    background: rgba(69, 166, 255, 0.12);
    box-shadow: 0 0 0 9999px rgba(7, 14, 24, 0.34);
  }
`;
