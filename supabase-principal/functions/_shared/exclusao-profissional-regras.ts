// Physiq W2 da loja (Google Play) — regras puras e a ORDEM da exclusão de conta do PROFISSIONAL (dono, membro de equipe e quem já
// foi membro), usadas pela excluir-minha-conta (banco principal). Sem Deno nem supabase-js: o vitest testa daqui mesmo
// (src/painel/configuracoes/excluirConta/servidor.test.ts) — o que fala com o banco, o Mercado Pago e o Auth chega pronto em
// `DepsExclusao` (_shared/exclusao-profissional.ts).
//
// TRAVA DE PRODUÇÃO (a mesma função serve o site de produção, o staging e APKs antigos com o front antigo embutido): o caminho novo
// só existe no pedido do app novo — `{ fluxo: "profissional" }` no corpo. Sem o campo (o site de hoje e todo APK antigo), a borda
// segue o caminho de sempre: 403 "profissional" para o profissional e o fluxo do aluno igual.
import { confirmacaoValida } from "./conta-aluno-regras.ts";
import type { PassoTreino } from "./conta-aluno-regras.ts";

export type Fluxo = "aluno" | "profissional";

/** O pedido é do app novo da exclusão do profissional? SÓ o texto exato "profissional" — qualquer outra coisa é o caminho de hoje. */
export function fluxoDoPedido(corpo: unknown): Fluxo {
  const c = corpo && typeof corpo === "object" && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : {};
  return c.fluxo === "profissional" ? "profissional" : "aluno";
}

/** Motivo da recusa → HTTP (a tela traduz o código). */
export const STATUS_DA_RECUSA_PROFISSIONAL: Record<string, number> = {
  confirmacao_invalida: 400,
  profissional: 403, // o master (e a conta do app) nunca exclui por aqui
  nao_profissional: 409, // só aluno: o caminho é o "Excluir" do Perfil (a borda sem o campo novo)
  assinatura_ativa: 409, // a pessoa, como aluna, tem cobrança automática no cartão (a regra da W7: cancela em Perfil › Pagamentos)
  conta_legada: 409, // a cobrança da conta ainda é a do app antigo
  cobranca_ativa: 409, // sobrou cobrança automática viva no meio do caminho (nada mudou)
  cobranca_nao_cancelada: 502, // o Mercado Pago não confirmou o cancelamento (nada mais mudou)
  treino_indisponivel: 502,
  erro_interno: 500,
};

export interface Resposta {
  status: number;
  corpo: Record<string, unknown>;
}

const recusa = (erro: string, extra: Record<string, unknown> = {}): Resposta => ({
  status: STATUS_DA_RECUSA_PROFISSIONAL[erro] ?? 400,
  corpo: { ok: false, erro, ...extra },
});

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const lista = (v: unknown): Obj[] => (Array.isArray(v) ? (v as unknown[]).map(obj) : []);
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Uma assinatura do PLANO de uma conta do profissional (conta_assinaturas) a cancelar. */
export interface AssinaturaDoPlano {
  id: string;
  conta_id: string;
  mp_preapproval_id: string | null;
  status: string;
  simulada: boolean;
}

export interface CobrancasACancelar {
  /** o plano de cada conta de que ele é dono (cobrança automática no cartão) */
  plano: AssinaturaDoPlano[];
  /** matrículas cujos alunos pagam a ele no cartão (aluno_assinaturas — cancelarAssinaturasDasMatriculas) */
  pacientesComAssinatura: string[];
  /** assinaturas antigas do Calc que só o Banco do Treino conhece (a mesma conta do Mercado Pago) */
  soltasDoTreino: string[];
}

