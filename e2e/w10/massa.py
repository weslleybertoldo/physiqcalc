#!/usr/bin/env python3
"""Physiq W10 — contas e massa de TESTE da aba Evolução no schema `staging` dos 2 bancos (idempotente; SÓ contas de teste — P26).

  w10-aluno     "Diego Almeida" (Treino + Nutrição na "Consultoria Ferreira W7": Lucas Ferreira = personal, Camila Rocha = nutri)
                Banco do Treino (staging): o perfil com a composição atual (7 dobras), 6 avaliações do personal (14/03 → 22/09) e
                as fotos mensais de junho e setembro (Frente, Costas, Lateral D e E) no bucket registros-staging.
                Banco principal (staging): 2 antropometrias da Camila (28/05 e 26/08, Pollock 3) e as fotos de evolução de 26/08
                (Frente, Lado D, Costas) no bucket evolucao-staging.
                → os 2 bancos juntos na série: 8 avaliações (7 nos últimos 6 meses), fotos das 2 origens.
  w10-paciente  "Paula Lima" (só Nutrição, com a Camila): 1 antropometria (10/09, Pollock 7), sem foto.
As fotos são as de banco grátis das telas aprovadas (assets/fotos do gerador) — nenhuma foto de gente real.
Uso: python3 e2e/w10/massa.py
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
CONTA_W7 = "Consultoria Ferreira W7"

PERFIL_DIEGO = {
    "nome": "Diego Almeida", "sexo": "male", "idade": 31, "peso": 84.2, "altura": 178, "metodo_avaliacao": "dobras_7",
    "dobra_1": 11, "dobra_2": 12, "dobra_3": 9, "dobra_4": 13, "dobra_5": 19, "dobra_6": 15, "dobra_7": 13,
    "percentual_gordura": 15.9, "massa_gorda": 13.39, "massa_magra": 70.81, "tmb_mifflin": 1822, "tmb_katch": 1900,
    "tmb_metodo": "katch", "medida_pescoco": 39, "medida_ombro": 118, "medida_peitoral": 104, "medida_cintura": 84,
    "medida_abdomen": 87, "medida_quadril": 98, "medida_braco_d": 37.5, "medida_braco_e": 37.2, "medida_antebraco_d": 30,
    "medida_antebraco_e": 29.8, "medida_coxa_d": 58, "medida_coxa_e": 57.6, "medida_panturrilha_d": 38, "medida_panturrilha_e": 37.8,
}
# (data, peso, % gordura, cintura, braço D, observação) — 7 dobras; a última = o perfil acima
AVALIACOES_DIEGO = [
    ("2026-03-14", 90.3, 22.4, 92.0, 36.4, "Início do protocolo"),
    ("2026-04-15", 89.1, 21.1, 90.5, 36.6, None),
    ("2026-05-16", 87.9, 19.9, 89.0, 36.8, None),
    ("2026-06-14", 86.3, 18.4, 87.5, 37.0, None),
    ("2026-07-19", 85.5, 17.4, 85.8, 37.2, None),
    ("2026-09-22", 84.2, 15.9, 84.0, 37.5, "Ótima evolução no corte"),
]
# (data, peso, % gordura, cintura, abdômen) — Pollock 3 da nutricionista
ANTROPO_DIEGO = [("2026-05-28", 88.4, 19.6, 89.5, 92.0), ("2026-08-26", 84.9, 16.8, 85.5, 88.0)]
# setembro = as fotos da tela 4 (fisico3/1/2); junho e a da nutri com outras fotos (o Comparar mostra 2 fotos diferentes)
FOTOS_TREINO = {
    "2026-09": {"frente": "fisico3.jpg", "costas": "fisico2.jpg", "lateral_direita": "fisico1.jpg", "lateral_esquerda": "fisico1.jpg"},
    "2026-06": {"frente": "fisico1.jpg", "costas": "hero.jpg", "lateral_direita": "fisico3.jpg", "lateral_esquerda": "fisico3.jpg"},
}
FOTOS_NUTRI = {"frente": "hero.jpg", "lado_d": "fisico3.jpg", "costas": "fisico1.jpg"}


def q(sql: str) -> list:
    return B.sql_principal(sql)


def subir(url_base: str, chave: str, bucket: str, caminho: str, arquivo: str) -> None:
    dados = (B.FOTOS / arquivo).read_bytes()
    req = urllib.request.Request(f"{url_base}/storage/v1/object/{bucket}/{caminho}", data=dados, method="POST",
                                 headers={"Authorization": f"Bearer {chave}", "apikey": chave, "Content-Type": "image/jpeg", "x-upsert": "true",
                                          "User-Agent": "physiq-e2e-w10"})
    with urllib.request.urlopen(req, timeout=60) as r:
        assert r.status in (200, 201), r.status


def conta_w7() -> str:
    r = q(f"select id::text from {S}.contas where nome = '{CONTA_W7}' order by criado_em limit 1")
    assert r, "conta W7 não existe (rode e2e/w07/contas.py)"
    return r[0]["id"]


def uid_email(email: str) -> str:
    r = q(f"select id::text from auth.users where lower(email) = '{email}'")
    assert r, email
    return r[0]["id"]


def matricular(conta: str, personal: bool, nutri: bool, objetivo: str | None) -> str:
    u = B.uid(conta)
    c = conta_w7()
    pers = f"'{uid_email('w7.personal.teste.claude@physiqnutri.app')}'" if personal else "null"
    nut = f"'{uid_email('w7.nutri.teste.claude@physiqnutri.app')}'" if nutri else "null"
    r = q(f"select {S}.matricular_na_conta('{u}', '{c}', {pers}, {nut}, 'novo', true) as r")[0]["r"]
    assert r.get("ok"), (conta, r)
    pid = q(f"select id::text from {S}.pacientes where user_id = '{u}' and conta_id = '{c}' and deleted_at is null")[0]["id"]
    obj = f"$o${objetivo}$o$" if objetivo else "null"
    q(f"update {S}.pacientes set nome = $n${B.NOMES[conta]}$n$, email = '{B.EMAIL[conta]}', ativo = true, objetivo = {obj} where id = '{pid}'")
    q(f"update {S}.profiles set nome = $n${B.NOMES[conta]}$n$ where id = '{u}'")
    return pid


def treino_diego() -> str:
    if not B.saude_treino():
        raise SystemExit("Banco do Treino lento/instável — parei (nada de restart)")
    st, r = B.B5.trocar_token("w10-aluno")
    assert st == 200, (st, r)
    tid = B.treino_id("w10-aluno")
    assert tid, "sem vínculo no Treino"
    sets = ", ".join(f"{k} = {json.dumps(v) if isinstance(v, str) else v}".replace('"', "'") for k, v in PERFIL_DIEGO.items())
    B.sql_treino(f"update {S}.physiq_profiles set {sets} where id = '{tid}'")
    B.sql_treino(f"delete from {S}.physiq_avaliacoes where user_id = '{tid}'")
    linhas = []
    for data, peso, bf, cint, braco, obs in AVALIACOES_DIEGO:
        mg = round(peso * bf / 100, 2)
        mm = round(peso - mg, 2)
        dob = [round(v * bf / 15.9, 1) for v in (11, 12, 9, 13, 19, 15, 13)]
        o = f"$o${obs}$o$" if obs else "null"
        linhas.append(
            f"('{tid}', '{data}', {peso}, 178, {bf}, {mg}, {mm}, 'dobras_7', {', '.join(map(str, dob))}, "
            f"{round(10 * peso + 6.25 * 178 - 5 * 31 + 5)}, {round(370 + 21.6 * mm)}, 'katch', {cint}, {braco}, {round(braco - 0.3, 1)}, 'professor', {o}, '{data}T13:00:00Z')")
    B.sql_treino(f"""insert into {S}.physiq_avaliacoes (user_id, data_avaliacao, peso, altura, percentual_gordura, massa_gorda, massa_magra,
        metodo_avaliacao, dobra_1, dobra_2, dobra_3, dobra_4, dobra_5, dobra_6, dobra_7, tmb_mifflin, tmb_katch, tmb_metodo,
        medida_cintura, medida_braco_d, medida_braco_e, created_by, observacao, created_at) values {', '.join(linhas)}""")
    # o perfil = a última avaliação (o que o Salvar de Dobras & Medidas do painel grava junto)
    B.sql_treino(f"""update {S}.physiq_avaliacoes set medida_pescoco = 39, medida_ombro = 118, medida_peitoral = 104, medida_abdomen = 87,
        medida_quadril = 98, medida_antebraco_d = 30, medida_antebraco_e = 29.8, medida_coxa_d = 58, medida_coxa_e = 57.6,
        medida_panturrilha_d = 38, medida_panturrilha_e = 37.8, tmb_katch = 1900, tmb_mifflin = 1822, massa_gorda = 13.39, massa_magra = 70.81
        where user_id = '{tid}' and data_avaliacao = '2026-09-22'""")
    # fotos mensais (junho e setembro)
    st_key = B.service(B.TREINO_REF)
    B.sql_treino(f"delete from {S}.physiq_registros_fotos where user_id = '{tid}'")
    valores = []
    for mes, fotos in FOTOS_TREINO.items():
        for tipo, arq in fotos.items():
            caminho = f"{tid}/{mes}/{tipo}.jpg"
            subir(B.TREINO_URL, st_key, "registros-staging", caminho, arq)
            valores.append(f"('{tid}', '{mes}-01', '{tipo}', '{caminho}')")
    B.sql_treino(f"insert into {S}.physiq_registros_fotos (user_id, mes_ref, tipo, storage_path) values {', '.join(valores)}")
    return tid


def principal_diego(pid: str) -> None:
    camila = uid_email("w7.nutri.teste.claude@physiqnutri.app")
    q(f"delete from {S}.antropometrias where paciente_id = '{pid}'")
    for data, peso, bf, cint, abd in ANTROPO_DIEGO:
        mg = round(peso * bf / 100, 2)
        mm = round(peso - mg, 2)
        imc = round(peso / (1.78 ** 2), 2)
        classe = "Sobrepeso" if imc >= 25 else "Peso normal"
        circ = {"torax": 104.5 if data < "2026-07" else 103.5, "cintura": cint, "abdomen": abd, "quadril": 100 if data < "2026-07" else 98.5,
                "braco_d": 36.9 if data < "2026-07" else 37.3, "coxa_d": 58.8 if data < "2026-07" else 58.1}
        dob = {"peitoral": round(14 * bf / 16.8, 1), "abdominal": round(24 * bf / 16.8, 1), "coxa": round(17 * bf / 16.8, 1)}
        res = {"imc": imc, "classificacao_imc": classe, "densidade": None, "percentual_gordura": bf, "massa_gorda": mg, "massa_magra": mm,
               "rcq": round(cint / circ["quadril"], 2), "rce": round(cint / 178, 2)}
        q(f"""insert into {S}.antropometrias (nutricionista_id, paciente_id, data, peso, altura, sexo, idade, circunferencias, dobras,
              protocolo, resultados, observacao)
              values ('{camila}', '{pid}', '{data}T14:00:00-03:00', {peso}, 178, 'masculino', 31, '{json.dumps(circ)}'::jsonb,
                      '{json.dumps(dob)}'::jsonb, 'pollock3', '{json.dumps(res)}'::jsonb, 'nota interna da nutri (o aluno não vê)')""")
    sp = B.service(B.PRINCIPAL_REF)
    q(f"delete from {S}.fotos_evolucao where paciente_id = '{pid}'")
    for pos, arq in FOTOS_NUTRI.items():
        caminho = f"{camila}/{pid}/w10-2026-08-26-{pos}.jpg"
        subir(B.PRINCIPAL_URL, sp, B.bucket_do_ambiente("evolucao"), caminho, arq)
        tam = (B.FOTOS / arq).stat().st_size
        q(f"""insert into {S}.fotos_evolucao (nutricionista_id, paciente_id, posicao, data, path, tamanho, mime, observacao)
              values ('{camila}', '{pid}', '{pos}', '2026-08-26', '{caminho}', {tam}, 'image/jpeg', 'obs interna')""")


def principal_paula(pid: str) -> None:
    camila = uid_email("w7.nutri.teste.claude@physiqnutri.app")
    q(f"delete from {S}.antropometrias where paciente_id = '{pid}'")
    res = {"imc": 22.4, "classificacao_imc": "Peso normal", "densidade": 1.0425, "percentual_gordura": 24.8, "massa_gorda": 15.67,
           "massa_magra": 47.53, "rcq": 0.74, "rce": 0.43}
    circ = {"cintura": 72, "quadril": 97, "braco_d": 27.5, "coxa_d": 55}
    dob = {"peitoral": 9, "axilar_media": 11, "triceps": 18, "subescapular": 14, "abdominal": 21, "suprailiaca": 16, "coxa": 25}
    q(f"""insert into {S}.antropometrias (nutricionista_id, paciente_id, data, peso, altura, sexo, idade, circunferencias, dobras, protocolo, resultados)
          values ('{camila}', '{pid}', '2026-09-10T10:00:00-03:00', 63.2, 168, 'feminino', 27, '{json.dumps(circ)}'::jsonb, '{json.dumps(dob)}'::jsonb,
                  'pollock7', '{json.dumps(res)}'::jsonb)""")


def main() -> int:
    for k in ("w10-aluno", "w10-paciente"):
        email, s = B.CONTAS[k]
        print(f"principal  {email:46s} {B.B5.garantir_usuario(email, s, B.NOMES[k])}")
    pd = matricular("w10-aluno", True, True, "definição")
    pp = matricular("w10-paciente", False, True, "emagrecimento")
    tid = treino_diego()
    principal_diego(pd)
    principal_paula(pp)
    print(f"w10-aluno: paciente {pd} · Treino {tid}")
    print(f"w10-paciente: paciente {pp}")
    print(B.sql_treino(f"select count(*)::int aval from {S}.physiq_avaliacoes where user_id = '{tid}'"),
          B.sql_treino(f"select count(*)::int fotos from {S}.physiq_registros_fotos where user_id = '{tid}'"))
    print(q(f"select (select count(*) from {S}.antropometrias where paciente_id = '{pd}') antro_diego, "
            f"(select count(*) from {S}.fotos_evolucao where paciente_id = '{pd}') fotos_diego, "
            f"(select count(*) from {S}.antropometrias where paciente_id = '{pp}') antro_paula"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
