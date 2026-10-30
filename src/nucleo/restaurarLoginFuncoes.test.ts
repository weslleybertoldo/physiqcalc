// @vitest-environment node
// Physiq restaurar-login (30/10/2026) — as 2 funções DE VERDADE (supabase-principal/functions/restaurar-login e chave-restauracao: o
// Deno.serve, a porta-pessoa, as regras e a biblioteca @simplewebauthn/server 13.3.3 do npm no lugar da do JSR), com um banco FALSO que
// segue as RPCs da migração 20261030010000 (endurecida pela revisão de segurança: a chave amarrada à sessão, o master e o aal2, o teto por
// pessoa, o desafio de entrar SEM ESTADO — HMAC — gasto só depois da assinatura, 3 entradas por chave por hora, a recusa da dona de novo no
// banco, a conta excluída) e o Auth falso (generate_link recovery + verify). O banco de verdade é provado pelo E2E do staging
// (e2e/restaurar_login/api.py). Prova: o caminho inteiro registrar → entrar → sessão; o desafio que não repete e o que não é nosso; origem/
// assinatura erradas; chave apagada; o Sair (todas); a sessão da chave encerrada; a trava (na hora, pelo banco); o public sem a migração
// (desligado, nada chamado); a pessoa; o freio; o e-mail que sai SÓ do dono da chave e o link que volta de outra pessoa; e nada de e-mail,
// token ou resposta do Android no log.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ORIGEM_PLAY, ORIGEM_UPLOAD, base64urlParaBytes, bytesParaBase64url, criarDesafioEntrar, segredoDoDesafio, userHandleDe,
} from "../../supabase-principal/functions/_shared/restaurar-login-regras";
import { criarAutenticador, type AutenticadorVirtual } from "../test/autenticadorVirtual";

const LIA = "f3513284-3e44-40cc-84bb-d7a39a929e8d";
const OTTO = "f411a2c9-bf1d-42dd-9d19-00c6e08c0721";
const REAL = "0b9c6f1e-2a3b-4c5d-8e9f-001122334455";
const TOKEN = { [LIA]: "token-da-lia-0000000000000", [OTTO]: "token-do-otto-000000000000", [REAL]: "token-da-real-000000000000" };
const EMAIL = { [LIA]: "w26.lia.teste.claude@physiqnutri.app", [OTTO]: "w26.otto.teste.claude@physiqnutri.app", [REAL]: "maria.real@gmail.com" };
const SERVICE = "service-role-de-teste";
/** O segredo do HMAC do desafio de entrar (falso; 32 bytes em base64url) — o da função vem de RESTAURAR_LOGIN_SEGREDO. */
const SEGREDO = bytesParaBase64url(new Uint8Array(32).fill(42));
const ORIGEM_FALSA = `android:apk-key-hash:${bytesParaBase64url(new Uint8Array(32).fill(7))}`;

type Resultado = { data: unknown; error: { code?: string; status?: number; message: string } | null };
interface Chave {
  schema: string; userId: string; hex: string; contador: number; alg: number; origem: string; apagada: string | null; usos: number;
  aparelho: string | null; nuvem: boolean | null; be: boolean | null; bs: boolean | null; sessao: string; criada: number; apagadaEm: number;
}

/** O banco falso: as RPCs da migração 20261030010000, com as mesmas regras (o SQL de verdade é provado no E2E do staging). */
class BancoFalso {
  migrado = new Set<string>(["staging"]);
  trava = new Map<string, unknown>([["staging", { ligado: true, so_teste: true }]]);
  desafios = new Map<string, { schema: string; tipo: string; userId: string | null; expira: number; credencial?: string; criado: number }>();
  chaves = new Map<string, Chave>();
  usuarios = new Map<string, {
    id: string; email: string; email_confirmed_at: string | null; confirmed_at?: string | null; banned_until?: string | null;
    app_metadata?: Record<string, unknown>; deleted_at?: string | null;
  }>();
  /** o perfil master DESTE schema (a outra metade do sou_master) */
  perfisMaster = new Set<string>();
  /** quem tem o fator de 2 etapas verificado */
  fatores = new Set<string>();
  /** o aal de cada token (o padrão: aal1) */
  aal = new Map<string, string>();
  /** a sessão de cada token (o session_id do JWT) e as sessões vivas no Auth */
  sessaoDoToken = new Map<string, string>(Object.values(TOKEN).map((t, i) => [t, `sessao-${i + 1}`]));
  sessoesVivas = new Set<string>(["sessao-1", "sessao-2", "sessao-3"]);
  rpcs: string[] = [];

  constructor() {
    for (const id of [LIA, OTTO, REAL]) this.usuarios.set(id, { id, email: EMAIL[id], email_confirmed_at: "2026-10-01T00:00:00Z" });
  }

