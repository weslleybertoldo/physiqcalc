#!/usr/bin/env python3
"""Physiq W-A P4 — E2E de TELA da aba Acessos do Painel › Aluno (Edge; computador 1280 × 883 e celular 390 × 844). Spec W-A §4.1, §4.2, §4.7,
§6 "P4", §7. Contas de TESTE (hml-17): w5p-personal (dono + personal da conta A da w5p-aluna), w5p-nutri (a nutricionista dela na conta A),
w27-master (master SÓ no staging.profiles durante a rodada — o molde do api.py), w13-dono (a conta B: a 2ª matrícula da aluna, pela Massa) e o
"dono sem papel" (o w5p-personal só com o papel 'dono', pela Massa, com a volta guardada). Casos (na ordem; cada um depende do anterior):
  A0  o build é o de STAGING (a faixa "Ambiente de teste" na /entrar; --loja: a marca da loja no index.html) — senão nada roda com conta
  C1  a_acessos_personal   o personal abre a aba: a "Acessos" é a última da barra; as 6 linhas na ordem com os níveis do banco; o Login do
                           aluno à direita; o resumo do rodapé; ao abrir, 0 gravação (só `acao: "ler"` na acessos e na treino-acessos)
  C2  muda o envio pelo link e o diário (Bloqueado → no banco; o "Mudado por" e o histórico com quem mudou; o aviso "Vale quando o diário
      estiver liberado" no link) e volta os 2
  C3  a_confirmar_bloqueio "App: Bloqueado" pede a confirmação do app: Cancelar não grava; "Bloquear" grava; Liberado de novo (sem confirmação)
  C4  a_acessos_nutri      a nutri (sem sessão no Treino) trava/destrava as séries pela treino-acessos: no Banco do Treino o series_travadas (o
                           que o app lê pelo PowerSync — a tela do aluno é provada no Vitest: o build de staging não tem PowerSync) e o
                           histórico no principal; a Dieta "Pode mexer" → o nível e 1 aviso no sino da aluna; volta a "Só ver"; as séries voltam
  C5  o dono SEM papel de personal muda as séries e volta (os papéis voltam logo depois)
  C6  o master abre a aba (pode mudar) — só lê
  C7  a_acessos_sem_login  a matrícula "sem login" (Massa): o App desligado com "Ele ainda não tem login…"; as séries "Vale depois do 1º acesso…";
                           o Login do aluno com "SEM ACESSO" e "Criar acesso"
  C8  a_acessos_outra_conta o w13-dono na 2ª matrícula da aluna (conta B): a linha das séries = "Treino de outro personal…" (sem os níveis)
  C9  a_acessos_celular    390 px: a aba ativa rola para a vista na barra; nada passa da largura da tela
  C10 a_resumo_depois      o Resumo sem o card de login; "Mensagens automáticas" só com o WhatsApp; o ⋯ › Acesso do aluno abre a aba Acessos
  C11 a_editor_sem_cadeado o editor do Treino sem o chip "ALUNO NÃO MUDA AS SÉRIES"
  --loja: A0 + C1, C4 e C5 SÓ LEITURA + C6 da loja (o master no app vê "Conta master: use o site" e sai deste aparelho — hml-08)
          + C9 + C3 só até o Cancelar (o print com o prefixo loja_).
A rodada vai para o estado (~/projetos/physiqcalc-scratch/w-a/p4-estado.json) ANTES de qualquer escrita: a foto da matrícula A (o config, os acessos,
o series_travadas do Treino) e o papel do w27-master; no fim (e no --limpar) tudo volta à foto, o histórico e os avisos da rodada saem e a Massa
(a 2ª matrícula, a "sem login", os papéis) é desfeita — as sobras = 0.
Bases: --base local (o vite preview do dist/ de STAGING em http://localhost:5173 — a 8080 é da LINUX 1) · staging (https://physiqcalc-staging.vercel.app)
· prod (https://physiqcalc.com.br, SÓ LEITURA: a Guarda da hml-17 no navegador — nenhuma gravação sai —, a conta de teste "master" do Calc
(admin.teste.claude) no aluno da conta "Admin Teste": P1 a aba Acessos abre só com leituras, P2 o Resumo sem o card de login, P3 nenhuma
gravação tentada; prints prod_a_acessos, prod_a_resumo; sem massa). Prints: ~/projetos/physiqcalc-scratch/prints/w-a/p4/<base>[-loja]/<caso>_<largura>.png.
Saída: ~/projetos/physiqcalc-scratch/w-a/p4/telas_acessos_<base>.txt (só contagens, níveis, status e códigos). Logout local das sessões do teste.
--seco: sem rede e sem navegador — cada seletor e texto que o E2E usa existe no código (e o que saiu, saiu).
Uso: python3 e2e/wa/telas_acessos.py --base local|staging|prod [--loja] [--canal msedge] | --limpar | --seco
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import time
import uuid
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

C, B5 = B.C, B.B5
S = "staging"
BASES = {"local": "http://localhost:5173", "staging": "https://physiqcalc-staging.vercel.app", "prod": "https://physiqcalc.com.br"}
ESTADO = B.SCRATCH / "w-a" / "p4-estado.json"
C.SAIDA = B.SCRATCH / "w-a" / "p4"
TITULO_DIETA = "Sua dieta foi liberada: agora você pode pôr e tirar alimentos no seu dia"
LINHAS = ["acesso_app", "treino_series", "dieta", "diario_alimentar", "acesso_link", "rotinas"]
MUDADO = re.compile(r"^Mudado por \S+ em \d{2}/\d{2} \d{2}:\d{2}$")

# --seco: o arquivo → o que tem de estar nele (seletores e textos que o E2E usa)
NO_CODIGO = {
    "src/painel/aluno/acessos/LinhaDeAcesso.tsx": ["data-acessos-linha={def.chave}", 'data-acessos-nivel={valor ?? ""}', "data-acessos-estado={estado}",
                                                   "data-acessos-radio={`${def.chave}:${n.valor}`}", "data-acessos-mudanca", "data-acessos-aviso",
                                                   "data-acessos-sem", "data-acessos-fixo", 'role="radiogroup"'],
    "src/painel/aluno/acessos/ListaDeAcessos.tsx": ['data-aba-acessos="pronto"', 'data-acessos-pode-mudar={d.pode_mudar ? "1" : "0"}', "data-acessos-resumo",
                                                    "data-acessos-series-tentar", 'rotuloConfirmar: "Bloquear"'],
    "src/painel/aluno/acessos/regras.ts": ['"Ele ainda não tem login: crie o acesso em Login do aluno."', '"Vale depois do 1º acesso do aluno ao app."',
                                           '"Treino de outro personal: ', '"Vale quando o diário estiver liberado."', '"Este aluno não tem dieta"', 'salvo: "Salvo"'],
    "src/painel/aluno/abas/Acessos.tsx": ["data-aba-acessos-aluno", "lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"],
    "src/painel/aluno/catalogoAbas.ts": ['{ id: "acessos", arquivo: "Acessos", rotulo: "Acessos"', '"CardRotinas",'],
    "src/painel/aluno/AlunoLayout.tsx": ["rolagemParaMostrar", "data-aba-aluno={a.id}", "data-abas-aluno"],
    "src/painel/aluno/resumo/acesso/CardAcessoAluno.tsx": ["data-card-acesso-aluno", "Login do aluno", "data-acesso-criar", "data-acesso-estado"],
    "src/painel/aluno/resumo/CardAjustesAluno.tsx": ['titulo="Mensagens automáticas"', "data-card-ajustes-aluno", "data-ajuste={a.chave}"],
    "src/painel/aluno/Cabecalho.tsx": ["navigate(`${base}/acessos`)", 'marca="acesso"'],
    "src/ui/premium/Confirmar.tsx": ["data-confirmar-ok", "data-confirmar-cancelar"],
    # o C6 da loja: no app, a conta master sai deste aparelho e vê o cartão (hml-08, H-22)
    "src/ui/casca/MasterSoNoSite.tsx": ["data-master-so-no-site", "Conta master: use o site", 'sair({ escopo: "local" })'],
}
# o que SAIU com a P4 (tem de estar fora)
FORA_DO_CODIGO = {
    "src/treino/editor/EditorTreino.tsx": ["data-chip-cadeado", "ALUNO NÃO MUDA AS SÉRIES"],
    "src/painel/aluno/catalogoAbas.ts": ['"CardAcessoAluno"'],
    "src/painel/aluno/resumo/CardAjustesAluno.tsx": ['titulo="Ajustes do aluno"', "acesso_app"],
}
ARQUIVOS_QUE_SAIRAM = ["src/painel/aluno/resumo/CardAcessoAluno.tsx"]
# na produção (a Guarda), as gravações que já existem ao abrir e não são da W-A: o aluno_acesso do card de login (lê e garante — H-43) e o
# garantir da nutricao (o 1º acesso) — o molde de e2e/hml20/dieta_tela.py
BARRADAS_ACEITAS = {"POST rpc:aluno_acesso", "POST fn:nutricao"}


class Rodada:
    def __init__(self, o, base: str, prefixo: str) -> None:
        self.o, self.base, self.prefixo = o, base, prefixo
        self.L = B.Logins()
        self.pasta = B.pasta_prints("p4") / prefixo
        self.provas: list[str] = []
        self.e: dict = {}
        self.prefixo_print = ""

    def tela(self, nav, nome: str, desktop: bool = True) -> B.Tela:
        return B.Tela(nav, self.base, "p4", nome, desktop=desktop)

    def print(self, t: B.Tela, caso: str) -> None:
        caminho = t.print(self.pasta, caso)
        self.provas.append(caminho)
        self.o.linha(f"   print: {caminho}")

    def guardar(self) -> None:
        ESTADO.parent.mkdir(parents=True, exist_ok=True)
        ESTADO.write_text(json.dumps(self.e, ensure_ascii=False, indent=1), encoding="utf-8")


# ───────────────────────── o banco (SÓ LEITURA, menos a massa e a limpeza) ─────────────────────────
def foto() -> dict:
    """SÓ LEITURA: os ids da massa de TESTE e o 'antes' do que a rodada muda (o config e os acessos da A; o series_travadas do Treino)."""
    E = B.CONTAS
    u = lambda k: f"(select id from auth.users where lower(email) = {B.txt(E[k])})"  # noqa: E731
    r = B.ler(f"""
      with a as (select p.id, p.conta_id, p.config from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
                  where p.user_id = {u('w5p-aluna')} and p.deleted_at is null and c.origem <> 'app' and p.nutricionista_id = {u('w5p-nutri')}
                    and p.personal_id = {u('w5p-personal')}
                  order by p.created_at limit 1)
      select (select id::text from a) as pac_a, (select conta_id::text from a) as conta_a, (select config from a) as config_a,
             {u('w5p-aluna')}::text as aluna, {u('w5p-nutri')}::text as nutri, {u('w5p-personal')}::text as personal,
             (select coalesce(jsonb_agg(jsonb_build_object('chave', x.chave, 'nivel', x.nivel, 'alterado_por', x.alterado_por,
                                                           'alterado_em', x.alterado_em) order by x.chave), '[]'::jsonb)
                from {S}.aluno_acessos x, a where x.paciente_id = a.id) as acessos_a,
             (select {S}.ajustes_do_aluno(p.config, p.user_id is not null) from {S}.pacientes p, a where p.id = a.id) as ajustes_a""")[0]
    t = B.C.ler(B.TREINO_REF, f"""select i.treino_user_id::text as treino_user_id, pf.series_travadas from {S}.physiq_identidades i
                                   join {S}.physiq_profiles pf on pf.id = i.treino_user_id where i.principal_user_id = {B.txt(r['aluna'])}""")
    if not (r["pac_a"] and r["conta_a"] and t):
        raise SystemExit("massa de TESTE incompleta no staging (a matrícula A da w5p-aluna com o w5p-personal e a w5p-nutri, e o Treino dela) — nada foi gravado")
    sobra = B.Massa().sobras()
    if any(int(v) for v in sobra.values()):
        raise SystemExit(f"há massa da W-A de uma rodada anterior no staging ({sobra}): rode o --limpar da parte que deixou — nada foi gravado")
    return {**r, "treino_user_id": t[0]["treino_user_id"], "series_antes": bool(t[0]["series_travadas"])}


def master_do_staging() -> dict:
    r = B.ler(f"""select p.id::text as uid, p.role from {S}.profiles p
                   where p.id = (select id from auth.users where lower(email) = {B.txt(B.CONTAS['w27-master'])})""")
    if not r:
        raise SystemExit("o w27-master sem profile no staging — nada foi gravado")
    return r[0]


def ajustes(e: dict) -> dict:
    return B.ler(f"select {S}.ajustes_do_aluno(p.config, p.user_id is not null) as aj from {S}.pacientes p where p.id = {B.txt(e['pac_a'])}")[0]["aj"] or {}


def dieta(e: dict) -> str:
    r = B.ler(f"select nivel from {S}.aluno_acessos where paciente_id = {B.txt(e['pac_a'])} and chave = 'dieta'")
    return r[0]["nivel"] if r else "ver"


def series(e: dict) -> bool | None:
    r = B.C.ler(B.TREINO_REF, f"select series_travadas from {S}.physiq_profiles where id = {B.txt(e['treino_user_id'])}")
    return r[0]["series_travadas"] if r else None


def ultimo_log(e: dict, chave: str) -> dict:
    """A última linha do histórico da chave desde o começo da rodada (para/por) e quantas houve."""
    r = B.ler(f"""select count(*) over () as n, l.para, l.por::text as por from {S}.aluno_acessos_log l
                   where l.paciente_id = {B.txt(e['pac_a'])} and l.chave = {B.txt(chave)} and l.em >= {B.txt(e['inicio'])}
                   order by l.em desc, l.id desc limit 1""")
    return r[0] if r else {"n": 0, "para": None, "por": None}


def avisos_dieta(e: dict) -> int:
    return int(B.ler(f"""select count(*) as n from {S}.avisos where destino_user_id = {B.txt(e['aluna'])} and tipo = 'geral'
                           and titulo = {B.txt(TITULO_DIETA)} and criado_em >= {B.txt(e['inicio'])}""")[0]["n"])


def massa_sem_login(R: Rodada) -> str:
    """A matrícula 'sem login' (personal + nutri, na conta A) pela Massa do _base.py: o id vai ao estado ANTES do insert."""
    m = B.Massa()
    novo = str(uuid.uuid4())
    m.estado["matriculas"].append(novo)
    m._guardar()  # noqa: SLF001 — o mesmo estado do --limpar do _base.py
    B.escrever(f"""insert into {S}.pacientes (id, conta_id, personal_id, nutricionista_id, nome, config)
                   values ({B.txt(novo)}, {B.txt(R.e['conta_a'])}, {B.txt(R.e['personal'])}, {B.txt(R.e['nutri'])},
                           {B.txt(R.e['marca'] + ' sem login')}, '{{"wa_e2e": true}}'::jsonb)""")
    return novo


def devolver_papeis() -> None:
    """Os papéis que a Massa trocou voltam JÁ (o resto da Massa — as matrículas — fica para o fim)."""
    m = B.Massa()
    for x in m.estado["papeis"]:
        lista = "array[" + ", ".join(B.txt(p) for p in x["antes"]) + "]::text[]"
        B.escrever(f"update {S}.conta_membros set papeis = {lista} where id = {B.txt(x['id'])}")
    m.estado["papeis"] = []
    m._guardar()  # noqa: SLF001


def _config_sql(cfg: object) -> str:
    return "null" if cfg is None else f"{B.txt(json.dumps(cfg))}::jsonb"


def conferir_sobras(e: dict) -> dict:
    """SÓ LEITURA: o que a rodada deixou (tem de dar tudo 0)."""
    r = B.ler(f"""select (select count(*) from {S}.aluno_acessos_log where paciente_id = {B.txt(e['pac_a'])} and em >= {B.txt(e['inicio'])}) as historico,
                         (select count(*) from {S}.avisos where destino_user_id = {B.txt(e['aluna'])} and tipo = 'geral'
                            and titulo = {B.txt(TITULO_DIETA)} and criado_em >= {B.txt(e['inicio'])}) as avisos,
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