/** Tudo o que precisa parar de cobrar ANTES de mexer na conta (conferência do principal + a do Treino). */
export function cobrancasACancelar(principal: unknown, treino: unknown): CobrancasACancelar {
  const p = obj(principal);
  const plano: AssinaturaDoPlano[] = [];
  const pacientes = new Set<string>();
  const conhecidas = new Set<string>();
  for (const c of lista(p.contas_dono)) {
    const cob = obj(c.cobrancas);
    for (const a of lista(cob.plano)) {
      if (!texto(a.id)) continue;
      plano.push({ id: String(a.id), conta_id: String(c.id ?? ""), mp_preapproval_id: texto(a.mp_preapproval_id), status: String(a.status ?? ""),
        simulada: a.simulada === true });
      if (texto(a.mp_preapproval_id)) conhecidas.add(String(a.mp_preapproval_id));
    }
    for (const a of lista(cob.alunos)) {
      if (texto(a.paciente_id)) pacientes.add(String(a.paciente_id));
      if (texto(a.mp_preapproval_id)) conhecidas.add(String(a.mp_preapproval_id));
    }
  }
  const t = obj(obj(treino).cobrancas);
  const soltas = new Set<string>();
  for (const a of [...lista(t.plano), ...lista(t.alunos)]) {
    const id = texto(a.mp_preapproval_id);
    if (id && !conhecidas.has(id)) soltas.add(id);
  }
  return { plano, pacientesComAssinatura: [...pacientes], soltasDoTreino: [...soltas] };
}

export const totalDeCobrancas = (c: CobrancasACancelar): number =>
  c.plano.length + c.pacientesComAssinatura.length + c.soltasDoTreino.length;

/**
 * A conferência que a tela recebe (nada muda nela): só o que ela mostra — sem os ids do Mercado Pago. Os ids das matrículas com
 * prontuário vão (o dono baixa os prontuários delas antes de excluir).
 */
export function conferenciaParaATela(principal: unknown, treino: unknown): Obj {
  const p = obj(principal);
  const t = treino ? obj(treino) : null;
  const tCob = obj(t?.cobrancas);
  const cobrancas = cobrancasACancelar(principal, treino);
  return {
    ok: true,
    simulacao: true,
    perfil: texto(p.perfil) ?? "ex_profissional",
    nome: texto(p.nome),
    contas: lista(p.contas_dono).map((c) => {
      const al = obj(c.alunos);
      const cob = obj(c.cobrancas);
      return {
        id: c.id ?? null,
        nome: texto(c.nome) ?? "Conta",
        origem: c.origem ?? null,
        plano: c.plano ?? null,
        situacao: c.situacao ?? null,
        eu_nutri: c.eu_nutri === true,
        alunos: {
          total: num(al.total),
          para_o_app: num(al.para_o_app),
          guardados: num(al.guardados),
          lista: lista(al.lista).map((a) => ({ nome: texto(a.nome) ?? "Aluno", destino: a.destino === "app" ? "app" : "guardado" })),
        },
        membros: lista(c.membros).map((m) => ({
          nome: texto(m.nome) ?? texto(m.email) ?? "Profissional",
          email: texto(m.email),
          papeis: Array.isArray(m.papeis) ? (m.papeis as unknown[]).map(String) : [],
          convite: m.status === "convidado",
        })),
        convites_pendentes: num(c.convites_pendentes),
        cobrancas: { plano: lista(cob.plano).length, alunos: lista(cob.alunos).length },
        prontuarios: prontuariosDe(c.prontuarios),
      };
    }),
    equipes: lista(p.equipes).map((e) => ({
      conta_nome: texto(e.conta_nome) ?? "Conta",
      dono_nome: texto(e.dono_nome),
      papeis: Array.isArray(e.papeis) ? (e.papeis as unknown[]).map(String) : [],
      alunos_treino: num(e.alunos_treino),
      alunos_nutricao: num(e.alunos_nutricao),
    })),
    ex_equipes: num(p.ex_equipes),
    sem_conta: p.sem_conta ? { alunos: num(obj(p.sem_conta).alunos), prontuarios: prontuariosDe(obj(p.sem_conta).prontuarios) } : null,
    aluno: p.aluno ? alunoParaATela(obj(p.aluno)) : null,
    treino: t ? { apaga: obj(t.apaga), mantem: obj(t.mantem), cobrancas: { plano: lista(tCob.plano).length, alunos: lista(tCob.alunos).length } } : null,
    cobrancas_a_cancelar: totalDeCobrancas(cobrancas),
  };
}

