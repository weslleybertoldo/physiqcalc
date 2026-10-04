# Medidas de técnica da checagem (tecnica3d.py): cotovelo × tronco, braço à frente, pés, pegada, joelho e coluna,
# no referencial do próprio corpo — o mesmo número com o boneco em pé, curvado ou virado.
# .venv/bin/python -m pytest -q test_tecnica.py
import math
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
import tecnica3d as tc  # noqa: E402


def em_pe():
    """Boneco em pé olhando pra −Y (o esquerdo fica em +X), braços pendurados, pés paralelos na largura do quadril."""
    j = {"Hips": (0, 0, 1.0), "Spine1": (0, 0, 1.2), "Neck": (0, 0, 1.5)}
    for L, s in (("Left", 1), ("Right", -1)):
        j.update({L + "Arm": (s * 0.18, 0, 1.45), L + "ForeArm": (s * 0.18, 0, 1.15), L + "Hand": (s * 0.18, 0, 0.88),
                  L + "HandMiddle1": (s * 0.18, 0, 0.82), L + "UpLeg": (s * 0.09, 0, 0.95),
                  L + "Leg": (s * 0.10, -0.02, 0.5), L + "Foot": (s * 0.10, 0, 0.08),
                  L + "ToeBase": (s * 0.10, -0.14, 0.02)})
    return {k: np.array(v, float) for k, v in j.items()}


def girar(j, graus, eixo, pivo=(0, 0, 0)):
    """Roda o boneco inteiro (Rodrigues) em volta de `eixo` passando por `pivo`."""
    k = np.array(eixo, float) / np.linalg.norm(eixo)
    a = math.radians(graus)
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    R = np.eye(3) + math.sin(a) * K + (1 - math.cos(a)) * K @ K
    p = np.array(pivo, float)
    return {n: R @ (v - p) + p for n, v in j.items()}


def braco(j, L, direcao, comprimento=0.30):
    j = dict(j)
    d = np.array(direcao, float)
    j[L + "ForeArm"] = j[L + "Arm"] + comprimento * d / np.linalg.norm(d)
    return j


def pe_virado(j, L, graus):
    """Gira a ponta do pé `L` pra FORA (graus > 0) em volta do tornozelo."""
    s = 1 if L == "Left" else -1
    return dict(j, **{L + "ToeBase": girar({"t": j[L + "ToeBase"]}, s * graus, (0, 0, 1), j[L + "Foot"])["t"]})


def test_bracos_pendurados_ficam_rentes_ao_corpo():
    j = em_pe()
    assert tc.cotovelo_tronco(j) == pytest.approx([0, 0], abs=1e-6)
    assert tc.braco_frente(j) == pytest.approx([0, 0], abs=1e-6)


def test_braco_aberto_em_t_da_90_graus_nos_dois_lados():
    j = braco(braco(em_pe(), "Left", (1, 0, 0)), "Right", (-1, 0, 0))
    assert tc.cotovelo_tronco(j) == pytest.approx([90, 90], abs=1e-6)


def test_cotovelo_cruzando_pra_dentro_e_negativo():
    j = braco(em_pe(), "Left", (-0.3, 0, -1))
    assert tc.cotovelo_tronco(j)[0] == pytest.approx(-math.degrees(math.atan(0.3)), abs=1e-6)


def test_braco_a_frente_e_atras_do_tronco():
    j = braco(braco(em_pe(), "Left", (0, -1, 0)), "Right", (0, 1, -1))
    frente_e, frente_d = tc.braco_frente(j)
    assert frente_e == pytest.approx(90, abs=1e-6)
    assert frente_d == pytest.approx(-45, abs=1e-6)
    assert tc.cotovelo_tronco(j) == pytest.approx([0, 0], abs=1e-6)     # pra frente/trás não é abrir


def test_remada_com_cotovelo_aberto_45_graus_no_tronco_curvado():
    """Fim da remada: braço pra trás e 45° pra fora do lado do tronco; o tronco inclinado 45° e virado 30° não
    pode mudar o número (a medida é no referencial do tronco)."""
    reto = braco(em_pe(), "Left", (1, 1, 0))                       # pra trás (+Y) e pra fora (+X), 45° cada
    assert tc.cotovelo_tronco(reto)[0] == pytest.approx(45, abs=1e-6)
    curvado = girar(girar(reto, 45, (1, 0, 0), (0, 0, 1.0)), 30, (0, 0, 1))
    assert tc.cotovelo_tronco(curvado) == pytest.approx(tc.cotovelo_tronco(reto), abs=1e-6)
    assert tc.braco_frente(curvado) == pytest.approx(tc.braco_frente(reto), abs=1e-6)


