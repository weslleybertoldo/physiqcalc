#!/usr/bin/env python3
"""Testes do mp_conta.py (Task 0b da W2) sem rede: o cofre (as 2 ferramentas do MCP, com as regras dele), a Management API e o
POST /users/test do Mercado Pago na memória — e um caminho pelo cliente de verdade do cofre (JSON-RPC por stdio) falando com um MCP
falso. Valores falsos feitos na hora; nenhum deles (nem o sha256 inteiro) pode aparecer na saída.
Rodar:  PYTHONDONTWRITEBYTECODE=1 python3 -m unittest scripts/segredos/test_mp_conta.py"""
from __future__ import annotations

import contextlib
import copy
import inspect
import io
import json
import os
import secrets
import string
import sys
import tempfile
import textwrap
import unittest
import urllib.error
import uuid
from pathlib import Path
from unittest import mock

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import mp_conta as M  # noqa: E402
import servidor as S  # noqa: E402

PROJETO = "PhysiqCalc"


# ───────────────────────── valores falsos, feitos na hora ─────────────────────────


def digitos(n: int) -> str:
    return secrets.choice("123456789") + "".join(secrets.choice(string.digits) for _ in range(n - 1))


def letras(n: int) -> str:
    return "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(n))


def token_prod(app_id: str) -> str:
    return f"APP_USR-{app_id}-{digitos(6)}-{secrets.token_hex(16)}-{digitos(9)}"


def token_teste(app_id: str) -> str:
    return f"TEST-{app_id}-{digitos(6)}-{secrets.token_hex(16)}-{digitos(9)}"


def chave_publica(prefixo: str = "TEST") -> str:
    return f"{prefixo}-{uuid.uuid4()}"


def modo(caminho: Path) -> int:
    return caminho.stat().st_mode & 0o777


def em_dict(campos: dict) -> dict[str, str]:
    """Os campos de um item como {nome: valor} (os de topo + os extras)."""
    d = {k: str(v) for k, v in campos.items() if k != "extras" and isinstance(v, (str, int))}
    d |= {e["nome"]: e["valor"] for e in campos.get("extras") or []}
    return d


def valores_dos_itens(itens: dict) -> set[str]:
    return {v for item in itens.values() for v in em_dict(item["campos"]).values() if v}


# ───────────────────────── o cofre, a Management API e o MP na memória ─────────────────────────


def aplicar_no_cofre(itens: dict, ferramenta: str, a: dict) -> tuple[bool, str]:
    """As 2 ferramentas do MCP do cofre que o script usa, com as regras dele (mcp/index.ts + normalizarItem): ler (ITEM_NAO_ENCONTRADO);
    salvar = cria, ou mescla só as chaves enviadas (null apaga; o tipo não muda); extras sem nome ou sem valor saem; login pede usuário
    ou senha. (O MCP falso por stdio roda esta mesma função.)"""
    if a.get("projeto") != PROJETO:
        return True, "PROJETO_NAO_ENCONTRADO: projeto"
    item = itens.get(a.get("nome"))
    if ferramenta == "ler_segredo":
        if item is None:
            return True, f"ITEM_NAO_ENCONTRADO: nenhum item \"{a.get('nome')}\" em {PROJETO}"
        return False, json.dumps({"id": "1", "nome": a["nome"], "tipo": item["tipo"], "campos": copy.deepcopy(item["campos"]),
                                  "arquivos": []})
    if ferramenta == "salvar_segredo":
        if item is not None and item["tipo"] != a["tipo"]:
            return True, f"TIPO_DIFERENTE: \"{a['nome']}\" é do tipo {item['tipo']}; o tipo não muda"
        campos = copy.deepcopy(item["campos"]) if item else {}
        for k, v in copy.deepcopy(a["campos"]).items():
            if v is None:
                campos.pop(k, None)
            else:
                campos[k] = v
        if "extras" in campos:
            campos["extras"] = [{"nome": str(e.get("nome") or "").strip(), "valor": str(e.get("valor") or "").strip(),
                                 "oculto": bool(e.get("oculto"))}
                                for e in campos["extras"] if str(e.get("nome") or "").strip() and str(e.get("valor") or "").strip()]
            if not campos["extras"]:
                del campos["extras"]
        if a["tipo"] == "login" and not (campos.get("usuario") or campos.get("senha")):
            return True, "VALIDACAO: Informe pelo menos o usuário ou a senha."
        if a["tipo"] == "token" and not campos.get("valor"):
            return True, "VALIDACAO: Informe o valor do token."
        itens[a["nome"]] = {"tipo": a["tipo"], "campos": campos}
        return False, json.dumps({"acao": "atualizado" if item else "criado", "nome": a["nome"], "campos": sorted(campos)})
    return True, "ERRO: ferramenta"


class CofreNaMemoria:
    def __init__(self) -> None:
        self.itens: dict[str, dict] = {}
        self.chamadas: list[tuple[str, str | None]] = []

    def ferramenta(self, nome: str, argumentos: dict) -> tuple[bool, str]:
        self.chamadas.append((nome, argumentos.get("nome")))
        return aplicar_no_cofre(self.itens, nome, argumentos)


