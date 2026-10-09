"""Physiq hml-14d (09/10/2026) — a massa do banco PRINCIPAL dos casos M (master) e P (por aluno), SÓ por SQL em staging.<tabela>.

Nenhum login novo e nenhum papel no Auth (o Auth do staging é o da produção). Tudo com a marca "HOMOLOG lista HHhMM":

  master   o master de teste da W27 (padrão: w27.master.teste.claude) vira master SÓ no staging.profiles (role = 'master' — o
           dar_master do e2e/w27/_base.py, sem o Auth); o --limpar faz o tirar_master (volta o papel de antes, padrão 'pessoa', só no
           staging.profiles: a massa não deu papel no Auth nem no public, e a trava de escrita recusa o que não for staging.)
           + 41 alunos SEM login na conta do app (contas.origem = 'app'): "<marca> · app #NN" (Master › App do aluno: 16 + 41 = 57)
  aluno    o aluno de teste COM login e matrícula (padrão: w13.aluno.teste.claude, "Rafael Moura", na "Consultoria Ferreira W13"),
           visto no painel pela NUTRICIONISTA dele (a matrícula aponta: w13.nutri.teste.claude, "Camila Rocha" — nutricionista vê o
           clínico: Anotações e Exames; o dono personal não vê — W18). Tudo gravado como da nutricionista (nutricionista_id/criado_por):
             cobranças    41 AVULSAS e PAGAS em dinheiro ("<marca> · cobrança #NN"): nenhum Pix/MP/WhatsApp, nenhuma trava no app,
                          e a mensalidade do aluno não muda (o gatilho trg_cobrancas_mensalidade só recalcula tipo 'mensalidade')
             lançamentos  41 ("<marca> · lançamento #NN"; 1 em 3 é saída, 1 em 10 estornado), de 41 a 81 dias atrás
             recibos      41 ("<marca> · recibo #NN")
             anotações    41 com visibilidade 'equipe' ("<marca> · anotação #NN"), 1 a cada 2 dias para trás
             exames       41 resultados em 41 DATAS (1 a cada 3 dias para trás): "<marca> · exame A" (os #ímpares, 21 datas) e
                          "· exame B" (20); valor 70+NN (fora da referência 70–99 a partir do #30)
             pedidos      41 pedidos de exame ("<marca> · pedido #NN" na observação)
             agenda       41 consultas FUTURAS do DIA INTEIRO ("<marca> · consulta #NN", de amanhã a +41 dias): dia inteiro = o gatilho
                          agendamentos_w20_avisar não cria o aviso no sino nem o push (só consulta com hora avisa); a confirmação
                          por WhatsApp só sai com o WhatsApp da profissional CONECTADO e o telefone do aluno; e-mail só pela
                          agenda-avisar, que a tela chama. No calendário da profissional (o padrão; sem nenhum, a massa cria
                          "<marca> · calendário" e o --limpar apaga). O gatilho da W2 garante as 3 tags-base da profissional se
                          faltarem (o mesmo de qualquer consulta nova).
  P7 (Pré-consulta) e M5 (Master › Alunos: o Zé Último por CPF/telefone) usam a massa da 14b (massa.py, parte 14b).
  Por que não o Zé Último da 14b no por aluno: o nome dele tem a marca, e a lista Recibos da 14b busca também pelo nome do aluno —
  41 recibos a mais nele levariam a busca pela marca a 82 (o L4 de "recibos" quebra). Na conta da W13 nada da 14b é tocado.
  Os E2E antigos que contam linhas do Rafael (ex.: e2e/w18 conta as anotações dele) rodam SEM esta massa (antes do --criar ou depois
  do --limpar).

A limpeza vai pela marca (qualquer hora) e só em linhas de alunos de contas de TESTE (dono *.teste.claude) e na conta do app.
"""
from __future__ import annotations

import massa as M

S = "staging"
N = M.N
MASTER_PADRAO = "w27.master.teste.claude@physiqnutri.app"
ALUNO_APP_PADRAO = "w13.aluno.teste.claude@physiqnutri.app"
TESTE = "lower(u.email) like '%.teste.claude@physiq%'"
HOJE = "(now() at time zone 'America/Sao_Paulo')::date"
PACIENTES_DE_TESTE = (f"(select p.id from {S}.pacientes p join {S}.contas c on c.id = p.conta_id join auth.users u on u.id = c.dono_id "
                      f"where {TESTE})")
CONTA_APP = f"(select c.id from {S}.contas c where c.origem = 'app')"