def limpar(e: dict | None = None) -> dict:
    """Desfaz a rodada pelo estado (o config, os acessos e o histórico da A, os avisos, o series_travadas do Treino, o papel do master) e a
    Massa do _base.py (a 2ª matrícula, a 'sem login', os papéis); devolve as sobras (tudo 0 = limpo)."""
    e = e if e is not None else (json.loads(ESTADO.read_text(encoding="utf-8") or "{}") if ESTADO.exists() else {})
    sobras: dict = {}
    if e.get("pac_a"):
        pa, ini = B.txt(e["pac_a"]), B.txt(e["inicio"])
        comandos = [
            f"update {S}.pacientes set config = {_config_sql(e.get('config_a'))} where id = {pa}",
            f"delete from {S}.aluno_acessos where paciente_id = {pa}",
            *[f"""insert into {S}.aluno_acessos (paciente_id, chave, nivel, alterado_por, alterado_em)
                  values ({pa}, {B.txt(y['chave'])}, {B.txt(y['nivel'])}, {B.txt(y.get('alterado_por'))}, {B.txt(y.get('alterado_em'))})"""
              for y in e.get("acessos_a") or []],
            f"delete from {S}.aluno_acessos_log where paciente_id = {pa} and em >= {ini}",
            f"""delete from {S}.avisos where destino_user_id = {B.txt(e['aluna'])} and tipo = 'geral' and criado_em >= {ini}
                 and titulo = {B.txt(TITULO_DIETA)}""",
        ]
        if e.get("master_uid") and e.get("master_papel") != "master":
            comandos.append(f"update {S}.profiles set role = {B.txt(e['master_papel'])} where id = {B.txt(e['master_uid'])} and role = 'master'")
        for c in comandos:
            B.escrever(c)
        if e.get("treino_user_id") and isinstance(e.get("series_antes"), bool):
            B.C.C2.sql_mgmt(B.TREINO_REF, f"update {S}.physiq_profiles set series_travadas = {'true' if e['series_antes'] else 'false'} "
                                          f"where id = {B.txt(e['treino_user_id'])}")
        sobras = conferir_sobras(e)
    massa = B.Massa().limpar()
    ESTADO.parent.mkdir(parents=True, exist_ok=True)
    ESTADO.write_text("{}", encoding="utf-8")
    return {**sobras, **{f"massa_{k}": int(v) for k, v in massa.items()}}


