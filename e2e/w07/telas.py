#!/usr/bin/env python3
"""Physiq W7 — E2E de TELA do Perfil do aluno (tela 5) e da falha F4 (Playwright; contexto limpo por caso; em série — o Banco do
Treino é uma VM Nano), com os prints no tamanho do app (390 × 844 × 3,4). Staging; só contas de TESTE (e2e/w07/contas.py).

Casos (na ordem; cada um devolve o que mexeu):
  aluno         w7-aluno (Treino + Nutrição): a tela 5 (card, Meus profissionais com WhatsApp, Agenda, Pagamentos "Vence em 3
                dias", Lembrete 18:30, Som, Aparência), escuro e claro; Aparência, Lembrete (mesma chave, 19:00) e Som (mesma chave)
  so_treino     w7-treino: barra Treino · Evolução · Perfil; sem NUTRIÇÃO
  paciente      w7-paciente (só Nutrição): Perfil sem Lembrete/Som; Agenda com as próximas e as dos últimos 3 meses
  conta         w7-aluno: Conta › senha (trocar; a nova entra, a antiga não) · excluir3: "Criar senha" (P25)
  staff         w7-staff (dona de conta e aluna): Excluir recusa apontando o painel (nada é apagado)
  bloqueado     conta W7 com os alunos pausados pelo master: trava "Acesso pausado" → Perfil reduzido (Sair, Exportar, Excluir)
  inadimplente  bloqueio do inadimplente ligado + mensalidade vencida: só Perfil › Pagamentos abre
  exportar      excluir1: baixa o JSON (conteúdo conferido)
  sem_prof      excluir2 (aluno sem professor, vem do Calc): código errado → erro no popup; certo → popup com nome/foto/tipo;
                Cancelar não vincula; Confirmar vincula
  link          excluir3: o link ?prof= deslogado (entra → popup; Cancelar descarta) e logado (popup na hora; Confirmar vincula)
  excluir       excluir1: Excluir com a confirmação digitada (errada → botão travado; EXCLUIR → excluída e volta ao Entrar)
Uso: python3 e2e/w07/telas.py --base http://localhost:5173 --prefixo local [--casos a,b]
"""
from __future__ import annotations

import argparse
import json
import secrets
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

p = B.p
S = "staging"
B.ESTADO["schema"] = S
LEMBRETE = "physiq_workout_reminder"
SOM = "physiq_som_descanso"


def q(sql: str) -> list:
    return B.sql_principal(sql)


def conta_w7() -> str:
    return q(f"select id::text from {S}.contas where nome = '{B.NOME_CONTA}' order by criado_em limit 1")[0]["id"]


def abrir(nav, a, conta: str, rota: str, nome: str, extra: dict | None = None, tema: str | None = None) -> B.Caso:
    c = B.Caso(nav, a.base, a.prefixo, nome, desktop=False)
    c.ctx.grant_permissions(["notifications"], origin=a.base)
    c.entrar(conta, "/privacidade", zerar=True)
    itens = {**(extra or {})}
    if tema:
        itens["physiq_tema"] = tema
    if itens:
        c.pg.evaluate("(o) => { for (const [k, v] of Object.entries(o)) localStorage.setItem(k, v); }", itens)
    c.ir(rota)
    c.fechar_avisos()
    return c


def barra(c) -> list[str]:
    return [x.strip() for x in c.pg.locator("[data-tabbar] [data-aba]").all_inner_texts()]


def esperar_perfil(c, timeout: float = 25) -> bool:
    return c.esperar(lambda: c.tem("[data-aba-perfil]") and c.tem("[data-perfil-linha], [data-perfil-reduzido]") and not c.tem("[data-estado='carregando']"), timeout)