  cliente(schema: string, token: string | null, chave: string) {
    return {
      rpc: async (nome: string, args: Record<string, unknown> = {}): Promise<Resultado> => this.rpc(schema, token, chave, nome, args),
      from: (tabela: string) => this.consulta(schema, tabela),
      auth: {
        getUser: async (t: string) => {
          const id = Object.entries(TOKEN).find(([, v]) => v === t)?.[0];
          return id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: { message: "invalid JWT" } };
        },
        admin: {
          getUserById: async (id: string) => {
            const u = this.usuarios.get(id);
            return u ? { data: { user: u }, error: null } : { data: { user: null }, error: { status: 404, message: "User not found" } };
          },
        },
      },
    };
  }

  consulta(schema: string, tabela: string) {
    const filtros: Record<string, unknown> = {};
    const q = {
      select: () => q,
      eq: (coluna: string, valor: unknown) => {
        filtros[coluna] = valor;
        return q;
      },
      maybeSingle: async (): Promise<Resultado> => {
        if (tabela !== "app_config" || filtros.publica !== false) throw new Error(`consulta inesperada: ${tabela}`);
        const v = this.trava.get(schema);
        return { data: filtros.chave === "restaurar_login" && v !== undefined ? { valor: v } : null, error: null };
      },
    };
    return q;
  }

  /** restaurar_login_recusa(p_user) */
  recusa(schema: string, userId: string | null): string | null {
    const cfg = this.trava.get(schema) as Record<string, unknown> | undefined;
    if (!cfg || cfg.ligado !== true) return "desligado";
    if (!userId) return null;
    const u = this.usuarios.get(userId);
    if (!u || u.deleted_at) return "sem_login";
    const teste = /teste/.test(u.email) && /@physiq(calc|nutri)\.app$/.test(u.email);
    if (schema === "staging" && !teste) return "conta_real_no_staging";
    if (cfg.so_teste !== false && !teste) return "desligado";
    if (u.app_metadata?.role === "master" || this.perfisMaster.has(userId)) return "conta_master";
    return null;
  }

  novoDesafio(schema: string, tipo: string, userId: string | null, vida = 300_000): string {
    const d = bytesParaBase64url(crypto.getRandomValues(new Uint8Array(32)));
    this.desafios.set(d, { schema, tipo, userId, expira: Date.now() + vida, criado: Date.now() });
    return d;
  }

  /** delete … returning: gasta o desafio de registrar (vencido ou não) e diz se valia */
  gastar(schema: string, desafio: unknown, tipo: string, userId: string | null): boolean {
    const d = typeof desafio === "string" ? this.desafios.get(desafio) : undefined;
    if (!d || d.schema !== schema || d.tipo !== tipo || d.userId !== userId) return false;
    this.desafios.delete(desafio as string);
    return d.expira > Date.now();
  }

  ativas(schema: string, userId: string): Array<[string, Chave]> {
    return [...this.chaves.entries()].filter(([, c]) => c.schema === schema && c.userId === userId && !c.apagada);
  }

  /** no máximo 20 apagadas guardadas por pessoa (as mais antigas saem de vez) */
  podar(schema: string, userId: string): void {
    const apagadas = [...this.chaves.entries()].filter(([, c]) => c.schema === schema && c.userId === userId && c.apagada)
      .sort(([, x], [, y]) => y.apagadaEm - x.apagadaEm);
    for (const [id] of apagadas.slice(20)) this.chaves.delete(id);
  }

  apagar(c: Chave, motivo: string): void {
    c.apagada = motivo;
    c.apagadaEm = Date.now();
  }

  rpc(schema: string, token: string | null, chave: string, nome: string, a: Record<string, unknown>): Resultado {
    this.rpcs.push(`${schema}.${nome}`);
    if (!this.migrado.has(schema)) return { data: null, error: { code: "PGRST202", message: `Could not find the function ${schema}.${nome}` } };
    const uid = token ? (Object.entries(TOKEN).find(([, v]) => v === token)?.[0] ?? null) : null;
    const doServidor = ["restauracao_chave", "restauracao_gastar"].includes(nome);
    // os grants: as do servidor só com a chave de servidor; as da pessoa com o login dela
    if (doServidor && (token || chave !== SERVICE)) return { data: null, error: { code: "42501", message: "permission denied" } };
    const ok = (data: unknown): Resultado => ({ data, error: null });
    const precisa2fa = () => uid !== null && this.fatores.has(uid) && this.aal.get(token!) !== "aal2";
    switch (nome) {
      case "chave_restauracao_desafio": {
        const r = this.recusa(schema, uid);
        if (r) return ok({ ok: false, erro: r });
        if (precisa2fa()) return ok({ ok: false, erro: "precisa_2fa" });
        return ok({ ok: true, desafio: this.novoDesafio(schema, "registrar", uid) });
      }
      case "chave_restauracao_gravar": {
        const r = this.recusa(schema, uid);
        if (r) return ok({ ok: false, erro: r });
        if (precisa2fa()) return ok({ ok: false, erro: "precisa_2fa" });
        const sessao = this.sessaoDoToken.get(token!);
        if (!sessao || !this.sessoesVivas.has(sessao)) return ok({ ok: false, erro: "sem_login" });
        if (!this.gastar(schema, a.p_desafio, "registrar", uid)) return ok({ ok: false, erro: "desafio_invalido" });
        const cred = a.p_credencial as string;
        if (!/^[A-Za-z0-9_-]{16,128}$/.test(cred) || ![-7, -257].includes(a.p_alg as number) || !/^\\x[0-9a-f]+$/.test(String(a.p_chave))
          || String(a.p_chave).length - 2 > 1200 || !/^android:apk-key-hash:[A-Za-z0-9_-]{43}$/.test(String(a.p_origem)) || (a.p_contador as number) < 0) {
          return ok({ ok: false, erro: "dados_invalidos" });
        }
        const em24h = [...this.chaves.values()].filter((c) => c.schema === schema && c.userId === uid && c.criada > Date.now() - 86_400_000);
        if (em24h.length >= 20) return ok({ ok: false, erro: "muitas_tentativas" });
        if (this.chaves.has(cred)) return ok({ ok: false, erro: "chave_repetida" });
        this.chaves.set(cred, {
          schema, userId: uid!, hex: String(a.p_chave).slice(2), contador: a.p_contador as number, alg: a.p_alg as number,
          origem: a.p_origem as string, apagada: null, usos: 0, aparelho: (a.p_aparelho as string) ?? null, nuvem: (a.p_nuvem as boolean) ?? null,
          be: (a.p_be as boolean) ?? null, bs: (a.p_bs as boolean) ?? null, sessao, criada: Date.now(), apagadaEm: 0,
        });
        if (a.p_substitui) {
          const velha = this.chaves.get(a.p_substitui as string);
          if (velha && velha.userId === uid && !velha.apagada && a.p_substitui !== cred) this.apagar(velha, "substituida");
        }
        const ativas = this.ativas(schema, uid!);
        for (const [, c] of ativas.slice(0, Math.max(0, ativas.length - 10))) this.apagar(c, "limite");
        this.podar(schema, uid!);
        return ok({ ok: true, id: cred });
      }
      case "chave_restauracao_apagar": {
        let n = 0;
        if (a.p_todas === true) {
          for (const [, c] of this.ativas(schema, uid!)) {
            this.apagar(c, "saiu_todos");
            n++;
          }
        } else if (typeof a.p_credencial === "string") {
          const c = this.chaves.get(a.p_credencial);
          if (c && c.schema === schema && c.userId === uid && !c.apagada) {
            this.apagar(c, "saiu");
            n++;
          }
        } else return ok({ ok: false, erro: "dados_invalidos" });
        this.podar(schema, uid!);
        return ok({ ok: true, apagadas: n });
      }
      case "restauracao_chave": {
        const r = this.recusa(schema, null);
        if (r) return ok({ ok: false, erro: r });
        const c = this.chaves.get(a.p_credencial as string);
        if (!c || c.schema !== schema || c.apagada) return ok({ ok: false, erro: "chave_invalida" });
        if (!this.sessoesVivas.has(c.sessao)) return ok({ ok: false, erro: "chave_invalida" });
        const u = this.usuarios.get(c.userId);
        if (!u || u.deleted_at) return ok({ ok: false, erro: "chave_invalida" });
        return ok({ ok: true, user_id: c.userId, chave: c.hex, contador: c.contador, algoritmo: c.alg, recusa: this.recusa(schema, c.userId) });
      }
      case "restauracao_gastar": {
        const r = this.recusa(schema, null);
        if (r) return ok({ ok: false, erro: r });
        const desafio = String(a.p_desafio ?? "");
        if (!/^[A-Za-z0-9_-]{43}$/.test(desafio) || !(Date.parse(String(a.p_expira)) > Date.now())) return ok({ ok: false, erro: "desafio_invalido" });
        const c = this.chaves.get(a.p_credencial as string);
        if (!c || c.schema !== schema || c.apagada) return ok({ ok: false, erro: "chave_invalida" });
        const naHora = [...this.desafios.values()].filter((d) => d.tipo === "entrar" && d.credencial === a.p_credencial && d.criado > Date.now() - 3_600_000);
        if (naHora.length >= 3) return ok({ ok: false, erro: "muitas_tentativas" });
        if (this.desafios.has(desafio)) return ok({ ok: false, erro: "desafio_invalido" });
        this.desafios.set(desafio, { schema, tipo: "entrar", userId: null, expira: Date.parse(String(a.p_expira)), credencial: a.p_credencial as string,
          criado: Date.now() });
        c.contador = Math.max(c.contador, a.p_contador as number);
        c.usos++;
        return ok({ ok: true, user_id: c.userId });
      }
    }
    throw new Error(`rpc inesperada ${nome}`);
  }
}