# ───────────────────────── a tela ─────────────────────────
def gravacoes_ao_abrir(t: B.Tela) -> list[str]:
    """As idas às 2 funções da aba que NÃO são leitura (a Guarda: leitura = { acao: "ler" })."""
    return [f"{p['metodo']} {p['nome']}({p['acao']})" for p in t.pedidos
            if p["tipo"] == "fn" and p["nome"] in ("acessos", "treino-acessos") and p["acao"] != "ler"]


def leituras(t: B.Tela, funcao: str) -> int:
    return sum(1 for p in t.pedidos if p["tipo"] == "fn" and p["nome"] == funcao and p["acao"] == "ler")


def nivel(t: B.Tela, chave: str) -> str:
    return (t.attr(f'[data-acessos-linha="{chave}"]', "data-acessos-nivel") or [""])[0]


def estado_series(t: B.Tela) -> str:
    return (t.attr('[data-acessos-linha="treino_series"]', "data-acessos-estado") or [""])[0]


def esperar_aba(t: B.Tela, series_pronta: bool = True, timeout: float = 60) -> bool:
    """A aba carregada (as linhas) e — quando o aluno tem Treino — a linha das séries fora do esqueleto."""
    ok = t.esperar(lambda: t.tem('[data-aba-acessos="pronto"]'), timeout)
    if ok and series_pronta and t.n('[data-acessos-linha="treino_series"]'):
        ok = t.esperar(lambda: estado_series(t) not in ("", "carregando"), 45)
    return ok


