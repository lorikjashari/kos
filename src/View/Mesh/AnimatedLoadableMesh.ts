import * as THREE from "three";
import { IUpdatable } from "../../Interface/IUpdatable";
import {
  AnimationMarker,
  AnimationMarkerDelimiter,
} from "../../Interface/utils";
import { LoadableMesh } from "./LoadableMesh";

export class AnimatedLoadableMesh extends LoadableMesh implements IUpdatable {
  public mixer!: THREE.AnimationMixer;
  protected lastAnimationDuration!: number;
  public animations = new Map<string, AnimationMarkerDelimiter>();
  private currentAnimIsLoop = false;
  private currentAnimIsInterrompable = false;
  private currentAnim!: AnimationMarkerDelimiter;
  private animTimeScale = 1.5;
  constructor(path: string, key: string) {
    super(path, key);
  }
  update(dt: number): void {
    if (
      this.lastAnimationDuration &&
      this.mixer.time < this.lastAnimationDuration
    ) {
      this.mixer.update(dt);
    } else if (this.currentAnimIsLoop) {
      this.playAnimationDelimiter(this.currentAnim, this.animTimeScale);
    }
  }
  protected setAnimations(markers: Map<string, AnimationMarkerDelimiter>) {
    this.animations = markers;
  }
  public async load(): Promise<void> {
    await super.load()
    await this.loadAnimationMarkers()
  }

  /** (Re)load Start/End markers from `<path>.json` — safe to call after HMR retunes. */
  public async loadAnimationMarkers(): Promise<void> {
    try {
      const fileName = this.path.replace(/\.glb$/i, '')
      const response = await fetch(`${fileName}.json`)
      if (!response.ok) throw new Error(`Failed to load animation markers: ${fileName}.json`)
      const json: any = await response.json()
      const markers: Array<AnimationMarker> = json.markers
      this.animations.clear()
      for (let i = 0; i < markers.length; i++) {
        const marker: AnimationMarker = markers[i]
        const rawName = marker.name
        const content = rawName.split('_')
        const name = content[0]
        const state = content[1]
        if (this.animations.has(name)) {
          const animationDelimiter: AnimationMarkerDelimiter | undefined =
            this.animations.get(name)
          animationDelimiter![state] = marker
        } else {
          const animationDelimiter: AnimationMarkerDelimiter = {
            name: name,
            Start: undefined,
            End: undefined,
          }
          animationDelimiter[state] = marker

          this.animations.set(name, animationDelimiter)
        }
      }
    } catch (error) {
      console.warn(`Animation markers not loaded for ${this.key}:`, error)
    }
  }

  public clone(): AnimatedLoadableMesh {
    const loadableMesh = new AnimatedLoadableMesh(this.path, this.key);
    loadableMesh.setMesh(this.cloneMesh());
    loadableMesh.setAnimations(this.animations);
    return loadableMesh;
  }

  public getCurrentAnimName(): string {
    return this.currentAnim?.name ?? ''
  }

  public findClip(name: string): THREE.AnimationClip | undefined {
    const clips = this.mesh?.animations
    if (!clips?.length) return undefined
    const lower = name.toLowerCase()
    return clips.find((c) => c.name === name || c.name.toLowerCase() === lower)
  }

  public hasNamedClip(name: string): boolean {
    return !!this.findClip(name)
  }

  /** Play a GLB animation clip by name (CS 1.6 MDL exports: draw, slash1, …). Returns wall-clock seconds. */
  public playNamedClip(clipName: string, loop = false, timeScale = 1.0): number {
    const clip = this.findClip(clipName)
    if (!clip || !this.mixer) {
      console.warn(`[${this.key}] clip "${clipName}" not found`)
      return 0
    }

    this.mixer.stopAllAction()
    this.currentAnimIsLoop = loop
    this.currentAnimIsInterrompable = true
    this.currentAnim = {
      name: clipName,
      Start: { name: `${clipName}_Start`, time: 0, frame: 0 },
      End: { name: `${clipName}_End`, time: clip.duration, frame: 0 },
    }
    this.animTimeScale = timeScale
    this.lastAnimationDuration = clip.duration / Math.max(0.05, timeScale)

    const action = this.mixer.clipAction(clip)
    action.reset()
    action.enabled = true
    action.paused = false
    action.loop = loop ? THREE.LoopRepeat : THREE.LoopOnce
    action.clampWhenFinished = true
    action.timeScale = timeScale
    action.play()
    this.mixer.time = 0
    return this.lastAnimationDuration
  }

