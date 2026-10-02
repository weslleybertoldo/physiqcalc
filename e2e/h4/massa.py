#!/usr/bin/env python3
"""Physiq H4 — massa de TESTE no STAGING (idempotente; SÓ contas *.teste.claude@physiqnutri.app — P26). Nada de cliente.

  (sem opção)  as 3 contas do H4 (ver e2e/h4/_base.py):
               · "Clínica H4" (h4-dono, Outra área = dono + personal + nutricionista, isenta, bloqueia o app de quem não paga):
                 "Laura Vencida H4" (mensalidade vencida há 3 dias → selo BLOQUEADO (pagamento); 15 lançamentos; 2 fotos do diário
                 pelo /d/ sem reação, de 2 e 3 dias atrás) e "Igor Em Dia H4" (paga até daqui a 15 dias → sem selo); 2 recibos
                 neste mês + 1 no mês anterior; o Otávio (h4-csv) é também ALUNO dela (o "Excluir minha conta" do profissional);
               · "Conta CSV H4" (h4-csv, personal, isenta, sem limite): 520 alunos SEM login (nenhum espelho para o Treino) com
                 gênero, apelido, nascimento, 3 CPFs e as datas de cadastro e de modificação espalhadas por 6 meses;
               · "Conta Suspensa H4" (h4-susp, ativa; h4-membro = personal): o master suspende pelo E2E (e reativa no fim).
  --limpar     apaga tudo o que a massa criou (alunos, lançamentos, recibos, fotos do diário, contas, membros, eventos e os 4 logins
               h4.*) — o storage do diário também.

Uso: python3 e2e/h4/massa.py [--limpar]
"""
from __future__ import annotations

import argparse
import datetime as dt
import random
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
TZ = ZoneInfo("America/Sao_Paulo")
q = B.sql_principal


def cpf_valido(semente: int) -> str:
    """CPF com os 2 dígitos verificadores certos (para o CSV); a semente fixa deixa a massa idempotente."""
    rnd = random.Random(semente)
    while True:
        base = [rnd.randint(0, 9) for _ in range(9)]
        if len(set(base)) > 1:
            break
    for n in (9, 10):
        soma = sum(d * (n + 1 - i) for i, d in enumerate(base))
        base.append((soma * 10) % 11 % 10)
    return "".join(map(str, base))


def garantir_conta(dono: str, nome: str, tipo: str) -> str:
    c = B.conta_id(nome)
    if not c:
        st, r = B.rpc(dono, "criar_minha_conta", {"p_nome": nome, "p_tipo": tipo, "p_registro": ""})
        assert st == 200 and isinstance(r, dict) and r.get("ok"), (st, r)
        c = B.conta_id(nome)
    assert c, f"a conta {nome} não nasceu"
    return c


def membro(conta: str, quem: str, papeis: list[str]) -> None:
    u = B.uid(quem)
    arr = "array[" + ",".join(f"'{x}'" for x in papeis) + "]::text[]"
    if not q(f"select 1 from {S}.conta_membros where conta_id = '{conta}' and user_id = '{u}'"):
        q(f"""insert into {S}.conta_membros (conta_id, user_id, papeis, status, codigo_convite)
              values ('{conta}', '{u}', {arr}, 'ativo', {S}.gerar_codigo_membro({B.q(B.NOMES[quem])}))""")
    q(f"update {S}.conta_membros set status = 'ativo', removido_em = null, papeis = {arr} where conta_id = '{conta}' and user_id = '{u}'")


def aluno(conta: str, nome: str, quem: str, extra: str = "") -> str:
    u = B.uid(quem)
    r = q(f"select id::text from {S}.pacientes where conta_id = '{conta}' and nome = {B.q(nome)} and deleted_at is null")
    if r:
        pid = r[0]["id"]
    else:
        pid = q(f"""insert into {S}.pacientes (nutricionista_id, personal_id, conta_id, nome, origem, ativo)
                    values ('{u}', '{u}', '{conta}', {B.q(nome)}, 'novo', true) returning id::text""")[0]["id"]
    if extra:
        q(f"update {S}.pacientes set {extra} where id = '{pid}'")
    return pid


