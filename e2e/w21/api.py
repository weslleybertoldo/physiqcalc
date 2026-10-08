#!/usr/bin/env python3
"""Physiq W21 — E2E de API da pré-consulta no banco principal (STAGING), com o login REAL de cada pessoa (RLS e gatilhos de verdade):

  1. Cada profissional cria o formulário na conta dele (como o painel: conta_id = a conta ativa); o anônimo responde pela RPC e a
     resposta HERDA a conta do formulário (gatilho). Negativos: conta de outra pessoa → recusado; o dono não cria em nome de outro.
  2. Quem lê o quê (P1 + a regra clínica da W18): a nutri lê as dela; o dono (sem papel de nutri) lê as da equipe MENOS as dos
     formulários da nutricionista; o 2º personal só as dele; o personal de outra conta não vê nada daqui; a nutri REMOVIDA da equipe
     não lê mais as do formulário dela na conta; o número de "novas" (sem aluno) de cada um bate.
  3. Ligar a um aluno: só a quem quem liga vê (aluno_invisivel); a resposta não muda de autor/conta (resposta_imutavel); o formulário
     não muda de autor (formulario_imutavel).
  4. Importar: o personal NÃO grava anamnese (RLS da W3); a nutricionista grava a anamnese do aluno dela e marca a resposta.
  5. Site antigo do Nutri (as MESMAS tabelas, sem conta): a nutri do legado cria, recebe, liga, importa e exclui como hoje.
  6. Público: formulário inativo → formulario_nao_encontrado; o anônimo não lê as tabelas.
Tudo o que é criado é apagado no fim (contagens das 2 tabelas iguais antes/depois). Uso: python3 e2e/w21/api.py
"""
from __future__ import annotations

import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p, q = B.p, B.q
CRIADOS: dict[str, list[str]] = {"formularios": [], "respostas": [], "anamneses": []}


def slug_novo(_prefixo: str = "") -> str:
    """Slug aleatório no alfabeto do app (8 letras sem 0/o/1/l)."""
    return "".join(secrets.choice("abcdefghijkmnpqrstuvwxyz23456789") for _ in range(8))


def criar_form(conta: str, conta_id: str | None, titulo: str, autor: str | None = None, origem: str = "personalizado") -> tuple[int, object]:
    corpo = {"nutricionista_id": autor or B.uid(conta), "titulo": f"{B.MARCA} {titulo}", "origem": origem, "slug": slug_novo(titulo[:2].lower().replace(" ", "")),
             "perguntas": [{"id": "p1", "texto": "Como você está?", "tipo": "texto", "max": 4, "pontos_sim": 1, "opcoes": []},
                           {"id": "p2", "texto": "Treina?", "tipo": "sim_nao", "max": 4, "pontos_sim": 1, "opcoes": []}], "faixas": [], "ativo": True}
    if conta_id is not None:
        corpo["conta_id"] = conta_id
    st, r = B.rest(conta, "POST", "formularios_preconsulta", "", corpo)
    if st == 201:
        CRIADOS["formularios"].append(r[0]["id"])  # type: ignore[index]
    return st, r


def contagens() -> dict:
    r = B.sql_principal(f"select (select count(*) from {S}.formularios_preconsulta)::int f, (select count(*) from {S}.respostas_preconsulta)::int r, "
                        f"(select count(*) from {S}.anamneses)::int a")
    return r[0]


