#!/usr/bin/env python3
"""Physiq W6 — E2E de SERVIDOR da cobrança aluno → profissional (staging, contas de TESTE, em série — o Banco do Treino é uma
VM Nano). Casos (positivo e negativo):
  pix      aluno do Calc paga a mensalidade por Pix na chave da conta com comprovante → o professor recusa (o aluno vê o
           motivo) → o aluno manda outro → o professor confirma (lança a entrada) → a cobertura anda 1 mês; pasta alheia recusada
  porfora  pagamento feito por fora (dinheiro) soma 1 mês; remover recua; pausar ("não cobrar pelo app") barra o pagamento
  acesso   quem não é da conta não vê o aluno; o aluno não mexe como profissional nem vê o comprovante de outro
  nutri    paciente do Nutri vê a cobrança avulsa (vencida = inadimplente, bloqueio ligado na conta) e paga por Pix com
           comprovante (R16); recusa volta a "aberta"; confirma → paga; o site antigo continua lendo as cobranças
  mp       conta liberada no Mercado Pago (sandbox): Pix gerado e reaproveitado, aviso do webhook novo, aprovação simulada,
           cartão de teste APRO numa cobrança avulsa + reembolso, assinatura (pendente no sandbox) e cancelamento
  antigo   assinatura ANTIGA do Calc: o pagamento dela avisa o mp-webhook do Treino → grava lá e é repassado → aparece no
           principal (idempotente: o 2º aviso não duplica)
Uso: python3 e2e/w06/api.py [--casos pix,porfora,acesso,nutri,mp,antigo]
"""
from __future__ import annotations

import argparse
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

p = B.p
B.ESTADO["schema"] = "staging"
S = "staging"


def limpar_testes(pac_id: str) -> None:
    """Some com as cobranças de TESTE que os casos criaram antes (só da matrícula de teste; as migradas ficam)."""
    B.sql_principal(f"""update {S}.cobrancas set deleted_at = now() where paciente_id = '{pac_id}' and deleted_at is null
                          and origem in ('app', 'assinatura', 'assinatura_calc', 'webhook_calc')""")


def garantir_chave(conta: str, conta_id: str, chave: str) -> dict:
    """A chave Pix ativa da conta pela tela de Recebimento (RLS: o dono grava na conta dele)."""
    ativa = B.sql_principal(f"select id::text as id, chave from {S}.recebimento_chaves where conta_id = '{conta_id}' and ativa")
    if ativa:
        return ativa[0]
    membro = B.sql_principal(f"""select m.id::text as id from {S}.conta_membros m join auth.users u on u.id = m.user_id
                                   where m.conta_id = '{conta_id}' and lower(u.email) = '{B.CONTAS[conta][0]}'""")
    st, r = B.rest(conta, "POST", "recebimento_chaves", {"conta_id": conta_id, "membro_id": membro[0]["id"] if membro else None, "tipo": "email",
                                                         "chave": chave, "favorecido": "Teste Claude W6", "banco": "Banco Teste", "ativa": True})
    assert st in (200, 201), (st, r)
    return r[0]


def status_aluno(conta: str) -> dict:
    st, r = B.pag(conta, "aluno_status")
    assert st == 200, (st, r)
    return r["matriculas"][0]


