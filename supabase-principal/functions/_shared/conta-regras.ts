// Physiq hml-21a (H-43 · jeito 2, etapa 3, 12/10/2026) — regras PURAS da função conta (banco principal): sem Deno e sem rede; usadas pela
// função (supabase-principal/functions/conta/) e testadas no Vitest (src/conta/contaServidor.test.ts).
// O desenho (spec hml-21 §2.1–§2.2, o molde da hml-19): a tela chama UMA ação; a função grava com a SESSÃO de quem chama (o RLS e as RPCs
// de hoje decidem quem pode — 2ª camada) e aqui fica a FORMA:
//   · a lista fechada de ações, por módulo (casca: o sino, a sessão, o push, o aceite e o onboarding; app: o perfil e a foto do aluno e o
//     objetivo do plano do app) — moduloDoPedido despacha; o `ler` vai ao motor comum (_shared/leitura-servidor.ts);
//   · o corpo de cada ação em lista fechada (CORPOS_DAS_ACOES, no formato dos params do motor — _shared/leitura-lote.ts): cada chave com o
//     tipo e o teto; a chave que a ação não declara CAI (user_id, destino_user_id, nutricionista_id, dono_id, dados_profissionais… nunca
//     chegam ao banco); a chave declarada fora da forma → dados_invalidos (nada roda);
//   · o dono vem do user do token (c.userId), nunca do corpo: as 2 gravações no `avisos` só mexem no lido_em e só das linhas com
//     destino_user_id = quem chama; o profiles é o de quem chama (id = user);
//   · as RPCs que já existem passam a ser chamadas pelo servidor COMO A PESSOA, com os MESMOS argumentos de hoje (o SQL não muda);
//   · a foto do perfil (bucket fotos-perfil/-staging, §2.5): o caminho nasce AQUI na pasta de quem chama (<user>/foto-<agora>.<ext>, o
//     formato do caminhoFoto da tela), com os limites da tela (JPG/PNG/WebP até 5 MB — o file_size_limit e os tipos do bucket); o salvar
//     só aceita esse formato na pasta de quem chama (fora → dados_invalidos, N8), grava a URL pública como hoje (o domínio próprio da API —
//     o host que o CSP do site libera) e apaga a foto ANTERIOR (a que a URL de antes apontava, se é da pasta de quem chama — achado 2);
//   · a tradução do erro do banco: a do motor (erroDaLeitura — a MESMA tabela do erroDoBanco da nutricao): 42501 → 403 sem_acesso, 23505 →
//     409 conflito, dado ruim → 400 dados_invalidos, PGRST301-303 → 401 sem_login, o tempo → 504 tempo_esgotado, o resto → 500 erro_interno
//     (a função avisa: log.excecao); a mensagem do banco nunca vai à tela.
import { erroDaLeitura, lerParams, type ParamsLeitura } from "./leitura-lote.ts";
import { AVISOS_MAX, TEXTO_CURTO_MAX } from "./conta-leituras.ts";

// ───────────────────────── os tetos (acima do que as telas aceitam: a função barra o abuso, a RPC/o banco decide o valor) ─────────────────────────
/** O texto de uma versão (a do aviso de mudança e a dos textos legais; o app manda "1", "2026-10-08"…). */
export const VERSAO_MAX = 40;
/** O token do FCM (a push_registrar aceita até 4096). */
export const TOKEN_PUSH_MAX = 4096;
/** A versão do app que o push e o aceite gravam (a RPC corta em 32/20). */
export const VERSAO_APP_MAX = 64;
/** O nome da conta e o registro do onboarding (a tela: 80 e livre; a RPC corta em 80 e 30). */
export const NOME_CONTA_MAX = 200;
/** O nome do perfil (a tela: 80). */
export const NOME_PERFIL_MAX = 200;
/** O caminho da foto que o salvar recebe (o formato do preparar tem ~70). */
export const CAMINHO_FOTO_MAX = 300;
/** A foto do perfil: até 5 MB (o validarFoto da tela e o file_size_limit do bucket, migration 20260929120000_w05_equipe). */
export const FOTO_MAX_BYTES = 5 * 1024 * 1024;
/** Os tipos da foto (os da tela e os allowed_mime_types do bucket) → a extensão do arquivo (a do caminhoFoto da tela). */
export const TIPOS_DE_FOTO: Readonly<Record<string, string>> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// ───────────────────────── as ações ─────────────────────────
/** A casca: o sino (2), a sessão (2), o push (2), o aceite dos textos e o onboarding (as 2 Boas-vindas). */
export const ACOES_DA_CASCA = [
  "avisos_marcar_lidos", "aviso_membro_ok", "aviso_mudanca_marcar", "senha_definida", "push_registrar", "push_esquecer", "aceitar_textos",
  "criar_minha_conta", "entrar_sem_profissional",
] as const;
/** O app do aluno: o nome e a foto do perfil e o objetivo do plano do app. */
export const ACOES_DO_APP = ["perfil_nome", "perfil_foto_preparar", "perfil_foto_salvar", "perfil_foto_tirar", "mudar_objetivo_app"] as const;
export type AcaoDaCasca = (typeof ACOES_DA_CASCA)[number];
export type AcaoDoApp = (typeof ACOES_DO_APP)[number];
export type AcaoConta = AcaoDaCasca | AcaoDoApp;
export const ACOES_DA_CONTA: readonly AcaoConta[] = [...ACOES_DA_CASCA, ...ACOES_DO_APP];

