// Physiq W6 — pagamentos-aluno (banco principal): a cobrança aluno → profissional unificada (spec §4.3 Perfil › Pagamentos,
// §4.5 aba Financeiro, §4.6 Recebimento, §6.6, §9; C23, C29, C40, C46–C47, C97–C101, N-45, N-54, N-76, R15, R16). Junta o que
// eram as ações de aluno e de staff do mp-payments do Calc (Banco do Treino) e as cobranças do Nutri, agora no banco principal.
//
// POST, headers: Authorization: Bearer <access_token do principal> · x-schema: public|staging. Corpo: { acao, ... }
//  ALUNO (a própria matrícula — pacientes.user_id = quem chama):
//   aluno_status                     mensalidade, chave Pix ativa, assinatura, cobranças e recibos (confere no MP o que ainda muda)
//                                    hml-14d: + total_cobrancas e total_recibos por matrícula (o "Ver todos (N)"; só chaves novas)
//                                    W-P: a mensalidade + modalidade, meses, negociado, max_parcelas, automatica e parcela (n de N)
//                                    W2: + mp { disponivel, chave_publica } na matrícula do MP do personal (disponivel = a conexão ativa;
//                                    a chave pública do vendedor para o cartão — sem ela, só Pix); nas outras, mp null
//   aluno_historico   { paciente_id, tipo: "cobrancas"|"recibos", pagina }   hml-14d: o "Ver todos" — 20 por página + o total
//   aluno_upload      { paciente_id, tipo }                 URL assinada para subir o comprovante (o servidor escolhe o caminho)
//   aluno_avisar_pix  { paciente_id, comprovante_path, cobranca_id? }   "Já paguei": Pix na chave da conta com comprovante
//   aluno_comprovante { cobranca_id }                       URL assinada (5 min) do comprovante anexado
//   aluno_mp_pix      { paciente_id, cobranca_id? }         Pix do Mercado Pago (contas liberadas pelo master — C99)
//   aluno_mp_cartao   { paciente_id, cobranca_id?, card_token, payment_method_id, issuer_id, installments? }   W-P (I6): mais de
//                                                            1 parcela só no cartão parcelado, até o máximo do plano
//                     mp-cartao: + pagador? { nome?, documento?: { tipo: "CPF"|"CNPJ", numero } } (o titular do formulário do cartão)
//                     e device_id? (o MP_DEVICE_SESSION_ID do security.js) → o payer completo, 1 item, o descritor "PHYSIQ" e o cabeçalho
//                     X-meli-session-id (_shared/mp-pagador-regras.ts); recusado → 200 com status_detail (o de sempre) e o log
//                     mp_cartao_recusado; a recusa 400 → cartao_recusado com status_detail (só o código; o texto do MP não volta mais —
//                     revisão mpc ⚪7: nenhuma tela nem APK lia o `detalhe`)
//   aluno_mp_assinar  { paciente_id, card_token, device_id? }  cobrança automática mensal no cartão (W-P: não no período todo); mp-cartao:
//                                                            só o cabeçalho do aparelho (o corpo é o de antes)
//   aluno_mp_cancelar { paciente_id }                        cancela a própria assinatura
//   aluno_mp_conferir { cobranca_id }                        a tela confere o Pix do MP a cada 5 s e no "Já paguei"
//   aluno_app_plano   { paciente_id, plano }                 W7b — aluno sem profissional troca o plano do app (Treino ·
//                                                            Treino + Alimentação): vale a partir do próximo pagamento e a
//                                                            cobrança automática no cartão passa para o valor novo
//   detalhe_mp        { cobranca_id }                        dados reais da transação no MP (comprovante em PDF) — aluno ou profissional
//                                                            W2: a cobrança de outra conta do MP → { mp: null, motivo: "outra_conta_mp" }
//   simular_aprovacao { cobranca_id }                        SÓ STAGING (o Pix do sandbox não se paga)
//   aluno_ip_link     { paciente_id, cobranca_id? }         W1: o link da InfinitePay da mensalidade (ou da avulsa): reaproveita o da
//                                                            tentativa viva (72 h, o mesmo valor e a mesma InfiniteTag); order_nsu = um
//                                                            pedido por LINK, <cobranca_id>-<n> (infinitepay_links — I4); a InfinitePay
//                                                            recusou ou caiu → a tentativa é desfeita (checkout desligado: 400 + ativar)
//   aluno_ip_volta    { order_nsu, transaction_nsu, slug, receipt_url?, capture_method? }   W1: a volta da página — vira um aviso da
//                                                            caixa e é conferido NA HORA, como a tela (I3: sem gastar tentativa)
//   aluno_ip_conferir { cobranca_id }                        W1: confere o aviso pendente que já está na hora (sem gastar tentativa — I3);
//                                                            sem NENHUM aviso, pergunta só pelo pedido (W1-B2, 1 vez a cada 30 s)
//  PROFISSIONAL (dono da conta, responsável pelo aluno ou master — quem vê o quê: spec 4.1 e P6):
//   prof_planos       { conta_id }                          W-P: os planos da conta (completo, parcela, quantos alunos) e o modo —
//                                                            só o dono e o master (Task 8b, ponto 1: os outros da conta → 403 so_o_dono)
//   prof_plano_salvar { conta_id, id?, nome, meses, valor, modalidades, max_parcelas_cartao?, valor_parcela_mensal? }  só o dono —
//                     Task 8b (ponto 2): as automáticas de quem segue o plano vão para a fila → { automaticas: { enfileiradas } }
//                     (o schema sem a fila troca na hora, como antes → { automaticas: { atualizadas, falharam } })
//   prof_plano_ativo  { conta_id, id, ativo }               W-P: desativar/reativar (quem já está no plano continua)
//   prof_resumo       { conta_id }                          alunos da conta com mensalidade e selos + comprovantes aguardando
//                     { conta_id, pagina, pagina_sem?, busca? }   hml-14b: a página da tela Mensalidades (20 com mensalidade + 20
//                                                            sem, a busca, o total e os números da conta — mensalidades.ts)
//   prof_aluno        { aluno }                             o Financeiro de um aluno (aluno = id da matrícula ou do Treino)
//   prof_aluno_cobrancas { aluno, pagina }                  hml-14d: o "Ver todas" das cobranças do aluno — 20 por página + o total
//   prof_definir      { aluno, plano_aluno_id?, plano_novo?, valor }   modo de hoje: plano só com nome e valor (o APK antigo manda assim)
//                     { aluno, plano_aluno_id, plano_modalidade, plano_valor_negociado?, inicio?, cancelar_automatica? }   W-P:
//                     plano com período (o valor sai do plano); plano_modalidade: null volta ao modo de hoje. A automática troca
//                     de valor na hora (1 PUT); o MP falhou → a fila tenta de hora em hora (automatica: "na_fila", sem aviso)
//   prof_pausar       { aluno, pausar }                     "não cobrar pelo app" / reativar
//   prof_confirmar    { cobranca_id, lancar? }              confirma o Pix com comprovante (lancar = entrada no financeiro)
//   prof_recusar      { cobranca_id, motivo }               recusa (o aluno vê o motivo)
//   prof_registrar    { aluno, data, metodo, valor?, cobranca_id?, lancar? }   pagamento feito por fora (dinheiro etc.)
//   prof_remover      { cobranca_id }                       remove um pagamento por fora da mensalidade (a cobertura recua)
//   prof_cobranca_criar   { aluno, descricao, valor, vencimento }   cobrança avulsa (a do Nutri)
//   prof_cobranca_cancelar { cobranca_id }
//   prof_reembolsar   { cobranca_id }                       estorno total no Mercado Pago
//   prof_cancelar_assinatura { aluno }
//   prof_comprovante  { cobranca_id }                       URL assinada (5 min)
//   prof_recebimento        { conta_id }                    W1 (jeito 2): Configurações › Recebimento numa chamada — a conta (modo,
//                                                            bloquear), as chaves Pix e a InfinitePay (disponível, InfiniteTag) — só o dono
//   prof_recebimento_salvar { conta_id, modo?, bloquear?, handle?, cancelar_automaticas? }   W1: grava COMO A PESSOA (o RLS e a
//                                                            contas_guard valem); InfiniteTag nova → um link de R$ 1,00 (a InfinitePay diz
//                                                            se ela existe); sair do MP com automática viva → 409 automaticas_ativas
//                                                            W2: 'mercadopago_conta' só com a conexão ativa (409 mp_nao_conectado) e a flag
//                                                            (403 mp_conta_em_teste); sair de QUALQUER MP pede o OK e desliga cada automática
//                                                            pela credencial dela (sem acesso → 409 mp_sem_acesso; o MP recusou/caiu → 502
//                                                            automaticas_nao_canceladas — nada muda); a guarda do modo → 409, nunca 500
//   prof_ip_testar          { conta_id, handle? }           W1: o "Testar" — link de R$ 1,00 sem webhook (não salva)
//   prof_chave_salvar       { conta_id, id?, tipo, chave, favorecido?, banco? }   W1: a chave Pix pela função (antes, direto do navegador)
//   prof_chave_ligar        { conta_id, id, ligar }         W1: 1 ligada por conta, numa transação (recebimento_chave_ligar)
//   prof_chave_excluir      { conta_id, id }
//   prof_mp_conectar        { conta_id, origem?: "site"|"apk", redirect_teste?: true }   W2: SÓ o dono de verdade (MENOR 19 — o master
//                                                            só na conta em que é dono) → { url } da autorização do MP: o state de uso único
//                                                            (10 min; só o sha256 em mp_conexoes) + o PKCE S256 (o verifier cifrado). Sem o
//                                                            id da conexão (I8). "apk" → { url do SITE, no_site } e nada criado (decisão 6:
//                                                            o fluxo inteiro no navegador). redirect_teste: só no staging (decisão 3)
//   prof_mp_confirmar       { conexao_id, confirmar? }      W2 (I8): sem confirmar → { apelido, teste } só para QUEM COMEÇOU (a pergunta
//                                                            da tela); com confirmar → recebimento_mp_confirmar COMO A PESSOA → { resultado:
//                                                            ok | conectado_sem_trocar, apelido, recebimento } (recusa: mp_<erro> 403/409)
//   prof_mp_desconectar     { conta_id, cancelar_automaticas? }   W2: as automáticas vivas (sem o OK → 409 automaticas_ativas) são
//                                                            desligadas ANTES (a recusa → 409/502 e nada muda) → o modo vira Pix (com chave
//                                                            ligada) ou "não cobrar" → a integração fica desconectada (o acesso fica 7 dias
//                                                            só para LER); fora do modo do MP da conta (MENOR 10) só marca desconectada
//   prof_mp_simular_conexao { conta_id, chave_publica? }    W2 — SÓ STAGING, só master (decisão 12): conecta com a credencial de TESTE da
//                                                            aplicação (teste_sem_oauth): prova a GRAVAÇÃO e os caminhos da conta — não o
//                                                            token de cada chamada (MENOR 16: quem prova é o --local)
// Referência externa: physiq:<schema>:aluno:<paciente_id>:<mensalidade|avulsa|recorrente>[:<cobranca_id>]; notification_url por
// cobrança → mp-webhook-aluno?schema=<schema> (a configuração global do app do MP, dos apps antigos, não muda); W2: no MP do personal, a do
// domínio próprio com &conta=<id> (mp-conta-regras.ts › notificacaoDaConta).
// verify_jwt = true. Publicar: scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions pagamentos-aluno true
// Segredos: MP_ACCESS_TOKEN_PROD (produção), MP_ACCESS_TOKEN_TEST (staging), MP_TEST_PAYER_EMAIL (+ os automáticos)
// + SUPABASE_ANON_KEY (automático: o cliente com a sessão de quem chama — W1); INFINITEPAY_API só no Deno local (o simulador).
// W2: MP_TOKENS_CHAVE (a cifra dos tokens do MP da conta — fora do banco), MP_CLIENT_ID + MP_CLIENT_SECRET (o OAuth; no staging, o par
// MP_CLIENT_ID_STAGING/MP_CLIENT_SECRET_STAGING quando existe — plano B do I6), MP_OAUTH_PKCE (opcional: "0" desliga o PKCE);
// MP_AUTH_BASE e MP_API_BASE só no Deno local (o simulador do MP em http://127.0.0.1:<porta>; publicado, qualquer outro valor é ignorado).
// hml-10 (H-24, H-26): log em JSON pelo _shared/log.ts — do Mercado Pago, só o status e os códigos (error, cause, status_detail),
// nunca o corpo; o título do aviso do sino (nome, valor) não vai para o log; o catch final avisa (log.excecao) e devolve o
// mesmo 500.
// hml-14 (H-32): um prazo por pedido (ORCAMENTO_MS.usuario) em toda ida ao MP; erro do banco lança (o catch final responde 500)
// nas leituras que alimentam a resposta e nas gravações que mudam a cobrança; o prof_resumo lê os alunos da conta em páginas e
// as cobranças em lotes de 150 alunos — a RESPOSTA não muda (o APK antigo usa). Antes o erro ou o corte calado de 1000 faziam a
// tela dizer "nenhum Pix a conferir" e zerar as cobranças abertas.
// W-P Task 8b (decisões do Weslley 10/10/2026): ponto 1 — os planos e os valores, só o dono e o master; ponto 2 — a troca do valor
// das automáticas em lote vai para a fila {schema}.automaticas_fila (automaticas_enfileirar + automaticas_disparar: o pg_net chama a
// automaticas-fila depois do commit; ela tenta de hora em hora e, na 24ª falha, avisa o dono); ponto 3 — o MP aceitou e o espelho
// não gravou → não avisa o dono (_shared/planos-automatica-mp.ts). O schema sem a fila (a rpc não existe) faz como antes.
// W1b (C1 da revisão da W2, 11/10/2026): o estorno, o cancelamento, o detalhe e a conferência pelo MP só valem para o pagamento DESTA
// cobrança (pagamentoDaLinha → pagamentoEDaCobranca: a referência que o nosso código gravou no pedido, o Calc antigo do mesmo aluno ou a
// automática da matrícula). O de outra coisa: prof_reembolsar, prof_cobranca_cancelar, detalhe_mp e simular_aprovacao → 409
// cobranca_de_outro_pagamento, sem ir ao MP; a conferência e o Pix antigo do aluno_mp_pix só vão ao log (o aluno_status não cai). A 1ª
// camada é a guarda do banco (20261011220000: o app não grava mais o MP da cobrança). Só lê o que já existe: vale com e sem a migration.
// W2 Task 7 (Mercado Pago do personal — plano 2026-10-11-w2-mp-personal.md): Configurações › Recebimento ganha o modo 'mercadopago_conta'
// e as 4 ações prof_mp_* acima. Cada caminho novo só liga com a migration 20261011210000 no schema (schemaTemW2 — a função é uma só para
// public e staging): sem ela, 409 w2_indisponivel e a vista com mercadopago_conta.disponivel false. A conexão grava COMO A PESSOA (a RPC
// recebimento_mp_confirmar — I8); o service_role só no que é do servidor (o state em mp_conexoes, a integração simulada, a marca da
// desconectada fora do modo). O token da conta em TODAS as chamadas do MP é a Task 9.
// W2 Task 9 — o token da conta em TODAS as chamadas do MP: cada ação escolhe a credencial e toda ida ao MP passa pelo `mp` (a do MP do Physiq
// pelo mpFetch de sempre; a da conta pelo mpContaFetch: 401 → /users/me com o MESMO token → renova → 1 nova tentativa — I2). O que CRIA (Pix,
// cartão, automática) usa a de pagar (credencialParaPagar: o MP do Physiq no 'mercadopago'; o da conta — só a conexão ativa — no
// 'mercadopago_conta'); o que JÁ existe usa a DELE, pelo collector (credencialDaCobranca/credencialDaAssinatura: escrita × leitura). As
// conferências de LEITURA (aluno_status, prof_aluno, aluno_mp_conferir, detalhe_mp) nunca derrubam a resposta (lerSemDerrubar — I3: a conexão
// caída ou o MP fora → log.aviso e a linha do banco); nas ações que criam/alteram, a conexão caída é 409 mp_conta_indisponivel (o catch final)
// e o MP sem decisão, 502 mp_error. A W1b fica: o pagamentoDaLinha confere também o recebedor na conta (o collector). A automática antiga viva
// é cancelada com a credencial DELA e conferida antes da nova (I11 — 409 assinatura_antiga_viva); a cobrança de cada mês tem a rede da busca
// (I1 — registrarCobrancasDaAutomatica no conferirAssinatura, os 2 MPs); o Pix aberto só se reaproveita na MESMA conta do MP; a conta sem chave
// Pix no MP → 400 mp_conta_sem_chave_pix + aviso ao dono (decisão 16); o cartão de outro mundo (sandbox no public) não é aplicado (MENOR 20); a
// coluna nova só pela regra (C2: colunasAssinatura, COLUNAS_COBRANCA_W2, collectorDaLinha); o I5 da W1 também na mensalidade do MP aguardando
// (decisão 15). Ficam no MP do Physiq: o aluno_app_plano e o cancelarAssinaturasDoAppEncerrado (a conta do app). Peças: ./mp-credencial.ts.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { criarLog, emSegundoPlano } from "../_shared/log.ts";
import { claimsDoJwt, emailDeTeste, origemPermitida } from "../_shared/login-regras.ts";
import { masterComAal } from "../_shared/master-regras.ts";
import {
  codigosDoMp, erroDeCartao, hojeSP, modoConfere, preapprovalDoPagamento, recusaDoSandbox, slugDaMensagem, type AssinaturaMp, type PagamentoMp,
} from "../_shared/cobranca-regras.ts";
import {
  DESCRITOR_FATURA, cabecalhosDoDevice, codigoDaRecusa, deviceDoPedido, infoAdicionalDoPedido, itemDoPedido, pagadorDoPedido, resultadoDoDevice,
} from "../_shared/mp-pagador-regras.ts";
import {
  MpIndisponivel, credencialDoSchema, mpFetch, schemaDaCredencialMp, tokenMp, type CredencialMp, type RespostaMp,
} from "../_shared/cobranca-mp.ts";
import {
  COMPROVANTE_MAX_BYTES,
  bucketComprovantes,
  caminhoComprovante,
  coberto,
  comprovanteDaMatricula,
  descricaoMensalidade,
  diaSP,
  ehMetodoPorFora,
  ehUuidFin,
  extensaoComprovante,
  lerReferenciaAluno,
  mesRefDe,
  mpEmAberto,
  pagamentoEDaCobranca,
  podeMexerNaCobranca,
  podeMexerNaMensalidade,
  podeVerCobranca,
  referenciaAluno,
  textoCurto,
  valorValido,
  vencimentoAPagar,
  type PapelNaMatricula,
  type Schema,
} from "../_shared/financeiro-regras.ts";
import {
  COLUNAS_COBRANCA,
  COLUNAS_COBRANCA_IP,
  COLUNAS_COBRANCA_W2,
  COLUNAS_PLANO,
  aplicarPagamentoMp,
  avisar,
  carregarMatricula,
  ehDoApp,
  espelhoAssinaturaAluno,
  linkDoAlunoNoPainel,
  recebedor,
  type Cobranca,
  type Matricula,
} from "../_shared/financeiro-mp.ts";
import {
  MODALIDADES, aceitaAutomatica, descricaoDoPagamento, ehModalidade, maxParcelasDoCartao, modalidadesDaConta, modalidadesOferecidas,
  modalidadesPermitidasNoPlano, parcelaMensal, parcelasValidas, planoCompleto, proximaParcela, retratoDoPlano, validarPlano, type Modalidade,
  type Parcela, type PlanoDoAluno,
} from "../_shared/planos-regras.ts";
import { textoDoAvisoDaFila, type ResultadoValor } from "../_shared/planos-automatica.ts";
import { trocarValorDaAutomatica, type TrocaDoValor } from "../_shared/planos-automatica-mp.ts";
import { cancelarAssinaturasDoAppEncerrado } from "../_shared/app-sem-profissional.ts";
import { emLotes, todasAsPaginas } from "../_shared/paginas.ts";
import { ORCAMENTO_MS, prazo } from "../_shared/tempo.ts";
import { POR_PAGINA, PaginaInvalida, lerPagina, paginaDasMensalidades, type AlunoDoResumo } from "./mensalidades.ts";
import { COLUNAS_CHAVE, chaveDoPedido } from "../_shared/pix-chave-regras.ts";
import {
  ehModoMp, erroDaConfirmacao, erroDaGuardaDoModo, lerPedidoDoRecebimento, modoDepoisDeDesconectar, recusaDoCancelamento,
} from "../_shared/recebimento-regras.ts";
import { chaveDoAmbiente, cifrar, dadoAssociado } from "../_shared/cifra-mp.ts";
import {
  ESTADO_MS, REDIRECT_TESTE_MP, desafioPkce, ehUuidMp, erroPixSemChave, novoSegredoUrl, redirectDoSchema, sha256Hex, urlDeAutorizacao,
} from "../_shared/mp-conta-regras.ts";
import {
  MpContaSemAcesso, avisarDonoDaConexao, cancelarAssinaturasPorCredencial, collectorDe, colunasAssinatura, comCollector, credencialDaAssinatura,
  credencialDaCobranca, credencialDaConta, integracaoMp, mpContaFetch, oauthDoAmbiente, pacientesComAutomaticaViva, pkceLigado,
  registrarCobrancasDaAutomatica, schemaTemW2, type ContextoMpConta,
} from "../_shared/mp-conta.ts";
import { collectorDaLinha, desligarAntiga, notificacaoDe, recebedorConfere, semDerrubar } from "./mp-credencial.ts";
import { centavos, descricaoDoLink, expiraEm, lerVolta, normalizarHandle, podeReaproveitar, urlDeVolta, urlDoWebhook } from "../_shared/infinitepay-regras.ts";
import { criarLink, pedidoDeTeste } from "../_shared/infinitepay.ts";
import {
  conferirAviso, conferirAvisosPendentes, conferirPeloPedido, fecharVencidas, linkDoPedido, novoLink, registrarAviso, schemaTemW1,
  type ContextoIp,
} from "../_shared/infinitepay-baixa.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
/** W1: só no Deno local (e2e/w1/servir_local.ts) — o simulador; publicado, a API de verdade (_shared/infinitepay.ts › baseDaApi). */
const IP_BASE = Deno.env.get("INFINITEPAY_API") ?? null;
/** W2: só no Deno local (o simulador do MP — e2e/w2/simulador_mp.py); publicado, a autorização da doc (mp-conta-regras › urlDeAutorizacao
 *  ignora qualquer valor que não seja http://127.0.0.1:<porta>). */
const MP_AUTH_BASE = Deno.env.get("MP_AUTH_BASE") ?? null;
const SCHEMAS: Schema[] = ["public", "staging"];
const SITE: Record<Schema, string> = { public: "https://physiqcalc.com.br", staging: "https://physiqcalc-staging.vercel.app" };
const PIX_HORAS = 72;
// W7b: dentro da janela do aviso (7 dias antes do fim da cobertura — o teste grátis do app inclusive) dá para pagar adiantado
// pelo Mercado Pago; a cobertura nova começa no fim da atual (a régua do Calc)
const JANELA_ADIANTAR_MS = 7 * 86_400_000;
const log = criarLog("pagamentos-aluno", { avisar: avisarErro });
// W-P: a função é uma só para public e staging — o que é dos planos só liga no schema que já tem a migration (o molde do
// COLUNAS_MATRICULA_W6). Guardado 60 s por schema nesta instância.
const PLANOS_NO_SCHEMA = new Map<Schema, { tem: boolean; em: number }>();

