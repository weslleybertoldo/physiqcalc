import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { chaveResponsavel, type ResponsavelAluno } from "./regras";

// hml-12 (H-30, §4.3 T9) — a seção "Consentimento do responsável" da ficha do aluno: o aviso dos 16–17 sem registro, a folha de
// registrar (nome, vínculo, como foi dado e a caixa), o registro com "Retirar", o menor de 16, o adulto e quem só lê.
const h = vi.hoisted(() => ({ buscar: vi.fn(), registrar: vi.fn(), retirar: vi.fn() }));
vi.mock("./api", () => ({
  ErroResponsavel: class ErroResponsavel extends Error {
    constructor(public codigo: string) {
      super(codigo);
    }
  },
  buscarResponsavel: h.buscar,
  registrarResponsavel: h.registrar,
  retirarResponsavel: h.retirar,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ErroResponsavel } from "./api";
import SecaoResponsavel from "./SecaoResponsavel";

const resposta = (o: Partial<ResponsavelAluno> = {}): ResponsavelAluno => ({ ligado: true, faixa: "16_17", pode_editar: true, atual: null, ...o });
const REGISTRO = { nome: "Maria Souza", vinculo: "mae", forma: "presencial", em: "2026-10-08T15:30:00Z", por: "Lucas Ferreira" };
const NASCIMENTO = "2009-06-01";

function montar(nascimento: string | null = NASCIMENTO) {
  // a seção tem a própria regra de repetir (1 vez, menos nas recusas que não mudam): sem a espera de 1 s entre as tentativas
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  const r = render(
    <QueryClientProvider client={qc}>
      <SecaoResponsavel alunoId="p1" nascimento={nascimento} />
    </QueryClientProvider>,
  );
  /** espera a consulta da seção terminar (para conferir o que NÃO aparece) */
  const lida = () => waitFor(() => expect(qc.getQueryState(chaveResponsavel("p1", nascimento))?.status).not.toBe("pending"));
  return { ...r, qc, lida };
}

const secao = (faixa: string) =>
  waitFor(() => {
    const el = document.querySelector<HTMLElement>(`[data-secao-responsavel="${faixa}"]`);
    if (!el) throw new Error(`a seção ${faixa} ainda não apareceu`);
    return el;
  });
const marca = (m: string) => document.querySelector<HTMLElement>(`[${m}]`);

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
});

