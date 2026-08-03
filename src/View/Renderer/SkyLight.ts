import { Sky } from 'three/examples/jsm/objects/Sky.js'
import * as THREE from 'three'
import { Vector3D } from '../../Core/Vector'
import { IUpdatable } from '../../Interface/IUpdatable.js'
import { Renderer } from './Renderer.js'
import { PeriodicUpdater } from '../../Core/PeriodicUpdater.js'
import { isTouchDevice } from '../../UI/MobileDevice'

/**
 * Balanced daylight for fy_pool_day:
 * - Blue sky (not blown white)
 * - Soft shadows under roofs (ambient fill)
 * - Warm sun without washing the map
 */
export class SkyLight extends THREE.Object3D implements IUpdatable {
  public sunPosition: Vector3D = Vector3D.ZERO()
  private directionalLight: THREE.DirectionalLight
  private fillLight: THREE.DirectionalLight
  private hemiLight: THREE.HemisphereLight
  private ambientLight: THREE.AmbientLight
  private renderer: Renderer
  private sky!: Sky
  private effectController = {
    turbidity: 6.5,
    rayleigh: 2.2,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.7,
    elevation: 55,
    azimuth: 155,
    exposure: 0.72,
    autoCycle: false,
    cycleMinutes: 12,
  }
  private cycleTime = 0.38
  private sun = new Vector3D()
  private applySky!: () => void
  private interiorFills: THREE.PointLight[] = []
  /**
   * Phones run without shadows on the lighter profiles, so a desktop-strength
   * ambient/hemi fill leaves the map completely flat. Mobile trades fill for a
   * stronger, warmer sun to keep shape and contrast readable.
   */
  private readonly mobile: boolean

  constructor(renderer: Renderer) {
    super()
    this.renderer = renderer
    const mobile = isTouchDevice()
    this.mobile = mobile

    this.ambientLight = new THREE.AmbientLight(0xe4edf7, mobile ? 0.72 : 1.6)
    this.renderer.addToRenderer(this.ambientLight)

    this.hemiLight = new THREE.HemisphereLight(
      mobile ? 0xcfe0f5 : 0xd0e4ff,
      mobile ? 0xc4ab8a : 0xd0c4b0,
      mobile ? 0.95 : 1.8
    )
    this.renderer.addToRenderer(this.hemiLight)

    const lightInput = this.renderer.debugUI.addInput(this.hemiLight, 'intensity', {
      min: 0,
      max: 10,
    })
    this.renderer.debugUI.lightFolder.add(lightInput)

    // Main sun — moderate so sky stays blue
    this.directionalLight = new THREE.DirectionalLight(0xfff0da, mobile ? 2.5 : 1.55)
    this.directionalLight.shadow.camera.near = 0.1
    this.directionalLight.shadow.camera.far = 500
    // Phones get a tighter shadow frustum so the smaller map keeps usable texel density
    const shadowExtent = mobile ? 90 : 160
    this.directionalLight.shadow.camera.right = shadowExtent
    this.directionalLight.shadow.camera.left = -shadowExtent
    this.directionalLight.shadow.camera.top = shadowExtent
    this.directionalLight.shadow.camera.bottom = -shadowExtent
    this.directionalLight.shadow.mapSize.width = mobile ? 1024 : 2048
    this.directionalLight.shadow.mapSize.height = mobile ? 1024 : 2048
    this.directionalLight.shadow.radius = mobile ? 3 : 5
    this.directionalLight.shadow.bias = -0.0003
    this.directionalLight.shadow.normalBias = mobile ? 0.035 : 0.025
    this.directionalLight.castShadow = true
    this.directionalLight.shadow.autoUpdate = false

    // Opposite fill — lifts dark sides without killing contrast
    this.fillLight = new THREE.DirectionalLight(0xa9c8ea, mobile ? 0.3 : 0.55)
    this.fillLight.castShadow = false

    const dirLight = this.renderer.debugUI.addInput(this.directionalLight, 'intensity', {
      min: 0,
      max: 10,
    })
    this.renderer.debugUI.lightFolder.add(dirLight)

    this.renderer.addToRenderer(this.directionalLight)
    this.renderer.addToRenderer(this.directionalLight.target)
    this.renderer.addToRenderer(this.fillLight)
    this.renderer.addToRenderer(this.fillLight.target)

    this.addInteriorFillLights()

    this.lightUpdater = new PeriodicUpdater(
      mobile ? 500 : 200,
      () => {
        this.lightUpdate()
      },
      this
    )
    this.setSky()
  }

