#!/usr/bin/env python3
"""Physiq hml-12 (homologação, 08/10/2026) — aceite dos textos e consentimentos (H-30) no BANCO PRINCIPAL (spec §9.2).

Roda DEPOIS da migração supabase-principal/migrations/20261008200000_hml12_aceite_e_consentimento.sql no schema pedido.

  --schema staging   versão LIGADA (2026-10-08). RPC pelo PostgREST com o login das contas de TESTE (Content-Profile: staging) e
                     conferências por SQL numa transação só leitura (Management API, ~/.pc-pat).
       positivos     minha_situacao().legal (versão; aceite pendente na conta que nunca aceitou); aceitar → 1 linha 'textos'; aceitar
                     de novo → continua 1; o aluno do app com o consentimento e a data → 'saude' + a data na matrícula; a pré-consulta
                     de 6 argumentos com a versão → a resposta com consentimento_versao; o responsável registrado → menor null (e
                     retirado → sem_responsavel); o Exportar traz 'aceites' (sem registrado_por)
       negativos     sem login → sem_login (servidor) e o visitante sem permissão; versão errada → versao_desatualizada; a tabela
                     aceites pela API (select, insert, update, delete) → negado; entrar_sem_profissional de 2 → atualize_o_app; de 5
                     sem consentimento → sem_consentimento_saude; com 17 anos → menor_de_18; preconsulta_responder de 5 →
                     sem_consentimento; cadastro_link_enviar com 15 anos → menor_de_16 (a RPC que a função alunos chama depois do
                     captcha: o captcha do staging está ligado, então o teste chama a RPC como o servidor); a RPC antiga do Nutri com
                     15 → menor_de_16 (o gatilho); aluno_salvar_dados com 15 → menor_de_16; aprovar um pendente de 15 (criado com a
                     versão desligada, como um de antes da virada) pela função alunos → 400 {"ok": false, "erro": "menor_de_16"}, sem
                     matrícula; profissional de outra conta → sem_acesso; o aceite do staging não aparece em public.aceites
       conferência   staging textos_legais.versao = VERSAO_TEXTOS (src/publico/legal/versao.ts); os privilégios da spec §3.4
  --schema public    SÓ LEITURA: a tabela existe, 0 linhas, RLS ligada, sem policy e sem privilégio da API; a versão nula; as
                     funções novas existem (com os privilégios da §3.4); minha_situacao com o 'legal' (pelo corpo); os gatilhos.

Contas de TESTE do staging (senhas em ~/.physiq-teste-<nome>; nenhuma é usada pelos outros E2E do repo):
  w2l-equipe  sem nada (o aceite da conta "nova"; as recusas da entrar_sem_profissional; a tabela pela API)
  w2l-alunob  aluno do app, sem data (o consentimento de saúde e a data no aceite)
  w2l-dono2   dono da conta do w2l-aluno2 (Editar dados, o responsável, o formulário e o código da pré-consulta/cadastro)
  w2l-aluno2  aluno do w2l-dono2 (a trava de idade e o responsável vistos pelo aluno)
  w13-limite  profissional de OUTRA conta (sem_acesso)
Dados: tudo o que o teste muda volta ao valor de antes no fim (finally): as datas de nascimento das 2 matrículas, o consentimento de
saúde do aluno do app (o evento 'revogou' de suporte, o processo da retirada: a próxima rodada começa igual) e o responsável (retirado),
o formulário e as respostas da pré-consulta de teste e o pendente de teste (criado e apagado pelo teste). Os eventos em staging.aceites
ficam (só crescem; é o staging). Na 2ª rodada o aceite dos textos já existe: o teste confere o "pendente" contra o que o banco tem antes.

Uso: python3 e2e/hml12/banco.py --schema staging|public
"""
from __future__ import annotations

import argparse
import datetime as dt
import re
import secrets
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "w02"))
from _comum import PRINCIPAL_REF, PRINCIPAL_URL, Placar, anon, http, login_principal, pat, service, sql_principal  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
API_P = "https://api-principal.physiqcalc.com.br"   # o Worker na frente das funções (o mesmo caminho do app)
ORIGEM_STAGING = "https://physiqcalc-staging.vercel.app"
CONTAS = {k: f"{k.replace('-', '.')}.teste.claude@physiqnutri.app" for k in ("w2l-equipe", "w2l-alunob", "w2l-dono2", "w2l-aluno2", "w13-limite")}
NOVA, APP, PROF, ALUNO, OUTRO = "w2l-equipe", "w2l-alunob", "w2l-dono2", "w2l-aluno2", "w13-limite"

# spec §3.4: assinatura → EXECUTE esperado para (PUBLIC, anon, authenticated)
FUNCOES = {
    "versao_dos_textos()": (False, False, False), "idade_em(date)": (False, False, False),
    "saude_vigente(uuid)": (False, False, False), "responsavel_vigente(uuid)": (False, False, False),
    "legal_da_situacao(uuid)": (False, False, False), "idade_minima_guarda()": (False, False, False),
    "aceitar_no_acesso(text, text, boolean, date, text)": (False, False, True),
    "entrar_sem_profissional(text, text, date, text, text)": (False, False, True),
    "aluno_responsavel(uuid)": (False, False, True), "aluno_responsavel_registrar(uuid, jsonb)": (False, False, True),
    "preconsulta_responder(text, text, text, text, jsonb, text)": (False, True, True),
    # as que mudam de corpo: o EXECUTE de antes
    "minha_situacao()": (False, False, True), "exportar_dados_aluno(uuid)": (False, False, False),
    "entrar_sem_profissional(text, text)": (False, False, True), "preconsulta_responder(text, text, text, text, jsonb)": (False, True, True),
    "cadastro_link_enviar(text, jsonb)": (False, False, False), "aluno_pendente_decidir(uuid, uuid, boolean)": (False, False, True),
}
TROCAS = {"minha_situacao()": "legal_da_situacao(v_uid)", "exportar_dados_aluno(uuid)": "'aceites', v_aceites",
          "entrar_sem_profissional(text, text)": "atualize_o_app", "preconsulta_responder(text, text, text, text, jsonb)": "sem_consentimento",
          "cadastro_link_enviar(text, jsonb)": "menor_de_16", "aluno_pendente_decidir(uuid, uuid, boolean)": "menor_de_16"}


