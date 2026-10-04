// Tipos do visualizador 3D dos exercícios (manifesto gerado por scripts/exercicios3d/pack.py).

export type Fundo = "escuro" | "claro";

/** Câmera inicial do exercício: az 0 = de frente pro boneco, 90 = lado esquerdo dele; el em graus; dist em m;
 * alvo = ponto que a câmera olha, em coordenadas do Blender (x, y, z; chão z = 0). */
export interface CameraInicial {
  az: number;
  el: number;
  dist?: number;
  alvo?: [number, number, number];
}

/** Boneco único (1 arquivo pra todos os exercícios) + mapa dos músculos (R = id, G = fibra). */
export interface Boneco3D {
  v: string;
  glb: string;
  mapa: string;
}

/** O que cada exercício com 3D guarda: só o movimento (+ equipamento), a foto parada e os músculos. */
export interface Entrada3D {
  v: string;
  movimento: string;
  foto: string;
  bytes: number;
  alvos: number[];
  auxiliares: number[];
  camera: CameraInicial;
  ida_s: number;
}
