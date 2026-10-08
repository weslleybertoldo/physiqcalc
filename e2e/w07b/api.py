#!/usr/bin/env python3
"""Physiq W7b — E2E de SERVIDOR do aluno sem profissional (staging, só contas de TESTE; em série — o Banco do Treino é uma VM
Nano: /health antes de cada bloco e pausa entre as trocas de token).

  entrar       Boas-vindas pela função: objetivo/plano inválidos (negativo), entra com 7 dias grátis, 2ª vez não duplica,
               minha_situacao / meu_plano_app / financeiro_do_aluno / aviso no sino, e quem tem profissional é recusado
  pratos       pratos prontos pelo objetivo (Treino + Alimentação) · só Treino e aluno com profissional recusados
  treinos      catálogo dos treinos prontos no Banco do Treino (logado lê; sem login não) + o espelho (conta do app, sem professor)
  plano        trocar de plano (Treino ⇄ Treino + Alimentação) pela pagamentos-aluno; aluno com profissional recusado
  cobranca     pagar no teste (a cobertura começa no fim do teste) · teste que acabou (vencido) → Pix (sandbox) → em dia
  vincular     assinatura do app (checkout do sandbox) → prévia avisa → vincula ao Lucas → matrícula do app encerra e a
               assinatura é CANCELADA no Mercado Pago (conferido na API do MP)
  removido     o Lucas tira o aluno da lista no painel antigo (admin-delete-user do Treino) → volta ao app com 7 dias + aviso;
               o modo servidor sem o segredo é recusado
  master       master_alunos_do_app: aluno comum recusado; o master de teste (perfil master só no staging, desfeito no fim) vê
Uso: python3 e2e/w07b/api.py [entrar|pratos|treinos|plano|cobranca|vincular|removido|master|tudo]
"""
from __future__ import annotations

import datetime as dt
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

p = B.p
S = "staging"
B.ESTADO["schema"] = S


def sp_hoje() -> dt.date:
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date()


def fim_esperado() -> str:
    """O último instante do dia (SP) hoje + 7 — em UTC (SP = UTC-3 sem horário de verão)."""
    d = sp_hoje() + dt.timedelta(days=8)
    return (dt.datetime(d.year, d.month, d.day, 3, 0, 0, tzinfo=dt.timezone.utc) - dt.timedelta(seconds=1)).strftime("%Y-%m-%d %H:%M:%S")


def ts(texto: str | None) -> dt.datetime | None:
    if not texto:
        return None
    return dt.datetime.fromisoformat(texto.replace("Z", "+00:00").replace(" ", "T"))


def entrar_app(conta: str, objetivo: str, plano: str) -> dict:
    # hml-12 (H-30): a de 5 argumentos (data de adulto + o consentimento de saúde da versão do app, origem site) — com a versão dos
    # textos ligada no banco (o staging), a de 2 devolve atualize_o_app; as recusas de objetivo e plano vêm antes, iguais
    st, r = B.rpc(B.token(conta), "entrar_sem_profissional", B.B5.args_sem_profissional(objetivo, plano))
    assert st == 200 and isinstance(r, dict), (conta, st, r)
    return r


def pag(conta: str, acao: str, corpo: dict | None = None) -> tuple[int, dict]:
    st, r = B.funcao(B.token(conta), "pagamentos-aluno", {"acao": acao, **(corpo or {})})
    return st, (r if isinstance(r, dict) else {"_bruto": r})


def mp_teste() -> str:
    return Path.home().joinpath(".physiq-mp-test").read_text().strip()


def preapproval(pid: str) -> dict:
    st, r, _ = B.http("GET", f"https://api.mercadopago.com/preapproval/{pid}", None, {"Authorization": f"Bearer {mp_teste()}"})
    return r if st == 200 and isinstance(r, dict) else {"_status": st, "_r": r}


def saude() -> None:
    if not B.saude_treino():
        raise SystemExit("Treino lento/instável — parei (nada de restart aqui)")


# ───────────────────────────── casos ─────────────────────────────

