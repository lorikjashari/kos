/** CS 1.6 green/yellow HUD skin (640×480 reference layout). */
export const CS_GREEN_HUD_CSS = `
  #game-hud.hud-cs-green {
    --cs-scale: min(100vw / 640, 100vh / 480);
    font-family: Tahoma, "Arial Narrow", Arial, sans-serif;
  }

  #game-hud.hud-cs-green .kos-brand { display: none; }

  #game-hud.hud-cs-green .cs-vital-icon,
  #game-hud.hud-cs-green .cs-vital-bar,
  #game-hud.hud-cs-green .cs-vital-fill,
  #game-hud.hud-cs-green .cs-ammo-bar,
  #game-hud.hud-cs-green .cs-ammo-fill,
  #game-hud.hud-cs-green .cs-ammo-sep,
  #game-hud.hud-cs-green .cs-vital-num,
  #game-hud.hud-cs-green .cs-ammo-mag,
  #game-hud.hud-cs-green .cs-ammo-reserve {
    visibility: hidden !important;
    position: absolute !important;
    width: 0 !important;
    height: 0 !important;
    overflow: hidden !important;
  }

  #game-hud.hud-cs-green .cs-bottom-left,
  #game-hud.hud-cs-green .cs-bottom-right {
    background: none;
    border: none;
    box-shadow: none;
    padding: 0;
    pointer-events: none;
  }

  #game-hud.hud-cs-green .cs-hud-sprites {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  #game-hud.hud-cs-green .cs-spr-icon,
  #game-hud.hud-cs-green .cs-spr-digit,
  #game-hud.hud-cs-green .cs-spr-divider {
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    background-repeat: no-repeat;
    display: block;
    flex-shrink: 0;
    background-size: calc(256px * var(--cs-scale)) calc(256px * var(--cs-scale));
    background-position: calc(-1px * var(--spr-x, 0) * var(--cs-scale)) calc(-1px * var(--spr-y, 0) * var(--cs-scale));
  }

  #game-hud.hud-cs-green .cs-spr-digits {
    display: flex;
    flex-direction: row;
    align-items: flex-end;
    line-height: 0;
  }

  #game-hud.hud-cs-green .cs-spr-digit {
    width: calc(20px * var(--cs-scale));
    height: calc(24px * var(--cs-scale));
  }

  /* Health: cross + digits + orange bar (health.cpp layout) */
  #game-hud.hud-cs-green .cs-hud-health {
    position: absolute;
    left: calc(env(safe-area-inset-left));
    bottom: calc(12px * var(--cs-scale) + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: row;
    align-items: flex-end;
    gap: 0;
  }

  #game-hud.hud-cs-green .cs-spr-cross {
    width: calc(32px * var(--cs-scale));
    height: calc(32px * var(--cs-scale));
    margin-left: calc(16px * var(--cs-scale));
    margin-bottom: calc(2px * var(--cs-scale));
  }

  #game-hud.hud-cs-green .cs-hp-digits {
    margin-left: calc(2px * var(--cs-scale));
    margin-bottom: calc(5px * var(--cs-scale));
  }

  #game-hud.hud-cs-green .cs-spr-hp-bar {
    width: calc(2px * var(--cs-scale));
    height: calc(24px * var(--cs-scale));
    margin-left: calc(2px * var(--cs-scale));
    margin-bottom: calc(5px * var(--cs-scale));
    opacity: 0.85;
  }

  #game-hud.hud-cs-green .cs-hp-digits.is-low .cs-spr-digit,
  #game-hud.hud-cs-green .cs-ammo-mag-digits.is-low .cs-spr-digit {
    filter: brightness(1.1) sepia(1) saturate(6) hue-rotate(-45deg);
  }

  /* Armor: suit icon + digits (battery.cpp — x = 3× suit width) */
  #game-hud.hud-cs-green .cs-hud-armor {
    position: absolute;
    left: calc(env(safe-area-inset-left));
    bottom: calc(12px * var(--cs-scale) + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: row;
    align-items: flex-end;
    margin-left: calc(120px * var(--cs-scale));
    opacity: 0;
    visibility: hidden;
    transition: opacity 120ms ease;
  }

  #game-hud.hud-cs-green .cs-hud-armor.is-on {
    opacity: 1;
    visibility: visible;
  }

  #game-hud.hud-cs-green .cs-spr-suit {
    width: calc(40px * var(--cs-scale));
    height: calc(40px * var(--cs-scale));
    margin-bottom: calc(-2px * var(--cs-scale));
  }

  #game-hud.hud-cs-green .cs-armor-digits {
    margin-left: calc(2px * var(--cs-scale));
    margin-bottom: calc(5px * var(--cs-scale));
  }

  /* Ammo: mag | reserve (ammo.cpp — right-aligned) */
  #game-hud.hud-cs-green .cs-hud-ammo {
    position: absolute;
    right: calc(72px * var(--cs-scale) + env(safe-area-inset-right));
    bottom: calc(12px * var(--cs-scale) + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: row;
    align-items: flex-end;
    gap: calc(2px * var(--cs-scale));
  }

  #game-hud.hud-cs-green .cs-ammo-mag-digits,
  #game-hud.hud-cs-green .cs-ammo-res-digits {
    margin-bottom: calc(5px * var(--cs-scale));
  }

  #game-hud.hud-cs-green .cs-spr-divider {
    width: calc(2px * var(--cs-scale));
    height: calc(24px * var(--cs-scale));
    margin-bottom: calc(5px * var(--cs-scale));
  }

  #game-hud.hud-cs-green .cs-spr-divider.is-hidden {
    display: none;
  }

  #game-hud.hud-cs-green .cs-bottom-right {
    position: absolute;
    right: calc(env(safe-area-inset-right));
    bottom: calc(8px * var(--cs-scale) + env(safe-area-inset-bottom));
    align-items: flex-end;
  }

  #game-hud.hud-cs-green .cs-weapon-row {
    margin-bottom: calc(28px * var(--cs-scale));
    gap: calc(4px * var(--cs-scale));
  }

  #game-hud.hud-cs-green .cs-weapon-icon,
  #game-hud.hud-cs-green .cs-knife-icon {
    image-rendering: pixelated;
    filter: drop-shadow(1px 1px 0 #000);
    height: calc(16px * var(--cs-scale));
    width: auto;
  }
`