def livre(t: B.Tela, chave: str, valor: str) -> bool:
    """O rádio está ligado de novo (enquanto uma gravação corre, a lista desliga todos — decisão 2 do plano)."""
    return bool(t.pg.evaluate("(s) => { const r = document.querySelector(s); return !!r && !r.disabled; }",
                              f'[data-acessos-radio="{chave}:{valor}"]'))


def escolher(t: B.Tela, chave: str, valor: str, confirmar: bool = False) -> bool:
    """Toca no nível (o rádio) e espera a tela concordar com a gravação TERMINADA (o nível certo e os rádios ligados de novo — o otimista
    sozinho muda o nível antes do servidor; se ele recusar, o nível volta); o bloqueio do app pede a confirmação do app."""
    if nivel(t, chave) == valor:
        return True
    t.clicar(f'[data-acessos-radio="{chave}:{valor}"]')
    if confirmar and not t.caso.confirmar_no_app():
        return False
    return t.esperar(lambda: nivel(t, chave) == valor and livre(t, chave, valor), 30)


def rodar_caso(R: Rodada, fn, *args) -> None:
    try:
        fn(*args)
    except Exception as ex:  # noqa: BLE001
        R.o.ok(False, f"{fn.__name__}: {type(ex).__name__}: {str(ex)[:300]}")
        caso = B5.ESTADO.get("caso")
        if caso:
            caso.diagnostico()


def caso_build(o, nav, R: Rodada, loja: bool) -> bool:
    t = R.tela(nav, "build", False)
    try:
        t.ir("/entrar")
        ok = t.esperar(lambda: t.tem("[data-entrada-staging]"), 60)
        o.ok(ok, "A0 o build é o de staging (a faixa 'Ambiente de teste' na /entrar) — senão nada roda com conta")
        if loja:
            marca = t.pg.evaluate("() => document.querySelector('meta[name=\"physiq-distribuicao\"]')?.getAttribute('content') ?? ''")
            ok = o.ok(ok and marca == "play", f"A0 --loja: o index.html é o do build:loja (physiq-distribuicao = {marca!r})") and ok
        return ok
    finally:
        t.fim()