  // Loop: repeat
  // selfInterrompable: Possibility of the animation to stop itself to play again from 0
  public playAnimation(
    animationName: string,
    loop = false,
    selfInterrompable = true,
    timeScale = 1.5
  ) {
    const animationMarker = this.animations.get(animationName)

    if (!animationMarker) {
      console.log(`${animationName} animation doesn't exist on ${this.key}`);
      return;
    }
    if (!selfInterrompable && animationMarker.name === this.currentAnim?.name) {
      return;
    }

    this.mixer.stopAllAction();
    this.currentAnimIsLoop = loop;
    this.currentAnimIsInterrompable = selfInterrompable;

    this.playAnimationDelimiter(animationMarker, timeScale);
  }
  public getAnimWallProgress(): number {
    if (!this.lastAnimationDuration || this.lastAnimationDuration <= 0) return 1
    return Math.min(1, Math.max(0, this.mixer.time / this.lastAnimationDuration))
  }

  public playAnimationDelimiter(animationMarker: AnimationMarkerDelimiter, timeScale = 1.5) {
    if (!animationMarker?.Start || !animationMarker?.End) {
      console.warn(`Animation "${animationMarker?.name ?? 'unknown'}" is missing Start/End markers`)
      return
    }

    this.currentAnim = animationMarker;
    this.animTimeScale = timeScale

    const clips = this.mesh.animations;
    const start = Math.abs(animationMarker!["Start"]!.time);
    const end = animationMarker!["End"]!.time;
    const clipSpan = Math.max(0.05, end - start);
    // Wall-clock seconds the mixer should keep updating
    this.lastAnimationDuration = clipSpan / Math.max(0.05, timeScale);
    this.mixer.time = 0;
    this.mixer.timeScale = 1;
    for (let i = 0; i < clips.length; i++) {
      const action = this.mixer.clipAction(clips[i]);
      action.reset();
      action.paused = false;
      action.enabled = true;
      action.loop = THREE.LoopOnce;
      action.clampWhenFinished = true;
      action.timeScale = timeScale;
      action.time = start;
      action.play();
    }
  }

  /** Freeze the viewmodel at a clip time (no loop). Used for editor AK rest pose. */
  public holdPoseAt(time = 0): void {
    if (!this.mixer || !this.mesh?.animations?.length) return
    this.mixer.stopAllAction()
    this.currentAnimIsLoop = false
    this.lastAnimationDuration = 0
    this.currentAnim = undefined as unknown as AnimationMarkerDelimiter
    this.mixer.time = 0
    this.mixer.timeScale = 1
    for (const clip of this.mesh.animations) {
      const action = this.mixer.clipAction(clip)
      action.reset()
      action.enabled = true
      action.loop = THREE.LoopOnce
      action.clampWhenFinished = true
      action.timeScale = 1
      action.time = Math.max(0, Math.min(time, clip.duration))
      action.play()
      action.paused = true
    }
    this.mixer.update(0)
  }

  /** Keep the current pose (e.g. end of reload) without snapping to bind. */
  public settlePose(): void {
    if (!this.mixer) return
    this.currentAnimIsLoop = false
    this.lastAnimationDuration = 0
    this.mixer.timeScale = 1
    for (const clip of this.mesh.animations) {
      const action = this.mixer.clipAction(clip)
      action.paused = true
      action.clampWhenFinished = true
    }
  }

  public init() {
    super.init();
    this.initAnimation();
  }
  public initAnimation() {
    this.mixer = new THREE.AnimationMixer(this.mesh);
  }
  public playAllAnimation() {
    const clips = this.mesh.animations;
    this.mixer.stopAllAction();
    clips.forEach((clip) => {
      const action = this.mixer.clipAction(clip);
      action.loop = THREE.LoopOnce;
      action.play();
    });
  }
}
