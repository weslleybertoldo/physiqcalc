#!/usr/bin/env python3
"""Physiq W1 (conta única) — CONFERÊNCIA do ensaio no STAGING (massa de e2e/conta_unica/massa.py), antes e depois do
scripts/conta_unica/juntar_contas.py. Em série, /health do Treino antes de cada bloco.

  API    (com o JWT de verdade de cada conta de teste, pelo PostgREST) minha_situacao do profissional (contas, módulos, papéis,
         limite) e da aluna (matrículas ativas e módulos) · minha_dieta da aluna (os 2 planos, a refeição marcada, a foto do diário)
         · alunos_da_conta (a aluna com Treino e Dieta; o paciente antigo na conta) · "Em 2 contas" (P7) · o arquivo da foto do diário
         abre para a aluna e para o profissional (Storage) · os códigos de convite · nenhuma fatura/assinatura/aviso novo
  TREINO o perfil da aluna (professor e conta), o espelho dos membros do profissional, a linha de professor, o treino da aluna igual,
         a troca de token dos 2
  TELAS  (--telas) o painel do profissional: menu (Treinos + Dietas + Impressos), Alunos, o perfil da aluna com as abas Treino e Dieta
         e a Agenda com a consulta
Uso: python3 e2e/conta_unica/ensaio.py --estado antes|juntada [--telas --base http://localhost:5173 --prefixo local]
Prints: ~/projetos/physiqcalc-scratch/prints/conta-unica-agenda/w1/<prefixo>_*.png
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
q = B.sql_principal
I = B.ids()
MASSA_TREINO = {"treino_historico": 1, "tb_treino_concluido": 1}


def api(estado: str) -> None:
    juntada = estado == "juntada"
    B.saude_ok("a conferência da API")
    tp, ta = B.B5.sessao(B.PROF)["access_token"], B.B5.sessao(B.ALUNO)["access_token"]

    # ── o profissional ──
    st, sit = B.rpc_token(tp, "minha_situacao")
    contas = {c["id"]: c for c in (sit or {}).get("contas") or []}
    if juntada:
        c = contas.get(I["calc"]) or {}
        p.check(st == 200 and list(contas) == [I["calc"]], f"[prof] minha_situacao: 1 conta só (a Calc) — {[x['nome'] for x in contas.values()]}")
        p.check(c.get("modulos") == ["treino", "nutricao"] and c.get("papeis") == ["dono", "personal", "nutricionista"],
                f"[prof] a conta com os 2 módulos e os 3 papéis: módulos {c.get('modulos')} · papéis {c.get('papeis')}")
        p.check(c.get("plano") == "treino_nutricao" and c.get("situacao") == "isenta" and c.get("isenta_motivo") == "master"
                and c.get("faixa") == "livre" and c.get("limite_alunos") is None,
                f"[prof] plano {c.get('plano')}, {c.get('situacao')}/{c.get('isenta_motivo')}, faixa {c.get('faixa')}, limite {c.get('limite_alunos')} (sem limite)")
    else:
        p.check(st == 200 and set(contas) == {I["calc"], I["nutri"]}, f"[prof] antes: as 2 contas ({len(contas)})")
        p.check((contas.get(I["calc"]) or {}).get("modulos") == ["treino"] and (contas.get(I["nutri"]) or {}).get("modulos") == ["nutricao"],
                "[prof] antes: Calc = Só Treino, Nutri = Só Nutrição")

    # ── a aluna ──
    st, sa = B.rpc_token(ta, "minha_situacao")
    mats = (sa or {}).get("matriculas") or []
    ativas = [m for m in mats if m.get("ativo")]
    if juntada:
        m = ativas[0] if len(ativas) == 1 else {}
        p.check(st == 200 and len(ativas) == 1 and m.get("id") == I["mat_fica"] and sorted(m.get("modulos") or []) == ["nutricao", "treino"],
                f"[aluna] minha_situacao: 1 matrícula ativa (a da Calc) com Treino e Dieta — {[(x['conta_nome'], x['ativo'], x['modulos']) for x in mats]}")
        p.check((m.get("personal") or {}).get("id") == I["prof"] and (m.get("nutricionista") or {}).get("id") == I["prof"],
                "[aluna] personal e nutricionista = o profissional das 2 contas")
        p.check(sorted((sa or {}).get("modulos_aluno") or []) == ["nutricao", "treino"], f"[aluna] módulos {sa.get('modulos_aluno')}")
        velha = next((x for x in mats if x["id"] == I["mat_sai"]), None)
        p.check(velha is not None and velha["ativo"] is False, f"[aluna] a matrícula da Nutri ficou inativa como histórico ({velha and velha['ativo']})")
    else:
        p.check(st == 200 and len(ativas) == 2, f"[aluna] antes: 2 matrículas ativas (P7) — {[(x['conta_nome'], x['modulos']) for x in ativas]}")

    st, dieta = B.rpc_token(ta, "minha_dieta")
    planos = (dieta or {}).get("planos") or []
    titulos = sorted(x["titulo"] for x in planos)
    alvo = I["mat_fica"] if juntada else I["mat_sai"]
    p.check(st == 200 and titulos == ["Plano alimentar 20/09/2026 W1U", "Plano alimentar 30/09/2026 W1U"] and all(x["paciente_id"] == alvo for x in planos),
            f"[aluna] minha_dieta: os 2 planos, na matrícula {'que fica' if juntada else 'da Nutri'} ({titulos})")
    p.check(len((dieta or {}).get("refeicoes_concluidas") or []) == 1, f"[aluna] a refeição marcada hoje continua marcada ({dieta.get('refeicoes_concluidas')})")
    diario = (dieta or {}).get("diario") or []
    p.check(len(diario) == 1 and diario[0]["paciente_id"] == alvo and diario[0]["path"] == I["foto"], f"[aluna] a foto do diário ({len(diario)})")

    # a foto do diário abre (Storage: o caminho guarda o id da matrícula antiga; quem lê é pela linha do diário)
    for quem, tok in (("aluna", ta), ("profissional", tp)):
        st, r, _ = B.http("POST", f"{B.PRINCIPAL_URL}/storage/v1/object/sign/{B.bucket_do_ambiente('diario')}/{I['foto']}", {"expiresIn": 60},
                          {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {tok}"})
        p.check(st == 200 and isinstance(r, dict) and (r.get("signedURL") or r.get("signedUrl")), f"[foto] a {quem} abre a foto do diário (HTTP {st})")

    # ── a lista de alunos da conta que fica ──
    st, lista = B.rpc_token(tp, "alunos_da_conta", {"p_conta": I["calc"], "p_filtros": {"situacao": "todos"}, "p_offset": 0, "p_limite": 50})
    itens = {x["id"]: x for x in (lista or {}).get("itens") or []}
    alice = itens.get(I["mat_fica"]) or {}
    if juntada:
        p.check(st == 200 and sorted(alice.get("modulos") or []) == ["nutricao", "treino"] and (alice.get("nutricionista") or {}).get("id") == I["prof"],
                f"[lista] Alunos da conta: a aluna com Treino e Dieta ({alice.get('modulos')})")
        p.check(I["antigo"] in itens and itens[I["antigo"]]["ativo"] is False, "[lista] o paciente inativo antigo da Nutri está na conta (inativo)")
        p.check(I["mat_sai"] not in itens, "[lista] a matrícula antiga da aluna NÃO aparece na conta que fica (sem 2 cartões da mesma pessoa)")
        p.check(((lista or {}).get("conta") or {}).get("modulos") == ["treino", "nutricao"], f"[lista] a conta tem os 2 módulos {lista.get('conta')}")
    else:
        p.check(st == 200 and alice.get("modulos") == ["treino"] and I["antigo"] not in itens, "[lista] antes: a aluna só com Treino na Calc")

    # ── "Em 2 contas" (P7) e os códigos ──
    dupla = q(f"""select count(*)::int as n from (select p.user_id from {S}.pacientes p where p.user_id = '{I['aluno']}' and p.ativo
                  and p.deleted_at is null and p.conta_id is not null and p.conta_id is distinct from {S}.conta_do_app()
                  group by p.user_id having count(distinct p.conta_id) > 1) x""")[0]["n"]
    p.check(dupla == (0 if juntada else 1), f"[P7] 'Em 2 contas' {'sem' if juntada else 'com'} a aluna ({dupla})")
    dono_calc = q(f"select conta_id::text as c from {S}.w13_dono_do_codigo('{B.COD_CALC}')")
    dono_nutri = q(f"select conta_id::text as c from {S}.w13_dono_do_codigo('{B.COD_NUTRI}')")
    p.check(dono_calc and dono_calc[0]["c"] == I["calc"], f"[código] {B.COD_CALC} continua levando para a conta que fica ({dono_calc})")
    if juntada:
        p.check(not dono_nutri, f"[código] {B.COD_NUTRI} (do membro removido) para de valer ({dono_nutri})")
    fat = q(f"""select (select count(*) from {S}.conta_faturas where conta_id in ('{I['calc']}', '{I['nutri']}'))::int as faturas,
                       (select count(*) from {S}.conta_assinaturas where conta_id in ('{I['calc']}', '{I['nutri']}'))::int as assinaturas,
                       (select count(*) from {S}.mensagens_whatsapp where paciente_id in ('{I['mat_fica']}', '{I['mat_sai']}', '{I['antigo']}'))::int as whats,
                       (select count(*) from {S}.avisos where destino_user_id in ('{I['aluno']}', '{I['prof']}'))::int as avisos""")[0]
    p.check(fat["faturas"] == 0 and fat["assinaturas"] == 0 and fat["whats"] == 0 and fat["avisos"] == 0,
            f"[nada nasce] faturas/assinaturas/WhatsApp/avisos: {fat}")

    # ── Banco do Treino ──
    B.saude_ok("o Banco do Treino")
    t = B.sql_treino(f"""select (select professor_id::text from {S}.physiq_profiles where id = '{I['aluno_treino']}') as prof_aluna,
                               (select conta_id::text from {S}.physiq_profiles where id = '{I['aluno_treino']}') as conta_aluna,
                               (select nucleo_acesso_ate::text from {S}.physiq_professores where id = '{I['prof_treino']}') as acesso_prof,
                               (select count(*) from {S}.treino_historico where user_id = '{I['aluno_treino']}')::int as historico,
                               (select count(*) from {S}.tb_treino_concluido where user_id = '{I['aluno_treino']}')::int as concluidos""")[0]
    membros = {x["conta_id"]: x for x in B.sql_treino(f"""select conta_id::text as conta_id, papeis, ativo from {S}.physiq_espelho_membros
                                                          where treino_user_id = '{I['prof_treino']}'""")}
    p.check(t["prof_aluna"] == I["prof_treino"] and t["conta_aluna"] == I["calc"], f"[Treino] a aluna: professor e conta de sempre ({t['prof_aluna'] == I['prof_treino']}, conta {t['conta_aluna'] == I['calc']})")
    p.check(t["historico"] == MASSA_TREINO["treino_historico"] and t["concluidos"] == MASSA_TREINO["tb_treino_concluido"],
            f"[Treino] o treino da aluna igual ({t['historico']} histórico, {t['concluidos']} concluídos)")
    p.check(t["acesso_prof"] == "2999-12-31", f"[Treino] o acesso do profissional (isenta) segue sem limite ({t['acesso_prof']})")
    mc, mn = membros.get(I["calc"]) or {}, membros.get(I["nutri"]) or {}
    if juntada:
        p.check(mc.get("ativo") is True and mc.get("papeis") == ["dono", "personal", "nutricionista"] and mn.get("ativo") is False,
                f"[Treino] espelho dos membros: Calc {mc.get('papeis')} ativo · Nutri ativo={mn.get('ativo')}")
    else:
        p.check(mc.get("ativo") is True and mn.get("ativo") is True, "[Treino] antes: membro ativo nas 2 contas")
    for k in (B.PROF, B.ALUNO):
        B.saude_ok(f"a troca de token de {k}")
        st, r = B.B5.trocar_token(k)
        p.check(st == 200, f"[Treino] a troca de token de {k} funciona (HTTP {st})")
        time.sleep(2)


def telas(base: str, prefixo: str, estado: str) -> None:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    B.saude_ok("as telas")
    juntada = estado == "juntada"
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        try:
            c = B.Caso(nav, base, prefixo, "painel_menu", desktop=True)
            c.entrar(B.PROF, "/painel")
            c.fechar_avisos()
            try:
                ok = c.esperar(lambda: c.tem("[data-menu-lateral]") and "Alunos" in c.pg.locator("[data-menu-lateral]").inner_text(), 90)
                menu = c.pg.locator("[data-menu-lateral]").inner_text() if ok else ""
                tem = {x: x in menu for x in ("Treinos", "Dietas", "Impressos")}
                if juntada:
                    p.check(ok and all(tem.values()), f"[tela] menu num acesso só: {tem}")
                else:
                    p.check(ok and tem["Treinos"] and not tem["Dietas"], f"[tela] antes (conta Calc): só Treino {tem}")
                c.pg.mouse.move(5, 5)
                c.print(f"{estado}_painel_menu")
                c.ir("/painel/alunos")
                ok = c.esperar(lambda: c.tem("[data-linhas-alunos]") and c.pg.locator("[data-aluno-nome]").count() > 0, 60)
                if c.tem('[data-situacao-filtro="todos"]'):
                    c.pg.locator('[data-situacao-filtro="todos"]').click()
                    c.esperar(lambda: c.pg.locator("[data-aluno-nome]").count() >= (2 if juntada else 1), 30)
                nomes = c.pg.locator("[data-aluno-nome]").evaluate_all("els => els.map(e => e.dataset.alunoNome)") if ok else []
                if juntada:
                    p.check("Alice Única W1" in nomes and "Paciente Antigo W1" in nomes and nomes.count("Alice Única W1") == 1,
                            f"[tela] Alunos (todos): a aluna 1 vez + o paciente antigo {nomes}")
                else:
                    p.check("Alice Única W1" in nomes, f"[tela] antes: Alunos {nomes}")
                c.print(f"{estado}_painel_alunos")
                c.pg.locator('[data-aluno-nome="Alice Única W1"] [data-abrir-aluno]').first.click()
                ok = c.esperar(lambda: c.tem("[data-abas-aluno]"), 60)
                abas = c.pg.locator("[data-aba-aluno]").evaluate_all("els => els.map(e => e.dataset.abaAluno)") if ok else []
                if juntada:
                    p.check("treino" in abas and "dieta" in abas, f"[tela] perfil da aluna com as abas Treino e Dieta {abas}")
                else:
                    p.check("treino" in abas and "dieta" not in abas, f"[tela] antes: perfil da aluna só com Treino {abas}")
                c.print(f"{estado}_painel_aluno_resumo")
                if juntada:
                    c.pg.locator('[data-aba-aluno="dieta"]').click()
                    ok = c.esperar(lambda: c.tem("[data-aba-dieta-aluno]") and "Plano alimentar 30/09/2026 W1U" in c.texto(), 60)
                    p.check(ok, "[tela] aba Dieta da aluna com os planos que vieram da Nutri")
                    c.print(f"{estado}_painel_aluno_dieta")
                    c.pg.locator('[data-aba-aluno="treino"]').click()
                    ok = c.esperar(lambda: c.tem("[data-aba-treino-aluno]"), 60)
                    c.pg.wait_for_timeout(2500)
                    p.check(ok, "[tela] aba Treino da aluna abre")
                    c.print(f"{estado}_painel_aluno_treino")
                c.ir("/painel/agenda?visao=lista")
                ok = c.esperar(lambda: c.pg.locator('[data-visao="lista"] [data-evento]').count() > 0, 60)
                linha = c.pg.locator('[data-visao="lista"] [data-evento]').first.inner_text() if ok else ""
                p.check(ok and "Alice Única W1" in linha, f"[tela] Agenda (lista do mês) com a consulta de nutrição da aluna: {linha[:80]!r}")
                if ok:
                    c.pg.locator('[data-visao="lista"]').scroll_into_view_if_needed()
                c.pg.mouse.move(5, 5)
                c.print(f"{estado}_painel_agenda")
            finally:
                c.fim()
        finally:
            nav.close()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--estado", required=True, choices=("antes", "juntada"))
    ap.add_argument("--telas", action="store_true")
    ap.add_argument("--so-telas", action="store_true")
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--prefixo", default="local")
    a = ap.parse_args()
    if not a.so_telas:
        api(a.estado)
    if a.telas or a.so_telas:
        telas(a.base, a.prefixo, a.estado)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
