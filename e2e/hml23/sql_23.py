#!/usr/bin/env python3
"""Physiq hml-23 (H-115) — quem tem 2+ matrículas vivas: as leituras do aluno pelo RLS olham o CONJUNTO das matrículas vivas (a migration
20261014230000_hml23_matriculas_conjunto; contrato §4). O molde do e2e/wa/sql_wa.py: cada caso é UM bloco que termina com erro de
propósito (nada fica gravado) e devolve o resultado na mensagem. "Como o app" = o papel authenticated com o sub de uma conta de TESTE da
hml-17 (w5p-aluna, w5p-nutri, w7b-sozinho, w13-dono, w27-master pela claim). A aluna vai com o claim do login de aluno criado pelo
profissional (app_metadata.role = 'paciente', w08b/W34 — é ele que liga as policies de alimentos e medidas_caseiras; só no JWT simulado,
nada no Auth). A massa de cada caso nasce DENTRO do bloco e volta junto: a 2ª matrícula B da aluna (na conta do w13-dono, nutricionista =
o w13-dono) com 1 linha em cada uma das 13 tabelas e 1 alimento próprio da nutri dela (com 1 medida caseira).
"Esperado" = o ramo do aluno das 15 policies (o texto do contrato §1.2) com as matrículas e as nutricionistas escritas por extenso,
contado como postgres (sem RLS); o RLS = count(*) como o app. Saída sem dado pessoal: só contagens, códigos e booleanos.
Matriz:
  M1 1 matrícula (A)                → o RLS = o ramo com A, nas 15
  M2 2 vivas (A + B)                → o RLS = o ramo com A + B, 20× com seq scan forçado e update HOT da A entre as vezes (a ordem física
                                      muda: o "limit 1" de antes pega ora A, ora B); a B soma linha nas 15; a escalar fica na 1ª ativa (A) e,
                                      com a A encerrada, na B; o conjunto segue A + B (a encerrada entra)
  M3 1 viva + 1 apagada             → só a viva
  M4 login banido                   → nada (e as 2 portas recusam) — SÓ no local: no staging seria escrita no Auth compartilhado
  M5 outra pessoa (w7b-sozinho)     → nada da A/B
  M6 visitante                      → 42501 nas 15 tabelas, nas 2 funções novas e nas escalares
  M7 profissional e master          → o ramo do aluno vazio pela escalar e pelo conjunto (as contagens de antes) + as contagens do RLS
  M8 membro da conta e aluno de 2   → pode_ler_comprovante das cobranças das 2 contas = true; financeiro_recibos, _resumo_periodo
                                      (cobranças pagas) e _lancamentos (o aluno visível) com as linhas das 2
  M9 as 2 portas com 2 vivas        → paciente_marcar_refeicao (a refeição de cada matrícula fica na matrícula dela) e rotina_salvar = hoje
  K1–K4 catálogo (só leitura; vale no public): o pg_depend 13/2/0 com os nomes; as 2 novas; as escalares com a ordem; os corpos
Uso: python3 e2e/hml23/sql_23.py [--casos M1,M2] [--contagens <arquivo.json>]   (staging; o M4 só no local)
     python3 e2e/hml23/sql_23.py --so-catalogo --schema staging|public            (só leitura)
     python3 e2e/hml23/sql_23.py --seco                                           (monta os blocos; NADA vai ao banco)
--contagens: a 1ª rodada guarda as contagens do RLS do M1 e do M7 (aluna, nutri, master) no arquivo; a seguinte compara (a rodada de
antes da migration × a de depois). Antes da migration o M2 fica ❌ (o vermelho), com o M6 (as 2 novas não existem), o M8 e o catálogo.
Ensaio local: PHYSIQ_SQL_LOCAL=<pasta do socket> (hml23/ferramentas/local_23.py).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "wa"))
import _base as B  # noqa: E402

P = B.C.C2.Placar()
E = B.CONTAS
MARCA = "HML23 E2E"
SCHEMA = {"s": "staging"}
TABELAS = ("pacientes", "planos_alimentares", "refeicoes", "itens_refeicao", "orientacoes", "metas", "agendamentos", "recibos",
           "diario_alimentar", "cobrancas", "refeicoes_concluidas", "metas_concluidas", "aluno_assinaturas", "alimentos", "medidas_caseiras")
COM_LIXEIRA = ("planos_alimentares", "orientacoes", "metas", "agendamentos", "recibos", "diario_alimentar", "cobrancas")
SEM_LIXEIRA = ("refeicoes_concluidas", "metas_concluidas", "aluno_assinaturas")
POLICIES = {  # tabela → (nome, a função nova que lê)
    "pacientes": ("paciente: ler o proprio", "meus_pacientes_ids"),
    "planos_alimentares": ("paciente: ler os proprios planos", "meus_pacientes_ids"),
    "refeicoes": ("paciente: ler as refeicoes do proprio plano", "meus_pacientes_ids"),
    "itens_refeicao": ("paciente: ler os itens do proprio plano", "meus_pacientes_ids"),
    "orientacoes": ("paciente: ler as proprias orientacoes", "meus_pacientes_ids"),
    "metas": ("paciente: ler as proprias metas", "meus_pacientes_ids"),
    "agendamentos": ("paciente: ler os proprios agendamentos", "meus_pacientes_ids"),
    "recibos": ("paciente: ler os proprios recibos", "meus_pacientes_ids"),
    "diario_alimentar": ("paciente: ler o proprio diario", "meus_pacientes_ids"),
    "cobrancas": ("paciente: ler as proprias cobrancas", "meus_pacientes_ids"),
    "refeicoes_concluidas": ("paciente: ler as proprias refeicoes concluidas", "meus_pacientes_ids"),
    "metas_concluidas": ("metas_concluidas: aluno le as proprias", "meus_pacientes_ids"),
    "aluno_assinaturas": ("aluno_assinaturas: aluno le a propria", "meus_pacientes_ids"),
    "alimentos": ("paciente: ler taco e os alimentos da sua nutricionista", "minhas_nutricionistas_ids"),
    "medidas_caseiras": ("paciente: ler as medidas dos alimentos visiveis", "minhas_nutricionistas_ids"),
}


def S() -> str:
    return SCHEMA["s"]


# ───────────────────────── os pedaços dos blocos ─────────────────────────
def como(uid: str, papel: str | None = None) -> str:
    """Daqui em diante o bloco roda como o app (authenticated) com o sub de `uid` e, se dado, o app_metadata.role."""
    meta = f", 'app_metadata', json_build_object('role', '{papel}')" if papel else ""
    return (f"  perform set_config('request.jwt.claims', json_build_object('sub', {uid}, 'role', 'authenticated'{meta})::text, true);\n"
            "  perform set_config('role', 'authenticated', true);\n")


def claims(uid: str, papel: str | None = None) -> str:
    """Só o JWT (o papel segue postgres, sem RLS): as funções leem o auth.uid() de `uid`."""
    meta = f", 'app_metadata', json_build_object('role', '{papel}')" if papel else ""
    return f"  perform set_config('request.jwt.claims', json_build_object('sub', {uid}, 'role', 'authenticated'{meta})::text, true);\n"


ALUNA = como("v_aluna", "paciente")
VISITANTE = "  perform set_config('request.jwt.claims', '', true);\n  perform set_config('role', 'anon', true);\n"
VOLTA = "  perform set_config('role', 'postgres', true);\n  perform set_config('request.jwt.claims', '', true);\n"
SEM_CLAIMS = "  perform set_config('request.jwt.claims', '', true);\n"


def res(**kv: str) -> str:
    """v_res ganha as chaves (cada valor é uma expressão SQL)."""
    return "  v_res := v_res || jsonb_build_object(" + ", ".join(f"'{k}', {v}" for k, v in kv.items()) + ");\n"


def negado(chave: str, sql: str) -> str:
    """O comando num sub-bloco: 'negado' (42501), 'nao_existe' (42883/42P01) ou 'passou'."""
    return (f"  begin\n    {sql}\n    v_res := v_res || jsonb_build_object('{chave}', 'passou');\n"
            f"  exception when insufficient_privilege then\n    v_res := v_res || jsonb_build_object('{chave}', 'negado');\n"
            f"  when undefined_function or undefined_table then\n    v_res := v_res || jsonb_build_object('{chave}', 'nao_existe');\n  end;\n")


def existe(f: str) -> str:
    return f"(to_regprocedure('{S()}.{f}()') is not null)"


def se_existe(f: str, **kv: str) -> str:
    """As chaves só com a função `f` no banco (antes da migration: 'nao_existe'). Num if, e não num case: o PL/pgSQL só prepara o
    comando do ramo que roda — no case, a função que não existe dá erro na preparação."""
    return (f"  if {existe(f)} then\n  " + res(**kv) + "  else\n  " + res(**{c: "'nao_existe'" for c in kv}) + "  end if;\n")


def ramo(t: str, ids: str, nutris: str, paciente: str = "true", lixeira: bool = True) -> str:
    """O ramo do aluno da policy de `t` (alias x) com `ids` (uuid[]) e `nutris` (uuid[]) explícitos; `paciente` = o eh_paciente() do
    claim. lixeira=False: qualquer linha da matrícula (o "nada da A/B" do M5; sem a TACO)."""
    s = S()
    viva = " and x.deleted_at is null" if lixeira else ""
    pviva = " and p.deleted_at is null" if lixeira else ""
    if t == "pacientes":
        return f"x.id = any ({ids})"
    if t in COM_LIXEIRA:
        return f"x.paciente_id = any ({ids}){viva}"
    if t in SEM_LIXEIRA:
        return f"x.paciente_id = any ({ids})"
    if t == "refeicoes":
        return f"exists (select 1 from {s}.planos_alimentares p where p.id = x.plano_id and p.paciente_id = any ({ids}){pviva})"
    if t == "itens_refeicao":
        return (f"exists (select 1 from {s}.refeicoes r join {s}.planos_alimentares p on p.id = r.plano_id "
                f"where r.id = x.refeicao_id and p.paciente_id = any ({ids}){pviva})")
    taco = "x.fonte = 'taco' or " if lixeira else ""
    ataco = "a.fonte = 'taco' or " if lixeira else ""
    if t == "alimentos":
        return f"{paciente} and ({taco}x.nutricionista_id = any ({nutris}))"
    if t == "medidas_caseiras":
        return f"{paciente} and exists (select 1 from {s}.alimentos a where a.id = x.alimento_id and ({ataco}a.nutricionista_id = any ({nutris})))"
    raise ValueError(t)


def contagens(onde=None) -> str:
    """jsonb {tabela: count(*)} — onde(t) = o filtro (alias x); sem filtro = o que o papel atual lê (o RLS, como o app)."""
    partes = []
    for t in TABELAS:
        w = f" where {onde(t)}" if onde else ""
        partes.append(f"'{t}', (select count(*) from {S()}.{t} x{w})")
    return "jsonb_build_object(" + ", ".join(partes) + ")"


def difs(a: str, b: str) -> str:
    """As tabelas em que os 2 jsonb de contagens diferem (lista ordenada; [] = iguais)."""
    return f"(select coalesce(jsonb_agg(e.key order by e.key), '[]'::jsonb) from jsonb_each({a}) e where ({b}) -> e.key is distinct from e.value)"


def esperado(ids: str, nutris: str) -> str:
    return contagens(lambda t: ramo(t, ids, nutris))


def criar_b(apagada: bool = False) -> str:
    """A 2ª matrícula B da aluna (conta do w13-dono; a nutricionista dela = o w13-dono) com 1 linha em cada tabela e 1 alimento próprio
    da nutri dela (com 1 medida caseira; é o alimento do item do plano da B)."""
    s, m = S(), MARCA
    morta = ", now()" if apagada else ", null"
    return (
        f"  insert into {s}.pacientes (conta_id, user_id, personal_id, nutricionista_id, nome, deleted_at) values (v_conta_b, v_aluna, v_dono_b, "
        f"v_dono_b, '{m} B'{morta}) returning id into v_pac_b;\n"
        f"  insert into {s}.planos_alimentares (nutricionista_id, paciente_id, titulo) values (v_dono_b, v_pac_b, '{m}') returning id into v_plano_b;\n"
        f"  insert into {s}.refeicoes (plano_id, nome) values (v_plano_b, '{m}') returning id into v_ref_b;\n"
        f"  insert into {s}.alimentos (fonte, nutricionista_id, nome, energia_kcal) values ('proprio', v_dono_b, '{m} da nutri da B', 100) "
        "returning id into v_alim_b;\n"
        f"  insert into {s}.medidas_caseiras (alimento_id, descricao, gramas) values (v_alim_b, '{m}', 10);\n"
        f"  insert into {s}.itens_refeicao (refeicao_id, alimento_id, quantidade_g) values (v_ref_b, v_alim_b, 100);\n"
        f"  insert into {s}.orientacoes (nutricionista_id, paciente_id, titulo) values (v_dono_b, v_pac_b, '{m}');\n"
        f"  insert into {s}.metas (nutricionista_id, paciente_id, titulo, dias_semana) values (v_dono_b, v_pac_b, '{m}', '{{1}}') "
        "returning id into v_meta_b;\n"
        f"  insert into {s}.calendarios (nutricionista_id, nome) values (v_dono_b, '{m}') returning id into v_cal_b;\n"
        f"  insert into {s}.agendamentos (nutricionista_id, calendario_id, paciente_id, titulo, inicio, fim) values (v_dono_b, v_cal_b, v_pac_b, "
        f"'{m}', now() + interval '30 days', now() + interval '30 days 1 hour');\n"
        f"  insert into {s}.recibos (nutricionista_id, paciente_id, valor, descricao, texto) values (v_dono_b, v_pac_b, 10, '{m}', '{m}');\n"
        f"  insert into {s}.diario_alimentar (nutricionista_id, paciente_id, refeicao, path, mime, tamanho) values (v_dono_b, v_pac_b, 'almoco', "
        "'hml23-e2e/' || gen_random_uuid()::text || '.jpg', 'image/jpeg', 1);\n"
        f"  insert into {s}.cobrancas (nutricionista_id, paciente_id, conta_id, descricao, valor, vencimento, criado_por, comprovante_path) values "
        f"(v_dono_b, v_pac_b, v_conta_b, '{m}', 10, v_hoje + 30, v_dono_b, 'hml23-e2e/b-' || gen_random_uuid()::text) "
        "returning comprovante_path into v_path_b;\n"
        f"  insert into {s}.refeicoes_concluidas (nutricionista_id, paciente_id, refeicao_id, data) values (v_dono_b, v_pac_b, v_ref_b, v_hoje);\n"
        f"  insert into {s}.metas_concluidas (paciente_id, meta_id, data) values (v_pac_b, v_meta_b, v_hoje);\n"
        f"  insert into {s}.aluno_assinaturas (paciente_id, conta_id) values (v_pac_b, v_conta_b);\n")


def bloco_sql(corpo: str) -> str:
    s = S()
    return f"""do $t$
