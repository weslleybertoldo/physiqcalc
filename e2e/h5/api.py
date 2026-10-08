#!/usr/bin/env python3
"""Physiq H5 — E2E de API (banco principal, schema staging) dos ajustes da revisão final que moram no BANCO:

  agenda    N-11 / DN-7 "Sem trava" = qualquer mês: com a janela 'livre', o Rafael (aluno, login de verdade, RLS de verdade) vê horários
            8 meses à frente e reagenda para lá; com 'mes' (negativo) a janela acaba no mês da consulta e o banco recusa a data longe
            (fora_da_janela); 'mes_seguinte' continua até o fim do mês seguinte;
  cadastro  N-57 / DN-6 o /c/ com CPF e apelido: só o nome basta; apelido e CPF gravam no pendente; CPF ou e-mail de aluno que
            existe → ok, sem dizer que já existe (hml-05b, H-18); CPF com dígitos de menos → cpf_invalido; pendente repetido
            pelo CPF → cadastro_repetido; e a função alunos (com o captcha desligado só no envio, no staging) repassa tudo;
  aviso_pix achado 2 do FIM-1b: numa transação DESFEITA (nada fica na fila; o agente do Moto G7 nunca vê), com o Lucas "conectado"
            só ali: o enfileirador ANTIGO mandaria o lembrete do PhysiqNutri com a data/valor velhos (o defeito), o NOVO não manda nada;
            a tarefa diária da W28 manda 1 só, com a data e o valor do plano da conta, e rodar o enfileirador depois não duplica.

Uso: python3 e2e/h5/api.py [--casos agenda,cadastro,aviso_pix]   (só staging; o que cria apaga no fim)
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
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
SQL_DIR = Path.home() / "projetos" / "physiqcalc-scratch" / "h5" / "sql"


def caso(fn):
    CASOS[fn.__name__.replace("caso_", "")] = fn
    return fn


def dia_sp(iso: str) -> dt.date:
    return (dt.datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(dt.timezone(dt.timedelta(hours=-3)))).date()


# ───────────────────────── agenda ─────────────────────────

@caso
def caso_agenda() -> None:
    conta = B.conta_w13()
    raf = B.rafael(conta)
    camila = B.uid("w13-nutri")
    hoje = B.hoje()
    cal = q(f"select id::text from {S}.calendarios where nutricionista_id = '{camila}' and deleted_at is null order by padrao desc, created_at limit 1")[0]["id"]
    antes_cfg = q(f"select to_jsonb(c) j from {S}.agenda_config c where profissional_id = '{camila}'")
    assert not antes_cfg, "a Camila já tem agenda_config no staging — o teste não sabe voltar a ela"
    ini = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
    ags: list[str] = []

    def nova_consulta(dias: int, hhmm: str) -> str:
        d = hoje + dt.timedelta(days=dias)
        a, b = B.sp(d, hhmm), B.sp(d, hhmm)
        b = (dt.datetime.fromisoformat(a) + dt.timedelta(minutes=30)).isoformat()
        r = q(f"""insert into {S}.agendamentos (nutricionista_id, calendario_id, paciente_id, titulo, inicio, fim, modulo, conta_id, status)
                  values ('{camila}', '{cal}', '{raf['id']}', 'Consulta H5 sem trava', '{a}', '{b}', 'nutricao', '{conta}', 'agendado') returning id::text""")
        ags.append(r[0]["id"])
        return r[0]["id"]

    try:
        q(f"""insert into {S}.agenda_config (profissional_id, janela_reagendamento, reagendamentos_max) values ('{camila}', 'livre', 1)""")
        ag = nova_consulta(5, "10:00")
        mes_ref = q(f"select mes_referencia::text m from {S}.agendamentos where id = '{ag}'")[0]["m"]

        st, r = B.rpc_como("w13-aluno", "aluno_agenda_horarios", {"p_agendamento": ag})
        jan = (r or {}).get("janela") if isinstance(r, dict) else None
        p.check(st == 200 and isinstance(r, dict) and r.get("ok") and jan and jan.get("ate") is None,
                f"[agenda] 'livre': a janela não tem fim (ate = null) → {st} {jan}")
        de, ate = hoje + dt.timedelta(days=240), hoje + dt.timedelta(days=270)
        st, r = B.rpc_como("w13-aluno", "aluno_agenda_horarios", {"p_agendamento": ag, "p_de": str(de), "p_ate": str(ate)})
        hs = (r or {}).get("horarios", []) if isinstance(r, dict) else []
        dentro = all(de <= dia_sp(h["inicio"]) <= ate for h in hs)
        p.check(st == 200 and len(hs) > 0 and dentro, f"[agenda] 'livre': horários 8 meses à frente ({de} a {ate}) → {len(hs)} livres, todos no intervalo")
        alvo = hs[0]["inicio"] if hs else None
        st, r = B.rpc_como("w13-aluno", "aluno_agenda_reagendar", {"p_agendamento": ag, "p_inicio": alvo})
        p.check(st == 200 and isinstance(r, dict) and r.get("ok"), f"[agenda] 'livre': o aluno REAGENDA para {alvo} (8 meses à frente) → {st} {r}")
        depois = q(f"select inicio::text, reagendamentos, mes_referencia::text m, status from {S}.agendamentos where id = '{ag}'")[0]
        p.check(dia_sp(depois["inicio"].replace(" ", "T")) == dia_sp(alvo) and depois["reagendamentos"] == 1 and depois["m"] == mes_ref,
                f"[agenda] gravou a data nova, 1 reagendamento e o mês ORIGINAL da consulta ({depois})")

        # negativo: 'mes' — a janela acaba no fim do mês da consulta
        q(f"update {S}.agenda_config set janela_reagendamento = 'mes' where profissional_id = '{camila}'")
        ag2 = nova_consulta(6, "11:00")
        st, r = B.rpc_como("w13-aluno", "aluno_agenda_horarios", {"p_agendamento": ag2})
        jan = (r or {}).get("janela", {}) if isinstance(r, dict) else {}
        fim_mes = (dt.date(int(jan.get("de", "2000-01-01")[:4]), int(jan.get("de", "2000-01-01")[5:7]), 1) + dt.timedelta(days=32)).replace(day=1) - dt.timedelta(days=1) if jan else None
        p.check(st == 200 and jan.get("ate") is not None, f"[agenda] (negativo) 'mes': a janela TEM fim → {jan}")
        st, r = B.rpc_como("w13-aluno", "aluno_agenda_horarios", {"p_agendamento": ag2, "p_de": str(de), "p_ate": str(ate)})
        hs2 = (r or {}).get("horarios", []) if isinstance(r, dict) else []
        p.check(st == 200 and hs2 == [], f"[agenda] (negativo) 'mes': nenhum horário 8 meses à frente → {len(hs2)}")
        st, r = B.rpc_como("w13-aluno", "aluno_agenda_reagendar", {"p_agendamento": ag2, "p_inicio": alvo})
        p.check(isinstance(r, dict) and r.get("erro") == "fora_da_janela", f"[agenda] (negativo) 'mes': reagendar para longe → fora_da_janela ({r})")
        _ = fim_mes

        # 'mes_seguinte' segue como a W20: até o fim do mês seguinte
        q(f"update {S}.agenda_config set janela_reagendamento = 'mes_seguinte' where profissional_id = '{camila}'")
        st, r = B.rpc_como("w13-aluno", "aluno_agenda_horarios", {"p_agendamento": ag2})
        jan = (r or {}).get("janela", {}) if isinstance(r, dict) else {}
        m = q(f"select ((mes_referencia + interval '2 months')::date - 1)::text f from {S}.agendamentos where id = '{ag2}'")[0]["f"]
        p.check(jan.get("ate") == m, f"[agenda] 'mes_seguinte': até o fim do mês seguinte ({jan.get('ate')} = {m})")
    finally:
        if ags:
            q(f"delete from {S}.agendamentos where id in ({', '.join(repr(x) for x in ags)})")
        q(f"delete from {S}.agenda_config where profissional_id = '{camila}'")
        q(f"""delete from {S}.avisos where tipo = 'consulta_marcada' and criado_em >= '{ini}'
                and destino_user_id in ('{raf['user_id']}', '{camila}') and titulo like any (array['%Consulta H5%', '%reagendou%', '%marcou%', '%Consulta marcada%', '%mudou%'])""")
        p.check(not q(f"select 1 from {S}.agenda_config where profissional_id = '{camila}'") and not q(f"select 1 from {S}.agendamentos where titulo = 'Consulta H5 sem trava'"),
                "[agenda] limpo: a agenda da Camila voltou aos padrões e as consultas do teste saíram")


# ───────────────────────── /c/ ─────────────────────────

CPF_EXISTE = "39053344705"
CPF_NOVO = "11144477735"
CPF_NOVO2 = "52998224725"


@caso
def caso_cadastro() -> None:
    conta = B.conta_w13()
    raf = B.rafael(conta)
    cod = q(f"select codigo_convite c from {S}.conta_membros where conta_id = '{conta}' and user_id = '{B.uid('w13-dono')}'")[0]["c"]
    assert q(f"select 1 from {S}.pacientes where normalizar_cpf(cpf) = '{CPF_EXISTE}' and deleted_at is null".replace("normalizar_cpf", f"{S}.normalizar_cpf")), \
        "o aluno com CPF da massa não existe (rode e2e/h5/massa.py)"
    for cpf in (CPF_NOVO, CPF_NOVO2):
        assert not q(f"select 1 from {S}.pacientes where {S}.normalizar_cpf(cpf) = '{cpf}' and deleted_at is null"), f"o CPF {cpf} já é de alguém no staging"
    antes = q(f"select count(*)::int n from {S}.cadastros_pendentes where conta_id = '{conta}'")[0]["n"]

    def enviar(dados: dict) -> dict:
        st, r = B.rpc_servico("cadastro_link_enviar", {"p_codigo": cod, "p_dados": dados})
        return r if isinstance(r, dict) else {"st": st, "bruto": r}

    try:
        r = enviar({"nome": "Nina Só Nome H5"})
        p.check(r.get("ok") is True, f"[/c/] só o NOME basta (como no Nutri; antes pedia e-mail ou telefone) → {r}")
        r = enviar({"nome": "Ivo Apelido H5", "apelido": "  Ivinho  ", "cpf": "111.444.777-35", "telefone": "(82) 98888-0505"})
        linha = q(f"select apelido, cpf, telefone from {S}.cadastros_pendentes where id = '{r.get('id')}'") if r.get("ok") else []
        p.check(r.get("ok") is True and linha and linha[0] == {"apelido": "Ivinho", "cpf": CPF_NOVO, "telefone": "82988880505"},
                f"[/c/] apelido e CPF gravam no pendente (aparados, CPF só dígitos) → {linha}")
        # hml-05b (H-18, 08/10/2026): e-mail/CPF de aluno que já existe NÃO volta mais como cadastro_*_existe — vira pendente como os
        # outros (quem tem o link não fica sabendo quem já é aluno); o aviso vai para o profissional ao aprovar (e2e/hml05b/telas.py)
        r = enviar({"nome": "Otávio de Novo H5", "cpf": "390.533.447-05"})
        p.check(r.get("ok") is True and "campos" not in r, f"[/c/] CPF que já é de um aluno → ok, sem dizer que já existe → {r}")
        r = enviar({"nome": "Rafa de Novo H5", "cpf": CPF_EXISTE, "email": raf["email"]})
        p.check(r.get("ok") is True and "campos" not in r, f"[/c/] e-mail e CPF que já existem → ok, sem dizer que já existem → {r}")
        r = enviar({"nome": "Curto H5", "cpf": "1234567890"})
        p.check(r.get("erro") == "cpf_invalido", f"[/c/] (negativo) CPF com 10 dígitos → cpf_invalido → {r}")
        r = enviar({"nome": "Outro Nome H5", "cpf": CPF_NOVO})
        p.check(r.get("erro") == "cadastro_repetido", f"[/c/] (negativo) o mesmo CPF já pendente para este profissional → cadastro_repetido → {r}")

        # a função alunos (o caminho da tela): repassa apelido e CPF e não diz se o CPF já é de um aluno (H-18)
        B.captcha(False)
        try:
            st, r = B.alunos_publico("cadastro_enviar", {"codigo": cod, "captcha": "", "dados": {"nome": "Edu Pela Função H5", "apelido": "Edu", "cpf": CPF_NOVO2}})
            ok1 = st == 200 and r.get("ok") is True
            st2, r2 = B.alunos_publico("cadastro_enviar", {"codigo": cod, "captcha": "", "dados": {"nome": "Edu CPF Repetido H5", "cpf": CPF_EXISTE}})
        finally:
            B.captcha(True)
        linha = q(f"select apelido, cpf from {S}.cadastros_pendentes where id = '{r.get('id')}'") if ok1 else []
        p.check(ok1 and linha and linha[0] == {"apelido": "Edu", "cpf": CPF_NOVO2}, f"[/c/] pela função alunos: 200 e o pendente com apelido e CPF → {st} {linha}")
        p.check(r2.get("erro") not in ("cadastro_cpf_existe", "cadastro_email_existe") and "campos" not in r2,
                f"[/c/] pela função alunos: CPF de aluno → não diz que já existe (H-18) → {st2} {r2}")
        cap = q(f"select valor->>'captcha' c from {S}.app_config where chave = 'login_limite'")[0]["c"]
        p.check(cap == "true", f"[/c/] o captcha do staging voltou a ligar ({cap})")
    finally:
        q(f"delete from {S}.cadastros_pendentes where conta_id = '{conta}' and nome like '%H5%'")
        depois = q(f"select count(*)::int n from {S}.cadastros_pendentes where conta_id = '{conta}'")[0]["n"]
        p.check(depois == antes, f"[/c/] limpo: pendentes da conta {antes} → {depois}")


# ───────────────────────── aviso de Pix (transação desfeita) ─────────────────────────

def bloco_aviso() -> str:
    antigo = (SQL_DIR / "vivo_staging_whatsapp_enfileirar.sql").read_text(encoding="utf-8")
    assert "assinatura_vencendo" in antigo and "staging.whatsapp_enfileirar()" in antigo, "a definição antiga salva não é a esperada"
    antigo = antigo.replace("staging.whatsapp_enfileirar()", "staging.h5_enfileirar_antigo()")
    lucas, conta = B.uid("w13-dono"), B.conta_w13()
    return f"""
