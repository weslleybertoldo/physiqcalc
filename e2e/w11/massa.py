#!/usr/bin/env python3
"""Physiq W11 — massa de TESTE da aba Dieta no schema `staging` do banco principal (idempotente; SÓ contas de teste — P26).

  w10-aluno     "Diego Almeida" (Camila Rocha, nutricionista, "Consultoria Ferreira W7"): o plano da tela 3 — Café 07:00, Lanche da
                manhã 10:00, Almoço 13:00, Lanche da tarde 16:00, Jantar 19:00 (todos os dias) + Ceia 22:00 só em 2 outros dias da
                semana (NF3) —, com medidas caseiras e substitutos, um plano anterior, 5 metas (3 de hoje, 1 de outros dias, 1 pausada)
                e 2 orientações;
  paciente      "Paciente Teste Claude" ("Nutri Teste Claude", o site antigo do Nutri): plano com 4 refeições + 1 sem alimento, 2 metas
                e 1 orientação — o lado a lado com o /app/plano, /app/orientacoes, /app/metas e /app/diario antigos;
  w7-paciente   "Paula Nutri" (Camila): plano só de 2 dias da semana que não são hoje nem amanhã (dia sem refeição);
  w10-paciente  "Paula Lima": continua SEM plano (o vazio).
Os dias da semana saem de HOJE (São Paulo) — rodar de novo em outro dia recalcula. Os ✓ e as fotos do diário que o E2E grava nas
matrículas de teste saem com --limpar (e no começo de cada rodada). Alimentos próprios da nutricionista de teste: Ovo cozido
(unidade), Whey protein (scoop) e Pasta de amendoim (colher). Nada toca em dado real.
Uso: python3 e2e/w11/massa.py [--limpar]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import uuid
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
NS = uuid.UUID("6f1c8a1e-2b0d-4d11-9a51-0000000000b1")
FUSO = dt.timezone(dt.timedelta(hours=-3))
HOJE = dt.datetime.now(FUSO).date()
DOW = HOJE.isoweekday()


def dia(n: int) -> int:
    """Dia da semana ISO de hoje + n."""
    return (DOW - 1 + n) % 7 + 1


def u(chave: str) -> str:
    return str(uuid.uuid5(NS, f"w11:{chave}"))


def q(sql: str) -> list:
    return B.sql_principal(sql)


def lit(v) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, (list, dict)):
        return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


def arr(dias: list[int]) -> str:
    return "'{" + ",".join(str(d) for d in dias) + "}'::smallint[]"


def matricula_de(email: str) -> dict:
    r = q(f"select p.id::text as id, p.nutricionista_id::text as nutri, p.nome from {S}.pacientes p join auth.users u on u.id = p.user_id "
          f"where lower(u.email) = '{email}' and p.deleted_at is null and p.nutricionista_id is not null order by p.created_at limit 1")
    assert r, f"sem matrícula com Nutrição no staging: {email}"
    return r[0]


def taco(nome: str) -> dict:
    r = q(f"select id::text as id, energia_kcal::float as kcal from {S}.alimentos where fonte = 'taco' and nome = {lit(nome)} limit 1")
    assert r, f"TACO sem '{nome}'"
    return r[0]


def alimento_proprio(nutri: str, chave: str, nome: str, por100: tuple[float, float, float, float, float], medida: tuple[str, float]) -> dict:
    """Alimento próprio da nutricionista (fonte 'proprio') + a medida caseira; idempotente pelo id."""
    aid, mid = u(f"alimento:{nutri}:{chave}"), u(f"medida:{nutri}:{chave}")
    k, pr, c, lp, f = por100
    q(f"""insert into {S}.alimentos (id, fonte, nutricionista_id, nome, grupo, porcao_g, energia_kcal, proteina_g, carboidrato_g, lipidio_g, fibra_g, sodio_mg)
          values ('{aid}', 'proprio', '{nutri}', {lit(nome)}, 'Próprios', 100, {k}, {pr}, {c}, {lp}, {f}, 0)
          on conflict (id) do update set nome = excluded.nome, energia_kcal = excluded.energia_kcal, proteina_g = excluded.proteina_g,
            carboidrato_g = excluded.carboidrato_g, lipidio_g = excluded.lipidio_g, fibra_g = excluded.fibra_g, deleted_at = null""")
    q(f"""insert into {S}.medidas_caseiras (id, alimento_id, descricao, gramas, ordem) values ('{mid}', '{aid}', {lit(medida[0])}, {medida[1]}, 0)
          on conflict (id) do update set descricao = excluded.descricao, gramas = excluded.gramas""")
    return {"id": aid, "medida": mid, "gramas": medida[1], "kcal": k}


def sub(a: dict, nome: str, kcal_item: float) -> dict:
    """Substituto equivalente em kcal (a mesma conta do editor do Nutri: kcal do item ÷ kcal por 100 g × 100)."""
    return {"alimento_id": a["id"], "nome": nome, "quantidade_g": round(kcal_item / a["kcal"] * 100, 1)}


def limpar(ids_pac: list[str]) -> dict:
    """Tira os ✓ e as fotos do diário que o E2E gravou nas matrículas de teste (arquivos do bucket primeiro)."""
    lista = ",".join(f"'{i}'" for i in ids_pac)
    fotos = q(f"select path from {S}.diario_alimentar where paciente_id in ({lista})")
    if fotos:
        sp = B.service(B.PRINCIPAL_REF)
        st, r, _ = B.http("DELETE", f"{B.PRINCIPAL_URL}/storage/v1/object/{B.bucket_do_ambiente('diario')}", {"prefixes": [f["path"] for f in fotos]},
                          {"apikey": sp, "Authorization": f"Bearer {sp}"})
        assert st in (200, 204), (st, r)
    n = q(f"""with a as (delete from {S}.refeicoes_concluidas where paciente_id in ({lista}) returning 1),
                   b as (delete from {S}.metas_concluidas where paciente_id in ({lista}) returning 1),
                   c as (delete from {S}.diario_alimentar where paciente_id in ({lista}) returning 1)
              select (select count(*) from a) as refeicoes, (select count(*) from b) as metas, (select count(*) from c) as diario""")
    return {"fotos": len(fotos), **n[0]}


def plano(chave: str, pac: dict, titulo: str, refeicoes: list[dict], *, kcal_alvo: float | None, favorito: bool, criado: str, observacao: str | None = None) -> str:
    """Recria o plano de teste (refeições e itens em cascata) com ids fixos."""
    pid = u(f"plano:{chave}")
    q(f"delete from {S}.planos_alimentares where id = '{pid}'")
    q(f"""insert into {S}.planos_alimentares (id, nutricionista_id, paciente_id, titulo, metodo, kcal_alvo, observacao, favorito, created_at, updated_at)
          values ('{pid}', '{pac['nutri']}', '{pac['id']}', {lit(titulo)}, 'alimentos', {lit(kcal_alvo)}, {lit(observacao)}, {lit(favorito)}, {lit(criado)}, now())""")
    for ordem, r in enumerate(refeicoes):
        rid = u(f"refeicao:{chave}:{r['nome']}")
        q(f"""insert into {S}.refeicoes (id, plano_id, nome, horario, ordem, observacao, dias_semana)
              values ('{rid}', '{pid}', {lit(r['nome'])}, {lit(r['horario'])}, {ordem}, {lit(r.get('obs'))}, {arr(r.get('dias', []))})""")
        for io, it in enumerate(r["itens"]):
            a = it["alimento"]
            medida = f"'{a['medida']}'" if it.get("medida") else "null"
            q(f"""insert into {S}.itens_refeicao (id, refeicao_id, alimento_id, quantidade_g, medida_caseira_id, quantidade_medida, ordem, substitutos, observacao)
                  values ('{u(f'item:{chave}:{r["nome"]}:{io}')}', '{rid}', '{a['id']}', {it['g']}, {medida}, {lit(it.get('medida'))}, {io},
                          {lit(it.get('subs', []))}, {lit(it.get('obs'))})""")
    return pid


def metas(chave: str, pac: dict, lista: list[tuple[str, str, list[int], bool]]) -> None:
    ids = [u(f"meta:{chave}:{t}") for t, _, _, _ in lista]
    for (titulo, desc, dias, ativa), mid in zip(lista, ids):
        q(f"""insert into {S}.metas (id, nutricionista_id, paciente_id, titulo, descricao, dias_semana, ativa, inicio, created_at)
              values ('{mid}', '{pac['nutri']}', '{pac['id']}', {lit(titulo)}, {lit(desc)}, {arr(dias)}, {lit(ativa)}, '2026-09-01', now() - interval '{len(ids) - ids.index(mid)} minutes')
              on conflict (id) do update set titulo = excluded.titulo, descricao = excluded.descricao, dias_semana = excluded.dias_semana,
                ativa = excluded.ativa, deleted_at = null""")


def orientacoes(chave: str, pac: dict, lista: list[tuple[str, str, str]]) -> None:
    for titulo, conteudo, criado in lista:
        oid = u(f"orientacao:{chave}:{titulo}")
        q(f"""insert into {S}.orientacoes (id, nutricionista_id, paciente_id, titulo, conteudo, created_at)
              values ('{oid}', '{pac['nutri']}', '{pac['id']}', {lit(titulo)}, {lit(conteudo)}, {lit(criado)})
              on conflict (id) do update set titulo = excluded.titulo, conteudo = excluded.conteudo, created_at = excluded.created_at, deleted_at = null""")


GERAIS = """## Hidratação
Beba água ao longo de todo o dia, sem esperar a sede: deixe uma garrafa por perto e dê preferência à água pura.

