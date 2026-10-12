"""Physiq hml-19d (H-41 · jeito 2, 11/10/2026) — os casos de SERVIDOR do Financeiro (o api.py chama: --area financeiro). O mesmo molde das
áreas da 19a/19b/19c: a foto do estado, --limpar, --seco; massa "hml19 e2e <rodada> …" SÓ no schema staging, SÓ nas contas de TESTE; o que
a rodada cria vai para o estado (agente/e2e_estado.json, com a área e o DONO de cada linha) e sai no fim (ou no --limpar, se a rodada
caiu): as linhas por id (DELETE no staging, só de cada dono de teste), o que a rodada marcou como excluído para semear volta a ficar vivo,
as tags da aluna voltam às de antes; o último ✅ confere por SQL só leitura (só contagem) que não sobrou nada.

Contas (staging, decisão G): T = w5p-personal (dono + personal da w5p-aluna: movimentação, recibo, categoria, modelo, tags); a SEMENTE =
a 1ª de w5p-nutri · w13-dono · w5p-personal SEM categoria nem modelo vivo e membro ativo de uma conta (o SQL só leitura escolhe; nenhuma
vazia → a 1ª com conta tem as dela marcadas como excluídas — soft, só no staging — e o fim devolve EXATAMENTE como estava, conferido por
contagem); N1 = w13-dono (OUTRA conta).
  P   a semente (padroes_garantir: as 6 categorias e o "Recibo padrão" com a conta, o texto pelo papel da pessoa na conta, no formato das
      telas; a 2ª chamada não grava; só as categorias na Lixeira → as 6 de novo); movimentação criar/editar/estornar/desfazer/excluir (o
      dono = quem chama; a Lixeira); o recibo da movimentação (o número do gatilho, o texto com o número REAL no lugar da marca, a
      movimentação ligada) e o excluir (a Lixeira e a movimentação solta, juntos); categoria criar/renomear/excluir e o nome repetido
      (sem caixa) → 409 nome_repetido; modelo criar/editar/excluir; as tags da aluna (só as tags mudam — as colunas de cobrança não)
  N1  outra conta: criar movimentação/recibo para a aluna → 403; editar/estornar/excluir a da T, renomear/excluir a categoria, editar/
      excluir o modelo, excluir o recibo, salvar as tags da aluna → 404 e nada muda; a semente na conta da T → 403 sem_acesso
  N2  sem login → 401; token falso → 401 · N3 ação desconhecida → 400 acao_invalida
  N4  nutricionista_id de outra pessoa no corpo → ignorado · N5 deleted_at/estornada/recibo_id/id e as colunas de cobrança no corpo → ignorados
  N6  x-schema inválido → 400 schema_invalido · N7 origem fora da lista → o CORS padrão (https://physiqcalc.com.br)
  N8  2 padroes_garantir ao MESMO tempo → 1 conjunto só
  N9  o recibo com a movimentação de OUTRA conta → 404 nao_encontrado e nada fica (nem o recibo nem o número)
Decisão K: cada ação vira +0,15 a 0,4 s (fria até ~1–2 s) — o tempo de cada ação sai no fim.
Produção (--base prod --so-leitura): OPTIONS (CORS), sem login → 401, x-schema inválido → 400, ação desconhecida → 400 — nada grava.
Da saída só saem status, códigos, contagens e tempos.
"""
from __future__ import annotations

import datetime as dt
import threading

import _base as B

C = B.C
FALSO = "00000000-0000-4000-8000-0000000000aa"
OUTRO = "44444444-4444-4444-8444-444444444444"
CASOS_FINANCEIRO = ("P", "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9")
T_CONTA = B.PERSONAL_CONTA  # w5p-personal: a dona da conta da w5p-aluna
CANDIDATAS_SEMENTE = ("w5p-nutri", "w13-dono", "w5p-personal")


def hoje() -> str:
    return dt.date.today().isoformat()


def texto_com_marca(m: str) -> str:
    """O texto do recibo como a tela manda: o número é a MARCA (o servidor põe o real)."""
    return f"Recibo nº {B.MARCA_NUMERO_RECIBO} — {m} — confere: {B.MARCA_NUMERO_RECIBO}"


def lista_pg(v: object) -> list[str]:
    """Um text[] do Postgres como lista (a Management API devolve JSON; por garantia, o texto "{a,b}" também)."""
    if isinstance(v, list):
        return [str(x) for x in v]
    if isinstance(v, str) and v.startswith("{") and v.endswith("}"):
        return [x.strip().strip('"') for x in v[1:-1].split(",") if x.strip()]
    return []


def numero_formatado(n: int) -> str:
    """O formatarNumeroRecibo da tela (padStart(4, "0")): o zfill faz o mesmo nos inteiros positivos (sem cortar acima de 4 dígitos)."""
    return str(int(n)).zfill(4)


# ───────────────────────── os pedidos (puros: o --seco confere todos) ─────────────────────────
def corpo_transacao(m: str, pac: str | None, conta: str | None = None, descricao: str = "movimentação", valor: float = 123.45) -> dict:
    c = {"tipo": "entrada", "descricao": f"{m} {descricao}", "valor": valor, "data": hoje(), "categoria_id": None, "metodo": "pix",
         "paciente_id": pac, "observacao": f"{m} observação"}
    return {"conta_id": conta, **c} if conta is not None else c


def corpo_recibo(m: str, pac: str, conta: str, transacao: str | None, modelo: str | None = None) -> dict:
    return {"conta_id": conta, "paciente_id": pac, "transacao_id": transacao, "modelo_id": modelo, "valor": 123.45, "data": hoje(),
            "descricao": f"{m} recibo", "texto": texto_com_marca(m)}


