#!/usr/bin/env python3
"""Physiq hml-18a (H-40, B — 10/10/2026) — E2E dos DIÁLOGOS: 8 dos 24 que eram window.confirm agora são a confirmação do app
(src/ui/premium/Confirmar.tsx). Em cada um, com o Edge em modo celular (390 × 844): toca na ação, confere o [role=alertdialog] do
app (o título e o verbo da ação no botão), o foco no Cancelar, e CANCELA — nada grava (nenhum POST/PATCH/PUT/DELETE na API do
toque até depois de sair) e a janela sai animada (fica com data-state=closed por ≥ 150 ms antes de sumir). Qualquer diálogo nativo
(page.on("dialog")) FALHA o teste. Os outros 16: Vitest (src/ui/premium/semDialogoNativo.test.ts e os testes de cada tela).

  personal  1 Meus treinos › excluir o treino (o de teste) · 2 Quem recebe › tirar a aluna (do treino de teste) · 3 Biblioteca ›
            excluir o exercício próprio de teste · 4 editor do aluno › tirar um exercício · 5 Avaliação › Fotos › excluir a foto de
            teste · 6 Configurações › Recebimento › excluir a chave Pix de teste · 9 editor do aluno › tirar o treino do aluno ·
            10 Biblioteca › Grupos musculares › excluir o grupo próprio de teste
  aluno     7 Treino › opções › tirar o treino do dia · 8 Treino › opções › trocar › apagar um treino próprio — com o aluno de teste
            do Calc (teste@teste.com): no local e no staging o PowerSync do app LÊ o public (a nota P20 da W8, e2e/w08/_base.py) e a
            w5p-aluna não tem semana lá; ele tem (domingo) e 2 treinos próprios. Só abre e cancela: nada grava (nem no staging).
            DESDE A H-14 (07/10, src/lib/powersync/instancia.ts) o build de staging NÃO tem PowerSync: o treino do aluno não abre no
            local nem no staging ("Baixando o seu treino…" para sempre) → o 7 e o 8 rodam só com --base prod (só leitura); no local e
            no staging o lugar deles fica com o 9 e o 10 (8 casos de verdade). O 7 tem Vitest (app-aluno/abas/Treino.test.tsx) e o 8
            também (treino/ui/SheetAlterarTreino.test.tsx).

Massa (staging/local; só contas de TESTE; marca "HML18 teste"): o que falta é criado no começo e apagado no fim (também com --limpar):
  Treino (schema staging): 1 treino do personal ("HML18 teste · excluir") recebido pela aluna, 1 exercício próprio do personal,
  1 grupo muscular próprio do personal e 1 foto mensal da aluna (a linha; o arquivo não existe — o toque cancela);
  principal (schema staging): 1 chave Pix INATIVA na conta do personal (e-mail de teste). Escrita só por SQL em staging.<tabela>,
  pela Management API; leitura com read_only.
Prints (§5): prints/hml18/<base>_b_confirmar_meus_treinos_390.png (1), <base>_b_confirmar_tirar_do_aluno_390.png (9) e, na
produção, <base>_b_confirmar_tirar_do_dia_390.png (7) — o diálogo aberto, antes de cancelar.
Bases: --base local (o vite preview do build de STAGING em http://localhost:8080) · staging · prod (SÓ LEITURA: a Guarda; sem massa;
só os casos que acham o dado na conta de teste de lá — os outros ficam registrados como "sem dado").
Uso: python3 e2e/hml18/dialogos.py --base local --canal msedge [--casos 1,2,…] [--limpar]
     (padrão: 1–6, 9 e 10 no local/staging; 1 na produção — o 7 e o 8 só com --base prod --casos 1,7,8)
"""
from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

C, B5, C2 = B.C, B.B5, B.C2
MARCA = "HML18 teste"
MODELO, EXERCICIO, GRUPO = f"{MARCA} · excluir", f"{MARCA} · exercício", f"{MARCA} · grupo"
CHAVE_PIX = "hml18.teste.claude@physiqnutri.app"
CASOS = tuple(str(i) for i in range(1, 11))
SO_COM_POWERSYNC = {"7", "8"}  # o treino do aluno (o build de staging não tem PowerSync desde a H-14)
ABERTO = "[role=alertdialog][data-state=open]"

