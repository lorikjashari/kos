import * as THREE from 'three'

const FOLLOW_IDLE = 0.35
const FOLLOW_ANIM = 0.94
const SMOOTH_IDLE = 10
const SMOOTH_ANIM = 20

/**
 * Smooth knife follow: wrist animation delta in viewmodel space.
 * Full strength while a clip plays; lighter while idle to avoid camera jitter.
 */
export class MDLKnifeWristFollower {
  private readonly restWristLocal = new THREE.Vector3()
  private readonly restPropLocalVm = new THREE.Vector3()
  private readonly restPropLocalParent = new THREE.Vector3()
  private readonly smoothParentLocal = new THREE.Vector3()
  private readonly scratch = {
    wristLocal: new THREE.Vector3(),
    delta: new THREE.Vector3(),
    targetVm: new THREE.Vector3(),
    targetWorld: new THREE.Vector3(),
    targetParent: new THREE.Vector3(),
  }

  constructor(
    private readonly prop: THREE.Object3D,
    private readonly wrist: THREE.Object3D,
    private readonly viewRoot: THREE.Object3D
  ) {
    viewRoot.updateMatrixWorld(true)
    wrist.updateMatrixWorld(true)
    prop.updateMatrixWorld(true)

    viewRoot.worldToLocal(
      this.restWristLocal.setFromMatrixPosition(wrist.matrixWorld)
    )
    viewRoot.worldToLocal(
      this.restPropLocalVm.setFromMatrixPosition(prop.matrixWorld)
    )
    this.restPropLocalParent.copy(prop.position)
    this.smoothParentLocal.copy(prop.position)
  }

  public snapToRest(): void {
    this.smoothParentLocal.copy(this.restPropLocalParent)
    this.prop.position.copy(this.restPropLocalParent)
  }

  /** Editor / seat reset — re-capture rest anchors from the prop's current local pose. */
  public syncRestFromProp(): void {
    this.viewRoot.updateMatrixWorld(true)
    this.prop.updateMatrixWorld(true)
    this.restPropLocalParent.copy(this.prop.position)
    this.smoothParentLocal.copy(this.prop.position)
    this.viewRoot.worldToLocal(
      this.restPropLocalVm.setFromMatrixPosition(this.prop.matrixWorld)
    )
  }

  /** Editor nudge — shift rest so wrist follow does not undo the tune next frame. */
  public nudgeRestPosition(axis: 'x' | 'y' | 'z', delta: number): void {
    this.restPropLocalParent[axis] += delta
    this.smoothParentLocal[axis] += delta
    this.viewRoot.updateMatrixWorld(true)
    this.prop.updateMatrixWorld(true)
    this.viewRoot.worldToLocal(
      this.restPropLocalVm.setFromMatrixPosition(this.prop.matrixWorld)
    )
  }

  /** Snap knife to current wrist — use after hands jump to draw frame 0. */
  public syncToWrist(): void {
    const target = this.computeTargetParentLocal(FOLLOW_ANIM)
    this.smoothParentLocal.copy(target)
    this.prop.position.copy(target)
  }

  public update(dt: number, animating: boolean): void {
    const strength = animating ? FOLLOW_ANIM : FOLLOW_IDLE
    const smooth = animating ? SMOOTH_ANIM : SMOOTH_IDLE
    const step = 1 - Math.exp(-smooth * Math.max(0.001, dt))

    const target = this.computeTargetParentLocal(strength)
    this.smoothParentLocal.lerp(target, step)
    this.prop.position.copy(this.smoothParentLocal)
  }

  private computeTargetParentLocal(strength: number): THREE.Vector3 {
    const parent = this.prop.parent
    if (!parent) return this.smoothParentLocal

    this.viewRoot.updateMatrixWorld(true)
    this.wrist.updateMatrixWorld(true)
    parent.updateMatrixWorld(true)

    this.viewRoot.worldToLocal(
      this.scratch.wristLocal.setFromMatrixPosition(this.wrist.matrixWorld)
    )
    this.scratch.delta
      .copy(this.scratch.wristLocal)
      .sub(this.restWristLocal)
      .multiplyScalar(strength)

    this.scratch.targetVm.copy(this.restPropLocalVm).add(this.scratch.delta)
    this.scratch.targetWorld.copy(this.scratch.targetVm)
    this.viewRoot.localToWorld(this.scratch.targetWorld)
    parent.worldToLocal(this.scratch.targetWorld)
    return this.scratch.targetParent.copy(this.scratch.targetWorld)
  }
}

export function findKnifeWristBone(viewmodelRoot: THREE.Object3D): THREE.Object3D | undefined {
  let wrist: THREE.Object3D | undefined
  viewmodelRoot.traverse((c) => {
    if (!wrist && c.name === 'r_wrist') wrist = c
  })
  return wrist
}

export function bindKnifeWristFollower(
  viewmodelRoot: THREE.Object3D,
  prop: THREE.Object3D
): MDLKnifeWristFollower | null {
  const wrist = findKnifeWristBone(viewmodelRoot)
  if (!wrist) return null
  return new MDLKnifeWristFollower(prop, wrist, viewmodelRoot)
}
