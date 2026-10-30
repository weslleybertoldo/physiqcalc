/**
 * Physiq restaurar-login (30/10/2026) — "entrar já logado no celular novo", o lado do APP (a peça 4 do desenho: §4.3–4.5; as medidas do
 * Android: fase0.md). A chave de volta do Android (API Restore Credentials — a regra "Zero-Tap Sign-In" da Google Play de abr/2027) mora no
 * plugin nativo RestaurarLoginPlugin (android/app/src/main/java/com/bertoldo/physiqcalc/); o servidor são as funções chave-restauracao (com
 * o login da pessoa: Bearer + x-schema, jeito 2) e restaurar-login (sem login: apikey + x-schema, no molde do entrarSenha.ts).
 *
 *   garantirChave(uid, sid)  com sessão, a situação carregada e sem ser master (o SessaoProvider decide), em segundo plano: opções →
 *                            o plugin cria a chave (nuvem; sem bloqueio de tela/backup → só no aparelho) → registrar (com o `substitui` =
 *                            a chave antiga DESTE aparelho e o aparelho { modelo, android }). Só sem a marca physiq_chave_restauracao:<uid>,
 *                            com ela há mais de 6 meses (a renovação) ou de OUTRA sessão (o session_id do JWT: o servidor amarra a chave à
 *                            sessão que a criou — revisão de segurança, achado 1). Falha = só log; nunca trava o app.
 *   chaveInvalidadaPelaSenha()  a senha trocada pelo próprio app: o servidor apagou as chaves da pessoa (gatilho senha_trocada) → a marca
 *                            sai e o SessaoProvider recria a chave na hora (ouvirChaveInvalidada).
 *   semSessaoNaAbertura()    a abertura SEM sessão: "restaurar" (o celular novo: nada desta instalação no aparelho), "derrubada" (esta
 *                            instalação tinha sessão e chave, e a sessão sumiu do aparelho sem o nosso Sair) ou "nada".
 *   tentarRestaurar(gravar)  o efeito 1 do SessaoProvider, ANTES do pronto: opções → o plugin obtém → entrar → `gravar` (o setSession, que
 *                            fica no SessaoProvider, como o do entrarComEmail — o login é a exceção do jeito 2). Prazos: até a chave 8 s;
 *                            com a chave, o entrar ganha pelo menos 4 s; teto 12 s (PRAZOS_RESTAURAR). A marca physiq_restauracao_tentada
 *                            só com resultado DEFINITIVO (sem chave, entrou, a chave que não vale mais — 401 chave_invalida, a única que
 *                            apaga a chave do aparelho —, a conta recusada, o Android sem a API); o recuo sem marca: servidor desligado
 *                            24 h, fora 1 h, a resposta do Android que não conferiu 7 dias; sem rede, prazo e desafio repetido: na próxima.
 *   esquecerChave(...)       o Sair, ANTES do signOut (a função precisa do login), no máximo 3 s: o servidor apaga TODAS as chaves da
 *                            pessoa (D3 — o Sair é global; no Sair local do master, só a deste aparelho) e o plugin apaga a do aparelho
 *                            (e do backup). Sem internet não espera o servidor.
 *   sessaoDerrubada()        o SIGNED_OUT que não veio do nosso Sair: o plugin apaga a chave do aparelho (a regra 5 da skill oficial).
 * Só no APK Android com o plugin disponível — no site/PWA nada disto roda, menos o apagar no servidor do Sair global (que derruba as
 * sessões dos aparelhos também). `desligado` (a trava do servidor, HTTP 200 ok:false) = não faz nada e não grava marca. Log só com códigos.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { Session } from "@supabase/supabase-js";
// o principal aqui só chama as FUNÇÕES (jeito 2); a sessão restaurada é gravada pelo SessaoProvider (o arquivo do login)
import { principal, PRINCIPAL_ANON, PRINCIPAL_SCHEMA, PRINCIPAL_STORAGE_KEY, PRINCIPAL_URL } from "@/integrations/principal/client";

// ───────────────────────── o plugin nativo ─────────────────────────

export interface RespostaDisponivel {
  disponivel: boolean;
  /** android_antigo · sem_play_services · play_services_desligado · play_services_antigo */
  motivo?: string;
  modelo?: string;
  android?: string;
}

