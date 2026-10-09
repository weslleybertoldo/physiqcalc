"""Physiq hml-14d (D42, 09/10/2026) — a massa do TREINO no schema staging do banco do Treino, SÓ por SQL em staging.<tabela>.

Nenhum login novo e nenhum papel no Auth (o Auth do staging é o da produção): só linhas do professor de teste que os E2E w15/w23 já
usam (padrão: w13.dono.teste.claude, "Lucas Ferreira") e do aluno de teste dele (padrão: w13.aluno.teste.claude, "Rafael Moura").
Tudo com a marca "HOMOLOG lista HHhMM" no nome:

  exercícios  41 do professor ("<marca> · exercício #NN"), grupo muscular variado (os 10 de SheetMeuTreino: o #NN no grupo
              GRUPOS[(NN-1) % 10] — no painel: peito 5, costas 4, ombros 4, braços 8, pernas 16, abdômen 4)
  modelos     41 do professor ("<marca> · treino #NN")
  pasta       1 ("<marca> · pasta") com 5 desses modelos (NA_PASTA)
  linha       o modelo #33 com o exercício #07 (a busca de Meus treinos pelo nome do EXERCÍCIO acha o modelo)
  feitos      41 treinos de cronômetro (treino_historico) do aluno no MÊS CORRENTE ("<marca> · feito #NN"), espalhados do dia 1 até
              agora (no fuso de São Paulo) — Histórico do mês e Histórico completo
Quem recebe e o seletor do Histórico/Relatório provam com os alunos que o professor já tem (D42).

Escrita pela trava (massa.trava_staging: todo insert/update/delete em staging.<tabela>, nada cita public.), pela Management API
(~/.pc-pat), depois do /health do banco do Treino (VM Nano: UNHEALTHY ou lento = paro, sem reiniciar nada). Leitura com read_only.
A limpeza vai pela marca (qualquer hora) e só nas linhas de professores/alunos de TESTE (e-mail *.teste.claude@physiq…).
"""
from __future__ import annotations

import time

import massa as M

S = "staging"
N = M.N
PROFESSOR_PADRAO = "w13.dono.teste.claude@physiqnutri.app"  # Lucas Ferreira — o professor dos E2E w15/w23
ALUNO_PADRAO = "w13.aluno.teste.claude@physiqnutri.app"  # Rafael Moura — aluno dele, com login
GRUPOS = ("Peitoral", "Dorsal", "Deltóide", "Bíceps", "Tríceps", "Quadríceps", "Isquiotibiais", "Panturrilha", "Abdômen", "Glúteo")
# o chip do painel (GRUPOS_VOLUME de src/treino/editor/regras.ts) de cada grupo da massa
CHIP_DO_GRUPO = {"Peitoral": "peito", "Dorsal": "costas", "Deltóide": "ombros", "Bíceps": "bracos", "Tríceps": "bracos", "Quadríceps": "pernas",
                 "Isquiotibiais": "pernas", "Panturrilha": "pernas", "Abdômen": "abdomen", "Glúteo": "pernas"}
NA_PASTA = ("03", "12", "21", "30", "39")  # 5 modelos espalhados pelas 3 páginas da busca pela marca
MODELO_COM_LINHA, EXERCICIO_DA_LINHA = "33", "07"
TESTE = "lower(u.email) like '%.teste.claude@physiq%'"  # os logins de teste no auth.users do Treino


def grupo_do(nn: str | int) -> str:
    return GRUPOS[(int(nn) - 1) % len(GRUPOS)]


def por_chip() -> dict[str, int]:
    """Quantos exercícios da massa caem em cada chip do painel (o esperado do filtro por grupo)."""
    saida: dict[str, int] = {}
    for i in range(1, N + 1):
        chip = CHIP_DO_GRUPO[grupo_do(i)]
        saida[chip] = saida.get(chip, 0) + 1
    return saida


def nome_modelo(marca: str, nn: str | int) -> str:
    return f"{marca} · treino #{int(nn):02d}"


def nome_exercicio(marca: str, nn: str | int) -> str:
    return f"{marca} · exercício #{int(nn):02d}"


def nome_pasta(marca: str) -> str:
    return f"{marca} · pasta"


