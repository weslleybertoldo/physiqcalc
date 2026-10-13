// Physiq hml-21a (H-43 · jeito 2, etapa 3) — o CONTRATO tela × servidor da função conta: cada lib que mudou (a casca e o app do aluno)
// chama lerConta/acaoConta com os params certos, o corpo PASSA nas regras REAIS do servidor (o catálogo e as listas fechadas de
// supabase-principal/functions/_shared/conta-{leituras,regras}.ts: nenhuma chave a mais, nenhum valor fora da forma) e devolve o MESMO
// tipo de hoje. A função responde pelos MÓDULOS DE VERDADE (src/test/contaFalsa.ts) sobre o banco falso deste teste. E as unidades dos 2
// invólucros (src/conta/ler.ts e gravar.ts): 1 chamada, sem repetir, sem_internet antes de chamar, o erro com o código e a frase fixa.
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lerPedidoDeLeitura, type CatalogoLeitura } from "../../supabase-principal/functions/_shared/leitura-lote";
import { CONSULTAS_CONTA } from "../../supabase-principal/functions/_shared/conta-leituras";
import { CORPOS_DAS_ACOES, lerCorpoDaAcao, moduloDoPedido, type AcaoConta } from "../../supabase-principal/functions/_shared/conta-regras";

const EU = "33333333-3333-4333-8333-333333333333";
const A1 = "a1111111-1111-4111-8111-111111111111";
const A2 = "a2222222-2222-4222-8222-222222222222";

type Banco = {
  rpc?: (nome: string, args?: Record<string, unknown>) => unknown;
  from?: (t: string) => Record<string, unknown>;
  storage?: { from: (b: string) => Record<string, unknown> };
};
const h = vi.hoisted(() => ({
  eu: "33333333-3333-4333-8333-333333333333",
  banco: {} as Record<string, unknown>,
  corpos: [] as Array<{ nome: string; corpo: Record<string, unknown> }>,
  falhaDaChamada: null as unknown,
  sessao: { access_token: "x" } as unknown,
  upload: vi.fn(),
  recarregar: vi.fn(async () => null),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/principal/client", async () => {
  const { invocarContaPeloModulo } = await import("@/test/contaFalsa");
  // o "banco" do teste muda a cada caso: o falso da função lê o h.banco na hora
  const banco = {
    rpc: (...a: unknown[]) => (h.banco as Banco).rpc?.(...(a as [string, Record<string, unknown>])),
    from: (t: string) => (h.banco as Banco).from?.(t),
    storage: { from: (b: string) => (h.banco as Banco).storage?.from(b) },
  };
  const conta = invocarContaPeloModulo(banco, { userId: h.eu });
  return {
    PRINCIPAL_URL: "https://api-principal.physiqcalc.com.br",
    PRINCIPAL_SCHEMA: "staging",
    principalConfigurado: true,
    principal: {
      auth: { getSession: async () => ({ data: { session: h.sessao } }), updateUser: async () => ({ error: null }), refreshSession: async () => ({}) },
      storage: { from: (bucket: string) => ({ uploadToSignedUrl: (...a: unknown[]) => h.upload(bucket, ...a) }) },
      functions: {
        invoke: async (nome: string, o: { body: Record<string, unknown> }) => {
          h.corpos.push({ nome, corpo: o.body });
          if (h.falhaDaChamada) return { data: null, error: h.falhaDaChamada };
          return nome === "conta" ? conta(o.body) : { data: null, error: { name: "FunctionsHttpError" } };
        },
      },
    },
  };
});
vi.mock("@/nucleo/sessao", () => ({
  useSessao: () => ({ usuario: { id: h.eu, email: "aluna@teste.app", identities: [{ provider: "email" }], app_metadata: {} }, recarregarSituacao: h.recarregar }),
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "web", isPluginAvailable: () => false, isNativePlatform: () => false },
  registerPlugin: () => ({}),
}));
vi.mock("@capacitor/push-notifications", () => ({ PushNotifications: {} }));

