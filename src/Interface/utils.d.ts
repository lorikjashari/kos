import { Vector3D } from "../Core/Vector";

export interface GroundRaycastProperty {
  initialLocalPos: Vector3D;
  size: number;
}

export interface HitscanProperty {
  from: Vector3D;
  to: Vector3D;
}

export type HitBodyPart = 'head' | 'body' | 'legs'

export interface HitscanResult {
  hasHit: boolean;
  hitPosition: Vector3D | undefined;
  hitNormal?: Vector3D;
  /** Training bot / enemy hit */
  hitBot?: boolean;
  bodyPart?: HitBodyPart;
  killed?: boolean;
  damageDealt?: number;
  /** Index into Game.trainingBots */
  botIndex?: number;
}

export interface RenderingConfig {
  resolution: number;
  hasParticle: boolean;
  hasPostProcess: boolean;
  hasLight: boolean;
  hasShadow: boolean;
  updateViewmodel: boolean;
  showViewmodel: boolean;
  debugCamera: boolean;
  legacyViewmodel: boolean;
}

export interface MeshAttributes {
  vertices: Array<any>;
  matrices: Array<any>;
  indexes: Array<any>;
}

export interface AnimationMarker {
  frame: number;
  name: string;
  time: number;
}

export interface AnimationMarkerDelimiter {
  name: string;
  Start: AnimationMarker | undefined;
  End: AnimationMarker | undefined;
}