# ───────────────────────── master ─────────────────────────
def resolver_master(email: str = MASTER_PADRAO) -> dict:
    """O master de teste (só leitura): o login tem que existir (nada é criado) e ter perfil no staging; a conta do app também."""
    e = (email or "").strip().lower()
    if not M.eh_email_de_teste(e):
        raise SystemExit(f"não é login de teste (*{M.SUFIXO_TESTE}): {e}")
    u = M.ler(f"select id::text as id from auth.users where lower(email) = {M.lit(e)}")
    if len(u) != 1:
        raise SystemExit(f"o master de teste {e} não existe no Auth — a massa não cria login (rode antes o e2e/w27/massa.py)")
    perfil = M.ler(f"select role from {S}.profiles where id = {M.lit(u[0]['id'])}::uuid")
    if not perfil:
        raise SystemExit(f"{e} não tem perfil no staging.profiles")
    app = M.ler(f"select c.id::text as id, c.nome from {S}.contas c where c.origem = 'app' order by c.criado_em limit 1")
    if not app:
        raise SystemExit("o staging não tem a conta do app (contas.origem = 'app')")
    return {"master_email": e, "master_id": u[0]["id"], "papel": perfil[0]["role"], "conta_app": app[0]["id"], "conta_app_nome": app[0]["nome"]}


def sql_dar_master(ctx: dict) -> str:
    return f"update {S}.profiles set role = 'master' where id = {M.lit(ctx['master_id'])}::uuid"


def sql_tirar_master(master_id: str, papel: str | None = None) -> str:
    volta = papel if papel and papel != "master" else "pessoa"
    return f"update {S}.profiles set role = {M.lit(volta)} where id = {M.lit(M.uuid_ok(master_id, 'master'))}::uuid and role = 'master'"


def contar_master(ctx: dict, marca: str | None = None) -> dict:
    """As contagens das listas do master com a MESMA regra das RPCs (o recorte de sql/master_listas.sql da spec), só leitura."""
    m, app, mid = M.lit(M.padrao(marca)), M.lit(ctx["conta_app"]), M.lit(ctx["master_id"])
    r = M.ler(f"""select
      (select count(*) from {S}.contas)::int as contas,
      (select count(*) from {S}.contas where origem <> 'app')::int as financeiro,
      (select count(*) from {S}.conta_faturas)::int as faturas,
      (select count(*) from {S}.pacientes p where p.deleted_at is null and p.conta_id = {app}::uuid)::int as app_total,
      (select count(*) from {S}.pacientes p where p.deleted_at is null and p.conta_id = {app}::uuid and p.nome ~ {m})::int as app_massa,
      (select count(*) from {S}.pacientes p where p.deleted_at is null and p.conta_id = {app}::uuid and p.nome !~ {m})::int as app_fundo,
      (select count(*) from {S}.pacientes p where p.deleted_at is null and p.ativo and p.acesso_bloqueado_em is null
          and p.conta_id is distinct from {app}::uuid)::int as alunos_ativos,
      (select count(*) from auth.users u join {S}.profiles pr on pr.id = u.id
        where coalesce(pr.role, '') <> 'master' and coalesce(u.raw_app_meta_data ->> 'role', '') not in ('master', 'admin')
          and not exists (select 1 from {S}.pacientes p where p.user_id = u.id and p.deleted_at is null)
          and not exists (select 1 from {S}.conta_membros cm where cm.user_id = u.id and cm.status <> 'removido'))::int as sem_conta,
      (select role from {S}.profiles where id = {mid}::uuid) as papel""")
    return r[0] if r else {}


def sql_alunos_do_app(ctx: dict, marca: str) -> str:
    mc = M.lit(marca)
    return f"""
insert into {S}.pacientes (conta_id, nome, origem, ativo, cobranca_pausada, config, created_at, updated_at)
select {M.lit(ctx['conta_app'])}::uuid, {mc} || ' · app #' || lpad(i::text, 2, '0'), 'novo', true, true, {M.lit(M.CONFIG_ALUNO)}::jsonb,
       now() - make_interval(mins => i), now() - make_interval(mins => i)
  from generate_series(1, {N}) as i"""


def sql_limpeza_master(marca: str | None) -> list[tuple[str, str]]:
    m = M.lit(M.padrao(marca))
    return [("alunos do app", f"delete from {S}.pacientes where nome ~ {m} and conta_id in {CONTA_APP}")]


def estado_master(ctx: dict, marca: str) -> dict:
    m = M.lit(M.padrao(marca))
    app = {x["nn"]: x["id"] for x in M.ler(f"""select substring(nome from '#([0-9]{{2}})$') as nn, id::text as id from {S}.pacientes
                                                  where conta_id = {M.lit(ctx['conta_app'])}::uuid and nome ~ {m} and deleted_at is null""")
           if x.get("nn")}
    return {"marca": marca, **ctx, "app": dict(sorted(app.items()))}