do $h5$
declare
  v_x uuid := '{lucas}';
  v_conta uuid := '{conta}';
  v_hoje date := staging.cobranca_hoje();
  v_res jsonb := '{{}}'::jsonb;
  v_r jsonb;
  v_n int;
begin
  -- travas: só conta de TESTE, nunca uma instância conectada de verdade
  if not exists (select 1 from auth.users u where u.id = v_x and u.email like '%teste.claude@%') then raise exception 'ABORTOU: não é conta de teste'; end if;
  if exists (select 1 from staging.whatsapp_instancias w where w.nutricionista_id = v_x and w.status = 'conectado') then
    raise exception 'ABORTOU: a instância do profissional está conectada de verdade';
  end if;
  -- o enfileirador ANTIGO (o da W22, com o bloco 5.0), só nesta transação, para provar o defeito
  execute $def${antigo}$def$;

  -- o Lucas "conectado" (só aqui), com o WhatsApp dele (fictício) e o horário 00:00; a assinatura antiga do Nutri vencendo em 3 dias
  insert into staging.whatsapp_instancias (nutricionista_id, status, numero_conectado, conectado_em)
  values (v_x, 'conectado', '+5500900000555', now())
  on conflict (nutricionista_id) do update set status = 'conectado', numero_conectado = '+5500900000555', conectado_em = now();
  update staging.profiles set
    config = coalesce(config, '{{}}'::jsonb) || jsonb_build_object('whatsapp', jsonb_build_object('ativo', true, 'horario', '00:00', 'momentos', '{{}}'::jsonb, 'textos', '{{}}'::jsonb)),
    dados_profissionais = coalesce(dados_profissionais, '{{}}'::jsonb) || jsonb_build_object('whatsapp_e164', '+5500900000555'),
    pago_ate = ((v_hoje + 3)::text || ' 12:00')::timestamp at time zone 'America/Sao_Paulo',
    isento_assinatura = false
   where id = v_x;
  -- a conta do Lucas no núcleo, ativa, vencendo em 10 dias (as datas DIVERGEM: o defeito do achado 2)
  update staging.contas set situacao = 'ativa', cobranca_legada = false, teste_ate = null, vence_em = v_hoje + 10 where id = v_conta;
  delete from staging.conta_assinaturas where conta_id = v_conta and status = 'authorized';
  delete from staging.assinaturas where nutricionista_id = v_x and status = 'authorized';

  perform set_config('request.jwt.claims', json_build_object('sub', v_x, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_x::text, true);
  -- 1. ANTES (o enfileirador antigo): o lembrete do PhysiqNutri com a data VELHA (hoje + 3, a do profiles.pago_ate)
  v_r := staging.h5_enfileirar_antigo();
  select jsonb_build_object('n', count(*), 'texto', max(texto)) into v_r from staging.mensagens_whatsapp
   where nutricionista_id = v_x and tipo = 'assinatura_vencendo' and referencia_dia = v_hoje;
  v_res := v_res || jsonb_build_object('antigo', v_r);
  delete from staging.mensagens_whatsapp where nutricionista_id = v_x and tipo = 'assinatura_vencendo';
  -- 2. DEPOIS (o enfileirador novo): nada de assinatura_vencendo
  v_r := staging.whatsapp_enfileirar();
  select count(*) into v_n from staging.mensagens_whatsapp where nutricionista_id = v_x and tipo = 'assinatura_vencendo';
  v_res := v_res || jsonb_build_object('novo_datas_divergem', v_n);
  -- 3. a tarefa diária com o plano vencendo em 10 dias: nada
  perform staging.contas_tarefa_diaria(null, v_conta);
  select count(*) into v_n from staging.mensagens_whatsapp where nutricionista_id = v_x and tipo = 'assinatura_vencendo';
  v_res := v_res || jsonb_build_object('diaria_vence_em_10', v_n);
  -- 4. o plano da conta vencendo em 3 dias: a tarefa diária manda 1, com a data e o valor do plano; o enfileirador depois não duplica
  update staging.contas set vence_em = v_hoje + 3 where id = v_conta;
  v_r := staging.contas_tarefa_diaria(null, v_conta);
  perform staging.whatsapp_enfileirar();
  perform staging.whatsapp_enfileirar();
  select jsonb_build_object('n', count(*), 'texto', max(texto), 'destino', max(destino_e164), 'conta', max(conta_id::text),
                            'valor_plano', (select staging.conta_preco(c.id, c.plano, c.faixa, 1) from staging.contas c where c.id = v_conta),
                            'vence', to_char(v_hoje + 3, 'DD/MM'), 'tarefa', v_r)
    into v_r from staging.mensagens_whatsapp where nutricionista_id = v_x and tipo = 'assinatura_vencendo';
  v_res := v_res || jsonb_build_object('novo', v_r);
  raise exception 'RESULTADO %', v_res;
end
$h5$;"""


@caso
def caso_aviso_pix() -> None:
    hora = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).time()
    antes = q(f"select count(*)::int n from {S}.mensagens_whatsapp")[0]["n"]
    r = B.desfeito(bloco_aviso())
    print("   resultado:", json.dumps(r, ensure_ascii=False)[:900], flush=True)
    ant, novo = r.get("antigo", {}), r.get("novo", {})
    p.check(ant.get("n") == 1 and "PhysiqNutri" in (ant.get("texto") or ""),
            f"[aviso] ANTES (enfileirador antigo): sairia o lembrete do PhysiqNutri pela data velha ({str(ant.get('texto'))[:90]!r})")
    p.check(r.get("novo_datas_divergem") == 0, f"[aviso] DEPOIS: o enfileirador novo não manda o aviso antigo ({r.get('novo_datas_divergem')})")
    p.check(r.get("diaria_vence_em_10") == 0, f"[aviso] o plano vencendo em 10 dias: a tarefa diária não manda nada ({r.get('diaria_vence_em_10')})")
    valor = novo.get("valor_plano")
    reais = f"R$ {float(valor):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") if valor is not None else "?"
    texto = novo.get("texto") or ""
    p.check(novo.get("n") == 1, f"[aviso] o plano vencendo em 3 dias: sai 1 aviso só (a tarefa diária + 2 rodadas do enfileirador) → {novo.get('n')}")
    p.check(f"vence em {novo.get('vence')}" in texto and reais in texto and "Physiq" in texto and "PhysiqNutri" not in texto,
            f"[aviso] o aviso NOVO com a data ({novo.get('vence')}) e o valor ({reais}) do plano da conta: {texto[:120]!r}")
    p.check(novo.get("destino") == "+5500900000555", f"[aviso] o destino é o número fictício da prova ({novo.get('destino')})")
    depois = q(f"select count(*)::int n from {S}.mensagens_whatsapp")[0]["n"]
    inst = q(f"select status from {S}.whatsapp_instancias where nutricionista_id = '{B.uid('w13-dono')}'")
    p.check(depois == antes and all(x["status"] != "conectado" for x in inst),
            f"[aviso] transação DESFEITA: a fila do staging igual ({antes} → {depois}) e o Lucas continua desconectado ({inst})")
    _ = hora


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--casos", default=",".join(CASOS))
    a = ap.parse_args()
    for nome in [x.strip() for x in a.casos.split(",") if x.strip()]:
        print(f"\n── {nome} ──", flush=True)
        B.saude_ok(nome)
        try:
            CASOS[nome]()
        except SystemExit:
            raise
        except Exception as e:  # noqa: BLE001
            p.check(False, f"{nome}: exceção {type(e).__name__}: {str(e)[:400]}")
        time.sleep(2)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
