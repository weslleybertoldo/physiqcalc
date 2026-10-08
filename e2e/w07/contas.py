#!/usr/bin/env python3
"""Physiq W7 — contas e massa de TESTE no schema staging (idempotente; SÓ *.teste.claude@physiqnutri.app — P26).

  (sem opção)       garante os usuários, a "Consultoria Ferreira W7" (Lucas = dono + personal; Camila = nutricionista), as
                    matrículas, as fotos (as mesmas das telas aprovadas), a agenda, a mensalidade do aluno da tela 5 e a massa
                    da conta descartável excluir1 nos 2 bancos (treino, séries, academia, avaliação, diário, ✓ de refeição e
                    de meta, cobrança, agendamento)
  --so-descartaveis recria só as descartáveis (excluir1/2/3) — para repetir o E2E depois de uma exclusão

Uso: python3 e2e/w07/contas.py [--so-descartaveis]
"""
from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
WHATS = {"w7-personal": "+5582999990071", "w7-nutri": "+5582999990072"}
FOTO = {"w7-personal": "pro.jpg", "w7-nutri": "av4.jpg", "w7-aluno": "av1.jpg", "excluir1": "av5.jpg"}


def q(sql: str) -> list:
    return B.sql_principal(sql)


def subir_foto(conta: str) -> str | None:
    arq = FOTO.get(conta)
    if not arq or not (B.FOTOS / arq).exists():
        return None
    u = B.uid(conta)
    caminho = f"{u}/foto-w7.jpg"
    sp = B.service(B.PRINCIPAL_REF)
    req = urllib.request.Request(f"{B.PRINCIPAL_URL}/storage/v1/object/fotos-perfil-staging/{caminho}", data=(B.FOTOS / arq).read_bytes(), method="POST",
                                 headers={"Authorization": f"Bearer {sp}", "apikey": sp, "Content-Type": "image/jpeg", "x-upsert": "true",
                                          "User-Agent": "physiq-e2e-w07"})
    with urllib.request.urlopen(req, timeout=60) as r:
        assert r.status in (200, 201), r.status
    return f"{B.API_P}/storage/v1/object/public/fotos-perfil-staging/{caminho}"


def perfil(conta: str, nome: str, tipo: str | None = None, whats: str | None = None, foto: str | None = None) -> None:
    u = B.uid(conta)
    extra = "jsonb_strip_nulls(jsonb_build_object("
    extra += f"'whatsapp_e164', {('$w$' + whats + '$w$') if whats else 'null'}, 'foto_url', {('$f$' + foto + '$f$') if foto else 'null'}))"
    q(f"""update {S}.profiles set nome = $n${nome}$n$, tipo_perfil = {('$t$' + tipo + '$t$') if tipo else 'tipo_perfil'},
            dados_profissionais = coalesce(dados_profissionais, '{{}}'::jsonb) || {extra} where id = '{u}'""")


def conta_w7() -> str | None:
    u = B.uid("w7-personal")
    r = q(f"select id::text from {S}.contas where dono_id = '{u}' and origem = 'nova' order by criado_em limit 1")
    return r[0]["id"] if r else None


def calendario(conta: str) -> str:
    u = B.uid(conta)
    r = q(f"select id::text from {S}.calendarios where nutricionista_id = '{u}' and deleted_at is null order by created_at limit 1")
    if r:
        return r[0]["id"]
    return q(f"""insert into {S}.calendarios (nutricionista_id, nome, cor, padrao, conta_id)
                 values ('{u}', 'Consultório', '#8B5CF6', true, '{conta_w7()}') returning id::text""")[0]["id"]