# ───────────────────────── por aluno ─────────────────────────
def resolver_aluno(email: str = ALUNO_APP_PADRAO) -> dict:
    """O aluno de teste COM login e a matrícula dele que serve (só leitura): conta de teste que não é a do app, não travada, com
    Nutrição, o aluno ativo e sem bloqueio, e a nutricionista responsável = login de teste, membro ativo com o papel. A profissional
    do painel é ela; o calendário é o padrão dela (sem nenhum: o --criar cria um com a marca)."""
    e = (email or "").strip().lower()
    if not M.eh_email_de_teste(e):
        raise SystemExit(f"não é login de teste (*{M.SUFIXO_TESTE}): {e}")
    u = M.ler(f"select id::text as id from auth.users where lower(email) = {M.lit(e)}")
    if len(u) != 1:
        raise SystemExit(f"o aluno de teste {e} não existe no Auth — a massa não cria login")
    mats = M.ler(f"""
      select p.id::text as id, p.nome, p.treino_user_id::text as treino, p.nutricionista_id::text as nutri, p.acesso_bloqueado_em is not null as bloqueado,
             c.id::text as conta, c.nome as conta_nome, {S}.modulos_do_plano(c.plano) as modulos,
             (not coalesce(c.cobranca_legada, false) and c.situacao in ('vencida', 'suspensa', 'cancelada')) as travada,
             (select lower(x.email) from auth.users x where x.id = p.nutricionista_id) as nutri_email,
             exists (select 1 from {S}.conta_membros cm where cm.conta_id = c.id and cm.user_id = p.nutricionista_id and cm.status = 'ativo'
                       and 'nutricionista' = any(cm.papeis)) as nutri_membro,
             (select lower(x.email) from auth.users x where x.id = c.dono_id) as dono_email
        from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
       where p.user_id = {M.lit(u[0]['id'])}::uuid and p.deleted_at is null and p.ativo and c.origem <> 'app'
       order by p.created_at""")

    def faltas(x: dict) -> list[str]:
        f = []
        if x["travada"]:
            f.append("conta travada")
        if "nutricao" not in (x["modulos"] or []):
            f.append("plano sem Nutrição")
        if x["bloqueado"]:
            f.append("aluno bloqueado")
        if not M.eh_email_de_teste(x["nutri_email"] or ""):
            f.append("sem nutricionista de teste")
        elif not x["nutri_membro"]:
            f.append("a nutricionista não é membro ativo com o papel")
        if not M.eh_email_de_teste(x["dono_email"] or ""):
            f.append("o dono da conta não é de teste")
        return f

    mat = next((x for x in mats if not faltas(x)), None)
    if not mat:
        lista = "; ".join(f"{x['conta_nome']!r} ({', '.join(faltas(x))})" for x in mats)
        raise SystemExit(f"nenhuma matrícula de {e} serve para a massa por aluno ({lista or 'nenhuma matrícula viva'})")
    cal = M.ler(f"""select id::text as id from {S}.calendarios where nutricionista_id = {M.lit(mat['nutri'])}::uuid and deleted_at is null
                     order by padrao desc, created_at limit 1""")
    return {"aluno_email": e, "aluno_user": u[0]["id"], "paciente": mat["id"], "paciente_nome": mat["nome"],
            "rota_id": mat["treino"] or mat["id"], "treino_user_id": mat["treino"], "conta_id": mat["conta"], "conta_nome": mat["conta_nome"],
            "profissional_email": mat["nutri_email"], "profissional": mat["nutri"], "calendario": cal[0]["id"] if cal else None}


