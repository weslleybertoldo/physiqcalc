#!/usr/bin/env python3
"""Physiq W22 — massa do STAGING para as telas do Painel › Mensagens (e o site antigo lado a lado). Só contas de TESTE, só histórico JÁ
RESOLVIDO (enviada · falhou · cancelada — nunca "pendente": nada disto pode sair pro WhatsApp), telefone fictício (+55 00 9…), e
profissionais SEM instância conectada (conferido antes). Guarda o que mudou em ~/projetos/physiqcalc-scratch/w22/massa_staging.json e
desfaz tudo com --limpar (contagens iguais às de antes).

  prof2 (personal)      o WhatsApp dele em Configurações (fictício) + 5 mensagens: aniversário e lembrete enviados, teste enviado, 1 cobrança
                        com FALHA (o número do menu = 1) e 1 confirmação cancelada
  W13 (equipe)          Bruno manda o aniversário do Carlos (aluno dele) e Lucas o lembrete do João: o dono vê os 2 em "Toda a equipe"
  nutri-legado          o site antigo lado a lado: o mesmo número, 3 mensagens no histórico, texto próprio na véspera, horário 08:00 e
                        2 momentos ligados (mesma config nos 2 sites)

Uso: python3 e2e/w22/massa.py   ·   python3 e2e/w22/massa.py --limpar
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p, q = B.p, B.q
ARQ = B.SCRATCH / "massa_staging.json"
NUMERO = "+5500900000099"
NUMERO_NUTRI = "+5500900000098"
TEXTO_PROPRIO = "Oi, {nome}! Amanhã ({data}) tem consulta às {hora}. Qualquer coisa me chama aqui."


def aluno_id(conta_id: str, nome: str) -> str:
    r = B.sql_principal(f"select id::text from {S}.pacientes where conta_id = {q(conta_id)} and nome = {q(nome)} and deleted_at is null limit 1")
    assert r, f"aluno {nome} não achado"
    return r[0]["id"]


def contagens() -> dict:
    return B.sql_principal(f"select (select count(*) from {S}.mensagens_whatsapp)::int fila, (select count(*) from {S}.whatsapp_instancias)::int inst, "
                           f"(select count(*) from {S}.pacientes)::int pac")[0]


def inserir(nutri: str, paciente: str | None, tipo: str, destino: str, texto: str, status: str, horas: float, erro: str | None = None) -> str:
    assert status in ("enviada", "falhou", "cancelada"), "massa nunca grava pendente"
    r = B.sql_principal(f"""insert into {S}.mensagens_whatsapp (nutricionista_id, paciente_id, tipo, destino_e164, texto, status, erro, agendada_para,
                              enviada_em, created_at, updated_at, tentativas)
                            values ({q(nutri)}, {q(paciente) if paciente else 'null'}, {q(tipo)}, {q(destino)}, {q(texto)}, {q(status)},
                              {q(erro) if erro else 'null'}, now() - interval '{horas} hours',
                              {"now() - interval '" + str(horas - 0.01) + " hours'" if status == 'enviada' else 'null'},
                              now() - interval '{horas} hours', now() - interval '{horas - 0.01} hours', 1)
                            returning id::text""")
    return r[0]["id"]


def criar() -> None:
    assert not ARQ.exists(), f"já existe uma massa ({ARQ}): rode --limpar antes"
    B.saude_ok("massa W22")
    B.garantir_seguro(["prof2", "w13-dono", "w13-personal2", "nutri-legado"])
    antes = contagens()
    u_prof2, u_lucas, u_bruno, u_nutri = B.uid("prof2"), B.uid("w13-dono"), B.uid("w13-personal2"), B.uid("nutri-legado")
    perfis = {u: B.sql_principal(f"select dados_profissionais, config from {S}.profiles where id = {q(u)}")[0] for u in (u_prof2, u_nutri)}
    m: dict = {"antes": antes, "perfis": perfis, "ids": []}
    ARQ.write_text(json.dumps(m, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    # o WhatsApp de Configurações (fictício)
    for u, num in ((u_prof2, NUMERO), (u_nutri, NUMERO_NUTRI)):
        B.sql_principal(f"""update {S}.profiles set dados_profissionais = coalesce(dados_profissionais, '{{}}'::jsonb)
                              || jsonb_build_object('whatsapp_e164', {q(num)}, 'telefone', {q('+55 (00) 9' + num[-8:-4] + '-' + num[-4:])}) where id = {q(u)}""")
    conta2 = B.conta_prof2()
    dois = aluno_id(conta2, "Aluno Dois")
    ids = m["ids"]
    ids.append(inserir(u_prof2, dois, "aniversario", "+5500900000201", "Oi, Aluno! Feliz aniversário! 🎉 Que seu dia seja ótimo. Um abraço, Rafael.", "enviada", 26))
    ids.append(inserir(u_prof2, dois, "lembrete_consulta", "+5500900000201", "Oi, Aluno! Sua consulta é hoje às 18:00. Te espero!", "enviada", 5))
    ids.append(inserir(u_prof2, dois, "cobranca_vencida", "+5500900000201",
                       "Oi, Aluno! Notei que a mensalidade de R$ 150,00, que venceu em 30/09, ainda está em aberto. Se já pagou, me avisa pra eu dar baixa.",
                       "falhou", 2, "esse número não tem WhatsApp"))
    ids.append(inserir(u_prof2, None, "teste", NUMERO, "Oi, Rafael! Esta é a mensagem de teste do Physiq. Seu WhatsApp está conectado. ✅", "enviada", 72))
    ids.append(inserir(u_prof2, dois, "confirmacao_agendamento", "+5500900000201", "Oi, Aluno! Sua consulta ficou marcada para 03/10 às 07:00. Até lá!",
                       "cancelada", 30, "o aluno excluiu a conta"))
    w13 = B.conta_de("w13-dono", B.NOME_CONTA)
    carlos, joao = aluno_id(w13, "Carlos Souza"), aluno_id(w13, "João Pedro")
    ids.append(inserir(u_bruno, carlos, "aniversario", "+5500900000301", "Oi, Carlos! Feliz aniversário! 🎉 Que seu dia seja ótimo. Um abraço, Bruno.", "enviada", 3))
    ids.append(inserir(u_lucas, joao, "lembrete_consulta", "+5500900000302",
                       "Oi, João! Passando pra lembrar da sua consulta amanhã, dia 02/10, às 07:00. Até lá!", "enviada", 4))
    # o site antigo lado a lado: histórico + a MESMA config (texto próprio na véspera, horário 08:00, 2 momentos)
    leg = B.conta_nutri_legado()
    pac = aluno_id(leg, "Paciente Teste Claude")
    ids.append(inserir(u_nutri, pac, "lembrete_consulta", "+5500900000401", "Oi, Paciente! Amanhã (02/10) tem consulta às 09:30. Qualquer coisa me chama aqui.", "enviada", 6))
    ids.append(inserir(u_nutri, pac, "aniversario", "+5500900000401", "Oi, Paciente! Feliz aniversário! 🎉 Que seu dia seja ótimo. Um abraço, Nutri.", "enviada", 30))
    ids.append(inserir(u_nutri, pac, "cobranca_vencendo", "+5500900000401",
                       "Oi, Paciente! Sua mensalidade de R$ 200,00 vence amanhã, dia 02/10. Qualquer dúvida é só me chamar.", "falhou", 8, "número inválido"))
    cfg = {"ativo": True, "horario": "08:00", "momentos": {"lembrete_vespera": True, "aniversario": True}, "textos": {"lembrete_vespera": TEXTO_PROPRIO}}
    B.sql_principal(f"update {S}.profiles set config = coalesce(config, '{{}}'::jsonb) || jsonb_build_object('whatsapp', {q(json.dumps(cfg))}::jsonb) where id = {q(u_nutri)}")
    m.update({"conta_prof2": conta2, "w13": w13, "legado": leg, "aluno_dois": dois, "carlos": carlos, "joao": joao, "paciente_legado": pac, "cfg_nutri": cfg,
              "numero": NUMERO, "numero_nutri": NUMERO_NUTRI})
    ARQ.write_text(json.dumps(m, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    p.check(len(ids) == 10, f"10 mensagens de histórico (enviada/falhou/cancelada) em contas de teste sem conexão → {len(ids)}")
    p.check(B.pendentes_de(S, [u_prof2, u_lucas, u_bruno, u_nutri]) == 0, "nenhuma pendente nas filas usadas")
    print("massa:", ARQ)


def limpar() -> None:
    if not ARQ.exists():
        print("sem massa para limpar")
        return
    m = json.loads(ARQ.read_text(encoding="utf-8"))
    if m.get("ids"):
        lista = ",".join(q(i) for i in m["ids"])
        B.sql_principal(f"delete from {S}.mensagens_whatsapp where id in ({lista})")
    for u, pr in (m.get("perfis") or {}).items():
        dp = pr.get("dados_profissionais")
        cfg = pr.get("config")
        B.sql_principal(f"update {S}.profiles set dados_profissionais = {q(json.dumps(dp)) + '::jsonb' if dp is not None else 'null'}, "
                        f"config = {q(json.dumps(cfg)) + '::jsonb' if cfg is not None else q('{}') + '::jsonb'} where id = {q(u)}")
    # o que as telas criaram: as linhas de instância que a 1ª visita cria ficam (são as do site antigo também) — só voltam a 'desconectado'
    depois = contagens()
    antes = m["antes"]
    p.check(depois["fila"] == antes["fila"] and depois["pac"] == antes["pac"], f"limpeza: fila e alunos iguais ({antes} × {depois})")
    ARQ.rename(ARQ.with_suffix(".limpa.json"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    limpar() if a.limpar else criar()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