def caso_aluno(nav, a) -> None:
    c = abrir(nav, a, "w7-aluno", "/perfil", "aluno", {LEMBRETE: json.dumps({"hour": 18, "minute": 30, "enabled": True}), SOM: "bip"}, tema="escuro")
    ok = esperar_perfil(c) and c.esperar(lambda: c.tem("[data-profissional='personal']") and "Vence em" in c.texto(), 20)
    t = c.texto()
    p.check(ok, "Perfil abriu com o card, os profissionais e o chip de Pagamentos")
    p.check("Rafael Moura" in t and "Aluno desde mar/2026 · Objetivo: definição" in t and "TREINO" in t and "NUTRIÇÃO" in t, "card do aluno igual à tela 5")
    p.check("Lucas Ferreira" in t and "Personal trainer" in t and "Camila Rocha" in t and "Nutricionista" in t, "Meus profissionais: nome e papel")
    wa = c.pg.locator("[data-profissional-whatsapp]").evaluate_all("(els) => els.map((e) => e.getAttribute('data-profissional-whatsapp'))")
    p.check(sorted(wa) == ["https://wa.me/5582999990071", "https://wa.me/5582999990072"], f"botões de conversa abrem o WhatsApp de cada um ({wa})")
    p.check(c.pg.locator("[data-perfil-agenda-valor]").inner_text() == "sáb, 03/10", f"Agenda: a próxima ({c.pg.locator('[data-perfil-agenda-valor]').inner_text()})")
    p.check("Vence em 3 dias" in c.pg.locator("[data-perfil-pagamentos-chip]").inner_text(), "Pagamentos: 'Vence em 3 dias' (âmbar)")
    p.check(c.pg.locator("[data-perfil-lembrete-valor]").inner_text() == "18:30" and c.pg.locator("[data-perfil-som-valor]").inner_text() == "Bip"
            and c.pg.locator("[data-perfil-tema-valor]").inner_text() == "Escuro", "Lembrete 18:30 · Som Bip · Aparência Escuro (as chaves de hoje)")
    for l in ("Exportar meus dados", "Excluir minha conta", "Sair"):
        p.check(l in t, f"'{l}' no Perfil")
    p.check("Physiq " in c.pg.locator("[data-perfil-rodape]").inner_text(), f"rodapé com a versão ({c.pg.locator('[data-perfil-rodape]').inner_text()})")
    p.check(barra(c) == ["Treino", "Evolução", "Perfil"], f"barra de abas: {barra(c)}")
    c.print("perfil_escuro")
    # Lembrete: a MESMA chave/formato da TreinosPage
    c.pg.locator("text=Lembrete de treino").click()
    c.esperar(lambda: c.tem("[data-sheet-lembrete]"), 8)
    c.print("lembrete")
    c.pg.locator("[data-lembrete-hora]").fill("19:00")
    c.pg.locator("[data-lembrete-salvar]").click()
    c.esperar(lambda: not c.tem("[data-sheet-lembrete]"), 8)
    guardado = c.pg.evaluate(f"JSON.parse(localStorage.getItem('{LEMBRETE}'))")
    p.check(guardado == {"hour": 19, "minute": 0, "enabled": True} and c.pg.locator("[data-perfil-lembrete-valor]").inner_text() == "19:00",
            f"Lembrete salvo na chave de hoje ({guardado})")
    # Som: a MESMA chave (o timer da TreinosPage lê daqui)
    c.pg.locator("text=Som do descanso").click()
    c.esperar(lambda: c.tem("[data-sheet-som]"), 8)
    c.print("som")
    c.pg.locator("[data-som-opcao='sino']").click()
    c.pg.wait_for_timeout(400)
    p.check(c.pg.evaluate(f"localStorage.getItem('{SOM}')") == "sino", "Som do descanso gravado na chave de hoje (sino)")
    c.pg.keyboard.press("Escape")
    # Aparência: claro e de volta
    c.pg.evaluate(f"localStorage.setItem('{SOM}', 'bip')")
    c.pg.locator("text=Aparência").click()
    c.esperar(lambda: c.tem("[data-pagina-aparencia]"), 10)
    c.pg.locator("[data-tema-opcao='claro']").click()
    c.pg.wait_for_timeout(500)
    p.check(c.pg.evaluate("document.documentElement.getAttribute('data-tema')") == "claro" and c.pg.evaluate("localStorage.getItem('physiq_tema')") == "claro",
            "Aparência: Claro aplicado (data-tema + a chave physiq_tema)")
    c.print("aparencia_claro")
    c.ir("/perfil")
    esperar_perfil(c)
    c.esperar(lambda: c.tem("[data-profissional='personal']"), 15)
    p.check(c.pg.locator("[data-perfil-tema-valor]").inner_text() == "Claro", "Perfil mostra Aparência: Claro")
    c.print("perfil_claro")
    c.pg.evaluate("localStorage.setItem('physiq_tema', 'escuro')")
    c.ir("/perfil/agenda")
    c.esperar(lambda: c.tem("[data-pagina-agenda]") and c.tem("[data-agenda-proxima]"), 15)
    c.pg.evaluate("document.documentElement.setAttribute('data-tema', 'escuro')")
    p.check("Retorno da nutrição" in c.texto() and "Avaliação física" in c.texto(), "Agenda do aluno: a próxima e a anterior")
    c.print("agenda_aluno")
    c.fim()