const h = vi.hoisted(() => ({
  banco: null as unknown as { cliente(schema: string, token: string | null, chave: string): unknown },
}));

vi.mock("https://esm.sh/@supabase/supabase-js@2.39.0", () => ({
  createClient: (_url: string, chave: string, opcoes: { db?: { schema?: string }; global?: { headers?: Record<string, string> } }) => {
    const auth = opcoes?.global?.headers?.Authorization;
    return h.banco.cliente(opcoes?.db?.schema ?? "public", auth ? auth.slice(7) : null, chave);
  },
}));
// a porta-pessoa importa o jose (a conferência local do JWT, só no `ler` com jwtLeitura — a chave-restauracao não usa)
vi.mock("https://esm.sh/jose@5.9.6", () => ({
  createRemoteJWKSet: () => "nunca-usado",
  jwtVerify: async () => {
    throw new Error("a chave-restauracao não confere o JWT localmente");
  },
}));
// a biblioteca do JSR (a da função) = a do npm na mesma versão (13.3.3)
vi.mock("jsr:@simplewebauthn/server@13.3.3", async () => await import("@simplewebauthn/server"));
vi.mock("jsr:@simplewebauthn/server@13.3.3/helpers", async () => await import("@simplewebauthn/server/helpers"));
vi.mock("../../supabase-principal/functions/_shared/avisar-erro.ts", () => ({ avisarErro: () => undefined }));

let banco: BancoFalso;
let auth: {
  generate: number; verify: number; outraPessoa: boolean; linkDeOutra: boolean; chamadas: Array<{ url: string; corpo: Record<string, unknown> }>;
};
let linhasDoLog: string[];
type Servir = (r: Request) => Promise<Response>;
let f: { restaurar: Servir; chave: Servir };

async function carregar(semSegredo = false): Promise<{ restaurar: Servir; chave: Servir }> {
  vi.resetModules();
  const servidos: Servir[] = [];
  const env: Record<string, string> = {
    SUPABASE_URL: "https://ref-de-teste.supabase.co", SUPABASE_SERVICE_ROLE_KEY: SERVICE, SUPABASE_ANON_KEY: "anon-de-teste",
    PROXY_SEGREDO: "p".repeat(40), ...(semSegredo ? {} : { RESTAURAR_LOGIN_SEGREDO: SEGREDO }),
  };
  vi.stubGlobal("Deno", { env: { get: (n: string) => env[n] }, serve: (fn: Servir) => void servidos.push(fn) });
  const caminhos = ["../../supabase-principal/functions/restaurar-login/index.ts", "../../supabase-principal/functions/chave-restauracao/index.ts"];
  for (const c of caminhos) await import(/* @vite-ignore */ c);
  return { restaurar: servidos[0], chave: servidos[1] };
}