def contar_aluno(ctx: dict, marca: str | None = None) -> dict:
    """A massa e o fundo de cada lista por aluno. Fundo do painel = o que a nutricionista vê (os registros dela; a cobrança pelo
    podeVerCobranca do responsável: criado_por ou nutricionista_id = ela); fundo do app = tudo da matrícula."""
    m, pac, prof, usr = M.lit(M.padrao(marca)), M.lit(ctx["paciente"]), M.lit(ctx["profissional"]), M.lit(ctx["aluno_user"])
    massa_m = M.lit((marca or M.PADRAO_MARCA) + " · exame A") if marca else None
    r = M.ler(f"""
      with a as (select {pac}::uuid as pac, {prof}::uuid as prof, {usr}::uuid as usr)
      select
        (select count(*) from {S}.cobrancas c, a where c.paciente_id = a.pac and c.descricao ~ {m})::int as cobrancas,
        (select count(*) from {S}.cobrancas c, a where c.paciente_id = a.pac and c.deleted_at is null and c.descricao !~ {m}
            and (c.criado_por = a.prof or c.nutricionista_id = a.prof))::int as cobrancas_fundo_painel,
        (select count(*) from {S}.cobrancas c, a where c.paciente_id = a.pac and c.deleted_at is null and c.descricao !~ {m})::int as cobrancas_fundo_app,
        (select count(*) from {S}.transacoes t, a where t.paciente_id = a.pac and t.descricao ~ {m})::int as lancamentos,
        (select count(*) from {S}.transacoes t, a where t.paciente_id = a.pac and t.deleted_at is null and t.descricao !~ {m}
            and t.nutricionista_id = a.prof)::int as lancamentos_fundo,
        (select coalesce(sum(t.valor) filter (where t.tipo <> 'saida'), 0) from {S}.transacoes t, a
          where t.paciente_id = a.pac and t.deleted_at is null and not coalesce(t.estornada, false) and t.nutricionista_id = a.prof)::float8 as recebido,
        (select coalesce(sum(t.valor) filter (where t.tipo = 'saida'), 0) from {S}.transacoes t, a
          where t.paciente_id = a.pac and t.deleted_at is null and not coalesce(t.estornada, false) and t.nutricionista_id = a.prof)::float8 as gasto,
        (select coalesce(sum(t.valor) filter (where t.tipo <> 'saida'), 0) from {S}.transacoes t, a
          where t.paciente_id = a.pac and t.deleted_at is null and not coalesce(t.estornada, false))::float8 as recebido_todos,
        (select coalesce(sum(t.valor) filter (where t.tipo = 'saida'), 0) from {S}.transacoes t, a
          where t.paciente_id = a.pac and t.deleted_at is null and not coalesce(t.estornada, false))::float8 as gasto_todos,
        (select count(*) from {S}.recibos r, a where r.paciente_id = a.pac and r.descricao ~ {m})::int as recibos,
        (select count(*) from {S}.recibos r, a where r.paciente_id = a.pac and r.deleted_at is null and r.descricao !~ {m}
            and r.nutricionista_id = a.prof)::int as recibos_fundo_painel,
        (select count(*) from {S}.recibos r, a where r.paciente_id = a.pac and r.deleted_at is null and r.descricao !~ {m})::int as recibos_fundo_app,
        (select count(*) from {S}.registros_prontuario x, a where x.paciente_id = a.pac and x.texto ~ {m})::int as anotacoes,
        (select count(*) from {S}.registros_prontuario x, a where x.paciente_id = a.pac and x.deleted_at is null and x.texto !~ {m})::int as anotacoes_fundo,
        (select count(distinct x.data) from {S}.resultados_exame x, a where x.paciente_id = a.pac and x.deleted_at is null and x.observacao ~ {m})::int
          as exames_datas,
        (select count(*) from {S}.resultados_exame x, a where x.paciente_id = a.pac and x.observacao ~ {m})::int as exames_resultados,
        (select count(distinct x.data) from {S}.resultados_exame x, a where x.paciente_id = a.pac and x.deleted_at is null)::int as exames_datas_todas,
        {f"(select count(distinct x.data) from {S}.resultados_exame x, a where x.paciente_id = a.pac and x.deleted_at is null and x.exame = {massa_m})::int"
          if massa_m else "0"} as exame_a_datas,
        (select count(*) from {S}.pedidos_exame x, a where x.paciente_id = a.pac and x.observacao ~ {m})::int as pedidos,
        (select count(*) from {S}.pedidos_exame x, a where x.paciente_id = a.pac and x.deleted_at is null and x.observacao !~ {m})::int as pedidos_fundo,
        (select count(*) from {S}.agendamentos g, a where g.paciente_id = a.pac and g.titulo ~ {m} and g.deleted_at is null and g.fim >= now()
            and g.status not in ('desmarcado', 'paciente_desmarcou'))::int as agenda,
        -- "Próximas" do app (minha_agenda_lista 'proximas'): as matrículas do aluno, fim >= agora, não desmarcada
        (select count(*) from {S}.agendamentos g join {S}.pacientes p on p.id = g.paciente_id, a
          where p.user_id = a.usr and p.deleted_at is null and g.deleted_at is null and g.fim >= now()
            and g.status not in ('desmarcado', 'paciente_desmarcou') and g.titulo !~ {m})::int as agenda_fundo,
        (select count(*) from {S}.calendarios k, a where k.nutricionista_id = a.prof and k.nome ~ {m})::int as calendarios""")
    return r[0] if r else {}


def massa_aluno_completa(cont: dict) -> list[str]:
    return [f"{k} {cont.get(k)}" for k in ("cobrancas", "lancamentos", "recibos", "anotacoes", "exames_datas", "exames_resultados", "pedidos", "agenda")
            if cont.get(k) != N]


