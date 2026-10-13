#!/usr/bin/env python3
"""Physiq W-A P2 — o FALSO do Supabase para a prova LOCAL das 3 funções da W-A (o e2e/wa/api.py --local). Escuta SÓ em 127.0.0.1, em 2 portas
que dividem o mesmo estado:
  principal (--principal)  GET /auth/v1/user — o Bearer da tabela USUARIOS com o apikey CHAVE_PUBLICA → { id }; outro → 401 (o cenário força
                           outro status por token) · POST /rest/v1/rpc/<nome> — só as 25 RPCs da pessoa das 3 migrations da W-A, com os NOMES dos
                           parâmetros LIDOS das próprias migrations (a mais, a menos ou outro nome → 404 PGRST202, como o PostgREST); a resposta
                           é a do cenário (senão a padrão); o schema (Content-Profile) e o usuário do token ficam no pedido.
  treino    (--treino)     GET /rest/v1/physiq_identidades e /rest/v1/physiq_profiles (o filtro eq. do PostgREST; o cenário) e PATCH
                           /rest/v1/physiq_profiles?id=eq.<id> (grava no cenário) — só com o Bearer e o apikey da CHAVE_SERVICO_TREINO.
Controle (nas 2): GET /_pedidos (tudo o que chegou desde o último zerar, inclusive rota desconhecida) · POST /_cenario (as chaves que vierem
trocam as de antes; "rpc" junta) · POST /_zerar (pedidos vazios e o cenário de base). Nada aqui é o Supabase de verdade; nenhum dado de gente.
Uso: python3 e2e/wa/supabase_falso.py --principal 8795 --treino 8796      (python3 e2e/wa/supabase_falso.py --autoteste: as portas livres do SO)
"""
from __future__ import annotations

import argparse
import copy
import json
import re
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

REPO = Path(__file__).resolve().parents[2]
MIGRATIONS = ("20261012200000_wa1_acessos.sql", "20261012210000_wa2_rotinas.sql", "20261012220000_wa3_dieta_livre.sql")
CHAVE_PUBLICA = "anon-falsa-wa-local"
CHAVE_SERVICO_TREINO = "servico-falso-treino-wa-local"
# as contas da prova local (tokens com 13+ caracteres: a porta-pessoa recusa o "Bearer x" curto) — nada de gente
USUARIOS = {
    "tok-local-nutri-0001": "a0000000-0000-4000-8000-000000000001",
    "tok-local-personal-02": "a0000000-0000-4000-8000-000000000002",
    "tok-local-aluna-00003": "a0000000-0000-4000-8000-000000000003",
    "tok-local-dono-b-0005": "a0000000-0000-4000-8000-000000000005",
}
MATRICULA = "b0000000-0000-4000-8000-0000000000a1"
CONTA_A = "c0000000-0000-4000-8000-0000000000a1"
TREINO_ALUNA = "d0000000-0000-4000-8000-0000000000a1"
ASSINATURA = re.compile(r"create or replace function \{schema\}\.([a-z_]+)\(([^)]*)\)\s*returns jsonb")


def assinaturas() -> dict[str, list[str]]:
    """As RPCs da pessoa das 3 migrations (as internas wa_* ficam de fora; as de LGPD da wa3 são em maiúsculas e não casam) e os parâmetros."""
    saida: dict[str, list[str]] = {}
    for m in MIGRATIONS:
        texto = (REPO / "supabase-principal" / "migrations" / m).read_text(encoding="utf-8")
        for nome, params in ASSINATURA.findall(texto):
            if not nome.startswith("wa_"):
                saida[nome] = [p.strip().split()[0] for p in params.split(",") if p.strip()]
    return saida


