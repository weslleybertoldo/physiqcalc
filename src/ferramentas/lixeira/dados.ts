// Physiq W26 — acesso da Ferramentas › Lixeira no BANCO PRINCIPAL (online, sem cache do service worker — 9A). A regra mora no banco
// (migração 20261001230000_w26_lixeira.sql): lixeira_da_conta lista o que a pessoa vê na conta ativa; lixeira_restaurar e
// lixeira_apagar conferem de novo quem pode (P1 + clínico da W18) e, no aluno, a trava de e-mail/CPF (W16b) e o P7. A recusa volta
// como { ok: false, erro } e vira ErroLixeira (a tela mostra a frase em vermelho; nada muda).
// hml-21c (H-43 · jeito 2, etapa 3): as 3 pela função conta, COM A SESSÃO de quem está logado — as MESMAS RPCs e os MESMOS argumentos, no
// servidor: a página (q=lixeira — a pesada: num lote só dela) e o restaurar/apagar como ações. O erro como hoje: sem internet; o { ok: false,
// erro } da RPC com o código dela; o resto (a função, o banco) = erro_interno com o código no extra (a mensagem do banco não vem mais).
import { acaoConta, codigoDaGravacao } from "@/conta/gravar";
import { codigoDaLeitura, lerConta } from "@/conta/ler";
import { POR_PAGINA, deslocamento } from "@/lib/paginacao";
import { normalizarLixeira, type Lixeira, type TipoLixeira } from "./regras";

export class ErroLixeira extends Error {
  constructor(public codigo: string, public extra: Record<string, unknown> = {}) {
    super(codigo);
  }
}

const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

/** O valor da RPC: o { ok: true } segue; o resto vira ErroLixeira com o código dela (como hoje). */
function okOuErro(data: unknown): Record<string, unknown> {
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) throw new ErroLixeira(String(r.erro ?? "erro_interno"), r);
  return r;
}

/** A falha da ida (a rede, a função, o banco): sem internet como hoje; o resto, erro_interno com o código no extra. */
function falhaDaIda(codigo: string): ErroLixeira {
  return codigo === "sem_internet" ? new ErroLixeira("sem_internet") : new ErroLixeira("erro_interno", { codigo });
}

/** hml-21c: o restaurar/apagar pela conta (a RPC de hoje no servidor, como a pessoa). */
async function acao(nome: "lixeira_restaurar" | "lixeira_apagar", corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!online()) throw new ErroLixeira("sem_internet");
  let data: unknown;
  try {
    data = (await acaoConta<{ resultado?: unknown }>(nome, corpo)).resultado;
  } catch (e) {
    throw falhaDaIda(codigoDaGravacao(e));
  }
  return okOuErro(data);
}

export const CHAVE_LIXEIRA = ["lixeira"] as const;

/**
 * hml-14b (B21): UMA página (20) de uma aba — a aba (?tipo=; sem ela, o banco abre a 1ª com itens), a busca (sem acento, por palavras)
 * e a página vão ao banco; volta a página, a aba mostrada, os números das abas e o total da aba (com a busca). Chamada só com p_conta
 * (o APK antigo), a lixeira_da_conta responde como antes (até 300 por tipo).
 */
export async function listarLixeira(contaId: string, p: { tipo: string | null; busca: string; pagina: number }): Promise<Lixeira> {
  if (!online()) throw new ErroLixeira("sem_internet");
  let data: unknown;
  try {
    data = (
      await lerConta(
        "lixeira",
        { conta: contaId, tipo: p.tipo || null, busca: p.busca.trim() || null, offset: deslocamento(p.pagina), limite: POR_PAGINA },
        { sozinha: true },
      )
    ).valor;
  } catch (e) {
    throw falhaDaIda(codigoDaLeitura(e));
  }
  const r = okOuErro(data);
  const l = normalizarLixeira(r);
  if (!l?.pagina) throw new ErroLixeira("erro_interno");
  return l;
}

/** Volta o item como era (o aluno volta para a lista; o resto, para a tela de origem). */
export async function restaurar(tipo: TipoLixeira, id: string): Promise<Record<string, unknown>> {
  return acao("lixeira_restaurar", { tipo, id });
}

/** Apaga de vez (nunca aluno). */
export async function apagarDeVez(tipo: TipoLixeira, id: string): Promise<void> {
  await acao("lixeira_apagar", { tipo, id });
}
