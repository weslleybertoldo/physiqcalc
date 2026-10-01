#!/usr/bin/env python3
"""Physiq W24 — E2E das telas do Painel › Dietas (padrão das telas 6 e 8) e do /d/ público (padrão do app, tela 3).

Positivo (Camila, nutricionista da "Consultoria Ferreira W13"):
  alimentos   a TACO (597, só leitura) + os seus; cadastra o "Leite em pó W24" pelo RÓTULO (127 kcal em 26 g — H1) → o banco
              guarda 488,46 kcal/100 g; o Editar mostra de volta 127 em 26 g; salvar sem mexer não muda o gravado; Ver mostra a
              porção de referência; excluir manda para a Lixeira; a TACO nem mostra Editar;
  receitas    nova receita com 2 ingredientes da busca (TACO) e a prévia ao vivo; aparece na lista com kcal/porção; Ver; PDF (marca
              PHYSIQ); grupos;
  diario      as fotos da conta por dia (tela 6 "Diário de hoje"); reage (Ótimo + comentário) e o aluno com login ganha 1 aviso;
              "Só não reagidas", período, aluno; "Copiar link do diário" = o /d/ do Physiq; a foto grande abre;
  publico     o aluno manda a foto pelo /d/ (sem login, celular) → "Foto enviada" e aparece nos últimos 7 dias → a foto aparece no
              Diário da Camila (o pronto-quando da W24); o /p/ antigo cai no /d/;
  app         o Rafael vê a reação no app (Dieta › Foto pro diário) e o aviso no sino;
  resumo      o card "Link do diário" do Resumo do aluno já é o /d/ do Physiq (sem o aviso do site antigo).
Negativo: o /d/ com o diário desligado ("O envio de fotos está desligado pelo seu profissional"), com o envio pelo link desligado e
com código inexistente; o personal (Bruno) e o dono sem papel de nutri (Lucas) só consultam a TACO e não veem o diário; conta só de
Treino não tem Dietas.

Uso: python3 e2e/w24/telas.py --base http://localhost:5173 --prefixo local [--casos alimentos,receitas,diario,publico,app,resumo,negativos]
     (staging: --base https://physiqcalc-staging.vercel.app --prefixo staging). Contexto limpo por caso, painel 1280 × 883 × 2 e
     celular 390 × 844 × 3,4. O que o teste cria é apagado no fim (a massa volta: python3 e2e/w24/massa.py).
"""
from __future__ import annotations

import argparse
import datetime as dt
import subprocess
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
DOWNLOADS = B.SCRATCH / "downloads"
CASOS: dict[str, object] = {}
ESTADO: dict = {}
LEITE = "Leite em pó W24"


def caso(fn):
    CASOS[fn.__name__.replace("caso_", "")] = fn
    return fn


def abrir(nav, nome: str, conta: str, rota: str, desktop: bool = True):
    c = B.Caso(nav, ESTADO["base"], ESTADO["prefixo"], nome, desktop=desktop)
    c.entrar(conta, rota)
    c.fechar_avisos()
    return c


def anonimo(nav, nome: str, rota: str, desktop: bool = False):
    c = B.Caso(nav, ESTADO["base"], ESTADO["prefixo"], nome, desktop=desktop)
    c.ir(rota)
    return c


def fechar_faixa(c) -> None:
    if c.esperar(lambda: c.tem("[data-faixa-mensagens-fechar]"), 3):
        c.pg.locator("[data-faixa-mensagens-fechar]").first.click()
        c.pg.wait_for_timeout(400)


def esperar_aba(c, aba: str, nome: str, timeout: float = 60) -> bool:
    ok = c.esperar(lambda: c.tem(f'[data-pagina-dietas][data-aba-dietas="{aba}"]') and c.pg.locator('[data-carregando="1"]').count() == 0, timeout)
    p.check(ok, f"[{nome}] Painel › Dietas › {aba} abriu (sem carregando)")
    return ok


def camila_uid() -> str:
    return B.uid("w13-nutri")


