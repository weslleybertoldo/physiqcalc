/**
 * Perfil do aluno no painel (W14) — regras PURAS (sem rede): a linha do cabeçalho da tela 7, o formulário "Editar dados", os 4
 * ajustes (R12) com os textos novos (F1: "envio de fotos pelo link"), o link do diário e os 7 atalhos do "Fluxo de consulta".
 */
import { rotuloObjetivo } from "@/app-aluno/sozinho/regras";
import { travaDoInadimplente } from "@/financeiro/regras";
import type { FinanceiroProfissional, ResumoMatricula } from "@/financeiro/tipos";
import { formatarTelefone, type AlunoLinha } from "@/painel/alunos/regras";
import { MENSAGEM_REPETIDO } from "@/nucleo/dadoRepetido";
import type { AjustesAluno, ChaveAjuste, FormDadosAluno, Genero, ModuloAluno, PerfilAluno, PerfilTreinoAluno } from "./tipos";

export { formatarTelefone };

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export const GENEROS: { valor: Genero; rotulo: string }[] = [
  { valor: "masculino", rotulo: "Masculino" },
  { valor: "feminino", rotulo: "Feminino" },
  { valor: "outro", rotulo: "Outro" },
];

export const rotuloGenero = (g: string | null | undefined): string => GENEROS.find((x) => x.valor === g)?.rotulo ?? "";

/** O sexo do Banco do Treino (male/female) no formato do principal. */
export function generoDoTreino(sexo: string | null | undefined): Genero | "" {
  if (sexo === "male") return "masculino";
  if (sexo === "female") return "feminino";
  return "";
}