def caso_so_treino(nav, a) -> None:
    c = abrir(nav, a, "w7-treino", "/perfil", "so-treino", tema="escuro")
    esperar_perfil(c)
    c.esperar(lambda: c.tem("[data-profissional='personal']"), 15)
    t = c.texto()
    p.check(barra(c) == ["Treino", "Evolução", "Perfil"], f"só Treino: barra {barra(c)}")
    p.check("TREINO" in t and "NUTRIÇÃO" not in t and "Lembrete de treino" in t and "Som do descanso" in t, "só Treino: chip TREINO, Lembrete e Som")
    p.check("Lucas Ferreira" in t and "Camila Rocha" not in t, "só Treino: só o personal em Meus profissionais")
    c.print("perfil_so_treino")
    c.fim()


def caso_paciente(nav, a) -> None:
    c = abrir(nav, a, "w7-paciente", "/perfil", "paciente", tema="escuro")
    esperar_perfil(c)
    c.esperar(lambda: c.tem("[data-profissional='nutricionista']") and c.pg.locator("[data-perfil-agenda-valor]").inner_text() not in ("…", ""), 20)
    t = c.texto()
    p.check(barra(c) == ["Evolução", "Perfil"], f"só Nutrição: barra {barra(c)}")
    p.check("NUTRIÇÃO" in t and "TREINO" not in t and "Lembrete de treino" not in t and "Som do descanso" not in t, "só Nutrição: sem Lembrete e Som")
    p.check(c.pg.locator("[data-perfil-agenda-valor]").inner_text() == "ter, 06/10", f"Agenda: a próxima ({c.pg.locator('[data-perfil-agenda-valor]').inner_text()})")
    c.print("perfil_paciente")
    c.pg.locator("text=Agenda").first.click()
    c.esperar(lambda: c.tem("[data-agenda-lista='anteriores']"), 15)
    t = c.texto()
    p.check("Consulta de retorno" in t and "Primeira consulta" in t and "Retorno (desmarcado)" in t and "Desmarcado pela nutricionista" in t,
            "Agenda do paciente: próximas + últimos 3 meses (com o desmarcado), na voz dele")
    pag = c.pg.locator("[data-pagina-agenda]")
    p.check(pag.get_attribute("data-proximos") == "1" and pag.get_attribute("data-anteriores") == "2", "1 próxima e 2 anteriores (N-53)")
    c.print("agenda_paciente")
    c.fim()


