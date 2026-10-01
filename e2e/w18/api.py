#!/usr/bin/env python3
"""Physiq W18 — E2E de SERVIDOR no staging: a regra do prontuário vale NO BANCO (PostgREST, função e Storage chamados direto, como
qualquer um chamaria a API), não só na tela. Contas de teste w13.* + a nutricionista descartável w18.nutri2.*; massa da
e2e/w18/massa.py (o prontuário do Rafael Moura).

  papeis    quem lê o quê: o personal responsável (Lucas, dono + personal sem papel de nutri) lê só as anotações "Equipe" — 0 nas
            "Só nutricionistas" e 0 em consulta/anamnese/questionário/exame/360/gestacional/fármaco/documento/anexo, e o arquivo do
            anexo é recusado; outro personal da conta (Bruno, não é do Rafael) não abre nada (P1); o próprio aluno não lê o
            prontuário; a nutricionista responsável (Camila) lê tudo e baixa o anexo pela URL assinada
  escrita   o personal escreve "Equipe" e NÃO grava "Só nutricionistas", não assina como nutricionista, não grava consulta nem
            anexo (tabela e arquivo); só o autor edita e exclui a anotação; a nutri muda a visibilidade da dela
  removida  a nutricionista REMOVIDA da equipe (W5) deixa de ler o que escreveu (anotação, consulta, anamnese, anexo e o arquivo) e
            a nova responsável lê, edita e apaga o que ela deixou
  bucket    as restritivas do Storage valem só para o bucket "anexos" (a foto do perfil continua subindo)

Uso: python3 e2e/w18/api.py [--so papeis,escrita,removida,bucket]
"""
from __future__ import annotations

import argparse
import contextlib
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p


@contextlib.contextmanager
def bloco(titulo: str):
    print(f"\n— {titulo}", flush=True)
    try:
        yield
    except AssertionError as e:
        p.check(False, f"{titulo}: {str(e)[:300]}")


def anotacoes(token: str, aluno: str) -> tuple[int, dict]:
    st, r = B.rpc(token, "aluno_anotacoes", {"p_aluno": aluno, "p_limite": None})
    return st, (r if isinstance(r, dict) else {"bruto": r})


def assinar(token: str, caminho: str) -> tuple[int, object]:
    return B.storage(token, "POST", f"object/sign/anexos/{caminho}", {"expiresIn": 60})


def baixar(token: str, caminho: str) -> tuple[int, object]:
    return B.storage(token, "GET", f"object/authenticated/anexos/{caminho}")


def recusado(st: int, r: object) -> bool:
    """A RLS recusou: PostgREST 401/403 (42501) · Storage 400/403/404 ("row-level security" / "Object not found")."""
    return st in (400, 401, 403, 404)


