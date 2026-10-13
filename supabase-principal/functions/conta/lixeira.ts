// Physiq hml-21c (H-43 · jeito 2, etapa 3, 13/10/2026) — as GRAVAÇÕES da Ferramentas › Lixeira pela função conta, COMO A PESSOA (c.comoPessoa
// — o token de quem chama; nenhuma chave secreta). As ações estão em _shared/conta-regras.ts → ACOES_DA_LIXEIRA; cada uma chama a MESMA RPC de
// hoje (src/ferramentas/lixeira/dados.ts no c6e795b) com os MESMOS argumentos — a RPC confere de novo quem pode (P1 + o clínico da W18), o
// tipo (tipo_invalido; aluno_nao_apaga) e, no aluno, a trava de e-mail/CPF (W16b — ela mesma pega o gatilho e devolve o código) e o P7:
//   lixeira_restaurar  lixeira_restaurar(p_tipo, p_id)
//   lixeira_apagar     lixeira_apagar(p_tipo, p_id) (nunca aluno: a RPC recusa)
// O { ok: false, erro } das 2 vai à tela como hoje (no `resultado`); nenhuma levanta de propósito.
import { lerCorpoDaAcao, type AcaoDaLixeira } from "../_shared/conta-regras.ts";
import { recusa, rpcDaAcao, type ContextoConta, type Resposta } from "./comum.ts";

export async function atenderLixeira(c: ContextoConta, acao: AcaoDaLixeira): Promise<Resposta> {
  const p = lerCorpoDaAcao(acao, c.corpo);
  if (p.ok === false) return recusa(c, acao, p.erro, p.campo);
  const v = p.valores;
  switch (acao) {
    case "lixeira_restaurar":
      return await rpcDaAcao(c, acao, "lixeira_restaurar", { p_tipo: v.tipo, p_id: v.id });
    case "lixeira_apagar":
      return await rpcDaAcao(c, acao, "lixeira_apagar", { p_tipo: v.tipo, p_id: v.id });
  }
}
