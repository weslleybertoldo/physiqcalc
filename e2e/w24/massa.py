#!/usr/bin/env python3
"""Physiq W24 — massa de TESTE no staging (idempotente; SÓ *.teste.claude@physiqnutri.app — P26; e-mail e CPF únicos — W16b).

  (sem opção)  1. a "Clínica Sabor W24" (conta nova em teste): Helena (dona + nutricionista), Sofia (nutricionista), Diego (personal);
                  alunos sem login Ana Clara W24 (da Sofia) e Bruna Costa W24 (da Helena), cada uma com 1 foto no diário;
               2. o diário da "Consultoria Ferreira W13" (o da tela 6): fotos de hoje e de ontem do Rafael, da Marina e da Beatriz
                  (da Camila), mandadas pelo MESMO caminho do /d/ (anônimo: bucket + diario_enviar), 2 de ontem já com reação;
               3. a foto que chegou para a w18-nutri2 quando ela atendia a Beatriz (ela foi REMOVIDA da equipe — não lê mais);
               4. uma receita da Camila ("Bolinho de atum W24", 2 ingredientes da TACO).
  --limpar     apaga TUDO o que a W24 criou no staging (fotos do diário + arquivos, avisos de reação, receita, a conta W24 e os logins w24.*)

Uso: python3 e2e/w24/massa.py [--limpar]
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
TZ = dt.timezone(dt.timedelta(hours=-3))
RECEITA = "Bolinho de atum W24"


def q(sql: str) -> list:
    return B.sql_principal(sql)


def refeicao_pela_hora(h: int) -> str:
    if 5 <= h < 9:
        return "cafe_manha"
    if 9 <= h < 11:
        return "lanche_manha"
    if 11 <= h < 14:
        return "almoco"
    if 14 <= h < 18:
        return "lanche_tarde"
    if 18 <= h < 21:
        return "jantar"
    if 21 <= h < 24:
        return "ceia"
    return "outro"


def garantir_conta() -> str:
    c = B.conta_de("w24-dono", B.NOME_CONTA_W24)
    if not c:
        st, r = B.rpc("w24-dono", "criar_minha_conta", {"p_nome": B.NOME_CONTA_W24, "p_tipo": "nutricionista", "p_registro": "CRN-3 024024"})
        assert st == 200 and isinstance(r, dict) and r.get("ok"), (st, r)
        c = B.conta_de("w24-dono", B.NOME_CONTA_W24)
    assert c
    return c


def membro(conta: str, quem: str, papeis: list[str]) -> None:
    u = B.uid(quem)
    arr = "array[" + ",".join(f"'{x}'" for x in papeis) + "]::text[]"
    if not q(f"select 1 from {S}.conta_membros where conta_id = '{conta}' and user_id = '{u}'"):
        q(f"""insert into {S}.conta_membros (conta_id, user_id, papeis, status, codigo_convite)
              values ('{conta}', '{u}', {arr}, 'ativo', {S}.gerar_codigo_membro({B.q(B.NOMES[quem])}))""")
    q(f"update {S}.conta_membros set status = 'ativo', removido_em = null, papeis = {arr} where conta_id = '{conta}' and user_id = '{u}'")


def aluno(conta: str, nome: str, email: str, nutri: str) -> str:
    r = q(f"select id::text from {S}.pacientes where conta_id = '{conta}' and nome = {B.q(nome)} and deleted_at is null")
    if r:
        pid = r[0]["id"]
        q(f"update {S}.pacientes set nutricionista_id = '{B.uid(nutri)}', ativo = true, config = '{{}}'::jsonb where id = '{pid}'")
        return pid
    return q(f"""insert into {S}.pacientes (nutricionista_id, conta_id, nome, email, origem, ativo)
                 values ('{B.uid(nutri)}', '{conta}', {B.q(nome)}, {B.q(email)}, 'novo', true) returning id::text""")[0]["id"]


def foto_do_link(codigo: str, arquivo: str, quando: dt.datetime, comentario: str) -> str | None:
    """Uma foto pelo caminho do /d/ (anônimo), se o aluno ainda não tem a MESMA foto (o comentário) naquele dia (idempotente)."""
    pid = q(f"select id::text from {S}.pacientes where link_codigo = '{codigo}'")[0]["id"]
    dia = quando.date().isoformat()
    if q(f"""select 1 from {S}.diario_alimentar where paciente_id = '{pid}' and deleted_at is null and comentario = {B.q(comentario)}
              and (data_hora at time zone 'America/Sao_Paulo')::date = '{dia}'"""):
        return None
    st, r, caminho = B.enviar_pelo_link(codigo, B.FOTOS / arquivo, refeicao_pela_hora(quando.hour), comentario, quando.isoformat())
    assert st == 200 and isinstance(r, dict) and r.get("id"), (st, r)
    return r["id"]


def reacao_direta(registro: str, reacao: str, comentario: str) -> None:
    """A reação já gravada da massa (pelo banco; o gatilho cria o aviso no sino só de aluno de TESTE com login)."""
    q(f"""update {S}.diario_alimentar set reacao_nutri = '{reacao}', comentario_nutri = {B.q(comentario)}, reagido_em = now() - interval '20 hours'
          where id = '{registro}'""")


def montar() -> None:
    for k in ("w24-dono", "w24-nutri", "w24-personal"):
        email, s = B.CONTAS[k]
        print(f"principal  {email:46s} {B.B5.garantir_usuario(email, s, B.NOMES[k])}")
    c = garantir_conta()
    for k, tipo in (("w24-dono", "nutricionista"), ("w24-nutri", "nutricionista"), ("w24-personal", "personal")):
        q(f"update {S}.profiles set nome = {B.q(B.NOMES[k])}, tipo_perfil = '{tipo}' where id = '{B.uid(k)}'")
    membro(c, "w24-dono", ["dono", "nutricionista"])
    membro(c, "w24-nutri", ["nutricionista"])
    membro(c, "w24-personal", ["personal"])
    ana = aluno(c, "Ana Clara W24", "w24.ana.teste.claude@physiqnutri.app", "w24-nutri")
    bruna = aluno(c, "Bruna Costa W24", "w24.bruna.teste.claude@physiqnutri.app", "w24-dono")
    agora = dt.datetime.now(TZ).replace(second=0, microsecond=0)
    ontem = (agora - dt.timedelta(days=1)).replace(hour=12, minute=30)
    for pid, arq, txt in ((ana, "almoco.jpg", "Almoço da Ana"), (bruna, "jantar.jpg", "Jantar da Bruna")):
        cod = q(f"select link_codigo from {S}.pacientes where id = '{pid}'")[0]["link_codigo"]
        foto_do_link(cod, arq, ontem, txt)

    # o diário da Consultoria Ferreira W13 (as fotos do "Diário de hoje" da tela 6)
    w13 = B.conta_w13()
    cod = {n: B.paciente(n, w13)["link_codigo"] for n in ("Rafael Moura", "Marina Alves", "Beatriz Lima")}
    hoje_cedo = agora.replace(hour=7, minute=40)
    hoje = [(cod["Rafael Moura"], "cafe.jpg", max(hoje_cedo, agora - dt.timedelta(hours=9)), "Ovos mexidos e pão integral"),
            (cod["Marina Alves"], "almoco.jpg", agora - dt.timedelta(hours=6, minutes=25), "Frango grelhado, arroz integral e salada"),
            (cod["Beatriz Lima"], "lanche.jpg", agora - dt.timedelta(hours=3, minutes=10), "Iogurte com granola")]
    if agora.hour < 10:  # cedo demais para 3 refeições hoje: vão para ontem
        hoje = [(c_, a_, w_ - dt.timedelta(days=1), t_) for c_, a_, w_, t_ in hoje]
    for c_, a_, w_, t_ in hoje:
        foto_do_link(c_, a_, w_, t_)
    j = foto_do_link(cod["Rafael Moura"], "jantar.jpg", (agora - dt.timedelta(days=1)).replace(hour=20, minute=15), "Peixe com legumes")
    m = foto_do_link(cod["Marina Alves"], "maca.jpg", (agora - dt.timedelta(days=1)).replace(hour=10, minute=5), "Maçã antes do treino")
    if j:
        reacao_direta(j, "otimo", "Ótima escolha de proteína!")
    if m:
        reacao_direta(m, "atencao", "Junte uma proteína no lanche.")

    # a foto que chegou para a w18-nutri2 quando ela atendia a Beatriz (ela foi removida da equipe na W18)
    bea = B.paciente("Beatriz Lima", w13)["id"]
    n2 = B.uid(NUTRI2_K)
    if not q(f"select 1 from {S}.diario_alimentar where nutricionista_id = '{n2}' and paciente_id = '{bea}'"):
        caminho = f"{n2}/{bea}/{uuid.uuid4()}.jpg"
        sp = B.service(B.PRINCIPAL_REF)
        assert B.subir_foto(caminho, B.FOTOS / "lanche.jpg", sp) in (200, 201)
        q(f"""insert into {S}.diario_alimentar (nutricionista_id, paciente_id, data_hora, refeicao, path, mime, tamanho, comentario)
              values ('{n2}', '{bea}', now() - interval '2 days', 'lanche_tarde', '{caminho}', 'image/jpeg', {(B.FOTOS / 'lanche.jpg').stat().st_size}, 'Foto da época da nutri anterior')""")
    q(f"update {S}.conta_membros set status = 'removido', removido_em = coalesce(removido_em, now()) where conta_id = '{w13}' and user_id = '{n2}'")

    # uma receita da Camila
    camila = B.uid("w13-nutri")
    if not q(f"select 1 from {S}.receitas where nutricionista_id = '{camila}' and nome = {B.q(RECEITA)} and deleted_at is null"):
        rid = q(f"""insert into {S}.receitas (nutricionista_id, nome, porcoes, tempo_preparo_min, modo_preparo, observacao, favorita)
                    values ('{camila}', {B.q(RECEITA)}, 4, 30, {B.q('## Preparo' + chr(10) + '- Misture o atum com os ovos' + chr(10) + '- Asse por **25 min** a 180 °C')},
                            'Rende bem congelado', true) returning id::text""")[0]["id"]
        for k, (nome, g) in enumerate((("Atum, conserva em óleo", 200), ("Ovo, de galinha, inteiro, cru", 100))):
            a = q(f"select id::text from {S}.alimentos where fonte = 'taco' and nome = {B.q(nome)} and deleted_at is null limit 1")
            if a:
                q(f"insert into {S}.ingredientes_receita (receita_id, alimento_id, quantidade_g, ordem) values ('{rid}', '{a[0]['id']}', {g}, {k})")
    print("conta W24:", c, "· alunos:", {"ana": ana, "bruna": bruna})
    print("diário W13:", q(f"""select p.nome, count(*) n, count(*) filter (where d.reacao_nutri is not null) reagidas from {S}.diario_alimentar d
                              join {S}.pacientes p on p.id = d.paciente_id where p.conta_id = '{w13}' and d.deleted_at is null group by 1 order by 1"""))


NUTRI2_K = B.NUTRI2[0]


def limpar() -> None:
    emails = [B.EMAIL[k] for k in ("w24-dono", "w24-nutri", "w24-personal")]
    lista = ",".join(f"'{e}'" for e in emails)
    ids = [r["id"] for r in q(f"select id::text from auth.users where lower(email) in ({lista})")]
    contas = [r["id"] for r in q(f"select id::text from {S}.contas where nome = {B.q(B.NOME_CONTA_W24)}")]
    w13 = B.conta_de("w13-dono", B.NOME_CONTA)
    alvos = []
    if contas:
        cs0 = ",".join(f"'{c_}'" for c_ in contas)
        alvos += [r["id"] for r in q(f"select id::text from {S}.pacientes where conta_id in ({cs0})")]
    if w13:
        alvos += [r["id"] for r in q(f"select id::text from {S}.pacientes where conta_id = '{w13}' and nome in ('Rafael Moura', 'Marina Alves', 'Beatriz Lima')")]
    if alvos:
        al = ",".join(f"'{a}'" for a in alvos)
        fotos = [r["path"] for r in q(f"select path from {S}.diario_alimentar where paciente_id in ({al})")]
        print("fotos do diário apagadas:", len(fotos), B.apagar_fotos(fotos))
        q(f"delete from {S}.diario_alimentar where paciente_id in ({al})")
        us = [r["user_id"] for r in q(f"select user_id::text from {S}.pacientes where id in ({al}) and user_id is not null")]
        if us:
            us_ = ",".join(f"'{u}'" for u in us)
            q(f"delete from {S}.avisos where tipo = 'reacao_diario' and destino_user_id in ({us_})")
    q(f"delete from {S}.receitas where nome like '%W24%'")
    q(f"delete from {S}.alimentos where fonte = 'proprio' and nome like '%W24%'")
    if contas:
        cs = ",".join(f"'{c_}'" for c_ in contas)
        q(f"delete from {S}.pacientes where conta_id in ({cs})")
        q(f"delete from {S}.conta_eventos where conta_id in ({cs})")
        q(f"delete from {S}.conta_membros where conta_id in ({cs})")
        q(f"delete from {S}.contas where id in ({cs})")
    sp = B.service(B.PRINCIPAL_REF)
    for u in ids:
        st, _, _ = B.http("DELETE", f"{B.PRINCIPAL_URL}/auth/v1/admin/users/{u}", None, {"apikey": sp, "Authorization": f"Bearer {sp}"})
        print("login apagado:", u, st)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    if a.limpar:
        limpar()
    else:
        montar()
    return 0


if __name__ == "__main__":
    sys.exit(main())
