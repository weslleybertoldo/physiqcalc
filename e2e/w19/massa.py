#!/usr/bin/env python3
"""Physiq W19 — massa do Financeiro na "Consultoria Ferreira W13" (STAGING; só contas de teste): os nomes da tela 6 e da tela 7.

  Lucas Ferreira (dono + personal): categorias padrão; entradas dos últimos 6 meses (a "Receita" sobe mês a mês), aluguel e material,
    uma entrada estornada; 1 recibo.
  Camila Rocha (nutricionista, membro): categorias dela; consultas de setembro e de hoje (o dono vê a categoria dela — política da
    W19); 2 recibos.
  Cobranças: Rafael Moura (mensalidade R$ 249, pagas em agosto/cartão e setembro/Pix → em dia até 19/10), João Pedro (mensalidade
    R$ 199 com o comprovante Pix AGUARDANDO a confirmação), Carlos Souza (consulta de retorno VENCIDA), Beatriz Lima (avaliação no
    prazo), Marina Alves (mensalidade R$ 189 paga em setembro → vence em outubro), Diego Souza (mensalidade R$ 159 vencida).

Tudo leva a marca (transacoes.observacao = "massa W19"; cobrancas.origem = "massa_w19"; recibos ligados às transações da massa) e
`--limpar` apaga só isso e devolve os campos de mensalidade dos alunos como estavam (guardados em ~/projetos/physiqcalc-scratch/w19/).

Uso: python3 e2e/w19/massa.py [--limpar]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
GUARDADO = B.SCRATCH / "massa_alunos_antes.json"
CATEGORIAS = ["Consulta", "Retorno", "Plano alimentar", "Aluguel", "Material", "Outros"]
ALUNOS = ["Rafael Moura", "João Pedro", "Carlos Souza", "Beatriz Lima", "Marina Alves", "Diego Souza"]
CAMPOS = "mensalidade_valor, mensalidade_pago_ate, mensalidade_desde, cobranca_pausada, cpf"


def q(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def hoje() -> dt.date:
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date()


def meio_dia(d: dt.date) -> str:
    return f"{d.isoformat()}T15:00:00Z"


def ids() -> dict:
    conta = B.conta_de("w13-dono", B.NOME_CONTA)
    assert conta, "a conta W13 não existe no staging (rode e2e/w13/massa.py)"
    alunos = {r["nome"]: r["id"] for r in B.sql_principal(
        f"select nome, id::text from {S}.pacientes where conta_id = '{conta}' and deleted_at is null and nome in ({', '.join(q(a) for a in ALUNOS)})")}
    falta = [a for a in ALUNOS if a not in alunos]
    assert not falta, f"alunos da tela 6 faltando na conta W13: {falta}"
    return {"conta": conta, "lucas": B.uid("w13-dono"), "camila": B.uid("w13-nutri"), "alunos": alunos}


def limpar(i: dict) -> None:
    conta = i["conta"]
    caminhos = [r["comprovante_path"] for r in B.sql_principal(
        f"select comprovante_path from {S}.cobrancas where conta_id = '{conta}' and origem = '{B.ORIGEM}' and comprovante_path is not null")]
    B.sql_principal(f"""
        update {S}.transacoes set recibo_id = null where conta_id = '{conta}' and (observacao = '{B.MARCA}' or descricao = 'Consulta W19 E2E');
        delete from {S}.recibos where transacao_id in (select id from {S}.transacoes where conta_id = '{conta}' and (observacao = '{B.MARCA}' or descricao = 'Consulta W19 E2E'));
        delete from {S}.transacoes where conta_id = '{conta}' and (observacao = '{B.MARCA}' or descricao = 'Consulta W19 E2E');
        delete from {S}.cobrancas where conta_id = '{conta}' and origem = '{B.ORIGEM}';""")
    B.apagar_comprovantes(caminhos)
    if GUARDADO.exists():
        antes = json.loads(GUARDADO.read_text())
        for pid, c in antes.items():
            sets = ", ".join(f"{k} = {('null' if v is None else q(str(v)))}" for k, v in c.items())
            B.sql_principal(f"update {S}.pacientes set {sets} where id = '{pid}'")
        GUARDADO.unlink()


def categorias(uid: str, conta: str) -> dict:
    tem = {r["nome"]: r["id"] for r in B.sql_principal(f"select nome, id::text from {S}.categorias_financeiras where nutricionista_id = '{uid}' and deleted_at is null")}
    for nome in CATEGORIAS:
        if nome not in tem:
            r = B.sql_principal(f"insert into {S}.categorias_financeiras (nutricionista_id, conta_id, nome) values ('{uid}', '{conta}', {q(nome)}) returning id::text")
            tem[nome] = r[0]["id"]
    return tem


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    i = ids()
    limpar(i)
    if a.limpar:
        print("massa W19 apagada (staging)")
        return 0
    conta, lucas, camila, al = i["conta"], i["lucas"], i["camila"], i["alunos"]
    antes = {r["id"]: {k: r[k] for k in ("mensalidade_valor", "mensalidade_pago_ate", "mensalidade_desde", "cobranca_pausada", "cpf")}
             for r in B.sql_principal(f"select id::text, {CAMPOS} from {S}.pacientes where id in ({', '.join(q(x) for x in al.values())})")}
    GUARDADO.write_text(json.dumps(antes, default=str))
    cat_l = categorias(lucas, conta)
    cat_c = categorias(camila, conta)
    h = hoje()
    mes0 = h.replace(day=1)

    def mes(n: int, dia: int) -> dt.date:
        a_, m_ = mes0.year, mes0.month + n
        while m_ <= 0:
            a_, m_ = a_ - 1, m_ + 12
        return dt.date(a_, m_, min(dia, 28))

    tx = []  # (autor, tipo, descricao, valor, data, metodo, categoria, aluno, estornada)
    plano = {-5: (600, 450, 800), -4: (700, 500, 1100), -3: (800, 650, 1300), -2: (900, 700, 1800), -1: (1000, 850, 2100)}
    for n, (v1, v2, v3) in plano.items():
        tx += [("L", "entrada", "Avaliação física", v1, mes(n, 6), "pix", "Consulta", "Carlos Souza", False),
               ("L", "entrada", "Retorno do treino", v2, mes(n, 14), "dinheiro", "Retorno", "João Pedro", False),
               ("L", "entrada", "Consultoria mensal", v3, mes(n, 22), "cartao_credito", "Outros", "Rafael Moura", False)]
    tx += [("L", "saida", "Aluguel da sala", 900, mes(-2, 5), "transferencia", "Aluguel", None, False),
           ("L", "saida", "Aluguel da sala", 900, mes(-1, 5), "transferencia", "Aluguel", None, False),
           ("L", "saida", "Elásticos e colchonetes", 150, mes(-1, 10), "cartao_debito", "Material", None, False),
           ("L", "entrada", "Plano trimestral (cancelado)", 600, mes(-1, 12), "pix", "Outros", "Beatriz Lima", True),
           ("L", "entrada", "Avaliação física", 480, h, "pix", "Consulta", "Rafael Moura", False),
           ("C", "entrada", "Consulta nutricional", 180, mes(-1, 8), "pix", "Consulta", "Marina Alves", False),
           ("C", "entrada", "Consulta nutricional", 180, mes(-1, 22), "cartao_debito", "Consulta", "Beatriz Lima", False),
           ("C", "entrada", "Retorno nutricional", 150, h, "pix", "Retorno", "Rafael Moura", False)]
    criadas = []
    for autor, tipo, desc, valor, data, metodo, cat, aluno, estornada in tx:
        uid, cats = (lucas, cat_l) if autor == "L" else (camila, cat_c)
        r = B.sql_principal(f"""insert into {S}.transacoes (nutricionista_id, conta_id, paciente_id, tipo, descricao, valor, data, metodo, categoria_id, estornada, observacao)
              values ('{uid}', '{conta}', {q(al[aluno]) if aluno else 'null'}, '{tipo}', {q(desc)}, {valor}, '{data.isoformat()}', '{metodo}', '{cats[cat]}', {str(estornada).lower()}, '{B.MARCA}')
              returning id::text""")
        criadas.append((r[0]["id"], autor, desc, valor, data, aluno))
    # recibos (o número sai do gatilho, por profissional): 2 da Camila, 1 do Lucas — ligados às entradas
    def recibo(tid: str, uid: str, aluno: str, desc: str, valor: float, data: dt.date, nome_prof: str, nutri: bool) -> None:
        texto = (f"Recebi de {aluno}, CPF não informado, a quantia de R$ {valor:.2f}".replace(".", ",") +
                 f" ({'cento e oitenta reais' if valor == 180 else 'quatrocentos e oitenta reais'}), referente a atendimento{' nutricional' if nutri else ''}.\n\n"
                 f"Para maior clareza, firmo o presente recibo.\n\n{data.strftime('%d/%m/%Y')}\n\n{nome_prof}\n[carimbo]")
        r = B.sql_principal(f"""insert into {S}.recibos (nutricionista_id, conta_id, paciente_id, transacao_id, valor, data, descricao, texto)
              values ('{uid}', '{conta}', '{al[aluno]}', '{tid}', {valor}, '{data.isoformat()}', {q(desc)}, {q(texto)}) returning id::text, numero""")
        B.sql_principal(f"update {S}.transacoes set recibo_id = '{r[0]['id']}' where id = '{tid}'")
    for tid, autor, desc, valor, data, aluno in criadas:
        if autor == "C" and desc == "Consulta nutricional":
            recibo(tid, camila, aluno, desc, valor, data, "Camila Rocha", True)
        if autor == "L" and valor == 480:
            recibo(tid, lucas, aluno, desc, valor, data, "Lucas Ferreira", False)

    # mensalidades e cobranças (o gatilho recalcula a cobertura de cada aluno)
    def cob(aluno: str, tipo: str, desc: str, valor: float, venc: dt.date, status: str, forma: str | None = None, metodo: str | None = None,
            pago: dt.date | None = None, comprovante: str | None = None, enviado: bool = False) -> None:
        B.sql_principal(f"""insert into {S}.cobrancas (nutricionista_id, criado_por, conta_id, paciente_id, tipo, descricao, valor, vencimento, mes_ref, status, forma,
                                metodo, pago_em, comprovante_path, enviado_em, origem)
              values ('{lucas}', '{lucas}', '{conta}', '{al[aluno]}', '{tipo}', {q(desc)}, {valor}, '{venc.isoformat()}', '{venc.replace(day=1).isoformat()}', '{status}',
                      {q(forma) if forma else 'null'}, {q(metodo) if metodo else 'null'}, {q(meio_dia(pago)) if pago else 'null'}, {q(comprovante) if comprovante else 'null'},
                      {'now()' if enviado else 'null'}, '{B.ORIGEM}')""")
    for nome, valor in (("Rafael Moura", 249), ("João Pedro", 199), ("Marina Alves", 189), ("Diego Souza", 159)):
        B.sql_principal(f"update {S}.pacientes set mensalidade_valor = {valor}, cobranca_pausada = false, mensalidade_pago_ate = null, "
                        f"mensalidade_desde = {q(meio_dia(mes(-1, 25)))} where id = '{al[nome]}'")
    cob("Rafael Moura", "mensalidade", "Mensalidade · Agosto", 249, mes(-2, 19), "paga", "mp", "cartao", mes(-2, 19))
    cob("Rafael Moura", "mensalidade", "Mensalidade · Setembro", 249, mes(-1, 19), "paga", "pix_manual", "pix", mes(-1, 18))
    cob("Marina Alves", "mensalidade", "Mensalidade · Setembro", 189, mes(-1, 15), "paga", "manual", "dinheiro", mes(-1, 15))
    cob("Diego Souza", "mensalidade", "Mensalidade · Agosto", 159, mes(-2, 20), "paga", "pix_manual", "pix", mes(-2, 20))
    caminho = f"conta/{conta}/{al['João Pedro']}/massa-w19-{h.isoformat()}.png"
    B.subir_comprovante_servico(caminho)
    cob("João Pedro", "mensalidade", f"Mensalidade · {['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][h.month - 1]}",
        199, h, "aguardando_confirmacao", "pix_manual", "pix", None, caminho, True)
    cob("Carlos Souza", "avulsa", "Consulta de retorno", 120, h - dt.timedelta(days=5), "aberta")
    cob("Beatriz Lima", "avulsa", "Avaliação física", 150, h + dt.timedelta(days=9), "aberta")

    r = B.sql_principal(f"""select (select count(*) from {S}.transacoes where conta_id = '{conta}' and observacao = '{B.MARCA}') tx,
                                   (select count(*) from {S}.cobrancas where conta_id = '{conta}' and origem = '{B.ORIGEM}') cob,
                                   (select count(*) from {S}.recibos where conta_id = '{conta}' and transacao_id in
                                        (select id from {S}.transacoes where observacao = '{B.MARCA}')) rec""")[0]
    pago = {x["nome"]: x["ate"] for x in B.sql_principal(
        f"select nome, mensalidade_pago_ate::date::text ate from {S}.pacientes where id in ({', '.join(q(x) for x in al.values())})")}
    print(f"massa W19 (staging): {r} · cobertura: {pago}")
    B.json_arquivo(B.SCRATCH / "massa_staging.json", {"conta": conta, "lucas": lucas, "camila": camila, "alunos": al, "contagens": r, "pago_ate": pago})
    p.check(r["tx"] == len(tx) and r["cob"] == 7 and r["rec"] == 3, f"massa criada ({r})")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