export interface RespostaCriar {
  responseJson?: string;
  /** true = com o backup na nuvem; false = só no aparelho (caiu no E2eeUnavailableException) */
  nuvem?: boolean;
  indisponivel?: boolean;
  motivo?: string;
}

export interface RespostaObter {
  responseJson?: string;
  semChave?: boolean;
  indisponivel?: boolean;
  motivo?: string;
}

export interface RestaurarLoginPlugin {
  disponivel(): Promise<RespostaDisponivel>;
  criar(o: { requestJson: string }): Promise<RespostaCriar>;
  obter(o: { requestJson: string }): Promise<RespostaObter>;
  apagar(): Promise<{ ok?: boolean; indisponivel?: boolean; motivo?: string }>;
  log(o: { codigo: string }): Promise<void>;
}

const Plugin = registerPlugin<RestaurarLoginPlugin>("RestaurarLogin");

// ───────────────────────── marcas no aparelho (localStorage — não vai no backup: allowBackup=false) ─────────────────────────

/**
 * + uid → { em, id, sessao }: a chave deste aparelho foi registrada em `em` (epoch ms), com o id `id`, na sessão `sessao` (o session_id do
 * JWT). em 0 = renovar já (veio da restauração). Sessão diferente = a chave morreu no servidor com a sessão antiga → recriar.
 */
export const MARCA_CHAVE = "physiq_chave_restauracao:";
/** "1" = este aparelho já tentou restaurar com resultado definitivo (ou saiu): não tenta de novo. */
export const MARCA_TENTADA = "physiq_restauracao_tentada";
/** uid = mostrar o "Bem-vindo de volta" 1 vez (D5) — src/ui/avisos/AvisoBemVindoDeVolta.tsx. */
export const MARCA_BEM_VINDO = "physiq_bem_vindo_de_volta";
/** epoch ms até quando o garantirChave não tenta (o Android sem a API, ou o servidor recusou a chave deste build de vez). */
export const MARCA_PAUSA = "physiq_chave_restauracao_pausa";
/**
 * epoch ms até quando a RESTAURAÇÃO não tenta de novo (o recuo — 2ª revisão, achados 2 e 5): o servidor desligado 24 h, o servidor fora
 * (429/5xx) 1 h, a resposta do Android que não conferiu (403 conferencia_falhou) ou o pedido fora do formato (400) 7 dias. Não é a marca
 * definitiva: passado o prazo, tenta de novo. Sem rede, prazo estourado e desafio repetido (409): na próxima abertura.
 */
export const MARCA_ESPERA = "physiq_restauracao_espera";

/** A chave se renova a cada ~6 meses (o servidor vence a que não é usada há 13). */
export const RENOVAR_MS = 182 * 24 * 60 * 60 * 1000;
/** A pausa depois de um "não dá" definitivo (o Android sem a API, a recusa do servidor): 7 dias. */
export const PAUSA_MS = 7 * 24 * 60 * 60 * 1000;
/** Quanto a restauração espera depois de cada recuo (MARCA_ESPERA). */
export const RECUO_MS = { desligado: 24 * 60 * 60 * 1000, servidor: 60 * 60 * 1000, pausa: 7 * 24 * 60 * 60 * 1000 } as const;

export interface PrazosRestaurar {
  /** opções + o Android buscar a chave */
  ateAChaveMs: number;
  /** o entrar (+ gravar a sessão), contado de quando a chave chegou: pelo menos isto */
  doEntrarMs: number;
  /** com menos do que isto, o entrar nem começa */
  minimoEntrarMs: number;
  /** o teto de tudo (o "Carregando") */
  totalMs: number;
}

/**
 * Os prazos da restauração na 1ª abertura — o "Carregando" (2ª revisão, achado 4):
 *  - até a CHAVE (as opções + o Android buscar a chave): 8 s. O típico é 1 a 3 s (fase 0: o obter 0,1–1,3 s com o Play services quente,
 *    segundos na 1ª chamada depois de instalar; a função ~0,4 s);
 *  - depois que a chave chegou (a parte cara do aparelho já foi), o ENTRAR + gravar a sessão ganha PELO MENOS 4 s próprios (a função
 *    ~0,6 s + o GET /user do setSession) — a chave obtida aos 7 s ainda tem até os 11 s;
 *  - o entrar nunca começa com menos de 2,5 s: o servidor terminaria assim mesmo (gastaria o desafio e 1 das 3 entradas da hora, e
 *    deixaria uma sessão órfã que não vence);
 *  - teto de 12 s para tudo (a segurança do SessaoProvider fica em 12 + 1,5 s).
 */
