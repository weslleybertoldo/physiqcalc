#!/usr/bin/env python3
"""Physiq W26 — E2E de SERVIDOR da Ferramentas › Lixeira (banco principal, migração 20261001230000_w26_lixeira.sql), como cada pessoa
(auth.uid() de verdade), na massa do e2e/w26/massa.py (staging):

  quem vê (P1 + clínico da W18):  Helena (dona + nutri) vê tudo da Clínica Sabor W24; Sofia (nutri) só os alunos dela e as respostas
                                  dos formulários dela; Diego (personal) só o aluno dele e as respostas do formulário dele, SEM abas
                                  clínicas; Lucas (dono sem papel de nutri) sem abas clínicas; quem não é da conta: sem_acesso;
  restaurar (volta exatamente):   aluno sem login (mesmo id, ativo, responsáveis); aluno com login → a matrícula do app ENCERRA
                                  (vinculou_profissional); anamnese, antropometria, plano e respostas;
  recusas (nada muda):            e-mail repetido (W16b), outro profissional (P7), limite da faixa, sem acesso, já fora da lixeira;
  apagar de vez:                  plano (refeições em cascata) com permissão; aluno nunca; sem acesso recusa;
  N-65:                           os 2 jobs do pg_cron (03:15 UTC) seguem como estavam e a lixeira_purgar() não mudou;
  site antigo:                    o PostgREST da nutri (o caminho da Lixeira do site antigo) vê os MESMOS itens na lixeira.
Tudo o que o teste restaura volta para a lixeira no fim de cada caso (a massa fica pronta para as telas). Uso: python3 e2e/w26/api.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
q = B.sql_principal
M = json.loads((B.SCRATCH / "massa_staging.json").read_text())


def item(tipo: str, chave: str) -> str:
    return f"{tipo}:{M[chave]}"


def linha(tabela: str, id_: str) -> dict | None:
    r = q(f"select * from {S}.{tabela} where id = '{id_}'")
    return r[0] if r else None


def de_volta(tabela: str, id_: str) -> None:
    """Põe de novo na lixeira (o que o teste restaurou) — direto no banco, só nas linhas W26 da massa."""
    q(f"update {S}.{tabela} set deleted_at = now() - interval '2 days' where id = '{id_}'")


def restaurar(conta: str, tipo: str, id_: str) -> dict:
    st, r = B.rpc(conta, "lixeira_restaurar", {"p_tipo": tipo, "p_id": id_})
    assert st == 200, (conta, tipo, st, r)
    return r  # type: ignore[return-value]


def apagar(conta: str, tipo: str, id_: str) -> dict:
    st, r = B.rpc(conta, "lixeira_apagar", {"p_tipo": tipo, "p_id": id_})
    assert st == 200, (conta, tipo, st, r)
    return r  # type: ignore[return-value]


def caso_visibilidade() -> None:
    c24, c13 = M["conta_w24"], M["conta_w13"]
    h = B.lixeira("w24-dono", c24)
    hk = B.chaves(h["itens"])
    p.check(h["ok"] and h["ve_clinico"] is True, "Helena (dona + nutri): lista ok e vê as abas clínicas")
    todos = [item("paciente", k) for k in ("paula", "gustavo", "vitor", "lia", "otto")] + [item("anamnese", "anamnese"), item("antropometria", "antropometria"),
             item("plano", "plano"), item("plano", "plano_apagar"), item("resposta", "resposta_sofia"), item("resposta", "resposta_diego")]
    p.check(all(x in hk for x in todos), f"Helena vê os 11 itens W26 da conta (P1: dono vê tudo) — faltando {[x for x in todos if x not in hk]}")
    p.check(not any(i["tipo"] == "paciente" and i["pode_apagar"] for i in h["itens"]), "nenhum aluno vem com 'apagar de vez'")

    s = B.lixeira("w24-nutri", c24)
    sk = B.chaves(s["itens"])
    p.check(s["ve_clinico"] is True, "Sofia (nutri membro): vê as abas clínicas")
    p.check(item("paciente", "paula") in sk and item("anamnese", "anamnese") in sk and item("antropometria", "antropometria") in sk and item("plano", "plano_apagar") in sk,
            "Sofia vê a aluna dela e os clínicos da Ana Clara (dela)")
    p.check(not ({item("paciente", "gustavo"), item("paciente", "vitor"), item("paciente", "lia"), item("plano", "plano")} & sk),
            "Sofia NÃO vê o aluno do Diego nem os da Helena (P1: membro só o dele)")
    p.check(item("resposta", "resposta_sofia") in sk and item("resposta", "resposta_diego") not in sk, "Sofia vê a resposta do formulário dela, não a do Diego")

    d = B.lixeira("w24-personal", c24)
    dk = B.chaves(d["itens"])
    p.check(d["ve_clinico"] is False and not any(i["tipo"] in ("anamnese", "antropometria", "plano") for i in d["itens"]),
            "Diego (personal): SEM abas clínicas e nenhum clínico (regra da W18 no banco)")
    p.check(item("paciente", "gustavo") in dk and item("paciente", "paula") not in dk, "Diego vê só o aluno dele")
    p.check(item("resposta", "resposta_diego") in dk and item("resposta", "resposta_sofia") not in dk, "Diego vê a resposta do formulário dele e não a do formulário de nutri")

    l13 = B.lixeira("w13-dono", c13)
    p.check(l13["ok"] and l13["ve_clinico"] is False, "Lucas (dono + personal, sem papel de nutri): sem abas clínicas")
    p.check(f"paciente:{M['ana_nova_w13']}" in B.chaves(l13["itens"]), "Lucas vê a Ana Nova W13 (removida da conta dele)")
    fora = B.lixeira("w13-dono", c24)
    p.check(fora.get("ok") is False and fora.get("erro") == "sem_acesso", f"quem não é da conta: sem_acesso ({fora})")
    st, r, _ = B.http("POST", f"{B.PRINCIPAL_URL}/rest/v1/rpc/lixeira_da_conta", {"p_conta": c24},
                      {"apikey": B.anon(B.PRINCIPAL_REF), "Content-Profile": S, "Accept-Profile": S})
    p.check(st in (401, 403) or (isinstance(r, dict) and r.get("ok") is False), f"sem login: recusado ({st})")


def caso_restaurar_alunos() -> None:
    # sem login: volta exatamente (mesmo id, ativo, responsável)
    antes = linha("pacientes", M["paula"])
    r = restaurar("w24-nutri", "paciente", M["paula"])
    depois = linha("pacientes", M["paula"])
    p.check(r.get("ok") is True and depois["deleted_at"] is None, f"Sofia restaura a Paula ({r})")
    p.check(depois["ativo"] is True and depois["nutricionista_id"] == antes["nutricionista_id"] and depois["id"] == antes["id"],
            "a matrícula volta como era (mesmo id, ativa, a mesma nutri) — nenhuma matrícula nova")
    p.check(int(q(f"select count(*) n from {S}.pacientes where conta_id = '{M['conta_w24']}' and nome = 'Paula Restaura W26'")[0]["n"]) == 1, "continua 1 Paula só")
    r2 = restaurar("w24-nutri", "paciente", M["paula"])
    p.check(r2.get("erro") == "nao_esta_na_lixeira", "restaurar de novo: já saiu da lixeira")
    B.rpc("w24-nutri", "aluno_remover", {"p_paciente": M["paula"]})
    p.check(linha("pacientes", M["paula"])["deleted_at"] is not None, "(a Paula volta para a lixeira pelo Remover do painel)")

    # personal restaura o aluno dele; a nutri não pode
    r = restaurar("w24-nutri", "paciente", M["gustavo"])
    p.check(r.get("erro") == "sem_acesso" and linha("pacientes", M["gustavo"])["deleted_at"] is not None, "Sofia NÃO restaura o aluno do Diego (sem_acesso, nada muda)")
    r = restaurar("w24-personal", "paciente", M["gustavo"])
    p.check(r.get("ok") is True and linha("pacientes", M["gustavo"])["deleted_at"] is None, "Diego restaura o aluno dele")
    B.rpc("w24-personal", "aluno_remover", {"p_paciente": M["gustavo"]})

    # W16b: outro aluno vivo com o mesmo e-mail → recusa, nada muda
    r = restaurar("w24-dono", "paciente", M["vitor"])
    p.check(r.get("erro") == "email_repetido" and r.get("campos") == ["email"], f"Vitor: recusa com email_repetido ({r})")
    p.check(linha("pacientes", M["vitor"])["deleted_at"] is not None, "o Vitor continua na lixeira (nada mudou)")

    # P7: ativo com outro profissional → recusa
    r = restaurar("w24-dono", "paciente", M["otto"])
    p.check(r.get("erro") == "outro_profissional", f"Otto (agora com outro profissional): recusa outro_profissional ({r})")
    p.check(linha("pacientes", M["otto"])["deleted_at"] is not None, "o Otto continua na lixeira e na outra conta")

    # limite da faixa (Consultoria W13 com 10 de 10)
    r = restaurar("w13-dono", "paciente", M["ana_nova_w13"])
    p.check(r.get("erro") == "limite_plano" and r.get("limite") == 10, f"Ana Nova W13: recusa limite_plano ({r.get('erro')}, {r.get('em_uso')}/{r.get('limite')})")
    p.check(linha("pacientes", M["ana_nova_w13"])["deleted_at"] is not None, "a Ana Nova continua na lixeira")

    # com login: a matrícula do app encerra (W7b)
    app = q(f"select {S}.conta_do_app()::text a")[0]["a"]
    lia_uid = B.uid("w26-lia")
    antes_app = q(f"select id::text, ativo from {S}.pacientes where user_id = '{lia_uid}' and conta_id = '{app}' and deleted_at is null")
    p.check(any(x["ativo"] for x in antes_app), "a Lia está no app (removida → aluna do app, W7b)")
    avisos_antes = int(q(f"select count(*) n from {S}.avisos where destino_user_id = '{lia_uid}'")[0]["n"])
    r = restaurar("w24-dono", "paciente", M["lia"])
    p.check(r.get("ok") is True and r.get("app_encerrado") is True, f"Helena restaura a Lia: ok e a matrícula do app encerrou ({r})")
    app_depois = q(f"select ativo, app_encerrada_em, app_encerrada_motivo from {S}.pacientes where user_id = '{lia_uid}' and conta_id = '{app}' and deleted_at is null")
    p.check(all(not x["ativo"] and x["app_encerrada_em"] and x["app_encerrada_motivo"] == "vinculou_profissional" for x in app_depois),
            "a do app ficou inativa com a marca vinculou_profissional (a assinatura do app, se houver, cai pela rede de segurança)")
    p.check(linha("pacientes", M["lia"])["ativo"] is True, "a matrícula da Helena voltou ativa")
    p.check(int(q(f"select count(*) n from {S}.avisos where destino_user_id = '{lia_uid}'")[0]["n"]) == avisos_antes, "restaurar não manda aviso a ninguém")
    B.rpc("w24-dono", "aluno_remover", {"p_paciente": M["lia"]})
    p.check(linha("pacientes", M["lia"])["deleted_at"] is not None, "(a Lia volta para a lixeira — e para o app)")


def caso_restaurar_clinicos() -> None:
    for quem, tipo, chave, tabela in (
        ("w24-nutri", "anamnese", "anamnese", "anamneses"),
        ("w24-dono", "antropometria", "antropometria", "antropometrias"),
        ("w24-dono", "plano", "plano", "planos_alimentares"),
        ("w24-personal", "resposta", "resposta_diego", "respostas_preconsulta"),
        ("w24-dono", "resposta", "resposta_sofia", "respostas_preconsulta"),
    ):
        antes = linha(tabela, M[chave])
        r = restaurar(quem, tipo, M[chave])
        depois = linha(tabela, M[chave])
        iguais = {k: v for k, v in antes.items() if k not in ("deleted_at", "updated_at")} == {k: v for k, v in depois.items() if k not in ("deleted_at", "updated_at")}
        p.check(r.get("ok") is True and depois["deleted_at"] is None and iguais, f"{quem} restaura {tipo} W26: volta igual ({r.get('erro')})")
        de_volta(tabela, M[chave])
    # sem permissão
    for quem, tipo, chave in (("w24-personal", "anamnese", "anamnese"), ("w13-dono", "plano", "plano"), ("w24-nutri", "resposta", "resposta_diego"),
                              ("w24-nutri", "plano", "plano")):
        r = restaurar(quem, tipo, M[chave])
        p.check(r.get("erro") == "sem_acesso", f"{quem} NÃO restaura {tipo} ({r.get('erro')})")
    p.check(linha("anamneses", M["anamnese"])["deleted_at"] is not None, "a anamnese continua na lixeira")


def caso_apagar() -> None:
    r = apagar("w24-personal", "plano", M["plano_apagar"])
    p.check(r.get("erro") == "sem_acesso" and linha("planos_alimentares", M["plano_apagar"]) is not None, "Diego NÃO apaga o plano da Sofia")
    r = apagar("w24-nutri", "paciente", M["paula"])
    p.check(r.get("erro") == "aluno_nao_apaga" and linha("pacientes", M["paula"]) is not None, "aluno não é apagado de vez")
    refs = int(q(f"select count(*) n from {S}.refeicoes where plano_id = '{M['plano_apagar']}'")[0]["n"])
    r = apagar("w24-nutri", "plano", M["plano_apagar"])
    p.check(r.get("ok") is True and linha("planos_alimentares", M["plano_apagar"]) is None, "Sofia apaga de vez o 'Plano W26 apagar'")
    p.check(refs >= 1 and int(q(f"select count(*) n from {S}.refeicoes where plano_id = '{M['plano_apagar']}'")[0]["n"]) == 0, "as refeições dele caíram junto (cascade)")
    r = apagar("w24-nutri", "plano", M["plano_apagar"])
    p.check(r.get("erro") == "nao_esta_na_lixeira", "apagar de novo: já não existe")


def caso_purga_e_site_antigo() -> None:
    jobs = q("select jobname, schedule, command, active from cron.job where jobname like 'lixeira%' order by 1")
    p.check([(j["jobname"], j["schedule"], j["active"]) for j in jobs] == [("lixeira-purga-public", "15 3 * * *", True), ("lixeira-purga-staging", "15 3 * * *", True)],
            f"N-65: os 2 jobs da purga (03:15 UTC) seguem iguais, sem job novo ({len(jobs)})")
    antes = json.loads((Path.home() / "backups/physiq/2026-10-01-w26/principal-staging-antes.json").read_text())
    def_antes = next(f["d"] for f in antes["funcoes"] if f["proname"] == "lixeira_purgar")
    def_agora = q(f"select pg_get_functiondef('{S}.lixeira_purgar()'::regprocedure) d")[0]["d"]
    p.check(def_antes == def_agora, "a lixeira_purgar() não mudou (cobre as 4 tabelas que o Physiq grava)")
    # o site antigo lê a lixeira pelo PostgREST da nutri (as policies 'da dona' — nada mudou nelas)
    tok = B.token("w24-nutri")
    cab = {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {tok}", "Accept-Profile": S}
    st, r, _ = B.http("GET", f"{B.PRINCIPAL_URL}/rest/v1/anamneses?select=id&deleted_at=not.is.null&id=eq.{M['anamnese']}", None, cab)
    p.check(st == 200 and isinstance(r, list) and len(r) == 1, f"site antigo (PostgREST da nutri): a anamnese W26 aparece na lixeira de lá ({st})")
    st, r, _ = B.http("GET", f"{B.PRINCIPAL_URL}/rest/v1/pacientes?select=id&deleted_at=not.is.null&id=eq.{M['paula']}", None, cab)
    p.check(st == 200 and isinstance(r, list) and len(r) == 1, "site antigo: a aluna W26 aparece na lixeira de lá")


def main() -> int:
    t0 = time.time()
    B.saude_ok("o E2E de servidor da Lixeira")
    for nome, fn in (("visibilidade", caso_visibilidade), ("restaurar_alunos", caso_restaurar_alunos), ("restaurar_clinicos", caso_restaurar_clinicos),
                     ("apagar", caso_apagar), ("purga_e_site_antigo", caso_purga_e_site_antigo)):
        print(f"\n── {nome}", flush=True)
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            p.check(False, f"[{nome}] exceção: {str(e)[:400]}")
    print(f"\nW26 · api ({S}) · {time.time() - t0:.0f}s")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