# a saída: observa a janela a partir do toque no Cancelar (o mesmo frame), até sumir — quanto tempo e se passou por "closed"
JS_CANCELAR_E_MEDIR = r"""() => {
  const d = document.querySelector('[role=alertdialog][data-state=open]');
  if (!d) return false;
  const t0 = performance.now();
  window.__saida = { ms: -1, fechado: false, anima: '-' };
  const olhar = () => {
    const vis = d.isConnected && getComputedStyle(d).display !== 'none' && getComputedStyle(d).visibility !== 'hidden';
    if (d.isConnected && d.getAttribute('data-state') === 'closed') {
      window.__saida.fechado = true;
      if (window.__saida.anima === '-') window.__saida.anima = getComputedStyle(d).animationName + '/' + getComputedStyle(d).animationDuration;
    }
    if (!vis) { window.__saida.ms = Math.round(performance.now() - t0); return; }
    if (performance.now() - t0 > 3000) { window.__saida.ms = 9999; return; }
    requestAnimationFrame(olhar);
  };
  d.querySelector('[data-confirmar-cancelar]').click();
  requestAnimationFrame(olhar);
  return true;
}"""


# ───────────────────────── massa (staging, contas de teste) ─────────────────────────
def ler(ref: str, sql: str) -> list[dict]:
    return C.ler(ref, sql)


def gravar(ref: str, sql: str) -> list:
    """Escrita SÓ em staging.<tabela> e só com a marca de teste (trava como a do e2e/hml14/massa.py)."""
    sem_texto = re.sub(r"'[^']*'", "''", sql)
    if re.search(r"(?i)\bpublic\.", sem_texto) or not re.search(r"(?i)\b(insert\s+into|delete\s+from)\s+staging\.", sem_texto):
        raise SystemExit(f"trava: escrita fora de staging.<tabela> ({sql[:80]}…)")
    if MARCA not in sql and "hml18" not in sql:
        raise SystemExit("trava: escrita sem a marca de teste")
    return C2.sql_mgmt(ref, sql)


def q(v: str) -> str:
    return B.B17.txt(v)


