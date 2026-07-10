import * as THREE from 'three'
import { TQuaternion } from '../../Core/Quaternion'
import { Vector2D, Vector3D } from '../../Core/Vector'
import { Game } from '../../Game'
import { CubeCollider } from '../../Physics/Collider/CubeCollider'
import { TrimeshCollider } from '../../Physics/Collider/TrimeshCollider'
import { CubeRenderer } from '../Renderer/CubeRenderer'
import { TrimeshRenderer } from '../Renderer/TrimeshRenderer'
import { FakeSpotLight } from './FakeSpotLight'
import { LoadableMesh } from './LoadableMesh'

export class MapMesh extends LoadableMesh {
  constructor() {
    super(`pool_day_baked.glb`, 'Map')
  }

  public init() {
    super.init()
  }
  public addPhysics(game: Game): void {
    const removedMeshs: Array<THREE.Object3D> = new Array<THREE.Object3D>()
    this.mesh.traverse((child) => {
      if (child.name.substr(0, 4) === 'Spot') {
        const worldPos = child.getWorldPosition(new THREE.Vector3())
        const height = 28
        const conePos = worldPos.clone()
        conePos.y -= height / 2

        // Visual light cone
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

        // Real light for indoor floors/walls under this Spot
        const bulb = new THREE.PointLight(0xffe9cc, 28, 55, 1.4)
        bulb.position.copy(worldPos)
        bulb.position.y = Math.max(worldPos.y - 1.5, 3.5)
        bulb.castShadow = false
        game.renderer.addToRenderer(bulb)
      } else if ((child as any).isMesh) {
        let mesh = child as THREE.Mesh
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const raw of materials) {
          const mat = raw as THREE.MeshStandardMaterial
          if (!mat) continue

          // Baked maps store darkness in the texture albedo — lift so rooms are playable
          if (mat.map) {
            mat.map.colorSpace = THREE.SRGBColorSpace
          }
          if (mat.color) {
            mat.color.multiplyScalar(1.35)
            mat.color.offsetHSL(0, 0.02, 0.04)
          }
          if ('metalness' in mat) mat.metalness = 0
          if ('roughness' in mat) mat.roughness = 0.92
          if ('emissive' in mat && mat.emissive) {
            // Self-illuminate dark baked surfaces so interiors aren't pitch black
            if (mat.map) {
              mat.emissiveMap = mat.map
              mat.emissive.setRGB(1, 1, 1)
              mat.emissiveIntensity = 0.45
            } else {
              mat.emissive.copy(mat.color || new THREE.Color(0xffffff))
              mat.emissiveIntensity = 0.35
            }
          }
          mat.envMapIntensity = 0.4
          mat.needsUpdate = true
        }
        mesh.castShadow = true
        // Soften indoor crush — still receive some shadow but not total black
        mesh.receiveShadow = true
        const quat: THREE.Quaternion = mesh.getWorldQuaternion(mesh.quaternion)
        const rotation = new TQuaternion(quat.x, quat.y, quat.z, quat.w).toVector3D()
        const pos = mesh.getWorldPosition(mesh.position.clone()) as Vector3D
        const scale = mesh.getWorldScale(mesh.scale).clone().multiplyScalar(1) as Vector3D
        const isDynamic = false
        let cube: TrimeshCollider | undefined = undefined
        if (isDynamic) {
          cube = new TrimeshRenderer(mesh.clone(), pos, rotation, scale, 100)
          game.addToRenderer((cube as TrimeshRenderer).mesh)
          removedMeshs.push(mesh)
        } else {
          cube = new TrimeshCollider(mesh, pos, rotation, scale, 0)
        }
        game.actors.push(cube)
        game.addToWorld(cube)
      }
    })
    for (let i = 0; i < removedMeshs.length; i++) {
      this.mesh.remove(removedMeshs[i])
    }

    this.addIndoorCorridorLights(game)
  }

  /**
   * Extra warm fill for covered / hallway areas on fy_pool_day
   * (Spot markers alone leave deep corridors black).
   */
  private addIndoorCorridorLights(game: Game): void {
    const indoors: Array<{ x: number; y: number; z: number; i: number; r: number }> = [
      // Covered pool edges / overhangs
      { x: 0, y: 5.5, z: 18, i: 22, r: 38 },
      { x: 14, y: 5.2, z: 28, i: 20, r: 36 },
      { x: -14, y: 5.2, z: 28, i: 20, r: 36 },
      { x: 0, y: 5, z: 42, i: 18, r: 40 },
      { x: 18, y: 5, z: 42, i: 16, r: 34 },
      { x: -18, y: 5, z: 42, i: 16, r: 34 },
      // Side corridors / indoor rooms
      { x: 28, y: 4.5, z: 20, i: 24, r: 32 },
      { x: -28, y: 4.5, z: 20, i: 24, r: 32 },
      { x: 28, y: 4.5, z: 36, i: 22, r: 32 },
      { x: -28, y: 4.5, z: 36, i: 22, r: 32 },
      { x: 32, y: 4.2, z: 50, i: 20, r: 30 },
      { x: -32, y: 4.2, z: 50, i: 20, r: 30 },
      { x: 0, y: 4.5, z: 58, i: 18, r: 36 },
      { x: 12, y: 4.2, z: 8, i: 16, r: 28 },
      { x: -12, y: 4.2, z: 8, i: 16, r: 28 },
      // Spawn / entry halls
      { x: 0, y: 4.8, z: 0, i: 18, r: 34 },
      { x: 8, y: 4.5, z: -8, i: 15, r: 28 },
      { x: -8, y: 4.5, z: -8, i: 15, r: 28 },
      // Dark indoor corner from player debug (~-45.8, 2, 51.6) — heavy fill
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
    }
  }
  /*   public addPhysics(game: Game): void {
    const removedMeshs: Array<THREE.Object3D> = new Array<THREE.Object3D>()
    this.mesh.traverse((child) => {
      if ((child as any).isMesh) {
        let mesh = child as THREE.Mesh
        mesh.position.y -= 2
        let mat = mesh.material as THREE.MeshStandardMaterial
        //mat.normalScale = new Vector2D(220, 220);
        const quat: THREE.Quaternion = mesh.getWorldQuaternion(mesh.quaternion)
        const rotation = new TQuaternion(quat.x, quat.y, quat.z, quat.w).toVector3D()
        const pos = mesh.getWorldPosition(mesh.position.clone()) as Vector3D
        const scale = mesh.getWorldScale(mesh.scale).clone().multiplyScalar(2) as Vector3D
        const mass = 0
        Math.random() > 0.5 ? Math.random() * 10 : 0
        const isDynamic = false //= mass != 0;
        let cube: CubeCollider | undefined = undefined
        // If a child is dynamic, remove it from the mesh and create its own renderer.
        if (isDynamic) {
          cube = new CubeRenderer(pos, rotation, scale, 100, mesh.material)
          game.addToRenderer((cube as CubeRenderer).mesh)
          removedMeshs.push(mesh)
        } else {
          cube = new CubeCollider(pos, rotation, scale, 0)
        }
        game.actors.push(cube)
        game.addToWorld(cube)
      }
    })
    for (let i = 0; i < removedMeshs.length; i++) {
      this.mesh.remove(removedMeshs[i])
    }
  } */
  public clone(): MapMesh {
    const loadableMesh = new MapMesh()
    loadableMesh.setMesh(this.cloneMesh())
    return loadableMesh
  }
}
