import * as THREE from 'three'
import { ParticleManager } from '../Particle/ParticleManager'
import { IUpdatable } from '../../Interface/IUpdatable'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { SAOPass } from 'three/examples/jsm/postprocessing/SAOPass.js'

import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { PlayerWrapper } from '../../Core/PlayerWrapper'
import { GameObject } from '../../Core/GameObject'
import { Vector3D } from '../../Core/Vector'
import { RenderingConfig } from '../../Interface/utils'
import { SceneLighting } from './SceneLighting'
import { ViewmodelRenderer } from './ViewmodelRenderer'
import { PeriodicUpdater } from '../../Core/PeriodicUpdater'
import { DebugUI } from '../DebugUI'
import { BokehPass, SSAOPass, ShaderPass, UnrealBloomPass } from 'three/examples/jsm/Addons'
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass'
import { LensDistortionPassGen } from 'three-lens-distortion'
import { MuzzleFlashManager } from '../Effects/MuzzleFlash'
import { ProjectileManager } from '../Effects/ProjectileManager'
import { BulletHoleManager } from '../Effects/BulletHoleManager'
import { BloodManager } from '../Effects/BloodManager'
import { Game } from '../../Game'
import { GameHUD } from '../HUD/GameHUD'
import { isTouchDevice } from '../../UI/MobileDevice'
import {
  parseMobileRes43,
  type MobilePerfProfile,
  type MobileRes43,
  type MobileResMode,
} from '../../UI/SettingsStore'

export class Renderer extends THREE.WebGLRenderer implements IUpdatable {
  public scene: THREE.Scene
  private fps!: number
  public camera!: THREE.PerspectiveCamera
  public viewmodelRenderer: ViewmodelRenderer
  public currentPlayer!: PlayerWrapper
  public particleManager: ParticleManager
  public debugUI: DebugUI
  public projectileManager: ProjectileManager
  public muzzleFlashManager: MuzzleFlashManager
  public bulletHoleManager: BulletHoleManager
  public bloodManager: BloodManager
  public renderingConfig!: RenderingConfig
  private composer!: EffectComposer
  public players: Array<PlayerWrapper>
  private debugCamera!: THREE.PerspectiveCamera
  private debugCameraPosition!: Vector3D
  private sky!: Sky
  public sceneLighting!: SceneLighting
  public hud!: GameHUD
  private readonly mobileGameplay: boolean
  constructor(players: Array<PlayerWrapper>) {
    const mobile = isTouchDevice()
    super({
      antialias: !mobile,
      powerPreference: 'high-performance',
      stencil: false,
    })
    this.mobileGameplay = mobile
    this.autoClear = false
    this.shadowMap.autoUpdate = false
    this.players = players
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(mobile ? 0xcbdcec : 0xb8cfe4, mobile ? 0.0002 : 0.00035)
    this.viewmodelRenderer = new ViewmodelRenderer()
    this.particleManager = new ParticleManager(this.scene)
    this.projectileManager = new ProjectileManager(this.scene, () => Game.getInstance().getPhysics())
    this.muzzleFlashManager = new MuzzleFlashManager(this.scene)
    this.bulletHoleManager = new BulletHoleManager(this.scene)
    this.bloodManager = new BloodManager(this.scene)
    this.debugUI = new DebugUI()
    this.debugUI.addMonitor(this.info.render, 'calls')
    this.gameResW = mobile ? 960 : 1280
    this.gameResH = mobile ? 540 : 960
    this.setRenderingConfig()
    this.onWindowResize = this.onWindowResize.bind(this)
    if (mobile) {
      this.applyMobileResolution()
    } else {
      this.setPixelRatio(Math.min(window.devicePixelRatio, this.renderingConfig.resolution))
      this.applyGameResolution()
    }
    this.hud = new GameHUD()
    this.fpsUpdater = new PeriodicUpdater(
      1000,
      (dt: number) => {
        this.updateFpsScreenText(dt)
      },
      this
    )
    window.addEventListener('resize', this.onWindowResize, false)
    document.body.appendChild(this.domElement)
    this.styleCanvas()
  }

  private gameResW = 1280
  private gameResH = 960

