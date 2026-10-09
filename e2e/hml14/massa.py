#!/usr/bin/env python3
"""Physiq hml-14b (B21 · B19, 09/10/2026) — massa das listas paginadas do painel no STAGING, SÓ por SQL no schema staging.

O Auth do staging é o da produção: NENHUM login é criado. A massa são só linhas das tabelas do schema staging na conta de TESTE
(padrão: a da nutri.teste.claude — a nutri-legado dos E2E —, conta legado_nutri com Nutrição, faixa "livre": a f10 barra o 11º
aluno). Tudo leva a marca "HOMOLOG lista <hora>" (ex.: "HOMOLOG lista 09h15") no nome, na descrição, no título ou no comentário:

  alunos       41 vivos e ativos: "HOMOLOG lista 09h15 · aluno #01" … "· aluno #40" + "Zé Último · HOMOLOG lista 09h15 · aluno #41" (o
               último na ordem alfabética e o mais antigo no cadastro; telefone e CPF só dele — os outros sem telefone, CPF e e-mail).
               Todos com mensalidade de R$ 150 e a cobrança PARADA (cobranca_pausada: nenhuma cobrança, Pix ou WhatsApp) e sem
               mensagens automáticas: entram em Alunos e em Financeiro › Mensalidades.
  removidos    41 na lixeira ("· removido #NN"; só o deleted_at, como o aluno_remover) — Ferramentas › Lixeira › Alunos.
  lançamentos  41 entradas Pix ("· lanc #NN") nos últimos 28 dias (o período padrão da tela é 30) — Financeiro › Lançamentos.
  recibos      41 recibos avulsos ("· recibo #NN"), o #NN no aluno #NN (o número vem do gatilho) — Financeiro › Recibos.
  respostas    1 formulário DESATIVADO ("· formulário") + 41 respostas ("· resposta #NN") — Pré-consulta › Respostas.
  diário       41 registros nas últimas 120 h ("· diario #NN" no comentário), o #NN no aluno #NN — Dietas › Diário (padrão: 7 dias).
               Sem foto no Storage (a massa é só SQL): a miniatura fica vazia; a lista e a paginação não dependem dela.
  receitas     41 sem ingrediente ("· receita #NN") — Dietas › Receitas.
  O "#" no número: a busca das listas é por palavras (cada palavra como trecho) e "receita 15" casaria com a marca "09h15" das
  41; "receita #15" só com a #15.
  gêmeo        (B19: "não aparece aluno de outra conta") "Zé Último · HOMOLOG lista 09h15 · outra conta", com o MESMO telefone do Zé e
               outro CPF (o CPF é único entre alunos vivos — W16b), noutra conta de TESTE do staging (dono *.teste.claude, com vaga).

  --criar        limpa as sobras (pela marca) e cria a massa desta hora; imprime as contagens antes e depois e grava o estado
                 (~/projetos/physiqcalc-scratch/hml/hml14b/D/massa_staging.json) que o telas.py lê.
  --conferir     só leitura: a conta, as contagens da massa e do "fundo" (o que a conta já tinha em cada lista) e o estado de novo.
  --limpar       apaga SÓ o que tem a marca (de qualquer hora; --marca para uma só) nas tabelas acima, na conta de teste e — o gêmeo —
                 nas contas de teste; imprime antes e depois. Não depende do estado nem da prova: roda mesmo se ela falhou.
  --mostrar-sql  o SQL do --criar com ids de exemplo (não fala com o banco).
Escrita só pela trava sql_staging (todo insert/delete em staging.<tabela>; nada cita public.), pela Management API (~/.pc-pat).
Leitura com read_only. Nenhum segredo vai para a saída.

Uso: python3 e2e/hml14/massa.py --criar [--sem-gemeo] [--outra-conta <uuid>]
     python3 e2e/hml14/massa.py --conferir
     python3 e2e/hml14/massa.py --limpar [--marca "HOMOLOG lista 09h15"]
     python3 e2e/hml14/massa.py --mostrar-sql
     (outra conta de teste: --login <e-mail *.teste.claude> [--conta-id <uuid>])
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import random
import re
import secrets
import sys
from pathlib import Path

sys.dont_write_bytecode = True
AQUI = Path(__file__).resolve().parent
REPO = AQUI.parents[1]
S = "staging"
N = 41
LOGIN_PADRAO = "nutri.teste.claude@physiqnutri.app"
CHAVE_PADRAO = "nutri-legado"  # a mesma conta nas CONTAS da W5 (e2e/w05/_base.py): é com ela que o telas.py entra
SAIDA = Path.home() / "projetos" / "physiqcalc-scratch" / "hml" / "hml14b" / "D"
ESTADO = SAIDA / "massa_staging.json"
PADRAO_MARCA = "HOMOLOG lista [0-9]{2}h[0-9]{2}"  # regex do Postgres: qualquer hora
FORMATO_MARCA = re.compile(r"^HOMOLOG lista \d{2}h\d{2}$")
SUFIXO_TESTE = ".teste.claude@physiqnutri.app"
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
BRT = dt.timezone(dt.timedelta(hours=-3))
CONFIG_ALUNO = '{"mensagens_automaticas": false}'
PERGUNTAS = '[{"id": "q1", "texto": "Qual o seu objetivo?", "tipo": "texto", "max": 4, "pontos_sim": 1, "opcoes": []}]'
# o que é da massa em cada contagem (massa, fundo): o "fundo" é o que a conta já tinha na mesma lista, com o filtro padrão da tela
LINHAS = (
    ("Alunos (Ativos)", "alunos", "alunos_fundo"),
    ("Mensalidades (com mensalidade)", "alunos", "mensalidades_fundo"),
    ("Mensalidades › sem mensalidade", "mensalidades_sem", "mensalidades_sem_fundo"),
    ("Lixeira › Alunos", "removidos", "removidos_fundo"),
    ("Lançamentos (30 dias)", "lancamentos_na_janela", "lancamentos_fundo"),
    ("Recibos", "recibos", "recibos_fundo"),
    ("Pré-consulta › Respostas", "respostas", "respostas_fundo"),
    ("Dietas › Diário (7 dias)", "diario_na_janela", "diario_fundo"),
    ("Dietas › Receitas", "receitas", "receitas_fundo"),
)
DA_MASSA = ("alunos", "removidos", "lancamentos", "recibos", "respostas", "formularios", "diario", "receitas", "gemeos")


# ───────────────────────── banco ─────────────────────────
def _w02():
    """O _comum da W2 (http, ~/.pc-pat, sql_principal) — carregado só quando o banco é usado (o --help não lê nada)."""
    m = sys.modules.get("_comum")
    if m is not None and hasattr(m, "sql_mgmt"):
        return m
    espec = importlib.util.spec_from_file_location("_comum", REPO / "e2e" / "w02" / "_comum.py")
    m = importlib.util.module_from_spec(espec)
    sys.modules["_comum"] = m
    espec.loader.exec_module(m)  # type: ignore[union-attr]
    return m


def ler(sql: str) -> list[dict]:
    """SQL SÓ LEITURA (read_only da Management API: a transação recusa qualquer escrita)."""
    c = _w02()
    st, r, _ = c.http("POST", f"https://api.supabase.com/v1/projects/{c.PRINCIPAL_REF}/database/query", {"query": sql, "read_only": True},
                      {"Authorization": f"Bearer {c.pat()}"}, timeout=180)
    if st not in (200, 201):
        raise RuntimeError(f"SQL só leitura → HTTP {st}: {str(r)[:300]}")
    return r if isinstance(r, list) else []


def sql_staging(sql: str) -> list:
    """Escrita SÓ no schema staging (a trava da hml-12): todo insert/update/delete aponta para staging.<tabela> e nada cita public."""
    sem_texto = re.sub(r"\$(\w*)\$.*?\$\1\$|'(?:[^']|'')*'", "''", sql, flags=re.S)
    alvos = re.findall(r"\b(?:insert\s+into|update|delete\s+from)\s+([^\s(;]+(?:\s*\.\s*[^\s(;]+)?)", sem_texto, flags=re.I)
    if not alvos or re.search(r"\bpublic\s*\.", sem_texto, flags=re.I) or any(not re.match(r"staging\s*\.", a, flags=re.I) for a in alvos):
        raise SystemExit(f"trava: escrita fora do schema staging recusada ({alvos})")
    return _w02().sql_principal(sql)


def lit(v: object) -> str:
    """Literal do SQL (texto, número ou null)."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def uuid_ok(v: object, o_que: str) -> str:
    if not isinstance(v, str) or not UUID.match(v):
        raise SystemExit(f"{o_que} fora do formato uuid ({str(v)[:40]!r})")
    return v


