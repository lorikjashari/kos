import { Game } from './Game'
import { initializeAmmo } from './Physics/Ammo'
import { MainMenu } from './UI/MainMenu'
import { MobileControls } from './UI/MobileControls'
import { PwaInstall } from './UI/PwaInstall'
import { loadSettings } from './UI/SettingsStore'
import { isStandalonePwa, isTouchDevice } from './UI/MobileDevice'

async function main() {
  const pwa = new PwaInstall()
  await pwa.register()

  const menu = new MainMenu({
    onPlayBots: (config) => {
      if (isTouchDevice() && !isStandalonePwa()) {
        pwa.mount()
        return
      }
      const game = Game.getInstance()
      game.audioManager.stopMenuMusic()
      menu.hide()
      void (async () => {
        await game.audioManager.unlock()
        await game.ensureMap(config.mapId || 'pool_day')
        await game.prepareCombat()
        game.startBotMatch(config)
      })()
    },
    onSettingsChanged: (settings) => {
      const game = Game.getInstance()
      game.inputManager.applyKeybinds(settings.keybinds)
      game.inputManager.setJumpWithScrollWheel(settings.jumpWithScrollWheel)
      game.attachCrosshair(menu.getGameCrosshair(), settings)
      game.applyResolution(settings.resolutionWidth, settings.resolutionHeight)
      game.getMobileControls()?.applySettings(settings.mobile)
    },
  })

  try {
    menu.setLoadingProgress('Initializing physics…', 8)
    await initializeAmmo()

    menu.setLoadingProgress('Starting engine…', 20)
    const game = Game.getInstance()
    const settings = loadSettings()
    const mobileControls = new MobileControls(game.inputManager, settings.mobile)
    game.setMobileControls(mobileControls)
    menu.setMobileControls(mobileControls)

    game.setReturnToMenuHandler(() => {
      void game.audioManager.startMenuMusic()
      menu.show()
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

    menu.setLoadingProgress('Loading map & weapons…', 70)
    await game.globalLoadingManager.loadAllMeshs()

    menu.setLoadingProgress('Preparing world…', 90)
    game.onLoad()
    game.applyResolution(settings.resolutionWidth, settings.resolutionHeight)
    game.startUpdateLoop()

    menu.setLoadingProgress('Warming combat…', 96)
    await game.audioManager.unlock()

    menu.setLoadingProgress('Ready', 100)
    await new Promise((r) => setTimeout(r, 280))
    menu.showMain()
    void game.audioManager.startMenuMusic()

    if (pwa.requiresInstall()) {
      pwa.mount()
    }
  } catch (error) {
    console.error(error)
    menu.showError(error instanceof Error ? error.message : 'An unknown error occurred while loading the game.')
  }
}

main()