export function apenasDigitos(v: string | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

export function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** "yyyy-mm-dd" de hoje em São Paulo. */
export function hojeSP(agora: Date = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Idade completa em anos na data de hoje (São Paulo). */
export function idadeDe(nascimento: string | null | undefined, hoje: string = hojeSP()): number | null {
  if (!nascimento || !/^\d{4}-\d{2}-\d{2}/.test(nascimento) || !/^\d{4}-\d{2}-\d{2}/.test(hoje)) return null;
  const [a, m, d] = nascimento.slice(0, 10).split("-").map(Number);
  const [ha, hm, hd] = hoje.slice(0, 10).split("-").map(Number);
  let idade = ha - a;
  if (hm < m || (hm === m && hd < d)) idade--;
  return idade >= 0 && idade < 130 ? idade : null;
}

/**
 * hml-12 (H-30): a faixa de idade da regra dos menores (a mesma do banco: idade_em, em São Paulo) — menor de 16 não é cadastrado;
 * de 16 a 17, só com o consentimento do responsável registrado na ficha. Sem data = null.
 */
export type FaixaDeIdade = "menor_16" | "16_17" | "adulto";
export function faixaDeIdade(nascimento: string | null | undefined, hoje: string = hojeSP()): FaixaDeIdade | null {
  const idade = idadeDe(nascimento, hoje);
  if (idade === null) return null;
  return idade < 16 ? "menor_16" : idade < 18 ? "16_17" : "adulto";
}

/** O erro `menor_de_16` (Editar dados e aprovar o cadastro pendente). */
export const MENSAGEM_MENOR_DE_16 = "O Physiq é para quem tem 16 anos ou mais. Não cadastre menores de 16.";

/** "12/03/1998" */
export function dataBR(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** "30/09/2026 · 16:40" (horário de São Paulo) */
export function dataHoraBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dia = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return `${dia} · ${hora}`;
}

/** "mar/2026" (o mês do cadastro, horário de São Paulo). */
export function mesAno(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const [a, m] = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).split("-").map(Number);
  return `${MESES[m - 1]}/${a}`;
}

/** Altura em cm (aceita metros por engano, como a antropometria antiga) → "1,78 m". */
export function alturaEmMetros(cm: number | null | undefined): string {
  if (cm === null || cm === undefined || !Number.isFinite(cm) || cm <= 0) return "";
  const valorCm = cm < 3 ? cm * 100 : cm;
  return `${(valorCm / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}

export function pesoKg(kg: number | null | undefined): string {
  if (kg === null || kg === undefined || !Number.isFinite(kg) || kg <= 0) return "";
  return `${kg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
}

/** O objetivo que a tela mostra: o do profissional (NF8) ou, no aluno do app, o que ele escolheu. */
export function objetivoDoAluno(p: Pick<PerfilAluno, "objetivo" | "objetivo_app">): string {
  return (p.objetivo ?? "").trim() || rotuloObjetivo(p.objetivo_app).toLowerCase();
}

/** Altura e peso do aluno: os do Banco do Treino (Calc) ou os da última antropometria (Nutri). */
export function corpoDoAluno(p: Pick<PerfilAluno, "ultima_antropometria">, treino?: Pick<PerfilTreinoAluno, "altura" | "peso"> | null): {
  alturaCm: number | null;
  pesoKg: number | null;
  fonte: "treino" | "antropometria" | null;
} {
  const altT = numero(treino?.altura);
  const pesoT = numero(treino?.peso);
  if (altT || pesoT) return { alturaCm: altT, pesoKg: pesoT, fonte: "treino" };
  const a = p.ultima_antropometria;
  const altA = numero(a?.altura);
  const pesoA = numero(a?.peso);
  if (altA || pesoA) return { alturaCm: altA !== null && altA > 0 && altA < 3 ? Math.round(altA * 1000) / 10 : altA, pesoKg: pesoA, fonte: "antropometria" };
  return { alturaCm: null, pesoKg: null, fonte: null };
}

/** Linha do cabeçalho (tela 7): "28 anos · 1,78 m · objetivo: definição · aluno desde mar/2026" (só o que existe). */
export function linhaDoCabecalho(p: Pick<PerfilAluno, "nascimento" | "objetivo" | "objetivo_app" | "criado_em" | "ultima_antropometria">,
  treino?: Pick<PerfilTreinoAluno, "altura" | "peso" | "idade" | "data_nascimento" | "created_at"> | null, hoje: string = hojeSP()): string {
  const partes: string[] = [];
  const idade = idadeDe(p.nascimento, hoje) ?? idadeDe(treino?.data_nascimento, hoje) ?? (numero(treino?.idade) || null);
  if (idade) partes.push(`${idade} anos`);
  const { alturaCm } = corpoDoAluno(p, treino);
  const alt = alturaEmMetros(alturaCm);
  if (alt) partes.push(alt);
  const obj = objetivoDoAluno(p);
  if (obj) partes.push(`objetivo: ${obj}`);
  const desde = mesAno(treino?.created_at && (!p.criado_em || treino.created_at < p.criado_em) ? treino.created_at : p.criado_em);
  if (desde) partes.push(`aluno desde ${desde}`);
  return partes.join(" · ");
}

/** Primeiro nome em maiúsculas para o chip ("TREINO · LUCAS"). */
export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

/** Link do WhatsApp do telefone do aluno (DDD + número; acrescenta o 55 quando falta) — a ação "Mensagem" (P24). */
export function whatsappDoAluno(telefone: string | null | undefined): string | null {
  const d = apenasDigitos(telefone);
  if (d.length < 10 || d.length > 13) return null;
  const comPais = d.length >= 12 && d.startsWith("55") ? d : `55${d}`;
  return `https://wa.me/${comPais}`;
}

/** Máscara progressiva 000.000.000-00. */
export function formatarCPF(v: string | null | undefined): string {
  const d = apenasDigitos(v).slice(0, 11);
  let out = d.slice(0, 3);
  if (d.length > 3) out += "." + d.slice(3, 6);
  if (d.length > 6) out += "." + d.slice(6, 9);
  if (d.length > 9) out += "-" + d.slice(9, 11);
  return out;
}

export function validarCPF(cpf: string): boolean {
  const d = apenasDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

// ───────────────────────── Editar dados ─────────────────────────

/** Valores iniciais do formulário: a matrícula; o que faltar, do Banco do Treino (o cadastro que o Calc guardava). */
export function formDoPerfil(p: PerfilAluno, treino?: PerfilTreinoAluno | null): FormDadosAluno {
  const { alturaCm, pesoKg: kg } = corpoDoAluno({ ultima_antropometria: null }, treino);
  return {
    nome: p.nome ?? "",
    apelido: p.apelido ?? "",
    nascimento: (p.nascimento ?? treino?.data_nascimento ?? "").slice(0, 10),
    genero: ((p.genero as Genero) || generoDoTreino(treino?.sexo)) as FormDadosAluno["genero"],
    cpf: formatarCPF(p.cpf),
    telefone: formatarTelefone(p.telefone),
    email: p.email ?? "",
    objetivo: p.objetivo ?? "",
    altura: alturaCm ? String(alturaCm).replace(".", ",") : "",
    peso: kg ? String(kg).replace(".", ",") : "",
  };
}

/** Confere antes de mandar (o servidor confere de novo). */
export function validarForm(f: FormDadosAluno, hoje: string = hojeSP()): string | null {
  if (f.nome.trim().replace(/\s+/g, " ").length < 2) return "Escreva o nome do aluno.";
  if (f.nascimento) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.nascimento) || f.nascimento < "1900-01-01" || f.nascimento > hoje) return "Confira a data de nascimento.";
  }
  const tel = apenasDigitos(f.telefone);
  if (tel && (tel.length < 10 || tel.length > 13)) return "O telefone precisa ter DDD e 8 ou 9 números.";
  if (f.cpf.trim() && !validarCPF(f.cpf)) return "Confira o CPF.";
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return "Confira o e-mail.";
  const alt = numero(f.altura);
  if (f.altura.trim() && (alt === null || alt < 50 || alt > 250)) return "A altura vai em centímetros (ex.: 178).";
  const kg = numero(f.peso);
  if (f.peso.trim() && (kg === null || kg < 20 || kg > 400)) return "Confira o peso (em kg).";
  return null;
}

