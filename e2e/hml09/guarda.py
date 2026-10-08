#!/usr/bin/env python3
"""Physiq hml-09 (H-23) — a GUARDA do staging: a exclusão de conta pelo staging não alcança quem tem dado em produção (o Auth é o
mesmo nos 2 ambientes) e o modo app da delete-my-account (Treino) não apaga mais nada. STAGING; só contas
*.teste.claude@physiqnutri.app (P26). Spec: ~/projetos/physiqcalc-scratch/hml/hml09/spec.md §4.3. Ordem: simular --esperado antes
→ deploy (migrations do staging, delete-my-account, excluir-minha-conta) → simular --esperado depois → modo-app.

  simular --esperado antes|depois
      prova.teste.claude e w7b.prod.teste.claude (2 das 7 contas de teste com dado em produção; sessão por link mágico, sem senha —
      só depois de conferir que o login existe) → excluir-minha-conta com x-schema staging pedindo SÓ a simulação, nos 2 fluxos:
      o do aluno ({simular} — app-aluno/perfil/pecas/api.ts:99) e o do profissional ({simular, fluxo} — painel/configuracoes/
      excluirConta/api.ts:101,113). NENHUM caminho deste subcomando manda a confirmação: o corpo sai de corpo_da_simulacao(), que só
      sabe simular, e o envio confere de novo.
        antes   (antes do deploy) o furo: em pelo menos 1 dos 2 fluxos de cada conta a simulação passa (200 — a exclusão de verdade
                seguiria); o outro fluxo pode dar a recusa de hoje (aluno: profissional/assinatura_ativa; profissional:
                nao_profissional/assinatura_ativa);
        depois  (depois do deploy) 403 conta_real_no_staging + motivo dados_em_producao nos 2 fluxos das 2 contas.
      Antes e depois de CADA pedido: COUNT por coluna de FK public → auth.users (do catálogo) e o login (auth.users, identities)
      pelo uid, só leitura — iguais; se mudar, para na hora (nenhum pedido a mais).
  modo-app (SÓ depois do deploy)
      excluir3 (a descartável da W7): login por senha e o JWT do Treino pela trocar-token com x-schema staging (o caminho do
      e2e/w05/_base.py) → delete-my-account do Treino SEM o segredo e com o corpo do APK antigo ({confirm: "DELETE_MY_ACCOUNT"}) →
      410 {ok: false, error: "migrado"} com CORS; o login do Treino continua (auth.users.deleted_at nulo) e as contagens do tid não
      mudam (só leitura); OPTIONS com Origin https://physiqcalc.com.br → 200 com Access-Control-Allow-Origin.
      TRAVA: antes do corpo do APK vai um pedido SEM a confirmação; o corpo do APK só sai se esse já vier 410 "migrado" (a função
      nova publicada) e se o JWT for o da excluir3 — na função antiga, o corpo do APK apaga DE VEZ o login do Treino.
      Sem a excluir3 (ou sem a senha dela em ~/.physiq-teste-excluir3): rodar antes `python3 e2e/w07/contas.py --so-descartaveis`.
  No fim de cada subcomando: logout (scope=local) SÓ das sessões que o próprio teste abriu.
Saída: ✅/❌ por caso; cópia em ~/projetos/physiqcalc-scratch/hml/hml09/guarda_<subcomando>_<esperado>.txt; código 1 se falhar.
Sem dado pessoal na saída: só códigos, contagens e os rótulos das contas.
Uso: python3 e2e/hml09/guarda.py simular --esperado antes
     python3 e2e/hml09/guarda.py modo-app
"""
from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_comum_hml09", Path(__file__).resolve().parent / "_comum.py")
C = importlib.util.module_from_spec(_ESPEC)
sys.modules["_comum_hml09"] = C
_ESPEC.loader.exec_module(C)  # type: ignore[union-attr]