class RemotoFalso:
    """A Management API (devolve só o digest, como a de verdade) e o cofre na memória."""

    def __init__(self) -> None:
        self.cofre = CofreNaMemoria()
        self.funcoes: dict[str, dict[str, str]] = {"principal": {}, "treino": {}}
        self.gravacoes: list[tuple[str, str, str]] = []

    def _mcp(self) -> CofreNaMemoria:
        return self.cofre

    def segredos(self, lado: str) -> dict[str, str]:
        return {n: S.sha256_hex(v) for n, v in self.funcoes[lado].items()}

    def gravar_segredo(self, lado: str, nome: str, valor: str) -> None:
        self.gravacoes.append(("POST", lado, nome))
        self.funcoes[lado][nome] = valor

    def fechar(self) -> None:
        pass


class RespostaFalsa:
    def __init__(self, corpo: bytes, status: int = 201) -> None:
        self.status, self._corpo = status, corpo

    def read(self) -> bytes:
        return self._corpo

    def __enter__(self) -> RespostaFalsa:
        return self

    def __exit__(self, *exc: object) -> bool:
        return False


class MpFalso:
    """O urlopen do POST /users/test: confere o método, a URL, o token de PRODUÇÃO no cabeçalho e o corpo; devolve um usuário de teste
    feito na hora — ou HTTP 400 no pedido de número `falhar_no` (0 = o 1º)."""

    def __init__(self, token: str, falhar_no: int | None = None) -> None:
        self.token, self.falhar_no = token, falhar_no
        self.pedidos: list[dict] = []
        self.criados: list[dict] = []

    def __call__(self, req, timeout=None):  # noqa: ANN001
        assert req.get_method() == "POST", "o pedido não é POST"
        assert req.full_url == "https://api.mercadopago.com/users/test", "a URL não é a do /users/test"
        assert req.get_header("Authorization") == f"Bearer {self.token}", "o cabeçalho não leva o token de produção"
        corpo = json.loads(req.data)
        assert corpo.get("site_id") == "MLB" and corpo.get("description"), "o corpo não tem site_id MLB e description"
        self.pedidos.append(corpo)
        if self.falhar_no == len(self.pedidos) - 1:
            raise urllib.error.HTTPError(req.full_url, 400, "Bad Request", None,  # type: ignore[arg-type]
                                         io.BytesIO(b'{"message":"test users limit reached","error":"bad_request","status":400}'))
        u = {"id": int(digitos(10)), "nickname": f"TESTUSER{digitos(10)}", "password": letras(10), "site_status": "active",
             "site_id": "MLB", "description": corpo["description"], "email": f"test_user_{digitos(10)}@testuser.com",
             "date_created": "2026-10-11T19:00:00.000-04:00", "date_last_updated": "2026-10-11T19:00:00.000-04:00"}
        self.criados.append(u)
        return RespostaFalsa(json.dumps(u).encode())

    def valores(self) -> set[str]:
        return {str(u[k]) for u in self.criados for k in ("id", "nickname", "password", "email")}


def sem_rede(*args: object, **kwargs: object) -> None:
    raise AssertionError("o script chamou o MP (POST /users/test) e não devia")


class Base(unittest.TestCase):
    def setUp(self) -> None:
        self.casa = tempfile.TemporaryDirectory()
        self.addCleanup(self.casa.cleanup)
        patcher = mock.patch.dict(os.environ, {"HOME": self.casa.name})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.r = RemotoFalso()
        self.app_id = digitos(16)
        self.tok = token_prod(self.app_id)
        self.sec = letras(32)

    def por_item_mp(self, extras: dict[str, str] | None = None, valor: str | None = None) -> None:
        """O item "Mercado Pago — PhysiqCalc" (tipo token): valor = o token de produção (ou outro) + notas + os extras."""
        campos: dict = {"valor": valor or self.tok, "notas": "importado da memória em 21/09: as credenciais da aplicação PhysiqCalc"}
        if extras:
            campos["extras"] = [{"nome": n, "valor": v, "oculto": True} for n, v in extras.items()]
        self.r.cofre.itens[M.ITEM] = {"tipo": "token", "campos": campos}

    def arquivo(self, nome: str) -> Path:
        return Path(self.casa.name) / nome

    def rodar(self, *args: str, mp: MpFalso | None = None) -> tuple[int, str]:
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf), mock.patch.object(M.urllib.request, "urlopen", mp or sem_rede):
            rc = M.main(list(args), remoto=self.r)  # type: ignore[arg-type]
        saida = buf.getvalue()
        self.sem_valor(saida, mp)
        return rc, saida

    def sem_valor(self, saida: str, mp: MpFalso | None = None, extras: set[str] | None = None) -> None:
        """Nenhum valor (nem o sha256 inteiro dele) na saída: os guardados pelo script, os do cofre, os das funções e os do MP."""
        conhecidos = (set(S._SENSIVEIS) | valores_dos_itens(self.r.cofre.itens) | set(self.r.funcoes["principal"].values())
                      | (mp.valores() if mp else set()) | (extras or set()))
        conhecidos = {v for v in conhecidos if len(v) >= M.GUARDAR_DESDE}  # curto não é segredo (e "2" aparece em "32 caracteres")
        conhecidos |= {S.sha256_hex(v) for v in conhecidos}
        self.assertTrue(conhecidos)
        for v in conhecidos:
            self.assertNotIn(v, saida)


