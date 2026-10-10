#!/usr/bin/env python3
"""Testes do servidor.py sem rede: a Management API, o Vault e o cofre na memória, e o cliente do cofre (JSON-RPC por stdio)
falando com um MCP falso. Valores falsos feitos na hora; nenhum deles pode aparecer na saída.
Rodar:  PYTHONDONTWRITEBYTECODE=1 python3 -m unittest scripts/segredos/test_servidor.py"""
from __future__ import annotations

import contextlib
import copy
import io
import os
import sys
import tempfile
import textwrap
import time
import unittest
from pathlib import Path
from unittest import mock

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import servidor as S  # noqa: E402

LEGADO_FALSO = S.valor_novo()


class RemotoFalso:
    """Guarda os VALORES, mas devolve só o que a API de verdade devolve (o digest dos segredos; do Vault, só bate/tamanho)."""

    def __init__(self, legado: bool = True) -> None:
        self.funcoes: dict[str, dict[str, str]] = {"principal": {}, "treino": {}}
        self.vault: dict[str, str] = {}
        if legado:
            for lado in self.funcoes:
                self.funcoes[lado][S.LEGADO] = LEGADO_FALSO
            self.vault[S.VAULT_LEGADO] = LEGADO_FALSO
        self.itens: dict[str, dict] = {}
        self.gravacoes: list[tuple] = []

    def segredos(self, lado):
        return {n: S.sha256_hex(v) for n, v in self.funcoes[lado].items()}

    def gravar_segredo(self, lado, nome, valor):
        self.gravacoes.append(("POST", lado, nome))
        self.funcoes[lado][nome] = valor

    def apagar_segredos(self, lado, nomes):
        self.gravacoes.append(("DELETE", lado, tuple(nomes)))
        for n in nomes:
            self.funcoes[lado].pop(n, None)

    def vault_estado(self, nome, hashes):
        v = self.vault.get(nome)
        if v is None:
            return False, [False] * len(hashes), None
        return True, [S.sha256_hex(v) == h for h in hashes], len(v)

    def vault_existe(self, nome):
        return nome in self.vault

    def vault_gravar(self, nome, valor):
        self.gravacoes.append(("VAULT", nome))
        self.vault[nome] = valor

    def vault_apagar(self, nome):
        self.gravacoes.append(("VAULT-DEL", nome))
        self.vault.pop(nome, None)

    def cofre_ler(self, item):
        campos = copy.deepcopy(self.itens.get(item))
        if campos is not None:
            S.valores(campos)
        return campos

    def cofre_salvar(self, item, campos):  # a mesma mescla do salvar_segredo do MCP: só as chaves enviadas mudam
        self.gravacoes.append(("COFRE", item))
        atual = self.itens.setdefault(item, {})
        for k, v in copy.deepcopy(campos).items():
            if v is None:
                atual.pop(k, None)
            else:
                atual[k] = v

    def fechar(self):
        pass

    def todos_os_valores(self) -> set[str]:
        vals = {v for lado in self.funcoes.values() for v in lado.values()} | set(self.vault.values())
        for c in self.itens.values():
            vals.add(c.get("valor", ""))
            vals |= {e.get("valor", "") for e in c.get("extras") or []}
        return {v for v in vals if v}