def imprimir_aluno(rotulo: str, cont: dict) -> None:
    print(f"\n{rotulo} (por aluno):")
    for nome, k, f in (("cobranças (painel · app)", "cobrancas", "cobrancas_fundo_painel"), ("lançamentos", "lancamentos", "lancamentos_fundo"),
                       ("recibos (painel)", "recibos", "recibos_fundo_painel"), ("anotações", "anotacoes", "anotacoes_fundo"),
                       ("exames (datas)", "exames_datas", None), ("pedidos de exame", "pedidos", "pedidos_fundo"), ("agenda (próximas)", "agenda", "agenda_fundo")):
        print(f"   {nome:26s} massa {cont.get(k, '?')!s:>3}   fundo {cont.get(f, '—') if f else '—'!s:>3}")
    print(f"   exames: {cont.get('exames_datas_todas')} datas no total · o exame A em {cont.get('exame_a_datas')} · recibos/cobranças no app: "
          f"fundo {cont.get('recibos_fundo_app')}/{cont.get('cobrancas_fundo_app')} · totais (da nutricionista) recebido {cont.get('recebido')} gasto {cont.get('gasto')}")


def sql_aluno(ctx: dict, marca: str) -> list[tuple[str, str]]:
    """Os INSERTs por aluno, em ordem (o calendário só se a profissional não tiver nenhum)."""
    pac, prof, conta, mc = M.lit(ctx["paciente"]), M.lit(ctx["profissional"]), M.lit(ctx["conta_id"]), M.lit(marca)
    nn = "lpad(i::text, 2, '0')"
    serie = f"from generate_series(1, {N}) as i"
    criado = "now() - make_interval(mins => i), now() - make_interval(mins => i)"
    cal = (f"{M.lit(ctx['calendario'])}::uuid" if ctx.get("calendario") else
           f"(select k.id from {S}.calendarios k where k.nutricionista_id = {prof}::uuid and k.nome = {mc} || ' · calendário' order by k.created_at desc limit 1)")
    lista = []
    if not ctx.get("calendario"):
        lista.append(("calendário da profissional (ela não tinha nenhum)", f"""
insert into {S}.calendarios (nutricionista_id, nome, conta_id) values ({prof}::uuid, {mc} || ' · calendário', {conta}::uuid)"""))
    lista += [
        ("cobranças 01–41 (avulsas, pagas em dinheiro)", f"""
insert into {S}.cobrancas (nutricionista_id, paciente_id, conta_id, criado_por, tipo, descricao, valor, vencimento, status, pago_em, forma, metodo,
                           confirmado_por, confirmado_em, created_at, updated_at)
select {prof}::uuid, {pac}::uuid, {conta}::uuid, {prof}::uuid, 'avulsa', {mc} || ' · cobrança #' || {nn}, 30 + i, {HOJE} - 3 * (i - 1), 'paga',
       now() - make_interval(days => 3 * (i - 1)), 'manual', 'dinheiro', {prof}::uuid, now() - make_interval(days => 3 * (i - 1)), {criado}
  {serie}"""),
        ("lançamentos 01–41", f"""
insert into {S}.transacoes (nutricionista_id, conta_id, paciente_id, tipo, descricao, metodo, valor, data, estornada, created_at, updated_at)
select {prof}::uuid, {conta}::uuid, {pac}::uuid, case when i % 3 = 0 then 'saida' else 'entrada' end, {mc} || ' · lançamento #' || {nn}, 'pix',
       40 + i, {HOJE} - 40 - i, i % 10 = 0, {criado}
  {serie}"""),
        ("recibos 01–41", f"""
insert into {S}.recibos (nutricionista_id, conta_id, paciente_id, valor, data, descricao, texto, created_at, updated_at)
select {prof}::uuid, {conta}::uuid, {pac}::uuid, 50 + i, {HOJE} - 2 * (i - 1), {mc} || ' · recibo #' || {nn},
       'Recibo de teste da hml-14d (' || {mc} || '), apagado no fim.', {criado}
  {serie}"""),
        ("anotações 01–41 (equipe)", f"""
insert into {S}.registros_prontuario (nutricionista_id, paciente_id, data, texto, visibilidade, autor_papel, created_at, updated_at)
select {prof}::uuid, {pac}::uuid, now() - make_interval(days => 2 * (i - 1)) - interval '1 hour',
       {mc} || ' · anotação #' || {nn} || ' — anotação de teste da hml-14d, apagada no fim.', 'equipe', 'nutricionista', {criado}
  {serie}"""),
        ("resultados de exame 01–41 (41 datas)", f"""
insert into {S}.resultados_exame (nutricionista_id, paciente_id, exame, valor, unidade, ref_min, ref_max, data, observacao, created_at, updated_at)
select {prof}::uuid, {pac}::uuid, {mc} || case when i % 2 = 1 then ' · exame A' else ' · exame B' end, 70 + i, 'mg/dL', 70, 99,
       {HOJE} - 3 * (i - 1), {mc} || ' · resultado #' || {nn}, {criado}
  {serie}"""),
        ("pedidos de exame 01–41", f"""
insert into {S}.pedidos_exame (nutricionista_id, paciente_id, data, exames, observacao, created_at, updated_at)
select {prof}::uuid, {pac}::uuid, {HOJE} - 3 * (i - 1), array['Hemograma completo', 'Glicemia de jejum'], {mc} || ' · pedido #' || {nn}, {criado}
  {serie}"""),
        ("consultas 01–41 (futuras, dia inteiro: sem aviso)", f"""
insert into {S}.agendamentos (nutricionista_id, calendario_id, paciente_id, conta_id, titulo, inicio, fim, dia_inteiro, status, confirmacao, modulo,
                              origem, observacao)
select {prof}::uuid, {cal}, {pac}::uuid, {conta}::uuid, {mc} || ' · consulta #' || {nn},
       ({HOJE} + i)::timestamp at time zone 'America/Sao_Paulo', ({HOJE} + i + 1)::timestamp at time zone 'America/Sao_Paulo', true, 'agendado',
       'a_confirmar', 'nutricao', 'profissional', 'Consulta de teste da hml-14d (dia inteiro: sem aviso), apagada no fim.'
  {serie}"""),
    ]
    return lista


