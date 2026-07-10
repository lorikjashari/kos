import * as THREE from 'three'
import { TrainingBot } from '../../Core/TrainingBot'
import { bodyPartFromMeshName, MESH_HIT_COLORS } from '../../Core/BotMeshHit'
import type { BodyPart } from '../../Core/BodyPart'
import { Game } from '../../Game'
import { ThirdPersonMesh } from '../Mesh/ThirdPersonMesh'
import { IUpdatable } from '../../Interface/IUpdatable'

interface StoredMaterial {
  mesh: THREE.Mesh
  original: THREE.Material | THREE.Material[]
}

export class TrainingBotRenderer implements IUpdatable {
  public bot: TrainingBot
  public mesh!: THREE.Object3D
  private tpsMesh!: ThirdPersonMesh
  private game: Game
  private storedMaterials: StoredMaterial[] = []
  private overlayOn = false
  private hitMeshes: THREE.Mesh[] = []
  private wasAlive = true
  /** Random side of fall: -1 or 1 */
  private fallSide = 1
  private deathBaseY = 0
  private headBone?: THREE.Bone
  private humanHead?: THREE.Group
  private gunProp?: THREE.Group
  private handBone?: THREE.Object3D
  private shoulderR?: THREE.Bone
  private upperArmR?: THREE.Bone
  private lowerArmR?: THREE.Bone
  private shoulderL?: THREE.Bone
  private upperArmL?: THREE.Bone
  private lowerArmL?: THREE.Bone
  private readonly _headWorld = new THREE.Vector3()
  private readonly _headQuat = new THREE.Quaternion()
  private readonly _rootQuat = new THREE.Quaternion()
  private readonly _handWorld = new THREE.Vector3()
  private readonly _handQuat = new THREE.Quaternion()
  private lastMoveAnim = ''
  private readonly _q = new THREE.Quaternion()
  private readonly _e = new THREE.Euler()

  constructor(bot: TrainingBot) {
    this.bot = bot
    this.game = Game.getInstance()

    const source = this.game.globalLoadingManager.loadableMeshs.get('ThirdPersonMesh') as ThirdPersonMesh | undefined
    if (!source) {
      console.warn('[TrainingBot] ThirdPersonMesh not loaded — bot has no visual')
      this.mesh = new THREE.Group()
      return
    }
    this.tpsMesh = source.clone()
    this.tpsMesh.init()
    this.mesh = this.tpsMesh.mesh
    // Slimmer + taller = more human silhouette on this stock robot
    this.mesh.scale.set(0.55, 1.32, 0.55)
    this.mesh.position.copy(bot.position)
    this.mesh.rotation.y = bot.yaw
    // Unique materials per bot — shared mats made death fade affect everyone
    this.cloneUniqueMaterials()
    this.attachHumanHead()
    this.attachGunProp()
    this.tagBodyParts()
    this.collectHitMeshes()
    this.game.addToRenderer(this.mesh)
    this.tpsMesh.playAnimation('Idle', true, true)
    this.tpsMesh.update(0)
    this.applyRiflePose(0)
    this.mesh.updateMatrixWorld(true)
    this.syncHumanHead()
    this.syncGunInHand()
  }