def caso_personal(o, nav, R: Rodada, so_ler: bool = False) -> None:
    """C1 (+ C2 e C3 no site): a aba do personal."""
    e = R.e
    t = R.tela(nav, "personal")
    try:
        t.entrar(R.L, "w5p-personal", f"/painel/alunos/{e['pac_a']}/acessos", conta_ativa=e["conta_a"])
        t.caso.fechar_avisos()
        ok = esperar_aba(t)
        abas = t.attr("[data-aba-aluno]", "data-aba-aluno")
        atual = t.attr('[data-aba-aluno][aria-current="page"]', "data-aba-aluno")
        o.ok(ok and abas[-1:] == ["acessos"] and atual == ["acessos"], f"C1 a aba Acessos é a última da barra e a atual ({abas})")
        linhas = t.attr("[data-acessos-linha]", "data-acessos-linha")
        aj = ajustes(e)
        esperado = {"acesso_app": "liberado" if aj.get("acesso_app") else "bloqueado", "diario_alimentar": "liberado" if aj.get("diario_alimentar") else "bloqueado",
                    "acesso_link": "liberado" if aj.get("acesso_link") else "bloqueado", "dieta": dieta(e), "treino_series": "ver" if e["series_antes"] else "mexer",
                    "rotinas": "sempre"}
        na_tela = {k: nivel(t, k) for k in LINHAS}
        o.ok(linhas == LINHAS and na_tela == esperado, f"C1 as 6 linhas na ordem com os níveis do banco: {na_tela}")
        o.ok(t.tem("[data-card-acesso-aluno]") and "Login do aluno" in t.texto("[data-card-acesso-aluno]"), "C1 o Login do aluno à direita (o card de antes)")
        resumo = t.texto("[data-acessos-resumo]")
        o.ok(resumo.endswith("rotinas sempre") and "séries:" in resumo and "dieta:" in resumo, f"C1 o resumo do rodapé: {resumo!r}")
        t.pg.wait_for_timeout(1500)
        o.ok(not gravacoes_ao_abrir(t) and leituras(t, "acessos") >= 1 and leituras(t, "treino-acessos") >= 1,
             f"C1 ao abrir: 0 gravação ({gravacoes_ao_abrir(t) or '—'}); `ler` na acessos {leituras(t, 'acessos')} e na treino-acessos {leituras(t, 'treino-acessos')}")
        R.print(t, f"{R.prefixo_print}a_acessos_personal")
        if so_ler:
            return
        # C2 — o envio pelo link e o diário
        ok = escolher(t, "acesso_link", "bloqueado")
        salvo = t.pg.locator("[data-sonner-toast]", has_text="Salvo").count() > 0
        ok = ok and t.esperar(lambda: ajustes(e).get("acesso_link") is False, 20, 1.5)
        mud = t.texto('[data-acessos-linha="acesso_link"] [data-acessos-mudanca]')
        lg = ultimo_log(e, "acesso_link")
        o.ok(ok and salvo and bool(MUDADO.match(mud)) and lg["para"] == "bloqueado" and lg["por"] == e["personal"],
             f"C2 o link → Bloqueado: 'Salvo' ({salvo}), no banco, o 'Mudado por' ({mud!r}) e o histórico com quem mudou ({lg['para']}, pelo personal: {lg['por'] == e['personal']})")
        ok = escolher(t, "diario_alimentar", "bloqueado") and t.esperar(lambda: ajustes(e).get("diario_alimentar") is False, 20, 1.5)
        aviso = t.texto('[data-acessos-linha="acesso_link"] [data-acessos-aviso]')
        o.ok(ok and aviso == "Vale quando o diário estiver liberado.", f"C2 o diário → Bloqueado e o aviso no link: {aviso!r}")
        ok = escolher(t, "diario_alimentar", "liberado") and escolher(t, "acesso_link", "liberado")
        ok = ok and t.esperar(lambda: ajustes(e).get("diario_alimentar") is True and ajustes(e).get("acesso_link") is True, 20, 1.5)
        o.ok(ok, "C2 os 2 de volta a Liberado (no banco)")
        # C3 — o bloqueio do app pede a confirmação do app
        if nivel(t, "acesso_app") != "liberado":
            escolher(t, "acesso_app", "liberado")
        t.clicar('[data-acessos-radio="acesso_app:bloqueado"]')
        dialogo = t.esperar(lambda: t.tem("[role=alertdialog][data-state=open]"), 10)
        texto = t.texto("[role=alertdialog]")
        o.ok(dialogo and "Bloquear o app de" in texto and "Seu acesso ao app está desligado" in texto, f"C3 'Bloqueado' pede a confirmação do app ({texto[:60]!r})")
        R.print(t, f"{R.prefixo_print}a_confirmar_bloqueio")
        t.clicar("[role=alertdialog] [data-confirmar-cancelar]")
        t.esperar(lambda: not t.tem("[role=alertdialog]"), 10)
        t.pg.wait_for_timeout(1500)
        o.ok(nivel(t, "acesso_app") == "liberado" and ajustes(e).get("acesso_app") is True, "C3 Cancelar: nada mudou (tela e banco)")
        ok = escolher(t, "acesso_app", "bloqueado", confirmar=True) and t.esperar(lambda: ajustes(e).get("acesso_app") is False, 20, 1.5)
        o.ok(ok, "C3 'Bloquear' na confirmação: o app bloqueado (no banco)")
        ok = escolher(t, "acesso_app", "liberado") and t.esperar(lambda: ajustes(e).get("acesso_app") is True, 20, 1.5)
        o.ok(ok and not t.tem("[role=alertdialog]"), "C3 Liberado de novo, sem confirmação (no banco)")
    finally:
        t.fim()


def caso_confirmar_e_cancelar(o, nav, R: Rodada) -> None:
    """--loja: o bloqueio do app pede a confirmação; Cancelar não grava (nada mais)."""
    e = R.e
    t = R.tela(nav, "confirmar")
    try:
        t.entrar(R.L, "w5p-personal", f"/painel/alunos/{e['pac_a']}/acessos", conta_ativa=e["conta_a"])
        t.caso.fechar_avisos()
        esperar_aba(t)
        if nivel(t, "acesso_app") != "liberado":
            o.ok(False, "C3 (loja) o App não está liberado na foto — não mexo")
            return
        t.clicar('[data-acessos-radio="acesso_app:bloqueado"]')
        ok = t.esperar(lambda: t.tem("[role=alertdialog][data-state=open]"), 10)
        R.print(t, f"{R.prefixo_print}a_confirmar_bloqueio")
        t.clicar("[role=alertdialog] [data-confirmar-cancelar]")
        t.esperar(lambda: not t.tem("[role=alertdialog]"), 10)
        t.pg.wait_for_timeout(1500)
        o.ok(ok and nivel(t, "acesso_app") == "liberado" and ajustes(e).get("acesso_app") is True, "C3 (loja) a confirmação abre; Cancelar não grava")
    finally:
        t.fim()


def caso_nutri(o, nav, R: Rodada, so_ler: bool = False) -> None:
    """C4: a nutri (sem sessão no Treino) — as séries pela treino-acessos e a Dieta."""
    e = R.e
    t = R.tela(nav, "nutri")
    try:
        t.entrar(R.L, "w5p-nutri", f"/painel/alunos/{e['pac_a']}/acessos", conta_ativa=e["conta_a"])
        t.caso.fechar_avisos()
        ok = esperar_aba(t)
        pode = (t.attr("[data-aba-acessos]", "data-acessos-pode-mudar") or [""])[0]
        o.ok(ok and pode == "1" and estado_series(t) == "pronto", f"C4 a nutri abre a aba (pode mudar: {pode}; as séries: {estado_series(t)})")
        if so_ler:
            R.print(t, f"{R.prefixo_print}a_acessos_nutri")
            return
        antes = "ver" if e["series_antes"] else "mexer"
        outro = "mexer" if antes == "ver" else "ver"
        ok = escolher(t, "treino_series", outro) and t.esperar(lambda: series(e) is (outro == "ver"), 30, 2)
        lg = ultimo_log(e, "treino_series")
        t.esperar(lambda: bool(MUDADO.match(t.texto('[data-acessos-linha="treino_series"] [data-acessos-mudanca]'))), 20)
        mud = t.texto('[data-acessos-linha="treino_series"] [data-acessos-mudanca]')
        o.ok(ok and lg["para"] == outro and lg["por"] == e["nutri"] and bool(MUDADO.match(mud)),
             f"C4 a nutri muda as séries → '{outro}': no Treino series_travadas = {series(e)} (o que o app lê); o histórico pela nutri; {mud!r}")
        R.print(t, f"{R.prefixo_print}a_acessos_nutri")
        ok = escolher(t, "dieta", "mexer") and t.esperar(lambda: dieta(e) == "mexer", 20, 1.5)
        o.ok(ok and avisos_dieta(e) == 1, f"C4 a Dieta → 'Pode mexer' (no banco) e 1 aviso no sino da aluna ({avisos_dieta(e)})")
        ok = escolher(t, "dieta", "ver") and t.esperar(lambda: dieta(e) == "ver", 20, 1.5)
        o.ok(ok, "C4 a Dieta de volta a 'Só ver'")
        ok = escolher(t, "treino_series", antes) and t.esperar(lambda: series(e) is e["series_antes"], 30, 2)
        o.ok(ok, f"C4 as séries de volta à foto ('{antes}')")
    finally:
        t.fim()