# ───────────────────────────── utilitários ─────────────────────────────

def ler(sql: str) -> tuple[bool, object]:
    """Uma consulta numa transação só leitura (como o dono, pela Management API); (deu certo, linhas) ou (False, o erro curto)."""
    st, r, _ = http("POST", f"https://api.supabase.com/v1/projects/{PRINCIPAL_REF}/database/query",
                    {"query": "set transaction read only;\n" + sql}, {"Authorization": f"Bearer {pat()}"}, timeout=180)
    if st in (200, 201):
        return True, r or []
    msg = str(r.get("message") if isinstance(r, dict) else r)
    if "ERROR:" in msg:
        msg = msg[msg.index("ERROR:"):].splitlines()[0]
    return False, f"HTTP {st}: {msg[:200]}"


def um(sql: str) -> dict:
    ok_, r = ler(sql)
    if not ok_ or not isinstance(r, list) or len(r) != 1:
        raise RuntimeError(f"consulta: {r if not ok_ else f'{len(r)} linhas'}")
    return r[0]


def q(v: object) -> str:
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def rpc(S: str, fn: str, args: dict, token: str | None = None, servidor: bool = False) -> tuple[int, object]:
    """A RPC pelo PostgREST: com o login (token), como visitante (sem token) ou como o servidor (a chave de serviço)."""
    if servidor:
        sk = service(PRINCIPAL_REF)
        cab = {"apikey": sk, "Authorization": f"Bearer {sk}"}
    else:
        cab = {"apikey": anon(PRINCIPAL_REF)} | ({"Authorization": f"Bearer {token}"} if token else {})
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/rest/v1/rpc/{fn}", args, cab | {"Content-Profile": S, "Accept-Profile": S}, timeout=60)
    return st, r


def rest(S: str, token: str, metodo: str, tabela: str, filtro: str = "", corpo=None) -> tuple[int, object]:
    cab = {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {token}", "Accept-Profile": S, "Content-Profile": S,
           "Prefer": "return=representation"}
    st, r, _ = http(metodo, f"{PRINCIPAL_URL}/rest/v1/{tabela}{('?' + filtro) if filtro else ''}", corpo, cab, timeout=60)
    return st, r


def curto(r: object) -> str:
    """O que dá para mostrar de uma resposta (códigos e o 'legal'; nunca dado pessoal)."""
    if isinstance(r, dict):
        keep = {k: r[k] for k in ("ok", "erro", "versao", "code", "message", "legal", "faixa", "ligado", "pode_editar", "ja_era") if k in r}
        if isinstance(r.get("atual"), dict):
            keep["atual"] = "registro"
        elif "atual" in r:
            keep["atual"] = None
        return str(keep)[:220]
    return str(r)[:160]


def erro_pg(st: int, r: object) -> str | None:
    """A mensagem do RAISE (o código) num 400 do PostgREST."""
    return r.get("message") if st == 400 and isinstance(r, dict) else None


def versao_do_app() -> str | None:
    m = re.search(r'export const VERSAO_TEXTOS = "(\d{4}-\d{2}-\d{2})"', (REPO / "src/publico/legal/versao.ts").read_text(encoding="utf-8"))
    return m.group(1) if m else None


def hoje_sp() -> dt.date:
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date()


def anos_atras(n: int, mais_dias: int = 0) -> str:
    h = hoje_sp()
    try:
        d = h.replace(year=h.year - n)
    except ValueError:  # 29/02
        d = h.replace(year=h.year - n, day=28)
    return (d + dt.timedelta(days=mais_dias)).isoformat()


# ───────────────────────────── estrutura (os 2 schemas, só leitura) ─────────────────────────────