class Massa:
    def __init__(self, R: B.Rodada) -> None:
        self.R = R
        self.P, self.T = B5.PRINCIPAL_REF, B5.TREINO_REF
        uid = lambda conta: ler(self.P, f"select id::text as id from auth.users where lower(email) = {q(B5.CONTAS[conta][0].lower())}")[0]["id"]  # noqa: E731
        self.u_personal, self.u_aluna = uid("w5p-personal"), uid("w5p-aluna")
        tre = lambda u: ler(self.T, f"select treino_user_id::text as t from staging.physiq_identidades where principal_user_id = '{C.uuid_ok(u)}'")[0]["t"]  # noqa: E731
        self.t_personal, self.t_aluna = C.uuid_ok(tre(self.u_personal)), C.uuid_ok(tre(self.u_aluna))
        cm = ler(self.P, f"select conta_id::text as c, id::text as m from staging.conta_membros where user_id = '{self.u_personal}' and removido_em is null "
                         "and 'dono' = any(papeis) order by criado_em limit 1")
        if not cm:
            raise SystemExit("o personal de teste não é dono de nenhuma conta no staging")
        self.conta, self.membro = C.uuid_ok(cm[0]["c"]), C.uuid_ok(cm[0]["m"])
        self.mes = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).strftime("%Y-%m")
        self.ids: dict[str, str] = {}

    def limpar(self) -> None:
        tp, ta = self.t_personal, self.t_aluna
        passos = [
            (self.T, f"delete from staging.tb_grupos_treino_perfis where grupo_id in (select id from staging.tb_grupos_treino where professor_id = '{tp}' "
                     f"and nome like {q(MARCA + '%')})"),
            (self.T, f"delete from staging.tb_grupos_treino where professor_id = '{tp}' and nome like {q(MARCA + '%')}"),
            (self.T, f"delete from staging.tb_exercicios where professor_id = '{tp}' and nome like {q(MARCA + '%')}"),
            (self.T, f"delete from staging.grupos_musculares where professor_id = '{tp}' and nome like {q(MARCA + '%')}"),
            (self.T, f"delete from staging.physiq_registros_fotos where user_id = '{ta}' and storage_path like {q('%hml18-teste%')}"),
            (self.P, f"delete from staging.recebimento_chaves where conta_id = '{self.conta}' and chave = {q(CHAVE_PIX)} and favorecido = {q(MARCA)}"),
        ]
        for ref, sql in passos:
            try:
                gravar(ref, sql)
            except Exception as e:  # noqa: BLE001 — uma parte que falha não impede as outras
                self.R.linha(f"   ⚠️ limpeza: {type(e).__name__}: {str(e)[:160]}")
        sobra = self.contar()
        self.R.ok(sum(sobra.values()) == 0, f"massa apagada (o que tem a marca: {sobra})")

    def contar(self) -> dict[str, int]:
        tp, ta = self.t_personal, self.t_aluna
        t = ler(self.T, f"""select (select count(*) from staging.tb_grupos_treino where professor_id = '{tp}' and nome like {q(MARCA + '%')})::int as modelo,
              (select count(*) from staging.tb_exercicios where professor_id = '{tp}' and nome like {q(MARCA + '%')})::int as exercicio,
              (select count(*) from staging.grupos_musculares where professor_id = '{tp}' and nome like {q(MARCA + '%')})::int as grupo,
              (select count(*) from staging.physiq_registros_fotos where user_id = '{ta}' and storage_path like {q('%hml18-teste%')})::int as foto""")[0]
        p = ler(self.P, f"select count(*)::int as chave from staging.recebimento_chaves where conta_id = '{self.conta}' and chave = {q(CHAVE_PIX)}")[0]
        return {**t, **p}

    def criar(self) -> None:
        self.limpar()  # sobras de uma rodada que caiu
        tp, ta = self.t_personal, self.t_aluna
        self.ids["modelo"] = gravar(self.T, f"insert into staging.tb_grupos_treino (nome, professor_id) values ({q(MODELO)}, '{tp}') returning id::text as id")[0]["id"]
        gravar(self.T, f"insert into staging.tb_grupos_treino_perfis (grupo_id, user_id) select id, '{ta}' from staging.tb_grupos_treino "
                       f"where id = '{C.uuid_ok(self.ids['modelo'])}' and nome = {q(MODELO)} returning id::text as id")
        self.ids["exercicio"] = gravar(self.T, f"insert into staging.tb_exercicios (nome, grupo_muscular, professor_id) values ({q(EXERCICIO)}, 'Peitoral', '{tp}') "
                                               "returning id::text as id")[0]["id"]
        gravar(self.T, f"insert into staging.grupos_musculares (nome, professor_id) values ({q(GRUPO)}, '{tp}') returning id::text as id")
        self.ids["foto"] = gravar(self.T, f"insert into staging.physiq_registros_fotos (user_id, mes_ref, tipo, storage_path) values ('{ta}', '{self.mes}-01', 'frente', "
                                          f"{q(f'{ta}/{self.mes}/hml18-teste-frente.jpg')}) on conflict (user_id, mes_ref, tipo) do nothing returning id::text as id")
        gravar(self.P, f"insert into staging.recebimento_chaves (conta_id, membro_id, tipo, chave, favorecido, ativa) values ('{self.conta}', '{self.membro}', 'email', "
                       f"{q(CHAVE_PIX)}, {q(MARCA)}, false) returning id::text as id")
        cont = self.contar()
        self.R.ok(cont == {"modelo": 1, "exercicio": 1, "grupo": 1, "foto": 1, "chave": 1},
                  f"massa criada no staging (contas de teste, marca \"{MARCA}\"): {cont}" + ("" if self.ids["foto"] else " — a foto do mês já existia: o caso 5 usa a que há"))