def sql_limpeza_aluno(marca: str | None) -> list[tuple[str, str]]:
    """Os DELETEs pela marca (qualquer hora), só em alunos de contas de TESTE (as consultas antes do calendário da massa)."""
    m = M.lit(M.padrao(marca))
    profs = f"(select u.id from auth.users u where {TESTE})"
    return [
        ("consultas", f"delete from {S}.agendamentos where titulo ~ {m} and paciente_id in {PACIENTES_DE_TESTE}"),
        ("calendário da massa", f"delete from {S}.calendarios where nome ~ {m} and nutricionista_id in {profs}"),
        ("cobranças", f"delete from {S}.cobrancas where descricao ~ {m} and paciente_id in {PACIENTES_DE_TESTE}"),
        ("recibos", f"delete from {S}.recibos where descricao ~ {m} and paciente_id in {PACIENTES_DE_TESTE}"),
        ("lançamentos", f"delete from {S}.transacoes where descricao ~ {m} and paciente_id in {PACIENTES_DE_TESTE}"),
        ("anotações", f"delete from {S}.registros_prontuario where texto ~ {m} and paciente_id in {PACIENTES_DE_TESTE}"),
        ("resultados de exame", f"delete from {S}.resultados_exame where (observacao ~ {m} or exame ~ {m}) and paciente_id in {PACIENTES_DE_TESTE}"),
        ("pedidos de exame", f"delete from {S}.pedidos_exame where observacao ~ {m} and paciente_id in {PACIENTES_DE_TESTE}"),
    ]


def contar_sobras(marca: str | None) -> dict:
    """O que sobrou com a marca (por aluno em contas de teste + os alunos do app) — o --limpar confere zero."""
    m = M.lit(M.padrao(marca))
    r = M.ler(f"""select
      (select count(*) from {S}.agendamentos where titulo ~ {m} and paciente_id in {PACIENTES_DE_TESTE})::int as consultas,
      (select count(*) from {S}.calendarios k join auth.users u on u.id = k.nutricionista_id where k.nome ~ {m} and {TESTE})::int as calendarios,
      (select count(*) from {S}.cobrancas where descricao ~ {m} and paciente_id in {PACIENTES_DE_TESTE})::int as cobrancas,
      (select count(*) from {S}.recibos where descricao ~ {m} and paciente_id in {PACIENTES_DE_TESTE})::int as recibos,
      (select count(*) from {S}.transacoes where descricao ~ {m} and paciente_id in {PACIENTES_DE_TESTE})::int as lancamentos,
      (select count(*) from {S}.registros_prontuario where texto ~ {m} and paciente_id in {PACIENTES_DE_TESTE})::int as anotacoes,
      (select count(*) from {S}.resultados_exame where (observacao ~ {m} or exame ~ {m}) and paciente_id in {PACIENTES_DE_TESTE})::int as exames,
      (select count(*) from {S}.pedidos_exame where observacao ~ {m} and paciente_id in {PACIENTES_DE_TESTE})::int as pedidos,
      (select count(*) from {S}.pacientes where nome ~ {m} and conta_id in {CONTA_APP})::int as alunos_do_app""")
    return {k: v for k, v in (r[0] if r else {}).items() if v}