ACESSOS_PADRAO = {
    "ok": True, "paciente_id": MATRICULA, "user_id": USUARIOS["tok-local-aluna-00003"], "conta_id": CONTA_A, "treino_user_id": None, "tem_login": True,
    "conta_modulos": ["treino", "nutricao"], "modulos": ["treino", "nutricao"], "tem_nutricionista": True, "pode_mudar": True,
    "linhas": {"acesso_app": "liberado", "diario_alimentar": "liberado", "acesso_link": "liberado", "dieta": "ver"}, "mudancas": {},
}
BASE = {
    "rpc": {"acessos_ler": {"status": 200, "corpo": ACESSOS_PADRAO}, "acessos_salvar": {"status": 200, "corpo": ACESSOS_PADRAO}},
    "auth": {},                                                          # token → status forçado no /auth/v1/user (ex.: 500)
    "identidades": {USUARIOS["tok-local-aluna-00003"]: TREINO_ALUNA},   # principal_user_id → treino_user_id
    "perfis": {TREINO_ALUNA: {"conta_id": CONTA_A, "series_travadas": True}},
}


class Estado:
    def __init__(self) -> None:
        self.trava = threading.Lock()
        self.pedidos: list[dict] = []
        self.cenario = copy.deepcopy(BASE)

    def anotar(self, p: dict) -> None:
        with self.trava:
            self.pedidos.append(p)

    def zerar(self) -> None:
        with self.trava:
            self.pedidos = []
            self.cenario = copy.deepcopy(BASE)

    def trocar(self, novo: dict) -> None:
        with self.trava:
            for k, v in novo.items():
                if k == "rpc" and isinstance(v, dict):
                    self.cenario["rpc"].update(v)
                else:
                    self.cenario[k] = v


