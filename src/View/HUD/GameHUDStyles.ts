export const GAME_HUD_CSS = `
      @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&display=swap');
      #game-hud {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 30;
        font-family: "Outfit", "Segoe UI", system-ui, sans-serif;
        color: #fff;
        text-shadow: 0 1px 2px rgba(0,0,0,0.85), 0 0 8px rgba(0,0,0,0.35);
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
        -webkit-tap-highlight-color: transparent;
        touch-action: none;
        -webkit-font-smoothing: antialiased;
      }
      #game-hud * {
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
      }
      #game-hud img {
        -webkit-user-drag: none;
        pointer-events: none;
      }

      #game-hud-top {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 45;
        font-family: "Outfit", "Segoe UI", system-ui, sans-serif;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
        -webkit-tap-highlight-color: transparent;
      }
      #game-hud-top:not(.is-touch) [data-touch-only] { display: none !important; }

      .kos-brand {
        position: absolute;
        top: max(12px, env(safe-area-inset-top));
        right: max(16px, env(safe-area-inset-right));
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.28em;
        color: rgba(255,255,255,0.28);
        text-shadow: none;
        pointer-events: none;
      }

      .cs-pause-backdrop {
        position: absolute;
        inset: 0;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        background: rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(6px);
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity 160ms ease, visibility 160ms ease;
      }
      .cs-pause-backdrop.is-on {
        opacity: 1;
        visibility: visible;
      }
      .cs-pause-menu.is-hidden { display: none; }
      .cs-pause-menu {
        position: absolute;
        top: max(12px, env(safe-area-inset-top));
        left: max(14px, env(safe-area-inset-left));
        z-index: 5;
        pointer-events: auto;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
      }
      .cs-pause-top {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .cs-pause-label {
        font-size: clamp(28px, 5vw, 42px);
        font-weight: 800;
        letter-spacing: 0.28em;
        color: #e8c56a;
        text-shadow: 0 2px 0 rgba(0,0,0,0.55);
      }
      .cs-pause-sub {
        font-size: 12px;
        font-weight: 650;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.62);
      }

      .cs-pause-btn {
        width: 44px;
        height: 44px;
        min-width: 44px;
        min-height: 44px;
        appearance: none;
        border: 1px solid rgba(255,255,255,0.18);
        background: rgba(0,0,0,0.45);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        padding: 0;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
        -webkit-user-select: none;
        transition: background 140ms ease, border-color 140ms ease, transform 140ms ease;
      }
      .cs-pause-btn span {
        display: block;
        width: 3px;
        height: 14px;
        background: #fff;
        border-radius: 1px;
        box-shadow: 0 0 6px rgba(255,255,255,0.25);
      }
      .cs-pause-btn:hover {
        background: rgba(0,0,0,0.45);
        border-color: rgba(255,255,255,0.18);
        transform: none;
      }
      @media (hover: hover) and (pointer: fine) {
        .cs-pause-btn:hover {
          background: rgba(26, 95, 255, 0.35);
          border-color: rgba(26, 95, 255, 0.55);
          transform: translateY(-1px);
        }
      }
      .cs-pause-btn:active,
      .cs-pause-btn.is-active {
        background: rgba(26, 95, 255, 0.45);
        border-color: rgba(201, 162, 39, 0.55);
      }
      .cs-console-btn {
        width: 44px;
        height: 44px;
        min-width: 44px;
        min-height: 44px;
        appearance: none;
        border: 1px solid rgba(196, 181, 80, 0.45);
        background: rgba(24, 20, 8, 0.55);
        color: #e8d878;
        cursor: pointer;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 0;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
        -webkit-user-select: none;
        transition: background 140ms ease, border-color 140ms ease, transform 140ms ease;
      }
      #game-hud-top.is-touch .cs-console-btn { display: flex; }
      .cs-console-btn svg {
        width: 22px;
        height: 22px;
        display: block;
        filter: drop-shadow(0 1px 1px rgba(0,0,0,0.55));
      }
      .cs-console-btn:active {
        background: rgba(196, 181, 80, 0.28);
        border-color: rgba(230, 210, 100, 0.75);
        transform: scale(0.96);
      }
      .cs-pause-panel {
        display: none;
        flex-direction: column;
        gap: 4px;
        min-width: 168px;
        padding: 8px;
        background: linear-gradient(165deg, rgba(12, 16, 28, 0.94), rgba(8, 10, 18, 0.96));
        border: 1px solid rgba(255,255,255,0.10);
        border-left: 3px solid #1a5fff;
        box-shadow: 0 16px 40px rgba(0,0,0,0.45);
        animation: kos-fade-in 180ms ease both;
      }
      .cs-pause-menu.is-open .cs-pause-panel { display: flex; }
      .cs-pause-opt {
        appearance: none;
        border: none;
        background: transparent;
        color: #fff;
        font-family: inherit;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.02em;
        text-align: left;
        padding: 11px 12px;
        cursor: pointer;
        transition: background 140ms ease, color 140ms ease, transform 140ms ease;
      }
      .cs-pause-opt:hover {
        background: transparent;
        color: #fff;
        transform: none;
      }
      @media (hover: hover) and (pointer: fine) {
        .cs-pause-opt:hover {
          background: rgba(26, 95, 255, 0.18);
          color: #c9a227;
          transform: translateX(2px);
        }
      }

      /*
       * Health and ammo are mirror images of each other: number + 3px bar, same
       * baseline, same bottom inset. The shared vars keep the two sides locked
       * together when the HUD shrinks for touch.
       */
      #game-hud {
        --hud-num: 34px;
        --hud-sub: 19px;
        --hud-bar-w: 78px;
        --hud-bar-h: 3px;
        --hud-bar-gap: 4px;
        --hud-icon: 22px;
        --hud-gun: 44px;
        --hud-inset: 16px;
        --hud-lift: 0px;
      }
      .cs-bottom-left,
      .cs-bottom-right {
        position: absolute;
        bottom: calc(max(var(--hud-inset), env(safe-area-inset-bottom)) + var(--hud-lift));
        display: flex;
        flex-direction: column;
        gap: 4px;
        pointer-events: none;
      }
      .cs-bottom-left {
        left: max(var(--hud-inset), env(safe-area-inset-left));
        align-items: flex-start;
      }
      .cs-bottom-right {
        right: max(var(--hud-inset), env(safe-area-inset-right));
        align-items: flex-end;
      }
      .cs-vital {
        display: flex;
        align-items: flex-end;
        gap: 8px;
      }
      .cs-vital-icon {
        width: var(--hud-icon);
        height: var(--hud-icon);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--hud-icon);
        font-weight: 800;
        line-height: 1;
        color: #fff;
        flex-shrink: 0;
        margin-bottom: calc(var(--hud-bar-h) + var(--hud-bar-gap));
      }
      .cs-vital-main,
      .cs-ammo-main {
        display: flex;
        flex-direction: column;
        gap: var(--hud-bar-gap);
      }
      .cs-ammo-main { align-items: flex-end; }
      .cs-vital-num,
      .cs-ammo-mag {
        font-size: var(--hud-num);
        font-weight: 800;
        line-height: 1;
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.02em;
      }
      .cs-vital-bar,
      .cs-ammo-bar {
        height: var(--hud-bar-h);
        width: var(--hud-bar-w);
        background: rgba(255,255,255,0.18);
        overflow: hidden;
      }
      .cs-vital-fill,
      .cs-ammo-fill {
        height: 100%;
        width: 100%;
        background: #fff;
        transition: transform 120ms linear;
      }
      .cs-vital-fill { transform-origin: left center; }
      .cs-ammo-fill { transform-origin: right center; }
      .cs-vital-fill.is-low { background: #ff4d4d; }
      .cs-ammo-fill.is-low { background: #ff5555; }
      .cs-ammo-reserve.is-out { color: #ff6b6b; }

      .cs-vital-armor { display: none; }
      .cs-vital-armor.is-on { display: flex; }
      .cs-vital-icon.is-armor { color: #8fc3ff; font-size: calc(var(--hud-icon) * 0.85); }
      .cs-vital-fill.is-armor { background: #6fb2ff; }
      .cs-vital-armor .cs-vital-num { font-size: calc(var(--hud-num) * 0.62); opacity: 0.92; }
      .cs-vital-armor .cs-vital-bar { width: calc(var(--hud-bar-w) * 0.72); }

      .cs-weapon-row {
        display: flex;
        align-items: flex-end;
        justify-content: flex-end;
        gap: 8px;
        min-height: var(--hud-gun);
      }
      .cs-weapon-icon {
        height: var(--hud-gun);
        width: auto;
        max-width: 150px;
        object-fit: contain;
        object-position: right center;
        filter: brightness(0) invert(1) drop-shadow(0 2px 4px rgba(0,0,0,0.5));
      }
      .cs-weapon-icon.is-sidearm {
        height: calc(var(--hud-gun) * 1.3);
        max-width: 170px;
      }
      .cs-knife-icon {
        height: calc(var(--hud-gun) * 0.6);
        width: auto;
        max-width: 56px;
        object-fit: contain;
        filter: brightness(0) saturate(100%) invert(72%) sepia(55%) saturate(500%) hue-rotate(5deg);
        opacity: 0.9;
      }
      .cs-ammo-row {
        display: flex;
        align-items: baseline;
        gap: 2px;
        font-variant-numeric: tabular-nums;
      }
      .cs-ammo-mag.is-low { color: #ff5555; text-shadow: 0 0 12px rgba(255,60,60,0.45); }
      .cs-ammo-sep {
        font-size: var(--hud-sub);
        opacity: 0.55;
        margin: 0 3px;
        font-weight: 600;
      }
      .cs-ammo-reserve {
        font-size: var(--hud-sub);
        font-weight: 700;
        opacity: 0.85;
      }

      .cs-hitmarker {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 18px;
        height: 18px;
        margin: 0;
        transform: translate(-50%, -50%) scale(1);
        opacity: 0;
        pointer-events: none;
      }
      .cs-hitmarker.is-on {
        opacity: 1;
        animation: cs-hit-pop 140ms ease-out;
      }
      @keyframes cs-hit-pop {
        0% { transform: translate(-50%, -50%) scale(1.32); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
      }
      .cs-hitmarker::before,
      .cs-hitmarker::after {
        content: '';
        position: absolute;
        background: #fff;
        box-shadow: 0 0 2px #000;
      }
      .cs-hitmarker::before {
        left: 7px;
        top: 0;
        width: 2px;
        height: 18px;
        transform: rotate(45deg);
      }
      .cs-hitmarker::after {
        left: 0;
        top: 7px;
        width: 18px;
        height: 2px;
        transform: rotate(45deg);
      }
      .cs-hitmarker.is-head::before,
      .cs-hitmarker.is-head::after {
        background: #ff3333;
        box-shadow: 0 0 3px rgba(0,0,0,0.85);
      }

      .cs-damage-flash {
        position: absolute;
        inset: 0;
        pointer-events: none;
        opacity: 0;
        background: radial-gradient(ellipse at center, transparent 35%, rgba(160, 0, 0, 0.75) 100%);
        transition: opacity 60ms linear;
      }
      .cs-damage-flash.is-on { opacity: 1; }

      .cs-loadout {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 18px;
        pointer-events: none;
        opacity: 0;
        visibility: hidden;
        background:
          radial-gradient(ellipse at center, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.72) 100%);
        transition: opacity 160ms ease, visibility 160ms ease;
        z-index: 50;
        touch-action: manipulation;
      }
      .cs-loadout.is-on {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
      }
      .cs-loadout-title {
        font-size: clamp(22px, 3.4vw, 34px);
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #fff;
      }
      .cs-loadout-sub {
        margin-top: -8px;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.55);
      }
      .cs-loadout-sub kbd {
        display: inline-block;
        min-width: 1.4em;
        padding: 1px 6px;
        margin: 0 2px;
        border: 1px solid rgba(255,255,255,0.25);
        background: rgba(255,255,255,0.08);
        font: inherit;
        text-align: center;
      }
      .cs-loadout-row {
        display: flex;
        flex-wrap: wrap;
        gap: 18px;
        justify-content: center;
        padding: 8px 20px 0;
      }
      .cs-loadout-box {
        width: min(280px, 42vw);
        min-width: 200px;
        padding: 22px 20px 18px;
        border: 1px solid rgba(255,255,255,0.16);
        background: linear-gradient(180deg, rgba(28,32,40,0.92), rgba(12,14,18,0.94));
        color: #fff;
        cursor: pointer;
        text-align: center;
        pointer-events: auto;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
        transition: border-color 120ms ease, transform 120ms ease, background 120ms ease;
      }
      .cs-loadout-box:hover {
        border-color: rgba(232, 196, 84, 0.7);
        transform: translateY(-2px);
        background: linear-gradient(180deg, rgba(40,36,24,0.95), rgba(16,14,10,0.96));
      }
      .cs-loadout-box.is-selected {
        border-color: #e8c454;
        box-shadow: 0 0 0 1px rgba(232,196,84,0.4), 0 16px 40px rgba(0,0,0,0.35);
        transform: scale(1.02);
      }
      .cs-loadout-box:focus-visible {
        outline: 2px solid #e8c454;
        outline-offset: 3px;
      }
      .cs-loadout-guns {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        min-height: 72px;
        margin-bottom: 14px;
      }
      .cs-loadout-icon {
        width: 140px;
        height: 56px;
        object-fit: contain;
        filter: drop-shadow(0 2px 6px rgba(0,0,0,0.55));
      }
      .cs-loadout-icon.is-side {
        width: 72px;
        height: 40px;
        opacity: 0.9;
      }
      .cs-loadout-plus {
        font-size: 22px;
        font-weight: 700;
        color: rgba(255,255,255,0.45);
      }
      .cs-loadout-name {
        font-size: 18px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .cs-loadout-hint {
        margin-top: 6px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.45);
      }

      .cs-lockdown {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        opacity: 0;
        background: radial-gradient(ellipse at center, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 100%);
        transition: opacity 180ms ease;
        z-index: 8;
      }
      .cs-lockdown.is-on { opacity: 1; }
      .cs-lockdown-num {
        font-size: clamp(72px, 16vw, 120px);
        font-weight: 800;
        line-height: 1;
        color: #fff;
        text-shadow: 0 4px 0 #000, 0 0 40px rgba(196, 58, 58, 0.55);
        letter-spacing: 0.04em;
      }
      .cs-lockdown-num.pop {
        animation: kos-lock-pop 320ms cubic-bezier(0.2, 0.9, 0.25, 1) both;
      }
      .cs-lockdown-label {
        margin-top: 8px;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.28em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.7);
      }
      @keyframes kos-lock-pop {
        from { transform: scale(1.35); opacity: 0.4; }
        to { transform: scale(1); opacity: 1; }
      }

      .cs-killfeed {
        position: absolute;
        top: calc(52px + env(safe-area-inset-top));
        right: max(16px, env(safe-area-inset-right));
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 5px;
        z-index: 7;
        pointer-events: none;
        max-width: min(360px, 50vw);
      }
      .cs-feed-row {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 5px 10px 5px 11px;
        background: rgba(8, 10, 16, 0.78);
        border: 1px solid rgba(30, 107, 255, 0.35);
        border-right: 3px solid rgba(196, 58, 58, 0.9);
        font-size: 12px;
        font-weight: 650;
        line-height: 1;
        opacity: 0;
        transform: translateX(12px);
        transition: opacity 180ms ease, transform 180ms ease;
        white-space: nowrap;
        text-shadow: 0 1px 0 #000;
        backdrop-filter: blur(4px);
      }
      .cs-feed-row.is-in { opacity: 1; transform: translateX(0); }
      .cs-feed-row.is-out { opacity: 0; transform: translateX(8px); }
      .cs-feed-killer { color: #f2f2f2; }
      .cs-feed-victim { color: #e8c56a; }
      .cs-feed-assist {
        color: rgba(255,255,255,0.55);
        font-weight: 600;
        font-size: 11px;
      }
      .cs-feed-gun {
        height: 14px;
        width: auto;
        max-width: 42px;
        object-fit: contain;
        filter: brightness(0) invert(1);
        opacity: 0.95;
      }
      .cs-feed-gun-fallback {
        font-size: 10px;
        color: rgba(255,255,255,0.7);
        text-transform: uppercase;
      }
      .cs-feed-hs {
        display: inline-flex;
        color: #fff;
        margin: 0 -1px;
      }

      .cs-scoreboard {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px 16px;
        background: rgba(0, 0, 0, 0.42);
        backdrop-filter: blur(3px);
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity 140ms ease, visibility 140ms ease;
        z-index: 6;
      }
      .cs-scoreboard.is-on {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
      }
      .cs-sb-panel {
        width: min(560px, 94vw);
        max-height: min(88vh, 720px);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        background: linear-gradient(180deg, rgba(12, 16, 28, 0.94), rgba(8, 10, 18, 0.96));
        border: 1px solid rgba(255,255,255,0.10);
        border-top: 2px solid rgba(30, 107, 255, 0.75);
        box-shadow: 0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(30, 107, 255, 0.08);
        padding: 12px 14px 10px;
      }
      .cs-sb-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
        flex-shrink: 0;
      }
      .cs-sb-title {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.24em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.55);
        text-shadow: none;
      }
      .cs-sb-hint {
        font-size: 10px;
        font-weight: 650;
        color: rgba(255,255,255,0.32);
        letter-spacing: 0.08em;
        text-shadow: none;
      }
      .cs-sb-rows {
        overflow: hidden;
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-height: 0;
      }
      .cs-sb-head,
      .cs-sb-row {
        display: grid;
        grid-template-columns: 28px 1fr 42px 42px 42px;
        gap: 4px;
        align-items: center;
        padding: 0 10px;
        height: clamp(22px, 3.2vh, 30px);
        flex-shrink: 1;
      }
      .cs-sb-head {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.1em;
        color: rgba(255,255,255,0.38);
        border-bottom: 1px solid rgba(255,255,255,0.08);
        margin-bottom: 4px;
        flex-shrink: 0;
        height: 26px;
        text-shadow: none;
      }
      .cs-sb-row {
        background: rgba(255,255,255,0.035);
        border-left: 2px solid transparent;
      }
      .cs-sb-row:nth-child(odd) {
        background: rgba(255,255,255,0.055);
      }
      .cs-sb-row.is-you {
        background: linear-gradient(90deg, rgba(30, 107, 255, 0.28), rgba(30, 107, 255, 0.08));
        border-left-color: #1e6bff;
        box-shadow: inset 0 0 0 1px rgba(30, 107, 255, 0.2);
      }
      .cs-sb-col {
        text-align: center;
        font-variant-numeric: tabular-nums;
        font-weight: 700;
        font-size: clamp(12px, 1.5vh, 15px);
        line-height: 1;
      }
      .cs-sb-col.rank {
        text-align: center;
        font-size: clamp(10px, 1.3vh, 12px);
        font-weight: 800;
        color: rgba(255,255,255,0.4);
      }
      .cs-sb-row.is-you .cs-sb-col.rank { color: #8eb6ff; }
      .cs-sb-row.team-t { border-left-color: rgba(224,164,74,0.65); }
      .cs-sb-row.team-ct { border-left-color: rgba(90,168,255,0.65); }
      .cs-sb-team {
        display: inline-block;
        min-width: 20px;
        margin-right: 7px;
        font-size: 9px;
        font-style: normal;
        font-weight: 800;
        letter-spacing: 0.1em;
        opacity: 0.85;
      }
      .cs-sb-row.team-t .cs-sb-team { color: #e0a44a; }
      .cs-sb-row.team-ct .cs-sb-team { color: #5aa8ff; }
      .cs-sb-col.name {
        text-align: left;
        font-size: clamp(12px, 1.45vh, 14px);
        font-weight: 650;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .cs-sb-col.name em {
        font-style: normal;
        font-size: 8px;
        font-weight: 800;
        letter-spacing: 0.12em;
        color: #c9a227;
        background: rgba(201, 162, 39, 0.16);
        border: 1px solid rgba(201, 162, 39, 0.35);
        padding: 2px 5px;
        flex-shrink: 0;
      }

      @media (max-height: 700px) {
        .cs-sb-panel { padding: 8px 10px 8px; }
        .cs-sb-head, .cs-sb-row { height: clamp(18px, 2.8vh, 24px); padding: 0 8px; }
        .cs-sb-col { font-size: clamp(11px, 1.4vh, 13px); }
      }
      @media (max-width: 520px) {
        .cs-sb-panel { width: min(96vw, 560px); }
        .cs-sb-head, .cs-sb-row { grid-template-columns: 22px 1fr 34px 34px 34px; }
      }

      #game-hud:not(.is-touch) [data-touch-only] { display: none !important; }
      /* Touch: scale the type down for real instead of transform-scaling a blurry copy */
      #game-hud.is-touch {
        --hud-num: 27px;
        --hud-sub: 15px;
        --hud-bar-w: 62px;
        --hud-icon: 18px;
        --hud-gun: 34px;
        --hud-inset: 12px;
        --hud-lift: 66px;
      }
      @media (pointer: coarse) and (orientation: portrait) {
        #game-hud.is-touch { --hud-lift: 84px; }
      }
      @media (pointer: coarse) and (max-height: 400px) {
        #game-hud.is-touch {
          --hud-num: 23px;
          --hud-sub: 13px;
          --hud-gun: 28px;
          --hud-lift: 54px;
        }
      }

      #game-hud.is-dead .cs-bottom-left,
      #game-hud.is-dead .cs-bottom-right,
      #game-hud.is-dead .cs-hitmarker {
        opacity: 0;
        transition: opacity 220ms ease;
      }

      .cs-death {
        position: absolute;
        inset: 0;
        opacity: 0;
        pointer-events: none;
        transition: opacity 360ms cubic-bezier(0.16, 1, 0.3, 1);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 40;
      }
      .cs-death.is-on { opacity: 1; }

      .cs-death-vignette {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(ellipse 70% 55% at 50% 45%, rgba(12, 20, 40, 0.15) 0%, rgba(8, 10, 18, 0.72) 55%, rgba(0, 0, 0, 0.88) 100%),
          linear-gradient(180deg, rgba(10, 30, 80, 0.35) 0%, transparent 32%, transparent 68%, rgba(0, 0, 0, 0.65) 100%),
          linear-gradient(90deg, rgba(26, 95, 255, 0.08) 0%, transparent 40%, transparent 60%, rgba(201, 162, 39, 0.06) 100%);
      }
      .cs-death-scan {
        position: absolute; inset: 0; pointer-events: none; opacity: 0.35;
        background: repeating-linear-gradient(
          0deg,
          transparent 0 3px,
          rgba(255,255,255,0.015) 3px 4px
        );
        animation: kos-death-scan 8s linear infinite;
      }

      .cs-death-panel {
        position: relative;
        text-align: center;
        padding: 36px 48px 40px;
        min-width: min(340px, 88vw);
        background: linear-gradient(165deg, rgba(14, 18, 32, 0.82), rgba(8, 10, 18, 0.9));
        border: 1px solid rgba(255,255,255,0.08);
        border-left: 3px solid #1a5fff;
        box-shadow:
          0 28px 80px rgba(0, 0, 0, 0.55),
          0 0 0 1px rgba(26, 95, 255, 0.12),
          inset 0 1px 0 rgba(255,255,255,0.06);
        clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px));
        animation: kos-death-in 520ms cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      .cs-death-panel::before {
        content: "";
        position: absolute; top: 0; left: 12%; right: 18%; height: 2px;
        background: linear-gradient(90deg, transparent, #1a5fff 35%, #c9a227 75%, transparent);
        opacity: 0.85;
      }
      .cs-death-panel::after {
        content: "";
        position: absolute; right: 0; top: 18px; bottom: 0; width: 2px;
        background: linear-gradient(180deg, #c9a227, transparent 60%);
        opacity: 0.55;
      }

      .cs-death-brand {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.42em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.35);
        margin-bottom: 18px;
        text-shadow: none;
      }

      .cs-death-kicker {
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.36em;
        text-transform: uppercase;
        color: #c9a227;
        margin-bottom: 10px;
        text-shadow: 0 0 18px rgba(201, 162, 39, 0.35);
      }

      .cs-death-title {
        font-size: clamp(28px, 5vw, 40px);
        font-weight: 800;
        letter-spacing: -0.03em;
        color: #fff;
        line-height: 1.05;
        text-shadow: 0 2px 0 rgba(0,0,0,0.5), 0 0 40px rgba(26, 95, 255, 0.25);
      }

      .cs-death-line {
        width: 72px;
        height: 2px;
        margin: 18px auto 22px;
        background: linear-gradient(90deg, transparent, #1a5fff, #c9a227, transparent);
      }

      .cs-death-timer {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }
      .cs-death-ring {
        --p: 1;
        width: 88px;
        height: 88px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background:
          radial-gradient(circle at center, rgba(8,10,18,0.95) 58%, transparent 59%),
          conic-gradient(from -90deg, #1a5fff calc(var(--p) * 360deg), rgba(255,255,255,0.08) 0);
        box-shadow:
          0 0 0 1px rgba(26, 95, 255, 0.2),
          0 0 28px rgba(26, 95, 255, 0.22);
        transition: background 80ms linear;
      }
      .cs-death-countdown {
        font-size: 26px;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
        color: #fff;
        letter-spacing: -0.02em;
        text-shadow: 0 1px 0 #000;
        line-height: 1;
      }
      .cs-death-sub {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.28em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.45);
        text-shadow: none;
      }

      @keyframes kos-death-in {
        from {
          opacity: 0;
          transform: translateY(18px) scale(0.96);
          filter: blur(4px);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
          filter: blur(0);
        }
      }
      @keyframes kos-death-scan {
        from { background-position: 0 0; }
        to { background-position: 0 40px; }
      }

      /* ---- match status bar ---- */
      .cs-matchbar {
        position: absolute;
        top: max(10px, env(safe-area-inset-top));
        left: 50%;
        transform: translateX(-50%);
        display: none;
        align-items: center;
        gap: 10px;
        padding: 6px 14px;
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(10,14,20,0.72), rgba(10,14,20,0.5));
        border: 1px solid rgba(255,255,255,0.1);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .cs-matchbar.is-on { display: flex; }
      /* Team strip sits under the match bar so both stay legible */
      .cs-teambar {
        position: absolute;
        top: calc(max(10px, env(safe-area-inset-top)) + 42px);
        left: 50%;
        transform: translateX(-50%);
        display: none;
        align-items: center;
        gap: 10px;
        padding: 5px 12px;
        border-radius: 11px;
        background: linear-gradient(180deg, rgba(10,14,20,0.7), rgba(10,14,20,0.46));
        border: 1px solid rgba(255,255,255,0.09);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        font-weight: 800;
        white-space: nowrap;
      }
      .cs-teambar.is-on { display: flex; }
      .cs-teambar-side { display: flex; align-items: center; gap: 6px; opacity: 0.72; }
      .cs-teambar-side.is-you { opacity: 1; }
      .cs-teambar-tag { font-size: 11px; letter-spacing: 0.16em; }
      .cs-teambar-score { font-size: 18px; font-variant-numeric: tabular-nums; color: #fff; }
      .cs-teambar-side.is-t .cs-teambar-tag { color: #e0a44a; }
      .cs-teambar-side.is-ct .cs-teambar-tag { color: #5aa8ff; }
      .cs-teambar-vs { font-size: 10px; letter-spacing: 0.18em; opacity: 0.4; }
      .cs-callout {
        position: absolute;
        top: calc(max(10px, env(safe-area-inset-top)) + 78px);
        left: 50%;
        transform: translateX(-50%);
        display: none;
        padding: 3px 10px;
        border-radius: 8px;
        font: 700 11px Outfit, Segoe UI, sans-serif;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.78);
        background: rgba(8,12,20,0.42);
        border: 1px solid rgba(255,255,255,0.08);
        pointer-events: none;
        white-space: nowrap;
      }
      .cs-callout.is-on { display: block; }
      .cs-teambar.is-on ~ .cs-callout { top: calc(max(10px, env(safe-area-inset-top)) + 86px); }
      .cs-round-banner {
        position: absolute;
        top: 42%;
        left: 50%;
        transform: translate(-50%, -50%);
        display: none;
        padding: 10px 22px;
        border-radius: 12px;
        font: 800 18px Outfit, Segoe UI, sans-serif;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #fff;
        background: rgba(8,12,20,0.55);
        border: 1px solid rgba(255,255,255,0.12);
        pointer-events: none;
        white-space: nowrap;
        text-shadow: 0 2px 8px #000;
      }
      .cs-round-banner.is-on { display: block; }
      .cs-spectate {
        position: absolute;
        bottom: calc(88px + env(safe-area-inset-bottom));
        left: 50%;
        transform: translateX(-50%);
        display: none;
        padding: 5px 12px;
        border-radius: 8px;
        font: 700 12px Outfit, Segoe UI, sans-serif;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.85);
        background: rgba(8,12,20,0.5);
        border: 1px solid rgba(255,255,255,0.1);
        pointer-events: none;
      }
      .cs-spectate.is-on { display: block; }
      .cs-matchbar.is-close { border-color: rgba(255,170,60,0.5); }
      .cs-matchbar-score { display: flex; align-items: baseline; gap: 3px; }
      .cs-matchbar-you { font-size: 19px; color: #fff; }
      .cs-matchbar-slash { font-size: 13px; opacity: 0.45; }
      .cs-matchbar-goal { font-size: 13px; opacity: 0.7; }
      .cs-matchbar.no-goal .cs-matchbar-slash,
      .cs-matchbar.no-goal .cs-matchbar-goal { display: none; }
      .cs-matchbar-sep { width: 1px; height: 16px; background: rgba(255,255,255,0.16); }
      .cs-matchbar-clock { font-size: 15px; font-variant-numeric: tabular-nums; opacity: 0.9; }
      .cs-matchbar-clock.is-urgent { color: #ff8f5e; animation: kos-clock-pulse 1s ease-in-out infinite; }
      .cs-matchbar-lead {
        display: none;
        font-size: 12px;
        padding: 1px 7px;
        border-radius: 999px;
        background: rgba(255,120,90,0.2);
        color: #ffb9a4;
      }
      .cs-matchbar-lead.is-on { display: block; }
      @keyframes kos-clock-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }

      /* ---- match results ---- */
      .cs-result {
        position: fixed;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: radial-gradient(120% 90% at 50% 0%, rgba(12,18,28,0.86), rgba(4,6,10,0.95));
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        pointer-events: auto;
        z-index: 60;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }
      .cs-result.is-on { display: flex; }
      .cs-result-panel {
        width: min(560px, 100%);
        max-height: 100%;
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 22px;
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(20,26,36,0.96), rgba(12,16,24,0.96));
        border: 1px solid rgba(255,255,255,0.1);
        box-shadow: 0 24px 70px rgba(0,0,0,0.6);
        animation: kos-result-in 0.3s cubic-bezier(0.2,0.8,0.3,1) both;
      }
      @keyframes kos-result-in {
        from { opacity: 0; transform: translateY(14px) scale(0.98); }
        to { opacity: 1; transform: none; }
      }
      .cs-result-kicker {
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        opacity: 0.55;
      }
      .cs-result-title { font-size: 38px; font-weight: 800; line-height: 1; }
      .cs-result-title.is-win {
        background: linear-gradient(180deg, #ffe08a, #ffb038);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
      .cs-result-sub { font-size: 13px; opacity: 0.7; margin-top: -6px; }
      .cs-result-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(74px, 1fr));
        gap: 8px;
      }
      .cs-result-stat {
        padding: 9px 6px;
        border-radius: 10px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.06);
        text-align: center;
      }
      .cs-result-stat-v { font-size: 19px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .cs-result-stat-l { font-size: 10px; opacity: 0.55; text-transform: uppercase; letter-spacing: 0.06em; }
      .cs-result-board {
        border-radius: 12px;
        background: rgba(0,0,0,0.28);
        border: 1px solid rgba(255,255,255,0.06);
        overflow: hidden;
      }
      .cs-result-head, .cs-result-row {
        display: grid;
        grid-template-columns: 28px 1fr 40px 40px 40px;
        align-items: center;
        gap: 6px;
        padding: 7px 12px;
        font-size: 13px;
      }
      .cs-result-head {
        font-size: 10px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        opacity: 0.45;
        border-bottom: 1px solid rgba(255,255,255,0.07);
      }
      .cs-result-rows { max-height: 190px; overflow-y: auto; -webkit-overflow-scrolling: touch; }
      .cs-result-row + .cs-result-row { border-top: 1px solid rgba(255,255,255,0.04); }
      .cs-result-row.is-you { background: rgba(90,160,255,0.14); font-weight: 700; }
      .cs-result-row.is-top .rank { color: #ffc55c; }
      .cs-result-row .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cs-result-career {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px 14px;
        padding-top: 4px;
        border-top: 1px solid rgba(255,255,255,0.07);
      }
      .cs-result-career-title {
        width: 100%;
        font-size: 10px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        opacity: 0.45;
      }
      .cs-result-career-bit { display: flex; align-items: baseline; gap: 5px; font-size: 12px; }
      .cs-result-career-bit b { font-size: 15px; font-variant-numeric: tabular-nums; }
      .cs-result-career-bit span { opacity: 0.55; }
      .cs-result-actions { display: flex; gap: 10px; }
      .cs-result-btn {
        flex: 1;
        padding: 12px 16px;
        border-radius: 11px;
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(255,255,255,0.06);
        color: #fff;
        font-family: inherit;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.12s ease, background 0.15s ease;
      }
      .cs-result-btn:hover { background: rgba(255,255,255,0.12); }
      .cs-result-btn:active { transform: scale(0.98); }
      .cs-result-btn.is-primary {
        background: linear-gradient(180deg, #4d8dff, #2f6ae0);
        border-color: rgba(140,180,255,0.5);
      }
      .cs-result-btn.is-primary:hover { background: linear-gradient(180deg, #5f9bff, #3b78f0); }

      @media (max-width: 560px), (max-height: 460px) {
        .cs-result-panel { padding: 16px; gap: 11px; border-radius: 14px; }
        .cs-result-title { font-size: 28px; }
        .cs-result-stats { grid-template-columns: repeat(auto-fit, minmax(62px, 1fr)); gap: 6px; }
        .cs-result-stat { padding: 7px 4px; }
        .cs-result-stat-v { font-size: 16px; }
        .cs-result-rows { max-height: 132px; }
        .cs-matchbar { padding: 4px 11px; gap: 8px; }
        .cs-matchbar-you { font-size: 16px; }
        .cs-matchbar-clock { font-size: 13px; }
        .cs-teambar { padding: 3px 9px; gap: 7px; top: calc(max(10px, env(safe-area-inset-top)) + 34px); }
        .cs-teambar-score { font-size: 15px; }
      }
    `