def caso_dono_sem_papel(o, nav, R: Rodada, so_ler: bool = False) -> None:
    """C5: o w5p-personal SÓ com o papel 'dono' (a Massa troca e devolve) muda as séries — pela admin-semana-treinos ele só lia."""
    e = R.e
    B.Massa().trocar_papeis("w5p-personal", "w5p-personal", ["dono"])
    t = R.tela(nav, "dono-sem-papel")
    try:
        t.entrar(R.L, "w5p-personal", f"/painel/alunos/{e['pac_a']}/acessos", conta_ativa=e["conta_a"])
        t.caso.fechar_avisos()
        ok = esperar_aba(t)
        pode = (t.attr("[data-aba-acessos]", "data-acessos-pode-mudar") or [""])[0]
        desligado = t.pg.evaluate("() => [...document.querySelectorAll('[data-acessos-radio^=\"treino_series:\"]')].some((r) => r.disabled)")
        o.ok(ok and pode == "1" and estado_series(t) == "pronto" and not desligado, f"C5 o dono sem papel abre a aba (pode mudar: {pode}; séries {estado_series(t)})")
        if so_ler:
            return
        antes = "ver" if e["series_antes"] else "mexer"
        outro = "mexer" if antes == "ver" else "ver"
        ok = escolher(t, "treino_series", outro) and t.esperar(lambda: series(e) is (outro == "ver"), 30, 2)
        ok2 = escolher(t, "treino_series", antes) and t.esperar(lambda: series(e) is e["series_antes"], 30, 2)
        o.ok(ok and ok2 and ultimo_log(e, "treino_series")["por"] == e["personal"], "C5 o dono sem papel muda as séries e volta (o histórico pelo dono)")
    finally:
        t.fim()
        devolver_papeis()


def caso_master(o, nav, R: Rodada) -> None:
    e = R.e
    t = R.tela(nav, "master")
    try:
        t.entrar(R.L, "w27-master", f"/painel/alunos/{e['pac_a']}/acessos")
        t.caso.fechar_avisos()
        ok = esperar_aba(t)
        pode = (t.attr("[data-aba-acessos]", "data-acessos-pode-mudar") or [""])[0]
        o.ok(ok and pode == "1" and t.attr("[data-acessos-linha]", "data-acessos-linha") == LINHAS,
             f"C6 o master abre a aba com as 6 linhas (pode mudar: {pode}) — só lê")
    finally:
        t.fim()


def caso_master_loja(o, nav, R: Rodada) -> None:
    """hml-08 (H-22): o painel master é só do site — no app (o build:loja), a conta master sai DESTE aparelho (logout LOCAL) e vê
    "Conta master: use o site"; a aba não abre. O logout do fim da rodada não tem o que fechar (a sessão já saiu: 403)."""
    e = R.e
    t = R.tela(nav, "master-loja")
    try:
        token = R.L.token("w27-master")
        t.entrar(R.L, "w27-master", f"/painel/alunos/{e['pac_a']}/acessos")
        ok = t.esperar(lambda: t.tem("[data-master-so-no-site]"), 60)
        o.ok(ok and "Conta master: use o site" in t.texto("[data-master-so-no-site]") and not t.tem("[data-aba-acessos]"),
             "C6 loja: o master não abre o painel no app — 'Conta master: use o site' (hml-08), sem a aba")
        R.print(t, f"{R.prefixo_print}a_master_use_o_site")
        st = C.sair_local(token, "principal")
        o.ok(st in (401, 403), f"C6 loja: a sessão do master já saiu deste aparelho (o app fez o logout local; de novo: {st})")
        R.L.sessoes.esquecer(token)
    finally:
        t.fim()


def caso_sem_login(o, nav, R: Rodada) -> None:
    e = R.e
    t = R.tela(nav, "sem-login")
    try:
        t.entrar(R.L, "w5p-personal", f"/painel/alunos/{e['sem_login']}/acessos", conta_ativa=e["conta_a"])
        t.caso.fechar_avisos()
        ok = esperar_aba(t)
        app_desligado = t.pg.evaluate("() => [...document.querySelectorAll('[data-acessos-radio^=\"acesso_app:\"]')].every((r) => r.disabled)")
        aviso = t.texto('[data-acessos-linha="acesso_app"] [data-acessos-aviso]')
        o.ok(ok and app_desligado and aviso == "Ele ainda não tem login: crie o acesso em Login do aluno.",
             f"C7 sem login: o App desligado com o aviso ({aviso!r})")
        o.ok(estado_series(t) == "antes_do_acesso" and "Vale depois do 1º acesso do aluno ao app." in t.texto('[data-acessos-linha="treino_series"]'),
             f"C7 as séries: 'Vale depois do 1º acesso…' ({estado_series(t)})")
        ok = t.esperar(lambda: (t.attr("[data-card-acesso-aluno]", "data-acesso-estado") or [""])[0] == "sem", 30)
        o.ok(ok and "SEM ACESSO" in t.texto("[data-card-acesso-aluno]") and t.tem("[data-acesso-criar]"), "C7 o Login do aluno: SEM ACESSO e 'Criar acesso'")
        R.print(t, f"{R.prefixo_print}a_acessos_sem_login")
    finally:
        t.fim()


def caso_outra_conta(o, nav, R: Rodada) -> None:
    e = R.e
    b = B.Massa().segunda_matricula()
    t = R.tela(nav, "outra-conta")
    try:
        t.entrar(R.L, "w13-dono", f"/painel/alunos/{b}/acessos", conta_ativa=B.Massa().conta_do_dono("w13-dono"))
        t.caso.fechar_avisos()
        ok = esperar_aba(t)
        o.ok(ok and estado_series(t) == "outra_conta" and "Treino de outro personal" in t.texto('[data-acessos-linha="treino_series"]')
             and t.n('[data-acessos-radio^="treino_series:"]') == 0,
             f"C8 a conta B (o mesmo login): a linha das séries só com o texto do Treino de outra conta ({estado_series(t)})")
        R.print(t, f"{R.prefixo_print}a_acessos_outra_conta")
    finally:
        t.fim()


