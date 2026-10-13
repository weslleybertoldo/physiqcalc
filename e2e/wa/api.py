#!/usr/bin/env python3
"""Physiq W-A P2 — o E2E de SERVIDOR das 3 funções da W-A: acessos e aluno-dia (banco principal, COMO A PESSOA) e treino-acessos (Banco do
Treino, com o login do principal). Spec W-A §5.2, §5.5, §5.6, §7; revisão C4 e I1.
Modos:
  --seco        NADA sai da máquina: as regras dos 3 _shared lidas do PRÓPRIO TS (node --experimental-strip-types) conferem os corpos de
                referência (os válidos passam com a RPC e os p_* certos; os de forma ruim são recusados com o campo certo) + o autoteste do falso.
  --local       as 3 funções no Deno LOCAL (e2e/w1/servir_local.ts) contra o FALSO do Supabase (e2e/wa/supabase_falso.py) — sem rede: a porta
                (CORS, 405, schema, Bearer, 413, o freio), a forma antes da RPC (0 RPC quando recusa), a RPC e os p_* certos, o status de cada
                código, a whitelist, o getUser em todo pedido (a porta sem jwtLeitura), o log só com códigos (nunca o nome da rotina) e a
                treino-acessos inteira (o vínculo, a trava por conta, UMA gravação só com series_travadas, o registro que falha, o schema).
  (padrão)      STAGING, com as funções PUBLICADAS e as contas de TESTE da hml-17 — os grupos A (acessos) · T (treino-acessos) · R (rotinas) ·
                D (dieta livre) · X (o mesmo login em 2 contas) · Y (o dono sem papel de personal) · B (os logs da borda): os P/N por papel nos 2 bancos e os
                negativos da §5.5. A massa ("WA E2E <rodada>") vai para o estado ANTES de nascer e sai no fim (e no --limpar): as rotinas, os
                alimentos, as receitas, as extras e os itens do dia da aluna e do w7b, os acessos, o histórico e os avisos da W-A da matrícula A
                desde o começo da rodada, o config da A e o series_travadas do Treino (as fotos) e o alimento "fora do plano"; a 2ª matrícula, as
                "sem login" e "só nutri" e o dono sem papel pela Massa do _base.py. No fim, as sobras = 0.
  --so-leitura  PRODUÇÃO (x-schema public): SÓ leitura — OPTIONS, sem login, x-schema inválido, ação desconhecida e `acao: "ler"`; NENHUMA
                gravação, nem com corpo inválido (risco 9 do mestre). --desde <ISO UTC>: os logs das 3 desde a publicação (0 5xx; 100% JSON).
  --limpar      desfaz a massa do estado (~/projetos/physiqcalc-scratch/w-a/api-estado.json) e da Massa; imprime as sobras.
Uso: python3 e2e/wa/api.py --seco | --local | [--grupos A,T,R,D,X,Y,B] | --so-leitura [--desde <ISO>] | --limpar
Os ids: S = seco · L = local · A/T/R/D/X/Y/B = os grupos do staging · Z = as sobras · P = produção.
Sem segredo nem dado pessoal na saída: só status, códigos, contagens e booleanos (as chaves pela Management API; as senhas em ~/.physiq-teste-*).
"""
from __future__ import annotations

import argparse
import datetime as dt
import http.client
import importlib.util
import json
import os
import socket
import subprocess
import sys
import time
import urllib.parse
import uuid
from pathlib import Path

sys.dont_write_bytecode = True
AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import _base as B  # noqa: E402
import supabase_falso as F  # noqa: E402

REPO = B.REPO
P = B.C.C2.Placar()
B5 = B.B5
S = "staging"
API_P, API_T = B.H.API_P, f"https://{B.H.API_T_HOST}"
URLS = {"acessos": f"{API_P}/functions/v1/acessos", "aluno-dia": f"{API_P}/functions/v1/aluno-dia",
        "treino-acessos": f"{API_T}/functions/v1/treino-acessos"}
ORIGEM, ORIGEM_PROD, ORIGEM_FORA = "https://physiqcalc-staging.vercel.app", "https://physiqcalc.com.br", "https://exemplo-fora-da-lista.example"
ESTADO = B.SCRATCH / "w-a" / "api-estado.json"
P2 = B.SCRATCH / "w-a" / "p2"
DENO = Path.home() / ".deno" / "bin" / "deno"
PORTAS = {"falso_principal": 8795, "falso_treino": 8796, "acessos": 8791, "aluno-dia": 8792, "treino-acessos": 8793}
LOCAL = {f: f"http://127.0.0.1:{PORTAS[f]}" for f in ("acessos", "aluno-dia", "treino-acessos")}
FALSO_P = f"http://127.0.0.1:{PORTAS['falso_principal']}"
TITULOS_WA = ("Sua dieta foi liberada: agora você pode pôr e tirar alimentos no seu dia", "Seu profissional criou uma rotina para você")
FALSO = "00000000-0000-4000-8000-00000000abcd"
GRAVACOES = {"salvar", "rotina_salvar", "rotina_arquivar", "rotina_marcar", "rotinas_ordenar", "dia_adicionar", "dia_tirar", "dia_desfazer",
             "extra_salvar", "extra_excluir", "extra_marcar", "alimento_salvar", "alimento_excluir", "receita_salvar", "receita_excluir",
             "prof_rotina_salvar", "prof_rotina_arquivar"}

# ───────────────────────── os corpos de referência (o --seco confere nas regras do TS; o --local manda às funções) ─────────────────────────
A_, B_ = "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"
HOJE_FIXO = "2026-10-13"
MARCA_LOCAL = "WA LOCAL creatina"
ROTINA = {"nome": "Creatina", "detalhe": "5 g", "tipo": "suplemento", "horario": "08:00", "dias_semana": [1, 2, 3, 4, 5, 6, 7], "lembrete": True}
ITEM = {"refeicao_id": A_, "alimento_id": B_, "quantidade_g": 150}
EXTRA = {"dia": HOJE_FIXO, "nome": "Lanche", "horario": "16:00", "ja_comi": True}
ALIMENTO = {"nome": "Pão", "porcao_g": 50, "energia_kcal": 280, "proteina_g": 9, "carboidrato_g": 55, "lipidio_g": 3, "fibra_g": 2}
RECEITA = {"nome": "Vitamina", "porcoes": 2, "itens": [{"alimento_id": A_, "quantidade_g": 200}, {"aluno_alimento_id": B_, "quantidade_g": 100}]}
ROTINA_PROF = {"nome": "Remédio", "tipo": "remedio", "horario": "20:00", "lembrete": True}
# nome → (o corpo VÁLIDO, a RPC, os p_* que ela tem de receber — os nomes das migrations)
CORPOS_ALUNO_DIA: dict[str, tuple[dict, str, dict]] = {
    "ler:rotinas": ({"acao": "ler", "q": "rotinas", "de": HOJE_FIXO, "ate": HOJE_FIXO}, "minhas_rotinas", {"p_de": HOJE_FIXO, "p_ate": HOJE_FIXO}),
    "ler:dia": ({"acao": "ler", "q": "dia", "dia": HOJE_FIXO}, "meu_dia", {"p_dia": HOJE_FIXO}),
    "ler:biblioteca": ({"acao": "ler", "q": "biblioteca"}, "meus_alimentos", {}),
    "ler:alimentos": ({"acao": "ler", "q": "alimentos", "termo": "arroz", "pagina": 0}, "buscar_alimentos_do_aluno", {"p_termo": "arroz", "p_pagina": 0}),
    "ler:aluno_rotinas": ({"acao": "ler", "q": "aluno_rotinas", "aluno": A_, "de": "2026-10-07", "ate": HOJE_FIXO}, "rotinas_do_aluno",
                          {"p_aluno": A_, "p_de": "2026-10-07", "p_ate": HOJE_FIXO}),
    "ler:aluno_dia": ({"acao": "ler", "q": "aluno_dia", "aluno": A_, "de": "2026-09-13", "ate": HOJE_FIXO}, "dia_do_aluno",
                      {"p_aluno": A_, "p_de": "2026-09-13", "p_ate": HOJE_FIXO}),
    "rotina_salvar": ({"acao": "rotina_salvar", "id": None, "dados": ROTINA}, "rotina_salvar", {"p_id": None, "p_dados": ROTINA}),
    "rotina_arquivar": ({"acao": "rotina_arquivar", "id": A_}, "rotina_arquivar", {"p_id": A_}),
    "rotina_marcar": ({"acao": "rotina_marcar", "id": A_, "dia": HOJE_FIXO, "feita": True}, "rotina_marcar", {"p_id": A_, "p_dia": HOJE_FIXO, "p_feita": True}),
    "rotinas_ordenar": ({"acao": "rotinas_ordenar", "ids": [A_, B_]}, "rotinas_ordenar", {"p_ids": [A_, B_]}),
    "dia_adicionar": ({"acao": "dia_adicionar", "dia": HOJE_FIXO, "dados": ITEM}, "dia_adicionar", {"p_dia": HOJE_FIXO, "p_dados": ITEM}),
    "dia_tirar": ({"acao": "dia_tirar", "dia": HOJE_FIXO, "item": A_}, "dia_tirar", {"p_dia": HOJE_FIXO, "p_item": A_}),
    "dia_desfazer": ({"acao": "dia_desfazer", "id": A_}, "dia_desfazer", {"p_id": A_}),
    "extra_salvar": ({"acao": "extra_salvar", "id": None, "dados": EXTRA}, "dia_extra_salvar", {"p_id": None, "p_dados": EXTRA}),
    "extra_excluir": ({"acao": "extra_excluir", "id": A_}, "dia_extra_excluir", {"p_id": A_}),
    "extra_marcar": ({"acao": "extra_marcar", "id": A_, "feita": False}, "dia_extra_marcar", {"p_id": A_, "p_feita": False}),
    "alimento_salvar": ({"acao": "alimento_salvar", "id": None, "dados": ALIMENTO}, "meu_alimento_salvar", {"p_id": None, "p_dados": ALIMENTO}),
    "alimento_excluir": ({"acao": "alimento_excluir", "id": A_}, "meu_alimento_excluir", {"p_id": A_}),
    "receita_salvar": ({"acao": "receita_salvar", "id": None, "dados": RECEITA}, "minha_receita_salvar", {"p_id": None, "p_dados": RECEITA}),
    "receita_excluir": ({"acao": "receita_excluir", "id": A_}, "minha_receita_excluir", {"p_id": A_}),
    "prof_rotina_salvar": ({"acao": "prof_rotina_salvar", "aluno": A_, "id": None, "dados": ROTINA_PROF}, "rotina_prof_salvar",
                           {"p_aluno": A_, "p_id": None, "p_dados": ROTINA_PROF}),
    "prof_rotina_arquivar": ({"acao": "prof_rotina_arquivar", "aluno": A_, "id": B_}, "rotina_prof_arquivar", {"p_aluno": A_, "p_id": B_}),
}
# (o corpo, o campo recusado — None = acao_invalida): recusados ANTES de qualquer RPC
RECUSAS_ALUNO_DIA: list[tuple[dict, str | None]] = [
    ({"acao": "rotina_salvar", "dados": {"nome": f"{MARCA_LOCAL} {'x' * 60}"}}, "nome"),   # o erro provocado: o nome nunca vai ao log
    ({"acao": "rotina_salvar", "dados": {"nome": "X", "lembrete": True}}, "horario"),
    ({"acao": "rotina_salvar", "dados": {"nome": "X", "dias_semana": [8]}}, "dias_semana"),
    ({"acao": "rotina_salvar", "dados": {"nome": "X", "horario": "8:00"}}, "horario"),
    ({"acao": "ler", "q": "dia", "dia": "2026-02-30"}, "dia"),
    ({"acao": "ler", "q": "rotinas", "de": "2026-09-12", "ate": HOJE_FIXO}, "ate"),
    ({"acao": "rotinas_ordenar", "ids": [f"11111111-1111-4111-8111-{i:012d}" for i in range(31)]}, "ids"),
    ({"acao": "dia_adicionar", "dia": HOJE_FIXO, "dados": {"refeicao_id": A_, "alimento_id": B_, "quantidade_g": 0}}, "quantidade_g"),
    ({"acao": "receita_salvar", "dados": {"nome": "X", "itens": [{"alimento_id": A_, "quantidade_g": 10}] * 31}}, "itens"),
    ({"acao": "extra_salvar", "id": A_, "dados": {"dia": HOJE_FIXO}}, "dia"),
    ({"acao": "ler", "q": "xpto"}, "q"),
    ({"acao": "apagar_tudo"}, None),
    ({"action": "ler", "q": "rotinas", "de": HOJE_FIXO, "ate": HOJE_FIXO}, None),
]
CORPOS_ACESSOS: list[tuple[dict, str, dict]] = [
    ({"acao": "ler", "aluno": A_}, "acessos_ler", {"p_aluno": A_}),
    ({"acao": "salvar", "aluno": A_, "chave": "dieta", "valor": "mexer"}, "acessos_salvar", {"p_aluno": A_, "p_chave": "dieta", "p_valor": "mexer"}),
]
RECUSAS_ACESSOS: list[tuple[dict, str | None]] = [
    ({"acao": "salvar", "aluno": A_, "chave": "treino_series", "valor": "ver"}, "chave"),
    ({"acao": "ler", "aluno": "x"}, "aluno"),
    ({"acao": "salvar", "aluno": A_, "chave": "dieta", "valor": "liberado"}, "valor"),
    ({"acao": "xpto", "aluno": A_}, None),
]
CORPOS_TREINO: list[dict] = [{"acao": "ler", "aluno": A_}, {"acao": "salvar", "aluno": A_, "valor": "mexer"}]
RECUSAS_TREINO: list[tuple[dict, str | None]] = [
    ({"action": "get", "aluno": A_}, None), ({"acao": "ler", "aluno": "x"}, "aluno"), ({"acao": "salvar", "aluno": A_, "valor": "travar"}, "valor"),
]


