// Physiq W-A P2 — o módulo das ROTINAS do aluno (o app — P3): ler q=rotinas (minhas_rotinas: as vivas + as feitas do intervalo) · rotina_salvar
// (criar só quem é aluno — inclusive o app sem profissional, P9 — ou mudar qualquer rotina viva dele, as do profissional também — P8b) ·
// rotina_arquivar (apagar = arquivar: o profissional ainda vê) · rotina_marcar (hoje ou ontem de SP, no dia da semana dela; só o aluno marca)
// · rotinas_ordenar. As regras de quem pode moram nas RPCs (migration 20261012210000_wa2_rotinas.sql); a forma, no _shared/aluno-dia-regras.ts.
import type { ContextoPessoa } from "../_shared/porta-pessoa.ts";
import type { PedidoDoAlunoDia } from "../_shared/aluno-dia-regras.ts";
import { chamar, type Resposta } from "./comum.ts";

export function atenderRotinas(c: ContextoPessoa, p: PedidoDoAlunoDia): Promise<Resposta> {
  return chamar(c, p);
}