def eh_email_de_teste(email: str) -> bool:
    """P26: só *.teste.claude@physiqnutri.app — e nunca as contas demo da Play (revisao.*)."""
    e = (email or "").strip().lower()
    return e.endswith(SUFIXO_TESTE) and "revisao" not in e


# ───────────────────────── a marca e os dados do Zé ─────────────────────────
def marca_agora() -> str:
    h = dt.datetime.now(BRT)
    return f"HOMOLOG lista {h.hour:02d}h{h.minute:02d}"


def padrao(marca: str | None) -> str:
    """A regex do Postgres da marca: a de uma hora (--marca) ou a de qualquer hora."""
    if marca is None:
        return PADRAO_MARCA
    if not FORMATO_MARCA.match(marca):
        raise SystemExit(f"marca fora do formato 'HOMOLOG lista 09h15': {marca!r}")
    return marca


def nome_ze(marca: str) -> str:
    return f"Zé Último · {marca} · aluno #{N:02d}"


def nome_gemeo(marca: str) -> str:
    return f"Zé Último · {marca} · outra conta"


def cpf_valido(semente: int) -> str:
    """CPF com os 2 dígitos verificadores certos (a tela pode conferir); a semente fixa deixa a massa repetível."""
    rnd = random.Random(semente)
    while True:
        base = [rnd.randint(0, 9) for _ in range(9)]
        if len(set(base)) > 1:
            break
    for n in (9, 10):
        soma = sum(d * (n + 1 - i) for i, d in enumerate(base))
        base.append((soma * 10) % 11 % 10)
    return "".join(map(str, base))