# ───────────────────────── o comum ─────────────────────────
def pedir(metodo: str, url: str, corpo: object = None, cab: dict | None = None, timeout: int = 60) -> tuple[int, dict, dict]:
    """(status, o corpo JSON quando for objeto — senão {}, os cabeçalhos)."""
    st, r, h = B5.http(metodo, url, corpo, cab or {}, timeout=timeout)
    return st, (r if isinstance(r, dict) else {}), (h or {})


def chamar(funcao: str, token: str | None, corpo: object, *, schema: str = S, origem: str = ORIGEM, metodo: str = "POST",
           base: str | None = None) -> tuple[int, dict, dict]:
    """A função como a tela chama: Authorization (o token do PRINCIPAL), x-schema, Origin e — nas do principal — o apikey. base = o Deno local."""
    cab = {"x-schema": schema, "Origin": origem}
    if funcao != "treino-acessos":
        cab["apikey"] = F.CHAVE_PUBLICA if base else B5.anon(B.PRINCIPAL_REF)
    if token:
        cab["Authorization"] = f"Bearer {token}"
    if isinstance(corpo, bytes):
        cab["Content-Type"] = "application/json"
    return pedir(metodo, base or URLS[funcao], corpo, cab)


def preflight(funcao: str, origem: str, base: str | None = None) -> tuple[int, str]:
    cab = {"Origin": origem, "Access-Control-Request-Method": "POST",
           "Access-Control-Request-Headers": "authorization, apikey, content-type, x-schema, x-client-info"}
    st, _r, h = pedir("OPTIONS", base or URLS[funcao], None, cab)
    return st, B.C.cabecalho(h, "access-control-allow-origin")


def caso(id_: str, desc: str, st: int, r: dict, esperado: int, *extras: object) -> bool:
    """Um caso: o status esperado e as conferências extras. Da resposta só sai o que é código (ok, erro, series, registrado, pode_mudar)."""
    ok = st == esperado and all(bool(x) for x in extras)
    curto = {k: r.get(k) for k in ("ok", "erro", "series", "registrado", "pode_mudar") if k in r}
    return P.check(ok, f"[{id_}] {desc}: {st} {json.dumps(curto, ensure_ascii=False)}"
                   + ("" if ok else f" (esperado {esperado}; extras {[bool(x) for x in extras]})"))


class _Saida:
    """O que o Logins.fechar da hml-17 pede (o .ok da hml-09), em cima do Placar."""

    def ok(self, cond: bool, texto: str, parar: bool = False) -> bool:  # noqa: ARG002
        return P.check(cond, texto)


# ───────────────────────── --seco ─────────────────────────
_JS_REGRAS = r"""
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const [ac, ad, ta] = await Promise.all(process.argv.slice(1, 4).map((f) => import(pathToFileURL(f).href)));
const e = JSON.parse(readFileSync(0, "utf8"));
const saida = { acessos: [], alunoDia: [], treino: [] };
for (const c of e.acessos) { const r = ac.lerPedidoDeAcessos(c); saida.acessos.push(r.ok ? { ok: true, ...ac.chamadaDeAcessos(r.pedido) } : r); }
for (const c of e.alunoDia) { const r = ad.pedidoDoAlunoDia(c); saida.alunoDia.push(r.ok ? { ok: true, rpc: r.pedido.rpc, args: r.pedido.args } : r); }
for (const c of e.treino) saida.treino.push(ta.lerPedidoTreinoAcessos(c));
saida.gravacoes = [...ad.ACOES_DO_ALUNO_DIA, ...ac.ACOES_DE_ACESSOS.filter((a) => a !== "ler")];
console.log(JSON.stringify(saida));
"""


def regras(acessos: list, aluno_dia: list, treino: list) -> dict:
    """O que as regras do servidor (o PRÓPRIO TS, pelo node) fazem com cada corpo — sem rede."""
    arquivos = [REPO / "supabase-principal/functions/_shared/acessos-regras.ts", REPO / "supabase-principal/functions/_shared/aluno-dia-regras.ts",
                REPO / "supabase/functions/_shared/treino-acessos-regras.ts"]
    r = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", _JS_REGRAS, *map(str, arquivos)],
                       input=json.dumps({"acessos": acessos, "alunoDia": aluno_dia, "treino": treino}), capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError(f"node (as regras da W-A): {r.stderr.strip()[:400]}")
    return json.loads(r.stdout)


def _recusa(campo: str | None) -> dict:
    return {"ok": False, "erro": "acao_invalida"} if campo is None else {"ok": False, "erro": "dados_invalidos", "campo": campo}


def rodada_seca() -> None:
    corpos_ad = list(CORPOS_ALUNO_DIA.values())
    r = regras([c for c, _rpc, _a in CORPOS_ACESSOS] + [c for c, _ in RECUSAS_ACESSOS],
               [c for c, _rpc, _a in corpos_ad] + [c for c, _ in RECUSAS_ALUNO_DIA],
               CORPOS_TREINO + [c for c, _ in RECUSAS_TREINO])
    n = len(CORPOS_ACESSOS)
    for (corpo, rpc, args), x in zip(CORPOS_ACESSOS, r["acessos"][:n]):
        P.check(x == {"ok": True, "rpc": rpc, "args": args}, f"[S1] acessos › {corpo['acao']}: a {rpc} com {sorted(args)}")
    for (_corpo, campo), x in zip(RECUSAS_ACESSOS, r["acessos"][n:]):
        P.check(x == _recusa(campo), f"[S2] acessos › recusa ({campo or 'acao_invalida'}): {x}")
    n = len(corpos_ad)
    for nome, (_corpo, rpc, args), x in zip(CORPOS_ALUNO_DIA, corpos_ad, r["alunoDia"][:n]):
        P.check(x == {"ok": True, "rpc": rpc, "args": args}, f"[S3] aluno-dia › {nome}: a {rpc} com {sorted(args)}" + ("" if x.get("ok") else f" — {x}"))
    for (_corpo, campo), x in zip(RECUSAS_ALUNO_DIA, r["alunoDia"][n:]):
        P.check(x == _recusa(campo), f"[S4] aluno-dia › recusa ({campo or 'acao_invalida'}): {x}")
    n = len(CORPOS_TREINO)
    for corpo, x in zip(CORPOS_TREINO, r["treino"][:n]):
        P.check(x.get("ok") is True, f"[S5] treino-acessos › {corpo['acao']} passa na forma")
    for (_corpo, campo), x in zip(RECUSAS_TREINO, r["treino"][n:]):
        P.check(x == _recusa(campo), f"[S6] treino-acessos › recusa ({campo or 'acao_invalida'}): {x}")
    auto = subprocess.run([sys.executable, str(AQUI / "supabase_falso.py"), "--autoteste"], capture_output=True, text=True, timeout=90, cwd=REPO)
    P.check(auto.returncode == 0, f"[S7] o autoteste do falso do Supabase: {(auto.stdout.strip().splitlines() or ['(sem saída)'])[-1]}")
    P.check(set(r["gravacoes"]) == GRAVACOES, f"[S8] a trava do --so-leitura (GRAVACOES) = as gravações das regras do TS: "
            f"{sorted(set(r['gravacoes']) ^ GRAVACOES) or 'iguais'}")


# ───────────────────────── --local: as 3 no Deno local contra o falso ─────────────────────────
TK = {"nutri": "tok-local-nutri-0001", "personal": "tok-local-personal-02", "aluna": "tok-local-aluna-00003", "dono_b": "tok-local-dono-b-0005"}
M = F.MATRICULA


def porta_livre(p: int) -> bool:
    with socket.socket() as s_:
        s_.settimeout(0.5)
        return s_.connect_ex(("127.0.0.1", p)) != 0


def esperar(cond, segundos: float, passo: float = 0.5) -> bool:
    fim = time.time() + segundos
    while time.time() < fim:
        if cond():
            return True
        time.sleep(passo)
    return False


def ambiente_deno(funcao: str) -> dict:
    """O ambiente de cada função local: só o falso (127.0.0.1) e chaves de mentira; nada de fora entra (SUPABASE_*, PRINCIPAL_*, segredos)."""
    env = {k: v for k, v in os.environ.items() if not k.startswith(("SUPABASE_", "PRINCIPAL_", "ERROS_", "TELEGRAM_", "SEGREDO_"))}
    env |= {"DENO_NO_PACKAGE_JSON": "1", "ERROS_AVISO_DESLIGADO": "1"}
    if funcao == "treino-acessos":
        env |= {"SUPABASE_URL": f"http://127.0.0.1:{PORTAS['falso_treino']}", "SUPABASE_SERVICE_ROLE_KEY": F.CHAVE_SERVICO_TREINO,
                "PRINCIPAL_URL": FALSO_P, "PRINCIPAL_ANON_KEY": F.CHAVE_PUBLICA}
    else:
        env |= {"SUPABASE_URL": FALSO_P, "SUPABASE_ANON_KEY": F.CHAVE_PUBLICA}
    return env


def subir_local() -> dict:
    for nome, p in PORTAS.items():
        if not porta_livre(p):
            raise SystemExit(f"a porta {p} ({nome}) está em uso (ss -ltnp | grep {p}) — outra rodada? (a 8080 e a 5173 nunca são usadas aqui)")
    P2.mkdir(parents=True, exist_ok=True)
    procs = {"falso": subprocess.Popen([sys.executable, str(AQUI / "supabase_falso.py"), "--principal", str(PORTAS["falso_principal"]),
                                        "--treino", str(PORTAS["falso_treino"])], cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)}
    for f in ("acessos", "aluno-dia", "treino-acessos"):
        pasta = "supabase/functions" if f == "treino-acessos" else "supabase-principal/functions"
        saida = (P2 / f"deno-{f}.log").open("w", encoding="utf-8")
        procs[f] = subprocess.Popen([str(DENO), "run", "--allow-net=127.0.0.1", "--allow-env", "--allow-read", "e2e/w1/servir_local.ts",
                                     f"{pasta}/{f}/index.ts", str(PORTAS[f])], cwd=REPO, env=ambiente_deno(f), stdout=saida, stderr=saida)
    if not esperar(lambda: all(not porta_livre(p) for p in PORTAS.values()), 180, 1.0):
        descer_local(procs)
        raise SystemExit(f"o Deno local não subiu em 180 s (veja {P2}/deno-*.log)")
    return procs


def descer_local(procs: dict) -> None:
    for pr in procs.values():
        pr.terminate()
    for pr in procs.values():
        try:
            pr.wait(timeout=10)
        except subprocess.TimeoutExpired:
            pr.kill()


def _falso(caminho: str, corpo: object = None) -> object:
    _st, r, _h = B5.http("POST" if corpo is not None else "GET", FALSO_P + caminho, corpo, {}, timeout=10)
    return r