S = "staging"
C.B5.ESTADO["schema"] = S
# as contas de TESTE com dado em produção (spec §2.1): SÓ a simulação — nunca a confirmação
ALVOS = {"prova": "prova.teste.claude@physiqnutri.app", "w7b.prod": "w7b.prod.teste.claude@physiqnutri.app"}
# a descartável da W7 (e2e/w07/contas.py --so-descartaveis): o ÚNICO destino do corpo do APK antigo
DESCARTAVEL, EMAIL_DESCARTAVEL = "excluir3", "excluir3.teste.claude@physiqnutri.app"
FLUXOS = ("aluno", "profissional")
# as recusas de hoje (sem a trava), que o "antes" aceita no fluxo que não é o da pessoa
RECUSAS_DE_HOJE = {
    "aluno": {(403, "profissional"), (409, "assinatura_ativa")},
    "profissional": {(409, "nao_profissional"), (409, "assinatura_ativa"), (403, "profissional")},
}
CORPO_DO_APK = {"confirm": "DELETE_MY_ACCOUNT"}  # o botão da TreinosPage antiga (APK ≤ 3.7; saiu na W8, 61f1ee9)
ORIGEM_APK = "https://localhost"  # a WebView do Capacitor no Android
# os 12 deletes do modo app antigo (delete-my-account:200-211) — a maioria sem FK para auth.users: contados à parte
DOZE_DO_APK = [("tb_treino_series", "user_id"), ("tb_treino_concluido", "user_id"), ("tb_treino_dia_override", "user_id"),
               ("treino_historico", "user_id"), ("exercicio_ordem_usuario", "user_id"), ("tb_grupos_treino_usuario", "user_id"),
               ("tb_exercicios_usuario", "user_id"), ("tb_grupos_exercicios_usuario", "user_id"), ("tb_exercicio_comentarios", "user_id"),
               ("physiq_avaliacoes", "user_id"), ("physiq_user_tags", "user_id"), ("physiq_profiles", "id")]
for _email in (*ALVOS.values(), EMAIL_DESCARTAVEL):
    assert C.eh_email_de_teste(_email), _email


# ───────────────────────── simular (as 2 contas com dado em produção) ─────────────────────────


def corpo_da_simulacao(fluxo: str) -> dict:
    """O ÚNICO corpo que este script manda à excluir-minha-conta: a simulação (nada muda). Não existe parâmetro de confirmação."""
    if fluxo == "aluno":
        return {"simular": True}  # conferirExclusao (app-aluno/perfil/pecas/api.ts:99, pelo functions.invoke)
    if fluxo == "profissional":
        return {"simular": True, "fluxo": "profissional"}  # conferirExclusaoProfissional (excluirConta/api.ts:101,113, fetch direto)
    raise ValueError(fluxo)


def simular(token: str, fluxo: str) -> tuple[int, dict]:
    corpo = corpo_da_simulacao(fluxo)
    if corpo.get("simular") is not True or set(corpo) - {"simular", "fluxo"}:  # trava de novo, no envio
        raise C.Parou("TRAVA: só a simulação vai para estas contas")
    st, r, _ = C.funcao(C.PRINCIPAL_URL, "excluir-minha-conta", corpo, token, C.anon(C.PRINCIPAL_REF), S, C.ORIGEM_STAGING)
    return st, r


def contagens(uid: str) -> dict[str, int]:
    """COUNT por coluna de FK public → auth.users (do catálogo) + o login, pelo uid — só leitura."""
    n = C.contar(C.PRINCIPAL_REF, C.fks(C.PRINCIPAL_REF, ("public",)), uid)
    u = C.txt(uid)
    r = C.ler(C.PRINCIPAL_REF, f"select (select count(*) from auth.users where id = {u}::uuid)::int as users, "
                               f"(select count(*) from auth.identities where user_id = {u}::uuid)::int as identities")[0]
    n.update({"auth.users": r["users"], "auth.identities": r["identities"]})
    return n


