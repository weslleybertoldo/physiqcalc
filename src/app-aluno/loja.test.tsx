import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { matricula, situacao } from "@/test/fixturesNucleo";
import type { MatriculaPagamentos, ResumoMatricula, StatusAluno } from "@/financeiro/tipos";

// W1 da loja — o app do aluno na versão da Google Play: sem o atualizador do APK, sem "Treinar sem profissional" e, na conta do app
// (aluno sem profissional, até o Play Billing da W6), sem preço, sem Pagar/Assinar e com a trava neutra. O que o aluno paga ao
// PROFISSIONAL (Pix com comprovante, Mercado Pago da conta dele) fica igual. Sem a flag, tudo como hoje.
const h = vi.hoisted(() => {
  (globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = "3.53";
  return {
    loja: false,
    nativo: true,
    sessao: {} as Record<string, unknown>,
    resumo: null as ResumoMatricula[] | null,
    status: vi.fn(),
    plano: vi.fn(),
    apk: vi.fn(),
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
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.nativo, getPlatform: () => (h.nativo ? "android" : "web") }, registerPlugin: () => ({}) }));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "public", supabase: {} }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/financeiro/useResumoFinanceiro", () => ({ useResumoFinanceiro: () => ({ resumo: h.resumo, carregando: false, erro: false }) }));
vi.mock("@/financeiro/api", async (orig) => ({ ...(await orig<typeof import("@/financeiro/api")>()), buscarStatusAluno: () => h.status(), invalidarResumo: () => {} }));
vi.mock("@/app-aluno/sozinho/api", async (orig) => ({ ...(await orig<typeof import("@/app-aluno/sozinho/api")>()), buscarMeuPlano: () => h.plano() }));
vi.mock("@/lib/apkRelease", () => ({ ultimoApk: () => h.apk(), baixarNoNavegador: vi.fn(), RELEASES_PAGE: "https://x" }));
vi.mock("@/lib/apkUpdater", () => ({ downloadAndInstall: vi.fn() }));
vi.mock("@/hooks/usePWAInstall", () => ({ usePWAInstall: () => ({ canInstall: false, isInstalled: false, promptInstall: vi.fn() }) }));
vi.mock("@mercadopago/sdk-react", () => ({ CardPayment: () => <div data-brick-falso>brick</div>, initMercadoPago: () => {} }));

import AvisoAtualizacao from "@/ui/avisos/AvisoAtualizacao";
import { ATRASO_CHECK_UPDATE_MS } from "@/components/UpdateChecker";
import FaixaMensalidade from "./avisos/FaixaMensalidade";
import GatePagamentoPendente from "./gates/GatePagamentoPendente";
import GateSemModulo from "./gates/GateSemModulo";
import Alimentacao from "./perfil/Alimentacao";
import MeuPlano from "./perfil/MeuPlano";
import Pagamentos from "./perfil/Pagamentos";
import { RodapePerfil } from "./perfil/pecas/RodapePerfil";

const dia = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const ddmm = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
const NA_LOJA_NAO = /R\$|Assinar|Pix ou cartão|Atualizar para|verificar atualizações/i;