def caso_pix() -> None:
    print("\n── pix: mensalidade por Pix na chave com comprovante (aluno2 · prof2)")
    m = B.matricula("aluno2")
    conta = m["conta_id"]
    limpar_testes(m["id"])
    B.sql_principal(f"update {S}.pacientes set cobranca_pausada = false where id = '{m['id']}'")
    chave = garantir_chave("prof2", conta, "prof2.teste.claude@physiqcalc.app")
    p.check(bool(chave), "a conta do prof2 tem a chave Pix ativa (pela RLS do dono)")
    st, r = B.pag("prof2", "prof_definir", {"aluno": m["treino_user_id"], "plano_novo": "Plano W6 Teste", "valor": "99,90"})
    p.check(st == 200 and r["mensalidade"]["valor"] == 99.9 and r["mensalidade"]["plano"] == "Plano W6 Teste",
            f"professor define plano e valor pelo id do Treino ({st} {r.get('mensalidade') or r})")
    s = status_aluno("aluno2")
    p.check(s["mensalidade"]["valor"] == 99.9 and s["chave"] and s["chave"]["chave"] == chave["chave"] and s["conta"]["modo"] == "pix_manual",
            "aluno vê a mensalidade e a chave Pix ativa da conta")
    st, r = B.pag("aluno2", "aluno_avisar_pix", {"paciente_id": m["id"], "comprovante_path": f"conta/{conta}/outro-aluno/2026-09-1.png"})
    p.check(st == 403 and r.get("erro") == "comprovante_fora_da_pasta", f"comprovante de outra pasta é recusado ({st} {r.get('erro')})")
    st, r = B.pag("aluno2", "aluno_avisar_pix", {"paciente_id": m["id"], "comprovante_path": f"conta/{conta}/{m['id']}/nunca-subiu.png"})
    p.check(st == 400 and r.get("erro") == "comprovante_nao_enviado", f"sem o arquivo no Storage, não avisa ({st} {r.get('erro')})")
    caminho = B.subir_comprovante("aluno2", m["id"])
    st, r = B.pag("aluno2", "aluno_avisar_pix", {"paciente_id": m["id"], "comprovante_path": caminho})
    c1 = r.get("cobranca") or {}
    p.check(st == 200 and c1.get("status") == "aguardando_confirmacao" and c1.get("forma") == "pix_manual" and c1.get("valor") == 99.9,
            f"'Já paguei' com o comprovante → aguardando a confirmação ({st} {c1.get('status')})")
    av = B.sql_principal(f"select tipo, titulo, link from {S}.avisos where destino_user_id = '{B.uid('prof2')}' and tipo = 'comprovante_enviado' order by criado_em desc limit 1")
    p.check(bool(av) and "enviou um comprovante" in av[0]["titulo"] and av[0]["link"].endswith("/financeiro"), f"o professor recebe o aviso no sino ({av[:1]})")
    st, r = B.pag("prof2", "prof_resumo", {"conta_id": conta})
    p.check(st == 200 and any(x["id"] == c1["id"] for x in r["pendentes"]), "o comprovante aparece nos aguardando confirmação da conta")
    st, r = B.pag("prof2", "prof_comprovante", {"cobranca_id": c1["id"]})
    arquivo = urllib.request.urlopen(r["url"], timeout=30).read() if st == 200 else b""
    p.check(st == 200 and arquivo == B.PNG, "o professor abre o comprovante (URL assinada) e é o mesmo arquivo")
    st, r = B.pag("prof2", "prof_recusar", {"cobranca_id": c1["id"], "motivo": "Valor diferente da mensalidade"})
    p.check(st == 200 and r["cobranca"]["status"] == "cancelada" and r["cobranca"]["recusado_motivo"] == "Valor diferente da mensalidade",
            f"professor recusa → a tentativa fica recusada com o motivo ({st})")
    s = status_aluno("aluno2")
    rec = next((c for c in s["cobrancas"] if c["id"] == c1["id"]), {})
    p.check(bool(rec.get("recusado_em")) and not s["mensalidade"]["coberta"], "o aluno vê o comprovante recusado e segue pendente")
    caminho2 = B.subir_comprovante("aluno2", m["id"])
    st, r = B.pag("aluno2", "aluno_avisar_pix", {"paciente_id": m["id"], "comprovante_path": caminho2})
    c2 = r.get("cobranca") or {}
    p.check(st == 200 and c2.get("status") == "aguardando_confirmacao" and c2.get("id") != c1["id"], "o aluno manda outro comprovante")
    st, r = B.pag("aluno2", "aluno_avisar_pix", {"paciente_id": m["id"], "comprovante_path": caminho2})
    p.check(st == 200 and r.get("atualizado") is True and r["cobranca"]["id"] == c2["id"], "mandar de novo troca o comprovante do pendente (não empilha)")
    st, r = B.pag("prof2", "prof_confirmar", {"cobranca_id": c2["id"], "lancar": True})
    p.check(st == 200 and r["cobranca"]["status"] == "paga" and r["cobranca"]["transacao_id"], f"professor confirma e lança a entrada ({st})")
    fin = B.sql_principal(f"select mensalidade_pago_ate::text as ate from {S}.pacientes where id = '{m['id']}'")[0]["ate"]
    env = B.sql_principal(f"select enviado_em::text as e, (enviado_em + interval '1 month')::text as esperado from {S}.cobrancas where id = '{c2['id']}'")[0]
    p.check(fin == env["esperado"], f"a cobertura anda 1 mês a partir do aviso do aluno ({fin})")
    st, r = B.rpc("aluno2", "financeiro_do_aluno")
    linha = (r or [{}])[0] if isinstance(r, list) else {}
    p.check(st == 200 and linha.get("pago_ate") and not linha.get("aguardando") and linha.get("tem_chave") is True,
            f"o resumo leve do app (financeiro_do_aluno) mostra pago e sem pendência ({st})")
    av = B.sql_principal(f"select titulo from {S}.avisos where destino_user_id = '{B.uid('aluno2')}' order by criado_em desc limit 2")
    p.check(any("confirmado" in a["titulo"] for a in av) and any("recusado" in a["titulo"] for a in B.sql_principal(
        f"select titulo from {S}.avisos where destino_user_id = '{B.uid('aluno2')}' order by criado_em desc limit 5")), "o aluno recebe no sino a recusa e a confirmação")