def local(funcao: str, token: str | None, corpo: object, cenario: dict | None = None, **kw: object) -> tuple[int, dict, list]:
    """Zera o falso (e põe o cenário), chama a função LOCAL e devolve (status, corpo, os pedidos que o falso viu)."""
    _falso("/_zerar", {})
    if cenario:
        _falso("/_cenario", cenario)
    st, r, _h = chamar(funcao, token, corpo, base=LOCAL[funcao], **kw)
    ps = _falso("/_pedidos")
    return st, r, ps if isinstance(ps, list) else []


def local_grande(funcao: str, token: str, tamanho: int) -> tuple[int, dict, list]:
    """O corpo grande sem corrida: SÓ os cabeçalhos, com Content-Length = `tamanho` (acima do limite), e o corpo nunca vai — a porta recusa
    pelo tamanho declarado (413) antes de ler. Mandar os bytes de verdade corre com a resposta: a função responde e fecha no meio do envio
    (BrokenPipe — visto no ensaio do plano). Devolve (status, corpo, os pedidos que o falso viu)."""
    _falso("/_zerar", {})
    u = urllib.parse.urlsplit(LOCAL[funcao])
    cab = {"Content-Type": "application/json", "Content-Length": str(tamanho), "x-schema": S, "Origin": ORIGEM, "Authorization": f"Bearer {token}"}
    if funcao != "treino-acessos":
        cab["apikey"] = F.CHAVE_PUBLICA
    c = http.client.HTTPConnection(u.hostname, u.port, timeout=30)
    try:
        c.putrequest("POST", u.path or "/", skip_accept_encoding=True)
        for k, v in cab.items():
            c.putheader(k, v)
        c.endheaders()
        resp = c.getresponse()
        st, bruto = resp.status, resp.read()
    finally:
        c.close()
    try:
        r = json.loads(bruto or b"{}")
    except ValueError:
        r = {}
    ps = _falso("/_pedidos")
    return st, (r if isinstance(r, dict) else {}), (ps if isinstance(ps, list) else [])


def rpcs(ps: list) -> list:
    return [(p.get("rpc"), p.get("corpo")) for p in ps if p.get("rpc")]


def do_treino(ps: list) -> list:
    return [p for p in ps if p.get("papel") == "treino"]


def patches(ps: list) -> list:
    return [p for p in ps if p.get("metodo") == "PATCH"]


def rodada_local() -> None:
    procs = subir_local()
    try:
        _casos_locais()
    finally:
        descer_local(procs)
    linhas = [ln for f in ("acessos", "aluno-dia", "treino-acessos") for ln in (P2 / f"deno-{f}.log").read_text(encoding="utf-8").splitlines()]
    lidas = []
    for ln in (x for x in linhas if x.lstrip().startswith("{")):
        try:
            lidas.append(json.loads(ln))
        except ValueError:
            lidas.append(None)
    formato = bool(lidas) and all(isinstance(x, dict) and x.get("nivel") in ("info", "aviso", "erro")
                                  and x.get("funcao") in ("acessos", "aluno-dia", "treino-acessos", "avisar-erro") for x in lidas)
    sem_nome = not any(MARCA_LOCAL.lower() in ln.lower() or "creatina" in ln.lower() or "vitamina" in ln.lower() for ln in linhas)
    provocado = any(isinstance(x, dict) and x.get("codigo") == "dados_invalidos" and x.get("acao") == "rotina_salvar" and x.get("resultado") == "nome"
                    for x in lidas)
    P.check(formato and sem_nome and provocado, f"[L40] os logs do Deno local: {len(lidas)} linhas no JSON do _shared/log.ts ({formato}); o nome da "
            f"rotina/receita em 0 linha ({sem_nome}); a recusa do nome com o código, a ação e o campo ({provocado})")


def _casos_locais() -> None:
    funcoes = ("acessos", "aluno-dia", "treino-acessos")
    ler_de = {"acessos": {"acao": "ler", "aluno": M}, "aluno-dia": CORPOS_ALUNO_DIA["ler:rotinas"][0], "treino-acessos": {"acao": "ler", "aluno": M}}
    # ── a porta das 3
    for f in funcoes:
        st, ao = preflight(f, "http://localhost:5173", LOCAL[f])
        _st, ao2 = preflight(f, ORIGEM_FORA, LOCAL[f])
        P.check(st == 200 and ao == "http://localhost:5173" and ao2 == ORIGEM_PROD, f"[L1/{f}] OPTIONS: o CORS ecoa a origem da lista; fora dela, o site ({st})")
        st, r, ps = local(f, TK["nutri"], None, metodo="GET")
        P.check(st == 405 and r.get("erro") == "metodo" and not ps, f"[L2/{f}] GET → 405 metodo, sem tocar no falso ({st}, {len(ps)})")
        st, r, ps = local(f, TK["nutri"], ler_de[f], schema="xpto")
        P.check(st == 400 and r.get("erro") == "schema_invalido" and not ps, f"[L3/{f}] x-schema fora da lista → 400 schema_invalido ({st})")
        st, r, ps = local(f, None, ler_de[f])
        P.check(st == 401 and r.get("erro") == "sem_login" and not ps, f"[L4/{f}] sem o Bearer → 401 sem_login, sem tocar no falso ({st})")
        st, r, ps = local(f, "tok-local-desconhecido-9", ler_de[f])
        P.check(st == 401 and r.get("erro") == "sem_login" and not rpcs(ps), f"[L5/{f}] o token que o Auth recusa → 401 sem_login, 0 RPC ({st})")
    # ── decisão 13: a porta SEM jwtLeitura — o getUser em todo pedido (leitura também); nenhuma ida ao JWKS
    _falso("/_zerar", {})
    for _ in range(3):
        chamar("acessos", TK["nutri"], ler_de["acessos"], base=LOCAL["acessos"])
        chamar("aluno-dia", TK["aluna"], ler_de["aluno-dia"], base=LOCAL["aluno-dia"])
    ps = _falso("/_pedidos")
    ps = ps if isinstance(ps, list) else []
    auth = [p for p in ps if p.get("caminho") == "/auth/v1/user"]
    jwks = [p for p in ps if "jwks" in str(p.get("caminho"))]
    P.check(len(auth) == 6 and not jwks, f"[L6] decisão 13: 1 GET /auth/v1/user por pedido nas 6 leituras ({len(auth)}); {len(jwks)} ida ao JWKS")
    # ── acessos
    st, r, ps = local("acessos", TK["nutri"], {"acao": "ler", "aluno": "x"})
    P.check(st == 400 and r.get("erro") == "dados_invalidos" and not rpcs(ps), f"[L7] acessos › aluno que não é uuid → 400, 0 RPC ({st})")
    st, r, ps = local("acessos", TK["nutri"], {"acao": "ler", "aluno": M})
    P.check(st == 200 and r.get("ok") is True and not ({"user_id", "conta_id", "treino_user_id"} & set(r)) and r.get("pode_mudar") is True
            and rpcs(ps) == [("acessos_ler", {"p_aluno": M})] and ps[-1].get("schema") == "staging" and ps[-1].get("usuario") == F.USUARIOS[TK["nutri"]],
            f"[L8] acessos › ler: a acessos_ler como a pessoa (o schema, o usuário do token); a volta sem os ids internos ({st}, {sorted(r)})")
    st, r, ps = local("acessos", TK["personal"], {"acao": "salvar", "aluno": M, "chave": "dieta", "valor": "mexer", "paciente_id": FALSO, "user_id": FALSO})
    P.check(st == 200 and rpcs(ps) == [("acessos_salvar", {"p_aluno": M, "p_chave": "dieta", "p_valor": "mexer"})],
            f"[L9] acessos › salvar: só p_aluno, p_chave e p_valor (o paciente_id e o user_id do corpo caem) ({rpcs(ps)})")
    st, r, ps = local("acessos", TK["personal"], {"acao": "salvar", "aluno": M, "chave": "treino_series", "valor": "ver"})
    P.check(st == 400 and not rpcs(ps), f"[L10] acessos › treino_series → 400, 0 RPC (vai pela treino-acessos) ({st})")
    for i, (rpc, erro, esperado) in enumerate([("acessos_salvar", "sem_nutricao", 409), ("acessos_salvar", "sem_login_do_aluno", 409),
                                               ("acessos_ler", "sem_acesso", 403), ("acessos_ler", "aluno_inexistente", 404), ("acessos_ler", "xpto", 500)]):
        corpo = {"acao": "salvar", "aluno": M, "chave": "dieta", "valor": "mexer"} if rpc == "acessos_salvar" else {"acao": "ler", "aluno": M}
        st, r, _ps = local("acessos", TK["nutri"], corpo, {"rpc": {rpc: {"status": 200, "corpo": {"ok": False, "erro": erro}}}})
        P.check(st == esperado and r.get("erro") == (erro if esperado != 500 else "erro_interno"), f"[L11.{i}] acessos › a RPC devolve {erro} → {esperado} ({st})")
    st, r, _ps = local("acessos", TK["nutri"], {"acao": "ler", "aluno": M}, {"rpc": {"acessos_ler": {"status": 404, "corpo": {"code": "PGRST202", "message": "x"}}}})
    P.check(st == 500 and r.get("erro") == "erro_interno", f"[L12] acessos › sem a migration (PGRST202) → 500 erro_interno ({st})")
    st, r, _ps = local("acessos", TK["nutri"], {"acao": "ler", "aluno": M}, {"rpc": {"acessos_ler": {"status": 401, "corpo": {"code": "PGRST301", "message": "x"}}}})
    P.check(st == 401 and r.get("erro") == "sem_login", f"[L13] acessos › o PostgREST recusa o token (PGRST301) → 401 sem_login ({st})")
    st, r, ps = local("acessos", TK["nutri"], {"acao": "ler", "aluno": M}, schema="public")
    P.check(st == 200 and bool(ps) and ps[-1].get("schema") == "public", f"[L14] acessos › x-schema public → a RPC no public ({st})")
    st, r, ps = local_grande("acessos", TK["nutri"], 2_000_001)
    P.check(st == 413 and r.get("erro") == "corpo_grande" and not ps, f"[L15] acessos › corpo acima de 2 MB → 413 corpo_grande, antes do Auth ({st}, {len(ps)})")
    _falso("/_zerar", {})
    codigos = [chamar("acessos", TK["dono_b"], {"acao": "ler", "aluno": M}, base=LOCAL["acessos"])[0] for _ in range(121)]
    P.check(codigos[:120].count(200) == 120 and codigos[120] == 429, f"[L16] acessos › o freio: 120/min por pessoa passam; o 121º → 429 ({codigos[-2:]})")
    # ── aluno-dia: cada leitura e cada gravação → a RPC e os p_* certos; o que vier a mais no corpo cai
    for nome, (corpo, rpc, args) in CORPOS_ALUNO_DIA.items():
        sujo = dict(corpo, dono_user_id=FALSO, paciente_id=FALSO)
        if isinstance(sujo.get("dados"), dict):
            sujo["dados"] = dict(sujo["dados"], dono_user_id=FALSO, paciente_id=FALSO, origem="profissional", criada_por=FALSO)
        st, r, ps = local("aluno-dia", TK["aluna"], sujo)
        P.check(st == 200 and rpcs(ps) == [(rpc, args)], f"[L17:{nome}] aluno-dia › a {rpc} com os p_* da migration; dono/paciente/origem do corpo caem ({rpcs(ps)})")
    for i, (corpo, campo) in enumerate(RECUSAS_ALUNO_DIA):
        st, r, ps = local("aluno-dia", TK["aluna"], corpo)
        erro = "acao_invalida" if campo is None else "dados_invalidos"
        P.check(st == 400 and r.get("erro") == erro and not rpcs(ps), f"[L18.{i}] aluno-dia › recusa antes da RPC ({campo or erro}) → 400, 0 RPC ({st})")
    for i, (nome, rpc, erro, esperado) in enumerate([
        ("rotina_marcar", "rotina_marcar", "dados_invalidos", 400), ("dia_adicionar", "dia_adicionar", "dieta_travada", 409),
        ("rotina_salvar", "rotina_salvar", "limite", 409), ("prof_rotina_salvar", "rotina_prof_salvar", "so_do_aluno", 409),
        ("rotina_arquivar", "rotina_arquivar", "nao_encontrado", 404), ("prof_rotina_arquivar", "rotina_prof_arquivar", "sem_login_do_aluno", 409),
        ("ler:aluno_dia", "dia_do_aluno", "sem_acesso", 403), ("ler:aluno_rotinas", "rotinas_do_aluno", "aluno_inexistente", 404),
    ]):
        st, r, _ps = local("aluno-dia", TK["aluna"], CORPOS_ALUNO_DIA[nome][0], {"rpc": {rpc: {"status": 200, "corpo": {"ok": False, "erro": erro}}}})
        P.check(st == esperado and r.get("erro") == erro, f"[L19.{i}] aluno-dia › a {rpc} devolve {erro} → {esperado} ({st})")
    volta = {"ok": True, "hoje": HOJE_FIXO, "rotinas": [{"id": FALSO}], "feitas": []}
    st, r, _ps = local("aluno-dia", TK["aluna"], CORPOS_ALUNO_DIA["ler:rotinas"][0], {"rpc": {"minhas_rotinas": {"status": 200, "corpo": volta}}})
    P.check(st == 200 and r == volta, f"[L20] aluno-dia › a volta é o jsonb da RPC como veio ({st})")
    # ── treino-acessos: os 6 passos
    T = "treino-acessos"
    st, r, ps = local_grande(T, TK["nutri"], 17_000)
    P.check(st == 413 and r.get("erro") == "corpo_grande" and not ps, f"[L21] treino-acessos › corpo acima de 16 KB → 413, 0 pedido ({st})")
    for i, (corpo, erro) in enumerate([({"action": "get", "aluno": M}, "acao_invalida"), ({"acao": "ler", "aluno": "x"}, "dados_invalidos"),
                                       ({"acao": "salvar", "aluno": M, "valor": "travar"}, "dados_invalidos")]):
        st, r, ps = local(T, TK["nutri"], corpo)
        P.check(st == 400 and r.get("erro") == erro and not ps, f"[L22.{i}] treino-acessos › {erro} antes de tocar no principal ({st}, {len(ps)})")
    st, r, _ps = local(T, TK["nutri"], {"acao": "ler", "aluno": M}, {"auth": {TK["nutri"]: 500}})
    P.check(st == 502 and r.get("erro") == "principal_indisponivel", f"[L23] treino-acessos › o Auth do principal fora (500) → 502 ({st})")
    for i, (cen, esperado) in enumerate([({"status": 200, "corpo": {"ok": False, "erro": "sem_acesso"}}, (403, "sem_acesso")),
                                          ({"status": 200, "corpo": {"ok": False, "erro": "aluno_inexistente"}}, (404, "aluno_inexistente")),
                                          ({"status": 500, "corpo": {}}, (502, "principal_indisponivel")),
                                          ({"status": 404, "corpo": {"code": "PGRST202"}}, (502, "principal_indisponivel"))]):
        st, r, ps = local(T, TK["nutri"], {"acao": "ler", "aluno": M}, {"rpc": {"acessos_ler": cen}})
        P.check((st, r.get("erro")) == esperado and not do_treino(ps), f"[L24.{i}] treino-acessos › a acessos_ler → {esperado}, 0 ida ao Treino ({st})")
    st, r, ps = local(T, TK["nutri"], {"acao": "ler", "aluno": M}, {"rpc": {"acessos_ler": {"status": 200, "corpo": dict(F.ACESSOS_PADRAO, modulos=["nutricao"])}}})
    P.check(st == 409 and r.get("erro") == "sem_modulo" and not do_treino(ps), f"[L25] treino-acessos › sem o módulo Treino → 409 sem_modulo ({st})")
    st, r, ps = local(T, TK["nutri"], {"acao": "ler", "aluno": M})
    tr = do_treino(ps)
    P.check(st == 200 and r == {"ok": True, "series": "ver", "pode_mudar": True}
            and [(p.get("metodo"), p.get("tabela")) for p in tr] == [("GET", "physiq_identidades"), ("GET", "physiq_profiles")]
            and (tr[0].get("filtros") or {}).get("principal_user_id") == f"eq.{F.USUARIOS[TK['aluna']]}"
            and (tr[1].get("filtros") or {}).get("id") == f"eq.{F.TREINO_ALUNA}" and all(p.get("schema") == "staging" for p in tr)
            and rpcs(ps) == [("acessos_ler", {"p_aluno": M})],
            f"[L26] treino-acessos › ler: sem o treino_user_id guardado → o VÍNCULO → o perfil; 'ver' = travadas ({st} {r})")
    st, r, ps = local(T, TK["nutri"], {"acao": "ler", "aluno": M},
                      {"rpc": {"acessos_ler": {"status": 200, "corpo": dict(F.ACESSOS_PADRAO, treino_user_id=F.TREINO_ALUNA)}}})
    P.check(st == 200 and [p.get("tabela") for p in do_treino(ps)] == ["physiq_profiles"], f"[L27] treino-acessos › com o treino_user_id guardado: sem o vínculo ({st})")
    st, r, ps = local(T, TK["nutri"], {"acao": "salvar", "aluno": M, "valor": "mexer"}, {"identidades": {}})
    P.check(st == 404 and r.get("erro") == "sem_treino" and not patches(ps), f"[L28] treino-acessos › sem o vínculo → 404 sem_treino, 0 gravação ({st})")
    outra = {F.TREINO_ALUNA: {"conta_id": "c0000000-0000-4000-8000-0000000000b2", "series_travadas": True}}
    st, r, ps = local(T, TK["dono_b"], {"acao": "salvar", "aluno": M, "valor": "mexer"}, {"perfis": outra})
    P.check(st == 403 and r.get("erro") == "sem_acesso" and not patches(ps), f"[L29] treino-acessos › C4: o Treino de OUTRA conta → 403, 0 gravação ({st})")
    st, r, _ps = local(T, TK["nutri"], {"acao": "ler", "aluno": M}, {"perfis": {F.TREINO_ALUNA: {"conta_id": None, "series_travadas": False}}})
    P.check(st == 200 and r.get("series") == "mexer", f"[L30] treino-acessos › perfil do Treino sem conta → mostra (o treino do próprio aluno) ({st})")
    st, r, ps = local(T, TK["nutri"], {"acao": "salvar", "aluno": M, "valor": "mexer"},
                      {"rpc": {"acessos_ler": {"status": 200, "corpo": dict(F.ACESSOS_PADRAO, pode_mudar=False)}}})
    P.check(st == 403 and not do_treino(ps), f"[L31] treino-acessos › quem não pode mudar → 403, sem ir ao Treino ({st})")
    st, r, ps = local(T, TK["nutri"], {"acao": "salvar", "aluno": M, "valor": "mexer"})
    pt = patches(ps)
    P.check(st == 200 and r == {"ok": True, "series": "mexer", "registrado": True} and len(pt) == 1 and pt[0].get("corpo") == {"series_travadas": False}
            and (pt[0].get("filtros") or {}).get("id") == f"eq.{F.TREINO_ALUNA}"
            and rpcs(ps) == [("acessos_ler", {"p_aluno": M}), ("acessos_registrar_series", {"p_aluno": M, "p_de": "ver", "p_para": "mexer"})],
            f"[L32] treino-acessos › salvar: UMA gravação (só series_travadas, do treino_user_id certo) e o histórico como a pessoa ({st} {r})")
    st, r, ps = local(T, TK["nutri"], {"acao": "salvar", "aluno": M, "valor": "ver"})
    P.check(st == 200 and r == {"ok": True, "series": "ver", "registrado": False} and not patches(ps) and [x for x, _ in rpcs(ps)] == ["acessos_ler"],
            f"[L33] treino-acessos › sem mudança: nada grava nem registra ({st} {r})")
    st, r, ps = local(T, TK["nutri"], {"acao": "salvar", "aluno": M, "valor": "mexer"}, {"rpc": {"acessos_registrar_series": {"status": 500, "corpo": {}}}})
    P.check(st == 200 and r.get("registrado") is False and len(patches(ps)) == 1, f"[L34] treino-acessos › o registro falhou → registrado: false; a gravação vale ({st} {r})")
    st, r, ps = local(T, TK["nutri"], {"acao": "ler", "aluno": M}, schema="public")
    P.check(st == 200 and all(p.get("schema") == "public" for p in ps if p.get("rpc") or p.get("papel") == "treino"),
            f"[L35] treino-acessos › x-schema public → o principal e o Treino no public ({st})")