def pedidos_financeiro(rodada: str, pac: str, conta: str) -> list[tuple[str, dict]]:
    """Todos os pedidos da rodada (o --seco confere cada um contra as regras do servidor)."""
    m = f"{B.MARCA} {rodada}"
    return [
        ("padroes_garantir", {"conta_id": conta}),
        ("transacao_criar", corpo_transacao(m, pac, conta)),
        ("transacao_editar", {"id": FALSO, **corpo_transacao(m, pac, None, "movimentação editada", 150.0)}),
        ("transacao_estornar", {"id": FALSO, "estornada": True}),
        ("transacao_excluir", {"id": FALSO}),
        ("categoria_criar", {"conta_id": conta, "nome": f"{m} cat"}),
        ("categoria_renomear", {"id": FALSO, "nome": f"{m} cat 2"}),
        ("categoria_excluir", {"id": FALSO}),
        ("modelo_recibo_criar", {"conta_id": conta, "titulo": f"{m} modelo", "conteudo": "Recibo nº *|NUMERO_RECIBO|* de *|NOME_PACIENTE|*", "favorito": False}),
        ("modelo_recibo_editar", {"id": FALSO, "favorito": True}),
        ("modelo_recibo_excluir", {"id": FALSO}),
        ("recibo_emitir", corpo_recibo(m, pac, conta, FALSO)),
        ("recibo_excluir", {"id": FALSO}),
        ("tags_salvar", {"paciente_id": pac, "tags": ["VIP", f"{m}"]}),
    ]


# ───────────────────────── o --seco ─────────────────────────
def seco(o, area: str) -> None:
    rodada, pac, eu, conta = "seco-0000", "11111111-1111-4111-8111-111111111111", "33333333-3333-4333-8333-333333333333", "c0000000-0000-4000-8000-00000000000a"
    pedidos = pedidos_financeiro(rodada, pac, conta)
    r = B.regras_fin(pedidos, eu, papeis=[["nutricionista"], ["dono", "personal"], ["personal", "nutricionista"]], numeros=[1, 9999, 12345])
    acoes = set(r["acoes"])
    o.ok(len(acoes) == 14 and set(r["tabelas"]) == B.TABELAS_FINANCEIRO | {"pacientes"} and len(r["rpcs"]) == 3,
         f"as regras da financeiro lidas do TS: {len(acoes)} ações, as tabelas (as 4 da contagem + pacientes) e as {len(r['rpcs'])} RPCs")
    feitas = {a for a, _ in pedidos}
    o.ok(feitas == acoes, f"a rodada passa por TODAS as {len(acoes)} ações da financeiro" + ("" if feitas == acoes else f" — faltam {sorted(acoes - feitas)}"))
    ruins = [f"{x['acao']} ({x['erro']} {x['campo'] or ''})" for x in r["conferidos"] if not x["ok"]]
    o.ok(not ruins, f"os {len(pedidos)} pedidos passam nas regras do servidor" + (f" — recusados: {ruins}" if ruins else ""))
    o.ok(r["marca"] == B.MARCA_NUMERO_RECIBO, "a marca do número do recibo do E2E é a do servidor")
    o.ok(r["numeros"] == {"1": "0001", "9999": "9999", "12345": "12345"} and all(numero_formatado(int(k)) == v for k, v in r["numeros"].items()),
         f"o número que o E2E espera no texto = o do servidor (1, 4 e 5 dígitos, sem cortar): {r['numeros']}")
    nutri, personal, os_dois = r["modelos"]
    o.ok(nutri["conteudo"] == r["conteudo_nutri"] and personal["conteudo"] == r["conteudo"] and os_dois["conteudo"] == r["conteudo"]
         and nutri["titulo"] == "Recibo padrão" and nutri["favorito"] is True,
         "o texto da semente pelo papel: a nutricionista recebe o do Nutri; o personal e quem tem os 2 papéis, o do Physiq")
    o.ok(r["categorias"] == ["Consulta", "Retorno", "Plano alimentar", "Aluguel", "Material", "Outros"], "as 6 categorias da semente (as de hoje)")
    # N3, N4, N5 nas regras (o que o servidor faz com o corpo)
    m = f"{B.MARCA} {rodada}"
    n = B.regras_fin([("transacao_apagar_tudo", {}), ("transacao_criar", {**corpo_transacao(m, pac, conta), "nutricionista_id": OUTRO}),
                      ("transacao_criar", {**corpo_transacao(m, pac, conta), "deleted_at": "2020-01-01T00:00:00Z", "estornada": True, "recibo_id": OUTRO, "id": OUTRO}),
                      ("tags_salvar", {"paciente_id": pac, "tags": ["VIP"], "mensalidade_valor": 1, "plano_aluno_id": OUTRO, "cobranca_pausada": True}),
                      ("recibo_emitir", {**corpo_recibo(m, pac, conta, None), "nutricionista_id": OUTRO, "numero": 7}),
                      ("categoria_criar", {"conta_id": conta, "nome": "x" * 61})], eu)
    c3, c4, c5, ct, cr, cn = n["conferidos"]
    o.ok(not c3["ok"] and c3["erro"] == "acao_invalida" and c3["status"] == 400 and not c3["conhecida"], "N3 nas regras: ação desconhecida → 400 acao_invalida")
    o.ok(c4["ok"] and c4["valores"]["nutricionista_id"] == eu, "N4 nas regras: o nutricionista_id do corpo cai; o dono é quem chama")
    o.ok(c5["ok"] and not {"deleted_at", "estornada", "recibo_id", "id"} & set(c5["valores"]), "N5 nas regras: deleted_at/estornada/recibo_id/id do corpo caem")
    o.ok(ct["ok"] and ct["tags"] == ["VIP"] and ct["valores"] is None, "N5 nas tags: as colunas de cobrança do corpo caem (só as tags vão)")
    o.ok(cr["ok"] and not {"nutricionista_id", "numero"} & set(cr["valores"]), "o recibo: o dono e o número nunca do corpo (o número é do gatilho)")
    o.ok(not cn["ok"] and cn["erro"] == "dados_invalidos" and cn["status"] == 400, "o limite de hoje da tela: categoria com 61 caracteres → 400 dados_invalidos")
    o.ok(r["status"].get("nome_repetido") == 409 and r["status"].get("nao_encontrado") == 404 and r["status"].get("sem_acesso") == 403
         and r["status"].get("sem_login") == 401, "os status que o E2E espera são os do servidor (409, 404, 403, 401)")
    o.ok(len(f"{B.MARCA} 10111234-abcd cat 2") <= r["limites"]["categoria"] and len(f"{B.MARCA} 10111234-abcd") <= 40,
         "a massa cabe nos limites da tela (a categoria até 60; a tag nova até 40)")
    # a limpeza e a conferência
    sqls = B.sql_apagar_linhas_fin("staging", [["recibos", FALSO, eu], ["transacoes", FALSO, eu], ["categorias_financeiras", FALSO, OUTRO]])
    o.ok(len(sqls) == 3 and sqls[0].startswith("delete from staging.recibos") and all("nutricionista_id = '" in x for x in sqls),
         "a limpeza: por tabela e dono, só os ids da rodada, o recibo antes da movimentação")
    rest = B.sql_restaurar_fin("staging", [["categorias_financeiras", FALSO, eu]])
    o.ok(len(rest) == 1 and "set deleted_at = null" in rest[0] and "deleted_at is not null" in rest[0], "o que a rodada marcou como excluído volta (só os ids anotados)")
    recusas = 0
    for f in (lambda: B.sql_apagar_linhas_fin("public", [["recibos", FALSO, eu]]), lambda: B.sql_restaurar_fin("public", [["recibos", FALSO, eu]])):
        try:
            f()
        except SystemExit:
            recusas += 1
    o.ok(recusas == 2, "a limpeza e a volta recusam outro schema que não o staging")
    o.ok(B.sql_contar_marca_fin("staging", rodada).count(" as ") == 4 and "deleted_at is null" in B.sql_vivos_fin("staging", eu),
         "a conferência final: a marca nas 4 tabelas e os vivos da semente (só leitura)")
    # hml-20a: o registro passou a ser o da hml-20a (hml20/agente/logins_etapa2_20a.txt) — o da 19d fica; hml-20b: o logins_etapa2_20b.txt;
    # hml-20c: o logins_etapa2_20c.txt
    o.ok(B.REG_LOGINS.name in ("logins_etapa2_19d.txt", "logins_etapa2_20a.txt", "logins_etapa2_20b.txt", "logins_etapa2_20c.txt"),
         f"o registro de logins da W (decisão G): {B.REG_LOGINS.parent.parent.name}/agente/{B.REG_LOGINS.name}")
    o.ok(texto_com_marca(m).count(B.MARCA_NUMERO_RECIBO) == 2 and B.MARCA_NUMERO_RECIBO not in texto_com_marca(m).replace(B.MARCA_NUMERO_RECIBO, "0001"),
         "o texto de teste leva a marca 2 vezes (a troca é de todas)")


