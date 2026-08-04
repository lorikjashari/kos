import * as THREE from 'three'
import { TrainingBot } from '../../Core/TrainingBot'
import { bodyPartFromMeshName, MESH_HIT_COLORS } from '../../Core/BotMeshHit'
import type { BodyPart } from '../../Core/BodyPart'
import { Game } from '../../Game'
import { ThirdPersonMesh } from '../Mesh/ThirdPersonMesh'
import { IUpdatable } from '../../Interface/IUpdatable'
import { isTouchDevice } from '../../UI/MobileDevice'

interface StoredMaterial {
  mesh: THREE.Mesh
  original: THREE.Material | THREE.Material[]
}

export class TrainingBotRenderer implements IUpdatable {
  public bot: TrainingBot
  public mesh!: THREE.Object3D
  private tpsMesh?: ThirdPersonMesh
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
  /** Static GLB character (editor CS model) — procedural Idle/Walk/Run on its skeleton */
  private staticModel = false
  private wireframeOn = false
  /** Faint teammate silhouette shells; null colour = no outline */
  private outlineMeshes: THREE.Mesh[] = []
  private outlineColor: number | null = null
  private hitZonesOnly = false
  private storedWire: Array<{ mesh: THREE.Mesh; value: boolean }> = []
  private axesHelper?: THREE.AxesHelper
  /** Editor anim preview clip on the CS terrorist skeleton ('' = bind pose) */
  private animPreviewActive = ''
  private animPreviewTime = 0
  private csSkinned?: THREE.SkinnedMesh
  private csAnimBones: Record<string, THREE.Bone | undefined> = {}
  private csAnimBaseQ = new Map<THREE.Object3D, THREE.Quaternion>()
  /** Invisible hit capsules — synced to skeleton so aim matches the silhouette */
  private hitZoneByPart: Partial<Record<BodyPart | string, THREE.Mesh>> = {}
  private readonly _hzWorld = new THREE.Vector3()
  private readonly _hzNeck = new THREE.Vector3()
  private readonly _hzHips = new THREE.Vector3()
  private readonly _hzA = new THREE.Vector3()
  private readonly _hzB = new THREE.Vector3()
  private readonly _hzC = new THREE.Vector3()
  private readonly _hzD = new THREE.Vector3()
  private static readonly _HZ_UP = new THREE.Vector3(0, 1, 0)
  private targetHitHeight = 3.8
  /** Neck bone → top of the skull, measured off the bind pose at build time */
  private headSpan = 3.8 * 0.14
  private readonly _animQ = new THREE.Quaternion()
  private readonly _animE = new THREE.Euler()
  /** When true, procedural anim is paused so manual bone edits (editor rig) persist */
  private boneEditFrozen = false
  /**
   * Per-weapon prop config. `align` (radians, measured via PCA of the baked
   * verts) straightens the model to barrel +Z / slide +Y; `rot` seats it in the
   * hand (roll+yaw 180° like the USP, plus aim tilt); `seat` is the hand offset;
   * `len` is the third-person length in world units.
   */
  private static readonly GUN_DEFS: Record<
    string,
    { mesh: string; len: number; align: [number, number, number]; rot: [number, number, number]; seat: [number, number, number] }
  > = {
    Usp: {
      mesh: 'Usp',
      len: 0.62,
      align: [-3.0434, -0.0173, 3.1104],
      rot: [0.05, Math.PI, Math.PI],
      seat: [0.23, 0.035, 0.22],
    },
    AK: {
      mesh: 'AK47',
      len: 1.5,
      align: [3.1379, 0.0077, 3.0689],
      rot: [0.05, Math.PI, Math.PI],
      seat: [0.2, 0.05, 0.5],
    },
    Knife: {
      mesh: 'Knife',
      len: 0.55,
      align: [-3.0434, -0.0173, 3.1104],
      rot: [0.05, Math.PI, Math.PI],
      seat: [0.2, 0.04, 0.18],
    },
    AWP: {
      mesh: 'AwpRaw',
      len: 1.9,
      align: [0, Math.PI, 0],
      rot: [0.08, Math.PI, Math.PI],
      seat: [0.22, 0.04, 0.62],
    },
  }

  /** Map logic weapon keys to third-person prop keys */
  public static visualWeaponFor(weaponKey: string): string {
    if (weaponKey === 'AK47') return 'AK'
    if (weaponKey === 'AWP') return 'AWP'
    return 'Usp'
  }

  /** AK third-person uses baked `AkmRaw` when available. */
  private static resolveGunMeshKey(game: Game, gunKey: string, defaultMesh: string): string {
    if (gunKey === 'AK') {
      if (game.globalLoadingManager.loadableMeshs.has('AkmRaw')) return 'AkmRaw'
      if (game.globalLoadingManager.loadableMeshs.has('AK47')) return 'AK47'
    }
    return defaultMesh
  }

  /**
   * Baking a gun prop walks every vertex through bone + world transforms, which
   * is far too slow to redo per bot mid-match. Bake once, then hand out clones.
   */
  private static readonly gunPrototypes = new Map<string, THREE.Group | null>()

  /** Third-person weapon prop seated in the CS terrorist's right hand */
  private csGun?: THREE.Group
  /** Cached built weapon props by key ('Usp' | 'AK') */
  private csGuns: Record<string, THREE.Group | undefined> = {}
  /** Currently held weapon in the editor */
  private csWeapon = 'Usp'
  private readonly _gunPos = new THREE.Vector3()
  /** True for AI match bots using the CS model (auto walk/idle from movement) */
  private matchBot = false
  private readonly _matchPrevPos = new THREE.Vector3()
  private _stepAcc = Math.random() * 0.3

