import { describe, expect, it } from "vitest";
import { lerMarkdown, lerTrechos, semQuebra, slug } from "./markdown";

// hml-11 (H-28, D3) — o leitor do Markdown dos textos legais: o teste do Nativo OS adaptado, mais os subitens dos rascunhos.

describe("lerTrechos", () => {
  it("separa negrito e link do texto comum", () => {
    expect(lerTrechos("a **b** c [d](/e) f")).toEqual([
      { texto: "a " },
      { texto: "b", negrito: true },
      { texto: " c " },
      { texto: "d", link: "/e" },
      { texto: " f" },
    ]);
  });

  it("negrito sem fechar fica como texto", () => {
    expect(lerTrechos("só **metade")).toEqual([{ texto: "só **metade" }]);
  });

  it("linha sem marcação vira um trecho só; mailto: e âncora entram no link", () => {
    expect(lerTrechos("texto puro")).toEqual([{ texto: "texto puro" }]);
    expect(lerTrechos("[a@b.com](mailto:a@b.com) e [Anexo](/termos#anexo)")).toEqual([
      { texto: "a@b.com", link: "mailto:a@b.com" },
      { texto: " e " },
      { texto: "Anexo", link: "/termos#anexo" },
    ]);
  });
});

describe("slug", () => {
  it("tira acento, pontuação e espaço", () => {
    expect(slug("1. Quem somos e como falar conosco")).toBe("1-quem-somos-e-como-falar-conosco");
    expect(slug("A1. Papéis")).toBe("a1-papeis");
    expect(slug("Resumo — o mais importante, antes de pagar")).toBe("resumo-o-mais-importante-antes-de-pagar");
    expect(slug("Anexo — Acordo de tratamento de dados (profissional e Physiq)")).toBe("anexo-acordo-de-tratamento-de-dados-profissional-e-physiq");
  });
});

describe("lerMarkdown", () => {
  it("títulos, parágrafos (linhas juntas), listas e tabelas", () => {
    const md = [
      "## 1. Quem somos",
      "",
      "Primeira linha",
      "segunda linha com **negrito**.",
      "",
      "- item um",
      "- item [dois](/privacidade)",
      "",
      "| Coluna A | Coluna B |",
      "|---|---|",
      "| a1 | **b1** |",
      "| a2 | b2 |",
      "",
      "### Sub",
    ].join("\n");
    expect(lerMarkdown(md)).toEqual([
      { tipo: "titulo", nivel: 2, texto: "1. Quem somos", id: "1-quem-somos" },
      { tipo: "paragrafo", trechos: [{ texto: "Primeira linha segunda linha com " }, { texto: "negrito", negrito: true }, { texto: "." }] },
      {
        tipo: "lista",
        itens: [
          { trechos: [{ texto: "item um" }], dentro: [] },
          { trechos: [{ texto: "item " }, { texto: "dois", link: "/privacidade" }], dentro: [] },
        ],
      },
      {
        tipo: "tabela",
        cabecalho: [[{ texto: "Coluna A" }], [{ texto: "Coluna B" }]],
        linhas: [
          [[{ texto: "a1" }], [{ texto: "b1", negrito: true }]],
          [[{ texto: "a2" }], [{ texto: "b2" }]],
        ],
      },
      { tipo: "titulo", nivel: 3, texto: "Sub", id: "sub" },
    ]);
  });

  it("parágrafo termina quando começa lista, tabela ou título", () => {
    const blocos = lerMarkdown("texto\n- item\n\ntexto 2\n| a |\n## T");
    expect(blocos.map((b) => b.tipo)).toEqual(["paragrafo", "lista", "paragrafo", "tabela", "titulo"]);
  });

  it("aceita \\r\\n e espaços sobrando", () => {
    expect(lerMarkdown("## Título  \r\n\r\ntexto  \r\n")).toEqual([
      { tipo: "titulo", nivel: 2, texto: "Título", id: "titulo" },
      { tipo: "paragrafo", trechos: [{ texto: "texto" }] },
    ]);
  });

  it("subitens pelo recuo, linha recuada que continua o item e parágrafo recuado dentro do item (como nos rascunhos)", () => {
    const md = [
      "- **Aluno:** entra pelo código",
      "  ou pelo convite.",
      "  - subitem um;",
      "  - subitem dois, que",
      "    continua aqui:",
      "    - neto.",
      "",
      "  Parágrafo do item, depois da linha vazia.",
      "- outro item",
      "",
      "Fora da lista.",
    ].join("\n");
    expect(lerMarkdown(md)).toEqual([
      {
        tipo: "lista",
        itens: [
          {
            trechos: [{ texto: "Aluno:", negrito: true }, { texto: " entra pelo código ou pelo convite." }],
            dentro: [
              {
                tipo: "lista",
                itens: [
                  { trechos: [{ texto: "subitem um;" }], dentro: [] },
                  {
                    trechos: [{ texto: "subitem dois, que continua aqui:" }],
                    dentro: [{ tipo: "lista", itens: [{ trechos: [{ texto: "neto." }], dentro: [] }] }],
                  },
                ],
              },
              { tipo: "paragrafo", trechos: [{ texto: "Parágrafo do item, depois da linha vazia." }] },
            ],
          },
          { trechos: [{ texto: "outro item" }], dentro: [] },
        ],
      },
      { tipo: "paragrafo", trechos: [{ texto: "Fora da lista." }] },
    ]);
  });

  it("linha vazia entre itens do mesmo recuo não acaba a lista; parágrafo sem recuo acaba", () => {
    const blocos = lerMarkdown("- a\n\n- b\ntexto\n- c");
    expect(blocos.map((b) => b.tipo)).toEqual(["lista", "paragrafo", "lista"]);
    expect(blocos[0].tipo === "lista" && blocos[0].itens.length).toBe(2);
  });

  it("negrito que quebra de linha dentro do item continua negrito (as linhas se juntam antes)", () => {
    const [lista] = lerMarkdown("- limite de **3\n  mensalidades** do plano");
    expect(lista).toEqual({
      tipo: "lista",
      itens: [{ trechos: [{ texto: "limite de " }, { texto: "3 mensalidades", negrito: true }, { texto: " do plano" }], dentro: [] }],
    });
  });
});

describe("semQuebra", () => {
  it("prende o número ao R$, CPF, §, nº e art. (espaço que não quebra)", () => {
    expect(semQuebra("R$ 1,50 · CPF 123.232.784-01 · § 1º · nº 2/2022 · art. 11")).toBe(
      "R$\u00a01,50 · CPF\u00a0123.232.784-01 · §\u00a01º · nº\u00a02/2022 · art.\u00a011",
    );
  });

  it("não mexe quando não vem número depois", () => {
    expect(semQuebra("R$ por mês e CPF ou CNPJ")).toBe("R$ por mês e CPF ou CNPJ");
  });
});