import { ErroGravacaoConta, acaoConta, codigoDaGravacao, mensagemErroGravacaoConta, resultadoDaAcao } from "./gravar";
import { ErroLeitura, codigoDaLeitura, lerConta } from "./ler";
import { buscarAvisos, useAvisos } from "@/ui/premium/useAvisos";
import { salvarMinhaSenha } from "@/nucleo/senha";
import { esquecerAparelhoPush, salvarToken } from "@/push/aparelho";
import { guardarToken } from "@/push/regras";
import { aceitarNoAcesso } from "@/publico/legal/aceite/api";
import { ErroPerfil, meuPerfilAluno, minhaAgenda, minhaAgendaLista } from "@/app-aluno/perfil/pecas/api";
import { ErroApp, buscarMeuPlano, buscarPratos, entrarSemProfissional, mudarObjetivo } from "@/app-aluno/sozinho/api";
import { enviarFotoPerfil, subirFotoPerfil, urlPublica } from "@/painel/configuracoes/perfil/foto";
import Conta from "@/app-aluno/perfil/Conta";

/** O corpo que a tela mandou PASSA nas regras reais do servidor: a ação/as consultas conhecidas e NENHUMA chave fora da lista. */
function passaNoServidor(corpo: Record<string, unknown>) {
  const pedido = moduloDoPedido(corpo);
  expect(pedido, JSON.stringify(corpo)).not.toBeNull();
  if (pedido!.modulo === "leitura") {
    const r = lerPedidoDeLeitura(corpo, CONSULTAS_CONTA as unknown as CatalogoLeitura);
    expect(r.ok).toBe(true);
    const itens = (corpo.itens as Array<Record<string, unknown>>) ?? [];
    for (const item of itens) {
      const declarados = Object.keys((CONSULTAS_CONTA as Record<string, { params: object }>)[String(item.q)].params);
      expect(Object.keys(item).filter((k) => k !== "q" && !declarados.includes(k)), String(item.q)).toEqual([]);
    }
    if (r.ok === true) for (const i of r.itens) expect(i.ok, JSON.stringify(i)).toBe(true);
    return;
  }
  const acao = pedido!.acao as AcaoConta;
  expect(lerCorpoDaAcao(acao, corpo)).toMatchObject({ ok: true });
  const declarados = Object.keys(CORPOS_DAS_ACOES[acao]);
  expect(Object.keys(corpo).filter((k) => k !== "acao" && !declarados.includes(k)), acao).toEqual([]);
}
const daConta = () => h.corpos.filter((c) => c.nome === "conta").map((c) => c.corpo);

