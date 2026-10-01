#!/usr/bin/env python3
"""Physiq W16 — E2E de SERVIDOR no staging (contas de teste w13.* + uma nutricionista descartável w16.nutri2.*):

  treino   a função treino-leitura do Treino: a nutricionista responsável LÊ o treino do aluno (get · semanaAtual · volume) sem
           sessão do Treino; sem token, token ruim, outra conta, o próprio aluno e ação de escrita são recusados
  rls      a dieta pela RLS do principal (migração 20260930200000_w16_dieta.sql): a nutri que cria lê e escreve; o personal vê o
           plano e não as metas; o dono vê tudo; outra nutri da conta não vê; REMOVIDA da equipe, a nutri deixa de ler o que
           criou (W5) e a nova responsável lê e edita o que ela criou
  aviso    "Salvar e enviar ao aluno": o aviso "plano atualizado" no sino do aluno (NF9), sem repetir, por papel; nada de WhatsApp

Uso: python3 e2e/w16/api.py [--so treino|rls|aviso]
"""
from __future__ import annotations

import argparse
import contextlib
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
ORIGEM = "https://physiqcalc-staging.vercel.app"
NUTRI2 = ("w16-nutri2", "w16.nutri2.teste.claude@physiqnutri.app", "Nutri Dois W16")


@contextlib.contextmanager
def bloco(titulo: str):
    print(f"\n— {titulo}", flush=True)
    try:
        yield
    except AssertionError as e:
        p.check(False, f"{titulo}: {str(e)[:300]}")


def leitura(token: str | None, corpo: dict) -> tuple[int, dict]:
    cab = {"x-schema": S, "Origin": ORIGEM}
    if token is not None:
        cab["Authorization"] = f"Bearer {token}"
    st, r, _ = B.http("POST", f"{B.API_T}/functions/v1/treino-leitura", corpo, cab, timeout=90)
    return st, (r if isinstance(r, dict) else {"bruto": r})