def test_cotovelo_aberto_70_graus_e_pego():
    j = braco(em_pe(), "Right", (-math.tan(math.radians(70)), 1, 0))  # 70° pra fora do plano sagital
    assert tc.cotovelo_tronco(j)[1] == pytest.approx(70, abs=1e-6)


def test_braco_levantado_pro_lado_e_no_plano_da_escapula():
    pendurado = em_pe()
    assert tc.braco_elevacao(pendurado) == pytest.approx([0, 0], abs=1e-6)
    lado = braco(braco(em_pe(), "Left", (1, 0, 0)), "Right", (-1, 0, 0))
    assert tc.braco_elevacao(lado) == pytest.approx([90, 90], abs=1e-6)
    assert tc.braco_plano(lado) == pytest.approx([0, 0], abs=1e-6)
    escapula = braco(em_pe(), "Left", (math.cos(math.radians(30)), -math.sin(math.radians(30)), 0))
    assert tc.braco_elevacao(escapula)[0] == pytest.approx(90, abs=1e-6)
    assert tc.braco_plano(escapula)[0] == pytest.approx(30, abs=1e-6)
    frente = braco(em_pe(), "Right", (0, -1, 0))
    assert tc.braco_plano(frente)[1] == pytest.approx(90, abs=1e-6)


def test_supino_cotovelo_a_60_graus_e_antebraco_vertical():
    """Deitado no banco (o boneco em pé girado 90° pra trás): braço 60° aberto no plano frontal do tronco, indo
    pro chão; antebraço subindo na vertical."""
    j = em_pe()
    a = math.radians(60)
    j = braco(j, "Left", (math.sin(a), 0.6, -math.cos(a)))           # pra fora, pros pés e pra trás (chão)
    j["LeftHand"] = j["LeftForeArm"] + np.array([0, -0.26, 0])          # antebraço pra frente do peito = pro teto
    deitado = girar(j, -90, (1, 0, 0), (0, 0, 1.0))
    assert tc.braco_abertura(deitado)[0] == pytest.approx(60, abs=1e-6)
    assert tc.antebraco_vertical(deitado)[0] == pytest.approx(0, abs=1e-6)
    assert tc.antebraco_vertical(em_pe())[0] == pytest.approx(0, abs=1e-6)  # pendurado também é vertical
    j["LeftHand"] = j["LeftForeArm"] + np.array([0, -0.26, 0.26])
    assert tc.antebraco_vertical(girar(j, -90, (1, 0, 0), (0, 0, 1.0)))[0] == pytest.approx(45, abs=1e-6)


def test_pes_na_largura_do_quadril_e_paralelos():
    j = em_pe()
    assert tc.pes_largura(j)[0] == pytest.approx(0.20 / 0.18)
    assert tc.ponta_pe(j) == pytest.approx([0, 0], abs=1e-6)
    assert tc.pes_alinhados(j)[0] == pytest.approx(0, abs=1e-6)


def test_ponta_do_pe_pra_fora_e_pra_dentro_nos_dois_lados():
    j = pe_virado(pe_virado(em_pe(), "Left", 20), "Right", -10)
    assert tc.ponta_pe(j) == pytest.approx([20, -10], abs=1e-6)
    assert tc.ponta_pe_diferenca(j)[0] == pytest.approx(30, abs=1e-6)


def test_medidas_dos_pes_nao_mudam_com_o_boneco_virado():
    j = pe_virado(em_pe(), "Left", 15)
    virado = girar(j, 70, (0, 0, 1))
    for f in (tc.pes_largura, tc.ponta_pe, tc.pes_alinhados, tc.joelho_fora_do_pe):
        assert f(virado) == pytest.approx(f(j), abs=1e-6)


