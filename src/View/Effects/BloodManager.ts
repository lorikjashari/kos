import * as THREE from 'three'
import { Vector3D } from '../../Core/Vector'
import { IUpdatable } from '../../Interface/IUpdatable'
import type { BodyPart } from '../../Core/BodyPart'

interface Splash {
  mesh: THREE.Mesh
  velocity: THREE.Vector3
  life: number
  maxLife: number
  startScale: number
}

interface AttachedDecal {
  mesh: THREE.Mesh
  parent: THREE.Object3D
}

function createBloodTexture(): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const c = size / 2

  const g = ctx.createRadialGradient(c, c, 0, c, c, c)
  g.addColorStop(0, 'rgba(190, 12, 18, 1)')
  g.addColorStop(0.25, 'rgba(140, 8, 12, 0.95)')
  g.addColorStop(0.55, 'rgba(90, 4, 8, 0.55)')
  g.addColorStop(0.8, 'rgba(50, 0, 4, 0.2)')
  g.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)

  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2
    const r = 14 + Math.random() * 46
    const x = c + Math.cos(a) * r
    const y = c + Math.sin(a) * r
    const rr = 2 + Math.random() * 7
    ctx.beginPath()
    ctx.fillStyle = `rgba(${120 + Math.random() * 80}, ${4 + Math.random() * 20}, ${8}, ${0.4 + Math.random() * 0.5})`
    ctx.arc(x, y, rr, 0, Math.PI * 2)
    ctx.fill()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