def rest(token: str, metodo: str, tabela: str, filtro: str = "", corpo=None, prefer: str = "return=representation") -> tuple[int, object]:
    cab = {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {token}", "Accept-Profile": S, "Content-Profile": S, "Prefer": prefer}
    st, r, _ = B.http(metodo, f"{B.PRINCIPAL_URL}/rest/v1/{tabela}{('?' + filtro) if filtro else ''}", corpo, cab, timeout=60)
    return st, r


def n_linhas(token: str, tabela: str, filtro: str) -> int:
    st, r = rest(token, "GET", tabela, f"select=id&{filtro}")
    assert st == 200, (tabela, st, r)
    return len(r) if isinstance(r, list) else -1


def bloco_treino(m: dict) -> None:
    B.saude_ok("treino-leitura")
    camila = B.token("w13-nutri")
    with bloco("nutricionista lê o treino do aluno sem sessão do Treino (get)"):
        st, r = leitura(camila, {"action": "get", "aluno": m["paciente"]})
        p.check(st == 200, f"200 ({st} {str(r)[:160]})")
        p.check(r.get("podeEditar") is False and r.get("somenteLeitura") is True, "só leitura (podeEditar=false)")
        nomes = sorted(g.get("nome") for g in r.get("gruposDisponiveis", []))
        p.check(len(nomes) >= 3, f"os treinos A/B/C do Rafael ({nomes})")
        prescr = [x for x in r.get("seriesPadrao", []) if x.get("reps_alvo")]
        p.check(len(prescr) >= 5, f"a prescrição da tela 8 vem junto ({len(prescr)} linhas com reps)")
        total_ex = sum(len(v) for v in (r.get("exerciciosPorTreino") or {}).values())
        p.check(total_ex >= 10, f"exercícios dos treinos ({total_ex})")
    with bloco("nutricionista: semana atual e volume"):
        d = B.B5.hoje()
        seg = d.fromordinal(d.toordinal() - d.weekday())
        st, r = leitura(camila, {"action": "semanaAtual", "aluno": m["paciente"], "inicio": str(seg), "fim": str(seg.fromordinal(seg.toordinal() + 6))})
        p.check(st == 200 and "concluidos" in r, f"semanaAtual 200 ({st})")
        st, r = leitura(camila, {"action": "volume", "aluno": m["paciente"]})
        p.check(st == 200 and "grupos" in r, f"volume 200 ({st})")
    with bloco("recusas: sem token, token ruim, outra conta, o próprio aluno, escrita"):
        st, r = leitura(None, {"action": "get", "aluno": m["paciente"]})
        p.check(st == 401 and r.get("error") == "missing_auth", f"sem token → 401 ({st} {r.get('error')})")
        st, r = leitura("x" * 40, {"action": "get", "aluno": m["paciente"]})
        p.check(st == 401 and r.get("error") == "invalid_token", f"token ruim → 401 ({st} {r.get('error')})")
        st, r = leitura(B.token("w5-nutri"), {"action": "get", "aluno": m["paciente"]})
        p.check(st == 403 and r.get("error") == "sem_acesso", f"nutri de outra conta → 403 ({st} {r.get('error')})")
        st, r = leitura(B.token("w13-aluno"), {"action": "get", "aluno": m["paciente"]})
        p.check(st == 403, f"o próprio aluno não lê pelo painel → 403 ({st} {r.get('error')})")
        st, r = leitura(camila, {"action": "setPrescricao", "aluno": m["paciente"]})
        p.check(st == 400 and r.get("error") == "acao_invalida", f"ação de escrita → 400 ({st} {r.get('error')})")
        st, r = leitura(camila, {"action": "get", "aluno": "nao-e-uuid"})
        p.check(st == 400 and r.get("error") == "aluno_invalido", f"aluno inválido → 400 ({st})")


def garantir_nutri2(conta: str) -> str:
    chave, email, nome = NUTRI2
    if chave not in B.CONTAS:
        B.CONTAS[chave] = (email, B.B5.senha_de(chave))
        B.NOMES[chave] = nome
    u = B.B5.garantir_usuario(email, B.CONTAS[chave][1], nome)
    B.sql_principal(f"insert into {S}.profiles (id, nome, role) values ('{u}', $n${nome}$n$, 'pessoa') on conflict (id) do nothing")
    if not B.sql_principal(f"select 1 from {S}.conta_membros where conta_id = '{conta}' and user_id = '{u}'"):
        B.sql_principal(f"""insert into {S}.conta_membros (conta_id, user_id, papeis, status, codigo_convite)
                            values ('{conta}', '{u}', array['nutricionista']::text[], 'ativo', {S}.gerar_codigo_membro($n${nome}$n$))""")
    B.sql_principal(f"update {S}.conta_membros set status = 'ativo', removido_em = null, papeis = array['nutricionista']::text[] where conta_id = '{conta}' and user_id = '{u}'")
    return u


def bloco_rls(m: dict) -> None:
    conta = m["conta"]
    n2 = garantir_nutri2(conta)
    bruno, camila_id = B.uid("w13-personal2"), B.uid("w13-nutri")
    # aluno descartável sem login: nutri = a nutri2, personal = Bruno
    B.sql_principal(f"delete from {S}.pacientes where conta_id = '{conta}' and nome = 'Aluno RLS W16'")
    aluno = B.sql_principal(f"""insert into {S}.pacientes (nutricionista_id, personal_id, conta_id, nome, origem, ativo)
                               values ('{n2}', '{bruno}', '{conta}', 'Aluno RLS W16', 'novo', true) returning id::text""")[0]["id"]
    t2 = B.token("w16-nutri2")
    try:
        with bloco("a nutri responsável cria a dieta pela RLS (plano, refeição, item, meta, orientação, cálculo)"):
            st, pl = rest(t2, "POST", "planos_alimentares", corpo={"nutricionista_id": n2, "paciente_id": aluno, "titulo": "Plano RLS W16"})
            p.check(st == 201 and isinstance(pl, list), f"plano 201 ({st} {str(pl)[:120]})")
            plano = pl[0]["id"]
            st, rf = rest(t2, "POST", "refeicoes", corpo={"plano_id": plano, "nome": "Almoço", "ordem": 0, "dias_semana": [6]})
            p.check(st == 201 and rf[0]["dias_semana"] == [6], f"refeição só no sábado 201 ({st})")
            alim = B.alimento("Arroz, integral, cozido")
            st, it = rest(t2, "POST", "itens_refeicao", corpo={"refeicao_id": rf[0]["id"], "alimento_id": alim["id"], "quantidade_g": 150, "ordem": 0})
            p.check(st == 201, f"item 201 ({st})")
            st, mt = rest(t2, "POST", "metas", corpo={"nutricionista_id": n2, "paciente_id": aluno, "titulo": "Beber água W16", "dias_semana": [1, 2, 3, 4, 5, 6, 7], "ativa": True})
            p.check(st == 201, f"meta 201 ({st} {str(mt)[:120]})")
            st, ori = rest(t2, "POST", "orientacoes", corpo={"nutricionista_id": n2, "paciente_id": aluno, "titulo": "Orientação W16", "conteudo": "Mastigar devagar."})
            p.check(st == 201, f"orientação 201 ({st})")
            st, ca = rest(t2, "POST", "calculos_energeticos", corpo={"nutricionista_id": n2, "paciente_id": aluno, "formula": "mifflin", "fator_atividade": 1.55, "data": "2026-09-30T10:00:00-03:00"})
            p.check(st == 201, f"cálculo 201 ({st} {str(ca)[:160]})")
        filtro = f"paciente_id=eq.{aluno}"
        with bloco("personal responsável vê o plano e não as metas; dono vê tudo; outra nutri da conta não vê"):
            tb = B.token("w13-personal2")
            p.check(n_linhas(tb, "planos_alimentares", filtro) == 1, "personal: o plano (1)")
            p.check(n_linhas(tb, "itens_refeicao", f"refeicao_id=eq.{rf[0]['id']}") == 1, "personal: os itens do plano (1)")
            p.check(n_linhas(tb, "metas", filtro) == 0, "personal: nenhuma meta (0)")
            p.check(n_linhas(tb, "orientacoes", filtro) == 0, "personal: nenhuma orientação (0)")
            tl = B.token("w13-dono")
            p.check(n_linhas(tl, "metas", filtro) == 1 and n_linhas(tl, "orientacoes", filtro) == 1 and n_linhas(tl, "calculos_energeticos", filtro) == 1,
                 "dono: metas, orientações e cálculos (W16: ver pela conta)")
            tc = B.token("w13-nutri")
            p.check(n_linhas(tc, "planos_alimentares", filtro) == 0 and n_linhas(tc, "metas", filtro) == 0, "outra nutri da conta (não responsável): nada (P1)")
            st, r = rest(tc, "PATCH", "planos_alimentares", f"id=eq.{plano}", {"titulo": "invadido"})
            p.check(st in (200, 204) and (r == [] or r is None), f"outra nutri não edita o plano (0 linhas; {st})")
        with bloco("nutri REMOVIDA da equipe deixa de ler o que criou (W5) e a nova responsável assume"):
            membro = B.sql_principal(f"select id::text from {S}.conta_membros where conta_id = '{conta}' and user_id = '{n2}'")[0]["id"]
            st, r = B.rpc("w13-dono", "remover_membro", {"p_membro": membro, "p_novo_nutri": camila_id})
            p.check(st == 200 and isinstance(r, dict) and r.get("ok"), f"dono removeu a nutri2 e passou os alunos para a Camila ({st} {str(r)[:120]})")
            t2b = B.token("w16-nutri2")
            for tab in ("planos_alimentares", "metas", "orientacoes", "calculos_energeticos"):
                p.check(n_linhas(t2b, tab, filtro) == 0, f"removida: {tab} = 0")
            p.check(n_linhas(t2b, "refeicoes", f"plano_id=eq.{plano}") == 0 and n_linhas(t2b, "itens_refeicao", f"refeicao_id=eq.{rf[0]['id']}") == 0,
                 "removida: refeições e itens = 0")
            tc = B.token("w13-nutri")
            p.check(n_linhas(tc, "planos_alimentares", filtro) == 1 and n_linhas(tc, "metas", filtro) == 1, "a nova responsável (Camila) lê o que a removida criou")
            st, r = rest(tc, "PATCH", "planos_alimentares", f"id=eq.{plano}", {"titulo": "Plano RLS W16 (Camila)"})
            p.check(st == 200 and isinstance(r, list) and len(r) == 1, f"e edita (W16: editar pela conta) ({st})")
            st, r = rest(tc, "POST", "itens_refeicao", corpo={"refeicao_id": rf[0]["id"], "alimento_id": alim["id"], "quantidade_g": 50, "ordem": 1})
            p.check(st == 201, f"e põe alimento na refeição que a outra criou ({st})")
    finally:
        B.sql_principal(f"delete from {S}.pacientes where id = '{aluno}'")
        B.sql_principal(f"update {S}.conta_membros set status = 'removido', removido_em = now() where conta_id = '{conta}' and user_id = '{n2}'")


def bloco_aviso(m: dict) -> None:
    raf = B.rafael(m["conta"])
    B.sql_principal(f"delete from {S}.avisos where destino_user_id = '{raf['user_id']}' and tipo = 'plano_atualizado'")
    with bloco("Salvar e enviar: o aviso no sino do aluno, sem repetir"):
        st, r = B.rpc("w13-nutri", "aluno_avisar_plano", {"p_aluno": m["paciente"], "p_modulos": ["dieta"]})
        p.check(st == 200 and r.get("avisado") is True, f"nutri → avisado ({st} {r})")
        st, r = B.rpc("w13-nutri", "aluno_avisar_plano", {"p_aluno": m["paciente"], "p_modulos": ["dieta"]})
        p.check(st == 200 and r.get("repetido") is True and not r.get("avisado"), f"de novo em seguida → não repete ({r})")
        av = B.sql_principal(f"select titulo, link, lido_em from {S}.avisos where destino_user_id = '{raf['user_id']}' and tipo = 'plano_atualizado'")
        p.check(len(av) == 1 and av[0]["titulo"] == "Sua dieta foi atualizada" and av[0]["link"] == "/dieta", f"1 aviso 'Sua dieta foi atualizada' → /dieta ({av})")
        st, r = B.rpc("w13-dono", "aluno_avisar_plano", {"p_aluno": m["paciente"], "p_modulos": ["treino", "dieta"]})
        av = B.sql_principal(f"select titulo from {S}.avisos where destino_user_id = '{raf['user_id']}' and tipo = 'plano_atualizado' order by criado_em desc limit 1")
        p.check(st == 200 and r.get("avisado") and av[0]["titulo"] == "Seu treino foi atualizado", f"dono-personal → só o treino ({r} {av})")
        st, r = B.rpc("w13-personal2", "aluno_avisar_plano", {"p_aluno": m["paciente"], "p_modulos": ["treino"]})
        p.check(st >= 400, f"personal que não é do aluno → recusado ({st} {str(r)[:80]})")
        fila = B.sql_principal(f"select count(*)::int n from {S}.mensagens_whatsapp where created_at > now() - interval '5 minutes'")
        p.check(fila[0]["n"] == 0, f"nenhuma mensagem nova na fila do WhatsApp ({fila[0]['n']})")
    B.sql_principal(f"delete from {S}.avisos where destino_user_id = '{raf['user_id']}' and tipo = 'plano_atualizado'")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--so", choices=["treino", "rls", "aviso"])
    a = ap.parse_args()
    m = B.ler_json(B.SCRATCH / "massa_staging.json")
    assert m.get("paciente"), "rode antes: python3 e2e/w16/massa.py"
    t0 = time.time()
    if a.so in (None, "treino"):
        bloco_treino(m)
    if a.so in (None, "rls"):
        bloco_rls(m)
    if a.so in (None, "aviso"):
        bloco_aviso(m)
    print(f"\nW16 · servidor (staging) · {time.time() - t0:.0f}s")
    sys.exit(p.fim())
