// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/suplementosUtil.test.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { describe, expect, it } from "vitest";
import {
  CATEGORIAS, aplicarChip, chipAtivo, edicaoParaBanco, escolherProduto, filtrarProdutos, formDaIndicacao, formDoProduto, formInicialIndicacao, formInicialProduto,
  indicacaoParaBanco, inserirIndicacao, lerCategoria, linkValido, moverIndicacao, mudancasDeOrdem, nomeArquivoPDFSuplementos, ordenarIndicacoes, ordenarProdutos,
  produtoParaBanco, proximaOrdem, rotuloCategoria, separarIndicacoes, textoContagemIndicacoes, textoContagemProdutos, textoDesde, textoPosologia, textoProduto,
  textoProdutoCatalogo, validarIndicacao, validarProduto, type IndicacaoBase, type ProdutoBase,
} from "./suplementosUtil";

const HOJE = "2026-09-19";
const prod = (id: string, nome: string, extra: Partial<ProdutoBase> = {}): ProdutoBase => ({
  id, nome, marca: "", categoria: "suplemento", apresentacao: "", dose_padrao: "", modo_uso: "", link: "", observacao: "", favorito: false, created_at: "2026-09-01T12:00:00Z", ...extra,
});
const ind = (id: string, ordem: number, extra: Partial<IndicacaoBase> = {}): IndicacaoBase => ({
  id, produto_id: null, produto_nome: `P${id}`, produto_marca: "", produto_apresentacao: "", produto_categoria: "suplemento", dose: "1", horario: "", duracao: "",
  inicio: HOJE, ativa: true, ordem, observacao: "", created_at: `2026-09-0${(ordem % 9) + 1}T12:00:00Z`, updated_at: `2026-09-1${(ordem % 9) + 1}T12:00:00Z`, ...extra,
});
const whey = prod("w", "Whey Protein", { marca: "Growth", apresentacao: "pote 1 kg", dose_padrao: "30 g", favorito: false });
const crea = prod("c", "Creatina", { marca: "Growth", apresentacao: "pote 250 g", dose_padrao: "5 g", favorito: true });
const vitd = prod("d", "Vitamina D3", { marca: "Essential", categoria: "vitamina", dose_padrao: "2000 UI" });

describe("categorias", () => {
  it("6 categorias; rótulo e leitura tolerante", () => {
    expect(CATEGORIAS.map((c) => c.valor)).toEqual(["suplemento", "vitamina", "mineral", "fitoterapico", "alimento_funcional", "outro"]);
    expect(rotuloCategoria("fitoterapico")).toBe("Fitoterápico");
    expect(rotuloCategoria("alimento_funcional")).toBe("Alimento funcional");
    expect(rotuloCategoria("qualquer")).toBe("Outro");
    expect(lerCategoria("mineral")).toBe("mineral");
    expect(lerCategoria(null)).toBe("outro");
  });
});

describe("chips sobre texto livre", () => {
  it("liga/desliga sem acento e sem caixa; mantém o que ela digitou", () => {
    expect(aplicarChip("", "manhã")).toBe("manhã");
    expect(aplicarChip("manhã", "jejum")).toBe("manhã, jejum");
    expect(aplicarChip("Manha, jejum", "manhã")).toBe("jejum");
    expect(aplicarChip("em jejum antes do café", "pós-treino")).toBe("em jejum antes do café, pós-treino");
    expect(chipAtivo("manhã, Pos-Treino", "pós-treino")).toBe(true);
    expect(chipAtivo("manhã", "tarde")).toBe(false);
  });
});

