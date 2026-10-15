#!/usr/bin/env python3
"""Physiq W25 — massa de TESTE no STAGING (idempotente; só a "Consultoria Ferreira W13" das contas w13.*/w25.*).

Completa o que as W anteriores deixaram (agenda de hoje da W20, financeiro da W19, diário da W24) para o Dashboard da tela 6 ter
cada bloco com dado — tudo marcado para o --limpar voltar como estava:
  treino      "Carlos Souza" (aluno do Lucas, sem login no principal) ganha o treino no Banco do Treino (login de TESTE só no Treino,
              w25.carlos.teste.claude@…): semana seg/qua/sex, último treino há 10 dias (TREINO de "Precisam de atenção") e o supino
              de 65 → 70 kg há 10 dias; "Rafael Moura": treino concluído HOJE ("Treino A") e o supino de 46 kg hoje (recorde sobre os
              44 kg de antes) e a próxima avaliação marcada para 12 dias atrás (AVALIAÇÃO vencida há 12 dias);
  dieta       "Larissa Prado" (aluna da Camila COM login, w25.dieta.teste.claude@…): plano de 10 dias atrás, último ✓ há 4 dias (DIETA);
  cadastro    1 auto-cadastro pendente pelo link (o "Pendentes" de Alunos);
  preconsulta 1 resposta nova sem aluno (o número do menu) — "Fernanda Dias" respondeu há 2 h;
  aniversario "Marina Alves" faz aniversário no sábado desta semana (nascimento 03/10/1995).
Nada de cliente: só a conta de teste. E-mails e CPF únicos (W16b): só endereços w25.*.teste.claude@physiqnutri.app, sem CPF.
hml-24: o treino do Carlos é um treino PRÓPRIO da W25 ("Peito e tríceps W25", do Lucas, com o supino) — antes ele recebia o treino A
da W15 ("Peito e tríceps", que a tela 8 da W15 quer só do Rafael); a ligação velha com o A sai no montar.

Uso: python3 e2e/w25/massa.py [--limpar | --seco]   (--seco: sem rede — monta o SQL do treino próprio com ids de mentira e confere)
"""
from __future__ import annotations

import argparse
import ast
import datetime as dt
import json
import socket
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
q = B.sql_principal
qt = B.sql_treino
lit = B.q
ARQ = B.SCRATCH / "massa_staging.json"

SUPINO = "23d01e92-0780-4bbf-9451-0c04d63600cf"   # Supino Reto com Barra (catálogo)
GRUPO_A = "0d65a1c2-775e-4d9f-a4fd-c8cf9e6a600f"  # "Peito e tríceps" do Lucas (o treino A da W15) — hml-24: só para tirar a ligação velha
TREINO_W25 = "Peito e tríceps W25"  # hml-24: o treino próprio do Carlos (o aluno de teste da W25)
NOME_PRECONSULTA = "Fernanda Dias"
TITULO_PRECONSULTA = "Pré-consulta de treino W25"
NOME_PENDENTE = "Paula Nunes W25"
EMAIL_PENDENTE = "w25.pendente.teste.claude@physiqnutri.app"
TITULO_PLANO = "Plano de emagrecimento W25"
HISTORICO_W25 = "Treino A"
OBS_FAULKNER = "Avaliação de teste W25 (Faulkner)"


def hoje() -> dt.date:
    return B.B5.hoje()


def garantir_usuario_treino(email: str, senha: str, nome: str) -> str:
    """Login de TESTE só no Banco do Treino (ambiente staging: o perfil nasce em staging.physiq_profiles)."""
    assert email.endswith(".teste.claude@physiqnutri.app"), email
    sp = B.service(B.TREINO_REF)
    cab = {"apikey": sp, "Authorization": f"Bearer {sp}"}
    achado = qt(f"select id::text from auth.users where lower(email) = '{email}'")
    if achado:
        return achado[0]["id"]
    st, r, _ = B.http("POST", f"{B.B5.TREINO_URL}/auth/v1/admin/users",
                      {"email": email, "password": senha, "email_confirm": True, "user_metadata": {"full_name": nome, "ambiente": "staging"}}, cab)
    assert st == 200, (st, r)
    return r["id"]


