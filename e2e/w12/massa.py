#!/usr/bin/env python3
"""Physiq W12 — massa de TESTE do Início (idempotente; SÓ contas de teste — P26). Tudo relativo a HOJE (São Paulo).

Banco do Treino — schema `public` (P20: o PowerSync do local e do staging LÊ o public; sem isto o "Treino de hoje" do staging
ficaria sempre vazio). Só linhas NOVAS com o id do usuário de teste do Treino (nenhum dado real é lido ou mexido; nenhum treino
do profissional é liberado — são treinos PRÓPRIOS do aluno de teste):
  Diego (w10-aluno)  perfil mínimo + 3 treinos próprios (Peito e Tríceps · Costas e Bíceps · Pernas, 5 exercícios da biblioteca
                     global cada) na semana Seg A · Ter B · Qua A · Qui B · Sex C, e os dias desta semana antes de hoje concluídos;
  Bruno (w7-treino)  perfil mínimo + 2 treinos próprios (Pernas · Costas e Bíceps): Seg A · Qua B · Sex A, a segunda concluída.
Banco principal — schema `staging`: a próxima consulta do Diego com a Camila (daqui a 2 dias, 10:00) e a mensalidade do Diego
(R$ 249,00 vencendo em 3 dias — a faixa da W6 na tela 1). A massa da W10 (avaliações) e a da W11 (plano, metas) ficam como estão.

--limpar tira TUDO o que este script pôs (e devolve a mensalidade do Diego como estava, guardada no backup) e os ✓ que o E2E
marcou (a função da W11). Relatório com as contagens antes/depois em ~/backups/physiq/2026-09-30-w12/.
Uso: python3 e2e/w12/massa.py [--dry-run] [--limpar]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import uuid
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

_ESPEC = __import__("importlib.util").util.spec_from_file_location("massa_w11", Path(__file__).parent.parent / "w11" / "massa.py")
M11 = __import__("importlib.util").util.module_from_spec(_ESPEC)
_ESPEC.loader.exec_module(M11)  # type: ignore[union-attr]

NS = uuid.UUID("6f1c8a1e-2b0d-4d11-9a51-0000000000c2")
FUSO = dt.timezone(dt.timedelta(hours=-3))
AGORA = dt.datetime.now(FUSO)
HOJE = AGORA.date()
SEGUNDA = HOJE - dt.timedelta(days=HOJE.weekday())
DIAS = ["SEG", "TER", "QUA", "QUI", "SEX", "SAB", "DOM"]
DRY = {"on": False}

TREINOS = {
    "w10-aluno": {
        "nome": "Diego Almeida",
        "treinos": {
            "A": ("Peito e Tríceps", ["Supino Reto com Barra", "Supino Inclinado com Barra", "Crucifixo com Halteres", "Tríceps Pulley", "Tríceps Francês com Halter"]),
            "B": ("Costas e Bíceps", ["Puxada Frontal Aberta", "Remada Curvada com Barra", "Remada Baixa na Máquina", "Rosca Direta com Barra", "Rosca Martelo com Halteres"]),
            "C": ("Pernas", ["Agachamento Livre com Barra", "Leg Press 45°", "Cadeira Extensora", "Mesa Flexora", "Panturrilha em Pé na Máquina"]),
        },
        "semana": {"SEG": "A", "TER": "B", "QUA": "A", "QUI": "B", "SEX": "C"},
    },
    "w7-treino": {
        "nome": "Bruno Treino",
        "treinos": {
            "A": ("Pernas", ["Agachamento Livre com Barra", "Leg Press 45°", "Cadeira Extensora", "Mesa Flexora", "Panturrilha em Pé na Máquina"]),
            "B": ("Costas e Bíceps", ["Puxada Frontal Aberta", "Remada Curvada com Barra", "Remada Baixa na Máquina", "Rosca Direta com Barra", "Rosca Martelo com Halteres"]),
        },
        "semana": {"SEG": "A", "QUA": "B", "SEX": "A"},
    },
}
TABELAS_TREINO = ["physiq_profiles", "tb_grupos_treino_usuario", "tb_grupos_exercicios_usuario", "tb_semana_treinos", "tb_treino_concluido",
                  "tb_treino_dia_override", "tb_treino_series"]


def u(chave: str) -> str:
    return str(uuid.uuid5(NS, f"w12:{chave}"))


def lit(v) -> str:
    return M11.lit(v)


def T(sql: str) -> list:
    if DRY["on"] and not sql.lstrip().lower().startswith("select"):
        print("   [dry-run] Treino:", " ".join(sql.split())[:160])
        return []
    return B.sql_treino(sql)


def P(sql: str) -> list:
    if DRY["on"] and not sql.lstrip().lower().startswith("select"):
        print("   [dry-run] principal:", " ".join(sql.split())[:160])
        return []
    return B.sql_principal(sql)


def treino_user(conta: str) -> str:
    B.ESTADO["schema"] = "staging"
    tid = B.treino_id(conta)
    assert tid, f"sem usuário do Treino no staging para {conta}"
    email = B.CONTAS[conta][0]
    # trava: o usuário do Treino é o da conta de TESTE (e-mail de teste no auth do Treino)
    r = B.sql_treino(f"select email from auth.users where id = '{tid}'")
    assert r and ("teste.claude@" in (r[0]["email"] or "") or r[0]["email"] == email), f"usuário do Treino não é de teste: {r}"
    return tid


def contagens(tids: list[str]) -> dict:
    lista = ",".join(f"'{t}'" for t in tids)
    saida = {}
    for sch in ("public", "staging"):
        for tab in TABELAS_TREINO:
            col = "id" if tab == "physiq_profiles" else "user_id"
            saida[f"{sch}.{tab}"] = B.sql_treino(f"select count(*)::int n from {sch}.{tab} where {col} in ({lista})")[0]["n"]
            saida[f"{sch}.{tab} (total)"] = B.sql_treino(f"select count(*)::int n from {sch}.{tab}")[0]["n"]
    return saida


def limpar_treino(conta: str, tid: str) -> None:
    """No public: tudo o que a massa pôs (e o perfil mínimo). No staging: só os treinos próprios, a semana e os feitos da massa
    (o perfil e as avaliações do staging são da W7/W10 e ficam)."""
    cfg = TREINOS[conta]
    ids_grupos = ",".join(f"'{u(f'{conta}:grupo:{k}')}'" for k in cfg["treinos"])
    ids_semana = ",".join(f"'{u(f'{conta}:semana:{d}')}'" for d in cfg["semana"])
    ids_feitos = ",".join(f"'{u(f'{conta}:feito:{SEGUNDA + dt.timedelta(days=i)}')}'" for i in range(7))
    for sch in ("public", "staging"):
        T(f"delete from {sch}.tb_treino_concluido where user_id = '{tid}' and id in ({ids_feitos})")
        T(f"delete from {sch}.tb_semana_treinos where user_id = '{tid}' and id in ({ids_semana})")
        T(f"delete from {sch}.tb_treino_dia_override where user_id = '{tid}' and grupo_usuario_id in ({ids_grupos})")
        T(f"delete from {sch}.tb_grupos_exercicios_usuario where user_id = '{tid}' and grupo_usuario_id in ({ids_grupos})")
        T(f"delete from {sch}.tb_grupos_treino_usuario where user_id = '{tid}' and id in ({ids_grupos})")
    # o perfil mínimo do public sai quando não sobra nada dele lá (a conta de teste nunca usou o public antes da W12)
    sobra = sum(B.sql_treino(f"select count(*)::int n from public.{t} where user_id = '{tid}'")[0]["n"]
                for t in ("tb_grupos_treino_usuario", "tb_treino_concluido", "tb_semana_treinos", "tb_treino_series", "tb_treino_dia_override"))
    if sobra == 0:
        T(f"delete from public.physiq_profiles where id = '{tid}' and email = {lit(B.CONTAS[conta][0])}")
    else:
        print(f"ATENÇÃO: o perfil do public de {conta} ficou (sobraram {sobra} linhas dele)")


def semear_treino(conta: str, tid: str) -> dict:
    """Os treinos próprios, a semana e os feitos nos 2 schemas do Banco do Treino: o `public` é o que o PowerSync do local e do
    staging LÊ (P20) e o `staging` é para onde o app deles SOBE as mudanças (a troca do dia aponta para o treino próprio —
    sem ele no staging, o envio seria recusado pela chave estrangeira). O perfil do staging já existe (W7/W10)."""
    r = {}
    for sch in ("public", "staging"):
        r[sch] = _semear_treino(conta, tid, sch)
    return r["public"]


def _semear_treino(conta: str, tid: str, sch: str) -> dict:
    cfg = TREINOS[conta]
    email = B.CONTAS[conta][0]
    existe = B.sql_treino(f"select id, email from {sch}.physiq_profiles where id = '{tid}'")
    assert not existe or existe[0]["email"] == email, f"perfil do Treino ({sch}) de outra pessoa: {existe}"
    if sch == "public":
        # perfil mínimo (sem professor: não entra na lista de nenhum profissional de produção); descanso de 90 s
        T(f"""insert into public.physiq_profiles (id, nome, email, status, tempo_descanso_segundos)
              values ('{tid}', {lit(cfg['nome'])}, {lit(email)}, 'ativo', 90)
              on conflict (id) do update set nome = excluded.nome, tempo_descanso_segundos = 90""")
    else:
        assert existe, f"o perfil do staging devia existir ({conta})"
    nomes = sorted({n for _, (_, exs) in cfg["treinos"].items() for n in exs})
    lista = ",".join(lit(n) for n in nomes)
    catalogo = {r["nome"]: r["id"] for r in B.sql_treino(f"select id::text, nome from {sch}.tb_exercicios where professor_id is null and nome in ({lista})")}
    faltam = [n for n in nomes if n not in catalogo]
    assert not faltam, f"exercícios da biblioteca global que não achei: {faltam}"
    for letra, (nome, exs) in cfg["treinos"].items():
        gid = u(f"{conta}:grupo:{letra}")
        T(f"""insert into {sch}.tb_grupos_treino_usuario (id, user_id, nome) values ('{gid}', '{tid}', {lit(nome)})
              on conflict (id) do update set nome = excluded.nome""")
        T(f"delete from {sch}.tb_grupos_exercicios_usuario where grupo_usuario_id = '{gid}'")
        valores = ", ".join(f"('{u(f'{conta}:ge:{letra}:{i}')}', '{tid}', '{gid}', '{catalogo[n]}', {i})" for i, n in enumerate(exs))
        T(f"insert into {sch}.tb_grupos_exercicios_usuario (id, user_id, grupo_usuario_id, exercicio_id, ordem) values {valores}")
    T(f"delete from {sch}.tb_semana_treinos where user_id = '{tid}'")
    for dia, letra in cfg["semana"].items():
        T(f"""insert into {sch}.tb_semana_treinos (id, user_id, dia_semana, slot_idx, grupo_usuario_id)
              values ('{u(f'{conta}:semana:{dia}')}', '{tid}', '{dia}', 0, '{u(f'{conta}:grupo:{letra}')}')""")
    # os dias desta semana ANTES de hoje com treino ficam concluídos (o "N de M na semana")
    T(f"delete from {sch}.tb_treino_concluido where user_id = '{tid}' and data_treino >= '{SEGUNDA}' and data_treino < '{HOJE}'")
    feitos = []
    for i, dia in enumerate(DIAS):
        data = SEGUNDA + dt.timedelta(days=i)
        if dia in cfg["semana"] and data < HOJE:
            T(f"""insert into {sch}.tb_treino_concluido (id, user_id, data_treino, slot_idx, concluido)
                  values ('{u(f'{conta}:feito:{data}')}', '{tid}', '{data}', 0, true)""")
            feitos.append(str(data))
    hoje_letra = cfg["semana"].get(DIAS[HOJE.weekday()])
    return {"treino_de_hoje": cfg["treinos"][hoje_letra][0] if hoje_letra else None, "feitos": feitos, "dias_com_treino": len(cfg["semana"])}


def diego_principal(limpar: bool, backup: dict) -> dict:
    S = "staging"
    diego = M11.matricula_de(B.EMAIL["w10-aluno"])
    pid = diego["id"]
    ag = u("diego:consulta")
    antes = B.sql_principal(f"select mensalidade_valor::text, mensalidade_pago_ate::text, mensalidade_desde::text from {S}.pacientes where id = '{pid}'")[0]
    arquivo = B.BACKUP / "diego_mensalidade_antes.json"
    if limpar:
        P(f"delete from {S}.agendamentos where id = '{ag}'")
        if arquivo.exists():
            v = json.loads(arquivo.read_text())
            P(f"""update {S}.pacientes set mensalidade_valor = {lit(v['mensalidade_valor'])}::numeric, mensalidade_pago_ate = {lit(v['mensalidade_pago_ate'])}::timestamptz,
                    mensalidade_desde = {lit(v['mensalidade_desde'])}::timestamptz where id = '{pid}'""")
        return {"consulta": "apagada", "mensalidade": "devolvida"}
    if not arquivo.exists() and not DRY["on"]:
        B.json_arquivo(arquivo, antes)
    backup["diego_mensalidade_antes"] = antes
    # a consulta: a mesma agenda da Camila (o calendário dela) que a W7 usou para o Rafael
    cam = B.sql_principal(f"""select a.nutricionista_id::text as nutri, a.calendario_id::text as cal, a.conta_id::text as conta from {S}.agendamentos a
                               join {S}.profiles pr on pr.id = a.nutricionista_id where pr.nome = 'Camila Rocha' and a.calendario_id is not null limit 1""")[0]
    assert cam["nutri"] == diego["nutri"], "a Camila da agenda não é a nutricionista do Diego"
    inicio = dt.datetime.combine(HOJE + dt.timedelta(days=2), dt.time(10, 0), tzinfo=FUSO)
    P(f"""insert into {S}.agendamentos (id, nutricionista_id, calendario_id, paciente_id, titulo, inicio, fim, dia_inteiro, status, confirmacao, modulo, conta_id)
          values ('{ag}', '{cam['nutri']}', '{cam['cal']}', '{pid}', 'Retorno da nutrição', {lit(inicio.isoformat())}, {lit((inicio + dt.timedelta(hours=1)).isoformat())},
                  false, 'confirmado', 'a_confirmar', 'nutricao', '{cam['conta']}')
          on conflict (id) do update set inicio = excluded.inicio, fim = excluded.fim, status = 'confirmado', deleted_at = null""")
    # a mensalidade vencendo em 3 dias (a faixa âmbar da tela 1): coberta até o meio-dia de hoje + 3 (São Paulo)
    pago_ate = dt.datetime.combine(HOJE + dt.timedelta(days=3), dt.time(12, 0), tzinfo=FUSO)
    P(f"""update {S}.pacientes set mensalidade_valor = 249.00, mensalidade_pago_ate = {lit(pago_ate.isoformat())},
            mensalidade_desde = coalesce(mensalidade_desde, {lit((pago_ate - dt.timedelta(days=30)).isoformat())}) where id = '{pid}'""")
    return {"consulta": inicio.isoformat(), "mensalidade_pago_ate": pago_ate.isoformat()}


def marcar_do_dia(conta: str = "w10-aluno", refeicoes: int = 3, metas: int = 2) -> dict:
    """✓ de hoje pelas MESMAS funções do app, como o aluno (paciente_marcar_refeicao e aluno_marcar_meta): as primeiras refeições
    com alimento que valem hoje e as primeiras metas de hoje — o Início fica como a tela 1 ("3 de 5 refeições", metas com ✓).
    Os ✓ saem com o limpar da W11 (no começo do caso "acoes" e no --limpar)."""
    B.ESTADO["schema"] = "staging"
    st, d = B.rpc(conta, "minha_dieta", {"p_dia": str(HOJE)})
    assert st == 200 and isinstance(d, dict), (st, d)
    dow = HOJE.isoweekday()
    planos = sorted(d.get("planos") or [], key=lambda x: x["created_at"], reverse=True)
    atual = next((x for x in planos if x.get("favorito")), planos[0] if planos else None)
    assert atual, "o Diego devia ter plano (massa da W11)"
    hoje_refs = [r for r in sorted(atual["refeicoes"], key=lambda r: (r["ordem"], r.get("horario") or "")) if r.get("itens") and (not r.get("dias_semana") or dow in r["dias_semana"])]
    hoje_metas = sorted([m for m in d.get("metas") or [] if m.get("ativa") and dow in (m.get("dias_semana") or []) and (not m.get("inicio") or m["inicio"][:10] <= str(HOJE))],
                        key=lambda m: m["created_at"])
    feitas = {"refeicoes": [], "metas": []}
    for r in hoje_refs[:refeicoes]:
        st, x = B.rpc(conta, "paciente_marcar_refeicao", {"p_refeicao_id": r["id"], "p_data": str(HOJE), "p_concluida": True})
        assert st in (200, 204), (st, x)
        feitas["refeicoes"].append(r["nome"])
    for m in hoje_metas[:metas]:
        st, x = B.rpc(conta, "aluno_marcar_meta", {"p_meta_id": m["id"], "p_data": str(HOJE), "p_concluida": True})
        assert st in (200, 204), (st, x)
        feitas["metas"].append(m["titulo"])
    feitas["de"] = {"refeicoes": len(hoje_refs), "metas": len(hoje_metas)}
    return feitas


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    DRY["on"] = a.dry_run
    B.ESTADO["schema"] = "staging"
    B.BACKUP.mkdir(parents=True, exist_ok=True)
    tids = {conta: treino_user(conta) for conta in TREINOS}
    relatorio: dict = {"hoje": str(HOJE), "segunda": str(SEGUNDA), "acao": "limpar" if a.limpar else "semear", "dry_run": a.dry_run,
                       "treino_users": tids, "antes": contagens(list(tids.values()))}
    if a.limpar:
        for conta, tid in tids.items():
            limpar_treino(conta, tid)
        relatorio["principal"] = diego_principal(True, relatorio)
        ids = [M11.matricula_de(B.EMAIL[k])["id"] for k in ("w10-aluno", "paciente")]
        relatorio["checks_do_e2e"] = M11.limpar(ids) if not a.dry_run else "dry-run"
    else:
        relatorio["treino"] = {conta: semear_treino(conta, tid) for conta, tid in tids.items()}
        relatorio["principal"] = diego_principal(False, relatorio)
    relatorio["depois"] = contagens(list(tids.values()))
    # nada fora das contas de teste mudou: o total de cada tabela só varia pelas linhas delas (em produção um aluno de verdade
    # pode gravar uma série no mesmo segundo — aí só avisa, com os números, para conferir)
    relatorio["conferencia"] = {}
    for chave in [k for k in relatorio["antes"] if not k.endswith("(total)")]:
        d_total = relatorio["depois"][f"{chave} (total)"] - relatorio["antes"][f"{chave} (total)"]
        d_teste = relatorio["depois"][chave] - relatorio["antes"][chave]
        relatorio["conferencia"][chave] = {"total": d_total, "teste": d_teste, "ok": d_total == d_teste}
        if d_total != d_teste:
            print(f"ATENÇÃO {chave}: o total mudou {d_total} e as linhas de teste {d_teste} (atividade real no meio? conferir)")
    nome = f"massa_{'limpar' if a.limpar else 'semear'}{'_dry' if a.dry_run else ''}_{AGORA.strftime('%H%M%S')}.json"
    B.json_arquivo(B.BACKUP / nome, relatorio)
    print(json.dumps({k: v for k, v in relatorio.items() if k not in ("antes", "depois")}, ensure_ascii=False, indent=1, default=str))
    print("contagens (teste) antes → depois:", {k: f"{relatorio['antes'][k]} → {relatorio['depois'][k]}" for k in relatorio["antes"] if "total" not in k})
    print("fora da massa, nada mudou:", all(v["ok"] for v in relatorio["conferencia"].values()))
    print("relatório:", B.BACKUP / nome)
    return 0


if __name__ == "__main__":
    sys.exit(main())
