import { DEFAULT_MATCH_LENGTH, MATCH_LENGTHS, type MatchLength } from '../Core/MatchStats'
import { DEFAULT_TEAM_SIZE, MAX_TEAM_SIZE, MIN_TEAM_SIZE } from '../Core/Teams'

export function buildMainMenuHtml(): string {
  return `
      <div class="kos-bg" aria-hidden="true">
        <img class="kos-bg-art" src="/mainmenubackground.jpg" alt="" draggable="false" />
        <div class="kos-bg-veil"></div>
        <div class="kos-bg-vignette"></div>
      </div>

      <section class="kos-screen is-active" data-screen="loading">
        <div class="kos-load">
          <div class="kos-load-mark" aria-hidden="true"></div>
          <img class="kos-logo kos-logo-load" src="/logo.png" alt="KoS FPS Shooting" width="420" height="420" />
          <div class="kos-load-wrap">
            <div class="kos-load-track" aria-hidden="true"><div class="kos-load-fill"></div></div>
            <div class="kos-load-meta">
              <p class="kos-load-label">Loading…</p>
              <p class="kos-load-pct" id="kos-load-pct">0%</p>
            </div>
            <p class="kos-load-error" hidden></p>
          </div>
        </div>
      </section>

      <section class="kos-screen" data-screen="main">
        <div class="kos-shell kos-shell-main">
          <div class="kos-main-col">
            <header class="kos-brand">
              <img class="kos-logo kos-logo-hero" src="/logo.png" alt="KoS FPS Shooting" width="640" height="640" />
              <p class="kos-tagline">Browser FPS · bots &amp; friends</p>
            </header>

            <div class="kos-menu-rail">
              <label class="kos-field">
                <span>Your Name</span>
                <input id="kos-name" type="text" maxlength="24" placeholder="Enter name" autocomplete="off" spellcheck="false" />
              </label>

              <nav class="kos-nav">
                <button type="button" class="kos-btn kos-btn-primary" data-action="bots">
                  <span class="kos-btn-label">Play with Bots</span>
                </button>
                <button type="button" class="kos-btn kos-btn-ghost-line" data-action="mp">
                  <span class="kos-btn-label">Multiplayer</span>
                </button>
                <button type="button" class="kos-btn kos-btn-ghost-line" data-action="settings">
                  <span class="kos-btn-label">Settings</span>
                </button>
              </nav>

              <div class="kos-career" id="kos-career" hidden></div>

              <p class="kos-legal">
                Independent prototype — not affiliated with Valve.
                <a href="/LEGAL.md" target="_blank" rel="noopener noreferrer">Legal notes</a>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section class="kos-screen" data-screen="mp">
        <div class="kos-shell kos-shell-sub kos-shell-panel">
          <div class="kos-panel-chrome">
            <div class="kos-panel-bar">
              <button type="button" class="kos-back" data-action="back-main">← Back</button>
              <div class="kos-panel-brand">
                <img class="kos-logo kos-logo-sm" src="/logo.png" alt="KoS" width="180" height="180" />
                <h2 class="kos-heading">Multiplayer</h2>
              </div>
            </div>
          </div>
          <div class="kos-panel-body">
            <div class="kos-mset">
              <div class="kos-mset-card">
                <div class="kos-mset-head">
                  <strong>Open rooms</strong>
                  <em>Tap a room to join</em>
                </div>
                <div class="kos-mp-rooms" id="kos-mp-rooms">
                  <div class="kos-mp-rooms-empty" id="kos-mp-rooms-empty">Looking for rooms…</div>
                </div>
              </div>

              <div class="kos-mset-card">
                <div class="kos-mset-head">
                  <strong>Create room</strong>
                  <em>Host picks the map</em>
                </div>
                <div class="kos-section-label">Map</div>
                <div class="kos-chip-row" id="kos-mp-map">
                  <button type="button" class="kos-chip is-on" data-mp-map="pool_day">Pool Day</button>
                  <button type="button" class="kos-chip" data-mp-map="de_dust2">Dust II</button>
                </div>
                <label class="kos-field kos-field-inline">
                  <span>Bots</span>
                  <input id="kos-mp-bot-count" type="number" min="0" max="10" step="1" value="10" inputmode="numeric" />
                </label>
                <div class="kos-chip-row" id="kos-mp-diff">
                  <button type="button" class="kos-chip" data-mp-diff="easy">Easy</button>
                  <button type="button" class="kos-chip is-on" data-mp-diff="medium">Medium</button>
                  <button type="button" class="kos-chip" data-mp-diff="hard">Hard</button>
                </div>
                <div class="kos-chip-row" id="kos-mp-team">
                  <button type="button" class="kos-chip is-on" data-team="coop">Team up</button>
                  <button type="button" class="kos-chip" data-team="ffa">Free-for-all</button>
                  <button type="button" class="kos-chip" data-team="teams">T vs CT</button>
                </div>
                <p class="kos-hint tight-left" id="kos-team-hint">Everyone who joins fights the bots with you.</p>
                <div class="kos-team-setup" id="kos-mp-team-setup" hidden>
                  <div class="kos-section-label">Your side</div>
                  <div class="kos-chip-row" id="kos-mp-side">
                    <button type="button" class="kos-chip" data-mp-side="T">Terrorists</button>
                    <button type="button" class="kos-chip is-on" data-mp-side="CT">Counter-Terrorists</button>
                  </div>
                  <label class="kos-field kos-field-inline">
                    <span>Players per side</span>
                    <input id="kos-mp-team-size" type="number" min="${MIN_TEAM_SIZE}" max="${MAX_TEAM_SIZE}" step="1" value="${DEFAULT_TEAM_SIZE}" inputmode="numeric" />
                  </label>
                  <p class="kos-hint tight-left">Joiners are balanced across sides; bots fill the rest. Up to 10v10.</p>
</div>
                <button type="button" class="kos-btn kos-btn-primary kos-start" data-action="mp-host">
                  <span class="kos-btn-label">Create Room</span>
                </button>
              </div>

              <div class="kos-mset-card">
                <div class="kos-mset-head">
                  <strong>Join with code</strong>
                  <em>Enter a room code</em>
                </div>
                <label class="kos-field">
                  <input id="kos-mp-code" type="text" maxlength="8" placeholder="Room code" autocomplete="off" spellcheck="false" style="text-transform:uppercase;letter-spacing:0.14em;font-weight:800" />
                </label>
                <button type="button" class="kos-btn kos-btn-ghost-line kos-start" data-action="mp-join">
                  <span class="kos-btn-label">Join</span>
                </button>
                <p class="kos-hint" id="kos-mp-status"></p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="kos-screen" data-screen="bots">
        <div class="kos-shell kos-shell-sub kos-shell-panel">
          <div class="kos-panel-chrome">
            <div class="kos-panel-bar">
              <button type="button" class="kos-back" data-action="back-main">← Back</button>
              <div class="kos-panel-brand">
                <img class="kos-logo kos-logo-sm" src="/logo.png" alt="KoS" width="180" height="180" />
                <h2 class="kos-heading">Play with Bots</h2>
              </div>
            </div>
          </div>
          <div class="kos-panel-body">
            <div class="kos-mset">
              <div class="kos-mset-card">
                <div class="kos-mset-head">
                  <strong>Map</strong>
                  <em id="kos-map-hint">Classic pool arena — bots ready.</em>
                </div>
                <div class="kos-chip-row" id="kos-map">
                  <button type="button" class="kos-chip is-on" data-map="pool_day">Pool Day</button>
                  <button type="button" class="kos-chip" data-map="de_dust2">Dust II</button>
                </div>
              </div>

              <div class="kos-mset-card" id="kos-mode-card">
                <div class="kos-mset-head">
                  <strong>Game mode</strong>
                  <em id="kos-mode-hint">Free-for-all — everyone for themselves.</em>
                </div>
                <div class="kos-chip-row" id="kos-mode">
                  <button type="button" class="kos-chip is-on" data-mode="ffa">Deathmatch</button>
                  <button type="button" class="kos-chip" data-mode="teams">Team Deathmatch</button>
</div>
                <p class="kos-hint tight-left" id="kos-mode-note">Team Deathmatch needs Dust II.</p>
                <div class="kos-team-setup" id="kos-team-setup" hidden>
                  <div class="kos-section-label">Your side</div>
                  <div class="kos-chip-row" id="kos-side">
                    <button type="button" class="kos-chip" data-side="T">Terrorists</button>
                    <button type="button" class="kos-chip is-on" data-side="CT">Counter-Terrorists</button>
                  </div>
                  <label class="kos-field kos-field-inline">
                    <span>Players per side</span>
                    <input id="kos-team-size" type="number" min="${MIN_TEAM_SIZE}" max="${MAX_TEAM_SIZE}" step="1" value="${DEFAULT_TEAM_SIZE}" inputmode="numeric" />
                  </label>
                  <p class="kos-hint tight-left" id="kos-team-hint-bots">5v5 — bots fill every empty slot. Teammates get a faint outline.</p>
</div>
              </div>

              <div class="kos-mset-card">
                <div class="kos-mset-head">
                  <strong>Match setup</strong>
                  <em>Difficulty and bot count</em>
                </div>
                <div class="kos-section-label">Difficulty</div>
                <div class="kos-chip-row" id="kos-diff">
                  <button type="button" class="kos-chip" data-diff="easy">Easy</button>
                  <button type="button" class="kos-chip is-on" data-diff="medium">Medium</button>
                  <button type="button" class="kos-chip" data-diff="hard">Hard</button>
                </div>
                <label class="kos-field kos-field-inline" id="kos-bot-count-row">
                  <span>How many bots</span>
                  <input id="kos-bot-count" type="number" min="0" max="10" step="1" value="5" inputmode="numeric" />
                </label>
                <p class="kos-hint tight-left" id="kos-bot-count-hint">Type any amount (0–10).</p>
                <div class="kos-section-label">Match length</div>
                <div class="kos-chip-row" id="kos-length">
                  ${(Object.keys(MATCH_LENGTHS) as MatchLength[])
                    .map(
                      (key) =>
                        `<button type="button" class="kos-chip${
                          key === DEFAULT_MATCH_LENGTH ? ' is-on' : ''
                        }" data-length="${key}">${MATCH_LENGTHS[key].label}</button>`
                    )
                    .join('')}
                </div>
                <p class="kos-hint tight-left" id="kos-length-hint">${MATCH_LENGTHS[DEFAULT_MATCH_LENGTH].hint}</p>
                <label class="kos-check kos-match-opt">
                  <input id="kos-refill-kill" type="checkbox" />
                  <span>
                    <strong>Refill ammo on kill</strong>
                    <em>After each kill, mag goes full instantly (e.g. 30)</em>
                  </span>
                </label>
              </div>

              <button type="button" class="kos-btn kos-btn-primary kos-start" data-action="start-bots">
                <span class="kos-btn-label">Start Match</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="kos-screen" data-screen="settings">
        <div class="kos-shell kos-shell-sub kos-shell-settings kos-shell-panel">
          <div class="kos-panel-chrome">
            <div class="kos-panel-bar">
              <button type="button" class="kos-back" data-action="back-main">← Back</button>
              <div class="kos-panel-brand">
                <img class="kos-logo kos-logo-sm" src="/logo.png" alt="KoS" width="180" height="180" />
                <h2 class="kos-heading">Settings</h2>
              </div>
            </div>
            <div class="kos-tabs" role="tablist">
              <button type="button" class="kos-tab is-on" data-tab="video">Video</button>
              <button type="button" class="kos-tab" data-tab="crosshair">Crosshair</button>
              <button type="button" class="kos-tab" data-tab="keybinds" data-desktop-only>Keybinds</button>
              <button type="button" class="kos-tab" data-tab="mobile" data-mobile-only>Mobile</button>
            </div>
          </div>

          <div class="kos-panel-body">
          <div class="kos-tab-panel is-on" data-panel="video">
            <div class="kos-mset">
              <div class="kos-mset-card" data-desktop-only>
                <div class="kos-mset-head">
                  <strong>Resolution</strong>
                  <em>Stretched to fill your screen (CS-style)</em>
                </div>
                <p class="kos-hint tight" id="kos-res-active">Active: 1280×960</p>
                <div class="kos-res-groups" id="kos-res-groups"></div>
              </div>
              <div class="kos-mset-card" data-desktop-only>
                <div class="kos-mset-head">
                  <strong>Graphics</strong>
                  <em>Quality preset</em>
                </div>
                <div class="kos-chip-row" id="kos-gfx-row">
                  <button type="button" class="kos-chip" data-gfx="low">Low</button>
                  <button type="button" class="kos-chip" data-gfx="medium">Medium</button>
                  <button type="button" class="kos-chip" data-gfx="high">High</button>
                </div>
              </div>
              <div class="kos-mset-card" data-mobile-only>
                <div class="kos-mset-head">
                  <strong>Resolution</strong>
                  <em>Render aspect</em>
                </div>
                <div class="kos-chip-row" id="kos-mres-row">
                  <button type="button" class="kos-chip" data-mres="normal">Normal</button>
                  <button type="button" class="kos-chip" data-mres="4:3">4:3</button>
                </div>
                <div class="kos-chip-row" id="kos-mres43-row" hidden>
                  <button type="button" class="kos-chip" data-mres43="1280x960">1280×960</button>
                  <button type="button" class="kos-chip" data-mres43="1440x1080">1440×1080</button>
                </div>
                <p class="kos-hint tight" id="kos-mres-hint">Normal — your screen's native aspect.</p>
              </div>
              <div class="kos-mset-card" data-desktop-only>
                <div class="kos-mset-head">
                  <strong>Frame rate</strong>
                  <em id="kos-fps-hint">Auto matches your display refresh.</em>
                </div>
                <div class="kos-chip-row" id="kos-fps-row">
                  <button type="button" class="kos-chip" data-fps="0">Auto</button>
                  <button type="button" class="kos-chip" data-fps="60">60</button>
                  <button type="button" class="kos-chip" data-fps="120">120</button>
                  <button type="button" class="kos-chip" data-fps="144">144</button>
                  <button type="button" class="kos-chip" data-fps="999">Unlimited</button>
                </div>
              </div>
              <div class="kos-mset-card" data-mobile-only>
                <div class="kos-mset-head">
                  <strong>Frame rate</strong>
                  <em id="kos-mfps-hint">Runs at your display's maximum refresh.</em>
                </div>
                <p class="kos-hint tight">Uncapped — Performance in the Mobile tab controls smoothness.</p>
              </div>
            </div>
          </div>

          <div class="kos-tab-panel" data-panel="crosshair">
            <div class="kos-mset">
              <div class="kos-mset-card kos-xhair-card">
                <div class="kos-xhair-preview-wrap">
                  <canvas id="kos-xhair-preview" width="120" height="120"></canvas>
                  <p class="kos-hint tight">Live preview</p>
                </div>
                <div class="kos-xhair-controls" id="kos-xhair-controls"></div>
                <button type="button" class="kos-btn kos-btn-ghost" data-action="reset-xhair">Reset Crosshair</button>
              </div>
            </div>
          </div>

          <div class="kos-tab-panel" data-panel="keybinds" data-desktop-only>
            <p class="kos-hint">Click a bind, then press a new key. Esc cancels.</p>
            <label class="kos-slider kos-sens-slider">
              <span>Mouse Sensitivity<em id="kos-sens-val">3</em></span>
              <input id="kos-sensitivity" type="range" min="0.1" max="10" step="0.05" value="3" />
            </label>
            <label class="kos-check kos-match-opt">
              <input id="kos-jump-wheel" type="checkbox" />
              <span>
                <strong>Jump with mouse wheel</strong>
                <em>Scroll up or down to jump (CS-style)</em>
              </span>
            </label>
            <div class="kos-bind-list" id="kos-bind-list"></div>
            <button type="button" class="kos-btn kos-btn-ghost" data-action="reset-binds">Reset Keybinds</button>
          </div>

          <div class="kos-tab-panel" data-panel="mobile" data-mobile-only>
            <div class="kos-mset">
              <div class="kos-mset-card">
                <div class="kos-mset-head">
                  <strong>Performance</strong>
                  <em>Detail vs. framerate — resolution lives in Video</em>
                </div>
                <div class="kos-seg" data-seg="perfProfile">
                  <button type="button" data-perf="smooth">Smooth</button>
                  <button type="button" data-perf="balanced">Balanced</button>
                  <button type="button" data-perf="quality">Quality</button>
                </div>
                <p class="kos-hint">Smooth = oldest phones / Dust II. Balanced = default. Quality = post + particles.</p>
              </div>

              <div class="kos-mset-card">
                <div class="kos-mset-head">
                  <strong>Touch look</strong>
                  <em>Drag empty space to aim</em>
                </div>
                <label class="kos-slider">
                  <span>Look sensitivity<em id="kos-mobile-look-val">1.15</em></span>
                  <input id="kos-mobile-look" type="range" min="0.2" max="3" step="0.05" value="1.15" />
                </label>
                <label class="kos-slider">
                  <span>Stick deadzone<em id="kos-mobile-dead-val">0.18</em></span>
                  <input id="kos-mobile-dead" type="range" min="0.05" max="0.45" step="0.01" value="0.18" />
                </label>
                <label class="kos-check kos-match-opt">
                  <input id="kos-mobile-enabled" type="checkbox" />
                  <span>
                    <strong>On-screen controls</strong>
                    <em>Joystick + action buttons</em>
                  </span>
                </label>
              </div>

              <div class="kos-mset-card">
                <div class="kos-mset-head">
                  <strong>Crouch</strong>
                  <em>Hold or tap-toggle</em>
                </div>
                <div class="kos-seg" data-seg="crouchMode">
                  <button type="button" data-hold="hold">Hold</button>
                  <button type="button" data-hold="toggle">Toggle</button>
                </div>
              </div>

              <div class="kos-mset-card">
                <div class="kos-mset-head">
                  <strong>Lean / tilt</strong>
                  <em>Hold or tap-toggle left & right</em>
                </div>
                <div class="kos-seg" data-seg="leanMode">
                  <button type="button" data-hold="hold">Hold</button>
                  <button type="button" data-hold="toggle">Toggle</button>
                </div>
              </div>

              <div class="kos-mset-card">
                <div class="kos-mset-head">
                  <strong>Button layout</strong>
                  <em>Standoff-style drag editor</em>
                </div>
                <div class="kos-mobile-editor-actions">
                  <button type="button" class="kos-btn kos-btn-primary" data-action="edit-mobile-layout">Edit Layout</button>
                  <button type="button" class="kos-btn kos-btn-ghost" data-action="reset-mobile-layout">Reset</button>
                </div>
                <div class="kos-mobile-list" id="kos-mobile-list"></div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </section>

      <div class="kos-mobile-dock" id="kos-mobile-slot-panel" hidden>
        <div class="kos-mobile-dock-grip" data-dock-drag="1">
          <span class="kos-mobile-dock-bars"></span>
          <em>Drag</em>
        </div>
        <div class="kos-mobile-dock-top">
          <strong id="kos-mobile-slot-name">—</strong>
          <button type="button" class="kos-mobile-done" data-action="done-mobile-layout">Done</button>
        </div>
        <label class="kos-slider kos-mobile-dock-slider">
          <span>Size<em id="kos-mobile-size-val">1</em></span>
          <input id="kos-mobile-size" type="range" min="0.55" max="1.8" step="0.05" value="1" />
        </label>
        <label class="kos-slider kos-mobile-dock-slider">
          <span>Opacity<em id="kos-mobile-opacity-val">0.6</em></span>
          <input id="kos-mobile-opacity" type="range" min="0.15" max="1" step="0.05" value="0.6" />
        </label>
        <label class="kos-check kos-mobile-dock-check">
          <input id="kos-mobile-visible" type="checkbox" checked />
          <span>Visible</span>
        </label>
      </div>
    `
}

export const MAIN_MENU_HTML = buildMainMenuHtml()