const texto = (max: number, obrigatorio = false) => ({ tipo: "texto", max, obrigatorio }) as const;
const data = { tipo: "data" } as const;

/**
 * O corpo de cada ação: as chaves que ela aceita, com o tipo e o teto (o formato dos params do motor). O que não está aqui cai. Os textos
 * que a RPC confere (a origem, o tipo de perfil, o objetivo, a plataforma) vão como texto: a RPC decide e devolve o código de hoje.
 */
export const CORPOS_DAS_ACOES = {
  // o sino ao abrir: os não lidos da lista (até os 30 do sino) — só o lido_em, só os da pessoa
  avisos_marcar_lidos: { ids: { tipo: "uuids", max: AVISOS_MAX, obrigatorio: true } },
  // o "Entendi" do aviso de membro removido
  aviso_membro_ok: { id: { tipo: "uuid", obrigatorio: true } },
  // o aviso de mudança visto (marcar_aviso_mudanca(p_versao))
  aviso_mudanca_marcar: { versao: texto(VERSAO_MAX) },
  // a marca de senha provisória sai depois do auth.updateUser (que fica no navegador: é o login)
  senha_definida: {},
  // o aparelho do push (APK): o token do FCM, a plataforma e a versão do app
  push_registrar: { token: texto(TOKEN_PUSH_MAX, true), plataforma: texto(TEXTO_CURTO_MAX), versao: texto(VERSAO_APP_MAX) },
  // no "Sair": o aparelho deixa de receber os avisos desta pessoa
  push_esquecer: { token: texto(TOKEN_PUSH_MAX, true) },
  // o aceite dos textos no acesso (aceitar_no_acesso): a versão lida, a origem (site/apk/loja), o consentimento de saúde e a data de nascimento
  aceitar_textos: { versao: texto(VERSAO_MAX, true), origem: texto(TEXTO_CURTO_MAX, true), saude: { tipo: "booleano" }, nascimento: data, versao_app: texto(VERSAO_APP_MAX) },
  // Boas-vindas › "Sou profissional": o nome da conta, o tipo de perfil e o registro (CRN/CREF)
  criar_minha_conta: { nome: texto(NOME_CONTA_MAX, true), tipo: texto(TEXTO_CURTO_MAX, true), registro: texto(NOME_CONTA_MAX) },
  // Boas-vindas › "Treinar sem profissional": o objetivo e o plano (+ a data de nascimento, o consentimento e a origem — os 3 juntos, hml-12)
  entrar_sem_profissional: {
    objetivo: texto(TEXTO_CURTO_MAX, true), plano: texto(TEXTO_CURTO_MAX, true), nascimento: data, consentimento: texto(TEXTO_CURTO_MAX),
    origem: texto(TEXTO_CURTO_MAX),
  },
  // Perfil › Conta: o nome
  perfil_nome: { nome: texto(NOME_PERFIL_MAX, true) },
  // Perfil › Conta: o link de upload da foto nova (o servidor decide o caminho, na pasta de quem chama)
  perfil_foto_preparar: {
    tipo: { tipo: "enum", valores: Object.keys(TIPOS_DE_FOTO), obrigatorio: true },
    tamanho: { tipo: "inteiro", min: 1, max: FOTO_MAX_BYTES, obrigatorio: true },
  },
  // Perfil › Conta: a foto que subiu (o caminho que o preparar devolveu)
  perfil_foto_salvar: { caminho: texto(CAMINHO_FOTO_MAX, true) },
  // Perfil › Conta: "Tirar"
  perfil_foto_tirar: {},
  // Meu plano: o objetivo do plano do app
  mudar_objetivo_app: { objetivo: texto(TEXTO_CURTO_MAX, true) },
} as const satisfies Record<AcaoConta, ParamsLeitura>;

