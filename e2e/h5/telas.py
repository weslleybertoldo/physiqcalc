#!/usr/bin/env python3
"""Physiq H5 — E2E das TELAS dos ajustes da revisão final (positivo e negativo), na "Consultoria Ferreira W13" do staging:

  agenda      N-11: Rafael (app) reagenda uma consulta da Camila com a janela "Sem trava" MÊS A MÊS — avança 7 meses e marca lá;
              (negativo) a do Lucas ("só no mês") continua numa lista só, sem as setas; o pacote de 6 meses do Lucas abre por mês;
  cadastro    N-57: o /c/ com Apelido e CPF; CPF de aluno que existe → a frase vermelha embaixo do CPF (nada criado); só o nome → enviado;
  metas       N-40: a Camila vê os ✓ que o Rafael marcou nas metas (7 dias); item 10: o Lucas (dono sem papel de nutri, só leitura)
              tem "Nova meta" travado e o "PDF das metas" baixando;
  editor      N-61 + achado 8: os totais do Nutri (meta × kcal, sódio, alimentos, refeições) e Subir/Descer refeição gravando a ordem;
              (negativo) o 1º não sobe e o Lucas (só leitura) não tem Subir/Descer; no celular a lixeira do alimento fica à vista;
  inicio      N-48: o atalho "Foto pro diário" no card "Dieta de hoje" abre a folha do diário; (negativo) diário desligado → sem atalho;
  fotos       N-34 + achado 9: a Camila vê a foto grande (anterior/próxima), baixa e edita a observação; o gráfico da Avaliação com a
              linha do % de gordura; (negativo) o Lucas vê e baixa, mas não edita a foto da nutrição;
  prontuario  item 10: a 2ª nutri da conta (só leitura no clínico) VÊ e BAIXA o anexo; enviar/excluir travados;
  fluxo       item 11: o "Fluxo de consulta" do Resumo só para quem é nutri (a Camila vê; o Lucas, dono + personal, não);
  textos      item 13: "aluno" no lugar de "paciente" (Orientações vazia, Consultas).

Uso: python3 e2e/h5/telas.py --base http://localhost:8080 --prefixo local [--casos ...]
     (staging: --base https://physiqcalc-staging.vercel.app --prefixo staging). Precisa da massa: python3 e2e/h5/massa.py.
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
q = B.sql_principal
CASOS: dict[str, object] = {}
ESTADO: dict = {}


def caso(fn):
    CASOS[fn.__name__.replace("caso_", "")] = fn
    return fn


def painel(nav, nome: str, conta: str, rota: str):
    c = B.Caso(nav, ESTADO["base"], ESTADO["prefixo"], nome, desktop=True)
    c.entrar(conta, rota)
    c.fechar_avisos()
    return c


def app(nav, nome: str, conta: str, rota: str, esperar: str):
    return B.B13.B12.abrir(nav, ESTADO["base"], ESTADO["prefixo"], nome, conta, rota, esperar=esperar)


def baixar(c, clicar, nome: str) -> Path | None:
    B.DOWNLOADS.mkdir(parents=True, exist_ok=True)
    try:
        with c.pg.expect_download(timeout=60000) as d:
            clicar()
        destino = B.DOWNLOADS / f"{c.prefixo}_{nome}_{d.value.suggested_filename}"
        d.value.save_as(str(destino))
        return destino
    except Exception as e:  # noqa: BLE001
        print("   download falhou:", e)
        return None


MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]


def mais_meses(d: dt.date, n: int) -> dt.date:
    t = d.year * 12 + d.month - 1 + n
    return dt.date(t // 12, t % 12 + 1, 1)


def clicar(c, seletor: str, rotulo: str) -> None:
    """Clica; se algo estiver por cima (um aviso que chegou depois), fecha o aviso e tenta de novo — e, se ainda falhar, guarda o
    print e diz quem está por cima."""
    loc = c.pg.locator(seletor).first
    try:
        loc.click(timeout=12000)
        return
    except Exception:  # noqa: BLE001
        pass
    c.fechar_avisos()
    for nome in ("Entendi", "Agora não", "Fechar"):
        b = c.pg.get_by_role("button", name=nome)
        if b.count() and b.first.is_visible():
            b.first.click()
            c.pg.wait_for_timeout(400)
    try:
        loc.click(timeout=12000)
    except Exception:
        caixa = loc.bounding_box() or {}
        topo = c.pg.evaluate("([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.outerHTML.slice(0, 300) : null; }",
                             [caixa.get("x", 0) + caixa.get("width", 0) / 2, caixa.get("y", 0) + caixa.get("height", 0) / 2])
        c.pg.screenshot(path=str(B.PRINTS / f"falha_{c.prefixo}_clique_{rotulo}.png"))
        raise RuntimeError(f"clique em {rotulo} não passou; por cima: {topo}")


def rafael() -> dict:
    return B.rafael(B.conta_w13())


# ───────────────────────── agenda (N-11) ─────────────────────────

@caso
def caso_agenda(nav) -> None:
    conta = B.conta_w13()
    raf = rafael()
    camila = B.uid("w13-nutri")
    cal = q(f"select id::text from {S}.calendarios where nutricionista_id = '{camila}' and deleted_at is null order by padrao desc, created_at limit 1")[0]["id"]
    assert not q(f"select 1 from {S}.agenda_config where profissional_id = '{camila}'"), "a Camila já tem agenda_config no staging"
    d = B.hoje() + dt.timedelta(days=5)
    ini = B.sp(d, "10:00")
    fim = (dt.datetime.fromisoformat(ini) + dt.timedelta(minutes=30)).isoformat()
    t0 = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
    q(f"insert into {S}.agenda_config (profissional_id, janela_reagendamento, reagendamentos_max) values ('{camila}', 'livre', 1)")
    ag = q(f"""insert into {S}.agendamentos (nutricionista_id, calendario_id, paciente_id, titulo, inicio, fim, modulo, conta_id, status, confirmacao)
               values ('{camila}', '{cal}', '{raf['id']}', 'Consulta H5 sem trava', '{ini}', '{fim}', 'nutricao', '{conta}', 'confirmado', 'confirmado')
               returning id::text""")[0]["id"]
    lucas_ag = q(f"""select id::text from {S}.agendamentos where paciente_id = '{raf['id']}' and nutricionista_id = '{B.uid('w13-dono')}'
                     and inicio > now() and deleted_at is null and status not in ('desmarcado','paciente_desmarcou','nao_compareceu') order by inicio limit 1""")
    c = app(nav, "agenda", "w13-aluno", "/perfil/agenda", "[data-pagina-agenda]")
    try:
        ok = c.esperar(lambda: c.tem(f'[data-btn-reagendar="{ag}"]'), 60)
        p.check(ok, "[agenda] a consulta da Camila (sem trava) aparece com Reagendar")
        clicar(c, f'[data-btn-reagendar="{ag}"]', "reagendar")
        c.esperar(lambda: c.tem("[data-mensagem-reagendar]"), 20)
        msg = c.pg.locator("[data-mensagem-reagendar]").inner_text()
        p.check("para qualquer data" in msg, f"[agenda] a mensagem diz a verdade: {msg[:120]!r}")
        ok = c.esperar(lambda: c.tem("[data-navegar-mes]") and c.pg.locator("[data-dia-livre]").count() > 0, 40)
        rot0 = c.pg.locator("[data-mes-rotulo]").inner_text() if ok else ""
        p.check(ok and rot0.lower().startswith(MESES[B.hoje().month - 1]), f"[agenda] 'Sem trava' abre MÊS A MÊS, no mês de hoje ({rot0})")
        p.check(c.pg.locator("[data-mes-anterior]").is_disabled(), "[agenda] (negativo) não volta antes do mês de hoje")
        for _ in range(7):
            c.pg.locator("[data-mes-proximo]").click()
            c.pg.wait_for_timeout(250)
        alvo_mes = mais_meses(B.hoje().replace(day=1), 7)
        ok = c.esperar(lambda: c.pg.locator("[data-dia-livre]").count() > 0 and (c.pg.locator("[data-horarios-por-mes]").get_attribute("data-horarios-por-mes") or "") == alvo_mes.isoformat(), 40)
        dias = c.pg.locator("[data-dia-livre]").evaluate_all("els => els.map(e => e.dataset.diaLivre)") if ok else []
        p.check(ok and all(x[:7] == alvo_mes.isoformat()[:7] for x in dias), f"[agenda] 7 meses à frente ({alvo_mes:%m/%Y}): {len(dias)} dias com horário, todos do mês")
        p.check(not c.pg.locator("[data-mes-proximo]").is_disabled(), "[agenda] sem fim: o próximo mês continua liberado")
        c.print("app_reagendar_sem_trava")
        if dias:
            c.pg.locator(f'[data-dia-livre="{dias[0]}"]').click()
            c.pg.wait_for_timeout(300)
            hora = c.pg.locator("[data-horario-livre]").first.get_attribute("data-horario-livre")
            c.pg.locator("[data-horario-livre]").first.click()
            c.pg.locator("[data-reagendar-confirmar]").click()
            r = B.esperar(lambda: q(f"select timezone('America/Sao_Paulo', inicio)::text ini, reagendamentos from {S}.agendamentos where id = '{ag}' and reagendamentos = 1"), 20)
            p.check(bool(r) and r[0]["ini"].startswith(f"{dias[0]} {hora}"), f"[agenda] REAGENDOU pelo app para {dias[0]} {hora} ({r[0] if r else '-'})")
        c.esperar(lambda: not c.tem("[data-sheet-reagendar]"), 15)
        # negativo: a do Lucas ("só no mês") — uma lista só, sem as setas
        if lucas_ag:
            la = lucas_ag[0]["id"]
            if c.esperar(lambda: c.tem(f'[data-btn-reagendar="{la}"]'), 20):
                clicar(c, f'[data-btn-reagendar="{la}"]', "reagendar_lucas")
                c.esperar(lambda: c.tem("[data-sheet-reagendar]"), 20)
                c.esperar(lambda: c.pg.locator("[data-dia-livre]").count() > 0 or c.tem("[data-sem-horarios]"), 30)
                p.check(not c.tem("[data-navegar-mes]"), "[agenda] (negativo) 'só no mês' (Lucas): sem as setas de mês — a lista de antes")
                c.pg.keyboard.press("Escape")
                c.esperar(lambda: not c.tem("[data-sheet-reagendar]"), 10)
            else:
                p.check(False, "[agenda] (negativo) a consulta do Lucas não apareceu")
        # o pacote de 6 meses do Lucas (janela maior que um pedido): Marcar abre por mês
        if c.tem("[data-btn-marcar]"):
            c.pg.locator("[data-btn-marcar]").first.click()
            ok = c.esperar(lambda: c.tem("[data-sheet-marcar]") and (c.tem("[data-navegar-mes]") or c.tem("[data-sem-horarios]")), 30)
            p.check(ok and c.tem("[data-navegar-mes]"), "[agenda] Marcar do pacote (6 meses): também mês a mês")
            c.pg.keyboard.press("Escape")
    finally:
        c.fim()
        q(f"delete from {S}.agendamentos where id = '{ag}'")
        q(f"delete from {S}.agenda_config where profissional_id = '{camila}'")
        q(f"""delete from {S}.avisos where criado_em >= '{t0}' and destino_user_id in ('{raf['user_id']}', '{camila}') and tipo = 'consulta_marcada'""")


# ───────────────────────── /c/ (N-57) ─────────────────────────

@caso
def caso_cadastro(nav) -> None:
    conta = B.conta_w13()
    cod = q(f"select codigo_convite c from {S}.conta_membros where conta_id = '{conta}' and user_id = '{B.uid('w13-dono')}'")[0]["c"]
    antes = q(f"select count(*)::int n from {S}.cadastros_pendentes where conta_id = '{conta}'")[0]["n"]
    c = B.Caso(nav, ESTADO["base"], ESTADO["prefixo"], "cadastro", desktop=False)
    try:
        c.ir(f"/c/{cod}")
        ok = c.esperar(lambda: c.tem("[data-form-cadastro-publico]"), 60)
        p.check(ok and c.tem("[data-cad-apelido]") and c.tem("[data-cad-cpf]"), "[/c/] o formulário tem Apelido e CPF de volta")
        p.check("só o nome é obrigatório" in c.texto(), "[/c/] diz que só o nome é obrigatório")
        c.print("cadastro_c")
        c.pg.fill("[data-cad-nome]", "Ana CPF Repetido H5")
        c.pg.fill("[data-cad-cpf]", "39053344705")
        p.check(c.pg.input_value("[data-cad-cpf]") == "390.533.447-05", "[/c/] o CPF ganha a máscara")
        B.captcha(False)
        try:
            c.pg.click("[data-cad-enviar]")
            ok = c.esperar(lambda: c.tem("[data-cad-cpf][aria-invalid='true']"), 40)
        finally:
            B.captcha(True)
        txt = c.pg.locator("label:has([data-cad-cpf]) [data-erro-campo]").inner_text() if ok else ""
        p.check(ok and txt == "Já existe cadastro com este CPF." and not c.tem("[data-cadastro-enviado]"), f"[/c/] (negativo) CPF de aluno que existe → embaixo do CPF: {txt!r}")
        c.print("cadastro_cpf_existe")
        p.check(q(f"select count(*)::int n from {S}.cadastros_pendentes where conta_id = '{conta}'")[0]["n"] == antes, "[/c/] (negativo) nada criado")
        # positivo: troca o CPF por um novo (o aviso some) e envia só com nome + apelido + CPF
        c.pg.fill("[data-cad-cpf]", "529.982.247-25")
        p.check(not c.tem("[data-cad-cpf][aria-invalid='true']"), "[/c/] mexer no CPF tira o aviso")
        c.pg.fill("[data-cad-apelido]", "Aninha")
        B.captcha(False)
        try:
            c.pg.click("[data-cad-enviar]")
            ok = c.esperar(lambda: c.tem("[data-cadastro-enviado]"), 40)
        finally:
            B.captcha(True)
        linha = q(f"select apelido, cpf, email, telefone from {S}.cadastros_pendentes where conta_id = '{conta}' and nome = 'Ana CPF Repetido H5'")
        p.check(ok and linha and linha[0]["apelido"] == "Aninha" and linha[0]["cpf"] == "52998224725" and not linha[0]["email"] and not linha[0]["telefone"],
                f"[/c/] SEM e-mail e SEM telefone: enviado, com apelido e CPF ({linha})")
        c.print("cadastro_enviado")
    finally:
        c.fim()
        q(f"delete from {S}.cadastros_pendentes where conta_id = '{conta}' and nome like '%H5%'")
        B.captcha(True)


# ───────────────────────── metas (N-40) + só leitura (item 10) ─────────────────────────

@caso
def caso_metas(nav) -> None:
    raf = rafael()
    metas = q(f"""select m.id::text, m.titulo, (select count(*)::int from {S}.metas_concluidas x where x.meta_id = m.id and x.data > current_date - 7) feitas
                  from {S}.metas m where m.paciente_id = '{raf['id']}' and m.titulo like '%H5%' and m.deleted_at is null order by m.titulo""")
    assert len(metas) == 2, "rode a massa (e2e/h5/massa.py)"
    c = painel(nav, "metas", "w13-nutri", f"/painel/alunos/{raf['id']}/dieta?secao=metas")
    try:
        ok = c.esperar(lambda: c.pg.locator("[data-meta-marcadas]").count() >= 2, 60)
        p.check(ok, "[metas] a Camila vê a linha '✓ do aluno · 7 dias' em cada meta")
        for m in metas:
            el = c.pg.locator(f'[data-meta="{m["id"]}"] [data-meta-marcadas]')
            v = el.get_attribute("data-meta-marcadas") if el.count() else None
            p.check(v is not None and int(v) == m["feitas"], f"[metas] {m['titulo']}: {v} ✓ = os {m['feitas']} que o aluno marcou")
        hoje_ok = c.pg.locator(f'[data-meta="{metas[0]["id"]}"] [data-meta-dia="{B.hoje().isoformat()}"]').get_attribute("data-feita")
        p.check(hoje_ok == "1", f"[metas] o ✓ de hoje aparece (Beber 3 L: {hoje_ok})")
        c.pg.locator(f'[data-meta="{metas[0]["id"]}"]').scroll_into_view_if_needed()
        c.print("metas_marcadas")
    finally:
        c.fim()
    # item 10 (só leitura): o dono sem papel de nutri lê as metas, gera o PDF; não cria nem edita
    c = painel(nav, "so_leitura_metas", "w13-dono", f"/painel/alunos/{raf['id']}/dieta?secao=metas")
    try:
        ok = c.esperar(lambda: c.tem("[data-somente-leitura][data-dieta-leitura]") and c.pg.locator("[data-meta]").count() >= 2, 60)
        p.check(ok, "[só leitura] o Lucas vê as metas no modo só leitura (o componente novo, não o fieldset)")
        p.check(c.pg.locator("[data-btn-nova-meta]").is_disabled() and c.pg.locator("[data-btn-editar-meta]").first.is_disabled(),
                "[só leitura] (negativo) Nova meta e Editar travados")
        p.check(c.esperar(lambda: c.pg.locator("[data-btn-pdf-metas]").is_enabled(), 30), "[só leitura] o PDF das metas continua ativo")
        p.check(not c.tem("[data-erro-metas]"), "[só leitura] sem o erro de RLS dos modelos (quem só lê não cria os modelos padrão)")
        arq = baixar(c, lambda: c.pg.locator("[data-btn-pdf-metas]").click(), "metas")
        p.check(bool(arq) and arq.read_bytes()[:4] == b"%PDF", f"[só leitura] o PDF das metas BAIXA ({arq.name if arq else '-'})")
        p.check(c.pg.locator("[data-meta-marcadas]").count() >= 2, "[só leitura] o dono também vê os ✓ (a regra do banco deixa o dono ler)")
        c.print("so_leitura_metas")
    finally:
        c.fim()


# ───────────────────────── editor (N-61 + totais + lixeira no celular) ─────────────────────────

def ordem_refeicoes(plano: str) -> list[str]:
    return [r["nome"] for r in q(f"select nome from {S}.refeicoes where plano_id = '{plano}' order by ordem, horario nulls last, nome")]


@caso
def caso_editor(nav) -> None:
    raf = rafael()
    plano = q(f"select id::text, kcal_alvo::float a from {S}.planos_alimentares where paciente_id = '{raf['id']}' and deleted_at is null order by created_at desc limit 1")[0]
    antes = ordem_refeicoes(plano["id"])
    ordens_antes = q(f"select id::text, ordem from {S}.refeicoes where plano_id = '{plano['id']}'")
    c = painel(nav, "editor", "w13-nutri", f"/painel/alunos/{raf['id']}/dieta")
    try:
        ok = c.esperar(lambda: c.tem("[data-editor-dieta] [data-dieta-totais]"), 60)
        tot = c.pg.locator("[data-dieta-totais]")
        p.check(ok, "[editor] o bloco dos totais do Nutri aparece no editor da tela 8")
        sit = tot.get_attribute("data-situacao-alvo") if ok else None
        p.check(sit in ("no_alvo", "abaixo", "acima") and c.tem("[data-dieta-meta-kcal]"), f"[editor] kcal × meta ({plano['a']:.0f}): barra + % + situação ({sit})")
        p.check(c.tem("[data-total-sodio-chip]") and "ALIMENTOS" in tot.inner_text() and "REFEIÇ" in tot.inner_text(), "[editor] sódio, nº de alimentos e de refeições")
        p.check(c.pg.locator("[data-macro-pct]").count() == 3, "[editor] o % de cada macro ao lado das gramas")
        # Subir/Descer: abre a 2ª refeição do dia e sobe
        refs = c.pg.locator("[data-editor-dieta] [data-refeicao]")
        n = refs.count()
        p.check(n >= 2, f"[editor] {n} refeições no dia")
        nome2 = refs.nth(1).get_attribute("data-refeicao-nome")
        refs.nth(1).locator("[data-refeicao-abrir]").click()
        c.esperar(lambda: c.tem("[data-refeicao-subir]"), 15)
        c.pg.locator("[data-refeicao-subir]").click()
        ok = c.esperar(lambda: c.pg.locator("[data-editor-dieta] [data-refeicao]").first.get_attribute("data-refeicao-nome") == nome2
                       and c.pg.locator("[data-dieta-refeicoes]").get_attribute("data-salvando-ordem") == "0", 20)
        depois = B.esperar(lambda: (lambda o: o if o and o[0] == nome2 else None)(ordem_refeicoes(plano["id"])), 20)
        p.check(ok and bool(depois), f"[editor] SUBIR: {nome2} foi para o 1º lugar e o banco gravou ({(depois or [])[:3]})")
        c.print("editor_totais_ordem")
        p.check(c.pg.locator("[data-refeicao-subir]").is_disabled(), "[editor] (negativo) a 1ª não sobe mais")
        c.pg.locator("[data-refeicao-descer]").click()
        volta = B.esperar(lambda: (lambda o: o if o == antes else None)(ordem_refeicoes(plano["id"])), 20)
        p.check(bool(volta), f"[editor] DESCER: voltou à ordem de antes ({(volta or [])[:3]})")
    finally:
        c.fim()
        for o in ordens_antes:
            q(f"update {S}.refeicoes set ordem = {o['ordem']} where id = '{o['id']}'")
    # negativo: o Lucas (só leitura) não muda a ordem
    c = painel(nav, "editor_leitura", "w13-dono", f"/painel/alunos/{raf['id']}/dieta")
    try:
        ok = c.esperar(lambda: c.tem("[data-editor-dieta][data-somente-leitura]"), 60)
        c.pg.locator("[data-editor-dieta] [data-refeicao] [data-refeicao-abrir]").first.click()
        c.pg.wait_for_timeout(600)
        p.check(ok and not c.tem("[data-refeicao-subir]") and not c.tem("[data-item-remover]"), "[editor] (negativo) só leitura: sem Subir/Descer e sem lixeira")
        p.check(c.tem("[data-dieta-totais]"), "[editor] só leitura também vê os totais")
    finally:
        c.fim()
    # celular: a lixeira do alimento à vista e tocável
    c = B.Caso(nav, ESTADO["base"], ESTADO["prefixo"], "editor_celular", desktop=False)
    try:
        c.entrar("w13-nutri", f"/painel/alunos/{raf['id']}/dieta")
        c.fechar_avisos()
        ok = c.esperar(lambda: c.tem("[data-editor-dieta] [data-refeicao]"), 60)
        alvo = c.pg.locator("[data-editor-dieta] [data-refeicao]").first
        alvo.locator("[data-refeicao-abrir]").click()
        ok = ok and c.esperar(lambda: c.pg.locator("[data-item-remover]").count() > 0, 20)
        lix = c.pg.locator("[data-item-remover]").first
        lix.scroll_into_view_if_needed()
        caixa = lix.bounding_box() if ok else None
        opac = lix.evaluate("e => getComputedStyle(e).opacity") if ok else "0"
        p.check(ok and caixa and caixa["width"] >= 26 and caixa["height"] >= 26 and float(opac) == 1.0,
                f"[editor] no CELULAR a lixeira do alimento aparece e é tocável ({caixa}, opacidade {opac})")
        if ok:
            lix.tap()
            okd = c.esperar(lambda: c.tem("[data-confirmar-acao-dieta]"), 10)
            p.check(okd, "[editor] tocar na lixeira abre a confirmação (não remove sem confirmar)")
            c.print("editor_celular_lixeira")
            c.pg.keyboard.press("Escape")
    finally:
        c.fim()


# ───────────────────────── Início (N-48) ─────────────────────────

@caso
def caso_inicio(nav) -> None:
    raf = rafael()
    c = app(nav, "inicio", "w13-aluno", "/", "[data-aba-inicio]")
    try:
        ok = c.esperar(lambda: c.tem("[data-dieta-hoje-diario]"), 60)
        p.check(ok, "[início] o card 'Dieta de hoje' tem o atalho 'Foto pro diário'")
        c.print("inicio_atalho_diario")
        if ok:
            c.pg.locator("[data-dieta-hoje-diario]").click()
            ok2 = c.esperar(lambda: c.caminho().startswith("/dieta") and c.tem("[data-folha-diario]"), 40)
            p.check(ok2, f"[início] o atalho abre a folha do diário na aba Dieta ({c.caminho()})")
            c.print("inicio_folha_diario")
    finally:
        c.fim()
    # negativo: o profissional desliga o diário do aluno (ajuste R12) → sem o atalho
    cfg = q(f"select config from {S}.pacientes where id = '{raf['id']}'")[0]["config"]
    q(f"""update {S}.pacientes set config = coalesce(config, '{{}}'::jsonb) || '{{"diario_alimentar": false}}'::jsonb where id = '{raf['id']}'""")
    c = app(nav, "inicio_sem_diario", "w13-aluno", "/", "[data-aba-inicio]")
    try:
        ok = c.esperar(lambda: c.tem('[data-card-dieta-hoje="plano"]') or c.tem("[data-card-dieta-hoje]"), 60)
        c.pg.wait_for_timeout(1500)
        p.check(ok and not c.tem("[data-dieta-hoje-diario]"), "[início] (negativo) diário desligado → o card sem o atalho")
    finally:
        c.fim()
        if cfg is None:
            q(f"update {S}.pacientes set config = config - 'diario_alimentar' where id = '{raf['id']}'")
        else:
            q(f"update {S}.pacientes set config = {B.q(__import__('json').dumps(cfg))}::jsonb where id = '{raf['id']}'")


# ───────────────────────── fotos (N-34) + gráfico (achado 9) ─────────────────────────

@caso
def caso_fotos(nav) -> None:
    raf = rafael()
    fotos = q(f"select id::text, posicao, observacao from {S}.fotos_evolucao where paciente_id = '{raf['id']}' and coalesce(observacao,'') like '%H5%' and deleted_at is null")
    assert len(fotos) == 3, "rode a massa (e2e/h5/massa.py)"
    c = painel(nav, "fotos", "w13-nutri", f"/painel/alunos/{raf['id']}/avaliacao")
    try:
        ok = c.esperar(lambda: c.tem("[data-grafico-evolucao]"), 90)
        l2 = c.pg.locator("[data-grafico-linha2]")
        n2 = int(l2.get_attribute("data-grafico-linha2") or 0) if l2.count() else 0
        p.check(ok and n2 >= 2 and c.tem("[data-grafico-legenda-segunda]"), f"[gráfico] a linha do % de gordura no gráfico da Avaliação ({n2} pontos) com a legenda")
        leg = c.pg.locator("[data-grafico-legenda]").inner_text() if c.tem("[data-grafico-legenda]") else ""
        p.check("% de gordura" in leg and "→" in leg, f"[gráfico] a legenda: {leg!r}")
        c.pg.locator("[data-grafico-evolucao]").scroll_into_view_if_needed()
        c.print("avaliacao_grafico_gordura")
        c.pg.locator("[data-avaliacao-fotos-gerenciar]").click()
        ok = c.esperar(lambda: c.pg.locator("[data-foto-ver]").count() >= 3, 40)
        p.check(ok, "[fotos] a lista das fotos tem Ver")
        frente = next(f for f in fotos if f["posicao"] == "frente")
        c.pg.locator(f'[data-foto-ver="principal:{frente["id"]}"]').click()
        ok = c.esperar(lambda: c.tem("[data-visualizar-foto]") and c.pg.locator("[data-visualizar-foto]").get_attribute("data-carregou") == "1", 40)
        tit = c.pg.locator("[data-visualizar-titulo]").inner_text() if ok else ""
        p.check(ok and tit.startswith("Frente"), f"[fotos] VER: a foto grande abre ({tit!r})")
        p.check(c.pg.locator("[data-visualizar-indice]").inner_text() == "1/3" and c.pg.locator("[data-foto-anterior]").is_disabled(), "[fotos] 1/3, sem anterior")
        c.print("fotos_ver")
        c.pg.locator("[data-foto-proxima]").click()
        ok = c.esperar(lambda: c.pg.locator("[data-visualizar-titulo]").inner_text().startswith("Lado"), 20)
        p.check(ok and c.pg.locator("[data-visualizar-indice]").inner_text() == "2/3", "[fotos] PRÓXIMA: o lado (2/3)")
        arq = baixar(c, lambda: c.pg.locator("[data-foto-baixar]").click(), "foto")
        p.check(bool(arq) and arq.stat().st_size > 1000 and "rafael-moura-lado" in arq.name, f"[fotos] BAIXAR: {arq.name if arq else '-'}")
        # Editar (a foto da nutrição): a observação
        c.pg.locator("[data-foto-editar-visualizar]").click()
        ok = c.esperar(lambda: c.tem('[data-modal-foto="editar"]'), 20)
        c.pg.fill("[data-campo-observacao-foto]", "Editado no painel H5")
        c.pg.locator("[data-btn-salvar-foto]").click()
        lado = next(f for f in fotos if f["posicao"] == "lado_d")
        r = B.esperar(lambda: q(f"select observacao from {S}.fotos_evolucao where id = '{lado['id']}' and observacao = 'Editado no painel H5'"), 20)
        p.check(ok and bool(r), "[fotos] EDITAR: a observação da foto gravou")
    finally:
        c.fim()
        for f in fotos:
            q(f"update {S}.fotos_evolucao set observacao = {B.q(f['observacao'])} where id = '{f['id']}'")
    # negativo: o Lucas (personal/dono) vê e baixa, mas não edita a foto da nutrição
    c = painel(nav, "fotos_lucas", "w13-dono", f"/painel/alunos/{raf['id']}/avaliacao")
    try:
        ok = c.esperar(lambda: c.tem("[data-avaliacao-fotos-gerenciar]"), 90)
        if ok:
            c.pg.locator("[data-avaliacao-fotos-gerenciar]").click()
        ok = ok and c.esperar(lambda: c.pg.locator("[data-foto-ver]").count() >= 3, 40)
        p.check(ok and c.pg.locator('[data-foto-editar^="principal:"]').count() == 0, "[fotos] (negativo) o Lucas vê as fotos da nutrição, sem Editar")
    finally:
        c.fim()


# ───────────────────────── prontuário só leitura (item 10) ─────────────────────────

@caso
def caso_prontuario(nav) -> None:
    """O só leitura do clínico (W18): a nutricionista da conta que acompanha o aluno sem ser a nutri responsável (aqui, a 2ª nutri
    como a "personal" de um aluno temporário SEM login — nada no Banco do Treino) vê as seções clínicas só para ler."""
    import uuid
    conta = B.conta_w13()
    camila = B.uid("w13-nutri")
    n2 = B.B18.garantir_nutri2(conta, ativa=True)
    # o caso da W18: a nutricionista da conta que acompanha o aluno como PERSONAL (pode_ver_aluno pede o papel personal)
    q(f"update {S}.conta_membros set papeis = array['personal','nutricionista']::text[] where conta_id = '{conta}' and user_id = '{n2}'")
    pid = None
    caminho = f"{camila}/__h5__/{uuid.uuid4()}-exames-h5.pdf"
    try:
        pid = q(f"""insert into {S}.pacientes (nome, conta_id, nutricionista_id, personal_id, origem, ativo)
                    values ('Aluno Leitura H5', '{conta}', '{camila}', '{n2}', 'novo', true) returning id::text""")[0]["id"]
        caminho = f"{camila}/{pid}/{uuid.uuid4()}-exames-h5.pdf"
        corpo = B.B18.pdf_minimo("Exames H5 - teste do modo so leitura")
        st, r = B.B18.storage(B.token("w13-nutri"), "POST", f"object/{B.bucket_do_ambiente('anexos')}/{caminho}", corpo)
        assert st == 200, ("upload do anexo", st, r)
        q(f"""insert into {S}.anexos (nutricionista_id, paciente_id, nome, path, tamanho, mime, descricao, conta_id)
              values ('{camila}', '{pid}', 'exames-h5.pdf', '{caminho}', {len(corpo)}, 'application/pdf', 'Teste H5', '{conta}')""")
        c = painel(nav, "prontuario_leitura", "w18-nutri2", f"/painel/alunos/{pid}/prontuario?secao=anexos")
        try:
            # o aviso de "membro removido" de uma W antiga (ela foi religada agora) — fecha se aparecer
            if c.esperar(lambda: c.pg.get_by_role("button", name="Entendi").count() > 0, 6):
                c.pg.get_by_role("button", name="Entendi").first.click()
                c.pg.wait_for_timeout(500)
            ok = c.esperar(lambda: c.tem("[data-somente-leitura][data-prontuario-leitura]") and c.pg.locator("[data-btn-baixar-anexo]").count() > 0, 60)
            p.check(ok, "[prontuário] a nutri que não é a responsável abre os Anexos no modo só leitura (o componente novo)")
            p.check(ok and c.pg.locator("[data-btn-baixar-anexo]").first.is_enabled() and c.pg.locator("[data-btn-ver-anexo]").first.is_enabled(),
                    "[prontuário] Ver e Baixar ATIVOS (antes o fieldset desligava os 2)")
            travados = c.pg.locator("[data-somente-leitura] [data-travado-leitura]").count()
            p.check(travados > 0, f"[prontuário] (negativo) os de gravar travados ({travados}: enviar, descrição, excluir)")
            arq = baixar(c, lambda: c.pg.locator("[data-btn-baixar-anexo]").first.click(), "anexo") if ok else None
            p.check(bool(arq) and arq.read_bytes()[:4] == b"%PDF", f"[prontuário] a nutri só leitura BAIXA o anexo ({arq.name if arq else '-'})")
            c.print("prontuario_leitura_anexos")
        finally:
            c.fim()
    finally:
        q(f"delete from {S}.anexos where path = '{caminho}'")
        try:
            B.B18.apagar_arquivos([caminho])
        except AssertionError as e:
            print("   (o arquivo do anexo já não existia)", e)
        if pid:
            q(f"delete from {S}.pacientes where id = '{pid}'")
        B.B18.garantir_nutri2(conta, ativa=False)
        q(f"update {S}.conta_membros set papeis = array['nutricionista']::text[] where conta_id = '{conta}' and user_id = '{n2}'")
        p.check(not q(f"select 1 from {S}.pacientes where nome = 'Aluno Leitura H5'") and
                q(f"select status from {S}.conta_membros where conta_id = '{conta}' and user_id = '{n2}'")[0]["status"] == "removido",
                "[prontuário] limpo: o aluno temporário saiu e a 2ª nutri voltou a 'removida'")


# ───────────────────────── Fluxo de consulta só pra nutri (item 11) ─────────────────────────

@caso
def caso_fluxo(nav) -> None:
    raf = rafael()
    c = painel(nav, "fluxo_nutri", "w13-nutri", f"/painel/alunos/{raf['id']}")
    try:
        ok = c.esperar(lambda: c.pg.locator("[data-card-fluxo-consulta] [data-atalho]").count() == 7, 60)
        p.check(ok, "[fluxo] a nutri (Camila) vê o 'Fluxo de consulta' com os 7 atalhos")
        if ok:
            c.pg.locator("[data-card-fluxo-consulta]").scroll_into_view_if_needed()
        c.print("resumo_fluxo_nutri")
    finally:
        c.fim()
    c = painel(nav, "fluxo_personal", "w13-dono", f"/painel/alunos/{raf['id']}")
    try:
        ok = c.esperar(lambda: c.pg.locator("[data-resumo-aluno] [data-card-dieta], [data-resumo-aluno] [data-card]").count() > 0 or c.tem("[data-resumo-aluno]"), 60)
        c.pg.wait_for_timeout(2500)
        p.check(ok and not c.tem("[data-card-fluxo-consulta]"), "[fluxo] (negativo) o Lucas (dono + personal, sem papel de nutri) não vê o 'Fluxo de consulta'")
        c.print("resumo_fluxo_personal")
    finally:
        c.fim()


# ───────────────────────── textos (item 13) ─────────────────────────

@caso
def caso_textos(nav) -> None:
    raf = rafael()
    c = painel(nav, "textos", "w13-nutri", f"/painel/alunos/{raf['id']}/dieta?secao=orientacoes")
    try:
        ok = c.esperar(lambda: "primeira orientação do aluno" in c.texto(), 60)
        p.check(ok and "do paciente" not in c.texto(), "[textos] Orientações vazia: 'a primeira orientação do aluno' (sem 'paciente')")
        c.ir(f"/painel/alunos/{raf['id']}/prontuario?secao=consultas")
        ok = c.esperar(lambda: c.tem("[data-btn-observacao]") or "Registrar consulta" in c.texto(), 60)
        p.check(ok and "paciente" not in c.texto().lower().replace("pacientes", ""), "[textos] Consultas sem 'paciente' na tela")
    finally:
        c.fim()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8080")
    ap.add_argument("--prefixo", default="local")
    ap.add_argument("--casos", default=",".join(CASOS))
    a = ap.parse_args()
    ESTADO.update(base=a.base.rstrip("/"), prefixo=a.prefixo)
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        for nome in [x.strip() for x in a.casos.split(",") if x.strip()]:
            print(f"\n── {nome} ──", flush=True)
            B.saude_ok(nome)
            try:
                CASOS[nome](nav)
            except SystemExit:
                raise
            except Exception as e:  # noqa: BLE001
                p.check(False, f"{nome}: exceção {type(e).__name__}: {str(e)[:300]}")
            time.sleep(3)
        nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