JS_ABA_A_VISTA = """() => { const nav = document.querySelector('[data-abas-aluno]'); const a = nav && nav.querySelector('[data-aba-aluno="acessos"]');
  if (!nav || !a) return false; const rn = nav.getBoundingClientRect(), ra = a.getBoundingClientRect();
  return ra.left >= rn.left - 1 && ra.right <= rn.right + 1; }"""


def caso_celular(o, nav, R: Rodada) -> None:
    e = R.e
    t = R.tela(nav, "celular", desktop=False)
    try:
        t.entrar(R.L, "w5p-personal", f"/painel/alunos/{e['pac_a']}/acessos", conta_ativa=e["conta_a"])
        t.caso.fechar_avisos()
        ok = esperar_aba(t)
        a_vista = t.esperar(lambda: bool(t.pg.evaluate(JS_ABA_A_VISTA)), 10)
        largura = t.pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
        o.ok(ok and a_vista, "C9 390 px: a aba Acessos (a última) rolou para a vista na barra")
        o.ok(largura[0] <= largura[1] + 1, f"C9 nada passa da largura da tela ({largura[0]} × {largura[1]})")
        R.print(t, f"{R.prefixo_print}a_acessos_celular")
    finally:
        t.fim()


def caso_resumo_depois(o, nav, R: Rodada) -> None:
    e = R.e
    t = R.tela(nav, "resumo")
    try:
        t.entrar(R.L, "w5p-personal", f"/painel/alunos/{e['pac_a']}", conta_ativa=e["conta_a"])
        t.caso.fechar_avisos()
        ok = t.esperar(lambda: t.tem("[data-card-ajustes-aluno]") and t.tem("[data-card-dados-aluno]"), 60)
        o.ok(ok and not t.tem("[data-card-acesso-aluno]"), "C10 o Resumo sem o card de login (mora na aba Acessos)")
        card = t.texto("[data-card-ajustes-aluno]")
        o.ok("Mensagens automáticas" in card and t.n("[data-card-ajustes-aluno] [data-ajuste]") == 1
             and t.attr("[data-card-ajustes-aluno] [data-ajuste]", "data-ajuste") == ["mensagens_automaticas"],
             "C10 o card 'Mensagens automáticas' só com o WhatsApp")
        if ok:  # o card fica abaixo dos 6 de cima: o print (só a janela) rola até ele — senão mostra só o topo do Resumo
            t.pg.eval_on_selector("[data-card-ajustes-aluno]", "e => e.scrollIntoView({ block: 'center' })")
        R.print(t, f"{R.prefixo_print}a_resumo_depois")
        t.clicar("[data-menu-perfil]")
        t.esperar(lambda: t.tem('[data-acao-perfil="acesso"]'), 10)
        t.clicar('[data-acao-perfil="acesso"]')
        ok = t.esperar(lambda: t.pg.url.split("?")[0].endswith("/acessos") and t.tem('[data-aba-acessos="pronto"]'), 30)
        o.ok(ok, f"C10 ⋯ › Acesso do aluno abre a aba Acessos ({t.pg.url})")
    finally:
        t.fim()


def caso_editor(o, nav, R: Rodada) -> None:
    e = R.e
    t = R.tela(nav, "editor")
    try:
        t.entrar(R.L, "w5p-personal", f"/painel/alunos/{e['pac_a']}/treino", conta_ativa=e["conta_a"])
        t.caso.fechar_avisos()
        ok = t.esperar(lambda: t.tem("[data-editor-treino]") and (t.attr("[data-editor-treino]", "data-editor-treino") or ["carregando"])[0] != "carregando", 90)
        quais = (t.attr("[data-editor-treino]", "data-editor-treino") or ["—"])[0]
        o.ok(ok and t.n("[data-chip-cadeado]") == 0 and "AS SÉRIES" not in t.texto("[data-editor-treino]"),
             f"C11 o editor do Treino sem o cadeado das séries (o treino: {quais})")
        R.print(t, f"{R.prefixo_print}a_editor_sem_cadeado")
    finally:
        t.fim()


def caso_prod(o, nav, R: Rodada) -> None:
    """PRODUÇÃO, SÓ LEITURA: a conta de teste 'master' do Calc no aluno da conta 'Admin Teste' (o mesmo do w14/prod.py), com a Guarda."""
    aluno = B.ler("""select coalesce(p.treino_user_id, p.id)::text as rota from public.pacientes p join public.contas c on c.id = p.conta_id
                      where c.dono_id = (select id from auth.users where email = 'admin.teste.claude@physiqcalc.app')
                        and p.deleted_at is null order by p.created_at limit 1""")
    if not o.ok(bool(aluno), "P0 produção: a conta de teste tem 1 aluno para abrir"):
        return
    rota = aluno[0]["rota"]
    guarda = B.Guarda()
    t = B.Tela(nav, R.base, "p4", "prod", desktop=True, guarda=guarda)
    try:
        t.entrar(R.L, "master", f"/painel/alunos/{rota}/acessos")
        t.caso.fechar_avisos()
        ok = esperar_aba(t, timeout=90)
        t.pg.wait_for_timeout(2500)
        o.ok(ok and t.attr("[data-acessos-linha]", "data-acessos-linha")[:1] == ["acesso_app"] and t.tem("[data-card-acesso-aluno]"),
             f"P1 produção: a aba Acessos abre com as linhas e o Login do aluno ({len(t.attr('[data-acessos-linha]', 'data-acessos-linha'))} linhas)")
        o.ok(not gravacoes_ao_abrir(t) and leituras(t, "acessos") >= 1, f"P1 produção: só `ler` na acessos ({leituras(t, 'acessos')}); 0 gravação")
        R.print(t, "prod_a_acessos")
        t.ir(f"/painel/alunos/{rota}")
        ok = t.esperar(lambda: t.tem("[data-card-ajustes-aluno]"), 60)
        o.ok(ok and not t.tem("[data-card-acesso-aluno]"), "P2 produção: o Resumo sem o card de login; 'Mensagens automáticas' no lugar dos Ajustes")
        if ok:  # o print (só a janela) rola até o card novo, abaixo dos 6 de cima
            t.pg.eval_on_selector("[data-card-ajustes-aluno]", "e => e.scrollIntoView({ block: 'center' })")
        R.print(t, "prod_a_resumo")
        # o card de login lê E garante pela aluno_acesso (H-43 — a hml-21c leva ao servidor): a Guarda a barra (o molde BARRADAS_ACEITAS da
        # hml-20, e2e/hml20/dieta_tela.py) e o card mostra o erro dele; fora ela (e o garantir da nutricao), nenhuma gravação
        outras = [b for b in guarda.bloqueadas if b not in BARRADAS_ACEITAS]
        o.ok(not outras, f"P3 produção: nenhuma gravação tentada fora das conhecidas ({sorted(set(guarda.bloqueadas)) or '—'})")
    finally:
        t.fim()


