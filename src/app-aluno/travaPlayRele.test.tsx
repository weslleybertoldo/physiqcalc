import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { matricula, situacao } from "@/test/fixturesNucleo";
import type { PlayDaMatricula, ResumoMatricula } from "@/financeiro/tipos";

// play-W6 · T2 (b) — o achado do GATE 2 (26/10/2026, a compra de teste dele): a assinatura SUSPENSA mostrava a trava genérica ("Assinar pela
// Google Play") até o app ser reaberto (o resumo guardado no aparelho, velho). Agora a trava da loja relê ao montar e ao voltar ao primeiro
// plano. Aqui tudo é DE VERDADE (o gate, o useResumoFinanceiro com o guardado no aparelho, o usePlayDaLoja, a releitura) — só a borda é de
// mentira: a leitura do servidor (fin_do_aluno), a play-compras, o plugin da Play e o Capacitor.
const h = vi.hoisted(() => {
  (globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = "3.53";
  return {
    loja: true,
    fin: [] as unknown[],
    lidas: 0,
    estado: vi.fn(),
    sessao: {} as Record<string, unknown>,
    travou: false,
    piscou: false,
  };
});
vi.mock("@/lib/distribuicao", () => ({
  get ehLoja() {
    return h.loja;
  },
  get DISTRIBUICAO() {
    return h.loja ? "play" : "site";
  },
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "android", isPluginAvailable: (nome: string) => nome === "PlayBilling" },
  registerPlugin: () => ({}),
}));
vi.mock("@capacitor/app", () => ({ App: { addListener: () => Promise.resolve({ remove: async () => {} }) } }));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "staging", supabase: {} }));
vi.mock("@/integrations/principal/client", () => ({ principal: { rpc: vi.fn(), functions: { invoke: vi.fn() } } }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/financeiro/ler", async (orig) => ({
  ...(await orig<typeof import("@/financeiro/ler")>()),
  lerFinanceiro: async (q: string) => {
    if (q !== "fin_do_aluno") throw new Error(`leitura inesperada: ${q}`);
    h.lidas++;
    return { valor: JSON.parse(JSON.stringify(h.fin)) };
  },
}));
vi.mock("@/lib/playBilling", async (orig) => ({
  ...(await orig<typeof import("@/lib/playBilling")>()),
  pluginDaPlayPresente: () => h.loja,
  playDisponivel: async () => true,
  produtosDaPlay: async () => ({
    produtos: [{ id: "app_treino", nome: "Treino", titulo: "Treino", ofertas: [{ planoBase: "mensal", oferta: null, token: "tok-t", tags: [],
      fases: [{ precoFormatado: "R$ 31,90", precoMicros: 31_900_000, moeda: "BRL", periodo: "P1M", ciclos: 0, recorrencia: 1 }] }] }],
    naoAchados: ["app_treino_alimentacao"],
  }),
  ouvirComprasDaPlay: async () => () => {},
}));
vi.mock("@/app-aluno/sozinho/play", () => ({
  ErroPlay: class extends Error {},
  buscarEstadoPlay: h.estado,
  assinarPelaPlay: vi.fn(),
  recuperarComprasDaPlay: async () => 0,
  gerenciarAssinatura: vi.fn(),
  registrarCompraPlay: async () => null,
}));

import { _esquecerPlayDaLojaParaTestes } from "./sozinho/usePlayDaLoja";
import { _esquecerReleituraParaTestes } from "./sozinho/releituraDaTrava";
import GatePagamentoPendente from "./gates/GatePagamentoPendente";

const dia = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const ESTADO = { disponivel: true, matricula: { id: "pa", ativo: true }, assinatura: null, automatica_mp: false };
const resumoApp = (play: PlayDaMatricula | null): ResumoMatricula => ({
  paciente_id: "pa", conta_id: "app", conta_nome: "Physiq", recebimento_modo: "mercadopago", bloquear_inadimplente: true, tem_chave: false,
  profissional: "Physiq", mensalidade_valor: 20, plano_nome: "Treino", pausada: false, pago_ate: dia(-1), teste_ate: dia(-40), desde: dia(-45),
  aguardando: false, assinatura_ativa: false, abertas: [], aguardando_avulsas: 0, app: true, plano_codigo: "app_treino", play,
} as ResumoMatricula);
const CARENCIA: PlayDaMatricula = { estado: "carencia", renova: true, expira_em: dia(-1), produto: "app_treino" };
const SUSPENSA: PlayDaMatricula = { estado: "suspensa", renova: true, expira_em: dia(-1), produto: "app_treino" };