def leite_db() -> dict | None:
    r = q(f"""select id::text, porcao_g::float p, energia_kcal::float kcal, proteina_g::float prot, carboidrato_g::float carb, lipidio_g::float lip,
                     sodio_mg::float sodio, nutrientes, deleted_at from {S}.alimentos where nutricionista_id = '{camila_uid()}' and nome = {B.q(LEITE)} order by created_at desc limit 1""")
    return r[0] if r else None


def baixar(c, clicar, nome: str) -> Path | None:
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    try:
        with c.pg.expect_download(timeout=60000) as d:
            clicar()
        destino = DOWNLOADS / f"{c.prefixo}_{nome}_{d.value.suggested_filename}"
        d.value.save_as(str(destino))
        return destino
    except Exception as e:  # noqa: BLE001
        print("   download falhou:", e)
        return None


# ───────────────────────── Alimentos (N-16 + H1) ─────────────────────────

@caso
def caso_alimentos(nav) -> None:
    q(f"delete from {S}.alimentos where nutricionista_id = '{camila_uid()}' and nome like '%W24%'")
    B.saude_ok("alimentos (nutricionista)")
    c = abrir(nav, "alimentos", "w13-nutri", "/painel/dietas")
    try:
        fechar_faixa(c)
        if not esperar_aba(c, "alimentos", "alimentos"):
            return
        ok = c.esperar(lambda: c.pg.locator("[data-lista-alimentos] [data-alimento]").count() >= 20, 60)
        total = c.pg.locator("[data-pagina-alimentos]").get_attribute("data-total-alimentos")
        p.check(ok and total == "597", f"[alimentos] a TACO inteira (597) com 20 por vez ({total})")
        p.check(c.pg.locator('[data-alimento][data-fonte="taco"] [data-btn-editar-alimento]').count() == 0, "[alimentos] a TACO é só leitura (nenhum Editar/Excluir)")
        # Novo alimento pelo RÓTULO na porção (H1)
        c.pg.locator("[data-btn-novo-alimento]").click()
        c.esperar(lambda: c.tem('[data-modal-alimento="novo"]'), 15)
        c.pg.locator("[data-campo-nome-alimento]").fill(LEITE)
        c.pg.locator("[data-campo-marca-alimento]").fill("LeiteLac W24")
        c.pg.locator("[data-campo-grupo-alimento]").fill("Leite e derivados")
        c.pg.locator("[data-campo-porcao]").fill("26")
        for sel, v in (("kcal", "127"), ("proteina", "7"), ("carboidrato", "10"), ("lipidio", "7"), ("fibra", "0"), ("sodio", "77")):
            c.pg.locator(f"[data-campo-{sel}]").fill(v)
        c.pg.locator("[data-demais-nutrientes]").click()
        c.pg.locator('[data-campo-nutriente="calcio_mg"]').fill("247")
        c.pg.wait_for_timeout(400)
        leg = c.pg.locator("[data-legenda-valores]").inner_text()
        prev = c.pg.locator("[data-previa-100g]").get_attribute("data-previa-100g")
        p.check(leg.upper() == "VALORES POR PORÇÃO (26 G)" and prev == "488.46", f"[alimentos] H1: com a porção de 26 g os campos são da porção e a prévia mostra 488,46 em 100 g ({leg} · {prev})")
        c.print("tela8_alimento_novo_porcao")
        c.pg.locator("[data-btn-salvar-alimento]").click()
        ok = c.esperar(lambda: leite_db() is not None, 20)
        d = leite_db() or {}
        p.check(ok and d.get("p") == 26 and d.get("kcal") == 488.46 and d.get("prot") == 26.92 and d.get("carb") == 38.46 and d.get("lip") == 26.92 and d.get("sodio") == 296.15
                and (d.get("nutrientes") or {}).get("calcio_mg") == 950, f"[alimentos] H1: o banco guarda o equivalente em 100 g (488,46 kcal · P 26,92 · C 38,46 · L 26,92 · Na 296,15 · Ca 950) — {d}")
        # filtra os seus e abre o Editar: o rótulo volta na porção
        c.pg.locator("[data-filtro-fonte]").select_option("proprio")
        c.esperar(lambda: c.pg.locator('[data-alimento][data-fonte="proprio"]').count() >= 1 and c.pg.locator('[data-alimento][data-fonte="taco"]').count() == 0, 30)
        linha = c.pg.locator(f'[data-alimento="{d.get("id")}"]')
        p.check(linha.locator('[data-alimento-marca="LeiteLac W24"]').count() == 1 and linha.locator("[data-btn-editar-alimento]").count() == 1,
                "[alimentos] 'Meus alimentos': o seu com a marca na etiqueta e Editar/Excluir")
        linha.locator("[data-btn-ver-alimento]").click()
        p.check(c.esperar(lambda: linha.locator('[data-porcao-referencia="26"]').count() == 1, 10), "[alimentos] Ver mostra 'Por porção de referência (26 g)'")
        c.print("tela6_dietas_alimentos")
        linha.locator("[data-btn-editar-alimento]").click()
        c.esperar(lambda: c.tem('[data-modal-alimento="editar"]'), 15)
        kcal = c.pg.locator("[data-campo-kcal]").input_value()
        prot = c.pg.locator("[data-campo-proteina]").input_value()
        ca = c.pg.locator('[data-campo-nutriente="calcio_mg"]').input_value() if c.pg.locator('[data-campo-nutriente="calcio_mg"]').count() else ""
        p.check(kcal == "127" and prot == "7" and ca == "247", f"[alimentos] H1: o Editar mostra o rótulo de volta NA PORÇÃO (127 kcal · P 7 · Ca 247 em 26 g) — {kcal}/{prot}/{ca}")
        c.print("tela8_alimento_editar_porcao")
        antes = leite_db()
        c.pg.locator("[data-btn-salvar-alimento]").click()
        c.esperar(lambda: not c.tem('[data-modal-alimento="editar"]'), 15)
        c.pg.wait_for_timeout(1500)
        depois = leite_db()
        p.check(antes and depois and all(antes[k] == depois[k] for k in ("kcal", "prot", "carb", "lip", "sodio", "nutrientes", "p")),
                "[alimentos] H1: salvar sem mexer NÃO muda o gravado (sem deriva de arredondamento)")
        # excluir: sai da lista e vai para a Lixeira (soft)
        c.pg.locator(f'[data-alimento="{d.get("id")}"] [data-btn-excluir-alimento]').click()
        c.esperar(lambda: c.tem("[data-confirmar-excluir]"), 10)
        c.pg.locator("[data-confirmar-excluir]").click()
        ok = c.esperar(lambda: (leite_db() or {}).get("deleted_at") is not None, 20)
        p.check(ok and c.esperar(lambda: c.pg.locator(f'[data-alimento="{d.get("id")}"]').count() == 0, 15), "[alimentos] Excluir: some da lista e vai para a Lixeira (deleted_at)")
    finally:
        q(f"delete from {S}.alimentos where nutricionista_id = '{camila_uid()}' and nome like '%W24%'")
        c.fim()


