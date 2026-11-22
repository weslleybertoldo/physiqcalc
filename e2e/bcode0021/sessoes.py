#!/usr/bin/env python3
"""Physiq bcode-0021, item 4 (22/11/2026) — apagar o IP das sessões não tira ninguém do login: o ENSAIO do
scripts/legal/bcode0021_ip_das_sessoes.sql (o update do cabeçalho, só conta de teste), numa conta temporária, nos 2 bancos.

Passos (uma rodada = um prefixo f<n>; a conta é SÓ a temporária f<n>.sessoes.teste.claude@physiqcalc.com.br, e2e/excluir_conta/_base.py):
  1. cria a conta (API admin do Auth, sem e-mail), entra por e-mail e senha e troca o token (o login e o vínculo no Treino);
  2. conta as sessões dela nos 2 bancos e quantas têm IP (o que o ensaio apaga; no principal, a entrada direta grava o IP do notebook);
  3. o ENSAIO, pela Management API: o update do cabeçalho do SQL do item 4, lido do arquivo, com mais uma trava — só as sessões DESTA
     conta (user_id). Antes, a leitura confere que ele alcança só as sessões dela com IP; depois, que o IP delas sumiu;
  4. o refresh pelo api-principal funciona e é a MESMA sessão (o session_id do JWT); o refresh da sessão do Treino de antes funciona;
     a trocar-token funciona; o número de sessões dela não cai em nenhum banco;
  5. no fim (sempre, mesmo com ❌ no meio), apaga a conta pelo próprio «Excluir minha conta» e a senha local.
Não roda o ensaio nas outras contas de teste nem nas reais: o ensaio inteiro (B) e o de todas (C) são da General, pelo
apply_migration_principal.py --compartilhado (o cabeçalho do SQL). Imprime só ✅/❌, status e contagens (nenhum e-mail, IP, id ou token).
Uso: python3 e2e/bcode0021/sessoes.py --schema staging|public --rodada f30 [--seco]   (rodada nova a cada vez: a conta sai no fim)
"""
from __future__ import annotations

import argparse
import base64
import json
import re
import sys
import uuid
from pathlib import Path

sys.dont_write_bytecode = True  # o _comum da w02 não deixa __pycache__ na árvore
AQUI = Path(__file__).resolve().parent
REPO = AQUI.parents[1]  # a worktree onde este arquivo está
sys.path.insert(0, str(AQUI.parent / "excluir_conta"))
import _base as B  # noqa: E402

C, p = B.C, B.p
PAPEL = "sessoes"
API_P = "https://api-principal.physiqcalc.com.br"  # o proxy do principal, por onde o app renova a sessão
ITEM4 = REPO / "scripts" / "legal" / "bcode0021_ip_das_sessoes.sql"
IP_DO_WORKER = "2a06:98c0:3600::103"


def ensaio(uid: str) -> tuple[str, str]:
    """(o update, o mesmo WHERE para a leitura de antes): o ensaio do cabeçalho do SQL do item 4, com a trava desta conta."""
    m = re.search(r"^--\s+(update auth\.sessions s set ip = null from auth\.users u)\s*\n"
                  r"--\s+where (u\.id = s\.user_id and s\.ip is not null)\s*\n"
                  r"--\s+(and lower\(u\.email\) ~ '[^'\n]+');", ITEM4.read_text(encoding="utf-8"), re.M)
    if not m:
        raise SystemExit(f"o ensaio do cabeçalho de {ITEM4.relative_to(REPO)} mudou: confira antes de rodar")
    onde = f"{m.group(2)} {m.group(3)} and s.user_id = '{uuid.UUID(uid)}'::uuid"
    return f"select set_config('lock_timeout', '5s', true);\n{m.group(1)} where {onde}", onde


def claims(token: str) -> dict:
    corpo = token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(corpo + "=" * (-len(corpo) % 4)))


def sessoes(banco: str, uid: str) -> dict:
    """Só contagens (o principal pelo id daqui; o Treino pelo id de lá)."""
    q = (f"select count(*)::int as n, count(*) filter (where ip is not null)::int as com_ip "
         f"from auth.sessions where user_id = '{uuid.UUID(uid)}'::uuid")
    return B.um(q) if banco == "principal" else B.ro_treino(q)[0]


def alcance(banco: str, uid: str, onde: str) -> int:
    """Quantas sessões o update do ensaio (com a trava) alcança — só leitura."""
    q = f"select count(*)::int as n from auth.sessions s join auth.users u on u.id = s.user_id where {onde}"
    return (B.um(q) if banco == "principal" else B.ro_treino(q)[0])["n"]


def refresh(base: str, chave: str, refresh_token: str) -> tuple[int, dict]:
    st, r, _ = C.http("POST", f"{base}/auth/v1/token?grant_type=refresh_token", {"refresh_token": refresh_token}, {"apikey": chave})
    return st, (r if isinstance(r, dict) else {})


def excluir(s: str, tok: str) -> None:
    """O «Excluir minha conta» (o caminho do aluno: a conta é só uma pessoa, sem conta de profissional)."""
    st, sim = B.funcao(tok, s, "excluir-minha-conta", {"simular": True})
    p.check(st == 200 and sim.get("ok"), f"[fim] simular a exclusão → {st} {str({k: sim.get(k) for k in ('erro', 'motivo')})}")
    st, fim = B.funcao(tok, s, "excluir-minha-conta", {"confirmacao": "EXCLUIR"})
    p.check(st == 200 and fim.get("ok") is True, f"[fim] «Excluir minha conta» → {st} {str({k: fim.get(k) for k in ('erro', 'motivo')})}")


