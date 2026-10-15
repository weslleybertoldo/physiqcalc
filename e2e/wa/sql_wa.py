#!/usr/bin/env python3
"""Physiq W-A P1 — o banco dos ACESSOS, das ROTINAS e da DIETA LIVRE (+ a LGPD das tabelas novas): as migrations
20261012200000_wa1_acessos, 20261012210000_wa2_rotinas e 20261012220000_wa3_dieta_livre (spec §5.1, §5.5; revisão C1, C2, I2–I5).
O molde do e2e/w2/sql_w2.py: cada caso é UM bloco que termina com erro de propósito (nada fica gravado) e devolve o resultado na
mensagem. "Como o app" = o papel authenticated com o sub de uma conta de TESTE da hml-17 (w5p-nutri, w5p-personal = dono + personal,
w5p-aluna, w7b-sozinho = app sem profissional, w13-dono = OUTRA conta, w27-master pela claim). A massa de cada caso nasce DENTRO do
bloco (a 2ª matrícula da aluna na conta do w13-dono, a matrícula sem login, a "só treino", a refeição de hoje com 2 itens da TACO, um
alimento próprio da nutri fora do plano) e volta junto. Ponto de partida: a dieta da aluna em "ver", as 3 chaves dela no padrão
(liberado) e nenhum aviso da W-A no sino dela.
Grupos (staging): acessos A1–A10 · rotinas R1–R16 · dieta D1–D14 · lgpd L1–L5 · catalogo K1–K8 (só leitura; vale no public).
Uso: python3 e2e/wa/sql_wa.py [--grupo acessos,rotinas,dieta,lgpd,catalogo] [--casos A1,R3]   (staging)
     python3 e2e/wa/sql_wa.py --so-catalogo --schema staging|public                             (só leitura)
     python3 e2e/wa/sql_wa.py --seco                                                            (monta os blocos; NADA vai ao banco)
Antes das migrations os casos ficam ❌ (o vermelho). Ensaio local: PHYSIQ_SQL_LOCAL=<pasta do socket> (só socket; nunca a rede) — no
local o L5 apaga um login AUTOR de verdade (dentro do bloco); no staging o L5 confere as regras das FKs pelo catálogo.
Saída sem dado pessoal: só códigos, contagens e booleanos.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

P = B.C.C2.Placar()
S = "staging"
E = B.CONTAS
TITULOS_WA = ("Sua dieta foi liberada: agora você pode pôr e tirar alimentos no seu dia", "Seu profissional criou uma rotina para você")
RPCS = {"acessos_ler(uuid)", "acessos_salvar(uuid, text, text)", "acessos_registrar_series(uuid, text, text)", "wa_minha_matricula(uuid)",
        "minhas_rotinas(date, date)", "rotina_salvar(uuid, jsonb)", "rotina_arquivar(uuid)", "rotina_marcar(uuid, date, boolean)",
        "rotinas_ordenar(uuid[])", "rotinas_do_aluno(uuid, date, date)", "rotina_prof_salvar(uuid, uuid, jsonb)",
        "rotina_prof_arquivar(uuid, uuid)", "meu_dia(date)", "dia_adicionar(date, jsonb)", "dia_tirar(date, uuid)", "dia_desfazer(uuid)",
        "dia_extra_salvar(uuid, jsonb)", "dia_extra_excluir(uuid)", "dia_extra_marcar(uuid, boolean)", "meus_alimentos()",
        "meu_alimento_salvar(uuid, jsonb)", "meu_alimento_excluir(uuid)", "minha_receita_salvar(uuid, jsonb)", "minha_receita_excluir(uuid)",
        "buscar_alimentos_do_aluno(text, integer)", "dia_do_aluno(uuid, date, date)"}
INTERNAS = {"aluno_dieta_liberada(uuid)", "wa_nutricao_de_verdade(uuid)", "wa_rota(uuid)", "wa_aviso_aluno(uuid, text, text)",
            "wa_acessos_json(uuid)", "wa_log_acessos_pacientes()", "wa_log_aluno_acessos()", "wa_rotina_campos(jsonb, {s}.rotinas)",
            "wa_rotina_json({s}.rotinas)", "wa_rotina_gravar(uuid, uuid, jsonb, text, uuid)", "wa_rotina_arquivar(uuid, text)",
            "wa_uuid(text)", "wa_numero(jsonb, numeric, numeric)", "wa_texto(jsonb, integer, integer)", "wa_matriculas_dieta(uuid)",
            "wa_plano_ativo(uuid)", "wa_refeicao_do_dia(uuid, uuid, date)", "wa_alimento_visivel(uuid, uuid)", "wa_macros_da_receita(uuid)",
            "wa_dieta_liberada_alguma(uuid)", "wa_dia_item_json({s}.aluno_dia_itens)", "wa_dados_do_aluno(uuid, boolean)"}
TABELAS = ("aluno_acessos", "aluno_acessos_log", "rotinas", "rotinas_feitas", "rotinas_historico", "aluno_alimentos", "aluno_receitas",
           "aluno_receita_itens", "aluno_dia_refeicoes", "aluno_dia_itens")


# ───────────────────────── os blocos ─────────────────────────
def como(uid: str, master: bool = False) -> str:
    """Daqui em diante o bloco roda como o app (authenticated) com o sub de `uid` (uma variável do bloco)."""
    meta = ", 'app_metadata', json_build_object('role', 'master')" if master else ""
    return (f"  perform set_config('request.jwt.claims', json_build_object('sub', {uid}, 'role', 'authenticated'{meta})::text, true);\n"
            "  perform set_config('role', 'authenticated', true);\n")


SEM_LOGIN = "  perform set_config('request.jwt.claims', '', true);\n  perform set_config('role', 'authenticated', true);\n"
VOLTA = "  perform set_config('role', 'postgres', true);\n  perform set_config('request.jwt.claims', '', true);\n"


def res(**kv: str) -> str:
    """v_res ganha as chaves (cada valor é uma expressão SQL)."""
    return "  v_res := v_res || jsonb_build_object(" + ", ".join(f"'{k}', {v}" for k, v in kv.items()) + ");\n"


def negado(chave: str, sql: str) -> str:
    """O comando num sub-bloco: 'negado' (42501, insufficient_privilege) ou 'passou'."""
    return (f"  begin\n    {sql}\n    v_res := v_res || jsonb_build_object('{chave}', 'passou');\n"
            f"  exception when insufficient_privilege then\n    v_res := v_res || jsonb_build_object('{chave}', 'negado');\n  end;\n")


def bloco_sql(corpo: str) -> str:
    return f"""do $t$
declare
  v_nutri uuid; v_personal uuid; v_aluna uuid; v_sozinho uuid; v_dono_b uuid; v_master uuid; v_sem_mat uuid;
  v_conta_a uuid; v_conta_b uuid; v_pac_a uuid; v_pac_b uuid; v_pac_app uuid; v_pac_x uuid;
  v_plano uuid; v_ref uuid; v_item uuid; v_item2 uuid; v_taco uuid; v_taco2 uuid; v_fora uuid; v_k numeric; v_k2 numeric;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_id uuid; v_id2 uuid; v_id3 uuid; v_j jsonb; v_n integer; v_res jsonb := '{{}}'::jsonb;
begin
  select u.id into v_nutri from auth.users u where lower(u.email) = '{E["w5p-nutri"]}';
  select u.id into v_personal from auth.users u where lower(u.email) = '{E["w5p-personal"]}';
  select u.id into v_aluna from auth.users u where lower(u.email) = '{E["w5p-aluna"]}';
  select u.id into v_sozinho from auth.users u where lower(u.email) = '{E["w7b-sozinho"]}';
  select u.id into v_dono_b from auth.users u where lower(u.email) = '{E["w13-dono"]}';
  select u.id into v_master from auth.users u where lower(u.email) = '{E["w27-master"]}';
  select p.id, p.conta_id into v_pac_a, v_conta_a from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
   where p.user_id = v_aluna and p.deleted_at is null and c.origem <> 'app' and p.nutricionista_id = v_nutri
   order by p.created_at limit 1;
  select c.id into v_conta_b from {S}.contas c
   where c.dono_id = v_dono_b and c.origem <> 'app' and c.id is distinct from v_conta_a order by c.criado_em limit 1;
  select p.id into v_pac_app from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
   where p.user_id = v_sozinho and c.origem = 'app' and p.deleted_at is null order by p.created_at limit 1;
  select a.id, a.energia_kcal into v_taco, v_k from {S}.alimentos a
   where a.fonte = 'taco' and a.deleted_at is null and a.energia_kcal > 0 order by a.codigo limit 1;
  select a.id, a.energia_kcal into v_taco2, v_k2 from {S}.alimentos a
   where a.fonte = 'taco' and a.deleted_at is null and a.energia_kcal > 0 and a.id <> v_taco order by a.codigo limit 1;
  select x into v_sem_mat from unnest(array[v_dono_b, v_master, v_nutri]) x
   where not exists (select 1 from {S}.pacientes p where p.user_id = x and p.deleted_at is null) limit 1;
  if v_nutri is null or v_personal is null or v_aluna is null or v_sozinho is null or v_dono_b is null or v_master is null
     or v_pac_a is null or v_conta_b is null or v_pac_app is null or v_taco2 is null or v_sem_mat is null then
    raise exception 'RESULTADO<<%>>', jsonb_build_object('erro', 'massa de TESTE incompleta', 'falta', jsonb_strip_nulls(jsonb_build_object(
      'nutri', v_nutri is null, 'personal', v_personal is null, 'aluna', v_aluna is null, 'sozinho', v_sozinho is null,
      'dono_b', v_dono_b is null, 'master', v_master is null, 'matricula_a', v_pac_a is null, 'conta_b', v_conta_b is null,
      'matricula_app', v_pac_app is null, 'taco', v_taco2 is null, 'sem_matricula', v_sem_mat is null)))::text;
  end if;
  -- ponto de partida (o bloco volta inteiro): a dieta da aluna em "ver", as 3 chaves no padrão, sem aviso da W-A hoje
  delete from {S}.aluno_acessos where paciente_id = v_pac_a;
  update {S}.pacientes set config = (coalesce(config, '{{}}'::jsonb) - 'diario_alimentar' - 'acesso_link') || '{{"acesso_app": true}}'::jsonb
   where id = v_pac_a;
  delete from {S}.avisos where destino_user_id = v_aluna and tipo = 'geral' and titulo in ('{TITULOS_WA[0]}', '{TITULOS_WA[1]}');
  -- a 2ª matrícula da aluna (conta do w13-dono), a refeição de hoje com 2 itens da TACO e um alimento da nutri FORA do plano
  insert into {S}.pacientes (conta_id, user_id, personal_id, nome) values (v_conta_b, v_aluna, v_dono_b, '{B.MARCA} — 2ª matrícula')
  returning id into v_pac_b;
  select pl.id into v_plano from {S}.planos_alimentares pl where pl.paciente_id = v_pac_a and pl.deleted_at is null
   order by pl.favorito desc, pl.created_at desc, pl.id limit 1;
  if v_plano is null then
    insert into {S}.planos_alimentares (nutricionista_id, paciente_id, titulo, favorito) values (v_nutri, v_pac_a, '{B.MARCA} plano', true)
    returning id into v_plano;
  end if;
  insert into {S}.refeicoes (plano_id, nome, horario, ordem) values (v_plano, '{B.MARCA} refeição', '19:30', 99) returning id into v_ref;
  insert into {S}.itens_refeicao (refeicao_id, alimento_id, quantidade_g, ordem) values (v_ref, v_taco, 200, 0) returning id into v_item;
  insert into {S}.itens_refeicao (refeicao_id, alimento_id, quantidade_g, ordem) values (v_ref, v_taco2, 120, 1) returning id into v_item2;
  insert into {S}.alimentos (fonte, nutricionista_id, nome, energia_kcal) values ('proprio', v_nutri, '{B.MARCA} fora do plano', 100)
  returning id into v_fora;
{corpo}
  raise exception 'RESULTADO<<%>>', v_res::text;
