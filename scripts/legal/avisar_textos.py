#!/usr/bin/env python3
"""hml-12 (H-30) — o e-mail do aviso dos textos legais: avisa os logins REAIS que ainda não aceitaram a versão vigente dos Termos de
Uso e da Política de Privacidade que o próximo acesso vai pedir o aceite (o formato do Nativo OS, decisão do dono de 06/10/2026:
versão nova → todos aceitam no próximo acesso → e-mail). Molde: scripts/avisar-termos.ts do Nativo OS.

  python3 scripts/legal/avisar_textos.py prod          SÓ SIMULA (o padrão): conta, por SQL só leitura, quem receberia — só números
  python3 scripts/legal/avisar_textos.py staging       idem no staging (lá o envio é recusado: as contas de teste não têm caixa)
  python3 scripts/legal/avisar_textos.py prod --enviar --cofre-item "<nome ou id do item do Resend no cofre>" [--cofre-projeto …]
  … --previo           o aviso 30 dias ANTES de uma versão nova (P2): a versão de antes ainda vale no banco e ninguém aceitou a
                       nova — todos os logins reais recebem; o texto diz a data de início (docs/textos-legais.md › processo 8)

Quem conta: os logins do Auth (o mesmo para os 2 schemas) que não foram excluídos e que
  - não são de teste (teste@teste.com e *teste*@physiqcalc.app / *teste*@physiqnutri.app, a regra de src/nucleo/contasTeste.ts);
  - não estão nos domínios de teste physiqcalc.app e physiqnutri.app (não existem: o e-mail voltaria — ex.: as contas da Play);
  - têm o e-mail confirmado e não estão bloqueados no login;
  - e não têm o aceite dos textos (aceites: documento 'textos', evento 'aceitou') da versão do app (VERSAO_TEXTOS de
    src/publico/legal/versao.ts) no schema do alvo.
Rodar de novo manda de novo para quem ainda não aceitou.

O --enviar só sai com as 5 travas:
  (1) só na produção;
  (2) a versão vigente do banco (app_config 'textos_legais') ligada e igual à do app — o e-mail sai DEPOIS do update da virada
      (docs/textos-legais.md › A virada); com --previo, ao contrário, a do banco ainda é a de antes (menor que a do app);
  (3) o texto de scripts/legal/aviso_textos.md com "aprovado: sim" no topo (o dono aprova antes, P11);
  (4) a confirmação digitada no terminal na hora ("ENVIAR <n>");
  (5) a chave do Resend lida do cofre (B Code Segredos, pelo MCP local) na hora, só em memória — nunca em arquivo, nunca na saída.
Envio pela API do Resend, 1 por vez (o plano grátis aceita 2 pedidos por segundo e 100 e-mails por dia somando tudo), com resposta
para o contato.

Banco pela Management API (SUPABASE_PAT no ambiente, ou ~/.pc-pat, como os outros scripts), numa transação SÓ LEITURA. A saída traz
só números: nenhum e-mail, nome ou id (o motivo de uma falha do Resend sai com os endereços trocados por [e-mail]).
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
TEXTO = Path(__file__).with_name("aviso_textos.md")
PRINCIPAL_REF = os.environ.get("PRINCIPAL_REF", "hkxvtsbwctxkrqzkkdoz")
ALVOS = {"staging": ("staging", "https://physiqcalc-staging.vercel.app"), "prod": ("public", "https://physiqcalc.com.br")}
REMETENTE_PADRAO = "Physiq <convites@physiqcalc.com.br>"  # o remetente dos e-mails do Physiq (domínio verificado no Resend)
LIMITE_DIARIO = 100  # Resend grátis: 100 e-mails por dia, somando tudo
PAUSA_S = 0.6  # a API do Resend aceita 2 pedidos por segundo
UA = "physiq-avisar-textos/1.0 (hml-12)"
COFRE_NODE = Path(os.environ.get("COFRE_NODE", Path.home() / ".local" / "node" / "bin" / "node"))
COFRE_MCP = Path(os.environ.get("COFRE_MCP", Path.home() / "projetos" / "b-code-segredos" / "mcp" / "dist" / "index.mjs"))
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def constante(arquivo: str, nome: str) -> str:
    """O valor de `export const NOME = "…";` num arquivo do app (a fonte é o código, não uma cópia aqui)."""
    m = re.search(rf'export const {nome}\s*=\s*"([^"]+)"', (REPO / arquivo).read_text(encoding="utf-8"))
    if not m:
        raise SystemExit(f"{nome} não achada em {arquivo}")
    return m.group(1)


VERSAO_TEXTOS = constante("src/publico/legal/versao.ts", "VERSAO_TEXTOS")
DATA_DOS_TEXTOS = constante("src/publico/legal/versao.ts", "DATA_DOS_TEXTOS")
CONTATO = constante("src/nucleo/suporte.ts", "CONTATO_SUPORTE")


# ───────────────────────── banco (só leitura) ─────────────────────────
def pat() -> str:
    valor = os.environ.get("SUPABASE_PAT") or Path.home().joinpath(".pc-pat").read_text(encoding="utf-8")
    return valor.strip()


def ler(sql: str) -> list[dict]:
    """Uma consulta numa transação SÓ LEITURA pela Management API (qualquer escrita dá erro no próprio Postgres)."""
    if re.search(r"(?i)\b(insert|update|delete|alter|drop|create|grant|revoke|truncate|copy|call)\b", re.sub(r"'(?:[^']|'')*'", "''", sql)):
        raise SystemExit("trava: palavra de escrita na consulta")
    corpo = json.dumps({"query": "set transaction read only;\n" + sql}).encode("utf-8")
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{PRINCIPAL_REF}/database/query", data=corpo, method="POST",
                                 headers={"Authorization": f"Bearer {pat()}", "Content-Type": "application/json", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:  # noqa: S310
            dados = json.loads(r.read().decode("utf-8") or "[]")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"SQL só leitura → HTTP {e.code}: {mascarar(e.read().decode('utf-8', 'replace'))[:300]}") from None
    return dados if isinstance(dados, list) else []


def lit(v: str) -> str:
    return "'" + v.replace("'", "''") + "'"


# a regra de conta de teste (src/nucleo/contasTeste.ts) e os domínios de teste, que não existem (o e-mail voltaria)
_CLASSES = """
  u as (
    select u.id, lower(btrim(coalesce(u.email, ''))) as email, u.email_confirmed_at is not null as confirmado,
           coalesce(u.banned_until > now(), false) as bloqueado
      from auth.users u where u.deleted_at is null
  ),
  c as (
    select u.*,
           (u.email = 'teste@teste.com' or u.email ~ '^[a-z0-9._+-]*teste[a-z0-9._+-]*@physiq(calc|nutri)\\.app$') as teste,
           (u.email ~ '@physiq(calc|nutri)\\.app$') as dominio_de_teste
      from u
  ),
  a as (
    select c.*, (not c.teste and not c.dominio_de_teste and c.email <> '' and c.confirmado and not c.bloqueado) as alvo,
           {aceitou} as aceitou
      from c
  )"""


def consulta_contagem(schema: str, com_tabela: bool) -> str:
    aceitou = (f"exists (select 1 from {schema}.aceites x where x.user_id = c.id and x.documento = 'textos' and x.evento = 'aceitou' "
               f"and x.versao = {lit(VERSAO_TEXTOS)})") if com_tabela else "false"
    papel = f"""
           exists (select 1 from {schema}.conta_membros m join {schema}.contas k on k.id = m.conta_id
                    where m.user_id = a.id and m.status = 'ativo' and k.origem <> 'app') as profissional,
           exists (select 1 from {schema}.pacientes p join {schema}.contas k on k.id = p.conta_id
                    where p.user_id = a.id and p.deleted_at is null and p.ativo and k.origem = 'app') as aluno_app,
           exists (select 1 from {schema}.pacientes p left join {schema}.contas k on k.id = p.conta_id
                    where p.user_id = a.id and p.deleted_at is null and p.ativo and k.origem is distinct from 'app') as aluno_prof"""
    return f"""