/** O que muda no banco principal (só as chaves alteradas) — e o que vai para o Banco do Treino (altura/peso e o cadastro de lá). */
export function mudancas(f: FormDadosAluno, inicial: FormDadosAluno): { principal: Record<string, string>; treino: Record<string, unknown> } {
  const principal: Record<string, string> = {};
  const limpo = (v: string) => v.trim().replace(/\s+/g, " ");
  if (limpo(f.nome) !== limpo(inicial.nome)) principal.nome = limpo(f.nome);
  if (f.apelido.trim() !== inicial.apelido.trim()) principal.apelido = f.apelido.trim();
  if (f.nascimento !== inicial.nascimento) principal.nascimento = f.nascimento;
  if (f.genero !== inicial.genero) principal.genero = f.genero;
  if (apenasDigitos(f.cpf) !== apenasDigitos(inicial.cpf)) principal.cpf = apenasDigitos(f.cpf);
  if (apenasDigitos(f.telefone) !== apenasDigitos(inicial.telefone)) principal.telefone = apenasDigitos(f.telefone);
  if (f.email.trim().toLowerCase() !== inicial.email.trim().toLowerCase()) principal.email = f.email.trim().toLowerCase();
  if (f.objetivo.trim() !== inicial.objetivo.trim()) principal.objetivo = f.objetivo.trim();
  const treino: Record<string, unknown> = {};
  if (numero(f.altura) !== numero(inicial.altura)) treino.altura = numero(f.altura);
  if (numero(f.peso) !== numero(inicial.peso)) treino.peso = numero(f.peso);
  return { principal, treino };
}

/** O cadastro espelhado no Banco do Treino (o formato de lá), junto com altura e peso. */
export function cadastroParaTreino(f: FormDadosAluno, hoje: string = hojeSP()): Record<string, unknown> {
  const sexo = f.genero === "masculino" ? "male" : f.genero === "feminino" ? "female" : undefined;
  return {
    nome: f.nome.trim().replace(/\s+/g, " "),
    ...(sexo ? { sexo } : {}),
    data_nascimento: f.nascimento || null,
    ...(f.nascimento ? { idade: idadeDe(f.nascimento, hoje) } : {}),
    ...(numero(f.altura) ? { altura: numero(f.altura) } : {}),
    ...(numero(f.peso) ? { peso: numero(f.peso) } : {}),
  };
}

