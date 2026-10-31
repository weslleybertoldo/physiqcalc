// Physiq W27 — regras PURAS das funções do painel master (master-contas, master-financeiro, master-planos). Sem Deno e sem rede:
// testadas no Vitest (src/master/servidor.test.ts). A regra de negócio mora no banco (funções master_* da migração
// 20261002010000_w27_master.sql, que conferem o master de novo); aqui: quem é master, o que cada ação recebe e o status HTTP.

export type Schema = "public" | "staging";
export const SCHEMAS: Schema[] = ["public", "staging"];
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

/** Schema do pedido (header x-schema); inválido = null (a função responde 400). */
export function schemaDoPedido(valor: string | null | undefined): Schema | null {
  const s = (valor || "public").trim().toLowerCase();
  return (SCHEMAS as string[]).includes(s) ? (s as Schema) : null;
}

/**
 * É master? A mesma regra do sou_master() do banco: o papel no JWT (app_metadata.role, o Auth é um só para os 2 schemas) ou o
 * perfil master DESTE schema. O app_metadata vem do Auth pelo service_role (não do token, que pode estar velho).
 */
export function ehMaster(appMetadata: Record<string, unknown> | null | undefined, papelPerfil: string | null | undefined): boolean {
  return (appMetadata?.role as string | undefined) === "master" || papelPerfil === "master";
}

/** hml-22 (H-22) — um fator do Auth como o GoTrue devolve em `user.factors` (o GET /auth/v1/user e o admin getUserById). */
export interface FatorDoAuth {
  status?: string | null;
}

/** hml-22 — tem fator verificado? Qualquer fator `verified` (hoje só o TOTP está ligado): o mesmo critério do GoTrue e do banco. */
export function temFatorVerificado(fatores: unknown): boolean {
  return Array.isArray(fatores) && fatores.some((f) => !!f && typeof f === "object" && (f as FatorDoAuth).status === "verified");
}

/**
 * hml-22 (H-22) — a regra do master_aal_ok() do banco (migração 20261014200000_hml22_master_2fa.sql), na mesma ordem: o token aal2
 * (o código do app autenticador) basta; fora do aal2, só quem NÃO tem fator verificado (hoje, todo mundo: o fator do master é o
 * interruptor). Os fatores vêm do Auth (fresco), o aal vem do token.
 */
export function masterComAal(fatores: unknown, aal: unknown): boolean {
  return aal === "aal2" || !temFatorVerificado(fatores);
}

/**
 * hml-22 (revisão 🟡1) — o que a porta das master-* decide depois do login, NA ORDEM, falhando FECHADA: sem a leitura do Auth (erro ou
 * resposta sem o usuário) não dá para saber nem o papel nem o fator → "auth_indisponivel" (503), antes de qualquer ação com a chave de
 * serviço. "Sem a chave factors" só conta como "sem fator" quando a leitura DEU CERTO (o GoTrue omite a chave de quem não tem fator).
 * Depois: não é master → "so_master"; master com fator e sem aal2 → "precisa_2fa".
 */
export type DecisaoPorta = "ok" | "auth_indisponivel" | "so_master" | "precisa_2fa";

export function decidirPorta(p: {
  authErro: unknown;
  usuario: { app_metadata?: Record<string, unknown> | null; factors?: unknown } | null | undefined;
  papelPerfil: string | null | undefined;
  aal: unknown;
}): DecisaoPorta {
  if (p.authErro || !p.usuario) return "auth_indisponivel";
  if (!ehMaster(p.usuario.app_metadata ?? null, p.papelPerfil)) return "so_master";
  if (!masterComAal(p.usuario.factors, p.aal)) return "precisa_2fa";
  return "ok";
}

/**
 * hml-08 (H-22): o painel master é só do site — o app (o WebView do Android serve em https://localhost; o do iOS, em
 * capacitor://localhost) recebe 403 "so_no_site". Serve para desligar o master dos APKs antigos (≤ 3.71), que ainda têm o código;
 * quem põe o Origin é o navegador (um curl manda qualquer um), então a barreira de verdade é o 2FA do master.
 */
export const ORIGENS_DO_APP = ["https://localhost", "capacitor://localhost"];

export function origemDoApp(origin: string | null | undefined): boolean {
  return typeof origin === "string" && ORIGENS_DO_APP.includes(origin);
}

/**
 * Contas de TESTE (P26): o staging só cria/aceita estas (o Auth é o mesmo da produção). Igual ao criar_minha_conta (W4) e à
 * emailDeTeste de login-regras.ts: SÓ *teste*@physiqcalc.com.br (31/10/2026: saíram o teste@teste.com e os domínios .app).
 */
export function emailDeTeste(email: string | null | undefined): boolean {
  const e = (email || "").trim().toLowerCase();
  return /^[a-z0-9._+-]*teste[a-z0-9._+-]*@physiqcalc\.com\.br$/.test(e);
}

export function emailValido(email: string | null | undefined): boolean {
  const e = (email || "").trim();
  return e.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
}

export const TIPOS_PERFIL = ["personal", "nutricionista", "academico", "outra_area"] as const;
export type TipoPerfil = (typeof TIPOS_PERFIL)[number];
export const PLANOS = ["treino", "nutricao", "treino_nutricao"] as const;
export const FAIXAS = ["f10", "f30", "f100", "livre"] as const;