export const PRAZOS_RESTAURAR: Readonly<PrazosRestaurar> = { ateAChaveMs: 8_000, doEntrarMs: 4_000, minimoEntrarMs: 2_500, totalMs: 12_000 };
/** O teto do "Carregando" da restauração (o SessaoProvider soma 1,5 s de segurança). */
export const PRAZO_RESTAURAR_MS = PRAZOS_RESTAURAR.totalMs;
/** O Sair espera o apagar no máximo isto (como o esquecerAparelhoPush). */
export const PRAZO_SAIR_MS = 3_000;
/** Cada chamada sem login (como a entrar-senha). */
const LIMITE_FETCH_MS = 15_000;

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravar(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* sem armazenamento: segue sem a marca */
  }
}

function tirar(chave: string): void {
  try {
    localStorage.removeItem(chave);
  } catch {
    /* noop */
  }
}

export interface MarcaChave {
  em: number;
  id: string | null;
  /** o session_id da sessão que registrou a chave (null = não se sabe) */
  sessao: string | null;
}

export function lerMarcaChave(uid: string): MarcaChave | null {
  const bruto = ler(MARCA_CHAVE + uid);
  if (!bruto) return null;
  try {
    const v = JSON.parse(bruto) as { em?: unknown; id?: unknown; sessao?: unknown };
    const em = typeof v.em === "number" && Number.isFinite(v.em) ? v.em : 0;
    const id = typeof v.id === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(v.id) ? v.id : null;
    const sessao = typeof v.sessao === "string" && v.sessao ? v.sessao : null;
    return { em, id, sessao };
  } catch {
    return { em: 0, id: null, sessao: null };
  }
}

function gravarMarcaChave(uid: string, m: MarcaChave): void {
  gravar(MARCA_CHAVE + uid, JSON.stringify(m));
}

/** As marcas de chave de qualquer pessoa neste aparelho (a chave de volta é 1 por app: a da última conta). */
function chavesMarcadas(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(MARCA_CHAVE)) out.push(k);
    }
  } catch {
    /* noop */
  }
  return out;
}

function limparMarcasChave(): void {
  for (const k of chavesMarcadas()) tirar(k);
}

const marcarTentada = () => gravar(MARCA_TENTADA, "1");

function pausado(): boolean {
  const ate = Number(ler(MARCA_PAUSA));
  return Number.isFinite(ate) && ate > Date.now();
}

const pausar = () => gravar(MARCA_PAUSA, String(Date.now() + PAUSA_MS));

/** A restauração está no recuo (MARCA_ESPERA no futuro)? */
function esperando(): boolean {
  const ate = Number(ler(MARCA_ESPERA));
  return Number.isFinite(ate) && ate > Date.now();
}

const recuar = (ms: number) => gravar(MARCA_ESPERA, String(Date.now() + ms));

/** O "Bem-vindo de volta" ainda não foi mostrado a esta pessoa? */
export function bemVindoPendente(uid: string | null | undefined): boolean {
  return Boolean(uid) && ler(MARCA_BEM_VINDO) === uid;
}

export function bemVindoMostrado(): void {
  tirar(MARCA_BEM_VINDO);
}

// ───────────────────────── onde roda ─────────────────────────

const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

/** Só o APK Android com o plugin registrado (no site/PWA, nada). */
export function ehAndroidNativo(): boolean {
  try {
    return Capacitor.getPlatform() === "android" && Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("RestaurarLogin");
  } catch {
    return false;
  }
}

let disponivelCache: Promise<RespostaDisponivel | null> | null = null;

/** O plugin diz que a API roda aqui (Android 9+, Play services ligado e 24.22+)? null = não. Uma vez por abertura. */
export function pluginDisponivel(): Promise<RespostaDisponivel | null> {
  if (!ehAndroidNativo()) return Promise.resolve(null);
  if (!disponivelCache) {
    disponivelCache = Plugin.disponivel().then(
      (r) => (r && r.disponivel === true ? r : null),
      () => null,
    );
  }
  return disponivelCache;
}