# ───────────────────────── Receitas (N-17) ─────────────────────────

def ingrediente(c, k: int, termo: str, nome: str, gramas: str) -> bool:
    li = c.pg.locator(f'[data-ingrediente="{k}"]')
    caixa = li.locator("[data-busca-alimento]").first
    caixa.click()
    caixa.fill(termo)
    alvo = li.locator(f'[data-resultado-alimento]:has([data-resultado-nome]:text-is("{nome}"))').first
    if not c.esperar(lambda: alvo.count() > 0 and alvo.is_visible(), 30):
        return False
    alvo.click()
    c.esperar(lambda: li.locator("[data-campo-gramas-ingrediente]").count() > 0, 10)
    li.locator("[data-campo-gramas-ingrediente]").fill(gramas)
    return True


@caso
def caso_receitas(nav) -> None:
    nome = "Arroz com feijão W24"
    q(f"delete from {S}.receitas where nutricionista_id = '{camila_uid()}' and nome = {B.q(nome)}")
    q(f"delete from {S}.grupos_receita where nutricionista_id = '{camila_uid()}' and nome like '%W24%'")
    B.saude_ok("receitas")
    c = abrir(nav, "receitas", "w13-nutri", "/painel/dietas?aba=receitas")
    try:
        fechar_faixa(c)
        if not esperar_aba(c, "receitas", "receitas"):
            return
        p.check(c.esperar(lambda: c.pg.locator("[data-receita]").count() >= 1, 30), "[receitas] a receita da massa (Bolinho de atum W24) aparece com kcal/porção")
        c.pg.locator("[data-btn-nova-receita]").click()
        c.esperar(lambda: c.tem('[data-modal-receita="nova"]'), 15)
        c.pg.locator("[data-campo-nome-receita]").fill(nome)
        c.pg.locator("[data-campo-porcoes]").fill("2")
        c.pg.locator("[data-campo-tempo]").fill("25")
        ok1 = ingrediente(c, 0, "arroz, integral", "Arroz, integral, cozido", "150")
        c.pg.locator("[data-btn-add-ingrediente]").click()
        ok2 = ingrediente(c, 1, "feijão, carioca, coz", "Feijão, carioca, cozido", "100")
        p.check(ok1 and ok2, "[receitas] 2 ingredientes pela busca (TACO ou os seus) em gramas")
        c.pg.locator("[data-campo-modo-preparo]").fill("## Preparo\n- Aqueça o arroz\n- Junte o feijão por **5 min**")
        c.pg.wait_for_timeout(400)
        kcal_total = float(c.pg.locator("[data-previa-receita]").get_attribute("data-previa-kcal-total") or 0)
        p.check(abs(kcal_total - (1.5 * 123.53 + 76.42)) < 3, f"[receitas] a prévia soma os ingredientes ao vivo ({kcal_total:.1f} kcal na receita inteira)")
        c.print("tela8_receita_nova")
        c.pg.locator("[data-btn-salvar-receita]").click()
        ok = c.esperar(lambda: c.pg.locator(f'[data-receita]:has([data-receita-nome]:text-is("{nome}"))').count() == 1, 30)
        r = q(f"select id::text, (select count(*) from {S}.ingredientes_receita i where i.receita_id = r.id)::int n from {S}.receitas r where nutricionista_id = '{camila_uid()}' and nome = {B.q(nome)}")
        p.check(ok and r and r[0]["n"] == 2, "[receitas] criada: na lista e no banco com os 2 ingredientes")
        linha = c.pg.locator(f'[data-receita]:has([data-receita-nome]:text-is("{nome}"))').first
        porcao = float(linha.get_attribute("data-receita-kcal-porcao") or 0)
        p.check(abs(porcao - kcal_total / 2) < 1, f"[receitas] kcal por porção = total ÷ 2 porções ({porcao:.1f})")
        linha.locator("[data-btn-ver-receita]").click()
        p.check(c.esperar(lambda: c.pg.locator("[data-ver-ingrediente]").count() == 2, 15), "[receitas] Ver: os ingredientes, por porção × receita inteira e o modo de preparo")
        c.pg.keyboard.press("Escape")
        c.pg.wait_for_timeout(500)
        arq = baixar(c, lambda: linha.locator("[data-btn-pdf-receita]").click(), "receita")
        bruto = arq.read_bytes() if arq else b""
        p.check(bool(arq) and bruto[:4] == b"%PDF" and b"PHYSIQ" in bruto and b"PHYSIQNUTRI" not in bruto, f"[receitas] PDF baixado com a marca PHYSIQ ({arq.name if arq else None})")
        # grupos
        c.pg.locator("[data-btn-grupos]").click()
        c.esperar(lambda: c.tem("[data-modal-grupos]"), 10)
        c.pg.locator("[data-campo-novo-grupo]").fill("Almoço W24")
        c.pg.locator("[data-btn-criar-grupo]").click()
        p.check(c.esperar(lambda: c.pg.locator('[data-grupo-nome]:text-is("Almoço W24")').count() == 1, 15), "[receitas] grupo novo criado na janela Grupos")
        c.pg.locator("[data-btn-fechar-grupos]").click()
        c.pg.wait_for_timeout(600)
        c.print("tela6_dietas_receitas")
    finally:
        q(f"delete from {S}.receitas where nutricionista_id = '{camila_uid()}' and nome = {B.q(nome)}")
        q(f"delete from {S}.grupos_receita where nutricionista_id = '{camila_uid()}' and nome like '%W24%'")
        c.fim()


