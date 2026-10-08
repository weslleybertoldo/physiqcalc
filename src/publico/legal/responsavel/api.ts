/**
 * hml-12 (H-30, D8) — o consentimento do responsável no BANCO PRINCIPAL: aluno_responsavel (leitura) e aluno_responsavel_registrar
 * (registrar e retirar), as 2 SECURITY DEFINER com a guarda do "Editar dados" (w14_matricula_da_rota + w14_pode_editar: o id da rota
 * vale, seja da matrícula ou do Treino). A regra toda (a faixa de idade, quem pode, o que vale) é do banco; a origem gravada (site,
 * apk ou loja) é a mesma do aceite.
 */
import { principal } from "@/integrations/principal/client";
import { origemDoAceite } from "../aceite/regras";
import { dadosDaRetirada, dadosDoRegistro, normalizarResponsavel, type FormResponsavel, type ResponsavelAluno } from "./regras";

export class ErroResponsavel extends Error {
  constructor(public codigo: string) {
    super(codigo);
  }
}

const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

async function rpc(nome: "aluno_responsavel" | "aluno_responsavel_registrar", args: Record<string, unknown>): Promise<ResponsavelAluno> {
  if (!online()) throw new ErroResponsavel("sem_internet");
  const { data, error } = await principal.rpc(nome as never, args as never);
  if (error) throw new ErroResponsavel(error.message || "erro_interno");
  const r = data as { ok?: unknown; erro?: unknown } | null;
  if (!r || typeof r !== "object" || r.ok !== true) throw new ErroResponsavel(String(r?.erro ?? "erro_interno"));
  return normalizarResponsavel(r);
}

/** A faixa de idade, quem pode editar e o registro vigente do aluno da rota. */
export function buscarResponsavel(alunoId: string): Promise<ResponsavelAluno> {
  return rpc("aluno_responsavel", { p_aluno: alunoId });
}

/** Registra o consentimento (só de 16 a 17 anos; o banco confere tudo de novo) e devolve a seção atualizada. */
export function registrarResponsavel(alunoId: string, f: FormResponsavel): Promise<ResponsavelAluno> {
  return rpc("aluno_responsavel_registrar", { p_aluno: alunoId, p_dados: dadosDoRegistro(f, origemDoAceite()) });
}

/** Retira o consentimento vigente (o app do aluno fecha até um novo registro) e devolve a seção atualizada. */
export function retirarResponsavel(alunoId: string): Promise<ResponsavelAluno> {
  return rpc("aluno_responsavel_registrar", { p_aluno: alunoId, p_dados: dadosDaRetirada(origemDoAceite()) });
}
