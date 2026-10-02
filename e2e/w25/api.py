#!/usr/bin/env python3
"""Physiq W25 — E2E das leituras do Dashboard pela API (staging): quem vê o quê (P1, módulos, regra clínica) e o número = tela.

  principal  painel_resumo e alunos_novos_por_mes como o dono (Lucas), a nutricionista (Camila), o 2º personal (Bruno), o aluno
             (Rafael — recusa) e sem login; o total de ativos = o da lista de Alunos (alunos_da_conta, filtro "Ativos"); os novos por
             mês = a contagem direta no banco com a mesma P1; a dieta só para quem é nutricionista da conta;
  treino     painel-resumo-treino com a sessão do Treino: o dono vê os alunos da conta, o personal só os dele, o aluno é recusado, sem
             token/anon/conta alheia/conta inválida recusados; leve (tempo de resposta) e o /health do Treino antes de cada bloco.
Uso: python3 e2e/w25/api.py   (staging; a massa: python3 e2e/w25/massa.py)
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p


def contar_novos_sql(conta: str, quem: str | None) -> dict:
    """A conta direta no banco (o que a função tem que devolver): matrículas fora da lixeira por mês de São Paulo, com a P1."""
    filtro = "" if quem is None else f"and (p.personal_id = '{quem}' or p.nutricionista_id = '{quem}')"
    r = B.sql_principal(f"""select to_char(date_trunc('month', p.created_at at time zone 'America/Sao_Paulo'), 'YYYY-MM') as mes, count(*)::int as n
                            from {S}.pacientes p where p.conta_id = '{conta}' and p.deleted_at is null {filtro}
                              and p.created_at >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '5 months') at time zone 'America/Sao_Paulo'
                            group by 1""")
    return {x["mes"]: x["n"] for x in r}


def main() -> None:
    conta = B.conta_w13()
    lucas, camila, bruno = B.uid("w13-dono"), B.uid("w13-nutri"), B.uid("w13-personal2")

    # ───────── principal ─────────
    B.saude_ok("principal (painel_resumo)")
    st, r = B.resumo_principal("w13-dono", conta)
    p.check(st == 200 and r.get("ok") is True, f"[dono] painel_resumo 200 ({st})")
    lista = B.lista_alunos("w13-dono", conta)
    nomes = sorted(a["nome"] for a in r["alunos"])
    p.check(len(r["alunos"]) == lista["total"] == lista["contagens"]["ativos"],
            f"[dono] alunos ativos = os da página Alunos no filtro Ativos ({len(r['alunos'])} = {lista['total']})")
    p.check(all(a.get("dieta") is None for a in r["alunos"]), "[dono sem papel de nutri] dieta = null para todos (regra clínica)")
    p.check(r["eu"]["dono"] is True and r["eu"]["nutricionista"] is False, f"[dono] eu = dono, sem nutri ({r['eu']})")
    marina = next((a for a in r["alunos"] if a["nome"] == "Marina Alves"), None)
    import datetime as _dt
    h = _dt.date.fromisoformat(B.hoje())
    sabado = (h + _dt.timedelta(days=(5 - h.weekday()) % 7)).isoformat()
    p.check(bool(marina and (marina["nascimento"] or "")[5:] == sabado[5:]), f"[dono] o nascimento vem (aniversariantes): Marina {marina and marina['nascimento']} (sábado {sabado})")

    st, rc = B.resumo_principal("w13-nutri", conta)
    p.check(st == 200 and rc.get("ok") is True, f"[nutri] painel_resumo 200 ({st})")
    lista_c = B.lista_alunos("w13-nutri", conta)
    p.check(len(rc["alunos"]) == lista_c["total"], f"[nutri] só os alunos dela = a lista de Alunos dela ({len(rc['alunos'])} = {lista_c['total']})")
    com_dieta = {a["nome"]: a["dieta"] for a in rc["alunos"] if a.get("dieta")}
    p.check("Larissa Prado" in com_dieta and "Rafael Moura" in com_dieta, f"[nutri] a dieta dos alunos de nutrição dela ({sorted(com_dieta)})")
    lar = com_dieta.get("Larissa Prado") or {}
    p.check(lar.get("ultima_marcacao") == B.dias_atras(4) and len(lar.get("planos", [])) >= 1 and lar["planos"][0]["refeicoes"],
            f"[nutri] Larissa: último ✓ há 4 dias e o plano com as refeições ({lar.get('ultima_marcacao')})")
    p.check(all(a["nutricionista_id"] == camila or a["personal_id"] == camila for a in rc["alunos"]), "[nutri] P1: nenhum aluno de outro profissional")

    st, rb = B.resumo_principal("w13-personal2", conta)
    lista_b = B.lista_alunos("w13-personal2", conta)
    p.check(st == 200 and len(rb["alunos"]) == lista_b["total"] and [a["nome"] for a in rb["alunos"]] == ["Carlos Souza"],
            f"[personal 2] só os alunos dele ({[a['nome'] for a in rb.get('alunos', [])]})")

    st, ra = B.resumo_principal("w13-aluno", conta)
    p.check(st == 200 and ra.get("ok") is False and ra.get("erro") == "sem_acesso", f"[aluno] painel_resumo recusado ({ra})")
    st, rn = B.resumo_principal("", conta)
    p.check(st in (200, 401) and (not isinstance(rn, dict) or rn.get("ok") is not True), f"[sem login] painel_resumo recusado ({st} {str(rn)[:80]})")

    for quem, conta_p, filtro in (("w13-dono", None, None), ("w13-personal2", bruno, bruno), ("w13-nutri", camila, camila)):
        st, n = B.novos_por_mes(quem, conta)
        esperado = contar_novos_sql(conta, filtro)
        meses = {m["mes"]: m["novos"] for m in (n or {}).get("meses", [])}
        p.check(st == 200 and n.get("ok") and len(meses) == 6 and all(meses.get(k, 0) == v for k, v in esperado.items()) and sum(meses.values()) == sum(esperado.values()),
                f"[{quem}] novos por mês = a contagem do banco com a P1 ({meses} × {esperado})")
    st, n = B.novos_por_mes("w13-aluno", conta)
    p.check(st == 200 and n.get("ok") is False, f"[aluno] novos por mês recusado ({n})")

    # ───────── Banco do Treino ─────────
    B.saude_ok("treino (painel-resumo-treino)")
    tok_lucas = B.treino_token("w13-dono")
    st, rt, seg = B.resumo_treino(tok_lucas, conta)
    nomes_t = sorted(a["nome"] for a in (rt or {}).get("alunos", []))
    p.check(st == 200 and nomes_t == ["Carlos Souza", "Rafael Moura"], f"[dono] o treino dos alunos da conta ({nomes_t}, {seg:.1f}s)")
    p.check(seg < 8, f"[dono] leve: respondeu em {seg:.1f}s")
    rafa = next((a for a in rt["alunos"] if a["nome"] == "Rafael Moura"), {})
    carlos = next((a for a in rt["alunos"] if a["nome"] == "Carlos Souza"), {})
    p.check(rafa.get("ultimo_treino") == B.hoje() and rafa.get("proxima_avaliacao") == B.dias_atras(12), f"[dono] Rafael: treinou hoje e a próxima avaliação passou ({rafa.get('ultimo_treino')}, {rafa.get('proxima_avaliacao')})")
    p.check(carlos.get("ultimo_treino") == B.dias_atras(10) and len(carlos.get("semana", [])) == 3, f"[dono] Carlos: último treino há 10 dias, semana seg/qua/sex ({carlos.get('ultimo_treino')})")
    recs = [x for x in rt.get("recordes", []) if x["user_id"] == rafa.get("id") and float(x["peso"]) == 46.0]
    p.check(len(recs) == 1 and float(recs[0]["anterior"] or 0) >= 44, f"[dono] o supino de 46 kg de hoje com a maior carga de antes ({recs[:1]})")
    p.check(any(h["nome_treino"] == "Treino A" for h in rt.get("historico", [])), "[dono] o Treino A concluído hoje no histórico")
    time.sleep(3)
    B.saude_ok("treino (personal e recusas)")
    tok_bruno = B.treino_token("w13-personal2")
    st, rt2, _ = B.resumo_treino(tok_bruno, conta)
    p.check(st == 200 and [a["nome"] for a in rt2.get("alunos", [])] == ["Carlos Souza"] and rt2.get("todos") is False,
            f"[personal 2] só o aluno dele ({[a['nome'] for a in (rt2 or {}).get('alunos', [])]})")
    time.sleep(3)
    tok_rafa = B.treino_token("w13-aluno")
    st, r3, _ = B.resumo_treino(tok_rafa, conta)
    p.check(st == 403 and (r3 or {}).get("error") == "sem_acesso", f"[aluno] recusado ({st} {r3})")
    st, r4, _ = B.resumo_treino(None, conta)
    p.check(st == 401, f"[sem token] o gateway recusa (verify_jwt = true) ({st})")
    st, r5, _ = B.resumo_treino(B.anon(B.TREINO_REF), conta)
    p.check(st == 401 and (r5 or {}).get("error") == "invalid_token", f"[anon] recusado ({st} {r5})")
    st, r6, _ = B.resumo_treino(tok_lucas, "00000000-0000-4000-8000-000000000000")
    p.check(st == 403, f"[conta alheia] recusado ({st} {r6})")
    st, r7, _ = B.resumo_treino(tok_lucas, "nao-e-uuid")
    p.check(st == 400 and (r7 or {}).get("error") == "conta_invalida", f"[conta inválida] 400 ({st} {r7})")
    # a sessão do PRINCIPAL não serve (o token é do outro banco)
    st, r8, _ = B.resumo_treino(B.token("w13-dono"), conta)
    p.check(st == 401, f"[token do principal] recusado ({st} {str(r8)[:80]})")
    B.saude_ok("fim do api.py")
    raise SystemExit(p.fim())


if __name__ == "__main__":
    main()