def item_de_usuarios(com_codigo: bool = True) -> tuple[dict, dict[str, dict[str, str]]]:
    """Um item de usuários de teste como o script grava (login; o de topo = o vendedor) + o código que ele salva do painel."""
    us = {p: {"id": digitos(10), "usuario": f"TESTUSER{digitos(10)}", "email": f"test_user_{digitos(10)}@testuser.com",
              "senha": letras(10)} for p in M.PAPEIS}
    extras = [{"nome": f"{p}_{k}", "valor": v, "oculto": k == "senha"} for p, d in us.items() for k, v in d.items()]
    if com_codigo:
        us["vendedor"]["codigo"] = digitos(6)
        extras.append({"nome": "vendedor_codigo_verificacao", "valor": us["vendedor"]["codigo"], "oculto": True})
    v = us["vendedor"]
    return {"tipo": "login", "campos": {"usuario": v["usuario"], "senha": v["senha"], "url": "https://www.mercadopago.com.br",
                                        "extras": extras}}, us


# ───────────────────────── os testes ─────────────────────────


class RegrasPuras(unittest.TestCase):
    def test_tipo_de(self):
        app = digitos(16)
        casos = [
            ("valor", token_prod(app), "token de produção"),
            ("access_token_teste", token_teste(app), "token de teste"),
            ("public_key", chave_publica("APP_USR"), "chave pública"),
            ("public_key_teste", chave_publica("TEST"), "chave pública"),
            ("client_secret", letras(32), "client secret"),
            ("Client Secret", letras(32), "client secret"),
            ("Chave secreta", letras(32), "client secret"),
            ("assinatura secreta", secrets.token_hex(32), "assinatura dos avisos"),
            ("webhook_secret", secrets.token_hex(32), "assinatura dos avisos"),
            ("client_id", app, "client id"),
            ("ID da aplicação", app, "client id"),
            ("App ID", app, "client id"),
            ("notas", "texto livre sobre a aplicação", "outro"),
            ("client_secret", "curto", "outro"),
            ("User ID", digitos(9), "user id (a conta do MP)"),
            ("Webhook", "https://abcdefghijklmnopqrst.supabase.co/functions/v1/mp-webhook", "endereço"),  # o endereço, não a assinatura
            ("url", "https://www.mercadopago.com.br/developers/panel/app", "endereço"),
            ("Comprador de teste", f"test_user_{digitos(10)}@testuser.com", "e-mail"),
            ("Cartões de teste", "5031 4332 1540 6351", "outro"),
        ]
        for nome, valor, tipo in casos:
            with self.subTest(nome=nome):
                self.assertEqual(M.tipo_de(nome, valor), tipo)

    def test_cliente(self):
        app, sec = digitos(16), letras(32)
        self.assertEqual(M.cliente([("valor", token_prod(app)), ("client_secret", sec)]), (app, sec))
        self.assertEqual(M.cliente([("valor", token_teste(app))]), (app, None))  # o número da aplicação também está no token de teste
        outro = digitos(16)
        self.assertEqual(M.cliente([("valor", token_prod(app)), ("client_id", outro)]), (outro, None))  # o campo vale mais que o token
        self.assertEqual(M.cliente([("notas", f"client secret: {sec}")]), (None, None))  # texto livre nunca vira o secret
        self.assertEqual(M.cliente([("client_secret", sec), ("Client Secret", sec)])[1], sec)  # o mesmo valor 2 vezes: ok
        with self.assertRaises(S.Falha):  # 2 valores diferentes: o script não escolhe
            M.cliente([("client_secret", sec), ("secret_antigo", letras(32))])
        self.assertEqual(M.cliente([]), (None, None))


