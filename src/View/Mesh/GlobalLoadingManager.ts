import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { LoadableMesh } from './LoadableMesh'
import { FPSMesh } from './FPSMesh'
import { ThirdPersonMesh } from './ThirdPersonMesh'
import { MapMesh } from './MapMesh'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { Vector3D } from '../../Core/Vector'
import { Game } from '../../Game'

export class GlobalLoadingManager extends THREE.LoadingManager {
  public static instance: GlobalLoadingManager
  private static gltfLoader: GLTFLoader = new GLTFLoader()
  private static jsonLoader: THREE.ObjectLoader = new THREE.ObjectLoader()
  private static dracoLoader: DRACOLoader = new DRACOLoader()
  public loadableMeshs: Map<string, LoadableMesh> = new Map<string, LoadableMesh>()

  public fpsMesh!: THREE.Mesh
  public thirdPersonMesh!: THREE.Mesh
  constructor() {
    super()
    this.onStart = this._onStart
    this.onLoad = this._onLoad
    this.onProgress = this._onProgress
    this.onError = this._onError
    GlobalLoadingManager.dracoLoader.setDecoderPath(
      'https://www.gstatic.com/draco/versioned/decoders/1.5.6/'
    )

    GlobalLoadingManager.gltfLoader.setMeshoptDecoder(MeshoptDecoder)
    GlobalLoadingManager.gltfLoader.setDRACOLoader(GlobalLoadingManager.dracoLoader)
  }
  _onStart(url, itemsLoaded, itemsTotal): void {
    console.log('Started loading file: ' + url + '.\nLoaded ' + itemsLoaded + ' of ' + itemsTotal + ' files.')
  }
  _onLoad() {
    console.log('Loading complete!')
  }
  _onProgress(url, itemsLoaded, itemsTotal) {
    console.log('Loading file: ' + url + '.\nLoaded ' + itemsLoaded + ' of ' + itemsTotal + ' files.')
  }

  _onError(url) {
    console.log('There was an error loading ' + url)
  }
  public static getInstance(): GlobalLoadingManager {
    if (!GlobalLoadingManager.instance) {
      GlobalLoadingManager.instance = new GlobalLoadingManager()
    }
    return GlobalLoadingManager.instance
  }
  async loadAllMeshs() {
    // Idempotent — Start/Host/Join call this after menu dispose.
    if (this.loadableMeshs.has('AK47') && this.loadableMeshs.has('CsTerrorist')) return

    // Good looking textures
    // https://opengameart.org/users/rubberduck
    // https://opengameart.org/content/2k-handpainted-style-textures
    // https://opengameart.org/content/8-handpainted-style-textures

    const tpsmesh = new ThirdPersonMesh()
    await tpsmesh.load()
    tpsmesh.register(this.loadableMeshs)

    // Maps load on demand via loadMapMesh / Game.ensureMap after the player
    // picks Pool Day or Dust II (keeps boot to weapons + character only).

    // Galil pack kept for AWP hands / armature seat
    const akHands = new FPSMesh('fps_mine_sketch_galil.glb', 'AK47Hands')
    await akHands.load()
    akHands.register(this.loadableMeshs)

    // Main AK: Sketchfab AKM (own arms + Scene reload)
    const ak = new FPSMesh(
      'models/akm_assault_rifle_animated.glb',
      'AK47',
      new Vector3D(0.2, -0.25, -0.16),
      false
    )
    await ak.load()
    ak.register(this.loadableMeshs)

    // Same GLB for third-person bake — clone in memory, don't reload 33MB
    const akmRaw = new LoadableMesh('models/akm_assault_rifle_animated.glb', 'AkmRaw')
    akmRaw.setMesh(ak.cloneMesh())
    akmRaw.register(this.loadableMeshs)

    const usp = new FPSMesh('fps_mine_sketch_compressed.glb', 'Usp', new Vector3D(-0.09, 0.26, 0.35))
    await usp.load()
    usp.register(this.loadableMeshs)

    const m9 = new FPSMesh('fps_mine_sketch_m9.glb', 'Knife')
    await m9.load()
    m9.register(this.loadableMeshs)

    const bullet = new LoadableMesh('9mm2douille.glb', 'Bullet')
    await bullet.load()
    bullet.register(this.loadableMeshs)

    // CS Source terrorist — used for the editor dummy AND the in-match bots
    const csT = new LoadableMesh('models/cs_terrorist.glb', 'CsTerrorist')
    await csT.load()
    csT.register(this.loadableMeshs)

    // CS2 AWP mesh — composed with Galil hands into an FPS viewmodel
    const awpRaw = new LoadableMesh('models/awp.glb', 'AwpRaw')
    await awpRaw.load()
    awpRaw.register(this.loadableMeshs)
    this.registerAwpViewmodel(akHands)
  }

