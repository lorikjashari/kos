import * as THREE from 'three'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils'
import { Vector3D } from '../../Core/Vector'
import { IUpdatable } from '../../Interface/IUpdatable'
import { Physics } from '../../Physics/Physics'
import { Game } from '../../Game'
import { MuzzleFlashManager } from './MuzzleFlash'

interface Projectile {
  mesh: THREE.Object3D
  position: Vector3D
  previousPosition: Vector3D
  direction: Vector3D
  speed: number
  distanceTraveled: number
}

export class ProjectileManager implements IUpdatable {
  private scene: THREE.Scene
  private physics: () => Physics
  private projectiles: Projectile[] = []
  private bulletPrototype?: THREE.Object3D
  private readonly bulletSpeed = 900
  private readonly maxDistance = 400

  constructor(scene: THREE.Scene, physics: () => Physics) {
    this.scene = scene
    this.physics = physics
  }

  private ensureBulletPrototype(): void {
    if (this.bulletPrototype) return
    const bullet = Game.getInstance().globalLoadingManager.loadableMeshs.get('Bullet')
    if (!bullet) return

    this.bulletPrototype = SkeletonUtils.clone(bullet.mesh)
    this.bulletPrototype.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = false
        child.receiveShadow = false
      }
    })
  }

  public spawn(origin: Vector3D, direction: Vector3D, muzzleFlash?: MuzzleFlashManager, speed = 900): void {
    this.ensureBulletPrototype()
    if (!this.bulletPrototype) return

    const dir = direction.clone().normalize()
    muzzleFlash?.spawn(origin, dir)

    const mesh = SkeletonUtils.clone(this.bulletPrototype)
    mesh.scale.set(0.05, 0.05, 0.18)
    mesh.position.copy(origin)
    mesh.lookAt(origin.clone().add(dir))
    this.scene.add(mesh)

    this.projectiles.push({
      mesh,
      position: origin.clone(),
      previousPosition: origin.clone(),
      direction: dir,
      speed,
      distanceTraveled: 0,
    })
  }

  /** Clone once off-screen so first tracer doesn't hitch */
  public warm(): void {
    this.ensureBulletPrototype()
  }

  public update(dt: number): void {
    const physics = this.physics()
    const bulletHoles = Game.getInstance().renderer?.bulletHoleManager

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i]

      projectile.previousPosition.copy(projectile.position)
      const step = projectile.speed * dt
      projectile.position.add(projectile.direction.clone().multiplyScalar(step))
      projectile.distanceTraveled += step

      const hit = physics.raycast(projectile.previousPosition, projectile.position)
      if (hit.hasHit && hit.hitPosition) {
        // Walls only — bot hits use blood from hitscan in PlayerRenderer
        if (hit.hitNormal && !hit.hitBot) {
          bulletHoles?.spawn(hit.hitPosition, hit.hitNormal)
        }
        this.scene.remove(projectile.mesh)
        this.projectiles.splice(i, 1)
        continue
      }

      if (projectile.distanceTraveled >= this.maxDistance) {
        this.scene.remove(projectile.mesh)
        this.projectiles.splice(i, 1)
        continue
      }

      projectile.mesh.position.copy(projectile.position)
      projectile.mesh.lookAt(projectile.position.clone().add(projectile.direction))
    }
  }
}
