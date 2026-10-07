/**
 * W2 da loja (Google Play) — "Excluir minha conta" do PROFISSIONAL: acesso a dados, tudo no BANCO PRINCIPAL (online — 9A).
 *   excluir-minha-conta { fluxo: "profissional", simular: true }        a conferência (nada muda)
 *   excluir-minha-conta { fluxo: "profissional", confirmacao: "EXCLUIR" } exclui (a borda cancela a cobrança, o Treino, a conta e o login)
 *   w2l_prontuarios_para_baixar(conta, pacientes)                        o que o dono baixa antes (1 PDF por paciente, no ZIP)
 * O campo `fluxo: "profissional"` é a trava: sem ele a borda faz o de sempre (o "Excluir" do aluno) — supabase-principal/functions/
 * _shared/exclusao-profissional-regras.ts.
 */
import { PRINCIPAL_ANON, PRINCIPAL_SCHEMA, PRINCIPAL_URL, principal } from "@/integrations/principal/client";
import { ehLoja } from "@/lib/distribuicao";
import { CONTATO_SUPORTE } from "@/nucleo/suporte";
import { PALAVRA_CONFIRMACAO } from "../../../../supabase-principal/functions/_shared/conta-aluno-regras";

export { PALAVRA_CONFIRMACAO };

export class ErroExclusao extends Error {
  constructor(public codigo: string, public extra: Record<string, unknown> = {}) {
    super(codigo);
  }
}

export type Perfil = "dono" | "membro" | "ex_profissional";

export interface ProntuarioAConferir {
  paciente_id: string;
  conta_id: string | null;
  nome: string;
  registros: number;
  /** anotações "Só nutricionistas" que o dono não vê (ficam guardadas com a matrícula) */
  restritos: number;
}

export interface ContaDoDono {
  id: string | null;
  nome: string;
  origem: string | null;
  plano: string | null;
  situacao: string | null;
  eu_nutri: boolean;
  alunos: { total: number; para_o_app: number; guardados: number; lista: Array<{ nome: string; destino: "app" | "guardado" }> };
  membros: Array<{ nome: string; email: string | null; papeis: string[]; convite: boolean }>;
  convites_pendentes: number;
  cobrancas: { plano: number; alunos: number };
  prontuarios: ProntuarioAConferir[];
}

export interface EquipeQueSai {
  conta_nome: string;
  dono_nome: string | null;
  papeis: string[];
  alunos_treino: number;
  alunos_nutricao: number;
}

/** A conferência (contagens e listas — nada muda nela). */
export interface Conferencia {
  ok: true;
  simulacao: true;
  perfil: Perfil;
  nome: string | null;
  contas: ContaDoDono[];
  equipes: EquipeQueSai[];
  ex_equipes: number;
  sem_conta: { alunos: number; prontuarios: ProntuarioAConferir[] } | null;
  aluno: { matriculas: number; contas: string[]; apaga: Record<string, number>; mantem: Record<string, number> } | null;
  treino: { apaga: Record<string, number>; mantem: Record<string, number>; cobrancas: { plano: number; alunos: number } } | null;
  cobrancas_a_cancelar: number;
}

/** O resumo da tela "Conta excluída". */
export interface ResultadoExclusao {
  contas: string[];
  alunos_para_o_app: number;
  alunos_guardados: number;
  membros_removidos: number;
  equipes_que_saiu: number;
  cobrancas_canceladas: number;
  treino: { login: string } | null;
  arquivos: number;
}

const semInternet = () => typeof navigator !== "undefined" && navigator.onLine === false;

/**
 * Chamada direta à borda (não pelo functions.invoke: o cliente do principal desiste em 15 s e repete sozinho em 5xx — a exclusão
 * conversa com o Mercado Pago, o Treino e o Auth e pode passar disso; aqui espera até `limiteMs` e nunca repete sozinha).
 */
async function chamar<T>(corpo: Record<string, unknown>, limiteMs: number): Promise<T> {
  if (semInternet()) throw new ErroExclusao("sem_internet");
  const { data } = await principal.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ErroExclusao("invalid_token");
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), limiteMs);
  let resposta: Response;
  try {
    resposta = await fetch(`${PRINCIPAL_URL}/functions/v1/excluir-minha-conta`, {
      method: "POST",
      signal: controle.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: PRINCIPAL_ANON, "x-schema": PRINCIPAL_SCHEMA },
      body: JSON.stringify({ ...corpo, fluxo: "profissional" }),
    });
  } catch (e) {
    throw new ErroExclusao((e as Error)?.name === "AbortError" ? "demorou" : semInternet() ? "sem_internet" : "rede");
  } finally {
    clearTimeout(timer);
  }
  const d = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resposta.ok || d.ok === false) throw new ErroExclusao(String(d.erro ?? (resposta.status === 401 ? "invalid_token" : "erro_interno")), d);
  return d as T;
}