/** Códigos das funções do perfil → frase. */
export function mensagemErroPerfil(codigo: string | null | undefined): string {
  const c = String(codigo ?? "").toLowerCase();
  if (c.includes("nome_invalido")) return "Escreva o nome do aluno.";
  if (c.includes("nascimento_invalido")) return "Confira a data de nascimento.";
  // hml-12 (H-30): o gatilho da idade mínima (só com a versão dos textos ligada no banco: na produção o código ainda não chega)
  if (c.includes("menor_de_16")) return MENSAGEM_MENOR_DE_16;
  if (c.includes("genero_invalido")) return "Escolha o sexo.";
  if (c.includes("cpf_invalido")) return "Confira o CPF.";
  if (c.includes("telefone_invalido")) return "O telefone precisa ter DDD e 8 ou 9 números.";
  if (c.includes("email_invalido")) return "Confira o e-mail.";
  // W16b: e-mail/CPF de outro aluno (o formulário mostra embaixo do campo; esta é a frase de reserva)
  if (c.includes("email_repetido")) return MENSAGEM_REPETIDO.email;
  if (c.includes("cpf_repetido")) return MENSAGEM_REPETIDO.cpf;
  if (c.includes("sem_acesso")) return "Só o dono da conta ou o profissional responsável pode mudar isso.";
  if (c.includes("aluno_inexistente")) return "Aluno não encontrado.";
  if (c.includes("sem_login")) return "Sua sessão terminou. Entre de novo.";
  if (c.includes("ajuste_invalido")) return "Ajuste inválido.";
  if (c.includes("failed to fetch") || c.includes("network") || c.includes("sem_internet")) return "Sem conexão. Tente de novo quando a internet voltar.";
  return "Não deu certo agora. Tente de novo.";
}

// ───────────────────────── Ajustes do aluno (R12) ─────────────────────────

export interface DefAjuste {
  chave: ChaveAjuste;
  rotulo: string;
  ajuda: string;
  /** só aparece para aluno com Nutrição (o diário é da nutricionista) */
  soNutricao?: boolean;
}

/** Os 4 ajustes do site antigo, agora valendo (R12); o do link fala do envio de fotos (F1, R13). */
export const AJUSTES: DefAjuste[] = [
  { chave: "acesso_app", rotulo: "Acesso ao app", ajuda: "Desligado, o app abre fechado: \"Seu acesso ao app está desligado. Fale com seu profissional\"." },
  { chave: "mensagens_automaticas", rotulo: "Mensagens automáticas no WhatsApp", ajuda: "Lembretes de consulta, aniversário e cobrança pelo WhatsApp conectado em Mensagens." },
  { chave: "diario_alimentar", rotulo: "Diário alimentar com fotos", ajuda: "O aluno manda fotos das refeições (no app e pelo link) e você reage.", soNutricao: true },
  { chave: "acesso_link", rotulo: "Envio de fotos pelo link", ajuda: "O aluno manda as fotos pelo link do diário, sem entrar no app.", soNutricao: true },
];

export function temNutricao(p: Pick<PerfilAluno, "modulos">): boolean {
  return p.modulos.includes("nutricao");
}

export function ajustesVisiveis(p: Pick<PerfilAluno, "modulos">): DefAjuste[] {
  return AJUSTES.filter((a) => !a.soNutricao || temNutricao(p));
}

/** Aviso embaixo do ajuste (o que muda de verdade para ESTE aluno). */
export function observacaoDoAjuste(chave: ChaveAjuste, p: Pick<PerfilAluno, "tem_login" | "telefone" | "ajustes">): string | null {
  if (chave === "acesso_app" && !p.tem_login) return "Ele ainda não tem login: crie o acesso no card Acesso do aluno.";
  if (chave === "mensagens_automaticas" && !whatsappDoAluno(p.telefone)) return "Sem telefone no cadastro: nenhuma mensagem sai.";
  if (chave === "acesso_link" && !p.ajustes.diario_alimentar) return "Vale quando o diário alimentar estiver ligado.";
  return null;
}

/** O link do diário funciona? (os 2 ajustes ligados) */
export function linkLigado(a: AjustesAluno): { ligado: boolean; motivo: string | null } {
  if (!a.diario_alimentar) return { ligado: false, motivo: "O diário alimentar está desligado nos ajustes." };
  if (!a.acesso_link) return { ligado: false, motivo: "O envio de fotos pelo link está desligado nos ajustes." };
  return { ligado: true, motivo: null };
}

/** Texto para mandar o link ao aluno. */
export function textoDoLink(nome: string | null | undefined, link: string): string {
  const primeiro = primeiroNome(nome);
  return `${primeiro ? `Oi, ${primeiro}! ` : ""}Este é o link do seu diário alimentar: mande por ele as fotos das suas refeições.\n${link}`;
}

// ───────────────────────── Fluxo de consulta (os 7 atalhos do site antigo) ─────────────────────────

export interface AtalhoFluxo {
  chave: string;
  rotulo: string;
  /** aba do perfil do aluno (Physiq) e o parâmetro que ela lê para abrir o formulário novo */
  aba: "prontuario" | "avaliacao" | "dieta" | null;
  parametro: string;
  /** a página do painel (Agenda) */
  pagina?: "Agenda";
}