def main() -> int:
    B.saude_ok("api W21")
    antes = contagens()
    w13 = B.conta_de("w13-dono", B.NOME_CONTA)
    c_p2 = B.conta_prof2()
    rafael = B.aluno(w13, "Rafael Moura")
    carlos = B.aluno(w13, "Carlos Souza")
    aluno2 = B.aluno(c_p2, "Aluno Dois")
    leg = B.conta_nutri_legado()
    pac_leg = B.aluno(leg, "Paciente Teste Claude")
    try:
        # 1. formulários na conta + respostas herdam a conta
        forms = {}
        for conta, chave in (("w13-nutri", "cam"), ("w13-dono", "luc"), ("w13-personal2", "bru")):
            st, r = criar_form(conta, w13, f"API {chave}", origem="anamnese" if chave == "cam" else "personalizado")
            p.check(st == 201, f"1. {conta} cria o formulário na conta W13 → {st}")
            forms[chave] = r[0]  # type: ignore[index]
        st, r = criar_form("prof2", c_p2, "API p2")
        p.check(st == 201, f"1. prof2 (só Treino) cria na conta dele → {st}")
        forms["p2"] = r[0]  # type: ignore[index]
        st, r = criar_form("w13-personal2", c_p2, "API invasor")
        p.check(st in (401, 403), f"1. NEGATIVO: Bruno cria com a conta do prof2 (não é membro) → {st}")
        st, r = criar_form("w13-dono", w13, "API em nome", autor=B.uid("w13-nutri"))
        p.check(st in (401, 403), f"1. NEGATIVO: o dono cria em nome da Camila → {st}")
        # a nutri removida (w18-nutri2) tinha um formulário na conta (criado como membro; hoje está removida) — massa por service
        removida = B.uid("w18-nutri2")
        f_rem = B.sql_principal(f"""insert into {S}.formularios_preconsulta (nutricionista_id, conta_id, titulo, origem, slug, perguntas)
                                   values ({q(removida)}, {q(w13)}, '{B.MARCA} API removida', 'anamnese', {q(slug_novo('rm'))},
                                   '[{{"id":"p1","texto":"Como você está?","tipo":"texto","max":4,"pontos_sim":1,"opcoes":[]}}]'::jsonb)
                                   returning id::text as id, slug""")[0]
        CRIADOS["formularios"].append(f_rem["id"])
        forms["rem"] = f_rem
        resp = {}
        for chave, f in forms.items():
            r = B.responder(f["slug"], f"Pessoa {chave.upper()} W21", f"w21.api.{chave}.teste.claude@physiqnutri.app", {"p1": "Bem", "p2": True})
            CRIADOS["respostas"].append(r["id"])
            resp[chave] = r["id"]
        contas = {x["id"]: x["c"] for x in B.sql_principal(f"select id::text, conta_id::text as c from {S}.respostas_preconsulta where id in ({', '.join(q(v) for v in resp.values())})")}
        p.check(all(contas[resp[k]] == w13 for k in ("cam", "luc", "bru", "rem")) and contas[resp["p2"]] == c_p2,
                "1. a resposta herdou a conta do formulário (gatilho), nas 5")

        # 2. quem lê o quê
        filtro = f"id=in.({','.join(resp.values())})"
        def vê(conta: str) -> set[str]:
            return set(B.ids_visiveis(conta, "respostas_preconsulta", filtro))
        inv = {v: k for k, v in resp.items()}
        nomes = lambda s: sorted(inv[x] for x in s)  # noqa: E731
        p.check(nomes(vê("w13-nutri")) == ["cam"], f"2. Camila (nutri) lê só a do formulário dela → {nomes(vê('w13-nutri'))}")
        p.check(nomes(vê("w13-dono")) == ["bru", "luc"], f"2. Lucas (dono, sem papel de nutri) lê as da equipe MENOS as de formulário de nutri → {nomes(vê('w13-dono'))}")
        p.check(nomes(vê("w13-personal2")) == ["bru"], f"2. Bruno (2º personal) só a dele (P1) → {nomes(vê('w13-personal2'))}")
        p.check(nomes(vê("prof2")) == ["p2"], f"2. prof2 (outra conta) só a dele → {nomes(vê('prof2'))}")
        p.check(nomes(vê("w18-nutri2")) == [], f"2. a nutri REMOVIDA não lê mais a resposta do formulário dela na conta → {nomes(vê('w18-nutri2'))}")
        p.check(nomes(vê("nutri-legado")) == [], "2. a nutri do legado (outra conta) não vê nada daqui")
        fvis = set(B.ids_visiveis("w13-dono", "formularios_preconsulta", f"id=in.({','.join(f['id'] for f in forms.values())})"))
        p.check({forms["cam"]["id"], forms["luc"]["id"], forms["bru"]["id"], forms["rem"]["id"]} <= fvis and forms["p2"]["id"] not in fvis,
                "2. o dono VÊ os formulários da equipe (inclusive os da nutri — o formulário não é clínico; a resposta é)")
        p.check(set(B.ids_visiveis("w13-personal2", "formularios_preconsulta", f"id=in.({','.join(f['id'] for f in forms.values())})")) == {forms["bru"]["id"]},
                "2. Bruno só vê o formulário dele")
        p.check(B.ids_visiveis("w18-nutri2", "formularios_preconsulta", f"id=eq.{forms['rem']['id']}") == [], "2. a removida perde o formulário da conta (spec §9)")
        recorte = lambda conta: f"deleted_at=is.null&paciente_id=is.null&or=(conta_id.eq.{w13},and(conta_id.is.null,nutricionista_id.eq.{B.uid(conta)}))&id=in.({','.join(resp.values())})"  # noqa: E731
        p.check(B.contar("w13-dono", "respostas_preconsulta", recorte("w13-dono")) == 2, "2. o número de novas do Lucas (o do menu) = 2")
        p.check(B.contar("w13-nutri", "respostas_preconsulta", recorte("w13-nutri")) == 1, "2. o número de novas da Camila = 1")

        # 3. ligar a um aluno
        st, r = B.rest("w13-personal2", "PATCH", "respostas_preconsulta", f"id=eq.{resp['bru']}", {"paciente_id": rafael["id"]})
        p.check(st >= 400 and "aluno_invisivel" in str(r), f"3. NEGATIVO: Bruno liga a resposta ao Rafael (não é aluno dele) → {st} {str(r)[:80]}")
        st, r = B.rest("w13-personal2", "PATCH", "respostas_preconsulta", f"id=eq.{resp['bru']}", {"paciente_id": carlos["id"]})
        p.check(st == 200 and r and r[0]["paciente_id"] == carlos["id"], f"3. Bruno liga ao Carlos (aluno dele) → {st}")  # type: ignore[index]
        st, r = B.rest("prof2", "PATCH", "respostas_preconsulta", f"id=eq.{resp['p2']}", {"paciente_id": aluno2["id"]})
        p.check(st == 200 and r and r[0]["paciente_id"] == aluno2["id"], f"3. prof2 (só Treino) liga ao Aluno Dois → {st}")  # type: ignore[index]
        st, r = B.rest("w13-dono", "PATCH", "respostas_preconsulta", f"id=eq.{resp['cam']}", {"paciente_id": rafael["id"]})
        p.check(st == 200 and r == [], f"3. NEGATIVO: o dono não alcança a resposta da nutri (0 linhas) → {st} {r}")
        st, r = B.rest("w13-dono", "PATCH", "respostas_preconsulta", f"id=eq.{resp['luc']}", {"nutricionista_id": B.uid("w13-personal2")})
        p.check(st >= 400 and "resposta_imutavel" in str(r), f"3. NEGATIVO: a resposta não muda de autor → {st}")
        st, r = B.rest("w13-dono", "PATCH", "respostas_preconsulta", f"id=eq.{resp['luc']}", {"conta_id": c_p2})
        p.check(st >= 400, f"3. NEGATIVO: a resposta não muda de conta → {st}")
        st, r = B.rest("w13-dono", "PATCH", "formularios_preconsulta", f"id=eq.{forms['cam']['id']}", {"nutricionista_id": B.uid("w13-dono")})
        p.check(st >= 400 and "formulario_imutavel" in str(r), f"3. NEGATIVO: o dono não toma o formulário da nutri → {st}")

        # 4. importar
        st, r = B.rest("w13-personal2", "POST", "anamneses", "", {"nutricionista_id": B.uid("w13-personal2"), "paciente_id": carlos["id"], "titulo": f"{B.MARCA} indevida",
                                                                   "data": "2026-10-01T12:00:00Z", "conteudo": [], "texto_livre": "x"})
        p.check(st in (401, 403), f"4. NEGATIVO: o personal não grava anamnese (clínico — W3/W18) → {st}")
        st, r = B.rest("w13-nutri", "PATCH", "respostas_preconsulta", f"id=eq.{resp['cam']}", {"paciente_id": rafael["id"]})
        p.check(st == 200 and r and r[0]["paciente_id"] == rafael["id"], f"4. Camila liga a dela ao Rafael Moura (aluno dela) → {st}")  # type: ignore[index]
        st, r = B.rest("w13-nutri", "POST", "anamneses", "", {"nutricionista_id": B.uid("w13-nutri"), "paciente_id": rafael["id"], "titulo": f"{B.MARCA} importada",
                                                               "data": "2026-10-01T12:00:00Z", "conteudo": [{"pergunta": "Como você está?", "resposta": "Bem"}],
                                                               "texto_livre": "Pré-consulta respondida por Pessoa CAM W21"})
        p.check(st == 201, f"4. Camila grava a anamnese do Rafael (a importação) → {st}")
        if st == 201:
            CRIADOS["anamneses"].append(r[0]["id"])  # type: ignore[index]
            st2, r2 = B.rest("w13-nutri", "PATCH", "respostas_preconsulta", f"id=eq.{resp['cam']}",
                             {"importada_em": "2026-10-01T12:00:01Z", "importada_tipo": "anamnese", "importada_id": r[0]["id"]})  # type: ignore[index]
            p.check(st2 == 200 and r2 and r2[0]["importada_tipo"] == "anamnese", f"4. e marca a resposta como importada → {st2}")  # type: ignore[index]
            p.check(B.ids_visiveis("w13-dono", "anamneses", f"id=eq.{r[0]['id']}") == [], "4. o dono sem papel de nutri não lê a anamnese importada (W18)")  # type: ignore[index]

        # 5. site antigo do Nutri (sem conta)
        st, r = criar_form("nutri-legado", None, "API antigo", origem="personalizado")
        p.check(st == 201 and r[0]["conta_id"] is None, f"5. a nutri do legado cria SEM conta (o site antigo) → {st}")  # type: ignore[index]
        f_ant = r[0]  # type: ignore[index]
        r_ant = B.responder(f_ant["slug"], "Paciente Antigo W21", "w21.api.antigo.teste.claude@physiqnutri.app", {"p1": "Ok"})
        CRIADOS["respostas"].append(r_ant["id"])
        p.check(B.sql_principal(f"select conta_id from {S}.respostas_preconsulta where id = {q(r_ant['id'])}")[0]["conta_id"] is None,
                "5. a resposta do formulário sem conta fica sem conta (como hoje)")
        p.check(B.ids_visiveis("nutri-legado", "respostas_preconsulta", f"id=eq.{r_ant['id']}") == [r_ant["id"]], "5. ela lê a resposta (como hoje)")
        st, r = B.rest("nutri-legado", "PATCH", "respostas_preconsulta", f"id=eq.{r_ant['id']}", {"paciente_id": pac_leg["id"]})
        p.check(st == 200 and r and r[0]["paciente_id"] == pac_leg["id"], f"5. liga ao paciente dela (o site antigo) → {st}")  # type: ignore[index]
        st, r = B.rest("nutri-legado", "PATCH", "respostas_preconsulta", f"id=eq.{r_ant['id']}", {"deleted_at": "2026-10-01T12:00:02Z"})
        p.check(st == 200 and r and r[0]["deleted_at"], f"5. exclui (soft, Lixeira) → {st}")  # type: ignore[index]
        p.check(B.ids_visiveis("w13-dono", "respostas_preconsulta", f"id=eq.{r_ant['id']}") == [] and B.ids_visiveis("w13-nutri", "formularios_preconsulta", f"id=eq.{f_ant['id']}") == [],
                "5. ninguém de outra conta vê o formulário/resposta dela")

        # 6. público
        st, r = B.rest("w13-dono", "PATCH", "formularios_preconsulta", f"id=eq.{forms['luc']['id']}", {"ativo": False})
        p.check(st == 200, f"6. Lucas desativa o formulário dele → {st}")
        st, r = B.rpc("", "preconsulta_formulario", {"p_slug": forms["luc"]["slug"]})
        p.check(st == 200 and r is None, f"6. o /f/ do inativo não acha o formulário → {r}")
        st, r = B.rpc("", "preconsulta_responder", {"p_slug": forms["luc"]["slug"], "p_nome": "Fulano", "p_email": "", "p_telefone": "", "p_respostas": {"p1": "x"},
                                                  "p_consentimento": B.versao_dos_textos()})
        p.check(st >= 400 and "formulario_nao_encontrado" in str(r), f"6. e não aceita resposta → {st}")
        st, r = B.rpc("", "preconsulta_formulario", {"p_slug": forms["bru"]["slug"]})
        p.check(st == 200 and isinstance(r, dict) and r.get("titulo", "").endswith("API bru") and r.get("nutricionista") == "Bruno Lima",
                f"6. o ativo abre para o anônimo, com o nome de quem mandou ({(r or {}).get('nutricionista') if isinstance(r, dict) else r})")
        st, r = B.rest("", "GET", "respostas_preconsulta", "select=id&limit=1")
        p.check(st in (200, 401, 403) and (st != 200 or r == []), f"6. o anônimo não lê as respostas → {st} {r}")
    finally:
        if CRIADOS["anamneses"]:
            B.sql_principal(f"delete from {S}.anamneses where id in ({', '.join(q(x) for x in CRIADOS['anamneses'])})")
        if CRIADOS["respostas"]:
            B.sql_principal(f"delete from {S}.respostas_preconsulta where id in ({', '.join(q(x) for x in CRIADOS['respostas'])})")
        if CRIADOS["formularios"]:
            B.sql_principal(f"delete from {S}.respostas_preconsulta where formulario_id in ({', '.join(q(x) for x in CRIADOS['formularios'])})")
            B.sql_principal(f"delete from {S}.formularios_preconsulta where id in ({', '.join(q(x) for x in CRIADOS['formularios'])})")
    depois = contagens()
    p.check(antes == depois, f"limpeza: contagens iguais antes/depois ({antes} × {depois})")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