declare
  v_nutri uuid; v_personal uuid; v_aluna uuid; v_sozinho uuid; v_dono_b uuid; v_master uuid;
  v_conta_a uuid; v_conta_b uuid; v_pac_a uuid; v_pac_a2 uuid; v_pac_b uuid; v_vivas integer;
  v_plano_a uuid; v_ref_a uuid; v_plano_b uuid; v_ref_b uuid; v_meta_b uuid; v_alim_b uuid; v_cal_b uuid; v_path_a text; v_path_a2 text; v_path_b text;
  v_taco uuid; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_e jsonb; v_e1 jsonb; v_c jsonb; v_j jsonb; v_x text; v_n integer; v_k integer; v_b boolean; v_res jsonb := '{{}}'::jsonb;
begin
  select u.id into v_nutri from auth.users u where lower(u.email) = '{E["w5p-nutri"]}';
  select u.id into v_personal from auth.users u where lower(u.email) = '{E["w5p-personal"]}';
  select u.id into v_aluna from auth.users u where lower(u.email) = '{E["w5p-aluna"]}';
  select u.id into v_sozinho from auth.users u where lower(u.email) = '{E["w7b-sozinho"]}';
  select u.id into v_dono_b from auth.users u where lower(u.email) = '{E["w13-dono"]}';
  select u.id into v_master from auth.users u where lower(u.email) = '{E["w27-master"]}';
  select p.id, p.conta_id into v_pac_a, v_conta_a from {s}.pacientes p join {s}.contas c on c.id = p.conta_id
   where p.user_id = v_aluna and p.deleted_at is null and c.origem <> 'app' and p.nutricionista_id = v_nutri
   order by p.created_at limit 1;
  select c.id into v_conta_b from {s}.contas c
   where c.dono_id = v_dono_b and c.origem <> 'app' and c.id is distinct from v_conta_a order by c.criado_em limit 1;
  select a.id into v_taco from {s}.alimentos a where a.fonte = 'taco' and a.deleted_at is null order by a.codigo limit 1;
  select count(*) into v_vivas from {s}.pacientes p where p.user_id = v_aluna and p.deleted_at is null;
  if v_nutri is null or v_personal is null or v_aluna is null or v_sozinho is null or v_dono_b is null or v_master is null
     or v_pac_a is null or v_conta_b is null or v_taco is null or v_vivas <> 1 then
    raise exception 'RESULTADO<<%>>', jsonb_build_object('erro', 'massa de TESTE fora do ponto de partida', 'falta', jsonb_strip_nulls(jsonb_build_object(
      'nutri', v_nutri is null, 'personal', v_personal is null, 'aluna', v_aluna is null, 'sozinho', v_sozinho is null,
      'dono_b', v_dono_b is null, 'master', v_master is null, 'matricula_a', v_pac_a is null, 'conta_b', v_conta_b is null,
      'taco', v_taco is null)), 'vivas_da_aluna', v_vivas)::text;
  end if;
  -- uma refeição da A com 1 item da TACO (o plano favorito mais recente da A; sem plano, um novo)
  select pl.id into v_plano_a from {s}.planos_alimentares pl where pl.paciente_id = v_pac_a and pl.deleted_at is null
   order by pl.favorito desc, pl.created_at desc, pl.id limit 1;
  if v_plano_a is null then
    insert into {s}.planos_alimentares (nutricionista_id, paciente_id, titulo, favorito) values (v_nutri, v_pac_a, '{MARCA} plano', true)
    returning id into v_plano_a;
  end if;
  insert into {s}.refeicoes (plano_id, nome, horario, ordem) values (v_plano_a, '{MARCA} refeição', '19:30', 99) returning id into v_ref_a;
  insert into {s}.itens_refeicao (refeicao_id, alimento_id, quantidade_g, ordem) values (v_ref_a, v_taco, 100, 0);
{corpo}
  raise exception 'RESULTADO<<%>>', v_res::text;