class CofreCampos(Base):
    def test_nomes_tipos_e_tamanho_sem_valor(self):
        pk = chave_publica()
        self.por_item_mp({"client_secret": self.sec, "public_key_teste": pk})
        rc, saida = self.rodar("cofre", "campos")
        self.assertEqual(rc, 0, saida)
        for nome, tipo, tam in (("valor", "token de produção", len(self.tok)), ("client_secret", "client secret", 32),
                                ("public_key_teste", "chave pública", len(pk))):
            self.assertIn(f"campo \"{nome}\": {tipo} · {tam} caracteres", saida)
        self.assertIn("campo \"notas\": outro", saida)
        self.assertIn("client id: achado (o 2º pedaço do token de produção; 16 dígitos)", saida)
        self.assertIn("client secret: achado (32 caracteres", saida)
        self.assertIn(f"\"{M.ITEM_USUARIOS}\": não existe", saida)
        self.assertIn(f"\"{M.ITEM_TESTE_APP}\": não existe", saida)
        self.assertEqual({n for n, _ in self.r.cofre.chamadas}, {"ler_segredo"})  # só leitura

    def test_sem_client_secret_sai_2(self):
        self.por_item_mp({"public_key": chave_publica("APP_USR"), "access_token_teste": token_teste(self.app_id)})
        rc, saida = self.rodar("cofre", "campos")
        self.assertEqual(rc, 2, saida)
        self.assertIn("client secret: NÃO achado — é o passo 5 da W2-a (FIM, dele)", saida)
        self.assertIn("client id: achado", saida)

    def test_texto_livre_so_conta_o_que_tem_dentro(self):
        self.por_item_mp()
        teste = token_teste(self.app_id)
        self.r.cofre.itens[M.ITEM]["campos"]["notas"] = f"Client Secret: {self.sec} | teste: {teste}"
        rc, saida = self.rodar("cofre", "campos", )
        self.sem_valor(saida, extras={self.sec, teste})
        self.assertEqual(rc, 2, saida)  # no texto livre não vale: tem de ser um campo
        self.assertIn("no texto: 1 token de teste, fala de \"secret\"", saida)

    def test_itens_da_w2_aparecem_so_pelos_nomes_dos_campos(self):
        self.por_item_mp({"client_secret": self.sec})
        self.r.cofre.itens[M.ITEM_USUARIOS] = item_de_usuarios()[0]
        rc, saida = self.rodar("cofre", "campos")
        self.assertEqual(rc, 0, saida)
        self.assertIn(f"\"{M.ITEM_USUARIOS}\": existe (tipo login; campos usuario, senha, url, vendedor_id", saida)

    def test_campo_client_id_diferente_do_token_avisa(self):
        self.por_item_mp({"Client ID": digitos(16), "Client Secret": self.sec})
        rc, saida = self.rodar("cofre", "campos")
        self.assertEqual(rc, 0, saida)
        self.assertIn("client id: achado (campo \"Client ID\"; 16 dígitos)", saida)
        self.assertIn("diferente do número da aplicação no token", saida)

    def test_nome_com_cara_de_valor_sai_so_com_o_tamanho(self):
        colado = letras(32)  # alguém colou o segredo no NOME do campo (o valor é outra coisa)
        self.por_item_mp({"client_secret": self.sec, colado: "anotado à mão", f"token {self.tok[:24]}": "idem"})
        rc, saida = self.rodar("cofre", "campos")
        self.sem_valor(saida, extras={colado, self.tok[:24]})
        self.assertEqual(rc, 0, saida)
        self.assertIn("campo ‹nome com cara de valor, 32 caracteres›: outro", saida)
        self.assertIn("campo ‹nome com cara de valor, 30 caracteres›: outro", saida)
        self.assertIn("campo \"client_secret\": client secret", saida)  # nome normal sai igual

    def test_campo_curto_nao_apaga_a_tela(self):
        self.por_item_mp({"client_secret": self.sec, "versao": "2", "ambiente": "teste"})
        rc, saida = self.rodar("cofre", "campos")
        self.assertEqual(rc, 0, saida)
        self.assertIn("campo \"client_secret\": client secret · 32 caracteres", saida)  # o "2" e o "teste" não viraram ‹oculto›
        self.assertIn("campo \"versao\": outro · 1 caractere\n", saida)

    def test_sem_o_item_sai_1(self):
        rc, saida = self.rodar("cofre", "campos")
        self.assertEqual(rc, 1, saida)
        self.assertIn(f"o item \"{M.ITEM}\" não existe", saida)

    def test_dois_secrets_diferentes_param(self):
        self.por_item_mp({"client_secret": self.sec, "client_secret_antigo": letras(32)})
        rc, saida = self.rodar("cofre", "campos")
        self.assertEqual(rc, 1, saida)
        self.assertIn("parecem client secret", saida)