def avaliar(o: C.Saida, rotulo: str, fluxo: str, esperado: str, st: int, r: dict) -> None:
    res, erro = C.resumo(r), r.get("erro")
    if st == 200 and r.get("simulacao") is not True:  # um 200 que não é a simulação: nunca deveria existir
        o.ok(False, f"[{rotulo}/{fluxo}] 200 SEM simulacao=true — parei, nenhum pedido a mais ({res})", parar=True)
    if esperado == "depois":
        o.ok(st == 403 and erro == "conta_real_no_staging" and r.get("motivo") == "dados_em_producao",
             f"[{rotulo}/{fluxo}] pelo staging → 403 conta_real_no_staging + dados_em_producao ({st} {res})")
        return
    if st == 200:
        o.ok(True, f"[{rotulo}/{fluxo}] sem a trava ainda: a simulação passa (200) — o furo ({res})")
    elif (st, erro) in RECUSAS_DE_HOJE[fluxo]:
        o.ok(True, f"[{rotulo}/{fluxo}] sem a trava ainda: a recusa de hoje deste fluxo ({st} {res})")
    elif erro == "conta_real_no_staging":
        o.ok(False, f"[{rotulo}/{fluxo}] a trava JÁ responde (o deploy foi feito? então é --esperado depois) ({st} {res})")
    else:
        o.ok(False, f"[{rotulo}/{fluxo}] resposta inesperada antes do deploy ({st} {res})")


def caso_simular(o: C.Saida, sess: C.Sessoes, esperado: str) -> None:
    o.linha(f"esperado: {esperado} — " + ("o furo (200 em pelo menos 1 fluxo de cada conta)" if esperado == "antes"
                                          else "403 conta_real_no_staging + dados_em_producao nos 2 fluxos"))
    for rotulo, email in ALVOS.items():
        o.linha(f"\n== {rotulo} (staging, só a simulação)")
        uid = C.uid_por_email(email)
        if not o.ok(bool(uid), f"[{rotulo}] o login existe (sem ele, nada de link mágico: viraria um cadastro novo)"):
            continue
        try:
            token = sess.guardar("principal", C.sessao_magica(email)["access_token"], f"{rotulo} (link mágico)")
        except Exception as e:  # noqa: BLE001
            o.ok(False, f"[{rotulo}] sessão por link mágico: {type(e).__name__}: {str(e)[:200]}")
            continue
        if not o.ok(C.claims(token).get("sub") == uid, f"[{rotulo}] a sessão é do uid conferido"):
            continue
        duzentos: list[str] = []
        for fluxo in FLUXOS:
            antes = contagens(uid)
            st, r = simular(token, fluxo)
            depois = contagens(uid)
            avaliar(o, rotulo, fluxo, esperado, st, r)
            if st == 200:
                duzentos.append(fluxo)
            dif = C.diferencas(antes, depois)
            o.ok(not dif, f"[{rotulo}/{fluxo}] contagens pelo uid iguais antes e depois do pedido ({len(antes)} colunas, soma {sum(antes.values())})"
                 + (f" — MUDOU: {', '.join(dif[:10])} — parei" if dif else ""), parar=bool(dif))
        if esperado == "antes":
            o.ok(bool(duzentos), f"[{rotulo}] o furo registrado: pelo staging a simulação passa no fluxo {', '.join(duzentos) or '— nenhum'}")


# ───────────────────────── modo-app (a descartável excluir3) ─────────────────────────


def trocar(o: C.Saida, token_principal: str, uid: str) -> tuple[int, dict]:
    """A troca do app (e2e/w05/_base.py:trocar_token): o login do principal → sessão do Treino, no staging."""
    def pedir() -> tuple[int, dict]:
        st, r, _ = C.http("POST", f"{C.API_T}/functions/v1/trocar-token", {},
                          {"Authorization": f"Bearer {token_principal}", "x-schema": S, "Origin": C.ORIGEM_STAGING})
        return st, (r if isinstance(r, dict) else {})

    st, r = pedir()
    if st == 429:
        # o limite da troca (20/h por pessoa; o E2E da W7 entra muitas vezes com a excluir3): zera SÓ o dela, só no staging — o
        # zerar_limite_troca do e2e/w05/_base.py
        C.C2.sql_mgmt(C.TREINO_REF, f"delete from staging.edge_rate_limits where endpoint = 'trocar-token' and user_id = {C.txt(C.uuid_ok(uid))}")
        o.linha("   o limite da troca estava cheio: zerado SÓ para a excluir3 (staging) — 2ª tentativa")
        st, r = pedir()
    return st, r