# ───────────────────────── banco do Treino ─────────────────────────
def ler(sql: str) -> list[dict]:
    """SQL SÓ LEITURA no banco do Treino (read_only da Management API)."""
    c = M._w02()
    st, r, _ = c.http("POST", f"https://api.supabase.com/v1/projects/{c.TREINO_REF}/database/query", {"query": sql, "read_only": True},
                      {"Authorization": f"Bearer {c.pat()}"}, timeout=180)
    if st not in (200, 201):
        raise RuntimeError(f"SQL só leitura (Treino) → HTTP {st}: {str(r)[:300]}")
    return r if isinstance(r, list) else []


def sql_staging(sql: str) -> list:
    """Escrita SÓ no schema staging do banco do Treino (a mesma trava do principal)."""
    M.trava_staging(sql)
    c = M._w02()
    return c.sql_mgmt(c.TREINO_REF, sql)


def saude() -> None:
    """O /health do banco do Treino (VM Nano) antes de escrever: UNHEALTHY ou lento (> 10 s) → paro, sem reiniciar nada."""
    c = M._w02()
    t0 = time.time()
    st, r, _ = c.http("GET", f"https://api.supabase.com/v1/projects/{c.TREINO_REF}/health?services=db&services=rest", None,
                      {"Authorization": f"Bearer {c.pat()}"}, timeout=30)
    gasto = time.time() - t0
    bom = st == 200 and isinstance(r, list) and bool(r) and all(x.get("healthy") is True or x.get("status") == "ACTIVE_HEALTHY" for x in r)
    if not bom or gasto > 10:
        raise SystemExit(f"PARADO: banco do Treino {'UNHEALTHY' if not bom else 'lento'} ({st}, {gasto:.1f} s) — não escrevo nada")


# ───────────────────────── quem (só leitura) ─────────────────────────
def id_no_treino(email: str) -> tuple[str, str]:
    """(o id no principal, o id no Treino) de um login de TESTE que já existe — pelo physiq_identidades do staging do Treino."""
    e = (email or "").strip().lower()
    if not M.eh_email_de_teste(e):
        raise SystemExit(f"não é login de teste (*{M.SUFIXO_TESTE}): {e}")
    r = M.ler(f"select id::text as id from auth.users where lower(email) = {M.lit(e)}")
    if len(r) != 1:
        raise SystemExit(f"o login de teste {e} não existe no Auth do principal — a massa não cria login")
    t = ler(f"select treino_user_id::text as t from {S}.physiq_identidades where principal_user_id = {M.lit(r[0]['id'])}::uuid")
    if len(t) != 1 or not t[0].get("t"):
        raise SystemExit(f"{e} não tem identidade no Treino (staging.physiq_identidades) — entre 1 vez com ele no staging (o E2E w13/w23)")
    return r[0]["id"], t[0]["t"]


def resolver(professor: str = PROFESSOR_PADRAO, aluno: str = ALUNO_PADRAO) -> dict:
    """O professor e o aluno de TESTE no Treino (staging), só leitura: o professor em physiq_professores; o aluno com perfil e com
    professor_id = o professor (é aluno dele: entra no Histórico, no Relatório e no Quem recebe)."""
    p_principal, prof = id_no_treino(professor)
    a_principal, aluno_id = id_no_treino(aluno)
    if not ler(f"select 1 from {S}.physiq_professores where id = {M.lit(prof)}::uuid"):
        raise SystemExit(f"{professor} não é professor no Treino (staging.physiq_professores)")
    perfil = ler(f"select nome, professor_id::text as professor from {S}.physiq_profiles where id = {M.lit(aluno_id)}::uuid")
    if not perfil:
        raise SystemExit(f"{aluno} não tem perfil no Treino (staging.physiq_profiles)")
    if perfil[0]["professor"] != prof:
        raise SystemExit(f"{aluno} não é aluno de {professor} no Treino (professor_id = {perfil[0]['professor']})")
    nome_prof = (ler(f"select nome from {S}.physiq_profiles where id = {M.lit(prof)}::uuid") or [{}])[0].get("nome")
    return {"professor_email": professor.strip().lower(), "professor_principal": p_principal, "professor": prof, "professor_nome": nome_prof,
            "aluno_email": aluno.strip().lower(), "aluno_principal": a_principal, "aluno": aluno_id, "aluno_nome": perfil[0]["nome"]}