def caso_entrar() -> None:
    print("\n== entrar sem profissional (Boas-vindas)")
    c = "w7b-sozinho"
    r = entrar_app(c, "xpto", "app_treino")
    p.check(r.get("ok") is False and r.get("erro") == "objetivo_invalido", f"objetivo inválido → recusado ({r})")
    r = entrar_app(c, "emagrecer", "app_nao_existe")
    p.check(r.get("ok") is False and r.get("erro") == "plano_invalido", f"plano inválido → recusado ({r})")
    p.check(B.app_da(c) is None, "nada criado nas recusas")
    r = entrar_app(c, "emagrecer", "app_treino_alimentacao")
    p.check(r.get("ok") is True and r.get("ja_era") is False, f"entrou no app ({r})")
    fim = ts(r.get("teste_ate"))
    p.check(fim is not None and fim.strftime("%Y-%m-%d %H:%M:%S") == fim_esperado(), f"7 dias grátis: até o fim do dia hoje + 7 em SP ({r.get('teste_ate')} = {fim_esperado()} UTC)")
    r2 = entrar_app(c, "emagrecer", "app_treino_alimentacao")
    n = B.sql_principal(f"select count(*)::int n from {S}.pacientes where user_id = '{B.uid(c)}' and deleted_at is null")[0]["n"]
    p.check(r2.get("ok") is True and r2.get("ja_era") is True and n == 1, f"2ª vez não duplica (ja_era, {n} matrícula)")
    m = B.app_da(c)
    p.check(m and m["plano"] == "app_treino_alimentacao" and m["valor"] == "49.90" and m["objetivo_app"] == "emagrecer" and ts(m["pago_ate"]) == fim,
            f"matrícula do app: plano, valor da tabela, objetivo e a cobertura = o teste ({m})")
    st, s = B.rpc(B.token(c), "minha_situacao", {})
    mats = [x for x in (s or {}).get("matriculas", []) if x.get("app")]
    p.check(st == 200 and s.get("sem_nada") is False and s.get("precisa_treino") is True and sorted(s.get("modulos_aluno", [])) == ["nutricao", "treino"]
            and len(mats) == 1 and mats[0].get("app_plano") == "app_treino_alimentacao" and mats[0].get("objetivo_app") == "emagrecer" and mats[0].get("teste_ate"),
            f"minha_situacao: aluno do app com Treino + Nutrição, precisa do Treino ({s.get('modulos_aluno')}, {mats[:1]})")
    st, mp = B.rpc(B.token(c), "meu_plano_app", {})
    precos = sorted((x["codigo"], float(x["valor"])) for x in (mp or {}).get("planos", []))
    p.check(st == 200 and precos == [("app_treino", 29.9), ("app_treino_alimentacao", 49.9)] and mp.get("teste_dias") == 7
            and (mp.get("matricula") or {}).get("ativo") is True and mp.get("com_profissional") is False,
            f"meu_plano_app: os 2 planos com os preços do banco e os 7 dias ({precos})")
    st, f = B.rpc(B.token(c), "financeiro_do_aluno", {})
    fa = [x for x in (f or []) if x.get("app")]
    p.check(st == 200 and len(fa) == 1 and fa[0]["profissional"] == "Physiq" and fa[0]["bloquear_inadimplente"] is True
            and fa[0]["recebimento_modo"] == "mercadopago" and fa[0]["teste_ate"] and fa[0]["plano_codigo"] == "app_treino_alimentacao",
            f"financeiro_do_aluno: Physiq recebe, MP, trava ligada, o teste ({fa[:1]})")
    av = B.sql_principal(f"select titulo, link from {S}.avisos where destino_user_id = '{B.uid(c)}' order by criado_em desc limit 1")
    p.check(av and av[0]["link"] == "/perfil/meu-plano" and "grátis até" in av[0]["titulo"], f"aviso no sino ({av})")
    # quem tem profissional não entra no app
    r = entrar_app("w7-aluno", "manter", "app_treino")
    p.check(r.get("ok") is False and r.get("erro") == "com_profissional", f"aluno com profissional → recusado ({r})")