# ───────────────────────── a rodada no staging ─────────────────────────
class RodadaFinanceiro:
    def __init__(self, o, L, estado: B.Estado, rodada: str) -> None:
        self.o, self.L, self.e, self.rodada = o, L, estado, rodada
        self.s = B.schema()
        self.m = f"{B.MARCA} {rodada}"
        self.tt, self.ut = L.token(T_CONTA), L.uid(T_CONTA)
        self.tn, self.un = L.token(B.N1_CONTA), L.uid(B.N1_CONTA)
        self.pac = B.B17.matricula_da_aluna()
        mat = B.B17.ler(f"select conta_id::text as c from {self.s}.pacientes where id = {C.txt(self.pac)}")
        self.conta = (mat[0]["c"] if mat else "") or ""
        membro = B.B17.ler(f"select count(*)::int as n from {self.s}.conta_membros where conta_id = {C.txt(C.uuid_ok(self.conta))} "
                           f"and user_id = {C.txt(C.uuid_ok(self.ut))} and status = 'ativo'") if C.eh_uuid(self.conta) and C.eh_uuid(self.ut) else [{"n": 0}]
        o.ok(C.eh_uuid(self.conta) and membro[0]["n"] == 1, "a aluna de teste tem conta e a personal de teste trabalha nela (SQL só leitura)", parar=True)
        n1 = B.B17.ler(f"select conta_id::text as c from {self.s}.conta_membros where user_id = {C.txt(C.uuid_ok(self.un))} and status = 'ativo' "
                       f"and conta_id <> {C.txt(self.conta)} order by criado_em limit 1")
        self.conta_n1 = (n1[0]["c"] if n1 else "") or ""
        self.tempos: dict[str, list[int]] = {}
        self.ids: dict[str, str] = {}

    def chamar(self, token: str, acao: str, corpo: dict) -> tuple[int, dict]:
        st, r, _h, ms = B.funcao_fin(token, acao, corpo)
        self.tempos.setdefault(acao, []).append(ms)
        return st, r

    def linha(self, tabela: str, id_: object, colunas: str) -> dict | None:
        if not C.eh_uuid(id_):
            return None
        r = B.B17.ler(f"select {colunas} from {self.s}.{tabela} where id = {C.txt(id_)}")
        return r[0] if r else None


def uid_da_conta_de_teste(s: str, conta: str) -> str:
    """O id de uma conta de TESTE pelo e-mail (SQL só leitura; o e-mail nunca sai na saída)."""
    email = B.B5.CONTAS[conta][0]
    if not C.eh_email_de_teste(email):
        raise SystemExit(f"não é conta de teste: {conta}")
    r = B.B17.ler(f"select id::text as id from auth.users where lower(email) = lower({C.txt(email)}) limit 1")
    return (r[0]["id"] if r else "") or ""