  constructor(bot: TrainingBot) {
    this.bot = bot
    this.game = Game.getInstance()

    if (bot.visualModel) {
      this.buildStaticModel(bot.visualModel)
      // AI match bots drive their own walk/idle and carry their loadout weapon.
      if (!bot.aiFrozen) {
        this.matchBot = true
        this._matchPrevPos.set(bot.position.x, bot.position.y, bot.position.z)
        this.animPreviewActive = 'Idle'
        this.setWeapon(TrainingBotRenderer.visualWeaponFor(bot.weaponKey))
      }
      return
    }

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

  /**
   * A nearby bot is the only thing that can cover most of a phone screen, so its
   * per-pixel cost dominates. Two things were making that expensive: the skins are
   * double-sided, which shades a second pass over the same pixels, and they use
   * MeshStandardMaterial, which evaluates a full GGX specular lobe per light. The
   * skins are already clamped to rough and non-metal so that lobe contributes
   * almost nothing, and Lambert keeps the diffuse and normal-map detail without it.
   */
  private static prepareSkinMaterials(mesh: THREE.Mesh): void {
    if (!mesh.material) return
    const mobile = isTouchDevice()
    const convert = (m: THREE.Material): THREE.Material => {
      const src = m as THREE.MeshStandardMaterial
      if (src.map) src.map.colorSpace = THREE.SRGBColorSpace
      const out = mobile && (src as unknown as { isMeshStandardMaterial?: boolean }).isMeshStandardMaterial
        ? TrainingBotRenderer.toLambert(src)
        : src
      out.side = mobile ? THREE.FrontSide : THREE.DoubleSide
      TrainingBotRenderer.applySkinLift(out as THREE.MeshStandardMaterial)
      return out
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material)
  }

  private static toLambert(src: THREE.MeshStandardMaterial): THREE.MeshLambertMaterial {
    // Not disposing src: prewarm clones can still share materials with the loaded asset
    const lambert = new THREE.MeshLambertMaterial({
      name: src.name,
      color: src.color,
      alphaTest: src.alphaTest,
      transparent: src.transparent,
      opacity: src.opacity,
      vertexColors: src.vertexColors,
      flatShading: src.flatShading,
    })
    lambert.map = src.map
    lambert.normalMap = src.normalMap
    lambert.normalScale = src.normalScale
    lambert.aoMap = src.aoMap
    lambert.alphaMap = src.alphaMap
    return lambert
  }

  /**
   * The map is lifted with an emissive pass so its interiors read, but bots had no
   * equivalent, so they sank into black in any corner the sun couldn't reach. Give
   * them a matching floor of self-illumination from their own albedo.
   */
  private static applySkinLift(mat: THREE.MeshStandardMaterial): void {
    if (!mat || !('emissive' in mat) || !mat.emissive) return
    const lift = isTouchDevice() ? 0.3 : 0.18
    if (mat.map) {
      mat.emissiveMap = mat.map
      mat.emissive.setRGB(1, 1, 1)
      mat.emissiveIntensity = lift
    } else {
      mat.emissive.copy(mat.color ?? new THREE.Color(0xffffff))
      mat.emissiveIntensity = lift * 0.7
    }
    if ('roughness' in mat) mat.roughness = Math.max(mat.roughness ?? 0.8, 0.7)
    if ('metalness' in mat) mat.metalness = Math.min(mat.metalness ?? 0, 0.1)
    mat.needsUpdate = true
  }

  /** CS / Sketchfab character: normalize to player-scale height, feet on ground. */
  private buildStaticModel(meshKey: string): void {
    this.staticModel = true
    const source = this.game.globalLoadingManager.loadableMeshs.get(meshKey)
    if (!source?.mesh) {
      console.warn(`[TrainingBot] visual model "${meshKey}" not loaded`)
      this.mesh = new THREE.Group()
      return
    }

    const root = new THREE.Group()
    root.name = 'BotStaticRoot'
    const model = source.cloneMesh() as unknown as THREE.Object3D
    model.name = meshKey

    // Unique materials so death fade doesn't leak
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) return
      if (Array.isArray(child.material)) child.material = child.material.map((m) => m.clone())
      else child.material = child.material.clone()
      child.castShadow = true
      // Nothing casts onto a bot on mobile now that the baked map doesn't, so the
      // per-pixel PCF taps buy nothing
      child.receiveShadow = !isTouchDevice()
      TrainingBotRenderer.prepareSkinMaterials(child)
    })

    root.add(model)
    // Measure raw size. Player capsule is ~4u tall — match that, not "1.85m".
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const size = new THREE.Vector3()
    box.getSize(size)
    const targetH = 3.8
    const s = targetH / Math.max(size.y, 0.0001)
    model.scale.setScalar(s)
    // Native +Z faces the look direction used by bot.yaw (atan2) — do not flip 180°
    model.rotation.y = 0
    model.updateMatrixWorld(true)
    const box2 = new THREE.Box3().setFromObject(root)
    // Sit feet on y=0 of root
    model.position.y -= box2.min.y
    // Recenter XZ so the character stands on the root origin
    const box3 = new THREE.Box3().setFromObject(root)
    const center = box3.getCenter(new THREE.Vector3())
    model.position.x -= center.x
    model.position.z -= center.z

    // Invisible hit zones sized for the CS silhouette (not pencil capsules)
    this.targetHitHeight = targetH
    this.attachHeightHitZones(root, targetH)

    this.mesh = root
    this.mesh.position.copy(this.bot.position)
    this.mesh.rotation.y = this.bot.yaw
    this.cacheCsAnimBones()
    this.tagBodyParts()
    this.collectHitMeshes()
    this.mesh.updateMatrixWorld(true)
    this.measureHeadSpan(targetH)
    this.syncHitZonesToBones()
    this.game.addToRenderer(this.mesh)
  }

  /** Cache CS Source terrorist bones from the skinned skeleton (not scene guesswork). */
  private cacheCsAnimBones(): void {
    let skinned: THREE.SkinnedMesh | undefined
    this.mesh.traverse((child) => {
      if (!skinned && (child as THREE.SkinnedMesh).isSkinnedMesh) {
        skinned = child as THREE.SkinnedMesh
      }
    })
    this.csSkinned = skinned

    const bones = skinned?.skeleton?.bones ?? []
    // Three.js GLTFLoader turns spaces into underscores ("leg left" → "leg_left")
    const norm = (s: string) => s.toLowerCase().replace(/[\s_]+/g, '')
    const byKey = new Map<string, THREE.Bone>()
    for (const bone of bones) byKey.set(norm(bone.name), bone)

    const find = (...needles: string[]): THREE.Bone | undefined => {
      for (const needle of needles) {
        const n = norm(needle)
        for (const [key, bone] of byKey) {
          if (key.includes(n)) return bone
        }
      }
      return undefined
    }

    this.csAnimBones = {
      hips: find('root hips'),
      spineL: find('spine lower'),
      spineU: find('spine upper 1', 'spine upper'),
      neck: find('neck upper', 'neck lower'),
      thighL: find('leg left thigh'),
      kneeL: find('leg left knee'),
      ankleL: find('leg left ankle'),
      thighR: find('leg right thigh'),
      kneeR: find('leg right knee'),
      ankleR: find('leg right ankle'),
      clavL: find('arm left shoulder 1'),
      clavR: find('arm right shoulder 1'),
      shoulderL: find('arm left shoulder 2'),
      elbowL: find('arm left elbow'),
      wristL: find('arm left wrist'),
      shoulderR: find('arm right shoulder 2'),
      elbowR: find('arm right elbow'),
      wristR: find('arm right wrist'),
    }

    this.csAnimBaseQ.clear()
    for (const bone of Object.values(this.csAnimBones)) {
      if (!bone) continue
      this.csAnimBaseQ.set(bone, bone.quaternion.clone())
    }

    if (this.csAnimBaseQ.size === 0) {
      console.warn('[TrainingBot] CS skeleton bones not found — anim preview disabled')
    }
  }

  private resetCsAnimBones(): void {
    for (const [bone, base] of this.csAnimBaseQ) {
      bone.quaternion.copy(base)
    }
  }

  /** Local euler offset on top of bind quaternion (hands / legs / spine). */
  private offsetBone(bone: THREE.Object3D | undefined, x: number, y: number, z: number): void {
    if (!bone) return
    this._animE.set(x, y, z, 'XYZ')
    this._animQ.setFromEuler(this._animE)
    bone.quaternion.multiply(this._animQ)
  }

  /**
   * Seat a third-person weapon prop in the right hand.
   * FPS viewmodels (USP/AK) live under an "Armature" node and need rest-pose
   * baking. The CS2 AWP is also skinned but has no Armature name — we bake any
   * SkinnedMesh found. Falls back to a simple prop if the model is absent.
   */
  private buildCsGun(key: string): THREE.Group | undefined {
    const existing = this.csGuns[key]
    if (existing) return existing
    const prototype = TrainingBotRenderer.buildGunPrototype(this.game, key)
    if (!prototype) return undefined

    const container = prototype.clone(true) as THREE.Group
    container.visible = false
    // Death fade writes opacity on every material it walks, so guns need their own
    container.traverse((child) => {
      child.userData.isGun = true
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh || !mesh.material) return
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => m.clone())
        : mesh.material.clone()
    })
    container.userData.isGun = true
    this.mesh.add(container)
    this.csGuns[key] = container
    return container
  }

  /** Warm every third-person gun bake so bot spawns never stall the frame. */
  public static prebakeGuns(game: Game): void {
    for (const key of Object.keys(TrainingBotRenderer.GUN_DEFS)) {
      TrainingBotRenderer.buildGunPrototype(game, key)
    }
  }

  /**
   * Bake the gun props and compile the bot skin + weapon shaders off-screen so
   * the first bots to spawn only pay for a skeleton clone.
   */
  public static prewarm(game: Game, renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    TrainingBotRenderer.prebakeGuns(game)

    const stage = new THREE.Group()
    stage.position.set(0, -520, 0)
    const source = game.globalLoadingManager.loadableMeshs.get('CsTerrorist')
    if (source?.mesh) {
      const model = source.cloneMesh() as unknown as THREE.Object3D
      model.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (!mesh.isMesh || !mesh.material) return
        mesh.castShadow = true
        mesh.receiveShadow = !isTouchDevice()
        TrainingBotRenderer.prepareSkinMaterials(mesh)
      })
      stage.add(model)
    }
    for (const key of Object.keys(TrainingBotRenderer.GUN_DEFS)) {
      const prototype = TrainingBotRenderer.gunPrototypes.get(key)
      if (!prototype) continue
      const clone = prototype.clone(true)
      clone.visible = true
      stage.add(clone)
    }

    scene.add(stage)
    try {
      renderer.compile(scene, camera)
      renderer.render(scene, camera)

      // The shadow-depth program is a separate compile, and it only happens while
      // a shadow caster is actually in the scene
      if (renderer.shadowMap.enabled) {
        renderer.shadowMap.needsUpdate = true
        renderer.render(scene, camera)
      }

      // Death fades flip `transparent`, which is part of the program cache key.
      // Compile that variant now so the flip is a cache hit mid-match.
      const flipped: Array<THREE.Material & { transparent: boolean }> = []
      stage.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (!mesh.isMesh || !mesh.material) return
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const m of mats) {
          if (m.transparent) continue
          m.transparent = true
          m.needsUpdate = true
          flipped.push(m as THREE.Material & { transparent: boolean })
        }
      })
      renderer.compile(scene, camera)
      renderer.render(scene, camera)
      for (const m of flipped) {
        m.transparent = false
        m.needsUpdate = true
      }
    } finally {
      scene.remove(stage)
    }
  }

  private static buildGunPrototype(game: Game, key: string): THREE.Group | undefined {
    const cached = TrainingBotRenderer.gunPrototypes.get(key)
    if (cached !== undefined) return cached ?? undefined
    const def = TrainingBotRenderer.GUN_DEFS[key]
    if (!def) return undefined

    const container = new THREE.Group()
    container.name = `CsGun_${key}`
    container.visible = false

    let gun: THREE.Object3D | undefined
    const meshKey = TrainingBotRenderer.resolveGunMeshKey(game, key, def.mesh)
    const source = game.globalLoadingManager.loadableMeshs.get(meshKey)
    if (source?.mesh) {
      const full = source.cloneMesh() as unknown as THREE.Object3D
      full.updateMatrixWorld(true)

      // New AKM pack: gun parts are static meshes (akm_*), arms are Object_67.
      // Third-person dummy should only hold the rifle, not FPS arms.
      if (meshKey === 'AkmRaw' || meshKey === 'AK47') {
        const gunGroup = new THREE.Group()
        const align = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(def.align[0], def.align[1], def.align[2], 'XYZ')
        )
        full.traverse((c) => {
          const m = c as THREE.Mesh
          if (!m.isMesh || !/^akm_/i.test(m.name)) return
          m.updateWorldMatrix(true, false)
          const cloned = m.clone(true)
          cloned.geometry = m.geometry.clone()
          const pos = cloned.geometry.attributes.position
          const v = new THREE.Vector3()
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i)
            v.applyMatrix4(m.matrixWorld)
            v.applyQuaternion(align)
            pos.setXYZ(i, v.x, v.y, v.z)
          }
          pos.needsUpdate = true
          cloned.geometry.computeVertexNormals()
          cloned.position.set(0, 0, 0)
          cloned.rotation.set(0, 0, 0)
          cloned.scale.set(1, 1, 1)
          cloned.castShadow = false
          cloned.receiveShadow = false
          gunGroup.add(cloned)
        })
        if (gunGroup.children.length > 0) {
          container.add(gunGroup)
          container.updateMatrixWorld(true)
          const box = new THREE.Box3().setFromObject(gunGroup)
          const size = box.getSize(new THREE.Vector3())
          const center = box.getCenter(new THREE.Vector3())
          gunGroup.position.sub(center)
          const longest = Math.max(size.x, size.y, size.z) || 1
          container.scale.setScalar(def.len / longest)
          gun = gunGroup
        }
      }

      // Prefer the FPS "Armature" subtree when present; otherwise bake whole tree.
      let bakeRoot: THREE.Object3D = full
      if (!gun) {
      full.traverse((c) => {
        if (c.name === 'Armature') bakeRoot = c
      })

      const skinned: THREE.SkinnedMesh[] = []
      bakeRoot.traverse((c) => {
        if ((c as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(c as THREE.SkinnedMesh)
      })

      if (skinned.length > 0) {
        // Skinned verts are often near-zero until bone transform — bake rest pose.
        // Textures are often missing on FPS packs (white), so use gunmetal unless
        // a map is present (AWP keeps its CS2 materials).
        const gunGroup = new THREE.Group()
        const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x14171b, roughness: 0.45, metalness: 0.6 })
        const v = new THREE.Vector3()
        const align = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(def.align[0], def.align[1], def.align[2], 'XYZ')
        )
        for (const sm of skinned) {
          sm.updateWorldMatrix(true, false)
          const srcPos = sm.geometry.attributes.position
          const arr = new Float32Array(srcPos.count * 3)
          for (let i = 0; i < srcPos.count; i++) {
            v.fromBufferAttribute(srcPos, i)
            sm.applyBoneTransform(i, v)
            v.applyMatrix4(sm.matrixWorld)
            v.applyQuaternion(align)
            arr[i * 3] = v.x
            arr[i * 3 + 1] = v.y
            arr[i * 3 + 2] = v.z
          }
          const baked = new THREE.BufferGeometry()
          baked.setAttribute('position', new THREE.BufferAttribute(arr, 3))
          if (sm.geometry.index) baked.setIndex(sm.geometry.index.clone())
          if (sm.geometry.attributes.uv) baked.setAttribute('uv', sm.geometry.attributes.uv.clone())
          baked.computeVertexNormals()

          let mat: THREE.Material | THREE.Material[] = fallbackMat
          if (sm.material) {
            const srcMats = Array.isArray(sm.material) ? sm.material : [sm.material]
            const hasMap = srcMats.some((m) => !!(m as THREE.MeshStandardMaterial).map)
            if (hasMap) {
              mat = Array.isArray(sm.material)
                ? sm.material.map((m) => {
                    const c = m.clone()
                    const mm = c as THREE.MeshStandardMaterial
                    if (mm.map) mm.map.colorSpace = THREE.SRGBColorSpace
                    return c
                  })
                : (() => {
                    const c = sm.material.clone()
                    const mm = c as THREE.MeshStandardMaterial
                    if (mm.map) mm.map.colorSpace = THREE.SRGBColorSpace
                    return c
                  })()
            }
          }

          const m = new THREE.Mesh(baked, mat)
          m.castShadow = false
          m.receiveShadow = false
          m.frustumCulled = false
          gunGroup.add(m)
        }
        if (gunGroup.children.length > 0) {
          container.add(gunGroup)
          container.updateMatrixWorld(true)
          const box = new THREE.Box3().setFromObject(gunGroup)
          const size = box.getSize(new THREE.Vector3())
          const center = box.getCenter(new THREE.Vector3())
          gunGroup.position.sub(center)
          const longest = Math.max(size.x, size.y, size.z) || 1
          container.scale.setScalar(def.len / longest)
          gun = gunGroup
        }
      }
      } // !gun — use classic FPS bake for USP / Knife / galil
    }

    if (!gun) {
      // Fallback: simple dark prop (barrel along +Z)
      const fb = new THREE.Group()
      const black = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.5, metalness: 0.45 })
      const grey = new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.6, metalness: 0.35 })
      const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => {
        const m = new THREE.Mesh(geo, mat)
        m.position.set(x, y, z)
        m.rotation.x = rx
        m.castShadow = false
        fb.add(m)
      }
      add(new THREE.BoxGeometry(0.11, 0.14, 0.34), black, 0, 0.02, 0.1)
      add(new THREE.BoxGeometry(0.08, 0.09, 0.12), grey, 0, 0.02, 0.3)
      add(new THREE.BoxGeometry(0.1, 0.24, 0.12), black, 0, -0.14, -0.02, 0.32)
      container.add(fb)
      gun = fb
    }

    // Mark the whole prop so editor display modes (X-ray / wireframe / hit-zones) skip it.
    container.userData.isGun = true
    container.traverse((c) => {
      c.userData.isGun = true
    })
    // Only cache a real bake — a fallback box built before the GLB landed would stick
    if (source?.mesh) TrainingBotRenderer.gunPrototypes.set(key, container)
    return container
  }

  /** Match bots: pick Idle / Walking / Running from their actual ground speed. */
  private driveMatchClip(dt: number): void {
    const p = this.bot.position
    let clip = 'Idle'
    if (this.bot.isMoving) {
      const dx = p.x - this._matchPrevPos.x
      const dz = p.z - this._matchPrevPos.z
      const spd = Math.sqrt(dx * dx + dz * dz) / Math.max(dt, 1e-3)
      clip = spd > 6.2 ? 'Running' : 'Walking'
    }
    this._matchPrevPos.set(p.x, p.y, p.z)
    if (clip !== this.animPreviewActive) this.animPreviewActive = clip

    // Footsteps timed to the gait cadence (run ~0.30s, walk ~0.58s per step).
    if (clip === 'Idle') {
      this._stepAcc = 0
    } else {
      this._stepAcc += dt
      const interval = clip === 'Running' ? 0.3 : 0.58
      if (this._stepAcc >= interval) {
        this._stepAcc -= interval
        this.emitFootstep(clip === 'Running')
      }
    }
  }

  /** Distance-culled spatial footstep (panner handles near/far volume). */
  private emitFootstep(run: boolean): void {
    const p = this.bot.position
    const player = this.game.currentPlayer?.player
    if (player) {
      const dx = p.x - player.position.x
      const dz = p.z - player.position.z
      if (dx * dx + dz * dz > 62 * 62) return
    }
    void this.game.audioManager.playFootstepAt({ x: p.x, y: p.y + 0.1, z: p.z }, run ? 1 : 0.75)
  }

  /** Switch which weapon the dummy holds ('Usp' | 'AK'). */
  public setWeapon(key: string): void {
    if (!TrainingBotRenderer.GUN_DEFS[key]) return
    this.csWeapon = key
    const gun = this.buildCsGun(key)
    for (const g of Object.values(this.csGuns)) if (g) g.visible = false
    if (gun) gun.visible = true
    this.csGun = gun
  }

  /** Seat the active weapon in the right hand each frame and aim it forward. */
  private syncCsGun(): void {
    const gun = this.csGun
    if (!gun || !gun.visible) return
    const wrist = this.csAnimBones.wristR
    if (!wrist) return
    const def = TrainingBotRenderer.GUN_DEFS[this.csWeapon]
    if (!def) return
    wrist.getWorldPosition(this._gunPos)
    this.mesh.worldToLocal(this._gunPos)
    // Gun is centered on its bbox — offset so the grip ends up in the palm.
    gun.position.set(this._gunPos.x + def.seat[0], this._gunPos.y + def.seat[1], this._gunPos.z + def.seat[2])
    // Models bake out upside-down and facing his body: roll 180° (Z) so the slide
    // is up, yaw 180° (Y) so the muzzle points away from him, + slight aim tilt.
    gun.rotation.set(def.rot[0], def.rot[1], def.rot[2])
  }

  /** Smooth 0..1 curve for gait accents */
  private smooth01(x: number): number {
    const t = Math.min(1, Math.max(0, x))
    return t * t * (3 - 2 * t)
  }

  /**
   * Two-handed pistol hold applied on top of any clip (idle / walk / run).
   * Validated bind-relative: both hands meet at the chest centerline, arms
   * forward, elbows out — the USP sits in the right hand. `bob` adds a tiny
   * vertical accent so it reads alive without leaving the aim.
   */
  private applyGunHoldArms(bob: number): void {
    const b = this.csAnimBones
    this.offsetBone(b.clavL, 0.06, -0.04, -0.05)
    this.offsetBone(b.clavR, 0.06, 0.04, 0.05)
    if (this.csWeapon === 'AK' || this.csWeapon === 'AWP') {
      // Rifle / sniper: right hand on the grip near the chest, left on the handguard
      this.offsetBone(b.shoulderR, -0.45 + bob, 0.95, 0)
      this.offsetBone(b.elbowR, -1.3, 0.55, 0.5)
      this.offsetBone(b.shoulderL, -0.5 + bob, -0.95, 0)
      this.offsetBone(b.elbowL, -0.9, -0.9, -0.1)
      this.offsetBone(b.wristR, 0.05, -0.1, 0)
      this.offsetBone(b.wristL, 0.1, -0.1, 0)
    } else {
      // Pistol: both hands together at the chest centerline
      this.offsetBone(b.shoulderL, -0.6 + bob, -1.2, 0)
      this.offsetBone(b.shoulderR, -0.6 + bob, 1.2, 0)
      this.offsetBone(b.elbowL, -0.8, -0.5, 0)
      this.offsetBone(b.elbowR, -0.8, 0.5, 0)
      this.offsetBone(b.wristL, 0.05, -0.15, 0)
      this.offsetBone(b.wristR, 0.05, 0.15, 0)
    }
  }

  /**
   * Advanced human gait for CS terrorist skeleton.
   * Shoulders + clavicles + elbows timed like a real walk/run (opposite arm/leg).
   */
  private updateCsProceduralAnim(dt: number): void {
    if (this.csAnimBaseQ.size === 0) return

    // Manual rig editing: leave bones wherever the user posed them, just refresh skin.
    if (this.boneEditFrozen) {
      if (this.csSkinned) {
        this.csSkinned.skeleton.bones.forEach((bone) => bone.updateMatrixWorld(true))
        this.csSkinned.skeleton.update()
      }
      return
    }

    this.resetCsAnimBones()
    const clip = this.animPreviewActive
    if (!clip) {
      if (this.csSkinned) this.csSkinned.skeleton.update()
      return
    }

    this.animPreviewTime += dt

    const t = this.animPreviewTime
    const b = this.csAnimBones

    if (clip === 'Idle') {
      const breath = Math.sin(t * 1.9) * 0.04
      const sway = Math.sin(t * 1.15) * 0.028
      const weight = Math.sin(t * 0.7) * 0.02
      this.offsetBone(b.hips, 0, sway * 0.45 + weight, 0)
      this.offsetBone(b.spineL, breath + 0.02, sway * 0.35, weight * 0.5)
      this.offsetBone(b.spineU, breath * 0.7, -sway * 0.28, 0)
      this.offsetBone(b.neck, breath * 0.3, sway * 0.7, breath * 0.35)
      // Always holding the pistol two-handed, gentle breathing only
      this.applyGunHoldArms(Math.sin(t * 1.8) * 0.012)
    } else {
      const run = clip === 'Running'
      // Cadence + amplitudes tuned like real gait (run = bigger pump, more lean)
      const speed = run ? 10.5 : 5.4
      const legAmp = run ? 0.7 : 0.44
      const kneeAmp = run ? 0.85 : 0.5
      const phase = t * speed
      const s1 = Math.sin(phase)
      const s2 = Math.sin(phase * 2) // double for hip bob / arm accents
      const c1 = Math.cos(phase)

      // Leg phase: +1 = left forward
      const swing = s1
      const swingOpp = -s1
      const liftL = this.smooth01(-swing)
      const liftR = this.smooth01(swing)
      const thighL = swing * legAmp
      const thighR = swingOpp * legAmp
      const kneeL = liftL * kneeAmp + (run ? 0.14 : 0.06)
      const kneeR = liftR * kneeAmp + (run ? 0.14 : 0.06)

      // —— Legs / core ——
      this.offsetBone(
        b.hips,
        Math.abs(s2) * (run ? 0.045 : 0.02) - (run ? 0.07 : 0.02),
        swing * (run ? 0.05 : 0.028),
        c1 * (run ? 0.025 : 0.012)
      )
      this.offsetBone(b.spineL, (run ? 0.12 : 0.03) + s2 * 0.03, swingOpp * (run ? 0.05 : 0.032), c1 * 0.015)
      this.offsetBone(b.spineU, run ? 0.08 : 0.02, swing * (run ? 0.04 : 0.025), 0)
      this.offsetBone(b.neck, run ? 0.04 : 0.01, swing * 0.03, 0)

      this.offsetBone(b.thighL, thighL, 0, 0)
      this.offsetBone(b.thighR, thighR, 0, 0)
      this.offsetBone(b.kneeL, kneeL, 0, 0)
      this.offsetBone(b.kneeR, kneeR, 0, 0)
      this.offsetBone(b.ankleL, -thighL * 0.32 - kneeL * 0.18 + liftL * 0.1, 0, 0)
      this.offsetBone(b.ankleR, -thighR * 0.32 - kneeR * 0.18 + liftR * 0.1, 0, 0)

      // —— Arms: keep the two-handed gun hold steady while the legs move ——
      // Small vertical bob so it reads alive without leaving the aim.
      this.applyGunHoldArms(s2 * (run ? 0.05 : 0.03))
    }

    if (this.csSkinned) {
      this.csSkinned.skeleton.bones.forEach((bone) => bone.updateMatrixWorld(true))
      this.csSkinned.skeleton.update()
    }
  }

  /**
   * Hit volumes for the CS terrorist — bone-measured boxes that hug the
   * silhouette (not oversized Minecraft slabs).
   *
   * - Head: skull-sized cube on the neck
   * - Body: chest/torso between hips and chin
   * - Arms: thin boxes shoulder→wrist (still body damage)
   * - Legs: separate left/right thigh→ankle boxes
   *
   * Decorative skin is not raycastable (bind-pose verts ≠ animated pose), so
   * these zones are the real hit surfaces and must track the skeleton.
   */
  private attachHeightHitZones(root: THREE.Object3D, height: number): void {
    this.hitZoneByPart = {}
    const mk = (id: string, part: BodyPart) => {
      const mat = new THREE.MeshBasicMaterial({
        visible: false,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat)
      mesh.name = `HitZone_${id}`
      mesh.userData.bodyPart = part
      mesh.frustumCulled = false
      root.add(mesh)
      this.hitZoneByPart[id] = mesh
      return mesh
    }

    mk('legsL', 'legs')
    mk('legsR', 'legs')
    mk('body', 'body')
    mk('armL', 'body')
    mk('armR', 'body')
    mk('head', 'head')

    // Height-fraction fallback until the first bone sync
    this.spanZone('legsL', 0, height * 0.46, height * 0.09, height * 0.1, -height * 0.06, 0)
    this.spanZone('legsR', 0, height * 0.46, height * 0.09, height * 0.1, height * 0.06, 0)
    this.spanZone('body', height * 0.46, height * 0.82, height * 0.18, height * 0.12)
    this.spanZone('armL', height * 0.55, height * 0.8, height * 0.07, height * 0.07, -height * 0.16, 0)
    this.spanZone('armR', height * 0.55, height * 0.8, height * 0.07, height * 0.07, height * 0.16, 0)
    this.spanZone('head', height * 0.82, height, height * 0.115, height * 0.12)

    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      if (String(child.name).startsWith('HitZone_')) return
      child.raycast = () => {}
    })
  }

  /** Size + place a unit-cube hit zone to span [bottom, top] in root-local space. */
  private spanZone(id: string, bottom: number, top: number, width: number, depth: number, x = 0, z = 0): void {
    const zone = this.hitZoneByPart[id]
    if (!zone) return
    const h = Math.max(0.05, top - bottom)
    zone.scale.set(Math.max(0.04, width), h, Math.max(0.04, depth))
    zone.position.set(x, bottom + h * 0.5, z)
    zone.rotation.set(0, 0, 0)
    zone.visible = true
  }

  /**
   * Place a zone between two points (bone-local), with a given cross-section.
   * Aligns the box Y axis along the bone segment.
   */
  private spanZoneBetween(
    id: string,
    a: THREE.Vector3,
    b: THREE.Vector3,
    thicknessX: number,
    thicknessZ: number
  ): void {
    const zone = this.hitZoneByPart[id]
    if (!zone) return
    const mid = this._hzC.copy(a).add(b).multiplyScalar(0.5)
    const len = Math.max(0.06, a.distanceTo(b))
    zone.position.copy(mid)
    zone.scale.set(Math.max(0.04, thicknessX), len, Math.max(0.04, thicknessZ))
    const dir = this._hzWorld.copy(b).sub(a)
    if (dir.lengthSq() < 1e-8) {
      zone.quaternion.identity()
    } else {
      dir.normalize()
      zone.quaternion.setFromUnitVectors(TrainingBotRenderer._HZ_UP, dir)
    }
    zone.visible = true
  }

  /**
   * In the bind pose the model's highest point is the top of the head, so the
   * distance from the neck bone up to it is the head's real height — no need to
   * guess a fraction that only fits one character model.
   */
  private measureHeadSpan(height: number): void {
    const neckY = this.boneLocalY(this.csAnimBones.neck || this.csAnimBones.spineU)
    if (neckY === undefined) return
    // Keep the skull snug — oversized head boxes ate into helmet + air above
    this.headSpan = Math.min(height * 0.155, Math.max(height * 0.1, (height - neckY) * 0.92))
  }

  /** Root-local position of a bone. False when the rig doesn't have it. */
  private boneLocalInto(bone: THREE.Bone | undefined, out: THREE.Vector3): boolean {
    if (!bone) return false
    bone.getWorldPosition(this._hzWorld)
    this.mesh.worldToLocal(this._hzWorld)
    out.copy(this._hzWorld)
    return true
  }

  /** Root-local Y of a bone, or undefined when the rig doesn't have it. */
  private boneLocalY(bone: THREE.Bone | undefined): number | undefined {
    if (!this.boneLocalInto(bone, this._hzWorld)) return undefined
    return this._hzWorld.y
  }

  /** Keep hit zones on the animated skeleton so walking bots stay hittable. */
  private syncHitZonesToBones(): void {
    if (!this.staticModel || Object.keys(this.hitZoneByPart).length === 0) return
    const b = this.csAnimBones
    const h = this.targetHitHeight

    if (!this.boneLocalInto(b.neck || b.spineU, this._hzNeck)) return
    if (!this.boneLocalInto(b.hips || b.spineL, this._hzHips)) return
    const neckY = this._hzNeck.y

    // —— Head: tight skull on the neck ——
    const headBottom = neckY - h * 0.018
    const headTop = neckY + this.headSpan
    const headW = h * 0.112
    const headD = h * 0.12
    this.spanZone('head', headBottom, headTop, headW, headD, this._hzNeck.x, this._hzNeck.z)

    // —— Torso: hips → chin, width from shoulders (not Minecraft slab) ——
    const hipSeam = this._hzHips.y - h * 0.015
    let torsoW = h * 0.175
    let torsoD = h * 0.115
    let torsoX = (this._hzNeck.x + this._hzHips.x) * 0.5
    let torsoZ = (this._hzNeck.z + this._hzHips.z) * 0.5
    const hasSL = this.boneLocalInto(b.shoulderL || b.clavL, this._hzA)
    const hasSR = this.boneLocalInto(b.shoulderR || b.clavR, this._hzB)
    if (hasSL && hasSR) {
      const sw = this._hzA.distanceTo(this._hzB)
      // Cover chest + delts, not full outstretched arms
      torsoW = THREE.MathUtils.clamp(sw * 0.78, h * 0.14, h * 0.22)
      torsoX = (this._hzA.x + this._hzB.x) * 0.5
      torsoZ = (this._hzA.z + this._hzB.z) * 0.5
      torsoD = THREE.MathUtils.clamp(sw * 0.42, h * 0.1, h * 0.14)
    }
    this.spanZone('body', hipSeam, headBottom, torsoW, torsoD, torsoX, torsoZ)

    // —— Arms: thin segments (body damage) so torso can stay chest-sized ——
    const armThick = h * 0.065
    if (this.boneLocalInto(b.shoulderL || b.clavL, this._hzA)) {
      if (!this.boneLocalInto(b.wristL || b.elbowL, this._hzB)) {
        this._hzB.copy(this._hzA).add(this._hzD.set(-h * 0.12, -h * 0.2, 0))
      }
      this.spanZoneBetween('armL', this._hzA, this._hzB, armThick, armThick)
    }
    if (this.boneLocalInto(b.shoulderR || b.clavR, this._hzA)) {
      if (!this.boneLocalInto(b.wristR || b.elbowR, this._hzB)) {
        this._hzB.copy(this._hzA).add(this._hzD.set(h * 0.12, -h * 0.2, 0))
      }
      this.spanZoneBetween('armR', this._hzA, this._hzB, armThick, armThick)
    }

    // —— Legs: one box per leg ——
    this.syncLegZone('legsL', b.thighL, b.ankleL || b.kneeL, hipSeam, h, -1)
    this.syncLegZone('legsR', b.thighR, b.ankleR || b.kneeR, hipSeam, h, 1)
  }

  private syncLegZone(
    id: string,
    thigh: THREE.Bone | undefined,
    ankle: THREE.Bone | undefined,
    hipSeam: number,
    h: number,
    side: -1 | 1
  ): void {
    const thick = h * 0.088
    if (this.boneLocalInto(thigh, this._hzA) && this.boneLocalInto(ankle, this._hzB)) {
      // Extend slightly past ankle toward the sole
      this._hzB.y = Math.min(this._hzB.y, 0.04)
      this._hzA.y = Math.max(this._hzA.y, hipSeam - h * 0.02)
      this.spanZoneBetween(id, this._hzA, this._hzB, thick, thick * 1.05)
      return
    }
    // Fallback: vertical box on that side
    this.spanZone(id, 0, hipSeam, thick, thick * 1.05, side * h * 0.065, this._hzHips.z)
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

  /**
   * Play Idle / Walking / Running on the CS terrorist skeleton (no robot swap).
   * Pass '' to freeze back to bind pose.
   */
  public previewAnim(clip: string): void {
    // Starting an animation cancels manual rig editing
    this.boneEditFrozen = false
    this.animPreviewActive = clip
    this.animPreviewTime = 0
    this.resetCsAnimBones()
    // A weapon is always held (Idle / Walking / Running)
    this.setWeapon(this.csWeapon)
    if (!clip) return
    // Kick one frame so Idle isn't a frozen T-pose until the next update
    this.updateCsProceduralAnim(0)
  }

  /** Pause/resume procedural anim so the editor can pose individual bones. */
  public setBoneEditMode(on: boolean): void {
    this.boneEditFrozen = on
  }

  /** Curated joints the editor rig menu can grab (CS terrorist skeleton). */
  public getEditableBones(): Array<{ key: string; label: string }> {
    const b = this.csAnimBones
    const list: Array<[string, string]> = [
      ['neck', 'Head / Neck'],
      ['spineU', 'Chest'],
      ['spineL', 'Waist'],
      ['hips', 'Hips'],
      ['clavL', 'Shoulder L'],
      ['shoulderL', 'Upper arm L'],
      ['elbowL', 'Elbow L'],
      ['wristL', 'Wrist L'],
      ['clavR', 'Shoulder R'],
      ['shoulderR', 'Upper arm R'],
      ['elbowR', 'Elbow R'],
      ['wristR', 'Wrist R'],
      ['thighL', 'Thigh L'],
      ['kneeL', 'Knee L'],
      ['ankleL', 'Ankle L'],
      ['thighR', 'Thigh R'],
      ['kneeR', 'Knee R'],
      ['ankleR', 'Ankle R'],
    ]
    return list.filter(([key]) => !!b[key]).map(([key, label]) => ({ key, label }))
  }

  /** Resolve a rig-menu key to the actual bone object (for gizmo attach). */
  public getBoneByKey(key: string): THREE.Object3D | undefined {
    return this.csAnimBones[key]
  }

  /** Enter rig editing: pause anim and snap to bind so edits are clean offsets. */
  public beginBoneEdit(): void {
    this.resetCsAnimBones()
    this.boneEditFrozen = true
    this.csSkinned?.skeleton.update()
  }

  /** Local rotation offset of a bone from its bind pose, in degrees (XYZ). */
  public getBoneOffsetDeg(key: string): { x: number; y: number; z: number } {
    const bone = this.csAnimBones[key]
    const base = bone ? this.csAnimBaseQ.get(bone) : undefined
    if (!bone || !base) return { x: 0, y: 0, z: 0 }
    this._animQ.copy(base).invert().multiply(bone.quaternion)
    this._animE.setFromQuaternion(this._animQ, 'XYZ')
    const d = 180 / Math.PI
    return { x: this._animE.x * d, y: this._animE.y * d, z: this._animE.z * d }
  }

  /** Set a bone to bind + the given local euler offset (degrees, XYZ). */
  public setBoneOffsetDeg(key: string, x: number, y: number, z: number): void {
    const bone = this.csAnimBones[key]
    const base = bone ? this.csAnimBaseQ.get(bone) : undefined
    if (!bone || !base) return
    const r = Math.PI / 180
    this._animE.set(x * r, y * r, z * r, 'XYZ')
    this._animQ.setFromEuler(this._animE)
    bone.quaternion.copy(base).multiply(this._animQ)
    this.csSkinned?.skeleton.update()
  }

  /** Reset one joint back to its bind pose. */
  public resetBone(key: string): void {
    const bone = this.csAnimBones[key]
    const base = bone ? this.csAnimBaseQ.get(bone) : undefined
    if (bone && base) {
      bone.quaternion.copy(base)
      this.csSkinned?.skeleton.update()
    }
  }

  /** Human-readable summary of every joint the user rotated away from bind. */
  public getPoseEditsText(): string {
    const bones = this.getEditableBones()
    const lines: string[] = []
    for (const { key, label } of bones) {
      const o = this.getBoneOffsetDeg(key)
      if (Math.abs(o.x) < 0.5 && Math.abs(o.y) < 0.5 && Math.abs(o.z) < 0.5) continue
      lines.push(`  ${key} (${label}): x=${o.x.toFixed(1)} y=${o.y.toFixed(1)} z=${o.z.toFixed(1)}`)
    }
    if (!lines.length) return 'POSE EDIT (cs_terrorist): no joints changed'
    return (
      'POSE EDIT (cs_terrorist) — local euler degrees, order XYZ, offset from bind pose:\n' +
      lines.join('\n')
    )
  }

  public setAxesVisible(visible: boolean): void {
    if (visible) {
      if (!this.axesHelper) {
        this.axesHelper = new THREE.AxesHelper(2.2)
        this.axesHelper.name = 'EditorAxes'
        this.mesh.add(this.axesHelper)
      }
      this.axesHelper.visible = true
    } else if (this.axesHelper) {
      this.axesHelper.visible = false
    }
  }

  public setWireframe(on: boolean): void {
    if (on === this.wireframeOn) return
    if (on) {
      this.storedWire = []
      this.mesh.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !child.material) return
        if (child.userData?.isGun || child.userData?.isTeamOutline) return
        if (String(child.name).startsWith('HitZone_')) return
        if (child.name === 'EditorAxes') return
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        // Store once per mesh using first material's wireframe flag
        const first = mats[0] as THREE.MeshStandardMaterial
        if (!first || !('wireframe' in first)) return
        this.storedWire.push({ mesh: child, value: !!first.wireframe })
        for (const m of mats) {
          const mat = m as THREE.MeshStandardMaterial
          if ('wireframe' in mat) mat.wireframe = true
        }
      })
      this.wireframeOn = true
    } else {
      for (const entry of this.storedWire) {
        const mats = Array.isArray(entry.mesh.material) ? entry.mesh.material : [entry.mesh.material]
        for (const m of mats) {
          const mat = m as THREE.MeshStandardMaterial
          if ('wireframe' in mat) mat.wireframe = entry.value
        }
      }
      this.storedWire = []
      this.wireframeOn = false
    }
  }

  /** Hide decorative skin, leave hit capsules (useful with xray). */
  public setHitZonesOnly(on: boolean): void {
    this.hitZonesOnly = on
    this.mesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      if (child.userData?.isGun || child.userData?.isTeamOutline) return
      if (String(child.name).startsWith('HitZone_')) {
        child.visible = true
        // Show zones when isolating
        if (on) {
          const mat = child.material as THREE.MeshBasicMaterial
          if (mat) {
            mat.visible = true
            mat.wireframe = true
            mat.transparent = true
            mat.opacity = 0.55
            const part = child.userData.bodyPart as BodyPart | undefined
            if (part) mat.color.setHex(MESH_HIT_COLORS[part])
          }
        } else {
          const mat = child.material as THREE.MeshBasicMaterial
          if (mat) {
            mat.visible = false
            mat.opacity = 1
          }
        }
        return
      }
      if (child.name === 'EditorAxes') return
      child.visible = !on
    })
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
    // With dedicated zones the skin isn't raycastable, so colouring it too just
    // drew a body-coloured silhouette over the real volumes and hid them.
    const zonesOnly = Object.keys(this.hitZoneByPart).length > 0
    this.mesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) return
      if (child.userData?.isGun || child.userData?.isTeamOutline) return
      const isZone = String(child.name).startsWith('HitZone_')
      if (zonesOnly && !isZone) return
      const part = (child.userData.bodyPart as BodyPart | undefined) ?? this.inferFromParent(child)
      this.storedMaterials.push({ mesh: child, original: child.material })
      child.material = new THREE.MeshBasicMaterial({
        color: MESH_HIT_COLORS[part],
        wireframe: true,
        transparent: true,
        opacity: 0.9,
        depthTest: !isZone,
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

  /** Last opacity pushed to this bot's materials — avoids redundant per-frame writes. */
  private appliedOpacity = 1

  /**
   * `transparent` is part of the shader program cache key, so flipping it forces a
   * recompile. Opacity itself is only a uniform. Writing `needsUpdate` every frame
   * of a death fade recompiled every material on every bot, every frame.
   */
  private setMeshOpacity(opacity: number): void {
    if (this.appliedOpacity === opacity) return
    const wasOpaque = this.appliedOpacity >= 1
    const isOpaque = opacity >= 1
    this.appliedOpacity = opacity
    this.mesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || child.userData?.isTeamOutline) return
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const m of mats) {
        const mat = m as THREE.Material & { opacity?: number; transparent?: boolean }
        if (!mat) continue
        mat.opacity = opacity
        if (wasOpaque !== isOpaque) {
          mat.transparent = !isOpaque
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
    if (this.appliedOpacity >= 1) return
    this.appliedOpacity = 1
    // Restore opaque mats after fade
    this.mesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || child.userData?.isTeamOutline) return
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

    this.tpsMesh?.update(1 / 60)
  }

  public update(dt: number): void {
    if (!this.mesh) return
    if (!this.staticModel && !this.tpsMesh) return

    const want = TrainingBot.showHitboxes && this.bot.isAlive
    if (want !== this.overlayOn) this.setHitboxVisible(want)
    this.syncTeamOutline()

    // Just died this frame — pick fall side, freeze animation base
    if (this.wasAlive && !this.bot.isAlive) {
      this.fallSide = Math.random() < 0.5 ? -1 : 1
      this.deathBaseY = this.bot.position.y
      if (this.overlayOn) this.clearHitboxOverlay()
      if (this.gunProp) this.gunProp.visible = false
      if (this.csGun) this.csGun.visible = false
    }

    // Just respawned — wipe leftover blood stickers
    if (!this.wasAlive && this.bot.isAlive) {
      this.game.renderer.bloodManager?.clearOn(this.mesh)
      this.resetMeshOpacity()
      this.mesh.visible = true
      this.mesh.rotation.set(0, this.bot.yaw, 0)
      this.lastMoveAnim = ''
      this.tpsMesh?.playAnimation('Idle', true, true)
      if (this.gunProp) this.gunProp.visible = true
      if (this.csGun) this.csGun.visible = true
    }
    this.wasAlive = this.bot.isAlive

    if (!this.bot.isAlive) {
      this.updateDeathPose()
      this.mesh.updateMatrixWorld(true)
      this.syncHumanHead()
      return
    }

    this.mesh.visible = true
    // While editor gizmo is dragging, Game owns the mesh transform
    if (!this.game.isEditorTransformDragging()) {
      this.mesh.position.set(
        this.bot.position.x,
        this.bot.position.y - (this.bot.isCrouching ? 0.95 : 0),
        this.bot.position.z
      )
      this.mesh.rotation.order = 'YXZ'
      this.mesh.rotation.y = this.bot.yaw
      this.mesh.rotation.x = this.bot.isCrouching ? 0.12 : 0
      this.mesh.rotation.z = 0
      const vs = this.bot.visualScale || 1
      if (this.staticModel) {
        const crouchScale = this.bot.isCrouching ? 0.82 : 1
        this.mesh.scale.set(vs, vs * crouchScale, vs)
      }
    }

    if (this.staticModel) {
      if (this.matchBot) this.driveMatchClip(dt)
      this.updateCsProceduralAnim(dt)
      this.mesh.updateMatrixWorld(true)
      this.syncHitZonesToBones()
      this.mesh.updateMatrixWorld(true)
      this.syncCsGun()
      return
    }

    // Legs-only locomotion so arms stay in ADS rifle pose
    const anim = this.bot.isMoving ? 'Walking' : 'Idle'
    if (anim !== this.lastMoveAnim) {
      this.tpsMesh!.playAnimation(anim, true, true)
      this.lastMoveAnim = anim
    }

    if (this.gunProp) this.gunProp.visible = true
    this.tpsMesh!.update(dt)
    this.applyRiflePose(this.bot.shootFlash > 0 ? 1 : 0)
    this.mesh.updateMatrixWorld(true)
    this.syncHumanHead()
    this.syncGunInHand()
  }

  /**
   * Faint team silhouette: a back-faced copy of each body mesh, pushed out along
   * its bind-pose normals in the vertex shader so the shell still follows the
   * skeleton. Cheap enough to keep on every teammate for the whole match.
   */
  private setTeamOutline(color: number | null): void {
    if (this.outlineColor === color) return
    this.outlineColor = color
    for (const shell of this.outlineMeshes) {
      shell.removeFromParent()
      ;(shell.material as THREE.Material).dispose()
    }
    this.outlineMeshes = []
    if (color === null) return

    const sources: THREE.Mesh[] = []
    this.mesh.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh || !mesh.geometry) return
      if (child.userData?.isGun || child.userData?.isTeamOutline) return
      if (mesh.name.startsWith('HitZone_')) return
      sources.push(mesh)
    })

    for (const src of sources) {
      const material = new THREE.MeshBasicMaterial({
        color,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      })
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n\ttransformed += normal * 0.055;'
        )
      }

      let shell: THREE.Mesh
      const skinned = src as THREE.SkinnedMesh
      if (skinned.isSkinnedMesh) {
        const clone = new THREE.SkinnedMesh(src.geometry, material)
        clone.bindMode = skinned.bindMode
        clone.bind(skinned.skeleton, skinned.bindMatrix)
        shell = clone
      } else {
        shell = new THREE.Mesh(src.geometry, material)
      }
      shell.userData.isTeamOutline = true
      shell.name = 'TeamOutline'
      shell.castShadow = false
      shell.receiveShadow = false
      shell.frustumCulled = src.frustumCulled
      shell.renderOrder = -1
      shell.position.copy(src.position)
      shell.quaternion.copy(src.quaternion)
      shell.scale.copy(src.scale)
      src.parent?.add(shell)
      this.outlineMeshes.push(shell)
    }
  }

  private syncTeamOutline(): void {
    const wanted = this.game.isFriendlyToLocalPlayer(this.bot) ? this.game.teamOutlineColor(this.bot) : null
    this.setTeamOutline(wanted)
    if (this.outlineMeshes.length === 0) return
    const visible = this.bot.isAlive
    for (const shell of this.outlineMeshes) shell.visible = visible
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

  public dispose(): void {
    try {
      this.game.renderer.bloodManager?.clearOn(this.mesh)
    } catch {
      /* ignore */
    }
    this.setTeamOutline(null)
    this.mesh.removeFromParent()
  }
}