def rodar(s: str, r: str) -> None:
    assert B.saude(s), "a saúde dos bancos não está boa — parei"
    uid = B.criar_login(r, PAPEL, f"Sessoes {r.upper()}")
    tok = None
    try:
        s1 = B.sessao(r, PAPEL)
        tok = s1["access_token"]
        assert s1["user"]["id"] == uid, "a sessão é de OUTRA pessoa — parei"
        sid = claims(tok).get("session_id")
        st, t1 = B.trocar_token(tok, s)
        tid = t1.get("treino_user_id")
        if not p.check(st == 200 and tid and t1.get("refresh_token"), f"[antes] entrou e trocou o token (o login e o vínculo no Treino) → {st}"):
            return
        a_p, a_t = sessoes("principal", uid), sessoes("treino", tid)
        p.check(a_p["n"] >= 1 and a_p["com_ip"] >= 1, f"[antes] principal: {a_p['n']} sessão(ões) dela, {a_p['com_ip']} com IP")
        print(f"ℹ️  [antes] Treino: {a_t['n']} sessão(ões) dela, {a_t['com_ip']} com IP")

        # o ensaio, com a trava desta conta: antes, ele só alcança as sessões dela com IP; depois, nenhuma delas tem IP
        for banco, quem, antes in (("principal", uid, a_p), ("treino", tid, a_t)):
            sql, onde = ensaio(quem)
            n = alcance(banco, quem, onde)
            if not p.check(n == antes["com_ip"], f"[ensaio] {banco}: o update alcança só as sessões dela com IP ({n} de {antes['com_ip']})"):
                return
            C.sql_mgmt(C.PRINCIPAL_REF if banco == "principal" else C.TREINO_REF, sql)
            d = sessoes(banco, quem)
            p.check(d["com_ip"] == 0 and d["n"] == antes["n"], f"[ensaio] {banco}: o IP das sessões dela sumiu e nenhuma saiu "
                                                               f"({d['n']} sessão(ões), {d['com_ip']} com IP)")

        # depois do ensaio: ninguém saiu
        st, s2 = refresh(API_P, C.anon(C.PRINCIPAL_REF), s1["refresh_token"])
        mesma = bool(st == 200 and sid and s2.get("access_token") and claims(s2["access_token"]).get("session_id") == sid)
        p.check(mesma and (s2.get("user") or {}).get("id") == uid,
                f"[depois] o refresh pelo api-principal funciona e é a MESMA sessão (o session_id do JWT) → {st}")
        if mesma:
            tok = s2["access_token"]
            v = B.um(f"select ip is not null as tem_ip, ip is not distinct from '{IP_DO_WORKER}'::inet as do_worker from auth.sessions where id = '{uuid.UUID(sid)}'::uuid")
            print(f"ℹ️  [depois] a sessão renovada pelo Worker voltou a ter IP: {'sim' if v.get('tem_ip') else 'não'}; "
                  f"é o do Worker: {'sim' if v.get('do_worker') else 'não'}")
        st, t2 = refresh(B.API_T, C.anon(C.TREINO_REF), t1["refresh_token"])
        p.check(st == 200 and (t2.get("user") or {}).get("id") == tid, f"[depois] o refresh da sessão do Treino de antes funciona → {st}")
        st, t3 = B.trocar_token(tok, s)
        p.check(st == 200 and t3.get("treino_user_id") == tid, f"[depois] a trocar-token funciona (o mesmo login do Treino) → {st}")
        d_p, d_t = sessoes("principal", uid), sessoes("treino", tid)
        p.check(d_p["n"] >= a_p["n"], f"[depois] principal: o número de sessões dela não caiu ({a_p['n']} → {d_p['n']})")
        p.check(d_t["n"] >= a_t["n"], f"[depois] Treino: o número de sessões dela não caiu ({a_t['n']} → {d_t['n']})")
    finally:
        if tok is None:
            tok = B.sessao(r, PAPEL)["access_token"]
        excluir(s, tok)
        conta = B.login_por_email(B.email_de(r, PAPEL))
        if p.check(conta is None or conta["soft"], f"[fim] a conta temporária saiu ({'sumiu' if conta is None else 'soft' if conta['soft'] else 'viva'})"):
            B.apagar_senha(r, PAPEL)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--schema", required=True, choices=["staging", "public"])
    ap.add_argument("--rodada", required=True, help="f<n> nova (a conta f<n>.sessoes.teste.claude@physiqcalc.com.br)")
    ap.add_argument("--seco", action="store_true", help="só imprime o que rodaria (sem rede)")
    a = ap.parse_args()
    s, r = a.schema, a.rodada.lower()
    B.email_de(r, PAPEL)  # trava do nome da rodada (só f<n>; só conta de teste)
    if a.seco:
        sql, _ = ensaio(str(uuid.UUID(int=0)))
        print(f"seco: conta temporária {r}.{PAPEL}.teste.claude@… no schema {s} (login, troca de token, «Excluir minha conta» no fim)")
        print("seco: o ensaio nos 2 bancos (lido do cabeçalho do SQL do item 4, com a trava da conta):\n"
              + sql.replace(str(uuid.UUID(int=0)), "<id da conta>"))
        return 0
    rodar(s, r)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
