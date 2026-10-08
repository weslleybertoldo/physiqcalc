#!/usr/bin/env python3
"""Physiq W14 — E2E de servidor (banco principal): os 4 ajustes VALEM (F2 / R12), o link do diário (F1 / R13), o perfil do aluno
no painel (quem vê / quem edita) e a P15.

  --schema staging   tudo (massa da W14: e2e/w14/massa.py) — chamadas REST com o token de cada conta de teste
  --schema public    PRODUÇÃO: só o que não deixa rastro — o WhatsApp numa transação DESFEITA (DRYRUN) com 2 pacientes de teste
                     criados dentro dela, o diário numa transação desfeita e a conferência da P15 (ninguém com login sem acesso)

🚨 WhatsApp: nenhuma mensagem a pessoa real — a prova da fila é SEMPRE dentro de do $dry$ … raise exception 'DRYRUN' (nada é gravado)
e com telefones de teste que não existem (DDD 00). A fila real é contada antes e depois (tem que ficar igual).
Uso: python3 e2e/w14/api.py --schema staging|public
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

p = B.p


def q(sql: str) -> list:
    return B.sql_principal(sql)


def dryrun(sql_corpo: str) -> dict:
    """Roda o corpo dentro de um DO que termina em raise 'DRYRUN <json>' (nada fica gravado) e devolve o json."""
    try:
        q(f"do $dry$ declare r jsonb; begin {sql_corpo} raise exception 'DRYRUN %', r; end $dry$;")
    except RuntimeError as e:
        txt = str(e)
        i = txt.find("DRYRUN ")
        if i < 0:
            raise
        bruto = txt[i + 7:]
        # a mensagem vem escapada dentro do JSON do erro
        bruto = bruto.replace('\\"', '"')
        obj, _ = json.JSONDecoder().raw_decode(bruto)
        return obj
    raise AssertionError("o bloco devia terminar com DRYRUN")


def whatsapp_desfeito(S: str, nutri: str) -> None:
    """F2: com as mensagens LIGADAS entra na fila (aniversário, véspera e a confirmação ao agendar); DESLIGADAS, não."""
    fila_antes = q(f"select count(*)::int n from {S}.mensagens_whatsapp")[0]["n"]
    r = dryrun(f"""
      insert into {S}.whatsapp_instancias (nutricionista_id, status) values ('{nutri}', 'conectado')
        on conflict (nutricionista_id) do update set status = 'conectado';
      update {S}.profiles set config = coalesce(config, '{{}}'::jsonb) || jsonb_build_object('whatsapp', jsonb_build_object('ativo', true, 'horario', '00:00',
          'momentos', jsonb_build_object('aniversario', true, 'lembrete_vespera', true, 'confirmacao_agendamento', true))) where id = '{nutri}';
      with novos as (
        insert into {S}.pacientes (nutricionista_id, nome, telefone, nascimento, ativo, config)
        values ('{nutri}', 'W14 Mensagens Ligadas Teste', '00900001491', ((now() at time zone 'America/Sao_Paulo')::date - interval '30 years')::date, true,
                '{{"mensagens_automaticas": true}}'::jsonb),
               ('{nutri}', 'W14 Mensagens Desligadas Teste', '00900001492', ((now() at time zone 'America/Sao_Paulo')::date - interval '30 years')::date, true,
                '{{}}'::jsonb),
               ('{nutri}', 'W14 Mensagens Falsas Teste', '00900001493', ((now() at time zone 'America/Sao_Paulo')::date - interval '30 years')::date, true,
                '{{"mensagens_automaticas": false}}'::jsonb)
        returning id, nome)
      select jsonb_object_agg(nome, id) into r from novos;
      with cal as (insert into {S}.calendarios (nutricionista_id, nome) values ('{nutri}', 'W14 teste') returning id)
      insert into {S}.agendamentos (nutricionista_id, calendario_id, paciente_id, titulo, inicio, fim)
      select '{nutri}', cal.id, (r ->> k)::uuid, 'Consulta W14 teste',
             ((now() at time zone 'America/Sao_Paulo')::date + 1 + time '10:00') at time zone 'America/Sao_Paulo',
             ((now() at time zone 'America/Sao_Paulo')::date + 1 + time '11:00') at time zone 'America/Sao_Paulo'
        from cal, jsonb_object_keys(r) k;
      perform set_config('request.jwt.claims', json_build_object('sub', '{nutri}', 'role', 'authenticated')::text, true);
      -- o enfileirador num comando e as contagens no seguinte (no mesmo comando as subconsultas não veem o que ele gravou)
      r := r || jsonb_build_object('enfileirar', {S}.whatsapp_enfileirar());
      r := r || jsonb_build_object(
        'ligado', (select coalesce(jsonb_agg(m.tipo order by m.tipo), '[]'::jsonb) from {S}.mensagens_whatsapp m where m.paciente_id = (r ->> 'W14 Mensagens Ligadas Teste')::uuid),
        'desligado', (select count(*) from {S}.mensagens_whatsapp m where m.paciente_id = (r ->> 'W14 Mensagens Desligadas Teste')::uuid),
        'falso', (select count(*) from {S}.mensagens_whatsapp m where m.paciente_id = (r ->> 'W14 Mensagens Falsas Teste')::uuid),
        'destinos', (select coalesce(jsonb_agg(distinct m.destino_e164), '[]'::jsonb) from {S}.mensagens_whatsapp m
                      where m.paciente_id in ((r ->> 'W14 Mensagens Ligadas Teste')::uuid, (r ->> 'W14 Mensagens Desligadas Teste')::uuid)));
    """)
    print("   DRYRUN WhatsApp:", r)
    p.check(r.get("ligado") == ["aniversario", "confirmacao_agendamento", "lembrete_consulta"],
            f"[{S}] mensagens LIGADAS → entra na fila: aniversário, véspera e a confirmação ao agendar ({r.get('ligado')})")
    p.check(r.get("desligado") == 0, f"[{S}] sem a chave (o que a tela mostra: desligado) → NÃO entra na fila ({r.get('desligado')})")
    p.check(r.get("falso") == 0, f"[{S}] desligadas pelo profissional → NÃO entra na fila ({r.get('falso')})")
    p.check(r.get("destinos") == ["+5500900001491"], f"[{S}] só o telefone de teste (DDD 00, não existe) ({r.get('destinos')})")
    fila_depois = q(f"select count(*)::int n from {S}.mensagens_whatsapp")[0]["n"]
    p.check(fila_depois == fila_antes, f"[{S}] fila real do WhatsApp intocada ({fila_antes} → {fila_depois}; tudo desfeito)")


def diario_desfeito(S: str, nutri: str) -> None:
    """F2/F1: o /d/ público e o envio respeitam o diário e o "envio de fotos pelo link" (numa transação desfeita)."""
    # hml-02b: a função da pasta do Storage é uma por schema (a public.diario_pasta_valida só olha a produção; no staging vale a staging.*)
    r = dryrun(f"""
      with n as (insert into {S}.pacientes (nutricionista_id, nome, ativo, config) values ('{nutri}', 'W14 Diario Teste', true, '{{}}'::jsonb) returning id, link_codigo)
      select jsonb_build_object('id', id, 'codigo', link_codigo) into r from n;
      perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
      r := r || jsonb_build_object('ligado', {S}.diario_paciente(r ->> 'codigo') is not null,
                                   'lista_ligado', jsonb_typeof({S}.diario_listar(r ->> 'codigo')));
      update {S}.pacientes set config = '{{"diario_alimentar": false}}'::jsonb where id = (r ->> 'id')::uuid;
      r := r || jsonb_build_object('diario_off_abre', {S}.diario_paciente(r ->> 'codigo') is not null,
        'pasta_diario_off', (select {S}.diario_pasta_valida('{nutri}/' || (r ->> 'id') || '/00000000-0000-0000-0000-000000000000.jpg')));
      begin
        perform {S}.diario_enviar(r ->> 'codigo', 'x', 'image/jpeg', 10, 'almoco', '', now());
        r := r || jsonb_build_object('diario_off_envio', 'aceitou');
      exception when others then r := r || jsonb_build_object('diario_off_envio', sqlerrm); end;
      update {S}.pacientes set config = '{{"acesso_link": false}}'::jsonb where id = (r ->> 'id')::uuid;
      r := r || jsonb_build_object('link_off_abre', {S}.diario_paciente(r ->> 'codigo') is not null);
      begin
        perform {S}.diario_enviar(r ->> 'codigo', 'x', 'image/jpeg', 10, 'almoco', '', now());
        r := r || jsonb_build_object('link_off_envio', 'aceitou');
      exception when others then r := r || jsonb_build_object('link_off_envio', sqlerrm); end;
      update {S}.pacientes set config = '{{}}'::jsonb where id = (r ->> 'id')::uuid;
      begin
        perform {S}.diario_enviar(r ->> 'codigo', 'x', 'image/jpeg', 10, 'almoco', '', now());
        r := r || jsonb_build_object('ligado_envio', 'aceitou');
      exception when others then r := r || jsonb_build_object('ligado_envio', sqlerrm); end;
      r := r || jsonb_build_object('pasta_off', (select {S}.diario_pasta_valida('{nutri}/' || (r ->> 'id') || '/00000000-0000-0000-0000-000000000000.jpg')));
    """)
    print("   DRYRUN diário:", {k: v for k, v in r.items() if k not in ("id", "codigo")})
    p.check(r.get("ligado") is True and r.get("lista_ligado") == "array", f"[{S}] diário e link ligados (o padrão) → o /d/ abre")
    p.check(r.get("diario_off_abre") is False and r.get("diario_off_envio") == "diario_desligado",
            f"[{S}] diário DESLIGADO → o /d/ não abre e o envio recusa 'diario_desligado' ({r.get('diario_off_envio')})")
    p.check(r.get("pasta_diario_off") is False, f"[{S}] Storage: diário desligado → a foto não sobe ({r.get('pasta_diario_off')})")
    p.check(r.get("link_off_abre") is False and r.get("link_off_envio") == "link_desligado",
            f"[{S}] envio pelo link DESLIGADO → o /d/ não abre e o envio pelo link recusa 'link_desligado' ({r.get('link_off_envio')})")
    p.check(r.get("ligado_envio") == "path_invalido", f"[{S}] ligado → passa das travas dos ajustes (para só no arquivo de teste: {r.get('ligado_envio')})")
    p.check(r.get("pasta_off") is True, f"[{S}] Storage: com os ajustes de volta ao padrão a pasta do aluno aceita a foto ({r.get('pasta_off')})")


def staging_rest() -> None:
    S = "staging"
    c = B.conta_de("w13-dono", B.NOME_CONTA)
    raf = B.paciente("Rafael Moura", c)
    marina = B.paciente("Marina Alves", c)
    # quem vê
    st, r = B.rpc("w13-dono", "aluno_perfil", {"p_aluno": raf["id"]})
    p.check(st == 200 and isinstance(r, dict) and r.get("nome") == "Rafael Moura" and r.get("pode_editar") is True,
            f"[perfil] o dono vê e edita o Rafael ({st})")
    p.check(r.get("ajustes") == {"acesso_app": True, "mensagens_automaticas": False, "diario_alimentar": True, "acesso_link": True},
            f"[perfil] os 4 ajustes valendo ({r.get('ajustes')})")
    p.check(r.get("modulos") == ["treino", "nutricao"] and (r.get("personal") or {}).get("nome") == "Lucas Ferreira"
            and (r.get("nutricionista") or {}).get("nome") == "Camila Rocha", "[perfil] módulos e responsáveis")
    st, r2 = B.rpc("w13-nutri", "aluno_perfil", {"p_aluno": raf["id"]})
    p.check(st == 200 and r2.get("pode_editar") is True, f"[perfil] a nutricionista responsável vê e edita ({st})")
    st, r3 = B.rpc("w13-personal2", "aluno_perfil", {"p_aluno": raf["id"]})
    p.check(st != 200 and "sem_acesso" in json.dumps(r3), f"[perfil] P1: o 2º personal (não é responsável) NÃO vê o Rafael ({st} {str(r3)[:80]})")
    st, r4 = B.http("POST", f"{B.API_P}/rest/v1/rpc/aluno_perfil", {"p_aluno": raf["id"]},
                    {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {B.anon(B.PRINCIPAL_REF)}", "Content-Profile": S, "Accept-Profile": S})[:2]
    p.check(st in (401, 403, 404), f"[perfil] sem login: recusado ({st})")
    # quem edita + validação no servidor
    st, e = B.rpc("w13-personal2", "aluno_salvar_ajustes", {"p_aluno": raf["id"], "p_ajustes": {"acesso_app": False}})
    p.check(st != 200 or (isinstance(e, dict) and e.get("ok") is False), f"[ajustes] o 2º personal não mexe ({st})")
    st, e = B.rpc("w13-dono", "aluno_salvar_ajustes", {"p_aluno": raf["id"], "p_ajustes": {"qualquer": True}})
    p.check(isinstance(e, dict) and e.get("erro") == "ajuste_invalido", f"[ajustes] chave desconhecida → ajuste_invalido ({e})")
    st, e = B.rpc("w13-dono", "aluno_salvar_ajustes", {"p_aluno": raf["id"], "p_ajustes": {"diario_alimentar": "sim"}})
    p.check(isinstance(e, dict) and e.get("erro") == "ajuste_invalido", "[ajustes] valor que não é booleano → ajuste_invalido")
    for campo, valor, erro in (("telefone", "123", "telefone_invalido"), ("nascimento", "2090-01-01", "nascimento_invalido"),
                               ("email", "sem-arroba", "email_invalido"), ("genero", "x", "genero_invalido"), ("nome", "R", "nome_invalido"),
                               ("cpf", "123", "cpf_invalido")):
        st, e = B.rpc("w13-dono", "aluno_salvar_dados", {"p_aluno": marina["id"], "p_dados": {campo: valor}})
        p.check(isinstance(e, dict) and e.get("erro") == erro, f"[dados] {campo}={valor!r} → {erro} ({e if not isinstance(e, dict) else e.get('erro')})")
    # salvar e voltar (Marina: sem login; o updated_at muda e o cadastro fica igual ao de antes no fim)
    st, e = B.rpc("w13-dono", "aluno_salvar_dados", {"p_aluno": marina["id"], "p_dados": {"objetivo": "emagrecer", "apelido": "Mari"}})
    p.check(st == 200 and e.get("ok") is True and e["perfil"]["objetivo"] == "emagrecer" and e["perfil"]["apelido"] == "Mari",
            "[dados] objetivo e apelido salvos (devolve o perfil novo)")
    B.rpc("w13-dono", "aluno_salvar_dados", {"p_aluno": marina["id"], "p_dados": {"objetivo": "", "apelido": ""}})
    p.check(B.paciente("Marina Alves", c)["objetivo"] is None, "[dados] vazio volta a null")
    # link novo: o antigo para de abrir
    antigo = marina["link_codigo"]
    st, e = B.rpc("w13-dono", "aluno_novo_link", {"p_aluno": marina["id"]})
    novo = e.get("link_codigo") if isinstance(e, dict) else None
    p.check(st == 200 and novo and novo != antigo and len(novo) == 10, f"[link] link novo ({antigo} → {novo})")
    st, velho = B.http("POST", f"{B.API_P}/rest/v1/rpc/diario_paciente", {"p_codigo": antigo},
                       {"apikey": B.anon(B.PRINCIPAL_REF), "Content-Profile": S, "Accept-Profile": S})[:2]
    st2, atual = B.http("POST", f"{B.API_P}/rest/v1/rpc/diario_paciente", {"p_codigo": novo},
                        {"apikey": B.anon(B.PRINCIPAL_REF), "Content-Profile": S, "Accept-Profile": S})[:2]
    p.check(velho is None and isinstance(atual, dict) and atual.get("paciente_id") == marina["id"],
            f"[link] o código antigo não abre mais o diário; o novo abre ({st} {velho} · {st2} {str(atual)[:60]})")
    # o aviso único da P15 (Camila): o número = a lista
    st, m = B.rpc("w13-nutri", "mensagens_desligadas", {})
    nomes = sorted(a["nome"] for a in (m or {}).get("alunos", []))
    p.check(st == 200 and m.get("mostrar") is True and m.get("total") == len(nomes) == 3 and nomes == ["Beatriz Lima", "Marina Alves", "Rafael Moura"],
            f"[aviso] Camila: 3 pacientes com telefone e as mensagens desligadas; o número = a lista ({m.get('total') if m else None} · {nomes})")
    st, m2 = B.rpc("w13-dono", "mensagens_desligadas", {})
    p.check(st == 200 and m2.get("mostrar") is False, f"[aviso] o Lucas (sem WhatsApp no Physiq e sem pacientes de nutrição) não vê o aviso ({m2.get('mostrar') if m2 else None})")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schema", required=True, choices=["staging", "public"])
    a = ap.parse_args()
    S = a.schema
    B.ESTADO["schema"] = S
    if S == "staging":
        nutri = B.uid("w13-nutri")
        staging_rest()
    else:
        # conta de TESTE que existe em produção (sem pacientes reais): nutri.teste.claude@physiqnutri.app
        nutri = q("select id::text from public.profiles where email = 'nutri.teste.claude@physiqnutri.app'")[0]["id"]
    whatsapp_desfeito(S, nutri)
    diario_desfeito(S, nutri)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
