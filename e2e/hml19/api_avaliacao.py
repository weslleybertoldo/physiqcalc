"""Physiq hml-19c (H-41 · jeito 2 · decisão 15, 11/10/2026) — os casos de SERVIDOR da Avaliação (o api.py chama: --area avaliacao). O
mesmo molde das áreas da 19a/19b: a foto do estado, --limpar, --seco; massa "hml19 e2e <rodada> …" SÓ no schema staging, SÓ nas contas
de TESTE; o que a rodada cria vai para o estado (agente/e2e_estado.json, com a área) e sai no fim (ou no --limpar, se a rodada caiu):
as linhas do principal por id (DELETE no staging, só do dono de teste), a foto mensal pela própria função (foto_excluir) ou, no
--limpar, por SQL (só o aluno de teste e só o mês SENTINELA), os arquivos pelo Storage (como o dono da pasta) e os avisos por id.

Contas (staging): T = w5p-personal (a personal da w5p-aluna — a foto mensal, no Treino, com a sessão do Treino da MESMA troca do app);
P = w5p-nutri (a nutri da w5p-aluna — antropometria, foto de evolução e o aviso, no principal); N1 = w13-dono (OUTRA conta).
Decisão H: o Storage é um só para staging e produção — a foto mensal vai no MÊS SENTINELA 2000-01 (nenhuma foto real usa), com uma imagem
sintética (JPEG 16 × 16 cinza, gerada aqui); antes de subir, o SQL só leitura confere 0 linha daquele aluno/mês nos 2 schemas.
  P   Treino: foto_preparar → o PUT no link assinado → foto_salvar (a linha e o arquivo); o "trocar" (o mesmo mês/tipo de novo: o upsert,
      a MESMA linha); foto_excluir (a linha sai e DEPOIS o arquivo: 0 linha / 0 arquivo). Principal: antropometria criar/editar/excluir
      (o dono = quem chama; a Lixeira); a foto de evolução preparar → PUT → registrar (a linha com o tamanho que chegou; o arquivo no
      bucket) → editar → excluir (a Lixeira e o arquivo fora); o aviso "avaliação nova" (1 aviso no sino da aluna; o 2º em 10 min não
      repete)
  N1  outra conta: foto_preparar/foto_salvar/foto_excluir do aluno → 403 forbidden e nada muda; antropometria_criar para a aluna → 403;
      editar/excluir a da P → 404 e a linha não muda; a foto de evolução: o link sai na pasta DELE (a policy do bucket só olha a 1ª pasta),
      mas o registrar → 403 e o servidor tira o arquivo (0 objeto); o aviso → 403 e nenhum aviso novo
  N2  sem login → 401 (as 2 funções) · N3 ação desconhecida → 400 (acao_invalida · invalid_action)
  N4  nutricionista_id de outra pessoa no corpo → ignorado · N5 deleted_at/id/created_at no corpo → ignorados
  N6  x-schema inválido → 400 schema_invalido (as 2 funções; na foto mensal a recusa vem ANTES do login)
  N7  origem fora da lista → o CORS padrão de cada função (nutricao: https://physiqcalc.com.br; admin-avaliacoes: https://physiqcalc.vercel.app)
  N8  2 foto_salvar iguais ao MESMO tempo → 1 linha só
  N9  o caminho de outro aluno/outra pasta → recusa (foto_salvar 403 forbidden; foto_evolucao_registrar 403 fora_da_pasta); mês e tipo
      inválidos → 400 (mes_invalido, tipo_invalido); o caminho certo sem o arquivo → 404 arquivo_ausente / 400 arquivo_nao_encontrado
Decisão J: a admin-avaliacoes é lenta (p50 3,5 s; fria até ~10 s) — cada chamada espera até 45 s e o tempo de cada ação sai no fim.
Produção (--base prod --so-leitura): OPTIONS (o CORS das 2), sem login → 401, x-schema inválido → 400, ação desconhecida → 400 — nada grava.
Da saída só saem status, códigos, contagens e tempos.
"""
from __future__ import annotations

import datetime as dt
import threading
import time

import _base as B

C = B.C
FALSO = "00000000-0000-4000-8000-0000000000aa"
OUTRO = "44444444-4444-4444-8444-444444444444"
CASOS_AVALIACAO = ("P", "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9")
TIPO_P, TIPO_SEM_ARQUIVO = "frente", "costas"


def hoje() -> str:
    return dt.date.today().isoformat()


def agora() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


# ───────────────────────── os pedidos (puros: o --seco confere todos) ─────────────────────────
def corpo_antropometria(m: str, pac: str | None = None, observacao: str = "antropometria") -> dict:
    """As 10 colunas que a tela grava (o colunas(r) de antropometrias.ts), com a marca na observação."""
    c = {"data": agora(), "peso": 70.4, "altura": 172.5, "sexo": "feminino", "idade": 35, "protocolo": "nenhum",
         "circunferencias": {"cintura": 72.5}, "dobras": {}, "resultados": {"imc": 23.66, "classificacao_imc": "Eutrofia"},
         "observacao": f"{m} {observacao}"}
    return {"paciente_id": pac, **c} if pac else c


def pedido_foto_evolucao(rodada: str, pac: str, tamanho: int) -> dict:
    return {"paciente_id": pac, "nome": f"hml19-e2e-{rodada}.jpg", "tipo": "image/jpeg", "tamanho": tamanho}


def corpo_registro_evolucao(rodada: str, pac: str, tamanho: int, caminho: str, m: str) -> dict:
    return {**pedido_foto_evolucao(rodada, pac, tamanho), "caminho": caminho, "posicao": "frente", "data": hoje(), "observacao": f"{m} foto"}


