import * as THREE from "three";
import { IUpdatable } from "../../Interface/IUpdatable";
import {
  AnimationMarker,
  AnimationMarkerDelimiter,
} from "../../Interface/utils";
import { GlobalLoadingManager } from "./GlobalLoadingManager";
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
      const json: any = await GlobalLoadingManager.loadJson(`${fileName}.json`)
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