/** O log: só o código (console e, no APK, o logcat com a tag RestaurarLogin). Nunca o JSON, a chave, o token ou o e-mail. */
function marcar(codigo: string): void {
  console.info(`[RestaurarLogin] ${codigo}`);
  if (ehAndroidNativo()) void Plugin.log({ codigo }).catch(() => undefined);
}

const esperar = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/** Muda a cada Sair / sessão derrubada: o garantirChave que começou antes não registra a chave depois. */
let geracao = 0;
let garantirEmCurso: Promise<unknown> | null = null;
/** O pedido que chegou com um garantirChave em curso (a senha trocada no meio, a sessão nova): roda quando o de agora termina. */
let pendente: { uid: string; sessaoId: string | null } | null = null;

/** Quem quer saber que a chave deste aparelho deixou de valer no servidor (o SessaoProvider: recria na hora). */
const ouvintesChaveInvalidada = new Set<() => void>();

export function ouvirChaveInvalidada(cb: () => void): () => void {
  ouvintesChaveInvalidada.add(cb);
  return () => {
    ouvintesChaveInvalidada.delete(cb);
  };
}

/**
 * A senha foi trocada pelo próprio app (salvarMinhaSenha): o servidor apaga as chaves da pessoa na troca (gatilho senha_trocada — revisão
 * de segurança, achado 1), e a sessão continua a mesma. A marca sai e quem ouve recria a chave deste aparelho na hora.
 */
export function chaveInvalidadaPelaSenha(): void {
  // o garantirChave em curso (se houver) não grava a marca de uma chave que o servidor acabou de apagar
  geracao++;
  limparMarcasChave();
  for (const cb of [...ouvintesChaveInvalidada]) {
    try {
      cb();
    } catch {
      /* noop */
    }
  }
}

// ───────────────────────── o servidor ─────────────────────────

