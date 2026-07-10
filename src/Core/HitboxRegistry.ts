import Ammo from 'ammojs-typed'
import type { BodyPart } from './BodyPart'
import type { TrainingBot } from './TrainingBot'

export interface HitboxInfo {
  bot: TrainingBot
  part: BodyPart
}

/** Links Ammo rigid bodies to bot hit zones via userIndex (reliable with ammo.js wrappers). */
export class HitboxRegistry {
  private static nextId = 1
  private static readonly byId = new Map<number, HitboxInfo>()

  static register(body: Ammo.btRigidBody, info: HitboxInfo): void {
    const id = HitboxRegistry.nextId++
    body.setUserIndex(id)
    HitboxRegistry.byId.set(id, info)
  }

  static unregister(body: Ammo.btRigidBody): void {
    const id = body.getUserIndex()
    HitboxRegistry.byId.delete(id)
  }

  static lookup(collisionObject: Ammo.btCollisionObject): HitboxInfo | undefined {
    const id = collisionObject.getUserIndex()
    if (!id) return undefined
    return HitboxRegistry.byId.get(id)
  }
}