class OauthLocal(Base):
    def test_grava_600_com_o_id_do_token(self):
        self.por_item_mp({"client_secret": self.sec})
        rc, saida = self.rodar("oauth", "local")
        self.assertEqual(rc, 0, saida)
        arq = self.arquivo(".physiq-mp-oauth.json")
        self.assertEqual(modo(arq), 0o600)
        self.assertEqual(json.loads(arq.read_text(encoding="utf-8")), {"client_id": self.app_id, "client_secret": self.sec})
        self.assertIn("client_id 16 dígitos, client_secret 32 caracteres", saida)
        self.assertIn(S.sha8(self.sec), saida)

    def test_o_campo_client_id_vale_mais_que_o_token(self):
        outro = digitos(16)
        self.por_item_mp({"client_id": outro, "client_secret": self.sec})
        self.assertEqual(self.rodar("oauth", "local")[0], 0)
        self.assertEqual(json.loads(self.arquivo(".physiq-mp-oauth.json").read_text(encoding="utf-8"))["client_id"], outro)

    def test_sem_client_secret_sai_2_e_nao_grava(self):
        self.por_item_mp({"public_key": chave_publica("APP_USR")})
        rc, saida = self.rodar("oauth", "local")
        self.assertEqual(rc, 2, saida)
        self.assertIn("sem o Client Secret no cofre (W2-a, passo 5)", saida)
        self.assertEqual(os.listdir(self.casa.name), [])

    def test_arquivo_antigo_aberto_vira_600(self):
        arq = self.arquivo(".physiq-mp-oauth.json")
        arq.write_text("{}", encoding="utf-8")
        arq.chmod(0o644)
        self.por_item_mp({"client_secret": self.sec})
        self.assertEqual(self.rodar("oauth", "local")[0], 0)
        self.assertEqual(modo(arq), 0o600)
        self.assertEqual(os.listdir(self.casa.name), [arq.name])  # nada de .novo sobrando


class OauthCopiarConferir(Base):
    def test_copiar_e_conferir(self):
        self.por_item_mp({"client_secret": self.sec})
        rc, saida = self.rodar("oauth", "copiar")
        self.assertEqual(rc, 0, saida)
        self.assertEqual(self.r.funcoes["principal"], {"MP_CLIENT_ID": self.app_id, "MP_CLIENT_SECRET": self.sec})
        self.assertEqual(sorted(self.r.gravacoes), [("POST", "principal", "MP_CLIENT_ID"), ("POST", "principal", "MP_CLIENT_SECRET")])
        self.assertIn("MP_CLIENT_SECRET nas funções do principal = o cofre", saida)
        self.assertEqual(self.r.funcoes["treino"], {})
        rc, saida = self.rodar("oauth", "conferir")
        self.assertEqual(rc, 0, saida)
        self.assertEqual(len(self.r.gravacoes), 2)  # o conferir não grava

    def test_os_staging_so_com_o_item_da_aplicacao_de_teste(self):
        self.por_item_mp({"client_secret": self.sec})
        tid, tsec = digitos(16), letras(32)
        self.r.cofre.itens[M.ITEM_TESTE_APP] = {"tipo": "token", "campos": {"valor": tsec, "extras": [
            {"nome": "client_id", "valor": tid, "oculto": False}, {"nome": "client_secret", "valor": tsec, "oculto": True}]}}
        rc, saida = self.rodar("oauth", "copiar")
        self.assertEqual(rc, 0, saida)
        self.assertEqual(self.r.funcoes["principal"], {"MP_CLIENT_ID": self.app_id, "MP_CLIENT_SECRET": self.sec,
                                                       "MP_CLIENT_ID_STAGING": tid, "MP_CLIENT_SECRET_STAGING": tsec})

    def test_item_de_teste_sem_o_par_fica_de_fora(self):
        self.por_item_mp({"client_secret": self.sec})
        self.r.cofre.itens[M.ITEM_TESTE_APP] = {"tipo": "token", "campos": {"valor": letras(32)}}
        rc, saida = self.rodar("oauth", "copiar")
        self.assertEqual(rc, 0, saida)
        self.assertEqual(set(self.r.funcoes["principal"]), {"MP_CLIENT_ID", "MP_CLIENT_SECRET"})
        self.assertIn("os _STAGING ficam de fora", saida)

    def test_conferir_acusa_o_que_nao_bate(self):
        self.por_item_mp({"client_secret": self.sec})
        self.assertEqual(self.rodar("oauth", "copiar")[0], 0)
        self.r.funcoes["principal"]["MP_CLIENT_SECRET"] = letras(32)
        rc, saida = self.rodar("oauth", "conferir")
        self.assertEqual(rc, 1, saida)
        self.assertIn("MP_CLIENT_SECRET nas funções do principal DIFERENTE do cofre", saida)
        del self.r.funcoes["principal"]["MP_CLIENT_ID"]
        rc, saida = self.rodar("oauth", "conferir")
        self.assertEqual(rc, 1, saida)
        self.assertIn("MP_CLIENT_ID nas funções do principal não existe", saida)

    def test_sem_client_secret_nao_grava_e_sai_2(self):
        self.por_item_mp()
        for sub in ("copiar", "conferir"):
            rc, saida = self.rodar("oauth", sub)
            self.assertEqual(rc, 2, saida)
            self.assertIn("sem o Client Secret no cofre (W2-a, passo 5)", saida)
        self.assertEqual(self.r.gravacoes, [])

    def test_erro_da_api_que_ecoa_o_valor_sai_limpo(self):
        self.por_item_mp({"client_secret": self.sec})

        def eco(lado: str, nome: str, valor: str) -> None:  # um erro da API que repete o pedido (valor e hash) na mensagem
            raise S.Falha(f"POST …/secrets: HTTP 400 {{'name': '{nome}', 'value': '{valor}', 'h': '{S.sha256_hex(valor)}'}}")

        self.r.gravar_segredo = eco  # type: ignore[method-assign]
        rc, saida = self.rodar("oauth", "copiar")
        self.assertEqual(rc, 1)
        self.assertIn("HTTP 400", saida)
        self.assertIn("‹oculto›", saida)


