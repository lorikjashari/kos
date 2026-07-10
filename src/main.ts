import { Game } from './Game'
import { initializeAmmo } from './Physics/Ammo'
import { MainMenu } from './UI/MainMenu'
import { loadSettings } from './UI/SettingsStore'

async function main() {
  const menu = new MainMenu({
    onPlayBots: (config) => {
      const game = Game.getInstance()
      game.audioManager.stopMenuMusic()
      // User click unlocks audio — warm graph before match hitch
      void game.audioManager.warmPlayback()
      game.startBotMatch(config)
      menu.hide()
    },
    onSettingsChanged: (settings) => {
      const game = Game.getInstance()
      game.inputManager.applyKeybinds(settings.keybinds)
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
    const settings = loadSettings()
    game.inputManager.applyKeybinds(settings.keybinds)

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