# ───────────────────────── Diário (N-18) ─────────────────────────

def zerar_reacoes_de_hoje(w13: str) -> None:
    q(f"""update {S}.diario_alimentar d set reacao_nutri = null, comentario_nutri = '', reagido_em = null
           from {S}.pacientes p where p.id = d.paciente_id and p.conta_id = '{w13}' and d.data_hora > now() - interval '18 hours'""")
    q(f"delete from {S}.avisos where tipo = 'reacao_diario' and titulo like '%(E2E W24)%'")


@caso
def caso_diario(nav) -> None:
    w13 = B.conta_w13()
    zerar_reacoes_de_hoje(w13)
    raf = B.paciente("Rafael Moura", w13)
    mar = B.paciente("Marina Alves", w13)
    B.saude_ok("diário (nutricionista)")
    c = abrir(nav, "diario", "w13-nutri", "/painel/dietas?aba=diario")
    c.ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=ESTADO["base"])
    try:
        fechar_faixa(c)
        if not esperar_aba(c, "diario", "diario"):
            return
        ok = c.esperar(lambda: c.pg.locator("[data-registro]").count() >= 5 and c.pg.locator("[data-foto]").count() >= 5, 60)
        p.check(ok, f"[diario] as fotos da conta por dia, com a miniatura (URL assinada) — {c.pg.locator('[data-registro]').count()} fotos")
        p.check(c.pg.locator("[data-dia-titulo]").count() >= 2, "[diario] agrupadas por dia (hoje, ontem…)")
        cont = int(c.pg.locator("[data-contador-nao-reagidas]").inner_text() or 0) if c.tem("[data-contador-nao-reagidas]") else 0
        p.check(cont >= 3, f"[diario] o número da aba = as não reagidas dos 7 dias ({cont})")
        # reagir à foto do Rafael (com login → aviso) e à da Marina (sem login)
        avisos_antes = q(f"select count(*)::int n from {S}.avisos where destino_user_id = '{raf['user_id']}' and tipo = 'reacao_diario'")[0]["n"]
        foto_raf = q(f"select id::text from {S}.diario_alimentar where paciente_id = '{raf['id']}' and deleted_at is null order by data_hora desc limit 1")[0]["id"]
        card = c.pg.locator(f'[data-registro="{foto_raf}"]')
        card.locator('[data-btn-reacao="otimo"]').click()
        card.locator("[data-campo-comentario-nutri]").fill("Ótimo café da manhã (E2E W24)")
        card.locator("[data-btn-reagir]").click()
        ok = c.esperar(lambda: c.pg.locator(f'[data-registro="{foto_raf}"][data-reagido="1"]').count() == 1, 20)
        db = q(f"select reacao_nutri, comentario_nutri from {S}.diario_alimentar where id = '{foto_raf}'")[0]
        p.check(ok and db["reacao_nutri"] == "otimo" and db["comentario_nutri"] == "Ótimo café da manhã (E2E W24)", "[diario] reagiu: Ótimo + comentário gravados e o cartão mostra a reação")
        av = q(f"select titulo, link from {S}.avisos where destino_user_id = '{raf['user_id']}' and tipo = 'reacao_diario' order by criado_em desc limit 1")
        n_av = q(f"select count(*)::int n from {S}.avisos where destino_user_id = '{raf['user_id']}' and tipo = 'reacao_diario'")[0]["n"]
        p.check(n_av == avisos_antes + 1 and av and av[0]["link"] == f"/dieta?ver=diario&registro={foto_raf}", f"[diario] 1 aviso no sino do Rafael ({av[0]['titulo'] if av else None})")
        foto_mar = q(f"select id::text from {S}.diario_alimentar where paciente_id = '{mar['id']}' and deleted_at is null order by data_hora desc limit 1")[0]["id"]
        cm = c.pg.locator(f'[data-registro="{foto_mar}"]')
        cm.locator('[data-btn-reacao="atencao"]').click()
        cm.locator("[data-campo-comentario-nutri]").fill("Faltou a salada (E2E W24)")
        cm.locator("[data-btn-reagir]").click()
        p.check(c.esperar(lambda: c.pg.locator(f'[data-registro="{foto_mar}"] [data-reacao-chip]').count() == 1, 20), "[diario] reagiu à foto da Marina (Atenção)")
        c.pg.evaluate("window.scrollTo(0, 0)")
        c.pg.wait_for_timeout(1200)
        c.print("tela6_dietas_diario")
        # filtros
        c.pg.locator("[data-btn-nao-reagidas]").click()
        p.check(c.esperar(lambda: c.pg.locator('[data-registro][data-reagido="1"]').count() == 0 and "nao_reagidas=1" in c.caminho(), 15), "[diario] 'Só não reagidas' esconde as reagidas (na URL)")
        c.pg.locator("[data-btn-nao-reagidas]").click()
        c.pg.locator("[data-campo-aluno]").select_option(raf["id"])
        p.check(c.esperar(lambda: c.pg.locator("[data-registro]").count() >= 1 and c.pg.locator(f'[data-registro]:not([data-registro-paciente="{raf["id"]}"])').count() == 0, 15),
                "[diario] filtro por aluno")
        c.pg.locator("[data-btn-copiar-link]").click()
        c.pg.wait_for_timeout(800)
        copiado = c.pg.evaluate("navigator.clipboard.readText().catch(() => '')")
        p.check(copiado == f"{ESTADO['base'] if ESTADO['prefixo'] == 'local' else ESTADO['site']}/d/{raf['link_codigo']}", f"[diario] 'Copiar link do diário' = o /d/ do Physiq ({copiado})")
        c.pg.get_by_role("radio", name="30 dias").click()
        p.check(c.esperar(lambda: "dias=30" in c.caminho(), 10), "[diario] período de 30 dias (na URL)")
        c.pg.locator(f'[data-registro="{foto_raf}"] [data-btn-ver-foto]').click()
        p.check(c.esperar(lambda: c.pg.locator('[data-modal-ver-foto-diario][data-carregou="1"]').count() == 1, 30), "[diario] a foto grande abre (URL assinada na hora)")
        c.print("tela8_diario_foto")
    finally:
        c.fim()