def escolher_semente(o, L, s: str, estado: B.Estado) -> dict:
    """A conta da semente (decisão G): a 1ª candidata membro ativo de uma conta e SEM categoria nem modelo vivo; nenhuma vazia → a 1ª com
    conta, com as vivas dela marcadas como excluídas (soft, só no staging; os ids no estado — o fim devolve, conferido por contagem)."""
    opcoes = []
    for conta in CANDIDATAS_SEMENTE:
        uid = uid_da_conta_de_teste(s, conta)
        if not C.eh_uuid(uid):
            continue
        membro = B.B17.ler(f"select conta_id::text as c, papeis from {s}.conta_membros where user_id = {C.txt(uid)} and status = 'ativo' order by criado_em limit 1")
        if not membro:
            continue
        vivos = B.B17.ler(B.sql_vivos_fin(s, uid))[0]
        opcoes.append({"nome": conta, "uid": uid, "conta": membro[0]["c"], "papeis": lista_pg(membro[0]["papeis"]), "antes": vivos})
        if vivos == {"categorias": 0, "modelos": 0}:
            break
    o.ok(bool(opcoes), "há uma conta de teste membro ativo de uma conta para a semente (SQL só leitura)", parar=True)
    escolhida = next((x for x in opcoes if x["antes"] == {"categorias": 0, "modelos": 0}), opcoes[0])
    estado.d["semente"] = {"nome": escolhida["nome"], "uid": escolhida["uid"], "antes": escolhida["antes"]}
    estado.salvar()
    if escolhida["antes"] != {"categorias": 0, "modelos": 0}:
        u = C.txt(C.uuid_ok(escolhida["uid"]))
        for tabela in ("categorias_financeiras", "modelos_recibo"):
            for x in C.C2.sql_principal(f"update {s}.{tabela} set deleted_at = now() where nutricionista_id = {u} and deleted_at is null returning id::text as id"):
                estado.restaurar(tabela, x["id"], escolhida["uid"])
        o.linha(f"   (nenhuma candidata vazia: as vivas da {escolhida['nome']} foram marcadas como excluídas — {escolhida['antes']} — e voltam no fim)")
    o.linha(f"   semente: {escolhida['nome']} · papéis {escolhida['papeis']} · vivos antes {escolhida['antes']}")
    return escolhida


def caso_semente(R: RodadaFinanceiro, casos: list[str]) -> None:
    """P (a semente) + N8 (2 ao mesmo tempo) + N1 (a conta de outro)."""
    o, s = R.o, R.s
    sem = escolher_semente(o, R.L, s, R.e)
    token = R.L.token(sem["nome"])
    textos = B.regras_fin(papeis=[sem["papeis"]])
    esperado = textos["modelos"][0]
    respostas: list[tuple[int, dict]] = []
    if "N8" in casos:
        def garantir() -> None:
            st, r = R.chamar(token, "padroes_garantir", {"conta_id": sem["conta"]})
            respostas.append((st, r))
        fios = [threading.Thread(target=garantir) for _ in range(2)]
        for f in fios:
            f.start()
        for f in fios:
            f.join(90)
    else:
        respostas.append(R.chamar(token, "padroes_garantir", {"conta_id": sem["conta"]}))
    for _st, r in respostas:
        for c in r.get("categorias") or []:
            R.e.linha_fin("categorias_financeiras", c.get("id"), sem["uid"])
        for mdl in r.get("modelos") or []:
            R.e.linha_fin("modelos_recibo", mdl.get("id"), sem["uid"])
    soma = {"categorias": sum(int((r.get("criados") or {}).get("categorias") or 0) for _s, r in respostas),
            "modelos": sum(int((r.get("criados") or {}).get("modelos") or 0) for _s, r in respostas)}
    vivos = B.B17.ler(B.sql_vivos_fin(s, sem["uid"]))[0]
    rotulo = "N8 2 padroes_garantir ao MESMO tempo" if len(respostas) == 2 else "P padroes_garantir"
    o.ok(all(st == 200 for st, _r in respostas) and soma == {"categorias": 6, "modelos": 1} and vivos == {"categorias": 6, "modelos": 1},
         f"{rotulo} → 1 conjunto só (criados somados {soma}; vivos {vivos}) ({[st for st, _r in respostas]})")
    r = respostas[0][1]
    cats, mods = r.get("categorias") or [], r.get("modelos") or []
    o.ok(sorted(c.get("nome") for c in cats) == sorted(textos["categorias"]) and all(set(c) == {"id", "nome", "nutricionista_id"} for c in cats)
         and len(mods) == 1 and set(mods[0]) == {"id", "nutricionista_id", "titulo", "conteudo", "favorito"},
         "P as listas no formato das telas (as 6 categorias de hoje; o modelo com as 5 colunas)")
    db = B.B17.ler(f"select count(*) filter (where conta_id = {C.txt(sem['conta'])})::int as com_conta, count(*)::int as n "
                   f"from {s}.categorias_financeiras where nutricionista_id = {C.txt(sem['uid'])} and deleted_at is null")[0]
    modelo = R.linha("modelos_recibo", mods[0].get("id") if mods else None, "conteudo, titulo, favorito, conta_id::text as conta") or {}
    o.ok(db == {"com_conta": 6, "n": 6} and modelo.get("conta") == sem["conta"] and modelo.get("conteudo") == esperado["conteudo"]
         and modelo.get("titulo") == "Recibo padrão" and modelo.get("favorito") is True,
         f"P tudo com a conta (corrige o lancamentos.ts:84) e o texto do recibo pelo papel na conta ({'Nutri' if 'nutricional' in esperado['conteudo'] else 'Physiq'})")
    st, r2 = R.chamar(token, "padroes_garantir", {"conta_id": sem["conta"]})
    o.ok(st == 200 and r2.get("criados") == {"categorias": 0, "modelos": 0} and B.B17.ler(B.sql_vivos_fin(s, sem["uid"]))[0] == {"categorias": 6, "modelos": 1},
         f"P a 2ª chamada não grava (criados 0 e 0) ({st})")
    # só as categorias na Lixeira → as 6 de novo (cada conjunto por si; o modelo vivo fica)
    C.C2.sql_principal(f"update {s}.categorias_financeiras set deleted_at = now() where nutricionista_id = {C.txt(sem['uid'])} and deleted_at is null "
                       f"and id = any(array[{', '.join(C.txt(c['id']) for c in cats if C.eh_uuid(c.get('id'))) or 'null'}]::uuid[])")
    st, r3 = R.chamar(token, "padroes_garantir", {"conta_id": sem["conta"]})
    for c in r3.get("categorias") or []:
        R.e.linha_fin("categorias_financeiras", c.get("id"), sem["uid"])
    o.ok(st == 200 and r3.get("criados") == {"categorias": 6, "modelos": 0}, f"P só as categorias na Lixeira → grava as 6 de novo; o modelo fica ({st} {r3.get('criados')})")
    if "N1" in casos and sem["nome"] != B.N1_CONTA:
        antes = B.B17.ler(B.sql_vivos_fin(s, R.un))[0]
        st, r = R.chamar(R.tn, "padroes_garantir", {"conta_id": R.conta})
        o.ok(st == 403 and r.get("erro") == "sem_acesso" and B.B17.ler(B.sql_vivos_fin(s, R.un))[0] == antes,
             f"N1 a semente na conta da personal pedida por quem é de OUTRA conta → 403 sem_acesso e nada muda ({st})")


