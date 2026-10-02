#!/usr/bin/env python3
"""Physiq W26 — massa de TESTE no staging para a Lixeira e os Modelos (idempotente; SÓ *.teste.claude@physiqnutri.app — P26; e-mail
e CPF únicos — W16b). Tudo com "W26" no nome.

  (sem opção)  Na "Clínica Sabor W24" (Helena dona + nutri, Sofia nutri, Diego personal):
                 alunos na lixeira (removidos pelo caminho do app: aluno_remover):
                   Paula Restaura W26 (Sofia, sem login)          → restaurar volta igual
                   Gustavo Treino W26 (Diego, sem login)          → só Diego e Helena veem (P1)
                   Vitor Repetido W26 (Helena) + "Vitor Outro W26" vivo com o MESMO e-mail → restaurar recusa (W16b)
                   Lia App W26 (Helena, COM login)                → removida vira aluna do app (W7b); restaurar encerra a do app
                   Otto Outro W26 (Helena, COM login)             → depois entrou na "Outra Conta W26" → restaurar recusa (P7)
                 clínicos na lixeira: "Anamnese W26" e uma antropometria (Sofia · Ana Clara W24), "Plano W26 restaurar" (Helena ·
                 Bruna Costa W24, com 1 refeição e 1 item) e "Plano W26 apagar" (Sofia · Ana Clara, excluído há 20 dias);
                 pré-consulta: "Pré-consulta W26" (formulário da Sofia) e "Avaliação do treino W26" (do Diego), 1 resposta de cada
                 na lixeira; ★ nos modelos da Sofia (anamnese e meta) e no "Plano W26 favorito".
               Na "Consultoria Ferreira W13" (10 de 10 alunos): a "Ana Nova W13" que já está na lixeira → restaurar recusa (limite).
  --limpar     apaga TUDO o que a W26 criou (as linhas W26 nas 2 contas, a Outra Conta W26 e as matrículas do app dos 2 logins);
               os logins w26.* ficam (só de teste).

Uso: python3 e2e/w26/massa.py [--limpar]
"""
from __future__ import annotations

import argparse
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S


def q(sql: str) -> list:
    return B.sql_principal(sql)


def lit(v) -> str:
    return B.q(v)


def cpf(n: int) -> str:
    """CPF de TESTE só com o formato (11 dígitos, únicos por aluno — a trava da W16b não confere dígito verificador)."""
    return f"9{2600000000 + n:010d}"


def aluno(conta: str, nome: str, email: str, n: int, nutri: str | None = None, personal: str | None = None, login: str | None = None) -> str:
    """O aluno W26 (vivo ou na lixeira) — cria se não existe; nunca mexe em quem já está na lixeira."""
    r = q(f"select id::text, deleted_at from {S}.pacientes where conta_id = '{conta}' and nome = {lit(nome)} order by created_at limit 1")
    if r:
        return r[0]["id"]
    n_ = f"'{B.uid(nutri)}'" if nutri else "null"
    p_ = f"'{B.uid(personal)}'" if personal else "null"
    u_ = f"'{B.uid(login)}'" if login else "null"
    return q(f"""insert into {S}.pacientes (nutricionista_id, personal_id, user_id, conta_id, nome, email, cpf, origem, ativo)
                 values ({n_}, {p_}, {u_}, '{conta}', {lit(nome)}, {lit(email)}, '{cpf(n)}', 'novo', true) returning id::text""")[0]["id"]


def remover(quem: str, paciente: str) -> None:
    """Tira da lista pelo MESMO caminho do painel (aluno_remover da W13, como a pessoa) — só se ainda estiver viva."""
    if q(f"select 1 from {S}.pacientes where id = '{paciente}' and deleted_at is null"):
        st, r = B.rpc(quem, "aluno_remover", {"p_paciente": paciente})
        assert st == 200 and isinstance(r, dict) and r.get("ok") and r.get("removido"), (quem, paciente, st, r)


