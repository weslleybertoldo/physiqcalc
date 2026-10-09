import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, useLocation, useSearchParams } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { usePaginaNaUrl } from "./usePaginaNaUrl";

type Opcoes = Parameters<typeof usePaginaNaUrl>[0];

const h: { pagina: number; irPara: (n: number) => void; busca: string } = { pagina: 0, irPara: () => {}, busca: "" };

function Sonda({ opcoes }: { opcoes?: Opcoes }) {
  const r = usePaginaNaUrl(opcoes);
  h.pagina = r.pagina;
  h.irPara = r.irPara;
  h.busca = useLocation().search;
  return null;
}

const montar = (endereco: string, opcoes?: Opcoes) => {
  const tela = (o?: Opcoes) => (
    <MemoryRouter initialEntries={[endereco]}>
      <Sonda opcoes={o} />
    </MemoryRouter>
  );
  const r = render(tela(opcoes));
  return { trocar: (o?: Opcoes) => r.rerender(tela(o)) };
};

describe("usePaginaNaUrl (hml-14b, D13)", () => {
  it("lê ?pagina=N e grava sem perder os outros parâmetros; a 1ª página não fica no endereço", () => {
    montar("/painel/financeiro?aba=lancamentos&pagina=3");
    expect(h.pagina).toBe(3);
    act(() => h.irPara(2));
    expect(h.pagina).toBe(2);
    expect(h.busca).toBe("?aba=lancamentos&pagina=2");
    act(() => h.irPara(1));
    expect(h.busca).toBe("?aba=lancamentos");
  });

  it("endereço sem página ou com lixo = página 1", () => {
    montar("/x?pagina=abc");
    expect(h.pagina).toBe(1);
    montar("/x?pagina=-4");
    expect(h.pagina).toBe(1);
  });

  it("chave própria quando a tela tem 2 listas", () => {
    montar("/x?pagina=2&pagina_recibos=4", { chave: "pagina_recibos" });
    expect(h.pagina).toBe(4);
    act(() => h.irPara(5));
    expect(h.busca).toBe("?pagina=2&pagina_recibos=5");
  });

  it("o filtro mudou: volta à 1 no mesmo render; na 1ª montagem o ?pagina= do endereço vale", () => {
    const { trocar } = montar("/x?pagina=3", { filtro: { q: "" } });
    expect(h.pagina).toBe(3);
    trocar({ filtro: { q: "zé" } });
    expect(h.pagina).toBe(1);
    expect(h.busca).toBe("");
    act(() => h.irPara(2));
    trocar({ filtro: { q: "zé" } });
    expect(h.pagina).toBe(2);
  });

  it("página além do total vai para a última", () => {
    const { trocar } = montar("/x?pagina=9");
    expect(h.pagina).toBe(9);
    trocar({ total: 41 });
    expect(h.pagina).toBe(3);
    expect(h.busca).toBe("?pagina=3");
  });

  it("total ainda desconhecido não mexe na página", () => {
    montar("/x?pagina=9", { total: null });
    expect(h.pagina).toBe(9);
  });

  // a tela grava o filtro no endereço num efeito do MESMO commit em que a página volta à 1: as 2 escritas partem do endereço do
  // render anterior e a última vence — nos 2 sentidos o endereço tem que terminar com o filtro novo e sem a página velha
  it.each([
    ["a tela grava antes", true],
    ["a tela grava depois", false],
  ])("filtro gravado pela tela no mesmo commit (%s): termina com o filtro novo e sem a página velha", (_nome, telaAntes) => {
    function GravaFiltro({ q }: { q: string }) {
      const [sp, setSp] = useSearchParams();
      useEffect(() => {
        if (sp.get("q") === q) return;
        setSp((atual) => {
          const n = new URLSearchParams(atual);
          n.set("q", q);
          return n;
        }, { replace: true });
      }, [q, sp, setSp]);
      return null;
    }
    function Tela({ q }: { q: string }) {
      return (
        <>
          {telaAntes && <GravaFiltro q={q} />}
          <Sonda opcoes={{ filtro: { q } }} />
          {!telaAntes && <GravaFiltro q={q} />}
        </>
      );
    }
    const tela = (q: string) => (
      <MemoryRouter initialEntries={["/x?q=a&pagina=3"]}>
        <Tela q={q} />
      </MemoryRouter>
    );
    const r = render(tela("a"));
    expect(h.pagina).toBe(3);
    r.rerender(tela("b"));
    expect(h.pagina).toBe(1);
    expect(h.busca).toBe("?q=b");
  });
});
