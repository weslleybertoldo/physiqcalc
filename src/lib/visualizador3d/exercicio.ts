import * as THREE from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Entrada3D } from "./tipos";

// Movimento de um exercício: o arquivo traz o esqueleto animado (mesmos nomes de osso do boneco único) e o
// equipamento. O equipamento entra na cena junto do boneco; o clipe toca no boneco.
export async function carregarExercicio(loader: GLTFLoader, url: string) {
  const gltf = await loader.loadAsync(url);
  const clipe = gltf.animations[0];
  if (!clipe) throw new Error("exercício 3D sem animação");
  const equipamento = gltf.scene.children.filter((o) => !temOssos(o));
  return { clipe, equipamento };
}

// O clipe é só a ida (t=0→1): o normal é ir e voltar; o cíclico (corrida) termina igual ao começo e só repete.
export function modoDeRepeticao(entrada: Pick<Entrada3D, "ciclo">) {
  return entrada.ciclo ? THREE.LoopRepeat : THREE.LoopPingPong;
}

function temOssos(o: THREE.Object3D) {
  let tem = false;
  o.traverse((x) => {
    if ((x as THREE.Bone).isBone) tem = true;
  });
  return tem;
}