# ───────────────────────── staging (o padrão): a massa, o estado e as fotos ─────────────────────────
class Rodada:
    """O estado da rodada de staging (o arquivo vai ANTES de cada escrita): o --limpar desfaz por ele, mesmo depois de uma queda."""

    def __init__(self) -> None:
        self.e: dict = json.loads(ESTADO.read_text(encoding="utf-8")) if ESTADO.exists() else {}

    def guardar(self) -> None:
        ESTADO.parent.mkdir(parents=True, exist_ok=True)
        ESTADO.write_text(json.dumps(self.e, ensure_ascii=False, indent=1), encoding="utf-8")


def foto() -> dict:
    """SÓ LEITURA: os ids da massa de TESTE e o 'antes' do que a rodada muda (o config e os acessos da A; o series_travadas do Treino)."""
    E = B.CONTAS
    u = lambda k: f"(select id from auth.users where lower(email) = {B.txt(E[k])})"  # noqa: E731
    r = B.ler(f"""
      with a as (select p.id, p.conta_id, p.config from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
                  where p.user_id = {u('w5p-aluna')} and p.deleted_at is null and c.origem <> 'app' and p.nutricionista_id = {u('w5p-nutri')}
                  order by p.created_at limit 1)
      select (select id::text from a) as pac_a, (select conta_id::text from a) as conta_a, (select config from a) as config_a,
             {u('w5p-aluna')}::text as aluna, {u('w7b-sozinho')}::text as sozinho, {u('w5p-nutri')}::text as nutri,
             {u('w5p-personal')}::text as personal,
             (select p.id::text from {S}.pacientes p join {S}.contas c on c.id = p.conta_id where p.user_id = {u('w7b-sozinho')}
                 and c.origem = 'app' and p.deleted_at is null order by p.created_at limit 1) as pac_app,
             (select coalesce(jsonb_agg(jsonb_build_object('chave', x.chave, 'nivel', x.nivel, 'alterado_por', x.alterado_por,
                                                           'alterado_em', x.alterado_em) order by x.chave), '[]'::jsonb)
                from {S}.aluno_acessos x, a where x.paciente_id = a.id) as acessos_a,
             (select al.id::text from {S}.alimentos al where al.fonte = 'taco' and al.deleted_at is null and al.energia_kcal > 0
               order by al.codigo limit 1) as taco,
             (select r.id::text from {S}.refeicoes r join {S}.planos_alimentares pl on pl.id = r.plano_id
               where pl.deleted_at is null and pl.paciente_id not in (select p2.id from {S}.pacientes p2 where p2.user_id = {u('w5p-aluna')})
               order by r.id limit 1) as refeicao_alheia,
             (now() at time zone 'America/Sao_Paulo')::date::text as hoje""")[0]
    pl = B.ler(f"""select r.id::text as refeicao, i.id::text as item from {S}.planos_alimentares pl
                     join {S}.refeicoes r on r.plano_id = pl.id join {S}.itens_refeicao i on i.refeicao_id = r.id
                    where pl.paciente_id = {B.txt(r['pac_a'])} and pl.deleted_at is null and i.alimento_id is not null
                      and (cardinality(r.dias_semana) = 0
                           or extract(isodow from (now() at time zone 'America/Sao_Paulo')::date)::smallint = any(r.dias_semana))
                    order by pl.favorito desc, pl.created_at desc, pl.id, r.ordem, i.ordem limit 1""")
    t = B.C.ler(B.TREINO_REF, f"""select i.treino_user_id::text as treino_user_id, pf.series_travadas from {S}.physiq_identidades i
                                   join {S}.physiq_profiles pf on pf.id = i.treino_user_id where i.principal_user_id = {B.txt(r['aluna'])}""")
    if not (r["pac_a"] and r["pac_app"] and r["taco"] and r["refeicao_alheia"] and pl and t):
        raise SystemExit("massa de TESTE incompleta no staging (a Task 0 do plano diz o que conferir) — nada foi gravado")
    sobra = B.Massa().sobras()
    if any(int(v) for v in sobra.values()):
        raise SystemExit(f"há massa da W-A de uma rodada anterior no staging ({sobra}): rode python3 e2e/wa/api.py --limpar antes — nada foi gravado")
    return {**r, "refeicao": pl[0]["refeicao"], "item": pl[0]["item"], "treino_user_id": t[0]["treino_user_id"], "series_antes": t[0]["series_travadas"]}


