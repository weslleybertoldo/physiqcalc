#!/usr/bin/env python3
"""Physiq hml-09 — PROVA F4/H2 em PRODUÇÃO com 1 conta DESCARTÁVEL (OK dele na pergunta 5: "sim (1 conta descartável pra provar a
exclusão)"): excluir.hml09.teste.claude@physiqnutri.app ("Excluir HML09", sem papel). Spec §4.4 (~/projetos/physiqcalc-scratch/
hml/hml09/spec.md), no molde do e2e/w07/smoke_prod.py (modo descartavel). Um subcomando por passo, rodados um por um: cada um é
idempotente, para no 1º ❌ e grava a saída em ~/projetos/physiqcalc-scratch/hml/hml09/prova_<passo>.txt; o andamento (uid, tid e
os passos feitos) fica em prova_estado.json, na mesma pasta.

  criar   1. o login pela API admin (e-mail confirmado, sem papel; senha em ~/.physiq-teste-excluir-hml09 — 600, gerada se faltar,
             nunca impressa); o gatilho cria public.profiles e staging.profiles; login por senha (cab_login: o captcha global)
  dados   2. como a pessoa: trocar-token com x-schema public (nascem o usuário do Treino e o public.physiq_identidades); a foto do
             Perfil em fotos-perfil/<uid>/ (o caminho da tela Conta: upload + profiles.dados_profissionais.foto_url); 1 academia e
             1 série no Treino pelo PostgREST com o JWT da troca (passa pela RLS; as colunas do upload do PowerSync)
  antes   3. a foto pelo uid e pelo tid → prova_antes.json. Principal: auth.users, identities, sessions, as colunas de FK para
             auth.users nos 2 schemas (68 + 68, lidas do catálogo) e a pasta no Storage. Treino: auth.users (deleted_at), identities,
             physiq_identidades, as FKs (15 + 15) e as tabelas da W7 (tb_treino_series e outras não têm FK). + os totais das tabelas
             tocadas (só count(*): nenhuma linha de outra pessoa é lida)
  trava   4. a exclusão pelo STAGING: {simular} e, SÓ se ela já vier recusada, {confirmacao: EXCLUIR} → 403 conta_real_no_staging +
             dados_em_producao (vem do Treino: o vínculo de produção do passo 2); depois a foto tem que ficar igual à do passo 3.
             Só passa DEPOIS do deploy do D1/D3: a simulação com 200 (ou qualquer outra resposta) = PARA sem mandar o EXCLUIR
  tela    5. a exclusão pela TELA de produção (Playwright 390 px, sessão injetada como no Caso.entrar): Perfil › Excluir minha conta
             → conferência → EXCLUIR → aviso → /entrar; prints ~/projetos/physiqcalc-scratch/prints/hml09/prod_conferencia.png e
             prod_excluida.png (conferir). Pede a trava feita depois do antes (ou --sem-trava). Conta "sem nada" (sem conta e sem
             matrícula): desde o D7 entra pelas Boas-vindas › "Excluir minha conta" (o link abre o Perfil com o Excluir aberto)
  depois  6. a foto de novo → prova_depois.json e a conferência: principal com 0 em auth.users/identities/sessions, 0 nas colunas
             e na pasta, a senha recusada com invalid_credentials (o código, não só o 400); Treino com a âncora soft (deleted_at,
             sem e-mail, senha e sessão), physiq_identidades 0, as tabelas "apaga" 0, physiq_profiles 'excluido' sem foto;
             /excluir-conta 200 sem login; totais depois ≥ antes − o que era da conta
          7. as cópias de segurança: SÓ os horários (criação/exclusão × as cópias de ~/backups/physiq pela data do arquivo e a
             rodada diária das 03:23) — nada é aberto nem decifrado
  fim     8. apaga de vez SÓ a âncora do Treino (o tid, com deleted_at e sem nada ligado — conferidos na hora) e confere
             physiq_profiles = 0
  estado  só mostra em que passo a conta está (só leitura)
Regras no código: só o e-mail acima (outro e-mail, uid ou tid → para; nunca as revisao.*); toda consulta e escrita usa o uid
(principal) ou o tid (Treino) dela, sem filtro largo; o único DELETE /admin/users é o do passo 8. Saída sem dado pessoal: só
contagens, códigos e o uid/tid da descartável. REPO = a worktree deste arquivo (a da hml-09); nada é gravado em ~/backups/physiq.
Uso: python3 e2e/hml09/prova_prod.py <criar|dados|antes|trava|tela|depois|fim|estado> [--base https://physiqcalc.com.br]
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import importlib.util
import json
import sys
import time
import uuid
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_comum_hml09", Path(__file__).resolve().parent / "_comum.py")
C = importlib.util.module_from_spec(_ESPEC)
sys.modules["_comum_hml09"] = C
_ESPEC.loader.exec_module(C)  # type: ignore[union-attr]

S = "public"
B5 = C.B5
B5.ESTADO["schema"] = S  # o Caso e o login de teste no schema de produção (o Caso.entrar só zera limite no staging)
B5.PRINTS = C.PRINTS  # o print e o diagnóstico do Caso vão para prints/hml09
DESC = "excluir-hml09"  # a senha: ~/.physiq-teste-excluir-hml09 (B5.senha_de)
EMAIL = "excluir.hml09.teste.claude@physiqnutri.app"
NOME = "Excluir HML09"
if not C.eh_email_de_teste(EMAIL) or "revisao" in EMAIL:
    raise SystemExit("TRAVA: a descartável tem que ser *.teste.claude@physiqnutri.app")
BASES_PROD = ("https://physiqcalc.com.br", "https://www.physiqcalc.com.br")
ESTADO = C.SAIDA / "prova_estado.json"
ANTES, TRAVA, DEPOIS = (C.SAIDA / f"prova_{x}.json" for x in ("antes", "trava", "depois"))
BACKUPS = Path.home() / "backups" / "physiq"  # só listado (nome e data) — nunca gravado nem aberto
DIARIA = (3, 23)  # physiq-backup-diario.timer: 03:23, com até 5 min de atraso aleatório
DURACAO_COPIA = 45 * 60  # TimeoutStartSec do serviço: a cópia termina em até 45 min
RETENCAO_DIAS = 30  # physiq-backups-limpeza: apaga com 29+ dias, 1×/dia → nenhuma cópia passa de 30 dias (FRASE_BACKUPS)
ACADEMIA = "Academia da prova hml-09"
# a foto do Perfil: 48 × 48 px lisa (sem rosto nem dado de ninguém)
FOTO_JPG = base64.b64decode(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/"
    "2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAwADADASIAAhEBAxEB/8QA"
    "FQABAQAAAAAAAAAAAAAAAAAAAAL/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAQG/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/a"
    "AAwDAQACEQMRAD8AgBt1IAAAAAAAAAAAAAAAD//Z")
# as tabelas do Treino da W7 (e2e/w07/api.py) — a coluna da pessoa (o id de lá); a maioria NÃO tem FK para auth.users
TABS_T = ["physiq_profiles", "physiq_avaliacoes", "physiq_registros_fotos", "physiq_pagamentos", "physiq_assinaturas", "physiq_identidades",
          "tb_treino_series", "tb_treino_concluido", "tb_treino_dia_override", "treino_historico", "exercicio_ordem_usuario",
          "tb_exercicios_usuario", "tb_grupos_treino_usuario", "tb_grupos_exercicios_usuario", "tb_academias", "tb_academia_pesos",
          "tb_semana_treinos", "tb_series_padrao_usuario", "tb_grupos_treino_perfis", "edge_rate_limits"]
COL_T = {"physiq_profiles": "id", "physiq_identidades": "treino_user_id"}
# o que a exclusão do aluno apaga no Treino (physiq_excluir_aluno + o vínculo — e2e/w07/api.py:conferir)
APAGA_T = {"tb_treino_series", "tb_treino_concluido", "tb_treino_dia_override", "treino_historico", "exercicio_ordem_usuario",
           "tb_exercicios_usuario", "tb_grupos_treino_usuario", "tb_grupos_exercicios_usuario", "tb_academias", "tb_academia_pesos",
           "edge_rate_limits", "physiq_identidades"}
VOLATEIS = {"edge_rate_limits"}  # a fila de limites muda sozinha com os logins das outras contas (fora da regra dos totais)
PASSOS = ("criar", "dados", "antes", "trava", "tela", "depois", "fim")


# ───────────────────────── estado e travas da conta ─────────────────────────


def estado() -> dict:
    est = C.ler_json(ESTADO) or {"email": EMAIL, "passos": {}}
    if est.get("email") not in (None, EMAIL):
        raise C.Parou(f"TRAVA: o {ESTADO.name} é de outra conta — parei")
    return est


def feito(est: dict, passo: str) -> dict | None:
    return (est.get("passos") or {}).get(passo)


def marcar(est: dict, passo: str, **extra) -> None:
    est.setdefault("passos", {})[passo] = {"em": C.agora_iso(), "epoch": time.time(), **extra}
    C.json_arquivo(ESTADO, est)


def exigir(o: C.Saida, cond: object, texto: str) -> None:
    """Trava ou pré-condição: falhou → ❌ e o passo para sem mexer em nada."""
    if not cond:
        o.ok(False, texto)


def mesma_conta(o: C.Saida, est: dict, uid: object = None, tid: object = None, email: object = None) -> None:
    """TRAVA: tudo age SÓ na descartável — o e-mail fixo e o uid/tid gravados no prova_estado.json."""
    if email is not None:
        exigir(o, str(email).strip().lower() == EMAIL, "TRAVA: outro e-mail — parei")
    if uid is not None:
        exigir(o, C.eh_uuid(uid) and uid == (est.get("uid") or uid), "TRAVA: outro uid (não é o do prova_estado.json) — parei")
    if tid is not None:
        exigir(o, C.eh_uuid(tid) and tid == (est.get("tid") or tid), "TRAVA: outro tid (não é o do prova_estado.json) — parei")


def conta() -> dict | None:
    """O login da descartável no principal, pelo e-mail fixo (só leitura)."""
    r = C.ler(C.PRINCIPAL_REF, f"""
      select id::text as id, extract(epoch from created_at)::float8 as criada_epoch, email_confirmed_at is not null as confirmada,
             raw_app_meta_data ->> 'role' as papel
        from auth.users where lower(email) = {C.txt(EMAIL)}""")
    if len(r) > 1:
        raise C.Parou("TRAVA: mais de um login com o e-mail da descartável — parei")
    return r[0] if r else None


def sem_nada(uid: str) -> bool:
    """O "sem_nada" da minha_situacao (sem conta e sem matrícula → o app abre as Boas-vindas), aproximado por COUNT."""
    u = C.txt(C.uuid_ok(uid))
    r = C.ler(C.PRINCIPAL_REF, f"""
      select (select count(*) from public.contas where dono_id = {u}::uuid)::int
           + (select count(*) from public.conta_membros where user_id = {u}::uuid and status <> 'removido')::int
           + (select count(*) from public.pacientes where user_id = {u}::uuid and deleted_at is null)::int as n,
             (select coalesce(raw_app_meta_data ->> 'role', '') in ('master', 'admin') from auth.users where id = {u}::uuid) as master""")[0]
    return r["n"] == 0 and not r["master"]


def cab_principal(token: str) -> dict:
    return {"apikey": C.anon(C.PRINCIPAL_REF), "Authorization": f"Bearer {token}", "Accept-Profile": S, "Content-Profile": S}


def rest_treino(metodo: str, caminho: str, token: str, corpo=None, extra: dict | None = None):
    """PostgREST do Treino com o JWT da troca (a RLS vale) — o caminho das escritas do PowerSync (lib/powersync/connector.ts:80)."""
    cab = {"apikey": C.anon(C.TREINO_REF), "Authorization": f"Bearer {token}", "Accept-Profile": S, "Content-Profile": S, **(extra or {})}
    return C.http(metodo, f"{C.API_T}/rest/v1/{caminho}", corpo, cab)


def erro_rest(r: object) -> str:
    return f"{r.get('code')}: {str(r.get('message'))[:120]}" if isinstance(r, dict) and r.get("message") else ""


# ───────────────────────── a foto (só leitura, só COUNT e marcas) ─────────────────────────


def condicoes(colunas, esquema: str, valor: str, extra: dict[str, list[str]] | None = None) -> dict[str, list[str]]:
    """tabela → as condições (OR) das linhas da conta: as FKs para auth.users do schema + as colunas a mais."""
    v = C.txt(C.uuid_ok(valor))
    m: dict[str, list[str]] = {}
    for s, t, c in colunas:
        if s == esquema:
            m.setdefault(t, []).append(f"{C.nome_sql(c)} = {v}::uuid")
    for t, conds in (extra or {}).items():
        m.setdefault(t, []).extend(conds)
    return m


def totais(ref: str, esquema: str, mapa: dict[str, list[str]]) -> dict[str, dict]:
    """O total de cada tabela e as linhas da conta nela — só count(*)."""
    partes = [f"select {C.txt(f'{esquema}.{t}')} as k, (select count(*) from {C.nome_sql(esquema)}.{C.nome_sql(t)})::int as total, "
              f"(select count(*) from {C.nome_sql(esquema)}.{C.nome_sql(t)} where {' or '.join(conds)})::int as da_conta"
              for t, conds in sorted(mapa.items())]
    return {r["k"]: {"total": r["total"], "da_conta": r["da_conta"]} for r in C.ler(ref, "\nunion all\n".join(partes))} if partes else {}


def foto(uid: str, tid: str, rotulo: str) -> dict:
    """A foto da conta pelo uid (principal) e pelo tid (Treino)."""
    u, t = C.txt(C.uuid_ok(uid)), C.txt(C.uuid_ok(tid))
    login_p = C.ler(C.PRINCIPAL_REF, f"""
      select (select count(*) from auth.users where id = {u}::uuid)::int as users,
             (select count(*) from auth.identities where user_id = {u}::uuid)::int as identities,
             (select count(*) from auth.sessions where user_id = {u}::uuid)::int as sessions,
             (select email_confirmed_at is not null from auth.users where id = {u}::uuid) as confirmado,
             (select raw_app_meta_data ->> 'role' from auth.users where id = {u}::uuid) as papel,
             (select extract(epoch from created_at)::float8 from auth.users where id = {u}::uuid) as criado_epoch""")[0]
    cols_p = C.fks(C.PRINCIPAL_REF)
    storage_p = {r["b"]: r["n"] for r in C.ler(C.PRINCIPAL_REF, f"""
      select bucket_id::text as b, count(*)::int as n from storage.objects
       where name like {C.txt(uid + '/%')} or owner = {u}::uuid or owner_id = {u} group by 1""")}
    matriculas = [r["id"] for r in C.ler(C.PRINCIPAL_REF, f"select id::text as id from public.pacientes where user_id = {u}::uuid order by 1")]
    totais_p = totais(C.PRINCIPAL_REF, "public", condicoes(cols_p, "public", uid))
    totais_p["storage.objects[fotos-perfil]"] = C.ler(C.PRINCIPAL_REF, f"""
      select (select count(*) from storage.objects where bucket_id = 'fotos-perfil')::int as total,
             (select count(*) from storage.objects where bucket_id = 'fotos-perfil' and name like {C.txt(uid + '/%')})::int as da_conta""")[0]

    login_t = C.ler(C.TREINO_REF, f"""
      select (select count(*) from auth.users where id = {t}::uuid)::int as users,
             (select deleted_at is not null from auth.users where id = {t}::uuid) as apagado,
             (select extract(epoch from deleted_at)::float8 from auth.users where id = {t}::uuid) as apagado_epoch,
             (select coalesce(email, '') like '%@%' from auth.users where id = {t}::uuid) as email_com_arroba,
             (select coalesce(encrypted_password, '') <> '' from auth.users where id = {t}::uuid) as tem_senha,
             (select count(*) from auth.sessions where user_id = {t}::uuid)::int as sessions,
             (select count(*) from auth.identities where user_id = {t}::uuid)::int as identities,
             (select count(*) from auth.identities where user_id = {t}::uuid
                 and (coalesce(email, '') like '%@%' or coalesce(identity_data ->> 'email', '') like '%@%'))::int as identidades_com_email""")[0]
    vinculo = C.ler(C.TREINO_REF, f"""
      select (select count(*) from public.physiq_identidades where principal_user_id = {u}::uuid or treino_user_id = {t}::uuid)::int as public,
             (select count(*) from staging.physiq_identidades where principal_user_id = {u}::uuid or treino_user_id = {t}::uuid)::int as staging""")[0]
    cols_t = C.fks(C.TREINO_REF)
    tabelas_t = C.contar_tabelas(C.TREINO_REF, [(s, tb, COL_T.get(tb, "user_id")) for s in ("public", "staging") for tb in TABS_T], tid)
    pf = C.ler(C.TREINO_REF, f"select status::text as status, foto_url is null as sem_foto from public.physiq_profiles where id = {t}::uuid")
    extra_t = {tb: [f"{C.nome_sql(COL_T.get(tb, 'user_id'))}::text = {t}"] for tb in TABS_T if tabelas_t.get(f"public.{tb}") is not None}
    extra_t.setdefault("physiq_identidades", []).append(f"principal_user_id = {u}::uuid")
    return {
        "rotulo": rotulo, "em": C.agora_iso(), "epoch": time.time(), "email": EMAIL, "uid": uid, "tid": tid,
        "principal": {"login": login_p, "colunas": C.contar(C.PRINCIPAL_REF, cols_p, uid), "storage": storage_p, "matriculas": matriculas},
        "treino": {"login": login_t, "vinculo": vinculo, "colunas": C.contar(C.TREINO_REF, cols_t, tid), "tabelas": tabelas_t,
                   "perfil": {"existe": bool(pf), "status": pf[0]["status"] if pf else None, "sem_foto": pf[0]["sem_foto"] if pf else None},
                   # o limite da trocar-token guarda o uid DO PRINCIPAL (sem FK) — só registro
                   "limites_pelo_uid": C.contar_tabelas(C.TREINO_REF, [("public", "edge_rate_limits", "user_id")], uid)},
        "totais": {"principal": totais_p, "treino": totais(C.TREINO_REF, "public", condicoes(cols_t, "public", tid, extra_t))},
    }


def nucleo(f: dict) -> dict:
    """O que é DA CONTA numa foto — sem as sessões (cada login abre uma) e sem os totais (a produção mexe neles)."""
    p, t = f["principal"], f["treino"]
    return {
        "principal.login": {k: p["login"].get(k) for k in ("users", "identities", "confirmado", "papel")},
        "principal.colunas": p["colunas"], "principal.storage": p["storage"], "principal.matriculas": p["matriculas"],
        "treino.login": {k: t["login"].get(k) for k in ("users", "apagado", "email_com_arroba", "tem_senha", "identities", "identidades_com_email")},
        "treino.vinculo": t["vinculo"], "treino.colunas": t["colunas"], "treino.perfil": t["perfil"],
        "treino.tabelas": {k: v for k, v in t["tabelas"].items() if k.split(".", 1)[1] not in VOLATEIS},
    }


# ───────────────────────── os passos ─────────────────────────


def passo_criar(o: C.Saida, a, sess: C.Sessoes) -> None:
    est = estado()
    exigir(o, not feito(est, "tela") and not DEPOIS.exists(),
           "a prova já excluiu esta conta: criar de novo é OUTRO login novo em produção (só com o OK dele; para recomeçar, mova os hml/hml09/prova_*)")
    c = conta()
    exigir(o, c is not None or not ANTES.exists(), "a conta sumiu depois da foto de antes (prova_antes.json): não recrio — veja `estado`")
    senha = B5.senha_de(DESC)
    sp = C.service(C.PRINCIPAL_REF)
    cab = {"apikey": sp, "Authorization": f"Bearer {sp}"}
    if c:
        mesma_conta(o, est, uid=c["id"])
        uid = c["id"]
        st, _, _ = C.http("PUT", f"{C.PRINCIPAL_URL}/auth/v1/admin/users/{C.uuid_ok(uid)}", {"password": senha, "email_confirm": True}, cab)
        o.ok(st == 200, f"o login já existia (uid {uid}): senha do arquivo e e-mail confirmado ({st})")
    else:
        st, r, _ = C.http("POST", f"{C.PRINCIPAL_URL}/auth/v1/admin/users",
                          {"email": EMAIL, "password": senha, "email_confirm": True, "user_metadata": {"full_name": NOME}}, cab)
        uid = r.get("id") if isinstance(r, dict) else None
        o.ok(st == 200 and C.eh_uuid(uid), f"login criado pela API admin, com o e-mail confirmado (uid {uid}) ({st})")
    est.update(email=EMAIL, uid=uid)
    C.json_arquivo(ESTADO, est)
    c = conta()
    o.ok(c is not None and c["id"] == uid and c["confirmada"] and c["papel"] in (None, "pessoa"),
         f"auth.users: 1 login, e-mail confirmado, sem papel de comando (role {c['papel'] if c else None!r}: 'pessoa' é o que o handle_new_user dá a todo login sem convite)")
    u = C.txt(uid)
    r = C.ler(C.PRINCIPAL_REF, f"select (select count(*) from public.profiles where id = {u}::uuid)::int as public, "
                               f"(select count(*) from staging.profiles where id = {u}::uuid)::int as staging")[0]
    o.ok(r == {"public": 1, "staging": 1}, f"o gatilho criou public.profiles e staging.profiles ({r})")
    st, s = C.login_senha(EMAIL, senha)
    o.ok(st == 200 and s.get("access_token"), f"login por senha (cab_login, por causa do captcha) ({st})")
    tok = sess.guardar("principal", s["access_token"], "descartável (login de conferência)")
    mesma_conta(o, est, uid=C.claims(tok).get("sub"), email=C.claims(tok).get("email"))
    marcar(est, "criar", criada_epoch=c["criada_epoch"])


def passo_dados(o: C.Saida, a, sess: C.Sessoes) -> None:
    est = estado()
    exigir(o, feito(est, "criar"), "rode `criar` antes")
    exigir(o, not feito(est, "tela"), "a conta já foi excluída (passo tela)")
    c = conta()
    exigir(o, c is not None, "a descartável não existe no principal — rode `criar`")
    mesma_conta(o, est, uid=c["id"])
    uid = c["id"]
    C.saude_treino(o, "os dados no Treino")
    st, s = C.login_senha(EMAIL, B5.senha_de(DESC))
    o.ok(st == 200 and s.get("access_token"), f"login por senha ({st})")
    tok_p = sess.guardar("principal", s["access_token"], "descartável (principal)")
    mesma_conta(o, est, uid=C.claims(tok_p).get("sub"), email=C.claims(tok_p).get("email"))

    # 2a. a troca do app, x-schema public: nascem o usuário do Treino (o gatilho cria o physiq_profiles) e o vínculo de produção
    st, t, _ = C.http("POST", f"{C.API_T}/functions/v1/trocar-token", {}, {"Authorization": f"Bearer {tok_p}", "x-schema": S, "Origin": C.ORIGEM_PROD})
    t = t if isinstance(t, dict) else {}
    tid = t.get("treino_user_id")
    o.ok(st == 200 and C.eh_uuid(tid) and t.get("access_token"), f"trocar-token (x-schema public) → sessão do Treino ({st} {C.resumo(t)}; tid {tid})")
    tok_t = sess.guardar("treino", t["access_token"], "descartável (Treino)")
    mesma_conta(o, est, tid=tid)
    cl = C.claims(tok_t)
    exigir(o, cl.get("sub") == tid and str(cl.get("email", "")).lower() == EMAIL, "TRAVA: o JWT do Treino não é o da descartável — parei")
    if est.get("tid") != tid:
        est["tid"] = tid
        C.json_arquivo(ESTADO, est)
    u, tl = C.txt(uid), C.txt(tid)
    r = C.ler(C.TREINO_REF, f"""
      select (select count(*) from public.physiq_identidades where principal_user_id = {u}::uuid and treino_user_id = {tl}::uuid)::int as vinculo,
             (select count(*) from staging.physiq_identidades where principal_user_id = {u}::uuid)::int as vinculo_staging,
             (select count(*) from auth.users where id = {tl}::uuid and lower(email) = {C.txt(EMAIL)} and deleted_at is null)::int as login,
             (select count(*) from public.physiq_profiles where id = {tl}::uuid)::int as perfil""")[0]
    o.ok(r == {"vinculo": 1, "vinculo_staging": 0, "login": 1, "perfil": 1}, f"no Treino: o login, o physiq_profiles e o vínculo de PRODUÇÃO, nenhum no staging ({r})")
    mudou = False

    # 2b. a foto do Perfil — o caminho da tela Conta (enviarFotoPerfil + gravarFoto): fotos-perfil/<uid>/foto-<ms>.jpg
    def fotos() -> int:
        return C.ler(C.PRINCIPAL_REF, f"select count(*)::int as n from storage.objects where bucket_id = 'fotos-perfil' and name like {C.txt(uid + '/%')}")[0]["n"]

    n = fotos()
    if n:
        o.ok(True, f"a foto do Perfil já estava na pasta ({n})")
    else:
        caminho = f"{uid}/foto-{int(time.time() * 1000)}.jpg"
        st, r, _ = C.http("POST", f"{C.PRINCIPAL_URL}/storage/v1/object/fotos-perfil/{caminho}", FOTO_JPG,
                          {"apikey": C.anon(C.PRINCIPAL_REF), "Authorization": f"Bearer {tok_p}", "Content-Type": "image/jpeg",
                           "x-upsert": "false", "cache-control": "max-age=31536000"})
        o.ok(st in (200, 201), f"foto enviada como a pessoa, na pasta dela ({st} {C.resumo(r)})")
        mudou = True
        st, r, _ = C.http("GET", f"{C.PRINCIPAL_URL}/rest/v1/profiles?id=eq.{uid}&select=dados_profissionais", None, cab_principal(tok_p))
        o.ok(st == 200 and isinstance(r, list) and len(r) == 1, f"o próprio cadastro (public.profiles) lido pela RLS ({st})")
        atual = r[0].get("dados_profissionais")
        url = f"{C.API_P}/storage/v1/object/public/fotos-perfil/{caminho}"
        st, r, _ = C.http("PATCH", f"{C.PRINCIPAL_URL}/rest/v1/profiles?id=eq.{uid}",
                          {"dados_profissionais": {**(atual if isinstance(atual, dict) else {}), "foto_url": url}},
                          {**cab_principal(tok_p), "Prefer": "return=minimal"})
        o.ok(st in (200, 204), f"profiles.dados_profissionais.foto_url gravado como a pessoa ({st} {erro_rest(r)})")

    # 2c. 1 academia e 1 série no Treino, pelo PostgREST com o JWT da troca (o upsert do PowerSync; colunas do SeletorAcademia e do
    # useAcoesSeries, conferidas no catálogo em 08/10)
    st, r, _ = rest_treino("GET", f"tb_academias?select=id&user_id=eq.{tid}", tok_t)
    o.ok(st == 200 and isinstance(r, list), f"as academias dela, lidas pela RLS ({st})")
    if r:
        o.ok(True, f"a academia já existia ({len(r)})")
    else:
        corpo = {"id": str(uuid.uuid4()), "user_id": tid, "nome": ACADEMIA, "created_at": C.agora_iso()}
        st, r, _ = rest_treino("POST", "tb_academias", tok_t, corpo, {"Prefer": "return=minimal,resolution=merge-duplicates"})
        o.ok(st in (200, 201, 204), f"1 academia criada pela RLS ({st} {erro_rest(r)})")
        mudou = True
    st, r, _ = rest_treino("GET", f"tb_treino_series?select=id&user_id=eq.{tid}", tok_t)
    o.ok(st == 200 and isinstance(r, list), f"as séries dela, lidas pela RLS ({st})")
    if r:
        o.ok(True, f"a série já existia ({len(r)})")
    else:
        st, ex, _ = rest_treino("GET", "tb_exercicios?select=id&professor_id=is.null&order=nome.asc&limit=1", tok_t)
        ex_id = ex[0].get("id") if st == 200 and isinstance(ex, list) and ex else None
        o.ok(C.eh_uuid(ex_id), f"um exercício do catálogo global (professor_id nulo) ({st})")
        corpo = {"id": str(uuid.uuid4()), "user_id": tid, "exercicio_id": ex_id, "exercicio_usuario_id": None, "data_treino": B5.hoje().isoformat(),
                 "slot_idx": 0, "numero_serie": 1, "peso": 40, "reps": 10, "tempo_segundos": None, "distancia_km": None, "pace_segundos_km": None,
                 "concluida": True, "academia_nome": ACADEMIA, "updated_at": C.agora_iso()}
        st, r, _ = rest_treino("POST", "tb_treino_series", tok_t, corpo, {"Prefer": "return=minimal,resolution=merge-duplicates"})
        o.ok(st in (200, 201, 204), f"1 série criada pela RLS ({st} {erro_rest(r)})")
        mudou = True
    r = C.ler(C.TREINO_REF, f"select (select count(*) from public.tb_academias where user_id = {tl}::uuid)::int as academias, "
                            f"(select count(*) from public.tb_treino_series where user_id = {tl}::uuid)::int as series")[0]
    n = fotos()
    o.ok(r["academias"] >= 1 and r["series"] >= 1 and n >= 1, f"conferido (só leitura): {r['academias']} academia, {r['series']} série, {n} foto")
    if mudou:
        for x in ("antes", "trava"):  # a foto de antes e a trava valem para os dados de agora
            est.setdefault("passos", {}).pop(x, None)
    marcar(est, "dados", tid=tid)


def passo_antes(o: C.Saida, a, sess: C.Sessoes) -> None:
    est = estado()
    exigir(o, feito(est, "dados") and C.eh_uuid(est.get("tid")), "rode `dados` antes (o tid nasce nele)")
    exigir(o, not feito(est, "tela"), "a conta já foi excluída: a foto de antes não pode mais ser tirada")
    c = conta()
    exigir(o, c is not None, "a descartável não existe no principal")
    mesma_conta(o, est, uid=c["id"])
    C.saude_treino(o, "a foto de antes")
    f = foto(est["uid"], est["tid"], "antes")
    C.json_arquivo(ANTES, f)
    p, t = f["principal"], f["treino"]
    o.ok(p["login"]["users"] == 1 and p["login"]["identities"] >= 1, f"principal: 1 login, {p['login']['identities']} identidade(s), {p['login']['sessions']} sessão(ões)")
    o.ok(p["colunas"].get("public.profiles.id") == 1,
         f"principal: {len(p['colunas'])} colunas de FK contadas (os 2 schemas); {sum(1 for v in p['colunas'].values() if v)} com linha, entre elas o public.profiles")
    o.ok(p["storage"].get("fotos-perfil", 0) >= 1, f"principal: a foto na pasta dela ({p['storage']})")
    o.ok(t["login"]["users"] == 1 and not t["login"]["apagado"] and t["vinculo"] == {"public": 1, "staging": 0},
         f"Treino: o login vivo e o vínculo de produção ({t['vinculo']}); {len(t['colunas'])} colunas de FK contadas")
    o.ok((t["tabelas"].get("public.tb_academias") or 0) >= 1 and (t["tabelas"].get("public.tb_treino_series") or 0) >= 1 and t["perfil"]["existe"],
         "Treino: a academia, a série e o physiq_profiles")
    o.linha(f"   foto: {ANTES} · totais: {len(f['totais']['principal'])} tabelas no principal, {len(f['totais']['treino'])} no Treino")
    est.setdefault("passos", {}).pop("trava", None)  # a trava se compara com ESTA foto
    marcar(est, "antes")


def passo_trava(o: C.Saida, a, sess: C.Sessoes) -> None:
    est = estado()
    exigir(o, feito(est, "antes") and ANTES.exists(), "rode `antes` primeiro (a trava se compara com a foto dele)")
    exigir(o, not feito(est, "tela"), "a conta já foi excluída")
    c = conta()
    exigir(o, c is not None, "a descartável não existe no principal")
    mesma_conta(o, est, uid=c["id"])
    C.saude_treino(o, "a trava")
    st, s = C.login_senha(EMAIL, B5.senha_de(DESC))
    o.ok(st == 200 and s.get("access_token"), f"login por senha ({st})")
    tok = sess.guardar("principal", s["access_token"], "descartável (principal)")
    mesma_conta(o, est, uid=C.claims(tok).get("sub"), email=C.claims(tok).get("email"))

    def pelo_staging(corpo: dict) -> tuple[int, dict]:  # a chamada do Perfil (perfil/pecas/api.ts), com x-schema staging
        st_, r_, _ = C.funcao(C.PRINCIPAL_URL, "excluir-minha-conta", corpo, tok, C.anon(C.PRINCIPAL_REF), "staging", C.ORIGEM_STAGING)
        return st_, r_

    def recusada(st_: int, r_: dict) -> bool:
        return st_ == 403 and r_.get("erro") == "conta_real_no_staging" and r_.get("motivo") == "dados_em_producao"

    st1, r1 = pelo_staging({"simular": True})
    if st1 == 200:
        o.ok(False, f"pelo staging, {{simular}} → 200: a trava NÃO está publicada (o deploy do D1/D3 vem antes deste passo) — PAREI, o EXCLUIR não saiu ({C.resumo(r1)})")
    o.ok(recusada(st1, r1), f"pelo staging, {{simular}} → 403 conta_real_no_staging + dados_em_producao ({st1} {C.resumo(r1)})"
         + ("" if recusada(st1, r1) else " — PAREI, o EXCLUIR não saiu"))
    st2, r2 = pelo_staging({"confirmacao": "EXCLUIR"})
    o.ok(recusada(st2, r2), f"pelo staging, {{confirmacao: EXCLUIR}} → 403 conta_real_no_staging + dados_em_producao ({st2} {C.resumo(r2)})")
    st3, r3 = pelo_staging({"simular": True, "fluxo": "profissional"})
    o.linha(f"   (informativo) fluxo do profissional, só a simulação: {st3} {C.resumo(r3)}")
    sess.fechar(o)  # o login deste passo sai antes da foto
    f = foto(est["uid"], est["tid"], "trava")
    C.json_arquivo(TRAVA, f)
    dif = C.diferencas(nucleo(C.ler_json(ANTES) or {}), nucleo(f))
    o.ok(not dif, "a foto da conta ficou IGUAL à do passo 3 (sem as sessões e os totais)" + (f" — MUDOU: {', '.join(dif[:12])}" if dif else ""))
    marcar(est, "trava", simular=st1, excluir=st2)


def tokens_do_treino(caso) -> list[str]:
    """A sessão do Treino que o app guardou no navegador (a troca do app) — para o logout se a exclusão não aconteceu."""
    try:
        itens = caso.pg.evaluate("() => Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k)).map((k) => localStorage.getItem(k))")
    except Exception:  # noqa: BLE001
        return []
    saida = []
    for v in itens or []:
        try:
            tok = json.loads(v).get("access_token")
        except Exception:  # noqa: BLE001
            tok = None
        if tok:
            saida.append(tok)
    return saida


def passo_tela(o: C.Saida, a, sess: C.Sessoes) -> None:
    est = estado()
    exigir(o, feito(est, "antes") and ANTES.exists(), "rode `antes` primeiro (sem a foto de antes não há prova)")
    c = conta()
    if c is None:
        exigir(o, feito(est, "tela"), "a conta não existe no principal, mas a tela não rodou — veja `estado`")
        o.ok(True, "a conta já foi excluída pela tela nesta prova (nada a fazer)")
        return
    mesma_conta(o, est, uid=c["id"])
    uid = c["id"]
    tv, ta = feito(est, "trava"), feito(est, "antes")
    exigir(o, a.sem_trava or (tv and tv["epoch"] > ta["epoch"]),
           "rode `trava` depois do `antes` (ou --sem-trava: a prova do D3 com esta conta fica de fora — depois da tela ela não existe mais)")
    # hml-09 (D7): a conta "sem nada" (sem conta e sem matrícula) cai nas Boas-vindas — o link "Excluir minha conta" de lá leva ao
    # Perfil com o Excluir aberto (antes do D7 o GateSemModulo mandava o /perfil de volta às Boas-vindas e não havia como excluir)
    nada = sem_nada(uid)
    C.saude_treino(o, "a tela")
    from playwright.sync_api import sync_playwright  # noqa: PLC0415 — só este passo abre navegador

    B5.CONTAS[DESC] = (EMAIL, B5.senha_de(DESC))
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        caso, excluida = None, False
        try:
            caso = B5.Caso(nav, a.base, "prod", "excluir", desktop=False)  # 390 × 844 × 3,4 (celular)
            sessao = caso.entrar(DESC, "/privacidade", zerar=False)  # login por senha (cab_login) + a sessão no localStorage
            tok = sess.guardar("principal", sessao["access_token"], "descartável (sessão injetada)")
            mesma_conta(o, est, uid=C.claims(tok).get("sub"), email=C.claims(tok).get("email"))
            # D6: a cópia local do treino sai sem erro — os 2 avisos possíveis (SheetExcluir e PowerSyncProvider) ficam anotados
            avisos_d6: list[str] = []
            caso.pg.on("console", lambda m: avisos_d6.append(m.text)
                       if ("banco local" in m.text or "disconnectAndClear" in m.text) else None)
            if nada:
                caso.ir("/")
                caso.fechar_avisos()
                caso.esperar(lambda: caso.caminho().startswith("/boas-vindas") and caso.tem("[data-boas-vindas-excluir]"), 60)
                o.ok(caso.caminho().startswith("/boas-vindas") and caso.tem("[data-boas-vindas-excluir]"),
                     f"D7: sem nada → Boas-vindas com o link 'Excluir minha conta' ({caso.caminho()})")
                caso.pg.locator("[data-boas-vindas-excluir]").first.scroll_into_view_if_needed()  # o link fica no fim da página
                o.linha(f"   print: {caso.print('boas_vindas')}")
                caso.pg.locator("[data-boas-vindas-excluir]").first.click()
            else:
                caso.ir("/perfil")
            caso.fechar_avisos()
            caso.esperar(lambda: caso.tem("[data-aba-perfil]"), 60)
            o.ok(caso.tem("[data-aba-perfil]"), f"a aba Perfil abriu no celular (390 px) ({caso.caminho()})")
            folha = caso.pg.locator("[data-sheet-excluir]")
            if not (folha.count() and folha.first.is_visible()):  # pelo link das Boas-vindas (?excluir=1) a folha já abre sozinha
                caso.fechar_avisos()
                caso.pg.locator("text=Excluir minha conta").first.click()

            def estado_folha() -> str:
                return (folha.first.get_attribute("data-estado-excluir") or "") if folha.count() else ""

            caso.esperar(lambda: estado_folha() not in ("", "conferindo"), 60)
            ef = estado_folha()
            if ef != "pronto":
                o.linha(f"   print: {caso.print('excluir_recusa')}")
            o.ok(ef == "pronto", f"Perfil › Excluir minha conta: a conferência ficou pronta ({ef or 'sem a folha'})")
            apaga = caso.pg.locator("[data-excluir-apaga]").first.inner_text()
            o.ok("O seu login no Physiq" in apaga and "1 série(s) com cargas" in apaga and "academias que você criou (1)" in apaga,
                 "a conferência mostra o que sai: o login, a série e a academia do passo 2")
            botao = caso.pg.locator("[data-excluir-confirmar]").first
            o.ok(botao.is_disabled(), "sem a palavra, o botão fica travado")
            caso.pg.locator("input[data-excluir-confirmacao]").first.fill("EXCLUIR")
            o.ok(caso.esperar(lambda: not botao.is_disabled(), 5), "EXCLUIR digitado → o botão liga")
            o.linha(f"   print: {caso.print('conferencia')}")
            visto = {"aviso": False}

            def saiu() -> bool:
                if "Sua conta foi excluída." in caso.texto():
                    visto["aviso"] = True
                return caso.caminho().startswith("/entrar")

            botao.click()
            chegou = caso.esperar(saiu, 120, passo=0.25)
            saiu()
            excluida = C.ler(C.PRINCIPAL_REF, f"select count(*)::int as n from auth.users where id = {C.txt(uid)}::uuid")[0]["n"] == 0
            if excluida:
                sess.esquecer(tok)  # a sessão saiu junto com o login
                marcar(est, "tela", excluida_epoch=time.time())
            erro_tela = caso.pg.locator("[data-excluir-erro]").first.inner_text() if caso.tem("[data-excluir-erro]") else ""
            o.ok(excluida, "o login sumiu do principal depois do EXCLUIR (só leitura)" + (f" — a tela disse: {erro_tela!r}" if erro_tela else ""))
            o.ok(chegou, f"→ /entrar ({caso.caminho()})")
            o.ok(visto["aviso"], "o aviso \"Sua conta foi excluída.\" apareceu")
            o.linha(f"   print: {caso.print('excluida')}")
            o.ok(not avisos_d6, f"D6: a cópia local do treino saiu sem erro no console (avisos: {avisos_d6[:2]})")
            borda = [x.split(" ")[0] for x in caso.rede if "excluir-minha-conta" in x]
            o.ok(borda[-1:] == ["200"], f"a borda respondeu 200 ao EXCLUIR (respostas da excluir-minha-conta na tela: {borda})")
            est["passos"]["tela"].update(borda=borda, prints=[str(C.PRINTS / "prod_conferencia.png"), str(C.PRINTS / "prod_excluida.png")])
            C.json_arquivo(ESTADO, est)
        finally:
            if caso is not None:
                if not excluida:  # nada foi excluído: a sessão do Treino que o app abriu também sai no fim
                    for tk in tokens_do_treino(caso):
                        sess.guardar("treino", tk, "Treino (o app no navegador)")
                try:
                    caso.fim()
                except Exception:  # noqa: BLE001
                    pass
            nav.close()
    graves = [t for bom, t in B5.p.itens if not bom]
    o.ok(not graves, f"sem erro de página ({graves[:2]})")


def copias_de_seguranca(o: C.Saida, criada: float, excluida: float) -> dict:
    """Passo 7 — SÓ os horários (nada é aberto nem decifrado). A conta viveu de `criada` a `excluida`; uma cópia só pode guardá-la se
    rodou nessa janela: a data do arquivo (mtime) marca o fim da cópia, que leva até 45 min."""
    def quando(e: float) -> str:
        return dt.datetime.fromtimestamp(e).strftime("%d/%m %H:%M:%S")

    arquivos = []
    for arq in sorted(BACKUPS.iterdir()) if BACKUPS.is_dir() else []:
        fim_ = arq.stat().st_mtime
        if not arq.name.startswith(".") and fim_ >= criada and fim_ - DURACAO_COPIA <= excluida:
            arquivos.append({"arquivo": arq.name, "data": quando(fim_), "cifrada": arq.name.endswith(".tar.age"), "sai_ate": quando(fim_ + RETENCAO_DIAS * 86400)})
    diarias, dia = [], dt.date.fromtimestamp(criada)
    while dia <= dt.date.fromtimestamp(excluida):
        ini = dt.datetime.combine(dia, dt.time(*DIARIA)).timestamp()
        if ini <= excluida and ini + 5 * 60 + DURACAO_COPIA >= criada:
            diarias.append(quando(ini))
        dia += dt.timedelta(days=1)
    janela = f"criada {quando(criada)}, excluída {quando(excluida)}"
    if not arquivos and not diarias:
        o.ok(True, f"cópias de segurança: nenhuma rodou com a conta viva ({janela}; a diária é às 03:23) — nenhum .tar.age a guarda")
    else:
        o.ok(True, f"cópias de segurança: {len(arquivos)} arquivo(s) e {len(diarias)} rodada(s) diária(s) na janela ({janela}) — a conta pode estar "
                   "nelas até a limpeza (29+ dias; nenhuma passa de 30 — a FRASE_BACKUPS: \"apagadas em até 30 dias\")")
        for x in arquivos:
            o.linha(f"   {x['arquivo']} ({x['data']}{'' if x['cifrada'] else ', AINDA SEM CIFRAR'}) → sai até {x['sai_ate']}")
        for d in diarias:
            o.linha(f"   rodada diária de {d}")
    return {"janela": janela, "arquivos": arquivos, "diarias": diarias}


def passo_depois(o: C.Saida, a, sess: C.Sessoes) -> None:
    est = estado()
    exigir(o, feito(est, "tela"), "rode `tela` antes (a exclusão pela tela de produção)")
    exigir(o, not feito(est, "fim"), "o fim já apagou a âncora do Treino: vale a conferência do prova_depois.json")
    antes = C.ler_json(ANTES)
    exigir(o, antes, "sem o prova_antes.json")
    uid, tid = antes["uid"], antes["tid"]
    mesma_conta(o, est, uid=uid, tid=tid)
    C.saude_treino(o, "a foto de depois")
    f = foto(uid, tid, "depois")
    C.json_arquivo(DEPOIS, f)
    p, t, ap = f["principal"], f["treino"], antes["principal"]
    lp, lt = p["login"], t["login"]
    o.ok(lp["users"] == 0 and lp["identities"] == 0 and lp["sessions"] == 0, f"principal: 0 em auth.users, identities e sessions ({lp['users']}, {lp['identities']}, {lp['sessions']})")
    o.ok(conta() is None, "principal: nenhum login com o e-mail da descartável")
    sobra = [k for k, v in p["colunas"].items() if v]
    o.ok(not sobra and set(p["colunas"]) == set(ap["colunas"]), f"principal: 0 nas {len(p['colunas'])} colunas de FK para auth.users (os 2 schemas)"
         + (f" — sobrou: {', '.join(sobra)}" if sobra else ""))
    o.ok(not any(p["storage"].values()), f"principal: 0 objetos na pasta dela no Storage (antes: {ap['storage']})")
    if ap["matriculas"]:  # a conta tinha matrícula: fica com o profissional, desligada do login (P19)
        lista = ", ".join(f"{C.txt(C.uuid_ok(x))}::uuid" for x in ap["matriculas"])
        m = C.ler(C.PRINCIPAL_REF, f"select (user_id is null) as solta, ativo, (config ->> 'conta_excluida_em') is not null as marcada from public.pacientes where id in ({lista})")
        o.ok(len(m) == len(ap["matriculas"]) and all(x["solta"] and not x["ativo"] and x["marcada"] for x in m),
             f"principal: a(s) {len(m)} matrícula(s) ficam com o profissional, desligadas do login e desativadas")
    st, r = C.login_senha(EMAIL, B5.senha_de(DESC))
    if st == 200 and r.get("access_token"):
        sess.guardar("principal", r["access_token"], "login que NÃO devia entrar")
    codigo = r.get("error_code") or r.get("code")
    o.ok(st == 400 and codigo == "invalid_credentials", f"login por senha → 400 invalid_credentials (o código, não só o 400) ({st} {codigo})")
    o.ok(lt["users"] == 1 and lt["apagado"], f"Treino: 1 âncora com deleted_at (soft delete) ({lt['users']} login; deleted_at {'preenchido' if lt['apagado'] else 'nulo'})")
    o.ok(not lt["email_com_arroba"] and not lt["tem_senha"] and lt["sessions"] == 0,
         f"Treino: a âncora sem e-mail, sem senha e sem sessão (e-mail {'com @' if lt['email_com_arroba'] else 'embaralhado'}, senha "
         f"{'sim' if lt['tem_senha'] else 'não'}, {lt['sessions']} sessão(ões))")
    o.ok(lt["identidades_com_email"] == 0, f"Treino: as {lt['identities']} identidade(s) sem e-mail")
    o.ok(t["vinculo"] == {"public": 0, "staging": 0}, f"Treino: physiq_identidades 0 ({t['vinculo']})")
    sobra_t = [k for k, v in t["tabelas"].items() if v and k.split(".", 1)[1] in APAGA_T]
    o.ok(not sobra_t, f"Treino: 0 nas tabelas que a exclusão apaga ({len(APAGA_T)} por schema)" + (f" — sobrou: {', '.join(sobra_t)}" if sobra_t else ""))
    pf = t["perfil"]
    o.ok(pf["existe"] and pf["status"] == "excluido" and pf["sem_foto"], f"Treino: physiq_profiles marcado 'excluido' e com foto_url nula ({pf})")
    presos = [k for k, v in t["colunas"].items() if v and k != "public.physiq_profiles.id"]
    o.ok(not presos, "Treino: nas FKs para auth.users só fica a âncora (public.physiq_profiles.id)" + (f" — e mais: {', '.join(presos)}" if presos else ""))
    st, _, _ = C.http("GET", f"{a.base}/excluir-conta", None, {})
    o.ok(st == 200, f"/excluir-conta abre sem login ({st})")
    # 7. as cópias de segurança — só os horários
    criada = (feito(est, "criar") or {}).get("criada_epoch") or ap["login"].get("criado_epoch")
    excluida = max(x for x in ((feito(est, "tela") or {}).get("excluida_epoch"), lt.get("apagado_epoch")) if x)
    f["copias"] = copias_de_seguranca(o, float(criada), float(excluida))
    C.json_arquivo(DEPOIS, f)
    # totais: depois ≥ antes − o que era da conta (a produção tem uso real no meio); por último, para nada acima ficar sem registro
    baixos, n = [], 0
    for banco in ("principal", "treino"):
        for k, va in antes["totais"][banco].items():
            if k.split(".", 1)[-1] in VOLATEIS:
                continue
            n += 1
            vd = f["totais"][banco].get(k)
            if vd is None or vd["total"] < va["total"] - va["da_conta"]:
                baixos.append(f"{banco}:{k} ({va['total']} → {vd['total'] if vd else '—'}; da conta {va['da_conta']})")
    marcar(est, "depois", totais_abaixo=len(baixos))
    o.ok(not baixos, f"totais: depois ≥ antes − o que era da conta, nas {n} tabelas tocadas"
         + (f" — ABAIXO (conferir se foi uso real de alguém no meio): {'; '.join(baixos[:8])}" if baixos else ""))


def passo_fim(o: C.Saida, a, sess: C.Sessoes) -> None:
    est = estado()
    exigir(o, feito(est, "depois"), "rode `depois` antes (a conferência vem antes de apagar a âncora)")
    if (feito(est, "depois") or {}).get("totais_abaixo"):
        o.linha("   atenção: o `depois` deixou tabela(s) com o total abaixo de antes − o da conta (prova_depois.txt) — o fim só mexe na âncora do Treino")
    antes = C.ler_json(ANTES)
    exigir(o, antes, "sem o prova_antes.json")
    uid, tid = antes["uid"], antes["tid"]
    mesma_conta(o, est, uid=uid, tid=tid)
    u, t = C.txt(C.uuid_ok(uid)), C.txt(C.uuid_ok(tid))
    vivo = C.ler(C.PRINCIPAL_REF, f"select count(*)::int as n from auth.users where id = {u}::uuid")[0]["n"]
    exigir(o, vivo == 0 and conta() is None, "o login do principal ainda existe: a âncora do Treino só sai depois da exclusão")
    C.saude_treino(o, "o fim")
    ancora = C.ler(C.TREINO_REF, f"select deleted_at is not null as apagado, coalesce(email, '') like '%@%' as email_com_arroba from auth.users where id = {t}::uuid")
    if not ancora:
        o.ok(True, f"a âncora do Treino (tid {tid}) já tinha saído")
    else:
        o.ok(ancora[0]["apagado"] and not ancora[0]["email_com_arroba"], f"conferido agora: o tid {tid} é a âncora soft (deleted_at não nulo, sem e-mail)")
        cols = C.contar(C.TREINO_REF, C.fks(C.TREINO_REF), tid)
        presos = [k for k, v in cols.items() if v and k != "public.physiq_profiles.id"]
        o.ok(not presos, f"conferido agora: pegada falsa — nada ligado ao tid nas {len(cols)} colunas de FK além do physiq_profiles (o apagar de vez levaria junto)"
             + (f" — PRESO: {', '.join(presos)}" if presos else ""))
        r = C.ler(C.TREINO_REF, f"""
          select (select status::text from public.physiq_profiles where id = {t}::uuid) as status,
                 (select count(*) from public.physiq_identidades where treino_user_id = {t}::uuid or principal_user_id = {u}::uuid)::int
               + (select count(*) from staging.physiq_identidades where treino_user_id = {t}::uuid or principal_user_id = {u}::uuid)::int as vinculos""")[0]
        o.ok(r == {"status": "excluido", "vinculos": 0}, f"conferido agora: o physiq_profiles é o da exclusão e nenhum vínculo aponta para o tid ({r})")
        sk = C.service(C.TREINO_REF)
        st, _, _ = C.http("DELETE", f"{C.TREINO_URL}/auth/v1/admin/users/{C.uuid_ok(tid)}", None, {"apikey": sk, "Authorization": f"Bearer {sk}"})
        o.ok(st == 200, f"a âncora do teste no Treino apagada de vez pela API admin — SÓ o tid {tid} ({st})")
    r = C.ler(C.TREINO_REF, f"""
      select (select count(*) from auth.users where id = {t}::uuid)::int as login,
             (select count(*) from public.physiq_profiles where id = {t}::uuid)::int as perfil_public,
             (select count(*) from staging.physiq_profiles where id = {t}::uuid)::int as perfil_staging""")[0]
    o.ok(r == {"login": 0, "perfil_public": 0, "perfil_staging": 0}, f"Treino: physiq_profiles = 0 e nenhum login para o tid ({r})")
    marcar(est, "fim")


def passo_estado(o: C.Saida, a, sess: C.Sessoes) -> None:
    est = estado()
    c = conta()
    if c:
        o.linha(f"principal: o login existe (uid {c['id']}; {'e-mail confirmado' if c['confirmada'] else 'e-mail NÃO confirmado'}; papel {c['papel'] or '—'})"
                + (" — sem nada: o app abre as Boas-vindas" if sem_nada(c["id"]) else ""))
        n = C.ler(C.PRINCIPAL_REF, f"select count(*)::int as n from storage.objects where bucket_id = 'fotos-perfil' and name like {C.txt(c['id'] + '/%')}")[0]["n"]
        o.linha(f"   foto do Perfil: {n} objeto(s) na pasta")
    else:
        o.linha("principal: nenhum login com o e-mail da descartável")
    tid = est.get("tid")
    if C.eh_uuid(tid):
        t = C.txt(tid)
        r = C.ler(C.TREINO_REF, f"""
          select (select count(*) from auth.users where id = {t}::uuid)::int as login,
                 (select deleted_at is not null from auth.users where id = {t}::uuid) as apagado,
                 (select count(*) from public.tb_academias where user_id = {t}::uuid)::int as academias,
                 (select count(*) from public.tb_treino_series where user_id = {t}::uuid)::int as series,
                 (select count(*) from public.physiq_profiles where id = {t}::uuid)::int as perfil""")[0]
        situacao = "apagado (soft)" if r["apagado"] else ("vivo" if r["login"] else "apagado de vez")
        o.linha(f"Treino: tid {tid} — login {situacao}; {r['academias']} academia, {r['series']} série, physiq_profiles {r['perfil']}")
    else:
        o.linha("Treino: sem tid ainda (nasce no passo dados)")
    for arq in (ANTES, TRAVA, DEPOIS):
        o.linha(f"{arq.name}: {'existe' if arq.exists() else '—'}")
    for x in PASSOS:
        f = feito(est, x)
        o.linha(f"  {'✅' if f else '⏳'} {x}" + (f" ({f['em']})" if f else ""))
    o.linha(f"próximo passo: {next((x for x in PASSOS if not feito(est, x)), 'nenhum — a prova terminou')}")


PASSO = {"criar": passo_criar, "dados": passo_dados, "antes": passo_antes, "trava": passo_trava, "tela": passo_tela, "depois": passo_depois,
         "fim": passo_fim, "estado": passo_estado}


def main() -> int:
    ap = argparse.ArgumentParser(description="Physiq hml-09 — prova F4/H2 em produção com 1 conta descartável (um passo por vez)")
    ap.add_argument("passo", choices=list(PASSO))
    ap.add_argument("--base", default=BASES_PROD[0], help="o site de produção (tela e depois)")
    ap.add_argument("--sem-trava", action="store_true", help="tela: excluir sem o passo trava (a prova do D3 fica de fora)")
    a = ap.parse_args()
    a.base = a.base.rstrip("/")
    o = C.Saida(f"prova_{a.passo}", parar=True)
    o.linha(f"descartável: {EMAIL} · REPO {C.REPO}")
    sess = C.Sessoes()
    try:
        if a.base not in BASES_PROD:
            raise C.Parou(f"--base tem que ser o site de produção ({' ou '.join(BASES_PROD)})")
        PASSO[a.passo](o, a, sess)
    except C.Parou as e:
        if not e.impresso:
            o.ok(False, str(e), parar=False)
    except Exception as e:  # noqa: BLE001
        o.ok(False, f"exceção {type(e).__name__}: {str(e)[:300]}", parar=False)
    finally:
        sess.fechar(o)
    return o.fim()


if __name__ == "__main__":
    sys.exit(main())