function montar(el: React.ReactNode, caminho = "/treino") {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter useTransitions={false} initialEntries={[caminho]}>
        <Routes>
          <Route path="*" element={el} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** resumo do financeiro do aluno: o do profissional (Pix na chave) e o da conta do app (Mercado Pago do Physiq, bloqueio ligado) */
function resumo(p: Partial<ResumoMatricula> = {}): ResumoMatricula {
  return {
    paciente_id: "p1", conta_id: "c1", conta_nome: "Lucas Ferreira", recebimento_modo: "pix_manual", bloquear_inadimplente: false, tem_chave: true,
    profissional: "Lucas Ferreira", mensalidade_valor: 249, plano_nome: "Mensal", pausada: false, pago_ate: null, desde: null, aguardando: false,
    assinatura_ativa: false, abertas: [], aguardando_avulsas: 0, ...p,
  };
}
const resumoApp = (p: Partial<ResumoMatricula> = {}) =>
  resumo({ paciente_id: "pa", conta_id: "app", conta_nome: "Physiq", recebimento_modo: "mercadopago", bloquear_inadimplente: true, tem_chave: false,
    profissional: "Physiq", mensalidade_valor: 29.9, plano_nome: "Treino", app: true, ...p });

/** matrícula de Perfil › Pagamentos */
function matriculaPag(p: Partial<MatriculaPagamentos> = {}): MatriculaPagamentos {
  return {
    paciente_id: "p1", nome: "Rafael Moura",
    conta: { id: "c1", nome: "Consultoria Ferreira", modo: "pix_manual", bloquear: false, profissional: "Lucas Ferreira" },
    chave: { tipo: "email", chave: "lucas@teste.com", favorecido: "Lucas Ferreira", banco: null },
    mensalidade: { valor: 249, plano_id: null, plano: "Mensal", pausada: false, pago_ate: dia(-3), desde: dia(-60), coberta: false },
    assinatura: null, cobrancas: [], recibos: [], ...p,
  };
}
const matriculaApp = (p: Partial<MatriculaPagamentos> = {}) =>
  matriculaPag({
    paciente_id: "pa", nome: "Rafael Moura",
    conta: { id: "app", nome: "Physiq", modo: "mercadopago", bloquear: true, profissional: "Physiq", app: true },
    chave: null,
    mensalidade: { valor: 29.9, plano_id: null, plano: "Treino", pausada: false, pago_ate: dia(5), desde: dia(-2), coberta: true, teste_ate: dia(5), plano_codigo: "app_treino" },
    ...p,
  });
const status = (matriculas: MatriculaPagamentos[]): StatusAluno => ({
  ok: true, ambiente: "staging", simulacao: true, hoje: dia(0).slice(0, 10), agora: dia(0), matriculas,
});

const PLANOS_APP = [
  { codigo: "app_treino", nome: "Treino", valor: 29.9, modulos: ["treino"], descricao: null },
  { codigo: "app_treino_alimentacao", nome: "Treino + Alimentação", valor: 49.9, modulos: ["treino", "nutricao"], descricao: null },
];
const meuPlano = (m: Record<string, unknown> = {}) => ({
  teste_dias: 7, planos: PLANOS_APP, com_profissional: false,
  matricula: { paciente_id: "pa", ativo: true, plano: "app_treino", plano_nome: "Treino", valor: 29.9, modulos: ["treino"], objetivo: "ganhar_massa",
    teste_de: dia(-2), teste_ate: dia(5), pago_ate: dia(5), pausada: false, encerrada_em: null, encerrada_motivo: null, aguardando: false, assinatura: null, ...m },
});

const sair = vi.fn(async () => {});
beforeEach(() => {
  h.loja = false;
  h.nativo = true;
  h.resumo = null;
  h.sessao = { situacao: situacao({ modulos_aluno: ["treino"], matriculas: [matricula()] }), usuario: { id: "u1" }, sair, recarregarSituacao: async () => null };
  h.status.mockReset();
  h.plano.mockReset();
  h.apk.mockReset();
  h.apk.mockResolvedValue({ version: "3.99", url: "https://x/Physiq-v3.99.apk" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("atualizador do APK — W1 da loja", () => {
  it("na loja o aviso de nova versão não monta nem consulta o GitHub (nem no app)", async () => {
    h.loja = true;
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { container } = montar(<AvisoAtualizacao />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ATRASO_CHECK_UPDATE_MS * 3);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it("no APK do site o aviso continua consultando a release depois do atraso", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false } as Response);
    vi.stubGlobal("fetch", fetchMock);
    montar(<AvisoAtualizacao />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ATRASO_CHECK_UPDATE_MS + 10);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rodapé do Perfil: na loja só 'Physiq 3.53' (sem 'Atualizar para' e sem consultar a release)", async () => {
    h.loja = true;
    montar(<RodapePerfil />, "/perfil");
    expect(screen.getByText("Physiq 3.53")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 30));
    expect(h.apk).not.toHaveBeenCalled();
    expect(document.querySelector("[data-rodape-atualizar],[data-rodape-verificar],[data-rodape-instalar]")).toBeNull();
    expect(screen.getByRole("button", { name: /Sair/ })).toBeInTheDocument();
  });

  it("W3: rodapé do Perfil com 'Política de privacidade' e 'Termos de uso' — na loja, no APK do site e no site", async () => {
    for (const [loja, nativo] of [[true, true], [false, true], [false, false]] as const) {
      h.loja = loja;
      h.nativo = nativo;
      const r = montar(<RodapePerfil />, "/perfil");
      expect(screen.getByRole("link", { name: "Política de privacidade" }).getAttribute("href")).toBe("/privacidade");
      expect(screen.getByRole("link", { name: "Termos de uso" }).getAttribute("href")).toBe("/termos");
      r.unmount();
    }
  });

  it("rodapé do Perfil: no APK do site, 'Atualizar para 3.99' (igual a hoje); no site, 'Instalar'", async () => {
    const r = montar(<RodapePerfil />, "/perfil");
    expect(await screen.findByText(/Atualizar para 3\.99/)).toBeInTheDocument();
    r.unmount();
    h.nativo = false;
    montar(<RodapePerfil />, "/perfil");
    expect(screen.getByText(/Instalar/)).toBeInTheDocument();
  });
});

describe("trava do pagamento (GatePagamentoPendente) — W1 da loja", () => {
  const vencidaApp = () => resumoApp({ pago_ate: dia(-2), teste_ate: dia(-2), desde: dia(-9) });
  const vencidaProf = () => resumo({ bloquear_inadimplente: true, pago_ate: dia(-5), desde: dia(-60) });

  it("na loja, a conta do app travada: texto neutro, sem 'Pagar', sem preço e sem link — 'Exportar ou excluir meus dados' (hml-11) e 'Sair'", () => {
    h.loja = true;
    h.resumo = [vencidaApp()];
    montar(<GatePagamentoPendente><div>o app</div></GatePagamentoPendente>);
    expect(screen.queryByText("o app")).toBeNull();
    expect(screen.getByText("Seu plano não está ativo")).toBeInTheDocument();
    expect(document.querySelector("[data-trava-app]")!.getAttribute("data-trava-app")).toBe("plano-app-inativo");
    expect(screen.queryByRole("button", { name: /Pagar/ })).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(document.body.textContent).not.toMatch(/R\$|Assine|Pague/);
    expect(screen.getByRole("button", { name: /Exportar ou excluir meus dados/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sair/ })).toBeInTheDocument();
  });

  it("hml-11 (D14): na loja, a conta do app travada também abre o Perfil reduzido (a exclusão é exigência da Play)", () => {
    h.loja = true;
    h.resumo = [vencidaApp()];
    montar(<GatePagamentoPendente><div>o app</div></GatePagamentoPendente>, "/perfil");
    expect(screen.getByText("o app")).toBeInTheDocument();
    expect(document.querySelector("[data-trava-app]")).toBeNull();
  });

  it("no site, a mesma trava da conta do app tem 'Pagar' (igual a hoje)", () => {
    h.resumo = [vencidaApp()];
    montar(<GatePagamentoPendente><div>o app</div></GatePagamentoPendente>);
    expect(screen.getByRole("button", { name: /Pagar/ })).toBeInTheDocument();
    expect(screen.getByText(/Assine o plano Treino por R\$\s?29,90\/mês/)).toBeInTheDocument();
  });

  it("na loja, a trava do PROFISSIONAL continua com 'Pagar' — e é ela que aparece quando as duas travam", () => {
    h.loja = true;
    h.resumo = [vencidaProf()];
    const r = montar(<GatePagamentoPendente><div>o app</div></GatePagamentoPendente>);
    expect(screen.getByRole("button", { name: /Pagar/ })).toBeInTheDocument();
    expect(screen.getByText(/Há um pagamento de R\$\s?249,00 vencido com Lucas/)).toBeInTheDocument();
    r.unmount();
    h.resumo = [vencidaApp(), vencidaProf()];
    montar(<GatePagamentoPendente><div>o app</div></GatePagamentoPendente>);
    expect(screen.getByText(/vencido com Lucas/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pagar/ })).toBeInTheDocument();
  });
});

describe("faixa da mensalidade (FaixaMensalidade) — W1 da loja", () => {
  it("na loja a conta do app (dias grátis) não tem faixa; no site tem 'Assinar'", () => {
    h.loja = true;
    h.resumo = [resumoApp({ pago_ate: dia(3), teste_ate: dia(3), desde: dia(-4) })];
    const r = montar(<FaixaMensalidade />);
    expect(document.querySelector("[data-faixa-mensalidade]")).toBeNull();
    r.unmount();
    h.loja = false;
    montar(<FaixaMensalidade />);
    expect(screen.getByRole("button", { name: "Assinar" })).toBeInTheDocument();
  });

  it("na loja a mensalidade do PROFISSIONAL continua na faixa com o 'Pagar'", () => {
    h.loja = true;
    h.resumo = [resumoApp({ pago_ate: dia(3), teste_ate: dia(3), desde: dia(-4) }), resumo({ pago_ate: dia(2), desde: dia(-30) })];
    montar(<FaixaMensalidade />);
    expect(screen.getByText(/Sua mensalidade vence em 2 dias/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pagar" })).toBeInTheDocument();
  });
});

describe("aluno sem módulo (GateSemModulo) — W1 da loja", () => {
  it("na loja a trava não oferece 'Treinar sem profissional'; no site oferece", () => {
    h.loja = true;
    h.sessao = { ...h.sessao, situacao: situacao({ modulos_aluno: [], matriculas: [matricula({ modulos: [] })] }) };
    const r = montar(<GateSemModulo><div>o app</div></GateSemModulo>);
    expect(screen.getByText("Seu profissional ainda não liberou seu acesso")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Treinar sem profissional/ })).toBeNull();
    r.unmount();
    h.loja = false;
    montar(<GateSemModulo><div>o app</div></GateSemModulo>);
    expect(screen.getByRole("button", { name: /Treinar sem profissional/ })).toBeInTheDocument();
  });
});

describe("Perfil › Meu plano (conta do app) — W1 da loja", () => {
  it("na loja: o plano e a situação, sem preço, sem Assinar/Pagar e sem trocar de plano; o objetivo continua", async () => {
    h.loja = true;
    h.plano.mockResolvedValue(meuPlano());
    montar(<MeuPlano />, "/perfil/meu-plano");
    expect(await screen.findByText(`Grátis até ${ddmm(dia(5))}`)).toBeInTheDocument();
    expect(document.querySelector("[data-meu-plano-nome]")!.textContent).toBe("Treino");
    expect(document.querySelector("[data-meu-plano-pagar],[data-meu-plano-trocar],[data-meu-plano-valor],[data-meu-plano-linha]")).toBeNull();
    expect(document.querySelector("[data-meu-plano-objetivo]")).not.toBeNull();
    expect(document.querySelector("[data-pagina-meu-plano]")!.textContent).not.toMatch(NA_LOJA_NAO);
  });

  it("no site: o valor, 'Assinar por R$ 29,90/mês' e o 'Trocar de plano' (igual a hoje)", async () => {
    h.plano.mockResolvedValue(meuPlano());
    montar(<MeuPlano />, "/perfil/meu-plano");
    expect(await screen.findByRole("button", { name: /Assinar por R\$\s?29,90\/mês/ })).toBeInTheDocument();
    expect(document.querySelector("[data-meu-plano-trocar]")).not.toBeNull();
    expect(document.querySelector("[data-meu-plano-valor]")!.textContent).toMatch(/R\$\s?29,90\/mês/);
  });
});

describe("Perfil › Pagamentos — W1 da loja", () => {
  it("na loja, a conta do app: o plano e a situação, sem preço e sem Assinar; a do PROFISSIONAL continua com o Pagar", async () => {
    h.loja = true;
    h.status.mockResolvedValue(status([matriculaApp(), matriculaPag()]));
    montar(<Pagamentos />, "/perfil/pagamentos");
    const app = await waitFor(() => {
      const el = document.querySelector('[data-matricula-pagamentos="pa"]');
      if (!el) throw new Error("ainda carregando");
      return el as HTMLElement;
    });
    expect(app.querySelector("[data-plano-app-nome]")!.textContent).toBe("Treino");
    expect(app.querySelector("[data-pagar-mensalidade]")).toBeNull();
    expect(app.querySelector("[data-linha-mensalidade]")!.textContent).toBe(`Grátis até ${ddmm(dia(5))}`);
    expect(app.textContent).not.toMatch(/R\$|Assinar|Pix ou cartão|combine/);
    const prof = document.querySelector('[data-matricula-pagamentos="p1"]') as HTMLElement;
    expect(prof.querySelector("[data-pagar-mensalidade]")!.textContent).toMatch(/Pagar R\$\s?249,00/);
    expect(prof.querySelector("[data-linha-mensalidade]")!.textContent).toMatch(/· Pix$/);
  });

  it("na loja o ?pagar=mensalidade não abre o pagamento da conta do app", async () => {
    h.loja = true;
    h.status.mockResolvedValue(status([matriculaApp()]));
    montar(<Pagamentos />, "/perfil/pagamentos?pagar=mensalidade");
    expect(await screen.findByText("Treino")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector("[data-pagar-mp]")).toBeNull();
  });

  it("na loja, a cobrança automática que já existe na conta do app continua cancelável (sem o valor)", async () => {
    h.loja = true;
    h.status.mockResolvedValue(status([matriculaApp({
      assinatura: { id: "a1", status: "authorized", valor: 29.9, proximo_vencimento: dia(5), sandbox: true, simulada: true, init_point: null },
    })]));
    montar(<Pagamentos />, "/perfil/pagamentos");
    const card = await waitFor(() => {
      const el = document.querySelector('[data-assinatura-aluno="authorized"]');
      if (!el) throw new Error("ainda carregando");
      return el as HTMLElement;
    });
    expect(card.textContent).not.toMatch(/R\$/);
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("no site, a conta do app tem 'Assinar · R$ 29,90/mês' e o ?pagar=mensalidade abre o Mercado Pago (igual a hoje)", async () => {
    h.status.mockResolvedValue(status([matriculaApp()]));
    montar(<Pagamentos />, "/perfil/pagamentos?pagar=mensalidade");
    expect(await screen.findByRole("button", { name: /Assinar · R\$\s?29,90\/mês/ })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector("[data-pagar-mp]")).not.toBeNull());
  });
});

describe("Perfil › Alimentação (aluno do app só com Treino) — W1 da loja", () => {
  it("na loja sem 'Ver os planos' nem convite a trocar de plano; no site com", () => {
    h.loja = true;
    h.sessao = { ...h.sessao, situacao: situacao({ modulos_aluno: ["treino"], matriculas: [matricula({ conta_origem: "app", app: true, app_plano: "app_treino" })] }) };
    const r = montar(<Alimentacao />, "/perfil/alimentacao");
    expect(screen.queryByRole("button", { name: "Ver os planos" })).toBeNull();
    expect(screen.getByText("Os pratos prontos, com calorias e macros, não fazem parte do seu plano.")).toBeInTheDocument();
    r.unmount();
    h.loja = false;
    montar(<Alimentacao />, "/perfil/alimentacao");
    expect(screen.getByRole("button", { name: "Ver os planos" })).toBeInTheDocument();
  });
});