beforeEach(async () => {
  banco = new BancoFalso();
  h.banco = banco;
  auth = { generate: 200, verify: 200, outraPessoa: false, linkDeOutra: false, chamadas: [] };
  linhasDoLog = [];
  for (const nivel of ["log", "warn", "error"] as const) {
    vi.spyOn(console, nivel).mockImplementation((t: unknown) => void linhasDoLog.push(String(t)));
  }
  vi.stubGlobal("fetch", async (url: string | URL | Request, init: RequestInit = {}) => {
    const u = String(url);
    const corpo = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
    auth.chamadas.push({ url: u, corpo });
    if (u.endsWith("/auth/v1/admin/generate_link")) {
      const pessoa = [...banco.usuarios.values()].find((x) => x.email === corpo.email);
      // recovery: e-mail que não existe → 404 (sem criar conta; o magiclink criaria)
      if (auth.generate !== 200 || !pessoa) return new Response(JSON.stringify({ msg: `falhou para ${corpo.email}` }), { status: auth.generate === 200 ? 404 : auth.generate });
      const id = auth.linkDeOutra ? OTTO : pessoa.id;
      return new Response(JSON.stringify({ id, email: corpo.email, action_link: "https://x/verify?token=segredo", email_otp: "123456",
        hashed_token: `hash-${id}`, verification_type: corpo.type, redirect_to: "https://physiqcalc.com.br" }), { status: 200 });
    }
    if (u.endsWith("/auth/v1/verify")) {
      if (auth.verify !== 200) return new Response(JSON.stringify({ msg: "Token has expired" }), { status: auth.verify });
      const id = auth.outraPessoa ? OTTO : String(corpo.token_hash).replace("hash-", "");
      return new Response(JSON.stringify({ access_token: `eyJacesso.${id}.x`, refresh_token: `refresh-${id}`, expires_in: 3600, expires_at: 1793333333,
        token_type: "bearer", user: { id, email: banco.usuarios.get(id)?.email } }), { status: 200 });
    }
    throw new Error(`fetch inesperado: ${u}`);
  });
  f = await carregar();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

let ipSeq = 0;
function pedir(fn: Servir, corpo: unknown, o: { schema?: string; token?: string; ip?: string; metodo?: string; bruto?: string } = {}): Promise<Response> {
  const metodo = o.metodo ?? "POST";
  const headers: Record<string, string> = {
    "Content-Type": "application/json", Origin: "https://localhost", "x-schema": o.schema ?? "staging", "cf-connecting-ip": o.ip ?? `203.0.113.${(ipSeq++ % 200) + 1}`,
  };
  if (o.token) headers.Authorization = `Bearer ${o.token}`;
  return fn(new Request("https://ref-de-teste.supabase.co/functions/v1/x", { method: metodo, headers, body: metodo === "POST" ? (o.bruto ?? JSON.stringify(corpo)) : undefined }));
}
const corpoDe = async (r: Response) => (await r.json()) as Record<string, unknown>;

async function registrar(a: AutenticadorVirtual, quem = LIA, extra: Record<string, unknown> = {}, schema = "staging"): Promise<Response> {
  const op = await corpoDe(await pedir(f.chave, { acao: "opcoes" }, { token: TOKEN[quem], schema }));
  expect(op.ok, JSON.stringify(op)).toBe(true);
  const resposta = await a.registrar(op.opcoes as { challenge: string; user: { id: string } });
  return pedir(f.chave, { acao: "registrar", resposta, ...extra }, { token: TOKEN[quem], schema });
}
async function opcoesDeEntrar(schema = "staging"): Promise<string> {
  const op = await corpoDe(await pedir(f.restaurar, { acao: "opcoes" }, { schema }));
  expect(op.ok, JSON.stringify(op)).toBe(true);
  return (op.opcoes as { challenge: string }).challenge;
}
async function entrar(resposta: unknown, schema = "staging"): Promise<Response> {
  return pedir(f.restaurar, { acao: "entrar", resposta }, { schema });
}
const codigosDoLog = () => linhasDoLog.map((l) => (JSON.parse(l) as { codigo?: string }).codigo);

describe("restaurar-login — o caminho inteiro (registrar → entrar → sessão)", () => {
  it("a Lia registra no celular velho e o celular novo entra sozinho na conta dela: só a sessão volta, com o e-mail SÓ do dono da chave", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    const r = await registrar(a, LIA, { nuvem: true, aparelho: { modelo: "motorola moto g(7)", android: 10 }, versao: "3.140" });
    expect(r.status).toBe(200);
    expect(await corpoDe(r)).toEqual({ ok: true, credencial: a.id });
    expect(banco.chaves.get(a.id)).toMatchObject({ userId: LIA, alg: -7, origem: ORIGEM_PLAY, apagada: null, nuvem: true, aparelho: "motorola moto g(7) · Android 10" });

    const desafio = await opcoesDeEntrar();
    const resposta = await a.entrar(desafio);
    expect((resposta.response as { userHandle: string }).userHandle).toBe(userHandleDe(LIA));
    const e = await entrar(resposta);
    expect(e.status).toBe(200);
    expect(e.headers.get("Cache-Control")).toBe("no-store");
    const corpo = await corpoDe(e);
    expect(corpo).toEqual({
      ok: true,
      sessao: { access_token: `eyJacesso.${LIA}.x`, refresh_token: `refresh-${LIA}`, expires_in: 3600, expires_at: 1793333333, token_type: "bearer", user: { id: LIA } },
    });
    expect(JSON.stringify(corpo)).not.toContain("@");
    // a opção A: o link de uso único é pedido para o e-mail do DONO DA CHAVE e gasto aqui dentro (verify com o hashed_token)
    expect(auth.chamadas.map((c) => c.url.replace("https://ref-de-teste.supabase.co", ""))).toEqual(["/auth/v1/admin/generate_link", "/auth/v1/verify"]);
    // recovery (para e-mail que não existe o Auth dá 404 sem criar conta — achado 8)
    expect(auth.chamadas[0].corpo).toEqual({ type: "recovery", email: EMAIL[LIA] });
    expect(auth.chamadas[1].corpo).toEqual({ type: "email", token_hash: `hash-${LIA}` });
    expect(banco.chaves.get(a.id)).toMatchObject({ usos: 1, contador: 0 });
    expect(codigosDoLog()).toContain("restaurado");
    // nada de e-mail, token, hash ou resposta do Android no log
    const log = linhasDoLog.join("\n");
    for (const proibido of [EMAIL[LIA], "eyJacesso", "refresh-", "hash-", "segredo", "123456", (resposta.response as { signature: string }).signature, a.id]) {
      expect(log).not.toContain(proibido);
    }
  });

  it("RS256 também; o registro guarda o BE/BS e a origem de upload vale no staging", async () => {
    const a = await criarAutenticador(ORIGEM_UPLOAD, -257);
    const op = await corpoDe(await pedir(f.chave, { acao: "opcoes" }, { token: TOKEN[LIA] }));
    const resposta = await a.registrar(op.opcoes as { challenge: string; user: { id: string } }, { be: true, bs: false });
    expect((await pedir(f.chave, { acao: "registrar", resposta }, { token: TOKEN[LIA] })).status).toBe(200);
    expect(banco.chaves.get(a.id)).toMatchObject({ alg: -257, origem: ORIGEM_UPLOAD, be: true, bs: false });
    expect((await entrar(await a.entrar(await opcoesDeEntrar()))).status).toBe(200);
  });
});

describe("restaurar-login — o desafio, a origem, a assinatura e a chave apagada", () => {
  it("o desafio não repete: a MESMA resposta de novo → 409 desafio_invalido (gasto; NÃO é 401, que apagaria a chave — 2ª revisão)", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    await registrar(a);
    const resposta = await a.entrar(await opcoesDeEntrar());
    expect((await entrar(resposta)).status).toBe(200);
    const de2 = await entrar(resposta);
    expect(de2.status).toBe(409);
    expect(await corpoDe(de2)).toEqual({ ok: false, erro: "desafio_invalido" });
    expect(codigosDoLog()).toContain("desafio_ja_usado");
    expect(auth.chamadas).toHaveLength(2); // só a 1ª emitiu sessão
  });

  it("origem errada e assinatura de outra chave → 403 conferencia_falhou (não 401) SEM gastar o desafio: a resposta certa com ele entra", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    const b = await criarAutenticador(ORIGEM_PLAY);
    await registrar(a);
    const d1 = await opcoesDeEntrar();
    const r1 = await entrar(await a.entrar(d1, { origem: ORIGEM_FALSA }));
    expect([r1.status, (await corpoDe(r1)).erro]).toEqual([403, "conferencia_falhou"]);
    const certa = await a.entrar(d1);
    const daOutra = await b.entrar(d1, { userHandle: userHandleDe(LIA) });
    const falsa = { ...certa, response: { ...(certa.response as object), signature: (daOutra.response as { signature: string }).signature } };
    expect((await entrar(falsa)).status).toBe(403);
    // sem o UP (o bit tirado: a conferência recusa antes da assinatura) também 403
    expect((await entrar(await a.entrar(d1, { up: false }))).status).toBe(403);
    expect(codigosDoLog()).toEqual(expect.arrayContaining(["origem_invalida", "assinatura_invalida", "presenca_ausente"]));
    expect(auth.chamadas).toHaveLength(0);
    expect([...banco.desafios.values()].filter((d) => d.tipo === "entrar")).toHaveLength(0);
    expect((await entrar(certa)).status).toBe(200);
    expect((await entrar(certa)).status).toBe(409); // e agora sim: gasto (409, não 401 — a chave segue valendo)
  });

  it("o desafio de entrar é SEM ESTADO: o opcoes não chama o banco; o desafio de outro segredo, de outro schema, mexido ou vencido → 409", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    await registrar(a);
    banco.rpcs = [];
    const d = await opcoesDeEntrar();
    expect(banco.rpcs).toEqual([]);
    expect(base64urlParaBytes(d)).toHaveLength(32);
    const outroSegredo = await criarDesafioEntrar(new Uint8Array(32).fill(7), "staging");
    const doPublic = await criarDesafioEntrar(segredoDoDesafio(SEGREDO)!, "public");
    const vencido = await criarDesafioEntrar(segredoDoDesafio(SEGREDO)!, "staging", Math.floor(Date.now() / 1000) - 301);
    const mexido = (() => {
      const b = base64urlParaBytes(d)!;
      b[20] ^= 1;
      return bytesParaBase64url(b);
    })();
    for (const x of [outroSegredo, doPublic, vencido, mexido]) {
      const r = await entrar(await a.entrar(x));
      expect([r.status, (await corpoDe(r)).erro]).toEqual([409, "desafio_invalido"]);
    }
    expect(codigosDoLog()).toEqual(expect.arrayContaining(["desafio_assinatura", "desafio_vencido"]));
    // nada disso chegou ao banco: o desafio que não é nosso nem consulta a chave
    expect(banco.rpcs).toEqual([]);
    expect((await entrar(await a.entrar(d))).status).toBe(200);
  });

  it("sem o segredo do desafio nas funções: 503 indisponivel e o aviso (nunca um desafio sem marca)", async () => {
    f = await carregar(true);
    const r = await pedir(f.restaurar, { acao: "opcoes" });
    expect([r.status, await corpoDe(r)]).toEqual([503, { ok: false, erro: "indisponivel" }]);
    expect(codigosDoLog()).toContain("sem_segredo_do_desafio");
    // parou ali, de propósito (não foi uma exceção no meio do caminho)
    expect(codigosDoLog()).not.toContain("excecao");
  });

  it("a chave apagada (o Sair local) → 401; a outra chave da pessoa segue valendo", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    const b = await criarAutenticador(ORIGEM_PLAY);
    await registrar(a);
    await registrar(b);
    const ap = await pedir(f.chave, { acao: "apagar", credencial: a.id }, { token: TOKEN[LIA] });
    expect(await corpoDe(ap)).toEqual({ ok: true, apagadas: 1 });
    expect((await entrar(await a.entrar(await opcoesDeEntrar()))).status).toBe(401);
    expect((await entrar(await b.entrar(await opcoesDeEntrar()))).status).toBe(200);
  });

  it("o Sair (todas) apaga as chaves da pessoa e só dela: nenhuma entra mais; a do Otto segue", async () => {
    const [a, b, o] = await Promise.all([criarAutenticador(ORIGEM_PLAY), criarAutenticador(ORIGEM_PLAY), criarAutenticador(ORIGEM_PLAY)]);
    await registrar(a);
    await registrar(b);
    await registrar(o, OTTO);
    expect(await corpoDe(await pedir(f.chave, { acao: "apagar", todas: true }, { token: TOKEN[LIA] }))).toEqual({ ok: true, apagadas: 2 });
    for (const x of [a, b]) expect((await entrar(await x.entrar(await opcoesDeEntrar()))).status).toBe(401);
    expect(banco.chaves.get(a.id)?.apagada).toBe("saiu_todos");
    expect((await entrar(await o.entrar(await opcoesDeEntrar()))).status).toBe(200);
  });

  it("o userHandle de outra pessoa → 403 conferencia_falhou; o id de uma chave desconhecida → 401 chave_invalida (a única que apaga)", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    await registrar(a);
    const r = await entrar(await a.entrar(await opcoesDeEntrar(), { userHandle: userHandleDe(OTTO) }));
    expect([r.status, (await corpoDe(r)).erro]).toEqual([403, "conferencia_falhou"]);
    const nunca = await criarAutenticador(ORIGEM_PLAY);
    const r2 = await entrar(await nunca.entrar(await opcoesDeEntrar()));
    expect([r2.status, (await corpoDe(r2)).erro]).toEqual([401, "chave_invalida"]);
  });
});