def caso_conta(nav, a) -> None:
    email, antiga = B.CONTAS["w7-aluno"]
    nova = f"Nv{secrets.token_urlsafe(9)}7"  # gerada na hora (repo público: nada de senha em arquivo)
    c = abrir(nav, a, "w7-aluno", "/perfil/conta", "conta", tema="escuro")
    c.esperar(lambda: c.tem("[data-form-senha]"), 20)
    p.check(c.pg.locator("[data-form-senha]").get_attribute("data-form-senha") == "trocar" and "Esqueceu a senha? Fale com o seu profissional." in c.texto(),
            "Conta: quem entra com senha vê 'Trocar senha' e o 'esqueci' com o profissional")
    p.check(B.EMAIL["w7-aluno"] in c.pg.locator("[data-conta-email]").inner_text(), "Conta: o e-mail")
    c.print("conta")
    c.pg.locator("[data-senha-nova] input, input[data-senha-nova]").first.fill("curta")
    c.pg.locator("[data-senha-confirmacao] input, input[data-senha-confirmacao]").first.fill("curta")
    c.pg.locator("[data-senha-salvar]").click()
    p.check(c.esperar(lambda: c.tem("[data-senha-erro]"), 6), "senha fraca → erro (nada muda)")
    c.pg.locator("input[data-senha-nova]").fill(nova)
    c.pg.locator("input[data-senha-confirmacao]").fill(nova)
    c.pg.locator("[data-senha-salvar]").click()
    p.check(c.esperar(lambda: "Senha trocada." in c.texto(), 12), "Trocar senha → 'Senha trocada.'")
    c.print("conta_senha")
    c.fim()
    st_nova, _, _ = B.http("POST", f"{B.API_P}/auth/v1/token?grant_type=password", {"email": email, "password": nova}, {"apikey": B.anon(B.PRINCIPAL_REF)})
    st_antiga, _, _ = B.http("POST", f"{B.API_P}/auth/v1/token?grant_type=password", {"email": email, "password": antiga}, {"apikey": B.anon(B.PRINCIPAL_REF)})
    p.check(st_nova == 200 and st_antiga == 400, f"a senha nova entra ({st_nova}) e a antiga não ({st_antiga})")
    B.garantir_usuario(email, antiga, B.NOMES["w7-aluno"])  # volta a senha do arquivo (os outros casos entram com ela)
    B.esquecer_token("w7-aluno")
    # "Criar senha" (P25): quem entrou com o Google teve a senha trocada por uma aleatória (excluir2: aluno sem professor do Calc)
    e2, s2 = B.CONTAS["excluir2"]
    sp = B.service(B.PRINCIPAL_REF)
    u2 = B.uid("excluir2")
    B.http("PUT", f"{B.PRINCIPAL_URL}/auth/v1/admin/users/{u2}", {"app_metadata": {"calc": True, "senha_trocada_google_em": "2026-09-29T12:00:00Z"}},
           {"apikey": sp, "Authorization": f"Bearer {sp}"})
    c = abrir(nav, a, "excluir2", "/perfil/conta", "conta-criar", tema="escuro")
    c.esperar(lambda: c.tem("[data-form-senha]"), 25)
    ok = c.pg.locator("[data-form-senha]").get_attribute("data-form-senha") == "criar" and "Criar senha" in c.texto()
    criada = f"Cr{secrets.token_urlsafe(9)}9"
    c.pg.locator("input[data-senha-nova]").fill(criada)
    c.pg.locator("input[data-senha-confirmacao]").fill(criada)
    c.pg.locator("[data-senha-salvar]").click()
    ok2 = c.esperar(lambda: "Senha criada" in c.texto(), 12)
    c.print("conta_criar_senha")
    c.fim()
    st, _, _ = B.http("POST", f"{B.API_P}/auth/v1/token?grant_type=password", {"email": e2, "password": criada}, {"apikey": B.anon(B.PRINCIPAL_REF)})
    st_errada, _, _ = B.http("POST", f"{B.API_P}/auth/v1/token?grant_type=password", {"email": e2, "password": "Errada123x"}, {"apikey": B.anon(B.PRINCIPAL_REF)})
    p.check(ok and ok2 and st == 200 and st_errada == 400, f"P25: 'Criar senha' → a criada entra ({st}), a errada não ({st_errada})")
    B.garantir_usuario(e2, s2, B.NOMES["excluir2"])
    B.esquecer_token("excluir2")


def caso_staff(nav, a) -> None:
    antes = B.uid("w7-staff")
    c = abrir(nav, a, "w7-staff", "/perfil", "staff", tema="escuro")
    esperar_perfil(c)
    c.pg.locator("text=Excluir minha conta").click()
    ok = c.esperar(lambda: c.tem("[data-excluir-recusa='profissional']"), 20)
    p.check(ok and "não é excluída pelo app do aluno" in c.texto() and c.tem("[data-excluir-painel]") and not c.tem("[data-excluir-confirmar]"),
            "profissional que também é aluno: Excluir recusa, aponta o painel e não mostra o botão de excluir")
    c.print("excluir_staff")
    c.fim()
    p.check(B.uid("w7-staff") == antes, "w7-staff continua com login")


