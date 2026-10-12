#!/usr/bin/env python3
"""Physiq W2 — E2E de SERVIDOR do Mercado Pago DO PERSONAL (pagamentos-aluno, mp-conectar-retorno, mp-webhook-aluno, mp-contas-renovar,
automaticas-fila e master-contas) no STAGING, com as contas de TESTE prof2 (dono da conta "Rafael Lima"), aluno2 (aluno dele) e o master de
teste, em série e com a guarda de /health (Treino e principal) antes.
Casos (padrão — as funções PUBLICADAS no staging e o MP de verdade em SANDBOX, com a conta do prof2 e o aluno2):
  recebimento  o dono vê "mercadopago_conta" (flag do staging ligada); prof_mp_conectar → a URL do MP (auth.mercadopago.com, client certo,
               response_type, platform_id, o redirect PRÓPRIO do staging, state de 43, S256) e SEM id de conexão na resposta (I8); origem
               "apk" → a URL do SITE (…/painel/configuracoes/recebimento?mp=conectar) e nenhuma conexão criada; sem o Client Secret no
               ambiente → 503 mp_oauth_nao_configurado (anotado, o resto do caso segue); o aluno → 403; o master numa conta que não é dele
               → 403 so_o_dono (MENOR 19); flag desligada → 403 mp_conta_em_teste
  guarda       o dono grava mercadopago_conta direto pelo banco (REST como a pessoa) sem integração → recusado (mp_conta_sem_integracao); o app
               não lê recebimento_integracoes nem mp_conexoes; rpc w27_conta_linha como o dono → recusado (I7)
  simulada     o master: prof_mp_simular_conexao (a credencial de TESTE da aplicação, teste_sem_oauth) → prof_recebimento_salvar mercadopago_conta
               pelo dono → aluno_status com mp {disponivel: true, chave_publica: TEST-…} (MENOR 16: prova a GRAVAÇÃO; o token por ação é o --local).
               Com --conexao-sql: o prof_mp_simular_conexao do master de teste → 403 so_master (a regra da função: o master só pelo
               app_metadata) e a MESMA conexão gravada por SQL do servidor (o upsert dela; o resto do caso igual)
  pix          aluno_mp_pix → Pix no MP (sandbox) com mp_collector_id e a notification_url com &conta= (lida de volta no GET do pagamento);
               simular_aprovacao → paga pela credencial da conta
  cartao       APRO → paga (mp_collector_id); detalhe_mp pela conta; prof_reembolsar pela conta → refunded
  automatica   aluno_mp_assinar (o sandbox não assina com cartão: pendente com init_point — a rede do sandbox pela credencial, MENOR 28) →
               aluno_assinaturas com mp_collector_id; aluno_mp_cancelar pela conta
  webhook      POST na mp-webhook-aluno PUBLICADA com ?schema=staging&conta=<id> e o id do pagamento do caso cartao → "cobranca_<o status de
               agora>" e nada muda (o plano dizia "cobranca_approved": esse texto não existe — T10: já paga = "cobranca_paga"; depois do estorno
               do caso cartao, "cobranca_cancelada"); a mesma conta com user_id de outro → segue e trata igual (I4: o user_id só vai ao log);
               conta inventada → conta_sem_mp (nenhuma ida ao MP) em < 1,5 s (o "ms < 1000" do plano: a resposta da W2 não traz ms — medido
               daqui, depois de aquecer); corpo de 17 KB SEM content-length (chunked) → 413 (MENOR 4)
  desconectar  com a automática viva → 409 automaticas_ativas; com o OK → cancelada, modo pix_manual (com chave ligada) ou nenhum, integração
               desconectada, aviso ao aluno; "conectado_sem_trocar" (modo ainda Pix) → desconectar marca desconectada direto (MENOR 10)
  master       o master troca uma conta do MP com automática viva → 409; com cancelar_automaticas → cancela e troca (MENOR 7)
  erro         a integração em status erro (SQL) → aluno_mp_pix 409 mp_conta_indisponivel; aluno_status 200 com mp.disponivel false E o
               histórico inteiro; prof_aluno 200 (I3: a leitura não derruba a tela)
  oauth_real   SÓ com --casos oauth_real (o Client Secret nas funções e o vendedor de teste — a Task 1 parou na autorização): prof_mp_conectar
               { redirect_teste: true } (ou o redirect próprio com --redirect-proprio, depois da W2-a) → o Playwright entra como o vendedor de
               teste (o seguir_ate_o_code do e2e/w2/prova_public_key.py — o code lido no PEDIDO, a escolha de país — I6) → o e2e entrega
               code e state à mp-conectar-retorno/staging PUBLICADA → 302 ?mp=confirmar&c=<id> → prof_mp_confirmar { confirmar: true } como o
               prof2 (I8) → integração oauth ativa, mp_teste, collector = o vendedor; o aluno paga cartão APRO com a chave do vendedor
               (detalhe_mp mostra o pagador; MENOR 21: o pagador do aluno_mp_cartao é o MP_TEST_PAYER_EMAIL das funções — o --pagador-email,
               padrão o do COMPRADOR de teste, é o que o caso espera); mp-contas-renovar { forcar_conta } (o S10 de
               ~/.physiq-segredo-mp-renovar) → renovada (o refresh girou); desconectar
Casos --local (as funções no Deno local — e2e/w1/servir_local.ts — contra o banco do STAGING, com o SIMULADOR — e2e/w2/simulador_mp.py — no
lugar do MP: MP_API_BASE/MP_AUTH_BASE; MP_CLIENT_* falsos; uma MP_TOKENS_CHAVE da rodada (só na memória); os jobs mp-renovar-staging e
automaticas-fila-staging PARADOS e devolvidos no desfazer; o Deno só alcança 127.0.0.1 e o Supabase (--allow-net) — nada vai ao MP de verdade;
rodam COM a trava "🔒 BANCO do staging" (--sinal — MENOR 25: gravam linhas de teste e param os jobs). Cada caso parte do próprio ponto (a
integração da conta gravada pelo e2e com tokens do simulador cifrados pela chave da rodada, ou nenhuma):
  conectar     prof_mp_conectar → GET simulador /authorization → a volta (Location) entregue à mp-conectar-retorno LOCAL → ?mp=confirmar&c=<id>
               (nada em recebimento_integracoes ainda — I8) → prof_mp_confirmar (sem confirmar) → o apelido → prof_mp_confirmar { confirmar:
               true } COMO O PROF2 → ok; o simulador conferiu o redirect e o PKCE; a integração tem as 2 cifras da conexão (v1:, que abrem com a
               chave da rodada no token vivo do simulador — e nenhum token em claro) e a conexão ficou sem elas; o modo virou mercadopago_conta
  confirmar_outro  I8: a conexão `confirmar` do prof2 confirmada com a sessão do ALUNO2 → 403 mp_outra_pessoa e NADA na integração; a do
               prof2 com 16 min → vencido; a mesma 2× → invalido
  reusado      o mesmo state de novo → ?mp=invalido (uso único); state vencido (expira_em no passado) → ?mp=vencido; error=access_denied → negado
  troca_ruim   o simulador recusa a troca (400 invalid_grant) → ?mp=invalido (MENOR 14) e nada gravado; 500 → ?mp=falhou
  modo_errado  cenário live_mode true no staging → ?mp=conta_de_teste e nada guardado (MENOR 20)
  sem_chave    cenário sem_public_key → mp_public_key nulo; aluno_status mp.chave_publica null (o app esconde o cartão — decisão 14)
  outra_conta  conectada com a automática viva e a volta de OUTRO vendedor → a confirmação → outra_conta e a integração antiga intacta
  trocar_com_pix  I5: conectada (vendedor A) + um Pix do MP aberto de um aluno da conta → conectar o vendedor B → confirmar → outra_conta (o
               token de A segue na integração; o Pix pago DEPOIS no simulador + o aviso → paga pela conta A)
  pagar        o Pix e a conferência (aluno_mp_conferir e aluno_status), o cartão APRO pago com o collector, o detalhe, o estorno, a avulsa no
               Pix cancelada pelo personal e o cartão recusado — tudo pela conta (as janelas do caso tokens)
  registrado   I5 da W1: o personal registra à mão com o Pix do MP aguardando → a MESMA linha paga (e o Pix fechado no MP pela conta); a
               aprovação depois não cria 2º período
  reembolso_forjado  C1 (a W1b + a W2; o molde do servidor_forjado do e2e/w1b/api_w1b.py): uma cobrança da conta com o mp_payment_id de um
               pagamento de OUTRO vendedor (gravada como o servidor — a guarda da W1b segura o app) → prof_reembolsar, prof_cobranca_cancelar e
               detalhe_mp 409 cobranca_de_outro_pagamento — e 0 /refunds e 0 PUT no simulador; um pagamento do MESMO vendedor com a referência
               de outra cobrança → 409 igual (a regra pura da W1b)
  webhook      aviso por conta com o pagamento do simulador → paga; collector de outro → ignorado; referência de aluno de OUTRA conta → ignorado;
               a conta em erro → 500; x-signature com o segredo local e a flag exigir: sem → 401, com → passa
  criado_e_atualizado  I4: /_avisar payment.created (o pagamento ainda pendente) e, 2 s depois, payment.updated (aprovado) do MESMO id → paga
  webhook_401_alheio  I2: o aviso &conta= com o id de um pagamento de OUTRO vendedor e o cenário alheio_401 → 200 "nao_achado", a integração
               segue ATIVA e 0 POST /oauth/token no simulador
  sem_conta_pelo_user_id  I1 + MENOR 5: o aviso SEM &conta= com o user_id do vendedor da integração (a URL do painel) → tratado pela conta →
               paga; com o user_id da conta do PHYSIQ (o do token de teste) → o caminho de hoje; mp-connect sem conta com o token morto →
               integração em erro (acesso_revogado) e 1 aviso ao dono
  uso_401      cenário expirar_token → aluno_mp_pix: 401 → /users/me 401 → renova na hora e passa; 401 + renovação recusada → erro, 1 aviso, 409
               ao aluno; o mesmo 401 com mp_renovado_em há 5 min → NÃO renova (I2: 1× a cada 10 min) → erro
  renovar      mp_expira_em +10 dias → mp-contas-renovar local (forcar_conta, com o segredo da rodada) → renovada, expira +180 d, o refresh velho
               morto no simulador; 2 renovações juntas → 1 só no simulador (a trava), nenhuma "erro"
  recusada     o simulador recusa a renovação com o acesso ainda valendo → ativa + mp_erro renovacao_recusada + 1 aviso ao dono; vencida → erro +
               aviso; "renovar_formato" → o refresh novo gravado + mp_erro renovacao_formato (MENOR 13)
  diario       MENOR 27: integração ativa vencendo em 90 dias com mp_conferido_em nulo e o token morto no simulador → mp-contas-renovar (a rodada)
               → /users/me 401 → renovação recusada → erro + 1 aviso (o personal fica sabendo sem esperar um aluno pagar)
  rede_automatica  I1: automática da conta authorized + o cenário cobranca_mensal (a cobrança do mês aprovada, SEM aviso) → aluno_status (o
               conferirAssinatura) → a cobrança entra paga com mp_collector_id; mp-contas-renovar local (o diário, mp_conferido_em nulo) → a
               2ª cobrança também entra; rodar de novo → nada dobra (mp_payment_id único)
  fila         plano com automática na conta → automaticas-fila local → o PUT foi ao simulador com o token DA CONTA (só roda com a fila do
               staging sem pendência de outros alunos: a rodada local mexeria nelas)
  cancelar_automatica  C2: aluno_mp_cancelar, prof_cancelar_assinatura e o prof_definir para o período todo numa automática DA CONTA → o
               simulador recebe o PUT /preapproval com o token "conta_<vendedor>" (nunca o "physiq_teste")
  assinatura_antiga_viva  I11: automática pending na conta A; o simulador recusa o PUT de cancelamento → aluno_mp_assinar → 409
               assinatura_antiga_viva e NENHUM POST /preapproval novo; a automática antiga de OUTRA conta do MP → 409 igual
  salvar_recusado  (recado da Task 7) prof_recebimento_salvar com o cancelamento recusado pelo MP → 502 automaticas_nao_canceladas e o modo
               NÃO muda (o aluno não é avisado); sem o OK → 409; com o MP de volta → troca, cancela e avisa
  desligar     (recado da Task 7) desconectar NO modo: 409 sem o OK; com o OK, a automática da conta cancelada pelo token dela, o modo
               trocado e a integração desconectada (os tokens ficam os 7 dias); FORA do modo com a automática do MP do Physiq viva → não pede o
               OK nem a cancela (MENOR 10: só as desta conta do MP)
  master       (recado da Task 12; a master-contas no Deno local) o "Desligar" do master com a automática DA CONTA viva → 409 e nada muda; com o
               OK → cancelada no simulador pelo token da conta (o /users/me antes — decisão 11), o modo trocado, o aluno avisado; a conexão em
               erro → 409 automaticas_sem_acesso; forçar → marcada no Physiq (o master, o motivo), 1 evento, o dono e o aluno avisados (MENOR
               17) e nada no MP; o acesso revogado (/users/me 401 + a renovação recusada) → a conexão vira erro NA HORA → 409 → forçar 200
  pix_de_outra_conta  (T9 a) o Pix aberto do MP do Physiq com o modo já no MP da conta → não reaproveita: fechado com o physiq_teste e o novo
               na conta; o contrário (o "conectado sem trocar": o modo no MP do Physiq e a conexão ativa) → o da conta fechado com o token DELA
  pix_avulsa_de_outra_conta  (revisão I-3) a AVULSA com o Pix P1 no MP do Physiq (collector nulo) e o modo já no MP da conta →
               aluno_mp_pix na MESMA avulsa → no /_pedidos, o PUT /v1/payments/P1 {cancelled} com o physiq_teste ANTES do POST /v1/payments
               com o token da conta A (o P1 cancelado no simulador; a avulsa com o pagamento novo e o collector A); idem aluno_mp_cartao (APRO)
  pix_vivo_sem_escrita  (revisão I-3) o Pix vivo da avulsa na conta A e o modo no MP do Physiq (a conexão desconectada — decisão 10: só
               leitura, nenhum PUT) → aluno_mp_pix devolve o MESMO P1 (reutilizada) e aluno_mp_cartao → 409 mp_conta_indisponivel, sem PUT
               nem POST no simulador; o P1 pago DEPOIS + o aviso &conta= → a avulsa paga pela leitura dos 7 dias
  post_sem_decisao  (T9 b) expirar_token + o /users/me fora (500) no POST do Pix → 502 mp_error, a linha desfeita, nada renovado nem marcado
  pix_sem_chave  (T9 c, decisão 16) a conta do MP sem chave Pix → 400 mp_conta_sem_chave_pix, a linha desfeita e 1 aviso por dia ao dono
  cartao_outro_ambiente  (T9 d, MENOR 20) o cartão aprovado com live_mode true no staging → 502 mp_error, nada aplicado, a linha desfeita
  detalhe_outra_conta  (T9 e) a cobrança de OUTRA conta do MP: detalhe_mp → mp null + motivo outra_conta_mp; prof_reembolsar → 409
               mp_reembolso_pelo_app_do_mp; prof_cobranca_cancelar → só a linha — e nenhuma ida ao MP
  registrado_cartao_e_avulsa  (T9 f, decisão 15) registrar à mão com o CARTÃO em análise (sem validade) ou a AVULSA aguardando no MP → a
               MESMA linha paga e o pagamento fechado no MP pela conta
  teto         130 avisos SEM user_id do mesmo IP num minuto → 429 nos últimos 10; 70 avisos da MESMA conta → 429 nos últimos 10; 200 avisos de
               IPs e contas inventados NÃO zeram os 2 tetos (MENOR 26); corpo > 16 KB → 413 (com e sem content-length)
  tokens       MENOR 16: o lado do MP do Physiq (modo mercadopago: Pix, conferir e detalhe com o "physiq_teste") e, ao fim do --local, o /_pedidos
               confere o NOME do token de CADA ação da tabela da Task 9 (conferir, conferirAssinatura, pix, cartão, assinar, cancelar,
               detalhe, cancelar cobrança, reembolsar, fila): as da conta com "conta_<vendedor>", as do MP do Physiq com "physiq_teste" — nenhuma
               trocada; e nenhuma mutação (PUT, estorno) da rodada inteira com o token de outro dono
  Limites das instâncias (pagamentos-aluno: 60/min por pessoa e 10 prof_mp_conectar por hora; a mp-conectar-retorno 30/min por IP; o aviso,
  os tetos do caso teto): antes do que passaria, a função local recomeça; cada volta e cada aviso vai com um X-Forwarded-For próprio.
Desfazer: ANTES de mexer, a foto (a matrícula do aluno2, a conta do prof2 — forma e bloqueio —, as flags mercadopago_conta e mp_webhook, as
mensalidades e as automáticas de antes, o papel do master de teste no staging.profiles — ele é 'pessoa' fora das rodadas e vira master SÓ
ali durante a rodada, hml-02/H-04: nunca no Auth — e, no --local, os 2 jobs) vai para ~/projetos/physiqcalc-scratch/w2/api-estado.json (600) com os ids
à parte (conta, matrícula, quem); no fim (ou na próxima rodada / --limpar, se esta cair no meio) saem as automáticas da rodada (ANTES do modo:
a guarda contas_guard_mp recusa sair de um MP com automática viva — também para o postgres), a integração do MP da conta, as conexões, as
cobranças, os avisos, os eventos, a fila e os planos "W2 e2e …" da rodada; o resto volta à foto e o último ✅ confere campo a campo. No padrão,
os Pix e as automáticas que a rodada criou no sandbox são cancelados (a credencial de TESTE). A rodada só começa com a conta do prof2 SEM
integração do MP e sem automática viva (senão para antes de gravar qualquer coisa).
Precisa: a W2 no staging (a migration 20261011210000 — a rodada para antes se faltar); ~/.pc-pat e as senhas das contas de TESTE; no padrão,
as funções da W2 publicadas (Task 14) e a credencial de TESTE do MP (~/.physiq-mp-test e ~/.physiq-mp-public-test); no --local, o
~/.deno/bin/deno e as portas 8780–8785 e 8798 livres; o oauth_real, ~/.physiq-mp-vendedor-teste.json e ~/.physiq-mp-comprador-teste.json (600).
Uso: python3 e2e/w2/api.py [--local] [--casos …] [--sinal ARQ] [--seco | --limpar] [--redirect-proprio] [--pagador-email E] [--com-tela]
                            [--conexao-sql]
  --seco    NADA sai de 127.0.0.1: os autotestes das peças, a cifra e a x-signature conferidas com o Deno (o mesmo código das funções), o
            simulador e as 6 funções no Deno local contra um banco FECHADO (127.0.0.1:9, --allow-net=127.0.0.1) cutucadas no que responde antes
            do banco — nenhuma ação é chamada, nada é gravado, nenhum login
  --limpar  só desfaz uma rodada que caiu no meio (pelo arquivo de estado)
  --sinal   o arquivo-sinal da trava do banco do staging (dividido entre sessões): sem ele a rodada não começa; se ele sumir no meio, a rodada
            para ANTES do próximo caso, desfaz a massa e sai com 3
  --conexao-sql  (só no padrão) a conexão simulada dos casos que passam pelo garantir_simulada vai por SQL do servidor SÓ no staging, com as
            colunas e os valores do upsert do prof_mp_simular_conexao — o master de teste NÃO é master no Auth (hml-02/H-04: nunca) e a
            pagamentos-aluno só aceita o master pelo app_metadata (a regra fica). O token de TESTE da aplicação vai CIFRADO com a MP_TOKENS_CHAVE
            das funções, lida do cofre pelo scripts/segredos/mp_conta.py SÓ na memória (nunca no estado, na tela ou no log), depois de conferir
            o digest das funções (a chave e o MP_ACCESS_TOKEN_TEST); o desfazer apaga a integração como sempre
Saída sem dado pessoal nem segredo: ids de teste, códigos e status (os tokens do simulador são falsos e nunca são impressos).
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import hashlib
import http.client
import json
import os
import re
import secrets
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import simulador_mp as SIM  # noqa: E402

S = "staging"
DONO, ALUNO, MASTER = "prof2", "aluno2", "master"
PREFIXO = "W2 e2e"                  # os planos da rodada
ORIGEM_COB = "teste_w2_api"         # as cobranças que a rodada grava como o servidor
CASOS_STAGING = ("recebimento", "guarda", "simulada", "pix", "cartao", "automatica", "webhook", "desconectar", "master", "erro", "oauth_real")
SO_PEDINDO = {"oauth_real"}          # só com --casos (o Client Secret nas funções + o vendedor de teste + o navegador)
CASOS_LOCAL = ("conectar", "confirmar_outro", "reusado", "troca_ruim", "modo_errado", "sem_chave", "outra_conta", "trocar_com_pix", "pagar",
               "registrado", "reembolso_forjado", "webhook", "criado_e_atualizado", "webhook_401_alheio", "sem_conta_pelo_user_id", "uso_401",
               "renovar", "recusada", "diario", "rede_automatica", "fila", "cancelar_automatica", "assinatura_antiga_viva", "salvar_recusado",
               "desligar", "master", "pix_de_outra_conta", "pix_avulsa_de_outra_conta", "pix_vivo_sem_escrita", "post_sem_decisao",
               "pix_sem_chave", "cartao_outro_ambiente", "detalhe_outra_conta", "registrado_cartao_e_avulsa", "teto", "tokens")
CASA = Path.home()
ESTADO_ARQ = CASA / "projetos" / "physiqcalc-scratch" / "w2" / "api-estado.json"
LOG_LOCAL = CASA / "projetos" / "physiqcalc-scratch" / "w2" / "deno-local.log"
RAIZ = Path(__file__).resolve().parent.parent.parent
DENO = CASA / ".deno" / "bin" / "deno"
PORTAS = {"pag": 8780, "ret": 8781, "web": 8782, "ren": 8783, "fila": 8784, "mst": 8785, "sim": 8798}
FUNCOES_DENO = {"pag": "pagamentos-aluno", "ret": "mp-conectar-retorno", "web": "mp-webhook-aluno", "ren": "mp-contas-renovar",
                "fila": "automaticas-fila", "mst": "master-contas"}
JOBS = ("mp-renovar-staging", "automaticas-fila-staging")   # parados no --local (MENOR 12): chamariam as funções PUBLICADAS
API_P = "https://api-principal.physiqcalc.com.br"
REDIRECT_PROPRIO = f"{API_P}/functions/v1/mp-conectar-retorno/{S}"
REDIRECT_TESTE = "https://www.mercadopago.com"
SITE = "https://physiqcalc-staging.vercel.app"
VOLTA_SITE = f"{SITE}/painel/configuracoes/recebimento"
NOTIFICACAO_CONTA = API_P + "/functions/v1/mp-webhook-aluno?schema=" + S + "&conta={conta}"
PAGADOR_SIM = "comprador.simulador@example.com"
VIVAS = ("authorized", "pending", "paused")
UUID_RX = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
ESTADO_RX = re.compile(r"^[A-Za-z0-9_-]{43}$")
CIFRA_RX = re.compile(r"^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{20,}$")
A, B_, C_ = SIM.VENDEDOR_A, SIM.VENDEDOR_B, SIM.VENDEDOR_C
CONTA_A = f"conta_{A}"
PHYSIQ = "physiq_teste"
# os limites da pagamentos-aluno (na memória da instância): permitido(`${schema}:${uid}`) 60/min e prof_mp_conectar 10/h por pessoa —
# o e2e recomeça a instância local ANTES de passar (com folga no geral: 55)
LIMITE_GERAL = (55, 60)
LIMITES_DA_ACAO = {"prof_mp_conectar": (10, 3600)}
# MENOR 16: as ações da tabela da Task 9 que o caso tokens confere (o rótulo de cada janela do /_pedidos)
ACOES_TASK9 = ("conferir", "conferirAssinatura", "pix", "cartao", "assinar", "cancelar", "detalhe", "cancelar_cobranca", "reembolsar", "fila")
ACOES_DO_PHYSIQ = ("pix", "conferir", "detalhe")

B = None  # a base dos E2E da W6 (e2e/w06/_base.py), carregada no main (o --seco não carrega: nada de rede)
p = None
CTX: dict = {"ip": 0, "janelas": [], "limites": {}}


# ───────────────────────── a base, o banco e a rede ─────────────────────────

def carregar_base() -> None:
    global B, p
    if B is not None:
        return
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "w06"))
    import _base  # noqa: PLC0415

    B, p = _base, _base.p
    B.ESTADO["schema"] = S


def carregar_placar() -> None:
    """O --seco: só o placar (e2e/w02/_comum.py não abre rede ao importar)."""
    global p
    if p is None:
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "w02"))
        from _comum import Placar  # noqa: PLC0415

        p = Placar()


def sql(q: str) -> list:
    return B.sql_principal(q)


def um(q: str) -> dict | None:
    r = sql(q)
    return r[0] if r else None


def lit(v) -> str:
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


class _SemSeguir(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_a, **_k):  # devolve o 30x como veio
        return None


_ABRIR = urllib.request.build_opener(urllib.request.ProxyHandler({}))
_ABRIR_SEM_SEGUIR = urllib.request.build_opener(urllib.request.ProxyHandler({}), _SemSeguir)


def rede(metodo: str, url: str, corpo=None, cab: dict | None = None, seguir: bool = True, timeout: float = 60,
         bruto: bytes | None = None) -> tuple[int, object, dict]:
    """HTTP sem proxy → (status, corpo JSON ou texto, cabeçalhos em minúsculas). seguir=False devolve o 302."""
    dados = bruto if bruto is not None else (None if corpo is None else json.dumps(corpo).encode())
    h = {"User-Agent": "physiq-e2e-w2"}
    if corpo is not None and bruto is None:
        h["Content-Type"] = "application/json"
    h.update(cab or {})
    req = urllib.request.Request(url, data=dados, method=metodo, headers=h)
    try:
        with (_ABRIR if seguir else _ABRIR_SEM_SEGUIR).open(req, timeout=timeout) as r:
            st, txt, hs = r.status, r.read(), r.headers
    except urllib.error.HTTPError as e:
        try:
            st, txt, hs = e.code, e.read(), e.headers
        finally:
            e.close()
    cabs = {k.lower(): v for k, v in (hs.items() if hs else [])}
    try:
        return st, (json.loads(txt) if txt else None), cabs
    except ValueError:
        return st, txt.decode("utf-8", "replace"), cabs


def post_em_pedacos(url: str, dados: bytes, cab: dict | None = None) -> tuple[int, object]:
    """POST SEM content-length (Transfer-Encoding: chunked) — o MENOR 4: o corpo grande tem de ser medido ENQUANTO chega."""
    u = urllib.parse.urlsplit(url)
    conexao = (http.client.HTTPSConnection if u.scheme == "https" else http.client.HTTPConnection)(u.hostname, u.port, timeout=60)

    def pedacos():
        for i in range(0, len(dados), 4096):
            yield dados[i:i + 4096]

    try:
        conexao.request("POST", u.path + (f"?{u.query}" if u.query else ""), body=pedacos(), encode_chunked=True,
                        headers={"Content-Type": "application/json", "User-Agent": "physiq-e2e-w2", **(cab or {})})
        r = conexao.getresponse()
        txt = r.read()
        try:
            return r.status, json.loads(txt or b"null")
        except ValueError:
            return r.status, txt.decode("utf-8", "replace")
    finally:
        conexao.close()


def saude_principal(limite_s: float = 10.0) -> bool:
    """/health do banco principal (o staging é um schema dele) pela Management API — o molde do B.saude_treino."""
    t0 = time.time()
    st, r, _ = B.http("GET", f"https://api.supabase.com/v1/projects/{B.PRINCIPAL_REF}/health?services=db&services=auth&services=rest", None,
                      {"Authorization": f"Bearer {B.ler('.pc-pat')}"}, timeout=30)
    dt_ = time.time() - t0
    ok = st == 200 and isinstance(r, list) and all(x.get("status") == "ACTIVE_HEALTHY" for x in r) and dt_ < limite_s
    print(f"   /health do principal: {st} {[(x.get('name'), x.get('status')) for x in (r or [])] if isinstance(r, list) else r} em {dt_:.1f} s",
          flush=True)
    return ok


def esperar(funcao, segundos: float, passo: float = 1.0):
    fim = time.time() + segundos
    while True:
        v = funcao()
        if v or time.time() >= fim:
            return v
        time.sleep(passo)


# ───────────────────────── peças puras (o test_simulador_mp.py e o --seco conferem) ─────────────────────────

def b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def de64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def nova_chave() -> str:
    """Uma MP_TOKENS_CHAVE da rodada (32 bytes, base64url de 43) — só na memória: nunca vai ao estado nem à tela."""
    return b64u(secrets.token_bytes(32))


def dado_associado(conta: str, campo: str, schema: str = S) -> str:
    """O mesmo AD do _shared/cifra-mp.ts › dadoAssociado: a cifra de uma conta/campo/schema não abre em outro."""
    return f"physiq:w2:{schema}:{conta}:{campo}"


def cifrar(claro: str, ad: str, chave: str) -> str:
    """AES-256-GCM "v1:<iv>:<cifra+tag>" — o formato do _shared/cifra-mp.ts (o Web Crypto põe a tag no fim, como o AESGCM)."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM  # noqa: PLC0415

    iv = secrets.token_bytes(12)
    return f"v1:{b64u(iv)}:{b64u(AESGCM(de64(chave)).encrypt(iv, claro.encode(), ad.encode()))}"


