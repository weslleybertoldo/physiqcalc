import { describe, expect, it } from "vitest";
import { filtrosDaBusca, padraoSemAcento, semAcento, valorDoFiltro } from "../../supabase/functions/admin-list-users/busca";
import { fatiar as fatiarRelatorio, ordemDoHistorico, ordemDoMes, paginaPedida as paginaRelatorio } from "../../supabase/functions/admin-relatorio/regras";
import { fatiar, filtrarPorNome, listaQuemRecebe, paginaPedida, POR_PAGINA } from "../../supabase/functions/admin-semana-treinos/regras";

// hml-14d (B19/B21 · D22b, D25, D26) — as regras puras das 3 funções do Treino que ganharam página e busca: a busca sem acento do
// admin-list-users (o padrão que vai no imatch), a lista do "Quem recebe" e a página do modelos (admin-semana-treinos) e a ordem
// estável do histórico (admin-relatorio). A prova no Postgres de verdade (o ~* com o padrão) está no PGlite do agente A
// (hml/hml14d/A/testar_migration_pglite.mjs); a do filtro or() no PostgREST falso, no deno test (hml/hml14d/deno/A_test.ts).

describe("admin-list-users — padraoSemAcento (D22b: 'jose' acha 'José' sem coluna nova)", () => {
  it("cada vogal, c, n e y vira a classe com as variantes (minúsculas e maiúsculas); o resto fica", () => {
    expect(padraoSemAcento("jose")).toBe("j[oóòôõöOÓÒÔÕÖ]s[eéèêëEÉÈÊË]");
    expect(padraoSemAcento("José")).toBe(padraoSemAcento("jose"));
    expect(padraoSemAcento("JOSÉ")).toBe(padraoSemAcento("jose"));
    expect(padraoSemAcento("Conceição")).toBe("[cçCÇ][oóòôõöOÓÒÔÕÖ][nñNÑ][cçCÇ][eéèêëEÉÈÊË][iíìîïIÍÌÎÏ][cçCÇ][aáàâãäåAÁÀÂÃÄÅ][oóòôõöOÓÒÔÕÖ]");
    expect(padraoSemAcento("tb 12")).toBe("tb 12");
  });

  it("a pontuação vai escapada (nada vira operador da expressão); espaços juntos; vazio = vazio", () => {
    expect(padraoSemAcento("(a.)")).toBe("\\([aáàâãäåAÁÀÂÃÄÅ]\\.\\)");
    expect(padraoSemAcento("r*l")).toBe("r\\*l");
    expect(padraoSemAcento("100%")).toBe("100\\%");
    expect(padraoSemAcento("a_b|c$")).toBe("[aáàâãäåAÁÀÂÃÄÅ]\\_b\\|[cçCÇ]\\$");
    expect(padraoSemAcento("x\\z")).toBe("x\\\\z");
    expect(padraoSemAcento("  ze   ultimo ")).toBe("z[eéèêëEÉÈÊË] [uúùûüUÚÙÛÜ]lt[iíìîïIÍÌÎÏ]m[oóòôõöOÓÒÔÕÖ]");
    expect(padraoSemAcento("")).toBe("");
    expect(padraoSemAcento("   ")).toBe("");
    expect(semAcento("Ñandu  Çá")).toBe("nandu ca");
  });

  it("o padrão casa no RegExp (o ~* do Postgres faz o mesmo — provado no PGlite)", () => {
    const acha = (termo: string, texto: string) => new RegExp(padraoSemAcento(termo), "i").test(texto);
    expect(acha("jose", "José da Silva")).toBe(true);
    expect(acha("josé", "JOSE")).toBe(true);
    expect(acha("ra.ael", "Rafael")).toBe(false);
    expect(acha("(a.)", "Ana (A.) Souza")).toBe(true);
  });

  it("valorDoFiltro: entre aspas, com \\ e \" escapados (vírgula, ponto e parênteses ficam literais no or())", () => {
    expect(valorDoFiltro("a,b.(c)")).toBe('"a,b.(c)"');
    expect(valorDoFiltro('x"y')).toBe('"x\\"y"');
    expect(valorDoFiltro("\\.")).toBe('"\\\\."');
  });

  it("filtrosDaBusca: nome e e-mail por imatch; só dígitos (até 15) também o user_code; vazio = sem filtro", () => {
    const v = valorDoFiltro(padraoSemAcento("jose"));
    expect(filtrosDaBusca("jose")).toEqual([`nome.imatch.${v}`, `email.imatch.${v}`]);
    expect(filtrosDaBusca(" 4242 ")).toContain("user_code.eq.4242");
    expect(filtrosDaBusca("1234567890123456").some((p) => p.startsWith("user_code"))).toBe(false);
    expect(filtrosDaBusca("")).toEqual([]);
    expect(filtrosDaBusca("́")).toEqual([]);
  });
});