def test_um_pe_a_frente_do_outro():
    j = em_pe()
    for n in ("LeftFoot", "LeftToeBase"):
        j[n] = j[n] + np.array([0, -0.08, 0])
    assert tc.pes_alinhados(j)[0] == pytest.approx(80, abs=1e-6)


def test_pegada_pela_largura_dos_ombros():
    j = em_pe()
    j["LeftHandMiddle1"] = np.array([0.25, -0.3, 1.0])
    j["RightHandMiddle1"] = np.array([-0.25, -0.3, 1.0])
    assert tc.pegada_largura(j)[0] == pytest.approx(0.50 / 0.36)


def test_joelho_entrando_e_valgo_negativo():
    j = em_pe()
    j["LeftLeg"] = np.array([0.05, -0.05, 0.5])
    assert tc.joelho_fora_do_pe(j)[0] == pytest.approx(-50, abs=1e-6)
    assert tc.joelho_fora_do_pe(j)[1] == pytest.approx(0, abs=1e-6)


def test_valgo_pela_reta_quadril_tornozelo_vale_com_qualquer_base():
    j = em_pe()
    for L, s in (("Left", 1), ("Right", -1)):                       # base larga, pernas retas: joelho na reta
        j[L + "Foot"] = np.array([s * 0.19, 0, 0.08])
        j[L + "ToeBase"] = np.array([s * 0.19, -0.14, 0.02])
        j[L + "Leg"] = (j[L + "UpLeg"] + j[L + "Foot"]) / 2
    assert tc.joelho_valgo(j) == pytest.approx([0, 0], abs=1e-6)
    assert tc.joelho_fora_do_pe(j)[0] < -40                        # a medida antiga acusaria valgo aqui
    j["RightLeg"] = j["RightLeg"] + np.array([0.03, -0.10, 0])      # direito entra 3 cm (e vai pra frente)
    assert tc.joelho_valgo(j)[1] == pytest.approx(-30, abs=1.0)     # reta inclinada: a projeção anda um pouco


def test_coluna_reta_e_curvada():
    j = em_pe()
    assert tc.coluna(j)[0] == pytest.approx(0, abs=1e-6)
    j["Neck"] = np.array([0, -0.3, 1.2 + 0.3])                         # torácica 45° à frente da lombar
    assert tc.coluna(j)[0] == pytest.approx(45, abs=1e-6)


def test_regras_padrao_com_os_pes_no_chao():
    padrao = tc.regras_padrao({"pes_no_chao": True})
    assert {r["medida"] for r in padrao} == {m for m, _, _ in tc.PADRAO_PES_NO_CHAO}
    assert {"pes_largura", "ponta_pe", "joelho_valgo", "coluna"} <= {r["medida"] for r in padrao}
    assert all(r["t"] == "todos" for r in padrao)
    assert tc.regras_padrao({"pes_no_chao": False}) == []
    assert tc.regras_padrao({"pes_no_chao": True, "tecnica_padrao": False}) == []
    troca = tc.regras_padrao({"pes_no_chao": True, "tecnica_padrao": {"ponta_pe": [0, 15]}})
    assert [r["faixa"] for r in troca if r["medida"] == "ponta_pe"] == [[0, 15]]


def test_boneco_em_pe_passa_nas_regras_padrao():
    j = em_pe()
    assert not [r["nome"] for r in tc.regras_padrao({}) if tc.fora_da_faixa(r, tc.MEDIDAS[r["medida"]](j))]


def test_em_quais_quadros_a_regra_vale():
    assert tc.vale_no_quadro("todos", 0.37)
    assert tc.vale_no_quadro(1.0, 1.0) and not tc.vale_no_quadro(1.0, 0.9)
    assert tc.vale_no_quadro([0.5, 1.0], 0.5) and not tc.vale_no_quadro([0.5, 1.0], 0.4)


def test_fora_da_faixa_le_graus_mm_ou_faixa():
    assert tc.fora_da_faixa({"graus": [0, 45]}, [30, 50])
    assert not tc.fora_da_faixa({"mm": [-25, 150]}, [0, 10])
    assert tc.fora_da_faixa({"faixa": [0.8, 2.6]}, [0.5])
    assert tc.valores("pes_largura", [1.234]) == "1.23" and tc.valores("ponta_pe", [12.4, 8.6]) == "12/9"