# ───────────────────────── contagens (só leitura) ─────────────────────────
def contar(ctx: dict, marca: str | None = None) -> dict:
    """A massa (com a marca) e o fundo (sem a marca) de cada lista do Treino que os casos T1–T8 provam."""
    m, prof, aluno = M.lit(M.padrao(marca)), M.lit(ctx["professor"]), M.lit(ctx["aluno"])
    r = ler(f"""
      with mes as (select (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as ini,
                          date_trunc('month', now() at time zone 'America/Sao_Paulo')::date as dia1),
           escopo as (select x.id from {S}.physiq_profiles x where x.professor_id = {prof}::uuid or x.id = {prof}::uuid)
      select
        (select count(*) from {S}.tb_grupos_treino g where g.professor_id = {prof}::uuid and g.nome ~ {m})::int as modelos,
        -- Meus treinos: os do professor + os globais (o recorte da modelos_da_lista), sem a marca
        (select count(*) from {S}.tb_grupos_treino g where (g.professor_id is null or g.professor_id = {prof}::uuid) and g.nome !~ {m})::int
          as modelos_fundo,
        (select count(*) from {S}.tb_pastas_treino p where p.professor_id = {prof}::uuid and p.nome ~ {m})::int as pastas,
        (select count(*) from {S}.tb_pastas_treino_grupos v join {S}.tb_pastas_treino p on p.id = v.pasta_id
          where p.professor_id = {prof}::uuid and p.nome ~ {m})::int as pasta_modelos,
        (select count(*) from {S}.tb_grupos_exercicios ge join {S}.tb_exercicios e on e.id = ge.exercicio_id
          where e.professor_id = {prof}::uuid and e.nome ~ {m})::int as linhas,
        (select count(*) from {S}.tb_exercicios e where e.professor_id = {prof}::uuid and e.nome ~ {m})::int as exercicios,
        (select count(*) from {S}.tb_exercicios e where e.professor_id = {prof}::uuid and e.nome !~ {m})::int as exercicios_fundo,
        (select count(*) from {S}.tb_exercicios e where e.professor_id is null)::int as exercicios_globais,
        (select count(*) from {S}.treino_historico h where h.user_id = {aluno}::uuid and h.nome_treino ~ {m})::int as feitos,
        (select count(*) from {S}.treino_historico h, mes where h.user_id = {aluno}::uuid and h.nome_treino ~ {m} and h.iniciado_em >= mes.ini)::int
          as feitos_no_mes,
        -- Histórico do mês do professor (aproximado: os alunos dele + ele; com cronômetro + os sem cronômetro de outro dia) — aviso
        ((select count(*) from {S}.treino_historico h, mes where h.user_id in (select id from escopo) and h.iniciado_em >= mes.ini
            and coalesce(h.nome_treino, '') !~ {m})
         + (select count(*) from (select distinct c.user_id, c.data_treino from {S}.tb_treino_concluido c, mes
             where c.user_id in (select id from escopo) and c.concluido and c.data_treino >= mes.dia1
               and not exists (select 1 from {S}.treino_historico h where h.user_id = c.user_id
                                  and (h.iniciado_em at time zone 'America/Sao_Paulo')::date = c.data_treino)) x))::int as feitos_mes_fundo,
        (select count(*) from {S}.treino_historico h where h.user_id = {aluno}::uuid and coalesce(h.nome_treino, '') !~ {m})::int
          as feitos_aluno_fundo,
        (select count(*) from {S}.physiq_profiles x where x.professor_id = {prof}::uuid)::int as alunos_do_professor""")
    return r[0] if r else {}


def massa_completa(cont: dict) -> list[str]:
    faltas = [f"{k} {cont.get(k)}" for k in ("modelos", "exercicios", "feitos_no_mes") if cont.get(k) != N]
    if cont.get("pastas") != 1 or cont.get("pasta_modelos") != len(NA_PASTA):
        faltas.append(f"pasta {cont.get('pastas')} com {cont.get('pasta_modelos')} modelos")
    if cont.get("linhas") != 1:
        faltas.append(f"linha do modelo #{MODELO_COM_LINHA} {cont.get('linhas')}")
    return faltas


