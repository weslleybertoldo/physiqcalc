// Physiq hml-21c (H-43 · jeito 2, etapa 3, 13/10/2026) — as GRAVAÇÕES da Mensagens (o WhatsApp) e da faixa da casca pela função conta, COMO A
// PESSOA (c.comoPessoa — o token de quem chama; nenhuma chave secreta). As ações estão em _shared/conta-regras.ts → ACOES_DAS_MENSAGENS;
// cada uma chama a MESMA RPC de hoje (src/painel/mensagens/api.ts e src/painel/aluno/dados/api.ts no c6e795b) com os MESMOS argumentos:
//   whatsapp_config_salvar  whatsapp_salvar_config(p_whatsapp) — o paraGravar da tela (ativo, horário, os 6 momentos e os textos: o objeto
//                           fechado à mão; a RPC confere de novo — texto_longo, horário fora → 09:00)
//   whatsapp_reenviar       whatsapp_reenviar(p_id) — a RPC confere se ainda faz sentido (nao_conectado, nao_encontrada, antiga…)
//   whatsapp_limpar_falhas  whatsapp_limpar_falhas() — o "Limpar" (a marca whatsapp_falhas_vistas_em do config de quem chama)
//   faixa_ligar_para_todos  mensagens_ligar_para_todos(p_ids) — a faixa "Ligar para todos" (até 500, o corte da RPC)
//   faixa_fechar            mensagens_aviso_fechar() — fechar a faixa
// A conexão, o QR, o status e o teste seguem pela função whatsapp-conectar (já é servidor; na Guarda dos E2E ela é gravação — decisão 23).
// As RPCs devolvem o que já devolvem (o { ok: false, erro } vai à tela como hoje, no `resultado`); nenhuma levanta de propósito.
import { lerCorpoDaAcao, type AcaoDasMensagens } from "../_shared/conta-regras.ts";
import { recusa, rpcDaAcao, type ContextoConta, type Resposta } from "./comum.ts";

export async function atenderMensagens(c: ContextoConta, acao: AcaoDasMensagens): Promise<Resposta> {
  const p = lerCorpoDaAcao(acao, c.corpo);
  if (p.ok === false) return recusa(c, acao, p.erro, p.campo);
  const v = p.valores;
  switch (acao) {
    case "whatsapp_config_salvar":
      return await rpcDaAcao(c, acao, "whatsapp_salvar_config", { p_whatsapp: v.whatsapp });
    case "whatsapp_reenviar":
      return await rpcDaAcao(c, acao, "whatsapp_reenviar", { p_id: v.id });
    case "whatsapp_limpar_falhas":
      return await rpcDaAcao(c, acao, "whatsapp_limpar_falhas", {});
    case "faixa_ligar_para_todos":
      return await rpcDaAcao(c, acao, "mensagens_ligar_para_todos", { p_ids: v.ids });
    case "faixa_fechar":
      return await rpcDaAcao(c, acao, "mensagens_aviso_fechar", {});
  }
}
