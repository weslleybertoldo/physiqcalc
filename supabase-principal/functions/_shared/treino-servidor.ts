// Physiq W7 — conversa servidor → servidor com o Banco do Treino para "Exportar meus dados" e "Excluir minha conta" (W2 da loja: + as
// ações da exclusão do profissional).
// Chama a delete-my-account de lá em modo servidor (x-espelho-segredo, o segredo da W2). A delete-my-account tem verify_jwt =
// true: vai o anon do Treino (TREINO_ANON_KEY, público — é o do APK) no Authorization só para passar pela borda do Supabase;
// quem autoriza é o segredo. O id do aluno no Treino sai do vínculo physiq_identidades lá — daqui vai só o id do JWT.
// hml-10 (H-24): recebe o log de quem chama; da resposta do Treino vai para o log só o código de erro, nunca o corpo.
import { lerRespostaTreino, type PassoTreino } from "./conta-aluno-regras.ts";
import type { Log } from "./log.ts";

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

export async function chamarTreino(schema: string, acao: AcaoTreino, principalUserId: string, log: Log): Promise<RespostaTreino> {
  if (!treinoConfigurado()) return { passo: "indisponivel", status: 0, corpo: { erro: "sem_configuracao" } };
  try {
    const r = await fetch(`${TREINO_URL}/functions/v1/delete-my-account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TREINO_ANON_KEY}`,
        apikey: TREINO_ANON_KEY,
        "x-espelho-segredo": ESPELHO_SEGREDO,
        "x-schema": schema,
      },
      body: JSON.stringify({ modo: "servidor", acao, principal_user_id: principalUserId }),
    });
    const corpo = (await r.json().catch(() => ({}))) as Record<string, unknown>;
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