def caso_bloqueado(nav, a) -> None:
    cid = conta_w7()
    q(f"update {S}.contas set alunos_bloqueados_em = now(), alunos_bloqueados_msg = 'Regularize com o Lucas.' where id = '{cid}'")
    try:
        c = abrir(nav, a, "w7-aluno", "/treino", "bloqueado", tema="escuro")
        ok = c.esperar(lambda: c.tem("[data-trava-app='bloqueio-master']"), 25)
        p.check(ok and "Regularize com o Lucas." in c.texto() and c.tem("[data-trava-meus-dados]"), "bloqueado: 'Acesso pausado' com a mensagem e o botão dos dados")
        c.print("bloqueado_trava")
        c.pg.locator("[data-trava-meus-dados]").click()
        esperar_perfil(c)
        t = c.texto()
        p.check(c.tem("[data-aba-perfil='reduzido']") and "Exportar meus dados" in t and "Excluir minha conta" in t and "Sair" in t
                and "Meus profissionais" not in t and "Pagamentos" not in t and "Lembrete de treino" not in t, "Perfil reduzido: só Sair, Exportar e Excluir (spec 9)")
        c.print("bloqueado_perfil")
        c.ir("/perfil/pagamentos")
        p.check(c.esperar(lambda: c.tem("[data-trava-app='bloqueio-master']"), 15), "bloqueado: os itens do Perfil (Pagamentos) continuam fechados")
        c.fim()
    finally:
        q(f"update {S}.contas set alunos_bloqueados_em = null, alunos_bloqueados_msg = null where id = '{cid}'")


def caso_inadimplente(nav, a) -> None:
    cid = conta_w7()
    u = B.uid("w7-aluno")
    q(f"update {S}.contas set bloquear_app_inadimplente = true where id = '{cid}'")
    q(f"update {S}.pacientes set mensalidade_pago_ate = now() - interval '5 days' where user_id = '{u}' and conta_id = '{cid}'")
    try:
        c = abrir(nav, a, "w7-aluno", "/perfil", "inadimplente", tema="escuro")
        ok = c.esperar(lambda: c.tem("[data-trava-app='pagamento-pendente']"), 25)
        p.check(ok, "inadimplente com o bloqueio ligado: o Perfil fica na trava 'Pagamento pendente'")
        c.print("inadimplente_perfil")
        c.ir("/perfil/pagamentos")
        ok = c.esperar(lambda: c.tem("[data-pagina-pagamentos]") and not c.tem("[data-trava-app]"), 25)
        p.check(ok, "só Perfil › Pagamentos abre (spec 9, R15)")
        c.esperar(lambda: "Pagar" in c.texto(), 15)
        c.print("inadimplente_pagamentos")
        c.fim()
    finally:
        q(f"update {S}.contas set bloquear_app_inadimplente = false where id = '{cid}'")
        q(f"update {S}.pacientes set mensalidade_pago_ate = now() + interval '3 days 2 hours' where user_id = '{u}' and conta_id = '{cid}'")


def caso_exportar(nav, a) -> None:
    c = abrir(nav, a, "excluir1", "/perfil", "exportar", tema="escuro")
    esperar_perfil(c)
    c.pg.locator("text=Exportar meus dados").click()
    c.esperar(lambda: c.tem("[data-sheet-exportar]"), 8)
    c.print("exportar")
    with c.pg.expect_download(timeout=60000) as d:
        c.pg.locator("[data-exportar-baixar]").click()
    dl = d.value
    destino = B.PRINTS.parent.parent / "w07" / f"{a.prefixo}-{dl.suggested_filename}"
    dl.save_as(str(destino))
    arq = json.loads(destino.read_text(encoding="utf-8"))
    bp, bt = arq.get("banco_principal") or {}, arq.get("banco_do_treino") or {}
    p.check(dl.suggested_filename.startswith("physiq-meus-dados-") and dl.suggested_filename.endswith(".json"), f"arquivo {dl.suggested_filename}")
    p.check(arq.get("formato") == "physiq-exportacao/1" and bp.get("login", {}).get("email") == B.EMAIL["excluir1"]
            and len(bp.get("tabelas", {}).get("diario_alimentar", [])) == 1 and len(bt.get("tabelas", {}).get("tb_treino_series", [])) == 2,
            f"conteúdo do JSON conferido: login, diário e as séries do Treino ({destino})")
    c.esperar(lambda: c.tem("[data-exportar-ok]"), 10)
    c.print("exportar_ok")
    c.fim()


def popup_codigo(c, codigo: str) -> None:
    c.pg.locator("input[data-perfil-codigo-campo]").fill(codigo)
    c.pg.locator("[data-perfil-codigo-enviar]").click()