export class BloodManager implements IUpdatable {
  private scene: THREE.Scene
  private texture: THREE.CanvasTexture
  private material: THREE.MeshBasicMaterial
  private geometry: THREE.CircleGeometry
  private particleGeo: THREE.SphereGeometry
  private particleMat: THREE.MeshBasicMaterial
  private mistMat: THREE.MeshBasicMaterial
  private attached: AttachedDecal[] = []
  private particles: Splash[] = []
  private readonly maxAttached = 60
  private readonly _tmpMat3 = new THREE.Matrix3()
  private readonly _localN = new THREE.Vector3()
  private readonly _localP = new THREE.Vector3()

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.texture = createBloodTexture()
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -12,
      polygonOffsetUnits: -12,
      side: THREE.DoubleSide,
    })
    this.geometry = new THREE.CircleGeometry(0.18, 18)
    this.particleGeo = new THREE.SphereGeometry(0.04, 6, 6)
    this.particleMat = new THREE.MeshBasicMaterial({
      color: 0xb01018,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    })
    this.mistMat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  }

  /** Compile materials + allocate first meshes off-screen so first hit never hitchs */
  public warm(renderer?: THREE.WebGLRenderer, camera?: THREE.Camera): void {
    const off = new Vector3D(0, -800, 0)
    const dummy = new THREE.Object3D()
    dummy.position.set(0, -800, 0)
    this.scene.add(dummy)

    // Cover every body part + attachTo path used on real bot hits
    this.spawn(off, new Vector3D(0, 1, 0), 'body', dummy)
    this.spawn(off, new Vector3D(0, 1, 0), 'head', dummy)
    this.spawn(off, new Vector3D(0, 1, 0), 'legs', dummy)
    this.spawn(off, new Vector3D(0, 1, 0), 'body')
    this.spawn(off, new Vector3D(0, 1, 0), 'head')
    this.spawn(off, new Vector3D(0, 1, 0), 'legs')

    if (renderer && camera) {
      renderer.compile(this.scene, camera)
    }

    // Drain warm particles / decals immediately
    for (const p of this.particles) {
      this.scene.remove(p.mesh)
    }
    this.particles.length = 0
    for (const a of this.attached) {
      a.parent.remove(a.mesh)
    }
    this.attached.length = 0
    this.scene.remove(dummy)
  }

  /**
   * Impact blood: splat sticks to the bot (moves with him),
   * plus a burst of flying droplets / mist in world space.
   */
  public spawn(
    position: Vector3D,
    normal: Vector3D | undefined,
    part: BodyPart,
    attachTo?: THREE.Object3D
  ): void {
    const n = (normal ?? new Vector3D(0, 0, 1)).clone().normalize()
    const radius = part === 'head' ? 0.32 : part === 'body' ? 0.24 : 0.16
    const dropCount = part === 'head' ? 14 : part === 'body' ? 10 : 7
    const mistCount = part === 'head' ? 4 : 3

    // --- Splat that sticks to the bot ---
    const decal = new THREE.Mesh(this.geometry, this.material)
    decal.scale.setScalar(radius / 0.18)

    if (attachTo) {
      attachTo.updateMatrixWorld(true)
      this._localP.copy(position)
      attachTo.worldToLocal(this._localP)
      this._tmpMat3.getNormalMatrix(attachTo.matrixWorld)
      this._localN.copy(n).applyMatrix3(this._tmpMat3).normalize()
      decal.position.copy(this._localP).addScaledVector(this._localN, 0.035)
      decal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._localN)
      attachTo.add(decal)
      this.attached.push({ mesh: decal, parent: attachTo })
      if (this.attached.length > this.maxAttached) {
        const old = this.attached.shift()
        if (old) old.parent.remove(old.mesh)
      }
    } else {
      const offset = position.clone().add(n.clone().multiplyScalar(0.04))
      decal.position.copy(offset)
      decal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
      this.scene.add(decal)
      this.attached.push({ mesh: decal, parent: this.scene })
    }

    // --- Flying droplet splash (world space) ---
    for (let i = 0; i < dropCount; i++) {
      const mesh = new THREE.Mesh(this.particleGeo, this.particleMat)
      mesh.position.copy(position)
      const startScale = 0.55 + Math.random() * 1.4
      mesh.scale.setScalar(startScale)
      this.scene.add(mesh)

      const spray = new THREE.Vector3(
        (Math.random() - 0.5) * 3.8,
        1.2 + Math.random() * 3.2,
        (Math.random() - 0.5) * 3.8
      )
      spray.add(n.clone().multiplyScalar(2.2 + Math.random() * 2.5))
      this.particles.push({
        mesh,
        velocity: spray,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.45,
        startScale,
      })
    }

    // --- Expanding mist discs (looks like a blood puff) ---
    for (let i = 0; i < mistCount; i++) {
      const mist = new THREE.Mesh(this.geometry, this.mistMat)
      mist.position.copy(position).add(n.clone().multiplyScalar(0.05 + Math.random() * 0.08))
      mist.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).add(n).normalize()
      )
      const startScale = (radius / 0.18) * (0.6 + Math.random() * 0.5)
      mist.scale.setScalar(startScale)
      this.scene.add(mist)
      this.particles.push({
        mesh: mist,
        velocity: n
          .clone()
          .multiplyScalar(0.6 + Math.random() * 0.8)
          .add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6)),
        life: 0,
        maxLife: 0.28 + Math.random() * 0.22,
        startScale,
      })
    }
  }

  /** Remove blood stuck on a bot (call on death / respawn) */
  public clearOn(parent: THREE.Object3D): void {
    for (let i = this.attached.length - 1; i >= 0; i--) {
      if (this.attached[i].parent !== parent) continue
      parent.remove(this.attached[i].mesh)
      this.attached.splice(i, 1)
    }
  }

  public update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.life += dt
      p.velocity.y -= 14 * dt
      p.mesh.position.addScaledVector(p.velocity, dt)

      const t = Math.min(1, p.life / p.maxLife)
      // Drops shrink; mist expands then fades via scale blowout
      const isMist = p.mesh.geometry === this.geometry
      const scale = isMist
        ? p.startScale * (1 + t * 2.4)
        : Math.max(0.01, p.startScale * (1 - t * 0.85))
      p.mesh.scale.setScalar(scale)

      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh)
        this.particles.splice(i, 1)
      }
    }
  }
}