class Base(unittest.TestCase):
    def setUp(self) -> None:
        self.casa = tempfile.TemporaryDirectory()
        self.addCleanup(self.casa.cleanup)
        patcher = mock.patch.dict(os.environ, {"HOME": self.casa.name})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.r = RemotoFalso()

    def rodar(self, *args: str, remoto: object = None) -> tuple[int, str]:
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = S.main(list(args), remoto=remoto or self.r)  # type: ignore[arg-type]
        saida = buf.getvalue()
        self.sem_valor(saida)
        return rc, saida

    def sem_valor(self, saida: str) -> None:
        """Nenhum valor (nem o sha256 inteiro dele) na saída: os guardados pelo script e os que o falso tem."""
        conhecidos = set(S._SENSIVEIS) | self.r.todos_os_valores() | {S.sha256_hex(v) for v in self.r.todos_os_valores()}
        self.assertTrue(conhecidos)
        for v in conhecidos:
            self.assertNotIn(v, saida)

    def valor(self, f: S.Finalidade) -> str:
        return self.r.itens[f.item]["valor"]

    def anterior(self, f: S.Finalidade) -> str | None:
        return S.valores(self.r.itens[f.item])[1]

    def ciclo(self, chave: str) -> None:
        for sub in ("gerar", "aceitar", "trocar"):
            rc, saida = self.rodar(chave, sub)
            self.assertEqual(rc, 0, f"{chave} {sub}:\n{saida}")


class RegrasPuras(unittest.TestCase):
    def test_valor_novo(self):
        a, b = S.valor_novo(), S.valor_novo()
        self.assertEqual(len(a), 64)
        self.assertTrue(S.FORMATO.fullmatch(a))
        self.assertNotEqual(a, b)

    def test_lista_e_formas(self):
        a, p = S.valor_novo(), S.valor_novo()
        self.assertEqual(S.lista_de(a), S.sha256_hex(a))
        self.assertEqual(S.lista_de(a, p), f"{S.sha256_hex(a)},{S.sha256_hex(p)}")
        self.assertEqual(S.lista_de(a, a), S.sha256_hex(a))
        self.assertRegex(S.lista_de(a, p), r"^[0-9a-f]{64},[0-9a-f]{64}$")
        formas = S.formas_da_lista(a, p)
        self.assertIn(S.sha256_hex(S.lista_de(a)), formas)
        self.assertIn(S.sha256_hex(S.lista_de(a, p)), formas)
        self.assertIn(S.sha256_hex(f"{S.sha256_hex(p)},{S.sha256_hex(a)}"), formas)
        self.assertNotIn(S.sha256_hex(S.sha256_hex(p)), formas)  # só o anterior não aceita o atual

    def test_sql_do_vault(self):
        a = S.valor_novo()
        estado = S.sql_vault_estado("physiq_espelho_fila_segredo", [S.sha256_hex(a)])
        self.assertNotIn(a, estado)  # a conferência manda só o hash
        self.assertIn("sha256(convert_to(s.decrypted_secret, 'UTF8'))", estado)
        self.assertIn(f"'{a}'", S.sql_vault_criar(a, "physiq_espelho_fila_segredo"))
        for ruim in (lambda: S.sql_vault_criar("curto'; drop table x; --", "n"),
                     lambda: S.sql_vault_estado("n'; --", [S.sha256_hex(a)]),
                     lambda: S.sql_vault_estado("n", ["nao-e-hash"]),
                     lambda: S.sql_vault_atualizar("x", a)):
            with self.assertRaises(ValueError):
                ruim()

    def test_campos_do_gerar_mantem_os_outros_extras(self):
        a, n = S.valor_novo(), S.valor_novo()
        campos = {"valor": a, "extras": [{"nome": "outro", "valor": "x", "oculto": False},
                                         {"nome": "anterior", "valor": S.valor_novo(), "oculto": True}]}
        g = S.campos_do_gerar(campos, n, "nota")
        self.assertEqual(g["valor"], n)
        self.assertEqual([e["nome"] for e in g["extras"]], ["outro", "anterior"])
        self.assertEqual(g["extras"][1]["valor"], a)
        self.assertNotIn("notas", g)
        self.assertEqual(S.campos_do_gerar(None, n, "nota"), {"valor": n, "notas": "nota"})


