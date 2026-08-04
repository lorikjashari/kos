import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { TQuaternion } from '../../Core/Quaternion'
import { Vector3D } from '../../Core/Vector'
import { Game } from '../../Game'
import { TrimeshCollider } from '../../Physics/Collider/TrimeshCollider'
import { FakeSpotLight } from './FakeSpotLight'
import { LoadableMesh } from './LoadableMesh'
import { isTouchDevice } from '../../UI/MobileDevice'

/** Shared no-draw stand-in so collider meshes stay in the graph without a GPU pass. */
const invisibleOutdoorMat = new THREE.MeshBasicMaterial({
  visible: false,
  colorWrite: false,
  depthWrite: false,
})

export type MapMeshOptions = {
  /** Extra pool-day corridor fills + Spot named lights */
  usePoolLights?: boolean
  /** Collect scene extras (lights/cones) for cleanup on map swap */
  extras?: THREE.Object3D[]
}

export class MapMesh extends LoadableMesh {
  public usePoolLights: boolean
  private normalized = false
  private materialsPrepared = false

  constructor(path = 'pool_day_baked.glb', key = 'Map', usePoolLights = true) {
    super(path, key)
    this.usePoolLights = usePoolLights
  }

  public init() {
    super.init()
  }

  /** Release GPU resources when swapping / force-reloading maps. */
  public disposeGpu(): void {
    if (!this.mesh) return
    const seenMat = new Set<THREE.Material>()
    const seenTex = new Set<THREE.Texture>()
    this.mesh.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.geometry?.dispose()
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
      for (const mat of mats) {
        if (!mat || seenMat.has(mat)) continue
        if (mat === invisibleOutdoorMat) continue
        seenMat.add(mat)
        const std = mat as THREE.MeshStandardMaterial
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'] as const) {
          const tex = std[key] as THREE.Texture | null | undefined
          if (tex && !seenTex.has(tex)) {
            seenTex.add(tex)
            tex.dispose()
          }
        }
        mat.dispose()
      }
    })
    this.materialsPrepared = false
    this.normalized = false
  }

  /** Fit CS / Sketchfab maps into playable scale and sit on y=0, centered XZ. */
  public normalizeForPlay(targetHorizontalSize: number): void {
    if (this.normalized || !this.mesh || !(targetHorizontalSize > 0)) return
    this.mesh.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(this.mesh)
    if (box.isEmpty()) return

    const size = new THREE.Vector3()
    box.getSize(size)
    const horiz = Math.max(size.x, size.z, 0.001)
    // Scale up or down toward target playable size (Sketchfab dust2 is ~70 units)
    const s = targetHorizontalSize / horiz
    if (Math.abs(s - 1) > 0.05) {
      this.mesh.scale.multiplyScalar(s)
      this.mesh.updateMatrixWorld(true)
    }

    const box2 = new THREE.Box3().setFromObject(this.mesh)
    const cx = (box2.min.x + box2.max.x) * 0.5
    const cz = (box2.min.z + box2.max.z) * 0.5
    this.mesh.position.x -= cx
    this.mesh.position.z -= cz
    this.mesh.position.y -= box2.min.y
    this.mesh.updateMatrixWorld(true)
    this.normalized = true
  }

  public getWorldBounds(): THREE.Box3 {
    this.mesh.updateMatrixWorld(true)
    return new THREE.Box3().setFromObject(this.mesh)
  }

  public addPhysics(game: Game, options: MapMeshOptions = {}): void {
    const usePoolLights = options.usePoolLights ?? this.usePoolLights
    const mobile = isTouchDevice()
    const extras = options.extras
    const removedMeshs: Array<THREE.Object3D> = new Array<THREE.Object3D>()
    const _worldPos = new THREE.Vector3()
    const _worldQuat = new THREE.Quaternion()
    const _worldScale = new THREE.Vector3()

    this.mesh.traverse((child) => {
      if (child.name.substr(0, 4) === 'Spot') {
        if (!usePoolLights) return
        const worldPos = child.getWorldPosition(new THREE.Vector3())
        const height = 28
        const conePos = worldPos.clone()
        conePos.y -= height / 2

        const faker = new FakeSpotLight({
          color1: new THREE.Color(0xfff2e0),
          color2: new THREE.Color(0xffd8a8),
          position: conePos as Vector3D,
          rotation: child.rotation,
          height: height,
          radius: 36,
          attenuation: 18,
          anglePower: 0.75,
        })
        game.renderer.addToRenderer(faker)
        extras?.push(faker)

        // The cone mesh already reads as a light source; the bulb behind it is pure
        // per-fragment cost that phones can't afford on top of the corridor rig
        if (!mobile) {
          const bulb = new THREE.PointLight(0xffe9cc, 28, 55, 1.4)
          bulb.position.copy(worldPos)
          bulb.position.y = Math.max(worldPos.y - 1.5, 3.5)
          bulb.castShadow = false
          game.renderer.addToRenderer(bulb)
          extras?.push(bulb)
        }
      } else if ((child as any).isMesh) {
        let mesh = child as THREE.Mesh
        if (!this.materialsPrepared) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          for (const raw of materials) {
            const mat = raw as THREE.MeshStandardMaterial
            if (!mat) continue

            if (mat.map) {
              mat.map.colorSpace = THREE.SRGBColorSpace
            }

            if (usePoolLights) {
              // Pool Day is baked dark — lift albedo + emissive so interiors read.
              // Phones get a smaller lift: without shadows the emissive fill was
              // flattening the whole map into one flat tone.
              // Mobile runs far fewer point lights now, so lean harder on the free
              // self-illumination to keep walled-in corners readable
              const emissiveLift = mobile ? 0.36 : 0.45
              if (mat.color) {
                mat.color.multiplyScalar(mobile ? 1.28 : 1.35)
                mat.color.offsetHSL(0, 0.02, mobile ? 0.03 : 0.04)
              }
              if ('metalness' in mat) mat.metalness = 0
              if ('roughness' in mat) mat.roughness = 0.92
              if ('emissive' in mat && mat.emissive) {
                if (mat.map) {
                  mat.emissiveMap = mat.map
                  mat.emissive.setRGB(1, 1, 1)
                  mat.emissiveIntensity = emissiveLift
                } else {
                  mat.emissive.copy(mat.color || new THREE.Color(0xffffff))
                  mat.emissiveIntensity = emissiveLift * 0.78
                }
              }
              mat.envMapIntensity = 0.4
            } else {
              // Dust II: MeshStandard + DoubleSide + many scene lights = FPS death.
              // Lambert + FrontSide keeps the textures lit by the sun without the PBR cost.
              if (!(mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
                mat.side = THREE.FrontSide
                mat.needsUpdate = true
                continue
              }
              const lambert = MapMesh.toOutdoorLambert(mat)
              if (Array.isArray(mesh.material)) {
                const idx = materials.indexOf(raw)
                if (idx >= 0) {
                  const arr = mesh.material as THREE.Material[]
                  arr[idx] = lambert
                }
              } else {
                mesh.material = lambert
              }
              mat.dispose()
              continue
            }
            mat.needsUpdate = true
          }
        }
        // Dust II: map never casts (34 shadow draws every update). Characters still cast.
        // Pool Day desktop keeps map casting for roof soft-shadows.
        mesh.castShadow = usePoolLights && !mobile
        mesh.receiveShadow = true
        // Pool Day is a small interior; Dust II is large — cull what the camera
        // can't see so draw calls drop while looking around.
        mesh.frustumCulled = !usePoolLights
        // Ensure indexed geometry for Ammo trimesh (CS maps often lack indices)
        const geo = mesh.geometry as THREE.BufferGeometry
        if (geo && !geo.index) {
          const count = geo.attributes.position.count
          const indices = new Uint32Array(count)
          for (let i = 0; i < count; i++) indices[i] = i
          geo.setIndex(new THREE.BufferAttribute(indices, 1))
        }
        // Never pass mesh.quaternion / mesh.position — that corrupts local transforms
        mesh.getWorldQuaternion(_worldQuat)
        mesh.getWorldPosition(_worldPos)
        mesh.getWorldScale(_worldScale)
        const rotation = new TQuaternion(_worldQuat.x, _worldQuat.y, _worldQuat.z, _worldQuat.w).toVector3D()
        const pos = new Vector3D(_worldPos.x, _worldPos.y, _worldPos.z)
        const scale = new Vector3D(_worldScale.x, _worldScale.y, _worldScale.z)
        try {
          const cube = new TrimeshCollider(mesh, pos, rotation, scale, 0)
          game.actors.push(cube)
          game.addToWorld(cube)
        } catch (err) {
          console.warn('[MapMesh] skip collider', mesh.name, err)
        }
      }
    })
    this.materialsPrepared = true
    for (let i = 0; i < removedMeshs.length; i++) {
      this.mesh.remove(removedMeshs[i])
    }

    // Bake Dust II into fewer draw calls after colliders own their triangle copies
    if (!usePoolLights) this.consolidateOutdoorDrawCalls()

    if (usePoolLights) this.addIndoorCorridorLights(game, extras)
  }

  /** Drop PBR path — outdoor maps only need sun/hemi/ambient. */
  private static toOutdoorLambert(src: THREE.MeshStandardMaterial): THREE.MeshLambertMaterial {
    const lambert = new THREE.MeshLambertMaterial({
      color: src.color?.clone() ?? new THREE.Color(0xffffff),
      map: src.map ?? null,
      emissive: src.emissive?.clone() ?? new THREE.Color(0x000000),
      emissiveMap: src.emissiveMap ?? null,
      emissiveIntensity: Math.min(src.emissiveIntensity ?? 0, 0.05),
      alphaMap: src.alphaMap ?? null,
      transparent: !!src.transparent,
      opacity: src.opacity ?? 1,
      alphaTest: src.alphaTest ?? 0,
      side: THREE.FrontSide,
      fog: src.fog !== false,
      flatShading: false,
    })
    if (lambert.map) lambert.map.colorSpace = THREE.SRGBColorSpace
    lambert.needsUpdate = true
    return lambert
  }

  /**
   * Sketchfab Dust II ships ~34 unique-material meshes. Group by albedo texture
   * (or flat color) and merge so open sightlines don't pay 34 Mesh draws.
   * Colliders already copied triangles — visuals can be replaced freely.
   */
  private consolidateOutdoorDrawCalls(): void {
    const meshes: THREE.Mesh[] = []
    this.mesh.traverse((child) => {
      const m = child as THREE.Mesh
      if (m.isMesh && m.geometry) meshes.push(m)
    })
    if (meshes.length < 2) return

    type Bucket = { meshes: THREE.Mesh[]; material: THREE.Material }
    const buckets = new Map<string, Bucket>()
    for (const mesh of meshes) {
      const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshLambertMaterial
      if (!mat) continue
      const key = mat.map?.uuid ?? `c:${mat.color?.getHexString?.() ?? 'fff'}`
      let bucket = buckets.get(key)
      if (!bucket) {
        bucket = { meshes: [], material: mat }
        buckets.set(key, bucket)
      }
      bucket.meshes.push(mesh)
    }

    this.mesh.updateMatrixWorld(true)
    const rootInv = this.mesh.matrixWorld.clone().invert()
    const mergedRoot = new THREE.Group()
    mergedRoot.name = 'Dust2Batched'
    let mergedCount = 0

    for (const bucket of buckets.values()) {
      if (bucket.meshes.length === 1) {
        // Already a single draw — keep, but ensure outdoor flags
        const only = bucket.meshes[0]
        only.castShadow = false
        only.receiveShadow = true
        only.frustumCulled = true
        continue
      }

      const geos: THREE.BufferGeometry[] = []
      for (const mesh of bucket.meshes) {
        const geo = mesh.geometry.clone() as THREE.BufferGeometry
        // Bake into map-root local space so the batched group can sit at identity
        const toRoot = new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld)
        geo.applyMatrix4(toRoot)
        geos.push(geo)
      }

      const merged = mergeGeometries(geos, false)
      for (const g of geos) g.dispose()
      if (!merged) continue

      const mat = bucket.material.clone()
      mat.side = THREE.FrontSide
      const batch = new THREE.Mesh(merged, mat)
      batch.name = `dust2_batch_${mergedCount++}`
      batch.castShadow = false
      batch.receiveShadow = true
      batch.frustumCulled = true
      mergedRoot.add(batch)

      for (const mesh of bucket.meshes) {
        mesh.visible = false
        mesh.castShadow = false
        mesh.frustumCulled = true
        // Drop GPU draw without disposing geometry Ammo / Actor may still reference
        mesh.material = invisibleOutdoorMat
      }
    }

    if (mergedCount > 0) this.mesh.add(mergedRoot)
  }

  /**
   * MeshStandardMaterial shades every light in the scene on every fragment — there
   * is no light culling — so the desktop rig's 28 corridor lights cost 28 lots of
   * per-pixel math on a phone, and get worse the more of the screen a bot covers.
   * Mobile merges each cluster into one stronger, wider light.
   */
  private static readonly MOBILE_CORRIDOR_LIGHTS: Array<{ x: number; y: number; z: number; i: number; r: number }> = [
    { x: 0, y: 5.4, z: 26, i: 42, r: 62 },
    { x: 24, y: 4.8, z: 30, i: 38, r: 56 },
    { x: -24, y: 4.8, z: 30, i: 38, r: 56 },
    { x: 0, y: 4.6, z: 52, i: 34, r: 58 },
    { x: 0, y: 4.6, z: 0, i: 30, r: 50 },
    // The walled-off room in the far corner — was ten separate lights
    { x: -45.8, y: 3.6, z: 51.6, i: 150, r: 52 },
    { x: -45.8, y: 5.6, z: 51.6, i: 95, r: 48 },
  ]

  private addIndoorCorridorLights(game: Game, extras?: THREE.Object3D[]): void {
    if (isTouchDevice()) {
      for (const spot of MapMesh.MOBILE_CORRIDOR_LIGHTS) {
        const light = new THREE.PointLight(0xfff0dd, spot.i, spot.r, 1.1)
        light.position.set(spot.x, spot.y, spot.z)
        light.castShadow = false
        game.renderer.addToRenderer(light)
        extras?.push(light)
      }
      return
    }

    const indoors: Array<{ x: number; y: number; z: number; i: number; r: number }> = [
      { x: 0, y: 5.5, z: 18, i: 22, r: 38 },
      { x: 14, y: 5.2, z: 28, i: 20, r: 36 },
      { x: -14, y: 5.2, z: 28, i: 20, r: 36 },
      { x: 0, y: 5, z: 42, i: 18, r: 40 },
      { x: 18, y: 5, z: 42, i: 16, r: 34 },
      { x: -18, y: 5, z: 42, i: 16, r: 34 },
      { x: 28, y: 4.5, z: 20, i: 24, r: 32 },
      { x: -28, y: 4.5, z: 20, i: 24, r: 32 },
      { x: 28, y: 4.5, z: 36, i: 22, r: 32 },
      { x: -28, y: 4.5, z: 36, i: 22, r: 32 },
      { x: 32, y: 4.2, z: 50, i: 20, r: 30 },
      { x: -32, y: 4.2, z: 50, i: 20, r: 30 },
      { x: 0, y: 4.5, z: 58, i: 18, r: 36 },
      { x: 12, y: 4.2, z: 8, i: 16, r: 28 },
      { x: -12, y: 4.2, z: 8, i: 16, r: 28 },
      { x: 0, y: 4.8, z: 0, i: 18, r: 34 },
      { x: 8, y: 4.5, z: -8, i: 15, r: 28 },
      { x: -8, y: 4.5, z: -8, i: 15, r: 28 },
      { x: -45.8, y: 3.2, z: 51.6, i: 90, r: 40 },
      { x: -45.8, y: 5.5, z: 51.6, i: 70, r: 45 },
      { x: -45.8, y: 3.0, z: 46.0, i: 60, r: 35 },
      { x: -40.0, y: 3.5, z: 51.6, i: 55, r: 32 },
      { x: -50.5, y: 3.5, z: 51.6, i: 55, r: 32 },
      { x: -45.8, y: 3.5, z: 57.5, i: 55, r: 32 },
      { x: -42.0, y: 3.2, z: 48.5, i: 45, r: 28 },
      { x: -49.0, y: 3.2, z: 48.5, i: 45, r: 28 },
      { x: -42.0, y: 3.2, z: 55.0, i: 45, r: 28 },
      { x: -49.0, y: 3.2, z: 55.0, i: 45, r: 28 },
    ]

    for (const spot of indoors) {
      const light = new THREE.PointLight(0xfff0dd, spot.i, spot.r, 1.1)
      light.position.set(spot.x, spot.y, spot.z)
      light.castShadow = false
      game.renderer.addToRenderer(light)
      extras?.push(light)
    }
  }

  public clone(): MapMesh {
    const loadableMesh = new MapMesh(this.path, this.key, this.usePoolLights)
    loadableMesh.setMesh(this.cloneMesh())
    return loadableMesh
  }
}