export const ATALHOS_FLUXO: AtalhoFluxo[] = [
  { chave: "consulta", rotulo: "Registrar consulta", aba: "prontuario", parametro: "nova=consulta" },
  { chave: "agendar", rotulo: "Agendar", aba: null, parametro: "novo=1", pagina: "Agenda" },
  { chave: "anamnese", rotulo: "Anamnese", aba: "prontuario", parametro: "nova=anamnese" },
  { chave: "antropometria", rotulo: "Antropometria", aba: "avaliacao", parametro: "nova=antropometria" },
  { chave: "planejamento", rotulo: "Planejamento", aba: "dieta", parametro: "novo=plano" },
  { chave: "orientacao", rotulo: "Orientação", aba: "dieta", parametro: "nova=orientacao" },
  { chave: "manipulados", rotulo: "Manipulados", aba: "dieta", parametro: "novo=manipulado" },
];

/**
 * Para onde o atalho leva: a aba do perfil do aluno (ou a Agenda) com o parâmetro que abre o formulário novo. W28: o fallback da
 * seção do aluno no site antigo do Nutri saiu (todas as abas e a Agenda existem no Physiq; o site antigo redireciona para cá).
 */
export function rotaDoAtalho(a: AtalhoFluxo, rotaAluno: string, pacienteId: string): string {
  if (a.pagina) return `/painel/agenda?aluno=${encodeURIComponent(pacienteId)}&${a.parametro}`;
  return `${rotaAluno}/${a.aba}?${a.parametro}`;
}

// ───────────────────────── ações da W13 (Bloquear, Desativar, Remover) no perfil ─────────────────────────

/** O perfil no formato da linha da lista da W13 (as mesmas ações e confirmações: AcoesAluno/ConfirmarAcao). */
export function linhaDoPerfil(p: PerfilAluno): AlunoLinha {
  return {
    id: p.paciente_id,
    rota_id: p.rota_id,
    treino_user_id: p.treino_user_id,
    tem_login: p.tem_login,
    nome: p.nome,
    email: p.email,
    telefone: p.telefone,
    foto_url: p.foto_url,
    tags: p.tags,
    ativo: p.ativo,
    bloqueado: p.bloqueado,
    bloqueado_em: p.bloqueado_em,
    bloqueio_msg: p.bloqueio_msg,
    conta_excluida: p.conta_excluida,
    origem: p.origem,
    criado_em: p.criado_em ?? "",
    atualizado_em: p.atualizado_em ?? "",
    modulos: p.modulos,
    personal: p.personal,
    nutricionista: p.nutricionista,
    pagamento: null,
    comprovante: false,
    sou_eu: false,
  };
}

// ───────────────────────── aviso único da P15 ─────────────────────────

/**
 * "1 aluno está com as mensagens…" / "3 alunos estão com as mensagens…" (o número = a lista do "Ver quais"). W23: a lista é dos
 * alunos de quem a pessoa é a nutricionista OU o personal — "alunos", o nome do Physiq para os 2 módulos.
 */
export function textoMensagensDesligadas(n: number): string {
  return n === 1
    ? "1 aluno está com as mensagens automáticas do WhatsApp desligadas."
    : `${n} alunos estão com as mensagens automáticas do WhatsApp desligadas.`;
}

// ───────────────────────── H4 (ajustes da revisão final) ─────────────────────────

/**
 * C57/N-5: as abas do perfil seguem os módulos da conta ATIVA (o menu do painel); o master que abre aluno de OUTRA conta (ou sem
 * conta ativa) vê as abas pela conta do aluno — o banco já deixa o master ler (pode_mexer_no_acesso). Sem conta conhecida, a regra
 * de sempre: os módulos da conta ativa (ou só Treino, o padrão do menu).
 */
export function modulosDoPerfil(
  ativa: { id: string; modulos: readonly ModuloAluno[] } | null | undefined,
  perfil: Pick<PerfilAluno, "conta_id" | "conta_modulos"> | null | undefined,
  master: boolean,
): ModuloAluno[] {
  if (master && perfil?.conta_id && perfil.conta_id !== ativa?.id && perfil.conta_modulos?.length) return [...perfil.conta_modulos];
  return ativa?.modulos?.length ? [...ativa.modulos] : ["treino"];
}