/** As chaves que a ação aceita, conferidas (as de fora caem); uma declarada fora da forma → dados_invalidos (o nome dela vai ao log). */
export function lerCorpoDaAcao(
  acao: AcaoConta,
  corpo: Record<string, unknown>,
): { ok: true; valores: Record<string, unknown> } | { ok: false; erro: "dados_invalidos"; campo: string } {
  const r = lerParams(corpo, CORPOS_DAS_ACOES[acao] as ParamsLeitura);
  return r.ok === true ? r : { ok: false, erro: "dados_invalidos", campo: r.campo };
}

/** Os 3 dados do plano sem profissional da hml-12 (a sobrecarga de 5 argumentos) — juntos ou nenhum. */
export const EXTRAS_SEM_PROFISSIONAL = ["nascimento", "consentimento", "origem"] as const;

/**
 * Os args da entrar_sem_profissional: sem os extras, a de 2 argumentos (o app antigo — que, com os textos ligados, responde
 * atualize_o_app); com os 3, a de 5 (a idade e o consentimento conferidos no banco); parte deles → null (dados_invalidos: a tela manda os 3).
 */
export function argsSemProfissional(v: Record<string, unknown>): Record<string, unknown> | null {
  const vieram = EXTRAS_SEM_PROFISSIONAL.filter((k) => v[k] !== undefined);
  if (vieram.length === 0) return { p_objetivo: v.objetivo, p_plano: v.plano };
  if (vieram.length !== EXTRAS_SEM_PROFISSIONAL.length) return null;
  return { p_objetivo: v.objetivo, p_plano: v.plano, p_nascimento: v.nascimento, p_consentimento: v.consentimento, p_origem: v.origem };
}

// ───────────────────────── o despacho ─────────────────────────
export type PedidoConta = { modulo: "leitura"; acao: "ler" } | { modulo: "casca"; acao: AcaoDaCasca } | { modulo: "app"; acao: AcaoDoApp };

/** O módulo e a ação do pedido (null = acao_invalida). O `ler` vai ao motor comum; as 2 listas não se cruzam (o teste confere). */
export function moduloDoPedido(corpo: Record<string, unknown>): PedidoConta | null {
  const v = corpo.acao;
  if (v === "ler") return { modulo: "leitura", acao: "ler" };
  if (typeof v !== "string") return null;
  if ((ACOES_DA_CASCA as readonly string[]).includes(v)) return { modulo: "casca", acao: v as AcaoDaCasca };
  if ((ACOES_DO_APP as readonly string[]).includes(v)) return { modulo: "app", acao: v as AcaoDoApp };
  return null;
}

// ───────────────────────── a foto do perfil ─────────────────────────
/**
 * O domínio próprio da API do principal (o Worker api-principal — docs/api-dominio-proprio.md): a URL pública da foto é montada com ele,
 * como o getPublicUrl que a tela fazia com o VITE_PRINCIPAL_URL dos builds — o CSP do site (img-src) só libera este host do principal.
 * (O mesmo valor do URL_API_PROPRIA do _shared/mp-conta-regras.ts.)
 */
export const URL_API_PROPRIA = "https://api-principal.physiqcalc.com.br";

/** O bucket das fotos do perfil no ambiente (o BUCKET_FOTOS_PERFIL da tela: fotos-perfil-staging no staging). */
export const bucketDasFotos = (schema: "public" | "staging"): string => (schema === "staging" ? "fotos-perfil-staging" : "fotos-perfil");