beforeEach(() => {
  h.banco = {};
  h.corpos = [];
  h.falhaDaChamada = null;
  h.sessao = { access_token: "x" };
  h.upload.mockReset().mockResolvedValue({ data: { path: "ok" }, error: null });
  h.recarregar.mockClear();
  h.toast.success.mockClear();
  h.toast.error.mockClear();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  localStorage.clear();
});
afterEach(() => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

// ───────────────────────── os 2 invólucros ─────────────────────────
describe("hml-21a — src/conta/gravar.ts (acaoConta) e src/conta/ler.ts (lerConta)", () => {
  it("acaoConta: 1 chamada à `conta` com a ação POR ÚLTIMO (nenhum campo troca a ação); devolve o corpo da função", async () => {
    h.banco = { rpc: () => ({ data: true, error: null }) };
    const r = await acaoConta("senha_definida", { acao: "perfil_nome" } as Record<string, unknown>);
    expect(r).toEqual({ ok: true, definida: true });
    expect(h.corpos).toEqual([{ nome: "conta", corpo: { acao: "senha_definida" } }]);
  });

  it("acaoConta: sem internet → sem_internet ANTES de chamar; a rede que cai → rede; o erro da função → o código com a frase fixa", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await expect(acaoConta("senha_definida")).rejects.toMatchObject({ codigo: "sem_internet" });
    expect(h.corpos).toEqual([]);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    h.falhaDaChamada = { name: "FunctionsFetchError", message: "Failed to send a request" };
    await expect(acaoConta("senha_definida")).rejects.toMatchObject({ codigo: "rede" });
    h.falhaDaChamada = null;
    h.banco = { rpc: () => ({ data: null, error: { code: "42501", message: "permission denied for function minha_senha_definida" } }) };
    const e = await acaoConta("senha_definida").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErroGravacaoConta);
    expect(e).toMatchObject({ codigo: "sem_acesso", message: mensagemErroGravacaoConta("sem_acesso") });
    expect(String((e as Error).message)).not.toContain("permission denied");
    // o código para as telas do app: a rede que caiu = sem_internet
    expect([codigoDaGravacao(new ErroGravacaoConta("rede")), codigoDaGravacao(new Error("x")), codigoDaGravacao(new ErroGravacaoConta("conflito"))]).toEqual(["sem_internet", "erro_interno", "conflito"]);
    expect(resultadoDaAcao({ resultado: { ok: true } })).toEqual({ ok: true });
    expect(resultadoDaAcao({ resultado: [1] })).toEqual({});
  });

  it("lerConta: as leituras da mesma volta = 1 chamada `ler` com os itens; o erro do item → ErroLeitura com o código (rede → sem_internet)", async () => {
    h.banco = { rpc: (nome: string) => ({ data: { de: nome }, error: null }), from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) };
    const [a, b] = await Promise.all([lerConta("meu_perfil_aluno"), lerConta("avisos")]);
    expect([a, b]).toEqual([{ valor: { de: "meu_perfil_aluno" } }, { linhas: [] }]);
    expect(daConta()).toEqual([{ acao: "ler", itens: [{ q: "meu_perfil_aluno" }, { q: "avisos" }] }]);
    expect([codigoDaLeitura(new ErroLeitura("rede")), codigoDaLeitura(new ErroLeitura("sem_login")), codigoDaLeitura("x")]).toEqual(["sem_internet", "sem_login", "erro_interno"]);
  });
});

// ───────────────────────── a casca ─────────────────────────
describe("hml-21a — o sino (useAvisos) pela conta: a mesma lista, 1 ação ao abrir (decisão M)", () => {
  const avisos = [
    { id: A1, tipo: "plano_atualizado", titulo: "Plano", link: "/dieta", lido_em: null, criado_em: "2026-10-12T10:00:00Z" },
    { id: A2, tipo: "consulta_marcada", titulo: "Consulta", link: null, lido_em: "2026-10-11T10:00:00Z", criado_em: "2026-10-11T09:00:00Z" },
  ];
  const lista = () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: avisos, error: null }) }) }) });

  it("buscarAvisos: q avisos (o corpo passa no servidor), o MESMO EstadoAvisos de hoje; sem sessão → vazio sem chamar", async () => {
    h.banco = { from: () => lista() };
    expect(await buscarAvisos()).toEqual({ disponivel: true, avisos });
    for (const c of daConta()) passaNoServidor(c);
    h.corpos = [];
    h.sessao = null;
    expect(await buscarAvisos()).toEqual({ disponivel: false, avisos: [] });
    expect(h.corpos).toEqual([]);
  });

  it("abrir com não lidos = 1 acaoConta(avisos_marcar_lidos) com os ids não lidos; a que FALHA não repete (o `retry: 1` de hoje fazia 2)", async () => {
    const updates: unknown[] = [];
    h.banco = { from: () => ({ ...lista(), update: (v: unknown) => (updates.push(v), { in: () => ({ eq: () => ({ select: async () => ({ data: null, error: { code: "XX000", message: "boom" } }) }) }) }) }) };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useAvisos(), { wrapper });
    await waitFor(() => expect(result.current.avisos).toHaveLength(2));
    expect(result.current.naoLidos).toBe(1);
    h.corpos = [];
    act(() => result.current.marcarLidos());
    await waitFor(() => expect(updates).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 1500));
    expect(daConta()).toEqual([{ ids: [A1], acao: "avisos_marcar_lidos" }]);
    passaNoServidor(daConta()[0]);
    expect(updates).toHaveLength(1);
  });
});

