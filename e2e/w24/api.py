#!/usr/bin/env python3
"""Physiq W24 — prova pela API (staging, COMO cada pessoa — RLS e Storage de verdade) do Painel › Dietas e do /d/ público.

  A. /d/: a situação do link (diario_link) — ok · diário desligado · envio pelo link desligado · inexistente · inativo · sem nutri — e a
     diario_paciente antiga (site antigo) igual;
  B. o envio pelo link (anônimo: bucket + diario_enviar) → aparece no diario_listar e no diário da nutri; desligado = recusado;
  C. quem LÊ o diário (regra clínica da W18): a nutri responsável lê; o dono-nutri lê os alunos da conta toda (P1); a nutri membro só os
     dela; personal e dono sem papel de nutri leem 0; a nutri REMOVIDA lê 0 (antes da W24 lia — transação desfeita); o aluno, o dele;
  D. as FOTOS (Storage, URL assinada) pela mesma regra;
  E. reagir: quem muda a nutrição do aluno reage; os outros não (0 linhas); a reação vira 1 aviso no sino do aluno com login e mudar a
     reação da MESMA foto em até 10 min não repete; aluno sem login não recebe aviso; o app do aluno (minha_dieta) vê a reação;
  F. excluir (soft + a foto sai): a nutri responsável e o dono-nutri (a foto da pasta de outra nutri também);
  G. alimentos e receitas: a regra de hoje (TACO só leitura; o próprio de quem criou; escrever = nutricionista).
Tudo o que é criado aqui é apagado no fim (as fotos e as reações da massa voltam como estavam). Nenhuma mensagem a pessoa real.
Uso: python3 e2e/w24/api.py   (massa antes: python3 e2e/w24/massa.py)
"""
from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
q = B.sql_principal
TZ = dt.timezone(dt.timedelta(hours=-3))
criados: list[str] = []  # caminhos de fotos novas (apagadas no fim)


def linhas(conta: str, filtro: str) -> list:
    st, r = B.rest(conta, "GET", "diario_alimentar", f"select=id,paciente_id,nutricionista_id,reacao_nutri&deleted_at=is.null&{filtro}")
    assert st == 200, (conta, st, r)
    return r  # type: ignore[return-value]


def reagir(conta: str, registro: str, reacao: str | None, comentario: str = "") -> list:
    corpo = {"reacao_nutri": reacao, "comentario_nutri": comentario, "reagido_em": dt.datetime.now(dt.timezone.utc).isoformat() if reacao else None}
    st, r = B.rest(conta, "PATCH", "diario_alimentar", f"id=eq.{registro}&deleted_at=is.null&select=id", corpo)
    return r if st == 200 and isinstance(r, list) else []


def avisos(user: str) -> list:
    return q(f"select id::text, titulo, link, criado_em from {S}.avisos where destino_user_id = '{user}' and tipo = 'reacao_diario' order by criado_em")


