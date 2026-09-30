#!/usr/bin/env python3
"""Physiq W7 — E2E de SERVIDOR (staging, só contas de TESTE; em série — o Banco do Treino é uma VM Nano):

  api          meu_perfil_aluno / minha_agenda como a pessoa; as funções de exportar/excluir fechadas para o app (só
               service_role); a prévia do código (nome, foto e tipo — nada de e-mail/telefone/ids; não vincula); Exportar da
               descartável (JSON dos 2 bancos); os NEGATIVOS do Excluir (confirmação errada, sem login, dono, membro da equipe,
               master de teste) sem apagar nada; a conferência (simular) com as contagens da massa
  foto <conta> [rótulo]   contagem das tabelas tocadas (inteiras e as linhas da conta) → <backup>/contagens-<conta>-<rótulo>.json
  conferir <conta>        depois da exclusão: só as linhas da conta sumiram (o resto igual), login fora dos 2 bancos, o que
                          fica com o profissional continua (desligado do login), arquivos do Storage apagados
  excluir <conta>         exclui pela API (a mesma chamada da tela) — as descartáveis que a tela não excluiu
Uso: python3 e2e/w07/api.py api | foto excluir1 antes | conferir excluir1 | excluir excluir2
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

p = B.p

TABS_P = ["pacientes", "profiles", "diario_alimentar", "refeicoes_concluidas", "metas_concluidas", "mensagens_whatsapp", "avisos",
          "agendamentos", "cobrancas", "antropometrias", "planos_alimentares", "refeicoes", "metas", "recibos", "registros_prontuario"]
TABS_T = ["physiq_profiles", "physiq_avaliacoes", "physiq_registros_fotos", "physiq_pagamentos", "physiq_assinaturas", "physiq_identidades",
          "tb_treino_series", "tb_treino_concluido", "tb_treino_dia_override", "treino_historico", "exercicio_ordem_usuario",
          "tb_exercicios_usuario", "tb_grupos_treino_usuario", "tb_grupos_exercicios_usuario", "tb_academias", "tb_academia_pesos",
          "tb_semana_treinos", "tb_series_padrao_usuario", "tb_grupos_treino_perfis", "edge_rate_limits"]
# a coluna da pessoa em cada tabela (principal: o login ou a matrícula; Treino: o id de lá)
COL_P = {"pacientes": "user_id", "profiles": "id", "avisos": "destino_user_id"}
COL_T = {"physiq_profiles": "id", "physiq_identidades": "treino_user_id"}


def f_excluir(conta: str, corpo: dict, tok: str | None = None) -> tuple[int, dict]:
    st, r = B.funcao(tok or B.token(conta), "excluir-minha-conta", corpo)
    return st, (r if isinstance(r, dict) else {"_bruto": r})


def foto(conta: str, rotulo: str) -> dict:
    """Contagem inteira de cada tabela + as linhas da conta (principal pela matrícula/login; Treino pelo id de lá)."""
    u = B.uid(conta)
    pids = [m["id"] for m in B.matriculas(conta)] if u else []
    tid = B.treino_id(conta) if u else None
    if not tid:
        # depois da exclusão o vínculo sumiu: o id do Treino fica guardado na foto de antes
        antes = B.BACKUP / f"contagens-{conta}-antes.json"
        if antes.exists():
            tid = json.loads(antes.read_text()).get("treino_user_id")
    if not pids:
        antes = B.BACKUP / f"contagens-{conta}-antes.json"
        if antes.exists():
            pids = json.loads(antes.read_text()).get("matriculas", [])
    lista = ",".join(f"'{x}'" for x in pids) or "null"
    sel_p = []
    for t in TABS_P:
        col = COL_P.get(t)
        if t in ("refeicoes",):
            cond = f"plano_id in (select id from {B.schema()}.planos_alimentares where paciente_id in ({lista}))"
        elif t == "pacientes":
            cond = f"id in ({lista})"
        elif col:
            cond = f"{col} = '{u}'" if u else "false"
        else:
            cond = f"paciente_id in ({lista})"
        sel_p.append(f"select '{t}' tabela, (select count(*) from {B.schema()}.{t}) total, (select count(*) from {B.schema()}.{t} where {cond}) da_conta")
    principal = {r["tabela"]: {"total": r["total"], "da_conta": r["da_conta"]} for r in B.sql_principal(" union all ".join(sel_p))}
    treino = {}
    if tid:
        sel_t = []
        for t in TABS_T:
            col = COL_T.get(t, "user_id")
            sel_t.append(f"select '{t}' tabela, (select count(*) from {B.schema()}.{t}) total, (select count(*) from {B.schema()}.{t} where {col} = '{tid}') da_conta")
        treino = {r["tabela"]: {"total": r["total"], "da_conta": r["da_conta"]} for r in B.sql_treino(" union all ".join(sel_t))}
    login_p = B.sql_principal(f"select count(*)::int n from auth.users where id = '{u}'")[0]["n"] if u else 0
    login_t = B.sql_treino(f"select id::text, email, deleted_at, (select count(*) from auth.identities i where i.user_id = u.id) as identidades from auth.users u where id = '{tid}'") if tid else []
    dados = {"conta": conta, "rotulo": rotulo, "em": time.strftime("%Y-%m-%d %H:%M:%S"), "principal_user_id": u, "matriculas": pids,
             "treino_user_id": tid, "principal": principal, "treino": treino, "login_principal": login_p, "login_treino": login_t}
    B.json_arquivo(B.BACKUP / f"contagens-{conta}-{rotulo}.json", dados)
    return dados


def caso_api() -> None:
    print("\n== leitura do Perfil (como a pessoa)")
    st, r = B.rpc(B.token("w7-aluno"), "meu_perfil_aluno", {})
    profs = (r or {}).get("profissionais", []) if isinstance(r, dict) else []
    p.check(st == 200 and r.get("nome") == "Rafael Moura" and str(r.get("aluno_desde", "")).startswith("2026-03-10") and r.get("objetivo") == "definição",
            f"meu_perfil_aluno: nome, aluno desde e objetivo ({st} {str(r)[:160]})")
    p.check(sorted((x["papel"], x["nome"]) for x in profs) == [("nutricionista", "Camila Rocha"), ("personal", "Lucas Ferreira")]
            and all(x.get("whatsapp") and x.get("foto_url") for x in profs), f"Meus profissionais: Lucas (personal) e Camila (nutri) com WhatsApp e foto ({profs})")
    st, r = B.rpc(B.token("w7-paciente"), "minha_agenda", {"p_desde": "2026-06-01T00:00:00Z"})
    p.check(st == 200 and isinstance(r, list) and len(r) == 3 and all("observacao" not in a for a in r),
            f"minha_agenda do paciente: as 3 consultas, sem a observação interna ({st} {len(r) if isinstance(r, list) else r})")
    st, r = B.rpc(B.token("w7-treino"), "minha_agenda", {})
    p.check(st == 200 and r == [], f"minha_agenda de quem não tem consulta: vazia ({st} {r})")

    print("\n== as funções de exportar/excluir/prévia fechadas para o app (só a borda, com a service_role)")
    for fn, args in (("exportar_dados_aluno", {"p_uid": B.uid("w7-aluno")}), ("excluir_dados_aluno", {"p_uid": B.uid("w7-aluno"), "p_simular": True}),
                     ("previa_vinculo_por_codigo", {"p_user": B.uid("w7-aluno"), "p_codigo": "PROF-LUCAS-FERREIRA"})):
        st, r = B.rpc(B.token("w7-aluno"), fn, args)
        p.check(st in (401, 403, 404) or (isinstance(r, dict) and r.get("code") == "42501"), f"rpc {fn} como aluno → recusado ({st} {str(r)[:90]})")

    print("\n== prévia do código (popup) — não vincula nada")
    antes = B.sql_principal(f"select count(*)::int n from {B.schema()}.pacientes where user_id = '{B.uid('excluir2')}'")[0]["n"]
    st, r = B.funcao(B.token("excluir2"), "vincular-aluno", {"codigo": "prof-lucas-ferreira", "previa": True})
    prof = (r or {}).get("profissional") or {}
    p.check(st == 200 and r.get("ok") is True and prof.get("nome") == "Lucas Ferreira" and prof.get("tipo_perfil") == "personal" and prof.get("foto_url"),
            f"prévia com código certo: nome, foto e tipo ({st} {str(r)[:200]})")
    proibidos = [k for k in ("email", "telefone", "whatsapp", "id", "user_id", "conta_id", "dados_profissionais") if k in prof or k in (r or {})]
    p.check(not proibidos, f"prévia sem e-mail, telefone ou ids ({proibidos})")
    st, r = B.funcao(B.token("excluir2"), "vincular-aluno", {"codigo": "PROF-NAO-EXISTE-W7", "previa": True})
    p.check(st == 404 and (r or {}).get("erro") == "codigo_invalido", f"prévia com código errado → 404 codigo_invalido ({st} {r})")
    st, r = B.funcao(B.token("w7-aluno"), "vincular-aluno", {"codigo": "PROF-CAMILA-ROCHA-W7", "previa": True})
    p.check(st == 200 and r.get("ok") is True and r.get("ja_era") is True, f"prévia de quem já é aluno dela → 'já está na lista' ({st} {str(r)[:140]})")
    depois = B.sql_principal(f"select count(*)::int n from {B.schema()}.pacientes where user_id = '{B.uid('excluir2')}'")[0]["n"]
    p.check(antes == depois == 0, f"a prévia não vinculou ninguém (matrículas {antes} → {depois})")

    print("\n== Exportar meus dados (excluir1: os 2 bancos)")
    if not B.saude_treino():
        raise SystemExit("Treino lento/instável — parei")
    t0 = time.time()
    st, r = B.funcao(B.token("excluir1"), "exportar-meus-dados", {})
    dt_ = time.time() - t0
    ok = st == 200 and isinstance(r, dict) and r.get("formato") == "physiq-exportacao/1"
    p.check(ok, f"exportar-meus-dados 200 em {dt_:.1f} s ({st} {str(r)[:120] if not ok else ''})")
    if ok:
        B.json_arquivo(B.PRINTS.parent.parent / "w07" / "exportacao-excluir1.json", r)
        bp, bt = r.get("banco_principal") or {}, r.get("banco_do_treino") or {}
        tp, tt = bp.get("tabelas", {}), bt.get("tabelas", {})
        p.check(bp.get("login", {}).get("email") == B.EMAIL["excluir1"] and len(bp.get("matriculas", [])) == 1,
                f"principal: login e 1 matrícula ({bp.get('login', {}).get('email')}, {len(bp.get('matriculas', []))})")
        p.check(len(tp.get("diario_alimentar", [])) == 1 and len(tp.get("metas_concluidas", [])) == 1 and len(tp.get("refeicoes_concluidas", [])) == 1
                and len(tp.get("agendamentos", [])) == 1 and len(tp.get("cobrancas", [])) == 1 and len(tp.get("antropometrias", [])) == 1,
                "principal: diário, ✓ de meta e refeição, agenda, cobrança e antropometria no arquivo")
        m = (bp.get("matriculas") or [{}])[0]
        p.check("resumo" not in m and "link_codigo" not in m and all("path" not in d for d in tp.get("diario_alimentar", [])),
                "principal: sem o resumo privado, sem o código do link e sem o caminho interno das fotos")
        p.check(len(tt.get("tb_treino_series", [])) == 2 and len(tt.get("treino_historico", [])) == 1 and len(tt.get("physiq_avaliacoes", [])) == 1
                and len(tt.get("tb_academias", [])) == 1 and bt.get("perfil", {}).get("id") == B.treino_id("excluir1"),
                f"Treino: séries (2), histórico, avaliação, academia e o perfil ({ {k: len(v) for k, v in tt.items() if v} })")
        p.check(bool((bt.get("referencias") or {}).get("exercicios")), "Treino: nomes dos exercícios citados (referencias)")
    st, r = B.funcao(B.token("w7-paciente"), "exportar-meus-dados", {})
    p.check(st == 200 and r.get("banco_do_treino") is None and len((r.get("banco_principal") or {}).get("tabelas", {}).get("agendamentos", [])) == 3,
            f"exportar de quem só tem Nutrição: sem Treino, com a agenda ({st})")

    print("\n== Excluir — NEGATIVOS (nada pode ser apagado)")
    foto_antes = foto("excluir1", "antes")
    st, r = f_excluir("excluir1", {"confirmacao": "EXCLUI"})
    p.check(st == 400 and r.get("erro") == "confirmacao_invalida", f"confirmação errada → 400 ({st} {r})")
    st, r = f_excluir("excluir1", {})
    p.check(st == 400 and r.get("erro") == "confirmacao_invalida", f"sem confirmação → 400 ({st} {r})")
    st, r, _ = B.http("POST", f"{B.PRINCIPAL_URL}/functions/v1/excluir-minha-conta", {"confirmacao": "EXCLUIR"},
                      {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {B.anon(B.PRINCIPAL_REF)}", "x-schema": B.schema()})
    p.check(st == 401, f"sem login (só o anon) → 401 ({st} {r})")
    for staff in ("w7-personal", "w7-nutri"):
        st, r = f_excluir(staff, {"simular": True})
        p.check(st == 403 and r.get("erro") == "profissional", f"{staff} (conferir) → 403 profissional ({st} {r})")
        st, r = f_excluir(staff, {"confirmacao": "EXCLUIR"})
        p.check(st == 403 and r.get("erro") == "profissional", f"{staff} com EXCLUIR → 403 profissional ({st} {r})")
    # o master de teste é de outra W: só a conferência (simular nunca apaga) — a recusa vem antes de qualquer coisa
    st, r = f_excluir("master", {"simular": True})
    p.check(st == 403 and r.get("erro") == "profissional", f"master de teste (conferir) → 403 profissional ({st} {r})")
    for staff in ("w7-personal", "w7-nutri", "master"):
        p.check(B.uid(staff) is not None, f"{staff} continua com login")
    depois = foto("excluir1", "depois-negativos")
    p.check(depois["principal"] == foto_antes["principal"] and depois["treino"] == foto_antes["treino"] and depois["login_principal"] == 1,
            "negativos não mudaram NENHUMA contagem da excluir1 (nos 2 bancos)")

    print("\n== Excluir — conferência (simular) da excluir1")
    st, r = f_excluir("excluir1", {"simular": True})
    ap, at = (r.get("apaga") or {}).get("principal", {}), (r.get("apaga") or {}).get("treino") or {}
    mp, mt = (r.get("mantem") or {}).get("principal", {}), (r.get("mantem") or {}).get("treino") or {}
    p.check(st == 200 and r.get("simulacao") is True and ap.get("diario_alimentar") == 1 and ap.get("refeicoes_concluidas") == 1 and ap.get("metas_concluidas") == 1
            and at.get("tb_treino_series") == 2 and at.get("treino_historico") == 1 and at.get("tb_academias") == 1,
            f"conferência: o que apaga ({ap} · {at})")
    p.check(mp.get("matriculas") == 1 and mp.get("cobrancas") == 1 and mp.get("agendamentos") == 1 and mt.get("physiq_avaliacoes") == 1
            and mt.get("physiq_registros_fotos") == 1, f"conferência: o que fica com o profissional ({mp} · {mt})")
    p.check(foto("excluir1", "depois-conferencia")["principal"] == foto_antes["principal"], "a conferência não mudou nada")


def conferir(conta: str) -> None:
    antes = json.loads((B.BACKUP / f"contagens-{conta}-antes.json").read_text())
    d = foto(conta, "depois")
    print(f"\n== {conta}: depois da exclusão")
    p.check(d["login_principal"] == 0, "login do banco principal apagado (auth.users)")
    lt = d["login_treino"][0] if d["login_treino"] else None
    p.check(lt is None or (lt.get("deleted_at") and "@" not in str(lt.get("email") or "") and int(lt.get("identidades") or 0) >= 0),
            f"login do Treino: soft delete (e-mail embaralhado, deleted_at) ({lt})")
    apaga_p = {"diario_alimentar", "refeicoes_concluidas", "metas_concluidas", "avisos", "profiles"}
    fica_p = {"pacientes", "agendamentos", "cobrancas", "antropometrias", "planos_alimentares", "refeicoes", "metas", "recibos", "registros_prontuario"}
    for t in TABS_P:
        a, b = antes["principal"][t], d["principal"][t]
        if t in apaga_p:
            ok = b["da_conta"] == 0 and b["total"] == a["total"] - a["da_conta"]
            p.check(ok, f"principal.{t}: apagou as {a['da_conta']} da conta e só elas (total {a['total']} → {b['total']})")
        elif t in fica_p:
            p.check(b["total"] == a["total"], f"principal.{t}: fica ({a['total']} → {b['total']}; da conta {a['da_conta']})")
    apaga_t = {"tb_treino_series", "tb_treino_concluido", "tb_treino_dia_override", "treino_historico", "exercicio_ordem_usuario", "tb_exercicios_usuario",
               "tb_grupos_treino_usuario", "tb_grupos_exercicios_usuario", "tb_academias", "tb_academia_pesos", "edge_rate_limits", "physiq_identidades"}
    for t in TABS_T:
        if not antes["treino"]:
            break
        a, b = antes["treino"][t], d["treino"][t]
        if t == "edge_rate_limits":  # a fila de limites muda sozinha com os logins de outras contas
            p.check(b["da_conta"] == 0, f"treino.{t}: nenhuma linha da conta ({a['da_conta']} → {b['da_conta']})")
        elif t in apaga_t:
            p.check(b["da_conta"] == 0 and b["total"] == a["total"] - a["da_conta"], f"treino.{t}: apagou as {a['da_conta']} da conta e só elas ({a['total']} → {b['total']})")
        elif t == "tb_semana_treinos":
            p.check(b["total"] >= a["total"] - a["da_conta"], f"treino.{t}: só a semana dos treinos próprios saiu ({a['total']} → {b['total']})")
        else:
            p.check(b["total"] == a["total"] and b["da_conta"] == a["da_conta"], f"treino.{t}: fica com o profissional ({a['da_conta']} da conta)")
    if antes["matriculas"]:
        lista = ",".join(f"'{x}'" for x in antes["matriculas"])
        m = B.sql_principal(f"select id::text, user_id::text, ativo, config ->> 'conta_excluida_em' as excluida from {B.schema()}.pacientes where id in ({lista})")
        p.check(all(x["user_id"] is None and x["ativo"] is False and x["excluida"] for x in m), f"matrícula desligada do login e desativada ({m})")
        arq = B.sql_principal(f"select count(*)::int n from storage.objects where bucket_id = 'diario' and name like '{antes['matriculas'][0]}/%'")[0]["n"]
        p.check(arq == 0, f"fotos do diário apagadas do Storage ({arq})")
    if antes["principal_user_id"]:
        bucket = "fotos-perfil-staging" if B.schema() == "staging" else "fotos-perfil"
        fp = B.sql_principal(f"select count(*)::int n from storage.objects where bucket_id = '{bucket}' and name like '{antes['principal_user_id']}/%'")[0]["n"]
        p.check(fp == 0, f"foto do Perfil apagada do Storage ({fp})")
    if antes.get("treino_user_id"):
        pr = B.sql_treino(f"select status, foto_url, professor_id::text from {B.schema()}.physiq_profiles where id = '{antes['treino_user_id']}'")
        p.check(bool(pr) and pr[0]["status"] == "excluido" and pr[0]["foto_url"] is None, f"Treino: o cadastro fica com o profissional, marcado 'excluido' ({pr})")


def excluir(conta: str) -> None:
    assert conta in B.DESCARTAVEIS, "só as descartáveis desta W"
    st, r = f_excluir(conta, {"confirmacao": "EXCLUIR"})
    p.check(st == 200 and r.get("ok") is True, f"excluir {conta} pela API ({st} {str(r)[:300]})")
    B.esquecer_token(conta)
    st2, r2, _ = B.http("POST", f"{B.PRINCIPAL_URL}/auth/v1/token?grant_type=password", {"email": B.EMAIL[conta], "password": B.CONTAS[conta][1]},
                        {"apikey": B.anon(B.PRINCIPAL_REF)})
    p.check(st2 == 400, f"{conta} não entra mais (login com a senha → {st2})")


def main() -> int:
    B.ESTADO["schema"] = "staging"  # os testes desta W rodam no staging (o smoke de produção importa as funções com "public")
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    cmd = sys.argv[1]
    if cmd == "api":
        caso_api()
    elif cmd == "foto":
        print(json.dumps(foto(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "antes"), ensure_ascii=False, indent=1)[:3000])
    elif cmd == "conferir":
        conferir(sys.argv[2])
    elif cmd == "excluir":
        excluir(sys.argv[2])
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
