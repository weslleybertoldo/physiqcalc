// Som do fim do descanso — escolha do aluno no popup Configurações › Som (pedido 18/09/2026).
// Preferência do APARELHO (localStorage): 1 aparelho = 1 escolha, sem migration nem sync.
// Web/PWA: os tons tocam aqui (AudioContext). APK: o serviço nativo (TimerForegroundService) recebe
// a escolha e gera os MESMOS tons como mídia — com fone conectado, só no fone (pedido dele 18/09/2026).

export type SomDescanso = "bip" | "sino" | "alarme" | "vibrar" | "silencio";

export const SOM_PADRAO: SomDescanso = "bip";
export const SOM_CHAVE = "physiq_som_descanso";
/** Disparado no window quando o aluno troca o som (detail = SomDescanso) — o TimerDescanso re-arma o serviço nativo */
export const SOM_EVENTO = "physiq:som-descanso";

export interface SomOpcao {
  valor: SomDescanso;
  nome: string;
  descricao: string;
}

export const SOM_OPCOES: SomOpcao[] = [
  { valor: "bip", nome: "Bip", descricao: "Três toques curtos" },
  { valor: "sino", nome: "Sino", descricao: "Dois toques longos" },
  { valor: "alarme", nome: "Alarme", descricao: "Cinco toques rápidos" },
  { valor: "vibrar", nome: "Só vibrar", descricao: "Sem som: 5 vibrações, uma por segundo" },
  { valor: "silencio", nome: "Silencioso", descricao: "Nada toca nem vibra" },
];

export function ehSomDescanso(v: unknown): v is SomDescanso {
  return SOM_OPCOES.some((o) => o.valor === v);
}

export function nomeDoSom(som: SomDescanso): string {
  return SOM_OPCOES.find((o) => o.valor === som)?.nome ?? som;
}

export function lerSomDescanso(): SomDescanso {
  try {
    const v = localStorage.getItem(SOM_CHAVE);
    return ehSomDescanso(v) ? v : SOM_PADRAO;
  } catch {
    return SOM_PADRAO;
  }
}

export function gravarSomDescanso(som: SomDescanso): void {
  try {
    localStorage.setItem(SOM_CHAVE, som);
  } catch {
    // localStorage indisponível (modo privado) — fica o padrão nesta sessão
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SOM_EVENTO, { detail: som }));
  }
}

/** Tons de cada som: [frequência Hz, início s, duração s] — puro, testável. */
export function tonsDoSom(som: SomDescanso): [number, number, number][] {
  switch (som) {
    case "bip":
      return [[880, 0, 0.8], [880, 0.9, 0.8], [1100, 1.8, 0.8]];
    case "sino":
      return [[1320, 0, 1.6], [1320, 1.8, 1.6]];
    case "alarme":
      return [[1000, 0, 0.25], [1000, 0.35, 0.25], [1000, 0.7, 0.25], [1000, 1.05, 0.25], [1000, 1.4, 0.25]];
    default:
      return [];
  }
}

/** "Só vibrar" e os sons vibram; "Silencioso" não. */
export function deveVibrar(som: SomDescanso): boolean {
  return som !== "silencio";
}

/** Tem som pra tocar (não é vibração pura nem silencioso)? */
export function temSom(som: SomDescanso): boolean {
  return tonsDoSom(som).length > 0;
}

/** Toca o som no AudioContext dado (o TimerDescanso reaproveita o dele). */
export function tocarSom(ctx: AudioContext, som: SomDescanso): void {
  for (const [freq, inicio, duracao] of tonsDoSom(som)) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.3, ctx.currentTime + inicio);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + duracao);
    osc.start(ctx.currentTime + inicio);
    osc.stop(ctx.currentTime + inicio + duracao);
  }
}

// ───────────── vibração do fim do descanso (pedido dele 30/09/2026) ─────────────
// "o vibrar está muito longo e não está acompanhando o som. E só vibrar está muito longo, pode ser 5 vibrações no tempo
// normal de 1s. E no som pode vibrar no tempo do som" → com som, vibra JUNTO com cada toque (começa no toque e dura a 1ª
// metade dele: o tom cai rápido — envelope exponencial —, a parte que se ouve é o começo); "Só vibrar" = 5 vibrações
// curtas, uma por segundo (meio segundo vibrando, meio parado); "Silencioso" = nada. Antes: 3 × 3 s com 1 s de pausa (11 s)
// para qualquer som.

/** "Só vibrar": 5 batidas de 1 s — [início s, duração s], como os tons. */
const BATIDAS_SO_VIBRAR: [number, number][] = [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]];

/** Quanto de cada toque (ou batida) vibra. */
export const FRACAO_VIBRANDO = 0.5;

/** O ritmo de cada som: [início s, duração s] de cada toque (os tons de `tonsDoSom`) ou de cada batida do "Só vibrar". */
export function ritmoDoSom(som: SomDescanso): [number, number][] {
  if (som === "vibrar") return BATIDAS_SO_VIBRAR.map(([i, d]) => [i, d]);
  return tonsDoSom(som).map(([, inicio, duracao]) => [inicio, duracao]);
}

/**
 * Padrão de vibração do fim do descanso no formato do `navigator.vibrate`: [vibra, pausa, vibra, …] em ms (vazio = não vibra).
 * Cada vibração começa junto com um toque do som. O serviço nativo (TimerForegroundService.padraoVibracao, que vibra quando o
 * app está fechado) guarda os MESMOS números com o 0 inicial do Android ({espera, vibra, pausa, …}); o teste
 * vibracaoNativa.test.ts lê o .java e confere que os dois batem.
 */
export function padraoVibracao(som: SomDescanso): number[] {
  const padrao: number[] = [];
  let fimAnterior = 0;
  ritmoDoSom(som).forEach(([inicio, duracao], i) => {
    const comeca = Math.round(inicio * 1000);
    const vibra = Math.max(1, Math.round(duracao * FRACAO_VIBRANDO * 1000));
    if (i > 0) padrao.push(Math.max(0, comeca - fimAnterior));
    padrao.push(vibra);
    fimAnterior = comeca + vibra;
  });
  return padrao;
}

/** O mesmo padrão no formato do Android (createWaveform): {espera, vibra, pausa, …}, com a espera inicial 0. */
export function padraoVibracaoAndroid(som: SomDescanso): number[] {
  const p = padraoVibracao(som);
  return p.length ? [0, ...p] : [];
}

/** Vibra o fim do descanso pelo navegador (site/PWA e a prévia "Ouvir" fora do APK) no ritmo do som escolhido. */
export function vibrarNoNavegador(som: SomDescanso): void {
  const padrao = padraoVibracao(som);
  if (!padrao.length || typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(padrao);
  } catch {
    /* navegador sem vibração */
  }
}
