#!/usr/bin/env python3
"""Physiq W3 — E2E de API do login único (sem navegador), no schema escolhido (padrão staging), com as contas de teste:

  aluno do Calc (teste@teste.com)     login por senha no principal → pos-login → situação (Treino, matrícula na conta do
                                      professor) → trocar-token → sessão do Treino aceita pelo PowerSync e pelo REST
  professor do Calc (prof1)           conta legado_calc dono+personal com o mesmo código; troca → papel professor; admin-list-users
                                      lista os alunos dele
  master (admin.teste.claude)         o papel admin do Treino não é rebaixado; conta isenta
  nutri (nutri.teste.claude)          conta legado_nutri; NÃO precisa do Treino; escreve nutrição (restritiva deixa)
  paciente do Nutri                   matrícula só de Nutrição (sem Treino)
  pessoa nova (pessoa.teste.claude)   sem nada → Boas-vindas; NÃO vira nutricionista: não cria paciente, não escreve nutrição,
                                      não muda o próprio papel/teste/isenção (casos negativos)
  código do profissional              vincular-aluno: inválido, o próprio, P7 (aluno de outra conta), e o caminho bom
  conflito                            e-mail e senha com e-mail que já existe no Treino sem vínculo → trocar-token 409
  bloqueado pelo master               situação traz o bloqueio da conta do aluno
  aviso "o Physiq mudou"              ligado para quem veio do Calc; marcar como visto grava
Uso: python3 e2e/w03/pos_login_api.py [--schema staging|public]   (public = só leitura, as contas de teste)
"""
import argparse
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "w02"))
from _comum import PRINCIPAL_REF, TREINO_REF, Placar, anon, http, senha, sql_principal, sql_treino  # noqa: E402

API_P = "https://api-principal.physiqcalc.com.br"
API_T = "https://api.physiqcalc.com.br"
POWERSYNC = "https://69cc4d1df69619e9d4834456.powersync.journeyapps.com"
ORIGEM = "http://localhost:5173"
p = Placar()


def kv(nome: str) -> dict:
    return dict(l.strip().split("=", 1) for l in Path.home().joinpath(nome).read_text().splitlines() if "=" in l)


def login(email: str, senha_: str) -> dict:
    st, s, _ = http("POST", f"{API_P}/auth/v1/token?grant_type=password", {"email": email, "password": senha_}, {"apikey": anon(PRINCIPAL_REF)})
    assert st == 200, (email, st, s)
    return s


def funcao(nome: str, token: str, corpo: dict | None, schema: str) -> tuple[int, dict]:
    st, r, _ = http("POST", f"{API_P}/functions/v1/{nome}", corpo or {}, {"Authorization": f"Bearer {token}", "apikey": anon(PRINCIPAL_REF), "x-schema": schema, "Origin": ORIGEM})
    return st, (r if isinstance(r, dict) else {"_": r})


def rpc(nome: str, token: str, corpo: dict, schema: str) -> tuple[int, object]:
    st, r, _ = http("POST", f"{API_P}/rest/v1/rpc/{nome}", corpo, {"Authorization": f"Bearer {token}", "apikey": anon(PRINCIPAL_REF),
                                                                  "Content-Profile": schema, "Accept-Profile": schema})
    return st, r


def rest(metodo: str, caminho: str, token: str, corpo, schema: str) -> tuple[int, object]:
    st, r, _ = http(metodo, f"{API_P}/rest/v1/{caminho}", corpo, {"Authorization": f"Bearer {token}", "apikey": anon(PRINCIPAL_REF),
                                                                   "Content-Profile": schema, "Accept-Profile": schema, "Prefer": "return=representation"})
    return st, r


def trocar(token: str, schema: str) -> tuple[int, dict]:
    st, r, _ = http("POST", f"{API_T}/functions/v1/trocar-token", {}, {"Authorization": f"Bearer {token}", "x-schema": schema, "Origin": ORIGEM})
    return st, (r if isinstance(r, dict) else {"_": r})


