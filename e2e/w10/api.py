#!/usr/bin/env python3
"""Physiq W10 — E2E de SERVIDOR da regra de leitura do aluno no banco principal (minha_evolucao + Storage "evolucao").

  1. o aluno (w10-aluno) lê as PRÓPRIAS antropometrias e fotos, com a autora e sem a observação interna da nutricionista
  2. outro aluno (w10-paciente) lê só as dele — nunca as do Diego
  3. anon não chama a função (401/42501); o REST direto nas tabelas continua fechado para o aluno (0 linhas)
  4. o aluno assina a URL da PRÓPRIA foto (200) e baixa o arquivo; outro aluno não assina a foto do Diego; anon também não
  5. a nutricionista continua lendo e assinando como antes (a política dela não mudou)
  6. o Banco do Treino (REST, regra de hoje): o aluno lê as próprias avaliações e fotos; outro aluno não
Uso: python3 e2e/w10/api.py [--schema staging|public]   (public = SÓ LEITURA: só os casos 3 e o de outro aluno sem nada)
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

p = B.p


def cab(token: str | None, schema: str, ref: str) -> dict:
    c = {"apikey": B.anon(ref), "Content-Profile": schema, "Accept-Profile": schema}
    if token:
        c["Authorization"] = f"Bearer {token}"
    return c


def rpc(token: str | None, schema: str) -> tuple[int, object]:
    st, r, _ = B.http("POST", f"{B.PRINCIPAL_URL}/rest/v1/rpc/minha_evolucao", {}, cab(token, schema, B.PRINCIPAL_REF))
    return st, r


def assinar(token: str | None, caminho: str, bucket: str = "evolucao", url: str | None = None, ref: str | None = None) -> tuple[int, object]:
    base = url or B.PRINCIPAL_URL
    c = {"apikey": B.anon(ref or B.PRINCIPAL_REF)}
    c["Authorization"] = f"Bearer {token or B.anon(ref or B.PRINCIPAL_REF)}"
    st, r, _ = B.http("POST", f"{base}/storage/v1/object/sign/{bucket}/{caminho}", {"expiresIn": 60}, c)
    return st, r


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schema", default="staging")
    a = ap.parse_args()
    s = a.schema
    B.ESTADO["schema"] = s

    if s == "public":
        # produção: só leitura — anon recusado e o aluno de teste do Calc lê o que é dele (nenhuma antropometria em prod hoje)
        st, r = rpc(None, s)
        p.check(st in (401, 403) or (isinstance(r, dict) and r.get("code") in ("42501", "PGRST301")), f"prod: anon não chama minha_evolucao ({st})")
        tok = B.sessao(B.ALUNO_CALC)["access_token"]
        st, r = rpc(tok, s)
        p.check(st == 200 and isinstance(r, dict) and isinstance(r.get("antropometrias"), list) and isinstance(r.get("fotos"), list),
                f"prod: teste@teste.com chama minha_evolucao (200, listas) — {st} {str(r)[:120]}")
        return p.fim()

    diego = B.sessao("w10-aluno")["access_token"]
    paula = B.sessao("w10-paciente")["access_token"]
    camila = B.sessao("w7-nutri")["access_token"] if "w7-nutri" in B.CONTAS else None

    # 1. o próprio aluno
    st, r = rpc(diego, s)
    p.check(st == 200 and isinstance(r, dict), f"1. minha_evolucao do Diego: {st}")
    antro = (r or {}).get("antropometrias", []) if isinstance(r, dict) else []
    fotos = (r or {}).get("fotos", []) if isinstance(r, dict) else []
    p.check([x["data"] for x in antro] == ["2026-05-28", "2026-08-26"], f"1. as 2 antropometrias em ordem de data ({[x['data'] for x in antro]})")
    p.check(all(x.get("autor_nome") == "Camila Rocha" for x in antro), "1. com a autora (Camila Rocha)")
    p.check(all("observacao" not in x for x in antro) and all("observacao" not in x for x in fotos), "1. sem a observação interna da nutricionista")
    p.check(sorted(x["posicao"] for x in fotos) == ["costas", "frente", "lado_d"], f"1. as 3 fotos de 26/08 ({[x['posicao'] for x in fotos]})")
    p.check(r.get("objetivo") == "definição", f"1. objetivo da matrícula ({r.get('objetivo')})")

    # 2. outro aluno
    st, r2 = rpc(paula, s)
    antro2 = (r2 or {}).get("antropometrias", []) if isinstance(r2, dict) else []
    p.check(st == 200 and [x["data"] for x in antro2] == ["2026-09-10"] and not (r2 or {}).get("fotos"), f"2. a Paula vê só a dela ({[x['data'] for x in antro2]})")
    ids_diego = {x["id"] for x in antro}
    p.check(not ids_diego & {x["id"] for x in antro2}, "2. nenhuma do Diego na lista da Paula")

    # 3. anon e o REST direto
    st, r3 = rpc(None, s)
    p.check(st in (401, 403) or (isinstance(r3, dict) and r3.get("code") in ("42501", "PGRST301")), f"3. anon não chama a função ({st} {str(r3)[:80]})")
    st, r4, _ = B.http("GET", f"{B.PRINCIPAL_URL}/rest/v1/antropometrias?select=id", None, cab(diego, s, B.PRINCIPAL_REF))
    p.check(st == 200 and r4 == [], f"3. REST direto em antropometrias continua fechado para o aluno ({st} {str(r4)[:60]})")
    st, r5, _ = B.http("GET", f"{B.PRINCIPAL_URL}/rest/v1/fotos_evolucao?select=id", None, cab(diego, s, B.PRINCIPAL_REF))
    p.check(st == 200 and r5 == [], f"3. REST direto em fotos_evolucao continua fechado para o aluno ({st})")

    # 4. Storage
    caminho = fotos[0]["path"] if fotos else "x"
    st, r6 = assinar(diego, caminho)
    url_assinada = (r6 or {}).get("signedURL") if isinstance(r6, dict) else None
    p.check(st == 200 and bool(url_assinada), f"4. o Diego assina a URL da própria foto ({st})")
    if url_assinada:
        st_img, corpo, _ = B.http("GET", f"{B.PRINCIPAL_URL}/storage/v1{url_assinada}", None, {})
        p.check(st_img == 200, f"4. e baixa o arquivo pela URL assinada ({st_img})")
    st, r7 = assinar(paula, caminho)
    p.check(st in (400, 403, 404), f"4. a Paula NÃO assina a foto do Diego ({st} {str(r7)[:80]})")
    st, r8 = assinar(None, caminho)
    p.check(st in (400, 401, 403, 404), f"4. anon NÃO assina ({st})")

    # 5. a nutricionista, como antes
    if camila:
        st, r9 = assinar(camila, caminho)
        p.check(st == 200, f"5. a Camila (dona da pasta) segue assinando ({st})")
        st, r10, _ = B.http("GET", f"{B.PRINCIPAL_URL}/rest/v1/antropometrias?select=id,observacao", None, cab(camila, s, B.PRINCIPAL_REF))
        p.check(st == 200 and isinstance(r10, list) and {x["id"] for x in r10} >= ids_diego, "5. a Camila segue lendo as antropometrias (com a observação dela)")

    # 6. Banco do Treino — a regra de hoje (o aluno lê as próprias linhas e a própria pasta)
    if not B.saude_treino():
        p.check(False, "6. Banco do Treino fora do normal — parei")
        return p.fim()
    st, sess = B.B5.trocar_token("w10-aluno")
    tok_t = sess.get("access_token") if isinstance(sess, dict) else None
    p.check(st == 200 and bool(tok_t), f"6. troca de token do Diego ({st})")
    tid = B.treino_id("w10-aluno")
    st, av, _ = B.http("GET", f"{B.TREINO_URL}/rest/v1/physiq_avaliacoes?select=data_avaliacao&order=data_avaliacao", None, cab(tok_t, s, B.TREINO_REF))
    p.check(st == 200 and isinstance(av, list) and len(av) == 6, f"6. o Diego lê as 6 avaliações dele no Treino ({st} {len(av) if isinstance(av, list) else av})")
    st, rf = assinar(tok_t, f"{tid}/2026-09/frente.jpg", "registros-staging", B.TREINO_URL, B.TREINO_REF)
    p.check(st == 200, f"6. e assina a própria foto mensal ({st})")
    st, sess2 = B.B5.trocar_token(B.ALUNO_CALC)
    tok_o = sess2.get("access_token") if isinstance(sess2, dict) else None
    st, rf2 = assinar(tok_o, f"{tid}/2026-09/frente.jpg", "registros-staging", B.TREINO_URL, B.TREINO_REF)
    p.check(st in (400, 403, 404), f"6. outro aluno (teste@teste.com) não assina a foto do Diego ({st})")
    st, av2, _ = B.http("GET", f"{B.TREINO_URL}/rest/v1/physiq_avaliacoes?select=id&user_id=eq.{tid}", None, cab(tok_o, s, B.TREINO_REF))
    p.check(st == 200 and av2 == [], f"6. nem lê as avaliações do Diego ({st} {str(av2)[:60]})")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
