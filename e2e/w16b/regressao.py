#!/usr/bin/env python3
"""Physiq W16b — REGRESSÃO dos fluxos que criam/ligam matrícula, com a trava de e-mail/CPF ligada (staging, contas de TESTE,
gravações de verdade e limpeza no fim). Em série; /health do Treino antes (o pos-login pergunta ao Treino).

  R1 paciente do site antigo ligando no 1º login: a nutri (site antigo) cadastra o paciente e cria o acesso dele → o login entra
     (pos-login) → minha_situacao() = matrícula com Nutrição, sem bloqueio (W3/W8b)
  R2 convite aceito no 1º login, com a pessoa JÁ cadastrada sem login por outra profissional (o mesmo e-mail): o dono da
     "Consultoria Equipe W5" convida → a pessoa cria o login e entra → o convite vira matrícula (W3/W5/W13) — a trava não barra
     (o e-mail é o do próprio login)
  R3 /c/: cadastro pelo link com e-mail único → pendente → o dono aprova → matrícula (W13)
  (o aluno do app — entrar_sem_profissional, a de 5 argumentos desde a hml-12 — e o pos-login dos 2 logins estão no
  e2e/w16b/causa.py --com-trava)
  hml-12: com a versão dos textos ligada no staging, o gatilho da idade mínima vale nos 3 fluxos; aqui nenhum manda data de nascimento,
  então nada muda (a trava da idade é provada no e2e/hml12/banco.py)
Uso: python3 e2e/w16b/regressao.py
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
N = B.NUTRI_LEGADO
R1, R2 = "w16b-regressao", "w16b-convidado"
B.EMAIL.update({R1: "w16b.regressao.teste.claude@physiqnutri.app", R2: "w16b.convidado.teste.claude@physiqnutri.app"})
B.NOMES.update({R1: "Regina Regressão W16b", R2: "Caio Convidado W16b"})
for _k in (R1, R2):
    B.CONTAS[_k] = (B.EMAIL[_k], B.B5.senha_de(_k))
NOME_C = "Lia Link W16b"
EMAIL_C = "w16b.link.teste.claude@physiqnutri.app"


def q(sql: str) -> list:
    return B.sql_principal(sql)


def apagar_login(conta: str) -> None:
    u = B.uid(conta)
    if u:
        assert B.EMAIL[conta].endswith(".teste.claude@physiqnutri.app")
        sp = B.service(B.PRINCIPAL_REF)
        B.http("DELETE", f"{B.PRINCIPAL_URL}/auth/v1/admin/users/{u}", None, {"apikey": sp, "Authorization": f"Bearer {sp}"})


def limpar(conta_w5: str) -> None:
    for k in (R1, R2):
        u = B.uid(k)
        if u:
            q(f"delete from {S}.pacientes where user_id = '{u}'")
            q(f"delete from {S}.avisos where destino_user_id = '{u}'")
        apagar_login(k)
    q(f"delete from {S}.pacientes where nome in ('W16b Regressão Nutri', 'W16b Caio sem login', $n${NOME_C}$n$)")
    q(f"delete from {S}.convites where conta_id = '{conta_w5}' and lower(email) = '{B.EMAIL[R2]}'")
    q(f"delete from {S}.cadastros_pendentes where lower(email) = '{EMAIL_C}'")


def main() -> int:
    conta_w5 = q(f"select id::text from {S}.contas where nome = 'Consultoria Equipe W5' limit 1")[0]["id"]
    dono5 = B.uid("w5-dono")
    limpar(conta_w5)
    B.saude_ok("a regressão (pos-login)")
    idn = B.uid(N)

    # R1 — paciente do site antigo ligando no 1º login
    st, novo = B.rest_como(N, "POST", "pacientes?select=*", {"nome": "W16b Regressão Nutri", "email": B.EMAIL[R1], "nutricionista_id": idn})
    pid = novo[0]["id"] if st in (200, 201) and isinstance(novo, list) else None
    p.check(bool(pid), f"[R1] a nutri cadastra o paciente no site antigo (HTTP {st})")
    st, u1 = B.rpc(N, "paciente_criar_acesso", {"p_paciente_id": pid, "p_email": B.EMAIL[R1], "p_senha": B.CONTAS[R1][1]})
    p.check(st == 200 and isinstance(u1, str), f"[R1] e cria o acesso dele (paciente_criar_acesso {st})")
    st, r = B.B5.funcao(B.token(R1), "pos-login", {})
    sit = (r or {}).get("situacao") if isinstance(r, dict) else None
    st2, sit2 = B.rpc(R1, "minha_situacao", {})
    mats = (sit2 or {}).get("matriculas") if isinstance(sit2, dict) else None
    texto = str(sit2)
    p.check(st == 200 and st2 == 200 and "nutricao" in texto and pid in texto,
            f"[R1] 1º login: pos-login {st} e a minha_situacao() traz a matrícula com Nutrição ({str(sit or sit2)[:160]})")
    time.sleep(2)

    # R2 — convite aceito, com a pessoa já cadastrada SEM login por outra nutri (o mesmo e-mail)
    st, sl = B.rest_como(N, "POST", "pacientes?select=*", {"nome": "W16b Caio sem login", "email": B.EMAIL[R2], "nutricionista_id": idn})
    p.check(st in (200, 201), f"[R2] a outra nutri tinha cadastrado a pessoa SEM login com esse e-mail (HTTP {st})")
    st, cv = B.rpc("w5-dono", "aluno_convidar", {"p_conta": conta_w5, "p_email": B.EMAIL[R2], "p_modulos": ["treino"]})
    p.check(st == 200 and isinstance(cv, dict) and cv.get("ok"), f"[R2] o dono da Consultoria Equipe W5 convida (aluno_convidar {st}: {str(cv)[:120]})")
    B.B5.garantir_usuario(B.EMAIL[R2], B.CONTAS[R2][1], B.NOMES[R2])
    st, r = B.B5.funcao(B.token(R2), "pos-login", {})
    conv = (r or {}).get("convites") if isinstance(r, dict) else None
    mat = q(f"""select id::text, conta_id::text, personal_id::text, ativo from {S}.pacientes
                 where user_id = '{B.uid(R2)}' and conta_id = '{conta_w5}' and deleted_at is null""")
    p.check(st == 200 and (conv or {}).get("aceitos") == 1 and len(mat) == 1 and mat[0]["personal_id"] == dono5 and mat[0]["ativo"],
            f"[R2] no 1º login o convite vira matrícula na conta (o e-mail é o do próprio login: a trava não barra) — pos-login {st}, convites {conv}")
    time.sleep(2)

    # R3 — /c/ com e-mail único → pendente → aprovar
    cod = q(f"select codigo_convite from {S}.conta_membros where conta_id = '{conta_w5}' and user_id = '{dono5}' limit 1")[0]["codigo_convite"]
    r = q(f"select {S}.cadastro_link_enviar('{cod}', jsonb_build_object('nome', $n${NOME_C}$n$, 'email', '{EMAIL_C}')) as r")[0]["r"]
    p.check(isinstance(r, dict) and r.get("ok") is True, f"[R3] /c/ com e-mail único → cadastro pendente ({r})")
    st, ap = B.rpc("w5-dono", "aluno_pendente_decidir", {"p_conta": conta_w5, "p_pendente": (r or {}).get("id"), "p_aprovar": True})
    p.check(st == 200 and isinstance(ap, dict) and ap.get("ok") is True, f"[R3] o dono aprova → matrícula ({str(ap)[:120]})")

    limpar(conta_w5)
    sobrou = q(f"""select count(*)::int n from {S}.pacientes where nome in ('W16b Regressão Nutri', 'W16b Caio sem login', $n${NOME_C}$n$)""")[0]["n"]
    p.check(sobrou == 0 and not B.uid(R1) and not B.uid(R2), f"[limpeza] nada sobrou (pacientes {sobrou}, logins apagados)")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
