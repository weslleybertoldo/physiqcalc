#!/usr/bin/env python3
"""Physiq W20c — E2E de API do push no celular, só com contas de TESTE e tokens FALSOS (nada chega a aparelho nenhum).

STAGING (--schema staging; Rafael = aluno, Lucas = dono + personal, Camila = nutricionista — a massa da W20):
  registrar   o Rafael grava o token do aparelho (push_registrar, como o app) → 1 linha dele com plataforma e versão; RLS: ele lê
              o seu, o Lucas não; sem login não grava; token inválido é recusado.
  dono        o token é do APARELHO: o Lucas entra no mesmo aparelho → o token passa para ele; o Rafael entra de novo → volta.
  consulta    o Lucas marca uma consulta para o Rafael (REST, como o painel) → o gatilho da W20 cria o aviso "Consulta marcada" →
              o gatilho novo chama a push-enviar pelo pg_net → a função manda ao FCM → o FCM recusa o token falso → o aparelho sai
              da lista; push_envios (gravado pela função) e a resposta ao pg_net mostram o que o FCM respondeu.
  qualquer    aviso de outro tipo ("plano atualizado" — o Salvar e enviar da W16/W17) também vira push.
  repetido    chamar a função de novo com o mesmo aviso não manda outra vez (idempotência).
  verificar   validate_only: a conta de serviço autentica no FCM (nada é entregue).
  negativos   aviso de quem não tem aparelho não chama nada; sem o segredo (ou com outro) a função recusa (401); push_esquecer
              só apaga o token da própria pessoa.
PRODUÇÃO (--schema public): só a conta pessoa.teste.claude: token falso → aviso de teste → o FCM recusa → o token sai; verificar
  (validate_only). No fim apaga o aviso e confere as contagens (avisos, push_*) iguais antes e depois.
Uso: python3 e2e/w20c/api.py --schema staging|public
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

p, q = B.p, B.q


def contagens() -> dict:
    S = B.schema()
    return B.sql_principal(f"""select (select count(*) from {S}.avisos) avisos, (select count(*) from {S}.push_aparelhos) aparelhos,
                                      (select count(*) from {S}.push_envios) envios""")[0]


def registrar(conta: str, token_: str, versao: str = "3.27") -> tuple[int, object]:
    return B.rpc_como(conta, "push_registrar", {"p_token": token_, "p_plataforma": "android", "p_versao": versao})


def conferir_envio(rotulo: str, aviso_id: str, token_: str, desde: str) -> None:
    e = B.esperar_envio(aviso_id, 60)
    p.check(bool(e), f"[{rotulo}] a push-enviar foi chamada pelo gatilho e gravou o envio do aviso {aviso_id[:8]}")
    if not e:
        return
    res = (e.get("resultado") or [{}])[0]
    p.check(e["aparelhos"] == 1 and e["recusados"] == 1 and e["enviados"] == 0,
            f"[{rotulo}] 1 aparelho, o FCM recusou o token falso: aparelhos={e['aparelhos']} recusados={e['recusados']} enviados={e['enviados']}")
    p.check(res.get("codigo") in ("UNREGISTERED", "INVALID_ARGUMENT") and res.get("status") in (400, 404) and res.get("desfecho") == "token_invalido",
            f"[{rotulo}] a resposta do FCM registrada pela função: HTTP {res.get('status')} {res.get('codigo')} ({res.get('mensagem', '')}) → {res.get('desfecho')}")
    p.check(res.get("aparelho") == f"…{token_[-6:]}", f"[{rotulo}] o registro guarda só o fim do token ({res.get('aparelho')})")
    some = B.esperar(lambda: B.aparelho(token_) is None, 20, passo=1)
    p.check(bool(some), f"[{rotulo}] o token recusado SAIU da lista (push_aparelhos)")
    net = B.esperar(lambda: [r for r in B.resposta_pg_net(desde) if aviso_id in (r.get("corpo") or "") or '"recusados":1' in (r.get("corpo") or "")], 20, passo=1)
    p.check(bool(net) and net[-1]["status_code"] == 200, f"[{rotulo}] a função respondeu 200 ao pg_net: {net[-1]['corpo'][:120] if net else '-'}")


def staging() -> None:
    B.ESTADO["schema"] = "staging"
    S = "staging"
    m = B.massa_w20()
    rafael, lucas, camila = B.uid_de("w13-aluno"), m["lucas"], m["camila"]
    antes = contagens()
    print(f"   contagens antes: {antes}", flush=True)

    # ── registrar + RLS ──
    t1 = B.token_falso("api")
    st, r = registrar("w13-aluno", t1)
    p.check(st == 200 and isinstance(r, dict) and r.get("ok") is True, f"[registrar] o Rafael grava o token do aparelho ({st} {r})")
    a = B.aparelho(t1)
    p.check(bool(a) and a["user_id"] == rafael and a["plataforma"] == "android" and a["versao_app"] == "3.27", f"[registrar] 1 linha do Rafael, android, versão 3.27 ({a})")
    st, lido = B.rest_como("w13-aluno", "GET", "push_aparelhos", "select=token&token=eq." + t1, prefer="")
    p.check(st == 200 and isinstance(lido, list) and len(lido) == 1, f"[registrar] RLS: o Rafael lê o próprio aparelho ({st}, {len(lido) if isinstance(lido, list) else lido})")
    st, lido = B.rest_como("w13-dono", "GET", "push_aparelhos", "select=token&token=eq." + t1, prefer="")
    p.check(st == 200 and lido == [], f"[registrar] RLS (negativo): o Lucas NÃO lê o aparelho do Rafael ({st}, {lido})")
    st, r, _ = B.http("POST", f"{B.PRINCIPAL_URL}/rest/v1/rpc/push_registrar", {"p_token": B.token_falso("anon")},
                      {"apikey": B.anon(B.PRINCIPAL_REF), "Content-Profile": S, "Accept-Profile": S})
    p.check(st in (401, 403), f"[registrar] sem login (anon) não grava ({st})")
    st, r = registrar("w13-aluno", "curto demais")
    p.check(st == 200 and isinstance(r, dict) and r.get("erro") == "token_invalido", f"[registrar] token inválido recusado ({r})")
    st, r = B.rest_como("w13-dono", "PATCH", "push_aparelhos", "token=eq." + t1, {"user_id": lucas})
    p.check(B.aparelho(t1)["user_id"] == rafael, f"[registrar] RLS (negativo): o Lucas não muda o aparelho do Rafael pela tabela ({st})")

    # ── o token é do aparelho ──
    registrar("w13-dono", t1)
    p.check(B.aparelho(t1)["user_id"] == lucas, "[dono] o Lucas entrou no mesmo aparelho → o token passou para ele")
    registrar("w13-aluno", t1)
    p.check(B.aparelho(t1)["user_id"] == rafael, "[dono] o Rafael entrou de novo → o token voltou para ele (1 linha só)")
    p.check(len(B.sql_principal(f"select 1 from {S}.push_aparelhos where token = {q(t1)}")) == 1, "[dono] token único (1 linha)")

    # ── consulta marcada pelo profissional → push ──
    B.saude_ok("consulta")
    desde = B.agora_iso()
    dia = B.hoje() + B.B20.dt.timedelta(days=12)
    while dia.weekday() == 6:
        dia += B.B20.dt.timedelta(days=1)
    ini = B.sp(dia, "10:00")
    st, ag = B.rest_como("w13-dono", "POST", "agendamentos", "", {
        "nutricionista_id": lucas, "calendario_id": m["cal_lucas"], "paciente_id": m["alunos"]["Rafael Moura"], "titulo": "Avaliação (W20c push)",
        "inicio": ini, "fim": B.sp(dia, "10:30"), "status": "agendado", "confirmacao": "a_confirmar", "modulo": "treino", "conta_id": m["conta"]})
    ag_id = ag[0]["id"] if st in (200, 201) and isinstance(ag, list) and ag else None
    p.check(bool(ag_id), f"[consulta] o Lucas marcou a consulta do Rafael pela API, como o painel ({st})")
    aviso = B.esperar(lambda: B.sql_principal(f"""select id::text as id, titulo, tipo from {S}.avisos where destino_user_id = {q(rafael)} and criado_em >= {q(desde)}
                                                    and tipo = 'consulta_marcada' order by criado_em desc limit 1"""), 20, passo=1)
    p.check(bool(aviso), f"[consulta] o sino do Rafael: {aviso[0]['titulo'] if aviso else '-'}")
    if aviso:
        conferir_envio("consulta", aviso[0]["id"], t1, desde)
        st, r = B.chamar_funcao({"aviso": aviso[0]["id"]})
        p.check(st == 200 and isinstance(r, dict) and r.get("repetido") is True, f"[repetido] a 2ª chamada com o mesmo aviso não manda de novo ({st} {r})")
        n = B.sql_principal(f"select count(*)::int n from {S}.push_envios where aviso_id = {q(aviso[0]['id'])}")[0]["n"]
        p.check(n == 1, f"[repetido] 1 registro só para o aviso ({n})")

    # ── outro tipo de aviso (o "Salvar e enviar" grava plano_atualizado) ──
    t2 = B.token_falso("plano")
    registrar("w13-aluno", t2)
    desde2 = B.agora_iso()
    av2 = B.sql_principal(f"""insert into {S}.avisos (destino_user_id, tipo, titulo, link) values ({q(rafael)}, 'plano_atualizado',
                               'Seu treino foi atualizado (teste W20c)', '/treino') returning id::text as id""")[0]["id"]
    conferir_envio("qualquer", av2, t2, desde2)

    # ── verificar (validate_only) ──
    st, r = B.chamar_funcao({"verificar": True})
    p.check(st == 200 and isinstance(r, dict) and r.get("autenticado") is True and r.get("projeto") == "physiq-br",
            f"[verificar] validate_only: a conta de serviço autentica no FCM do physiq-br ({r.get('fcm') if isinstance(r, dict) else r})")

    # ── negativos ──
    desde3 = B.agora_iso()
    p.check(not B.aparelhos_de(camila), "[sem_aparelho] a Camila não tem aparelho")
    av3 = B.sql_principal(f"""insert into {S}.avisos (destino_user_id, tipo, titulo, link) values ({q(camila)}, 'geral', 'Aviso sem aparelho (teste W20c)', '/')
                               returning id::text as id""")[0]["id"]
    B.pausa(6)
    p.check(B.envio(av3) is None, "[sem_aparelho] aviso de quem não tem aparelho: nenhum envio")
    fila = B.sql_principal(f"select count(*)::int n from net.http_request_queue where url like '%push-enviar%'")[0]["n"]
    resp = [r for r in B.resposta_pg_net(desde3) if av3 in (r.get("corpo") or "")]
    p.check(fila == 0 and not resp, f"[sem_aparelho] nenhum pedido ao pg_net (fila {fila})")
    st, r = B.chamar_funcao({"verificar": True}, segredo="")
    p.check(st == 401, f"[segredo] sem o segredo: 401 ({st})")
    st, r = B.chamar_funcao({"aviso": av3}, segredo="x" * 64)
    p.check(st == 401, f"[segredo] segredo errado: 401 ({st})")
    t3 = B.token_falso("esquecer")
    registrar("w13-aluno", t3)
    st, r = B.rpc_como("w13-dono", "push_esquecer", {"p_token": t3})
    p.check(B.aparelho(t3) is not None and isinstance(r, dict) and r.get("apagados") == 0, f"[esquecer] o Lucas não apaga o token do Rafael ({r})")
    st, r = B.rpc_como("w13-aluno", "push_esquecer", {"p_token": t3})
    p.check(B.aparelho(t3) is None and isinstance(r, dict) and r.get("apagados") == 1, f"[esquecer] o Rafael apaga o dele ao sair ({r})")

    # ── limpeza: a consulta e os avisos do teste ──
    if ag_id:
        B.sql_principal(f"delete from {S}.agendamentos where id = {q(ag_id)}")
    B.sql_principal(f"delete from {S}.avisos where id in ({q(av2)}, {q(av3)})")
    if aviso:
        B.sql_principal(f"delete from {S}.avisos where id = {q(aviso[0]['id'])}")
    B.sql_principal(f"delete from {S}.push_aparelhos where token like 'e2e-w20c-%'")
    depois = contagens()
    print(f"   contagens depois: {depois}", flush=True)
    p.check(depois["aparelhos"] == antes["aparelhos"] and depois["avisos"] == antes["avisos"], f"[limpeza] contagens iguais (avisos {antes['avisos']}→{depois['avisos']}, aparelhos {antes['aparelhos']}→{depois['aparelhos']})")


def producao() -> None:
    B.ESTADO["schema"] = "public"
    S = "public"
    pessoa = B.uid_de("pessoa")
    antes = contagens()
    print(f"   contagens antes: {antes}", flush=True)
    t1 = B.token_falso("prod")
    st, r = registrar("pessoa", t1)
    p.check(st == 200 and isinstance(r, dict) and r.get("ok") is True, f"[prod] a conta de teste pessoa.teste.claude grava um token FALSO ({st} {r})")
    desde = B.agora_iso()
    av = B.sql_principal(f"""insert into {S}.avisos (destino_user_id, tipo, titulo, link) values ({q(pessoa)}, 'geral',
                              'Teste do push (W20c) — conta de teste', '/') returning id::text as id""")[0]["id"]
    conferir_envio("prod", av, t1, desde)
    st, r = B.chamar_funcao({"verificar": True}, sch="public")
    p.check(st == 200 and isinstance(r, dict) and r.get("autenticado") is True, f"[prod] validate_only: a conta de serviço autentica ({r.get('fcm') if isinstance(r, dict) else r})")
    B.sql_principal(f"delete from {S}.avisos where id = {q(av)}")
    B.sql_principal(f"delete from {S}.push_aparelhos where token like 'e2e-w20c-%'")
    depois = contagens()
    print(f"   contagens depois: {depois}", flush=True)
    p.check(depois == antes, f"[prod] contagens iguais antes e depois ({antes} → {depois})")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schema", choices=["staging", "public"], required=True)
    a = ap.parse_args()
    if a.schema == "staging":
        staging()
    else:
        producao()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