def pedidos_avaliacao(rodada: str, pac: str, eu: str) -> list[tuple[str, dict]]:
    """Todos os pedidos da nutricao na rodada (o --seco confere cada um contra as regras do servidor)."""
    m = f"{B.MARCA} {rodada}"
    caminho = f"{eu}/{pac}/{FALSO}-hml19-e2e-{rodada}.jpg"
    return [
        ("antropometria_criar", corpo_antropometria(m, pac)),
        ("antropometria_editar", {"id": FALSO, **corpo_antropometria(m, None, "antropometria editada"), "peso": 70.9}),
        ("antropometria_excluir", {"id": FALSO}),
        ("foto_evolucao_preparar", pedido_foto_evolucao(rodada, pac, 600)),
        ("foto_evolucao_registrar", corpo_registro_evolucao(rodada, pac, 600, caminho, m)),
        ("foto_evolucao_editar", {"id": FALSO, "posicao": "lado_d", "observacao": f"{m} foto editada"}),
        ("foto_evolucao_excluir", {"id": FALSO}),
        ("avaliacao_avisar", {"alunoId": pac}),
    ]


def pedidos_treino(aluno: str, mes: str = B.MES_SENTINELA) -> list[tuple[str, dict]]:
    """Todos os pedidos da admin-avaliacoes na rodada (a foto mensal; o --seco confere contra o admin-avaliacoes/regras.ts)."""
    caminho = f"{aluno}/{mes}/{TIPO_P}.jpg"
    return [
        ("foto_preparar", {"userId": aluno, "mes": mes, "tipo": TIPO_P}),
        ("foto_salvar", {"userId": aluno, "mes": mes, "tipo": TIPO_P, "caminho": caminho}),
        ("foto_excluir", {"fotoId": FALSO}),
    ]


def cors_padrao_da_admin_avaliacoes() -> str:
    """O padrão do CORS da admin-avaliacoes, lido do código (corsHeaders): é o que o N7 espera."""
    texto = (B.REPO / "supabase" / "functions" / "admin-avaliacoes" / "index.ts").read_text(encoding="utf-8")
    trecho = texto.split("function corsHeaders", 1)[1].split("return", 1)[0]
    achado = [x for x in trecho.split('"') if x.startswith("https://")]
    return achado[0] if achado else ""


# ───────────────────────── o --seco ─────────────────────────
def seco(o, area: str) -> None:
    rodada, pac, eu = "seco-0000", "11111111-1111-4111-8111-111111111111", "33333333-3333-4333-8333-333333333333"
    aluno = "aaaaaaaa-0000-4000-8000-000000000001"
    r0 = B.regras([], eu)
    acoes = set(r0["acoes_avaliacao"])
    o.ok(len(acoes) == 8 and set(r0["tabelas_avaliacao"]) == {"antropometrias", "fotos_evolucao"} == B.TABELAS_AVALIACAO,
         f"as regras da nutricao lidas do TS: {len(acoes)} ações da Avaliação, as 2 tabelas (as mesmas da contagem)")
    pedidos = pedidos_avaliacao(rodada, pac, eu)
    feitas = {a for a, _ in pedidos}
    o.ok(feitas == acoes, f"a rodada passa por TODAS as {len(acoes)} ações da Avaliação na nutricao" + ("" if feitas == acoes else f" — faltam {sorted(acoes - feitas)}"))
    r = B.regras(pedidos, eu)
    ruins = [f"{x['acao']} ({x['erro']} {x['campo'] or ''})" for x in r["conferidos"] if not x["ok"]]
    o.ok(not ruins, f"os {len(pedidos)} pedidos da nutricao passam nas regras do servidor" + (f" — recusados: {ruins}" if ruins else ""))
    fora = sorted({x["acao"] for x in r["conferidos"] if x["modulo"] != "avaliacao"})
    o.ok(not fora, "todos vão ao módulo avaliacao.ts da função (nenhum ao Prontuário/Dieta/app)" + (f" — {fora}" if fora else ""))
    # N3, N4, N5 e N9 nas regras da nutricao
    n = B.regras([("avaliacao_apagar_tudo", {}), ("antropometria_criar", {**corpo_antropometria("x", pac), "nutricionista_id": OUTRO}),
                  ("antropometria_criar", {**corpo_antropometria("x", pac), "deleted_at": "2020-01-01T00:00:00Z", "id": OUTRO, "created_at": agora()}),
                  ("foto_evolucao_registrar", corpo_registro_evolucao(rodada, pac, 600, f"{OUTRO}/{pac}/{FALSO}-a.jpg", "x")),
                  ("foto_evolucao_preparar", {**pedido_foto_evolucao(rodada, pac, 10), "tipo": "image/heic"})], eu)
    c3, c4, c5, c9, ct = n["conferidos"]
    o.ok(not c3["ok"] and c3["erro"] == "acao_invalida" and c3["modulo"] is None, "N3 nas regras: ação desconhecida → acao_invalida (nenhum módulo)")
    o.ok(c4["ok"] and c4["valores"]["nutricionista_id"] == eu, "N4 nas regras: o nutricionista_id do corpo cai; o dono é quem chama")
    o.ok(c5["ok"] and not {"deleted_at", "id", "created_at"} & set(c5["valores"]), "N5 nas regras: deleted_at/id/created_at do corpo caem")
    o.ok(not c9["ok"] and c9["erro"] == "fora_da_pasta", "N9 nas regras: a foto de evolução com o caminho de outra pasta → fora_da_pasta")
    o.ok(not ct["ok"] and ct["erro"] == "tipo_invalido", "a foto de evolução só aceita JPEG/PNG/WebP (heic → tipo_invalido)")
    # a foto mensal: os pedidos e o N9 nas regras da admin-avaliacoes (o Treino)
    t = B.regras_treino(pedidos_treino(aluno) + [
        ("foto_salvar", {"userId": aluno, "mes": B.MES_SENTINELA, "tipo": TIPO_P, "caminho": f"{OUTRO}/{B.MES_SENTINELA}/{TIPO_P}.jpg"}),
        ("foto_preparar", {"userId": aluno, "mes": "2000-13", "tipo": TIPO_P}),
        ("foto_preparar", {"userId": aluno, "mes": B.MES_SENTINELA, "tipo": "lateral"}),
        ("foto_apagar_tudo", {}), ("list", {"userId": aluno})])
    ok3 = t["conferidos"][:3]
    o.ok(all(x["ok"] and x["grava"] for x in ok3) and ok3[0]["caminho"] == f"{aluno}/{B.MES_SENTINELA}/{TIPO_P}.jpg",
         f"os 3 pedidos da foto mensal passam nas regras do Treino (gravam: sessão no GoTrue) e o caminho é o do servidor ({ok3[0]['caminho']})")
    n9, mes, tipo, desc, lista = t["conferidos"][3:]
    o.ok(not n9["ok"] and n9["erro"] == "forbidden" and n9["status"] == 403, "N9 nas regras do Treino: o caminho de OUTRO aluno → 403 forbidden")
    o.ok((mes["erro"], mes["status"], tipo["erro"], tipo["status"]) == ("mes_invalido", 400, "tipo_invalido", 400), "mês e tipo inválidos → 400 (mes_invalido, tipo_invalido)")
    o.ok(desc["erro"] == "invalid_action" and lista["ok"] and not lista["grava"], "N3 no Treino: ação desconhecida → invalid_action; a list segue leitura")
    o.ok(t["status"].get("arquivo_ausente") == 404 and t["status"].get("schema_invalido") == 400 and t["status"].get("forbidden") == 403,
         "os status que o E2E espera são os do servidor (arquivo_ausente 404, schema_invalido 400, forbidden 403)")
    o.ok(set(t["tipos"]) >= {TIPO_P, TIPO_SEM_ARQUIVO}, "os tipos do E2E (frente, costas) estão na lista do servidor")
    o.ok(cors_padrao_da_admin_avaliacoes() == B.ORIGEM_PADRAO_TREINO, f"N7: o CORS padrão da admin-avaliacoes é o do código ({cors_padrao_da_admin_avaliacoes()})")
    # a limpeza e a conferência
    sqls = B.sql_apagar_linhas("staging", [["antropometrias", FALSO], ["fotos_evolucao", FALSO]], eu)
    o.ok(len(sqls) == 2 and all("nutricionista_id = '" in s and "staging." in s for s in sqls), "a limpeza do principal: por tabela, só o dono de teste e os ids")
    t_sql = B.sql_apagar_fotos_treino("staging", aluno, [FALSO])
    o.ok("user_id = '" in t_sql and f"'{B.MES_SENTINELA}-01'::date" in t_sql and "staging.physiq_registros_fotos" in t_sql,
         "a limpeza do Treino: só o aluno de teste, só o mês sentinela, só os ids da rodada")
    recusas = 0
    for f in (lambda: B.sql_apagar_fotos_treino("public", aluno, [FALSO]), lambda: B.sql_apagar_fotos_treino("staging", aluno, []),
              lambda: B.sql_apagar_avisos("public", aluno, [FALSO]), lambda: B.sql_apagar_linhas("public", [["antropometrias", FALSO]], eu)):
        try:
            f()
        except SystemExit:
            recusas += 1
    o.ok(recusas == 4, "a limpeza recusa outro schema que não o staging (e o DELETE sem id)")
    o.ok(B.sql_contar_marca_avaliacao("staging", rodada).count(" as ") == 2 and B.sql_contar_sentinela("public", aluno).count("2000-01-01") == 1,
         "a conferência final: a marca nas 2 tabelas do principal e o mês sentinela no Treino (só leitura, os 2 schemas)")
    jpg = B.jpeg_sintetico()
    o.ok(jpg[:3] == b"\xff\xd8\xff" and len(jpg) < 2000, f"a imagem de teste é sintética e pequena (JPEG, {len(jpg)} bytes)")
    # hml-19d: o registro passou a ser o da W seguinte (logins_etapa2_19d.txt) — aqui, que é o de uma W da hml-19 a partir da 19c;
    # hml-20a: o da hml-20a (hml20/agente/logins_etapa2_20a.txt); hml-20b: o da hml-20b (logins_etapa2_20b.txt); hml-20c: logins_etapa2_20c.txt
    o.ok(B.REG_LOGINS.name in ("logins_etapa2_19c.txt", "logins_etapa2_19d.txt", "logins_etapa2_20a.txt", "logins_etapa2_20b.txt", "logins_etapa2_20c.txt"),
         f"o registro de logins da W (decisão G): {B.REG_LOGINS.parent.parent.name}/agente/{B.REG_LOGINS.name}")


