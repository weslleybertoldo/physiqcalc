/**
 * play-W6 (16/10/2026) — "a loja com a Play valendo" para as telas da conta do app: `ativa` = a versão da Google Play (ehLoja) + o plugin
 * nativo (o AAB) + o servidor dizendo que vale para esta pessoa (a trava play_billing ou a conta de teste, e a credencial) + a Play
 * cobrando neste aparelho + ao menos 1 oferta mensal achada. SEM isso, cada tela fica exatamente como era na loja (o que a W1 escondeu
 * continua escondido) — e no site nada disto roda.
 * Um armazém do módulo (useSyncExternalStore), sem o React Query: a faixa, as travas e as Boas-vindas também são testadas sem o provedor.
 * O servidor e a Play são perguntados 1 vez por minuto no máximo (quem pede junto divide o pedido); `recarregar` pergunta de novo.
 * O guardado é da PESSOA (a revisão, ⚪16): trocou o login no aparelho → o da outra some na hora e o servidor é perguntado de novo (o
 * pedido que ainda estava no ar para a outra pessoa não publica mais nada).
 */
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { playDisponivel, pluginDaPlayPresente, produtosDaPlay, type ProdutoPlay } from "@/lib/playBilling";
import { useSessao } from "@/nucleo/sessao";
import { buscarEstadoPlay, type EstadoPlayServidor } from "./play";
import { PRODUTOS_PLAY, menorPreco, ofertasMensais, type CodigoPlay, type OfertaMensal } from "./playRegras";

interface Retrato {
  carregando: boolean;
  estado: EstadoPlayServidor | null;
  aparelho: boolean;
  produtos: ProdutoPlay[];
}

const VAZIO: Retrato = { carregando: false, estado: null, aparelho: false, produtos: [] };
const VALIDADE_MS = 60_000;

let retrato: Retrato = VAZIO;
let pedido: Promise<void> | null = null;
let quando = 0;
/** de quem é o guardado (o id do login); undefined = ainda de ninguém */
let dono: string | null | undefined;
/** cada troca de pessoa abre uma geração nova: o pedido de uma geração velha não publica */
let geracao = 0;
const ouvintes = new Set<() => void>();

function publicar(r: Retrato): void {
  retrato = r;
  ouvintes.forEach((f) => f());
}

function assinar(f: () => void): () => void {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

/** A pessoa mudou (outro login no aparelho): o guardado da outra some e a geração muda (o pedido no ar da outra não publica mais). */
function trocarDono(uid: string | null): void {
  dono = uid;
  geracao++;
  pedido = null;
  quando = 0;
  retrato = VAZIO;
}

/** Pergunta ao servidor e à Play (1 pedido em voo; dentro da validade, nada). Fora da loja nativa, nada. Nunca lança. `uid` = de quem
 *  é a pergunta (o login de agora): outro dono zera o guardado antes. */
export function carregarPlayDaLoja(forcar = false, uid?: string | null): Promise<void> {
  if (!pluginDaPlayPresente()) return Promise.resolve();
  if (uid !== undefined && uid !== dono) trocarDono(uid);
  if (pedido) return pedido;
  if (!forcar && quando && Date.now() - quando < VALIDADE_MS) return Promise.resolve();
  const minha = geracao;
  publicar({ ...retrato, carregando: true });
  pedido = (async () => {
    let novo: Retrato = { ...VAZIO };
    try {
      const estado = await buscarEstadoPlay();
      novo = { ...novo, estado };
      if (estado.disponivel) {
        const aparelho = await playDisponivel();
        novo = { ...novo, aparelho };
        if (aparelho) novo = { ...novo, produtos: (await produtosDaPlay(PRODUTOS_PLAY)).produtos };
      }
    } catch {
      /* sem o servidor agora: a loja de hoje (pergunta de novo na próxima) */
    }
    if (minha !== geracao) return; // a pessoa mudou no meio: nada a publicar
    quando = Date.now();
    publicar({ ...novo, carregando: false });
  })().finally(() => {
    if (minha === geracao) pedido = null;
  });
  return pedido;
}

/** Só para os testes: esquece o que foi perguntado. */
export function _esquecerPlayDaLojaParaTestes(): void {
  retrato = VAZIO;
  pedido = null;
  quando = 0;
  dono = undefined;
  geracao++;
}

export interface PlayDaLoja {
  /** a loja com a Play valendo (sem isso, a tela da loja de hoje) */
  ativa: boolean;
  carregando: boolean;
  estado: EstadoPlayServidor | null;
  /** a oferta mensal de cada produto que a Play achou (o preço é o DELA) */
  ofertas: Partial<Record<CodigoPlay, OfertaMensal>>;
  menorPreco: string | null;
  /** pergunta de novo ao servidor e à Play (depois de assinar, trocar ou gerenciar) */
  recarregar: () => Promise<void>;
}

export function usePlayDaLoja(): PlayDaLoja {
  const presente = pluginDaPlayPresente();
  const uid = useSessao().usuario?.id ?? null;
  const r = useSyncExternalStore(assinar, () => retrato, () => retrato);
  useEffect(() => {
    if (presente) void carregarPlayDaLoja(false, uid);
  }, [presente, uid]);
  // o guardado de OUTRA pessoa (o login mudou e o efeito ainda não rodou) não aparece nem por 1 quadro
  const doOutro = dono !== undefined && dono !== uid;
  return useMemo(() => {
    const atual = doOutro ? VAZIO : r;
    const ofertas = presente ? ofertasMensais(atual.produtos) : {};
    const ativa = presente && atual.estado?.disponivel === true && atual.aparelho && Object.keys(ofertas).length > 0;
    return {
      ativa,
      carregando: presente && (doOutro || atual.carregando || (!quando && !atual.estado)),
      estado: presente ? atual.estado : null,
      ofertas,
      menorPreco: menorPreco(ofertas),
      recarregar: () => carregarPlayDaLoja(true, uid),
    };
  }, [presente, r, doOutro, uid]);
}
