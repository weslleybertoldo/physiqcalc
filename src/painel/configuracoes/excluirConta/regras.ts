/**
 * W2 da loja — regras puras da tela "Excluir minha conta" do profissional (o vitest testa daqui): os textos da conferência, o
 * resumo da confirmação, quais prontuários baixar (1 PDF por paciente) e os nomes dos arquivos. Na versão da loja (ehLoja), nada
 * de preço, de "grátis" ou de como pagar — dizer que a cobrança automática do plano é cancelada é informação (decisão de 06/10).
 */
import { ehProfissional, type Situacao } from "@/nucleo/situacao";
import type { Conferencia, ContaDoDono, ProntuarioAConferir } from "./api";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const soma = (o: Record<string, number> | null | undefined, chaves: string[]) => chaves.reduce((t, k) => t + (Number(o?.[k]) || 0), 0);

export const ROTULO_PAPEL_EQUIPE: Record<string, string> = { dono: "Dono", personal: "Personal", nutricionista: "Nutricionista" };

export function papeisLegiveis(papeis: string[]): string {
  const p = papeis.filter((x) => x !== "dono").map((x) => ROTULO_PAPEL_EQUIPE[x] ?? x);
  return p.length ? p.join(" e ") : "Equipe";
}

/** Para onde vão os alunos da conta (uma frase). */
export function textoDosAlunos(c: ContaDoDono, loja: boolean): string {
  const { total, para_o_app: app, guardados } = c.alunos;
  if (total === 0) return "Nenhum aluno na conta agora.";
  const partes: string[] = [];
  if (app > 0) {
    partes.push(loja
      ? `${plural(app, "aluno com login continua", "alunos com login continuam")} usando o app, agora sem profissional`
      : `${plural(app, "aluno com login vira", "alunos com login viram")} aluno${app === 1 ? "" : "s"} do app, sem profissional, com 7 dias grátis`);
  }
  if (guardados > 0) partes.push(`${plural(guardados, "fica guardado", "ficam guardados")} sem acesso (sem login, inativo ou com outro profissional)`);
  return `${plural(total, "aluno", "alunos")}: ${partes.join("; ")}.`;
}

/** O membro que sai: os alunos dele ficam na conta do dono, sem responsável. */
export function textoDosAlunosDaEquipe(n: number): string {
  if (n <= 0) return "Você não é responsável por nenhum aluno agora.";
  return n === 1
    ? "O seu aluno fica na conta, sem responsável, para o dono atribuir a outro profissional."
    : `Os seus ${n} alunos ficam na conta, sem responsável, para o dono atribuir a outro profissional.`;
}

/** As linhas da cobrança automática (só informação — nenhum valor, nenhum "pague"). */
export function textosDaCobranca(c: ContaDoDono): string[] {
  const linhas: string[] = [];
  if (c.cobrancas.plano > 0) linhas.push("A cobrança automática do plano desta conta é cancelada agora (sem reembolso do que já foi pago).");
  if (c.cobrancas.alunos > 0) {
    linhas.push(`${c.cobrancas.alunos === 1 ? "A cobrança automática de 1 aluno" : `As cobranças automáticas de ${c.cobrancas.alunos} alunos`} para você também ${c.cobrancas.alunos === 1 ? "é cancelada" : "são canceladas"}.`);
  }
  return linhas;
}

/** Todos os prontuários que a conferência listou (as contas de que é dono + os pacientes sem conta do site antigo). */
export function prontuariosDaConferencia(c: Conferencia): ProntuarioAConferir[] {
  return [...c.contas.flatMap((x) => x.prontuarios), ...(c.sem_conta?.prontuarios ?? [])];
}

/** O passo "Baixar prontuários" só aparece para quem tem prontuário guardado nas contas dele (o membro não baixa — fica com a conta). */
export function precisaBaixar(c: Conferencia): boolean {
  return prontuariosDaConferencia(c).length > 0;
}

/** Os pedidos ao banco: por conta, até 25 matrículas por vez. */
export function lotesParaBaixar(ps: ProntuarioAConferir[], tamanho = 25): Array<{ conta: string | null; pacientes: string[] }> {
  const porConta = new Map<string, string[]>();
  for (const p of ps) {
    const k = p.conta_id ?? "";
    porConta.set(k, [...(porConta.get(k) ?? []), p.paciente_id]);
  }
  const lotes: Array<{ conta: string | null; pacientes: string[] }> = [];
  for (const [k, ids] of porConta) {
    for (let i = 0; i < ids.length; i += tamanho) lotes.push({ conta: k || null, pacientes: ids.slice(i, i + tamanho) });
  }
  return lotes;
}

/** "physiq-prontuarios-2026-10-06.zip" (sem nome de ninguém no arquivo). */
export function nomeDoZip(dia: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : new Date().toISOString().slice(0, 10);
  return `physiq-prontuarios-${d}.zip`;
}