def decifrar(cifra: str, ad: str, chave: str) -> str:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM  # noqa: PLC0415

    if not CIFRA_RX.fullmatch(cifra or ""):
        raise ValueError("cifra fora do formato")
    _, iv, c = cifra.split(":")
    return AESGCM(de64(chave)).decrypt(de64(iv), de64(c), ad.encode()).decode()


def sha256_hex(texto: str) -> str:
    return hashlib.sha256(texto.encode()).hexdigest()


def no_limite(momentos: list[float], agora: float, maximo: int, janela_s: float) -> bool:
    """Já foram `maximo` chamadas nos últimos `janela_s` segundos (a próxima seria 429)?"""
    return sum(1 for t in momentos if agora - t < janela_s) >= maximo


def ip_novo() -> str:
    """Um IP de teste por pedido (o X-Forwarded-For): sem ele, os pedidos locais caem todos no mesmo balde "sem-ip" (recado da Task 8)."""
    CTX["ip"] += 1
    n = CTX["ip"]
    return f"10.13.{(n // 250) % 250}.{n % 250 + 1}"


def janelas_conferidas(pedidos: list[dict], janelas: list[dict]) -> list[dict]:
    """MENOR 16: cada janela (o rótulo da ação, o token esperado e o intervalo de pedidos do simulador) → os pedidos dela que foram ao MP
    (sem o /oauth/token: a renovação não leva token), quantos e os nomes que não eram o esperado."""
    saida = []
    for j in janelas:
        # fora: o /oauth/token (sem token) e o recurso que o simulador não conhece (404 sem dono — ex.: a rede de segurança do app encerrado
        # do aluno_status pedindo uma automática que não nasceu aqui): não é "de ninguém", logo não há token trocado
        lista = [x for x in pedidos if j["de"] <= x["n"] < j["ate"] and x["caminho"].split("?")[0] != "/oauth/token"
                 and not (x.get("recurso_de") is None and x.get("status") == 404)]
        saida.append({**j, "pedidos": len(lista), "trocados": sorted({str(x["token_nome"]) for x in lista if x["token_nome"] != j["esperado"]})})
    return saida


def mutacoes_trocadas(pedidos: list[dict]) -> list[dict]:
    """O C1 no simulador: PUT ou estorno num recurso com o token de OUTRO dono (qualquer tentativa — nem a recusada devia sair)."""
    return [x for x in pedidos
            if (x["metodo"] == "PUT" or (x["metodo"] == "POST" and x["caminho"].split("?")[0].endswith("/refunds")))
            and x.get("recurso_de") is not None and x.get("token_de") is not None and x["token_de"] != x["recurso_de"]]


def comandos_do_desfazer(est: dict) -> list[str]:
    """O desfazer, na ORDEM (o teste confere a ordem): as automáticas da rodada saem ANTES de devolver o modo — a guarda contas_guard_mp
    recusa sair de um MP com automática viva (P0001 automaticas_ativas:<n>), também para o postgres."""
    pac, conta, t0 = est["paciente"], est["conta_id"], lit(est["t0"])
    antes = ", ".join(lit(x) for x in est.get("assinaturas") or [])
    cmds = [
        f"delete from {S}.aluno_assinaturas where paciente_id = '{pac}' and (criado_em >= {t0}::timestamptz"
        + (f" or not (id = any(array[{antes}]::uuid[])))" if antes else " or true)"),
    ]
    # o master de teste volta ao papel da foto LOGO no começo (o menor tempo master se algo abaixo quebrar) — só se ainda for 'master'
    if est.get("master_uid") and est.get("master_papel") not in (None, "master"):
        cmds.append(f"update {S}.profiles set role = {lit(est['master_papel'])} where id = {lit(est['master_uid'])} and role = 'master'")
    cmds += [
        f"update {S}.contas set recebimento_modo = {lit(est['conta']['modo'])}, bloquear_app_inadimplente = "
        f"{str(bool(est['conta']['bloquear'])).lower()} where id = '{conta}'",
        f"delete from {S}.recebimento_integracoes where conta_id = '{conta}' and provedor = 'mercadopago'",
        f"delete from {S}.mp_conexoes where conta_id = '{conta}' and criado_em >= {t0}::timestamptz",
        f"delete from {S}.cobrancas where paciente_id = '{pac}' and created_at >= {t0}::timestamptz",
        f"delete from {S}.avisos where destino_user_id in ('{est['aluno_uid']}', '{est['dono_uid']}') and criado_em >= {t0}::timestamptz",
        f"delete from {S}.conta_eventos where conta_id = '{conta}' and em >= {t0}::timestamptz",
        f"delete from {S}.automaticas_fila where paciente_id = '{pac}' and criado_em >= {t0}::timestamptz",
        f"delete from {S}.planos_aluno where nome like {lit(PREFIXO + ' %')}",
    ]
    a = est["pacientes"]
    cmds.append(f"""update {S}.pacientes set plano_aluno_id = {lit(a['plano_aluno_id'])}, plano_modalidade = {lit(a['plano_modalidade'])},
                   plano_valor_negociado = {lit(a['plano_valor_negociado'])}, mensalidade_valor = {lit(a['mensalidade_valor'])},
                   mensalidade_desde = {lit(a['mensalidade_desde'])}, cobranca_pausada = {str(bool(a['cobranca_pausada'])).lower()}
             where id = '{pac}'""")
    if est.get("vivas"):
        cmds.append(f"update {S}.cobrancas set deleted_at = null where id = any(array[{', '.join(lit(x) for x in est['vivas'])}]::uuid[])")
    for chave, valor in (est.get("flags") or {}).items():
        cmds.append(f"update {S}.app_config set valor = {lit(valor)}::jsonb where chave = {lit(chave)}")
    cmds.append(f"select {S}.mensalidade_recalcular('{pac}')")
    for nome, ativo in (est.get("jobs") or {}).items():
        if ativo is not None:
            cmds.append(f"select cron.alter_job(j.jobid, active := {str(bool(ativo)).lower()}) from cron.job j where j.jobname = {lit(nome)}")
    return cmds


def comando_dar_master(uid: str) -> str:
    """O master de teste é 'pessoa' fora das rodadas (hml-02/H-04): vira master SÓ no staging.profiles (nunca no Auth nem no public — o
    molde do e2e/w07b/api.py e do dar_master do e2e/w1/telas.py); a master-contas (ehMaster) e o sou_master() do banco aceitam esse perfil."""
    return f"update {S}.profiles set role = 'master' where id = {lit(uid)} and role is distinct from 'master'"


# os casos do padrão que passam pelo garantir_simulada (a conexão simulada da conta do prof2)
CASOS_SIMULADOS = {"simulada", "pix", "cartao", "automatica", "desconectar", "master", "erro", "webhook"}


def comando_simular_sql(conta: str, mp_user_id: int, chave_publica: str | None, cifra: str, por: str | None) -> str:
    """--conexao-sql: o upsert do prof_mp_simular_conexao (pagamentos-aluno, decisão 12) como SQL do servidor, SÓ no staging — as MESMAS
    colunas e valores: ativa, o user id da credencial de TESTE da aplicação, "TESTE (simulada)", a chave pública de TESTE (o mesmo filtro da
    função; fora dele, null), o token CIFRADO (MP_TOKENS_CHAVE + o AD da conta), sem refresh, 180 dias, mp_teste, teste_sem_oauth, sem erro,
    0 tentativas, conectado agora, quem fez. O token em claro nunca entra (só a cifra, conferida pelo formato)."""
    if not UUID_RX.fullmatch(conta or "") or not CIFRA_RX.fullmatch(cifra or "") or int(mp_user_id) <= 0:
        raise ValueError("conta, cifra ou user id fora do formato")
    if chave_publica is not None and not re.fullmatch(r"TEST-[A-Za-z0-9-]{8,72}", chave_publica):
        chave_publica = None
    return f"""insert into {S}.recebimento_integracoes (conta_id, provedor, status, mp_user_id, mp_apelido, mp_public_key, mp_access_token,
              mp_refresh_token, mp_expira_em, mp_teste, mp_origem, mp_erro, mp_renovar_tentativas, conectado_em, desconectada_em, atualizado_por)
            values ('{conta}', 'mercadopago', 'ativa', {int(mp_user_id)}, 'TESTE (simulada)', {lit(chave_publica)}, {lit(cifra)}, null, now() + interval '180 days', true, 'teste_sem_oauth', null, 0, now(), null, {lit(por)})
            on conflict (conta_id, provedor) do update set status = excluded.status, mp_user_id = excluded.mp_user_id,
              mp_apelido = excluded.mp_apelido, mp_public_key = excluded.mp_public_key, mp_access_token = excluded.mp_access_token,
              mp_refresh_token = null, mp_expira_em = excluded.mp_expira_em, mp_teste = true, mp_origem = excluded.mp_origem, mp_erro = null,
              mp_renovar_tentativas = 0, conectado_em = excluded.conectado_em, desconectada_em = null, atualizado_por = excluded.atualizado_por"""


# ───────────────────────── o simulador ─────────────────────────

def sim(metodo: str, caminho: str, corpo=None) -> tuple[int, object]:
    st, r, _ = rede(metodo, f"http://127.0.0.1:{PORTAS['sim']}{caminho}", corpo, timeout=40)
    return st, r


def sim_post(caminho: str, corpo: dict) -> dict:
    st, r = sim("POST", caminho, corpo)
    if st >= 300 or not isinstance(r, dict):
        raise RuntimeError(f"simulador {caminho}: {st} {str(r)[:200]}")
    return r


def sim_cenario(**c) -> dict:
    return sim_post("/_cenario", c)


def sim_n() -> int:
    return int(sim("GET", "/_estado")[1]["pedidos"])


def sim_pedidos(desde: int = 0) -> list[dict]:
    st, r = sim("GET", f"/_pedidos?desde={desde}")
    return r if st == 200 and isinstance(r, list) else []


def sim_info(token: str) -> dict:
    return sim_post("/_token_info", {"token": token})


def pedido_em(pedidos: list[dict], metodo: str, caminho: str, token_nome: str | None = None, corpo: dict | None = None) -> int | None:
    """O `n` do 1º pedido ao simulador com esse método, esse caminho (sem a busca), o NOME do token e — se dados — esses campos no corpo
    (revisão I-3: a ORDEM do PUT que fecha o Pix antigo e do POST do pagamento novo). Nenhum → None."""
    for x in pedidos:
        if x.get("metodo") != metodo or str(x.get("caminho") or "").split("?")[0] != caminho:
            continue
        if token_nome is not None and x.get("token_nome") != token_nome:
            continue
        c = x.get("corpo") if isinstance(x.get("corpo"), dict) else {}
        if corpo and any(c.get(k) != v for k, v in corpo.items()):
            continue
        return int(x["n"])
    return None


def sim_recurso(tipo: str, rid) -> dict:
    return sim_post("/_recurso", {"tipo": tipo, "id": str(rid)})


def janela(rotulo: str, esperado: str, fazer):
    """MENOR 16: guarda o intervalo de pedidos do simulador desta ação (o caso tokens confere o nome do token de cada uma)."""
    if not CTX.get("local"):
        return fazer()
    de = sim_n()
    r = fazer()
    CTX["janelas"].append({"rotulo": rotulo, "esperado": esperado, "de": de, "ate": sim_n()})
    return r


# ───────────────────────── o Deno local ─────────────────────────

def porta_aberta(porta: int) -> bool:
    with socket.socket() as s_:
        s_.settimeout(0.5)
        return s_.connect_ex(("127.0.0.1", porta)) == 0


def segredos_da_rodada() -> dict:
    """Os segredos do Deno local — gerados agora, só na memória (nunca no estado, no log ou na tela)."""
    if "segredos" not in CTX:
        CTX["segredos"] = {"chave": nova_chave(), "s10": secrets.token_urlsafe(48), "s9": secrets.token_urlsafe(48),
                           "assinatura": secrets.token_urlsafe(32), "proxy": secrets.token_urlsafe(32)}
    return CTX["segredos"]


def ambiente_deno(seco: bool) -> dict:
    sg = segredos_da_rodada()
    env = {k: v for k, v in os.environ.items()
           if not k.startswith(("MP_", "SEGREDO_", "SUPABASE_", "INFINITEPAY_", "PROXY_", "ERROS_"))}  # nada de fora entra (ex.: o _STAGING)
    env |= {"DENO_NO_PACKAGE_JSON": "1", "ERROS_AVISO_DESLIGADO": "1",
            "MP_API_BASE": f"http://127.0.0.1:{PORTAS['sim']}", "MP_AUTH_BASE": f"http://127.0.0.1:{PORTAS['sim']}",
            "MP_CLIENT_ID": SIM.CLIENTE_ID, "MP_CLIENT_SECRET": SIM.CLIENTE_SEGREDO,
            "MP_ACCESS_TOKEN_TEST": SIM.TOKEN_PHYSIQ_TESTE, "MP_ACCESS_TOKEN_PROD": SIM.TOKEN_PHYSIQ_PROD, "MP_TEST_PAYER_EMAIL": PAGADOR_SIM,
            "MP_TOKENS_CHAVE": sg["chave"], "MP_WEBHOOK_ASSINATURA": sg["assinatura"], "PROXY_SEGREDO": sg["proxy"],
            "SEGREDO_MP_RENOVAR_ACEITOS": sha256_hex(sg["s10"]), "SEGREDO_AUTOMATICAS_FILA_ACEITOS": sha256_hex(sg["s9"]),
            "INFINITEPAY_API": "http://127.0.0.1:19"}
    if seco:
        env |= {"SUPABASE_URL": "http://127.0.0.1:9", "SUPABASE_SERVICE_ROLE_KEY": "seco-sem-chave-de-servidor",
                "SUPABASE_ANON_KEY": "seco-sem-chave-publica"}
    else:
        env |= {"SUPABASE_URL": B.PRINCIPAL_URL, "SUPABASE_SERVICE_ROLE_KEY": B.service(B.PRINCIPAL_REF), "SUPABASE_ANON_KEY": B.anon(B.PRINCIPAL_REF)}
    return env


def _deno(nome: str) -> subprocess.Popen:
    """Uma função no Deno local pelo e2e/w1/servir_local.ts (o ambiente com as chaves fica só neste processo — nada impresso). A rede do
    Deno: só 127.0.0.1 (o simulador) e, fora do --seco, o Supabase — o MP de verdade nem é alcançável."""
    lo = CTX["local_proc"]
    rede_ = "127.0.0.1" if lo["seco"] else f"127.0.0.1,{B.PRINCIPAL_REF}.supabase.co"
    return subprocess.Popen([str(DENO), "run", f"--allow-net={rede_}", "--allow-env", "--allow-read", "e2e/w1/servir_local.ts",
                             f"supabase-principal/functions/{FUNCOES_DENO[nome]}/index.ts", str(PORTAS[nome])],
                            cwd=RAIZ, env=lo["env"], stdout=lo["saida"], stderr=lo["saida"])


def subir_local(seco: bool = False) -> dict:
    """O simulador e as 6 funções no Deno local (seco: o banco num endereço FECHADO)."""
    for nome, porta in PORTAS.items():
        if porta_aberta(porta):
            raise RuntimeError(f"a porta {porta} ({nome}) já está em uso (ss -ltnp | grep {porta}) — outra sessão?")
    LOG_LOCAL.parent.mkdir(parents=True, exist_ok=True)
    saida = LOG_LOCAL.open("a", encoding="utf-8")
    saida.write(f"\n===== {time.strftime('%Y-%m-%d %H:%M:%S')} e2e/w2/api.py {'--seco' if seco else '--local'} =====\n")
    saida.flush()
    CTX["local_proc"] = {"env": ambiente_deno(seco), "saida": saida, "seco": seco}
    procs = {"sim": subprocess.Popen([sys.executable, str(RAIZ / "e2e" / "w2" / "simulador_mp.py"), "--porta", str(PORTAS["sim"])],
                                     cwd=RAIZ, stdout=saida, stderr=saida)}
    for nome in FUNCOES_DENO:
        procs[nome] = _deno(nome)
    CTX["procs"] = procs
    if not esperar(lambda: all(porta_aberta(x) for x in PORTAS.values()), 120, 1.0):
        descer_local(procs)
        raise RuntimeError(f"o Deno local não subiu em 120 s (veja {LOG_LOCAL})")
    return procs


def reiniciar(nome: str) -> None:
    """Uma função local recomeça (os limites e os guardados de 60 s da instância zeram) — a mesma lista de processos, para o descer_local."""
    procs = CTX["procs"]
    descer_local({nome: procs[nome]})
    if not esperar(lambda: not porta_aberta(PORTAS[nome]), 20, 0.5):
        raise RuntimeError(f"a porta {PORTAS[nome]} não soltou depois de parar a {FUNCOES_DENO[nome]} local")
    procs[nome] = _deno(nome)
    if not esperar(lambda: porta_aberta(PORTAS[nome]), 90, 0.5):
        raise RuntimeError(f"a {FUNCOES_DENO[nome]} local não voltou em 90 s (veja {LOG_LOCAL})")
    if nome == "pag":
        CTX["limites"].clear()


def descer_local(procs: dict) -> None:
    for pr in procs.values():
        pr.terminate()
    for pr in procs.values():
        try:
            pr.wait(timeout=10)
        except subprocess.TimeoutExpired:
            pr.kill()


# ───────────────────────── as chamadas ─────────────────────────

def limitar(conta: str, acao: str) -> None:
    """Antes de cada ação no --local: no que passaria de um limite da instância, a pagamentos-aluno local recomeça."""
    agora = time.time()
    regras = [(f"{conta}:*", LIMITE_GERAL)] + ([(f"{conta}:{acao}", LIMITES_DA_ACAO[acao])] if acao in LIMITES_DA_ACAO else [])
    if any(no_limite(CTX["limites"].get(k, []), agora, *r) for k, r in regras):
        reiniciar("pag")
        print("   (a pagamentos-aluno local recomeçou: o limite da instância — 60/min por pessoa, 10 conectar/h — não é o que os casos provam)",
              flush=True)
    for k, _ in regras:
        CTX["limites"].setdefault(k, []).append(agora)


def pedir(conta: str, acao: str, corpo: dict | None = None) -> tuple[int, dict]:
    """Uma ação da pagamentos-aluno como a conta de TESTE: a publicada (x-schema staging) ou a do Deno local (--local)."""
    corpo = corpo or {}
    if CTX.get("local"):
        limitar(conta, acao)
        st, r, _ = rede("POST", f"http://127.0.0.1:{PORTAS['pag']}", {"acao": acao, **corpo},
                        {"Authorization": f"Bearer {B.token(conta)}", "x-schema": S, "Origin": "http://localhost:8080"}, timeout=90)
    else:
        st, r = B.pag(conta, acao, corpo)
    return st, (r if isinstance(r, dict) else {})


def volta(loc: str, publicada: bool = False) -> dict:
    """A volta do OAuth: a busca da Location do MP (o code e o state, ou o error) entregue à mp-conectar-retorno (a local, com um IP próprio;
    ou a publicada) → o 302 para o site."""
    busca = urllib.parse.urlsplit(loc).query
    base = f"{B.PRINCIPAL_URL}/functions/v1/mp-conectar-retorno/{S}" if publicada else f"http://127.0.0.1:{PORTAS['ret']}/mp-conectar-retorno/{S}"
    st, _, cab = rede("GET", f"{base}?{busca}", None, {"X-Forwarded-For": ip_novo()}, seguir=False)
    destino = cab.get("location") or ""
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(destino).query)
    return {"status": st, "destino": destino, "mp": (q.get("mp") or [None])[0], "c": (q.get("c") or [None])[0],
            "no_referrer": (cab.get("referrer-policy") or "").lower() == "no-referrer", "no_store": "no-store" in (cab.get("cache-control") or "")}


def autorizar(url: str) -> str:
    """A autorização no simulador (o dono "entra" como o vendedor do cenário) → a Location da volta."""
    st, _, cab = rede("GET", url, seguir=False)
    if st != 302 or not cab.get("location"):
        raise RuntimeError(f"o simulador não autorizou ({st})")
    return cab["location"]


def conectar_url() -> str:
    st, r = pedir(DONO, "prof_mp_conectar", {"conta_id": CTX["conta"]})
    if st != 200 or not r.get("url"):
        raise RuntimeError(f"prof_mp_conectar {st} {r.get('erro')}")
    return r["url"]


def conectar() -> dict:
    """prof_mp_conectar → a autorização no simulador → a volta local (o vendedor é o do cenário)."""
    return volta(autorizar(conectar_url()))


def confirmar(conexao: str | None, conta: str = DONO, sim_confirmar: bool = True) -> tuple[int, dict]:
    corpo = {"conexao_id": conexao, **({"confirmar": True} if sim_confirmar else {})}
    return pedir(conta, "prof_mp_confirmar", corpo)


def webhook_local(busca: dict, corpo, ip: str | None = None, cab: dict | None = None) -> tuple[int, dict]:
    url = f"http://127.0.0.1:{PORTAS['web']}/mp-webhook-aluno?{urllib.parse.urlencode(busca)}"
    h = {"X-Forwarded-For": ip or ip_novo(), **(cab or {})}
    st, r, _ = rede("POST", url, corpo if isinstance(corpo, dict) else None, h, bruto=corpo if isinstance(corpo, bytes) else None, timeout=60)
    return st, (r if isinstance(r, dict) else {})


def avisar(tipo: str, rid, conta: str | None = None, user_id: int | None = None, acao: str | None = None, segredo: str | None = None,
           ip: str | None = None) -> tuple[int, dict]:
    """Um aviso do MP ao webhook LOCAL, mandado pelo simulador (/_avisar: a busca com data.id e type, o corpo novo, a x-signature)."""
    r = sim_post("/_avisar", {"webhook": f"http://127.0.0.1:{PORTAS['web']}/mp-webhook-aluno", "schema": S, "conta": conta, "tipo": tipo,
                              "id": str(rid), "user_id": user_id, "acao": acao, "segredo": segredo, "ip": ip or ip_novo()})
    return int(r["status"]), (r["corpo"] if isinstance(r["corpo"], dict) else {})


def renovar_local(forcar: bool = True) -> tuple[int, dict]:
    corpo = {"schema": S, **({"forcar_conta": CTX["conta"]} if forcar else {})}
    st, r, _ = rede("POST", f"http://127.0.0.1:{PORTAS['ren']}", corpo, {"x-espelho-segredo": segredos_da_rodada()["s10"]}, timeout=150)
    return st, (r if isinstance(r, dict) else {})


def fila_local() -> tuple[int, dict]:
    st, r, _ = rede("POST", f"http://127.0.0.1:{PORTAS['fila']}", {"schema": S}, {"x-espelho-segredo": segredos_da_rodada()["s9"]}, timeout=150)
    return st, (r if isinstance(r, dict) else {})