with {_CLASSES.format(aceitou=aceitou)},
  r as (select a.*, {papel} from a where a.alvo and not a.aceitou)
select (select count(*) from a)::int as logins,
       (select count(*) from a where teste)::int as de_teste,
       (select count(*) from a where not teste and dominio_de_teste)::int as dominio_de_teste,
       (select count(*) from a where not teste and not dominio_de_teste and email = '')::int as sem_email,
       (select count(*) from a where not teste and not dominio_de_teste and email <> '' and not confirmado)::int as nao_confirmado,
       (select count(*) from a where not teste and not dominio_de_teste and email <> '' and confirmado and bloqueado)::int as bloqueado,
       (select count(*) from a where alvo)::int as reais,
       (select count(*) from a where alvo and aceitou)::int as ja_aceitaram,
       (select count(*) from r)::int as a_avisar,
       (select count(*) from r where profissional)::int as profissionais,
       (select count(*) from r where not profissional and aluno_prof)::int as alunos_de_profissional,
       (select count(*) from r where not profissional and not aluno_prof and aluno_app)::int as alunos_do_app,
       (select count(*) from r where not profissional and not aluno_prof and not aluno_app)::int as sem_nada"""


def consulta_destinatarios(schema: str) -> str:
    """Só no --enviar: o e-mail e o primeiro nome de quem vai receber (ficam na memória; nunca na saída)."""
    aceitou = (f"exists (select 1 from {schema}.aceites x where x.user_id = c.id and x.documento = 'textos' and x.evento = 'aceitou' "
               f"and x.versao = {lit(VERSAO_TEXTOS)})")
    return f"""