def caso_porfora() -> None:
    print("\n── porfora: pagamento feito por fora, remover e pausar (aluno2 · prof2)")
    m = B.matricula("aluno2")
    antes = B.sql_principal(f"select mensalidade_pago_ate::text as ate from {S}.pacientes where id = '{m['id']}'")[0]["ate"]
    st, r = B.pag("prof2", "prof_registrar", {"aluno": m["id"], "data": B.dias(1), "metodo": "dinheiro", "valor": 99.9})
    p.check(st == 400 and r.get("erro") == "data_futura", "data no futuro é recusada")
    st, r = B.pag("prof2", "prof_registrar", {"aluno": m["id"], "data": B.hoje(), "metodo": "dinheiro"})
    c = r.get("cobranca") or {}
    p.check(st == 200 and c.get("status") == "paga" and c.get("forma") == "manual" and c.get("metodo") == "dinheiro", f"registrado por fora (dinheiro) ({st})")
    depois = B.sql_principal(f"select mensalidade_pago_ate::text as ate from {S}.pacientes where id = '{m['id']}'")[0]["ate"]
    p.check(bool(depois) and (not antes or depois > antes), f"a cobertura soma mais 1 mês ({antes} → {depois})")
    st, r = B.pag("prof2", "prof_remover", {"cobranca_id": c["id"]})
    volta = B.sql_principal(f"select mensalidade_pago_ate::text as ate from {S}.pacientes where id = '{m['id']}'")[0]["ate"]
    p.check(st == 200 and volta == antes, f"remover o pagamento por fora recua a cobertura ({volta})")
    st, r = B.pag("prof2", "prof_pausar", {"aluno": m["id"], "pausar": True})
    s = status_aluno("aluno2")
    p.check(st == 200 and s["mensalidade"]["pausada"] is True, "cobrança parada ('não cobrar pelo app')")
    caminho = B.subir_comprovante("aluno2", m["id"])
    st, r = B.pag("aluno2", "aluno_avisar_pix", {"paciente_id": m["id"], "comprovante_path": caminho})
    p.check(st == 400 and r.get("erro") == "cobranca_pausada", f"com a cobrança parada o aluno não paga pelo app ({st} {r.get('erro')})")
    st, r = B.pag("prof2", "prof_pausar", {"aluno": m["id"], "pausar": False})
    p.check(st == 200 and status_aluno("aluno2")["mensalidade"]["pausada"] is False, "cobrança reativada")