class UsuariosTeste(Base):
    def test_ja_no_cofre_so_os_arquivos(self):
        self.por_item_mp({"client_secret": self.sec})
        self.r.cofre.itens[M.ITEM_USUARIOS], us = item_de_usuarios()
        rc, saida = self.rodar("usuarios-teste", "criar")  # sem_rede: nenhum POST
        self.assertEqual(rc, 0, saida)
        self.assertIn("os usuários de teste já estão no cofre: só os 2 arquivos (nenhum POST /users/test)", saida)
        for p in M.PAPEIS:
            arq = self.arquivo(f".physiq-mp-{p}-teste.json")
            self.assertEqual(modo(arq), 0o600)
            d = us[p]
            esperado = {"id": d["id"], "nickname": d["usuario"], "email": d["email"], "password": d["senha"]}
            if p == "vendedor":
                esperado["codigo_verificacao"] = d["codigo"]
            self.assertEqual(json.loads(arq.read_text(encoding="utf-8")), esperado)
        self.assertNotIn("salvar_segredo", {n for n, _ in self.r.cofre.chamadas})

    def test_cria_os_2_com_o_token_de_producao(self):
        self.por_item_mp({"client_secret": self.sec, "access_token_teste": token_teste(self.app_id)})
        mp = MpFalso(self.tok)  # confere o "Bearer <token de produção>" (o de teste também está no item)
        rc, saida = self.rodar("usuarios-teste", "criar", mp=mp)
        self.assertEqual(rc, 0, saida)
        self.assertEqual([p["description"] for p in mp.pedidos], ["Physiq W2 vendedor", "Physiq W2 comprador"])
        item = self.r.cofre.itens[M.ITEM_USUARIOS]
        self.assertEqual(item["tipo"], "login")
        c = em_dict(item["campos"])
        v, comp = mp.criados
        self.assertEqual((c["usuario"], c["senha"]), (v["nickname"], v["password"]))  # o login de topo = o vendedor
        self.assertIn("notas", c)
        for p, u in (("vendedor", v), ("comprador", comp)):
            self.assertEqual((c[f"{p}_id"], c[f"{p}_usuario"], c[f"{p}_email"], c[f"{p}_senha"]),
                             (str(u["id"]), u["nickname"], u["email"], u["password"]))
            arq = self.arquivo(f".physiq-mp-{p}-teste.json")
            self.assertEqual(modo(arq), 0o600)
            self.assertEqual(json.loads(arq.read_text(encoding="utf-8")),
                             {"id": str(u["id"]), "nickname": u["nickname"], "email": u["email"], "password": u["password"]})
            self.assertIn(f"{p}: criado no MP (id com 10 dígitos) | chaves da resposta [", saida)
            self.assertIn(f"o {p} gravado e lido de volta igual", saida)
        self.assertIn("'nickname'", saida)  # os NOMES das chaves da resposta aparecem; os valores, não (sem_valor)
        senhas = [e for e in item["campos"]["extras"] if e["nome"].endswith("_senha")]
        self.assertTrue(senhas and all(e["oculto"] for e in senhas))

    def test_sem_token_de_producao_sai_2_sem_post(self):
        self.por_item_mp({"client_secret": self.sec}, valor=token_teste(self.app_id))
        rc, saida = self.rodar("usuarios-teste", "criar")  # sem_rede
        self.assertEqual(rc, 2, saida)
        self.assertIn("sem o token de produção no cofre: os usuários de teste vão para o FIM (W2-a, passo 7)", saida)
        self.assertNotIn(M.ITEM_USUARIOS, self.r.cofre.itens)

    def test_o_2o_post_falha_e_o_1o_nao_se_perde(self):
        self.por_item_mp({"client_secret": self.sec})
        mp = MpFalso(self.tok, falhar_no=1)
        rc, saida = self.rodar("usuarios-teste", "criar", mp=mp)
        self.assertEqual(rc, 1, saida)
        self.assertIn("POST /users/test (comprador): HTTP 400", saida)
        (v,) = mp.criados
        c = em_dict(self.r.cofre.itens[M.ITEM_USUARIOS]["campos"])
        self.assertEqual(c["vendedor_id"], str(v["id"]))  # o MP não apaga usuário de teste: o 1º já está no cofre
        self.assertNotIn("comprador_id", c)
        self.assertEqual(modo(self.arquivo(".physiq-mp-vendedor-teste.json")), 0o600)
        # ele salva o código do painel (W2-a, passo 7) e roda de novo: só o comprador é criado; o vendedor e o código ficam
        codigo = digitos(6)
        self.r.cofre.itens[M.ITEM_USUARIOS]["campos"]["extras"].append(
            {"nome": "vendedor_codigo_verificacao", "valor": codigo, "oculto": True})
        mp2 = MpFalso(self.tok)
        rc, saida = self.rodar("usuarios-teste", "criar", mp=mp2)
        self.assertEqual(rc, 0, saida)
        self.assertEqual([p["description"] for p in mp2.pedidos], ["Physiq W2 comprador"])
        c = em_dict(self.r.cofre.itens[M.ITEM_USUARIOS]["campos"])
        self.assertEqual((c["vendedor_id"], c["vendedor_codigo_verificacao"], c["comprador_id"]),
                         (str(v["id"]), codigo, str(mp2.criados[0]["id"])))
        vend = json.loads(self.arquivo(".physiq-mp-vendedor-teste.json").read_text(encoding="utf-8"))
        self.assertEqual((vend["id"], vend["codigo_verificacao"]), (str(v["id"]), codigo))

    def test_item_de_outro_tipo_para_antes_do_post(self):
        self.por_item_mp({"client_secret": self.sec})
        self.r.cofre.itens[M.ITEM_USUARIOS] = {"tipo": "nota", "campos": {"texto": "vendedor e comprador anotados à mão no painel"}}
        rc, saida = self.rodar("usuarios-teste", "criar")  # sem_rede: nenhum POST
        self.assertEqual(rc, 1, saida)
        self.assertIn("tipo nota, não login", saida)

    def test_login_de_topo_cobre_o_vendedor_feito_pelo_painel(self):
        self.por_item_mp({"client_secret": self.sec})
        usuario, senha, cid = f"TESTUSER{digitos(10)}", letras(10), digitos(10)
        self.r.cofre.itens[M.ITEM_USUARIOS] = {"tipo": "login", "campos": {"usuario": usuario, "senha": senha, "extras": [
            {"nome": "vendedor_id", "valor": digitos(10), "oculto": False},
            {"nome": "comprador_id", "valor": cid, "oculto": False}, {"nome": "comprador_usuario", "valor": f"TESTUSER{digitos(10)}"},
            {"nome": "comprador_senha", "valor": letras(10), "oculto": True}]}}
        rc, saida = self.rodar("usuarios-teste", "criar")  # sem_rede
        self.assertEqual(rc, 0, saida)
        vend = json.loads(self.arquivo(".physiq-mp-vendedor-teste.json").read_text(encoding="utf-8"))
        self.assertEqual((vend["nickname"], vend["password"]), (usuario, senha))

    def test_faltando_dado_grava_o_que_tem_e_acusa(self):
        self.por_item_mp({"client_secret": self.sec})
        self.r.cofre.itens[M.ITEM_USUARIOS] = {"tipo": "login", "campos": {"usuario": f"TESTUSER{digitos(10)}", "extras": [
            {"nome": "comprador_usuario", "valor": f"TESTUSER{digitos(10)}"}, {"nome": "comprador_senha", "valor": letras(10)}]}}
        rc, saida = self.rodar("usuarios-teste", "criar")  # sem_rede: os 2 existem (o vendedor pelo login de topo)
        self.assertEqual(rc, 1, saida)
        self.assertIn("faltam ['id', 'password']", saida)
        self.assertEqual(modo(self.arquivo(".physiq-mp-vendedor-teste.json")), 0o600)


