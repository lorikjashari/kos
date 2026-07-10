import * as THREE from 'three'
import { FolderApi, Pane } from 'tweakpane'
import { Vector2D, Vector3D } from '../Core/Vector'

class ObjectProperties {
  x!: number
  y!: number
  z!: number
}

/**
 * Tweakpane backend kept for optional internal hooks, but the Details sidebar
 * and hitbox debug UI are fully removed from the player-facing game.
 */
export class DebugUI extends Pane {
  public playerFolder: FolderApi
  public viewmodelFolder: FolderApi
  public lightFolder: FolderApi
  public hitboxFolder: FolderApi

  constructor() {
    const container = document.createElement('div')
    container.style.display = 'none'
    container.setAttribute('aria-hidden', 'true')
    document.body.appendChild(container)

    super({ container, title: 'Debug', expanded: false })

    this.playerFolder = this.addFolder({ title: 'Player', expanded: false })
    this.viewmodelFolder = this.addFolder({ title: 'Viewmodel', expanded: false })
    this.lightFolder = this.addFolder({ title: 'Light', expanded: false })
    this.hitboxFolder = this.addFolder({ title: 'Bot Hitboxes', expanded: false })
  }

  public syncHitboxToggle(): void {
    /* removed */
  }

  public applyHitboxVisibility(): void {
    /* removed */
  }

  public bindHitboxDebug(): void {
    /* removed */
  }

  public toggle(): void {
    /* removed */
  }

  public setOpen(_open: boolean): void {
    /* removed */
  }

  public addVector2(
    vector: Vector2D,
    name: string = 'Unnamed vector',
    size: Vector2D = new Vector2D(2, 2),
    incr?: number
  ): FolderApi {
    const properties = new ObjectProperties()
    Object.defineProperties(properties, {
      x: {
        get: () => vector.x,
        set: (value) => (vector.x = value),
      },
      y: {
        get: () => vector.y,
        set: (value) => (vector.y = value),
      },
    })
    const result = this.addFolder({ title: name })
    result.addInput(properties, 'x', {
      min: -size.x,
      max: size.x,
      step: incr,
    })
    result.addInput(properties, 'y', {
      min: -size.y,
      max: size.y,
      step: incr,
    })
    return result
  }

  public addVector(
    vector: Vector3D,
    name: string = 'Unnamed vector',
    size: Vector3D = new Vector3D(2, 2, 2),
    incr?: number
  ): FolderApi {
    const properties = new ObjectProperties()
    Object.defineProperties(properties, {
      x: {
        get: () => vector.x,
        set: (value) => (vector.x = value),
      },
      y: {
        get: () => vector.y,
        set: (value) => (vector.y = value),
      },
      z: {
        get: () => vector.z,
        set: (value) => (vector.z = value),
      },
    })
    const result = this.addFolder({ title: name })
    result.addInput(properties, 'x', {
      min: -size.x,
      max: size.x,
      step: incr,
    })
    result.addInput(properties, 'y', {
      min: -size.y,
      max: size.y,
      step: incr,
    })
    result.addInput(properties, 'z', {
      min: -size.z,
      max: size.z,
      step: incr,
    })
    return result
  }

  public addMesh(mesh: THREE.Object3D) {
    this.addVector(mesh.position as any, 'Position')
    this.addVector(mesh.rotation as any, 'Rotation', new Vector3D(Math.PI, Math.PI, Math.PI))
    this.addVector(mesh.scale as any, 'Scale')
  }
}
