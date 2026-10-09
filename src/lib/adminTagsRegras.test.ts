import { describe, expect, it } from "vitest";
import {
  tagsQueNaoPodemEntrar,
  tagVisivel,
  trocaDeTags,
  type QuemMexe,
  type TagComDono,
} from "../../supabase/functions/admin-tags/regras";

// hml-14 (H-51 item 1) — as decisões puras da admin-tags: qual tag quem chama pode pôr no aluno (a régua do catálogo) e a troca
// do conjunto de tags sem apagar tudo antes.
const PROF_A = "aaaaaaaa-0000-4000-8000-000000000001";
const PROF_B = "bbbbbbbb-0000-4000-8000-000000000002";
const MASTER = "cccccccc-0000-4000-8000-000000000003";
const quemA: QuemMexe = { id: PROF_A, papel: "professor" };
const quemMaster: QuemMexe = { id: MASTER, papel: "master" };
const tag = (id: string, professor_id: string | null): TagComDono => ({ id, professor_id });
const GLOBAL = tag("t-global", null);
const DO_A = tag("t-do-a", PROF_A);
const DO_B = tag("t-do-b", PROF_B);

describe("tagVisivel: a mesma régua do catálogo (tagsVisiveis)", () => {
  it("professor vê as globais (professor_id null) e as dele", () => {
    expect(tagVisivel(GLOBAL, quemA)).toBe(true);
    expect(tagVisivel(DO_A, quemA)).toBe(true);
  });

  it("professor NÃO vê a tag privada de outro professor", () => {
    expect(tagVisivel(DO_B, quemA)).toBe(false);
  });

  it("master vê todas, inclusive as privadas dos professores", () => {
    for (const t of [GLOBAL, DO_A, DO_B]) expect(tagVisivel(t, quemMaster)).toBe(true);
  });

  it("tag que não existe não é visível para ninguém (nem para o master)", () => {
    expect(tagVisivel(null, quemA)).toBe(false);
    expect(tagVisivel(undefined, quemMaster)).toBe(false);
  });
});

describe("trocaDeTags: entra o que é novo, sai o que não veio (nada é apagado e inserido de novo)", () => {
  it("só a diferença: [B, C] → [A, B] = entra A, sai C (B fica onde está)", () => {
    expect(trocaDeTags(["B", "C"], ["A", "B"])).toEqual({ entram: ["A"], saem: ["C"] });
  });

  it("o mesmo conjunto (em outra ordem) não grava nada", () => {
    expect(trocaDeTags(["A", "B"], ["B", "A"])).toEqual({ entram: [], saem: [] });
  });

  it("lista vazia tira todas; aluno sem tag recebe todas", () => {
    expect(trocaDeTags(["A", "B"], [])).toEqual({ entram: [], saem: ["A", "B"] });
    expect(trocaDeTags([], ["A", "B"])).toEqual({ entram: ["A", "B"], saem: [] });
  });

  it("repetidas contam uma vez (no pedido e no que o aluno já tem)", () => {
    expect(trocaDeTags(["C", "C"], ["A", "A", "C"])).toEqual({ entram: ["A"], saem: [] });
  });
});

describe("tagsQueNaoPodemEntrar: só as que ENTRAM precisam ser visíveis", () => {
  it("professor pondo a tag privada de outro professor → ela é recusada", () => {
    expect(tagsQueNaoPodemEntrar(["t-do-b"], [DO_B], quemA)).toEqual(["t-do-b"]);
  });

  it("professor pondo a global e a dele → nada recusado", () => {
    expect(tagsQueNaoPodemEntrar(["t-global", "t-do-a"], [GLOBAL, DO_A], quemA)).toEqual([]);
  });

  it("id que não existe no banco (não veio em `encontradas`) → recusado, igual à privada de outro (não revela qual é qual)", () => {
    expect(tagsQueNaoPodemEntrar(["t-sumiu", "t-do-b"], [DO_B], quemA)).toEqual(["t-sumiu", "t-do-b"]);
  });

  it("master pode pôr qualquer tag que exista", () => {
    expect(tagsQueNaoPodemEntrar(["t-do-a", "t-do-b"], [DO_A, DO_B], quemMaster)).toEqual([]);
    expect(tagsQueNaoPodemEntrar(["t-sumiu"], [], quemMaster)).toEqual(["t-sumiu"]);
  });

  it("o app antigo manda de volta a lista inteira do aluno: a tag de outro professor que ele JÁ tem não entra, então não barra", () => {
    // aluno com a privada do B (posta pelo B) + o professor A marca a global
    const { entram, saem } = trocaDeTags(["t-do-b"], ["t-do-b", "t-global"]);
    expect({ entram, saem }).toEqual({ entram: ["t-global"], saem: [] });
    expect(tagsQueNaoPodemEntrar(entram, [GLOBAL], quemA)).toEqual([]);
  });

  it("nada entrando → nada a conferir", () => {
    expect(tagsQueNaoPodemEntrar([], [], quemA)).toEqual([]);
  });
});