# ───────────────────────── o diálogo ─────────────────────────
def conferir_dialogo(R: B.Rodada, cel: B.Celular, ctx: dict, rot: str, titulo: str, verbo: str, caso_print: str | None = None) -> None:
    """O diálogo do app aberto: título, verbo, foco no Cancelar, print; cancela; saída ≥ 150 ms por closed; nenhuma escrita."""
    abriu = cel.esperar(lambda: cel.tem(ABERTO), 12)
    R.ok(abriu, f"{rot} a confirmação do app abriu ([role=alertdialog])")
    if not abriu:
        return
    cel.pg.wait_for_timeout(400)  # a entrada (200 ms) termina
    info = cel.pg.evaluate("""() => { const d = document.querySelector('[role=alertdialog][data-state=open]');
      const t = d.querySelector('h2, [data-slot=alert-dialog-title]'); const ok = d.querySelector('[data-confirmar-ok]');
      return { app: d.hasAttribute('data-confirmar'), titulo: (t ? t.textContent : '').trim(), verbo: (ok ? ok.textContent : '').trim(),
        foco: !!(document.activeElement && document.activeElement.hasAttribute('data-confirmar-cancelar')),
        cancelar: (d.querySelector('[data-confirmar-cancelar]') || {}).textContent || '' }; }""")
    R.ok(info["app"] and titulo in info["titulo"] and info["verbo"] == verbo,
         f"{rot} o diálogo é o do app, com o título certo e o verbo \"{verbo}\" no botão (veio \"{info['verbo']}\"; título {'ok' if titulo in info['titulo'] else 'outro'})")
    R.ok(info["foco"], f"{rot} o foco abre no {info['cancelar'].strip() or 'Cancelar'} (o toque sem querer não confirma)")
    if caso_print:
        R.linha(f"   print: {cel.print(ctx['prefixo'], caso_print, B.BORRAR_LISTAS if ctx['producao'] else None)}")
    marca = len(ctx["escritas"])
    cel.pg.evaluate(JS_CANCELAR_E_MEDIR)
    cel.pg.wait_for_timeout(900)
    saida = cel.pg.evaluate("() => window.__saida")
    R.ok(saida["fechado"] and 150 <= saida["ms"] < 9999,
         f"{rot} Cancelar: a janela sai animada (closed por {saida['ms']} ms ≥ 150; {saida['anima']})")
    cel.pg.wait_for_timeout(1200)
    novas = ctx["escritas"][marca:]
    R.ok(not cel.tem(ABERTO) and not novas, f"{rot} cancelado: o diálogo fechou e nada gravou ({len(novas)} escritas: {novas[:3]})")


def anotar_escritas(cel: B.Celular, ctx: dict) -> None:
    """Toda escrita que sai do navegador (a regra da Guarda da hml-17: tabela, RPC fora das de leitura, Storage, ações que gravam)."""
    def ver(req) -> None:
        if ctx["classificar"].escrita(req):
            tipo, nome = B.B17.alvo(req.url)
            ctx["escritas"].append(f"{req.method} {tipo}:{nome}")
    cel.pg.on("request", ver)