def caso_movimentacao(R: RodadaFinanceiro, casos: list[str]) -> str:
    """P (criar/editar/estornar/desfazer) + N4/N5 + N1. Devolve o id da movimentação viva (o recibo nasce dela)."""
    o, m = R.o, R.m
    st, r = R.chamar(R.tt, "transacao_criar", corpo_transacao(m, R.pac, R.conta))
    linha = r.get("linha") or {}
    id_ = linha.get("id")
    if C.eh_uuid(id_):
        R.e.linha_fin("transacoes", id_, R.ut)
    db = R.linha("transacoes", id_, "nutricionista_id::text as dono, conta_id::text as conta, paciente_id::text as pac, valor::float as valor, "
                 "estornada, recibo_id, deleted_at is null as viva") or {}
    o.ok(st == 200 and db.get("dono") == R.ut and db.get("conta") == R.conta and db.get("pac") == R.pac and db.get("valor") == 123.45
         and db.get("estornada") is False and db.get("viva") and set(linha) >= {"categoria", "paciente", "created_at"},
         f"P transacao_criar → 200: a linha com o dono = quem chama e a volta com o select de hoje ({st} {r.get('erro')})")
    st, r = R.chamar(R.tt, "transacao_editar", {"id": id_, **corpo_transacao(m, R.pac, None, "movimentação editada", 150.0)})
    db = R.linha("transacoes", id_, "valor::float as valor, descricao") or {}
    o.ok(st == 200 and db.get("valor") == 150.0 and str(db.get("descricao", "")).endswith("editada"), f"P transacao_editar → 200 ({st})")
    st, r = R.chamar(R.tt, "transacao_estornar", {"id": id_, "estornada": True})
    o.ok(st == 200 and (R.linha("transacoes", id_, "estornada") or {}).get("estornada") is True, f"P transacao_estornar (true) → 200 ({st})")
    st, r = R.chamar(R.tt, "transacao_estornar", {"id": id_, "estornada": False})
    o.ok(st == 200 and (R.linha("transacoes", id_, "estornada") or {}).get("estornada") is False, f"P desfazer o estorno → 200 ({st})")
    if "N4" in casos or "N5" in casos:
        st, r = R.chamar(R.tt, "transacao_criar", {**corpo_transacao(m, R.pac, R.conta, "N4 N5"), "nutricionista_id": R.un, "deleted_at": "2020-01-01T00:00:00Z",
                                                   "estornada": True, "recibo_id": FALSO, "id": OUTRO})
        n45 = (r.get("linha") or {}).get("id")
        if C.eh_uuid(n45):
            R.e.linha_fin("transacoes", n45, R.ut)
        db = R.linha("transacoes", n45, "nutricionista_id::text as dono, deleted_at is null as viva, estornada, recibo_id") or {}
        o.ok(st == 200 and n45 != OUTRO and db.get("dono") == R.ut and db.get("viva") and db.get("estornada") is False and db.get("recibo_id") is None,
             f"N4/N5 nutricionista_id de outra pessoa, deleted_at, estornada, recibo_id e id no corpo → ignorados ({st})")
    if "N1" in casos:
        st, r = R.chamar(R.tn, "transacao_criar", corpo_transacao(m, R.pac, R.conta, "N1"))
        if (r.get("linha") or {}).get("id"):
            R.e.linha_fin("transacoes", r["linha"]["id"], R.un)
        o.ok(st == 403 and r.get("erro") == "sem_acesso", f"N1 outra conta: criar movimentação da aluna → 403 sem_acesso ({st})")
        for acao, corpo in (("transacao_editar", {"id": id_, **corpo_transacao(m, R.pac, None, "invasão", 999.0)}), ("transacao_estornar", {"id": id_, "estornada": True}),
                            ("transacao_excluir", {"id": id_})):
            st, r = R.chamar(R.tn, acao, corpo)
            db = R.linha("transacoes", id_, "valor::float as valor, estornada, deleted_at is null as viva") or {}
            o.ok(st == 404 and r.get("erro") == "nao_encontrado" and db == {"valor": 150.0, "estornada": False, "viva": True},
                 f"N1 {acao} da movimentação da personal → 404 e nada muda ({st})")
    return id_ if C.eh_uuid(id_) else ""


