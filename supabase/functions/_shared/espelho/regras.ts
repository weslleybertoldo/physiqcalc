// Physiq W2 — regras PURAS da troca de token e do espelho principal → Banco do Treino (spec §7.4 e §8.3).
// Sem Deno, sem rede e sem banco: usadas pela trocar-token e pela espelho-nucleo (deploy pelo Supabase CLI, que
// empacota o _shared) e testadas no Vitest (src/lib/espelhoTreinoRegras.test.ts).

export type Papel = "dono" | "personal" | "nutricionista";
export type Modulo = "treino" | "nutricao";
export type PapelTreino = "admin" | "master" | "professor" | null;

/** Conta do núcleo como o Treino precisa saber (montada pela espelho-resumo no banco principal). */
export interface ContaResumo {
  id: string;
  nome: string;
  origem: "nova" | "legado_calc" | "legado_nutri" | "app";
  modulos: Modulo[];
  situacao: "teste" | "ativa" | "vencida" | "isenta" | "suspensa" | "cancelada";
  cobranca_legada: boolean;
  /** até quando a conta tem acesso (AAAA-MM-DD, inclusive); null = sem acesso */
  acesso_ate: string | null;
  alunos_bloqueados_em: string | null;
  alunos_bloqueados_msg: string | null;
}

export interface MembroResumo {
  conta_id: string;
  papeis: Papel[];
  status: "convidado" | "ativo" | "removido";
  codigo_convite: string | null;
  conta: ContaResumo | null;
}

export interface MatriculaResumo {
  paciente_id: string;
  conta_id: string | null;
  ativo: boolean;
  excluida: boolean;
  bloqueada: boolean;
  /** login (banco principal) do personal responsável */
  personal_id: string | null;
  nome: string | null;
  genero: string | null;
  nascimento: string | null;
  criado_em: string;
  conta: ContaResumo | null;
}

/** Aluno de treino de quem é personal (pra ligar o treino do aluno a ele no Treino). */
export interface AlunoDeTreinoResumo {
  principal_user_id: string;
  conta_id: string;
}

export interface ResumoNucleo {
  principal_user_id: string;
  email: string | null;
  nome: string | null;
  master: boolean;
  membros: MembroResumo[];
  matriculas: MatriculaResumo[];
  alunos_de_treino: AlunoDeTreinoResumo[];
}

export interface UsuarioPrincipal {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  identities?: Array<{ provider?: string; identity_data?: Record<string, unknown> | null }> | null;
}

export type DecisaoVinculo = "usar_vinculo" | "vincular_por_email" | "criar" | "conflito";

const DATA_MAXIMA = "2999-12-31";

