#!/usr/bin/env python3
"""Physiq W11 — testes das funções do banco principal (staging), como o app chama (auth.uid() de verdade, RLS de verdade):

  1. minha_dieta: só o que é do próprio aluno (Diego não vê a Paula e vice-versa); anon não executa; os ✓ do dia pedido;
  2. paciente_marcar_refeicao (a MESMA do site antigo): marca/desmarca; sem_alimentos, data_invalida (hoje ± 1 em SP), sem_acesso
     (refeição de outro aluno); o ✓ do site antigo e do Physiq é a mesma linha (o paciente lê pela RLS antiga do Nutri);
  3. aluno_marcar_meta (NF4): marca/desmarca a meta de hoje; fora_do_dia, meta_pausada, data_invalida, sem_acesso; a nutricionista
     responsável lê o ✓ (política da W2) e outro aluno não;
  4. virada do dia: o ✓ de hoje não aparece no dia seguinte (a tabela é por dia de São Paulo);
  5. aluno_le_foto_diario / a política do Storage: o aluno lê a própria foto do diário e não a de outro; nada entra na fila do WhatsApp.
Uso: python3 e2e/w11/api.py        (depois da massa: python3 e2e/w11/massa.py)
"""
from __future__ import annotations

import datetime as dt
import sys
import uuid
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402
import massa as M  # noqa: E402

S = "staging"
p = B.p


def rpc(conta: str, f: str, args: dict | None = None):
    return B.rpc(conta, f, args or {})


def erro(r) -> str:
    return (r or {}).get("message", "") if isinstance(r, dict) else str(r)