def master_do_staging() -> dict:
    """SÓ LEITURA: o profile do w27-master no staging (o id e o papel de ANTES da rodada). Desde a hml-18a (10/10) nenhuma conta de TESTE é
    master fixo no staging: cada E2E dá o papel só durante a rodada e devolve no fim (o molde do e2e/w2/api.py)."""
    r = B.ler(f"""select p.id::text as uid, p.role from {S}.profiles p
                   where p.id = (select id from auth.users where lower(email) = {B.txt(B.CONTAS['w27-master'])})""")
    if not r:
        raise SystemExit("o w27-master sem profile no staging (a Task 0 do plano diz o que conferir) — nada foi gravado")
    return r[0]


def massa_basica(rod: Rodada, f: dict) -> dict:
    """As matrículas 'sem login' (personal + nutri) e 'só nutri' na conta A — na Massa do _base.py (o id vai ao estado ANTES do insert; o
    --limpar do _base.py também desfaz) — e o alimento 'fora do plano' da nutri (no estado da rodada, ANTES do insert). Só no staging."""
    m = B.Massa()
    ids: dict = {}
    for chave, nome, com_personal in (("pac_sem_login", "sem login", True), ("pac_so_nutri", "só nutri", False)):
        novo = str(uuid.uuid4())
        m.estado["matriculas"].append(novo)
        m._guardar()  # noqa: SLF001 — o mesmo estado do --limpar do _base.py
        B.escrever(f"""insert into {S}.pacientes (id, conta_id, personal_id, nutricionista_id, nome, config)
                       values ({B.txt(novo)}, {B.txt(f['conta_a'])}, {B.txt(f['personal']) if com_personal else 'null'}, {B.txt(f['nutri'])},
                               {B.txt(rod.e['marca'] + ' ' + nome)}, '{{"wa_e2e": true}}'::jsonb)""")
        ids[chave] = novo
    fora = str(uuid.uuid4())
    rod.e["alimentos"].append(fora)
    rod.guardar()
    B.escrever(f"""insert into {S}.alimentos (id, fonte, nutricionista_id, nome, energia_kcal)
                   values ({B.txt(fora)}, 'proprio', {B.txt(f['nutri'])}, {B.txt(rod.e['marca'] + ' fora do plano')}, 100)""")
    ids["alimento_fora"] = fora
    return ids


def dia_menos(dia: str, n: int) -> str:
    return (dt.date.fromisoformat(dia) - dt.timedelta(days=n)).isoformat()


def contar_avisos_hoje(x: dict, titulo: str) -> int:
    """Os avisos da W-A com este título no sino da aluna HOJE (São Paulo) — o banco manda no máximo 1 por dia."""
    return int(B.ler(f"""select count(*) as n from {S}.avisos where destino_user_id = {B.txt(x['f']['aluna'])} and tipo = 'geral'
                           and titulo = {B.txt(titulo)}
                           and criado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'""")[0]["n"])


def contar_log(x: dict, chave: str) -> int:
    """As linhas do histórico da matrícula A desta chave desde o começo da rodada."""
    return int(B.ler(f"""select count(*) as n from {S}.aluno_acessos_log where paciente_id = {B.txt(x['f']['pac_a'])} and chave = {B.txt(chave)}
                           and em >= {B.txt(x['inicio'])}""")[0]["n"])


def series_no_treino(x: dict) -> bool | None:
    r = B.C.ler(B.TREINO_REF, f"select series_travadas from {S}.physiq_profiles where id = {B.txt(x['f']['treino_user_id'])}")
    return r[0]["series_travadas"] if r else None


def dono_da_rotina(rid: str | None) -> str | None:
    r = B.ler(f"select dono_user_id::text as d from {S}.rotinas where id = {B.txt(rid)}") if rid else []
    return r[0]["d"] if r else None


def token_do_treino(x: dict) -> str:
    """A sessão do TREINO do w5p-personal (a troca que o app faz) — só para provar que a treino-acessos NÃO aceita o token do Treino (T7)."""
    st, r, _h = pedir("POST", f"{API_T}/functions/v1/trocar-token", {}, {"Authorization": f"Bearer {x['tk']['w5p-personal']}", "x-schema": S, "Origin": ORIGEM})
    tok = r.get("access_token") if st == 200 else None
    if not isinstance(tok, str):
        raise SystemExit(f"a troca do Treino do w5p-personal falhou ({st}) — o T7 precisa do token do Treino")
    x["logins"].sessoes.guardar("treino", tok, "w5p-personal (a troca do Treino, T7)")
    return tok


def porta(x: dict, funcao: str, corpo: dict, id_: str) -> None:
    """A porta de cada função: o CORS, sem login, o token falso e o x-schema fora da lista (nada chega a uma RPC)."""
    st, ao = preflight(funcao, ORIGEM)
    _st, ao2 = preflight(funcao, ORIGEM_FORA)
    caso(f"{id_}.1", f"{funcao}: OPTIONS — o CORS ecoa o staging; fora da lista, o site", st, {}, 200, ao == ORIGEM, ao2 == ORIGEM_PROD)
    st, r, _h = chamar(funcao, None, corpo)
    caso(f"{id_}.2", f"{funcao}: sem login → 401 (no principal, a borda — verify_jwt — recusa antes)", st, r, 401,
         funcao != "treino-acessos" or r.get("erro") == "sem_login")
    st, r, _h = chamar(funcao, "eyJhbGciOiJIUzI1NiJ9.e30.token-falso-de-teste", corpo)
    caso(f"{id_}.3", f"{funcao}: token falso → 401", st, r, 401)
    st, r, _h = chamar(funcao, x["tk"]["w5p-nutri"], corpo, schema="xpto")
    caso(f"{id_}.4", f"{funcao}: x-schema fora da lista → 400", st, r, 400, r.get("erro") == "schema_invalido")


# ───────────────────────── staging: os grupos ─────────────────────────
def grupo_a(x: dict) -> None:
    """A — acessos: quem lê e quem muda (nutri, personal, master; nunca a aluna nem outra conta), a Dieta com o aviso 1 por dia, o histórico."""
    tk, f, ids = x["tk"], x["f"], x["ids"]
    a = f["pac_a"]
    st, r, _h = chamar("acessos", tk["w5p-nutri"], {"acao": "salvar", "aluno": a, "chave": "dieta", "valor": "ver"})
    caso("A0", "a Dieta começa em 'ver' (sem mudança, nada grava; a foto volta no fim)", st, r, 200, (r.get("linhas") or {}).get("dieta") == "ver")
    st, r, _h = chamar("acessos", tk["w5p-nutri"], {"acao": "ler", "aluno": a})
    link_antes = (r.get("linhas") or {}).get("acesso_link")
    caso("A1", "a nutri lê a aba da matrícula A (pode mudar; a Dieta 'ver'; os módulos; sem os ids internos)", st, r, 200, r.get("pode_mudar") is True,
         r.get("tem_login") is True, (r.get("linhas") or {}).get("dieta") == "ver", {"treino", "nutricao"} <= set(r.get("modulos") or []),
         not ({"user_id", "conta_id", "treino_user_id"} & set(r)))
    for i, conta in enumerate(("w5p-personal", "w27-master")):
        st, r, _h = chamar("acessos", tk[conta], {"acao": "ler", "aluno": a})
        caso(f"A2.{i}", f"{conta} lê a aba (pode mudar)", st, r, 200, r.get("pode_mudar") is True)
    st, r, _h = chamar("acessos", tk["w5p-aluna"], {"acao": "ler", "aluno": a})
    caso("A3", "§5.5: a aluna NÃO lê nem muda os acessos dela", st, r, 403, r.get("erro") == "sem_acesso")
    st, r, _h = chamar("acessos", tk["w13-dono"], {"acao": "ler", "aluno": a})
    caso("A4", "§5.5: o profissional de OUTRA conta", st, r, 403, r.get("erro") == "sem_acesso")
    st, r, _h = chamar("acessos", tk["w5p-personal"], {"acao": "ler", "aluno": FALSO})
    caso("A5", "aluno que não existe", st, r, 404, r.get("erro") == "aluno_inexistente")
    st, r, _h = chamar("acessos", tk["w5p-nutri"], {"acao": "salvar", "aluno": a, "chave": "dieta", "valor": "mexer"})
    caso("A6", "a nutri libera a Dieta → 'mexer', o 'Mudado por' e 1 aviso no sino da aluna", st, r, 200, (r.get("linhas") or {}).get("dieta") == "mexer",
         ((r.get("mudancas") or {}).get("dieta") or {}).get("para") == "mexer", "por_nome" in ((r.get("mudancas") or {}).get("dieta") or {}),
         contar_avisos_hoje(x, TITULOS_WA[0]) == 1)
    st, r, _h = chamar("acessos", tk["w5p-nutri"], {"acao": "salvar", "aluno": a, "chave": "dieta", "valor": "mexer"})
    caso("A7", "liberar de novo não manda o 2º aviso", st, r, 200, contar_avisos_hoje(x, TITULOS_WA[0]) == 1)
    for i, valor in enumerate(("bloqueado", "liberado")):
        st, r, _h = chamar("acessos", tk["w5p-personal"], {"acao": "salvar", "aluno": a, "chave": "acesso_link", "valor": valor})
        caso(f"A8.{i}", f"P4: o personal muda o envio pelo link → {valor}", st, r, 200, (r.get("linhas") or {}).get("acesso_link") == valor)
    esperado = (0 if link_antes == "bloqueado" else 1) + 1
    caso("A9", f"o histórico: {esperado} mudança(s) do link desde o começo da rodada (pelo gatilho)", 200, {}, 200, contar_log(x, "acesso_link") == esperado)
    for i, corpo in enumerate(({"acao": "salvar", "aluno": a, "chave": "treino_series", "valor": "ver"},
                               {"acao": "salvar", "aluno": a, "chave": "dieta", "valor": "liberado"}, {"acao": "xpto", "aluno": a})):
        st, r, _h = chamar("acessos", tk["w5p-nutri"], corpo)
        caso(f"A10.{i}", f"§5.5: chave/valor/ação fora da lista ({corpo.get('chave') or corpo.get('acao')})", st, r, 400)
    st, r, _h = chamar("acessos", tk["w5p-personal"], {"acao": "salvar", "aluno": ids["pac_sem_login"], "chave": "acesso_app", "valor": "bloqueado"})
    caso("A11", "§5.5: o App de quem não tem login", st, r, 409, r.get("erro") == "sem_login_do_aluno")
    st, r, _h = chamar("acessos", tk["w27-master"], {"acao": "salvar", "aluno": f["pac_app"], "chave": "dieta", "valor": "mexer"})
    caso("A12", "§5.5: a Dieta do aluno do app SEM profissional (o master tenta)", st, r, 409, r.get("erro") == "sem_nutricao")
    for i, chave in enumerate(("diario_alimentar", "acesso_link")):
        st, r, _h = chamar("acessos", tk["w27-master"], {"acao": "salvar", "aluno": f["pac_app"], "chave": chave, "valor": "liberado"})
        caso(f"A12.{i + 1}", f"§5.5: {chave} do aluno do app SEM profissional", st, r, 409, r.get("erro") == "sem_nutricao")
    porta(x, "acessos", {"acao": "ler", "aluno": a}, "A13")
    st, r, _h = chamar("acessos", tk["w5p-nutri"], {"acao": "salvar", "aluno": a, "chave": "dieta", "valor": "ver"})
    caso("A14", "a nutri trava a Dieta de novo (a dieta livre, no grupo D, começa travada)", st, r, 200, (r.get("linhas") or {}).get("dieta") == "ver")


