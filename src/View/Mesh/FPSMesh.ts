import * as THREE from 'three'
import { Vector3D } from '../../Core/Vector'
import { IUpdatable } from '../../Interface/IUpdatable'
import { AnimatedLoadableMesh } from './AnimatedLoadableMesh'
import { LoadableMesh } from './LoadableMesh'

export class FPSMesh extends AnimatedLoadableMesh implements IUpdatable {
  private lights: THREE.Light[] = []
  public viewmodelOffset: Vector3D
  constructor(path: string, key: string, viewmodelOffset = Vector3D.ZERO()) {
    super(path, key)
    this.viewmodelOffset = viewmodelOffset
  }
  update(dt: number): void {
    super.update(dt)
  }

  private meshPrepared = false

  private initMesh(): void {
    // Idempotent — never flip scale twice
    if (!this.meshPrepared) {
      this.mesh.scale.multiplyScalar(-1)
      this.meshPrepared = true
    }
    this.mesh.visible = true
    this.mesh.traverse((child) => {
      child.castShadow = false
      // Don't receive world shadows — they crush hands/guns to black
      child.receiveShadow = false
      child.frustumCulled = false

      if (child instanceof THREE.Mesh && child.material) {
        const srcMats = Array.isArray(child.material) ? child.material : [child.material]
        const nextMats = srcMats.map((mat) => {
          if (!mat || !('color' in mat) || !(mat.color instanceof THREE.Color)) return mat

          // Clone so we never bleach the shared loaded prototype
          const m = mat.clone() as THREE.MeshStandardMaterial
          const lum = m.color.r * 0.2126 + m.color.g * 0.7152 + m.color.b * 0.0722

          // Only lift near-black glove parts
          if (lum < 0.12) {
            m.color.offsetHSL(0, 0, 0.08)
            if (m.emissive) {
              m.emissive.setRGB(0.03, 0.03, 0.03)
              m.emissiveIntensity = 0.12
            }
          } else if (m.emissive) {
            m.emissive.setRGB(0, 0, 0)
            m.emissiveIntensity = 0
          }
          m.needsUpdate = true
          return m
        })
        child.material = nextMats.length === 1 ? nextMats[0] : nextMats
      }
    })
  }

  public init(): void {
    super.init()
    this.initMesh()
  }

  public addLight(light: THREE.Light): void {
    this.mesh.add(light)
    this.lights.push(light)
  }

  public addLights(lights: THREE.Light[]): void {
    for (const light of lights) this.addLight(light)
  }

  public clone(): FPSMesh {
    const clone = new FPSMesh(this.path, this.key, this.viewmodelOffset)
    clone.setMesh(this.cloneMesh())
    clone.setAnimations(this.animations)
    return clone
  }
}