  /**
   * FPS AWP base: Galil hands + animations. Keep the Armature node (seat for the
   * AWP prop) but hide the Galil gun meshes.
   */
  private registerAwpViewmodel(akSource: FPSMesh): void {
    const awpFps = akSource.clone()
    awpFps.key = 'AWP'
    // Same screen nudge as the previous AWP-only seat tweak — hands move with the rifle
    awpFps.viewmodelOffset = new Vector3D(0.13, -0.17, 0)

    const root = awpFps.mesh as unknown as THREE.Object3D
    root.traverse((c) => {
      // Hide Galil gun meshes; keep Armature transform as the AWP seat
      if (c.name === 'Torus' || c.name === 'Torus_1' || c.name === 'Torus001') {
        c.visible = false
      }
      if ((c as THREE.Mesh).isMesh && c.parent?.name === 'Armature') {
        c.visible = false
      }
    })

    awpFps.register(this.loadableMeshs)
  }

  /** Bake AKM rifle meshes (no Sketchfab arms) for third-person / HUD icons. */
  public createAkmViewProp(): THREE.Group | undefined {
    const akmRaw = this.loadableMeshs.get('AkmRaw')
    if (!akmRaw?.mesh) return undefined
    const full = akmRaw.cloneMesh() as unknown as THREE.Object3D
    full.updateMatrixWorld(true)

    const group = new THREE.Group()
    const fallbackMat = new THREE.MeshBasicMaterial({
      color: 0x2c3238,
      side: THREE.DoubleSide,
    })

    full.traverse((c) => {
      const m = c as THREE.Mesh
      if (!m.isMesh || !m.name || !/^akm_/i.test(m.name)) return
      // Prefer leaf meshes with geometry
      if (!m.geometry) return
      m.updateWorldMatrix(true, false)
      const geo = m.geometry.clone()
      geo.applyMatrix4(m.matrixWorld)
      geo.computeVertexNormals()

      let mat: THREE.Material | THREE.Material[] = fallbackMat
      if (m.material) {
        const srcMats = Array.isArray(m.material) ? m.material : [m.material]
        const hasMap = srcMats.some((x) => !!(x as THREE.MeshStandardMaterial).map)
        if (hasMap) {
          const mapped = srcMats.map((x) => {
            const src = x as THREE.MeshStandardMaterial
            const basic = new THREE.MeshBasicMaterial({
              map: src.map,
              color: 0xffffff,
              side: THREE.DoubleSide,
            })
            if (basic.map) basic.map.colorSpace = THREE.SRGBColorSpace
            return basic
          })
          mat = mapped.length === 1 ? mapped[0] : mapped
        } else {
          mat = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone()
        }
      }
      const mesh = new THREE.Mesh(geo, mat)
      mesh.name = m.name
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.frustumCulled = false
      group.add(mesh)
    })

    if (group.children.length === 0) return undefined
    group.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(group)
    const center = box.getCenter(new THREE.Vector3())
    for (const child of group.children) {
      child.position.sub(center)
    }
    return group
  }

  /** Bake a fresh AWP prop for attaching onto the FPS Armature seat. */
  public createAwpViewProp(): THREE.Group | undefined {
    const awpRaw = this.loadableMeshs.get('AwpRaw')
    if (!awpRaw) return undefined
    return this.bakeAwpProp(awpRaw)
  }

