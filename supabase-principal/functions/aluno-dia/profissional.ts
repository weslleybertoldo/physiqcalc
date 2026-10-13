// Physiq W-A P2 — o módulo do PROFISSIONAL (o painel — P6), pela matrícula da rota: ler q=aluno_rotinas (rotinas_do_aluno: as do aluno + as de
// profissional das matrículas que quem chama vê, com as arquivadas e o histórico) · q=aluno_dia (dia_do_aluno: o dia a dia, só leitura — o
// personal também, Q1) · prof_rotina_salvar (criar na matrícula da rota, com o aviso no sino; mudar só as de profissional DESTA matrícula — a
// do aluno → 409 so_do_aluno; a de outra matrícula → 404) · prof_rotina_arquivar (a mesma trava). Quem pode: w14_pode_editar (as RPCs da wa2/wa3).
import type { ContextoPessoa } from "../_shared/porta-pessoa.ts";
import type { PedidoDoAlunoDia } from "../_shared/aluno-dia-regras.ts";
import { chamar, type Resposta } from "./comum.ts";

export function atenderProfissional(c: ContextoPessoa, p: PedidoDoAlunoDia): Promise<Resposta> {
  return chamar(c, p);
}