# ───────────────────────── /d/ público (N-56) e /p/ ─────────────────────────

@caso
def caso_publico(nav) -> None:
    w13 = B.conta_w13()
    raf = B.paciente("Rafael Moura", w13)
    antes = q(f"select count(*)::int n from {S}.diario_alimentar where paciente_id = '{raf['id']}' and deleted_at is null")[0]["n"]
    B.saude_ok("o /d/ público")
    c = anonimo(nav, "publico", f"/d/{raf['link_codigo']}")
    novo = None
    try:
        ok = c.esperar(lambda: c.tem('[data-pagina-diario-publico][data-estado-diario="ok"]') and c.tem("[data-form-diario]"), 45)
        p.check(ok, "[publico] o /d/ do aluno abre SEM login, no celular, com a saudação")
        p.check(c.esperar(lambda: c.pg.locator("[data-registro-publico]").count() >= 1, 20), "[publico] 'Seus últimos 7 dias' com as fotos dele (em texto)")
        c.pg.locator('[data-refeicao="almoco"]').click()
        c.pg.set_input_files("[data-campo-foto]", str(B.FOTOS / "almoco.jpg"))
        c.esperar(lambda: c.tem("[data-previa-foto]"), 10)
        c.pg.locator("[data-campo-comentario]").fill("Almoço pelo link (E2E W24)")
        c.print("app_publico_diario_foto")
        c.pg.locator("[data-btn-enviar]").click()
        ok = c.esperar(lambda: c.tem("[data-envio-ok]"), 60)
        r = q(f"select id::text, refeicao, comentario from {S}.diario_alimentar where paciente_id = '{raf['id']}' and comentario = 'Almoço pelo link (E2E W24)' and deleted_at is null")
        novo = r[0]["id"] if r else None
        p.check(ok and bool(novo) and r[0]["refeicao"] == "almoco", "[publico] 'Foto enviada' e a linha gravada (bucket + diario_enviar, sem login)")
        p.check(c.esperar(lambda: c.pg.locator(f'[data-registro-publico="{novo}"]').count() == 1, 20), "[publico] a foto nova aparece nos últimos 7 dias do link")
        c.print("app_publico_diario")
        # /p/ antigo → /d/ do Physiq
        c.ir(f"/p/{raf['link_codigo']}")
        p.check(c.esperar(lambda: c.caminho().startswith(f"/d/{raf['link_codigo']}") and c.tem("[data-form-diario]"), 30), "[publico] o /p/ antigo abre o /d/ do Physiq")
    finally:
        c.fim()
    # o pronto-quando: a foto enviada pelo /d/ aparece no Diário da nutri
    if novo:
        n = abrir(nav, "publico_na_nutri", "w13-nutri", f"/painel/dietas?aba=diario&aluno={raf['id']}")
        try:
            fechar_faixa(n)
            p.check(n.esperar(lambda: n.pg.locator(f'[data-registro="{novo}"] [data-foto]').count() == 1, 60),
                    "[publico] a foto enviada pelo /d/ aparece no Diário da nutri (com a miniatura)")
            n.print("tela6_diario_foto_do_link")
        finally:
            n.fim()
            fotos = q(f"select path from {S}.diario_alimentar where id = '{novo}'")
            q(f"delete from {S}.diario_alimentar where id = '{novo}'")
            B.apagar_fotos([f["path"] for f in fotos])
    depois = q(f"select count(*)::int n from {S}.diario_alimentar where paciente_id = '{raf['id']}' and deleted_at is null")[0]["n"]
    p.check(depois == antes, f"[publico] a foto do teste foi apagada ({antes} = {depois})")