def imprimir(rotulo: str, cont: dict) -> None:
    print(f"\n{rotulo} (Treino):")
    print(f"   Meus treinos           massa {cont.get('modelos', '?')!s:>3}   fundo {cont.get('modelos_fundo', '?')!s:>3} (os do professor + os globais)")
    print(f"   Biblioteca › Minha     massa {cont.get('exercicios', '?')!s:>3}   fundo {cont.get('exercicios_fundo', '?')!s:>3} · globais {cont.get('exercicios_globais', '?')}")
    print(f"   Histórico do mês       massa {cont.get('feitos_no_mes', '?')!s:>3}   fundo ~{cont.get('feitos_mes_fundo', '?')!s:>2} (aproximado)")
    print(f"   Histórico do aluno     massa {cont.get('feitos', '?')!s:>3}   fundo {cont.get('feitos_aluno_fundo', '?')!s:>3} (com cronômetro)")
    print(f"   pasta {cont.get('pastas')} com {cont.get('pasta_modelos')} modelos · linha {cont.get('linhas')} · alunos do professor {cont.get('alunos_do_professor')}")


# ───────────────────────── o SQL ─────────────────────────
def sql_da_massa(ctx: dict, marca: str) -> list[tuple[str, str]]:
    """Os INSERTs da massa do Treino, em ordem (cada um numa chamada; uma falha no meio fica para o --limpar, pela marca)."""
    prof, aluno, mc = M.lit(ctx["professor"]), M.lit(ctx["aluno"]), M.lit(marca)
    nn = "lpad(i::text, 2, '0')"
    grupos = "array[" + ", ".join(M.lit(g) for g in GRUPOS) + "]"
    na_pasta = ", ".join(M.lit(nome_modelo(marca, x)) for x in NA_PASTA)
    return [
        ("exercícios 01–41", f"""
insert into {S}.tb_exercicios (nome, grupo_muscular, tipo, emoji, dica, professor_id)
select {mc} || ' · exercício #' || {nn}, ({grupos})[1 + (i - 1) % {len(GRUPOS)}], 'musculacao', '🏋️',
       'Exercício de teste da hml-14d (' || {mc} || '), apagado no fim.', {prof}::uuid
  from generate_series(1, {N}) as i"""),
        ("modelos 01–41", f"""
insert into {S}.tb_grupos_treino (nome, professor_id, created_at)
select {mc} || ' · treino #' || {nn}, {prof}::uuid, now() - make_interval(mins => i)
  from generate_series(1, {N}) as i"""),
        ("pasta", f"\ninsert into {S}.tb_pastas_treino (nome, professor_id) values ({M.lit(nome_pasta(marca))}, {prof}::uuid)"),
        (f"pasta com 5 modelos ({', '.join('#' + x for x in NA_PASTA)})", f"""
insert into {S}.tb_pastas_treino_grupos (pasta_id, grupo_id)
select p.id, g.id
  from {S}.tb_pastas_treino p
  join {S}.tb_grupos_treino g on g.professor_id = p.professor_id and g.nome in ({na_pasta})
 where p.professor_id = {prof}::uuid and p.nome = {M.lit(nome_pasta(marca))}"""),
        (f"linha: o modelo #{MODELO_COM_LINHA} com o exercício #{EXERCICIO_DA_LINHA}", f"""
insert into {S}.tb_grupos_exercicios (grupo_id, exercicio_id, ordem, num_series, reps_alvo, descanso_segundos)
select g.id, e.id, 0, 3, '12', 60
  from {S}.tb_grupos_treino g
  join {S}.tb_exercicios e on e.professor_id = g.professor_id and e.nome = {M.lit(nome_exercicio(marca, EXERCICIO_DA_LINHA))}
 where g.professor_id = {prof}::uuid and g.nome = {M.lit(nome_modelo(marca, MODELO_COM_LINHA))}"""),
        # do dia 1 do mês (São Paulo) até agora, em 41 passos iguais: todos no mês corrente, nenhum no futuro
        ("treinos feitos (cronômetro) 01–41 no mês", f"""
insert into {S}.treino_historico (user_id, nome_treino, iniciado_em, concluido_em, duracao_segundos, exercicios_concluidos)
select {aluno}::uuid, {mc} || ' · feito #' || {nn}, x.ini, least(x.ini + make_interval(secs => 1500 + 20 * i), now()),
       extract(epoch from least(x.ini + make_interval(secs => 1500 + 20 * i), now()) - x.ini)::int, '[]'::jsonb
  from generate_series(1, {N}) as i
  cross join lateral (select date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' as dia1) m
  cross join lateral (select m.dia1 + greatest(now() - interval '2 minutes' - m.dia1, interval '41 seconds') * (i::float8 / {N + 1}) as ini) x"""),
    ]