def outra_conta() -> str:
    c = B.conta_de("w26-outro", B.NOME_OUTRA)
    if c:
        return c
    u = B.uid("w26-outro")
    c = q(f"""insert into {S}.contas (nome, dono_id, origem, plano, faixa, periodicidade, situacao, teste_ate)
              values ({lit(B.NOME_OUTRA)}, '{u}', 'nova', 'treino', 'f10', 'mensal', 'teste', now() + interval '14 days') returning id::text""")[0]["id"]
    q(f"""insert into {S}.conta_membros (conta_id, user_id, papeis, status, codigo_convite)
          values ('{c}', '{u}', array['dono','personal']::text[], 'ativo', {S}.gerar_codigo_membro({lit(B.NOMES['w26-outro'])}))""")
    return c


def clinico(tabela: str, onde: str, inserir: str, dias: int) -> str:
    r = q(f"select id::text from {S}.{tabela} where {onde} limit 1")
    if r:
        return r[0]["id"]
    novo = q(f"{inserir} returning id::text")[0]["id"]
    q(f"update {S}.{tabela} set deleted_at = now() - interval '{dias} days' where id = '{novo}'")
    return novo


def formulario(autor: str, conta: str, titulo: str) -> str:
    r = q(f"select id::text from {S}.formularios_preconsulta where nutricionista_id = '{B.uid(autor)}' and titulo = {lit(titulo)} limit 1")
    if r:
        return r[0]["id"]
    slug = f"w26-{secrets.token_hex(4)}"
    return q(f"""insert into {S}.formularios_preconsulta (nutricionista_id, conta_id, titulo, descricao, slug, perguntas)
                 values ('{B.uid(autor)}', '{conta}', {lit(titulo)}, 'Formulário de teste da W26', '{slug}',
                         '[{{"id":"q1","tipo":"texto","texto":"Qual o seu objetivo?"}}]'::jsonb) returning id::text""")[0]["id"]


def resposta(autor: str, form: str, titulo: str, nome: str, dias: int) -> str:
    return clinico("respostas_preconsulta", f"formulario_id = '{form}' and nome = {lit(nome)}",
                   f"""insert into {S}.respostas_preconsulta (nutricionista_id, formulario_id, titulo, nome, email, respostas)
                       values ('{B.uid(autor)}', '{form}', {lit(titulo)}, {lit(nome)}, 'w26.resposta.teste.claude@physiqnutri.app', '{{"q1":"Emagrecer"}}'::jsonb)""", dias)