def manipulador(papel: str, estado: Estado, rpcs: dict[str, list[str]]):
    class Falso(BaseHTTPRequestHandler):
        def log_message(self, *_a) -> None:  # silêncio no console
            pass

        def _responder(self, status: int, corpo: object) -> None:
            dados = json.dumps(corpo).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(dados)))
            self.end_headers()
            self.wfile.write(dados)

        def _corpo(self) -> object:
            n = int(self.headers.get("Content-Length") or 0)
            bruto = self.rfile.read(n) if n else b""
            try:
                return json.loads(bruto or b"null")
            except ValueError:
                return {"_ilegivel": True}

        def _token(self) -> str:
            a = self.headers.get("Authorization") or ""
            return a[7:].strip() if a.startswith("Bearer ") else ""

        def _anotar(self, metodo: str, caminho: str, corpo: object, **extra: object) -> None:
            estado.anotar({"papel": papel, "metodo": metodo, "caminho": caminho, "corpo": corpo,
                           "schema": self.headers.get("Content-Profile") or self.headers.get("Accept-Profile"),
                           "usuario": USUARIOS.get(self._token()), **extra})

        def do_GET(self) -> None:  # noqa: N802
            u = urlparse(self.path)
            if u.path == "/_pedidos":
                return self._responder(200, estado.pedidos)
            if papel == "principal" and u.path == "/auth/v1/user":
                tok = self._token()
                self._anotar("GET", u.path, None)
                forcado = estado.cenario["auth"].get(tok)
                if forcado:
                    return self._responder(int(forcado), {"msg": "forçado pelo cenário"})
                if self.headers.get("apikey") != CHAVE_PUBLICA or tok not in USUARIOS:
                    return self._responder(401, {"code": 401, "msg": "invalid JWT"})
                return self._responder(200, {"id": USUARIOS[tok], "aud": "authenticated", "role": "authenticated"})
            if papel == "treino" and u.path in ("/rest/v1/physiq_identidades", "/rest/v1/physiq_profiles"):
                return self._tabela_treino("GET", u)
            self._anotar("GET", u.path, None, desconhecida=True)
            return self._responder(404, {"message": "rota do falso desconhecida"})

        def do_POST(self) -> None:  # noqa: N802
            u = urlparse(self.path)
            corpo = self._corpo()
            if u.path == "/_zerar":
                estado.zerar()
                return self._responder(200, {"ok": True})
            if u.path == "/_cenario":
                estado.trocar(corpo if isinstance(corpo, dict) else {})
                return self._responder(200, {"ok": True})
            m = re.match(r"^/rest/v1/rpc/([a-z_]+)$", u.path)
            if papel == "principal" and m:
                return self._rpc(m.group(1), corpo)
            self._anotar("POST", u.path, None, desconhecida=True)
            return self._responder(404, {"message": "rota do falso desconhecida"})

        def do_PATCH(self) -> None:  # noqa: N802
            u = urlparse(self.path)
            if papel == "treino" and u.path == "/rest/v1/physiq_profiles":
                return self._tabela_treino("PATCH", u)
            self._anotar("PATCH", u.path, None, desconhecida=True)
            return self._responder(404, {"message": "rota do falso desconhecida"})

        def _rpc(self, nome: str, corpo: object) -> None:
            self._anotar("POST", f"/rest/v1/rpc/{nome}", corpo, rpc=nome)
            if self.headers.get("apikey") != CHAVE_PUBLICA or self._token() not in USUARIOS:
                return self._responder(401, {"code": "PGRST301", "message": "JWT inválido"})
            params = rpcs.get(nome)
            if params is None or not isinstance(corpo, dict) or sorted(corpo) != sorted(params):
                return self._responder(404, {"code": "PGRST202", "message": f"Could not find the function {nome} in the schema cache"})
            r = estado.cenario["rpc"].get(nome) or {"status": 200, "corpo": {"ok": True}}
            return self._responder(int(r["status"]), r["corpo"])

        def _tabela_treino(self, metodo: str, u) -> None:
            tabela = u.path.rsplit("/", 1)[1]
            filtros = {k: v[0] for k, v in parse_qs(u.query).items()}
            corpo = self._corpo() if metodo == "PATCH" else None
            self._anotar(metodo, u.path, corpo, tabela=tabela, filtros=filtros)
            if self.headers.get("apikey") != CHAVE_SERVICO_TREINO or self._token() != CHAVE_SERVICO_TREINO:
                return self._responder(401, {"code": "PGRST301", "message": "sem a chave de serviço do Treino"})
            if tabela == "physiq_identidades":
                tid = estado.cenario["identidades"].get(filtros.get("principal_user_id", "").removeprefix("eq."))
                linhas = [{"treino_user_id": tid}] if tid else []
            else:
                perfil = estado.cenario["perfis"].get(filtros.get("id", "").removeprefix("eq."))
                if metodo == "PATCH" and perfil is not None and isinstance(corpo, dict):
                    perfil.update(corpo)
                colunas = [c.strip() for c in (filtros.get("select") or "conta_id,series_travadas").split(",")]
                linhas = [{c: perfil.get(c) for c in colunas}] if perfil is not None else []
            if "vnd.pgrst.object+json" in (self.headers.get("Accept") or ""):   # o maybeSingle de um PATCH
                if len(linhas) != 1:
                    return self._responder(406, {"code": "PGRST116", "details": "The result contains 0 rows", "hint": None,
                                                 "message": "JSON object requested, multiple (or no) rows returned"})
                return self._responder(200, linhas[0])
            return self._responder(200, linhas)

    return Falso


def subir(porta_principal: int, porta_treino: int) -> tuple[ThreadingHTTPServer, ThreadingHTTPServer, Estado]:
    rpcs = assinaturas()
    estado = Estado()
    sp = ThreadingHTTPServer(("127.0.0.1", porta_principal), manipulador("principal", estado, rpcs))
    st = ThreadingHTTPServer(("127.0.0.1", porta_treino), manipulador("treino", estado, rpcs))
    return sp, st, estado