def bloco_papeis(m: dict) -> None:
    aluno, filtro = m["paciente"], f"paciente_id=eq.{m['paciente']}"
    tl, tb, tc, ta = B.token("w13-dono"), B.token("w13-personal2"), B.token("w13-nutri"), B.token("w13-aluno")
    with bloco("personal responsável (Lucas, dono + personal sem papel de nutri): só as anotações \"Equipe\""):
        p.check(B.n_linhas(tl, "registros_prontuario", filtro) == 3, "PostgREST: 3 anotações (as \"Equipe\")")
        p.check(B.n_linhas(tl, "registros_prontuario", f"{filtro}&visibilidade=eq.nutricionistas") == 0, "PostgREST: 0 \"Só nutricionistas\"")
        st, r = anotacoes(tl, aluno)
        vis = {a.get("visibilidade") for a in r.get("anotacoes", [])}
        p.check(st == 200 and r.get("total") == 3 and r.get("clinico") is False and vis == {"equipe"},
                f"função aluno_anotacoes: 3, nenhuma \"Só nutricionistas\", clinico=false ({st} {r.get('total')} {vis})")
        p.check([a.get("autor_nome") for a in r.get("anotacoes", [])] == ["Lucas Ferreira", "Camila Rocha", "Lucas Ferreira"],
                f"autores na linha do tempo, mais recente primeiro ({[a.get('autor_nome') for a in r.get('anotacoes', [])]})")
        for t in B.CLINICAS:
            p.check(B.n_linhas(tl, t, filtro) == 0, f"PostgREST: {t} = 0")
        st, r = assinar(tl, m["anexo_path"])
        p.check(recusado(st, r), f"Storage: URL assinada do anexo recusada ({st} {str(r)[:80]})")
        st, r = baixar(tl, m["anexo_path"])
        p.check(recusado(st, r), f"Storage: download do anexo recusado ({st})")
    with bloco("outro personal da conta (Bruno, não é do Rafael) e o próprio aluno: nada"):
        p.check(B.n_linhas(tb, "registros_prontuario", filtro) == 0 and B.n_linhas(tb, "consultas", filtro) == 0, "Bruno: 0 anotações e 0 consultas")
        st, r = anotacoes(tb, aluno)
        p.check(st >= 400 and "sem_acesso" in str(r), f"Bruno: aluno_anotacoes → sem_acesso ({st})")
        p.check(B.n_linhas(ta, "registros_prontuario", filtro) == 0 and B.n_linhas(ta, "anamneses", filtro) == 0, "o aluno não lê o próprio prontuário")
    with bloco("as outras seções clínicas (questionário, 360, gestação, fármaco): a Camila grava e lê, o Lucas lê 0"):
        camila = m["camila"]
        extras = {
            "respostas_questionario": {"titulo": "Questionário W18", "perguntas": [], "faixas": [], "respostas": {}, "pontuacao": 0, "faixa": "", "nivel": "",
                                       "data": "2026-07-02", "observacao": ""},
            "avaliacoes_integradas": {"data": "2026-07-02T10:00:00-03:00", "titulo": "Avaliação 360 W18", "fontes": {}, "sintese": {}, "texto": ""},
            "gestacoes": {"dum": "2026-05-01", "dpp": "2027-02-05", "peso_pre": 60, "altura": 165, "imc_pre": 22.0, "gemelar": False},
            "analises_farmaco": {"data": "2026-07-02T10:00:00-03:00", "titulo": "Análise W18", "medicamentos": [], "interacoes": [], "parecer": ""},
        }
        criados: list[tuple[str, str]] = []
        try:
            for t, corpo in extras.items():
                st, r = B.rest(tc, "POST", t, corpo={"nutricionista_id": camila, "paciente_id": aluno, **corpo})
                p.check(st == 201, f"Camila grava {t} ({st} {str(r)[:100] if st != 201 else ''})")
                if st == 201:
                    criados.append((t, r[0]["id"]))
            gest = next((i for t, i in criados if t == "gestacoes"), None)
            if gest:
                st, r = B.rest(tc, "POST", "registros_gestacionais", corpo={"nutricionista_id": camila, "paciente_id": aluno, "gestacao_id": gest,
                                                                             "data": "2026-07-02", "peso": 61.5})
                p.check(st == 201, f"Camila grava registros_gestacionais ({st})")
                if st == 201:
                    criados.append(("registros_gestacionais", r[0]["id"]))
            for t, i in criados:
                p.check(B.n_linhas(tl, t, f"id=eq.{i}") == 0 and B.n_linhas(tc, t, f"id=eq.{i}") == 1, f"{t}: Lucas 0 · Camila 1")
        finally:
            for t, i in reversed(criados):
                B.sql_principal(f"delete from {S}.{t} where id = '{i}'")
    with bloco("nutricionista responsável (Camila): tudo, e o anexo pela URL assinada"):
        p.check(B.n_linhas(tc, "registros_prontuario", filtro) == 4, "4 anotações (as 2 visibilidades)")
        st, r = anotacoes(tc, aluno)
        p.check(st == 200 and r.get("total") == 4 and r.get("clinico") is True, f"aluno_anotacoes: 4, clinico=true ({st} {r.get('total')})")
        esperado = {"consultas": 2, "anamneses": 1, "pedidos_exame": 1, "resultados_exame": 3, "documentos": 1, "medicamentos_paciente": 1, "anexos": 1}
        for t, n in esperado.items():
            p.check(B.n_linhas(tc, t, filtro) == n, f"{t} = {n}")
        st, r = assinar(tc, m["anexo_path"])
        p.check(st == 200 and isinstance(r, dict) and "signedURL" in r, f"URL assinada do anexo ({st})")
        if st == 200:
            st2, corpo, _ = B.http("GET", f"{B.PRINCIPAL_URL}/storage/v1{r['signedURL']}", None, {})
            p.check(st2 == 200 and "%PDF" in str(corpo)[:20], f"o PDF abre pela URL assinada ({st2})")


