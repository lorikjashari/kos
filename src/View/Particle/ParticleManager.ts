import { IUpdatable } from "../../Interface/IUpdatable";
import * as THREE from "three";
import ParticleSystem, { CustomRenderer, Emitter } from "three-nebula";
import { Game } from "../../Game";
import { FPSRenderer } from "../Renderer/PlayerRenderer/FPSRenderer";

export class ParticleManager extends ParticleSystem implements IUpdatable {
  private muzzleTextureReady: Promise<void>

  constructor(scene: THREE.Scene) {
    super();
    this.muzzleTextureReady = this.addScene(scene);
  }

  public whenReady(): Promise<void> {
    return this.muzzleTextureReady
  }

  addScene(scene: THREE.Scene): Promise<void> {
    const renderer = new CustomRenderer();
    const textureReady = new Promise<void>((resolve) => {
      const map = new THREE.TextureLoader().load(
        "muzzle.png",
        () => resolve(),
        undefined,
        () => resolve()
      );
      const material = new THREE.SpriteMaterial({
        map,
        color: 0x22334455,
        blending: THREE.AdditiveBlending,
        fog: true,
      });
      void new THREE.Sprite(material);
    });
    renderer.onParticleCreated = function (p) {
      const game = Game.getInstance();
      const bulletMesh =
        game.globalLoadingManager.loadableMeshs.get("Bullet")!.mesh;
      const fpsRenderer = game.currentPlayer.renderer as FPSRenderer;
      const fpsMesh = fpsRenderer.fpsMesh;
      p.target = this.targetPool.get(bulletMesh);
      p.target.position.set(1, -1, -2);
      p.target.scale.set(0.04, 0.04, 0.04);
      // TODO: fix heap size memory
      fpsMesh.mesh.add(p.target);
    };

    renderer.onParticleUpdate = function (p) {
      //p.target.position.copy(pos.add(player.lookingDirection.clone().multiplyScalar(4)).add(p.position));
      p.target.position.add(p.position);
      p.target.rotation.set(p.rotation.x, p.rotation.y, p.rotation.z);
    };

    renderer.onParticleDead = function (p) {
      const game = Game.getInstance();
      this.targetPool.expire(p.target);
      //scene.remove(p.target);
      const mesh = (game.currentPlayer.renderer as FPSRenderer).fpsMesh.mesh;
      mesh.remove(p.target);
      p.target = null;
    };
    super.addRenderer(renderer);
    return textureReady;
  }
  public addParticleEmitter(emitter: Emitter) {
    super.addEmitter(emitter);
  }
  update(dt: number): void {
    super.update(dt);
  }
}