describe("produto (catálogo)", () => {
  it("formulário inicial, do produto e pro banco (textos limpos, categoria lida)", () => {
    expect(formInicialProduto("Ômega 3")).toMatchObject({ nome: "Ômega 3", categoria: "suplemento", favorito: false, link: "" });
    expect(formDoProduto({ ...vitd, categoria: "lixo" })).toMatchObject({ nome: "Vitamina D3", marca: "Essential", categoria: "outro", dose_padrao: "2000 UI" });
    expect(produtoParaBanco({ ...formInicialProduto("  Whey   Protein "), marca: " Growth ", link: " https://x.com/w ", modo_uso: " 1 dose\napós o treino ", favorito: true })).toEqual({
      nome: "Whey Protein", marca: "Growth", categoria: "suplemento", apresentacao: "", dose_padrao: "", modo_uso: "1 dose\napós o treino", link: "https://x.com/w", observacao: "", favorito: true,
    });
  });
  it("validação: nome 1–120, categoria, link http(s) opcional, textos ≤ 300", () => {
    expect(validarProduto(formInicialProduto(""))).toBe("Informe o nome do produto");
    expect(validarProduto(formInicialProduto("   "))).toBe("Informe o nome do produto");
    expect(validarProduto(formInicialProduto("x".repeat(121)))).toBe("Nome com no máximo 120 caracteres");
    expect(validarProduto({ ...formInicialProduto("Whey"), categoria: "loja" as never })).toBe("Escolha uma categoria");
    expect(validarProduto({ ...formInicialProduto("Whey"), link: "www.loja.com" })).toBe("Link inválido — comece com http:// ou https://");
    expect(validarProduto({ ...formInicialProduto("Whey"), link: "https://loja.com/whey" })).toBeNull();
    expect(validarProduto({ ...formInicialProduto("Whey"), marca: "m".repeat(301) })).toBe("Marca com no máximo 300 caracteres");
    expect(validarProduto(formInicialProduto("Whey"))).toBeNull();
    expect(linkValido("")).toBe(true);
    expect(linkValido("http://a.b")).toBe(true);
    expect(linkValido("https://a b")).toBe(false);
    expect(linkValido("ftp://a.b")).toBe(false);
  });
  it("ordena favoritos primeiro e depois nome sem acento; filtra por palavras em nome+marca e por categoria", () => {
    const acai = prod("a", "Açaí em pó", { marca: "Amazon" });
    expect(ordenarProdutos([whey, vitd, crea, acai]).map((p) => p.id)).toEqual(["c", "a", "d", "w"]);
    expect(filtrarProdutos([whey, crea, vitd], "crea").map((p) => p.id)).toEqual(["c"]);
    expect(filtrarProdutos([whey, crea, vitd], "GROWTH").map((p) => p.id)).toEqual(["w", "c"]);
    expect(filtrarProdutos([whey, crea, vitd], "growth whey").map((p) => p.id)).toEqual(["w"]);
    expect(filtrarProdutos([whey, crea, vitd], "", "vitamina").map((p) => p.id)).toEqual(["d"]);
    expect(filtrarProdutos([whey, crea, vitd], "vitamina", "suplemento")).toEqual([]);
    expect(filtrarProdutos([whey, crea, vitd], "  ")).toHaveLength(3);
  });
  it("textos do catálogo", () => {
    expect(textoContagemProdutos(0)).toBe("Nenhum produto");
    expect(textoContagemProdutos(1)).toBe("1 produto");
    expect(textoContagemProdutos(3)).toBe("3 produtos");
    expect(textoProdutoCatalogo(whey)).toBe("Growth · pote 1 kg · Suplemento · dose padrão 30 g");
    expect(textoProdutoCatalogo(prod("x", "Zinco", { categoria: "mineral" }))).toBe("Mineral");
  });
});