# ───────────────────────── a rodada no staging ─────────────────────────
class RodadaAvaliacao:
    def __init__(self, o, L, estado: B.Estado, rodada: str) -> None:
        self.o, self.L, self.e, self.rodada = o, L, estado, rodada
        self.s = B.schema()
        self.m = f"{B.MARCA} {rodada}"
        self.tp, self.tn = L.token(B.P_CONTA), L.token(B.N1_CONTA)
        self.up, self.un = L.uid(B.P_CONTA), L.uid(B.N1_CONTA)
        self.pac = B.B17.matricula_da_aluna()
        self.tempos: dict[str, list[int]] = {}

    def treino(self) -> None:
        """As sessões do Treino (a personal e a outra conta) e o aluno da foto mensal: o aluno de TESTE da personal de teste no staging do
        Treino (professor_id = ela, e-mail de teste no Auth do Treino — SQL só leitura; sem ele, PARA: não cria vínculo nem conta). Etapa 2
        (11/10): a matrícula da w5p-aluna não tem usuário do Treino; a w5p-personal tem 1 aluno de teste só no Treino — é ele. O aviso
        segue na w5p-aluna (o usuário dela no principal)."""
        self.tt, self.ut = self.L.token_treino(B.PERSONAL_CONTA), self.L.uid_treino(B.PERSONAL_CONTA)
        mat = B.B17.ler(f"select user_id::text as u from {self.s}.pacientes where id = {C.txt(self.pac)}")
        self.aluna_user = (mat[0]["u"] if mat else "") or ""
        alunos = B.ler_treino(f"select p.id::text as id from {self.s}.physiq_profiles p join auth.users u on u.id = p.id "
                              f"where p.professor_id = {C.txt(C.uuid_ok(self.ut))} and lower(u.email) like '%.teste.claude@physiqnutri.app' "
                              f"order by p.id limit 1") if C.eh_uuid(self.ut) else []
        self.aluno = alunos[0]["id"] if alunos else ""
        self.o.ok(C.eh_uuid(self.aluno), f"a personal de teste tem um aluno de TESTE no Treino (staging; e-mail de teste) — {self.aluno[:8]}…", parar=True)

    def chamar(self, token: str, acao: str, corpo: dict) -> tuple[int, dict]:
        st, r, _h, ms = B.funcao(token, acao, corpo)
        self.tempos.setdefault(acao, []).append(ms)
        return st, r

    def chamar_treino(self, token: str, action: str, corpo: dict) -> tuple[int, dict]:
        st, r, _h, ms = B.funcao_treino(token, action, corpo)
        self.tempos.setdefault(action, []).append(ms)
        return st, r

    def linha(self, tabela: str, id_: object, colunas: str) -> dict | None:
        if not C.eh_uuid(id_):
            return None
        r = B.B17.ler(f"select {colunas} from {self.s}.{tabela} where id = {C.txt(id_)}")
        return r[0] if r else None

    def objetos(self, bucket: str, caminho: str, treino: bool = False) -> int:
        sql = f"select count(*)::int as n from storage.objects where bucket_id = {C.txt(bucket)} and name = {C.txt(caminho)}"
        r = B.ler_treino(sql) if treino else B.B17.ler(sql)
        return int(r[0]["n"]) if r else -1

    def fotos_sentinela(self) -> int:
        return int(B.ler_treino(B.sql_contar_sentinela(self.s, self.aluno))[0]["n"])