def montar() -> dict:
    B.saude_ok("a massa do H4")
    for k in ("h4-dono", "h4-csv", "h4-susp", "h4-membro"):
        email, s = B.CONTAS[k]
        print(f"principal  {email:46s} {B.B5.garantir_usuario(email, s, B.NOMES[k])}")
    for k, tipo in (("h4-dono", "outra_area"), ("h4-csv", "personal"), ("h4-susp", "personal"), ("h4-membro", "personal")):
        q(f"update {S}.profiles set nome = {B.q(B.NOMES[k])}, tipo_perfil = '{tipo}' where id = '{B.uid(k)}'")

    # ── Clínica H4 ──
    c1 = garantir_conta("h4-dono", B.CONTA_CLINICA, "outra_area")
    q(f"""update {S}.contas set plano = 'treino_nutricao', faixa = 'livre', situacao = 'isenta', isenta_motivo = 'Conta de teste H4',
             bloquear_app_inadimplente = true where id = '{c1}'""")
    membro(c1, "h4-dono", ["dono", "personal", "nutricionista"])
    laura = aluno(c1, B.ALUNA_VENCIDA, "h4-dono", "genero = 'feminino', mensalidade_valor = 150, cobranca_pausada = false, "
                  "mensalidade_desde = now() - interval '60 days', mensalidade_pago_ate = now() - interval '3 days', config = '{}'::jsonb, ativo = true")
    igor = aluno(c1, B.ALUNO_EM_DIA, "h4-dono", "genero = 'masculino', mensalidade_valor = 150, cobranca_pausada = false, "
                 "mensalidade_desde = now() - interval '60 days', mensalidade_pago_ate = now() + interval '15 days', ativo = true")
    dono = B.uid("h4-dono")
    hoje = dt.datetime.now(TZ).date()
    # 15 lançamentos da Laura (o Financeiro do aluno mostra 12 + "Ver todos")
    if not q(f"select 1 from {S}.transacoes where paciente_id = '{laura}' and observacao = '{B.MARCA}' limit 1"):
        valores = []
        for i in range(15):
            d = hoje - dt.timedelta(days=30 * i + 2)
            desc = "Mensalidade " + d.strftime("%m/%Y")
            valores.append(f"('{dono}', '{c1}', '{laura}', 'entrada', {B.q(desc)}, 150, '{d.isoformat()}', 'pix', '{B.MARCA}')")
        q(f"insert into {S}.transacoes (nutricionista_id, conta_id, paciente_id, tipo, descricao, valor, data, metodo, observacao) values {', '.join(valores)}")
    # recibos: 2 neste mês (hoje e o dia 1º) + 1 no mês anterior — avulsos, o número sai do gatilho
    if not q(f"select 1 from {S}.recibos where paciente_id = '{laura}' and descricao like '%{B.MARCA}%' limit 1"):
        primeiro = hoje.replace(day=1)
        anterior = primeiro - dt.timedelta(days=3)
        for d, desc in ((hoje, f"Consulta {B.MARCA}"), (primeiro, f"Avaliação {B.MARCA}"), (anterior, f"Retorno {B.MARCA}")):
            q(f"""insert into {S}.recibos (nutricionista_id, conta_id, paciente_id, valor, data, descricao, texto)
                  values ('{dono}', '{c1}', '{laura}', 120, '{d.isoformat()}', {B.q(desc)}, {B.q(f'Recebi de {B.ALUNA_VENCIDA} a quantia de R$ 120,00 ({desc}).')})""")
    # 2 fotos do diário pelo /d/ (o mesmo caminho do aluno), sem reação: 2 e 3 dias atrás (fora do "Diário de hoje")
    cod = q(f"select link_codigo from {S}.pacientes where id = '{laura}'")[0]["link_codigo"]
    agora = dt.datetime.now(TZ).replace(second=0, microsecond=0)
    for dias, arq, txt in ((2, "almoco.jpg", f"Almoço da Laura {B.MARCA}"), (3, "jantar.jpg", f"Jantar da Laura {B.MARCA}")):
        quando = (agora - dt.timedelta(days=dias)).replace(hour=12 if dias == 2 else 20, minute=10)
        if not q(f"select 1 from {S}.diario_alimentar where paciente_id = '{laura}' and comentario = {B.q(txt)} and deleted_at is null"):
            st, r, _ = B.enviar_pelo_link(cod, B.FOTOS / arq, "almoco" if dias == 2 else "jantar", txt, quando.isoformat())
            assert st == 200 and isinstance(r, dict) and r.get("id"), (st, r)
    q(f"update {S}.diario_alimentar set reacao_nutri = null, comentario_nutri = '', reagido_em = null where paciente_id = '{laura}'")

    # o Otávio (h4-csv, profissional da Conta CSV H4) também é ALUNO da Clínica H4 (personal: a Helena): o profissional que também
    # é aluno chega no Perfil › "Excluir minha conta" e recebe a recusa com o contato do suporte (item 11)
    otavio = B.uid("h4-csv")
    if not q(f"select 1 from {S}.pacientes where conta_id = '{c1}' and user_id = '{otavio}' and deleted_at is null"):
        r = q(f"select {S}.matricular_na_conta('{otavio}', '{c1}', '{dono}', null, 'novo', true) as r")[0]["r"]
        assert r.get("ok"), r
    q(f"update {S}.pacientes set nome = {B.q(B.NOMES['h4-csv'])}, ativo = true where conta_id = '{c1}' and user_id = '{otavio}' and deleted_at is null")

    # ── Conta CSV H4: 520 alunos sem login ──
    c2 = garantir_conta("h4-csv", B.CONTA_CSV, "personal")
    q(f"update {S}.contas set plano = 'treino_nutricao', faixa = 'livre', situacao = 'isenta', isenta_motivo = 'Conta de teste H4' where id = '{c2}'")
    csv = B.uid("h4-csv")
    n = q(f"select count(*)::int n from {S}.pacientes where conta_id = '{c2}' and deleted_at is null")[0]["n"]
    if n < B.N_CSV:
        q(f"""insert into {S}.pacientes (nutricionista_id, personal_id, conta_id, nome, apelido, genero, nascimento, origem, ativo, created_at, updated_at)
              select case when i % 2 = 0 then '{csv}'::uuid end, '{csv}'::uuid, '{c2}', 'Aluno CSV ' || lpad(i::text, 3, '0'),
                     case when i % 10 = 0 then 'Apelido ' || i end,
                     case i % 4 when 0 then 'masculino' when 1 then 'feminino' when 2 then 'outro' end,
                     date '1975-01-01' + ((i * 37) % 12000),
                     'novo', true,
                     now() - make_interval(days => i % 180, mins => i),
                     now() - make_interval(days => greatest(0, (i % 180) - ((i * 7) % 30)), mins => i)
                from generate_series({n + 1}, {B.N_CSV}) as i""")
    for i in (1, 2, 3):
        q(f"update {S}.pacientes set cpf = '{cpf_valido(4400 + i)}' where conta_id = '{c2}' and nome = 'Aluno CSV {i:03d}' and cpf is null")

    # ── Conta Suspensa H4 (a master suspende no E2E) ──
    c3 = garantir_conta("h4-susp", B.CONTA_SUSP, "personal")
    q(f"""update {S}.contas set plano = 'treino', faixa = 'f10', situacao = 'ativa', isenta_motivo = null, teste_ate = null,
             vence_em = current_date + 30 where id = '{c3}'""")
    membro(c3, "h4-membro", ["personal"])

    contagem = q(f"""select c.nome, (select count(*) from {S}.pacientes p where p.conta_id = c.id and p.deleted_at is null) alunos,
                            (select count(*) from {S}.conta_membros m where m.conta_id = c.id and m.status = 'ativo') membros, c.situacao
                       from {S}.contas c where c.id in ('{c1}', '{c2}', '{c3}') order by c.nome""")
    print("contas H4:", contagem)
    print("Laura:", laura, "· Igor:", igor)
    return {"clinica": c1, "csv": c2, "suspensa": c3, "laura": laura, "igor": igor}


