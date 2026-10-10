import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  conta: { id: "c1", nome: "Rafael Lima", papeis: ["dono", "personal"], profissionais: 1 } as Record<string, unknown> | null,
  dono: true,
  statusConexao: vi.fn(),
  pedirConexao: vi.fn(),
  desconectar: vi.fn(),
  enviarTeste: vi.fn(),
  buscarResumo: vi.fn(),
  listarFila: vi.fn(),
  salvarConfig: vi.fn(),
  reenviar: vi.fn(),
  limparFalhas: vi.fn(),
  lerPerfilWhatsapp: vi.fn(),
}));
vi.mock("@/nucleo/conta", () => ({ useConta: () => ({ conta: h.conta, ehDono: h.dono }) }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: { id: "u-rafael" } }) }));
vi.mock("@/ui/casca/topo", () => ({
  TopoPagina: ({ titulo, subtitulo, acoes }: { titulo?: ReactNode; subtitulo?: ReactNode; acoes?: ReactNode }) => (
    <header data-topo><h1>{titulo}</h1><p data-testid="subtitulo">{subtitulo}</p><div data-topo-acoes>{acoes}</div></header>
  ),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/integrations/principal/client", () => ({ PRINCIPAL_SCHEMA: "staging", principal: { rpc: vi.fn(), functions: { invoke: vi.fn() }, from: vi.fn() } }));
vi.mock("./api", async (orig) => ({
  ...(await orig<typeof import("./api")>()),
  statusConexao: h.statusConexao,
  pedirConexao: h.pedirConexao,
  desconectar: h.desconectar,
  enviarTeste: h.enviarTeste,
  buscarResumo: h.buscarResumo,
  listarFila: h.listarFila,
  salvarConfig: h.salvarConfig,
  reenviar: h.reenviar,
  limparFalhas: h.limparFalhas,
  lerPerfilWhatsapp: h.lerPerfilWhatsapp,
}));

import Mensagens from "@/painel/paginas/Mensagens";
import useContadorMensagens from "@/painel/contadores/Mensagens";
import type { ResumoMensagens } from "./api";
import type { ItemFila } from "./filaUtil";
import type { Instancia } from "./whatsappUtil";

const AGORA = Date.now();
const iso = (segundosAtras: number) => new Date(AGORA - segundosAtras * 1000).toISOString();
const inst = (o: Partial<Instancia> = {}): Instancia => ({
  id: "i1", status: "desconectado", numero_e164: null, numero_conectado: null, qr_code: null, qr_atualizado_em: null, conectado_em: null,
  ultimo_ping: iso(20), erro: null, ...o,
});
const resumo = (o: Partial<ResumoMensagens> = {}): ResumoMensagens => ({
  dono: true, agente_ping: iso(20), pendentes: 0, enviadas_30d: 0, falhas: 0, falhas_desde: iso(7 * 86400), falhas_vistas_em: null,
  serie_enviadas: Array(14).fill(0), ultimo_teste: null, alcance: { alunos: 3, com_telefone: 2, ligadas: 1 }, ...o,
});
const msg = (o: Partial<ItemFila> = {}): ItemFila => ({
  id: "m1", tipo: "lembrete_consulta", status: "enviada", destino: "+5500900000001", texto: "Oi, Ana! Sua consulta é hoje às 14:30.", erro: null,
  criado_em: iso(3600), atualizado_em: iso(3500), agendada_para: iso(3600), enviada_em: iso(3500), aluno: { id: "a1", nome: "Ana Lima", rota: "t-ana" },
  autor: { id: "u-rafael", nome: "Rafael Lima" }, minha: true, pode_reenviar: false, ...o,
});
const COM_NUMERO = { nome: "Rafael Lima", dados_profissionais: { whatsapp_e164: "+5500900000009" }, config: { tema: "escuro" } };

function montar(el: ReactNode = <Mensagens />) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter useTransitions={false}>{el}</MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  for (const [k, f] of Object.entries(h)) if (typeof f === "function" && "mockReset" in f) (f as ReturnType<typeof vi.fn>).mockReset();
  h.conta = { id: "c1", nome: "Rafael Lima", papeis: ["dono", "personal"], profissionais: 1 };
  h.dono = true;
  h.buscarResumo.mockResolvedValue(resumo());
  h.listarFila.mockResolvedValue({ escopo: "meus", filtro: "todas", itens: [], mais: false });
  h.lerPerfilWhatsapp.mockResolvedValue(COM_NUMERO);
  h.statusConexao.mockResolvedValue(inst({ numero_e164: "+5500900000009" }));
});

describe("W22 — Painel › Mensagens: conexão", () => {
  it("o personal vê a tela inteira e pede a conexão: o QR que o agente publica aparece", async () => {
    montar();
    await waitFor(() => expect(document.querySelector("[data-card-conexao]")?.getAttribute("data-whatsapp-situacao")).toBe("desconectado"));
    expect(document.querySelector("[data-numero-whatsapp]")?.textContent).toContain("+55 (00) 90000-0009");
    expect(document.querySelectorAll("[data-disparo]").length).toBe(7); // os 6 momentos + o aviso do plano
    expect(document.querySelector("[data-card-historico]")).not.toBeNull();
    expect(document.querySelector("[data-kpis-mensagens]")).not.toBeNull();
    // tudo nasce desligado e sem conexão não dá para ligar
    expect(screen.getByRole("switch", { name: "Mensagens automáticas ligadas" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Ligar: Aniversário do aluno" })).toHaveAttribute("aria-checked", "false");

    h.pedirConexao.mockResolvedValue(inst({ status: "aguardando_qr", numero_e164: "+5500900000009" }));
    h.statusConexao.mockResolvedValue(inst({ status: "aguardando_qr", numero_e164: "+5500900000009", qr_code: "data:image/png;base64,QUFB", qr_atualizado_em: new Date().toISOString() }));
    fireEvent.click(within(document.querySelector("[data-card-conexao]") as HTMLElement).getByRole("button", { name: /Conectar WhatsApp/ }));
    await waitFor(() => expect(document.querySelector("[data-aguardando-qr]")).not.toBeNull());
    expect(h.pedirConexao).toHaveBeenCalledTimes(1);
    // o polling (3 s) traz o QR publicado
    await waitFor(() => expect(document.querySelector("[data-qr-code] img")?.getAttribute("src")).toBe("data:image/png;base64,QUFB"), { timeout: 6000 });
    expect(document.querySelector("[data-card-conexao] [data-btn-conectar]")?.getAttribute("data-btn-acao")).toBe("Cancelar");
  }, 15000);

  it("sem número em Configurações: o topo manda cadastrar e o passo 1 fica pendente", async () => {
    h.lerPerfilWhatsapp.mockResolvedValue({ nome: "Rafael", dados_profissionais: {}, config: {} });
    h.statusConexao.mockResolvedValue(inst());
    montar();
    await waitFor(() => expect(document.querySelector("[data-btn-cadastrar-numero]")).not.toBeNull());
    expect(document.querySelector("[data-btn-cadastrar-numero]")?.getAttribute("href")).toBe("/painel/configuracoes/perfil");
    expect(document.querySelector('[data-passo="1"]')?.getAttribute("data-passo-estado")).toBe("pendente");
    expect(document.querySelector('[data-passo="2"]')?.getAttribute("data-passo-estado")).toBe("em_breve");
    expect(document.querySelector("[data-card-conexao] [data-btn-conectar]")).toBeDisabled();
  });

  it("conectado: envia o teste, liga 1 automática e salva só o whatsapp (com o horário)", async () => {
    h.statusConexao.mockResolvedValue(inst({ status: "conectado", numero_e164: "+5500900000009", numero_conectado: "+5500900000009" }));
    h.enviarTeste.mockResolvedValue({ repetida: false });
    h.salvarConfig.mockImplementation(async (c) => c);
    montar();
    await waitFor(() => expect(document.querySelector("[data-card-conexao]")?.getAttribute("data-whatsapp-situacao")).toBe("conectado"));
    expect(document.querySelector("[data-texto-situacao]")?.textContent).toContain("Conectado com o número");
    fireEvent.click(document.querySelector("[data-btn-teste]")!);
    await waitFor(() => expect(h.enviarTeste).toHaveBeenCalledTimes(1));

    const salvar = document.querySelector("[data-btn-salvar-disparos]") as HTMLButtonElement;
    expect(salvar).toBeDisabled();
    fireEvent.click(screen.getByRole("switch", { name: "Mensagens automáticas ligadas" }));
    fireEvent.click(screen.getByRole("switch", { name: "Ligar: Lembrete de consulta — véspera" }));
    fireEvent.change(document.querySelector("[data-select-horario]")!, { target: { value: "08:00" } });
    expect(salvar).not.toBeDisabled();
    fireEvent.click(salvar);
    await waitFor(() => expect(h.salvarConfig).toHaveBeenCalledTimes(1));
    expect(h.salvarConfig.mock.calls[0][0]).toMatchObject({ ativo: true, horario: "08:00", momentos: { lembrete_vespera: true } });
  });

  it("o texto de um momento: padrão do banco, variável inventada vira erro e a prévia troca as variáveis", async () => {
    h.statusConexao.mockResolvedValue(inst({ status: "conectado", numero_e164: "+5500900000009" }));
    montar();
    await waitFor(() => expect(document.querySelector('[data-btn-texto="aniversario"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-btn-texto="aniversario"]')!);
    const area = (await waitFor(() => document.querySelector('[data-textarea="aniversario"]'))) as HTMLTextAreaElement;
    expect(area.value).toContain("Feliz aniversário");
    expect(document.querySelector("[data-previa]")?.textContent).toContain("Oi, Ana!");
    fireEvent.change(area, { target: { value: "Oi {cliente}" } });
    expect(document.querySelector("[data-erro-texto]")?.textContent).toContain("{cliente}");
  });
});

describe("W22 — Painel › Mensagens: o celular de envio fora do ar (pelo ultimo_ping)", () => {
  it("sem batida há mais de 3 min, a faixa âmbar aparece", async () => {
    h.buscarResumo.mockResolvedValue(resumo({ agente_ping: iso(15 * 60) }));
    montar();
    await waitFor(() => expect(document.querySelector('[data-aviso-agente="fora"]')).not.toBeNull());
    expect(document.querySelector("[data-aviso-agente]")?.getAttribute("data-aviso-agente-minutos")).toBe("15");
    expect(document.querySelector("[data-aviso-agente]")?.textContent).toContain("fora do ar há 15 min");
  });
  it("com batida recente, nada aparece", async () => {
    montar();
    await waitFor(() => expect(document.querySelector("[data-kpis-mensagens]")?.getAttribute("data-estado")).toBeNull());
    expect(document.querySelector("[data-aviso-agente]")).toBeNull();
  });
  it("sem nenhuma batida registrada ainda, não acusa nada", async () => {
    h.buscarResumo.mockResolvedValue(resumo({ agente_ping: null }));
    montar();
    await waitFor(() => expect(document.querySelector("[data-kpis-mensagens]")?.getAttribute("data-estado")).toBeNull());
    expect(document.querySelector("[data-aviso-agente]")).toBeNull();
  });
});

describe("W22 — Painel › Mensagens: histórico da fila e o número do menu", () => {
  it("lista a fila (na fila · enviada · falhou), reenvia a própria falha e limpa as falhas", async () => {
    h.statusConexao.mockResolvedValue(inst({ status: "conectado", numero_e164: "+5500900000009" }));
    h.buscarResumo.mockResolvedValue(resumo({ falhas: 1, pendentes: 1, enviadas_30d: 1 }));
    h.listarFila.mockResolvedValue({
      escopo: "meus", filtro: "todas", mais: false,
      itens: [
        msg({ id: "m3", status: "falhou", erro: "esse número não tem WhatsApp", pode_reenviar: true, tipo: "aniversario" }),
        msg({ id: "m2", status: "pendente", enviada_em: null }),
        msg({ id: "m1" }),
      ],
    });
    h.reenviar.mockResolvedValue(undefined);
    h.limparFalhas.mockResolvedValue(undefined);
    montar();
    await waitFor(() => expect(document.querySelectorAll("[data-mensagem]").length).toBe(3));
    expect([...document.querySelectorAll("[data-status-msg]")].map((e) => e.textContent)).toEqual(["FALHOU", "NA FILA", "ENVIADA"]);
    expect(document.querySelector('[data-mensagem="m3"] [data-mensagem-erro]')?.textContent).toContain("não tem WhatsApp");
    expect(document.querySelector("[data-kpis-mensagens]")?.getAttribute("data-falhas")).toBe("1");
    fireEvent.click(document.querySelector('[data-btn-reenviar="m3"]')!);
    await waitFor(() => expect(h.reenviar).toHaveBeenCalledWith("m3"));
    fireEvent.click(document.querySelector("[data-btn-limpar-falhas]")!);
    await waitFor(() => expect(h.limparFalhas).toHaveBeenCalledTimes(1));
  });

  it("o dono escolhe entre a fila dele e a da equipe; o membro só vê a dele (P1)", async () => {
    montar();
    await waitFor(() => expect(h.listarFila).toHaveBeenCalled());
    expect(screen.getByRole("radiogroup", { name: "De quem" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Toda a equipe" }));
    await waitFor(() => expect(h.listarFila.mock.calls.some((c) => c[0].escopo === "conta")).toBe(true));
  });

  it("membro sem ser dono: sem o seletor e sempre a própria fila", async () => {
    h.dono = false;
    h.conta = { id: "c1", nome: "Consultoria Ferreira", papeis: ["personal"], profissionais: 3 };
    montar();
    await waitFor(() => expect(h.listarFila).toHaveBeenCalled());
    expect(screen.queryByRole("radiogroup", { name: "De quem" })).toBeNull();
    expect(h.listarFila.mock.calls.every((c) => c[0].escopo === "meus")).toBe(true);
  });

  it("o número do menu = as falhas novas do resumo", async () => {
    h.buscarResumo.mockResolvedValue(resumo({ falhas: 3 }));
    function Contador() {
      const n = useContadorMensagens();
      return <span data-n={String(n)} />;
    }
    montar(<Contador />);
    await waitFor(() => expect(document.querySelector("[data-n]")?.getAttribute("data-n")).toBe("3"));
  });
});