def telefone_de_teste(semente: int) -> str:
    """11 dígitos com o DDD 00 (não existe): nenhum telefone de verdade recebe nada."""
    return "009" + f"{random.Random(semente * 7 + 3).randint(0, 10**8 - 1):08d}"


def cpfs_livres(semente: int) -> tuple[str, str]:
    """2 CPFs (o do Zé e o do gêmeo) que nenhum aluno vivo do staging usa (o CPF é único entre os vivos — W16b)."""
    for k in range(20):
        a, b = cpf_valido(140_000 + semente * 31 + k), cpf_valido(150_000 + semente * 31 + k)
        if a == b:
            continue
        usados = ler(f"select {S}.normalizar_cpf(cpf) as c from {S}.pacientes where deleted_at is null "
                     f"and {S}.normalizar_cpf(cpf) in ({lit(a)}, {lit(b)})")
        if not usados:
            return a, b
    raise SystemExit("não achei 2 CPFs livres no staging em 20 tentativas")


# ───────────────────────── a conta de teste ─────────────────────────
def resolver(login: str, conta_id: str | None = None) -> dict:
    """A conta de TESTE dona da massa (só leitura): o login tem que existir (nada é criado), ser *.teste.claude, dono E nutricionista da
    conta, com Nutrição (as abas de Dietas) e a faixa "livre". Sem --conta-id: a mais antiga que cumpre tudo."""
    email = (login or "").strip().lower()
    if not eh_email_de_teste(email):
        raise SystemExit(f"não é conta de teste (*{SUFIXO_TESTE}): {email}")
    r = ler(f"select id::text as id from auth.users where lower(email) = {lit(email)}")
    if len(r) != 1:
        raise SystemExit(f"o login de teste {email} não existe no Auth — a massa não cria login (o Auth é o da produção)")
    dono = r[0]["id"]
    contas = ler(f"""
      select c.id::text as id, c.nome, c.origem, c.plano, c.faixa, c.situacao, c.dono_id::text as dono, m.papeis,
             {S}.modulos_do_plano(c.plano) as modulos,
             -- a w13_conta_travada é interna (o papel só leitura não executa): a mesma regra pela situação gravada
             (not coalesce(c.cobranca_legada, false) and c.situacao in ('vencida', 'suspensa', 'cancelada')) as travada
        from {S}.contas c join {S}.conta_membros m on m.conta_id = c.id
       where m.user_id = {lit(dono)}::uuid and m.status = 'ativo' and c.origem <> 'app'
       order by c.criado_em""")

    def serve(c: dict) -> list[str]:
        faltas = []
        if c["dono"] != dono or "dono" not in (c["papeis"] or []):
            faltas.append("não é o dono")
        if "nutricionista" not in (c["papeis"] or []):
            faltas.append("sem o papel de nutricionista")
        if "nutricao" not in (c["modulos"] or []):
            faltas.append("plano sem Nutrição")
        if c["faixa"] != "livre":
            faltas.append(f"faixa {c['faixa']} (a f10 barra o 11º aluno)")
        if c["travada"]:
            faltas.append("conta travada")
        return faltas

    if conta_id:
        uuid_ok(conta_id, "--conta-id")
        escolhida = next((c for c in contas if c["id"] == conta_id), None)
        if not escolhida:
            raise SystemExit(f"o login {email} não é membro ativo da conta {conta_id}")
    else:
        escolhida = next((c for c in contas if not serve(c)), None)
    if not escolhida or serve(escolhida):
        lista = "; ".join(f"{c['id']} {c['nome']!r} {c['origem']}/{c['plano']}/{c['faixa']} ({', '.join(serve(c)) or 'serve'})" for c in contas)
        raise SystemExit(f"nenhuma conta de {email} serve para a massa ({lista or 'nenhuma conta'})")
    return {"email": email, "dono_id": dono, "conta_id": escolhida["id"], "conta_nome": escolhida["nome"], "origem": escolhida["origem"],
            "plano": escolhida["plano"], "faixa": escolhida["faixa"], "situacao": escolhida["situacao"],
            "chave": CHAVE_PADRAO if email == LOGIN_PADRAO else None}


def outra_conta_de_teste(ctx: dict, forcar: str | None = None) -> dict | None:
    """A conta do gêmeo: OUTRA conta de teste do staging (dono *.teste.claude, não a do app), com vaga — a livre primeiro."""
    filtro = f" and c.id = {lit(uuid_ok(forcar, '--outra-conta'))}::uuid" if forcar else ""
    linhas = ler(f"""
      select c.id::text as id, c.nome, c.faixa
        from {S}.contas c join auth.users u on u.id = c.dono_id
       where c.id <> {lit(ctx['conta_id'])}::uuid and c.origem <> 'app' and c.faixa = 'livre'
         and lower(u.email) like '%.teste.claude@physiq%' and lower(u.email) <> {lit(ctx['email'])}{filtro}
       order by c.criado_em""")
    # as funções de limite e de e-mail de teste são internas (o papel só leitura não executa): só conta "livre" (sem teto)
    return linhas[0] if linhas else None