describe("admin-semana-treinos — página e Quem recebe (D25, P5)", () => {
  it("paginaPedida: sem pagina = null (o caminho de hoje); com pagina = inteiro ≥ 1", () => {
    expect(paginaPedida(undefined)).toBeNull();
    expect(paginaPedida(null)).toBeNull();
    expect(paginaPedida(3)).toBe(3);
    expect(paginaPedida("2")).toBe(2);
    expect(paginaPedida(2.7)).toBe(2);
    expect(paginaPedida(0)).toBe(1);
    expect(paginaPedida(-4)).toBe(1);
    expect(paginaPedida("abc")).toBe(1);
    expect(paginaRelatorio(undefined)).toBeNull();
    expect(paginaRelatorio(5)).toBe(5);
  });

  it("fatiar: 20 por página e o total; além do fim = vazia com o total", () => {
    const l = Array.from({ length: 41 }, (_, i) => i);
    expect(POR_PAGINA).toBe(20);
    expect(fatiar(l, 1)).toEqual({ itens: l.slice(0, 20), total: 41 });
    expect(fatiar(l, 3)).toEqual({ itens: [40], total: 41 });
    expect(fatiar(l, 4)).toEqual({ itens: [], total: 41 });
    expect(fatiarRelatorio(l, 2).itens).toEqual(l.slice(20, 40));
  });

  it("filtrarPorNome (a folha Modelos): sem caixa e sem acento; termo vazio = todos, na ordem que vieram", () => {
    const m = [{ nome: "Peito e Tríceps" }, { nome: "Costas" }, { nome: "TRÍCEPS forte" }, { nome: null }];
    expect(filtrarPorNome(m, "triceps").map((x) => x.nome)).toEqual(["Peito e Tríceps", "TRÍCEPS forte"]);
    expect(filtrarPorNome(m, "  ")).toHaveLength(4);
    expect(filtrarPorNome(m, "%")).toEqual([]);
  });

  it("listaQuemRecebe com 41 alunos: quem recebe primeiro, depois o nome (pt-BR) e o id; 3 páginas; N DE M sem a busca", () => {
    const nomes = Array.from({ length: 41 }, (_, i) => `Aluno ${String(i).padStart(2, "0")}`);
    nomes[7] = "Álvaro"; // acento no começo: pt-BR põe junto do A
    const perfis = nomes.map((nome, i) => ({ id: `id-${String(i).padStart(2, "0")}`, nome, email: `a${i}@x.com`, foto_url: null }));
    const recebem = new Set(["id-30", "id-05", "id-07"]);
    const p1 = listaQuemRecebe(perfis, recebem, "", 1);
    expect([p1.itens.length, p1.total, p1.total_recebem, p1.total_alunos]).toEqual([20, 41, 3, 41]);
    expect(p1.itens.slice(0, 3).map((a) => [a.nome, a.recebe])).toEqual([["Aluno 05", true], ["Aluno 30", true], ["Álvaro", true]]);
    expect(p1.itens[3]).toMatchObject({ nome: "Aluno 00", recebe: false });
    const todos = [1, 2, 3].flatMap((p) => listaQuemRecebe(perfis, recebem, "", p).itens.map((a) => a.id));
    expect(new Set(todos).size).toBe(41);
    expect(listaQuemRecebe(perfis, recebem, "", 3).itens).toHaveLength(1);
  });

  it("listaQuemRecebe: busca sem acento no nome e no e-mail; o nome de antes (nome, senão e-mail, senão 'Aluno'); sem repetir", () => {
    const perfis = [
      { id: "1", nome: "José da Silva", email: "jose@x.com" },
      { id: "2", nome: null, email: "maria@x.com" },
      { id: "3", nome: "  ", email: null },
      { id: "1", nome: "José da Silva", email: "jose@x.com" },
    ];
    const r = listaQuemRecebe(perfis, new Set(["2"]), "JOSE", 1);
    expect(r.itens.map((a) => a.nome)).toEqual(["José da Silva"]);
    expect([r.total, r.total_recebem, r.total_alunos]).toEqual([1, 1, 3]);
    const tudo = listaQuemRecebe(perfis, new Set(["2"]), "", 1).itens;
    expect(tudo.map((a) => [a.nome, a.email, a.recebe, a.foto_url])).toEqual([
      ["maria@x.com", "maria@x.com", true, null],
      ["Aluno", "", false, null],
      ["José da Silva", "jose@x.com", false, null],
    ]);
    expect(listaQuemRecebe(perfis, new Set(), "maria@", 1).itens.map((a) => a.id)).toEqual(["2"]);
  });
});

describe("admin-relatorio — a ordem estável das páginas (D26)", () => {
  it("ordemDoMes: o dia mais novo primeiro, depois a pessoa, depois a chave (o empate não troca entre pedidos)", () => {
    const itens = [
      { data: "2026-09-02", pessoa: "Bia", chave: "h:2" },
      { data: "2026-09-03", pessoa: "Ana", chave: "h:9" },
      { data: "2026-09-02", pessoa: "Ana", chave: "h:5" },
      { data: "2026-09-02", pessoa: "Ana", chave: "c:x:2026-09-02:0" },
    ];
    expect([...itens].sort(ordemDoMes).map((i) => i.chave)).toEqual(["h:9", "c:x:2026-09-02:0", "h:5", "h:2"]);
    expect([...itens].reverse().sort(ordemDoMes).map((i) => i.chave)).toEqual(["h:9", "c:x:2026-09-02:0", "h:5", "h:2"]);
  });

  it("ordemDoHistorico: o mais novo primeiro pelo início; empate pelo id", () => {
    const h = [
      { id: "b", iniciado_em: "2026-09-01T10:00:00Z" },
      { id: "a", iniciado_em: "2026-09-01T10:00:00Z" },
      { id: "c", iniciado_em: "2026-09-05T10:00:00Z" },
      { id: "sintetico:2026-08-01#0", iniciado_em: "2026-08-01" },
    ];
    expect([...h].sort(ordemDoHistorico).map((x) => x.id)).toEqual(["c", "a", "b", "sintetico:2026-08-01#0"]);
  });
});
