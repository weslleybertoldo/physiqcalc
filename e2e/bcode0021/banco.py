#!/usr/bin/env python3
"""Physiq bcode-0021 (22/11/2026) — o banco dos itens 1, 2, 3a e 7 (os prazos da Política no banco), pela Management API (~/.pc-pat).

Os SQL moram em e2e/bcode0021/sql/ com {schema}, como as migrações: o MESMO texto roda no PGlite
(~/projetos/physiqcalc-scratch/bcode0021/harness_e2e.mjs). Este arquivo só troca o schema, manda e traduz em ✅/❌.

  leitura  SÓ LEITURA ("set transaction read only"), ANTES de aplicar — as lacunas 1 a 6 da especificação: o pg_cron (e os jobs que já
           existem), os endpoints vivos de edge_rate_limits (contagem, a mais velha, as vencidas; ⚠️ os que não são do repo), a FK de
           edge_rate_limits.user_id, o md5 do corpo vivo das 2 exportações contra as constantes das migrações (o de hoje e o novo), a
           versão dos textos (a do banco = a do app desta worktree: o excluir_conta cria contas com ela), as linhas vencidas de cada
           tabela que os itens tocam, as sessões com IP (item 4) e se quem aplica pode pôr os gatilhos.
  provas   DEPOIS de aplicar no schema, por item (--itens): o job em cron.job (nome, horário, comando, ativo), as funções (definer,
           search_path vazio, anon e authenticated não executam, a service_role executa), os gatilhos e os cenários da especificação
           (os cortes, o bloqueio de vez que fica, a troca de e-mail, o soft delete e o delete pelo gatilho em auth.users, o gatilho do
           vínculo no Treino, a exportação só com as linhas da pessoa e [] sem linha), rodando o COMANDO lido de cron.job. Cada item é UM
           bloco que termina SEMPRE em exceção ('R:' + JSON de booleanos): nada fica e o job de verdade nunca vê as linhas (molde:
           desfeito(), e2e/restaurar_login/api.py). Os logins dos cenários são FALSOS (@prova.invalid), criados e apagados dentro do
           bloco. 1 linha por cenário; sai 1 se algum falhar.
  jobs     SÓ LEITURA: as rodadas de cron.job_run_details dos jobs do schema desde --desde (3 no principal, 1 no Treino): todas
           succeeded (✅) ou não (❌; sem rodada = ainda não rodou).
  --seco   em todos: imprime o que rodaria (os arquivos SQL, o banco e o schema), sem rede.
Imprime só contagens, booleanos, datas, nomes de endpoint e de job e md5 — nunca e-mail, IP, id ou texto de erro (do erro, só o
código SQLSTATE). Nenhuma credencial aparece: a Management API vai com o ~/.pc-pat, como o e2e/hml01/banco.py.

Uso:
  python3 e2e/bcode0021/banco.py leitura --banco principal|treino --schema staging|public [--seco]
  python3 e2e/bcode0021/banco.py provas --banco principal|treino --schema staging|public [--itens 1,2,3,7] [--seco]
  python3 e2e/bcode0021/banco.py jobs --schema staging|public --desde 2026-11-23T10:00-03:00 [--banco principal|treino] [--itens …] [--seco]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

sys.dont_write_bytecode = True  # o _comum da w02 não deixa __pycache__ na árvore
AQUI = Path(__file__).resolve().parent
REPO = AQUI.parents[1]  # a worktree onde este arquivo está
PASTA_SQL = AQUI / "sql"
sys.path.insert(0, str(AQUI.parent / "w02"))
from _comum import PRINCIPAL_REF, TREINO_REF, Placar, http, pat  # noqa: E402

REF = {"principal": PRINCIPAL_REF, "treino": TREINO_REF}
ITENS = {"principal": ("1", "2", "3", "7"), "treino": ("1", "7")}
FUSO = ZoneInfo("America/Sao_Paulo")
API = "https://api.supabase.com/v1/projects/{ref}/database/query"
MIGRACAO_7 = {"principal": ("supabase-principal/migrations/20261122150200_exportar_contagens.sql", "wa3"),
              "treino": ("supabase/migrations/20261122150300_exportar_contagens_treino.sql", "w07")}
ERROS = {"42P01": "tabela que não existe", "42883": "função que não existe", "3F000": "schema que não existe",
         "42501": "sem permissão", "23505": "linha repetida", "23503": "chave estrangeira", "23514": "regra (check) da tabela",
         "55P03": "lock_timeout: alguém segurava a linha (rode de novo)", "57014": "tempo esgotado", "25006": "escrita em leitura",
         "P0001": "exceção levantada", "42601": "erro de sintaxe"}

# ───────────────────────── os cenários de cada item (a chave do JSON do bloco → a linha impressa) ─────────────────────────
PROVAS: dict[tuple[str, str], tuple[str, str, list[tuple[str, str]]]] = {
    ("principal", "1"): ("provas_item1_principal.sql", "item 1 · senha errada (login_bloqueios)", [
        ("job", "o job physiq-login-bloqueios-limpeza-{s}: minuto 53, o comando da migração, ativo"),
        ("definer", "login_bloqueios_limpar e login_bloqueios_saiu: SECURITY DEFINER com o search_path vazio"),
        ("privilegios", "anon e authenticated não executam as 2; a service_role executa a limpeza"),
        ("gatilhos", "os 2 gatilhos physiq_login_bloqueios_*_{s} em auth.users, com a função do schema"),
        ("prazo_a", "prazo (a): erros 3, última tentativa há 47 h → sai"),
        ("prazo_b", "prazo (b): erros 3, última tentativa há 45 h → fica"),
        ("prazo_c", "prazo (c): bloqueio de vez há 10 dias → fica"),
        ("prazo_d", "prazo (d): bloqueado até amanhã, última tentativa há 3 dias → fica"),
        ("prazo_e", "prazo (e): erros 0, tentativa em andamento vencida há 3 dias → sai"),
        ("prazo_f", "prazo (f): erros 8, bloqueio de 60 min já vencido, última tentativa há 46,5 h → sai"),
        ("prazo_g", "prazo (g): tentativa em andamento ainda viva, a última há 47 h → fica"),
        ("troca_email", "troca de e-mail no login: sai a linha do e-mail de antes"),
        ("troca_vizinho_fica", "troca de e-mail: a linha do vizinho fica"),
        ("metadados", "update só dos metadados do login: nada sai"),
        ("email_igual", "e-mail regravado igual: nada sai"),
        ("soft_delete", "soft delete (e-mail embaralhado, sem senha, deleted_at): sai, mesmo com bloqueio de vez"),
        ("soft_deleted_at", "soft delete só com o deleted_at: sai"),
        ("delete", "login apagado (delete em auth.users): sai, mesmo com bloqueio de vez"),
        ("maiuscula", "login com maiúscula no e-mail apagado: a linha (minúscula) sai igual"),
        ("sem_conta_fica", "bloqueio de vez de e-mail sem login: fica"),
        ("vizinho_fica", "a linha do vizinho fica até o fim"),
    ]),
    ("principal", "2"): ("provas_item2_principal.sql", "item 2 · códigos do IP", [
        ("job", "o job physiq-limite-ip-limpeza-{s}: minuto 19, o comando da migração, ativo"),
        ("definer", "limite_ip_limpar: SECURITY DEFINER com o search_path vazio"),
        ("privilegios", "anon e authenticated não executam limite_ip_limpar; a service_role executa"),
        ("login_47h", "login parado há 47 h → sai"),
        ("login_45h", "login parado há 45 h → fica"),
        ("publico_23h", "hora pública começada há 23 h → sai"),
        ("publico_21h", "hora pública começada há 21 h → fica"),
        ("publico_hora_atual", "a hora pública corrente → fica"),
    ]),
    ("principal", "3"): ("provas_item3_principal.sql", "item 3a · avisos de erro", [
        ("job", "o job physiq-avisos-erro-limpeza-{s}: minuto 47, o comando da migração, ativo"),
        ("insercao", "as 6 assinaturas sorteadas entraram (nenhuma bateu com uma de verdade)"),
        ("a_31d", "A: o primeiro há 31 d → sai"),
        ("e_29d23h30", "E: há 29 d 23 h 30 min → sai"),
        ("b_ultimo_recente", "B: o primeiro há 40 d, o último aviso há 2 d → fica"),
        ("c_agora", "C: agora → fica"),
        ("d_29d21h", "D: há 29 d 21 h → fica"),
        ("f_29d22h30", "F: há 29 d 22 h 30 min → sai (o corte é 29 d 22 h)"),
        ("h1_31d", "H1: a hora de 31 d → sai"),
        ("h2_29d", "H2: a hora de 29 d → fica"),
    ]),
    ("principal", "7"): ("provas_item7_principal.sql", "item 7 · exportação (login_bloqueios)", [
        ("md5", "o corpo vivo da exportar_dados_aluno = o da migração do item 7"),
        ("definer", "exportar_dados_aluno: SECURITY DEFINER com o search_path vazio"),
        ("privilegios", "anon e authenticated não executam a exportar_dados_aluno; a service_role executa"),
        ("so_a_da_pessoa", "a exportação traz login_bloqueios só com a linha do e-mail do login da pessoa (a de outro e-mail não)"),
        ("erros_dela", "a linha exportada é a dela (erros 2)"),
        ("sem_linha", "login sem linha → login_bloqueios: []"),
        ("sem_login", "id sem login → login_bloqueios: []"),
    ]),
    ("treino", "1"): ("provas_item1_treino.sql", "item 1 · limites (edge_rate_limits)", [
        ("pg_cron", "o pg_cron está no banco do Treino"),
        ("job", "o job physiq-limites-limpeza-{s}: minuto 17, o comando da migração, ativo"),
        ("definer", "physiq_limites_limpar e physiq_limites_vinculo_saiu: SECURITY DEFINER com o search_path vazio"),
        ("privilegios", "anon e authenticated não executam as 2; a service_role executa a limpeza"),
        ("gatilho", "o gatilho physiq_limites_vinculo_{s} em {s}.physiq_identidades, com a função do schema"),
        ("prazo_23h", "a linha de 23 h → sai"),
        ("prazo_21h", "a linha de 21 h → fica"),
        ("prazo_30min", "a linha de 30 min → fica (o teto de 20 por hora da trocar-token segue)"),
        ("vinculo_principal", "o vínculo apagado leva a linha pelo id do principal"),
        ("vinculo_treino_fica", "o vínculo apagado: a linha pelo id do Treino fica (essa sai nas physiq_excluir_*)"),
        ("vinculo_vizinho_fica", "o vínculo apagado: a linha do vizinho fica"),
        ("cascata_vinculo", "o login do Treino apagado: o vínculo sai em cascata"),
        ("cascata_principal", "o login do Treino apagado: o gatilho leva a linha pelo id do principal"),
        ("cascata_vizinho_fica", "o login do Treino apagado: a linha do vizinho fica"),
    ]),
    ("treino", "7"): ("provas_item7_treino.sql", "item 7 · exportação (edge_rate_limits)", [
        ("md5", "o corpo vivo da physiq_exportar_aluno = o da migração do item 7"),
        ("definer", "physiq_exportar_aluno: SECURITY DEFINER com o search_path vazio"),
        ("privilegios", "anon e authenticated não executam a physiq_exportar_aluno; a service_role executa"),
        ("contem_as_2", "a exportação CONTÉM as 2 linhas da pessoa (pelo id do Treino e pelo do principal)"),
        ("nenhuma_de_outro", "a exportação não traz linha de outra pessoa"),
        ("sem_linha", "login sem linha → edge_rate_limits: []"),
        ("sem_vinculo", "login sem vínculo → só a linha pelo id do Treino"),
    ]),
}
# os jobs do caso: (item, nome, horário)
JOBS = {"principal": [("1", "physiq-login-bloqueios-limpeza-{s}", "53 * * * *"), ("2", "physiq-limite-ip-limpeza-{s}", "19 * * * *"),
                      ("3", "physiq-avisos-erro-limpeza-{s}", "47 * * * *")],
        "treino": [("1", "physiq-limites-limpeza-{s}", "17 * * * *")]}
ITENS_COM_JOB = {b: tuple(i for i, _, _ in JOBS[b]) for b in JOBS}  # o item 7 não tem job


# ───────────────────────── o texto do repo (sem rede) ─────────────────────────
def texto_sql(nome: str, schema: str, **extra: str) -> str:
    """O arquivo de e2e/bcode0021/sql/ com {schema} (e os extras) trocados — o mesmo texto que roda no PGlite."""
    t = (PASTA_SQL / nome).read_text(encoding="utf-8").replace("{schema}", schema)
    for k, v in extra.items():
        t = t.replace("{" + k + "}", v)
    return t


def md5_da_migracao(banco: str, schema: str) -> dict[str, str]:
    """As 2 constantes da guarda da migração do item 7 neste schema: o md5 do corpo de hoje (wa3 / w07) e o do corpo novo."""
    arq, _ = MIGRACAO_7[banco]
    txt = (REPO / arq).read_text(encoding="utf-8")
    m = re.search(r"array\['([0-9a-f]{32})',\s*'([0-9a-f]{32})'\]\s*else\s+array\['([0-9a-f]{32})',\s*'([0-9a-f]{32})'\]", txt, re.I)
    if not m:
        raise SystemExit(f"não achei as constantes da guarda em {arq} (a migração do item 7 mudou?)")
    return {"hoje": m.group(1), "novo": m.group(2)} if schema == "staging" else {"hoje": m.group(3), "novo": m.group(4)}


def versao_do_app() -> str:
    txt = (REPO / "src" / "publico" / "legal" / "versao.ts").read_text(encoding="utf-8")
    return re.search(r'VERSAO_TEXTOS\s*=\s*"(\d{4}-\d{2}-\d{2})"', txt).group(1)


def endpoints_do_repo() -> set[str]:
    """Os nomes que as funções do Treino gravam em edge_rate_limits (check_rate_limit), lidos do código."""
    nomes: set[str] = set()
    for f in (REPO / "supabase" / "functions").glob("*/index.ts"):
        t = f.read_text(encoding="utf-8")
        nomes |= set(re.findall(r'requireAdmin\(req,\s*"([a-z0-9-]+)"', t))
        nomes |= set(re.findall(r'p_endpoint:\s*"([a-z0-9-]+)"', t))
        nomes |= set(re.findall(r'checkRateLimit\([^,()]+,\s*"([a-z0-9-]+)"', t))
    return nomes


def hora(v) -> str:
    """Uma data do banco (texto ISO da Management API ou do harness) em dd/mm/aaaa hh:mm de São Paulo; nada → "—"."""
    if v in (None, ""):
        return "—"
    try:
        d = dt.datetime.fromisoformat(str(v).replace(" ", "T"))
        return (d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)).astimezone(FUSO).strftime("%d/%m/%Y %H:%M")
    except ValueError:
        m = re.match(r"\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}", str(v))
        return m.group(0) if m else "?"


def n(v) -> int:
    return int(v or 0)


def sim(v) -> str:
    return "sim" if v is True else ("não" if v is False else "?")


# ───────────────────────── a tradução em ✅/❌ (funções puras: o confere_py.py do rascunho passa os resultados do PGlite por aqui) ──────
def resultado(msg: str) -> dict | None:
    """O JSON que o bloco desfeito devolve na mensagem da exceção ("R:{…}"); None se o bloco parou antes."""
    i = msg.find("R:{")
    if i < 0:
        return None
    try:
        obj, _ = json.JSONDecoder().raw_decode(msg, i + 2)
    except ValueError:
        return None
    return obj if isinstance(obj, dict) else None


def codigo_do_erro(status: int, msg: str) -> str:
    """Do erro, só o SQLSTATE e o que ele quer dizer (o texto do Postgres pode trazer dado: nunca vai à saída)."""
    m = re.search(r"ERROR:\s+([0-9A-Z]{5}):", msg or "") or re.search(r"\b(?=[0-9A-Z]*\d)([0-9A-Z]{5})\b", msg or "")
    if not m:
        return f"HTTP {status}"
    return f"HTTP {status}, SQLSTATE {m.group(1)}" + (f" ({ERROS[m.group(1)]})" if m.group(1) in ERROS else "")


def avaliar_provas(banco: str, item: str, s: str, res: dict | None) -> list[tuple[bool, str]]:
    _, titulo, chaves = PROVAS[(banco, item)]
    pre = f"[{banco}/{s} · {titulo}]"
    if res is None:
        return [(False, f"{pre} o bloco parou antes do fim (sem o resultado R:)")]
    novo = md5_da_migracao(banco, s)["novo"] if item == "7" else None
    saida = []
    for k, texto in chaves:
        v = res.get(k)
        if k == "md5":
            saida.append((v == novo, f"{pre} {texto} — md5 {v or 'sem a função'}"))
        else:
            saida.append((v is True, f"{pre} {texto.format(s=s)}"))
    sobra = sorted(set(res) - {k for k, _ in chaves})
    if sobra:
        saida.append((False, f"{pre} o bloco devolveu chaves sem linha aqui: {', '.join(sobra)}"))
    return saida


def nome_de_endpoint(e) -> str:
    """Só nomes de função (letras, números, - e _): o resto não vai à saída."""
    return e if isinstance(e, str) and re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", e) else "‹nome fora do padrão›"


def linhas_leitura(banco: str, s: str, r: dict, jobs: dict | None) -> list[tuple[bool | None, str]]:
    """(True/False = ✅/❌; None = ℹ️) a leitura de antes de aplicar."""
    pre = f"[{banco}/{s}]"
    out: list[tuple[bool | None, str]] = []
    md5s = md5_da_migracao(banco, s)
    _, de_hoje = MIGRACAO_7[banco]
    funcao = "exportar_dados_aluno" if banco == "principal" else "physiq_exportar_aluno"
    vivo = r.get("md5_exportar")
    if vivo == md5s["hoje"]:
        out.append((True, f"{pre} lacuna 4 · md5 da {funcao} = o da {de_hoje} (hoje): a migração do item 7 aceita ({vivo})"))
    elif vivo == md5s["novo"]:
        out.append((True, f"{pre} lacuna 4 · md5 da {funcao} = o do item 7 (já aplicado) ({vivo})"))
    else:
        out.append((False, f"{pre} lacuna 4 · md5 da {funcao} DIFERENTE (nem {de_hoje} nem o item 7: a migração vai parar; "
                           f"conferir o corpo vivo) ({vivo or 'sem a função'})"))
    if banco == "principal":
        out.append((None, f"{pre} pg_cron instalado: {sim(r.get('tem_pg_cron'))}"))
        app = versao_do_app()
        v = r.get("versao_dos_textos")
        out.append((v == app, f"{pre} versao_dos_textos() = {v}; a do app desta worktree = {app} "
                              + ("(iguais: a massa do excluir_conta entra no app com ela)" if v == app else
                                 "(diferentes: o banco recusa o consentimento da massa — o excluir_conta não cria conta; falta a volta "
                                 "do staging da D8)")))
        out.append((None, f"{pre} item 1 · login_bloqueios: {n(r.get('lb_total'))} linhas; {n(r.get('lb_vencidas'))} vencidas (saem na 1ª "
                          f"limpeza); {n(r.get('lb_de_vez_sem_login'))} de vez sem login vivo (a decisão dele); a mais velha de "
                          f"{hora(r.get('lb_mais_velha'))}"))
        out.append((None, f"{pre} item 2 · login_tentativas_ip: {n(r.get('ip_login_total'))} ({n(r.get('ip_login_vencidas'))} paradas há mais "
                          f"de 46 h, a mais velha de {hora(r.get('ip_login_mais_velha'))}) · publico_pedidos_ip: {n(r.get('ip_publico_total'))} "
                          f"({n(r.get('ip_publico_vencidas'))} com mais de 22 h, a mais velha de {hora(r.get('ip_publico_mais_velha'))})"))
        out.append((None, f"{pre} item 3a · avisos_erro: {n(r.get('avisos_total'))} ({n(r.get('avisos_vencidos'))} com mais de 29 d 22 h, o "
                          f"mais velho de {hora(r.get('avisos_mais_velho'))}) · avisos_erro_hora: {n(r.get('avisos_hora_total'))} "
                          f"({n(r.get('avisos_hora_vencidas'))} vencidas)"))
        out.append((r.get("pode_gatilho_auth_users") is True,
                    f"{pre} lacuna 6 · quem aplica pode pôr gatilho em auth.users: {sim(r.get('pode_gatilho_auth_users'))}"))
    else:
        out.append((None, f"{pre} lacuna 1 · pg_cron instalado: {sim(r.get('tem_pg_cron'))}; disponível para instalar: "
                          f"{sim(r.get('pg_cron_disponivel'))} (a migração do item 1 liga, se faltar; vale para o banco inteiro)"))
        conhecidos = endpoints_do_repo()
        fora = []
        for e in r.get("endpoints") or []:
            nome = nome_de_endpoint(e.get("endpoint"))
            if e.get("endpoint") not in conhecidos:
                fora.append(nome)
            out.append((None, f"{pre} lacuna 2 · edge_rate_limits · {nome}: {n(e.get('n'))} linhas, desde {hora(e.get('desde'))}, "
                              f"{n(e.get('vencidas'))} com mais de 22 h" + ("" if e.get("endpoint") in conhecidos else " ⚠️ não é do repo")))
        out.append((not fora, f"{pre} lacuna 2 · todos os endpoints vivos são do repo (a maior janela do repo é 1 h)"
                              + (f" — fora do repo: {', '.join(fora)} (conferir a janela antes do corte de 22 h)" if fora else "")))
        out.append((None, f"{pre} lacuna 5 · edge_rate_limits: {n(r.get('limites_total'))} linhas, {n(r.get('limites_vencidas'))} com mais de "
                          f"22 h, a mais velha de {hora(r.get('limites_mais_velha'))}"))
        fk = r.get("fk_user_id")
        acao = {"a": "sem ação", "r": "restrict", "c": "com cascata", "n": "set null", "d": "set default"}
        out.append((None, f"{pre} lacuna 3 · edge_rate_limits.user_id: " + ("sem FK (a linha pelo id do Treino de quem o master apaga sai "
                                                                            "só pelo prazo)" if not fk else
                                                                            "FK " + ", ".join(acao.get(x, x) for x in str(fk).split(",")))))
        out.append((r.get("pode_gatilho_identidades") is True and r.get("pode_criar_no_schema") is True,
                    f"{pre} lacuna 6 · quem aplica pode pôr o gatilho em {s}.physiq_identidades: "
                    f"{sim(r.get('pode_gatilho_identidades'))}; criar função em {s}: {sim(r.get('pode_criar_no_schema'))}"))
    out.append((None, f"{pre} item 4 · auth.sessions (o projeto inteiro): {n(r.get('sessoes'))} sessões, {n(r.get('sessoes_com_ip'))} com IP, "
                      f"{n(r.get('sessoes_com_ip_paradas_30d'))} com IP e paradas há 30 dias"
                      + (f", {n(r.get('sessoes_ip_do_worker'))} com o IP do Worker" if "sessoes_ip_do_worker" in r else "")))
    if jobs is not None:
        nossos = {nome.format(s=s) for _, nome, _ in JOBS[banco]}
        lista = [j for j in jobs.get("jobs_do_schema") or [] if isinstance(j, dict)]
        ja = sorted(j["nome"] for j in lista if j.get("nome") in nossos)
        out.append((None, f"{pre} pg_cron: {n(jobs.get('jobs_total'))} jobs no banco; os de -{s}: "
                          + (" · ".join(f"{j.get('nome')} ({j.get('horario')}{'' if j.get('ativo') else ', DESLIGADO'})" for j in lista) or "nenhum")
                          + (f" — já aplicados: {', '.join(ja)}" if ja else "")))
    return out


def avaliar_jobs(banco: str, s: str, linhas: list[dict], itens: tuple[str, ...], desde: str) -> list[tuple[bool, str]]:
    por_nome = {l.get("nome"): l for l in linhas}
    out = []
    for item, nome, horario in JOBS[banco]:
        if item not in itens:
            continue
        nome = nome.format(s=s)
        l = por_nome.get(nome)
        if not l:
            out.append((False, f"[{banco}/{s}] {nome}: não existe no pg_cron (a migração do item {item} não foi aplicada?)"))
            continue
        rod, ok = n(l.get("rodadas")), n(l.get("ok"))
        certo = l.get("ativo") is True and l.get("horario") == horario and rod >= 1 and ok == rod
        estado = "ainda não rodou" if rod == 0 else f"{ok} de {rod} succeeded, a última em {hora(l.get('ultima'))}"
        out.append((certo, f"[{banco}/{s}] {nome} ({l.get('horario')}{'' if l.get('ativo') else ', DESLIGADO'}): desde {desde}, {estado}"))
    return out


# ───────────────────────── o banco (Management API) ─────────────────────────
def mandar(ref: str, sql: str) -> tuple[int, object]:
    st, r, _ = http("POST", API.format(ref=ref), {"query": sql}, {"Authorization": f"Bearer {pat()}"}, timeout=180)
    return st, r


def mensagem(r: object) -> str:
    return str(r.get("message", "")) if isinstance(r, dict) else str(r or "")


class LeituraFalhou(RuntimeError):
    """A mensagem é só o código do erro (nunca o texto do Postgres)."""


def ler(ref: str, sql: str) -> list[dict]:
    """Uma consulta SÓ LEITURA (a transação recusa qualquer escrita)."""
    st, r = mandar(ref, "set transaction read only;\n" + sql)
    if st not in (200, 201) or not isinstance(r, list):
        raise LeituraFalhou(codigo_do_erro(st, mensagem(r)) if st not in (200, 201) else "a resposta não é uma lista de linhas")
    return r


def desfeito(ref: str, sql: str) -> tuple[dict | None, str]:
    """O bloco que termina sempre em exceção: (o JSON do "R:", o código do erro se ele parou antes)."""
    st, r = mandar(ref, sql)
    if st in (200, 201):
        return None, "o bloco terminou sem a exceção (não devia: nada foi desfeito?)"
    res = resultado(mensagem(r))
    return res, ("" if res is not None else codigo_do_erro(st, mensagem(r)))


# ───────────────────────── os comandos ─────────────────────────
def itens_pedidos(texto: str | None, bancos: tuple[str, ...], mapa: dict[str, tuple[str, ...]] = ITENS) -> dict[str, tuple[str, ...]]:
    """--itens (ex.: "1,3a") → os itens de cada banco; sem --itens, todos. Item que não existe em nenhum dos bancos → para."""
    if not texto:
        return {b: mapa[b] for b in bancos}
    pedidos = tuple(dict.fromkeys(x.strip().lower().removesuffix("a") for x in texto.split(",") if x.strip()))
    fora = [x for x in pedidos if not any(x in mapa[b] for b in bancos)]
    if fora:
        raise SystemExit(f"--itens: {', '.join(fora)} não existe em {' nem '.join(bancos)} "
                         f"({'; '.join(f'{b}: ' + ', '.join(mapa[b]) for b in bancos)})")
    return {b: tuple(x for x in pedidos if x in mapa[b]) for b in bancos}


def rotulo(banco: str) -> str:
    return f"{banco} ({REF[banco][:6]}…)"


def cmd_leitura(a: argparse.Namespace) -> int:
    nome = f"leitura_{a.banco}.sql"
    if a.seco:
        texto_sql(nome, a.schema)
        texto_sql("leitura_jobs.sql", a.schema)
        print(f"seco: rodaria SÓ LEITURA no {rotulo(a.banco)}, schema {a.schema}: e2e/bcode0021/sql/{nome}"
              " e, com o pg_cron no banco, e2e/bcode0021/sql/leitura_jobs.sql")
        return 0
    p = Placar()
    try:
        r = (ler(REF[a.banco], texto_sql(nome, a.schema)) or [None])[0]
        if not isinstance(r, dict):
            raise LeituraFalhou("a leitura não devolveu a linha")
        jobs = (ler(REF[a.banco], texto_sql("leitura_jobs.sql", a.schema)) or [None])[0] if r.get("tem_pg_cron") else None
    except LeituraFalhou as e:
        p.check(False, f"[{a.banco}/{a.schema}] a leitura falhou: {e}")
        return p.fim()
    for ok, texto in linhas_leitura(a.banco, a.schema, r, jobs):
        if ok is None:
            print(f"ℹ️  {texto}")
        else:
            p.check(ok, texto)
    return p.fim()


def cmd_provas(a: argparse.Namespace) -> int:
    itens = itens_pedidos(a.itens, (a.banco,))[a.banco]
    if a.seco:
        for item in itens:
            arq, titulo, chaves = PROVAS[(a.banco, item)]
            texto_sql(arq, a.schema)
            print(f"seco: rodaria e2e/bcode0021/sql/{arq} no {rotulo(a.banco)}, schema {a.schema} — {titulo}: {len(chaves)} cenários "
                  "numa transação que termina em exceção (nada fica)")
        return 0
    p = Placar()
    for item in itens:
        arq = PROVAS[(a.banco, item)][0]
        res, erro = desfeito(REF[a.banco], texto_sql(arq, a.schema))
        if erro:
            print(f"   [{a.banco}/{a.schema} item {item}] {erro}")
        for ok, texto in avaliar_provas(a.banco, item, a.schema, res):
            p.check(ok, texto)
    return p.fim()


def cmd_jobs(a: argparse.Namespace) -> int:
    try:
        desde = dt.datetime.fromisoformat(a.desde)
    except ValueError:
        raise SystemExit(f"--desde: data ISO com fuso (ex.: 2026-11-23T10:00-03:00), recebi {a.desde!r}") from None
    if desde.tzinfo is None:
        raise SystemExit("--desde: falta o fuso (ex.: 2026-11-23T10:00-03:00)")
    iso = desde.isoformat()
    bancos = (a.banco,) if a.banco else ("principal", "treino")
    por_banco = {b: i for b, i in itens_pedidos(a.itens, bancos, ITENS_COM_JOB).items() if i}
    if a.seco:
        texto_sql("jobs.sql", a.schema, desde=iso)
        print(f"seco: rodaria SÓ LEITURA e2e/bcode0021/sql/jobs.sql (schema {a.schema}, desde {iso}) no "
              + " e no ".join(f"{rotulo(b)} (itens {', '.join(i)})" for b, i in por_banco.items()))
        return 0
    p = Placar()
    for b, itens in por_banco.items():
        try:
            linhas = ler(REF[b], texto_sql("jobs.sql", a.schema, desde=iso))
        except LeituraFalhou as e:
            p.check(False, f"[{b}/{a.schema}] a leitura do pg_cron falhou: {e}")
            continue
        for ok, texto in avaliar_jobs(b, a.schema, linhas, itens, hora(iso)):
            p.check(ok, texto)
    return p.fim()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="etapa", required=True)
    for nome in ("leitura", "provas", "jobs"):
        sp = sub.add_parser(nome)
        sp.add_argument("--schema", required=True, choices=["staging", "public"])
        sp.add_argument("--banco", required=nome != "jobs", choices=["principal", "treino"],
                        help="jobs: sem ele, os 2 bancos")
        sp.add_argument("--seco", action="store_true", help="só imprime o que rodaria (sem rede)")
        if nome == "provas":
            sp.add_argument("--itens", help="ex.: 1,7 (padrão: todos os do banco — principal 1, 2, 3 e 7; treino 1 e 7)")
        if nome == "jobs":
            sp.add_argument("--itens", help="ex.: 2,3a (padrão: os itens com job — principal 1, 2 e 3; treino 1)")
        if nome == "jobs":
            sp.add_argument("--desde", required=True, help="data ISO com fuso, ex.: 2026-11-23T10:00-03:00")
    a = ap.parse_args()
    return {"leitura": cmd_leitura, "provas": cmd_provas, "jobs": cmd_jobs}[a.etapa](a)


if __name__ == "__main__":
    sys.exit(main())
