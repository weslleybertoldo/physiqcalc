#!/usr/bin/env python3
"""Physiq W1 (conta única) — MASSA do ensaio no STAGING: o MESMO caso das 2 contas do profissional de produção, só com contas de TESTE.

  w1u-prof   dono + personal da "Calc Único W1" (legado_calc, Só Treino, isenta 'master', faixa livre, regras de hoje, Mercado Pago) e
             dono + nutricionista da "Nutri Único W1" (legado_nutri, Só Nutrição, isenta 'master', faixa livre, regras de hoje, Pix
             30 dias, R$ 80 travado, bloqueia o app de quem não paga) — códigos PROF-W1U-CALC / PROF-W1U-NUTRI
  w1u-aluno  aluna com login nas 2 contas (P7): na Calc (personal = prof, com treino no Banco do Treino: histórico e concluídos) e na
             Nutri (nutricionista = prof, CPF, ajustes do Nutri, 2 planos alimentares, 1 refeição marcada hoje, 1 foto no diário
             com o arquivo no Storage e 1 consulta de nutrição — no calendário da conta Calc, como em produção)
  na Nutri   1 paciente inativo antigo, sem login, com o MESMO CPF da matrícula da aluna (o duplicado de antes da trava da W16b,
             gravado com os gatilhos desligados), com 1 consulta na lixeira e 1 resposta de pré-consulta (+ o formulário na conta)
Nada de aviso: a consulta é de ontem (o aviso da agenda só sai para consulta futura) e ninguém tem WhatsApp conectado.
Uso: python3 e2e/conta_unica/massa.py [--limpar]   (ids em ~/projetos/physiqcalc-scratch/conta-unica-agenda/w1/massa_ids.json)
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
q = B.sql_principal
TZ = dt.timezone(dt.timedelta(hours=-3))
CPF_TESTE = "52998224725"  # CPF válido de exemplo (gerador), só no staging


def conta(nome: str) -> str | None:
    r = q(f"select id::text from {S}.contas where nome = {B.q(nome)} order by criado_em limit 1")
    return r[0]["id"] if r else None


def jpeg() -> bytes | None:
    try:
        import pymupdf  # noqa: PLC0415 — só para a foto do diário (16×16)
    except ImportError:
        return None
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 16, 16), False)
    pix.clear_with(180)
    return pix.tobytes("jpg")


def montar() -> dict:
    B.saude_ok("a massa da W1")
    for k in (B.PROF, B.ALUNO):
        print(f"principal  {B.EMAIL[k]:44s} {B.B5.garantir_usuario(B.EMAIL[k], B.CONTAS[k][1], B.NOMES[k])}")
    prof, aluno = B.uid(B.PROF), B.uid(B.ALUNO)
    q(f"update {S}.profiles set nome = {B.q(B.NOMES[B.PROF])}, tipo_perfil = 'personal', isento_assinatura = true where id = '{prof}'")
    q(f"update {S}.profiles set nome = {B.q(B.NOMES[B.ALUNO])} where id = '{aluno}'")

    # as 2 contas legadas (o desenho das de produção depois da W28: núcleo cobrando, regras de hoje, isentas)
    for nome, origem, plano, regra, receb, travado, bloq in ((B.CONTA_CALC, "legado_calc", "treino", "mes", "mercadopago", "null", "false"),
                                                            (B.CONTA_NUTRI, "legado_nutri", "nutricao", "30dias", "pix_manual", "80", "true")):
        if not conta(nome):
            q(f"""insert into {S}.contas (nome, dono_id, origem, plano, faixa, periodicidade, situacao, isenta_motivo, cobranca_legada,
                                          regras_legadas, regra_pix, recebimento_modo, valor_travado, bloquear_app_inadimplente)
                  values ({B.q(nome)}, '{prof}', '{origem}', '{plano}', 'livre', 'mensal', 'isenta', 'master', false, true, '{regra}',
                          '{receb}', {travado}, {bloq})""")
    calc, nutri = conta(B.CONTA_CALC), conta(B.CONTA_NUTRI)
    for c, papeis, cod in ((calc, "array['personal','dono']", B.COD_CALC), (nutri, "array['nutricionista','dono']", B.COD_NUTRI)):
        if not q(f"select 1 from {S}.conta_membros where conta_id = '{c}' and user_id = '{prof}'"):
            q(f"insert into {S}.conta_membros (conta_id, user_id, papeis, status, codigo_convite) values ('{c}', '{prof}', {papeis}, 'ativo', '{cod}')")

    # a aluna nas 2 contas (P7): primeiro a matrícula da Nutri (como em produção: o site antigo), depois a da Calc
    r = q(f"select {S}.matricular_na_conta('{aluno}', '{nutri}', null, '{prof}', 'nutri', true) as r")[0]["r"]
    assert r.get("ok"), r
    mat_sai = r["paciente_id"]
    q(f"""update {S}.pacientes set cpf = '{CPF_TESTE}', apelido = 'Lice', telefone = '(82) 99999-0001',
             config = '{{"acesso_app": true, "acesso_link": true, "diario_alimentar": true, "mensagens_automaticas": false}}'::jsonb
           where id = '{mat_sai}'""")
    r = q(f"select {S}.matricular_na_conta('{aluno}', '{calc}', '{prof}', null, 'calc', true) as r")[0]["r"]
    assert r.get("ok"), r
    mat_fica = r["paciente_id"]
    q(f"update {S}.pacientes set objetivo = 'Ganhar massa', telefone = '(82) 99999-0002', genero = 'feminino', nascimento = '1996-04-12' where id = '{mat_fica}'")

    # o paciente inativo antigo da Nutri, sem login, com o MESMO CPF (o duplicado que já existia antes da trava da W16b): a trava fica
    # desligada SÓ dentro desta transação (o DDL é transacional: nenhuma outra sessão vê o gatilho desligado) e só no staging
    antigo = q(f"select id::text from {S}.pacientes where conta_id = '{nutri}' and nome = 'Paciente Antigo W1' limit 1")
    if antigo:
        antigo = antigo[0]["id"]
    else:
        antigo = str(uuid.uuid4())
        assert S == "staging"
        q(f"""begin;
              alter table staging.pacientes disable trigger trg_pacientes_unicos_email_cpf;
              insert into staging.pacientes (id, nutricionista_id, conta_id, nome, email, cpf, ativo, origem, created_at, updated_at)
              values ('{antigo}', '{prof}', '{nutri}', 'Paciente Antigo W1', 'w1u.antigo@exemplo.test', '{CPF_TESTE}', false, 'nutri',
                      now() - interval '13 days', now() - interval '13 days');
              alter table staging.pacientes enable trigger trg_pacientes_unicos_email_cpf;
              commit;""")

    # nutrição na matrícula da Nutri: 2 planos (o 2º mais recente), 1 refeição marcada hoje, 1 foto no diário (com o arquivo)
    alim = q(f"select id::text from {S}.alimentos where fonte = 'taco' order by nome limit 1")[0]["id"]
    refeicao_marcada = None
    for titulo, dias in (("Plano alimentar 20/09/2026 W1U", 12), ("Plano alimentar 30/09/2026 W1U", 2)):
        pl = q(f"select id::text from {S}.planos_alimentares where paciente_id = '{mat_sai}' and titulo = {B.q(titulo)}")
        if pl:
            pl = pl[0]["id"]
        else:
            pl = q(f"""insert into {S}.planos_alimentares (nutricionista_id, paciente_id, titulo, metodo, kcal_alvo, created_at, updated_at)
                       values ('{prof}', '{mat_sai}', {B.q(titulo)}, 'alimentos', 2000, now() - interval '{dias} days', now() - interval '{dias} days')
                       returning id::text""")[0]["id"]
            rf = q(f"insert into {S}.refeicoes (plano_id, nome, horario, ordem) values ('{pl}', 'Café da manhã', '07:00', 0) returning id::text")[0]["id"]
            q(f"insert into {S}.itens_refeicao (refeicao_id, alimento_id, quantidade_g, ordem) values ('{rf}', '{alim}', 100, 0)")
        refeicao_marcada = q(f"select id::text from {S}.refeicoes where plano_id = '{pl}' order by ordem limit 1")[0]["id"]
    hoje = dt.datetime.now(TZ).date().isoformat()
    if not q(f"select 1 from {S}.refeicoes_concluidas where paciente_id = '{mat_sai}' and refeicao_id = '{refeicao_marcada}'"):
        q(f"""insert into {S}.refeicoes_concluidas (nutricionista_id, paciente_id, refeicao_id, data)
              values ('{prof}', '{mat_sai}', '{refeicao_marcada}', '{hoje}')""")
    diario = q(f"select id::text, path from {S}.diario_alimentar where paciente_id = '{mat_sai}' limit 1")
    if diario:
        caminho = diario[0]["path"]
    else:
        caminho = f"{prof}/{mat_sai}/{uuid.uuid4()}.jpg"
        foto = jpeg()
        if foto:
            sp = B.service(B.PRINCIPAL_REF)
            st, r, _ = B.http("POST", f"{B.PRINCIPAL_URL}/storage/v1/object/{B.bucket_do_ambiente('diario')}/{caminho}", foto,
                              {"apikey": sp, "Authorization": f"Bearer {sp}", "Content-Type": "image/jpeg", "x-upsert": "true"})
            assert st in (200, 201), (st, r)
        q(f"""insert into {S}.diario_alimentar (nutricionista_id, paciente_id, data_hora, refeicao, path, mime, tamanho, comentario)
              values ('{prof}', '{mat_sai}', now() - interval '3 hours', 'almoco', {B.q(caminho)}, 'image/jpeg', {len(foto or b'')},
                      'Almoço W1U')""")

    # agenda: o calendário da conta Calc (como o "Calendário principal" de produção) com a consulta de nutrição da matrícula da Nutri
    cal = q(f"select id::text from {S}.calendarios where nutricionista_id = '{prof}' and conta_id = '{calc}' and deleted_at is null limit 1")
    if cal:
        cal = cal[0]["id"]
    else:
        cal = q(f"""insert into {S}.calendarios (nutricionista_id, nome, cor, padrao, faixa_inicio, faixa_fim, conta_id)
                    values ('{prof}', 'Calendário principal', '#a78bfa', true, '07:00', '20:00', '{calc}') returning id::text""")[0]["id"]
    ontem = dt.datetime.now(TZ).replace(hour=17, minute=30, second=0, microsecond=0) - dt.timedelta(days=1)
    if not q(f"select 1 from {S}.agendamentos where paciente_id = '{mat_sai}'"):
        q(f"""insert into {S}.agendamentos (nutricionista_id, calendario_id, paciente_id, titulo, inicio, fim, status, modulo, conta_id)
              values ('{prof}', '{cal}', '{mat_sai}', 'Consulta de nutrição', '{ontem.isoformat()}', '{(ontem + dt.timedelta(minutes=30)).isoformat()}',
                      'paciente_confirmou', 'nutricao', '{calc}')""")
    if not q(f"select 1 from {S}.agendamentos where paciente_id = '{antigo}'"):
        velho = dt.datetime.now(TZ).replace(hour=9, minute=0, second=0, microsecond=0) - dt.timedelta(days=12)
        q(f"""insert into {S}.agendamentos (nutricionista_id, calendario_id, paciente_id, titulo, inicio, fim, status, modulo, conta_id, deleted_at)
              values ('{prof}', '{cal}', '{antigo}', 'Paciente Antigo W1', '{velho.isoformat()}', '{(velho + dt.timedelta(hours=1)).isoformat()}',
                      'agendado', 'nutricao', '{nutri}', now() - interval '12 days')""")
    # pré-consulta: o formulário na conta Nutri e a resposta do paciente antigo
    form = q(f"select id::text from {S}.formularios_preconsulta where conta_id = '{nutri}' limit 1")
    if form:
        form = form[0]["id"]
    else:
        form = q(f"""insert into {S}.formularios_preconsulta (nutricionista_id, titulo, perguntas, slug, conta_id)
                     values ('{prof}', 'Anamnese geral (padrão) W1U', '[{{"id": "p1", "tipo": "texto", "texto": "Queixa principal"}}]'::jsonb,
                             'anamnese-w1u-{str(uuid.uuid4())[:6]}', '{nutri}') returning id::text""")[0]["id"]
    if not q(f"select 1 from {S}.respostas_preconsulta where formulario_id = '{form}'"):
        q(f"""insert into {S}.respostas_preconsulta (nutricionista_id, formulario_id, nome, paciente_id, respostas, conta_id)
              values ('{prof}', '{form}', 'Paciente Antigo W1', '{antigo}', '{{"p1": "Dor nas costas"}}'::jsonb, '{nutri}')""")

    # Banco do Treino: os 2 entram (a troca de token cria o usuário, o vínculo e — pelo espelho — a linha de professor)
    for k in (B.PROF, B.ALUNO):
        B.saude_ok(f"a troca de token de {k}")
        st, r = B.B5.trocar_token(k)
        assert st == 200, (k, st, r)
    B.processar_espelho()
    prof_t, aluno_t = B.B5.treino_id(B.PROF), B.B5.treino_id(B.ALUNO)
    assert prof_t and aluno_t, "sem usuário no Treino"
    B.saude_ok("o treino da aluna")
    B.exec_treino(f"""
      insert into {S}.treino_historico (user_id, nome_treino, iniciado_em, concluido_em, duracao_segundos)
      select '{aluno_t}', 'Treino A W1U', now() - interval '2 days 1 hour', now() - interval '2 days', 3600
       where not exists (select 1 from {S}.treino_historico where user_id = '{aluno_t}');
      insert into {S}.tb_treino_concluido (user_id, data_treino) select '{aluno_t}', current_date - 2
       where not exists (select 1 from {S}.tb_treino_concluido where user_id = '{aluno_t}');""")
    out = {"prof": prof, "aluno": aluno, "calc": calc, "nutri": nutri, "mat_fica": mat_fica, "mat_sai": mat_sai, "antigo": antigo,
           "calendario": cal, "formulario": form, "foto": caminho, "prof_treino": prof_t, "aluno_treino": aluno_t}
    B.SCRATCH.mkdir(parents=True, exist_ok=True)
    B.IDS.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print("massa pronta:", json.dumps(out, indent=1))
    return out


def limpar() -> None:
    """Desfaz a massa (contas de TESTE da W1 nos 2 bancos + o arquivo da foto)."""
    us = [u for u in (B.uid(B.PROF), B.uid(B.ALUNO)) if u]
    contas = [c for c in (conta(B.CONTA_CALC), conta(B.CONTA_NUTRI)) if c]
    lista = ",".join(f"'{u}'" for u in us) or "null"
    clista = ",".join(f"'{c}'" for c in contas) or "null"
    if us or contas:
        fotos = q(f"select path from {S}.diario_alimentar where nutricionista_id in ({lista})")
        sp = B.service(B.PRINCIPAL_REF)
        for f in fotos:
            B.http("DELETE", f"{B.PRINCIPAL_URL}/storage/v1/object/{B.bucket_do_ambiente('diario')}/{f['path']}", None, {"apikey": sp, "Authorization": f"Bearer {sp}"})
        q(f"""delete from {S}.respostas_preconsulta where nutricionista_id in ({lista});
              delete from {S}.formularios_preconsulta where nutricionista_id in ({lista});
              delete from {S}.agendamentos where nutricionista_id in ({lista});
              delete from {S}.calendarios where nutricionista_id in ({lista});
              delete from {S}.refeicoes_concluidas where nutricionista_id in ({lista});
              delete from {S}.diario_alimentar where nutricionista_id in ({lista});
              delete from {S}.planos_alimentares where nutricionista_id in ({lista});
              delete from {S}.pacientes where user_id in ({lista}) or conta_id in ({clista}) or nutricionista_id in ({lista}) or personal_id in ({lista});
              delete from {S}.avisos where destino_user_id in ({lista});
              delete from {S}.contas where id in ({clista});""")
    tids = []
    for u in us:
        tids += [x["tid"] for x in B.sql_treino(f"select treino_user_id::text as tid from {S}.physiq_identidades where principal_user_id = '{u}'")]
    tl = ",".join(f"'{t}'" for t in tids) or "null"
    if tids:
        B.exec_treino(f"""delete from {S}.treino_historico where user_id in ({tl});
            delete from {S}.tb_treino_concluido where user_id in ({tl});
            update {S}.physiq_profiles set professor_id = null where professor_id in ({tl});
            delete from {S}.physiq_espelho_membros where treino_user_id in ({tl});
            delete from {S}.physiq_professores where id in ({tl});
            delete from {S}.physiq_profiles where id in ({tl});
            delete from {S}.physiq_identidades where treino_user_id in ({tl});
            delete from {S}.edge_rate_limits where user_id in ({tl});""")
        sk = B.service(B.TREINO_REF)
        for t in tids:
            B.http("DELETE", f"https://{B.TREINO_REF}.supabase.co/auth/v1/admin/users/{t}", None, {"apikey": sk, "Authorization": f"Bearer {sk}"})
    sp = B.service(B.PRINCIPAL_REF)
    for k in (B.PROF, B.ALUNO):
        u = B.uid(k)
        if u:
            assert B.EMAIL[k].endswith(".teste.claude@physiqnutri.app")
            B.http("DELETE", f"{B.PRINCIPAL_URL}/auth/v1/admin/users/{u}", None, {"apikey": sp, "Authorization": f"Bearer {sp}"})
    print("limpo:", {"logins": len(us), "contas": len(contas), "treino": len(tids)})


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    if a.limpar:
        limpar()
    else:
        montar()
    return 0


if __name__ == "__main__":
    sys.exit(main())
