#!/usr/bin/env python3
"""Physiq W23 — E2E das telas: Painel › Treinos (Meus treinos, Biblioteca, Histórico, Relatório) e a faixa "Ligar para todos" do
personal (herdado da W22). Padrão das telas 8 (lista de exercícios com GIF) e 6.

Positivo (Lucas, dono + personal da "Consultoria Ferreira W13"): a pasta "Hipertrofia W23" com os treinos A/B/C nas abas; o A com
a prescrição do modelo (séries · reps · descanso · carga) nos campos; digitar a prescrição, arrastar, adicionar da biblioteca e
tirar grava no modelo (schema do teste); "Quem recebe" dá e tira o treino do Rafael pela função (e leva a prescrição do modelo)
e "Aplicar a quem recebe" preenche só o vazio; pasta e treino: criar, renomear, pôr em outra pasta, excluir (a pasta sai e os
treinos ficam); o global abre só para ler; Biblioteca: a Global (81, só leitura) e a Minha — exercício próprio novo com GIF,
movimento e equipamento (a troca por equivalente do aluno: o app sincroniza os exercícios do professor dele), editar, grupo
muscular novo e excluir; Histórico do mês (todos e um aluno, o detalhe e o histórico completo); Relatório (resumo, semanas, PDF
e Excel); o link antigo /admin/treinos?t=biblioteca. A faixa: o personal com WhatsApp no Physiq vê os alunos DELE com as
mensagens desligadas e "Ligar para todos" liga só eles (staging; desfeito no fim).
Negativo: o Bruno (2º personal) não vê os modelos nem o exercício do Lucas; a Camila (nutricionista, sem papel no Treino) vê a
página como "do módulo Treino"; valor inválido não grava; sem WhatsApp/aviso já visto = sem faixa.

Uso: python3 e2e/w23/telas.py --base http://localhost:5173 --prefixo local   (staging: --base https://physiqcalc-staging.vercel.app
     --prefixo staging). Contexto limpo por caso, painel 1280 × 883 × 2 (= as telas 6–8). A massa volta ao começo no fim.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
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
DOWNLOADS = B.SCRATCH / "downloads"
ARQ_GIF = B.GIF_TESTE / "97bf2aa2-77b4-429e-9c9d-d5e3547b5b14-1788913556.webp"  # o nosso GIF da rosca martelo


def massa() -> dict:
    r = subprocess.run([sys.executable, str(Path(__file__).parent / "massa.py")], capture_output=True, text=True)
    print(r.stdout[-300:], r.stderr[-300:], flush=True)
    return B.ler_json(B.SCRATCH / "massa_staging.json")


def linha(c, nome: str):
    return c.pg.locator(f'[data-modelo-detalhe] [data-exercicio-nome="{nome}"]').first


def digitar(c, nome: str, campo: str, valor: str) -> None:
    inp = linha(c, nome).locator(f'[data-campo-input="{campo}"]')
    inp.click()
    inp.fill(valor)
    inp.press("Enter")
    c.pg.wait_for_timeout(600)


def abrir_aba_modelo(c, nome: str) -> bool:
    c.pg.locator("[data-modelo-aba]", has_text=nome).first.click()
    return c.esperar(lambda: c.pg.locator("[data-modelo-detalhe]").get_attribute("data-modelo-nome") == nome, 20)


def arrastar(c, de: str, para: str) -> None:
    """dnd-kit (PointerSensor, 4 px para começar): pega a alça de `de` e solta em cima da linha `para`."""
    alca = linha(c, de).locator("[data-exercicio-arrastar]")
    alvo = linha(c, para)
    a = alca.bounding_box()
    b = alvo.bounding_box()
    assert a and b
    c.pg.mouse.move(a["x"] + a["width"] / 2, a["y"] + a["height"] / 2)
    c.pg.mouse.down()
    c.pg.mouse.move(a["x"] + a["width"] / 2, a["y"] + a["height"] / 2 - 8, steps=4)
    c.pg.mouse.move(b["x"] + 40, b["y"] + b["height"] / 2 - 6, steps=14)
    c.pg.wait_for_timeout(200)
    c.pg.mouse.up()
    c.pg.wait_for_timeout(900)


def nome_folha(c, valor: str) -> None:
    c.esperar(lambda: c.tem("[data-folha-nome-campo]"), 15)
    c.pg.locator("[data-folha-nome-campo]").fill(valor)
    c.pg.locator("[data-folha-nome-salvar]").click()
    c.pg.wait_for_timeout(1200)


def sem_toasts(c) -> None:
    c.pg.mouse.move(5, 5)
    c.esperar(lambda: c.pg.locator("[data-sonner-toast]").count() == 0, 12)


def baixar(c, seletor: str, nome: str) -> Path | None:
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    try:
        with c.pg.expect_download(timeout=60000) as d:
            c.pg.locator(seletor).first.click()
        destino = DOWNLOADS / f"{c.prefixo}_{nome}_{d.value.suggested_filename}"
        d.value.save_as(str(destino))
        return destino
    except Exception as e:  # noqa: BLE001
        print("   download falhou:", e)
        return None


def entrar_treinos(nav, base: str, prefixo: str, nome: str, conta: str, rota: str = "/painel/treinos") -> "B.Caso":
    c = B.Caso(nav, base, prefixo, nome)
    c.entrar(conta, rota)
    c.fechar_avisos()
    return c


# hml-14d (D39): as listas do Treino vêm em páginas de 20 do banco — o número é o data-total da <Paginacao nome=…> (1 página =
# só o rótulo; vazia = sem paginação) e o item que precisa estar à vista é achado pela busca da lista.
def total_lista(c, nome: str) -> int | None:
    loc = c.pg.locator(f'[data-paginacao="{nome}"]')
    try:
        v = loc.first.get_attribute("data-total", timeout=2000) if loc.count() else None
    except Exception:  # noqa: BLE001 — navegando
        return None
    return int(v) if v and v.isdigit() else None


def escolher_aluno_treino(c, raiz: str, nome: str, treino_id: str) -> bool:
    """hml-14d (D39): o seletor de aluno do Treino (no lugar do <select data-seletor-aluno>) busca no banco enquanto digita:
    digita parte do nome no campo e clica na opção do aluno (data-opcao-aluno-treino = o id do Treino)."""
    sel = f'[data-seletor-aluno-treino="{raiz}"]'
    campo = c.pg.locator(f"{sel} [data-seletor-aluno-treino-busca], {sel}[data-seletor-aluno-treino-busca]")
    if not c.esperar(lambda: campo.count() > 0 and campo.first.is_visible(), 10):
        if c.pg.locator(sel).count():  # combobox que abre com clique: a raiz primeiro (o campo pode abrir numa camada fora dela)
            c.pg.locator(sel).first.click()
        campo = c.pg.locator(f"{sel} [data-seletor-aluno-treino-busca], [data-seletor-aluno-treino-busca]")
        if not c.esperar(lambda: campo.count() > 0 and campo.first.is_visible(), 15):
            return False
    campo.first.click()
    campo.first.fill(nome)
    opcao = c.pg.locator(f'[data-opcao-aluno-treino="{treino_id}"]')
    if not c.esperar(lambda: opcao.count() > 0 and opcao.first.is_visible(), 30):
        return False
    opcao.first.click()
    return True


def linhas_do_mes(c, mes: str) -> bool:
    """hml-14d (D39): as linhas do Histórico já são as do mês pedido ("2026-09") — a lista do mês de antes fica na tela até a
    página nova chegar."""
    datas = c.pg.locator("[data-historico-linha]").evaluate_all("els => els.map((e) => e.getAttribute('data-historico-linha') || '')")
    return bool(datas) and all(d.startswith(mes) for d in datas)


def historico_completo(c) -> int:
    """hml-14d (D39): o número do 'Todo o histórico' — o data-historico-completo de hoje ou, com a folha em páginas de 20, o
    data-total da paginação dela (historico-aluno): vale o maior."""
    loc = c.pg.locator("[data-historico-completo]")
    try:
        v = (loc.first.get_attribute("data-historico-completo", timeout=2000) or "") if loc.count() else ""
    except Exception:  # noqa: BLE001 — a folha abrindo
        v = ""
    return max(int(v) if v.isdigit() else 0, total_lista(c, "historico-aluno") or 0)


# ───────────────────────── Meus treinos ─────────────────────────

def caso_meus_treinos(nav, base: str, prefixo: str, m: dict) -> None:
    A, Bg, C = m["A"], m["B"], m["C"]
    B.saude_ok("Meus treinos")
    c = entrar_treinos(nav, base, prefixo, "meus_treinos", "w13-dono")
    try:
        ok = c.esperar(lambda: c.tem('[data-pasta-nome="Hipertrofia W23"]'), 120)
        p.check(ok, "M1 Painel › Treinos abre (Meus treinos) com a pasta 'Hipertrofia W23'")
        if not ok:
            return
        p.check(c.pg.locator('[data-aba-treinos-botao="treinos"]').get_attribute("aria-selected") == "true", "M2 aba Meus treinos ativa; abas Biblioteca, Histórico e Relatório")
        c.pg.locator('[data-pasta-nome="Hipertrofia W23"]').click()
        ok = c.esperar(lambda: c.pg.locator("[data-modelo-aba]").count() == 3, 30)
        abas = [c.pg.locator("[data-modelo-aba]").nth(i).inner_text().strip() for i in range(c.pg.locator("[data-modelo-aba]").count())]
        p.check(ok and abas == [B.TREINO_A, B.TREINO_B, B.TREINO_C], f"M3 a pasta abre com os treinos A/B/C nas abas ({abas})")
        ok = c.esperar(lambda: c.pg.locator("[data-modelo-detalhe]").get_attribute("data-modelo-nome") == B.TREINO_A, 20)
        c.esperar(lambda: c.tem("[data-modelo-chips] [data-chip-alunos]"), 40)  # o nº de alunos só aparece depois do "Quem recebe"
        chips = c.pg.locator("[data-modelo-chips]").inner_text().replace("\n", " ")
        p.check(ok and "5 EXERCÍCIOS" in chips and "18 SÉRIES" in chips and "1 ALUNO" in chips, f"M4 chips do A: 5 exercícios · 18 séries (4+4+3+3+4) · duração · 1 aluno ({chips})")
        p.check(c.pg.locator("[data-modelo-detalhe] [data-miniatura]").count() >= 5, "M5 miniatura do GIF em cada exercício (tela 8)")
        vals = {k: linha(c, "Supino Reto com Barra").locator(f'[data-campo-input="{k}"]').input_value() for k in ("series", "reps", "descanso", "carga")}
        p.check(vals == {"series": "4", "reps": "10", "descanso": "60 s", "carga": "60 kg"}, f"M6 a prescrição do modelo nos campos (4 × 10 · 60 s · 60 kg) → {vals}")
        # hml-14d (D39): o "N com GIF" sai do banco (não do catálogo inteiro no navegador) — compara com a contagem do banco (os
        # globais + os do Lucas com GIF; o "81" da W23 cresceu com a biblioteca)
        lucas = m["lucas"]
        n_gif = B.sql_treino(f"""select count(*)::int as n from {S}.tb_exercicios where nullif(imagem_url, '') is not null
                                   and (professor_id is null or professor_id = '{lucas}')""")[0]["n"]
        txt = c.pg.locator("[data-modelo-adicionar]").inner_text().strip()
        p.check(txt == f"Adicionar exercício da biblioteca ({n_gif} com GIF)", f"M7 'Adicionar exercício da biblioteca ({n_gif} com GIF)' — o número do banco ({txt!r})")
        sem_toasts(c)
        c.print("tela8_meus_treinos")

        # ── a prescrição do modelo no B (digitada) ──
        p.check(abrir_aba_modelo(c, B.TREINO_B), "M8 aba B abre")
        for campo, valor in (("series", "4"), ("reps", "10"), ("descanso", "90"), ("carga", "40")):
            digitar(c, "Puxada Frontal Aberta", campo, valor)
        ok = B.esperar(lambda: (lambda x: x and (x["num_series"], x["reps_alvo"], x["descanso_segundos"], x["carga"]) == (4, "10", 90, 40.0))(
            next((r for r in B.linhas_modelo(Bg) if r["nome"] == "Puxada Frontal Aberta"), None)), 30, 2)
        p.check(bool(ok), "M9 o modelo B grava 4 × 10 · 90 s · 40 kg na Puxada (colunas do modelo, schema staging)")
        digitar(c, "Remada Curvada com Barra", "reps", "abc")
        c.pg.wait_for_timeout(800)
        rem = next((r for r in B.linhas_modelo(Bg) if r["nome"] == "Remada Curvada com Barra"), {})
        p.check(rem.get("reps_alvo") is None, f"M10 negativo: repetição 'abc' não grava (fica vazio) → {rem.get('reps_alvo')}")

        # ── arrastar no A ──
        p.check(abrir_aba_modelo(c, B.TREINO_A), "M11 volta para o A")
        arrastar(c, "Tríceps Pulley", "Tríceps Francês com Halter")
        ok = B.esperar(lambda: [r["nome"] for r in B.linhas_modelo(A)][3:] == ["Tríceps Pulley", "Tríceps Francês com Halter"], 30, 2)
        p.check(bool(ok), f"M12 arrastar: Tríceps Pulley antes do Francês no banco ({[r['nome'] for r in B.linhas_modelo(A)]})")

        # ── adicionar da biblioteca e tirar (no C) ──
        p.check(abrir_aba_modelo(c, B.TREINO_C), "M13 aba C abre")
        c.pg.locator("[data-modelo-adicionar]").click()
        c.esperar(lambda: c.pg.locator("[data-biblioteca-item]").count() > 0, 40)  # hml-14d (D39): a folha mostra 20 por página
        c.pg.locator("[data-biblioteca-busca]").fill("extensora")
        c.pg.wait_for_timeout(600)
        c.pg.locator('[data-biblioteca-item="Cadeira Extensora"]').first.click()
        ok = B.esperar(lambda: "Cadeira Extensora" in [r["nome"] for r in B.linhas_modelo(C)], 30, 2)
        p.check(bool(ok) and c.esperar(lambda: linha(c, "Cadeira Extensora").count() > 0, 20), "M14 biblioteca › Extensora entrou no C (tela e banco)")
        linha(c, "Cadeira Extensora").locator("[data-exercicio-remover]").click()
        ok = B.esperar(lambda: "Cadeira Extensora" not in [r["nome"] for r in B.linhas_modelo(C)], 30, 2)
        p.check(bool(ok), "M15 tirar do treino: a Extensora saiu do C")
    finally:
        c.fim()


def caso_quem_recebe(nav, base: str, prefixo: str, m: dict) -> None:
    A, Bg, rafael = m["A"], m["B"], m["rafael"]
    B.saude_ok("Quem recebe")
    c = entrar_treinos(nav, base, prefixo, "quem_recebe", "w13-dono", f"/painel/treinos?pasta={m['pasta']}&treino={Bg}")
    try:
        ok = c.esperar(lambda: c.tem(f'[data-quem-recebe="{Bg}"] [data-quem-recebe-aluno="{rafael}"]'), 120)
        p.check(ok, "Q1 'Quem recebe' do B lista os alunos do Lucas (Rafael e ele mesmo)")
        if not ok:
            return
        ra = c.pg.locator(f'[data-quem-recebe-aluno="{rafael}"]')
        p.check(ra.get_attribute("data-recebe") == "0" and not B.recebe(Bg, rafael), "Q2 o Rafael não recebe o B (tela = banco)")
        ra.click()
        ok = B.esperar(lambda: B.recebe(Bg, rafael), 40, 2)
        pr = B.prescricao_aluno(rafael, Bg).get("Puxada Frontal Aberta") or {}
        p.check(bool(ok) and (pr.get("num_series"), pr.get("reps_alvo"), pr.get("descanso_segundos"), pr.get("carga")) == (4, "10", 90, 40.0),
                f"Q3 marcar dá o B ao Rafael (função) e ele leva a prescrição do modelo (4 × 10 · 90 s · 40 kg) → {pr}")
        c.esperar(lambda: c.pg.locator(f'[data-quem-recebe-aluno="{rafael}"]').get_attribute("data-recebe") == "1", 20)
        B.pausa(1.5)
        c.pg.locator(f'[data-quem-recebe-aluno="{rafael}"]').click()  # tirar (confirmação aceita)
        ok = B.esperar(lambda: not B.recebe(Bg, rafael), 40, 2)
        p.check(bool(ok), "Q4 desmarcar tira o B do Rafael (sai da semana e das trocas — W15)")
        # Aplicar a quem recebe (A): o Supino Reto do Rafael (5 × 6) fica, o vazio entra
        p.check(abrir_aba_modelo(c, B.TREINO_A), "Q5 aba A")
        c.esperar(lambda: c.tem("[data-quem-recebe-aplicar]"), 30)
        c.pg.locator("[data-quem-recebe-aplicar]").click()
        ok = B.esperar(lambda: len(B.prescricao_aluno(rafael, A)) == 5, 40, 2)
        pa = B.prescricao_aluno(rafael, A)
        s = pa.get("Supino Reto com Barra") or {}
        p.check(bool(ok) and (s.get("num_series"), s.get("reps_alvo"), s.get("descanso_segundos"), s.get("carga")) == (5, "6", 60, 60.0),
                f"Q6 'Aplicar a quem recebe': o 5 × 6 do Rafael fica e só o vazio entra (60 s · 60 kg) → {s}")
        sem_toasts(c)
        c.pg.locator(f'[data-quem-recebe="{A}"]').screenshot(path=str(B.PRINTS / f"{prefixo}_quem_recebe.png"))
    finally:
        c.fim()


def caso_pastas(nav, base: str, prefixo: str, m: dict) -> None:
    lucas = m["lucas"]
    B.saude_ok("pastas e treinos")
    c = entrar_treinos(nav, base, prefixo, "pastas", "w13-dono")
    try:
        c.esperar(lambda: c.tem("[data-nova-pasta]"), 120)
        c.pg.locator("[data-nova-pasta]").click()
        nome_folha(c, "Pasta Teste W23")
        ok = B.esperar(lambda: B.sql_treino(f"select 1 from {S}.tb_pastas_treino where nome = 'Pasta Teste W23' and professor_id = '{lucas}'"), 30, 2)
        p.check(bool(ok) and c.esperar(lambda: c.tem('[data-pasta-aberta]'), 20), "P1 Nova pasta: criada para o Lucas e aberta")
        c.pg.locator("[data-novo-treino-lista]").click()
        nome_folha(c, "D · Ombros W23")
        gid = B.esperar(lambda: B.grupo_id("D · Ombros W23", lucas), 30, 2)
        dentro = B.sql_treino(f"""select 1 from {S}.tb_pastas_treino_grupos v join {S}.tb_pastas_treino pt on pt.id = v.pasta_id
                                  where pt.nome = 'Pasta Teste W23' and v.grupo_id = '{gid}'""") if gid else []
        p.check(bool(gid) and bool(dentro), "P2 Novo treino dentro da pasta (professor_id = Lucas, na pasta)")
        c.esperar(lambda: c.pg.locator("[data-modelo-detalhe]").get_attribute("data-modelo-nome") == "D · Ombros W23", 20)
        c.pg.locator("[data-modelo-renomear]").click()
        nome_folha(c, "D · Ombros e abdômen W23")
        ok = B.esperar(lambda: B.sql_treino(f"select 1 from {S}.tb_grupos_treino where id = '{gid}' and nome = 'D · Ombros e abdômen W23'"), 30, 2)
        p.check(bool(ok), "P3 Renomear o treino")
        c.pg.locator("[data-modelo-pastas]").click()
        c.esperar(lambda: c.tem("[data-folha-pastas]"), 15)
        c.pg.locator(f'[data-folha-pasta="{m["pasta"]}"]').click()
        ok = B.esperar(lambda: B.sql_treino(f"select 1 from {S}.tb_pastas_treino_grupos where pasta_id = '{m['pasta']}' and grupo_id = '{gid}'"), 30, 2)
        p.check(bool(ok), "P4 Pastas do treino: também na 'Hipertrofia W23' (um treino em várias pastas)")
        c.pg.keyboard.press("Escape")
        c.pg.wait_for_timeout(600)
        c.pg.locator("[data-pasta-excluir]").click()
        ok = B.esperar(lambda: not B.sql_treino(f"select 1 from {S}.tb_pastas_treino where nome = 'Pasta Teste W23' and professor_id = '{lucas}'"), 30, 2)
        ficou = B.sql_treino(f"select 1 from {S}.tb_grupos_treino where id = '{gid}'")
        p.check(bool(ok) and bool(ficou), "P5 Excluir a pasta: a pasta sai e o treino FICA")
        # hml-14d (D39): Meus treinos vem em páginas de 20 do banco (a massa da 14d põe 41 treinos do Lucas) — acha pela busca
        c.pg.locator("[data-busca-modelos]").fill("D · Ombros e abdômen W23")
        c.esperar(lambda: c.tem(f'[data-modelo="{gid}"]'), 20)
        c.pg.locator(f'[data-modelo="{gid}"]').click()
        c.esperar(lambda: c.pg.locator("[data-modelo-detalhe]").get_attribute("data-modelo-nome") == "D · Ombros e abdômen W23", 20)
        c.pg.locator("[data-modelo-excluir]").click()
        ok = B.esperar(lambda: not B.sql_treino(f"select 1 from {S}.tb_grupos_treino where id = '{gid}'"), 30, 2)
        p.check(bool(ok), "P6 Excluir o treino")
    finally:
        c.fim()


def caso_global(nav, base: str, prefixo: str) -> None:
    gid = (B.sql_treino(f"select id::text from {S}.tb_grupos_treino where professor_id is null and nome = 'Costas' limit 1") or [{}])[0].get("id")
    if not gid:
        gid = B.sql_treino(f"select id::text from {S}.tb_grupos_treino where professor_id is null order by nome limit 1")[0]["id"]
    B.saude_ok("global só leitura")
    c = entrar_treinos(nav, base, prefixo, "global", "w13-dono", f"/painel/treinos?treino={gid}")
    try:
        ok = c.esperar(lambda: c.tem(f'[data-modelo-detalhe="{gid}"]'), 120)
        p.check(ok and c.tem("[data-chip-global]") and "SÓ LEITURA" in c.pg.locator("[data-chip-global]").inner_text(), "G1 o treino global do master abre com 'GLOBAL · SÓ LEITURA'")
        p.check(not c.tem("[data-modelo-adicionar]") and not c.tem("[data-modelo-excluir]") and not c.tem("[data-modelo-renomear]"), "G2 sem adicionar, renomear nem excluir (o personal não muda o global)")
        p.check(c.pg.locator('[data-modelo-detalhe] [data-campo-input]').count() == 0, "G3 os campos da prescrição só para ler")
        p.check(c.tem(f'[data-quem-recebe="{gid}"]'), "G4 'Quem recebe' continua: o personal dá o global aos alunos dele")
    finally:
        c.fim()


# ───────────────────────── Biblioteca ─────────────────────────

def caso_biblioteca(nav, base: str, prefixo: str, m: dict) -> None:
    lucas, rafael = m["lucas"], m["rafael"]
    B.saude_ok("Biblioteca")
    c = entrar_treinos(nav, base, prefixo, "biblioteca", "w13-dono", "/painel/treinos?aba=biblioteca")
    try:
        # hml-14d (D39): a Biblioteca vem em páginas de 20 do banco — o total (paginação e chip) contra a contagem do banco (o "81"
        # da W23 cresceu); cadeado e classificação: todos os da página
        n_global = B.sql_treino(f"select count(*)::int as n from {S}.tb_exercicios where professor_id is null")[0]["n"]
        ok = c.esperar(lambda: c.pg.locator("[data-exercicio-biblioteca]").count() > 0 and total_lista(c, "biblioteca") == n_global, 120)
        n_pag = c.pg.locator("[data-exercicio-biblioteca]").count()
        chip = c.pg.locator("[data-chip-total-exercicios]").inner_text().strip() if ok else ""
        p.check(ok and chip == f"{n_global} EXERCÍCIOS", f"B1 Biblioteca › Global: os {n_global} exercícios do Physiq (banco) → paginação {total_lista(c, 'biblioteca')}, chip {chip!r}")
        p.check(0 < n_pag == c.pg.locator("[data-exercicio-global]").count() and c.pg.locator("[data-exercicio-editar-bib]").count() == 0, "B2 a Global é só leitura para o personal (cadeado)")
        p.check(0 < n_pag == c.pg.locator('[data-exercicio-biblioteca] [data-exercicio-classificacao="1"]').count(), "B3 cada exercício com grupo · movimento · equipamento (W9)")
        sem_toasts(c)
        c.print("tela8_biblioteca_global")
        # Minha → Novo exercício próprio (GIF, movimento e equipamento)
        c.pg.get_by_role("radio", name=re.compile(r"^Minha \(")).click()
        c.esperar(lambda: c.tem('[data-biblioteca="minha"]'), 15)
        c.pg.locator("[data-btn-novo-exercicio]").click()
        c.esperar(lambda: c.tem('[data-folha-exercicio="novo"]'), 15)
        c.pg.locator("[data-campo-nome]").fill(B.PROPRIO)
        c.pg.locator("[data-campo-grupo]").select_option("Bíceps / Braquial")
        c.pg.locator("[data-campo-subgrupo]").fill("Braquial · braquiorradial · bíceps")
        c.pg.locator("[data-campo-dica]").fill("Cotovelos parados ao lado do corpo; suba sem balançar.")
        c.pg.locator("[data-exercicio-arquivo]").set_input_files(str(ARQ_GIF))
        c.pg.locator("[data-campo-movimento]").select_option("rosca_martelo")
        c.pg.locator("[data-campo-equipamento]").select_option("kettlebell")
        c.pg.locator("[data-campo-variacao]").fill("pegada neutra")
        c.pg.wait_for_timeout(400)
        c.pg.locator("[data-exercicio-salvar]").click()
        reg = B.esperar(lambda: (B.sql_treino(f"""select id::text, professor_id::text, grupo_muscular, padrao_movimento, equipamento, variacao, imagem_url, dica
                                                    from {S}.tb_exercicios where nome = $n${B.PROPRIO}$n$""") or [None])[0], 40, 2)
        p.check(bool(reg) and reg["professor_id"] == lucas and reg["padrao_movimento"] == "rosca_martelo" and reg["equipamento"] == "kettlebell"
                and reg["grupo_muscular"] == "Bíceps / Braquial", f"B4 exercício próprio criado (professor = Lucas, rosca martelo · kettlebell) → {reg and {k: reg[k] for k in ('grupo_muscular', 'padrao_movimento', 'equipamento')}}")
        ok = B.esperar(lambda: (B.sql_treino(f"select imagem_url from {S}.tb_exercicios where nome = $n${B.PROPRIO}$n$") or [{}])[0].get("imagem_url"), 40, 2)
        p.check(bool(ok) and "exercicios-staging" in str(ok), f"B5 o GIF subiu no bucket do staging ({str(ok)[:90]})")
        # hml-14d (D39): a Minha vem em páginas de 20 do banco (os 41 da massa da 14d vêm antes dele) — acha pela busca
        c.pg.locator("[data-biblioteca-busca-painel]").fill(B.PROPRIO)
        ok = c.esperar(lambda: c.tem(f'[data-exercicio-biblioteca-nome="{B.PROPRIO}"]'), 30)
        linha_txt = c.pg.locator(f'[data-exercicio-biblioteca-nome="{B.PROPRIO}"]').inner_text() if ok else ""
        p.check(ok and "Rosca martelo" in linha_txt and "Kettlebell" in linha_txt, f"B6 na lista Minha com grupo · movimento · equipamento ({linha_txt.splitlines()[-1:] if linha_txt else ''})")
        c.esperar(lambda: c.pg.locator(f'[data-exercicio-biblioteca-nome="{B.PROPRIO}"] [data-miniatura="quadro"], [data-exercicio-biblioteca-nome="{B.PROPRIO}"] [data-miniatura="imagem"]').count() > 0, 30)
        sem_toasts(c)
        c.print("tela8_biblioteca_minha")
        # a troca por equivalente do aluno: o app sincroniza os exercícios do professor dele (sync-config › do_meu_professor)
        chega = B.sql_treino(f"""select e.nome from {S}.tb_exercicios e join {S}.physiq_profiles pp on pp.professor_id = e.professor_id
                                  where pp.id = '{rafael}' and e.nome = $n${B.PROPRIO}$n$""")
        p.check(bool(chega), "B7 o exercício novo entra na biblioteca do app do Rafael (a regra do PowerSync: os do professor dele)")
        # editar (dica) e grupo muscular novo
        c.pg.locator(f'[data-exercicio-biblioteca-nome="{B.PROPRIO}"] [data-exercicio-editar-bib]').click()
        c.esperar(lambda: c.tem("[data-campo-dica]"), 15)
        c.pg.locator("[data-campo-dica]").fill("Cotovelos parados; desça em 3 segundos.")
        c.pg.locator("[data-novo-musculo]").click()
        c.pg.locator("[data-novo-musculo-campo]").fill("Antebraço W23")
        c.pg.locator("[data-novo-musculo-salvar]").click()
        ok = B.esperar(lambda: B.sql_treino(f"select 1 from {S}.grupos_musculares where nome = 'Antebraço W23' and professor_id = '{lucas}'"), 30, 2)
        p.check(bool(ok), "B8 grupo muscular novo (do Lucas) pelo 'Músculo que não está na lista'")
        c.pg.locator("[data-campo-grupo]").select_option("Bíceps / Braquial")
        c.pg.locator("[data-exercicio-salvar]").click()
        ok = B.esperar(lambda: (B.sql_treino(f"select dica from {S}.tb_exercicios where nome = $n${B.PROPRIO}$n$") or [{}])[0].get("dica") == "Cotovelos parados; desça em 3 segundos.", 30, 2)
        p.check(bool(ok), "B9 editar o exercício próprio (dica)")
        c.pg.wait_for_timeout(800)
        c.pg.locator("[data-btn-grupos-musculares]").click()
        c.esperar(lambda: c.tem('[data-musculo="Antebraço W23"]'), 15)
        c.pg.locator('[data-musculo="Antebraço W23"] button').click()
        ok = B.esperar(lambda: not B.sql_treino(f"select 1 from {S}.grupos_musculares where nome = 'Antebraço W23'"), 30, 2)
        p.check(bool(ok), "B10 excluir o grupo muscular próprio")
    finally:
        c.fim()


# ───────────────────────── Histórico e Relatório ─────────────────────────

def caso_historico_relatorio(nav, base: str, prefixo: str, m: dict) -> None:
    rafael = m["rafael"]
    B.saude_ok("Histórico")
    c = entrar_treinos(nav, base, prefixo, "historico", "w13-dono", "/painel/treinos?aba=historico")
    try:
        ok = c.esperar(lambda: c.tem("[data-historico-painel]") and not c.tem("[data-historico-painel] .animate-pulse"), 120)
        p.check(ok, "H1 aba Histórico abre no mês de hoje")
        c.pg.locator("[data-historico-painel] [data-mes-anterior]").click()
        # hml-14d (D39): o mês vem em páginas de 20 do banco — o número é o data-total da paginação (não as linhas da página),
        # lido quando as linhas já são do mês anterior (o mês de hoje, com a massa da 14d, fica na tela até a página nova chegar)
        mes = (B.B5.hoje().replace(day=1) - dt.timedelta(days=1)).strftime("%Y-%m")
        ok = c.esperar(lambda: linhas_do_mes(c, mes) and (total_lista(c, "historico-mes") or 0) >= 10, 60)
        n = total_lista(c, "historico-mes") or 0
        p.check(ok, f"H2 setembro: os treinos feitos pelos alunos do Lucas (≥ 10 do Rafael) → {n}")
        txt = c.pg.locator("[data-historico-lista-painel]").inner_text()
        p.check("Rafael Moura" in txt, "H3 cada linha com o aluno, o treino, a duração e os exercícios")
        # hml-14d (D39): o <select> saiu — o seletor do Treino busca no banco (parte do nome) e o filtro vai ao servidor
        # (historicoMes com o userId): "só o Rafael" = o total da resposta e o data-total da paginação iguais aos de antes
        srv = None
        try:
            with c.pg.expect_response(lambda r: "/functions/v1/admin-relatorio" in r.url and b"historicoMes" in (r.request.post_data_buffer or b"")
                                      and rafael.encode() in (r.request.post_data_buffer or b""), timeout=60_000) as resp:
                escolher_aluno_treino(c, "historico", "Rafael", rafael)
            srv = (resp.value.json() or {}).get("total")
        except Exception as e:  # noqa: BLE001 — o pedido com o aluno não saiu
            print("   filtro do aluno:", e)
        ok = srv == n and c.esperar(lambda: total_lista(c, "historico-mes") == n and linhas_do_mes(c, mes), 20)
        p.check(ok, f"H4 filtro do aluno: só o Rafael (todos eram dele) → servidor {srv}, tela {total_lista(c, 'historico-mes')} de {n}")
        c.pg.locator('[data-historico-linha="2026-09-24"]').first.click()
        ok = c.esperar(lambda: c.pg.locator("[data-historico-detalhe-painel] li").count() >= 3, 40)
        p.check(ok and "kg ×" in c.pg.locator("[data-historico-detalhe-painel]").inner_text(), "H5 tocar abre o treino feito com as séries (kg × reps)")
        c.pg.wait_for_timeout(600)
        c.print("historico_detalhe")
        c.pg.keyboard.press("Escape")
        c.pg.wait_for_timeout(500)
        c.pg.locator("[data-historico-completo-abrir]").click()
        # hml-14d (D39): a folha vem em páginas de 20 — vale o atributo de hoje ou o data-total da paginação dela (historico-aluno)
        ok = c.esperar(lambda: historico_completo(c) >= 10, 60)
        p.check(ok, f"H6 'Todo o histórico' do Rafael (por mês) → {historico_completo(c)}")
        c.pg.keyboard.press("Escape")
        c.pg.wait_for_timeout(500)
        sem_toasts(c)
        c.print("tela6_historico")
    finally:
        c.fim()
    time.sleep(2)
    B.saude_ok("Relatório")
    c = entrar_treinos(nav, base, prefixo, "relatorio", "w13-dono", "/painel/treinos?aba=relatorio")
    try:
        ok = c.esperar(lambda: c.tem("[data-relatorio-painel]"), 120)
        p.check(ok and c.pg.locator("[data-relatorio-painel]").get_attribute("data-relatorio-painel") == "sem-aluno", "R1 aba Relatório: escolha um aluno")
        escolheu = escolher_aluno_treino(c, "relatorio", "Rafael", rafael)  # hml-14d (D39): o seletor do Treino no lugar do <select>
        c.pg.locator("[data-relatorio-painel] [data-mes-anterior]").click()
        ok = escolheu and c.esperar(lambda: c.tem("[data-relatorio-resumo]") and int(c.pg.locator("[data-relatorio-resumo]").get_attribute("data-relatorio-resumo") or 0) >= 10, 90)
        p.check(ok, f"R2 setembro do Rafael: treinos no mês ≥ 10 ({c.pg.locator('[data-relatorio-resumo]').get_attribute('data-relatorio-resumo') if ok else '?'})")
        p.check(c.tem("[data-relatorio-perfil]") and c.pg.locator("[data-relatorio-semana]").count() >= 4, "R3 dados do aluno e as semanas do mês")
        c.pg.locator('[data-relatorio-semana="4"] button').first.click()
        c.esperar(lambda: c.pg.locator("[data-relatorio-dia]").count() > 0, 20)
        pdf = baixar(c, "[data-relatorio-pdf-painel]", "relatorio")
        p.check(bool(pdf) and pdf.stat().st_size > 2000 and pdf.read_bytes()[:4] == b"%PDF", f"R4 PDF do relatório baixado ({pdf.name if pdf else '-'})")
        xls = baixar(c, "[data-relatorio-excel-painel]", "relatorio")
        p.check(bool(xls) and xls.stat().st_size > 2000 and xls.read_bytes()[:2] == b"PK", f"R5 Excel do relatório baixado ({xls.name if xls else '-'})")
        sem_toasts(c)
        c.print("relatorio")
    finally:
        c.fim()


def caso_link_antigo(nav, base: str, prefixo: str) -> None:
    B.saude_ok("link antigo")
    c = entrar_treinos(nav, base, prefixo, "link_antigo", "w13-dono", "/admin/treinos?t=biblioteca&b=minha")
    try:
        ok = c.esperar(lambda: c.tem('[data-pagina-treinos-painel][data-aba-treinos="biblioteca"]') and c.tem('[data-biblioteca="minha"]'), 120)
        p.check(ok and c.caminho().startswith("/painel/treinos"),
                f"L1 /admin/treinos?t=biblioteca&b=minha → Painel › Treinos › Biblioteca › Minha ({c.caminho()})")
    finally:
        c.fim()


def caso_negativos(nav, base: str, prefixo: str) -> None:
    B.saude_ok("negativos")
    c = entrar_treinos(nav, base, prefixo, "bruno", "w13-personal2")
    try:
        ok = c.esperar(lambda: c.tem("[data-meus-treinos]") and not c.tem('[data-meus-treinos="carregando"]'), 120)
        txt = c.texto()
        p.check(ok and "Hipertrofia W23" not in txt and B.TREINO_A not in txt, "N1 Bruno (2º personal) não vê a pasta nem os treinos do Lucas")
        c.pg.locator('[data-aba-treinos-botao="biblioteca"]').click()
        c.esperar(lambda: c.tem("[data-biblioteca]"), 30)
        c.pg.get_by_role("radio", name=re.compile(r"^Minha \(")).click()
        c.pg.wait_for_timeout(1000)
        p.check(B.PROPRIO not in c.texto(), "N2 Bruno não vê o exercício próprio do Lucas na Minha")
    finally:
        c.fim()
    time.sleep(2)
    c = entrar_treinos(nav, base, prefixo, "camila", "w13-nutri")
    try:
        ok = c.esperar(lambda: c.tem('[data-sem-treino="sem-papel"]'), 90)
        p.check(ok and not c.tem("[data-meus-treinos]"), "N3 Camila (nutricionista) vê a página como 'do módulo Treino', sem os treinos")
        c.print("negativo_nutricionista")
    finally:
        c.fim()


# ───────────────────────── Item 2: a faixa "Ligar para todos" do personal ─────────────────────────

def caso_faixa_personal(nav, base: str, prefixo: str) -> None:
    lucas_p = B.uid("w13-dono")
    alunos = B.sql_principal(f"""select id::text, nome, config from {S}.pacientes where personal_id = '{lucas_p}' and deleted_at is null and ativo
                                 and {S}.whatsapp_destino(telefone) is not null""")
    cfg_prof = (B.sql_principal(f"select config from {S}.profiles where id = '{lucas_p}'") or [{}])[0].get("config")
    original = {"alunos": {a["id"]: (a["config"] or {}).get("mensagens_automaticas", "__sem__") for a in alunos},
                "aviso": (cfg_prof or {}).get("aviso_mensagens_w14", "__sem__")}
    B.json_arquivo(B.SCRATCH / f"faixa_original_{prefixo}.json", original)
    fila_antes = B.sql_principal(f"select count(*)::int n from {S}.mensagens_whatsapp where nutricionista_id = '{lucas_p}'")[0]["n"]
    regra_antiga = B.sql_principal(f"""select count(*)::int n from {S}.pacientes p where p.nutricionista_id = '{lucas_p}' and p.deleted_at is null and p.ativo
                                        and {S}.whatsapp_destino(p.telefone) is not null and not {S}.w14_ajuste(p.config, 'mensagens_automaticas', false)""")[0]["n"]
    # o WhatsApp do Lucas no Physiq (desconectado: o celular de envio não atende instância desconectada) e o aviso ainda não visto
    B.sql_principal(f"delete from {S}.whatsapp_instancias where nutricionista_id = '{lucas_p}'")
    B.sql_principal(f"insert into {S}.whatsapp_instancias (nutricionista_id, status, numero_e164) values ('{lucas_p}', 'desconectado', '+5500900001400')")
    B.sql_principal(f"update {S}.profiles set config = coalesce(config, '{{}}'::jsonb) - 'aviso_mensagens_w14' where id = '{lucas_p}'")
    for a in alunos:
        B.sql_principal(f"update {S}.pacientes set config = coalesce(config, '{{}}'::jsonb) - 'mensagens_automaticas' where id = '{a['id']}'")
    try:
        st, r = B.rpc("w13-dono", "mensagens_desligadas", {})
        nomes = sorted(x["nome"] for x in (r or {}).get("alunos", [])) if isinstance(r, dict) else []
        p.check(regra_antiga == 0, f"F1 antes (regra da W14, só nutricionista): o Lucas (personal) não tinha ninguém na lista → {regra_antiga}")
        p.check(st == 200 and r.get("mostrar") is True and r.get("total") == len(alunos) >= 2, f"F2 agora: os alunos de quem ele é o PERSONAL ({r.get('total') if isinstance(r, dict) else r}: {nomes})")
        B.saude_ok("a faixa do personal")
        c = entrar_treinos(nav, base, prefixo, "faixa_personal", "w13-dono")
        try:
            ok = c.esperar(lambda: c.tem("[data-faixa-mensagens]") and c.tem("[data-meus-treinos]") and not c.tem('[data-meus-treinos="carregando"]'), 120)
            txt = c.pg.locator("[data-faixa-mensagens]").inner_text() if ok else ""
            p.check(ok and f"{len(alunos)} alunos estão com as mensagens automáticas do WhatsApp desligadas" in txt, f"F3 a faixa aparece para o personal ({txt.splitlines()[0] if txt else '-'})")
            c.pg.locator("[data-faixa-mensagens-ver]").click()
            ok = c.esperar(lambda: c.pg.locator("[data-mensagens-aluno]").count() == len(alunos), 30)
            p.check(ok, "F4 'Ver quais': a lista = o número (Rafael e Beatriz)")
            c.pg.wait_for_timeout(800)
            c.print("faixa_personal_lista")
            c.pg.locator("[data-mensagens-lista-ligar]").click()
            ok = B.esperar(lambda: all(B.sql_principal(f"select {S}.w14_ajuste(config, 'mensagens_automaticas', false) as l from {S}.pacientes where id = '{a['id']}'")[0]["l"] for a in alunos), 30, 2)
            visto = (B.sql_principal(f"select config->'aviso_mensagens_w14' as v from {S}.profiles where id = '{lucas_p}'") or [{}])[0].get("v") or {}
            p.check(bool(ok) and visto.get("acao") == "ligar_todos" and visto.get("ligados") == len(alunos), f"F5 'Ligar para os {len(alunos)}' liga exatamente os da lista e fecha o aviso → {visto}")
            p.check(c.esperar(lambda: not c.tem("[data-faixa-mensagens]"), 20), "F6 a faixa some (aviso único)")
        finally:
            c.fim()
        st, r = B.rpc("w13-dono", "mensagens_desligadas", {})
        p.check(isinstance(r, dict) and r.get("mostrar") is False, "F7 depois de ligar: não volta (o aviso fica guardado no perfil)")
    finally:
        # desfaz: os ajustes dos alunos de TESTE, o aviso e o WhatsApp de teste do Lucas
        for a in alunos:
            v = original["alunos"].get(a["id"], "__sem__")
            if v == "__sem__":
                B.sql_principal(f"update {S}.pacientes set config = coalesce(config, '{{}}'::jsonb) - 'mensagens_automaticas' where id = '{a['id']}'")
            else:
                B.sql_principal(f"update {S}.pacientes set config = coalesce(config, '{{}}'::jsonb) || jsonb_build_object('mensagens_automaticas', {str(bool(v)).lower()}) where id = '{a['id']}'")
        if original["aviso"] == "__sem__":
            B.sql_principal(f"update {S}.profiles set config = coalesce(config, '{{}}'::jsonb) - 'aviso_mensagens_w14' where id = '{lucas_p}'")
        else:
            B.sql_principal(f"update {S}.profiles set config = coalesce(config, '{{}}'::jsonb) || jsonb_build_object('aviso_mensagens_w14', '{json.dumps(original['aviso'])}'::jsonb) where id = '{lucas_p}'")
        B.sql_principal(f"delete from {S}.whatsapp_instancias where nutricionista_id = '{lucas_p}'")
        fila_depois = B.sql_principal(f"select count(*)::int n from {S}.mensagens_whatsapp where nutricionista_id = '{lucas_p}'")[0]["n"]
        p.check(fila_depois == fila_antes, f"F8 nenhuma mensagem foi para a fila do Lucas ({fila_antes} → {fila_depois}); ajustes de teste desfeitos")
    # negativo: quem já viu o aviso (a Camila) e quem não tem WhatsApp no Physiq (o Bruno) não veem faixa
    st, r = B.rpc("w13-nutri", "mensagens_desligadas", {})
    p.check(isinstance(r, dict) and r.get("mostrar") is False, f"F9 Camila (já fechou o aviso na W14) não vê de novo ({r.get('visto') if isinstance(r, dict) else r})")
    st, r = B.rpc("w13-personal2", "mensagens_desligadas", {})
    p.check(isinstance(r, dict) and r.get("mostrar") is False and r.get("whatsapp") is False, "F10 Bruno (sem WhatsApp no Physiq) não vê faixa")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--prefixo", default="local")
    ap.add_argument("--so", default="", help="rodar só os casos (vírgula): meus,quem,pastas,global,biblioteca,historico,link,negativos,faixa")
    a = ap.parse_args()
    so = set(filter(None, a.so.split(",")))
    quer = lambda k: not so or k in so  # noqa: E731
    B.saude_ok("a massa")
    m = massa()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        try:
            if quer("meus"):
                caso_meus_treinos(nav, a.base, a.prefixo, m)
                time.sleep(3)
            if quer("quem"):
                caso_quem_recebe(nav, a.base, a.prefixo, m)
                time.sleep(3)
            if quer("pastas"):
                caso_pastas(nav, a.base, a.prefixo, m)
                time.sleep(3)
            if quer("global"):
                caso_global(nav, a.base, a.prefixo)
                time.sleep(3)
            if quer("biblioteca"):
                caso_biblioteca(nav, a.base, a.prefixo, m)
                time.sleep(3)
            if quer("historico"):
                caso_historico_relatorio(nav, a.base, a.prefixo, m)
                time.sleep(3)
            if quer("link"):
                caso_link_antigo(nav, a.base, a.prefixo)
                time.sleep(3)
            if quer("negativos"):
                caso_negativos(nav, a.base, a.prefixo)
                time.sleep(3)
            if quer("faixa"):
                caso_faixa_personal(nav, a.base, a.prefixo)
        finally:
            nav.close()
    # a massa volta ao começo (o exercício próprio e os treinos/pastas criados pelo E2E saem)
    massa()
    return p.fim()


if __name__ == "__main__":
    raise SystemExit(main())