def bloco_escrita(m: dict) -> None:
    aluno, lucas, camila = m["paciente"], m["lucas"], m["camila"]
    tl, tc = B.token("w13-dono"), B.token("w13-nutri")
    criados: list[str] = []
    try:
        with bloco("personal escreve \"Equipe\"; não grava \"Só nutricionistas\" nem assina como nutricionista"):
            st, r = B.rest(tl, "POST", "registros_prontuario", corpo={"nutricionista_id": lucas, "paciente_id": aluno, "texto": f"Teste {B.MARCA} equipe",
                                                                    "visibilidade": "equipe", "autor_papel": "personal"})
            p.check(st == 201, f"\"Equipe\" como personal → 201 ({st})")
            if st == 201:
                criados.append(r[0]["id"])
            st, r = B.rest(tl, "POST", "registros_prontuario", corpo={"nutricionista_id": lucas, "paciente_id": aluno, "texto": f"Teste {B.MARCA} nutri",
                                                                    "visibilidade": "nutricionistas", "autor_papel": "nutricionista"})
            p.check(recusado(st, r), f"\"Só nutricionistas\" como personal → recusado ({st})")
            st, r = B.rest(tl, "POST", "registros_prontuario", corpo={"nutricionista_id": lucas, "paciente_id": aluno, "texto": f"Teste {B.MARCA} papel",
                                                                    "visibilidade": "equipe", "autor_papel": "nutricionista"})
            p.check(recusado(st, r), f"assinar \"Equipe\" como nutricionista → recusado ({st})")
            # o site antigo grava sem visibilidade (nasce "Só nutricionistas"): o personal pelo mesmo caminho é recusado
            st, r = B.rest(tl, "POST", "registros_prontuario", corpo={"nutricionista_id": lucas, "paciente_id": aluno, "texto": f"Teste {B.MARCA} padrão"})
            p.check(recusado(st, r), f"sem visibilidade (padrão \"Só nutricionistas\") como personal → recusado ({st})")
        with bloco("personal não grava clínico (consulta, anexo na tabela e no Storage)"):
            st, r = B.rest(tl, "POST", "consultas", corpo={"nutricionista_id": lucas, "paciente_id": aluno, "data": "2026-07-20T10:00:00-03:00", "origem": "manual"})
            p.check(recusado(st, r), f"consulta → recusada ({st})")
            caminho = f"{lucas}/{aluno}/{uuid.uuid4()}-personal.pdf"
            st, r = B.storage(tl, "POST", f"object/anexos/{caminho}", B.pdf_minimo("personal"))
            p.check(recusado(st, r), f"arquivo no bucket anexos → recusado ({st} {str(r)[:80]})")
            if st == 200:
                B.apagar_arquivos([caminho])
            st, r = B.rest(tl, "POST", "anexos", corpo={"nutricionista_id": lucas, "paciente_id": aluno, "nome": "x.pdf", "path": f"{lucas}/{aluno}/x.pdf",
                                                         "tamanho": 10, "mime": "application/pdf"})
            p.check(recusado(st, r), f"linha de anexo → recusada ({st})")
        with bloco("só o autor edita e exclui; a nutri muda a visibilidade da dela; o personal não"):
            nota_camila = next(a["id"] for a in m["anotacoes"] if a["autor"] == "w13-nutri" and a["visibilidade"] == "equipe")
            st, r = B.rest(tl, "PATCH", "registros_prontuario", f"id=eq.{nota_camila}", {"texto": "invadido"})
            p.check(st in (200, 204) and not r, f"personal não edita a anotação da Camila (0 linhas; {st})")
            if criados:
                st, r = B.rest(tl, "PATCH", "registros_prontuario", f"id=eq.{criados[0]}", {"visibilidade": "nutricionistas"})
                p.check(recusado(st, r), f"personal não passa a dele para \"Só nutricionistas\" ({st})")
                st, r = B.rest(tc, "PATCH", "registros_prontuario", f"id=eq.{criados[0]}", {"texto": "invadido"})
                p.check(st in (200, 204) and not r, f"a Camila não edita a do Lucas (0 linhas; {st})")
            st, r = B.rest(tc, "POST", "registros_prontuario", corpo={"nutricionista_id": camila, "paciente_id": aluno, "texto": f"Teste {B.MARCA} camila",
                                                                    "visibilidade": "nutricionistas", "autor_papel": "nutricionista"})
            p.check(st == 201, f"a Camila grava \"Só nutricionistas\" ({st})")
            if st == 201:
                nova = r[0]["id"]
                criados.append(nova)
                st, r = B.rest(tc, "PATCH", "registros_prontuario", f"id=eq.{nova}", {"visibilidade": "equipe"})
                p.check(st == 200 and r and r[0]["visibilidade"] == "equipe", f"e passa para \"Equipe\" ({st})")
                st, r = B.rest(tc, "PATCH", "registros_prontuario", f"id=eq.{nova}", {"deleted_at": "2026-10-01T00:00:00Z"})
                p.check(st == 200 and r, f"e exclui (Lixeira) ({st})")
    finally:
        for i in criados:
            B.sql_principal(f"delete from {S}.registros_prontuario where id = '{i}'")