def sql_treino_do_carlos(grupo: str, carlos: str, d10: str, d20: str) -> str:
    """hml-24: o treino do Carlos no grupo PRÓPRIO da W25 (o supino), a semana seg/qua/sex nele, os 2 treinos feitos e o supino de
    65 → 70 kg; a ligação velha com o treino A da W15 sai. Só linhas do Carlos e do grupo da W25."""
    return f"""
      delete from {S}.tb_grupos_exercicios where grupo_id = '{grupo}';
      insert into {S}.tb_grupos_exercicios (grupo_id, exercicio_id, ordem) values ('{grupo}', '{SUPINO}', 0);
      delete from {S}.tb_grupos_treino_perfis where grupo_id = '{GRUPO_A}' and user_id = '{carlos}';
      insert into {S}.tb_grupos_treino_perfis (grupo_id, user_id) values ('{grupo}', '{carlos}') on conflict (grupo_id, user_id) do nothing;
      delete from {S}.tb_semana_treinos where user_id = '{carlos}';
      insert into {S}.tb_semana_treinos (user_id, dia_semana, slot_idx, grupo_id) values
        ('{carlos}', 'SEG', 0, '{grupo}'), ('{carlos}', 'QUA', 0, '{grupo}'), ('{carlos}', 'SEX', 0, '{grupo}');
      delete from {S}.tb_treino_concluido where user_id = '{carlos}';
      insert into {S}.tb_treino_concluido (user_id, data_treino, slot_idx, concluido) values ('{carlos}', '{d10}', 0, true), ('{carlos}', '{d20}', 0, true);
      delete from {S}.tb_treino_series where user_id = '{carlos}';
      insert into {S}.tb_treino_series (user_id, exercicio_id, data_treino, numero_serie, peso, reps, concluida, slot_idx) values
        ('{carlos}', '{SUPINO}', '{d20}', 1, 65, 10, true, 0), ('{carlos}', '{SUPINO}', '{d10}', 1, 70, 8, true, 0);
    """