def estrutura(S: str, p: Placar) -> None:
    lst = ", ".join(f"('{S}.{f}')" for f in FUNCOES)
    ok_, r = ler(f"""
      select x.f, p.oid is not null as existe,
             has_function_privilege('public', p.oid, 'EXECUTE') as pub, has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as logado, p.prosecdef as definer,
             coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%' as sp_fixo, coalesce(p.prosrc, '') as corpo
        from (values {lst}) as x(f) left join pg_proc p on p.oid = to_regprocedure(x.f)""")
    if not ok_:
        p.check(False, f"[{S}] funções da hml-12" + f" — {r}")
        return
    f = {x["f"].split(".", 1)[1]: x for x in r}
    faltam = [k for k, x in f.items() if not x["existe"]]
    p.check(not faltam, f"[{S}] as {len(FUNCOES)} funções da §3.4 existem" + (f" — faltam: {', '.join(faltam)}" if faltam else ""))
    erradas = [k for k, (pub, an, lg) in FUNCOES.items() if f[k]["existe"] and (f[k]["pub"], f[k]["anon"], f[k]["logado"]) != (pub, an, lg)]
    p.check(not erradas, f"[{S}] EXECUTE como na §3.4 (auxiliares e gatilho: ninguém da API; RPCs: só logado; pré-consulta de 6: visitante"
                         " e logado; as 6 que mudam: o de antes)" + (f" — diferentes: {', '.join(erradas)}" if erradas else ""))
    novas = list(FUNCOES)[:11]
    sem = [k for k in novas if f[k]["existe"] and not (f[k]["sp_fixo"] and (f[k]["definer"] or k == "idade_em(date)"))]
    p.check(not sem, f"[{S}] as novas com search_path fixo e SECURITY DEFINER (a idade_em só faz a conta)" + (f" — {', '.join(sem)}" if sem else ""))
    sem_troca = [k for k, t in TROCAS.items() if f[k]["existe"] and t not in f[k]["corpo"]]
    p.check(not sem_troca, f"[{S}] as 6 que mudam com a troca no corpo (minha_situacao com o 'legal', exportar com 'aceites'…)"
                           + (f" — sem: {', '.join(sem_troca)}" if sem_troca else ""))

    ok_, r = ler(f"""
      select to_regclass('{S}.aceites') is not null as existe,
             coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('{S}.aceites')), false) as rls,
             (select count(*) from pg_policy pl where pl.polrelid = to_regclass('{S}.aceites')) as policies,
             (select string_agg(x, ',') from unnest(array['public', 'anon', 'authenticated', 'service_role']) x
               where to_regclass('{S}.aceites') is not null
                 and (has_table_privilege(x, to_regclass('{S}.aceites'), 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                      or has_any_column_privilege(x, to_regclass('{S}.aceites'), 'SELECT, INSERT, UPDATE, REFERENCES'))) as com_privilegio,
             (select count(*) from pg_trigger t where not t.tgisinternal and t.tgfoid = to_regprocedure('{S}.idade_minima_guarda()')
                and t.tgrelid in (to_regclass('{S}.pacientes'), to_regclass('{S}.cadastros_pendentes'))) as gatilhos,
             (select count(*) from pg_attribute a where a.attrelid = to_regclass('{S}.respostas_preconsulta') and not a.attisdropped
                and a.attname in ('consentimento_versao', 'consentimento_em')) as colunas,
             (select valor from {S}.app_config where chave = 'textos_legais') as textos_legais""")
    if not ok_:
        p.check(False, f"[{S}] tabela aceites, gatilhos e a chave textos_legais — {r}")
        return
    x = r[0]
    p.check(x["existe"] and x["rls"] and x["policies"] == 0 and x["com_privilegio"] is None,
            f"[{S}] tabela aceites: existe, RLS ligada, {x['policies']} policy, privilégio da API: {x['com_privilegio'] or 'nenhum'}")
    p.check(x["gatilhos"] == 2, f"[{S}] gatilho idade_minima_guarda em pacientes e cadastros_pendentes ({x['gatilhos']} de 2)")
    p.check(x["colunas"] == 2, f"[{S}] respostas_preconsulta com consentimento_versao e consentimento_em ({x['colunas']} de 2)")
    esperado = versao_do_app() if S == "staging" else None
    tl = x["textos_legais"]
    p.check(isinstance(tl, dict) and "versao" in tl and tl["versao"] == esperado,
            f"[{S}] textos_legais = {tl} (esperado: versao {esperado!r}" + (" = VERSAO_TEXTOS do app)" if S == "staging" else ", desligado)"))


def publico(p: Placar) -> None:
    estrutura("public", p)
    ok_, r = ler("""select (select count(*) from public.aceites) as linhas, public.versao_dos_textos() as versao,
                           public.legal_da_situacao('00000000-0000-4000-8000-0000000000aa'::uuid) as legal""")
    x = r[0] if ok_ and r else {}
    p.check(ok_ and x.get("linhas") == 0, f"[public] public.aceites com 0 linhas ({x.get('linhas') if ok_ else r})")
    p.check(ok_ and x.get("versao") is None and x.get("legal") == {"versao": None},
            f"[public] versão nula: versao_dos_textos() = {x.get('versao')!r}, legal = {x.get('legal')} (nada muda na produção)")


# ───────────────────────────── staging (versão ligada) ─────────────────────────────

