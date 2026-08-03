import Ammo from "ammojs-typed";
import * as THREE from "three";
import { Actor } from "../../Core/Actor";
import { TQuaternion } from "../../Core/Quaternion";
import { Vector3D } from "../../Core/Vector";
import { IUpdatable } from "../../Interface/IUpdatable";
import { Physics } from "../Physics";
import { AmmoInstance } from "../Ammo";
import { packedPositions } from "./PackedPositions";

// This is only for static objects.
export class TrimeshCollider extends Actor implements IUpdatable {
  public mesh: THREE.Mesh;

  update(dt: number): void {
    super.update(dt, true, true);
  }

  // No indexing.
  protected createShape2(
    size: Vector3D,
    mesh: THREE.Mesh
  ): Ammo.btCollisionShape {
    const trimesh = new AmmoInstance!.btTriangleMesh(true, true);
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const vertexPositionArray = packedPositions(geometry);
    for (let i = 0; i < geometry.attributes.position.count / 3; i++) {
      trimesh.addTriangle(
        new Ammo.btVector3(
          vertexPositionArray[i * 9 + 0] * size.x,
          vertexPositionArray[i * 9 + 1] * size.y,
          vertexPositionArray[i * 9 + 2] * size.z
        ),
        new Ammo.btVector3(
          vertexPositionArray[i * 9 + 3] * size.x,
          vertexPositionArray[i * 9 + 4] * size.y,
          vertexPositionArray[i * 9 + 5] * size.z
        ),
        new Ammo.btVector3(
          vertexPositionArray[i * 9 + 6] * size.x,
          vertexPositionArray[i * 9 + 7] * size.y,
          vertexPositionArray[i * 9 + 8] * size.z
        ),
        false
      );
    }
    return new Ammo.btBvhTriangleMeshShape(trimesh, true, true);
  }

  protected createShape3(
    size: Vector3D,
    mesh: THREE.Mesh
  ): Ammo.btCollisionShape {
    const geometry = mesh.geometry as THREE.BufferGeometry;
    if (!geometry.index) throw new Error("No index");
    const vertexCount = geometry.attributes.position.count;
    const indexCount = geometry.index.count;

    const indexes = geometry.index.array;
    const vertices = packedPositions(geometry);

    const trimesh = new AmmoInstance!.btTriangleMesh(true, true);
    const vectors: Array<Ammo.btVector3> = [
      Vector3D.ZERO().toAmmo(),
      Vector3D.ZERO().toAmmo(),
      Vector3D.ZERO().toAmmo(),
    ];

    for (let i = 0; i < indexCount; i += 3) {
      const triIndex = [indexes[i], indexes[i + 1], indexes[i + 2]];
      vectors[0].setValue(
        vertices[triIndex[0] * 3] * size.x,
        vertices[triIndex[0] * 3 + 1] * size.y,
        vertices[triIndex[0] * 3 + 2] * size.z
      );
      vectors[1].setValue(
        vertices[triIndex[1] * 3] * size.x,
        vertices[triIndex[1] * 3 + 1] * size.y,
        vertices[triIndex[1] * 3 + 2] * size.z
      );
      vectors[2].setValue(
        vertices[triIndex[2] * 3] * size.x,
        vertices[triIndex[2] * 3 + 1] * size.y,
        vertices[triIndex[2] * 3 + 2] * size.z
      );
      trimesh.addTriangle(vectors[0], vectors[1], vectors[2], true);
    }
    AmmoInstance!.destroy(vectors[0]);
    AmmoInstance!.destroy(vectors[1]);
    AmmoInstance!.destroy(vectors[2]);

    return new AmmoInstance!.btBvhTriangleMeshShape(trimesh, true, true);
  }
  protected createShape(
    size: Vector3D,
    mesh: THREE.Mesh
  ): Ammo.btCollisionShape {
    return mesh.geometry.index
      ? this.createShape3(size, mesh)
      : this.createShape2(size, mesh);
  }

  protected createBody(
    shape: Ammo.btCollisionShape,
    pos: Vector3D = Vector3D.ZERO(),
    rotation: Vector3D = Vector3D.ZERO(),
    mass: number = 1
  ): Ammo.btRigidBody {
    this.transform = new AmmoInstance!.btTransform();
    const position = new AmmoInstance!.btVector3(pos.x, pos.y, pos.z);
    const quat = TQuaternion.setFromVector3D(rotation).toAmmo();
    this.transform.setOrigin(position);
    this.transform.setRotation(quat);

    const myMotionState = new AmmoInstance!.btDefaultMotionState(
      this.transform
    );
    this.transform.setIdentity();

    const localInertia = new AmmoInstance!.btVector3(0, 0, 0);
    shape.calculateLocalInertia(mass, localInertia);
    const rbInfo = new AmmoInstance!.btRigidBodyConstructionInfo(
      mass,
      myMotionState,
      shape,
      localInertia
    );

    const body = new AmmoInstance!.btRigidBody(rbInfo);
    const DISABLE_DEACTIVATION = 4;
    //body.setActivationState(DISABLE_DEACTIVATION);
    return body;
  }
  public addToWorld(physics: Physics): void {
    physics.add(this.body);
  }
  constructor(
    mesh: THREE.Mesh,
    pos: Vector3D = Vector3D.ZERO(),
    rotation: Vector3D = Vector3D.ZERO(),
    size: Vector3D = new Vector3D(1, 1, 1),
    mass: number = 1
  ) {
    super(pos, rotation);
    this.mesh = mesh;
    const shape = this.createShape3(size, this.mesh);
    const body = this.createBody(shape, pos, rotation, mass);
    this.setBody(body);
  }
}
