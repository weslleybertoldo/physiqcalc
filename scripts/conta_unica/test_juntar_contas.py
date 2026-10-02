#!/usr/bin/env python3
"""Testes das regras puras do juntar_contas.py (sem banco e sem rede).  Rodar:  python3 -m unittest scripts/conta_unica/test_juntar_contas.py"""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import juntar_contas as J  # noqa: E402

PROF = "11111111-1111-4111-8111-111111111111"
FICA = "22222222-2222-4222-8222-222222222222"
SAI = "33333333-3333-4333-8333-333333333333"
U = "44444444-4444-4444-8444-444444444444"
M_FICA = "55555555-5555-4555-8555-555555555555"
M_SAI = "66666666-6666-4666-8666-666666666666"
ANTIGO1 = "77777777-7777-4777-8777-777777777777"
ANTIGO2 = "88888888-8888-4888-8888-888888888888"
MEMBRO_FICA = "99999999-9999-4999-8999-999999999999"
MEMBRO_SAI = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


def levantamento(pares=True) -> dict:
    """O formato do levantar() no caso de produção (a conta Treino fica, a Nutrição entra; 1 aluno nas 2; 2 inativos antigos)."""
    return {
        "schema": "public", "profissional": PROF, "fica": FICA, "sai": SAI, "ja_juntada": False,
        "contas": {"fica": {"id": FICA, "plano": "treino"}, "sai": {"id": SAI, "plano": "nutricao"}},
        "membro_fica": {"id": MEMBRO_FICA, "papeis": ["personal", "dono"]}, "membro_sai": {"id": MEMBRO_SAI, "papeis": ["nutricionista", "dono"]},
        "plano_novo": "treino_nutricao", "papeis_novos": ["dono", "personal", "nutricionista"],
        "pares": [{"sai": M_SAI, "fica": M_FICA, "user_id": U}] if pares else [], "soltos": [ANTIGO1, ANTIGO2],
        "classes": {
            "conta_mover": [{"tc": "agendamentos.conta_id", "sai": 1, "sem_fk": False}, {"tc": "formularios_preconsulta.conta_id", "sai": 1, "sem_fk": False}],
            "conta_historico": [{"tc": "conta_eventos.conta_id", "sai": 3, "sem_fk": False}],
            "conta_especial": [{"tc": "pacientes.conta_id", "sai": 3, "sem_fk": False}, {"tc": "conta_membros.conta_id", "sai": 1, "sem_fk": False}],
            "conta_parar": [{"tc": "convites.conta_id", "sai": 0, "sem_fk": False}],
            "paciente_mover": [{"tc": "planos_alimentares.paciente_id", "sai": 2, "sem_fk": False},
                               {"tc": "agendamentos.paciente_id", "sai": 1, "sem_fk": False}],
            "paciente_parar": [{"tc": "aluno_assinaturas.paciente_id", "sai": 0, "sem_fk": False}],
        },
    }


