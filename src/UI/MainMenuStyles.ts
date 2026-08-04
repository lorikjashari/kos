export const MAIN_MENU_CSS = `
      @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');

      #kos-menu {
        --kos-blue: #1a5fff;
        --kos-blue-deep: #0a45d6;
        --kos-blue-soft: #eaf1ff;
        --kos-gold: #c9a227;
        --kos-gold-bright: #e0b93a;
        --kos-gold-soft: #fff8e6;
        --kos-ink: #0a1220;
        --kos-muted: #5a6a80;
        --kos-line: rgba(10, 30, 80, 0.10);
        --kos-white: #ffffff;
        --kos-bg: #f5f7fb;
        --kos-ease: cubic-bezier(0.16, 1, 0.3, 1);

        position: fixed; inset: 0; z-index: 40;
        font-family: "Outfit", "Segoe UI", system-ui, sans-serif;
        color: var(--kos-ink);
        display: block;
        transition: opacity 320ms var(--kos-ease), visibility 320ms var(--kos-ease);
        -webkit-font-smoothing: antialiased;
      }
      #kos-menu.is-hidden {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        display: none !important;
      }
      #kos-menu *, #kos-menu *::before, #kos-menu *::after { box-sizing: border-box; }

      .kos-bg {
        position: absolute; inset: 0;
        background: var(--kos-bg);
        overflow: hidden;
        pointer-events: none;
        user-select: none;
        -webkit-user-select: none;
      }
      .kos-bg-art {
        position: absolute; inset: 0;
        width: 100%; height: 100%;
        object-fit: cover;
        object-position: center right;
        display: block;
        pointer-events: none;
        user-select: none;
        -webkit-user-select: none;
        -webkit-user-drag: none;
        -webkit-touch-callout: none;
        transform: scale(1.02);
        filter: blur(0);
        transition: filter 320ms var(--kos-ease), transform 320ms var(--kos-ease);
      }
      #kos-menu.is-bg-blur .kos-bg-art {
        filter: blur(14px);
        transform: scale(1.08);
      }
      #kos-menu.is-bg-blur .kos-bg-veil {
        background:
          linear-gradient(105deg, rgba(245,247,251,0.92) 0%, rgba(245,247,251,0.72) 40%, rgba(245,247,251,0.45) 70%, rgba(245,247,251,0.35) 100%),
          linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 30%, transparent 70%, rgba(245,247,251,0.45) 100%);
      }
      .kos-bg-veil {
        position: absolute; inset: 0;
        pointer-events: none;
        background:
          linear-gradient(105deg, rgba(245,247,251,0.94) 0%, rgba(245,247,251,0.78) 28%, rgba(245,247,251,0.22) 52%, transparent 68%),
          linear-gradient(180deg, rgba(255,255,255,0.22) 0%, transparent 32%, transparent 70%, rgba(245,247,251,0.4) 100%);
      }
      .kos-bg-vignette {
        position: absolute; inset: 0; pointer-events: none;
        background: radial-gradient(ellipse 85% 75% at 72% 48%, transparent 40%, rgba(10, 30, 80, 0.08) 100%);
      }

      .kos-screen {
        position: absolute; inset: 0; z-index: 1;
        display: none;
        animation: kos-fade-in 400ms var(--kos-ease) both;
      }
      .kos-screen.is-active { display: flex; }
      .kos-screen[data-screen="loading"].is-active {
        align-items: center;
        justify-content: center;
      }
      .kos-screen[data-screen="main"].is-active {
        align-items: stretch;
      }
      @keyframes kos-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .kos-load {
        position: relative;
        margin: auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: min(440px, 92vw);
        padding: clamp(20px, 4vh, 36px) 20px;
        gap: 0;
        text-align: center;
      }
      .kos-load-mark {
        position: absolute;
        width: min(340px, 78vw);
        height: min(340px, 78vw);
        border-radius: 50%;
        background: radial-gradient(circle, rgba(26,95,255,0.14) 0%, rgba(224,185,58,0.08) 42%, transparent 70%);
        animation: kos-load-pulse 2.4s ease-in-out infinite;
        pointer-events: none;
        z-index: 0;
      }
      .kos-logo-load {
        position: relative;
        z-index: 1;
        width: min(280px, 62vw, 38vh);
        max-height: min(160px, 28vh);
        height: auto;
        display: block;
        object-fit: contain;
        mix-blend-mode: screen;
        filter: drop-shadow(0 18px 44px rgba(26, 95, 255, 0.22));
        animation: kos-logo-in 0.85s var(--kos-ease) both;
      }
      .kos-load-wrap {
        position: relative;
        z-index: 1;
        width: min(280px, 78vw);
        margin-top: 22px;
        flex-shrink: 0;
        animation: kos-slide-up 560ms var(--kos-ease) 120ms both;
      }
      .kos-load-track {
        height: 4px;
        border-radius: 99px;
        background: rgba(10, 18, 32, 0.08);
        overflow: hidden;
        box-shadow: inset 0 0 0 1px rgba(26, 95, 255, 0.08);
      }
      .kos-load-fill {
        height: 100%; width: 0%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--kos-blue-deep), var(--kos-blue), var(--kos-gold-bright));
        transition: width 280ms var(--kos-ease);
        box-shadow: 0 0 16px rgba(26, 95, 255, 0.35);
      }
      .kos-load-meta {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-top: 12px;
      }
      .kos-load-label {
        margin: 0;
        font-size: 11px; font-weight: 700;
        letter-spacing: 0.2em; text-transform: uppercase;
        color: var(--kos-muted);
        text-align: left;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .kos-load-pct {
        margin: 0;
        flex-shrink: 0;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.06em;
        font-variant-numeric: tabular-nums;
        color: var(--kos-blue-deep);
      }
      .kos-load-error {
        color: #dc2626;
        font-size: 13px;
        font-weight: 600;
        margin-top: 12px;
        text-align: center;
      }

      /* PC: one lower-left stack — logo, then name, then buttons */
      .kos-shell-main {
        width: 100%;
        height: 100%;
        min-height: 100%;
        display: flex;
        align-items: flex-end;
        justify-content: flex-start;
        padding:
          clamp(24px, 4vh, 48px)
          clamp(20px, 4vw, 48px)
          clamp(36px, 6vh, 72px)
          clamp(24px, 4vw, 64px);
      }
      .kos-main-col {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: flex-end;
        gap: clamp(14px, 2.4vh, 22px);
        width: min(360px, 100%);
        max-width: 360px;
        height: auto;
        animation: kos-slide-up 560ms var(--kos-ease) both;
      }
      .kos-brand {
        display: block;
        flex: 0 0 auto;
        width: 100%;
        margin: 0;
        padding: 0;
      }
      /* Transparent cropped wordmark — above the menu rail on every screen size */
      .kos-main-col > .kos-logo-hero {
        display: block;
        flex: 0 0 auto;
        width: min(280px, 100%, 40vh);
        height: auto;
        max-height: min(120px, 22vh);
        margin: 0;
        padding: 0;
        object-fit: contain;
        object-position: left center;
        mix-blend-mode: normal;
        filter: drop-shadow(0 8px 20px rgba(26, 95, 255, 0.18));
        pointer-events: none;
        user-select: none;
        -webkit-user-drag: none;
        animation: kos-logo-fade 0.7s var(--kos-ease) both;
      }
      .kos-tagline {
        margin: 0;
        padding-left: 2px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--kos-muted);
      }
      .kos-menu-rail {
        display: flex;
        flex-direction: column;
        gap: clamp(12px, 2vh, 18px);
        width: 100%;
        margin: 0;
        padding: 0;
        background: transparent;
        border: none;
        box-shadow: none;
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }

      .kos-career {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px 0 0;
        margin-top: 2px;
        border-top: 1px solid var(--kos-line);
        background: transparent;
        animation: kos-slide-up 560ms var(--kos-ease) 140ms both;
      }
      .kos-career-title {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--kos-muted);
      }
      .kos-career-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px 8px;
      }
      .kos-career-bit { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .kos-career-bit b {
        font-size: 15px;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
        line-height: 1.1;
        color: var(--kos-ink);
      }
      .kos-career-bit span {
        font-size: 9px;
        font-weight: 650;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--kos-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #kos-menu.is-mobile-ui .kos-career { padding-top: 10px; gap: 8px; }
      #kos-menu.is-mobile-ui .kos-career-bit b { font-size: 14px; }

      .kos-legal {
        margin: 4px 0 0;
        font-size: 10px;
        line-height: 1.45;
        color: rgba(10, 18, 32, 0.48);
        letter-spacing: 0.01em;
      }
      .kos-legal a {
        color: var(--kos-blue-deep);
        text-decoration: underline;
        text-underline-offset: 2px;
        font-weight: 650;
      }

      @keyframes kos-logo-in {
        from { opacity: 0; transform: scale(0.94) translateY(16px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      @keyframes kos-logo-fade {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes kos-slide-up {
        from { opacity: 0; transform: translateY(28px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes kos-load-pulse {
        0%, 100% { transform: scale(0.92); opacity: 0.7; }
        50% { transform: scale(1.05); opacity: 1; }
      }

      .kos-shell-sub {
        width: min(440px, 92vw);
        max-height: min(92vh, 880px);
        margin: auto;
        padding: clamp(24px, 4vh, 40px) clamp(22px, 4vw, 36px);
        overflow-y: auto;
        display: flex; flex-direction: column; align-items: stretch;
        background: rgba(255, 255, 255, 0.72);
        backdrop-filter: blur(20px) saturate(1.2);
        -webkit-backdrop-filter: blur(20px) saturate(1.2);
        border: 1px solid rgba(255, 255, 255, 0.9);
        border-left: 3px solid var(--kos-blue);
        box-shadow: 0 24px 64px rgba(10, 30, 80, 0.10);
        scrollbar-width: thin;
        scrollbar-color: rgba(26, 95, 255, 0.25) transparent;
        animation: kos-slide-up 420ms var(--kos-ease) both;
      }
      .kos-shell-settings {
        width: min(640px, 94vw);
        padding-top: clamp(18px, 3vh, 28px);
      }
      .kos-shell-panel {
        padding-top: clamp(18px, 3vh, 28px);
      }
      .kos-panel-chrome {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        width: 100%;
      }
      .kos-panel-bar {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 0;
        width: 100%;
      }
      .kos-panel-brand {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0;
        min-width: 0;
      }
      .kos-panel-body {
        flex: 1 1 auto;
        min-height: 0;
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: stretch;
      }
      .kos-sub-brand { margin-bottom: 4px; }
      .kos-logo-sm {
        width: min(120px, 32vw);
        height: auto;
        display: block;
        filter: drop-shadow(0 8px 20px rgba(26, 95, 255, 0.12));
      }
      .kos-shell-panel .kos-logo-sm { margin-bottom: 2px; }
      .kos-shell-panel .kos-back { margin-bottom: 8px; }

      .kos-heading {
        margin: 8px 0 6px;
        font-size: clamp(26px, 4vw, 34px);
        font-weight: 800;
        letter-spacing: -0.04em;
        line-height: 1.1;
        color: var(--kos-ink);
      }
      .kos-shell-panel .kos-heading { margin: 4px 0 0; }
      .kos-xhair-card .kos-xhair-preview-wrap {
        margin: -2px -2px 10px;
        border: none;
      }
      .kos-xhair-card .kos-btn-ghost { margin-top: 8px; }
      .kos-hint {
        margin: 0 0 22px;
        font-size: 14px; font-weight: 500;
        color: var(--kos-muted); line-height: 1.5;
      }
      .kos-hint.tight {
        margin: 10px 0 0; text-align: center;
        font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 700;
        color: var(--kos-muted);
      }
      .kos-xhair-preview-wrap .kos-hint.tight {
        color: rgba(226, 232, 240, 0.55);
      }
      .kos-hint.tight-left { margin: -8px 0 18px; font-size: 12.5px; }
      .kos-mp-or {
        margin: 14px 0 10px;
        text-align: center;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--kos-muted);
      }
      .kos-section-label {
        margin: 4px 0 10px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: var(--kos-muted);
      }
      .kos-mp-rooms {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
        max-height: min(42vh, 280px);
        overflow-y: auto;
        margin: 0 0 18px;
        padding-right: 2px;
      }
      .kos-mp-rooms-empty {
        padding: 14px 4px;
        font-size: 13px;
        font-weight: 600;
        color: var(--kos-muted);
        text-align: center;
      }
      .kos-mp-room {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        width: 100%;
        padding: 12px 14px;
        border: 1px solid var(--kos-line);
        border-left: 3px solid var(--kos-blue);
        background: rgba(255, 255, 255, 0.88);
        color: var(--kos-ink);
        font-family: inherit;
        font-size: 15px;
        font-weight: 700;
        text-align: left;
        cursor: pointer;
        transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
      }
      .kos-mp-room:hover,
      .kos-mp-room:focus-visible {
        background: var(--kos-blue-soft);
        border-color: rgba(26, 95, 255, 0.28);
        outline: none;
        transform: translateX(2px);
      }
      .kos-mp-room-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .kos-mp-room-meta {
        flex-shrink: 0;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.04em;
        color: var(--kos-blue-deep);
        font-variant-numeric: tabular-nums;
      }

      .kos-field {
        display: flex; flex-direction: column; gap: 8px; width: 100%;
      }
      .kos-field span {
        font-size: 10px; font-weight: 700;
        letter-spacing: 0.2em; text-transform: uppercase;
        color: var(--kos-muted);
      }
      .kos-field input {
        background: rgba(255, 255, 255, 0.85);
        border: none;
        border-bottom: 2px solid var(--kos-line);
        border-radius: 0;
        color: var(--kos-ink);
        font-family: inherit;
        font-size: 16px; font-weight: 600;
        padding: 12px 2px 11px;
        outline: none;
        transition: border-color 180ms ease, background 180ms ease;
      }
      .kos-field input::placeholder { color: #94a3b8; font-weight: 500; }
      .kos-field input:hover { border-bottom-color: rgba(26, 95, 255, 0.35); }
      .kos-field input:focus {
        border-bottom-color: var(--kos-blue);
        background: rgba(255, 255, 255, 0.95);
      }
      .kos-field-inline {
        flex-direction: row; align-items: center; justify-content: space-between;
        margin-bottom: 8px;
      }
      .kos-field-inline input[type=number] {
        max-width: 96px; text-align: center;
        font-size: 18px; font-weight: 800;
        font-variant-numeric: tabular-nums;
        border: 2px solid var(--kos-line);
        border-radius: 0;
        padding: 10px 8px;
        background: #fff;
        appearance: textfield;
        -moz-appearance: textfield;
      }
      .kos-field-inline input[type=number]::-webkit-inner-spin-button,
      .kos-field-inline input[type=number]::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      .kos-field-inline input[type=number]:focus {
        border-color: var(--kos-blue);
      }

      .kos-nav {
        display: flex; flex-direction: column; gap: 6px; width: 100%;
      }
      .kos-btn {
        appearance: none;
        border: none;
        background: transparent;
        color: var(--kos-ink);
        font-family: inherit;
        font-size: 17px; font-weight: 700;
        letter-spacing: -0.01em;
        padding: 16px 18px;
        cursor: pointer;
        text-align: left;
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px;
        min-height: 56px;
        position: relative;
        clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%);
        transition:
          background 160ms ease,
          color 160ms ease,
          transform 160ms var(--kos-ease),
          box-shadow 200ms var(--kos-ease);
      }
      .kos-btn-label { position: relative; z-index: 1; }
      .kos-btn::before {
        content: "";
        position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
        background: transparent;
        transition: background 160ms ease, box-shadow 160ms ease;
      }
      .kos-btn:hover:not(:disabled) {
        background: rgba(26, 95, 255, 0.06);
        color: var(--kos-blue-deep);
        transform: translateX(4px);
      }
      .kos-btn:hover:not(:disabled)::before {
        background: var(--kos-blue);
        box-shadow: 0 0 12px rgba(26, 95, 255, 0.4);
      }
      .kos-btn:active:not(:disabled) { transform: translateX(2px) scale(0.99); }
      .kos-btn:disabled { opacity: 0.45; cursor: not-allowed; }
      .kos-btn:focus-visible,
      .kos-chip:focus-visible,
      .kos-tab:focus-visible,
      .kos-back:focus-visible,
      .kos-bind:focus-visible,
      .kos-res:focus-visible,
      .kos-seg button:focus-visible {
        outline: 2px solid var(--kos-gold);
        outline-offset: 2px;
      }

      .kos-btn-primary {
        background: linear-gradient(90deg, var(--kos-blue-deep) 0%, var(--kos-blue) 100%);
        color: #fff;
        font-size: 18px; font-weight: 800;
        letter-spacing: 0.04em; text-transform: uppercase;
        box-shadow: 0 8px 28px rgba(26, 95, 255, 0.32);
        clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%);
      }
      .kos-btn-primary::before { background: var(--kos-gold-bright); width: 4px; }
      .kos-btn-primary:hover:not(:disabled) {
        background: linear-gradient(90deg, #0d52e8 0%, #2b6fff 100%);
        color: #fff;
        transform: translateX(4px);
        box-shadow: 0 12px 36px rgba(26, 95, 255, 0.42), 0 0 0 1px rgba(26, 95, 255, 0.2);
      }
      .kos-btn-primary:hover:not(:disabled)::before {
        background: var(--kos-gold-bright);
        box-shadow: 0 0 14px rgba(224, 185, 58, 0.6);
      }

      .kos-btn-ghost-line {
        background: transparent;
        border-bottom: 1px solid var(--kos-line);
        clip-path: none;
        font-size: 15px; font-weight: 650;
        min-height: 50px;
        padding: 14px 8px 14px 18px;
      }
      .kos-btn-ghost-line:hover:not(:disabled) {
        background: rgba(26, 95, 255, 0.04);
        border-bottom-color: rgba(26, 95, 255, 0.2);
      }

      .kos-btn-ghost {
        margin-top: 16px; justify-content: center;
        font-size: 13px; font-weight: 650;
        min-height: 44px; padding: 12px 16px;
        background: var(--kos-blue-soft);
        color: var(--kos-blue-deep);
        clip-path: none;
        letter-spacing: 0;
        text-transform: none;
      }
      .kos-btn-ghost:hover:not(:disabled) {
        background: #d8e6ff;
        transform: translateY(-1px);
        color: var(--kos-blue-deep);
      }
      .kos-btn-ghost::before { display: none; }

      .kos-back {
        align-self: flex-start;
        background: none; border: none;
        color: var(--kos-muted);
        font-family: inherit;
        font-size: 13px; font-weight: 650;
        cursor: pointer;
        margin-bottom: 12px; padding: 6px 0;
        transition: color 140ms ease, transform 140ms ease;
      }
      .kos-back:hover { color: var(--kos-blue); transform: translateX(-3px); }

      .kos-section-label {
        font-size: 10px; font-weight: 700;
        letter-spacing: 0.2em; text-transform: uppercase;
        color: var(--kos-muted); margin: 4px 0 10px;
      }
      .kos-chip-row {
        display: flex; gap: 8px; width: 100%; margin-bottom: 20px;
      }
      .kos-chip {
        flex: 1; appearance: none; cursor: pointer;
        background: #fff;
        border: 1.5px solid var(--kos-line);
        color: var(--kos-muted);
        font-family: inherit;
        font-size: 13px; font-weight: 700;
        padding: 13px 6px;
        clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%);
        transition: all 160ms var(--kos-ease);
      }
      .kos-chip:hover {
        border-color: rgba(26, 95, 255, 0.35);
        color: var(--kos-blue-deep);
      }
      .kos-chip.is-on {
        background: var(--kos-blue);
        border-color: transparent;
        color: #fff;
        box-shadow: 0 8px 20px rgba(26, 95, 255, 0.28);
      }
      .kos-chip:disabled {
        cursor: not-allowed;
        opacity: 0.45;
        background: #f4f5f8;
      }
      .kos-chip:disabled:hover { border-color: var(--kos-line); color: var(--kos-muted); }
      .kos-team-setup {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px dashed var(--kos-line);
      }
      .kos-team-setup[hidden] { display: none; }
      .kos-start {
        width: 100%; margin-top: 8px; justify-content: center;
        font-size: 15px; letter-spacing: 0.08em;
      }

      #kos-menu.is-layout-edit {
        z-index: 80;
        pointer-events: none;
        background: transparent;
      }
      #kos-menu.is-layout-edit .kos-bg,
      #kos-menu.is-layout-edit .kos-screen { opacity: 0; visibility: hidden; pointer-events: none; }
      #kos-menu.is-layout-edit .kos-mobile-dock {
        display: flex !important;
        pointer-events: auto;
      }
      #kos-menu.is-desktop [data-mobile-only] { display: none !important; }
      #kos-menu.is-mobile-ui [data-desktop-only] { display: none !important; }

      .kos-res, .kos-chip, .kos-seg button, .kos-bind, .kos-mobile-item {
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }

      .kos-mset {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
      }
      .kos-mset-card {
        background: #fff;
        border: 1px solid var(--kos-line);
        border-radius: 14px;
        padding: 14px 14px 12px;
        box-shadow: 0 8px 18px rgba(10, 30, 80, 0.04);
      }
      .kos-mset-head {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-bottom: 10px;
      }
      .kos-mset-head strong {
        font-size: 14px;
        font-weight: 750;
        color: var(--kos-ink);
      }
      .kos-mset-head em {
        font-style: normal;
        font-size: 12px;
        color: var(--kos-muted);
      }
      .kos-seg {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
        gap: 6px;
        padding: 4px;
        border-radius: 12px;
        background: var(--kos-blue-soft);
      }
      .kos-seg button {
        appearance: none;
        border: 0;
        border-radius: 9px;
        background: transparent;
        color: var(--kos-muted);
        font: inherit;
        font-size: 12px;
        font-weight: 750;
        padding: 10px 8px;
        cursor: pointer;
        transition: background 140ms ease, color 140ms ease, box-shadow 140ms ease;
      }
      .kos-seg button.is-on {
        background: #fff;
        color: var(--kos-blue-deep);
        box-shadow: 0 4px 12px rgba(26, 95, 255, 0.16);
      }

      .kos-mobile-editor-actions {
        display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 10px;
      }
      .kos-mobile-editor-actions .kos-btn { flex: 1; min-width: 120px; justify-content: center; margin-top: 0; }
      .kos-mobile-dock {
        display: none;
        position: fixed;
        left: 12px;
        top: max(12px, env(safe-area-inset-top));
        z-index: 95;
        width: min(200px, 58vw);
        flex-direction: column;
        gap: 6px;
        padding: 8px 10px 10px;
        border-radius: 14px;
        background: rgba(10, 16, 28, 0.88);
        border: 1px solid rgba(255,255,255,0.14);
        box-shadow: 0 12px 28px rgba(0,0,0,0.4);
        color: #fff;
        backdrop-filter: blur(10px);
        touch-action: none;
      }
      .kos-mobile-dock.is-dragging { opacity: 0.92; }
      .kos-mobile-dock-grip {
        display: flex; align-items: center; justify-content: center; gap: 6px;
        padding: 4px 0 2px;
        cursor: grab;
        color: rgba(255,255,255,0.55);
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 700;
      }
      .kos-mobile-dock-grip em { font-style: normal; }
      .kos-mobile-dock-bars {
        width: 28px; height: 3px; border-radius: 99px;
        background: rgba(255,255,255,0.35);
        box-shadow: 0 5px 0 rgba(255,255,255,0.35);
      }
      .kos-mobile-dock-top {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
      }
      .kos-mobile-dock-top strong {
        font-size: 12px; font-weight: 700;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .kos-mobile-done {
        appearance: none; border: 0; border-radius: 999px;
        background: #1a5fff; color: #fff;
        font: inherit; font-size: 13px; font-weight: 800;
        padding: 10px 16px; cursor: pointer;
        flex-shrink: 0;
        min-height: 44px;
      }
      .kos-mobile-dock-slider {
        margin: 0;
        color: rgba(255,255,255,0.9);
      }
      .kos-mobile-dock-slider span {
        display: flex; justify-content: space-between;
        font-size: 11px; margin-bottom: 2px;
      }
      .kos-mobile-dock-slider input[type="range"] {
        width: 100%;
        height: 28px;
      }
      .kos-mobile-dock-check {
        color: rgba(255,255,255,0.9);
        font-size: 11px;
        gap: 6px;
      }
      .kos-mobile-list {
        display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow: auto;
      }
      .kos-mobile-item {
        display: flex; justify-content: space-between; align-items: center; gap: 8px;
        width: 100%; appearance: none; cursor: pointer;
        background: #fff; border: 1px solid var(--kos-line);
        border-radius: 10px; padding: 10px 12px;
        font: inherit; color: var(--kos-ink); text-align: left;
      }
      .kos-mobile-item em { color: var(--kos-muted); font-style: normal; font-size: 12px; }
      .kos-mobile-item.is-on {
        border-color: rgba(26,95,255,0.45);
        background: #eef4ff;
        color: var(--kos-blue-deep);
      }

      .kos-tabs {
        display: flex; gap: 0; width: 100%; margin: 10px 0 20px;
        border-bottom: 2px solid var(--kos-line);
        flex-wrap: nowrap;
      }
      .kos-tab {
        flex: 1; appearance: none; border: none; cursor: pointer;
        background: transparent;
        color: var(--kos-muted);
        font-family: inherit;
        font-size: 13px; font-weight: 700;
        padding: 12px 8px 14px;
        position: relative;
        transition: color 160ms ease;
      }
      .kos-tab:hover { color: var(--kos-blue-deep); }
      .kos-tab.is-on { color: var(--kos-blue-deep); }
      .kos-tab.is-on::after {
        content: "";
        position: absolute; left: 0; right: 0; bottom: -2px;
        height: 2px;
        background: linear-gradient(90deg, var(--kos-blue), var(--kos-gold));
      }
      .kos-tab-panel { display: none; width: 100%; animation: kos-fade-in 280ms ease both; }
      .kos-tab-panel.is-on { display: block; }

      .kos-res-groups {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .kos-res-aspect {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--kos-blue-deep);
        margin-bottom: 8px;
      }
      .kos-res-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .kos-res {
        appearance: none;
        border: 1.5px solid var(--kos-line);
        background: #fff;
        color: var(--kos-muted);
        font-family: inherit;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        padding: 10px 12px;
        cursor: pointer;
        clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%);
        transition: all 160ms var(--kos-ease);
      }
      .kos-res:hover {
        border-color: rgba(26, 95, 255, 0.35);
        color: var(--kos-blue-deep);
      }
      .kos-res.is-on {
        background: var(--kos-blue);
        border-color: transparent;
        color: #fff;
        box-shadow: 0 8px 20px rgba(26, 95, 255, 0.28);
      }
      .kos-res-star {
        color: #c9a227;
        margin-left: 2px;
      }

      .kos-xhair-preview-wrap {
        display: flex; flex-direction: column; align-items: center;
        background: radial-gradient(circle at center, #2a3544 0%, #0f172a 75%);
        padding: 18px 12px 12px;
        border: 1px solid rgba(10, 30, 80, 0.12);
        margin-bottom: 14px;
      }
      .kos-xhair-controls {
        max-height: min(42vh, 320px); overflow-y: auto; padding-right: 4px;
        display: flex; flex-direction: column; gap: 4px;
        scrollbar-width: thin;
      }
      .kos-slider {
        display: flex; flex-direction: column; gap: 2px;
        font-size: 12px; color: var(--kos-muted); font-weight: 650;
        padding: 4px 0;
      }
      .kos-slider span { display: flex; justify-content: space-between; }
      .kos-slider em {
        font-style: normal; color: var(--kos-blue-deep);
        font-variant-numeric: tabular-nums; font-weight: 800;
      }
      .kos-slider input[type=range] {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 28px;
        margin: 0;
        background: transparent;
        cursor: pointer;
      }
      .kos-slider input[type=range]::-webkit-slider-runnable-track {
        height: 4px;
        background: var(--kos-line);
        border: none;
      }
      .kos-slider input[type=range]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        margin-top: -5px;
        background: var(--kos-blue);
        border: 2px solid #fff;
        box-shadow: 0 0 0 1px rgba(201, 162, 39, 0.55), 0 2px 8px rgba(26, 95, 255, 0.35);
        clip-path: polygon(0 0, calc(100% - 3px) 0, 100% 3px, 100% 100%, 0 100%);
      }
      .kos-slider input[type=range]:active::-webkit-slider-thumb {
        box-shadow: 0 0 0 2px var(--kos-gold), 0 2px 10px rgba(26, 95, 255, 0.45);
      }
      .kos-slider input[type=range]::-moz-range-track {
        height: 4px;
        background: var(--kos-line);
        border: none;
      }
      .kos-slider input[type=range]::-moz-range-thumb {
        width: 14px;
        height: 14px;
        background: var(--kos-blue);
        border: 2px solid #fff;
        border-radius: 0;
        box-shadow: 0 0 0 1px rgba(201, 162, 39, 0.55);
      }
      .kos-sens-slider { margin-bottom: 10px; }

      .kos-check {
        display: flex; align-items: center; gap: 10px;
        font-size: 13px; font-weight: 650; color: var(--kos-ink); cursor: pointer;
        padding: 6px 0;
      }
      .kos-check input { accent-color: var(--kos-blue); width: 15px; height: 15px; cursor: pointer; }

      .kos-match-opt {
        align-items: flex-start;
        width: 100%;
        margin: 4px 0 18px;
        padding: 14px 14px 14px 16px;
        background: linear-gradient(135deg, #fff 0%, var(--kos-gold-soft) 100%);
        border: 1px solid rgba(201, 162, 39, 0.28);
        border-left: 3px solid var(--kos-gold);
        gap: 12px;
        transition: box-shadow 180ms ease, transform 160ms ease;
      }
      .kos-match-opt:hover {
        box-shadow: 0 10px 24px rgba(201, 162, 39, 0.12);
        transform: translateY(-1px);
      }
      .kos-match-opt input {
        margin-top: 2px; accent-color: var(--kos-gold);
        width: 16px; height: 16px; flex-shrink: 0;
      }
      .kos-match-opt span { display: flex; flex-direction: column; gap: 3px; }
      .kos-match-opt strong { font-size: 14px; font-weight: 700; color: var(--kos-ink); }
      .kos-match-opt em { font-style: normal; font-size: 12px; font-weight: 500; color: var(--kos-muted); line-height: 1.35; }

      .kos-bind-list {
        display: flex; flex-direction: column; gap: 6px;
        max-height: 360px; overflow-y: auto; width: 100%;
        scrollbar-width: thin;
      }
      .kos-bind {
        display: flex; justify-content: space-between; align-items: center;
        width: 100%; appearance: none; cursor: pointer;
        background: #fff;
        border: 1px solid var(--kos-line);
        border-left: 3px solid transparent;
        color: var(--kos-ink);
        font-family: inherit;
        font-size: 13px; font-weight: 650;
        padding: 12px 12px;
        text-align: left;
        transition: all 150ms ease;
      }
      .kos-bind:hover {
        border-left-color: var(--kos-blue);
        box-shadow: 0 6px 16px rgba(26, 95, 255, 0.08);
        transform: translateX(2px);
      }
      .kos-bind.is-listening {
        border-color: rgba(201, 162, 39, 0.4);
        border-left-color: var(--kos-gold);
        background: var(--kos-gold-soft);
      }
      .kos-bind kbd {
        font-family: inherit; font-size: 11px; font-weight: 800;
        letter-spacing: 0.06em; min-width: 68px; text-align: center;
        padding: 5px 9px;
        background: var(--kos-blue-soft);
        color: var(--kos-blue-deep);
        border: 1px solid rgba(26, 95, 255, 0.14);
      }
      .kos-bind.is-listening kbd {
        background: #fff; color: var(--kos-gold);
        border-color: rgba(201, 162, 39, 0.35);
      }

      #game-crosshair {
        position: fixed;
        left: 50%;
        top: 50%;
        width: 48px;
        height: 48px;
        transform: translate(-50%, -50%);
        z-index: 25;
        pointer-events: none;
        background: transparent;
        opacity: 0;
        visibility: hidden;
        image-rendering: pixelated;
        image-rendering: crisp-edges;
      }
      #game-crosshair.is-on { opacity: 1; visibility: visible; }
      #game-crosshair.is-awp-hidden { opacity: 0 !important; visibility: hidden !important; }

      @media (max-width: 900px) {
        .kos-shell-main {
          align-items: flex-end;
          padding: 28px 22px 32px;
        }
        .kos-main-col { max-width: 340px; width: min(340px, 100%); }
        .kos-main-col > .kos-logo-hero {
          width: min(240px, 70vw, 36vh);
          max-height: min(100px, 20vh);
        }
      }
      @media (max-width: 520px) {
        .kos-shell-main { padding: 18px 16px 24px; }
        .kos-main-col { max-width: 100%; width: 100%; gap: 12px; }
        .kos-main-col > .kos-logo-hero {
          width: min(220px, 72vw, 34vh);
          max-height: min(92px, 18vh);
        }
        .kos-career-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .kos-btn { font-size: 15px; min-height: 50px; padding: 14px 14px; }
        .kos-btn-primary { font-size: 15px; }
        .kos-shell-sub { padding: 20px 16px 24px; width: min(440px, 94vw); }
        .kos-heading { font-size: 24px; }
      }
      @media (min-width: 1400px) {
        .kos-shell-main { padding: 56px 88px 64px; }
        .kos-main-col { max-width: 400px; width: min(400px, 100%); }
        .kos-main-col > .kos-logo-hero {
          width: min(300px, 26vw, 40vh);
          max-height: min(120px, 18vh);
        }
      }

      /* Mobile: always keep menu buttons reachable (esp. iPhone landscape) */
      #kos-menu.is-mobile-ui .kos-screen.is-active {
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
      }
      #kos-menu.is-mobile-ui .kos-screen[data-screen="loading"].is-active {
        overflow: hidden;
        align-items: center;
        justify-content: center;
      }
      #kos-menu.is-mobile-ui .kos-load {
        padding:
          max(16px, env(safe-area-inset-top))
          max(16px, env(safe-area-inset-right))
          max(16px, env(safe-area-inset-bottom))
          max(16px, env(safe-area-inset-left));
      }
      #kos-menu.is-mobile-ui .kos-load-mark {
        width: min(240px, 70vw);
        height: min(240px, 70vw);
      }
      #kos-menu.is-mobile-ui .kos-logo-load {
        width: min(168px, 46vw, 26vh);
      }
      #kos-menu.is-mobile-ui .kos-load-wrap {
        width: min(240px, 78vw);
        margin-top: 16px;
      }
      #kos-menu.is-mobile-ui .kos-load-track { height: 4px; }
      #kos-menu.is-mobile-ui .kos-load-label { font-size: 10px; }
      #kos-menu.is-mobile-ui .kos-load-pct { font-size: 11px; }
      #kos-menu.is-mobile-ui .kos-screen[data-screen="settings"].is-active,
      #kos-menu.is-mobile-ui .kos-screen[data-screen="bots"].is-active,
      #kos-menu.is-mobile-ui .kos-screen[data-screen="mp"].is-active {
        overflow: hidden;
        flex-direction: column;
        align-items: stretch;
      }
      /* Same composition as PC: logo + controls lower-left, art on the right */
      #kos-menu.is-mobile-ui .kos-shell-main {
        min-height: 100%;
        min-height: 100dvh;
        box-sizing: border-box;
        align-items: flex-end;
        justify-content: flex-start;
        overflow: visible;
        padding:
          max(16px, env(safe-area-inset-top))
          max(16px, env(safe-area-inset-right))
          max(20px, env(safe-area-inset-bottom))
          max(16px, env(safe-area-inset-left));
      }
      #kos-menu.is-mobile-ui .kos-main-col {
        max-width: min(360px, 100%);
        width: min(360px, 100%);
        justify-content: flex-end;
        gap: clamp(10px, 2.2vh, 16px);
      }
      #kos-menu.is-mobile-ui .kos-main-col > .kos-logo-hero {
        width: min(240px, 68vw, 38vh);
        max-height: min(96px, 18vh);
      }
      #kos-menu.is-mobile-ui .kos-menu-rail { gap: clamp(10px, 2vh, 14px); }
      #kos-menu.is-mobile-ui .kos-nav { gap: 4px; }
      #kos-menu.is-mobile-ui .kos-btn {
        min-height: 46px;
        padding: 12px 14px;
        font-size: 15px;
      }
      #kos-menu.is-mobile-ui .kos-btn-primary { font-size: 15px; }
      #kos-menu.is-mobile-ui .kos-field { gap: 6px; }
      #kos-menu.is-mobile-ui .kos-field input {
        padding: 10px 2px 9px;
        font-size: 15px;
      }

      #kos-menu.is-mobile-ui .kos-shell-panel {
        width: 100%;
        max-width: none;
        height: 100%;
        max-height: none;
        margin: 0;
        border: none;
        border-left: none;
        border-radius: 0;
        box-shadow: none;
        background: rgba(255, 255, 255, 0.92);
        backdrop-filter: blur(18px) saturate(1.15);
        -webkit-backdrop-filter: blur(18px) saturate(1.15);
        padding:
          max(8px, env(safe-area-inset-top))
          max(12px, env(safe-area-inset-right))
          max(10px, env(safe-area-inset-bottom))
          max(12px, env(safe-area-inset-left));
        overflow: hidden;
      }
      #kos-menu.is-mobile-ui .kos-panel-chrome {
        z-index: 5;
        flex-shrink: 0;
        background: linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.94) 78%, rgba(255,255,255,0.72) 100%);
        border-bottom: 1px solid rgba(10, 30, 80, 0.06);
      }
      #kos-menu.is-mobile-ui .kos-panel-bar {
        flex-direction: row;
        align-items: center;
        gap: 8px;
        min-height: 32px;
      }
      #kos-menu.is-mobile-ui .kos-shell-panel .kos-back {
        margin: 0;
        padding: 6px 2px;
        flex-shrink: 0;
        font-size: 12px;
      }
      #kos-menu.is-mobile-ui .kos-panel-brand {
        flex-direction: row;
        align-items: center;
        gap: 6px;
        flex: 1;
        min-width: 0;
      }
      #kos-menu.is-mobile-ui .kos-shell-panel .kos-logo-sm {
        width: 22px;
        margin: 0;
        flex-shrink: 0;
      }
      #kos-menu.is-mobile-ui .kos-shell-panel .kos-heading {
        margin: 0;
        font-size: 16px;
        letter-spacing: -0.03em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #kos-menu.is-mobile-ui .kos-shell-panel .kos-tabs {
        margin: 2px 0 0;
        flex-wrap: nowrap;
        gap: 0;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        border-bottom-color: rgba(10, 30, 80, 0.08);
      }
      #kos-menu.is-mobile-ui .kos-shell-panel .kos-tabs::-webkit-scrollbar { display: none; }
      #kos-menu.is-mobile-ui .kos-shell-panel .kos-tab {
        flex: 1 0 auto;
        min-width: 0;
        padding: 7px 8px 8px;
        font-size: 12px;
      }
      #kos-menu.is-mobile-ui .kos-panel-body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-x: hidden;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
        padding: 8px 0 6px;
        scrollbar-width: thin;
      }
      #kos-menu.is-mobile-ui .kos-shell-panel .kos-tab-panel.is-on {
        padding-bottom: 4px;
      }
      #kos-menu.is-mobile-ui .kos-shell-panel .kos-hint {
        margin: 0 0 8px;
        font-size: 11.5px;
        line-height: 1.35;
      }
      #kos-menu.is-mobile-ui .kos-shell-panel .kos-hint.tight-left {
        margin: 4px 0 8px;
        font-size: 11px;
      }
      #kos-menu.is-mobile-ui .kos-shell-panel .kos-section-label {
        margin: 8px 0 6px;
        font-size: 9px;
      }
      #kos-menu.is-mobile-ui .kos-shell-panel .kos-chip-row {
        gap: 5px;
        margin-bottom: 10px;
      }
      #kos-menu.is-mobile-ui .kos-shell-panel .kos-chip {
        padding: 7px 6px;
        font-size: 11px;
      }
      #kos-menu.is-mobile-ui .kos-shell-panel .kos-btn-primary {
        min-height: 44px;
        font-size: 13px;
        margin-top: 2px;
      }
      #kos-menu.is-mobile-ui .kos-shell-panel .kos-btn-ghost-line {
        min-height: 40px;
        margin-top: 6px;
        font-size: 13px;
        justify-content: center;
      }
      #kos-menu.is-mobile-ui .kos-shell-panel .kos-match-opt {
        margin: 4px 0 0;
        padding: 8px 9px;
      }
      #kos-menu.is-mobile-ui .kos-mp-rooms {
        max-height: min(26vh, 160px);
        margin: 0;
      }
      #kos-menu.is-mobile-ui .kos-mp-room {
        padding: 9px 10px;
        font-size: 13px;
      }
      #kos-menu.is-mobile-ui .kos-mp-or { display: none; }
      #kos-menu.is-mobile-ui .kos-field-inline {
        margin-bottom: 6px;
      }
      #kos-menu.is-mobile-ui .kos-field-inline input[type=number] {
        max-width: 78px;
        font-size: 16px;
        padding: 8px 6px;
      }
      #kos-menu.is-mobile-ui .kos-mset { gap: 6px; }
      #kos-menu.is-mobile-ui .kos-mset-card {
        padding: 8px 9px 8px;
        border-radius: 10px;
        box-shadow: none;
      }
      #kos-menu.is-mobile-ui .kos-mset-head {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0 8px;
        margin-bottom: 6px;
      }
      #kos-menu.is-mobile-ui .kos-mset-head strong {
        font-size: 12px;
        line-height: 1.2;
      }
      #kos-menu.is-mobile-ui .kos-mset-head em {
        font-size: 10.5px;
        line-height: 1.2;
      }
      #kos-menu.is-mobile-ui .kos-seg {
        gap: 4px;
        padding: 3px;
        border-radius: 9px;
      }
      #kos-menu.is-mobile-ui .kos-seg button {
        padding: 7px 4px;
        font-size: 11px;
        border-radius: 7px;
      }
      #kos-menu.is-mobile-ui .kos-mset-card .kos-slider {
        gap: 0;
        padding: 2px 0;
        font-size: 11px;
      }
      #kos-menu.is-mobile-ui .kos-mset-card .kos-slider input[type=range] {
        height: 22px;
      }
      #kos-menu.is-mobile-ui .kos-mset-card .kos-slider input[type=range]::-webkit-slider-thumb {
        width: 12px;
        height: 12px;
        margin-top: -4px;
      }
      #kos-menu.is-mobile-ui .kos-mset-card .kos-match-opt {
        margin: 4px 0 0;
        padding: 8px 9px;
        gap: 8px;
      }
      #kos-menu.is-mobile-ui .kos-mset-card .kos-match-opt strong { font-size: 12px; }
      #kos-menu.is-mobile-ui .kos-mset-card .kos-match-opt em { font-size: 10.5px; }
      #kos-menu.is-mobile-ui .kos-mobile-editor-actions {
        position: static;
        background: none;
        padding: 0;
        margin: 0 0 6px;
        gap: 6px;
      }
      #kos-menu.is-mobile-ui .kos-mobile-editor-actions .kos-btn {
        min-height: 40px;
        font-size: 12.5px;
        padding: 8px 10px;
      }
      #kos-menu.is-mobile-ui .kos-mobile-list {
        max-height: none;
        overflow: visible;
        gap: 4px;
      }
      #kos-menu.is-mobile-ui .kos-mobile-item {
        padding: 8px 10px;
        border-radius: 8px;
        font-size: 12.5px;
      }
      #kos-menu.is-mobile-ui .kos-xhair-preview-wrap {
        padding: 10px 8px 8px;
        margin-bottom: 8px;
      }
      #kos-menu.is-mobile-ui .kos-xhair-controls {
        max-height: none;
        overflow: visible;
        padding-right: 0;
        gap: 2px;
      }
      #kos-menu.is-mobile-ui .kos-shell-panel .kos-btn-ghost {
        margin-top: 8px;
        min-height: 38px;
        font-size: 12px;
        padding: 8px 12px;
      }
      #kos-menu.is-mobile-ui .kos-xhair-card .kos-xhair-preview-wrap {
        margin: 0 0 8px;
      }
      #kos-menu.is-mobile-ui .kos-panel-body .kos-slider {
        gap: 0;
        padding: 2px 0;
        font-size: 11px;
      }
      #kos-menu.is-mobile-ui .kos-panel-body .kos-slider input[type=range] {
        height: 22px;
      }

      /* Landscape phones: same lower-left stack, tighter so it fits the short side */
      @media (orientation: landscape) and (max-height: 520px) {
        #kos-menu.is-mobile-ui .kos-shell-main {
          align-items: flex-end;
          justify-content: flex-start;
          padding:
            max(8px, env(safe-area-inset-top))
            max(14px, env(safe-area-inset-right))
            max(10px, env(safe-area-inset-bottom))
            max(14px, env(safe-area-inset-left));
        }
        #kos-menu.is-mobile-ui .kos-main-col {
          max-width: min(340px, 46vw);
          width: min(340px, 46vw);
          gap: clamp(6px, 1.6vh, 10px);
        }
        #kos-menu.is-mobile-ui .kos-menu-rail { gap: clamp(6px, 1.4vh, 10px); }
        #kos-menu.is-mobile-ui .kos-main-col > .kos-logo-hero {
          width: min(180px, 32vw, 42vh);
          max-height: min(64px, 28vh);
        }
        #kos-menu.is-mobile-ui .kos-career {
          padding-top: 6px;
          gap: 6px;
        }
        #kos-menu.is-mobile-ui .kos-career-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 6px 6px;
        }
        #kos-menu.is-mobile-ui .kos-career-bit b { font-size: 12px; }
        #kos-menu.is-mobile-ui .kos-btn {
          min-height: 40px;
          padding: 8px 12px;
          font-size: 14px;
        }
        #kos-menu.is-mobile-ui .kos-btn-primary { font-size: 13px; }
        #kos-menu.is-mobile-ui .kos-field span { font-size: 9px; }
        #kos-menu.is-mobile-ui .kos-field input {
          padding: 6px 2px 5px;
          font-size: 14px;
        }
        #kos-menu.is-mobile-ui .kos-legal { font-size: 9px; }
        #kos-menu.is-mobile-ui .kos-logo-load {
          width: min(140px, 28vw);
          max-height: min(72px, 30vh);
        }
        #kos-menu.is-mobile-ui .kos-load-mark {
          width: min(180px, 36vw);
          height: min(180px, 36vw);
        }
        #kos-menu.is-mobile-ui .kos-load-wrap {
          margin-top: 10px;
          width: min(220px, 42vw);
        }
        #kos-menu.is-mobile-ui .kos-shell-panel {
          padding:
            max(4px, env(safe-area-inset-top))
            max(10px, env(safe-area-inset-right))
            max(6px, env(safe-area-inset-bottom))
            max(10px, env(safe-area-inset-left));
        }
        #kos-menu.is-mobile-ui .kos-shell-panel .kos-logo-sm { width: 18px; }
        #kos-menu.is-mobile-ui .kos-shell-panel .kos-heading { font-size: 15px; }
        #kos-menu.is-mobile-ui .kos-shell-panel .kos-tab { padding: 5px 8px 6px; font-size: 11px; }
        #kos-menu.is-mobile-ui .kos-panel-body { padding: 6px 0 4px; }
        #kos-menu.is-mobile-ui .kos-mset { gap: 5px; }
        #kos-menu.is-mobile-ui .kos-mset-card { padding: 6px 8px; }
        #kos-menu.is-mobile-ui .kos-mset-head { margin-bottom: 4px; }
        #kos-menu.is-mobile-ui .kos-seg button { padding: 5px 4px; font-size: 10.5px; }
        #kos-menu.is-mobile-ui .kos-hint { margin-bottom: 6px; font-size: 11px; }
        #kos-menu.is-mobile-ui .kos-chip { padding: 7px 5px; font-size: 11px; }
      }

      /* Very short screens: keep stack readable without covering the art */
      @media (max-height: 420px) {
        #kos-menu.is-mobile-ui .kos-main-col > .kos-logo-hero {
          width: min(150px, 28vw, 36vh);
          max-height: min(52px, 22vh);
        }
        #kos-menu.is-mobile-ui .kos-career { display: none; }
      }

      @media (prefers-reduced-motion: reduce) {
        .kos-screen, .kos-logo-load, .kos-logo-hero, .kos-main-col, .kos-load-mark,
        .kos-load-wrap, .kos-career, .kos-shell-sub, .kos-tab-panel {
          animation: none !important;
        }
        .kos-logo-hero { opacity: 1 !important; }
      }
    `