let visivel: DocumentVisibilityState = "visible";
function voltar(estado: DocumentVisibilityState) {
  visivel = estado;
  document.dispatchEvent(new Event("visibilitychange"));
}
function OApp() {
  useEffect(() => {
    if (h.travou) h.piscou = true;
  }, []);
  return <div>o app</div>;
}
function montar() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter useTransitions={false} initialEntries={["/treino"]}>
        <GatePagamentoPendente><OApp /></GatePagamentoPendente>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const marca = () => document.querySelector("[data-trava-app]")?.getAttribute("data-trava-app") ?? null;

beforeEach(() => {
  localStorage.clear();
  _esquecerPlayDaLojaParaTestes();
  _esquecerReleituraParaTestes();
  h.loja = true;
  h.lidas = 0;
  h.travou = false;
  h.piscou = false;
  h.estado.mockReset().mockResolvedValue(ESTADO);
  h.sessao = { situacao: situacao({ modulos_aluno: ["treino"], matriculas: [matricula()] }), usuario: { id: "u1" }, sair: async () => {},
    recarregarSituacao: async () => null };
  visivel = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visivel });
});

describe("T2 (b): a trava da loja relê a assinatura (ao montar e ao voltar ao primeiro plano)", () => {
  it("a SUSPENSA aparece sem reabrir o app: o resumo velho (carência) dá a trava de Assinar; ao voltar ao primeiro plano a trava relê → 'Assinatura suspensa' + 'Atualizar na Google Play', sem piscar o app", async () => {
    h.fin = [resumoApp(CARENCIA)];
    montar();
    await waitFor(() => expect(marca()).toBe("plano-app-play"), { timeout: 5000 });
    h.travou = true;
    // a releitura ao montar (o estado de novo + o resumo de novo) — o servidor ainda diz carência: a mesma trava
    await waitFor(() => expect(h.lidas).toBe(2), { timeout: 5000 });
    expect(marca()).toBe("plano-app-play");
    const estados = h.estado.mock.calls.length;
    // o servidor muda (a conferência de hora em hora — ou a ressincronia do estado — gravou a suspensa); o app foi para o fundo e voltou
    h.fin = [resumoApp(SUSPENSA)];
    _esquecerReleituraParaTestes();   // os 10 s passaram
    voltar("hidden");
    voltar("visible");
    await waitFor(() => expect(marca()).toBe("play-travada"), { timeout: 5000 });
    expect(screen.getByText("Assinatura suspensa")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Atualizar na Google Play/ })).toBeInTheDocument();
    expect(h.estado.mock.calls.length).toBe(estados + 1);
    expect(h.lidas).toBe(3);
    // a trava NUNCA sumiu no meio (o resumo foi invalidado sem apagar o último)
    expect(h.piscou).toBe(false);
    // e não fica relendo sozinha (sem laço): nada novo sem outra volta ao primeiro plano
    await new Promise((x) => setTimeout(x, 2000));
    expect(h.estado.mock.calls.length).toBe(estados + 1);
    expect(h.lidas).toBe(3);
  }, 15_000);

  it("o site (e o APK do site) não muda: a trava de sempre, sem perguntar à Play nem reler ao voltar", async () => {
    h.loja = false;
    h.fin = [resumoApp(CARENCIA)];
    montar();
    await waitFor(() => expect(marca()).toBe("pagamento-pendente-app"), { timeout: 5000 });
    voltar("visible");
    await new Promise((x) => setTimeout(x, 2000));
    expect(h.estado).not.toHaveBeenCalled();
    expect(h.lidas).toBe(1);
  }, 10_000);
});