def seco() -> int:
    raiz = Path(__file__).resolve().parents[2]
    falta = [f"{arq} › {x}" for arq, itens in NO_CODIGO.items() for x in itens
             if not (raiz / arq).exists() or x not in (raiz / arq).read_text(encoding="utf-8")]
    sobra = [f"{arq} › {x}" for arq, itens in FORA_DO_CODIGO.items() for x in itens
             if (raiz / arq).exists() and x in (raiz / arq).read_text(encoding="utf-8")]
    sobra += [f"{arq} (o arquivo)" for arq in ARQUIVOS_QUE_SAIRAM if (raiz / arq).exists()]
    for f in falta:
        print("❌ falta no código:", f)
    for f in sobra:
        print("❌ ainda no código (a P4 tirou):", f)
    total = sum(len(v) for v in NO_CODIGO.values()) + sum(len(v) for v in FORA_DO_CODIGO.values()) + len(ARQUIVOS_QUE_SAIRAM)
    print(f"{total - len(falta) - len(sobra)}/{total} seletores e textos do E2E no código (e o que saiu, fora)")
    return 1 if falta or sobra else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", choices=sorted(BASES))
    ap.add_argument("--loja", action="store_true")
    ap.add_argument("--canal", default="msedge")
    ap.add_argument("--limpar", action="store_true")
    ap.add_argument("--seco", action="store_true")
    a = ap.parse_args()
    if a.seco:
        return seco()
    if a.base == "prod":
        return producao(a)
    B.usar_schema(S)
    if a.limpar:
        print("sobras depois de limpar:", limpar())
        return 0
    if not a.base:
        ap.error("--base local|staging|prod (ou --limpar / --seco)")
    prefixo = f"{a.base}{'-loja' if a.loja else ''}"
    o = C.Saida(f"telas_acessos_{prefixo}")
    base = BASES[a.base]
    o.linha(f"base {base} · {'build da loja' if a.loja else 'build do site'} · canal {a.canal}")
    B.exigir_saude("as telas da aba Acessos")
    if ESTADO.exists() and json.loads(ESTADO.read_text(encoding="utf-8") or "{}"):
        raise SystemExit(f"há massa de uma rodada anterior no estado ({ESTADO}): rode --limpar antes — nada foi gravado")
    f = foto()
    mu = master_do_staging()
    R = Rodada(o, base, prefixo)
    R.prefixo_print = "loja_" if a.loja else ""
    R.e = {**{k: f[k] for k in ("pac_a", "conta_a", "config_a", "acessos_a", "aluna", "nutri", "personal", "treino_user_id", "series_antes")},
           "marca": f"{B.MARCA} P4 {time.strftime('%H%M%S')}", "inicio": dt.datetime.now(dt.timezone.utc).isoformat(),
           "master_uid": mu["uid"], "master_papel": mu["role"]}
    R.guardar()
    # o w27-master vira master SÓ durante a rodada (C6); o fim (e o --limpar) devolve o papel de antes
    B.escrever(f"update {S}.profiles set role = 'master' where id = {B.txt(mu['uid'])} and role is distinct from 'master'")
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    try:
        with sync_playwright() as pw:
            def rodar(fn, *args) -> None:
                nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
                try:
                    rodar_caso(R, fn, o, nav, R, *args)
                finally:
                    nav.close()

            ok_build = {"v": False}

            def build(o_, nav, R_) -> None:
                ok_build["v"] = caso_build(o_, nav, R_, a.loja)

            rodar(build)
            if ok_build["v"]:
                if a.loja:
                    rodar(caso_personal, True)
                    rodar(caso_nutri, True)
                    rodar(caso_dono_sem_papel, True)
                    rodar(caso_master_loja)
                    rodar(caso_celular)
                    rodar(caso_confirmar_e_cancelar)
                else:
                    R.e["sem_login"] = massa_sem_login(R)
                    R.guardar()
                    for fn in (caso_personal, caso_nutri, caso_dono_sem_papel, caso_master, caso_sem_login, caso_outra_conta, caso_celular,
                               caso_resumo_depois, caso_editor):
                        B.exigir_saude(fn.__name__)
                        rodar(fn)
    finally:
        R.L.fechar(o)
        sobras = limpar(R.e)
        o.ok(all(v == 0 for v in sobras.values()), f"limpeza: as sobras da rodada {sobras}")
    o.linha(f"\nprints ({len(R.provas)}): {R.provas}")
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)  # H-50: a rodada no e2e-rodadas.tsv (nunca derruba o teste)
    return o.fim()


def producao(a) -> int:
    B.usar_schema("public")
    o = C.Saida("telas_acessos_prod")
    R = Rodada(o, BASES["prod"], "prod")
    R.prefixo_print = "prod_"
    o.linha(f"base {R.base} · PRODUÇÃO, SÓ LEITURA (a Guarda no navegador) · canal {a.canal}")
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    try:
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
            try:
                caso_prod(o, nav, R)
            except Exception as ex:  # noqa: BLE001
                o.ok(False, f"caso_prod: {type(ex).__name__}: {str(ex)[:300]}")
            finally:
                nav.close()
    finally:
        R.L.fechar(o)
    o.linha(f"\nprints ({len(R.provas)}): {R.provas}")
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