/** O caminho da foto nova: <user>/foto-<agora em ms>.<ext> — o MESMO formato do caminhoFoto da tela (a pasta é a de quem chama). */
export function caminhoDaFoto(userId: string, tipo: string, agora: number): string {
  return `${userId}/foto-${Math.max(0, Math.trunc(agora))}.${TIPOS_DE_FOTO[tipo] ?? "jpg"}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ARQUIVO_DA_FOTO = /^foto-\d{1,16}\.(?:jpg|png|webp)$/;

/** O caminho que o salvar aceita: EXATAMENTE o formato que o preparar monta, na pasta de quem chama (nada de ../, subpasta, outra pasta). */
export function caminhoDaPropriaPasta(caminho: unknown, userId: string): caminho is string {
  if (typeof caminho !== "string" || caminho.length > CAMINHO_FOTO_MAX || !UUID.test(userId)) return false;
  const corte = caminho.indexOf("/");
  return corte > 0 && caminho.slice(0, corte) === userId && ARQUIVO_DA_FOTO.test(caminho.slice(corte + 1));
}

/**
 * A URL pública do arquivo — o getPublicUrl do supabase-js (encodeURI de <base>/storage/v1/object/public/<bucket>/<caminho>), com a base
 * do domínio próprio. O teste confere que é IGUAL à do supabase-js do app.
 */
export function urlPublicaDaFoto(bucket: string, caminho: string, base: string = URL_API_PROPRIA): string {
  return encodeURI(`${base.replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/${caminho}`);
}

const NOME_DE_ARQUIVO = /^[A-Za-z0-9._-]{1,200}$/;

/**
 * O caminho da foto ANTERIOR — a que a URL de antes do perfil apontava —, se é DESTE bucket e da pasta de quem chama (um arquivo direto na
 * pasta, nome sem barra); senão null (a foto do Google, outra pasta, outro bucket, lixo: nada a apagar). O host não importa: só o próprio
 * arquivo da pessoa sai (e o RLS do bucket confere de novo: apagar, só na própria pasta).
 */
export function caminhoDaFotoAnterior(url: unknown, bucket: string, userId: string): string | null {
  if (typeof url !== "string" || !url || !UUID.test(userId)) return null;
  let caminho: string;
  try {
    caminho = decodeURI(new URL(url).pathname);
  } catch {
    return null;
  }
  const prefixo = `/storage/v1/object/public/${bucket}/${userId}/`;
  if (!caminho.startsWith(prefixo)) return null;
  const nome = caminho.slice(prefixo.length);
  return NOME_DE_ARQUIVO.test(nome) && nome !== "." && nome !== ".." ? `${userId}/${nome}` : null;
}

/** O dados_profissionais com a foto (a URL nova ou null) — o comFoto da tela (src/painel/configuracoes/perfil/regras.ts): o resto fica. */
export function dadosComFoto(dados: unknown, url: string | null): Record<string, unknown> {
  const base = dados && typeof dados === "object" && !Array.isArray(dados) ? (dados as Record<string, unknown>) : {};
  return { ...base, foto_url: url };
}

/** A URL da foto que está no perfil agora (o foto_url do dados_profissionais), ou null. */
export function fotoDoPerfil(dados: unknown): string | null {
  const v = dados && typeof dados === "object" && !Array.isArray(dados) ? (dados as Record<string, unknown>).foto_url : null;
  return typeof v === "string" && v.trim() ? v : null;
}

// ───────────────────────── erros ─────────────────────────
/** Os códigos que as RPCs da casca levantam de propósito (raise exception 'sem_login': minha_senha_definida, push_registrar, push_esquecer). */
export const ERROS_DAS_RPCS_DA_CONTA = ["sem_login"] as const;

/** Status HTTP de cada erro (o corpo leva { ok: false, erro } e a tela escreve a frase — src/conta/gravar.ts e src/conta/ler.ts). */
export const STATUS_DO_ERRO_CONTA: Record<string, number> = {
  sem_login: 401,
  sem_acesso: 403,
  nao_encontrado: 404,
  metodo: 405,
  conflito: 409,
  corpo_grande: 413,
  muitas_acoes: 429,
  erro_interno: 500,
  storage_falhou: 502,
  tempo_esgotado: 504,
  // 400: acao_invalida, dados_invalidos, schema_invalido, consulta_invalida, lote_grande
};

export function statusDoErroConta(erro: unknown): number {
  return STATUS_DO_ERRO_CONTA[String(erro ?? "")] ?? 400;
}

/**
 * O erro do banco (ou de uma RPC) como o código da resposta: os `conhecidos` (o raise de propósito) passam como estão; o resto, a tabela do
 * motor (a MESMA do erroDoBanco da nutricao). `inesperado` = a função avisa (log.excecao).
 */
export function erroDaConta(e: { code?: unknown; message?: unknown; name?: unknown } | null | undefined, conhecidos: readonly string[] = []): { erro: string; inesperado: boolean } {
  return erroDaLeitura(e, conhecidos);
}
