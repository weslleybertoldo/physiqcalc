/**
 * hml-12 (H-30, D8) — o consentimento do responsável no BANCO PRINCIPAL: aluno_responsavel (leitura) e aluno_responsavel_registrar
 * (registrar e retirar), as 2 SECURITY DEFINER com a guarda do "Editar dados" (w14_matricula_da_rota + w14_pode_editar: o id da rota
 * vale, seja da matrícula ou do Treino). A regra toda (a faixa de idade, quem pode, o que vale) é do banco; a origem gravada (site,
 * apk ou loja) é a mesma do aceite.
 * hml-21c (H-43 · jeito 2, etapa 3): pela função conta, COM A SESSÃO de quem está logado — a leitura no lote da tela (q=aluno_responsavel) e
 * o registro/a retirada como ação (aluno_responsavel_registrar), as MESMAS RPCs e os MESMOS argumentos, no servidor. O erro como hoje: o
 * código no ErroResponsavel (a rede que caiu → sem_internet); o { ok: false, erro } da RPC com o código dela.
 */
import { acaoConta, codigoDaGravacao } from "@/conta/gravar";
import { codigoDaLeitura, lerConta } from "@/conta/ler";
import { origemDoAceite } from "../aceite/regras";
import { dadosDaRetirada, dadosDoRegistro, normalizarResponsavel, type FormResponsavel, type ResponsavelAluno } from "./regras";

export class ErroResponsavel extends Error {
  constructor(public codigo: string) {
    super(codigo);
  }
}

const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

/** O valor da RPC: o { ok: true } vira a seção; o resto, o ErroResponsavel com o código dela (como hoje). */
function secao(data: unknown): ResponsavelAluno {
  const r = data as { ok?: unknown; erro?: unknown } | null;
  if (!r || typeof r !== "object" || r.ok !== true) throw new ErroResponsavel(String(r?.erro ?? "erro_interno"));
  return normalizarResponsavel(r);
}

/** O registro ou a retirada (a aluno_responsavel_registrar pela conta). */
async function registrar(alunoId: string, dados: Record<string, unknown>): Promise<ResponsavelAluno> {
  if (!online()) throw new ErroResponsavel("sem_internet");
  let data: unknown;
  try {
    data = (await acaoConta<{ resultado?: unknown }>("aluno_responsavel_registrar", { aluno: alunoId, dados })).resultado;
  } catch (e) {
    throw new ErroResponsavel(codigoDaGravacao(e));
  }
  return secao(data);
}

/** A faixa de idade, quem pode editar e o registro vigente do aluno da rota. */
export async function buscarResponsavel(alunoId: string): Promise<ResponsavelAluno> {
  if (!online()) throw new ErroResponsavel("sem_internet");
  let data: unknown;
  try {
    data = (await lerConta("aluno_responsavel", { aluno: alunoId })).valor;
  } catch (e) {
    throw new ErroResponsavel(codigoDaLeitura(e));
  }
  return secao(data);
}

/** Registra o consentimento (só de 16 a 17 anos; o banco confere tudo de novo) e devolve a seção atualizada. */
export function registrarResponsavel(alunoId: string, f: FormResponsavel): Promise<ResponsavelAluno> {
  return registrar(alunoId, dadosDoRegistro(f, origemDoAceite()));
}

/** Retira o consentimento vigente (o app do aluno fecha até um novo registro) e devolve a seção atualizada. */
export function retirarResponsavel(alunoId: string): Promise<ResponsavelAluno> {
  return registrar(alunoId, dadosDaRetirada(origemDoAceite()));
}