class DryRun(Base):
    def test_nada_gravado(self):
        self.por_item_mp({"client_secret": self.sec})
        antes = copy.deepcopy(self.r.cofre.itens)
        for args in (("oauth", "local", "--dry-run"), ("oauth", "copiar", "--dry-run"), ("usuarios-teste", "criar", "--dry-run"),
                     ("usuarios-teste", "criar", "--seco")):
            rc, saida = self.rodar(*args)  # sem_rede: nenhum POST
            self.assertEqual(rc, 0, f"{args}:\n{saida}")
            self.assertIn("--dry-run", saida)
        self.assertIn("criaria 2 usuário(s) de teste (vendedor, comprador)", saida)
        self.assertEqual(self.r.cofre.itens, antes)
        self.r.cofre.itens[M.ITEM_USUARIOS] = item_de_usuarios()[0]  # o ramo "já no cofre"
        antes = copy.deepcopy(self.r.cofre.itens)
        rc, saida = self.rodar("usuarios-teste", "criar", "--dry-run")
        self.assertEqual(rc, 0, saida)
        self.assertIn("--dry-run: gravaria ~/.physiq-mp-vendedor-teste.json (600)", saida)
        self.assertEqual(self.r.cofre.itens, antes)
        self.assertEqual(self.r.gravacoes, [])
        self.assertEqual(os.listdir(self.casa.name), [])
        self.assertNotIn("salvar_segredo", {n for n, _ in self.r.cofre.chamadas})

    def test_comando_desconhecido(self):
        for args in (["chave", "gerar"], ["oauth", "apagar"], ["cofre"], ["usuarios-teste", "apagar"]):
            erro = io.StringIO()
            with self.subTest(args=args), contextlib.redirect_stderr(erro), self.assertRaises(SystemExit) as fim:
                M.argumentos(args)
            self.assertEqual(fim.exception.code, 2)