def montar() -> dict:
    for k in ("w26-lia", "w26-otto", "w26-outro"):
        email, s = B.CONTAS[k]
        print(f"principal  {email:46s} {B.B5.garantir_usuario(email, s, B.NOMES[k])}")
        q(f"update {S}.profiles set nome = {lit(B.NOMES[k])} where id = '{B.uid(k)}'")
    c = B.conta_w24()
    ana = B.paciente("Ana Clara W24", c)["id"]
    bruna = B.paciente("Bruna Costa W24", c)["id"]
    sofia, helena = B.uid("w24-nutri"), B.uid("w24-dono")

    # alunos na lixeira (o caminho do painel: aluno_remover)
    paula = aluno(c, "Paula Restaura W26", "w26.paula.teste.claude@physiqnutri.app", 1, nutri="w24-nutri")
    remover("w24-nutri", paula)
    gustavo = aluno(c, "Gustavo Treino W26", "w26.gustavo.teste.claude@physiqnutri.app", 2, personal="w24-personal")
    remover("w24-personal", gustavo)
    vitor = aluno(c, "Vitor Repetido W26", "w26.vitor.teste.claude@physiqnutri.app", 3, nutri="w24-dono")
    remover("w24-dono", vitor)
    vitor2 = aluno(c, "Vitor Outro W26", "w26.vitor.teste.claude@physiqnutri.app", 4, nutri="w24-dono")  # vivo, o MESMO e-mail
    lia = aluno(c, "Lia App W26", B.EMAIL["w26-lia"], 5, nutri="w24-dono", login="w26-lia")
    remover("w24-dono", lia)
    otto = aluno(c, "Otto Outro W26", B.EMAIL["w26-otto"], 6, nutri="w24-dono", login="w26-otto")
    remover("w24-dono", otto)
    outra = outra_conta()
    if not q(f"select 1 from {S}.pacientes where user_id = '{B.uid('w26-otto')}' and conta_id = '{outra}' and deleted_at is null"):
        r = q(f"select {S}.matricular_na_conta('{B.uid('w26-otto')}', '{outra}', '{B.uid('w26-outro')}', null, 'novo', true) r")
        assert r and r[0]["r"].get("ok"), r

    # clínicos na lixeira
    anamnese = clinico("anamneses", f"paciente_id = '{ana}' and titulo = 'Anamnese W26'",
                       f"insert into {S}.anamneses (nutricionista_id, paciente_id, titulo) values ('{sofia}', '{ana}', 'Anamnese W26')", 3)
    antro = clinico("antropometrias", f"paciente_id = '{ana}' and observacao = 'Antropometria W26'",
                    f"""insert into {S}.antropometrias (nutricionista_id, paciente_id, data, peso, altura, observacao)
                        values ('{sofia}', '{ana}', '2026-09-25 10:00:00-03', 62.4, 165, 'Antropometria W26')""", 1)
    plano = clinico("planos_alimentares", f"paciente_id = '{bruna}' and titulo = 'Plano W26 restaurar'",
                    f"insert into {S}.planos_alimentares (nutricionista_id, paciente_id, titulo, kcal_alvo) values ('{helena}', '{bruna}', 'Plano W26 restaurar', 1800)", 5)
    if not q(f"select 1 from {S}.refeicoes where plano_id = '{plano}'"):
        ref = q(f"insert into {S}.refeicoes (plano_id, nome, horario, ordem) values ('{plano}', 'Almoço', '12:00', 0) returning id::text")[0]["id"]
        alim = q(f"select id::text from {S}.alimentos where fonte = 'taco' and nome ilike 'Arroz, integral, cozido%' limit 1")
        if alim:
            q(f"insert into {S}.itens_refeicao (refeicao_id, alimento_id, quantidade_g, ordem) values ('{ref}', '{alim[0]['id']}', 150, 0)")
    plano_apagar = clinico("planos_alimentares", f"paciente_id = '{ana}' and titulo = 'Plano W26 apagar'",
                           f"insert into {S}.planos_alimentares (nutricionista_id, paciente_id, titulo) values ('{sofia}', '{ana}', 'Plano W26 apagar')", 20)
    if not q(f"select 1 from {S}.refeicoes where plano_id = '{plano_apagar}'"):
        q(f"insert into {S}.refeicoes (plano_id, nome, horario, ordem) values ('{plano_apagar}', 'Jantar', '19:00', 0)")

    # pré-consulta: formulário da nutri (só nutricionista vê a resposta) e do personal
    f_sofia = formulario("w24-nutri", c, "Pré-consulta W26")
    r_sofia = resposta("w24-nutri", f_sofia, "Pré-consulta W26", "Marta Respondente W26", 1)
    f_diego = formulario("w24-personal", c, "Avaliação do treino W26")
    r_diego = resposta("w24-personal", f_diego, "Avaliação do treino W26", "Caio Respondente W26", 2)

    # ★ (Modelos): modelos da Sofia + 1 plano favorito vivo
    for tabela, colunas, valores in (
        ("modelos_anamnese", "titulo, perguntas, favorito", "'Anamnese esportiva W26', '[\"Pratica esporte?\",\"Quantas vezes por semana?\"]'::jsonb, true"),
        ("modelos_meta", "titulo, dias_semana, favorito", "'Beber 2 L de água W26', array[1,2,3,4,5]::smallint[], true"),
    ):
        if not q(f"select 1 from {S}.{tabela} where nutricionista_id = '{sofia}' and titulo like '%W26'"):
            q(f"insert into {S}.{tabela} (nutricionista_id, {colunas}) values ('{sofia}', {valores})")
    if not q(f"select 1 from {S}.planos_alimentares where paciente_id = '{ana}' and titulo = 'Plano W26 favorito'"):
        q(f"insert into {S}.planos_alimentares (nutricionista_id, paciente_id, titulo, favorito, kcal_alvo) values ('{sofia}', '{ana}', 'Plano W26 favorito', true, 2000)")

    # item 2.1 (N-60): uma orientação da Sofia para a Ana Clara — o PDF da aba Dieta sai com a marca PHYSIQ
    if not q(f"select 1 from {S}.orientacoes where paciente_id = '{ana}' and titulo = 'Orientação W26' and deleted_at is null"):
        q(f"""insert into {S}.orientacoes (nutricionista_id, paciente_id, titulo, conteudo)
              values ('{sofia}', '{ana}', 'Orientação W26', '## Água\n- Beba 2 L por dia\n## Sono\n- Durma 8 horas')""")

    ids = {"conta_w24": c, "conta_w13": B.conta_w13(), "outra": outra, "paula": paula, "gustavo": gustavo, "vitor": vitor, "vitor2": vitor2, "lia": lia,
           "otto": otto, "anamnese": anamnese, "antropometria": antro, "plano": plano, "plano_apagar": plano_apagar, "resposta_sofia": r_sofia,
           "resposta_diego": r_diego, "ana_nova_w13": (B.paciente("Ana Nova W13", B.conta_w13()) or {}).get("id")}
    B.json_arquivo(B.SCRATCH / "massa_staging.json", ids)
    app = q(f"select {S}.conta_do_app()::text a")[0]["a"]
    print("app da Lia:", q(f"select id::text, ativo, app_encerrada_em from {S}.pacientes where user_id = '{B.uid('w26-lia')}' and conta_id = '{app}'"))
    print("Otto:", q(f"select conta_id::text, ativo, deleted_at from {S}.pacientes where user_id = '{B.uid('w26-otto')}' order by created_at"))
    return ids


