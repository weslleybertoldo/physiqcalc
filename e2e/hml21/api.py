#!/usr/bin/env python3
"""Physiq hml-21a (H-43 · jeito 2, etapa 3, 12/10/2026) — os casos de SERVIDOR da função NOVA `conta`: a casca (--area casca: o sino, o
aviso de membro removido, a situação, o aviso de mudança, a senha provisória, o push, o aceite e o onboarding) e o app do aluno (--area app:
o Perfil, a Agenda, o Meu plano, os pratos prontos, o nome e a foto do perfil). Spec hml-21 §4; contrato da 21a, decisões B, C e I.

Contas (staging, só de TESTE): A = w5p-aluna (o app); N = w5p-nutri (cria a massa do sino pelos caminhos do app); O = w13-dono (OUTRA
conta: N1 — e o P do criar_minha_conta, o caminho idempotente de quem já é dono de conta: nada é criado); S = w7b-sozinho (o Meu plano do
aluno sem profissional — SÓ se existir no staging: SQL só leitura, só contagem; senão o caso fica no Vitest, anotado na saída). No máximo 6
logins na etapa 2 (o registro: hml21/agente/logins_etapa2_21a.txt); as sessões ficam para os outros scripts e saem no --sair.
A massa (decisão I): os avisos não lidos do sino da aluna pelos CAMINHOS DO APP (a w5p-nutri: nutricao › avaliacao_avisar e a RPC
aluno_avisar_plano ['dieta'] — a trava de 10 min por título dá 2 por rodada; o sqlrw.py não aceita insert), com a marca "hml21 e2e
<rodada>" no título (o UPDATE do sqlrw.py, só no staging), os ids no Estado e o DELETE no fim (ou no --limpar), conferido por SQL só leitura,
só contagem. A foto da aluna: guardada antes (o bucket é público) e devolvida no fim pelo caminho novo (ou tirada, se ela não tinha). O
push: registra e esquece um token de TESTE (antes da massa: um aviso novo com aparelho registrado dispararia o push-enviar).
  P   cada consulta = as MESMAS linhas que o SQL FIXO da lib do 53f2583 rodado COMO A PESSOA (B.SQL_DA_LIB, com a origem); cada ação faz o
      MESMO de hoje: avisos_marcar_lidos/aviso_membro_ok mudam SÓ o lido_em dos avisos da massa (SQL); push_registrar → 1 aparelho com o
      token de teste, push_esquecer → 0; aceitar_textos com uma versão que não é a vigente → versao_desatualizada (nada gravado);
      criar_minha_conta (a w13-dono) → ja_existia/ja_tem_conta (0 conta nova); entrar_sem_profissional (a aluna, que tem profissional) →
      com_profissional/atualize_o_app/nascimento_invalido (0 matrícula nova); mudar_objetivo_app (a aluna) → sem_matricula_app; perfil_nome
      com o MESMO nome; a foto: preparar → PUT no link → salvar (a URL pública = a do getPublicUrl, a anterior da pasta saiu do bucket) → a
      de antes devolvida
  N1  outra conta (w13-dono): o sino e a foto dela (nunca uma linha da aluna); marcar os avisos da aluna → 0 marcado (SQL: seguem não
      lidos); o "Entendi" no aviso da aluna → nao_encontrado; esquecer o token da aluna → 0 apagado; salvar a foto na pasta da aluna → N8
  N2  sem login → 401 (o `ler` e uma ação) · N3 q desconhecida → o item consulta_invalida; ação desconhecida → 400 acao_invalida
  N4  destino_user_id/user_id/id no corpo → ignorados (o dono é quem chama) · N5 chave fora da lista (dados_profissionais, email, foto_url
      no perfil_nome; select/colunas no `ler`) → cai (só o nome muda; a resposta é a mesma)
  N6  x-schema inválido → 400 schema_invalido · N7 origem fora da lista → o CORS padrão (https://physiqcalc.com.br)
  N8  o caminho da foto fora da pasta de quem chama (outra pessoa, ../, subpasta, outro nome) → dados_invalidos (nada gravado)
  N9  lote de 17 → 400 lote_grande · N11 a aluna pede uma consulta do PAINEL pela conta → consulta_invalida (a 21a não tem nenhuma)
Produção (--base prod --so-leitura) e o smoke logo depois de publicar (--base staging --so-leitura): OPTIONS (o CORS), sem login → 401,
x-schema inválido → 400 e a q desconhecida → consulta_invalida (o `ler` sem banco) — nada grava; 1 login (a conta de teste).
Antes de CADA execução que toca o staging: ~/projetos/physiqcalc-scratch/hml/hml19/ferramentas/pausa.sh "<o que ia rodar>".
Uso: python3 e2e/hml21/api.py --area casca|app [--base local|staging|prod] [--casos P,N1,…] [--seco | --limpar | --so-leitura | --sair]
  --seco  sem rede: cada corpo desta rodada passa (ou é recusado como deve) pelo leitor REAL do servidor (o TS, pelo node); o SQL da lib
          de cada consulta existe com a origem; a Guarda dos E2E trata o `ler` da conta como leitura e as ações como gravação
Da saída só saem status, códigos, contagens e tempos.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
import uuid
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

C = B.C
CASOS = ("P", "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9", "N11")
FALSO = "00000000-0000-4000-8000-0000000000aa"
OUTRO = "44444444-4444-4444-8444-444444444444"
CONSULTAS = {
    "casca": ("avisos", "aviso_membro_removido", "situacao"),
    "app": ("meu_perfil_aluno", "minha_agenda", "minha_agenda_lista", "meu_plano_app", "pratos_prontos_do_app", "perfil_foto"),
}
ACOES = {
    "casca": ("avisos_marcar_lidos", "aviso_membro_ok", "aviso_mudanca_marcar", "senha_definida", "push_registrar", "push_esquecer",
              "aceitar_textos", "criar_minha_conta", "entrar_sem_profissional"),
    "app": ("perfil_nome", "perfil_foto_preparar", "perfil_foto_salvar", "perfil_foto_tirar", "mudar_objetivo_app"),
}
# as consultas do PAINEL (de outras sub-W, outras funções): pela conta da 21a, consulta_invalida (N11)
DO_PAINEL = ("alunos_da_conta", "agenda_agendamentos", "fin_categorias", "aluno_dieta", "perfil_profissional")
VERSAO_ERRADA = "hml21-versao-que-nao-existe"


def agora_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def inicio_da_agenda() -> str:
    """O inicioDaAgenda da tela (src/app-aluno/perfil/pecas/regras.ts:148): agora − 90 dias, em ISO (o toISOString)."""
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=90)).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def token_de_teste(rodada: str) -> str:
    """Um token de push de TESTE (o formato que a push_registrar aceita: 20–4096 de [A-Za-z0-9_:.-]) — nunca um token de aparelho."""
    return f"hml21-e2e-{rodada}-{uuid.uuid4().hex}"


# ───────────────────────── os pedidos (puros: o --seco confere todos contra o servidor) ─────────────────────────
def pedidos_ler(area: str, desde: str) -> list[dict]:
    """Os corpos `ler` da rodada (P e os N) — o --seco passa cada um pelo leitor do servidor."""
    if area == "casca":
        ok = [B.item("avisos"), B.item("aviso_membro_removido", tipo="membro_removido"), B.item("situacao")]
        n45 = [B.item("avisos", destino_user_id=OUTRO, user_id=OUTRO, select="*", colunas="*"),
               B.item("aviso_membro_removido", tipo="membro_removido", destino_user_id=OUTRO, lido_em="2000-01-01")]
        ruins = [B.item("aviso_membro_removido", tipo="geral"), B.item("aviso_membro_removido")]
    else:
        ok = [B.item("meu_perfil_aluno"), B.item("minha_agenda", desde=desde), B.item("minha_agenda_lista", tipo="proximas", offset=0, limite=20),
              B.item("meu_plano_app"), B.item("pratos_prontos_do_app"), B.item("perfil_foto")]
        n45 = [B.item("perfil_foto", id=OUTRO, select="dados_profissionais"), B.item("meu_perfil_aluno", p_uid=OUTRO, user_id=OUTRO),
               B.item("minha_agenda", desde=desde, p_desde="1900-01-01T00:00:00.000Z", paciente_id=OUTRO)]
        ruins = [B.item("minha_agenda", desde="ontem"), B.item("minha_agenda_lista", tipo="proximas", offset=-1, limite=20),
                 B.item("minha_agenda_lista", tipo="proximas", offset=0, limite=101)]
    return [
        {"acao": "ler", "itens": ok},
        {"acao": "ler", "itens": [ok[0], B.item("conta_inteira"), B.item("avisos_de_todo_mundo")]},  # N3
        {"acao": "ler", "itens": n45},  # N4/N5
        {"acao": "ler", "itens": ruins},  # o param fora da forma
        {"acao": "ler", "itens": [ok[0]] * 17},  # N9
        {"acao": "ler", "itens": [B.item(q) for q in DO_PAINEL]},  # N11
    ]


def pedidos_acoes(area: str, uid: str, rodada: str) -> list[tuple[str, dict, bool]]:
    """As ações da rodada: (ação, corpo, o servidor aceita?) — o --seco confere cada uma no lerCorpoDaAcao do servidor."""
    tok = token_de_teste(rodada)
    if area == "casca":
        return [
            ("avisos_marcar_lidos", {"ids": [FALSO]}, True),
            ("avisos_marcar_lidos", {"ids": [FALSO], "destino_user_id": OUTRO, "user_id": OUTRO, "lido_em": "2000-01-01"}, True),  # N4/N5
            ("avisos_marcar_lidos", {"ids": []}, False),
            ("avisos_marcar_lidos", {"ids": [str(uuid.UUID(int=i)) for i in range(31)]}, False),
            ("aviso_membro_ok", {"id": FALSO, "destino_user_id": OUTRO}, True),
            ("aviso_membro_ok", {"id": "nao-uuid"}, False),
            ("aviso_mudanca_marcar", {"versao": "1"}, True),
            ("senha_definida", {"user_id": OUTRO}, True),
            ("push_registrar", {"token": tok, "plataforma": "android", "versao": None}, True),
            ("push_registrar", {}, False),
            ("push_esquecer", {"token": tok}, True),
            ("aceitar_textos", {"versao": VERSAO_ERRADA, "origem": "site", "saude": False, "nascimento": None, "versao_app": None}, True),
            ("aceitar_textos", {"versao": "1", "origem": "site", "nascimento": "2026-02-31"}, False),
            ("criar_minha_conta", {"nome": "Conta de teste", "tipo": "personal", "registro": None, "dono_id": OUTRO}, True),
            ("entrar_sem_profissional", {"objetivo": "manter", "plano": "treino"}, True),
            ("entrar_sem_profissional", {"objetivo": "manter", "plano": "treino", "nascimento": "1899-12-31", "consentimento": "x", "origem": "site"}, True),
            ("entrar_sem_profissional", {"objetivo": "manter", "plano": "treino", "nascimento": "1990-05-20"}, True),  # o servidor recusa depois (extras pela metade)
        ]
    pasta = f"{uid}/foto-1760000000000.png"
    return [
        ("perfil_nome", {"nome": "Aluna", "dados_profissionais": {"foto_url": "x"}, "email": "x@y", "id": OUTRO}, True),  # N4/N5
        ("perfil_nome", {}, False),
        ("perfil_foto_preparar", {"tipo": "image/png", "tamanho": 1234}, True),
        ("perfil_foto_preparar", {"tipo": "image/gif", "tamanho": 1234}, False),
        ("perfil_foto_preparar", {"tipo": "image/png", "tamanho": 5 * 1024 * 1024 + 1}, False),
        ("perfil_foto_salvar", {"caminho": pasta}, True),
        ("perfil_foto_salvar", {"caminho": f"{OUTRO}/foto-1.png"}, True),  # aceito na forma; o servidor recusa a pasta (N8: dados_invalidos)
        ("perfil_foto_tirar", {"foto_url": "x"}, True),
        ("mudar_objetivo_app", {"objetivo": "manter"}, True),
        ("mudar_objetivo_app", {}, False),
    ]


# ───────────────────────── o --seco ─────────────────────────
def seco(o, area: str) -> None:
    desde = inicio_da_agenda()
    uid = "33333333-3333-4333-8333-333333333333"
    rodada = "seco"
    lers = pedidos_ler(area, desde)
    acoes = pedidos_acoes(area, uid, rodada)
    caminhos = [[f"{uid}/foto-1760000000000.png", uid], [f"{OUTRO}/foto-1.png", uid], [f"{uid}/../{OUTRO}/foto-1.png", uid],
                [f"{uid}/sub/foto-1.png", uid], [f"{uid}/foto-1.gif", uid]]
    anteriores = [[f"{B.URL_API_PROPRIA}/storage/v1/object/public/fotos-perfil-staging/{uid}/foto-17.png", "fotos-perfil-staging", uid],
                  [f"https://hkxvtsbwctxkrqzkkdoz.supabase.co/storage/v1/object/public/fotos-perfil-staging/{uid}/foto-18.jpg", "fotos-perfil-staging", uid],
                  [f"{B.URL_API_PROPRIA}/storage/v1/object/public/fotos-perfil/{uid}/foto-17.png", "fotos-perfil-staging", uid],
                  [f"{B.URL_API_PROPRIA}/storage/v1/object/public/fotos-perfil-staging/{OUTRO}/foto-17.png", "fotos-perfil-staging", uid],
                  [f"{B.URL_API_PROPRIA}/storage/v1/object/public/fotos-perfil-staging/{uid}/sub/foto-17.png", "fotos-perfil-staging", uid],
                  ["https://lh3.googleusercontent.com/a/foto", "fotos-perfil-staging", uid], ["", "fotos-perfil-staging", uid],
                  [f"{B.URL_API_PROPRIA}/storage/v1/object/public/fotos-perfil-staging/{uid}/foto%2017.jpg", "fotos-perfil-staging", uid]]
    urls = [["fotos-perfil-staging", f"{uid}/foto-1760000000000.png"], ["fotos-perfil", f"{uid}/foto-1.webp"]]
    r = B.regras_conta(lers + [{**c, "acao": a} for a, c, _ok in acoes], caminhos, anteriores, urls)
    cons = r["consultas"]
    o.ok(all(q in cons for q in CONSULTAS[area]), f"[seco] as {len(CONSULTAS[area])} consultas da área {area} estão no catálogo do servidor")
    o.ok(all(a in (r["casca"] if area == "casca" else r["app"]) for a in ACOES[area]), f"[seco] as {len(ACOES[area])} ações da área {area} estão na lista do servidor")
    o.ok(all(q in B.SQL_DA_LIB and B.SQL_DA_LIB[q][0].startswith("src/") for q in CONSULTAS[area]),
         "[seco] cada consulta tem o SQL FIXO da lib do 53f2583 (com a origem arquivo:linha) para o P")
    pl = r["pedidos"][: len(lers)]
    o.ok(pl[0].get("ok") is True and all(i.get("ok") for i in pl[0]["itens"]), "[seco] P: o lote da tela passa no leitor do servidor (cada item ok)")
    o.ok([i.get("erro") for i in pl[1]["itens"]] == [None, "consulta_invalida", "consulta_invalida"], "[seco] N3: a q desconhecida → consulta_invalida só nela")
    n45 = pl[2]["itens"]
    declarados = {q: set(cons[q]["params"]) for q in cons}
    o.ok(all(i.get("ok") and set(i["params"]) <= declarados[i["q"]] for i in n45),
         f"[seco] N4/N5: o dono/as colunas no corpo CAEM (só os params declarados chegam): {[sorted(i.get('params', {})) for i in n45]}")
    o.ok(all(i.get("erro") == "dados_invalidos" for i in pl[3]["itens"]), "[seco] o param fora da forma → dados_invalidos (nada roda)")
    o.ok(pl[4] == {"modulo": "leitura", "ok": False, "erro": "lote_grande"}, "[seco] N9: 17 itens → lote_grande")
    o.ok(all(i.get("erro") == "consulta_invalida" for i in pl[5]["itens"]), f"[seco] N11: as consultas do painel pela conta → consulta_invalida ({', '.join(DO_PAINEL)})")
    pa = r["pedidos"][len(lers):]
    certos = [(a, esperado, x) for (a, _c, esperado), x in zip(acoes, pa)]
    o.ok(all(x.get("modulo") == area and x.get("acao") == a for a, _e, x in certos), f"[seco] cada ação vai ao módulo {area} do servidor")
    o.ok(all(bool(x.get("ok")) == esperado for _a, esperado, x in certos),
         f"[seco] os corpos: os aceitos passam, os ruins → dados_invalidos ({[(a, x.get('campo')) for a, e, x in certos if not e]})")
    o.ok(all(set((x.get("valores") or {})) <= set(r["corpos"][a]) for a, e, x in certos if e),
         "[seco] N4/N5: as chaves fora da lista da ação CAEM (destino_user_id, user_id, dados_profissionais, email, id, lido_em…)")
    o.ok(r["caminhos"] == [True, False, False, False, False], f"[seco] N8: só o caminho da PRÓPRIA pasta no formato do preparar passa ({r['caminhos']})")
    o.ok(r["status"].get("sem_login") == 401 and r["status"].get("storage_falhou") == 502 and "dados_invalidos" not in r["status"],
         "[seco] os status da conta (401, 502; dados_invalidos = 400)")
    # a Guarda dos E2E: o `ler` da conta é leitura; as ações são gravação (decisão F); a w26 também
    lido = json.dumps({"acao": "ler", "itens": [{"q": "avisos"}]})
    o.ok(B.B17.funcao_grava("conta", "ler", lido) is False and all(B.B17.funcao_grava("conta", a, json.dumps({"acao": a})) for a in ACOES[area]),
         "[seco] a Guarda (hml17): o `ler` da conta passa; as ações dela são gravação")
    o.ok(r["foto"]["url_propria"] == "https://api-principal.physiqcalc.com.br" and r["foto"]["buckets"] == {"public": "fotos-perfil", "staging": "fotos-perfil-staging"},
         "[seco] a foto: a URL pública no domínio próprio e o bucket do ambiente")
    o.ok(B.sql_da_lib("minha_agenda", "staging", desde=desde).count("staging.minha_agenda(") == 1 and "order by" in B.sql_da_lib("avisos", "staging"),
         "[seco] o SQL da lib monta com o schema e os valores conferidos")
    o.ok(B.sem_relogio({"ok": True, "gerado_em": "x", "papel": {"agora": 1, "conta": 2}, "lista": [{"hoje": 1, "id": 3}]})
         == {"ok": True, "papel": {"conta": 2}, "lista": [{"id": 3}]},
         "[seco] o P compara fora das chaves do relógio do banco (o gerado_em da minha_situacao, o agora, o hoje) — em qualquer nível")
    # a foto: o E2E acha o caminho da foto anterior e monta a URL pública IGUAL ao servidor (o diferencial pelo TS)
    py_ant = [B.caminho_da_url(u, b, i) for u, b, i in anteriores]
    o.ok(py_ant == r["anteriores"] and py_ant[:2] == [f"{uid}/foto-17.png", f"{uid}/foto-18.jpg"] and py_ant[2:] == [None] * 6,
         f"[seco] a foto anterior: o caminho_da_url do E2E = o caminhoDaFotoAnterior do servidor ({py_ant})")
    o.ok([f"{B.URL_API_PROPRIA}/storage/v1/object/public/{b}/{c}" for b, c in urls] == r["urls"] and B.URL_API_PROPRIA == r["foto"]["url_propria"]
         and all(B.bucket_das_fotos(x) == r["foto"]["buckets"][x] for x in ("public", "staging")),
         "[seco] a URL pública e o bucket do ambiente: os do E2E = os do servidor")
    # as travas da escrita (nada sai: a recusa é antes do subprocesso)
    recusas = 0
    for sql in ("insert into staging.avisos (titulo) values ('x');", "delete from public.avisos where destino_user_id = 'x';",
                "update staging.avisos set lido_em = now();", "delete from staging.profiles where id = 'x';",
                "update staging.avisos set titulo = titulo || 'x' where true; delete from public.avisos where true;",
                "update staging.avisos set titulo = titulo || 'x' where true; delete from staging.profiles where true;"):
        try:
            B.sql_escrever_staging(sql)
        except SystemExit:
            recusas += 1
    try:
        B.sql_apagar_avisos("public", uid, [uid])
    except SystemExit:
        recusas += 1
    try:
        B.sql_marcar_avisos("public", uid, [uid], "x")
    except SystemExit:
        recusas += 1
    o.ok(recusas == 8 and B.sql_apagar_avisos("staging", uid, [uid, "x"]).count("'") == 4
         and B.sql_marcar_avisos("staging", uid, [uid], "r1").startswith("update staging.avisos set titulo = titulo || "),
         f"[seco] a escrita da massa: só o UPDATE da marca e o DELETE em staging.avisos, só os ids da conta de teste, 1 instrução ({recusas}/8 recusadas)")
    o.ok(B.objetos("fotos-perfil-staging", ["../x", "nao-uuid/foto.png"]) == 0 and B.objetos("outro", [f"{uid}/foto-1.png"]) == 0,
         "[seco] a contagem dos arquivos só aceita <uuid>/<arquivo> nos 2 buckets das fotos (o resto nem vai ao banco)")


# ───────────────────────── a rodada (etapa 2) ─────────────────────────
def igual_ao_sql(o, rotulo: str, valor: object, sql_v: object) -> bool:
    return o.ok(B.canonico(B.sem_relogio(valor)) == B.canonico(B.sem_relogio(sql_v)), rotulo)


def p_leituras(o, L, area: str, s: str) -> None:
    """P: cada consulta = o SQL FIXO da lib rodado COMO A ALUNA (as linhas e o valor)."""
    tok, uid = L.token(B.ALUNA), L.uid(B.ALUNA)
    email = B.B5.CONTAS[B.ALUNA][0]
    desde = inicio_da_agenda()
    itens = [B.item("avisos"), B.item("aviso_membro_removido", tipo="membro_removido"), B.item("situacao")] if area == "casca" else [
        B.item("meu_perfil_aluno"), B.item("minha_agenda", desde=desde), B.item("minha_agenda_lista", tipo="proximas", offset=0, limite=20),
        B.item("meu_plano_app"), B.item("pratos_prontos_do_app"), B.item("perfil_foto")]
    st, r, _h, ms = B.ler(tok, itens)
    o.ok(st == 200 and len(B.itens_de(r)) == len(itens) and all(i.get("ok") for i in B.itens_de(r)),
         f"P: o lote da área {area} pela conta → 200, {len(itens)} itens ok ({ms} ms)")
    for it, resp in zip(itens, B.itens_de(r)):
        q = it["q"]
        sql = B.sql_da_lib(q, s, uid=uid, desde=desde) if q in ("perfil_foto", "minha_agenda") else B.sql_da_lib(q, s)
        v = (B.B20.ler_como(B.PRINCIPAL_REF, uid, sql, email) or [{}])[-1].get("v")
        obtido = resp.get("linhas") if q in B.LISTAS_DA_LIB else resp.get("valor")
        igual_ao_sql(o, f"P {q} = o SQL da lib ({B.SQL_DA_LIB[q][0]}) como a aluna", obtido, v)


def p_e_n1_casca(o, L, s: str, estado, rodada: str, casos: set) -> None:
    """P/N1 das ações da casca (a ordem importa: o push antes da massa; a massa → N1 → o P que marca)."""
    tok, uid = L.token(B.ALUNA), L.uid(B.ALUNA)
    # ── o push (antes da massa: o aviso novo com aparelho registrado dispararia o push-enviar)
    tk = token_de_teste(rodada)
    conta_tk = f"select count(*)::int as n from {s}.push_aparelhos where token = {C.txt(tk)} and user_id = {C.txt(uid)}"
    estado.d["hml21_push"] = tk  # anotado ANTES (o fechar_rodada esquece se a rodada cair no meio)
    estado.salvar()
    st, r, _h, _ms = B.conta(tok, "push_registrar", {"token": tk, "plataforma": "android", "versao": None})
    o.ok(st == 200 and (r.get("resultado") or {}).get("ok") is True and B.ler_principal(conta_tk)[0]["n"] == 1,
         f"P push_registrar → o aparelho de teste da aluna gravado (1) ({st})")
    if "N1" in casos:
        st, r, _h, _ms = B.conta(L.token(B.OUTRA), "push_esquecer", {"token": tk})
        o.ok(st == 200 and (r.get("resultado") or {}).get("apagados") == 0 and B.ler_principal(conta_tk)[0]["n"] == 1,
             f"N1 push_esquecer do token da aluna por OUTRA conta → 0 apagado; o aparelho segue ({st})")
    st, r, _h, _ms = B.conta(tok, "push_esquecer", {"token": tk})
    if o.ok(st == 200 and (r.get("resultado") or {}).get("apagados") == 1 and B.ler_principal(conta_tk)[0]["n"] == 0,
            f"P push_esquecer → o aparelho de teste saiu (1 apagado; 0 no banco) ({st})"):
        estado.d["hml21_push"] = None
        estado.salvar()
    # ── a massa do sino e o lido
    ids = B.criar_massa_avisos(o, estado, L, s, uid, rodada)
    lidos = lambda: B.ler_principal(f"select count(*) filter (where lido_em is not null)::int as n from {s}.avisos where id = any(array[{', '.join(C.txt(i) for i in ids)}]::uuid[])")[0]["n"]  # noqa: E731
    if ids and "N1" in casos:
        st, r, _h, _ms = B.conta(L.token(B.OUTRA), "avisos_marcar_lidos", {"ids": ids, "destino_user_id": uid})
        o.ok(st == 200 and r.get("marcados") == 0 and lidos() == 0, f"N1/N4 marcar os avisos da aluna por OUTRA conta → 0 marcado; seguem não lidos ({st})")
        st, r, _h, _ms = B.conta(L.token(B.OUTRA), "aviso_membro_ok", {"id": ids[0]})
        o.ok(st == 404 and r.get("erro") == "nao_encontrado" and lidos() == 0, f"N1 o 'Entendi' no aviso da aluna por OUTRA conta → 404 nao_encontrado ({st})")
    if ids:
        st, r, _h, _ms = B.conta(tok, "aviso_membro_ok", {"id": ids[0]})
        o.ok(st == 200 and lidos() == 1, f"P aviso_membro_ok → o lido_em só daquela linha ({st})")
        st, r, _h, _ms = B.conta(tok, "avisos_marcar_lidos", {"ids": ids})
        o.ok(st == 200 and r.get("marcados") == len(ids) and lidos() == len(ids), f"P avisos_marcar_lidos → {r.get('marcados')} marcado(s); todos lidos ({st})")
    # ── a sessão e a senha (sem mudança de estado: a aluna não tem a marca de senha provisória)
    st, r, _h, _ms = B.conta(tok, "senha_definida")
    o.ok(st == 200 and r.get("definida") is False, f"P senha_definida (a aluna sem a marca) → definida false, nada mudou ({st})")
    visto = B.ler_principal(f"select (config->'aviso_mudanca_visto') ? '1' as visto from {s}.profiles where id = {C.txt(uid)}")[0].get("visto")
    if visto:
        st, r, _h, _ms = B.conta(tok, "aviso_mudanca_marcar", {"versao": "1"})
        o.ok(st == 200, f"P aviso_mudanca_marcar (a aluna já viu a versão 1: o mesmo estado) ({st})")
    else:
        o.linha("   (aviso_mudanca_marcar: a aluna não tem a versão 1 vista — não marco por ela; o caso fica no Vitest)")
    # ── o aceite e o onboarding: os caminhos que NÃO gravam (a desfecho da RPC, como hoje)
    antes = B.ler_principal(f"select count(*)::int as n from {s}.aceites where user_id = {C.txt(uid)}")[0]["n"]
    st, r, _h, _ms = B.conta(tok, "aceitar_textos", {"versao": VERSAO_ERRADA, "origem": "site", "saude": False, "nascimento": None, "versao_app": None})
    res = r.get("resultado") or {}
    o.ok(st == 200 and res.get("ok") is False and res.get("erro") in ("versao_desatualizada", "textos_desligados")
         and B.ler_principal(f"select count(*)::int as n from {s}.aceites where user_id = {C.txt(uid)}")[0]["n"] == antes,
         f"P aceitar_textos (versão que não é a vigente) → {res.get('erro')}; 0 aceite gravado ({st})")
    # decisão I (nenhuma conta nem matrícula nova): o caminho que NÃO grava só roda com a pré-condição conferida (SQL só leitura, só
    # contagem) — a aluna com profissional (a matrícula ativa fora da conta do app: a matricular_no_app volta com_profissional antes de
    # gravar) e o w13-dono já dono/membro de uma conta (a criar_minha_conta volta ja_existia/ja_tem_conta antes de gravar); sem ela, o caso
    # fica no Vitest (PADRÃO)
    com_prof = B.ler_principal(f"select count(*)::int as n from {s}.pacientes p where p.user_id = {C.txt(uid)} and p.deleted_at is null "
                               f"and p.ativo and p.conta_id is distinct from {s}.conta_do_app()")[0]["n"]
    if com_prof:
        pac_antes = B.ler_principal(f"select count(*)::int as n from {s}.pacientes where user_id = {C.txt(uid)}")[0]["n"]
        for corpo in ({"objetivo": "manter", "plano": "treino"},
                      {"objetivo": "manter", "plano": "treino", "nascimento": "1899-12-31", "consentimento": "x", "origem": "site"}):
            st, r, _h, _ms = B.conta(tok, "entrar_sem_profissional", corpo)
            res = r.get("resultado") or {}
            o.ok(st == 200 and res.get("ok") is False and res.get("erro") in ("com_profissional", "atualize_o_app", "nascimento_invalido"),
                 f"P entrar_sem_profissional ({len(corpo)} campos; a aluna tem profissional) → {res.get('erro')} ({st})")
        o.ok(B.ler_principal(f"select count(*)::int as n from {s}.pacientes where user_id = {C.txt(uid)}")[0]["n"] == pac_antes, "P: 0 matrícula nova da aluna")
    else:
        o.linha("   PADRÃO: a aluna sem matrícula ativa com profissional — o entrar_sem_profissional NÃO roda (gravaria); fica no Vitest")
    tok_o, uid_o = L.token(B.OUTRA), L.uid(B.OUTRA)
    ja_tem = B.ler_principal(f"select ((select count(*) from {s}.contas where dono_id = {C.txt(uid_o)} and origem = 'nova') + (select count(*) "
                             f"from {s}.conta_membros where user_id = {C.txt(uid_o)} and status = 'ativo'))::int as n")[0]["n"]
    if ja_tem:
        contas_antes = B.ler_principal(f"select count(*)::int as n from {s}.contas where dono_id = {C.txt(uid_o)}")[0]["n"]
        st, r, _h, _ms = B.conta(tok_o, "criar_minha_conta", {"nome": "Conta de teste hml21", "tipo": "personal", "registro": None})
        res = r.get("resultado") or {}
        o.ok(st == 200 and ((res.get("ok") is True and res.get("ja_existia") is True) or res.get("erro") == "ja_tem_conta")
             and B.ler_principal(f"select count(*)::int as n from {s}.contas where dono_id = {C.txt(uid_o)}")[0]["n"] == contas_antes,
             f"P criar_minha_conta (quem já é dono de conta: o caminho idempotente) → {res.get('erro') or 'ja_existia'}; 0 conta nova ({st})")
    else:
        o.linha("   PADRÃO: o w13-dono sem conta nem equipe ativa — o criar_minha_conta NÃO roda (criaria uma conta); fica no Vitest")


def p_e_n_app(o, L, s: str, estado, rodada: str, casos: set) -> None:
    """P/N das gravações do app: o nome (o mesmo), a foto (pelo link assinado; a de antes devolvida), o objetivo (sem matrícula do app)."""
    tok, uid = L.token(B.ALUNA), L.uid(B.ALUNA)
    nome = B.ler_principal(f"select nome from {s}.profiles where id = {C.txt(uid)}")[0].get("nome")
    dados_antes = B.ler_principal(f"select dados_profissionais::text as d from {s}.profiles where id = {C.txt(uid)}")[0].get("d")
    st, r, _h, _ms = B.conta(tok, "perfil_nome", {"nome": nome or "Aluna", "dados_profissionais": {"foto_url": "https://x/y.png"}, "email": "x@y", "id": OUTRO})
    depois = B.ler_principal(f"select nome, dados_profissionais::text as d from {s}.profiles where id = {C.txt(uid)}")[0]
    o.ok(st == 200 and depois.get("nome") == nome and depois.get("d") == dados_antes,
         f"P/N4/N5 perfil_nome (o mesmo nome; dados_profissionais/email/id no corpo CAEM) → só o nome; o resto igual ({st})")
    st, r, _h, _ms = B.conta(tok, "mudar_objetivo_app", {"objetivo": "manter"})
    o.ok(st == 200 and (r.get("resultado") or {}).get("erro") == "sem_matricula_app", f"P mudar_objetivo_app (a aluna, sem matrícula do app) → sem_matricula_app ({st})")
    # ── a foto: a de antes guardada (URL no Estado + cópia no TMPDIR) — volta no finally do rodar (B.devolver_foto)
    B.guardar_foto(o, estado, s, uid)
    antes = (estado.d.get("hml21_foto") or {}).get("url")
    png = B.png_sintetico(16)
    st, p, _h, _ms = B.conta(tok, "perfil_foto_preparar", {"tipo": "image/png", "tamanho": len(png)})
    o.ok(st == 200 and str(p.get("caminho", "")).startswith(f"{uid}/foto-") and p.get("token") and p.get("bucket") == B.bucket_das_fotos(s),
         f"P perfil_foto_preparar → o link na pasta da aluna, no bucket do ambiente ({st})", parar=True)
    put = B.subir_no_link(p["bucket"], p["caminho"], p["token"], png, "image/png", tok)
    estado.objeto(p["bucket"], p["caminho"])  # o arquivo de teste, na hora (o limpar_foto confere que não fica no bucket)
    o.ok(put in (200, 201) and B.objetos(p["bucket"], [p["caminho"]]) == 1, f"P o PUT no link assinado (o uploadToSignedUrl da tela) → o arquivo no bucket ({put})")
    if "N1" in casos or "N8" in casos:
        st8, r8, _h, _ms = B.conta(L.token(B.OUTRA), "perfil_foto_salvar", {"caminho": p.get("caminho")})
        o.ok(st8 == 400 and r8.get("erro") == "dados_invalidos" and B.foto_da_conta(s, uid) == antes,
             f"N1/N8 OUTRA conta salva a foto na pasta da aluna → 400 dados_invalidos; a foto da aluna não mudou ({st8})")
        for ruim in (f"{uid}/../{OUTRO}/foto-1.png", f"{uid}/sub/foto-1.png", f"{OUTRO}/foto-1.png", f"{uid}/foto-1.gif"):
            st8, r8, _h, _ms = B.conta(tok, "perfil_foto_salvar", {"caminho": ruim})
            o.ok(st8 == 400 and r8.get("erro") == "dados_invalidos" and B.foto_da_conta(s, uid) == antes,
                 f"N8 o caminho fora da pasta/do formato → 400 dados_invalidos; nada gravado ({st8})")
    st, r, _h, _ms = B.conta(tok, "perfil_foto_salvar", {"caminho": p.get("caminho")})
    url = r.get("url")
    o.ok(st == 200 and url == f"{B.URL_API_PROPRIA}/storage/v1/object/public/{p['bucket']}/{p['caminho']}" and B.foto_da_conta(s, uid) == url,
         f"P perfil_foto_salvar → a URL pública (a do getPublicUrl, no domínio próprio) gravada no perfil ({st})")
    o.ok(B.baixar_bytes(url)[0] == 200 if url else False, "P a foto nova abre pela URL pública (200)")
    anterior = B.caminho_da_url(antes, p["bucket"], uid)
    if anterior:
        o.ok(B.objetos(p["bucket"], [anterior]) == 0, "P a foto de ANTES (da pasta da aluna, neste bucket) saiu do bucket (achado 2; SQL só leitura)")
    else:
        o.linha("   (a foto de antes não era um arquivo da pasta da aluna neste bucket: nada a apagar — como o servidor decide)")


def n_gerais(o, L, area: str, casos: set, estado=None) -> None:
    """N2, N3, N6, N7, N9, N11 e o N1 das leituras (com a massa do sino da aluna, se a rodada criou: nenhum id dela na resposta da outra conta)."""
    tok = L.token(B.ALUNA)
    q0 = "avisos" if area == "casca" else "perfil_foto"
    if "N2" in casos:
        st, r, _h, _ms = B.ler(None, [B.item(q0)], sem_auth=True)
        st2, r2, _h, _ms = B.conta(None, ACOES[area][0], {}, sem_auth=True)
        o.ok(st == 401 and st2 == 401, f"N2 sem login → 401 (o `ler` {st}, a ação {st2})")
    if "N3" in casos:
        st, r, _h, _ms = B.ler(tok, [B.item(q0), B.item("conta_inteira")])
        st2, r2, _h, _ms = B.conta(tok, "acao_que_nao_existe")
        o.ok(st == 200 and [i.get("erro") for i in B.itens_de(r)] == [None, "consulta_invalida"] and st2 == 400 and r2.get("erro") == "acao_invalida",
             f"N3 q desconhecida → o item consulta_invalida; ação desconhecida → 400 acao_invalida ({st}, {st2})")
    if "N6" in casos:
        st, r, _h, _ms = B.ler(tok, [B.item(q0)], schema_="outro")
        o.ok(st == 400 and r.get("erro") == "schema_invalido", f"N6 x-schema inválido → 400 schema_invalido ({st})")
    if "N7" in casos:
        st, h = B.preflight_conta(B.ORIGEM_FORA)
        st2, h2 = B.preflight_conta(B.BASES["staging"])
        o.ok(B.cors(h) == B.ORIGEM_PADRAO and B.cors(h2) == B.BASES["staging"], f"N7 origem fora → o CORS padrão ({st}); a do site volta ela mesma ({st2})")
    if "N9" in casos:
        st, r, _h, _ms = B.ler(tok, [B.item(q0)] * 17)
        o.ok(st == 400 and r.get("erro") == "lote_grande", f"N9 lote de 17 → 400 lote_grande ({st})")
    if "N11" in casos:
        st, r, _h, _ms = B.ler(tok, [B.item(q) for q in DO_PAINEL])
        o.ok(st == 200 and all(i.get("erro") == "consulta_invalida" for i in B.itens_de(r)), f"N11 a aluna pede o PAINEL pela conta → consulta_invalida ({st})")
    if "N1" in casos:
        tok_o = L.token(B.OUTRA)
        uid_a = L.uid(B.ALUNA)
        st, r, _h, _ms = B.ler(tok_o, [B.item("avisos"), B.item("perfil_foto"), B.item("meu_perfil_aluno"), B.item("minha_agenda")])
        texto = json.dumps(r)
        massa = [i for i in ((estado.d.get("avisos") if estado else None) or []) if isinstance(i, str)]
        o.ok(st == 200 and uid_a not in texto and not any(i in texto for i in massa) and all(i.get("ok") for i in B.itens_de(r)),
             f"N1 OUTRA conta lê o sino, a foto, o perfil e a agenda pela conta → só os dela (nenhum id da aluna; nenhum dos {len(massa)} "
             f"avisos da massa) ({st})")


def so_leitura(o, base: str) -> None:
    """O smoke só leitura (a produção, no F8, ou o staging logo depois de publicar): OPTIONS (o CORS), sem login → 401, x-schema inválido →
    400 e a q desconhecida → consulta_invalida (o `ler` recusa antes do banco) — nada grava; 1 login (a conta de teste da base)."""
    B.usar_base(base)
    origem = B.BASES[base]
    st, h = B.preflight_conta(origem)
    st2, h2 = B.preflight_conta(B.ORIGEM_FORA)
    o.ok(st in (200, 204) and B.cors(h) == origem and B.cors(h2) == B.ORIGEM_PADRAO,
         f"[{base}] OPTIONS → {st}; a origem do site volta ela mesma e a de fora, o padrão ({st2})")
    st, r, _h, _ms = B.ler(None, [B.item("avisos")], sem_auth=True, origem=origem)
    o.ok(st == 401, f"[{base}] sem login → 401 ({st})")
    L = B.Sessoes(f"api21 so-leitura {base}" + (" (prod)" if base == "prod" else ""))
    try:
        tok = L.token(B.PROD_CONTA if base == "prod" else B.ALUNA)
        st, r, _h, _ms = B.ler(tok, [B.item("avisos")], schema_="outro", origem=origem)
        o.ok(st == 400 and r.get("erro") == "schema_invalido", f"[{base}] x-schema inválido → 400 schema_invalido ({st})")
        st, r, _h, ms = B.ler(tok, [B.item("q_que_nao_existe")], origem=origem)
        o.ok(st == 200 and [i.get("erro") for i in B.itens_de(r)] == ["consulta_invalida"],
             f"[{base}] a q desconhecida → consulta_invalida (o `ler` recusa antes do banco; {ms} ms)")
    finally:
        L.fechar(o)


def rodar(o, area: str, base: str, casos: set) -> None:
    s = B.usar_base(base)
    if base == "prod":
        raise SystemExit("na produção só o --so-leitura (nada grava)")
    B.exigir_saude(o, f"o api.py --area {area} da hml-21a")
    L = B.Sessoes(f"api21 {area} {base}")
    estado = B.abrir_rodada(o, s)
    rodada = estado.d["rodada"]
    try:
        if "P" in casos:
            p_leituras(o, L, area, s)
            if area == "casca":
                p_e_n1_casca(o, L, s, estado, rodada, casos)
            else:
                p_e_n_app(o, L, s, estado, rodada, casos)
        n_gerais(o, L, area, casos, estado)
    finally:
        try:
            B.fechar_rodada(o, estado, s, L)
        finally:
            L.fechar(o)


def limpar(o, base: str) -> None:
    """O --limpar (depois de qualquer corte): a massa do sino (os ids do Estado + os da aluna de TESTE que ainda têm a marca) e a foto (a de
    antes volta pela cópia do TMPDIR; os arquivos de teste saem) — conferido por SQL só leitura, só contagem."""
    s = B.usar_base(base)
    estado = B.Estado.ler()
    if (estado.d.get("area") or B.AREA_ESTADO) != B.AREA_ESTADO:
        o.ok(False, f"a rodada pendente é de outra área ({estado.d.get('area')}): rode o --limpar dela", parar=True)
    if s == "staging" and not C.eh_uuid(estado.d.get("hml21_destino")):
        # nada anotado: ainda assim, a massa que tem a marca (uma rodada que caiu antes de anotar o destino) sai
        if B.ler_principal(B.sql_contar_avisos(s))[0].get("avisos"):
            estado.d["hml21_destino"] = B.uid_da_conta(B.ALUNA)
    L = B.Sessoes("api21 --limpar")
    try:
        B.fechar_rodada(o, estado, s, L)
    finally:
        L.fechar(o)
    if s == "staging":
        sobra = B.ler_principal(B.sql_contar_avisos(s))[0]
        o.ok(not sobra.get("avisos"), f"--limpar conferido (SQL só leitura): 0 aviso com a marca da hml-21 ({sobra.get('avisos')})")


def sair(o) -> None:
    """O logout (scope=local) das sessões guardadas — no fim da etapa 2 (as do Treino também)."""
    B.Sessoes("api21 sair").sair(o)


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-21a — os casos de servidor da função conta (a casca e o app do aluno)")
    ap.add_argument("--area", default="casca", choices=("casca", "app"))
    ap.add_argument("--base", default="local", choices=tuple(B.BASES))
    ap.add_argument("--casos", default=",".join(CASOS))
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--seco", action="store_true")
    g.add_argument("--limpar", action="store_true")
    g.add_argument("--so-leitura", action="store_true")
    g.add_argument("--sair", action="store_true")
    a = ap.parse_args()
    B.corte_vira_saida()
    casos = {c.strip() for c in a.casos.split(",") if c.strip()}
    fora = casos - set(CASOS)
    if fora:
        raise SystemExit(f"casos desconhecidos: {sorted(fora)}")
    nome = f"api21_{a.area}_" + ("seco" if a.seco else "limpar" if a.limpar else "sair" if a.sair else f"{a.base}_so_leitura" if a.so_leitura else a.base)
    o = C.Saida(nome)
    try:
        if a.seco:
            seco(o, a.area)
        elif a.limpar:
            limpar(o, a.base)
        elif a.sair:
            sair(o)
        elif a.so_leitura:
            so_leitura(o, a.base)
        else:
            rodar(o, a.area, a.base, casos)
    except (Exception, SystemExit) as e:  # noqa: BLE001
        o.ok(False, f"parou no meio: {type(e).__name__}: {str(e)[:300]}")
    if not a.seco:
        C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