/** Payload do JWT (sem conferir a assinatura — quem confere é o GET /auth/v1/user do principal, antes). */
export function claimsDoJwt(token: string): Record<string, unknown> | null {
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  try {
    const b64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      Array.from(atob(b64 + "===".slice((b64.length + 3) % 4)))
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    const obj = JSON.parse(json);
    return obj && typeof obj === "object" ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function emailConfirmado(u: UsuarioPrincipal): boolean {
  return !!(u.email && u.email.trim()) && !!(u.email_confirmed_at || u.confirmed_at);
}

/**
 * O login desta sessão foi pelo Google? Exige as DUAS coisas: a sessão nasceu de OAuth (claim amr) e a conta tem a
 * identidade Google com o MESMO e-mail, verificado pelo Google. Só assim a troca pode procurar o usuário do Treino
 * pelo e-mail (spec 7.4: e-mail e senha nunca procuram por e-mail — senão alguém criaria um login com o e-mail de outro).
 */
export function ehLoginGoogle(claims: Record<string, unknown> | null, u: UsuarioPrincipal): boolean {
  const amr = Array.isArray(claims?.amr) ? (claims!.amr as Array<Record<string, unknown>>) : [];
  const sessaoOAuth = amr.some((m) => m && m.method === "oauth");
  if (!sessaoOAuth) return false;
  const email = (u.email || "").trim().toLowerCase();
  if (!email) return false;
  return (u.identities || []).some((i) => {
    if (i?.provider !== "google") return false;
    const d = i.identity_data || {};
    const emailIdentidade = String(d.email ?? "").trim().toLowerCase();
    const verificado = d.email_verified === true || d.email_verified === "true";
    return emailIdentidade === email && verificado;
  });
}

/** Staging só aceita conta de teste (P26): os e-mails de teste dos 2 apps. */
export function emailDeTeste(email: string | null | undefined): boolean {
  const e = (email || "").trim().toLowerCase();
  if (e === "teste@teste.com") return true;
  return /^[a-z0-9._+-]*teste[a-z0-9._+-]*@physiq(calc|nutri)\.app$/.test(e);
}

/** Qual caminho a troca segue pra achar o usuário do Treino (spec 7.4). */
export function decidirVinculo(p: { temVinculo: boolean; loginGoogle: boolean; treinoIdPorEmail: string | null }): DecisaoVinculo {
  if (p.temVinculo) return "usar_vinculo";
  if (p.loginGoogle) return p.treinoIdPorEmail ? "vincular_por_email" : "criar";
  return p.treinoIdPorEmail ? "conflito" : "criar";
}

/** hml-14 (H-51 item 3): o que a troca faz quando gravar o vínculo bate no 23505 (decidirVinculoDuplicado). */
export type DecisaoVinculoDuplicado =
  | { caminho: "seguir"; treinoUserId: string }
  | { caminho: "usar_gravado"; treinoUserId: string; orfao: string | null }
  | { caminho: "conflito" };

/**
 * hml-14 (H-51 item 3) — o insert do vínculo (physiq_identidades: PK em principal_user_id, ÚNICO em treino_user_id) bateu no
 * 23505 e a troca releu o vínculo DESTE login (`gravado`):
 *   · o mesmo usuário do Treino que ela tentou ligar → outra chamada da mesma pessoa ligou antes: segue;
 *   · OUTRO usuário do Treino → 2 chamadas ao mesmo tempo: vale o gravado; o usuário que esta chamada acabou de criar fica sem
 *     vínculo (`orfao`: a troca loga usuario_orfao para limpar à mão);
 *   · nenhum → o 23505 veio do ÚNICO em treino_user_id: o usuário do Treino já é de OUTRO login (o e-mail mudou de dono) →
 *     conflito (409 conta_em_conflito + registro para o master) — nunca a sessão do Treino de outra pessoa.
 */
export function decidirVinculoDuplicado(p: { tentado: string; gravado: string | null; criadoAgora: boolean }): DecisaoVinculoDuplicado {
  if (!p.gravado) return { caminho: "conflito" };
  if (p.gravado === p.tentado) return { caminho: "seguir", treinoUserId: p.tentado };
  return { caminho: "usar_gravado", treinoUserId: p.gravado, orfao: p.criadoAgora ? p.tentado : null };
}

/**
 * hml-14 (H-51 item 4) — a trava por conta da treino-leitura (o mesmo login pode ter matrícula em 2 contas, P7): quem vê o aluno
 * pela matrícula de uma conta só lê o treino quando o perfil do Treino é DESSA conta. Perfil do Treino sem conta = o treino do
 * próprio aluno (nenhum profissional de outra conta o montou): mostra — é o esperado para a nutricionista dele. Matrícula sem
 * conta: nada a comparar (o principal já decidiu que quem chama vê o aluno). Conta diferente → false (403 sem_acesso).
 */
export function treinoVisivelPelaConta(contaDaMatricula: string | null | undefined, contaDoTreino: string | null | undefined): boolean {
  if (!contaDaMatricula || !contaDoTreino) return true;
  return contaDaMatricula === contaDoTreino;
}

function temModulo(conta: ContaResumo | null | undefined, m: Modulo): boolean {
  return !!conta && Array.isArray(conta.modulos) && conta.modulos.includes(m);
}

/** É personal ativo numa conta com o módulo Treino? */
export function ehPersonalComTreino(r: ResumoNucleo): boolean {
  return (r.membros || []).some((m) => m.status === "ativo" && m.papeis.includes("personal") && temModulo(m.conta, "treino"));
}

/**
 * Papel no app_metadata do Treino (spec 7.4): master se for master; professor se for personal numa conta com Treino;
 * sem papel se for aluno. Segurança: admin/master do Treino NUNCA é rebaixado sozinho (só pelo master, à mão).
 * hml-02 (H-04): o Auth do Treino é um só para os 2 schemas — o resumo do STAGING nunca dá master (o master de teste vale só
 * no principal, no staging.profiles); o papel de comando do Treino vem só do resumo do public.
 */
export function papelTreino(r: ResumoNucleo, atual: string | null | undefined, schema: "public" | "staging" = "public"): PapelTreino {
  const staffAtual = atual === "admin" || atual === "master";
  if (r.master && schema === "public") return staffAtual ? (atual as PapelTreino) : "master";
  if (staffAtual) return atual as PapelTreino;
  if (ehPersonalComTreino(r)) return "professor";
  return null;
}

/** Matrícula que manda no treino do aluno: não excluída, numa conta com Treino; ativa e com personal primeiro. */
export function escolherMatriculaTreino(ms: MatriculaResumo[]): MatriculaResumo | null {
  const candidatas = (ms || []).filter((m) => !m.excluida && temModulo(m.conta, "treino"));
  if (!candidatas.length) return null;
  return [...candidatas].sort((a, b) =>
    Number(b.ativo) - Number(a.ativo)
    || Number(!!b.personal_id) - Number(!!a.personal_id)
    || String(b.criado_em).localeCompare(String(a.criado_em)),
  )[0];
}

/** physiq_profiles.status: bloqueado pelo profissional vale no Treino; desbloqueou → volta a ativo; senão não mexe. */
export function statusDoPerfil(m: MatriculaResumo, atual: string | null | undefined): string | null {
  if (m.bloqueada) return "bloqueado";
  if (atual === "bloqueado") return "ativo";
  return atual ?? null;
}

/**
 * W13 (F5) — aluno bloqueado pelo profissional em TODAS as matrículas vivas (ativas, fora da lixeira) e que NÃO é profissional:
 * sem papel no Treino, não é master e não é membro ativo de nenhuma conta (P7: quem também é profissional nunca é barrado).
 * A trocar-token recusa a sessão do Treino (o APK ≤ 3.15 não tem a trava nova) e o espelho encerra as sessões que ele tinha.
 */
export function alunoBloqueadoSemStaff(r: ResumoNucleo, papel: string | null | undefined): boolean {
  if (r.master || papel) return false;
  if ((r.membros || []).some((m) => m.status === "ativo")) return false;
  const vivas = (r.matriculas || []).filter((m) => !m.excluida && m.ativo);
  return vivas.length > 0 && vivas.every((m) => m.bloqueada);
}

/** genero do principal (masculino/feminino/outro) → sexo do Calc (male/female); outro/vazio = não mexe. */
export function sexoTreino(genero: string | null | undefined): "male" | "female" | null {
  if (genero === "masculino") return "male";
  if (genero === "feminino") return "female";
  return null;
}

function maiorData(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

export interface AcessoProfessor {
  /** maior acesso entre as contas em que é personal (null = nenhuma com acesso) */
  nucleo_acesso_ate: string | null;
  /**
   * Ponte até a W28 (quando a physiq_professor_acesso_ok passa a olhar nucleo_acesso_ate): nas contas NOVAS o Treino
   * libera o personal por acesso_liberado_ate + status. Nas contas legadas o ciclo de hoje do Calc continua mandando
   * (null = não mexe nas colunas antigas).
   */
  ponte: { acesso_liberado_ate: string | null; status: "ativo" | "suspenso" } | null;
  alunos_bloqueados_em: string | null;
  alunos_bloqueados_msg: string | null;
  codigo_convite: string | null;
}

/** Acesso do personal no Treino a partir das contas em que ele é personal (com o módulo Treino). */
export function acessoProfessor(r: ResumoNucleo): AcessoProfessor | null {
  const ms = (r.membros || []).filter((m) => m.status === "ativo" && m.papeis.includes("personal") && temModulo(m.conta, "treino"));
  if (!ms.length) return null;
  let acesso: string | null = null;
  let acessoNovas: string | null = null;
  let temNova = false;
  let algumaNovaValendo = false;
  let bloqueadoEm: string | null = null;
  let bloqueadoMsg: string | null = null;
  let codigo: string | null = null;
  for (const m of ms) {
    const c = m.conta!;
    acesso = maiorData(acesso, c.acesso_ate);
    if (!c.cobranca_legada) {
      temNova = true;
      acessoNovas = maiorData(acessoNovas, c.acesso_ate);
      if (c.situacao !== "suspensa" && c.situacao !== "cancelada") algumaNovaValendo = true;
    }
    if (c.alunos_bloqueados_em && !bloqueadoEm) {
      bloqueadoEm = c.alunos_bloqueados_em;
      bloqueadoMsg = c.alunos_bloqueados_msg;
    }
    if (!codigo && m.codigo_convite) codigo = m.codigo_convite;
  }
  return {
    nucleo_acesso_ate: acesso,
    ponte: temNova ? { acesso_liberado_ate: acessoNovas, status: algumaNovaValendo ? "ativo" : "suspenso" } : null,
    alunos_bloqueados_em: bloqueadoEm,
    alunos_bloqueados_msg: bloqueadoMsg,
    codigo_convite: codigo,
  };
}

/** Colunas de cobrança do Calc numa linha de physiq_professores (o que diz se é um professor do Calc de verdade). */
export interface LinhaProfessorCobranca {
  plano_id?: string | null;
  trial_ate?: string | null;
  adesao_paga_em?: string | null;
  ciclo_vence_em?: string | null;
  anual_ate?: string | null;
  cobranca_pausada?: boolean | null;
  acesso_liberado_ate?: string | null;
  nucleo_acesso_ate?: string | null;
}

/**
 * W5: a linha de physiq_professores foi criada pelo espelho para o personal de uma conta NOVA (só acesso: sem plano, teste,
 * adesão, ciclo, anual ou cobrança pausada do Calc)? A mesma conferência do pos-login (professorDoCalcDeVerdade, W4).
 */
export function linhaSoDoEspelho(p: LinhaProfessorCobranca): boolean {
  return !p.plano_id && !p.trial_ate && !p.adesao_paga_em && !p.ciclo_vence_em && !p.anual_ate && !p.cobranca_pausada;
}

/**
 * W5 — personal removido da equipe (ou que perdeu o papel, ou a conta ficou sem o Treino): o acesso que o espelho tinha dado
 * a ele no Treino sai (acesso_liberado_ate e nucleo_acesso_ate vazios → physiq_professor_acesso_ok = falso → as funções
 * admin-* e o convite antigo recusam já, mesmo com um token do Treino ainda válido). Nunca mexe em professor do Calc de
 * verdade (as regras de hoje continuam) nem no master; sem acesso para tirar, nada a fazer.
 */
export function deveTirarAcessoDoEspelho(r: ResumoNucleo, papelAtual: string | null | undefined, linha: LinhaProfessorCobranca | null): boolean {
  if (!linha || r.master || papelAtual === "admin" || papelAtual === "master") return false;
  if (acessoProfessor(r)) return false;
  return linhaSoDoEspelho(linha) && Boolean(linha.acesso_liberado_ate || linha.nucleo_acesso_ate);
}

/** Linhas do physiq_espelho_membros deste usuário (todas as contas em que aparece; ativo só se o membro está ativo). */
export function linhasEspelhoMembros(r: ResumoNucleo): Array<{ conta_id: string; papeis: Papel[]; ativo: boolean }> {
  const porConta = new Map<string, { conta_id: string; papeis: Papel[]; ativo: boolean }>();
  for (const m of r.membros || []) {
    const ativo = m.status === "ativo";
    const atual = porConta.get(m.conta_id);
    if (!atual || (ativo && !atual.ativo)) porConta.set(m.conta_id, { conta_id: m.conta_id, papeis: [...m.papeis], ativo });
  }
  return [...porConta.values()];
}

/** W28 — o dia de hoje em São Paulo (o mesmo do `cobranca_hoje()` do banco principal). */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/**
 * W28 — a regra da `physiq_professor_acesso_ok` do Banco do Treino (supabase/migrations/20261002040100_w28_acesso.sql): status
 * 'ativo' e o acesso espelhado do núcleo (`nucleo_acesso_ate`, já com a tolerância do legado Calc) até hoje em SÃO PAULO,
 * inclusive. Assim o Treino trava no MESMO instante que o painel (meia-noite de São Paulo do dia seguinte), e não mais às 21:00
 * do último dia (o `current_date` em UTC da regra antiga).
 */
export function acessoProfessorOk(p: { status?: string | null; nucleo_acesso_ate?: string | null }, agora: Date = new Date()): boolean {
  return p.status === "ativo" && !!p.nucleo_acesso_ate && p.nucleo_acesso_ate.slice(0, 10) >= hojeEmSaoPaulo(agora);
}

/** Data de "sem limite" usada pelo espelho (conta isenta). */
export const ACESSO_SEM_LIMITE = DATA_MAXIMA;

/** Comparação de segredo em tempo constante (ESPELHO_SEGREDO). Segredo curto = sempre recusa. */
export function segredoConfere(recebido: string | null | undefined, esperado: string | null | undefined): boolean {
  const a = recebido || "";
  const b = esperado || "";
  if (b.length < 32 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
