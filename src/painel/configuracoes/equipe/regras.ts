/**
 * Configurações › Equipe e Convite (W5, spec 4.1, 4.6 e 6.4): regras puras da tela. A regra de verdade mora no banco
 * principal (equipe_da_conta, convidar_membro, alterar_papeis_membro, remover_membro — migração 20260929120000_w05_equipe);
 * aqui ficam os textos, a normalização da resposta e o que a tela oferece a cada um.
 */
import { ehLoja } from "@/lib/distribuicao";
import type { Papel } from "@/nucleo/situacao";

export type PapelModulo = "personal" | "nutricionista";
/** W28: o "conta_legada" (equipe só nas contas novas até a virada) saiu — as legadas convidam igual à conta nova. */
export type BloqueioEquipe = "conta_travada" | "conta_inexistente" | null;

export interface MembroEquipe {
  id: string;
  user_id: string | null;
  status: "ativo" | "convidado" | "removido";
  papeis: Papel[];
  nome: string;
  email: string | null;
  foto_url: string | null;
  dono: boolean;
  eu: boolean;
  codigo_convite: string | null;
  desde: string | null;
  alunos_treino: number;
  alunos_nutricao: number;
}

export interface ConvitePendente {
  id: string;
  email: string;
  papeis: PapelModulo[];
  enviado_em: string | null;
  criado_por_nome: string | null;
}

export interface Equipe {
  conta: { id: string; nome: string; origem: string; plano: string; modulos: string[]; dono_id: string | null };
  papeis_do_plano: PapelModulo[];
  bloqueio: BloqueioEquipe;
  membros: MembroEquipe[];
  convites: ConvitePendente[];
  alunos_sem_responsavel: number;
}

const PAPEIS: Papel[] = ["dono", "personal", "nutricionista"];
const PAPEIS_MODULO: PapelModulo[] = ["personal", "nutricionista"];
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const soPapeis = (v: unknown): Papel[] => (Array.isArray(v) ? PAPEIS.filter((p) => v.includes(p)) : []);
const soModulo = (v: unknown): PapelModulo[] => (Array.isArray(v) ? PAPEIS_MODULO.filter((p) => v.includes(p)) : []);

/** Resposta da equipe_da_conta → tipos da tela (tolerante: campo faltando nunca quebra a lista). */
export function normalizarEquipe(bruto: unknown): Equipe | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  if (b.ok !== true || !b.conta || typeof b.conta !== "object") return null;
  const c = b.conta as Record<string, unknown>;
  const membros = (Array.isArray(b.membros) ? b.membros : []) as Record<string, unknown>[];
  const convites = (Array.isArray(b.convites) ? b.convites : []) as Record<string, unknown>[];
  const bloqueio = ["conta_travada", "conta_inexistente"].includes(String(b.bloqueio)) ? (b.bloqueio as BloqueioEquipe) : null;
  return {
    conta: {
      id: String(c.id ?? ""), nome: String(c.nome ?? ""), origem: String(c.origem ?? ""), plano: String(c.plano ?? ""),
      modulos: Array.isArray(c.modulos) ? (c.modulos as string[]) : [], dono_id: (c.dono_id as string) ?? null,
    },
    papeis_do_plano: soModulo(b.papeis_do_plano),
    bloqueio,
    membros: membros.map((m) => ({
      id: String(m.id ?? ""),
      user_id: (m.user_id as string) ?? null,
      status: (["ativo", "convidado", "removido"].includes(String(m.status)) ? m.status : "ativo") as MembroEquipe["status"],
      papeis: soPapeis(m.papeis),
      nome: String(m.nome ?? m.email ?? "Profissional"),
      email: (m.email as string) ?? null,
      foto_url: (m.foto_url as string) ?? null,
      dono: m.dono === true,
      eu: m.eu === true,
      codigo_convite: (m.codigo_convite as string) ?? null,
      desde: (m.desde as string) ?? null,
      alunos_treino: num(m.alunos_treino),
      alunos_nutricao: num(m.alunos_nutricao),
    })),
    convites: convites.map((v) => ({
      id: String(v.id ?? ""), email: String(v.email ?? ""), papeis: soModulo(v.papeis), enviado_em: (v.enviado_em as string) ?? null,
      criado_por_nome: (v.criado_por_nome as string) ?? null,
    })),
    alunos_sem_responsavel: num(b.alunos_sem_responsavel),
  };
}

