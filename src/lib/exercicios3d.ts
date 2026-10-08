import manifestoGerado from "./exercicios3dManifest.json";
import { resolverImagem } from "./imagemExercicio";
import type { Boneco3D, Entrada3D, Fundo } from "./visualizador3d/tipos";

// Exercícios com 3D (manifesto gerado pela fábrica, scripts/exercicios3d/pack.py): a ficha abre no boneco 3D e as
// listas mostram a foto parada dele. Exercício sem entrada continua com o GIF de hoje (ou o ícone).
export interface Manifesto3D {
  boneco: Boneco3D;
  exercicios: Record<string, Entrada3D>;
}

// o JSON chega com `alvo: number[]`; o pack.py grava sempre 3 números (a tupla do CameraInicial). Só tipo: o JS não muda.
const MANIFESTO = manifestoGerado as unknown as Manifesto3D;

export function entrada3d(id: string | null | undefined, manifesto: Manifesto3D = MANIFESTO): Entrada3D | null {
  return (id && manifesto.exercicios[id]) || null;
}

export function boneco3d(manifesto: Manifesto3D = MANIFESTO): Boneco3D {
  return manifesto.boneco;
}

/** Imagem do exercício nas listas: a foto parada do 3D quando ele tem 3D; senão a de hoje (webp local ou URL). */
export function fotoDoExercicio(
  id: string | null | undefined,
  imagemUrl: string | null | undefined,
  manifesto: Manifesto3D = MANIFESTO,
): string | null {
  return entrada3d(id, manifesto)?.foto ?? resolverImagem(imagemUrl);
}

// Fundo do visualizador: abre escuro (cor da caixa da ficha) e lembra a escolha no aparelho.
const CHAVE_FUNDO = "physiq.fundo3d";

export function fundoGuardado(): Fundo {
  try {
    return localStorage.getItem(CHAVE_FUNDO) === "claro" ? "claro" : "escuro";
  } catch {
    return "escuro";
  }
}

export function guardarFundo(fundo: Fundo) {
  try {
    localStorage.setItem(CHAVE_FUNDO, fundo);
  } catch {
    // sem acesso ao armazenamento: vale só enquanto a ficha estiver aberta
  }
}