def limpar() -> None:
    emails = [B.EMAIL[k] for k in ("h4-dono", "h4-csv", "h4-susp", "h4-membro")]
    lista = ",".join(f"'{e}'" for e in emails)
    ids = [r["id"] for r in q(f"select id::text from auth.users where lower(email) in ({lista})")]
    contas = [r["id"] for r in q(f"select id::text from {S}.contas where nome in ({B.q(B.CONTA_CLINICA)}, {B.q(B.CONTA_CSV)}, {B.q(B.CONTA_SUSP)})")]
    if contas:
        cs = ",".join(f"'{c}'" for c in contas)
        fotos = [r["path"] for r in q(f"select d.path from {S}.diario_alimentar d join {S}.pacientes p on p.id = d.paciente_id where p.conta_id in ({cs})")]
        if fotos:
            sp = B.service(B.PRINCIPAL_REF)
            st, r, _ = B.http("DELETE", f"{B.PRINCIPAL_URL}/storage/v1/object/diario", {"prefixes": fotos}, {"apikey": sp, "Authorization": f"Bearer {sp}"})
            print("fotos do diário apagadas do storage:", st, len(fotos))
        print("apagando:", q(f"""with d as (delete from {S}.diario_alimentar where paciente_id in (select id from {S}.pacientes where conta_id in ({cs})) returning 1),
              r as (delete from {S}.recibos where conta_id in ({cs}) or paciente_id in (select id from {S}.pacientes where conta_id in ({cs})) returning 1),
              t as (delete from {S}.transacoes where conta_id in ({cs}) or paciente_id in (select id from {S}.pacientes where conta_id in ({cs})) returning 1)
              select (select count(*) from d) diario, (select count(*) from r) recibos, (select count(*) from t) lancamentos"""))
        print("alunos:", q(f"with a as (delete from {S}.pacientes where conta_id in ({cs}) returning 1) select count(*) from a"))
        for tabela in ("conta_eventos", "conta_faturas", "conta_assinaturas", "convites", "cadastros_pendentes", "recebimento_chaves"):
            try:
                q(f"delete from {S}.{tabela} where conta_id in ({cs})")
            except RuntimeError as e:  # a tabela pode não existir neste schema
                print(f"   {tabela}: {str(e)[:120]}")
        q(f"delete from {S}.categorias_financeiras where conta_id in ({cs})")
        q(f"delete from {S}.conta_membros where conta_id in ({cs})")
        q(f"delete from {S}.contas where id in ({cs})")
    if ids:
        us = ",".join(f"'{u}'" for u in ids)
        q(f"delete from {S}.categorias_financeiras where nutricionista_id in ({us})")
        q(f"delete from {S}.notificacoes where user_id in ({us})") if q(f"select 1 from information_schema.tables where table_schema = '{S}' and table_name = 'notificacoes'") else None
        sp = B.service(B.PRINCIPAL_REF)
        for u in ids:
            for s_ in ("public", "staging"):
                q(f"delete from {s_}.conta_membros where user_id = '{u}'")
            st, r, _ = B.http("DELETE", f"{B.PRINCIPAL_URL}/auth/v1/admin/users/{u}", None, {"apikey": sp, "Authorization": f"Bearer {sp}"})
            print("login apagado:", u, st)
    print("contas H4 que sobraram:", q(f"select count(*) from {S}.contas where nome like '%H4'"))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    if a.limpar:
        limpar()
    else:
        print(montar())