def main() -> int:
    B.ESTADO["schema"] = S
    hoje = M.HOJE.isoformat()
    amanha = (M.HOJE + dt.timedelta(days=1)).isoformat()
    depois = (M.HOJE + dt.timedelta(days=2)).isoformat()
    ontem = (M.HOJE - dt.timedelta(days=1)).isoformat()
    diego, pac, paula = M.matricula_de(B.EMAIL["w10-aluno"]), M.matricula_de(B.EMAIL["paciente"]), M.matricula_de(B.EMAIL["w7-paciente"])
    M.limpar([diego["id"], pac["id"], paula["id"]])
    cafe = M.u("refeicao:diego-atual:Café da manhã")
    pre = M.u("refeicao:paciente:Pré-treino")
    almoco_pac = M.u("refeicao:paciente:Almoço")
    brunch = M.u("refeicao:paula-fim:Brunch")
    agua, frutas, diario_meta = M.u("meta:diego:Beber 2,5 litros de água"), M.u("meta:diego:Comer 3 porções de frutas"), M.u("meta:diego:Registrar o diário alimentar")
    agua_pac = M.u("meta:paciente:Beber 2 litros de água")

    # ---------- 1. minha_dieta ----------
    st, d = rpc("w10-aluno", "minha_dieta", {"p_dia": hoje})
    p.check(st == 200 and [m["id"] for m in d["matriculas"]] == [diego["id"]], f"1. minha_dieta do Diego: só a matrícula dele → {st}")
    p.check(len(d["planos"]) == 2 and all(pl["paciente_id"] == diego["id"] for pl in d["planos"]), "1. os 2 planos dele (atual + anterior)")
    p.check(len(d["metas"]) == 5 and len(d["orientacoes"]) == 2, f"1. 5 metas e 2 orientações ({len(d['metas'])}, {len(d['orientacoes'])})")
    st, d2 = rpc("w7-paciente", "minha_dieta", {"p_dia": hoje})
    p.check(st == 200 and all(pl["paciente_id"] == paula["id"] for pl in d2["planos"]) and not any(o for o in d2["orientacoes"] if o["paciente_id"] == diego["id"]),
            "1. a Paula não vê nada do Diego")
    st, r, _ = B.http("POST", f"{B.PRINCIPAL_URL}/rest/v1/rpc/minha_dieta", {}, {"apikey": B.anon(B.PRINCIPAL_REF), "Content-Profile": S, "Accept-Profile": S})
    p.check(st in (401, 403, 404) or (st == 200 and r is None), f"1. anon não lê (sem login) → {st} {str(r)[:80]}")

    # ---------- 2. ✓ das refeições (a mesma função do site antigo) ----------
    st, r = rpc("w10-aluno", "paciente_marcar_refeicao", {"p_refeicao_id": cafe, "p_data": hoje, "p_concluida": True})
    p.check(st == 200 and r is True, f"2. marca o café de hoje → {st} {r}")
    st, r = rpc("w10-aluno", "paciente_marcar_refeicao", {"p_refeicao_id": cafe, "p_data": hoje, "p_concluida": True})
    p.check(st == 200 and r is True, "2. marcar de novo não duplica (on conflict)")
    linhas = B.sql_principal(f"select count(*)::int as n, min(nutricionista_id::text) as nutri from {S}.refeicoes_concluidas where refeicao_id = '{cafe}' and data = '{hoje}'")[0]
    p.check(linhas == {"n": 1, "nutri": diego["nutri"]}, f"2. 1 linha, com a nutricionista do plano ({linhas})")
    st, d = rpc("w10-aluno", "minha_dieta", {"p_dia": hoje})
    p.check(d["refeicoes_concluidas"] == [cafe], "2. a minha_dieta devolve o ✓ de hoje")
    st, d = rpc("w10-aluno", "minha_dieta", {"p_dia": amanha})
    p.check(d["refeicoes_concluidas"] == [] and d["dia"] == amanha, "4. virada do dia: amanhã nada vem marcado (o ✓ zera no dia seguinte)")
    st, r = rpc("w10-aluno", "paciente_marcar_refeicao", {"p_refeicao_id": cafe, "p_data": hoje, "p_concluida": False})
    p.check(st == 200 and r is False, "2. desmarcar apaga a linha")
    p.check(B.sql_principal(f"select count(*)::int as n from {S}.refeicoes_concluidas where refeicao_id = '{cafe}'")[0]["n"] == 0, "2. linha apagada")
    st, r = rpc("paciente", "paciente_marcar_refeicao", {"p_refeicao_id": pre, "p_data": hoje, "p_concluida": True})
    p.check(st >= 400 and "sem_alimentos" in erro(r), f"2. refeição sem alimento não ganha ✓ → {st} {erro(r)}")
    st, r = rpc("w10-aluno", "paciente_marcar_refeicao", {"p_refeicao_id": cafe, "p_data": depois, "p_concluida": True})
    p.check(st >= 400 and "data_invalida" in erro(r), f"2. depois de amanhã → data_invalida ({st})")
    st, r = rpc("w10-aluno", "paciente_marcar_refeicao", {"p_refeicao_id": brunch, "p_data": hoje, "p_concluida": True})
    p.check(st >= 400 and "sem_acesso" in erro(r), f"2. refeição de outra aluna → sem_acesso ({st})")
    # o site antigo lê o MESMO ✓ pela RLS de sempre (paciente: ler as proprias refeicoes concluidas)
    st, r = rpc("paciente", "paciente_marcar_refeicao", {"p_refeicao_id": almoco_pac, "p_data": hoje, "p_concluida": True})
    tok = B.sessao("paciente")["access_token"]
    st2, lidas, _ = B.http("GET", f"{B.PRINCIPAL_URL}/rest/v1/refeicoes_concluidas?select=refeicao_id,data&data=eq.{hoje}", None,
                           {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {tok}", "Accept-Profile": S})
    p.check(st == 200 and st2 == 200 and lidas == [{"refeicao_id": almoco_pac, "data": hoje}], f"2. o site antigo vê o ✓ do Physiq (mesma linha): {lidas}")
    st, r = rpc("paciente", "paciente_marcar_refeicao", {"p_refeicao_id": almoco_pac, "p_data": ontem, "p_concluida": True})
    p.check(st == 200 and r is True, "2. ontem ainda aceita (folga de ± 1 dia do fuso/relógio, a regra de hoje)")

    # ---------- 3. ✓ das metas (NF4) ----------
    st, r = rpc("w10-aluno", "aluno_marcar_meta", {"p_meta_id": agua, "p_data": hoje, "p_concluida": True})
    p.check(st == 200 and r is True, f"3. marca a meta de hoje → {st} {r}")
    st, r = rpc("w10-aluno", "aluno_marcar_meta", {"p_meta_id": agua, "p_data": hoje, "p_concluida": True})
    linha = B.sql_principal(f"select count(*)::int as n, min(conta_id::text) as conta from {S}.metas_concluidas where meta_id = '{agua}' and data = '{hoje}'")[0]
    conta = B.sql_principal(f"select conta_id::text as c from {S}.pacientes where id = '{diego['id']}'")[0]["c"]
    p.check(linha == {"n": 1, "conta": conta}, f"3. 1 linha por dia, com a conta da matrícula ({linha})")
    st, d = rpc("w10-aluno", "minha_dieta", {"p_dia": hoje})
    p.check(d["metas_concluidas"] == [agua], "3. a minha_dieta devolve o ✓ da meta")
    st, d = rpc("w10-aluno", "minha_dieta", {"p_dia": amanha})
    p.check(d["metas_concluidas"] == [], "4. amanhã a meta volta sem ✓")
    st, r = rpc("w10-aluno", "aluno_marcar_meta", {"p_meta_id": frutas, "p_data": hoje, "p_concluida": True})
    p.check(st >= 400 and "fora_do_dia" in erro(r), f"3. meta de outro dia → fora_do_dia ({st} {erro(r)})")
    st, r = rpc("w10-aluno", "aluno_marcar_meta", {"p_meta_id": diario_meta, "p_data": hoje, "p_concluida": True})
    p.check(st >= 400 and "meta_pausada" in erro(r), f"3. meta pausada → meta_pausada ({st})")
    st, r = rpc("w10-aluno", "aluno_marcar_meta", {"p_meta_id": agua, "p_data": depois, "p_concluida": True})
    p.check(st >= 400 and "data_invalida" in erro(r), f"3. depois de amanhã → data_invalida ({st})")
    st, r = rpc("w10-aluno", "aluno_marcar_meta", {"p_meta_id": agua_pac, "p_data": hoje, "p_concluida": True})
    p.check(st >= 400 and "sem_acesso" in erro(r), f"3. meta de outro aluno → sem_acesso ({st})")
    tok_nutri = B.sessao("w7-nutri")["access_token"] if "w7-nutri" in B.CONTAS else None
    if tok_nutri:
        st, lidas, _ = B.http("GET", f"{B.PRINCIPAL_URL}/rest/v1/metas_concluidas?select=meta_id,data&paciente_id=eq.{diego['id']}", None,
                              {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {tok_nutri}", "Accept-Profile": S})
        p.check(st == 200 and lidas == [{"meta_id": agua, "data": hoje}], f"3. a nutricionista responsável (Camila) vê o ✓ da meta: {lidas}")
    tok_paula = B.sessao("w7-paciente")["access_token"]
    st, lidas, _ = B.http("GET", f"{B.PRINCIPAL_URL}/rest/v1/metas_concluidas?select=meta_id&paciente_id=eq.{diego['id']}", None,
                          {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {tok_paula}", "Accept-Profile": S})
    p.check(st == 200 and lidas == [], f"3. outra aluna não vê o ✓ do Diego ({lidas})")
    st, r = rpc("w10-aluno", "aluno_marcar_meta", {"p_meta_id": agua, "p_data": hoje, "p_concluida": False})
    p.check(st == 200 and r is False and B.sql_principal(f"select count(*)::int as n from {S}.metas_concluidas where meta_id = '{agua}'")[0]["n"] == 0,
            "3. desmarcar apaga a linha")

    # ---------- 5. a foto do diário do próprio aluno (P29) ----------
    fila_antes = B.sql_principal(f"select count(*)::int as n from {S}.mensagens_whatsapp")[0]["n"]
    tok_d = B.sessao("w10-aluno")["access_token"]
    caminho = f"{diego['nutri']}/{diego['id']}/{uuid.uuid4()}.jpg"
    dados = (B.FOTOS / "almoco.jpg").read_bytes()
    bucket = B.bucket_do_ambiente("diario")
    st, r, _ = B.http("POST", f"{B.PRINCIPAL_URL}/storage/v1/object/{bucket}/{caminho}", dados,
                      {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {tok_d}", "Content-Type": "image/jpeg", "x-upsert": "false"})
    p.check(st in (200, 201), f"5. o aluno sobe a foto na pasta dele ({st} {str(r)[:80]})")
    codigo = B.sql_principal(f"select link_codigo from {S}.pacientes where id = '{diego['id']}'")[0]["link_codigo"]
    agora = dt.datetime.now(dt.timezone.utc).isoformat()
    st, r = rpc("w10-aluno", "diario_enviar", {"p_codigo": codigo, "p_path": caminho, "p_mime": "image/jpeg", "p_tamanho": len(dados),
                                                "p_refeicao": "almoco", "p_comentario": "teste W11", "p_data_hora": agora})
    p.check(st == 200 and isinstance(r, dict) and r.get("id"), f"5. diario_enviar grava o registro ({st})")
    st, d = rpc("w10-aluno", "minha_dieta", {"p_dia": hoje})
    p.check([x["path"] for x in d["diario"]] == [caminho], "5. a minha_dieta devolve o registro com o arquivo (P29)")
    st, assinada, _ = B.http("POST", f"{B.PRINCIPAL_URL}/storage/v1/object/sign/{bucket}/{caminho}", {"expiresIn": 60},
                             {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {tok_d}"})
    p.check(st == 200 and isinstance(assinada, dict) and assinada.get("signedURL"), f"5. o aluno assina a URL da PRÓPRIA foto ({st})")
    st, outro, _ = B.http("POST", f"{B.PRINCIPAL_URL}/storage/v1/object/sign/{bucket}/{caminho}", {"expiresIn": 60},
                          {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {tok_paula}"})
    p.check(st >= 400, f"5. outra aluna NÃO assina a foto do Diego ({st})")
    fila_depois = B.sql_principal(f"select count(*)::int as n from {S}.mensagens_whatsapp")[0]["n"]
    p.check(fila_depois == fila_antes, f"5. nenhum WhatsApp entrou na fila com ✓ e foto ({fila_antes} → {fila_depois})")
    print("limpeza:", M.limpar([diego["id"], pac["id"], paula["id"]]))
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
