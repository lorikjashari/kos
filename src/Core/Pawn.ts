import Ammo from 'ammojs-typed'
import { BufferGeometry, Material, Mesh } from 'three'
import { Physics } from '../Physics/Physics'
import { Actor } from './Actor'
import { Vector3D } from './Vector'

/** Legacy abstract base — not used by the live player/bot path. Kept for Actor hierarchy. */
export abstract class Pawn extends Actor {
  protected abstract createShape(
    size?: Vector3D,
    mesh?: Mesh<BufferGeometry, Material | Material[]>
  ): Ammo.btCollisionShape
  protected abstract createBody(
    shape: Ammo.btCollisionShape,
    pos?: Vector3D,
    rotation?: Vector3D,
    mass?: number
  ): Ammo.btRigidBody
  public abstract addToWorld(physics: Physics): void

  constructor(position: Vector3D, rotation: Vector3D) {
    super(position, rotation)
  }
}
