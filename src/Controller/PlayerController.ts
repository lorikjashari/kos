import { Player } from "../Core/Player";
import { Vector3D } from "../Core/Vector";
import { HitscanResult } from "../Interface/utils";
import { Controller } from "./Controller";

export class PlayerController extends Controller {
  update(dt: number) {
    // gérer inputs
  }

  constructor(controlledPlayer: Player) {
    super(controlledPlayer);
  }

  public getPlayer(): Player {
    return this.controlledPawn as Player;
  }
  private updateSpeed(speed: number): number {
    const player = this.getPlayer()
    return speed
  }
  public moveForward(speed: number, dt: number): void {
    const player = this.getPlayer()
    this.updateSpeed(speed)
    player.moveForward()
  }

  public moveBackward(speed: number, dt: number) {
    const player = this.getPlayer()
    this.updateSpeed(speed)

    player.moveBackward()
  }
  public moveLeft(speed: number, dt: number) {
    const player = this.getPlayer()
    this.updateSpeed(speed)

    player.moveLeft()
  }
  public moveRight(speed: number, dt: number) {
    const player = this.getPlayer()
    this.updateSpeed(speed)

    player.moveRight()
  }
  public jump(): boolean {
    const player = this.getPlayer();
    const canJump = player.canJump();
    if (canJump) {
      player.jump();
    }
    return canJump;
  }
  public shoot(): HitscanResult | undefined {
    const player = this.getPlayer();
    const canShoot: boolean = player.canShoot();
    if (canShoot) {
      return player.shoot(); // reset last shoot timestamp
    }
    return undefined;
  }
}