def main() -> int:
    B.saude_ok("a prova da API da W24")
    w13 = B.conta_w13()
    w24 = B.conta_w24()
    raf, mar, bea = (B.paciente(n, w13) for n in ("Rafael Moura", "Marina Alves", "Beatriz Lima"))
    ana, bru = B.paciente("Ana Clara W24", w24), B.paciente("Bruna Costa W24", w24)
    carlos = B.paciente("Carlos Souza", w13)
    assert raf and mar and bea and ana and bru and carlos, "rode e2e/w24/massa.py"
    alunos13 = f"paciente_id=in.({raf['id']},{mar['id']},{bea['id']})"
    estado_antes = q(f"select id::text, reacao_nutri, comentario_nutri, reagido_em from {S}.diario_alimentar where paciente_id in ('{raf['id']}','{mar['id']}','{bea['id']}','{ana['id']}','{bru['id']}')")
    n2 = B.uid(B.NUTRI2[0])
    try:
        # ───────────── A. a situação do link ─────────────
        st, r = B.rpc_anon("diario_link", {"p_codigo": raf["link_codigo"].upper()})
        p.check(st == 200 and isinstance(r, dict) and r.get("situacao") == "ok" and r.get("paciente_id") == raf["id"] and r.get("nutricionista_id") == raf["nutricionista_id"],
                f"A1 /d/ do Rafael (código em MAIÚSCULAS): ok, com as pastas do envio e o primeiro nome ({r})")
        p.check(set(r.keys()) == {"situacao", "paciente_id", "nutricionista_id", "nome"}, "A1 sem dado a mais (só a situação, as 2 pastas e o primeiro nome)")
        st, r = B.rpc_anon("diario_paciente", {"p_codigo": raf["link_codigo"]})
        p.check(st == 200 and isinstance(r, dict) and r.get("paciente_id") == raf["id"], "A2 a diario_paciente do site antigo continua igual (o /d/ de lá)")
        q(f"update {S}.pacientes set config = config || '{{\"diario_alimentar\": false}}'::jsonb where id = '{ana['id']}'")
        st, r = B.rpc_anon("diario_link", {"p_codigo": ana["link_codigo"]})
        p.check(r == {"situacao": "diario_desligado"}, f"A3 diário desligado pelo profissional → 'diario_desligado' sem nome nem pasta ({r})")
        st2, r2, cam = B.enviar_pelo_link(ana["link_codigo"], B.FOTOS / "almoco.jpg", "almoco", "não pode")
        p.check(st2 == 200 and r2 == {"situacao": "diario_desligado"} and not cam, "A3 e o envio nem começa (o /d/ recusa antes de subir)")
        q(f"update {S}.pacientes set config = config || '{{\"diario_alimentar\": true, \"acesso_link\": false}}'::jsonb where id = '{ana['id']}'")
        st, r = B.rpc_anon("diario_link", {"p_codigo": ana["link_codigo"]})
        p.check(r == {"situacao": "link_desligado"}, f"A4 envio pelo link desligado → 'link_desligado' ({r})")
        # mesmo forçando (subir direto na pasta): a política do Storage recusa o anônimo
        stu = B.subir_foto(f"{ana['nutricionista_id']}/{ana['id']}/00000000-0000-4000-8000-00000000a124.jpg", B.FOTOS / "almoco.jpg")
        p.check(stu in (400, 401, 403), f"A4 subir direto na pasta com o link desligado → recusado pelo Storage ({stu})")
        q(f"update {S}.pacientes set config = config - 'acesso_link' - 'diario_alimentar' where id = '{ana['id']}'")
        st, r = B.rpc_anon("diario_link", {"p_codigo": "naoexiste99"})
        p.check(r == {"situacao": "invalido"}, "A5 código inexistente → 'invalido'")
        st, r = B.rpc_anon("diario_link", {"p_codigo": "x'; drop table pacientes; --"})
        p.check(r == {"situacao": "invalido"}, "A5 código com lixo → 'invalido' (nada quebra)")
        q(f"update {S}.pacientes set ativo = false where id = '{bru['id']}'")
        st, r = B.rpc_anon("diario_link", {"p_codigo": bru["link_codigo"]})
        p.check(r == {"situacao": "invalido"}, f"A6 aluno inativo → 'invalido' ({r})")
        q(f"update {S}.pacientes set ativo = true where id = '{bru['id']}'")
        st, r = B.rpc_anon("diario_link", {"p_codigo": carlos["link_codigo"]})
        p.check(r == {"situacao": "sem_nutricionista"}, f"A7 aluno só de treino (sem nutri) → 'sem_nutricionista' ({r})")

        # ───────────── B. o envio pelo link (anônimo) ─────────────
        agora = dt.datetime.now(TZ).replace(microsecond=0)
        st, r, cam_b = B.enviar_pelo_link(raf["link_codigo"], B.FOTOS / "maca.jpg", "lanche_tarde", "Foto pela API W24", (agora - dt.timedelta(minutes=2)).isoformat())
        criados.append(cam_b)
        novo = r.get("id") if isinstance(r, dict) else None
        p.check(st == 200 and bool(novo), f"B1 anônimo pelo /d/: sobe a foto na pasta da nutri e grava pela diario_enviar ({st})")
        st, lista = B.rpc_anon("diario_listar", {"p_codigo": raf["link_codigo"]})
        p.check(st == 200 and any(x["id"] == novo and "path" not in x for x in lista), "B2 a foto nova aparece nos 'últimos 7 dias' do link (sem o caminho da foto)")
        p.check(any(x["id"] == novo for x in linhas("w13-nutri", alunos13)), "B3 e no diário da nutri responsável (Camila)")

        # ───────────── C. quem lê ─────────────
        todos13 = q(f"select count(*)::int n from {S}.diario_alimentar where deleted_at is null and paciente_id in ('{raf['id']}','{mar['id']}','{bea['id']}')")[0]["n"]
        p.check(len(linhas("w13-nutri", alunos13)) == todos13, f"C1 a nutri responsável lê as {todos13} fotos dos alunos dela (inclusive a que chegou para a nutri anterior)")
        p.check(len(linhas("w13-dono", alunos13)) == 0, "C2 o dono SEM papel de nutricionista (Lucas, dono + personal) lê 0")
        p.check(len(linhas("w13-personal2", alunos13)) == 0, "C3 o personal (Bruno) lê 0")
        p.check(len(linhas(B.NUTRI2[0], f"nutricionista_id=eq.{n2}")) == 0, "C4 a nutri REMOVIDA da equipe (w18-nutri2) lê 0 do que recebeu")
        sim = B.desfeito(f"""do $s$ declare c_antes int; c_depois int; begin
            perform set_config('request.jwt.claims', json_build_object('sub', '{n2}', 'role', 'authenticated')::text, true);
            perform set_config('request.jwt.claim.sub', '{n2}', true);
            execute 'set local role authenticated';
            select count(*) into c_depois from {S}.diario_alimentar where nutricionista_id = '{n2}';
            execute 'reset role';
            drop policy "diario_alimentar: W24 leitura so quem ve o clinico" on {S}.diario_alimentar;
            execute 'set local role authenticated';
            select count(*) into c_antes from {S}.diario_alimentar where nutricionista_id = '{n2}';
            execute 'reset role';
            raise exception 'RESULTADO %', jsonb_build_object('antes', c_antes, 'depois', c_depois); end $s$;""")
        p.check(sim == {"antes": 1, "depois": 0}, f"C4 (transação desfeita) sem a restritiva da W24 ela lia 1; com ela, 0 ({sim})")
        do_raf = q(f"select count(*)::int n from {S}.diario_alimentar where deleted_at is null and paciente_id = '{raf['id']}'")[0]["n"]
        lidas = linhas("w13-aluno", alunos13)
        p.check(len(lidas) == do_raf and all(x["paciente_id"] == raf["id"] for x in lidas), f"C5 o aluno (Rafael) lê só as {do_raf} dele")
        p.check(len(linhas("w24-dono", f"paciente_id=in.({ana['id']},{bru['id']})")) == 2, "C6 o DONO-NUTRI (Helena) lê os alunos da conta toda: a da Sofia e a dela (P1)")
        so = linhas("w24-nutri", f"paciente_id=in.({ana['id']},{bru['id']})")
        p.check(len(so) == 1 and so[0]["paciente_id"] == ana["id"], "C7 a nutri MEMBRO (Sofia) lê só a aluna dela")
        p.check(len(linhas("w24-personal", f"paciente_id=in.({ana['id']},{bru['id']})")) == 0, "C8 o personal da conta (Diego) lê 0")
        p.check(len(linhas("w24-dono", alunos13)) == 0 and len(linhas("w13-nutri", f"paciente_id=in.({ana['id']},{bru['id']})")) == 0,
                "C9 de uma conta para a outra: ninguém lê (Helena não lê a W13; Camila não lê a W24)")

        # ───────────── D. as fotos ─────────────
        foto = lambda pid: q(f"select path from {S}.diario_alimentar where paciente_id = '{pid}' and deleted_at is null order by data_hora desc limit 1")[0]["path"]  # noqa: E731
        foto_n2 = q(f"select path from {S}.diario_alimentar where nutricionista_id = '{n2}' limit 1")[0]["path"]
        p.check(B.assinar("w13-nutri", foto_n2) == 200, "D1 a nutri responsável abre a foto que chegou para a nutri anterior (pasta de outra nutri)")
        p.check(B.assinar(B.NUTRI2[0], foto_n2) != 200, "D2 a nutri REMOVIDA não abre mais a foto da própria pasta")
        p.check(B.assinar("w13-dono", foto(raf["id"])) != 200 and B.assinar("w13-personal2", foto(raf["id"])) != 200, "D3 dono sem papel de nutri e personal não abrem a foto")
        p.check(B.assinar("w24-dono", foto(ana["id"])) == 200, "D4 o dono-nutri abre a foto da aluna da Sofia")
        p.check(B.assinar("w24-nutri", foto(bru["id"])) != 200, "D5 a Sofia não abre a foto da aluna da Helena")
        p.check(B.assinar("w13-aluno", foto(raf["id"])) == 200 and B.assinar("w13-aluno", foto(mar["id"])) != 200, "D6 o aluno abre a foto dele (P29) e não a de outro aluno")

        # ───────────── E. reagir e o aviso ─────────────
        hoje = q(f"select id::text from {S}.diario_alimentar where paciente_id = '{raf['id']}' and deleted_at is null and id <> '{novo}' order by data_hora desc limit 1")[0]["id"]
        u_raf = raf["user_id"]
        a0 = avisos(u_raf)
        p.check(len(reagir("w13-dono", hoje, "otimo")) == 0 and len(reagir("w13-personal2", hoje, "otimo")) == 0, "E1 dono sem nutri e personal NÃO reagem (0 linhas)")
        p.check(len(reagir("w13-nutri", hoje, "otimo", "Ótima escolha W24")) == 1, "E2 a nutri responsável reage (Ótimo + comentário)")
        a1 = avisos(u_raf)
        novos = [a for a in a1 if a["id"] not in {x["id"] for x in a0}]
        p.check(len(novos) == 1 and novos[0]["link"] == f"/dieta?ver=diario&registro={hoje}" and novos[0]["titulo"].startswith("Camila reagiu à foto ")
                and novos[0]["titulo"].endswith(": Ótimo — Ótima escolha W24"), f"E3 1 aviso no sino do aluno, com o link da foto ({novos[0]['titulo'] if novos else None})")
        p.check(len(reagir("w13-nutri", hoje, "bom", "Mudei de ideia W24")) == 1 and len(avisos(u_raf)) == len(a1), "E4 mudar a reação da MESMA foto em até 10 min não repete o aviso")
        p.check(len(reagir("w13-nutri", novo, "atencao", "Cuidado W24")) == 1 and len(avisos(u_raf)) == len(a1) + 1, "E5 reagir a OUTRA foto = outro aviso (1 por reação)")
        st, d = B.rpc("w13-aluno", "minha_dieta", {"p_dia": dt.datetime.now(TZ).date().isoformat()})
        reg = next((x for x in (d.get("diario") or []) if x.get("id") == hoje), None) if isinstance(d, dict) else None
        p.check(st == 200 and reg is not None and reg.get("reacao_nutri") == "bom" and reg.get("comentario_nutri") == "Mudei de ideia W24", "E6 o app do aluno (minha_dieta) vê a reação nova")
        n_av_antes = q(f"select count(*)::int n from {S}.avisos where tipo = 'reacao_diario'")[0]["n"]
        ok_bea = len(reagir("w13-nutri", q(f"select id::text from {S}.diario_alimentar where nutricionista_id = '{n2}' limit 1")[0]["id"], "bom")) == 1
        n_av_depois = q(f"select count(*)::int n from {S}.avisos where tipo = 'reacao_diario'")[0]["n"]
        p.check(ok_bea and n_av_depois == n_av_antes, f"E7 aluna SEM login (Beatriz): a reação grava e nenhum aviso nasce ({n_av_antes} → {n_av_depois})")
        p.check(len(reagir("w24-nutri", q(f"select id::text from {S}.diario_alimentar where paciente_id = '{bru['id']}' limit 1")[0]["id"], "otimo")) == 0,
                "E8 a nutri membro NÃO reage à aluna de outra nutri (0 linhas)")
        p.check(len(reagir("w24-dono", q(f"select id::text from {S}.diario_alimentar where paciente_id = '{ana['id']}' limit 1")[0]["id"], "bom", "Boa W24")) == 1,
                "E9 o dono-nutri reage à aluna da Sofia")
        p.check(len(reagir(B.NUTRI2[0], q(f"select id::text from {S}.diario_alimentar where nutricionista_id = '{n2}' limit 1")[0]["id"], "evitar")) == 0,
                "E10 a nutri removida não reage mais")

        # ───────────── F. excluir (soft + a foto sai) ─────────────
        st, r, cam_f = B.enviar_pelo_link(ana["link_codigo"], B.FOTOS / "cafe.jpg", "cafe_manha", "Para excluir W24", (agora - dt.timedelta(minutes=1)).isoformat())
        criados.append(cam_f)
        fid = r.get("id") if isinstance(r, dict) else None
        st, rr = B.rest("w24-dono", "PATCH", "diario_alimentar", f"id=eq.{fid}&deleted_at=is.null&select=id", {"deleted_at": dt.datetime.now(dt.timezone.utc).isoformat()})
        tok = B.sessao("w24-dono")["access_token"]
        bucket = B.bucket_do_ambiente("diario")
        sp_, rm, _ = B.http("DELETE", f"{B.PRINCIPAL_URL}/storage/v1/object/{bucket}", {"prefixes": [cam_f]}, {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {tok}"})
        sobrou = q(f"select count(*)::int n from storage.objects where bucket_id = '{bucket}' and name = '{cam_f}'")[0]["n"]
        p.check(st == 200 and len(rr) == 1 and sp_ == 200 and sobrou == 0, f"F1 o dono-nutri exclui a foto da aluna da Sofia: linha na Lixeira e o arquivo (pasta da Sofia) sai ({st}/{sp_}/{sobrou})")
        st, rr = B.rest("w24-nutri", "PATCH", "diario_alimentar", f"id=eq.{q(f'select id::text from {S}.diario_alimentar where paciente_id = ' + chr(39) + bru['id'] + chr(39) + ' limit 1')[0]['id']}&select=id",
                        {"deleted_at": dt.datetime.now(dt.timezone.utc).isoformat()})
        p.check(st == 200 and rr == [], "F2 a Sofia não exclui a foto da aluna da Helena (0 linhas)")

        # ───────────── G. alimentos e receitas (a regra de hoje) ─────────────
        st, a = B.rest("w13-nutri", "POST", "alimentos", "select=id", {"nome": f"Alimento API W24 {B.carimbo()}", "fonte": "proprio", "nutricionista_id": B.uid("w13-nutri"),
                                                                        "porcao_g": 26, "energia_kcal": 488.46})
        aid = a[0]["id"] if st == 201 else None
        p.check(st == 201, f"G1 a nutricionista cadastra alimento próprio ({st})")
        st, r = B.rest("w13-dono", "POST", "alimentos", "select=id", {"nome": "Do dono W24", "fonte": "proprio", "nutricionista_id": B.uid("w13-dono"), "porcao_g": 100})
        p.check(st in (401, 403), f"G2 o dono SEM papel de nutri não cadastra (restritiva da W3) ({st})")
        taco = q(f"select id::text from {S}.alimentos where fonte = 'taco' limit 1")[0]["id"]
        st, r = B.rest("w13-nutri", "PATCH", "alimentos", f"id=eq.{taco}&select=id", {"nome": "mexi W24"})
        p.check(r == [], "G3 a TACO é só leitura (0 linhas)")
        st, r = B.rest("w24-nutri", "GET", "alimentos", f"id=eq.{aid}&select=id")
        p.check(r == [], "G4 o alimento próprio da Camila não aparece para a nutri de outra conta")
        st, r = B.rest("w24-nutri", "GET", "receitas", "select=id,nome&nome=like.*W24*")
        p.check(r == [], "G5 a receita da Camila não aparece para a nutri de outra conta")
        if aid:
            q(f"delete from {S}.alimentos where id = '{aid}'")
    finally:
        # as reações e o estado da massa voltam como estavam; as fotos novas saem
        for e in estado_antes:
            q(f"""update {S}.diario_alimentar set reacao_nutri = {B.q(e['reacao_nutri'])}, comentario_nutri = {B.q(e['comentario_nutri'])},
                     reagido_em = {B.q(e['reagido_em'])}, deleted_at = null where id = '{e['id']}'""")
        cams = [c for c in criados if c]
        if cams:
            lst = ",".join(f"'{c}'" for c in cams)
            q(f"delete from {S}.diario_alimentar where path in ({lst})")
            B.apagar_fotos(cams)
        q(f"update {S}.pacientes set config = config - 'acesso_link' - 'diario_alimentar', ativo = true where id in ('{ana['id']}', '{bru['id']}')")
        q(f"delete from {S}.avisos where tipo = 'reacao_diario' and titulo like '%W24%'")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
