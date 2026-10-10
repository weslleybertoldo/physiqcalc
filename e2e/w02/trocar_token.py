#!/usr/bin/env python3
"""Physiq W2 — prova de ponta a ponta da trocar-token e do espelho (spec §7.4, §8.3; critério de pronto da W2).

Roda no schema staging com as contas de teste (e2e/w02/contas_teste.py) e a conta de teste da W2 no banco principal
(e2e/w02/massa_conta_teste.py). Casos:
  1. sem token → 401 · 2. token inválido → 401 · 3. token revogado (logout) → 401
  4. personal (e-mail e senha, e-mail novo no Treino) → sessão do Treino aceita pelo PowerSync (/sync/stream), pelo
     /auth/v1/user e pelo REST (schema staging); papel professor; physiq_professores com o acesso espelhado
  5. aluno → professor_id = personal no Treino, conta, sexo e nascimento espelhados; 2ª troca reaproveita o vínculo
  6. e-mail e senha com e-mail que já existe no Treino, sem vínculo → 409 conta_em_conflito (+ registro pro master)
  7. limite de tentativas (check_rate_limit 20/h) → 429
  8. espelho-enviar: a conta muda no principal → a fila leva o acesso novo pro Treino
Uso: python3 e2e/w02/trocar_token.py
"""
import datetime as dt
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _comum import (  # noqa: E402
    PRINCIPAL_URL, TREINO_REF, TREINO_URL, Placar, anon, exec_treino, http, login_principal, segredo_fila,
    sql_principal, sql_treino,
)

SCHEMA = "staging"
TROCAR = f"{TREINO_URL}/functions/v1/trocar-token"
API_TREINO = "https://api.physiqcalc.com.br"
POWERSYNC = "https://69cc4d1df69619e9d4834456.powersync.journeyapps.com"
CONTA = "0a0a0a0a-0000-4000-8000-00000000c0a1"
ORIGEM = "https://physiqcalc-staging.vercel.app"
p = Placar()


def trocar(token: str | None) -> tuple[int, dict]:
    cab = {"x-schema": SCHEMA, "Origin": ORIGEM}
    if token is not None:
        cab["Authorization"] = f"Bearer {token}"
    st, r, h = http("POST", TROCAR, {}, cab)
    return st, (r if isinstance(r, dict) else {"_": r}) | {"_cors": h.get("Access-Control-Allow-Origin") or h.get("access-control-allow-origin")}