def autoteste() -> int:
    """O falso por ele mesmo (portas livres do SO, sem Deno): o Auth, as 25 RPCs com os parâmetros da migration, o PGRST202, as 2 tabelas do Treino."""
    sp, st, _estado = subir(0, 0)
    for s in (sp, st):
        threading.Thread(target=s.serve_forever, daemon=True).start()
    pp, pt = sp.server_address[1], st.server_address[1]

    def pedir(metodo: str, porta: int, caminho: str, corpo: object = None, cab: dict | None = None) -> tuple[int, object]:
        req = urllib.request.Request(f"http://127.0.0.1:{porta}{caminho}", data=None if corpo is None else json.dumps(corpo).encode("utf-8"),
                                     method=metodo, headers={"Content-Type": "application/json", **(cab or {})})
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, json.loads(r.read() or b"null")
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"null")

    tok = "tok-local-nutri-0001"
    c = {"apikey": CHAVE_PUBLICA, "Authorization": f"Bearer {tok}"}
    s = {"apikey": CHAVE_SERVICO_TREINO, "Authorization": f"Bearer {CHAVE_SERVICO_TREINO}"}
    rpcs = assinaturas()
    casos = [
        ("as 25 RPCs da pessoa lidas das migrations", len(rpcs) == 25 and rpcs.get("acessos_ler") == ["p_aluno"] and rpcs.get("meus_alimentos") == []
         and rpcs.get("rotina_prof_salvar") == ["p_aluno", "p_id", "p_dados"]),
        ("o Auth: o token da tabela → 200 com o id", pedir("GET", pp, "/auth/v1/user", cab=c)[1] == {"id": USUARIOS[tok], "aud": "authenticated", "role": "authenticated"}),
        ("o Auth: token desconhecido → 401", pedir("GET", pp, "/auth/v1/user", cab={**c, "Authorization": "Bearer tok-local-outro-0000"})[0] == 401),
        ("a RPC com os parâmetros certos → a resposta padrão", pedir("POST", pp, "/rest/v1/rpc/acessos_ler", {"p_aluno": MATRICULA}, c)[1].get("ok") is True),
        ("a RPC com um parâmetro a mais → 404 PGRST202", pedir("POST", pp, "/rest/v1/rpc/acessos_ler", {"p_aluno": MATRICULA, "p_x": 1}, c)[0] == 404),
        ("a RPC sem o apikey → 401", pedir("POST", pp, "/rest/v1/rpc/acessos_ler", {"p_aluno": MATRICULA}, {"Authorization": f"Bearer {tok}"})[0] == 401),
        ("o vínculo do Treino (GET, lista)", pedir("GET", pt, f"/rest/v1/physiq_identidades?select=treino_user_id&principal_user_id=eq.{USUARIOS['tok-local-aluna-00003']}", cab=s)
         == (200, [{"treino_user_id": TREINO_ALUNA}])),
        ("o PATCH grava e devolve o objeto (maybeSingle)", pedir("PATCH", pt, f"/rest/v1/physiq_profiles?id=eq.{TREINO_ALUNA}&select=series_travadas",
                                                                {"series_travadas": False}, {**s, "Accept": "application/vnd.pgrst.object+json"}) == (200, {"series_travadas": False})),
        ("o PATCH sem a linha → 406 PGRST116", pedir("PATCH", pt, "/rest/v1/physiq_profiles?id=eq.x&select=series_travadas", {"series_travadas": False},
                                                     {**s, "Accept": "application/vnd.pgrst.object+json"})[0] == 406),
        ("as tabelas do Treino sem a chave de serviço → 401", pedir("GET", pt, "/rest/v1/physiq_profiles?id=eq.x", cab=c)[0] == 401),
    ]
    for nome, ok in casos:
        print(("✅ " if ok else "❌ ") + nome)
    sp.shutdown()
    st.shutdown()
    falhas = sum(1 for _n, ok in casos if not ok)
    print(f"autoteste do falso: {len(casos) - falhas}/{len(casos)}")
    return 1 if falhas else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--principal", type=int, default=0)
    ap.add_argument("--treino", type=int, default=0)
    ap.add_argument("--autoteste", action="store_true")
    a = ap.parse_args()
    if a.autoteste:
        return autoteste()
    if not a.principal or not a.treino:
        raise SystemExit("uso: supabase_falso.py --principal <porta> --treino <porta>   (ou --autoteste)")
    sp, st, _estado = subir(a.principal, a.treino)
    threading.Thread(target=st.serve_forever, daemon=True).start()
    print(f"falso do Supabase: principal 127.0.0.1:{a.principal} · treino 127.0.0.1:{a.treino}", flush=True)
    try:
        sp.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