def estado_aluno(ctx: dict, marca: str) -> dict:
    """Os ids da massa por aluno (só leitura): cobranças, lançamentos, recibos, anotações e consultas por NN; as datas dos exames."""
    m, pac = M.lit(M.padrao(marca)), M.lit(ctx["paciente"])

    def por_nn(tabela: str, coluna: str) -> dict:
        return dict(sorted({x["nn"]: x["id"] for x in M.ler(
            f"""select substring({coluna} from '#([0-9]{{2}})') as nn, id::text as id from {S}.{tabela}
                 where paciente_id = {pac}::uuid and {coluna} ~ {m} and deleted_at is null""") if x.get("nn")}.items()))

    datas = [x["d"] for x in M.ler(f"""select distinct data::text as d from {S}.resultados_exame
                                        where paciente_id = {pac}::uuid and observacao ~ {m} and deleted_at is null order by 1 desc""")]
    return {"marca": marca, **ctx, "cobrancas": por_nn("cobrancas", "descricao"), "lancamentos": por_nn("transacoes", "descricao"),
            "recibos": por_nn("recibos", "descricao"), "anotacoes": por_nn("registros_prontuario", "texto"),
            "consultas": por_nn("agendamentos", "titulo"), "pedidos": por_nn("pedidos_exame", "observacao"), "exames_datas": datas,
            "exame_a": f"{marca} · exame A", "exame_b": f"{marca} · exame B"}


def marca_no_banco(ctx_aluno: dict | None, ctx_master: dict | None) -> str | None:
    """A marca mais nova da massa da 14d no principal (a das cobranças do aluno ou a dos alunos do app)."""
    partes = []
    if ctx_aluno:
        partes.append(f"select substring(descricao from {M.lit(M.PADRAO_MARCA)}) as m from {S}.cobrancas "
                      f"where paciente_id = {M.lit(ctx_aluno['paciente'])}::uuid and descricao ~ {M.lit(M.PADRAO_MARCA)}")
    if ctx_master:
        partes.append(f"select substring(nome from {M.lit(M.PADRAO_MARCA)}) from {S}.pacientes "
                      f"where conta_id = {M.lit(ctx_master['conta_app'])}::uuid and nome ~ {M.lit(M.PADRAO_MARCA)}")
    if not partes:
        return None
    marcas = sorted({x["m"] for x in M.ler(" union ".join(partes)) if x.get("m")})
    if len(marcas) > 1:
        print(f"⚠️ mais de uma marca na massa do principal da 14d ({marcas}): vale a última; --limpar tira todas")
    return marcas[-1] if marcas else None


# ───────────────────────── criar / limpar / conferir ─────────────────────────
def limpar(marca: str | None = None, master_id: str | None = None, papel: str | None = None) -> bool:
    antes = contar_sobras(marca)
    print(f"\nprincipal (14d) antes da limpeza ({marca or 'qualquer hora'}): {antes or 'nada com a marca'}")
    falhas = []
    for rotulo, sql in sql_limpeza_aluno(marca) + sql_limpeza_master(marca):
        try:
            M.sql_staging(sql)
        except Exception as e:  # noqa: BLE001 — uma tabela que falha não impede as outras
            falhas.append(f"{rotulo}: {str(e)[:160]}")
    if master_id:
        try:
            M.sql_staging(sql_tirar_master(master_id, papel))
            r = M.ler(f"select role from {S}.profiles where id = {M.lit(master_id)}::uuid")
            if r and r[0]["role"] == "master":
                falhas.append("tirar_master: o papel continua master")
            else:
                print(f"   ✅ tirar_master: o master de teste voltou a {r[0]['role'] if r else '?'!r} no staging.profiles")
        except Exception as e:  # noqa: BLE001
            falhas.append(f"tirar_master: {str(e)[:160]}")
    sobra = contar_sobras(marca)
    for f in falhas:
        print(f"   ❌ principal (14d) {f}")
    print(("✅ principal (14d) limpo: nada com a marca" if not sobra and not falhas else f"❌ principal (14d): sobrou {sobra}")
          + f" ({marca or 'qualquer hora'})")
    return not sobra and not falhas