def master_acao(args: dict) -> tuple[int, dict]:
    """A master-contas PUBLICADA (o "Desligar" do master): acao recebimento na conta do prof2, como o master de teste."""
    st, r = B.B5.funcao(B.token(MASTER), "master-contas", {"acao": "acao", "conta_id": CTX["conta"], "tipo": "recebimento", "args": args})
    return st, (r if isinstance(r, dict) else {})


def master_local(args: dict) -> tuple[int, dict]:
    """A master-contas do Deno LOCAL (o mesmo pedido do master_acao): as idas ao MP vão ao simulador — o token de cada uma no /_pedidos."""
    st, r, _ = rede("POST", f"http://127.0.0.1:{PORTAS['mst']}", {"acao": "acao", "conta_id": CTX["conta"], "tipo": "recebimento", "args": args},
                    {"Authorization": f"Bearer {B.token(MASTER)}", "x-schema": S, "Origin": SITE}, timeout=90)
    return st, (r if isinstance(r, dict) else {})


# ───────────────────────── o banco da rodada ─────────────────────────

def linha_integracao() -> dict | None:
    return um(f"""select status, mp_user_id, mp_apelido, mp_public_key, mp_access_token, mp_refresh_token, mp_expira_em::text as mp_expira_em,
                         mp_renovado_em::text as mp_renovado_em, mp_erro, mp_origem, mp_teste, desconectada_em::text as desconectada_em
                    from {S}.recebimento_integracoes where conta_id = '{CTX['conta']}' and provedor = 'mercadopago'""")


def mesma_integracao(a: dict | None, b: dict | None) -> bool:
    campos = ("status", "mp_user_id", "mp_access_token", "mp_refresh_token", "mp_erro")
    return bool(a) and bool(b) and all(a[k] == b[k] for k in campos)


def conexao(cid: str | None) -> dict:
    if not cid or not UUID_RX.fullmatch(cid):
        return {}
    return um(f"""select id::text as id, resultado, usado_em::text as usado_em, token_access, token_refresh, mp_user_id, mp_apelido, public_key,
                         live, redirect_uri from {S}.mp_conexoes where id = '{cid}'""") or {}


def ultima_conexao() -> dict:
    return um(f"""select id::text as id, resultado, usado_em::text as usado_em, token_access, redirect_uri from {S}.mp_conexoes
                   where conta_id = '{CTX['conta']}' and criado_em >= {lit(CTX['t0'])}::timestamptz order by criado_em desc limit 1""") or {}


def modo() -> str:
    return um(f"select recebimento_modo as m from {S}.contas where id = '{CTX['conta']}'")["m"]


def modo_conta(m: str) -> None:
    sql(f"update {S}.contas set recebimento_modo = '{m}' where id = '{CTX['conta']}' and recebimento_modo is distinct from '{m}'")


def chave_ativa() -> bool:
    return bool(um(f"select exists (select 1 from {S}.recebimento_chaves where conta_id = '{CTX['conta']}' and ativa) as ok")["ok"])


def cobranca(cid: str | None) -> dict:
    if not cid:
        return {}
    return um(f"""select id::text as id, tipo, status, forma, metodo, mp_payment_id, mp_status, mp_collector_id, pix_expira_em::text as pix_expira_em,
                         reembolsado_em::text as reembolsado_em, deleted_at is not null as fora from {S}.cobrancas where id = '{cid}'""") or {}


def cobranca_do_pagamento(pid) -> dict:
    return um(f"""select id::text as id, status, mp_collector_id, origem from {S}.cobrancas where mp_payment_id = {lit(str(pid))}
                   and deleted_at is null""") or {}


def assinatura(aid: str | None) -> dict:
    if not aid:
        return {}
    return um(f"select id::text as id, mp_preapproval_id, status, mp_collector_id from {S}.aluno_assinaturas where id = '{aid}'") or {}


def assinatura_viva() -> dict:
    return um(f"""select id::text as id, mp_preapproval_id, status, mp_collector_id from {S}.aluno_assinaturas where paciente_id = '{CTX['pac']}'
                   and status in ('authorized', 'pending', 'paused') order by criado_em desc limit 1""") or {}


def inserir_assinatura(pre_id: str, status: str, collector: int | None, payload: dict | None = None) -> str:
    """Uma automática como a pagamentos-aluno grava (aqui pelo postgres)."""
    return um(f"""insert into {S}.aluno_assinaturas (paciente_id, conta_id, mp_preapproval_id, status, valor, payload, mp_collector_id)
                  values ('{CTX['pac']}', '{CTX['conta']}', {lit(pre_id)}, '{status}', 10, {lit(json.dumps(payload or {}))}::jsonb,
                          {collector if collector is not None else 'null'}) returning id::text as id""")["id"]


def inserir_cobranca(status: str, pid, collector: int | None, metodo: str = "pix") -> str:
    """Uma cobrança avulsa do MP do aluno2 como o SERVIDOR grava (o postgres — a guarda da W1b só segura o app: o furo é simulado por baixo)."""
    pago = "now()" if status == "paga" else "null"
    return um(f"""insert into {S}.cobrancas (paciente_id, conta_id, nutricionista_id, criado_por, descricao, valor, vencimento, tipo, status, forma,
                    metodo, mp_payment_id, mp_status, pago_em, origem, mp_collector_id)
                  values ('{CTX['pac']}', '{CTX['conta']}', '{CTX['dono_uid']}', '{CTX['dono_uid']}', '{PREFIXO} forjada', 10, current_date, 'avulsa',
                          '{status}', 'mp', '{metodo}', {lit(str(pid))}, '{"approved" if status == "paga" else "pending"}', {pago}, '{ORIGEM_COB}',
                          {collector if collector is not None else 'null'}) returning id::text as id""")["id"]


def avisos(tipo: str, texto: str | None = None) -> dict:
    filtro = f" and titulo like {lit('%' + texto + '%')}" if texto else ""
    r = um(f"""select count(*) filter (where destino_user_id = '{CTX['aluno_uid']}')::int as aluno,
                      count(*) filter (where destino_user_id = '{CTX['dono_uid']}')::int as personal
                 from {S}.avisos where tipo = {lit(tipo)} and criado_em >= {lit(CTX['t0'])}::timestamptz{filtro}""")
    return {"aluno": r["aluno"], "personal": r["personal"]}


def pago_ate() -> str | None:
    return um(f"select mensalidade_pago_ate::text as a from {S}.pacientes where id = '{CTX['pac']}'")["a"]


def mensalidades_pagas() -> int:
    return um(f"""select count(*)::int as n from {S}.cobrancas where paciente_id = '{CTX['pac']}' and tipo = 'mensalidade' and status = 'paga'
                    and deleted_at is null and created_at >= {lit(CTX['t0'])}::timestamptz""")["n"]


def mp_aguardando() -> int:
    """As cobranças do MP da rodada ainda aguardando (fora as escondidas) — a linha desfeita não deixa nenhuma."""
    return um(f"""select count(*)::int as n from {S}.cobrancas where paciente_id = '{CTX['pac']}' and forma = 'mp' and status = 'aguardando_confirmacao'
                    and deleted_at is null and created_at >= {lit(CTX['t0'])}::timestamptz""")["n"]


def esconder() -> None:
    """As mensalidades que a rodada criou saem (a cobertura volta a zero, o Pix aberto some e o aluno pode pagar de novo) — e as avulsas do
    MP da rodada ainda aguardando (contariam como "em andamento" no I5 da confirmação de outra conta)."""
    sql(f"""update {S}.cobrancas set deleted_at = now() where paciente_id = '{CTX['pac']}' and deleted_at is null
              and created_at >= {lit(CTX['t0'])}::timestamptz
              and (tipo = 'mensalidade' or (forma = 'mp' and status = 'aguardando_confirmacao'))""")
    sql(f"select {S}.mensalidade_recalcular('{CTX['pac']}')")


def cancelar_vivas() -> None:
    """As automáticas vivas do aluno2 viram canceladas no banco (todas são da rodada: a rodada só começa sem nenhuma viva na conta)."""
    sql(f"update {S}.aluno_assinaturas set status = 'cancelled' where paciente_id = '{CTX['pac']}' and status in ('authorized', 'pending', 'paused')")


def flag_assinatura(exigir: bool) -> None:
    """app_config.mp_webhook.exigir_assinatura — a instância guarda 60 s: a função local recomeça para ler a nova."""
    sql(f"update {S}.app_config set valor = jsonb_build_object('exigir_assinatura', {str(exigir).lower()}) where chave = 'mp_webhook'")
    if CTX.get("local") and CTX.get("procs"):
        reiniciar("web")


def integracao(vendedor: int = A, *, status: str = "ativa", origem: str = "teste_local", expira: str = "170 days", refresh: bool = True,
               chave_publica: bool = True, erro: str | None = None, renovado: str = "null", conferido: str = "now()") -> dict:
    """A integração do MP da conta do prof2 como o servidor grava, com um par VIVO do simulador cifrado pela chave da rodada (o AD da conta).
    oauth sem refresh leva mp_erro sem_renovacao (o CHECK)."""
    par = sim_post("/_token", {"vendedor": vendedor})
    chave = segredos_da_rodada()["chave"]
    acc = cifrar(par["access_token"], dado_associado(CTX["conta"], "access"), chave)
    ref = cifrar(par["refresh_token"], dado_associado(CTX["conta"], "refresh"), chave) if refresh else None
    if origem == "oauth" and not refresh and erro is None:
        erro = "sem_renovacao"
    desc = "now()" if status == "desconectada" else "null"
    sql(f"""insert into {S}.recebimento_integracoes (conta_id, provedor, status, mp_user_id, mp_apelido, mp_public_key, mp_access_token,
              mp_refresh_token, mp_expira_em, mp_teste, mp_origem, mp_renovado_em, mp_renovando_ate, mp_renovar_tentativas, mp_renovar_proxima_em,
              mp_erro, mp_avisado_em, mp_conferido_em, conectado_em, desconectada_em)
            values ('{CTX['conta']}', 'mercadopago', '{status}', {vendedor}, {lit(par['nickname'])},
                    {lit(par['public_key']) if chave_publica else 'null'}, {lit(acc)}, {lit(ref)}, now() + interval '{expira}', true, '{origem}',
                    {renovado}, null, 0, null, {lit(erro)}, null, {conferido}, now(), {desc})
            on conflict (conta_id, provedor) do update set status = excluded.status, mp_user_id = excluded.mp_user_id,
              mp_apelido = excluded.mp_apelido, mp_public_key = excluded.mp_public_key, mp_access_token = excluded.mp_access_token,
              mp_refresh_token = excluded.mp_refresh_token, mp_expira_em = excluded.mp_expira_em, mp_teste = excluded.mp_teste,
              mp_origem = excluded.mp_origem, mp_renovado_em = excluded.mp_renovado_em, mp_renovando_ate = null, mp_renovar_tentativas = 0,
              mp_renovar_proxima_em = null, mp_erro = excluded.mp_erro, mp_avisado_em = null, mp_conferido_em = excluded.mp_conferido_em,
              conectado_em = excluded.conectado_em, desconectada_em = excluded.desconectada_em""")
    return par


def base(vendedor: int = A, *, ligar: bool = True, **kw) -> dict:
    """O ponto de partida de um caso --local: o cenário padrão no simulador, nenhuma automática viva, as mensalidades da rodada fora, a
    integração com um par novo e vivo e o modo (mercadopago_conta com `ligar`; senão Pix na chave)."""
    sim_cenario()
    cancelar_vivas()
    esconder()
    if not ligar:
        modo_conta("pix_manual")
    par = integracao(vendedor, **kw)
    if ligar:
        modo_conta("mercadopago_conta")
    return par


def base_sem_integracao() -> None:
    sim_cenario()
    cancelar_vivas()
    esconder()
    modo_conta("pix_manual")
    sql(f"delete from {S}.recebimento_integracoes where conta_id = '{CTX['conta']}' and provedor = 'mercadopago'")


def matricula_do_status(r: dict) -> dict:
    return next((x for x in r.get("matriculas", []) if x.get("paciente_id") == CTX["pac"]), {})


# ───────────────────────── a foto e o desfazer ─────────────────────────

def jobs() -> dict:
    lidos = {x["jobname"]: bool(x["active"]) for x in sql(f"select jobname, active from cron.job where jobname in ({', '.join(lit(j) for j in JOBS)})")}
    return {j: lidos.get(j) for j in JOBS}


def parar_jobs() -> None:
    for j in JOBS:
        sql(f"select cron.alter_job(j.jobid, active := false) from cron.job j where j.jobname = {lit(j)}")


def foto(pac: str, conta: str, master_uid: str | None = None) -> dict:
    pa = um(f"""select plano_aluno_id::text as plano_aluno_id, plano_modalidade, plano_valor_negociado::text as plano_valor_negociado,
                       mensalidade_valor::text as mensalidade_valor, mensalidade_desde::text as mensalidade_desde, cobranca_pausada
                  from {S}.pacientes where id = '{pac}'""")
    co = um(f"select recebimento_modo as modo, bloquear_app_inadimplente as bloquear from {S}.contas where id = '{conta}'")
    integ = um(f"select count(*)::int as n from {S}.recebimento_integracoes where conta_id = '{conta}' and provedor = 'mercadopago'")["n"]
    flags = {x["chave"]: x["v"] for x in sql(f"select chave, valor::text as v from {S}.app_config where chave in ('mercadopago_conta', 'mp_webhook')")}
    vivas = [x["id"] for x in sql(f"""select id::text as id from {S}.cobrancas where paciente_id = '{pac}' and tipo = 'mensalidade'
                                         and deleted_at is null order by id""")]
    assin = [x["id"] for x in sql(f"select id::text as id from {S}.aluno_assinaturas where paciente_id = '{pac}' order by id")]
    papel = (um(f"select role from {S}.profiles where id = {lit(master_uid)}") or {}).get("role") if master_uid else None
    return {"pacientes": pa, "conta": co, "integracao_mp": integ, "flags": flags, "vivas": vivas, "assinaturas": assin, "jobs": jobs(),
            "master_papel": papel}


def preparar() -> None:
    m = um(f"""select p.id::text as id, p.conta_id::text as conta, p.user_id::text as aluno_uid, c.dono_id::text as dono_uid, c.origem
                 from {S}.pacientes p join auth.users u on u.id = p.user_id left join {S}.contas c on c.id = p.conta_id
                where lower(u.email) = {lit(B.CONTAS[ALUNO][0])} and p.deleted_at is null order by p.ativo desc, p.created_at limit 1""")
    if not m or m["origem"] == "app" or m["dono_uid"] != B.uid(DONO):
        raise RuntimeError(f"a matrícula de TESTE do {ALUNO} tem que estar na conta do {DONO} ({m})")
    pac, conta = m["id"], m["conta"]
    pre = um(f"""select (select count(*) from {S}.recebimento_integracoes where conta_id = '{conta}' and provedor = 'mercadopago')::int as integ,
                        {S}.mp_automaticas_vivas('{conta}') as vivas""")
    if pre["integ"] or pre["vivas"]:
        raise RuntimeError(f"a conta do {DONO} já tem integração do MP ({pre['integ']}) ou automática viva ({pre['vivas']}): a rodada não começa "
                           "(nada foi gravado) — confira à mão (o sql_w2/o desfazer de outro E2E deixou sobra?)")
    outra = um(f"""select p.id::text as id from {S}.pacientes p where p.conta_id is not null and p.conta_id <> '{conta}' and p.deleted_at is null
                    order by p.created_at limit 1""")
    sql(f"select {S}.mensalidade_recalcular('{pac}')")
    t0 = um("select clock_timestamp()::text as t0")["t0"]
    master_uid = B.uid(MASTER)
    # os ids vão À PARTE da foto (a foto tem a chave "conta" — forma e bloqueio — e cobriria o id: a lição de 11/10 da W1)
    est = {"t0": t0, "modo_da_rodada": "local" if CTX.get("local") else "padrao", "paciente": pac, "conta_id": conta,
           "aluno_uid": m["aluno_uid"], "dono_uid": m["dono_uid"], "master_uid": master_uid, "outra_matricula": outra and outra["id"],
           "mp_criados": [], **foto(pac, conta, master_uid)}
    if est["jobs"].get("mp-renovar-staging") is None:
        print("   (o job mp-renovar-staging não existe: a migration da W2 está mesmo no staging?)", flush=True)
    gravar_estado(est)
    CTX.update(estado=est, pac=pac, conta=conta, aluno_uid=m["aluno_uid"], dono_uid=m["dono_uid"], t0=t0, outra=est["outra_matricula"])
    # o master de teste vira master SÓ no staging.profiles durante a rodada (o papel de antes já está na foto gravada acima; o desfazer devolve)
    if master_uid:
        sql(comando_dar_master(master_uid))
    # o ponto de partida: as mensalidades de antes escondidas (voltam no fim), R$ 10,00 vencida, Pix na chave, a flag do MP da conta ligada,
    # a assinatura exigida DESLIGADA e, no --local, os 2 jobs parados
    if est["vivas"]:
        sql(f"update {S}.cobrancas set deleted_at = now() where id = any(array[{', '.join(lit(x) for x in est['vivas'])}]::uuid[])")
    sql(f"""update {S}.pacientes set plano_aluno_id = null, plano_modalidade = null, plano_valor_negociado = null, mensalidade_valor = 10,
                   cobranca_pausada = false, mensalidade_desde = now() - interval '1 day' where id = '{pac}'""")
    sql(f"update {S}.contas set recebimento_modo = 'pix_manual' where id = '{conta}'")
    sql(f"update {S}.app_config set valor = jsonb_build_object('liberada', true) where chave = 'mercadopago_conta'")
    sql(f"update {S}.app_config set valor = jsonb_build_object('exigir_assinatura', false) where chave = 'mp_webhook'")
    # a "barreira": uma automática cancelada da rodada é a mais nova — o aluno_mp_assinar reaproveita a linha mais nova (assinaturaDe) e,
    # sem ela, regravaria uma automática de ANTES da rodada
    inserir_assinatura(None, "cancelled", None, {"barreira_e2e_w2": True})
    sql(f"select {S}.mensalidade_recalcular('{pac}')")
    if CTX.get("local"):
        parar_jobs()


