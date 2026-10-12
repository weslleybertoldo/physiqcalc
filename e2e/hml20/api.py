#!/usr/bin/env python3
"""Physiq hml-20a (H-42 · jeito 2, etapa 2, 11/10/2026) — os casos de SERVIDOR das leituras do app do aluno: a ação `ler` da nutricao
(as consultas aluno_dieta, aluno_diario_urls e aluno_evolucao) e a `minha_evolucao` da admin-avaliacoes (Treino).

Contas (staging, só de TESTE): A = w5p-aluna (o app — a sessão do principal e a do Treino pela MESMA troca do app); P = w5p-nutri (a nutri
da aluna: a foto de evolução da massa); T = w5p-personal (a personal da aluna: a foto mensal da massa, no Treino; N10); N1 = w13-dono
(OUTRA conta). No máximo 6 logins na etapa 2 (o registro: hml20/agente/logins_etapa2_20a.txt).
A massa (decisão G): a aluna de teste não tem foto — para provar a assinatura, a rodada cria pelos caminhos que JÁ existem, só no staging
e nos buckets *-staging, com a marca "hml20 e2e <rodada>": 1 foto no diário (a aluna: aluno_diario_preparar → PUT → aluno_diario_enviar),
1 foto de evolução (a nutri: foto_evolucao_preparar → PUT → foto_evolucao_registrar) e 1 foto mensal no mês SENTINELA 2000-01 (a personal:
foto_preparar → PUT → foto_salvar; antes de subir, 0 foto daquele aluno/mês nos 2 schemas). Os ids vão ao Estado
(hml19/agente/e2e_estado.json) e saem no fim (ou no --limpar): pela própria função (diario_excluir e foto_evolucao_excluir pela nutri,
foto_excluir pela personal — a linha e o arquivo) e o DELETE das linhas da rodada (só staging, só os ids); conferido por SQL só leitura,
só contagem (0 linha com a marca, 0 arquivo da rodada, 0 foto no mês sentinela nos 2 schemas).
  P   cada consulta com a conta certa = as MESMAS linhas que o SQL só leitura rodado COMO A ALUNA (o papel authenticated + o sub): a
      aluno_dieta = a minha_dieta(dia); a aluno_evolucao = a minha_evolucao() (+ a url de cada foto); a aluno_diario_urls = o id e o path
      das linhas dela; a minha_evolucao do Treino = o perfil, as avaliações (as 200 mais novas, em ordem crescente) e as fotos dela; a URL
      assinada (montada com o domínio do cliente, como a tela) baixa a imagem da massa (200)
  N1  outra conta (w13-dono) pede as 3 consultas (e os ids do diário da aluna) → listas vazias / valor dela, NUNCA uma linha da aluna
  N2  sem login → 401 (as 2 funções) · N3 q desconhecida → o item consulta_invalida (os outros itens respondem)
  N4  nutricionista_id/user_id/paciente_id/aluno de outra pessoa no corpo → ignorados (o dono é quem chama; no Treino, o sub)
  N5  param/coluna fora da lista (select, colunas, p_dia, caminho) → ignorados (a resposta é a mesma)
  N6  x-schema inválido → 400 schema_invalido (as 2; na minha_evolucao, antes do login) · N7 origem fora da lista → o CORS padrão de cada
  N8  pedir a URL de um caminho que não é da consulta → não assina (o caminho no corpo cai; o id de outra pessoa não volta)
  N9  lote de 17 → 400 lote_grande · N10 a aluna pede a minha_evolucao → só a dela (o sub); a personal → só o próprio (vazio)
Produção (--base prod --so-leitura) e o smoke logo depois de publicar (--base staging --so-leitura): OPTIONS (o CORS das 2), sem login →
401, x-schema inválido → 400 e a q desconhecida → consulta_invalida (o `ler` sem banco) — nada grava; 1 login (o da conta de teste).
Antes de CADA execução que toca o staging: ~/projetos/physiqcalc-scratch/hml/hml19/ferramentas/pausa.sh "<o que ia rodar>".
Uso: python3 e2e/hml20/api.py --area aluno [--base local|staging|prod] [--casos P,N1,…,N10] [--seco | --limpar | --so-leitura | --sair]
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
CASOS = ("P", "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9", "N10")
AREA = "aluno20a"  # a área no Estado (o --limpar desta W só desfaz a rodada dela)
FALSO = "00000000-0000-4000-8000-0000000000aa"
OUTRO = "44444444-4444-4444-8444-444444444444"
CONSULTAS_DA_20A = ("aluno_diario_urls", "aluno_dieta", "aluno_evolucao")


def hoje_sp() -> str:
    """O dia de São Paulo (o hojeSP da tela)."""
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date().isoformat()


def agora() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def canonico(v: object) -> str:
    return json.dumps(v, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def sem_url(valor: object, lista: str = "fotos") -> object:
    """O valor da aluno_evolucao sem a `url` que o servidor põe em cada foto (para comparar com a RPC pura)."""
    if isinstance(valor, dict) and isinstance(valor.get(lista), list):
        return {**valor, lista: [{k: v for k, v in f.items() if k != "url"} if isinstance(f, dict) else f for f in valor[lista]]}
    return valor


def ids_de(valor: object) -> set[str]:
    """Todo uuid que aparece num JSON (para o N1: nenhuma linha da aluna na resposta de outra pessoa)."""
    achados: set[str] = set()

    def andar(x: object) -> None:
        if isinstance(x, dict):
            for v in x.values():
                andar(v)
        elif isinstance(x, list):
            for v in x:
                andar(v)
        elif C.eh_uuid(x):
            achados.add(str(x))
    andar(valor)
    return achados


# ───────────────────────── os pedidos (puros: o --seco confere todos contra o servidor) ─────────────────────────
def pedidos_ler(dia: str, ids: list[str]) -> list[dict]:
    """Os corpos `ler` da rodada (P e os N): o --seco passa cada um pelo lerPedidoDeLeitura do servidor."""
    ok = [B.item("aluno_dieta", dia=dia), B.item("aluno_evolucao"), B.item("aluno_diario_urls", ids=ids)]
    return [
        {"acao": "ler", "itens": ok},
        # N3: a q desconhecida no meio (os outros itens respondem)
        {"acao": "ler", "itens": [ok[0], B.item("aluno_tudo"), B.item("prontuario_inteiro")]},
        # N4/N5: o dono, o aluno, as colunas e o caminho no corpo — tudo cai
        {"acao": "ler", "itens": [B.item("aluno_evolucao", user_id=OUTRO, nutricionista_id=OUTRO, paciente_id=OUTRO, aluno=OUTRO),
                                  B.item("aluno_dieta", dia=dia, p_dia="1999-01-01", select="*", colunas="*"),
                                  B.item("aluno_diario_urls", ids=ids, path=f"{OUTRO}/x/y.png", caminhos=[f"{OUTRO}/x/y.png"], select="*")]},
        # o param fora da forma (dia ruim, ids acima de 60)
        {"acao": "ler", "itens": [B.item("aluno_dieta", dia="2026-02-31"), B.item("aluno_diario_urls", ids=[str(uuid.UUID(int=i)) for i in range(61)])]},
        # N9: 17 itens
        {"acao": "ler", "itens": [ok[1]] * 17},
    ]


# ───────────────────────── o --seco ─────────────────────────
def seco(o) -> None:
    ids = [FALSO, OUTRO]
    pedidos = pedidos_ler("2026-10-11", ids)
    r = B.regras_leitura(pedidos, ["minha_evolucao", "list", "create", "foto_salvar", "MINHA_EVOLUCAO"],
                         [{"code": "42501"}, {"message": "TimeoutError: x"}, {"code": "22P02"}, {"code": "PGRST116"}])
    consultas = r["consultas"]
    o.ok(sorted(consultas) == sorted(CONSULTAS_DA_20A), f"o catálogo do servidor (lido do TS): as 3 consultas da 20a ({sorted(consultas)})")
    o.ok(consultas["aluno_dieta"]["rpc"] == "minha_dieta" and consultas["aluno_dieta"]["args"] == {"p_dia": "dia"}
         and consultas["aluno_evolucao"]["rpc"] == "minha_evolucao" and consultas["aluno_evolucao"]["assinar"]["lista"] == "fotos"
         and consultas["aluno_diario_urls"]["tabela"] == "diario_alimentar" and consultas["aluno_diario_urls"]["colunas"] == ["id", "path"],
         "as fontes: aluno_dieta = minha_dieta(p_dia); aluno_evolucao = minha_evolucao() + as fotos; aluno_diario_urls = diario_alimentar (id, path)")
    o.ok(set(B.AREAS["aluno"]["rpcs"]) == {c["rpc"] for c in consultas.values() if c["rpc"]},
         "a guarda que conta (leitura direta da área) tem as MESMAS RPCs que o catálogo leva ao servidor")
    o.ok(r["lote_max"] == 16 and r["paralelo"] == 6 and r["diario_ids_max"] == 60 and r["validade"] == 3600,
         f"os tetos do motor: lote {r['lote_max']}, paralelo {r['paralelo']}, ids do diário {r['diario_ids_max']}, validade {r['validade']} s")
    o.ok(r["buckets"] == {"diario:public": "diario", "diario:staging": "diario-staging", "evolucao:public": "evolucao", "evolucao:staging": "evolucao-staging"}
         and r["buckets"]["diario:staging"] == B.bucket_do_diario("staging") and r["buckets"]["evolucao:staging"] == B.bucket_da_evolucao("staging"),
         "os buckets de leitura do servidor = os da massa (staging = *-staging)")
    p_ok, p_n3, p_n45, p_ruim, p_n9 = r["pedidos"]
    o.ok(p_ok["ok"] and all(i["ok"] for i in p_ok["itens"]) and [i["q"] for i in p_ok["itens"]] == ["aluno_dieta", "aluno_evolucao", "aluno_diario_urls"],
         "P: os 3 itens da rodada passam no lerPedidoDeLeitura do servidor (na ordem)")
    o.ok(p_n3["ok"] and p_n3["itens"][0]["ok"] and [i.get("erro") for i in p_n3["itens"][1:]] == ["consulta_invalida", "consulta_invalida"],
         "N3 no servidor: a q desconhecida → só aquele item volta consulta_invalida")
    i45 = p_n45["itens"]
    o.ok(p_n45["ok"] and all(i["ok"] for i in i45) and i45[0]["params"] == {} and i45[1]["params"] == {"dia": "2026-10-11"}
         and i45[2]["params"] == {"ids": ids}, "N4/N5 no servidor: dono, aluno, colunas, p_dia e caminho do corpo caem (só os params declarados)")
    o.ok(p_ruim["ok"] and [i.get("erro") for i in p_ruim["itens"]] == ["dados_invalidos", "dados_invalidos"],
         "o param fora da forma (dia 2026-02-31, 61 ids) → dados_invalidos naquele item")
    o.ok(p_n9 == {"ok": False, "erro": "lote_grande"}, "N9 no servidor: 17 itens → lote_grande (o pedido inteiro)")
    t = r["treino"]
    acoes = {a["action"]: a for a in r["acoes"]}
    o.ok(t["acoes_de_leitura"] == ["minha_evolucao"] and acoes["minha_evolucao"]["leitura"] and not acoes["minha_evolucao"]["grava"]
         and not acoes["list"]["leitura"] and acoes["create"]["grava"] and not acoes["MINHA_EVOLUCAO"]["leitura"],
         "Treino: minha_evolucao é LEITURA (fora das que gravam); a list, o create e o nome errado, não")
    o.ok(len(t["perfil"]) == 37 and "observacao" in t["avaliacoes"] and "user_id" not in t["avaliacoes"] and t["fotos"] == ["id", "mes_ref", "tipo", "storage_path", "created_at"]
         and (t["max_avaliacoes"], t["max_fotos"], t["validade"], t["freio"]) == (200, 200, 3600, 60),
         f"Treino: as colunas fechadas (perfil {len(t['perfil'])}, avaliações {len(t['avaliacoes'])}, fotos 5) e os tetos (200/200, 1 h, 60/min)")
    o.ok(t["buckets"] == {"public": "registros", "staging": "registros-staging"} == {s: B.bucket_dos_registros(s) for s in ("public", "staging")},
         "Treino: o bucket das fotos mensais do ambiente = o da massa")
    o.ok([e["erro"] for e in r["erros"]] == ["sem_acesso", "tempo_esgotado", "dados_invalidos", "erro_interno"],
         "erroDaLeitura do servidor: 42501 → sem_acesso · tempo → tempo_esgotado · 22P02 → dados_invalidos · o resto → erro_interno")
    # a Guarda dos E2E (decisão I): as leituras passam; as gravações e o corpo disfarçado seguem barrados
    g = B.B17.funcao_grava
    o.ok(not g("nutricao", "ler", json.dumps(pedidos[0])) and not g("admin-avaliacoes", "minha_evolucao", json.dumps({"action": "minha_evolucao"}))
         and g("nutricao", "ler", json.dumps({"action": "ler", "acao": "anotacao_criar"})) and g("nutricao", "ler"),
         "a Guarda: o `ler` e a minha_evolucao passam pelo corpo; o disfarçado e o sem corpo seguem gravação")
    # o P "como a pessoa": só leitura, com o papel e o sub
    sql = B.sql_como(OUTRO, "select 1 as v")
    o.ok(sql.startswith("set transaction read only;") and "set_config('role', 'authenticated', true)" in sql and OUTRO in sql,
         "o SQL do P: transação SÓ LEITURA, o papel authenticated e o sub nas claims (como o PostgREST)")
    recusou = False
    try:
        B.ler_como(B.PRINCIPAL_REF, OUTRO, "delete from staging.diario_alimentar")
    except SystemExit:
        recusou = True
    o.ok(recusou, "o SQL do P recusa palavra de escrita antes de ir ao banco")
    # a limpeza e a conferência
    pac = "11111111-1111-4111-8111-111111111111"
    sqls = [B.sql_apagar_diario("staging", pac, [FALSO]), B.sql_apagar_fotos_evolucao("staging", OUTRO, [FALSO]), B.sql_apagar_fotos_treino("staging", pac, [FALSO])]
    o.ok(all("staging." in s and "any(array[" in s for s in sqls) and "paciente_id = '" in sqls[0] and "nutricionista_id = '" in sqls[1]
         and f"'{B.MES_SENTINELA}-01'::date" in sqls[2], "a limpeza: só staging, só os ids da rodada, só a aluna/nutri de teste e o mês sentinela")
    recusas = 0
    for f in (lambda: B.sql_apagar_diario("public", pac, [FALSO]), lambda: B.sql_apagar_fotos_evolucao("public", OUTRO, [FALSO]),
              lambda: B.sql_apagar_diario("staging", pac, [])):
        try:
            f()
        except SystemExit:
            recusas += 1
    o.ok(recusas == 3, "a limpeza recusa outro schema que não o staging (e o DELETE sem id)")
    conta = B.sql_contar_marca("staging", "seco-0000")
    o.ok(conta.count(" as ") == 2 and "'%hml20 e2e%seco-0000%'" in conta and "staging.diario_alimentar" in conta and "staging.fotos_evolucao" in conta,
         "a conferência final: a marca da rodada no diário e nas fotos de evolução (só contagem)")
    jpg, png = B.jpeg_sintetico(), B.png_sintetico()
    o.ok(jpg[:3] == b"\xff\xd8\xff" and png[:4] == b"\x89PNG" and len(jpg) < 2000 and len(png) < 2000,
         f"as imagens de teste são sintéticas e pequenas (JPEG {len(jpg)} B, PNG {len(png)} B)")
    o.ok(B.REG_LOGINS.name == "logins_etapa2_20a.txt" and B.B19.MAX_LOGINS == 6, f"o registro de logins da 20a (decisão G): {B.REG_LOGINS} (até {B.B19.MAX_LOGINS})")
    # o teto conta só o staging: o login do smoke da produção (o motivo termina em "prod)") não come os 6 da etapa 2 (num registro de mentira)
    real = B.B19.REG_LOGINS
    falso = B.SCRATCH / "tmp" / "logins_seco_20a.txt"
    try:
        falso.parent.mkdir(parents=True, exist_ok=True)
        falso.write_text("login 1/6 w5p-nutri 23:00:00 (api20 aluno --so-leitura staging)\n"
                         "login 2/6 nutri-legado 23:01:00 (api20 aluno --so-leitura prod)\n\n"
                         "login 2/6 w5p-aluna (Treino: trocar-token) 23:02:00 (api20 aluno staging)\n", encoding="utf-8")
        B.B19.REG_LOGINS = falso
        n = B.Sessoes.logins_feitos()
    finally:
        B.B19.REG_LOGINS = real
        if falso.exists():
            falso.unlink()
    o.ok(n == 2 and B.B19.REG_LOGINS == real, f"o teto conta só os logins do staging (o da produção fica de fora): {n} de 3 linhas")
    o.ok(B.url_da_tela("https://api.x.br", "/storage/v1/object/sign/diario/a.png?token=t") == "https://api.x.br/storage/v1/object/sign/diario/a.png?token=t"
         and B.url_da_tela("https://api.x.br", "https://outro/x") is None, "a URL relativa do servidor montada com o domínio do cliente (como a tela)")
    # o corte (SIGTERM) vira SystemExit e o finally (a limpeza) roda
    import signal  # noqa: PLC0415
    import subprocess  # noqa: PLC0415
    prova = ("import sys, signal, os, time; sys.path.insert(0, %r); import _base as B; B.corte_vira_saida()\n"
             "try:\n    os.kill(os.getpid(), signal.SIGTERM); time.sleep(5)\nfinally:\n    print('LIMPEZA RODOU')") % str(Path(__file__).resolve().parent)
    r2 = subprocess.run([sys.executable, "-c", prova], capture_output=True, text=True, timeout=60)
    o.ok("LIMPEZA RODOU" in r2.stdout and r2.returncode != 0 and signal.SIGTERM.name in r2.stderr,
         f"o SIGTERM vira SystemExit e o finally (a limpeza) roda (saída {r2.returncode})")


# ───────────────────────── a rodada no staging ─────────────────────────
class Rodada:
    def __init__(self, o, L, estado, rodada: str) -> None:
        self.o, self.L, self.e, self.rodada = o, L, estado, rodada
        self.s = B.schema()
        self.m = f"{B.MARCA} {rodada}"
        self.dia = hoje_sp()
        self.ta = L.token(B.A_CONTA)
        self.ua = L.uid(B.A_CONTA)
        self.pac = B.B17.matricula_da_aluna()
        self.tempos: dict[str, list[int]] = {}
        self.massa: dict = {"diario": None, "evolucao": None, "mensal": None}

    def chamar(self, token: str, itens: list[dict] | None, corpo: dict | None = None, rotulo: str = "ler") -> tuple[int, dict]:
        st, r, _h, ms = B.ler(token, itens, corpo=corpo)
        self.tempos.setdefault(rotulo, []).append(ms)
        return st, r

    def treino(self, token: str, corpo: dict | None = None, rotulo: str = "minha_evolucao") -> tuple[int, dict]:
        st, r, _h, ms = B.minha_evolucao(token, corpo)
        self.tempos.setdefault(rotulo, []).append(ms)
        return st, r

    def acao(self, token: str, acao: str, corpo: dict) -> tuple[int, dict]:
        st, r, _h, ms = B.B19.funcao(token, acao, corpo)
        self.tempos.setdefault(acao, []).append(ms)
        return st, r

    def acao_treino(self, token: str, action: str, corpo: dict) -> tuple[int, dict]:
        st, r, _h, ms = B.B19.funcao_treino(token, action, corpo)
        self.tempos.setdefault(action, []).append(ms)
        return st, r

    def um(self, sql: str):
        r = B.ler_principal(sql)
        return next(iter(r[0].values())) if r else None


# ───────────────────────── a massa (pelos caminhos que já existem) ─────────────────────────
def massa_diario(R: Rodada) -> None:
    """1 foto no diário da aluna, como o app faz (a imagem sintética; o comentário com a marca)."""
    o, s = R.o, R.s
    mat = B.ler_principal(f"select nutricionista_id::text as n, coalesce(link_codigo, '') as c from {s}.pacientes where id = {C.txt(R.pac)}")[0]
    nutri, codigo = C.uuid_ok(mat["n"]), str(mat["c"])
    png = B.png_sintetico()
    pedido = {"paciente_id": R.pac, "nutricionista_id": nutri, "tipo": "image/png", "tamanho": len(png)}
    st, link = R.acao(R.ta, "aluno_diario_preparar", pedido)
    caminho = str(link.get("caminho") or "")
    if not o.ok(st == 200 and link.get("bucket") == B.bucket_do_diario(s) and caminho.startswith(f"{nutri}/{R.pac}/") and link.get("token") and codigo,
                f"massa: o link do diário da aluna (a pasta da matrícula) ({st} {link.get('erro')})"):
        return
    R.e.objeto(link["bucket"], caminho)
    st_put = B.subir_no_link(link["bucket"], caminho, link["token"], png, "image/png", R.ta)
    st, r = R.acao(R.ta, "aluno_diario_enviar", {**pedido, "caminho": caminho, "codigo": codigo, "refeicao": "almoco",
                                                "comentario": f"{R.m} diario", "data_hora": agora()})
    reg = (r.get("registro") or {}).get("id")
    if C.eh_uuid(reg):
        R.e.linha("diario_alimentar", reg)
    if o.ok(st_put in (200, 201) and st == 200 and C.eh_uuid(reg), f"massa: 1 foto no diário da aluna (o PUT {st_put}; o registro {st} {r.get('erro')})"):
        R.massa["diario"] = {"id": reg, "path": caminho, "bytes": len(png), "nutri": nutri}
        R.e.d["diario_nutri"] = nutri
        R.e.salvar()


def massa_evolucao(R: Rodada) -> None:
    """1 foto de evolução da aluna, pela nutri (o jpeg sintético; a observação com a marca)."""
    o, s = R.o, R.s
    tp = R.L.token(B.P_CONTA)
    jpg = B.jpeg_sintetico()
    pedido = {"paciente_id": R.pac, "nome": f"{B.ARQUIVO_MARCA}-{R.rodada}.jpg", "tipo": "image/jpeg", "tamanho": len(jpg)}
    st, link = R.acao(tp, "foto_evolucao_preparar", pedido)
    caminho = str(link.get("caminho") or "")
    if not o.ok(st == 200 and link.get("bucket") == B.bucket_da_evolucao(s) and caminho and link.get("token"),
                f"massa: o link da foto de evolução (a nutri) ({st} {link.get('erro')})"):
        return
    R.e.objeto(link["bucket"], caminho)
    st_put = B.subir_no_link(link["bucket"], caminho, link["token"], jpg, "image/jpeg", tp)
    st, r = R.acao(tp, "foto_evolucao_registrar", {**pedido, "caminho": caminho, "posicao": "frente", "data": R.dia, "observacao": f"{R.m} foto"})
    linha = r.get("linha") or {}
    if C.eh_uuid(linha.get("id")):
        R.e.linha("fotos_evolucao", linha["id"])
    if o.ok(st_put in (200, 201) and st == 200 and C.eh_uuid(linha.get("id")), f"massa: 1 foto de evolução da aluna (o PUT {st_put}; o registro {st} {r.get('erro')})"):
        R.massa["evolucao"] = {"id": linha["id"], "path": caminho, "bytes": len(jpg)}


def massa_mensal(R: Rodada) -> None:
    """1 foto mensal da aluna no mês SENTINELA (a personal, no Treino) — antes, 0 foto daquele aluno/mês nos 2 schemas."""
    o, s, mes = R.o, R.s, B.MES_SENTINELA
    tt = R.L.token_treino(B.PERSONAL_CONTA)
    aluno = R.aluno_treino
    caminho = f"{aluno}/{mes}/frente.jpg"
    antes = {x: int(B.ler_treino(B.sql_contar_sentinela(x, aluno))[0]["n"]) for x in ("public", "staging")}
    if not o.ok(antes == {"public": 0, "staging": 0}, f"massa: 0 foto mensal da aluna no mês {mes} nos 2 schemas antes de subir ({antes})"):
        return
    st, link = R.acao_treino(tt, "foto_preparar", {"userId": aluno, "mes": mes, "tipo": "frente"})
    if not o.ok(st == 200 and link.get("caminho") == caminho and link.get("token"), f"massa: o link da foto mensal (a personal) ({st} {link.get('error')})"):
        return
    R.e.objeto(link["bucket"], caminho)
    st_put = B.subir_no_link_treino(link["bucket"], caminho, link["token"], B.jpeg_sintetico(tom=96), "image/jpeg", tt)
    st, r = R.acao_treino(tt, "foto_salvar", {"userId": aluno, "mes": mes, "tipo": "frente", "caminho": caminho})
    foto = (r.get("foto") or {}).get("id")
    if C.eh_uuid(foto):
        R.e.linha_treino("physiq_registros_fotos", foto)
    if o.ok(st_put in (200, 201) and st == 200 and C.eh_uuid(foto), f"massa: 1 foto mensal da aluna no mês sentinela (o PUT {st_put}; salvar {st})"):
        R.massa["mensal"] = {"id": foto, "path": caminho}


# ───────────────────────── os casos ─────────────────────────
def caso_p(R: Rodada) -> None:
    o, s = R.o, R.s
    d = R.massa["diario"]
    ev = R.massa["evolucao"]
    ids = [d["id"]] if d else [FALSO]
    st, r = R.chamar(R.ta, [B.item("aluno_dieta", dia=R.dia), B.item("aluno_evolucao"), B.item("aluno_diario_urls", ids=ids)])
    itens = r.get("itens") or [{}, {}, {}]
    o.ok(st == 200 and r.get("ok") is True and len(itens) == 3 and all(i.get("ok") for i in itens),
         f"P a aluna: 1 chamada `ler` com as 3 consultas → 200, os 3 itens ok ({st} {r.get('erro')})")
    # aluno_dieta = a minha_dieta(dia) como a aluna
    sql_dieta = B.ler_como(B.PRINCIPAL_REF, R.ua, f"select {s}.minha_dieta({C.txt(R.dia)}::date) as v")
    v_sql = sql_dieta[0]["v"] if sql_dieta else None
    v_fn = itens[0].get("valor")
    diario = v_fn.get("diario") if isinstance(v_fn, dict) else []
    o.ok(isinstance(v_fn, dict) and B_igual(v_fn, v_sql), f"P aluno_dieta = a minha_dieta(dia) rodada como a aluna (SQL só leitura): "
         f"{len((v_fn or {}).get('planos') or [])} plano(s), {len(diario or [])} registro(s) do diário — iguais")
    if d:
        o.ok(any(x.get("id") == d["id"] for x in diario or []), "P a foto da massa está no diário da dieta (os 7 dias)")
    # aluno_evolucao = a minha_evolucao() + a url
    sql_ev = B.ler_como(B.PRINCIPAL_REF, R.ua, f"select {s}.minha_evolucao() as v")
    v_ev = itens[1].get("valor")
    o.ok(isinstance(v_ev, dict) and B_igual(sem_url(v_ev), sql_ev[0]["v"] if sql_ev else None),
         f"P aluno_evolucao = a minha_evolucao() rodada como a aluna (+ a url de cada foto): {len((v_ev or {}).get('antropometrias') or [])} "
         f"antropometria(s), {len((v_ev or {}).get('fotos') or [])} foto(s) — iguais")
    if ev:
        foto = next((f for f in (v_ev or {}).get("fotos") or [] if f.get("id") == ev["id"]), None)
        url = B.url_da_tela(B.API_P, (foto or {}).get("url"))
        st_img, n, tipo = B.baixar(url) if url else (0, 0, "")
        o.ok(bool(url) and st_img == 200 and n == ev["bytes"] and "image/jpeg" in tipo,
             f"P a foto de evolução da massa: a URL do servidor (relativa, montada com o domínio do cliente) baixa a imagem ({st_img}, {n} B)")
    # aluno_diario_urls = id e path das linhas dela (como a aluna) + a url
    linhas = itens[2].get("linhas") or []
    sql_d = B.ler_como(B.PRINCIPAL_REF, R.ua, f"select id::text as id, path from {s}.diario_alimentar where id = any(array[{', '.join(C.txt(i) for i in ids)}]::uuid[]) "
                                             "and deleted_at is null order by id")
    o.ok(sorted((x.get("id"), x.get("path")) for x in linhas) == sorted((x["id"], x["path"]) for x in sql_d),
         f"P aluno_diario_urls = as linhas do diário que a aluna lê (SQL só leitura como ela): {len(linhas)} linha(s)")
    if d:
        url = B.url_da_tela(B.API_P, next((x.get("url") for x in linhas if x.get("id") == d["id"]), None))
        st_img, n, tipo = B.baixar(url) if url else (0, 0, "")
        o.ok(bool(url) and st_img == 200 and n == d["bytes"] and "image/png" in tipo, f"P a foto do diário da massa: a URL do servidor baixa a imagem ({st_img}, {n} B)")
    # Treino: a minha_evolucao = o perfil, as avaliações e as fotos da aluna (como ela)
    st, t = R.treino(R.tta)
    sub = R.aluno_treino
    perfil_sql = B.ler_como(B.TREINO_REF, sub, f"select id::text as id from {s}.physiq_profiles where id = {C.txt(sub)}")
    av_sql = B.ler_como(B.TREINO_REF, sub, f"select id::text as id from {s}.physiq_avaliacoes where user_id = {C.txt(sub)} "
                                           "order by data_avaliacao desc, id desc limit 200")
    fotos_sql = B.ler_como(B.TREINO_REF, sub, f"select id::text as id, storage_path from {s}.physiq_registros_fotos where user_id = {C.txt(sub)} "
                                              "order by mes_ref desc limit 200")
    av = t.get("avaliacoes") if isinstance(t.get("avaliacoes"), list) else []
    fotos = t.get("fotos") if isinstance(t.get("fotos"), list) else []
    o.ok(st == 200 and (t.get("perfil") or {}).get("id") == (perfil_sql[0]["id"] if perfil_sql else None)
         and [x.get("id") for x in av] == [x["id"] for x in reversed(av_sql)]
         and sorted(x.get("id") for x in fotos) == sorted(x["id"] for x in fotos_sql),
         f"P minha_evolucao (Treino) = o perfil, as {len(av)} avaliação(ões) (as mais novas, em ordem crescente) e as {len(fotos)} foto(s) da aluna "
         f"(SQL só leitura como ela) ({st} {t.get('error')})")
    colunas = set().union(*(x.keys() for x in av)) if av else set()
    o.ok("user_id" not in colunas and "created_by" not in colunas and ("perfil" not in t or "email" not in (t.get("perfil") or {})),
         "P as colunas fechadas: sem user_id/created_by nas avaliações; o perfil sem e-mail (só as 37)")
    mensal = R.massa["mensal"]
    if mensal:
        f = next((x for x in fotos if x.get("id") == mensal["id"]), None)
        url = B.url_da_tela(B.API_T, (f or {}).get("url"))
        st_img, n, tipo = B.baixar(url) if url else (0, 0, "")
        o.ok(bool(url) and st_img == 200 and n > 0 and "image/jpeg" in tipo, f"P a foto mensal da massa: a URL do servidor (Treino) baixa a imagem ({st_img}, {n} B)")


def jsonb(v: object) -> object:
    """O jsonb que o SQL devolve (objeto; se vier como texto, lido)."""
    if isinstance(v, str):
        try:
            return json.loads(v)
        except json.JSONDecodeError:
            return v
    return v


def B_igual(a: object, b: object) -> bool:
    a, b = jsonb(a), jsonb(b)
    return a is not None and b is not None and canonico(a) == canonico(b)


def caso_n1(R: Rodada) -> None:
    """Outra conta pede as 3 consultas (e os ids do diário da aluna): nada da aluna volta."""
    o = R.o
    tn = R.L.token(B.N1_CONTA)
    d = R.massa["diario"]
    proibidos = {R.pac, R.ua} | ({d["id"]} if d else set()) | ({R.massa["evolucao"]["id"]} if R.massa["evolucao"] else set())
    st, r = R.chamar(tn, [B.item("aluno_dieta", dia=R.dia), B.item("aluno_evolucao"), B.item("aluno_diario_urls", ids=[d["id"]] if d else [FALSO])])
    itens = r.get("itens") or []
    vazou = proibidos & ids_de(r)
    o.ok(st == 200 and len(itens) == 3 and all(i.get("ok") for i in itens) and not (itens[2].get("linhas") or []) and not vazou,
         f"N1 outra conta (w13-dono): 200 com o que é DELA — o diário da aluna volta vazio e nenhum id da aluna na resposta ({st}, {len(vazou)} id da aluna)")


def caso_n2_n3_n6_n7_n9(R: Rodada, casos: list[str]) -> None:
    o = R.o
    if "N2" in casos:
        st, _r, _h, _ms = B.ler(None, [B.item("aluno_evolucao")], sem_auth=True)
        st2, r2, _h2, _ms2 = B.minha_evolucao(None, sem_auth=True)
        o.ok(st == 401 and st2 == 401 and r2.get("error") == "missing_auth", f"N2 sem login → 401 nas 2 funções ({st}, {st2} {r2.get('error')})")
    if "N3" in casos:
        st, r = R.chamar(R.ta, [B.item("aluno_dieta", dia=R.dia), B.item("aluno_tudo"), B.item("prontuario_inteiro")])
        itens = r.get("itens") or [{}, {}, {}]
        o.ok(st == 200 and itens[0].get("ok") and [i.get("erro") for i in itens[1:]] == ["consulta_invalida", "consulta_invalida"],
             f"N3 q desconhecida → o item volta consulta_invalida e o outro responde ({st})")
        st, r, _h, _ms = B.B19.funcao(R.ta, "ler_tudo", {"itens": [B.item("aluno_dieta", dia=R.dia)]})
        o.ok(st == 400 and r.get("erro") == "acao_invalida", f"N3 a ação desconhecida da função → 400 acao_invalida ({st})")
    if "N6" in casos:
        st, r, _h, _ms = B.ler(R.ta, [B.item("aluno_evolucao")], schema_="producao")
        st2, r2, _h2, _ms2 = B.minha_evolucao(R.tta, schema_="producao")
        st3, r3, _h3, _ms3 = B.minha_evolucao(None, schema_="", sem_auth=True)
        o.ok(st == 400 and r.get("erro") == "schema_invalido" and st2 == 400 and r2.get("error") == "schema_invalido" and st3 == 400,
             f"N6 x-schema inválido → 400 schema_invalido nas 2 (na minha_evolucao, antes do login) ({st}, {st2}, {st3})")
    if "N7" in casos:
        st1, h1 = B.preflight(B.ORIGEM_FORA)
        st2, h2 = B.preflight_treino(B.ORIGEM_FORA)
        o.ok(st1 in (200, 204) and B.cors(h1) == B.ORIGEM_PADRAO and st2 in (200, 204) and B.cors(h2) == B.ORIGEM_PADRAO_TREINO,
             f"N7 origem fora da lista → o CORS padrão de cada função ({st1}, {st2})")
    if "N9" in casos:
        st, r = R.chamar(R.ta, [B.item("aluno_evolucao")] * 17)
        o.ok(st == 400 and r.get("erro") == "lote_grande", f"N9 lote de 17 → 400 lote_grande ({st} {r.get('erro')})")
        st, r = R.chamar(R.ta, [B.item("aluno_evolucao")] * 16)
        o.ok(st == 200 and len(r.get("itens") or []) == 16, f"N9 controle: 16 itens iguais → 200 com 16 respostas ({st})")


def caso_n4_n5_n8(R: Rodada, casos: list[str]) -> None:
    """O dono/aluno/colunas/caminho do corpo caem: a resposta é a MESMA de antes; e o caminho que não é da consulta não é assinado."""
    o = R.o
    d = R.massa["diario"]
    ids = [d["id"]] if d else [FALSO]
    st0, base = R.chamar(R.ta, [B.item("aluno_evolucao"), B.item("aluno_dieta", dia=R.dia), B.item("aluno_diario_urls", ids=ids)])
    st, r = R.chamar(R.ta, [B.item("aluno_evolucao", user_id=OUTRO, nutricionista_id=OUTRO, paciente_id=OUTRO, aluno=OUTRO),
                            B.item("aluno_dieta", dia=R.dia, p_dia="1999-01-01", select="*", colunas="*"),
                            B.item("aluno_diario_urls", ids=ids + [OUTRO], path=f"{OUTRO}/x/y.png", caminhos=[f"{OUTRO}/x/y.png"], select="*")],
                     corpo={"user_id": OUTRO, "nutricionista_id": OUTRO})
    b_itens, r_itens = base.get("itens") or [], r.get("itens") or []
    if "N4" in casos or "N5" in casos:
        o.ok(st0 == 200 and st == 200 and len(r_itens) == 3 and B_igual(sem_url(r_itens[0].get("valor")), sem_url(b_itens[0].get("valor")))
             and B_igual(r_itens[1].get("valor"), b_itens[1].get("valor")),
             f"N4/N5 dono, aluno, p_dia, select e colunas no corpo → ignorados (a resposta é a mesma de quem chama) ({st0}, {st})")
        st1, t1 = R.treino(R.tta)
        st2, t2 = R.treino(R.tta, {"userId": OUTRO, "user_id": OUTRO, "aluno": OUTRO, "colunas": "*"})
        o.ok(st1 == 200 and st2 == 200 and B_igual(sem_url(t1, "fotos"), sem_url(t2, "fotos")),
             f"N4/N5 no Treino: userId/user_id/aluno/colunas no corpo → ignorados (o dono é o sub) ({st1}, {st2})")
    if "N8" in casos:
        linhas = (r_itens[2].get("linhas") if len(r_itens) > 2 else None) or []
        o.ok({x.get("id") for x in linhas} <= set(ids) and f"{OUTRO}/x/y.png" not in json.dumps(r)
             and all(x.get("path") != f"{OUTRO}/x/y.png" for x in linhas),
             f"N8 o caminho no corpo não é assinado e o id que não é dela não volta ({len(linhas)} linha(s), só as da consulta)")
        st, r3 = R.treino(R.tta, {"caminho": f"{OUTRO}/2000-01/frente.jpg", "storage_path": f"{OUTRO}/2000-01/frente.jpg"})
        o.ok(st == 200 and OUTRO not in json.dumps(r3), f"N8 no Treino: o caminho de outro aluno no corpo não é assinado ({st})")


def caso_n10(R: Rodada) -> None:
    """A minha_evolucao de cada um: a aluna → só a dela (o sub); a personal → só o próprio (vazio)."""
    o = R.o
    st, t = R.treino(R.tta)
    o.ok(st == 200 and (t.get("perfil") or {}).get("id") in (R.aluno_treino, None), f"N10 a aluna → só a dela: o perfil é o do sub ({st})")
    tp = R.L.token_treino(B.PERSONAL_CONTA)
    up = R.L.uid_treino(B.PERSONAL_CONTA)
    st, t = R.treino(tp)
    ids = ids_de(t)
    o.ok(st == 200 and (t.get("perfil") or {}).get("id") in (up, None) and not (t.get("avaliacoes") or []) and not (t.get("fotos") or [])
         and R.aluno_treino not in ids,
         f"N10 a personal (qualquer papel) → só o próprio: o perfil dela, 0 avaliação e 0 foto — nada da aluna ({st} {t.get('error')})")


# ───────────────────────── a limpeza ─────────────────────────
def limpar(o, estado, L, s: str) -> None:
    """Desfaz a massa da rodada e confere por SQL só leitura (só contagem): a foto mensal pela função (a personal) — ou por SQL só do
    aluno de teste no mês sentinela —; a foto de evolução e a do diário pela nutri (diario_excluir/foto_evolucao_excluir: a linha e o
    arquivo); o DELETE das linhas da rodada (staging, só os ids) e os arquivos que sobrarem pelo Storage como a nutri dona da pasta."""
    if estado.vazio():
        o.ok(True, "limpeza: nada pendente no estado")
        estado.apagar()
        return
    if (estado.d.get("area") or AREA) != AREA:
        o.ok(False, f"a rodada pendente é de outra área ({estado.d.get('area')}): rode o --limpar dela", parar=True)
    aluno = estado.d.get("aluno_treino") or ""
    pac = estado.d.get("pac") or ""
    if estado.d.get("treino"):
        tt = L.token_treino(B.PERSONAL_CONTA)
        for _t, id_ in list(estado.d.get("treino") or []):
            st, _r, _h, _ms = B.B19.funcao_treino(tt, "foto_excluir", {"fotoId": id_})
            if st != 200 and C.eh_uuid(aluno):
                C.C2.sql_mgmt(B.TREINO_REF, B.sql_apagar_fotos_treino(s, aluno, [id_]))
        estado.d["treino"] = []
        estado.salvar()
    registros = [c for b, c in estado.d["storage"] if b.startswith("registros")]
    if registros:
        st, n = B.remover_do_storage_treino(B.bucket_dos_registros(s), registros, L.token_treino(B.PERSONAL_CONTA))
        o.ok(st == 200, f"limpeza: {len(registros)} arquivo(s) da foto mensal pelo Storage do Treino (a personal) ({st}, {n})")
    tp = L.token(B.P_CONTA)
    por: dict[str, list[str]] = {}
    for tabela, id_ in estado.d["linhas"]:
        por.setdefault(tabela, []).append(id_)
    for id_ in por.get("fotos_evolucao", []):
        B.B19.funcao(tp, "foto_evolucao_excluir", {"id": id_})
    for id_ in por.get("diario_alimentar", []):
        B.B19.funcao(tp, "diario_excluir", {"id": id_})
    principal = [c for b, c in estado.d["storage"] if not b.startswith("registros")]
    if principal:
        for bucket in sorted({b for b, _c in estado.d["storage"] if not b.startswith("registros")}):
            caminhos = [c for b, c in estado.d["storage"] if b == bucket]
            st, n = B.remover_do_storage(bucket, caminhos, tp)
            o.ok(st == 200, f"limpeza: {len(caminhos)} arquivo(s) do {bucket} como a nutri dona da pasta ({st}, {n})")
    estado.d["storage_rodada"] = estado.d["storage"]
    estado.d["storage"] = []
    estado.salvar()
    dono = L.uid(B.P_CONTA)
    if por.get("fotos_evolucao"):
        C.C2.sql_principal(B.sql_apagar_fotos_evolucao(s, dono, por["fotos_evolucao"]))
    if por.get("diario_alimentar") and C.eh_uuid(pac):
        C.C2.sql_principal(B.sql_apagar_diario(s, pac, por["diario_alimentar"]))
    rodada = estado.d.get("rodada")
    sobra = B.ler_principal(B.sql_contar_marca(s, rodada))[0] if rodada else {}
    o.ok(rodada and not any(sobra.values()), f"limpeza conferida (SQL só leitura): 0 linha com a marca da rodada no diário e nas fotos de evolução ({sobra})")
    todos = [c for b, c in estado.d.get("storage_rodada") or [] if not b.startswith("registros")]
    objs = B.ler_principal(B.sql_contar_objetos(s, rodada, todos))[0]["n"]
    o.ok(objs == 0, f"limpeza conferida: 0 arquivo da rodada nos buckets do diário e da evolução ({objs})")
    if C.eh_uuid(aluno):
        sent = {x: int(B.ler_treino(B.sql_contar_sentinela(x, aluno))[0]["n"]) for x in ("public", "staging")}
        objs_t = B.ler_treino(f"select count(*)::int as n from storage.objects where bucket_id = {C.txt(B.bucket_dos_registros(s))} "
                              f"and name like {C.txt(aluno + '/' + B.MES_SENTINELA + '/%')}")[0]["n"]
        o.ok(sent == {"public": 0, "staging": 0} and objs_t == 0, f"limpeza conferida: 0 foto mensal no mês sentinela (2 schemas) e 0 arquivo ({sent}, {objs_t})")
    estado.apagar()


# ───────────────────────── só leitura (produção e o smoke depois de publicar) ─────────────────────────
def so_leitura(o, L, base: str) -> None:
    """Nada grava e nada lê dado de saúde: o CORS, o 401, o 400 de schema (antes do banco) e a q desconhecida (o `ler` sem banco)."""
    st1, h1 = B.preflight(B.ORIGEM_FORA)
    st2, h2 = B.preflight_treino(B.ORIGEM_FORA)
    o.ok(st1 in (200, 204) and B.cors(h1) == B.ORIGEM_PADRAO and st2 in (200, 204) and B.cors(h2) == B.ORIGEM_PADRAO_TREINO,
         f"{base} N7: origem fora da lista → o CORS padrão das 2 funções ({st1}, {st2})")
    st, _r, _h, _ms = B.ler(None, [B.item("aluno_evolucao")], sem_auth=True, origem=B.BASES[base])
    st2, r2, _h2, _ms2 = B.minha_evolucao(None, sem_auth=True, origem=B.BASES[base])
    o.ok(st == 401 and st2 == 401, f"{base} N2: sem login → 401 no `ler` e na minha_evolucao ({st}, {st2} {r2.get('error')})")
    st2, r2, _h2, _ms2 = B.minha_evolucao(None, schema_="producao", sem_auth=True, origem=B.BASES[base])
    o.ok(st2 == 400 and r2.get("error") == "schema_invalido", f"{base} N6: a minha_evolucao com x-schema inválido → 400 antes do login ({st2})")
    token = L.token(B.PROD_CONTA if base == "prod" else B.P_CONTA)
    st, r, _h, _ms = B.ler(token, [B.item("aluno_tudo")], schema_="producao", origem=B.BASES[base])
    o.ok(st == 400 and r.get("erro") == "schema_invalido", f"{base} N6: o `ler` com x-schema inválido → 400 ({st})")
    st, r, _h, ms = B.ler(token, [B.item("aluno_tudo"), B.item("prontuario_inteiro")], origem=B.BASES[base])
    itens = r.get("itens") or []
    o.ok(st == 200 and [i.get("erro") for i in itens] == ["consulta_invalida", "consulta_invalida"],
         f"{base} N3: a ação `ler` está no ar — a q desconhecida → consulta_invalida em cada item, sem banco ({st}, {ms} ms)")
    st, r, _h, _ms = B.ler(token, [B.item("aluno_tudo")] * 17, origem=B.BASES[base])
    o.ok(st == 400 and r.get("erro") == "lote_grande", f"{base} N9: 17 itens → 400 lote_grande ({st})")


# ───────────────────────── a execução ─────────────────────────
def modo_da_execucao(base: str, so_leit: bool, limpar_: bool) -> str:
    if base == "prod" and not so_leit:
        raise SystemExit("produção: só --so-leitura (nada grava, nada de massa)")
    return "so_leitura" if so_leit else "limpar" if limpar_ else "rodada"


def rodar(o, L, estado, rodada: str, casos: list[str]) -> None:
    R = Rodada(o, L, estado, rodada)
    R.tta = L.token_treino(B.A_CONTA)
    R.aluno_treino = L.uid_treino(B.A_CONTA)
    o.ok(C.eh_uuid(R.aluno_treino), f"a aluna tem a sessão do Treino pela troca do app ({R.aluno_treino[:8]}…)", parar=True)
    estado.d.update({"aluno_treino": R.aluno_treino, "pac": R.pac})
    estado.salvar()
    o.linha(f"rodada {rodada} · schema {R.s} · área aluno (20a) · dia {R.dia} · casos {','.join(casos)}")
    if {"P", "N1", "N8"} & set(casos):
        massa_diario(R)
        massa_evolucao(R)
        massa_mensal(R)
    if "P" in casos:
        caso_p(R)
    if "N1" in casos:
        caso_n1(R)
    if {"N4", "N5", "N8"} & set(casos):
        caso_n4_n5_n8(R, casos)
    if "N10" in casos:
        caso_n10(R)
    if {"N2", "N3", "N6", "N7", "N9"} & set(casos):
        caso_n2_n3_n6_n7_n9(R, casos)
    tempos = {k: f"{min(v)}–{max(v)} ms (n={len(v)})" for k, v in sorted(R.tempos.items())}
    o.linha(f"tempos: {tempos}")


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-20a — E2E de servidor das leituras do app do aluno (a `ler` da nutricao e a minha_evolucao do Treino)")
    ap.add_argument("--area", default="aluno", choices=("aluno",))
    ap.add_argument("--base", default="staging", choices=("local", "staging", "prod"))
    ap.add_argument("--casos", default=None, help="padrão: todos (" + ",".join(CASOS) + ")")
    modo = ap.add_mutually_exclusive_group()
    modo.add_argument("--seco", action="store_true")
    modo.add_argument("--limpar", action="store_true")
    modo.add_argument("--so-leitura", action="store_true")
    modo.add_argument("--sair", action="store_true")
    a = ap.parse_args()
    B.corte_vira_saida()  # o SIGTERM/SIGINT vira SystemExit: o finally da limpeza roda mesmo com o processo cortado
    casos = [c.strip() for c in (a.casos or ",".join(CASOS)).split(",") if c.strip()]
    if any(c not in CASOS for c in casos):
        raise SystemExit(f"caso desconhecido (os casos: {', '.join(CASOS)})")
    if a.seco:
        o = C.Saida(f"api20_{a.area}_seco")
        seco(o)
        return o.fim()  # o --seco não vai ao e2e-rodadas (não é prova contra uma base)
    if a.sair:
        o = C.Saida("api20_sessoes_sair")
        B.Sessoes("sair").sair(o)
        return o.fim()
    modo_exec = modo_da_execucao(a.base, a.so_leitura, a.limpar)
    s = B.usar_base(a.base)
    o = C.Saida(f"api20_{a.area}_{a.base}" + {"limpar": "_limpar", "so_leitura": "_so_leitura"}.get(modo_exec, ""))
    L = B.Sessoes(f"api20 {a.area}" + {"limpar": " --limpar", "so_leitura": " --so-leitura"}.get(modo_exec, "") + f" {a.base}")
    try:
        B.exigir_saude(o, "o api.py da hml-20")
        if modo_exec == "so_leitura":
            so_leitura(o, L, a.base if a.base != "local" else "staging")
        elif modo_exec == "limpar":
            limpar(o, B.Estado.ler(), L, s)
        else:
            pendente = B.Estado.ler()
            if not pendente.vazio():
                o.ok(False, f"há uma rodada que caiu no meio (área {pendente.d.get('area') or 'prontuario'}): rode o --limpar antes", parar=True)
            rodada = B.nova_rodada()
            estado = B.Estado({"rodada": rodada, "schema": s, "area": AREA, "linhas": [], "storage": [], "n8": None})
            estado.salvar()
            try:
                rodar(o, L, estado, rodada, casos)
            finally:
                limpar(o, estado, L, s)
    except (Exception, SystemExit) as e:  # noqa: BLE001
        o.ok(False, f"parou no meio: {type(e).__name__}: {str(e)[:300]}")
    finally:
        L.fechar(o)
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