/** Nomes dentro do ZIP sem repetir (2 pacientes com o mesmo nome → "-2"). */
export function nomeUnico(nome: string, usados: Set<string>): string {
  if (!usados.has(nome)) {
    usados.add(nome);
    return nome;
  }
  const [base, ext] = nome.includes(".") ? [nome.slice(0, nome.lastIndexOf(".")), nome.slice(nome.lastIndexOf("."))] : [nome, ""];
  for (let i = 2; ; i += 1) {
    const novo = `${base}-${i}${ext}`;
    if (!usados.has(novo)) {
      usados.add(novo);
      return novo;
    }
  }
}

/** O que sai de vez (a pessoa, o login e o que é dela — nunca o histórico dos alunos). */
export function listaApaga(c: Conferencia): string[] {
  const linhas = ["O seu login no Physiq (e-mail, senha e o acesso pelo Google): não dá mais para entrar com ele",
    "A foto, os contatos e o carimbo do seu perfil profissional, os seus avisos e o código de convite"];
  const t = c.treino?.apaga;
  const treinos = Math.max(soma(t, ["treino_historico"]), soma(t, ["tb_treino_concluido"]));
  const series = soma(t, ["tb_treino_series"]);
  if (treinos || series) linhas.push(`O seu histórico de treino pessoal: ${plural(treinos, "treino feito", "treinos feitos")} e ${plural(series, "série", "séries")}`);
  const proprios = soma(t, ["tb_exercicios_usuario", "tb_grupos_treino_usuario", "tb_academias"]);
  if (proprios) linhas.push(`Treinos, exercícios e academias pessoais (${proprios})`);
  if (soma(t, ["physiq_recebimentos"])) linhas.push("Os dados de recebimento que estavam no app antigo de treino");
  const enviados = soma(c.aluno?.apaga, ["diario_alimentar", "refeicoes_concluidas", "metas_concluidas"]);
  if (enviados) linhas.push(`O que você enviou como aluno: fotos do diário e refeições/metas marcadas (${enviados})`);
  return linhas;
}

/** O que fica guardado, e por quê. */
export function listaFica(c: Conferencia): string[] {
  const linhas: string[] = [];
  const temContas = c.contas.length > 0 || (c.sem_conta?.alunos ?? 0) > 0;
  if (temContas) {
    linhas.push("O histórico de cada aluno — prontuário, avaliações, treinos, dietas e pagamentos — fica guardado na matrícula dele. "
      + "É a guarda que a lei pede (Res. CFN 594/2017 e Lei 13.787/2018: 20 anos); você não acessa mais depois de excluir.");
    linhas.push("A conta fica como cancelada, sem acesso para ninguém.");
  }
  if (c.equipes.length > 0 || c.ex_equipes > 0) linhas.push("O que você registrou para os alunos de uma equipe fica com a conta da equipe.");
  const montados = soma(c.treino?.mantem, ["treinos_montados", "exercicios_proprios"]);
  if (montados) linhas.push(`Os treinos e exercícios que você montou para os alunos (${montados}) continuam com eles.`);
  if (c.aluno && c.aluno.matriculas > 0) linhas.push("A sua matrícula como aluno fica com o seu profissional, desligada do seu login (avaliações, planos e pagamentos).");
  linhas.push("Seu nome e registro profissional ficam nas anotações que você assinou.");
  return linhas;
}

/** A frase da última confirmação. */
export function resumoDaConfirmacao(c: Conferencia): string {
  const partes: string[] = [];
  for (const conta of c.contas) {
    const membros = conta.membros.filter((m) => !m.convite).length;
    partes.push(`a conta ${conta.nome} é encerrada${membros ? ` e ${plural(membros, "profissional perde", "profissionais perdem")} o acesso` : ""}`);
  }
  for (const e of c.equipes) partes.push(`você sai da equipe de ${e.conta_nome}`);
  if (c.cobrancas_a_cancelar > 0) partes.push(`${plural(c.cobrancas_a_cancelar, "cobrança automática é cancelada", "cobranças automáticas são canceladas")}`);
  partes.push("o seu login é apagado");
  const texto = partes.join(", ").replace(/, ([^,]*)$/, " e $1");
  return `${texto.charAt(0).toUpperCase()}${texto.slice(1)}. Não dá para desfazer.`;
}

/**
 * A tela de exclusão certa para quem entrou pela página /excluir-conta: o profissional (e o master — que é recusado lá) no painel ›
 * Configurações › Excluir minha conta; os outros no Perfil do app (o "Excluir minha conta" do aluno abre sozinho).
 */
export function destinoDaExclusao(s: Situacao | null | undefined): string {
  return ehProfissional(s) ? "/painel/configuracoes/excluir-conta" : "/perfil?excluir=1";
}