  /** CS-style internal resolution — stretched to fill the window. */
  public setGameResolution(width: number, height: number): void {
    const w = Math.max(320, Math.floor(width))
    const h = Math.max(240, Math.floor(height))
    this.gameResW = w
    this.gameResH = h
    this.applyGameResolution()
  }

  public applyGraphicsProfile(profile: 'low' | 'medium' | 'high'): void {
    if (this.mobileGameplay) return
    if (profile === 'low') {
      this.renderingConfig.hasPostProcess = false
      this.renderingConfig.hasParticle = false
      this.renderingConfig.hasShadow = false
      this.renderingConfig.resolution = Math.min(window.devicePixelRatio, 1)
    } else if (profile === 'medium') {
      this.renderingConfig.hasPostProcess = true
      this.renderingConfig.hasParticle = false
      this.renderingConfig.hasShadow = true
      this.renderingConfig.resolution = Math.min(window.devicePixelRatio, 1.25)
    } else {
      this.renderingConfig.hasPostProcess = true
      this.renderingConfig.hasParticle = true
      this.renderingConfig.hasShadow = true
      this.renderingConfig.resolution = Math.min(window.devicePixelRatio, 1.5)
    }
    this.setPixelRatio(Math.min(window.devicePixelRatio, this.renderingConfig.resolution))
    this.sceneLighting?.enableShadow(this.renderingConfig.hasShadow)
    this.sceneLighting?.applyRenderingConfig()
    if (this.renderingConfig.hasPostProcess) {
      if (!this.composer && this.camera) this.addPostProcess()
    }
    this.applyGameResolution()
  }

  private mobilePerfProfile: MobilePerfProfile = 'balanced'
  private mobileResMode: MobileResMode = 'normal'
  private mobileRes43: MobileRes43 = '1280x960'
  /** Multiplies mobile backbuffer scale (Dust II is heavier than Pool Day). */
  private mapPerfScale = 1
  private dust2Mobile = false

  public applyMobilePerfProfile(profile: MobilePerfProfile): void {
    if (!this.mobileGameplay) return
    this.mobilePerfProfile = profile
    if (profile === 'smooth') {
      this.renderingConfig.hasPostProcess = false
      this.renderingConfig.hasParticle = false
      // Dust II Smooth: no shadows (fill-rate killer). Pool Day keeps a cheap map.
      this.renderingConfig.hasShadow = !this.dust2Mobile
    } else if (profile === 'balanced') {
      this.renderingConfig.hasPostProcess = false
      // 2.5k alpha-blended sprites is pure fill rate for ambient dust nobody notices
      this.renderingConfig.hasParticle = false
      // Dust II Balanced also drops shadows — map geometry already costs enough
      this.renderingConfig.hasShadow = !this.dust2Mobile
    } else {
      this.renderingConfig.hasPostProcess = true
      this.renderingConfig.hasParticle = !this.dust2Mobile
      this.renderingConfig.hasShadow = true
    }
    this.applyMobileResolution()
    this.sceneLighting?.enableShadow(this.renderingConfig.hasShadow)
    // Smaller shadow atlas when shadows stay on (Pool Day / Quality Dust II)
    this.sceneLighting?.setShadowMapSize(
      this.dust2Mobile || profile === 'smooth' ? 512 : 1024
    )
    this.sceneLighting?.applyRenderingConfig()
    if (this.renderingConfig.hasPostProcess && this.camera) {
      if (!this.composer) this.addPostProcess()
    }
  }

  /** Dust II on phones: lower res scale and drop shadows on Smooth/Balanced. */
  public applyMapPerfBudget(mapId: string): void {
    if (!this.mobileGameplay) {
      this.mapPerfScale = 1
      this.dust2Mobile = false
      return
    }
    this.dust2Mobile = mapId === 'de_dust2'
    this.mapPerfScale = this.dust2Mobile ? 0.7 : 1
    this.applyMobilePerfProfile(this.mobilePerfProfile)
  }

  public setMobileResMode(mode: MobileResMode): void {
    if (!this.mobileGameplay) return
    this.mobileResMode = mode
    this.applyMobileResolution()
  }

