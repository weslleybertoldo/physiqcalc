#!/usr/bin/env python3
"""Physiq W11 — smoke de PRODUÇÃO da aba Dieta nova (tela 3) com a conta de TESTE do paciente (paciente.teste.claude@…).

Em produção nenhuma conta de teste tem plano alimentar: o smoke monta um dado DESCARTÁVEL de teste (a matrícula da conta de teste
com a nutricionista de teste "Nutri Teste Claude", 3 refeições da TACO, 2 metas e 1 orientação), olha a aba SÓ LENDO (um vigia
falha se a tela gravar qualquer coisa nos 2 bancos) e apaga tudo no fim (contagens antes = depois). Os ✓ (refeição e meta) são
conferidos pela função, no dado de teste, e desfeitos na hora. Nada de dado, foto ou nome de paciente real.
  dieta      o plano do dia, os macros, o 'Feito' na próxima, a folha da refeição (substitutos), orientações e metas;
  abas       só Nutrição: Dieta · Evolução · Perfil (sem a trava da W3);
  offline    sem internet: 'A dieta aparece quando a internet voltar';
  rotas      /app/plano → /dieta;
  funcoes    paciente_marcar_refeicao (a do site antigo) e aluno_marcar_meta: marcar e desmarcar no dado de teste.
Prints prod_* (390 × 844 × 3,4) em ~/projetos/physiqcalc-scratch/prints/w11/.
Uso: python3 e2e/w11/smoke_prod.py [--base https://physiqcalc.com.br] [--so-limpar]
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
import uuid
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402
import telas as T  # noqa: E402

S = "public"
p = B.p
NS = uuid.UUID("6f1c8a1e-2b0d-4d11-9a51-0000000000b2")
FUSO = dt.timezone(dt.timedelta(hours=-3))
HOJE = dt.datetime.now(FUSO).date()
DOW = HOJE.isoweekday()
ESCRITAS: list[str] = []
TABELAS = ["pacientes", "planos_alimentares", "refeicoes", "itens_refeicao", "metas", "orientacoes", "refeicoes_concluidas", "metas_concluidas", "diario_alimentar"]
LEITURAS_OK = ("/rpc/minha_dieta", "/rpc/minha_situacao", "/rpc/minha_evolucao", "/rpc/meu_perfil_aluno", "/rpc/minha_agenda", "/rpc/financeiro_do_aluno",
               "/rpc/marcar_aviso_mudanca")


def u(chave: str) -> str:
    return str(uuid.uuid5(NS, f"w11-prod:{chave}"))


PAC = u("paciente")


def q(sql: str) -> list:
    return B.sql_principal(sql)


def contagens() -> dict:
    return q("select " + ", ".join(f"(select count(*) from {S}.{t})::int as {t}" for t in TABELAS))[0]


def taco(nome: str) -> str:
    r = q(f"select id::text as id from {S}.alimentos where fonte = 'taco' and nome = '{nome}' limit 1")
    assert r, nome
    return r[0]["id"]


def preparar() -> None:
    nutri = q(f"select id::text as id from {S}.profiles where email = '{B.EMAIL['nutri']}'")[0]["id"]
    aluno = q(f"select id::text as id from auth.users where lower(email) = '{B.EMAIL['paciente']}'")[0]["id"]
    conta = q(f"select c.id::text as id from {S}.contas c join {S}.conta_membros m on m.conta_id = c.id where m.user_id = '{nutri}' and m.status = 'ativo' "
              f"and c.origem = 'legado_nutri' limit 1")[0]["id"]
    ja = q(f"select count(*)::int as n from {S}.pacientes where user_id = '{aluno}' and deleted_at is null")[0]["n"]
    assert ja == 0, "a conta de teste já tem matrícula em produção — conferir antes (nada foi criado)"
    q(f"""insert into {S}.pacientes (id, nutricionista_id, conta_id, user_id, nome, email, ativo, origem)
          values ('{PAC}', '{nutri}', '{conta}', '{aluno}', 'Paciente Teste Claude', '{B.EMAIL['paciente']}', true, 'nutri')""")
    plano = u("plano")
    q(f"""insert into {S}.planos_alimentares (id, nutricionista_id, paciente_id, titulo, metodo, kcal_alvo, observacao, favorito)
          values ('{plano}', '{nutri}', '{PAC}', 'Plano de teste W11 (produção)', 'alimentos', 1600, 'Dado de teste — apagado pelo smoke.', true)""")
    refeicoes = [
        ("Café da manhã", "07:30", [("Pão, trigo, forma, integral", 50, []), ("Banana, prata, crua", 90, [])]),
        ("Almoço", "12:30", [("Frango, peito, sem pele, grelhado", 150, []), ("Arroz, integral, cozido", 150, [("Batata, doce, cozida", 241.4)])]),
        ("Jantar", "19:30", [("Merluza, filé, assado", 150, []), ("Batata, doce, cozida", 150, [])]),
    ]
    for o, (nome, hora, itens) in enumerate(refeicoes):
        rid = u(f"refeicao:{nome}")
        q(f"insert into {S}.refeicoes (id, plano_id, nome, horario, ordem) values ('{rid}', '{plano}', '{nome}', '{hora}', {o})")
        for io, (alimento, g, subs) in enumerate(itens):
            js = "[" + ",".join(f'{{"alimento_id":"{taco(s)}","nome":"{s}","quantidade_g":{sg}}}' for s, sg in subs) + "]"
            q(f"""insert into {S}.itens_refeicao (id, refeicao_id, alimento_id, quantidade_g, ordem, substitutos)
                  values ('{u(f"item:{nome}:{io}")}', '{rid}', '{taco(alimento)}', {g}, {io}, '{js}'::jsonb)""")
    outro = (DOW % 7) + 1
    q(f"""insert into {S}.metas (id, nutricionista_id, paciente_id, titulo, descricao, dias_semana, ativa, inicio) values
          ('{u("meta:agua")}', '{nutri}', '{PAC}', 'Beber 2 litros de água', '', '{{1,2,3,4,5,6,7}}', true, current_date - 1),
          ('{u("meta:outro")}', '{nutri}', '{PAC}', 'Caminhar 30 minutos', '', '{{{outro}}}', true, current_date - 1)""")
    q(f"""insert into {S}.orientacoes (id, nutricionista_id, paciente_id, titulo, conteudo) values
          ('{u("orientacao")}', '{nutri}', '{PAC}', 'Orientações de teste', '## Hidratação
Beba **água** ao longo do dia.

- Frutas inteiras
- Metade do prato com salada')""")


def limpar() -> None:
    q(f"delete from {S}.pacientes where id = '{PAC}'")


def vigiar(c) -> None:
    def ver(r) -> None:
        url = r.url
        if r.method in ("POST", "PATCH", "PUT", "DELETE") and ("/rest/v1/" in url or "/storage/v1/object/diario" in url):
            if "/rest/v1/rpc/" in url and any(x in url for x in LEITURAS_OK):
                return
            ESCRITAS.append(f"{r.method} {url.split('?')[0][-80:]}")
    c.pg.on("request", ver)


def caso_tela(nav, base: str, prefixo: str) -> None:
    ids = {n: u(f"refeicao:{n}") for n in ("Café da manhã", "Almoço", "Jantar")}
    c = B.Caso(nav, base, prefixo, "prod_dieta", desktop=False)
    vigiar(c)
    try:
        c.entrar("paciente", "/dieta", zerar=False)
        c.fechar_avisos()
        ok = c.esperar(lambda: c.tem('[data-aba-dieta="plano"]') and T.contagem(c) == "0 de 3", 90)
        p.check(ok, f"[prod] /dieta já logado: o plano de teste com 3 refeições ({T.contagem(c)})")
        p.check(T.txt(c, "[data-plano-autor]").startswith("Plano de Nutri Teste Claude"), f"[prod] autor ({T.txt(c, '[data-plano-autor]')})")
        p.check(T.estado_ref(c, ids["Café da manhã"]) == "agora", "[prod] 'Feito' na próxima refeição (café)")
        abas = c.pg.evaluate("() => [...document.querySelectorAll('[data-tabbar] [data-aba]')].map(e => e.getAttribute('data-aba'))")
        p.check(abas == ["inicio", "dieta", "evolucao", "perfil"], f"[prod] só Nutrição: Início · Dieta · Evolução · Perfil ({abas})")  # W12: o Início
        p.check("continua no PhysiqNutri" not in c.texto(), "[prod] sem a trava da W3")
        T.foto(c, "dieta")
        c.pg.locator(f'[data-refeicao="{ids["Almoço"]}"] [data-refeicao-abrir]').click()
        ok = c.esperar(lambda: c.tem(f'[data-folha-refeicao="{ids["Almoço"]}"]'), 20)
        p.check(ok and "Batata, doce, cozida" in T.txt(c, "[data-item-substitutos]"), "[prod] folha da refeição com o substituto")
        T.foto(c, "dieta_substitutos")
        T.fechar_folha(c)
        c.pg.locator("[data-abrir-orientacoes]").click()
        ok = c.esperar(lambda: c.tem("[data-folha-orientacoes]"), 20)
        p.check(ok and "Orientações de teste" in T.txt(c, "[data-folha-orientacoes]"), "[prod] orientações")
        T.foto(c, "dieta_orientacoes")
        T.fechar_folha(c)
        c.pg.locator("[data-abrir-metas]").click()
        ok = c.esperar(lambda: c.tem("[data-folha-metas]"), 20)
        p.check(ok and T.attr(c, "[data-folha-metas]", "data-metas-hoje") == "1" and c.tem("[data-metas-outras]"), "[prod] metas: 1 de hoje, 1 de outro dia")
        T.foto(c, "dieta_metas")
        T.fechar_folha(c)
        c.pg.locator("[data-abrir-diario]").click()
        p.check(c.esperar(lambda: c.tem("[data-form-diario]"), 20), "[prod] a folha do diário abre (nada é enviado)")
        T.fechar_folha(c)
        c.ir("/app/plano")
        p.check(c.esperar(lambda: c.caminho() == "/dieta" and c.tem('[data-aba-dieta="plano"]'), 40), "[prod] /app/plano → /dieta")
    finally:
        c.fim()


def caso_offline(nav, base: str, prefixo: str) -> None:
    c = B.Caso(nav, base, prefixo, "prod_offline", desktop=False)
    vigiar(c)
    try:
        c.pg.route("**/rpc/minha_dieta", lambda r: r.abort("internetdisconnected"))
        c.entrar("paciente", "/dieta", zerar=False)
        c.fechar_avisos()
        # o arquivo da aba tem que estar no aparelho antes de cair a rede (no APK ele vem no pacote; no site, o service worker
        # guarda — aqui o service worker está desligado de propósito)
        c.esperar(lambda: c.tem("[data-aba-dieta]"), 60)
        c.ctx.set_offline(True)
        ok = c.esperar(lambda: c.tem('[data-aba-dieta="sem-internet"]'), 60)
        p.check(ok and "A dieta aparece quando a internet voltar." in c.texto(), "[prod] sem internet: o aviso")
        T.foto(c, "dieta_sem_internet")
        c.pg.unroute("**/rpc/minha_dieta")
        c.ctx.set_offline(False)
        p.check(c.esperar(lambda: c.tem('[data-aba-dieta="plano"]'), 60), "[prod] a internet voltou: a dieta aparece")
    finally:
        c.ctx.set_offline(False)
        c.fim()


def funcoes() -> None:
    hoje = HOJE.isoformat()
    almoco, agua, outro = u("refeicao:Almoço"), u("meta:agua"), u("meta:outro")
    st, r = B.rpc("paciente", "paciente_marcar_refeicao", {"p_refeicao_id": almoco, "p_data": hoje, "p_concluida": True})
    p.check(st == 200 and r is True, f"[prod] paciente_marcar_refeicao marca (dado de teste) → {st}")
    st, d = B.rpc("paciente", "minha_dieta", {"p_dia": hoje})
    p.check(st == 200 and d["refeicoes_concluidas"] == [almoco], "[prod] minha_dieta devolve o ✓")
    st, r = B.rpc("paciente", "paciente_marcar_refeicao", {"p_refeicao_id": almoco, "p_data": hoje, "p_concluida": False})
    p.check(st == 200 and r is False, "[prod] desmarcar")
    st, r = B.rpc("paciente", "aluno_marcar_meta", {"p_meta_id": agua, "p_data": hoje, "p_concluida": True})
    p.check(st == 200 and r is True, f"[prod] aluno_marcar_meta marca → {st}")
    st, r = B.rpc("paciente", "aluno_marcar_meta", {"p_meta_id": outro, "p_data": hoje, "p_concluida": True})
    p.check(st >= 400 and "fora_do_dia" in (r or {}).get("message", ""), "[prod] meta de outro dia → fora_do_dia")
    st, r = B.rpc("paciente", "aluno_marcar_meta", {"p_meta_id": agua, "p_data": hoje, "p_concluida": False})
    p.check(st == 200 and r is False, "[prod] desmarcar a meta")
    st, r, _ = B.http("POST", f"{B.PRINCIPAL_URL}/rest/v1/rpc/minha_dieta", {}, {"apikey": B.anon(B.PRINCIPAL_REF)})
    p.check(st in (401, 403), f"[prod] anon não lê a minha_dieta → {st}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://physiqcalc.com.br")
    ap.add_argument("--prefixo", default="prod")
    ap.add_argument("--so-limpar", action="store_true")
    a = ap.parse_args()
    B.ESTADO["schema"] = S
    T.ESTADO.update(prefixo=a.prefixo)
    if a.so_limpar:
        limpar()
        print(contagens())
        return 0
    antes = contagens()
    print("contagens antes:", antes, flush=True)
    try:
        preparar()
        with sync_playwright() as pw:
            nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
            for nome, f in (("tela", caso_tela), ("offline", caso_offline)):
                print(f"\n── {nome} ──", flush=True)
                try:
                    f(nav, a.base, a.prefixo)
                except Exception as e:  # noqa: BLE001
                    p.check(False, f"{nome}: exceção {type(e).__name__}: {str(e)[:300]}")
            nav.close()
        p.check(not ESCRITAS, f"[prod] a tela só leu: nenhuma escrita nos 2 bancos ({ESCRITAS[:5]})")
        print("\n── funções (no dado de teste) ──", flush=True)
        funcoes()
    finally:
        limpar()
        depois = contagens()
        print("contagens depois:", depois, flush=True)
        p.check(depois == antes, "[prod] limpeza: as contagens voltaram ao que eram (nada de teste ficou, nada de cliente mudou)")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
