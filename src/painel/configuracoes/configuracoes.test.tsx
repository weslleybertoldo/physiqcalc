import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { conta as contaFixture } from "@/test/fixturesNucleo";

// W5 — Configurações do profissional: Perfil, Conta, Equipe, Convite e Aplicativo (com o banco e as funções falsos)
const h = vi.hoisted(() => ({
  versao: ((globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = "3.4"),
  conta: null as unknown,
  equipe: null as unknown,
  perfil: null as unknown,
  atualizou: [] as unknown[],
  api: {
    convidarMembro: vi.fn(),
    cancelarConviteMembro: vi.fn(),
    alterarPapeisMembro: vi.fn(),
    removerMembro: vi.fn(),
    garantirMeuCodigo: vi.fn(),
  },
}));

vi.mock("@/nucleo/conta", () => ({ useConta: () => ({ conta: h.conta, ehDono: true, ehMaster: false }) }));
vi.mock("@/nucleo/sessao", () => ({
  useSessao: () => ({ usuario: { id: "u1", email: "dono@teste.com", user_metadata: { full_name: "Dono" }, identities: [{ provider: "google" }] }, recarregarSituacao: vi.fn(async () => null) }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, isStaff: false }) }));
vi.mock("@/lib/apkRelease", () => ({ ultimoApk: vi.fn(async () => ({ version: "9.1", url: "https://x/Physiq-v9.1.apk" })), baixarNoNavegador: vi.fn(), RELEASES_PAGE: "https://x" }));
vi.mock("@/integrations/principal/client", () => {
  const cadeia = (resultado: () => unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "order", "limit"]) c[m] = () => c;
    c.maybeSingle = async () => ({ data: resultado(), error: null });
    c.update = (v: unknown) => {
      h.atualizou.push(v);
      return c;
    };
    c.then = (ok: (x: unknown) => unknown) => ok({ data: [{ id: "c1", nome: "x" }], error: null });
    return c;
  };
  return {
    PRINCIPAL_SCHEMA: "staging",
    principal: { from: () => cadeia(() => h.perfil), auth: { updateUser: vi.fn(async () => ({ error: null })) }, storage: { from: () => ({}) } },
  };
});
vi.mock("./equipe/api", async (orig) => {
  const real = await orig<typeof import("./equipe/api")>();
  return { ...real, buscarEquipe: vi.fn(async () => h.equipe), ...h.api };
});

import Aplicativo from "./Aplicativo";
import Conta from "./Conta";
import Convite from "./Convite";
import Equipe from "./Equipe";
import Perfil from "./Perfil";
import { normalizarEquipe } from "./equipe/regras";

/** espera o elemento aparecer (o waitFor só tenta de novo quando a função lança) */
function esperarEl<T extends Element = HTMLElement>(seletor: string): Promise<T> {
  return waitFor(() => {
    const el = document.querySelector<T>(seletor);
    if (!el) throw new Error(`sem ${seletor}`);
    return el;
  });
}