/**
 * N-27: o atalho "Ver diário" (o "Ver diário do paciente" do Nutri) só para quem abre o Diário da conta e enxerga as fotos deste
 * aluno nele — a regra clínica da W18/W24: nutricionista da conta ATIVA com o módulo Nutrição (ou o master), o aluno da MESMA conta
 * e com Nutrição. O Diário lista a conta ativa: o de outra conta abriria vazio.
 */
export function podeVerDiarioDoAluno(
  ativa: { id: string; papeis?: readonly string[]; modulos?: readonly string[] } | null | undefined,
  perfil: Pick<PerfilAluno, "conta_id" | "modulos">,
  master: boolean,
): boolean {
  if (!ativa || !perfil.conta_id || perfil.conta_id !== ativa.id || !(perfil.modulos ?? []).includes("nutricao")) return false;
  return master || ((ativa.papeis ?? []).includes("nutricionista") && (ativa.modulos ?? []).includes("nutricao"));
}

/** Dietas › Diário só deste aluno (a página aceita ?aluno=<matrícula> — W24), no período padrão de 7 dias. */
export function rotaDoDiarioDoAluno(pacienteId: string): string {
  return `/painel/dietas?aba=diario&aluno=${encodeURIComponent(pacienteId)}`;
}

/**
 * N-64: o resumo que a trava do app lê (financeiro_do_aluno — a regra R15/P13, travaDoInadimplente), montado do Financeiro do aluno
 * que o painel já carrega (prof_aluno). null = quem olha não enxerga a mensalidade (P6: só o dono e o master) — sem ela o selo
 * mentiria, então não aparece.
 */
export function resumoDaTrava(d: FinanceiroProfissional): ResumoMatricula | null {
  if (!d.permissoes.mensalidade) return null;
  const m = d.mensalidade;
  return {
    paciente_id: d.aluno.paciente_id,
    conta_id: d.aluno.conta_id,
    conta_nome: d.aluno.conta_nome,
    recebimento_modo: d.conta.modo,
    bloquear_inadimplente: d.conta.bloquear,
    tem_chave: !!d.conta.chave,
    profissional: null,
    mensalidade_valor: m?.valor ?? null,
    plano_nome: m?.plano ?? null,
    pausada: !!m?.pausada,
    pago_ate: m?.pago_ate ?? null,
    desde: m?.desde ?? null,
    aguardando: d.cobrancas.some((c) => c.tipo === "mensalidade" && c.status === "aguardando_confirmacao"),
    assinatura_ativa: d.assinatura?.status === "authorized",
    abertas: d.cobrancas.filter((c) => c.status === "aberta").map((c) => ({ id: c.id, descricao: c.descricao, valor: c.valor, vencimento: c.vencimento })),
    aguardando_avulsas: d.cobrancas.filter((c) => c.tipo === "avulsa" && c.status === "aguardando_confirmacao").length,
    app: d.conta.origem === "app",
    teste_ate: m?.teste_ate ?? null,
  };
}

/** N-64: o selo "BLOQUEADO (pagamento)" — o app deste aluno está fechado pela mensalidade (a trava da conta, sem mudar a regra). */
export function bloqueadoPorPagamento(d: FinanceiroProfissional | null | undefined, ativo: boolean, agora: Date = new Date()): boolean {
  if (!d || !ativo) return false;
  const r = resumoDaTrava(d);
  return !!r && travaDoInadimplente(r, agora);
}

/**
 * N-45: o Financeiro do aluno mostra os 12 lançamentos mais recentes; "Ver todos (N)" abre a lista inteira — hml-14d (B21): em páginas
 * de 20 do banco (?pagina_lancamentos=), sem o teto de 500 de antes.
 */
export const LANCAMENTOS_VISIVEIS = 12;

/**
 * N-45: "Editar, estornar ou excluir" (o "Abrir no Financeiro" do Nutri): Painel › Financeiro › Lançamentos com a busca pelo nome do
 * aluno e o período do 1º lançamento dele até hoje (sem o período, a tela abre nos últimos 30 dias).
 */
export function rotaDosLancamentosDoAluno(nome: string, datas: readonly string[], hoje: string): string {
  const validas = datas.map((d) => (d || "").slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const q = new URLSearchParams({ aba: "lancamentos" });
  if (nome.trim()) q.set("q", nome.trim());
  if (validas.length) {
    q.set("de", validas[0] < hoje ? validas[0] : hoje);
    q.set("ate", validas[validas.length - 1] > hoje ? validas[validas.length - 1] : hoje);
  }
  return `/painel/financeiro?${q.toString()}`;
}