def caso_foto_mensal(R: RodadaAvaliacao, casos: list[str]) -> None:
    """P (Treino) + N8 + N9 (Treino) + N1 (Treino): a foto mensal no mês sentinela, do preparar ao excluir."""
    o, s, mes = R.o, R.s, B.MES_SENTINELA
    bucket = B.bucket_dos_registros(s)
    caminho = f"{R.aluno}/{mes}/{TIPO_P}.jpg"
    # decisão H: antes de subir, 0 linha daquele aluno/mês nos 2 schemas e 0 arquivo no caminho (o mês sentinela é só de teste)
    antes = {x: int(B.ler_treino(B.sql_contar_sentinela(x, R.aluno))[0]["n"]) for x in ("public", "staging")}
    o.ok(antes == {"public": 0, "staging": 0} and R.objetos(bucket, caminho, treino=True) == 0,
         f"antes de subir: 0 foto do aluno de teste no mês {mes} nos 2 schemas e 0 arquivo no caminho ({antes})", parar=True)
    st, link = R.chamar_treino(R.tt, "foto_preparar", {"userId": R.aluno, "mes": mes, "tipo": TIPO_P})
    if not o.ok(st == 200 and link.get("bucket") == bucket and link.get("caminho") == caminho and link.get("token"),
                f"P foto_preparar → 200 com o link assinado no bucket do ambiente e o caminho do servidor ({st} {link.get('error')})"):
        return
    R.e.objeto(bucket, caminho)
    st_put = B.subir_no_link_treino(bucket, caminho, link["token"], B.jpeg_sintetico(), "image/jpeg", R.tt)
    o.ok(st_put in (200, 201), f"P o PUT no link assinado do Storage do Treino → {st_put}")
    st, r = R.chamar_treino(R.tt, "foto_salvar", {"userId": R.aluno, "mes": mes, "tipo": TIPO_P, "caminho": caminho})
    foto = (r.get("foto") or {}).get("id")
    if C.eh_uuid(foto):
        R.e.linha_treino("physiq_registros_fotos", foto)
    db = B.ler_treino(f"select count(*)::int as n, max(storage_path) as p from {s}.physiq_registros_fotos where user_id = {C.txt(R.aluno)} "
                      f"and mes_ref = {C.txt(mes + '-01')}::date and tipo = {C.txt(TIPO_P)}")[0]
    o.ok(st == 200 and C.eh_uuid(foto) and db["n"] == 1 and db["p"] == caminho and R.objetos(bucket, caminho, treino=True) == 1,
         f"P foto_salvar → 200: 1 linha com o caminho do servidor e o arquivo no bucket ({st} {r.get('error')})")
    if not C.eh_uuid(foto):
        return
    # o "trocar": o mesmo mês/tipo de novo — o link com upsert sobrescreve e o upsert da linha mantém a MESMA linha
    st1, link2 = R.chamar_treino(R.tt, "foto_preparar", {"userId": R.aluno, "mes": mes, "tipo": TIPO_P})
    st_put2 = B.subir_no_link_treino(bucket, caminho, str(link2.get("token") or ""), B.jpeg_sintetico(tom=96), "image/jpeg", R.tt) if st1 == 200 else 0
    st2, r2 = R.chamar_treino(R.tt, "foto_salvar", {"userId": R.aluno, "mes": mes, "tipo": TIPO_P, "caminho": caminho})
    o.ok(st1 == 200 and st_put2 in (200, 201) and st2 == 200 and (r2.get("foto") or {}).get("id") == foto and R.fotos_sentinela() == 1,
         f"P trocar a foto (preparar → PUT por cima → salvar) → a MESMA linha, 1 só ({st1}, {st_put2}, {st2})")
    if "N8" in casos:
        respostas: list[tuple[int, dict]] = []

        def salvar() -> None:
            respostas.append(B.funcao_treino(R.tt, "foto_salvar", {"userId": R.aluno, "mes": mes, "tipo": TIPO_P, "caminho": caminho})[:2])
        fios = [threading.Thread(target=salvar) for _ in range(2)]
        for f in fios:
            f.start()
        for f in fios:
            f.join(B.TEMPO_TREINO_S + 15)
        o.ok(len(respostas) == 2 and all(x[0] == 200 for x in respostas) and R.fotos_sentinela() == 1,
             f"N8 2 foto_salvar iguais ao MESMO tempo → 1 linha só ({[x[0] for x in respostas]}, linhas {R.fotos_sentinela()})")
    if "N9" in casos:
        st, r = R.chamar_treino(R.tt, "foto_salvar", {"userId": R.aluno, "mes": mes, "tipo": TIPO_P, "caminho": f"{R.ut}/{mes}/{TIPO_P}.jpg"})
        o.ok(st == 403 and r.get("error") == "forbidden", f"N9 foto_salvar com o caminho de OUTRA pasta (outro aluno) → 403 forbidden ({st})")
        st, r = R.chamar_treino(R.tt, "foto_preparar", {"userId": R.aluno, "mes": "2000-13", "tipo": TIPO_P})
        o.ok(st == 400 and r.get("error") == "mes_invalido", f"N9 mês inválido → 400 mes_invalido ({st})")
        st, r = R.chamar_treino(R.tt, "foto_preparar", {"userId": R.aluno, "mes": mes, "tipo": "lateral"})
        o.ok(st == 400 and r.get("error") == "tipo_invalido", f"N9 tipo inválido → 400 tipo_invalido ({st})")
        st, r = R.chamar_treino(R.tt, "foto_salvar", {"userId": R.aluno, "mes": mes, "tipo": TIPO_SEM_ARQUIVO})
        o.ok(st == 404 and r.get("error") == "arquivo_ausente" and R.fotos_sentinela() == 1,
             f"N9 o caminho certo sem o arquivo → 404 arquivo_ausente e nenhuma linha nova ({st})")
    tnt = ""
    if "N1" in casos:
        try:
            tnt = R.L.token_treino(B.N1_CONTA)
        except SystemExit as e:  # a outra conta sem sessão do Treino nem chega à função: anota (não é a prova do escopo)
            o.ok(False, f"N1 (Treino): a outra conta não tem sessão do Treino pela troca do app ({str(e)[:120]}) — o escopo da foto mensal não foi provado")
    if tnt:
        st, r = R.chamar_treino(tnt, "foto_preparar", {"userId": R.aluno, "mes": mes, "tipo": TIPO_P})
        o.ok(st == 403 and r.get("error") in ("forbidden", "plano_vencido"), f"N1 outra conta: foto_preparar do aluno → 403 ({st} {r.get('error')})")
        st, r = R.chamar_treino(tnt, "foto_salvar", {"userId": R.aluno, "mes": mes, "tipo": TIPO_P, "caminho": caminho})
        o.ok(st == 403, f"N1 outra conta: foto_salvar → 403 ({st} {r.get('error')})")
        st, r = R.chamar_treino(tnt, "foto_excluir", {"fotoId": foto})
        o.ok(st == 403 and R.fotos_sentinela() == 1 and R.objetos(bucket, caminho, treino=True) == 1,
             f"N1 outra conta: foto_excluir da foto do aluno → 403 e a linha e o arquivo ficam ({st} {r.get('error')})")
    st, r = R.chamar_treino(R.tt, "foto_excluir", {"fotoId": foto})
    saiu = R.fotos_sentinela() == 0 and R.objetos(bucket, caminho, treino=True) == 0
    o.ok(st == 200 and saiu, f"P foto_excluir → 200: a linha sai e DEPOIS o arquivo (0 linha / 0 arquivo) ({st} {r.get('error')})")
    if saiu:
        R.e.d["treino"] = [x for x in R.e.d.get("treino") or [] if x[1] != foto]
        R.e.d["storage"] = [x for x in R.e.d["storage"] if x != [bucket, caminho]]
        R.e.salvar()