class Fluxos(Base):
    def test_troca_completa_s7(self):
        f = S.FINALIDADES["aviso_erro"]
        self.ciclo("aviso_erro")
        atual = self.valor(f)
        self.assertIsNone(self.anterior(f))
        self.assertEqual(self.r.funcoes["principal"][f.lista], S.sha256_hex(atual))
        self.assertEqual(self.r.funcoes["treino"][f.segredo], atual)
        rc, saida = self.rodar("aviso_erro", "conferir")
        self.assertEqual(rc, 0, saida)
        self.assertIn("só o atual", saida)
        self.assertIn(S.sha8(atual), saida)

    def test_trocar_sem_a_lista_para_sem_gravar(self):
        f = S.FINALIDADES["espelho_resumo"]
        self.rodar("espelho_resumo", "gerar")
        rc, saida = self.rodar("espelho_resumo", "trocar")
        self.assertEqual(rc, 1)
        self.assertNotIn(f.segredo, self.r.funcoes["treino"])
        self.assertIn("Nada mudou", saida)

    def test_segunda_troca_com_o_anterior(self):
        f = S.FINALIDADES["ponte_calc"]
        self.ciclo("ponte_calc")
        velho = self.valor(f)
        self.assertEqual(self.rodar("ponte_calc", "gerar")[0], 0)
        novo = self.valor(f)
        self.assertEqual(self.anterior(f), velho)
        self.assertEqual(self.rodar("ponte_calc", "aceitar")[0], 0)
        self.assertEqual(self.r.funcoes["treino"][f.lista], S.lista_de(novo, velho))
        rc, _ = self.rodar("ponte_calc", "aceitar", "--so-atual")  # o emissor ainda manda o velho
        self.assertEqual(rc, 1)
        self.assertEqual(self.r.funcoes["treino"][f.lista], S.lista_de(novo, velho))
        self.assertEqual(self.rodar("ponte_calc", "trocar")[0], 0)
        rc, saida = self.rodar("ponte_calc", "conferir")
        self.assertEqual(rc, 0, saida)
        self.assertIn("atual + anterior", saida)
        self.assertEqual(self.rodar("ponte_calc", "aceitar", "--so-atual")[0], 0)
        self.assertEqual(self.r.funcoes["treino"][f.lista], S.sha256_hex(novo))
        self.assertIn("só o atual", self.rodar("ponte_calc", "conferir")[1])

    def test_gerar_duas_vezes_sem_trocar_e_recusado(self):
        f = S.FINALIDADES["conta_treino"]
        self.ciclo("conta_treino")
        self.assertEqual(self.rodar("conta_treino", "gerar")[0], 0)
        em_uso = self.anterior(f)
        rc, saida = self.rodar("conta_treino", "gerar")
        self.assertEqual(rc, 1, saida)
        self.assertEqual(self.anterior(f), em_uso)  # o valor em uso continua no cofre
        self.assertEqual(self.rodar("conta_treino", "gerar", "--forcar")[0], 0)

    def test_tirar_lista_e_tirar(self):
        f = S.FINALIDADES["repasse_convites"]
        self.ciclo("repasse_convites")
        rc, _ = self.rodar("repasse_convites", "tirar-lista")
        self.assertEqual(rc, 1)
        self.assertIn(f.lista, self.r.funcoes["principal"])
        self.assertEqual(self.rodar("repasse_convites", "tirar")[0], 0)
        self.assertNotIn(f.segredo, self.r.funcoes["treino"])
        self.assertEqual(self.rodar("repasse_convites", "tirar-lista")[0], 0)
        self.assertNotIn(f.lista, self.r.funcoes["principal"])
        self.assertEqual(self.rodar("repasse_convites", "tirar")[0], 0)  # de novo: nada a fazer

    def test_tirar_sem_legado_e_recusado(self):
        self.r = RemotoFalso(legado=False)
        self.ciclo("repasse_vinculo")
        rc, saida = self.rodar("repasse_vinculo", "tirar")
        self.assertEqual(rc, 1, saida)
        self.assertIn(S.FINALIDADES["repasse_vinculo"].segredo, self.r.funcoes["treino"])
        self.assertEqual(self.rodar("repasse_vinculo", "tirar", "--forcar")[0], 0)

    def test_conferir_acusa_emissor_diferente(self):
        f = S.FINALIDADES["espelho_nucleo"]
        self.ciclo("espelho_nucleo")
        self.r.funcoes["principal"][f.segredo] = S.valor_novo()
        rc, saida = self.rodar("espelho_nucleo", "conferir")
        self.assertEqual(rc, 1)
        self.assertIn("≠ sha256(atual)", saida)

    def test_s8_vault_e_copia_local(self):
        f = S.FINALIDADES["espelho_fila"]
        self.assertEqual(self.rodar("espelho_fila", "gerar")[0], 0)
        atual = self.valor(f)
        arq = Path(self.casa.name) / ".physiq-segredo-espelho-fila"
        self.assertEqual(arq.read_text(encoding="utf-8"), atual)
        self.assertEqual(arq.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.rodar("espelho_fila", "trocar")[0], 1)  # sem a lista
        self.assertNotIn(f.vault, self.r.vault)
        self.assertEqual(self.rodar("espelho_fila", "aceitar")[0], 0)
        self.assertEqual(self.r.funcoes["principal"][f.lista], S.sha256_hex(atual))
        self.assertEqual(self.rodar("espelho_fila", "trocar")[0], 0)
        self.assertEqual(self.r.vault[f.vault], atual)
        rc, saida = self.rodar("espelho_fila", "conferir")
        self.assertEqual(rc, 0, saida)
        self.assertIn("igual ao cofre", saida)
        self.assertEqual(self.rodar("espelho_fila", "tirar-lista")[0], 1)  # o Vault novo ainda manda
        self.assertEqual(self.rodar("espelho_fila", "tirar")[0], 0)
        self.assertNotIn(f.vault, self.r.vault)
        self.assertIn(S.VAULT_LEGADO, self.r.vault)

    def test_erro_da_api_que_ecoa_o_valor_sai_limpo(self):
        self.rodar("aviso_erro", "gerar")
        self.rodar("aviso_erro", "aceitar")

        def eco(lado, nome, valor):  # um erro da API que repete o pedido (valor e hash) na mensagem
            raise S.Falha(f"POST …/secrets: HTTP 400 {{'name': '{nome}', 'value': '{valor}', 'h': '{S.sha256_hex(valor)}'}}")

        self.r.gravar_segredo = eco  # type: ignore[method-assign]
        rc, saida = self.rodar("aviso_erro", "trocar")
        self.assertEqual(rc, 1)
        self.assertIn("HTTP 400", saida)
        self.assertIn("‹oculto›", saida)

    def test_dry_run_nao_cria_o_remoto(self):
        with mock.patch.object(S, "Remoto", side_effect=AssertionError("o dry-run criou o Remoto")):
            for chave in S.FINALIDADES:
                for sub in S.SUBCOMANDOS:
                    with contextlib.redirect_stdout(io.StringIO()):
                        self.assertEqual(S.main([chave, sub, "--dry-run"]), 0)