def matricular(aluno: str, personal: bool, nutri: bool) -> str:
    u = B.uid(aluno)
    c = conta_w7()
    pers = f"'{B.uid('w7-personal')}'" if personal else "null"
    nut = f"'{B.uid('w7-nutri')}'" if nutri else "null"
    r = q(f"select {S}.matricular_na_conta('{u}', '{c}', {pers}, {nut}, 'novo', true) as r")[0]["r"]
    assert r.get("ok"), (aluno, r)
    pid = q(f"select id::text from {S}.pacientes where user_id = '{u}' and conta_id = '{c}' and deleted_at is null")[0]["id"]
    q(f"update {S}.pacientes set nome = $n${B.NOMES[aluno]}$n$, email = '{B.EMAIL[aluno]}', ativo = true where id = '{pid}'")
    return pid


def agendar(aluno_pid: str, prof: str, titulo: str, inicio: str, status: str = "agendado", modulo: str = "nutricao") -> None:
    u = B.uid(prof)
    if q(f"select 1 from {S}.agendamentos where paciente_id = '{aluno_pid}' and inicio = '{inicio}'::timestamptz and deleted_at is null"):
        return
    q(f"""insert into {S}.agendamentos (nutricionista_id, calendario_id, paciente_id, titulo, inicio, fim, status, modulo, conta_id)
          values ('{u}', '{calendario(prof)}', '{aluno_pid}', $t${titulo}$t$, '{inicio}'::timestamptz, '{inicio}'::timestamptz + interval '1 hour',
                  '{status}', '{modulo}', '{conta_w7()}')""")


def garantir_usuarios(quais) -> None:
    for k in quais:
        email, s = B.CONTAS[k]
        print(f"principal  {email:46s} {B.garantir_usuario(email, s, B.NOMES[k])}")
    if "excluir2" not in quais:
        return
    # "aluno sem professor" que veio do Calc (C8): tem o treino guardado, sem matrícula — não cai nas Boas-vindas
    sp = B.service(B.PRINCIPAL_REF)
    u2 = B.uid("excluir2")
    st, r, _ = B.http("PUT", f"{B.PRINCIPAL_URL}/auth/v1/admin/users/{u2}", {"app_metadata": {"calc": True}}, {"apikey": sp, "Authorization": f"Bearer {sp}"})
    assert st == 200, (st, r)


def base() -> None:
    garantir_usuarios([k for k in B.NOMES if k not in B.DESCARTAVEIS])
    if not conta_w7():
        st, r = B.rpc("w7-personal", "criar_minha_conta", {"p_nome": B.NOME_CONTA, "p_tipo": "personal", "p_registro": "CREF 000777-G/PE"})
        assert st == 200 and isinstance(r, dict) and r.get("ok"), (st, r)
    c = conta_w7()
    un = B.uid("w7-nutri")
    if not q(f"select 1 from {S}.conta_membros where conta_id = '{c}' and user_id = '{un}'"):
        q(f"""insert into {S}.conta_membros (conta_id, user_id, papeis, status, codigo_convite)
              values ('{c}', '{un}', array['nutricionista'], 'ativo', {S}.gerar_codigo_membro('Camila Rocha W7'))""")
    q(f"update {S}.conta_membros set status = 'ativo', removido_em = null where conta_id = '{c}' and user_id = '{un}'")
    for prof, tipo in (("w7-personal", "personal"), ("w7-nutri", "nutricionista")):
        perfil(prof, B.NOMES[prof], tipo, WHATS[prof], subir_foto(prof))
    pa = matricular("w7-aluno", True, True)
    perfil("w7-aluno", B.NOMES["w7-aluno"], None, None, subir_foto("w7-aluno"))
    q(f"""update {S}.pacientes set objetivo = 'definição', created_at = '2026-03-10T12:00:00Z', mensalidade_valor = 249,
            cobranca_pausada = false, mensalidade_desde = '2026-03-10T12:00:00Z', mensalidade_pago_ate = now() + interval '3 days 2 hours'
          where id = '{pa}'""")
    agendar(pa, "w7-nutri", "Retorno da nutrição", "2026-10-03T13:00:00Z", "confirmado", "nutricao")
    agendar(pa, "w7-personal", "Avaliação física", "2026-08-22T12:00:00Z", "paciente_confirmou", "treino")
    matricular("w7-treino", True, False)
    # profissional que também é aluno (como o Weslley): dona da própria conta e aluna do Lucas — o Excluir do Perfil recusa
    us = B.uid("w7-staff")
    if not q(f"select 1 from {S}.contas where dono_id = '{us}'"):
        st, r = B.rpc("w7-staff", "criar_minha_conta", {"p_nome": "Conta Staff W7", "p_tipo": "nutricionista", "p_registro": "CRN 0007/PE"})
        assert st == 200 and isinstance(r, dict) and r.get("ok"), (st, r)
    matricular("w7-staff", True, False)
    pp = matricular("w7-paciente", False, True)
    agendar(pp, "w7-nutri", "Consulta de retorno", "2026-10-06T14:30:00Z", "agendado")
    agendar(pp, "w7-nutri", "Primeira consulta", "2026-08-05T14:00:00Z", "confirmado")
    agendar(pp, "w7-nutri", "Retorno (desmarcado)", "2026-09-10T14:00:00Z", "desmarcado")
    print("conta W7:", c, "· códigos:", q(f"select codigo_convite, papeis from {S}.conta_membros where conta_id = '{c}' and status = 'ativo'"))


