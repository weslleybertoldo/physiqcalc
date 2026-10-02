// Physiq W26 — acesso da Ferramentas › Lixeira no BANCO PRINCIPAL (online, sem cache do service worker — 9A). A regra mora no banco
// (migração 20261001230000_w26_lixeira.sql): lixeira_da_conta lista o que a pessoa vê na conta ativa; lixeira_restaurar e
// lixeira_apagar conferem de novo quem pode (P1 + clínico da W18) e, no aluno, a trava de e-mail/CPF (W16b) e o P7. A recusa volta
// como { ok: false, erro } e vira ErroLixeira (a tela mostra a frase em vermelho; nada muda).
import { principal } from "@/integrations/principal/client";
import { normalizarLixeira, type Lixeira, type TipoLixeira } from "./regras";

export class ErroLixeira extends Error {
  constructor(public codigo: string, public extra: Record<string, unknown> = {}) {
    super(codigo);
  }
}

const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

async function rpc(nome: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!online()) throw new ErroLixeira("sem_internet");
  const { data, error } = await principal.rpc(nome as never, args as never);
  if (error) throw new ErroLixeira("erro_interno", { detalhe: error.message });
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) throw new ErroLixeira(String(r.erro ?? "erro_interno"), r);
  return r;
}

export const CHAVE_LIXEIRA = ["lixeira"] as const;

export async function listarLixeira(contaId: string): Promise<Lixeira> {
  const r = await rpc("lixeira_da_conta", { p_conta: contaId });
  const l = normalizarLixeira(r);
  if (!l) throw new ErroLixeira("erro_interno");
  return l;
}

/** Volta o item como era (o aluno volta para a lista; o resto, para a tela de origem). */
export async function restaurar(tipo: TipoLixeira, id: string): Promise<Record<string, unknown>> {
  return rpc("lixeira_restaurar", { p_tipo: tipo, p_id: id });
}

/** Apaga de vez (nunca aluno). */
export async function apagarDeVez(tipo: TipoLixeira, id: string): Promise<void> {
  await rpc("lixeira_apagar", { p_tipo: tipo, p_id: id });
}
