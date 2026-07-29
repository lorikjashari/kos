import { Game } from './Game'
import { initializeAmmo } from './Physics/Ammo'
import { MainMenu } from './UI/MainMenu'
import { loadSettings } from './UI/SettingsStore'

async function main() {
  const menu = new MainMenu({
    onPlayBots: (config) => {
      const game = Game.getInstance()
      game.audioManager.stopMenuMusic()
      menu.hide()
      // Warm audio + VFX on the user gesture so first shot/hit never hitchs
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
      game.inputManager.setSensitivity(settings.sensitivity)
      game.attachCrosshair(menu.getGameCrosshair(), settings)
    },
  })

  try {
    menu.setLoadingProgress('Initializing physics…', 8)
    await initializeAmmo()

    menu.setLoadingProgress('Starting engine…', 20)
    const game = Game.getInstance()
    game.setReturnToMenuHandler(() => {
      void game.audioManager.startMenuMusic()
      menu.show()
    })
    game.setHideMenuHandler(() => {
      game.audioManager.stopMenuMusic()
      menu.hide()
    })
    const settings = loadSettings()
    game.inputManager.applyKeybinds(settings.keybinds)
    game.inputManager.setJumpWithScrollWheel(settings.jumpWithScrollWheel)
    game.inputManager.setSensitivity(settings.sensitivity)
    game.attachCrosshair(menu.getGameCrosshair(), settings)

    menu.setLoadingProgress('Loading audio…', 40)
    await game.audioManager.loadPriority()

    menu.setLoadingProgress('Loading map & weapons…', 70)
    await game.globalLoadingManager.loadAllMeshs()

    menu.setLoadingProgress('Preparing world…', 90)
    game.onLoad()
    game.startUpdateLoop()

    menu.setLoadingProgress('Warming combat…', 96)
    // Unlock + silent play so first real shot isn't a hitch (needs a user gesture ideally;
    // warm again on match start after click)
    await game.audioManager.unlock()

    menu.setLoadingProgress('Ready', 100)
    // Brief beat so the bar reads as complete
    await new Promise((r) => setTimeout(r, 280))
    menu.showMain()
    // Menu theme starts after first user gesture (browser autoplay policy)
    void game.audioManager.startMenuMusic()
  } catch (error) {
    console.error(error)
    menu.showError(error instanceof Error ? error.message : 'An unknown error occurred while loading the game.')
  }
}

main()