function montar(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function equipe(o: Record<string, unknown> = {}) {
  return normalizarEquipe({
    ok: true,
    conta: { id: "c1", nome: "Consultoria Ferreira", origem: "nova", plano: "treino_nutricao", modulos: ["treino", "nutricao"], dono_id: "u1" },
    papeis_do_plano: ["personal", "nutricionista"],
    bloqueio: null,
    membros: [
      { id: "m1", user_id: "u1", status: "ativo", papeis: ["dono", "personal"], nome: "Dono Ferreira", email: "dono@teste.com", dono: true, eu: true, alunos_treino: 0 },
      { id: "m2", user_id: "u2", status: "ativo", papeis: ["personal"], nome: "Lucas Personal", email: "lucas@gmail.com", alunos_treino: 3 },
    ],
    convites: [{ id: "v1", email: "camila@gmail.com", papeis: ["nutricionista"], enviado_em: "2026-09-29T11:00:00Z", criado_por_nome: "Dono Ferreira" }],
    alunos_sem_responsavel: 0,
    ...o,
  });
}

beforeEach(() => {
  h.conta = contaFixture({ id: "c1", nome: "Consultoria Ferreira", papeis: ["dono", "personal"], codigo_convite: "PROF-DONO-FERREIRA" });
  h.equipe = equipe();
  h.perfil = { nome: "Dono Ferreira", email: "dono@teste.com", tipo_perfil: "personal", dados_profissionais: { registro: "CREF 1", uf: "PE" } };
  h.atualizou = [];
  for (const f of Object.values(h.api)) f.mockReset();
});

describe("Configurações › Equipe (dono)", () => {
  it("lista os profissionais (dono primeiro) e os convites pendentes, no padrão da tela 7", async () => {
    montar(<Equipe />);
    expect(await screen.findByText("Lucas Personal")).toBeInTheDocument();
    expect(screen.getByText("Dono Ferreira")).toBeInTheDocument();
    expect(screen.getByText("camila@gmail.com")).toBeInTheDocument();
    expect(screen.getByText("3 alunos")).toBeInTheDocument();
    // o dono não tem "Remover"; o membro tem
    expect(document.querySelector("[data-membro-remover='m1']")).toBeNull();
    expect(document.querySelector("[data-membro-remover='m2']")).not.toBeNull();
  });

  it("convidar por e-mail com os papéis do plano → a função convites", async () => {
    h.api.convidarMembro.mockResolvedValue({ convite_id: "v2", reenvio: false, email: "nova@gmail.com", papeis: ["nutricionista"], email_enviado: true, email_teste: false, erro_email: null, link: "l" });
    montar(<Equipe />);
    fireEvent.click(await screen.findByText("Convidar"));
    await waitFor(() => expect(document.querySelector("[data-form-convidar]")).not.toBeNull());
    fireEvent.change(document.querySelector("[data-convidar-email]")!, { target: { value: "Nova@Gmail.com" } });
    fireEvent.click(document.querySelector("[data-opcao='nutricionista']")!);
    fireEvent.click(document.querySelector("[data-convidar-enviar]")!);
    await waitFor(() => expect(h.api.convidarMembro).toHaveBeenCalledWith("c1", "Nova@Gmail.com", ["nutricionista"]));
    expect(await screen.findByText("Convite enviado")).toBeInTheDocument();
  });

  it("negativo: sem papel escolhido não convida", async () => {
    montar(<Equipe />);
    fireEvent.click(await screen.findByText("Convidar"));
    await waitFor(() => expect(document.querySelector("[data-form-convidar]")).not.toBeNull());
    fireEvent.change(document.querySelector("[data-convidar-email]")!, { target: { value: "nova@gmail.com" } });
    fireEvent.click(document.querySelector("[data-convidar-enviar]")!);
    expect(await screen.findByText(/Escolha pelo menos um papel/)).toBeInTheDocument();
    expect(h.api.convidarMembro).not.toHaveBeenCalled();
  });

  it("remover: avisa quantos alunos ficam sem responsável, oferece quem pode receber e chama remover_membro", async () => {
    h.api.removerMembro.mockResolvedValue({ alunos_treino: 3, alunos_nutricao: 0 });
    montar(<Equipe />);
    fireEvent.click(await esperarEl("[data-membro-remover='m2']"));
    const dialogo = await esperarEl("[data-dialogo-remover='m2']");
    expect(within(dialogo).getByText(/Os 3 alunos de treino dele ficam sem responsável/)).toBeInTheDocument();
    const select = dialogo.querySelector("[data-remover-novo-personal]") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["Ninguém (ficam sem responsável)", "Dono Ferreira"]);
    fireEvent.click(dialogo.querySelector("[data-remover-confirmar]")!);
    await waitFor(() => expect(h.api.removerMembro).toHaveBeenCalledWith("m2", null, null));
  });

  it("papéis: tirar o personal de quem atende alunos mostra o aviso antes de salvar", async () => {
    montar(<Equipe />);
    fireEvent.click(await esperarEl("[data-membro-papeis='m2']"));
    await waitFor(() => expect(document.querySelector("[data-form-papeis='m2']")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-form-papeis='m2'] [data-opcao='personal']")!);
    expect(await screen.findByText(/Os 3 alunos de treino dele ficam sem responsável/)).toBeInTheDocument();
  });
});

describe("Configurações › Convite (cada membro)", () => {
  it("o código e o link de hoje (?prof=) do ambiente", async () => {
    montar(<Convite />);
    expect(await screen.findByText("PROF-DONO-FERREIRA")).toBeInTheDocument();
    expect((document.querySelector("[data-convite-link]") as HTMLInputElement).value).toBe("https://physiqcalc-staging.vercel.app/?prof=PROF-DONO-FERREIRA");
    expect(screen.getByText(/responsável de treino/)).toBeInTheDocument();
  });
  it("quem não tinha código (veio do Nutri) ganha um", async () => {
    h.conta = contaFixture({ id: "c1", nome: "Clínica", papeis: ["dono", "nutricionista"], codigo_convite: null });
    h.api.garantirMeuCodigo.mockResolvedValue("PROF-CAMILA");
    montar(<Convite />);
    expect(await screen.findByText("PROF-CAMILA")).toBeInTheDocument();
    expect(h.api.garantirMeuCodigo).toHaveBeenCalledWith("c1");
  });
});

describe("Configurações › Conta (dono)", () => {
  it("negativo: nome curto não salva; nome novo salva em contas", async () => {
    montar(<Conta />);
    const campo = document.querySelector("[data-conta-nome]") as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "X" } });
    fireEvent.click(document.querySelector("[data-conta-salvar]")!);
    expect(await screen.findByText(/ao menos 2 letras/)).toBeInTheDocument();
    fireEvent.change(campo, { target: { value: "Consultoria Nova" } });
    fireEvent.click(document.querySelector("[data-conta-salvar]")!);
    await waitFor(() => expect(h.atualizou).toContainEqual({ nome: "Consultoria Nova" }));
  });
});

describe("Configurações › Perfil (cada membro)", () => {
  it("abre com os dados de hoje e recusa WhatsApp inválido", async () => {
    montar(<Perfil />);
    const nome = await esperarEl<HTMLInputElement>("[data-perfil-nome]");
    expect(nome.value).toBe("Dono Ferreira");
    expect((document.querySelector("[data-perfil-registro]") as HTMLInputElement).value).toBe("CREF 1");
    fireEvent.change(document.querySelector("[data-perfil-whatsapp]")!, { target: { value: "8199" } });
    fireEvent.click(document.querySelector("[data-perfil-salvar]")!);
    expect(await screen.findByText(/WhatsApp inválido/)).toBeInTheDocument();
    expect(h.atualizou).toHaveLength(0);
  });
  it("só Google: oferece criar uma senha", async () => {
    montar(<Perfil />);
    expect(await screen.findByRole("button", { name: "Criar senha" })).toBeInTheDocument();
  });
});

describe("Configurações › Aplicativo (todos)", () => {
  it("mostra a versão desta tela e a mais nova da release", async () => {
    montar(<Aplicativo />);
    expect(await screen.findByText("v9.1")).toBeInTheDocument();
    expect(screen.getByText("APK mais novo")).toBeInTheDocument();
    expect(screen.getByText("v3.4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Baixar o APK/ })).toBeInTheDocument();
  });
});
