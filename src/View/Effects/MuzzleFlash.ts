import * as THREE from 'three'
import { Vector3D } from '../../Core/Vector'

interface FlashEffect {
  sprite: THREE.Sprite
  light?: THREE.PointLight
  life: number
  maxLife: number
}

export class MuzzleFlashManager {
  private scene: THREE.Scene
  private texture!: THREE.Texture
  private effects: FlashEffect[] = []
  private textureReady: Promise<void>
  private warmed = false
  private lightPool: THREE.PointLight[] = []
  private spritePool: THREE.Sprite[] = []
  private sharedMaterial!: THREE.SpriteMaterial
  private readonly _lookTarget = new THREE.Vector3()

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.textureReady = new Promise((resolve) => {
      this.texture = new THREE.TextureLoader().load(
        '/particle.png',
        () => resolve(),
        undefined,
        () => resolve()
      )
      this.texture.colorSpace = THREE.SRGBColorSpace
    })
  }

  public async whenReady(): Promise<void> {
    await this.textureReady
  }

  private ensureMaterial(): THREE.SpriteMaterial {
    if (!this.sharedMaterial) {
      this.sharedMaterial = new THREE.SpriteMaterial({
        map: this.texture,
        color: 0xffaa44,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    }
    return this.sharedMaterial
  }

  private acquireSprite(): THREE.Sprite {
    const sprite = this.spritePool.pop() || new THREE.Sprite(this.ensureMaterial())
    sprite.material = this.ensureMaterial()
    sprite.material.opacity = 1
    sprite.scale.set(0.55, 0.55, 0.55)
    sprite.visible = true
    return sprite
  }

  private releaseSprite(sprite: THREE.Sprite): void {
    sprite.visible = false
    this.scene.remove(sprite)
    this.spritePool.push(sprite)
  }

  /** Force GPU upload so first shot never stalls on texture decode */
  public warm(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    if (this.warmed) return
    if (!this.texture.image) return

    this.ensureMaterial()
    // Pre-build a few sprites + lights so first real shots never allocate
    for (let i = 0; i < 6; i++) {
      this.spritePool.push(new THREE.Sprite(this.ensureMaterial()))
    }
    for (let i = 0; i < 4; i++) {
      this.lightPool.push(new THREE.PointLight(0xff9933, 4, 6))
    }

    const sprite = this.acquireSprite()
    sprite.position.set(0, -999, 0)
    sprite.scale.set(0.01, 0.01, 0.01)
    this.scene.add(sprite)

    const light = this.acquireLight()
    light.intensity = 0.001
    light.position.set(0, -999, 0)
    this.scene.add(light)

    renderer.compile(this.scene, camera)
    this.releaseSprite(sprite)
    this.scene.remove(light)
    this.lightPool.push(light)
    this.warmed = true
  }

  private acquireLight(): THREE.PointLight {
    const light = this.lightPool.pop() || new THREE.PointLight(0xff9933, 4, 6)
    light.intensity = 4
    light.distance = 6
    return light
  }

  public spawn(position: Vector3D, direction: Vector3D): void {
    const sprite = this.acquireSprite()
    sprite.position.copy(position)
    this._lookTarget.copy(position).add(direction)
    sprite.lookAt(this._lookTarget)
    this.scene.add(sprite)

    const light = this.acquireLight()
    light.position.copy(position)
    this.scene.add(light)

    this.effects.push({ sprite, light, life: 0, maxLife: 0.07 })
  }

  public update(dt: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i]
      effect.life += dt
      const progress = effect.life / effect.maxLife
      const fade = Math.max(0, 1 - progress)

      effect.sprite.material.opacity = fade
      effect.sprite.scale.multiplyScalar(1 + dt * 6)
      if (effect.light) {
        effect.light.intensity = 4 * fade
      }

      if (effect.life >= effect.maxLife) {
        this.releaseSprite(effect.sprite)
        if (effect.light) {
          this.scene.remove(effect.light)
          this.lightPool.push(effect.light)
        }
        this.effects.splice(i, 1)
      }
    }
  }
}