describe("chave-restauracao — o registro (como a pessoa)", () => {
  it("o desafio é DA pessoa: o Otto não grava com o desafio da Lia, e o mesmo desafio não grava 2 vezes", async () => {
    const op = await corpoDe(await pedir(f.chave, { acao: "opcoes" }, { token: TOKEN[LIA] }));
    expect((op.opcoes as { user: { id: string } }).user.id).toBe(userHandleDe(LIA));
    const a = await criarAutenticador(ORIGEM_PLAY);
    const resposta = await a.registrar(op.opcoes as { challenge: string; user: { id: string } });
    // o desafio de outra pessoa ou já usado é "desafio_vencido" (409, passageiro: o app pede de novo — 2ª revisão, achado 3)
    const doOtto = await pedir(f.chave, { acao: "registrar", resposta }, { token: TOKEN[OTTO] });
    expect([doOtto.status, (await corpoDe(doOtto)).erro]).toEqual([409, "desafio_vencido"]);
    expect((await pedir(f.chave, { acao: "registrar", resposta }, { token: TOKEN[LIA] })).status).toBe(200);
    const de2 = await pedir(f.chave, { acao: "registrar", resposta }, { token: TOKEN[LIA] });
    expect([de2.status, (await corpoDe(de2)).erro]).toEqual([409, "desafio_vencido"]);
    expect(banco.chaves.size).toBe(1);
  });

  it("a conferência recusa (origem fora da lista, RP de outro site) e nada é gravado; sem login → 401", async () => {
    const a = await criarAutenticador(ORIGEM_FALSA);
    expect((await registrar(a)).status).toBe(400);
    const b = await criarAutenticador(ORIGEM_PLAY);
    const op = await corpoDe(await pedir(f.chave, { acao: "opcoes" }, { token: TOKEN[LIA] }));
    const resposta = await b.registrar(op.opcoes as { challenge: string; user: { id: string } }, { rpId: "outro.com.br" });
    expect((await pedir(f.chave, { acao: "registrar", resposta }, { token: TOKEN[LIA] })).status).toBe(400);
    expect(banco.chaves.size).toBe(0);
    expect(codigosDoLog()).toEqual(expect.arrayContaining(["origem_invalida", "rp_invalido"]));
    expect((await pedir(f.chave, { acao: "opcoes" }, {})).status).toBe(401);
  });

  it("a substituída (a renovação do aparelho) e o limite de 10 ativas", async () => {
    const velha = await criarAutenticador(ORIGEM_PLAY);
    await registrar(velha);
    const nova = await criarAutenticador(ORIGEM_PLAY);
    expect((await registrar(nova, LIA, { substitui: velha.id })).status).toBe(200);
    expect(banco.chaves.get(velha.id)?.apagada).toBe("substituida");
    for (let i = 0; i < 10; i++) {
      if (i % 5 === 0) f = await carregar(); // o freio da porta (20 pedidos por minuto por pessoa) mora na memória da instância
      expect((await registrar(await criarAutenticador(ORIGEM_PLAY))).status).toBe(200);
    }
    expect(banco.ativas("staging", LIA)).toHaveLength(10);
    expect(banco.chaves.get(nova.id)?.apagada).toBe("limite");
  });

  it("pedido fora do formato → 400 (dados_invalidos / acao_invalida); a RPC do servidor não é chamada pela pessoa", async () => {
    expect(await corpoDe(await pedir(f.chave, { acao: "registrar", resposta: { id: "x" } }, { token: TOKEN[LIA] }))).toEqual({ ok: false, erro: "dados_invalidos" });
    expect(await corpoDe(await pedir(f.chave, { acao: "apagar" }, { token: TOKEN[LIA] }))).toEqual({ ok: false, erro: "dados_invalidos" });
    expect(await corpoDe(await pedir(f.chave, { acao: "outra" }, { token: TOKEN[LIA] }))).toEqual({ ok: false, erro: "acao_invalida" });
    expect(banco.rpcs.filter((r) => /restauracao_(chave|gastar)/.test(r))).toEqual([]);
  });
});

