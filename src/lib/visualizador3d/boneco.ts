// Guarda só o ARQUIVO do boneco (~2,5 MB) entre uma ficha e outra; a malha e as texturas na placa de vídeo são
// liberadas quando a ficha fecha (motor.destruir). Falhou o download → tenta de novo na próxima ficha.
let guardado: { url: string; arquivo: Promise<ArrayBuffer> } | null = null;

export function arquivoDoBoneco(url: string): Promise<ArrayBuffer> {
  if (!guardado || guardado.url !== url) {
    const arquivo = fetch(url).then((r) => {
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