# ───────────────────────── contagens (só leitura) ─────────────────────────
def contar(ctx: dict, marca: str | None = None) -> dict:
    """A massa (com a marca) e o fundo (sem a marca, com o filtro padrão de cada tela) da conta de teste."""
    m = lit(padrao(marca))
    r = ler(f"""
      with c as (select {lit(ctx['conta_id'])}::uuid as conta, {lit(ctx['dono_id'])}::uuid as dono,
                        (now() at time zone 'America/Sao_Paulo')::date as hoje)
      select
        (select count(*) from {S}.pacientes p, c where p.conta_id = c.conta and p.deleted_at is null and p.nome ~ {m})::int as alunos,
        (select count(*) from {S}.pacientes p, c where p.conta_id = c.conta and p.deleted_at is null and p.ativo
            and p.acesso_bloqueado_em is null and p.nome !~ {m})::int as alunos_fundo,
        -- Mensalidades (prof_resumo): "com mensalidade" = vivo com mensalidade_valor > 0 (a cobrança pausada conta); o resto vai para
        -- "sem mensalidade" (a seção que abre fechada) — a massa fica toda em "com" (R$ 150, pausada)
        (select count(*) from {S}.pacientes p, c where p.conta_id = c.conta and p.deleted_at is null and coalesce(p.mensalidade_valor, 0) > 0
            and p.nome !~ {m})::int as mensalidades_fundo,
        (select count(*) from {S}.pacientes p, c where p.conta_id = c.conta and p.deleted_at is null and coalesce(p.mensalidade_valor, 0) <= 0
            and p.nome ~ {m})::int as mensalidades_sem,
        (select count(*) from {S}.pacientes p, c where p.conta_id = c.conta and p.deleted_at is null and coalesce(p.mensalidade_valor, 0) <= 0
            and p.nome !~ {m})::int as mensalidades_sem_fundo,
        (select count(*) from {S}.pacientes p, c where p.conta_id = c.conta and p.deleted_at is not null and p.nome ~ {m})::int as removidos,
        (select count(*) from {S}.pacientes p, c where p.conta_id = c.conta and p.deleted_at is not null and p.nome !~ {m})::int as removidos_fundo,
        (select count(*) from {S}.transacoes t, c where t.nutricionista_id = c.dono and t.descricao ~ {m})::int as lancamentos,
        (select count(*) from {S}.transacoes t, c where t.conta_id = c.conta and t.deleted_at is null and t.descricao ~ {m}
            and t.data between c.hoje - 29 and c.hoje)::int as lancamentos_na_janela,
        (select count(*) from {S}.transacoes t, c where (t.conta_id = c.conta or (t.conta_id is null and t.nutricionista_id = c.dono))
            and t.deleted_at is null and t.descricao !~ {m} and t.data between c.hoje - 29 and c.hoje)::int as lancamentos_fundo,
        (select count(*) from {S}.recibos r, c where r.nutricionista_id = c.dono and r.descricao ~ {m})::int as recibos,
        (select count(*) from {S}.recibos r, c where (r.conta_id = c.conta or (r.conta_id is null and r.nutricionista_id = c.dono))
            and r.deleted_at is null and r.descricao !~ {m})::int as recibos_fundo,
        (select count(*) from {S}.respostas_preconsulta x, c where x.nutricionista_id = c.dono and x.nome ~ {m})::int as respostas,
        (select count(*) from {S}.respostas_preconsulta x, c where (x.conta_id = c.conta or (x.conta_id is null and x.nutricionista_id = c.dono))
            and x.deleted_at is null and x.nome !~ {m})::int as respostas_fundo,
        (select count(*) from {S}.formularios_preconsulta f, c where f.nutricionista_id = c.dono and f.titulo ~ {m})::int as formularios,
        (select count(*) from {S}.diario_alimentar d, c where d.nutricionista_id = c.dono and d.comentario ~ {m})::int as diario,
        (select count(*) from {S}.diario_alimentar d join {S}.pacientes p on p.id = d.paciente_id, c
          where p.conta_id = c.conta and d.deleted_at is null and d.comentario ~ {m}
            and d.data_hora >= ((c.hoje - 6)::timestamp at time zone 'America/Sao_Paulo'))::int as diario_na_janela,
        (select count(*) from {S}.diario_alimentar d join {S}.pacientes p on p.id = d.paciente_id, c
          where p.conta_id = c.conta and d.deleted_at is null and d.comentario !~ {m}
            and d.data_hora >= ((c.hoje - 6)::timestamp at time zone 'America/Sao_Paulo'))::int as diario_fundo,
        (select count(*) from {S}.receitas r, c where r.nutricionista_id = c.dono and r.nome ~ {m})::int as receitas,
        (select count(*) from {S}.receitas r, c where r.nutricionista_id = c.dono and r.deleted_at is null and r.nome !~ {m})::int as receitas_fundo,
        (select count(*) from {S}.pacientes p, c where p.nome ~ {m} and p.conta_id is distinct from c.conta)::int as gemeos""")
    return r[0] if r else {}