  public setMobileRes43(preset: MobileRes43): void {
    if (!this.mobileGameplay) return
    this.mobileRes43 = preset
    if (this.mobileResMode === '4:3') this.applyMobileResolution()
  }

  /**
   * Mobile drives the backbuffer directly (pixel ratio pinned to 1) so the cost
   * is predictable across very different device pixel ratios.
   */
  private applyMobileResolution(): void {
    const base =
      this.mobilePerfProfile === 'smooth' ? 0.76 : this.mobilePerfProfile === 'balanced' ? 0.92 : 1.12
    const scale = base * this.mapPerfScale
    this.renderingConfig.resolution = 1
    this.setPixelRatio(1)

    if (this.mobileResMode === '4:3') {
      // Exact CS-style pick; Soft-scale for Dust II / Smooth budget
      const { width, height } = parseMobileRes43(this.mobileRes43)
      let budget = this.mapPerfScale
      if (this.mobilePerfProfile === 'smooth') budget *= this.dust2Mobile ? 0.72 : 0.85
      else if (this.mobilePerfProfile === 'balanced' && this.dust2Mobile) budget *= 0.88
      this.setGameResolution(Math.round(width * budget), Math.round(height * budget))
      return
    }

    const vw = Math.max(320, window.innerWidth)
    const vh = Math.max(240, window.innerHeight)
    const aspect = vw / vh
    // Track the screen's own aspect, budgeting on the short edge
    const shortCap = this.dust2Mobile
      ? this.mobilePerfProfile === 'smooth'
        ? 820
        : 960
      : 1080
    const shortEdge = Math.round(
      THREE.MathUtils.clamp(Math.min(vw, vh) * window.devicePixelRatio * scale, 400, shortCap)
    )
    if (aspect >= 1) this.setGameResolution(Math.round(shortEdge * aspect), shortEdge)
    else this.setGameResolution(shortEdge, Math.round(shortEdge / aspect))
  }

  public getGameResolution(): { width: number; height: number } {
    return { width: this.gameResW, height: this.gameResH }
  }

  private styleCanvas(): void {
    const canvas = this.domElement
    canvas.id = 'kos-gl'
    canvas.style.position = 'fixed'
    canvas.style.left = '0'
    canvas.style.top = '0'
    canvas.style.right = '0'
    canvas.style.bottom = '0'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'block'
    canvas.style.objectFit = 'fill'
    canvas.style.imageRendering = this.gameResW <= 1024 ? 'auto' : 'auto'
    canvas.style.zIndex = '0'
  }

