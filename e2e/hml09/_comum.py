"""Physiq hml-09 (H-23 + prova F4/H2, 08/10/2026) — base comum do guarda.py (staging) e do prova_prod.py (produção).

Reaproveita a base da W5 (e2e/w05/_base.py: http, chaves pela Management API com ~/.pc-pat, login de TESTE por e-mail e senha
pelo cab_login — o captcha global da W28 — e o navegador do Caso, com a sessão injetada) e junta:
  ler()             SQL SÓ LEITURA pela Management API ("read_only": a transação no Postgres recusa qualquer escrita);
  fks() / contar()  as colunas com FK para auth.users, lidas do catálogo (sem lista fixa), e o COUNT de cada uma para 1 id;
  contar_tabelas()  o COUNT das tabelas SEM FK para auth.users (no Treino: tb_treino_series, treino_historico…), só as que existem;
  sessao_magica()   sessão sem senha (link mágico da API admin, o molde do e2e/conta_unica/_base.py) — SÓ para login que JÁ
                    existe: no generate_link do GoTrue, e-mail desconhecido vira CADASTRO NOVO, e o Auth é o mesmo no staging e
                    na produção (seria um login novo de verdade);
  Sessoes           as sessões que o próprio teste abriu; no fim, logout scope=local de cada uma (nunca o global);
  Saida             ✅/❌ por caso, na tela e numa cópia em ~/projetos/physiqcalc-scratch/hml/hml09/<nome>.txt.
Sem segredo no repo nem na saída: chaves pela Management API, senhas em ~/.physiq-teste-<nome> (600); de cada resposta só saem
os campos de código (resumo()), nunca o corpo inteiro (a conferência traz nomes de alunos e da equipe).
Os 2 scripts carregam este arquivo com o nome "_comum_hml09": o "_comum" do sys.modules tem que ser o da W2, que a base da W5
importa ("from _comum import ...").
"""
from __future__ import annotations

import base64
import datetime as dt
import importlib.util
import json
import re
import sys
import time
from functools import lru_cache
from pathlib import Path

sys.dont_write_bytecode = True
REPO = Path(__file__).resolve().parents[2]  # a worktree onde este arquivo está (a da hml-09) — nunca ~/projetos/physiqcalc


def _carregar(nome: str, caminho: Path):
    espec = importlib.util.spec_from_file_location(nome, caminho)
    mod = importlib.util.module_from_spec(espec)
    sys.modules[nome] = mod
    espec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


# o "_comum" da W2 entra no sys.modules ANTES da base da W5 (este arquivo também se chama _comum.py)
C2 = sys.modules["_comum"] if hasattr(sys.modules.get("_comum"), "sql_mgmt") else _carregar("_comum", REPO / "e2e" / "w02" / "_comum.py")
B5 = sys.modules["_base_w05"] if "_base_w05" in sys.modules else _carregar("_base_w05", REPO / "e2e" / "w05" / "_base.py")

http, anon, service, cab_login, pat = B5.http, B5.anon, B5.service, B5.cab_login, C2.pat
PRINCIPAL_REF, PRINCIPAL_URL, TREINO_REF, TREINO_URL = B5.PRINCIPAL_REF, B5.PRINCIPAL_URL, B5.TREINO_REF, B5.TREINO_URL
API_P, API_T = B5.API_P, B5.API_T
SAIDA = Path.home() / "projetos" / "physiqcalc-scratch" / "hml" / "hml09"
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml09"
ORIGEM_STAGING = "https://physiqcalc-staging.vercel.app"
ORIGEM_PROD = "https://physiqcalc.com.br"
SUFIXO_TESTE = ".teste.claude@physiqnutri.app"
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
# os campos de uma resposta que podem ir para a saída (códigos e marcas; nada de nome, e-mail, lista ou contagem de outra pessoa)
CAMPOS_DE_CODIGO = ("ok", "erro", "error", "motivo", "simulacao", "perfil", "sem_vinculo", "papel", "vinculo", "login", "code")


class Parou(Exception):
    """O passo parou: nada mais é feito (impresso = o ❌ já saiu na Saida)."""

    def __init__(self, texto: str = "", impresso: bool = False) -> None:
        super().__init__(texto)
        self.impresso = impresso