export interface PedidoCriarConta {
  email: string;
  nome: string;
  nome_conta: string;
  tipo: TipoPerfil;
  registro: string | null;
  plano: (typeof PLANOS)[number];
  faixa: (typeof FAIXAS)[number];
  isentar: boolean;
  motivo: string | null;
  /** "senha" = o master cria o login com e-mail e senha (N-8); "google" = a pessoa entra com o Google nesse e-mail */
  modo: "senha" | "google";
  senha: string | null;
}

/** Confere o pedido de "Nova conta" (N-8/N-22). Devolve o pedido limpo ou o código do erro (a tela traduz). */
export function lerPedidoCriarConta(corpo: Record<string, unknown>, schema: Schema): { ok: true; pedido: PedidoCriarConta } | { ok: false; erro: string } {
  const email = String(corpo.email ?? "").trim().toLowerCase();
  const nome = String(corpo.nome ?? "").trim().slice(0, 80);
  const nomeConta = String(corpo.nome_conta ?? "").trim().slice(0, 80) || nome;
  const tipo = String(corpo.tipo ?? "").trim() as TipoPerfil;
  const plano = String(corpo.plano ?? "treino_nutricao") as PedidoCriarConta["plano"];
  const faixa = String(corpo.faixa ?? "f10") as PedidoCriarConta["faixa"];
  const modo = corpo.modo === "google" ? "google" : "senha";
  const senha = typeof corpo.senha === "string" ? corpo.senha : null;
  const isentar = corpo.isentar === true;
  const motivo = typeof corpo.motivo === "string" && corpo.motivo.trim() ? corpo.motivo.trim().slice(0, 200) : null;
  const registro = typeof corpo.registro === "string" && corpo.registro.trim() ? corpo.registro.trim().slice(0, 30) : null;
  if (!emailValido(email)) return { ok: false, erro: "email_invalido" };
  if (schema === "staging" && !emailDeTeste(email)) return { ok: false, erro: "conta_real_no_staging" };
  if (nome.length < 2) return { ok: false, erro: "nome_invalido" };
  if (nomeConta.length < 2) return { ok: false, erro: "nome_invalido" };
  if (!(TIPOS_PERFIL as readonly string[]).includes(tipo)) return { ok: false, erro: "tipo_invalido" };
  if (!(PLANOS as readonly string[]).includes(plano) || !(FAIXAS as readonly string[]).includes(faixa)) return { ok: false, erro: "plano_invalido" };
  if (modo === "senha" && (!senha || senha.length < 8 || senha.length > 72)) return { ok: false, erro: "senha_curta" };
  if (isentar && (!motivo || motivo.length < 3)) return { ok: false, erro: "motivo_obrigatorio" };
  return { ok: true, pedido: { email, nome, nome_conta: nomeConta, tipo, registro, plano, faixa, isentar, motivo, modo, senha: modo === "senha" ? senha : null } };
}

/** Ações de conta que o banco aceita (master_conta_acao). */
export const ACOES_CONTA = ["plano", "vencimento", "liberar", "isentar", "tirar_isencao", "suspender", "reativar",
  "bloquear_alunos", "desbloquear_alunos", "recebimento", "excluir"] as const;
export type AcaoConta = (typeof ACOES_CONTA)[number];

export function ehAcaoConta(v: unknown): v is AcaoConta {
  return typeof v === "string" && (ACOES_CONTA as readonly string[]).includes(v);
}

/** Lista de ids (uuid) de um campo do corpo (até `max`); o que não é uuid fica de fora. */
export function idsDe(v: unknown, max = 200): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map(String).filter((x) => UUID.test(x)))].slice(0, max);
}

/** Status HTTP de cada erro do banco (o corpo leva o código; a tela traduz). */
export function statusDoErro(erro: unknown): number {
  switch (String(erro ?? "")) {
    case "sem_login":
      return 401;
    case "so_master":
    case "so_no_site":
    case "precisa_2fa":
    case "nao_pode_a_si_mesmo":
      return 403;
    case "conta_inexistente":
    case "aluno_inexistente":
    case "usuario_inexistente":
    case "prato_inexistente":
    case "preco_inexistente":
      return 404;
    case "muitas_acoes":
      return 429;
    case "auth_indisponivel":
      return 503;
    case "erro_interno":
      return 500;
    case "mp_error":
      return 502;
    default:
      return 400;
  }
}

/** Texto do aviso "Reenviar aviso" (sino do dono): o vencimento que vale hoje, sem mandar mensagem a mais ninguém. */
export function textoDoAvisoDePlano(c: { situacao_efetiva?: string | null; vence_em?: string | null; teste_ate?: string | null }, mensagem?: string | null): string {
  const m = (mensagem || "").trim();
  if (m) return m.slice(0, 160);
  const data = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
  if (c.situacao_efetiva === "vencida") return `Seu plano do Physiq venceu${c.vence_em ? ` em ${data(c.vence_em)}` : ""}. Pague em Configurações › Plano para liberar o painel.`;
  if (c.situacao_efetiva === "teste") return `Seu teste grátis do Physiq vai até ${data(c.teste_ate)}. Escolha o plano em Configurações › Plano.`;
  return `Seu plano do Physiq vence em ${data(c.vence_em)}. Confira em Configurações › Plano.`;
}