with {_CLASSES.format(aceitou=aceitou)}
select a.email,
       coalesce(nullif(btrim((select p.nome from {schema}.profiles p where p.id = a.id)), ''),
                nullif(btrim((select coalesce(x.raw_user_meta_data ->> 'full_name', x.raw_user_meta_data ->> 'name') from auth.users x where x.id = a.id)), ''),
                '') as nome
  from a where a.alvo and not a.aceitou order by a.email"""


# ───────────────────────── o e-mail ─────────────────────────
def ler_texto() -> tuple[dict, str]:
    """O topo (aprovado, assunto) e o corpo do aviso_textos.md, sem o comentário."""
    bruto = TEXTO.read_text(encoding="utf-8")
    m = re.match(r"\A---\n(.*?)\n---\n(.*)\Z", bruto, flags=re.S)
    if not m:
        raise SystemExit(f"{TEXTO.name}: falta o topo entre '---' (aprovado, assunto)")
    topo = dict((k.strip().lower(), v.strip()) for k, v in (l.split(":", 1) for l in m.group(1).splitlines() if ":" in l))
    corpo = re.sub(r"<!--.*?-->", "", m.group(2), flags=re.S).strip()
    return topo, corpo


def primeiro_nome(nome: str) -> str:
    n = re.sub(r"[\x00-\x1f<>{}]", "", (nome or "").strip()).split()
    return n[0][:40] if n else ""


def montar(corpo: str, nome: str, site: str) -> tuple[str, str]:
    """(texto, html) do e-mail de uma pessoa. O nome entra escapado no HTML; só os links do Physiq viram link."""
    links = {"link_termos": f"{site}/termos", "link_privacidade": f"{site}/privacidade", "link_assinatura": f"{site}/assinatura",
             "link_excluir": f"{site}/excluir-conta"}
    pn = primeiro_nome(nome)
    valores = {"ola": f"Olá, {pn}!" if pn else "Olá!", "data_dos_textos": DATA_DOS_TEXTOS, "contato": CONTATO, **links}
    texto = re.sub(r"\{(\w+)\}", lambda m: valores.get(m.group(1), m.group(0)), corpo)
    sobra = re.findall(r"\{\w+\}", texto)
    if sobra:
        raise SystemExit(f"{TEXTO.name}: marca desconhecida {sobra[:3]}")
    blocos = []
    for par in re.split(r"\n\s*\n", texto):
        linhas = [l.strip() for l in par.strip().splitlines() if l.strip()]
        itens = [l[2:] for l in linhas if l.startswith("- ")]
        resto = [l for l in linhas if not l.startswith("- ")]
        partes = []
        if resto:
            partes.append('<p style="margin:0 0 14px;font-size:15px;line-height:1.5">' + "<br>".join(html.escape(l) for l in resto) + "</p>")
        if itens:
            partes.append('<ul style="margin:0 0 14px;padding-left:20px;font-size:15px;line-height:1.6">'
                          + "".join(f"<li>{html.escape(i)}</li>" for i in itens) + "</ul>")
        blocos.append("".join(partes))
    corpo_html = "".join(blocos)
    for url in sorted(set(links.values()), key=len, reverse=True):
        e = html.escape(url)
        corpo_html = corpo_html.replace(e, f'<a href="{e}">{e}</a>')
    e = html.escape(CONTATO)
    corpo_html = corpo_html.replace(e, f'<a href="mailto:{e}">{e}</a>')
    pagina = ('<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#111">'
              '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:24px 12px"><tr><td align="center">'
              '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;padding:24px">'
              f'<tr><td>{corpo_html}</td></tr></table></td></tr></table></body></html>')
    return texto, pagina


# ───────────────────────── a chave do Resend: do cofre, na hora ─────────────────────────
def chave_do_cofre(item: str, projeto: str | None) -> str:
    """Lê o item pelo MCP local do cofre B Code Segredos (JSON-RPC por stdio) e devolve SÓ a chave do Resend (re_…), em memória."""
    if not COFRE_NODE.exists() or not COFRE_MCP.exists():
        raise SystemExit("o MCP local do cofre não foi achado (COFRE_NODE / COFRE_MCP): a chave do Resend só vem do cofre")
    args = {"item_id": item} if _UUID.match(item) else {"nome": item, **({"projeto": projeto} if projeto else {})}
    p = subprocess.Popen([str(COFRE_NODE), str(COFRE_MCP)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    try:
        def enviar(obj: dict) -> None:
            p.stdin.write(json.dumps(obj) + "\n")  # type: ignore[union-attr]
            p.stdin.flush()  # type: ignore[union-attr]

        def esperar(id_: int) -> dict:
            while True:
                linha = p.stdout.readline()  # type: ignore[union-attr]
                if not linha:
                    raise SystemExit("o MCP do cofre fechou sem responder")
                try:
                    m = json.loads(linha)
                except ValueError:
                    continue
                if m.get("id") == id_:
                    return m

        enviar({"jsonrpc": "2.0", "id": 1, "method": "initialize",
                "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "avisar_textos", "version": "1"}}})
        esperar(1)
        enviar({"jsonrpc": "2.0", "method": "notifications/initialized"})
        enviar({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "ler_segredo", "arguments": args}})
        r = esperar(2)
    finally:
        try:
            p.stdin.close()  # type: ignore[union-attr]
        except Exception:  # noqa: BLE001
            pass
        p.terminate()
    texto = "".join(c.get("text", "") for c in (r.get("result") or {}).get("content", []))
    m = re.search(r"re_[A-Za-z0-9_\-]{8,}", texto)
    if not m:
        raise SystemExit("o item do cofre não tem uma chave do Resend (re_…)")
    return m.group(0)


def mascarar(t: str) -> str:
    return re.sub(r"[^\s@<>()\"']+@[^\s@<>()\"']+", "[e-mail]", t or "")


def enviar_um(chave: str, remetente: str, para: str, assunto: str, texto: str, pagina: str) -> tuple[bool, str]:
    corpo = json.dumps({"from": remetente, "to": [para], "subject": assunto, "html": pagina, "text": texto, "reply_to": CONTATO}).encode("utf-8")
    req = urllib.request.Request("https://api.resend.com/emails", data=corpo, method="POST",
                                 headers={"Authorization": f"Bearer {chave}", "Content-Type": "application/json; charset=utf-8", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:  # noqa: S310
            return 200 <= r.status < 300, ""
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code} {mascarar(e.read().decode('utf-8', 'replace'))[:160]}"
    except Exception as e:  # noqa: BLE001
        return False, type(e).__name__


# ───────────────────────── principal ─────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description="hml-12: o e-mail do aviso dos textos legais (só simula sem --enviar; detalhes no topo do arquivo)")
    ap.add_argument("alvo", choices=sorted(ALVOS))
    ap.add_argument("--enviar", action="store_true", help="manda de verdade (só prod, com as 5 travas do topo do arquivo)")
    ap.add_argument("--previo", action="store_true", help="o aviso 30 dias antes de uma versão nova (P2): a de antes ainda vale no banco")
    ap.add_argument("--cofre-item", help="nome ou id do item do cofre com a chave do Resend que vale na virada (P11)")
    ap.add_argument("--cofre-projeto", help="o projeto do item no cofre (restringe a busca pelo nome)")
    ap.add_argument("--remetente", default=REMETENTE_PADRAO, help=f"o 'De:' (domínio verificado no Resend; padrão {REMETENTE_PADRAO})")
    a = ap.parse_args()
    schema, site = ALVOS[a.alvo]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", VERSAO_TEXTOS):
        raise SystemExit(f"VERSAO_TEXTOS fora do formato: {VERSAO_TEXTOS}")
    topo, corpo = ler_texto()
    montar(corpo, "", site)  # confere as marcas do texto já na simulação

    existe = ler(f"select to_regclass({lit(schema + '.aceites')}) is not null as t, "
                 f"(select nullif(btrim(x.valor ->> 'versao'), '') from {schema}.app_config x where x.chave = 'textos_legais') as v")[0]
    com_tabela, versao_banco = bool(existe["t"]), existe["v"]
    n = ler(consulta_contagem(schema, com_tabela))[0]
    print(f"alvo={a.alvo} schema={schema} · versão do app {VERSAO_TEXTOS} ({DATA_DOS_TEXTOS}) · versão vigente no banco: {versao_banco or 'nula (desligado)'}")
    if not com_tabela:
        print(f"  a tabela {schema}.aceites ainda não existe (a migração da hml-12 não foi aplicada aqui): ninguém conta como aceito")
    print(f"logins {n['logins']}: {n['de_teste']} de teste · {n['dominio_de_teste']} em domínio de teste (o e-mail voltaria) · "
          f"{n['sem_email']} sem e-mail · {n['nao_confirmado']} sem o e-mail confirmado · {n['bloqueado']} bloqueados no login — ficam de fora")
    print(f"reais: {n['reais']} · já aceitaram a versão {VERSAO_TEXTOS}: {n['ja_aceitaram']} · "
          f"{'vão receber' if a.enviar else 'receberiam'} o e-mail: {n['a_avisar']}")
    print(f"  dos que {'vão receber' if a.enviar else 'receberiam'}: {n['profissionais']} profissionais · {n['alunos_de_profissional']} alunos de "
          f"profissional · {n['alunos_do_app']} alunos do app · {n['sem_nada']} sem conta nem matrícula")
    if n["a_avisar"] > LIMITE_DIARIO:
        print(f"⚠️ passa do limite diário do Resend grátis ({LIMITE_DIARIO}): o que sobrar falha hoje (rodar de novo amanhã manda só o que falta)")
    if not a.enviar:
        print(f"simulação: nenhum e-mail saiu. Para mandar de verdade (só depois da virada no banco e com o texto aprovado): {a.alvo} --enviar")
        return 0

    # ── as travas do envio ──
    if a.alvo != "prod":
        print("o envio é só na produção: no staging as contas são de teste e o e-mail voltaria")
        return 2
    if not com_tabela:
        print(f"a tabela {schema}.aceites não existe: a migração da hml-12 não foi aplicada")
        return 2
    if a.previo and not (versao_banco and versao_banco < VERSAO_TEXTOS):
        print(f"--previo: a versão do banco ({versao_banco or 'nula'}) tem que ser a de antes, menor que a nova do app ({VERSAO_TEXTOS})")
        return 2
    if not a.previo and versao_banco != VERSAO_TEXTOS:
        print(f"a versão vigente do banco ({versao_banco or 'nula'}) não é a do app ({VERSAO_TEXTOS}): o e-mail sai depois do update da "
              "virada (ou, 30 dias antes de uma versão nova, com --previo)")
        return 2
    if topo.get("aprovado", "").lower() not in ("sim", "aprovado"):
        print(f"o texto de {TEXTO.name} ainda não foi aprovado (topo 'aprovado: {topo.get('aprovado', '')}'): o dono aprova antes do envio (P11)")
        return 2
    assunto = topo.get("assunto", "").strip()
    if not assunto:
        print(f"{TEXTO.name}: falta o 'assunto' no topo")
        return 2
    if not a.cofre_item:
        print("falta --cofre-item: a chave do Resend vem do cofre, na hora")
        return 2
    if n["a_avisar"] == 0:
        print("ninguém a avisar")
        return 0
    if not sys.stdin.isatty():
        print("a confirmação precisa ser digitada no terminal (sem entrada interativa, nada sai)")
        return 2
    resposta = input(f'Para mandar {n["a_avisar"]} e-mail(s) DE VERDADE, digite "ENVIAR {n["a_avisar"]}": ').strip()
    if resposta != f"ENVIAR {n['a_avisar']}":
        print("não confirmado: nenhum e-mail saiu")
        return 2
    chave = chave_do_cofre(a.cofre_item, a.cofre_projeto)
    destinos = ler(consulta_destinatarios(schema))
    enviados = falhas = 0
    for i, d in enumerate(destinos, 1):
        texto, pagina = montar(corpo, d.get("nome") or "", site)
        ok, motivo = enviar_um(chave, a.remetente, d["email"], assunto, texto, pagina)
        enviados += ok
        falhas += not ok
        print(f"  {i}/{len(destinos)} {'enviado' if ok else f'falhou ({motivo})'}")
        time.sleep(PAUSA_S)
    del chave
    print(f"{enviados} enviado(s), {falhas} falha(s)")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