class Saida:
    """✅/❌ por caso, na tela e numa cópia em texto. parar=True: o 1º ❌ encerra o passo (Parou)."""

    def __init__(self, nome: str, parar: bool = False) -> None:
        self.nome, self.parar = nome, parar
        self.arquivo = SAIDA / f"{nome}.txt"
        self.linhas: list[str] = []
        self.oks = self.falhas = 0
        self.linha(f"# {nome} · {time.strftime('%Y-%m-%d %H:%M:%S')}")

    def linha(self, texto: str) -> None:
        print(texto, flush=True)
        self.linhas.append(texto)

    def ok(self, cond: object, texto: str, parar: bool | None = None) -> bool:
        if cond:
            self.oks += 1
            self.linha("✅ " + texto)
            return True
        self.falhas += 1
        self.linha("❌ " + texto)
        if self.parar if parar is None else parar:
            raise Parou(texto, impresso=True)
        return False

    def fim(self) -> int:
        total = self.oks + self.falhas
        self.linha(f"\n{self.oks}/{total} ok" + (" — COM FALHA" if self.falhas else "") + f" · cópia: {self.arquivo}")
        SAIDA.mkdir(parents=True, exist_ok=True)
        self.arquivo.write_text("\n".join(self.linhas) + "\n", encoding="utf-8")
        return 1 if self.falhas else 0


# ───────────────────────── utilidades ─────────────────────────


def eh_uuid(v: object) -> bool:
    return isinstance(v, str) and bool(_UUID.match(v))


def uuid_ok(v: object) -> str:
    if not eh_uuid(v):
        raise Parou(f"id fora do formato uuid ({str(v)[:40]!r}) — parei")
    return v  # type: ignore[return-value]


def txt(v: object) -> str:
    """Literal de texto do SQL."""
    return "'" + str(v).replace("'", "''") + "'"


def nome_sql(v: str) -> str:
    """Identificador do SQL (nome de tabela/coluna vindo do catálogo)."""
    return '"' + str(v).replace('"', '""') + '"'


def eh_email_de_teste(email: str) -> bool:
    """P26: só *.teste.claude@physiqnutri.app — e nunca as contas demo da Play (revisao.*)."""
    e = (email or "").strip().lower()
    return e.endswith(SUFIXO_TESTE) and "revisao" not in e


def agora_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def resumo(r: object) -> dict:
    """Só os campos de código de uma resposta (o resto — listas, nomes, contagens — não sai)."""
    if not isinstance(r, dict):
        return {"_formato": type(r).__name__}
    return {k: r[k] for k in CAMPOS_DE_CODIGO if k in r and isinstance(r[k], (str, bool, int, float, type(None)))}


def cabecalho(h: dict | None, nome: str) -> str:
    for k, v in (h or {}).items():
        if k.lower() == nome.lower():
            return str(v)
    return ""


def claims(token: str) -> dict:
    """O payload do JWT (sem conferir a assinatura — só para as travas de conta: quem confere é o servidor)."""
    try:
        corpo = token.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(corpo + "=" * (-len(corpo) % 4)))
    except Exception:  # noqa: BLE001
        return {}


def json_arquivo(caminho: Path, dados) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


