#!/usr/bin/env python3
"""Physiq W13 — E2E de API (staging) da página Alunos e do F5 "Bloquear" com efeito. Em SÉRIE (VM Nano), /health antes de cada bloco.

Blocos: A lista + P1 + número = tela · B cadastrar · C convidar + aceite no 1º login (C7) · D bloquear/desbloquear (espelho no Treino,
trocar-token recusa o só-aluno, sessões do Treino encerradas) · E desativar/reativar/remover · F atribuir em lote · G limite da faixa
(o 11º aluno de uma conta f10) · H /c/ público (captcha + pendente + aprovar) · I repasse do APK antigo (modo servidor).
Pré-requisito: python3 e2e/w13/massa.py. Uso: python3 e2e/w13/api.py [--bloco A,B,...]
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p


def q(sql: str) -> list:
    return B.sql_principal(sql)


C = B.conta_de("w13-dono", B.NOME_CONTA)
CL = B.conta_de("w13-limite", B.NOME_CONTA_LIMITE)
assert C and CL, "rode antes: python3 e2e/w13/massa.py"


def nomes(r: dict) -> list[str]:
    return sorted(i["nome"] for i in r.get("itens", []))


def bloco_a() -> None:
    B.saude_ok("A — lista")
    r = B.lista("w13-dono", C)
    p.check(r.get("ok") is True, "A1 dono lê a lista da conta")
    esperado = ["Beatriz Lima", "Carlos Souza", "Diego Souza", "Marina Alves", "João Pedro", "Rafael Moura"]
    p.check(nomes(r) == sorted(esperado), f"A1 filtro padrão Ativos = os 6 ativos da conta: {nomes(r)}")
    ativos = q(f"select {S}.conta_alunos_ativos('{C}') as n")[0]["n"]
    p.check(r["total"] == r["contagens"]["ativos"] == r["vagas"]["em_uso"] == ativos,
            f"A1 número = tela: total {r['total']} = chip Ativos {r['contagens']['ativos']} = vagas em uso {r['vagas']['em_uso']} = conta_alunos_ativos {ativos}")
    p.check(r["vagas"]["limite"] == 10, f"A1 conta nova em teste: limite 10 (P10) → {r['vagas']['limite']}")
    raf = next(i for i in r["itens"] if i["nome"] == "Rafael Moura")
    p.check(raf["modulos"] == ["treino", "nutricao"] and raf["personal"]["nome"] == "Lucas Ferreira" and raf["nutricionista"]["nome"] == "Camila Rocha",
            "A1 Rafael: Treino · Lucas + Nutrição · Camila (os chips da tela 7)")
    p.check((raf.get("pagamento") or {}).get("s") == "pago" and raf["tags"] == ["VIP"] and (raf["foto_url"] or "").startswith("https://"),
            "A1 Rafael: selo PAGO, tag VIP e foto")
    r2 = B.lista("w13-personal2", C)
    p.check(nomes(r2) == ["Carlos Souza"], f"A2 P1: o 2º personal vê só os alunos dele → {nomes(r2)}")
    r3 = B.lista("w13-nutri", C)
    p.check(nomes(r3) == ["Beatriz Lima", "Marina Alves", "Rafael Moura"], f"A3 P1: a nutricionista vê só as dela → {nomes(r3)}")
    p.check(r3["eu"]["dono"] is False and all(i.get("pagamento") is None for i in r3["itens"]), "A3 membro não vê a mensalidade (W6: só o dono)")
    st, r4 = B.rpc("w13-aluno", "alunos_da_conta", {"p_conta": C})
    p.check(isinstance(r4, dict) and r4.get("erro") == "sem_acesso", f"A4 aluno (não é membro) não lê a lista → {r4}")
    casos = [({"modulo": "nutricao"}, ["Beatriz Lima", "Marina Alves", "Rafael Moura"]), ({"responsavel": "sem"}, ["Diego Souza"]),
             ({"responsavel": B.uid("w13-personal2")}, ["Carlos Souza"]), ({"tag": "VIP"}, ["Rafael Moura"]),
             ({"pagamento": "pago"}, ["Rafael Moura"]), ({"pagamento": "pendente"}, ["João Pedro"]), ({"q": "BEA"}, ["Beatriz Lima"]),
             ({"q": "100%_"}, [])]
    for f, esp in casos:
        rr = B.lista("w13-dono", C, f)
        p.check(nomes(rr) == sorted(esp), f"A5 filtro {f} → {nomes(rr)}")
    rr = B.lista("w13-dono", C, {}, limite=2)
    p.check(len(rr["itens"]) == 2 and rr["total"] == 6, "A6 '20 com Ver mais': o limite corta as linhas e o total continua o da lista")


def bloco_b() -> None:
    B.saude_ok("B — cadastrar")
    q(f"delete from {S}.pacientes where conta_id = '{C}' and nome = 'Ana Nova W13'")
    st, r = B.alunos("w13-dono", "criar", {"conta_id": C, "dados": {"nome": "Ana Nova W13", "email": "w13.ana.teste.claude@physiqnutri.app",
                                                                        "telefone": "82988887777", "modulos": ["treino"], "personal_id": B.uid("w13-dono")}})
    p.check(st == 200 and r.get("ok") and r.get("paciente_id"), f"B1 dono cadastra aluno sem login → {st} {r}")
    ana = B.paciente("Ana Nova W13", C)
    p.check(ana and ana["personal_id"] == B.uid("w13-dono") and ana["user_id"] is None, "B1 matrícula com o responsável e sem login (o acesso é o card da W8b)")
    st, r = B.alunos("w13-nutri", "criar", {"conta_id": C, "dados": {"nome": "Sem Papel", "modulos": ["treino"]}})
    p.check(st == 400 and r.get("erro") == "responsavel_invalido", f"B2 nutricionista não cadastra aluno de treino → {st} {r}")
    st, r = B.alunos("w13-dono", "criar", {"conta_id": C, "dados": {"nome": "A", "modulos": ["treino"]}})
    p.check(st == 400 and r.get("erro") == "nome_invalido", f"B3 nome curto → {st} {r}")
    st, r = B.alunos("w13-dono", "criar", {"conta_id": C, "dados": {"nome": "Ana Repetida", "email": "w13.ana.teste.claude@physiqnutri.app", "modulos": ["treino"]}})
    p.check(st == 409 and r.get("erro") == "ja_cadastrado", f"B4 e-mail já cadastrado na conta → {st} {r}")
    st, r = B.alunos("w13-aluno", "criar", {"conta_id": C, "dados": {"nome": "Intruso", "modulos": ["treino"]}})
    p.check(st == 403 and r.get("erro") == "sem_acesso", f"B5 quem não é da conta não cadastra → {st} {r}")


def bloco_c() -> None:
    B.saude_ok("C — convidar")
    conv = B.EMAIL["w13-convidado"]
    q(f"delete from {S}.convites where conta_id = '{C}' and lower(email) = '{conv}'")
    q(f"delete from {S}.pacientes where conta_id = '{C}' and lower(email) = '{conv}'")
    st, r = B.alunos("w13-dono", "convidar", {"conta_id": C, "email": conv, "modulos": ["treino"], "responsavel_id": B.uid("w13-dono")})
    p.check(st == 200 and r.get("ok") and r.get("email_teste") is True and r.get("email_enviado") is True,
            f"C1 convite por e-mail (conta de teste → caixa de teste do Resend) → {st} {({k: r.get(k) for k in ('ok', 'email_teste', 'email_enviado', 'erro_email', 'reenvio')})}")
    st, r = B.alunos("w13-dono", "convidar", {"conta_id": C, "email": "fulano.real@gmail.com", "modulos": ["treino"]})
    p.check(st == 403 and r.get("erro") == "conta_real_no_staging", f"C2 staging recusa e-mail real (nenhum e-mail a pessoa real) → {st} {r.get('erro')}")
    st, r = B.alunos("w13-dono", "convidar", {"conta_id": C, "email": "w7.aluno.teste.claude@physiqnutri.app", "modulos": ["treino"]})
    p.check(st == 409 and r.get("erro") == "outro_profissional", f"C3 P7: aluno ativo em outra conta → 'Este aluno já está com outro profissional' → {st} {r.get('erro')}")
    st, r = B.alunos("w13-dono", "convidar", {"conta_id": C, "email": B.EMAIL["w13-aluno"], "modulos": ["treino"]})
    p.check(st == 409 and r.get("erro") == "ja_e_aluno", f"C4 quem já é aluno desta conta → {st} {r.get('erro')}")
    st, r = B.rpc("w13-dono", "aluno_convites", {"p_conta": C})
    pend = [c for c in (r or []) if c.get("email") == conv and c.get("status") == "pendente"]
    p.check(len(pend) == 1 and pend[0]["modulos"] == ["treino"], f"C5 convite pendente na lista → {pend}")
    st, r2 = B.alunos("w13-dono", "reenviar_convite", {"convite_id": pend[0]["id"]})
    p.check(st == 429 and r2.get("erro") == "muitos_convites", f"C6 reenviar logo em seguida é freado → {st} {r2.get('erro')}")
    # C7: reconhecido no 1º login com aquele e-mail (pos-login → aceitar_convites_do_email)
    B.B5.garantir_usuario(conv, B.CONTAS["w13-convidado"][1], B.NOMES["w13-convidado"])
    tok = B.token("w13-convidado")
    st, r3, _ = B.http("POST", f"{B.API_P}/functions/v1/pos-login", {}, {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {tok}",
                                                                          "x-schema": S, "Origin": "https://physiqcalc-staging.vercel.app"}, timeout=90)
    mat = q(f"select personal_id::text, ativo from {S}.pacientes where conta_id = '{C}' and user_id = '{B.uid('w13-convidado')}' and deleted_at is null")
    cv = q(f"select status from {S}.convites where id = '{pend[0]['id']}'")
    p.check(st == 200 and mat and mat[0]["personal_id"] == B.uid("w13-dono") and mat[0]["ativo"] and cv[0]["status"] == "aceito",
            f"C7 1º login com o e-mail do convite → matrícula na conta com o responsável; convite aceito → {st} {mat} {cv}")
    st, r4 = B.alunos("w13-dono", "cancelar_convite", {"convite_id": pend[0]["id"]})
    p.check(st == 409 and r4.get("erro") == "convite_nao_pendente", f"C8 convite aceito não se cancela → {st} {r4.get('erro')}")


def bloco_d() -> None:
    B.saude_ok("D — bloquear")
    raf = B.paciente("Rafael Moura", C)
    B.B5.zerar_limite_troca("w13-aluno")
    st, r = B.B5.trocar_token("w13-aluno")
    p.check(st == 200 and r.get("treino_user_id"), f"D0 Rafael troca o token (Treino criado/vinculado) → {st}")
    tu = r.get("treino_user_id") or B.treino_id("w13-aluno")
    antes = B.lista("w13-dono", C)["vagas"]["em_uso"]
    sess_antes = B.sessoes_treino(tu)
    st, r = B.alunos("w13-personal2", "bloquear", {"aluno_id": raf["id"]})
    p.check(st == 403 and r.get("erro") == "sem_acesso", f"D1 personal que não é responsável não bloqueia → {st} {r.get('erro')}")
    st, r = B.alunos("w13-dono", "bloquear", {"aluno_id": raf["id"], "mensagem": "Fale comigo para regularizar."})
    p.check(st == 200 and r.get("ok") and r.get("em_uso") == antes - 1, f"D2 dono bloqueia; a vaga fica livre ({antes} → {r.get('em_uso')})")
    st, sit = B.rpc("w13-aluno", "minha_situacao", {})
    m = next((x for x in (sit or {}).get("matriculas", []) if x.get("conta_id") == C), {})
    p.check(m.get("bloqueada") is True and m.get("bloqueio_msg") == "Fale comigo para regularizar.", f"D3 minha_situacao do aluno: bloqueada + mensagem → {m.get('bloqueada')} {m.get('bloqueio_msg')}")
    ok = B.esperar(lambda: B.status_treino(tu) == "bloqueado", 120, 3)
    p.check(bool(ok), f"D4 espelho no Treino: physiq_profiles.status = 'bloqueado' (o PowerSync leva ao aparelho) → {B.status_treino(tu)}")
    sess = B.esperar(lambda: B.sessoes_treino(tu) == 0 or None, 60, 3)
    p.check(B.sessoes_treino(tu) == 0, f"D5 sessões do Treino do só-aluno encerradas (APK ≤ 3.15) → antes {sess_antes}, agora {B.sessoes_treino(tu)}")
    B.B5.zerar_limite_troca("w13-aluno")
    st, r = B.B5.trocar_token("w13-aluno")
    p.check(st == 403 and r.get("error") == "aluno_bloqueado", f"D6 trocar-token recusa o aluno bloqueado → {st} {r.get('error')}")
    lp = B.lista("w13-dono", C)
    lb = B.lista("w13-dono", C, {"situacao": "bloqueados"})
    p.check("Rafael Moura" not in nomes(lp) and nomes(lb) == ["Rafael Moura"] and lb["itens"][0]["bloqueado"] is True and lp["contagens"]["bloqueados"] == 1,
            "D7 fora dos Ativos, no filtro Bloqueados com o selo; chip Bloqueados = 1")
    # o dono que TAMBÉM é aluno (P7) nunca é barrado: Lucas não é aluno aqui; o master/profissional tem papel no Treino (teste unitário)
    st, r = B.alunos("w13-dono", "desbloquear", {"aluno_id": raf["id"]})
    p.check(st == 200 and r.get("ok") and r.get("em_uso") == antes, f"D8 desbloquear devolve o acesso e volta a ocupar vaga → {r.get('em_uso')}")
    ok = B.esperar(lambda: B.status_treino(tu) == "ativo", 120, 3)
    p.check(bool(ok), f"D9 espelho volta a 'ativo' → {B.status_treino(tu)}")
    B.B5.zerar_limite_troca("w13-aluno")
    st, r = B.B5.trocar_token("w13-aluno")
    p.check(st == 200, f"D10 trocar-token volta a dar a sessão do Treino → {st}")


def bloco_e() -> None:
    B.saude_ok("E — desativar/remover")
    mar = B.paciente("Marina Alves", C)
    st, r = B.alunos("w13-dono", "desativar", {"aluno_id": mar["id"]})
    ld = B.lista("w13-dono", C, {"situacao": "desativados"})
    p.check(st == 200 and "Marina Alves" in nomes(ld), f"E1 desativar → vai para Desativados → {st} {nomes(ld)}")
    st, r = B.alunos("w13-dono", "reativar", {"aluno_id": mar["id"]})
    p.check(st == 200 and "Marina Alves" in nomes(B.lista("w13-dono", C)), f"E2 reativar → volta para os Ativos → {st}")
    ana = B.paciente("Ana Nova W13", C)
    if ana:
        st, r = B.alunos("w13-dono", "remover", {"aluno_id": ana["id"]})
        some = all("Ana Nova W13" not in nomes(B.lista("w13-dono", C, {"situacao": s})) for s in ("ativos", "todos"))
        p.check(st == 200 and r.get("removido") and some, f"E3 remover da lista (dono) → Lixeira; some de todos os filtros → {st} {r}")
    bea = B.paciente("Beatriz Lima", C)
    st, r = B.alunos("w13-nutri", "remover", {"aluno_id": bea["id"]})
    bea2 = B.paciente("Beatriz Lima", C)
    p.check(st == 200 and r.get("so_responsavel") and bea2["nutricionista_id"] is None and bea2["personal_id"] == B.uid("w13-dono") and bea2["deleted_at"] is None,
            f"E4 a nutricionista remove quem divide com o personal → só ela sai; o aluno fica com o Lucas → {r}")
    q(f"update {S}.pacientes set nutricionista_id = '{B.uid('w13-nutri')}' where id = '{bea['id']}'")


def bloco_f() -> None:
    B.saude_ok("F — atribuir")
    die = B.paciente("Diego Souza", C)
    st, r = B.alunos("w13-nutri", "atribuir", {"conta_id": C, "alunos": [die["id"]], "modulo": "nutricao", "responsavel_id": B.uid("w13-nutri")})
    p.check(st == 403 and r.get("erro") == "so_dono", f"F1 só o dono atribui em lote → {st} {r.get('erro')}")
    st, r = B.alunos("w13-dono", "atribuir", {"conta_id": C, "alunos": [die["id"]], "modulo": "nutricao", "responsavel_id": B.uid("w13-dono")})
    p.check(st == 400 and r.get("erro") == "responsavel_invalido", f"F2 responsável sem o papel → recusado → {st} {r.get('erro')}")
    st, r = B.alunos("w13-dono", "atribuir", {"conta_id": C, "alunos": [die["id"]], "modulo": "nutricao", "responsavel_id": B.uid("w13-nutri")})
    sem = nomes(B.lista("w13-dono", C, {"responsavel": "sem"}))
    p.check(st == 200 and r.get("atualizados") == 1 and "Diego Souza" not in sem, f"F3 atribuir em lote tira do 'Sem responsável' → {r} {sem}")
    q(f"update {S}.pacientes set nutricionista_id = null, personal_id = null where id = '{die['id']}'")


def bloco_g() -> None:
    B.saude_ok("G — limite")
    q(f"delete from {S}.pacientes where conta_id = '{CL}' and nome like 'Extra W13%'")
    r = B.lista("w13-limite", CL)
    p.check(r["vagas"]["em_uso"] == 10 and r["vagas"]["limite"] == 10, f"G0 Conta Limite W13 (f10): 10 de 10 → {r['vagas']}")
    st, r = B.alunos("w13-limite", "criar", {"conta_id": CL, "dados": {"nome": "Extra W13 11", "modulos": ["treino"]}})
    p.check(st == 409 and r.get("erro") == "limite_plano" and r.get("limite") == 10 and r.get("em_uso") == 10,
            f"G1 o 11º aluno é recusado (limite da faixa no SERVIDOR) → {st} {r}")
    st, r = B.alunos("w13-limite", "convidar", {"conta_id": CL, "email": "w13.extra.teste.claude@physiqnutri.app", "modulos": ["treino"]})
    p.check(st == 409 and r.get("erro") == "limite_plano", f"G2 convite também recusado no limite → {st} {r.get('erro')}")
    um = B.paciente("Aluno Limite 01", CL)
    st, _ = B.alunos("w13-limite", "bloquear", {"aluno_id": um["id"]})
    st2, r2 = B.alunos("w13-limite", "criar", {"conta_id": CL, "dados": {"nome": "Extra W13 10b", "modulos": ["treino"]}})
    p.check(st == 200 and st2 == 200, f"G3 bloquear libera a vaga (C102): cabe mais um → {st} {st2}")
    st3, r3 = B.alunos("w13-limite", "desbloquear", {"aluno_id": um["id"]})
    p.check(st3 == 409 and r3.get("erro") == "limite_plano", f"G4 desbloquear com o plano cheio é recusado (volta a ocupar vaga) → {st3} {r3.get('erro')}")
    dois = B.paciente("Aluno Limite 02", CL)
    B.alunos("w13-limite", "desativar", {"aluno_id": dois["id"]})   # libera a vaga…
    st5, _ = B.alunos("w13-limite", "criar", {"conta_id": CL, "dados": {"nome": "Extra W13 10c", "modulos": ["treino"]}})  # …que outro ocupa
    st4, r4 = B.alunos("w13-limite", "reativar", {"aluno_id": dois["id"]})
    p.check(st5 == 200 and st4 == 409 and r4.get("erro") == "limite_plano", f"G5 reativar com o plano cheio também → {st5} {st4} {r4.get('erro')}")
    # volta ao estado da massa (10 ativos, ninguém bloqueado)
    q(f"delete from {S}.pacientes where conta_id = '{CL}' and nome like 'Extra W13%'")
    q(f"update {S}.pacientes set ativo = true, acesso_bloqueado_em = null where conta_id = '{CL}'")
    p.check(q(f"select {S}.conta_alunos_ativos('{CL}') as n")[0]["n"] == 10, "G6 massa da conta limite de volta a 10 ativos")


def captcha(ligado: bool) -> None:
    q(f"""update {S}.app_config set valor = jsonb_set(valor, '{{captcha}}', '{str(ligado).lower()}'::jsonb) where chave = 'login_limite'""")


def bloco_h() -> None:
    B.saude_ok("H — /c/")
    cod = q(f"select codigo_convite from {S}.conta_membros where conta_id = '{C}' and user_id = '{B.uid('w13-dono')}'")[0]["codigo_convite"]
    q(f"delete from {S}.cadastros_pendentes where conta_id = '{C}'")
    q(f"delete from {S}.pacientes where conta_id = '{C}' and nome = 'Sofia Cadastro W13'")
    st, r = B.alunos("", "cadastro_info", {"codigo": cod})
    p.check(st == 200 and r.get("profissional") == "Lucas Ferreira" and r.get("conta") == B.NOME_CONTA, f"H1 /c/{cod}: de quem é o link → {r}")
    dados = {"nome": "Sofia Cadastro W13", "email": "w13.sofia.teste.claude@physiqnutri.app", "telefone": "82977776666", "genero": "feminino",
             "nascimento": "1996-04-12", "observacoes": "Treino de manhã."}
    st, r = B.alunos("", "cadastro_enviar", {"codigo": cod, "dados": dados, "captcha": ""})
    p.check(st == 400 and r.get("erro") == "captcha_invalido", f"H2 sem captcha válido → recusado (Turnstile no servidor) → {st} {r.get('erro')}")
    captcha(False)
    try:
        st, r = B.alunos("", "cadastro_enviar", {"codigo": cod, "dados": dados})
        p.check(st == 200 and r.get("ok"), f"H3 cadastro público (captcha desligado no staging só para este teste) → {st} {r}")
        st, r = B.alunos("", "cadastro_enviar", {"codigo": cod, "dados": dados})
        p.check(st == 409 and r.get("erro") == "cadastro_repetido", f"H4 cadastro repetido → {st} {r.get('erro')}")
        st, r = B.alunos("", "cadastro_enviar", {"codigo": cod, "dados": {**dados, "email": "sofia.real@gmail.com", "telefone": ""}})
        p.check(st == 403 and r.get("erro") == "conta_real_no_staging", f"H5 staging recusa contato real → {st} {r.get('erro')}")
    finally:
        captcha(True)
    p.check(q(f"select valor->>'captcha' as c from {S}.app_config where chave = 'login_limite'")[0]["c"] == "true", "H6 captcha religado no staging")
    st, pend = B.rpc("w13-dono", "alunos_pendentes", {"p_conta": C})
    alvo = [x for x in (pend or []) if x.get("nome") == "Sofia Cadastro W13"]
    p.check(len(alvo) == 1 and alvo[0]["profissional"]["nome"] == "Lucas Ferreira", f"H7 fica PENDENTE em Alunos › Pendentes → {len(alvo)}")
    st, pend2 = B.rpc("w13-personal2", "alunos_pendentes", {"p_conta": C})
    p.check(isinstance(pend2, list) and not pend2, "H8 o 2º personal não vê o pendente do link do Lucas")
    st, r = B.alunos("w13-dono", "aprovar", {"conta_id": C, "pendente_id": alvo[0]["id"]})
    so = B.paciente("Sofia Cadastro W13", C)
    p.check(st == 200 and so and so["personal_id"] == B.uid("w13-dono") and so["ativo"], f"H9 aprovar → vira aluno da conta com o dono do link como responsável → {st} {r}")
    # limpa a Sofia (volta a massa para 6 ativos)
    q(f"delete from {S}.pacientes where conta_id = '{C}' and nome = 'Sofia Cadastro W13'")
    q(f"delete from {S}.cadastros_pendentes where conta_id = '{C}'")


def bloco_i() -> None:
    B.saude_ok("I — repasse")
    seg = B.B5.espelho_segredo()
    st, r, _ = B.http("POST", f"{B.API_P}/functions/v1/alunos", {"acao": "repasse", "principal_user_id": B.uid("w13-dono"), "repasse": "convites"},
                      {"x-espelho-segredo": seg, "x-schema": S, "apikey": B.anon(B.PRINCIPAL_REF)})
    p.check(st == 200 and isinstance(r, dict) and r.get("ok") and isinstance(r.get("convites"), list), f"I1 repasse (modo servidor) lista os convites do personal → {st}")
    st, r, _ = B.http("POST", f"{B.API_P}/functions/v1/alunos", {"acao": "repasse", "principal_user_id": B.uid("w13-dono"), "repasse": "convites"},
                      {"x-espelho-segredo": "x" * 40, "x-schema": S, "apikey": B.anon(B.PRINCIPAL_REF)})
    p.check(st == 401, f"I2 segredo errado → 401 → {st}")
    st, r, _ = B.http("POST", f"{B.API_P}/functions/v1/alunos", {"acao": "repasse", "principal_user_id": B.uid("w13-limite"), "repasse": "convidar",
                                                                "email": "w13.extra.teste.claude@physiqnutri.app"},
                      {"x-espelho-segredo": seg, "x-schema": S, "apikey": B.anon(B.PRINCIPAL_REF)})
    p.check(st == 409 and isinstance(r, dict) and r.get("erro") == "limite_plano", f"I3 repasse do APK antigo respeita o limite da faixa → {st} {r}")


BLOCOS = {"A": bloco_a, "B": bloco_b, "C": bloco_c, "D": bloco_d, "E": bloco_e, "F": bloco_f, "G": bloco_g, "H": bloco_h, "I": bloco_i}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bloco", default=",".join(BLOCOS))
    a = ap.parse_args()
    for b in a.bloco.split(","):
        print(f"\n== bloco {b}", flush=True)
        BLOCOS[b.strip().upper()]()
        time.sleep(1.5)
    return p.fim() if hasattr(p, "fim") else p.resumo()


if __name__ == "__main__":
    sys.exit(main())