export const ROTULO_PAPEL: Record<Papel, string> = { dono: "Dono", personal: "Personal trainer", nutricionista: "Nutricionista" };

/** "Personal trainer e nutricionista" (o menu do usuário usa o rótulo da W3; aqui é o da lista da equipe). */
export function textoDosPapeis(papeis: readonly Papel[]): string {
  const m = PAPEIS_MODULO.filter((p) => papeis.includes(p)).map((p) => ROTULO_PAPEL[p]);
  if (m.length === 2) return `${m[0]} e ${m[1].toLowerCase()}`;
  if (m.length === 1) return m[0];
  return papeis.includes("dono") ? "Dono (sem módulo)" : "Sem papel";
}

/** Os papéis que a tela oferece no convite/na troca: os do plano ligados; os outros aparecem desligados, com o porquê. */
export function papeisOferecidos(doPlano: readonly PapelModulo[]): { papel: PapelModulo; rotulo: string; modulo: "treino" | "nutricao"; disponivel: boolean; porque: string | null }[] {
  return [
    { papel: "personal", rotulo: "Personal trainer", modulo: "treino", disponivel: doPlano.includes("personal"), porque: doPlano.includes("personal") ? null : "O plano da conta não tem Treino." },
    { papel: "nutricionista", rotulo: "Nutricionista", modulo: "nutricao", disponivel: doPlano.includes("nutricionista"), porque: doPlano.includes("nutricionista") ? null : "O plano da conta não tem Nutrição." },
  ];
}

export function validarEmailConvite(email: string): string | null {
  const e = email.trim().toLowerCase();
  if (!e) return "Informe o e-mail de quem você quer convidar.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || e.length > 254) return "E-mail inválido.";
  return null;
}

/** Membros ativos (tirando quem sai) que podem receber os alunos daquele papel. */
export function sucessoresPossiveis(membros: readonly MembroEquipe[], saindo: MembroEquipe, papel: PapelModulo): MembroEquipe[] {
  return membros.filter((m) => m.status === "ativo" && m.user_id && m.id !== saindo.id && m.papeis.includes(papel));
}

function plural(n: number, um: string, varios: string): string {
  return n === 1 ? um : varios;
}

/** "Os 3 alunos de treino e 1 de nutrição dele ficam sem responsável…" (null = não atende ninguém) */
export function textoAlunosAfetados(m: Pick<MembroEquipe, "alunos_treino" | "alunos_nutricao">): string | null {
  const t = m.alunos_treino;
  const n = m.alunos_nutricao;
  if (!t && !n) return null;
  const fim = "sem responsável até você escolher outro.";
  if (t + n === 1) return `O aluno de ${t ? "treino" : "nutrição"} dele fica ${fim}`;
  const partes: string[] = [];
  if (t) partes.push(`${t} ${plural(t, "aluno", "alunos")} de treino`);
  if (n) partes.push(t ? `${n} de nutrição` : `${n} ${plural(n, "aluno", "alunos")} de nutrição`);
  return `Os ${partes.join(" e ")} dele ficam ${fim}`;
}

/** O que o dono pode fazer com cada linha da equipe. */
export function acoesDoMembro(m: MembroEquipe, equipe: Pick<Equipe, "bloqueio">): { papeis: boolean; remover: boolean } {
  if (equipe.bloqueio === "conta_inexistente" || m.status !== "ativo") return { papeis: false, remover: false };
  return { papeis: equipe.bloqueio === null, remover: !m.dono };
}

