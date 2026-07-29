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
    // Good looking textures
    // https://opengameart.org/users/rubberduck
    // https://opengameart.org/content/2k-handpainted-style-textures
    // https://opengameart.org/content/8-handpainted-style-textures

    const tpsmesh = new ThirdPersonMesh()
    await tpsmesh.load()
    tpsmesh.register(this.loadableMeshs)

    // Default boot map (Pool Day) — other maps load on demand
    const mapmesh = new MapMesh('pool_day_baked.glb', 'Map_pool_day', true)
    await mapmesh.load()
    mapmesh.register(this.loadableMeshs)
    // Back-compat alias used by older call sites
    this.loadableMeshs.set('Map', mapmesh)

    const ak = new FPSMesh('fps_mine_sketch_galil.glb', 'AK47')
    await ak.load()
    ak.register(this.loadableMeshs)

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

    // CS2 AWP mesh — composed with AK hands into an FPS viewmodel
    const awpRaw = new LoadableMesh('models/awp.glb', 'AwpRaw')
    await awpRaw.load()
    awpRaw.register(this.loadableMeshs)
    this.registerAwpViewmodel(ak)
  }

  /**
   * FPS AWP base: AK hands + animations. Keep the Armature node (seat for the
   * AWP prop) but hide the Galil gun meshes.
   */
  private registerAwpViewmodel(akSource: FPSMesh): void {
    const awpFps = akSource.clone()
    awpFps.key = 'AWP'

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
    if (forceReload) this.loadableMeshs.delete(meshKey)
    const existing = this.loadableMeshs.get(meshKey)
    if (existing instanceof MapMesh) return existing
    const mapmesh = new MapMesh(glbPath, meshKey, usePoolLights)
    await mapmesh.load()
    mapmesh.register(this.loadableMeshs)
    return mapmesh
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