describe("16 ou 17 anos sem o registro", () => {
  it("o aviso âmbar e 'Registrar consentimento' (a seção lê pelo id da rota)", async () => {
    h.buscar.mockResolvedValue(resposta());
    montar();
    const el = await secao("16_17");
    expect(h.buscar).toHaveBeenCalledWith("p1");
    expect(el.textContent).toContain("Aluno de 16 ou 17 anos: falta o consentimento do responsável. Sem ele, o app do aluno fica fechado.");
    expect(screen.getByRole("button", { name: /Registrar consentimento/ })).toHaveAttribute("data-responsavel-registrar");
    expect(marca("data-responsavel-registrado")).toBeNull();
  });

  it("registrar: a folha pede o nome, o vínculo, como foi dado e a caixa; o banco recebe e a seção mostra o registro", async () => {
    h.buscar.mockResolvedValue(resposta());
    h.registrar.mockResolvedValue(resposta({ atual: REGISTRO }));
    montar();
    await secao("16_17");
    fireEvent.click(marca("data-responsavel-registrar")!);
    await waitFor(() => expect(marca('data-sheet-responsavel="registrar"')).not.toBeNull());
    expect(screen.getByText("Conferi a idade do aluno, e um dos pais ou o responsável legal consentiu com o acompanhamento no Physiq e com o uso dos dados de saúde dele. Guardo a prova comigo.")).toBeInTheDocument();

    // sem nada preenchido: a frase do 1º problema e nada vai ao banco
    fireEvent.click(marca("data-responsavel-salvar")!);
    expect(await screen.findByText("Escreva o nome do responsável.")).toBeInTheDocument();
    fireEvent.change(marca("data-responsavel-nome")!, { target: { value: "  Maria   Souza " } });
    fireEvent.click(marca('data-responsavel-vinculo="mae"')!);
    expect(marca('data-responsavel-vinculo="mae"')).toHaveAttribute("aria-checked", "true");
    fireEvent.click(marca('data-responsavel-forma="presencial"')!);
    fireEvent.click(marca("data-responsavel-salvar")!);
    expect(await screen.findByText("Marque a confirmação para registrar.")).toBeInTheDocument();
    expect(h.registrar).not.toHaveBeenCalled();

    fireEvent.click(marca("data-responsavel-confirmo")!);
    fireEvent.click(marca("data-responsavel-salvar")!);
    await waitFor(() => expect(h.registrar).toHaveBeenCalledWith("p1", { nome: "  Maria   Souza ", vinculo: "mae", forma: "presencial", confirmo: true }));
    await waitFor(() => expect(marca("data-responsavel-registrado")).not.toBeNull());
    expect(marca("data-responsavel-registrado")!.textContent).toBe(
      "Consentimento do responsável: Maria Souza (mãe) · pessoalmente · 08/10/2026 · registrado por Lucas Ferreira",
    );
    expect(marca("data-responsavel-falta")).toBeNull();
    await waitFor(() => expect(marca("data-sheet-responsavel")).toBeNull());
  });

  it("a recusa do banco vira a frase (e a folha fica aberta)", async () => {
    h.buscar.mockResolvedValue(resposta());
    h.registrar.mockRejectedValue(new ErroResponsavel("nao_e_16_17"));
    montar();
    await secao("16_17");
    fireEvent.click(marca("data-responsavel-registrar")!);
    await waitFor(() => expect(marca("data-responsavel-nome")).not.toBeNull());
    fireEvent.change(marca("data-responsavel-nome")!, { target: { value: "José Lima" } });
    fireEvent.click(marca('data-responsavel-vinculo="responsavel_legal"')!);
    fireEvent.click(marca('data-responsavel-forma="documento_assinado"')!);
    fireEvent.click(marca("data-responsavel-confirmo")!);
    fireEvent.click(marca("data-responsavel-salvar")!);
    expect(await screen.findByText("O registro do responsável é só para alunos de 16 ou 17 anos. Confira a data de nascimento.")).toBeInTheDocument();
    expect(marca('data-sheet-responsavel="registrar"')).not.toBeNull();
    expect(marca("data-responsavel-registrado")).toBeNull();
  });
});

describe("16 ou 17 anos com o registro", () => {
  it("quem, o vínculo, como foi dado, a data e quem registrou; Retirar confirma e a seção volta ao aviso", async () => {
    h.buscar.mockResolvedValue(resposta({ atual: REGISTRO }));
    h.retirar.mockResolvedValue(resposta());
    montar();
    await secao("16_17");
    expect(marca("data-responsavel-registrado")!.textContent).toBe(
      "Consentimento do responsável: Maria Souza (mãe) · pessoalmente · 08/10/2026 · registrado por Lucas Ferreira",
    );
    expect(marca("data-responsavel-registrar")).toBeNull();
    fireEvent.click(marca("data-responsavel-retirar")!);
    await waitFor(() => expect(marca('data-sheet-responsavel="retirar"')).not.toBeNull());
    expect(screen.getByText("O app do aluno fecha até um novo registro.")).toBeInTheDocument();
    expect(h.retirar).not.toHaveBeenCalled();
    fireEvent.click(marca("data-responsavel-retirar-confirmar")!);
    await waitFor(() => expect(h.retirar).toHaveBeenCalledWith("p1"));
    await waitFor(() => expect(marca("data-responsavel-falta")).not.toBeNull());
    expect(marca("data-responsavel-registrado")).toBeNull();
  });
});

describe("quem só lê (sem pode_editar)", () => {
  it("o aviso e o registro aparecem, sem Registrar nem Retirar", async () => {
    h.buscar.mockResolvedValue(resposta({ pode_editar: false }));
    const r = montar();
    await secao("16_17");
    expect(marca("data-responsavel-falta")).not.toBeNull();
    expect(marca("data-responsavel-registrar")).toBeNull();
    r.unmount();
    h.buscar.mockResolvedValue(resposta({ pode_editar: false, atual: REGISTRO }));
    montar();
    await secao("16_17");
    expect(marca("data-responsavel-registrado")).not.toBeNull();
    expect(marca("data-responsavel-retirar")).toBeNull();
  });
});

