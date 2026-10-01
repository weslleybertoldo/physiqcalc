#!/usr/bin/env python3
"""Physiq W17 (item 3) — E2E de SERVIDOR do Perfil do aluno › Avaliação, no staging (massa da W10: "Diego Almeida" na "Consultoria
Ferreira W7" — w7-personal = dono + personal, w7-nutri = nutricionista; e o w13-nutri, de OUTRA conta, para os negativos).

  leitura   a função treino-leitura (ação "avaliacoes") e a aluno_evolucao: o personal e a nutri leem o histórico dos 2 bancos (as 6
            avaliações físicas, o perfil e as 8 fotos mensais com URL assinada; as 2 antropometrias e as 3 fotos da nutri); quem é de
            outra conta, sem token ou com ação inválida é recusado; o personal assina a URL da foto da nutri (Storage da W17)
  proxima   admin-avaliacoes "proxima" (NF7): o personal marca e tira a data; data inválida e o próprio aluno são recusados
  aviso     aluno_avisar_avaliacao: o aviso "avaliação nova" no sino do aluno, sem repetir em 10 min; quem não registra é recusado
  escrita   antropometria pela RLS (W3 + W17): a nutri cria e exclui; o dono sem papel de nutricionista não cria; avaliação física pela
            admin-avaliacoes: o personal cria e exclui; a nutricionista não tem sessão do Treino (decisão da W5) e o aluno é recusado
Tudo o que é criado é apagado no fim (o perfil do Treino do Diego e as contagens voltam ao que eram).

Uso: python3 e2e/w17/avaliacao_api.py
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
ORIGEM = "https://physiqcalc-staging.vercel.app"
DIEGO = B.DIEGO


def q(sql: str) -> list:
    return B.sql_principal(sql)


def leitura(token: str | None, corpo: dict) -> tuple[int, dict]:
    cab = {"x-schema": S, "Origin": ORIGEM}
    if token:
        cab["Authorization"] = f"Bearer {token}"
    st, r, _ = B.http("POST", f"{B.API_T}/functions/v1/treino-leitura", corpo, cab, timeout=90)
    return st, (r if isinstance(r, dict) else {"bruto": r})


def rest(token: str, metodo: str, tabela: str, filtro: str = "", corpo=None) -> tuple[int, object]:
    cab = {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {token}", "Accept-Profile": S, "Content-Profile": S, "Prefer": "return=representation"}
    st, r, _ = B.http(metodo, f"{B.PRINCIPAL_URL}/rest/v1/{tabela}{('?' + filtro) if filtro else ''}", corpo, cab, timeout=60)
    return st, r


def main() -> int:
    B.saude_ok("avaliação — servidor")  # lento ou UNHEALTHY → SystemExit (não reinicio nada)
    user_diego = q(f"select user_id::text u from {S}.pacientes where id = '{DIEGO}'")[0]["u"]
    tid = B.sql_treino(f"select treino_user_id::text t from {S}.physiq_identidades where principal_user_id = '{user_diego}'")
    tid = tid[0]["t"] if tid else None
    assert tid, "Diego sem vínculo no Treino (rode e2e/w10/massa.py)"
    perfil0 = B.sql_treino(f"select * from {S}.physiq_profiles where id = '{tid}'")[0]
    av0 = B.sql_treino(f"select count(*)::int n from {S}.physiq_avaliacoes where user_id = '{tid}'")[0]["n"]
    an0 = q(f"select count(*)::int n from {S}.antropometrias where paciente_id = '{DIEGO}' and deleted_at is null")[0]["n"]
    personal, nutri, outro = B.token("w7-personal"), B.token("w7-nutri"), B.token("w13-nutri")
    criadas: dict = {"antropo": [], "fisica": []}
    try:
        print("\n— leitura (os 2 bancos)")
        for nome, tok in (("personal", personal), ("nutri", nutri)):
            st, r = leitura(tok, {"action": "avaliacoes", "aluno": DIEGO})
            fotos = r.get("fotos") or []
            p.check(st == 200 and len(r.get("avaliacoes") or []) == av0 and (r.get("perfil") or {}).get("id") == tid and r.get("treino_user_id") == tid,
                    f"{nome}: treino-leitura devolve as {av0} avaliações físicas e o perfil ({st})")
            p.check(len(fotos) == 8 and all(f.get("url") for f in fotos), f"{nome}: as 8 fotos mensais com URL assinada ({len(fotos)})")
            st, r = B.rpc(tok, "aluno_evolucao", {"p_aluno": DIEGO})
            p.check(st == 200 and len(r.get("antropometrias") or []) == an0 and len(r.get("fotos") or []) == 3
                    and all(a.get("autor_nome") for a in r["antropometrias"]), f"{nome}: aluno_evolucao = {an0} antropometrias + 3 fotos, com o autor ({st})")
        url = ((leitura(personal, {"action": "avaliacoes", "aluno": DIEGO})[1].get("fotos") or [{}])[0]).get("url")
        st, _, h = B.http("GET", url, None, {}, timeout=60) if url else (0, None, {})
        p.check(st == 200, f"a URL assinada da foto mensal abre ({st})")
        path = (B.rpc(personal, "aluno_evolucao", {"p_aluno": DIEGO})[1].get("fotos") or [{}])[0].get("path")
        for nome, tok, esperado in (("personal", personal, 200), ("outra conta", outro, None)):
            st, r, _ = B.http("POST", f"{B.PRINCIPAL_URL}/storage/v1/object/sign/evolucao/{path}", {"expiresIn": 60},
                              {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {tok}"})
            if esperado:
                p.check(st == esperado and "signedURL" in (r or {}), f"{nome}: assina a URL da foto da nutri (Storage da W17) ({st})")
            else:
                p.check(st >= 400, f"{nome}: NÃO assina a foto do aluno ({st})")
        st, r = leitura(outro, {"action": "avaliacoes", "aluno": DIEGO})
        p.check(st == 403 and r.get("error") == "sem_acesso", f"outra conta: treino-leitura recusa ({st} {r})")
        st, r = B.rpc(outro, "aluno_evolucao", {"p_aluno": DIEGO})
        p.check(st >= 400 and "sem_acesso" in json.dumps(r), f"outra conta: aluno_evolucao recusa ({st})")
        st, r = leitura(None, {"action": "avaliacoes", "aluno": DIEGO})
        p.check(st == 401, f"sem token → 401 ({st})")
        st, r = leitura(personal, {"action": "apagar", "aluno": DIEGO})
        p.check(st == 400 and r.get("error") == "acao_invalida", f"ação de escrita → 400 ({st} {r})")
        st, r, _ = B.http("POST", f"{B.PRINCIPAL_URL}/rest/v1/rpc/aluno_evolucao", {"p_aluno": DIEGO},
                          {"apikey": B.anon(B.PRINCIPAL_REF), "Content-Profile": S})
        p.check(st in (401, 403) or (st >= 400), f"anônimo não chama a aluno_evolucao ({st})")

        print("\n— próxima avaliação (NF7)")
        data = time.strftime("%Y-%m-%d", time.localtime(time.time() + 14 * 86400))
        st, r = B.funcao_treino("w7-personal", "admin-avaliacoes", {"action": "proxima", "userId": tid, "data": data})
        db = B.sql_treino(f"select proxima_avaliacao::text d from {S}.physiq_profiles where id = '{tid}'")[0]["d"]
        p.check(st == 200 and r.get("proxima_avaliacao") == data and db == data, f"personal marca {data} ({st} {r} · banco {db})")
        st, r = B.funcao_treino("w7-personal", "admin-avaliacoes", {"action": "proxima", "userId": tid, "data": "31/12/2026"})
        p.check(st == 400 and r.get("error") == "data_invalida", f"data inválida → 400 ({st} {r})")
        st, r = B.funcao_treino("w10-aluno", "admin-avaliacoes", {"action": "proxima", "userId": tid, "data": data})
        p.check(st == 403, f"o próprio aluno → 403 ({st} {r})")
        st, r = leitura(nutri, {"action": "avaliacoes", "aluno": DIEGO})
        p.check(st == 200 and str((r.get("perfil") or {}).get("proxima_avaliacao"))[:10] == data, "a nutri lê a próxima avaliação (treino-leitura)")
        st, r = B.funcao_treino("w7-personal", "admin-avaliacoes", {"action": "proxima", "userId": tid, "data": None})
        db = B.sql_treino(f"select proxima_avaliacao::text d from {S}.physiq_profiles where id = '{tid}'")[0]["d"]
        p.check(st == 200 and db is None, f"personal tira a data ({st} · banco {db})")

        print("\n— escrita: avaliação física (Treino) e antropometria (principal)")
        hoje = time.strftime("%Y-%m-%d")
        st, r = B.funcao_treino("w7-personal", "admin-avaliacoes", {"action": "create", "userId": tid, "avaliacao": {
            "data_avaliacao": hoje, "peso": 83.6, "altura": 178, "metodo_avaliacao": "dobras_3", "dobra_1": 10, "dobra_2": 18, "dobra_3": 12,
            "percentual_gordura": 12.9, "observacao": "W17 E2E servidor"}})
        fid = ((r or {}).get("avaliacao") or {}).get("id")
        if fid:
            criadas["fisica"].append(fid)
        p.check(st == 200 and fid, f"personal cria a avaliação física ({st})")
        st, r = B.funcao_treino("w10-aluno", "admin-avaliacoes", {"action": "create", "userId": tid, "avaliacao": {"data_avaliacao": hoje, "peso": 1}})
        p.check(st == 403, f"o aluno não cria avaliação física ({st})")
        st, r = rest(nutri, "POST", "antropometrias", corpo={"nutricionista_id": B.uid("w7-nutri"), "paciente_id": DIEGO, "data": f"{hoje}T10:00:00-03:00",
                                                              "peso": 83.9, "altura": 178, "sexo": "masculino", "idade": 31, "protocolo": "nenhum",
                                                              "circunferencias": {"cintura": 83}, "dobras": {}, "resultados": {"imc": 26.5},
                                                              "observacao": "W17 E2E servidor"})
        aid = r[0]["id"] if st == 201 and isinstance(r, list) and r else None
        if aid:
            criadas["antropo"].append(aid)
        p.check(st == 201 and aid, f"nutri cria a antropometria ({st})")
        st, r = rest(personal, "POST", "antropometrias", corpo={"nutricionista_id": B.uid("w7-personal"), "paciente_id": DIEGO, "data": f"{hoje}T10:00:00-03:00",
                                                                 "peso": 80, "protocolo": "nenhum"})
        if st == 201 and isinstance(r, list) and r:
            criadas["antropo"].append(r[0]["id"])
        p.check(st in (401, 403), f"dono sem papel de nutricionista NÃO cria antropometria (RLS) ({st})")
        st, r = B.rpc(personal, "aluno_evolucao", {"p_aluno": DIEGO})
        datas = [a["data"] for a in (r.get("antropometrias") or [])]
        p.check(hoje in datas and len(datas) == an0 + 1, f"o personal vê a antropometria nova da nutri ({len(datas)})")
        st, r = leitura(nutri, {"action": "avaliacoes", "aluno": DIEGO})
        p.check(any(a.get("id") == fid for a in (r.get("avaliacoes") or [])), "a nutri vê a avaliação física nova do personal")

        print("\n— aviso 'avaliação nova' no sino do aluno")
        q(f"delete from {S}.avisos where destino_user_id = '{user_diego}' and tipo = 'avaliacao_nova'")
        st, r = B.rpc(personal, "aluno_avisar_avaliacao", {"p_aluno": DIEGO})
        p.check(st == 200 and r.get("avisado") is True, f"personal → avisado ({st} {r})")
        st, r = B.rpc(nutri, "aluno_avisar_avaliacao", {"p_aluno": DIEGO})
        p.check(st == 200 and r.get("repetido") is True, f"nutri logo depois → não repete ({st} {r})")
        av = q(f"select titulo, link from {S}.avisos where destino_user_id = '{user_diego}' and tipo = 'avaliacao_nova'")
        p.check(len(av) == 1 and av[0]["link"] == "/evolucao", f"1 aviso → /evolucao ({av})")
        st, r = B.rpc(outro, "aluno_avisar_avaliacao", {"p_aluno": DIEGO})
        p.check(st >= 400, f"outra conta → recusado ({st})")
        st, r = B.rpc("w10-aluno", "aluno_avisar_avaliacao", {"p_aluno": DIEGO})
        p.check(st >= 400 or (isinstance(r, dict) and r.get("ok") is False), f"o próprio aluno → recusado ({st} {str(r)[:80]})")

        print("\n— excluir")
        st, r = rest(nutri, "PATCH", "antropometrias", f"id=eq.{aid}", {"deleted_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
        p.check(st == 200 and isinstance(r, list) and len(r) == 1, f"nutri exclui a antropometria (Lixeira) ({st})")
        st, r = B.rpc(personal, "aluno_evolucao", {"p_aluno": DIEGO})
        p.check(len(r.get("antropometrias") or []) == an0, "sumiu do histórico")
        st, r = B.funcao_treino("w7-personal", "admin-avaliacoes", {"action": "delete", "avaliacaoId": fid})
        n = B.sql_treino(f"select count(*)::int n from {S}.physiq_avaliacoes where id = '{fid}'")[0]["n"]
        p.check(st == 200 and n == 0, f"personal exclui a avaliação física ({st})")
        if n == 0:
            criadas["fisica"].remove(fid)
    finally:
        for f in criadas["fisica"]:
            B.sql_treino(f"delete from {S}.physiq_avaliacoes where id = '{f}'")
        for a in criadas["antropo"]:
            q(f"delete from {S}.antropometrias where id = '{a}'")
        q(f"delete from {S}.avisos where destino_user_id = '{user_diego}' and tipo = 'avaliacao_nova'")
        B.sql_treino(f"update {S}.physiq_profiles set proxima_avaliacao = {('$d$' + str(perfil0['proxima_avaliacao']) + '$d$') if perfil0.get('proxima_avaliacao') else 'null'} where id = '{tid}'")
    av1 = B.sql_treino(f"select count(*)::int n from {S}.physiq_avaliacoes where user_id = '{tid}'")[0]["n"]
    an1 = q(f"select count(*)::int n from {S}.antropometrias where paciente_id = '{DIEGO}' and deleted_at is null")[0]["n"]
    p.check((av1, an1) == (av0, an0), f"a massa voltou ao que era (físicas {av0} → {av1}, antropometrias {an0} → {an1})")
    return p.fim()


if __name__ == "__main__":
    t0 = time.time()
    rc = main()
    print(f"({time.time() - t0:.0f} s)")
    sys.exit(rc)