class Regras(unittest.TestCase):
    def test_papeis_somados_na_ordem_da_minha_situacao(self):
        self.assertEqual(J.unir_papeis(["personal", "dono"], ["nutricionista", "dono"]), ["dono", "personal", "nutricionista"])
        self.assertEqual(J.unir_papeis(["personal"], None), ["personal"])
        with self.assertRaises(ValueError):
            J.unir_papeis(["dono", "master"])

    def test_plano_da_uniao(self):
        self.assertEqual(J.plano_da_uniao("treino", "nutricao"), "treino_nutricao")
        self.assertEqual(J.plano_da_uniao("nutricao", "treino"), "treino_nutricao")
        self.assertEqual(J.plano_da_uniao("treino", "treino"), "treino")
        self.assertEqual(J.plano_da_uniao("treino_nutricao", "nutricao"), "treino_nutricao")

    def test_ajustes_da_matricula_que_sai_entram_sem_trocar_os_da_que_fica(self):
        sai = {"acesso_app": True, "acesso_link": True, "diario_alimentar": True, "mensagens_automaticas": False}
        cfg, conflitos = J.unir_config(sai, {"acesso_app": True})
        self.assertEqual(cfg, sai)
        self.assertEqual(conflitos, [])
        cfg, conflitos = J.unir_config({"diario_alimentar": True}, {"diario_alimentar": False})
        self.assertFalse(cfg["diario_alimentar"])  # em conflito vale o da que fica
        self.assertEqual(conflitos, [{"chave": "diario_alimentar", "fica": False, "sai": True}])
        self.assertEqual(J.unir_config(None, None), ({}, []))

    def test_classes(self):
        self.assertEqual(J.classe_conta("conta_eventos"), "historico")
        self.assertEqual(J.classe_conta("conta_faturas"), "historico")
        self.assertEqual(J.classe_conta("pacientes"), "especial")
        self.assertEqual(J.classe_conta("conta_membros"), "especial")
        self.assertEqual(J.classe_conta("recebimento_chaves"), "parar")
        self.assertEqual(J.classe_conta("agendamentos"), "mover")
        self.assertEqual(J.classe_conta("tabela_nova_qualquer"), "mover")
        self.assertEqual(J.classe_paciente("planos_alimentares"), "mover")
        self.assertEqual(J.classe_paciente("aluno_assinaturas"), "parar")


class Parear(unittest.TestCase):
    def test_caso_de_producao(self):
        sai = [{"id": ANTIGO1, "user_id": None, "ativo": False, "deleted_at": None},
               {"id": M_SAI, "user_id": U, "ativo": True, "deleted_at": None},
               {"id": ANTIGO2, "user_id": None, "ativo": False, "deleted_at": None}]
        fica = [{"id": M_FICA, "user_id": U, "ativo": True, "deleted_at": None}]
        pares, soltos, problemas = J.parear(sai, fica)
        self.assertEqual(pares, [{"sai": M_SAI, "fica": M_FICA, "user_id": U}])
        self.assertEqual(soltos, [ANTIGO1, ANTIGO2])
        self.assertEqual(problemas, [])

    def test_na_lixeira_ou_sem_par_so_muda_de_conta(self):
        sai = [{"id": M_SAI, "user_id": U, "ativo": True, "deleted_at": "2026-09-01"}]
        pares, soltos, _ = J.parear(sai, [{"id": M_FICA, "user_id": U, "ativo": True, "deleted_at": None}])
        self.assertEqual((pares, soltos), ([], [M_SAI]))
        pares, soltos, _ = J.parear([{"id": M_SAI, "user_id": U, "ativo": True, "deleted_at": None}], [])
        self.assertEqual((pares, soltos), ([], [M_SAI]))

    def test_casos_que_pedem_decisao(self):
        dois_na_fica = [{"id": M_FICA, "user_id": U, "ativo": True, "deleted_at": None}, {"id": ANTIGO1, "user_id": U, "ativo": True, "deleted_at": None}]
        _, _, problemas = J.parear([{"id": M_SAI, "user_id": U, "ativo": True, "deleted_at": None}], dois_na_fica)
        self.assertTrue(problemas)
        dois_na_sai = [{"id": M_SAI, "user_id": U, "ativo": True, "deleted_at": None}, {"id": ANTIGO1, "user_id": U, "ativo": False, "deleted_at": None}]
        _, _, problemas = J.parear(dois_na_sai, [{"id": M_FICA, "user_id": U, "ativo": True, "deleted_at": None}])
        self.assertTrue(problemas)
        _, _, problemas = J.parear([{"id": M_SAI, "user_id": U, "ativo": True, "deleted_at": None}],
                                   [{"id": M_FICA, "user_id": U, "ativo": False, "deleted_at": None}])
        self.assertTrue(problemas)  # a que fica inativa e a que sai ativa