def caso_recibo(R: RodadaFinanceiro, casos: list[str], transacao: str) -> None:
    """P (emitir da movimentação: o número do gatilho, o texto com o número real, a ligação; excluir: a Lixeira e a movimentação solta) +
    N9 (a movimentação de OUTRA conta: nada fica) + N1 (excluir o da personal: nada muda)."""
    o, s, m = R.o, R.s, R.m
    if not transacao:
        o.ok(False, "o recibo precisa da movimentação viva do caso anterior")
        return
    ultimo = B.B17.ler(f"select coalesce(max(numero), 0)::int as n from {s}.recibos where nutricionista_id = {C.txt(R.ut)}")[0]["n"]
    st, r = R.chamar(R.tt, "recibo_emitir", corpo_recibo(m, R.pac, R.conta, transacao))
    linha = r.get("linha") or {}
    rid = linha.get("id")
    if C.eh_uuid(rid):
        R.e.linha_fin("recibos", rid, R.ut)
    numero = int(linha.get("numero") or 0)
    esperado = texto_com_marca(m).replace(B.MARCA_NUMERO_RECIBO, numero_formatado(numero))
    db = R.linha("recibos", rid, "numero, texto, transacao_id::text as tx, nutricionista_id::text as dono, position(chr(1) in texto) as marca") or {}
    ligada = (R.linha("transacoes", transacao, "recibo_id::text as r") or {}).get("r")
    o.ok(st == 200 and numero == ultimo + 1 and db.get("numero") == numero and db.get("dono") == R.ut and db.get("tx") == transacao and ligada == rid,
         f"P recibo_emitir → 200: o número do gatilho ({ultimo} → {numero}) e a movimentação ligada a ele, numa chamada ({st} {r.get('erro')})")
    o.ok(db.get("texto") == esperado and linha.get("texto") == esperado and db.get("marca") == 0,
         f"P o texto gravado tem o número REAL no lugar da marca (as 2 vezes; {numero_formatado(numero)}) — e a volta já vem com ele")
    o.ok(set(linha) >= {"paciente", "transacao", "created_at"} and (linha.get("transacao") or {}).get("descricao", "").startswith(m),
         "P a volta é o select de hoje (o aluno e a movimentação de origem embutidos)")
    if "N9" in casos and not C.eh_uuid(R.conta_n1):
        o.ok(False, "N9 precisa de uma conta da N1 (w13-dono) diferente da conta da aluna (SQL só leitura) — não achei")
    if "N9" in casos and C.eh_uuid(R.conta_n1):
        st, r = R.chamar(R.tn, "transacao_criar", corpo_transacao(m, None, R.conta_n1, "N9 da outra conta"))
        tx_n1 = (r.get("linha") or {}).get("id")
        if C.eh_uuid(tx_n1):
            R.e.linha_fin("transacoes", tx_n1, R.un)
        antes = B.B17.ler(f"select count(*)::int as n, coalesce(max(numero), 0)::int as maior from {s}.recibos where nutricionista_id = {C.txt(R.ut)}")[0]
        st, r = R.chamar(R.tt, "recibo_emitir", corpo_recibo(m, R.pac, R.conta, tx_n1))
        depois = B.B17.ler(f"select count(*)::int as n, coalesce(max(numero), 0)::int as maior from {s}.recibos where nutricionista_id = {C.txt(R.ut)}")[0]
        o.ok(st == 404 and r.get("erro") == "nao_encontrado" and depois == antes and (R.linha("transacoes", tx_n1, "recibo_id") or {}).get("recibo_id") is None,
             f"N9 o recibo com a movimentação de OUTRA conta → 404 e nada fica: nem o recibo nem o número ({st}; {antes} → {depois})")
    if "N1" in casos:
        st, r = R.chamar(R.tn, "recibo_emitir", corpo_recibo(m, R.pac, R.conta, None))
        if (r.get("linha") or {}).get("id"):
            R.e.linha_fin("recibos", r["linha"]["id"], R.un)
        o.ok(st == 403 and r.get("erro") == "sem_acesso", f"N1 outra conta: emitir recibo para a aluna → 403 sem_acesso ({st})")
        st, r = R.chamar(R.tn, "recibo_excluir", {"id": rid})
        viva = (R.linha("recibos", rid, "deleted_at is null as viva") or {}).get("viva")
        o.ok(st == 404 and r.get("erro") == "nao_encontrado" and viva is True and (R.linha("transacoes", transacao, "recibo_id::text as r") or {}).get("r") == rid,
             f"N1 excluir o recibo da personal → 404 e nada muda (vivo e ligado) ({st})")
    st, r = R.chamar(R.tt, "recibo_excluir", {"id": rid})
    db = R.linha("recibos", rid, "deleted_at is not null as lixeira") or {}
    solta = (R.linha("transacoes", transacao, "recibo_id") or {}).get("recibo_id") is None
    o.ok(st == 200 and db.get("lixeira") and solta and r.get("movimentacoes") == 1,
         f"P recibo_excluir → 200: o recibo na Lixeira e a movimentação solta, juntos ({st}, soltas {r.get('movimentacoes')})")
    st, r = R.chamar(R.tt, "transacao_excluir", {"id": transacao})
    o.ok(st == 200 and (R.linha("transacoes", transacao, "deleted_at is not null as lixeira") or {}).get("lixeira"), f"P transacao_excluir → 200: a Lixeira ({st})")


def caso_categoria(R: RodadaFinanceiro, casos: list[str]) -> None:
    """P (criar, o nome repetido sem caixa, renomear, excluir) + N1."""
    o, m = R.o, R.m
    nome = f"{m} cat"
    st, r = R.chamar(R.tt, "categoria_criar", {"conta_id": R.conta, "nome": nome})
    linha = r.get("linha") or {}
    id_ = linha.get("id")
    if C.eh_uuid(id_):
        R.e.linha_fin("categorias_financeiras", id_, R.ut)
    db = R.linha("categorias_financeiras", id_, "nutricionista_id::text as dono, conta_id::text as conta, nome") or {}
    o.ok(st == 200 and db == {"dono": R.ut, "conta": R.conta, "nome": nome} and set(linha) == {"id", "nome", "nutricionista_id"},
         f"P categoria_criar → 200 (o dono = quem chama; a volta {{id, nome, nutricionista_id}}) ({st} {r.get('erro')})")
    st, r = R.chamar(R.tt, "categoria_criar", {"conta_id": R.conta, "nome": nome.upper()})
    if (r.get("linha") or {}).get("id"):
        R.e.linha_fin("categorias_financeiras", r["linha"]["id"], R.ut)
    o.ok(st == 409 and r.get("erro") == "nome_repetido", f"P o nome repetido (sem caixa) entre as vivas → 409 nome_repetido ({st})")
    st, r = R.chamar(R.tt, "categoria_renomear", {"id": id_, "nome": f"{m} cat 2"})
    o.ok(st == 200 and (R.linha("categorias_financeiras", id_, "nome") or {}).get("nome") == f"{m} cat 2", f"P categoria_renomear → 200 ({st})")
    if "N1" in casos:
        for acao, corpo in (("categoria_renomear", {"id": id_, "nome": f"{m} invasão"}), ("categoria_excluir", {"id": id_})):
            st, r = R.chamar(R.tn, acao, corpo)
            db = R.linha("categorias_financeiras", id_, "nome, deleted_at is null as viva") or {}
            o.ok(st == 404 and db == {"nome": f"{m} cat 2", "viva": True}, f"N1 {acao} da categoria da personal → 404 e nada muda ({st})")
    st, r = R.chamar(R.tt, "categoria_excluir", {"id": id_})
    o.ok(st == 200 and (R.linha("categorias_financeiras", id_, "deleted_at is not null as lixeira") or {}).get("lixeira"), f"P categoria_excluir → 200: a Lixeira ({st})")


