// Physiq hml-21d (H-43 · jeito 2, etapa 3, 13/10/2026) — as GRAVAÇÕES dos treinos-modelo e das pastas (Painel › Treinos › Meus treinos e o
// Detalhe) pela função treinos, COMO A PESSOA (c.comoPessoa — o token do Treino de quem chama; nenhuma chave secreta). As ações estão em
// _shared/treinos-regras.ts → ACOES_DOS_MODELOS; cada uma faz o MESMO de hoje (src/painel/treinos/api.ts no 7c1a637): a mesma tabela, as
// mesmas colunas — em lista fechada —, o dono do TOKEN (o master cria no global; os outros, para si — o donoAoCriar da tela), nunca do
// corpo. O RLS de hoje decide quem pode (o dono, o master; só a staff com o acesso em dia grava).
//   modelo_criar | pasta_criar         tb_grupos_treino | tb_pastas_treino { nome, professor_id: o dono } → { id }
//   modelo_editar | pasta_editar       o nome, pelo id · modelo_excluir | pasta_excluir: o delete pelo id (a pasta sai; os treinos ficam)
//   modelo_exercicio_incluir           tb_grupos_exercicios { grupo_id, exercicio_id, ordem } (o adicionarAoModelo)
//   modelo_exercicio_tirar             o delete do par grupo + exercício (o tirarDoModelo)
//   modelo_exercicio_prescrever        as colunas da prescrição que vieram, no par (o prescreverModelo — a de cada aluno fica no perfil dele)
//   modelo_ordenar                     a RPC NOVA modelo_ordenar(p_grupo, p_ids) — a ordem de todos de uma vez (hoje 1 pedido por exercício)
//   pasta_vincular | pasta_desvincular o vínculo pasta + treino (o colocarNaPasta: o vínculo que já existe = ok, como hoje)
// Mudar/apagar com 0 linha (não existe, ou o RLS esconde) → nao_encontrado (o molde da hml-19; hoje "dava certo" calado); o 23503 do
// apagar (o modelo em uso) → em_uso, a frase de hoje; o erro do banco vira o código (nunca a mensagem).
import { COLUNAS_DA_PRESCRICAO, ERROS_DAS_RPCS_DO_TREINO, colunasDe, donoAoCriar, lerCorpoDaAcao, type AcaoDosModelos } from "../_shared/treinos-regras.ts";
import { apagar, falha, inserir, mudar, recusa, type ContextoTreinos, type Resposta } from "./comum.ts";

export async function atenderModelos(c: ContextoTreinos, acao: AcaoDosModelos): Promise<Resposta> {
  const p = lerCorpoDaAcao(acao, c.corpo);
  if (p.ok === false) return recusa(c, acao, p.erro, p.campo);
  const v = p.valores;
  switch (acao) {
    case "modelo_criar":
    case "pasta_criar": {
      const tabela = acao === "modelo_criar" ? "tb_grupos_treino" : "tb_pastas_treino";
      const r = await inserir(c, acao, tabela, { nome: v.nome, professor_id: donoAoCriar(c.userId, c.master) }, "id");
      return r.ok ? { ok: true, id: r.linha.id ?? null } : r;
    }
    case "modelo_editar":
      return await mudar(c, acao, "tb_grupos_treino", [["id", v.id]], { nome: v.nome });
    case "pasta_editar":
      return await mudar(c, acao, "tb_pastas_treino", [["id", v.id]], { nome: v.nome });
    case "modelo_excluir":
      return await apagar(c, acao, "tb_grupos_treino", [["id", v.id]]);
    case "pasta_excluir":
      return await apagar(c, acao, "tb_pastas_treino", [["id", v.id]]);
    case "modelo_exercicio_incluir": {
      const r = await inserir(c, acao, "tb_grupos_exercicios", { grupo_id: v.grupo, exercicio_id: v.exercicio, ordem: v.ordem }, "id", { emUso: true });
      return r.ok ? { ok: true } : r;
    }
    case "modelo_exercicio_tirar":
      return await apagar(c, acao, "tb_grupos_exercicios", [["grupo_id", v.grupo], ["exercicio_id", v.exercicio]]);
    case "modelo_exercicio_prescrever":
      return await mudar(c, acao, "tb_grupos_exercicios", [["grupo_id", v.grupo], ["exercicio_id", v.exercicio]], colunasDe(v, COLUNAS_DA_PRESCRICAO));
    case "modelo_ordenar": {
      const { data, error } = await c.comoPessoa.rpc("modelo_ordenar", { p_grupo: v.grupo, p_ids: v.ids });
      if (error) return falha(c, acao, error, ERROS_DAS_RPCS_DO_TREINO);
      return { ok: true, n: typeof data === "number" ? data : 0 };
    }
    case "pasta_vincular": {
      const { error } = await c.comoPessoa.from("tb_pastas_treino_grupos").insert({ pasta_id: v.pasta, grupo_id: v.grupo }).select("id").single();
      // o treino que já está na pasta (o UNIQUE pasta + treino): ok, como o colocarNaPasta de hoje
      if (error && (error as { code?: unknown }).code !== "23505") return falha(c, acao, error, [], { emUso: true });
      return { ok: true };
    }
    case "pasta_desvincular":
      return await apagar(c, acao, "tb_pastas_treino_grupos", [["pasta_id", v.pasta], ["grupo_id", v.grupo]]);
  }
}
