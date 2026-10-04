import * as THREE from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Movimento de um exercício: o arquivo traz o esqueleto animado (mesmos nomes de osso do boneco único) e o
// equipamento. O equipamento entra na cena junto do boneco; o clipe toca no boneco.
export async function carregarExercicio(loader: GLTFLoader, url: string) {
  const gltf = await loader.loadAsync(url);
  const clipe = gltf.animations[0];
  if (!clipe) throw new Error("exercício 3D sem animação");
  const equipamento = gltf.scene.children.filter((o) => !temOssos(o));
  return { clipe, equipamento };
}

function temOssos(o: THREE.Object3D) {
  let tem = false;
  o.traverse((x) => {
    if ((x as THREE.Bone).isBone) tem = true;
  });
  return tem;
}