def criar_master(ctx: dict, marca: str) -> tuple[dict, list[str]]:
    print(f"\nmaster: {ctx['master_email']} (papel no staging: {ctx['papel']!r}) · conta do app {ctx['conta_app_nome']!r}")
    papel_antes = ctx["papel"]
    M.sql_staging(sql_dar_master(ctx))
    print("   ✅ dar_master: role = 'master' SÓ no staging.profiles (o Auth e o public não mudam)")
    M.sql_staging(sql_alunos_do_app(ctx, marca))
    print("   ✅ 41 alunos sem login na conta do app")
    cont = contar_master(ctx, marca)
    print(f"   contas {cont.get('contas')} · financeiro {cont.get('financeiro')} (faturas {cont.get('faturas')}) · app do aluno {cont.get('app_total')} "
          f"({cont.get('app_massa')} da massa) · alunos ativos {cont.get('alunos_ativos')} · sem conta {cont.get('sem_conta')} · papel {cont.get('papel')!r}")
    estado = estado_master({**ctx, "papel": papel_antes if papel_antes != "master" else "pessoa"}, marca)
    estado["contagens"] = cont
    faltas = ([] if cont.get("app_massa") == N else [f"app_massa {cont.get('app_massa')}"]) + ([] if cont.get("papel") == "master" else ["papel"])
    print("✅ massa do master completa" if not faltas else f"❌ massa do master incompleta: {faltas}")
    return estado, faltas


def criar_aluno(ctx: dict, marca: str) -> tuple[dict, list[str]]:
    print(f"\npor aluno: {ctx['paciente_nome']!r} ({ctx['aluno_email']}) na {ctx['conta_nome']!r} · profissional {ctx['profissional_email']}"
          f" · calendário {'o dela' if ctx.get('calendario') else 'novo (com a marca)'}")
    imprimir_aluno("antes (sem massa)", contar_aluno(ctx))
    for rotulo, sql in sql_aluno(ctx, marca):
        M.sql_staging(sql)
        print(f"   ✅ por aluno {rotulo}")
    cont = contar_aluno(ctx, marca)
    imprimir_aluno(f"depois ({marca})", cont)
    estado = estado_aluno(ctx, marca)
    estado["contagens"] = cont
    faltas = massa_aluno_completa(cont)
    print("✅ massa por aluno completa" if not faltas else f"❌ massa por aluno incompleta: {faltas}")
    return estado, faltas


def conferir_master(ctx: dict, marca: str | None) -> tuple[dict | None, list[str]]:
    cont = contar_master(ctx, marca)
    print(f"\nmaster ({marca or 'sem massa'}): contas {cont.get('contas')} · financeiro {cont.get('financeiro')} (faturas {cont.get('faturas')}) · "
          f"app {cont.get('app_total')} ({cont.get('app_massa')} da massa) · ativos {cont.get('alunos_ativos')} · sem conta {cont.get('sem_conta')} · "
          f"papel {cont.get('papel')!r}")
    if not marca:
        return None, ["nenhuma massa do master: rode --criar"]
    estado = estado_master(ctx, marca)
    estado["contagens"] = cont
    faltas = ([] if cont.get("app_massa") == N else [f"app_massa {cont.get('app_massa')}"])
    if cont.get("papel") != "master":
        faltas.append(f"o master de teste não é master no staging (papel {cont.get('papel')!r})")
    return estado, faltas


def conferir_aluno(ctx: dict, marca: str | None) -> tuple[dict | None, list[str]]:
    if not marca:
        imprimir_aluno("sem massa (fundo)", contar_aluno(ctx))
        return None, ["nenhuma massa por aluno: rode --criar"]
    cont = contar_aluno(ctx, marca)
    imprimir_aluno(f"massa {marca!r}", cont)
    estado = estado_aluno(ctx, marca)
    estado["contagens"] = cont
    return estado, massa_aluno_completa(cont)


def mostrar_sql(marca: str) -> None:
    ctx_m = {"master_id": "00000000-0000-4000-8000-0000000000b1", "conta_app": "00000000-0000-4000-8000-0000000000b2"}
    ctx_a = {"paciente": "00000000-0000-4000-8000-0000000000b3", "profissional": "00000000-0000-4000-8000-0000000000b4",
             "conta_id": "00000000-0000-4000-8000-0000000000b5", "calendario": None}
    print("-- ===== banco PRINCIPAL (schema staging): master e por aluno =====\n")
    print(f"-- master: dar_master (só staging.profiles)\n{sql_dar_master(ctx_m)};\n")
    print(f"-- master: 41 alunos sem login na conta do app{sql_alunos_do_app(ctx_m, marca)};\n")
    for rotulo, sql in sql_aluno(ctx_a, marca):
        print(f"-- por aluno: {rotulo}{sql};\n")
    for rotulo, sql in sql_limpeza_aluno(marca) + sql_limpeza_master(marca):
        print(f"-- limpar (14d): {rotulo}\n{sql};\n")
    print(f"-- limpar (14d): tirar_master (só staging.profiles; volta o papel de antes, padrão 'pessoa')\n{sql_tirar_master(ctx_m['master_id'])};\n")