describe("a trava, o schema e a pessoa", () => {
  it("o public SEM a migração: as 2 funções respondem desligado e nada é conferido nem gravado (a restaurar-login nem chama RPC)", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    await registrar(a); // a chave existe no staging
    banco.rpcs = [];
    for (const corpo of [{ acao: "opcoes" }, { acao: "entrar", resposta: await a.entrar("A".repeat(43)) }]) {
      const r = await pedir(f.restaurar, corpo, { schema: "public" });
      expect([r.status, await corpoDe(r)]).toEqual([200, { ok: false, erro: "desligado" }]);
    }
    expect(banco.rpcs).toEqual([]);
    for (const corpo of [{ acao: "opcoes" }, { acao: "apagar", todas: true }]) {
      const r = await pedir(f.chave, corpo, { schema: "public", token: TOKEN[LIA] });
      expect([r.status, await corpoDe(r)]).toEqual([200, { ok: false, erro: "desligado" }]);
    }
    expect(banco.rpcs).toEqual(["public.chave_restauracao_desafio", "public.chave_restauracao_apagar"]);
    expect(codigosDoLog()).toContain("sem_migracao");
    expect(auth.chamadas).toHaveLength(0);
  });

  it("a trava desligada vale NA HORA (o banco confere em cada RPC, mesmo com a trava da função no cache); o apagar segue valendo", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    await registrar(a);
    const desafio = await opcoesDeEntrar(); // a função guardou a trava ligada (60 s)
    banco.trava.set("staging", { ligado: false, so_teste: true });
    expect(await corpoDe(await entrar(await a.entrar(desafio)))).toEqual({ ok: false, erro: "desligado" });
    // o opcoes não vai ao banco (o desafio sem estado): no cache da instância ainda dá um desafio — que não serve para entrar
    const ainda = await corpoDe(await pedir(f.restaurar, { acao: "opcoes" }));
    expect(await corpoDe(await entrar(await a.entrar((ainda.opcoes as { challenge: string }).challenge)))).toEqual({ ok: false, erro: "desligado" });
    expect(await corpoDe(await pedir(f.chave, { acao: "opcoes" }, { token: TOKEN[LIA] }))).toEqual({ ok: false, erro: "desligado" });
    expect(await corpoDe(await pedir(f.chave, { acao: "apagar", todas: true }, { token: TOKEN[LIA] }))).toEqual({ ok: true, apagadas: 1 });
    expect(auth.chamadas).toHaveLength(0);
    // a trava lida pela função (sem cache: a função recarregada) com a linha desligada → nenhuma RPC
    f = await carregar();
    banco.rpcs = [];
    expect(await corpoDe(await pedir(f.restaurar, { acao: "opcoes" }))).toEqual({ ok: false, erro: "desligado" });
    expect(banco.rpcs).toEqual([]);
  });

  it("a pessoa: conta real no staging → 403; so_teste no public barra a conta real (desligado); desativada e e-mail não confirmado → 403", async () => {
    banco.migrado.add("public");
    banco.trava.set("public", { ligado: true, so_teste: false });
    const a = await criarAutenticador(ORIGEM_PLAY);
    // a chave da conta real no staging não nasce pela função (a RPC recusa)…
    const op = await pedir(f.chave, { acao: "opcoes" }, { token: TOKEN[REAL] });
    expect([op.status, (await corpoDe(op)).erro]).toEqual([403, "conta_real_no_staging"]);
    // …e se existir (posta à mão), a entrada recusa depois de conferir a assinatura
    expect((await registrar(a, REAL, {}, "public")).status).toBe(200);
    banco.chaves.get(a.id)!.schema = "staging";
    const r = await entrar(await a.entrar(await opcoesDeEntrar()));
    expect([r.status, (await corpoDe(r)).erro]).toEqual([403, "conta_real_no_staging"]);
    banco.chaves.get(a.id)!.schema = "public";
    banco.usuarios.get(REAL)!.banned_until = "2999-01-01T00:00:00Z";
    const ban = await entrar(await a.entrar(await opcoesDeEntrar("public")), "public");
    expect([ban.status, (await corpoDe(ban)).erro]).toEqual([403, "acesso_desativado"]);
    banco.usuarios.get(REAL)!.banned_until = null;
    banco.usuarios.get(REAL)!.email_confirmed_at = null;
    // o confirmed_at do GoTrue (que também vem do telefone confirmado) NÃO basta: só o email_confirmed_at (achado 7)
    banco.usuarios.get(REAL)!.confirmed_at = "2026-10-01T00:00:00Z";
    const nc = await entrar(await a.entrar(await opcoesDeEntrar("public")), "public");
    expect([nc.status, (await corpoDe(nc)).erro]).toEqual([403, "email_nao_confirmado"]);
    banco.usuarios.get(REAL)!.email_confirmed_at = "2026-10-01T00:00:00Z";
    // so_teste ligado (o recarregar zera o cache da trava): a conta real cai em desligado
    banco.trava.set("public", { ligado: true, so_teste: true });
    f = await carregar();
    const st = await entrar(await a.entrar(await opcoesDeEntrar("public")), "public");
    expect([st.status, (await corpoDe(st)).erro]).toEqual([200, "desligado"]);
    banco.trava.set("public", { ligado: true, so_teste: false });
    f = await carregar();
    expect((await entrar(await a.entrar(await opcoesDeEntrar("public")), "public")).status).toBe(200);
    expect(auth.chamadas.filter((c) => c.url.endsWith("generate_link")).map((c) => c.corpo.email)).toEqual([EMAIL[REAL]]);
  });
});