def sql_da_limpeza(marca: str | None) -> list[tuple[str, str]]:
    """Os DELETEs pela marca (qualquer hora; --marca para uma só), filhos antes, só nas linhas de professores/alunos de TESTE."""
    m = M.lit(M.padrao(marca))
    profs = f"(select u.id from auth.users u where {TESTE})"
    modelos = f"(select g.id from {S}.tb_grupos_treino g where g.nome ~ {m} and g.professor_id in {profs})"
    exercicios = f"(select e.id from {S}.tb_exercicios e where e.nome ~ {m} and e.professor_id in {profs})"
    pastas = f"(select p.id from {S}.tb_pastas_treino p where p.nome ~ {m} and p.professor_id in {profs})"
    return [
        ("linhas dos modelos", f"delete from {S}.tb_grupos_exercicios where grupo_id in {modelos} or exercicio_id in {exercicios}"),
        ("modelos nas pastas", f"delete from {S}.tb_pastas_treino_grupos where pasta_id in {pastas} or grupo_id in {modelos}"),
        # o que um E2E possa ter ligado aos modelos da massa (quem recebe, semana, dia trocado, prescrição)
        ("quem recebe", f"delete from {S}.tb_grupos_treino_perfis where grupo_id in {modelos}"),
        ("semana", f"delete from {S}.tb_semana_treinos where grupo_id in {modelos}"),
        ("dia trocado", f"delete from {S}.tb_treino_dia_override where grupo_id in {modelos}"),
        ("prescrição", f"delete from {S}.tb_series_padrao_usuario where grupo_id in {modelos} or exercicio_id in {exercicios}"),
        ("modelos", f"delete from {S}.tb_grupos_treino where nome ~ {m} and professor_id in {profs}"),
        ("pastas", f"delete from {S}.tb_pastas_treino where nome ~ {m} and professor_id in {profs}"),
        ("exercícios", f"delete from {S}.tb_exercicios where nome ~ {m} and professor_id in {profs}"),
        ("treinos feitos", f"delete from {S}.treino_historico where nome_treino ~ {m} and user_id in {profs}"),
    ]


def contar_sobras(marca: str | None) -> dict:
    """O que sobrou com a marca (qualquer professor/aluno de teste) — o --limpar confere zero."""
    m = M.lit(M.padrao(marca))
    profs = f"(select u.id from auth.users u where {TESTE})"
    r = ler(f"""select
      (select count(*) from {S}.tb_grupos_treino where nome ~ {m} and professor_id in {profs})::int as modelos,
      (select count(*) from {S}.tb_pastas_treino where nome ~ {m} and professor_id in {profs})::int as pastas,
      (select count(*) from {S}.tb_exercicios where nome ~ {m} and professor_id in {profs})::int as exercicios,
      (select count(*) from {S}.treino_historico where nome_treino ~ {m} and user_id in {profs})::int as feitos""")
    return {k: v for k, v in (r[0] if r else {}).items() if v}


# ───────────────────────── estado (o que o telas.py lê) ─────────────────────────
def estado_do_banco(ctx: dict, marca: str) -> dict:
    """Os ids da massa de uma marca (só leitura): modelos, exercícios e feitos por NN, a pasta."""
    m = M.lit(M.padrao(marca))
    prof, aluno = M.lit(ctx["professor"]), M.lit(ctx["aluno"])
    modelos = {x["nn"]: x["id"] for x in ler(f"""select substring(nome from '#([0-9]{{2}})$') as nn, id::text as id from {S}.tb_grupos_treino
                                                  where professor_id = {prof}::uuid and nome ~ {m}""") if x.get("nn")}
    exercicios = {x["nn"]: x["id"] for x in ler(f"""select substring(nome from '#([0-9]{{2}})$') as nn, id::text as id from {S}.tb_exercicios
                                                     where professor_id = {prof}::uuid and nome ~ {m}""") if x.get("nn")}
    feitos = {x["nn"]: x["id"] for x in ler(f"""select substring(nome_treino from '#([0-9]{{2}})$') as nn, id::text as id from {S}.treino_historico
                                                 where user_id = {aluno}::uuid and nome_treino ~ {m}""") if x.get("nn")}
    pasta = ler(f"select id::text as id, nome from {S}.tb_pastas_treino where professor_id = {prof}::uuid and nome ~ {m} order by created_at desc limit 1")
    return {"marca": marca, **ctx, "modelos": dict(sorted(modelos.items())), "exercicios": dict(sorted(exercicios.items())),
            "feitos": dict(sorted(feitos.items())), "pasta": pasta[0] if pasta else None, "na_pasta": list(NA_PASTA),
            "modelo_com_linha": MODELO_COM_LINHA, "exercicio_da_linha": EXERCICIO_DA_LINHA,
            "grupos": {f"{i:02d}": grupo_do(i) for i in range(1, N + 1)}, "por_chip": por_chip()}