describe("indicação", () => {
  it("formulário inicial com a dose padrão do produto; escolher/trocar produto só mexe na dose vazia ou padrão", () => {
    expect(formInicialIndicacao(HOJE)).toEqual({ produto: null, nomeLivre: "", dose: "", horario: "", duracao: "", inicio: HOJE, observacao: "" });
    expect(formInicialIndicacao(HOJE, whey).dose).toBe("30 g");
    const f = escolherProduto(formInicialIndicacao(HOJE), whey);
    expect(f.produto?.id).toBe("w");
    expect(f.dose).toBe("30 g");
    expect(escolherProduto(f, crea).dose).toBe("5 g"); // ainda era a dose padrão do anterior → troca
    expect(escolherProduto({ ...f, dose: "40 g" }, crea).dose).toBe("40 g"); // ela mexeu → mantém
    expect(escolherProduto({ ...f, nomeLivre: "abc" }, null)).toMatchObject({ produto: null, nomeLivre: "", dose: "" });
  });
  it("formulário da indicação (editar): produto travado, só posologia/início/observação", () => {
    const i = ind("1", 0, { produto_id: "w", produto_nome: "Whey Protein", dose: "30 g", horario: "pós-treino", duracao: "90 dias", observacao: "obs" });
    expect(formDaIndicacao(i)).toEqual({ produto: null, nomeLivre: "Whey Protein", dose: "30 g", horario: "pós-treino", duracao: "90 dias", inicio: HOJE, observacao: "obs" });
    expect(edicaoParaBanco({ ...formDaIndicacao(i), dose: " 3 g ", horario: " manhã,  jejum " })).toEqual({ dose: "3 g", horario: "manhã, jejum", duracao: "90 dias", inicio: HOJE, observacao: "obs" });
  });
  it("validação: produto ou nome livre, dose 1–120, início ≤ hoje, textos ≤ 300; ao editar o produto não é exigido", () => {
    const base = formInicialIndicacao(HOJE);
    expect(validarIndicacao(base, HOJE)).toBe("Escolha um produto do catálogo ou informe o nome");
    expect(validarIndicacao({ ...base, nomeLivre: "n".repeat(121), dose: "1" }, HOJE)).toBe("Nome com no máximo 120 caracteres");
    expect(validarIndicacao({ ...base, produto: whey, dose: "  " }, HOJE)).toBe("Informe a dose");
    expect(validarIndicacao({ ...base, produto: whey, dose: "d".repeat(121) }, HOJE)).toBe("Dose com no máximo 120 caracteres");
    expect(validarIndicacao({ ...base, produto: whey, dose: "30 g", inicio: "" }, HOJE)).toBe("Informe a data de início");
    expect(validarIndicacao({ ...base, produto: whey, dose: "30 g", inicio: "2026-09-20" }, HOJE)).toBe("O início não pode ser no futuro");
    expect(validarIndicacao({ ...base, produto: whey, dose: "30 g", horario: "h".repeat(301) }, HOJE)).toBe("Horário com no máximo 300 caracteres");
    expect(validarIndicacao({ ...base, produto: whey, dose: "30 g" }, HOJE)).toBeNull();
    expect(validarIndicacao({ ...base, nomeLivre: "Ômega 3", dose: "1 cápsula" }, HOJE)).toBeNull();
    expect(validarIndicacao({ ...base, dose: "3 g" }, HOJE, true)).toBeNull();
  });
  it("pro banco: COPIA nome/marca/apresentação/categoria do produto; nome livre → produto_id null e categoria padrão", () => {
    const f = { ...escolherProduto(formInicialIndicacao(HOJE), vitd), horario: " manhã ", duracao: "contínuo", observacao: " com gordura " };
    expect(indicacaoParaBanco(f)).toEqual({
      produto_id: "d", produto_nome: "Vitamina D3", produto_marca: "Essential", produto_apresentacao: "", produto_categoria: "vitamina",
      dose: "2000 UI", horario: "manhã", duracao: "contínuo", inicio: HOJE, observacao: "com gordura",
    });
    expect(indicacaoParaBanco({ ...formInicialIndicacao(HOJE), nomeLivre: "  Ômega   3 ", dose: "1 cáps" })).toMatchObject({
      produto_id: null, produto_nome: "Ômega 3", produto_marca: "", produto_apresentacao: "", produto_categoria: "suplemento", dose: "1 cáps",
    });
  });
  it("ordena ativas primeiro por ordem/criação; separa encerradas da mais recente; próxima ordem; inserir", () => {
    const lista = [ind("b", 1), ind("z", 0, { ativa: false, updated_at: "2026-09-10T00:00:00Z" }), ind("a", 0), ind("y", 5, { ativa: false, updated_at: "2026-09-15T00:00:00Z" }), ind("c", 1, { created_at: "2026-09-09T00:00:00Z" })];
    expect(ordenarIndicacoes(lista).map((i) => i.id)).toEqual(["a", "b", "c", "z", "y"]);
    const { ativas, encerradas } = separarIndicacoes(lista);
    expect(ativas.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(encerradas.map((i) => i.id)).toEqual(["y", "z"]);
    expect(proximaOrdem(ativas)).toBe(2);
    expect(proximaOrdem([])).toBe(0);
    expect(inserirIndicacao(ativas, ind("a", 0, { dose: "9" })).map((i) => i.dose)).toEqual(["9", "1", "1"]);
    expect(inserirIndicacao(ativas, ind("n", 3)).map((i) => i.id)).toEqual(["a", "b", "c", "n"]);
  });
  it("mover ▲▼ só entre as ativas, renumerando 0..n; na ponta não muda; mudanças de ordem = só as que trocaram", () => {
    const lista = [ind("a", 0), ind("b", 1), ind("c", 2), ind("z", 0, { ativa: false })];
    const subiuB = moverIndicacao(lista, "b", -1);
    expect(subiuB.map((i) => [i.id, i.ordem])).toEqual([["b", 0], ["a", 1], ["c", 2]]);
    expect(mudancasDeOrdem(lista, subiuB)).toEqual([{ id: "b", ordem: 0 }, { id: "a", ordem: 1 }]);
    expect(moverIndicacao(lista, "a", -1).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(moverIndicacao(lista, "c", 1).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(mudancasDeOrdem(lista, moverIndicacao(lista, "c", 1))).toEqual([]);
    expect(moverIndicacao(lista, "z", -1).map((i) => i.id)).toEqual(["a", "b", "c"]);
    // ordens com buraco (depois de encerrar uma do meio) são renumeradas ao mover
    const buraco = [ind("a", 0), ind("c", 4)];
    expect(moverIndicacao(buraco, "c", -1).map((i) => [i.id, i.ordem])).toEqual([["c", 0], ["a", 1]]);
  });
  it("textos: produto, posologia, desde, contagem, nome do PDF", () => {
    const i = ind("1", 0, { produto_nome: "Whey Protein", produto_marca: "Growth", produto_apresentacao: "pote 1 kg", dose: "30 g", horario: "pós-treino", duracao: "90 dias", inicio: "2026-09-19" });
    expect(textoProduto(i)).toBe("Whey Protein · Growth · pote 1 kg");
    expect(textoProduto({ ...i, produto_marca: "", produto_apresentacao: " " })).toBe("Whey Protein");
    expect(textoPosologia(i)).toBe("30 g · pós-treino · 90 dias");
    expect(textoPosologia({ ...i, horario: "", duracao: "" })).toBe("30 g");
    expect(textoDesde("2026-09-19")).toBe("desde 19/09/2026");
    expect(textoContagemIndicacoes(0, 0)).toBe("Nenhum produto indicado");
    expect(textoContagemIndicacoes(1, 1)).toBe("1 produto indicado · 1 ativo");
    expect(textoContagemIndicacoes(1, 2)).toBe("2 produtos indicados · 1 ativo");
    expect(textoContagemIndicacoes(0, 2)).toBe("2 produtos indicados · nenhum ativo");
    expect(textoContagemIndicacoes(3, 3)).toBe("3 produtos indicados · 3 ativos");
    expect(nomeArquivoPDFSuplementos("Maria José da Silva", new Date(2026, 8, 19, 21, 30))).toBe("maria-jose-da-silva-suplementacao-2026-09-19.pdf");
    expect(nomeArquivoPDFSuplementos("!!!", new Date(2026, 0, 2))).toBe("paciente-suplementacao-2026-01-02.pdf");
  });
});