function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origemPermitida(origin) ? origin! : "https://physiqcalc.com.br",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-schema",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });
const erro = (codigo: string, status: number, origin: string | null, extra: Record<string, unknown> = {}) =>
  json({ ok: false, erro: codigo, ...extra }, status, origin);

// limite simples por pessoa (cada instância): 60 chamadas por minuto — a tela confere o Pix do MP a cada 5 s
const janela = new Map<string, number[]>();
function permitido(chave: string, max = 60, ms = 60_000): boolean {
  const agora = Date.now();
  const lista = (janela.get(chave) ?? []).filter((t) => agora - t < ms);
  if (lista.length >= max) return false;
  lista.push(agora);
  janela.set(chave, lista);
  return true;
}

class ErroAcao extends Error {
  constructor(public codigo: string, public http = 400, public extra: Record<string, unknown> = {}) {
    super(codigo);
  }
}
const falhar = (codigo: string, http = 400, extra: Record<string, unknown> = {}): never => {
  throw new ErroAcao(codigo, http, extra);
};

const simulado = (id: string | null | undefined) => !!id && id.startsWith("sim-");
const reais = (v: number) => `R$ ${Number(v).toFixed(2).replace(".", ",")}`;

/** O que a tela vê de uma cobrança (sem o QR do MP das antigas; o caminho do comprovante vira só "tem comprovante"). */
function vista(c: Cobranca, comQr = false) {
  return {
    id: c.id, paciente_id: c.paciente_id, tipo: c.tipo, descricao: c.descricao, valor: Number(c.valor), vencimento: c.vencimento,
    status: c.status, forma: c.forma, metodo: c.metodo, mes_ref: c.mes_ref, pago_em: c.pago_em, enviado_em: c.enviado_em,
    cobre_de: c.cobre_de, cobre_ate: c.cobre_ate, comprovante: !!c.comprovante_path, comprovante_pdf: /\.pdf$/i.test(c.comprovante_path || ""),
    recusado_motivo: c.recusado_motivo, recusado_em: c.recusado_em, reembolsado_em: c.reembolsado_em, mp_status: c.mp_status,
    mp: !!c.mp_payment_id, mp_simulado: simulado(c.mp_payment_id), transacao_id: c.transacao_id,
    pix_qr: comQr ? c.pix_qr : null, pix_copia_cola: comQr ? c.pix_copia_cola : null, pix_expira_em: c.pix_expira_em,
    criado_por: c.criado_por, confirmado_em: c.confirmado_em, created_at: c.created_at,
    // W1: a tentativa e o recibo da InfinitePay (nulos no schema sem a migration); a InfiniteTag, o NSU e o slug ficam no servidor
    ip_link: c.status === "aguardando_confirmacao" && c.forma === "infinitepay" ? c.ip_link_url ?? null : null,
    ip_expira_em: c.ip_expira_em ?? null, ip_recibo_url: c.ip_recibo_url ?? null, ip_parcelas: c.ip_parcelas ?? null, ip_meio: c.ip_meio ?? null,
  };
}

/** A ordem do .order("enviado_em", { ascending: true }) do PostgREST: o envio mais antigo primeiro; sem data por último. */
function porEnvio(a: Pick<Cobranca, "enviado_em">, b: Pick<Cobranca, "enviado_em">): number {
  const ta = a.enviado_em ? Date.parse(a.enviado_em) : NaN;
  const tb = b.enviado_em ? Date.parse(b.enviado_em) : NaN;
  if (Number.isNaN(ta)) return Number.isNaN(tb) ? 0 : 1;
  if (Number.isNaN(tb)) return -1;
  return ta - tb;
}

/** Detalhe de um pagamento do Mercado Pago (só o que o comprovante em PDF usa). */
interface PagamentoMpDetalhe {
  status?: string | null;
  status_detail?: string | null;
  date_approved?: string | null;
  payment_method_id?: string | null;
  payment_type_id?: string | null;
  payer?: { email?: string | null } | null;
  card?: { cardholder?: { name?: string | null } | null; last_four_digits?: string | null } | null;
  point_of_interaction?: { transaction_data?: { bank_info?: { payer?: { long_name?: string | null } | null } | null; e2e_id?: string | null } | null } | null;
}

/** Linha de aluno do prof_resumo. */
interface LinhaAlunoResumo {
  id: string;
  treino_user_id: string | null;
  nome: string;
  email: string | null;
  ativo: boolean;
  personal_id: string | null;
  nutricionista_id: string | null;
  mensalidade_valor: number | string | null;
  cobranca_pausada: boolean;
  mensalidade_pago_ate: string | null;
  mensalidade_desde: string | null;
  /** W-P — ausente no schema sem a migration */
  plano_modalidade?: string | null;
  plano: { nome: string; meses?: number } | null;
}