def marca_no_banco(ctx: dict) -> str | None:
    r = ler(f"""select distinct substring(nome from {M.lit(M.PADRAO_MARCA)}) as m from {S}.tb_grupos_treino
                 where professor_id = {M.lit(ctx['professor'])}::uuid and nome ~ {M.lit(M.PADRAO_MARCA)} order by 1""")
    marcas = [x["m"] for x in r if x.get("m")]
    if len(marcas) > 1:
        print(f"⚠️ mais de uma marca nos modelos do professor ({marcas}): vale a última; --limpar tira todas")
    return marcas[-1] if marcas else None


# ───────────────────────── criar / limpar / conferir ─────────────────────────
def limpar(marca: str | None = None) -> bool:
    saude()
    antes = contar_sobras(marca)
    print(f"\nTreino antes da limpeza ({marca or 'qualquer hora'}): {antes or 'nada com a marca'}")
    falhas = []
    for rotulo, sql in sql_da_limpeza(marca):
        try:
            sql_staging(sql)
        except Exception as e:  # noqa: BLE001 — uma tabela que falha não impede as outras
            falhas.append(f"{rotulo}: {str(e)[:160]}")
    sobra = contar_sobras(marca)
    for f in falhas:
        print(f"   ❌ Treino {f}")
    print(("✅ Treino limpo: nada com a marca" if not sobra and not falhas else f"❌ Treino: sobrou com a marca {sobra}") + f" ({marca or 'qualquer hora'})")
    return not sobra and not falhas


def criar(ctx: dict, marca: str) -> tuple[dict, list[str]]:
    print(f"\nTreino: professor {ctx['professor_nome']!r} ({ctx['professor_email']}) · aluno {ctx['aluno_nome']!r} ({ctx['aluno_email']})")
    saude()
    if contar_sobras(None):
        print("sobras de uma rodada anterior no Treino (pela marca): limpando antes de criar")
        if not limpar(None):
            raise SystemExit("a limpeza das sobras do Treino falhou — nada foi criado")
    imprimir("antes (sem massa)", contar(ctx))
    for rotulo, sql in sql_da_massa(ctx, marca):
        sql_staging(sql)
        print(f"   ✅ Treino {rotulo}")
    cont = contar(ctx, marca)
    imprimir(f"depois ({marca})", cont)
    estado = estado_do_banco(ctx, marca)
    estado["contagens"] = cont
    faltas = massa_completa(cont)
    print("✅ massa do Treino completa" if not faltas else f"❌ massa do Treino incompleta: {faltas}")
    return estado, faltas


def conferir(ctx: dict) -> tuple[dict | None, list[str]]:
    marca = marca_no_banco(ctx)
    if not marca:
        imprimir("sem massa (fundo)", contar(ctx))
        return None, ["nenhuma massa no Treino: rode --criar"]
    cont = contar(ctx, marca)
    imprimir(f"massa {marca!r}", cont)
    estado = estado_do_banco(ctx, marca)
    estado["contagens"] = cont
    return estado, massa_completa(cont)


def mostrar_sql(marca: str) -> None:
    ctx = {"professor": "00000000-0000-4000-8000-0000000000a1", "aluno": "00000000-0000-4000-8000-0000000000a2"}
    print("-- ===== banco do TREINO (schema staging) =====\n")
    for rotulo, sql in sql_da_massa(ctx, marca):
        print(f"-- Treino: {rotulo}{sql};\n")
    for rotulo, sql in sql_da_limpeza(marca):
        print(f"-- Treino, limpar: {rotulo}\n{sql};\n")