def bloco_removida(m: dict) -> None:
    conta = m["conta"]
    n2 = B.garantir_nutri2(conta, ativa=True)
    bruno, camila = B.uid("w13-personal2"), m["camila"]
    B.sql_principal(f"delete from {S}.pacientes where conta_id = '{conta}' and nome = 'Aluno Prontuario W18'")
    aluno = B.sql_principal(f"""insert into {S}.pacientes (nutricionista_id, personal_id, conta_id, nome, origem, ativo)
                               values ('{n2}', '{bruno}', '{conta}', 'Aluno Prontuario W18', 'novo', true) returning id::text""")[0]["id"]
    filtro = f"paciente_id=eq.{aluno}"
    caminho = f"{n2}/{aluno}/{uuid.uuid4()}-exame.pdf"
    t2 = B.token("w18-nutri2")
    try:
        with bloco("a nutri responsável (nutri2) escreve o prontuário do aluno"):
            st, nota = B.rest(t2, "POST", "registros_prontuario", corpo={"nutricionista_id": n2, "paciente_id": aluno, "texto": f"Nota {B.MARCA} da nutri2"})
            p.check(st == 201 and nota[0]["visibilidade"] == "nutricionistas", f"anotação pelo caminho do site antigo (nasce \"Só nutricionistas\") ({st})")
            st, cons = B.rest(t2, "POST", "consultas", corpo={"nutricionista_id": n2, "paciente_id": aluno, "data": "2026-07-20T10:00:00-03:00", "origem": "manual",
                                                               "observacao": "Consulta da nutri2"})
            p.check(st == 201, f"consulta ({st})")
            st, an = B.rest(t2, "POST", "anamneses", corpo={"nutricionista_id": n2, "paciente_id": aluno, "titulo": "Anamnese nutri2",
                                                             "data": "2026-07-20T10:10:00-03:00", "conteudo": []})
            p.check(st == 201, f"anamnese ({st})")
            st, r = B.storage(t2, "POST", f"object/anexos/{caminho}", B.pdf_minimo("nutri2"))
            p.check(st == 200, f"arquivo do anexo na pasta dela ({st} {str(r)[:80]})")
            st, ax = B.rest(t2, "POST", "anexos", corpo={"nutricionista_id": n2, "paciente_id": aluno, "nome": "exame.pdf", "path": caminho,
                                                          "tamanho": 900, "mime": "application/pdf"})
            p.check(st == 201, f"linha do anexo ({st})")
            st, r = assinar(t2, caminho)
            p.check(st == 200, f"ela assina a URL do arquivo ({st})")
            tc = B.token("w13-nutri")
            p.check(B.n_linhas(tc, "consultas", filtro) == 0 and B.n_linhas(tc, "registros_prontuario", filtro) == 0,
                    "a Camila (outra nutri da conta, não é responsável) não vê (P1)")
            st, r = assinar(tc, caminho)
            p.check(recusado(st, r), f"nem o arquivo ({st})")
        with bloco("REMOVIDA da equipe, a nutri2 deixa de ler o que escreveu"):
            membro = B.sql_principal(f"select id::text from {S}.conta_membros where conta_id = '{conta}' and user_id = '{n2}'")[0]["id"]
            st, r = B.rpc("w13-dono", "remover_membro", {"p_membro": membro, "p_novo_nutri": camila})
            p.check(st == 200 and isinstance(r, dict) and r.get("ok"), f"o dono removeu a nutri2 e passou os alunos para a Camila ({st} {str(r)[:100]})")
            t2b = B.token("w18-nutri2")
            for t in ("registros_prontuario", "consultas", "anamneses", "anexos"):
                p.check(B.n_linhas(t2b, t, filtro) == 0, f"removida: {t} = 0")
            st, r = anotacoes(t2b, aluno)
            p.check(st >= 400, f"removida: aluno_anotacoes recusada ({st})")
            st, r = assinar(t2b, caminho)
            p.check(recusado(st, r), f"removida: URL assinada do arquivo que ela subiu recusada ({st})")
            st, r = baixar(t2b, caminho)
            p.check(recusado(st, r), f"removida: download recusado ({st})")
            st, r = B.rest(t2b, "PATCH", "consultas", f"id=eq.{cons[0]['id']}", {"observacao": "mexi"})
            p.check(st in (200, 204) and not r, f"removida: não edita a consulta (0 linhas; {st})")
            st, r = B.storage(t2b, "POST", f"object/anexos/{n2}/{aluno}/{uuid.uuid4()}-novo.pdf", B.pdf_minimo("x"))
            p.check(recusado(st, r), f"removida: não sobe arquivo novo para o aluno ({st})")
        with bloco("a nova responsável (Camila) lê, edita e apaga o que a removida deixou"):
            tc = B.token("w13-nutri")
            p.check(B.n_linhas(tc, "consultas", filtro) == 1 and B.n_linhas(tc, "anamneses", filtro) == 1 and B.n_linhas(tc, "anexos", filtro) == 1,
                    "Camila lê consulta, anamnese e anexo")
            st, r = anotacoes(tc, aluno)
            p.check(st == 200 and r.get("total") == 1 and r["anotacoes"][0]["autor_nome"] == "Nutri Dois W18", f"e a anotação, com a autora ({r.get('total')})")
            st, r = B.rest(tc, "PATCH", "consultas", f"id=eq.{cons[0]['id']}", {"observacao": "Revisada pela Camila"})
            p.check(st == 200 and r, f"edita a consulta (W18: editar pela conta) ({st})")
            st, r = assinar(tc, caminho)
            p.check(st == 200, f"assina a URL do arquivo da nutri2 ({st})")
            st, r = B.storage(tc, "DELETE", "object/anexos", {"prefixes": [caminho]})
            p.check(st == 200 and isinstance(r, list) and len(r) == 1, f"apaga o arquivo (pode_apagar_anexo) ({st} {str(r)[:80]})")
            st, r = B.rest(tc, "PATCH", "anexos", f"id=eq.{ax[0]['id']}", {"deleted_at": "2026-10-01T00:00:00Z"})
            p.check(st == 200 and r, f"e manda a linha para a Lixeira ({st})")
    finally:
        B.apagar_arquivos([o["name"] for o in B.sql_principal(f"select name from storage.objects where bucket_id = 'anexos' and name like '%/{aluno}/%'")])
        B.sql_principal(f"delete from {S}.pacientes where id = '{aluno}'")
        B.garantir_nutri2(conta, ativa=False)