  private applyGameResolution(): void {
    const w = this.gameResW
    const h = this.gameResH
    this.setSize(w, h, false)
    this.setViewport(0, 0, w, h)
    this.composer?.setSize(w, h)
    this.styleCanvas()
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
    }
    if (this.viewmodelRenderer?.camera) {
      this.viewmodelRenderer.camera.aspect = w / h
      this.viewmodelRenderer.camera.updateProjectionMatrix()
    }
    const fpsCam = this.currentPlayer?.renderer?.camera
    if (fpsCam instanceof THREE.PerspectiveCamera) {
      fpsCam.aspect = w / h
      fpsCam.updateProjectionMatrix()
    }
  }

  private createDebugCamera() {
    this.debugCamera = new THREE.PerspectiveCamera(90)
    this.debugCamera.aspect = window.innerWidth / window.innerHeight
    this.debugCamera.updateProjectionMatrix()
    this.debugCameraPosition = new Vector3D(-5.4, 1, 0)
    this.debugUI.addVector(this.debugCameraPosition, 'Second Camera', new Vector3D(10, 10, 10))
  }
  public setCurrentPlayer(player: PlayerWrapper) {
    this.setCamera(player.renderer!.camera)
    if (this.renderingConfig.hasPostProcess) {
      this.addPostProcess()
    }

    if (!this.currentPlayer) {
      this.sceneLighting = new SceneLighting(this)
      //this.setSkybox();

      if (this.renderingConfig.debugCamera) {
        this.createDebugCamera()
      }
    }
    this.currentPlayer = player
  }

  private createScissor(viewleft: number, viewbottom: number, viewwidth: number, viewheight: number) {
    const windowWidth = window.innerWidth
    const windowHeight = window.innerHeight

    const left = Math.floor(windowWidth * viewleft)
    const bottom = Math.floor(windowHeight * viewbottom)
    const width = Math.floor(windowWidth * viewwidth)
    const height = Math.floor(windowHeight * viewheight)

    this.setViewport(left, bottom, width, height)
    this.setScissor(left, bottom, width, height)
    this.setScissorTest(true)
  }

  private addPostProcess() {
    this.composer = new EffectComposer(this)
    const postProcessFolder = this.debugUI.addFolder({ title: 'Post Process' })
    this.composer.setSize(this.gameResW, this.gameResH)
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    const bloomFolder = postProcessFolder.addFolder({ title: 'Bloom' })
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(this.gameResW, this.gameResH), 1.5, 0.4, 0.85)
    bloomPass.threshold = 0.88
    bloomPass.strength = 0.14
    bloomPass.radius = 0.3
    bloomFolder.addInput(bloomPass, 'threshold', { min: 0.2, max: 1.5, step: 0.01 })
    bloomFolder.addInput(bloomPass, 'strength', { min: 0, max: 3 })
    bloomFolder.addInput(bloomPass, 'radius', { min: 0, max: 1 })

    this.composer.addPass(bloomPass)

    const dofParams = {
      focus: 0.4,
      aperture: 0.125,
      maxblur: 0.001,
    }

    const bokehPass = new BokehPass(this.scene, this.camera, dofParams)
    //this.composer.addPass(bokehPass)

    // SSAO removed — it crushed indoor areas to black on the baked map

    const lensDistortionFolder = postProcessFolder.addFolder({ title: 'Lens Distortion' })
    const LensDistortionPass = new LensDistortionPassGen({ THREE, Pass, FullScreenQuad })
    const params = {
      distortion: new THREE.Vector2(0.04, 0.04),
      principalPoint: new THREE.Vector2(0, 0),
      focalLength: new THREE.Vector2(0.9, 0.9),
      skew: 0,
    }
    const lensDistortionPass = new LensDistortionPass(params)
    lensDistortionFolder.addInput(params, 'distortion', {
      x: { min: -1, max: 1 },
      y: { min: -1, max: 1, inverted: true },
    })
    lensDistortionFolder.addInput(params, 'principalPoint', {
      x: { min: -0.5, max: 0.5 },
      y: { min: -0.5, max: 0.5, inverted: true },
    })
    lensDistortionFolder.addInput(params, 'focalLength', {
      x: { min: -1, max: 1 },
      y: { min: -1, max: 1, inverted: true },
    })

    lensDistortionFolder.addInput(params, 'skew', { min: -Math.PI / 2, max: Math.PI / 2 })
    this.debugUI.on('change', () => (lensDistortionPass.skew = params.skew))
    this.composer.addPass(lensDistortionPass)
  }
  private setSkybox(): void {
    const loader = new THREE.TextureLoader()
    const texture = loader.load('skybox - Copy.png', () => {
      const rt = new THREE.WebGLCubeRenderTarget(texture.image.height)
      rt.fromEquirectangularTexture(this, texture)
      this.scene.background = rt.texture
    })
  }
  private setRenderingConfig() {
    const mobile = this.mobileGameplay
    this.renderingConfig = {
      resolution: mobile ? 1 : Math.min(window.devicePixelRatio, 1.5),
      hasParticle: !mobile,
      hasPostProcess: !mobile,
      hasLight: true,
      hasShadow: true,
      debugCamera: false,
      updateViewmodel: true,
      showViewmodel: true,
      legacyViewmodel: false,
    }
    const folder = this.debugUI.addFolder({ title: 'Rendering config' })
    const particles = this.debugUI.addInput(this.renderingConfig, 'hasParticle').on('change', () => {
      this.sceneLighting.applyRenderingConfig()
    })
    const process = this.debugUI.addInput(this.renderingConfig, 'hasPostProcess').on('change', () => {
      if (this.renderingConfig.hasPostProcess && !this.composer) {
        this.addPostProcess()
      }
    })
    const shadow = this.debugUI.addInput(this.renderingConfig, 'hasShadow').on('change', () => {
      this.sceneLighting.enableShadow(this.renderingConfig.hasShadow)
    })

    const light = this.debugUI.addInput(this.renderingConfig, 'hasLight').on('change', () => {
      // If there is no sunlight already
      if (this.renderingConfig.hasLight && !this.sceneLighting.sunLight) {
        //this.sceneLighting.createSunLight();
      }
    })
    const debugCam = this.debugUI.addInput(this.renderingConfig, 'debugCamera').on('change', () => {
      if (this.renderingConfig.debugCamera && !this.debugCamera) {
        this.createDebugCamera()
      }
    })

    const viewmodel = this.debugUI.addInput(this.renderingConfig, 'updateViewmodel')
    const viewmodel2 = this.debugUI.addInput(this.renderingConfig, 'showViewmodel')

    folder.add(particles)
    folder.add(process)
    folder.add(light)
    folder.add(shadow)
    folder.add(debugCam)
    folder.add(viewmodel)
    folder.add(viewmodel2)
  }
  public setCamera(camera: THREE.PerspectiveCamera) {
    this.camera = camera
    this.scene.add(camera)
    const audioManager = Game.getInstance().audioManager
    if (!camera.children.includes(audioManager)) {
      camera.add(audioManager)
    }
  }

  private onWindowResize(): void {
    if (this.mobileGameplay) {
      // Native mode follows the viewport, so recompute instead of reusing the old size
      this.applyMobileResolution()
      this.update()
      return
    }
    this.setPixelRatio(Math.min(window.devicePixelRatio, this.renderingConfig.resolution))
    this.applyGameResolution()
    this.update()
  }
  public addToRenderer(gameObject: GameObject, viewmodel = false) {
    if (!viewmodel) this.scene.add(gameObject)
    else this.viewmodelRenderer.scene.add(gameObject)
  }

  private fpsUpdater: PeriodicUpdater
  private updateFps(dt: number) {
    this.fps = Math.floor(1 / dt)
  }
  private updateFpsScreenText(dt: number) {
    this.updateFps(dt)
    const el = document.getElementById('fps')
    if (!el || el.style.display === 'none' || getComputedStyle(el).display === 'none') return
    el.innerText = this.fps + ' FPS'
  }

  /**
   * Compile the passes and force the first shadow-map pass while we are still on
   * the loading screen — both are heavy one-off costs on the first rendered frame.
   */
  public warmRenderPipeline(): void {
    if (!this.camera) return
    if (this.renderingConfig.hasShadow) {
      this.shadowMap.needsUpdate = true
      this.render(this.scene, this.camera)
    }
    if (this.renderingConfig.hasPostProcess) {
      if (!this.composer) this.addPostProcess()
      this.composer.render()
    }
    this.viewmodelRenderer.render(this, 0)
  }

  public update(dt: number = 1 / 60): void {
    if (!this.camera) {
      throw new Error('No camera to render to!')
    }
    this.currentPlayer.cameraManager!.update(dt)
    this.fpsUpdater.update(dt)
    if (this.renderingConfig.hasParticle) {
      this.particleManager.update(dt)
    }
    this.projectileManager.update(dt)
    this.muzzleFlashManager.update(dt)
    this.bloodManager.update(dt)
    this.sceneLighting.update(dt)

    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i].renderer) {
        this.players[i].renderer?.update(dt)
      } else {
        console.log(this.players[i] + "doesn't have a PlayerRenderer")
      }
    }
    if (this.renderingConfig.debugCamera) {
      this.createScissor(0, 0, 1, 1)
    }
    if (this.renderingConfig.hasPostProcess) {
      this.composer.render()
    } else {
      this.render(this.scene, this.camera)
    }
    if (this.renderingConfig.showViewmodel && !this.renderingConfig.legacyViewmodel) {
      this.viewmodelRenderer.render(this, dt)
    }

    if (this.renderingConfig.debugCamera) {
      this.createScissor(0, 0.5, 0.2, 0.2)
      this.debugCamera.position.copy(this.currentPlayer.player.position).add(this.debugCameraPosition)
      this.debugCamera.lookAt(this.currentPlayer.player.position)
      this.render(this.scene, this.debugCamera)
    }
    this.hud?.update(this.currentPlayer.player)
  }
}