/** A parte de aluno (quem também é aluno de outro profissional): as contas e as contagens do que sai e do que fica. */
function alunoParaATela(a: Obj): Obj {
  return {
    matriculas: num(a.matriculas),
    contas: Array.isArray(a.contas) ? (a.contas as unknown[]).filter((x) => typeof x === "string") : [],
    apaga: obj(a.apaga),
    mantem: obj(a.mantem),
  };
}

function prontuariosDe(v: unknown): Obj[] {
  return lista(v)
    .filter((x) => texto(x.paciente_id))
    .map((x) => ({ paciente_id: String(x.paciente_id), conta_id: texto(x.conta_id), nome: texto(x.nome) ?? "Paciente", registros: num(x.registros),
      restritos: num(x.restritos) }));
}

/** O que a borda precisa para cada passo — quem monta é _shared/exclusao-profissional.ts (banco, Mercado Pago, Treino e Auth). */
export interface DepsExclusao {
  /** excluir_conta_profissional(uid, simular = true) */
  conferir(): Promise<unknown>;
  /** excluir_conta_profissional(uid, simular = false) */
  excluir(): Promise<unknown>;
  /** delete-my-account (Treino, modo servidor) */
  treino(acao: "conferir_profissional" | "excluir_profissional"): Promise<{ passo: PassoTreino; corpo: Record<string, unknown> }>;
  /** cancela o plano de uma conta (Mercado Pago + conta_assinaturas); false = não confirmou */
  cancelarPlano(a: AssinaturaDoPlano): Promise<boolean>;
  /** cancela as assinaturas dos alunos destas matrículas (Mercado Pago + aluno_assinaturas) */
  cancelarDosAlunos(pacienteIds: string[]): Promise<{ canceladas: number; falhas: number }>;
  /** cancela no Mercado Pago uma assinatura antiga do Calc que só o Treino conhece */
  cancelarSolta(preapprovalId: string): Promise<boolean>;
  /** espelho_disparar(): a equipe e os alunos chegam ao Treino agora (melhor esforço) */
  dispararEspelho(): Promise<void>;
  /** arquivos do diário (parte de aluno) + a foto do Perfil; devolve quantos saíram (melhor esforço) */
  apagarArquivos(arquivos: Array<{ bucket: string; path: string }>): Promise<number>;
  /** o login: cadastro do login limpo + soft delete (auth.admin.deleteUser(id, true)) */
  apagarLogin(): Promise<void>;
  registrar?(msg: string): void;
}

export interface EntradaExclusao {
  simular: boolean;
  confirmacao: unknown;
  /** app_metadata.role do JWT (o master nunca exclui por aqui) */
  papelAuth: string;
}

/**
 * A ordem (idempotente — pedir de novo depois de um erro no meio refaz só o que faltou; depois do fim o token deixa de valer):
 *   1. confere nos 2 bancos (qualquer recusa para ANTES de mexer em algo);
 *   2. cancela a cobrança automática (plano das contas dele, alunos → ele, as antigas do Calc) — falhou alguma → 502, nada mais muda;
 *   3. Banco do Treino (delete-my-account "excluir_profissional");
 *   4. banco principal (excluir_conta_profissional: alunos para a lixeira/app, equipe, conta cancelada, parte de aluno, cadastro);
 *   5. o espelho (equipe e alunos no Treino), os arquivos e, por último, o login (soft delete).
 */