  /** Soft warm point lights under covered pool areas */
  private addInteriorFillLights(): void {
    const spots: Array<{ x: number; y: number; z: number; i: number; r: number }> = [
      { x: 0, y: 6, z: 22, i: 26, r: 50 },
      { x: 15, y: 5.5, z: 34, i: 22, r: 42 },
      { x: -15, y: 5.5, z: 34, i: 22, r: 42 },
      { x: 0, y: 5.5, z: 48, i: 20, r: 48 },
      { x: 26, y: 5, z: 24, i: 24, r: 38 },
      { x: -26, y: 5, z: 24, i: 24, r: 38 },
      { x: 30, y: 4.8, z: 40, i: 22, r: 36 },
      { x: -30, y: 4.8, z: 40, i: 22, r: 36 },
    ]
    const scale = this.mobile ? 0.7 : 1
    for (const s of spots) {
      const p = new THREE.PointLight(0xffe8cc, s.i * scale, s.r, 1.35)
      p.position.set(s.x, s.y, s.z)
      p.castShadow = false
      this.renderer.addToRenderer(p)
      this.interiorFills.push(p)
    }
  }

  private setSky(): void {
    this.sky = new Sky()
    this.sky.scale.setScalar(450000)
    this.renderer.addToRenderer(this.sky)

    this.applySky = (): void => {
      const uniforms = this.sky.material.uniforms
      uniforms['turbidity'].value = this.effectController.turbidity
      uniforms['rayleigh'].value = this.effectController.rayleigh
      uniforms['mieCoefficient'].value = this.effectController.mieCoefficient
      uniforms['mieDirectionalG'].value = this.effectController.mieDirectionalG

      const phi = THREE.MathUtils.degToRad(90 - this.effectController.elevation)
      const theta = THREE.MathUtils.degToRad(this.effectController.azimuth)
      this.sun.setFromSphericalCoords(1, phi, theta)
      uniforms['sunPosition'].value.copy(this.sun)
      this.sunPosition.copy(this.sun)

      this.renderer.toneMappingExposure = this.effectController.exposure
    }

    const folder = this.renderer.debugUI.addFolder({ title: 'Sky shader' })
    folder.addInput(this.effectController, 'autoCycle', { label: 'auto day/night' })
    folder.addInput(this.effectController, 'cycleMinutes', {
      label: 'cycle (min)',
      min: 1,
      max: 30,
      step: 0.5,
    })
    folder
      .addInput(this.effectController, 'turbidity', { min: 0, max: 20 })
      .on('change', () => this.applySky())
    folder
      .addInput(this.effectController, 'rayleigh', { min: 0, max: 4 })
      .on('change', () => this.applySky())
    folder
      .addInput(this.effectController, 'mieCoefficient', { min: 0, max: 0.1 })
      .on('change', () => this.applySky())
    folder
      .addInput(this.effectController, 'mieDirectionalG', { min: 0, max: 1 })
      .on('change', () => this.applySky())
    folder
      .addInput(this.effectController, 'elevation', { min: -10, max: 90 })
      .on('change', () => this.applySky())
    folder
      .addInput(this.effectController, 'azimuth', { min: -180, max: 180 })
      .on('change', () => this.applySky())
    folder
      .addInput(this.effectController, 'exposure', { min: 0, max: 2 })
      .on('change', () => this.applySky())

    this.applyDayLook()
    this.applySky()
  }