class Cadastro(unittest.TestCase):
    def test_dado_sensivel_so_preenchido_ou_vazio(self):
        d = J.diferencas_cadastro({"nome": "Weslley B", "cpf": "123", "telefone": None, "email": "a@x"},
                                  {"nome": "Weslley", "cpf": None, "telefone": None, "email": "a@x"})
        self.assertIn({"campo": "nome", "fica": "Weslley", "sai": "Weslley B"}, d)
        self.assertIn({"campo": "cpf", "fica": "vazio", "sai": "preenchido"}, d)
        self.assertFalse(any(x["campo"] in ("telefone", "email") for x in d))
        self.assertNotIn("123", json.dumps(d))


class Contagens(unittest.TestCase):
    def test_nada_some(self):
        antes = {"planos_alimentares.paciente_id": {"total": 10, "sai": 2, "fica": 0}, "conta_eventos.conta_id": {"total": 50, "sai": 3, "fica": 4}}
        depois = {"planos_alimentares.paciente_id": {"total": 10, "sai": 0, "fica": 2}, "conta_eventos.conta_id": {"total": 53, "sai": 4, "fica": 6}}
        self.assertEqual(J.conferir_contagens(antes, depois, ["planos_alimentares.paciente_id"], []), [])

    def test_some_ou_sobra_e_erro(self):
        antes = {"planos_alimentares.paciente_id": {"total": 10, "sai": 2, "fica": 0}}
        self.assertTrue(J.conferir_contagens(antes, {"planos_alimentares.paciente_id": {"total": 9, "sai": 0, "fica": 1}}, ["planos_alimentares.paciente_id"], []))
        self.assertTrue(J.conferir_contagens(antes, {"planos_alimentares.paciente_id": {"total": 10, "sai": 1, "fica": 1}}, ["planos_alimentares.paciente_id"], []))

    def test_conflito_de_linha_unica_fica_onde_estava(self):
        antes = {"gestacoes.paciente_id": {"total": 3, "sai": 1, "fica": 1}}
        depois = {"gestacoes.paciente_id": {"total": 3, "sai": 1, "fica": 1}}
        conflito = [{"tabela": "gestacoes", "coluna": "paciente_id", "id": "x"}]
        self.assertEqual(J.conferir_contagens(antes, depois, ["gestacoes.paciente_id"], conflito), [])


class ConferirCom(unittest.TestCase):
    def test_historico_nao_conta_e_linha_nova_conta(self):
        aprovado = levantamento()
        agora = json.loads(json.dumps(aprovado))
        agora["classes"]["conta_historico"][0]["sai"] = 5  # eventos novos na conta: não muda o que move
        self.assertEqual(J.chave_inventario(aprovado), J.chave_inventario(agora))
        agora["classes"]["paciente_mover"][0]["sai"] = 3  # um plano novo na matrícula que sai: o inventário mudou
        self.assertNotEqual(J.chave_inventario(aprovado), J.chave_inventario(agora))
        outro = json.loads(json.dumps(aprovado))
        outro["soltos"] = [ANTIGO1]
        self.assertNotEqual(J.chave_inventario(aprovado), J.chave_inventario(outro))


