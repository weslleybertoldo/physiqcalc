// Physiq W-A P2 — o módulo da DIETA LIVRE do aluno (o app — P5): ler q=dia (meu_dia: lê mesmo travada e diz se está liberada, por matrícula) ·
// q=biblioteca (meus_alimentos) · q=alimentos (a busca: TACO, os dele, os dos planos dele, as receitas dele) · dia_adicionar · dia_tirar ·
// dia_desfazer · extra_salvar/excluir/marcar · alimento_salvar/excluir · receita_salvar/excluir. Tudo exige a Dieta liberada (a linha "mexer" +
// nutricionista de verdade) da matrícula do dia — a da refeição; na extra, a do plano ativo —, hoje ou ontem: o BANCO decide, nunca o corpo
// (migration 20261012220000_wa3_dieta_livre.sql). Travada no meio → 409 dieta_travada (a tela volta ao "só ver").
import type { ContextoPessoa } from "../_shared/porta-pessoa.ts";
import type { PedidoDoAlunoDia } from "../_shared/aluno-dia-regras.ts";
import { chamar, type Resposta } from "./comum.ts";

export function atenderDieta(c: ContextoPessoa, p: PedidoDoAlunoDia): Promise<Resposta> {
  return chamar(c, p);
}
