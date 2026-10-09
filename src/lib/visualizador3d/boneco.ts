import { criarFetchResiliente } from "@/integrations/repeticao";

// Guarda só o ARQUIVO do boneco (~2,5 MB) entre uma ficha e outra; a malha e as texturas na placa de vídeo são
// liberadas quando a ficha fecha (motor.destruir). Falhou o download → tenta de novo na próxima ficha.
// hml-14d (H-32, D37): o arquivo chega em até 30 s, contando o corpo; passou disso o download desiste (a promessa guardada
// rejeita, sai do guardado e a próxima ficha tenta de novo — antes, um fetch pendurado deixava toda ficha seguinte esperando).
export const TEMPO_BONECO_MS = 30_000;
const baixarBoneco = criarFetchResiliente(0, TEMPO_BONECO_MS, undefined, { ateOCorpo: true });
let guardado: { url: string; arquivo: Promise<ArrayBuffer> } | null = null;

export function arquivoDoBoneco(url: string): Promise<ArrayBuffer> {
  if (!guardado || guardado.url !== url) {
    const arquivo = baixarBoneco(url).then((r) => {
      if (!r.ok) throw new Error(`boneco 3D: HTTP ${r.status}`);
      return r.arrayBuffer();
    });
    guardado = { url, arquivo };
    arquivo.catch(() => {
      if (guardado?.arquivo === arquivo) guardado = null;
    });
  }
  return guardado.arquivo;
}