def contagens_treino(tid: str) -> dict[str, object]:
    """O que é do tid no Treino (só leitura): o login (vivo), as identidades, as FKs para auth.users (2 schemas) e as tabelas que o
    modo app antigo apagava (no staging, a maioria sem FK)."""
    n: dict[str, object] = dict(C.contar(C.TREINO_REF, C.fks(C.TREINO_REF), tid))
    n.update(C.contar_tabelas(C.TREINO_REF, [(S, t, c) for t, c in DOZE_DO_APK], tid))
    t = C.txt(tid)
    r = C.ler(C.TREINO_REF, f"select (select count(*) from auth.users where id = {t}::uuid and deleted_at is null)::int as vivo, "
                            f"(select count(*) from auth.identities where user_id = {t}::uuid)::int as identities")[0]
    n.update({"auth.users (deleted_at nulo)": r["vivo"], "auth.identities": r["identities"]})
    return n


def pedido_do_apk(token_treino: str, corpo: dict) -> tuple[int, dict, dict]:
    """O POST do APK ≤ 3.7 (supabase.functions.invoke do cliente do Treino): JWT do Treino, chave pública e x-schema, SEM o
    x-espelho-segredo (o segredo é o que leva ao modo servidor)."""
    cab = {"apikey": C.anon(C.TREINO_REF), "Authorization": f"Bearer {token_treino}", "x-schema": S, "Origin": ORIGEM_APK}
    if any(k.lower() == "x-espelho-segredo" for k in cab):
        raise C.Parou("TRAVA: o pedido do APK não leva o segredo")
    st, r, h = C.http("POST", f"{C.TREINO_URL}/functions/v1/delete-my-account", corpo, cab, timeout=60)
    return st, (r if isinstance(r, dict) else {}), h


