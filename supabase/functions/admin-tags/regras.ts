// Physiq hml-14 (H-51 item 1) — regras PURAS das tags do aluno no Banco do Treino (admin-tags). Sem Deno, sem rede e sem banco:
// usadas pela admin-tags (o deploy leva a pasta da função) e testadas no Vitest (src/lib/adminTagsRegras.test.ts).

/** A tag como o banco guarda o dono: professor_id null = global (do master). */
export interface TagComDono {
  id: string;
  professor_id: string | null;
}

/** Quem chama a admin-tags: o id (do token) e o papel no Treino. */
export interface QuemMexe {
  id: string;
  papel: "master" | "professor";
}

/**
 * A tag é visível para quem chama? A MESMA régua do catálogo (o `tagsVisiveis` da admin-tags): o master vê todas; o professor,
 * as globais (professor_id null) e as dele. Tag que não existe (null/undefined) não é visível.
 */
export function tagVisivel(tag: TagComDono | null | undefined, quem: QuemMexe): boolean {
  if (!tag) return false;
  if (quem.papel === "master") return true;
  return tag.professor_id === null || tag.professor_id === quem.id;
}

/**
 * A troca do conjunto de tags de um aluno (setUserTags): o que entra (pedida que ele ainda não tem) e o que sai (tem e não veio
 * no pedido), sem repetição. Antes a função apagava TODAS e inseria de novo — com o insert falhando, o aluno ficava sem nenhuma.
 */
export function trocaDeTags(atuais: readonly string[], pedidas: readonly string[]): { entram: string[]; saem: string[] } {
  const tem = new Set(atuais);
  const quer = new Set(pedidas);
  return {
    entram: [...quer].filter((id) => !tem.has(id)),
    saem: [...tem].filter((id) => !quer.has(id)),
  };
}

/**
 * As tags que NÃO podem entrar no aluno (vazio = podem todas): cada uma que entra tem que ser visível para quem chama
 * (`encontradas` = as tags pedidas que existem no banco). Só as que ENTRAM são conferidas: a que o aluno já tem pode ficar,
 * mesmo invisível — o app antigo (AdminTagSelector) manda de volta a lista inteira do aluno.
 */
export function tagsQueNaoPodemEntrar(entram: readonly string[], encontradas: readonly TagComDono[], quem: QuemMexe): string[] {
  const porId = new Map(encontradas.map((t) => [t.id, t]));
  return entram.filter((id) => !tagVisivel(porId.get(id), quem));
}
