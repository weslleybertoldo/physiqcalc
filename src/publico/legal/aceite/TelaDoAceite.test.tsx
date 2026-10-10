import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { LegalSituacao } from "@/nucleo/situacao";
import { conta, situacao as fixture } from "@/test/fixturesNucleo";
import { VERSAO_TEXTOS } from "../versao";

// hml-12 (H-30, §4.3 T1) — a tela do aceite: o botão travado até as caixas (e a data), a caixa de saúde e a data só para quem falta,
// a regra 18+, as recusas do banco (versão do banco na frente → no site Recarregar, no APK e na loja "Atualize o app"; atrás → a
// genérica e o aviso), sem internet, o Sair e o Excluir minha conta.
const h = vi.hoisted(() => ({
  situacao: null as unknown,
  online: true,
  plataforma: "site" as "site" | "app" | "loja",
  aceitar: null as unknown as Mock<(...a: unknown[]) => unknown>,
  recarregar: null as unknown as Mock<(...a: unknown[]) => unknown>,
  sair: null as unknown as Mock<(...a: unknown[]) => unknown>,
  avisar: null as unknown as Mock<(...a: unknown[]) => unknown>,
  ultimoApk: null as unknown as Mock<(...a: unknown[]) => unknown>,
  instalar: null as unknown as Mock<(...a: unknown[]) => unknown>,
}));