def caso_modo_app(o: C.Saida, sess: C.Sessoes) -> None:
    o.linha("== excluir3: o modo app da delete-my-account (Treino, staging) — só depois do deploy")
    uid = C.uid_por_email(EMAIL_DESCARTAVEL)
    senha_arq = Path.home() / f".physiq-teste-{DESCARTAVEL}"
    o.ok(bool(uid) and senha_arq.exists(), "a descartável excluir3 existe no principal, com a senha em ~/.physiq-teste-excluir3"
         + ("" if uid and senha_arq.exists() else " — NÃO: rode antes `python3 e2e/w07/contas.py --so-descartaveis` e repita"), parar=True)
    C.saude_treino(o, "o modo app")
    st, s = C.login_senha(EMAIL_DESCARTAVEL, C.B5.senha_de(DESCARTAVEL))
    o.ok(st == 200 and s.get("access_token"), f"login por senha da excluir3 no principal ({st})"
         + ("" if st == 200 else " — rode antes `python3 e2e/w07/contas.py --so-descartaveis` (refaz a senha)"), parar=True)
    tok_p = sess.guardar("principal", s["access_token"], "excluir3 (principal)")
    st, t = trocar(o, tok_p, uid)
    tid = t.get("treino_user_id")
    o.ok(st == 200 and C.eh_uuid(tid) and t.get("access_token"), f"trocar-token (x-schema staging) → sessão do Treino da excluir3 ({st} {C.resumo(t)}; tid {tid})", parar=True)
    tok_t = sess.guardar("treino", t["access_token"], "excluir3 (Treino)")
    tl = C.txt(tid)
    v = C.ler(C.TREINO_REF, f"select (select count(*) from staging.physiq_identidades where principal_user_id = {C.txt(uid)}::uuid and treino_user_id = {tl}::uuid)::int as vinculo, "
                            f"(select count(*) from auth.users where id = {tl}::uuid and deleted_at is null and raw_user_meta_data ->> 'ambiente' = 'staging')::int as login")[0]
    o.ok(v["vinculo"] == 1 and v["login"] == 1, f"o vínculo do staging aponta para esse login do Treino, vivo e de teste (ambiente=staging) ({v})", parar=True)
    antes = contagens_treino(tid)

    # a trava: o pedido SEM a confirmação primeiro — na função antiga ele só dá 400/403 (nada apaga); na nova, 410
    st0, r0, _ = pedido_do_apk(tok_t, {})
    nova = st0 == 410 and r0.get("error") == "migrado"
    o.ok(nova, f"pedido SEM a confirmação → 410 migrado: a função nova está publicada ({st0} {C.resumo(r0)})"
         + ("" if nova else " — NÃO mandei o corpo do APK (na função antiga ele apaga de vez o login do Treino): publique a hml-09 e repita"), parar=True)
    cl = C.claims(tok_t)
    o.ok(cl.get("sub") == tid and str(cl.get("email", "")).lower() == EMAIL_DESCARTAVEL, "TRAVA: o JWT do Treino é o da excluir3 (só ela recebe o corpo do APK)", parar=True)
    st1, r1, h1 = pedido_do_apk(tok_t, CORPO_DO_APK)
    o.ok(st1 == 410 and r1.get("error") == "migrado" and r1.get("ok") is False,
         f"corpo do APK antigo ({{confirm: DELETE_MY_ACCOUNT}}, sem o segredo) → 410 {{ok: false, error: migrado}} ({st1} {C.resumo(r1)})")
    acao = C.cabecalho(h1, "Access-Control-Allow-Origin")
    o.ok(bool(acao), f"o 410 vem com CORS (Access-Control-Allow-Origin: {acao or '—'})")
    vivo = C.ler(C.TREINO_REF, f"select count(*)::int as n from auth.users where id = {tl}::uuid and deleted_at is null")[0]["n"]
    o.ok(vivo == 1, "o login do Treino continua: auth.users.deleted_at nulo (só leitura)")
    depois = contagens_treino(tid)
    dif = C.diferencas(antes, depois)
    o.ok(not dif, f"contagens do tid iguais antes e depois ({len(antes)} itens: FKs dos 2 schemas, as tabelas do modo antigo e o login)"
         + (f" — MUDOU: {', '.join(dif[:10])}" if dif else ""))
    st2, _, h2 = C.http("OPTIONS", f"{C.TREINO_URL}/functions/v1/delete-my-account", None,
                        {"Origin": C.ORIGEM_PROD, "Access-Control-Request-Method": "POST",
                         "Access-Control-Request-Headers": "authorization, apikey, content-type, x-schema"})
    acao2 = C.cabecalho(h2, "Access-Control-Allow-Origin")
    o.ok(st2 == 200 and acao2 == C.ORIGEM_PROD, f"OPTIONS com Origin {C.ORIGEM_PROD} → 200 com Access-Control-Allow-Origin ({st2}, {acao2 or '—'})")


def main() -> int:
    ap = argparse.ArgumentParser(description="Physiq hml-09 — a guarda do staging (exclusão de conta)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sim = sub.add_parser("simular", help="as 2 contas com dado em produção: SÓ a simulação, nos 2 fluxos")
    sim.add_argument("--esperado", choices=["antes", "depois"], required=True)
    sub.add_parser("modo-app", help="excluir3: o modo app da delete-my-account (só depois do deploy)")
    a = ap.parse_args()
    esperado = a.esperado if a.cmd == "simular" else "depois"
    o = C.Saida(f"guarda_{a.cmd}_{esperado}")
    sess = C.Sessoes()
    try:
        if a.cmd == "simular":
            caso_simular(o, sess, esperado)
        else:
            caso_modo_app(o, sess)
    except C.Parou as e:
        if not e.impresso:
            o.ok(False, str(e), parar=False)
    except Exception as e:  # noqa: BLE001
        o.ok(False, f"exceção {type(e).__name__}: {str(e)[:300]}", parar=False)
    finally:
        sess.fechar(o)
    return o.fim()


if __name__ == "__main__":
    sys.exit(main())
