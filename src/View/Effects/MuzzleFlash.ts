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
  private texture: THREE.Texture
  private effects: FlashEffect[] = []

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.texture = new THREE.TextureLoader().load('/particle.png')
    this.texture.colorSpace = THREE.SRGBColorSpace
  }

  /** Force GPU upload so first shot never stalls on texture decode */
  public warm(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    if (!this.texture.image) return
    const mat = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0.01,
      depthWrite: false,
    })
    const sprite = new THREE.Sprite(mat)
    sprite.position.set(0, -999, 0)
    this.scene.add(sprite)
    renderer.compile(this.scene, camera)
    this.scene.remove(sprite)
    mat.dispose()
  }

  public spawn(position: Vector3D, direction: Vector3D): void {
    const material = new THREE.SpriteMaterial({
      map: this.texture,
      color: 0xffaa44,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    const sprite = new THREE.Sprite(material)
    sprite.position.copy(position)
    sprite.scale.set(0.55, 0.55, 0.55)
    sprite.lookAt(position.clone().add(direction))
    this.scene.add(sprite)

    const light = new THREE.PointLight(0xff9933, 4, 6)
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
        this.scene.remove(effect.sprite)
        effect.sprite.material.dispose()
        if (effect.light) {
          this.scene.remove(effect.light)
        }
        this.effects.splice(i, 1)
      }
    }
  }
}