MCP_FALSO = textwrap.dedent('''
    import json, sys
    itens = {}
    def saida(obj):
        sys.stdout.write(json.dumps(obj) + "\\n"); sys.stdout.flush()
    def texto(obj, erro=False):
        r = {"content": [{"type": "text", "text": obj if isinstance(obj, str) else json.dumps(obj)}]}
        if erro: r["isError"] = True
        return r
    for linha in sys.stdin:
        m = json.loads(linha)
        if "id" not in m:
            continue
        saida({"jsonrpc": "2.0", "method": "notifications/message", "params": {"level": "info"}})  # ruído antes da resposta
        if m["method"] == "initialize":
            saida({"jsonrpc": "2.0", "id": m["id"], "result": {"protocolVersion": "2024-11-05", "capabilities": {}}})
            continue
        nome, a = m["params"]["name"], m["params"]["arguments"]
        if a.get("nome") == "MUDO":
            continue
        if a.get("projeto") != "PhysiqCalc":
            r = texto("PROJETO_NAO_ENCONTRADO: projeto", True)
        elif a.get("nome") == "AMBIGUO":
            r = texto("AMBIGUO: há 2 itens", True)
        elif nome == "ler_segredo":
            c = itens.get(a["nome"])
            r = (texto(f"ITEM_NAO_ENCONTRADO: nenhum item {a['nome']!r}", True) if c is None
                 else texto({"id": "1", "nome": a["nome"], "tipo": "token", "campos": c, "arquivos": []}))
        elif nome == "salvar_segredo":
            atual = itens.setdefault(a["nome"], {})
            for k, v in a["campos"].items():
                if v is None: atual.pop(k, None)
                else: atual[k] = v
            r = texto({"acao": "salvo", "nome": a["nome"], "campos": sorted(atual)})
        else:
            r = texto("ERRO: ferramenta", True)
        saida({"jsonrpc": "2.0", "id": m["id"], "result": r})
''')


