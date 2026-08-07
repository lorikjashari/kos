import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const glbPath = path.join(__dirname, '../public/fps_mine_sketch_m9.glb')

if (!fs.existsSync(glbPath)) {
  console.log('GLB not found at', glbPath)
  process.exit(0)
}

const loader = new GLTFLoader()
loader.load(glbPath, (gltf) => {
  const root = gltf.scene
  console.log('--- nodes ---')
  root.traverse((c) => {
    if (c.name) console.log(c.type, c.name, 'parent:', c.parent?.name ?? 'scene')
  })

  const armMeshes: THREE.Object3D[] = []
  root.traverse((c) => {
    if ((c as THREE.Mesh).isMesh && c.parent?.name === 'Armature') armMeshes.push(c)
  })

  root.updateMatrixWorld(true)
  let seat: THREE.Object3D | undefined
  root.traverse((c) => {
    if (c.name === 'Root' && c.parent?.name === 'Armature') seat = c
  })

  console.log('\n--- Armature child meshes ---')
  for (const m of armMeshes) {
    const p = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    m.matrixWorld.decompose(p, q, s)
    console.log(m.name, 'local pos', m.position.toArray().map((x) => x.toFixed(3)))
    console.log('  world pos', p.toArray().map((x) => x.toFixed(3)))
    if (seat) {
      const lp = seat.worldToLocal(p.clone())
      console.log('  Root-local', lp.toArray().map((x) => x.toFixed(3)))
    }
  }

  if (seat) {
    console.log('\nRoot local pos/rot', seat.position.toArray(), seat.rotation.toArray().map((x) => ((x * 180) / Math.PI).toFixed(1)))
  }
})