def powersync(token: str) -> tuple[int, str]:
    req = urllib.request.Request(f"{POWERSYNC}/sync/stream", method="POST",
                                 data=json.dumps({"buckets": [], "include_checksum": True, "raw_data": True, "client_id": "e2e-w02"}).encode(),
                                 headers={"Authorization": f"Token {token}", "Content-Type": "application/json", "User-Agent": "e2e-w02"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return r.status, r.readline().decode("utf-8", "replace").strip()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:200]


def principal_id(email: str) -> str:
    return sql_principal(f"select id from auth.users where email = '{email}'")[0]["id"]


def main() -> int:
    anon_t = anon(TREINO_REF)
    # ---------------- 1–3: token ausente, inválido e revogado ----------------
    st, r = trocar(None)
    p.check(st == 401 and r.get("error") == "missing_auth", f"1. sem token → {st} {r.get('error')}")
    st, r = trocar("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJubyJ9.assinatura-falsa")
    p.check(st == 401 and r.get("error") == "invalid_token", f"2. token inválido → {st} {r.get('error')}")
    s_rev = login_principal("limite", "limite.teste.claude@physiqnutri.app")
    http("POST", f"{PRINCIPAL_URL}/auth/v1/logout?scope=global", {}, {"apikey": anon("hkxvtsbwctxkrqzkkdoz"), "Authorization": f"Bearer {s_rev['access_token']}"})
    st, r = trocar(s_rev["access_token"])
    p.check(st == 401 and r.get("error") == "invalid_token", f"3. token revogado (logout) → {st} {r.get('error')}")

    # ---------------- 4: personal ----------------
    s_pers = login_principal("personal", "personal.teste.claude@physiqnutri.app")
    st, r = trocar(s_pers["access_token"])
    ok4 = p.check(st == 200 and r.get("access_token") and r.get("refresh_token"), f"4. personal: troca → {st} (papel {r.get('papel')}, vínculo {r.get('vinculo')}, espelho {r.get('espelho')})")
    p.check(r.get("_cors") == ORIGEM, f"4. CORS devolve a origem do staging ({r.get('_cors')})")
    if not ok4:
        return p.fim()
    t_pers, pers_treino = r["access_token"], r["treino_user_id"]
    p.check(r.get("papel") == "professor", "4. papel no Treino = professor (personal numa conta com Treino)")
    st_u, u, _ = http("GET", f"{API_TREINO}/auth/v1/user", cab={"apikey": anon_t, "Authorization": f"Bearer {t_pers}"})
    p.check(st_u == 200 and u.get("id") == pers_treino and (u.get("app_metadata") or {}).get("role") == "professor",
            f"4. api.physiqcalc.com.br/auth/v1/user aceita a sessão (id {u.get('id') if isinstance(u, dict) else u})")
    st_ps, linha = powersync(t_pers)
    p.check(st_ps == 200 and linha.startswith("{"), f"4. PowerSync /sync/stream aceita o token do Treino → {st_ps} {linha[:90]}")
    st_rest, perfil, _ = http("GET", f"{API_TREINO}/rest/v1/physiq_profiles?select=id,email&id=eq.{pers_treino}",
                              cab={"apikey": anon_t, "Authorization": f"Bearer {t_pers}", "Accept-Profile": SCHEMA})
    p.check(st_rest == 200 and isinstance(perfil, list) and len(perfil) == 1, f"4. REST no schema staging lê o próprio perfil → {st_rest} {perfil}")
    prof = sql_treino(f"select codigo_convite, status, nucleo_acesso_ate::text, acesso_liberado_ate::text from staging.physiq_professores where id = '{pers_treino}'")
    teste_ate = sql_principal(f"select teste_ate::text from staging.contas where id = '{CONTA}'")[0]["teste_ate"]
    p.check(len(prof) == 1 and prof[0]["nucleo_acesso_ate"] == teste_ate and prof[0]["acesso_liberado_ate"] == teste_ate and prof[0]["status"] == "ativo",
            f"4. physiq_professores (staging) com o acesso espelhado da conta em teste até {teste_ate}: {prof}")
    esp = sql_treino(f"select papeis, ativo from staging.physiq_espelho_membros where conta_id = '{CONTA}' and treino_user_id = '{pers_treino}'")
    p.check(esp == [{"papeis": ["dono", "personal"], "ativo": True}], f"4. physiq_espelho_membros: {esp}")
    ident = sql_treino(f"select origem from staging.physiq_identidades where treino_user_id = '{pers_treino}'")
    p.check(ident == [{"origem": "criado"}], f"4. vínculo gravado em physiq_identidades: {ident}")
    amb = sql_treino(f"select raw_user_meta_data->>'ambiente' as a from auth.users where id = '{pers_treino}'")
    p.check(amb == [{"a": "staging"}], "4. usuário do Treino criado com ambiente=staging (perfil só no schema staging)")

    # ---------------- 5: aluno ----------------
    s_aluno = login_principal("aluno", "aluno.teste.claude@physiqnutri.app")
    st, r = trocar(s_aluno["access_token"])
    p.check(st == 200 and r.get("access_token"), f"5. aluno: troca → {st} (papel {r.get('papel')}, espelho {r.get('espelho')})")
    aluno_treino = r.get("treino_user_id")
    pf = sql_treino(f"select professor_id, conta_id, sexo, data_nascimento::text as nasc, nome from staging.physiq_profiles where id = '{aluno_treino}'")
    p.check(pf and pf[0]["professor_id"] == pers_treino and pf[0]["conta_id"] == CONTA and pf[0]["sexo"] == "male" and pf[0]["nasc"] == "1995-05-20",
            f"5. physiq_profiles do aluno (staging): {pf}")
    p.check(r.get("papel") is None, "5. aluno fica sem papel no Treino")
    st2, r2 = trocar(s_aluno["access_token"])
    p.check(st2 == 200 and r2.get("treino_user_id") == aluno_treino and r2.get("vinculo") == "criado",
            f"5. 2ª troca reaproveita o vínculo (mesmo usuário do Treino) → {st2}")
    st_ps2, linha2 = powersync(r2["access_token"])
    p.check(st_ps2 == 200, f"5. PowerSync aceita a sessão do aluno → {st_ps2} {linha2[:60]}")

    # ---------------- 6: conflito ----------------
    s_conf = login_principal("conflito", "conflito.teste.claude@physiqnutri.app")
    st, r = trocar(s_conf["access_token"])
    p.check(st == 409 and r.get("error") == "conta_em_conflito", f"6. e-mail e senha + e-mail já no Treino sem vínculo → {st} {r.get('error')}")
    reg = sql_treino(f"select email, motivo from staging.physiq_identidade_conflitos where principal_user_id = '{principal_id('conflito.teste.claude@physiqnutri.app')}'")
    p.check(len(reg) == 1, f"6. conflito registrado pro master: {reg}")
    ninguem = sql_treino(f"select count(*)::int as n from staging.physiq_identidades where principal_user_id = '{principal_id('conflito.teste.claude@physiqnutri.app')}'")
    p.check(ninguem == [{"n": 0}], "6. nenhum vínculo criado pro conflito (ninguém toma a conta do outro)")

    # ---------------- 7: limite de tentativas ----------------
    lim_id = principal_id("limite.teste.claude@physiqnutri.app")
    exec_treino(f"delete from staging.edge_rate_limits where user_id = '{lim_id}'; "
                f"insert into staging.edge_rate_limits (user_id, endpoint) select '{lim_id}', 'trocar-token' from generate_series(1, 18)")
    s_lim = login_principal("limite", "limite.teste.claude@physiqnutri.app")
    sts = [trocar(s_lim["access_token"])[0] for _ in range(3)]
    p.check(sts[:2] == [200, 200] and sts[2] == 429, f"7. 19ª e 20ª troca na hora passam, a 21ª é recusada → {sts}")
    exec_treino(f"delete from staging.edge_rate_limits where user_id = '{lim_id}'")

    # ---------------- 8: espelho-enviar (a conta paga no principal → acesso novo no Treino) ----------------
    vence = (dt.date.today() + dt.timedelta(days=30)).isoformat()
    sql_principal(f"update staging.contas set situacao = 'ativa', vence_em = '{vence}' where id = '{CONTA}'; "
                  f"select staging.espelho_enfileirar('conta', jsonb_build_object('conta_id', '{CONTA}'::text))")
    st, r, _ = http("POST", "https://hkxvtsbwctxkrqzkkdoz.supabase.co/functions/v1/espelho-enviar", {},
                    {"x-espelho-segredo": segredo_fila(), "x-schema": SCHEMA})  # S8 (hml-16c)
    p.check(st == 200 and r.get("processadas", 0) >= 1 and all(x.get("resultado") == "feito" for x in r.get("resultados", [])),
            f"8. espelho-enviar processou a fila → {st} {r}")
    prof2 = sql_treino(f"select nucleo_acesso_ate::text, acesso_liberado_ate::text from staging.physiq_professores where id = '{pers_treino}'")
    p.check(prof2 and prof2[0]["nucleo_acesso_ate"] == vence and prof2[0]["acesso_liberado_ate"] == vence,
            f"8. Treino recebeu o acesso novo (vence_em {vence}): {prof2}")
    st_ps_bad, _ = powersync("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJubyJ9.x")
    p.check(st_ps_bad == 401, f"contraprova: PowerSync recusa token inválido → {st_ps_bad}")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