def imprimir(rotulo: str, cont: dict) -> None:
    print(f"\n{rotulo}:")
    for nome, massa, fundo in LINHAS:
        print(f"   {nome:28s} massa {cont.get(massa, '?')!s:>3}   fundo {cont.get(fundo, '?')!s:>3}")
    print(f"   {'(com a marca, total)':28s} alunos {cont.get('alunos')} · removidos {cont.get('removidos')} · lançamentos {cont.get('lancamentos')}"
          f" · recibos {cont.get('recibos')} · respostas {cont.get('respostas')} · formulários {cont.get('formularios')}"
          f" · diário {cont.get('diario')} · receitas {cont.get('receitas')} · gêmeo noutra conta {cont.get('gemeos')}")


def massa_completa(cont: dict, gemeo: bool | None = None) -> list[str]:
    """O que falta para a massa estar inteira (vazio = completa)."""
    faltas = [f"{k} {cont.get(k)}" for k in ("alunos", "removidos", "lancamentos_na_janela", "recibos", "respostas", "diario_na_janela", "receitas")
              if cont.get(k) != N]
    if cont.get("mensalidades_sem"):  # a massa entra toda em "com mensalidade" (mensalidade_valor 150 com a cobrança pausada)
        faltas.append(f"mensalidades_sem {cont.get('mensalidades_sem')} (aluno da massa sem mensalidade)")
    if cont.get("formularios") != 1:
        faltas.append(f"formularios {cont.get('formularios')}")
    if gemeo is True and cont.get("gemeos") != 1:
        faltas.append(f"gemeos {cont.get('gemeos')}")
    return faltas


# ───────────────────────── o SQL da massa ─────────────────────────
def sql_da_massa(ctx: dict, marca: str, telefone: str, cpf: str, slug: str) -> list[tuple[str, str]]:
    """Os INSERTs da massa, em ordem (cada um numa chamada; uma falha no meio fica para o --limpar, que vai pela marca)."""
    dono, conta, mc = lit(ctx["dono_id"]), lit(ctx["conta_id"]), lit(marca)
    hoje = "(now() at time zone 'America/Sao_Paulo')::date"
    nn = "lpad(i::text, 2, '0')"
    # o aluno #NN (o #41 é o Zé): recibo e diário #NN ficam nele
    aluno_nn = (f"join {S}.pacientes p on p.conta_id = {conta}::uuid and p.deleted_at is null "
                f"and p.nome = case when i = {N} then {lit(nome_ze(marca))} else {mc} || ' · aluno #' || {nn} end")
    return [
        ("alunos 01–40", f"""
insert into {S}.pacientes (nutricionista_id, conta_id, nome, origem, ativo, mensalidade_valor, cobranca_pausada, mensalidade_desde, config,
                           created_at, updated_at)
select {dono}::uuid, {conta}::uuid, {mc} || ' · aluno #' || {nn}, 'novo', true, 150, true, now() - interval '60 days',
       {lit(CONFIG_ALUNO)}::jsonb, now() - make_interval(mins => 100 - i), now() - make_interval(mins => 100 - i)
  from generate_series(1, {N - 1}) as i"""),
        ("Zé Último (aluno 41)", f"""
insert into {S}.pacientes (nutricionista_id, conta_id, nome, telefone, cpf, origem, ativo, mensalidade_valor, cobranca_pausada,
                           mensalidade_desde, config, created_at, updated_at)
values ({dono}::uuid, {conta}::uuid, {lit(nome_ze(marca))}, {lit(telefone)}, {lit(cpf)}, 'novo', true, 150, true, now() - interval '60 days',
        {lit(CONFIG_ALUNO)}::jsonb, now() - interval '200 minutes', now() - interval '200 minutes')"""),
        ("removidos 01–41 (lixeira)", f"""
insert into {S}.pacientes (nutricionista_id, conta_id, nome, origem, ativo, config, created_at, updated_at, deleted_at)
select {dono}::uuid, {conta}::uuid, {mc} || ' · removido #' || {nn}, 'novo', true, {lit(CONFIG_ALUNO)}::jsonb,
       now() - interval '2 days', now() - make_interval(mins => i), now() - make_interval(mins => i)
  from generate_series(1, {N}) as i"""),
        ("lançamentos 01–41", f"""
insert into {S}.transacoes (nutricionista_id, conta_id, tipo, descricao, metodo, valor, data, created_at, updated_at)
select {dono}::uuid, {conta}::uuid, 'entrada', {mc} || ' · lanc #' || {nn}, 'pix', 10 + i, {hoje} - ((i - 1) * 27 / 40),
       now() - make_interval(mins => i), now() - make_interval(mins => i)
  from generate_series(1, {N}) as i"""),
        ("recibos 01–41", f"""
insert into {S}.recibos (nutricionista_id, conta_id, paciente_id, valor, data, descricao, texto, created_at, updated_at)
select {dono}::uuid, {conta}::uuid, p.id, 20 + i, {hoje} - ((i - 1) * 27 / 40), {mc} || ' · recibo #' || {nn},
       'Recibo de teste da hml-14b (' || {mc} || '), apagado no fim.', now() - make_interval(mins => i), now() - make_interval(mins => i)
  from generate_series(1, {N}) as i
  {aluno_nn}"""),
        ("formulário (desativado)", f"""
insert into {S}.formularios_preconsulta (nutricionista_id, conta_id, titulo, descricao, origem, slug, perguntas, faixas, ativo)
values ({dono}::uuid, {conta}::uuid, {mc} || ' · formulário', 'Formulário de teste da hml-14b (apagado no fim).', 'personalizado',
        {lit(slug)}, {lit(PERGUNTAS)}::jsonb, '[]'::jsonb, false)"""),
        ("respostas 01–41", f"""
insert into {S}.respostas_preconsulta (nutricionista_id, formulario_id, conta_id, titulo, perguntas, respostas, nome, email, telefone,
                                       respondido_em, created_at, updated_at)
select {dono}::uuid, f.id, {conta}::uuid, f.titulo, f.perguntas, '{{"q1": "Teste"}}'::jsonb, {mc} || ' · resposta #' || {nn}, '', '',
       now() - make_interval(mins => 10 * i), now() - make_interval(mins => 10 * i), now() - make_interval(mins => 10 * i)
  from generate_series(1, {N}) as i
  join (select id, titulo, perguntas from {S}.formularios_preconsulta
         where nutricionista_id = {dono}::uuid and titulo = {mc} || ' · formulário' order by created_at desc limit 1) f on true"""),
        ("diário 01–41", f"""
insert into {S}.diario_alimentar (nutricionista_id, paciente_id, data_hora, refeicao, path, mime, tamanho, comentario, created_at, updated_at)
select {dono}::uuid, p.id, now() - make_interval(hours => 3 * (i - 1)) - interval '2 minutes',
       (array['cafe_manha', 'lanche_manha', 'almoco', 'lanche_tarde', 'jantar', 'ceia', 'outro'])[1 + (i % 7)],
       {dono} || '/' || p.id::text || '/hml14b-' || gen_random_uuid()::text || '.jpg', 'image/jpeg', 2048,
       {mc} || ' · diario #' || {nn}, now() - make_interval(mins => i), now() - make_interval(mins => i)
  from generate_series(1, {N}) as i
  {aluno_nn}"""),
        ("receitas 01–41", f"""
insert into {S}.receitas (nutricionista_id, nome, porcoes, observacao, created_at, updated_at)
select {dono}::uuid, {mc} || ' · receita #' || {nn}, 1, 'Receita de teste da hml-14b, apagada no fim.',
       now() - make_interval(mins => i), now() - make_interval(mins => i)
  from generate_series(1, {N}) as i"""),
    ]


