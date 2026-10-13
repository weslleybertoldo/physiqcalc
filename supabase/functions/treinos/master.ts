// Physiq hml-21d (H-43 · jeito 2, etapa 3, 13/10/2026) — as GRAVAÇÕES do Master (Master › App do aluno › Treinos prontos e Master ›
// Biblioteca) pela função treinos, COMO A PESSOA (c.comoPessoa — o token do Treino do master; nenhuma chave secreta). O papel já foi
// conferido no index.ts ANTES de chegar aqui (o app_metadata.role admin/master do token — quem não é recebe 403 sem ida ao banco); o RLS do
// Treino (physiq_is_master()) decide de novo. As ações estão em _shared/treinos-regras.ts → ACOES_DO_MASTER; cada uma faz o MESMO de hoje
// (src/master/app/treinosProntos.ts e src/pages/master/BibliotecaPage.tsx no 7c1a637):
//   treino_pronto_salvar       a RPC NOVA treino_pronto_salvar(p_id, p_treino, p_divisoes) — a linha, as divisões e os exercícios numa
//                              transação (hoje 2 + 2×N pedidos em série: uma falha no meio deixava o treino sem as divisões) → { id }
//   treino_pronto_ativo        o ativo do treino pronto, pelo id
//   exercicio_global_criar     tb_exercicios { as colunas da tela, professor_id: null, tipo: "musculacao" } → { id }
//   exercicio_global_editar    as colunas da tela, pelo id · exercicio_global_excluir: o delete pelo id (em uso → em_uso)
//   exercicio_global_promover  professor_id = null (o exercício de um professor vira global)
//   grupo_global_criar         grupos_musculares { nome, professor_id: null } · grupo_global_excluir: o delete pelo id
import { COLUNAS_DO_GLOBAL, ERROS_DAS_RPCS_DO_TREINO, colunasDe, lerCorpoDaAcao, lerTreinoPronto, type AcaoDoMaster } from "../_shared/treinos-regras.ts";
import { apagar, falha, inserir, mudar, recusa, type ContextoTreinos, type Resposta } from "./comum.ts";

export async function atenderMaster(c: ContextoTreinos, acao: AcaoDoMaster): Promise<Resposta> {
  if (acao === "treino_pronto_salvar") return await salvarTreinoPronto(c);
  const p = lerCorpoDaAcao(acao, c.corpo);
  if (p.ok === false) return recusa(c, acao, p.erro, p.campo);
  const v = p.valores;
  switch (acao) {
    case "treino_pronto_ativo":
      return await mudar(c, acao, "physiq_treinos_prontos", [["id", v.id]], { ativo: v.ativo });
    case "exercicio_global_criar": {
      const r = await inserir(c, acao, "tb_exercicios", { ...colunasDe(v, COLUNAS_DO_GLOBAL), professor_id: null, tipo: "musculacao" }, "id");
      return r.ok ? { ok: true, id: r.linha.id ?? null } : r;
    }
    case "exercicio_global_editar":
      return await mudar(c, acao, "tb_exercicios", [["id", v.id]], colunasDe(v, COLUNAS_DO_GLOBAL));
    case "exercicio_global_excluir":
      return await apagar(c, acao, "tb_exercicios", [["id", v.id]]);
    case "exercicio_global_promover":
      return await mudar(c, acao, "tb_exercicios", [["id", v.id]], { professor_id: null });
    case "grupo_global_criar": {
      const r = await inserir(c, acao, "grupos_musculares", { nome: v.nome, professor_id: null }, "id");
      return r.ok ? { ok: true, id: r.linha.id ?? null } : r;
    }
    case "grupo_global_excluir":
      return await apagar(c, acao, "grupos_musculares", [["id", v.id]]);
  }
}

/** O salvar do treino pronto: o corpo conferido (as colunas e as divisões em lista fechada) e a RPC nova, numa transação → { id }. */
async function salvarTreinoPronto(c: ContextoTreinos): Promise<Resposta> {
  const acao = "treino_pronto_salvar";
  const t = lerTreinoPronto(c.corpo);
  if (t.ok === false) return recusa(c, acao, t.erro, t.campo);
  const { data, error } = await c.comoPessoa.rpc("treino_pronto_salvar", { p_id: t.id, p_treino: t.treino, p_divisoes: t.divisoes });
  if (error) return falha(c, acao, error, ERROS_DAS_RPCS_DO_TREINO);
  return { ok: true, id: typeof data === "string" ? data : null };
}
