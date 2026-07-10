import * as THREE from 'three'
import { Vector3D } from '../../Core/Vector'

function createBulletHoleTexture(): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const center = size / 2
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center)
  gradient.addColorStop(0, 'rgba(0, 0, 0, 1)')
  gradient.addColorStop(0.18, 'rgba(8, 8, 8, 0.98)')
  gradient.addColorStop(0.32, 'rgba(25, 25, 25, 0.85)')
  gradient.addColorStop(0.48, 'rgba(55, 55, 55, 0.45)')
  gradient.addColorStop(0.62, 'rgba(90, 90, 90, 0.2)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

export class BulletHoleManager {
  private scene: THREE.Scene
  private texture: THREE.CanvasTexture
  private material: THREE.MeshBasicMaterial
  private geometry: THREE.CircleGeometry
  private holes: THREE.Mesh[] = []
  private meshPool: THREE.Mesh[] = []
  private readonly maxHoles = 250
  private readonly holeRadius = 0.075
  private readonly surfaceOffset = 0.015
  private readonly _n = new THREE.Vector3()
  private readonly _pos = new THREE.Vector3()
  private readonly _up = new THREE.Vector3(0, 0, 1)

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.texture = createBulletHoleTexture()
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -8,
      polygonOffsetUnits: -8,
      side: THREE.DoubleSide,
    })
    this.geometry = new THREE.CircleGeometry(this.holeRadius, 20)
  }

  private acquireHole(): THREE.Mesh {
    return this.meshPool.pop() || new THREE.Mesh(this.geometry, this.material)
  }

  /** Upload decal material + pre-allocate meshes so first wall hit doesn't stall */
  public warm(renderer?: THREE.WebGLRenderer, camera?: THREE.Camera): void {
    for (let i = 0; i < 32; i++) {
      this.meshPool.push(new THREE.Mesh(this.geometry, this.material))
    }
    const hole = this.acquireHole()
    hole.position.set(0, -800, 0)
    this.scene.add(hole)
    if (renderer && camera) renderer.compile(this.scene, camera)
    this.scene.remove(hole)
    this.meshPool.push(hole)
  }

  public spawn(position: Vector3D, normal: Vector3D): void {
    const hole = this.acquireHole()
    this._n.copy(normal).normalize()
    this._pos.copy(position).addScaledVector(this._n, this.surfaceOffset)

    hole.position.copy(this._pos)
    hole.quaternion.setFromUnitVectors(this._up, this._n)
    this.scene.add(hole)
    this.holes.push(hole)

    if (this.holes.length > this.maxHoles) {
      const oldest = this.holes.shift()
      if (oldest) {
        this.scene.remove(oldest)
        this.meshPool.push(oldest)
      }
    }
  }
}
