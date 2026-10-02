#!/usr/bin/env python3
"""Physiq W27 — E2E de SERVIDOR do painel master no STAGING (só contas *.teste.claude — P26). Prova o "pronto quando" da spec:
o master CRIA conta, MUDA plano, ISENTA, AJUSTA vencimento, SUSPENDE, BLOQUEIA os alunos de uma conta e MOVE alunos, com efeito nos
2 bancos (principal + Banco do Treino pelo espelho), e o resto do 4.7: liberar, registrar pagamento, reenviar aviso, planos/teste,
aviso "o Physiq mudou" (liga/desliga só no staging), pratos e treinos prontos (W7b), senha nova do aluno do app (W8b), tornar master,
excluir conta com 0 alunos e os negativos (403 para quem não é master, 401 sem login).

  python3 e2e/w27/massa.py && python3 e2e/w27/api.py      (o massa.py --limpar no fim desfaz tudo e tira o master de teste)
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
q = B.q


def sqlp(s: str) -> list:
    return B.sql_principal(s)


def sqlt(s: str) -> list:
    return B.sql_treino(s)


def conta_row(cid: str) -> dict:
    return sqlp(f"select id::text, plano, faixa, situacao, teste_ate::text, vence_em::text, isenta_motivo, alunos_bloqueados_em::text,"
                f" alunos_bloqueados_msg, recebimento_modo from {S}.contas where id = '{cid}'")[0]


def prof_treino(conta: str) -> dict | None:
    t = B.treino_de(conta)
    if not t:
        return None
    r = sqlt(f"select id::text, status, nucleo_acesso_ate::text, acesso_liberado_ate::text, alunos_bloqueados_em::text, alunos_bloqueados_msg"
             f" from {S}.physiq_professores where id = '{t}'")
    return r[0] if r else None


def espelho() -> None:
    time.sleep(1.5)
    B.B5.processar_espelho()


def fn(nome: str, corpo: dict, conta: str | None = "w27-master") -> tuple[int, dict]:
    return B.funcao(nome, corpo, conta=conta)


def acao(cid: str, tipo: str, args: dict | None = None) -> tuple[int, dict]:
    return fn("master-contas", {"acao": "acao", "conta_id": cid, "tipo": tipo, "args": args or {}})


def main() -> int:
    B.saude_ok("o E2E de servidor da W27")
    hoje = sqlp("select (now() at time zone 'America/Sao_Paulo')::date::text as d")[0]["d"]
    mais = lambda n: sqlp(f"select ('{hoje}'::date + {n})::text as d")[0]["d"]  # noqa: E731

    # ── negativos: quem não é master (aluno de teste) e sem login ──
    for nome, corpo in (("master-contas", {"acao": "listar"}), ("master-financeiro", {"acao": "listar"}), ("master-planos", {"acao": "listar"})):
        st, r = fn(nome, corpo, conta="w27-aluno")
        p.check(st == 403 and r.get("erro") == "so_master", f"[negativo] {nome}: quem não é master recebe 403 so_master ({st} {r.get('erro')})")
        st, r = fn(nome, corpo, conta=None)
        p.check(st == 401, f"[negativo] {nome}: sem login recebe 401 ({st})")
    st, r = B.rpc("w27-aluno", "master_contas", {"p_filtros": {}})
    p.check(st == 200 and isinstance(r, dict) and r.get("erro") == "so_master", f"[negativo] RPC master_contas direto pelo aluno: so_master ({r})")

    # ── criar conta (N-8/N-22): A = outra área (Treino + Nutrição, f10, e-mail + senha); B = personal (Só Treino); C = vazia (excluir) ──
    criadas = {}
    for k, nome_conta, tipo, plano in (("w27-dono-a", B.CONTA_A, "outra_area", "treino_nutricao"), ("w27-dono-b", B.CONTA_B, "personal", "treino"),
                                       ("w27-dono-c", B.CONTA_C, "nutricionista", "nutricao")):
        if k == "w27-dono-c":
            B.EMAIL[k] = "w27.dono.c.teste.claude@physiqnutri.app"
            B.NOMES[k] = "Carla Vazia W27"
            B.CONTAS[k] = (B.EMAIL[k], B.B5.senha_de(k))
        existente = B.conta_id(nome_conta)
        if existente:
            criadas[k] = existente
            p.check(True, f"[criar] {nome_conta} já existia (rodada anterior)")
            continue
        st, r = fn("master-contas", {"acao": "criar", "email": B.EMAIL[k], "nome": B.NOMES[k], "nome_conta": nome_conta, "tipo": tipo,
                                     "plano": plano, "faixa": "f10", "modo": "senha", "senha": B.CONTAS[k][1]})
        p.check(st == 200 and r.get("ok") and r.get("login_criado") is True, f"[criar] {nome_conta}: conta + login com e-mail e senha ({st} {r.get('erro')})")
        criadas[k] = r.get("conta_id")
    ca, cb, cc = criadas["w27-dono-a"], criadas["w27-dono-b"], criadas["w27-dono-c"]
    a = conta_row(ca)
    p.check(a["situacao"] == "teste" and a["teste_ate"] == mais(14) and a["plano"] == "treino_nutricao",
            f"[criar] conta A em teste até hoje + 14 (regra do Sou profissional): {a['situacao']} {a['teste_ate']}")
    mem = sqlp(f"select papeis, status, codigo_convite from {S}.conta_membros where conta_id = '{ca}'")
    p.check(len(mem) == 1 and sorted(mem[0]["papeis"]) == ["dono", "nutricionista", "personal"] and mem[0]["status"] == "ativo"
            and (mem[0]["codigo_convite"] or "").startswith("PROF-"), f"[criar] membro dono + personal + nutri com código PROF-… ({mem})")
    st, r = fn("master-contas", {"acao": "criar", "email": B.EMAIL["w27-dono-a"], "nome": "Xavier Teste", "tipo": "personal", "plano": "treino", "faixa": "f10",
                                 "modo": "google"})
    p.check(st == 400 and r.get("erro") == "ja_tem_conta", f"[criar] de novo para quem já é profissional: ja_tem_conta ({st} {r.get('erro')})")
    st, r = fn("master-contas", {"acao": "criar", "email": "pessoa.real@gmail.com", "nome": "Real", "tipo": "personal", "plano": "treino", "faixa": "f10",
                                 "modo": "google"})
    p.check(st == 400 and r.get("erro") == "conta_real_no_staging", f"[criar] e-mail real no staging recusado sem criar login ({r.get('erro')})")
    p.check(not sqlp("select 1 from auth.users where lower(email) = 'pessoa.real@gmail.com'"), "[criar] nenhum login real criado")
    # o dono entra (trocar-token): o Treino recebe o professor com o acesso da conta (teste até)
    for k in ("w27-dono-a", "w27-dono-b", "w27-master"):
        st, r = B.B5.trocar_token(k)
        p.check(st == 200, f"[Treino] troca de token de {k}: {st} {r.get('erro') if isinstance(r, dict) else ''}")
        time.sleep(1.2)
    espelho()
    pa = prof_treino("w27-dono-a")
    p.check(bool(pa) and pa["nucleo_acesso_ate"] == mais(14) and pa["status"] == "ativo",
            f"[2 bancos] criar: o Treino tem o professor da conta A com acesso até o fim do teste ({pa})")

    # ── mover alunos: pessoa sem conta → conta A (entra pela matricular_na_conta); depois A → B com os dados ──
    ua = B.uid("w27-aluno")
    ja = sqlp(f"select id::text, conta_id::text from {S}.pacientes where user_id = '{ua}' and deleted_at is null")
    if not ja:
        st, r = fn("master-contas", {"acao": "mover", "usuarios": [ua], "pacientes": [], "conta_id": ca, "personal_id": B.uid("w27-dono-a"),
                                     "nutricionista_id": B.uid("w27-dono-a")})
        p.check(st == 200 and r.get("movidos") == 1, f"[mover] pessoa sem conta entra na conta A ({st} {r})")
    st, r = B.funcao("alunos", {"acao": "criar", "conta_id": ca, "dados": {"nome": "Aluno Sem Login W27", "modulos": ["treino"],
                                                                         "personal_id": B.uid("w27-dono-a")}}, conta="w27-dono-a")
    p.check(st == 200 or (st == 400 and r.get("erro") in ("paciente_email_repetido",)), f"[mover] dono A cria um aluno sem login ({st} {r.get('erro')})")
    mats = sqlp(f"select id::text, nome, user_id::text from {S}.pacientes where conta_id = '{ca}' and deleted_at is null")
    p.check(len(mats) >= 2, f"[mover] conta A com 2 alunos ({[m['nome'] for m in mats]})")
    st, r = B.B5.trocar_token("w27-aluno")
    p.check(st == 200, f"[Treino] troca de token do aluno (agora com Treino na conta A): {st}")
    espelho()
    ta, tb, tal = B.treino_de("w27-dono-a"), B.treino_de("w27-dono-b"), B.treino_de("w27-aluno")
    perf = sqlt(f"select professor_id::text, conta_id::text from {S}.physiq_profiles where id = '{tal}'")
    p.check(bool(perf) and perf[0]["professor_id"] == ta and perf[0]["conta_id"] == ca, f"[2 bancos] aluno na conta A: Treino com professor = dono A ({perf})")
    st, r = fn("master-contas", {"acao": "mover", "pacientes": [m["id"] for m in mats], "usuarios": [], "conta_id": cb, "personal_id": B.uid("w27-dono-b")})
    p.check(st == 200 and r.get("movidos") == len(mats) and not r.get("erros"), f"[mover] {len(mats)} alunos de A para B ({st} {r})")
    depois = sqlp(f"select count(*)::int as n from {S}.pacientes where id = any(array[{','.join(q(m['id']) for m in mats)}]::uuid[]) and conta_id = '{cb}'"
                  f" and personal_id = '{B.uid('w27-dono-b')}' and nutricionista_id is null")
    p.check(depois[0]["n"] == len(mats), f"[mover] as MESMAS matrículas agora na conta B, personal = dono B, sem nutri (Só Treino) ({depois})")
    espelho()
    perf = sqlt(f"select professor_id::text, conta_id::text from {S}.physiq_profiles where id = '{tal}'")
    p.check(bool(perf) and perf[0]["professor_id"] == tb and perf[0]["conta_id"] == cb, f"[2 bancos] mover: Treino com professor = dono B e conta B ({perf})")

    # ── mudar plano: A → Só Nutrição f30 (o personal perde o acesso de professor no Treino) e volta ──
    st, r = acao(ca, "plano", {"plano": "nutricao", "faixa": "f30"})
    p.check(st == 200 and r.get("conta", {}).get("plano") == "nutricao", f"[plano] A → Só Nutrição 11–30 ({st} {r.get('erro')})")
    espelho()
    pa = prof_treino("w27-dono-a")
    p.check(bool(pa) and not pa["nucleo_acesso_ate"] and not pa["acesso_liberado_ate"], f"[2 bancos] sem Treino no plano: o personal perde o acesso no Treino ({pa})")
    st, r = acao(ca, "plano", {"plano": "treino_nutricao", "faixa": "f10"})
    p.check(st == 200 and r.get("conta", {}).get("plano") == "treino_nutricao", f"[plano] A volta para Treino + Nutrição 1–10 ({st})")
    espelho()
    pa = prof_treino("w27-dono-a")
    p.check(bool(pa) and pa["nucleo_acesso_ate"] == mais(14), f"[2 bancos] o acesso no Treino volta (até o fim do teste) ({pa})")
    # descer de faixa sem caber: B tem os alunos; muda B para f10 ok (2 alunos) — recusa só acima do limite (testado na unidade)
    st, r = acao(ca, "plano", {"plano": "premium", "faixa": "f10"})
    p.check(st == 400 and r.get("erro") == "plano_invalido", f"[plano] plano inválido recusado ({r.get('erro')})")

    # ── isentar (R18) com motivo: B isenta → Treino sem limite ──
    st, r = acao(cb, "isentar", {"motivo": ""})
    p.check(st == 400 and r.get("erro") == "motivo_obrigatorio", f"[isentar] sem motivo recusado ({r.get('erro')})")
    st, r = acao(cb, "isentar", {"motivo": "Parceria de teste W27"})
    b = conta_row(cb)
    p.check(st == 200 and b["situacao"] == "isenta" and b["isenta_motivo"] == "Parceria de teste W27", f"[isentar] B isenta com motivo ({b['situacao']})")
    espelho()
    pb = prof_treino("w27-dono-b")
    p.check(bool(pb) and pb["nucleo_acesso_ate"] == "2999-12-31", f"[2 bancos] isenta: o Treino libera sem limite ({pb})")

    # ── ajustar vencimento e liberar: A ──
    st, r = acao(ca, "vencimento", {"data": mais(40)})
    a = conta_row(ca)
    p.check(st == 200 and a["vence_em"] == mais(40) and a["situacao"] == "ativa", f"[vencimento] A vale até hoje + 40 e fica em dia ({a['vence_em']} {a['situacao']})")
    espelho()
    pa = prof_treino("w27-dono-a")
    p.check(bool(pa) and pa["nucleo_acesso_ate"] == mais(40) and pa["acesso_liberado_ate"] == mais(40), f"[2 bancos] vencimento: o Treino segue o novo acesso ({pa})")
    st, r = acao(ca, "liberar", {"data": mais(30), "motivo": "teste"})
    p.check(st == 400 and r.get("erro") == "ja_tem_acesso", f"[liberar] nunca encurta ({r.get('erro')})")
    st, r = acao(ca, "liberar", {"data": mais(60), "motivo": "Cortesia de teste W27"})
    p.check(st == 200 and conta_row(ca)["vence_em"] == mais(60), f"[liberar] A liberada até hoje + 60 com motivo ({st})")

    # ── suspender e reativar: A ──
    st, r = acao(ca, "suspender", {"motivo": "Teste W27"})
    p.check(st == 200 and conta_row(ca)["situacao"] == "suspensa", f"[suspender] A suspensa ({st})")
    espelho()
    pa = prof_treino("w27-dono-a")
    p.check(bool(pa) and pa["status"] == "suspenso" and not pa["nucleo_acesso_ate"], f"[2 bancos] suspensa: o professor fica suspenso no Treino ({pa})")
    st, r = acao(ca, "reativar")
    p.check(st == 200 and conta_row(ca)["situacao"] == "ativa", f"[reativar] A volta a ativa ({st})")
    espelho()
    pa = prof_treino("w27-dono-a")
    p.check(bool(pa) and pa["status"] == "ativo" and pa["nucleo_acesso_ate"] == mais(60), f"[2 bancos] reativada: o Treino volta ao acesso ({pa})")

    # ── bloquear os alunos da conta B (com mensagem) e desbloquear ──
    msg = "Acesso pausado pelo master (teste W27)."
    st, r = acao(cb, "bloquear_alunos", {"mensagem": msg})
    b = conta_row(cb)
    p.check(st == 200 and b["alunos_bloqueados_em"] and b["alunos_bloqueados_msg"] == msg, f"[bloquear] alunos de B bloqueados com a mensagem ({st})")
    espelho()
    pb = prof_treino("w27-dono-b")
    p.check(bool(pb) and pb["alunos_bloqueados_em"] and pb["alunos_bloqueados_msg"] == msg, f"[2 bancos] o Treino recebe o bloqueio dos alunos ({pb})")
    st, sit = B.rpc("w27-aluno", "minha_situacao", {})
    mats_sit = (sit or {}).get("matriculas", []) if isinstance(sit, dict) else []
    p.check(any(m.get("conta_alunos_bloqueados_em") for m in mats_sit), "[2 bancos] o app do aluno vê a conta bloqueada (minha_situacao → trava Acesso pausado)")
    st, r = acao(cb, "desbloquear_alunos")
    p.check(st == 200 and not conta_row(cb)["alunos_bloqueados_em"], f"[desbloquear] alunos de B liberados ({st})")
    espelho()
    pb = prof_treino("w27-dono-b")
    p.check(bool(pb) and not pb["alunos_bloqueados_em"], f"[2 bancos] o Treino tira o bloqueio dos alunos ({pb})")

    # ── registrar pagamento feito por fora (a regra do Pix: +1 mês a partir do maior entre o vencimento e hoje) ──
    antes = conta_row(ca)["vence_em"]
    st, r = fn("master-financeiro", {"acao": "registrar_pagamento", "conta_id": ca, "valor": 59.9, "meses": 1, "descricao": "Transferência teste W27"})
    esperado = sqlp(f"select ('{antes}'::date + interval '1 month')::date::text as d")[0]["d"]
    p.check(st == 200 and r.get("vence_em") == esperado and r.get("aplicada") is True, f"[pagamento] +1 mês: {antes} → {r.get('vence_em')} (esperado {esperado})")
    fat = sqlp(f"select status, forma, tipo, valor::text from {S}.conta_faturas where id = {q(r.get('fatura_id'))}")
    p.check(bool(fat) and fat[0]["status"] == "approved" and fat[0]["forma"] == "manual", f"[pagamento] fatura manual aprovada ({fat})")
    st, r = fn("master-financeiro", {"acao": "registrar_pagamento", "conta_id": ca, "valor": 0, "meses": 1})
    p.check(st == 400 and r.get("erro") == "valor_invalido", f"[pagamento] valor 0 recusado ({r.get('erro')})")
    espelho()
    pa = prof_treino("w27-dono-a")
    p.check(bool(pa) and pa["nucleo_acesso_ate"] == esperado, f"[2 bancos] pagamento: o Treino segue o novo vencimento ({pa})")

    # ── reenviar aviso (sino do dono; nenhum e-mail) ──
    st, r = fn("master-financeiro", {"acao": "reenviar_aviso", "conta_id": ca})
    av = sqlp(f"select titulo, link from {S}.avisos where destino_user_id = '{B.uid('w27-dono-a')}' order by criado_em desc limit 1")
    p.check(st == 200 and bool(av) and "Physiq" in av[0]["titulo"] and av[0]["link"] == "/painel/configuracoes/plano", f"[aviso] no sino do dono A ({av})")
    st, r = fn("master-financeiro", {"acao": "cancelar_assinatura", "conta_id": ca})
    p.check(st == 400 and r.get("erro") == "sem_assinatura", f"[cancelar] sem assinatura: recusa sem mexer no Mercado Pago ({r.get('erro')})")

    # ── legado: ações de cobrança recusadas ("Cobrança legada até a virada") ──
    leg = sqlp(f"select id::text from {S}.contas where origem = 'legado_calc' limit 1")
    if leg:
        st, r = acao(leg[0]["id"], "isentar", {"motivo": "teste"})
        p.check(st == 400 and r.get("erro") == "cobranca_legada", f"[legado] isentar conta legado Calc recusado: cobrança legada ({r.get('erro')})")

    # ── visão geral, contas, financeiro, integrações (leitura) ──
    st, vg = fn("master-contas", {"acao": "visao_geral"})
    total = sqlp(f"select count(*)::int as n from {S}.contas where origem <> 'app'")[0]["n"]
    p.check(st == 200 and vg["contas"]["total"] == total, f"[visão geral] contas = banco ({vg.get('contas', {}).get('total')} = {total})")
    st, lc = fn("master-contas", {"acao": "listar", "filtros": {"busca": "W27"}})
    p.check(st == 200 and {c["nome"] for c in lc["contas"]} >= {B.CONTA_A, B.CONTA_B, B.CONTA_C}, f"[contas] busca W27 acha as 3 contas ({[c['nome'] for c in lc.get('contas', [])]})")
    st, fi = fn("master-financeiro", {"acao": "listar", "filtro": "isentas"})
    p.check(st == 200 and any(c["id"] == cb for c in fi["contas"]), "[financeiro] filtro Isentas mostra B")
    st, ig = fn("master-contas", {"acao": "integracoes"})
    p.check(st == 200 and any(c["id"] == ca for c in ig["contas"]), "[integrações] A na lista")
    st, r = acao(ca, "recebimento", {"modo": "mercadopago"})
    p.check(st == 200 and conta_row(ca)["recebimento_modo"] == "mercadopago", "[integrações] o master liga o Mercado Pago da conta A")
    acao(ca, "recebimento", {"modo": "pix_manual"})
    st, al = fn("master-contas", {"acao": "alunos", "filtros": {"modo": "app"}})
    p.check(st == 200 and any((x.get("email") or "") == B.EMAIL["w27-app"] for x in al["alunos"]), "[alunos] filtro Do app mostra a aluna do app")
    st, al = fn("master-contas", {"acao": "alunos", "filtros": {"modo": "p7"}})
    p.check(st == 200 and isinstance(al.get("alunos"), list), f"[alunos] casos em 2 contas (P7) listados ({al.get('total')})")

    # ── planos: preço por módulo × faixa com histórico (e volta) ──
    preco = sqlp(f"select valor_mensal::text, valor_anual::text from {S}.plano_precos where plano = 'treino' and faixa = 'f10'")[0]
    hist0 = sqlp(f"select count(*)::int as n from {S}.plano_precos_hist")[0]["n"]
    st, r = fn("master-planos", {"acao": "salvar_preco", "plano": "treino", "faixa": "f10", "valor_mensal": 41.9, "valor_anual": 419})
    p.check(st == 200 and sqlp(f"select valor_mensal::text as v from {S}.plano_precos where plano = 'treino' and faixa = 'f10'")[0]["v"] == "41.90",
            f"[planos] Só Treino 1–10 → R$ 41,90 ({st})")
    fn("master-planos", {"acao": "salvar_preco", "plano": "treino", "faixa": "f10", "valor_mensal": float(preco["valor_mensal"]), "valor_anual": float(preco["valor_anual"])})
    p.check(sqlp(f"select count(*)::int as n from {S}.plano_precos_hist")[0]["n"] == hist0 + 2, "[planos] histórico ganhou as 2 mudanças (e o preço voltou)")
    st, r = fn("master-planos", {"acao": "salvar_config", "chave": "teste_dias", "valor": 15})
    p.check(st == 200, "[planos] dias de teste → 15")
    fn("master-planos", {"acao": "salvar_config", "chave": "teste_dias", "valor": 14})

    # ── aviso "o Physiq mudou": liga/desliga (SÓ no staging) ──
    av0 = sqlp(f"select valor from {S}.app_config where chave = 'aviso_mudanca'")[0]["valor"]
    st, r = fn("master-planos", {"acao": "salvar_config", "chave": "aviso_mudanca", "valor": {"nutri": {"ativo": True}}})
    av1 = sqlp(f"select valor from {S}.app_config where chave = 'aviso_mudanca'")[0]["valor"]
    p.check(st == 200 and av1["nutri"]["ativo"] is True and av1["calc"] == av0["calc"] and av1["versao"] == av0["versao"], "[aviso] liga para o Nutri (o resto igual)")
    fn("master-planos", {"acao": "salvar_config", "chave": "aviso_mudanca", "valor": {"nutri": {"ativo": av0["nutri"]["ativo"]}}})
    av2 = sqlp(f"select valor from {S}.app_config where chave = 'aviso_mudanca'")[0]["valor"]
    p.check(av2 == av0, "[aviso] desliga de novo: igual ao de antes")
    st, r = fn("master-planos", {"acao": "salvar_config", "chave": "aviso_mudanca", "valor": {"calc": {"titulo": "x"}}})
    p.check(st == 400 and r.get("erro") == "valor_invalido", "[aviso] título curto demais recusado")

    # ── pratos prontos (W7b): cria um prato de teste com 2 itens da TACO, edita e tira do catálogo ──
    taco = sqlp(f"select id::text from {S}.alimentos where fonte = 'taco' and deleted_at is null order by codigo limit 2")
    st, r = fn("master-planos", {"acao": "prato_salvar", "prato": {"codigo": "w27-teste-prato", "nome": "Prato Teste W27", "refeicao": "almoco",
                                 "objetivos": ["manter"], "itens": [{"alimento_id": taco[0]["id"], "quantidade_g": 100}, {"alimento_id": taco[1]["id"], "quantidade_g": 50}]}})
    pid = r.get("id")
    p.check(st == 200 and bool(pid), f"[pratos] prato de teste criado ({st} {r.get('erro')})")
    st, r = fn("master-planos", {"acao": "prato_salvar", "prato": {"id": pid, "nome": "Prato Teste W27 editado", "refeicao": "jantar", "objetivos": ["manter"],
                                 "ativo": False, "itens": [{"alimento_id": taco[0]["id"], "quantidade_g": 120}]}})
    pr = sqlp(f"select nome, refeicao, ativo, (select count(*) from {S}.pratos_prontos_itens i where i.prato_id = pp.id)::int as itens from {S}.pratos_prontos pp where id = {q(pid)}")
    p.check(st == 200 and pr[0]["nome"].endswith("editado") and pr[0]["ativo"] is False and pr[0]["itens"] == 1, f"[pratos] editado e fora do catálogo ({pr})")
    sqlp(f"delete from {S}.pratos_prontos where id = {q(pid)}")

    # ── treinos prontos (W7b, Banco do Treino): o master grava pela RLS; o aluno não ──
    st, tk = B.B5.trocar_token("w27-master")
    tok_m = tk.get("access_token") if isinstance(tk, dict) else None
    ex = sqlt(f"select id::text from {S}.tb_exercicios where professor_id is null order by nome limit 1")[0]["id"]
    cab = lambda tok: {"apikey": B.anon(B.TREINO_REF), "Authorization": f"Bearer {tok}", "Content-Profile": S, "Accept-Profile": S, "Prefer": "return=representation"}  # noqa: E731
    st, r, _ = B.http("POST", f"{B.B5.API_T}/rest/v1/physiq_treinos_prontos", {"codigo": "w27-teste-treino", "nome": "Treino Teste W27", "objetivo": "manter",
                      "nivel": "iniciante", "dias_por_semana": 1, "divisao": "A", "ativo": False}, cab(tok_m))
    tid = r[0]["id"] if st in (200, 201) and isinstance(r, list) and r else None
    p.check(bool(tid), f"[treinos prontos] o master grava no Banco do Treino ({st} {str(r)[:120]})")
    if tid:
        st, g, _ = B.http("POST", f"{B.B5.API_T}/rest/v1/physiq_treinos_prontos_grupos", {"treino_id": tid, "letra": "A", "nome": "Treino A", "dias": ["SEG"]}, cab(tok_m))
        gid = g[0]["id"] if st in (200, 201) and isinstance(g, list) and g else None
        st2, e, _ = B.http("POST", f"{B.B5.API_T}/rest/v1/physiq_treinos_prontos_exercicios", {"grupo_id": gid, "exercicio_id": ex, "series": 3, "reps": "12"}, cab(tok_m))
        p.check(bool(gid) and st2 in (200, 201), "[treinos prontos] divisão e exercício gravados pelo master")
    st, tka = B.B5.trocar_token("w27-aluno")
    tok_a = tka.get("access_token") if isinstance(tka, dict) else None
    st, r, _ = B.http("POST", f"{B.B5.API_T}/rest/v1/physiq_treinos_prontos", {"codigo": "w27-teste-aluno", "nome": "Não pode", "objetivo": "manter",
                      "nivel": "iniciante", "dias_por_semana": 1, "divisao": "A"}, cab(tok_a))
    p.check(st in (401, 403), f"[treinos prontos] o aluno NÃO grava (RLS) ({st})")
    if tid:
        B.http("DELETE", f"{B.B5.API_T}/rest/v1/physiq_treinos_prontos?id=eq.{tid}", None, cab(tok_m))
        p.check(not sqlt(f"select 1 from {S}.physiq_treinos_prontos where id = '{tid}'"), "[treinos prontos] o master apaga o de teste")

    # ── senha nova da aluna do app (W8b: provisória + destrava; mesma RPC do card Acesso do aluno) ──
    mat_app = sqlp(f"""select p.id::text from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
                       where p.user_id = '{B.uid('w27-app')}' and c.origem = 'app' and p.deleted_at is null limit 1""")[0]["id"]
    nova = B.B5.senha_de("w27-app-nova")
    st, r = B.rpc("w27-master", "paciente_redefinir_senha", {"p_paciente_id": mat_app, "p_senha": nova})
    p.check(st in (200, 204), f"[senha] o master cria a senha nova da aluna do app ({st} {r})")
    st2, sess, _ = B.http("POST", f"{B.API_P}/auth/v1/token?grant_type=password", {"email": B.EMAIL["w27-app"], "password": nova}, {"apikey": B.anon(B.PRINCIPAL_REF)})
    meta = (sess or {}).get("user", {}).get("app_metadata", {}) if isinstance(sess, dict) else {}
    p.check(st2 == 200 and meta.get("senha_provisoria") is True, f"[senha] entra com a senha nova, marcada provisória (Crie a sua senha) ({st2})")
    B.CONTAS["w27-app"] = (B.EMAIL["w27-app"], nova)
    Path.home().joinpath(".physiq-teste-w27-app").write_text(nova, encoding="utf-8")

    # ── tornar master (N-22): dono B vira master nos 2 bancos (e o teste desfaz à mão) ──
    ub = B.uid("w27-dono-b")
    st, r = fn("master-contas", {"acao": "tornar_master", "user_id": ub})
    p.check(st == 200 and r.get("master") is True, f"[master] dono B vira master ({st} {r.get('erro')})")
    st, r = fn("master-contas", {"acao": "tornar_master", "user_id": B.uid("w27-master")})
    p.check(st == 403 and r.get("erro") == "nao_pode_a_si_mesmo", "[master] não em si mesmo")
    espelho()
    st, tu = B.admin_auth(B.TREINO_REF, "GET", f"users/{B.treino_de('w27-dono-b')}")
    p.check((tu or {}).get("app_metadata", {}).get("role") == "master", f"[2 bancos] o Treino recebe o papel master ({(tu or {}).get('app_metadata')})")
    B.tirar_master("w27-dono-b")
    B.admin_auth(B.TREINO_REF, "PUT", f"users/{B.treino_de('w27-dono-b')}", {"app_metadata": {"role": "professor"}})
    p.check(not B.sql_principal(f"select 1 from auth.users where id = '{ub}' and raw_app_meta_data ->> 'role' = 'master'"), "[master] o teste desfez o master do dono B")

    # ── excluir conta (só com 0 alunos): A tem 0 alunos (moveu); C vazia ──
    st, r = acao(cb, "excluir")
    p.check(st == 400 and r.get("erro") == "tem_alunos", f"[excluir] B com alunos: recusa ({r.get('erro')})")
    st, r = acao(cc, "excluir")
    p.check(st == 200 and r.get("excluida") is True and not sqlp(f"select 1 from {S}.contas where id = '{cc}'"), f"[excluir] C (0 alunos) excluída ({st})")
    p.check(not sqlp(f"select 1 from {S}.conta_membros where conta_id = '{cc}'"), "[excluir] membros de C saíram junto")
    # o login da C (de teste) sai
    uc = B.uid("w27-dono-c")
    if uc:
        B.admin_auth(B.PRINCIPAL_REF, "DELETE", f"users/{uc}")

    B.saude_ok("o fim do E2E de servidor")
    return p.fim()


if __name__ == "__main__":
    raise SystemExit(main())