def caso_antropometria(R: RodadaAvaliacao, casos: list[str]) -> None:
    """P (criar/editar/excluir) + N4 + N5 + N1 (principal)."""
    o, m = R.o, R.m
    st, r = R.chamar(R.tp, "antropometria_criar", corpo_antropometria(m, R.pac))
    id_ = (r.get("linha") or {}).get("id")
    if C.eh_uuid(id_):
        R.e.linha("antropometrias", id_)
    db = R.linha("antropometrias", id_, "nutricionista_id::text as dono, paciente_id::text as pac, peso::float as peso, deleted_at is null as viva") or {}
    o.ok(st == 200 and db.get("dono") == R.up and db.get("pac") == R.pac and db.get("peso") == 70.4 and db.get("viva"),
         f"P antropometria_criar → 200: a linha com o dono = quem chama ({st} {r.get('erro')})")
    st, r = R.chamar(R.tp, "antropometria_editar", {"id": id_, **corpo_antropometria(m, None, "antropometria editada"), "peso": 70.9})
    db = R.linha("antropometrias", id_, "peso::float as peso, observacao") or {}
    o.ok(st == 200 and db.get("peso") == 70.9 and str(db.get("observacao", "")).endswith("editada"), f"P antropometria_editar → 200 ({st})")
    if "N4" in casos or "N5" in casos:
        falso_id = "55555555-5555-4555-8555-555555555555"
        st, r = R.chamar(R.tp, "antropometria_criar", {**corpo_antropometria(m, R.pac, "N4 N5"), "nutricionista_id": R.un, "deleted_at": agora(),
                                                       "id": falso_id, "created_at": "2001-01-01T00:00:00Z"})
        n45 = (r.get("linha") or {}).get("id")
        if C.eh_uuid(n45):
            R.e.linha("antropometrias", n45)
        db = R.linha("antropometrias", n45, "nutricionista_id::text as dono, deleted_at is null as viva, created_at > now() - interval '1 day' as hoje") or {}
        o.ok(st == 200 and n45 != falso_id and db.get("dono") == R.up and db.get("viva") and db.get("hoje"),
             f"N4/N5 nutricionista_id de outra pessoa, deleted_at, id e created_at no corpo → ignorados (o dono é quem chama) ({st})")
        if C.eh_uuid(n45):
            R.chamar(R.tp, "antropometria_excluir", {"id": n45})
    if "N1" in casos:
        st, r = R.chamar(R.tn, "antropometria_criar", corpo_antropometria(m, R.pac, "N1"))
        if (r.get("linha") or {}).get("id"):
            R.e.linha("antropometrias", r["linha"]["id"])
        o.ok(st == 403 and r.get("erro") == "sem_acesso", f"N1 outra conta: antropometria_criar para a aluna → 403 sem_acesso ({st})")
        st, r = R.chamar(R.tn, "antropometria_editar", {"id": id_, "peso": 99.9})
        db = R.linha("antropometrias", id_, "peso::float as peso") or {}
        o.ok(st == 404 and db.get("peso") == 70.9, f"N1 editar a antropometria da P → 404 e a linha não muda ({st})")
        st, r = R.chamar(R.tn, "antropometria_excluir", {"id": id_})
        db = R.linha("antropometrias", id_, "deleted_at is null as viva") or {}
        o.ok(st == 404 and db.get("viva") is True, f"N1 excluir a antropometria da P → 404 e a linha segue viva ({st})")
    st, r = R.chamar(R.tp, "antropometria_excluir", {"id": id_})
    db = R.linha("antropometrias", id_, "deleted_at is not null as lixeira") or {}
    o.ok(st == 200 and db.get("lixeira"), f"P antropometria_excluir → 200: a linha na Lixeira ({st})")