def caso_acesso() -> None:
    print("\n── acesso: quem vê o quê")
    m = B.matricula("aluno2")
    st, r = B.pag("nutri-legado", "prof_aluno", {"aluno": m["id"]})
    p.check(st == 403 and r.get("erro") == "sem_permissao", f"profissional de outra conta não vê o aluno ({st} {r.get('erro')})")
    st, r = B.pag("aluno2", "prof_aluno", {"aluno": m["id"]})
    p.check(st == 403, f"o aluno não abre o Financeiro como profissional ({st})")
    st, r = B.pag("aluno2", "prof_resumo", {"conta_id": m["conta_id"]})
    p.check(st == 403, f"o aluno não lista a conta ({st})")
    cob = B.sql_principal(f"select id::text as id from {S}.cobrancas where paciente_id = '{m['id']}' and comprovante_path is not null and deleted_at is null limit 1")[0]["id"]
    st, r = B.pag("paciente", "aluno_comprovante", {"cobranca_id": cob})
    p.check(st in (403, 404), f"outro aluno não abre o comprovante ({st})")
    st, r = B.pag("prof2", "prof_aluno", {"aluno": m["treino_user_id"]})
    p.check(st == 200 and r["permissoes"]["mensalidade"] is True and any(c["comprovante"] for c in r["cobrancas"]), "o professor (dono) vê o Financeiro inteiro")
    st, r = B.rpc("aluno2", "mensalidade_recalcular", {"p_paciente": m["id"]})
    p.check(st in (401, 403, 404), f"o app não chama o recálculo direto ({st})")
    st, r = B.rest("aluno2", "GET", f"cobrancas?paciente_id=eq.{m['id']}&select=id")
    p.check(st == 200, f"(leitura direta das cobranças pelo aluno continua a regra de hoje: {st})")


