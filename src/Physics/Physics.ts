import Ammo from 'ammojs-typed'
import { Vector3D } from '../Core/Vector'
import { HitscanResult } from '../Interface/utils'
import { IUpdatable } from '../Interface/IUpdatable'
import { AmmoInstance } from './Ammo'

export class Physics implements IUpdatable {
  public world: Ammo.btDiscreteDynamicsWorld
  constructor(
    dispatcher: Ammo.btCollisionDispatcher,
    overlappingPairCache: Ammo.btDbvtBroadphase,
    solver: Ammo.btSequentialImpulseConstraintSolver,
    collisionConfiguration: Ammo.btDefaultCollisionConfiguration
  ) {
    this.world = new AmmoInstance!.btDiscreteDynamicsWorld(
      dispatcher,
      overlappingPairCache,
      solver,
      collisionConfiguration
    )
    this.world.setGravity(new AmmoInstance!.btVector3(0, -10 * 5, 0))
  }
  static createDefault(): Physics {
    const collisionConfiguration = new AmmoInstance!.btDefaultCollisionConfiguration(),
      dispatcher = new AmmoInstance!.btCollisionDispatcher(collisionConfiguration),
      overlappingPairCache = new AmmoInstance!.btDbvtBroadphase(),
      solver = new AmmoInstance!.btSequentialImpulseConstraintSolver()

    const physics = new Physics(dispatcher, overlappingPairCache, solver, collisionConfiguration)
    return physics
  }
  add(body: Ammo.btRigidBody) {
    this.world.addRigidBody(body)
  }

  remove(body: Ammo.btRigidBody) {
    this.world.removeRigidBody(body)
  }

  public raycast(from: Vector3D, to: Vector3D): HitscanResult {
    const fromAmmo = from.toAmmo()
    const toAmmo = to.toAmmo()
    const rayCallBack = new AmmoInstance!.ClosestRayResultCallback(fromAmmo, toAmmo)
    this.world.rayTest(fromAmmo, toAmmo, rayCallBack)

    const result: HitscanResult = {
      hasHit: false,
      hitPosition: undefined,
    }

    if (rayCallBack.hasHit()) {
      result.hasHit = true
      result.hitPosition = Vector3D.fromAmmo(rayCallBack.get_m_hitPointWorld())
      result.hitNormal = Vector3D.fromAmmo(rayCallBack.get_m_hitNormalWorld())
    }

    AmmoInstance!.destroy(fromAmmo)
    AmmoInstance!.destroy(toAmmo)
    AmmoInstance!.destroy(rayCallBack)
    return result
  }

  update(dt: number): void {
    // One substep of exactly dt: with the default 1/60 fixed step, frames shorter than
    // 1/60 simulate nothing at all and Bullet hands back an extrapolated motion state,
    // which shows up as stutter at high refresh rates.
    // Simulated time has to match real time — a lower bound here would advance the world
    // further than the frame actually took, so anything above that rate ran fast
    // (a 600 Hz display moved at double speed against a 1/300 floor).
    const step = Math.min(1 / 30, dt)
    if (!(step > 0)) return
    this.world.stepSimulation(step, 1, step)
  }
}