def caso_foto_evolucao(R: RodadaAvaliacao, casos: list[str]) -> None:
    """P (preparar → PUT → registrar → editar → excluir) + N9 + N1 (principal)."""
    o, s, m = R.o, R.s, R.m
    bucket = B.bucket_da_evolucao(s)
    jpg = B.jpeg_sintetico()
    st, link = R.chamar(R.tp, "foto_evolucao_preparar", pedido_foto_evolucao(R.rodada, R.pac, len(jpg)))
    caminho = str(link.get("caminho") or "")
    if not o.ok(st == 200 and link.get("bucket") == bucket and caminho.startswith(f"{R.up}/{R.pac}/") and link.get("token"),
                f"P foto_evolucao_preparar → 200 com o link no bucket do ambiente e o caminho na pasta de quem chama ({st} {link.get('erro')})"):
        return
    R.e.objeto(bucket, caminho)
    st_put = B.subir_no_link(bucket, caminho, link["token"], jpg, "image/jpeg", R.tp)
    o.ok(st_put in (200, 201), f"P o PUT no link assinado → {st_put}")
    st, r = R.chamar(R.tp, "foto_evolucao_registrar", corpo_registro_evolucao(R.rodada, R.pac, len(jpg), caminho, m))
    linha = r.get("linha") or {}
    if C.eh_uuid(linha.get("id")):
        R.e.linha("fotos_evolucao", linha["id"])
    o.ok(st == 200 and linha.get("path") == caminho and linha.get("nutricionista_id") == R.up and int(linha.get("tamanho") or 0) == len(jpg)
         and R.objetos(bucket, caminho) == 1, f"P foto_evolucao_registrar → 200: a linha (o tamanho que chegou) e o arquivo no bucket ({st} {r.get('erro')})")
    st, r = R.chamar(R.tp, "foto_evolucao_editar", {"id": linha.get("id"), "posicao": "lado_d", "observacao": f"{m} foto editada"})
    o.ok(st == 200 and (r.get("linha") or {}).get("posicao") == "lado_d", f"P foto_evolucao_editar → 200 (posição, observação) ({st})")
    if "N9" in casos:
        outro = f"{R.un}/{R.pac}/{FALSO}-hml19-e2e-{R.rodada}.jpg"
        st, r = R.chamar(R.tp, "foto_evolucao_registrar", corpo_registro_evolucao(R.rodada, R.pac, len(jpg), outro, m))
        o.ok(st == 403 and r.get("erro") == "fora_da_pasta", f"N9 registrar com o caminho de OUTRA pessoa → 403 fora_da_pasta ({st})")
        sem_arquivo = f"{R.up}/{R.pac}/{FALSO}-hml19-e2e-{R.rodada}.jpg"
        st, r = R.chamar(R.tp, "foto_evolucao_registrar", corpo_registro_evolucao(R.rodada, R.pac, len(jpg), sem_arquivo, m))
        o.ok(st == 400 and r.get("erro") == "arquivo_nao_encontrado", f"N9 o caminho certo sem o arquivo → 400 arquivo_nao_encontrado ({st})")
    if "N1" in casos:
        st, l1 = R.chamar(R.tn, "foto_evolucao_preparar", pedido_foto_evolucao(R.rodada, R.pac, len(jpg)))
        c1 = str(l1.get("caminho") or "")
        if st == 200 and c1:
            R.e.objeto(bucket, c1)
            B.subir_no_link(bucket, c1, l1["token"], jpg, "image/jpeg", R.tn)
            st, r = R.chamar(R.tn, "foto_evolucao_registrar", corpo_registro_evolucao(R.rodada, R.pac, len(jpg), c1, f"{m} N1"))
            if (r.get("linha") or {}).get("id"):
                R.e.linha("fotos_evolucao", r["linha"]["id"])
            sobrou = R.objetos(bucket, c1)
            o.ok(st == 403 and r.get("erro") == "sem_acesso" and sobrou == 0,
                 f"N1 outra conta: o link sai na pasta DELE, mas registrar a foto da aluna → 403 sem_acesso e o servidor tira o arquivo ({st}, {sobrou} objeto)")
            if sobrou == 0:
                R.e.d["storage"] = [x for x in R.e.d["storage"] if x != [bucket, c1]]
                R.e.salvar()
        else:
            o.ok(st == 403, f"N1 outra conta: foto_evolucao_preparar → {st}")
        st, r = R.chamar(R.tn, "foto_evolucao_excluir", {"id": linha.get("id")})
        viva = (R.linha("fotos_evolucao", linha.get("id"), "deleted_at is null as viva") or {}).get("viva")
        o.ok(st == 404 and viva is True and R.objetos(bucket, caminho) == 1, f"N1 excluir a foto da P → 404 e a linha e o arquivo ficam ({st})")
    st, r = R.chamar(R.tp, "foto_evolucao_excluir", {"id": linha.get("id")})
    db = R.linha("fotos_evolucao", linha.get("id"), "deleted_at is not null as lixeira") or {}
    saiu = R.objetos(bucket, caminho) == 0
    o.ok(st == 200 and db.get("lixeira") and saiu, f"P foto_evolucao_excluir → 200: a linha na Lixeira e DEPOIS o arquivo fora do bucket ({st})")
    if saiu:
        R.e.d["storage"] = [x for x in R.e.d["storage"] if x != [bucket, caminho]]
        R.e.salvar()