def caso_nutri() -> None:
    print("\n── nutri: paciente do Nutri vê a cobrança e paga por Pix com comprovante (R16)")
    m = B.matricula("paciente")
    conta = m["conta_id"]
    limpar_testes(m["id"])
    chave = garantir_chave("nutri-legado", conta, "nutri.teste.claude@physiqnutri.app")
    p.check(bool(chave), "a nutri cadastra a chave Pix da conta")
    st, r = B.pag("nutri-legado", "prof_cobranca_criar", {"aluno": m["id"], "descricao": "Consulta W6 (teste)", "valor": "150", "vencimento": B.dias(-1)})
    c = r.get("cobranca") or {}
    p.check(st == 200 and c.get("status") == "aberta" and c.get("tipo") == "avulsa", f"a nutri cria a cobrança avulsa ({st})")
    st, r = B.rpc("paciente", "financeiro_do_aluno")
    linha = (r or [{}])[0] if isinstance(r, list) else {}
    p.check(any(x["id"] == c["id"] for x in linha.get("abertas", [])) and linha.get("bloquear_inadimplente") is True,
            "o paciente vê a cobrança vencida e a conta bloqueia o inadimplente (R15 — contas do Nutri: ligado)")
    s = status_aluno("paciente")
    p.check(any(x["id"] == c["id"] and x["status"] == "aberta" for x in s["cobrancas"]) and s["chave"], "Perfil › Pagamentos lista a cobrança com a chave Pix")
    caminho = B.subir_comprovante("paciente", m["id"])
    st, r = B.pag("paciente", "aluno_avisar_pix", {"paciente_id": m["id"], "comprovante_path": caminho, "cobranca_id": c["id"]})
    p.check(st == 200 and r["cobranca"]["id"] == c["id"] and r["cobranca"]["status"] == "aguardando_confirmacao", f"o paciente paga e manda o comprovante ({st})")
    st, r = B.rpc("paciente", "financeiro_do_aluno")
    p.check(not any(x["id"] == c["id"] for x in ((r or [{}])[0] if isinstance(r, list) else {}).get("abertas", [])), "aguardando a confirmação não conta como vencida")
    st, r = B.pag("nutri-legado", "prof_recusar", {"cobranca_id": c["id"], "motivo": "Não caiu na conta"})
    p.check(st == 200 and r["cobranca"]["status"] == "aberta" and r["cobranca"]["recusado_motivo"] == "Não caiu na conta", "recusa → a cobrança volta a ficar em aberto, com o motivo")
    caminho = B.subir_comprovante("paciente", m["id"])
    B.pag("paciente", "aluno_avisar_pix", {"paciente_id": m["id"], "comprovante_path": caminho, "cobranca_id": c["id"]})
    st, r = B.pag("nutri-legado", "prof_confirmar", {"cobranca_id": c["id"]})
    p.check(st == 200 and r["cobranca"]["status"] == "paga", "a nutri confirma → paga")
    st, r = B.rest("nutri-legado", "GET", f"cobrancas?paciente_id=eq.{m['id']}&deleted_at=is.null&select=id,status,descricao,valor,vencimento,pago_em&order=vencimento.desc")
    p.check(st == 200 and any(x["id"] == c["id"] and x["status"] == "paga" and x["pago_em"] for x in r), "o site antigo do Nutri lê a cobrança paga do jeito de sempre")
    st, r = B.rpc("nutri-legado", "cobrancas_atualizar_bloqueio")
    p.check(st == 200 and isinstance(r, dict), f"a trava antiga do Nutri recalcula sem erro ({st} {r})")