/** Mensagem para cada recusa do banco/função (spec 9 e as da tela). */
export const MENSAGEM_EQUIPE: Record<string, string> = {
  sem_login: "Sua sessão terminou. Entre de novo.",
  so_dono: "Só o dono da conta mexe na equipe.",
  conta_inexistente: "Não achamos esta conta.",
  conta_legada: "A cobrança desta conta ainda não passou para o Physiq: a equipe abre depois disso. Fale com o suporte.",
  conta_travada: "O plano está vencido: regularize em Configurações › Plano para mexer na equipe.",
  email_invalido: "E-mail inválido.",
  papeis_invalidos: "Escolha pelo menos um papel: personal trainer ou nutricionista.",
  papel_sem_modulo: "O plano da conta não tem o módulo desse papel. Mude o plano em Configurações › Plano.",
  papel_dono: "O papel de dono é só de quem criou a conta.",
  proprio_email: "Esse é o seu próprio e-mail.",
  ja_e_membro: "Essa pessoa já faz parte da equipe.",
  muitos_convites: "Muitos convites seguidos. Tente de novo em alguns minutos.",
  conta_real_no_staging: "Este é o ambiente de teste: só contas de teste podem ser convidadas.",
  convite_inexistente: "Esse convite não existe mais.",
  convite_nao_pendente: "Esse convite já foi aceito ou cancelado.",
  membro_inexistente: "Essa pessoa não está mais na equipe.",
  nao_remove_dono: "O dono da conta não pode ser removido.",
  tem_alunos: "Você atende alunos nesse papel. Passe os alunos para outro profissional antes de tirar o papel.",
  novo_responsavel_invalido: "Quem vai receber os alunos precisa ser da equipe e ter o mesmo papel.",
  nao_membro: "Você não faz mais parte desta conta.",
  sem_internet: "Sem internet. A equipe aparece quando a conexão voltar.",
  erro_interno: "Não deu certo agora. Tente de novo.",
};

/** W1 da loja: na versão da Google Play, as recusas do plano sem mandar regularizar ou mudar o plano (ele paga pelo site). */
export const MENSAGEM_EQUIPE_LOJA: Record<string, string> = {
  conta_travada: "O plano está vencido: a equipe fica parada até o plano voltar a ficar ativo.",
  papel_sem_modulo: "O plano da conta não tem o módulo desse papel.",
};

export function mensagemErroEquipe(codigo: string | null | undefined, loja: boolean = ehLoja): string {
  if (loja && MENSAGEM_EQUIPE_LOJA[codigo ?? ""]) return MENSAGEM_EQUIPE_LOJA[codigo ?? ""];
  return MENSAGEM_EQUIPE[codigo ?? ""] ?? MENSAGEM_EQUIPE.erro_interno;
}

// ---- Convite (link pessoal do profissional) ----

/** Site do link do aluno: o do ambiente (o do APK e o do dev local não servem para quem recebe). */
export function siteDoAmbiente(schema: string): string {
  return schema === "staging" ? "https://physiqcalc-staging.vercel.app" : "https://physiqcalc.com.br";
}

/** O mesmo link de hoje do Calc: `/?prof=PROF-NOME-SOBRENOME` (o app guarda o código e liga o aluno depois do login). */
export function linkDoAluno(codigo: string, schema: string): string {
  return `${siteDoAmbiente(schema)}/?prof=${encodeURIComponent(codigo)}`;
}

export const TEXTO_CONVITE_ALUNO = "Entre na minha lista de alunos no Physiq pelo link:";

export function linkWhatsApp(link: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${TEXTO_CONVITE_ALUNO} ${link}`)}`;
}

/** Quem entra pelo link fica com você como responsável do quê (os papéis de módulo que você tem nesta conta). */
export function textoDoLink(papeis: readonly Papel[], conta: string): string {
  const t = papeis.includes("personal");
  const n = papeis.includes("nutricionista");
  const alvo = t && n ? "de treino e de nutrição" : t ? "de treino" : n ? "de nutrição" : null;
  return alvo
    ? `Quem entra por este link (ou digita o código) vira aluno da ${conta} com você como responsável ${alvo}.`
    : `Quem entra por este link (ou digita o código) vira aluno da ${conta} sem responsável — você atribui depois.`;
}