def gravar_estado(est: dict) -> None:
    ESTADO_ARQ.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(ESTADO_ARQ, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(est, f, ensure_ascii=False, indent=1)
    ESTADO_ARQ.chmod(0o600)


def anotar_criado_no_mp(tipo: str, rid) -> None:
    """No padrão: o Pix ou a automática criada no SANDBOX vai ao estado na hora (o desfazer cancela o que ficou aberto)."""
    est = CTX.get("estado")
    if est is not None and rid and not str(rid).startswith("sim-"):
        est.setdefault("mp_criados", []).append([tipo, str(rid)])
        gravar_estado(est)


def cancelar_no_sandbox(est: dict) -> None:
    """O que a rodada criou no sandbox e ficou aberto: cancelado com a credencial de TESTE (a conta simulada = a da aplicação)."""
    for tipo, rid in est.get("mp_criados") or []:
        caminho = f"/v1/payments/{rid}" if tipo == "payment" else f"/preapproval/{rid}"
        try:
            st, r = B.mp_teste("GET", caminho)
            if st == 200 and isinstance(r, dict) and r.get("status") in ("pending", "in_process", "authorized", "paused"):
                B.mp_teste("PUT", caminho, {"status": "cancelled"})
        except Exception as e:  # noqa: BLE001 — melhor esforço: o desfazer do banco segue
            print(f"   (não cancelei {tipo} no sandbox: {type(e).__name__})", flush=True)


def desfazer(est: dict) -> None:
    print("\n── desfazer: sai o que a rodada criou e a matrícula, a conta, as flags e os jobs voltam à foto de antes")
    try:
        if est.get("modo_da_rodada") == "padrao":
            cancelar_no_sandbox(est)
        for cmd in comandos_do_desfazer(est):
            sql(cmd)
        agora = foto(est["paciente"], est["conta_id"], est.get("master_uid"))
        t0 = lit(est["t0"])
        sobra = um(f"""select (select count(*) from {S}.cobrancas where paciente_id = '{est['paciente']}' and created_at >= {t0}::timestamptz)::int as cobrancas,
                              (select count(*) from {S}.mp_conexoes where conta_id = '{est['conta_id']}' and criado_em >= {t0}::timestamptz)::int as conexoes,
                              (select count(*) from {S}.planos_aluno where nome like {lit(PREFIXO + ' %')})::int as planos,
                              (select count(*) from {S}.aluno_assinaturas where paciente_id = '{est['paciente']}' and criado_em >= {t0}::timestamptz)::int as automaticas""")
    except Exception as e:  # noqa: BLE001
        p.check(False, f"a limpeza quebrou ({e!r}) — o estado ficou em {ESTADO_ARQ}: rode  python3 e2e/w2/api.py --limpar"[:500])
        return
    chaves = ("pacientes", "conta", "integracao_mp", "flags", "vivas", "assinaturas", "jobs") + (("master_papel",) if "master_papel" in est else ())
    antes = {k: est.get(k) for k in chaves}
    difs = [f"{k}: {antes[k]!r} → {agora[k]!r}" for k in antes if antes[k] != agora[k]]
    p.check(not difs and not any(sobra.values()), f"tudo voltou à foto e nada da rodada ficou ({'; '.join(difs) or 'igual'} · sobras {sobra})")
    ESTADO_ARQ.unlink(missing_ok=True)


# ───────────────────────── casos (padrão: as funções publicadas + o sandbox) ─────────────────────────

def clientes_conhecidos() -> set[str]:
    """Os client_id que a URL pode trazer (o da aplicação real e o do plano B, se houver o arquivo) — não são segredo."""
    ids = set()
    for nome in (".physiq-mp-oauth.json", ".physiq-mp-oauth-staging.json"):
        arq = CASA / nome
        if arq.exists():
            try:
                cid = str(json.loads(arq.read_text(encoding="utf-8")).get("client_id") or "")
            except ValueError:
                cid = ""
            if cid:
                ids.add(cid)
    return ids


def chave_do_servico() -> str:
    """--conexao-sql: a MP_TOKENS_CHAVE das funções, lida do COFRE pelo scripts/segredos/mp_conta.py (o MCP local por stdio) — SÓ na memória
    desta rodada (nunca no estado, na tela ou no log); antes de usar, o digest das funções tem de ser o sha256 dela (é a chave com que as
    funções publicadas abrem o token)."""
    if CTX.get("_chave_servico"):
        return CTX["_chave_servico"]
    sys.path.insert(0, str(RAIZ / "scripts" / "segredos"))
    import mp_conta as M  # noqa: PLC0415
    import servidor as SS  # noqa: PLC0415

    r = SS.Remoto()
    try:
        chave = M.chave_do_cofre(r)
        digest = r.segredos("principal").get(M.SEGREDO_CHAVE)
    finally:
        r.fechar()
    if not chave or not M.chave_valida(chave) or digest != sha256_hex(chave):
        raise RuntimeError("a MP_TOKENS_CHAVE do cofre não confere com a das funções (rode  mp_conta.py chave conferir)")
    CTX["_chave_servico"] = chave
    return chave


def simular_por_sql(chave_publica: str | None) -> None:
    """--conexao-sql (o padrão sem master no Auth — hml-02/H-04: a pagamentos-aluno só aceita o master pelo app_metadata e essa regra NÃO
    muda): a conexão como o prof_mp_simular_conexao a gravaria — o /users/me da credencial de TESTE da aplicação, o token dela cifrado com
    a MP_TOKENS_CHAVE das funções e o AD da conta — SÓ no staging. O desfazer apaga a integração (comandos_do_desfazer)."""
    st, eu = B.mp_teste("GET", "/users/me")
    if st != 200 or not isinstance(eu, dict) or not eu.get("id"):
        raise RuntimeError(f"/users/me da credencial de TESTE da aplicação: {st}")
    token = (CASA / ".physiq-mp-test").read_text(encoding="utf-8").strip()
    cifra = cifrar(token, dado_associado(CTX["conta"], "access"), chave_do_servico())
    sql(comando_simular_sql(CTX["conta"], int(eu["id"]), chave_publica, cifra, (CTX.get("estado") or {}).get("master_uid")))


def garantir_simulada(ligar: bool = True) -> dict:
    """A conta do prof2 conectada pela credencial de TESTE da aplicação (prof_mp_simular_conexao, só master — ou, com --conexao-sql, o mesmo
    gravado por SQL do servidor) e, com `ligar`, no MP da conta."""
    cancelar_vivas()
    chave = (CASA / ".physiq-mp-public-test").read_text(encoding="utf-8").strip() if (CASA / ".physiq-mp-public-test").exists() else None
    if not ligar:
        modo_conta("pix_manual")
    if CTX.get("conexao_sql"):
        simular_por_sql(chave)
    else:
        st, r = pedir(MASTER, "prof_mp_simular_conexao", {"conta_id": CTX["conta"], **({"chave_publica": chave} if chave else {})})
        if st != 200:
            raise RuntimeError(f"prof_mp_simular_conexao {st} {r.get('erro')} {r.get('status_mp', '')}")
    if ligar:
        modo_conta("mercadopago_conta")
    return {"chave": chave, "integracao": linha_integracao()}


def caso_recebimento() -> None:
    print("\n── recebimento: o dono vê o MP da conta e o Conectar devolve só a URL do MP (o state de uso único + S256; sem o id da conexão — I8)")
    conta = CTX["conta"]
    st, r = pedir(DONO, "prof_recebimento", {"conta_id": conta})
    p.check(st == 200 and (r.get("mercadopago_conta") or {}).get("disponivel") is True, f"o dono vê 'mercadopago_conta' com a flag do staging ligada ({st} {r.get('erro')})")
    antes = um(f"select count(*)::int as n from {S}.mp_conexoes where conta_id = '{conta}'")["n"]
    st, r = pedir(DONO, "prof_mp_conectar", {"conta_id": conta})
    if st == 503 and r.get("erro") == "mp_oauth_nao_configurado":
        p.check(True, "ANOTADO: sem o Client Secret (ou a MP_TOKENS_CHAVE) nas funções → 503 mp_oauth_nao_configurado — o OAuth fica para o FIM")
    else:
        u = urllib.parse.urlsplit(r.get("url") or "")
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        conhecidos = clientes_conhecidos()
        client_ok = q.get("client_id") in conhecidos if conhecidos else bool(re.fullmatch(r"\d{10,20}", q.get("client_id", "")))
        p.check(st == 200 and u.scheme == "https" and u.hostname == "auth.mercadopago.com" and u.path == "/authorization" and client_ok
                and q.get("response_type") == "code" and q.get("platform_id") == "mp" and q.get("redirect_uri") == REDIRECT_PROPRIO
                and bool(ESTADO_RX.fullmatch(q.get("state", ""))) and q.get("code_challenge_method") == "S256"
                and len(q.get("code_challenge", "")) == 43,
                f"a URL do MP: auth.mercadopago.com, o client certo, response_type, platform_id, o redirect PRÓPRIO do staging, state de 43 e S256 ({st} {r.get('erro')})")
        p.check(set(r) <= {"ok", "url", "expira_em"}, f"sem o id da conexão na resposta (I8) — chaves {sorted(r)}")
        con = um(f"""select count(*)::int as n, bool_and(redirect_uri = {lit(REDIRECT_PROPRIO)} and usado_em is null) as ok from {S}.mp_conexoes
                      where conta_id = '{conta}' and criado_em >= {lit(CTX['t0'])}::timestamptz""")
        p.check(con["n"] >= 1 and con["ok"], f"a conexão nasceu com o redirect próprio, ainda sem uso ({con})")
    n0 = um(f"select count(*)::int as n from {S}.mp_conexoes where conta_id = '{conta}'")["n"]
    st, r = pedir(DONO, "prof_mp_conectar", {"conta_id": conta, "origem": "apk"})
    n1 = um(f"select count(*)::int as n from {S}.mp_conexoes where conta_id = '{conta}'")["n"]
    p.check(st == 200 and r.get("url") == f"{VOLTA_SITE}?mp=conectar" and r.get("no_site") is True and n1 == n0,
            f"origem apk → a URL do SITE e nenhuma conexão criada (decisão 6) ({st} {n0}→{n1})")
    st, r = pedir(ALUNO, "prof_mp_conectar", {"conta_id": conta})
    p.check(st == 403 and r.get("erro") == "so_o_dono", f"o aluno → 403 ({st} {r.get('erro')})")
    st, r = pedir(MASTER, "prof_mp_conectar", {"conta_id": conta})
    p.check(st == 403 and r.get("erro") == "so_o_dono", f"o master numa conta que não é dele → 403 so_o_dono (MENOR 19) ({st} {r.get('erro')})")
    sql(f"update {S}.app_config set valor = jsonb_build_object('liberada', false) where chave = 'mercadopago_conta'")
    try:
        st, r = pedir(DONO, "prof_mp_conectar", {"conta_id": conta})
        st2, r2 = pedir(DONO, "prof_recebimento", {"conta_id": conta})
    finally:
        sql(f"update {S}.app_config set valor = jsonb_build_object('liberada', true) where chave = 'mercadopago_conta'")
    p.check(st == 403 and r.get("erro") == "mp_conta_em_teste" and st2 == 200 and (r2.get("mercadopago_conta") or {}).get("disponivel") is False,
            f"flag desligada → 403 mp_conta_em_teste e a opção some ({st} {r.get('erro')} · {st2})")
    depois = um(f"select count(*)::int as n from {S}.mp_conexoes where conta_id = '{conta}'")["n"]
    p.check(depois - antes <= 1, f"só o Conectar do site criou conexão (o apk, o aluno, o master e a flag desligada, nenhuma) ({antes}→{depois})")


def caso_guarda() -> None:
    print("\n── guarda: o app não grava o modo sem a integração nem lê as tabelas do servidor (2ª camada, I7)")
    conta = CTX["conta"]
    sql(f"delete from {S}.recebimento_integracoes where conta_id = '{conta}' and provedor = 'mercadopago'")
    cancelar_vivas()
    modo_conta("pix_manual")
    st, r = B.rest(DONO, "PATCH", f"contas?id=eq.{conta}", {"recebimento_modo": "mercadopago_conta"})
    p.check(st >= 400 and "mp_conta_sem_integracao" in json.dumps(r) and modo() == "pix_manual",
            f"o dono grava mercadopago_conta direto pelo banco sem integração → recusado (mp_conta_sem_integracao) ({st})")
    for tabela in ("recebimento_integracoes", "mp_conexoes"):
        st, r = B.rest(DONO, "GET", f"{tabela}?conta_id=eq.{conta}&select=*")
        p.check(st in (401, 403) or (st == 200 and r == []), f"o app não lê {tabela} ({st} {str(r)[:80]})")
    st, r = B.rest(DONO, "POST", "rpc/w27_conta_linha", {"p_conta": conta})
    p.check(st in (401, 403, 404) and "chave_pix" not in json.dumps(r), f"rpc w27_conta_linha como o dono → recusado (I7) ({st})")


def caso_simulada() -> None:
    print("\n── simulada: o master conecta com a credencial de TESTE da aplicação e o dono liga o MP da conta (prova a GRAVAÇÃO — MENOR 16)")
    conta = CTX["conta"]
    sql(f"delete from {S}.recebimento_integracoes where conta_id = '{conta}' and provedor = 'mercadopago'")
    cancelar_vivas()
    modo_conta("pix_manual")
    chave = (CASA / ".physiq-mp-public-test").read_text(encoding="utf-8").strip() if (CASA / ".physiq-mp-public-test").exists() else None
    st, r = pedir(MASTER, "prof_mp_simular_conexao", {"conta_id": conta, **({"chave_publica": chave} if chave else {})})
    if CTX.get("conexao_sql"):
        # o master de teste é master SÓ no staging.profiles (hml-02/H-04: nunca no Auth) e a função só aceita o master pelo app_metadata:
        # a regra fica (403) e a MESMA conexão vai por SQL do servidor; o dono lê a vista dela pelo prof_recebimento
        p.check(st == 403 and r.get("erro") == "so_master",
                f"prof_mp_simular_conexao com o master de teste (não é master no Auth) → 403 so_master — a regra da função segue ({st} {r.get('erro')})")
        simular_por_sql(chave)
        st, r = pedir(DONO, "prof_recebimento", {"conta_id": conta})
    i = linha_integracao() or {}
    p.check(st == 200 and (r.get("mercadopago_conta") or {}).get("status") == "ativa" and i.get("mp_origem") == "teste_sem_oauth"
            and bool(CIFRA_RX.fullmatch(i.get("mp_access_token") or "")) and i.get("mp_refresh_token") is None and (i.get("mp_user_id") or 0) > 0,
            f"{'a conexão simulada por SQL (o upsert do prof_mp_simular_conexao)' if CTX.get('conexao_sql') else 'prof_mp_simular_conexao'}: "
            f"ativa, teste_sem_oauth, o token CIFRADO, sem refresh ({st} {r.get('erro')} {r.get('status_mp', '')})")
    st, r = pedir(DONO, "prof_recebimento_salvar", {"conta_id": conta, "modo": "mercadopago_conta"})
    p.check(st == 200 and (r.get("conta") or {}).get("modo") == "mercadopago_conta", f"o dono salva mercadopago_conta ({st} {r.get('erro')})")
    st, r = pedir(ALUNO, "aluno_status")
    mp = matricula_do_status(r).get("mp") or {}
    p.check(st == 200 and mp.get("disponivel") is True and (mp.get("chave_publica") == chave if chave else str(mp.get("chave_publica") or "").startswith("TEST-")),
            f"aluno_status com mp {{disponivel: true, chave_publica: TEST-…}} ({st} {mp.get('disponivel')})")


def caso_pix() -> None:
    print("\n── pix: o Pix nasce NA CONTA (o collector e a notification_url com &conta=) e a simulação paga pela credencial dela")
    garantir_simulada()
    esconder()
    st, r = pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"]})
    c = (r.get("cobranca") or {}).get("id")
    linha = cobranca(c)
    anotar_criado_no_mp("payment", linha.get("mp_payment_id"))
    integ = linha_integracao() or {}
    p.check(st == 200 and linha.get("forma") == "mp" and linha.get("metodo") == "pix" and linha.get("mp_collector_id") == integ.get("mp_user_id"),
            f"aluno_mp_pix → o Pix com mp_collector_id da conta ({st} {r.get('erro')} {r.get('simulado')})")
    pid = linha.get("mp_payment_id") or ""
    if pid.startswith("sim-") or not pid:
        p.check(False, f"o sandbox não criou o Pix (o fallback 'sim-' do staging) — a notification_url não pôde ser lida ({pid[:8]})")
    else:
        stm, pay = B.mp_teste("GET", f"/v1/payments/{pid}")
        p.check(stm == 200 and isinstance(pay, dict) and pay.get("notification_url") == NOTIFICACAO_CONTA.format(conta=CTX["conta"]),
                f"a notification_url do pagamento (lida de volta no MP) leva &conta= ({stm})")
    st, r = pedir(DONO, "simular_aprovacao", {"cobranca_id": c})
    p.check(st == 200 and cobranca(c).get("status") == "paga", f"simular_aprovacao → paga pela credencial da conta ({st} {r.get('erro')})")


def caso_cartao() -> None:
    print("\n── cartao: APRO na conta, o detalhe e o estorno pela credencial da conta")
    garantir_simulada()
    esconder()
    st, r = pedir(ALUNO, "aluno_mp_cartao", {"paciente_id": CTX["pac"], "card_token": B.token_cartao("APRO"), "payment_method_id": "master",
                                            "installments": 1})
    c = (r.get("cobranca") or {}).get("id")
    linha = cobranca(c)
    integ = linha_integracao() or {}
    p.check(st == 200 and linha.get("status") == "paga" and linha.get("mp_collector_id") == integ.get("mp_user_id"),
            f"APRO → paga com o mp_collector_id da conta ({st} {r.get('erro')} {r.get('detalhe', '')})")
    CTX["cartao"] = {"cobranca": c, "pagamento": linha.get("mp_payment_id")}
    st, r = pedir(ALUNO, "detalhe_mp", {"cobranca_id": c})
    p.check(st == 200 and (r.get("mp") or {}).get("status") == "approved", f"detalhe_mp pela conta ({st} {r.get('erro')})")
    st, r = pedir(DONO, "prof_reembolsar", {"cobranca_id": c})
    linha = cobranca(c)
    p.check(st == 200 and linha.get("mp_status") == "refunded" and bool(linha.get("reembolsado_em")),
            f"prof_reembolsar pela conta → refunded ({st} {r.get('erro')} {r.get('status_mp', '')})")


def caso_automatica() -> None:
    print("\n── automatica: a cobrança automática nasce na conta (o sandbox: pendente com init_point — MENOR 28) e cancela pela conta")
    garantir_simulada()
    st, r = pedir(ALUNO, "aluno_mp_assinar", {"paciente_id": CTX["pac"], "card_token": B.token_cartao("APRO")})
    a = assinatura_viva()
    anotar_criado_no_mp("preapproval", a.get("mp_preapproval_id"))
    integ = linha_integracao() or {}
    p.check(st == 200 and r.get("sandbox") is True and bool(r.get("init_point")) and a.get("mp_collector_id") == integ.get("mp_user_id"),
            f"aluno_mp_assinar → pendente com init_point e mp_collector_id da conta ({st} {r.get('erro')} {r.get('status_mp', '')})")
    st, r = pedir(ALUNO, "aluno_mp_cancelar", {"paciente_id": CTX["pac"]})
    p.check(st == 200 and assinatura(a.get("id")).get("status") == "cancelled", f"aluno_mp_cancelar pela conta ({st} {r.get('erro')})")


def caso_webhook() -> None:
    print("\n── webhook: o aviso por conta na função PUBLICADA (nada muda no que já foi tratado; conta inventada sem ir ao MP; 413 em pedaços)")
    conta = CTX["conta"]
    if not (CTX.get("cartao") or {}).get("pagamento"):
        caso_cartao()
    c, pid = CTX["cartao"]["cobranca"], CTX["cartao"]["pagamento"]
    integ = linha_integracao() or {}
    url = f"{B.PRINCIPAL_URL}/functions/v1/mp-webhook-aluno"

    def aviso(busca: dict, corpo: dict) -> tuple[int, dict, float]:
        t0 = time.time()
        st, r, _ = rede("POST", f"{url}?{urllib.parse.urlencode(busca)}", corpo, timeout=40)
        return st, (r if isinstance(r, dict) else {}), time.time() - t0

    antes = cobranca(c)
    corpo = {"type": "payment", "action": "payment.updated", "data": {"id": str(pid)}, "user_id": integ.get("mp_user_id")}
    st, r, _ = aviso({"schema": S, "conta": conta, "data.id": pid, "type": "payment"}, corpo)
    depois = cobranca(c)
    p.check(st == 200 and r.get("resultado") == f"cobranca_{antes.get('status')}" and depois == antes,
            f"o pagamento do caso cartao avisado de novo → cobranca_{antes.get('status')} e nada muda ({st} {r.get('resultado')})")
    st, r, _ = aviso({"schema": S, "conta": conta, "data.id": pid, "type": "payment"}, {**corpo, "user_id": 123456789})
    p.check(st == 200 and r.get("resultado") == f"cobranca_{antes.get('status')}" and cobranca(c) == antes,
            f"a mesma conta com o user_id de outro → segue e trata igual (I4: só vai ao log) ({st} {r.get('resultado')})")
    inventada = str(uuid.uuid4())
    aviso({"schema": S, "conta": inventada, "data.id": pid, "type": "payment"}, corpo)   # aquece a instância
    st, r, seg = aviso({"schema": S, "conta": str(uuid.uuid4()), "data.id": pid, "type": "payment"}, corpo)
    p.check(st == 200 and r.get("resultado") == "conta_sem_mp" and seg < 1.5,
            f"conta inventada → conta_sem_mp (nenhuma ida ao MP) em {seg * 1000:.0f} ms daqui ({st} {r.get('resultado')})")
    st, r = post_em_pedacos(f"{url}?schema={S}&conta={conta}", b'{"lixo": "' + b"x" * 17_000 + b'"}')
    p.check(st == 413 and (r or {}).get("resultado") == "corpo_grande", f"17 KB SEM content-length (chunked) → 413 (MENOR 4) ({st})")


def caso_desconectar() -> None:
    print("\n── desconectar: com a automática viva pede o OK; com ele cancela e troca; conectado sem trocar → só desconecta (MENOR 10)")
    conta = CTX["conta"]
    g = garantir_simulada()
    collector = (g["integracao"] or {}).get("mp_user_id")
    aid = inserir_assinatura(f"sim-w2e2e-{secrets.token_hex(6)}", "authorized", collector, {"simulada": True, "teste_w2": True})
    st, r = pedir(DONO, "prof_mp_desconectar", {"conta_id": conta})
    p.check(st == 409 and r.get("erro") == "automaticas_ativas" and r.get("alunos") == 1, f"com a automática viva → 409 ({st} {r.get('erro')})")
    esperado = "pix_manual" if chave_ativa() else "nenhum"
    n_av = avisos("geral", "forma de receber")["aluno"]
    st, r = pedir(DONO, "prof_mp_desconectar", {"conta_id": conta, "cancelar_automaticas": True})
    i = linha_integracao() or {}
    p.check(st == 200 and r.get("automaticas_canceladas") == 1 and modo() == esperado and i.get("status") == "desconectada"
            and bool(i.get("desconectada_em")) and assinatura(aid).get("status") == "cancelled"
            and avisos("geral", "forma de receber")["aluno"] == n_av + 1,
            f"com o OK → cancelada, modo {esperado}, integração desconectada, aviso ao aluno ({st} {r.get('erro')} {modo()})")
    garantir_simulada(ligar=False)
    st, r = pedir(DONO, "prof_mp_desconectar", {"conta_id": conta})
    i = linha_integracao() or {}
    p.check(st == 200 and i.get("status") == "desconectada" and modo() == "pix_manual",
            f"conectado_sem_trocar (modo ainda Pix) → desconectar marca desconectada direto (MENOR 10) ({st} {r.get('erro')})")


def caso_master() -> None:
    print("\n── master: o 'Desligar' do master com automática viva pede o OK; com ele cancela e troca (MENOR 7)")
    g = garantir_simulada()
    collector = (g["integracao"] or {}).get("mp_user_id")
    aid = inserir_assinatura(f"sim-w2e2e-{secrets.token_hex(6)}", "authorized", collector, {"simulada": True, "teste_w2": True})
    st, r = master_acao({"modo": "pix_manual"})
    p.check(st == 409 and r.get("erro") == "automaticas_ativas" and r.get("alunos") == 1 and modo() == "mercadopago_conta",
            f"o master troca com automática viva → 409 e nada muda ({st} {r.get('erro')})")
    st, r = master_acao({"modo": "pix_manual", "cancelar_automaticas": True})
    i = linha_integracao() or {}
    p.check(st == 200 and (r.get("automaticas") or {}).get("canceladas") == 1 and modo() == "pix_manual" and i.get("status") == "desconectada"
            and assinatura(aid).get("status") == "cancelled",
            f"com cancelar_automaticas → cancela e troca (a integração desconectada pelo gatilho) ({st} {r.get('erro')})")


def caso_erro() -> None:
    print("\n── erro: a conexão em erro recusa o que cria (409) e a leitura não derruba a tela (I3)")
    garantir_simulada()
    esconder()
    sql(f"update {S}.recebimento_integracoes set status = 'erro', mp_erro = 'acesso_recusado' where conta_id = '{CTX['conta']}' and provedor = 'mercadopago'")
    st, r = pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"]})
    p.check(st == 409 and r.get("erro") == "mp_conta_indisponivel", f"aluno_mp_pix → 409 mp_conta_indisponivel ({st} {r.get('erro')})")
    st, r = pedir(ALUNO, "aluno_status")
    mat = matricula_do_status(r)
    total = um(f"select count(*)::int as n from {S}.cobrancas where paciente_id = '{CTX['pac']}' and deleted_at is null")["n"]
    p.check(st == 200 and mat.get("mp") == {"disponivel": False, "chave_publica": None} and mat.get("total_cobrancas") == total
            and len(mat.get("cobrancas") or []) == min(total, 48),
            f"aluno_status 200 com mp.disponivel false E o histórico inteiro ({st} {mat.get('total_cobrancas')}/{total})")
    st, r = pedir(DONO, "prof_aluno", {"aluno": CTX["pac"]})
    p.check(st == 200 and r.get("ok") is True, f"prof_aluno 200 (I3) ({st} {r.get('erro')})")
    sql(f"update {S}.recebimento_integracoes set status = 'ativa', mp_erro = null where conta_id = '{CTX['conta']}' and provedor = 'mercadopago'")


def caso_oauth_real() -> None:
    print("\n── oauth_real: o vendedor de TESTE autoriza de verdade (o code no PEDIDO — I6) e o prof2 confirma (I8)")
    import prova_public_key as PROVA  # noqa: PLC0415 — o Playwright só carrega aqui
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    conta = CTX["conta"]
    try:
        vendedor = PROVA.ler_600(".physiq-mp-vendedor-teste.json")
        comprador = PROVA.ler_600(".physiq-mp-comprador-teste.json")
    except AssertionError as e:
        p.check(False, f"falta o vendedor/comprador de teste ({e}) — mp_conta.py usuarios-teste criar")
        return
    base_publicada()
    proprio = bool(CTX.get("redirect_proprio"))
    st, r = pedir(DONO, "prof_mp_conectar", {"conta_id": conta, **({} if proprio else {"redirect_teste": True})})
    if st != 200:
        p.check(False, f"prof_mp_conectar {st} {r.get('erro')} — sem o Client Secret nas funções o oauth_real não roda (FIM)")
        return
    q = {k: v[0] for k, v in urllib.parse.parse_qs(urllib.parse.urlsplit(r["url"]).query).items()}
    redirect = q.get("redirect_uri") or ""
    p.check(redirect == (REDIRECT_PROPRIO if proprio else REDIRECT_TESTE), f"o redirect da conexão ({'próprio' if proprio else 'o de teste do MP'})")
    registro: dict = {}
    with sync_playwright() as pw:
        nav, ctx = PROVA.abrir_navegador(pw, CTX.get("canal") or "msedge", bool(CTX.get("com_tela")))
        try:
            code = PROVA.seguir_ate_o_code(ctx.new_page(), r["url"], q.get("state", ""), vendedor, "oauth_real", registro, redirect)
        finally:
            nav.close()
    if not code:
        p.check(False, f"o code não chegou (motivo: {registro.get('motivo')}) — print em ~/projetos/physiqcalc-scratch/prints/w2/prova/")
        return
    v = volta(f"{redirect}?{urllib.parse.urlencode({'code': code, 'state': q.get('state', '')})}", publicada=True)
    p.check(v["status"] == 302 and v["mp"] == "confirmar" and bool(UUID_RX.fullmatch(v["c"] or "")) and v["no_referrer"],
            f"a mp-conectar-retorno/staging PUBLICADA → 302 ?mp=confirmar&c=<id> ({v['status']} {v['mp']})")
    st, r = confirmar(v["c"])
    i = linha_integracao() or {}
    p.check(st == 200 and r.get("resultado") in ("ok", "conectado_sem_trocar") and i.get("status") == "ativa" and i.get("mp_origem") == "oauth"
            and i.get("mp_teste") is True and str(i.get("mp_user_id")) == str(vendedor.get("id")),
            f"prof_mp_confirmar como o prof2 → oauth ativa, mp_teste, collector = o vendedor ({st} {r.get('erro')} {r.get('resultado')})")
    modo_conta("mercadopago_conta")
    esperado_pagador = CTX.get("pagador_email") or PROVA.email_do_comprador({}, comprador)[0]
    if i.get("mp_public_key"):
        stc, tok, _ = B.http("POST", f"{B.MP}/v1/card_tokens?public_key={i['mp_public_key']}", {
            "card_number": "5031433215406351", "expiration_month": 11, "expiration_year": 2030, "security_code": "123",
            "cardholder": {"name": "APRO", "identification": {"type": "CPF", "number": "12345678909"}}})
        esconder()
        st, r = pedir(ALUNO, "aluno_mp_cartao", {"paciente_id": CTX["pac"], "card_token": (tok or {}).get("id"), "payment_method_id": "master",
                                                "installments": 1})
        c = (r.get("cobranca") or {}).get("id")
        p.check(stc in (200, 201) and st == 200 and cobranca(c).get("status") == "paga" and cobranca(c).get("mp_collector_id") == i.get("mp_user_id"),
                f"o aluno paga cartão APRO com a chave do VENDEDOR ({stc}/{st} {r.get('erro')} {r.get('detalhe', '')})")
        std, rd = pedir(ALUNO, "detalhe_mp", {"cobranca_id": c})
        pagador = (rd.get("mp") or {}).get("payer_email")
        p.check(std == 200, f"MENOR 21: o pagador {'=' if pagador == esperado_pagador else '≠'} o comprador de teste (o MP_TEST_PAYER_EMAIL das funções decide)")
        pedir(DONO, "prof_reembolsar", {"cobranca_id": c})
    else:
        p.check(True, "ANOTADO: o MP não mandou a public_key do vendedor (decisão 14: só Pix) — o cartão fica para a Task 5/P-C")
    segredo = (CASA / ".physiq-segredo-mp-renovar").read_text(encoding="utf-8").strip() if (CASA / ".physiq-segredo-mp-renovar").exists() else ""
    antes = linha_integracao() or {}
    st, r, _ = rede("POST", f"{B.PRINCIPAL_URL}/functions/v1/mp-contas-renovar", {"schema": S, "forcar_conta": conta}, {"x-espelho-segredo": segredo},
                    timeout=150)
    depois = linha_integracao() or {}
    p.check(st == 200 and (r or {}).get("renovadas") == 1 and depois.get("mp_refresh_token") != antes.get("mp_refresh_token"),
            f"mp-contas-renovar {{forcar_conta}} → renovada (o refresh girou) ({st} {r if isinstance(r, dict) else ''})")
    cancelar_vivas()
    st, r = pedir(DONO, "prof_mp_desconectar", {"conta_id": conta, "cancelar_automaticas": True})
    p.check(st == 200 and (linha_integracao() or {}).get("status") == "desconectada", f"desconectar ({st} {r.get('erro')})")


def base_publicada() -> None:
    """O ponto de partida do oauth_real: sem integração, Pix na chave."""
    cancelar_vivas()
    esconder()
    modo_conta("pix_manual")
    sql(f"delete from {S}.recebimento_integracoes where conta_id = '{CTX['conta']}' and provedor = 'mercadopago'")


# ───────────────────────── casos --local (o simulador no lugar do MP) ─────────────────────────

def local_conectar() -> None:
    print("\n── conectar (local): o OAuth inteiro no simulador — a volta só guarda o par (I8); a confirmação COMO O PROF2 grava a integração")
    base_sem_integracao()
    n0 = sim_n()
    st, r = pedir(DONO, "prof_mp_conectar", {"conta_id": CTX["conta"]})
    url = r.get("url") or ""
    u = urllib.parse.urlsplit(url)
    q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
    p.check(st == 200 and u.netloc == f"127.0.0.1:{PORTAS['sim']}" and u.path == "/authorization" and q.get("client_id") == SIM.CLIENTE_ID
            and q.get("response_type") == "code" and q.get("platform_id") == "mp" and q.get("redirect_uri") == REDIRECT_PROPRIO
            and bool(ESTADO_RX.fullmatch(q.get("state", ""))) and q.get("code_challenge_method") == "S256" and len(q.get("code_challenge", "")) == 43,
            f"prof_mp_conectar → a autorização (o simulador pelo MP_AUTH_BASE), o client, o redirect próprio, state de 43, S256 ({st} {r.get('erro')})")
    p.check(set(r) <= {"ok", "url", "expira_em"}, f"sem o id da conexão na resposta (I8) — chaves {sorted(r)}")
    con0 = ultima_conexao()
    p.check(con0.get("resultado") is None and con0.get("usado_em") is None and con0.get("redirect_uri") == REDIRECT_PROPRIO,
            f"a conexão nasceu (só o hash do state), sem uso ({con0.get('resultado')})")
    v = volta(autorizar(url))
    p.check(v["status"] == 302 and v["mp"] == "confirmar" and bool(UUID_RX.fullmatch(v["c"] or "")) and v["destino"].startswith(VOLTA_SITE)
            and v["no_referrer"] and v["no_store"],
            f"a volta local → 302 para o site ?mp=confirmar&c=<id>, no-referrer e no-store ({v['status']} {v['mp']})")
    con = conexao(v["c"])
    chave = segredos_da_rodada()["chave"]
    try:
        tok = decifrar(con.get("token_access") or "", dado_associado(CTX["conta"], "access"), chave)
        ref = decifrar(con.get("token_refresh") or "", dado_associado(CTX["conta"], "refresh"), chave)
    except Exception:  # noqa: BLE001
        tok = ref = ""
    info, info_r = (sim_info(tok) if tok else {}), (sim_info(ref) if ref else {})
    p.check(con.get("resultado") == "confirmar" and con.get("mp_user_id") == A and con.get("mp_apelido") == f"SIMULADOR{A}"
            and con.get("public_key") == SIM.chave_publica_de(A) and con.get("live") is False and info.get("vivo") is True
            and info.get("vendedor") == A and info_r.get("tipo") == "refresh",
            "a conexão guardou o par CIFRADO (abre com a chave da rodada no par vivo do vendedor A), o apelido, a chave pública e live false")
    p.check(linha_integracao() is None, "nada em recebimento_integracoes antes da confirmação (I8)")
    troca = [x for x in sim_pedidos(n0) if x["caminho"] == "/oauth/token"]
    p.check(len(troca) == 1 and troca[0]["status"] == 200 and troca[0].get("grant_type") == "authorization_code" and troca[0].get("redirect_ok") is True
            and troca[0].get("pkce") == "ok" and troca[0].get("test_token") == "true",
            f"o simulador conferiu a troca: o redirect IGUAL ao da autorização, o PKCE S256 e test_token true ({[(x['status'], x.get('pkce')) for x in troca]})")
    st, r = confirmar(v["c"], sim_confirmar=False)
    p.check(st == 200 and r.get("apelido") == f"SIMULADOR{A}" and r.get("teste") is True, f"a pergunta: o apelido da conta ({st} {r.get('erro')})")
    st, r = confirmar(v["c"])
    i = linha_integracao() or {}
    con2 = conexao(v["c"])
    p.check(st == 200 and r.get("resultado") == "ok" and ((r.get("recebimento") or {}).get("conta") or {}).get("modo") == "mercadopago_conta",
            f"prof_mp_confirmar {{confirmar: true}} COMO O PROF2 → ok e o modo na resposta ({st} {r.get('erro')})")
    p.check(i.get("status") == "ativa" and i.get("mp_origem") == "oauth" and i.get("mp_user_id") == A and i.get("mp_teste") is True
            and i.get("mp_access_token") == con.get("token_access") and i.get("mp_refresh_token") == con.get("token_refresh")
            and bool(CIFRA_RX.fullmatch(i.get("mp_access_token") or "")),
            "a integração: ativa, oauth, o collector A, mp_teste e as 2 cifras da conexão (v1:)")
    p.check(con2.get("resultado") == "ok" and con2.get("token_access") is None and con2.get("token_refresh") is None and modo() == "mercadopago_conta",
            "a conexão ficou sem o par e o modo virou mercadopago_conta")
    texto = json.dumps(i)
    p.check(bool(tok) and tok not in texto and ref not in texto, "nenhum token em claro na integração")


def local_confirmar_outro() -> None:
    print("\n── confirmar_outro (local, I8): só quem começou confirma; 16 min depois vence; a mesma 2× não vale")
    base(A, origem="oauth")
    v = conectar()
    antes = linha_integracao()
    st, r = confirmar(v["c"], conta=ALUNO)
    st2, r2 = confirmar(v["c"], conta=ALUNO, sim_confirmar=False)
    p.check(st == 403 and r.get("erro") == "mp_outra_pessoa" and st2 == 403 and r2.get("erro") == "mp_outra_pessoa"
            and conexao(v["c"]).get("resultado") == "confirmar" and mesma_integracao(antes, linha_integracao()),
            f"a conexão do prof2 confirmada com a sessão do ALUNO2 → 403 mp_outra_pessoa e NADA na integração ({st}/{st2})")
    sql(f"update {S}.mp_conexoes set usado_em = now() - interval '16 minutes' where id = '{v['c']}'")
    st, r = confirmar(v["c"], sim_confirmar=False)
    st2, r2 = confirmar(v["c"])
    con = conexao(v["c"])
    p.check(st == 409 and r.get("erro") == "mp_vencido" and st2 == 409 and r2.get("erro") == "mp_vencido" and con.get("resultado") == "vencido"
            and con.get("token_access") is None and mesma_integracao(antes, linha_integracao()),
            f"a do prof2 com 16 min → vencido (o par sai) ({st}/{st2} {r2.get('erro')})")
    v2 = conectar()
    st, r = confirmar(v2["c"])
    st2, r2 = confirmar(v2["c"])
    p.check(st == 200 and r.get("resultado") == "ok" and st2 == 409 and r2.get("erro") == "mp_invalido",
            f"a mesma confirmação 2× → a 2ª invalido ({st}/{st2} {r2.get('erro')})")


def local_reusado() -> None:
    print("\n── reusado (local): o state é de uso único; o vencido e o negado")
    base(A, origem="oauth")
    loc = autorizar(conectar_url())
    v1, v2 = volta(loc), volta(loc)
    p.check(v1["mp"] == "confirmar" and v2["mp"] == "invalido", f"o mesmo state de novo → ?mp=invalido ({v1['mp']} → {v2['mp']})")
    loc = autorizar(conectar_url())
    sql(f"""update {S}.mp_conexoes set expira_em = now() - interval '1 minute' where conta_id = '{CTX['conta']}' and usado_em is null
              and criado_em >= {lit(CTX['t0'])}::timestamptz""")
    v = volta(loc)
    p.check(v["mp"] == "vencido", f"state vencido (expira_em no passado) → ?mp=vencido ({v['mp']})")
    sim_cenario(negar=True)
    try:
        loc = autorizar(conectar_url())
    finally:
        sim_cenario()
    v, v2 = volta(loc), volta(loc)
    p.check("error=access_denied" in loc and v["mp"] == "negado" and ultima_conexao().get("resultado") == "negado" and v2["mp"] == "invalido",
            f"error=access_denied → negado (e a 2ª volta invalido) ({v['mp']} → {v2['mp']})")


def local_troca_ruim() -> None:
    print("\n── troca_ruim (local): o MP recusa a troca (invalido — MENOR 14) ou cai (falhou); nada gravado")
    base(A, origem="oauth")
    antes = linha_integracao()
    for status_mp, esperado in ((400, "invalido"), (500, "falhou")):
        sim_cenario(troca_status=status_mp)
        try:
            v = conectar()
        finally:
            sim_cenario()
        con = ultima_conexao()
        p.check(v["mp"] == esperado and con.get("resultado") == esperado and con.get("token_access") is None,
                f"a troca com {status_mp} → ?mp={esperado} e a conexão sem par ({v['mp']} · {con.get('resultado')})")
    p.check(mesma_integracao(antes, linha_integracao()), "a integração não mudou")


def local_modo_errado() -> None:
    print("\n── modo_errado (local, MENOR 20): conta de verdade (live_mode true) no staging → conta_de_teste e nada guardado")
    base(A, origem="oauth")
    antes = linha_integracao()
    sim_cenario(live_mode=True)
    try:
        v = conectar()
    finally:
        sim_cenario()
    con = ultima_conexao()
    p.check(v["mp"] == "conta_de_teste" and con.get("resultado") == "conta_de_teste" and con.get("token_access") is None
            and mesma_integracao(antes, linha_integracao()), f"?mp=conta_de_teste e nada guardado ({v['mp']} · {con.get('resultado')})")


def local_sem_chave() -> None:
    print("\n── sem_chave (local, decisão 14): o MP sem a public_key → o app não oferece o cartão (chave_publica null)")
    base(A, origem="oauth")
    sim_cenario(sem_public_key=True)
    try:
        v = conectar()
    finally:
        sim_cenario()
    st, r = confirmar(v["c"])
    i = linha_integracao() or {}
    st2, r2 = pedir(ALUNO, "aluno_status")
    p.check(st == 200 and i.get("mp_public_key") is None and st2 == 200 and matricula_do_status(r2).get("mp") == {"disponivel": True, "chave_publica": None},
            f"mp_public_key nulo e aluno_status mp {{disponivel: true, chave_publica: null}} ({st}/{st2})")


def local_outra_conta() -> None:
    print("\n── outra_conta (local, I5): a automática viva na conta A segura a troca para a conta B do MP")
    base(A)
    pre = sim_post("/_preapproval", {"collector_id": A, "status": "authorized"})
    inserir_assinatura(pre["id"], "authorized", A)
    antes = linha_integracao()
    sim_cenario(vendedor=B_)
    try:
        v = conectar()
    finally:
        sim_cenario()
    st, r = confirmar(v["c"])
    con = conexao(v["c"])
    p.check(st == 409 and r.get("erro") == "mp_outra_conta" and r.get("abertos") == 1 and con.get("resultado") == "outra_conta"
            and con.get("token_access") is None and mesma_integracao(antes, linha_integracao()),
            f"a volta do vendedor B → a confirmação → outra_conta e a integração antiga (A) intacta ({st} {r.get('erro')} {r.get('abertos')})")
    cancelar_vivas()


def local_trocar_com_pix() -> None:
    print("\n── trocar_com_pix (local, I5): o Pix aberto da conta A segura a troca; pago depois, dá baixa pela conta A")
    base(A)
    st, r = janela("pix", CONTA_A, lambda: pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"]}))
    c = (r.get("cobranca") or {}).get("id")
    linha = cobranca(c)
    pid = linha.get("mp_payment_id")
    pay = sim_recurso("payment", pid) if pid else {}
    p.check(st == 200 and linha.get("mp_collector_id") == A and pay.get("collector_id") == A
            and pay.get("notification_url") == NOTIFICACAO_CONTA.format(conta=CTX["conta"])
            and pay.get("external_reference") == f"physiq:{S}:aluno:{CTX['pac']}:mensalidade:{c}" and pay.get("payer", {}).get("email") == PAGADOR_SIM,
            f"o Pix nasceu na conta A: o collector, a notification_url com &conta= e a referência da cobrança ({st} {r.get('erro')})")
    sim_cenario(vendedor=B_)
    try:
        v = conectar()
    finally:
        sim_cenario()
    st, r = confirmar(v["c"])
    p.check(st == 409 and r.get("erro") == "mp_outra_conta" and r.get("abertos") == 1 and (linha_integracao() or {}).get("mp_user_id") == A,
            f"conectar o vendedor B → outra_conta e o token de A segue na integração ({st} {r.get('erro')} {r.get('abertos')})")
    sim_post("/_status", {"tipo": "payment", "id": pid, "status": "approved"})
    st, r = avisar("payment", pid, conta=CTX["conta"], user_id=A)
    p.check(st == 200 and r.get("resultado") == "cobranca_paga_paga" and cobranca(c).get("status") == "paga",
            f"o Pix pago DEPOIS + o aviso → paga pela conta A ({st} {r.get('resultado')})")


def local_pagar() -> None:
    print("\n── pagar (local): Pix, conferência, cartão, detalhe, estorno e a avulsa cancelada — tudo com o token da conta")
    base(A)
    st, r = janela("pix", CONTA_A, lambda: pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"]}))
    c = (r.get("cobranca") or {}).get("id")
    p.check(st == 200 and bool(c) and (r.get("cobranca") or {}).get("pix_copia_cola"), f"o Pix na conta ({st} {r.get('erro')})")
    st, r = janela("conferir", CONTA_A, lambda: pedir(ALUNO, "aluno_mp_conferir", {"cobranca_id": c}))
    st2, _ = janela("conferir", CONTA_A, lambda: pedir(ALUNO, "aluno_status"))
    p.check(st == 200 and (r.get("cobranca") or {}).get("status") == "aguardando_confirmacao" and st2 == 200,
            f"aluno_mp_conferir e aluno_status conferem pela conta: ainda pendente ({st}/{st2})")
    esconder()
    st, r = janela("cartao", CONTA_A, lambda: pedir(ALUNO, "aluno_mp_cartao", {"paciente_id": CTX["pac"], "card_token": "sim-card-APRO",
                                                                              "payment_method_id": "master", "installments": 1}))
    c = (r.get("cobranca") or {}).get("id")
    linha = cobranca(c)
    p.check(st == 200 and linha.get("status") == "paga" and linha.get("mp_collector_id") == A,
            f"o cartão APRO pago na conta (o collector) ({st} {r.get('erro')} {r.get('detalhe', '')})")
    st, r = janela("detalhe", CONTA_A, lambda: pedir(ALUNO, "detalhe_mp", {"cobranca_id": c}))
    p.check(st == 200 and (r.get("mp") or {}).get("status") == "approved" and (r.get("mp") or {}).get("mp_payment_id") == linha.get("mp_payment_id"),
            f"detalhe_mp pela conta ({st} {r.get('erro')})")
    st, r = janela("reembolsar", CONTA_A, lambda: pedir(DONO, "prof_reembolsar", {"cobranca_id": c}))
    linha = cobranca(c)
    p.check(st == 200 and linha.get("mp_status") == "refunded" and bool(linha.get("reembolsado_em"))
            and sim_recurso("payment", linha.get("mp_payment_id")).get("status") == "refunded",
            f"prof_reembolsar pela conta → refunded aqui e no simulador ({st} {r.get('erro')})")
    st, r = pedir(DONO, "prof_cobranca_criar", {"aluno": CTX["pac"], "descricao": f"{PREFIXO} avulsa", "valor": 3, "vencimento": B.hoje()})
    av = (r.get("cobranca") or {}).get("id")
    st2, r2 = janela("pix", CONTA_A, lambda: pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"], "cobranca_id": av}))
    pid = cobranca(av).get("mp_payment_id")
    st3, r3 = janela("cancelar_cobranca", CONTA_A, lambda: pedir(DONO, "prof_cobranca_cancelar", {"cobranca_id": av}))
    p.check(st == 200 and st2 == 200 and st3 == 200 and cobranca(av).get("status") == "cancelada" and bool(pid)
            and sim_recurso("payment", pid).get("status") == "cancelled",
            f"a avulsa no Pix cancelada pelo personal: a linha e o pagamento no MP (pela conta) ({st}/{st2}/{st3} {r3.get('erro')})")
    esconder()
    st, r = pedir(ALUNO, "aluno_mp_cartao", {"paciente_id": CTX["pac"], "card_token": "sim-card-OTHE", "payment_method_id": "master", "installments": 1})
    sobra = um(f"""select count(*)::int as n from {S}.cobrancas where paciente_id = '{CTX['pac']}' and forma = 'mp' and status = 'aguardando_confirmacao'
                     and tipo = 'mensalidade' and deleted_at is null and created_at >= {lit(CTX['t0'])}::timestamptz""")["n"]
    # o MP cria o pagamento RECUSADO (201 rejected — como o sandbox com o OTHE): a linha fecha (cancelada); o 400 cartao_recusado é só para o
    # 4xx do MP (o e2e/w06/api.py prova esse no sandbox)
    p.check(st == 200 and r.get("status") == "cancelada" and (r.get("cobranca") or {}).get("status") == "cancelada" and sobra == 0,
            f"o cartão recusado (OTHE) → a linha cancelada, nenhuma aguardando ({st} {r.get('status') or r.get('erro')} {sobra})")


def local_registrado() -> None:
    print("\n── registrado (local, I5 da W1): registrar à mão com o Pix do MP aguardando usa a MESMA linha; a aprovação depois não dobra")
    base(A)
    st, r = janela("pix", CONTA_A, lambda: pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"]}))
    c = (r.get("cobranca") or {}).get("id")
    pid = cobranca(c).get("mp_payment_id")
    pagas = mensalidades_pagas()
    st, r = janela("registrar", CONTA_A, lambda: pedir(DONO, "prof_registrar", {"aluno": CTX["pac"], "data": B.hoje(), "metodo": "dinheiro", "valor": 10}))
    linha = cobranca(c)
    p.check(st == 200 and (r.get("cobranca") or {}).get("id") == c and linha.get("status") == "paga" and linha.get("forma") == "manual"
            and mensalidades_pagas() == pagas + 1, f"a MESMA linha paga por fora, sem nascer outra ({st} {r.get('erro')} {linha.get('forma')})")
    p.check(bool(pid) and sim_recurso("payment", pid).get("status") == "cancelled", "o Pix fechado no MP pela conta (melhor esforço)")
    antes = pago_ate()
    sim_post("/_status", {"tipo": "payment", "id": pid, "status": "approved"})
    st, r = avisar("payment", pid, conta=CTX["conta"], user_id=A)
    p.check(st == 200 and r.get("resultado") == "cobranca_paga" and pago_ate() == antes and mensalidades_pagas() == pagas + 1,
            f"a aprovação atrasada → cobranca_paga (paga é final), sem 2º período ({st} {r.get('resultado')})")


def local_reembolso_forjado() -> None:
    print("\n── reembolso_forjado (local, C1): o pagamento de OUTRO vendedor (ou de outra cobrança) na linha → 409 e nada vai ao MP")
    base(A)
    n0 = sim_n()
    alheio = f"physiq:{S}:conta:{CTX['conta']}:mensal:{uuid.uuid4()}"
    pb = sim_post("/_pagamento", {"collector_id": B_, "status": "approved", "visivel": True, "external_reference": alheio})
    pb2 = sim_post("/_pagamento", {"collector_id": B_, "status": "pending", "visivel": True, "external_reference": alheio})
    c1 = inserir_cobranca("paga", pb["id"], A)
    c2 = inserir_cobranca("aguardando_confirmacao", pb2["id"], A)
    st1, r1 = pedir(DONO, "prof_reembolsar", {"cobranca_id": c1})
    st2, r2 = pedir(DONO, "detalhe_mp", {"cobranca_id": c1})
    st3, r3 = pedir(DONO, "prof_cobranca_cancelar", {"cobranca_id": c2})
    erros = {r1.get("erro"), r2.get("erro"), r3.get("erro")}
    p.check((st1, st2, st3) == (409, 409, 409) and erros == {"cobranca_de_outro_pagamento"} and cobranca(c1).get("status") == "paga"
            and cobranca(c2).get("status") == "aguardando_confirmacao",
            f"o pagamento de OUTRO vendedor: prof_reembolsar, detalhe_mp e prof_cobranca_cancelar → 409 cobranca_de_outro_pagamento ({st1}/{st2}/{st3})")
    pa = sim_post("/_pagamento", {"collector_id": A, "status": "approved", "external_reference": f"physiq:{S}:aluno:{CTX['pac']}:avulsa:{uuid.uuid4()}"})
    c3 = inserir_cobranca("paga", pa["id"], A)
    st4, r4 = pedir(DONO, "prof_reembolsar", {"cobranca_id": c3})
    st5, r5 = pedir(DONO, "detalhe_mp", {"cobranca_id": c3})
    p.check((st4, st5) == (409, 409) and r4.get("erro") == r5.get("erro") == "cobranca_de_outro_pagamento",
            f"o pagamento do MESMO vendedor com a referência de outra cobrança → 409 igual (a regra pura da W1b) ({st4}/{st5})")
    peds = sim_pedidos(n0)
    p.check(not any(x["caminho"].split("?")[0].endswith("/refunds") for x in peds)
            and not any(x["metodo"] == "PUT" and x["caminho"].startswith("/v1/payments/") for x in peds),
            f"0 /refunds e 0 PUT no simulador ({len(peds)} pedido(s): {sorted({x['metodo'] + ' ' + x['caminho'].split('?')[0].rsplit('/', 1)[0] for x in peds})})")


def local_webhook() -> None:
    print("\n── webhook (local): o aviso por conta paga; collector de outro, aluno de outra conta, conta em erro e a x-signature")
    base(A)
    st, r = pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"]})
    c = (r.get("cobranca") or {}).get("id")
    pid = cobranca(c).get("mp_payment_id")
    sim_post("/_status", {"tipo": "payment", "id": pid, "status": "approved"})
    n_av = avisos("pagamento_confirmado")["aluno"]
    st, r = avisar("payment", pid, conta=CTX["conta"], user_id=A)
    p.check(st == 200 and r.get("resultado") == "cobranca_paga_paga" and cobranca(c).get("status") == "paga"
            and avisos("pagamento_confirmado")["aluno"] == n_av + 1, f"aviso por conta com o pagamento do simulador → paga ({st} {r.get('resultado')})")
    pb = sim_post("/_pagamento", {"collector_id": B_, "status": "approved", "visivel": True,
                                  "external_reference": f"physiq:{S}:aluno:{CTX['pac']}:mensalidade:{c}"})
    st, r = avisar("payment", pb["id"], conta=CTX["conta"], user_id=A)
    p.check(st == 200 and r.get("resultado") == "collector_diferente", f"collector de outro → ignorado ({st} {r.get('resultado')})")
    if CTX.get("outra"):
        pa = sim_post("/_pagamento", {"collector_id": A, "status": "approved",
                                      "external_reference": f"physiq:{S}:aluno:{CTX['outra']}:mensalidade:{uuid.uuid4()}"})
        st, r = avisar("payment", pa["id"], conta=CTX["conta"], user_id=A)
        p.check(st == 200 and r.get("resultado") == "referencia_de_outra_conta", f"referência de aluno de OUTRA conta → ignorado ({st} {r.get('resultado')})")
    else:
        p.check(False, "não achei uma matrícula de outra conta no staging para a referência de outra conta")
    # o mp_erro só com [a-z_] (o CHECK recebimento_integracoes_check): 'acesso_recusado', como o marcarErro grava
    sql(f"update {S}.recebimento_integracoes set status = 'erro', mp_erro = 'acesso_recusado' where conta_id = '{CTX['conta']}' and provedor = 'mercadopago'")
    try:
        st, r = avisar("payment", pid, conta=CTX["conta"], user_id=A)
    finally:
        sql(f"update {S}.recebimento_integracoes set status = 'ativa', mp_erro = null where conta_id = '{CTX['conta']}' and provedor = 'mercadopago'")
    p.check(st == 500 and r.get("resultado") == "conta_em_erro", f"a conta em erro → 500 (o MP manda de novo) ({st} {r.get('resultado')})")
    flag_assinatura(True)
    try:
        st, r = avisar("payment", pid, conta=CTX["conta"], user_id=A)
        st2, r2 = avisar("payment", pid, conta=CTX["conta"], user_id=A, segredo=segredos_da_rodada()["assinatura"])
    finally:
        flag_assinatura(False)
    p.check(st == 401 and r.get("resultado") == "assinatura" and st2 == 200 and r2.get("resultado") == "cobranca_paga",
            f"x-signature com a flag exigir: sem → 401, com o segredo local → passa ({st}/{st2} {r2.get('resultado')})")


def local_criado_e_atualizado() -> None:
    print("\n── criado_e_atualizado (local, I4): o created (pendente) e, 2 s depois, o updated (aprovado) do MESMO id → paga (sem cache)")
    base(A)
    st, r = pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"]})
    c = (r.get("cobranca") or {}).get("id")
    pid = cobranca(c).get("mp_payment_id")
    st1, r1 = avisar("payment", pid, conta=CTX["conta"], user_id=A, acao="payment.created")
    time.sleep(2)
    sim_post("/_status", {"tipo": "payment", "id": pid, "status": "approved"})
    st2, r2 = avisar("payment", pid, conta=CTX["conta"], user_id=A, acao="payment.updated")
    p.check(st1 == 200 and r1.get("resultado") == "cobranca_aguardando_confirmacao" and st2 == 200 and r2.get("resultado") == "cobranca_paga_paga"
            and cobranca(c).get("status") == "paga", f"created → pendente; updated → paga ({r1.get('resultado')} → {r2.get('resultado')})")


def local_webhook_401_alheio() -> None:
    print("\n── webhook_401_alheio (local, I2): o 401 do recurso de OUTRA conta não derruba a conexão nem renova")
    base(A)
    pb = sim_post("/_pagamento", {"collector_id": B_, "status": "approved"})
    sim_cenario(alheio_401=True)
    n0 = sim_n()
    try:
        st, r = avisar("payment", pb["id"], conta=CTX["conta"], user_id=A)
    finally:
        sim_cenario()
    peds = sim_pedidos(n0)
    i = linha_integracao() or {}
    vistos = {(x["metodo"], x["caminho"].split("?")[0], x["token_nome"], x["status"]) for x in peds}
    p.check(st == 200 and r.get("resultado") == "nao_achado" and i.get("status") == "ativa" and i.get("mp_erro") is None
            and not any(x["caminho"] == "/oauth/token" for x in peds) and ("GET", f"/v1/payments/{pb['id']}", CONTA_A, 401) in vistos
            and ("GET", "/users/me", CONTA_A, 200) in vistos,
            f"200 nao_achado, a integração segue ATIVA e 0 POST /oauth/token ({st} {r.get('resultado')} · {sorted(vistos)})")


def local_sem_conta_pelo_user_id() -> None:
    print("\n── sem_conta_pelo_user_id (local, I1 + MENOR 5): o aviso pela URL do painel acha a conta pelo user_id")
    base(A)
    st, r = pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"]})
    c = (r.get("cobranca") or {}).get("id")
    pid = cobranca(c).get("mp_payment_id")
    sim_post("/_status", {"tipo": "payment", "id": pid, "status": "approved"})
    st, r = avisar("payment", pid, user_id=A)
    p.check(st == 200 and r.get("resultado") == "cobranca_paga_paga" and cobranca(c).get("status") == "paga",
            f"SEM &conta= com o user_id do vendedor da integração → tratado pela conta → paga ({st} {r.get('resultado')})")
    st, r = avisar("payment", pid, user_id=SIM.ID_PHYSIQ)
    p.check(st == 200 and r.get("resultado") == "pagamento_nao_encontrado",
            f"com o user_id da conta do PHYSIQ → o caminho de hoje (o token do Physiq não acha o pagamento da conta) ({st} {r.get('resultado')})")
    sim_post("/_expirar", {"vendedor": A})
    sql(f"update {S}.recebimento_integracoes set mp_avisado_em = null where conta_id = '{CTX['conta']}' and provedor = 'mercadopago'")
    n_av = avisos("geral", "desconectou")["personal"]
    st, r = avisar("mp-connect", A, user_id=A)
    i = linha_integracao() or {}
    p.check(st == 200 and r.get("resultado") == "acesso_revogado" and i.get("status") == "erro" and i.get("mp_erro") == "acesso_revogado"
            and avisos("geral", "desconectou")["personal"] == n_av + 1,
            f"mp-connect sem conta com o token morto → erro (acesso_revogado) e 1 aviso ao dono ({st} {r.get('resultado')})")


def local_uso_401() -> None:
    print("\n── uso_401 (local): o 401 da hora do uso renova e passa; renovação recusada → erro; renovou há 5 min → não renova (I2)")
    base(A, origem="oauth")
    sim_post("/_expirar", {"vendedor": A})
    n0 = sim_n()
    st, r = pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"]})
    peds = sim_pedidos(n0)
    seq = [(x["metodo"], x["caminho"].split("?")[0], x["token"]) for x in peds]
    i = linha_integracao() or {}
    p.check(st == 200 and ("POST", "/v1/payments", "morto") in seq and ("GET", "/users/me", "morto") in seq
            and any(x["caminho"] == "/oauth/token" and x.get("grant_type") == "refresh_token" and x["status"] == 200 for x in peds)
            and ("POST", "/v1/payments", "vivo") in seq and i.get("status") == "ativa" and bool(i.get("mp_renovado_em")),
            f"401 → /users/me 401 → renova na hora → o Pix passa ({st} {r.get('erro')} · {seq})")
    esconder()
    sql(f"""update {S}.recebimento_integracoes set mp_renovado_em = null, mp_avisado_em = null where conta_id = '{CTX['conta']}'
              and provedor = 'mercadopago'""")
    sim_post("/_expirar", {"vendedor": A})
    n_av = avisos("geral")["personal"]
    sim_cenario(renovar_status=400)
    try:
        st, r = pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"]})
    finally:
        sim_cenario()
    i = linha_integracao() or {}
    sobra = mp_aguardando()
    p.check(st == 409 and r.get("erro") == "mp_conta_indisponivel" and i.get("status") == "erro" and avisos("geral")["personal"] == n_av + 1 and sobra == 0,
            f"401 + renovação recusada → erro, 1 aviso ao dono, 409 ao aluno (e a linha desfeita) ({st} {r.get('erro')} {i.get('mp_erro')})")
    integracao(A, origem="oauth", renovado="now() - interval '5 minutes'")
    esconder()
    sim_post("/_expirar", {"vendedor": A})
    n0 = sim_n()
    st, r = pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"]})
    peds = sim_pedidos(n0)
    i = linha_integracao() or {}
    p.check(st == 409 and r.get("erro") == "mp_conta_indisponivel" and not any(x["caminho"] == "/oauth/token" for x in peds) and i.get("status") == "erro",
            f"o mesmo 401 com mp_renovado_em há 5 min → NÃO renova (1× a cada 10 min) → erro ({st} {r.get('erro')})")


def local_renovar() -> None:
    print("\n── renovar (local): a renovação forçada gira o refresh; 2 juntas → 1 só no simulador (a trava)")
    base(A, origem="oauth", expira="10 days")
    chave = segredos_da_rodada()["chave"]
    i0 = linha_integracao() or {}
    ref0 = decifrar(i0["mp_refresh_token"], dado_associado(CTX["conta"], "refresh"), chave)
    st, r = renovar_local(forcar=True)
    i = linha_integracao() or {}
    ref1 = decifrar(i["mp_refresh_token"], dado_associado(CTX["conta"], "refresh"), chave)
    acc1 = decifrar(i["mp_access_token"], dado_associado(CTX["conta"], "access"), chave)
    expira = dt.datetime.fromisoformat(str(i.get("mp_expira_em")).replace(" ", "T")) if i.get("mp_expira_em") else None
    dias = (expira - dt.datetime.now(dt.timezone.utc)).days if expira else -1
    p.check(st == 200 and r.get("renovadas") == 1 and 178 <= dias <= 181 and bool(i.get("mp_renovado_em")) and ref1 != ref0
            and sim_info(ref0).get("vivo") is False and sim_info(ref1).get("vivo") is True and sim_info(acc1).get("vivo") is True,
            f"renovada: expira +180 d, o par novo vivo e o refresh velho morto no simulador ({st} {r} · {dias} dias)")
    sql(f"""update {S}.recebimento_integracoes set mp_expira_em = now() + interval '10 days', mp_renovado_em = null where conta_id = '{CTX['conta']}'
              and provedor = 'mercadopago'""")
    n0 = sim_n()
    with ThreadPoolExecutor(2) as ex:
        rs = list(ex.map(lambda _: renovar_local(forcar=True), range(2)))
    trocas = [x for x in sim_pedidos(n0) if x["caminho"] == "/oauth/token"]
    soma = {k: sum((x[1] or {}).get(k, 0) for x in rs) for k in ("renovadas", "ocupadas", "outras", "erros")}
    i = linha_integracao() or {}
    p.check(all(x[0] == 200 for x in rs) and len(trocas) == 1 and soma["renovadas"] == 1 and soma["ocupadas"] + soma["outras"] == 1
            and soma["erros"] == 0 and i.get("status") == "ativa" and i.get("mp_erro") is None,
            f"2 renovações juntas → 1 só POST /oauth/token (a trava), nenhuma 'erro' ({soma} · {len(trocas)})")


def local_recusada() -> None:
    print("\n── recusada (local): a renovação recusada com o acesso valendo avisa; vencida vira erro; o 2xx fora do formato guarda o refresh")
    base(A, origem="oauth", expira="10 days")
    n_av = avisos("geral", "não renovou sozinho")["personal"]
    sim_cenario(renovar_status=400)
    try:
        st, r = renovar_local(forcar=True)
        i = linha_integracao() or {}
        p.check(st == 200 and r.get("recusadas") == 1 and i.get("status") == "ativa" and i.get("mp_erro") == "renovacao_recusada"
                and avisos("geral", "não renovou sozinho")["personal"] == n_av + 1,
                f"recusada com o acesso valendo → ativa + renovacao_recusada + 1 aviso ao dono ({st} {r})")
        sql(f"""update {S}.recebimento_integracoes set mp_expira_em = now() - interval '1 hour', mp_avisado_em = null, mp_renovando_ate = null
                 where conta_id = '{CTX['conta']}' and provedor = 'mercadopago'""")
        n_av = avisos("geral", "desconectou")["personal"]
        st, r = renovar_local(forcar=True)
        i = linha_integracao() or {}
        p.check(st == 200 and r.get("recusadas") == 1 and i.get("status") == "erro" and i.get("mp_erro") == "renovacao_recusada"
                and avisos("geral", "desconectou")["personal"] == n_av + 1, f"vencida → erro + aviso ({st} {r} {i.get('status')})")
    finally:
        sim_cenario()
    integracao(A, origem="oauth", expira="10 days")
    i0 = linha_integracao() or {}
    sim_cenario(renovar_formato=True)
    try:
        st, r = renovar_local(forcar=True)
    finally:
        sim_cenario()
    i = linha_integracao() or {}
    try:
        novo = decifrar(i.get("mp_refresh_token") or "", dado_associado(CTX["conta"], "refresh"), segredos_da_rodada()["chave"])
    except Exception:  # noqa: BLE001
        novo = ""
    p.check(st == 200 and r.get("recusadas") == 1 and i.get("mp_erro") == "renovacao_formato" and i.get("status") == "ativa"
            and i.get("mp_refresh_token") != i0.get("mp_refresh_token") and bool(novo) and sim_info(novo).get("vivo") is True
            and i.get("mp_access_token") == i0.get("mp_access_token"),
            f"2xx sem access_token → o refresh novo gravado + mp_erro renovacao_formato (MENOR 13) ({st} {r} {i.get('mp_erro')})")


def local_diario() -> None:
    print("\n── diario (local, MENOR 27): o acesso tirado no MP é descoberto pela conferência diária, sem esperar um aluno pagar")
    base(A, origem="oauth", expira="90 days", conferido="null")
    sim_post("/_expirar", {"vendedor": A, "refresh": True})
    n_av = avisos("geral")["personal"]
    st, r = renovar_local(forcar=False)
    i = linha_integracao() or {}
    p.check(st == 200 and r.get("sem_acesso") == 1 and i.get("status") == "erro" and avisos("geral")["personal"] == n_av + 1,
            f"/users/me 401 → renovação recusada → erro + 1 aviso ao dono ({st} {r} {i.get('mp_erro')})")


def local_rede_automatica() -> None:
    print("\n── rede_automatica (local, I1): a cobrança do mês sem aviso entra pela busca (aluno_status e o diário), sem dobrar")
    base(A, origem="oauth")
    st, r = janela("assinar", CONTA_A, lambda: pedir(ALUNO, "aluno_mp_assinar", {"paciente_id": CTX["pac"], "card_token": "sim-card-APRO"}))
    a = assinatura_viva()
    pre = a.get("mp_preapproval_id")
    p.check(st == 200 and a.get("status") == "authorized" and a.get("mp_collector_id") == A and bool(pre),
            f"a automática nasceu na conta (authorized, o collector) ({st} {r.get('erro')})")
    if not pre:
        return
    p1 = sim_post("/_cobranca_mensal", {"preapproval_id": pre})["pagamento"]["id"]
    st, r = janela("conferirAssinatura", CONTA_A, lambda: pedir(ALUNO, "aluno_status"))
    c1 = cobranca_do_pagamento(p1)
    p.check(st == 200 and c1.get("status") == "paga" and c1.get("mp_collector_id") == A,
            f"aluno_status (conferirAssinatura) → a cobrança do mês entra paga com o mp_collector_id, sem aviso ({st} {c1})")
    p2 = sim_post("/_cobranca_mensal", {"preapproval_id": pre})["pagamento"]["id"]
    sql(f"update {S}.recebimento_integracoes set mp_conferido_em = null where conta_id = '{CTX['conta']}' and provedor = 'mercadopago'")
    st, r = renovar_local(forcar=False)
    c2 = cobranca_do_pagamento(p2)
    p.check(st == 200 and r.get("conferidas", 0) >= 1 and r.get("cobrancas_da_rede", 0) >= 1 and c2.get("status") == "paga" and c2.get("mp_collector_id") == A,
            f"o diário (mp_conferido_em nulo) → a 2ª cobrança também entra ({st} {r})")
    sql(f"update {S}.recebimento_integracoes set mp_conferido_em = null where conta_id = '{CTX['conta']}' and provedor = 'mercadopago'")
    st, r = renovar_local(forcar=False)
    n = um(f"select count(*)::int as n from {S}.cobrancas where mp_payment_id in ({lit(str(p1))}, {lit(str(p2))})")["n"]
    p.check(st == 200 and r.get("cobrancas_da_rede") == 0 and n == 2, f"rodar de novo → nada dobra (mp_payment_id único) ({r} · {n})")
    cancelar_vivas()


def local_fila() -> None:
    print("\n── fila (local): a troca do valor da automática da conta vai ao MP com o token DA CONTA")
    base(A)
    outros = um(f"select count(*)::int as n from {S}.automaticas_fila where feito_em is null and paciente_id <> '{CTX['pac']}'")["n"]
    if outros:
        p.check(False, f"a fila do staging tem {outros} pendência(s) de outros alunos — não rodei (a rodada local mexeria nelas)")
        return
    pre = sim_post("/_preapproval", {"collector_id": A, "status": "authorized", "valor": 10})
    inserir_assinatura(pre["id"], "authorized", A)
    sql(f"update {S}.pacientes set mensalidade_valor = 12 where id = '{CTX['pac']}'")
    try:
        sql(f"select {S}.automaticas_enfileirar(array['{CTX['pac']}']::uuid[], 'aluno')")
        n0 = sim_n()
        st, r = janela("fila", CONTA_A, fila_local)
        peds = sim_pedidos(n0)
        put = [x for x in peds if x["metodo"] == "PUT" and pre["id"] in x["caminho"]]
        item = um(f"""select feito_em is not null as feito, resultado, erro from {S}.automaticas_fila where paciente_id = '{CTX['pac']}'
                       order by id desc limit 1""") or {}
        valor = ((put[-1].get("corpo") or {}).get("auto_recurring") or {}).get("transaction_amount") if put else None
        p.check(st == 200 and bool(put) and all(x["token_nome"] == CONTA_A for x in put) and valor == 12 and item.get("feito") and item.get("resultado") == "atualizada",
                f"o PUT /preapproval foi ao simulador com o token da conta e o valor novo ({st} {[x['token_nome'] for x in put]} {valor} {item})")
    finally:
        sql(f"update {S}.pacientes set mensalidade_valor = 10 where id = '{CTX['pac']}'")
        cancelar_vivas()


def local_cancelar_automatica() -> None:
    print("\n── cancelar_automatica (local, C2): os 3 jeitos de desligar a automática da conta vão ao MP com o token dela")
    base(A)
    n_inicio = sim_n()

    def nova() -> dict:
        janela("assinar", CONTA_A, lambda: pedir(ALUNO, "aluno_mp_assinar", {"paciente_id": CTX["pac"], "card_token": "sim-card-APRO"}))
        return assinatura_viva()

    a = nova()
    st, r = janela("cancelar", CONTA_A, lambda: pedir(ALUNO, "aluno_mp_cancelar", {"paciente_id": CTX["pac"]}))
    p.check(st == 200 and assinatura(a.get("id")).get("status") == "cancelled" and sim_recurso("preapproval", a.get("mp_preapproval_id")).get("status") == "cancelled",
            f"aluno_mp_cancelar → cancelada aqui e no simulador ({st} {r.get('erro')})")
    a = nova()
    st, r = janela("cancelar", CONTA_A, lambda: pedir(DONO, "prof_cancelar_assinatura", {"aluno": CTX["pac"]}))
    p.check(st == 200 and assinatura(a.get("id")).get("status") == "cancelled" and sim_recurso("preapproval", a.get("mp_preapproval_id")).get("status") == "cancelled",
            f"prof_cancelar_assinatura → cancelada ({st} {r.get('erro')})")
    a = nova()
    # max_parcelas_cartao fica NULO: o CHECK planos_aluno_max_parcelas_check (W-P) só aceita o número (2–12) junto do 'cartao_parcelado'
    plano = um(f"""insert into {S}.planos_aluno (conta_id, nome, valor, meses, modalidades)
                   values ('{CTX['conta']}', {lit(f'{PREFIXO} período {secrets.token_hex(3)}')}, 60, 6, array['avista', 'mensal']) returning id::text as id""")["id"]
    try:
        st, r = pedir(DONO, "prof_definir", {"aluno": CTX["pac"], "plano_aluno_id": plano, "plano_modalidade": "avista"})
        p.check(st == 409 and r.get("erro") == "automatica_ativa", f"o período todo com a automática viva pede o OK ({st} {r.get('erro')})")
        n_av = avisos("geral", "plano mudou")["aluno"]
        st, r = janela("cancelar", CONTA_A, lambda: pedir(DONO, "prof_definir", {"aluno": CTX["pac"], "plano_aluno_id": plano, "plano_modalidade": "avista",
                                                                                "cancelar_automatica": True}))
        p.check(st == 200 and assinatura(a.get("id")).get("status") == "cancelled"
                and sim_recurso("preapproval", a.get("mp_preapproval_id")).get("status") == "cancelled" and avisos("geral", "plano mudou")["aluno"] == n_av + 1,
                f"prof_definir para o período todo com o OK → cancelada e o aluno avisado ({st} {r.get('erro')})")
    finally:
        sql(f"""update {S}.pacientes set plano_aluno_id = null, plano_modalidade = null, plano_valor_negociado = null, mensalidade_valor = 10,
                       mensalidade_desde = now() - interval '1 day' where id = '{CTX['pac']}'""")
        sql(f"select {S}.mensalidade_recalcular('{CTX['pac']}')")
    puts = [x for x in sim_pedidos(n_inicio) if x["metodo"] == "PUT" and x["caminho"].startswith("/preapproval/")]
    p.check(len(puts) >= 3 and all(x["token_nome"] == CONTA_A for x in puts),
            f"todo PUT /preapproval com o token 'conta_<vendedor>' (nunca o physiq_teste) ({sorted({str(x['token_nome']) for x in puts})})")


def local_assinatura_antiga_viva() -> None:
    print("\n── assinatura_antiga_viva (local, I11): a automática antiga que não cancela segura a nova (nenhum POST /preapproval)")
    base(A)
    pre = sim_post("/_preapproval", {"collector_id": A, "status": "pending", "valor": 10})
    inserir_assinatura(pre["id"], "pending", A)
    sim_cenario(cancelar_preapproval_status=400)
    n0 = sim_n()
    try:
        st, r = pedir(ALUNO, "aluno_mp_assinar", {"paciente_id": CTX["pac"], "card_token": "sim-card-APRO"})
    finally:
        sim_cenario()
    peds = sim_pedidos(n0)
    put = [x for x in peds if x["metodo"] == "PUT" and pre["id"] in x["caminho"]]
    p.check(st == 409 and r.get("erro") == "assinatura_antiga_viva" and not any(x["metodo"] == "POST" and x["caminho"] == "/preapproval" for x in peds)
            and bool(put) and all(x["token_nome"] == CONTA_A for x in put),
            f"o MP recusa cancelar a antiga → 409 assinatura_antiga_viva e NENHUM POST /preapproval ({st} {r.get('erro')})")
    cancelar_vivas()
    alheia = "W2E2EPRE" + secrets.token_hex(8)
    inserir_assinatura(alheia, "pending", C_)
    n0 = sim_n()
    st, r = pedir(ALUNO, "aluno_mp_assinar", {"paciente_id": CTX["pac"], "card_token": "sim-card-APRO"})
    peds = sim_pedidos(n0)
    p.check(st == 409 and r.get("erro") == "assinatura_antiga_viva" and not any(x["metodo"] == "POST" and x["caminho"] == "/preapproval" for x in peds)
            and not any(alheia in x["caminho"] for x in peds),
            f"a antiga de OUTRA conta do MP (o Physiq não alcança) → 409 igual e nenhuma ida ao MP por ela ({st} {r.get('erro')})")
    cancelar_vivas()


def local_salvar_recusado() -> None:
    print("\n── salvar_recusado (local, MENOR 11): o MP recusa cancelar → 502 e o modo NÃO muda; com o MP de volta, troca e avisa")
    base(A)
    janela("assinar", CONTA_A, lambda: pedir(ALUNO, "aluno_mp_assinar", {"paciente_id": CTX["pac"], "card_token": "sim-card-APRO"}))
    a = assinatura_viva()
    n_av = avisos("geral", "forma de receber")["aluno"]
    sim_cenario(cancelar_preapproval_status=500)
    try:
        st, r = pedir(DONO, "prof_recebimento_salvar", {"conta_id": CTX["conta"], "modo": "pix_manual", "cancelar_automaticas": True})
    finally:
        sim_cenario()
    p.check(st == 502 and r.get("erro") == "automaticas_nao_canceladas" and r.get("falhas") == 1 and modo() == "mercadopago_conta"
            and assinatura(a.get("id")).get("status") == "authorized" and avisos("geral", "forma de receber")["aluno"] == n_av,
            f"502 automaticas_nao_canceladas, o modo e a automática ficam, o aluno não é avisado ({st} {r.get('erro')} {modo()})")
    st, r = pedir(DONO, "prof_recebimento_salvar", {"conta_id": CTX["conta"], "modo": "pix_manual"})
    p.check(st == 409 and r.get("erro") == "automaticas_ativas" and r.get("alunos") == 1, f"sem o OK → 409 automaticas_ativas ({st} {r.get('erro')})")
    st, r = janela("cancelar", CONTA_A, lambda: pedir(DONO, "prof_recebimento_salvar", {"conta_id": CTX["conta"], "modo": "pix_manual",
                                                                                         "cancelar_automaticas": True}))
    p.check(st == 200 and modo() == "pix_manual" and assinatura(a.get("id")).get("status") == "cancelled" and r.get("automaticas_canceladas") == 1
            and avisos("geral", "forma de receber")["aluno"] == n_av + 1 and (linha_integracao() or {}).get("status") == "desconectada",
            f"com o MP de volta e o OK → troca, cancela pela conta, avisa o aluno e a integração fica desconectada ({st} {r.get('erro')})")


def local_desligar() -> None:
    print("\n── desligar (local): desconectar no modo (com o OK, a automática da conta) e fora dele (a do MP do Physiq fica — MENOR 10)")
    base(A)
    janela("assinar", CONTA_A, lambda: pedir(ALUNO, "aluno_mp_assinar", {"paciente_id": CTX["pac"], "card_token": "sim-card-APRO"}))
    a = assinatura_viva()
    st, r = pedir(DONO, "prof_mp_desconectar", {"conta_id": CTX["conta"]})
    p.check(st == 409 and r.get("erro") == "automaticas_ativas" and r.get("alunos") == 1, f"no modo, sem o OK → 409 ({st} {r.get('erro')})")
    esperado = "pix_manual" if chave_ativa() else "nenhum"
    n_av = avisos("geral", "forma de receber")["aluno"]
    st, r = janela("cancelar", CONTA_A, lambda: pedir(DONO, "prof_mp_desconectar", {"conta_id": CTX["conta"], "cancelar_automaticas": True}))
    i = linha_integracao() or {}
    p.check(st == 200 and r.get("automaticas_canceladas") == 1 and modo() == esperado and i.get("status") == "desconectada" and bool(i.get("desconectada_em"))
            and bool(i.get("mp_access_token")) and assinatura(a.get("id")).get("status") == "cancelled"
            and sim_recurso("preapproval", a.get("mp_preapproval_id")).get("status") == "cancelled" and avisos("geral", "forma de receber")["aluno"] == n_av + 1,
            f"com o OK → a automática cancelada pela conta, modo {esperado}, desconectada com os tokens guardados (7 dias), aluno avisado ({st} {r.get('erro')})")
    base(A, ligar=False)
    modo_conta("mercadopago")
    pre = sim_post("/_preapproval", {"collector_id": SIM.ID_PHYSIQ, "status": "authorized"})
    aid = inserir_assinatura(pre["id"], "authorized", None)
    n0 = sim_n()
    try:
        st, r = pedir(DONO, "prof_mp_desconectar", {"conta_id": CTX["conta"]})
        peds = sim_pedidos(n0)
        i = linha_integracao() or {}
        p.check(st == 200 and r.get("automaticas_canceladas") == 0 and i.get("status") == "desconectada" and modo() == "mercadopago"
                and assinatura(aid).get("status") == "authorized" and not any(x["metodo"] == "PUT" for x in peds),
                f"fora do modo com a automática do MP do Physiq viva → não pede o OK nem a cancela; só desconecta ({st} {r.get('erro')})")
    finally:
        cancelar_vivas()
        modo_conta("pix_manual")


def assinar_na_conta() -> dict:
    """A automática do aluno2 nasce na conta (o cartão APRO do simulador: authorized, o collector) — a janela "assinar" do caso tokens."""
    janela("assinar", CONTA_A, lambda: pedir(ALUNO, "aluno_mp_assinar", {"paciente_id": CTX["pac"], "card_token": "sim-card-APRO"}))
    return assinatura_viva()


def local_master() -> None:
    print("\n── master (local, MENOR 7 + MENOR 17 + decisão 11): o 'Desligar' do master pede o OK; com ele cancela pelo token DA CONTA; sem acesso "
          "→ 409 e o forçar; o acesso revogado vira 'erro' na hora")
    # 1) a automática viva DA CONTA: sem o OK → 409 e nada muda; com o OK → cancelada no simulador pelo token dela, a troca e o aviso ao aluno
    base(A)
    a = assinar_na_conta()
    st, r = master_local({"modo": "pix_manual"})
    p.check(st == 409 and r.get("erro") == "automaticas_ativas" and r.get("alunos") == 1 and modo() == "mercadopago_conta"
            and assinatura(a.get("id")).get("status") == "authorized",
            f"o master troca com a automática da conta viva → 409 automaticas_ativas e nada muda ({st} {r.get('erro')} {modo()})")
    desligada = "forma de receber: a cobrança automática"          # o texto da W1 (TEXTO_AUTOMATICA_DESLIGADA da master-contas/recebimento.ts)
    n_av = avisos("geral", desligada)["aluno"]
    st, r = janela("cancelar", CONTA_A, lambda: master_local({"modo": "pix_manual", "cancelar_automaticas": True}))
    i = linha_integracao() or {}
    p.check(st == 200 and (r.get("automaticas") or {}) == {"canceladas": 1, "forcadas": 0} and modo() == "pix_manual"
            and assinatura(a.get("id")).get("status") == "cancelled"
            and sim_recurso("preapproval", a.get("mp_preapproval_id")).get("status") == "cancelled" and i.get("status") == "desconectada"
            and avisos("geral", desligada)["aluno"] == n_av + 1,
            f"com o OK → cancelada no MP pelo token da conta, o modo trocado, a integração desconectada e o aluno avisado ({st} {r.get('erro')} "
            f"{r.get('automaticas')})")
    # 2) a conexão em erro (sem acesso): 409 automaticas_sem_acesso e nada muda; forçar → marcada no Physiq (o master, o motivo), 1 evento, os
    #    avisos (o dono: desligar no app do MP; o aluno: o texto do MENOR 17) e nenhuma ida ao MP (a automática segue viva lá)
    base(A)
    a = assinar_na_conta()
    aid = a.get("id")
    sql(f"update {S}.recebimento_integracoes set status = 'erro', mp_erro = 'acesso_recusado' where conta_id = '{CTX['conta']}' and provedor = 'mercadopago'")
    n0 = sim_n()
    st, r = master_local({"modo": "pix_manual", "cancelar_automaticas": True})
    p.check(st == 409 and r.get("erro") == "automaticas_sem_acesso" and r.get("alunos") == 1 and r.get("canceladas") == 0
            and modo() == "mercadopago_conta" and assinatura(aid).get("status") == "authorized",
            f"a conexão em erro → 409 automaticas_sem_acesso e nada muda ({st} {r.get('erro')} {r.get('alunos')})")

    def eventos_forcados() -> int:
        return um(f"""select count(*)::int as n from {S}.conta_eventos where conta_id = '{CTX['conta']}' and em >= {lit(CTX['t0'])}::timestamptz
                        and depois ->> 'w2' = 'forcou_sem_acesso'""")["n"]

    dono_txt, aluno_txt = "Desligue no app do Mercado Pago", "continuar sendo cobrado"   # textoDoDonoSemAcesso e o TEXTO_AUTOMATICA_SEM_ACESSO
    n_dono, n_aluno, ev0 = avisos("geral", dono_txt)["personal"], avisos("geral", aluno_txt)["aluno"], eventos_forcados()
    st, r = master_local({"modo": "pix_manual", "cancelar_automaticas": True, "forcar_sem_acesso": True})
    marcada = um(f"""select status, payload ->> 'cancelada_por' as por, payload ->> 'motivo_cancelamento' as motivo from {S}.aluno_assinaturas
                      where id = '{aid}'""") or {}
    peds = sim_pedidos(n0)
    p.check(st == 200 and (r.get("automaticas") or {}) == {"canceladas": 0, "forcadas": 1} and modo() == "pix_manual"
            and marcada.get("status") == "cancelled" and marcada.get("por") == CTX["estado"]["master_uid"]
            and marcada.get("motivo") == "sem_acesso_ao_mp_do_personal" and eventos_forcados() == ev0 + 1
            and avisos("geral", dono_txt)["personal"] == n_dono + 1 and avisos("geral", aluno_txt)["aluno"] == n_aluno + 1
            and not any(x["metodo"] == "PUT" for x in peds) and sim_recurso("preapproval", a.get("mp_preapproval_id")).get("status") == "authorized",
            f"forçar → marcada no Physiq (o master, o motivo), 1 evento, o dono e o aluno avisados e nada no MP ({st} {r.get('erro')} "
            f"{r.get('automaticas')} · {marcada.get('motivo')})")
    # 3) revogado (decisão 11): /users/me 401 + a renovação recusada → a conexão vira 'erro' NA HORA, antes de cancelar → 409 sem acesso, nenhum
    #    PUT; com o forçar → 200
    base(A, origem="oauth")
    assinar_na_conta()
    sim_post("/_expirar", {"vendedor": A, "refresh": True})
    n0 = sim_n()
    st, r = master_local({"modo": "pix_manual", "cancelar_automaticas": True})
    peds = sim_pedidos(n0)
    i = linha_integracao() or {}
    p.check(st == 409 and r.get("erro") == "automaticas_sem_acesso" and i.get("status") == "erro" and i.get("mp_erro") == "acesso_recusado"
            and any(x["caminho"] == "/users/me" and x["status"] == 401 and x["token_nome"] == CONTA_A for x in peds)
            and any(x["caminho"] == "/oauth/token" and x.get("grant_type") == "refresh_token" and x["status"] == 400 for x in peds)
            and not any(x["metodo"] == "PUT" for x in peds),
            f"o acesso revogado no MP → a conexão vira erro na hora (acesso_recusado) → 409 sem acesso, nenhum PUT ({st} {r.get('erro')} "
            f"{i.get('mp_erro')})")
    st, r = master_local({"modo": "pix_manual", "cancelar_automaticas": True, "forcar_sem_acesso": True})
    p.check(st == 200 and (r.get("automaticas") or {}).get("forcadas") == 1 and modo() == "pix_manual",
            f"o revogado com o forçar → 200 e a troca ({st} {r.get('erro')} {r.get('automaticas')})")


def local_pix_de_outra_conta() -> None:
    print("\n── pix_de_outra_conta (local, T9 a): o Pix aberto de OUTRA conta do MP não é reaproveitado — fecha com o token DELE e nasce outro")
    base(A, ligar=False)
    modo_conta("mercadopago")                      # o MP do Physiq, com a conexão da conta ativa (o "conectado sem trocar")
    st, r = pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"]})
    c0 = (r.get("cobranca") or {}).get("id")
    p0 = cobranca(c0).get("mp_payment_id")
    p.check(st == 200 and bool(p0) and cobranca(c0).get("mp_collector_id") is None, f"o Pix no MP do Physiq (a linha sem collector) ({st} {r.get('erro')})")
    modo_conta("mercadopago_conta")
    n0 = sim_n()
    st, r = pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"]})
    c1 = (r.get("cobranca") or {}).get("id")
    l1 = cobranca(c1)
    peds = [(x["metodo"], x["caminho"].split("?")[0], x["token_nome"]) for x in sim_pedidos(n0)]
    p.check(st == 200 and r.get("reutilizada") is False and bool(c1) and c1 != c0 and l1.get("mp_collector_id") == A
            and cobranca(c0).get("status") == "cancelada" and bool(p0) and sim_recurso("payment", p0).get("status") == "cancelled"
            and ("PUT", f"/v1/payments/{p0}", PHYSIQ) in peds and ("POST", "/v1/payments", CONTA_A) in peds
            and not any(t == CONTA_A and cam == f"/v1/payments/{p0}" for _, cam, t in peds),
            f"no MP da conta: o Pix do Physiq fechado com o physiq_teste e o novo nasce na conta A ({st} {r.get('erro')} · {peds})")
    p1 = l1.get("mp_payment_id")
    modo_conta("mercadopago")
    # sair do MP da conta marcou a conexão desconectada (o gatilho contas_saiu_do_mp_conta); o "conectado sem trocar" (reconectou com o modo
    # ainda no MP do Physiq) a tem ATIVA — é o caso em que o Physiq alcança a conta A para fechar o Pix dela
    sql(f"""update {S}.recebimento_integracoes set status = 'ativa', desconectada_em = null where conta_id = '{CTX['conta']}'
              and provedor = 'mercadopago'""")
    n0 = sim_n()
    st, r = pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"]})
    c2 = (r.get("cobranca") or {}).get("id")
    peds = [(x["metodo"], x["caminho"].split("?")[0], x["token_nome"]) for x in sim_pedidos(n0)]
    p.check(st == 200 and bool(c2) and c2 not in (c0, c1) and cobranca(c2).get("mp_collector_id") is None and cobranca(c1).get("status") == "cancelada"
            and bool(p1) and sim_recurso("payment", p1).get("status") == "cancelled" and ("PUT", f"/v1/payments/{p1}", CONTA_A) in peds
            and ("POST", "/v1/payments", PHYSIQ) in peds and not any(t == PHYSIQ and cam == f"/v1/payments/{p1}" for _, cam, t in peds),
            f"o contrário: o Pix da conta A fechado com o token DELA e o novo no MP do Physiq ({st} {r.get('erro')} · {peds})")
    esconder()
    modo_conta("pix_manual")


def local_pix_avulsa_de_outra_conta() -> None:
    print("\n── pix_avulsa_de_outra_conta (local, revisão I-3): o Pix aberto da PRÓPRIA avulsa noutra conta do MP é fechado NO MP (com o token "
          "DELE) ANTES do pagamento novo — no Pix e no cartão")
    base(A, ligar=False)
    for metodo in ("pix", "cartao"):
        esconder()
        modo_conta("mercadopago")                  # o MP do Physiq, com a conexão da conta ativa (o "conectado sem trocar")
        st, r = pedir(DONO, "prof_cobranca_criar", {"aluno": CTX["pac"], "descricao": f"{PREFIXO} avulsa I-3 {metodo}", "valor": 5,
                                                    "vencimento": B.hoje()})
        av = (r.get("cobranca") or {}).get("id")
        st1, r1 = pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"], "cobranca_id": av})
        p1 = cobranca(av).get("mp_payment_id")
        p.check(st == 200 and st1 == 200 and bool(p1) and cobranca(av).get("mp_collector_id") is None,
                f"{metodo}: a avulsa com o Pix P1 no MP do Physiq (a linha sem collector) ({st}/{st1} {r.get('erro') or r1.get('erro')})")
        modo_conta("mercadopago_conta")
        n0 = sim_n()
        if metodo == "pix":
            st2, r2 = pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"], "cobranca_id": av})
        else:
            st2, r2 = pedir(ALUNO, "aluno_mp_cartao", {"paciente_id": CTX["pac"], "cobranca_id": av, "card_token": "sim-card-APRO",
                                                     "payment_method_id": "master", "installments": 1})
        linha = cobranca(av)
        peds = sim_pedidos(n0)
        put = pedido_em(peds, "PUT", f"/v1/payments/{p1}", PHYSIQ, {"status": "cancelled"})
        post = pedido_em(peds, "POST", "/v1/payments", CONTA_A)
        situacao = "paga" if metodo == "cartao" else "aguardando_confirmacao"
        p.check(st2 == 200 and put is not None and post is not None and put < post and bool(p1)
                and sim_recurso("payment", p1).get("status") == "cancelled" and pedido_em(peds, "PUT", f"/v1/payments/{p1}", CONTA_A) is None
                and linha.get("mp_collector_id") == A and bool(linha.get("mp_payment_id")) and linha.get("mp_payment_id") != p1
                and linha.get("status") == situacao,
                f"{metodo}: o P1 fechado NO MP com o physiq_teste ANTES do POST com o token da conta A; a avulsa no pagamento novo "
                f"({st2} {r2.get('erro') or r2.get('status')} · PUT n{put} POST n{post} · "
                f"{[(x['metodo'], x['caminho'].split('?')[0], x['token_nome']) for x in peds]})")
        modo_conta("mercadopago")
        # sair do MP da conta marcou a conexão desconectada (o gatilho contas_saiu_do_mp_conta): a volta seguinte a quer ativa
        sql(f"""update {S}.recebimento_integracoes set status = 'ativa', desconectada_em = null where conta_id = '{CTX['conta']}'
                  and provedor = 'mercadopago'""")
    esconder()
    modo_conta("pix_manual")


def local_pix_vivo_sem_escrita() -> None:
    print("\n── pix_vivo_sem_escrita (local, revisão I-3): o Pix vivo da avulsa numa conta que o Physiq não alcança para escrita (a desconectada "
          "— decisão 10: só leitura) volta no Pix em vez de um 2º, recusa o cartão e, pago, dá baixa pela leitura dos 7 dias")
    base(A)                                        # o modo no MP da conta e a conexão ativa
    st, r = pedir(DONO, "prof_cobranca_criar", {"aluno": CTX["pac"], "descricao": f"{PREFIXO} avulsa I-3 sem escrita", "valor": 6,
                                                "vencimento": B.hoje()})
    av = (r.get("cobranca") or {}).get("id")
    st1, r1 = pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"], "cobranca_id": av})
    p1 = cobranca(av).get("mp_payment_id")
    p.check(st == 200 and st1 == 200 and bool(p1) and cobranca(av).get("mp_collector_id") == A,
            f"a avulsa com o Pix P1 na conta A ({st}/{st1} {r.get('erro') or r1.get('erro')})")
    modo_conta("mercadopago")                      # o MP do Physiq: o gatilho marca a conexão desconectada (os 7 dias de leitura)
    desligada = (linha_integracao() or {}).get("status") == "desconectada"
    n0 = sim_n()
    st2, r2 = pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"], "cobranca_id": av})
    st3, r3 = pedir(ALUNO, "aluno_mp_cartao", {"paciente_id": CTX["pac"], "cobranca_id": av, "card_token": "sim-card-APRO",
                                             "payment_method_id": "master", "installments": 1})
    peds = sim_pedidos(n0)
    mutou = [(x["metodo"], x["caminho"].split("?")[0], x["token_nome"]) for x in peds if x["metodo"] != "GET"]
    linha = cobranca(av)
    p.check(desligada and st2 == 200 and r2.get("reutilizada") is True and (r2.get("cobranca") or {}).get("id") == av
            and linha.get("mp_payment_id") == p1 and linha.get("mp_collector_id") == A and linha.get("status") == "aguardando_confirmacao"
            and st3 == 409 and r3.get("erro") == "mp_conta_indisponivel" and not mutou and bool(p1)
            and sim_recurso("payment", p1).get("status") == "pending",
            f"a conexão desconectada: o Pix devolve o MESMO P1 e o cartão dá 409 — nenhum PUT nem POST no simulador "
            f"({st2} {r2.get('erro')} · {st3} {r3.get('erro')} · {mutou})")
    if p1:
        sim_post("/_status", {"tipo": "payment", "id": p1, "status": "approved"})
    st4, r4 = avisar("payment", p1, conta=CTX["conta"], user_id=A)
    p.check(st4 == 200 and r4.get("resultado") == "cobranca_paga_paga" and cobranca(av).get("status") == "paga",
            f"o P1 pago DEPOIS + o aviso &conta= → a avulsa paga pela leitura dos 7 dias ({st4} {r4.get('resultado')})")
    esconder()
    modo_conta("pix_manual")


def local_post_sem_decisao() -> None:
    print("\n── post_sem_decisao (local, T9 b): o 401 no POST do Pix com o /users/me fora (500) → 502 mp_error, a linha desfeita, nada renovado nem marcado")
    base(A)
    sim_post("/_expirar", {"vendedor": A})
    sim_cenario(users_me_status=500)
    n0 = sim_n()
    try:
        st, r = janela("pix", CONTA_A, lambda: pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"]}))
    finally:
        sim_cenario()
    peds = sim_pedidos(n0)
    i = linha_integracao() or {}
    sobra = mp_aguardando()
    p.check(st == 502 and r.get("erro") == "mp_error" and r.get("status_mp") == 500 and sobra == 0 and i.get("status") == "ativa"
            and i.get("mp_erro") is None and any(x["caminho"] == "/users/me" and x["status"] == 500 for x in peds)
            and not any(x["caminho"] == "/oauth/token" for x in peds),
            f"502 mp_error (status_mp 500), a linha desfeita, sem renovar e a conexão ativa ({st} {r.get('erro')} {r.get('status_mp')} · sobra {sobra})")


def local_pix_sem_chave() -> None:
    print("\n── pix_sem_chave (local, T9 c, decisão 16): a conta do MP sem chave Pix → 400 mp_conta_sem_chave_pix, a linha desfeita, 1 aviso por dia ao dono")
    base(A)
    texto = "não tem chave Pix"                     # o aviso ao dono da pagamentos-aluno (aluno_mp_pix › erroPixSemChave)
    n_av = avisos("geral", texto)["personal"]
    sim_cenario(pix_sem_chave=True)
    try:
        st, r = janela("pix", CONTA_A, lambda: pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"]}))
        st2, r2 = pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"]})
    finally:
        sim_cenario()
    sobra = mp_aguardando()
    p.check(st == 400 and r.get("erro") == "mp_conta_sem_chave_pix" and st2 == 400 and r2.get("erro") == "mp_conta_sem_chave_pix" and sobra == 0
            and avisos("geral", texto)["personal"] == n_av + 1,
            f"400 mp_conta_sem_chave_pix (2×), nenhuma linha aguardando e 1 aviso só ao dono ({st}/{st2} {r.get('erro')} · sobra {sobra})")


def local_cartao_outro_ambiente() -> None:
    print("\n── cartao_outro_ambiente (local, T9 d, MENOR 20): o cartão aprovado no mundo errado (live_mode true no staging) → 502, nada aplicado")
    base(A)
    pagas = mensalidades_pagas()
    n0 = sim_n()
    sim_cenario(live_mode=True)
    try:
        st, r = janela("cartao", CONTA_A, lambda: pedir(ALUNO, "aluno_mp_cartao", {"paciente_id": CTX["pac"], "card_token": "sim-card-APRO",
                                                                                  "payment_method_id": "master", "installments": 1}))
    finally:
        sim_cenario()
    criado = next((x for x in sim_pedidos(n0) if x["metodo"] == "POST" and x["caminho"] == "/v1/payments" and x.get("recurso_id")), {})
    pay = sim_recurso("payment", criado["recurso_id"]) if criado else {}
    pid = str(pay.get("id") or "")
    linhas = um(f"""select count(*)::int as n from {S}.cobrancas where paciente_id = '{CTX['pac']}' and deleted_at is null
                     and created_at >= {lit(CTX['t0'])}::timestamptz and (status = 'aguardando_confirmacao' or mp_payment_id = {lit(pid)})""")["n"]
    p.check(st == 502 and r.get("erro") == "mp_error" and pay.get("live_mode") is True and pay.get("status") == "approved" and linhas == 0
            and mensalidades_pagas() == pagas,
            f"502 mp_error: o pagamento de outro mundo não vale — nenhuma linha paga nem aguardando ({st} {r.get('erro')} · {linhas})")


def local_detalhe_outra_conta() -> None:
    print("\n── detalhe_outra_conta (local, T9 e): a cobrança de OUTRA conta do MP — o detalhe não lê, o estorno é pelo app do MP, cancelar só muda a "
          "linha; nada vai ao MP")
    base(A)
    pb = sim_post("/_pagamento", {"collector_id": B_, "status": "approved", "payment_method_id": "master",
                                  "external_reference": f"physiq:{S}:aluno:{CTX['pac']}:avulsa:{uuid.uuid4()}"})
    pb2 = sim_post("/_pagamento", {"collector_id": B_, "status": "pending", "external_reference": f"physiq:{S}:aluno:{CTX['pac']}:avulsa:{uuid.uuid4()}"})
    c1 = inserir_cobranca("paga", pb["id"], B_, metodo="cartao")
    c2 = inserir_cobranca("aguardando_confirmacao", pb2["id"], B_)
    n0 = sim_n()
    st1, r1 = pedir(ALUNO, "detalhe_mp", {"cobranca_id": c1})
    st2, r2 = pedir(DONO, "prof_reembolsar", {"cobranca_id": c1})
    st3, r3 = pedir(DONO, "prof_cobranca_cancelar", {"cobranca_id": c2})
    peds = sim_pedidos(n0)
    p.check(st1 == 200 and r1.get("mp") is None and r1.get("motivo") == "outra_conta_mp",
            f"detalhe_mp → mp null + motivo outra_conta_mp ({st1} {r1.get('motivo') or r1.get('erro')})")
    p.check(st2 == 409 and r2.get("erro") == "mp_reembolso_pelo_app_do_mp" and cobranca(c1).get("status") == "paga",
            f"prof_reembolsar → 409 mp_reembolso_pelo_app_do_mp e a linha fica ({st2} {r2.get('erro')})")
    p.check(st3 == 200 and cobranca(c2).get("status") == "cancelada" and sim_recurso("payment", pb2["id"]).get("status") == "pending",
            f"prof_cobranca_cancelar → só a linha (o pagamento da outra conta segue lá) ({st3} {r3.get('erro')})")
    p.check(not peds, f"nenhuma ida ao MP pelas 3 ações ({len(peds)} pedido(s))")


def local_registrado_cartao_e_avulsa() -> None:
    print("\n── registrado_cartao_e_avulsa (local, T9 f, decisão 15): registrar à mão com o CARTÃO em análise ou a AVULSA aguardando no MP usa a "
          "MESMA linha e fecha o pagamento no MP pela conta")
    base(A)
    st, r = janela("cartao", CONTA_A, lambda: pedir(ALUNO, "aluno_mp_cartao", {"paciente_id": CTX["pac"], "card_token": "sim-card-CONT",
                                                                              "payment_method_id": "master", "installments": 1}))
    c = (r.get("cobranca") or {}).get("id")
    linha = cobranca(c)
    pid = linha.get("mp_payment_id")
    p.check(st == 200 and linha.get("status") == "aguardando_confirmacao" and linha.get("metodo") == "cartao" and linha.get("pix_expira_em") is None
            and bool(pid), f"o cartão em análise (CONT → in_process): a linha aguardando, sem validade ({st} {r.get('erro')} {linha.get('status')})")
    pagas = mensalidades_pagas()
    st, r = janela("registrar", CONTA_A, lambda: pedir(DONO, "prof_registrar", {"aluno": CTX["pac"], "data": B.hoje(), "metodo": "dinheiro", "valor": 10}))
    linha = cobranca(c)
    p.check(st == 200 and (r.get("cobranca") or {}).get("id") == c and linha.get("status") == "paga" and linha.get("forma") == "manual"
            and mensalidades_pagas() == pagas + 1 and bool(pid) and sim_recurso("payment", pid).get("status") == "cancelled",
            f"o cartão em análise: a MESMA linha paga por fora e o pagamento fechado no MP pela conta ({st} {r.get('erro')} {linha.get('forma')})")
    st, r = pedir(DONO, "prof_cobranca_criar", {"aluno": CTX["pac"], "descricao": f"{PREFIXO} avulsa registrada", "valor": 4, "vencimento": B.hoje()})
    av = (r.get("cobranca") or {}).get("id")
    st2, _ = janela("pix", CONTA_A, lambda: pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"], "cobranca_id": av}))
    pav = cobranca(av).get("mp_payment_id")
    st3, r3 = janela("registrar", CONTA_A, lambda: pedir(DONO, "prof_registrar", {"aluno": CTX["pac"], "data": B.hoje(), "metodo": "dinheiro",
                                                                                  "cobranca_id": av}))
    la = cobranca(av)
    p.check(st == 200 and st2 == 200 and st3 == 200 and (r3.get("cobranca") or {}).get("id") == av and la.get("status") == "paga"
            and la.get("forma") == "manual" and bool(pav) and sim_recurso("payment", pav).get("status") == "cancelled",
            f"a avulsa aguardando no MP: a MESMA linha paga por fora e o Pix fechado no MP pela conta ({st}/{st2}/{st3} {r3.get('erro')})")


def local_teto() -> None:
    print("\n── teto (local, I6/MENORES 6 e 26): o teto por IP (só sem user_id) e por conta (só depois de achada), o corpo grande")
    base(A)
    reiniciar("web")
    ip = "10.99.99.1"
    inicio = time.time()

    def sem_user(_i):
        return webhook_local({"schema": S, "conta": str(uuid.uuid4()), "data.id": "1", "type": "payment"}, {"type": "payment", "data": {"id": "1"}}, ip=ip)

    def da_conta(i):
        return webhook_local({"schema": S, "conta": CTX["conta"], "data.id": "1", "type": "teste"},
                             {"type": "teste", "data": {"id": "1"}, "user_id": A}, ip=f"10.98.{i // 250}.{i % 250 + 1}")

    def inventado(i):
        return webhook_local({"schema": S, "conta": str(uuid.uuid4()), "data.id": "1", "type": "payment"}, {"type": "payment", "data": {"id": "1"}},
                             ip=f"10.97.{i // 250}.{i % 250 + 1}")

    with ThreadPoolExecutor(16) as ex:
        r1 = list(ex.map(sem_user, range(130)))
        r2 = list(ex.map(da_conta, range(70)))
        r3 = list(ex.map(inventado, range(200)))
    st_c, _ = da_conta(999)
    st_i, _ = sem_user(0)
    gasto = time.time() - inicio
    c1 = (sum(1 for st, r in r1 if st == 200 and r.get("resultado") == "conta_sem_mp"), sum(1 for st, r in r1 if st == 429))
    c2 = (sum(1 for st, r in r2 if st == 200 and r.get("resultado") == "topico_ignorado"), sum(1 for st, r in r2 if st == 429))
    p.check(c1 == (120, 10), f"130 avisos SEM user_id do mesmo IP num minuto → 120 passam e os últimos 10 → 429 ({c1})")
    p.check(c2 == (60, 10), f"70 avisos da MESMA conta → 60 passam e os últimos 10 → 429 ({c2})")
    p.check(all(st == 200 for st, _ in r3) and st_c == 429 and st_i == 429 and gasto < 55,
            f"200 avisos de IPs e contas inventados NÃO zeram os tetos: a conta e o IP seguem em 429 ({st_c}/{st_i} em {gasto:.0f} s)")
    st, r = webhook_local({"schema": S, "conta": CTX["conta"]}, b'{"lixo": "' + b"x" * 17_000 + b'"}')
    st2, r2 = post_em_pedacos(f"http://127.0.0.1:{PORTAS['web']}/mp-webhook-aluno?schema={S}&conta={CTX['conta']}",
                              b'{"lixo": "' + b"x" * 17_000 + b'"}', {"X-Forwarded-For": ip_novo()})
    p.check(st == 413 and st2 == 413 and (r2 or {}).get("resultado") == "corpo_grande", f"corpo > 16 KB → 413 com e sem content-length ({st}/{st2})")
    reiniciar("web")


def local_tokens() -> None:
    print("\n── tokens (local, MENOR 16): o MP do Physiq com o physiq_teste e, na rodada inteira, o token de CADA ação")
    sim_cenario()
    cancelar_vivas()
    esconder()
    modo_conta("mercadopago")
    try:
        st, r = janela("pix", PHYSIQ, lambda: pedir(ALUNO, "aluno_mp_pix", {"paciente_id": CTX["pac"]}))
        c = (r.get("cobranca") or {}).get("id")
        janela("conferir", PHYSIQ, lambda: pedir(ALUNO, "aluno_mp_conferir", {"cobranca_id": c}))
        janela("detalhe", PHYSIQ, lambda: pedir(ALUNO, "detalhe_mp", {"cobranca_id": c}))
        p.check(st == 200 and cobranca(c).get("mp_collector_id") is None, f"o Pix do MP do Physiq: a linha sem collector ({st} {r.get('erro')})")
    finally:
        esconder()
        modo_conta("pix_manual")
    peds = sim_pedidos(0)
    conferidas = janelas_conferidas(peds, CTX["janelas"])
    grupos: dict = {}
    for j in conferidas:
        g = grupos.setdefault((j["rotulo"], j["esperado"]), {"acoes": 0, "pedidos": 0, "vazias": 0, "trocados": set()})
        g["acoes"] += 1
        g["pedidos"] += j["pedidos"]
        g["vazias"] += 0 if j["pedidos"] else 1
        g["trocados"] |= set(j["trocados"])
    for (rotulo, esperado), g in sorted(grupos.items()):
        p.check(not g["trocados"] and g["pedidos"] > 0 and not g["vazias"],
                f"{rotulo}: {g['acoes']} ação(ões), {g['pedidos']} pedido(s) ao MP, todos com {esperado}"
                + (f" — TROCADOS: {sorted(g['trocados'])}" if g["trocados"] else "") + (f" — {g['vazias']} sem ir ao MP" if g["vazias"] else ""))
    vistas = {r for r, e in grupos if e == CONTA_A}
    faltou = [x for x in ACOES_TASK9 if x not in vistas]
    p.check(not faltou, f"a tabela da Task 9 inteira exercida com o token da conta ({len(ACOES_TASK9) - len(faltou)}/{len(ACOES_TASK9)}"
                        + (f"; faltou: {', '.join(faltou)}" if faltou else "") + ")")
    vistas_p = {r for r, e in grupos if e == PHYSIQ}
    p.check(all(x in vistas_p for x in ACOES_DO_PHYSIQ), f"o MP do Physiq com o physiq_teste ({sorted(vistas_p)})")
    trocadas = mutacoes_trocadas(peds)
    p.check(not trocadas, f"nenhuma mutação (PUT, estorno) com o token de outro dono na rodada inteira ({len(peds)} pedidos"
                          + (f"; trocadas: {[(x['metodo'], x['caminho'].split('?')[0], x['token_nome']) for x in trocadas[:5]]}" if trocadas else "") + ")")


FUNCOES_STAGING = {"recebimento": caso_recebimento, "guarda": caso_guarda, "simulada": caso_simulada, "pix": caso_pix, "cartao": caso_cartao,
                   "automatica": caso_automatica, "webhook": caso_webhook, "desconectar": caso_desconectar, "master": caso_master, "erro": caso_erro,
                   "oauth_real": caso_oauth_real}
FUNCOES_LOCAL = {"conectar": local_conectar, "confirmar_outro": local_confirmar_outro, "reusado": local_reusado, "troca_ruim": local_troca_ruim,
                 "modo_errado": local_modo_errado, "sem_chave": local_sem_chave, "outra_conta": local_outra_conta,
                 "trocar_com_pix": local_trocar_com_pix, "pagar": local_pagar, "registrado": local_registrado,
                 "reembolso_forjado": local_reembolso_forjado, "webhook": local_webhook, "criado_e_atualizado": local_criado_e_atualizado,
                 "webhook_401_alheio": local_webhook_401_alheio, "sem_conta_pelo_user_id": local_sem_conta_pelo_user_id, "uso_401": local_uso_401,
                 "renovar": local_renovar, "recusada": local_recusada, "diario": local_diario, "rede_automatica": local_rede_automatica,
                 "fila": local_fila, "cancelar_automatica": local_cancelar_automatica, "assinatura_antiga_viva": local_assinatura_antiga_viva,
                 "salvar_recusado": local_salvar_recusado, "desligar": local_desligar, "master": local_master,
                 "pix_de_outra_conta": local_pix_de_outra_conta, "pix_avulsa_de_outra_conta": local_pix_avulsa_de_outra_conta,
                 "pix_vivo_sem_escrita": local_pix_vivo_sem_escrita, "post_sem_decisao": local_post_sem_decisao, "pix_sem_chave": local_pix_sem_chave,
                 "cartao_outro_ambiente": local_cartao_outro_ambiente, "detalhe_outra_conta": local_detalhe_outra_conta,
                 "registrado_cartao_e_avulsa": local_registrado_cartao_e_avulsa, "teto": local_teto, "tokens": local_tokens}


# ───────────────────────── ambiente, seco e main ─────────────────────────

def ambiente(casos: list[str]) -> bool:
    """Só leitura, ANTES de gravar: a W2 no staging, as flags e os jobs; no padrão, as funções publicadas; no --local, o deno."""
    w2 = bool(um(f"select to_regclass('{S}.mp_conexoes') is not null as ok")["ok"])
    p.check(w2, f"{S}: a W2 (20261011210000_w2_mp_personal.sql)")
    if not w2:
        return False
    flags = {x["chave"] for x in sql(f"select chave from {S}.app_config where chave in ('mercadopago_conta', 'mp_webhook')")}
    p.check(flags == {"mercadopago_conta", "mp_webhook"}, f"as 2 flags da W2 no {S} ({sorted(flags)})")
    if CTX.get("local"):
        js = jobs()
        p.check(all(v is not None for v in js.values()), f"os jobs que o --local para existem ({js})")
        p.check(DENO.exists(), "o deno local (~/.deno/bin/deno)")
        return w2 and flags == {"mercadopago_conta", "mp_webhook"} and DENO.exists()
    for slug, jwt in (("pagamentos-aluno", True), ("mp-conectar-retorno", False), ("mp-webhook-aluno", False), ("mp-contas-renovar", False),
                      ("automaticas-fila", False), ("master-contas", True)):
        st, r, _ = B.http("GET", f"https://api.supabase.com/v1/projects/{B.PRINCIPAL_REF}/functions/{slug}", None,
                          {"Authorization": f"Bearer {B.ler('.pc-pat')}"})
        r = r if isinstance(r, dict) else {}
        p.check(st == 200 and r.get("verify_jwt") is jwt, f"função {slug} publicada com verify_jwt {str(jwt).lower()} (versão {r.get('version')})")
    pronto = True
    if set(casos) & CASOS_SIMULADOS:
        p.check((CASA / ".physiq-mp-test").exists() and (CASA / ".physiq-mp-public-test").exists(),
                "a credencial de TESTE do MP (~/.physiq-mp-test e ~/.physiq-mp-public-test)")
        if CTX.get("conexao_sql"):
            # a conexão por SQL tem de abrir nas funções PUBLICADAS: a chave = a delas e o token de TESTE = o MP_ACCESS_TOKEN_TEST delas
            try:
                chave_do_servico()
                chave_ok = True
            except Exception as e:  # noqa: BLE001 — só o tipo na tela (nada do cofre)
                print(f"   (a chave do cofre não carregou: {type(e).__name__})", flush=True)
                chave_ok = False
            p.check(chave_ok, "--conexao-sql: a MP_TOKENS_CHAVE do cofre (só na memória) = a das funções (pelo digest)")
            st, lista, _ = B.http("GET", f"https://api.supabase.com/v1/projects/{B.PRINCIPAL_REF}/secrets", None,
                                  {"Authorization": f"Bearer {B.ler('.pc-pat')}"})
            digest = next((str(x.get("value") or "").lower() for x in (lista if isinstance(lista, list) else []) if x.get("name") == "MP_ACCESS_TOKEN_TEST"), "")
            teste = (CASA / ".physiq-mp-test").read_text(encoding="utf-8").strip() if (CASA / ".physiq-mp-test").exists() else ""
            token_ok = st == 200 and bool(teste) and digest == sha256_hex(teste)
            p.check(token_ok, f"--conexao-sql: o ~/.physiq-mp-test = o MP_ACCESS_TOKEN_TEST das funções (pelo digest) ({st})")
            pronto = chave_ok and token_ok
    return w2 and pronto


def autotestes() -> None:
    """As peças puras, sem rede: a cifra, os limites, o IP por pedido, as janelas do MENOR 16, a ordem do desfazer e a lista de casos."""
    chave = nova_chave()
    ad = dado_associado("00000000-0000-0000-0000-000000000001", "access")
    cifra = cifrar("APP_USR-teste-da-cifra-0000", ad, chave)
    outra_ad = False
    try:
        decifrar(cifra, dado_associado("00000000-0000-0000-0000-000000000002", "access"), chave)
    except Exception:  # noqa: BLE001
        outra_ad = True
    p.check(bool(CIFRA_RX.fullmatch(cifra)) and decifrar(cifra, ad, chave) == "APP_USR-teste-da-cifra-0000" and outra_ad and len(chave) == 43,
            "seco: a cifra v1:<iv>:<cifra> abre com o AD da conta e NÃO abre com o de outra (a chave da rodada tem 43 caracteres)")
    agora = 10_000.0
    p.check(not no_limite([agora - i for i in range(9)], agora, 10, 3600) and no_limite([agora - i for i in range(10)], agora, 10, 3600)
            and not no_limite([agora - 3601] + [agora - i for i in range(9)], agora, 10, 3600),
            "seco: o limite da instância (10 conectar/h; o de fora da janela não conta)")
    ips = {ip_novo() for _ in range(600)}
    p.check(len(ips) == 600, "seco: um X-Forwarded-For diferente por pedido (600 seguidos)")
    falsos = [{"n": 0, "metodo": "POST", "caminho": "/v1/payments", "token_nome": CONTA_A, "token_de": A, "recurso_de": A},
              {"n": 1, "metodo": "POST", "caminho": "/oauth/token", "token_nome": None, "token_de": None, "recurso_de": A},
              {"n": 2, "metodo": "PUT", "caminho": "/preapproval/x", "token_nome": PHYSIQ, "token_de": SIM.ID_PHYSIQ, "recurso_de": A}]
    j = janelas_conferidas(falsos, [{"rotulo": "pix", "esperado": CONTA_A, "de": 0, "ate": 2}, {"rotulo": "cancelar", "esperado": CONTA_A, "de": 2, "ate": 3}])
    p.check(j[0]["pedidos"] == 1 and not j[0]["trocados"] and j[1]["trocados"] == [PHYSIQ] and len(mutacoes_trocadas(falsos)) == 1,
            "seco: as janelas do MENOR 16 acham o token trocado e a mutação com o token de outro dono")
    # revisão I-3: o pedido_em acha o PUT que fecha o Pix antigo ({cancelled}, com o token DELE) e o POST novo (com o da conta), pelo n
    i3 = [{"n": 7, "metodo": "GET", "caminho": "/v1/payments/11", "token_nome": PHYSIQ, "corpo": None},
          {"n": 8, "metodo": "PUT", "caminho": "/v1/payments/11", "token_nome": PHYSIQ, "corpo": {"status": "cancelled"}},
          {"n": 9, "metodo": "POST", "caminho": "/v1/payments?x=1", "token_nome": CONTA_A, "corpo": {"transaction_amount": 5}}]
    put, post = pedido_em(i3, "PUT", "/v1/payments/11", PHYSIQ, {"status": "cancelled"}), pedido_em(i3, "POST", "/v1/payments", CONTA_A)
    al_reves = [dict(x, n=10 - x["n"]) for x in i3]         # o POST antes do PUT: o caso acusa
    p.check(put == 8 and post == 9 and put < post and pedido_em(i3, "PUT", "/v1/payments/11", CONTA_A) is None
            and pedido_em(i3, "PUT", "/v1/payments/11", PHYSIQ, {"status": "authorized"}) is None and pedido_em(i3, "PUT", "/v1/payments/12") is None
            and not (pedido_em(al_reves, "PUT", "/v1/payments/11", PHYSIQ, {"status": "cancelled"})
                     < pedido_em(al_reves, "POST", "/v1/payments", CONTA_A)),
            "seco (revisão I-3): o pedido_em acha o PUT {cancelled} com o token DELE e o POST com o da conta, e a ordem pelo n acusa o contrário")
    est = {"paciente": "p1", "conta_id": "c1", "t0": "2026-10-11 23:00", "aluno_uid": "a1", "dono_uid": "d1", "assinaturas": ["x1"],
           "conta": {"modo": "pix_manual", "bloquear": False}, "vivas": [], "flags": {"mp_webhook": '{"exigir_assinatura": false}'},
           "jobs": {"mp-renovar-staging": True},
           "pacientes": {"plano_aluno_id": None, "plano_modalidade": None, "plano_valor_negociado": None, "mensalidade_valor": "10",
                         "mensalidade_desde": None, "cobranca_pausada": False}}
    cmds = comandos_do_desfazer(est)
    i_ass = next(i for i, c in enumerate(cmds) if c.startswith(f"delete from {S}.aluno_assinaturas"))
    i_modo = next(i for i, c in enumerate(cmds) if "recebimento_modo" in c)
    p.check(i_ass < i_modo and all(f"{S}." in c or "cron.alter_job" in c for c in cmds) and not any("public." in c for c in cmds),
            "seco: o desfazer apaga as automáticas da rodada ANTES de devolver o modo (a guarda) e só mexe no staging")
    p.check(set(FUNCOES_STAGING) == set(CASOS_STAGING) and set(FUNCOES_LOCAL) == set(CASOS_LOCAL) and len(CASOS_STAGING) + len(CASOS_LOCAL) >= 35,
            f"seco: cada caso tem função ({len(CASOS_STAGING)} do padrão + {len(CASOS_LOCAL)} do --local = {len(CASOS_STAGING) + len(CASOS_LOCAL)})")


def conferir_com_o_deno() -> None:
    """A cifra e a x-signature daqui = as do código das funções (o Deno roda o _shared de verdade; nada sai da máquina)."""
    chave = nova_chave()
    conta = "00000000-0000-0000-0000-0000000000aa"
    cifra = cifrar("TEST-sim-conferencia-0000", dado_associado(conta, "refresh"), chave)
    ts, rid, segredo = "1700000000000", str(uuid.uuid4()), secrets.token_urlsafe(24)
    v1 = SIM.assinar(segredo, "123456", rid, ts)
    codigo = f"""
import {{ importarChave, decifrar, cifrar, dadoAssociado }} from "{(RAIZ / 'supabase-principal/functions/_shared/cifra-mp.ts').as_uri()}";
import {{ assinaturaMp }} from "{(RAIZ / 'supabase-principal/functions/_shared/mp-conta-regras.ts').as_uri()}";
const e = Deno.env.toObject();
const k = await importarChave(e.W2_CHAVE);
const aberto = await decifrar(e.W2_CIFRA, dadoAssociado("staging", e.W2_CONTA, "refresh"), k);
const nova = await cifrar("APP_USR-volta-0000000000", dadoAssociado("staging", e.W2_CONTA, "access"), k);
const sig = await assinaturaMp({{ cabecalho: `ts=${{e.W2_TS}},v1=${{e.W2_V1}}`, requestId: e.W2_RID, dataId: "123456", segredo: e.W2_SEGREDO }});
console.log(JSON.stringify({{ aberto, nova, sig }}));
"""
    env = {**os.environ, "DENO_NO_PACKAGE_JSON": "1", "W2_CHAVE": chave, "W2_CIFRA": cifra, "W2_CONTA": conta, "W2_TS": ts, "W2_V1": v1,
           "W2_RID": rid, "W2_SEGREDO": segredo}
    r = subprocess.run([str(DENO), "eval", "--ext=ts", codigo], capture_output=True, text=True, env=env, timeout=120, cwd=RAIZ)
    try:
        saida = json.loads(r.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        p.check(False, f"seco: o Deno não conferiu a cifra ({r.returncode}: {r.stderr.strip()[-200:]})")
        return
    volta_ok = decifrar(saida["nova"], dado_associado(conta, "access"), chave) == "APP_USR-volta-0000000000"
    p.check(saida["aberto"] == "TEST-sim-conferencia-0000" and volta_ok,
            "seco: a cifra do e2e abre no _shared/cifra-mp.ts e a do Deno abre aqui (o mesmo AES-256-GCM, o mesmo AD)")
    p.check(saida["sig"] == "valida", f"seco: a x-signature do simulador é 'valida' no mp-conta-regras.ts › assinaturaMp ({saida['sig']})")


def cutucar_local() -> None:
    """--seco: as 6 funções e o simulador de pé, cutucados no que responde ANTES do banco (o banco é um endereço fechado)."""
    st, r = sim("GET", "/_estado")
    p.check(st == 200 and (r or {}).get("pedidos") == 0, f"seco: o simulador responde em 127.0.0.1:{PORTAS['sim']} ({st})")
    pag = f"http://127.0.0.1:{PORTAS['pag']}"
    st, _, _ = rede("OPTIONS", pag, None, {"Origin": "http://localhost:8080"})
    st2, r2, _ = rede("POST", pag, {"acao": "aluno_status"}, {"x-schema": S, "Origin": "http://localhost:8080"})
    st3, r3, _ = rede("POST", pag, {"acao": "aluno_status"}, {"x-schema": "producao", "Authorization": "Bearer x", "Origin": "http://localhost:8080"})
    p.check(st == 200 and st2 == 401 and (r2 or {}).get("erro") == "missing_auth" and st3 == 400 and (r3 or {}).get("erro") == "schema_invalido",
            f"seco: a pagamentos-aluno local responde (OPTIONS 200 · sem login 401 · schema ruim 400) ({st}/{st2}/{st3})")
    ret = f"http://127.0.0.1:{PORTAS['ret']}/mp-conectar-retorno/{S}"
    st, _, cab = rede("GET", f"{ret}?state=curto&code=x", None, {"X-Forwarded-For": ip_novo()}, seguir=False)
    st2, _, cab2 = rede("GET", f"{ret}?state={'a' * 43}&code=TG-sim-0000000000", None, {"X-Forwarded-For": ip_novo()}, seguir=False)
    st3, _, cab3 = rede("POST", ret, {}, {"X-Forwarded-For": ip_novo()}, seguir=False)
    p.check(st == 302 and cab.get("location") == f"{VOLTA_SITE}?mp=invalido" and cab.get("referrer-policy") == "no-referrer"
            and "no-store" in (cab.get("cache-control") or "") and st2 == 302 and cab2.get("location") == f"{VOLTA_SITE}?mp=falhou"
            and st3 == 302 and cab3.get("location") == f"{VOLTA_SITE}?mp=invalido",
            f"seco: a volta local (state ruim → invalido; o banco fechado → falhou, sem cair; POST → invalido; no-referrer e no-store) ({st}/{st2}/{st3})")
    web = f"http://127.0.0.1:{PORTAS['web']}/mp-webhook-aluno"
    st, r, _ = rede("GET", web)
    st2, r2, _ = rede("POST", f"{web}?schema=producao", {"type": "payment", "data": {"id": "1"}})
    st3, r3, _ = rede("POST", f"{web}?schema={S}", None, bruto=b'{"lixo": "' + b"x" * 17_000 + b'"}')
    st4, r4 = post_em_pedacos(f"{web}?schema={S}&conta={uuid.uuid4()}", b'{"lixo": "' + b"x" * 17_000 + b'"}')
    st5, r5, _ = rede("POST", f"{web}?schema={S}&conta={uuid.uuid4()}", {"type": "payment", "data": {"id": "1"}}, {"X-Forwarded-For": ip_novo()})
    p.check(st == 200 and (r or {}).get("resultado") == "ignorado_metodo" and (r2 or {}).get("resultado") == "schema_invalido"
            and st3 == 413 and st4 == 413 and (r4 or {}).get("resultado") == "corpo_grande" and st5 == 500,
            f"seco: o aviso local (GET ignorado · schema ruim · 17 KB → 413 com e sem content-length · &conta= com o banco fechado → 500) ({st}/{st2}/{st3}/{st4}/{st5})")
    ren = f"http://127.0.0.1:{PORTAS['ren']}"
    s10 = {"x-espelho-segredo": segredos_da_rodada()["s10"]}
    st, _, _ = rede("GET", ren)
    st2, r2, _ = rede("POST", ren, {"schema": S})
    st3, r3, _ = rede("POST", ren, {"schema": "producao"}, s10)
    st4, r4, _ = rede("POST", ren, {"schema": S, "forcar_conta": "x"}, s10)
    st5, r5, _ = rede("POST", ren, {"schema": S}, s10)
    p.check(st == 405 and st2 == 401 and (r2 or {}).get("error") == "segredo_invalido" and st3 == 400 and (r3 or {}).get("error") == "schema_invalido"
            and st4 == 400 and (r4 or {}).get("error") == "conta_invalida" and st5 == 500 and (r5 or {}).get("error") == "erro_interno",
            f"seco: a mp-contas-renovar local (405 · sem o S10 401 · com o S10 da rodada 400/400 · a configuração passa e o banco fechado → 500) ({st}/{st2}/{st3}/{st4}/{st5})")
    fila = f"http://127.0.0.1:{PORTAS['fila']}"
    st, r, _ = rede("POST", fila, {"schema": S})
    st2, r2, _ = rede("POST", fila, {"schema": "x"}, {"x-espelho-segredo": segredos_da_rodada()["s9"]})
    p.check(st == 401 and st2 == 400 and (r2 or {}).get("error") == "schema_invalido",
            f"seco: a automaticas-fila local (sem o S9 401 · com o S9 da rodada, schema ruim 400) ({st}/{st2})")
    mst, falso = f"http://127.0.0.1:{PORTAS['mst']}", "Bearer " + "x" * 40
    st, _, _ = rede("OPTIONS", mst, None, {"Origin": SITE})
    st2, r2, _ = rede("POST", mst, {"acao": "acao"}, {"x-schema": S, "Origin": SITE})
    st3, r3, _ = rede("POST", mst, {"acao": "acao"}, {"x-schema": "producao", "Authorization": falso, "Origin": SITE})
    st4, r4, _ = rede("POST", mst, {"acao": "acao"}, {"x-schema": S, "Authorization": falso, "Origin": "https://localhost"})
    p.check(st == 200 and st2 == 401 and (r2 or {}).get("erro") == "sem_login" and st3 == 400 and (r3 or {}).get("erro") == "schema_invalido"
            and st4 == 403 and (r4 or {}).get("erro") == "so_no_site",
            f"seco: a master-contas local (OPTIONS 200 · sem login 401 · schema ruim 400 · a origem do app 403) ({st}/{st2}/{st3}/{st4})")
    p.check(sim_pedidos(0) == [], "seco: ninguém chamou o 'Mercado Pago' (o simulador) — e o Deno nem alcança outro host")


def seco(casos: list[str]) -> int:
    print("── seco: nada sai de 127.0.0.1 — as peças, a cifra e a x-signature com o Deno, o simulador e as 6 funções contra um banco FECHADO")
    autotestes()
    try:
        import prova_public_key  # noqa: F401, PLC0415 — o oauth_real reusa o seguir_ate_o_code
        p.check(True, "seco: o e2e/w2/prova_public_key.py importa (o oauth_real reusa o seguir_ate_o_code)")
    except Exception as e:  # noqa: BLE001
        p.check(False, f"seco: o prova_public_key.py não importa ({type(e).__name__})")
    if not DENO.exists():
        p.check(False, "seco: falta o ~/.deno/bin/deno")
        return p.fim()
    conferir_com_o_deno()
    procs = subir_local(seco=True)
    try:
        cutucar_local()
    finally:
        descer_local(procs)
    return p.fim()


def main() -> int:
    ap = argparse.ArgumentParser(description="Physiq W2 — E2E de servidor do Mercado Pago do personal (staging)")
    ap.add_argument("--local", action="store_true", help="as funções no Deno local + o simulador do MP (contra o banco do staging)")
    ap.add_argument("--casos", default=None, help="lista separada por vírgula (padrão: todos do modo; o oauth_real só pedindo)")
    ap.add_argument("--sinal", default=None, help="arquivo-sinal da trava do banco do staging: sem ele não começa; sumiu → para antes do próximo caso")
    ap.add_argument("--redirect-proprio", action="store_true", help="oauth_real: o redirect próprio do staging (depois da W2-a), não o de teste do MP")
    ap.add_argument("--pagador-email", default=None, help="oauth_real: o pagador esperado (padrão: o do COMPRADOR de teste — MENOR 21)")
    ap.add_argument("--canal", default="msedge", help="oauth_real: o navegador do Playwright")
    ap.add_argument("--com-tela", action="store_true", help="oauth_real: abre a janela")
    ap.add_argument("--conexao-sql", action="store_true",
                    help="padrão: a conexão simulada por SQL do servidor SÓ no staging (o upsert do prof_mp_simular_conexao), não pela função — o "
                         "master de teste não é master no Auth (hml-02/H-04) e a função só o aceita pelo app_metadata; a MP_TOKENS_CHAVE vem "
                         "do cofre (mp_conta.py) só na memória")
    modo_ = ap.add_mutually_exclusive_group()
    modo_.add_argument("--seco", action="store_true")
    modo_.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    if a.local and a.conexao_sql:
        ap.error("--conexao-sql só vale no padrão (o --local grava a integração com os tokens do simulador e a chave da rodada)")
    CTX.update(local=a.local, redirect_proprio=a.redirect_proprio, pagador_email=a.pagador_email, canal=a.canal, com_tela=a.com_tela,
               conexao_sql=a.conexao_sql)
    validos = CASOS_LOCAL if a.local else CASOS_STAGING
    padrao = CASOS_LOCAL if a.local else tuple(c for c in CASOS_STAGING if c not in SO_PEDINDO)
    casos = [c.strip() for c in (a.casos or ",".join(padrao)).split(",") if c.strip()]
    if any(c not in validos for c in casos):
        ap.error(f"casos deste modo: {', '.join(validos)}")
    funcoes = FUNCOES_LOCAL if a.local else FUNCOES_STAGING
    if a.seco:
        carregar_placar()
        return seco(casos)
    carregar_base()
    sinal = Path(a.sinal).expanduser() if a.sinal else None
    if not B.saude_treino() or not saude_principal():
        print("   o banco do Treino ou o principal não está saudável — parar (regra de 10/10)")
        return 2
    pendente = json.loads(ESTADO_ARQ.read_text(encoding="utf-8")) if ESTADO_ARQ.exists() else None
    if pendente:
        print(f"   a rodada anterior não terminou ({ESTADO_ARQ}): desfazendo antes", flush=True)
        desfazer(pendente)
        if ESTADO_ARQ.exists():
            return p.fim()
    if a.limpar:
        return p.fim()
    if sinal and not sinal.exists():
        print(f"   sem o sinal {sinal} (a trava do banco do staging): a rodada não começa", flush=True)
        return 3
    if not ambiente(casos):
        print("   o ambiente não está pronto (acima) — a rodada não começa, nada foi gravado", flush=True)
        return p.fim()
    try:
        procs = subir_local() if a.local else {}
    except RuntimeError as e:
        p.check(False, f"o Deno local não subiu: {e}"[:400])
        return p.fim()
    try:
        try:
            preparar()
        except RuntimeError as e:          # a conta do prof2 fora do ponto de partida: nada (ou só a foto) gravado — o finally desfaz o que houver
            p.check(False, f"a rodada não começou: {e}"[:400])
            casos = []
        for nome in casos:
            if sinal and not sinal.exists():
                print(f"\n⏸️  o sinal {sinal.name} sumiu (o banco do staging voltou para a outra sessão): parei antes do caso '{nome}'", flush=True)
                CTX["interrompida"] = nome
                break
            try:
                funcoes[nome]()
            except Exception as e:  # noqa: BLE001
                p.check(False, f"[{nome}] quebrou: {e!r}"[:400])
    finally:
        if CTX.get("estado"):
            desfazer(CTX["estado"])
        descer_local(procs)
    r = p.fim()
    if CTX.get("interrompida"):
        print(f"   rodada INTERROMPIDA antes de '{CTX['interrompida']}' (o sinal sumiu): a massa foi desfeita — rode de novo com o sinal")
        return 3
    return r


if __name__ == "__main__":
    sys.exit(main())
