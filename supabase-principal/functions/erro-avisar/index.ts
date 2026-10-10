// Physiq hml-10 (H-26, D4) — erro-avisar (banco principal): recebe o erro que o app viu (tela, promessa sem catch, função que
// respondeu 5xx, sincronização) ou que uma função do Banco do Treino pegou, e avisa o Weslley no Telegram (grupo Validação ›
// tópico Physiq) com a trava de repetidos (1 igual a cada 10 min; até 30 por hora por schema). Tudo é limpo (_shared/erros.ts)
// antes de gravar e de avisar. A lógica mora em _shared/erro-avisar-regras.ts (atenderPedido, testado no Vitest); o catch
// final também está lá (chama log.excecao — a prova do D6).
//
// POST (≤ 2 KB), headers: x-schema: public|staging (ou ?schema=) e
//   - do app (navegador/APK): a Origin da lista (login-regras.origemPermitida). Corpo:
//       { origem: "tela"|"promessa"|"funcao"|"sync", mensagem?, rota?, lugar?, versao?, plataforma?: "site"|"app"|"loja",
//         funcao? + banco?: "principal"|"treino" + status? (origem "funcao": a função que respondeu 5xx) }
//   - do Treino (servidor): x-espelho-segredo (hml-16c, S7: o Treino manda SEGREDO_AVISO_ERRO; aqui fica só o hash, em
//     SEGREDO_AVISO_ERRO_ACEITOS — _shared/segredo-servidor.ts). Corpo: { origem: "servidor", funcao, codigo, acao?, status?, mensagem? }
//   - {"teste":"excecao"} só com o segredo E x-schema: staging → lança de propósito → 500 + o aviso
//     "função erro-avisar · excecao · ação teste_hml10".
// 204 aceito (o aviso sai em segundo plano) · 400 schema_invalido | json_invalido | aviso_invalido · 403 segredo_invalido |
// origem_recusada | so_staging · 405 metodo · 413 corpo_grande · 500 erro_interno.
//
// verify_jwt = false (o erro pode acontecer antes do login). Publicar:
//   scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions erro-avisar false
// Segredos: TELEGRAM_BOT_TOKEN, ERROS_TELEGRAM_CHAT, ERROS_TELEGRAM_TOPICO (opcional), ERROS_AVISO_DESLIGADO (opcional),
// SEGREDO_AVISO_ERRO_ACEITOS (até o F7, também o legado ESPELHO_SEGREDO) (+ os automáticos). Banco:
// supabase-principal/migrations/20261008110000_hml10_avisos_erro.sql.
import { avisarErro, enviarAviso } from "../_shared/avisar-erro.ts";
import { atenderPedido } from "../_shared/erro-avisar-regras.ts";
import { criarLog, emSegundoPlano } from "../_shared/log.ts";
import { segredoAceito } from "../_shared/segredo-servidor.ts";

const log = criarLog("erro-avisar", { avisar: avisarErro });
const segredo = (recebido: string) => segredoAceito(recebido, "SEGREDO_AVISO_ERRO");

Deno.serve((req) => atenderPedido(req, { segredo, enviar: enviarAviso, log, emSegundoPlano }));
