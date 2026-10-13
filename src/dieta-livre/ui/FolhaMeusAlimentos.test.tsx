import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// W-A P5 — "Meus alimentos e receitas" (spec §4.4, P6: só dele): a folha com a lista, o alimento por 100 g e a receita (ingredientes da busca,
// porções), pela aluno-dia falsa (a invoke leva ao h.gravar; as leituras devolvem o "banco" do teste).
const h = vi.hoisted(() => {
  const h = {
    biblioteca: { alimentos: [] as unknown[], receitas: [] as unknown[] },
    busca: [] as unknown[],
    gravar: vi.fn(),
    toastOk: vi.fn(),
    toastErro: vi.fn(),
    invocar: async (nome: string, o: { body: Record<string, unknown> }) => {
      const b = o.body;
      if (nome !== "aluno-dia") throw new Error(`chamada inesperada: ${nome}`);
      if (b.acao === "ler" && b.q === "biblioteca") return { data: { ok: true, ...h.biblioteca }, error: null };
      if (b.acao === "ler" && b.q === "alimentos") return { data: { ok: true, pagina: 0, tem_mais: false, itens: h.busca }, error: null };
      if (b.acao === "ler") return { data: { ok: true, dia: "2026-09-30", hoje: "2026-09-30", pode_gravar: true, matriculas: [], plano_ativo: null, extras: [], itens: [] }, error: null };
      return { data: { ok: true, ...(await h.gravar(b.acao, b)) }, error: null };
    },
  };
  return h;
});
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: { id: "u-diego" } }) }));
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => h.toastOk(...a), info: vi.fn(), error: (...a: unknown[]) => h.toastErro(...a) } }));
vi.mock("@/integrations/principal/client", () => ({
  principalConfigurado: true,
  PRINCIPAL_SCHEMA: "public",
  principal: { functions: { invoke: (nome: string, o: { body: Record<string, unknown> }) => h.invocar(nome, o) } },
}));

import { ProvedorConfirmar } from "@/ui/premium/Confirmar";
import { useGravarNoDia } from "../useDietaLivre";
import { FolhaMeusAlimentos } from "./FolhaMeusAlimentos";

function Folha() {
  const g = useGravarNoDia();
  return <FolhaMeusAlimentos aberta aoMudar={() => {}} ocupado={g.ocupado} desligado={false} gravar={g.gravar} />;
}
function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProvedorConfirmar>
        <Folha />
      </ProvedorConfirmar>
    </QueryClientProvider>,
  );
}
const achar = <T extends HTMLElement = HTMLElement>(seletor: string, timeout = 3000) =>
  waitFor(() => {
    const el = document.querySelector(seletor);
    if (!el) throw new Error(`sem ${seletor}`);
    return el as T;
  }, { timeout });
const lista = () => achar('[data-folha-meus="lista"] [data-meus-estado="lista"]');

beforeEach(() => {
  h.biblioteca = { alimentos: [], receitas: [] };
  h.busca = [];
  h.gravar.mockReset();
  h.toastOk.mockReset();
  h.toastErro.mockReset();
});

