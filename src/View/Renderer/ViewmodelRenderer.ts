import * as THREE from 'three'
import { Vector3D } from '../../Core/Vector'
import { PlayerRenderer } from './PlayerRenderer/PlayerRenderer'
import { Renderer } from './Renderer'

export class ViewmodelRenderer {
  public camera: THREE.PerspectiveCamera
  private ambientLight: THREE.AmbientLight
  public scene: THREE.Scene
  private spotLight: THREE.SpotLight

  constructor() {
    this.ambientLight = new THREE.AmbientLight()
    this.scene = new THREE.Scene()
    this.scene.add(this.ambientLight)

    this.spotLight = new THREE.SpotLight(0xffffff, 1)
    this.spotLight.castShadow = true
    this.spotLight.position.setY(1)
    this.spotLight.lookAt(Vector3D.ZERO())
    this.scene.add(this.spotLight)

    this.camera = PlayerRenderer.createCamera(60)
    this.scene.add(this.camera)
  }

  public addDebugUI(renderer: Renderer) {
    renderer.debugUI.addMesh(this.camera)
  }

  /** Compile viewmodel shaders so first gun switch never hitchs */
  public warm(renderer: THREE.WebGLRenderer, meshes: THREE.Object3D[]): void {
    const added: THREE.Object3D[] = []
    for (const mesh of meshes) {
      if (!mesh) continue
      mesh.position.set(0, -50, 0)
      mesh.visible = true
      this.camera.add(mesh)
      added.push(mesh)
    }
    renderer.compile(this.scene, this.camera)
    renderer.clearDepth()
    renderer.render(this.scene, this.camera)
    for (const mesh of added) {
      this.camera.remove(mesh)
      mesh.visible = false
    }
  }

  public render(renderer: Renderer, dt: number) {
    // Draw on top of the world: clear depth so walls never cut the gun
    renderer.clearDepth()
    renderer.render(this.scene, this.camera)
    this.spotLight.target.rotation.z += dt * 100
  }
}
