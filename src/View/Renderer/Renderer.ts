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
  constructor(players: Array<PlayerWrapper>) {
    super({ antialias: true, powerPreference: 'high-performance' })
    this.autoClear = false
    this.shadowMap.autoUpdate = false
    this.players = players
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0xb8cfe4, 0.00035)
    this.viewmodelRenderer = new ViewmodelRenderer()
    this.particleManager = new ParticleManager(this.scene)
    this.projectileManager = new ProjectileManager(this.scene, () => Game.getInstance().getPhysics())
    this.muzzleFlashManager = new MuzzleFlashManager(this.scene)
    this.bulletHoleManager = new BulletHoleManager(this.scene)
    this.bloodManager = new BloodManager(this.scene)
    this.debugUI = new DebugUI()
    this.debugUI.addMonitor(this.info.render, 'calls')
    this.setSize(window.innerWidth, window.innerHeight)
    this.setRenderingConfig()
    this.onWindowResize = this.onWindowResize.bind(this)
    this.setPixelRatio(Math.min(window.devicePixelRatio, this.renderingConfig.resolution))
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
    this.composer.setSize(window.innerWidth, window.innerHeight)
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    const bloomFolder = postProcessFolder.addFolder({ title: 'Bloom' })
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85)
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
    this.renderingConfig = {
      resolution: Math.min(window.devicePixelRatio, 1.5),
      hasParticle: true,
      hasPostProcess: true,
      hasLight: true,
      hasShadow: true,
      debugCamera: false,
      updateViewmodel: true,
      showViewmodel: true,
      // Separate viewmodel pass (clearDepth) so guns never clip into walls
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
    if (this.camera instanceof THREE.PerspectiveCamera) {
      const width = window.innerWidth
      const height = window.innerHeight

      this.camera.aspect = width / height
      this.setPixelRatio(Math.min(window.devicePixelRatio, this.renderingConfig.resolution))
      this.camera.updateProjectionMatrix()
      this.viewmodelRenderer.camera.aspect = width / height
      this.viewmodelRenderer.camera.updateProjectionMatrix()
      this.setSize(width, height)
      this.composer?.setSize(width, height)
      this.update()
    }
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
    document.getElementById('fps')!.innerText = this.fps + ' FPS'
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