async function corpoDoErro(erro: unknown): Promise<Record<string, unknown> | null> {
  const ctx = (erro as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      return (await ctx.clone().json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

type RespostaChave = { ok: true; dados: Record<string, unknown> } | { ok: false; erro: string };

/** A chave-restauracao COMO A PESSOA (o cliente do principal: o Bearer da sessão + o x-schema do ambiente), 1 vez só. */
async function chamarChave(corpo: Record<string, unknown>): Promise<RespostaChave> {
  try {
    const { data, error } = await principal.functions.invoke("chave-restauracao", { body: corpo });
    if (error) {
      const c = await corpoDoErro(error);
      const rede = (error as { name?: unknown })?.name === "FunctionsFetchError";
      return { ok: false, erro: typeof c?.erro === "string" ? c.erro : rede ? "rede" : "erro" };
    }
    const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    if (d.ok !== true) return { ok: false, erro: typeof d.erro === "string" ? d.erro : "erro" };
    return { ok: true, dados: d };
  } catch {
    return { ok: false, erro: "rede" };
  }
}

/**
 * A recusa da chave-restauracao é definitiva para este build/conta (pausa 7 dias)? O precisa_2fa (conta com 2 etapas fora do aal2), o
 * muitas_tentativas e o desafio_vencido (409: o app ficou parado entre o opcoes e o registrar) não: a chave sai na próxima oportunidade.
 */
const recusaDefinitiva = (erro: string) =>
  erro === "chave_invalida" || erro === "dados_invalidos" || erro === "conta_real_no_staging" || erro === "conta_master";

type RespostaRestaurar = { status: number; corpo: Record<string, unknown> } | { rede: true };

/** A restaurar-login SEM login (fetch próprio: apikey + x-schema, como a entrar-senha), com o limite dado. */
async function chamarRestaurar(corpo: Record<string, unknown>, limiteMs: number): Promise<RespostaRestaurar> {
  if (!PRINCIPAL_URL) return { rede: true };
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), Math.max(1, limiteMs));
  try {
    const r = await fetch(`${PRINCIPAL_URL}/functions/v1/restaurar-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: PRINCIPAL_ANON, "x-schema": PRINCIPAL_SCHEMA },
      body: JSON.stringify(corpo),
      signal: controle.signal,
    });
    const c = await r.json().catch(() => null);
    return { status: r.status, corpo: c && typeof c === "object" && !Array.isArray(c) ? (c as Record<string, unknown>) : {} };
  } catch {
    return { rede: true };
  } finally {
    clearTimeout(timer);
  }
}

// ───────────────────────── criar a chave (com sessão) ─────────────────────────

export type ResultadoGarantir =
  | "registrada" | "em_dia" | "pulado" | "pausado" | "indisponivel" | "desligado" | "cancelada" | "erro";

/**
 * Cria e registra a chave de volta deste aparelho para `uid`, se precisa (sem a marca, com ela há mais de 6 meses ou de outra sessão).
 * `sessaoId` = o session_id do JWT da sessão de agora ("" = não se sabe: vale só o prazo). Quem chama garante a sessão, a situação
 * carregada e que não é master. Nunca lança.
 */
export async function garantirChave(uid: string, sessaoId: string | null = null): Promise<ResultadoGarantir> {
  if (!uid || !ehAndroidNativo() || !online()) return "pulado";
  if (garantirEmCurso) {
    pendente = { uid, sessaoId };
    return "pulado";
  }
  const marca = lerMarcaChave(uid);
  const mesmaSessao = !sessaoId || marca?.sessao === sessaoId;
  if (marca && Date.now() - marca.em < RENOVAR_MS && mesmaSessao) return "em_dia";
  if (pausado()) return "pausado";
  const minha = geracao;
  const tarefa = (async (): Promise<ResultadoGarantir> => {
    const disp = await pluginDisponivel();
    if (!disp) return "indisponivel";
    // o desafio de registro vencido (409 desafio_vencido) não é recusa: o Android JÁ trocou a chave do aparelho — pede opções e registra de
    // novo 1 vez na hora, para o aparelho não ficar com uma chave sem par (2ª revisão, achado 3)
    for (let tentativa = 1; ; tentativa++) {
      const r = await criarERegistrar(uid, sessaoId, marca, disp, minha);
      if (r !== "desafio_vencido") return r;
      if (tentativa >= 2) {
        marcar("chave_desafio_vencido");
        return "erro";
      }
    }
  })().catch((): ResultadoGarantir => {
    marcar("chave_falhou");
    return "erro";
  });
  garantirEmCurso = tarefa;
  try {
    return await tarefa;
  } finally {
    garantirEmCurso = null;
    const depois = pendente;
    pendente = null;
    if (depois) void garantirChave(depois.uid, depois.sessaoId);
  }
}

/** Uma volta do garantirChave: opções → o Android cria → registrar. "desafio_vencido" = o garantirChave tenta de novo. */
async function criarERegistrar(uid: string, sessaoId: string | null, marca: MarcaChave | null, disp: RespostaDisponivel, minha: number):
  Promise<ResultadoGarantir | "desafio_vencido"> {
  const op = await chamarChave({ acao: "opcoes" });
  if (op.ok === false) {
    if (op.erro === "desligado") {
      marcar("chave_desligada");
      return "desligado";
    }
    if (recusaDefinitiva(op.erro)) pausar();
    marcar("chave_falhou_opcoes");
    return "erro";
  }
  if (!op.dados.opcoes || typeof op.dados.opcoes !== "object") return "erro";
  const criada = await Plugin.criar({ requestJson: JSON.stringify(op.dados.opcoes) });
  if (criada?.indisponivel) {
    pausar();
    marcar("chave_indisponivel");
    return "indisponivel";
  }
  if (typeof criada?.responseJson !== "string") return "erro";
  if (geracao !== minha) {
    // saiu (ou a sessão caiu) enquanto o Android criava: não registra, e a chave recém-criada sai do aparelho
    void Plugin.apagar().catch(() => undefined);
    return "cancelada";
  }
  let resposta: unknown;
  try {
    resposta = JSON.parse(criada.responseJson);
  } catch {
    return "erro";
  }
  const reg = await chamarChave({
    acao: "registrar",
    resposta,
    nuvem: criada.nuvem === true,
    substitui: marca?.id ?? null,
    aparelho: { modelo: disp.modelo ?? "", android: disp.android ?? "" },
    versao: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : null,
  });
  if (reg.ok === false) {
    if (reg.erro === "desafio_vencido") return "desafio_vencido";
    if (recusaDefinitiva(reg.erro)) pausar();
    marcar("chave_falhou_registrar");
    return "erro";
  }
  const id = typeof reg.dados.credencial === "string" ? reg.dados.credencial : null;
  if (geracao === minha) gravarMarcaChave(uid, { em: Date.now(), id, sessao: sessaoId || null });
  marcar(criada.nuvem === true ? "chave_registrada_nuvem" : "chave_registrada_local");
  return "registrada";
}

// ───────────────────────── restaurar (sem sessão, na 1ª abertura) ─────────────────────────

/**
 * A abertura SEM sessão (online, no APK): "restaurar" = nada desta instalação no aparelho (o celular novo — o localStorage da WebView não
 * vem no backup) e ainda sem a marca de tentativa; "derrubada" = esta instalação criou a chave para alguém e a sessão sumiu do aparelho sem
 * o nosso Sair (o Auth recusou a renovação: revogada, vencida, conta apagada) → apagar a chave daqui, nunca restaurar no MESMO aparelho;
 * "nada" = o resto (a sessão guardada continua no aparelho: falha de rede, não derrubada).
 */
export function semSessaoNaAbertura(): "restaurar" | "derrubada" | "nada" {
  if (!online() || !ehAndroidNativo()) return "nada";
  if (chavesMarcadas().length > 0) return ler(PRINCIPAL_STORAGE_KEY) ? "nada" : "derrubada";
  if (ler(MARCA_TENTADA) || esperando()) return "nada";
  return "restaurar";
}

export type ResultadoRestaurar =
  | { tipo: "entrou"; sessao: Session }
  | { tipo: "sem_chave" | "indisponivel" | "desligado" | "rede" | "servidor" | "prazo" | "desafio" | "pulado" | "erro" }
  | { tipo: "recusado" | "pausa"; erro: string };

export interface SessaoRecebida {
  access_token: string;
  refresh_token: string;
}

/** Grava a sessão que a restaurar-login devolveu (o principal.auth.setSession do SessaoProvider); null = não gravou. */
export type GravarSessao = (s: SessaoRecebida) => Promise<Session | null>;

function sessaoDaResposta(v: unknown): SessaoRecebida | null {
  const s = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  if (!s || typeof s.access_token !== "string" || !s.access_token || typeof s.refresh_token !== "string" || !s.refresh_token) return null;
  return { access_token: s.access_token, refresh_token: s.refresh_token };
}

/**
 * A resposta do entrar → o resultado (2ª revisão, achado 2): SÓ o 401 chave_invalida diz "a chave não vale mais" (apaga do aparelho e do
 * backup, e marca). 409 (o desafio repetido ou vencido) = tenta na próxima abertura. 403 conferencia_falhou e 400 = a resposta do Android
 * não conferiu ou veio fora do formato: NÃO apaga — espera 7 dias. Os outros 403 (conta real no staging, master, desativada, e-mail não
 * confirmado) = recusa da conta: marca, sem apagar. O resto (429, 5xx, um 401 sem o chave_invalida — p. ex. o gateway) = servidor.
 */
function resultadoDoEntrar(status: number, corpo: Record<string, unknown>): ResultadoRestaurar | null {
  const erro = typeof corpo.erro === "string" ? corpo.erro : "";
  if (status === 200 && corpo.ok === false && erro === "desligado") return { tipo: "desligado" };
  if (status === 401 && erro === "chave_invalida") return { tipo: "recusado", erro };
  if (status === 409) return { tipo: "desafio" };
  if ((status === 403 && erro === "conferencia_falhou") || status === 400) return { tipo: "pausa", erro: erro || "dados_invalidos" };
  if (status === 403) return { tipo: "recusado", erro: erro || "recusado" };
  if (status === 200 && corpo.ok === true) return null;
  return { tipo: "servidor" };
}

/**
 * A 1ª abertura no celular novo: entra sozinho com a chave de volta, se houver. Quem chama já viu que não há sessão (semSessaoNaAbertura).
 * Nunca lança. Os prazos em PRAZOS_RESTAURAR: até a chave 8 s; com a chave, o entrar ganha pelo menos 4 s próprios (nunca começa com menos
 * de 2,5 s); teto de 12 s. No prazo estourado devolve "prazo"; o que chega depois do prazo é ignorado — menos o "sem chave"/"indisponível"
 * do aparelho, que marcam a tentativa (o Android sem a API pode levar ~10 s na 1ª chamada, fase 0), e a sessão que o servidor JÁ entregou
 * dentro do prazo, que é gravada mesmo se o setSession passar do prazo (a segurança do SessaoProvider segura a tela).
 */
export async function tentarRestaurar(gravarSessao: GravarSessao, prazos: Partial<PrazosRestaurar> = {}): Promise<ResultadoRestaurar> {
  if (!online() || !ehAndroidNativo() || ler(MARCA_TENTADA) || esperando()) return { tipo: "pulado" };
  const pz: PrazosRestaurar = { ...PRAZOS_RESTAURAR, ...prazos };
  const inicio = Date.now();
  const teto = inicio + pz.totalMs;
  let fim = Math.min(teto, inicio + pz.ateAChaveMs);
  const restante = () => Math.min(LIMITE_FETCH_MS, fim - Date.now());
  let encerrado = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let acordar: (r: ResultadoRestaurar) => void = () => undefined;
  const prazo = new Promise<ResultadoRestaurar>((ok) => {
    acordar = ok;
  });
  /** (re)arma o relógio do prazo para o `fim` de agora */
  const armar = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      encerrado = true;
      acordar({ tipo: "prazo" });
    }, Math.max(0, fim - Date.now()));
  };
  armar();

  const trabalho = (async (): Promise<ResultadoRestaurar> => {
    const disp = await pluginDisponivel();
    if (!disp) return { tipo: "pulado" };
    const op = await chamarRestaurar({ acao: "opcoes" }, restante());
    if ("rede" in op) return { tipo: "rede" };
    if (op.status === 200 && op.corpo.ok === false && op.corpo.erro === "desligado") return { tipo: "desligado" };
    const opcoes = op.status === 200 && op.corpo.ok === true ? op.corpo.opcoes : null;
    if (!opcoes || typeof opcoes !== "object") return op.status === 400 ? { tipo: "pausa", erro: "dados_invalidos" } : { tipo: "servidor" };
    if (encerrado) return { tipo: "prazo" };

    const pedido = Plugin.obter({ requestJson: JSON.stringify(opcoes) });
    // o resultado DEFINITIVO do aparelho vale mesmo depois do prazo
    void pedido.then((r) => {
      if (r?.semChave || r?.indisponivel) marcarTentada();
    }, () => undefined);
    const obtido = await pedido;
    if (obtido?.semChave) return { tipo: "sem_chave" };
    if (obtido?.indisponivel) return { tipo: "indisponivel" };
    if (encerrado) return { tipo: "prazo" };
    if (typeof obtido?.responseJson !== "string") return { tipo: "erro" };
    let resposta: Record<string, unknown>;
    try {
      resposta = JSON.parse(obtido.responseJson) as Record<string, unknown>;
    } catch {
      return { tipo: "erro" };
    }

    // a chave chegou: o entrar ganha o prazo próprio (pelo menos doEntrarMs), dentro do teto; com menos de minimoEntrarMs nem começa (o
    // servidor terminaria assim mesmo e gastaria o desafio, 1 das 3 entradas da hora e uma sessão órfã — 2ª revisão, achado 4)
    fim = Math.min(teto, Math.max(fim, Date.now() + pz.doEntrarMs));
    armar();
    if (fim - Date.now() < pz.minimoEntrarMs) {
      encerrado = true;
      return { tipo: "prazo" };
    }
    const en = await chamarRestaurar({ acao: "entrar", resposta }, restante());
    if ("rede" in en) return { tipo: "rede" };
    const recusa = resultadoDoEntrar(en.status, en.corpo);
    if (recusa) {
      // só a chave que não vale mais sai do aparelho (e do backup), para não tentar de novo
      if (recusa.tipo === "recusado" && recusa.erro === "chave_invalida") void Plugin.apagar().catch(() => undefined);
      return recusa;
    }
    const recebida = sessaoDaResposta(en.corpo.sessao);
    if (!recebida) return { tipo: "servidor" };
    // depois do prazo a tela de entrar já apareceu: a sessão que chegou tarde fica sem uso (o desafio já foi gasto e a chave segue valendo
    // — a próxima abertura tenta de novo)
    if (encerrado) return { tipo: "prazo" };
    // a sessão chegou dentro do prazo: grava, mesmo que o setSession (o GET /user) passe do prazo — a tela espera pela segurança do provedor
    if (timer) clearTimeout(timer);
    const sessao = await gravarSessao(recebida).catch(() => null);
    if (!sessao?.user?.id) return { tipo: "erro" };
    const uid = sessao.user.id;
    // a chave restaurada é a "antiga deste aparelho": o garantirChave cria a própria e marca a restaurada como substituída
    gravarMarcaChave(uid, { em: 0, id: typeof resposta.id === "string" ? resposta.id : null, sessao: null });
    gravar(MARCA_BEM_VINDO, uid);
    return { tipo: "entrou", sessao };
  })().catch((): ResultadoRestaurar => ({ tipo: "erro" }));

  const r = await Promise.race([trabalho, prazo]);
  if (timer) clearTimeout(timer);
  encerrado = true;
  // a marca só com resultado definitivo; o recuo (sem marca) para o servidor desligado, fora ou a conferência que falhou
  if (r.tipo === "entrou" || r.tipo === "sem_chave" || r.tipo === "recusado" || r.tipo === "indisponivel") marcarTentada();
  if (r.tipo === "desligado") recuar(RECUO_MS.desligado);
  if (r.tipo === "servidor") recuar(RECUO_MS.servidor);
  if (r.tipo === "pausa") recuar(RECUO_MS.pausa);
  const codigo: Record<ResultadoRestaurar["tipo"], string> = {
    entrou: "restaurado", sem_chave: "restauracao_sem_chave", recusado: "restauracao_recusada", indisponivel: "restauracao_indisponivel",
    desligado: "restauracao_desligada", rede: "restauracao_sem_rede", servidor: "restauracao_servidor", prazo: "restauracao_prazo",
    desafio: "restauracao_desafio", pausa: "restauracao_pausa", pulado: "restauracao_pulada", erro: "restauracao_erro",
  };
  marcar(codigo[r.tipo]);
  return r;
}

// ───────────────────────── apagar ─────────────────────────

/**
 * O Sair (antes do signOut, no máximo 3 s): o servidor apaga todas as chaves da pessoa (D3) — no Sair local (o master no app), só a deste
 * aparelho —, e o plugin apaga a do aparelho e do backup. Este aparelho não tenta mais restaurar (a marca). Sem internet não espera o
 * servidor. Nunca lança.
 */
export async function esquecerChave(o: { local?: boolean; uid?: string | null } = {}): Promise<void> {
  geracao++;
  pendente = null;
  const nativo = ehAndroidNativo();
  const idDaqui = o.uid ? lerMarcaChave(o.uid)?.id ?? null : null;
  limparMarcasChave();
  tirar(MARCA_BEM_VINDO);
  if (nativo) marcarTentada();
  const trabalho = (async () => {
    // um garantirChave no meio do registrar termina antes (senão a chave registrada depois do apagar ficaria ativa)
    if (garantirEmCurso) await Promise.race([garantirEmCurso, esperar(PRAZO_SAIR_MS / 2)]);
    const tarefas: Promise<unknown>[] = [];
    const corpo = o.local ? (idDaqui ? { acao: "apagar", credencial: idDaqui } : null) : { acao: "apagar", todas: true };
    if (corpo && online()) tarefas.push(chamarChave(corpo));
    if (nativo) tarefas.push(Plugin.apagar().catch(() => undefined));
    await Promise.all(tarefas);
  })().catch(() => undefined);
  await Promise.race([trabalho, esperar(PRAZO_SAIR_MS)]);
  if (nativo) marcar("saiu");
}

/** A sessão caiu sem o nosso Sair (revogada, vencida, conta apagada): a chave sai do aparelho e do backup. Sem login, o servidor não sabe. */
export function sessaoDerrubada(): void {
  if (!ehAndroidNativo()) return;
  geracao++;
  pendente = null;
  limparMarcasChave();
  marcarTentada();
  marcar("sessao_derrubada");
  void Plugin.apagar().catch(() => undefined);
}

/** Só para os testes. */
export function _zerarParaTestes(): void {
  disponivelCache = null;
  geracao = 0;
  garantirEmCurso = null;
  pendente = null;
  ouvintesChaveInvalidada.clear();
}