describe("a revisão de segurança: a chave amarrada à sessão, o master, as 2 etapas, os tetos e o link", () => {
  it("a sessão que registrou a chave acabou (o Sair em outro lugar, a revogação, a troca de senha no Auth) → 401: a chave morre junto", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    await registrar(a);
    expect(banco.chaves.get(a.id)?.sessao).toBe(banco.sessaoDoToken.get(TOKEN[LIA]));
    expect((await entrar(await a.entrar(await opcoesDeEntrar()))).status).toBe(200);
    banco.sessoesVivas.delete(banco.sessaoDoToken.get(TOKEN[LIA])!);
    const r = await entrar(await a.entrar(await opcoesDeEntrar()));
    expect([r.status, (await corpoDe(r)).erro]).toEqual([401, "chave_invalida"]);
    // e uma sessão que não existe no Auth não registra chave nenhuma
    const b = await criarAutenticador(ORIGEM_PLAY);
    const op = await pedir(f.chave, { acao: "opcoes" }, { token: TOKEN[LIA] });
    expect(op.status).toBe(200);
    const g = await pedir(f.chave, { acao: "registrar", resposta: await b.registrar((await corpoDe(op)).opcoes as { challenge: string; user: { id: string } }) },
      { token: TOKEN[LIA] });
    expect([g.status, (await corpoDe(g)).erro]).toEqual([401, "sem_login"]);
  });

  it("a conta excluída (soft delete: deleted_at) → 401; a chave dela não entra", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    await registrar(a);
    banco.usuarios.get(LIA)!.deleted_at = "2026-10-30T06:00:00Z";
    const r = await entrar(await a.entrar(await opcoesDeEntrar()));
    expect([r.status, (await corpoDe(r)).erro]).toEqual([401, "chave_invalida"]);
    expect(auth.chamadas).toHaveLength(0);
  });

  it("o master não tem chave: o registro recusa (o papel no Auth ou o perfil) e a chave posta à mão não entra (403 conta_master)", async () => {
    banco.usuarios.get(LIA)!.app_metadata = { role: "master" };
    const op = await pedir(f.chave, { acao: "opcoes" }, { token: TOKEN[LIA] });
    expect([op.status, (await corpoDe(op)).erro]).toEqual([403, "conta_master"]);
    banco.usuarios.get(LIA)!.app_metadata = {};
    const a = await criarAutenticador(ORIGEM_PLAY);
    expect((await registrar(a)).status).toBe(200);
    banco.perfisMaster.add(LIA);
    const r = await entrar(await a.entrar(await opcoesDeEntrar()));
    expect([r.status, (await corpoDe(r)).erro]).toEqual([403, "conta_master"]);
    banco.perfisMaster.delete(LIA);
    banco.usuarios.get(LIA)!.app_metadata = { role: "master" };
    // o papel no Auth (só o banco confere o perfil; a função confere o papel também — getUserById)
    banco.recusa = ((orig) => (schema: string, userId: string | null) => (userId ? null : orig.call(banco, schema, userId)))(banco.recusa);
    const r2 = await entrar(await a.entrar(await opcoesDeEntrar()));
    expect([r2.status, (await corpoDe(r2)).erro]).toEqual([403, "conta_master"]);
    expect(auth.chamadas).toHaveLength(0);
  });

  it("conta com o código de 2 etapas: em aal1 não registra (403 precisa_2fa); em aal2, registra", async () => {
    banco.fatores.add(LIA);
    const op = await pedir(f.chave, { acao: "opcoes" }, { token: TOKEN[LIA] });
    expect([op.status, (await corpoDe(op)).erro]).toEqual([403, "precisa_2fa"]);
    banco.aal.set(TOKEN[LIA], "aal2");
    expect((await registrar(await criarAutenticador(ORIGEM_PLAY))).status).toBe(200);
  });

  it("no máximo 3 entradas por chave por hora: a 4ª → 429 muitas_tentativas (nunca 401, que faria o app apagar a chave)", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    await registrar(a);
    for (let i = 0; i < 3; i++) expect((await entrar(await a.entrar(await opcoesDeEntrar()))).status).toBe(200);
    const r = await entrar(await a.entrar(await opcoesDeEntrar()));
    expect([r.status, await corpoDe(r)]).toEqual([429, { ok: false, erro: "muitas_tentativas" }]);
    expect(codigosDoLog()).toContain("limite_da_chave");
    expect(banco.chaves.get(a.id)?.usos).toBe(3);
  });

  it("o teto por pessoa: 20 registros em 24 h → 429; e no máximo 20 apagadas guardadas (o resto sai de vez)", async () => {
    for (let i = 0; i < 20; i++) {
      if (i % 5 === 0) f = await carregar(); // o freio da porta (20 pedidos por minuto por pessoa) mora na memória da instância
      expect((await registrar(await criarAutenticador(ORIGEM_PLAY))).status).toBe(200);
    }
    f = await carregar();
    const r = await registrar(await criarAutenticador(ORIGEM_PLAY));
    expect([r.status, (await corpoDe(r)).erro]).toEqual([429, "muitas_tentativas"]);
    expect(banco.ativas("staging", LIA)).toHaveLength(10);
    expect([...banco.chaves.values()].filter((c) => c.userId === LIA && c.apagada === "limite")).toHaveLength(10);
    expect(await corpoDe(await pedir(f.chave, { acao: "apagar", todas: true }, { token: TOKEN[LIA] }))).toEqual({ ok: true, apagadas: 10 });
    // 20 apagadas (10 limite + 10 saiu_todos) cabem; o id grande demais (> 128) é recusado
    expect([...banco.chaves.values()].filter((c) => c.userId === LIA)).toHaveLength(20);
  });

  it("o link de uso único que volta de OUTRA pessoa (o e-mail mudou de dono no meio): não faz o verify; 503 e o aviso", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    await registrar(a);
    auth.linkDeOutra = true;
    const r = await entrar(await a.entrar(await opcoesDeEntrar()));
    expect([r.status, await corpoDe(r)]).toEqual([503, { ok: false, erro: "indisponivel" }]);
    expect(auth.chamadas.map((c) => c.url.replace("https://ref-de-teste.supabase.co", ""))).toEqual(["/auth/v1/admin/generate_link"]);
    expect(codigosDoLog()).toContain("generate_link_outra_pessoa");
  });
});