class Bloco(unittest.TestCase):
    def test_dry_run_desfaz_e_aplicar_grava(self):
        L = levantamento()
        dry = J.montar_bloco(L, aplicar=False, hoje_br="02/10/2026")
        real = J.montar_bloco(L, aplicar=True, hoje_br="02/10/2026")
        self.assertTrue(dry.startswith("begin;") and dry.rstrip().endswith("rollback;"))
        self.assertTrue(real.startswith("begin;") and real.rstrip().endswith("commit;"))
        self.assertNotIn("perform public.espelho_disparar()", dry)
        self.assertIn("perform public.espelho_disparar()", real)
        self.assertIn(f"juntada na conta {FICA} em 02/10/2026", real)

    def test_so_update_e_os_2_eventos(self):
        sql = J.montar_bloco(levantamento(), aplicar=True, hoje_br="02/10/2026").lower()
        self.assertNotIn("delete ", sql)
        self.assertNotIn("truncate", sql)
        self.assertEqual(sql.count("insert into"), 1)  # um insert com as 2 linhas de conta_eventos
        self.assertIn("insert into public.conta_eventos", sql)
        for proibido in ("set email", "set cpf", "set user_id", "set deleted_at", "auth.users"):
            self.assertNotIn(proibido, sql)

    def test_sem_par_nao_conta_colunas_de_paciente(self):
        sql = J.montar_bloco(levantamento(pares=False), aplicar=False, hoje_br="02/10/2026")
        self.assertNotIn("planos_alimentares|paciente_id|p", sql)
        self.assertIn("v_mat_sai uuid[] := array[]::uuid[]", sql)

    def test_identificador_estranho_e_recusado(self):
        L = levantamento()
        L["classes"]["conta_mover"].append({"tc": "x; drop table contas.conta_id", "sai": 1, "sem_fk": False})
        with self.assertRaises(ValueError):
            J.montar_bloco(L, aplicar=False, hoje_br="02/10/2026")
        with self.assertRaises(ValueError):
            J.sql_array_uuid(["nao-e-uuid"])

    def test_delimitador_do_json(self):
        self.assertEqual(J.dollar('[{"a":1}]'), '$w1j$[{"a":1}]$w1j$')
        with self.assertRaises(ValueError):
            J.dollar("tem $w1j$ dentro")


class Desfazer(unittest.TestCase):
    def test_volta_so_as_colunas_e_as_linhas_da_juncao(self):
        with tempfile.TemporaryDirectory() as tmp:
            pasta = Path(tmp)
            S = "staging"
            man = {"schema": S, "profissional": PROF, "fica": FICA, "sai": SAI, "pares": [{"sai": M_SAI, "fica": M_FICA, "user_id": U}],
                   "soltos": [ANTIGO1], "membro_fica": MEMBRO_FICA, "membro_sai": MEMBRO_SAI,
                   "movidas": [{"tc": "planos_alimentares.paciente_id", "arquivo": f"principal.{S}.mover.planos_alimentares.paciente_id.json"}]}
            (pasta / "manifesto.json").write_text(json.dumps(man))
            outro = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
            arquivos = {
                "contas": [{"id": FICA, "plano": "treino"}, {"id": SAI, "plano": "nutricao", "situacao": "isenta"}],
                "conta_membros": [{"id": MEMBRO_FICA, "papeis": ["personal", "dono"]}, {"id": MEMBRO_SAI, "status": "ativo"},
                                  {"id": outro, "status": "ativo"}],
                "pacientes": [{"id": M_SAI, "ativo": True}, {"id": M_FICA, "nutricionista_id": None}, {"id": ANTIGO1, "conta_id": SAI},
                              {"id": outro, "conta_id": FICA}],
                "mover.planos_alimentares.paciente_id": [{"id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "paciente_id": M_SAI}],
            }
            for nome, linhas in arquivos.items():
                (pasta / f"principal.{S}.{nome}.json").write_text(json.dumps(linhas))
            previa, _ = J.montar_desfazer(pasta, sim=False)
            real, _ = J.montar_desfazer(pasta, sim=True)
            self.assertTrue(previa.rstrip().endswith("rollback;"))
            self.assertTrue(real.rstrip().endswith("commit;"))
            self.assertIn("perform staging.espelho_disparar()", real)
            self.assertNotIn("espelho_disparar()", previa)
            self.assertNotIn(outro, real)  # linha que a junção não mexeu não volta (nem membro de outra pessoa nem aluno de verdade)
            self.assertIn("'voltou', 'planos_alimentares.paciente_id'", real)
            for t in ("pacientes", "conta_membros", "contas", "planos_alimentares"):
                self.assertIn(f"json_populate_recordset(null::staging.\"{t}\"", real)
            self.assertNotIn('"email"', real.split("json_populate_recordset")[0])


if __name__ == "__main__":
    unittest.main()