@caso
def caso_publico_negativos(nav) -> None:
    w24 = B.conta_w24()
    ana = B.paciente("Ana Clara W24", w24)
    try:
        q(f"update {S}.pacientes set config = config || '{{\"diario_alimentar\": false}}'::jsonb where id = '{ana['id']}'")
        c = anonimo(nav, "publico_desligado", f"/d/{ana['link_codigo']}")
        try:
            ok = c.esperar(lambda: c.tem('[data-diario-recusado="diario_desligado"]'), 45)
            p.check(ok and "O envio de fotos está desligado pelo seu profissional." in c.texto() and not c.tem("[data-form-diario]"),
                    "[negativo] diário desligado: 'O envio de fotos está desligado pelo seu profissional' e nada de formulário")
            c.print("app_publico_desligado")
            q(f"update {S}.pacientes set config = (config - 'diario_alimentar') || '{{\"acesso_link\": false}}'::jsonb where id = '{ana['id']}'")
            c.ir(f"/d/{ana['link_codigo']}")
            p.check(c.esperar(lambda: c.tem('[data-diario-recusado="link_desligado"]'), 45) and not c.tem("[data-form-diario]"),
                    "[negativo] envio pelo link desligado: o link não aceita (e diz que o app continua)")
            c.ir("/d/naoexiste99")
            p.check(c.esperar(lambda: c.tem("[data-diario-nao-encontrado]"), 45) and "Ana" not in c.texto(), "[negativo] código inexistente: 'Link não encontrado' sem dado de ninguém")
        finally:
            c.fim()
    finally:
        q(f"update {S}.pacientes set config = config - 'acesso_link' - 'diario_alimentar' where id = '{ana['id']}'")