def staging(p: Placar) -> None:
    S = "staging"
    V = versao_do_app()
    estrutura(S, p)
    try:
        uid = {k: um(f"select id::text as id from auth.users where lower(email) = {q(e)}")["id"] for k, e in CONTAS.items()}
        mat = um(f"""select p.id::text as id, p.nascimento::text as nasc, p.conta_id::text as conta from {S}.pacientes p
                      join {S}.conta_membros m on m.conta_id = p.conta_id and m.user_id = {q(uid[PROF])} and m.status = 'ativo'
                     where p.user_id = {q(uid[ALUNO])} and p.deleted_at is null and p.ativo limit 1""")
        mat_app = um(f"""select p.id::text as id, p.nascimento::text as nasc from {S}.pacientes p
                          where p.user_id = {q(uid[APP])} and p.conta_id = {S}.conta_do_app() and p.deleted_at is null and p.ativo""")
        cod = um(f"""select m.codigo_convite as c, pr.codigo_cadastro as cc from {S}.conta_membros m join {S}.contas c on c.id = m.conta_id
                      join {S}.profiles pr on pr.id = m.user_id
                     where m.user_id = {q(uid[PROF])} and m.status = 'ativo' and c.origem <> 'app' and m.codigo_convite is not null limit 1""")
        tok = {k: login_principal(k, e)["access_token"] for k, e in CONTAS.items()}
    except Exception as e:  # noqa: BLE001
        p.check(False, f"[staging] preparo (contas de teste, matrículas, logins) — {str(e)[:200]}")
        return
    form: dict = {}
    criados_pendentes: list[str] = []
    casos = (("o aceite", lambda: caso_aceite(p, S, V, uid, tok)),
             ("Treinar sem profissional", lambda: caso_sem_profissional(p, S, V, uid, tok)),
             ("o aluno do app", lambda: caso_aluno_do_app(p, S, V, uid, tok, mat_app)),
             ("o responsável", lambda: caso_responsavel(p, S, uid, tok, mat)),
             ("a pré-consulta", lambda: caso_preconsulta(p, S, V, uid, mat, form)),
             ("o cadastro pelo link", lambda: caso_cadastro(p, S, cod, criados_pendentes)),
             ("o pendente", lambda: caso_pendente(p, S, uid, tok, mat, criados_pendentes)),
             ("as permissões", lambda: caso_permissoes(p, S, V, uid, tok)))
    try:
        for nome, caso in casos:
            try:
                caso()
            except Exception as e:  # noqa: BLE001 — um caso que quebra vira ❌ e os outros seguem
                p.check(False, f"[staging] {nome}: parou no meio — {str(e)[:200]}")
    finally:
        limpar(p, S, uid, tok, mat, mat_app, form, criados_pendentes)
        for t in tok.values():
            http("POST", f"{PRINCIPAL_URL}/auth/v1/logout?scope=local", None, {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {t}"})


def contar(sql: str) -> int | None:
    ok_, r = ler(sql)
    return r[0]["n"] if ok_ and r else None


def caso_aceite(p: Placar, S: str, V: str | None, uid: dict, tok: dict) -> None:
    print("\n== o aceite no acesso (conta sem nada)")
    antes = contar(f"select count(*)::int as n from {S}.aceites where user_id = {q(uid[NOVA])} and documento = 'textos' and versao = {q(V)}")
    st, r = rpc(S, "minha_situacao", {}, tok[NOVA])
    legal = r.get("legal") if st == 200 and isinstance(r, dict) else None
    p.check(legal == {"versao": V, "aceite_pendente": antes == 0, "saude_pendente": False, "nascimento_pendente": False, "menor": None},
            f"[staging] minha_situacao().legal da conta {'nova: aceite pendente' if antes == 0 else 'que já aceitou numa rodada anterior'} → {legal}")
    st, r = rpc(S, "aceitar_no_acesso", {"p_versao": "2026-10-07", "p_origem": "site"}, tok[NOVA])
    p.check(st == 200 and r == {"ok": False, "erro": "versao_desatualizada", "versao": V}, f"[staging] versão errada → versao_desatualizada ({st} {curto(r)})")
    st, r = rpc(S, "aceitar_no_acesso", {"p_versao": V, "p_origem": "suporte"}, tok[NOVA])
    p.check(st == 200 and isinstance(r, dict) and r.get("erro") == "origem_invalida", f"[staging] origem fora de site/apk/loja → origem_invalida ({st} {curto(r)})")
    for i in (1, 2):
        st, r = rpc(S, "aceitar_no_acesso", {"p_versao": V, "p_origem": "site", "p_versao_app": "hml12-e2e"}, tok[NOVA])
        ok_ = st == 200 and isinstance(r, dict) and r.get("ok") is True and (r.get("legal") or {}).get("aceite_pendente") is False
        n = contar(f"select count(*)::int as n from {S}.aceites where user_id = {q(uid[NOVA])} and documento = 'textos' and versao = {q(V)}")
        p.check(ok_ and n == 1, f"[staging] aceitar ({i}ª vez) → ok, legal sem pendência; 'textos' desta versão: {n} linha (tem que ser 1) ({st} {curto(r)})")
    st, r = rpc(S, "aceitar_no_acesso", {"p_versao": V, "p_origem": "site"}, servidor=True)
    p.check(st == 200 and r == {"ok": False, "erro": "sem_login"}, f"[staging] sem login (o servidor, sem usuário) → sem_login ({st} {curto(r)})")
    st, r = rpc(S, "aceitar_no_acesso", {"p_versao": V, "p_origem": "site"})
    p.check(st in (401, 403) and "42501" in str(r), f"[staging] visitante (anon) chamando aceitar_no_acesso → {st} sem permissão")


def caso_sem_profissional(p: Placar, S: str, V: str | None, uid: dict, tok: dict) -> None:
    print("\n== Treinar sem profissional (a conta sem nada; nenhuma chamada matricula)")
    st, r = rpc(S, "entrar_sem_profissional", {"p_objetivo": "emagrecer", "p_plano": "app_treino"}, tok[NOVA])
    p.check(st == 200 and r == {"ok": False, "erro": "atualize_o_app"}, f"[staging] de 2 argumentos (app antigo) → atualize_o_app ({st} {curto(r)})")
    base = {"p_objetivo": "emagrecer", "p_plano": "app_treino", "p_nascimento": anos_atras(30), "p_consentimento": V, "p_origem": "site"}
    for rotulo, troca, erro in (("sem consentimento", {"p_consentimento": None}, "sem_consentimento_saude"),
                                ("consentimento de outra versão", {"p_consentimento": "2026-10-07"}, "sem_consentimento_saude"),
                                ("com 17 anos", {"p_nascimento": anos_atras(17)}, "menor_de_18"),
                                ("sem data", {"p_nascimento": None}, "nascimento_invalido"),
                                ("origem inválida", {"p_origem": "web"}, "origem_invalida")):
        st, r = rpc(S, "entrar_sem_profissional", base | troca, tok[NOVA])
        p.check(st == 200 and isinstance(r, dict) and r.get("ok") is False and r.get("erro") == erro,
                f"[staging] de 5 argumentos {rotulo} → {erro} ({st} {curto(r)})")
    n = contar(f"select count(*)::int as n from {S}.pacientes where user_id = {q(uid[NOVA])}")
    p.check(n == 0, f"[staging] as recusas não matricularam a conta sem nada ({n} matrícula)")


def caso_aluno_do_app(p: Placar, S: str, V: str | None, uid: dict, tok: dict, mat_app: dict) -> None:
    print("\n== aluno do app: consentimento de saúde e data no aceite")
    vigente = contar(f"""select coalesce((select (a.evento = 'aceitou')::int from {S}.aceites a where a.user_id = {q(uid[APP])}
                          and a.documento = 'saude' order by a.em desc, a.id desc limit 1), 0) as n""") == 1
    sem_data = mat_app["nasc"] is None
    st, r = rpc(S, "minha_situacao", {}, tok[APP])
    legal = r.get("legal") if st == 200 and isinstance(r, dict) else {}
    p.check(isinstance(legal, dict) and legal.get("versao") == V and legal.get("saude_pendente") is (not vigente)
            and legal.get("nascimento_pendente") is sem_data and legal.get("menor") is None,
            f"[staging] legal do aluno do app: saúde pendente {not vigente}, data pendente {sem_data} → {legal}")
    if not vigente:
        st, r = rpc(S, "aceitar_no_acesso", {"p_versao": V, "p_origem": "apk", "p_saude": False, "p_nascimento": anos_atras(30)}, tok[APP])
        p.check(st == 200 and isinstance(r, dict) and r.get("erro") == "sem_consentimento_saude", f"[staging] sem a caixa de saúde → sem_consentimento_saude ({st} {curto(r)})")
    if sem_data:
        st, r = rpc(S, "aceitar_no_acesso", {"p_versao": V, "p_origem": "apk", "p_saude": True, "p_nascimento": anos_atras(17)}, tok[APP])
        p.check(st == 200 and isinstance(r, dict) and r.get("erro") == "menor_de_18", f"[staging] com 17 anos → menor_de_18 ({st} {curto(r)})")
        st, r = rpc(S, "aceitar_no_acesso", {"p_versao": V, "p_origem": "apk", "p_saude": True, "p_nascimento": None}, tok[APP])
        p.check(st == 200 and isinstance(r, dict) and r.get("erro") == "nascimento_invalido", f"[staging] sem a data → nascimento_invalido ({st} {curto(r)})")
    saude_antes = contar(f"select count(*)::int as n from {S}.aceites where user_id = {q(uid[APP])} and documento = 'saude' and evento = 'aceitou'")
    data = anos_atras(30)
    st, r = rpc(S, "aceitar_no_acesso", {"p_versao": V, "p_origem": "apk", "p_saude": True, "p_nascimento": data, "p_versao_app": "hml12-e2e"}, tok[APP])
    legal = (r.get("legal") or {}) if st == 200 and isinstance(r, dict) else {}
    p.check(st == 200 and r.get("ok") is True and not any(legal.get(k) for k in ("aceite_pendente", "saude_pendente", "nascimento_pendente")),
            f"[staging] aceitar com a caixa de saúde e a data (30 anos) → ok, nada pendente ({st} {curto(r)})")
    saude_depois = contar(f"select count(*)::int as n from {S}.aceites where user_id = {q(uid[APP])} and documento = 'saude' and evento = 'aceitou'")
    nasc = um(f"select nascimento::text as d from {S}.pacientes where id = {q(mat_app['id'])}")["d"]
    p.check(saude_depois == (saude_antes or 0) + (0 if vigente else 1) and (nasc == data if sem_data else True),
            f"[staging] 'saude' gravada ({saude_antes} → {saude_depois}) e a data na matrícula do app ({'= a enviada' if nasc == data else nasc})")
    if sem_data:
        st, r = rpc(S, "entrar_sem_profissional", {"p_objetivo": "emagrecer", "p_plano": "app_treino", "p_nascimento": anos_atras(30),
                                                   "p_consentimento": None, "p_origem": "site"}, tok[APP])
        p.check(st == 200 and isinstance(r, dict) and r.get("erro") == "sem_consentimento_saude",
                f"[staging] o aluno do app de novo pela de 5 sem consentimento → sem_consentimento_saude ({st} {curto(r)})")


def caso_responsavel(p: Placar, S: str, uid: dict, tok: dict, mat: dict) -> None:
    print("\n== a trava da idade e o consentimento do responsável (ficha do aluno)")
    st, r = rpc(S, "aluno_responsavel", {"p_aluno": mat["id"]}, tok[PROF])
    if st == 200 and isinstance(r, dict) and r.get("atual"):  # sobra de uma rodada que parou no meio
        rpc(S, "aluno_responsavel_registrar", {"p_aluno": mat["id"], "p_dados": {"acao": "retirar", "origem": "site"}}, tok[PROF])
    st, r = rpc(S, "aluno_salvar_dados", {"p_aluno": mat["id"], "p_dados": {"nascimento": anos_atras(15)}}, tok[PROF])
    p.check(erro_pg(st, r) == "menor_de_16", f"[staging] Editar dados com 15 anos → menor_de_16 ({st} {curto(r)})")
    st, r = rpc(S, "aluno_salvar_dados", {"p_aluno": mat["id"], "p_dados": {"nascimento": anos_atras(17)}}, tok[PROF])
    p.check(st == 200 and isinstance(r, dict) and r.get("ok") is True, f"[staging] Editar dados com 17 anos → ok ({st})")
    st, r = rpc(S, "minha_situacao", {}, tok[ALUNO])
    menor = (r.get("legal") or {}).get("menor") if st == 200 and isinstance(r, dict) else "?"
    p.check(menor == "sem_responsavel", f"[staging] o aluno de 17 sem o registro → legal.menor = {menor} (sem_responsavel)")
    st, r = rpc(S, "aluno_responsavel", {"p_aluno": mat["id"]}, tok[PROF])
    p.check(st == 200 and r == {"ok": True, "ligado": True, "faixa": "16_17", "pode_editar": True, "atual": None},
            f"[staging] aluno_responsavel na ficha → 16_17, sem registro ({st} {curto(r)})")
    dados = {"acao": "registrar", "nome": "Responsável Teste", "vinculo": "mae", "forma": "presencial", "confirmo": True, "origem": "site"}
    st, r = rpc(S, "aluno_responsavel_registrar", {"p_aluno": mat["id"], "p_dados": dados}, tok[OUTRO])
    p.check(st == 200 and r == {"ok": False, "erro": "sem_acesso"}, f"[staging] profissional de outra conta registrando → sem_acesso ({st} {curto(r)})")
    for rotulo, troca, erro in (("sem confirmar", {"confirmo": False}, "falta_confirmar"), ("nome de 1 letra", {"nome": "R"}, "nome_invalido"),
                                ("vínculo fora da lista", {"vinculo": "tio"}, "vinculo_invalido"),
                                ("forma fora da lista", {"forma": "telefone"}, "forma_invalida")):
        st, r = rpc(S, "aluno_responsavel_registrar", {"p_aluno": mat["id"], "p_dados": dados | troca}, tok[PROF])
        p.check(st == 200 and isinstance(r, dict) and r.get("erro") == erro, f"[staging] registrar {rotulo} → {erro} ({st} {curto(r)})")
    st, r = rpc(S, "aluno_responsavel_registrar", {"p_aluno": mat["id"], "p_dados": {"acao": "retirar", "origem": "site"}}, tok[PROF])
    p.check(st == 200 and isinstance(r, dict) and r.get("erro") == "sem_registro_vigente", f"[staging] retirar sem registro → sem_registro_vigente ({st} {curto(r)})")
    st, r = rpc(S, "aluno_responsavel_registrar", {"p_aluno": mat["id"], "p_dados": dados}, tok[PROF])
    atual = r.get("atual") if st == 200 and isinstance(r, dict) else None
    p.check(isinstance(atual, dict) and atual.get("vinculo") == "mae" and atual.get("forma") == "presencial" and atual.get("por") and atual.get("em"),
            f"[staging] registrar o responsável → registro vigente com vínculo, forma, data e quem registrou ({st} {curto(r)})")
    st, r = rpc(S, "minha_situacao", {}, tok[ALUNO])
    legal = r.get("legal") if st == 200 and isinstance(r, dict) else {}
    p.check(isinstance(legal, dict) and "menor" in legal and legal["menor"] is None, f"[staging] com o registro → legal.menor = null ({legal})")
    st, r = rpc(S, "exportar_dados_aluno", {"p_uid": uid[ALUNO]}, servidor=True)
    ac = r.get("aceites") if st == 200 and isinstance(r, dict) else None
    p.check(isinstance(ac, list) and any(a.get("documento") == "responsavel" and a.get("paciente_id") == mat["id"] for a in ac)
            and not any("registrado_por" in a for a in ac),
            f"[staging] Exportar meus dados traz 'aceites' ({len(ac) if isinstance(ac, list) else st} evento(s)), com o do responsável e sem registrado_por")
    st, r = rpc(S, "aluno_responsavel_registrar", {"p_aluno": mat["id"], "p_dados": {"acao": "retirar", "origem": "site"}}, tok[PROF])
    p.check(st == 200 and isinstance(r, dict) and r.get("ok") is True and r.get("atual") is None, f"[staging] retirar → sem registro ({st} {curto(r)})")
    st, r = rpc(S, "minha_situacao", {}, tok[ALUNO])
    menor = (r.get("legal") or {}).get("menor") if st == 200 and isinstance(r, dict) else "?"
    p.check(menor == "sem_responsavel", f"[staging] retirado → o app do aluno fecha de novo (legal.menor = {menor})")


def caso_preconsulta(p: Placar, S: str, V: str | None, uid: dict, mat: dict, form: dict) -> None:
    print("\n== pré-consulta (/f/): o visitante consente")
    slug = "".join(secrets.choice("abcdefghijkmnpqrstuvwxyz23456789") for _ in range(8))
    r = sql_principal(f"""insert into {S}.formularios_preconsulta (nutricionista_id, conta_id, titulo, origem, slug, perguntas, faixas, ativo)
                          values ({q(uid[PROF])}, {q(mat['conta'])}, 'hml-12 E2E', 'personalizado', {q(slug)},
                                  '[{{"id": "p1", "texto": "Como você está?", "tipo": "texto", "max": 4, "pontos_sim": 1, "opcoes": []}}]'::jsonb,
                                  '[]'::jsonb, true) returning id::text as id""")
    form["id"] = r[0]["id"]
    args = {"p_slug": slug, "p_nome": "Visitante Teste", "p_email": "", "p_telefone": "", "p_respostas": {"p1": "Bem"}}
    st, r = rpc(S, "preconsulta_responder", args)
    p.check(erro_pg(st, r) == "sem_consentimento", f"[staging] de 5 argumentos (sem o consentimento) → sem_consentimento ({st} {curto(r)})")
    st, r = rpc(S, "preconsulta_responder", args | {"p_consentimento": None})
    p.check(erro_pg(st, r) == "sem_consentimento", f"[staging] de 6 sem marcar → sem_consentimento ({st} {curto(r)})")
    st, r = rpc(S, "preconsulta_responder", args | {"p_consentimento": V})
    rid = r.get("id") if st == 200 and isinstance(r, dict) else None
    ok_, x = ler(f"select consentimento_versao as v, consentimento_em is not null as em from {S}.respostas_preconsulta where id = {q(rid)}") if rid else (False, None)
    p.check(bool(rid) and ok_ and x and x[0]["v"] == V and x[0]["em"],
            f"[staging] de 6 com a versão → a resposta grava consentimento_versao = {x[0]['v'] if ok_ and x else '?'} e a hora ({st})")


def caso_cadastro(p: Placar, S: str, cod: dict, criados: list[str]) -> None:
    print("\n== cadastro pelo link (/c/) e a RPC antiga do Nutri: menor de 16")
    st, r = rpc(S, "cadastro_link_enviar", {"p_codigo": cod["c"], "p_dados": {"nome": "Menor Teste", "nascimento": anos_atras(15)}}, servidor=True)
    p.check(st == 200 and r == {"ok": False, "erro": "menor_de_16"},
            f"[staging] cadastro_link_enviar com 15 anos → menor_de_16 (a função alunos devolve 400 pelo statusDoErro) ({st} {curto(r)})")
    st, r = rpc(S, "cadastro_publico_enviar", {"p_codigo": cod["cc"], "p_nome": "Menor Teste", "p_apelido": "", "p_nascimento": anos_atras(15),
                                               "p_telefone": "", "p_cpf": "", "p_email": "", "p_genero": "", "p_observacoes": ""})
    if st == 200 and isinstance(r, dict) and r.get("id"):
        criados.append(r["id"])
    p.check(erro_pg(st, r) == "menor_de_16", f"[staging] a RPC antiga do Nutri (visitante) com 15 anos → menor_de_16 pelo gatilho ({st} {curto(r)})")


def caso_pendente(p: Placar, S: str, uid: dict, tok: dict, mat: dict, criados: list[str]) -> None:
    print("\n== Alunos › Pendentes › Aprovar: pendente de 15 anos (de antes da virada)")
    pid = str(uuid.uuid4())
    # um pendente "antigo": nasce numa transação só, com a versão desligada no meio (ninguém de fora vê o desligado: MVCC); o gatilho
    # recusaria o insert com a versão ligada — é o caso que a pré-checagem da aluno_pendente_decidir cobre
    sql_principal(f"""do $$
      declare v_cfg jsonb;
      begin
        select valor into v_cfg from {S}.app_config where chave = 'textos_legais' for update;
        update {S}.app_config set valor = jsonb_build_object('versao', null) where chave = 'textos_legais';
        insert into {S}.cadastros_pendentes (id, nutricionista_id, conta_id, nome, nascimento)
        values ({q(pid)}, {q(uid[PROF])}, {q(mat['conta'])}, 'Pendente Quinze hml-12', {q(anos_atras(15))});
        update {S}.app_config set valor = v_cfg where chave = 'textos_legais';
      end $$""")
    criados.append(pid)
    st, r = rpc(S, "aluno_pendente_decidir", {"p_conta": mat["conta"], "p_pendente": pid, "p_aprovar": True}, tok[PROF])
    p.check(st == 200 and r == {"ok": False, "erro": "menor_de_16"}, f"[staging] aluno_pendente_decidir (aprovar) de 15 anos → menor_de_16 ({st} {curto(r)})")
    st, r, _ = http("POST", f"{API_P}/functions/v1/alunos", {"acao": "aprovar", "conta_id": mat["conta"], "pendente_id": pid},
                    {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {tok[PROF]}", "x-schema": S, "Origin": ORIGEM_STAGING}, timeout=90)
    p.check(st == 400 and r == {"ok": False, "erro": "menor_de_16"},
            f"[staging] pela função alunos (o caminho do painel) → 400 {{ok: false, erro: menor_de_16}}, sem erro_interno ({st} {curto(r)})")
    ok_, x = ler(f"""select (select status from {S}.cadastros_pendentes where id = {q(pid)}) as status,
                            (select paciente_id from {S}.cadastros_pendentes where id = {q(pid)}) as pac,
                            (select count(*) from {S}.pacientes where conta_id = {q(mat['conta'])} and nome = 'Pendente Quinze hml-12') as n""")
    y = x[0] if ok_ and x else {}
    p.check(y.get("status") == "pendente" and y.get("pac") is None and y.get("n") == 0,
            f"[staging] nenhuma matrícula criada; o pendente segue pendente ({y if ok_ else x})")


def caso_permissoes(p: Placar, S: str, V: str | None, uid: dict, tok: dict) -> None:
    print("\n== ninguém lê nem grava a tabela pela API")
    antes = contar(f"select count(*)::int as n from {S}.aceites")
    linha = {"documento": "textos", "versao": V, "user_id": uid[NOVA], "registrado_por": uid[NOVA], "origem": "site"}
    for metodo, filtro, corpo in (("GET", "select=id&limit=1", None), ("POST", "", linha),
                                  ("PATCH", f"user_id=eq.{uid[NOVA]}", {"origem": "apk"}), ("DELETE", f"user_id=eq.{uid[NOVA]}", None)):
        st, r = rest(S, tok[NOVA], metodo, "aceites", filtro, corpo)
        p.check(st in (401, 403, 404) and not (isinstance(r, list) and r), f"[staging] {metodo} em {S}.aceites com o login de teste → {st} (negado)")
    st, r = rpc(S, "legal_da_situacao", {"p_uid": uid[NOVA]}, tok[NOVA])
    p.check(st in (401, 403, 404), f"[staging] o logado chamando a auxiliar legal_da_situacao → {st} (negado)")
    depois = contar(f"select count(*)::int as n from {S}.aceites")
    p.check(antes is not None and antes == depois, f"[staging] a tabela não mudou pelas tentativas ({antes} → {depois} linhas)")
    ok_, r = ler(f"""select to_regclass('public.aceites') is not null as existe""")
    if ok_ and r and r[0]["existe"]:
        n = contar(f"select count(*)::int as n from public.aceites where user_id in ({q(uid[NOVA])}, {q(uid[APP])})")
        p.check(n == 0, f"[staging] o aceite do staging não aparece em public.aceites ({n} linha)")
    else:
        p.check(ok_, "[staging] o aceite do staging não aparece em public.aceites (o public ainda não tem a tabela: aplica depois)")


def limpar(p: Placar, S: str, uid: dict, tok: dict, mat: dict, mat_app: dict, form: dict, pendentes: list[str]) -> None:
    print("\n== limpeza (o que o teste mudou volta ao valor de antes)")
    falhas = []
    try:  # a data do aluno do profissional: pela tela de Editar dados (o mesmo caminho do painel)
        st, r = rpc(S, "aluno_salvar_dados", {"p_aluno": mat["id"], "p_dados": {"nascimento": mat["nasc"]}}, tok[PROF])
        if not (st == 200 and isinstance(r, dict) and r.get("ok") is True):
            sql_principal(f"update {S}.pacientes set nascimento = {q(mat['nasc'])} where id = {q(mat['id'])}")
        st, r = rpc(S, "aluno_responsavel", {"p_aluno": mat["id"]}, tok[PROF])
        if st == 200 and isinstance(r, dict) and r.get("atual"):
            rpc(S, "aluno_responsavel_registrar", {"p_aluno": mat["id"], "p_dados": {"acao": "retirar", "origem": "site"}}, tok[PROF])
    except Exception as e:  # noqa: BLE001
        falhas.append(f"aluno: {str(e)[:80]}")
    try:  # o aluno do app: a data de antes e a retirada do consentimento de saúde pelo suporte (D13), para a próxima rodada começar igual
        sql_principal(f"update {S}.pacientes set nascimento = {q(mat_app['nasc'])} where id = {q(mat_app['id'])}")
        sql_principal(f"""insert into {S}.aceites (documento, evento, versao, user_id, registrado_por, origem)
                          select 'saude', 'revogou', {S}.versao_dos_textos(), {q(uid[APP])}, {q(uid[APP])}, 'suporte'
                           where {S}.saude_vigente({q(uid[APP])}) and {S}.versao_dos_textos() is not null""")
    except Exception as e:  # noqa: BLE001
        falhas.append(f"aluno do app: {str(e)[:80]}")
    try:
        if form.get("id"):
            sql_principal(f"delete from {S}.respostas_preconsulta where formulario_id = {q(form['id'])}")
            sql_principal(f"delete from {S}.formularios_preconsulta where id = {q(form['id'])}")
        for i in pendentes:
            sql_principal(f"delete from {S}.cadastros_pendentes where id = {q(i)}")
    except Exception as e:  # noqa: BLE001
        falhas.append(f"pré-consulta/cadastro: {str(e)[:80]}")
    ok_, r = ler(f"""select (select nascimento::text from {S}.pacientes where id = {q(mat['id'])}) as a,
                            (select nascimento::text from {S}.pacientes where id = {q(mat_app['id'])}) as b,
                            {S}.responsavel_vigente({q(mat['id'])}) as resp, {S}.saude_vigente({q(uid[APP])}) as saude,
                            (select count(*) from {S}.formularios_preconsulta where id = {q(form.get('id'))}) as forms,
                            (select count(*) from {S}.cadastros_pendentes where id = any({q('{' + ','.join(pendentes) + '}')}::uuid[])) as pend""")
    x = r[0] if ok_ and r else {}
    p.check(not falhas and ok_ and x.get("a") == mat["nasc"] and x.get("b") == mat_app["nasc"] and not x.get("resp") and not x.get("saude")
            and x.get("forms") == 0 and x.get("pend") == 0,
            "[staging] limpeza: as 2 datas de antes, sem responsável nem saúde vigentes, sem o formulário nem o pendente de teste"
            + (f" — {falhas}" if falhas else "" if ok_ else f" — {r}"))


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-12: aceite e consentimentos no banco principal (spec §9.2)")
    ap.add_argument("--schema", choices=["staging", "public"], required=True,
                    help="staging: positivos e negativos com as contas de teste; public: só leitura (a estrutura, versão nula)")
    a = ap.parse_args()
    p = Placar()
    if a.schema == "staging":
        staging(p)
    else:
        publico(p)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
