#!/usr/bin/env python3
"""Physiq W2 — os segredos do Mercado Pago do personal, sem valor na tela, no log ou na conversa (revisão I9 e I10 do plano da W2).

Uso:  python3 scripts/segredos/mp_conta.py <grupo> <subcomando> [--dry-run]
  cofre campos            os NOMES dos campos do item "Mercado Pago — PhysiqCalc", o que cada um parece ser (token de produção/teste,
                          chave pública, client id, client secret, assinatura dos avisos) e o tamanho — nunca o valor; num texto livre
                          (as notas), só QUANTOS tokens/chaves há dentro. E se os itens da W2 (usuários de teste, aplicação de teste)
                          já existem (só os nomes dos campos). Sai 2 sem o Client Secret.
  oauth local             ~/.physiq-mp-oauth.json (600) com client_id e client_secret (a prova da Task 1 e o oauth_real).
  oauth copiar|conferir   MP_CLIENT_ID e MP_CLIENT_SECRET (+ os _STAGING do item "… — aplicação de teste (W2)", se existir: o plano B do I6)
                          nos segredos das funções do principal / o digest das funções = sha256 do cofre (sai 1 se não bate).
  usuarios-teste criar    vendedor e comprador de TESTE (POST /users/test, MLB) com o token de PRODUÇÃO só na memória → cofre ("Mercado
                          Pago — PhysiqCalc — usuários de teste (W2)", tipo login; gravado logo depois de CADA usuário criado) →
                          ~/.physiq-mp-{vendedor,comprador}-teste.json (600). Já no cofre → só os 2 arquivos (o MP não apaga usuário de
                          teste: até 15 por aplicação — não criar outro par); só um deles no cofre → cria só o que falta.
  (A Task 11 acrescenta  chave gerar|conferir  — a MP_TOKENS_CHAVE, gerada SÓ quando não existe em lugar nenhum (I10) — e
   assinatura copiar|conferir  — a MP_WEBHOOK_ASSINATURA do item "… — assinatura dos avisos (W2)".)
--dry-run (ou --seco): lê o cofre (só na memória), mas não grava nada — nem cofre, nem funções, nem arquivo — e não chama o MP.
Na tela só ✅/❌, nomes de campo, tipo, tamanho e sha8: nunca um valor, o sha256 inteiro, o id ou o código de um usuário de teste.
Saída: 0 ok · 1 erro ou não confere · 2 falta no cofre algo que é DELE (o Client Secret ou o token de produção — W2-a, no FIM).
O item dos usuários: extras vendedor_id|usuario|email|senha|codigo_verificacao e comprador_… (o login de topo = o vendedor).
Credenciais: o PAT em ~/.pc-pat (Management API) e o cofre pelo MCP local por stdio — o Remoto do servidor.py.
Testes: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest scripts/segredos/test_mp_conta.py
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import traceback
import urllib.error
import urllib.request
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import servidor as S  # noqa: E402  (Remoto, Falha, guardar, ok, nota, depois, onde, sha8, sha256_hex, gravar_arquivo, PROJETO_COFRE)

ITEM = "Mercado Pago — PhysiqCalc"
ITEM_TESTE_APP = "Mercado Pago — PhysiqCalc — aplicação de teste (W2)"
ITEM_USUARIOS = "Mercado Pago — PhysiqCalc — usuários de teste (W2)"
ARQ_OAUTH = ".physiq-mp-oauth.json"
PAPEIS = ("vendedor", "comprador")
CAMPOS_USUARIO = (("id", "id"), ("usuario", "nickname"), ("email", "email"), ("senha", "password"))  # (no cofre, no arquivo/no MP)
USERS_TEST = "https://api.mercadopago.com/users/test"
UA = "physiq-unificado/1.0 (segredos/mp_conta)"
NOTA_USUARIOS = ("Usuários de TESTE do Mercado Pago (dinheiro de mentira) da aplicação PhysiqCalc, criados pelo "
                 "scripts/segredos/mp_conta.py usuarios-teste criar (W2). O login de topo é o do vendedor. O MP não apaga usuário de "
                 "teste (até 15 por aplicação): não criar outro par. O código de verificação do painel (Contas de teste) vai no extra "
                 "vendedor_codigo_verificacao.")
TOKEN_PROD = re.compile(r"APP_USR-(\d{6,20})-\d{6}-[0-9a-f]{20,64}-\d{3,20}")
TOKEN_TESTE = re.compile(r"TEST-(\d{6,20})-\d{6}-[0-9a-f]{20,64}-\d{3,20}")
CHAVE_PUBLICA = re.compile(r"(APP_USR|TEST)-[0-9a-f]{8}-[0-9a-f-]{20,40}")
SECRET = re.compile(r"[A-Za-z0-9]{20,64}")
EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[A-Za-z]{2,}")
FALA_DE_SECRET = re.compile(r"secret|segredo", re.I)
NOME_COM_CARA_DE_VALOR = re.compile(r"[A-Za-z0-9]{20,}|(APP_USR|TEST)-\d")
GUARDAR_DESDE = 6  # o limpo() troca TODA ocorrência: um campo "2" apagaria cada 2 da tela; segredo do MP tem ≥ 6 (o código do painel)


class FaltaDele(S.Falha):
    """Falta no cofre algo que só o Weslley põe (o Client Secret, o token de produção): sai 2 — é o FIM (W2-a), não um erro."""


def casa() -> Path:
    return Path.home()


def modo_600(caminho: Path) -> bool:
    return (caminho.stat().st_mode & 0o777) == 0o600


# ───────────────────────── o cofre (os valores só na memória) ─────────────────────────


def pares_de(campos: dict) -> list[tuple[str, str]]:
    """[(nome do campo, valor)] de um item: os de topo (texto ou número) + os extras; só os que têm valor."""
    pares: list[tuple[str, str]] = []
    for k, v in campos.items():
        if k == "extras":
            pares += [(str(e.get("nome") or ""), str(e.get("valor") or "").strip()) for e in (v or []) if isinstance(e, dict)]
        elif isinstance(v, (str, int)) and not isinstance(v, bool):
            pares.append((str(k), str(v).strip()))
    return [(n, v) for n, v in pares if v]


def ler_campos(r: S.Remoto, nome: str) -> tuple[str, dict] | None:
    """(tipo, campos) de QUALQUER tipo de item; cada valor vai para o limpo() antes de qualquer mensagem. None = não existe."""
    erro, texto = r._mcp().ferramenta("ler_segredo", {"projeto": S.PROJETO_COFRE, "nome": nome})
    if erro:
        if texto.startswith("ITEM_NAO_ENCONTRADO"):
            return None
        raise S.Falha(f"cofre: ler \"{nome}\" falhou — {texto[:200]}")
    try:
        dados = json.loads(texto)
    except json.JSONDecodeError:
        raise S.Falha(f"cofre: a leitura de \"{nome}\" veio fora do formato") from None
    campos = dados.get("campos") if isinstance(dados, dict) else None
    if not isinstance(campos, dict):
        raise S.Falha(f"cofre: a leitura de \"{nome}\" veio sem campos")
    for _, v in pares_de(campos):
        if len(v) >= GUARDAR_DESDE:
            S.guardar(v)  # nenhuma mensagem que sai daqui leva um valor (o limpo() do servidor.py)
    return str(dados.get("tipo") or ""), campos


def ler_item(r: S.Remoto, nome: str) -> list[tuple[str, str]] | None:
    lido = ler_campos(r, nome)
    return None if lido is None else pares_de(lido[1])


# ───────────────────────── regras puras: o que cada campo parece ser ─────────────────────────


def tipo_de(nome: str, valor: str) -> str:
    """Pelo FORMATO do valor (tokens e chaves públicas); sem formato próprio, pelo NOME do campo."""
    n = nome.lower()
    if TOKEN_PROD.fullmatch(valor):
        return "token de produção"
    if TOKEN_TESTE.fullmatch(valor):
        return "token de teste"
    if CHAVE_PUBLICA.fullmatch(valor):
        return "chave pública"
    if re.match(r"https?://", valor):
        return "endereço"
    if EMAIL.fullmatch(valor):
        return "e-mail"
    if any(p in n for p in ("assinatura", "webhook", "signature")):
        return "assinatura dos avisos"  # a do painel (W2-a, passo 6): nunca vira o client secret
    if ("secret" in n or "segredo" in n) and SECRET.fullmatch(valor):
        return "client secret"
    if "user" in n and valor.isdigit():
        return "user id (a conta do MP)"
    if any(p in n for p in ("client", "app", "aplica")) and valor.isdigit():
        return "client id"
    return "outro"


def nome_na_tela(nome: str) -> str:
    """O nome do campo como sai na tela — ou só o tamanho, se ele tem cara de valor (um segredo colado no lugar do nome)."""
    return f"‹nome com cara de valor, {len(nome)} caracteres›" if NOME_COM_CARA_DE_VALOR.search(nome) else f"\"{nome}\""


def dentro_do_texto(valor: str) -> str:
    """Num texto livre (as notas): só QUANTOS tokens/chaves aparecem e se ele fala de "secret" — nunca o trecho."""
    achados = [f"{n} {rotulo}" for rx, rotulo in ((TOKEN_PROD, "token de produção"), (TOKEN_TESTE, "token de teste"),
                                                   (CHAVE_PUBLICA, "chave pública"))
               if (n := sum(1 for _ in rx.finditer(valor)))]
    if FALA_DE_SECRET.search(valor):
        achados.append("fala de \"secret\"")
    return f" · no texto: {', '.join(achados)}" if achados else ""


def unico(tipos: list[tuple[str, str, str]], tipo: str) -> str | None:
    """O valor dos campos daquele tipo (o mesmo valor 2 vezes conta 1); 2 valores diferentes → Falha: o script não escolhe."""
    valores = {v for t, _, v in tipos if t == tipo}
    if len(valores) > 1:
        nomes = ", ".join(nome_na_tela(n) for t, n, _ in tipos if t == tipo)
        raise S.Falha(f"{len(valores)} campos com valores diferentes parecem {tipo} ({nomes}): deixe só 1 no cofre")
    return next(iter(valores), None)


def cliente_detalhado(pares: list[tuple[str, str]]) -> tuple[str | None, str | None, str]:
    """(client_id, client_secret, de onde veio o id). O id: o campo (client/app/aplicação, só dígitos) ou o 2º pedaço do token de
    produção — sem ele, o do token de teste (o mesmo número da aplicação). O secret: só de um campo, pelo nome."""
    tipos = [(tipo_de(n, v), n, v) for n, v in pares]
    sec = unico(tipos, "client secret")
    cid = unico(tipos, "client id")
    if cid:
        return cid, sec, "campo " + nome_na_tela(next(n for t, n, _ in tipos if t == "client id"))
    for rx, tipo in ((TOKEN_PROD, "token de produção"), (TOKEN_TESTE, "token de teste")):
        tok = next((v for t, _, v in tipos if t == tipo), None)
        if tok:
            cid = rx.fullmatch(tok).group(1)  # type: ignore[union-attr]
            S.guardar(cid)  # o pedaço também: o token inteiro já está no limpo(), o número sozinho não estava
            return cid, sec, f"o 2º pedaço do {tipo}"
    return None, sec, ""


def cliente(pares: list[tuple[str, str]]) -> tuple[str | None, str | None]:
    cid, sec, _ = cliente_detalhado(pares)
    return cid, sec


def exigir_cliente(pares: list[tuple[str, str]] | None) -> tuple[str, str]:
    cid, sec = cliente(pares or [])
    if not sec:
        raise FaltaDele("sem o Client Secret no cofre (W2-a, passo 5): a troca do code espera o FIM — nada gravado")
    if not cid:
        raise FaltaDele(f"sem o client id no cofre (nem um campo client_id nem um token no item \"{ITEM}\") — nada gravado")
    return cid, sec


def token_de_producao(pares: list[tuple[str, str]]) -> str | None:
    return unico([(tipo_de(n, v), n, v) for n, v in pares], "token de produção")


# ───────────────────────── os subcomandos ─────────────────────────


def cofre_campos(r: S.Remoto, a: argparse.Namespace) -> int:
    lido = ler_campos(r, ITEM)
    if lido is None:
        S.ok(False, f"o item \"{ITEM}\" não existe no cofre ({S.PROJETO_COFRE})")
        return 1
    pares = pares_de(lido[1])
    S.nota(f"cofre {S.PROJETO_COFRE} › \"{ITEM}\" (tipo {lido[0]}): {len(pares)} campo(s) com valor")
    for n, v in pares:
        t = tipo_de(n, v)
        S.nota(f"campo {nome_na_tela(n)}: {t} · {len(v)} caractere{'' if len(v) == 1 else 's'}"
               + (dentro_do_texto(v) if t == "outro" else ""))
    for nome in (ITEM_USUARIOS, ITEM_TESTE_APP):
        outro = ler_campos(r, nome)
        campos = ", ".join(nome_na_tela(n).strip('"') for n, _ in pares_de(outro[1])) if outro else ""
        S.nota(f"\"{nome}\": " + ("não existe" if outro is None else f"existe (tipo {outro[0]}; campos {campos or 'nenhum'})"))
    cid, sec, origem = cliente_detalhado(pares)
    S.ok(cid, f"client id: achado ({origem}; {len(cid)} dígitos)" if cid else "client id: NÃO achado")
    numeros = {m.group(1) for _, v in pares for rx in (TOKEN_PROD, TOKEN_TESTE) if (m := rx.fullmatch(v))}
    if cid and origem.startswith("campo") and numeros and cid not in numeros:
        S.nota("o client id do campo é diferente do número da aplicação no token: confira qual é o da PhysiqCalc")
    if S.ok(sec, f"client secret: achado ({len(sec)} caracteres, sha8 {S.sha8(sec)})" if sec
            else "client secret: NÃO achado — é o passo 5 da W2-a (FIM, dele)"):
        S.depois("a cópia local para a prova:  python3 scripts/segredos/mp_conta.py oauth local")
        return 0
    S.depois(f"no FIM (W2-a, passo 5) ele salva o Client Secret no item \"{ITEM}\" (campo client_secret); "
             "depois  mp_conta.py oauth local")
    return 2


def oauth_local(r: S.Remoto, a: argparse.Namespace) -> int:
    cid, sec = exigir_cliente(ler_item(r, ITEM))
    destino = casa() / ARQ_OAUTH
    texto = f"~/{ARQ_OAUTH} (600): client_id {len(cid)} dígitos, client_secret {len(sec)} caracteres (sha8 {S.sha8(sec)})"
    if a.dry_run:
        S.nota(f"--dry-run: gravaria {texto}")
        return 0
    conteudo = {"client_id": cid, "client_secret": sec}
    S.gravar_arquivo(destino, json.dumps(conteudo))
    certo = S.ok(modo_600(destino) and json.loads(destino.read_text(encoding="utf-8")) == conteudo, texto)
    if certo:
        S.depois("quem lê: a prova da Task 1 (e2e/w2/prova_public_key.py) e o oauth_real do e2e/w2/api.py")
    return 0 if certo else 1


def oauth_pares(r: S.Remoto) -> dict[str, str]:
    cid, sec = exigir_cliente(ler_item(r, ITEM))
    segredos = {"MP_CLIENT_ID": cid, "MP_CLIENT_SECRET": sec}
    teste = ler_item(r, ITEM_TESTE_APP)
    if teste is not None:
        tcid, tsec = cliente(teste)
        if tcid and tsec:
            segredos |= {"MP_CLIENT_ID_STAGING": tcid, "MP_CLIENT_SECRET_STAGING": tsec}
        else:
            S.nota(f"\"{ITEM_TESTE_APP}\" existe, mas sem client_id e client_secret: os _STAGING ficam de fora")
    return segredos


def conferir_nas_funcoes(r: S.Remoto, segredos: dict[str, str]) -> int:
    nas_funcoes = r.segredos("principal")
    certo = True
    for nome, valor in segredos.items():
        d = nas_funcoes.get(nome)
        igual = d == S.sha256_hex(valor)
        estado = "= o cofre" if igual else ("não existe" if d is None else "DIFERENTE do cofre")
        certo = S.ok(igual, f"{nome} nas funções do principal {estado} (sha8 do cofre {S.sha8(valor)})") and certo
    return 0 if certo else 1


def oauth_copiar(r: S.Remoto, a: argparse.Namespace) -> int:
    segredos = oauth_pares(r)
    if a.dry_run:
        for nome, valor in segredos.items():
            S.nota(f"--dry-run: gravaria {nome} ({len(valor)} caracteres, sha8 {S.sha8(valor)}) nas funções do {S.onde('principal')}")
        return 0
    for nome, valor in segredos.items():
        r.gravar_segredo("principal", nome, valor)
    rc = conferir_nas_funcoes(r, segredos)
    S.depois("publicar de novo as funções que leem o client (o segredo é lido no boot do isolate) — Task 14")
    return rc


def oauth_conferir(r: S.Remoto, a: argparse.Namespace) -> int:
    return conferir_nas_funcoes(r, oauth_pares(r))


def usuario_do_cofre(c: dict[str, str], papel: str) -> dict[str, str]:
    """O que o arquivo do papel leva, dos extras do item; no vendedor, o login de topo cobre o login e a senha que faltarem."""
    d = {arq: c.get(f"{papel}_{cof}") for cof, arq in CAMPOS_USUARIO}
    d["codigo_verificacao"] = c.get(f"{papel}_codigo_verificacao")
    if papel == "vendedor":
        if not (d["nickname"] or d["email"]):
            d["nickname"] = c.get("usuario")
        d["password"] = d["password"] or c.get("senha")
    return {k: v for k, v in d.items() if v}


def tem_usuario(d: dict[str, str]) -> bool:
    return bool(d.get("id") or d.get("nickname") or d.get("email"))


def faltam_no(d: dict[str, str]) -> list[str]:
    """O que a prova (Task 1) e o E2E precisam de cada um: o id, a senha e o login (o apelido ou o e-mail)."""
    return [k for k in ("id", "password") if not d.get(k)] + ([] if d.get("nickname") or d.get("email") else ["nickname/email"])


def arquivo_do_papel(papel: str) -> Path:
    return casa() / f".physiq-mp-{papel}-teste.json"


def gravar_arquivo_do_papel(papel: str, d: dict[str, str], a: argparse.Namespace) -> bool:
    destino = arquivo_do_papel(papel)
    faltam = faltam_no(d)
    texto = f"~/{destino.name} (600): chaves {sorted(d)}" + (f" — faltam {faltam}" if faltam else "")
    if a.dry_run:
        S.nota(f"--dry-run: gravaria {texto}")
        return True
    S.gravar_arquivo(destino, json.dumps(d, ensure_ascii=False))
    return S.ok(modo_600(destino) and not faltam, texto)


def criar_usuario_teste(token: str, papel: str) -> dict:
    """POST /users/test (MLB) com o token de PRODUÇÃO da aplicação — a referência do MP traz "Bearer APP_USR-…" e site_id +
    description obrigatórios — → id, nickname, password (e email, se vier). Cada valor vai para o limpo() antes de qualquer mensagem."""
    req = urllib.request.Request(USERS_TEST, method="POST",
                                 data=json.dumps({"site_id": "MLB", "description": f"Physiq W2 {papel}"}).encode("utf-8"),
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                                          "Accept": "application/json", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            status, txt = resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        try:
            txt = e.read().decode("utf-8", "replace")
        except Exception:  # noqa: BLE001 — sem corpo, só o status
            txt = ""
        finally:
            e.close()
        raise S.Falha(f"POST /users/test ({papel}): HTTP {e.code} {txt[:300]}") from None
    except (urllib.error.URLError, OSError) as e:
        raise S.Falha(f"POST /users/test ({papel}): sem resposta ({e})") from None
    try:
        corpo = json.loads(txt)
    except json.JSONDecodeError:
        corpo = None
    if not isinstance(corpo, dict):
        raise S.Falha(f"POST /users/test ({papel}): HTTP {status}, resposta fora do formato")
    for _, arq in CAMPOS_USUARIO:
        if corpo.get(arq) not in (None, ""):
            S.guardar(str(corpo[arq]))
    if not corpo.get("id") or not corpo.get("password"):
        raise S.Falha(f"POST /users/test ({papel}): HTTP {status} sem id ou senha na resposta (chaves {sorted(corpo)})")
    return corpo


def salvar_usuarios(r: S.Remoto, lido: tuple[str, dict] | None, dados: dict[str, dict[str, str]], papeis: list[str]) -> None:
    """Grava no cofre os usuários dos papéis dados: os extras deles entram e os outros ficam (o salvar_segredo troca a lista inteira de
    extras — o código do painel, por exemplo, tem de ir junto); item novo leva o login de topo (o vendedor), a URL e a nota."""
    campos = lido[1] if lido else {}
    nossos = {f"{p}_{cof}" for p in papeis for cof, _ in CAMPOS_USUARIO}
    extras = [e for e in (campos.get("extras") or []) if isinstance(e, dict) and e.get("nome") not in nossos]
    extras += [{"nome": f"{p}_{cof}", "valor": dados[p][arq], "oculto": cof == "senha"}
               for p in papeis for cof, arq in CAMPOS_USUARIO if dados[p].get(arq)]
    gravar: dict = {"extras": extras}
    if lido is None:
        v = dados["vendedor"]
        gravar |= {"usuario": v.get("nickname") or v.get("email") or "", "senha": v.get("password") or "",
                   "url": "https://www.mercadopago.com.br", "notas": NOTA_USUARIOS}
    erro, texto = r._mcp().ferramenta("salvar_segredo", {"projeto": S.PROJETO_COFRE, "nome": ITEM_USUARIOS, "tipo": "login",
                                                         "campos": gravar})
    if erro:
        raise S.Falha(f"cofre: salvar \"{ITEM_USUARIOS}\" falhou — {texto[:200]}")


def usuarios_criar(r: S.Remoto, a: argparse.Namespace) -> int:
    lido = ler_campos(r, ITEM_USUARIOS)
    if lido is not None and lido[0] != "login":
        raise S.Falha(f"\"{ITEM_USUARIOS}\" existe com o tipo {lido[0]}, não login: ajuste no cofre — nenhum usuário criado")
    dados = {p: usuario_do_cofre(dict(pares_de(lido[1])) if lido else {}, p) for p in PAPEIS}
    criar = [p for p in PAPEIS if not tem_usuario(dados[p])]
    if not criar:
        S.nota("os usuários de teste já estão no cofre: só os 2 arquivos (nenhum POST /users/test)")
        return 0 if all([gravar_arquivo_do_papel(p, dados[p], a) for p in PAPEIS]) else 1
    if lido is not None:
        S.nota(f"no cofre já está o {', '.join(p for p in PAPEIS if p not in criar)}: só o que falta é criado ({', '.join(criar)})")
    tok = token_de_producao(ler_item(r, ITEM) or [])
    if not tok:
        raise FaltaDele("sem o token de produção no cofre: os usuários de teste vão para o FIM (W2-a, passo 7)")
    if a.dry_run:
        S.nota(f"--dry-run: criaria {len(criar)} usuário(s) de teste ({', '.join(criar)}) — POST /users/test, MLB, com o token de "
               f"produção só na memória — e gravaria no cofre \"{ITEM_USUARIOS}\" (tipo login) e nos arquivos 600")
        return 0
    for papel in criar:
        corpo = criar_usuario_teste(tok, papel)
        dados[papel] = {arq: str(corpo[arq]) for _, arq in CAMPOS_USUARIO if corpo.get(arq) not in (None, "")}
        S.gravar_arquivo(arquivo_do_papel(papel), json.dumps(dados[papel], ensure_ascii=False))  # se o cofre falhar, não se perde
        S.nota(f"{papel}: criado no MP (id com {len(dados[papel]['id'])} dígitos) | chaves da resposta {sorted(corpo)}")
        try:
            salvar_usuarios(r, lido, dados, [papel])
        except S.Falha as e:
            raise S.Falha(f"{e} — o {papel} de teste foi criado e está só em ~/{arquivo_do_papel(papel).name} (600): "
                          "salve no cofre pela tela") from None
        lido = ler_campos(r, ITEM_USUARIOS)
        volta = usuario_do_cofre(dict(pares_de(lido[1])) if lido else {}, papel)
        if not S.ok(volta.get("id") == dados[papel]["id"] and volta.get("password") == dados[papel]["password"],
                    f"cofre {S.PROJETO_COFRE} › \"{ITEM_USUARIOS}\": o {papel} gravado e lido de volta igual"):
            return 1
    return 0 if all([gravar_arquivo_do_papel(p, dados[p], a) for p in PAPEIS]) else 1


# ───────────────────────── linha de comando ─────────────────────────


COMANDOS = {("cofre", "campos"): cofre_campos, ("oauth", "local"): oauth_local, ("oauth", "copiar"): oauth_copiar,
            ("oauth", "conferir"): oauth_conferir, ("usuarios-teste", "criar"): usuarios_criar}


def argumentos(argv: list[str] | None = None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(prog="mp_conta.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("grupo", choices=sorted({g for g, _ in COMANDOS}), help="o grupo (lista acima)")
    ap.add_argument("subcomando", help="o subcomando do grupo (lista acima)")
    ap.add_argument("--dry-run", "--seco", dest="dry_run", action="store_true",
                    help="lê o cofre, mas não grava nada (nem cofre, nem funções, nem arquivo) e não chama o MP")
    a = ap.parse_args(argv)
    if (a.grupo, a.subcomando) not in COMANDOS:
        ap.error(f"comando desconhecido: {a.grupo} {a.subcomando} — os que existem: " + ", ".join(" ".join(c) for c in COMANDOS))
    return a


def main(argv: list[str] | None = None, remoto: S.Remoto | None = None) -> int:
    a = argumentos(argv)
    r = remoto or S.Remoto()
    print(f"== mp_conta · {a.grupo} {a.subcomando}" + (" · --dry-run: nada é gravado" if a.dry_run else ""), flush=True)
    try:
        return COMANDOS[(a.grupo, a.subcomando)](r, a)
    except FaltaDele as e:
        S.ok(False, str(e))
        return 2
    except S.Falha as e:
        S.ok(False, str(e))  # o ok() passa pelo limpo(): nenhum valor guardado sai
        return 1
    except Exception as e:  # noqa: BLE001 — nada sai sem passar pelo limpo()
        S.ok(False, f"erro inesperado ({type(e).__name__}): {e}\n{traceback.format_exc()}")
        return 1
    finally:
        r.fechar()


if __name__ == "__main__":
    sys.exit(main())
