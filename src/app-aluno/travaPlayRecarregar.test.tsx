import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { matricula, situacao } from "@/test/fixturesNucleo";
import type { ResumoMatricula } from "@/financeiro/tipos";

// play-W6, a conferência das correções (🟡 novo, DECISÃO 07:08): na TRAVA da loja, o erro do registrar (o Google fora, o "já tem") não pode
// sumir. O concluir() recarrega a Play; o "carregando" é SÓ da 1ª carga — recarregar nunca esconde a trava nem desmonta a folha (que mora
// dentro dela). Aqui o usePlayDaLoja é o DE VERDADE (só a borda — o servidor e o plugin — é de mentira).
const h = vi.hoisted(() => {
  (globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = "3.53";
  return {
    estado: vi.fn(),
    assinar: vi.fn(),
    resumo: null as unknown,
    sessao: {} as Record<string, unknown>,
  };
});
vi.mock("@/lib/distribuicao", () => ({ ehLoja: true, DISTRIBUICAO: "play" }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "android", isPluginAvailable: (nome: string) => nome === "PlayBilling" },
  registerPlugin: () => ({}),
}));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "staging", supabase: {} }));
vi.mock("@/integrations/principal/client", () => ({ principal: { rpc: vi.fn(), functions: { invoke: vi.fn() } } }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/financeiro/useResumoFinanceiro", () => ({ useResumoFinanceiro: () => ({ resumo: h.resumo, carregando: false, erro: false }) }));
vi.mock("@/lib/playBilling", async (orig) => ({
  ...(await orig<typeof import("@/lib/playBilling")>()),
  pluginDaPlayPresente: () => true,
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
  assinarPelaPlay: h.assinar,
  recuperarComprasDaPlay: async () => 0,
  gerenciarAssinatura: vi.fn(),
  registrarCompraPlay: async () => null,
}));

import { _esquecerPlayDaLojaParaTestes } from "./sozinho/usePlayDaLoja";
import GatePagamentoPendente from "./gates/GatePagamentoPendente";

const dia = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const ESTADO = { disponivel: true, matricula: { id: "pa", ativo: true }, assinatura: null, automatica_mp: false };
const resumoApp = (): ResumoMatricula => ({
  paciente_id: "pa", conta_id: "app", conta_nome: "Physiq", recebimento_modo: "mercadopago", bloquear_inadimplente: true, tem_chave: false,
  profissional: "Physiq", mensalidade_valor: 29.9, plano_nome: "Treino", pausada: false, pago_ate: dia(-2), teste_ate: dia(-2), desde: dia(-9),
  aguardando: false, assinatura_ativa: false, abertas: [], aguardando_avulsas: 0, app: true, plano_codigo: "app_treino",
} as ResumoMatricula);

function montar() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter useTransitions={false} initialEntries={["/treino"]}>
        <GatePagamentoPendente><div>o app</div></GatePagamentoPendente>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  _esquecerPlayDaLojaParaTestes();
  h.estado.mockReset();
  h.assinar.mockReset();
  h.resumo = [resumoApp()];
  h.sessao = { situacao: situacao({ modulos_aluno: ["treino"], matriculas: [matricula()] }), usuario: { id: "u1" }, sair: async () => {},
    recarregarSituacao: async () => null };
});

describe("a trava da loja com o hook de verdade: recarregar a Play não some com o erro do registrar", () => {
  it.each(["google_indisponivel", "ja_tem"] as const)("%s: a trava e a folha ficam (a mensagem e, no já tem, o Gerenciar) enquanto a Play recarrega", async (codigo) => {
    let soltar: (v: unknown) => void = () => {};
    h.estado.mockResolvedValueOnce(ESTADO).mockImplementationOnce(() => new Promise((ok) => { soltar = ok; }));
    h.assinar.mockResolvedValue({ tipo: "erro", codigo });
    montar();
    // a 1ª carga: o espaço vazio, depois a trava com a oferta da Play
    await waitFor(() => expect(document.querySelector("[data-trava-app]")?.getAttribute("data-trava-app")).toBe("plano-app-play"));
    fireEvent.click(screen.getByRole("button", { name: "Assinar pela Google Play · R$ 31,90/mês" }));
    await waitFor(() => expect(document.querySelector("[data-folha-oferta-play='app_treino']")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Assinar pela Google Play" }));
    // o concluir() pede a Play de novo (o 2º estado ainda no ar)
    await waitFor(() => expect(h.estado).toHaveBeenCalledTimes(2));
    expect(document.querySelector("[data-trava-app]")?.getAttribute("data-trava-app")).toBe("plano-app-play");
    expect(document.querySelector("[data-folha-oferta-play] [data-play-erro]")).not.toBeNull();
    if (codigo === "ja_tem") expect(document.querySelector("[data-folha-oferta-play] [data-play-gerenciar]")).not.toBeNull();
    soltar(ESTADO);
    await waitFor(() => expect(document.querySelector("[data-folha-oferta-play] [data-play-erro]")).not.toBeNull());
    expect(document.querySelector("[data-trava-app]")?.getAttribute("data-trava-app")).toBe("plano-app-play");
  });
});