def sql_do_gemeo(outra: str, marca: str, telefone: str, cpf: str) -> str:
    return f"""
insert into {S}.pacientes (conta_id, nome, telefone, cpf, origem, ativo, config)
values ({lit(outra)}::uuid, {lit(nome_gemeo(marca))}, {lit(telefone)}, {lit(cpf)}, 'novo', true, {lit(CONFIG_ALUNO)}::jsonb)"""


def sql_da_limpeza(ctx: dict, marca: str | None) -> list[tuple[str, str]]:
    """Os DELETEs pela marca, na ordem das chaves (os filhos antes dos alunos). Só a conta/o dono de teste; o gêmeo, só nas contas de
    teste (dono *.teste.claude)."""
    dono, conta, m = lit(ctx["dono_id"]), lit(ctx["conta_id"]), lit(padrao(marca))
    return [
        ("diário", f"delete from {S}.diario_alimentar where nutricionista_id = {dono}::uuid and comentario ~ {m}"),
        ("recibos", f"delete from {S}.recibos where nutricionista_id = {dono}::uuid and descricao ~ {m}"),
        ("lançamentos", f"delete from {S}.transacoes where nutricionista_id = {dono}::uuid and descricao ~ {m}"),
        ("respostas", f"delete from {S}.respostas_preconsulta where nutricionista_id = {dono}::uuid and nome ~ {m}"),
        ("formulários", f"delete from {S}.formularios_preconsulta where nutricionista_id = {dono}::uuid and titulo ~ {m}"),
        ("receitas", f"delete from {S}.receitas where nutricionista_id = {dono}::uuid and nome ~ {m}"),
        ("alunos e removidos", f"delete from {S}.pacientes where conta_id = {conta}::uuid and nome ~ {m}"),
        ("gêmeo (contas de teste)", f"""delete from {S}.pacientes p where p.nome ~ {m} and p.conta_id in (
            select c.id from {S}.contas c join auth.users u on u.id = c.dono_id
             where {S}.email_de_teste(u.email) and lower(u.email) like '%.teste.claude@physiq%')"""),
    ]


