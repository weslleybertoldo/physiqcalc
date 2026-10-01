"""Physiq W18 — base dos testes de ponta a ponta do Perfil do aluno › Prontuário (anotações da equipe com visibilidade e as seções
clínicas do Nutri) e do card Prontuário do Resumo (tela 7). Reaproveita a base da W17/W16/W15/W14/W13 (a "Consultoria Ferreira W13":
Lucas dono + personal, Camila nutricionista, Bruno 2º personal, Rafael Moura aluno com login, Treino + Nutrição — o aluno da tela 7).

Contas de TESTE desta W (só *.teste.claude@physiqnutri.app — P26; senhas em ~/.physiq-teste-<nome>):
  w18-nutri2   w18.nutri2.teste.claude@physiqnutri.app   2ª nutricionista DESCARTÁVEL da conta (escreve o prontuário de um aluno e é
                                                          REMOVIDA da equipe no teste: deixa de ler o que escreveu — herdado da W5/W16)

Sem segredo no repo: chaves pela Management API (~/.pc-pat), senhas das contas de TESTE em ~/.physiq-teste-<nome>.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w17", Path(__file__).parent.parent / "w17" / "_base.py")
B17 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w17"] = B17
_ESPEC.loader.exec_module(B17)  # type: ignore[union-attr]
B16, B15, B14, B13, B5 = B17.B16, B17.B15, B17.B14, B17.B13, B17.B5

p = B17.p
ESTADO, CONTAS, EMAIL, NOMES = B17.ESTADO, B17.CONTAS, B17.EMAIL, B17.NOMES
Caso, sql_principal, sql_treino, saude_treino = B17.Caso, B17.sql_principal, B17.sql_treino, B17.saude_treino
http, service, anon, rpc, uid, sessao, token = B17.http, B17.service, B17.anon, B17.rpc, B17.uid, B17.sessao, B17.token
PRINCIPAL_REF, PRINCIPAL_URL, API_P, API_T, TREINO_REF = B17.PRINCIPAL_REF, B17.PRINCIPAL_URL, B17.API_P, B17.API_T, B17.TREINO_REF
conta_de, NOME_CONTA, conta_w13, rafael = B17.conta_de, B17.NOME_CONTA, B17.conta_w13, B17.rafael
saude_ok, esperar = B17.saude_ok, B17.esperar
json_arquivo, ler_json = B17.json_arquivo, B17.ler_json
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w18"
for _b in (B17, B16, B15, B14, B13, B5, B13.B12, B13.B12.B11, B13.B12.B10, B13.B12.B8, B13.B12.B7):
    _b.PRINTS = PRINTS
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "w18"

NUTRI2 = ("w18-nutri2", "w18.nutri2.teste.claude@physiqnutri.app", "Nutri Dois W18")
CONTAS.setdefault(NUTRI2[0], (NUTRI2[1], B5.senha_de(NUTRI2[0])))
NOMES.setdefault(NUTRI2[0], NUTRI2[2])

# as tabelas do prontuário (as 12 clínicas + as anotações) — o mesmo conjunto da migração 20261001030000_w18_visibilidade.sql
CLINICAS = ["consultas", "anamneses", "respostas_questionario", "pedidos_exame", "resultados_exame", "avaliacoes_integradas", "gestacoes",
            "registros_gestacionais", "analises_farmaco", "medicamentos_paciente", "documentos", "anexos"]
TABELAS = CLINICAS + ["registros_prontuario"]

# as anotações da tela 7 (dd/mm/aaaa hh:mm, autor, visibilidade, texto) — a do meio, "Só nutricionistas", NÃO aparece para o Lucas
ANOTACOES_TELA7 = [
    ("2026-07-16 10:20", "w13-dono", "personal", "equipe", "Subiu a carga do supino reto pra 60 kg. Técnica boa."),
    ("2026-07-09 18:40", "w13-nutri", "nutricionista", "nutricionistas",
     "Relata fome à noite e beliscos depois do jantar. Investigar ansiedade na próxima consulta; não comentar com o aluno ainda."),
    ("2026-07-02 09:15", "w13-nutri", "nutricionista", "equipe", "Plano ajustado: −150 kcal no jantar e mais proteína no lanche."),
    ("2026-06-14 07:30", "w13-dono", "personal", "equipe", "Avaliação por 7 dobras: gordura caiu de 19,6% pra 17,8%."),
]
MARCA = "W18"  # as linhas da massa levam esta marca no texto (a limpeza apaga só elas)


def schema() -> str:
    return ESTADO["schema"]


def garantir_nutri2(conta: str, ativa: bool = True) -> str:
    """A 2ª nutricionista descartável da conta (membro ativo com papel de nutricionista, ou removida)."""
    chave, email, nome = NUTRI2
    S = schema()
    u = B5.garantir_usuario(email, CONTAS[chave][1], nome)
    sql_principal(f"insert into {S}.profiles (id, nome, role) values ('{u}', $n${nome}$n$, 'pessoa') on conflict (id) do nothing")
    if not sql_principal(f"select 1 from {S}.conta_membros where conta_id = '{conta}' and user_id = '{u}'"):
        sql_principal(f"""insert into {S}.conta_membros (conta_id, user_id, papeis, status, codigo_convite)
                          values ('{conta}', '{u}', array['nutricionista']::text[], 'ativo', {S}.gerar_codigo_membro($n${nome}$n$))""")
    if ativa:
        sql_principal(f"update {S}.conta_membros set status = 'ativo', removido_em = null, papeis = array['nutricionista']::text[] "
                      f"where conta_id = '{conta}' and user_id = '{u}'")
    else:
        sql_principal(f"update {S}.conta_membros set status = 'removido', removido_em = now() where conta_id = '{conta}' and user_id = '{u}'")
    return u


def rest(token: str, metodo: str, tabela: str, filtro: str = "", corpo=None, prefer: str = "return=representation") -> tuple[int, object]:
    """PostgREST do banco principal COMO a pessoa (o mesmo caminho do app e de quem chamar a API direto)."""
    S = schema()
    cab = {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {token}", "Accept-Profile": S, "Content-Profile": S, "Prefer": prefer}
    st, r, _ = http(metodo, f"{PRINCIPAL_URL}/rest/v1/{tabela}{('?' + filtro) if filtro else ''}", corpo, cab, timeout=60)
    return st, r


def n_linhas(token: str, tabela: str, filtro: str) -> int:
    st, r = rest(token, "GET", tabela, f"select=id&{filtro}")
    assert st == 200, (tabela, st, r)
    return len(r) if isinstance(r, list) else -1


def storage(token: str, metodo: str, caminho: str, corpo: bytes | dict | None = None, tipo: str = "application/pdf") -> tuple[int, object]:
    """Storage do banco principal (bucket privado "anexos") COMO a pessoa (o texto da resposta; JSON quando for JSON)."""
    cab = {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {token}"}
    if isinstance(corpo, bytes):
        cab.update({"Content-Type": tipo, "x-upsert": "false"})
    st, r, _ = http(metodo, f"{PRINCIPAL_URL}/storage/v1/{caminho}", corpo, cab, timeout=60)
    return st, r


def apagar_arquivos(caminhos: list[str]) -> None:
    """Apaga arquivos do bucket "anexos" pela API do Storage com a service_role (o Supabase não deixa apagar direto na tabela)."""
    if not caminhos:
        return
    sp = service(PRINCIPAL_REF)
    st, r, _ = http("DELETE", f"{PRINCIPAL_URL}/storage/v1/object/anexos", {"prefixes": caminhos},
                    {"apikey": sp, "Authorization": f"Bearer {sp}"}, timeout=60)
    assert st == 200, ("apagar arquivos do Storage", st, r)


def pdf_minimo(titulo: str) -> bytes:
    """Um PDF de 1 página (válido) para o anexo de teste."""
    corpo = f"BT /F1 18 Tf 72 720 Td ({titulo}) Tj ET".encode()
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            b"<< /Length %d >>\nstream\n" % len(corpo) + corpo + b"\nendstream", b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    out = b"%PDF-1.4\n"
    pos = []
    for i, o in enumerate(objs, 1):
        pos.append(len(out))
        out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1) + b"".join(b"%010d 00000 n \n" % x for x in pos)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    return out