def montar() -> dict:
    conta = B.conta_w13()
    lucas_p = B.uid("w13-dono")
    camila = B.uid("w13-nutri")
    lucas_t = qt(f"select treino_user_id::text as tid from {S}.physiq_identidades where principal_user_id = '{lucas_p}'")[0]["tid"]
    rafael_p = B.uid("w13-aluno")
    rafael_t = qt(f"select treino_user_id::text as tid from {S}.physiq_identidades where principal_user_id = '{rafael_p}'")[0]["tid"]
    h = hoje()
    d = lambda n: (h - dt.timedelta(days=n)).isoformat()  # noqa: E731
    antes = json.loads(ARQ.read_text()) if ARQ.exists() else {}
    B.saude_ok("massa W25 (treino)")

    # ── Carlos Souza: o treino dele no Banco do Treino ──
    carlos = q(f"select id::text, treino_user_id::text as tid, user_id::text, personal_id::text from {S}.pacientes where conta_id = '{conta}' and nome = 'Carlos Souza' and deleted_at is null")[0]
    assert carlos["user_id"] is None, "o Carlos tem login no principal: a massa não mexe"
    # o personal dele no Treino (o professor_id do perfil): o mesmo responsável da matrícula (o Bruno, na massa da W13)
    prof_t = qt(f"select treino_user_id::text as tid from {S}.physiq_identidades where principal_user_id = '{carlos['personal_id']}'")[0]["tid"]
    email_c, senha_c = B.CONTAS["w25-carlos"]
    carlos_t = garantir_usuario_treino(email_c, senha_c, "Carlos Souza")
    B.B5.exec_treino(f"update {S}.physiq_profiles set nome = 'Carlos Souza', conta_id = '{conta}', professor_id = '{prof_t}', created_at = now() - interval '40 days' where id = '{carlos_t}'")
    assert qt(f"select 1 as ok from {S}.physiq_profiles where id = '{carlos_t}' and conta_id = '{conta}'"), "o perfil do Carlos não nasceu no staging"

    if carlos["tid"] != carlos_t:
        antes.setdefault("carlos_tid_antes", carlos["tid"])
        q(f"update {S}.pacientes set treino_user_id = '{carlos_t}' where id = '{carlos['id']}'")
    # hml-24: o treino próprio da W25 (o grupo guardado na massa; some → nasce de novo), do Lucas, com o supino
    grupo_w25 = antes.get("grupo_w25")
    if not (grupo_w25 and qt(f"select 1 as ok from {S}.tb_grupos_treino where id = '{grupo_w25}'")):
        grupo_w25 = qt(f"insert into {S}.tb_grupos_treino (nome, professor_id) values ({lit(TREINO_W25)}, '{lucas_t}') returning id::text as id")[0]["id"]
    antes["grupo_w25"] = grupo_w25
    B.B5.exec_treino(sql_treino_do_carlos(grupo_w25, carlos_t, d(10), d(20)))

    # ── Rafael: o treino de hoje (Atividade recente), o recorde no supino e a avaliação vencida ──
    prox = qt(f"select proxima_avaliacao::text as p from {S}.physiq_profiles where id = '{rafael_t}'")[0]["p"]
    antes.setdefault("rafael_proxima_antes", prox)
    B.B5.exec_treino(f"""
      update {S}.physiq_profiles set proxima_avaliacao = '{d(12)}' where id = '{rafael_t}';
      insert into {S}.tb_treino_concluido (user_id, data_treino, slot_idx, concluido) values ('{rafael_t}', '{d(0)}', 0, true)
        on conflict (user_id, data_treino, slot_idx) do update set concluido = true;
      delete from {S}.treino_historico where user_id = '{rafael_t}' and nome_treino = {lit(HISTORICO_W25)} and concluido_em::date >= '{d(1)}';
      insert into {S}.treino_historico (user_id, nome_treino, iniciado_em, concluido_em, duracao_segundos, exercicios_concluidos)
        values ('{rafael_t}', {lit(HISTORICO_W25)}, now() - interval '62 minutes', now() - interval '2 minutes', 3600, '[]'::jsonb);
      insert into {S}.tb_treino_series (user_id, exercicio_id, data_treino, numero_serie, peso, reps, concluida, slot_idx)
        values ('{rafael_t}', '{SUPINO}', '{d(0)}', 1, 46, 8, true, 0)
        on conflict (user_id, exercicio_id, data_treino, slot_idx, numero_serie) do update set peso = 46, concluida = true, updated_at = now();
    """)

    # ── Larissa Prado: a aluna da Camila com login e a dieta parada há 4 dias ──
    email_l, senha_l = B.CONTAS["w25-dieta"]
    larissa_u = B.B5.garantir_usuario(email_l, senha_l, "Larissa Prado")
    r = q(f"select id::text from {S}.pacientes where conta_id = '{conta}' and lower(email) = '{email_l}' and deleted_at is null limit 1")
    if r:
        larissa_id = r[0]["id"]
        q(f"update {S}.pacientes set nome = 'Larissa Prado', nutricionista_id = '{camila}', personal_id = null, user_id = '{larissa_u}', ativo = true, acesso_bloqueado_em = null where id = '{larissa_id}'")
    else:
        larissa_id = q(f"""insert into {S}.pacientes (nutricionista_id, personal_id, conta_id, nome, email, user_id, origem, ativo, created_at)
                           values ('{camila}', null, '{conta}', 'Larissa Prado', '{email_l}', '{larissa_u}', 'novo', true, now() - interval '12 days')
                           returning id::text""")[0]["id"]
    plano = q(f"select id::text from {S}.planos_alimentares where paciente_id = '{larissa_id}' and titulo = {lit(TITULO_PLANO)} and deleted_at is null limit 1")
    if plano:
        plano_id = plano[0]["id"]
    else:
        plano_id = q(f"""insert into {S}.planos_alimentares (nutricionista_id, paciente_id, titulo, metodo, kcal_alvo, favorito, created_at)
                         values ('{camila}', '{larissa_id}', {lit(TITULO_PLANO)}, 'alimentos', 1800, true, now() - interval '10 days') returning id::text""")[0]["id"]
        for ordem, (hora, nome, itens) in enumerate(B.B16.REFEICOES[:3]):
            rid = q(f"insert into {S}.refeicoes (plano_id, nome, horario, ordem, dias_semana) values ('{plano_id}', {lit(nome)}, '{hora}', {ordem}, '{{}}') returning id::text")[0]["id"]
            for i, (alim, g) in enumerate(itens):
                B.B16.ESTADO["schema"] = S
                a = B.B16.alimento(alim)
                q(f"insert into {S}.itens_refeicao (refeicao_id, alimento_id, quantidade_g, ordem) values ('{rid}', '{a['id']}', {g}, {i})")
    refs = q(f"select id::text from {S}.refeicoes where plano_id = '{plano_id}' order by ordem")
    q(f"delete from {S}.refeicoes_concluidas where paciente_id = '{larissa_id}'")
    for n in (4, 5, 6):
        for rf in refs[:2]:
            q(f"""insert into {S}.refeicoes_concluidas (nutricionista_id, paciente_id, refeicao_id, data)
                  values ('{camila}', '{larissa_id}', '{rf['id']}', '{d(n)}') on conflict (refeicao_id, data) do nothing""")

    # ── 1 cadastro pendente pelo link e 1 resposta de pré-consulta sem aluno ──
    if not q(f"select 1 from {S}.cadastros_pendentes where conta_id = '{conta}' and lower(email) = '{EMAIL_PENDENTE}' and status = 'pendente'"):
        q(f"""insert into {S}.cadastros_pendentes (nutricionista_id, conta_id, nome, email, status, observacoes)
              values ('{lucas_p}', '{conta}', {lit(NOME_PENDENTE)}, '{EMAIL_PENDENTE}', 'pendente', 'Cadastro de teste da W25')""")
    q(f"delete from {S}.respostas_preconsulta where conta_id = '{conta}' and titulo = {lit(TITULO_PRECONSULTA)}")
    q(f"""insert into {S}.respostas_preconsulta (nutricionista_id, conta_id, titulo, nome, email, respostas, respondido_em)
          values ('{lucas_p}', '{conta}', {lit(TITULO_PRECONSULTA)}, {lit(NOME_PRECONSULTA)}, 'w25.preconsulta.teste.claude@physiqnutri.app',
                  '{{"objetivo": "Hipertrofia"}}'::jsonb, now() - interval '2 hours')""")

    # ── Marina: 1 antropometria pelo protocolo de Faulkner (o PDF "Dados & Evolução" tem que dizer "Faulkner - 4 dobras") ──
    marina_id = q(f"select id::text from {S}.pacientes where conta_id = '{conta}' and nome = 'Marina Alves' and deleted_at is null")[0]["id"]
    q(f"delete from {S}.antropometrias where paciente_id = '{marina_id}' and observacao = {lit(OBS_FAULKNER)}")
    q(f"""insert into {S}.antropometrias (nutricionista_id, paciente_id, data, peso, altura, sexo, idade, dobras, protocolo, resultados, observacao)
          values ('{camila}', '{marina_id}', now() - interval '5 days', 64, 165, 'feminino', 31,
                  '{{"triceps": 18, "subescapular": 14, "suprailiaca": 16, "abdominal": 20}}'::jsonb, 'faulkner',
                  '{{"percentual_gordura": 22.4, "massa_gorda": 14.34, "massa_magra": 49.66}}'::jsonb, {lit(OBS_FAULKNER)})""")

    # ── Marina faz aniversário no sábado desta semana ──
    sabado = h + dt.timedelta(days=(5 - h.weekday()) % 7)
    marina = q(f"select id::text, nascimento::text as n from {S}.pacientes where conta_id = '{conta}' and nome = 'Marina Alves' and deleted_at is null")[0]
    antes.setdefault("marina_nascimento_antes", marina["n"])
    q(f"update {S}.pacientes set nascimento = '{sabado.replace(year=1995).isoformat()}' where id = '{marina['id']}'")

    m = {**antes, "conta": conta, "carlos_paciente": carlos["id"], "carlos_treino": carlos_t, "rafael_treino": rafael_t, "larissa": larissa_id,
         "larissa_user": larissa_u, "plano_larissa": plano_id, "marina": marina["id"], "lucas_treino": lucas_t, "personal_carlos_treino": prof_t, "hoje": h.isoformat()}
    B.json_arquivo(ARQ, m)
    return m