export const conferirExclusaoProfissional = () => chamar<Conferencia>({ simular: true }, 45_000);

export const excluirContaProfissional = (confirmacao: string) =>
  chamar<{ ok: true; perfil: Perfil; resultado: ResultadoExclusao }>({ confirmacao }, 120_000);

/** Os prontuários de até 50 matrículas de uma conta (p_conta vazio = os pacientes sem conta do site antigo, da própria). */
export interface ProntuariosParaBaixar {
  clinico: boolean;
  emissor: string | null;
  pacientes: Array<{
    id: string;
    nome: string;
    nascimento: string | null;
    na_lixeira: boolean;
    registros: Array<{ data: string; texto: string; created_at: string; autor_id: string; autor_nome: string | null; autor_papel: string; visibilidade: string }>;
  }>;
}

export async function prontuariosParaBaixar(conta: string | null, pacientes: string[]): Promise<ProntuariosParaBaixar> {
  if (semInternet()) throw new ErroExclusao("sem_internet");
  const { data, error } = await principal.rpc("w2l_prontuarios_para_baixar" as never, { p_conta: conta, p_pacientes: pacientes } as never);
  if (error) throw new ErroExclusao("erro_interno", { mensagem: error.message });
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok !== true) throw new ErroExclusao(String(d.erro ?? "erro_interno"), d);
  return {
    clinico: d.clinico === true,
    emissor: (d.emissor as string | null) ?? null,
    pacientes: Array.isArray(d.pacientes) ? (d.pacientes as ProntuariosParaBaixar["pacientes"]) : [],
  };
}

/** Códigos da borda → frase para a pessoa. Na versão da loja, nenhuma menção a como pagar. */
export function mensagemErroExclusao(e: unknown): string {
  const codigo = e instanceof ErroExclusao ? e.codigo : "erro_interno";
  const motivo = e instanceof ErroExclusao ? String(e.extra?.motivo ?? "") : "";
  switch (codigo) {
    case "sem_internet":
    case "rede":
      return "Sem internet agora. Conecte-se e tente de novo.";
    case "demorou":
      return "A exclusão está demorando para responder. Ela pode ter terminado: entre de novo em alguns minutos — se a conta ainda existir, peça a exclusão de novo (nada é feito duas vezes).";
    case "confirmacao_invalida":
      return `Digite ${PALAVRA_CONFIRMACAO} para confirmar.`;
    case "profissional":
      return motivo === "master" || motivo === "treino"
        ? `Contas master não são excluídas pelo app. Fale com o suporte do Physiq em ${CONTATO_SUPORTE}.`
        : `Esta conta não é excluída por aqui. Fale com o suporte do Physiq em ${CONTATO_SUPORTE}.`;
    case "nao_profissional":
      return "Você não tem conta de profissional: a exclusão é no app do aluno, em Perfil › Excluir minha conta.";
    case "assinatura_ativa":
      return "Você também é aluno e tem uma cobrança automática ligada no cartão. Cancele em Perfil › Pagamentos (área do aluno) antes de excluir a conta.";
    case "conta_legada":
      return `A cobrança desta conta ainda é a do app antigo. Para excluir, fale com o suporte do Physiq em ${CONTATO_SUPORTE}.`;
    case "cobranca_ativa":
    case "cobranca_nao_cancelada":
      return ehLoja
        ? "Não foi possível confirmar agora o cancelamento da cobrança automática. Nada foi excluído — tente de novo em alguns minutos."
        : "O Mercado Pago não confirmou agora o cancelamento da cobrança automática. Nada foi excluído — tente de novo em alguns minutos.";
    case "treino_indisponivel":
      return "Não foi possível falar com o banco do treino agora. Nada foi apagado — tente de novo em alguns minutos.";
    case "rate_limited":
      return "Muitas tentativas. Tente de novo em alguns minutos.";
    case "conta_real_no_staging":
      return "Este é o ambiente de teste: só contas de teste podem fazer isso aqui.";
    case "invalid_token":
      return "Sua sessão expirou. Saia e entre de novo.";
    default:
      return "Não deu certo agora. Tente de novo.";
  }
}
