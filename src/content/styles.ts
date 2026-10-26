export const styles = `
  :host, * { box-sizing: border-box; }
  :host {
    --docksnip-font-family: "Host Grotesk";
    --docksnip-font-weight: 400;
    --docksnip-button-font-weight: 600;
    --docksnip-toolbar-bottom-offset: 60px;
    --docksnip-toolbar-width: min(620px, calc(100vw - 28px));
    --docksnip-notice-width: min(520px, calc(100vw - 48px));
    --docksnip-panel-background: #050506;
    --docksnip-toolbar-background: #050506;
    --docksnip-panel-border: rgba(203, 213, 225, 0.14);
    --docksnip-panel-shadow: 0 16px 38px rgba(0, 0, 0, 0.34);
    --docksnip-control-background: #25282e;
    --docksnip-control-hover: #30343b;
    --docksnip-control-border: #41454d;
    --docksnip-active-accent: #fff;
    --docksnip-insertion-fill: #fff;
    --docksnip-insertion-keyline: rgba(5, 5, 6, 0.72);
    --docksnip-insertion-shadow: rgba(5, 5, 6, 0.28);
    --docksnip-success-background: #168642;
    --docksnip-success-hover: #1a9950;
    --docksnip-success-active: #127038;
    --docksnip-success-border: rgba(74, 222, 128, 0.52);
    --docksnip-success-ring: rgba(34, 197, 94, 0.2);
    --docksnip-dock-edge: rgba(203, 213, 225, 0.08);
    --docksnip-dock-edge-glow: rgba(203, 213, 225, 0.057);
  }
  :host, :host * {
    font-family: var(--docksnip-font-family) !important;
    font-weight: var(--docksnip-font-weight) !important;
  }
  button, input { font: inherit; }
  .justsnap-rail {
    position: fixed;
    top: 50%;
    right: 0;
    z-index: 2147483646;
    width: max(56px, var(--justsnap-rail-surface, 74px));
    height: auto;
    max-height: min(90vh, calc(100vh - 24px));
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: center;
    color: rgba(246, 250, 255, 0.92);
    background: transparent;
    border: 0;
    border-radius: 28px 0 0 28px;
    box-shadow: none;
    overflow: visible;
    translate: 0 -50%;
    pointer-events: auto;
    animation: docksnip-surface-enter 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
    transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 140ms ease;
  }
  .justsnap-rail-silhouette {
    position: absolute;
    top: -20px;
    right: 0;
    width: 100%;
    height: calc(100% + 40px);
    z-index: 0;
    overflow: visible;
    pointer-events: none;
  }
  .justsnap-rail-silhouette-fill {
    fill: #050506;
  }
  .justsnap-rail-silhouette-edge {
    fill: none;
    stroke: url(#docksnip-rail-edge-fade);
    stroke-width: 1px;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
    filter:
      drop-shadow(-12px 0 18px rgba(0, 0, 0, 0.24))
      drop-shadow(-1px 0 0 var(--docksnip-dock-edge-glow));
  }
  .justsnap-rail-silhouette-edge-stop {
    stop-color: var(--docksnip-dock-edge);
  }
  .justsnap-rail > :not(.justsnap-rail-silhouette) {
    position: relative;
    z-index: 1;
  }
  .justsnap-rail-expanded {
    max-height: none;
  }
  .justsnap-rail-control-slot {
    --justsnap-rail-control-size: max(24px, calc(var(--justsnap-dock-base, 52px) - 4px));
    position: relative;
    z-index: 10;
    width: 100%;
    height: var(--justsnap-rail-surface, 74px);
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    pointer-events: none;
  }
  .justsnap-rail-control {
    position: relative;
    width: var(--justsnap-rail-control-size);
    min-width: 0;
    height: var(--justsnap-rail-control-size);
    border: 0;
    border-radius: clamp(6px, calc(var(--justsnap-rail-control-size) * 0.3125), 15px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: rgba(245, 250, 255, 0.9);
    background: transparent;
    cursor: pointer;
    box-shadow: none;
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
    background: var(--docksnip-control-hover);
    box-shadow: 0 8px 18px rgba(3, 7, 18, 0.2);
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
  .justsnap-notification-stack {
    position: fixed;
    bottom: calc(var(--docksnip-toolbar-bottom-offset) + 72px + env(safe-area-inset-bottom, 0px));
    right: 0;
    left: 0;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    pointer-events: none;
  }
  .justsnap-notification-stack-item {
    display: flex;
    justify-content: center;
    width: 100%;
    pointer-events: none;
  }
  .justsnap-notification-stack-item > * { pointer-events: auto; }
  .justsnap-toolbar-notice {
    position: relative;
    width: var(--docksnip-notice-width);
    min-height: 46px;
    padding: 5px 6px 5px 8px;
    border: 1px solid color-mix(in srgb, var(--docksnip-notice-accent) 48%, transparent);
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--docksnip-notice-accent) 10%, var(--docksnip-panel-background)) 0%,
      var(--docksnip-panel-background) 38%
    );
    color: #fff;
    box-shadow:
      var(--docksnip-panel-shadow),
      0 0 0 1px color-mix(in srgb, var(--docksnip-notice-accent) 8%, transparent);
    animation: docksnip-notice-enter 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .justsnap-toolbar-notice-error { --docksnip-notice-accent: #ff6961; }
  .justsnap-toolbar-notice-info { --docksnip-notice-accent: var(--docksnip-active-accent); }
  .justsnap-toolbar-notice-icon {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    padding: 5px;
    border: 1px solid color-mix(in srgb, var(--docksnip-notice-accent) 46%, transparent);
    border-radius: 50%;
    color: var(--docksnip-notice-accent);
    background: color-mix(in srgb, var(--docksnip-notice-accent) 11%, transparent);
    box-shadow: 0 0 16px color-mix(in srgb, var(--docksnip-notice-accent) 12%, transparent);
    animation: docksnip-notice-icon-pop 480ms 90ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .justsnap-toolbar-notice-message {
    flex: 1 1 auto;
    margin: 0;
    font-size: 13px;
    line-height: 1.35;
    letter-spacing: 0;
  }
  .justsnap-inline-copy-icon {
    display: inline-block;
    width: 14px;
    height: 14px;
    margin: 0 4px;
    vertical-align: -2px;
  }
  .justsnap-toolbar-notice-action {
    min-width: 44px;
    height: 34px;
    padding: 0 14px;
    border: 1px solid color-mix(in srgb, var(--docksnip-notice-accent) 34%, var(--docksnip-control-border));
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    color: #fff;
    background: color-mix(in srgb, var(--docksnip-notice-accent) 10%, var(--docksnip-control-background));
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
    transition: background 140ms ease, border-color 140ms ease, box-shadow 140ms ease, scale 140ms ease;
  }
  .justsnap-toolbar-notice-action:hover,
  .justsnap-toolbar-notice-action:focus-visible {
    border-color: color-mix(in srgb, var(--docksnip-notice-accent) 66%, transparent);
    background: color-mix(in srgb, var(--docksnip-notice-accent) 19%, var(--docksnip-control-hover));
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--docksnip-notice-accent) 14%, transparent);
    outline: none;
  }
  .justsnap-toolbar-notice-action:active { scale: 0.97; }
  .justsnap-page-image-add {
    position: fixed;
    z-index: 2147483645;
    width: 42px;
    height: 42px;
    border: 1px solid #3f4650;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: rgba(248, 250, 252, 0.96);
    background: #18202b;
    box-shadow:
      0 12px 28px rgba(3, 7, 18, 0.26),
      0 0 0 3px color-mix(in srgb, var(--docksnip-active-accent) 12%, transparent);
    cursor: pointer;
    translate: -50% -50%;
    transition: background 120ms ease, color 120ms ease, scale 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
  }
  .justsnap-page-image-add::before,
  .justsnap-page-image-add::after {
    position: absolute;
    left: 50%;
    opacity: 0;
    pointer-events: none;
    transition: opacity 90ms ease, translate 90ms ease;
  }
  .justsnap-page-image-add::before {
    content: attr(data-tooltip);
    top: calc(100% + 11px);
    translate: -50% -4px;
    padding: 8px 10px;
    border-radius: 7px;
    color: #fff;
    background: rgba(17, 17, 17, 0.96);
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.24);
    font-size: 13px;
    line-height: 1.12;
    white-space: nowrap;
  }
  .justsnap-page-image-add::after {
    content: "";
    top: calc(100% + 4px);
    translate: -50% -4px;
    width: 0;
    height: 0;
    border-right: 7px solid transparent;
    border-bottom: 7px solid rgba(17, 17, 17, 0.96);
    border-left: 7px solid transparent;
  }
  .justsnap-page-image-add:hover,
  .justsnap-page-image-add:focus-visible {
    color: var(--docksnip-panel-background);
    border-color: rgba(5, 5, 6, 0.16);
    background: var(--docksnip-active-accent);
    box-shadow:
      0 14px 32px rgba(3, 7, 18, 0.3),
      0 0 0 4px rgba(5, 5, 6, 0.14),
      0 0 22px 8px rgba(5, 5, 6, 0.1);
    outline: none;
    scale: 1.06;
  }
  .justsnap-page-image-add:hover::before,
  .justsnap-page-image-add:hover::after,
  .justsnap-page-image-add:focus-visible::before,
  .justsnap-page-image-add:focus-visible::after {
    opacity: 1;
    translate: -50% 0;
  }
  .justsnap-page-image-add-saving {
    opacity: 0.72;
    cursor: wait;
  }
  .justsnap-page-image-add-saved {
    color: #fff;
    background: var(--docksnip-success-background);
    box-shadow:
      0 12px 28px rgba(3, 7, 18, 0.24),
      0 0 0 4px var(--docksnip-success-ring);
  }
  .justsnap-page-image-add svg {
    width: 18px;
    height: 18px;
  }
  .justsnap-rail-separator-slot {
    position: relative;
    z-index: 10;
    width: 100%;
    height: max(10px, calc(var(--justsnap-dock-base, 52px) * 0.3));
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
    background: #34373d;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.2);
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
  .justsnap-dynamic-island-shape {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
    opacity: 0;
    overflow: visible;
    pointer-events: none;
    transition: opacity 70ms ease-out;
  }
  .justsnap-dynamic-island-shape[data-visible="true"] {
    opacity: 1;
  }
  .justsnap-dynamic-island-contour {
    fill: #050506;
    will-change: d;
  }
  .justsnap-dynamic-island-edge {
    fill: none;
    stroke: var(--docksnip-dock-edge);
    stroke-width: 1px;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
    filter:
      drop-shadow(-12px 0 26px rgba(0, 0, 0, 0.2))
      drop-shadow(-1px 0 0 var(--docksnip-dock-edge-glow));
    will-change: d;
  }
  .justsnap-dock-slot {
    --justsnap-action-size: clamp(10px, calc(var(--justsnap-dock-base, 52px) * 0.42), 22px);
    --justsnap-action-inset: clamp(2px, calc(var(--justsnap-dock-base, 52px) * 0.115), 6px);
    --justsnap-action-icon-size: clamp(7px, calc(var(--justsnap-action-size) * 0.58), 13px);
    position: relative;
    width: 52px;
    height: 64px;
    flex: 0 0 auto;
    transition:
      width 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
      height 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
      opacity 160ms ease,
      filter 160ms ease;
    overflow: visible;
    will-change: width, height;
    pointer-events: none;
  }
  .justsnap-dock-slot-add-muted {
    opacity: 0.28;
    filter: grayscale(0.72) saturate(0.42);
    z-index: 0 !important;
  }
  .justsnap-dock-slot-add-muted > .justsnap-dock-image-button,
  .justsnap-dock-slot-add-muted > .justsnap-dock-folder-button,
  .justsnap-dock-slot-add-muted > .justsnap-dock-add,
  .justsnap-dock-slot-add-muted > .justsnap-dock-copy,
  .justsnap-dock-slot-add-muted > .justsnap-dock-remove,
  .justsnap-dock-slot-add-muted > .justsnap-group-flyout {
    pointer-events: none !important;
  }
  .justsnap-dock-slot-add-muted > .justsnap-group-flyout {
    opacity: 0 !important;
    visibility: hidden;
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
    background: var(--docksnip-insertion-fill);
    box-shadow:
      0 0 0 1px var(--docksnip-insertion-keyline),
      0 3px 8px var(--docksnip-insertion-shadow);
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
    background: #181e27;
    box-shadow: 0 3px 10px rgba(3, 7, 18, 0.14);
    cursor: grab;
    transform-origin: center right;
    translate: 0 calc(-50% + var(--justsnap-preview-offset-y, 0px));
    transition:
      width 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
      height 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
      translate 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
      border-color 150ms ease,
      box-shadow 180ms ease,
      filter 150ms ease;
    will-change: width, height;
    pointer-events: auto;
  }
  .justsnap-dock-image-new {
    animation: justsnap-capture-added 520ms cubic-bezier(0.18, 0.9, 0.22, 1.18);
  }
  .justsnap-dock-image-added-focus {
    border: 0;
    box-shadow:
      0 0 0 2px var(--docksnip-active-accent),
      0 0 0 5px color-mix(in srgb, var(--docksnip-active-accent) 22%, transparent),
      0 10px 24px rgba(15, 32, 48, 0.24);
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
  .justsnap-dock-image-button:focus-visible,
  .justsnap-dock-slot:hover > .justsnap-dock-image-button,
  .justsnap-dock-slot:focus-within > .justsnap-dock-image-button,
  .justsnap-dock-slot-hovered > .justsnap-dock-image-button {
    border: 0;
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--docksnip-active-accent) 92%, transparent),
      0 14px 30px rgba(3, 7, 18, 0.26);
    filter: saturate(1.04) brightness(1.02);
    z-index: 2;
  }
  .justsnap-drop-create-folder > .justsnap-dock-image-button,
  .justsnap-drop-add-folder > .justsnap-dock-folder-button,
  .justsnap-drop-add-folder > .justsnap-dock-image-button {
    border: 2px solid #22c55e !important;
    box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.18), 0 12px 28px rgba(15, 32, 48, 0.24) !important;
  }
  .justsnap-drop-create-folder > .justsnap-dock-image-button::after,
  .justsnap-drop-add-folder > .justsnap-dock-folder-button::after,
  .justsnap-drop-add-folder > .justsnap-dock-image-button::after {
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
    border: 1px solid transparent !important;
    border-radius: 8px !important;
    padding: 4px !important;
    overflow: hidden;
    background: var(--docksnip-folder-surface, #1a2029) !important;
    box-shadow:
      inset 0 0 10px rgba(255, 255, 255, 0.045),
      0 5px 14px rgba(3, 7, 18, 0.24);
    cursor: grab;
    transform-origin: center right;
    translate: 0 -50%;
    transition:
      width 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
      height 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
      translate 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
      border-color 150ms ease,
      box-shadow 180ms ease,
      background 150ms ease;
    will-change: width, height;
    pointer-events: auto;
  }
  .justsnap-dock-folder-button:hover,
  .justsnap-dock-folder-button:focus-visible,
  .justsnap-dock-slot:hover > .justsnap-dock-folder-button,
  .justsnap-dock-slot:focus-within > .justsnap-dock-folder-button,
  .justsnap-dock-slot-hovered > .justsnap-dock-folder-button {
    border-color: transparent !important;
    background: var(--docksnip-folder-surface, #1a2029) !important;
    box-shadow: 0 0 0 2px var(--docksnip-folder-border, rgba(255, 255, 255, 0.9)), 0 14px 30px rgba(3, 7, 18, 0.28);
    z-index: 2;
  }
  .justsnap-dock-add-target-folder {
    border-color: var(--docksnip-active-accent) !important;
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--docksnip-active-accent) 22%, transparent),
      0 10px 24px rgba(15, 32, 48, 0.24) !important;
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
    background: #252a32;
  }
  .justsnap-dock-add {
    --justsnap-add-size: clamp(10px, calc(var(--justsnap-dock-base, 52px) * 0.385), 20px);
    --justsnap-add-inset: var(--justsnap-action-inset);
    --justsnap-add-icon-size: clamp(7px, calc(var(--justsnap-add-size) * 0.58), 12px);
    position: absolute;
    top: calc(50% + var(--justsnap-add-offset-y, 0px) + var(--justsnap-add-item-half, 26px) - var(--justsnap-add-size) - var(--justsnap-add-inset));
    right: var(--justsnap-add-inset);
    z-index: 4;
    width: var(--justsnap-add-size);
    min-width: var(--justsnap-add-size);
    height: var(--justsnap-add-size);
    padding: 0;
    border: 1px solid rgba(20, 32, 48, 0.12);
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #243449;
    background: #f5f7fa;
    box-shadow: 0 6px 14px rgba(15, 32, 48, 0.18);
    line-height: 0;
    cursor: pointer;
    transition:
      top 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
      right 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
      background 140ms ease,
      border-color 140ms ease,
      box-shadow 140ms ease,
      scale 140ms ease,
      color 140ms ease;
    pointer-events: auto;
  }
  .justsnap-dock-add:hover:not(:disabled),
  .justsnap-dock-add:focus-visible:not(:disabled) {
    color: #fff;
    border-color: var(--docksnip-success-border);
    background: var(--docksnip-success-background);
    box-shadow: 0 0 0 2px var(--docksnip-success-ring), 0 8px 18px rgba(3, 7, 18, 0.3);
    outline: none;
    scale: 1.08;
  }
  .justsnap-dock-add:active {
    background: var(--docksnip-success-active);
  }
  .justsnap-dock-add:disabled {
    cursor: default;
    pointer-events: none;
  }
  .justsnap-dock-add svg {
    display: block;
    flex: 0 0 auto;
    width: var(--justsnap-add-icon-size);
    height: var(--justsnap-add-icon-size);
  }
  .justsnap-dock-image-button img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    background: #f7f9fc;
    image-rendering: auto;
  }
  .justsnap-dock-remove,
  .justsnap-dock-copy {
    position: absolute;
    top: calc(50% + var(--justsnap-preview-offset-y, 0px) - var(--justsnap-dock-item-half, 26px) + var(--justsnap-action-inset));
    z-index: 5;
    width: var(--justsnap-action-size) !important;
    min-width: var(--justsnap-action-size) !important;
    height: var(--justsnap-action-size) !important;
    border: 1px solid rgba(20, 32, 48, 0.12) !important;
    border-radius: 999px !important;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #243449;
    background: #f5f7fa !important;
    box-shadow: 0 6px 14px rgba(15, 32, 48, 0.18);
    cursor: pointer;
    line-height: 0;
    transition: color 140ms ease, background 140ms ease, border-color 140ms ease, box-shadow 140ms ease, scale 140ms ease;
    pointer-events: auto;
  }
  .justsnap-dock-remove { right: var(--justsnap-action-inset); }
  .justsnap-dock-copy { left: var(--justsnap-action-inset); }
  .justsnap-dock-remove:hover,
  .justsnap-dock-remove:focus-visible {
    color: #fff;
    border-color: rgba(254, 202, 202, 0.72) !important;
    background: #c83b3f !important;
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2), 0 8px 18px rgba(15, 32, 48, 0.24);
    outline: none;
    scale: 1.08;
  }
  .justsnap-dock-copy:hover,
  .justsnap-dock-copy:focus-visible {
    color: #fff;
    border-color: rgba(191, 219, 254, 0.72) !important;
    background: #2563eb !important;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2), 0 8px 18px rgba(15, 32, 48, 0.24);
    outline: none;
    scale: 1.08;
  }
  .justsnap-dock-remove:active { background: #a92f33 !important; }
  .justsnap-dock-copy:active { background: #1d4ed8 !important; }
  .justsnap-dock-remove svg,
  .justsnap-dock-copy svg {
    display: block;
    flex: 0 0 auto;
    width: var(--justsnap-action-icon-size);
    height: var(--justsnap-action-icon-size);
  }
  .justsnap-group-flyout {
    position: absolute;
    top: 50%;
    right: calc(100% + 12px);
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
    pointer-events: none !important;
    animation: docksnip-flyout-enter 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .justsnap-group-flyout.justsnap-group-flyout-dragging {
    pointer-events: auto !important;
    animation: none;
  }
  .justsnap-folder-preview-provisional > .justsnap-dock-image-button {
    isolation: isolate;
  }
  .justsnap-folder-preview-provisional > .justsnap-dock-image-button img {
    opacity: 0.72;
    filter: saturate(0.86);
  }
  .justsnap-folder-preview-provisional > .justsnap-dock-image-button::before {
    content: "";
    position: absolute;
    inset: 2px;
    z-index: 4;
    border-radius: 6px;
    background:
      repeating-linear-gradient(90deg, #fff 0 11px, transparent 11px 18px) left top / 100% 2px no-repeat,
      repeating-linear-gradient(90deg, #fff 0 11px, transparent 11px 18px) left bottom / 100% 2px no-repeat,
      repeating-linear-gradient(180deg, #fff 0 11px, transparent 11px 18px) left top / 2px 100% no-repeat,
      repeating-linear-gradient(180deg, #fff 0 11px, transparent 11px 18px) right top / 2px 100% no-repeat;
    filter: drop-shadow(0 0 1px rgba(5, 5, 6, 0.86));
    pointer-events: none;
  }
  .justsnap-group-flyout-slot {
    flex: 0 0 auto;
    pointer-events: none !important;
  }
  .justsnap-group-flyout-slot > .justsnap-dock-image-button,
  .justsnap-group-flyout-slot > .justsnap-dock-folder-button,
  .justsnap-group-flyout-slot > .justsnap-dock-remove {
    pointer-events: auto;
  }
  .justsnap-card-loading { cursor: wait; opacity: 0.78; }
  .justsnap-capture-layer {
    position: fixed;
    inset: 0;
    z-index: 2147483646;
    cursor: crosshair;
    background: rgba(7, 14, 24, 0.24);
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
  .justsnap-capture-toolbar.justsnap-capture-frame-clean-surface {
    visibility: hidden !important;
    animation: none !important;
    transition: none !important;
  }
  .justsnap-rail.justsnap-capture-frame-clean-surface {
    visibility: hidden !important;
    animation: none !important;
    transition: none !important;
  }
  .justsnap-capture-toolbar {
    position: fixed;
    bottom: calc(var(--docksnip-toolbar-bottom-offset) + env(safe-area-inset-bottom, 0px));
    left: 50%;
    translate: -50% 0;
    width: fit-content;
    min-width: var(--docksnip-toolbar-width);
    max-width: calc(100vw - 28px);
    min-height: 56px;
    padding: 8px;
    border: 1px solid var(--docksnip-panel-border);
    border-radius: 999px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: #fff;
    background: var(--docksnip-toolbar-background);
    box-shadow: var(--docksnip-panel-shadow);
    z-index: 2147483647;
    animation: docksnip-surface-enter 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
    transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 140ms ease;
  }
  .justsnap-capture-toolbar .justsnap-settings-button {
    display: none !important;
  }
  .justsnap-toolbar-logomark {
    display: block;
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    border-radius: 50%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }
  .justsnap-snip-surface-retreated {
    pointer-events: none !important;
  }
  .justsnap-snip-dock-retreated {
    transform: translateX(calc(100% + 16px));
    opacity: 0;
  }
  .justsnap-snip-toolbar-retreated {
    transform: translateY(calc(100% + 16px));
    opacity: 0;
  }
  .justsnap-capture-toolbar-copy {
    min-width: 0;
    flex: 1 1 auto;
    display: grid;
    gap: 1px;
    line-height: 1.15;
    max-width: none;
  }
  .justsnap-capture-toolbar-copy strong {
    font-size: 14.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .justsnap-capture-toolbar-copy small {
    color: rgba(255,255,255,0.58);
    font-size: 11.5px;
  }
  .justsnap-capture-toolbar button {
    flex: 0 0 auto;
    min-width: 34px;
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--docksnip-control-border);
    border-radius: 11px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: #fff;
    background: var(--docksnip-control-background);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    line-height: 1;
    white-space: nowrap;
    transition: background 140ms ease, color 140ms ease, scale 140ms ease, box-shadow 140ms ease;
  }
  .justsnap-capture-modes {
    flex: 0 0 auto;
    padding: 3px;
    border: 1px solid #30343a;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    background: #090a0c;
  }
  .justsnap-capture-toolbar .justsnap-capture-modes button {
    height: 30px;
    border: 0;
    border-radius: 999px;
    font-weight: var(--docksnip-button-font-weight) !important;
    color: rgba(255,255,255,0.72);
    background: transparent;
  }
  .justsnap-capture-toolbar .justsnap-capture-modes button:not(.justsnap-capture-mode-active):hover,
  .justsnap-capture-toolbar .justsnap-capture-modes button:not(.justsnap-capture-mode-active):focus-visible {
    color: #fff;
    background: var(--docksnip-control-hover);
    box-shadow: 0 8px 18px rgba(3, 7, 18, 0.2);
    outline: none;
  }
  .justsnap-capture-toolbar .justsnap-capture-modes .justsnap-capture-mode-active {
    color: var(--docksnip-panel-background);
    background: var(--docksnip-active-accent);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--docksnip-active-accent) 38%, transparent),
      0 0 14px color-mix(in srgb, var(--docksnip-active-accent) 12%, transparent);
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
    background: #151920;
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
    border-radius: 999px;
    background: var(--docksnip-success-background);
    border-color: var(--docksnip-success-border);
    box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.08);
  }
  .justsnap-capture-toolbar .justsnap-capture-done .justsnap-toolbar-destination {
    width: 24px;
    height: 24px;
    padding: 2px;
    border-radius: 7px;
    margin-left: -5px;
    background: rgba(0, 0, 0, 0.18);
  }
  .justsnap-capture-toolbar .justsnap-capture-done .justsnap-toolbar-destination img {
    border-radius: 3px;
  }
  .justsnap-shortcut-key {
    width: 20px;
    height: 20px;
    border: 1px solid rgba(255,255,255,0.46);
    border-radius: 5px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    background: rgba(0,0,0,0.14);
    box-shadow: 0 1px 0 rgba(255,255,255,0.18) inset, 0 1px 0 rgba(0,0,0,0.22);
    font: inherit;
  }
  .justsnap-capture-toolbar .justsnap-capture-done:hover,
  .justsnap-capture-toolbar .justsnap-capture-done:focus-visible {
    background: var(--docksnip-success-hover);
    border-color: rgba(134, 239, 172, 0.7);
    box-shadow: 0 0 0 3px var(--docksnip-success-ring);
    outline: none;
  }
  .justsnap-capture-toolbar .justsnap-capture-done:active {
    background: var(--docksnip-success-active);
    scale: 0.98;
  }
  .justsnap-toolbar-actions {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding-left: 8px;
    padding-right: 0;
    margin-right: 0;
    border-left: 1px solid rgba(255,255,255,0.1);
  }
  .justsnap-capture-toolbar .justsnap-toolbar-icon-button {
    width: 36px;
    height: 36px;
    padding: 0;
    color: rgba(255, 255, 255, 0.68);
    background: var(--docksnip-control-background);
  }
  .justsnap-capture-toolbar .justsnap-toolbar-icon-button:hover,
  .justsnap-capture-toolbar .justsnap-toolbar-icon-button:focus-visible {
    color: #fff;
    background: var(--docksnip-control-hover);
    outline: none;
  }
  .justsnap-capture-toolbar .justsnap-capture-close {
    width: 36px;
    min-width: 36px;
    border-radius: 50%;
    padding: 0;
    color: rgba(245, 250, 255, 0.9);
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }
  .justsnap-capture-toolbar .justsnap-capture-close:hover,
  .justsnap-capture-toolbar .justsnap-capture-close:focus-visible {
    color: rgba(254, 202, 202, 0.98);
    border-color: transparent;
    background: #4a2023;
    box-shadow: 0 8px 18px rgba(3, 7, 18, 0.2);
    outline: none;
    scale: 1.06;
  }
  .justsnap-capture-toolbar .justsnap-capture-close:active { background: #4a2023; }
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
    top: calc(var(--justsnap-folder-item-gap, 8px) / 2 + var(--justsnap-action-inset));
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
  .justsnap-rail-bottom-control-slot {
    margin: 0;
  }
  .justsnap-clear-dock-control:hover:not(:disabled),
  .justsnap-clear-dock-control:focus-visible {
    color: rgba(254, 202, 202, 0.98);
    background: #4a2023;
  }
  .justsnap-dock-delete-confirm {
    position: relative;
    width: min(560px, calc(100vw - 32px));
    min-height: 52px;
    padding: 9px 9px 9px 13px;
    border: 1px solid rgba(248,113,113,0.42);
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: #fff;
    background: var(--docksnip-panel-background);
    box-shadow: var(--docksnip-panel-shadow);
    animation: docksnip-notice-enter 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .justsnap-dock-delete-confirm-icon { flex: 0 0 auto; color: rgba(252,165,165,0.96); }
  .justsnap-dock-delete-confirm > span { flex: 1 1 auto; display: grid; gap: 2px; line-height: 1.25; }
  .justsnap-dock-delete-confirm strong { font-size: 13px; }
  .justsnap-dock-delete-confirm small { color: rgba(255,255,255,0.68); font-size: 11px; }
  .justsnap-dock-delete-confirm > div { display: flex; flex: 0 0 auto; gap: 7px; }
  .justsnap-dock-delete-confirm button { height: 34px; padding: 0 12px; border: 1px solid var(--docksnip-control-border); border-radius: 999px; color: #fff; background: var(--docksnip-control-background); font-size: 12px; white-space: nowrap; cursor: pointer; }
  .justsnap-dock-delete-confirm button:hover,
  .justsnap-dock-delete-confirm button:focus-visible { background: var(--docksnip-control-hover); outline: none; }
  .justsnap-dock-delete-confirm .justsnap-danger-button { background: #512326; border-color: rgba(248,113,113,0.42); }
  .justsnap-selection {
    position: fixed;
    border: 2px solid var(--docksnip-active-accent);
    background: color-mix(in srgb, var(--docksnip-active-accent) 12%, transparent);
    box-shadow: 0 0 0 9999px rgba(7, 14, 24, 0.34);
  }
  @keyframes docksnip-surface-enter {
    from { opacity: 0; scale: 0.97; }
    to { opacity: 1; scale: 1; }
  }
  @keyframes docksnip-notice-enter {
    0% { opacity: 0; translate: 0 10px; scale: 0.97; }
    62% {
      opacity: 1;
      translate: 0 2px;
      scale: 1.008;
      box-shadow: var(--docksnip-panel-shadow), 0 0 0 4px color-mix(in srgb, var(--docksnip-notice-accent) 13%, transparent);
    }
    100% { opacity: 1; translate: 0 0; scale: 1; }
  }
  @keyframes docksnip-notice-icon-pop {
    0% { opacity: 0; scale: 0.72; rotate: -10deg; }
    68% { opacity: 1; scale: 1.1; rotate: 2deg; }
    100% { opacity: 1; scale: 1; rotate: 0deg; }
  }
  @keyframes docksnip-flyout-enter {
    from { opacity: 0; translate: 5px -50%; }
    to { opacity: 1; translate: 0 -50%; }
  }
  @media (max-width: 680px) {
    :host {
      --docksnip-toolbar-width: calc(100vw - 16px);
      --docksnip-notice-width: min(520px, calc(100vw - 48px));
    }
    .justsnap-capture-toolbar {
      width: calc(100vw - 16px);
      max-width: calc(100vw - 16px);
      min-height: 52px;
      padding: 7px 8px;
      gap: 7px;
      border-radius: 999px;
    }
    .justsnap-capture-toolbar-copy {
      max-width: none;
    }
    .justsnap-capture-toolbar-copy small {
      display: none;
    }
    .justsnap-capture-toolbar .justsnap-capture-modes button {
      padding: 0 8px;
    }
    .justsnap-toolbar-actions {
      gap: 2px;
      padding-left: 5px;
    }
    .justsnap-capture-toolbar .justsnap-toolbar-icon-button {
      width: 32px;
      height: 32px;
    }
    .justsnap-toolbar-notice { padding: 5px 6px; }
    .justsnap-dock-delete-confirm {
      padding-left: 10px;
      border-radius: 999px;
    }
  }
  @media (max-width: 500px) {
    .justsnap-capture-toolbar-copy strong {
      max-width: 112px;
    }
    .justsnap-capture-toolbar .justsnap-capture-modes button {
      min-width: 30px;
      padding: 0 6px;
      font-size: 11px;
    }
    .justsnap-capture-toolbar .justsnap-capture-done {
      padding: 0 8px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .justsnap-rail,
    .justsnap-capture-toolbar,
    .justsnap-toolbar-notice,
    .justsnap-toolbar-notice-icon,
    .justsnap-toolbar-notice-action,
    .justsnap-group-flyout,
    .justsnap-dock-delete-confirm,
    .justsnap-dynamic-island-shape {
      animation: none;
      transition: none;
    }
  }
`;
