import { Game } from './Game'
import { initializeAmmo } from './Physics/Ammo'
import { MainMenu } from './UI/MainMenu'
import { MobileControls } from './UI/MobileControls'
import { PwaInstall } from './UI/PwaInstall'
import { loadSettings, saveSettings } from './UI/SettingsStore'
import { isTouchDevice, mountLandscapeHint } from './UI/MobileDevice'
import { probeRefreshRate, supportsHighRefresh } from './UI/DisplayRefresh'
import { installTouchGuard } from './Input/TouchGuard'
import { installGlobalErrorHandlers, recordTelemetry, showToast } from './UI/Toast'
import {
  hasAutoPerfApplied,
  markAutoPerfApplied,
  PERF_PRESET_DOCS,
  probeDevicePerf,
} from './UI/DevicePerf'
import { mountFirstRunTips } from './UI/FirstRunTips'

async function main() {
  installGlobalErrorHandlers()
  if (isTouchDevice()) installTouchGuard(document)

  const pwa = new PwaInstall()
  await pwa.register()

  const menu = new MainMenu({
    onPlayBots: (config) => {
      if (pwa.requiresInstall()) {
        pwa.mount()
        return
      }
      const game = Game.getInstance()
      game.audioManager.stopMenuMusic()
      void (async () => {
        const mapId = config.mapId === 'de_dust2' ? 'de_dust2' : 'pool_day'
        const mapLabel = mapId === 'de_dust2' ? 'Dust II' : 'Pool Day'
        try {
          menu.showMatchLoading('Loading weapons…', 12)
          await game.audioManager.unlock()
          menu.setLoadingProgress('Loading weapons…', 28)
          await game.reloadCombatMeshes()
          menu.setLoadingProgress(`Loading ${mapLabel}…`, 52)
          await game.ensureMap(mapId)
          menu.setLoadingProgress('Preparing match…', 82)
          await game.prepareCombat()
          menu.setLoadingProgress('Starting…', 100)
          menu.hide()
          game.startBotMatch(config)
        } catch (error) {
          console.error(error)
          game.audioManager.stopMenuMusic()
          void game.audioManager.startMenuMusic()
          menu.show()
          menu.showScreen('bots')
          const msg = error instanceof Error ? error.message : 'Failed to start match.'
          showToast(msg, 'error')
          recordTelemetry('match_start_fail', { message: msg.slice(0, 160) })
        }
      })()
    },
    onPlayMultiplayer: (config) => {
      if (pwa.requiresInstall()) {
        pwa.mount()
        return
      }
      const game = Game.getInstance()
      game.audioManager.stopMenuMusic()
      void (async () => {
        const mapId = config.mapId === 'de_dust2' ? 'de_dust2' : 'pool_day'
        const mapLabel = mapId === 'de_dust2' ? 'Dust II' : 'Pool Day'
        try {
          menu.showMatchLoading(
            config.mode === 'host' ? `Opening room on ${mapLabel}…` : `Connecting (${mapLabel})…`,
            12
          )
          menu.setMultiplayerStatus(config.mode === 'host' ? 'Opening room…' : 'Connecting…')
          await game.audioManager.unlock()
          menu.setLoadingProgress('Loading weapons…', 30)
          await game.reloadCombatMeshes()
          menu.setLoadingProgress(`Loading ${mapLabel}…`, 55)
          await game.ensureMap(mapId)
          menu.setLoadingProgress('Preparing match…', 78)
          await game.prepareCombat()
          menu.setLoadingProgress(config.mode === 'host' ? 'Creating room…' : 'Joining room…', 92)
          menu.hide()
          const code = await game.startMultiplayerMatch({
            mode: config.mode,
            roomCode: config.roomCode,
            playerName: config.playerName,
            difficulty: config.difficulty,
            botCount: config.botCount,
            matchLength: config.matchLength,
            teamMode: config.teamMode,
            mapId,
            teamPlay: config.teamPlay,
            playerTeam: config.playerTeam,
            teamSize: config.teamSize,
          })
          menu.setMultiplayerStatus(config.mode === 'host' ? `Room ${code}` : `Joined ${code}`)
        } catch (error) {
          console.error(error)
          game.multiplayer?.stop()
          game.multiplayer = null
          game.audioManager.stopMenuMusic()
          void game.audioManager.startMenuMusic()
          menu.show()
          menu.showScreen('mp')
          const msg = error instanceof Error ? error.message : 'Multiplayer failed.'
          menu.setMultiplayerStatus(msg)
          showToast(msg, 'error')
          recordTelemetry('mp_start_fail', { message: msg.slice(0, 160) })
        }
      })()
    },
    onSettingsChanged: (settings) => {
      const game = Game.getInstance()
      game.inputManager.applyKeybinds(settings.keybinds)
      game.inputManager.setJumpWithScrollWheel(settings.jumpWithScrollWheel)
      game.attachCrosshair(menu.getGameCrosshair(), settings)
      if (!isTouchDevice()) {
        game.applyResolution(settings.resolutionWidth, settings.resolutionHeight)
        game.applyGraphicsQuality(settings.graphicsQuality || 'high')
      }
      game.getMobileControls()?.applySettings(settings.mobile)
      if (isTouchDevice()) {
        game.applyMobileResMode(settings.mobile.resMode, settings.mobile.res43)
        game.applyMobilePerfProfile(settings.mobile.perfProfile)
      }
    },
    onMapSelected: (mapId) => {
      if (!Game.game) return
      Game.game.prefetchMap(mapId)
    },
  })

  try {
    menu.setLoadingProgress('Initializing physics…', 8)
    await initializeAmmo()

    menu.setLoadingProgress('Starting engine…', 20)
    const game = Game.getInstance()
    if (import.meta.env.DEV) (window as unknown as { __kos: Game }).__kos = game
    const settings = loadSettings()
    const mobileControls = new MobileControls(game.inputManager, settings.mobile)
    game.setMobileControls(mobileControls)
    menu.setMobileControls(mobileControls)

    game.setReturnToMenuHandler(() => {
      void game.audioManager.startMenuMusic()
      menu.show()
      const notice = game.consumeMenuNotice()
      if (notice) {
        menu.showScreen('mp')
        menu.setMultiplayerStatus(notice)
      }
      // Warm the currently selected map again while they sit on the menu.
      game.prefetchMap(menu.getSelectedMapId())
    })
    game.setHideMenuHandler(() => {
      game.audioManager.stopMenuMusic()
      menu.hide()
    })
    game.inputManager.applyKeybinds(settings.keybinds)
    game.inputManager.setJumpWithScrollWheel(settings.jumpWithScrollWheel)
    game.attachCrosshair(menu.getGameCrosshair(), settings)

    menu.setLoadingProgress('Loading audio…', 40)
    await game.audioManager.loadPriority()
    game.applyPersistedSettings(settings)

    // Weapons / bots / maps load on Start (or map prefetch) — keep boot light.
    menu.setLoadingProgress('Preparing world…', 75)
    game.onLoad()
    if (isTouchDevice()) {
      game.applyMobileResMode(settings.mobile.resMode, settings.mobile.res43)
      game.applyMobilePerfProfile(settings.mobile.perfProfile)
    } else {
      game.applyResolution(settings.resolutionWidth, settings.resolutionHeight)
    }
    game.startUpdateLoop()

    menu.setLoadingProgress('Finishing setup…', 92)
    // Never block boot on audio unlock — iOS often has no gesture yet
    await Promise.race([
      game.audioManager.unlock(),
      new Promise<void>((r) => setTimeout(r, 450)),
    ])

    menu.setLoadingProgress('Detecting display…', 98)
    const hz = await probeRefreshRate(isTouchDevice() ? 40 : 40)
    game.setDisplayRefreshRate(hz)
    game.setFpsCap(settings.fpsMax === 999 ? 0 : settings.fpsMax)
    if (settings.fpsMax === 0 && supportsHighRefresh()) {
      document.documentElement.dataset.kosHz = String(hz)
    }
    menu.syncFpsControls(hz)

    menu.setLoadingProgress('Ready', 100)
    await new Promise((r) => setTimeout(r, 280))
    menu.showMain()
    void game.audioManager.startMenuMusic()
    mountLandscapeHint()

    if (isTouchDevice() && !hasAutoPerfApplied()) {
      const probe = probeDevicePerf(true)
      const next = loadSettings()
      next.mobile.perfProfile = probe.suggested
      saveSettings(next)
      menu.getSettings().mobile.perfProfile = probe.suggested
      game.applyMobilePerfProfile(probe.suggested)
      markAutoPerfApplied()
      recordTelemetry('perf_auto', {
        suggested: probe.suggested,
        reason: probe.reason,
        docs: PERF_PRESET_DOCS[probe.suggested],
      })
      showToast(`Perf set to ${probe.suggested} for this device.`, 'info', 3600)
    }

    mountFirstRunTips()

    if (pwa.requiresInstall()) {
      pwa.mount()
    }
  } catch (error) {
    console.error(error)
    menu.showError(error instanceof Error ? error.message : 'An unknown error occurred while loading the game.')
  }
}

main()