def caso_pratos() -> None:
    print("\n== pratos prontos pelo objetivo")
    st, r = B.rpc(B.token("w7b-sozinho"), "pratos_prontos_do_app", {})
    pr = (r or {}).get("pratos", []) if isinstance(r, dict) else []
    cafe = next((x for x in pr if x["codigo"] == "emagrecer-cafe-ovos-pao-mamao"), None)
    p.check(st == 200 and r.get("ok") and r.get("objetivo") == "emagrecer" and len(pr) == 8 and cafe and int(cafe["kcal"]) == 269
            and len(cafe["itens"]) == 3 and cafe["itens"][0]["taco"] == "taco:488",
            f"8 pratos do objetivo do aluno, kcal da TACO (café {cafe and cafe['kcal']})")
    st, r = B.rpc(B.token("w7b-sozinho"), "pratos_prontos_do_app", {"p_objetivo": "ganhar_massa"})
    pr = (r or {}).get("pratos", [])
    p.check(st == 200 and len(pr) == 8 and all("ganhar_massa" in x["objetivos"] for x in pr) and {x["refeicao"] for x in pr} == {"cafe_da_manha", "almoco", "lanche", "jantar"},
            "outro objetivo: 8 pratos, 4 refeições")
    r = entrar_app("w7b-treino", "manter", "app_treino")
    p.check(r.get("ok") is True, f"aluno do app só Treino ({r})")
    st, r = B.rpc(B.token("w7b-treino"), "pratos_prontos_do_app", {})
    p.check(st == 200 and r.get("ok") is False and r.get("erro") == "sem_plano_alimentacao", f"só Treino → sem os pratos ({r})")
    st, r = B.rpc(B.token("w7-aluno"), "pratos_prontos_do_app", {})
    p.check(st == 200 and r.get("ok") is False and r.get("erro") == "sem_matricula_app", f"aluno com profissional → sem os pratos do app ({r})")
    n = B.sql_principal(f"select count(*)::int n from {S}.pratos_prontos")[0]["n"]
    st, r, _ = B.http("GET", f"{B.PRINCIPAL_URL}/rest/v1/pratos_prontos?select=id&limit=1", None,
                      {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {B.token('w7b-sozinho')}", "Accept-Profile": S})
    p.check(n == 24 and (st in (401, 403) or r == []), f"tabela dos pratos fechada para leitura direta (só pela função) ({st} {str(r)[:80]})")


def caso_treinos() -> None:
    print("\n== treinos prontos (Banco do Treino) e o espelho")
    saude()
    st, t = B.trocar_token("w7b-sozinho")
    p.check(st == 200 and t.get("access_token"), f"troca de token do aluno do app ({st})")
    sel = "codigo,objetivo,nivel,grupos:physiq_treinos_prontos_grupos(letra,dias,exercicios:physiq_treinos_prontos_exercicios(exercicio_id,series,reps))"
    st, r, _ = B.http("GET", f"{B.API_T}/rest/v1/physiq_treinos_prontos?select={sel}&ativo=eq.true", None,
                      {"apikey": B.anon(B.TREINO_REF), "Authorization": f"Bearer {t.get('access_token')}", "Accept-Profile": S})
    ok = st == 200 and isinstance(r, list)
    grupos = sum(len(x["grupos"]) for x in r) if ok else 0
    exs = sum(len(g["exercicios"]) for x in r for g in x["grupos"]) if ok else 0
    p.check(ok and len(r) == 9 and grupos == 34 and exs == 193, f"catálogo: 9 treinos, 34 divisões, 193 exercícios ({st}, {len(r) if ok else r})")
    st, r, _ = B.http("GET", f"{B.API_T}/rest/v1/physiq_treinos_prontos?select=id&limit=1", None, {"apikey": B.anon(B.TREINO_REF), "Accept-Profile": S})
    p.check(st in (401, 403) or r == [], f"sem login não lê o catálogo ({st} {str(r)[:80]})")
    time.sleep(2)
    B.processar_espelho()
    tid = B.treino_id("w7b-sozinho")
    pf = B.sql_treino(f"select professor_id::text as prof, conta_id::text as conta from {S}.physiq_profiles where id = '{tid}'")
    p.check(pf and pf[0]["prof"] is None and pf[0]["conta"] == B.conta_do_app(), f"espelho: no Treino, sem professor e na conta do app ({pf})")


def caso_plano() -> None:
    print("\n== trocar de plano")
    c = "w7b-treino"
    pid = B.app_da(c)["id"]
    st, r = pag(c, "aluno_app_plano", {"paciente_id": pid, "plano": "app_treino_alimentacao"})
    m = B.app_da(c)
    p.check(st == 200 and r.get("ok") and r.get("mudou") is True and float(r.get("valor")) == 49.9 and m["plano"] == "app_treino_alimentacao" and m["valor"] == "49.90",
            f"Treino → Treino + Alimentação ({st} {r})")
    st, x = B.rpc(B.token(c), "pratos_prontos_do_app", {})
    p.check(st == 200 and x.get("ok") is True, "com Alimentação: os pratos liberam")
    st, s = B.rpc(B.token(c), "minha_situacao", {})
    p.check("nutricao" in (s or {}).get("modulos_aluno", []), f"módulo Nutrição na situação ({s.get('modulos_aluno')})")
    st, r = pag(c, "aluno_app_plano", {"paciente_id": pid, "plano": "app_treino"})
    st2, x = B.rpc(B.token(c), "pratos_prontos_do_app", {})
    p.check(st == 200 and r.get("mudou") is True and B.app_da(c)["plano"] == "app_treino" and x.get("erro") == "sem_plano_alimentacao",
            "de volta ao Treino: os pratos saem")
    st, r = pag(c, "aluno_app_plano", {"paciente_id": pid, "plano": "app_treino"})
    p.check(st == 200 and r.get("mudou") is False, "o mesmo plano: nada muda")
    st, r = pag(c, "aluno_app_plano", {"paciente_id": pid, "plano": "plano_de_outro"})
    p.check(st == 400 and r.get("erro") == "plano_invalido", f"plano que não é do app → recusado ({st} {r})")
    st, r = pag("w7-aluno", "aluno_app_plano", {"plano": "app_treino"})
    p.check(st in (400, 403) and r.get("erro") == "nao_e_do_app", f"aluno com profissional → recusado ({st} {r})")


def caso_cobranca() -> None:
    print("\n== cobrança: pagar no teste · teste que acabou → Pix → em dia")
    c = "w7b-sozinho"
    m0 = B.app_da(c)
    st, r = pag(c, "aluno_mp_pix", {"paciente_id": m0["id"]})
    cob = (r or {}).get("cobranca") or {}
    p.check(st == 200 and r.get("ok") and cob.get("status") == "aguardando_confirmacao", f"no teste dá para pagar (Pix do sandbox) ({st} {str(r)[:160]})")
    st, r = pag(c, "simular_aprovacao", {"cobranca_id": cob.get("id")})
    m1 = B.app_da(c)
    esperado = ts(m0["teste_ate"]) + dt.timedelta(days=0)
    cob_fim = ts(m1["pago_ate"])
    p.check(st == 200 and r.get("ok") and cob_fim and cob_fim > esperado + dt.timedelta(days=27) and cob_fim < esperado + dt.timedelta(days=32),
            f"pago no teste: o mês começa no FIM do teste ({m0['teste_ate']} → {m1['pago_ate']})")
    # teste que acabou
    c = "w7b-vence"
    r = entrar_app(c, "ganhar_massa", "app_treino")
    pid = r.get("paciente_id")
    B.sql_principal(f"""update {S}.pacientes set app_teste_de = now() - interval '9 days', app_teste_ate = now() - interval '1 hour' where id = '{pid}';
                        select {S}.mensalidade_recalcular('{pid}')""")
    m = B.app_da(c)
    p.check(ts(m["pago_ate"]) and ts(m["pago_ate"]) < dt.datetime.now(dt.timezone.utc) and m["pago_ate"] == m["teste_ate"], f"teste acabou: a cobertura acabou junto ({m['pago_ate']})")
    st, s = pag(c, "aluno_status")
    mm = [x for x in (s or {}).get("matriculas", []) if x.get("conta", {}).get("app")]
    p.check(st == 200 and mm and mm[0]["mensalidade"]["coberta"] is False and mm[0]["mensalidade"]["teste_ate"] and mm[0]["conta"]["bloquear"] is True
            and mm[0]["conta"]["profissional"] == "Physiq", f"Pagamentos: vencido, trava ligada, quem recebe = Physiq ({mm[:1] and mm[0]['mensalidade']})")
    st, r = pag(c, "aluno_mp_pix", {"paciente_id": pid})
    cob = (r or {}).get("cobranca") or {}
    p.check(st == 200 and cob.get("status") == "aguardando_confirmacao" and float(cob.get("valor")) == 29.9, f"Pix de R$ 29,90 gerado ({st})")
    st, r = pag(c, "simular_aprovacao", {"cobranca_id": cob.get("id")})
    m = B.app_da(c)
    agora = dt.datetime.now(dt.timezone.utc)
    p.check(st == 200 and ts(m["pago_ate"]) > agora + dt.timedelta(days=27), f"pagou depois de vencer: em dia por 1 mês a partir de agora ({m['pago_ate']})")
    B.json_arquivo(B.BACKUP / "e2e-cobranca-staging.json", {"sozinho": B.app_da("w7b-sozinho"), "vence": m})


def caso_vincular() -> None:
    print("\n== vincular a um profissional: a assinatura do app é cancelada")
    c = "w7b-vincula"
    r = entrar_app(c, "manter", "app_treino_alimentacao")
    pid = r.get("paciente_id")
    st, r = pag(c, "aluno_mp_assinar", {"paciente_id": pid, "checkout": True})
    ass = B.sql_principal(f"select id::text, mp_preapproval_id, status from {S}.aluno_assinaturas where paciente_id = '{pid}'")
    pre = ass[0]["mp_preapproval_id"] if ass else None
    p.check(st == 200 and r.get("ok") and ass and pre and ass[0]["status"] in ("pending", "authorized"), f"cobrança automática do app criada (sandbox) ({st} {ass})")
    st, prev = B.funcao(B.token(c), "vincular-aluno", {"codigo": B.CODIGO_LUCAS, "previa": True})
    app = (prev or {}).get("app") or {}
    p.check(st == 200 and prev.get("ok") is True and float(app.get("valor") or 0) == 49.9 and app.get("assinatura_ativa") is True,
            f"prévia: avisa que a mensalidade do app para ({prev})")
    p.check(B.app_da(c)["ativo"] is True, "a prévia não mexe em nada")
    st, v = B.funcao(B.token(c), "vincular-aluno", {"codigo": B.CODIGO_LUCAS})
    p.check(st == 200 and v.get("ok") and v.get("app_encerrado") is True and (v.get("assinatura_app") or {}).get("canceladas") == 1,
            f"vinculou: o app encerrou e a assinatura foi cancelada ({v})")
    m = B.app_da(c)
    a2 = B.sql_principal(f"select status from {S}.aluno_assinaturas where paciente_id = '{pid}'")
    mp = preapproval(pre) if pre else {}
    p.check(m["ativo"] is False and m["encerrada_motivo"] == "vinculou_profissional" and a2[0]["status"] == "cancelled" and mp.get("status") == "cancelled",
            f"matrícula do app inativa, assinatura cancelada no banco E no Mercado Pago ({a2}, MP {mp.get('status')})")
    mats = B.matriculas_de(c)
    lucas = [x for x in mats if x["origem"] == "nova" and x["ativo"]]
    p.check(len(lucas) == 1 and lucas[0]["personal_id"] == B.uid("w7-personal"), f"matrícula ativa na conta do Lucas ({mats})")
    st, s = B.rpc(B.token(c), "minha_situacao", {})
    p.check(s.get("modulos_aluno") == ["treino"] and not [x for x in s.get("matriculas", []) if x.get("app") and x.get("ativo")],
            f"situação: só o Treino do Lucas, fora do app ({s.get('modulos_aluno')})")
    st, mp2 = B.rpc(B.token(c), "meu_plano_app", {})
    p.check(mp2.get("com_profissional") is True and (mp2.get("matricula") or {}).get("ativo") is False, "Meu plano: com profissional, o app encerrado")
    r = entrar_app(c, "manter", "app_treino")
    p.check(r.get("ok") is False and r.get("erro") == "com_profissional", "com profissional não volta ao app sozinho")


def caso_removido() -> None:
    print("\n== o profissional tira da lista → volta ao app com 7 dias grátis")
    c = "w7b-removido"
    st, v = B.funcao(B.token(c), "vincular-aluno", {"codigo": B.CODIGO_LUCAS})
    p.check(st == 200 and v.get("ok"), f"aluno do Lucas pelo código ({st} {v.get('erro') if isinstance(v, dict) else v})")
    saude()
    st0, tl = B.trocar_token("w7-personal")  # o personal no Treino (o espelho liga o aluno a ele)
    time.sleep(2)
    st, t = B.trocar_token(c)
    time.sleep(2)
    B.processar_espelho()
    tid = B.treino_id(c)
    lucas_t = B.treino_id("w7-personal")
    pf = B.sql_treino(f"select professor_id::text as prof from {S}.physiq_profiles where id = '{tid}'")
    p.check(st0 == 200 and st == 200 and lucas_t and pf and pf[0]["prof"] == lucas_t, f"no Treino, o aluno é do Lucas ({pf} = {lucas_t})")
    saude()
    st2, r, _ = B.http("POST", f"{B.API_T}/functions/v1/admin-delete-user", {"userId": tid},
                       {"Authorization": f"Bearer {tl.get('access_token')}", "x-schema": S, "Origin": "https://physiqcalc-staging.vercel.app"})
    p.check(st == 200 and st2 == 200 and isinstance(r, dict) and r.get("desvinculado") is True and r.get("principal") == "ok",
            f"painel antigo: o Lucas tira da lista e o principal fica sabendo ({st2} {r})")
    mats = B.matriculas_de(c)
    antiga = [x for x in mats if x["origem"] == "nova"]
    app = B.app_da(c)
    fim = ts(app["teste_ate"]) if app else None
    p.check(antiga and antiga[0]["ativo"] is False and antiga[0]["desvinculado_em"] and app and app["ativo"] and fim
            and fim.strftime("%Y-%m-%d %H:%M:%S") == fim_esperado() and app["plano"] == "app_treino",
            f"a matrícula do Lucas ficou inativa e o aluno virou aluno do app com 7 dias a partir de agora ({mats}, {app})")
    av = B.sql_principal(f"select titulo from {S}.avisos where destino_user_id = '{B.uid(c)}' order by criado_em desc limit 1")
    p.check(av and av[0]["titulo"].startswith("Você agora treina por conta própria"), f"aviso no sino ({av})")
    pf = B.sql_treino(f"select professor_id::text as prof from {S}.physiq_profiles where id = '{tid}'")
    p.check(pf and pf[0]["prof"] is None, "no Treino, sem professor (os dados continuam dele)")
    st, r, _ = B.http("POST", f"{B.PRINCIPAL_URL}/functions/v1/vincular-aluno", {"acao": "desvincular", "principal_user_id": B.uid(c),
                      "profissional_principal_id": B.uid("w7-personal")}, {"x-schema": S, "x-espelho-segredo": "errado" * 8})
    p.check(st == 401, f"modo servidor com segredo errado → 401 ({st} {r})")


def caso_master() -> None:
    print("\n== master vê os alunos do app")
    st, r = B.rpc(B.token("w7b-sozinho"), "master_alunos_do_app", {})
    p.check(st == 200 and r.get("ok") is False and r.get("erro") == "so_master", f"aluno comum → recusado ({r})")
    u = B.uid("master")
    antes = B.sql_principal(f"select role from {S}.profiles where id = '{u}'")[0]["role"]
    try:
        B.sql_principal(f"update {S}.profiles set role = 'master' where id = '{u}'")
        st, r = B.rpc(B.token("master"), "master_alunos_do_app", {})
        emails = {x["email"]: x for x in (r or {}).get("alunos", [])}
        p.check(st == 200 and r.get("ok") and B.EMAIL["w7b-sozinho"] in emails and emails[B.EMAIL["w7b-sozinho"]]["plano"] == "app_treino_alimentacao"
                and emails.get(B.EMAIL["w7b-vincula"], {}).get("ativo") is False, f"o master vê os alunos do app, com plano e situação ({len(emails)} alunos)")
    finally:
        B.sql_principal(f"update {S}.profiles set role = '{antes}' where id = '{u}'")
    p.check(B.sql_principal(f"select role from {S}.profiles where id = '{u}'")[0]["role"] == antes, f"perfil do master de teste de volta a '{antes}'")


CASOS = {"entrar": caso_entrar, "pratos": caso_pratos, "treinos": caso_treinos, "plano": caso_plano, "cobranca": caso_cobranca,
         "vincular": caso_vincular, "removido": caso_removido, "master": caso_master}


def main() -> int:
    qual = sys.argv[1] if len(sys.argv) > 1 else "tudo"
    for nome, f in CASOS.items():
        if qual in ("tudo", nome):
            f()
    return p.fim() if hasattr(p, "fim") else 0


if __name__ == "__main__":
    sys.exit(main())
