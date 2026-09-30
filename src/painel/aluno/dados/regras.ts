/**
 * Perfil do aluno no painel (W14) — regras PURAS (sem rede): a linha do cabeçalho da tela 7, o formulário "Editar dados", os 4
 * ajustes (R12) com os textos novos (F1: "envio de fotos pelo link"), o link do diário e os 7 atalhos do "Fluxo de consulta".
 */
import { rotuloObjetivo } from "@/app-aluno/sozinho/regras";
import { formatarTelefone, type AlunoLinha } from "@/painel/alunos/regras";
import type { AjustesAluno, ChaveAjuste, FormDadosAluno, Genero, PerfilAluno, PerfilTreinoAluno } from "./tipos";

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
  if (c.includes("genero_invalido")) return "Escolha o sexo.";
  if (c.includes("cpf_invalido")) return "Confira o CPF.";
  if (c.includes("telefone_invalido")) return "O telefone precisa ter DDD e 8 ou 9 números.";
  if (c.includes("email_invalido")) return "Confira o e-mail.";
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
  arquivoAba: "Prontuario" | "Avaliacao" | "Dieta" | null;
  parametro: string;
  /** a página do painel (Agenda) */
  pagina?: "Agenda";
  /** a seção do site antigo (enquanto a aba nova não existe) */
  secaoAntiga: string;
}

export const ATALHOS_FLUXO: AtalhoFluxo[] = [
  { chave: "consulta", rotulo: "Registrar consulta", aba: "prontuario", arquivoAba: "Prontuario", parametro: "nova=consulta", secaoAntiga: "consultas" },
  { chave: "agendar", rotulo: "Agendar", aba: null, arquivoAba: null, parametro: "novo=1", pagina: "Agenda", secaoAntiga: "agenda" },
  { chave: "anamnese", rotulo: "Anamnese", aba: "prontuario", arquivoAba: "Prontuario", parametro: "nova=anamnese", secaoAntiga: "anamnese" },
  { chave: "antropometria", rotulo: "Antropometria", aba: "avaliacao", arquivoAba: "Avaliacao", parametro: "nova=antropometria", secaoAntiga: "antropometria" },
  { chave: "planejamento", rotulo: "Planejamento", aba: "dieta", arquivoAba: "Dieta", parametro: "novo=plano", secaoAntiga: "planejamento" },
  { chave: "orientacao", rotulo: "Orientação", aba: "dieta", arquivoAba: "Dieta", parametro: "nova=orientacao", secaoAntiga: "orientacoes" },
  { chave: "manipulados", rotulo: "Manipulados", aba: "dieta", arquivoAba: "Dieta", parametro: "novo=manipulado", secaoAntiga: "manipulados" },
];

export interface DestinoAtalho {
  /** rota interna do Physiq (a aba nova ou a página nova) */
  rota: string | null;
  /** o site antigo do Nutri (abre em outra aba) */
  externo: string | null;
}

/** Para onde o atalho leva: a aba/página nova do Physiq quando existe; senão, a seção do aluno no site antigo do Nutri. */
export function destinoDoAtalho(a: AtalhoFluxo, rotaAluno: string, pacienteId: string, existeAba: (arquivo: string) => boolean,
  existePagina: (nome: string) => boolean, siteAntigo: string): DestinoAtalho {
  if (a.pagina) {
    if (existePagina(a.pagina)) return { rota: `/painel/agenda?aluno=${encodeURIComponent(pacienteId)}&${a.parametro}`, externo: null };
    return { rota: null, externo: `${siteAntigo}/agenda?paciente=${encodeURIComponent(pacienteId)}` };
  }
  if (a.aba && a.arquivoAba && existeAba(a.arquivoAba)) return { rota: `${rotaAluno}/${a.aba}?${a.parametro}`, externo: null };
  return { rota: null, externo: `${siteAntigo}/pacientes/${encodeURIComponent(pacienteId)}/${a.secaoAntiga}` };
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

/** "1 paciente está com as mensagens…" / "3 pacientes estão com as mensagens…" (o número = a lista do "Ver quais"). */
export function textoMensagensDesligadas(n: number): string {
  return n === 1
    ? "1 paciente está com as mensagens automáticas do WhatsApp desligadas."
    : `${n} pacientes estão com as mensagens automáticas do WhatsApp desligadas.`;
}
