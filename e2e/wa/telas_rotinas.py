#!/usr/bin/env python3
"""Physiq W-A P3 — E2E de TELA das rotinas (Edge; celular 390 × 844 e computador 1280 × 883). Spec W-A §4.3, §4.6, §6 "P3", §7.
Contas de TESTE (hml-17): w5p-aluna (a aluna dos 2 profissionais — as rotinas são dela) e w5p-personal (o profissional que SEMEIA a rotina com
selo pela função aluno-dia, prof_rotina_salvar — o "semeada pelo api.py" da spec). Casos (na ordem; cada um depende do anterior):
  R0  o build é o de STAGING (a faixa "Ambiente de teste" na /entrar; --loja: a marca da loja no index.html) — senão nada roda com conta
  R1  r_inicio_vazio   o Início sem nenhuma rotina: "Crie a sua 1ª rotina…" + "Criar rotina"; ao abrir, 0 gravação e ≥ 1 `ler` q=rotinas
  R2  r_nova           "Criar rotina" → /perfil/rotinas com a folha aberta; salvar sem nome = o erro e 0 POST; a Creatina (detalhe 5 g,
                       suplemento, +30 min, todos os dias, lembrete) → 1 rotina_salvar; no banco: dela, origem aluno, lembrete
  R3  a 2ª rotina pela folha: o Remédio (remédio, 21:00, Seg a Sex, lembrete)
  R4  a do profissional pela função (w5p-personal, a matrícula A): "Água 2 L", hábito, 10:00, todos os dias, sem lembrete → 200 ok
  R5  r_pagina         /perfil/rotinas: as 3 pela hora, o selo "do seu profissional" na Água, a linha "Seus profissionais veem…" (Q4)
                       e a do site ("o lembrete aparece quando o Physiq está aberto")
  R6  mudar: a Creatina 5 g → 3 g pela folha; no banco: o detalhe e o histórico "mudou" (quem: aluno)
  R7  r_inicio         o card "Rotinas de hoje" com as de hoje e o selo; ✓ na Creatina → no banco a feita de hoje; desmarcar → sai;
                       marcar de novo (fica feita)
  R8  r_site_aviso     o aviso do SITE com o relógio da página adiantado (Playwright clock): a rotina "Aviso" (+2 min, lembrete) criada pela
                       função como a aluna; a página aberta; o relógio +3 min → o toast "Hora da rotina" com "Marcar como feita" → no banco,
                       feita hoje. (Perto da meia-noite de SP — 23:45+ — não roda: o dia viraria só na página.)
  R9  apagar a do PROFISSIONAL pelo app (P8b): a folha → "Apagar rotina" → a confirmação do app → some da página; no banco: arquivada, por
      ela, histórico "arquivou" (quem: aluno)
  R10 apagar o Remédio (o dela)
  --loja: R0 (a marca da loja) + R1 + a Creatina pela função + R7 (o card e o ✓) + R5 (a página) — o print com o prefixo loja_.
A massa ("WA E2E P3 <hhmmss>") vai para o estado (~/projetos/physiqcalc-scratch/w-a/p3-estado.json) ANTES de nascer e sai no fim (e no
--limpar): as rotinas da aluna com a marca e os avisos "Seu profissional criou uma rotina para você" da rodada. No fim, as sobras da W-A = 0.
Bases: --base local (o vite preview do dist/ de STAGING em http://localhost:5173 — a 8080 é da LINUX 1) · staging
(https://physiqcalc-staging.vercel.app) · prod (https://physiqcalc.com.br, SÓ LEITURA: a Guarda da hml-17 no navegador — nenhuma gravação sai —,
a conta de teste da produção aluno-calc; P1 o card do Início abre sem gravar e com o `ler` q=rotinas, P2 a página abre; prints prod_r_inicio,
prod_r_pagina; sem massa). Prints: ~/projetos/physiqcalc-scratch/prints/w-a/p3/<base>[-loja]/<caso>_<largura>.png.
Saída: ~/projetos/physiqcalc-scratch/w-a/p3/telas_rotinas_<base>.txt (só contagens, status e códigos). Logout local das sessões do teste.
--seco: sem rede e sem navegador — cada seletor e texto que o E2E usa existe no código (a tela não mudou por baixo dele).
Uso: python3 e2e/wa/telas_rotinas.py --base local|staging|prod [--loja] [--canal msedge] | --limpar | --seco
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
from pathlib import Path
from zoneinfo import ZoneInfo

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

C, B5 = B.C, B.B5
S = "staging"
SP = ZoneInfo("America/Sao_Paulo")
BASES = {"local": "http://localhost:5173", "staging": "https://physiqcalc-staging.vercel.app", "prod": "https://physiqcalc.com.br"}
ORIGEM = "https://physiqcalc-staging.vercel.app"
ESTADO = B.SCRATCH / "w-a" / "p3-estado.json"
C.SAIDA = B.SCRATCH / "w-a" / "p3"
TITULO_AVISO_PROF = "Seu profissional criou uma rotina para você"
URL_ALUNO_DIA = f"{B.H.API_P}/functions/v1/aluno-dia"

# --seco: o arquivo → o que tem de estar nele (seletores e textos que o E2E usa)
NO_CODIGO = {
    "src/rotinas/ui/RotinasDeHoje.tsx": ["data-card-rotinas-hoje", "data-rotinas-criar", "data-rotina-hoje={r.id}", "data-rotina-marcar={r.id}",
                                         "data-rotina-feita={r.feita ? \"1\" : \"0\"}", "data-rotina-selo", "data-rotinas-hoje={doDia.length}"],
    "src/app-aluno/perfil/Rotinas.tsx": ["data-pagina-rotinas", "data-rotina-linha={r.id}", "data-rotina-abrir={r.id}", "data-rotina-marcar={r.id}",
                                         "data-rotinas-profissionais-veem", "data-rotinas-site", "data-rotina-nome-linha", "data-rotinas-nova"],
    "src/rotinas/ui/FolhaRotina.tsx": ["data-folha-rotina", "data-rotina-nome", "data-rotina-detalhe", "data-rotina-horario", "data-rotina-salvar",
                                       "data-rotina-apagar", "data-rotina-lembrete"],
    "src/rotinas/ui/DiasDaSemana.tsx": ["data-rotina-atalho={a.atalho}"],
    "src/rotinas/regras.ts": ['"Dê um nome à rotina."', 'ROTA_ROTINAS = "/perfil/rotinas"'],
    "src/rotinas/textos.ts": ['"Hora da rotina"', '"Marcar como feita"', '"do seu profissional"', '"Seus profissionais veem as suas rotinas."',
                              '"Crie a sua 1ª rotina (creatina, remédio, água…)"', '"Remédio"'],
    "src/ui/avisos/LembreteDasRotinas.tsx": ["CONFERIR_NO_SITE_MS = 30_000", "TEXTOS.marcarComoFeita"],
    "src/app-aluno/abas/Inicio.tsx": ['["CardRotinasHoje"]'],
    "src/app-aluno/abas/Perfil.tsx": ['rotulo="Rotinas e lembretes" para="/perfil/rotinas"'],
}


class Rodada:
    def __init__(self, o, base: str, prefixo: str) -> None:
        self.o, self.base, self.prefixo = o, base, prefixo
        self.L = B.Logins()
        self.pasta = B.pasta_prints("p3") / prefixo
        self.provas: list[str] = []
        self.e: dict = {}
        self.ids: dict[str, str] = {}

    def tela(self, nav, nome: str, desktop: bool = False) -> B.Tela:
        return B.Tela(nav, self.base, "p3", nome, desktop=desktop)

    def print(self, t: B.Tela, caso: str) -> None:
        caminho = t.print(self.pasta, caso)
        self.provas.append(caminho)
        self.o.linha(f"   print: {caminho}")

    def guardar(self) -> None:
        ESTADO.parent.mkdir(parents=True, exist_ok=True)
        ESTADO.write_text(json.dumps(self.e, ensure_ascii=False, indent=1), encoding="utf-8")


# ───────────────────────── o banco (SÓ LEITURA, menos a limpeza) e a função ─────────────────────────
def uid(conta: str) -> str:
    return B.ler(f"select id::text as id from auth.users where lower(email) = {B.txt(B.CONTAS[conta])}")[0]["id"]


def matricula_a(aluna: str, personal: str) -> str:
    r = B.ler(f"""select p.id::text as id from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
                  where p.user_id = {B.txt(aluna)} and p.deleted_at is null and c.origem <> 'app' and p.personal_id = {B.txt(personal)}
                  order by p.created_at limit 1""")
    if not r:
        raise SystemExit("a matrícula A da w5p-aluna (com o w5p-personal) não existe no staging — nada foi gravado")
    return r[0]["id"]


def rotinas(e: dict) -> list[dict]:
    return B.ler(f"""select r.id::text as id, r.nome, r.detalhe, r.origem, r.lembrete, to_char(r.horario, 'HH24:MI') as horario,
                            r.arquivada_em is not null as arquivada, r.arquivada_por::text as arquivada_por,
                            (select count(*) from {S}.rotinas_feitas f where f.rotina_id = r.id
                               and f.dia = (now() at time zone 'America/Sao_Paulo')::date) as feita_hoje,
                            (select coalesce(json_agg(json_build_object('o_que', h.o_que, 'quem', h.quem) order by h.em), '[]'::json)
                               from {S}.rotinas_historico h where h.rotina_id = r.id) as historico
                       from {S}.rotinas r where r.dono_user_id = {B.txt(e['aluna'])} and r.nome like {B.txt(e['marca'] + '%')}
                      order by r.criada_em""")


def rotina(e: dict, sufixo: str) -> dict | None:
    return next((r for r in rotinas(e) if r["nome"] == f"{e['marca']} {sufixo}"), None)


def vivas_da_aluna(aluna: str) -> int:
    return B.ler(f"select count(*) as n from {S}.rotinas where dono_user_id = {B.txt(aluna)} and arquivada_em is null")[0]["n"]


def funcao(token: str, corpo: dict) -> tuple[int, dict]:
    cab = {"apikey": B5.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {token}", "x-schema": S, "Origin": ORIGEM}
    st, r, _h = B5.http("POST", URL_ALUNO_DIA, corpo, cab, timeout=60)
    return st, (r if isinstance(r, dict) else {})


def agora_sp() -> dt.datetime:
    return dt.datetime.now(SP)


def hora_sp(minutos: int) -> str:
    return (agora_sp() + dt.timedelta(minutes=minutos)).strftime("%H:%M")


def limpar(e: dict | None = None) -> dict:
    """Desfaz a massa do estado (as rotinas da aluna com a marca e os avisos da rodada) e devolve as sobras da W-A (tudo 0 = limpo)."""
    e = e if e is not None else (json.loads(ESTADO.read_text(encoding="utf-8")) if ESTADO.exists() else {})
    if e.get("aluna") and e.get("marca"):
        B.escrever(f"delete from {S}.rotinas where dono_user_id = {B.txt(e['aluna'])} and nome like {B.txt(e['marca'] + '%')}")
        B.escrever(f"""delete from {S}.avisos where destino_user_id = {B.txt(e['aluna'])} and tipo = 'geral' and titulo = {B.txt(TITULO_AVISO_PROF)}
                        and criado_em >= {B.txt(e['inicio'])}""")
    ESTADO.write_text("{}", encoding="utf-8")
    sobras = {k: int(v) for k, v in B.Massa().sobras().items()}
    if e.get("aluna") and e.get("marca"):
        sobras["avisos_da_rodada"] = int(B.ler(f"""select count(*) as n from {S}.avisos where destino_user_id = {B.txt(e['aluna'])} and tipo = 'geral'
                                                   and titulo = {B.txt(TITULO_AVISO_PROF)} and criado_em >= {B.txt(e['inicio'])}""")[0]["n"])
    return sobras


# ───────────────────────── a tela ─────────────────────────
def gravacoes_ao_abrir(t: B.Tela) -> list[str]:
    """As idas à aluno-dia que NÃO são leitura (a Guarda: leitura = { acao: "ler" })."""
    return [f"{p['metodo']} {p['nome']}({p['acao']})" for p in t.pedidos if p["tipo"] == "fn" and p["nome"] == "aluno-dia" and p["acao"] != "ler"]


def leituras_de_rotinas(t: B.Tela) -> int:
    return sum(1 for p in t.pedidos if p["tipo"] == "fn" and p["nome"] == "aluno-dia" and p["acao"] == "ler" and '"q":"rotinas"' in (p["corpo"] or "").replace(" ", ""))


def salvar_rotina_pela_folha(t: B.Tela, nome: str, detalhe: str, tipo: str | None, horario: str, atalho: str, lembrete: bool) -> None:
    t.pg.locator("[data-rotina-nome]").fill(nome)
    t.pg.locator("[data-rotina-detalhe]").fill(detalhe)
    if tipo:
        t.pg.get_by_role("radio", name=tipo).click()
    t.pg.locator("[data-rotina-horario]").fill(horario)
    t.clicar(f'[data-rotina-atalho="{atalho}"]')
    ligado = (t.attr("[data-rotina-lembrete]", "data-rotina-lembrete") or ["0"])[0] == "1"
    if ligado != lembrete:
        t.clicar("[data-rotina-lembrete]")


def esperar_linha(t: B.Tela, nome: str, timeout: float = 30) -> bool:
    return t.esperar(lambda: nome in [x.strip() for x in t.pg.locator("[data-rotina-nome-linha]").all_inner_texts()], timeout)


def caso_build(o, nav, R: Rodada, loja: bool) -> bool:
    t = R.tela(nav, "build", False)
    try:
        t.ir("/entrar")
        ok = t.esperar(lambda: t.tem("[data-entrada-staging]"), 60)
        o.ok(ok, "R0 o build é o de staging (a faixa 'Ambiente de teste' na /entrar) — senão nada roda com conta")
        if loja:
            marca = t.pg.evaluate("() => document.querySelector('meta[name=\"physiq-distribuicao\"]')?.getAttribute('content') ?? ''")
            ok = o.ok(ok and marca == "play", f"R0 --loja: o index.html é o do build:loja (physiq-distribuicao = {marca!r})") and ok
        return ok
    finally:
        t.fim()


def caso_vazio_e_nova(o, nav, R: Rodada) -> None:
    e = R.e
    t = R.tela(nav, "inicio-vazio")
    try:
        t.entrar(R.L, "w5p-aluna", "/")
        t.caso.fechar_avisos()
        ok = t.esperar(lambda: t.attr("[data-card-rotinas-hoje]", "data-card-rotinas-hoje") == ["vazio"], 45)
        o.ok(ok and "Crie a sua 1ª rotina" in t.texto("[data-card-rotinas-hoje]"), "R1 o Início sem rotina: 'Crie a sua 1ª rotina…' + 'Criar rotina'")
        t.pg.wait_for_timeout(2500)
        o.ok(not gravacoes_ao_abrir(t) and leituras_de_rotinas(t) >= 1,
             f"R1 ao abrir: 0 gravação na aluno-dia ({gravacoes_ao_abrir(t) or '—'}) e {leituras_de_rotinas(t)} `ler` q=rotinas")
        R.print(t, "r_inicio_vazio")
        t.clicar("[data-rotinas-criar]")
        ok = t.esperar(lambda: t.tem('[data-folha-rotina="nova"]'), 20)
        o.ok(ok and t.pg.url.split("?")[0].endswith("/perfil/rotinas"), f"R2 'Criar rotina' → /perfil/rotinas com a folha nova aberta ({t.pg.url})")
        t.zerar_pedidos()
        t.clicar("[data-rotina-salvar]")
        ok = t.esperar(lambda: "Dê um nome à rotina." in t.texto("[data-folha-rotina]"), 10)
        o.ok(ok and t.contar("fn", "aluno-dia") == 0, "R2 salvar sem nome: o erro no campo e NENHUMA ida à função")
        creatina = f"{e['marca']} Creatina"
        salvar_rotina_pela_folha(t, creatina, "5 g", None, hora_sp(30), "todos", True)
        R.print(t, "r_nova")
        t.zerar_pedidos()
        t.clicar("[data-rotina-salvar]")
        ok = esperar_linha(t, creatina)
        n = t.contar("fn", "aluno-dia", lambda p: p["acao"] == "rotina_salvar")
        r = rotina(e, "Creatina")
        o.ok(ok and n == 1 and r and r["origem"] == "aluno" and r["lembrete"] and r["detalhe"] == "5 g",
             f"R2 a Creatina pela folha: 1 rotina_salvar ({n}); no banco: {({k: r[k] for k in ('origem', 'lembrete', 'detalhe', 'horario')} if r else None)}")
        if r:
            R.ids["creatina"] = r["id"]
        remedio = f"{e['marca']} Remédio"
        t.clicar("[data-rotinas-nova]")
        t.esperar(lambda: t.tem('[data-folha-rotina="nova"]'), 15)
        salvar_rotina_pela_folha(t, remedio, "1 comprimido", "Remédio", "21:00", "semana", True)
        t.clicar("[data-rotina-salvar]")
        ok = esperar_linha(t, remedio)
        r = rotina(e, "Remédio")
        o.ok(ok and r and r["horario"] == "21:00" and r["lembrete"], f"R3 o Remédio pela folha (Seg a Sex, 21:00, lembrete): {bool(r)}")
        if r:
            R.ids["remedio"] = r["id"]
    finally:
        t.fim()


def caso_semear_profissional(o, R: Rodada) -> None:
    e = R.e
    st, r = funcao(R.L.token("w5p-personal"), {"acao": "prof_rotina_salvar", "aluno": e["pac_a"],
                                                 "dados": {"nome": f"{e['marca']} Água 2 L", "tipo": "habito", "horario": "10:00",
                                                           "dias_semana": [1, 2, 3, 4, 5, 6, 7], "lembrete": False}})
    rot = r.get("rotina") or {}
    o.ok(st == 200 and r.get("ok") is True and rot.get("origem") == "profissional",
         f"R4 a rotina do profissional pela função (w5p-personal, a matrícula A): {st} {json.dumps({'ok': r.get('ok'), 'erro': r.get('erro')})}")
    if rot.get("id"):
        R.ids["agua"] = rot["id"]


def caso_pagina(o, nav, R: Rodada, prefixo: str = "") -> None:
    e = R.e
    t = R.tela(nav, "pagina")
    try:
        t.entrar(R.L, "w5p-aluna", "/perfil/rotinas")
        t.caso.fechar_avisos()
        ok = t.esperar(lambda: t.attr("[data-pagina-rotinas]", "data-pagina-rotinas") == ["lista"], 45)
        nomes = [x.strip() for x in t.pg.locator("[data-rotina-nome-linha]").all_inner_texts()]
        da_rodada = [x for x in nomes if x.startswith(e["marca"])]
        agua = R.ids.get("agua")
        selo = bool(agua) and t.n(f'[data-rotina-linha="{agua}"] [data-rotina-selo]') == 1
        o.ok(ok and len(da_rodada) == (3 if not prefixo else 1) and (selo or prefixo != ""),
             f"R5 a página: {len(da_rodada)} da rodada pela hora ({[x.replace(e['marca'] + ' ', '') for x in da_rodada]}); o selo na do profissional: {selo}")
        o.ok(t.tem("[data-rotinas-profissionais-veem]") and t.tem("[data-rotinas-site]"),
             "R5 a linha 'Seus profissionais veem as suas rotinas' (Q4) e a do site (o lembrete com a página aberta)")
        R.print(t, f"{prefixo}r_pagina")
        if prefixo:
            return
        cre = R.ids.get("creatina")
        if cre:
            t.clicar(f'[data-rotina-abrir="{cre}"]')
            t.esperar(lambda: t.tem('[data-folha-rotina="mudar"]'), 15)
            t.pg.locator("[data-rotina-detalhe]").fill("3 g")
            t.clicar("[data-rotina-salvar]")
            t.esperar(lambda: not t.tem('[data-folha-rotina="mudar"]'), 20)
            t.pg.wait_for_timeout(1500)
            r = rotina(e, "Creatina")
            hist = [h["o_que"] + ":" + h["quem"] for h in (r or {}).get("historico") or []]
            o.ok(r and r["detalhe"] == "3 g" and hist == ["criou:aluno", "mudou:aluno"], f"R6 mudar 5 g → 3 g: detalhe {r and r['detalhe']!r}; histórico {hist}")
    finally:
        t.fim()


def caso_inicio(o, nav, R: Rodada, prefixo: str = "") -> None:
    e = R.e
    cre = R.ids.get("creatina")
    t = R.tela(nav, "inicio")
    try:
        t.entrar(R.L, "w5p-aluna", "/")
        t.caso.fechar_avisos()
        ok = t.esperar(lambda: t.attr("[data-card-rotinas-hoje]", "data-card-rotinas-hoje") == ["lista"], 45)
        texto = t.texto("[data-card-rotinas-hoje]")
        o.ok(ok and "Creatina" in texto and (prefixo or "do seu profissional" in texto),
             "R7 o card 'Rotinas de hoje' com as de hoje (a Creatina; o selo na Água do profissional)")
        if not cre:
            return
        alvo = f'[data-card-rotinas-hoje] [data-rotina-marcar="{cre}"]'
        estado = lambda: (t.attr(f'[data-card-rotinas-hoje] [data-rotina-hoje="{cre}"]', "data-rotina-feita") or [""])[0]  # noqa: E731
        t.clicar(alvo)
        ok = t.esperar(lambda: estado() == "1", 10) and t.esperar(lambda: (rotina(e, "Creatina") or {}).get("feita_hoje") == 1, 20, 2)
        o.ok(ok, "R7 ✓ na Creatina: marcada na hora (otimista) e no banco a feita de hoje")
        R.print(t, f"{prefixo}r_inicio")
        if prefixo:
            return
        t.clicar(alvo)
        ok = t.esperar(lambda: estado() == "0", 10) and t.esperar(lambda: (rotina(e, "Creatina") or {}).get("feita_hoje") == 0, 20, 2)
        o.ok(ok, "R7 desmarcar: sai do banco")
        t.clicar(alvo)
        ok = t.esperar(lambda: (rotina(e, "Creatina") or {}).get("feita_hoje") == 1, 20, 2)
        o.ok(ok, "R7 marcar de novo: fica feita")
    finally:
        t.fim()


def caso_aviso_do_site(o, nav, R: Rodada) -> None:
    e = R.e
    agora = agora_sp()
    if agora.hour == 23 and agora.minute >= 45:
        o.linha("   R8 não rodou: perto da meia-noite de SP (o dia viraria só na página) — rode depois das 00:05")
        return
    hora = hora_sp(2)
    st, r = funcao(R.L.token("w5p-aluna"), {"acao": "rotina_salvar", "dados": {"nome": f"{e['marca']} Aviso", "tipo": "habito", "horario": hora,
                                                                             "dias_semana": [1, 2, 3, 4, 5, 6, 7], "lembrete": True}})
    if not o.ok(st == 200 and r.get("ok") is True, f"R8 a rotina 'Aviso' ({hora}, lembrete) pela função, como a aluna: {st}"):
        return
    t = R.tela(nav, "aviso-site", desktop=True)
    try:
        t.ctx.clock.install(time=dt.datetime.now())
        t.entrar(R.L, "w5p-aluna", "/perfil/rotinas")
        t.caso.fechar_avisos()
        t.esperar(lambda: t.attr("[data-pagina-rotinas]", "data-pagina-rotinas") == ["lista"], 45)
        t.pg.clock.fast_forward("03:00")
        toast = t.pg.locator("[data-sonner-toast]", has_text=f"{e['marca']} Aviso")  # a desta rodada (a das 21:00, se for a hora, é outra)
        if not t.esperar(lambda: toast.count() > 0, 8):
            t.pg.clock.run_for("00:35")
        ok = t.esperar(lambda: toast.count() > 0, 20)
        texto = toast.first.inner_text() if ok else ""
        o.ok(ok and "Hora da rotina" in texto and "Marcar como feita" in texto, "R8 o relógio da página +3 min → o toast 'Hora da rotina' com o nome e 'Marcar como feita'")
        R.print(t, "r_site_aviso")
        if ok:
            toast.first.get_by_role("button", name="Marcar como feita").click()
            ok = t.esperar(lambda: (rotina(e, "Aviso") or {}).get("feita_hoje") == 1, 20, 2)
            o.ok(ok, "R8 'Marcar como feita' no toast → no banco, feita hoje")
    finally:
        t.fim()


def caso_apagar(o, nav, R: Rodada) -> None:
    e = R.e
    t = R.tela(nav, "apagar")
    try:
        t.entrar(R.L, "w5p-aluna", "/perfil/rotinas")
        t.caso.fechar_avisos()
        t.esperar(lambda: t.attr("[data-pagina-rotinas]", "data-pagina-rotinas") == ["lista"], 45)
        for chave, rotulo, quem in (("agua", "R9 a do PROFISSIONAL (P8b)", "Água 2 L"), ("remedio", "R10 o Remédio (dela)", "Remédio")):
            rid = R.ids.get(chave)
            if not rid:
                o.ok(False, f"{rotulo}: sem o id (um caso anterior falhou)")
                continue
            t.clicar(f'[data-rotina-abrir="{rid}"]')
            t.esperar(lambda: t.tem('[data-folha-rotina="mudar"]'), 15)
            t.clicar("[data-rotina-apagar]")
            confirmou = t.caso.confirmar_no_app()
            sumiu = t.esperar(lambda: t.n(f'[data-rotina-linha="{rid}"]') == 0, 20)
            r = rotina(e, quem)
            hist = [h["o_que"] + ":" + h["quem"] for h in (r or {}).get("historico") or []]
            o.ok(confirmou and sumiu and r and r["arquivada"] and r["arquivada_por"] == e["aluna"] and hist[-1:] == ["arquivou:aluno"],
                 f"{rotulo}: a confirmação do app ({confirmou}), sumiu da página ({sumiu}); no banco arquivada por ela, histórico {hist}")
    finally:
        t.fim()


def caso_prod(o, nav, R: Rodada) -> None:
    """PRODUÇÃO, SÓ LEITURA: o Início e a página da conta de teste aluno-calc com a Guarda (nenhuma gravação sai do navegador)."""
    guarda = B.Guarda()
    t = B.Tela(nav, R.base, "p3", "prod", desktop=False, guarda=guarda)
    try:
        t.entrar(R.L, "aluno-calc", "/")
        t.caso.fechar_avisos()
        ok = t.esperar(lambda: (t.attr("[data-card-rotinas-hoje]", "data-card-rotinas-hoje") or [""])[0] in ("vazio", "lista", "nenhuma-hoje"), 60)
        t.pg.wait_for_timeout(2500)
        o.ok(ok, f"P1 produção: o card 'Rotinas de hoje' no Início ({(t.attr('[data-card-rotinas-hoje]', 'data-card-rotinas-hoje') or ['—'])[0]})")
        o.ok(not gravacoes_ao_abrir(t) and leituras_de_rotinas(t) >= 1,
             f"P1 produção: 0 gravação na aluno-dia ao abrir ({gravacoes_ao_abrir(t) or '—'}) e {leituras_de_rotinas(t)} `ler` q=rotinas")
        R.print(t, "prod_r_inicio")
        t.ir("/perfil/rotinas")
        ok = t.esperar(lambda: (t.attr("[data-pagina-rotinas]", "data-pagina-rotinas") or [""])[0] in ("vazia", "lista"), 45)
        o.ok(ok, "P2 produção: a página Rotinas e lembretes abre")
        R.print(t, "prod_r_pagina")
        o.ok(not guarda.bloqueadas, f"P3 produção: nenhuma gravação tentada (a Guarda bloqueou: {guarda.bloqueadas or '—'})")
    finally:
        t.fim()


def seco() -> int:
    raiz = Path(__file__).resolve().parents[2]
    falta = [f"{arq} › {x}" for arq, itens in NO_CODIGO.items() for x in itens
             if not (raiz / arq).exists() or x not in (raiz / arq).read_text(encoding="utf-8")]
    for f in falta:
        print("❌ falta no código:", f)
    total = sum(len(v) for v in NO_CODIGO.values())
    print(f"{total - len(falta)}/{total} seletores e textos do E2E no código")
    return 1 if falta else 0


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
    o = C.Saida(f"telas_rotinas_{prefixo}")
    base = BASES[a.base]
    o.linha(f"base {base} · {'build da loja' if a.loja else 'build do site'} · canal {a.canal}")
    B.exigir_saude("as telas das rotinas")
    if ESTADO.exists() and json.loads(ESTADO.read_text(encoding="utf-8") or "{}"):
        raise SystemExit(f"há massa de uma rodada anterior no estado ({ESTADO}): rode --limpar antes — nada foi gravado")
    sobra = B.Massa().sobras()
    if any(int(v) for v in sobra.values()):
        raise SystemExit(f"há massa da W-A no staging ({sobra}): rode o --limpar da parte que deixou — nada foi gravado")
    R = Rodada(o, base, prefixo)
    aluna = uid("w5p-aluna")
    if vivas_da_aluna(aluna):
        raise SystemExit("a w5p-aluna tem rotina viva no staging (o R1 precisa dela sem nenhuma): conferir quem criou — nada foi gravado")
    R.e = {"marca": f"WA E2E P3 {time.strftime('%H%M%S')}", "inicio": dt.datetime.now(dt.timezone.utc).isoformat(), "aluna": aluna,
           "pac_a": matricula_a(aluna, uid("w5p-personal"))}
    R.guardar()
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    try:
        with sync_playwright() as pw:
            def rodar(fn, *args) -> None:
                nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
                try:
                    fn(o, nav, R, *args)
                except Exception as ex:  # noqa: BLE001
                    o.ok(False, f"{fn.__name__}: {type(ex).__name__}: {str(ex)[:300]}")
                    caso = B5.ESTADO.get("caso")
                    if caso:
                        caso.diagnostico()
                finally:
                    nav.close()

            ok_build = {"v": False}

            def build(o_, nav, R_) -> None:
                ok_build["v"] = caso_build(o_, nav, R_, a.loja)

            rodar(build)
            if ok_build["v"]:
                if a.loja:
                    rodar(caso_vazio_so_print)
                    st, r = funcao(R.L.token("w5p-aluna"), {"acao": "rotina_salvar", "dados": {"nome": f"{R.e['marca']} Creatina", "detalhe": "5 g",
                                                        "tipo": "suplemento", "horario": hora_sp(30), "dias_semana": [1, 2, 3, 4, 5, 6, 7], "lembrete": True}})
                    o.ok(st == 200 and r.get("ok") is True, f"loja: a Creatina pela função ({st})")
                    R.ids["creatina"] = (r.get("rotina") or {}).get("id", "")
                    rodar(caso_inicio, "loja_")
                    rodar(caso_pagina, "loja_")
                else:
                    rodar(caso_vazio_e_nova)
                    caso_semear_profissional(o, R)
                    rodar(caso_pagina)
                    rodar(caso_inicio)
                    rodar(caso_aviso_do_site)
                    rodar(caso_apagar)
    finally:
        R.L.fechar(o)
        sobras = limpar(R.e)
        o.ok(all(v == 0 for v in sobras.values()), f"limpeza: as sobras da W-A {sobras}")
    o.linha(f"\nprints ({len(R.provas)}): {R.provas}")
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)  # H-50: a rodada no e2e-rodadas.tsv (nunca derruba o teste)
    return o.fim()


def producao(a) -> int:
    B.usar_schema("public")
    o = C.Saida("telas_rotinas_prod")
    R = Rodada(o, BASES["prod"], "prod")
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


def caso_vazio_so_print(o, nav, R: Rodada) -> None:
    """--loja: o Início sem rotina (o print loja_r_inicio_vazio)."""
    t = R.tela(nav, "inicio-vazio")
    try:
        t.entrar(R.L, "w5p-aluna", "/")
        t.caso.fechar_avisos()
        ok = t.esperar(lambda: t.attr("[data-card-rotinas-hoje]", "data-card-rotinas-hoje") == ["vazio"], 45)
        o.ok(ok, "R1 (loja) o Início sem rotina: 'Crie a sua 1ª rotina…'")
        R.print(t, "loja_r_inicio_vazio")
    finally:
        t.fim()


if __name__ == "__main__":
    raise SystemExit(main())