# ───────────────────────── o app do aluno vê a reação ─────────────────────────

@caso
def caso_app(nav) -> None:
    w13 = B.conta_w13()
    raf = B.paciente("Rafael Moura", w13)
    reagida = q(f"select id::text from {S}.diario_alimentar where paciente_id = '{raf['id']}' and deleted_at is null and reacao_nutri is not null order by data_hora desc limit 1")
    if not reagida:
        p.check(False, "[app] o Rafael não tem foto reagida (rode o caso diario antes)")
        return
    B.saude_ok("o app do aluno")
    c = abrir(nav, "app", "w13-aluno", "/dieta?ver=diario", desktop=False)
    try:
        ok = c.esperar(lambda: c.tem("[data-folha-diario]") and c.pg.locator(f'[data-diario-registro="{reagida[0]["id"]}"] [data-diario-reacao-texto]').count() == 1, 90)
        txt = c.pg.locator(f'[data-diario-registro="{reagida[0]["id"]}"] [data-diario-reacao-texto]').first.inner_text() if ok else ""
        p.check(ok and txt.strip() != "" and "aguardando" not in txt.lower(), f"[app] Dieta › Foto pro diário: o aluno vê a reação da nutri ({txt.strip()[:60]})")
        if ok:
            c.pg.locator(f'[data-diario-registro="{reagida[0]["id"]}"]').scroll_into_view_if_needed()
            c.esperar(lambda: c.pg.locator("[data-sonner-toast]").count() == 0, 12)
        c.print("app_dieta_reacao")
    finally:
        c.fim()


