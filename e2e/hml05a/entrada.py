#!/usr/bin/env python3
"""Physiq hml-05a (homologação, 08/10/2026) — entrada pública. No banco, SÓ LEITURA (vale em staging e em produção).

  cadastro  a RPC do cadastro pelo link (`cadastro_link_enviar`) só para o servidor: visitante e logado sem EXECUTE; com o papel
            `authenticated` (uuid inventado, transação só leitura) → sem permissão; no staging, a conta de TESTE logada chamando
            pela API → 401/403. Quem grava é a função `alunos` (servidor, depois do captcha).
  captcha   `entrar-senha` e `alunos` (cadastro pelo link) recusam token inválido e pedido sem token com `captcha_invalido` (o mesmo
            código que as telas já conhecem); a falha FECHADA (Cloudflare fora do ar ou sem segredo) usa esse mesmo caminho.
  treino    o Auth do Treino com o cadastro fechado; o Worker api.physiqcalc.com.br barra login por senha e cadastro (403 dele);
            refresh e health passam. O pedido de cadastro só é feito com o cadastro do Treino JÁ fechado (nunca cria conta).

Uso: python3 e2e/hml05a/entrada.py --schema staging|public [--so cadastro|captcha|treino]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "w02"))
from _comum import PRINCIPAL_REF, PRINCIPAL_URL, TREINO_REF, TREINO_URL, Placar, anon, http, login_principal, pat  # noqa: E402

UUID_FALSO = "00000000-0000-4000-8000-00000000abcd"
WORKER_TREINO = "https://api.physiqcalc.com.br"
EMAIL_FALSO = "hml05a.nao.existe.teste.claude@physiqnutri.app"


def ler(ref: str, sql: str) -> tuple[int, object]:
    """Uma consulta só leitura; devolve (status, linhas ou mensagem de erro)."""
    st, r, _ = http("POST", f"https://api.supabase.com/v1/projects/{ref}/database/query",
                    {"query": "set transaction read only;\n" + sql}, {"Authorization": f"Bearer {pat()}"}, timeout=180)
    return st, r


def como(papel: str, claims: str, consulta: str) -> str:
    return (f"select set_config('request.jwt.claims', {claims}, true);\n"
            f"select set_config('role', '{papel}', true);\n{consulta}")


def cadastro(S: str, p: Placar) -> None:
    st, r = ler(PRINCIPAL_REF, f"""
      select has_function_privilege('anon', p.oid, 'EXECUTE') as visitante,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as logado,
             has_function_privilege('service_role', p.oid, 'EXECUTE') as servidor
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = '{S}' and p.proname = 'cadastro_link_enviar'""")
    ok = st in (200, 201) and isinstance(r, list) and len(r) == 1
    p.check(ok and not r[0]["visitante"] and not r[0]["logado"] and r[0]["servidor"],
            f"[principal/{S}] cadastro_link_enviar só para o servidor ({r[0] if ok else r})")
    claims = f"json_build_object('sub', '{UUID_FALSO}', 'role', 'authenticated')::text"
    st, r = ler(PRINCIPAL_REF, como("authenticated", claims, f"select {S}.cadastro_link_enviar('codigo-inexistente', '{{}}'::jsonb)"))
    p.check(st == 400 and "permission denied" in str(r), f"[principal/{S}] logado (uuid inventado) chamando a RPC → sem permissão (HTTP {st})")
    if S != "staging":
        return
    sess = login_principal("w5p-aluna", "w5p.aluna.teste.claude@physiqnutri.app")
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/rest/v1/rpc/cadastro_link_enviar", {"p_codigo": "codigo-inexistente", "p_dados": {}},
                    {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {sess['access_token']}", "Content-Profile": "staging"})
    p.check(st in (401, 403) and "42501" in str(r), f"[principal/staging] conta de teste logada chamando a RPC pela API → {st} (sem permissão)")
    http("POST", f"{PRINCIPAL_URL}/auth/v1/logout?scope=local", None,
         {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {sess['access_token']}"})


def captcha(S: str, p: Placar) -> None:
    """Captcha ligado nas funções do principal (pelo Worker, como o app). Tudo para no captcha, antes de qualquer gravação."""
    base = "https://api-principal.physiqcalc.com.br/functions/v1"
    cab = {"apikey": anon(PRINCIPAL_REF), "x-schema": S, "Origin": "https://physiqcalc.com.br"}
    for nome, tok in (("token inválido", "token-invalido"), ("sem token", "")):
        st, r, _ = http("POST", f"{base}/entrar-senha", {"email": EMAIL_FALSO, "senha": "x" * 12, "captcha": tok}, cab)
        p.check(st == 400 and isinstance(r, dict) and r.get("erro") == "captcha_invalido", f"[principal/{S}] entrar-senha, {nome} → {st} {r}")
        st, r, _ = http("POST", f"{base}/alunos", {"acao": "cadastro_enviar", "codigo": "codigo-inexistente", "dados": {}, "captcha": tok}, cab)
        p.check(st == 400 and isinstance(r, dict) and r.get("erro") == "captcha_invalido", f"[principal/{S}] cadastro pelo link, {nome} → {st} {r}")
    st, r, _ = http("POST", f"{base}/alunos", {"acao": "cadastro_info", "codigo": "codigo-inexistente"}, cab)
    p.check(st in (400, 404) and isinstance(r, dict) and r.get("ok") is False, f"[principal/{S}] cadastro_info segue respondendo → {st} {r}")


def treino(p: Placar) -> None:
    st, cfg, _ = http("GET", f"https://api.supabase.com/v1/projects/{TREINO_REF}/config/auth", None, {"Authorization": f"Bearer {pat()}"})
    fechado = st == 200 and cfg.get("disable_signup") is True
    p.check(fechado, f"[treino] Auth com o cadastro fechado (disable_signup={cfg.get('disable_signup') if st == 200 else st})")
    st, _, _ = http("GET", f"{WORKER_TREINO}/healthz")
    p.check(st == 200, f"[treino] Worker no ar ({st})")
    chave = {"apikey": anon(TREINO_REF), "Content-Type": "application/json"}
    st, r, _ = http("POST", f"{WORKER_TREINO}/auth/v1/token?grant_type=password", {"email": EMAIL_FALSO, "password": "x" * 12}, chave)
    p.check(st == 403 and "barrado" in str(r), f"[treino] login por senha pelo Worker → {st} (barrado no Worker)")
    st, r, _ = http("POST", f"{WORKER_TREINO}/auth/v1/token?grant_type=refresh_token", {"refresh_token": "nao-existe"}, chave)
    p.check(st in (400, 401) and "barrado" not in str(r), f"[treino] refresh pelo Worker chega ao Auth → {st}")
    if not fechado:
        p.check(False, "[treino] cadastro: NÃO testado (o cadastro do Treino ainda está aberto — o pedido criaria uma conta)")
        return
    st, r, _ = http("POST", f"{WORKER_TREINO}/auth/v1/signup", {"email": EMAIL_FALSO, "password": "x" * 12}, chave)
    p.check(st == 403 and "barrado" in str(r), f"[treino] cadastro pelo Worker → {st} (barrado no Worker)")
    st, r, _ = http("POST", f"{TREINO_URL}/auth/v1/signup", {"email": EMAIL_FALSO, "password": "x" * 12}, chave)
    p.check(st in (400, 403, 422) and "signup" in str(r).lower(), f"[treino] cadastro direto no Auth → {st} (cadastro fechado)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schema", choices=["staging", "public"], required=True)
    ap.add_argument("--so", choices=["cadastro", "captcha", "treino"])
    a = ap.parse_args()
    p = Placar()
    if a.so in (None, "cadastro"):
        cadastro(a.schema, p)
    if a.so in (None, "captcha"):
        captcha(a.schema, p)
    if a.so in (None, "treino"):
        treino(p)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
