#!/usr/bin/env python3
"""Physiq H4 — E2E do SERVIDOR no STAGING (a massa do e2e/h4/massa.py): o que a tela pede ao banco, como a pessoa (auth.uid()).

  lista     N-10: alunos_da_conta com os filtros novos (gênero, cadastro, modificação) e a ordem (nome · recentes · modificados) — os
            números batem com o SQL direto; as contagens dos chips seguem os filtros; filtro inválido não quebra; quem não é da conta
            não lê (sem_acesso)
  csv       N-66: a exportação pede as páginas de 500 em sequência e junta os 520 (nenhum corte calado), com apelido, CPF, nascimento e
            gênero só quando exportar = true (a lista da tela não leva o CPF)
  master    C56/N-22/C57: master_conta_detalhe dá o código PROF-… e o último acesso de cada membro; o master lê o perfil de aluno de
            OUTRA conta (aluno_perfil) e quem não é master recebe so_master; o profissional de outra conta não lê o aluno (sem_acesso)
  suspensa  N-22: o master suspende a "Conta Suspensa H4" pela função (a mesma ação da tela) → minha_situacao() do MEMBRO mostra a conta
            suspensa (é o que a casca lê para travar o painel) → reativa (volta ativa)
Uso: python3 e2e/h4/api.py [--casos lista,csv,master,suspensa]
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
q = B.sql_principal
CASOS: dict[str, object] = {}


def caso(fn):
    CASOS[fn.__name__.replace("caso_", "")] = fn
    return fn


def lista(conta: str, quem: str, filtros: dict, offset: int = 0, limite: int = 20) -> dict:
    st, r = B.rpc(quem, "alunos_da_conta", {"p_conta": conta, "p_filtros": filtros, "p_offset": offset, "p_limite": limite})
    assert st == 200, (st, r)
    return r  # type: ignore[return-value]


@caso
def caso_lista():
    c = B.conta_id(B.CONTA_CSV)
    base = lista(c, "h4-csv", {"situacao": "todos"}, 0, 0)
    p.check(base.get("ok") and base["total"] == B.N_CSV, f"[lista] a Conta CSV H4 tem {B.N_CSV} alunos (veio {base.get('total')})")
    for g in ("masculino", "feminino", "outro"):
        r = lista(c, "h4-csv", {"situacao": "todos", "genero": g}, 0, 3)
        n = q(f"select count(*)::int n from {S}.pacientes where conta_id = '{c}' and deleted_at is null and genero = '{g}'")[0]["n"]
        p.check(r["total"] == n and all(x for x in r["itens"]), f"[lista] gênero {g}: {r['total']} = SQL {n}")
        p.check(r["contagens"]["todos"] == n, f"[lista] as contagens dos chips seguem o gênero ({r['contagens']['todos']})")
    r = lista(c, "h4-csv", {"situacao": "todos", "genero": "lixo"}, 0, 0)
    p.check(r["total"] == B.N_CSV, "[lista] gênero inválido = filtro desligado (não quebra)")
    um_mes = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=30)).isoformat()
    r = lista(c, "h4-csv", {"situacao": "todos", "cadastro_de": um_mes}, 0, 0)
    n = q(f"select count(*)::int n from {S}.pacientes where conta_id = '{c}' and deleted_at is null and created_at >= '{um_mes}'")[0]["n"]
    p.check(r["total"] == n and 0 < n < B.N_CSV, f"[lista] cadastro nos últimos 30 dias: {r['total']} = SQL {n}")
    de, ate = (dt.date.today() - dt.timedelta(days=60)).isoformat(), (dt.date.today() - dt.timedelta(days=40)).isoformat()
    r = lista(c, "h4-csv", {"situacao": "todos", "modificado_de": f"{de}T03:00:00Z", "modificado_ate": f"{ate}T02:59:59Z"}, 0, 0)
    n = q(f"""select count(*)::int n from {S}.pacientes where conta_id = '{c}' and deleted_at is null
              and updated_at >= '{de}T03:00:00Z' and updated_at <= '{ate}T02:59:59Z'""")[0]["n"]
    p.check(r["total"] == n and n > 0, f"[lista] modificação num período: {r['total']} = SQL {n}")
    r = lista(c, "h4-csv", {"situacao": "todos", "cadastro_de": "não é data"}, 0, 0)
    p.check(r["total"] == B.N_CSV, "[lista] data inválida = filtro desligado (não quebra)")
    # a ordem
    nomes = [x["nome"] for x in lista(c, "h4-csv", {"situacao": "todos"}, 0, 5)["itens"]]
    p.check(nomes == sorted(nomes, key=str.lower) and nomes[0] == "Aluno CSV 001", f"[lista] ordem alfabética (padrão): {nomes[:3]}")
    rec = lista(c, "h4-csv", {"situacao": "todos", "ordem": "recentes"}, 0, 5)["itens"]
    datas = [x["criado_em"] for x in rec]
    sql = [x["nome"] for x in q(f"select nome from {S}.pacientes where conta_id = '{c}' and deleted_at is null order by created_at desc, lower(nome), id limit 5")]
    p.check(datas == sorted(datas, reverse=True) and [x["nome"] for x in rec] == sql, f"[lista] ordem por cadastro (recentes primeiro) = SQL ({sql[:2]})")
    mod = lista(c, "h4-csv", {"situacao": "todos", "ordem": "modificados"}, 0, 5)["itens"]
    sql = [x["nome"] for x in q(f"select nome from {S}.pacientes where conta_id = '{c}' and deleted_at is null order by updated_at desc, lower(nome), id limit 5")]
    p.check([x["nome"] for x in mod] == sql, f"[lista] ordem por modificação = SQL ({sql[:2]})")
    # negativo: quem não é da conta
    st, r = B.rpc("h4-dono", "alunos_da_conta", {"p_conta": c, "p_filtros": {}, "p_offset": 0, "p_limite": 5})
    p.check(st == 200 and isinstance(r, dict) and r.get("ok") is False and r.get("erro") == "sem_acesso", f"[lista] dono de OUTRA conta não lê a lista ({r})")


@caso
def caso_csv():
    c = B.conta_id(B.CONTA_CSV)
    # o que a tela faz (regras.exportarTodos): páginas de 500 até o total
    itens, total, offset, paginas = [], None, 0, 0
    while True:
        r = lista(c, "h4-csv", {"situacao": "ativos", "exportar": "true"}, offset, 500)
        paginas += 1
        total = r["total"]
        itens += r["itens"]
        if len(r["itens"]) < 500 or len(itens) >= total:
            break
        offset += 500
    ids = {x["id"] for x in itens}
    p.check(total == B.N_CSV and len(itens) == B.N_CSV and len(ids) == B.N_CSV and paginas == 2,
            f"[csv] {len(itens)} de {total} em {paginas} páginas, sem repetir (nenhum corte calado em 500)")
    com_cpf = [x for x in itens if x.get("cpf")]
    p.check(len(com_cpf) == 3 and all(len(x["cpf"]) == 11 for x in com_cpf), f"[csv] o CPF vem na exportação ({len(com_cpf)} com CPF)")
    p.check(all("apelido" in x and "nascimento" in x and "genero" in x for x in itens), "[csv] apelido, nascimento e gênero em todos os itens")
    p.check(sum(1 for x in itens if x.get("apelido")) == 52 and sum(1 for x in itens if x.get("genero") == "feminino") == 130,
            "[csv] apelidos (52) e gêneros (130 femininos) como na massa")
    tela = lista(c, "h4-csv", {"situacao": "ativos"}, 0, 20)["itens"]
    p.check(tela and all("cpf" not in x and "apelido" not in x for x in tela), "[csv] a lista da TELA não leva CPF nem apelido (só a exportação)")
    r = lista(c, "h4-csv", {"situacao": "ativos", "exportar": "true"}, 0, 9999)
    p.check(r["limite"] == 500 and len(r["itens"]) == 500, "[csv] uma chamada continua parando em 500 (o limite fica; quem junta é a tela)")


@caso
def caso_master():
    B.dar_master("w27-master")
    try:
        c1 = B.conta_id(B.CONTA_CLINICA)
        c3 = B.conta_id(B.CONTA_SUSP)
        st, r = B.funcao("master-contas", {"acao": "detalhe", "conta_id": c3}, "w27-master")
        membros = (r.get("membros") or []) if isinstance(r, dict) else []
        mauro = next((m for m in membros if m.get("email") == B.EMAIL["h4-membro"]), None)
        p.check(st == 200 and mauro and (mauro.get("codigo_convite") or "").startswith("PROF-"), f"[master] o código PROF-… do membro vem no detalhe ({(mauro or {}).get('codigo_convite')})")
        p.check(mauro is not None and "ultimo_acesso" in mauro, f"[master] o último acesso vem por membro ({(mauro or {}).get('ultimo_acesso')})")
        # depois de um login do membro, o último acesso é de hoje
        B.token("h4-membro", novo=True)
        st, r = B.funcao("master-contas", {"acao": "detalhe", "conta_id": c3}, "w27-master")
        mauro = next((m for m in (r.get("membros") or []) if m.get("email") == B.EMAIL["h4-membro"]), {})
        ua = mauro.get("ultimo_acesso") or ""
        p.check(ua[:10] == dt.datetime.now(dt.timezone.utc).date().isoformat(), f"[master] último acesso atualizado no login ({ua})")
        # C57/N-5: o master lê o perfil de aluno de OUTRA conta
        laura = B.aluno_id(c1, B.ALUNA_VENCIDA)
        st, r = B.rpc("w27-master", "aluno_perfil", {"p_aluno": laura})
        p.check(st == 200 and isinstance(r, dict) and r.get("ok") and r.get("conta_id") == c1 and r["eu"]["master"] is True,
                f"[master] aluno_perfil de aluno de outra conta: ok (conta {str(r.get('conta_id'))[:8] if isinstance(r, dict) else r})")
        p.check(isinstance(r, dict) and sorted(r.get("conta_modulos") or []) == ["nutricao", "treino"], "[master] o perfil traz os módulos da conta do aluno (as abas)")
        # negativos
        st, r = B.funcao("master-contas", {"acao": "detalhe", "conta_id": c3}, "h4-dono")
        p.check(st in (401, 403) or (isinstance(r, dict) and r.get("erro") == "so_master"), f"[master] quem não é master não abre o detalhe ({st} {r.get('erro') if isinstance(r, dict) else r})")
        st, r = B.rpc("h4-csv", "aluno_perfil", {"p_aluno": laura})
        msg = str(r)
        p.check(st != 200 or "sem_acesso" in msg, f"[master] profissional de OUTRA conta não lê o aluno ({st} {msg[:80]})")
    finally:
        B.tirar_master("w27-master")


@caso
def caso_suspensa():
    c3 = B.conta_id(B.CONTA_SUSP)
    B.dar_master("w27-master")
    try:
        st, r = B.funcao("master-contas", {"acao": "acao", "conta_id": c3, "tipo": "suspender", "args": {"motivo": "Teste H4"}}, "w27-master")
        p.check(st == 200 and isinstance(r, dict) and r.get("ok") is not False, f"[suspensa] o master suspende pela função ({st} {str(r)[:120]})")
        sit = q(f"select situacao from {S}.contas where id = '{c3}'")[0]["situacao"]
        p.check(sit == "suspensa", f"[suspensa] a conta fica suspensa no banco ({sit})")
        st, r = B.rpc("h4-membro", "minha_situacao", {})
        conta = next((x for x in (r.get("contas") or []) if x.get("id") == c3), None) if isinstance(r, dict) else None
        p.check(st == 200 and conta and conta.get("situacao") == "suspensa", "[suspensa] minha_situacao() do MEMBRO mostra a conta suspensa (a casca trava o painel)")
        p.check(conta is not None and "personal" in conta.get("papeis", []) and "dono" not in conta.get("papeis", []), "[suspensa] … e ele é membro (personal), não o dono")
    finally:
        B.tirar_master("w27-master")


@caso
def caso_reativar():
    """Volta a Conta Suspensa H4 para ativa (o fim do E2E das telas — a suspensão fica durante as telas)."""
    c3 = B.conta_id(B.CONTA_SUSP)
    B.dar_master("w27-master")
    try:
        st, r = B.funcao("master-contas", {"acao": "acao", "conta_id": c3, "tipo": "reativar", "args": {}}, "w27-master")
        sit = q(f"select situacao from {S}.contas where id = '{c3}'")[0]["situacao"]
        p.check(st == 200 and sit == "ativa", f"[reativar] a conta volta ativa ({sit})")
    finally:
        B.tirar_master("w27-master")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--casos", default="lista,csv,master,suspensa")
    a = ap.parse_args()
    t0 = time.time()
    for nome in [x for x in a.casos.split(",") if x]:
        B.saude_ok(f"o caso {nome}")
        print(f"\n── {nome}", flush=True)
        try:
            CASOS[nome]()  # type: ignore[operator]
        except Exception as e:  # noqa: BLE001
            p.check(False, f"[{nome}] exceção: {str(e)[:300]}")
        time.sleep(1)
    print(f"\nH4 · api (staging) · {time.time() - t0:.0f}s")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