# ───────────────────────── os casos ─────────────────────────
def casos_personal(R: B.Rodada, nav, ctx: dict, casos: set[str]) -> None:
    cel = B.Celular(nav, ctx["base"], 390, guarda=ctx["guarda"])
    anotar_escritas(cel, ctx)
    m = ctx["massa"]
    try:
        modelo = m.ids.get("modelo") if m else None
        rota = f"/painel/treinos?treino={modelo}" if modelo else "/painel/treinos"
        cel.entrar(ctx["logins"], ctx["contas"]["personal"], rota)
        cel.esperar_quieto()
        if "1" in casos or "2" in casos:
            aberto = cel.esperar(lambda: cel.tem(f'[data-modelo-detalhe="{modelo}"]') if modelo else cel.tem("[data-modelo-detalhe]"), 25)
            R.ok(aberto, "[1·2] Meus treinos: o treino de teste aberto")
            if "1" in casos and aberto:
                cel.pg.locator("[data-modelo-excluir]").first.click()
                conferir_dialogo(R, cel, ctx, "[1 Meus treinos › excluir]", f'Excluir o treino "{MODELO}"?' if modelo else "Excluir o treino", "Excluir",
                                 "b_confirmar_meus_treinos")
            if "2" in casos and aberto:
                alvo = '[data-quem-recebe-aluno][data-recebe="1"]'
                tem = cel.esperar(lambda: cel.tem(alvo), 20)
                R.ok(tem, "[2 Quem recebe] a aluna de teste recebe o treino de teste")
                if tem:
                    cel.pg.locator(alvo).first.click()
                    conferir_dialogo(R, cel, ctx, "[2 Quem recebe › tirar]", f'Tirar "{MODELO}" de' if modelo else "Tirar", "Tirar")
                    R.ok(cel.pg.locator(alvo).count() >= 1, "[2 Quem recebe] cancelado: a aluna continua recebendo (a marca não mudou)")
        if "3" in casos:
            cel.ir("/painel/treinos?aba=biblioteca")
            cel.esperar_quieto()
            minha = cel.pg.get_by_role("radio", name=re.compile(r"^Minha"))
            if minha.count():
                minha.first.click()
            linha = f'[data-exercicio-biblioteca-nome="{EXERCICIO}"] [data-exercicio-excluir-bib]'
            tem = cel.esperar(lambda: cel.tem(linha), 25)
            R.ok(tem, "[3 Biblioteca] o exercício próprio de teste na Minha, com o Excluir")
            if tem:
                cel.pg.locator(linha).first.click()
                conferir_dialogo(R, cel, ctx, "[3 Biblioteca › excluir]", f'Excluir "{EXERCICIO}" da biblioteca?', "Excluir")
        if "10" in casos:
            if "3" not in casos:
                cel.ir("/painel/treinos?aba=biblioteca")
                cel.esperar_quieto()
                minha = cel.pg.get_by_role("radio", name=re.compile(r"^Minha"))
                if minha.count():
                    minha.first.click()
            tem = cel.esperar(lambda: cel.tem("[data-btn-grupos-musculares]"), 20)
            if tem:
                cel.pg.locator("[data-btn-grupos-musculares]").first.click()
            botao = cel.pg.get_by_role("button", name=f"Excluir {GRUPO}")
            tem = tem and cel.esperar(lambda: botao.count() > 0 and botao.first.is_visible(), 20)
            R.ok(tem, "[10 Biblioteca › Grupos musculares] o grupo próprio de teste com o Excluir")
            if tem:
                botao.first.click()
                conferir_dialogo(R, cel, ctx, "[10 Biblioteca › excluir grupo]", f'Excluir o grupo "{GRUPO}"?', "Excluir")
                R.ok(botao.count() > 0, "[10] cancelado: o grupo continua na lista")
            cel.pg.keyboard.press("Escape")
            cel.pg.wait_for_timeout(400)
        if "4" in casos:
            cel.ir(f"/painel/alunos/{ctx['aluna']}/editar")
            tem = cel.esperar(lambda: cel.tem("[data-exercicio-remover]"), 30)
            R.ok(tem, "[4 editor] o treino da aluna com o Tirar do exercício")
            if tem:
                cel.pg.locator("[data-exercicio-remover]").first.click()
                conferir_dialogo(R, cel, ctx, "[4 editor › tirar exercício]", "Tirar \"", "Tirar")
        if "9" in casos:
            if "4" not in casos:
                cel.ir(f"/painel/alunos/{ctx['aluna']}/editar")
            tem = cel.esperar(lambda: cel.tem("[data-treino-tirar]"), 30)
            R.ok(tem, "[9 editor] o treino do personal na aluna com o \"Tirar do aluno\"")
            if tem:
                cel.pg.locator("[data-treino-tirar]").first.click()
                conferir_dialogo(R, cel, ctx, "[9 editor › tirar o treino do aluno]", "do aluno?", "Tirar do aluno", "b_confirmar_tirar_do_aluno")
                R.ok(cel.tem("[data-treino-tirar]"), "[9] cancelado: o treino continua na aluna")
        if "5" in casos:
            cel.ir(f"/painel/alunos/{ctx['aluna']}/avaliacao")
            tem = cel.esperar(lambda: cel.tem("[data-avaliacao-fotos-gerenciar]"), 30)
            R.ok(tem, "[5 Fotos] a Avaliação com as fotos (Gerenciar)")
            if tem:
                cel.pg.locator("[data-avaliacao-fotos-gerenciar]").first.click()
                tem = cel.esperar(lambda: cel.tem("[data-foto-excluir]"), 20)
                R.ok(tem, "[5 Fotos] a foto de teste com o Excluir")
                if tem:
                    cel.pg.locator("[data-foto-excluir]").first.click()
                    conferir_dialogo(R, cel, ctx, "[5 Fotos › excluir]", "Excluir a foto", "Excluir")
        if "6" in casos:
            cel.ir("/painel/configuracoes/recebimento")
            tem = cel.esperar(lambda: cel.tem("[data-btn-excluir-recebimento]"), 30)
            R.ok(tem, "[6 Recebimento] a chave Pix de teste com o Excluir")
            if tem:
                cel.pg.locator("[data-btn-excluir-recebimento]").first.click()
                conferir_dialogo(R, cel, ctx, "[6 Recebimento › excluir chave]", "Excluir a chave", "Excluir")
        R.ok(not cel.dialogos, f"[personal] nenhum diálogo nativo do navegador ({cel.dialogos})")
    finally:
        cel.fim(ctx["logins"])