def caso_aviso(R: RodadaAvaliacao, casos: list[str]) -> None:
    """P (o aviso no sino da aluna; o 2º em 10 min não repete) + N1 (outra conta → 403, nenhum aviso novo)."""
    o, s = R.o, R.s
    if not C.eh_uuid(R.aluna_user):
        o.ok(False, "o aviso precisa da aluna com login (pacientes.user_id)")
        return
    desde = B.B17.ler("select now()::text as t")[0]["t"]

    def novos() -> list[str]:
        return [x["id"] for x in B.B17.ler(f"select id::text as id from {s}.avisos where destino_user_id = {C.txt(R.aluna_user)} "
                                           f"and tipo = 'avaliacao_nova' and criado_em >= {C.txt(desde)}::timestamptz")]
    st, r = R.chamar(R.tp, "avaliacao_avisar", {"alunoId": R.pac})
    ids = novos()
    for i in ids:
        R.e.aviso(i)
    o.ok(st == 200 and ((r.get("avisado") is True and len(ids) == 1) or (r.get("avisado") is False and not ids)),
         f"P avaliacao_avisar → 200 ({'avisado: 1 aviso no sino da aluna' if r.get('avisado') else 'já havia um não lido de < 10 min: nada novo'}) ({st} {r.get('erro')})")
    st, r = R.chamar(R.tp, "avaliacao_avisar", {"alunoId": R.pac})
    o.ok(st == 200 and r.get("avisado") is False and len(novos()) == len(ids), f"P o 2º aviso em 10 min não repete (avisado false, nada novo) ({st})")
    if "N1" in casos:
        st, r = R.chamar(R.tn, "avaliacao_avisar", {"alunoId": R.pac})
        o.ok(st == 403 and r.get("erro") == "sem_acesso" and len(novos()) == len(ids), f"N1 outra conta: avaliacao_avisar → 403 sem_acesso e nenhum aviso novo ({st})")


def caso_n2_n3_n6_n7(R: RodadaAvaliacao, casos: list[str]) -> None:
    o = R.o
    if "N2" in casos:
        st, _r, _h, _ms = B.funcao(None, "antropometria_criar", {"paciente_id": R.pac}, sem_auth=True)
        st2, _r2, _h2, _ms2 = B.funcao_treino(None, "foto_preparar", {"userId": R.aluno, "mes": B.MES_SENTINELA, "tipo": TIPO_P}, sem_auth=True)
        o.ok(st == 401 and st2 == 401, f"N2 sem login → 401 nas 2 funções ({st}, {st2})")
    if "N3" in casos:
        st, r, _h, _ms = B.funcao(R.tp, "avaliacao_apagar_tudo", {})
        st2, r2, _h2, _ms2 = B.funcao_treino(R.tt, "foto_apagar_tudo", {})
        o.ok(st == 400 and r.get("erro") == "acao_invalida" and st2 == 400 and r2.get("error") == "invalid_action",
             f"N3 ação desconhecida → 400 nas 2 funções (acao_invalida · invalid_action) ({st}, {st2})")
    if "N6" in casos:
        st, r, _h, _ms = B.funcao(R.tp, "antropometria_excluir", {"id": FALSO}, schema_="producao")
        st2, r2, _h2, _ms2 = B.funcao_treino(R.tt, "foto_excluir", {"fotoId": FALSO}, schema_="producao")
        st3, r3, _h3, _ms3 = B.funcao_treino(R.tt, "foto_excluir", {"fotoId": FALSO}, schema_="")
        o.ok(st == 400 and r.get("erro") == "schema_invalido" and st2 == 400 and r2.get("error") == "schema_invalido"
             and st3 == 400 and r3.get("error") == "schema_invalido",
             f"N6 x-schema inválido (ou ausente, na foto mensal) → 400 schema_invalido ({st}, {st2}, {st3})")
    if "N7" in casos:
        st1, h1 = B.preflight(B.ORIGEM_FORA)
        st2, h2 = B.preflight_treino(B.ORIGEM_FORA)
        st3, h3 = B.preflight_treino(B.BASES["staging"])
        o.ok(st1 in (200, 204) and B.cors(h1) == B.ORIGEM_PADRAO and st2 in (200, 204) and B.cors(h2) == B.ORIGEM_PADRAO_TREINO
             and B.cors(h3) == B.BASES["staging"], f"N7 origem fora da lista → o CORS padrão de cada função; a do staging volta igual ({st1}, {st2}, {st3})")


