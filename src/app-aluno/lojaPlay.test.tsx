import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { matricula, situacao } from "@/test/fixturesNucleo";
import type { CobrancaVista, MatriculaPagamentos, PlayDaMatricula, ResumoMatricula, StatusAluno } from "@/financeiro/tipos";

// play-W6 — as telas da conta do app COM a Play valendo (ehLoja + o plugin + a trava/conta de teste + o aparelho + as ofertas): o
// "Treinar sem profissional" volta, o preço é SÓ o da Play (aqui R$ 31,90 / R$ 51,90, de propósito diferente do banco: 20,00 / 35,00),
// assinar e trocar pela Play, Gerenciar na Google Play. E o site (e o APK do site) de quem tem a Play viva: a assinatura + o link de
// gerenciar, sem Pix, cartão, automática nem trocar. A loja SEM a Play valendo é o src/app-aluno/loja.test.tsx (intacto).
const h = vi.hoisted(() => {
  (globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = "3.53";
  return {
    loja: true,
    plugin: true,
    sessao: {} as Record<string, unknown>,
    resumo: null as unknown,
    status: vi.fn(),
    plano: vi.fn(),
    play: {} as Record<string, unknown>,
    assinar: vi.fn(),
    gerenciar: vi.fn(),
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
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" }, registerPlugin: () => ({}) }));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "public", supabase: {} }));
vi.mock("@/integrations/principal/client", () => ({ principal: { rpc: vi.fn(), functions: { invoke: vi.fn() } } }));
vi.mock("@/lib/profPendente", () => ({ lerProfPendente: () => null, limparProfPendente: () => {} }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/financeiro/useResumoFinanceiro", () => ({ useResumoFinanceiro: () => ({ resumo: h.resumo, carregando: false, erro: false }) }));
vi.mock("@/financeiro/api", async (orig) => ({ ...(await orig<typeof import("@/financeiro/api")>()), buscarStatusAluno: () => h.status(), invalidarResumo: () => {} }));
vi.mock("@/app-aluno/sozinho/api", async (orig) => ({ ...(await orig<typeof import("@/app-aluno/sozinho/api")>()), buscarMeuPlano: () => h.plano() }));
vi.mock("@/app-aluno/sozinho/usePlayDaLoja", () => ({ usePlayDaLoja: () => h.play, carregarPlayDaLoja: async () => {} }));
vi.mock("@/app-aluno/sozinho/play", () => ({
  ErroPlay: class extends Error {},
  assinarPelaPlay: h.assinar,
  gerenciarAssinatura: h.gerenciar,
  recuperarComprasDaPlay: async () => 0,
  buscarEstadoPlay: async () => null,
  registrarCompraPlay: async () => null,
}));
vi.mock("@/lib/playBilling", async (orig) => ({
  ...(await orig<typeof import("@/lib/playBilling")>()),
  pluginDaPlayPresente: () => h.plugin,
  ouvirComprasDaPlay: async () => () => {},
}));
vi.mock("@/lib/apkRelease", () => ({ ultimoApk: async () => null, baixarNoNavegador: vi.fn(), RELEASES_PAGE: "https://x" }));
vi.mock("@/lib/apkUpdater", () => ({ downloadAndInstall: vi.fn() }));
vi.mock("@/hooks/usePWAInstall", () => ({ usePWAInstall: () => ({ canInstall: false, isInstalled: false, promptInstall: vi.fn() }) }));
vi.mock("@mercadopago/sdk-react", () => ({ CardPayment: () => <div data-brick-falso>brick</div>, initMercadoPago: () => {} }));

import BoasVindas from "@/entrada/BoasVindas";
import TreinarSemProfissional from "@/entrada/onboarding/TreinarSemProfissional";
import FaixaMensalidade from "./avisos/FaixaMensalidade";
import GatePagamentoPendente from "./gates/GatePagamentoPendente";
import GateSemModulo from "./gates/GateSemModulo";
import Alimentacao from "./perfil/Alimentacao";
import MeuPlano from "./perfil/MeuPlano";
import Pagamentos from "./perfil/Pagamentos";

const dia = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const ddmm = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
/** o que NUNCA aparece na conta do app na loja: o preço do banco, o site e as formas do site */
const SO_DO_SITE = /20,00|35,00|Pix|cart[ãa]o|Mercado Pago/i;

const OFERTAS = {
  app_treino: { produto: "app_treino", token: "tok-t", preco: "R$ 31,90", micros: 31_900_000, moeda: "BRL" },
  app_treino_alimentacao: { produto: "app_treino_alimentacao", token: "tok-ta", preco: "R$ 51,90", micros: 51_900_000, moeda: "BRL" },
};
const PLAY_ATIVA = { ativa: true, carregando: false, estado: { disponivel: true, matricula: { id: "pa", ativo: true }, assinatura: null, automatica_mp: false },
  ofertas: OFERTAS, menorPreco: "R$ 31,90", recarregar: async () => {} };
const PLAY_INATIVA = { ativa: false, carregando: false, estado: null, ofertas: {}, menorPreco: null, recarregar: async () => {} };
const VIVA: PlayDaMatricula = { estado: "ativa", renova: true, expira_em: dia(20), produto: "app_treino" };

function Onde() {
  const l = useLocation();
  return <div data-onde={l.pathname + l.search} />;
}
function montar(el: React.ReactNode, caminho = "/treino") {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter useTransitions={false} initialEntries={[caminho]}>
        <Routes>
          <Route path="*" element={<>{el}<Onde /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const onde = () => document.querySelector("[data-onde]")!.getAttribute("data-onde");

function resumo(p: Partial<ResumoMatricula> = {}): ResumoMatricula {
  return {
    paciente_id: "p1", conta_id: "c1", conta_nome: "Lucas Ferreira", recebimento_modo: "pix_manual", bloquear_inadimplente: false, tem_chave: true,
    profissional: "Lucas Ferreira", mensalidade_valor: 249, plano_nome: "Mensal", pausada: false, pago_ate: null, desde: null, aguardando: false,
    assinatura_ativa: false, abertas: [], aguardando_avulsas: 0, ...p,
  };
}
const resumoApp = (p: Partial<ResumoMatricula> = {}) =>
  resumo({ paciente_id: "pa", conta_id: "app", conta_nome: "Physiq", recebimento_modo: "mercadopago", bloquear_inadimplente: true, tem_chave: false,
    profissional: "Physiq", mensalidade_valor: 20, plano_nome: "Treino", app: true, plano_codigo: "app_treino", ...p });
const matriculaApp = (p: Partial<MatriculaPagamentos> = {}): MatriculaPagamentos => ({
  paciente_id: "pa", nome: "Rafael Moura",
  conta: { id: "app", nome: "Physiq", modo: "mercadopago", bloquear: true, profissional: "Physiq", app: true },
  chave: null,
  mensalidade: { valor: 20, plano_id: null, plano: "Treino", pausada: false, pago_ate: dia(20), desde: dia(-12), coberta: true, teste_ate: dia(-5), plano_codigo: "app_treino" },
  assinatura: null, cobrancas: [], recibos: [], ...p,
} as MatriculaPagamentos);
const status = (matriculas: MatriculaPagamentos[]): StatusAluno => ({ ok: true, ambiente: "staging", simulacao: true, hoje: dia(0).slice(0, 10), agora: dia(0), matriculas });
const PLANOS_APP = [
  { codigo: "app_treino", nome: "Treino", valor: 20, modulos: ["treino"], descricao: null },
  { codigo: "app_treino_alimentacao", nome: "Treino + Alimentação", valor: 35, modulos: ["treino", "nutricao"], descricao: null },
];
const meuPlano = (m: Record<string, unknown> = {}) => ({
  teste_dias: 7, planos: PLANOS_APP, com_profissional: false,
  matricula: { paciente_id: "pa", ativo: true, plano: "app_treino", plano_nome: "Treino", valor: 20, modulos: ["treino"], objetivo: "manter",
    teste_de: dia(-2), teste_ate: dia(5), pago_ate: dia(5), pausada: false, encerrada_em: null, encerrada_motivo: null, aguardando: false, assinatura: null, ...m },
});

beforeEach(() => {
  h.loja = true;
  h.plugin = true;
  h.play = PLAY_ATIVA;
  h.resumo = null;
  h.sessao = { situacao: situacao({ modulos_aluno: ["treino"], matriculas: [matricula()] }), usuario: { id: "u1", email: "a@teste.app" }, sair: async () => {},
    recarregarSituacao: async () => null, entrarComGoogle: async () => ({}) };
  h.status.mockReset();
  h.plano.mockReset();
  h.assinar.mockReset();
  h.gerenciar.mockReset();
});

describe("loja COM a Play valendo — a entrada", () => {
  it("Boas-vindas: o 'Treinar sem profissional' volta (o 'Sou profissional' segue só no site)", async () => {
    h.sessao = { ...h.sessao, situacao: { sem_nada: true, nome: "Ana Souza" } };
    h.plano.mockResolvedValue({ teste_dias: 7, planos: PLANOS_APP, matricula: null, com_profissional: false });
    montar(<BoasVindas />, "/boas-vindas");
    expect(await screen.findByText("Treinar sem profissional")).toBeInTheDocument();
    expect([...document.querySelectorAll("[data-onboarding]")].map((e) => e.getAttribute("data-onboarding"))).toEqual(["TenhoCodigo", "TreinarSemProfissional"]);
    expect(screen.queryByText("Sou profissional")).toBeNull();
    expect(screen.getByText(/Treine sozinho com os dias grátis/)).toBeInTheDocument();
  });

  it("Treinar sem profissional: os preços da PLAY, 'a assinatura pela Google Play' e 'nada é cobrado sem você assinar'", async () => {
    h.plano.mockResolvedValue({ teste_dias: 7, planos: PLANOS_APP, matricula: null, com_profissional: false });
    montar(<TreinarSemProfissional />, "/boas-vindas");
    expect(await screen.findByText(/Depois, a partir de R\$ 31,90\/mês\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Quero treinar sozinho/ }));
    await waitFor(() => expect(document.querySelectorAll("[data-preco-plano]")).toHaveLength(2));
    expect([...document.querySelectorAll("[data-preco-plano]")].map((e) => e.textContent)).toEqual(["R$ 31,90/mês", "R$ 51,90/mês"]);
    const teste = document.querySelector("[data-sozinho-teste='play']")!.textContent!.replace(/\s+/g, " ");
    expect(teste).toMatch(/7 dias grátis no app, até .+\. Para continuar depois, a assinatura pela Google Play a partir de R\$ 31,90\/mês — nada é cobrado sem você assinar\./);
    expect(document.querySelector("[data-onboarding='TreinarSemProfissional']")!.textContent).not.toMatch(SO_DO_SITE);
  });

  it("aluno sem módulo: o 'Treinar sem profissional' volta na trava", () => {
    h.sessao = { ...h.sessao, situacao: situacao({ modulos_aluno: [], matriculas: [matricula({ modulos: [] })] }) };
    montar(<GateSemModulo><div>o app</div></GateSemModulo>);
    expect(screen.getByRole("button", { name: /Treinar sem profissional/ })).toBeInTheDocument();
  });
});

describe("loja COM a Play valendo — a trava, a faixa, Meu plano, Pagamentos e Alimentação", () => {
  it("a trava da conta do app: 'Assinar pela Google Play' (a folha da oferta: preço, renovação, cancelar, Termos e Privacidade)", async () => {
    h.resumo = [resumoApp({ pago_ate: dia(-2), teste_ate: dia(-2), desde: dia(-9) })];
    h.assinar.mockResolvedValue({ tipo: "assinada", registro: null });
    montar(<GatePagamentoPendente><div>o app</div></GatePagamentoPendente>);
    expect(document.querySelector("[data-trava-app]")!.getAttribute("data-trava-app")).toBe("plano-app-play");
    expect(screen.getByText(/Assine o plano Treino pela Google Play para voltar a usar o app/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Pagar/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Assinar pela Google Play · R$ 31,90/mês" }));
    const folha = await waitFor(() => {
      const el = document.querySelector("[data-folha-oferta-play='app_treino']");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    const texto = folha.textContent!.replace(/\s+/g, " ");
    expect(texto).toMatch(/R\$ 31,90\/mês/);
    expect(texto).toMatch(/R\$ 31,90 por mês\./);
    expect(texto).toMatch(/Renova todo mês até você cancelar\./);
    expect(texto).toMatch(/Cancele quando quiser na Google Play\./);
    expect(folha.querySelector("a[href='/termos']")).not.toBeNull();
    expect(folha.querySelector("a[href='/privacidade']")).not.toBeNull();
    expect(texto).not.toMatch(SO_DO_SITE);
    fireEvent.click(screen.getByRole("button", { name: "Assinar pela Google Play" }));
    await waitFor(() => expect(h.assinar).toHaveBeenCalledWith({ matriculaId: "pa", oferta: OFERTAS.app_treino, troca: null }));
  });

  it("a revisão ⚪15 + ⚪17: o 502 do registrar e o já tem RECARREGAM (a Play e a situação); o já tem mostra o Gerenciar", async () => {
    for (const codigo of ["google_indisponivel", "ja_tem"] as const) {
      const recarregar = vi.fn(async () => {});
      const recarregarSituacao = vi.fn(async () => null);
      h.play = { ...PLAY_ATIVA, recarregar };
      h.sessao = { ...h.sessao, recarregarSituacao };
      h.resumo = [resumoApp({ pago_ate: dia(-2), teste_ate: dia(-2), desde: dia(-9) })];
      h.assinar.mockReset().mockResolvedValue({ tipo: "erro", codigo });
      const r = montar(<GatePagamentoPendente><div>o app</div></GatePagamentoPendente>);
      fireEvent.click(screen.getByRole("button", { name: "Assinar pela Google Play · R$ 31,90/mês" }));
      await waitFor(() => expect(document.querySelector("[data-folha-oferta-play='app_treino']")).not.toBeNull());
      fireEvent.click(screen.getByRole("button", { name: "Assinar pela Google Play" }));
      await waitFor(() => expect(document.querySelector("[data-play-erro]")).not.toBeNull());
      await waitFor(() => expect(recarregar).toHaveBeenCalled());
      expect(recarregarSituacao, codigo).toHaveBeenCalled();
      const gerenciar = document.querySelector("[data-folha-oferta-play] [data-play-gerenciar]");
      if (codigo === "ja_tem") expect(gerenciar, codigo).not.toBeNull();
      else expect(gerenciar, codigo).toBeNull();
      r.unmount();
    }
  });

  it("a revisão ⚪17: sem a oferta do plano DA MATRÍCULA, o botão não vende outro plano (nada de \"Assinar Treino + Alimentação\" com o Treino)", () => {
    h.play = { ...PLAY_ATIVA, ofertas: { app_treino: OFERTAS.app_treino } };
    h.resumo = [resumoApp({ pago_ate: dia(-2), teste_ate: dia(-30), desde: dia(-40), plano_codigo: "app_treino_alimentacao", plano_nome: "Treino + Alimentação" })];
    montar(<GatePagamentoPendente><div>o app</div></GatePagamentoPendente>);
    expect(document.querySelector("[data-play-assinar]")).toBeNull();
  });

  it("a revisão ⚪17: enquanto a Play da loja carrega, a trava NÃO pisca a loja de hoje (o \"acesso pausado\" sem saída)", () => {
    h.play = { ...PLAY_INATIVA, carregando: true };
    h.resumo = [resumoApp({ pago_ate: dia(-2), teste_ate: dia(-30), desde: dia(-40) })];
    montar(<GatePagamentoPendente><div>o app</div></GatePagamentoPendente>);
    expect(document.querySelector("[data-trava-app]")?.getAttribute("data-trava-app")).toBe("carregando");
    expect(screen.queryByText(/O acesso ao app está pausado/)).toBeNull();
  });

  it("a faixa nos dias grátis: o preço da Play + 'Assinar' → Meu plano com a folha", async () => {
    h.resumo = [resumoApp({ pago_ate: dia(3), teste_ate: dia(3), desde: dia(-4) })];
    montar(<FaixaMensalidade />, "/");
    expect(screen.getByText(/Depois, R\$ 31,90\/mês · Google Play/)).toBeInTheDocument();
    expect(document.querySelector("[data-faixa-mensalidade]")!.textContent).not.toMatch(SO_DO_SITE);
    fireEvent.click(screen.getByRole("button", { name: "Assinar" }));
    expect(onde()).toBe("/perfil/meu-plano?assinar=1");
  });

  it("Meu plano no teste: o preço da Play, Assinar (o ?assinar=1 abre a folha) e trocar com os preços da Play — nada do site", async () => {
    h.plano.mockResolvedValue(meuPlano());
    montar(<MeuPlano />, "/perfil/meu-plano?assinar=1");
    expect(await screen.findByText("R$ 31,90/mês pela Google Play")).toBeInTheDocument();
    expect(await waitFor(() => document.querySelector("[data-folha-oferta-play='app_treino']"))).not.toBeNull();
    expect(document.querySelector("[data-play-linhas]")!.textContent).toMatch(/A Google Play cobra hoje, e os dias que você já tem \(até .+\) continuam/);
    expect([...document.querySelectorAll("[data-meu-plano-trocar-play] [data-preco-plano]")].map((e) => e.textContent)).toEqual(["R$ 31,90/mês", "R$ 51,90/mês"]);
    expect(document.querySelector("[data-meu-plano-pagar],[data-meu-plano-trocar],[data-meu-plano-valor],[data-meu-plano-linha]")).toBeNull();
    expect(document.querySelector("[data-pagina-meu-plano]")!.textContent).not.toMatch(SO_DO_SITE);
  });

  it("Meu plano com a assinatura viva: 'Assinatura pela Google Play · até · renova sozinha' + Gerenciar; o completo troca NA HORA pela Play", async () => {
    h.plano.mockResolvedValue(meuPlano({ play: VIVA, pago_ate: dia(20) }));
    h.assinar.mockResolvedValue({ tipo: "assinada", registro: null });
    montar(<MeuPlano />, "/perfil/meu-plano");
    expect(await screen.findByText(`até ${ddmm(VIVA.expira_em)} · renova sozinha`)).toBeInTheDocument();
    expect(document.querySelector("[data-play-assinar]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Gerenciar na Google Play/ }));
    expect(h.gerenciar).toHaveBeenCalledWith("app_treino");
    fireEvent.click(document.querySelector("[data-meu-plano-trocar-play] [data-plano-app='app_treino_alimentacao']") as HTMLElement);
    const troca = await waitFor(() => {
      const el = document.querySelector("[data-play-troca]");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(troca.getAttribute("data-play-troca")).toBe("na_hora");
    expect(troca.textContent).toMatch(/Vale na hora/);
    fireEvent.click(screen.getByRole("button", { name: "Trocar pela Google Play" }));
    await waitFor(() => expect(h.assinar).toHaveBeenCalledWith({ matriculaId: "pa", oferta: OFERTAS.app_treino_alimentacao,
      troca: { produtoAntigo: "app_treino", modo: "na_hora" } }));
  });

  it("Meu plano com o completo vivo: o Treino troca NA RENOVAÇÃO", async () => {
    h.plano.mockResolvedValue(meuPlano({ play: { ...VIVA, produto: "app_treino_alimentacao" }, plano: "app_treino_alimentacao", plano_nome: "Treino + Alimentação", modulos: ["treino", "nutricao"] }));
    montar(<MeuPlano />, "/perfil/meu-plano");
    await screen.findByText(/renova sozinha/);
    fireEvent.click(document.querySelector("[data-meu-plano-trocar-play] [data-plano-app='app_treino']") as HTMLElement);
    expect((await waitFor(() => document.querySelector("[data-play-troca]")))!.getAttribute("data-play-troca")).toBe("na_renovacao");
  });

  it("T2 (a): Meu plano com a troca para o Treino AGENDADA (o DEFERRED): 'vira Treino em DD/MM' no lugar de 'não renova'", async () => {
    const agendada = { ...VIVA, produto: "app_treino_alimentacao", renova: false, troca_para: "app_treino" as const };
    h.plano.mockResolvedValue(meuPlano({ play: agendada, plano: "app_treino_alimentacao", plano_nome: "Treino + Alimentação", modulos: ["treino", "nutricao"] }));
    montar(<MeuPlano />, "/perfil/meu-plano");
    expect(await screen.findByText(`até ${ddmm(VIVA.expira_em)} · vira Treino em ${ddmm(VIVA.expira_em)}`)).toBeInTheDocument();
    expect(screen.queryByText(/não renova/)).toBeNull();
    expect(document.querySelector("[data-assinatura-play-titulo]")!.textContent).toBe("Assinatura pela Google Play · Treino + Alimentação");
  });

  it("Meu plano com a automática do MP ainda viva: sem a oferta da Play ('Seu plano é pago no cartão')", async () => {
    h.plano.mockResolvedValue(meuPlano({ assinatura: { status: "authorized", valor: 20, proximo_vencimento: dia(10) } }));
    montar(<MeuPlano />, "/perfil/meu-plano");
    expect(await screen.findByText(/Seu plano é pago no cartão/)).toBeInTheDocument();
    expect(document.querySelector("[data-play-assinar]")).toBeNull();
  });

  it("Pagamentos com a assinatura viva: o cartão da Play + Gerenciar (pelo app); o pedido da Play no histórico ('Google Play'); sem Pagar", async () => {
    // a vista do pedido da Play (a do aluno_status — o play_pedido nunca sai do servidor)
    const pedido: CobrancaVista = { id: "c9", paciente_id: "pa", tipo: "mensalidade", descricao: "Mensalidade · Treino · Google Play", valor: 31.9,
      vencimento: dia(-10).slice(0, 10), status: "paga", forma: "google_play", metodo: null, mes_ref: null, pago_em: dia(-10), enviado_em: null, cobre_de: null,
      cobre_ate: null, comprovante: false, comprovante_pdf: false, recusado_motivo: null, recusado_em: null, reembolsado_em: null, mp_status: null, mp: false,
      mp_simulado: false, transacao_id: null, pix_qr: null, pix_copia_cola: null, pix_expira_em: null, criado_por: null, confirmado_em: null, created_at: dia(-10) };
    h.status.mockResolvedValue(status([matriculaApp({ play: VIVA, cobrancas: [pedido] })]));
    montar(<Pagamentos />, "/perfil/pagamentos");
    const cartao = await waitFor(() => {
      const el = document.querySelector("[data-assinatura-play='ativa']");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(cartao.textContent).toMatch(/Assinatura pela Google Play · Treino/);
    expect(cartao.querySelector("[data-play-gerenciar='app']")).not.toBeNull();
    expect(document.querySelector("[data-pagar-mensalidade]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Gerenciar na Google Play/ }));
    expect(h.gerenciar).toHaveBeenCalledWith("app_treino");
  });

  it("Alimentação: o 'Ver os planos' volta (a troca é pela Play, em Meu plano)", () => {
    h.sessao = { ...h.sessao, situacao: situacao({ modulos_aluno: ["treino"], matriculas: [matricula({ app: true, ativo: true, modulos: ["treino"] } as never)] }) };
    montar(<Alimentacao />, "/perfil/alimentacao");
    expect(document.querySelector("[data-alimentacao-bloqueada]")!.textContent).not.toMatch(/não fazem parte do seu plano/);
    fireEvent.click(screen.getByRole("button", { name: "Ver os planos" }));
    expect(onde()).toBe("/perfil/meu-plano");
  });
});

describe("site (e APK do site) com a assinatura da Play viva: a assinatura + o link de gerenciar, sem Pix, cartão, automática nem trocar", () => {
  beforeEach(() => {
    h.loja = false;
    h.plugin = false;
    h.play = PLAY_INATIVA;
  });

  it("Pagamentos: 'Assinatura pela Google Play · até · renova sozinha' + o link da Central de assinaturas; sem Pagar", async () => {
    h.status.mockResolvedValue(status([matriculaApp({ play: VIVA })]));
    montar(<Pagamentos />, "/perfil/pagamentos");
    const cartao = await waitFor(() => {
      const el = document.querySelector("[data-assinatura-play='ativa']");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(cartao.textContent).toMatch(new RegExp(`até ${ddmm(VIVA.expira_em)} · renova sozinha`));
    const link = cartao.querySelector("a[data-play-gerenciar='link']")!;
    expect(link.getAttribute("href")).toBe("https://play.google.com/store/account/subscriptions?sku=app_treino&package=com.bertoldo.physiqcalc");
    expect(document.querySelector("[data-pagar-mensalidade]")).toBeNull();
    expect(document.querySelector("[data-linha-mensalidade]")!.textContent).not.toMatch(/Pix|cart[ãa]o/);
  });

  it("Meu plano: a assinatura + o link; sem Pagar e sem trocar", async () => {
    h.plano.mockResolvedValue(meuPlano({ play: VIVA, pago_ate: dia(20) }));
    montar(<MeuPlano />, "/perfil/meu-plano");
    expect(await screen.findByText(/renova sozinha/)).toBeInTheDocument();
    expect(document.querySelector("[data-meu-plano-pagar],[data-meu-plano-trocar],[data-meu-plano-linha]")).toBeNull();
    expect(document.querySelector("a[data-play-gerenciar='link']")).not.toBeNull();
  });

  it("a faixa some (renova sozinha); a trava da suspensa pede para atualizar na Google Play (sem Pagar)", () => {
    h.resumo = [resumoApp({ pago_ate: dia(3), teste_ate: dia(-10), desde: dia(-40), play: VIVA })];
    const r = montar(<FaixaMensalidade />, "/");
    expect(document.querySelector("[data-faixa-mensalidade]")).toBeNull();
    r.unmount();
    h.resumo = [resumoApp({ pago_ate: dia(-2), teste_ate: dia(-30), desde: dia(-40), play: { ...VIVA, estado: "suspensa", expira_em: dia(-2) } })];
    montar(<GatePagamentoPendente><div>o app</div></GatePagamentoPendente>);
    expect(document.querySelector("[data-trava-app]")!.getAttribute("data-trava-app")).toBe("play-travada");
    expect(screen.getByText("Assinatura suspensa")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Atualizar na Google Play/ }).getAttribute("href")).toMatch(/^https:\/\/play\.google\.com\/store\/account\/subscriptions/);
    expect(screen.queryByRole("button", { name: /^Pagar/ })).toBeNull();
  });

  it("a revisão 🟡3: a trava da Play só com a suspensa/pausada — a ativa ou a cancelada com a cobertura vencida NÃO prendem em \"Atualizar na Google Play\"", () => {
    for (const estado of ["ativa", "cancelada", "carencia", "pendente"] as const) {
      h.resumo = [resumoApp({ pago_ate: dia(-2), teste_ate: dia(-30), desde: dia(-40), play: { ...VIVA, estado, renova: estado !== "cancelada", expira_em: dia(-2) } })];
      const r = montar(<GatePagamentoPendente><div>o app</div></GatePagamentoPendente>);
      expect(document.querySelector("[data-trava-app]")?.getAttribute("data-trava-app"), estado).not.toBe("play-travada");
      r.unmount();
    }
  });
});