def casos_aluno(R: B.Rodada, nav, ctx: dict, casos: set[str]) -> None:
    cel = B.Celular(nav, ctx["base"], 390, guarda=ctx["guarda"])
    anotar_escritas(cel, ctx)
    try:
        cel.entrar(ctx["logins"], ctx["conta_treino"], "/treino")
        cel.esperar_quieto(minimo=6)
        cel.esperar(lambda: not cel.tem('[data-sync="primeira"]'), 90)  # o 1º sync do PowerSync ("Baixando o seu treino")
        dia = '[data-dia]:not([aria-label*="sem treino"])'
        tem = cel.esperar(lambda: cel.pg.locator(dia).count() > 0, 90)
        R.ok(tem, "[7·8] Treino: um dia da semana com treino")
        if not tem:
            return
        preferido = cel.pg.locator('[data-dia][data-dia-estado="treino"]:not([aria-label*="sem treino"])')
        (preferido.first if preferido.count() else cel.pg.locator(dia).first).click()
        tem = cel.esperar(lambda: cel.tem("[data-treino-opcoes]"), 30)
        R.ok(tem, "[7·8] o cartão do treino do dia com as opções")
        if not tem:
            return
        if "7" in casos:
            cel.pg.locator("[data-treino-opcoes]").first.click()
            cel.pg.get_by_text("Tirar este treino do dia").first.click(timeout=10000)
            conferir_dialogo(R, cel, ctx, "[7 Treino › tirar do dia]", "Tirar \"", "Tirar do dia", "b_confirmar_tirar_do_dia")
        if "8" in casos:
            cel.pg.locator("[data-treino-opcoes]").first.click()
            cel.pg.get_by_text("Trocar o treino do dia").first.click(timeout=10000)
            alvo = "[data-apagar-meu-treino]"
            tem = cel.esperar(lambda: cel.tem(alvo), 45)  # os treinos próprios chegam pelo PowerSync
            R.ok(tem, "[8 Treino › trocar] um treino próprio em \"Meus treinos\", com o Apagar")
            if tem:
                cel.pg.locator(alvo).first.click()
                conferir_dialogo(R, cel, ctx, "[8 Treino › apagar treino próprio]", "Apagar o treino", "Apagar")
                R.ok(cel.tem(alvo), "[8] cancelado: o treino próprio continua na lista")
            cel.pg.keyboard.press("Escape")
        R.ok(not cel.dialogos, f"[aluno] nenhum diálogo nativo do navegador ({cel.dialogos})")
    finally:
        cel.fim(ctx["logins"])


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-18a — E2E dos diálogos (B): 8 dos 24, abre e cancela")
    ap.add_argument("--base", required=True, help="local (http://localhost:8080) | staging | prod (SÓ LEITURA) | <url>")
    ap.add_argument("--canal", default="msedge", choices=("msedge", "chromium", "chrome"))
    ap.add_argument("--casos", default=None, help="padrão: 1–8 (na produção: 1)")
    ap.add_argument("--limpar", action="store_true", help="só apaga a massa de teste (sobras) e sai")
    a = ap.parse_args()
    base, prefixo, producao = B.resolver_base(a.base)
    # na produção (só leitura, sem massa): só o 1 (Meus treinos › excluir, do admin de teste — §5 da spec); o resto pede massa.
    # No local e no staging: os 8 que rodam (o 7 e o 8 pedem o PowerSync, que o build de staging não tem — H-14)
    padrao = "1" if producao else ",".join(c for c in CASOS if c not in SO_COM_POWERSYNC)
    casos = {c.strip() for c in (a.casos or padrao).split(",") if c.strip()}
    if casos - set(CASOS):
        raise SystemExit(f"casos: {', '.join(CASOS)}")
    R = B.Rodada(f"dialogos_{prefixo}")
    R.linha(f"base {base} · {'PRODUÇÃO, só leitura (a Guarda; sem massa)' if producao else 'schema staging'} · canal {a.canal} · casos "
            f"{','.join(sorted(casos, key=int))}")
    if not producao and casos & SO_COM_POWERSYNC:
        R.linha(f"   (casos {','.join(sorted(casos & SO_COM_POWERSYNC))} pulados: o build de staging não tem PowerSync desde a H-14 — o treino do aluno "
                "não abre no local nem no staging; rodam com --base prod)")
        casos -= SO_COM_POWERSYNC
    if a.limpar:
        if producao:
            raise SystemExit("--limpar é do staging")
        Massa(R).limpar()
        return R.fim()
    contas = B.CONTAS_DA_BASE["prod" if producao else "staging"]
    L = B.Logins(f"dialogos.py {prefixo}")
    ctx = {"base": base, "prefixo": prefixo, "producao": producao, "contas": contas, "logins": L, "escritas": [], "massa": None,
           "guarda": B.B17.Guarda() if producao else None, "classificar": B.B17.Guarda(), "conta_treino": "aluno-calc"}
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    with sync_playwright() as pw:
        try:
            nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
            try:
                ok_build = B.conferir_build(R, nav, base, producao)
            finally:
                nav.close()
            if ok_build:
                ctx["aluna"] = B.matricula(contas["aluna"])
                if not producao and casos & {"1", "2", "3", "5", "6", "10"}:  # o 4, o 7, o 8 e o 9 usam o que a conta de teste já tem
                    ctx["massa"] = Massa(R)
                    ctx["massa"].criar()
                for grupo, fn in (("personal", casos_personal), ("aluno", casos_aluno)):
                    if not casos & ({"1", "2", "3", "4", "5", "6", "9", "10"} if grupo == "personal" else {"7", "8"}):
                        continue
                    nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
                    try:
                        fn(R, nav, ctx, casos)
                    except Exception as e:  # noqa: BLE001
                        R.ok(False, f"[{grupo}] {type(e).__name__}: {str(e)[:240]}")
                    finally:
                        nav.close()
        finally:
            try:
                if ctx["massa"]:
                    ctx["massa"].limpar()
            finally:
                L.fechar(R)
    if producao and ctx["guarda"]:
        R.linha(f"   escritas bloqueadas pelo navegador: {len(ctx['guarda'].bloqueadas)}")
    return R.fim()


if __name__ == "__main__":
    raise SystemExit(main())
