#!/usr/bin/env python3
"""Physiq W2 — api-principal.physiqcalc.com.br (Worker physiq-principal-api) responde igual ao host direto do banco principal:
/auth/v1/health, /rest/v1/, o 302 do OAuth (sem seguir o redirect), login por senha, REST com schema e CORS das funções.
Uso: python3 e2e/w02/proxy_principal.py
"""
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _comum import PRINCIPAL_REF, PRINCIPAL_URL, Placar, anon, http, senha, sql_principal  # noqa: E402

PROXY = "https://api-principal.physiqcalc.com.br"
p = Placar()


def sem_state(location: str) -> tuple:
    u = urllib.parse.urlsplit(location or "")
    q = {k: v for k, v in urllib.parse.parse_qs(u.query).items() if k not in ("state", "code_challenge")}
    return (u.scheme, u.netloc, u.path, tuple(sorted((k, tuple(v)) for k, v in q.items())))


def main() -> int:
    a = anon(PRINCIPAL_REF)
    st, corpo, _ = http("GET", f"{PROXY}/healthz")
    p.check(st == 200 and "physiq-principal-api ok" in str(corpo), f"/healthz do Worker → {st}")

    d = http("GET", f"{PRINCIPAL_URL}/auth/v1/health", cab={"apikey": a})
    x = http("GET", f"{PROXY}/auth/v1/health", cab={"apikey": a})
    p.check(d[0] == x[0] == 200 and d[1] == x[1], f"/auth/v1/health igual: direto {d[0]} {d[1]} · proxy {x[0]} {x[1]}")

    d = http("GET", f"{PRINCIPAL_URL}/rest/v1/", cab={"apikey": a, "Authorization": f"Bearer {a}"})
    x = http("GET", f"{PROXY}/rest/v1/", cab={"apikey": a, "Authorization": f"Bearer {a}"})
    p.check(d[0] == x[0] and d[1] == x[1], f"/rest/v1/ igual: direto {d[0]} · proxy {x[0]} (corpo idêntico: {d[1] == x[1]})")

    q = urllib.parse.urlencode({"provider": "google", "redirect_to": "https://physiqcalc.com.br/"})
    d = http("GET", f"{PRINCIPAL_URL}/auth/v1/authorize?{q}", cab={"apikey": a}, seguir=False)
    x = http("GET", f"{PROXY}/auth/v1/authorize?{q}", cab={"apikey": a}, seguir=False)
    ld, lx = d[2].get("Location") or d[2].get("location"), x[2].get("Location") or x[2].get("location")
    p.check(d[0] == x[0] == 302 and sem_state(ld) == sem_state(lx) and "accounts.google.com" in (lx or ""),
            f"302 do OAuth igual (fora o state): direto {d[0]} · proxy {x[0]} → {(lx or '')[:70]}…")
    cb = urllib.parse.parse_qs(urllib.parse.urlsplit(lx or "").query).get("redirect_uri", [""])[0]
    p.check(cb == f"{PRINCIPAL_URL}/auth/v1/callback", f"o callback do Google continua no host da Supabase ({cb})")

    s = http("POST", f"{PROXY}/auth/v1/token?grant_type=password",
             {"email": "nutri.teste.claude@physiqnutri.app", "password": senha("nutri")}, {"apikey": a})
    p.check(s[0] == 200 and s[1].get("access_token"), f"login por e-mail e senha pelo proxy → {s[0]}")
    if s[0] == 200:
        tk, uid = s[1]["access_token"], s[1]["user"]["id"]
        cab = {"apikey": a, "Authorization": f"Bearer {tk}", "Accept-Profile": "staging"}
        d = http("GET", f"{PRINCIPAL_URL}/rest/v1/profiles?select=id,role,email&id=eq.{uid}", cab=cab)
        x = http("GET", f"{PROXY}/rest/v1/profiles?select=id,role,email&id=eq.{uid}", cab=cab)
        p.check(d[0] == x[0] == 200 and d[1] == x[1] and len(x[1]) == 1, f"REST com schema staging igual pelos 2 hosts → {x[1]}")
        u = http("GET", f"{PROXY}/auth/v1/user", cab={"apikey": a, "Authorization": f"Bearer {tk}"})
        p.check(u[0] == 200 and u[1].get("id") == uid, "GET /auth/v1/user pelo proxy aceita o token emitido pelo proxy")

    # Redirect URLs do Auth do principal (spec 7.2): o destino fica gravado no flow_state (fora da lista → site_url do Nutri)
    for destino in ("https://physiqcalc.com.br/entrar", "https://physiqcalc-staging.vercel.app/entrar", "http://localhost:5173/entrar",
                    "com.bertoldo.physiqcalc://login-callback"):
        q = urllib.parse.urlencode({"provider": "google", "redirect_to": destino})
        st, _, _ = http("GET", f"{PROXY}/auth/v1/authorize?{q}", cab={"apikey": a}, seguir=False)
        ref = sql_principal("select referrer from auth.flow_state order by created_at desc limit 1")
        p.check(st == 302 and ref and ref[0]["referrer"] == destino, f"Redirect URL aceita pelo Auth do principal: {destino} → {ref}")

    for fn in ("mp-assinar", "whatsapp-conectar"):
        o = http("OPTIONS", f"{PROXY}/functions/v1/{fn}", cab={"Origin": "https://physiqcalc.com.br", "Access-Control-Request-Method": "POST"})
        acao = o[2].get("Access-Control-Allow-Origin") or o[2].get("access-control-allow-origin")
        p.check(o[0] == 200 and acao == "https://physiqcalc.com.br", f"CORS de {fn} pelo proxy aceita o Physiq → {o[0]} {acao}")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
