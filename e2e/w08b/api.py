#!/usr/bin/env python3
"""Physiq W8b — E2E de API do limite de tentativas no login (função entrar-senha), da senha provisória (RPCs do acesso do aluno) e
do destravar pelo Google (pos-login). Sem navegador; tokens do captcha REAIS (Edge — e2e/w08b/fonte_turnstile.py rodando).

Casos:
  captcha     sem token, token inventado e token repetido → captcha_invalido (e nada é contado)
  staging     e-mail de conta real no staging → conta_real_no_staging (nem conta a tentativa)
  escada      w8b-bloqueio: 3 erradas livres; a 4ª bloqueia 1 min (até a senha certa é recusada no bloqueio); relógio acelerado →
              5, 15, 30, 60 min; a seguinte bloqueia DE VEZ (a senha certa continua recusada); o Auth direto não passa aqui (risco)
  rpc         w8b-personal cria a senha nova do Rafael (provisória) e isso destrava a conta; Rafael entra com ela (marca no JWT);
              minha_senha_definida tira a marca · "Criar acesso" do Bruno (sem login) · outra profissional, o próprio aluno e
              anônimo NÃO mexem (sem_acesso/401)
  google      w8b-google bloqueada de vez: pos-login de um login pelo Google destrava (e a P25 troca a senha); o de senha não
  ip          o IP de verdade chega pela função (pelo proxy e direto): 30 tentativas na janela → muitas_tentativas_rede
  paralelo    2 tentativas ao mesmo tempo na mesma conta: a 2ª espera (em_andamento) — ninguém pula a escada
  nutri_antigo o "Redefinir senha" do site ANTIGO do Nutri (mesma RPC, pela nutri dona do registro) destrava e marca provisória
Uso: python3 e2e/w08b/api.py [--schema staging|public] [--casos a,b]   (public = só as descartáveis de produção: escada, google, ip)
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import hashlib
import json
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

p = B.p


def agora_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def minutos_ate(iso: str | None) -> float:
    if not iso:
        return 0.0
    return (dt.datetime.fromisoformat(iso.replace("Z", "+00:00")) - agora_utc()).total_seconds() / 60


def conta_escada() -> str:
    return "w8b-bloqueio" if B.schema() == "staging" else "w8b-prod-bloqueio"


def conta_google() -> str:
    return "w8b-google" if B.schema() == "staging" else "w8b-prod-google"


def origem() -> str:
    return "https://physiqcalc-staging.vercel.app" if B.schema() == "staging" else "https://physiqcalc.com.br"


def caso_captcha() -> None:
    conta = conta_escada()
    email, senha = B.CONTAS[conta]
    B.zerar(email)
    for rotulo, tok in (("sem token", ""), ("token inventado", "XXXX.DUMMY.TOKEN.XXXX")):
        st, r = B.entrar_senha(email, "senha-errada-1", tok, origem())
        p.check(st == 400 and r.get("erro") == "captcha_invalido", f"{rotulo} → 400 captcha_invalido ({st} {r.get('erro')})")
    tok = B.token_real()
    st1, r1 = B.entrar_senha(email, senha, tok, origem())
    st2, r2 = B.entrar_senha(email, senha, tok, origem())
    p.check(st1 == 200 and r1.get("ok") is True and r1.get("sessao", {}).get("access_token"), f"token real + senha certa → 200 com a sessão ({st1})")
    p.check(st2 == 400 and r2.get("erro") == "captcha_invalido", f"o MESMO token de novo → captcha_invalido (vale 1 vez) ({st2} {r2.get('erro')})")
    p.check(B.estado(email) is None, "captcha recusado não conta nada (sem linha no contador)")


def caso_staging() -> None:
    if B.schema() != "staging":
        return
    st, r = B.entrar_senha("alguem.de.verdade@gmail.com", "qualquer", "", origem())
    p.check(st == 403 and r.get("erro") == "conta_real_no_staging", f"conta real no staging → 403 conta_real_no_staging ({st} {r.get('erro')})")
    p.check(B.estado("alguem.de.verdade@gmail.com") is None, "e nem conta a tentativa")


def caso_escada() -> None:
    conta = conta_escada()
    email, senha = B.CONTAS[conta]
    B.zerar(email)
    B.zerar_ips()
    for i in (1, 2, 3):
        st, r = B.entrar_senha(email, f"senha-errada-{i}", "real", origem())
        p.check(st == 400 and r.get("erro") == "senha_errada" and r.get("bloqueado_ate") is None and r.get("restam") == 4 - i,
                f"{i}ª errada → senha_errada, sem bloqueio, restam {4 - i} ({st} {r.get('erro')} restam={r.get('restam')})")
    tok_certa = B.token_real()  # o token da próxima já na mão: o passo abaixo é cronometrado (bloqueio de 1 min)
    st, r = B.entrar_senha(email, "senha-errada-4", "real", origem())
    m = minutos_ate(r.get("bloqueado_ate"))
    p.check(st == 400 and r.get("erro") == "senha_errada" and 0.9 < m <= 1.02, f"4ª errada → bloqueia 1 min ({m:.2f} min)")
    st, r = B.entrar_senha(email, senha, tok_certa, origem())
    p.check(st == 423 and r.get("erro") == "bloqueado" and 0.5 < minutos_ate(r.get("bloqueado_ate")) <= 1.02,
            f"no bloqueio até a senha CERTA é recusada (423 bloqueado, {minutos_ate(r.get('bloqueado_ate')):.2f} min)")
    p.check((B.estado(email) or {}).get("erros") == 4, "a recusa no bloqueio não conta erro novo (erros = 4)")
    for n, esperado in ((5, 5), (6, 15), (7, 30), (8, 60)):
        B.acelerar(email)
        st, r = B.entrar_senha(email, f"senha-errada-{n}", "real", origem())
        m = minutos_ate(r.get("bloqueado_ate"))
        p.check(st == 400 and r.get("erro") == "senha_errada" and esperado - 0.1 < m <= esperado + 0.02,
                f"relógio acelerado → {n}ª errada bloqueia {esperado} min ({m:.2f} min)")
    B.acelerar(email)
    st, r = B.entrar_senha(email, "senha-errada-9", "real", origem())
    p.check(st == 400 and r.get("erro") == "bloqueado_de_vez" and r.get("bloqueado_de_vez") is True, f"9ª errada → bloqueado DE VEZ ({st} {r.get('erro')})")
    B.acelerar(email)
    st, r = B.entrar_senha(email, senha, "real", origem())
    p.check(st == 423 and r.get("erro") == "bloqueado_de_vez", f"de vez: a senha CERTA é recusada, mesmo com o relógio acelerado ({st} {r.get('erro')})")
    e = B.estado(email) or {}
    p.check(e.get("erros") == 9 and e.get("bloqueado_de_vez_em"), f"no banco: 9 erros e bloqueado_de_vez_em ({e.get('erros')})")
    # o risco que sobra (anotado): o /auth/v1/token direto não passa pela função — o site antigo do Nutri entra assim
    st, s, _ = B.http("POST", f"{B.API_P}/auth/v1/token?grant_type=password", {"email": email, "password": senha}, {"apikey": B.anon(B.PRINCIPAL_REF)})
    p.check(st == 200, f"[risco anotado] o Auth direto (site antigo do Nutri) continua entrando com a senha certa ({st})")
    B.json_arquivo(B.PRINTS / f"api_{B.schema()}_escada.json", {"email": email, "estado": e})


def caso_rpc() -> None:
    if B.schema() != "staging":
        return
    S = "staging"
    pac = B.q(f"select id::text as id, treino_user_id::text as tid from {S}.pacientes where user_id = '{B.uid('w8b-aluno')}' and deleted_at is null")[0]
    email_a = B.CONTAS["w8b-aluno"][0]
    # o Rafael está bloqueado de vez (5 tentativas erradas de alguém)
    B.q(f"""insert into {S}.login_bloqueios (email, erros, bloqueado_de_vez_em) values ('{email_a}', 9, now())
            on conflict (email) do update set erros = 9, bloqueado_de_vez_em = now(), bloqueado_ate = null""")
    tp = B.sessao("w8b-personal")["access_token"]
    st, d = B.rpc(tp, "aluno_acesso", {"p_aluno": pac["id"]})
    a = (d or {}).get("acesso") or {} if isinstance(d, dict) else {}
    p.check(st == 200 and a.get("email") == email_a and (a.get("bloqueio") or {}).get("bloqueado_de_vez") is True,
            f"card: o dono/personal vê o acesso e o bloqueio de vez ({st})")
    if pac.get("tid"):
        st2, d2 = B.rpc(tp, "aluno_acesso", {"p_aluno": pac["tid"]})
        p.check(st2 == 200 and isinstance(d2, dict) and d2.get("paciente_id") == pac["id"], "card acha o aluno também pelo id do Treino (rota do painel)")
    nova = "Prov" + str(int(time.time()))[-6:] + "x"
    st, r = B.rpc(tp, "paciente_redefinir_senha", {"p_paciente_id": pac["id"], "p_senha": nova})
    p.check(st in (200, 204), f"personal cria a senha nova ({st} {r})")
    p.check(B.estado(email_a) is None, "a senha nova DESTRAVA a conta (o contador sumiu)")
    p.check(B.meta(email_a).get("senha_provisoria") is True, "a senha nasce PROVISÓRIA (app_metadata.senha_provisoria)")
    st, r = B.entrar_senha(email_a, nova, "real", origem())
    tok = (r.get("sessao") or {}).get("access_token", "")
    corpo_jwt = tok.split(".")[1] if tok else ""
    claims = json.loads(__import__("base64").urlsafe_b64decode(corpo_jwt + "=" * (-len(corpo_jwt) % 4))) if tok else {}
    p.check(st == 200 and (claims.get("app_metadata") or {}).get("senha_provisoria") is True
            and any(m.get("method") == "password" for m in claims.get("amr", [])), "o aluno entra com a senha provisória (marca e amr=password no JWT)")
    # negativos: outra profissional, o próprio aluno e anônimo
    to = B.sessao("w8b-outro")["access_token"]
    st, r = B.rpc(to, "paciente_redefinir_senha", {"p_paciente_id": pac["id"], "p_senha": "Outra12345"})
    p.check(st >= 400 and "sem_acesso" in json.dumps(r), f"outra profissional NÃO cria senha do aluno ({st})")
    st, r = B.rpc(to, "aluno_acesso", {"p_aluno": pac["id"]})
    p.check(st >= 400 and "sem_acesso" in json.dumps(r), f"outra profissional NÃO vê o acesso ({st})")
    st, r = B.rpc(tok, "paciente_redefinir_senha", {"p_paciente_id": pac["id"], "p_senha": "Minha12345"})
    p.check(st >= 400 and "sem_acesso" in json.dumps(r), f"o próprio aluno NÃO usa a RPC do profissional ({st})")
    st, r, _ = B.http("POST", f"{B.PRINCIPAL_URL}/rest/v1/rpc/paciente_redefinir_senha", {"p_paciente_id": pac["id"], "p_senha": "Anon123456"},
                      {"apikey": B.anon(B.PRINCIPAL_REF), "Content-Profile": S})
    p.check(st in (401, 403, 404), f"anônimo não chama ({st})")
    for fn in ("login_iniciar", "login_destravar"):
        st, r = B.rpc(tok, fn, {"p_email": email_a})
        p.check(st >= 400, f"{fn} só o servidor (aluno logado → {st})")
    # a pessoa grava a senha dela → some a marca
    st, r = B.rpc(tok, "minha_senha_definida", {})
    p.check(st == 200 and r is True and "senha_provisoria" not in B.meta(email_a), f"minha_senha_definida tira a marca ({st} {r})")
    st, r = B.rpc(tok, "minha_senha_definida", {})
    p.check(st == 200 and r is False, "2ª vez: nada a tirar")
    # devolve a senha de teste do Rafael (a de ~/.physiq-teste-w8b-aluno)
    B.garantir_usuario(email_a, B.CONTAS["w8b-aluno"][1], "Rafael Moura")
    # "Criar acesso" do aluno sem login
    novo = B.q(f"select id::text as id, user_id::text as u from {S}.pacientes where lower(email) = '{B.EMAIL_NOVO}' and deleted_at is null")[0]
    if novo.get("u"):
        sp = B.service(B.PRINCIPAL_REF)
        B.http("DELETE", f"{B.PRINCIPAL_URL}/auth/v1/admin/users/{novo['u']}", None, {"apikey": sp, "Authorization": f"Bearer {sp}"})
    B.q(f"insert into {S}.login_bloqueios (email, erros, bloqueado_ate) values ('{B.EMAIL_NOVO}', 5, now() + interval '5 minutes') on conflict (email) do nothing")
    senha_n = "Novo" + str(int(time.time()))[-6:] + "q"
    st, r = B.rpc(tp, "paciente_criar_acesso", {"p_paciente_id": novo["id"], "p_email": B.EMAIL_NOVO, "p_senha": senha_n})
    p.check(st == 200 and isinstance(r, str), f"personal cria o acesso do aluno sem login ({st})")
    p.check(B.meta(B.EMAIL_NOVO).get("senha_provisoria") is True and B.estado(B.EMAIL_NOVO) is None, "nasce provisória e o e-mail fica destravado")
    st, r = B.entrar_senha(B.EMAIL_NOVO, senha_n, "real", origem())
    p.check(st == 200, f"o aluno novo entra com a senha provisória ({st} {r.get('erro')})")
    st, d = B.rpc(tp, "aluno_acesso", {"p_aluno": novo["id"]})
    p.check(st == 200 and ((d or {}).get("acesso") or {}).get("senha_provisoria") is True, "card mostra o acesso novo com a senha provisória")


def caso_google() -> None:
    conta = conta_google()
    email, senha = B.CONTAS[conta]
    B.garantir_usuario(email, senha, B.NOMES[conta])
    B.identidade_google(conta)
    # a P25 roda 1 vez por conta: a descartável volta ao "nunca entrou com o Google" para a prova valer em toda rodada
    B.q(f"update auth.users set raw_app_meta_data = raw_app_meta_data - 'senha_trocada_google_em' - 'senha_provisoria' where lower(email) = '{email}'")
    B.q(f"""insert into {B.schema()}.login_bloqueios (email, erros, bloqueado_de_vez_em) values ('{email}', 9, now())
            on conflict (email) do update set erros = 9, bloqueado_de_vez_em = now(), bloqueado_ate = null""")
    st, r = B.entrar_senha(email, senha, "real", origem())
    p.check(st == 423 and r.get("erro") == "bloqueado_de_vez", f"conta bloqueada de vez recusa a senha certa ({st} {r.get('erro')})")
    st, sess, _ = B.http("POST", f"{B.API_P}/auth/v1/token?grant_type=password", {"email": email, "password": senha}, {"apikey": B.anon(B.PRINCIPAL_REF)})
    assert st == 200, (st, sess)
    st, r = B.pos_login(sess["access_token"], origem())
    p.check(st == 200 and not r.get("destravou") and B.estado(email) is not None, f"pos-login de um login por SENHA não destrava ({st} destravou={r.get('destravou')})")
    st, r = B.pos_login(B.jwt_de_login_google(sess), origem())
    p.check(st == 200 and r.get("login_google") is True and r.get("destravou") is True, f"pos-login de um login pelo GOOGLE destrava ({st} {r.get('login_google')} {r.get('destravou')})")
    p.check(B.estado(email) is None, "o contador sumiu no banco")
    p.check(r.get("senha_trocada") is True and B.meta(email).get("senha_provisoria") is False, "P25: a senha antiga virou aleatória (e a marca de provisória saiu)")
    st, r = B.entrar_senha(email, senha, "real", origem())
    p.check(st == 400 and r.get("erro") == "senha_errada", f"a senha antiga não vale mais depois do Google (P25) ({st} {r.get('erro')})")
    B.zerar(email)
    B.garantir_usuario(email, senha, B.NOMES[conta])


def meu_ip() -> str:
    with urllib.request.urlopen("https://api.ipify.org", timeout=20) as r:
        return r.read().decode().strip()


def caso_ip() -> None:
    conta = conta_escada()
    email, senha = B.CONTAS[conta]
    B.zerar(email)
    ip = meu_ip()
    h = B.hash_do_meu_ip()
    B.zerar_ips()
    st, r = B.entrar_senha(email, senha, "real", origem())
    linha = B.q(f"select tentativas from {B.schema()}.login_tentativas_ip where ip_hash = '{h}'")
    p.check(st == 200 and linha and linha[0]["tentativas"] == 1, f"pelo proxy a função conta o IP DE VERDADE deste aparelho ({ip}) ({linha})")
    B.q(f"update {B.schema()}.login_tentativas_ip set tentativas = 30 where ip_hash = '{h}'")
    st, r = B.entrar_senha(email, senha, "real", origem())
    p.check(st == 423 and r.get("erro") == "muitas_tentativas_rede" and r.get("bloqueado_ate"), f"30 na janela → muitas_tentativas_rede ({st} {r.get('erro')})")
    st, r = B.entrar_senha(email, senha, "real", origem(), pelo_proxy=False)
    p.check(st == 423 and r.get("erro") == "muitas_tentativas_rede", f"direto no supabase.co o IP é o mesmo (cf-connecting-ip) ({st} {r.get('erro')})")
    B.zerar_ips()
    B.zerar(email)


def caso_paralelo() -> None:
    conta = conta_escada()
    email, _ = B.CONTAS[conta]
    B.zerar(email)
    B.zerar_ips()
    toks = [B.token_real(), B.token_real()]
    with cf.ThreadPoolExecutor(2) as ex:
        rs = list(ex.map(lambda t: B.entrar_senha(email, "senha-errada-par", t, origem()), toks))
    erros = [r.get("erro") for _, r in rs]
    contados = sum(1 for e in erros if e == "senha_errada")
    e = B.estado(email) or {}
    p.check(e.get("erros") == contados and contados >= 1, f"2 ao mesmo tempo: o contador bate com as que foram conferidas ({erros} → erros={e.get('erros')})")
    B.zerar(email)


def caso_nutri_antigo() -> None:
    """O "Redefinir senha" do site ANTIGO do Nutri (a nutricionista dona do registro) usa a mesma RPC: marca provisória e destrava."""
    if B.schema() != "staging":
        return
    S = "staging"
    email_n = "nutri.teste.claude@physiqnutri.app"
    tn = B.http("POST", f"{B.API_P}/auth/v1/token?grant_type=password", {"email": email_n, "password": B.B5.senha("nutri")},
                {"apikey": B.anon(B.PRINCIPAL_REF)})[1]["access_token"]
    nutri_id = B.q(f"select id::text from auth.users where email = '{email_n}'")[0]["id"]
    email_p = f"w8b.nutri{int(time.time())}.teste.claude@physiqnutri.app"
    st, pac, _ = B.http("POST", f"{B.PRINCIPAL_URL}/rest/v1/pacientes", {"nome": "Paciente W8b (site antigo)", "nutricionista_id": nutri_id, "email": email_p},
                        {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {tn}", "Content-Profile": S, "Accept-Profile": S, "Prefer": "return=representation"})
    p.check(st == 201, f"nutri do site antigo cria o paciente ({st})")
    pid = pac[0]["id"]
    try:
        st, r = B.rpc(tn, "paciente_criar_acesso", {"p_paciente_id": pid, "p_email": email_p, "p_senha": "Inicial123"})
        p.check(st == 200, f"paciente_criar_acesso pela nutri dona do registro ({st})")
        B.q(f"insert into {S}.login_bloqueios (email, erros, bloqueado_de_vez_em) values ('{email_p}', 9, now())")
        st, r = B.rpc(tn, "paciente_redefinir_senha", {"p_paciente_id": pid, "p_senha": "Redefinida123"})
        p.check(st in (200, 204), f"'Redefinir senha' do site antigo ({st})")
        p.check(B.estado(email_p) is None and B.meta(email_p).get("senha_provisoria") is True, "destravou e marcou provisória (o site antigo também)")
        st, s, _ = B.http("POST", f"{B.API_P}/auth/v1/token?grant_type=password", {"email": email_p, "password": "Redefinida123"}, {"apikey": B.anon(B.PRINCIPAL_REF)})
        p.check(st == 200, f"o paciente entra no site antigo com a senha nova (Auth direto, como o /app/entrar) ({st})")
        st, r = B.rpc(tn, "paciente_acesso", {"p_paciente_id": pid})
        p.check(st == 200 and isinstance(r, dict) and r.get("email") == email_p and r.get("ativo") is True and "senha_provisoria" in r,
                "paciente_acesso mantém as chaves de antes (o site antigo lê) e ganha as novas")
    finally:
        u = B.q(f"select id::text from auth.users where lower(email) = '{email_p}'")
        sp = B.service(B.PRINCIPAL_REF)
        if u:
            B.http("DELETE", f"{B.PRINCIPAL_URL}/auth/v1/admin/users/{u[0]['id']}", None, {"apikey": sp, "Authorization": f"Bearer {sp}"})
        B.q(f"delete from {S}.pacientes where id = '{pid}'")
        B.zerar(email_p)


CASOS = {"captcha": caso_captcha, "staging": caso_staging, "escada": caso_escada, "rpc": caso_rpc, "google": caso_google, "ip": caso_ip,
         "paralelo": caso_paralelo, "nutri_antigo": caso_nutri_antigo}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schema", default="staging", choices=["staging", "public"])
    ap.add_argument("--casos", default=None)
    a = ap.parse_args()
    B.ESTADO["schema"] = a.schema
    padrao = "captcha,staging,escada,rpc,google,ip,paralelo,nutri_antigo" if a.schema == "staging" else "captcha,escada,google,ip"
    if not B.fonte_viva():
        print("a fonte de tokens do Turnstile não está rodando (python3 e2e/w08b/fonte_turnstile.py --porta 5173)")
        return 2
    for nome in [x.strip() for x in (a.casos or padrao).split(",") if x.strip()]:
        print(f"\n== {nome} ({a.schema})", flush=True)
        try:
            CASOS[nome]()
        except Exception as e:  # noqa: BLE001
            p.check(False, f"[{nome}] exceção: {type(e).__name__}: {str(e)[:400]}")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