def caso_sem_prof(nav, a) -> None:
    u = B.uid("excluir2")
    c = abrir(nav, a, "excluir2", "/perfil", "sem-prof", tema="escuro")
    esperar_perfil(c)
    ok = c.esperar(lambda: c.tem("[data-perfil-codigo]"), 25)
    p.check(ok, "aluno sem profissional: o campo 'Tenho um código do meu profissional' em Meus profissionais")
    c.print("perfil_sem_profissional")
    popup_codigo(c, "PROF-NAO-EXISTE-W7")
    ok = c.esperar(lambda: c.tem("[data-popup-vinculo='erro-codigo_invalido']"), 20)
    p.check(ok and "Não achamos esse código" in c.texto(), "código errado → erro claro no popup")
    c.print("popup_codigo_errado")
    c.pg.locator("[data-vinculo-fechar]").click()
    c.esperar(lambda: not c.tem("[data-popup-vinculo]"), 8)
    popup_codigo(c, "prof-lucas-ferreira")
    ok = c.esperar(lambda: c.tem("[data-popup-vinculo='confirmar']"), 20)
    p.check(ok and c.pg.locator("[data-vinculo-nome]").inner_text() == "Lucas Ferreira" and "PERSONAL" in c.pg.locator("[data-vinculo-tipo]").inner_text().upper()
            and c.pg.locator("[data-vinculo-profissional] img").count() == 1, "popup: nome, foto e tipo do profissional (Confirmar/Cancelar)")
    c.print("popup_vincular")
    c.pg.locator("[data-vinculo-cancelar]").click()
    c.esperar(lambda: not c.tem("[data-popup-vinculo]"), 8)
    n = q(f"select count(*)::int n from {S}.pacientes where user_id = '{u}'")[0]["n"]
    p.check(n == 0, f"Cancelar não vinculou (matrículas {n})")
    popup_codigo(c, "PROF-LUCAS-FERREIRA")
    c.esperar(lambda: c.tem("[data-vinculo-confirmar]"), 20)
    c.pg.locator("[data-vinculo-confirmar]").click()
    ok = c.esperar(lambda: c.tem("[data-profissional='personal']"), 40)
    n = q(f"select count(*)::int n from {S}.pacientes where user_id = '{u}' and personal_id = '{B.uid('w7-personal')}'")[0]["n"]
    p.check(ok and n == 1 and "Lucas Ferreira" in c.texto(), f"Confirmar vinculou: a seção mostra o Lucas (matrícula {n})")
    c.print("perfil_vinculado")
    c.fim()


def caso_link(nav, a) -> None:
    u = B.uid("excluir3")
    codigo = "PROF-CAMILA-ROCHA-W7"
    # (2) deslogado: o link guarda o código; entra com e-mail e senha; o popup abre no app
    c = B.Caso(nav, a.base, a.prefixo, "link-deslogado", desktop=False)
    c.ir(f"/entrar?prof={codigo.lower()}")
    c.esperar(lambda: c.tem("[data-entrar-email]"), 20)
    p.check(c.pg.evaluate("localStorage.getItem('physiq_prof_pendente')") == codigo and "prof=" not in c.caminho(),
            f"link deslogado: o código fica guardado e sai da barra ({c.caminho()})")
    c.ir("/entrar/email")
    c.esperar(lambda: c.tem("input[type='email']"), 15)
    c.pg.locator("input[type='email']").fill(B.EMAIL["excluir3"])
    c.pg.locator("input[type='password']").fill(B.CONTAS["excluir3"][1])
    c.pg.locator("[data-btn-entrar]").click()
    ok = c.esperar(lambda: c.tem("[data-popup-vinculo='confirmar']"), 40)
    p.check(ok and c.pg.locator("[data-vinculo-nome]").inner_text() == "Camila Rocha" and "NUTRICIONISTA" in c.pg.locator("[data-vinculo-tipo]").inner_text().upper(),
            "entrou → o popup abre com o código guardado (nome, foto e tipo)")
    c.print("popup_link_login")
    c.pg.locator("[data-vinculo-cancelar]").click()
    c.esperar(lambda: not c.tem("[data-popup-vinculo]"), 8)
    n = q(f"select count(*)::int n from {S}.pacientes where user_id = '{u}'")[0]["n"]
    p.check(n == 0 and c.pg.evaluate("localStorage.getItem('physiq_prof_pendente')") is None, f"Cancelar: nada vinculado ({n}) e o código descartado")
    c.pg.reload(wait_until="domcontentloaded")
    c.pg.wait_for_timeout(2500)
    p.check(not c.tem("[data-popup-vinculo]"), "recarregar não traz o popup de volta")
    # (1) já logado abre o link → o popup na hora → Confirmar vincula
    c.ir(f"/?prof={codigo}")
    ok = c.esperar(lambda: c.tem("[data-popup-vinculo='confirmar']"), 30)
    p.check(ok, "logado: abrir o link mostra o popup na hora")
    c.print("popup_link")
    c.pg.locator("[data-vinculo-confirmar]").click()
    c.esperar(lambda: not c.tem("[data-popup-vinculo]"), 20)
    time.sleep(1.5)
    n = q(f"select count(*)::int n from {S}.pacientes where user_id = '{u}' and nutricionista_id = '{B.uid('w7-nutri')}'")[0]["n"]
    p.check(n == 1, f"Confirmar vinculou com a nutricionista (matrícula {n})")
    c.fim()


