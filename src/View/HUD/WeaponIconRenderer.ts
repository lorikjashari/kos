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
    if (this.cache.has(weaponKey)) return this.cache.get(weaponKey)!

    const source = Game.getInstance().globalLoadingManager.loadableMeshs.get(weaponKey)
    if (!source?.mesh) return null

    const icon = this.renderSilhouette(source.mesh, weaponKey)
    if (icon) this.cache.set(weaponKey, icon)
    return icon
  }

  private renderSilhouette(sourceMesh: THREE.Object3D, weaponKey: string): string | null {
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0])
    }
    this.scene.add(this.light)
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9))

    const clone = SkeletonUtils.clone(sourceMesh)
    clone.traverse((child) => {
      const name = (child.name || '').toLowerCase()
      // Hide arms/hands so the HUD icon is the weapon silhouette only
      if (
        name.includes('arm') ||
        name.includes('hand') ||
        name.includes('finger') ||
        name.includes('glove') ||
        name.includes('sleeve')
      ) {
        child.visible = false
        return
      }

      if (child instanceof THREE.Mesh) {
        // Flat white — same look as CS weapon icons on the HUD
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
    clone.scale.set(Math.abs(clone.scale.x) || 1, Math.abs(clone.scale.y) || 1, Math.abs(clone.scale.z) || 1)
    clone.position.set(0, 0, 0)
    clone.rotation.set(0, 0, 0)
    clone.updateMatrixWorld(true)

    // Side profile — rifle/pistol point left like CS icons; knife angled
    if (weaponKey === 'Knife') {
      clone.rotation.set(-0.2, Math.PI * 0.72, 0.15)
    } else if (weaponKey === 'Usp') {
      clone.rotation.set(0.1, Math.PI * 0.55, 0.05)
    } else {
      clone.rotation.set(0.12, Math.PI * 0.55, 0.02)
    }
    clone.updateMatrixWorld(true)

    const box = new THREE.Box3().setFromObject(clone)
    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)
    clone.position.sub(center)

    const maxDim = Math.max(size.x, size.y, size.z, 0.001)
    const scale = (weaponKey === 'Knife' ? 0.7 : 0.95) / maxDim
    clone.scale.multiplyScalar(scale)
    clone.updateMatrixWorld(true)

    // Re-center after scale
    const box2 = new THREE.Box3().setFromObject(clone)
    const center2 = new THREE.Vector3()
    box2.getCenter(center2)
    clone.position.sub(center2)

    this.scene.add(clone)
    this.camera.position.set(0, 0.01, 1.15)
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