def limpar(o, estado: B.Estado, L, s: str) -> None:
    """Desfaz o que a rodada criou e confere por SQL só leitura (só contagem): a foto mensal pela função (ou, se não der, por SQL só do
    aluno de teste no mês sentinela) e o arquivo pelo Storage como a personal; as linhas do principal por id; os arquivos da evolução
    como o dono da pasta (a nutri; o do N1, como ele); os avisos por id."""
    if estado.vazio():
        o.ok(True, "limpeza: nada pendente no estado")
        estado.apagar()
        return
    dono = L.uid(B.P_CONTA)
    aluno = estado.d.get("aluno_treino") or ""  # a conferência do mês sentinela roda SEMPRE (mesmo com a foto já tirada pela função)
    if estado.d.get("treino") or any(b.startswith("registros") for b, _c in estado.d["storage"]):
        tt = L.token_treino(B.PERSONAL_CONTA)
        for _t, id_ in list(estado.d.get("treino") or []):
            st, _r, _h, _ms = B.funcao_treino(tt, "foto_excluir", {"fotoId": id_})
            if st != 200 and C.eh_uuid(aluno):
                C.C2.sql_mgmt(B.TREINO_REF, B.sql_apagar_fotos_treino(s, aluno, [id_]))
        estado.d["treino"] = []
        estado.salvar()
        registros = [c for b, c in estado.d["storage"] if b.startswith("registros")]
        if registros:
            st, n = B.remover_do_storage_treino(B.bucket_dos_registros(s), registros, tt)
            o.ok(st == 200, f"limpeza: {len(registros)} arquivo(s) da foto mensal tirados do bucket do Treino como a personal ({st}, {n})")
    evolucao = [c for b, c in estado.d["storage"] if b.startswith("evolucao")]
    if evolucao:
        un = L.uid(B.N1_CONTA)
        for conta, lista in ((B.P_CONTA, [c for c in evolucao if not c.startswith(f"{un}/")]), (B.N1_CONTA, [c for c in evolucao if c.startswith(f"{un}/")])):
            if lista:
                st, n = B.remover_do_storage(B.bucket_da_evolucao(s), lista, L.token(conta))
                o.ok(st == 200, f"limpeza: {len(lista)} arquivo(s) da evolução tirados do bucket como o dono da pasta ({st}, {n})")
    estado.d["storage"] = []
    estado.salvar()
    for sql in B.sql_apagar_linhas(s, estado.d["linhas"], dono):
        C.C2.sql_principal(sql)
    avisos = [i for i in estado.d.get("avisos") or [] if C.eh_uuid(i)]
    destino = estado.d.get("aluna_user") or ""
    if avisos and C.eh_uuid(destino):
        C.C2.sql_principal(B.sql_apagar_avisos(s, destino, avisos))
    rodada = estado.d.get("rodada")
    sobra = B.B17.ler(B.sql_contar_marca_avaliacao(s, rodada))[0] if rodada else {}
    o.ok(rodada and not any(sobra.values()), f"limpeza conferida (SQL só leitura): 0 linha com a marca da rodada nas 2 tabelas da Avaliação ({sum(sobra.values()) if sobra else '?'})")
    if C.eh_uuid(aluno):
        sent = {x: int(B.ler_treino(B.sql_contar_sentinela(x, aluno))[0]["n"]) for x in ("public", "staging")}
        objs = B.ler_treino(f"select count(*)::int as n from storage.objects where bucket_id = {C.txt(B.bucket_dos_registros(s))} "
                            f"and name like {C.txt(aluno + '/' + B.MES_SENTINELA + '/%')}")[0]["n"]
        o.ok(sent == {"public": 0, "staging": 0} and objs == 0, f"limpeza conferida: 0 foto mensal no mês sentinela (2 schemas) e 0 arquivo ({sent}, {objs})")
    marca_arquivo = f"%hml19-e2e-{rodada}%"
    objs = B.B17.ler(f"select count(*)::int as n from storage.objects where bucket_id = {C.txt(B.bucket_da_evolucao(s))} and name like {C.txt(marca_arquivo)}")[0]["n"]
    o.ok(objs == 0, f"limpeza conferida: 0 arquivo da rodada no bucket da evolução ({objs})")
    if avisos:
        resta = B.B17.ler(f"select count(*)::int as n from {s}.avisos where id = any(array[{', '.join(C.txt(i) for i in avisos)}]::uuid[])")[0]["n"]
        o.ok(resta == 0, f"limpeza conferida: os {len(avisos)} aviso(s) da rodada fora do sino da aluna de teste ({resta})")
    estado.apagar()


def so_leitura(o, L, base: str = "prod") -> None:
    """SÓ LEITURA (produção ou staging): nada grava — as 2 funções recusam antes de qualquer banco (CORS, sem login, x-schema inválido,
    ação desconhecida). A foto mensal: sem login → 401 e o x-schema inválido → 400 vêm antes do login (nenhuma sessão do Treino)."""
    st1, h1 = B.preflight(B.ORIGEM_FORA)
    st2, h2 = B.preflight_treino(B.ORIGEM_FORA)
    o.ok(st1 in (200, 204) and B.cors(h1) == B.ORIGEM_PADRAO and st2 in (200, 204) and B.cors(h2) == B.ORIGEM_PADRAO_TREINO,
         f"{base} N7: origem fora da lista → o CORS padrão das 2 funções ({st1}, {st2})")
    st, _r, _h, _ms = B.funcao(None, "antropometria_criar", {}, sem_auth=True, origem=B.BASES[base])
    st2, _r2, _h2, _ms2 = B.funcao_treino(None, "foto_preparar", {}, sem_auth=True, origem=B.BASES[base])
    o.ok(st == 401 and st2 == 401, f"{base} N2: sem login → 401 nas 2 funções ({st}, {st2})")
    st2, r2, _h2, _ms2 = B.funcao_treino(None, "foto_excluir", {"fotoId": FALSO}, sem_auth=True, schema_="producao", origem=B.BASES[base])
    o.ok(st2 == 400 and r2.get("error") == "schema_invalido", f"{base} N6: a foto mensal com x-schema inválido → 400 antes do login ({st2})")
    token = L.token(B.PROD_CONTA if base == "prod" else B.P_CONTA)
    st, r, _h, _ms = B.funcao(token, "antropometria_excluir", {"id": FALSO}, schema_="producao", origem=B.BASES[base])
    o.ok(st == 400 and r.get("erro") == "schema_invalido", f"{base} N6: x-schema inválido na nutricao → 400 ({st})")
    st, r, _h, _ms = B.funcao(token, "avaliacao_apagar_tudo", {}, origem=B.BASES[base])
    o.ok(st == 400 and r.get("erro") == "acao_invalida", f"{base} N3: ação desconhecida → 400 acao_invalida ({st})")


def producao(o, L) -> None:
    so_leitura(o, L, "prod")


def rodar(o, L, estado: B.Estado, rodada: str, casos: list[str]) -> None:
    R = RodadaAvaliacao(o, L, estado, rodada)
    R.treino()
    estado.d["aluno_treino"], estado.d["aluna_user"] = R.aluno, R.aluna_user
    estado.salvar()
    o.linha(f"rodada {rodada} · schema {R.s} · área avaliacao · aluna (matrícula) {R.pac[:8]}… · mês {B.MES_SENTINELA} · casos {','.join(casos)}")
    if {"P", "N1", "N8", "N9"} & set(casos):
        caso_foto_mensal(R, casos)
        caso_foto_evolucao(R, casos)
    if {"P", "N1", "N4", "N5"} & set(casos):
        caso_antropometria(R, casos)
    if {"P", "N1"} & set(casos):
        caso_aviso(R, casos)
    if {"N2", "N3", "N6", "N7"} & set(casos):
        caso_n2_n3_n6_n7(R, casos)
    tempos = {k: f"{min(v)}–{max(v)} ms (n={len(v)})" for k, v in sorted(R.tempos.items())}
    o.linha(f"tempos por ação (decisão J): {tempos}")
