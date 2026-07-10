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
    this.world.stepSimulation(dt)
  }
}