describe("hml-21a — a sessão, a senha, o push e o aceite pela conta", () => {
  it("salvarMinhaSenha: o updateUser (login) fica; a marca vai pela ação senha_definida (a mesma RPC); a falha dela não desfaz", async () => {
    const rpcs: unknown[] = [];
    h.banco = { rpc: (...a: unknown[]) => (rpcs.push(a), { data: true, error: null }) };
    expect(await salvarMinhaSenha("senha-nova-123")).toEqual({ ok: true });
    expect(rpcs).toEqual([["minha_senha_definida"]]);
    passaNoServidor(daConta()[0]);
    h.banco = { rpc: () => ({ data: null, error: { code: "XX000", message: "boom" } }) };
    expect(await salvarMinhaSenha("senha-nova-123")).toEqual({ ok: true });
  });

  it("push: salvarToken → push_registrar com o token, a plataforma e a versão (o { ok } da RPC decide); esquecer → push_esquecer", async () => {
    const TOKEN = "fcm-token-de-teste-0123456789abcdef";
    const rpcs: unknown[] = [];
    h.banco = { rpc: (...a: unknown[]) => (rpcs.push(a), { data: { ok: true }, error: null }) };
    expect(await salvarToken(EU, TOKEN)).toBe(true);
    h.banco = { rpc: (...a: unknown[]) => (rpcs.push(a), { data: { ok: false, erro: "token_invalido" }, error: null }) };
    expect(await salvarToken(EU, TOKEN)).toBe(false);
    guardarToken(EU, TOKEN);
    h.banco = { rpc: (...a: unknown[]) => (rpcs.push(a), { data: { ok: true, apagados: 1 }, error: null }) };
    await esquecerAparelhoPush();
    expect(rpcs).toEqual([
      ["push_registrar", { p_token: TOKEN, p_plataforma: "android", p_versao: null }],
      ["push_registrar", { p_token: TOKEN, p_plataforma: "android", p_versao: null }],
      ["push_esquecer", { p_token: TOKEN }],
    ]);
    for (const c of daConta()) passaNoServidor(c);
  });

  it("aceitarNoAcesso: aceitar_textos com os 5 de hoje; o { ok, legal } e o { ok: false, erro, versao } da RPC iguais; a chamada que cai → sem_internet/erro_interno", async () => {
    const rpcs: unknown[] = [];
    h.banco = { rpc: (...a: unknown[]) => (rpcs.push(a), { data: { ok: false, erro: "versao_desatualizada", versao: "2" }, error: null }) };
    expect(await aceitarNoAcesso({ versao: "1", origem: "site", saude: true, nascimento: "1990-05-20" })).toEqual({ ok: false, erro: "versao_desatualizada", versao: "2" });
    expect(rpcs).toEqual([["aceitar_no_acesso", { p_versao: "1", p_origem: "site", p_saude: true, p_nascimento: "1990-05-20", p_versao_app: null }]]);
    passaNoServidor(daConta()[0]);
    h.banco = { rpc: () => ({ data: { ok: true, legal: { pendente: false } }, error: null }) };
    expect(await aceitarNoAcesso({ versao: "1", origem: "apk", saude: false, nascimento: null })).toMatchObject({ ok: true });
    h.falhaDaChamada = { name: "FunctionsFetchError" };
    expect(await aceitarNoAcesso({ versao: "1", origem: "site", saude: false, nascimento: null })).toEqual({ ok: false, erro: "sem_internet", versao: null });
    h.falhaDaChamada = null;
    h.banco = { rpc: () => ({ data: null, error: { code: "XX000", message: "boom" } }) };
    expect(await aceitarNoAcesso({ versao: "1", origem: "site", saude: false, nascimento: null })).toEqual({ ok: false, erro: "erro_interno", versao: null });
  });
});

