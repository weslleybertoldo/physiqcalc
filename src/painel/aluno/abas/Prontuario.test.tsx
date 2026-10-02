import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { perfil } from "@/test/fixturesPerfilAluno";
import type { PerfilAluno } from "../dados/tipos";

const h = vi.hoisted(() => ({ perfil: vi.fn(), rpc: vi.fn(), from: vi.fn(), usuario: { id: "u2", email: "camila@teste.com" } }));

/** cadeia do supabase-js que termina em { data: [], error: null } (as seções clínicas listam o que o aluno tem) */
function cadeia(): unknown {
  const alvo = () => undefined;
  const p: unknown = new Proxy(alvo, {
    get: (_t, k) => (k === "then" ? (ok: (v: unknown) => void) => ok({ data: [], error: null }) : () => p),
    apply: () => p,
  });
  return p;
}

vi.mock("../dados/api", () => ({
  ErroPerfil: class extends Error {},
  buscarPerfilAluno: h.perfil,
  buscarDadosTreino: vi.fn(),
}));
vi.mock("@/nutricao/editor/lib/banco", () => ({
  supabase: {
    rpc: h.rpc,
    from: (t: string) => {
      h.from(t);
      return cadeia();
    },
    storage: { from: () => cadeia() },
  },
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: h.usuario, treino: { estado: "desnecessario", erro: null } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import CardProntuario from "../resumo/CardProntuario";
import Prontuario from "./Prontuario";

const NOTAS = [
  { id: "a1", data: "2026-07-16T13:00:00Z", texto: "Subiu a carga do supino reto pra 60 kg. Técnica boa.", visibilidade: "equipe", autor_papel: "personal",
    autor_id: "u1", autor_nome: "Lucas Ferreira", autor_foto: null, minha: false, created_at: "2026-07-16T13:00:00Z", updated_at: "2026-07-16T13:00:00Z" },
  { id: "a2", data: "2026-07-02T13:00:00Z", texto: "Plano ajustado: −150 kcal no jantar e mais proteína no lanche.", visibilidade: "nutricionistas",
    autor_papel: "nutricionista", autor_id: "u2", autor_nome: "Camila Rocha", autor_foto: null, minha: true, created_at: "2026-07-02T13:00:00Z",
    updated_at: "2026-07-02T13:00:00Z" },
];

function Local() {
  const l = useLocation();
  return <span data-testid="url">{l.pathname + l.search}</span>;
}

const montar = (ui: React.ReactNode, url = "/painel/alunos/p1/prontuario") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Routes>
          <Route path="*" element={<>{ui}<Local /></>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );

const eu = (o: Partial<PerfilAluno["eu"]>) => ({ id: "u2", dono: false, personal: false, nutricionista: false, master: false, ...o });

beforeEach(() => {
  h.perfil.mockReset();
  h.rpc.mockReset();
  h.from.mockReset();
  h.usuario = { id: "u2", email: "camila@teste.com" };
  h.rpc.mockResolvedValue({ data: { ok: true, paciente_id: "p1", total: 2, clinico: true, anotacoes: NOTAS }, error: null });
});

describe("W18 — aba Prontuário por papel (spec 4.1)", () => {
  it("nutricionista responsável: as anotações das 2 visibilidades e as 9 seções clínicas", async () => {
    h.perfil.mockResolvedValue(perfil({ eu: eu({ nutricionista: true }) }));
    montar(<Prontuario alunoId="p1" />);
    expect(await screen.findByText("Anotações da equipe")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-secao-prontuario-botao]").length).toBe(10);
    expect(document.querySelectorAll("[data-anotacao]").length).toBe(2);
    expect(document.querySelector('[data-anotacao="a2"] [data-chip-visibilidade="nutricionistas"]')).not.toBeNull();
    // só o autor edita/exclui
    expect(document.querySelector('[data-anotacao="a2"] [data-btn-editar-anotacao]')).not.toBeNull();
    expect(document.querySelector('[data-anotacao="a1"] [data-btn-editar-anotacao]')).toBeNull();
    expect(h.rpc).toHaveBeenCalledWith("aluno_anotacoes", { p_aluno: "p1", p_limite: null });
  });

  it("personal: só as anotações da equipe (o banco já filtra), sem seções clínicas — nem pela URL", async () => {
    h.usuario = { id: "u3", email: "bruno@teste.com" };
    h.perfil.mockResolvedValue(perfil({ personal: { id: "u3", nome: "Bruno Lima" }, eu: eu({ id: "u3", personal: true }) }));
    h.rpc.mockResolvedValue({ data: { ok: true, paciente_id: "p1", total: 1, clinico: false, anotacoes: [NOTAS[0]] }, error: null });
    montar(<Prontuario alunoId="p1" />, "/painel/alunos/p1/prontuario?secao=anamnese");
    expect(await screen.findByText(/são só da nutricionista/)).toBeInTheDocument();
    expect(document.querySelector("[data-secoes-prontuario]")).toBeNull();
    expect(document.querySelector("[data-aba-prontuario-aluno]")?.getAttribute("data-secao-prontuario")).toBe("anotacoes");
    await waitFor(() => expect(document.querySelectorAll("[data-anotacao]").length).toBe(1));
    expect(h.from).not.toHaveBeenCalledWith("anamneses");
    // nova anotação do personal: só "Equipe"
    fireEvent.click(screen.getAllByRole("button", { name: /Nova anotação/ })[0]);
    expect(await screen.findByText("Quem lê")).toBeInTheDocument();
    expect(document.querySelector("[data-visibilidade-fixa]")).not.toBeNull();
    expect(document.querySelector("[data-opcao-visibilidade]")).toBeNull();
  });

  it("atalho do Fluxo de consulta (?nova=consulta): abre Consultas com o formulário; a nutri escolhe a visibilidade", async () => {
    h.perfil.mockResolvedValue(perfil({ eu: eu({ nutricionista: true }) }));
    montar(<Prontuario alunoId="p1" />, "/painel/alunos/p1/prontuario?nova=consulta");
    await waitFor(() => expect(document.querySelector('[data-modal-consulta="nova"]')).not.toBeNull());
    expect(document.querySelector("[data-aba-prontuario-aluno]")?.getAttribute("data-secao-prontuario")).toBe("consultas");
    await waitFor(() => expect(screen.getByTestId("url").textContent).toBe("/painel/alunos/p1/prontuario?secao=consultas"));
    expect(h.from).toHaveBeenCalledWith("consultas");
  });

  it("nutricionista que acompanha como personal: vê o clínico só para ler", async () => {
    h.usuario = { id: "u1", email: "lucas@teste.com" };
    h.perfil.mockResolvedValue(perfil({ eu: eu({ id: "u1", personal: true, nutricionista: true }) }));
    montar(<Prontuario alunoId="p1" />, "/painel/alunos/p1/prontuario?secao=exames");
    expect(await screen.findByText(/quem muda é a nutricionista responsável \(Camila Rocha\)/)).toBeInTheDocument();
    // H5: o modo só leitura não desliga mais o que é de LER (PDF, Ver, Baixar) — só o que grava
    expect(document.querySelector("[data-somente-leitura][data-prontuario-leitura]")).not.toBeNull();
  });
});

describe("W18 — card Prontuário do Resumo (tela 7)", () => {
  it("as últimas anotações (dd/mm · autor e o texto) e o \"Nova anotação\"", async () => {
    montar(<CardProntuario alunoId="p1" />);
    expect(await screen.findByText(/16\/07 · Lucas Ferreira/)).toBeInTheDocument();
    expect(screen.getByText(/Subiu a carga do supino reto/)).toBeInTheDocument();
    expect(document.querySelectorAll("[data-nota]").length).toBe(2);
    expect(document.querySelector("[data-card-prontuario-nova]")?.getAttribute("href")).toBe("/painel/alunos/p1/prontuario?nova=anotacao");
    expect(screen.getByText("Ver o prontuário (2 anotações)")).toBeInTheDocument();
    expect(h.rpc).toHaveBeenCalledWith("aluno_anotacoes", { p_aluno: "p1", p_limite: 3 });
  });

  it("sem anotações: o texto do vazio", async () => {
    h.rpc.mockResolvedValue({ data: { ok: true, paciente_id: "p1", total: 0, clinico: false, anotacoes: [] }, error: null });
    montar(<CardProntuario alunoId="p1" />);
    expect(await screen.findByText(/Nenhuma anotação ainda/)).toBeInTheDocument();
    expect(screen.getByText("Abrir o prontuário")).toBeInTheDocument();
  });
});