end $t$;"""


def liberar(pac: str = "v_pac_a", quem: str = "v_nutri") -> str:
    return como(quem) + f"  perform {S}.acessos_salvar({pac}, 'dieta', 'mexer');\n" + VOLTA


def casos() -> dict[str, tuple[str, str, dict]]:
    """id → (grupo, corpo do bloco, o resultado esperado)."""
    k: dict[str, tuple[str, str, dict]] = {}
    # ───────────── ACESSOS (wa1) ─────────────
    k["A1"] = ("acessos",
               como("v_nutri") + f"  v_j := {S}.acessos_ler(v_pac_a);\n"
               + res(nutri="jsonb_build_object('ok', v_j -> 'ok', 'pode_mudar', v_j -> 'pode_mudar', 'linhas', v_j -> 'linhas', "
                           "'tem_nutricionista', v_j -> 'tem_nutricionista', 'tem_login', v_j -> 'tem_login', "
                           "'modulos', (select jsonb_agg(m order by m) from jsonb_array_elements_text(v_j -> 'modulos') m))") + VOLTA
               + como("v_personal") + res(personal=f"{S}.acessos_ler(v_pac_a) -> 'pode_mudar'") + VOLTA
               + como("v_master", True) + res(master=f"{S}.acessos_ler(v_pac_a) -> 'pode_mudar'") + VOLTA
               + como("v_aluna") + res(aluna=f"{S}.acessos_ler(v_pac_a) ->> 'erro'") + VOLTA
               + como("v_dono_b") + res(outra_conta=f"{S}.acessos_ler(v_pac_a) ->> 'erro'") + VOLTA
               + SEM_LOGIN + res(sem_login=f"{S}.acessos_ler(v_pac_a) ->> 'erro'") + VOLTA
               + como("v_nutri") + res(inexistente=f"{S}.acessos_ler(gen_random_uuid()) ->> 'erro'") + VOLTA,
               {"nutri": {"ok": True, "pode_mudar": True, "tem_nutricionista": True, "tem_login": True, "modulos": ["nutricao", "treino"],
                          "linhas": {"acesso_app": "liberado", "diario_alimentar": "liberado", "acesso_link": "liberado", "dieta": "ver"}},
                "personal": True, "master": True, "aluna": "sem_acesso", "outra_conta": "sem_acesso", "sem_login": "sem_login",
                "inexistente": "aluno_inexistente"})
    k["A2"] = ("acessos",
               como("v_nutri") + f"  v_j := {S}.acessos_salvar(v_pac_a, 'dieta', 'mexer');\n"
               + res(lib="v_j -> 'linhas' ->> 'dieta'", mud_nome="(v_j -> 'mudancas' -> 'dieta' ->> 'por_nome') is not null")
               + f"  perform {S}.acessos_salvar(v_pac_a, 'dieta', 'ver');\n  perform {S}.acessos_salvar(v_pac_a, 'dieta', 'mexer');\n" + VOLTA
               + res(liberada=f"{S}.aluno_dieta_liberada(v_pac_a)",
                     avisos=f"(select count(*) from {S}.avisos a where a.destino_user_id = v_aluna and a.titulo = '{TITULOS_WA[0]}')",
                     log=f"(select count(*) from {S}.aluno_acessos_log l where l.paciente_id = v_pac_a and l.chave = 'dieta')",
                     por_ok=f"(select bool_and(l.por = v_nutri) from {S}.aluno_acessos_log l where l.paciente_id = v_pac_a and l.chave = 'dieta')"),
               {"lib": "mexer", "mud_nome": True, "liberada": True, "avisos": 1, "log": 3, "por_ok": True})
    k["A3"] = ("acessos",
               como("v_aluna") + res(salvar=f"{S}.acessos_salvar(v_pac_a, 'dieta', 'mexer') ->> 'erro'")
               + negado("insert", f"insert into {S}.aluno_acessos (paciente_id, chave, nivel) values (v_pac_a, 'dieta', 'mexer');")
               + negado("log", f"insert into {S}.aluno_acessos_log (paciente_id, chave, de, para) values (v_pac_a, 'dieta', 'ver', 'mexer');")
               + VOLTA + como("v_nutri")
               + negado("update", f"update {S}.aluno_acessos set nivel = 'mexer' where paciente_id = v_pac_a;")
               + negado("delete", f"delete from {S}.aluno_acessos_log where paciente_id = v_pac_a;")
               + f"  perform {S}.acessos_salvar(v_pac_a, 'dieta', 'mexer');\n" + VOLTA
               + como("v_aluna") + res(ve_linha=f"(select count(*) from {S}.aluno_acessos where paciente_id = v_pac_a)",
                                       ve_log=f"(select count(*) from {S}.aluno_acessos_log where paciente_id = v_pac_a)") + VOLTA
               + como("v_dono_b") + res(outra_conta_ve=f"(select count(*) from {S}.aluno_acessos where paciente_id = v_pac_a)") + VOLTA,
               {"salvar": "sem_acesso", "insert": "negado", "log": "negado", "update": "negado", "delete": "negado", "ve_linha": 1,
                "ve_log": 0, "outra_conta_ve": 0})
    k["A4"] = ("acessos",
               como("v_personal") + res(app=f"{S}.acessos_salvar(v_pac_a, 'acesso_app', 'bloqueado') -> 'linhas' ->> 'acesso_app'") + VOLTA
               + res(config=f"(select config -> 'acesso_app' from {S}.pacientes where id = v_pac_a)",
                     log_app=f"(select l.de || '>' || l.para from {S}.aluno_acessos_log l where l.paciente_id = v_pac_a and l.chave = 'acesso_app' order by l.em desc limit 1)")
               + f"  insert into {S}.pacientes (conta_id, personal_id, nutricionista_id, nome) values (v_conta_a, v_personal, v_nutri, '{B.MARCA} sem login')\n"
               "  returning id into v_pac_x;\n"
               + como("v_personal") + res(sem_login=f"{S}.acessos_salvar(v_pac_x, 'acesso_app', 'liberado') ->> 'erro'",
                                          linha_sem_login=f"{S}.acessos_ler(v_pac_x) -> 'linhas' ->> 'acesso_app'") + VOLTA
               + f"  update {S}.pacientes set user_id = v_sozinho where id = v_pac_x;   -- o login nasce: o BEFORE da P15 liga o acesso_app\n"
               + res(nasceu=f"(select l.de || '>' || l.para from {S}.aluno_acessos_log l where l.paciente_id = v_pac_x and l.chave = 'acesso_app')"),
               {"app": "bloqueado", "config": False, "log_app": "liberado>bloqueado", "sem_login": "sem_login_do_aluno",
                "linha_sem_login": "bloqueado", "nasceu": "bloqueado>liberado"})
    k["A5"] = ("acessos",
               f"  insert into {S}.pacientes (conta_id, personal_id, nome) values (v_conta_a, v_personal, '{B.MARCA} só treino') returning id into v_pac_x;\n"
               + como("v_personal") + res(dieta=f"{S}.acessos_salvar(v_pac_x, 'dieta', 'mexer') ->> 'erro'",
                                          diario=f"{S}.acessos_salvar(v_pac_x, 'diario_alimentar', 'bloqueado') ->> 'erro'",
                                          link=f"{S}.acessos_salvar(v_pac_x, 'acesso_link', 'bloqueado') ->> 'erro'",
                                          tem_nutri=f"{S}.acessos_ler(v_pac_x) -> 'tem_nutricionista'") + VOLTA
               + como("v_master", True) + res(app_sozinho=f"{S}.acessos_salvar(v_pac_app, 'dieta', 'mexer') ->> 'erro'") + VOLTA,
               {"dieta": "sem_nutricao", "diario": "sem_nutricao", "link": "sem_nutricao", "tem_nutri": False, "app_sozinho": "sem_nutricao"})
    k["A6"] = ("acessos",
               como("v_nutri") + res(series=f"{S}.acessos_salvar(v_pac_a, 'treino_series', 'ver') ->> 'erro'",
                                     chave=f"{S}.acessos_salvar(v_pac_a, 'x', 'ver') ->> 'erro'",
                                     valor=f"{S}.acessos_salvar(v_pac_a, 'dieta', 'talvez') ->> 'erro'",
                                     valor_app=f"{S}.acessos_salvar(v_pac_a, 'acesso_app', 'ver') ->> 'erro'",
                                     nulo=f"{S}.acessos_salvar(v_pac_a, null, 'ver') ->> 'erro'") + VOLTA,
               {"series": "dados_invalidos", "chave": "dados_invalidos", "valor": "dados_invalidos", "valor_app": "dados_invalidos",
                "nulo": "dados_invalidos"})
    k["A7"] = ("acessos",
               como("v_dono_b") + res(ler_b=f"{S}.acessos_ler(v_pac_b) -> 'pode_mudar'",
                                      dieta_b=f"{S}.acessos_salvar(v_pac_b, 'dieta', 'mexer') ->> 'erro'",
                                      app_b=f"{S}.acessos_salvar(v_pac_b, 'acesso_app', 'bloqueado') -> 'linhas' ->> 'acesso_app'") + VOLTA
               + res(a_intacta=f"(select config -> 'acesso_app' from {S}.pacientes where id = v_pac_a)"),
               {"ler_b": True, "dieta_b": "sem_nutricao", "app_b": "bloqueado", "a_intacta": True})
    k["A8"] = ("acessos",
               como("v_personal")
               + f"  update {S}.pacientes set config = coalesce(config, '{{}}'::jsonb) || '{{\"diario_alimentar\": false}}'::jsonb where id = v_pac_a;\n"
               "  get diagnostics v_n = row_count;\n" + res(linhas="v_n") + VOLTA
               + res(log=f"(select l.de || '>' || l.para || ':' || (l.por = v_personal)::text from {S}.aluno_acessos_log l "
                         "where l.paciente_id = v_pac_a and l.chave = 'diario_alimentar' order by l.em desc limit 1)"),
               {"linhas": 1, "log": "liberado>bloqueado:true"})
    k["A9"] = ("acessos",
               como("v_nutri") + res(ok=f"{S}.acessos_registrar_series(v_pac_a, 'mexer', 'ver')",
                                     igual=f"{S}.acessos_registrar_series(v_pac_a, 'ver', 'ver') ->> 'erro'",
                                     fora=f"{S}.acessos_registrar_series(v_pac_a, 'x', 'ver') ->> 'erro'") + VOLTA
               + como("v_aluna") + res(aluna=f"{S}.acessos_registrar_series(v_pac_a, 'ver', 'mexer') ->> 'erro'") + VOLTA
               + como("v_nutri") + res(mud=f"{S}.acessos_ler(v_pac_a) -> 'mudancas' -> 'treino_series' ->> 'para'") + VOLTA,
               {"ok": {"ok": True}, "igual": "dados_invalidos", "fora": "dados_invalidos", "aluna": "sem_acesso", "mud": "ver"})
    k["A10"] = ("acessos",
                como("v_nutri") + negado("liberada", f"perform {S}.aluno_dieta_liberada(v_pac_a);")
                + negado("rota", f"perform {S}.wa_rota(v_pac_a);") + negado("aviso", f"perform {S}.wa_aviso_aluno(v_aluna, 'x', null);")
                + negado("json", f"perform {S}.wa_acessos_json(v_pac_a);") + VOLTA,
                {"liberada": "negado", "rota": "negado", "aviso": "negado", "json": "negado"})
    # ───────────── ROTINAS (wa2) ─────────────
    criar = (f"  v_j := {S}.rotina_salvar(null, '{{\"nome\": \"  Creatina   x  \", \"detalhe\": \"5 g\", \"tipo\": \"suplemento\", "
             "\"horario\": \"08:00\", \"dias_semana\": [3, 1, 1, 7], \"lembrete\": true}'::jsonb);\n  v_id := (v_j -> 'rotina' ->> 'id')::uuid;\n")
    todos_os_dias = f"  v_j := {S}.rotina_salvar(null, '{{\"nome\": \"{B.MARCA} todo dia\"}}'::jsonb);\n  v_id := (v_j -> 'rotina' ->> 'id')::uuid;\n"
    k["R1"] = ("rotinas", como("v_aluna") + criar
               + res(r="(v_j -> 'rotina') - 'id' - 'paciente_id' - 'ordem' - 'criada_em' - 'alterada_em' - 'arquivada_em'",
                     ordem_ok=f"(v_j -> 'rotina' ->> 'ordem')::int = (select count(*) from {S}.rotinas where dono_user_id = v_aluna and arquivada_em is null) - 1")
               + VOLTA + res(hist=f"(select h.o_que || ':' || h.quem from {S}.rotinas_historico h where h.rotina_id = v_id)",
                             criada_por=f"(select criada_por = v_aluna and paciente_id is null from {S}.rotinas where id = v_id)"),
               {"r": {"nome": "Creatina x", "detalhe": "5 g", "tipo": "suplemento", "horario": "08:00", "dias_semana": [1, 3, 7], "lembrete": True,
                      "origem": "aluno"}, "ordem_ok": True, "hist": "criou:aluno", "criada_por": True})
    ruins = {"lembrete_sem_hora": '{"nome": "X", "lembrete": true}', "nome_vazio": '{"nome": "   "}', "nome_61": '{"nome": "' + "x" * 61 + '"}',
             "tipo": '{"nome": "X", "tipo": "vitamina"}', "dia_8": '{"nome": "X", "dias_semana": [8]}', "dia_0": '{"nome": "X", "dias_semana": [0]}',
             "dias_vazio": '{"nome": "X", "dias_semana": []}', "hora_25": '{"nome": "X", "horario": "25:00"}', "texto": '"x"',
             "detalhe_121": '{"nome": "X", "detalhe": "' + "d" * 121 + '"}', "lembrete_texto": '{"nome": "X", "lembrete": "sim"}'}
    k["R2"] = ("rotinas", como("v_aluna") + res(**{c: f"{S}.rotina_salvar(null, '{v}'::jsonb) ->> 'erro'" for c, v in ruins.items()}) + VOLTA,
               {c: "dados_invalidos" for c in ruins})
    k["R3"] = ("rotinas",
               f"  insert into {S}.rotinas (dono_user_id, origem, nome, criada_por)\n"
               f"  select v_aluna, 'aluno', '{B.MARCA} ' || g, v_aluna from generate_series(1, 30 - (select count(*) from {S}.rotinas\n"
               "    where dono_user_id = v_aluna and arquivada_em is null)::int) g;\n"
               + como("v_aluna") + res(limite=f"{S}.rotina_salvar(null, '{{\"nome\": \"a 31ª\"}}'::jsonb) ->> 'erro'") + VOLTA,
               {"limite": "limite"})
    k["R4"] = ("rotinas", como("v_aluna") + todos_os_dias
               + res(hoje=f"{S}.rotina_marcar(v_id, v_hoje, true) -> 'feita'", ontem=f"{S}.rotina_marcar(v_id, v_hoje - 1, true) -> 'feita'",
                     de_novo=f"{S}.rotina_marcar(v_id, v_hoje, true) -> 'ok'",
                     anteontem=f"{S}.rotina_marcar(v_id, v_hoje - 2, true) ->> 'erro'", amanha=f"{S}.rotina_marcar(v_id, v_hoje + 1, true) ->> 'erro'")
               + res(feitas=f"(select count(*) from {S}.rotinas_feitas where rotina_id = v_id)")
               + res(desmarcar=f"{S}.rotina_marcar(v_id, v_hoje, false) -> 'feita'")
               + res(feitas_depois=f"(select count(*) from {S}.rotinas_feitas where rotina_id = v_id)")
               + f"  v_j := {S}.rotina_salvar(null, jsonb_build_object('nome', '{B.MARCA} outro dia', 'dias_semana', jsonb_build_array((extract(isodow from v_hoje)::int % 7) + 1)));\n"
               + res(fora_do_dia=f"{S}.rotina_marcar((v_j -> 'rotina' ->> 'id')::uuid, v_hoje, true) ->> 'erro'") + VOLTA,
               {"hoje": True, "ontem": True, "de_novo": True, "anteontem": "dados_invalidos", "amanha": "dados_invalidos", "feitas": 2,
                "desmarcar": False, "feitas_depois": 1, "fora_do_dia": "dados_invalidos"})
    k["R5"] = ("rotinas", como("v_aluna") + criar + VOLTA + como("v_sozinho")
               + res(salvar=f"{S}.rotina_salvar(v_id, '{{\"nome\": \"outro\"}}'::jsonb) ->> 'erro'", arquivar=f"{S}.rotina_arquivar(v_id) ->> 'erro'",
                     marcar=f"{S}.rotina_marcar(v_id, v_hoje, true) ->> 'erro'", ve=f"(select count(*) from {S}.rotinas where id = v_id)") + VOLTA,
               {"salvar": "nao_encontrado", "arquivar": "nao_encontrado", "marcar": "nao_encontrado", "ve": 0})
    k["R6"] = ("rotinas", como("v_aluna") + criar
               + f"  perform {S}.rotina_salvar(v_id, '{{\"horario\": \"09:00\"}}'::jsonb);\n  perform {S}.rotina_salvar(v_id, '{{\"horario\": \"09:00\"}}'::jsonb);\n"
               + VOLTA + res(mudou=f"(select jsonb_build_object('antes', h.antes, 'depois', h.depois) from {S}.rotinas_historico h where h.rotina_id = v_id and h.o_que = 'mudou')",
                             n=f"(select count(*) from {S}.rotinas_historico h where h.rotina_id = v_id)"),
               {"mudou": {"antes": {"horario": "08:00"}, "depois": {"horario": "09:00"}}, "n": 2})
    k["R7"] = ("rotinas", como("v_aluna") + criar
               + res(arquivar=f"{S}.rotina_arquivar(v_id)")
               + res(some=f"(select count(*) from jsonb_array_elements({S}.minhas_rotinas(v_hoje, v_hoje) -> 'rotinas') x where (x ->> 'id')::uuid = v_id)",
                     marcar=f"{S}.rotina_marcar(v_id, v_hoje, true) ->> 'erro'", de_novo=f"{S}.rotina_arquivar(v_id) ->> 'erro'") + VOLTA
               + res(hist=f"(select h.o_que from {S}.rotinas_historico h where h.rotina_id = v_id order by h.em desc, h.o_que limit 1)"),
               {"arquivar": {"ok": True}, "some": 0, "marcar": "nao_encontrado", "de_novo": "nao_encontrado", "hist": "arquivou"})
    k["R8"] = ("rotinas", como("v_aluna") + criar + "  v_id2 := v_id;\n" + todos_os_dias
               + res(ok=f"{S}.rotinas_ordenar(array[v_id, v_id2])")
               + res(ordem=f"(select (select ordem from {S}.rotinas where id = v_id) = 0 and (select ordem from {S}.rotinas where id = v_id2) = 1)",
                     alheia=f"{S}.rotinas_ordenar(array[v_id, gen_random_uuid()]) ->> 'erro'", repetida=f"{S}.rotinas_ordenar(array[v_id, v_id]) ->> 'erro'",
                     vazia=f"{S}.rotinas_ordenar(array[]::uuid[]) ->> 'erro'") + VOLTA,
               {"ok": {"ok": True}, "ordem": True, "alheia": "nao_encontrado", "repetida": "dados_invalidos", "vazia": "dados_invalidos"})
    k["R9"] = ("rotinas", como("v_personal")
               + f"  v_j := {S}.rotina_prof_salvar(v_pac_a, null, '{{\"nome\": \"Remédio X\", \"tipo\": \"remedio\", \"horario\": \"20:00\", \"lembrete\": true}}'::jsonb);\n"
               + "  v_id := (v_j -> 'rotina' ->> 'id')::uuid;\n"
               + f"  perform {S}.rotina_prof_salvar(v_pac_a, null, '{{\"nome\": \"{B.MARCA} água\", \"tipo\": \"habito\"}}'::jsonb);\n" + VOLTA
               + res(r=f"(select jsonb_build_object('origem', origem, 'paciente_ok', paciente_id = v_pac_a, 'dono_ok', dono_user_id = v_aluna, "
                       f"'criada_por_ok', criada_por = v_personal) from {S}.rotinas where id = v_id)",
                     avisos=f"(select count(*) from {S}.avisos where destino_user_id = v_aluna and titulo = '{TITULOS_WA[1]}')",
                     hist=f"(select quem from {S}.rotinas_historico where rotina_id = v_id)"),
               {"r": {"origem": "profissional", "paciente_ok": True, "dono_ok": True, "criada_por_ok": True}, "avisos": 1, "hist": "profissional"})
    k["R10"] = ("rotinas", como("v_personal")
                + f"  v_id := ({S}.rotina_prof_salvar(v_pac_a, null, '{{\"nome\": \"Remédio X\", \"tipo\": \"remedio\"}}'::jsonb) -> 'rotina' ->> 'id')::uuid;\n" + VOLTA
                + como("v_aluna") + res(muda=f"{S}.rotina_salvar(v_id, '{{\"horario\": \"21:00\"}}'::jsonb) -> 'rotina' ->> 'horario'",
                                        apaga=f"{S}.rotina_arquivar(v_id)") + VOLTA
                + como("v_nutri") + f"  v_j := {S}.rotinas_do_aluno(v_pac_a, v_hoje - 6, v_hoje);\n"
                + res(pelo_aluno="(select x -> 'arquivada_pelo_aluno' from jsonb_array_elements(v_j -> 'rotinas') x where (x ->> 'id')::uuid = v_id)",
                      hist="(select jsonb_agg(x ->> 'quem' || ':' || (x ->> 'o_que') order by x ->> 'em') from jsonb_array_elements(v_j -> 'historico') x where (x ->> 'rotina_id')::uuid = v_id)")
                + VOLTA,
                {"muda": "21:00", "apaga": {"ok": True}, "pelo_aluno": True, "hist": ["profissional:criou", "aluno:mudou", "aluno:arquivou"]})
    k["R11"] = ("rotinas", como("v_aluna") + criar + "  v_id2 := v_id;\n" + VOLTA + como("v_personal")
                + f"  v_id := ({S}.rotina_prof_salvar(v_pac_a, null, '{{\"nome\": \"{B.MARCA} do personal\"}}'::jsonb) -> 'rotina' ->> 'id')::uuid;\n"
                + res(muda_do_aluno=f"{S}.rotina_prof_salvar(v_pac_a, v_id2, '{{\"nome\": \"x\"}}'::jsonb) ->> 'erro'",
                      arquiva_do_aluno=f"{S}.rotina_prof_arquivar(v_pac_a, v_id2) ->> 'erro'",
                      muda_a_sua=f"{S}.rotina_prof_salvar(v_pac_a, v_id, '{{\"horario\": \"07:15\"}}'::jsonb) -> 'rotina' ->> 'horario'") + VOLTA
                + como("v_dono_b") + f"  v_j := {S}.rotinas_do_aluno(v_pac_b, v_hoje, v_hoje);\n"
                + res(b_origens="(select jsonb_agg(distinct x ->> 'origem') from jsonb_array_elements(v_j -> 'rotinas') x)",
                      b_ve_a_de_A="(select count(*) from jsonb_array_elements(v_j -> 'rotinas') x where (x ->> 'id')::uuid = v_id)",
                      b_muda=f"{S}.rotina_prof_salvar(v_pac_b, v_id, '{{\"nome\": \"x\"}}'::jsonb) ->> 'erro'",
                      b_arquiva=f"{S}.rotina_prof_arquivar(v_pac_b, v_id) ->> 'erro'",
                      b_rota_a=f"{S}.rotinas_do_aluno(v_pac_a, v_hoje, v_hoje) ->> 'erro'") + VOLTA,
                {"muda_do_aluno": "so_do_aluno", "arquiva_do_aluno": "so_do_aluno", "muda_a_sua": "07:15", "b_origens": ["aluno"], "b_ve_a_de_A": 0,
                 "b_muda": "nao_encontrado", "b_arquiva": "nao_encontrado", "b_rota_a": "sem_acesso"})
    k["R12"] = ("rotinas",
                f"  insert into {S}.pacientes (conta_id, personal_id, nutricionista_id, nome) values (v_conta_a, v_personal, v_nutri, '{B.MARCA} sem login') returning id into v_pac_x;\n"
                + como("v_personal") + res(criar=f"{S}.rotina_prof_salvar(v_pac_x, null, '{{\"nome\": \"x\"}}'::jsonb) ->> 'erro'",
                                           ler=f"{S}.rotinas_do_aluno(v_pac_x, v_hoje, v_hoje) -> 'tem_login'") + VOLTA,
                {"criar": "sem_login_do_aluno", "ler": False})
    k["R13"] = ("rotinas", como("v_aluna") + criar
                + negado("insert", f"insert into {S}.rotinas (dono_user_id, origem, nome) values (v_aluna, 'aluno', 'x');")
                + negado("feita", f"insert into {S}.rotinas_feitas (rotina_id, dia) values (v_id, v_hoje);")
                + negado("hist", f"delete from {S}.rotinas_historico where rotina_id = v_id;")
                + res(aluna_ve=f"(select count(*) from {S}.rotinas where id = v_id)") + VOLTA
                + como("v_nutri") + res(nutri_ve=f"(select count(*) from {S}.rotinas where id = v_id)") + VOLTA,
                {"insert": "negado", "feita": "negado", "hist": "negado", "aluna_ve": 1, "nutri_ve": 0})
    k["R14"] = ("rotinas", como("v_sem_mat") + res(criar=f"{S}.rotina_salvar(null, '{{\"nome\": \"x\"}}'::jsonb) ->> 'erro'") + VOLTA
                + SEM_LOGIN + res(sem_login=f"{S}.minhas_rotinas(v_hoje, v_hoje) ->> 'erro'") + VOLTA,
                {"criar": "sem_acesso", "sem_login": "sem_login"})
    k["R15"] = ("rotinas", como("v_aluna") + res(mes=f"{S}.minhas_rotinas(v_hoje - 31, v_hoje) ->> 'erro'",
                                                 invertido=f"{S}.minhas_rotinas(v_hoje, v_hoje - 1) ->> 'erro'") + VOLTA
                + como("v_nutri") + res(prof_mes=f"{S}.rotinas_do_aluno(v_pac_a, v_hoje - 40, v_hoje) ->> 'erro'") + VOLTA,
                {"mes": "dados_invalidos", "invertido": "dados_invalidos", "prof_mes": "dados_invalidos"})
    k["R16"] = ("rotinas", como("v_aluna")
                + negado("gravar", f"perform {S}.wa_rotina_gravar(null, v_aluna, '{{\"nome\": \"x\"}}'::jsonb, 'aluno', null);")
                + negado("arquivar", f"perform {S}.wa_rotina_arquivar(gen_random_uuid(), 'aluno');")
                + negado("campos", f"perform {S}.wa_rotina_campos('{{}}'::jsonb, null::{S}.rotinas);") + VOLTA,
                {"gravar": "negado", "arquivar": "negado", "campos": "negado"})
    # ───────────── DIETA LIVRE (wa3) ─────────────
    k["D1"] = ("dieta", como("v_aluna")
               + res(tirar=f"{S}.dia_tirar(v_hoje, v_item) ->> 'erro'",
                     adicionar=f"{S}.dia_adicionar(v_hoje, jsonb_build_object('refeicao_id', v_ref, 'alimento_id', v_taco2, 'quantidade_g', 100)) ->> 'erro'",
                     extra=f"{S}.dia_extra_salvar(null, jsonb_build_object('dia', v_hoje, 'nome', 'Lanche')) ->> 'erro'",
                     alimento=f"{S}.meu_alimento_salvar(null, '{{\"nome\": \"Pão\"}}'::jsonb) ->> 'erro'",
                     dia_lib=f"(select x -> 'liberada' from jsonb_array_elements({S}.meu_dia(v_hoje) -> 'matriculas') x where (x ->> 'paciente_id')::uuid = v_pac_a)")
               + VOLTA,
               {"tirar": "dieta_travada", "adicionar": "dieta_travada", "extra": "dieta_travada", "alimento": "dieta_travada", "dia_lib": False})
    k["D2"] = ("dieta", liberar() + como("v_aluna") + f"  v_j := {S}.dia_tirar(v_hoje, v_item);\n  v_id := (v_j -> 'item' ->> 'id')::uuid;\n"
               + res(tipo="v_j -> 'item' ->> 'tipo'", ref_nome="v_j -> 'item' ->> 'refeicao_nome'",
                     kcal_ok="(v_j -> 'item' ->> 'energia_kcal')::numeric = round(v_k * 200 / 100, 2)",
                     de_novo=f"({S}.dia_tirar(v_hoje, v_item) -> 'item' ->> 'id')::uuid = v_id", voltar=f"{S}.dia_desfazer(v_id)",
                     novo=f"({S}.dia_tirar(v_hoje, v_item) -> 'item' ->> 'id')::uuid <> v_id") + VOLTA,
               {"tipo": "tirado", "ref_nome": f"{B.MARCA} refeição", "kcal_ok": True, "de_novo": True, "voltar": {"ok": True}, "novo": True})
    k["D3"] = ("dieta", liberar() + como("v_aluna")
               + f"  v_j := {S}.dia_adicionar(v_hoje, jsonb_build_object('refeicao_id', v_ref, 'alimento_id', v_taco2, 'quantidade_g', 150));\n"
               + res(kcal_ok="(v_j -> 'item' ->> 'energia_kcal')::numeric = round(v_k2 * 1.5, 2)",
                     fora=f"{S}.dia_adicionar(v_hoje, jsonb_build_object('refeicao_id', v_ref, 'alimento_id', v_fora, 'quantidade_g', 100)) ->> 'erro'",
                     zero=f"{S}.dia_adicionar(v_hoje, jsonb_build_object('refeicao_id', v_ref, 'alimento_id', v_taco2, 'quantidade_g', 0)) ->> 'erro'",
                     anteontem=f"{S}.dia_adicionar(v_hoje - 2, jsonb_build_object('refeicao_id', v_ref, 'alimento_id', v_taco2, 'quantidade_g', 10)) ->> 'erro'",
                     amanha=f"{S}.dia_adicionar(v_hoje + 1, jsonb_build_object('refeicao_id', v_ref, 'alimento_id', v_taco2, 'quantidade_g', 10)) ->> 'erro'",
                     duas_origens=f"{S}.dia_adicionar(v_hoje, jsonb_build_object('refeicao_id', v_ref, 'alimento_id', v_taco2, 'aluno_alimento_id', v_taco, 'quantidade_g', 10)) ->> 'erro'",
                     dois_lugares=f"{S}.dia_adicionar(v_hoje, jsonb_build_object('refeicao_id', v_ref, 'extra_id', v_ref, 'alimento_id', v_taco2, 'quantidade_g', 10)) ->> 'erro'",
                     uuid_ruim=f"{S}.dia_adicionar(v_hoje, jsonb_build_object('refeicao_id', 'x', 'alimento_id', v_taco2, 'quantidade_g', 10)) ->> 'erro'")
               + VOLTA + f"  insert into {S}.itens_refeicao (refeicao_id, alimento_id, quantidade_g, ordem) values (v_ref, v_fora, 50, 2);\n"
               + como("v_aluna") + res(fora_no_plano=f"{S}.dia_adicionar(v_hoje, jsonb_build_object('refeicao_id', v_ref, 'alimento_id', v_fora, 'quantidade_g', 100)) -> 'ok'")
               + VOLTA,
               {"kcal_ok": True, "fora": "nao_encontrado", "zero": "dados_invalidos", "anteontem": "dados_invalidos", "amanha": "dados_invalidos",
                "duas_origens": "dados_invalidos", "dois_lugares": "dados_invalidos", "uuid_ruim": "dados_invalidos", "fora_no_plano": True})
    k["D4"] = ("dieta", liberar()
               + f"  insert into {S}.pacientes (conta_id, personal_id, nutricionista_id, nome) values (v_conta_a, v_personal, v_nutri, '{B.MARCA} outro') returning id into v_pac_x;\n"
               f"  insert into {S}.planos_alimentares (nutricionista_id, paciente_id, titulo) values (v_nutri, v_pac_x, '{B.MARCA}') returning id into v_id;\n"
               f"  insert into {S}.refeicoes (plano_id, nome) values (v_id, '{B.MARCA} alheia') returning id into v_id2;\n"
               f"  insert into {S}.itens_refeicao (refeicao_id, alimento_id, quantidade_g) values (v_id2, v_taco, 100) returning id into v_id3;\n"
               + como("v_aluna") + res(alheia=f"{S}.dia_adicionar(v_hoje, jsonb_build_object('refeicao_id', v_id2, 'alimento_id', v_taco, 'quantidade_g', 10)) ->> 'erro'",
                                       item_alheio=f"{S}.dia_tirar(v_hoje, v_id3) ->> 'erro'") + VOLTA
               + f"  update {S}.planos_alimentares set deleted_at = now() where id = v_plano;\n"
               + como("v_aluna") + res(plano_na_lixeira=f"{S}.dia_tirar(v_hoje, v_item) ->> 'erro'") + VOLTA,
               {"alheia": "nao_encontrado", "item_alheio": "nao_encontrado", "plano_na_lixeira": "nao_encontrado"})
    k["D5"] = ("dieta", liberar() + como("v_aluna")
               + f"  v_j := {S}.dia_extra_salvar(null, jsonb_build_object('dia', v_hoje, 'nome', '  Lanche   da tarde ', 'horario', '16:00'));\n"
               + "  v_id := (v_j -> 'extra' ->> 'id')::uuid;\n"
               + res(nome="v_j -> 'extra' ->> 'nome'", comi="(v_j -> 'extra' ->> 'concluida_em') is not null",
                     # P2 (Task 1): matricula = o paciente_id do plano_ativo do meu_dia (definer, sem o RLS). hml-23 (H-115): + matricula_rls =
                     # o plano lido COMO A ALUNA (o texto de antes da P2) — o preâmbulo cria a 2ª matrícula viva dela; com a escalar de antes
                     # (meu_paciente_id, limit 1 sem order by) o RLS ficava com uma só e deu null 1× no staging; agora olha o conjunto
                     matricula=f"(v_j -> 'extra' ->> 'paciente_id') = ({S}.meu_dia(v_hoje) -> 'plano_ativo' ->> 'paciente_id')",
                     matricula_rls="(v_j -> 'extra' ->> 'paciente_id')::uuid = (select pl.paciente_id from " + S + ".planos_alimentares pl where pl.id = "
                                   f"(select (({S}.meu_dia(v_hoje) -> 'plano_ativo') ->> 'plano_id')::uuid))",
                     pus=f"{S}.dia_adicionar(v_hoje, jsonb_build_object('extra_id', v_id, 'alimento_id', v_taco, 'quantidade_g', 80)) -> 'ok'",
                     desmarcar=f"{S}.dia_extra_marcar(v_id, false) -> 'concluida_em'",
                     sem_dia=f"{S}.dia_extra_salvar(null, '{{\"nome\": \"x\"}}'::jsonb) ->> 'erro'",
                     excluir=f"{S}.dia_extra_excluir(v_id)")
               + res(itens_vivos=f"(select count(*) from {S}.aluno_dia_itens where extra_id = v_id and deleted_at is null)") + VOLTA
               + f"  insert into {S}.aluno_dia_refeicoes (paciente_id, dono_user_id, dia, nome) select v_pac_a, v_aluna, v_hoje, '{B.MARCA} ' || g\n"
               f"    from generate_series(1, 10 - (select count(*) from {S}.aluno_dia_refeicoes where dono_user_id = v_aluna and dia = v_hoje and deleted_at is null)::int) g;\n"
               + como("v_aluna") + res(limite=f"{S}.dia_extra_salvar(null, jsonb_build_object('dia', v_hoje, 'nome', 'a 11ª')) ->> 'erro'") + VOLTA,
               {"nome": "Lanche da tarde", "comi": True, "matricula": True, "matricula_rls": True, "pus": True, "desmarcar": None,
                "sem_dia": "dados_invalidos", "excluir": {"ok": True}, "itens_vivos": 0, "limite": "limite"})
    k["D6"] = ("dieta", liberar() + como("v_aluna")
               + f"  v_j := {S}.meu_alimento_salvar(null, '{{\"nome\": \"{B.MARCA} pão da padaria\", \"porcao_g\": 50, \"energia_kcal\": 280, "
               "\"proteina_g\": 9, \"carboidrato_g\": 55, \"lipidio_g\": 3, \"fibra_g\": 2}'::jsonb);\n  v_id := (v_j -> 'alimento' ->> 'id')::uuid;\n"
               + res(ok="v_j -> 'ok'", busca=f"(select jsonb_agg(x ->> 'tipo') from jsonb_array_elements({S}.buscar_alimentos_do_aluno('padaria', 0) -> 'itens') x)",
                     kcal_alta=f"{S}.meu_alimento_salvar(null, '{{\"nome\": \"x\", \"energia_kcal\": 1200}}'::jsonb) ->> 'erro'",
                     sem_nome=f"{S}.meu_alimento_salvar(null, '{{\"energia_kcal\": 10}}'::jsonb) ->> 'erro'",
                     muda=f"{S}.meu_alimento_salvar(v_id, '{{\"fibra_g\": 3}}'::jsonb) -> 'alimento' -> 'fibra_g'",
                     excluir=f"{S}.meu_alimento_excluir(v_id)", de_novo=f"{S}.meu_alimento_excluir(v_id) ->> 'erro'") + VOLTA
               + f"  insert into {S}.aluno_alimentos (dono_user_id, nome) select v_aluna, '{B.MARCA} ' || g\n"
               f"    from generate_series(1, 300 - (select count(*) from {S}.aluno_alimentos where dono_user_id = v_aluna and deleted_at is null)::int) g;\n"
               + como("v_aluna") + res(limite=f"{S}.meu_alimento_salvar(null, '{{\"nome\": \"o 301º\"}}'::jsonb) ->> 'erro'") + VOLTA,
               {"ok": True, "busca": ["meu"], "kcal_alta": "dados_invalidos", "sem_nome": "dados_invalidos", "muda": 3, "excluir": {"ok": True},
                "de_novo": "nao_encontrado", "limite": "limite"})
    k["D7"] = ("dieta", liberar() + como("v_aluna")
               + f"  v_id := ({S}.meu_alimento_salvar(null, '{{\"nome\": \"{B.MARCA} pão\", \"energia_kcal\": 280}}'::jsonb) -> 'alimento' ->> 'id')::uuid;\n"
               + f"  v_j := {S}.minha_receita_salvar(null, jsonb_build_object('nome', '{B.MARCA} vitamina', 'porcoes', 2, 'itens', jsonb_build_array("
               "jsonb_build_object('alimento_id', v_taco2, 'quantidade_g', 200), jsonb_build_object('aluno_alimento_id', v_id, 'quantidade_g', 100))));\n"
               + "  v_id2 := (v_j -> 'receita' ->> 'id')::uuid;\n"
               + res(porcao_ok="(v_j -> 'receita' -> 'por_porcao' ->> 'energia_kcal')::numeric = round((v_k2 * 2 + 280) / 2, 2)",
                     item_fora=f"{S}.minha_receita_salvar(null, jsonb_build_object('nome', 'x', 'itens', jsonb_build_array(jsonb_build_object('alimento_id', v_fora, 'quantidade_g', 10)))) ->> 'erro'",
                     receitas=f"(select count(*) from {S}.aluno_receitas where dono_user_id = v_aluna and deleted_at is null and nome like '{B.MARCA}%')",
                     itens_31=f"{S}.minha_receita_salvar(null, jsonb_build_object('nome', 'x', 'itens', (select jsonb_agg(jsonb_build_object('alimento_id', v_taco, 'quantidade_g', 10)) from generate_series(1, 31)))) ->> 'erro'",
                     porcoes_0=f"{S}.minha_receita_salvar(null, jsonb_build_object('nome', 'x', 'porcoes', 0, 'itens', jsonb_build_array(jsonb_build_object('alimento_id', v_taco, 'quantidade_g', 10)))) ->> 'erro'",
                     no_dia_ok=f"({S}.dia_adicionar(v_hoje, jsonb_build_object('refeicao_id', v_ref, 'aluno_receita_id', v_id2, 'porcoes', 1)) -> 'item' ->> 'energia_kcal')::numeric = round((v_k2 * 2 + 280) / 2, 2)",
                     sem_porcoes=f"{S}.dia_adicionar(v_hoje, jsonb_build_object('refeicao_id', v_ref, 'aluno_receita_id', v_id2, 'quantidade_g', 100)) ->> 'erro'")
               + VOLTA,
               {"porcao_ok": True, "item_fora": "nao_encontrado", "receitas": 1, "itens_31": "dados_invalidos", "porcoes_0": "dados_invalidos",
                "no_dia_ok": True, "sem_porcoes": "dados_invalidos"})
    k["D8"] = ("dieta", como("v_aluna")
               + f"  v_j := {S}.buscar_alimentos_do_aluno((select split_part(a.nome, ',', 1) from {S}.alimentos a where a.id = v_taco), 0);\n"
               + res(ok="v_j -> 'ok'", taco="(select bool_or(x ->> 'tipo' = 'taco') from jsonb_array_elements(v_j -> 'itens') x)",
                     ate_20="jsonb_array_length(v_j -> 'itens') <= 20", tem_mais="jsonb_typeof(v_j -> 'tem_mais')",
                     uma_letra=f"jsonb_array_length({S}.buscar_alimentos_do_aluno('a', 0) -> 'itens')",
                     pagina=f"{S}.buscar_alimentos_do_aluno('arroz', -1) ->> 'erro'") + VOLTA,
               {"ok": True, "taco": True, "ate_20": True, "tem_mais": "boolean", "uma_letra": 0, "pagina": "dados_invalidos"})
    k["D9"] = ("dieta", liberar() + como("v_aluna")
               + f"  perform {S}.dia_adicionar(v_hoje, jsonb_build_object('refeicao_id', v_ref, 'alimento_id', v_taco2, 'quantidade_g', 100));\n" + VOLTA
               + como("v_nutri") + f"  perform {S}.acessos_salvar(v_pac_a, 'dieta', 'ver');\n" + VOLTA
               + como("v_aluna") + res(travou=f"{S}.dia_adicionar(v_hoje, jsonb_build_object('refeicao_id', v_ref, 'alimento_id', v_taco2, 'quantidade_g', 100)) ->> 'erro'",
                                       guardado=f"jsonb_array_length({S}.meu_dia(v_hoje) -> 'itens') >= 1") + VOLTA,
               {"travou": "dieta_travada", "guardado": True})
    k["D10"] = ("dieta", liberar()
                + f"  update {S}.contas set plano = 'treino_nutricao' where id = v_conta_b;\n"
                f"  update {S}.conta_membros set papeis = array(select distinct x from unnest(papeis || array['nutricionista']) x) where conta_id = v_conta_b and user_id = v_dono_b;\n"
                f"  update {S}.pacientes set nutricionista_id = v_dono_b where id = v_pac_b;\n"
                f"  insert into {S}.planos_alimentares (nutricionista_id, paciente_id, titulo, favorito, created_at) values (v_dono_b, v_pac_b, '{B.MARCA} B', true, now() + interval '1 minute');\n"
                + como("v_aluna") + res(travada_b=f"{S}.dia_extra_salvar(null, jsonb_build_object('dia', v_hoje, 'nome', 'Ceia')) ->> 'erro'") + VOLTA
                + liberar("v_pac_b", "v_dono_b")
                + como("v_aluna") + res(na_b=f"({S}.dia_extra_salvar(null, jsonb_build_object('dia', v_hoje, 'nome', 'Ceia')) -> 'extra' ->> 'paciente_id')::uuid = v_pac_b")
                + VOLTA,
                {"travada_b": "dieta_travada", "na_b": True})
    k["D11"] = ("dieta", liberar() + como("v_aluna")
                + f"  perform {S}.dia_tirar(v_hoje, v_item);\n  perform {S}.dia_adicionar(v_hoje, jsonb_build_object('refeicao_id', v_ref, 'alimento_id', v_taco2, 'quantidade_g', 100));\n"
                + f"  perform {S}.dia_extra_salvar(null, jsonb_build_object('dia', v_hoje, 'nome', 'Lanche'));\n" + VOLTA
                + como("v_personal") + f"  v_j := {S}.dia_do_aluno(v_pac_a, v_hoje - 13, v_hoje);\n"
                + res(personal="jsonb_build_object('itens', jsonb_array_length(v_j -> 'itens'), 'extras', jsonb_array_length(v_j -> 'extras'), 'nivel', v_j -> 'nivel')",
                      mes=f"{S}.dia_do_aluno(v_pac_a, v_hoje - 40, v_hoje) ->> 'erro'") + VOLTA
                + como("v_aluna") + res(aluna=f"{S}.dia_do_aluno(v_pac_a, v_hoje, v_hoje) ->> 'erro'") + VOLTA
                + como("v_dono_b") + res(outra_conta=f"{S}.dia_do_aluno(v_pac_a, v_hoje, v_hoje) ->> 'erro'",
                                         na_b=f"jsonb_array_length({S}.dia_do_aluno(v_pac_b, v_hoje, v_hoje) -> 'itens')") + VOLTA,
                {"personal": {"itens": 2, "extras": 1, "nivel": "mexer"}, "mes": "dados_invalidos", "aluna": "sem_acesso", "outra_conta": "sem_acesso", "na_b": 0})
    k["D12"] = ("dieta", liberar() + como("v_aluna")
                + f"  perform {S}.dia_tirar(v_hoje, v_item);\n  perform {S}.dia_adicionar(v_hoje, jsonb_build_object('refeicao_id', v_ref, 'alimento_id', v_taco2, 'quantidade_g', 100));\n"
                + VOLTA + como("v_nutri")
                + f"  delete from {S}.itens_refeicao where id = v_item;\n  get diagnostics v_n = row_count;\n" + res(apaga_item="v_n")
                + res(copiar_semana=f"{S}.dieta_copiar_semana('{{}}'::uuid[], array[v_ref]) -> 'apagadas'") + VOLTA
                + f"  update {S}.planos_alimentares set deleted_at = now() where id = v_plano;\n"
                + como("v_nutri") + res(lixeira=f"{S}.lixeira_apagar('plano', v_plano) -> 'ok'") + VOLTA
                + res(retratos=f"(select jsonb_build_object('n', count(*), 'sem_refeicao', count(*) filter (where refeicao_id is null), "
                                f"'sem_item', count(*) filter (where tipo = 'tirado' and item_refeicao_id is null), 'com_nome', count(*) filter (where nome <> '' and refeicao_nome <> '')) "
                                f"from {S}.aluno_dia_itens where dono_user_id = v_aluna and dia = v_hoje and deleted_at is null)"),
                {"apaga_item": 1, "copiar_semana": 1, "lixeira": True, "retratos": {"n": 2, "sem_refeicao": 2, "sem_item": 1, "com_nome": 2}})
    k["D13"] = ("dieta", liberar() + como("v_aluna")
                + f"  perform {S}.dia_adicionar(v_hoje, jsonb_build_object('refeicao_id', v_ref, 'alimento_id', v_taco2, 'quantidade_g', 100));\n"
                + negado("item", f"insert into {S}.aluno_dia_itens (paciente_id, dono_user_id, dia, tipo, refeicao_nome, nome) values (v_pac_a, v_aluna, v_hoje, 'adicionado', 'x', 'x');")
                + negado("alimento", f"insert into {S}.aluno_alimentos (dono_user_id, nome) values (v_aluna, 'x');")
                + negado("apagar", f"delete from {S}.aluno_dia_itens where dono_user_id = v_aluna;")
                + res(aluna_ve=f"(select count(*) from {S}.aluno_dia_itens where dono_user_id = v_aluna and dia = v_hoje)") + VOLTA
                + como("v_nutri") + res(nutri_ve=f"(select count(*) from {S}.aluno_dia_itens where dono_user_id = v_aluna)") + VOLTA,
                {"item": "negado", "alimento": "negado", "apagar": "negado", "aluna_ve": 1, "nutri_ve": 0})
    k["D14"] = ("dieta", como("v_aluna")
                + negado("matriculas", f"perform {S}.wa_matriculas_dieta(v_aluna);") + negado("plano", f"perform {S}.wa_plano_ativo(v_aluna);")
                + negado("refeicao", f"perform {S}.wa_refeicao_do_dia(v_aluna, v_ref, v_hoje);")
                + negado("visivel", f"perform {S}.wa_alimento_visivel(v_aluna, v_taco);") + negado("lgpd", f"perform {S}.wa_dados_do_aluno(v_aluna, true);")
                + negado("uuid", f"perform {S}.wa_uuid('x');") + VOLTA,
                {"matriculas": "negado", "plano": "negado", "refeicao": "negado", "visivel": "negado", "lgpd": "negado", "uuid": "negado"})
    # ───────────── LGPD (wa3: o corpo vivo + as tabelas novas) ─────────────
    # P2 (Task 1): a rotina de TODO dia — a do `criar` (seg/qua/dom) não aceita marcar hoje nas terças, quintas, sextas e sábados (o L1 caía
    # com rotinas_feitas 0 nesses dias: o rotina_marcar responde dados_invalidos fora dos dias da rotina)
    massa_lgpd = (liberar() + como("v_aluna") + todos_os_dias
                  + f"  perform {S}.rotina_marcar(v_id, v_hoje, true);\n"
                  + f"  perform {S}.dia_tirar(v_hoje, v_item);\n  perform {S}.dia_extra_salvar(null, jsonb_build_object('dia', v_hoje, 'nome', 'Lanche'));\n"
                  + f"  v_id2 := ({S}.meu_alimento_salvar(null, '{{\"nome\": \"{B.MARCA} pão\"}}'::jsonb) -> 'alimento' ->> 'id')::uuid;\n"
                  + f"  perform {S}.minha_receita_salvar(null, jsonb_build_object('nome', '{B.MARCA} r', 'itens', jsonb_build_array(jsonb_build_object('aluno_alimento_id', v_id2, 'quantidade_g', 50))));\n"
                  + VOLTA)
    # rotina 1 + alimento 1 + receita 1 + extra 1 + item 1 = 5 linhas "dele" (as feitas, o histórico e os itens da receita caem junto)
    k["L1"] = ("lgpd", massa_lgpd + f"  v_j := {S}.exportar_dados_aluno(v_aluna);\n"
               + res(n="(select jsonb_object_agg(t, jsonb_array_length(v_j -> 'tabelas' -> t)) from unnest(array['rotinas', 'rotinas_feitas', "
                       "'rotinas_historico', 'aluno_alimentos', 'aluno_receitas', 'aluno_receita_itens', 'aluno_dia_refeicoes', 'aluno_dia_itens', 'aluno_acessos']) t)",
                     aceites="v_j ? 'aceites'", sem_autor="not ((v_j -> 'tabelas' -> 'rotinas' -> 0) ? 'criada_por')"),
               {"n": {"rotinas": 1, "rotinas_feitas": 1, "rotinas_historico": 1, "aluno_alimentos": 1, "aluno_receitas": 1, "aluno_receita_itens": 1,
                      "aluno_dia_refeicoes": 1, "aluno_dia_itens": 1, "aluno_acessos": 1}, "aceites": True, "sem_autor": True})
    k["L2"] = ("lgpd", massa_lgpd + f"  v_j := {S}.excluir_dados_aluno(v_aluna, true);\n"
               + res(conta="v_j -> 'apaga' -> 'rotinas_e_dieta'", nada_apagado=f"(select count(*) from {S}.rotinas where dono_user_id = v_aluna) = 1",
                     bucket="coalesce((select bool_and(x ->> 'bucket' = 'diario-staging') from jsonb_array_elements(v_j -> 'arquivos') x), true)"),
               {"conta": 5, "nada_apagado": True, "bucket": True})
    k["L3"] = ("lgpd", massa_lgpd
               + f"  insert into {S}.rotinas (dono_user_id, origem, nome, criada_por) values (v_sozinho, 'aluno', '{B.MARCA} de outro', v_sozinho);\n"
               + f"  v_j := {S}.excluir_dados_aluno(v_aluna, false);\n"
               + res(ok="v_j -> 'ok'", conta="v_j -> 'apaga' -> 'rotinas_e_dieta'",
                     sobrou=f"(select count(*) from {S}.rotinas where dono_user_id = v_aluna) + (select count(*) from {S}.rotinas_feitas f "
                            f"where f.rotina_id = v_id) + (select count(*) from {S}.aluno_alimentos where dono_user_id = v_aluna) + (select count(*) from "
                            f"{S}.aluno_receitas where dono_user_id = v_aluna) + (select count(*) from {S}.aluno_dia_itens where dono_user_id = v_aluna) "
                            f"+ (select count(*) from {S}.aluno_dia_refeicoes where dono_user_id = v_aluna)",
                     outro_fica=f"(select count(*) from {S}.rotinas where dono_user_id = v_sozinho and nome = '{B.MARCA} de outro')"),
               {"ok": True, "conta": 5, "sobrou": 0, "outro_fica": 1})
    k["L4"] = ("lgpd",
               f"  insert into {S}.pacientes (conta_id, user_id, personal_id, nome) values (v_conta_a, v_dono_b, v_personal, '{B.MARCA} prof aluno');\n"
               f"  insert into {S}.rotinas (dono_user_id, origem, nome, criada_por) values (v_dono_b, 'aluno', '{B.MARCA}', v_dono_b);\n"
               f"  insert into {S}.aluno_alimentos (dono_user_id, nome) values (v_dono_b, '{B.MARCA}');\n"
               + f"  v_j := {S}.excluir_conta_profissional(v_dono_b, true);\n"
               + res(conta="v_j -> 'aluno' -> 'apaga' -> 'rotinas_e_dieta'", nada_apagado=f"(select count(*) from {S}.rotinas where dono_user_id = v_dono_b) = 1"),
               {"conta": 2, "nada_apagado": True})
    autor_local = ("  insert into auth.users (id, email, aud, role) values ('a0000000-0000-4000-8000-0000000000ff', "
                   "'wa.autor.teste.claude@physiqnutri.app', 'authenticated', 'authenticated') returning id into v_id3;\n"
                   f"  insert into {S}.rotinas (dono_user_id, origem, nome, criada_por, alterada_por) values (v_aluna, 'aluno', '{B.MARCA}', v_id3, v_id3) returning id into v_id;\n"
                   f"  insert into {S}.rotinas_historico (rotina_id, por, quem, o_que) values (v_id, v_id3, 'profissional', 'mudou');\n"
                   f"  insert into {S}.aluno_acessos (paciente_id, chave, nivel, alterado_por) values (v_pac_a, 'dieta', 'mexer', v_id3);\n"
                   "  delete from auth.users where id = v_id3;\n"
                   + res(autor=f"(select jsonb_build_object('criada_por', criada_por, 'alterada_por', alterada_por) from {S}.rotinas where id = v_id)",
                         hist=f"(select por from {S}.rotinas_historico where rotina_id = v_id)",
                         acesso=f"(select alterado_por from {S}.aluno_acessos where paciente_id = v_pac_a)"))
    k["L5"] = ("lgpd", autor_local if B.LOCAL else res(so_local="'catalogo (K5)'"),
               {"autor": {"criada_por": None, "alterada_por": None}, "hist": None, "acesso": None} if B.LOCAL else {"so_local": "catalogo (K5)"})
    return k


# ───────────────────────── o catálogo (só leitura; vale no public) ─────────────────────────
def catalogo(s: str) -> None:
    lst = lambda xs: ", ".join(f"'{x}'" for x in xs)  # noqa: E731
    r = B.ler(f"""select c.relname as tabela, c.relrowsecurity as rls,
                    (select count(*) from pg_policy p where p.polrelid = c.oid and p.polcmd <> 'r') as escrita,
                    has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE') as anon,
                    has_table_privilege('authenticated', c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE') as logado_grava,
                    has_table_privilege('authenticated', c.oid, 'SELECT') as logado_le
                  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = '{s}' and c.relname in ({lst(TABELAS)})""")
    ok = len(r) == len(TABELAS) and all(x["rls"] and x["escrita"] == 0 and not x["anon"] and not x["logado_grava"] and x["logado_le"] for x in r)
    P.check(ok, f"[K1/{s}] as 10 tabelas: RLS, sem policy de escrita, o visitante sem nada, o logado só lê ({len(r)} achadas)")
    r = B.ler(f"""select p.proname || '(' || array_to_string(array(select format_type(x, null) from unnest(p.proargtypes) x), ', ') || ')' as f,
                    p.prosecdef as d, exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%') as sp,
                    has_function_privilege('anon', p.oid, 'EXECUTE') as anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') as logado,
                    has_function_privilege('service_role', p.oid, 'EXECUTE') as servidor
                  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = '{s}' and (p.proname like 'wa\\_%' or p.proname in ({lst({x.split('(')[0] for x in RPCS | INTERNAS})}))""")
    sem = lambda f: f.replace(f"{s}.", "")  # noqa: E731 — o format_type põe (ou não) o schema conforme o search_path
    por = {sem(x["f"]): x for x in r}
    rpcs_ok = all(f in por and por[f]["d"] and por[f]["sp"] and not por[f]["anon"] and por[f]["logado"] and por[f]["servidor"] for f in RPCS)
    P.check(rpcs_ok, f"[K2/{s}] as {len(RPCS)} RPCs da pessoa: definer, search_path, logado e servidor, o visitante não"
            + ("" if rpcs_ok else f" — fora: {sorted(f for f in RPCS if not (f in por and por[f]['d'] and por[f]['sp'] and not por[f]['anon'] and por[f]['logado']))}"))
    internas = {sem(f.format(s=s)) for f in INTERNAS}
    int_ok = all(f in por and not por[f]["anon"] and not por[f]["logado"] and por[f]["servidor"] for f in internas)
    P.check(int_ok, f"[K3/{s}] as {len(internas)} internas e de gatilho: só o servidor"
            + ("" if int_ok else f" — fora: {sorted(f for f in internas if not (f in por and not por[f]['logado']))}"))
    r = B.ler(f"""select t.tgname, t.tgenabled <> 'D' as ligado, pg_get_triggerdef(t.oid) as d from pg_trigger t
                   where not t.tgisinternal and t.tgname in ('trg_pacientes_wa_log_acessos', 'trg_aluno_acessos_log')
                     and t.tgrelid in ('{s}.pacientes'::regclass, coalesce(to_regclass('{s}.aluno_acessos'), '{s}.pacientes'::regclass))""")
    P.check(len(r) == 2 and all(x["ligado"] for x in r) and any("AFTER UPDATE ON" in x["d"] and "WHEN" in x["d"] for x in r),
            f"[K4/{s}] os 2 gatilhos do histórico ligados (o de pacientes: AFTER UPDATE com WHEN, sem lista de colunas)")
    r = B.ler(f"""select n1.nspname || '.' || c1.relname as tab, a.attname as col, n2.nspname || '.' || c2.relname as alvo, c.confdeltype as regra
                   from pg_constraint c
                   join pg_class c1 on c1.oid = c.conrelid join pg_namespace n1 on n1.oid = c1.relnamespace
                   join pg_class c2 on c2.oid = c.confrelid join pg_namespace n2 on n2.oid = c2.relnamespace
                   join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
                  where c.contype = 'f' and n1.nspname = '{s}' and c1.relname in ({lst(TABELAS)})""")
    ruins = [f"{x['tab']}.{x['col']}→{x['alvo']}:{x['regra']}" for x in r if not (
        (x["col"] == "dono_user_id" and x["regra"] == "c")
        or (x["col"] in ("criada_por", "alterada_por", "arquivada_por", "por", "alterado_por") and x["regra"] == "n")
        or (x["alvo"] in (f"{s}.refeicoes", f"{s}.itens_refeicao", f"{s}.alimentos") and x["regra"] == "n")
        or (x["col"] == "paciente_id" and x["tab"] == f"{s}.rotinas" and x["regra"] == "n")
        or (x["col"] == "paciente_id" and x["tab"] != f"{s}.rotinas" and x["regra"] == "c")
        or (x["col"] in ("rotina_id", "receita_id", "extra_id") and x["regra"] == "c")
        or (x["col"] in ("aluno_alimento_id", "aluno_receita_id") and x["regra"] == "n"))]
    P.check(len(r) >= 20 and not ruins, f"[K5/{s}] as FKs: dono CASCADE; autores e tabelas da nutri SET NULL (C2/I5); {len(r)} FKs"
            + ("" if not ruins else f" — fora: {ruins}"))
    r = B.ler(f"""select p.proname as f, position('''aceites'', v_aceites' in p.prosrc) > 0 as aceites,
                    position('''aluno_dia_itens''' in p.prosrc) > 0 as wa_export, position('''rotinas_e_dieta''' in p.prosrc) > 0 as conta,
                    position('{s}.wa_dados_do_aluno(p_uid, true)' in p.prosrc) > 0 as apaga,
                    position('''diario-staging''' in p.prosrc) > 0 as bucket_staging, position('''bucket'', ''diario'', ''path''' in p.prosrc) > 0 as bucket_prod,
                    has_function_privilege('authenticated', p.oid, 'EXECUTE') as logado
                  from pg_proc p where p.pronamespace = '{s}'::regnamespace
                   and p.proname in ('exportar_dados_aluno', 'excluir_dados_aluno', 'excluir_conta_profissional')""")
    f = {x["f"]: x for x in r}
    exp_ok = f.get("exportar_dados_aluno", {}).get("aceites") and f["exportar_dados_aluno"]["wa_export"] and not f["exportar_dados_aluno"]["logado"]
    bucket = "bucket_staging" if s == "staging" else "bucket_prod"
    exc_ok = all(f.get(n, {}).get("conta") and f[n]["apaga"] and f[n][bucket] and not f[n]["logado"]
                 and not f[n]["bucket_staging" if s == "public" else "bucket_prod"] for n in ("excluir_dados_aluno", "excluir_conta_profissional"))
    P.check(bool(exp_ok), f"[K6/{s}] a exportar: o corpo vivo (com 'aceites') + as tabelas novas; só o servidor")
    P.check(bool(exc_ok), f"[K7/{s}] as 2 exclusões: o bucket do ambiente ({'diario-staging' if s == 'staging' else 'diario'}) + contam e apagam as tabelas novas; só o servidor")
    # K8 — rodando de verdade, SÓ LEITURA (um uuid inventado: nenhuma pessoa; a exclusão SIMULADA não grava)
    falso = "00000000-0000-4000-8000-00000000abcd"
    r = B.ler(f"""select ({s}.exportar_dados_aluno('{falso}') -> 'tabelas') ?& array['rotinas', 'rotinas_feitas', 'rotinas_historico', 'aluno_alimentos',
                    'aluno_receitas', 'aluno_receita_itens', 'aluno_dia_refeicoes', 'aluno_dia_itens', 'aluno_acessos'] as exportar,
                    ({s}.exportar_dados_aluno('{falso}') ? 'aceites') as aceites,
                    ({s}.excluir_dados_aluno('{falso}', true) -> 'apaga' ->> 'rotinas_e_dieta')::int as conta""")[0]
    P.check(r == {"exportar": True, "aceites": True, "conta": 0},
            f"[K8/{s}] rodando (só leitura, uuid inventado): a exportar traz as 9 chaves novas e o 'aceites'; a exclusão simulada conta 0 ({r})")


def rodar(ids: list[str]) -> None:
    ks = casos()
    for i in ids:
        grupo, corpo, esperado = ks[i]
        try:
            r = B.resultado(bloco_sql(corpo))
        except RuntimeError as e:
            P.check(False, f"[{i}] {grupo}: erro — {str(e).strip().splitlines()[0][:200]}")
            continue
        P.check(r == esperado, f"[{i}] {grupo}: {json.dumps(r, ensure_ascii=False)[:600]}"
                + ("" if r == esperado else f"  ≠ esperado {json.dumps(esperado, ensure_ascii=False)[:400]}"))


def seco(ids: list[str]) -> None:
    ks = casos()
    for i in ids:
        q = bloco_sql(ks[i][1])
        P.check(q.count("$t$") == 2 and q.count("perform set_config('role', 'authenticated'") == q.count("perform set_config('role', 'postgres'"),
                f"[{i}] bloco bem formado ({len(q)} caracteres; cada 'como o app' com o seu VOLTA)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--grupo", default="")
    ap.add_argument("--casos", default="")
    ap.add_argument("--so-catalogo", action="store_true")
    ap.add_argument("--schema", default="staging", choices=("staging", "public"))
    ap.add_argument("--seco", action="store_true")
    a = ap.parse_args()
    ks = casos()
    ids = [x.strip() for x in a.casos.split(",") if x.strip()] or [i for i, (g, _, _) in ks.items() if not a.grupo or g in a.grupo.split(",")]
    if a.seco:
        seco(ids)
        return P.fim()
    if a.so_catalogo or a.schema == "public":
        B.exigir_saude("o catálogo da W-A")
        catalogo(a.schema)
        return P.fim()
    B.exigir_saude("o sql_wa (staging)")
    rodar(ids)
    if not a.casos and (not a.grupo or "catalogo" in a.grupo):
        catalogo("staging")
    return P.fim()


if __name__ == "__main__":
    raise SystemExit(main())