  /** Clone materials so opacity/emissive edits never leak to other bots */
  private cloneUniqueMaterials(): void {
    this.mesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) return
      if (Array.isArray(child.material)) {
        child.material = child.material.map((m) => m.clone())
      } else {
        child.material = child.material.clone()
      }
    })
  }

  /** Rifle snapped into the right hand each frame (hand bone has huge scale). */
  private attachGunProp(): void {
    this.mesh.traverse((child) => {
      if (!(child as THREE.Bone).isBone) return
      const bone = child as THREE.Bone
      if (bone.name === 'ShoulderR') this.shoulderR = bone
      if (bone.name === 'UpperArmR') this.upperArmR = bone
      if (bone.name === 'LowerArmR') this.lowerArmR = bone
      if (bone.name === 'ShoulderL') this.shoulderL = bone
      if (bone.name === 'UpperArmL') this.upperArmL = bone
      if (bone.name === 'LowerArmL') this.lowerArmL = bone
      if (bone.name === 'Palm1R' || bone.name === 'Palm2R') this.handBone = bone
      if (!this.handBone && bone.name === 'LowerArmR') this.handBone = bone
    })

    const gun = new THREE.Group()
    gun.name = 'BotGun'

    const black = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.55, metalness: 0.35 })
    const dark = new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.6, metalness: 0.25 })
    const wood = new THREE.MeshStandardMaterial({ color: 0x5c3a22, roughness: 0.8, metalness: 0.05 })

    const sx = this.mesh.scale.x || 1
    const sy = this.mesh.scale.y || 1
    const sz = this.mesh.scale.z || 1
    // Slightly larger so the rifle reads clearly at distance
    gun.scale.set((1 / sx) * 1.15, (1 / sy) * 1.15, (1 / sz) * 1.15)

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.78), black)
    body.position.set(0, 0, 0.14)
    gun.add(body)

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.4, 8), dark)
    barrel.rotation.x = Math.PI / 2
    barrel.position.set(0, 0.02, 0.6)
    gun.add(barrel)

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.24), wood)
    stock.position.set(0, -0.02, -0.3)
    gun.add(stock)

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.08), black)
    mag.position.set(0, -0.1, 0.05)
    gun.add(mag)

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.055), black)
    grip.position.set(0, -0.08, -0.05)
    grip.rotation.x = 0.35
    gun.add(grip)

    this.gunProp = gun
    this.mesh.add(gun)
  }

  /**
   * Don't fight RobotExpressive bone math — leave arms at bind/legs-only rest.
   * The gun is placed in a clear chest-aim hold so shooting reads visually.
   */
  private applyRiflePose(_aimKick = 0): void {
    /* intentionally empty — previous euler overrides stretched arms into a V */
  }

  private syncGunInHand(): void {
    if (!this.gunProp) return

    // Clear two-hand chest / shoulder hold in root space (readable ADS)
    const kick = this.bot.shootFlash > 0 ? 1 : 0
    this.gunProp.position.set(0.14, 1.22 + kick * 0.04, 0.48 - kick * 0.08)
    this.gunProp.rotation.order = 'YXZ'
    this.gunProp.rotation.set(-0.18 - kick * 0.35, 0.08, 0.12)
  }

  /**
   * Stock Head bone scale is ~72× — never parent local geometry there.
   * World-sized human face on the root, inverse-scaled, snapped to neck.
   */
  private attachHumanHead(): void {
    this.mesh.traverse((child) => {
      if ((child as THREE.Bone).isBone && child.name === 'Head') {
        this.headBone = child as THREE.Bone
      }
      const n = child.name.toLowerCase()
      if (n === 'head_1' || /^head_[2-9]/.test(n)) {
        child.visible = false
      }
    })

    if (!this.headBone) {
      console.warn('[TrainingBot] Head bone missing — cannot attach human head')
      return
    }

    const sx = this.mesh.scale.x || 1
    const sy = this.mesh.scale.y || 1
    const sz = this.mesh.scale.z || 1

    const head = new THREE.Group()
    head.name = 'HumanHead'
    head.userData.bodyPart = 'head'
    head.scale.set(1 / sx, 1 / sy, 1 / sz)

    const skin = new THREE.MeshStandardMaterial({
      color: 0xe0b089,
      roughness: 0.85,
      metalness: 0.02,
    })
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x2a1c14,
      roughness: 0.9,
      metalness: 0,
    })
    const white = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 })
    const iris = new THREE.MeshBasicMaterial({ color: 0x1a1a1a })
    const browMat = new THREE.MeshBasicMaterial({ color: 0x1a120c })

    // Skull / face — human proportions vs body
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 18), skin)
    skull.name = 'HumanHead_Skull'
    skull.userData.bodyPart = 'head'
    skull.scale.set(0.88, 1.12, 0.95)
    skull.castShadow = true
    head.add(skull)

    // Jaw / chin
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), skin)
    jaw.name = 'HumanHead_Jaw'
    jaw.userData.bodyPart = 'head'
    jaw.scale.set(0.85, 0.55, 0.75)
    jaw.position.set(0, -0.12, 0.04)
    head.add(jaw)

    // Hair cap
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.23, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat)
    hair.name = 'HumanHead_Hair'
    hair.userData.bodyPart = 'head'
    hair.scale.set(0.9, 1.05, 0.95)
    hair.position.set(0, 0.04, -0.01)
    head.add(hair)

    // Ears
    for (const x of [-0.19, 0.19]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skin)
      ear.name = 'HumanHead_Ear'
      ear.userData.bodyPart = 'head'
      ear.scale.set(0.45, 1, 0.7)
      ear.position.set(x, 0, 0)
      head.add(ear)
    }

    // Eyes (front = +Z, same as robot facing) — whites + iris so readable in FPS view
    for (const x of [-0.07, 0.07]) {
      const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), white)
      eyeWhite.name = 'HumanHead_EyeWhite'
      eyeWhite.userData.bodyPart = 'head'
      eyeWhite.scale.set(1, 0.85, 0.55)
      eyeWhite.position.set(x, 0.03, 0.175)
      head.add(eyeWhite)

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), iris)
      pupil.name = 'HumanHead_Eye'
      pupil.userData.bodyPart = 'head'
      pupil.position.set(x, 0.03, 0.195)
      head.add(pupil)

      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.016, 0.02), browMat)
      brow.name = 'HumanHead_Brow'
      brow.userData.bodyPart = 'head'
      brow.position.set(x, 0.075, 0.17)
      brow.rotation.z = x < 0 ? 0.12 : -0.12
      head.add(brow)
    }

    // Nose
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), skin)
    nose.name = 'HumanHead_Nose'
    nose.userData.bodyPart = 'head'
    nose.scale.set(0.55, 0.7, 0.9)
    nose.position.set(0, -0.02, 0.2)
    head.add(nose)

    this.humanHead = head
    this.mesh.add(head)
  }

  private syncHumanHead(): void {
    if (!this.headBone || !this.humanHead) return
    this.headBone.getWorldPosition(this._headWorld)
    this.mesh.worldToLocal(this._headWorld)

    // Face forward with the body — ignore Head bone twist (hides eyes)
    this.humanHead.quaternion.identity()
    this.humanHead.position.copy(this._headWorld)
    // Seat on neck collar (bone is under the original dome)
    this.humanHead.position.y += 0.02
  }

  private tagBodyParts(): void {
    this.mesh.traverse((child) => {
      const part = bodyPartFromMeshName(child.name)
      if (part) child.userData.bodyPart = part
    })
  }

  private collectHitMeshes(): void {
    this.hitMeshes = []
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        this.hitMeshes.push(child)
        if (!child.userData.bodyPart) {
          const part = bodyPartFromMeshName(child.name) ?? this.inferFromParent(child)
          child.userData.bodyPart = part
        }
      }
    })
  }

  private inferFromParent(obj: THREE.Object3D): BodyPart {
    let cur: THREE.Object3D | null = obj.parent
    while (cur) {
      const p = bodyPartFromMeshName(cur.name) || (cur.userData.bodyPart as BodyPart | undefined)
      if (p) return p
      cur = cur.parent
    }
    return 'body'
  }

  public getRoot(): THREE.Object3D {
    return this.mesh
  }

  public setHitboxVisible(visible: boolean): void {
    if (visible === this.overlayOn) return
    if (visible) this.applyHitboxOverlay()
    else this.clearHitboxOverlay()
  }

  public refreshHitboxDebugMeshes(): void {
    if (TrainingBot.showHitboxes) {
      this.clearHitboxOverlay()
      this.applyHitboxOverlay()
    }
  }

  private applyHitboxOverlay(): void {
    this.clearHitboxOverlay()
    this.overlayOn = true
    this.mesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) return
      const part = (child.userData.bodyPart as BodyPart | undefined) ?? this.inferFromParent(child)
      this.storedMaterials.push({ mesh: child, original: child.material })
      child.material = new THREE.MeshBasicMaterial({
        color: MESH_HIT_COLORS[part],
        wireframe: true,
        transparent: true,
        opacity: 0.9,
        depthTest: true,
        side: THREE.DoubleSide,
      })
    })
  }

  private clearHitboxOverlay(): void {
    for (const entry of this.storedMaterials) {
      const current = entry.mesh.material
      if (Array.isArray(current)) {
        current.forEach((m) => {
          if (m !== entry.original) m.dispose()
        })
      } else if (current !== entry.original) {
        current.dispose()
      }
      entry.mesh.material = entry.original
    }
    this.storedMaterials = []
    this.overlayOn = false
  }

  private easeOutCubic(t: number): number {
    const x = Math.min(1, Math.max(0, t))
    return 1 - Math.pow(1 - x, 3)
  }

  private setMeshOpacity(opacity: number): void {
    this.mesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const m of mats) {
        const mat = m as THREE.Material & { opacity?: number; transparent?: boolean }
        if (mat) {
          mat.transparent = true
          mat.opacity = opacity
          mat.needsUpdate = true
        }
      }
    })
  }

  private resetMeshOpacity(): void {
    if (this.overlayOn) {
      this.clearHitboxOverlay()
      if (TrainingBot.showHitboxes) this.applyHitboxOverlay()
      return
    }
    // Restore opaque mats after fade
    this.mesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const m of mats) {
        const mat = m as THREE.Material & { opacity?: number; transparent?: boolean }
        if (mat && 'opacity' in mat) {
          mat.opacity = 1
          mat.transparent = false
          mat.needsUpdate = true
        }
      }
    })
  }

  private updateDeathPose(): void {
    const age = this.bot.deathAge
    const fallT = this.easeOutCubic(age / this.bot.fallDuration)

    // Tip over onto side and settle slightly into the floor
    const tip = fallT * (Math.PI / 2) * this.fallSide
    const sink = fallT * 0.15
    // Slight forward lean so they land on their face/side
    const pitch = fallT * 0.35

    this.mesh.position.set(this.bot.position.x, this.deathBaseY - sink, this.bot.position.z)
    this.mesh.rotation.order = 'YXZ'
    this.mesh.rotation.y = this.bot.yaw
    this.mesh.rotation.x = pitch
    this.mesh.rotation.z = tip

    // Stay visible on the ground, then fade out before respawn
    if (age < this.bot.fadeStart) {
      this.mesh.visible = true
      this.setMeshOpacity(1)
    } else {
      const fadeT = (age - this.bot.fadeStart) / this.bot.fadeDuration
      const opacity = Math.max(0, 1 - fadeT)
      this.mesh.visible = opacity > 0.02
      this.setMeshOpacity(opacity)
    }

    this.tpsMesh.update(1 / 60)
  }

  public update(dt: number): void {
    if (!this.tpsMesh) return

    const want = TrainingBot.showHitboxes && this.bot.isAlive
    if (want !== this.overlayOn) this.setHitboxVisible(want)

    // Just died this frame — pick fall side, freeze animation base
    if (this.wasAlive && !this.bot.isAlive) {
      this.fallSide = Math.random() < 0.5 ? -1 : 1
      this.deathBaseY = this.bot.position.y
      if (this.overlayOn) this.clearHitboxOverlay()
      if (this.gunProp) this.gunProp.visible = false
    }

    // Just respawned — wipe leftover blood stickers
    if (!this.wasAlive && this.bot.isAlive) {
      this.game.renderer.bloodManager?.clearOn(this.mesh)
      this.resetMeshOpacity()
      this.mesh.visible = true
      this.mesh.rotation.set(0, this.bot.yaw, 0)
      this.lastMoveAnim = ''
      this.tpsMesh.playAnimation('Idle', true, true)
      if (this.gunProp) this.gunProp.visible = true
    }
    this.wasAlive = this.bot.isAlive

    if (!this.bot.isAlive) {
      this.updateDeathPose()
      this.mesh.updateMatrixWorld(true)
      this.syncHumanHead()
      return
    }

    this.mesh.visible = true
    this.mesh.position.set(this.bot.position.x, this.bot.position.y, this.bot.position.z)
    this.mesh.rotation.order = 'YXZ'
    this.mesh.rotation.y = this.bot.yaw
    this.mesh.rotation.x = 0
    this.mesh.rotation.z = 0

    // Legs-only locomotion so arms stay in ADS rifle pose
    const anim = this.bot.isMoving ? 'Walking' : 'Idle'
    if (anim !== this.lastMoveAnim) {
      this.tpsMesh.playAnimation(anim, true, true)
      this.lastMoveAnim = anim
    }

    if (this.gunProp) this.gunProp.visible = true
    this.tpsMesh.update(dt)
    this.applyRiflePose(this.bot.shootFlash > 0 ? 1 : 0)
    this.mesh.updateMatrixWorld(true)
    this.syncHumanHead()
    this.syncGunInHand()
  }

  public flashHit(): void {
    if (!this.mesh) return
    // Cheap full-mesh emissive pulse — no per-material timeout spam
    const previous: Array<{ mat: THREE.MeshStandardMaterial; hex: number }> = []
    this.mesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) return
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const m of mats) {
        const mat = m as THREE.MeshStandardMaterial
        if (!mat.emissive) continue
        previous.push({ mat, hex: mat.emissive.getHex() })
        mat.emissive.setHex(0xaa0000)
      }
    })
    window.setTimeout(() => {
      for (const entry of previous) entry.mat.emissive.setHex(entry.hex)
    }, 70)
  }
}