def grupo_t(x: dict) -> None:
    """T — treino-acessos: a nutri sem sessão no Treino lê e muda pelo vínculo; grava 1 coisa e registra; os negativos da §5.5."""
    tk, f, ids = x["tk"], x["f"], x["ids"]
    a, T = f["pac_a"], "treino-acessos"
    antes = "ver" if f["series_antes"] else "mexer"
    outro = "mexer" if antes == "ver" else "ver"
    st, r, _h = chamar(T, tk["w5p-nutri"], {"acao": "ler", "aluno": a})
    caso("T1", f"a nutri (sem sessão no Treino) lê as séries pelo VÍNCULO (a matrícula A não guarda o treino_user_id) = a foto '{antes}'", st, r, 200,
         r.get("series") == antes, r.get("pode_mudar") is True)
    st, r, _h = chamar(T, tk["w5p-nutri"], {"acao": "salvar", "aluno": a, "valor": outro})
    caso("T2", f"P4: a nutri muda para '{outro}' — grava no Treino e registra no principal", st, r, 200, r.get("series") == outro, r.get("registrado") is True,
         series_no_treino(x) is (outro == "ver"), contar_log(x, "treino_series") == 1)
    st, r, _h = chamar(T, tk["w5p-nutri"], {"acao": "salvar", "aluno": a, "valor": outro})
    caso("T3", "sem mudança: nada grava nem registra", st, r, 200, r.get("registrado") is False, contar_log(x, "treino_series") == 1)
    st, r, _h = chamar(T, tk["w5p-aluna"], {"acao": "ler", "aluno": a})
    caso("T4", "a aluna não lê nem muda", st, r, 403, r.get("erro") == "sem_acesso")
    st, r, _h = chamar(T, tk["w5p-nutri"], {"acao": "ler", "aluno": ids["pac_so_nutri"]})
    caso("T5", "§5.5: matrícula sem o módulo Treino (só nutri)", st, r, 409, r.get("erro") == "sem_modulo")
    st, r, _h = chamar(T, tk["w5p-personal"], {"acao": "ler", "aluno": ids["pac_sem_login"]})
    caso("T6", "§5.5: antes do 1º acesso (sem login, sem vínculo)", st, r, 404, r.get("erro") == "sem_treino")
    st, r, _h = chamar(T, token_do_treino(x), {"acao": "ler", "aluno": a})
    caso("T7", "spec §7: o token do TREINO na treino-acessos (o principal recusa)", st, r, 401, r.get("erro") == "sem_login")
    for i, (corpo, erro) in enumerate((({"action": "get", "aluno": a}, "acao_invalida"), ({"acao": "salvar", "aluno": a, "valor": "travar"}, "dados_invalidos"))):
        st, r, _h = chamar(T, tk["w5p-nutri"], corpo)
        caso(f"T8.{i}", f"forma: {erro}", st, r, 400, r.get("erro") == erro)
    porta(x, T, {"acao": "ler", "aluno": a}, "T9")
    st, r, _h = chamar(T, tk["w5p-nutri"], {"acao": "salvar", "aluno": a, "valor": antes})
    caso("T10", f"de volta à foto ('{antes}')", st, r, 200, r.get("series") == antes, series_no_treino(x) is f["series_antes"])


def grupo_r(x: dict) -> None:
    """R — rotinas: a aluna cria/marca/muda/ordena/apaga; o app sem profissional cria; o profissional cria (com o aviso) e não mexe na da aluna."""
    tk, f, hoje, m = x["tk"], x["f"], x["hoje"], x["marca"]
    a, AD = f["pac_a"], "aluno-dia"
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "rotina_salvar", "id": None, "dono_user_id": f["nutri"], "dados": {
        "nome": f"{m} creatina", "detalhe": "5 g", "tipo": "suplemento", "horario": "08:00", "dias_semana": [1, 2, 3, 4, 5, 6, 7], "lembrete": True,
        "dono_user_id": f["nutri"], "origem": "profissional"}})
    r1 = (r.get("rotina") or {}).get("id")
    caso("R1", "a aluna cria a rotina (o dono = ela, a origem 'aluno' — o que vier no corpo cai)", st, r, 200,
         (r.get("rotina") or {}).get("origem") == "aluno", dono_da_rotina(r1) == f["aluna"])
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "ler", "q": "rotinas", "de": hoje, "ate": hoje})
    caso("R2", "ela lê as rotinas de hoje", st, r, 200, any(y.get("id") == r1 for y in r.get("rotinas") or []))
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "rotina_marcar", "id": r1, "dia": hoje, "feita": True})
    _st2, r2, _h2 = chamar(AD, tk["w5p-aluna"], {"acao": "ler", "q": "rotinas", "de": hoje, "ate": hoje})
    caso("R3", "ela marca hoje e o ✓ volta na leitura", st, r, 200, r.get("feita") is True, any(y.get("rotina_id") == r1 for y in r2.get("feitas") or []))
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "rotina_salvar", "id": r1, "dados": {"horario": "09:00"}})
    caso("R4", "ela muda o horário", st, r, 200, (r.get("rotina") or {}).get("horario") == "09:00")
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "rotinas_ordenar", "ids": [r1]})
    caso("R5", "ela ordena", st, r, 200)
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "rotina_salvar", "dados": {"nome": f"{m} sem hora", "lembrete": True}})
    caso("R6", "§5.5: lembrete sem horário", st, r, 400, r.get("erro") == "dados_invalidos")
    amanha = (dt.date.fromisoformat(hoje) + dt.timedelta(days=1)).isoweekday()
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "rotina_salvar", "dados": {"nome": f"{m} só amanhã", "dias_semana": [amanha]}})
    st2, r2, _h2 = chamar(AD, tk["w5p-aluna"], {"acao": "rotina_marcar", "id": (r.get("rotina") or {}).get("id"), "dia": hoje, "feita": True})
    caso("R7", "§5.5: marcar fora do dia da semana da rotina", st2, r2, 400, st == 200, r2.get("erro") == "dados_invalidos")
    st, r, _h = chamar(AD, tk["w7b-sozinho"], {"acao": "rotina_salvar", "dados": {"nome": f"{m} água", "tipo": "habito"}})
    caso("R8", "P9: o aluno do app SEM profissional também cria", st, r, 200)
    st, r, _h = chamar(AD, tk["w7b-sozinho"], {"acao": "rotina_arquivar", "id": r1})
    caso("R9", "§5.5: rotina de OUTRO", st, r, 404, r.get("erro") == "nao_encontrado")
    st, r, _h = chamar(AD, tk["w5p-personal"], {"acao": "prof_rotina_salvar", "aluno": a, "dados": {
        "nome": f"{m} remédio", "tipo": "remedio", "horario": "20:00", "lembrete": True}})
    r10 = (r.get("rotina") or {}).get("id")
    caso("R10", "P8: o personal cria uma rotina para ela (origem 'profissional') e o sino avisa (1 por dia)", st, r, 200,
         (r.get("rotina") or {}).get("origem") == "profissional", contar_avisos_hoje(x, TITULOS_WA[1]) == 1)
    st, r, _h = chamar(AD, tk["w5p-personal"], {"acao": "prof_rotina_salvar", "aluno": a, "id": r1, "dados": {"nome": "x"}})
    caso("R11", "§5.5: o profissional não muda a rotina que a aluna criou", st, r, 409, r.get("erro") == "so_do_aluno")
    st, r, _h = chamar(AD, tk["w5p-nutri"], {"acao": "ler", "q": "aluno_rotinas", "aluno": a, "de": dia_menos(hoje, 6), "ate": hoje})
    rot = {y.get("id"): y for y in r.get("rotinas") or []}
    caso("R12", "P7: a nutri vê a da aluna e a do personal (só a do profissional é editável)", st, r, 200, r1 in rot, r10 in rot,
         rot.get(r10, {}).get("pode_editar") is True, rot.get(r1, {}).get("pode_editar") is False)
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "rotina_arquivar", "id": r10})
    _st2, r2, _h2 = chamar(AD, tk["w5p-nutri"], {"acao": "ler", "q": "aluno_rotinas", "aluno": a, "de": hoje, "ate": hoje})
    arq = next((y for y in r2.get("rotinas") or [] if y.get("id") == r10), {})
    caso("R13", "P8b: a aluna apaga a do profissional e a nutri vê 'apagada pelo aluno'", st, r, 200, arq.get("arquivada_pelo_aluno") is True)
    B.escrever(f"""insert into {S}.rotinas (dono_user_id, origem, nome)
                   select {B.txt(f['aluna'])}, 'aluno', {B.txt(m + ' cheia ')} || g from generate_series(1, greatest(0, 30 - (
                     select count(*) from {S}.rotinas where dono_user_id = {B.txt(f['aluna'])} and arquivada_em is null))::int) g""")
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "rotina_salvar", "dados": {"nome": f"{m} a 31ª"}})
    caso("R14", "§5.5: a 31ª rotina viva", st, r, 409, r.get("erro") == "limite")
    # as "cheias" saem logo depois do R14 — senão a aluna fica no teto de 30 e o X3 (a rotina do personal na conta A) recebe `limite`
    B.escrever(f"delete from {S}.rotinas where dono_user_id = {B.txt(f['aluna'])} and nome like {B.txt(m + ' cheia %')}")
    for i, (corpo, erro) in enumerate((
        ({"acao": "rotina_salvar", "dados": {"nome": f"{m} {'x' * 60}"}}, "dados_invalidos"),   # o erro PROVOCADO do grupo B (a marca nunca no log)
        ({"acao": "rotinas_ordenar", "ids": [str(uuid.uuid4()) for _ in range(31)]}, "dados_invalidos"),
        ({"acao": "ler", "q": "rotinas", "de": dia_menos(hoje, 31), "ate": hoje}, "dados_invalidos"),
        ({"acao": "ler", "q": "xpto"}, "dados_invalidos"),
        ({"acao": "apagar_tudo"}, "acao_invalida"),
    )):
        st, r, _h = chamar(AD, tk["w5p-aluna"], corpo)
        caso(f"R15.{i}", f"forma: {erro}", st, r, 400, r.get("erro") == erro)
    porta(x, AD, {"acao": "ler", "q": "rotinas", "de": hoje, "ate": hoje}, "R16")