def caso_mp() -> None:
    print("\n── mp: conta liberada no Mercado Pago (sandbox) — aluno-calc · master")
    m = B.matricula("aluno-calc")
    limpar_testes(m["id"])
    B.sql_principal(f"update {S}.aluno_assinaturas set status = 'cancelled' where paciente_id = '{m['id']}' and status <> 'cancelled'")
    # liberar o Mercado Pago é do master (a tela dele é a W27; no principal só o Weslley é master): aqui, pelo banco
    B.sql_principal(f"update {S}.contas set recebimento_modo = 'mercadopago' where id = '{m['conta_id']}'")
    st, r = B.rest("master", "GET", f"contas?id=eq.{m['conta_id']}&select=recebimento_modo")
    p.check(st == 200 and r and r[0]["recebimento_modo"] == "mercadopago", f"conta liberada no Mercado Pago ({st} {r})")
    st, r = B.rest("prof2", "PATCH", f"contas?id=eq.{B.matricula('aluno2')['conta_id']}", {"recebimento_modo": "mercadopago"})
    volta = B.sql_principal(f"select recebimento_modo from {S}.contas where id = '{B.matricula('aluno2')['conta_id']}'")[0]["recebimento_modo"]
    p.check(volta == "pix_manual", f"o dono comum NÃO liga o Mercado Pago sozinho (a guarda segura: {volta})")
    st, r = B.pag("aluno-calc", "aluno_mp_pix", {"paciente_id": m["id"]})
    c = r.get("cobranca") or {}
    p.check(st == 200 and c.get("forma") == "mp" and c.get("status") == "aguardando_confirmacao" and c.get("pix_copia_cola"), f"Pix do MP gerado ({st} {r.get('erro')})")
    st, r2 = B.pag("aluno-calc", "aluno_mp_pix", {"paciente_id": m["id"]})
    p.check(st == 200 and r2.get("reutilizada") is True and r2["cobranca"]["id"] == c["id"], "o 2º pedido reaproveita o Pix aberto")
    mp_id = B.sql_principal(f"select mp_payment_id from {S}.cobrancas where id = '{c['id']}'")[0]["mp_payment_id"]
    if mp_id and not mp_id.startswith("sim-"):
        st, w, _ = B.http("POST", f"{B.PRINCIPAL_URL}/functions/v1/mp-webhook-aluno?schema=staging", {"type": "payment", "data": {"id": mp_id}})
        p.check(st == 200 and str((w or {}).get("resultado", "")).startswith("cobranca_aguardando"), f"o aviso do MP chega na mp-webhook-aluno ({st} {w})")
    st, r = B.pag("aluno-calc", "simular_aprovacao", {"cobranca_id": c["id"]})
    fin = B.sql_principal(f"select mensalidade_pago_ate is not null as ok from {S}.pacientes where id = '{m['id']}'")[0]["ok"]
    p.check(st == 200 and r["cobranca"]["status"] == "paga" and fin, "aprovação simulada (staging) → paga e a cobertura anda")
    st, r = B.pag("aluno-calc", "aluno_mp_pix", {"paciente_id": m["id"]})
    p.check(st == 400 and r.get("erro") == "ainda_coberto", "coberto não paga de novo")
    st, r = B.pag("master", "prof_cobranca_criar", {"aluno": m["id"], "descricao": "Avaliação extra W6 (teste)", "valor": 10, "vencimento": B.hoje()})
    av = r["cobranca"]
    st, r = B.pag("aluno-calc", "aluno_mp_cartao", {"paciente_id": m["id"], "cobranca_id": av["id"], "card_token": B.token_cartao("APRO"), "payment_method_id": "master"})
    p.check(st == 200 and r.get("status") == "paga", f"cartão de teste APRO paga a cobrança avulsa ({st} {r.get('status') or r.get('erro')})")
    st, r = B.pag("aluno-calc", "aluno_mp_cartao", {"paciente_id": m["id"], "cobranca_id": av["id"], "card_token": B.token_cartao("OTHE"), "payment_method_id": "master"})
    p.check(st == 400, f"cobrança já paga não paga de novo ({st} {r.get('erro')})")
    st, r = B.pag("master", "prof_reembolsar", {"cobranca_id": av["id"]})
    est = B.sql_principal(f"select status, reembolsado_em is not null as r, mp_status from {S}.cobrancas where id = '{av['id']}'")[0]
    p.check(st == 200 and est["status"] == "cancelada" and est["r"], f"reembolso no MP (sandbox) → estornada ({st} {est})")
    st, r = B.pag("aluno-calc", "aluno_mp_assinar", {"paciente_id": m["id"], "card_token": B.token_cartao("APRO")})
    p.check(st == 200 and r.get("assinatura") and (r.get("sandbox") or r["assinatura"]["status"] in ("authorized", "pending")),
            f"cobrança automática criada (no sandbox nasce pendente) ({st} {r.get('erro')})")
    st, r = B.pag("master", "prof_cancelar_assinatura", {"aluno": m["id"]})
    fim = B.sql_principal(f"select status from {S}.aluno_assinaturas where paciente_id = '{m['id']}' order by criado_em desc limit 1")[0]["status"]
    p.check(st == 200 and fim == "cancelled", f"o professor cancela a assinatura do aluno ({st} {fim})")
    st, r = B.rest("master", "PATCH", f"contas?id=eq.{m['conta_id']}", {"recebimento_modo": "pix_manual"})
    p.check(st == 200 and r and r[0]["recebimento_modo"] == "pix_manual", "o dono pode sair do Mercado Pago (voltar é com o master)")


