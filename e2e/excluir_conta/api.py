#!/usr/bin/env python3
"""Physiq — E2E de API do "Excluir minha conta" (agente F, 31/10/2026): os 2 defeitos do E (aluno com 2 matrículas vivas com o
mesmo e-mail; quem já foi membro de equipe pelo caminho do aluno), reproduzidos ANTES (500, o login fica) e passando DEPOIS.

Etapas (uma rodada = um prefixo `f<n>`; as contas são SÓ as temporárias da rodada — _base.py):
  massa    cria a rodada pelos caminhos do app: `prof` (dono + personal, criar_minha_conta) · `aluno2` (aluno do app pela
           entrar_sem_profissional e depois o código do prof pela vincular-aluno → 2 matrículas VIVAS com o mesmo e-mail: a do app
           encerrada + a do prof; troca de token = login e vínculo no Treino) · `vizinho` (aluno do prof, só olha: ninguém mexe nele)
           · `exmembro` (convidado pelo prof — convidar_membro —, entra — pos-login aceita o convite — e é removido — remover_membro)
  caso1    o aluno2: simular 200 → EXCLUI (palavra errada) 400 e nada muda → EXCLUIR: --antes espera o 500 (o defeito) e o login
           que fica; sem --antes espera 200 e confere tudo (login fora, matrículas desligadas e vivas, Treino, os outros iguais)
  caso2    o exmembro: o mesmo, pelo caminho do ALUNO (sem `fluxo`, como o APK antigo e a volta da folha nova)
  repetir  pede de novo com a sessão de antes (401, nada quebra) e confere que o login não entra mais
  limpar   apaga o que sobrou da rodada pelo PRÓPRIO "Excluir minha conta" (vizinho pelo caminho do aluno; prof pelo do profissional)
           e as senhas locais
Uso: python3 e2e/excluir_conta/api.py <etapa> --schema staging|public --rodada f1 [--antes]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

p = B.p
NOMES = {"prof": "Fabio Prof", "aluno2": "Flavia Duas Matriculas", "vizinho": "Felipe Vizinho", "exmembro": "Fernanda Ex Membro"}


def nome(rodada: str, papel: str) -> str:
    return f"{NOMES[papel]} {rodada.upper()}"


def token(rodada: str, papel: str) -> str:
    return B.sessao(rodada, papel)["access_token"]


# ───────────────────────── a massa ─────────────────────────
def conta_do_prof(s: str, uid_prof: str) -> dict:
    return B.um(f"""select c.id::text as id, m.codigo_convite as codigo from {s}.contas c
                      join {s}.conta_membros m on m.conta_id = c.id and m.user_id = c.dono_id
                     where c.dono_id = '{uid_prof}' and c.origem = 'nova' order by c.criado_em limit 1""")


def massa(s: str, r: str) -> dict:
    assert B.saude(s), "a saúde dos bancos não está boa — parei"
    est = B.ler_estado(s, r)
    ids = est.setdefault("ids", {})
    for papel in NOMES:
        ids[papel] = B.criar_login(r, papel, nome(r, papel))
    B.gravar_estado(s, r, est)
    # o prof: a conta (o onboarding do painel)
    tp = token(r, "prof")
    c = conta_do_prof(s, ids["prof"])
    if not c:
        st, res = B.rpc(tp, s, "criar_minha_conta", {"p_nome": f"Consultoria {nome(r, 'prof')}", "p_tipo": "personal", "p_registro": "CREF F-TESTE"})
        p.check(st == 200 and isinstance(res, dict) and res.get("ok"), f"[massa] prof criou a conta ({st} {str(res)[:120]})")
        c = conta_do_prof(s, ids["prof"])
    est["conta"] = c["id"]
    B.gravar_estado(s, r, est)
    # o aluno2: aluno do app → entra na lista do prof pelo código (P7: a do app fica inativa, viva)
    ta = token(r, "aluno2")
    vivas = B.ro(f"select id::text, conta_id::text, ativo from {s}.pacientes where user_id = '{ids['aluno2']}' and deleted_at is null")
    if not vivas:
        st, res = B.rpc(ta, s, "entrar_sem_profissional", {"p_objetivo": "ganhar_massa", "p_plano": "app_treino_alimentacao",
                        "p_nascimento": "1994-03-10", "p_consentimento": versao_textos(), "p_origem": "site"})
        p.check(st == 200 and isinstance(res, dict) and res.get("ok"), f"[massa] aluno2 entrou no app sem profissional ({st} {str(res)[:120]})")
    if not B.ro(f"select 1 from {s}.pacientes where user_id = '{ids['aluno2']}' and conta_id = '{c['id']}' and deleted_at is null"):
        st, res = B.funcao(ta, s, "vincular-aluno", {"codigo": c["codigo"]})
        p.check(st == 200 and res.get("ok"), f"[massa] aluno2 entrou na lista do prof pelo código ({st} {str(res)[:120]})")
    st, res = B.trocar_token(ta, s)
    p.check(st == 200, f"[massa] aluno2: troca de token (login e vínculo no Treino) {st}")
    # o vizinho: aluno do prof (só olha)
    tv = token(r, "vizinho")
    if not B.ro(f"select 1 from {s}.pacientes where user_id = '{ids['vizinho']}' and conta_id = '{c['id']}' and deleted_at is null"):
        st, res = B.funcao(tv, s, "vincular-aluno", {"codigo": c["codigo"]})
        p.check(st == 200 and res.get("ok"), f"[massa] vizinho entrou na lista do prof ({st} {str(res)[:120]})")
    # o exmembro: convidado → entra (pos-login aceita) → removido pelo dono
    m = B.um(f"select id::text, status from {s}.conta_membros where conta_id = '{c['id']}' and user_id = '{ids['exmembro']}'")
    if not m:
        st, res = B.rpc(tp, s, "convidar_membro", {"p_conta": c["id"], "p_email": B.email_de(r, "exmembro"), "p_papeis": ["personal"]})
        p.check(st == 200 and isinstance(res, dict) and res.get("ok"), f"[massa] prof convidou o exmembro ({st} {str(res)[:120]})")
        st, res = B.funcao(token(r, "exmembro"), s, "pos-login", {})
        p.check(st == 200 and res.get("ok"), f"[massa] exmembro entrou: pos-login aceitou o convite ({st} {str(res.get('convites'))[:80]})")
        m = B.um(f"select id::text, status from {s}.conta_membros where conta_id = '{c['id']}' and user_id = '{ids['exmembro']}'")
    if m.get("status") != "removido":
        st, res = B.rpc(tp, s, "remover_membro", {"p_membro": m["id"]})
        p.check(st == 200 and isinstance(res, dict) and res.get("ok"), f"[massa] prof removeu o exmembro da equipe ({st} {str(res)[:120]})")
    for t in (tp, ta, tv):
        B.sair_local(t)
    est["fim_massa"] = estado(s, r)
    B.gravar_estado(s, r, est)
    print(json.dumps(est["fim_massa"], ensure_ascii=False, indent=1, default=str))
    return est


def versao_textos() -> str:
    import re
    txt = (Path(__file__).resolve().parents[2] / "src" / "publico" / "legal" / "versao.ts").read_text(encoding="utf-8")
    return re.search(r'VERSAO_TEXTOS\s*=\s*"(\d{4}-\d{2}-\d{2})"', txt).group(1)


# ───────────────────────── o que conferir (só leitura) ─────────────────────────
def md5(v) -> str:
    return hashlib.md5(json.dumps(v, sort_keys=True, default=str).encode()).hexdigest()[:12]


def estado(s: str, r: str) -> dict:
    """A foto da rodada: o login, as matrículas, a equipe, o perfil e o Treino de cada um — e as impressões digitais de quem NÃO sai."""
    est = B.ler_estado(s, r)
    ids, conta = est.get("ids", {}), est.get("conta")
    out: dict = {}
    for papel, uid in ids.items():
        u = B.um(f"""select id::text, deleted_at is not null as soft, lower(email) = '{B.email_de(r, papel)}' as email_igual,
                            encrypted_password is not null and encrypted_password <> '' as tem_senha
                       from auth.users where id = '{uid}'""")
        out[papel] = {
            "login": ("soft" if u.get("soft") else "vivo") if u else "sumiu",
            "email_igual": u.get("email_igual"), "tem_senha": u.get("tem_senha"),
            "matriculas": B.ro(f"""select id::text, conta_id::text = '{conta}' as do_prof, ativo, deleted_at is not null as lixeira,
                                          coalesce(config, '{{}}'::jsonb) ? 'conta_excluida_em' as marcada, lower(email) = '{B.email_de(r, papel)}' as email
                                     from {s}.pacientes where user_id = '{uid}' or (email ilike '{B.email_de(r, papel)}') order by created_at"""),
            "equipe": B.ro(f"select status, removido_motivo, user_id::text = '{uid}' as ligado from {s}.conta_membros where conta_id = '{conta}' and (user_id = '{uid}' or user_id is null)") if conta else [],
            "perfil": B.um(f"select (email is not null) as tem_email, nome, ativo, coalesce(config, '{{}}'::jsonb) ? 'conta_excluida_em' as marcado from {s}.profiles where id = '{uid}'"),
            "avisos": B.um(f"select count(*)::int as n from {s}.avisos where destino_user_id = '{uid}'").get("n"),
            "treino_vinculo": B.ro_treino(f"select count(*)::int as n from {s}.physiq_identidades where principal_user_id = '{uid}'")[0]["n"],
        }
    if conta:
        out["impressao"] = {
            "conta": md5(B.ro(f"select * from {s}.contas where id = '{conta}'")),
            "equipe_sem_exmembro": md5(B.ro(f"select * from {s}.conta_membros where conta_id = '{conta}' and user_id is distinct from '{ids.get('exmembro')}' order by id")),
            "prof_login": md5(B.ro(f"select id, email, encrypted_password, raw_user_meta_data, raw_app_meta_data, deleted_at from auth.users where id = '{ids.get('prof')}'")),
            "prof_perfil": md5(B.ro(f"select * from {s}.profiles where id = '{ids.get('prof')}'")),
            "vizinho_login": md5(B.ro(f"select id, email, encrypted_password, raw_user_meta_data, deleted_at from auth.users where id = '{ids.get('vizinho')}'")),
            "vizinho_matricula": md5(B.ro(f"select * from {s}.pacientes where user_id = '{ids.get('vizinho')}' order by id")),
            "vizinho_perfil": md5(B.ro(f"select * from {s}.profiles where id = '{ids.get('vizinho')}'")),
            "alunos_do_prof_menos_aluno2": md5(B.ro(f"select id, user_id, nome, email, cpf, ativo, deleted_at from {s}.pacientes where conta_id = '{conta}' and user_id is distinct from '{ids.get('aluno2')}' and lower(coalesce(email,'')) <> '{B.email_de(r, 'aluno2')}' order by id")),
        }
    return out


# ───────────────────────── os casos ─────────────────────────
def caso(s: str, r: str, papel: str, antes: bool) -> int:
    rot = {"aluno2": "caso 1 (2 matrículas vivas, mesmo e-mail)", "exmembro": "caso 2 (ex-membro de equipe, caminho do aluno)"}[papel]
    assert B.saude(s), "a saúde dos bancos não está boa — parei"
    est = B.ler_estado(s, r)
    uid = est["ids"][papel]
    f0 = estado(s, r)
    if f0[papel]["login"] != "vivo":
        print(f"{papel}: o login já não está vivo ({f0[papel]['login']}) — nada a fazer")
        return 1
    sess = B.sessao(r, papel)
    tok = sess["access_token"]
    assert sess["user"]["id"] == uid, "a sessão é de OUTRA pessoa — parei"
    st, sim = B.funcao(tok, s, "excluir-minha-conta", {"simular": True})
    mp = ((sim.get("mantem") or {}).get("principal") or {})
    p.check(st == 200 and sim.get("ok") and sim.get("simulacao"), f"[{rot}] simular → 200 ({st} {str({k: sim.get(k) for k in ('ok', 'erro', 'motivo', 'perfil')})})")
    if papel == "aluno2":
        p.check(mp.get("matriculas") == 2, f"[{rot}] a simulação mostra as 2 matrículas que ficam desligadas ({mp.get('matriculas')})")
    # negativo: sem a palavra certa nada sai
    st_n, neg = B.funcao(tok, s, "excluir-minha-conta", {"confirmacao": "EXCLUI"})
    f1 = estado(s, r)
    p.check(st_n == 400 and neg.get("erro") == "confirmacao_invalida", f"[{rot}] palavra errada (EXCLUI) → 400 confirmacao_invalida ({st_n} {neg.get('erro')})")
    p.check(f1 == f0, f"[{rot}] palavra errada: NADA mudou (a foto é a mesma)")
    t0 = time.time()
    st_e, fim = B.funcao(tok, s, "excluir-minha-conta", {"confirmacao": "EXCLUIR"})
    seg = round(time.time() - t0, 1)
    f2 = estado(s, r)
    resumo = {"status": st_e, "segundos": seg, **{k: fim.get(k) for k in ("ok", "erro", "motivo", "perfil", "play_cancelada")}}
    est.setdefault("excluir", {})[f"{papel}{'_antes' if antes else ''}"] = {"hora": time.strftime("%H:%M:%S"), **resumo, "foto": f2[papel]}
    B.gravar_estado(s, r, est)
    print(json.dumps(resumo, ensure_ascii=False))
    if antes:
        p.check(st_e == 500 and fim.get("erro") == "erro_interno", f"[{rot}] ANTES: EXCLUIR → 500 erro_interno — o defeito REPRODUZIDO ({st_e} em {seg} s)")
        p.check(f2[papel]["login"] == "vivo", f"[{rot}] ANTES: o login FICOU ({f2[papel]['login']})")
        B.sair_local(tok)
    else:
        p.check(st_e == 200 and fim.get("ok") is True, f"[{rot}] EXCLUIR → 200 ok ({st_e} em {seg} s · {str(resumo)[:160]})")
        conferir_depois(s, r, papel, f0, f2, rot)
    p.check(f2["impressao"] == f0["impressao"], f"[{rot}] NENHUM dado de outra pessoa mudou (conta, equipe, prof, vizinho, os outros alunos)")
    if f2["impressao"] != f0["impressao"]:
        print("   diferenças:", {k: (f0["impressao"][k], f2["impressao"][k]) for k in f0["impressao"] if f0["impressao"][k] != f2["impressao"][k]})
    return 0


def conferir_depois(s: str, r: str, papel: str, f0: dict, f2: dict, rot: str) -> None:
    d = f2[papel]
    if papel == "aluno2":
        p.check(d["login"] == "sumiu", f"[{rot}] o login SAIU de vez (hard delete) ({d['login']})")
        vivas = [m for m in d["matriculas"] if not m["lixeira"]]
        p.check(len(vivas) == 2 and all(m["marcada"] and not m["ativo"] and m["email"] for m in vivas),
                f"[{rot}] as 2 matrículas FICAM com o profissional: vivas, desligadas, inativas, marcadas, e-mail mantido ({vivas})")
        p.check(not d["perfil"], f"[{rot}] o perfil saiu junto com o login ({d['perfil']})")
    else:
        p.check(d["login"] == "soft" and not d["email_igual"] and not d["tem_senha"],
                f"[{rot}] o login FECHOU por soft delete (sem senha, e-mail embaralhado) ({d['login']}, e-mail igual {d['email_igual']}, senha {d['tem_senha']})")
        p.check(d["equipe"] == f0[papel]["equipe"], f"[{rot}] a linha de equipe FICA como âncora, igual ({d['equipe']})")
        p.check(d["perfil"] and not d["perfil"]["tem_email"] and d["perfil"]["marcado"], f"[{rot}] o perfil ficou anônimo (sem e-mail, marcado) ({d['perfil']})")
    p.check(d["avisos"] == 0, f"[{rot}] os avisos dele saíram ({d['avisos']})")
    p.check(d["treino_vinculo"] == 0, f"[{rot}] o vínculo do Treino saiu ({d['treino_vinculo']})")


def repetir(s: str, r: str, papel: str) -> int:
    est = B.ler_estado(s, r)
    # a sessão de antes não existe mais: entrar de novo com a senha tem que falhar
    try:
        B.sessao(r, papel)
        entrou = True
    except Exception:  # noqa: BLE001
        entrou = False
    p.check(not entrou, f"[repetir] {papel}: o login não entra mais com a senha")
    print(json.dumps(estado(s, r)[papel], ensure_ascii=False, default=str))
    return 0


# ───────────────────────── a limpeza (pelo próprio "Excluir minha conta") ─────────────────────────
def limpar(s: str, r: str) -> int:
    est = B.ler_estado(s, r)
    ids = est.get("ids", {})
    f = estado(s, r)
    for papel in ("aluno2", "exmembro", "vizinho", "prof"):
        if papel not in ids or f[papel]["login"] != "vivo":
            continue
        tok = token(r, papel)
        corpo_sim, corpo = ({"fluxo": "profissional", "simular": True}, {"fluxo": "profissional", "confirmacao": "EXCLUIR"}) if papel == "prof" \
            else ({"simular": True}, {"confirmacao": "EXCLUIR"})
        st, sim = B.funcao(tok, s, "excluir-minha-conta", corpo_sim)
        p.check(st == 200 and sim.get("ok"), f"[limpar] {papel}: simular {st} {str({k: sim.get(k) for k in ('erro', 'motivo', 'perfil')})}")
        if st != 200:
            B.sair_local(tok)
            continue
        st, fim = B.funcao(tok, s, "excluir-minha-conta", corpo)
        p.check(st == 200 and fim.get("ok"), f"[limpar] {papel}: excluído {st} {str({k: fim.get(k) for k in ('erro', 'motivo', 'perfil')})}")
        time.sleep(1.5)
    f = estado(s, r)
    vivos = [k for k in ids if f[k]["login"] == "vivo"]
    p.check(not vivos, f"[limpar] nenhum login da rodada vivo ({ {k: f[k]['login'] for k in ids} })")
    if not vivos:
        for papel in NOMES:
            B.apagar_senha(r, papel)
    est["fim_limpar"] = f
    B.gravar_estado(s, r, est)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("etapa", choices=["massa", "caso1", "caso2", "repetir1", "repetir2", "foto", "limpar"])
    ap.add_argument("--schema", required=True, choices=["staging", "public"])
    ap.add_argument("--rodada", required=True)
    ap.add_argument("--antes", action="store_true", help="espera o defeito (500, o login fica)")
    a = ap.parse_args()
    s, r = a.schema, a.rodada.lower()
    B.email_de(r, "prof")  # trava do nome da rodada
    if a.etapa == "massa":
        massa(s, r)
    elif a.etapa == "caso1":
        caso(s, r, "aluno2", a.antes)
    elif a.etapa == "caso2":
        caso(s, r, "exmembro", a.antes)
    elif a.etapa == "repetir1":
        repetir(s, r, "aluno2")
    elif a.etapa == "repetir2":
        repetir(s, r, "exmembro")
    elif a.etapa == "foto":
        print(json.dumps(estado(s, r), ensure_ascii=False, indent=1, default=str))
        return 0
    elif a.etapa == "limpar":
        limpar(s, r)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