vi.mock("@/nucleo/sessao", () => ({
  useSessao: () => ({ usuario: { id: "u1" }, situacao: h.situacao, sair: h.sair, recarregarSituacao: h.recarregar }),
}));
vi.mock("@/ui/premium/useOnline", () => ({ useOnline: () => h.online }));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "staging", supabase: {} }));
vi.mock("./api", () => ({ aceitarNoAcesso: (...a: unknown[]) => h.aceitar(...a) }));
vi.mock("@/lib/avisoDeErro", async (orig) => ({
  ...(await orig<typeof import("@/lib/avisoDeErro")>()),
  avisarErro: (...a: unknown[]) => h.avisar(...a),
  plataformaAtual: () => h.plataforma,
}));
vi.mock("@/lib/apkRelease", () => ({ ultimoApk: (...a: unknown[]) => h.ultimoApk(...a) }));
vi.mock("@/lib/apkUpdater", () => ({ downloadAndInstall: (...a: unknown[]) => h.instalar(...a) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

import TelaDoAceite from "./TelaDoAceite";

const legal = (o: Partial<LegalSituacao> = {}): LegalSituacao => ({
  versao: "2026-10-08",
  aceite_pendente: true,
  saude_pendente: false,
  nascimento_pendente: false,
  menor: null,
  ...o,
});

/** Onde o app está e com que `state` (o Voltar das páginas legais). */
function Onde() {
  const l = useLocation();
  return <output data-testid="onde" data-state={JSON.stringify(l.state ?? null)}>{`${l.pathname}${l.search}`}</output>;
}

function abrir(l: LegalSituacao, aoAceitar = vi.fn()) {
  render(
    <MemoryRouter initialEntries={["/treino"]}>
      <Routes>
        <Route path="/treino" element={<TelaDoAceite legal={l} aoAceitar={aoAceitar} />} />
        <Route path="*" element={null} />
      </Routes>
      <Onde />
    </MemoryRouter>,
  );
  return aoAceitar;
}

const el = (seletor: string) => document.querySelector(seletor) as HTMLElement | null;
const botao = () => el("[data-aceitar]") as HTMLButtonElement;
const erro = () => el("[data-aceite-erro]");
const data = () => el("[data-campo-nascimento] input[type='date']") as HTMLInputElement;
/** Uma data com `anos` anos a menos que hoje, no formato do input date (AAAA-MM-DD). */
const nascidoHa = (anos: number) => {
  const d = new Date();
  return `${d.getFullYear() - anos}-01-01`;
};

beforeEach(() => {
  h.situacao = fixture();
  h.online = true;
  h.plataforma = "site";
  h.aceitar = vi.fn();
  h.recarregar = vi.fn(async () => null);
  h.sair = vi.fn(async () => {});
  h.avisar = vi.fn(() => "abcd1234");
  h.ultimoApk = vi.fn(async () => ({ version: "3.99.0", url: "https://exemplo.invalid/physiq-3.99.0.apk" }));
  h.instalar = vi.fn(async () => "installed");
});

describe("TelaDoAceite (hml-12)", () => {
  it("mostra o título, a versão, o resumo dos Termos e os 3 links; o botão fica travado até a caixa", async () => {
    const aoAceitar = abrir(legal());
    expect(screen.getByRole("heading", { name: "Termos de Uso e Política de Privacidade" })).toBeInTheDocument();
    expect(screen.getByText(/leia e aceite os Termos de Uso e a Política de Privacidade \(versão de 8 de outubro de 2026\)/)).toBeInTheDocument();
    expect(el("[data-aceite-resumo] li")).not.toBeNull();
    expect(el("[data-aceite-resumo]")?.textContent).toContain("O Physiq é uma ferramenta.");
    expect(el('[data-aceite-link="termos"]')?.getAttribute("href")).toBe("/termos");
    expect(el('[data-aceite-link="privacidade"]')?.getAttribute("href")).toBe("/privacidade");
    expect(el('[data-aceite-link="assinatura"]')?.getAttribute("href")).toBe("/assinatura");
    expect(screen.getByText("Li e aceito os Termos de Uso e a Política de Privacidade, e tenho 16 anos ou mais.")).toBeInTheDocument();
    // aluno de profissional: sem a caixa de saúde e sem a data
    expect(el("[data-consentimento-saude]")).toBeNull();
    expect(el("[data-campo-nascimento]")).toBeNull();

    expect(botao().disabled).toBe(true);
    fireEvent.click(el("[data-aceite-caixa]")!);
    expect(botao().disabled).toBe(false);
    fireEvent.click(el("[data-aceite-caixa]")!); // alterna no clique
    expect(botao().disabled).toBe(true);
    fireEvent.click(el("[data-aceite-caixa]")!);

    const novo = legal({ aceite_pendente: false });
    h.aceitar.mockResolvedValue({ ok: true, legal: novo });
    fireEvent.click(botao());
    await waitFor(() => expect(aoAceitar).toHaveBeenCalledWith(novo));
    expect(h.aceitar).toHaveBeenCalledWith({ versao: VERSAO_TEXTOS, origem: "site", saude: false, nascimento: null });
    expect(h.recarregar).toHaveBeenCalledTimes(1);
    expect(h.recarregar.mock.invocationCallOrder[0]).toBeLessThan(aoAceitar.mock.invocationCallOrder[0]);
  });

  it("os links abrem na mesma janela com o Voltar do app (o `state` da política)", () => {
    abrir(legal());
    fireEvent.click(el('[data-aceite-link="termos"]')!);
    expect(screen.getByTestId("onde").textContent).toBe("/termos");
    expect(screen.getByTestId("onde").getAttribute("data-state")).toBe(JSON.stringify({ doApp: true }));
  });

  it("aluno do app sem o consentimento: a caixa de saúde em destaque; o botão espera as 2 caixas e grava a saúde", async () => {
    const aoAceitar = abrir(legal({ saude_pendente: true }));
    const bloco = el('[data-consentimento-saude="app"]');
    expect(bloco).not.toBeNull();
    expect(bloco?.textContent).toContain("Nunca para publicidade.");
    fireEvent.click(el("[data-aceite-caixa]")!);
    expect(botao().disabled).toBe(true);
    fireEvent.click(el("[data-consentimento-saude-caixa]")!);
    expect(botao().disabled).toBe(false);
    h.aceitar.mockResolvedValue({ ok: true, legal: legal({ aceite_pendente: false, saude_pendente: false }) });
    fireEvent.click(botao());
    await waitFor(() => expect(aoAceitar).toHaveBeenCalled());
    expect(h.aceitar).toHaveBeenCalledWith({ versao: VERSAO_TEXTOS, origem: "site", saude: true, nascimento: null });
  });

  it("aluno do app sem a data: o campo obrigatório; menos de 18 → a frase, sem chamar o banco; 18+ → grava a data", async () => {
    const aoAceitar = abrir(legal({ aceite_pendente: false, saude_pendente: true, nascimento_pendente: true }));
    expect(data()).not.toBeNull();
    expect(screen.getByText("O plano sem profissional é para maiores de 18 anos.")).toBeInTheDocument();
    fireEvent.click(el("[data-aceite-caixa]")!);
    fireEvent.click(el("[data-consentimento-saude-caixa]")!);
    expect(botao().disabled).toBe(true); // falta a data

    fireEvent.change(data(), { target: { value: nascidoHa(17) } });
    expect(botao().disabled).toBe(false);
    fireEvent.click(botao());
    expect(erro()?.textContent).toBe(
      "O plano sem profissional é para maiores de 18 anos. Se você tem 16 ou 17 anos, treine com um profissional: peça o código a ele.",
    );
    expect(h.aceitar).not.toHaveBeenCalled();

    fireEvent.change(data(), { target: { value: nascidoHa(30) } });
    expect(erro()).toBeNull(); // mexeu, a frase sai
    h.aceitar.mockResolvedValue({ ok: true, legal: legal({ aceite_pendente: false }) });
    fireEvent.click(botao());
    await waitFor(() => expect(aoAceitar).toHaveBeenCalled());
    expect(h.aceitar).toHaveBeenCalledWith({ versao: VERSAO_TEXTOS, origem: "site", saude: true, nascimento: nascidoHa(30) });
  });

  it("o banco recusa com menor_de_18 (o fuso do aniversário): a mesma frase", async () => {
    abrir(legal({ nascimento_pendente: true }));
    fireEvent.click(el("[data-aceite-caixa]")!);
    fireEvent.change(data(), { target: { value: nascidoHa(30) } });
    h.aceitar.mockResolvedValue({ ok: false, erro: "menor_de_18", versao: null });
    fireEvent.click(botao());
    await waitFor(() => expect(erro()?.getAttribute("data-aceite-erro")).toBe("menor_de_18"));
    expect(erro()?.textContent).toMatch(/^O plano sem profissional é para maiores de 18 anos\./);
  });

  it("versao_desatualizada com o banco NA FRENTE: os termos mudaram → Recarregar", async () => {
    abrir(legal());
    fireEvent.click(el("[data-aceite-caixa]")!);
    h.aceitar.mockResolvedValue({ ok: false, erro: "versao_desatualizada", versao: "2099-01-01" });
    fireEvent.click(botao());
    await waitFor(() => expect(erro()?.textContent).toBe("Os termos foram atualizados. Recarregue para ler a versão nova."));
    expect(el("[data-aceite-recarregar]")).not.toBeNull();
    expect(el("[data-aceite-atualizar]")).toBeNull();
    expect(h.avisar).not.toHaveBeenCalled();
  });

  it("versao_desatualizada com o banco NA FRENTE no APK: 'Atualize o app' e a atualização pelo app (recarregar abriria o mesmo pacote)", async () => {
    h.plataforma = "app";
    abrir(legal());
    fireEvent.click(el("[data-aceite-caixa]")!);
    h.aceitar.mockResolvedValue({ ok: false, erro: "versao_desatualizada", versao: "2099-01-01" });
    fireEvent.click(botao());
    await waitFor(() => expect(erro()?.textContent).toBe("Os termos foram atualizados. Atualize o app para continuar."));
    expect(h.aceitar).toHaveBeenCalledWith(expect.objectContaining({ origem: "apk" }));
    expect(erro()?.getAttribute("data-aceite-erro")).toBe("atualize_o_app");
    expect(el("[data-aceite-recarregar]")).toBeNull();
    const atualizar = el("[data-aceite-atualizar]") as HTMLButtonElement;
    expect(atualizar.textContent).toBe("Atualizar o app");

    // o caminho do "Atualizar para 3.y" do Perfil: a última release do GitHub, baixada e instalada pelo app
    let progresso: (p: number) => void = () => {};
    let terminar: (r: string) => void = () => {};
    h.instalar.mockImplementation((_url: string, aoProgresso: (p: number) => void) => {
      progresso = aoProgresso;
      return new Promise((ok) => (terminar = ok));
    });
    fireEvent.click(atualizar);
    await waitFor(() => expect(h.instalar).toHaveBeenCalledWith("https://exemplo.invalid/physiq-3.99.0.apk", expect.any(Function)));
    act(() => progresso(42));
    expect(atualizar.textContent).toBe("Baixando 42%…");
    expect(atualizar.disabled).toBe(true);
    await act(async () => terminar("installed"));
    await waitFor(() => expect(atualizar.textContent).toBe("Atualizar o app"));
    expect(atualizar.disabled).toBe(false);
    expect(h.avisar).not.toHaveBeenCalled();
  });

  it("versao_desatualizada com o banco NA FRENTE na versão da Google Play: só a frase (quem atualiza é a loja), com o Sair e o Excluir", async () => {
    h.plataforma = "loja";
    abrir(legal());
    fireEvent.click(el("[data-aceite-caixa]")!);
    h.aceitar.mockResolvedValue({ ok: false, erro: "versao_desatualizada", versao: "2099-01-01" });
    fireEvent.click(botao());
    await waitFor(() => expect(erro()?.textContent).toBe("Os termos foram atualizados. Atualize o app para continuar."));
    expect(h.aceitar).toHaveBeenCalledWith(expect.objectContaining({ origem: "loja" }));
    expect(el("[data-aceite-recarregar]")).toBeNull();
    expect(el("[data-aceite-atualizar]")).toBeNull();
    expect(el("[data-aceite-sair]")).not.toBeNull();
    expect(el("[data-aceite-excluir]")).not.toBeNull();
    expect(h.ultimoApk).not.toHaveBeenCalled();
  });

  it("versao_desatualizada com o banco ATRÁS (a virada esqueceu o banco): a genérica e o aviso de erro ao Weslley", async () => {
    abrir(legal());
    fireEvent.click(el("[data-aceite-caixa]")!);
    h.aceitar.mockResolvedValue({ ok: false, erro: "versao_desatualizada", versao: "2026-01-01" });
    fireEvent.click(botao());
    await waitFor(() => expect(erro()?.textContent).toBe("Não deu para registrar agora. Tente mais tarde."));
    expect(el("[data-aceite-recarregar]")).toBeNull();
    expect(h.avisar).toHaveBeenCalledTimes(1);
    expect(h.avisar.mock.calls[0][0]).toMatchObject({ origem: "tela", lugar: "porta do aceite" });
    expect(String((h.avisar.mock.calls[0][0] as { mensagem?: unknown }).mensagem)).toContain("2026-01-01");
  });

  it("sem internet: a frase, sem chamar o banco; a rede caiu no meio: a mesma frase", async () => {
    h.online = false;
    abrir(legal());
    fireEvent.click(el("[data-aceite-caixa]")!);
    fireEvent.click(botao());
    expect(erro()?.textContent).toBe("Conecte-se à internet para aceitar.");
    expect(h.aceitar).not.toHaveBeenCalled();
  });

  it("a rede caiu no meio (o api devolve sem_internet): a frase de sem internet; o resto: a genérica", async () => {
    abrir(legal());
    fireEvent.click(el("[data-aceite-caixa]")!);
    h.aceitar.mockResolvedValueOnce({ ok: false, erro: "sem_internet", versao: null });
    fireEvent.click(botao());
    await waitFor(() => expect(erro()?.textContent).toBe("Conecte-se à internet para aceitar."));
    h.aceitar.mockResolvedValueOnce({ ok: false, erro: "origem_invalida", versao: null });
    fireEvent.click(botao());
    await waitFor(() => expect(erro()?.getAttribute("data-aceite-erro")).toBe("origem_invalida"));
    expect(erro()?.textContent).toBe("Não deu para registrar agora. Tente mais tarde.");
  });

  it("o banco desligou os textos: recarrega a situação e deixa passar (nada a aceitar)", async () => {
    const aoAceitar = abrir(legal());
    fireEvent.click(el("[data-aceite-caixa]")!);
    h.aceitar.mockResolvedValue({ ok: false, erro: "textos_desligados", versao: null });
    fireEvent.click(botao());
    await waitFor(() => expect(aoAceitar).toHaveBeenCalledWith(expect.objectContaining({ versao: null, aceite_pendente: false })));
    expect(h.recarregar).toHaveBeenCalled();
    expect(erro()).toBeNull();
  });

  it("Sair sai; o Excluir minha conta vai para a tela de exclusão certa (destinoDaExclusao)", () => {
    abrir(legal());
    fireEvent.click(el("[data-aceite-sair]")!);
    expect(h.sair).toHaveBeenCalledTimes(1);
    expect(el("[data-aceite-excluir]")?.getAttribute("href")).toBe("/perfil?excluir=1");
    fireEvent.click(el("[data-aceite-excluir]")!);
    expect(screen.getByTestId("onde").textContent).toBe("/perfil?excluir=1");
  });

  it("profissional: o Excluir minha conta vai para Configurações › Excluir minha conta", () => {
    h.situacao = fixture({ contas: [conta()] });
    abrir(legal());
    expect(el("[data-aceite-excluir]")?.getAttribute("href")).toBe("/painel/configuracoes/excluir-conta");
    // "Dúvidas:" com o e-mail do suporte
    expect(screen.getByText(/^Dúvidas:/).querySelector("a")?.getAttribute("href")).toMatch(/^mailto:bertoldo\.code@gmail\.com\?subject=/);
  });
});