def caso_antigo() -> None:
    print("\n── antigo: assinatura antiga do Calc avisa o mp-webhook do Treino → repasse → principal")
    if not B.saude_treino():
        p.check(False, "Banco do Treino fora do normal — parei (não reinicio nada)")
        return
    m = B.matricula("aluno-calc")
    treino = m["treino_user_id"]
    pre = f"w06sim{int(time.time())}"
    B.exec_treino(f"""insert into {S}.physiq_assinaturas (user_id, mp_preapproval_id, status, valor, contexto)
                      values ('{treino}', '{pre}', 'authorized', 150, 'aluno')""")
    r = B.sql_principal("select 1")  # noqa: F841
    import subprocess
    subprocess.run([sys.executable, str(Path(__file__).resolve().parents[2] / "scripts/virada/02_pagamentos_alunos.py"), "--schema", S, "--sem-arquivos"],
                   check=True, capture_output=True, text=True)
    ass = B.sql_principal(f"select id::text as id from {S}.aluno_assinaturas where mp_preapproval_id = '{pre}'")
    p.check(bool(ass), "o script 02 levou a assinatura antiga para o principal")
    st, pay = B.mp_teste("POST", "/v1/payments", {
        "transaction_amount": 150, "token": B.token_cartao("APRO"), "description": "Mensalidade PhysiqCalc (teste W6)", "installments": 1,
        "payment_method_id": "master", "payer": {"email": "comprador.physiqcalc@example.com"},  # o pagador genérico do sandbox (o mesmo do MP_TEST_PAYER_EMAIL)
        "external_reference": f"{S}:{treino}::aluno:mensal", "metadata": {"preapproval_id": pre}})
    p.check(st in (200, 201) and pay.get("status") == "approved", f"pagamento de teste da assinatura antiga ({st} {pay.get('status') or pay})")
    if st not in (200, 201):
        return
    mp_id = str(pay["id"])
    st, w, _ = B.http("POST", f"{B.TREINO_URL}/functions/v1/mp-webhook", {"type": "payment", "data": {"id": mp_id}})
    p.check(st == 200, f"o mp-webhook do Treino aceita o aviso ({st} {w})")
    no_treino = B.sql_treino(f"select status from {S}.physiq_pagamentos where mp_payment_id = '{mp_id}'")
    p.check(bool(no_treino) and no_treino[0]["status"] == "approved", "o Treino grava como sempre (nada se perde)")
    no_principal = B.sql_principal(f"select status, forma, mp_preapproval_id, origem, tipo from {S}.cobrancas where mp_payment_id = '{mp_id}'")
    p.check(bool(no_principal) and no_principal[0]["status"] == "paga" and no_principal[0]["mp_preapproval_id"] == pre and no_principal[0]["tipo"] == "mensalidade",
            f"o pagamento aparece no principal ({no_principal[:1]})")
    st, w, _ = B.http("POST", f"{B.TREINO_URL}/functions/v1/mp-webhook", {"type": "payment", "data": {"id": mp_id}})
    n = B.sql_principal(f"select count(*)::int as n from {S}.cobrancas where mp_payment_id = '{mp_id}'")[0]["n"]
    p.check(st == 200 and n == 1, f"o aviso repetido não duplica ({n})")
    # limpeza da massa de teste (a assinatura de mentira fica cancelada nos 2 bancos)
    B.exec_treino(f"update {S}.physiq_assinaturas set status = 'cancelled' where mp_preapproval_id = '{pre}'")
    B.sql_principal(f"update {S}.aluno_assinaturas set status = 'cancelled' where mp_preapproval_id = '{pre}'")


CASOS = {"pix": caso_pix, "porfora": caso_porfora, "acesso": caso_acesso, "nutri": caso_nutri, "mp": caso_mp, "antigo": caso_antigo}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--casos", default=",".join(CASOS))
    a = ap.parse_args()
    for nome in [c.strip() for c in a.casos.split(",") if c.strip()]:
        try:
            CASOS[nome]()
        except Exception as e:  # noqa: BLE001
            p.check(False, f"[{nome}] quebrou: {e!r}"[:400])
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