  /** Fixed pleasant midday look (auto cycle optional). */
  private applyDayLook(): void {
    const mobile = this.mobile
    this.effectController.elevation = mobile ? 48 : 55
    this.effectController.azimuth = 155
    this.effectController.turbidity = mobile ? 4.2 : 6.5
    this.effectController.rayleigh = mobile ? 1.7 : 2.35
    this.effectController.mieCoefficient = 0.0045
    this.effectController.mieDirectionalG = 0.72
    this.effectController.exposure = mobile ? 0.92 : 0.72

    this.directionalLight.intensity = mobile ? 2.5 : 1.55
    this.directionalLight.color.setRGB(1, 0.94, 0.85)
    this.fillLight.intensity = mobile ? 0.3 : 0.55
    this.fillLight.color.setRGB(0.66, 0.78, 0.92)
    this.hemiLight.intensity = mobile ? 0.95 : 1.8
    this.ambientLight.intensity = mobile ? 0.72 : 1.6

    // Thinner, warmer haze on phones — the blue-grey wash was eating all contrast
    const fogColor = new THREE.Color(mobile ? 0xcbdcec : 0xb8cfe4)
    if (this.renderer.scene.fog instanceof THREE.FogExp2) {
      this.renderer.scene.fog.color.copy(fogColor)
      this.renderer.scene.fog.density = mobile ? 0.0002 : 0.00035
    }
    this.renderer.setClearColor(fogColor.getHex())
  }

  private sampleDayCycle(t: number): void {
    const elev = Math.sin(t * Math.PI * 2 - Math.PI / 2) * 42
    this.effectController.elevation = elev
    let az = (t * 360 - 70) % 360
    if (az > 180) az -= 360
    this.effectController.azimuth = az

    const dayAmount = THREE.MathUtils.smoothstep(elev, -2, 28)
    const golden = THREE.MathUtils.clamp(1 - Math.abs(elev - 8) / 14, 0, 1)

    this.effectController.turbidity = THREE.MathUtils.lerp(3, 8, golden * 0.4 + (1 - dayAmount) * 0.2)
    this.effectController.rayleigh = THREE.MathUtils.lerp(0.9, 2.4, dayAmount)
    this.effectController.mieCoefficient = THREE.MathUtils.lerp(0.003, 0.009, golden)
    this.effectController.mieDirectionalG = THREE.MathUtils.lerp(0.55, 0.75, golden)
    // Cap exposure so sky never blows to white
    this.effectController.exposure = THREE.MathUtils.lerp(0.45, 0.78, dayAmount)

    this.directionalLight.intensity = THREE.MathUtils.lerp(0.2, 1.6, dayAmount)
    this.fillLight.intensity = THREE.MathUtils.lerp(0.15, 0.55, dayAmount)
    this.hemiLight.intensity = THREE.MathUtils.lerp(0.4, 1.35, dayAmount)
    this.ambientLight.intensity = THREE.MathUtils.lerp(0.4, 0.95, dayAmount)

    for (const p of this.interiorFills) {
      p.intensity = THREE.MathUtils.lerp(8, 18, dayAmount)
    }

    const fogColor = new THREE.Color(
      THREE.MathUtils.lerp(0.25, 0.72, dayAmount),
      THREE.MathUtils.lerp(0.3, 0.8, dayAmount),
      THREE.MathUtils.lerp(0.38, 0.9, dayAmount)
    )
    if (this.renderer.scene.fog instanceof THREE.FogExp2) {
      this.renderer.scene.fog.color.copy(fogColor)
      this.renderer.scene.fog.density = THREE.MathUtils.lerp(0.0009, 0.00035, dayAmount)
    }
    this.renderer.setClearColor(fogColor.getHex())
  }

  private lightUpdater: PeriodicUpdater

  private lightUpdate(): void {
    this.directionalLight.shadow.needsUpdate = true
    this.position.copy(this.renderer.camera.position)
    const pos = this.renderer.camera.position.clone()

    const sunDir = this.sun.clone().normalize()
    const y = Math.max(sunDir.y, 0.15)
    this.directionalLight.position.set(pos.x + sunDir.x * 140, pos.y + y * 140, pos.z + sunDir.z * 140)
    this.directionalLight.target.position.set(pos.x, pos.y, pos.z)

    // Fill from opposite side / sky
    this.fillLight.position.set(pos.x - sunDir.x * 80, pos.y + 60, pos.z - sunDir.z * 80)
    this.fillLight.target.position.set(pos.x, pos.y, pos.z)
  }

  public update(dt: number): void {
    if (this.effectController.autoCycle) {
      const cycleSeconds = Math.max(60, this.effectController.cycleMinutes * 60)
      this.cycleTime = (this.cycleTime + dt / cycleSeconds) % 1
      this.sampleDayCycle(this.cycleTime)
      this.applySky()
    }
    this.lightUpdater.update(dt)
  }
}
