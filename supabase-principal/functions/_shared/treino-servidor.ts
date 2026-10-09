// Physiq W7 — conversa servidor → servidor com o Banco do Treino para "Exportar meus dados" e "Excluir minha conta" (W2 da loja: + as
// ações da exclusão do profissional).
// Chama a delete-my-account de lá em modo servidor (x-espelho-segredo, o segredo da W2). A delete-my-account tem verify_jwt =
// true: vai o anon do Treino (TREINO_ANON_KEY, público — é o do APK) no Authorization só para passar pela borda do Supabase;
// quem autoriza é o segredo. O id do aluno no Treino sai do vínculo physiq_identidades lá — daqui vai só o id do JWT.
// hml-10 (H-24): recebe o log de quem chama; da resposta do Treino vai para o log só o código de erro, nunca o corpo.
// hml-14 (H-32, D3): cada ação tem o seu tempo (TEMPO_DA_ACAO) e, com o prazo do pedido (`opcoes.prazo`), espera no máximo o que
// falta dele; estourou → "indisponivel" (o caminho da rede fora: quem chama responde treino_indisponivel, nada novo na tela).
import { lerRespostaTreino, type PassoTreino } from "./conta-aluno-regras.ts";
import type { Log } from "./log.ts";
import { TEMPO_MS, buscarComTempo, tempoEsgotado, type Prazo } from "./tempo.ts";

const TREINO_URL = (Deno.env.get("TREINO_URL") || "").replace(/\/+$/, "");
const TREINO_ANON_KEY = Deno.env.get("TREINO_ANON_KEY") || "";
const ESPELHO_SEGREDO = Deno.env.get("ESPELHO_SEGREDO") || "";

export interface RespostaTreino {
  passo: PassoTreino;
  status: number;
  corpo: Record<string, unknown>;
}

export function treinoConfigurado(): boolean {
  return Boolean(TREINO_URL && TREINO_ANON_KEY && ESPELHO_SEGREDO.length >= 32);
}

/** W2 da loja: conferir_profissional / excluir_profissional = a exclusão do profissional (só o caminho novo da excluir-minha-conta). */
export type AcaoTreino = "exportar" | "conferir" | "excluir" | "conferir_profissional" | "excluir_profissional";

/** hml-14 (H-32, D3): quanto cada ação espera a delete-my-account (máximo medido em 7 dias: 10 s). */
export const TEMPO_DA_ACAO: Readonly<Record<AcaoTreino, number>> = {
  exportar: TEMPO_MS.exportar,
  conferir: TEMPO_MS.exclusaoConferir,
  conferir_profissional: TEMPO_MS.exclusaoConferir,
  excluir: TEMPO_MS.exclusao,
  excluir_profissional: TEMPO_MS.exclusao,
};

/** Abaixo disto não dá tempo de o Treino responder: nem chama (um pedido que já não se espera não sai). */
const MINIMO_MS = 1_000;

export interface OpcoesTreino {
  /** O prazo do pedido inteiro (`prazo(...)` de ./tempo.ts, criado no começo do atendimento). */
  prazo?: Prazo;
}

export async function chamarTreino(
  schema: string,
  acao: AcaoTreino,
  principalUserId: string,
  log: Log,
  opcoes: OpcoesTreino = {},
): Promise<RespostaTreino> {
  if (!treinoConfigurado()) return { passo: "indisponivel", status: 0, corpo: { erro: "sem_configuracao" } };
  const ms = Math.min(TEMPO_DA_ACAO[acao], opcoes.prazo ? opcoes.prazo.restante() : Infinity);
  if (ms < MINIMO_MS) {
    log.erro({ codigo: "treino_sem_tempo", schema, acao });
    return { passo: "indisponivel", status: 0, corpo: { erro: "tempo_esgotado" } };
  }
  try {
    const r = await buscarComTempo(`${TREINO_URL}/functions/v1/delete-my-account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TREINO_ANON_KEY}`,
        apikey: TREINO_ANON_KEY,
        "x-espelho-segredo": ESPELHO_SEGREDO,
        "x-schema": schema,
      },
      body: JSON.stringify({ modo: "servidor", acao, principal_user_id: principalUserId }),
    }, ms);
    // o tempo vale até ler o corpo: estourou no meio dele → o catch (tempo esgotado, não um "respondeu 200" sem corpo)
    const corpo = (await r.json().catch((e) => {
      if (tempoEsgotado(e)) throw e;
      return {};
    })) as Record<string, unknown>;
    const passo = lerRespostaTreino(r.status, corpo);
    if (passo === "indisponivel") {
      log.erro({ codigo: "treino_respondeu", schema, acao, status: r.status, externo: { treino_erro: corpo.erro ?? corpo.error } });
    }
    return { passo, status: r.status, corpo };
  } catch (e) {
    log.excecao(e, { codigo: "treino_rede", schema, acao });
    return { passo: "indisponivel", status: 0, corpo: { erro: "rede" } };
  }
}
