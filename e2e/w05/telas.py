#!/usr/bin/env python3
"""Physiq W5 — E2E da EQUIPE e das Configurações do profissional (Playwright, contexto limpo por caso) + prova nos 2 bancos,
com os prints nos tamanhos das telas aprovadas (painel 1280 × 883 × 2 = 2560 × 1766, como as telas 7 e 8; celular 390 × 3,4).

Casos, na ordem (cada um usa o que o anterior deixou; `contas_equipe.py --zerar` antes):
  dono       dono da conta nova convida o personal e a nutri pela tela (Equipe › Convidar, papéis do plano), com os negativos
             (e-mail real no staging, o próprio e-mail, sem papel); convites pendentes na lista (tela 7); e-mail no Resend
  personal   o personal entra (aceite no 1º login) → painel com a conta; Configurações só com Perfil, Convite e Aplicativo;
             Equipe/Conta/Plano recusados; o código dele no Convite; Perfil salvo (tela 8)
  nutri      a nutri entra → aceita; sem Treino (não troca token): a página antiga do Treino mostra "é do módulo Treino"
  alunos     aluno 1 entra pelo LINK do Convite do personal (?prof=), aluno 2 pelo código da nutri → matrículas certas
  matriz     quem vê o quê (4.1/P1): dono vê os 2 alunos; personal só o dele; nutri só a dela — no principal (RLS) e no Treino
             (admin-list-users / espelho); a equipe só para o dono
  papeis     dono dá o papel de nutricionista ao personal e tira de novo → espelho no Treino
  remover    dono remove o personal (o aluno dele fica "sem responsável") → perde o acesso nos 2 bancos (fila do espelho
             processada na hora): principal (RLS, situação), Treino (papel, espelho, acesso, aluno sem professor, token antigo
             recusado) e a tela ("Você não faz mais parte desta conta")
  legado     legado Calc: Equipe com o aviso (sem convidar), Conta e Convite com o código de hoje
  master     o master vê todas as abas; nada trava
  telas      Perfil, Conta, Convite e Aplicativo do dono (prints) + a Equipe no celular
Uso: python3 e2e/w05/telas.py --base http://localhost:5173 --prefixo local [--casos a,b]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

p = B.p
EST: dict = {}
RESEND = "https://api.resend.com"


def conta_id() -> str:
    u = B.uid("w5-dono")
    return B.sql_principal(f"select id::text from {B.schema()}.contas where dono_id = '{u}' and origem = 'nova' order by criado_em limit 1")[0]["id"]


def membros() -> list[dict]:
    return B.sql_principal(f"""select m.id::text, lower(u.email) as email, m.papeis, m.status, m.codigo_convite from {B.schema()}.conta_membros m
                               left join auth.users u on u.id = m.user_id where m.conta_id = '{conta_id()}' order by m.criado_em""")


def membro(conta: str) -> dict | None:
    email = B.CONTAS[conta][0]
    return next((m for m in membros() if m["email"] == email), None)


def convites() -> list[dict]:
    return B.sql_principal(f"select id::text, lower(email) as email, papeis, status from {B.schema()}.convites where conta_id = '{conta_id()}' and tipo = 'membro' order by enviado_em")


def paciente(conta: str) -> dict | None:
    r = B.sql_principal(f"select id::text, conta_id::text, personal_id::text, nutricionista_id::text from {B.schema()}.pacientes "
                        f"where user_id = '{B.uid(conta)}' and deleted_at is null order by created_at desc limit 1")
    return r[0] if r else None


def resend_do_convite(email_convidado: str) -> dict | None:
    """O e-mail do convite no Resend (conta B Code; a chave fica em ~/.physiq-resend-b-code, 600, fora do repo). Conta de
    teste → foi para a caixa de teste do Resend (delivered@resend.dev), com o destinatário no assunto."""
    arq = Path.home() / ".physiq-resend-b-code"
    if not arq.exists():
        return None
    st, r, _ = B.http("GET", f"{RESEND}/emails?limit=20", None, {"Authorization": f"Bearer {arq.read_text().strip()}"})
    if st != 200 or not isinstance(r, dict):
        return None
    for e in r.get("data", []):
        if f"[teste → {email_convidado}]" in (e.get("subject") or ""):
            return e
    return None


def abrir_equipe(c: B.Caso) -> bool:
    c.ir("/painel/configuracoes/equipe")
    return c.esperar(lambda: c.tem("[data-config-aba='equipe'][data-equipe-bloqueio]"), 90)


def convidar_pela_tela(c: B.Caso, conta: str, papel: str) -> None:
    email = B.CONTAS[conta][0]
    assert B.email_de_teste(email), f"destino não é de teste: {email}"  # trava: nenhum e-mail para pessoa real
    c.pg.locator("[data-equipe-convidar]").first.click()
    c.esperar(lambda: c.tem("[data-form-convidar]"), 20)
    c.pg.locator("[data-convidar-email]").fill(email)
    c.pg.locator(f"[data-form-convidar] [data-opcao='{papel}']").click()


def caso_dono(nav, a) -> None:
    c = B.Caso(nav, a.base, a.prefixo, "dono")
    c.entrar("w5-dono", "/painel/configuracoes/equipe")
    c.fechar_avisos()
    p.check(c.esperar(lambda: c.tem("[data-config-aba='equipe'][data-equipe-bloqueio='nenhum']"), 90), "dono: Configurações › Equipe da conta nova")
    p.check(c.pg.locator("[data-lista-membros] [data-membro]").count() == 1, "começa só com o dono")
    p.check(all(c.tem(f"[data-aba-config='{x}']") for x in ["perfil", "conta", "equipe", "plano", "recebimento", "convite", "aplicativo"]),
            "dono vê as 7 abas das Configurações")
    # negativos (nada sai por e-mail: o banco recusa antes)
    c.pg.locator("[data-equipe-convidar]").first.click()
    c.esperar(lambda: c.tem("[data-form-convidar]"), 20)
    c.pg.locator("[data-convidar-email]").fill("fulano.real@gmail.com")
    c.pg.locator("[data-form-convidar] [data-opcao='personal']").click()
    c.pg.locator("[data-convidar-enviar]").click()
    p.check(c.esperar(lambda: "só contas de teste podem ser convidadas" in c.texto(), 30), "negativo: e-mail real no staging é recusado (P26)")
    c.pg.locator("[data-convidar-email]").fill(B.CONTAS["w5-dono"][0])
    c.pg.locator("[data-convidar-enviar]").click()
    p.check(c.esperar(lambda: "Esse é o seu próprio e-mail." in c.texto(), 30), "negativo: o próprio e-mail")
    c.pg.locator("[data-convidar-email]").fill(B.CONTAS["w5-personal"][0])
    c.pg.locator("[data-form-convidar] [data-opcao='personal']").click()  # desmarca
    c.pg.locator("[data-convidar-enviar]").click()
    p.check(c.esperar(lambda: "Escolha pelo menos um papel" in c.texto(), 15), "negativo: sem papel não convida")
    c.pg.locator("[data-form-convidar] [data-opcao='personal']").click()
    c.print("convidar_form")
    c.pg.locator("[data-convidar-enviar]").click()
    p.check(c.esperar(lambda: c.tem("[data-convite-feito='enviado']"), 60), "convite do personal enviado (e-mail pelo Resend)")
    c.print("convidar_enviado")
    c.pg.locator("[data-convite-outro]").click()
    c.esperar(lambda: c.tem("[data-form-convidar]"), 10)
    c.pg.locator("[data-convidar-email]").fill(B.CONTAS["w5-nutri"][0])
    c.pg.locator("[data-form-convidar] [data-opcao='nutricionista']").click()
    c.pg.locator("[data-convidar-enviar]").click()
    p.check(c.esperar(lambda: c.tem("[data-convite-feito='enviado']"), 60), "convite da nutri enviado")
    c.pg.locator("[data-convite-fechar]").click()
    p.check(c.esperar(lambda: c.pg.locator("[data-lista-convites] [data-convite]").count() == 2, 30), "2 convites pendentes na lista (tela 7)")
    cv = convites()
    p.check(len([x for x in cv if x["status"] == "pendente"]) == 2 and {tuple(x["papeis"]) for x in cv} == {("personal",), ("nutricionista",)},
            f"no banco: 2 convites de membro com os papéis certos ({[(x['email'], x['papeis'], x['status']) for x in cv]})")
    c.print("equipe_convites")
    for conta in ("w5-personal", "w5-nutri"):
        e = None
        for _ in range(10):
            e = resend_do_convite(B.CONTAS[conta][0])
            if e and e.get("last_event") in ("delivered", "sent"):
                break
            time.sleep(3)
        p.check(bool(e) and e.get("to") == ["delivered@resend.dev"] and "convites@physiqcalc.com.br" in (e.get("from") or ""),
                f"Resend: o e-mail do convite de {conta} saiu do remetente de hoje para a caixa de teste ({(e or {}).get('from')} → {(e or {}).get('to')}, {(e or {}).get('last_event')})")
    c.fim()


def caso_personal(nav, a) -> None:
    c = B.Caso(nav, a.base, a.prefixo, "personal")
    c.entrar("w5-personal", "/")
    c.fechar_avisos()
    p.check(c.esperar(lambda: c.caminho().startswith("/painel"), 120), f"personal convidado: 1º login aceita o convite e abre o painel ({c.caminho()})")
    m = membro("w5-personal")
    p.check(bool(m) and m["status"] == "ativo" and m["papeis"] == ["personal"] and (m["codigo_convite"] or "").startswith("PROF-"),
            f"no banco: membro ativo com o papel personal e código próprio ({m})")
    p.check(c.esperar(lambda: c.tem("[data-pagina-alunos]"), 120), "o painel do Treino abre para ele (troca de token → papel professor)")
    c.ir("/painel/configuracoes")
    p.check(c.esperar(lambda: c.tem("[data-configuracoes]") and c.tem("[data-aba-config='perfil']"), 60), "Configurações do personal")
    visiveis = [x for x in ["perfil", "conta", "equipe", "plano", "recebimento", "convite", "aplicativo"] if c.tem(f"[data-aba-config='{x}']")]
    p.check(visiveis == ["perfil", "convite", "aplicativo"], f"membro vê só Perfil, Convite e Aplicativo ({visiveis})")
    c.ir("/painel/configuracoes/equipe")
    p.check(c.esperar(lambda: "/painel/configuracoes/perfil" in c.caminho(), 30), f"negativo: Equipe pela URL volta para o Perfil ({c.caminho()})")
    st, r = B.rpc("w5-personal", "equipe_da_conta", {"p_conta": conta_id()})
    p.check(isinstance(r, dict) and r.get("erro") == "so_dono", f"negativo: a equipe no banco só para o dono ({r})")
    st, r = B.rpc("w5-personal", "convidar_membro", {"p_conta": conta_id(), "p_email": "x.teste.claude@physiqnutri.app", "p_papeis": ["personal"]})
    p.check(isinstance(r, dict) and r.get("erro") == "so_dono", f"negativo: membro não convida ({r})")
    c.ir("/painel/configuracoes/convite")
    p.check(c.esperar(lambda: c.tem("[data-convite-codigo]"), 60), "Convite: código do personal")
    codigo = c.pg.locator("[data-convite-codigo]").inner_text().strip()
    EST["codigo_personal"] = codigo
    p.check(codigo == m["codigo_convite"], f"o código da tela é o do banco ({codigo})")
    link = c.pg.locator("[data-convite-link]").input_value()
    p.check(link.endswith(f"/?prof={codigo}"), f"link de hoje (?prof=) ({link})")
    c.print("convite_personal")
    c.ir("/painel/configuracoes/perfil")
    p.check(c.esperar(lambda: c.tem("[data-form-perfil]"), 60), "Perfil do personal")
    c.pg.locator("[data-perfil-registro]").fill("CREF 007007-G/PE")
    c.pg.locator("[data-perfil-whatsapp]").fill("81999990000")
    c.pg.locator("[data-perfil-cidade]").fill("Recife")
    c.pg.locator("[data-perfil-uf]").select_option("PE")
    c.pg.locator("[data-perfil-salvar]").click()
    ok = c.esperar(lambda: (B.sql_principal(f"select dados_profissionais->>'whatsapp_e164' as w from {B.schema()}.profiles where id = '{B.uid('w5-personal')}'") or [{}])[0].get("w") == "+5581999990000", 30)
    p.check(ok, "Perfil salvo no banco principal (WhatsApp em E.164)")
    c.print("perfil_personal")
    c.fim()


def caso_nutri(nav, a) -> None:
    c = B.Caso(nav, a.base, a.prefixo, "nutri")
    c.entrar("w5-nutri", "/")
    c.fechar_avisos()
    p.check(c.esperar(lambda: c.caminho().startswith("/painel"), 120), f"nutri convidada: aceita no 1º login e abre o painel ({c.caminho()})")
    m = membro("w5-nutri")
    p.check(bool(m) and m["status"] == "ativo" and m["papeis"] == ["nutricionista"], f"no banco: nutricionista ativa ({m})")
    p.check(c.esperar(lambda: c.tem("[data-sem-treino='sem-papel']"), 90), "sem papel no Treino: a página antiga do Treino diz que é do módulo Treino")
    p.check(len(c.trocas) == 0, f"a nutri não troca token com o Treino ({len(c.trocas)} chamadas)")
    c.print("nutri_pagina_treino")
    c.ir("/painel/configuracoes/convite")
    p.check(c.esperar(lambda: c.tem("[data-convite-codigo]"), 60), "Convite da nutri")
    EST["codigo_nutri"] = c.pg.locator("[data-convite-codigo]").inner_text().strip()
    visiveis = [x for x in ["perfil", "conta", "equipe", "plano", "recebimento", "convite", "aplicativo"] if c.tem(f"[data-aba-config='{x}']")]
    p.check(visiveis == ["perfil", "convite", "aplicativo"], f"nutri vê só Perfil, Convite e Aplicativo ({visiveis})")
    c.fim()


def caso_alunos(nav, a) -> None:
    codigo = EST.get("codigo_personal") or membro("w5-personal")["codigo_convite"]
    c = B.Caso(nav, a.base, a.prefixo, "aluno1", desktop=False)
    c.pg.goto(a.base + f"/?prof={codigo}", wait_until="domcontentloaded")  # o link do Convite (o app guarda o código)
    c.pg.wait_for_timeout(1500)
    c.entrar("w5-aluno1", "/", zerar=True)
    ok = c.esperar(lambda: (paciente("w5-aluno1") or {}).get("personal_id") == B.uid("w5-personal"), 90)
    p.check(ok, f"aluno 1 entrou pelo LINK do Convite do personal → matrícula na conta com ele de responsável ({paciente('w5-aluno1')})")
    p.check(c.esperar(lambda: len(c.trocas) >= 1, 60), "o aluno troca o token (tem Treino)")
    c.fim()
    cod_n = EST.get("codigo_nutri") or membro("w5-nutri")["codigo_convite"]
    tok = B.sessao("w5-aluno2")["access_token"]
    st, r = B.funcao(tok, "vincular-aluno", {"codigo": cod_n})
    pac = paciente("w5-aluno2")
    p.check(st == 200 and pac and pac["nutricionista_id"] == B.uid("w5-nutri") and pac["personal_id"] is None,
            f"aluna 2 pelo código da nutri → só nutrição ({st}, {pac})")


def treino_de(conta: str) -> dict:
    st, s = B.trocar_token(conta)
    assert st == 200, (conta, st, s)
    return s


def admin_list(tok_treino: str) -> tuple[int, list[str]]:
    st, r, _ = B.http("POST", f"{B.API_T}/functions/v1/admin-list-users", {"limit": 50},
                      {"Authorization": f"Bearer {tok_treino}", "apikey": B.anon(B.TREINO_REF), "x-schema": B.schema(), "Origin": "https://physiqcalc-staging.vercel.app"})
    return st, [u.get("email") for u in (r or {}).get("users", [])] if isinstance(r, dict) else []


def caso_matriz(nav, a) -> None:
    s = B.schema()
    ids = {k: B.uid(k) for k in ["w5-aluno1", "w5-aluno2"]}
    for quem, esperado in [("w5-dono", {"w5-aluno1", "w5-aluno2"}), ("w5-personal", {"w5-aluno1"}), ("w5-nutri", {"w5-aluno2"})]:
        tok = B.sessao(quem)["access_token"]
        st, r = B.rest(tok, "pacientes", f"select=user_id&conta_id=eq.{conta_id()}")
        vistos = {k for k, v in ids.items() if any(x.get("user_id") == v for x in (r or []))}
        p.check(st == 200 and vistos == esperado, f"principal (4.1/P1): {quem} vê {sorted(vistos)} (esperado {sorted(esperado)})")
    # Treino: o personal e o dono pelo painel antigo (admin-list-users); o aluno 1 ligado ao personal
    t_pers = treino_de("w5-personal")
    EST["treino_token_personal"] = t_pers["access_token"]
    t_aluno = treino_de("w5-aluno1")
    prof = B.sql_treino(f"select professor_id::text, conta_id::text from {s}.physiq_profiles where id = '{t_aluno['treino_user_id']}'")
    p.check(prof and prof[0]["professor_id"] == t_pers["treino_user_id"], f"Treino: aluno 1 com professor_id = personal ({prof})")
    st, emails = admin_list(t_pers["access_token"])
    p.check(st == 200 and B.CONTAS["w5-aluno1"][0] in emails and B.CONTAS["w5-aluno2"][0] not in emails,
            f"Treino: o personal lista só o aluno dele ({st}, {emails})")
    t_dono = treino_de("w5-dono")
    st, emails = admin_list(t_dono["access_token"])
    p.check(st == 200 and B.CONTAS["w5-aluno1"][0] in emails, f"Treino: o dono vê o aluno da conta (espelho de dono) ({st}, {emails})")
    esp = B.sql_treino(f"select papeis, ativo from {s}.physiq_espelho_membros where treino_user_id = '{t_pers['treino_user_id']}' and conta_id = '{conta_id()}'")
    p.check(esp and esp[0]["papeis"] == ["personal"] and esp[0]["ativo"], f"espelho dos membros no Treino: personal ativo ({esp})")
    EST["treino_personal"] = t_pers["treino_user_id"]
    EST["treino_aluno1"] = t_aluno["treino_user_id"]


def caso_papeis(nav, a) -> None:
    c = B.Caso(nav, a.base, a.prefixo, "papeis")
    c.entrar("w5-dono", "/painel/configuracoes/equipe")
    c.fechar_avisos()
    m = membro("w5-personal")
    p.check(c.esperar(lambda: c.tem(f"[data-membro-papeis='{m['id']}']"), 90), "dono: a equipe com o personal e a nutri")
    c.print("equipe_lista")
    c.pg.locator(f"[data-membro-papeis='{m['id']}']").click()
    c.esperar(lambda: c.tem(f"[data-form-papeis='{m['id']}']"), 20)
    c.pg.locator(f"[data-form-papeis='{m['id']}'] [data-opcao='nutricionista']").click()
    c.print("papeis_dialogo")
    c.pg.locator("[data-papeis-salvar]").click()
    p.check(c.esperar(lambda: membro("w5-personal")["papeis"] == ["personal", "nutricionista"], 30), "papel de nutricionista dado ao personal")
    B.processar_espelho()
    esp = B.sql_treino(f"select papeis from {B.schema()}.physiq_espelho_membros where treino_user_id = '{EST.get('treino_personal') or B.treino_id('w5-personal')}' and conta_id = '{conta_id()}'")
    p.check(esp and esp[0]["papeis"] == ["personal", "nutricionista"], f"o espelho levou os papéis novos ao Treino ({esp})")
    # volta a só personal (sem aluno de nutrição: sai sem aviso)
    st, r = B.rpc("w5-dono", "alterar_papeis_membro", {"p_membro": m["id"], "p_papeis": ["personal"]})
    p.check(isinstance(r, dict) and r.get("ok") and r.get("papeis") == ["personal"], f"e tirado de novo ({r})")
    # negativos no banco
    dono = membro("w5-dono")
    st, r = B.rpc("w5-dono", "alterar_papeis_membro", {"p_membro": m["id"], "p_papeis": ["dono", "personal"]})
    p.check(isinstance(r, dict) and r.get("erro") == "papel_dono", f"negativo: dono não é dado a outro membro ({r})")
    st, r = B.rpc("w5-dono", "remover_membro", {"p_membro": dono["id"]})
    p.check(isinstance(r, dict) and r.get("erro") == "nao_remove_dono", f"negativo: o dono não se remove ({r})")
    c.fim()


def caso_remover(nav, a) -> None:
    s = B.schema()
    tok_antigo = EST.get("treino_token_personal") or treino_de("w5-personal")["access_token"]
    t_pers = EST.get("treino_personal") or B.treino_id("w5-personal")
    t_aluno = EST.get("treino_aluno1") or B.treino_id("w5-aluno1")
    st0, emails0 = admin_list(tok_antigo)
    p.check(st0 == 200, f"antes: o token do Treino do personal funciona no painel antigo ({st0})")
    c = B.Caso(nav, a.base, a.prefixo, "remover")
    c.entrar("w5-dono", "/painel/configuracoes/equipe")
    c.fechar_avisos()
    m = membro("w5-personal")
    p.check(c.esperar(lambda: c.tem(f"[data-membro-remover='{m['id']}']"), 90), "dono: botão Remover na linha do personal")
    c.pg.locator(f"[data-membro-remover='{m['id']}']").click()
    p.check(c.esperar(lambda: c.tem("[data-remover-afetados]"), 20) and "fica sem responsável" in c.pg.locator("[data-remover-afetados]").inner_text(),
            "o diálogo avisa que o aluno dele fica sem responsável")
    c.print("remover_dialogo")
    c.pg.locator("[data-remover-confirmar]").click()
    p.check(c.esperar(lambda: not c.tem(f"[data-membro='{m['id']}']"), 30), "o personal sai da lista")
    c.print("equipe_depois_remover")
    c.fim()
    # principal: na hora
    mm = membro("w5-personal")
    pac = paciente("w5-aluno1")
    p.check(mm["status"] == "removido", f"principal: membro removido ({mm['status']})")
    p.check(pac and pac["personal_id"] is None and pac["conta_id"] == conta_id(), f"principal: o aluno ficou na conta SEM responsável (nada apagado) ({pac})")
    tok_p = B.sessao("w5-personal")["access_token"]
    st, r = B.rest(tok_p, "pacientes", f"select=id&conta_id=eq.{conta_id()}")
    p.check(st == 200 and r == [], f"principal (RLS): o removido não lê mais os alunos da conta ({r})")
    st, r = B.rest(tok_p, "contas", f"select=id&id=eq.{conta_id()}")
    p.check(st == 200 and r == [], f"principal (RLS): nem a conta ({r})")
    st, sit = B.rpc(tok_p, "minha_situacao", {})
    p.check(isinstance(sit, dict) and not any(x.get("id") == conta_id() for x in sit.get("contas", [])), "principal: a situação dele não tem mais a conta")
    av = B.sql_principal(f"select tipo, titulo from {s}.avisos where destino_user_id = '{B.uid('w5-personal')}' and tipo = 'membro_removido'")
    p.check(bool(av), f"aviso 'membro_removido' gravado para ele ({av})")
    # Treino: força a fila do espelho (em vez de esperar os 10 min do pg_cron)
    res = B.processar_espelho()  # a remoção já dispara a fila (pg_net); aqui força o que faltar
    fila = B.sql_principal(f"""select count(*) filter (where feito_em is null) as pendentes, count(*) filter (where feito_em is not null) as feitas
                               from {s}.espelho_pendencias where criado_em > now() - interval '15 minutes'
                                and payload->>'principal_user_id' in ('{B.uid('w5-personal')}', '{B.uid('w5-aluno1')}')""")[0]
    p.check(fila["pendentes"] == 0 and fila["feitas"] >= 2 and all(x.get("resultado") == "feito" for x in res),
            f"fila do espelho: o removido e o aluno dele processados, nada pendente ({fila}; forçadas agora: {len(res)})")
    sp = B.service(B.TREINO_REF)
    st, u, _ = B.http("GET", f"{B.TREINO_URL}/auth/v1/admin/users/{t_pers}", None, {"apikey": sp, "Authorization": f"Bearer {sp}"})
    p.check(st == 200 and (u.get("app_metadata") or {}).get("role") in (None, ""), f"Treino: o papel 'professor' saiu ({(u.get('app_metadata') or {}).get('role')})")
    esp = B.sql_treino(f"select ativo from {s}.physiq_espelho_membros where treino_user_id = '{t_pers}' and conta_id = '{conta_id()}'")
    p.check(esp and esp[0]["ativo"] is False, f"Treino: espelho do membro inativo ({esp})")
    pr = B.sql_treino(f"select acesso_liberado_ate, nucleo_acesso_ate from {s}.physiq_professores where id = '{t_pers}'")
    p.check(pr and pr[0]["acesso_liberado_ate"] is None and pr[0]["nucleo_acesso_ate"] is None, f"Treino: o acesso de professor que o espelho dava saiu ({pr})")
    al = B.sql_treino(f"select professor_id from {s}.physiq_profiles where id = '{t_aluno}'")
    p.check(al and al[0]["professor_id"] is None, f"Treino: o aluno ficou sem professor ({al})")
    st, emails = admin_list(tok_antigo)
    p.check(st == 403, f"Treino: o token ANTIGO do removido é recusado no painel antigo ({st})")
    st, s2 = B.trocar_token("w5-personal")
    p.check(st == 200 and s2.get("papel") is None, f"Treino: numa troca nova ele entra sem papel (aluno comum) ({st}, {s2.get('papel')})")
    st, emails = admin_list(s2.get("access_token", ""))
    p.check(st == 403, f"Treino: e sem acesso às funções do professor ({st})")
    # a tela do removido
    d = B.Caso(nav, a.base, a.prefixo, "removido")
    d.entrar("w5-personal", "/painel")
    p.check(d.esperar(lambda: d.tem("[data-aviso-membro-removido]"), 90), "a tela dele: 'Você não faz mais parte desta conta'")
    p.check(d.esperar(lambda: not d.caminho().startswith("/painel"), 60), f"e ele não fica no painel da conta ({d.caminho()})")
    d.print("aviso_removido")
    d.pg.locator("[data-aviso-removido-ok]").click()
    d.fim()


def caso_legado(nav, a) -> None:
    c = B.Caso(nav, a.base, a.prefixo, "legado")
    c.entrar("prof1", "/painel/configuracoes/equipe")
    c.fechar_avisos()
    p.check(c.esperar(lambda: c.tem("[data-equipe-bloqueio='conta_legada']"), 90), "legado Calc: a Equipe com o aviso (equipe só nas contas novas até a W28)")
    p.check(not c.tem("[data-equipe-convidar]") and not c.tem("[data-membro-remover]"), "legado: sem convidar e sem remover")
    c.print("equipe_legado")
    c.ir("/painel/configuracoes/convite")
    p.check(c.esperar(lambda: c.tem("[data-convite-codigo]"), 60) and c.pg.locator("[data-convite-codigo]").inner_text().strip() == "PROF-RAFAEL-LIMA",
            "legado: o Convite com o código de hoje (PROF-RAFAEL-LIMA)")
    c.ir("/painel/configuracoes/conta")
    p.check(c.esperar(lambda: c.tem("[data-form-conta]"), 60), "legado: a Conta abre (nome editável)")
    c.fim()


def caso_master(nav, a) -> None:
    c = B.Caso(nav, a.base, a.prefixo, "master")
    c.entrar("master", "/painel/configuracoes/perfil")
    c.fechar_avisos()
    p.check(c.esperar(lambda: c.tem("[data-config-aba='perfil']"), 90), "master: Configurações › Perfil")
    visiveis = [x for x in ["perfil", "conta", "equipe", "plano", "recebimento", "convite", "aplicativo"] if c.tem(f"[data-aba-config='{x}']")]
    p.check(len(visiveis) == 7, f"master vê as 7 abas ({visiveis})")
    p.check(not c.tem("[data-plano-vencido]"), "o master nunca trava")
    c.fim()


def caso_telas(nav, a) -> None:
    c = B.Caso(nav, a.base, a.prefixo, "telas")
    c.entrar("w5-dono", "/painel/configuracoes/perfil")
    c.fechar_avisos()
    p.check(c.esperar(lambda: c.tem("[data-form-perfil]"), 90), "Perfil do dono (tela 8)")
    c.print("perfil")
    c.pg.locator("[data-aba-config='conta']").click()
    p.check(c.esperar(lambda: c.tem("[data-form-conta]"), 60), "Conta (tela 8)")
    c.pg.locator("[data-conta-nome]").fill("X")
    c.pg.locator("[data-conta-salvar]").click()
    p.check(c.esperar(lambda: c.tem("[data-conta-erro]"), 10), "negativo: nome de conta curto")
    c.pg.locator("[data-conta-nome]").fill("Consultoria Equipe W5")
    c.print("conta")
    c.pg.locator("[data-aba-config='convite']").click()
    p.check(c.esperar(lambda: c.tem("[data-convite-codigo]") and c.tem("[data-convite-qr]"), 60), "Convite do dono com QR")
    c.print("convite")
    c.pg.locator("[data-aba-config='aplicativo']").click()
    p.check(c.esperar(lambda: c.tem("[data-secao='app-android']"), 60), "Aplicativo (card Android)")
    c.pg.wait_for_timeout(2500)
    c.print("aplicativo")
    c.fim()
    d = B.Caso(nav, a.base, a.prefixo, "celular", desktop=False)
    d.entrar("w5-dono", "/painel/configuracoes/equipe")
    d.fechar_avisos()
    p.check(d.esperar(lambda: d.tem("[data-lista-membros]"), 90), "Equipe no celular")
    d.print("celular_equipe")
    d.fim()


CASOS = {"dono": caso_dono, "personal": caso_personal, "nutri": caso_nutri, "alunos": caso_alunos, "matriz": caso_matriz,
         "papeis": caso_papeis, "remover": caso_remover, "legado": caso_legado, "master": caso_master, "telas": caso_telas}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--casos", default=",".join(CASOS))
    ap.add_argument("--schema", default="staging")
    a = ap.parse_args()
    B.ESTADO["schema"] = a.schema
    assert a.schema == "staging", "a equipe W5 cria dados de teste: só no staging"
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        for nome in [x.strip() for x in a.casos.split(",") if x.strip()]:
            print(f"\n── {nome}", flush=True)
            t0 = time.time()
            try:
                CASOS[nome](nav, a)
            except Exception as e:  # noqa: BLE001
                p.check(False, f"[{nome}] quebrou: {type(e).__name__}: {str(e)[:300]}")
                caso = B.ESTADO.get("caso")
                if caso is not None:
                    caso.diagnostico()
                    try:
                        caso.ctx.close()
                    except Exception:  # noqa: BLE001
                        pass
            print(f"   ({time.time() - t0:.0f} s)", flush=True)
        nav.close()
    print(json.dumps({k: v for k, v in EST.items() if "token" not in k}, ensure_ascii=False))
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