// ───────────────────────── o app do aluno ─────────────────────────
describe("hml-21a — o Perfil e a Agenda do aluno (pecas/api) pela conta: a mesma assinatura e o mesmo tipo", () => {
  it("meuPerfilAluno / minhaAgenda / minhaAgendaLista: as consultas certas (o corpo passa no servidor) e o MESMO tipo de hoje", async () => {
    const valores: Record<string, unknown> = {
      meu_perfil_aluno: { nome: "Aluna", foto_url: null, foto_propria: null, aluno_desde: "2026-01-01", objetivo: null, profissionais: [{ id: A1 }] },
      minha_agenda: [{ id: A2, titulo: "Consulta" }],
      minha_agenda_lista: { ok: true, total: 21, itens: [{ id: A2 }] },
    };
    const rpcs: unknown[] = [];
    h.banco = { rpc: (nome: string, args?: Record<string, unknown>) => (rpcs.push([nome, args ?? null]), { data: valores[nome], error: null }) };
    const desde = new Date("2026-07-14T03:00:00.000Z");
    const [perfil, agenda, pagina] = await Promise.all([meuPerfilAluno(), minhaAgenda(desde), minhaAgendaLista("proximas", 2)]);
    expect(perfil).toEqual({ nome: "Aluna", foto_url: null, foto_propria: null, aluno_desde: "2026-01-01", objetivo: null, profissionais: [{ id: A1 }] });
    expect(agenda).toEqual([{ id: A2, titulo: "Consulta" }]);
    expect(pagina).toEqual({ itens: [{ id: A2 }], total: 21 });
    // as 3 numa ida só (o lote da tela) com os args de hoje
    expect(daConta()).toHaveLength(1);
    passaNoServidor(daConta()[0]);
    expect(rpcs).toEqual([
      ["meu_perfil_aluno", null], ["minha_agenda", { p_desde: "2026-07-14T03:00:00.000Z" }], ["minha_agenda_lista", { p_tipo: "proximas", p_offset: 20, p_limite: 20 }],
    ]);
  });

  it("o erro → ErroPerfil com o código (o mesmo tipo de erro de hoje; as telas só olham o isError); a página sem o ok → erro_interno", async () => {
    h.banco = { rpc: () => ({ data: null, error: { code: "42501", message: "x" } }) };
    await expect(meuPerfilAluno()).rejects.toBeInstanceOf(ErroPerfil);
    await expect(minhaAgenda(new Date())).rejects.toMatchObject({ codigo: "sem_acesso" });
    h.banco = { rpc: () => ({ data: { ok: false }, error: null }) };
    await expect(minhaAgendaLista("anteriores", 1)).rejects.toMatchObject({ codigo: "erro_interno" });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await expect(meuPerfilAluno()).rejects.toMatchObject({ codigo: "sem_internet" });
  });
});