describe("a borda: método, schema, corpo, freio e o Auth fora do ar", () => {
  it("OPTIONS, GET, x-schema inválido, corpo grande ou que não é JSON, ação desconhecida", async () => {
    const op = await f.restaurar(new Request("https://x/functions/v1/restaurar-login", { method: "OPTIONS", headers: { Origin: "https://localhost" } }));
    expect([op.status, op.headers.get("Access-Control-Allow-Origin")]).toEqual([200, "https://localhost"]);
    expect((await pedir(f.restaurar, null, { metodo: "GET" })).status).toBe(405);
    expect(await corpoDe(await pedir(f.restaurar, { acao: "opcoes" }, { schema: "outro" }))).toEqual({ ok: false, erro: "schema_invalido" });
    expect((await pedir(f.restaurar, null, { bruto: JSON.stringify({ acao: "entrar", x: "a".repeat(40_000) }) })).status).toBe(413);
    expect(await corpoDe(await pedir(f.restaurar, null, { bruto: "{não é json" }))).toEqual({ ok: false, erro: "dados_invalidos" });
    expect(await corpoDe(await pedir(f.restaurar, { acao: "outra" }))).toEqual({ ok: false, erro: "acao_invalida" });
    expect(await corpoDe(await pedir(f.restaurar, { acao: "entrar", resposta: { id: "x" } }))).toEqual({ ok: false, erro: "dados_invalidos" });
  });

  it("o freio: 30 pedidos por minuto por IP na restaurar-login (o 31º → 429; outro IP segue); 20 por pessoa na chave-restauracao", async () => {
    for (let i = 0; i < 30; i++) expect((await pedir(f.restaurar, { acao: "opcoes" }, { ip: "198.51.100.7" })).status).toBe(200);
    expect(await corpoDe(await pedir(f.restaurar, { acao: "opcoes" }, { ip: "198.51.100.7" }))).toEqual({ ok: false, erro: "muitas_tentativas" });
    expect((await pedir(f.restaurar, { acao: "opcoes" }, { ip: "198.51.100.8" })).status).toBe(200);
    for (let i = 0; i < 20; i++) expect((await pedir(f.chave, { acao: "opcoes" }, { token: TOKEN[LIA] })).status).toBe(200);
    expect(await corpoDe(await pedir(f.chave, { acao: "opcoes" }, { token: TOKEN[LIA] }))).toEqual({ ok: false, erro: "muitas_acoes" });
    expect((await pedir(f.chave, { acao: "opcoes" }, { token: TOKEN[OTTO] })).status).toBe(200);
  });

  it("o Auth fora do ar (generate_link 500 / verify 403) → 503 indisponivel com o código no log; a sessão de outra pessoa nunca sai", async () => {
    const a = await criarAutenticador(ORIGEM_PLAY);
    await registrar(a);
    auth.generate = 500;
    const g = await entrar(await a.entrar(await opcoesDeEntrar()));
    expect([g.status, await corpoDe(g)]).toEqual([503, { ok: false, erro: "indisponivel" }]);
    auth.generate = 200;
    auth.verify = 403;
    expect((await entrar(await a.entrar(await opcoesDeEntrar()))).status).toBe(503);
    auth.verify = 200;
    auth.outraPessoa = true;
    const o = await entrar(await a.entrar(await opcoesDeEntrar()));
    expect([o.status, await corpoDe(o)]).toEqual([503, { ok: false, erro: "indisponivel" }]);
    expect(codigosDoLog()).toEqual(expect.arrayContaining(["generate_link_500", "verify_403", "sessao_invalida"]));
    expect(linhasDoLog.join("\n")).not.toContain(EMAIL[LIA]);
  });
});
