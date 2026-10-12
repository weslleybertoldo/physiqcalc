"""Physiq hml-20b (H-42 · jeito 2, etapa 2, 12/10/2026) — os casos de SERVIDOR do Painel › Aluno (`api.py --area painel-aluno`): a ação
`ler` da nutricao com as 27 consultas da 20b (a casca, o Resumo, o Prontuário ×10, a Avaliação e o PDF).

Contas (staging, só de TESTE): P = w5p-nutri (a nutri da aluna: tudo); w5p-personal (a personal da aluna: o perfil, a série e as anotações
da equipe — o Resumo e a Avaliação do lado dela); N1 = w13-dono (OUTRA conta). No máximo 6 logins na etapa 2 (o registro:
hml20/agente/logins_etapa2_20b.txt). A massa (decisão G): 1 anexo de imagem e 1 foto de evolução da aluna pela nutri (painel.py), só no
staging, com a marca "hml20 e2e <rodada>"; o --limpar desfaz e confere por SQL só leitura (só contagem).
  P   cada consulta com a conta certa = as MESMAS linhas/valor que o SQL só leitura rodado COMO A PESSOA (o papel authenticated + o sub,
      igual ao PostgREST), montado do catálogo do SERVIDOR (as colunas, os filtros, o dono, as vivas, a ordem, a página): o mesmo conjunto
      e na ordem do catálogo; a página dos pedidos com o total = o count; a URL do servidor (montada com o domínio do cliente, como a tela)
      baixa o arquivo da massa — o anexo com o prazo de hoje (60 s baixar com o nome, 120 s ver) e a foto de evolução com 1 h
  N1  outra conta (w13-dono) pede as consultas do aluno com os ids da aluna → listas vazias / sem_acesso / nao_encontrado, NUNCA uma
      linha da aluna
  N2  sem login → 401 · N3 q desconhecida → o item consulta_invalida (os outros respondem)
  N4  nutricionista_id/user_id/id de OUTRA pessoa no corpo de uma consulta "minha" (o profissional) e das listas da conta → ignorados
  N5  param/coluna fora da lista (select, colunas, order, p_aluno) → ignorados (a resposta é a mesma)
  N6  x-schema inválido → 400 schema_invalido · N7 origem fora da lista → o CORS padrão
  N8  o caminho/nome no corpo do anexo_url e da série → não vira assinatura: o servidor assina SÓ o caminho que a própria consulta leu
  N9  lote de 17 → 400 lote_grande (16 → 200)
--so-leitura (o smoke da sessão principal logo depois de publicar, 1 login por base): o CORS, o 401, o 400 de schema, a q desconhecida →
consulta_invalida e CADA consulta da 20b que tem param obrigatório, sem ele → dados_invalidos (prova que o catálogo da 20b está no ar,
sem ir ao banco); nada lê dado de saúde.
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

import _base as B
import painel as P

C = B.C
CASOS = ("P", "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9")
FALSO = "00000000-0000-4000-8000-0000000000aa"
OUTRO = "44444444-4444-4444-8444-444444444444"


def hoje_sp() -> str:
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date().isoformat()


def canonico(v: object) -> str:
    return json.dumps(v, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def jsonb(v: object) -> object:
    if isinstance(v, str):
        try:
            return json.loads(v)
        except json.JSONDecodeError:
            return v
    return v


def igual(a: object, b: object) -> bool:
    a, b = jsonb(a), jsonb(b)
    return a is not None and b is not None and canonico(a) == canonico(b)


# o que muda a cada chamada (a aluno_perfil devolve o `agora`, o now() do banco): fora da comparação do P
VOLATEIS = ("agora",)


def sem_volateis(valor: object) -> object:
    v = jsonb(valor)
    return {k: x for k, x in v.items() if k not in VOLATEIS} if isinstance(v, dict) else v


def sem_url(valor: object, lista: str = "fotos") -> object:
    if isinstance(valor, dict) and isinstance(valor.get(lista), list):
        return {**valor, lista: [{k: v for k, v in f.items() if k != "url"} if isinstance(f, dict) else f for f in valor[lista]]}
    return valor


def ids_de(valor: object) -> set[str]:
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
def itens_do_p(pac: str, anexo: str, antropo: str) -> list[dict]:
    """Um item de CADA consulta da 20b, com os params da tela (o P manda estes; o --seco passa todos no lerPedidoDeLeitura do servidor)."""
    i = B.item
    return [
        i("aluno_perfil", aluno=pac), i("aluno_evolucao_painel", aluno=pac), i("profissional"), i("anotacoes", aluno=pac, limite=3),
        i("anotacoes", aluno=pac, limite=20, offset=0), i("anotacoes_todas", aluno=pac),
        *[i(q, aluno=pac) for q in P.LISTAS_DO_ALUNO], *[i(q) for q in P.LISTAS_DA_CONTA],
        i("pedidos_exame_do_aluno", aluno=pac, pagina=1), i("exames_do_aluno", aluno=pac, offset=0, limite=20),
        i("resultados_exame_do_aluno", aluno=pac), i("anexo_url", id=anexo, download=True), i("anexo_url", id=anexo, download=False),
        i("antropometria", id=antropo), i("antropometrias_pdf", paciente=pac),
    ]


def pedidos_painel(pac: str, anexo: str, antropo: str) -> list[dict]:
    """Os corpos `ler` da rodada (P em lotes de até 16 e os N): o --seco passa cada um pelo lerPedidoDeLeitura do servidor."""
    p = itens_do_p(pac, anexo, antropo)
    i = B.item
    return [
        {"acao": "ler", "itens": p[:16]}, {"acao": "ler", "itens": p[16:]},
        # N3: a q desconhecida no meio
        {"acao": "ler", "itens": [i("aluno_perfil", aluno=pac), i("prontuario_inteiro"), i("anexos_de_todos")]},
        # N4/N5/N8: o dono, as colunas, a ordem, o caminho e o nome no corpo — tudo cai
        {"acao": "ler", "itens": [i("profissional", id=OUTRO, user_id=OUTRO, nutricionista_id=OUTRO),
                                  i("anexos_do_aluno", aluno=pac, select="*", colunas="*", order="id", nutricionista_id=OUTRO),
                                  i("anexo_url", id=anexo, download=True, path=f"{OUTRO}/x/y.png", caminho=f"{OUTRO}/x/y.png", nome="outro.png"),
                                  i("aluno_evolucao_painel", aluno=pac, caminhos=[f"{OUTRO}/x/y.jpg"], p_aluno=OUTRO)]},
        # o param fora da forma (uuid ruim, página 0, limite fora da faixa, texto acima do teto, booleano em texto)
        {"acao": "ler", "itens": [i("consultas_do_aluno", aluno="abc"), i("pedidos_exame_do_aluno", aluno=pac, pagina=0),
                                  i("anotacoes", aluno=pac, limite=501), i("exames_do_aluno", aluno=pac, exame="x" * 501, offset=0, limite=20),
                                  i("anexo_url", id=anexo, download="sim")]},
        # N9: 17 itens
        {"acao": "ler", "itens": [i("profissional")] * 17},
    ]


# ───────────────────────── o --seco ─────────────────────────
def seco(o) -> None:
    pac, anexo, antropo = "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"
    pedidos = pedidos_painel(pac, anexo, antropo)
    r = B.regras_leitura(pedidos, [], [{"code": "P0001", "message": "sem_acesso"}, {"code": "P0001", "message": "aluno_inexistente"},
                                       {"code": "P0001", "message": "outra coisa"}, {"code": "42501"}])
    consultas = r["consultas"]
    o.ok(set(P.CONSULTAS_20B) <= set(consultas) and len(P.CONSULTAS_20B) == 27,
         f"o catálogo do servidor (lido do TS) tem as 27 consultas da 20b ({len(consultas)} no total, com as 3 da 20a)")
    o.ok(set(P.LISTAS_DO_ALUNO) | set(P.LISTAS_DA_CONTA) | {"profissional"} <= set(consultas)
         and all(consultas[q]["tabela"] and consultas[q]["filtros"] == [{"param": "aluno", "coluna": "paciente_id", "op": "eq"}] and consultas[q]["vivas"]
                 for q in P.LISTAS_DO_ALUNO)
         and all(consultas[q]["tabela"] and not consultas[q]["filtros"] and not consultas[q]["dono"] for q in P.LISTAS_DA_CONTA),
         "as listas do aluno: paciente_id = o aluno do corpo + as vivas; as da conta: sem filtro nem dono (o RLS decide)")
    o.ok([q for q in P.CONSULTAS_20B if consultas[q]["dono"]] == ["profissional"] and consultas["profissional"]["dono"] == "id",
         "'minha' só o profissional (o id = quem chama)")
    rpcs = {consultas[q]["rpc"] for q in P.CONSULTAS_20B if consultas[q]["rpc"]}
    o.ok(rpcs == P.RPCS_DA_AREA and B.AREAS["painel-aluno"]["rpcs"] == P.RPCS_DA_AREA,
         f"a guarda que conta (leitura direta da área) tem as MESMAS RPCs que o catálogo da 20b leva ao servidor ({sorted(rpcs)})")
    tabelas = {consultas[q]["tabela"] for q in P.CONSULTAS_20B if consultas[q]["tabela"]}
    o.ok(tabelas <= P.TABELAS_DA_AREA and tabelas | {"fotos_evolucao"} == P.TABELAS_DA_AREA,
         f"as tabelas da área = as do catálogo da 20b + fotos_evolucao (a leitura morta que saiu) ({len(tabelas)} + 1)")
    o.ok(r["buckets_todos"].get("anexos:staging") == "anexos-staging" == B.B19.bucket_dos_anexos("staging")
         and r["buckets_todos"].get("evolucao:staging") == B.bucket_da_evolucao("staging") and {"anexos", "anexos-staging", "evolucao", "evolucao-staging"} == P.BUCKETS_DA_AREA,
         "os buckets da leitura do servidor = os da massa e os da guarda (anexos e evolucao, + -staging)")
    o.ok([e["erro"] for e in r["erros_rota"]] == ["sem_acesso", "aluno_inexistente", "erro_interno", "sem_acesso"]
         and [e["erro"] for e in r["erros"]][:2] == ["erro_interno", "erro_interno"],
         "os códigos de propósito da w14_matricula_da_rota voltam como eles (sem eles, a tabela de sempre: erro_interno)")
    p1, p2, p_n3, p_n458, p_ruim, p_n9 = r["pedidos"]
    o.ok(p1["ok"] and p2["ok"] and all(i["ok"] for i in p1["itens"] + p2["itens"]) and len(p1["itens"]) + len(p2["itens"]) == len(itens_do_p(pac, anexo, antropo)),
         f"P: os {len(p1['itens']) + len(p2['itens'])} itens (um de cada consulta, com os params da tela) passam no lerPedidoDeLeitura do servidor")
    o.ok(p_n3["ok"] and p_n3["itens"][0]["ok"] and [i.get("erro") for i in p_n3["itens"][1:]] == ["consulta_invalida", "consulta_invalida"],
         "N3 no servidor: a q desconhecida → só aquele item volta consulta_invalida")
    i4 = p_n458["itens"]
    o.ok(p_n458["ok"] and all(i["ok"] for i in i4) and i4[0]["params"] == {} and i4[1]["params"] == {"aluno": pac}
         and i4[2]["params"] == {"id": anexo, "download": True} and i4[3]["params"] == {"aluno": pac},
         "N4/N5/N8 no servidor: o dono, as colunas, a ordem, o caminho, o nome e o p_aluno do corpo caem (só os params declarados)")
    o.ok(p_ruim["ok"] and [i.get("erro") for i in p_ruim["itens"]] == ["dados_invalidos"] * 5,
         "o param fora da forma (uuid ruim, página 0, limite 501, texto 501, booleano em texto) → dados_invalidos naquele item")
    o.ok(p_n9 == {"ok": False, "erro": "lote_grande"}, "N9 no servidor: 17 itens → lote_grande (o pedido inteiro)")
    so = B.regras_leitura([{"acao": "ler", "itens": [B.item(q) for q in P.COM_PARAM_OBRIGATORIO[:16]]},
                           {"acao": "ler", "itens": [B.item(q) for q in P.COM_PARAM_OBRIGATORIO[16:]]}])["pedidos"]
    o.ok(all(p["ok"] for p in so) and all(i.get("erro") == "dados_invalidos" for p in so for i in p["itens"]) and len(P.COM_PARAM_OBRIGATORIO) == 21,
         f"--so-leitura: as {len(P.COM_PARAM_OBRIGATORIO)} consultas da 20b com param obrigatório, sem ele → dados_invalidos (no ar, sem banco)")
    # o P "como a pessoa": o SQL do catálogo (só leitura) — as colunas fechadas, o filtro, as vivas, a ordem e o rank
    c = consultas["anexos_do_aluno"]
    sql = P.sql_da_tabela("staging", c, {"aluno": pac}, OUTRO)
    o.ok(sql.startswith("select coalesce(jsonb_agg(") and "from staging.anexos where paciente_id = '" in sql and "deleted_at is null" in sql
         and "order by created_at desc limit 1000" in sql and "dense_rank()" in sql and "*" not in sql,
         "o SQL do P de uma lista do aluno: as colunas do catálogo (nenhum *), o paciente, as vivas, a ordem e o teto (com o rank da ordem)")
    sql = P.sql_da_tabela("staging", consultas["profissional"], {}, OUTRO)
    o.ok(f"from staging.profiles where id = '{OUTRO}'" in sql and "limit 1" in sql, "o SQL do profissional: o dono = quem chama (o id)")
    sql = P.sql_da_tabela("staging", consultas["pedidos_exame_do_aluno"], {"aluno": pac, "pagina": 3}, OUTRO)
    o.ok("order by data desc, created_at desc, id desc offset 40 limit 20" in sql, "o SQL da página dos pedidos: a 3ª página de 20 (offset 40)")
    o.ok("limit 50000" in P.sql_da_tabela("staging", consultas["resultados_exame_do_aluno"], {"aluno": pac}, OUTRO), "o SQL dos resultados: o laço inteiro (1000 × 50)")
    sql = P.sql_da_tabela("staging", consultas["antropometria"], {"id": antropo}, OUTRO)
    o.ok("where id = '" in sql and "deleted_at is null" not in sql and "limit 1" in sql, "o SQL do Editar: pelo id, SEM o filtro da Lixeira (como a tela lia)")
    sql = P.sql_da_rpc("staging", consultas["anotacoes"], {"aluno": pac, "limite": 20, "offset": 0})
    o.ok(sql == f"select to_jsonb(staging.aluno_anotacoes(p_aluno => '{pac}', p_limite => 20, p_offset => 0)) as v", "o SQL da RPC: os args nomeados do catálogo")
    o.ok(P.sql_da_rpc("staging", consultas["anotacoes_todas"], {"aluno": pac}) == f"select to_jsonb(staging.aluno_anotacoes(p_aluno => '{pac}')) as v",
         "o SQL das anotações todas: só o p_aluno (o padrão null da RPC)")
    ok, _msg = P.mesmas_linhas([{"id": 2}, {"id": 1}, {"id": 3}], [{"r": 1, "linha": {"id": 1}}, {"r": 1, "linha": {"id": 2}}, {"r": 2, "linha": {"id": 3}}])
    ruim, _m = P.mesmas_linhas([{"id": 3}, {"id": 1}, {"id": 2}], [{"r": 1, "linha": {"id": 1}}, {"r": 1, "linha": {"id": 2}}, {"r": 2, "linha": {"id": 3}}])
    falta, _m2 = P.mesmas_linhas([{"id": 1}], [{"r": 1, "linha": {"id": 1}}, {"r": 2, "linha": {"id": 3}}])
    o.ok(ok and not ruim and not falta, "o comparador do P: o mesmo conjunto, na ordem do catálogo (o empate na ordem não conta); fora da ordem ou faltando → falha")
    o.ok(igual(sem_volateis({"ok": True, "agora": "2026-10-12T06:00:00Z", "nome": "x"}), sem_volateis('{"ok": true, "agora": "2026-10-12T06:00:01Z", "nome": "x"}'))
         and not igual(sem_volateis({"nome": "x"}), sem_volateis({"nome": "y"})), "o P da RPC ignora só o `agora` (o now() da aluno_perfil); o resto tem de ser igual")
    # a URL: o prazo e o caminho do token (sem imprimir o token)
    tok = P.jwt_falso({"url": "anexos-staging/a/b.png", "iat": 100, "exp": 160})
    url = f"https://api-principal.physiqcalc.com.br/storage/v1/object/sign/anexos-staging/a/b.png?token={tok}&download=Laudo%20final.png"
    o.ok(P.prazo_da_url(url) == 60 and P.caminho_da_url(url) == "anexos-staging/a/b.png" and P.download_da_url(url) == "Laudo final.png"
         and P.download_da_url(url.split("&")[0]) is None and P.prazo_da_url("https://x/y") is None,
         "a URL assinada: o prazo (exp − iat), o caminho assinado (a claim url) e o nome do baixar, lidos do token")
    # a massa e a limpeza
    pedido = P.pedido_de_anexo("seco-0000", pac, 99)
    o.ok(pedido["tipo"] == "image/png" and pedido["nome"].startswith("hml20-e2e-painel-seco-0000") and B.B19.regras([("anexo_preparar", pedido)], OUTRO)["conferidos"][0].get("ok"),
         "a massa: o anexo de imagem (png) com a marca no nome passa nas regras do servidor (anexo_preparar)")
    sqls = [P.sql_apagar("staging", "anexos", OUTRO, [FALSO]), P.sql_apagar("staging", "fotos_evolucao", OUTRO, [FALSO])]
    o.ok(all("staging." in s and "any(array[" in s and "nutricionista_id = '" in s for s in sqls), "a limpeza: só staging, só os ids da rodada, só a nutri de teste")
    recusas = 0
    for f in (lambda: P.sql_apagar("public", "anexos", OUTRO, [FALSO]), lambda: P.sql_apagar("staging", "anexos", OUTRO, []),
              lambda: P.sql_apagar("staging", "consultas", OUTRO, [FALSO])):
        try:
            f()
        except SystemExit:
            recusas += 1
    o.ok(recusas == 3, "a limpeza recusa outro schema, o DELETE sem id e tabela que não é da massa")
    conta = P.sql_contar_marca("staging", "seco-0000")
    o.ok("'%hml20 e2e%seco-0000%'" in conta and "staging.anexos" in conta and "staging.fotos_evolucao" in conta, "a conferência final: a marca nos anexos e nas fotos (só contagem)")
    o.ok(B.REG_LOGINS.name == "logins_etapa2_20b.txt" and B.B19.MAX_LOGINS == 10, f"o registro de logins da 20b (decisão G): {B.REG_LOGINS.name} (teto {B.B19.MAX_LOGINS}; ≤ 6 na etapa 2)")


# ───────────────────────── a rodada no staging ─────────────────────────
class Rodada:
    def __init__(self, o, L, estado, rodada: str) -> None:
        self.o, self.L, self.e, self.rodada = o, L, estado, rodada
        self.s = B.schema()
        self.dia = hoje_sp()
        self.tn = L.token(P.NUTRI)
        self.un = L.uid(P.NUTRI)
        self.pac = B.B17.matricula_da_aluna()
        self.tempos: dict[str, list[int]] = {}
        self.massa: dict = {"anexo": None, "foto": None}
        r = self.um(f"select coalesce(treino_user_id::text, '') as v from {self.s}.pacientes where id = {C.txt(self.pac)}")
        self.rota = r if C.eh_uuid(r) else self.pac
        r = self.um(f"select id::text as v from {self.s}.antropometrias where paciente_id = {C.txt(self.pac)} and deleted_at is null order by data desc limit 1")
        self.antropo = r if C.eh_uuid(r) else FALSO
        self.catalogo = B.regras_leitura()["consultas"]

    def um(self, sql: str):
        r = B.ler_principal(sql)
        return next(iter(r[0].values())) if r else None

    def ler(self, token: str, itens: list[dict], corpo: dict | None = None, rotulo: str = "ler") -> tuple[int, dict]:
        st, r, _h, ms = B.ler(token, itens, corpo=corpo)
        self.tempos.setdefault(rotulo, []).append(ms)
        return st, r

    def item(self, token: str, it: dict) -> dict:
        """1 consulta numa chamada (o P compara uma por uma)."""
        st, r = self.ler(token, [it])
        itens = r.get("itens") or [{}]
        return itens[0] if st == 200 else {"ok": False, "erro": f"HTTP {st} {r.get('erro')}"}

    def como(self, uid: str, sql: str) -> object:
        r = B.ler_como(B.PRINCIPAL_REF, uid, sql)
        return jsonb(r[0]["v"]) if r else None


def p_tabela(R: Rodada, token: str, uid: str, q: str, params: dict, rotulo: str) -> list:
    """O P de uma consulta de tabela: as linhas da função = as do SQL do catálogo como a pessoa (o conjunto e a ordem)."""
    c = R.catalogo[q]
    it = R.item(token, B.item(q, **params))
    sql = R.como(uid, P.sql_da_tabela(R.s, c, params, uid))
    # a consulta que assina 1 arquivo por linha (o anexo_url) devolve a linha + a `url` (o resto é a linha lida): compara sem a url
    assina = isinstance(c.get("assinar"), dict) and not c["assinar"].get("lista")
    linhas = [{k: v for k, v in x.items() if k != "url"} if assina and isinstance(x, dict) else x for x in it.get("linhas") or []]
    ok, msg = P.mesmas_linhas(linhas, sql if isinstance(sql, list) else []) if it.get("ok") else (False, str(it.get("erro")))
    R.o.ok(ok, f"P {rotulo} {q}: as linhas da função = o SQL só leitura do catálogo como a pessoa ({msg})")
    return it.get("linhas") or []


def p_rpc(R: Rodada, token: str, uid: str, q: str, params: dict, rotulo: str, tirar_url: bool = False) -> object:
    """O P de uma consulta de RPC: o valor da função = a MESMA RPC rodada como a pessoa (o JSON canônico; a série sem a url das fotos)."""
    c = R.catalogo[q]
    it = R.item(token, B.item(q, **params))
    valor = it.get("valor")
    sql = R.como(uid, P.sql_da_rpc(R.s, c, params))
    R.o.ok(bool(it.get("ok")) and igual(sem_volateis(sem_url(valor) if tirar_url else valor), sem_volateis(sql)),
           f"P {rotulo} {q}: o valor = a RPC {c['rpc']} rodada como a pessoa, fora o `agora` ({it.get('erro') or 'iguais'})")
    return valor


def baixar_e_conferir(R: Rodada, rel: object, massa: dict, prazo: int, download: str | None, rotulo: str) -> None:
    url = B.url_da_tela(B.API_P, rel)
    st_img, n, _tipo = B.baixar(url) if url else (0, 0, "")
    R.o.ok(bool(url) and st_img == 200 and n == massa["bytes"] and P.prazo_da_url(url) == prazo and P.caminho_da_url(url) == f"{massa['bucket']}/{massa['path']}"
           and P.download_da_url(url) == download,
           f"P {rotulo}: a URL do servidor (relativa, montada com o domínio do cliente) baixa o arquivo da massa ({st_img}, {n} B), com o prazo de hoje "
           f"({P.prazo_da_url(url)} s), o caminho DA LINHA e o {'nome do arquivo' if download else 'abrir no navegador (sem o download)'}")


def caso_p(R: Rodada) -> None:
    o, s, pac = R.o, R.s, R.pac
    # a casca
    perfil = p_rpc(R, R.tn, R.un, "aluno_perfil", {"aluno": pac}, "nutri")
    pela_rota = R.item(R.tn, B.item("aluno_perfil", aluno=R.rota)).get("valor")
    o.ok(isinstance(perfil, dict) and isinstance(pela_rota, dict) and perfil.get("paciente_id") == pela_rota.get("paciente_id") == pac,
         "P nutri aluno_perfil pela matrícula e pelo id do Treino (a rota): a MESMA matrícula")
    serie = p_rpc(R, R.tn, R.un, "aluno_evolucao_painel", {"aluno": pac}, "nutri", tirar_url=True)
    foto = R.massa["foto"]
    if foto:
        f = next((x for x in (serie or {}).get("fotos") or [] if x.get("id") == foto["id"]), None)
        baixar_e_conferir(R, (f or {}).get("url"), foto, 3600, None, "nutri aluno_evolucao_painel (a foto de evolução da massa)")
    p_tabela(R, R.tn, R.un, "profissional", {}, "nutri")
    for params in ({"aluno": pac, "limite": 3}, {"aluno": pac, "limite": 20, "offset": 0}):
        p_rpc(R, R.tn, R.un, "anotacoes", params, f"nutri ({'card' if 'offset' not in params else 'página'})")
    p_rpc(R, R.tn, R.un, "anotacoes_todas", {"aluno": pac}, "nutri (o PDF)")
    # o Prontuário ×10, a Avaliação e o PDF
    for q in P.LISTAS_DO_ALUNO:
        p_tabela(R, R.tn, R.un, q, {"aluno": pac}, "nutri")
    for q in P.LISTAS_DA_CONTA:
        p_tabela(R, R.tn, R.un, q, {}, "nutri")
    it = R.item(R.tn, B.item("pedidos_exame_do_aluno", aluno=pac, pagina=1))
    c = R.catalogo["pedidos_exame_do_aluno"]
    sql = R.como(R.un, P.sql_da_tabela(s, c, {"aluno": pac, "pagina": 1}, R.un))
    total = R.como(R.un, P.sql_do_total(s, c, {"aluno": pac}))
    ok, msg = P.mesmas_linhas(it.get("linhas") or [], sql if isinstance(sql, list) else [])
    o.ok(bool(it.get("ok")) and ok and it.get("total") == total, f"P nutri pedidos_exame_do_aluno: a 1ª página = o SQL ({msg}) e o total = o count ({it.get('total')} × {total})")
    p_rpc(R, R.tn, R.un, "exames_do_aluno", {"aluno": pac, "offset": 0, "limite": 20}, "nutri")
    p_tabela(R, R.tn, R.un, "resultados_exame_do_aluno", {"aluno": pac}, "nutri")
    if C.eh_uuid(R.antropo) and R.antropo != FALSO:
        p_tabela(R, R.tn, R.un, "antropometria", {"id": R.antropo}, "nutri (o Editar)")
    p_tabela(R, R.tn, R.un, "antropometrias_pdf", {"paciente": pac}, "nutri (o PDF)")
    anexo = R.massa["anexo"]
    if anexo:
        for download, prazo in ((True, 60), (False, 120)):
            linhas = p_tabela(R, R.tn, R.un, "anexo_url", {"id": anexo["id"], "download": download}, f"nutri ({'baixar' if download else 'ver'})")
            baixar_e_conferir(R, (linhas[0] if linhas else {}).get("url"), anexo, prazo, anexo["nome"] if download else None,
                              f"nutri anexo_url ({'baixar' if download else 'ver'})")
    # o lado da personal (o Resumo e a Avaliação): o perfil, a série e as anotações da equipe, como ELA
    tp, up = R.L.token(P.PERSONAL), R.L.uid(P.PERSONAL)
    p_rpc(R, tp, up, "aluno_perfil", {"aluno": pac}, "personal")
    p_rpc(R, tp, up, "aluno_evolucao_painel", {"aluno": pac}, "personal", tirar_url=True)
    p_rpc(R, tp, up, "anotacoes", {"aluno": pac, "limite": 3}, "personal (o card)")


def caso_n1(R: Rodada) -> None:
    """Outra conta pede as consultas do aluno com os ids da aluna: nada da aluna volta."""
    o, pac = R.o, R.pac
    tn = R.L.token(P.OUTRA)
    anexo = (R.massa["anexo"] or {}).get("id") or FALSO
    foto = (R.massa["foto"] or {}).get("id")
    proibidos = {pac, R.rota, R.antropo, anexo} | ({foto} if foto else set())
    proibidos.discard(FALSO)
    i = B.item
    lotes = [
        [i("aluno_perfil", aluno=pac), i("aluno_evolucao_painel", aluno=pac), i("anotacoes", aluno=pac, limite=3), i("anotacoes_todas", aluno=pac),
         *[i(q, aluno=pac) for q in P.LISTAS_DO_ALUNO]],
        [i("pedidos_exame_do_aluno", aluno=pac, pagina=1), i("exames_do_aluno", aluno=pac, offset=0, limite=20), i("resultados_exame_do_aluno", aluno=pac),
         i("anexo_url", id=anexo, download=True), i("antropometria", id=R.antropo), i("antropometrias_pdf", paciente=pac)],
    ]
    vazou: set[str] = set()
    resumo: list[str] = []
    ok = True
    for lote in lotes:
        st, r = R.ler(tn, lote)
        vazou |= proibidos & ids_de(r)
        for it, resp in zip(lote, r.get("itens") or []):
            q = it["q"]
            if q in ("aluno_perfil", "aluno_evolucao_painel", "anotacoes", "anotacoes_todas"):
                bom = resp.get("ok") is False and resp.get("erro") == "sem_acesso"
            elif q in ("anexo_url", "antropometria"):
                bom = resp.get("ok") is False and resp.get("erro") == "nao_encontrado"
            elif q == "exames_do_aluno":
                v = resp.get("valor") or {}
                bom = resp.get("ok") is True and not v.get("datas") and not v.get("total_resultados")
            else:
                bom = resp.get("ok") is True and not (resp.get("linhas") or []) and resp.get("total", 0) == 0
            ok = ok and bom and st == 200
            resumo.append(f"{q}:{'ok' if bom else 'X'}")
    o.ok(ok and not vazou, f"N1 outra conta (w13-dono): as consultas do aluno → vazio / sem_acesso / nao_encontrado, nenhum id da aluna "
         f"({len(vazou)} id da aluna; {', '.join(x for x in resumo if x.endswith('X')) or 'todas como esperado'})")


def caso_n2_n3_n6_n7_n9(R: Rodada, casos: list[str]) -> None:
    o = R.o
    if "N2" in casos:
        st, _r, _h, _ms = B.ler(None, [B.item("profissional")], sem_auth=True)
        o.ok(st == 401, f"N2 sem login → 401 ({st})")
    if "N3" in casos:
        st, r = R.ler(R.tn, [B.item("aluno_perfil", aluno=R.pac), B.item("prontuario_inteiro"), B.item("anexos_de_todos")])
        itens = r.get("itens") or [{}, {}, {}]
        o.ok(st == 200 and itens[0].get("ok") and [i.get("erro") for i in itens[1:]] == ["consulta_invalida", "consulta_invalida"],
             f"N3 q desconhecida → o item volta consulta_invalida e o outro responde ({st})")
    if "N6" in casos:
        st, r, _h, _ms = B.ler(R.tn, [B.item("profissional")], schema_="producao")
        o.ok(st == 400 and r.get("erro") == "schema_invalido", f"N6 x-schema inválido → 400 schema_invalido ({st})")
    if "N7" in casos:
        st, h = B.preflight(B.ORIGEM_FORA)
        o.ok(st in (200, 204) and B.cors(h) == B.ORIGEM_PADRAO, f"N7 origem fora da lista → o CORS padrão ({st})")
    if "N9" in casos:
        st, r = R.ler(R.tn, [B.item("profissional")] * 17)
        o.ok(st == 400 and r.get("erro") == "lote_grande", f"N9 lote de 17 → 400 lote_grande ({st} {r.get('erro')})")
        st, r = R.ler(R.tn, [B.item("profissional")] * 16)
        o.ok(st == 200 and len(r.get("itens") or []) == 16, f"N9 controle: 16 itens iguais → 200 com 16 respostas ({st})")


def caso_n4_n5_n8(R: Rodada, casos: list[str]) -> None:
    o, pac = R.o, R.pac
    i = B.item
    if "N4" in casos:
        to, uo = R.L.token(P.OUTRA), R.L.uid(P.OUTRA)
        st, r = R.ler(to, [i("profissional", id=R.un, user_id=R.un, nutricionista_id=R.un)], corpo={"user_id": R.un, "nutricionista_id": R.un})
        linhas = ((r.get("itens") or [{}])[0]).get("linhas") or []
        sql = R.como(uo, P.sql_da_tabela(R.s, R.catalogo["profissional"], {}, uo))
        ok, msg = P.mesmas_linhas(linhas, sql if isinstance(sql, list) else [])
        o.ok(st == 200 and ok, f"N4 o id/user_id/nutricionista_id da nutri no corpo do profissional (pedido pela w13-dono) → ignorados: volta o profiles de QUEM CHAMA ({msg})")
        st0, base = R.ler(R.tn, [i(q) for q in P.LISTAS_DA_CONTA])
        st1, outro = R.ler(R.tn, [i(q, nutricionista_id=OUTRO, user_id=OUTRO, aluno=OUTRO) for q in P.LISTAS_DA_CONTA])
        o.ok(st0 == 200 and st1 == 200 and igual(base.get("itens"), outro.get("itens")),
             f"N4 o dono/aluno de outra pessoa no corpo das listas da conta → ignorados (a resposta é a mesma) ({st0}, {st1})")
    if "N5" in casos:
        st0, base = R.ler(R.tn, [i("anexos_do_aluno", aluno=pac), i("aluno_perfil", aluno=pac)])
        st1, outro = R.ler(R.tn, [i("anexos_do_aluno", aluno=pac, select="*", colunas="*", order="id"), i("aluno_perfil", aluno=pac, p_aluno=OUTRO)])
        mesmo = lambda r: [sem_volateis(i.get("valor")) if "valor" in i else i for i in r.get("itens") or []]  # noqa: E731
        o.ok(st0 == 200 and st1 == 200 and igual(mesmo(base), mesmo(outro)),
             f"N5 select/colunas/order/p_aluno no corpo → ignorados (a resposta é a mesma, fora o `agora`) ({st0}, {st1})")
    if "N8" in casos:
        anexo = R.massa["anexo"]
        if anexo:
            st, r = R.ler(R.tn, [i("anexo_url", id=anexo["id"], download=True, path=f"{OUTRO}/x/y.png", caminho=f"{OUTRO}/x/y.png", nome="outro.png")])
            linha = ((r.get("itens") or [{}])[0].get("linhas") or [{}])[0]
            url = B.url_da_tela(B.API_P, linha.get("url"))
            o.ok(st == 200 and P.caminho_da_url(url) == f"{anexo['bucket']}/{anexo['path']}" and P.download_da_url(url) == anexo["nome"] and OUTRO not in json.dumps(r),
                 "N8 anexo_url com outro caminho e outro nome no corpo → assina SÓ o caminho da linha relida pelo id, com o nome DELA")
        st, r = R.ler(R.tn, [i("aluno_evolucao_painel", aluno=pac, caminhos=[f"{OUTRO}/x/y.jpg"], path=f"{OUTRO}/x/y.jpg")])
        fotos = ((r.get("itens") or [{}])[0].get("valor") or {}).get("fotos") or []
        caminhos = {P.caminho_da_url(B.url_da_tela(B.API_P, f.get("url"))) for f in fotos if f.get("url")}
        o.ok(st == 200 and OUTRO not in json.dumps(r) and all(c and c.split("/", 1)[1] in {f.get("path") for f in fotos} for c in caminhos),
             f"N8 a série com um caminho no corpo → ignorado: só as fotos que a RPC leu são assinadas ({len(caminhos)} URL(s))")


def rodar(o, L, estado, rodada: str, casos: list[str]) -> None:
    R = Rodada(o, L, estado, rodada)
    estado.d.update({"pac": R.pac})
    estado.salvar()
    o.linha(f"rodada {rodada} · schema {R.s} · área painel-aluno (20b) · casos {','.join(casos)}")
    if {"P", "N1", "N8"} & set(casos):
        R.massa["anexo"] = P.criar_anexo(o, estado, R.tn, R.pac, rodada, R.un)
        R.massa["foto"] = P.criar_foto_evolucao(o, estado, R.tn, R.pac, rodada, R.dia)
    if "P" in casos:
        caso_p(R)
    if "N1" in casos:
        caso_n1(R)
    if {"N4", "N5", "N8"} & set(casos):
        caso_n4_n5_n8(R, casos)
    if {"N2", "N3", "N6", "N7", "N9"} & set(casos):
        caso_n2_n3_n6_n7_n9(R, casos)
    tempos = {k: f"{min(v)}–{max(v)} ms (n={len(v)})" for k, v in sorted(R.tempos.items())}
    o.linha(f"tempos: {tempos}")


def limpar(o, estado, L, s: str) -> None:
    P.limpar_massa(o, estado, L, s)


def so_leitura(o, L, base: str) -> None:
    """Nada grava e nada lê dado de saúde: o CORS, o 401, o 400 de schema, a q desconhecida e as 21 consultas da 20b com param
    obrigatório SEM ele (dados_invalidos: o catálogo da 20b está no ar, sem ir ao banco)."""
    st1, h1 = B.preflight(B.ORIGEM_FORA)
    o.ok(st1 in (200, 204) and B.cors(h1) == B.ORIGEM_PADRAO, f"{base} N7: origem fora da lista → o CORS padrão ({st1})")
    st, _r, _h, _ms = B.ler(None, [B.item("profissional")], sem_auth=True, origem=B.BASES[base])
    o.ok(st == 401, f"{base} N2: sem login → 401 ({st})")
    token = L.token(B.PROD_CONTA if base == "prod" else P.NUTRI)
    st, r, _h, _ms = B.ler(token, [B.item("anexos_de_todos")], schema_="producao", origem=B.BASES[base])
    o.ok(st == 400 and r.get("erro") == "schema_invalido", f"{base} N6: x-schema inválido → 400 ({st})")
    st, r, _h, ms = B.ler(token, [B.item("prontuario_inteiro"), B.item("anexos_de_todos")], origem=B.BASES[base])
    o.ok(st == 200 and [i.get("erro") for i in r.get("itens") or []] == ["consulta_invalida", "consulta_invalida"],
         f"{base} N3: a q desconhecida → consulta_invalida em cada item, sem banco ({st}, {ms} ms)")
    erros: list[str] = []
    for lote in (P.COM_PARAM_OBRIGATORIO[:16], P.COM_PARAM_OBRIGATORIO[16:]):
        st, r, _h, _ms = B.ler(token, [B.item(q) for q in lote], origem=B.BASES[base])
        erros += [f"{q}:{i.get('erro')}" for q, i in zip(lote, r.get("itens") or []) if i.get("erro") != "dados_invalidos"] if st == 200 else [f"HTTP {st}"]
    o.ok(not erros, f"{base}: as {len(P.COM_PARAM_OBRIGATORIO)} consultas da 20b com param obrigatório, sem ele → dados_invalidos — o catálogo da 20b "
         f"está no ar, sem ir ao banco ({', '.join(erros) or 'todas'})")
    st, r, _h, _ms = B.ler(token, [B.item("prontuario_inteiro")] * 17, origem=B.BASES[base])
    o.ok(st == 400 and r.get("erro") == "lote_grande", f"{base} N9: 17 itens → 400 lote_grande ({st})")


def main(a, casos: list[str]) -> int:
    """O --area painel-aluno do api.py (o seco, o --sair, o --limpar, o --so-leitura e a rodada)."""
    if a.seco:
        o = C.Saida("api20_painel-aluno_seco")
        seco(o)
        return o.fim()
    if a.sair:
        o = C.Saida("api20_sessoes_sair")
        B.Sessoes("sair").sair(o)
        return o.fim()
    if a.base == "prod" and not a.so_leitura:
        raise SystemExit("produção: só --so-leitura (nada grava, nada de massa)")
    modo = "so_leitura" if a.so_leitura else "limpar" if a.limpar else "rodada"
    s = B.usar_base(a.base)
    o = C.Saida(f"api20_painel-aluno_{a.base}" + {"limpar": "_limpar", "so_leitura": "_so_leitura"}.get(modo, ""))
    L = B.Sessoes("api20 painel-aluno" + {"limpar": " --limpar", "so_leitura": " --so-leitura"}.get(modo, "") + f" {a.base}")
    try:
        B.exigir_saude(o, "o api.py da hml-20 (painel-aluno)")
        if modo == "so_leitura":
            so_leitura(o, L, a.base if a.base != "local" else "staging")
        elif modo == "limpar":
            limpar(o, B.Estado.ler(), L, s)
        else:
            pendente = B.Estado.ler()
            if not pendente.vazio():
                o.ok(False, f"há uma rodada que caiu no meio (área {pendente.d.get('area') or 'prontuario'}): rode o --limpar antes", parar=True)
            rodada = B.nova_rodada()
            estado = B.Estado({"rodada": rodada, "schema": s, "area": P.AREA_ESTADO, "linhas": [], "storage": [], "n8": None})
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


ARQUIVO = Path(__file__).name
