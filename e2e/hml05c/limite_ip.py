#!/usr/bin/env python3
"""Physiq hml-05c (homologação H-17 item 1, 08/10/2026) — limite por IP nas 9 RPCs públicas do banco principal.

  ip        o banco conta pelo IP de quem chamou: direto ao *.supabase.co (cf-connecting-ip) e pelo Worker (x-physiq-ip com a
            assinatura) caem no MESMO balde; cabeçalhos inventados pelo aparelho (direto ou pelo Worker) não mudam o balde.
  normal    abaixo do limite as 9 respondem como antes (código inválido → a resposta de sempre).
  limites   [só staging] com o contador no máximo, cada uma das 9 recusa com o código certo (envios: o que a tela já mostra;
            leituras: muitas_consultas) — o contador é posto no máximo por SQL, nada é gravado nas tabelas do app.
  rajada    [só staging] 60 consultas do diario_link passam e a 61ª é recusada, metade direto e metade pelo Worker.
  servidor  [só staging] a service_role não conta.
Imprime só status, código de erro, 8 caracteres do hash e contagens (nenhum IP, nenhuma chave).
No fim (staging) apaga as linhas do contador deste IP.

Uso: python3 e2e/hml05c/limite_ip.py --schema staging|public [--worker https://…] [--so ip,normal,limites,rajada,servidor]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "w02"))
from _comum import PRINCIPAL_REF, PRINCIPAL_URL, Placar, anon, http, service, sql_principal  # noqa: E402

WORKER_PADRAO = "https://api-principal.physiqcalc.com.br"
COD = "zz00zz00zz"  # código que não existe (alfabeto dos links)
ARGS = {
    "diario_link": {"p_codigo": COD},
    "diario_listar": {"p_codigo": COD},
    "diario_paciente": {"p_codigo": COD},
    "diario_enviar": {"p_codigo": COD, "p_path": "x", "p_mime": "image/jpeg", "p_tamanho": 1, "p_refeicao": "almoco",
                      "p_comentario": "", "p_data_hora": None},
    "preconsulta_formulario": {"p_slug": COD},
    "preconsulta_responder": {"p_slug": COD, "p_nome": "Teste", "p_email": "", "p_telefone": "", "p_respostas": {}},
    "cadastro_link_info": {"p_codigo": COD},
    "cadastro_publico_info": {"p_codigo": COD},
    "cadastro_publico_enviar": {"p_codigo": COD, "p_nome": "Teste", "p_apelido": "", "p_nascimento": "", "p_telefone": "",
                                "p_cpf": "", "p_email": "", "p_genero": "", "p_observacoes": ""},
}
# o que cada uma devolve com o código inválido, abaixo do limite (o comportamento de antes)
NORMAL = {
    "diario_link": (200, {"situacao": "invalido"}),
    "diario_listar": (200, []),
    "diario_paciente": (200, None),
    "diario_enviar": (400, "codigo_invalido"),
    "preconsulta_formulario": (200, None),
    "preconsulta_responder": (400, "formulario_nao_encontrado"),
    "cadastro_link_info": (200, {"ok": False, "erro": "link_nao_encontrado"}),
    "cadastro_publico_info": (200, None),
    "cadastro_publico_enviar": (400, "link_nao_encontrado"),
}
LIMITE = {
    "diario_link": (60, "muitas_consultas"), "diario_listar": (60, "muitas_consultas"), "diario_paciente": (60, "muitas_consultas"),
    "diario_enviar": (30, "muitos_envios"), "preconsulta_formulario": (60, "muitas_consultas"),
    "preconsulta_responder": (20, "muitas_respostas"), "cadastro_link_info": (60, "muitas_consultas"),
    "cadastro_publico_info": (60, "muitas_consultas"), "cadastro_publico_enviar": (20, "muitos_cadastros"),
}


def rpc(base: str, S: str, fn: str, extra: dict | None = None, chave: str | None = None) -> tuple[int, object]:
    k = chave or anon(PRINCIPAL_REF)
    cab = {"apikey": k, "Authorization": f"Bearer {k}", "Content-Profile": S}
    cab.update(extra or {})
    st, r, _ = http("POST", f"{base}/rest/v1/rpc/{fn}", ARGS[fn], cab)
    return st, r


def msg(r: object) -> object:
    return r.get("message") if isinstance(r, dict) and "message" in r and "code" in r else r


def contador(S: str) -> list[dict]:
    return sql_principal(f"select left(ip_hash, 8) as h, rota, n from {S}.publico_pedidos_ip "
                         f"where janela = date_trunc('hour', now()) order by rota, h")


def n_de(S: str, h: str, rota: str) -> int:
    return sum(x["n"] for x in contador(S) if x["h"] == h and x["rota"] == rota)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schema", required=True, choices=["staging", "public"])
    ap.add_argument("--worker", default=WORKER_PADRAO)
    ap.add_argument("--so", default="ip,normal,limites,rajada,servidor")
    a = ap.parse_args()
    S, W, so = a.schema, a.worker.rstrip("/"), set(a.so.split(","))
    if S == "public":
        so &= {"ip", "normal"}
    p = Placar()
    print(f"schema={S} worker={W.split('//')[1].split('.')[0]}…")

    # 1º pedido direto: acha o balde deste IP (o hash) para os outros testes
    antes = {(x["h"], x["rota"]): x["n"] for x in contador(S)}
    st, r = rpc(PRINCIPAL_URL, S, "diario_link")
    p.check(st == 200 and r == {"situacao": "invalido"}, f"direto diario_link → {st} {r}")
    novos = [x for x in contador(S) if x["rota"] == "diario_link" and x["n"] != antes.get((x["h"], x["rota"]))]
    if not p.check(len(novos) == 1, f"o pedido direto entrou em 1 balde ({[x['h'] for x in novos]})"):
        return p.fim()
    h = novos[0]["h"]

    if "ip" in so:
        n0 = n_de(S, h, "diario_link")
        st, r = rpc(W, S, "diario_link")
        p.check(st == 200 and n_de(S, h, "diario_link") == n0 + 1, f"pelo Worker → {st}; mesmo balde do direto ({h}: {n0} → {n0 + 1})")
        forjado = {"x-physiq-ip": "198.51.100.7", "x-physiq-assinatura": "a" * 64, "x-physiq-proxy": "falso"}
        st, r = rpc(PRINCIPAL_URL, S, "diario_link", forjado)
        p.check(st == 200 and n_de(S, h, "diario_link") == n0 + 2, f"direto com IP e assinatura inventados → {st}; mesmo balde")
        st, r = rpc(W, S, "diario_link", forjado)
        p.check(st == 200 and n_de(S, h, "diario_link") == n0 + 3, f"pelo Worker com IP e assinatura inventados → {st}; mesmo balde")

    if "normal" in so:
        for fn, (st_esp, r_esp) in NORMAL.items():
            for base, onde in ((PRINCIPAL_URL, "direto"), (W, "Worker")):
                st, r = rpc(base, S, fn)
                p.check(st == st_esp and msg(r) == r_esp, f"normal {fn} ({onde}) → {st} {msg(r)}")

    if "limites" in so:
        # o hash inteiro deste IP fica só aqui (não é impresso): é a chave das linhas que o teste põe no máximo
        hash_ip = sql_principal(f"select ip_hash from {S}.publico_pedidos_ip where left(ip_hash, 8) = '{h}' limit 1")[0]["ip_hash"]
        for fn, (maximo, erro) in LIMITE.items():
            sql_principal(f"insert into {S}.publico_pedidos_ip as t (ip_hash, rota, janela, n) "
                          f"values ('{hash_ip}', '{fn}', date_trunc('hour', now()), {maximo}) "
                          f"on conflict (ip_hash, rota, janela) do update set n = {maximo}")
            st, r = rpc(W, S, fn)
            p.check(st == 400 and msg(r) == erro and n_de(S, h, fn) == maximo,
                    f"limite {fn} ({maximo}/h) pelo Worker → {st} {msg(r)}; contador fica em {n_de(S, h, fn)}")
            sql_principal(f"delete from {S}.publico_pedidos_ip where left(ip_hash, 8) = '{h}' and rota = '{fn}'")
        st, r = rpc(PRINCIPAL_URL, S, "diario_enviar")
        p.check(st == 400 and msg(r) == "codigo_invalido", f"depois de zerar, diario_enviar volta ao normal → {st} {msg(r)}")

    if "rajada" in so:
        sql_principal(f"delete from {S}.publico_pedidos_ip where left(ip_hash, 8) = '{h}' and rota = 'diario_link'")
        oks = 0
        for i in range(60):
            st, r = rpc(PRINCIPAL_URL if i % 2 else W, S, "diario_link")
            oks += st == 200
        p.check(oks == 60, f"rajada: 60 consultas (30 direto + 30 pelo Worker) → {oks} passaram")
        st1, r1 = rpc(PRINCIPAL_URL, S, "diario_link")
        st2, r2 = rpc(W, S, "diario_link")
        p.check(st1 == 400 and msg(r1) == "muitas_consultas" and st2 == 400 and msg(r2) == "muitas_consultas",
                f"61ª direto → {st1} {msg(r1)} · pelo Worker → {st2} {msg(r2)}")
        p.check(n_de(S, h, "diario_link") == 60, f"o contador para em 60 (recusa não conta: {n_de(S, h, 'diario_link')})")

    if "servidor" in so:
        n0 = n_de(S, h, "diario_link")
        st, r = rpc(PRINCIPAL_URL, S, "diario_link", chave=service(PRINCIPAL_REF))
        p.check(st == 200 and n_de(S, h, "diario_link") == n0, f"service_role → {st}; não conta ({n0} → {n_de(S, h, 'diario_link')})")

    print("contador (hora corrente):", [(x["h"], x["rota"], x["n"]) for x in contador(S)])
    if S == "staging":
        sql_principal(f"delete from {S}.publico_pedidos_ip where left(ip_hash, 8) = '{h}'")
        print("linhas deste IP apagadas do contador do staging")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