describe("hml-21a — o aluno sem profissional (sozinho/api: as 4 do principal) pela conta", () => {
  it("buscarMeuPlano e buscarPratos: o `ler` (o objetivo só quando há); o valor da RPC normalizado como hoje", async () => {
    const rpcs: unknown[] = [];
    h.banco = {
      rpc: (nome: string, args?: Record<string, unknown>) => (rpcs.push([nome, args ?? null]), nome === "meu_plano_app"
        ? { data: { teste_dias: 7, planos: [], matricula: null }, error: null }
        : { data: { ok: true, objetivo: "emagrecer", objetivo_do_aluno: null, pratos: [] }, error: null }),
    };
    expect(await buscarMeuPlano()).toMatchObject({ planos: [], matricula: null });
    expect(await buscarPratos("emagrecer")).toMatchObject({ ok: true, objetivo: "emagrecer", pratos: [] });
    expect(await buscarPratos(null)).toMatchObject({ ok: true });
    expect(rpcs).toEqual([["meu_plano_app", null], ["pratos_prontos_do_app", { p_objetivo: "emagrecer" }], ["pratos_prontos_do_app", null]]);
    for (const c of daConta()) passaNoServidor(c);
    h.banco = { rpc: () => ({ data: { ok: false, erro: "sem_plano_alimentacao" }, error: null }) };
    await expect(buscarPratos(null)).rejects.toMatchObject({ codigo: "sem_plano_alimentacao" });
  });

  it("entrarSemProfissional (2 e 5 argumentos) e mudarObjetivo: as ações com os args de hoje; o { ok: false, erro } → ErroApp(erro); sem internet → sem_internet", async () => {
    const rpcs: unknown[] = [];
    h.banco = { rpc: (...a: unknown[]) => (rpcs.push(a), { data: { ok: true, paciente_id: A1, teste_ate: null, ja_era: false }, error: null }) };
    expect(await entrarSemProfissional("emagrecer", "treino")).toEqual({ paciente_id: A1, teste_ate: null, ja_era: false });
    await entrarSemProfissional("manter", "treino_alimentacao", { nascimento: "1990-05-20", consentimento: "2026-10-08", origem: "site" });
    h.banco = { rpc: (...a: unknown[]) => (rpcs.push(a), { data: { ok: true }, error: null }) };
    await mudarObjetivo("ganhar_massa");
    expect(rpcs).toEqual([
      ["entrar_sem_profissional", { p_objetivo: "emagrecer", p_plano: "treino" }],
      ["entrar_sem_profissional", { p_objetivo: "manter", p_plano: "treino_alimentacao", p_nascimento: "1990-05-20", p_consentimento: "2026-10-08", p_origem: "site" }],
      ["mudar_objetivo_app", { p_objetivo: "ganhar_massa" }],
    ]);
    for (const c of daConta()) passaNoServidor(c);
    h.banco = { rpc: () => ({ data: { ok: false, erro: "menor_de_18" }, error: null }) };
    await expect(entrarSemProfissional("manter", "treino")).rejects.toEqual(new ErroApp("menor_de_18"));
    h.banco = { rpc: () => ({ data: { ok: false, erro: "objetivo_invalido" }, error: null }) };
    await expect(mudarObjetivo("manter")).rejects.toMatchObject({ codigo: "objetivo_invalido" });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await expect(buscarMeuPlano()).rejects.toMatchObject({ codigo: "sem_internet" });
    await expect(mudarObjetivo("manter")).rejects.toMatchObject({ codigo: "sem_internet" });
  });
});

