"""Physiq W-A (Acessos do aluno) — a base dos E2E da W-A (P1 → P7). Reaproveita a base da hml-17 (e2e/hml17/_base.py: as contas de
TESTE, os logins com o logout SÓ das sessões do teste, a Tela com a sessão antes do 1º documento, a Guarda de produção só leitura) e
acrescenta:
  · SQL    ler() SÓ LEITURA (transação read only) e escrever()/resultado() para os blocos desfeitos — o molde do e2e/w2/sql_w2.py: o
           bloco termina com erro de propósito e o resultado vem na mensagem (aqui SEM o corte de 500 caracteres do _comum.sql_mgmt);
           ensaio local por PHYSIQ_SQL_LOCAL=<pasta do socket de um Postgres descartável> (psql só por socket; nunca a rede);
  · Saúde  saude() / exigir_saude(): o /health dos 2 projetos (db, auth, rest) — tudo ACTIVE_HEALTHY, senão PARA (H-80; o Banco do
           Treino é o mesmo projeto da produção — incidente de 10/10);
  · Massa  Massa: a massa PERSISTENTE das partes P2–P6, SÓ no staging, com a marca "WA E2E" e o estado em
           ~/projetos/physiqcalc-scratch/w-a/massa-estado.json (o "limpar" desfaz mesmo depois de uma queda): a 2ª matrícula da aluna
           na conta do w13-dono (o mesmo login em 2 contas) e a troca de papéis com a volta guardada (o "dono sem papel de personal");
  · Prints pasta_prints(parte) → ~/projetos/physiqcalc-scratch/prints/w-a/<parte>/ (a Tela da hml-17 grava <nome>_<largura>.png).
Uso: sys.path.insert(0, "<repo>/e2e/wa"); import _base as B
Autoteste: python3 e2e/wa/_base.py --autoteste --seco   (sem banco: os ajudantes puros)
           python3 e2e/wa/_base.py --autoteste           (staging: cria a massa, confere, limpa e confere as sobras = 0)
           python3 e2e/wa/_base.py --limpar              (desfaz o que o estado guardou)
Sem segredo nem dado pessoal na saída: chaves pela Management API (~/.pc-pat), senhas em ~/.physiq-teste-<nome> (600).
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
AQUI = Path(__file__).resolve().parent
REPO = AQUI.parents[1]

_ESPEC = importlib.util.spec_from_file_location("_base_hml17", REPO / "e2e" / "hml17" / "_base.py")
H = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_hml17"] = H
_ESPEC.loader.exec_module(H)  # type: ignore[union-attr]
C, B5 = H.C, H.B5

PRINCIPAL_REF = H.PRINCIPAL_REF
TREINO_REF = "uxwpwdbbnlticxgtzcsb"
CONTAS = H.CONTAS   # w5p-nutri · w5p-personal (dono + personal) · w5p-aluna · w7b-sozinho (app sem profissional) · w13-dono · w27-master
Logins, Tela, Guarda, cab, rpc, rest = H.Logins, H.Tela, H.Guarda, H.cab, H.rpc, H.rest
usar_schema, schema = H.usar_schema, H.schema
MARCA = "WA E2E"
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch"
LOCAL = os.environ.get("PHYSIQ_SQL_LOCAL", "").strip()
# o estado da massa: no ensaio local, ao lado do socket (a pasta do Postgres descartável some junto)
ESTADO = (Path(LOCAL).parent / "massa-estado.json") if LOCAL else SCRATCH / "w-a" / "massa-estado.json"
FALHA_SQL = re.compile(r"RESULTADO<<(\{.*?\})>>", re.S)
TABELAS_COM_NOME = ("rotinas", "aluno_alimentos", "aluno_receitas", "aluno_dia_refeicoes")   # as tabelas novas com "nome" (a marca)


def pasta_prints(parte: str) -> Path:
    p = SCRATCH / "prints" / "w-a" / parte
    p.mkdir(parents=True, exist_ok=True)
    return p


def txt(v: object) -> str:
    """Literal SQL com aspas (só para valores de TESTE montados aqui)."""
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


# ───────────────────────── SQL (o Supabase pela Management API ou o ensaio local) ─────────────────────────
def _local(q: str, leitura: bool) -> list:
    pasta = Path(LOCAL)
    if not pasta.is_absolute() or not pasta.is_dir() or not any(pasta.glob(".s.PGSQL.*")):
        raise SystemExit(f"PHYSIQ_SQL_LOCAL tem que ser a pasta do socket de um Postgres local ({LOCAL!r})")
    env = dict(os.environ, PATH=f"{Path.home()}/.local/bin:{os.environ.get('PATH', '')}")
    base = ["psql", "-h", str(pasta), "-U", "postgres", "-d", "postgres", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"]
    cmd = base + (["-1", "-c", "set transaction read only", "-c", f"select coalesce(json_agg(t), '[]'::json) from ({q}) t"] if leitura
                  else ["-c", q])
    r = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=180)
    if r.returncode != 0:
        raise RuntimeError(f"SQL local: {r.stderr}")
    return json.loads(r.stdout.strip() or "[]") if leitura else []


def _mgmt(q: str) -> list:
    st, r, _ = B5.http("POST", f"https://api.supabase.com/v1/projects/{PRINCIPAL_REF}/database/query", {"query": q},
                       {"Authorization": f"Bearer {C.C2.pat()}"}, timeout=180)
    if st not in (200, 201):
        # a mensagem crua (as aspas sem escape): o RESULTADO<<json>> sai inteiro, sem o corte de 500 do _comum.sql_mgmt
        msg = r.get("message") if isinstance(r, dict) else r
        raise RuntimeError(f"SQL HTTP {st}: {msg}")
    return r or []


def ler(q: str) -> list:
    """Só leitura (vale no public): a transação é read only."""
    return _local(q, True) if LOCAL else _mgmt("set transaction read only;\n" + q)


def escrever(q: str) -> list:
    return _local(q, False) if LOCAL else _mgmt(q)


def resultado(q: str) -> dict:
    """Roda um bloco que TERMINA com raise 'RESULTADO<<json>>' (nada fica gravado) e devolve o json. Outro erro → RuntimeError."""
    try:
        escrever(q)
    except RuntimeError as e:
        m = FALHA_SQL.search(str(e))
        if m:
            return json.loads(m.group(1))
        raise
    raise RuntimeError("o bloco de teste não terminou com o erro esperado (RESULTADO<<…>>)")


# ───────────────────────── a guarda do /health (H-80) ─────────────────────────
def saude() -> tuple[bool, dict]:
    """/health dos 2 projetos (db, auth, rest) pela Management API: True só com tudo ACTIVE_HEALTHY. No ensaio local: sempre True."""
    if LOCAL:
        return True, {"local": "socket"}
    estados: dict = {}
    for ref in (TREINO_REF, PRINCIPAL_REF):
        st, r, _h = B5.http("GET", f"https://api.supabase.com/v1/projects/{ref}/health?services=db,auth,rest", None,
                            {"Authorization": f"Bearer {C.C2.pat()}"}, timeout=25)
        estados[ref[:6]] = {x.get("name"): x.get("status") for x in r} if st == 200 and isinstance(r, list) else {"http": st}
    ok = all(v and all(s == "ACTIVE_HEALTHY" for s in v.values()) for v in estados.values())
    return ok, estados


def exigir_saude(rotulo: str) -> None:
    ok, estados = saude()
    print(f"   /health dos 2 projetos antes de {rotulo}: {estados}", flush=True)
    if not ok:
        raise SystemExit(f"PAROU: /health ruim antes de {rotulo} (nada mais roda; avisar e esperar)")


# ───────────────────────── a massa persistente (P2–P6), SÓ no staging ─────────────────────────
class Massa:
    """O que a rodada cria vai para o estado (arquivo) ANTES de criar; limpar() desfaz pelo estado e confere as sobras pela marca."""

    def __init__(self, s: str = "staging") -> None:
        if s != "staging":
            raise SystemExit("a massa da W-A é SÓ do staging")
        self.s = s
        self.estado = json.loads(ESTADO.read_text(encoding="utf-8")) if ESTADO.exists() else {"matriculas": [], "papeis": []}

    def _guardar(self) -> None:
        ESTADO.parent.mkdir(parents=True, exist_ok=True)
        ESTADO.write_text(json.dumps(self.estado, ensure_ascii=False, indent=1), encoding="utf-8")

    def uid(self, conta: str) -> str:
        r = ler(f"select u.id::text as id from auth.users u where lower(u.email) = {txt(CONTAS[conta])}")
        if len(r) != 1:
            raise SystemExit(f"a conta de TESTE {conta} não existe")
        return r[0]["id"]

    def conta_do_dono(self, conta: str) -> str:
        r = ler(f"select c.id::text as id from {self.s}.contas c where c.dono_id = {txt(self.uid(conta))} and c.origem <> 'app' "
                f"order by c.criado_em limit 1")
        if not r:
            raise SystemExit(f"{conta} não é dono de conta no {self.s}")
        return r[0]["id"]

    def segunda_matricula(self, aluno: str = "w5p-aluna", dono: str = "w13-dono") -> str:
        """O mesmo login numa 2ª conta: a matrícula do `aluno` na conta do `dono` (personal = o dono), marcada no config."""
        conta, u_aluno, u_dono = self.conta_do_dono(dono), self.uid(aluno), self.uid(dono)
        achou = ler(f"select p.id::text as id from {self.s}.pacientes p where p.conta_id = {txt(conta)} and p.user_id = {txt(u_aluno)} "
                    f"and p.deleted_at is null and p.config ? 'wa_e2e'")
        if achou:
            return achou[0]["id"]
        escrever(f"insert into {self.s}.pacientes (conta_id, user_id, personal_id, nome, config) values ({txt(conta)}, {txt(u_aluno)}, "
                 f"{txt(u_dono)}, {txt(MARCA + ' — 2ª matrícula')}, '{{\"wa_e2e\": true}}'::jsonb)")
        mid = ler(f"select p.id::text as id from {self.s}.pacientes p where p.conta_id = {txt(conta)} and p.user_id = {txt(u_aluno)} "
                  f"and p.config ? 'wa_e2e'")[0]["id"]
        self.estado["matriculas"].append(mid)
        self._guardar()
        return mid

    def trocar_papeis(self, dono: str, membro: str, papeis: list[str]) -> None:
        """Troca os papéis de `membro` na conta de `dono` (ex.: o dono sem 'personal'); a volta vai para o estado ANTES de trocar."""
        conta, u = self.conta_do_dono(dono), self.uid(membro)
        r = ler(f"select m.id::text as id, m.papeis from {self.s}.conta_membros m where m.conta_id = {txt(conta)} and m.user_id = {txt(u)}")
        if len(r) != 1:
            raise SystemExit(f"{membro} não é membro da conta de {dono}")
        if not any(x["id"] == r[0]["id"] for x in self.estado["papeis"]):
            self.estado["papeis"].append({"id": r[0]["id"], "antes": r[0]["papeis"]})
            self._guardar()
        lista = "array[" + ", ".join(txt(p) for p in papeis) + "]::text[]"
        escrever(f"update {self.s}.conta_membros set papeis = {lista} where id = {txt(r[0]['id'])}")

    def limpar(self) -> dict:
        for x in self.estado["papeis"]:
            lista = "array[" + ", ".join(txt(p) for p in x["antes"]) + "]::text[]"
            escrever(f"update {self.s}.conta_membros set papeis = {lista} where id = {txt(x['id'])}")
        if self.estado["matriculas"]:
            ids = ", ".join(txt(i) for i in self.estado["matriculas"])
            escrever(f"delete from {self.s}.pacientes where id in ({ids}) and config ? 'wa_e2e'")
        self.estado = {"matriculas": [], "papeis": []}
        self._guardar()
        return self.sobras()

    def sobras(self) -> dict:
        """Linhas com a marca da W-A no staging (tem de dar tudo 0 no fim de cada parte); tabela que ainda não existe conta 0."""
        out = {"matriculas": ler(f"select count(*) as n from {self.s}.pacientes p where p.config ? 'wa_e2e'")[0]["n"]}
        existe = ler("select " + ", ".join(f"to_regclass('{self.s}.{t}') is not null as {t}" for t in TABELAS_COM_NOME))[0]
        for t in TABELAS_COM_NOME:
            out[t] = ler(f"select count(*) as n from {self.s}.{t} where nome like {txt(MARCA + '%')}")[0]["n"] if existe[t] else 0
        return out


def _autoteste(seco: bool) -> int:
    ok = txt("a'b") == "'a''b'" and txt(None) == "null"
    ok = ok and FALHA_SQL.search('ERROR:  P0001: RESULTADO<<{"a": {"b": 1}}>>\nCONTEXT: x').group(1) == '{"a": {"b": 1}}'
    print(("✅" if ok else "❌") + " ajudantes puros (txt, RESULTADO)")
    if seco:
        return 0 if ok else 1
    exigir_saude("o autoteste da massa")
    m = Massa()
    antes = m.sobras()
    mid = m.segunda_matricula()
    m.trocar_papeis("w5p-personal", "w5p-personal", ["dono"])
    meio = ler(f"select (select count(*) from staging.pacientes where id = {txt(mid)}) as mat, "
               f"(select m.papeis from staging.conta_membros m join staging.contas c on c.id = m.conta_id "
               f"  where c.dono_id = (select id from auth.users where lower(email) = {txt(CONTAS['w5p-personal'])}) "
               f"    and m.user_id = c.dono_id and c.origem <> 'app' order by c.criado_em limit 1) as papeis")[0]
    depois = m.limpar()
    ok2 = meio["mat"] == 1 and meio["papeis"] == ["dono"] and all(v == 0 for v in depois.values())
    print(("✅" if ok2 else "❌") + f" massa: criou a 2ª matrícula e trocou os papéis ({meio}); limpou → sobras {depois} (antes {antes})")
    return 0 if ok and ok2 else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--autoteste", action="store_true")
    ap.add_argument("--seco", action="store_true")
    ap.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    if a.limpar:
        print("sobras depois de limpar:", Massa().limpar())
        raise SystemExit(0)
    raise SystemExit(_autoteste(a.seco) if a.autoteste else 0)