describe("as outras faixas", () => {
  it("menor de 16: o aviso (o app do aluno fica fechado), sem nada para registrar; 'corrija em Editar' só para quem edita", async () => {
    h.buscar.mockResolvedValue(resposta({ faixa: "menor_16" }));
    const r = montar("2012-01-01");
    const el = await secao("menor_16");
    expect(el.textContent).toBe(
      "Pela data de nascimento, o aluno tem menos de 16 anos. O Physiq é para quem tem 16 anos ou mais: o app do aluno fica fechado. Se a data estiver errada, corrija em Editar.",
    );
    expect(marca("data-responsavel-registrar")).toBeNull();
    r.unmount();
    h.buscar.mockResolvedValue(resposta({ faixa: "menor_16", pode_editar: false }));
    montar("2012-01-01");
    expect((await secao("menor_16")).textContent).not.toContain("Editar");
  });

  it("adulto: nada na tela (só a marca escondida, para o E2E saber que a seção leu a faixa)", async () => {
    h.buscar.mockResolvedValue(resposta({ faixa: "adulto", atual: REGISTRO }));
    montar("1998-03-10");
    const el = await secao("adulto");
    expect(el).not.toBeVisible();
    expect(el.textContent).toBe("");
    expect(marca("data-responsavel-registrado")).toBeNull();
  });

  it("sem data de nascimento, com a versão dos textos desligada no banco ou sem acesso: nada", async () => {
    h.buscar.mockResolvedValue(resposta({ faixa: null }));
    const a = montar(null);
    await a.lida();
    expect(a.container.innerHTML).toBe("");
    a.unmount();
    h.buscar.mockResolvedValue(resposta({ ligado: false, faixa: "16_17" }));
    const b = montar();
    await b.lida();
    expect(b.container.innerHTML).toBe("");
    b.unmount();
    h.buscar.mockRejectedValue(new ErroResponsavel("sem_acesso"));
    const c = montar();
    await c.lida();
    expect(c.container.innerHTML).toBe("");
  });

  it("a leitura falhou (rede, erro do banco): a linha do erro com 'Tentar de novo', que lê de novo — a seção não some calada", async () => {
    h.buscar.mockRejectedValue(new ErroResponsavel("erro_interno"));
    montar();
    await waitFor(() => expect(marca("data-responsavel-erro-carregar")).not.toBeNull());
    expect(marca("data-responsavel-erro-carregar")!.textContent).toContain("Não deu para carregar o consentimento do responsável.");
    expect(marca("data-secao-responsavel")).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeEnabled());
    const antes = h.buscar.mock.calls.length;
    expect(antes).toBe(2); // a 1ª e a repetição automática

    h.buscar.mockResolvedValue(resposta());
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await secao("16_17");
    expect(h.buscar).toHaveBeenCalledTimes(antes + 1);
    expect(marca("data-responsavel-erro-carregar")).toBeNull();
    expect(marca("data-responsavel-falta")).not.toBeNull();
  });

  it("a leitura falhou sem data de nascimento (não há o que mostrar) ou sem acesso: nada, nem a linha do erro", async () => {
    h.buscar.mockRejectedValue(new ErroResponsavel("erro_interno"));
    const a = montar(null);
    await a.lida();
    expect(a.container.innerHTML).toBe("");
    a.unmount();
    h.buscar.mockRejectedValue(new ErroResponsavel("aluno_inexistente"));
    const b = montar();
    await b.lida();
    expect(b.container.innerHTML).toBe("");
  });

  it("a data de nascimento muda (o 'Editar dados') → a faixa é lida de novo", async () => {
    h.buscar.mockResolvedValueOnce(resposta({ faixa: "adulto" })).mockResolvedValueOnce(resposta());
    const { qc, rerender } = montar("1998-03-10");
    await secao("adulto");
    rerender(
      <QueryClientProvider client={qc}>
        <SecaoResponsavel alunoId="p1" nascimento={NASCIMENTO} />
      </QueryClientProvider>,
    );
    await secao("16_17");
    expect(h.buscar).toHaveBeenCalledTimes(2);
  });
});