MCP_FALSO = ("import copy, json, os, sys\nPROJETO = 'PhysiqCalc'\n\n\n" + textwrap.dedent(inspect.getsource(aplicar_no_cofre))
             + textwrap.dedent('''

    caminho = os.environ["MCP_FALSO_ITENS"]
    def saida(obj):
        sys.stdout.write(json.dumps(obj) + "\\n")
        sys.stdout.flush()
    for linha in sys.stdin:
        m = json.loads(linha)
        if "id" not in m:
            continue
        saida({"jsonrpc": "2.0", "method": "notifications/message", "params": {"level": "info"}})  # ruído antes da resposta
        if m["method"] == "initialize":
            saida({"jsonrpc": "2.0", "id": m["id"], "result": {"protocolVersion": "2024-11-05", "capabilities": {}}})
            continue
        with open(caminho, encoding="utf-8") as f:
            itens = json.load(f)
        erro, texto = aplicar_no_cofre(itens, m["params"]["name"], m["params"]["arguments"])
        with open(caminho, "w", encoding="utf-8") as f:
            json.dump(itens, f)
        r = {"content": [{"type": "text", "text": texto}]}
        if erro:
            r["isError"] = True
        saida({"jsonrpc": "2.0", "id": m["id"], "result": r})
'''))


class RemotoPorStdio(S.Remoto):
    """O Remoto de verdade no cofre (o MCP por stdio); a Management API na memória."""

    def __init__(self) -> None:
        super().__init__()
        self.f = RemotoFalso()
        for nome in ("segredos", "gravar_segredo"):
            setattr(self, nome, getattr(self.f, nome))


class CofrePorStdio(Base):
    def setUp(self) -> None:
        super().setUp()
        fora = tempfile.TemporaryDirectory()  # fora da casa: a casa só pode ter os arquivos do script
        self.addCleanup(fora.cleanup)
        mcp = Path(fora.name) / "mcp_falso.py"
        mcp.write_text(MCP_FALSO, encoding="utf-8")
        self.itens = Path(fora.name) / "itens.json"
        patcher = mock.patch.dict(os.environ, {"PHYSIQ_COFRE_NODE": sys.executable, "PHYSIQ_COFRE_MCP": str(mcp),
                                               "MCP_FALSO_ITENS": str(self.itens)})
        patcher.start()
        self.addCleanup(patcher.stop)

    def rodar_stdio(self, *args: str, mp: MpFalso | None = None) -> tuple[int, str]:
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf), mock.patch.object(M.urllib.request, "urlopen", mp or sem_rede):
            rc = M.main(list(args), remoto=RemotoPorStdio())
        saida = buf.getvalue()
        self.sem_valor(saida, mp, valores_dos_itens(json.loads(self.itens.read_text(encoding="utf-8"))))
        return rc, saida

    def test_campos_e_usuarios_pelo_mcp(self):
        pk = chave_publica()
        self.itens.write_text(json.dumps({M.ITEM: {"tipo": "token", "campos": {"valor": self.tok, "notas": "credenciais da PhysiqCalc",
                                                                               "extras": [
            {"nome": "client_secret", "valor": self.sec, "oculto": True}, {"nome": "public_key_teste", "valor": pk, "oculto": False}]}}}),
            encoding="utf-8")
        rc, saida = self.rodar_stdio("cofre", "campos")
        self.assertEqual(rc, 0, saida)
        self.assertIn("campo \"client_secret\": client secret · 32 caracteres", saida)
        self.assertIn("campo \"public_key_teste\": chave pública", saida)
        mp = MpFalso(self.tok)
        rc, saida = self.rodar_stdio("usuarios-teste", "criar", mp=mp)
        self.assertEqual(rc, 0, saida)
        self.assertEqual(len(mp.pedidos), 2)
        item = json.loads(self.itens.read_text(encoding="utf-8"))[M.ITEM_USUARIOS]
        self.assertEqual(item["tipo"], "login")
        self.assertEqual(em_dict(item["campos"])["comprador_id"], str(mp.criados[1]["id"]))
        for p in M.PAPEIS:
            self.assertEqual(modo(self.arquivo(f".physiq-mp-{p}-teste.json")), 0o600)
        rc, saida = self.rodar_stdio("usuarios-teste", "criar")  # 2ª vez: só os arquivos (sem_rede)
        self.assertEqual(rc, 0, saida)
        self.assertIn("já estão no cofre", saida)
        rc, saida = self.rodar_stdio("oauth", "local")
        self.assertEqual(rc, 0, saida)
        self.assertEqual(json.loads(self.arquivo(".physiq-mp-oauth.json").read_text(encoding="utf-8")),
                         {"client_id": self.app_id, "client_secret": self.sec})


if __name__ == "__main__":
    unittest.main()