## Mastigação e ritmo das refeições
Sente-se para comer, sem pressa e longe de telas. Mastigue bem cada porção.

## Vegetais e frutas
- Inclua verduras e legumes no almoço e no jantar, ocupando **metade do prato**.
- Varie as cores ao longo da semana.
- Prefira a fruta inteira ao suco.

## Sono
Dormir bem faz parte do tratamento: tente manter de 7 a 9 horas por noite."""
TREINO = """## Antes do treino
Faça uma refeição leve 60 a 90 minutos antes: uma fruta com aveia ou um pão integral com pasta de amendoim.

## Depois do treino
- Proteína em até 2 horas (frango, peixe, ovos ou whey).
- **Beba água**: 500 ml na primeira hora."""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limpar", action="store_true", help="só tira os ✓ e as fotos do diário das matrículas de teste")
    a = ap.parse_args()
    B.ESTADO["schema"] = S

    diego = matricula_de(B.EMAIL["w10-aluno"])
    pac = matricula_de(B.EMAIL["paciente"])
    paula = matricula_de(B.EMAIL["w7-paciente"])
    lima = matricula_de(B.EMAIL["w10-paciente"])
    todos = [diego["id"], pac["id"], paula["id"], lima["id"]]
    print("limpeza:", limpar(todos))
    if a.limpar:
        return 0

    # ─── alimentos ───
    t = {n: taco(n) for n in [
        "Aveia, flocos, crua", "Maçã, Fuji, com casca, crua", "Frango, peito, sem pele, grelhado", "Arroz, integral, cozido", "Feijão, carioca, cozido",
        "Brócolis, cozido", "Azeite, de oliva, extra virgem", "Pão, trigo, forma, integral", "Banana, prata, crua", "Merluza, filé, assado",
        "Batata, doce, cozida", "Alface, crespa, crua", "Tomate, com semente, cru", "Iogurte, natural, desnatado", "Castanha-do-Brasil, crua",
        "Mamão, Papaia, cru", "Mandioca, cozida",
    ]}
    for nutri in {diego["nutri"], pac["nutri"], paula["nutri"]}:
        alimento_proprio(nutri, "ovo", "Ovo cozido", (145.7, 13.29, 0.61, 9.48, 0), ("1 unidade", 50))
        alimento_proprio(nutri, "whey", "Whey protein", (400, 80, 8, 6, 0), ("1 scoop", 30))
        alimento_proprio(nutri, "pasta", "Pasta de amendoim integral", (588, 25, 20, 50, 8), ("1 colher de sopa", 15))

    def proprio(nutri: str, chave: str) -> dict:
        return {"id": u(f"alimento:{nutri}:{chave}"), "medida": u(f"medida:{nutri}:{chave}")}

    def refeicoes_tela3(nutri: str) -> list[dict]:
        ovo, whey, pasta = proprio(nutri, "ovo"), proprio(nutri, "whey"), proprio(nutri, "pasta")
        return [
            {"nome": "Café da manhã", "horario": "07:00", "itens": [
                {"alimento": ovo, "g": 150, "medida": 3},
                {"alimento": t["Aveia, flocos, crua"], "g": 60, "subs": [sub(t["Pão, trigo, forma, integral"], "Pão, trigo, forma, integral", 236.3),
                                                                         sub(t["Banana, prata, crua"], "Banana, prata, crua", 236.3)]},
                {"alimento": whey, "g": 30, "medida": 1},
            ]},
            {"nome": "Lanche da manhã", "horario": "10:00", "itens": [
                {"alimento": t["Maçã, Fuji, com casca, crua"], "g": 150, "subs": [sub(t["Banana, prata, crua"], "Banana, prata, crua", 83.3),
                                                                                   sub(t["Mamão, Papaia, cru"], "Mamão, Papaia, cru", 83.3)]},
                {"alimento": whey, "g": 30, "medida": 1},
            ]},
            {"nome": "Almoço", "horario": "13:00", "obs": "Monte o prato com metade de salada.", "itens": [
                {"alimento": t["Frango, peito, sem pele, grelhado"], "g": 180, "subs": [sub(t["Merluza, filé, assado"], "Merluza, filé, assado", 286.5)]},
                {"alimento": t["Arroz, integral, cozido"], "g": 180, "subs": [sub(t["Batata, doce, cozida"], "Batata, doce, cozida", 222.4),
                                                                               sub(t["Mandioca, cozida"], "Mandioca, cozida", 222.4)]},
                {"alimento": t["Feijão, carioca, cozido"], "g": 100},
                {"alimento": t["Brócolis, cozido"], "g": 80},
                {"alimento": t["Azeite, de oliva, extra virgem"], "g": 5, "obs": "1 colher de chá"},
            ]},
            {"nome": "Lanche da tarde", "horario": "16:00", "itens": [
                {"alimento": t["Pão, trigo, forma, integral"], "g": 50},
                {"alimento": pasta, "g": 15, "medida": 1},
                {"alimento": t["Banana, prata, crua"], "g": 90},
            ]},
            {"nome": "Jantar", "horario": "19:00", "itens": [
                {"alimento": t["Merluza, filé, assado"], "g": 180},
                {"alimento": t["Batata, doce, cozida"], "g": 200},
                {"alimento": t["Alface, crespa, crua"], "g": 40},
                {"alimento": t["Tomate, com semente, cru"], "g": 80},
                {"alimento": t["Azeite, de oliva, extra virgem"], "g": 5},
            ]},
            {"nome": "Ceia", "horario": "22:00", "dias": [dia(2), dia(3)], "itens": [
                {"alimento": t["Iogurte, natural, desnatado"], "g": 170},
                {"alimento": t["Castanha-do-Brasil, crua"], "g": 10},
            ]},
        ]

    # ─── Diego (a tela 3) ───
    plano("diego-atual", diego, "Plano alimentar · definição", refeicoes_tela3(diego["nutri"]), kcal_alvo=2450, favorito=True, criado="2026-09-20T12:00:00-03:00",
          observacao="Beba de 2,5 a 3 litros de água por dia. As opções em verde trocam um alimento por outro com as mesmas calorias.")
    plano("diego-anterior", diego, "Plano de adaptação", refeicoes_tela3(diego["nutri"])[:3], kcal_alvo=2200, favorito=False, criado="2026-08-15T12:00:00-03:00")
    metas("diego", diego, [
        ("Beber 2,5 litros de água", "Um copo ao acordar e uma garrafa de 500 ml por turno.", [1, 2, 3, 4, 5, 6, 7], True),
        ("Caminhar 30 minutos", "Em ritmo confortável, de preferência ao ar livre.", sorted({dia(0), dia(2), dia(4)}), True),
        ("Dormir de 7 a 8 horas", "", [1, 2, 3, 4, 5, 6, 7], True),
        ("Comer 3 porções de frutas", "Uma porção é uma fruta média.", sorted({dia(1), dia(3)}), True),
        ("Registrar o diário alimentar", "", [1, 2, 3, 4, 5, 6, 7], False),
    ])
    orientacoes("diego", diego, [("Orientações gerais", GERAIS, "2026-09-20T12:00:00-03:00"), ("Treino e alimentação", TREINO, "2026-09-28T12:00:00-03:00")])

    # ─── Paciente Teste Claude (o lado a lado com o site antigo) ───
    ovo, whey = proprio(pac["nutri"], "ovo"), proprio(pac["nutri"], "whey")
    plano("paciente", pac, "Plano teste W11", [
        {"nome": "Café da manhã", "horario": "07:30", "itens": [{"alimento": ovo, "g": 100, "medida": 2}, {"alimento": t["Pão, trigo, forma, integral"], "g": 50}]},
        {"nome": "Pré-treino", "horario": "09:30", "itens": []},
        {"nome": "Almoço", "horario": "12:30", "itens": [
            {"alimento": t["Frango, peito, sem pele, grelhado"], "g": 150},
            {"alimento": t["Arroz, integral, cozido"], "g": 150, "subs": [sub(t["Batata, doce, cozida"], "Batata, doce, cozida", 185.3)]},
        ]},
        {"nome": "Lanche da tarde", "horario": "16:00", "itens": [{"alimento": t["Iogurte, natural, desnatado"], "g": 170}, {"alimento": whey, "g": 30, "medida": 1}]},
        {"nome": "Jantar", "horario": "19:30", "itens": [{"alimento": t["Merluza, filé, assado"], "g": 150}, {"alimento": t["Batata, doce, cozida"], "g": 150}]},
    ], kcal_alvo=1800, favorito=True, criado="2026-09-25T12:00:00-03:00", observacao="Plano de teste do Physiq (W11).")
    metas("paciente", pac, [("Beber 2 litros de água", "", [1, 2, 3, 4, 5, 6, 7], True), ("Caminhar 30 minutos", "", sorted({dia(0), dia(2)}), True)])
    orientacoes("paciente", pac, [("Orientações gerais", GERAIS, "2026-09-25T12:00:00-03:00")])

    # ─── Paula Nutri: plano só de outros dias (dia sem refeição) ───
    plano("paula-fim", paula, "Plano de fim de semana", [
        {"nome": "Brunch", "horario": "10:00", "dias": [dia(2), dia(3)], "itens": [{"alimento": t["Banana, prata, crua"], "g": 100}]},
        {"nome": "Jantar", "horario": "19:00", "dias": [dia(2), dia(3)], "itens": [{"alimento": t["Merluza, filé, assado"], "g": 150}]},
    ], kcal_alvo=None, favorito=True, criado="2026-09-26T12:00:00-03:00")

    # ─── Paula Lima: continua sem plano ───
    sobra = q(f"select count(*)::int as n from {S}.planos_alimentares where paciente_id = '{lima['id']}' and deleted_at is null")[0]["n"]
    assert sobra == 0, f"a Paula Lima devia estar sem plano ({sobra})"

    resumo = q(f"""select pl.titulo, pa.nome, (select count(*) from {S}.refeicoes r where r.plano_id = pl.id) as refeicoes,
                          (select count(*) from {S}.itens_refeicao i join {S}.refeicoes r on r.id = i.refeicao_id where r.plano_id = pl.id) as itens
                     from {S}.planos_alimentares pl join {S}.pacientes pa on pa.id = pl.paciente_id
                    where pl.id in ('{u('plano:diego-atual')}', '{u('plano:diego-anterior')}', '{u('plano:paciente')}', '{u('plano:paula-fim')}')""")
    for r in resumo:
        print(f"  {r['nome']}: {r['titulo']} — {r['refeicoes']} refeições, {r['itens']} itens")
    print(f"hoje {HOJE} (dia {DOW}); ceia do Diego nos dias {[dia(2), dia(3)]}; metas de hoje do Diego: água, caminhar, dormir")
    return 0


if __name__ == "__main__":
    sys.exit(main())