  private bakeAwpProp(awpRaw: LoadableMesh): THREE.Group | undefined {
    const full = awpRaw.cloneMesh() as unknown as THREE.Object3D
    full.updateMatrixWorld(true)

    let grip = new THREE.Vector3()
    let foundGrip = false
    full.traverse((c) => {
      if (!foundGrip && c.name === 'weapon_hand_r_4') {
        c.getWorldPosition(grip)
        foundGrip = true
      }
    })

    const group = new THREE.Group()
    // BasicMaterial: always visible under the viewmodel camera (Physical/Standard
    // without maps/envmap often reads as pure black / "missing").
    const fallbackMat = new THREE.MeshBasicMaterial({
      color: 0x2c3238,
      side: THREE.DoubleSide,
    })
    const v = new THREE.Vector3()
    const align = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.0029, -0.0013, 0.0033, 'XYZ'))

    let bakedAny = false
    full.traverse((c) => {
      const sm = c as THREE.SkinnedMesh
      if (!sm.isSkinnedMesh) return
      sm.updateWorldMatrix(true, false)
      if (!foundGrip) {
        const box = new THREE.Box3().setFromObject(sm)
        grip = box.getCenter(new THREE.Vector3())
        foundGrip = true
      }
      const srcPos = sm.geometry.attributes.position
      const arr = new Float32Array(srcPos.count * 3)
      for (let i = 0; i < srcPos.count; i++) {
        v.fromBufferAttribute(srcPos, i)
        sm.applyBoneTransform(i, v)
        v.applyMatrix4(sm.matrixWorld)
        v.sub(grip)
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

      // Prefer textured materials when maps loaded; otherwise solid visible gray
      let mat: THREE.Material | THREE.Material[] = fallbackMat
      if (sm.material) {
        const srcMats = Array.isArray(sm.material) ? sm.material : [sm.material]
        const hasMap = srcMats.some((m) => !!(m as THREE.MeshStandardMaterial).map)
        if (hasMap) {
          mat = srcMats.map((m) => {
            const src = m as THREE.MeshStandardMaterial
            const basic = new THREE.MeshBasicMaterial({
              map: src.map,
              color: 0xffffff,
              side: THREE.DoubleSide,
            })
            if (basic.map) basic.map.colorSpace = THREE.SRGBColorSpace
            return basic
          })
          mat = mat.length === 1 ? mat[0] : mat
        }
      }

      const mesh = new THREE.Mesh(baked, mat)
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.frustumCulled = false
      group.add(mesh)
      bakedAny = true
    })

    if (!bakedAny) return undefined

    // Center on bbox so seating is predictable
    group.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(group)
    const center = box.getCenter(new THREE.Vector3())
    for (const child of group.children) {
      child.position.sub(center)
    }
    return group
  }

  public async loadMapMesh(
    meshKey: string,
    glbPath: string,
    usePoolLights: boolean,
    forceReload = false
  ): Promise<MapMesh> {
    if (forceReload) this.disposeMapMesh(meshKey)
    const existing = this.loadableMeshs.get(meshKey)
    if (existing instanceof MapMesh) return existing
    const mapmesh = new MapMesh(glbPath, meshKey, usePoolLights)
    await mapmesh.load()
    mapmesh.register(this.loadableMeshs)
    // Older call sites still look up "Map"
    if (meshKey === 'Map_pool_day') this.loadableMeshs.set('Map', mapmesh)
    return mapmesh
  }

  /** Free a cached map's GPU resources (used on menu return / map swap). */
  public disposeMapMesh(meshKey: string): void {
    const prev = this.loadableMeshs.get(meshKey)
    if (prev instanceof MapMesh) prev.disposeGpu()
    this.loadableMeshs.delete(meshKey)
    if (meshKey === 'Map_pool_day' && this.loadableMeshs.get('Map') === prev) {
      this.loadableMeshs.delete('Map')
    }
  }

  private static readonly COMBAT_MESH_KEYS = [
    'ThirdPersonMesh',
    'AK47Hands',
    'AK47',
    'AkmRaw',
    'Usp',
    'Knife',
    'Bullet',
    'CsTerrorist',
    'AwpRaw',
    'AWP',
  ] as const

  /** Free guns / bots / bullets from the registry (menu return). Maps stay separate. */
  public disposeCombatMeshes(
    seenGeo: Set<THREE.BufferGeometry> = new Set(),
    seenMat: Set<THREE.Material> = new Set(),
    seenTex: Set<THREE.Texture> = new Set()
  ): void {
    for (const key of GlobalLoadingManager.COMBAT_MESH_KEYS) {
      const mesh = this.loadableMeshs.get(key)
      if (!mesh) continue
      mesh.disposeGpu(seenGeo, seenMat, seenTex)
      this.loadableMeshs.delete(key)
    }
  }

  public hasCombatMeshes(): boolean {
    return this.loadableMeshs.has('AK47') && this.loadableMeshs.has('CsTerrorist')
  }

  /** Load a generic GLB once and cache it (editor character packs, etc.). */
  public async ensureMesh(meshKey: string, glbPath: string): Promise<LoadableMesh> {
    const existing = this.loadableMeshs.get(meshKey)
    if (existing) return existing
    const mesh = new LoadableMesh(glbPath, meshKey)
    await mesh.load()
    mesh.register(this.loadableMeshs)
    return mesh
  }

  /** Load an FPS pack (Armature + markers) once — used for editor-only weapon previews. */
  public async ensureFpsMesh(
    meshKey: string,
    glbPath: string,
    viewmodelOffset = Vector3D.ZERO(),
    invertScale = true
  ): Promise<FPSMesh> {
    const existing = this.loadableMeshs.get(meshKey)
    if (existing instanceof FPSMesh) {
      // Keep seat in sync when callers retune offset (HMR / re-enter editor).
      // Mutate in place — clones share this Vector3D reference.
      existing.viewmodelOffset.copy(viewmodelOffset)
      await existing.loadAnimationMarkers()
      return existing
    }
    const mesh = new FPSMesh(glbPath, meshKey, viewmodelOffset, invertScale)
    await mesh.load()
    mesh.register(this.loadableMeshs)
    return mesh
  }
  static async loadJson(path: string): Promise<any> {
    const response = await fetch(path)
    if (!response.ok) {
      throw new Error(`Failed to load animation markers: ${path}`)
    }
    return response.json()
  }
  static async loadMesh(path: string): Promise<THREE.Mesh> {
    /*         const renderer = Game.getInstance().renderer;
                if (renderer) {
                    const csm = renderer.sceneLighting.sky.csm;
                } */

    return await new Promise((resolve, reject) => {
      GlobalLoadingManager.gltfLoader.load(
        path,
        (object) => {
          const mesh = object.scene as unknown as THREE.Mesh
          mesh.animations = object.animations
          //csm.setupMaterial(mesh.animations);
          resolve(mesh)
        },
        (xhr) => {
          //console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
        },
        (error) => {
          reject(new Error(`Failed to load mesh: ${path}`))
        }
      )
    })
  }
}