def caso_modelo(R: RodadaFinanceiro, casos: list[str]) -> None:
    """P (criar, editar, excluir) + N1."""
    o, m = R.o, R.m
    st, r = R.chamar(R.tt, "modelo_recibo_criar", {"conta_id": R.conta, "titulo": f"{m} modelo", "conteudo": "Recibo nº *|NUMERO_RECIBO|*", "favorito": False})
    linha = r.get("linha") or {}
    id_ = linha.get("id")
    if C.eh_uuid(id_):
        R.e.linha_fin("modelos_recibo", id_, R.ut)
    o.ok(st == 200 and set(linha) == {"id", "nutricionista_id", "titulo", "conteudo", "favorito"} and linha.get("nutricionista_id") == R.ut,
         f"P modelo_recibo_criar → 200 (a volta com as 5 colunas de hoje) ({st} {r.get('erro')})")
    st, r = R.chamar(R.tt, "modelo_recibo_editar", {"id": id_, "favorito": True})
    o.ok(st == 200 and (R.linha("modelos_recibo", id_, "favorito") or {}).get("favorito") is True, f"P modelo_recibo_editar → 200 (★) ({st})")
    if "N1" in casos:
        for acao, corpo in (("modelo_recibo_editar", {"id": id_, "titulo": f"{m} invasão"}), ("modelo_recibo_excluir", {"id": id_})):
            st, r = R.chamar(R.tn, acao, corpo)
            db = R.linha("modelos_recibo", id_, "titulo, deleted_at is null as viva") or {}
            o.ok(st == 404 and db == {"titulo": f"{m} modelo", "viva": True}, f"N1 {acao} do modelo da personal → 404 e nada muda ({st})")
    st, r = R.chamar(R.tt, "modelo_recibo_excluir", {"id": id_})
    o.ok(st == 200 and (R.linha("modelos_recibo", id_, "deleted_at is not null as lixeira") or {}).get("lixeira"), f"P modelo_recibo_excluir → 200: a Lixeira ({st})")


def caso_tags(R: RodadaFinanceiro, casos: list[str]) -> None:
    """P (as tags da aluna: só as tags mudam — as colunas de cobrança não, nem com elas no corpo) + N1 (404, nada muda); as tags voltam."""
    o, s, m = R.o, R.s, R.m
    foto = B.B17.ler(B.sql_foto_cobranca(s, R.pac))[0]
    originais = lista_pg(foto["tags"])
    R.e.d["tags_originais"] = originais
    R.e.d["cobranca_antes"] = {k: foto[k] for k in B.COLUNAS_COBRANCA}
    R.e.salvar()
    novas = originais + [m]
    st, r = R.chamar(R.tt, "tags_salvar", {"paciente_id": R.pac, "tags": novas, "mensalidade_valor": 1, "plano_modalidade": "anual", "cobranca_pausada": True})
    depois = B.B17.ler(B.sql_foto_cobranca(s, R.pac))[0]
    o.ok(st == 200 and lista_pg(depois["tags"]) == novas and {k: depois[k] for k in B.COLUNAS_COBRANCA} == R.e.d["cobranca_antes"],
         f"P tags_salvar → 200: as tags da aluna mudam e as colunas de cobrança não (nem com elas no corpo — N5) ({st} {r.get('erro')})")
    if "N1" in casos:
        st, r = R.chamar(R.tn, "tags_salvar", {"paciente_id": R.pac, "tags": ["invasão"]})
        o.ok(st == 404 and r.get("erro") == "nao_encontrado" and lista_pg(B.B17.ler(B.sql_foto_cobranca(s, R.pac))[0]["tags"]) == novas,
             f"N1 outra conta: salvar as tags da aluna → 404 e nada muda ({st})")
    st, r = R.chamar(R.tt, "tags_salvar", {"paciente_id": R.pac, "tags": originais})
    voltou = lista_pg(B.B17.ler(B.sql_foto_cobranca(s, R.pac))[0]["tags"]) == originais
    o.ok(st == 200 and voltou, f"P as tags voltam às de antes ({len(originais)} tag(s)) ({st})")
    if voltou:
        R.e.d["tags_originais"] = None
        R.e.salvar()


def caso_n2_n3_n6_n7(R: RodadaFinanceiro, casos: list[str]) -> None:
    o = R.o
    if "N2" in casos:
        st, _r, _h, _ms = B.funcao_fin(None, "transacao_criar", corpo_transacao(R.m, None, R.conta), sem_auth=True)
        st2, _r2, _h2, _ms2 = B.funcao_fin("x" * 40, "transacao_criar", corpo_transacao(R.m, None, R.conta))
        o.ok(st == 401 and st2 == 401, f"N2 sem login → 401; token falso → 401 ({st}, {st2})")
    if "N3" in casos:
        st, r, _h, _ms = B.funcao_fin(R.tt, "transacao_apagar_tudo", {})
        o.ok(st == 400 and r.get("erro") == "acao_invalida", f"N3 ação desconhecida → 400 acao_invalida ({st})")
    if "N6" in casos:
        st, r, _h, _ms = B.funcao_fin(R.tt, "transacao_excluir", {"id": FALSO}, schema_="producao")
        o.ok(st == 400 and r.get("erro") == "schema_invalido", f"N6 x-schema inválido → 400 schema_invalido ({st})")
    if "N7" in casos:
        st1, h1 = B.preflight_fin(B.ORIGEM_FORA)
        st2, h2 = B.preflight_fin(B.BASES["staging"])
        o.ok(st1 in (200, 204) and B.cors(h1) == B.ORIGEM_PADRAO and st2 in (200, 204) and B.cors(h2) == B.BASES["staging"],
             f"N7 origem fora da lista → o CORS padrão; a do staging volta igual ({st1}, {st2})")