def ler_json(caminho: Path) -> dict | None:
    try:
        return json.loads(caminho.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None


# ───────────────────────── banco (só leitura) ─────────────────────────


def ler(ref: str, sql: str) -> list[dict]:
    """Uma consulta SÓ LEITURA pela Management API (read_only: true — qualquer escrita na transação dá erro no Postgres)."""
    st, r, _ = http("POST", f"https://api.supabase.com/v1/projects/{ref}/database/query", {"query": sql, "read_only": True},
                    {"Authorization": f"Bearer {pat()}"}, timeout=180)
    if st not in (200, 201):
        raise RuntimeError(f"SQL só leitura em {ref[:6]}… → HTTP {st}: {str(r)[:300]}")
    return r if isinstance(r, list) else []


@lru_cache(maxsize=None)
def fks(ref: str, esquemas: tuple[str, ...] = ("public", "staging")) -> tuple[tuple[str, str, str], ...]:
    """As colunas com FK para auth.users — (schema, tabela, coluna), do catálogo. Medido em 08/10: principal 68 por schema (58 em
    cascata, 10 set null), Treino 15 por schema (todas em cascata)."""
    lista = ", ".join(txt(s) for s in esquemas)
    linhas = ler(ref, f"""
      select n.nspname::text as s, c.relname::text as t, a.attname::text as c, array_length(con.conkey, 1) as k
        from pg_constraint con
        join pg_class c on c.oid = con.conrelid
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
       where con.contype = 'f' and con.confrelid = 'auth.users'::regclass and n.nspname in ({lista})
       order by 1, 2, 3""")
    if any(r["k"] != 1 for r in linhas):
        raise RuntimeError("FK de mais de uma coluna para auth.users: a contagem por coluna não serve")
    return tuple((r["s"], r["t"], r["c"]) for r in linhas)


def contar(ref: str, colunas, valor: str) -> dict[str, int]:
    """COUNT de cada coluna (schema.tabela.coluna) = valor — 1 consulta só leitura, nenhuma linha lida."""
    v = txt(uuid_ok(valor))
    partes = [f"select {txt(f'{s}.{t}.{c}')} as k, (select count(*) from {nome_sql(s)}.{nome_sql(t)} where {nome_sql(c)} = {v}::uuid)::int as n"
              for s, t, c in colunas]
    return {r["k"]: r["n"] for r in ler(ref, "\nunion all\n".join(partes))} if partes else {}


def contar_tabelas(ref: str, pares, valor: str) -> dict[str, int | None]:
    """COUNT de schema.tabela onde coluna = valor, para as (schema, tabela, coluna) que EXISTEM (information_schema); a que não existe
    fica None (registrada, sem quebrar a consulta). Comparação por texto (serve para coluna uuid ou text)."""
    v = txt(uuid_ok(valor))
    cond = " or ".join(f"(table_schema = {txt(s)} and table_name = {txt(t)} and column_name = {txt(c)})" for s, t, c in pares)
    existem = {(r["s"], r["t"], r["c"]) for r in ler(ref, "select table_schema::text as s, table_name::text as t, column_name::text as c "
                                                      f"from information_schema.columns where {cond}")} if cond else set()
    partes = [f"select {txt(f'{s}.{t}')} as k, (select count(*) from {nome_sql(s)}.{nome_sql(t)} where {nome_sql(c)}::text = {v})::int as n"
              for s, t, c in pares if (s, t, c) in existem]
    saida: dict[str, int | None] = {r["k"]: r["n"] for r in ler(ref, "\nunion all\n".join(partes))} if partes else {}
    for s, t, c in pares:
        saida.setdefault(f"{s}.{t}", None)
    return saida


def diferencas(a: dict, b: dict, prefixo: str = "") -> list[str]:
    """As chaves (achatadas) em que 2 fotos/contagens diferem."""
    saida: list[str] = []
    for k in sorted(set(a) | set(b), key=str):
        va, vb = a.get(k), b.get(k)
        if isinstance(va, dict) and isinstance(vb, dict):
            saida += diferencas(va, vb, f"{prefixo}{k}.")
        elif va != vb:
            saida.append(f"{prefixo}{k} ({va} → {vb})")
    return saida


def uid_por_email(email: str) -> str | None:
    r = ler(PRINCIPAL_REF, f"select id::text as id from auth.users where lower(email) = {txt(email.strip().lower())}")
    return r[0]["id"] if len(r) == 1 else None


def saude_treino(o: Saida, rotulo: str) -> None:
    """/health do Banco do Treino (VM Nano) antes de cada bloco: UNHEALTHY ou lento (> 10 s) → PARA (sem reiniciar nada)."""
    t0 = time.time()
    st, r, _ = http("GET", f"https://api.supabase.com/v1/projects/{TREINO_REF}/health?services=db&services=auth&services=rest", None,
                    {"Authorization": f"Bearer {pat()}"}, timeout=30)
    dt_ = time.time() - t0
    bom = st == 200 and isinstance(r, list) and bool(r) and all(x.get("healthy") is True or x.get("status") == "ACTIVE_HEALTHY" for x in r)
    o.ok(bom and dt_ <= 10, f"Banco do Treino saudável antes de {rotulo} ({st}, {dt_:.1f} s; UNHEALTHY ou lento = paro, sem reiniciar nada)", parar=True)


# ───────────────────────── sessões ─────────────────────────


def login_senha(email: str, senha: str) -> tuple[int, dict]:
    """Login por e-mail e senha no principal, como o B5.sessao (domínio próprio + cab_login: o captcha global da W28)."""
    st, s = 0, {}
    for tentativa in range(3):  # 522 do Cloudflare de vez em quando
        st, r, _ = http("POST", f"{API_P}/auth/v1/token?grant_type=password", {"email": email, "password": senha}, cab_login(API_P, anon(PRINCIPAL_REF)))
        s = r if isinstance(r, dict) else {}
        if st < 500:
            break
        time.sleep(4 * (tentativa + 1))
    return st, s


def sessao_magica(email: str) -> dict:
    """Sessão SEM senha e SEM e-mail (link mágico da API admin, verificado na hora). SÓ para login que já existe: com e-mail
    desconhecido, o generate_link do GoTrue cria o cadastro — conferido aqui antes, só leitura."""
    if not uid_por_email(email):
        raise Parou("o login não existe: nada de link mágico (o generate_link criaria um cadastro novo, na produção)")
    sp = service(PRINCIPAL_REF)
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/auth/v1/admin/generate_link", {"type": "magiclink", "email": email}, {"apikey": sp, "Authorization": f"Bearer {sp}"})
    th = (r.get("hashed_token") or (r.get("properties") or {}).get("hashed_token")) if isinstance(r, dict) else None
    if st != 200 or not th:
        raise RuntimeError(f"generate_link HTTP {st}")
    st, s, _ = http("POST", f"{PRINCIPAL_URL}/auth/v1/verify", {"type": "magiclink", "token_hash": th}, {"apikey": anon(PRINCIPAL_REF)})
    if st != 200 or not isinstance(s, dict) or not s.get("access_token"):
        raise RuntimeError(f"verify HTTP {st}")
    return s


def sair_local(token: str, banco: str) -> int:
    """Logout SÓ desta sessão (scope=local) — o global derrubaria as outras sessões da conta."""
    assert banco in ("principal", "treino"), banco
    url, chave = (PRINCIPAL_URL, anon(PRINCIPAL_REF)) if banco == "principal" else (TREINO_URL, anon(TREINO_REF))
    st, _, _ = http("POST", f"{url}/auth/v1/logout?scope=local", {}, {"apikey": chave, "Authorization": f"Bearer {token}"})
    return st


class Sessoes:
    """As sessões que o PRÓPRIO teste abriu; fechar() faz o logout local de cada uma (no fim de cada subcomando)."""

    def __init__(self) -> None:
        self.abertas: list[tuple[str, str, str]] = []

    def guardar(self, banco: str, token: str, rotulo: str) -> str:
        assert banco in ("principal", "treino"), banco
        self.abertas.append((banco, token, rotulo))
        return token

    def esquecer(self, token: str) -> None:
        """A sessão saiu junto com o login (exclusão feita): não há o que fechar."""
        self.abertas = [x for x in self.abertas if x[1] != token]

    def fechar(self, o: Saida) -> None:
        while self.abertas:
            banco, token, rotulo = self.abertas.pop()
            try:
                st: object = sair_local(token, banco)
            except Exception as e:  # noqa: BLE001
                st = type(e).__name__
            o.ok(st in (200, 204), f"logout (scope=local) da sessão que o teste abriu: {rotulo} ({st})", parar=False)


def funcao(base: str, nome: str, corpo: dict, token: str, chave: str, schema: str, origem: str) -> tuple[int, dict, dict]:
    """POST numa função de borda com a sessão da pessoa (o que o app manda: Authorization, apikey e x-schema)."""
    st, r, h = http("POST", f"{base}/functions/v1/{nome}", corpo,
                    {"apikey": chave, "Authorization": f"Bearer {token}", "x-schema": schema, "Origin": origem}, timeout=150)
    return st, (r if isinstance(r, dict) else {}), h