# ───────────────────────── estado (o que o telas.py lê) ─────────────────────────
def estado_do_banco(ctx: dict, marca: str, telefone: str | None = None, cpf: str | None = None) -> dict:
    """Os ids da massa de uma marca (só leitura): os alunos por NN (o #41 é o Zé; o diário #NN é o do aluno #NN), os removidos, o Zé e o
    gêmeo. Telefone e CPF são os do Zé de teste (DDD 00, CPF gerado)."""
    m = lit(padrao(marca))
    linhas = ler(f"""select p.id::text as id, p.nome, p.telefone, p.cpf, p.deleted_at is not null as removido, p.conta_id::text as conta
                       from {S}.pacientes p where p.nome ~ {m}""")
    alunos: dict[str, str] = {}
    removidos: dict[str, str] = {}
    ze = gemeo = None
    for x in linhas:
        nn = re.search(r"· (?:aluno|removido) #(\d{2})$", x["nome"] or "")
        if x["conta"] != ctx["conta_id"]:
            if x["nome"] == nome_gemeo(marca) and not x["removido"]:
                gemeo = {"id": x["id"], "conta_id": x["conta"], "cpf": x["cpf"], "telefone": x["telefone"]}
            continue
        if x["removido"] and nn:
            removidos[nn.group(1)] = x["id"]
        elif nn:
            alunos[nn.group(1)] = x["id"]
            if x["nome"] == nome_ze(marca):
                ze = {"id": x["id"], "nome": x["nome"], "telefone": x["telefone"] or telefone, "cpf": x["cpf"] or cpf}
    return {"versao": 1, "marca": marca, "schema": S, "lido_em": dt.datetime.now(BRT).isoformat(timespec="seconds"),
            "login": ctx["email"], "chave": ctx.get("chave"), "dono_id": ctx["dono_id"], "conta_id": ctx["conta_id"],
            "conta_nome": ctx["conta_nome"], "ze": ze, "gemeo": gemeo, "alunos": dict(sorted(alunos.items())),
            "removidos": dict(sorted(removidos.items()))}


def salvar_estado(estado: dict, arquivo: Path = ESTADO) -> Path:
    arquivo.parent.mkdir(parents=True, exist_ok=True)
    arquivo.write_text(json.dumps(estado, ensure_ascii=False, indent=2), encoding="utf-8")
    return arquivo