def descartaveis() -> None:
    garantir_usuarios(B.DESCARTAVEIS)
    # excluir1: aluno com Treino + Nutrição e dados nos 2 bancos (o que apaga e o que fica)
    p1 = matricular("excluir1", True, True)
    perfil("excluir1", B.NOMES["excluir1"], None, None, subir_foto("excluir1"))
    u1 = B.uid("excluir1")
    nut = B.uid("w7-nutri")
    c = conta_w7()
    agendar(p1, "w7-nutri", "Consulta (descartável)", "2026-10-08T15:00:00Z")
    if not q(f"select 1 from {S}.metas where paciente_id = '{p1}'"):
        meta = q(f"""insert into {S}.metas (nutricionista_id, paciente_id, titulo, dias_semana) values ('{nut}', '{p1}', 'Beber 2 L de água', array[1,2,3,4,5])
                     returning id::text""")[0]["id"]
        q(f"insert into {S}.metas_concluidas (paciente_id, meta_id, data, conta_id) values ('{p1}', '{meta}', current_date, '{c}')")
        plano = q(f"insert into {S}.planos_alimentares (nutricionista_id, paciente_id, titulo) values ('{nut}', '{p1}', 'Plano W7') returning id::text")[0]["id"]
        ref = q(f"insert into {S}.refeicoes (plano_id, nome, horario, ordem) values ('{plano}', 'Almoço', '12:30', 1) returning id::text")[0]["id"]
        q(f"insert into {S}.refeicoes_concluidas (nutricionista_id, paciente_id, refeicao_id, data) values ('{nut}', '{p1}', '{ref}', current_date)")
        q(f"""insert into {S}.antropometrias (nutricionista_id, paciente_id, peso, altura) values ('{nut}', '{p1}', 78.4, 1.78)""")
        q(f"""insert into {S}.cobrancas (nutricionista_id, paciente_id, descricao, valor, vencimento, conta_id, tipo)
              values ('{nut}', '{p1}', 'Consulta avulsa (teste W7)', 50, current_date + 10, '{c}', 'avulsa')""")
        q(f"""insert into {S}.avisos (destino_user_id, tipo, titulo) values ('{u1}', 'plano_atualizado', 'Seu plano foi atualizado (teste W7)')""")
        # uma foto do diário de verdade no bucket (a exclusão tem que apagar o arquivo também)
        caminho = f"{p1}/w7-diario.jpg"
        sp = B.service(B.PRINCIPAL_REF)
        req = urllib.request.Request(f"{B.PRINCIPAL_URL}/storage/v1/object/{B.bucket_do_ambiente('diario')}/{caminho}", data=(B.FOTOS / "almoco.jpg").read_bytes(), method="POST",
                                     headers={"Authorization": f"Bearer {sp}", "apikey": sp, "Content-Type": "image/jpeg", "x-upsert": "true", "User-Agent": "physiq-e2e-w07"})
        with urllib.request.urlopen(req, timeout=60) as r:
            assert r.status in (200, 201), r.status
        q(f"""insert into {S}.diario_alimentar (nutricionista_id, paciente_id, refeicao, path, mime, tamanho, comentario)
              values ('{nut}', '{p1}', 'almoco', '{caminho}', 'image/jpeg', {(B.FOTOS / 'almoco.jpg').stat().st_size}, 'Almoço de hoje (teste W7)')""")
    print("excluir1 principal:", p1)