def limpar() -> None:
    m = json.loads(ARQ.read_text()) if ARQ.exists() else {}
    conta = B.conta_w13()
    B.saude_ok("limpar massa W25")
    if m.get("carlos_treino"):
        t = m["carlos_treino"]
        B.B5.exec_treino(f"""
          delete from {S}.tb_treino_series where user_id = '{t}'; delete from {S}.tb_treino_concluido where user_id = '{t}';
          delete from {S}.tb_semana_treinos where user_id = '{t}'; delete from {S}.tb_grupos_treino_perfis where user_id = '{t}';""")
        q(f"update {S}.pacientes set treino_user_id = {lit(m.get('carlos_tid_antes'))} where id = '{m['carlos_paciente']}'")
        sp = B.service(B.TREINO_REF)
        B.http("DELETE", f"{B.B5.TREINO_URL}/auth/v1/admin/users/{t}", None, {"apikey": sp, "Authorization": f"Bearer {sp}"})
    if m.get("grupo_w25"):
        # hml-24: o treino próprio da W25 sai junto (os exercícios e o "recebe" dele vão pela FK)
        B.B5.exec_treino(f"delete from {S}.tb_semana_treinos where grupo_id = '{m['grupo_w25']}'; "
                         f"delete from {S}.tb_grupos_treino where id = '{m['grupo_w25']}'")
    if m.get("rafael_treino"):
        t = m["rafael_treino"]
        B.B5.exec_treino(f"""
          update {S}.physiq_profiles set proxima_avaliacao = {lit(m.get('rafael_proxima_antes'))} where id = '{t}';
          delete from {S}.treino_historico where user_id = '{t}' and nome_treino = {lit(HISTORICO_W25)} and concluido_em::date >= '{m['hoje']}';
          delete from {S}.tb_treino_series where user_id = '{t}' and exercicio_id = '{SUPINO}' and data_treino = '{m['hoje']}' and peso = 46;
          delete from {S}.tb_treino_concluido where user_id = '{t}' and data_treino = '{m['hoje']}';""")
    if m.get("larissa"):
        q(f"delete from {S}.refeicoes_concluidas where paciente_id = '{m['larissa']}'")
        q(f"delete from {S}.planos_alimentares where paciente_id = '{m['larissa']}'")
        q(f"delete from {S}.pacientes where id = '{m['larissa']}'")
    q(f"delete from {S}.cadastros_pendentes where conta_id = '{conta}' and lower(email) = '{EMAIL_PENDENTE}'")
    q(f"delete from {S}.respostas_preconsulta where conta_id = '{conta}' and titulo = {lit(TITULO_PRECONSULTA)}")
    if m.get("marina"):
        q(f"update {S}.pacientes set nascimento = {lit(m.get('marina_nascimento_antes'))} where id = '{m['marina']}'")
        q(f"delete from {S}.antropometrias where paciente_id = '{m['marina']}' and observacao = {lit(OBS_FAULKNER)}")
    ARQ.unlink(missing_ok=True)
    print("limpo: a massa da W25 saiu do staging (os logins de teste do principal ficam sem matrícula)")