def grupo_d(x: dict) -> None:
    """D — a dieta livre: travada não grava; liberada põe, tira, volta, extra, alimento, receita; os negativos da §5.5; o dia a dia do profissional."""
    tk, f, ids, hoje, m = x["tk"], x["f"], x["ids"], x["hoje"], x["marca"]
    a, AD = f["pac_a"], "aluno-dia"
    no_plano = {"refeicao_id": f["refeicao"], "alimento_id": f["taco"], "quantidade_g": 100}
    st0, _r0, _h0 = chamar("acessos", tk["w5p-nutri"], {"acao": "salvar", "aluno": a, "chave": "dieta", "valor": "ver"})   # o grupo D sozinho
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "dia_adicionar", "dia": hoje, "dados": no_plano})
    caso("D1", "§5.5: com a Dieta 'Só ver', ela não põe nada", st, r, 409, st0 == 200, r.get("erro") == "dieta_travada")
    st, r, _h = chamar("acessos", tk["w5p-nutri"], {"acao": "salvar", "aluno": a, "chave": "dieta", "valor": "mexer"})
    caso("D2", "a nutri libera a Dieta", st, r, 200, (r.get("linhas") or {}).get("dieta") == "mexer")
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "ler", "q": "dia", "dia": hoje})
    mat = {y.get("paciente_id"): y.get("liberada") for y in r.get("matriculas") or []}
    caso("D3", "o dia dela: a matrícula A liberada e o plano ativo da A", st, r, 200, mat.get(a) is True, (r.get("plano_ativo") or {}).get("paciente_id") == a)
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "dia_tirar", "dia": hoje, "item": f["item"]})
    st2, _r2, _h2 = chamar(AD, tk["w5p-aluna"], {"acao": "dia_desfazer", "id": (r.get("item") or {}).get("id")})
    caso("D4", "P5: ela tira um item do plano SÓ hoje e volta", st, r, 200, (r.get("item") or {}).get("tipo") == "tirado", st2 == 200)
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "dia_adicionar", "dia": hoje, "dados": no_plano})
    posto = (r.get("item") or {}).get("id")
    caso("D5", "P5: ela põe um alimento da TACO na refeição do plano", st, r, 200, (r.get("item") or {}).get("tipo") == "adicionado")
    for i, (dados, dia, esperado) in enumerate((
        ({"refeicao_id": f["refeicao"], "alimento_id": ids["alimento_fora"], "quantidade_g": 100}, hoje, (404, "nao_encontrado")),   # que ela não enxerga
        ({"refeicao_id": f["refeicao_alheia"], "alimento_id": f["taco"], "quantidade_g": 100}, hoje, (404, "nao_encontrado")),     # de plano que não é dela
        (no_plano, dia_menos(hoje, 2), (400, "dados_invalidos")),                                                                     # anteontem
    )):
        st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "dia_adicionar", "dia": dia, "dados": dados})
        caso(f"D6.{i}", f"§5.5: {esperado[1]}", st, r, esperado[0], r.get("erro") == esperado[1])
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "alimento_salvar", "dados": {"nome": f"{m} pão", "energia_kcal": 280, "proteina_g": 9}})
    alim = (r.get("alimento") or {}).get("id")
    _st2, r2, _h2 = chamar(AD, tk["w5p-aluna"], {"acao": "ler", "q": "alimentos", "termo": "e2e", "pagina": 0})
    caso("D7", "P6: ela cria um alimento dela e a busca acha ('meu')", st, r, 200, any(y.get("tipo") == "meu" and y.get("id") == alim for y in r2.get("itens") or []))
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "receita_salvar", "dados": {"nome": f"{m} vitamina", "porcoes": 2, "itens": [
        {"alimento_id": f["taco"], "quantidade_g": 200}, {"aluno_alimento_id": alim, "quantidade_g": 100}]}})
    rec = (r.get("receita") or {}).get("id")
    caso("D8", "P6: ela cria uma receita (os macros de 1 porção)", st, r, 200, isinstance((r.get("receita") or {}).get("por_porcao"), dict))
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "extra_salvar", "dados": {"dia": hoje, "nome": f"{m} lanche", "horario": "16:00"}})
    ext = (r.get("extra") or {}).get("id")
    st2, _r2, _h2 = chamar(AD, tk["w5p-aluna"], {"acao": "dia_adicionar", "dia": hoje, "dados": {"extra_id": ext, "aluno_receita_id": rec, "porcoes": 1}})
    st3, r3, _h3 = chamar(AD, tk["w5p-aluna"], {"acao": "extra_marcar", "id": ext, "feita": False})
    st4, _r4, _h4 = chamar(AD, tk["w5p-aluna"], {"acao": "extra_excluir", "id": ext})
    caso("D9", "a refeição extra ('Já comi' ligado), a receita nela, desmarcar e apagar", st, r, 200, (r.get("extra") or {}).get("concluida_em") is not None,
         st2 == 200, st3 == 200 and r3.get("concluida_em") is None, st4 == 200)
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "ler", "q": "biblioteca"})
    caso("D10", "a biblioteca dela tem o alimento e a receita", st, r, 200, any(y.get("id") == alim for y in r.get("alimentos") or []),
         any(y.get("id") == rec for y in r.get("receitas") or []))
    st, r, _h = chamar(AD, tk["w5p-personal"], {"acao": "ler", "q": "aluno_dia", "aluno": a, "de": dia_menos(hoje, 6), "ate": hoje})
    caso("D11", "Q1: o PERSONAL lê o dia a dia — 'mexer' e o que ela pôs", st, r, 200, r.get("nivel") == "mexer",
         any(y.get("id") == posto for y in r.get("itens") or []))
    st, r, _h = chamar(AD, tk["w5p-nutri"], {"acao": "ler", "q": "aluno_dia", "aluno": a, "de": hoje, "ate": hoje})
    caso("D12", "P7: a nutri lê o dia a dia", st, r, 200, r.get("liberada") is True)
    st, r, _h = chamar(AD, tk["w5p-aluna"], {"acao": "alimento_excluir", "id": alim})
    st2, _r2, _h2 = chamar(AD, tk["w5p-aluna"], {"acao": "receita_excluir", "id": rec})
    caso("D13", "ela apaga o alimento e a receita (o retrato do dia fica)", st, r, 200, st2 == 200)
    st, r, _h = chamar("acessos", tk["w5p-nutri"], {"acao": "salvar", "aluno": a, "chave": "dieta", "valor": "ver"})
    st2, r2, _h2 = chamar(AD, tk["w5p-aluna"], {"acao": "dia_adicionar", "dia": hoje, "dados": dict(no_plano, quantidade_g=50)})
    _st3, r3, _h3 = chamar(AD, tk["w5p-aluna"], {"acao": "ler", "q": "dia", "dia": hoje})
    caso("D14", "§2.2-12: travada de novo, não põe mais; o que ela registrou fica (a nutri vê)", st2, r2, 409, st == 200, r2.get("erro") == "dieta_travada",
         any(y.get("id") == posto for y in r3.get("itens") or []))


def grupo_x(x: dict) -> None:
    """X — o mesmo login em 2 contas (a 2ª matrícula vive SÓ neste bloco — risco 4): a conta B não lê nem muda o Treino da A (C4), não mexe na
    rotina criada na A (I2), não lê o dia a dia da A; na matrícula dela, lê e pode mudar."""
    tk, f, hoje, m = x["tk"], x["f"], x["hoje"], x["marca"]
    a = f["pac_a"]
    b = B.Massa().segunda_matricula()
    P.check(bool(b), "[X0] a 2ª matrícula da aluna (conta do w13-dono, personal = ele) nasceu")
    st, r, _h = chamar("treino-acessos", tk["w13-dono"], {"acao": "salvar", "aluno": b, "valor": "mexer" if f["series_antes"] else "ver"})
    caso("X1", "C4/§5.5: o dono B não muda o Treino da conta A (pela matrícula B)", st, r, 403, r.get("erro") == "sem_acesso",
         series_no_treino(x) is f["series_antes"])
    st, r, _h = chamar("treino-acessos", tk["w13-dono"], {"acao": "ler", "aluno": b})
    caso("X2", "C4: nem lê", st, r, 403, r.get("erro") == "sem_acesso")
    st, r, _h = chamar("aluno-dia", tk["w5p-personal"], {"acao": "prof_rotina_salvar", "aluno": a, "dados": {"nome": f"{m} da conta A", "tipo": "habito"}})
    ra = (r.get("rotina") or {}).get("id")
    st2, r2, _h2 = chamar("aluno-dia", tk["w13-dono"], {"acao": "prof_rotina_salvar", "aluno": b, "id": ra, "dados": {"nome": "x"}})
    st3, _r3, _h3 = chamar("aluno-dia", tk["w13-dono"], {"acao": "prof_rotina_arquivar", "aluno": b, "id": ra})
    caso("X3", "I2/§5.5: a conta B não muda nem apaga a rotina criada na conta A", st2, r2, 404, st == 200, r2.get("erro") == "nao_encontrado", st3 == 404)
    st, r, _h = chamar("aluno-dia", tk["w13-dono"], {"acao": "ler", "q": "aluno_rotinas", "aluno": b, "de": hoje, "ate": hoje})
    caso("X4", "padrão 9: o dono B vê as rotinas da aluna (origem aluno), não as criadas na conta A", st, r, 200,
         ra not in {y.get("id") for y in r.get("rotinas") or []}, {y.get("origem") for y in r.get("rotinas") or []} <= {"aluno"})
    st, r, _h = chamar("aluno-dia", tk["w13-dono"], {"acao": "ler", "q": "aluno_dia", "aluno": a, "de": hoje, "ate": hoje})
    caso("X5", "o dono B não lê o dia a dia da matrícula A", st, r, 403, r.get("erro") == "sem_acesso")
    st, r, _h = chamar("acessos", tk["w13-dono"], {"acao": "ler", "aluno": b})
    caso("X6", "na matrícula dele, o dono B lê e pode mudar", st, r, 200, r.get("pode_mudar") is True)


def grupo_y(x: dict) -> None:
    """Y — P4: o DONO sem papel de personal (a Massa troca os papéis com a volta guardada) muda uma linha e as séries (pela admin-semana-treinos
    ele só lia)."""
    tk, f = x["tk"], x["f"]
    a = f["pac_a"]
    B.Massa().trocar_papeis("w5p-personal", "w5p-personal", ["dono"])
    st, r, _h = chamar("acessos", tk["w5p-personal"], {"acao": "salvar", "aluno": a, "chave": "diario_alimentar", "valor": "bloqueado"})
    st2, _r2, _h2 = chamar("acessos", tk["w5p-personal"], {"acao": "salvar", "aluno": a, "chave": "diario_alimentar", "valor": "liberado"})
    caso("Y1", "P4: o dono sem papel muda o diário com fotos (e volta)", st, r, 200, (r.get("linhas") or {}).get("diario_alimentar") == "bloqueado", st2 == 200)
    outro, antes = ("mexer", "ver") if f["series_antes"] else ("ver", "mexer")
    st, r, _h = chamar("treino-acessos", tk["w5p-personal"], {"acao": "salvar", "aluno": a, "valor": outro})
    st2, _r2, _h2 = chamar("treino-acessos", tk["w5p-personal"], {"acao": "salvar", "aluno": a, "valor": antes})
    caso("Y2", "P4: o dono sem papel muda as séries pela treino-acessos e volta", st, r, 200, r.get("registrado") is True, st2 == 200,
         series_no_treino(x) is f["series_antes"])


# ───────────────────────── os logs da borda (só contagens; o conteúdo nunca chega aqui) ─────────────────────────
SQL_LINHAS = ("SELECT log_attributes['function_id'] AS fid, count() AS total, "
              "countIf(isValidJSON(event_message) AND startsWith(trimLeft(event_message), '{\"nivel\":')) AS em_json, "
              "countIf(position(event_message, '<MARCA>') > 0) AS com_marca, "
              "countIf(position(event_message, '\"codigo\":\"dados_invalidos\"') > 0 AND position(event_message, '\"acao\":\"rotina_salvar\"') > 0 "
              "AND position(event_message, '\"resultado\":\"nome\"') > 0) AS provocado "
              "FROM logs WHERE source = 'function_logs' AND log_attributes['event_type'] = 'Log' GROUP BY fid")
SQL_BORDA = ("SELECT log_attributes['function_id'] AS fid, log_attributes['response.status_code'] AS st, count() AS n "
             "FROM logs WHERE source = 'function_edge_logs' GROUP BY fid, st")


def _logs():
    esp = importlib.util.spec_from_file_location("_logs_supabase_wa", REPO / "e2e" / "hml10" / "_logs_supabase.py")
    mod = importlib.util.module_from_spec(esp)
    esp.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


def contagens_dos_logs(desde: dt.datetime, marca: str) -> dict:
    """Por função da W-A, desde `desde`: as linhas do log (total, em JSON, com a marca, a recusa provocada) e os 5xx da borda."""
    L = _logs()
    fim = L.agora()
    saida = {f: {"total": 0, "em_json": 0, "com_marca": 0, "provocado": 0, "5xx": 0} for f in ("acessos", "aluno-dia", "treino-acessos")}
    for ref in (B.PRINCIPAL_REF, B.TREINO_REF):
        nomes = L.funcoes(ref)
        for linha in L.consulta(ref, SQL_LINHAS.replace("<MARCA>", marca.replace("'", "")), desde, fim):
            f = nomes.get(linha.get("fid") or "")
            if f in saida:
                for k in ("total", "em_json", "com_marca", "provocado"):
                    saida[f][k] += int(linha.get(k) or 0)
        for linha in L.consulta(ref, SQL_BORDA, desde, fim):
            f = nomes.get(linha.get("fid") or "")
            if f in saida and str(linha.get("st") or "").isdigit() and int(linha["st"]) >= 500:
                saida[f]["5xx"] += int(linha.get("n") or 0)
    return saida


def grupo_b(x: dict) -> None:
    """B — §5.6, os logs da borda: a recusa provocada (R15.0: o nome com 61, com a marca) aparece no log da aluno-dia SÓ com o código, a ação e o campo; nenhuma
    linha das 3 tem a marca da rodada; tudo no JSON do _shared/log.ts; nenhum 5xx na borda. A ingestão atrasa: até 5 min, de 30 em 30 s."""
    desde = _logs().ler_iso(x["inicio"])
    c: dict = {}
    for _ in range(10):
        c = contagens_dos_logs(desde, x["marca"])
        if c["aluno-dia"]["provocado"] >= 1:
            break
        time.sleep(30)
    P.check(c["aluno-dia"]["provocado"] >= 1, f"[B1] a recusa provocada está no log da aluno-dia só com o código, a ação e o campo ({c['aluno-dia']['provocado']})")
    P.check(all(v["com_marca"] == 0 for v in c.values()), f"[B2] nenhuma linha das 3 tem a marca da rodada: {[v['com_marca'] for v in c.values()]}")
    P.check(all(v["em_json"] == v["total"] and v["total"] > 0 for v in c.values()),
            f"[B3] 100% das linhas no JSON do _shared/log.ts: {[(k, v['em_json'], v['total']) for k, v in c.items()]}")
    P.check(all(v["5xx"] == 0 for v in c.values()), f"[B4] nenhum 5xx na borda desde o começo da rodada: {[v['5xx'] for v in c.values()]}")