def powersync(token: str) -> int:
    req = urllib.request.Request(f"{POWERSYNC}/sync/stream", method="POST",
                                 data=json.dumps({"buckets": [], "include_checksum": True, "raw_data": True, "client_id": "e2e-w03"}).encode(),
                                 headers={"Authorization": f"Token {token}", "Content-Type": "application/json", "User-Agent": "e2e-w03"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            r.readline()
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schema", default="staging", choices=["staging", "public"])
    a = ap.parse_args()
    s = a.schema
    escrever = s == "staging"
    admin, aluno = kv(".physiqcalc-teste-admin"), kv(".physiqcalc-teste-aluno-teste")

    print(f"== aluno do Calc (teste@teste.com) · schema {s}")
    sess = login("teste@teste.com", aluno["SENHA"])
    st, pl = funcao("pos-login", sess["access_token"], {}, s)
    sit = pl.get("situacao") or {}
    p.check(st == 200 and pl.get("ok"), f"pos-login 200 ({st})")
    p.check(sit.get("calc") is True and sit.get("precisa_treino") is True and "treino" in sit.get("modulos_aluno", []), f"situação: veio do Calc, precisa do Treino, módulo treino ({sit.get('modulos_aluno')})")
    mats = sit.get("matriculas", [])
    p.check(len(mats) >= 1 and (mats[0].get("personal") or {}).get("nome") is not None, f"matrícula na conta do professor ({[m.get('conta_nome') for m in mats]})")
    av = sit.get("aviso_mudanca") or {}
    p.check(av.get("publico") == "calc" and av.get("ativo") is True and av.get("titulo"), f"aviso 'o Physiq mudou' ligado para quem veio do Calc ({av.get('titulo')})")
    st, tt = trocar(sess["access_token"], s)
    p.check(st == 200 and tt.get("access_token"), f"trocar-token 200 ({st}, vínculo {tt.get('vinculo')})")
    if st == 200:
        treino_id = tt["treino_user_id"]
        esperado = sql_treino(f"select treino_user_id::text as tid from {s}.physiq_identidades where principal_user_id = '{sess['user']['id']}'")
        p.check(bool(esperado) and esperado[0]["tid"] == treino_id, "sessão do Treino é do usuário do vínculo (as séries antigas)")
        p.check(powersync(tt["access_token"]) == 200, "PowerSync aceita a sessão (/sync/stream 200)")
        st2, r2, _ = http("GET", f"{API_T}/rest/v1/tb_treino_series?select=id&limit=1", None, {"Authorization": f"Bearer {tt['access_token']}", "apikey": anon(TREINO_REF), "Accept-Profile": "public"})
        p.check(st2 == 200 and isinstance(r2, list) and len(r2) >= 1, f"REST do Treino com a sessão: séries antigas visíveis ({st2}, {len(r2) if isinstance(r2, list) else r2})")
    if escrever:
        st, _ = rpc("marcar_aviso_mudanca", sess["access_token"], {"p_versao": "e2e"}, s)
        st2, sit2 = rpc("minha_situacao", sess["access_token"], {}, s)
        p.check(st == 204 or st == 200, f"marcar_aviso_mudanca ({st})")
        sql_principal(f"update {s}.profiles set config = config #- '{{aviso_mudanca_visto,e2e}}' where id = '{sess['user']['id']}'")

    print("== professor do Calc (prof1.teste.claude)")
    sess = login("prof1.teste.claude@physiqcalc.app", admin["SENHA"])
    st, pl = funcao("pos-login", sess["access_token"], {}, s)
    sit = pl.get("situacao") or {}
    contas = sit.get("contas", [])
    p.check(st == 200 and any(c["origem"] == "legado_calc" and "personal" in c["papeis"] and c["codigo_convite"] == "PROF-RAFAEL-LIMA" for c in contas),
            f"conta legado_calc dono+personal com o mesmo código ({[(c['nome'], c['codigo_convite']) for c in contas]})")
    st, tt = trocar(sess["access_token"], s)
    p.check(st == 200 and tt.get("papel") == "professor", f"troca → papel professor no Treino ({st}, {tt.get('papel')})")
    if st == 200:
        st2, r2, _ = http("POST", f"{API_T}/functions/v1/admin-list-users", {"limit": 20}, {"Authorization": f"Bearer {tt['access_token']}", "apikey": anon(TREINO_REF), "x-schema": s, "Origin": ORIGEM})
        emails = sorted(u.get("email") or "" for u in (r2 or {}).get("users", []))
        p.check(st2 == 200 and any("aluno1" in e for e in emails), f"painel antigo: admin-list-users lista os alunos dele ({emails})")

    print("== master (admin.teste.claude)")
    sess = login("admin.teste.claude@physiqcalc.app", admin["SENHA"])
    st, pl = funcao("pos-login", sess["access_token"], {}, s)
    sit = pl.get("situacao") or {}
    p.check(st == 200 and any(c["situacao"] == "isenta" for c in sit.get("contas", [])), "conta do master de teste isenta")
    st, tt = trocar(sess["access_token"], s)
    p.check(st == 200 and tt.get("papel") in ("admin", "master"), f"papel admin do Treino NÃO rebaixado ({tt.get('papel')})")

    print("== nutricionista do Nutri (nutri.teste.claude)")
    sess = login("nutri.teste.claude@physiqnutri.app", senha("nutri"))
    st, pl = funcao("pos-login", sess["access_token"], {}, s)
    sit = pl.get("situacao") or {}
    p.check(any(c["origem"] == "legado_nutri" and "nutricionista" in c["papeis"] for c in sit.get("contas", [])), "conta legado_nutri dona+nutricionista")
    p.check(sit.get("precisa_treino") is False, "nutri não precisa do Treino (Dieta e painel de nutrição: site do PhysiqNutri por enquanto)")
    p.check((sit.get("legado_nutri") or {}).get("isento_assinatura") is True, "legado do Nutri na situação (trava do assinaturaUtil)")
    if escrever:
        st, r = rest("POST", "alimentos", sess["access_token"], {"nome": "E2E W3 alimento", "fonte": "proprio", "nutricionista_id": sess["user"]["id"]}, s)
        p.check(st == 201, f"nutricionista de verdade escreve na nutrição (restritiva deixa) ({st})")
        if st == 201:
            rest("DELETE", f"alimentos?id=eq.{r[0]['id']}", sess["access_token"], None, s)

    print("== paciente do Nutri")
    sess = login("paciente.teste.claude@physiqnutri.app", senha("paciente"))
    st, pl = funcao("pos-login", sess["access_token"], {}, s)
    sit = pl.get("situacao") or {}
    p.check(sit.get("modulos_aluno") == ["nutricao"] and sit.get("precisa_treino") is False, f"paciente: só Nutrição, sem Treino ({sit.get('modulos_aluno')})")

    print("== pessoa nova (pessoa.teste.claude) — ninguém vira nutricionista sozinho")
    sess = login("pessoa.teste.claude@physiqnutri.app", senha("pessoa"))
    st, pl = funcao("pos-login", sess["access_token"], {}, s)
    sit = pl.get("situacao") or {}
    p.check(sit.get("sem_nada") is True and not sit.get("contas") and not sit.get("matriculas"), "sem conta, sem matrícula → Boas-vindas")
    perfil = sql_principal(f"select role, teste_ate <= now() + interval '1 minute' as sem_teste from {s}.profiles where id = '{sess['user']['id']}'")[0]
    p.check(perfil["role"] == "pessoa" and perfil["sem_teste"], f"perfil 'pessoa' e sem teste de 14 dias ({perfil})")
    if escrever:
        st, r = rest("POST", "pacientes", sess["access_token"], {"nome": "E2E W3 paciente", "nutricionista_id": sess["user"]["id"]}, s)
        p.check(st in (401, 403), f"NÃO cria paciente como nutricionista ({st})")
        if st == 201:
            rest("DELETE", f"pacientes?id=eq.{r[0]['id']}", sess["access_token"], None, s)
        st, r = rest("POST", "alimentos", sess["access_token"], {"nome": "E2E W3 intruso", "fonte": "proprio", "nutricionista_id": sess["user"]["id"]}, s)
        p.check(st in (401, 403), f"NÃO escreve na nutrição (alimentos) ({st})")
        st, r = rest("PATCH", f"profiles?id=eq.{sess['user']['id']}", sess["access_token"], {"role": "nutricionista", "isento_assinatura": True, "teste_ate": "2099-01-01T00:00:00Z"}, s)
        depois = sql_principal(f"select role, isento_assinatura, teste_ate <= now() + interval '1 minute' as sem_teste from {s}.profiles where id = '{sess['user']['id']}'")[0]
        p.check(depois["role"] == "pessoa" and not depois["isento_assinatura"] and depois["sem_teste"], f"NÃO muda o próprio papel/isenção/teste ({st} → {depois})")

    print("== código do profissional (vincular-aluno)")
    sess = login("pessoa.teste.claude@physiqnutri.app", senha("pessoa"))
    st, r = funcao("vincular-aluno", sess["access_token"], {"codigo": "PROF-NAO-EXISTE-W3"}, s)
    p.check(st == 404 and r.get("erro") == "codigo_invalido", f"código inválido → 404 codigo_invalido ({st}, {r.get('erro')})")
    sess_prof = login("prof1.teste.claude@physiqcalc.app", admin["SENHA"])
    st, r = funcao("vincular-aluno", sess_prof["access_token"], {"codigo": "PROF-RAFAEL-LIMA"}, s)
    p.check(st == 409 and r.get("erro") == "proprio_codigo", f"o próprio código → proprio_codigo ({st}, {r.get('erro')})")
    sess_al = login("teste@teste.com", aluno["SENHA"])
    st, r = funcao("vincular-aluno", sess_al["access_token"], {"codigo": "PROF-RAFAEL-LIMA"}, s)
    p.check(st == 409 and r.get("erro") == "outro_profissional", f"aluno ativo em outra conta → outro_profissional (P7) ({st}, {r.get('erro')})")

    if escrever:
        print("== conflito (e-mail e senha, e-mail que já existe no Treino sem vínculo)")
        sess = login("conflito.teste.claude@physiqnutri.app", senha("conflito"))
        st, r = funcao("vincular-aluno", sess["access_token"], {"codigo": "PROF-RAFAEL-LIMA"}, s)
        p.check(st == 200 and r.get("ok"), f"conflito entra na lista do prof1 pelo código ({st}, {r.get('erro') or r.get('conta_nome')})")
        st, pl = funcao("pos-login", sess["access_token"], {}, s)
        p.check((pl.get("situacao") or {}).get("precisa_treino") is True, "agora precisa do Treino (matrícula com Treino)")
        st, tt = trocar(sess["access_token"], s)
        p.check(st == 409 and tt.get("error") == "conta_em_conflito", f"trocar-token → 409 conta_em_conflito ({st})")
        sql_principal(f"delete from {s}.pacientes where user_id = '{sess['user']['id']}'")

        print("== bloqueado pelo master (conta do aluno2)")
        conta = sql_principal(f"""select p.conta_id::text as c from {s}.pacientes p join auth.users u on u.id = p.user_id
             where u.email = 'aluno2.teste.claude@physiqcalc.app' and p.deleted_at is null limit 1""")[0]["c"]
        sql_principal(f"update {s}.contas set alunos_bloqueados_em = now(), alunos_bloqueados_msg = 'Pausa de teste E2E W3' where id = '{conta}'")
        try:
            sess = login("aluno2.teste.claude@physiqcalc.app", admin["SENHA"])
            st, sit = rpc("minha_situacao", sess["access_token"], {}, s)
            m = (sit or {}).get("matriculas", [{}])[0]
            p.check(m.get("conta_alunos_bloqueados_msg") == "Pausa de teste E2E W3", "situação traz o bloqueio da conta com a mensagem do master")
        finally:
            sql_principal(f"update {s}.contas set alunos_bloqueados_em = null, alunos_bloqueados_msg = null where id = '{conta}'")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