def treino_excluir1() -> None:
    """A massa do Banco do Treino da excluir1 (precisa da troca de token feita: o usuário de lá nasce nela)."""
    if not B.saude_treino():
        raise SystemExit("Banco do Treino lento/instável — parei (nada de restart)")
    st, r = B.trocar_token("excluir1")
    assert st == 200, (st, r)
    tid = B.treino_id("excluir1")
    assert tid, "sem vínculo no Treino"
    ex = B.sql_treino(f"select id::text from {S}.tb_exercicios where professor_id is null order by nome limit 1")[0]["id"]
    if not B.sql_treino(f"select 1 from {S}.tb_treino_series where user_id = '{tid}'"):
        B.exec_treino(f"""
          insert into {S}.tb_treino_series (user_id, exercicio_id, data_treino, numero_serie, peso, reps, concluida) values
            ('{tid}', '{ex}', current_date - 2, 1, 40, 10, true), ('{tid}', '{ex}', current_date - 2, 2, 42.5, 8, true);
          insert into {S}.tb_treino_concluido (user_id, data_treino, concluido, slot_idx) values ('{tid}', current_date - 2, true, 0);
          insert into {S}.treino_historico (user_id, nome_treino, iniciado_em, concluido_em, duracao_segundos, exercicios_concluidos)
            values ('{tid}', 'Treino A (teste W7)', now() - interval '2 days 1 hour', now() - interval '2 days', 3600, '[]'::jsonb);
          with a as (insert into {S}.tb_academias (user_id, nome) values ('{tid}', 'Academia do teste W7') returning id)
          insert into {S}.tb_academia_pesos (user_id, academia_id, exercicio_id, numero_serie, peso) select '{tid}', a.id, '{ex}', 1, 40 from a;
          with g as (insert into {S}.tb_grupos_treino_usuario (user_id, nome) values ('{tid}', 'Meu treino extra (teste W7)') returning id)
          insert into {S}.tb_grupos_exercicios_usuario (user_id, grupo_usuario_id, exercicio_id, ordem) select '{tid}', g.id, '{ex}', 0 from g;
          insert into {S}.tb_semana_treinos (user_id, dia_semana, grupo_usuario_id, slot_idx)
            select '{tid}', 'SAB', id, 0 from {S}.tb_grupos_treino_usuario where user_id = '{tid}' limit 1;
          insert into {S}.physiq_avaliacoes (user_id, data_avaliacao, peso, altura, percentual_gordura, created_by, metodo_avaliacao)
            values ('{tid}', current_date - 20, 78.4, 178, 16.5, 'professor', 'dobras_3');
          insert into {S}.physiq_registros_fotos (user_id, mes_ref, tipo, storage_path) values ('{tid}', date_trunc('month', current_date)::date, 'frente', '{tid}/teste-w7-frente.jpg');
        """)
    print("excluir1 treino:", tid)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--so-descartaveis", action="store_true")
    a = ap.parse_args()
    if not a.so_descartaveis:
        base()
    descartaveis()
    # o espelho leva a equipe e os alunos para o Treino (em vez de esperar os 10 min do pg_cron)
    res = B.processar_espelho()
    print("espelho:", len(res), "itens")
    treino_excluir1()
    return 0


if __name__ == "__main__":
    sys.exit(main())