def seco() -> int:
    def sem_rede(*_a, **_k):
        raise RuntimeError("--seco não usa a rede")

    socket.socket.connect = sem_rede  # type: ignore[method-assign]
    g, c = "00000000-0000-4000-8000-0000000000c1", "00000000-0000-4000-8000-0000000000c2"
    sql = sql_treino_do_carlos(g, c, "2026-10-05", "2026-09-25")
    linhas = [x.strip() for x in sql.strip().split(";") if x.strip()]
    so_staging = all(x.split()[0] in ("delete", "insert") and f" {S}." in x for x in linhas)
    so_carlos = all(f"'{c}'" in x or (x.startswith(f"delete from {S}.tb_grupos_exercicios") and f"'{g}'" in x)
                    or (x.startswith(f"insert into {S}.tb_grupos_exercicios") and f"'{g}'" in x) for x in linhas)
    sem_o_a = GRUPO_A not in sql.replace(f"delete from {S}.tb_grupos_treino_perfis where grupo_id = '{GRUPO_A}' and user_id = '{c}'", "")
    ok = so_staging and so_carlos and sem_o_a and TREINO_W25.endswith(" W25") and sql.count(f"'{g}'") >= 5
    print(("✅ " if ok else "❌ ") + f"seco: o treino do Carlos no grupo próprio da W25 ({len(linhas)} comandos, só no staging, só do Carlos e do grupo "
          "dele; o treino A da W15 só aparece para tirar a ligação velha)")
    # revisão hml-24 (🟡2): no --limpar, a volta da matrícula e a exclusão do login de teste do Treino ficam no bloco do carlos_treino; o
    # bloco do grupo_w25 só apaga o grupo (conferido pela árvore do Python, não pelo texto)
    arvore = ast.parse(Path(__file__).read_text(encoding="utf-8"))
    func = next(n for n in arvore.body if isinstance(n, ast.FunctionDef) and n.name == "limpar")
    blocos = {ast.unparse(n.test): ast.unparse(n) for n in func.body if isinstance(n, ast.If)}
    carlos, grupo = blocos.get("m.get('carlos_treino')", ""), blocos.get("m.get('grupo_w25')", "")
    login = "/auth/v1/admin/users/" in carlos and "'DELETE'" in carlos and "set treino_user_id" in carlos
    so_grupo = bool(grupo) and "/auth/v1/admin/users/" not in grupo and "treino_user_id" not in grupo and "tb_grupos_treino where id" in grupo
    ok2 = login and so_grupo
    print(("✅ " if ok2 else "❌ ") + "seco: o --limpar volta a matrícula e apaga o login de teste no bloco do carlos_treino; o do grupo_w25 só apaga o grupo")
    return 0 if ok and ok2 else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limpar", action="store_true")
    ap.add_argument("--seco", action="store_true")
    a = ap.parse_args()
    if a.seco:
        raise SystemExit(seco())
    if a.limpar:
        limpar()
    else:
        print(json.dumps(montar(), ensure_ascii=False, indent=1))
