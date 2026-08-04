import * as THREE from 'three'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils'

export class LoadableMesh {
  protected path!: string
  public key!: string
  public mesh!: THREE.Mesh
  constructor(path: string, key: string) {
    this.path = path
    this.key = key
  }
  public async load(): Promise<void> {
    // Dynamic import avoids TDZ from LoadableMesh ↔ GlobalLoadingManager ↔ FPSMesh.
    const { GlobalLoadingManager } = await import('./GlobalLoadingManager')
    const mesh = await GlobalLoadingManager.loadMesh(this.path)
    this.setMesh(mesh as unknown as THREE.Mesh)
    this.init()
  }
  public register(loadableMeshs: Map<string, LoadableMesh>): void {
    loadableMeshs.set(this.key, this)
  }

  public setMesh(mesh: THREE.Mesh): void {
    this.mesh = mesh
  }

  public cloneMesh(): THREE.Mesh {
    const original: THREE.Mesh = this.mesh
    const cloned = <THREE.Mesh>SkeletonUtils.clone(original)
    // SkeletonUtils.clone doesnt seem to keep the animations.
    cloned.animations = original.animations
    return cloned
  }

  public init(): void {
    const mesh: any = this.mesh
    mesh.traverse((child: any) => {
      child.castShadow = true
      child.receiveShadow = true
    })
  }

  public clone(): LoadableMesh {
    const loadableMesh = new LoadableMesh(this.path, this.key)
    loadableMesh.setMesh(this.cloneMesh())
    return loadableMesh
  }

  /**
   * Free GPU resources for this mesh tree. Pass shared Sets when disposing
   * several assets that may share geometry (e.g. AK47 ↔ AkmRaw).
   */
  public disposeGpu(
    seenGeo: Set<THREE.BufferGeometry> = new Set(),
    seenMat: Set<THREE.Material> = new Set(),
    seenTex: Set<THREE.Texture> = new Set()
  ): void {
    if (!this.mesh) return
    LoadableMesh.disposeObject3D(this.mesh, seenGeo, seenMat, seenTex)
  }

  public static disposeObject3D(
    root: THREE.Object3D,
    seenGeo: Set<THREE.BufferGeometry> = new Set(),
    seenMat: Set<THREE.Material> = new Set(),
    seenTex: Set<THREE.Texture> = new Set()
  ): void {
    root.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      const geo = mesh.geometry as THREE.BufferGeometry | undefined
      if (geo && !seenGeo.has(geo)) {
        seenGeo.add(geo)
        geo.dispose()
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
      for (const mat of mats) {
        if (!mat || seenMat.has(mat)) continue
        seenMat.add(mat)
        const std = mat as THREE.MeshStandardMaterial
        for (const key of [
          'map',
          'normalMap',
          'roughnessMap',
          'metalnessMap',
          'aoMap',
          'emissiveMap',
          'alphaMap',
        ] as const) {
          const tex = std[key] as THREE.Texture | null | undefined
          if (tex && !seenTex.has(tex)) {
            seenTex.add(tex)
            tex.dispose()
          }
        }
        mat.dispose()
      }
    })
  }
}