# ───────────────────────── o card do Resumo ─────────────────────────

@caso
def caso_resumo(nav) -> None:
    w13 = B.conta_w13()
    r = B.rafael(w13)
    rota = r["treino_user_id"] or r["id"]
    cod = B.paciente("Rafael Moura", w13)["link_codigo"]
    c = abrir(nav, "resumo", "w13-nutri", f"/painel/alunos/{rota}")
    try:
        fechar_faixa(c)
        ok = c.esperar(lambda: c.tem(f'[data-card-link-diario="{cod}"]'), 60)
        link = c.pg.locator("[data-link-diario]").first.get_attribute("data-link-diario") if ok else ""
        esperado = f"{ESTADO['base'] if ESTADO['prefixo'] == 'local' else ESTADO['site']}/d/{cod}"
        p.check(ok and link == esperado and not c.tem("[data-link-site-antigo]"), f"[resumo] o card 'Link do diário' já é o /d/ do Physiq, sem o aviso do site antigo ({link})")
    finally:
        c.fim()


# ───────────────────────── negativos de quem não é nutri ─────────────────────────

@caso
def caso_negativos(nav) -> None:
    for conta, quem in (("w13-personal2", "personal (Bruno)"), ("w13-dono", "dono sem papel de nutri (Lucas)")):
        B.saude_ok(f"negativos — {quem}")
        c = abrir(nav, f"neg_{conta}", conta, "/painel/dietas")
        try:
            fechar_faixa(c)
            ok = c.esperar(lambda: c.tem('[data-pagina-dietas][data-sou-nutri="0"]') and c.pg.locator("[data-lista-alimentos] [data-alimento]").count() > 0, 60)
            p.check(ok and not c.tem("[data-btn-novo-alimento]") and c.pg.locator("[data-btn-editar-alimento]").count() == 0,
                    f"[negativo] {quem}: Alimentos só para consulta (sem Novo/Editar)")
            c.pg.locator('[data-aba-dietas-botao="diario"]').click()
            p.check(c.esperar(lambda: "O diário alimentar é da nutricionista" in c.texto() and c.pg.locator("[data-registro]").count() == 0, 30),
                    f"[negativo] {quem}: o Diário diz que é da nutricionista e não mostra foto")
            if conta == "w13-personal2":
                c.print("tela6_dietas_personal")
        finally:
            c.fim()
        B.pausa(2)
    # conta só de Treino: não tem Dietas no menu
    c = abrir(nav, "neg_treino", "prof1", "/painel/alunos")
    try:
        ok = c.esperar(lambda: c.tem("[data-casca='painel']") and c.pg.locator("a[href='/painel/alunos']").count() > 0, 60)
        c.pg.wait_for_timeout(3000)
        p.check(ok and c.pg.locator('a[href="/painel/dietas"]').count() == 0, "[negativo] conta só de Treino (prof1): nada de Dietas no menu")
    finally:
        c.fim()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--casos", default=",".join(CASOS))
    a = ap.parse_args()
    ESTADO.update(base=a.base.rstrip("/"), prefixo=a.prefixo, site="https://physiqcalc-staging.vercel.app")
    subprocess.run([sys.executable, str(Path(__file__).parent / "massa.py")], check=True, stdout=subprocess.DEVNULL)
    t0 = time.time()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        for nome in [x.strip() for x in a.casos.split(",") if x.strip()]:
            print(f"\n══ caso {nome}", flush=True)
            try:
                CASOS[nome](nav)  # type: ignore[operator]
            except Exception as e:  # noqa: BLE001
                p.check(False, f"[{nome}] exceção: {str(e)[:300]}")
            B.pausa(2)
        nav.close()
    print(f"\nW24 · telas ({a.prefixo}) · {time.time() - t0:.0f}s")
    sys.exit(p.fim())