def bloco_bucket(m: dict) -> None:
    tl, lucas = B.token("w13-dono"), m["lucas"]
    with bloco("restritivas do Storage só no bucket \"anexos\""):
        png = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000" "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")
        caminho = f"{lucas}/teste-w18-{uuid.uuid4().hex[:8]}.png"
        st, r = B.storage(tl, "POST", f"object/fotos-perfil-staging/{caminho}", png, "image/png")
        p.check(st == 200, f"a foto do perfil continua subindo na pasta da pessoa ({st} {str(r)[:80]})")
        st, r = B.storage(tl, "DELETE", "object/fotos-perfil-staging", {"prefixes": [caminho]})
        p.check(st == 200, f"e é apagada ({st})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--so", default="papeis,escrita,removida,bucket")
    a = ap.parse_args()
    m = B.ler_json(B.SCRATCH / "massa_staging.json")
    assert m.get("paciente"), "rode antes: python3 e2e/w18/massa.py"
    t0 = time.time()
    blocos = {"papeis": bloco_papeis, "escrita": bloco_escrita, "removida": bloco_removida, "bucket": bloco_bucket}
    for nome in a.so.split(","):
        blocos[nome](m)
    print(f"\nW18 · servidor (staging) · {time.time() - t0:.0f}s")
    sys.exit(p.fim())
