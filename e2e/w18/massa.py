#!/usr/bin/env python3
"""Physiq W18 — massa de TESTE no staging do banco principal (idempotente; só a "Consultoria Ferreira W13" das contas w13.*).

  (sem opção)  o prontuário do Rafael Moura (o aluno da tela 7), GRAVADO PELA API COMO CADA AUTOR (a RLS da W18 confere):
               · 4 anotações — as 3 do card da tela 7 (16/07 e 14/06 do Lucas, personal, "Equipe"; 02/07 da Camila, "Equipe") e
                 1 da Camila "Só nutricionistas" (09/07), que o Lucas NÃO vê;
               · clínico da Camila (nutricionista responsável): 2 consultas, 1 anamnese, 1 pedido de exames + 3 resultados (2 fora da
                 referência), 1 atestado, 1 medicamento e 1 anexo em PDF (Storage privado "anexos"; no staging, "anexos-staging")
  --limpar     apaga o prontuário do Rafael no staging (anotações, clínico e o arquivo do anexo)

Uso: python3 e2e/w18/massa.py [--limpar]
"""
from __future__ import annotations

import argparse
import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S


def q(sql: str) -> list:
    return B.sql_principal(sql)


def ts(s: str) -> str:
    """'2026-07-16 10:20' (hora de Brasília) → ISO com fuso."""
    return s.replace(" ", "T") + ":00-03:00"


def criar(token: str, tabela: str, corpo: dict) -> dict:
    st, r = B.rest(token, "POST", tabela, corpo=corpo)
    assert st == 201 and isinstance(r, list) and r, (tabela, st, r)
    return r[0]


def limpar_rafael(pid: str) -> None:
    caminhos = [a["path"] for a in q(f"select path from {S}.anexos where paciente_id = '{pid}'")]
    caminhos += [o["name"] for o in q(f"select name from storage.objects where bucket_id = '{B.bucket_do_ambiente('anexos')}' and name like '%/{pid}/%'")]
    B.apagar_arquivos(sorted(set(caminhos)))
    for t in B.TABELAS:
        q(f"delete from {S}.{t} where paciente_id = '{pid}'")


def montar() -> dict:
    conta = B.conta_w13()
    raf = B.rafael(conta)
    lucas, camila = B.uid("w13-dono"), B.uid("w13-nutri")
    assert raf["personal_id"] == lucas and raf["nutricionista_id"] == camila, ("o Rafael tem que ser do Lucas (treino) e da Camila (nutrição)", raf)
    pid = raf["id"]
    limpar_rafael(pid)
    tok = {"w13-dono": B.token("w13-dono"), "w13-nutri": B.token("w13-nutri")}
    autores = {"w13-dono": lucas, "w13-nutri": camila}

    anot = []
    for quando, conta_autor, papel, vis, texto in B.ANOTACOES_TELA7:
        r = criar(tok[conta_autor], "registros_prontuario", {"nutricionista_id": autores[conta_autor], "paciente_id": pid, "data": ts(quando),
                                                             "texto": texto, "visibilidade": vis, "autor_papel": papel})
        anot.append({"id": r["id"], "autor": conta_autor, "visibilidade": vis, "data": quando})

    tc = tok["w13-nutri"]
    cons = [criar(tc, "consultas", {"nutricionista_id": camila, "paciente_id": pid, "data": ts("2026-07-02 09:00"), "origem": "manual",
                                    "observacao": "Retorno: ajuste do jantar e mais proteína no lanche. Peso 84,2 kg."})["id"],
            criar(tc, "consultas", {"nutricionista_id": camila, "paciente_id": pid, "data": ts("2026-06-04 08:30"), "origem": "manual",
                                    "observacao": "Primeira consulta: objetivo definição, treina 5x por semana."})["id"]]
    anam = criar(tc, "anamneses", {"nutricionista_id": camila, "paciente_id": pid, "titulo": "Anamnese inicial", "data": ts("2026-06-04 08:40"),
                                   "conteudo": [
                                       {"pergunta": "História do cliente: qual o objetivo principal?", "resposta": "Definição muscular para o verão."},
                                       {"pergunta": "História alimentar: quantas refeições faz por dia?", "resposta": "5 refeições; belisca à noite."},
                                       {"pergunta": "Sinais e sintomas: dorme bem?", "resposta": "Dorme 6 h, acorda cansado às vezes."},
                                   ], "texto_livre": "Sem alergias. Intolerância leve à lactose."})["id"]
    ped = criar(tc, "pedidos_exame", {"nutricionista_id": camila, "paciente_id": pid, "data": "2026-06-04",
                                      "exames": ["Glicemia de jejum", "Colesterol total", "Vitamina D (25-OH)"], "observacao": "Jejum de 8 horas."})["id"]
    res = [criar(tc, "resultados_exame", {"nutricionista_id": camila, "paciente_id": pid, "exame": e, "valor": v, "valor_texto": "", "unidade": u,
                                          "ref_min": a, "ref_max": b, "referencia_texto": "", "data": "2026-06-11", "observacao": ""})["id"]
           for e, v, u, a, b in (("Glicemia de jejum", 92, "mg/dL", 70, 99), ("Colesterol total", 212, "mg/dL", None, 190),
                                 ("Vitamina D (25-OH)", 24, "ng/mL", 30, 100))]
    doc = criar(tc, "documentos", {"nutricionista_id": camila, "paciente_id": pid, "tipo": "atestado", "titulo": "Atestado de comparecimento",
                                   "texto": "Atesto, para os devidos fins, que Rafael Moura esteve em consulta nutricional nesta data, das 9h às 10h.",
                                   "dados": {}, "data": "2026-07-02"})["id"]
    med = criar(tc, "medicamentos_paciente", {"nutricionista_id": camila, "paciente_id": pid, "medicamento": "Omeprazol", "dose": "20 mg",
                                              "posologia": "1 cápsula em jejum", "ativo": True, "observacao": ""})["id"]
    # anexo: o arquivo no Storage (pasta da Camila / do Rafael) e a linha — como o site antigo e a aba nova fazem
    caminho = f"{camila}/{pid}/{uuid.uuid4()}-exames-junho.pdf"
    corpo = B.pdf_minimo("Exames de junho - Rafael Moura (teste W18)")
    st, r = B.storage(tc, "POST", f"object/{B.bucket_do_ambiente('anexos')}/{caminho}", corpo)
    assert st == 200, ("upload do anexo", st, r)
    anx = criar(tc, "anexos", {"nutricionista_id": camila, "paciente_id": pid, "nome": "exames-junho.pdf", "path": caminho, "tamanho": len(corpo),
                               "mime": "application/pdf", "descricao": "Resultados de junho"})["id"]
    estado = {"conta": conta, "paciente": pid, "rota": pid, "lucas": lucas, "camila": camila, "anotacoes": anot, "consultas": cons,
              "anamnese": anam, "pedido": ped, "resultados": res, "documento": doc, "medicamento": med, "anexo": anx, "anexo_path": caminho}
    B.json_arquivo(B.SCRATCH / "massa_staging.json", estado)
    print(json.dumps(estado, ensure_ascii=False, indent=1))
    return estado


def limpar() -> None:
    raf = B.rafael(B.conta_w13())
    limpar_rafael(raf["id"])
    print("prontuário do Rafael apagado do staging (anotações, clínico e arquivos)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    limpar() if a.limpar else montar()