Deno.serve(async (req) => {
  // hml-14 (H-32): o prazo do pedido inteiro — vai em toda ida ao MP (aqui o nome não é `p`: `p` é o papel na matrícula)
  const prazoDoPedido = prazo(ORCAMENTO_MS.usuario);
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return erro("metodo", 405, origin);
  const schema = (req.headers.get("x-schema") || "public").toLowerCase() as Schema;
  if (!SCHEMAS.includes(schema)) return erro("schema_invalido", 400, origin);
  const credencial = credencialDoSchema(schema);

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return erro("missing_auth", 401, origin);
  const authAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: u, error: eu } = await authAdmin.auth.getUser(auth.slice(7));
  if (eu || !u?.user) return erro("invalid_token", 401, origin);
  const user = u.user;
  const email = String(user.email || "").trim().toLowerCase();
  if (schema === "staging" && !emailDeTeste(email)) return erro("conta_real_no_staging", 403, origin);
  if (!permitido(`${schema}:${user.id}`)) return erro("rate_limited", 429, origin);
  // hml-22 (H-22): o poder de master daqui segue a regra do banco (master_aal_ok) — com fator verificado, só com o token aal2. Em
  // aal1 ele vira a pessoa comum aqui (age como dono da conta dele), sem recusa; os fatores vêm do getUser acima (fresco)
  const ehMaster = (user.app_metadata as Record<string, unknown> | undefined)?.role === "master"
    && masterComAal(user.factors, claimsDoJwt(auth.slice(7))?.aal);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const acao = String(body.acao || "");
  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
  // W1 (jeito 2, combinado com a hml-19): o Recebimento grava COMO A PESSOA — o RLS de recebimento_chaves e de contas e a guarda
  // contas_guard valem de 2ª camada; o service_role segue no que já era dele (cobrança, aluno, MP) e na leitura da integração
  const dbPessoa = createClient(SUPABASE_URL, ANON, {
    db: { schema: schema as "public" }, global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const ctxIp = (): ContextoIp => ({ schema, log, prazo: prazoDoPedido, ip: { base: IP_BASE } });
  // W2: o contexto do MP DA CONTA — a chave da cifra (MP_TOKENS_CHAVE) e o client do OAuth vêm do ambiente. É um GETTER: só o caminho da
  // conta o chama (o MP do Physiq não precisa da chave). Sem a chave → MpContaSemAcesso("nao_configurado"), e não um falhar(503): dentro
  // do cancelarAssinaturasPorCredencial o 503 subiria DEPOIS de o grupo do MP do Physiq já cancelado; assim a conta conta como semAcesso
  // (409 mp_sem_acesso) e a leitura da Task 9 não derruba a tela (lerSemDerrubar). A ação que PRECISA da chave (conectar, simular)
  // responde 503 antes, pelo nome. O log.erro avisa o Weslley (1× por pedido): é configuração faltando.
  const chaveMp = await chaveDoAmbiente();
  let avisouSemChave = false;
  const ctxMp = (): ContextoMpConta => {
    if (!chaveMp) {
      if (!avisouSemChave) log.erro({ codigo: "mp_tokens_chave_ausente", schema, acao });
      avisouSemChave = true;
      throw new MpContaSemAcesso("-", "nao_configurado");
    }
    return { schema, log, prazo: prazoDoPedido, chave: chaveMp, oauth: oauthDoAmbiente(schema) };   // no staging, o client de teste se houver (I6)
  };
  /** W2 (Task 9): TODA ida ao MP desta função com uma credencial já escolhida passa por aqui — a do MP do Physiq pelo mpFetch de sempre (o
   *  prazo do pedido); a da conta do personal pelo mpContaFetch (o 401 confere no /users/me com o MESMO token antes de renovar — I2 — e o token
   *  novo passa para a `cred`: o MESMO objeto em todas as idas de uma ação). O ctxMp() (que exige a MP_TOKENS_CHAVE) só no caminho da conta: o
   *  MP do Physiq segue sem ela. De fora, de propósito: o aluno_app_plano (a conta do app = o MP do Physiq) e o /users/me do
   *  prof_mp_simular_conexao (a credencial de teste da aplicação). */
  const mp = <T = Record<string, unknown>>(cred: CredencialMp, caminho: string, init: RequestInit = {}): Promise<RespostaMp<T>> =>
    typeof cred === "string" ? mpFetch<T>(cred, caminho, init, { prazo: prazoDoPedido }) : mpContaFetch<T>(db, ctxMp(), cred, caminho, init);
  /** I3 (revisão da W2): a ida ao MP que NÃO derruba a resposta — as conferências de LEITURA (aluno_status, prof_aluno, aluno_mp_conferir,
   *  detalhe_mp) e o melhor esforço (o Pix antigo do aluno_mp_pix, o I5 do prof_registrar): a conexão do personal caída (MpContaSemAcesso —
   *  inclusive sem a MP_TOKENS_CHAVE) ou o MP fora (MpIndisponivel) → log.aviso e `doBanco` (a linha do banco). Erro do banco lança (o 500 de
   *  sempre). O 409 mp_conta_indisponivel fica só nas ações que criam/alteram (o catch final). */
  const lerSemDerrubar = <T>(ref: string, ler: () => Promise<T>, doBanco: T, codigo = "mp_conferir_sem_mp"): Promise<T> =>
    semDerrubar(ler, doBanco, (resultado) => log.aviso({ codigo, schema, acao, ref, resultado }));
  /** W2: a flag do MP da conta (app_config 'mercadopago_conta' {liberada}): o personal só vê a opção com ela ligada; o master sempre. */
  const mpContaLiberada = async (): Promise<boolean> => {
    if (ehMaster) return true;
    const { data, error } = await db.from("app_config").select("valor").eq("chave", "mercadopago_conta").maybeSingle();
    if (error) throw error;
    return (data as { valor: { liberada?: unknown } | null } | null)?.valor?.liberada === true;
  };
  const storage = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const bucket = bucketComprovantes(schema);
  const hoje = hojeSP();
  /** Quem paga no MP: no staging (o MP de teste — o do Physiq ou a conta de teste do personal) o comprador de teste; na produção, o aluno.
   *  W2 (MENOR 28): pela credencial da ação, não pelo "test" do Physiq. (A notification_url sai do notificacaoDe — ./mp-credencial.ts.) */
  const pagadorDe = (cred: CredencialMp) => (schemaDaCredencialMp(cred) === "staging" ? (Deno.env.get("MP_TEST_PAYER_EMAIL") || email) : email);

  // ───────────────────────── ajudantes (com o db do schema) ─────────────────────────

  /** W1: as colunas da cobrança + as da InfinitePay no schema que já tem a migration (o public antes dela lê as de sempre). W2 (C2): + a
   *  mp_collector_id no schema com a migration da W2 (a credencialDaCobranca escolhe o token pelo collector da linha; sem ele, tudo seria o MP
   *  do Physiq). A W2 vem depois da W1 nos 2 schemas (a migration dela muda a recebimento_integracoes da W1). */
  const colunasCobranca = async () =>
    (await schemaTemW2(db, schema)) ? COLUNAS_COBRANCA_W2 : (await schemaTemW1(db, schema)) ? COLUNAS_COBRANCA_IP : COLUNAS_COBRANCA;

  const buscarCobranca = async (id: unknown): Promise<Cobranca> => {
    if (!ehUuidFin(id)) falhar("cobranca_invalida");
    const { data, error } = await db.from("cobrancas").select(await colunasCobranca()).eq("id", id as string).is("deleted_at", null).maybeSingle();
    if (error) throw error;
    if (!data) falhar("cobranca_inexistente", 404);
    return data as unknown as Cobranca;
  };

  /** W1: a cobrança mesmo apagada — a tentativa vencida da InfinitePay sai do histórico, mas a baixa atrasada e a volta ainda a acham. */
  const cobrancaComApagada = async (id: unknown): Promise<Cobranca> => {
    if (!ehUuidFin(id)) falhar("cobranca_invalida");
    const { data, error } = await db.from("cobrancas").select(await colunasCobranca()).eq("id", id as string).maybeSingle();
    if (error) throw error;
    if (!data) falhar("cobranca_inexistente", 404);
    return data as unknown as Cobranca;
  };

  /** A matrícula do aluno logado (a pedida, ou a 1ª ativa). */
  const minhaMatricula = async (pacienteId: unknown): Promise<Matricula> => {
    let id = ehUuidFin(pacienteId) ? String(pacienteId) : null;
    if (!id) {
      const { data, error } = await db.from("pacientes").select("id").eq("user_id", user.id).is("deleted_at", null).eq("ativo", true)
        .order("created_at").limit(1);
      if (error) throw error; // hml-14: o erro virava 404 sem_matricula
      id = ((data ?? []) as Array<{ id: string }>)[0]?.id ?? null;
    }
    if (!id) falhar("sem_matricula", 404);
    const m = await carregarMatricula(db, id!);
    if (!m || m.user_id !== user.id || m.deleted_at) falhar("sem_matricula", 404);
    return m!;
  };

  /** Papel de quem chama na matrícula (spec 4.1): master, dono da conta, responsável de treino/nutrição (com o papel). */
  const papelNa = async (m: Matricula): Promise<PapelNaMatricula> => {
    if (ehMaster) return { master: true, dono: true, responsavel: true, userId: user.id };
    if (!m.conta_id) {
      // aluno do site antigo sem conta: a nutricionista dona do registro
      const dona = m.nutricionista_id === user.id;
      return { master: false, dono: dona, responsavel: dona, userId: user.id };
    }
    const { data } = await db.from("conta_membros").select("papeis, status").eq("conta_id", m.conta_id).eq("user_id", user.id)
      .eq("status", "ativo").maybeSingle();
    const papeis = ((data as { papeis: string[] } | null)?.papeis ?? []) as string[];
    const dono = papeis.includes("dono");
    const responsavel = (m.personal_id === user.id && papeis.includes("personal")) || (m.nutricionista_id === user.id && papeis.includes("nutricionista"));
    return { master: false, dono, responsavel: dono || responsavel, userId: user.id };
  };

  /** O aluno do painel pelo id da rota (matrícula ou Treino), numa conta que quem chama vê. */
  const matriculaDoPainel = async (aluno: unknown): Promise<{ m: Matricula; p: PapelNaMatricula }> => {
    if (!ehUuidFin(aluno)) falhar("aluno_invalido");
    const { data, error } = await db.from("pacientes").select("id, conta_id").or(`id.eq.${aluno},treino_user_id.eq.${aluno}`)
      .is("deleted_at", null).order("ativo", { ascending: false }).order("created_at");
    if (error) throw error;
    const lista = (data ?? []) as Array<{ id: string; conta_id: string | null }>;
    for (const linha of lista) {
      const m = await carregarMatricula(db, linha.id);
      if (!m) continue;
      const p = await papelNa(m);
      if (p.master || p.dono || p.responsavel) return { m, p };
    }
    return falhar(lista.length ? "sem_permissao" : "aluno_inexistente", lista.length ? 403 : 404);
  };

  const exigirMensalidade = (p: PapelNaMatricula) => {
    if (!podeMexerNaMensalidade(p)) falhar("so_o_dono", 403);
  };

  const schemaTemPlanos = async (): Promise<boolean> => {
    const guardado = PLANOS_NO_SCHEMA.get(schema);
    if (guardado && Date.now() - guardado.em < 60_000) return guardado.tem;
    const { error } = await db.from("planos_aluno").select("meses").limit(1);
    if (error && !/column|coluna|does not exist|42703|PGRST20/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) throw error;
    PLANOS_NO_SCHEMA.set(schema, { tem: !error, em: Date.now() });
    return !error;
  };
  /** A matrícula veio com as colunas da W-P (o schema tem a migration)? */
  const temPlanos = (m: Matricula) => m.plano_modalidade !== undefined;

  /** Papel de quem chama na CONTA (a tela de Planos): master, dono, membro. */
  const papelNaConta = async (contaId: string) => {
    if (ehMaster) return { master: true, dono: true, membro: true };
    const { data, error } = await db.from("conta_membros").select("papeis").eq("conta_id", contaId).eq("user_id", user.id).eq("status", "ativo").maybeSingle();
    if (error) throw error;
    const papeis = ((data as { papeis: string[] } | null)?.papeis ?? []) as string[];
    return { master: false, dono: papeis.includes("dono"), membro: !!data };
  };

  /** A conta da tela de Planos: o modo de receber e se é a conta do app (os 2 planos do app são do master — B2). */
  const contaDosPlanos = async (contaId: unknown, exigirDono: boolean) => {
    if (!ehUuidFin(contaId)) falhar("conta_invalida");
    if (!(await schemaTemPlanos())) falhar("planos_indisponivel", 409);
    const papel = await papelNaConta(String(contaId));
    if (!papel.membro) falhar("sem_permissao", 403);
    if (exigirDono && !papel.master && !papel.dono) falhar("so_o_dono", 403);
    const { data, error } = await db.from("contas").select("id, recebimento_modo, origem").eq("id", String(contaId)).maybeSingle();
    if (error) throw error;
    if (!data) falhar("conta_invalida", 404);
    const c = data as { id: string; recebimento_modo: string | null; origem: string | null };
    if (exigirDono && c.origem === "app") falhar("conta_do_app", 403);
    return { id: c.id, modo: c.recebimento_modo ?? "pix_manual", app: c.origem === "app", papel };
  };

  /** Task 8b: o schema ainda não tem a fila (o public antes da migration): a rpc não existe → o caminho de antes, sem quebrar. */
  const semAFila = (e: { code?: unknown; message?: unknown } | null) =>
    /^(PGRST202|42883)$/.test(String(e?.code ?? "")) || /could not find the function|function .* does not exist/i.test(String(e?.message ?? ""));

  /** Task 8b (ponto 2): põe os alunos na fila das automáticas → quantos ficaram pendentes; null = o schema não tem a fila. */
  const enfileirarAutomaticas = async (ids: string[], motivo: "plano" | "aluno"): Promise<number | null> => {
    if (!ids.length) return 0;
    const { data, error } = await db.rpc("automaticas_enfileirar", { p_pacientes: ids, p_motivo: motivo });
    if (error && semAFila(error)) return null;
    if (error) throw error;
    return Number(data) || 0;
  };

  /** A fila sai depois do commit (pg_net → automaticas-fila). Falhou: o pg_cron de hora em hora pega — só registra. */
  const dispararAutomaticas = async () => {
    const { error } = await db.rpc("automaticas_disparar");
    if (error) log.excecao(error, { codigo: "automaticas_disparar_falhou", schema, acao });
  };

  /** I1: o valor do próximo pagamento mudou e a automática está ligada → PUT no MP, na hora (1 aluno; o ponto 3 está no
   *  planos-automatica-mp.ts). Falhou → Task 8b (ponto 2): a fila tenta de hora em hora, sem aviso agora ("na_fila"); o schema sem a
   *  fila (ou a fila que não gravou) → o aviso ao dono de antes. */
  const sincronizarAutomatica = async (m: Matricula): Promise<ResultadoValor | "na_fila"> => {
    const a = await assinaturaDe(m.id);
    // W2: o PUT do valor com a credencial DESTA automática (escrita — o collector), só quando ela vai ao MP (viva e de verdade: o corte do
    // novoValorDaAutomatica). Sem acesso a ela (outra conta do MP, a desconectada, a conexão caída) = o "falhou" de sempre: a fila tenta de hora
    // em hora com a credencial certa (automaticas-fila) e, no fim, avisa o dono — a gravação do plano do aluno já aconteceu, não vira 409
    const vaiAoMp = a?.status === "authorized" && !!a.mp_preapproval_id && !simulado(a.mp_preapproval_id) && a.payload?.simulada !== true;
    const cred = vaiAoMp
      ? await credencialDaAssinatura(db, ctxMp, a!, credencial, { escrita: true }).catch((e) => {
        if (e instanceof MpContaSemAcesso) return null;
        throw e;
      })
      : credencial;
    const t: TrocaDoValor = cred ? await trocarValorDaAutomatica(db, cred, a, Number(m.mensalidade_valor), { prazo: prazoDoPedido, log, schema, acao })
      : { resultado: "falhou", status: null, externo: {} };
    if (t.resultado !== "falhou") return t.resultado;
    let naFila: number | null = null;
    try {
      naFila = await enfileirarAutomaticas([m.id], "aluno");
    } catch (e) {
      log.excecao(e, { codigo: "automaticas_enfileirar_falhou", schema, acao, ref: m.id });
    }
    if (naFila) {
      log.aviso({ codigo: "mp_valor_assinatura_na_fila", schema, acao, ref: a?.id ?? m.id, status: t.status, externo: t.externo });
      return "na_fila";
    }
    log.erro({ codigo: "mp_valor_assinatura_falhou", schema, acao, ref: a?.id ?? m.id, status: t.status, externo: t.externo });
    await avisar(db, recebedor(m), "geral", textoDoAvisoDaFila([m.nome]), linkDoAlunoNoPainel(m), log, schema);
    return "falhou";
  };

  /** I1 em lote: quem segue o plano (sem negociado) depois que o dono salvou o plano — o gatilho já mudou o valor de cada um. Task 8b
   *  (ponto 2): só quem tem automática (a fila lê a assinatura mais recente de cada um) vai para a fila e o pg_net chama a
   *  automaticas-fila depois do commit → { enfileiradas }. O schema sem a fila: a troca na hora de antes (até 200 alunos). */
  const sincronizarAutomaticasDoPlano = async (planoId: string) => {
    const ids = (await todasAsPaginas<{ id: string }>((de, ate) =>
      db.from("pacientes").select("id").eq("plano_aluno_id", planoId).not("plano_modalidade", "is", null)
        .is("plano_valor_negociado", null).is("deleted_at", null).order("id").range(de, ate))).map((r) => r.id);
    const comAutomatica = await emLotes(ids, 150, async (lote) => {
      const { data, error } = await db.from("aluno_assinaturas").select("paciente_id").in("paciente_id", lote).in("status", ["authorized", "pending", "paused"]);
      if (error) throw error;
      return ((data ?? []) as Array<{ paciente_id: string }>).map((r) => r.paciente_id);
    });
    const naFila = await enfileirarAutomaticas([...new Set(comAutomatica)], "plano");
    if (naFila !== null) {
      if (naFila > 0) await dispararAutomaticas();
      return { enfileiradas: naFila };
    }
    let atualizadas = 0;
    let falharam = 0;
    for (const id of ids.slice(0, 200)) {
      const m = await carregarMatricula(db, id);
      if (!m) continue;
      const r = await sincronizarAutomatica(m);
      if (r === "atualizada") atualizadas++;
      if (r === "falhou") falharam++;
    }
    return { atualizadas, falharam };
  };

  /** Trocar para o período todo desliga a automática (§4.4) — com o OK de quem troca; o aluno é avisado. */
  const cancelarAutomatica = async (m: Matricula, a: NonNullable<Awaited<ReturnType<typeof assinaturaDe>>>) => {
    if (a.mp_preapproval_id && !simulado(a.mp_preapproval_id)) {
      // W2: com a credencial DESTA automática (escrita — o collector): outra conta do MP ou a desconectada → 409 mp_outra_conta (o Physiq não
      // alcança; nada muda: quem chama ainda não trocou o plano); a conexão caída → 409 mp_conta_indisponivel (o catch final)
      const cred = await credencialDaAssinatura(db, ctxMp, a, credencial, { escrita: true });
      if (!cred) falhar("mp_outra_conta", 409);
      const { status: sc, body: pre } = await mp<AssinaturaMp>(cred!, `/preapproval/${encodeURIComponent(a.mp_preapproval_id)}`, {
        method: "PUT", body: JSON.stringify({ status: "cancelled" }),
      });
      if (sc >= 300 || !pre?.id) {
        log.erro({ codigo: "mp_cancelar_assinatura_falhou", schema, acao, ref: a.id, status: sc, externo: codigosDoMp(pre) });
        falhar("mp_error", 502, { status_mp: sc });
      }
      const { error } = await db.from("aluno_assinaturas").update(espelhoAssinaturaAluno(pre!, { ...(a.payload ?? {}), cancelada_por: user.id, motivo: "plano_periodo" })).eq("id", a.id);
      if (error) throw error;
    } else {
      const { error } = await db.from("aluno_assinaturas").update({ status: "cancelled" }).eq("id", a.id);
      if (error) throw error;
    }
    await avisar(db, m.user_id, "geral", "Seu plano mudou: a cobrança automática no cartão foi desligada. Veja em Pagamentos.", "/perfil/pagamentos", log, schema);
  };

  // ───────────────────────── W1 — Configurações › Recebimento (jeito 2) ─────────────────────────

  /** A conta da tela de Recebimento: só o dono e o master (a aba é soDono — catalogoAbas.ts). Lida COMO A PESSOA. */
  const contaDoRecebimento = async (contaId: unknown) => {
    if (!ehUuidFin(contaId)) falhar("conta_invalida");
    const papel = await papelNaConta(String(contaId));
    if (!papel.master && !papel.dono) falhar("so_o_dono", 403);
    const { data, error } = await dbPessoa.from("contas").select("id, nome, origem, recebimento_modo, bloquear_app_inadimplente")
      .eq("id", String(contaId)).maybeSingle();
    if (error) throw error;
    if (!data) falhar("conta_invalida", 404);
    const c = data as { id: string; nome: string; origem: string; recebimento_modo: string; bloquear_app_inadimplente: boolean };
    return { id: c.id, nome: c.nome, origem: c.origem, modo: c.recebimento_modo, bloquear: c.bloquear_app_inadimplente };
  };
  type ContaDoRecebimento = Awaited<ReturnType<typeof contaDoRecebimento>>;

  /** A flag da InfinitePay (app_config 'infinitepay' {liberada}): o personal só vê a opção com ela ligada; o master sempre. */
  const infinitepayLiberada = async (): Promise<boolean> => {
    if (ehMaster) return true;
    const { data, error } = await db.from("app_config").select("valor").eq("chave", "infinitepay").maybeSingle();
    if (error) throw error;
    return (data as { valor: { liberada?: unknown } | null } | null)?.valor?.liberada === true;
  };

  /** A InfiniteTag da conta (null sem a W1 no schema ou sem integração). Service_role: a tabela não tem grant para o app. */
  const integracaoIp = async (contaId: string) => {
    if (!(await schemaTemW1(db, schema))) return null;
    const { data, error } = await db.from("recebimento_integracoes").select("infinitepay_handle, status, testado_em")
      .eq("conta_id", contaId).eq("provedor", "infinitepay").maybeSingle();
    if (error) throw error;
    return (data as { infinitepay_handle: string; status: string; testado_em: string | null } | null) ?? null;
  };

  /** O que a tela mostra, numa chamada: a conta, as chaves Pix (COMO A PESSOA), a InfinitePay e o MP da conta (W2). */
  const recebimentoVista = async (c: ContaDoRecebimento) => {
    const { data: chaves, error } = await dbPessoa.from("recebimento_chaves").select(COLUNAS_CHAVE).eq("conta_id", c.id).order("criado_em");
    if (error) throw error;
    const ip = await integracaoIp(c.id);
    // W2: a integração SEM token (integracaoMp) e só os campos da tela; sem a migration no schema, indisponível. A conta do app é o MP do
    // Physiq: o MP da conta nunca é oferecido nela (o prof_mp_conectar recusa conta_do_app)
    const w2 = await schemaTemW2(db, schema);
    const mp = w2 ? await integracaoMp(db, c.id) : null;
    return {
      ok: true, master: ehMaster, pode_editar: ehMaster || c.origem !== "app",
      conta: { id: c.id, nome: c.nome, origem: c.origem, modo: c.modo, bloquear: c.bloquear },
      chaves: chaves ?? [],
      mp_liberado: ehMaster || c.modo === "mercadopago",
      infinitepay: {
        disponivel: (await schemaTemW1(db, schema)) && (await infinitepayLiberada()),
        handle: ip?.infinitepay_handle ?? null, status: ip?.status ?? null, testado_em: ip?.testado_em ?? null,
      },
      mercadopago_conta: {
        disponivel: w2 && c.origem !== "app" && (await mpContaLiberada()),
        status: mp?.status ?? null, apelido: mp?.mp_apelido ?? null, expira_em: mp?.mp_expira_em ?? null, erro: mp?.mp_erro ?? null,
        conectado_em: mp?.conectado_em ?? null, chave_publica: !!mp?.mp_public_key, teste: mp?.mp_teste ?? null,
      },
    };
  };

  /** O id de quem chama em conta_membros (a chave nova guarda o membro que cadastrou, como a tela fazia; master de fora = null). */
  const meuMembroId = async (contaId: string): Promise<string | null> => {
    const { data, error } = await db.from("conta_membros").select("id").eq("conta_id", contaId).eq("user_id", user.id).eq("status", "ativo").maybeSingle();
    if (error) throw error;
    return (data as { id: string } | null)?.id ?? null;
  };

  // W2: as matrículas com cobrança automática viva na conta vêm do pacientesComAutomaticaViva (_shared/mp-conta.ts — o ajudante da W1,
  // movido para lá na Task 4: pelos PACIENTES da conta, MENOR 6 da revisão da W1).

  /** W2 (MENOR 10): as automáticas vivas NESTA conta do MP (o collector da integração), dos alunos da conta — o desconectar fora do modo do
   *  MP da conta só desliga estas (as do MP do Physiq seguem com o modo). Só depois do schemaTemW2 (a regra da coluna nova — C2). */
  const automaticasNaContaDoMp = async (contaId: string, collector: number): Promise<string[]> => {
    const linhas = await todasAsPaginas<{ paciente_id: string }>((de, ate) =>
      db.from("aluno_assinaturas").select("paciente_id, pacientes!inner(conta_id)").eq("pacientes.conta_id", contaId)
        .eq("mp_collector_id", collector) // W2: depois do schemaTemW2
        .in("status", ["authorized", "pending", "paused"]).order("paciente_id").range(de, ate));
    return [...new Set(linhas.map((l) => l.paciente_id))];
  };

  /** W2: desliga as automáticas vivas, cada uma com a credencial DELA (cancelarAssinaturasPorCredencial — nunca lança por causa do MP:
   *  { canceladas, falhas, semAcesso }) e avisa SÓ quem de fato ficou sem a automática: com recusa, um 2º olhar no banco tira do aviso quem
   *  segue com ela viva (o que o MP recusou ou não alcançou). Quem chama decide pela recusaDoCancelamento (409/502 — nada mais muda). */
  const desligarAutomaticas = async (contaId: string, ids: string[], motivo: string) => {
    const r = await cancelarAssinaturasPorCredencial(db, { schema, log, prazo: prazoDoPedido }, ctxMp, credencial, ids, motivo);
    const vivas = new Set(r.falhas || r.semAcesso ? await pacientesComAutomaticaViva(db, contaId) : []);
    if (r.falhas) log.erro({ codigo: "automaticas_nao_canceladas", schema, acao, ref: contaId, n: r.falhas });
    if (r.semAcesso) log.aviso({ codigo: "automaticas_sem_acesso", schema, acao, ref: contaId, n: r.semAcesso });
    const alunos = await emLotes(ids.filter((id) => !vivas.has(id)), 150, async (lote) => {
      const { data, error } = await db.from("pacientes").select("user_id").in("id", lote);
      if (error) throw error;
      return (data ?? []) as Array<{ user_id: string | null }>;
    });
    for (const a of alunos) {
      await avisar(db, a.user_id, "geral", "Seu profissional mudou a forma de receber: a cobrança automática no cartão foi desligada. Veja em Pagamentos.",
        "/perfil/pagamentos", log, schema);
    }
    return r;
  };

  /** MENOR 19: o dono DE VERDADE (o sou_dono do banco: membro ativo com o papel dono) — SEM o atalho do master do papelNaConta. O MP da conta
   *  só o dono liga: o master só na conta em que é dono (senão ligaria o MP DELE na conta de um personal). */
  const donoDeVerdade = async (contaId: string): Promise<boolean> => {
    const { data, error } = await db.from("conta_membros").select("papeis").eq("conta_id", contaId).eq("user_id", user.id).eq("status", "ativo").maybeSingle();
    if (error) throw error;
    return (((data as { papeis: string[] } | null)?.papeis ?? []) as string[]).includes("dono");
  };

  /** W2: a conta de uma conexão do OAuth (mp_conexoes — só o servidor lê), para a vista depois da confirmação. */
  const contaDaConexao = async (conexaoId: string): Promise<string> => {
    const { data, error } = await db.from("mp_conexoes").select("conta_id").eq("id", conexaoId).maybeSingle();
    if (error) throw error;
    const contaId = (data as { conta_id: string } | null)?.conta_id;
    if (!contaId) return falhar("mp_invalido", 409);
    return contaId;
  };

  const statusDoErroDaRpc = (codigo: string) =>
    ["so_o_dono", "conta_do_app", "infinitepay_em_teste"].includes(codigo) ? 403 : codigo === "em_uso" ? 409 : 400;

  /** Um link na InfinitePay ou o erro dela traduzido:
   *  · o checkout desligado vem antes de tudo. Sondado em 11/10: é a MESMA resposta da InfiniteTag que não existe (o 404
   *    external_checkout_not_enabled); a Task 3 devolve erro "checkout_desligado" + o link de ativar, e a tela mostra os 2;
   *  · 4xx = não aceitou (aviso no log); 5xx, 429, rede ou tempo = fora do ar (erro). */
  const linkOuFalha = async (pedido: Parameters<typeof criarLink>[0], ref: string): Promise<string> => {
    const r = await criarLink(pedido, { prazo: prazoDoPedido, base: IP_BASE });
    if (r.url) return r.url;
    if (r.erro === "checkout_desligado") {
      log.aviso({ codigo: "ip_checkout_desligado", schema, acao, ref, status: r.status });
      return falhar("infinitepay_checkout_desligado", 400, { ativar: r.ativar });
    }
    const fora = r.status >= 500 || r.status === 429;
    if (fora) log.erro({ codigo: "ip_link_falhou", schema, acao, ref, status: r.status });
    else log.aviso({ codigo: "ip_link_recusado", schema, acao, ref, status: r.status });
    return falhar(fora ? "infinitepay_indisponivel" : "infinitepay_recusou", fora ? 502 : 400);
  };

  /** `semAFila` também diz "a RPC não existe neste schema" (o public antes da migration). */
  const semARpc = semAFila;

  const chaveAtiva = async (contaId: string | null) => {
    if (!contaId) return null;
    const { data, error } = await db.from("recebimento_chaves").select("id, tipo, chave, favorecido, banco").eq("conta_id", contaId).eq("ativa", true).maybeSingle();
    if (error) throw error; // hml-14: o erro virava "sem chave Pix" (e o aluno_avisar_pix recusava com 400)
    return (data as { id: string; tipo: string; chave: string; favorecido: string | null; banco: string | null } | null) ?? null;
  };

  // hml-06 (H-20): sem ler a assinatura atual não se segue — o erro de banco virava "não tem" e o aluno_mp_assinar criava OUTRA
  // sem cancelar a atual (o aluno pagava 2×); agora vira 500 erro_interno ANTES de qualquer POST ao MP
  // W2 (C2): as colunas pelo colunasAssinatura — a do collector (QUAL conta do MP: a credencialDaAssinatura escolhe o token por ela) só com a
  // W2 no schema (sem ela, o select com a coluna dava 42703: todo aluno_status do public em 500 entre a Task 14 e a 22)
  const assinaturaDe = async (pacienteId: string) => {
    const { data, error } = await db.from("aluno_assinaturas").select(await colunasAssinatura(db, schema))
      .eq("paciente_id", pacienteId).order("criado_em", { ascending: false }).limit(1);
    if (error) throw error;
    return ((data ?? []) as unknown as Array<{ id: string; paciente_id: string; conta_id: string | null; mp_preapproval_id: string | null; status: string;
      valor: number | null; proximo_vencimento: string | null; payload: Record<string, unknown> | null; criado_em: string;
      mp_collector_id?: number | string | null }>)[0] ?? null; // W2: depois do schemaTemW2
  };

  const nomeDe = async (uid: string | null | undefined): Promise<string | null> => {
    if (!uid) return null;
    const { data, error } = await db.from("profiles").select("nome, email").eq("id", uid).maybeSingle();
    if (error) throw error; // hml-14: o nome do profissional sumia do Pagamentos
    const r = data as { nome: string | null; email: string | null } | null;
    return (r?.nome || "").trim() || r?.email || null;
  };

  /** W1b: as automáticas da matrícula (aluno_assinaturas — só o servidor grava): o pagamento delas sem a referência nova vale por elas. */
  const preapprovalsDe = async (pacienteId: string): Promise<string[]> => {
    const { data, error } = await db.from("aluno_assinaturas").select("mp_preapproval_id").eq("paciente_id", pacienteId).not("mp_preapproval_id", "is", null);
    if (error) throw error;
    return ((data ?? []) as Array<{ mp_preapproval_id: string | null }>).map((a) => a.mp_preapproval_id).filter((x): x is string => !!x);
  };

  // ── W1b (C1): TODA ida ao MP com o id do pagamento da linha passa por aqui (servidor.test.ts confere na fonte). W2 (Task 9): com a
  // credencial ESCOLHIDA por quem chama (credencialDaCobranca — o collector da linha; a MESMA em todas as idas da ação) e, na conta do
  // personal, o recebedor também confere ──

  /** O pagamento desta linha no MP (GET com a credencial escolhida) e se ele é DESTA cobrança (pagamentoEDaCobranca; na conta do personal,
   *  também o collector_id = o da credencial — recebedorConfere: o token de OUTRO personal também lê o que é dele). pay null = o MP não
   *  respondeu 200 (fora do ar, ou 404 de um pagamento de outra conta do MP): quem chama decide. */
  const pagamentoDaLinha = async <T extends PagamentoMp = PagamentoMp>(c: Cobranca, m: Matricula, cred: CredencialMp):
    Promise<{ status: number; pay: T | null; daCobranca: boolean }> => {
    const { status, body: pay } = await mp<T & { collector_id?: number | string | null }>(cred, `/v1/payments/${encodeURIComponent(String(c.mp_payment_id))}`);
    if (status !== 200 || !pay?.id) return { status, pay: null, daCobranca: false };
    const preapproval = preapprovalDoPagamento(pay);
    // a automática da matrícula só pesa sem a referência nova (essa decide sozinha)
    const preapprovals = preapproval && !lerReferenciaAluno(pay.external_reference) ? await preapprovalsDe(c.paciente_id) : [];
    return { status, pay, daCobranca: recebedorConfere(cred, pay)
      && pagamentoEDaCobranca(pay, c, { schema, treinoUserId: m.treino_user_id, preapproval, preapprovals }) };
  };

  /** O pagamento da linha é de outra coisa: o rastro do C1 (ou um erro do master) vai ao log e avisa — só o id da cobrança. */
  const outroPagamento = (c: Cobranca) => log.erro({ codigo: "cobranca_de_outro_pagamento", schema, acao, ref: c.id });

  /** prof_reembolsar, detalhe_mp: o pagamento de outra coisa é 409 (nada vai ao MP nem sai na resposta). */
  const exigirDaCobranca = (r: { daCobranca: boolean }, c: Cobranca) => {
    if (r.daCobranca) return;
    outroPagamento(c);
    falhar("cobranca_de_outro_pagamento", 409);
  };

  /** Fecha no MP o pagamento pendente desta linha — só o DESTA cobrança (o PUT de sempre, com a MESMA credencial do GET; a resposta dele não
   *  muda nada aqui). "outro": nada foi ao MP (quem chama decide); "sem_resposta": o MP não respondeu ao GET (segue só com a linha, como
   *  quando o PUT falhava). */
  const cancelarNoMp = async (c: Cobranca, m: Matricula, cred: CredencialMp): Promise<"cancelado" | "outro" | "sem_resposta"> => {
    const r = await pagamentoDaLinha(c, m, cred);
    if (!r.pay) return "sem_resposta";
    if (!r.daCobranca) {
      outroPagamento(c);
      return "outro";
    }
    await mp(cred, `/v1/payments/${encodeURIComponent(String(c.mp_payment_id))}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
    return "cancelado";
  };

  type Fechamento = "fechado" | "sem_escrita" | "falhou";
  /** W2 (o Pix antigo do aluno_mp_pix/cartão, o I5 do prof_registrar): fecha no MP, por melhor esforço, o pagamento aberto desta linha com a
   *  credencial DELA (escrita). Revisão I-3: diz o que houve — "fechado" (o PUT foi; ou o pagamento é de outra coisa e nada foi ao MP — W1b);
   *  "sem_escrita" (outra conta do MP ou a desconectada: decisão 10, depois de desligar só leitura — a credencial dos 7 dias NÃO faz o PUT; o
   *  Pix segue pagável); "falhou" (a conexão caída ou o MP fora — só ao log). Quem chama decide o que fazer com a linha. */
  const fecharNoMp = async (c: Cobranca, m: Matricula): Promise<Fechamento> =>
    await lerSemDerrubar(c.id, async (): Promise<Fechamento> => {
      const cred = await credencialDaCobranca(db, ctxMp, c, credencial, { escrita: true });
      if (!cred) return "sem_escrita";
      await cancelarNoMp(c, m, cred);
      return "fechado";
    }, "falhou", "mp_fechar_sem_mp");

  /** confere no MP uma cobrança que ainda pode mudar (webhook atrasado/perdido). W1b: o pagamento de outra coisa não é aplicado — só
   *  vai ao log (sem lançar: o aluno_status e o prof_aluno não caem). W2: com a credencial DESTA linha (o collector — leitura, I3): a de outra
   *  conta do MP, a conexão em erro, a sem acesso guardado ou o MP fora → a linha do banco, como está. */
  const conferir = async (c: Cobranca, m: Matricula): Promise<Cobranca> => {
    if (!c.mp_payment_id || simulado(c.mp_payment_id) || c.forma !== "mp" || !mpEmAberto(c.mp_status) || c.status !== "aguardando_confirmacao") return c;
    return await lerSemDerrubar(c.id, async () => {
      const cred = await credencialDaCobranca(db, ctxMp, c, credencial, { leitura: true });
      if (!cred) return c;
      const r = await pagamentoDaLinha(c, m, cred);
      if (!r.pay) return c;
      if (!r.daCobranca) {
        outroPagamento(c);
        return c;
      }
      await aplicarPagamentoMp(db, c, r.pay, m, log, schema);
      return await buscarCobranca(c.id);
    }, c);
  };

  /** assinatura ao vivo no MP (status e próxima cobrança). W2: com a credencial DESTA assinatura (o collector — leitura, I3: a de outra conta
   *  do MP, a conexão caída ou o MP fora → a linha do banco) e a REDE da cobrança de cada mês (I1 — o aviso dela pode nunca vir): a busca das
   *  cobranças da automática registra as aprovadas que faltam, com a MESMA credencial (os 2 MPs; idempotente: mp_payment_id único). */
  const conferirAssinatura = async (m: Matricula) => {
    const a = await assinaturaDe(m.id);
    if (!a?.mp_preapproval_id || simulado(a.mp_preapproval_id) || a.payload?.simulada === true || a.status === "cancelled") return a;
    const preId = a.mp_preapproval_id;
    return await lerSemDerrubar(a.id, async () => {
      const cred = await credencialDaAssinatura(db, ctxMp, a, credencial, { leitura: true });
      if (!cred) return a;
      const { status: st, body: pre } = await mp<AssinaturaMp>(cred, `/preapproval/${encodeURIComponent(preId)}`);
      if (st !== 200 || !pre?.id) return a;
      const { error: erroEspelho } = await db.from("aluno_assinaturas").update(espelhoAssinaturaAluno(pre, { ...(a.payload ?? {}) })).eq("id", a.id);
      if (erroEspelho) throw erroEspelho;
      const depois = await assinaturaDe(m.id);
      if (depois) {
        const colunasW2 = await comCollector(db, schema, collectorDe(cred));
        const chamar = <T,>(caminho: string) => mp<T>(cred, caminho);
        // a rede também não derruba: o MP fora na busca só vai ao log (a próxima conferência ou o diário tentam de novo)
        await lerSemDerrubar(a.id, () => registrarCobrancasDaAutomatica(db, schema, log, chamar, m, depois, colunasW2), 0, "mp_rede_sem_mp");
      }
      return depois;
    }, a);
  };

  const cobrancasDe = async (pacienteId: string, limite = 48): Promise<Cobranca[]> => {
    const { data, error } = await db.from("cobrancas").select(await colunasCobranca()).eq("paciente_id", pacienteId).is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(limite);
    if (error) throw error;
    return (data ?? []) as unknown as Cobranca[];
  };

  const recibosDe = async (pacienteId: string) => {
    const { data, error } = await db.from("recibos").select("id, numero, data, valor, descricao, texto, nutricionista_id, created_at")
      .eq("paciente_id", pacienteId).is("deleted_at", null).order("numero", { ascending: false }).limit(24);
    if (error) throw error; // hml-14: os recibos sumiam do Pagamentos
    return (data ?? []) as Array<Record<string, unknown>>;
  };

  /** hml-14d (B21 · D31): quantos vivos o aluno tem (cobranças ou recibos) — o "Ver todos (N)" do app. Erro do banco lança. */
  const totalDoAluno = async (tabela: "cobrancas" | "recibos", pacienteId: string): Promise<number> => {
    const { count, error } = await db.from(tabela).select("id", { count: "exact", head: true }).eq("paciente_id", pacienteId).is("deleted_at", null);
    if (error) throw error;
    if (count === null) throw new Error(`sem contagem de ${tabela}`);
    return count;
  };

  /** hml-14d: a página pedida (1 sem o campo); fora de 1, 2, 3… → 400 pagina_invalida. Devolve o `[de, ate]` do `.range`. */
  const intervaloDaPagina = (v: unknown): [number, number] => {
    let pagina = 1;
    try {
      pagina = lerPagina(v) ?? 1;
    } catch (e) {
      if (e instanceof PaginaInvalida) falhar("pagina_invalida");
      throw e;
    }
    const de = (pagina - 1) * POR_PAGINA;
    return [de, de + POR_PAGINA - 1];
  };

  const urlAssinada = async (caminho: string): Promise<string> => {
    const { data, error } = await storage.storage.from(bucket).createSignedUrl(caminho, 300);
    if (error || !data?.signedUrl) falhar("storage_error", 502);
    return data!.signedUrl;
  };

  /** Lança a entrada no financeiro do profissional e liga na cobrança (para emitir recibo — N-45). */
  const lancar = async (c: Cobranca, dia: string, metodo: string) => {
    if (c.transacao_id) return c.transacao_id;
    const metodoTransacao = metodo === "cartao" ? "cartao_credito" : ["pix", "dinheiro", "transferencia"].includes(metodo) ? metodo : "outro";
    const { data, error } = await db.from("transacoes").insert({
      nutricionista_id: c.nutricionista_id, conta_id: c.conta_id, paciente_id: c.paciente_id, tipo: "entrada",
      descricao: c.descricao.slice(0, 160), valor: Number(c.valor), data: dia, metodo: metodoTransacao,
      observacao: "Lançado pela cobrança do aluno (Physiq)",
    }).select("id").single();
    if (error) {
      log.excecao(error, { codigo: "lancar_falhou", schema, acao, ref: c.id });
      return null;
    }
    const id = (data as { id: string }).id;
    // hml-14 (H-32): melhor esforço como o insert acima (a cobrança já está paga) — mas o erro é registrado e avisa
    const { error: erroLigar } = await db.from("cobrancas").update({ transacao_id: id }).eq("id", c.id);
    if (erroLigar) log.excecao(erroLigar, { codigo: "ligar_lancamento_falhou", schema, acao, ref: c.id });
    return id;
  };

  /** o que a trava do Nutri (site antigo) guarda em pacientes.bloqueado_por_pagamento acompanha a mudança (efeito na hora) */
  const recalcularTravaNutri = async () => {
    try {
      const { error } = await db.rpc("cobrancas_atualizar_bloqueio");
      if (error) throw error; // hml-14: o supabase-js devolve o erro (não lança): o catch nunca via a falha
    } catch (e) {
      log.excecao(e, { codigo: "atualizar_bloqueio_falhou", schema, acao });
    }
  };

  const mensalidadeVista = (m: Matricula) =>
    m.mensalidade_valor
      ? { valor: Number(m.mensalidade_valor), plano_id: m.plano_aluno_id, plano: m.plano?.nome ?? null, pausada: m.cobranca_pausada,
          pago_ate: m.mensalidade_pago_ate, desde: m.mensalidade_desde, coberta: coberto(m.mensalidade_pago_ate),
          // W7b: aluno sem profissional — o teste grátis do app e o código do plano (Treino · Treino + Alimentação)
          teste_ate: ehDoApp(m) ? m.app_teste_ate ?? null : null, plano_codigo: ehDoApp(m) ? m.plano?.codigo ?? null : null,
          // W-P: o plano com período (no modo de hoje: modalidade nula, 1 mês, 1 parcela, automática liberada)
          modalidade: m.plano_modalidade ?? null, meses: m.plano_modalidade ? m.plano?.meses ?? 1 : 1,
          negociado: m.plano_valor_negociado ?? null,
          max_parcelas: maxParcelasDoCartao(m.plano_modalidade ?? null, m.plano?.max_parcelas_cartao ?? null),
          automatica: aceitaAutomatica(m.plano_modalidade ?? null, m.plano?.meses ?? 1) }
      : null;

  /** A próxima parcela do mês a mês ("parcela 4 de 12"): a última mensalidade paga na régua do mensalidade_recalcular (parcela_num é o
   *  cache do banco) — a mesma ordem (pago_em, created_at, id) e o mesmo recomeço: um pagamento fora do mês a mês no meio volta a 1. */
  const parcelaDe = async (m: Matricula): Promise<Parcela | null> => {
    if (m.plano_modalidade !== "mensal" || !m.plano_aluno_id) return null;
    const total = m.plano?.meses ?? 1;
    const { data, error } = await db.from("cobrancas").select("parcela_num, parcelas_total, plano_aluno_id").eq("paciente_id", m.id)
      .eq("tipo", "mensalidade").eq("status", "paga").is("deleted_at", null).not("pago_em", "is", null)
      .order("pago_em", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1);
    if (error) throw error;
    const u = ((data ?? []) as Array<{ parcela_num: number | null; parcelas_total: number | null; plano_aluno_id: string | null }>)[0];
    return proximaParcela(u ? { num: u.parcela_num, total: u.parcelas_total, plano: u.plano_aluno_id } : null, m.plano_aluno_id, total);
  };

  /** A mensalidade com a próxima parcela do mês a mês — aluno_status (o próprio aluno), prof_aluno e prof_definir (só o dono). */
  const mensalidadeComPlano = async (m: Matricula) => {
    const v = mensalidadeVista(m);
    return v ? { ...v, parcela: await parcelaDe(m) } : null;
  };

  const assinaturaVista = (a: Awaited<ReturnType<typeof assinaturaDe>>) =>
    a ? { id: a.id, status: a.status, valor: a.valor === null ? null : Number(a.valor), proximo_vencimento: a.proximo_vencimento,
          sandbox: a.payload?.sandbox === true, simulada: a.payload?.simulada === true,
          init_point: (a.payload?.init_point as string | null) ?? null } : null;

  // ───────────────────────── Mercado Pago (aluno) ─────────────────────────

  /** Alvo do pagamento: uma cobrança avulsa aberta, ou a mensalidade (valor da matrícula; não paga em dobro enquanto coberta). */
  const alvoDoPagamento = async (m: Matricula, cobrancaId: unknown, permitirAdiantar = false) => {
    if (cobrancaId) {
      const c = await buscarCobranca(cobrancaId);
      if (c.paciente_id !== m.id) falhar("cobranca_de_outro_aluno", 403);
      if (c.tipo !== "avulsa") falhar("cobranca_invalida");
      if (c.status !== "aberta" && c.status !== "aguardando_confirmacao") falhar("cobranca_nao_aberta");
      return { avulsa: c, valor: Number(c.valor), vencimento: c.vencimento, mesRef: mesRefDe(c.vencimento) };
    }
    if (!m.mensalidade_valor || !(Number(m.mensalidade_valor) > 0)) falhar("sem_mensalidade");
    if (m.cobranca_pausada) falhar("cobranca_pausada");
    const dentroDaJanela = !!m.mensalidade_pago_ate && new Date(m.mensalidade_pago_ate).getTime() - Date.now() <= JANELA_ADIANTAR_MS;
    // W7b: nos dias grátis do app (a cobertura é só o teste) dá para pagar/assinar em qualquer dia do teste
    const soOTesteDoApp = ehDoApp(m) && !!m.app_teste_ate && !!m.mensalidade_pago_ate
      && new Date(m.mensalidade_pago_ate).getTime() <= new Date(m.app_teste_ate).getTime() + 60_000;
    if (!permitirAdiantar && coberto(m.mensalidade_pago_ate) && !dentroDaJanela && !soOTesteDoApp) falhar("ainda_coberto");
    const venc = vencimentoAPagar({ pago_ate: m.mensalidade_pago_ate, desde: m.mensalidade_desde }, hoje);
    return { avulsa: null as Cobranca | null, valor: Number(m.mensalidade_valor), vencimento: venc, mesRef: mesRefDe(venc) };
  };

  /** W2 (Task 9): a credencial com que o aluno PAGA agora (Pix, cartão, automática) — a MESMA em todas as idas ao MP da ação: o MP do Physiq
   *  no "mercadopago" (com o token no ambiente); o da conta do personal no "mercadopago_conta" — só a integração ATIVA (credencialDaConta;
   *  renova antes se vence em < 1 dia): sem acesso → MpContaSemAcesso → 409 mp_conta_indisponivel no catch final. Outro modo → 400. */
  const credencialParaPagar = async (m: Matricula): Promise<CredencialMp> => {
    const modo = m.conta?.recebimento_modo;
    if (modo === "mercadopago") {
      if (!tokenMp(credencial)) falhar("mp_nao_configurado", 500);
      return credencial;
    }
    if (modo === "mercadopago_conta" && m.conta_id) return await credencialDaConta(db, ctxMp(), m.conta_id);
    return falhar("modo_nao_mercadopago");
  };

  /** O que a linha da mensalidade grava do plano (descrição + retrato) — MP, Pix manual e pagamento por fora. `reescrever`: a linha já
   *  existe (o comprovante novo do Pix pendente passa ao valor de agora) — o retrato vai junto, inclusive o padrão do modo de hoje. */
  const linhaDoPlano = async (m: Matricula, mesRef: string, reescrever = false) => ({
    descricao: descricaoDoPagamento(m.plano?.nome ?? null, m.plano_modalidade ?? null, m.plano?.meses ?? 1, mesRef, await parcelaDe(m)),
    ...(reescrever && temPlanos(m) ? { meses_cobertos: 1, parcelas_total: null } : {}),
    ...retratoDoPlano(m),
  });

  /** cria (ou prepara) a linha da cobrança que o MP vai pagar. W2 (C2): com QUAL conta do MP recebe (collectorDaLinha — a da conta, o
   *  collector dela; a do MP do Physiq, nulo: a avulsa reaproveitada não fica com o collector de uma tentativa noutra conta) e lida de volta
   *  com as colunas da W2 (o collector: a credencial da linha nas conferências) */
  const linhaParaMp = async (m: Matricula, alvo: Awaited<ReturnType<typeof alvoDoPagamento>>, metodo: "pix" | "cartao", expira: Date | null,
    cred: CredencialMp): Promise<Cobranca> => {
    const colunas = await colunasCobranca();
    const conta = await collectorDaLinha(db, schema, cred);
    if (alvo.avulsa) {
      const { data, error } = await db.from("cobrancas").update({
        status: "aguardando_confirmacao", forma: "mp", metodo, mp_status: "pending", mp_payment_id: null, pix_qr: null, pix_copia_cola: null,
        pix_expira_em: expira ? expira.toISOString() : null, recusado_motivo: null, recusado_em: null, ...conta,
      }).eq("id", alvo.avulsa.id).select(colunas).single();
      if (error) throw error;
      return data as unknown as Cobranca;
    }
    const dono = recebedor(m);
    if (!dono) falhar("sem_profissional");
    const { data, error } = await db.from("cobrancas").insert({
      paciente_id: m.id, conta_id: m.conta_id, nutricionista_id: dono, criado_por: null, tipo: "mensalidade",
      ...(await linhaDoPlano(m, alvo.mesRef)), valor: alvo.valor, vencimento: alvo.vencimento, mes_ref: alvo.mesRef,
      status: "aguardando_confirmacao", forma: "mp", metodo, mp_status: "pending", plano_aluno_id: m.plano_aluno_id, origem: "app",
      pix_expira_em: expira ? expira.toISOString() : null, ...conta,
    }).select(colunas).single();
    if (error) throw error;
    return data as unknown as Cobranca;
  };

  /** W2 (decisão 15 — o I5 da W1 estendido ao MP): a mensalidade do MP ainda aguardando que um pagamento atrasado ainda pode aprovar — o Pix
   *  que não venceu ou o cartão em análise (sem validade) —, a mais nova. Com as colunas da W2 (o collector: a credencial para fechar no MP). */
  const mensalidadeMpAguardando = async (pacienteId: string): Promise<Cobranca | null> => {
    const { data, error } = await db.from("cobrancas").select(await colunasCobranca()).eq("paciente_id", pacienteId).eq("tipo", "mensalidade")
      .eq("forma", "mp").eq("status", "aguardando_confirmacao").is("deleted_at", null).order("created_at", { ascending: false }).limit(10);
    if (error) throw error;
    return ((data ?? []) as unknown as Cobranca[]).find((c) => !c.pix_expira_em || Date.parse(c.pix_expira_em) > Date.now()) ?? null;
  };

  /** desfaz a linha quando o MP recusa criar o pagamento */
  const desfazerLinha = async (c: Cobranca) => {
    // hml-14 (H-32): o erro lança (antes a linha ficava "aguardando" no MP sem pagamento por trás)
    const { error } = c.tipo === "avulsa"
      ? await db.from("cobrancas").update({ status: "aberta", forma: null, metodo: null, mp_status: null, pix_expira_em: null }).eq("id", c.id)
      : await db.from("cobrancas").delete().eq("id", c.id);
    if (error) throw error;
  };

  // ───────────────────────── W1 — InfinitePay (aluno) ─────────────────────────

  /** A conta do aluno recebe pela InfinitePay e tem a InfiniteTag ativa → a InfiniteTag de agora. (A flag é da tela do personal: o aluno
   *  de uma conta já ligada paga sempre.) */
  const exigirInfinitePay = async (m: Matricula): Promise<string> => {
    if (m.conta?.recebimento_modo !== "infinitepay") falhar("modo_nao_infinitepay");
    if (!(await schemaTemW1(db, schema))) falhar("w1_indisponivel", 409);
    const i = await integracaoIp(m.conta_id!);
    if (!i?.infinitepay_handle || i.status !== "ativa") falhar("infinitepay_nao_ligada", 409);
    return i!.infinitepay_handle;
  };

  type Alvo = Awaited<ReturnType<typeof alvoDoPagamento>>;

  /** A tentativa viva do alvo: a da avulsa é a própria avulsa; a da mensalidade, a mais nova aguardando na InfinitePay. */
  const tentativaVivaDe = async (m: Matricula, alvo: Alvo): Promise<Cobranca | null> => {
    let q = db.from("cobrancas").select(await colunasCobranca()).eq("paciente_id", m.id).eq("forma", "infinitepay")
      .eq("status", "aguardando_confirmacao").is("deleted_at", null);
    q = alvo.avulsa ? q.eq("id", alvo.avulsa.id) : q.eq("tipo", "mensalidade");
    const { data, error } = await q.order("created_at", { ascending: false }).limit(1);
    if (error) throw error;
    return ((data ?? []) as unknown as Cobranca[])[0] ?? null;
  };

  /** A linha da tentativa: a avulsa vira a tentativa; a mensalidade nasce com o retrato da W-P (descrição, meses cobertos, "de N"). */
  const linhaParaIp = async (m: Matricula, alvo: Alvo, handle: string): Promise<Cobranca> => {
    const ip = { forma: "infinitepay", ip_handle: handle, ip_link_url: null, ip_expira_em: expiraEm(), ip_conferido_em: null };
    if (alvo.avulsa) {
      const { data, error } = await db.from("cobrancas").update({ status: "aguardando_confirmacao", metodo: null, recusado_motivo: null,
        recusado_em: null, ...ip }).eq("id", alvo.avulsa.id).in("status", ["aberta", "aguardando_confirmacao"]).select(await colunasCobranca()).single();
      if (error) throw error;
      return data as unknown as Cobranca;
    }
    const dono = recebedor(m);
    if (!dono) falhar("sem_profissional");
    const { data, error } = await db.from("cobrancas").insert({
      paciente_id: m.id, conta_id: m.conta_id, nutricionista_id: dono, criado_por: null, tipo: "mensalidade",
      ...(await linhaDoPlano(m, alvo.mesRef)), valor: alvo.valor, vencimento: alvo.vencimento, mes_ref: alvo.mesRef,
      status: "aguardando_confirmacao", plano_aluno_id: m.plano_aluno_id, origem: "app", ...ip,
    }).select(await colunasCobranca()).single();
    if (error) throw error;
    return data as unknown as Cobranca;
  };

  /** A InfinitePay não criou o link: o pedido dele sai, e a tentativa sai (mensalidade) ou a avulsa volta a aberta, sem rastro. */
  const desfazerTentativa = async (c: Cobranca, pedido: string | null) => {
    if (pedido) {
      const { error: el } = await db.from("infinitepay_links").delete().eq("pedido", pedido);
      if (el) throw el;
    }
    const { error } = c.tipo === "avulsa"
      ? await db.from("cobrancas").update({ status: "aberta", forma: null, metodo: null, ip_handle: null, ip_link_url: null, ip_expira_em: null }).eq("id", c.id)
      : await db.from("cobrancas").delete().eq("id", c.id);
    if (error) throw error;
  };

  /** A tentativa de mensalidade que não serve mais (o valor ou a InfiniteTag mudou): sai do histórico. Paga depois, a baixa atrasada vale. */
  const encerrarTentativa = async (c: Cobranca) => {
    const { error } = await db.from("cobrancas").update({ status: "cancelada", deleted_at: new Date().toISOString() }).eq("id", c.id);
    if (error) throw error;
  };

  /** aluno_status e prof_aluno — só na conta InfinitePay ou com tentativa dela aberta (I2). A tentativa vencida sai, e os avisos que já
   *  estão na hora são conferidos EM 2º PLANO (I3): a resposta não espera, é como a tela (sem gastar tentativa) e o prazo é próprio,
   *  porque roda depois da resposta. */
  const cuidarDaInfinitePay = async (m: Matricula) => {
    if (!(await schemaTemW1(db, schema))) return;
    await fecharVencidas(db, m.id);
    const ctx: ContextoIp = { schema, log, prazo: prazo(ORCAMENTO_MS.servidor), ip: { base: IP_BASE } };
    emSegundoPlano(conferirAvisosPendentes(db, { pacienteId: m.id }, ctx, 2, "tela")
      .catch((e) => log.excecao(e, { codigo: "ip_conferir_2o_plano", schema, acao })));
  };
  const ehTentativaIp = (c: Cobranca) => c.forma === "infinitepay" && c.status === "aguardando_confirmacao";

  try {
    // ════════════════════════════ ALUNO ════════════════════════════
    if (acao === "aluno_status") {
      // W7b (rede de segurança): saiu do app para um profissional e a assinatura do app ainda está viva → cancela no MP
      try {
        await cancelarAssinaturasDoAppEncerrado(db, credencial, user.id, "vinculou_profissional", log, { prazo: prazoDoPedido });
      } catch (e) {
        log.excecao(e, { codigo: "cancelar_assinatura_do_app", schema, acao });
      }
      const { data: mats, error } = await db.from("pacientes").select("id").eq("user_id", user.id).is("deleted_at", null)
        .eq("ativo", true).order("created_at");
      if (error) throw error;
      const matriculas = [];
      for (const { id } of (mats ?? []) as Array<{ id: string }>) {
        const m = await carregarMatricula(db, id);
        if (!m) continue;
        // o que ainda pode mudar no MP (Pix pendente, assinatura) — funciona mesmo sem o aviso do webhook
        const cobs0 = await cobrancasDe(m.id);
        for (const c of cobs0.filter((x) => x.forma === "mp" && x.status === "aguardando_confirmacao").slice(0, 4)) await conferir(c, m);
        // W1: a tentativa vencida sai (o cobs relido abaixo já a vê fechada) e os avisos na hora são conferidos em 2º plano (I3) — só
        // na conta InfinitePay ou com a tentativa dela aberta (I2)
        if (m.conta?.recebimento_modo === "infinitepay" || cobs0.some(ehTentativaIp)) await cuidarDaInfinitePay(m);
        // W2: os 2 MPs conferem a automática (a do personal pela credencial DELA — leitura, I3: com a conexão caída, a linha do banco)
        const assinatura = ehModoMp(m.conta?.recebimento_modo) ? await conferirAssinatura(m) : await assinaturaDe(m.id);
        const atual = (await carregarMatricula(db, id)) ?? m;
        const cobs = await cobrancasDe(m.id);
        const pixAberto = cobs.find((c) => c.forma === "mp" && c.status === "aguardando_confirmacao" && c.metodo === "pix"
          && !!c.pix_copia_cola && (!c.pix_expira_em || new Date(c.pix_expira_em).getTime() > Date.now()));
        const modo = atual.conta?.recebimento_modo ?? "pix_manual";
        const chave = modo === "pix_manual" ? await chaveAtiva(atual.conta_id) : null;
        // W2: o MP da conta do personal — a integração SEM token (integracaoMp): disponivel = a conexão ATIVA (caída, o app mostra
        // "indisponível" e o histórico segue — I3); a chave pública do vendedor para o cartão (decisão 14: sem ela, só o Pix)
        const mpDaConta = modo === "mercadopago_conta" && atual.conta_id ? await integracaoMp(db, atual.conta_id) : null;
        const dono = recebedor(atual);
        matriculas.push({
          paciente_id: atual.id, nome: atual.nome,
          conta: { id: atual.conta_id, nome: atual.conta?.nome ?? null, modo, bloquear: atual.conta?.bloquear_app_inadimplente ?? false,
                   profissional: ehDoApp(atual) ? "Physiq" : await nomeDe(dono), app: ehDoApp(atual) },
          chave: chave ? { tipo: chave.tipo, chave: chave.chave, favorecido: chave.favorecido, banco: chave.banco } : null,
          mensalidade: await mensalidadeComPlano(atual),
          assinatura: assinaturaVista(assinatura),
          cobrancas: cobs.map((c) => vista(c, c.id === pixAberto?.id)),
          recibos: await recibosDe(atual.id),
          // hml-14d (B21 · D31): o "Ver todos (N)" do app — as listas acima continuam com as 48/24 de sempre (o APK antigo usa)
          total_cobrancas: await totalDoAluno("cobrancas", atual.id),
          total_recibos: await totalDoAluno("recibos", atual.id),
          // W2: só na matrícula do MP do personal (nas outras, null — o APK antigo não lê)
          mp: modo === "mercadopago_conta"
            ? { disponivel: mpDaConta?.status === "ativa", chave_publica: mpDaConta?.status === "ativa" ? mpDaConta.mp_public_key : null } : null,
        });
      }
      return json({ ok: true, ambiente: schema, simulacao: schema === "staging", hoje, agora: new Date().toISOString(), matriculas }, 200, origin);
    }

    if (acao === "aluno_historico") {
      // hml-14d (B21 · D31): o "Ver todos" de Perfil › Pagamentos — uma página de 20 da matrícula do aluno logado, com o total:
      // as cobranças (o mesmo vista do aluno_status, sem o QR; a mais nova primeiro) ou os recibos (as colunas do recibosDe; o número
      // mais alto primeiro). Desempate pelo id: a mesma ordem em todas as páginas.
      const tipo = body.tipo === "cobrancas" || body.tipo === "recibos" ? body.tipo : falhar("tipo_invalido");
      const [de, ate] = intervaloDaPagina(body.pagina);
      const m = await minhaMatricula(body.paciente_id);
      if (tipo === "cobrancas") {
        const { data, error, count } = await db.from("cobrancas").select(await colunasCobranca(), { count: "exact" }).eq("paciente_id", m.id)
          .is("deleted_at", null).order("created_at", { ascending: false }).order("id").range(de, ate);
        if (error) throw error;
        if (count === null) throw new Error("sem contagem de cobrancas");
        return json({ ok: true, itens: ((data ?? []) as unknown as Cobranca[]).map((c) => vista(c)), total: count }, 200, origin);
      }
      const { data, error, count } = await db.from("recibos").select("id, numero, data, valor, descricao, texto, nutricionista_id, created_at", { count: "exact" })
        .eq("paciente_id", m.id).is("deleted_at", null).order("numero", { ascending: false }).order("id").range(de, ate);
      if (error) throw error;
      if (count === null) throw new Error("sem contagem de recibos");
      return json({ ok: true, itens: data ?? [], total: count }, 200, origin);
    }

    if (acao === "aluno_upload") {
      const m = await minhaMatricula(body.paciente_id);
      if (!m.conta_id) falhar("sem_conta");
      const ext = extensaoComprovante(String(body.tipo || ""));
      if (!ext) falhar("tipo_invalido");
      const tamanho = Number(body.tamanho || 0);
      if (tamanho > COMPROVANTE_MAX_BYTES) falhar("arquivo_grande");
      const caminho = caminhoComprovante(m.conta_id!, m.id, ext!);
      const { data, error } = await storage.storage.from(bucket).createSignedUploadUrl(caminho);
      if (error || !data?.token) falhar("storage_error", 502);
      return json({ ok: true, bucket, caminho, token: data!.token, url: data!.signedUrl }, 200, origin);
    }

    if (acao === "aluno_avisar_pix") {
      const m = await minhaMatricula(body.paciente_id);
      if (!m.conta_id) falhar("sem_conta");
      if ((m.conta?.recebimento_modo ?? "pix_manual") !== "pix_manual") falhar("modo_nao_pix_manual");
      if (!(await chaveAtiva(m.conta_id))) falhar("sem_chave_pix");
      const caminho = String(body.comprovante_path || "").trim();
      if (!caminho) falhar("missing_comprovante");
      if (!comprovanteDaMatricula(caminho, m.conta_id!, m.id)) falhar("comprovante_fora_da_pasta", 403);
      const arquivo = await storage.storage.from(bucket).list(caminho.split("/").slice(0, -1).join("/"), { search: caminho.split("/").pop() });
      if (!(arquivo.data ?? []).some((f) => f.name === caminho.split("/").pop())) falhar("comprovante_nao_enviado");
      const agora = new Date().toISOString();
      let c: Cobranca;
      let atualizado = false;
      if (body.cobranca_id) {
        // cobrança avulsa (Nutri — R16): a própria cobrança passa a aguardar a confirmação
        c = await buscarCobranca(body.cobranca_id);
        if (c.paciente_id !== m.id) falhar("cobranca_de_outro_aluno", 403);
        if (c.tipo !== "avulsa" || (c.status !== "aberta" && !(c.status === "aguardando_confirmacao" && c.forma === "pix_manual"))) falhar("cobranca_nao_aberta");
        atualizado = c.status === "aguardando_confirmacao";
        const { data, error } = await db.from("cobrancas").update({
          status: "aguardando_confirmacao", forma: "pix_manual", comprovante_path: caminho, enviado_em: agora,
          recusado_motivo: null, recusado_em: null,
        }).eq("id", c.id).select(COLUNAS_COBRANCA).single();
        if (error) throw error;
        c = data as unknown as Cobranca;
      } else {
        // mensalidade: um aviso pendente por vez — troca o comprovante do pendente em vez de empilhar (regra do Calc)
        const alvo = await alvoDoPagamento(m, null, true);
        const { data: pend, error: ep } = await db.from("cobrancas").select(COLUNAS_COBRANCA).eq("paciente_id", m.id).eq("tipo", "mensalidade")
          .eq("forma", "pix_manual").eq("status", "aguardando_confirmacao").is("deleted_at", null).limit(1);
        if (ep) throw ep; // sem ler o pendente, criaria um 2º aviso
        const pendente = ((pend ?? []) as unknown as Cobranca[])[0];
        if (pendente) {
          // W-P: o pendente passa ao valor de agora e, junto, à descrição e ao retrato de agora (o dono pode ter trocado o plano ou a
          // modalidade depois do 1º aviso: o valor de um com o período do outro cobriria errado). Sem a migration: igual a antes.
          const { data, error } = await db.from("cobrancas").update({
            comprovante_path: caminho, valor: alvo.valor, enviado_em: agora,
            ...(temPlanos(m) ? await linhaDoPlano(m, pendente.mes_ref ?? alvo.mesRef, true) : {}),
          }).eq("id", pendente.id).select(COLUNAS_COBRANCA).single();
          if (error) throw error;
          c = data as unknown as Cobranca;
          atualizado = true;
        } else {
          const dono = recebedor(m);
          if (!dono) falhar("sem_profissional");
          const { data, error } = await db.from("cobrancas").insert({
            paciente_id: m.id, conta_id: m.conta_id, nutricionista_id: dono, criado_por: null, tipo: "mensalidade",
            ...(await linhaDoPlano(m, alvo.mesRef)), valor: alvo.valor, vencimento: alvo.vencimento,
            mes_ref: alvo.mesRef, status: "aguardando_confirmacao", forma: "pix_manual", metodo: "pix", comprovante_path: caminho,
            enviado_em: agora, plano_aluno_id: m.plano_aluno_id, origem: "app",
          }).select(COLUNAS_COBRANCA).single();
          if (error) throw error;
          c = data as unknown as Cobranca;
        }
      }
      if (!atualizado) {
        const titulo = `${m.nome} enviou um comprovante · ${reais(c.valor)}`;
        const destinos = new Set([recebedor(m), c.nutricionista_id].filter(Boolean) as string[]);
        for (const d of destinos) await avisar(db, d, "comprovante_enviado", titulo, linkDoAlunoNoPainel(m), log, schema);
      }
      await recalcularTravaNutri();
      return json({ ok: true, cobranca: vista(c), atualizado }, 200, origin);
    }

    if (acao === "aluno_comprovante") {
      const c = await buscarCobranca(body.cobranca_id);
      const m = await minhaMatricula(c.paciente_id);
      if (c.paciente_id !== m.id || !c.comprovante_path) falhar("not_found", 404);
      return json({ ok: true, url: await urlAssinada(c.comprovante_path!), pdf: /\.pdf$/i.test(c.comprovante_path!) }, 200, origin);
    }

    if (acao === "aluno_mp_pix" || acao === "aluno_mp_cartao") {
      const m = await minhaMatricula(body.paciente_id);
      // W2: o MP do Physiq ou o da conta do personal (sem acesso a ela → 409 mp_conta_indisponivel) — a MESMA credencial em todas as idas daqui
      const cred = await credencialParaPagar(m);
      const alvo = await alvoDoPagamento(m, body.cobranca_id);
      // I6: parcelas só no cartão parcelado, até o máximo do plano (a avulsa e o modo de hoje: 1×)
      const parcelas = body.installments === undefined ? 1 : body.installments;
      if (acao === "aluno_mp_cartao" && !parcelasValidas(parcelas, alvo.avulsa ? null : m.plano_modalidade ?? null, m.plano?.max_parcelas_cartao ?? null)) {
        falhar("parcelas_invalidas");
      }
      const assinatura = await assinaturaDe(m.id);
      if (!alvo.avulsa && assinatura?.status === "authorized") falhar("cartao_ativo");
      const metodo = acao === "aluno_mp_pix" ? "pix" : "cartao";
      // Os Pix abertos do aluno ANTES de um pagamento novo no MP (revisão I-3: no Pix E no cartão). O Pix igual, com mais de 30 min de
      // validade e NA MESMA conta do MP → reaproveita (só no Pix). Os outros: TODO Pix que não vai ser reaproveitado é fechado NO MP com a
      // credencial DELE (fecharNoMp) — inclusive o da própria avulsa (o linhaParaMp zera o mp_payment_id dela: o QR antigo seguia pagável e,
      // pago, não dava baixa — o aluno pagava 2 vezes). O UPDATE da linha fica só para as OUTRAS (a da avulsa o linhaParaMp reescreve). A
      // conta de antes que o Physiq não alcança para escrita (sem_escrita: a desconectada — decisão 10, só leitura; a credencial dos 7 dias
      // não faz o PUT — ou outra conta do MP): o Pix dela segue pagável, então a linha FICA (paga, o aviso e a conferência dão baixa nela pela
      // leitura dos 7 dias); o do MESMO alvo, vivo, volta no Pix em vez de um 2º e recusa o cartão (409 mp_conta_indisponivel). A conexão
      // caída ou o MP fora no fechamento (falhou) não impedem o pagamento novo (o melhor esforço de sempre). W2: lido com as colunas da W2 (o
      // collector de cada um: a conta dele e a credencial para fechá-lo)
      const { data: abertos, error } = await db.from("cobrancas").select(await colunasCobranca()).eq("paciente_id", m.id).eq("forma", "mp")
        .eq("metodo", "pix").eq("status", "aguardando_confirmacao").is("deleted_at", null);
      if (error) throw error; // hml-06: sem ler o Pix aberto não se cria outro
      for (const aberto of (abertos ?? []) as unknown as Cobranca[]) {
        const atual = await conferir(aberto, m);
        const mesmoAlvo = alvo.avulsa ? atual.id === alvo.avulsa.id : atual.tipo === "mensalidade";
        if (atual.status === "paga") {
          if (metodo === "pix") return json({ ok: true, cobranca: vista(atual), aprovada: true }, 200, origin);
          if (mesmoAlvo) return json({ ok: true, cobranca: vista(atual), status: "paga", aprovada: true }, 200, origin);   // o cartão não cobra 2×
          continue;
        }
        if (atual.status !== "aguardando_confirmacao") continue;
        const valida = atual.pix_expira_em ? new Date(atual.pix_expira_em).getTime() > Date.now() + 30 * 60_000 : false;
        // W2: o Pix de OUTRA conta do MP não serve (o modo mudou — do MP do Physiq para o do personal, ou o contrário): o aluno pagaria a de antes
        const mesmaConta = Number(atual.mp_collector_id ?? 0) === Number(collectorDe(cred) ?? 0); // W2: depois do schemaTemW2
        if (metodo === "pix" && valida && mesmoAlvo && mesmaConta && Number(atual.valor) === alvo.valor && atual.pix_copia_cola) {
          return json({ ok: true, cobranca: vista(atual, true), reutilizada: true }, 200, origin);
        }
        // W1b: no MP, só o Pix DESTA cobrança é fechado (o de outra coisa só vai ao log — o cancelarNoMp)
        const fechou = atual.mp_payment_id && !simulado(atual.mp_payment_id) ? await fecharNoMp(atual, m) : "fechado";
        if (fechou === "sem_escrita" && !!atual.pix_expira_em && Date.parse(atual.pix_expira_em) > Date.now()) {
          if (!mesmoAlvo) continue;
          if (metodo === "pix" && atual.pix_copia_cola) return json({ ok: true, cobranca: vista(atual, true), reutilizada: true }, 200, origin);
          log.aviso({ codigo: "mp_pix_vivo_sem_escrita", schema, acao, ref: atual.id });
          return falhar("mp_conta_indisponivel", 409);
        }
        if (!alvo.avulsa || atual.id !== alvo.avulsa.id) {
          const { error: erroFechar } = atual.tipo === "avulsa"
            ? await db.from("cobrancas").update({ status: "aberta", forma: null, mp_status: "cancelled", mp_payment_id: null, pix_qr: null, pix_copia_cola: null, pix_expira_em: null }).eq("id", atual.id)
            : await db.from("cobrancas").update({ status: "cancelada", mp_status: "cancelled" }).eq("id", atual.id);
          if (erroFechar) throw erroFechar;
        }
      }
      const expira = metodo === "pix" ? new Date(Date.now() + PIX_HORAS * 3_600_000) : null;
      const linha = await linhaParaMp(m, alvo, metodo, expira, cred);
      const referencia = referenciaAluno(schema, m.id, alvo.avulsa ? "avulsa" : "mensalidade", linha.id);
      // W2: o aviso do MP volta pela URL da conta (…&conta=<id>) no MP do personal; pela de sempre no MP do Physiq
      const notificacao = notificacaoDe(cred, schema, SUPABASE_URL);
      const pagador = pagadorDe(cred);
      if (metodo === "pix") {
        let criado: RespostaMp<PagamentoMp>;
        try {
          criado = await mp<PagamentoMp>(cred, "/v1/payments", {
            method: "POST",
            body: JSON.stringify({
              transaction_amount: alvo.valor, description: linha.descricao.slice(0, 120), payment_method_id: "pix", payer: { email: pagador },
              external_reference: referencia, notification_url: notificacao, date_of_expiration: expira!.toISOString().replace("Z", "-00:00"),
            }),
          });
        } catch (e) {
          await desfazerLinha(linha); // W2: a conexão do personal caiu (ou o MP sumiu) no meio — a linha não fica "aguardando" sem pagamento
          throw e;
        }
        const { status: st, body: pay } = criado;
        const td = pay?.point_of_interaction?.transaction_data;
        if (st >= 300 || !pay?.id || !td?.qr_code) {
          if (typeof cred !== "string" && erroPixSemChave(pay)) {
            // W2 (decisão 16): a conta do MP do personal sem chave Pix — o aluno usa o cartão e o dono fica sabendo (no máximo 1 aviso por dia)
            log.aviso({ codigo: "mp_conta_sem_chave_pix", schema, acao, ref: linha.id, status: st });
            await desfazerLinha(linha);
            await avisarDonoDaConexao(db, ctxMp(), cred.contaId, "Um aluno tentou pagar por Pix, mas a sua conta do Mercado Pago ainda não tem chave Pix. Cadastre uma chave Pix no app do Mercado Pago para receber por Pix pelo Physiq.")
              .catch((e) => log.excecao(e, { codigo: "mp_aviso_sem_chave_pix_falhou", schema, acao }));
            return erro("mp_conta_sem_chave_pix", 400, origin);
          }
          log.erro({ codigo: "mp_pix_falhou", schema, acao, ref: linha.id, status: st, externo: codigosDoMp(pay) });
          if (schema === "staging" && st >= 500) {
            // SÓ STAGING: o sandbox do MP cai com 500 de vez em quando → Pix simulado (sem QR real) pra manter o fluxo de teste
            const { data: sim } = await db.from("cobrancas").update({ mp_payment_id: `sim-${crypto.randomUUID()}`, pix_copia_cola: "SIMULADO-SANDBOX-MP-INDISPONIVEL" })
              .eq("id", linha.id).select(COLUNAS_COBRANCA).single();
            return json({ ok: true, cobranca: vista(sim as unknown as Cobranca, true), simulado: true }, 200, origin);
          }
          await desfazerLinha(linha);
          return erro("pix_indisponivel", 502, origin, { status_mp: st });
        }
        const { data: salva, error: es } = await db.from("cobrancas").update({
          mp_payment_id: String(pay.id), mp_status: String(pay.status || "pending"), pix_qr: td.qr_code_base64 ?? null, pix_copia_cola: td.qr_code,
          pix_expira_em: pay.date_of_expiration ?? expira!.toISOString(),
        }).eq("id", linha.id).select(COLUNAS_COBRANCA).single();
        if (es) throw es;
        return json({ ok: true, cobranca: vista(salva as unknown as Cobranca, true), reutilizada: false }, 200, origin);
      }
      const cardToken = typeof body.card_token === "string" ? body.card_token : "";
      if (!cardToken) {
        await desfazerLinha(linha);
        return erro("missing_card_token", 400, origin);
      }
      // mp-cartao (contrato §2.2 — "Recommendations to improve payments approval"): o aparelho no cabeçalho X-meli-session-id (o id do
      // security.js; fora do formato, sem o cabeçalho — o token do SDK já leva o aparelho dele), o titular e o documento do formulário do
      // cartão no payer (inválido fica fora; nunca trava), 1 item e o descritor "PHYSIQ" — nos 2 MPs, pela MESMA linha. CPF, nome e o id
      // do aparelho só vão ao MP: nada no log, na resposta de erro ou no banco. O APK antigo (sem pagador/device_id): o pedido de antes +
      // o item + o descritor.
      const aparelho = deviceDoPedido(body.device_id);
      const titular = pagadorDoPedido(body.pagador);
      const item = itemDoPedido({ id: alvo.avulsa ? "avulsa" : (m.plano_aluno_id ?? "mensalidade"), titulo: linha.descricao, valor: alvo.valor });
      const pedido: Record<string, unknown> = {
        transaction_amount: alvo.valor, token: cardToken, description: linha.descricao.slice(0, 120), installments: Number(parcelas),
        payer: { email: pagador, ...titular }, external_reference: referencia, notification_url: notificacao,
        additional_info: infoAdicionalDoPedido(item, titular), statement_descriptor: DESCRITOR_FATURA,
      };
      if (typeof body.payment_method_id === "string" && body.payment_method_id) pedido.payment_method_id = body.payment_method_id;
      if (body.issuer_id !== undefined && body.issuer_id !== null && body.issuer_id !== "") pedido.issuer_id = body.issuer_id;
      const comAparelho = resultadoDoDevice(aparelho);
      let cobrado: RespostaMp<PagamentoMp>;
      try {
        cobrado = await mp<PagamentoMp>(cred, "/v1/payments", { method: "POST", body: JSON.stringify(pedido), headers: cabecalhosDoDevice(aparelho) });
      } catch (e) {
        await desfazerLinha(linha); // W2: a conexão do personal caiu (ou o MP sumiu) no meio — a linha não fica "aguardando" sem pagamento
        throw e;
      }
      const { status: st, body: pay } = cobrado;
      if (st >= 300 || !pay?.id) {
        log.erro({ codigo: "mp_cartao_falhou", schema, acao, ref: linha.id, status: st, resultado: comAparelho, externo: codigosDoMp(pay) });
        await desfazerLinha(linha);
        return erro(erroDeCartao(st, pay) ? "cartao_recusado" : "mp_error", erroDeCartao(st, pay) ? 400 : 502, origin,
          { status_detail: codigoDaRecusa(pay) });
      }
      // MENOR 20: o pagamento tem de ser do mundo do schema — o de sandbox no public (ou um de verdade no staging) nunca vale: nada aplicado e a
      // linha desfeita; o Weslley é avisado com o id do pagamento (para conferir/devolver no MP)
      if (!modoConfere(credencialDoSchema(schemaDaCredencialMp(cred)), pay)) {
        log.erro({ codigo: "mp_cartao_modo_errado", schema, acao, ref: String(pay.id), status: st });
        await desfazerLinha(linha);
        return erro("mp_error", 502, origin);
      }
      // mp-cartao: a recusa vai ao log com o motivo (só o status_detail) e se o aparelho foi junto — a prova se lê sem a API do MP
      if (pay.status === "rejected") {
        log.aviso({ codigo: "mp_cartao_recusado", schema, acao, ref: String(pay.id), resultado: comAparelho, externo: codigosDoMp(pay) });
      }
      // hml-14 (H-32): o cartão JÁ foi cobrado — o erro daqui não vira 500 (o aluno pagaria 2×): registra e avisa; o aviso do MP
      // acha a cobrança pela referência
      const { error: erroId } = await db.from("cobrancas").update({ mp_payment_id: String(pay.id) }).eq("id", linha.id).is("mp_payment_id", null);
      if (erroId) log.excecao(erroId, { codigo: "gravacao_depois_da_cobranca", schema, acao, ref: linha.id });
      const r = await aplicarPagamentoMp(db, await buscarCobranca(linha.id), pay, m, log, schema);
      return json({ ok: true, cobranca: vista(await buscarCobranca(linha.id)), status: r.status, status_detail: pay.status_detail ?? null }, 200, origin);
    }

    if (acao === "aluno_mp_assinar") {
      const m = await minhaMatricula(body.paciente_id);
      // W2: o MP do Physiq ou o da conta do personal (sem acesso a ela → 409 mp_conta_indisponivel) — a MESMA credencial nos POST daqui
      const cred = await credencialParaPagar(m);
      if (!m.mensalidade_valor || m.cobranca_pausada) falhar("sem_mensalidade");
      // W-P (B2): automática no mês a mês, no plano de 1 mês e no modo de hoje; no período todo, não (P-A "1": sem data de fim — renova)
      if (!aceitaAutomatica(m.plano_modalidade ?? null, m.plano?.meses ?? 1)) falhar("modalidade_sem_automatica");
      const cardToken = typeof body.card_token === "string" ? body.card_token : "";
      const checkout = body.checkout === true;
      if (!cardToken && !checkout) falhar("missing_card_token");
      const atual = await assinaturaDe(m.id);                          // colunasAssinatura (C2): o collector da antiga
      if (atual?.mp_preapproval_id && ["authorized", "pending", "paused"].includes(atual.status) && !simulado(atual.mp_preapproval_id)) {
        // I11 (revisão da W2): a antiga viva é cancelada com a credencial DELA (o MP do Physiq ou outra conta do personal) e CONFERIDA no MP
        // antes da nova — senão ela some do banco (a linha é reaproveitada abaixo) e segue cobrando: o aluno pagaria 2 automáticas. Sem a
        // credencial dela (outra conta do MP, a desconectada, a conexão caída) ou sem a conferência → 409 assinatura_antiga_viva e NENHUM POST
        const antiga = await desligarAntiga(async () => {
          const dela = await credencialDaAssinatura(db, ctxMp, atual, credencial, { escrita: true });
          return dela ? <T,>(caminho: string, init?: RequestInit) => mp<T>(dela, caminho, init) : null;
        }, { mp_preapproval_id: atual.mp_preapproval_id, payload: atual.payload });
        if (antiga.resultado === "assinatura_ja_ativa") falhar("assinatura_ja_ativa");
        if (antiga.resultado === "assinatura_antiga_viva") {
          // o MP aceitou o cancelamento e ela segue viva: avisa o Weslley; o resto (sem credencial, sem resposta, sem acesso) só vai ao log
          if (antiga.motivo === "nao_cancelou") log.erro({ codigo: "mp_assinatura_antiga_viva", schema, acao, ref: m.id, status: antiga.status, resultado: antiga.motivo });
          else log.aviso({ codigo: "mp_assinatura_antiga_viva", schema, acao, ref: m.id, status: antiga.status, resultado: antiga.motivo });
          falhar("assinatura_antiga_viva", 409);
        }
      }
      // cobertura vigente → 1ª cobrança quando ela termina (regra do Calc); vencida → cobra na hora
      const inicio = coberto(m.mensalidade_pago_ate) ? new Date(m.mensalidade_pago_ate!).toISOString() : null;
      const valor = Number(m.mensalidade_valor);
      const recorrencia = { frequency: 1, frequency_type: "months", transaction_amount: valor, currency_id: "BRL", ...(inicio ? { start_date: inicio } : {}) };
      const motivo = `Physiq — ${descricaoMensalidade(m.plano?.nome ?? null, mesRefDe(hoje)).replace(/ · [^·]+$/, "")}`;
      const base = {
        reason: motivo.slice(0, 120), external_reference: referenciaAluno(schema, m.id, "recorrente"), payer_email: pagadorDe(cred),
        auto_recurring: recorrencia, back_url: `${SITE[schema]}/perfil/pagamentos?assinatura=ok`, notification_url: notificacaoDe(cred, schema, SUPABASE_URL),
      };
      const pendente = () => mp<AssinaturaMp>(cred, "/preapproval", { method: "POST", body: JSON.stringify({ ...base, status: "pending" }) });
      // mp-cartao (decisão 6): na automática com cartão, SÓ o cabeçalho do aparelho (o corpo é o de antes — a doc do /preapproval não tem
      // nome, CPF, additional_info nem descritor); o pendente (checkout do MP, a rede do sandbox) não leva cartão nem aparelho
      const aparelho = deviceDoPedido(body.device_id);
      const comAparelho = resultadoDoDevice(aparelho);
      let { status: st, body: pre } = checkout ? await pendente()
        : await mp<AssinaturaMp>(cred, "/preapproval", { method: "POST", body: JSON.stringify({ ...base, card_token_id: cardToken, status: "authorized" }), headers: cabecalhosDoDevice(aparelho) });
      let sandbox = false;
      if (!checkout && (st >= 300 || !pre?.id) && schemaDaCredencialMp(cred) === "staging" && recusaDoSandbox(st, pre)) {
        // STAGING: o MP não tem assinatura com cartão no sandbox → nasce PENDENTE (checkout do MP). MENOR 28: pela credencial (a da conta de
        // teste também — pelo "test" do MP do Physiq, como antes, a da conta nunca ligava a rede e dava 502)
        sandbox = true;
        ({ status: st, body: pre } = await pendente());
      }
      if (st >= 300 || !pre?.id) {
        // mp-cartao: + o resultado com/sem aparelho; o codigosDoMp tira o cc_rejected_…/CC_VAL_… da mensagem (14/10: 400 sem códigos — o log ficou
        // {}); sem NENHUM código, o slug seguro da mensagem SÓ neste log (o achado da F5 + a conferência do aa0599b0: o pedido do /preapproval não
        // leva nome nem CPF — decisão 6 —, e o slug nunca vai à resposta)
        const semCodigo = !Object.keys(codigosDoMp(pre)).length;
        log.erro({ codigo: "mp_assinatura_falhou", schema, acao, ref: m.id, status: st, resultado: comAparelho,
          externo: { ...codigosDoMp(pre), ...(semCodigo ? { mp_status_detail: slugDaMensagem(pre) } : {}) } });
        if (erroDeCartao(st, pre)) {
          falhar("cartao_recusado", 400, { status_detail: codigoDaRecusa(pre) });
        }
        falhar("mp_error", 502, { status_mp: st });
      }
      // C2: QUAL conta do MP recebe, só pelo collectorDaLinha (sem a W2, nada — o PGRST204 aqui viria DEPOIS do POST = automática em dobro; no
      // MP do Physiq, nulo — a linha reaproveitada não fica com o collector da antiga)
      const linha = { paciente_id: m.id, conta_id: m.conta_id, valor, ...(await collectorDaLinha(db, schema, cred)),
        ...espelhoAssinaturaAluno(pre!, { sandbox, checkout, inicio, criada_por: user.id }) };
      const { data: salva, error: es } = atual
        ? await db.from("aluno_assinaturas").update(linha).eq("id", atual.id).select("*").single()
        : await db.from("aluno_assinaturas").insert(linha).select("*").single();
      if (es) throw es;
      // revisão M-9: a VISTA (a do aluno_status), nunca a linha crua — o mp_collector_id (o user id do MP do personal) e o payload ficam aqui
      return json({ ok: true, assinatura: assinaturaVista(salva), primeira_cobranca: inicio, sandbox, init_point: sandbox || checkout ? pre!.init_point ?? null : null }, 200, origin);
    }

    if (acao === "aluno_mp_cancelar" || acao === "prof_cancelar_assinatura") {
      let m: Matricula;
      if (acao === "aluno_mp_cancelar") m = await minhaMatricula(body.paciente_id);
      else {
        const r = await matriculaDoPainel(body.aluno);
        exigirMensalidade(r.p);
        m = r.m;
      }
      const a = await assinaturaDe(m.id);
      if (!a?.mp_preapproval_id || !["authorized", "pending", "paused"].includes(a.status)) falhar("sem_assinatura");
      if (!simulado(a!.mp_preapproval_id)) {
        // W2: com a credencial DESTA automática (escrita — o collector): outra conta do MP ou a desconectada → 409 mp_outra_conta (o Physiq não
        // alcança: cancela-se pelo app do Mercado Pago); a conexão caída → 409 mp_conta_indisponivel (o catch final)
        const cred = await credencialDaAssinatura(db, ctxMp, a!, credencial, { escrita: true });
        if (!cred) falhar("mp_outra_conta", 409);
        const { status: sc, body: pre } = await mp<AssinaturaMp>(cred!, `/preapproval/${encodeURIComponent(a!.mp_preapproval_id!)}`, {
          method: "PUT", body: JSON.stringify({ status: "cancelled" }),
        });
        if (sc >= 300 || !pre?.id) falhar("mp_error", 502, { status_mp: sc });
        const { error: erroCancelada } = await db.from("aluno_assinaturas").update(espelhoAssinaturaAluno(pre!, { ...(a!.payload ?? {}), cancelada_por: user.id })).eq("id", a!.id);
        if (erroCancelada) throw erroCancelada;
      } else {
        const { error: erroCancelada } = await db.from("aluno_assinaturas").update({ status: "cancelled" }).eq("id", a!.id);
        if (erroCancelada) throw erroCancelada;
      }
      return json({ ok: true }, 200, origin);
    }

    if (acao === "aluno_app_plano") {
      const m = await minhaMatricula(body.paciente_id);
      if (!ehDoApp(m)) falhar("nao_e_do_app");
      const plano = String(body.plano || "");
      if (!/^app_[a-z_]{1,40}$/.test(plano)) falhar("plano_invalido");
      const { data: r0, error: et } = await db.rpc("app_trocar_plano", { p_paciente: m.id, p_plano: plano, p_por: user.id });
      if (et) throw et;
      const r = (r0 ?? {}) as { ok?: boolean; erro?: string; mudou?: boolean; valor?: number; nome?: string; plano?: string };
      if (!r.ok) falhar(r.erro || "plano_invalido");
      // a cobrança automática no cartão passa para o valor novo (como o "Trocar de plano" das contas — spec 6.2)
      let assinatura: string | null = null;
      if (r.mudou) {
        const a = await assinaturaDe(m.id);
        if (a?.mp_preapproval_id && a.status === "authorized" && !simulado(a.mp_preapproval_id) && a.payload?.simulada !== true) {
          const { status: st, body: pre } = await mpFetch<AssinaturaMp>(credencial, `/preapproval/${encodeURIComponent(a.mp_preapproval_id)}`, {
            method: "PUT", body: JSON.stringify({ auto_recurring: { transaction_amount: Number(r.valor), currency_id: "BRL" } }),
          }, { prazo: prazoDoPedido });
          if (st >= 300 || !pre?.id) {
            log.erro({ codigo: "mp_valor_assinatura_app_falhou", schema, acao, ref: a.id, status: st, externo: codigosDoMp(pre) });
            assinatura = "falhou";
          } else {
            const { error: erroValor } = await db.from("aluno_assinaturas").update({ ...espelhoAssinaturaAluno(pre, { ...(a.payload ?? {}), valor_trocado_em: new Date().toISOString() }), valor: Number(r.valor) }).eq("id", a.id);
            if (erroValor) throw erroValor;
            assinatura = "atualizada";
          }
        } else if (a && ["authorized", "pending"].includes(a.status)) {
          const { error: erroValor } = await db.from("aluno_assinaturas").update({ valor: Number(r.valor) }).eq("id", a.id);
          if (erroValor) throw erroValor;
          assinatura = "atualizada";
        }
      }
      return json({ ok: true, mudou: r.mudou === true, plano: r.plano, nome: r.nome ?? null, valor: Number(r.valor), assinatura }, 200, origin);
    }

    if (acao === "aluno_mp_conferir") {
      const c = await buscarCobranca(body.cobranca_id);
      const m = await minhaMatricula(c.paciente_id);
      const atual = await conferir(c, m);
      return json({ ok: true, cobranca: vista(atual, atual.status === "aguardando_confirmacao") }, 200, origin);
    }

    if (acao === "simular_aprovacao") {
      if (schema !== "staging") falhar("so_staging", 403);
      const c = await buscarCobranca(body.cobranca_id);
      const m = await carregarMatricula(db, c.paciente_id);
      if (!m) falhar("not_found", 404);
      const dono = m!.user_id === user.id;
      if (!dono) {
        const r = await matriculaDoPainel(m!.id);
        exigirMensalidade(r.p);
      }
      if (c.forma !== "mp" || c.status !== "aguardando_confirmacao") falhar("nao_pendente");
      // W1b: o Pix do sandbox só é fechado no MP se for DESTA cobrança; o de outra coisa é 409 e a linha não vira paga. W2: com a credencial
      // DELA (o collector); sem ela (outra conta do MP), só a linha — como o MP sem resposta
      if (c.mp_payment_id && !simulado(c.mp_payment_id)) {
        const cred = await credencialDaCobranca(db, ctxMp, c, credencial);
        if (cred && (await cancelarNoMp(c, m!, cred)) === "outro") falhar("cobranca_de_outro_pagamento", 409);
      }
      const { error: erroPaga } = await db.from("cobrancas").update({ status: "paga", mp_status: "approved", pago_em: new Date().toISOString(), metodo: c.metodo ?? "pix" }).eq("id", c.id);
      if (erroPaga) throw erroPaga;
      await avisar(db, m!.user_id, "pagamento_confirmado", `Pagamento confirmado · ${reais(c.valor)}`, "/perfil/pagamentos", log, schema);
      return json({ ok: true, simulado: true, cobranca: vista(await buscarCobranca(c.id)) }, 200, origin);
    }

    if (acao === "detalhe_mp") {
      const c = await buscarCobranca(body.cobranca_id);
      const m = await carregarMatricula(db, c.paciente_id);
      if (!m) falhar("not_found", 404);
      if (m!.user_id !== user.id) {
        const r = await matriculaDoPainel(m!.id);
        if (!podeVerCobranca(r.p, c)) falhar("not_found", 404);
      }
      if (!c.mp_payment_id || simulado(c.mp_payment_id)) return json({ ok: true, mp: null }, 200, origin);
      // W2: a credencial DESTA cobrança (o collector — leitura, I3): a de outra conta do MP (ou sem acesso guardado) não é lida → mp null +
      // motivo; a conexão caída ou o MP fora → mp null, como o MP sem resposta (lerSemDerrubar: undefined)
      const cred = await lerSemDerrubar<CredencialMp | null | undefined>(c.id, () => credencialDaCobranca(db, ctxMp, c, credencial, { leitura: true }), undefined);
      if (cred === null) return json({ ok: true, mp: null, motivo: "outra_conta_mp" }, 200, origin);
      // W1b: só o pagamento DESTA cobrança; o de outra coisa é 409 sem nenhum dado dele (a tela do aluno já trata: Pagamentos.tsx, .catch)
      const semResposta: { status: number; pay: (PagamentoMpDetalhe & PagamentoMp) | null; daCobranca: boolean } = { status: 0, pay: null, daCobranca: false };
      const conferido = cred ? await lerSemDerrubar(c.id, () => pagamentoDaLinha<PagamentoMpDetalhe & PagamentoMp>(c, m!, cred), semResposta) : semResposta;
      if (!conferido.pay) return json({ ok: true, mp: null }, 200, origin);
      exigirDaCobranca(conferido, c);
      const pay = conferido.pay;
      const emailPagador = pay.payer?.email || null;
      // hml-19 (H-55): o profissional vê o final do cartão e a data; e-mail, nome no cartão e banco de quem pagou só o próprio aluno
      const souOAluno = m!.user_id === user.id;
      return json({
        ok: true,
        mp: {
          status: pay.status ?? null, status_detail: pay.status_detail ?? null, date_approved: pay.date_approved ?? null,
          payment_method: pay.payment_method_id ?? null, payment_type: pay.payment_type_id ?? null,
          payer_email: souOAluno && emailPagador && !/x{3,}/i.test(emailPagador) ? emailPagador : null,
          payer_nome: souOAluno ? pay.card?.cardholder?.name ?? null : null,
          banco_pagador: souOAluno ? pay.point_of_interaction?.transaction_data?.bank_info?.payer?.long_name ?? null : null,
          // o e2e_id do Pix começa com o ISPB do banco de quem pagou: também só para o aluno (a conciliação usa o mp_payment_id)
          e2e_id: souOAluno ? pay.point_of_interaction?.transaction_data?.e2e_id ?? null : null, card_last4: pay.card?.last_four_digits ?? null,
          mp_payment_id: c.mp_payment_id,
        },
      }, 200, origin);
    }

    // ════════════════════════════ W1 — O ALUNO PAGA PELA INFINITEPAY ════════════════════════════
    if (acao === "aluno_ip_link") {
      const m = await minhaMatricula(body.paciente_id);
      const handle = await exigirInfinitePay(m);
      if (!permitido(`ip-link:${user.id}`, 10, 600_000)) falhar("rate_limited", 429);
      await fecharVencidas(db, m.id);
      const alvo = await alvoDoPagamento(m, body.cobranca_id);
      // a avulsa com comprovante de Pix esperando o personal não vira tentativa da InfinitePay
      if (alvo.avulsa && alvo.avulsa.status === "aguardando_confirmacao" && alvo.avulsa.forma !== "infinitepay") falhar("cobranca_nao_aberta");
      const valor = centavos(alvo.valor);
      if (!valor) falhar("sem_mensalidade");
      const viva = await tentativaVivaDe(m, alvo);
      if (viva && podeReaproveitar(viva, { centavos: valor!, handle }, new Date())) {
        return json({ ok: true, url: viva.ip_link_url, cobranca: vista(viva), reutilizado: true }, 200, origin);
      }
      if (viva && !alvo.avulsa) await encerrarTentativa(viva);
      const linha = await linhaParaIp(m, alvo, handle);
      // I4: um order_nsu por link (<cobranca_id>-<n>), com a InfiniteTag e o preço DESTE link — a confirmação confere com os 2
      let pedido: string | null = null;
      let url: string;
      try {
        pedido = await novoLink(db, linha.id, handle, valor!);
        url = await linkOuFalha({
          handle, centavos: valor!, descricao: descricaoDoLink(linha.descricao), pedido,
          volta: urlDeVolta(schema, origin), webhook: urlDoWebhook(SUPABASE_URL, schema),
        }, linha.id);
      } catch (e) {
        await desfazerTentativa(linha, pedido);
        throw e;
      }
      const { error: el } = await db.from("infinitepay_links").update({ url }).eq("pedido", pedido!);
      if (el) throw el;
      const { data: salva, error } = await db.from("cobrancas").update({ ip_link_url: url }).eq("id", linha.id).select(await colunasCobranca()).single();
      if (error) throw error;
      return json({ ok: true, url, cobranca: vista(salva as unknown as Cobranca), reutilizado: false }, 200, origin);
    }

    if (acao === "aluno_ip_volta") {
      const aviso = lerVolta(body);
      if (!aviso) falhar("volta_invalida");
      // a função é uma só para public e staging: sem a migration no schema não há link nem caixa (era 500 com aviso de erro)
      if (!(await schemaTemW1(db, schema))) falhar("w1_indisponivel", 409);
      const c = await cobrancaComApagada(aviso!.cobranca);
      await minhaMatricula(c.paciente_id); // só a própria
      const link = await linkDoPedido(db, aviso!.pedido);
      if (!link || link.cobranca_id !== c.id) falhar("cobranca_invalida");
      const reg = await registrarAviso(db, link!, aviso!, "volta");
      // a volta é da tela (I3): confere o aviso que está na hora, sem gastar tentativa; fora do prazo ou no teto (I6), só relê
      const resultado = "ignorado" in reg ? `ignorado_${reg.ignorado}` : await conferirAviso(db, reg.id, ctxIp(), "tela");
      const atual = await cobrancaComApagada(c.id);
      return json({ ok: true, resultado, paga: atual.status === "paga", cobranca: vista(atual) }, 200, origin);
    }

    if (acao === "aluno_ip_conferir") {
      const c = await cobrancaComApagada(body.cobranca_id);
      await minhaMatricula(c.paciente_id);
      if (!c.ip_handle) falhar("cobranca_invalida");
      // I3: da tela — o aviso pendente que já está na hora, 1 por vez, sem gastar tentativa; sem NENHUM aviso, só pelo pedido (W1-B2)
      let resultado: string = await conferirAvisosPendentes(db, { cobrancaId: c.id }, ctxIp(), 1, "tela");
      if (resultado === "nenhum" && c.status === "aguardando_confirmacao") resultado = await conferirPeloPedido(db, c.id, ctxIp());
      const atual = await cobrancaComApagada(c.id);
      return json({ ok: true, resultado, paga: atual.status === "paga", cobranca: vista(atual) }, 200, origin);
    }

    // ════════════════════════════ PROFISSIONAL ════════════════════════════
    // ════════════════════════════ W1 — CONFIGURAÇÕES › RECEBIMENTO (jeito 2) ════════════════════════════
    if (acao === "prof_recebimento") {
      return json(await recebimentoVista(await contaDoRecebimento(body.conta_id)), 200, origin);
    }

    if (acao === "prof_recebimento_salvar") {
      const conta = await contaDoRecebimento(body.conta_id);
      if (conta.origem === "app" && !ehMaster) falhar("conta_do_app", 403);
      const lido = lerPedidoDoRecebimento(body);
      if (!lido.ok) return falhar(lido.erro);
      const pedido = lido.pedido;
      let linkTeste: string | null = null;
      if (pedido.handle !== undefined) {
        if (!(await schemaTemW1(db, schema))) falhar("w1_indisponivel", 409);
        if (pedido.handle) {
          if (!(await infinitepayLiberada())) falhar("infinitepay_em_teste", 403);
          // a InfiniteTag existe? um link de R$ 1,00 que ninguém precisa pagar, sem webhook — o mesmo do "Testar"
          linkTeste = await linkOuFalha(pedidoDeTeste(pedido.handle, urlDeVolta(schema, origin, "/painel/configuracoes/recebimento")), conta.id);
        }
        const { data, error } = await dbPessoa.rpc("recebimento_infinitepay_salvar", { p_conta: conta.id, p_handle: pedido.handle });
        if (error) throw error;
        const r = (data ?? {}) as { ok?: boolean; erro?: string };
        if (!r.ok) falhar(r.erro || "erro_interno", statusDoErroDaRpc(r.erro || ""));
      }
      let canceladas = 0;
      if (pedido.modo !== undefined && pedido.modo !== conta.modo) {
        if (pedido.modo === "mercadopago" && !ehMaster) falhar("mp_so_master", 403);
        if (pedido.modo === "infinitepay") {
          if (!(await schemaTemW1(db, schema))) falhar("w1_indisponivel", 409);
          if (!(await infinitepayLiberada())) falhar("infinitepay_em_teste", 403);
          const ip = await integracaoIp(conta.id);
          if (!ip || ip.status !== "ativa") falhar("sem_infinitetag", 409);
        }
        if (pedido.modo === "mercadopago_conta") {
          // W2: o MP da conta só com a conexão ATIVA (a guarda contas_guard_mp é a 2ª camada) e a flag — o "Salvar a forma" depois do
          // conectado_sem_trocar (a confirmação conectou, mas havia automática viva no MP de antes)
          if (!(await schemaTemW2(db, schema))) falhar("w2_indisponivel", 409);
          if (!(await mpContaLiberada())) falhar("mp_conta_em_teste", 403);
          if ((await integracaoMp(db, conta.id))?.status !== "ativa") falhar("mp_nao_conectado", 409);
        }
        if (ehModoMp(conta.modo)) {
          // a regra cruzada (spec-review), W2: para os 2 MPs — sair de um Mercado Pago com cobrança automática viva cancela, com o OK de
          // quem troca, cada uma pela credencial DELA. MENOR 11 (troca o MENOR 6 da W1): a recusa (sem acesso → 409 mp_sem_acesso; o MP
          // recusou ou caiu → 502 automaticas_nao_canceladas) não muda o modo — a guarda do banco nem deixaria com a automática viva
          const ids = await pacientesComAutomaticaViva(db, conta.id);
          if (ids.length && !pedido.cancelarAutomaticas) falhar("automaticas_ativas", 409, { alunos: ids.length });
          if (ids.length) {
            const r = await desligarAutomaticas(conta.id, ids, "trocou_a_forma");
            const recusa = recusaDoCancelamento(r);
            if (recusa) return falhar(recusa.codigo, recusa.http, recusa.extra);
            canceladas = r.canceladas;
          }
        }
        const { data, error } = await dbPessoa.from("contas").update({ recebimento_modo: pedido.modo }).eq("id", conta.id).select("recebimento_modo");
        if (error) {
          // W2: a guarda do modo (contas_guard_mp — para todo mundo) recusou: entrar no MP da conta sem a conexão ativa, ou uma automática
          // nova entre o cancelamento e a troca → 409 com o código, nunca 500
          const guarda = erroDaGuardaDoModo(error);
          if (guarda) return falhar(guarda.codigo, guarda.http, guarda.extra);
          throw error;
        }
        // a contas_guard desfaz em silêncio o que não pode (o APK antigo conta com isso): a resposta diz a verdade
        if (((data ?? []) as Array<{ recebimento_modo: string }>)[0]?.recebimento_modo !== pedido.modo) {
          falhar(pedido.modo === "infinitepay" ? "sem_infinitetag" : pedido.modo === "mercadopago_conta" ? "mp_nao_conectado" : "sem_permissao", 409);
        }
      }
      if (pedido.bloquear !== undefined && pedido.bloquear !== conta.bloquear) {
        const { data, error } = await dbPessoa.from("contas").update({ bloquear_app_inadimplente: pedido.bloquear }).eq("id", conta.id)
          .select("bloquear_app_inadimplente");
        if (error) throw error;
        if (((data ?? []) as Array<{ bloquear_app_inadimplente: boolean }>)[0]?.bloquear_app_inadimplente !== pedido.bloquear) falhar("sem_permissao", 403);
      }
      // automaticas_falhas: o campo da W1 fica (o APK antigo lê) — sempre 0 numa resposta 200: a falha agora é o 502 (MENOR 11)
      return json({ ...(await recebimentoVista(await contaDoRecebimento(conta.id))), link_teste: linkTeste, automaticas_canceladas: canceladas,
        automaticas_falhas: 0 }, 200, origin);
    }

    if (acao === "prof_ip_testar") {
      const conta = await contaDoRecebimento(body.conta_id);
      if (!(await schemaTemW1(db, schema))) falhar("w1_indisponivel", 409);
      if (!(await infinitepayLiberada())) falhar("infinitepay_em_teste", 403);
      if (!permitido(`ip-teste:${user.id}`, 10, 3_600_000)) falhar("rate_limited", 429);
      const salva = body.handle === undefined ? (await integracaoIp(conta.id))?.infinitepay_handle ?? null : null;
      const handle = body.handle === undefined ? salva : normalizarHandle(body.handle);
      if (!handle) falhar(body.handle === undefined ? "sem_infinitetag" : "infinitetag_invalida", body.handle === undefined ? 409 : 400);
      const url = await linkOuFalha(pedidoDeTeste(handle!, urlDeVolta(schema, origin, "/painel/configuracoes/recebimento")), conta.id);
      return json({ ok: true, url }, 200, origin);
    }

    if (acao === "prof_chave_salvar") {
      const conta = await contaDoRecebimento(body.conta_id);
      const v = chaveDoPedido(body);
      if (!v.ok) return falhar("chave_invalida", 400, { mensagem: v.mensagem });
      if (body.id !== undefined) {
        if (!ehUuidFin(body.id)) falhar("chave_inexistente", 404);
        const { data, error } = await dbPessoa.from("recebimento_chaves").update(v.dados).eq("id", String(body.id)).eq("conta_id", conta.id)
          .select(COLUNAS_CHAVE).maybeSingle();
        if (error) throw error;
        if (!data) falhar("chave_inexistente", 404);
        return json({ ok: true, chave: data }, 200, origin);
      }
      const { count, error: ec } = await dbPessoa.from("recebimento_chaves").select("id", { count: "exact", head: true })
        .eq("conta_id", conta.id).eq("ativa", true);
      if (ec) throw ec;
      // sem nenhuma ligada, a nova já nasce ligada (como a tela fazia)
      const { data, error } = await dbPessoa.from("recebimento_chaves")
        .insert({ conta_id: conta.id, membro_id: await meuMembroId(conta.id), ...v.dados, ativa: (count ?? 0) === 0 })
        .select(COLUNAS_CHAVE).single();
      if (error) throw error;
      return json({ ok: true, chave: data }, 200, origin);
    }

    if (acao === "prof_chave_ligar") {
      const conta = await contaDoRecebimento(body.conta_id);
      if (!ehUuidFin(body.id)) falhar("chave_inexistente", 404);
      const id = String(body.id);
      const ligar = body.ligar === true;
      const { data, error } = await dbPessoa.rpc("recebimento_chave_ligar", { p_conta: conta.id, p_chave: id, p_ligar: ligar });
      if (error && !semARpc(error)) throw error;
      if (error) {
        // o schema sem a W1 (o public antes da migration): os 2 passos de antes (a tela fazia assim), como a pessoa
        if (ligar) {
          const { error: e1 } = await dbPessoa.from("recebimento_chaves").update({ ativa: false }).eq("conta_id", conta.id).eq("ativa", true).neq("id", id);
          if (e1) throw e1;
        }
        const { data: d2, error: e2 } = await dbPessoa.from("recebimento_chaves").update({ ativa: ligar }).eq("id", id).eq("conta_id", conta.id).select("id");
        if (e2) throw e2;
        if (!d2?.length) falhar("chave_inexistente", 404);
        return json({ ok: true }, 200, origin);
      }
      const r = (data ?? {}) as { ok?: boolean; erro?: string };
      if (!r.ok) falhar(r.erro || "chave_inexistente", 404);
      return json({ ok: true }, 200, origin);
    }

    if (acao === "prof_chave_excluir") {
      const conta = await contaDoRecebimento(body.conta_id);
      if (!ehUuidFin(body.id)) falhar("chave_inexistente", 404);
      const { data, error } = await dbPessoa.from("recebimento_chaves").delete().eq("id", String(body.id)).eq("conta_id", conta.id).select("id");
      if (error) throw error;
      if (!data?.length) falhar("chave_inexistente", 404);
      return json({ ok: true }, 200, origin);
    }

    // ════════════════════════════ W2 — O MERCADO PAGO DA CONTA (conectar, confirmar, desconectar, simular) ════════════════════════════
    if (acao === "prof_mp_conectar") {
      const conta = await contaDoRecebimento(body.conta_id);           // dono e master leem — COMO A PESSOA
      // MENOR 19: SÓ o dono DE VERDADE liga (o desenho D4) — o master só na conta em que é dono (o admin.teste da Task 23 continua
      // funcionando); sem isso o master ligaria o MP DELE na conta de um personal (às vezes com o consentimento automático do MP)
      if (!(await donoDeVerdade(conta.id))) falhar("so_o_dono", 403);
      if (conta.origem === "app") falhar("conta_do_app", 403);         // a conta do app é o MP do Physiq: nunca OAuth
      if (!(await schemaTemW2(db, schema))) falhar("w2_indisponivel", 409);
      if (!(await mpContaLiberada())) falhar("mp_conta_em_teste", 403);
      // decisão 6 (I8): no APK o fluxo inteiro acontece no SITE, no navegador por cima do app (a sessão do app não chega ao navegador — e a
      // confirmação tem de vir da sessão de quem começou). Nada é criado aqui: o site, logado, chama esta ação de novo com origem "site".
      if (body.origem === "apk") return json({ ok: true, url: `${SITE[schema]}/painel/configuracoes/recebimento?mp=conectar`, no_site: true }, 200, origin);
      const oauth = oauthDoAmbiente(schema);
      if (!oauth || !chaveMp) return falhar("mp_oauth_nao_configurado", 503);
      if (!permitido(`mp-conectar:${user.id}`, 10, 3_600_000)) falhar("rate_limited", 429);
      // SÓ staging: o redirect que a aplicação já tem (decisão 3) — a prova e o E2E do OAuth real antes da W2-a
      const redirect = body.redirect_teste === true && schema === "staging" ? REDIRECT_TESTE_MP : redirectDoSchema(schema);
      const estado = novoSegredoUrl(32);
      const verificador = novoSegredoUrl(48);
      // o state de uso único (10 min): só o sha256 vai ao banco; o verifier do PKCE, cifrado (a volta — mp-conectar-retorno — decifra)
      const { error } = await db.from("mp_conexoes").insert({
        estado_hash: await sha256Hex(estado), conta_id: conta.id, user_id: user.id, redirect_uri: redirect,
        verificador: await cifrar(verificador, dadoAssociado(schema, conta.id, "pkce"), chaveMp),
      });
      if (error) throw error;
      const url = urlDeAutorizacao({ base: MP_AUTH_BASE, clientId: oauth.clientId, redirect, estado,
        desafio: pkceLigado() ? await desafioPkce(verificador) : null });
      log.info({ codigo: "mp_conectar_inicio", schema, acao, ref: conta.id });
      // I8: só a URL do MP — o id da conexão NÃO sai daqui (ele só chega ao site pela volta, para a sessão de quem começou confirmar)
      return json({ ok: true, url, expira_em: new Date(Date.now() + ESTADO_MS).toISOString() }, 200, origin);
    }

    if (acao === "prof_mp_confirmar") {
      if (!ehUuidMp(body.conexao_id)) falhar("mp_conexao_invalida", 400);
      const conexaoId = String(body.conexao_id);
      if (!(await schemaTemW2(db, schema))) falhar("w2_indisponivel", 409);
      if (body.confirmar !== true) {
        // a pergunta da tela ("Conectar a conta X do Mercado Pago?"): só o apelido, só para QUEM COMEÇOU — a mesma regra da RPC
        const { data, error } = await db.from("mp_conexoes").select("user_id, resultado, usado_em, mp_apelido, live").eq("id", conexaoId).maybeSingle();
        if (error) throw error;
        const c = data as { user_id: string; resultado: string | null; usado_em: string | null; mp_apelido: string | null; live: boolean | null } | null;
        if (!c || c.resultado !== "confirmar") return falhar("mp_invalido", 409);
        if (c.user_id !== user.id) falhar("mp_outra_pessoa", 403);
        if (!c.usado_em || Date.parse(c.usado_em) < Date.now() - 15 * 60_000) falhar("mp_vencido", 409);
        return json({ ok: true, apelido: c.mp_apelido, teste: c.live === false }, 200, origin);
      }
      // a gravação é COMO A PESSOA (jeito 2): a RPC confere auth.uid() = quem começou, sou_dono, 15 min, a flag e o I5 (outra conta com algo aberto)
      const { data, error } = await dbPessoa.rpc("recebimento_mp_confirmar", { p_conexao: conexaoId });
      if (error) throw error;
      const r = (data ?? {}) as { ok?: boolean; resultado?: "ok" | "conectado_sem_trocar"; erro?: string; abertos?: number; apelido?: string | null };
      if (!r.ok) {
        const recusa = erroDaConfirmacao(r);
        log.aviso({ codigo: "mp_confirmar_recusado", schema, acao, ref: conexaoId, resultado: recusa.codigo });
        return falhar(recusa.codigo, recusa.http, recusa.extra);
      }
      log.info({ codigo: "mp_conectado", schema, acao, ref: conexaoId, resultado: r.resultado });
      const contaId = await contaDaConexao(conexaoId);                // service_role: o conta_id da conexão (para a vista)
      return json({ ok: true, resultado: r.resultado ?? "ok", apelido: r.apelido ?? null,
        recebimento: await recebimentoVista(await contaDoRecebimento(contaId)) }, 200, origin);
    }

    if (acao === "prof_mp_desconectar") {
      const conta = await contaDoRecebimento(body.conta_id);           // dono e master (o master desliga o de um personal, com o OK)
      if (!(await schemaTemW2(db, schema))) falhar("w2_indisponivel", 409);
      const integ = await integracaoMp(db, conta.id);
      if (!integ || integ.status === "desconectada") return falhar("mp_nao_conectado", 409);
      // no modo do MP da conta, a troca de modo exige TODAS as automáticas vivas desligadas (a guarda contas_guard_mp); fora dele (MENOR 10:
      // conectou e não salvou a forma — o modo segue o de antes), só as DESTA conta do MP: as do MP do Physiq seguem com o modo
      const noModo = conta.modo === "mercadopago_conta";
      const ids = noModo ? await pacientesComAutomaticaViva(db, conta.id) : await automaticasNaContaDoMp(conta.id, integ.mp_user_id);
      if (ids.length && body.cancelar_automaticas !== true) falhar("automaticas_ativas", 409, { alunos: ids.length });
      let canceladas = 0;
      if (ids.length) {
        const r = await desligarAutomaticas(conta.id, ids, "personal_desconectou_o_mp");
        const recusa = recusaDoCancelamento(r);
        if (recusa) return falhar(recusa.codigo, recusa.http, recusa.extra);   // nada mais muda: o modo e a conexão ficam
        canceladas = r.canceladas;
      }
      let novoModo = conta.modo;
      if (noModo) {
        // o modo COMO A PESSOA (o RLS e as guardas valem): o gatilho contas_saiu_do_mp_conta marca a integração desconectada — o acesso
        // fica 7 dias só para LER o que já estava em andamento (decisão 10)
        novoModo = modoDepoisDeDesconectar(!!(await chaveAtiva(conta.id)));
        const { data, error } = await dbPessoa.from("contas").update({ recebimento_modo: novoModo }).eq("id", conta.id).select("recebimento_modo");
        if (error) {
          const guarda = erroDaGuardaDoModo(error);                    // corrida: uma automática nova entre o cancelamento e a troca
          if (guarda) return falhar(guarda.codigo, guarda.http, guarda.extra);
          throw error;
        }
        if (((data ?? []) as Array<{ recebimento_modo: string }>)[0]?.recebimento_modo !== novoModo) falhar("sem_permissao", 409);
      } else {
        // MENOR 10: o modo já não é o MP da conta — a troca não acontece e o gatilho não roda: marca direto (a tabela é só do servidor)
        const { error } = await db.from("recebimento_integracoes").update({ status: "desconectada", desconectada_em: new Date().toISOString(),
          mp_renovando_ate: null }).eq("conta_id", conta.id).eq("provedor", "mercadopago").neq("status", "desconectada");
        if (error) throw error;
      }
      const { error: erroEvento } = await db.from("conta_eventos").insert({
        conta_id: conta.id, tipo: "outro", antes: { recebimento_modo: conta.modo, mp: integ.status },
        depois: { w2: "mp_desconectado", recebimento_modo: novoModo, automaticas_canceladas: canceladas }, por: user.id,
      });
      if (erroEvento) throw erroEvento;
      log.info({ codigo: "mp_desconectado", schema, acao, ref: conta.id, n: canceladas });
      return json({ ...(await recebimentoVista(await contaDoRecebimento(conta.id))), automaticas_canceladas: canceladas }, 200, origin);
    }

    if (acao === "prof_mp_simular_conexao") {
      // decisão 12 — SÓ staging, SÓ master: conecta com a credencial de TESTE da aplicação (lida do ambiente; nada vem do navegador além da
      // chave pública de teste). MENOR 16: prova a GRAVAÇÃO e os caminhos da conta — collector e token são os do Physiq; o token de cada
      // chamada quem prova é o --local (e2e/w2/api.py)
      if (schema !== "staging") falhar("so_staging", 403);
      if (!ehMaster) falhar("so_master", 403);
      if (!(await schemaTemW2(db, schema))) falhar("w2_indisponivel", 409);
      const conta = await contaDoRecebimento(body.conta_id);
      if (conta.origem === "app") falhar("conta_do_app", 403);         // a conta do app é o MP do Physiq
      const token = tokenMp("test");                                     // do ambiente — nada vem do navegador
      if (!token || !chaveMp) return falhar("mp_conta_nao_configurado", 503);
      const { status: st, body: eu } = await mpFetch<{ id?: number; nickname?: string }>("test", "/users/me", {}, { prazo: prazoDoPedido });
      if (st !== 200 || !eu?.id) return falhar("mp_error", 502, { status_mp: st });
      const chavePublica = typeof body.chave_publica === "string" && /^TEST-[A-Za-z0-9-]{8,72}$/.test(body.chave_publica) ? body.chave_publica : null;
      const { error } = await db.from("recebimento_integracoes").upsert({
        conta_id: conta.id, provedor: "mercadopago", status: "ativa", mp_user_id: eu.id, mp_apelido: "TESTE (simulada)", mp_public_key: chavePublica,
        mp_access_token: await cifrar(token, dadoAssociado(schema, conta.id, "access"), chaveMp), mp_refresh_token: null,
        mp_expira_em: new Date(Date.now() + 180 * 86_400_000).toISOString(), mp_teste: true, mp_origem: "teste_sem_oauth", mp_erro: null,
        mp_renovar_tentativas: 0, conectado_em: new Date().toISOString(), desconectada_em: null, atualizado_por: user.id,
      }, { onConflict: "conta_id,provedor" });
      if (error) throw error;
      log.info({ codigo: "mp_conexao_simulada", schema, acao, ref: conta.id });
      return json(await recebimentoVista(await contaDoRecebimento(conta.id)), 200, origin);
    }

    if (acao === "prof_planos") {
      // Task 8b (decisão do Weslley 10/10, ponto 1): os planos e os valores, só o dono — igual à mensalidade; o master continua lendo
      // (inclusive a conta do app, que ele não grava por aqui)
      const conta = await contaDosPlanos(body.conta_id, false);
      if (!conta.papel.master && !conta.papel.dono) falhar("so_o_dono", 403);
      const { data, error } = await db.from("planos_aluno").select(COLUNAS_PLANO).eq("conta_id", conta.id).order("ativo", { ascending: false }).order("nome");
      if (error) throw error;
      const planos = (data ?? []) as unknown as PlanoDoAluno[];
      const alunos = await Promise.all(planos.map(async (pl) => {
        const { count, error: ec } = await db.from("pacientes").select("id", { count: "exact", head: true }).eq("plano_aluno_id", pl.id).is("deleted_at", null);
        if (ec) throw ec;
        return count ?? 0;
      }));
      return json({
        ok: true, modo: conta.modo, app: conta.app, pode_editar: (conta.papel.master || conta.papel.dono) && !conta.app,
        modalidades_da_conta: modalidadesDaConta(conta.modo),
        planos: planos.map((pl, i) => ({ ...pl, completo: planoCompleto(pl), parcela: parcelaMensal(pl), alunos: alunos[i] })),
      }, 200, origin);
    }

    if (acao === "prof_plano_salvar") {
      const conta = await contaDosPlanos(body.conta_id, true);
      // W1 (P-B): o plano que já tem uma modalidade fica com ela, mesmo que a forma de receber de agora não a ofereça (quem passou do MP
      // para a InfinitePay não fica travado num plano com aluno em "cartão parcelado"); plano novo só com o que a conta recebe
      let atuais: unknown[] = [];
      if (ehUuidFin(body.id)) {
        const { data: pl, error: epl } = await db.from("planos_aluno").select("modalidades").eq("id", String(body.id)).eq("conta_id", conta.id).maybeSingle();
        if (epl) throw epl;
        atuais = (pl as { modalidades: string[] } | null)?.modalidades ?? [];
      }
      const v = validarPlano(body, modalidadesPermitidasNoPlano(conta.modo, atuais));
      if (!v.ok) return falhar(v.erro);
      const plano = v.plano;
      const id = ehUuidFin(body.id) ? String(body.id) : null;
      if (id) {
        // não tira uma modalidade que tem aluno nela (o personal passa os alunos para outra antes)
        const removidas = MODALIDADES.filter((x) => !plano.modalidades.includes(x));
        if (removidas.length) {
          const { count, error } = await db.from("pacientes").select("id", { count: "exact", head: true }).eq("plano_aluno_id", id)
            .eq("conta_id", conta.id).in("plano_modalidade", removidas).is("deleted_at", null);
          if (error) throw error;
          if ((count ?? 0) > 0) falhar("modalidade_em_uso", 409, { alunos: count });
        }
      }
      const { data: salvo, error } = id
        ? await db.from("planos_aluno").update(plano).eq("id", id).eq("conta_id", conta.id).select(COLUNAS_PLANO).maybeSingle()
        : await db.from("planos_aluno").insert({ ...plano, conta_id: conta.id }).select(COLUNAS_PLANO).single();
      if (error) {
        if (String(error.code) === "23505") falhar("nome_repetido", 409);
        throw error;
      }
      if (!salvo) falhar("plano_invalido", 404);
      const automaticas = id ? await sincronizarAutomaticasDoPlano(id) : { enfileiradas: 0 };
      return json({ ok: true, plano: salvo, automaticas }, 200, origin);
    }

    if (acao === "prof_plano_ativo") {
      const conta = await contaDosPlanos(body.conta_id, true);
      if (!ehUuidFin(body.id)) falhar("plano_invalido");
      const { data, error } = await db.from("planos_aluno").update({ ativo: body.ativo === true }).eq("id", String(body.id)).eq("conta_id", conta.id)
        .select(COLUNAS_PLANO).maybeSingle();
      if (error) throw error;
      if (!data) falhar("plano_invalido", 404);
      return json({ ok: true, plano: data }, 200, origin);
    }

    if (acao === "prof_resumo") {
      if (!ehUuidFin(body.conta_id)) falhar("conta_invalida");
      const contaId = String(body.conta_id);
      // hml-14b (B21): com `pagina` a tela Mensalidades recebe só a página (e `pagina_sem`, a dos sem mensalidade) com a `busca`;
      // sem `pagina` a resposta é a de hoje, campo a campo (o APK antigo, o Resumo, o Dashboard e Configurações › Recebimento)
      let pagina: number | null = null;
      let paginaSem = 1;
      try {
        pagina = lerPagina(body.pagina);
        if (pagina !== null) paginaSem = lerPagina(body.pagina_sem) ?? 1;
      } catch (e) {
        if (e instanceof PaginaInvalida) falhar("pagina_invalida");
        throw e;
      }
      const { data: membro } = await db.from("conta_membros").select("papeis").eq("conta_id", contaId).eq("user_id", user.id).eq("status", "ativo").maybeSingle();
      const papeis = ((membro as { papeis: string[] } | null)?.papeis ?? []) as string[];
      if (!ehMaster && !papeis.length) falhar("sem_permissao", 403);
      const dono = ehMaster || papeis.includes("dono");
      // W-P: a modalidade e os meses do plano (o "/mês" da lista vira "/ano" ou " por N meses") — só no schema com a migration
      const wp = await schemaTemPlanos();
      // hml-14 (H-32, D9): os alunos da conta em páginas de 1000 (o PostgREST corta calado em 1000) com ordem estável (nome, id);
      // as cobranças em lotes de 150 alunos (o .in() com centenas de uuid estoura a URL). Erro em qualquer leitura lança (500) —
      // antes a leitura das cobranças com erro fazia a tela dizer "nenhum Pix a conferir" e zerar as abertas.
      const alunosDaConta = (de: number, ate: number) => {
        let q = db.from("pacientes").select(`id, treino_user_id, nome, email, ativo, personal_id, nutricionista_id, mensalidade_valor, cobranca_pausada, mensalidade_pago_ate, mensalidade_desde${wp ? ", plano_modalidade, plano:planos_aluno(nome, meses)" : ", plano:planos_aluno(nome)"}`)
          .eq("conta_id", contaId).is("deleted_at", null);
        if (!dono) q = q.or(`personal_id.eq.${user.id},nutricionista_id.eq.${user.id}`);
        return q.order("nome").order("id").range(de, ate);
      };
      const lista = (await todasAsPaginas(alunosDaConta)) as unknown as LinhaAlunoResumo[];
      const ids = lista.map((a) => a.id);
      let pendentes: Cobranca[] = [];
      let abertas: Array<{ paciente_id: string }> = [];
      if (ids.length) {
        // os 200 comprovantes mais antigos aguardando (o mesmo corte de antes): os 200 de cada lote, juntos e cortados de novo
        const pend = await emLotes(ids, 150, async (lote) => {
          const { data, error } = await db.from("cobrancas").select(COLUNAS_COBRANCA).in("paciente_id", lote).eq("status", "aguardando_confirmacao")
            .eq("forma", "pix_manual").is("deleted_at", null).order("enviado_em", { ascending: true }).limit(200);
          if (error) throw error;
          return (data ?? []) as unknown as Cobranca[];
        });
        pendentes = pend.sort(porEnvio).slice(0, 200).filter((c) => dono || c.nutricionista_id === user.id || c.criado_por === user.id);
        const ab = await emLotes(ids, 150, (lote) =>
          todasAsPaginas<{ paciente_id: string; nutricionista_id: string | null; criado_por: string | null }>((de, ate) =>
            db.from("cobrancas").select("paciente_id, nutricionista_id, criado_por").in("paciente_id", lote).eq("status", "aberta")
              .is("deleted_at", null).order("id").range(de, ate)));
        abertas = ab.filter((c) => dono || c.nutricionista_id === user.id || c.criado_por === user.id);
      }
      const porId = new Map(lista.map((a) => [a.id, a]));
      const agora = new Date();
      const linhas: AlunoDoResumo[] = lista.map((a) => ({
        paciente_id: a.id, treino_user_id: a.treino_user_id, nome: a.nome, email: a.email, ativo: a.ativo,
        mensalidade_valor: dono && a.mensalidade_valor !== null ? Number(a.mensalidade_valor) : null,
        plano: dono ? (a.plano?.nome ?? null) : null, pausada: dono ? a.cobranca_pausada : false,
        // W-P: só o dono (e o master) vê o plano com período, como o valor (decisão do Weslley 10/10, ponto 1); modo de hoje = 1 mês
        modalidade: dono ? (a.plano_modalidade ?? null) : null, meses: dono && a.plano_modalidade ? (a.plano?.meses ?? 1) : 1,
        pago_ate: dono ? a.mensalidade_pago_ate : null, desde: dono ? a.mensalidade_desde : null,
        aguardando: pendentes.find((c) => c.paciente_id === a.id)?.id ?? null,
        abertas: abertas.filter((c) => c.paciente_id === a.id).length,
      }));
      const comprovantes = pendentes.map((c) => ({
        ...vista(c), aluno: { paciente_id: c.paciente_id, treino_user_id: porId.get(c.paciente_id)?.treino_user_id ?? null,
                              nome: porId.get(c.paciente_id)?.nome ?? null, email: porId.get(c.paciente_id)?.email ?? null },
      }));
      if (pagina === null) {
        return json({ ok: true, hoje, agora: agora.toISOString(), dono, alunos: linhas, pendentes: comprovantes }, 200, origin);
      }
      const p = paginaDasMensalidades(linhas, { pagina, paginaSem, busca: body.busca, agora });
      return json({
        ok: true, hoje, agora: agora.toISOString(), dono, pagina: p.pagina, por_pagina: p.por_pagina, total: p.total, alunos: p.alunos,
        sem: p.sem, contagens: p.contagens, pendentes: comprovantes,
      }, 200, origin);
    }

    if (acao === "prof_aluno") {
      const { m, p } = await matriculaDoPainel(body.aluno);
      const veMensalidade = podeMexerNaMensalidade(p);
      let cobs = await cobrancasDe(m.id, 72);
      // W2: os 2 MPs (ehModoMp) — as conferências daqui são de LEITURA (I3: a conexão do personal caída não derruba a ficha)
      if (veMensalidade && ehModoMp(m.conta?.recebimento_modo)) {
        for (const c of cobs.filter((x) => x.forma === "mp" && x.status === "aguardando_confirmacao").slice(0, 4)) await conferir(c, m);
      }
      // W1: como no aluno_status — a vencida sai e a conferência vai em 2º plano (I3), só na conta InfinitePay ou com tentativa aberta (I2)
      if (veMensalidade && (m.conta?.recebimento_modo === "infinitepay" || cobs.some(ehTentativaIp))) await cuidarDaInfinitePay(m);
      const assinatura = veMensalidade && ehModoMp(m.conta?.recebimento_modo) ? await conferirAssinatura(m) : await assinaturaDe(m.id);
      const atual = (await carregarMatricula(db, m.id)) ?? m;
      cobs = (await cobrancasDe(m.id, 72)).filter((c) => podeVerCobranca(p, c));
      // W-P: os planos completos (meses, modalidades, parcelas) para a ficha — no schema sem a migration, as colunas de antes
      const wp = await schemaTemPlanos();
      const { data: planos, error: erroPlanos } = atual.conta_id
        ? await db.from("planos_aluno").select(wp ? COLUNAS_PLANO : "id, nome, valor, ativo").eq("conta_id", atual.conta_id).order("nome")
        : { data: [], error: null };
      if (erroPlanos) throw erroPlanos; // hml-14: o erro virava "nenhum plano" no Financeiro do aluno
      const chave = await chaveAtiva(atual.conta_id);
      return json({
        ok: true, ambiente: schema, simulacao: schema === "staging", hoje, agora: new Date().toISOString(),
        aluno: { paciente_id: atual.id, treino_user_id: atual.treino_user_id, nome: atual.nome, email: atual.email, cpf: atual.cpf, foto_url: atual.foto_url,
                 ativo: atual.ativo, tags: atual.tags ?? [], conta_id: atual.conta_id, conta_nome: atual.conta?.nome ?? null, tem_login: !!atual.user_id },
        permissoes: { master: p.master, dono: p.dono, responsavel: p.responsavel, mensalidade: veMensalidade },
        conta: { id: atual.conta_id, nome: atual.conta?.nome ?? null, modo: atual.conta?.recebimento_modo ?? "pix_manual",
                 bloquear: atual.conta?.bloquear_app_inadimplente ?? false, origem: atual.conta?.origem ?? null,
                 // W-P: as modalidades que a conta recebe — como os planos, só para quem mexe na mensalidade (Task 8b, ponto 1)
                 modalidades: wp && veMensalidade ? modalidadesDaConta(atual.conta?.recebimento_modo) : [],
                 chave: chave ? { tipo: chave.tipo, chave: chave.chave, favorecido: chave.favorecido, banco: chave.banco } : null },
        planos: veMensalidade ? planos ?? [] : [],
        mensalidade: veMensalidade ? await mensalidadeComPlano(atual) : null,
        assinatura: veMensalidade ? assinaturaVista(assinatura) : null,
        cobrancas: cobs.map((c) => vista(c)),
      }, 200, origin);
    }

    if (acao === "prof_aluno_cobrancas") {
      // hml-14d (B21 · D31): o "Ver todas" das cobranças no Financeiro do aluno (painel) — uma página de 20, a mais nova primeiro, com
      // o total. O podeVerCobranca do prof_aluno vira o FILTRO da consulta (antes ele filtrava as 72 já cortadas): o master e o dono
      // veem todas; o responsável, as que criou ou são dele.
      const [de, ate] = intervaloDaPagina(body.pagina);
      const { m, p } = await matriculaDoPainel(body.aluno);
      if (!p.master && !p.dono && !p.responsavel) return json({ ok: true, itens: [], total: 0 }, 200, origin);
      let consulta = db.from("cobrancas").select(await colunasCobranca(), { count: "exact" }).eq("paciente_id", m.id).is("deleted_at", null);
      if (!p.master && !p.dono) consulta = consulta.or(`criado_por.eq.${p.userId},nutricionista_id.eq.${p.userId}`);
      const { data, error, count } = await consulta.order("created_at", { ascending: false }).order("id").range(de, ate);
      if (error) throw error;
      if (count === null) throw new Error("sem contagem de cobrancas");
      return json({ ok: true, itens: ((data ?? []) as unknown as Cobranca[]).map((c) => vista(c)), total: count }, 200, origin);
    }

    if (acao === "prof_definir") {
      const { m, p } = await matriculaDoPainel(body.aluno);
      exigirMensalidade(p);
      if (!m.conta_id) falhar("sem_conta");
      if ("plano_modalidade" in body && body.plano_modalidade !== null) {
        // W-P: aluno num plano com período — plano, modalidade, valor negociado e 1º vencimento (o valor sai do plano, pelo gatilho)
        if (!temPlanos(m)) falhar("planos_indisponivel", 409);
        if (ehDoApp(m)) falhar("conta_do_app", 403);
        if (!ehModalidade(body.plano_modalidade)) falhar("modalidade_invalida");
        const modalidade = body.plano_modalidade as Modalidade;
        if (!ehUuidFin(body.plano_aluno_id)) falhar("plano_invalido");
        const planoId = String(body.plano_aluno_id);
        const { data: pl, error: ep } = await db.from("planos_aluno").select(COLUNAS_PLANO).eq("id", planoId).eq("conta_id", m.conta_id!).maybeSingle();
        if (ep) throw ep;
        if (!pl) falhar("plano_invalido");
        const plano = pl as unknown as PlanoDoAluno;
        // plano novo: só ativo, completo e numa modalidade que a conta recebe; quem já está no plano (mesmo desativado) continua
        const ofertas = m.plano_aluno_id === planoId ? (planoCompleto(plano) ? plano.modalidades : []) : modalidadesOferecidas(plano, m.conta?.recebimento_modo);
        if (!ofertas.includes(modalidade)) falhar("modalidade_indisponivel");
        const vazio = body.plano_valor_negociado === null || body.plano_valor_negociado === "" || body.plano_valor_negociado === undefined;
        const negociado = vazio ? null : valorValido(body.plano_valor_negociado);
        if (!vazio && negociado === null) falhar("valor_invalido");
        const a = await assinaturaDe(m.id);
        if (a && ["authorized", "pending", "paused"].includes(a.status) && !aceitaAutomatica(modalidade, plano.meses)) {
          if (body.cancelar_automatica !== true) falhar("automatica_ativa", 409);
          await cancelarAutomatica(m, a);
        }
        const patch: Record<string, unknown> = { plano_aluno_id: planoId, plano_modalidade: modalidade, plano_valor_negociado: negociado };
        // 1º vencimento de quem nunca pagou (padrão hoje); quem já pagou segue a régua dele ("vale a partir do próximo pagamento").
        // Só data que existe: "2026-13-45" faria o toISOString lançar (500) e "2026-02-30" viraria 02/03 — as duas ficam em hoje
        if (!m.mensalidade_pago_ate) {
          const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`);
          const existe = (dia: string) => !Number.isNaN(meioDia(dia).getTime()) && meioDia(dia).toISOString().startsWith(dia);
          const inicio = typeof body.inicio === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.inicio) && existe(body.inicio) ? body.inicio : hoje;
          patch.mensalidade_desde = meioDia(inicio).toISOString();
        }
        const { error } = await db.from("pacientes").update(patch).eq("id", m.id);
        if (error) throw error;
        const atual = (await carregarMatricula(db, m.id))!;
        const automatica = await sincronizarAutomatica(atual);
        return json({ ok: true, mensalidade: await mensalidadeComPlano(atual), automatica }, 200, origin);
      }
      // modo de hoje (B1): plano só com nome e o valor digitado. O APK antigo não manda plano_modalidade — quem está num plano com
      // período só muda pela tela nova
      if (m.plano_modalidade && !("plano_modalidade" in body)) falhar("aluno_em_plano_novo", 409);
      let planoId: string | null = ehUuidFin(body.plano_aluno_id) ? String(body.plano_aluno_id) : null;
      const planoNovo = textoCurto(body.plano_novo, 80);
      if (planoNovo) {
        const { data: ja } = await db.from("planos_aluno").select("id").eq("conta_id", m.conta_id).ilike("nome", planoNovo).maybeSingle();
        if (ja) planoId = (ja as { id: string }).id;
        else {
          const { data: novo, error } = await db.from("planos_aluno").insert({ conta_id: m.conta_id, nome: planoNovo }).select("id").single();
          if (error) throw error;
          planoId = (novo as { id: string }).id;
        }
      }
      if (planoId) {
        const { data: pl } = await db.from("planos_aluno").select("id").eq("id", planoId).eq("conta_id", m.conta_id).maybeSingle();
        if (!pl) falhar("plano_invalido");
      }
      const vazio = body.valor === null || body.valor === "" || body.valor === undefined;
      const valor = vazio ? null : valorValido(body.valor);
      if (!vazio && valor === null) falhar("valor_invalido");
      const patch: Record<string, unknown> = { plano_aluno_id: planoId, mensalidade_valor: valor };
      if (temPlanos(m)) Object.assign(patch, { plano_modalidade: null, plano_valor_negociado: null });
      // 1º vencimento de quem nunca pagou = hoje (quem já tinha histórico segue na régua dele)
      if (valor && !m.mensalidade_desde && !m.mensalidade_pago_ate) patch.mensalidade_desde = new Date().toISOString();
      const { error } = await db.from("pacientes").update(patch).eq("id", m.id);
      if (error) throw error;
      const atual = (await carregarMatricula(db, m.id))!;
      // I1 também no modo de hoje: o valor digitado mudou com a automática ligada → o MP passa a cobrar o novo
      const automatica = await sincronizarAutomatica(atual);
      return json({ ok: true, mensalidade: await mensalidadeComPlano(atual), automatica }, 200, origin);
    }

    if (acao === "prof_pausar") {
      const { m, p } = await matriculaDoPainel(body.aluno);
      exigirMensalidade(p);
      const pausar = body.pausar === true;
      const patch: Record<string, unknown> = { cobranca_pausada: pausar };
      // ao reativar quem nunca pagou, o 1º vencimento passa a ser hoje
      if (!pausar && !m.mensalidade_pago_ate) patch.mensalidade_desde = new Date().toISOString();
      const { error } = await db.from("pacientes").update(patch).eq("id", m.id);
      if (error) throw error;
      return json({ ok: true, pausada: pausar }, 200, origin);
    }

    if (acao === "prof_confirmar" || acao === "prof_recusar") {
      const c = await buscarCobranca(body.cobranca_id);
      const { m, p } = await matriculaDoPainel(c.paciente_id);
      if (!podeMexerNaCobranca(p, c)) falhar("sem_permissao", 403);
      if (c.forma !== "pix_manual" || c.status !== "aguardando_confirmacao") falhar("nao_pendente");
      const agora = new Date().toISOString();
      if (acao === "prof_confirmar") {
        // a data do pagamento é quando o aluno avisou (regra do Calc: é o dia que conta pra cobertura)
        const pagoEm = c.enviado_em ?? c.created_at;
        const { error } = await db.from("cobrancas").update({ status: "paga", pago_em: pagoEm, confirmado_por: user.id, confirmado_em: agora }).eq("id", c.id);
        if (error) throw error;
        if (body.lancar === true) await lancar(c, diaSP(pagoEm) ?? hoje, "pix");
        await avisar(db, m.user_id, "pagamento_confirmado", `Pagamento confirmado · ${reais(c.valor)}`, "/perfil/pagamentos", log, schema);
      } else {
        const motivo = textoCurto(body.motivo, 200) || "Comprovante não confere";
        const patch = c.tipo === "avulsa"
          ? { status: "aberta", forma: null, recusado_motivo: motivo, recusado_em: agora, confirmado_por: user.id }
          : { status: "cancelada", recusado_motivo: motivo, recusado_em: agora, confirmado_por: user.id };
        const { error } = await db.from("cobrancas").update(patch).eq("id", c.id);
        if (error) throw error;
        await avisar(db, m.user_id, "pagamento_recusado", `Comprovante recusado: ${motivo}`.slice(0, 160), "/perfil/pagamentos", log, schema);
      }
      await recalcularTravaNutri();
      return json({ ok: true, cobranca: vista(await buscarCobranca(c.id)) }, 200, origin);
    }

    if (acao === "prof_registrar") {
      const { m, p } = await matriculaDoPainel(body.aluno);
      const dia = String(body.data || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) falhar("invalid_data");
      if (dia > hoje) falhar("data_futura");
      const metodo = ehMetodoPorFora(body.metodo) ? String(body.metodo) : "";
      if (!metodo) falhar("missing_metodo");
      // meio-dia UTC não pula de dia no fuso de São Paulo; cobre 1 mês a partir daí (mesma régua dos demais)
      const pagoEm = new Date(`${dia}T12:00:00Z`).toISOString();
      let c: Cobranca;
      if (body.cobranca_id) {
        const alvo = await buscarCobranca(body.cobranca_id);
        if (alvo.paciente_id !== m.id) falhar("cobranca_de_outro_aluno", 403);
        if (!podeMexerNaCobranca(p, alvo)) falhar("sem_permissao", 403);
        if (alvo.tipo !== "avulsa" || !["aberta", "aguardando_confirmacao"].includes(alvo.status)) falhar("cobranca_nao_aberta");
        const { data, error } = await db.from("cobrancas").update({ status: "paga", forma: "manual", metodo, pago_em: pagoEm, confirmado_por: user.id,
          confirmado_em: new Date().toISOString(), recusado_motivo: null, recusado_em: null }).eq("id", alvo.id).select(COLUNAS_COBRANCA).single();
        if (error) throw error;
        c = data as unknown as Cobranca;
        // W2 (no espírito da decisão 15): a avulsa que estava aguardando no MP tem o pagamento fechado lá, com a credencial DELA, por melhor
        // esforço — o aluno não paga 2 vezes (a aprovação atrasada cai em "paga é final")
        if (alvo.forma === "mp" && alvo.mp_payment_id && !simulado(alvo.mp_payment_id)) await fecharNoMp(alvo, m);
      } else {
        exigirMensalidade(p);
        const valor = valorValido(body.valor) ?? (m.mensalidade_valor ? Number(m.mensalidade_valor) : null);
        if (!valor) falhar("sem_valor");
        const dono = recebedor(m);
        if (!dono) falhar("sem_profissional");
        const mes = mesRefDe(dia);
        // W1 (I5): a tentativa da InfinitePay ainda aguardando vira ESTA linha (paga "por fora"). Se a confirmação dela chegar depois, é
        // "já registrado à mão" (aviso ao personal — decidirBaixa), nunca um 2º período. O ip_handle e o link ficam (a conferência acha).
        const linhaManual = {
          ...(await linhaDoPlano(m, mes)), valor, vencimento: dia, mes_ref: mes, status: "paga", forma: "manual", metodo, pago_em: pagoEm,
          confirmado_por: user.id, confirmado_em: new Date().toISOString(), plano_aluno_id: m.plano_aluno_id,
        };
        const { data: ips, error: eip } = await db.from("cobrancas").select("id").eq("paciente_id", m.id).eq("tipo", "mensalidade")
          .eq("forma", "infinitepay").eq("status", "aguardando_confirmacao").is("deleted_at", null)
          .order("created_at", { ascending: false }).limit(1);
        if (eip) throw eip;
        const ip = ((ips ?? []) as Array<{ id: string }>)[0];
        // W2 (decisão 15 — o I5 da W1 estendido ao MP): sem tentativa da InfinitePay, a mensalidade do MP ainda aguardando (o Pix que não
        // venceu, o cartão em análise) vira ESTA linha (paga "por fora"); depois o pagamento é fechado no MP com a credencial DELA, por melhor
        // esforço: a aprovação atrasada cai em "paga é final" (aplicarPagamentoMp) e não vira 2º período. A gravação é do servidor (a guarda da
        // W1b só vale para o app)
        const mpAguardando = ip ? null : await mensalidadeMpAguardando(m.id);
        const mesma = ip ?? mpAguardando;
        const { data, error } = mesma
          ? await db.from("cobrancas").update(linhaManual).eq("id", mesma.id).eq("status", "aguardando_confirmacao").select(COLUNAS_COBRANCA).single()
          : await db.from("cobrancas").insert({ paciente_id: m.id, conta_id: m.conta_id, nutricionista_id: dono, criado_por: user.id,
              tipo: "mensalidade", ...linhaManual, origem: "app" }).select(COLUNAS_COBRANCA).single();
        if (error) throw error;
        c = data as unknown as Cobranca;
        if (mpAguardando?.mp_payment_id && !simulado(mpAguardando.mp_payment_id)) await fecharNoMp(mpAguardando, m);
      }
      if (body.lancar === true) await lancar(c, dia, metodo);
      await recalcularTravaNutri();
      return json({ ok: true, cobranca: vista(await buscarCobranca(c.id)) }, 200, origin);
    }

    if (acao === "prof_remover") {
      const c = await buscarCobranca(body.cobranca_id);
      const { p } = await matriculaDoPainel(c.paciente_id);
      exigirMensalidade(p);
      if (c.tipo !== "mensalidade" || c.forma !== "manual") falhar("nao_manual");
      const { error } = await db.from("cobrancas").update({ deleted_at: new Date().toISOString() }).eq("id", c.id);
      if (error) throw error;
      return json({ ok: true }, 200, origin);
    }

    if (acao === "prof_cobranca_criar") {
      const { m, p } = await matriculaDoPainel(body.aluno);
      if (!p.master && !p.dono && !p.responsavel) falhar("sem_permissao", 403);
      const descricao = textoCurto(body.descricao, 160);
      if (!descricao) falhar("descricao_vazia");
      const valor = valorValido(body.valor);
      if (!valor) falhar("valor_invalido");
      const vencimento = String(body.vencimento || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) falhar("vencimento_invalido");
      const { data, error } = await db.from("cobrancas").insert({
        paciente_id: m.id, conta_id: m.conta_id, nutricionista_id: user.id, criado_por: user.id, tipo: "avulsa", descricao, valor,
        vencimento, status: "aberta", origem: "app",
      }).select(COLUNAS_COBRANCA).single();
      if (error) throw error;
      await recalcularTravaNutri();
      return json({ ok: true, cobranca: vista(data as unknown as Cobranca) }, 200, origin);
    }

    if (acao === "prof_cobranca_cancelar") {
      const c = await buscarCobranca(body.cobranca_id);
      const { m, p } = await matriculaDoPainel(c.paciente_id);
      if (!podeMexerNaCobranca(p, c)) falhar("sem_permissao", 403);
      if (c.tipo !== "avulsa" || !["aberta", "aguardando_confirmacao"].includes(c.status)) falhar("cobranca_nao_aberta");
      // W1b: no MP, só o pagamento DESTA cobrança; o de outra coisa é 409 e a linha fica (o MP sem resposta: só a linha, como antes). W2: com
      // a credencial DELA (escrita — o collector): outra conta do MP ou a desconectada → o Physiq não alcança e só a linha muda; a conexão
      // caída → 409 mp_conta_indisponivel (o catch final)
      if (c.forma === "mp" && c.mp_payment_id && !simulado(c.mp_payment_id)) {
        const cred = await credencialDaCobranca(db, ctxMp, c, credencial, { escrita: true });
        if (cred && (await cancelarNoMp(c, m, cred)) === "outro") falhar("cobranca_de_outro_pagamento", 409);
      }
      const { error } = await db.from("cobrancas").update({ status: "cancelada" }).eq("id", c.id);
      if (error) throw error;
      await recalcularTravaNutri();
      return json({ ok: true }, 200, origin);
    }

    if (acao === "prof_reembolsar") {
      const c = await buscarCobranca(body.cobranca_id);
      const { m, p } = await matriculaDoPainel(c.paciente_id);
      if (!podeMexerNaCobranca(p, c)) falhar("sem_permissao", 403);
      if (c.status !== "paga") falhar("nao_reembolsavel");
      if (c.forma !== "mp" || !c.mp_payment_id) falhar("sem_transacao_mp");
      const mpId = String(c.mp_payment_id);
      if (simulado(mpId)) {
        if (schema !== "staging") falhar("nao_reembolsavel");
        const { error: erroReembolso } = await db.from("cobrancas").update({ status: "cancelada", mp_status: "refunded", reembolsado_em: new Date().toISOString() }).eq("id", c.id);
        if (erroReembolso) throw erroReembolso;
        return json({ ok: true, simulado: true }, 200, origin);
      }
      // W2: a credencial DESTA cobrança (escrita — o collector): a da conta desconectada (ou outra conta do MP) → 409: o estorno é pelo app do
      // Mercado Pago (o Physiq não alcança); a conexão caída → 409 mp_conta_indisponivel (o catch final). A MESMA credencial nas 3 idas abaixo
      const cred = await credencialDaCobranca(db, ctxMp, c, credencial, { escrita: true });
      if (!cred) falhar("mp_reembolso_pelo_app_do_mp", 409);
      // W1b (C1): só estorna o pagamento DESTA cobrança — o id da linha não basta (antes da guarda do banco o app gravava qualquer um, e o
      // mesmo token estorna o plano do personal; W2: com a conta, o token de OUTRO personal — o recebedor confere). O MP sem resposta: não
      // estorna o que não conferiu
      const conferido = await pagamentoDaLinha(c, m, cred!);
      if (!conferido.pay) {
        log.erro({ codigo: "mp_reembolso_sem_conferir", schema, acao, ref: c.id, status: conferido.status });
        falhar("mp_error", 502, { status_mp: conferido.status });
      }
      exigirDaCobranca(conferido, c);
      const { status: st, body: ref } = await mp<{ id?: number | string }>(cred!, `/v1/payments/${encodeURIComponent(mpId)}/refunds`, {
        method: "POST", body: JSON.stringify({}),
      });
      if (st >= 300) {
        log.erro({ codigo: "mp_reembolso_falhou", schema, acao, ref: c.id, status: st, externo: codigosDoMp(ref) });
        falhar("mp_error", 502, { status_mp: st });
      }
      const { status: sp, body: pay } = await mp<PagamentoMp>(cred!, `/v1/payments/${encodeURIComponent(mpId)}`);
      if (sp === 200 && pay?.id) await aplicarPagamentoMp(db, c, pay, m, log, schema);
      else {
        const { error: erroReembolso } = await db.from("cobrancas").update({ status: "cancelada", mp_status: "refunded", reembolsado_em: new Date().toISOString() }).eq("id", c.id);
        if (erroReembolso) throw erroReembolso;
      }
      return json({ ok: true, refund_id: ref?.id ?? null }, 200, origin);
    }

    if (acao === "prof_comprovante") {
      const c = await buscarCobranca(body.cobranca_id);
      const { p } = await matriculaDoPainel(c.paciente_id);
      if (!podeVerCobranca(p, c) || !c.comprovante_path) falhar("not_found", 404);
      return json({ ok: true, url: await urlAssinada(c.comprovante_path!), pdf: /\.pdf$/i.test(c.comprovante_path!) }, 200, origin);
    }

    return erro("acao_invalida", 400, origin);
  } catch (e) {
    if (e instanceof ErroAcao) return erro(e.codigo, e.http, origin, e.extra);
    // W2 (Task 9): a conexão do MP do personal caiu (ou a MP_TOKENS_CHAVE falta — o ctxMp lança assim) numa ação que cria/altera → 409, nunca
    // 500 (as conferências de leitura não chegam aqui: lerSemDerrubar — I3). O "erro" da conexão já avisou o Weslley e o dono (marcarErro)
    if (e instanceof MpContaSemAcesso) {
      log.aviso({ codigo: "mp_conta_indisponivel", schema, acao, ref: e.contaId, resultado: e.motivo });
      return erro("mp_conta_indisponivel", 409, origin);
    }
    // W2: o MP não respondeu de um jeito que decida no meio do 401 da conta (o /users/me ou a renovação) — o 502 de sempre do MP
    if (e instanceof MpIndisponivel) {
      log.erro({ codigo: "mp_indisponivel", schema, acao, status: e.status });
      return erro("mp_error", 502, origin, { status_mp: e.status });
    }
    log.excecao(e, { acao, schema });
    return erro("erro_interno", 500, origin);
  }
});