export async function excluirContaProfissional(e: EntradaExclusao, d: DepsExclusao): Promise<Resposta> {
  const log = d.registrar ?? (() => {});
  if (e.papelAuth === "master" || e.papelAuth === "admin") return recusa("profissional", { motivo: "master" });
  if (!e.simular && !confirmacaoValida(e.confirmacao)) return recusa("confirmacao_invalida");
  try {
    // 1. confere
    const pre = obj(await d.conferir());
    if (pre.ok !== true) return recusa(String(pre.erro ?? "erro_interno"), pre.motivo ? { motivo: pre.motivo } : {});
    const tPre = await d.treino("conferir_profissional");
    if (tPre.passo === "profissional") return recusa("profissional", { motivo: "treino" });
    if (tPre.passo === "indisponivel") return recusa("treino_indisponivel");
    const treinoPre = tPre.passo === "sem_vinculo" ? null : tPre.corpo;
    if (e.simular) return { status: 200, corpo: conferenciaParaATela(pre, treinoPre) };

    // 2. nenhuma cobrança automática pode sobrar
    const cob = cobrancasACancelar(pre, treinoPre);
    let falhas = 0;
    let canceladas = 0;
    for (const a of cob.plano) {
      if (await d.cancelarPlano(a)) canceladas++;
      else falhas++;
    }
    if (cob.pacientesComAssinatura.length) {
      const r = await d.cancelarDosAlunos(cob.pacientesComAssinatura);
      canceladas += r.canceladas;
      falhas += r.falhas;
    }
    for (const id of cob.soltasDoTreino) {
      if (await d.cancelarSolta(id)) canceladas++;
      else falhas++;
    }
    if (falhas > 0) return recusa("cobranca_nao_cancelada", { canceladas, falhas });

    // 3. Banco do Treino
    const t = await d.treino("excluir_profissional");
    if (t.passo === "profissional") return recusa("profissional", { motivo: "treino" });
    if (t.passo === "indisponivel") return recusa("treino_indisponivel");

    // 4. banco principal
    const fim = obj(await d.excluir());
    if (fim.ok !== true) return recusa(String(fim.erro ?? "erro_interno"), fim.motivo ? { motivo: fim.motivo } : {});

    // 5. espelho, arquivos e o login
    await d.dispararEspelho().catch((err) => log(`espelho: ${String(err)}`));
    const arquivos = lista(fim.arquivos)
      .filter((a) => texto(a.bucket) && texto(a.path))
      .map((a) => ({ bucket: String(a.bucket), path: String(a.path) }));
    const apagados = await d.apagarArquivos(arquivos).catch((err) => {
      log(`arquivos: ${String(err)}`);
      return 0;
    });
    await d.apagarLogin();

    return {
      status: 200,
      corpo: {
        ok: true,
        perfil: texto(fim.perfil) ?? texto(pre.perfil),
        resultado: resumoDoFeito(fim, t.passo === "sem_vinculo" ? null : t.corpo, canceladas, apagados),
      },
    };
  } catch (err) {
    log(`erro: ${(err as Error)?.message ?? String(err)}`);
    return recusa("erro_interno");
  }
}

/** O resumo da tela "Conta excluída" (contagens; nenhum id). */
export function resumoDoFeito(fim: unknown, treino: unknown, cobrancasCanceladas: number, arquivos: number): Obj {
  const f = obj(fim);
  const contas = lista(f.contas_dono);
  const soma = (k: string) => contas.reduce((s, c) => s + num(obj(c.feito)[k]), 0);
  return {
    contas: contas.map((c) => texto(c.nome) ?? "Conta"),
    alunos_para_o_app: contas.reduce((s, c) => s + num(obj(c.alunos).para_o_app), 0),
    alunos_guardados: soma("alunos_na_lixeira"),
    membros_removidos: soma("membros_removidos"),
    equipes_que_saiu: lista(f.equipes).length,
    cobrancas_canceladas: cobrancasCanceladas,
    treino: treino ? { login: "removido" } : null,
    arquivos,
  };
}