describe("W-A P5 — Meus alimentos e receitas", () => {
  it("cria um alimento por 100 g: sem nome não vai; com nome, o alimento_salvar com a porção e os 5 valores (vazio = 0)", async () => {
    h.gravar.mockImplementation(async (acao: string) => {
      if (acao === "alimento_salvar") return { alimento: {} };
      throw new Error(`gravação inesperada: ${acao}`);
    });
    montar();
    await lista();
    expect(screen.getByText(/Nenhum alimento seu ainda/)).toBeInTheDocument();
    fireEvent.click(document.querySelector("[data-meus-novo-alimento]")!);
    const nome = await achar<HTMLInputElement>("[data-alimento-nome]");
    fireEvent.click(document.querySelector("[data-alimento-salvar]")!);
    await waitFor(() => expect(nome.getAttribute("aria-invalid")).toBe("true"));
    fireEvent.change(nome, { target: { value: "Pão da padaria" } });
    fireEvent.change(document.querySelector('[data-alimento-porcao]')!, { target: { value: "50" } });
    fireEvent.change(document.querySelector('[data-alimento-macro="energia_kcal"]')!, { target: { value: "280" } });
    fireEvent.change(document.querySelector('[data-alimento-macro="proteina_g"]')!, { target: { value: "9,5" } });
    fireEvent.click(document.querySelector("[data-alimento-salvar]")!);
    await waitFor(() =>
      expect(h.gravar).toHaveBeenCalledWith("alimento_salvar", expect.objectContaining({
        id: null, dados: { nome: "Pão da padaria", porcao_g: 50, energia_kcal: 280, proteina_g: 9.5, carboidrato_g: 0, lipidio_g: 0, fibra_g: 0 },
      })),
    );
    await lista();
    expect(h.toastOk).toHaveBeenCalledWith("Alimento salvo.");
  });

  it("cria uma receita: o ingrediente vem da busca (sem as receitas), em gramas; as porções; os macros de 1 porção antes de salvar", async () => {
    h.busca = [
      { tipo: "receita", id: "rc-velha", nome: "Arroz da vó", porcao_g: null, energia_kcal: 300, proteina_g: 5, carboidrato_g: 50, lipidio_g: 5, fibra_g: 1 },
      { tipo: "taco", id: "taco-arroz", nome: "Arroz, tipo 1, cozido", porcao_g: 100, energia_kcal: 128.26, proteina_g: 2.52, carboidrato_g: 28.06, lipidio_g: 0.23, fibra_g: 1.56 },
    ];
    h.gravar.mockImplementation(async (acao: string) => {
      if (acao === "receita_salvar") return { receita: {} };
      throw new Error(`gravação inesperada: ${acao}`);
    });
    montar();
    await lista();
    fireEvent.click(screen.getByRole("radio", { name: /Receitas/ }));
    fireEvent.click(await achar("[data-meus-nova-receita]"));
    fireEvent.change(await achar("[data-receita-nome]"), { target: { value: "Arroz de forno" } });
    fireEvent.change(document.querySelector("[data-busca-termo]")!, { target: { value: "arroz" } });
    await achar('[data-busca-item="taco-arroz"]');
    expect(document.querySelector('[data-busca-item="rc-velha"]')).toBeNull();
    fireEvent.click(document.querySelector('[data-busca-item="taco-arroz"]')!);
    const qtd = await achar<HTMLInputElement>('[data-receita-item-qtd="novo-0"]');
    expect(qtd.value).toBe("100");
    fireEvent.change(qtd, { target: { value: "400" } });
    fireEvent.change(document.querySelector("[data-receita-porcoes]")!, { target: { value: "2" } });
    // 128,26 × 4 = 513,04 → 256,52 a porção
    expect(document.querySelector("[data-receita-por-porcao]")!.getAttribute("data-receita-por-porcao")).toBe("257");
    fireEvent.click(document.querySelector("[data-receita-salvar]")!);
    await waitFor(() =>
      expect(h.gravar).toHaveBeenCalledWith("receita_salvar", expect.objectContaining({
        id: null, dados: { nome: "Arroz de forno", porcoes: 2, itens: [{ alimento_id: "taco-arroz", quantidade_g: 400 }] },
      })),
    );
  });

  it("apaga um alimento dele com a confirmação do app (o que já pôs nos dias continua)", async () => {
    h.biblioteca = { alimentos: [{ id: "meu-pao", nome: "Pão da padaria", porcao_g: 50, energia_kcal: 280, proteina_g: 9, carboidrato_g: 50, lipidio_g: 3, fibra_g: 2, criado_em: "", alterado_em: "" }], receitas: [] };
    h.gravar.mockImplementation(async (acao: string) => {
      if (acao === "alimento_excluir") return {};
      throw new Error(`gravação inesperada: ${acao}`);
    });
    montar();
    fireEvent.click(await achar('[data-meu-alimento="meu-pao"]'));
    expect((await achar<HTMLInputElement>("[data-alimento-nome]")).value).toBe("Pão da padaria");
    fireEvent.click(document.querySelector("[data-alimento-apagar]")!);
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("Ele sai da sua lista. O que você já pôs nos seus dias continua lá.")).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Apagar" }));
    await waitFor(() => expect(h.gravar).toHaveBeenCalledWith("alimento_excluir", expect.objectContaining({ id: "meu-pao" })));
  });
});
