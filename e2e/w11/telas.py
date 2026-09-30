#!/usr/bin/env python3
"""Physiq W11 — E2E da aba Dieta nova (tela 3), em contexto limpo, com as contas de teste do staging (P26). Casos em SÉRIE, com o
/health do Banco do Treino antes de cada um (a VM Nano trava com carga — lento ou UNHEALTHY: para, sem restart).

  dieta         Diego (Camila): plano do dia com as refeições que valem hoje (NF3), ✓ pela MESMA função do site antigo (Feito
                → próxima), kcal e macros MARCADOS (NF5) iguais à conta do plano, foto pro diário (P29 na refeição), substitutos,
                orientações (+ PDF), metas com ✓ (NF4, + PDF), PDF do plano e outro dia no calendário — prints dieta_*;
  sem_internet  sem conexão: "A dieta aparece quando a internet voltar" e volta sozinha;
  virada        relógio simulado: 23:59 em São Paulo com o ✓ → 00:00 o ✓ zera (dia seguinte) e o de ontem fica guardado no banco;
  so_nutricao   Paula Lima (só Nutrição, sem plano): entra no app sem a trava da W3 — Dieta · Evolução · Perfil — e a Evolução aparece;
  dia_sem_refeicao  Paula Nutri: plano só de outros dias da semana;
  pratos        aluno do app no Treino + Alimentação: os pratos prontos na aba Dieta; Perfil › Alimentação vira atalho;
  rotas         os links antigos /app/plano, /app/orientacoes, /app/metas e /app/diario do Nutri;
  nutri_antigo  lado a lado com o site antigo do Nutri (conta 'paciente'): o mesmo plano (refeições, alimentos, kcal), o ✓ do
                Physiq aparece lá e o de lá aparece aqui, as mesmas orientações e metas e a foto do diário.
Uso: python3 e2e/w11/telas.py --base http://localhost:5173 --prefixo local [--casos dieta,virada] [--nutri https://physiqnutri-staging.vercel.app]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402
import massa as M  # noqa: E402

p = B.p
CASOS: dict = {}
ESTADO: dict = {}
FUSO = dt.timezone(dt.timedelta(hours=-3))


def caso(f):
    CASOS[f.__name__.removeprefix("caso_")] = f
    return f


def attr(c, seletor: str, nome: str) -> str | None:
    try:
        loc = c.pg.locator(seletor).first
        return loc.get_attribute(nome, timeout=2000) if loc.count() else None
    except Exception:  # noqa: BLE001
        return None


def txt(c, seletor: str) -> str:
    try:
        loc = c.pg.locator(seletor).first
        return loc.inner_text(timeout=2000).strip() if loc.count() else ""
    except Exception:  # noqa: BLE001
        return ""


def estado_ref(c, rid: str) -> str | None:
    return attr(c, f'[data-refeicao="{rid}"]', "data-refeicao-estado")


def contagem(c) -> str:
    return txt(c, "[data-refeicoes-contagem]")


def foto(c, nome: str) -> str:
    """Print sem os avisos (toasts) por cima: tira o ponteiro de cima deles (o sonner pausa com o mouse em cima) e espera sumirem."""
    try:
        c.pg.mouse.move(5, 5)
    except Exception:  # noqa: BLE001
        pass
    c.esperar(lambda: c.pg.locator("[data-sonner-toast]").count() == 0, 12)
    return c.print(nome)


def fechar_folha(c) -> None:
    c.pg.keyboard.press("Escape")
    c.esperar(lambda: not c.tem("[data-painel]"), 10)
    c.pg.wait_for_timeout(400)


def baixou_pdf(c, seletor: str, prefixo_nome: str) -> bool:
    """Clica no botão do PDF e confere o arquivo baixado (nome e o começo %PDF)."""
    try:
        with c.pg.expect_download(timeout=30000) as info:
            c.pg.locator(seletor).first.click()
        d = info.value
        destino = B.SCRATCH / "pdfs" / f"{ESTADO['prefixo']}_{d.suggested_filename}"
        destino.parent.mkdir(parents=True, exist_ok=True)
        d.save_as(str(destino))
        ok = d.suggested_filename.startswith(prefixo_nome) and destino.read_bytes()[:4] == b"%PDF" and destino.stat().st_size > 1500
        print(f"   PDF: {d.suggested_filename} ({destino.stat().st_size} bytes)", flush=True)
        return ok
    except Exception as e:  # noqa: BLE001
        print(f"   PDF falhou: {e}", flush=True)
        return False


# ───────────── a conta do plano, em Python (a mesma do dietaUtil/numeros — a tela tem que bater com ela) ─────────────
def arred(n: float, casas: int = 2) -> float:
    return round(n * 10 ** casas + 1e-9) / 10 ** casas if n >= 0 else -round(-n * 10 ** casas) / 10 ** casas


def gramas_item(i: dict) -> float:
    med = next((m for m in (i["alimento"] or {}).get("medidas_caseiras") or [] if m["id"] == i.get("medida_caseira_id")), None)
    if med and i.get("quantidade_medida"):
        return arred(float(i["quantidade_medida"]) * float(med["gramas"]))
    return arred(float(i["quantidade_g"]))


def macros_item(i: dict, chave: str) -> float:
    v = (i["alimento"] or {}).get(chave)
    return 0.0 if v is None else arred(float(v) * gramas_item(i) / 100)


def total(refeicoes: list[dict], chave: str) -> float:
    return arred(sum(macros_item(i, chave) for r in refeicoes for i in r["itens"]))


def do_dia(plano: dict, dia: str) -> list[dict]:
    dow = dt.date.fromisoformat(dia).isoweekday()
    return [r for r in plano["refeicoes"] if not r["dias_semana"] or dow in r["dias_semana"]]


def fmt_kcal(n: float) -> str:
    return f"{round(n):,}".replace(",", ".")


def dados(conta: str, dia: str) -> dict:
    st, d = B.rpc(conta, "minha_dieta", {"p_dia": dia})
    assert st == 200, (st, d)
    return d


def plano_atual(d: dict) -> dict:
    planos = sorted(d["planos"], key=lambda x: x["created_at"], reverse=True)
    return next((x for x in planos if x["favorito"]), planos[0])


# ───────────── casos ─────────────
@caso
def caso_dieta(nav, base: str, prefixo: str) -> None:
    hoje = M.HOJE.isoformat()
    diego = M.matricula_de(B.EMAIL["w10-aluno"])
    M.limpar([diego["id"]])
    d = dados("w10-aluno", hoje)
    pl = plano_atual(d)
    refs = [r for r in do_dia(pl, hoje) if r["itens"]]
    ids = {r["nome"]: r["id"] for r in pl["refeicoes"]}
    cafe, lanche_m, almoco, lanche_t, jantar = (ids[n] for n in ["Café da manhã", "Lanche da manhã", "Almoço", "Lanche da tarde", "Jantar"])
    c = B.abrir(nav, base, prefixo, "dieta", "w10-aluno")
    try:
        ok = c.esperar(lambda: c.tem('[data-aba-dieta="plano"]') and contagem(c) == "0 de 5", 60)
        p.check(ok, f"[dieta] o plano do dia: 5 refeições com alimento hoje, nenhuma marcada ({contagem(c)})")
        p.check(c.pg.locator("[data-refeicao]").count() == 5 and not c.tem(f'[data-refeicao="{ids["Ceia"]}"]'),
                "[dieta] a Ceia (só em outros 2 dias da semana — NF3) não aparece hoje")
        p.check(txt(c, "[data-plano-autor]").startswith("Plano de Camila Rocha · atualizado em"), f"[dieta] autor do plano ({txt(c, '[data-plano-autor]')})")
        esperado = total(refs, "energia_kcal")
        p.check(txt(c, "[data-kcal-do-dia]") == f"de {fmt_kcal(esperado)} kcal", f"[dieta] kcal do dia = a conta do plano ({txt(c, '[data-kcal-do-dia]')} × {fmt_kcal(esperado)})")
        p.check(estado_ref(c, cafe) == "agora" and txt(c, f'[data-refeicao="{cafe}"] [data-refeicao-linha]').startswith("07:00 · Ovo cozido · Aveia"),
                f"[dieta] a próxima (café) tem o 'Feito'; linha {txt(c, f'[data-refeicao={chr(34)}{cafe}{chr(34)}] [data-refeicao-linha]')!r}")
        # ✓ pela MESMA função do site antigo: café, lanche da manhã e almoço (o "Feito" anda para a próxima)
        for rid, n in [(cafe, 1), (lanche_m, 2), (almoco, 3)]:
            c.pg.locator(f'[data-refeicao="{rid}"] [data-refeicao-marcar="feito"]').click()
            p.check(c.esperar(lambda: contagem(c) == f"{n} de 5" and estado_ref(c, rid) == "feita", 20), f"[dieta] Feito → {n} de 5")
        linhas = B.sql_principal(f"select refeicao_id::text as r from staging.refeicoes_concluidas where paciente_id = '{diego['id']}' and data = '{hoje}' order by r")
        p.check(sorted(x["r"] for x in linhas) == sorted([cafe, lanche_m, almoco]), f"[dieta] 3 linhas no banco (refeicoes_concluidas, dia {hoje})")
        feitas = [r for r in refs if r["id"] in (cafe, lanche_m, almoco)]
        marc_kcal, marc_p, tot_p = total(feitas, "energia_kcal"), total(feitas, "proteina_g"), total(refs, "proteina_g")
        p.check(attr(c, "[data-kcal-marcadas]", "data-kcal-marcadas") == str(round(marc_kcal)), f"[dieta] kcal marcadas (NF5) = {round(marc_kcal)}")
        p.check(attr(c, '[data-macro="proteina_g"]', "data-macro-marcado") == str(round(marc_p)) and attr(c, '[data-macro="proteina_g"]', "data-macro-total") == str(round(tot_p)),
                f"[dieta] proteína marcada / do dia = {round(marc_p)} / {round(tot_p)} g")
        p.check(estado_ref(c, lanche_t) == "agora" and estado_ref(c, jantar) == "pendente", "[dieta] 'Feito' no lanche da tarde; jantar pendente (tela 3)")

        # foto pro diário (N-52) do lanche da manhã (a maçã) → vira a foto do lanche (P29, como a maçã da tela 3)
        c.pg.locator("[data-abrir-diario]").click()
        p.check(c.esperar(lambda: c.tem("[data-form-diario]"), 20), "[diario] a folha 'Foto pro diário' abre (?ver=diario)")
        p.check("ver=diario" in c.caminho(), f"[diario] endereço {c.caminho()}")
        c.pg.locator('[data-diario-refeicao="lanche_manha"]').click()
        c.pg.set_input_files("[data-diario-arquivo]", str(B.FOTOS / "maca.jpg"))
        p.check(c.esperar(lambda: c.tem("[data-diario-previa]"), 10), "[diario] prévia da foto")
        c.pg.fill("[data-diario-comentario]", "1 maçã e o whey, como no plano")
        c.pg.locator("[data-diario-enviar]").click()
        ok = c.esperar(lambda: c.pg.locator("[data-diario-registro]").count() == 1 and c.tem("[data-diario-miniatura]"), 40)
        p.check(ok, "[diario] enviada: aparece nos últimos 7 dias com a própria foto e 'aguardando a nutricionista'")
        p.check("aguardando a nutricionista" in txt(c, "[data-diario-lista]") and "Lanche da manhã" in txt(c, "[data-diario-lista]"), "[diario] texto do registro")
        c.esperar(lambda: c.pg.locator("[data-sonner-toast]").count() == 0, 12)
        c.pg.locator("[data-diario-registro]").first.scroll_into_view_if_needed()
        foto(c, "dieta_diario_foto")
        reg = B.sql_principal(f"select refeicao, comentario, path from staging.diario_alimentar where paciente_id = '{diego['id']}' and deleted_at is null")
        p.check(len(reg) == 1 and reg[0]["refeicao"] == "lanche_manha" and reg[0]["path"].startswith(f"{diego['nutri']}/{diego['id']}/"),
                f"[diario] 1 registro no banco, na pasta da nutricionista/aluno ({reg[:1]})")
        fechar_folha(c)
        ok = c.esperar(lambda: attr(c, f'[data-refeicao="{lanche_m}"] [data-refeicao-foto]', "data-refeicao-foto") == "diario", 30)
        p.check(ok, "[dieta] P29: a foto do diário de hoje virou a foto do lanche da manhã")
        c.pg.wait_for_timeout(1200)
        foto(c, "dieta")

        # ✓ feito (o lanche da tarde) e desfazer
        c.pg.locator(f'[data-refeicao="{lanche_t}"] [data-refeicao-marcar="feito"]').click()
        p.check(c.esperar(lambda: contagem(c) == "4 de 5" and estado_ref(c, jantar) == "agora", 20), "[marcada] lanche da tarde feito → 4 de 5; o jantar ganha o 'Feito'")
        foto(c, "dieta_marcada")
        c.pg.locator(f'[data-refeicao="{lanche_t}"] [data-refeicao-marcar="desmarcar"]').click()
        p.check(c.esperar(lambda: contagem(c) == "3 de 5" and estado_ref(c, lanche_t) == "agora", 20), "[marcada] tocar no ✓ desfaz → 3 de 5")
        n = B.sql_principal(f"select count(*)::int as n from staging.refeicoes_concluidas where paciente_id = '{diego['id']}' and data = '{hoje}'")[0]["n"]
        p.check(n == 3, f"[marcada] desfazer apagou a linha no banco ({n})")

        # substitutos (folha da refeição)
        c.pg.locator(f'[data-refeicao="{almoco}"] [data-refeicao-abrir]').click()
        ok = c.esperar(lambda: c.tem(f'[data-folha-refeicao="{almoco}"]'), 15)
        subs = txt(c, f'[data-folha-refeicao="{almoco}"] [data-item-substitutos]')
        p.check(ok and "Merluza, filé, assado" in subs, f"[substitutos] folha do almoço com os substitutos ({subs[:70]!r})")
        p.check(re.search(r"ou [\d,]+ g de Batata, doce, cozida", txt(c, f'[data-folha-refeicao="{almoco}"]')) is not None, "[substitutos] arroz ↔ batata-doce em gramas")
        p.check(attr(c, "[data-folha-marcar]", "data-folha-marcar") == "desmarcar", "[substitutos] almoço feito: a folha oferece 'Desmarcar'")
        foto(c, "dieta_substitutos")
        fechar_folha(c)

        # orientações (+ PDF)
        c.pg.locator("[data-abrir-orientacoes]").click()
        ok = c.esperar(lambda: c.tem("[data-folha-orientacoes]"), 15)
        p.check(ok and c.pg.locator("[data-orientacao]").count() == 2, "[orientacoes] as 2 orientações (a mais nova primeiro)")
        p.check(txt(c, "[data-orientacao-titulo]") == "Treino e alimentação" and c.pg.locator("[data-folha-orientacoes] strong").count() >= 2,
                "[orientacoes] markdown com negrito e listas")
        foto(c, "dieta_orientacoes")
        p.check(baixou_pdf(c, "[data-orientacao-pdf]", "orientacoes-diego-almeida-"), "[orientacoes] PDF da orientação")
        fechar_folha(c)

        # metas (NF4, + PDF)
        c.pg.locator("[data-abrir-metas]").click()
        ok = c.esperar(lambda: c.tem("[data-folha-metas]"), 15)
        p.check(ok and attr(c, "[data-folha-metas]", "data-metas-hoje") == "3", f"[metas] 3 metas de hoje ({attr(c, '[data-folha-metas]', 'data-metas-hoje')})")
        agua, dormir = M.u("meta:diego:Beber 2,5 litros de água"), M.u("meta:diego:Dormir de 7 a 8 horas")
        for mid, n in [(agua, 1), (dormir, 2)]:
            c.pg.locator(f'[data-meta="{mid}"]').click()
            p.check(c.esperar(lambda: attr(c, f'[data-meta="{mid}"]', "data-meta-feita") == "1" and txt(c, "[data-metas-progresso]") == f"{n} de 3", 20),
                    f"[metas] ✓ → {n} de 3")
        p.check(c.tem("[data-metas-outras]") and c.tem("[data-metas-pausadas]"), "[metas] 'Outros dias' e '1 pausada' recolhida")
        linhas = B.sql_principal(f"select meta_id::text as m from staging.metas_concluidas where paciente_id = '{diego['id']}' and data = '{hoje}'")
        p.check(sorted(x["m"] for x in linhas) == sorted([agua, dormir]), "[metas] 2 linhas em metas_concluidas (aluno_marcar_meta)")
        foto(c, "dieta_metas")
        p.check(baixou_pdf(c, "[data-metas-pdf]", "metas-diego-almeida-"), "[metas] PDF das metas ativas")
        fechar_folha(c)

        # plano: PDF e planos anteriores
        c.pg.locator("[data-cartao-plano]").click()
        ok = c.esperar(lambda: c.tem("[data-folha-plano]"), 15)
        p.check(ok and "Plano de adaptação" in txt(c, "[data-outros-planos]"), "[plano] folha do plano com o plano anterior")
        foto(c, "dieta_plano")
        p.check(baixou_pdf(c, "[data-plano-pdf]", "plano-alimentar-diego-almeida-"), "[plano] PDF do plano")
        fechar_folha(c)

        # outro dia (NF3): o dia da Ceia
        dia_ceia = next(M.HOJE + dt.timedelta(days=k) for k in range(1, 8) if (M.HOJE + dt.timedelta(days=k)).isoweekday() == M.dia(2))
        semana = [M.HOJE + dt.timedelta(days=k - M.HOJE.isoweekday() + 1) for k in range(7)]
        if dia_ceia in semana:
            c.pg.locator("[data-abrir-dia]").click()
            c.esperar(lambda: c.tem("[data-folha-dias]"), 15)
            c.pg.locator(f'[data-dia="{dia_ceia.isoformat()}"]').click()
            ok = c.esperar(lambda: c.pg.locator("[data-refeicao]").count() == 6 and c.tem(f'[data-refeicao="{ids["Ceia"]}"]'), 15)
            p.check(ok, f"[dia] {dia_ceia}: 6 refeições com a Ceia; {txt(c, '[data-refeicoes-titulo]')!r}")
            p.check(estado_ref(c, cafe) == "leitura" and not c.tem('[data-refeicao-marcar="feito"]'), "[dia] outro dia é só para ver (sem ✓)")
            foto(c, "dieta_outro_dia")
            c.pg.locator("[data-voltar-hoje]").click()
            p.check(c.esperar(lambda: txt(c, "[data-refeicoes-titulo]") == "Refeições de hoje" and contagem(c) == "3 de 5", 15), "[dia] voltar para hoje")
        else:
            print(f"   (o dia da Ceia, {dia_ceia}, cai na semana seguinte — calendário conferido no teste de unidade)")
    finally:
        c.fim()


@caso
def caso_sem_internet(nav, base: str, prefixo: str) -> None:
    c = B.Caso(nav, base, prefixo, "sem_internet", desktop=False)
    try:
        c.pg.route("**/rpc/minha_dieta", lambda r: r.abort("internetdisconnected"))
        c.entrar("w10-aluno", "/dieta", zerar=True)
        c.fechar_avisos()
        # o arquivo da aba tem que estar no aparelho antes de cair a rede (no APK ele vem no pacote; no site, o service worker
        # guarda — aqui o service worker está desligado de propósito)
        c.esperar(lambda: c.tem("[data-aba-dieta]"), 60)
        c.ctx.set_offline(True)
        ok = c.esperar(lambda: c.tem('[data-aba-dieta="sem-internet"]'), 60)
        p.check(ok and "A dieta aparece quando a internet voltar." in c.texto(), "[sem_internet] 'A dieta aparece quando a internet voltar.'")
        foto(c, "dieta_sem_internet")
        c.pg.unroute("**/rpc/minha_dieta")
        c.ctx.set_offline(False)
        ok = c.esperar(lambda: c.tem('[data-aba-dieta="plano"]'), 60)
        p.check(ok, "[sem_internet] a internet voltou: a dieta aparece sozinha")
    finally:
        c.ctx.set_offline(False)
        c.fim()


def entrar_com_relogio(nav, base: str, prefixo: str, nome: str, conta: str, instante: dt.datetime):
    """Contexto com o relógio do aparelho fixo em `instante` (a sessão guardada com o vencimento no mesmo relógio)."""
    c = B.Caso(nav, base, prefixo, nome, desktop=False)
    c.pg.clock.set_fixed_time(instante)
    sess = B.sessao(conta)
    sess["expires_at"] = int(instante.timestamp()) + 3500
    c.pg.goto(base + "/privacidade", wait_until="domcontentloaded")
    c.pg.evaluate("""([k, v]) => { localStorage.setItem(k, v); localStorage.setItem('physiq_pendencia_avisada_em', new Date().toLocaleDateString('pt-BR'));
        localStorage.setItem('physiqcalc-pwa-dismissed', 'true'); }""", [B5_CHAVE, json.dumps(sess)])
    c.pg.goto(base + "/dieta", wait_until="domcontentloaded")
    c.fechar_avisos()
    return c


B5_CHAVE = B.B5.CHAVE_PRINCIPAL


@caso
def caso_virada(nav, base: str, prefixo: str) -> None:
    """O ✓ zera no dia seguinte no fuso de São Paulo (relógio simulado no aparelho; o banco guarda o ✓ por dia)."""
    hoje, amanha = M.HOJE, M.HOJE + dt.timedelta(days=1)
    pac = M.matricula_de(B.EMAIL["paciente"])
    M.limpar([pac["id"]])
    almoco = M.u("refeicao:paciente:Almoço")
    st, r = B.rpc("paciente", "paciente_marcar_refeicao", {"p_refeicao_id": almoco, "p_data": hoje.isoformat(), "p_concluida": True})
    p.check(st == 200 and r is True, "[virada] almoço marcado hoje (pela função, como o app)")
    antes = dt.datetime.combine(hoje, dt.time(23, 59, 40), FUSO)
    depois = dt.datetime.combine(amanha, dt.time(0, 0, 20), FUSO)
    c = entrar_com_relogio(nav, base, prefixo, "virada", "paciente", antes)
    try:
        ok = c.esperar(lambda: c.tem('[data-aba-dieta="plano"]') and contagem(c) == "1 de 4", 60)
        p.check(ok, f"[virada] 23:59:40 em SP: o almoço está marcado ({contagem(c)})")
        p.check(estado_ref(c, almoco) == "feita" and attr(c, "[data-aba-dieta]", "data-dieta-hoje") == hoje.isoformat(), "[virada] dia de hoje")
        foto(c, "dieta_virada_antes")
        c.pg.clock.set_fixed_time(depois)
        c.pg.evaluate("() => window.dispatchEvent(new Event('focus'))")
        ok = c.esperar(lambda: attr(c, "[data-aba-dieta]", "data-dieta-hoje") == amanha.isoformat() and contagem(c) == "0 de 4", 40)
        p.check(ok, f"[virada] 00:00:20 em SP: o dia virou e o ✓ zerou ({contagem(c)}, hoje = {attr(c, '[data-aba-dieta]', 'data-dieta-hoje')})")
        p.check(estado_ref(c, almoco) != "feita", "[virada] o almoço volta a ficar por marcar")
        foto(c, "dieta_virada")
    finally:
        c.fim()
    guardado = B.sql_principal(f"select data::text as d from staging.refeicoes_concluidas where refeicao_id = '{almoco}' order by data")
    p.check(guardado == [{"d": hoje.isoformat()}], f"[virada] no banco o ✓ fica no dia dele ({guardado}) — nada apagado, nada no dia seguinte")
    # um aparelho aberto direto no dia seguinte também vem zerado
    c2 = entrar_com_relogio(nav, base, prefixo, "virada_direto", "paciente", depois)
    try:
        ok = c2.esperar(lambda: c2.tem('[data-aba-dieta="plano"]') and contagem(c2) == "0 de 4", 60)
        p.check(ok, "[virada] abrindo já no dia seguinte: 0 de 4")
    finally:
        c2.fim()
    M.limpar([pac["id"]])


@caso
def caso_so_nutricao(nav, base: str, prefixo: str) -> None:
    c = B.abrir(nav, base, prefixo, "so_nutricao", "w10-paciente", rota="/")
    try:
        ok = c.esperar(lambda: c.caminho().startswith("/dieta") and c.tem('[data-aba-dieta="sem-plano"]'), 60)
        p.check(ok, f"[so_nutricao] a aluna só de Nutrição entra no app e abre na Dieta ({c.caminho()})")
        abas = c.pg.evaluate("() => [...document.querySelectorAll('[data-tabbar] [data-aba]')].map(e => e.getAttribute('data-aba'))")
        p.check(abas == ["dieta", "evolucao", "perfil"], f"[so_nutricao] as 3 abas: Dieta · Evolução · Perfil ({abas})")
        p.check(not c.tem('[data-trava-app="use-o-nutri"]') and "continua no PhysiqNutri" not in c.texto(), "[so_nutricao] sem a trava da W3")
        p.check("Nenhum plano alimentar ainda" in c.texto() and c.tem("[data-abrir-diario]") and c.tem("[data-abrir-metas]"),
                "[so_nutricao] sem plano: o vazio, com diário e metas")
        foto(c, "so_nutricao_abas")
        c.pg.locator('[data-tabbar] [data-aba="evolucao"]').click()
        ok = c.esperar(lambda: c.tem('[data-aba-evolucao="dados"]'), 60)
        p.check(ok, "[so_nutricao] a Evolução dela aparece (a antropometria da nutricionista, W10)")
        foto(c, "so_nutricao_evolucao")
    finally:
        c.fim()


@caso
def caso_dia_sem_refeicao(nav, base: str, prefixo: str) -> None:
    c = B.abrir(nav, base, prefixo, "dia_sem_refeicao", "w7-paciente")
    try:
        ok = c.esperar(lambda: c.tem("[data-dieta-dia-sem-refeicao]"), 60)
        p.check(ok and "Nenhuma refeição hoje" in c.texto(), "[dia_sem_refeicao] plano só de outros dias: 'Nenhuma refeição hoje'")
        p.check("não tem refeição para hoje" in txt(c, "[data-plano-aviso]"), "[dia_sem_refeicao] o aviso no cartão do plano")
        foto(c, "dieta_dia_sem_refeicao")
    finally:
        c.fim()


@caso
def caso_pratos(nav, base: str, prefixo: str) -> None:
    c = B.abrir(nav, base, prefixo, "pratos", "w7b-novo")
    try:
        ok = c.esperar(lambda: c.tem('[data-aba-dieta="pratos"]') and c.pg.locator("[data-prato-pronto]").count() > 0, 60)
        p.check(ok, f"[pratos] aluno do app (Treino + Alimentação): os pratos prontos na aba Dieta ({c.pg.locator('[data-prato-pronto]').count()})")
        foto(c, "dieta_pratos_prontos")
        c.ir("/perfil/alimentacao")
        p.check(c.esperar(lambda: c.caminho() == "/dieta" and c.tem('[data-aba-dieta="pratos"]'), 30), f"[pratos] Perfil › Alimentação vira atalho para a Dieta ({c.caminho()})")
    finally:
        c.fim()


@caso
def caso_rotas(nav, base: str, prefixo: str) -> None:
    c = B.abrir(nav, base, prefixo, "rotas", "w10-aluno", rota="/app/plano", esperar=None)
    try:
        p.check(c.esperar(lambda: c.caminho() == "/dieta" and c.tem('[data-aba-dieta="plano"]'), 60), f"[rotas] /app/plano → /dieta ({c.caminho()})")
        for antiga, seletor in [("/app/orientacoes", "[data-folha-orientacoes]"), ("/app/metas", "[data-folha-metas]"), ("/app/diario", "[data-folha-diario]")]:
            c.ir(antiga)
            ok = c.esperar(lambda: c.tem(seletor), 40)
            p.check(ok, f"[rotas] {antiga} → {c.caminho()} com a folha aberta")
    finally:
        c.fim()


@caso
def caso_nutri_antigo(nav, base: str, prefixo: str) -> None:
    """Lado a lado: o site antigo do Nutri (staging) e o Physiq com a mesma conta de paciente — o mesmo plano, o mesmo ✓."""
    nutri = ESTADO["nutri"].rstrip("/")
    hoje = M.HOJE.isoformat()
    pac = M.matricula_de(B.EMAIL["paciente"])
    M.limpar([pac["id"]])
    cafe, almoco = M.u("refeicao:paciente:Café da manhã"), M.u("refeicao:paciente:Almoço")
    c = B.abrir(nav, base, prefixo, "nutri_novo", "paciente")
    velho = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3.4, is_mobile=True, has_touch=True, locale="pt-BR",
                            timezone_id="America/Sao_Paulo", service_workers="block")
    pv = velho.new_page()
    erros_velho: list[str] = []
    pv.on("pageerror", lambda e: erros_velho.append(str(e)[:160]))
    try:
        p.check(c.esperar(lambda: c.tem('[data-aba-dieta="plano"]'), 60), "[nutri_antigo] Physiq: o plano do paciente")
        novos = c.pg.evaluate("""() => [...document.querySelectorAll('[data-refeicao]')].map(e => ({ id: e.getAttribute('data-refeicao'),
            nome: e.querySelector('[data-refeicao-nome]').innerText, kcal: e.querySelector('[data-refeicao-kcal] b').innerText }))""")
        # o site antigo com a mesma pessoa (sessão direto no Supabase, a chave dele)
        sess = B.http("POST", f"{B.PRINCIPAL_URL}/auth/v1/token?grant_type=password", {"email": B.EMAIL["paciente"], "password": B.CONTAS["paciente"][1]},
                      {"apikey": B.anon(B.PRINCIPAL_REF)})[1]
        pv.goto(f"{nutri}/app/entrar", wait_until="domcontentloaded")
        pv.evaluate("([k, v]) => localStorage.setItem(k, v)", [f"sb-{B.PRINCIPAL_REF}-auth-token", json.dumps(sess)])
        pv.goto(f"{nutri}/app/plano", wait_until="domcontentloaded")
        pv.wait_for_selector("[data-app-plano][data-atualizando='0'] [data-app-refeicoes]", timeout=60000)
        antigos = pv.evaluate("""() => [...document.querySelectorAll('[data-app-refeicao]')].map(e => ({ id: e.getAttribute('data-app-refeicao'),
            nome: e.querySelector('[data-app-refeicao-nome]').childNodes[0].textContent.trim(), kcal: e.querySelector('[data-app-refeicao-kcal]').getAttribute('data-app-refeicao-kcal') }))""")
        print(f"   Physiq: {novos}\n   Nutri : {antigos}", flush=True)
        p.check([x["id"] for x in novos] == [x["id"] for x in antigos], "[nutri_antigo] as mesmas refeições, na mesma ordem")
        p.check([x["nome"] for x in novos] == [x["nome"] for x in antigos], "[nutri_antigo] os mesmos nomes")
        p.check([x["kcal"].replace(".", "") if x["kcal"] != "—" else "0" for x in novos] == [str(x["kcal"]) for x in antigos],
                "[nutri_antigo] as mesmas kcal por refeição (a mesma conta)")
        # ✓ no Physiq → aparece no site antigo
        c.pg.locator(f'[data-refeicao="{cafe}"] [data-refeicao-marcar="feito"]').click()
        p.check(c.esperar(lambda: estado_ref(c, cafe) == "feita", 20), "[nutri_antigo] Physiq: café feito")
        pv.reload(wait_until="domcontentloaded")
        pv.wait_for_selector(f"[data-app-refeicao='{cafe}']", timeout=60000)
        pv.wait_for_timeout(1500)
        p.check(pv.get_attribute(f"[data-app-refeicao='{cafe}']", "data-app-refeicao-concluida") == "1", "[nutri_antigo] o site antigo mostra o ✓ do Physiq")
        # ✓ no site antigo → aparece no Physiq
        pv.click(f"[data-app-btn-concluir='{almoco}']")
        pv.wait_for_selector(f"[data-app-refeicao='{almoco}'][data-app-refeicao-concluida='1']", timeout=30000)
        pv.wait_for_timeout(1500)
        pv.screenshot(path=str(B.PRINTS / f"{prefixo}_nutri_antigo_plano.png"))
        c.ir("/dieta")
        p.check(c.esperar(lambda: estado_ref(c, almoco) == "feita" and estado_ref(c, cafe) == "feita", 40), "[nutri_antigo] o Physiq mostra o ✓ feito no site antigo")
        foto(c, "dieta_paciente_lado_a_lado")
        # orientações, metas e diário: o mesmo conteúdo
        pv.goto(f"{nutri}/app/orientacoes", wait_until="domcontentloaded")
        pv.wait_for_selector("[data-app-orientacoes][data-atualizando='0']", timeout=60000)
        tit_velho = pv.eval_on_selector_all("[data-app-orientacao-titulo]", "els => els.map(e => e.innerText.trim())")
        c.ir("/dieta?ver=orientacoes")
        c.esperar(lambda: c.tem("[data-folha-orientacoes]"), 30)
        tit_novo = c.pg.eval_on_selector_all("[data-orientacao-titulo]", "els => els.map(e => e.innerText.trim())")
        p.check([t.upper() for t in tit_velho] == [t.upper() for t in tit_novo] and tit_novo, f"[nutri_antigo] as mesmas orientações ({tit_novo})")
        pv.goto(f"{nutri}/app/metas", wait_until="domcontentloaded")
        pv.wait_for_selector("[data-app-metas][data-atualizando='0']", timeout=60000)
        metas_velho = sorted(pv.eval_on_selector_all("[data-app-meta-titulo]", "els => els.map(e => e.innerText.trim())"))
        c.ir("/dieta?ver=metas")
        c.esperar(lambda: c.tem("[data-folha-metas]"), 30)
        metas_novo = sorted(c.pg.eval_on_selector_all("[data-folha-metas] [data-meta] b", "els => els.map(e => e.innerText.trim())"))
        p.check([m.upper() for m in metas_velho] == [m.upper() for m in metas_novo], f"[nutri_antigo] as mesmas metas ativas ({metas_novo})")
        fechar_folha(c)
        # foto pelo Physiq → aparece no diário do site antigo
        c.pg.locator("[data-abrir-diario]").click()
        c.esperar(lambda: c.tem("[data-form-diario]"), 20)
        c.pg.locator('[data-diario-refeicao="cafe_manha"]').click()
        c.pg.set_input_files("[data-diario-arquivo]", str(B.FOTOS / "cafe.jpg"))
        c.pg.fill("[data-diario-comentario]", "Café do lado a lado W11")
        c.pg.locator("[data-diario-enviar]").click()
        p.check(c.esperar(lambda: c.pg.locator("[data-diario-registro]").count() == 1, 40), "[nutri_antigo] foto enviada pelo Physiq")
        pv.goto(f"{nutri}/app/diario", wait_until="domcontentloaded")
        pv.wait_for_selector("[data-app-diario][data-atualizando='0']", timeout=60000)
        pv.wait_for_timeout(1000)
        lista = pv.inner_text("[data-app-lista-registros]") if pv.locator("[data-app-lista-registros]").count() else ""
        p.check("Café do lado a lado W11" in lista, "[nutri_antigo] o site antigo lista a foto do diário enviada pelo Physiq")
        pv.screenshot(path=str(B.PRINTS / f"{prefixo}_nutri_antigo_diario.png"))
        p.check(not erros_velho, f"[nutri_antigo] site antigo sem erro de página ({erros_velho[:2]})")
    finally:
        velho.close()
        c.fim()
        M.limpar([pac["id"]])
    # hoje ainda está no dia (a limpeza tirou os ✓ e a foto do teste)
    _ = hoje


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--prefixo", default="local")
    ap.add_argument("--casos", default=",".join(CASOS))
    ap.add_argument("--nutri", default="https://physiqnutri-staging.vercel.app")
    a = ap.parse_args()
    B.ESTADO["schema"] = "staging"
    ESTADO.update(prefixo=a.prefixo, nutri=a.nutri)
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        for nome in [x.strip() for x in a.casos.split(",") if x.strip()]:
            print(f"\n── {nome} ──", flush=True)
            if not B.saude_treino():
                p.check(False, f"{nome}: Banco do Treino lento/instável — parei (nada de restart)")
                break
            try:
                CASOS[nome](nav, a.base, a.prefixo)
            except Exception as e:  # noqa: BLE001
                p.check(False, f"{nome}: exceção {type(e).__name__}: {str(e)[:300]}")
            B.pausa(3)
        nav.close()
    # nada fica para trás no staging: os ✓ e as fotos do diário que os casos gravaram saem (a massa fica)
    ids = [M.matricula_de(B.EMAIL[k])["id"] for k in ("w10-aluno", "paciente", "w7-paciente", "w10-paciente")]
    print("limpeza final:", M.limpar(ids))
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