def rodada_staging(grupos: set[str]) -> None:
    B.exigir_saude("o api.py da W-A (staging)")
    rod = Rodada()
    if rod.e:
        raise SystemExit(f"há o estado de uma rodada anterior ({ESTADO}): rode python3 e2e/wa/api.py --limpar antes")
    f = foto()
    mu = master_do_staging()
    rid = time.strftime("%m%d-%H%M")
    rod.e = {"inicio": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "rodada": rid, "marca": f"{B.MARCA} {rid}",
             "aluna": f["aluna"], "sozinho": f["sozinho"], "pac_a": f["pac_a"], "config_a": f["config_a"], "acessos_a": f["acessos_a"],
             "treino_user_id": f["treino_user_id"], "series_antes": f["series_antes"], "alimentos": [],
             "master_uid": mu["uid"], "master_papel": mu["role"]}
    rod.guardar()
    # o w27-master vira master SÓ durante a rodada (A2.1 e A12.x); o --limpar devolve o papel de antes e o Z confere
    B.escrever(f"update {S}.profiles set role = 'master' where id = {B.txt(mu['uid'])} and role is distinct from 'master'")
    logins = B.Logins()
    try:
        tk = {k: logins.token(k) for k in ("w5p-nutri", "w5p-personal", "w5p-aluna", "w7b-sozinho", "w13-dono", "w27-master")}
        x = {"f": f, "tk": tk, "hoje": f["hoje"], "marca": rod.e["marca"], "inicio": rod.e["inicio"], "logins": logins, "ids": massa_basica(rod, f)}
        for g, fn in (("A", grupo_a), ("T", grupo_t), ("R", grupo_r), ("D", grupo_d), ("X", grupo_x), ("Y", grupo_y), ("B", grupo_b)):
            if g in grupos:
                B.exigir_saude(f"o grupo {g}")
                fn(x)
    finally:
        sobras = limpar(rod)
        P.check(all(v == 0 for v in sobras.values()), f"[Z] a massa da rodada desfeita (staging e Treino): sobras {sobras}")
        logins.fechar(_Saida())


# ───────────────────────── --limpar ─────────────────────────
def _config_sql(cfg: object) -> str:
    return "null" if cfg is None else f"{B.txt(json.dumps(cfg))}::jsonb"


def conferir_sobras(e: dict) -> dict:
    """SÓ LEITURA: o que a rodada deixou (tem de dar tudo 0)."""
    al, so, ini, marca = B.txt(e["aluna"]), B.txt(e["sozinho"]), B.txt(e["inicio"]), B.txt(e["marca"] + "%")
    titulos = ", ".join(B.txt(t) for t in TITULOS_WA)
    r = B.ler(f"""select (select count(*) from {S}.rotinas where dono_user_id in ({al}, {so}) and nome like {marca}) as rotinas,
                         (select count(*) from {S}.aluno_alimentos where dono_user_id in ({al}, {so}) and nome like {marca}) as alimentos,
                         (select count(*) from {S}.aluno_receitas where dono_user_id in ({al}, {so}) and nome like {marca}) as receitas,
                         (select count(*) from {S}.aluno_dia_refeicoes where dono_user_id in ({al}, {so}) and nome like {marca}) as extras,
                         (select count(*) from {S}.aluno_dia_itens where dono_user_id in ({al}, {so}) and criado_em >= {ini}) as itens_do_dia,
                         (select count(*) from {S}.aluno_acessos_log where paciente_id = {B.txt(e['pac_a'])} and em >= {ini}) as historico,
                         (select count(*) from {S}.avisos where destino_user_id = {al} and tipo = 'geral' and titulo in ({titulos})
                            and criado_em >= {ini}) as avisos,
                         (select count(*) from {S}.alimentos where nome like {marca}) as alimento_fora,
                         ((select coalesce(jsonb_agg(jsonb_build_object('chave', x.chave, 'nivel', x.nivel) order by x.chave), '[]'::jsonb)
                             from {S}.aluno_acessos x where x.paciente_id = {B.txt(e['pac_a'])})
                           is distinct from {B.txt(json.dumps([{'chave': y['chave'], 'nivel': y['nivel']} for y in e.get('acessos_a') or []]))}::jsonb)::int
                           as acessos_diferentes,
                         ((select config from {S}.pacientes where id = {B.txt(e['pac_a'])}) is distinct from {_config_sql(e.get('config_a'))})::int
                           as config_diferente""")[0]
    t = B.C.ler(B.TREINO_REF, f"""select (series_travadas is distinct from {'true' if e.get('series_antes') else 'false'})::int as series_diferente
                                   from {S}.physiq_profiles where id = {B.txt(e.get('treino_user_id'))}""")
    mestre = 0
    if e.get("master_uid"):
        mestre = int(B.ler(f"""select ((select role from {S}.profiles where id = {B.txt(e['master_uid'])})
                                       is distinct from {B.txt(e.get('master_papel'))})::int as d""")[0]["d"])
    return {**{k: int(v) for k, v in r.items()}, "series_diferente": int(t[0]["series_diferente"]) if t else 0, "master_diferente": mestre}


def limpar(rod: Rodada | None = None) -> dict:
    """Desfaz a massa do estado (staging e o series_travadas do Treino) e a da Massa do _base.py; devolve as sobras (tudo 0 = limpo)."""
    rod = rod or Rodada()
    e = rod.e
    sobras: dict = {}
    if e:
        al, so, ini, marca = B.txt(e["aluna"]), B.txt(e["sozinho"]), B.txt(e["inicio"]), B.txt(e["marca"] + "%")
        comandos = [
            f"delete from {S}.aluno_dia_itens where dono_user_id in ({al}, {so}) and criado_em >= {ini}",
            f"delete from {S}.aluno_dia_refeicoes where dono_user_id in ({al}, {so}) and nome like {marca}",
            f"delete from {S}.aluno_receitas where dono_user_id in ({al}, {so}) and nome like {marca}",
            f"delete from {S}.aluno_alimentos where dono_user_id in ({al}, {so}) and nome like {marca}",
            f"delete from {S}.rotinas where dono_user_id in ({al}, {so}) and nome like {marca}",
            f"update {S}.pacientes set config = {_config_sql(e.get('config_a'))} where id = {B.txt(e['pac_a'])}",
            f"delete from {S}.aluno_acessos where paciente_id = {B.txt(e['pac_a'])}",
            *[f"""insert into {S}.aluno_acessos (paciente_id, chave, nivel, alterado_por, alterado_em)
                  values ({B.txt(e['pac_a'])}, {B.txt(y['chave'])}, {B.txt(y['nivel'])}, {B.txt(y.get('alterado_por'))}, {B.txt(y.get('alterado_em'))})"""
              for y in e.get("acessos_a") or []],
            f"delete from {S}.aluno_acessos_log where paciente_id = {B.txt(e['pac_a'])} and em >= {ini}",
            f"""delete from {S}.avisos where destino_user_id = {al} and tipo = 'geral' and criado_em >= {ini}
                 and titulo in ({', '.join(B.txt(t) for t in TITULOS_WA)})""",
        ]
        if e.get("alimentos"):
            comandos.append(f"delete from {S}.alimentos where id = any(array[{', '.join(B.txt(i) for i in e['alimentos'])}]::uuid[]) and nome like {marca}")
        if e.get("master_uid") and e.get("master_papel") != "master":
            comandos.append(f"update {S}.profiles set role = {B.txt(e['master_papel'])} where id = {B.txt(e['master_uid'])} and role = 'master'")
        for c in comandos:
            B.escrever(c)
        if e.get("treino_user_id") and isinstance(e.get("series_antes"), bool):
            B.C.C2.sql_mgmt(B.TREINO_REF, f"update {S}.physiq_profiles set series_travadas = {'true' if e['series_antes'] else 'false'} "
                                          f"where id = {B.txt(e['treino_user_id'])}")
        sobras = conferir_sobras(e)
    massa = B.Massa().limpar()   # a 2ª matrícula, as "sem login"/"só nutri" e os papéis do w5p-personal
    rod.e = {}
    rod.guardar()
    return {**sobras, **{f"massa_{k}": int(v) for k, v in massa.items()}}


# ───────────────────────── --so-leitura: a PRODUÇÃO, só leitura ─────────────────────────
def so_leitura(corpo: object) -> object:
    """A trava do --so-leitura: nenhum corpo com uma GRAVAÇÃO de verdade sai daqui (nem inválido) — risco 9 do mestre."""
    if isinstance(corpo, dict) and corpo.get("acao") in GRAVACOES:
        raise SystemExit(f"PAROU: o --so-leitura ia mandar uma gravação ({corpo.get('acao')}) para a PRODUÇÃO")
    return corpo


def rodada_producao(desde: str | None) -> None:
    B.usar_schema("public")
    B.exigir_saude("o smoke só leitura da W-A (produção)")
    logins = B.Logins()
    pr = lambda f, tok, corpo, **kw: chamar(f, tok, so_leitura(corpo), schema=kw.get("schema", "public"), origem=ORIGEM_PROD)  # noqa: E731
    try:
        tk = {k: logins.token(k) for k in ("w5p-personal", "w5p-aluna")}
        hoje = B.ler("select (now() at time zone 'America/Sao_Paulo')::date::text as d")[0]["d"]
        for f in ("acessos", "aluno-dia", "treino-acessos"):
            st, ao = preflight(f, ORIGEM_PROD)
            caso(f"P1/{f}", "OPTIONS: o CORS do site", st, {}, 200, ao == ORIGEM_PROD)
            st, r, _h = pr(f, None, {"acao": "ler"})
            caso(f"P2/{f}", "sem login → 401", st, r, 401)
            st, r, _h = pr(f, tk["w5p-personal"], {"acao": "ler"}, schema="xpto")
            caso(f"P3/{f}", "x-schema fora da lista → 400", st, r, 400)
            st, r, _h = pr(f, tk["w5p-personal"], {"acao": "acao_que_nao_existe"})
            caso(f"P4/{f}", "ação desconhecida → 400, recusada antes de qualquer RPC", st, r, 400, r.get("erro") == "acao_invalida")
        st, r, _h = pr("acessos", tk["w5p-personal"], {"acao": "ler", "aluno": FALSO})
        caso("P5", "acessos › ler um aluno que não existe (a RPC existe no public)", st, r, 404, r.get("erro") == "aluno_inexistente")
        for i, (q, extra) in enumerate((("rotinas", {"de": hoje, "ate": hoje}), ("dia", {"dia": hoje}), ("biblioteca", {}),
                                        ("alimentos", {"termo": "arroz", "pagina": 0}))):
            st, r, _h = pr("aluno-dia", tk["w5p-aluna"], {**extra, "q": q, "acao": "ler"})
            caso(f"P6.{i}", f"aluno-dia › ler {q} da conta de TESTE no public", st, r, 200, r.get("ok") is True)
        st, r, _h = pr("aluno-dia", tk["w5p-personal"], {"acao": "ler", "q": "aluno_rotinas", "aluno": FALSO, "de": hoje, "ate": hoje})
        caso("P7", "aluno-dia › aluno_rotinas de um aluno que não existe", st, r, 404, r.get("erro") == "aluno_inexistente")
        st, r, _h = pr("treino-acessos", tk["w5p-personal"], {"acao": "ler", "aluno": FALSO})
        caso("P8", "treino-acessos › ler um aluno que não existe (o principal responde pelo Treino)", st, r, 404, r.get("erro") == "aluno_inexistente")
        if desde:
            c = contagens_dos_logs(_logs().ler_iso(desde), "marca-que-nao-existe-wa")
            P.check(all(v["5xx"] == 0 for v in c.values()), f"[P9] nenhum 5xx das 3 na borda desde a publicação: {[v['5xx'] for v in c.values()]}")
            P.check(all(v["em_json"] == v["total"] for v in c.values()), f"[P10] 100% das linhas em JSON: {[(k, v['em_json'], v['total']) for k, v in c.items()]}")
    finally:
        logins.fechar(_Saida())


def main() -> int:
    ap = argparse.ArgumentParser()
    modo = ap.add_mutually_exclusive_group()
    modo.add_argument("--seco", action="store_true")
    modo.add_argument("--local", action="store_true")
    modo.add_argument("--so-leitura", action="store_true")
    modo.add_argument("--limpar", action="store_true")
    ap.add_argument("--grupos", default="A,T,R,D,X,Y,B")
    ap.add_argument("--desde", default="")
    a = ap.parse_args()
    if a.seco:
        rodada_seca()
        return P.fim()
    if a.local:
        rodada_local()
        return P.fim()
    if a.limpar:
        print("sobras depois de limpar:", limpar())
        return 0
    if a.so_leitura:
        rodada_producao(a.desde or None)
        return P.fim()
    rodada_staging({g.strip().upper() for g in a.grupos.split(",") if g.strip()})
    return P.fim()


if __name__ == "__main__":
    raise SystemExit(main())