def ler_estado(arquivo: Path | str = ESTADO) -> dict | None:
    try:
        return json.loads(Path(arquivo).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def contexto_do_estado(estado: dict) -> dict:
    return {"email": estado["login"], "dono_id": estado["dono_id"], "conta_id": estado["conta_id"], "conta_nome": estado.get("conta_nome"),
            "chave": estado.get("chave")}


# ───────────────────────── criar / limpar / conferir ─────────────────────────
def limpar(ctx: dict, marca: str | None = None, mostrar: bool = True) -> bool:
    antes = contar(ctx, marca)
    if mostrar:
        imprimir(f"antes da limpeza ({marca or 'qualquer hora'})", antes)
    falhas = []
    for rotulo, sql in sql_da_limpeza(ctx, marca):
        try:
            sql_staging(sql)
        except Exception as e:  # noqa: BLE001 — uma tabela que falha não impede as outras
            falhas.append(f"{rotulo}: {str(e)[:160]}")
    depois = contar(ctx, marca)
    if mostrar:
        imprimir("depois da limpeza", depois)
    sobra = {k: depois.get(k) for k in DA_MASSA if depois.get(k)}
    for f in falhas:
        print(f"   ❌ {f}")
    print(("✅ limpo: nada com a marca" if not sobra and not falhas else f"❌ sobrou com a marca: {sobra}") + f" ({marca or 'qualquer hora'})")
    return not sobra and not falhas


def criar(ctx: dict, gemeo: bool = True, outra_conta: str | None = None, marca: str | None = None, arquivo: Path = ESTADO) -> dict | None:
    print(f"conta de teste: {ctx['conta_nome']!r} ({ctx['conta_id']}) · {ctx['origem']}/{ctx['plano']}/faixa {ctx['faixa']}/{ctx['situacao']}"
          f" · dono {ctx['email']}")
    antes = contar(ctx)
    imprimir("antes (qualquer hora)", antes)
    if any(antes.get(k) for k in DA_MASSA):
        print("\nsobras de uma rodada anterior (pela marca): limpando antes de criar")
        if not limpar(ctx, None, mostrar=False):
            raise SystemExit("a limpeza das sobras falhou — nada foi criado")
    marca = marca or marca_agora()
    padrao(marca)
    semente = int(re.sub(r"\D", "", marca))
    telefone = telefone_de_teste(semente)
    cpf_ze, cpf_gemeo = cpfs_livres(semente)
    print(f"\nmarca: {marca!r}")
    for rotulo, sql in sql_da_massa(ctx, marca, telefone, cpf_ze, f"hml14b-{secrets.token_hex(5)}"):
        sql_staging(sql)
        print(f"   ✅ {rotulo}")
    tem_gemeo = False
    if gemeo:
        outra = outra_conta_de_teste(ctx, outra_conta)
        if outra:
            sql_staging(sql_do_gemeo(outra["id"], marca, telefone, cpf_gemeo))
            tem_gemeo = True
            print(f"   ✅ gêmeo na conta de teste {outra['nome']!r} ({outra['id']}, faixa {outra['faixa']})")
        else:
            print("   ⚠️ nenhuma outra conta de teste com vaga: sem o gêmeo (o B19 confere a outra conta só pelos ids)")
    depois = contar(ctx, marca)
    imprimir("depois", depois)
    estado = estado_do_banco(ctx, marca, telefone, cpf_ze)
    estado["contagens"] = depois
    print(f"\nestado: {salvar_estado(estado, arquivo)}")
    faltas = massa_completa(depois, tem_gemeo)
    print("✅ massa completa (41 em cada lista)" if not faltas else f"❌ massa incompleta: {faltas}")
    return estado if not faltas else None


def conferir(ctx: dict, arquivo: Path = ESTADO) -> bool:
    print(f"conta de teste: {ctx['conta_nome']!r} ({ctx['conta_id']}) · {ctx['origem']}/{ctx['plano']}/faixa {ctx['faixa']}/{ctx['situacao']}"
          f" · dono {ctx['email']}")
    marcas = [x["m"] for x in ler(f"""select distinct substring(p.nome from {lit(PADRAO_MARCA)}) as m from {S}.pacientes p
                                       where p.conta_id = {lit(ctx['conta_id'])}::uuid and p.nome ~ {lit(PADRAO_MARCA)} order by 1""")]
    if not marcas:
        imprimir("sem massa (fundo da conta)", contar(ctx))
        print("❌ nenhuma massa no staging: rode --criar")
        return False
    if len(marcas) > 1:
        print(f"⚠️ mais de uma marca na conta ({marcas}): vale a última; --limpar tira todas")
    marca = marcas[-1]
    cont = contar(ctx, marca)
    imprimir(f"massa {marca!r}", cont)
    estado = estado_do_banco(ctx, marca)
    estado["contagens"] = cont
    print(f"Zé Último: {'ok' if estado['ze'] else 'NÃO ACHADO'} · gêmeo noutra conta: {'ok' if estado['gemeo'] else 'não tem'}")
    print(f"estado: {salvar_estado(estado, arquivo)}")
    faltas = massa_completa(cont, bool(estado["gemeo"]))
    if not estado["ze"]:
        faltas.append("Zé Último")
    print("✅ massa completa (41 em cada lista)" if not faltas else f"❌ massa incompleta: {faltas}")
    return not faltas


def mostrar_sql(marca: str | None) -> None:
    """O SQL do --criar com ids de exemplo — para ler antes de rodar (não fala com o banco)."""
    ctx = {"email": LOGIN_PADRAO, "dono_id": "00000000-0000-4000-8000-0000000000d0", "conta_id": "00000000-0000-4000-8000-0000000000c0"}
    marca = marca or marca_agora()
    for rotulo, sql in sql_da_massa(ctx, marca, telefone_de_teste(915), "52998224725", "hml14b-exemplo"):
        print(f"-- {rotulo}{sql};\n")
    print(f"-- gêmeo (outra conta de teste){sql_do_gemeo('00000000-0000-4000-8000-0000000000e0', marca, telefone_de_teste(915), '11144477735')};\n")
    for rotulo, sql in sql_da_limpeza(ctx, marca):
        print(f"-- limpar: {rotulo}\n{sql};\n")


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-14b — massa das listas paginadas no STAGING (só SQL no schema staging; detalhes no topo)")
    acao = ap.add_mutually_exclusive_group(required=True)
    acao.add_argument("--criar", action="store_true", help="limpa as sobras (pela marca) e cria a massa desta hora; grava o estado")
    acao.add_argument("--conferir", action="store_true", help="só leitura: contagens da massa e do fundo + o estado de novo")
    acao.add_argument("--limpar", action="store_true", help="apaga só o que tem a marca (qualquer hora; --marca para uma só)")
    acao.add_argument("--mostrar-sql", action="store_true", help="imprime o SQL do --criar com ids de exemplo (sem banco)")
    ap.add_argument("--login", default=LOGIN_PADRAO, help=f"e-mail da conta de teste dona da massa (padrão: {LOGIN_PADRAO} = {CHAVE_PADRAO})")
    ap.add_argument("--conta-id", help="a conta (uuid) quando o login tem mais de uma que serve")
    ap.add_argument("--marca", help='só esta marca no --limpar (ex.: "HOMOLOG lista 09h15"); no --criar, a marca em vez da hora de agora')
    ap.add_argument("--sem-gemeo", action="store_true", help="--criar sem o aluno gêmeo noutra conta de teste")
    ap.add_argument("--outra-conta", help="--criar: a conta de teste (uuid) do gêmeo (padrão: a 1ª conta de teste com vaga, a livre primeiro)")
    ap.add_argument("--estado", default=str(ESTADO), help=f"arquivo do estado (padrão: {ESTADO})")
    a = ap.parse_args()
    if a.mostrar_sql:
        mostrar_sql(a.marca)
        return 0
    arquivo = Path(a.estado)
    if a.limpar:
        try:
            ctx = resolver(a.login, a.conta_id)
        except SystemExit as e:
            estado = ler_estado(arquivo)
            if not estado:
                raise
            print(f"⚠️ {e} — limpando pela conta do estado ({estado['conta_id']})")
            ctx = contexto_do_estado(estado)
        return 0 if limpar(ctx, a.marca) else 1
    ctx = resolver(a.login, a.conta_id)
    if a.conferir:
        return 0 if conferir(ctx, arquivo) else 1
    return 0 if criar(ctx, gemeo=not a.sem_gemeo, outra_conta=a.outra_conta, marca=a.marca, arquivo=arquivo) else 1


if __name__ == "__main__":
    sys.exit(main())