def caso_excluir(nav, a) -> None:
    import api as API  # noqa: PLC0415 — as contagens e a conferência do servidor (e2e/w07/api.py)
    c = abrir(nav, a, "excluir1", "/perfil", "excluir", tema="escuro")
    esperar_perfil(c)
    c.pg.locator("text=Excluir minha conta").click()
    ok = c.esperar(lambda: c.tem("[data-excluir-apaga]") and c.tem("[data-excluir-confirmacao]"), 30)
    t = c.texto()
    p.check(ok and "Vai ser apagado" in t and "Fica com o seu profissional" in t and "1 treino(s) feito(s) e 2 série(s)" in t,
            "Excluir: a conferência mostra o que sai e o que fica, com os números da conta")
    botao = c.pg.locator("[data-excluir-confirmar]")
    p.check(botao.is_disabled(), "sem a palavra, o botão fica travado")
    c.pg.locator("input[data-excluir-confirmacao]").fill("EXCLUI")
    p.check(botao.is_disabled(), "palavra errada (EXCLUI) → botão travado (negativo)")
    c.pg.locator("input[data-excluir-confirmacao]").fill("EXCLUIR")
    p.check(not botao.is_disabled(), "EXCLUIR digitado → botão liga")
    c.print("excluir")
    API.foto("excluir1", "antes")  # a foto das contagens logo antes (nada mais mexe nas tabelas entre ela e o clique)
    botao.click()
    ok = c.esperar(lambda: c.caminho().startswith("/entrar"), 60)
    p.check(ok, f"conta excluída → volta ao Entrar ({c.caminho()})")
    c.print("excluido")
    c.fim()
    API.conferir("excluir1")


CASOS = {
    "aluno": caso_aluno, "so_treino": caso_so_treino, "paciente": caso_paciente, "conta": caso_conta, "staff": caso_staff,
    "bloqueado": caso_bloqueado, "inadimplente": caso_inadimplente, "exportar": caso_exportar, "sem_prof": caso_sem_prof,
    "link": caso_link, "excluir": caso_excluir,
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--casos", default=",".join(CASOS))
    # hml-18a: o E2E de tela sempre com o Edge no notebook (o Chromium do Playwright cai nas páginas longas — hml-11/hml-16)
    ap.add_argument("--canal", default="chromium", choices=("chromium", "msedge", "chrome"))
    a = ap.parse_args()
    a.base = a.base.rstrip("/")
    with sync_playwright() as pw:
        nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox"])
        try:
            for nome in [x.strip() for x in a.casos.split(",") if x.strip()]:
                print(f"\n== {nome}", flush=True)
                if not B.saude_treino():
                    p.check(False, "Banco do Treino lento/instável — parei antes do caso (nada de restart)")
                    break
                try:
                    CASOS[nome](nav, a)
                except Exception as e:  # noqa: BLE001
                    p.check(False, f"[{nome}] exceção: {type(e).__name__}: {str(e)[:300]}")
                    caso = B.ESTADO.get("caso")
                    if caso:
                        caso.diagnostico()
                        try:
                            caso.ctx.close()
                        except Exception:  # noqa: BLE001
                            pass
                time.sleep(2)
        finally:
            nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