end $t$;"""


# ───────────────────────── os casos ─────────────────────────
def casos() -> dict[str, tuple[str, dict]]:
    """id → (corpo do bloco, o resultado esperado). Chaves com "_" na frente = informação (as contagens), fora da comparação."""
    s = S()
    so_a = ("array[v_pac_a]", "array[v_nutri]")
    a_b = ("array[v_pac_a, v_pac_b]", "array[v_nutri, v_dono_b]")
    k: dict[str, tuple[str, dict]] = {}

    # M1 — 1 matrícula: o RLS = o ramo com A, nas 15
    k["M1"] = ("  v_e := " + esperado(*so_a) + ";\n" + ALUNA + "  v_c := " + contagens() + ";\n" + VOLTA
               + res(difs=difs("v_e", "v_c"), _n="v_c"),
               {"difs": []})

    # M2 — 2 vivas, 20× com seq scan forçado e o update HOT da A entre as vezes
    m2 = (criar_b()
          + "  v_e := " + esperado(*a_b) + ";\n  v_e1 := " + esperado(*so_a) + ";\n"
          + res(b_soma=f"(select coalesce(jsonb_agg(e.key order by e.key), '[]'::jsonb) from jsonb_each(v_e) e "
                       "where (e.value)::int <= (v_e1 ->> e.key)::int)")
          + "  perform set_config('enable_indexscan', 'off', true);\n  perform set_config('enable_bitmapscan', 'off', true);\n"
          + "  v_n := 0; v_k := 0;\n  for v_x in select g::text from generate_series(1, 20) g loop\n"
          + ALUNA
          + "    v_c := " + contagens() + ";\n"
          + f"    v_b := coalesce({s}.meu_paciente_id() = v_pac_a and {s}.minha_nutricionista_id() = v_nutri, false);\n"
          + VOLTA
          + "    if v_c is distinct from v_e then v_n := v_n + 1; end if;\n    if v_b then v_k := v_k + 1; end if;\n"
          + f"    update {s}.pacientes set config = config where id = v_pac_a;\n  end loop;\n"
          + "  perform set_config('enable_indexscan', 'on', true);\n  perform set_config('enable_bitmapscan', 'on', true);\n"
          + res(diferentes_20x="v_n", escalar_na_a_20x="v_k", _n="v_c")
          + ALUNA
          + se_existe("meus_pacientes_ids", conjunto=f"{s}.meus_pacientes_ids() = array[v_pac_a, v_pac_b]")
          + se_existe("minhas_nutricionistas_ids", nutris=f"(select array_agg(x order by x) from unnest({s}.minhas_nutricionistas_ids()) x) "
                                                          "= (select array_agg(x order by x) from unnest(array[v_nutri, v_dono_b]) x)")
          + VOLTA
          # a A encerrada (ativo = false): continua no conjunto; a escalar passa à 1ª ativa (a B)
          + f"  update {s}.pacientes set ativo = false where id = v_pac_a;\n"
          + ALUNA + "  v_c := " + contagens() + ";\n"
          + res(a_encerrada_escalar_na_b=f"coalesce({s}.meu_paciente_id() = v_pac_b and {s}.minha_nutricionista_id() = v_dono_b, false)")
          + VOLTA + res(a_encerrada_difs=difs("v_e", "v_c")))
    k["M2"] = (m2, {"b_soma": [], "diferentes_20x": 0, "escalar_na_a_20x": 20, "conjunto": True, "nutris": True,
                    "a_encerrada_escalar_na_b": True, "a_encerrada_difs": []})

    # M3 — 1 viva + 1 apagada: só a viva
    k["M3"] = (criar_b(apagada=True) + "  v_e := " + esperado(*so_a) + ";\n" + ALUNA + "  v_c := " + contagens() + ";\n"
               + res(escalar=f"coalesce({s}.meu_paciente_id() = v_pac_a, false)")
               + se_existe("meus_pacientes_ids", conjunto=f"{s}.meus_pacientes_ids() = array[v_pac_a]")
               + VOLTA + res(difs=difs("v_e", "v_c")),
               {"escalar": True, "conjunto": True, "difs": []})

    # M4 — o login banido: nada (e as 2 portas recusam). SÓ no local (no staging seria escrita no Auth compartilhado)
    if B.LOCAL:
        m4 = (criar_b() + "  update auth.users set banned_until = now() + interval '1 day' where id = v_aluna;\n"
              + "  v_e := " + esperado("array[]::uuid[]", "array[]::uuid[]") + ";\n"
              + ALUNA + "  v_c := " + contagens() + ";\n"
              + res(escalar=f"{s}.meu_paciente_id() is null and {s}.minha_nutricionista_id() is null",
                    rotina=f"{s}.rotina_salvar(null, '{{\"nome\": \"{MARCA}\"}}'::jsonb) ->> 'erro'")
              + se_existe("meus_pacientes_ids", conjunto=f"cardinality({s}.meus_pacientes_ids()) = 0 and cardinality({s}.minhas_nutricionistas_ids()) = 0")
              + f"  begin\n    perform {s}.paciente_marcar_refeicao(v_ref_b, v_hoje, true);\n    v_res := v_res || '{{\"marcar\": \"passou\"}}'::jsonb;\n"
              + "  exception when insufficient_privilege then\n    v_res := v_res || jsonb_build_object('marcar', sqlerrm);\n  end;\n"
              + VOLTA + res(difs=difs("v_e", "v_c")))
        k["M4"] = (m4, {"escalar": True, "conjunto": True, "rotina": "sem_acesso", "marcar": "sem_acesso", "difs": []})
    else:
        k["M4"] = (res(so_local="'o login banido seria escrita no Auth compartilhado (contrato §7.7)'"),
                   {"so_local": "o login banido seria escrita no Auth compartilhado (contrato §7.7)"})

    # M5 — outra pessoa (o w7b-sozinho, com o claim de aluno): nada da A/B (nem a TACO entra na conta)
    k["M5"] = (criar_b() + como("v_sozinho", "paciente")
               + "  v_c := " + contagens(lambda t: ramo(t, "array[v_pac_a, v_pac_b]", "array[v_nutri, v_dono_b]", lixeira=False)) + ";\n"
               + VOLTA + res(linhas_da_a_e_b=f"(select coalesce(sum((e.value)::int), 0) from jsonb_each(v_c) e)"),
               {"linhas_da_a_e_b": 0})

    # M6 — o visitante: 42501 nas 15 tabelas, nas 2 novas e nas escalares
    m6 = VISITANTE
    for t in TABELAS:
        m6 += negado(t, f"perform count(*) from {s}.{t};")
    for f in ("meus_pacientes_ids", "minhas_nutricionistas_ids", "meu_paciente_id", "minha_nutricionista_id"):
        m6 += negado(f, f"perform {s}.{f}();")
    k["M6"] = (m6 + VOLTA, {**{t: "negado" for t in TABELAS}, **{f: "negado" for f in ("meus_pacientes_ids", "minhas_nutricionistas_ids",
                                                                                        "meu_paciente_id", "minha_nutricionista_id")}})

    # M7 — o profissional (w5p-nutri) e o master (claim): o ramo do aluno vazio pela escalar e pelo conjunto (só o que muda) + o RLS
    m7 = criar_b()
    for quem, uid, papel in (("nutri", "v_nutri", None), ("master", "v_master", "master")):
        velho = contagens(lambda t: ramo(t, f"array[{s}.meu_paciente_id()]", f"array[{s}.minha_nutricionista_id()]", f"{s}.eh_paciente()"))
        novo = contagens(lambda t: ramo(t, f"{s}.meus_pacientes_ids()", f"{s}.minhas_nutricionistas_ids()", f"{s}.eh_paciente()"))
        m7 += (claims(uid, papel)
               + res(**{f"{quem}_ramo_escalar": f"(select coalesce(sum((e.value)::int), 0) from jsonb_each({velho}) e)"})
               # sem a função nova (antes da migration) não há ramo do conjunto: conta 0
               + f"  if {existe('meus_pacientes_ids')} then\n  "
               + res(**{f"{quem}_ramo_conjunto": f"(select coalesce(sum((e.value)::int), 0) from jsonb_each({novo}) e)"})
               + "  else\n  " + res(**{f"{quem}_ramo_conjunto": "0"}) + "  end if;\n"
               + SEM_CLAIMS + como(uid, papel) + res(**{f"_{quem}": contagens()}) + VOLTA)
    k["M7"] = (m7, {"nutri_ramo_escalar": 0, "nutri_ramo_conjunto": 0, "master_ramo_escalar": 0, "master_ramo_conjunto": 0})

    # M8 — quem é membro da conta A (papel personal) e aluno de 2 nela (A e A2) + a B na conta do w13-dono
    m8 = (criar_b()
          + f"  insert into {s}.conta_membros (conta_id, user_id, papeis, status) values (v_conta_a, v_aluna, array['personal'], 'ativo');\n"
          + f"  insert into {s}.pacientes (conta_id, user_id, personal_id, nome) values (v_conta_a, v_aluna, v_personal, '{MARCA} A2') "
          "returning id into v_pac_a2;\n"
          + f"  insert into {s}.recibos (nutricionista_id, paciente_id, conta_id, valor, descricao, texto) values "
          f"(v_nutri, v_pac_a, v_conta_a, 10, '{MARCA}', '{MARCA}'), (v_nutri, v_pac_a2, v_conta_a, 20, '{MARCA}', '{MARCA}');\n"
          + f"  insert into {s}.cobrancas (nutricionista_id, paciente_id, conta_id, descricao, valor, vencimento, status, pago_em, criado_por, "
          "comprovante_path) values "
          f"(v_nutri, v_pac_a, v_conta_a, '{MARCA}', 11, v_hoje, 'paga', now(), v_nutri, 'hml23-e2e/a-' || gen_random_uuid()::text), "
          f"(v_nutri, v_pac_a2, v_conta_a, '{MARCA}', 22, v_hoje, 'paga', now(), v_nutri, 'hml23-e2e/a2-' || gen_random_uuid()::text);\n"
          + f"  insert into {s}.transacoes (nutricionista_id, conta_id, paciente_id, tipo, descricao, metodo, valor, data) values "
          f"(v_aluna, v_conta_a, v_pac_a, 'entrada', '{MARCA}', 'pix', 5, v_hoje), (v_aluna, v_conta_a, v_pac_a2, 'entrada', '{MARCA}', 'pix', 6, v_hoje);\n"
          # o esperado, como postgres: os caminhos dos comprovantes, os recibos e as cobranças pagas (sem lançamento) de hoje das 2 na conta A
          + f"  select cb.comprovante_path into v_path_a from {s}.cobrancas cb where cb.paciente_id = v_pac_a and cb.descricao = '{MARCA}';\n"
          + f"  select cb.comprovante_path into v_path_a2 from {s}.cobrancas cb where cb.paciente_id = v_pac_a2;\n"
          + f"  v_n := (select count(*) from {s}.recibos r where r.conta_id = v_conta_a and r.deleted_at is null and r.paciente_id in (v_pac_a, v_pac_a2));\n"
          + f"  v_e := jsonb_build_object('soma_cobrancas', (select coalesce(sum(cb.valor), 0) from {s}.cobrancas cb where cb.conta_id = v_conta_a "
          "and cb.deleted_at is null and cb.status = 'paga' and cb.reembolsado_em is null and cb.transacao_id is null and cb.paciente_id in (v_pac_a, v_pac_a2) "
          "and (cb.pago_em at time zone 'America/Sao_Paulo')::date = v_hoje));\n"
          + ALUNA
          + res(comprovante_a=f"{s}.pode_ler_comprovante(v_path_a)", comprovante_a2=f"{s}.pode_ler_comprovante(v_path_a2)",
                comprovante_b=f"{s}.pode_ler_comprovante(v_path_b)")
          + f"  v_j := {s}.financeiro_recibos(v_conta_a, '{{}}'::jsonb, 0, 100);\n"
          + res(recibos_total="(v_j ->> 'total')::int = v_n and v_n >= 2",
                recibos_com_aluno="(select count(*) from jsonb_array_elements(v_j -> 'itens') i where i -> 'paciente' = 'null'::jsonb "
                                  "or not (i ? 'paciente'))::int")
          + f"  v_j := {s}.financeiro_resumo_periodo(v_conta_a, v_hoje, v_hoje, '{{\"resumo\": true}}'::jsonb);\n"
          + res(resumo_cobrancas="(select coalesce(sum((d ->> 'valor')::numeric), 0) from jsonb_array_elements(v_j -> 'cobrancas_por_dia') d) "
                                 "= (v_e ->> 'soma_cobrancas')::numeric and (v_e ->> 'soma_cobrancas')::numeric >= 33")
          + f"  v_j := {s}.financeiro_lancamentos(v_conta_a, v_hoje, v_hoje, '{{}}'::jsonb, 0, 100);\n"
          + res(lancamentos_das_2="(select count(*) from jsonb_array_elements(v_j -> 'itens') i where (i ->> 'paciente_id')::uuid in (v_pac_a, v_pac_a2)) >= 2",
                lancamentos_sem_aluno="(select count(*) from jsonb_array_elements(v_j -> 'itens') i "
                                      "where (i ->> 'paciente_id')::uuid in (v_pac_a, v_pac_a2) and i -> 'paciente' = 'null'::jsonb)::int")
          + VOLTA)
    k["M8"] = (m8, {"comprovante_a2": True, "comprovante_a": True, "comprovante_b": True, "recibos_total": True, "recibos_com_aluno": 0,
                    "resumo_cobrancas": True, "lancamentos_das_2": True, "lancamentos_sem_aluno": 0})

    # M9 — as 2 portas com 2 vivas = hoje: a refeição de cada matrícula fica na matrícula dela; criar rotina
    k["M9"] = (criar_b() + ALUNA
               + res(marcar_a=f"{s}.paciente_marcar_refeicao(v_ref_a, v_hoje, true)", marcar_b=f"{s}.paciente_marcar_refeicao(v_ref_b, v_hoje, true)",
                     rotina=f"{s}.rotina_salvar(null, '{{\"nome\": \"{MARCA} rotina\"}}'::jsonb) -> 'ok'")
               + VOLTA
               + res(concluida_na_a=f"(select paciente_id = v_pac_a from {s}.refeicoes_concluidas where refeicao_id = v_ref_a and data = v_hoje)",
                     concluida_na_b=f"(select paciente_id = v_pac_b from {s}.refeicoes_concluidas where refeicao_id = v_ref_b and data = v_hoje)"),
               {"marcar_a": True, "marcar_b": True, "rotina": True, "concluida_na_a": True, "concluida_na_b": True})
    return k


# ───────────────────────── o catálogo (só leitura; vale no public) ─────────────────────────
def catalogo(s: str) -> None:
    SCHEMA["s"] = s
    pol = ", ".join(f"('{t}', '{n}', '{f}')" for t, (n, f) in POLICIES.items())
    r = B.ler(f"""select x.tabela, x.funcao,
                    exists (select 1 from pg_policy p join pg_depend d on d.classid = 'pg_policy'::regclass and d.objid = p.oid
                                                               and d.refclassid = 'pg_proc'::regclass
                             where p.polrelid = to_regclass('{s}.' || x.tabela) and p.polname = x.nome and p.polcmd = 'r' and p.polpermissive
                               and d.refobjid = coalesce(to_regprocedure('{s}.' || x.funcao || '()')::oid, 0::oid)) as le_a_nova
                  from (values {pol}) x(tabela, nome, funcao)""")
    fora = sorted(x["tabela"] for x in r if not x["le_a_nova"])
    P.check(len(r) == 15 and not fora, f"[K1/{s}] as 15 policies do aluno leem a função do conjunto certa (pg_depend)"
            + ("" if not fora else f" — fora: {fora}"))
    r = B.ler(f"""select f.nome, (select count(distinct d.objid) from pg_depend d where d.classid = 'pg_policy'::regclass
                                   and d.refclassid = 'pg_proc'::regclass and d.refobjid = coalesce(to_regprocedure('{s}.' || f.nome || '()')::oid, 0::oid)) as n
                  from (values ('meus_pacientes_ids'), ('minhas_nutricionistas_ids'), ('meu_paciente_id'), ('minha_nutricionista_id')) f(nome)""")
    n = {x["nome"]: x["n"] for x in r}
    P.check(n == {"meus_pacientes_ids": 13, "minhas_nutricionistas_ids": 2, "meu_paciente_id": 0, "minha_nutricionista_id": 0},
            f"[K1/{s}] pg_depend das policies: 13 na meus_pacientes_ids, 2 na minhas_nutricionistas_ids, 0 nas escalares ({n})")
    r = B.ler(f"""select p.proname as f, p.prosecdef as definer, p.provolatile::text as vol, coalesce(array_to_string(p.proconfig, ';'), '') as cfg,
                    pg_get_userbyid(p.proowner) as dono, format_type(p.prorettype, null) as ret,
                    has_function_privilege('authenticated', p.oid, 'EXECUTE') as logado, has_function_privilege('service_role', p.oid, 'EXECUTE') as servidor,
                    has_function_privilege('anon', p.oid, 'EXECUTE') as visitante,
                    exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public,
                    strpos(p.prosrc, 'order by p.ativo desc, p.created_at, p.id limit 1') > 0 as ordem
                  from pg_proc p where p.pronamespace = '{s}'::regnamespace
                   and p.proname in ('meus_pacientes_ids', 'minhas_nutricionistas_ids', 'meu_paciente_id', 'minha_nutricionista_id')
                   and p.pronargs = 0""")
    f = {x["f"]: x for x in r}
    novas_ok = all(x in f and f[x]["definer"] and f[x]["vol"] == "s" and f[x]["cfg"] == 'search_path=""' and f[x]["dono"] == "postgres"
                   and f[x]["ret"] == "uuid[]" and f[x]["logado"] and f[x]["servidor"] and not f[x]["visitante"] and not f[x]["public"]
                   for x in ("meus_pacientes_ids", "minhas_nutricionistas_ids"))
    P.check(novas_ok, f"[K2/{s}] as 2 novas: DEFINER, STABLE, uuid[], search_path vazio, do postgres; o logado e o servidor executam, o visitante e o PUBLIC não")
    esc_ok = all(x in f and f[x]["definer"] and f[x]["cfg"] == 'search_path=""' and f[x]["ordem"] and f[x]["logado"] and not f[x]["visitante"]
                 for x in ("meu_paciente_id", "minha_nutricionista_id"))
    P.check(esc_ok, f"[K3/{s}] as escalares ficam: ordem fixa (ativo desc, created_at, id), search_path vazio, o logado executa e o visitante não")
    r = B.ler(f"""select string_agg(p.proname::text, ',' order by p.proname) filter (where strpos(p.prosrc, 'meu_paciente_id()') > 0) as escalar,
                    count(*) filter (where p.proname in ('financeiro_transacoes_visiveis', 'financeiro_resumo_periodo', 'financeiro_recibos',
                                                        'pode_ler_comprovante')
                                       and strpos(p.prosrc, '{s}.meus_pacientes_ids()') > 0 and strpos(p.prosrc, 'meu_paciente') = 0) as conjunto
                  from pg_proc p where p.pronamespace = '{s}'::regnamespace""")[0]
    P.check(r == {"escalar": "paciente_marcar_refeicao,rotina_salvar", "conjunto": 4},
            f"[K4/{s}] com a escalar no corpo só as 2 portas; as 4 que repetem o RLS leem o conjunto ({r})")


# ───────────────────────── rodar ─────────────────────────
def comparar_contagens(arquivo: Path, atuais: dict) -> None:
    if not arquivo.exists():
        arquivo.write_text(json.dumps(atuais, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
        P.check(True, f"[contagens] guardadas para a próxima rodada ({len(atuais)} grupos) em {arquivo.name}")
        return
    antes = json.loads(arquivo.read_text(encoding="utf-8"))
    dif = sorted(f"{g}.{t}" for g in set(antes) | set(atuais) for t in set(antes.get(g, {})) | set(atuais.get(g, {}))
                 if antes.get(g, {}).get(t) != atuais.get(g, {}).get(t))
    P.check(not dif, f"[contagens] o RLS do M1 (aluna) e do M7 (nutri, master) = o da rodada guardada ({len(atuais)} grupos × 15)"
            + ("" if not dif else f" — diferentes: {dif}"))


def rodar(ids: list[str], arquivo: Path | None) -> None:
    ks = casos()
    atuais: dict = {}
    for i in ids:
        corpo, esperado_ = ks[i]
        try:
            r = B.resultado(bloco_sql(corpo))
        except RuntimeError as e:
            P.check(False, f"[{i}] erro — {str(e).strip().splitlines()[0][:300]}")
            continue
        cmp = {c: v for c, v in r.items() if not c.startswith("_")}
        if i == "M1" and "_n" in r:
            atuais["aluna_M1"] = r["_n"]
        if i == "M7":
            atuais.update({f"{q}_M7": r[f"_{q}"] for q in ("nutri", "master") if f"_{q}" in r})
        P.check(cmp == esperado_, f"[{i}] {json.dumps(r, ensure_ascii=False)[:900]}"
                + ("" if cmp == esperado_ else f"  ≠ esperado {json.dumps(esperado_, ensure_ascii=False)[:400]}"))
    if arquivo and atuais:
        comparar_contagens(arquivo, atuais)


def seco(ids: list[str]) -> None:
    ks = casos()
    for i in ids:
        q = bloco_sql(ks[i][0])
        papeis = q.count("perform set_config('role', 'authenticated'") + q.count("perform set_config('role', 'anon'")
        P.check(q.count("$t$") == 2 and papeis == q.count("perform set_config('role', 'postgres'") and "{schema}" not in q,
                f"[{i}] bloco bem formado ({len(q)} caracteres; cada 'como o app' com o seu VOLTA)")
    m2 = bloco_sql(ks["M2"][0])
    P.check(m2.count("update staging.pacientes set config = config where id = v_pac_a") == 1 and "generate_series(1, 20)" in m2
            and "'enable_indexscan', 'off'" in m2, "[M2] 20 voltas com o seq scan forçado e o update HOT da A entre elas")
    P.check(all(f"{S()}.{t} x" in bloco_sql(ks["M1"][0]) for t in TABELAS), "[M1] as 15 tabelas na contagem")
    P.check(("auth.users set banned_until" in bloco_sql(ks["M4"][0])) == bool(B.LOCAL),
            f"[M4] o login banido só no local ({'local' if B.LOCAL else 'staging: fica de fora'})")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--casos", default="")
    ap.add_argument("--so-catalogo", action="store_true")
    ap.add_argument("--schema", default="staging", choices=("staging", "public"))
    ap.add_argument("--seco", action="store_true")
    ap.add_argument("--contagens", default="")
    a = ap.parse_args()
    ids = [x.strip() for x in a.casos.split(",") if x.strip()] or list(casos())
    if a.seco:
        seco(ids)
        return P.fim()
    if a.so_catalogo or a.schema == "public":
        B.exigir_saude("o catálogo da hml-23")
        catalogo(a.schema)
        return P.fim()
    B.exigir_saude("o sql_23 (staging)")
    rodar(ids, Path(a.contagens).expanduser().resolve() if a.contagens else None)
    if not a.casos:
        catalogo("staging")
    return P.fim()


if __name__ == "__main__":
    raise SystemExit(main())
