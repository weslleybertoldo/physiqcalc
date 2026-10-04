// Qualidade adaptativa: mede o FPS a cada 2 s logo depois de abrir; abaixo de 30 baixa um degrau
// (1 = resolução 1,5×, 2 = resolução 1× e sombra menor). Passou de 30 uma vez, para de medir.
export const FPS_MINIMO = 30;
export const JANELA_MS = 2000;

export type Degrau = 1 | 2;

export function criarMedidorDeQualidade(baixar: (degrau: Degrau) => void) {
  let inicio = -1;
  let quadros = 0;
  let degrau = 0;
  let parou = false;
  return (agoraMs: number) => {
    if (parou) return;
    if (inicio < 0) {
      inicio = agoraMs;
      return;
    }
    quadros++;
    const passou = agoraMs - inicio;
    if (passou < JANELA_MS) return;
    if ((quadros * 1000) / passou < FPS_MINIMO) {
      degrau++;
      baixar(degrau as Degrau);
      if (degrau >= 2) parou = true;
    } else {
      parou = true;
    }
    inicio = agoraMs;
    quadros = 0;
  };
}