describe("hml-21a — a foto do perfil pelo link que o servidor assina (foto.ts) e a Perfil › Conta do aluno", () => {
  const arquivo = () => new File([new Uint8Array([137, 80, 78, 71])], "minha foto.png", { type: "image/png" });

  it("subirFotoPerfil: preparar (o tipo e o tamanho) → o PUT no link assinado (uploadToSignedUrl) → o caminho e a URL pública; enviarFotoPerfil = a mesma assinatura (a URL)", async () => {
    const r = await subirFotoPerfil(arquivo());
    expect(r.bucket).toBe("fotos-perfil-staging");
    expect(r.caminho).toMatch(new RegExp(`^${EU}/foto-\\d+\\.png$`));
    expect(r.url).toBe(`https://api-principal.physiqcalc.com.br/storage/v1/object/public/fotos-perfil-staging/${r.caminho}`);
    expect(h.upload).toHaveBeenCalledWith("fotos-perfil-staging", r.caminho, "token-de-teste", expect.any(File), { contentType: "image/png", cacheControl: "31536000" });
    expect(daConta()[0]).toEqual({ tipo: "image/png", tamanho: 4, acao: "perfil_foto_preparar" });
    passaNoServidor(daConta()[0]);
    expect(await enviarFotoPerfil("o-uid-nao-decide", arquivo())).toMatch(/^https:\/\/api-principal\.physiqcalc\.com\.br\/storage\/v1\/object\/public\/fotos-perfil-staging\//);
    // o PUT que falha sobe o erro (a tela mostra "Não foi possível enviar a foto.")
    h.upload.mockResolvedValue({ data: null, error: { message: "x" } });
    await expect(subirFotoPerfil(arquivo())).rejects.toBeTruthy();
    expect(urlPublica("b", "a b/c.png", "https://h.x/")).toBe("https://h.x/storage/v1/object/public/b/a%20b/c.png");
  });

  function montarConta() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <Conta />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("Conta: o nome → perfil_nome (só o nome, no profiles de quem chama); a foto → preparar + PUT + perfil_foto_salvar (o caminho); Tirar → perfil_foto_tirar", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const removidos: unknown[] = [];
    let dados: Record<string, unknown> = { crn: "1", foto_url: `https://api-principal.physiqcalc.com.br/storage/v1/object/public/fotos-perfil-staging/${EU}/foto-1.jpg` };
    h.banco = {
      rpc: () => ({ data: { nome: "Aluna Teste", foto_url: dados.foto_url, foto_propria: dados.foto_url, profissionais: [] }, error: null }),
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { dados_profissionais: dados }, error: null }) }) }),
        update: (v: Record<string, unknown>) => {
          updates.push(v);
          if (v.dados_profissionais) dados = v.dados_profissionais as Record<string, unknown>;
          return { eq: () => ({ select: async () => ({ data: [{ id: EU }], error: null }) }) };
        },
      }),
      storage: { from: () => ({ list: async (_p: string, o: { search: string }) => ({ data: [{ name: o.search }], error: null }), remove: async (c: string[]) => (removidos.push(...c), { data: c, error: null }) }) },
    };
    const { container } = montarConta();
    const campo = (await screen.findByDisplayValue("Aluna Teste")) as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "Aluna Nova" } });
    fireEvent.click(container.querySelector("[data-conta-salvar-nome]")!);
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith("Nome salvo."));
    expect(updates[0]).toEqual({ nome: "Aluna Nova" });
    // a foto
    fireEvent.change(container.querySelector("[data-conta-foto-arquivo]")!, { target: { files: [arquivo()] } });
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith("Foto trocada."));
    const salvar = daConta().find((c) => c.acao === "perfil_foto_salvar")!;
    expect(salvar.caminho).toMatch(new RegExp(`^${EU}/foto-\\d+\\.png$`));
    expect(updates[1]).toEqual({ dados_profissionais: { crn: "1", foto_url: `https://api-principal.physiqcalc.com.br/storage/v1/object/public/fotos-perfil-staging/${salvar.caminho}` } });
    expect(removidos).toEqual([`${EU}/foto-1.jpg`]);
    // tirar
    fireEvent.click(await screen.findByText("Tirar"));
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith("Foto removida."));
    expect(updates[2]).toEqual({ dados_profissionais: { crn: "1", foto_url: null } });
    for (const c of daConta()) passaNoServidor(c);
    expect(daConta().map((c) => (c.acao === "ler" ? `ler:${(c.itens as Array<{ q: string }>).map((i) => i.q).join(",")}` : c.acao))).toEqual(
      expect.arrayContaining(["ler:meu_perfil_aluno", "perfil_nome", "perfil_foto_preparar", "perfil_foto_salvar", "perfil_foto_tirar"]),
    );
    expect(h.recarregar).toHaveBeenCalled();
  });

  it("Conta: a gravação que falha mostra o MESMO texto de hoje (o nome e a foto)", async () => {
    h.banco = {
      rpc: () => ({ data: { nome: "Aluna Teste", foto_url: null, foto_propria: null, profissionais: [] }, error: null }),
      from: () => ({ update: () => ({ eq: () => ({ select: async () => ({ data: null, error: { code: "42501", message: "rls" } }) }) }) }),
    };
    const { container } = montarConta();
    const campo = (await screen.findByDisplayValue("Aluna Teste")) as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "Outro Nome" } });
    fireEvent.click(container.querySelector("[data-conta-salvar-nome]")!);
    expect(await screen.findByText("Não foi possível salvar agora. Confira a internet e tente de novo.")).toBeInTheDocument();
    h.upload.mockResolvedValue({ data: null, error: { message: "x" } });
    fireEvent.change(container.querySelector("[data-conta-foto-arquivo]")!, { target: { files: [arquivo()] } });
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("Não foi possível enviar a foto."));
  });
});