class CofreRemotoFalso(S.Remoto):
    """O Remoto de verdade no cofre (o MCP por stdio); a Management API e o Vault na memória."""

    def __init__(self) -> None:
        super().__init__()
        self.f = RemotoFalso()
        for nome in ("segredos", "gravar_segredo", "apagar_segredos", "vault_estado", "vault_existe", "vault_gravar", "vault_apagar"):
            setattr(self, nome, getattr(self.f, nome))


class CofrePorStdio(Base):
    def setUp(self) -> None:
        super().setUp()
        mcp = Path(self.casa.name) / "mcp_falso.py"
        mcp.write_text(MCP_FALSO, encoding="utf-8")
        patcher = mock.patch.dict(os.environ, {"PHYSIQ_COFRE_NODE": sys.executable, "PHYSIQ_COFRE_MCP": str(mcp)})
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_ler_e_salvar(self):
        r = CofreRemotoFalso()
        self.addCleanup(r.fechar)
        self.assertIsNone(r.cofre_ler("Physiq — SEGREDO_AVISO_ERRO (hml-16c)"))  # ITEM_NAO_ENCONTRADO = não existe
        a, p = S.valor_novo(), S.valor_novo()
        r.cofre_salvar("item", {"valor": a, "notas": "n"})
        self.assertEqual(r.cofre_ler("item"), {"valor": a, "notas": "n"})
        r.cofre_salvar("item", {"valor": p, "extras": [{"nome": "anterior", "valor": a, "oculto": True}]})
        self.assertEqual(S.valores(r.cofre_ler("item") or {}), (p, a))
        with self.assertRaises(S.Falha):  # outro erro do MCP (não é "não existe") para com Falha
            r.cofre_ler("AMBIGUO")

    def test_ciclo_inteiro_pelo_mcp(self):
        r = CofreRemotoFalso()
        self.addCleanup(lambda: S.Remoto.fechar(r))
        r.fechar = lambda: None  # type: ignore[method-assign]  — o mesmo MCP falso (e o cofre dele) nos 4 passos
        self.r = r.f
        for sub in ("gerar", "aceitar", "trocar", "conferir"):
            rc, saida = self.rodar("repasse_convites", sub, remoto=r)
            self.assertEqual(rc, 0, f"{sub}:\n{saida}")
        atual = S.valores(r.cofre_ler(S.FINALIDADES["repasse_convites"].item) or {})[0]
        self.assertEqual(r.f.funcoes["treino"]["SEGREDO_REPASSE_CONVITES"], atual)
        self.assertEqual(r.f.funcoes["principal"]["SEGREDO_REPASSE_CONVITES_ACEITOS"], S.sha256_hex(atual))

    def test_mcp_mudo_estoura_o_tempo(self):
        r = CofreRemotoFalso()
        self.addCleanup(r.fechar)
        with mock.patch.object(S, "TEMPO_COFRE", 2):
            t = time.monotonic()
            with self.assertRaises(S.Falha):
                r.cofre_ler("MUDO")
            self.assertLess(time.monotonic() - t, 15)


if __name__ == "__main__":
    unittest.main()