def limpar() -> None:
    c = B.conta_w24()
    app = q(f"select {S}.conta_do_app()::text a")[0]["a"]
    ids_login = ", ".join(f"'{B.uid(k)}'" for k in ("w26-lia", "w26-otto") if B.uid(k))
    pacs = q(f"select id::text from {S}.pacientes where conta_id = '{c}' and nome like '%W26'")
    lista = ", ".join(f"'{x['id']}'" for x in pacs) or "null"
    q(f"delete from {S}.respostas_preconsulta where nome like '%Respondente W26'")
    q(f"delete from {S}.formularios_preconsulta where titulo in ('Pré-consulta W26', 'Avaliação do treino W26')")
    q(f"delete from {S}.anamneses where titulo = 'Anamnese W26'")
    q(f"delete from {S}.antropometrias where observacao = 'Antropometria W26'")
    q(f"delete from {S}.planos_alimentares where titulo in ('Plano W26 restaurar', 'Plano W26 apagar', 'Plano W26 favorito')")
    q(f"delete from {S}.modelos_anamnese where titulo = 'Anamnese esportiva W26'")
    q(f"delete from {S}.modelos_meta where titulo = 'Beber 2 L de água W26'")
    q(f"delete from {S}.orientacoes where titulo = 'Orientação W26'")
    q(f"delete from {S}.conta_eventos where (depois ->> 'paciente_id') in (select x::text from unnest(array[{lista}]::uuid[]) x)")
    q(f"delete from {S}.avisos where destino_user_id in ({ids_login or 'null'})")
    q(f"delete from {S}.pacientes where id in ({lista})")
    if ids_login:
        q(f"delete from {S}.pacientes where user_id in ({ids_login}) and conta_id = '{app}'")
    outra = B.conta_de("w26-outro", B.NOME_OUTRA)
    if outra:
        q(f"delete from {S}.pacientes where conta_id = '{outra}'")
        q(f"delete from {S}.conta_eventos where conta_id = '{outra}'")
        q(f"delete from {S}.conta_membros where conta_id = '{outra}'")
        q(f"delete from {S}.contas where id = '{outra}'")
    print("limpo:", len(pacs), "alunos W26 + clínicos, pré-consulta, ★ e a Outra Conta W26")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    if a.limpar:
        limpar()
    else:
        print(montar())
    return 0


if __name__ == "__main__":
    sys.exit(main())