def limpar(o, estado: B.Estado, L, s: str) -> None:
    """Desfaz o que a rodada criou e confere por SQL só leitura (só contagem): as tags da aluna voltam (pela função, como a personal; senão
    por SQL); as linhas de cada dono por id; o que foi marcado como excluído para semear volta a ficar vivo; a conferência."""
    if estado.vazio():
        o.ok(True, "limpeza: nada pendente no estado")
        estado.apagar()
        return
    pac = B.B17.matricula_da_aluna()
    originais = estado.d.get("tags_originais")
    if originais is not None:
        st, _r, _h, _ms = B.funcao_fin(L.token(T_CONTA), "tags_salvar", {"paciente_id": pac, "tags": originais})
        if st != 200:
            lista = ", ".join(C.txt(x) for x in originais)
            C.C2.sql_principal(f"update {s}.pacientes set tags = array[{lista}]::text[] where id = {C.txt(C.uuid_ok(pac))}" if originais else
                               f"update {s}.pacientes set tags = '{{}}'::text[] where id = {C.txt(C.uuid_ok(pac))}")
        o.ok(lista_pg(B.B17.ler(B.sql_foto_cobranca(s, pac))[0]["tags"]) == list(originais), f"limpeza: as tags da aluna voltaram às de antes ({st})")
        estado.d["tags_originais"] = None
        estado.salvar()
    for sql in B.sql_apagar_linhas_fin(s, estado.d.get("fin") or []):
        C.C2.sql_principal(sql)
    estado.d["fin"] = []
    estado.salvar()
    for sql in B.sql_restaurar_fin(s, estado.d.get("restaurar") or []):
        C.C2.sql_principal(sql)
    estado.d["restaurar"] = []
    estado.salvar()
    rodada = estado.d.get("rodada")
    sobra = B.B17.ler(B.sql_contar_marca_fin(s, rodada))[0] if rodada else {}
    o.ok(rodada and not any(sobra.values()), f"limpeza conferida (SQL só leitura): 0 linha com a marca da rodada nas 4 tabelas do Financeiro ({sum(sobra.values()) if sobra else '?'})")
    sem = estado.d.get("semente") or {}
    if C.eh_uuid(sem.get("uid")):
        vivos = B.B17.ler(B.sql_vivos_fin(s, sem["uid"]))[0]
        o.ok(vivos == sem.get("antes"), f"limpeza conferida: a conta da semente com as mesmas categorias e modelos vivos de antes ({vivos} × {sem.get('antes')})")
    antes = estado.d.get("cobranca_antes")
    if antes:
        foto = B.B17.ler(B.sql_foto_cobranca(s, pac))[0]
        o.ok({k: foto[k] for k in B.COLUNAS_COBRANCA} == antes, "limpeza conferida: as colunas de cobrança da aluna iguais às de antes")
    estado.apagar()


def so_leitura(o, L, base: str = "prod") -> None:
    """SÓ LEITURA (produção ou staging): nada grava — a função recusa antes de qualquer banco (CORS, sem login, x-schema inválido, ação
    desconhecida). No staging, o token é o da personal de TESTE; na produção, o da conta de teste da produção."""
    st1, h1 = B.preflight_fin(B.ORIGEM_FORA)
    o.ok(st1 in (200, 204) and B.cors(h1) == B.ORIGEM_PADRAO, f"{base} N7: origem fora da lista → o CORS padrão ({st1})")
    st, _r, _h, _ms = B.funcao_fin(None, "transacao_criar", {}, sem_auth=True, origem=B.BASES[base])
    o.ok(st == 401, f"{base} N2: sem login → 401 ({st})")
    token = L.token(B.PROD_CONTA if base == "prod" else T_CONTA)
    st, r, _h, _ms = B.funcao_fin(token, "transacao_excluir", {"id": FALSO}, schema_="producao", origem=B.BASES[base])
    o.ok(st == 400 and r.get("erro") == "schema_invalido", f"{base} N6: x-schema inválido → 400 ({st})")
    st, r, _h, _ms = B.funcao_fin(token, "transacao_apagar_tudo", {}, origem=B.BASES[base])
    o.ok(st == 400 and r.get("erro") == "acao_invalida", f"{base} N3: ação desconhecida → 400 acao_invalida ({st})")


def rodar(o, L, estado: B.Estado, rodada: str, casos: list[str]) -> None:
    R = RodadaFinanceiro(o, L, estado, rodada)
    o.linha(f"rodada {rodada} · schema {R.s} · área financeiro · aluna (matrícula) {R.pac[:8]}… · conta {R.conta[:8]}… · casos {','.join(casos)}")
    if {"P", "N8"} & set(casos):
        caso_semente(R, casos)
    if {"P", "N1", "N4", "N5", "N9"} & set(casos):
        tx = caso_movimentacao(R, casos)
        caso_recibo(R, casos, tx)
    if {"P", "N1"} & set(casos):
        caso_categoria(R, casos)
        caso_modelo(R, casos)
    if {"P", "N1", "N5"} & set(casos):
        caso_tags(R, casos)
    if {"N2", "N3", "N6", "N7"} & set(casos):
        caso_n2_n3_n6_n7(R, casos)
    tempos = {k: f"{min(v)}–{max(v)} ms (n={len(v)})" for k, v in sorted(R.tempos.items())}
    o.linha(f"tempos por ação (decisão K): {tempos}")
