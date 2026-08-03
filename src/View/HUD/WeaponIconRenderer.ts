import * as THREE from 'three'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils'
import { Game } from '../../Game'

/** Renders loaded weapon GLBs as flat white HUD silhouettes (KoS). */
export class WeaponIconRenderer {
  private cache = new Map<string, string>()
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private light: THREE.DirectionalLight

  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.setSize(256, 128)
    this.renderer.setPixelRatio(1)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(28, 2, 0.01, 50)
    this.camera.position.set(0, 0.05, 1.35)
    this.camera.lookAt(0, 0, 0)

    this.light = new THREE.DirectionalLight(0xffffff, 1.2)
    this.light.position.set(1, 2, 3)
    this.scene.add(this.light)
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.85))
  }

  public getIcon(weaponKey: string): string | null {
    const key = weaponKey === 'AK' ? 'AK47' : weaponKey
    if (this.cache.has(key)) return this.cache.get(key)!

    const source = this.resolveSource(key)
    if (!source) return null

    const icon = this.renderSilhouette(source, key)
    if (icon) this.cache.set(key, icon)
    return icon
  }

  /** Prefer gun-only baked props so hands never appear in HUD / loadout icons. */
  private resolveSource(weaponKey: string): THREE.Object3D | null {
    const glm = Game.getInstance().globalLoadingManager
    if (weaponKey === 'AK47') {
      return (
        glm.createAkmViewProp() ??
        (glm.loadableMeshs.get('AkmRaw')?.mesh as THREE.Object3D | undefined) ??
        (glm.loadableMeshs.get('AK47')?.mesh as THREE.Object3D | undefined) ??
        null
      )
    }
    if (weaponKey === 'AWP') {
      return (
        glm.createAwpViewProp() ??
        (glm.loadableMeshs.get('AwpRaw')?.mesh as THREE.Object3D | undefined) ??
        null
      )
    }
    const mesh = glm.loadableMeshs.get(weaponKey)?.mesh
    return (mesh as THREE.Object3D | undefined) ?? null
  }

  private isHandPart(child: THREE.Object3D): boolean {
    // Only hide actual meshes — never containers like "Armature" (matches "arm")
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return false

    const name = (mesh.name || '').toLowerCase()
    if (
      name.includes('finger') ||
      name.includes('glove') ||
      name.includes('sleeve') ||
      name.includes('phoenix') ||
      name === 'object_67'
    ) {
      return true
    }

    if (!mesh.material) return false
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const matName = mats.map((m) => m?.name || '').join(' ').toLowerCase()
    // Mine-sketch packs: hands are v_hands / t_phoenix materials
    return /v_hands|phoenix|arms\.001/.test(matName)
  }

  private renderSilhouette(sourceMesh: THREE.Object3D, weaponKey: string): string | null {
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0])
    }
    this.scene.add(this.light)
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9))

    // Baked gun props are plain Groups; FPS packs need SkeletonUtils
    let hasSkinned = false
    sourceMesh.traverse((c) => {
      if ((c as THREE.SkinnedMesh).isSkinnedMesh) hasSkinned = true
    })
    const clone = hasSkinned
      ? (SkeletonUtils.clone(sourceMesh) as THREE.Object3D)
      : sourceMesh.clone(true)

    clone.traverse((child) => {
      if (weaponKey === 'AK47') {
        // Full AKM scene fallback: keep rifle meshes only
        const mesh = child as THREE.Mesh
        if (mesh.isMesh && mesh.name && !/^akm_/i.test(mesh.name)) {
          child.visible = false
          return
        }
      }

      if (this.isHandPart(child)) {
        child.visible = false
        return
      }

      if (child instanceof THREE.Mesh && child.visible) {
        child.material = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          side: THREE.DoubleSide,
          depthWrite: true,
        })
        child.castShadow = false
        child.receiveShadow = false
        child.frustumCulled = false
      }
    })

    // Undo FPS viewmodel mirror so the icon faces correctly
    clone.scale.set(
      Math.abs(clone.scale.x) || 1,
      Math.abs(clone.scale.y) || 1,
      Math.abs(clone.scale.z) || 1
    )
    clone.position.set(0, 0, 0)
    clone.rotation.set(0, 0, 0)
    clone.updateMatrixWorld(true)

    // Side profile — rifle/pistol point left like CS icons; knife angled
    if (weaponKey === 'Knife') {
      clone.rotation.set(-0.2, Math.PI * 0.72, 0.15)
    } else if (weaponKey === 'Usp') {
      clone.rotation.set(0.1, Math.PI * 0.55, 0.05)
    } else if (weaponKey === 'AWP') {
      clone.rotation.set(0.08, Math.PI * 0.52, 0.02)
    } else {
      clone.rotation.set(0.12, Math.PI * 0.55, 0.02)
    }
    clone.updateMatrixWorld(true)

    const box = new THREE.Box3().setFromObject(clone)
    if (box.isEmpty()) return null
    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)
    clone.position.sub(center)

    const maxDim = Math.max(size.x, size.y, size.z, 0.001)
    const fit =
      weaponKey === 'Knife' ? 1.05 : weaponKey === 'Usp' ? 1.12 : weaponKey === 'AWP' ? 1.05 : 0.95
    const scale = fit / maxDim
    clone.scale.multiplyScalar(scale)
    clone.updateMatrixWorld(true)

    // Re-center after scale
    const box2 = new THREE.Box3().setFromObject(clone)
    const center2 = new THREE.Vector3()
    box2.getCenter(center2)
    clone.position.sub(center2)

    this.scene.add(clone)
    this.camera.position.set(
      0,
      0.01,
      weaponKey === 'AWP' ? 1.25 : weaponKey === 'Usp' || weaponKey === 'Knife' ? 1.05 : 1.15
    )
    this.camera.lookAt(0, 0, 0)
    this.renderer.render(this.scene, this.camera)

    const dataUrl = this.renderer.domElement.toDataURL('image/png')
    this.scene.remove(clone)
    return dataUrl
  }

  public dispose(): void {
    this.renderer.dispose()
    this.cache.clear()
  }
}
