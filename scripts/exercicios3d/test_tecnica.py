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
        # base do indicador (na frente) e do mínimo (atrás): palma virada pra coxa (lote 3, desenvolvimento Arnold)
        j.update({L + "HandIndex1": (s * 0.18, -0.035, 0.83), L + "HandPinky1": (s * 0.18, 0.03, 0.84)})
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


def test_ombro_so_sobe_no_encolhimento_e_rolar_e_pego():
    """Encolhimento (lote 2): subir os ombros não mexe no ombro_frente; levar os ombros 3 cm pra frente (rolar) mexe,
    com o boneco em pé ou inclinado."""
    j = em_pe()
    assert tc.ombro_frente(j) == pytest.approx([0, 0], abs=1e-6)
    encolhido = dict(j, LeftArm=j["LeftArm"] + np.array([0, 0, 0.06]), RightArm=j["RightArm"] + np.array([0, 0, 0.06]))
    assert tc.ombro_frente(encolhido) == pytest.approx([0, 0], abs=1e-6)
    rolando = dict(j, LeftArm=j["LeftArm"] + np.array([0, -0.03, 0]), RightArm=j["RightArm"] + np.array([0, -0.03, 0]))
    assert tc.ombro_frente(rolando) == pytest.approx([30, 30], abs=1e-6)
    inclinado = girar(rolando, 30, (1, 0, 0), (0, 0, 1.0))
    assert tc.ombro_frente(inclinado) == pytest.approx([30, 30], abs=1e-6)
    assert tc.valores("ombro_frente", [30.4, -2.0]) == "30/-2"


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


def afundo(j, passo=0.40):
    """Base do afundo (lote 2): pé esquerdo `passo` m à frente (−Y) e o direito `passo` m atrás, mesma largura."""
    j = dict(j)
    for L, dy in (("Left", -passo), ("Right", passo)):
        for o in ("Foot", "ToeBase"):
            j[L + o] = j[L + o] + np.array([0, dy, 0])
    return j


def test_base_lateral_do_afundo_nao_conta_a_passada():
    """pes_base_lateral só olha de lado a lado da pelve: um pé à frente do outro não muda o número (o pes_largura
    muda, porque mede no chão inteiro); vale com o boneco virado."""
    j = em_pe()
    assert tc.pes_base_lateral(j)[0] == pytest.approx(0.20 / 0.18)
    a = afundo(j)
    assert tc.pes_base_lateral(a)[0] == pytest.approx(0.20 / 0.18)
    assert tc.pes_largura(a)[0] > 4                                     # 0,82 m no chão ÷ 0,18 m
    assert tc.pes_base_lateral(girar(a, 35, (0, 0, 1)))[0] == pytest.approx(0.20 / 0.18)
    assert tc.valores("pes_base_lateral", [1.111]) == "1.11"


def test_altura_do_joelho_acima_do_chao():
    j = em_pe()
    assert tc.joelho_altura(j) == pytest.approx([500, 500])
    j["RightLeg"] = np.array([-0.10, 0.0, 0.08])                       # joelho de trás quase no chão
    assert tc.joelho_altura(j) == pytest.approx([500, 80])
    assert tc.valores("joelho_altura", [80.4, 500]) == "80/500"


def test_regra_de_um_lado_so():
    """"lado": "E"/"D" fica só com o valor daquele membro (perna da frente × de trás no afundo); sem "lado" ou numa
    medida de valor único (tronco), nada muda."""
    assert tc.do_lado({"graus": [80, 110]}, [95, 30]) == [95, 30]
    assert tc.do_lado({"lado": "E"}, [95, 30]) == [95]
    assert tc.do_lado({"lado": "D"}, [95, 30]) == [30]
    assert tc.do_lado({"lado": "D"}, [7]) == [7]
    assert not tc.fora_da_faixa({"graus": [80, 110], "lado": "E"}, tc.do_lado({"lado": "E"}, [95, 30]))
    with pytest.raises(ValueError):
        tc.do_lado({"lado": "Left"}, [95, 30])


def test_ponta_dos_dedos_vale_com_o_calcanhar_levantado():
    """Pé de trás do afundo: com o pé quase em pé (tornozelo bem em cima da base dos dedos) o ponta_pe vira ruído,
    mas os dedos continuam deitados no chão apontando pra frente e o ponta_dedos mede 0; dedos virados pra fora 20°
    dão +20 (e o pé esquerdo, que não mexeu, segue 0)."""
    j = em_pe()
    for L, s in (("Left", 1), ("Right", -1)):
        j[L + "ToeBase_ponta"] = j[L + "ToeBase"] + np.array([0, -0.05, -0.01])
    assert tc.ponta_dedos(j) == pytest.approx([0, 0], abs=1e-6)
    j["RightFoot"] = j["RightToeBase"] + np.array([0.003, 0.001, 0.15])      # pé de trás em pé
    assert abs(tc.ponta_pe(j)[1]) > 45                                         # ruído
    assert tc.ponta_dedos(j) == pytest.approx([0, 0], abs=1e-6)
    j["RightToeBase_ponta"] = girar({"t": j["RightToeBase_ponta"]}, -20, (0, 0, 1), j["RightToeBase"])["t"]
    assert tc.ponta_dedos(j) == pytest.approx([0, 20], abs=1e-6)


def com_claviculas(j):
    """em_pe() com a base das clavículas (cabeça dos ossos Shoulder): presa no tórax, perto do pescoço."""
    j = dict(j)
    j["LeftShoulder"], j["RightShoulder"] = np.array([0.06, 0, 1.44]), np.array([-0.06, 0, 1.44])
    return j


def test_escapula_de_um_lado_so_na_remada_unilateral():
    """Remada unilateral (lote 2): só o ombro direito vai 3 cm pra frente (protração). O ombro_frente (eixo pela
    linha dos ombros) divide o movimento entre os dois lados; o escapula_frente (eixo pela base das clavículas, presa
    no tórax) mostra só o direito — em pé ou com o tronco curvado quase na horizontal."""
    j = com_claviculas(em_pe())
    assert tc.escapula_frente(j) == pytest.approx([0, 0], abs=1e-6)
    j["RightArm"] = j["RightArm"] + np.array([0, -0.03, 0])
    assert tc.escapula_frente(j) == pytest.approx([0, 30], abs=1e-6)
    e, d = tc.ombro_frente(j)
    assert abs(e) > 5 and d < 25                                         # a outra medida espalha pros dois lados
    curvado = girar(j, 84, (1, 0, 0), (0, 0, 0.95))
    assert tc.escapula_frente(curvado) == pytest.approx([0, 30], abs=1e-6)
    assert tc.valores("escapula_frente", [30.4, -2.0]) == "30/-2"


def test_tronco_girando_em_volta_do_proprio_eixo_e_pelve_nivelada():
    """Tronco curvado quase na horizontal: ombros nivelados = 0; girar o tronco 15° em volta do próprio eixo pra
    subir o lado direito dá +15. Subir a escápula não muda nada (o eixo é a base das clavículas)."""
    j = com_claviculas(em_pe())
    assert tc.ombros_nivel(j) == pytest.approx([0], abs=1e-6)
    assert tc.pelve_nivel(j) == pytest.approx([0], abs=1e-6)
    curvado = girar(j, 84, (1, 0, 0), (0, 0, 0.95))
    assert tc.ombros_nivel(curvado) == pytest.approx([0], abs=1e-6)
    eixo = curvado["Neck"] - curvado["Hips"]
    girado = girar(curvado, -15, eixo, curvado["Hips"])                 # lado direito (−X) sobe
    # tronco 6° acima da horizontal: o eixo de lado a lado sobe asin(sen 15° · sen 84°) ≈ 14,9° em relação ao chão
    esperado = math.degrees(math.asin(math.sin(math.radians(15)) * math.sin(math.radians(84))))
    assert tc.ombros_nivel(girado) == pytest.approx([esperado], abs=1e-6)
    encolhido = dict(curvado, RightArm=curvado["RightArm"] + np.array([0, 0, 0.03]))
    assert tc.ombros_nivel(encolhido) == pytest.approx([0], abs=1e-6)
    torto = dict(j, RightUpLeg=j["RightUpLeg"] + np.array([0, 0, 0.02]))
    assert tc.pelve_nivel(torto)[0] == pytest.approx(math.degrees(math.atan2(0.02, 0.18)), abs=1e-6)


def test_medidas_novas_entram_no_medir():
    j = com_claviculas(em_pe())
    for L in ("Left", "Right"):
        j[L + "ToeBase_ponta"] = j[L + "ToeBase"] + np.array([0, -0.05, -0.01])
    m = tc.medir(j)
    assert {"escapula_frente", "ombros_nivel", "pelve_nivel"} <= set(m)
    assert {"LeftShoulder", "RightShoulder"} <= set(tc.JUNTAS)


def test_tornozelo_canela_x_pe_no_pe_de_tras_do_bulgaro():
    """Agachamento búlgaro (lote 2): ângulo canela × pé. Em pé = o do pé chapado; o pé de trás virado no banco com 30°
    de flexão plantar (ponta do pé descendo) dá 30° a menos, e o número não muda com o boneco curvado ou virado."""
    j = em_pe()
    canela = j["RightFoot"] - j["RightLeg"]
    pe = j["RightToeBase"] - j["RightFoot"]
    chapado = math.degrees(math.acos(canela @ pe / np.linalg.norm(canela) / np.linalg.norm(pe)))
    assert tc.tornozelo(j) == pytest.approx([chapado, chapado], abs=1e-6)
    eixo = np.cross(canela, pe)                                         # flexão plantar: o pé gira pra longe do joelho
    j["RightToeBase"] = girar({"t": j["RightToeBase"]}, 30, -eixo, j["RightFoot"])["t"]
    assert tc.tornozelo(j)[1] == pytest.approx(chapado - 30, abs=1e-6)
    assert tc.tornozelo(girar(j, 70, (1, 0, 0), (0, 0, 0.9)))[1] == pytest.approx(chapado - 30, abs=1e-6)
    assert "tornozelo" in tc.medir(dict(com_claviculas(j), **{L + "ToeBase_ponta": j[L + "ToeBase"]
                                                              for L in ("Left", "Right")}))


def test_cotovelos_largura_abertos_fechados_e_deitado():
    """Abdominal bicicleta (lote 2): cotovelos abertos pro lado (mãos atrás da cabeça) × fechados pra frente; o número
    não muda com o boneco deitado e girado (o braco_abertura muda, porque o eixo quadril → pescoço enrola e gira)."""
    j = em_pe()
    assert tc.cotovelos_largura(j) == pytest.approx([1.0], abs=1e-6)          # pendurados: largura dos ombros
    abertos = braco(braco(j, "Left", (1, 0, 0.6)), "Right", (-1, 0, 0.6))
    larg = (0.36 + 2 * 0.30 / math.hypot(1, 0.6)) / 0.36
    assert tc.cotovelos_largura(abertos) == pytest.approx([larg], abs=1e-6)
    fechados = braco(braco(j, "Left", (0, -1, 0.6)), "Right", (0, -1, 0.6))
    assert tc.cotovelos_largura(fechados) == pytest.approx([1.0], abs=1e-6)
    deitado = girar(girar(abertos, -90, (1, 0, 0), (0, 0, 0.95)), 30, (0, 1, 0))
    assert tc.cotovelos_largura(deitado) == pytest.approx([larg], abs=1e-6)
    m = tc.medir(dict(com_claviculas(abertos), **{L + "ToeBase_ponta": abertos[L + "ToeBase"] for L in ("Left", "Right")}))
    assert m["cotovelos_largura"] == pytest.approx([larg], abs=1e-6)
    assert tc.valores("cotovelos_largura", [1.734]) == "1.73"


def mao(j, L, dedos, palma):
    """Base do indicador e do mínimo da mão `L` com os dedos apontando pra `dedos` e a palma pra `palma` (mundo)."""
    s = 1 if L == "Left" else -1
    d, n = np.array(dedos, float), np.array(palma, float)
    k = s * np.cross(d, n)                                              # do indicador pro mínimo
    m = j[L + "Hand"]
    return dict(j, **{L + "HandIndex1": m + 0.08 * d - 0.02 * k, L + "HandPinky1": m + 0.08 * d + 0.02 * k})


def test_palma_pro_corpo_pro_meio_e_pra_frente_no_arnold():
    """Desenvolvimento Arnold (lote 3): a palma começa virada pro corpo (dedos pra cima, na frente do rosto), passa
    pelo meio (palmas uma pra outra) e termina virada pra frente em cima; virar pra fora dá negativo. O número não
    muda com o boneco sentado no encosto inclinado e virado."""
    j = em_pe()
    assert tc.palma_frente(j) == pytest.approx([90, 90], abs=1e-6)          # pendurado: palma pra coxa
    assert tc.palma_dentro(j) == pytest.approx([90, 90], abs=1e-6)

    def arnold(palma_e):
        """As 2 mãos com os dedos pra cima; palma do esquerdo `palma_e` e a do direito espelhada."""
        x, y, z = palma_e
        return mao(mao(j, "Left", (0, 0, 1), (x, y, z)), "Right", (0, 0, 1), (-x, y, z))

    comeco, meio, fim = arnold((0, 1, 0)), arnold((-1, 0, 0)), arnold((0, -1, 0))   # o boneco olha pra −Y
    assert tc.palma_frente(comeco) == pytest.approx([180, 180], abs=1e-6)
    assert tc.palma_dentro(comeco) == pytest.approx([0, 0], abs=1e-6)
    assert tc.palma_frente(meio) == pytest.approx([90, 90], abs=1e-6)
    assert tc.palma_dentro(meio) == pytest.approx([90, 90], abs=1e-6)
    assert tc.palma_frente(fim) == pytest.approx([0, 0], abs=1e-6)
    assert tc.palma_dentro(fim) == pytest.approx([0, 0], abs=1e-6)
    a = math.radians(45)
    caminho = arnold((-math.sin(a), math.cos(a), 0))                     # metade do caminho do corpo pro meio
    assert tc.palma_frente(caminho) == pytest.approx([135, 135], abs=1e-6)
    assert tc.palma_dentro(caminho) == pytest.approx([45, 45], abs=1e-6)
    assert tc.palma_dentro(arnold((1, 0, 0))) == pytest.approx([-90, -90], abs=1e-6)   # virada pra fora
    sentado = girar(girar(caminho, -5, (1, 0, 0), (0, 0, 1.0)), 40, (0, 0, 1))
    assert tc.palma_frente(sentado) == pytest.approx([135, 135], abs=1e-6)
    assert tc.palma_dentro(sentado) == pytest.approx([45, 45], abs=1e-6)
    m = tc.medir(dict(com_claviculas(caminho), **{L + "ToeBase_ponta": j[L + "ToeBase"] for L in ("Left", "Right")}))
    assert m["palma_frente"] == pytest.approx([135, 135], abs=1e-6)
    assert {"LeftHandIndex1", "RightHandIndex1", "LeftHandPinky1", "RightHandPinky1"} <= set(tc.JUNTAS)


def test_quadril_sinal_flexao_positiva_e_passar_da_linha_negativa():
    """Hiperextensão lombar (lote 3): o tronco gira em volta do quadril e a coxa fica parada. Em pé a coxa do em_pe() sai
    2,5° à frente da linha do tronco; dobrar o tronco 90° pra frente soma 90 e passar 10° da linha pra trás tira 10 (o
    "quadril" do medir_juntas, sem sinal, não separa os dois). O boneco inteiro inclinado não muda o número."""
    j = em_pe()
    base = math.degrees(math.atan2(0.02, 0.45))
    assert tc.quadril_sinal(j) == pytest.approx([base, base], abs=1e-6)
    pivo = (j["LeftUpLeg"] + j["RightUpLeg"]) / 2
    de_cima = ("Hips", "Spine1", "Neck", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "LeftHand", "RightHand",
               "LeftHandMiddle1", "RightHandMiddle1")

    def tronco(graus):
        return dict(j, **girar({k: j[k] for k in de_cima}, graus, (1, 0, 0), pivo))

    assert tc.quadril_sinal(tronco(90)) == pytest.approx([base + 90] * 2, abs=1e-6)
    assert tc.quadril_sinal(tronco(-10)) == pytest.approx([base - 10] * 2, abs=1e-6)
    inclinado = girar(tronco(30), 45, (1, 0, 0), (0, 0, 0.1))
    assert tc.quadril_sinal(inclinado) == pytest.approx([base + 30] * 2, abs=1e-6)
    assert "quadril_sinal" in tc.MEDIDAS


def test_torax_chao_deitado_enrolando_so_a_parte_de_cima():
    """Abdominais refeitos (lote 3): deitado de costas o tórax fica no chão (0°); enrolar só a parte de cima 30° em
    volta da transição toracolombar (Spine1), com a lombar parada, dá 30 — e o "tronco" do checagem3d (quadril →
    pescoço) marca só ~18° do chão, por isso não pegava o tronco subindo demais. Virar o boneco em volta da vertical
    não muda nada; em pé = 90."""
    j = em_pe()
    assert tc.torax_chao(j) == pytest.approx([90], abs=1e-6)
    deitado = girar(j, -90, (1, 0, 0))                                   # de costas, cabeça pra +Y, rosto pra cima
    assert tc.torax_chao(deitado) == pytest.approx([0], abs=1e-6)
    enrolado = dict(deitado, Neck=girar({"n": deitado["Neck"]}, 30, (1, 0, 0), deitado["Spine1"])["n"])
    assert tc.torax_chao(enrolado) == pytest.approx([30], abs=1e-6)
    d = enrolado["Neck"] - enrolado["Hips"]
    assert math.degrees(math.atan2(d[2], math.hypot(d[0], d[1]))) == pytest.approx(18.06, abs=0.01)
    assert tc.torax_chao(girar(enrolado, 40, (0, 0, 1))) == pytest.approx([30], abs=1e-6)
    assert tc.medir(dict(com_claviculas(enrolado), **{L + "ToeBase_ponta": enrolado[L + "ToeBase"]
                                                     for L in ("Left", "Right")}))["torax_chao"] == pytest.approx([30])


def test_cabeca_tronco_com_sinal_em_pe_e_curvado():
    """Crucifixo invertido (lote 3): cabeça na linha do tronco = 0; levantada pra trás (olhando pra frente com o tronco
    inclinado) dá +, caída pro peito dá − — o "pescoco" do checagem3d não separa os dois. O mesmo número com o boneco
    curvado 80° à frente (tronco quase horizontal) ou virado; sem a cabeça no dicionário (testes antigos), nada."""
    j = dict(em_pe(), Head=np.array([0, 0, 1.65]))
    assert tc.cabeca_tronco(j) == pytest.approx([0], abs=1e-6)
    pra_tras = dict(j, Head=girar({"h": j["Head"]}, -20, (1, 0, 0), j["Neck"])["h"])   # topo da cabeça vai pra +Y
    pra_frente = dict(j, Head=girar({"h": j["Head"]}, 15, (1, 0, 0), j["Neck"])["h"])
    assert tc.cabeca_tronco(pra_tras) == pytest.approx([20], abs=1e-6)
    assert tc.cabeca_tronco(pra_frente) == pytest.approx([-15], abs=1e-6)
    curvado = girar(pra_frente, 80, (1, 0, 0), (0, 0, 0.95))                            # tronco quase horizontal
    assert tc.cabeca_tronco(curvado) == pytest.approx([-15], abs=1e-6)
    assert tc.cabeca_tronco(girar(pra_tras, 35, (0, 0, 1))) == pytest.approx([20], abs=1e-6)
    assert tc.cabeca_tronco(em_pe()) == []
    assert "Head" in tc.JUNTAS and "cabeca_tronco" in tc.MEDIDAS


def antebracos_deitados(palma_cima=True):
    """Sentado (rosca punho, lote 4): antebraços deitados pra frente (−Y) em cima das coxas, punho 8 cm além do centro
    do joelho, mão alinhada com o antebraço; palma pra cima (supinada: o indicador, do lado do polegar, fica pra fora)
    ou pro chão (pronada: o indicador fica pra dentro)."""
    j = {}
    for L, s in (("Left", 1), ("Right", -1)):
        x = s * 0.12
        fora = s if palma_cima else -s
        j.update({L + "UpLeg": (x, 0, 0.52), L + "Leg": (x, -0.42, 0.52), L + "ForeArm": (x, -0.24, 0.60),
                  L + "Hand": (x, -0.50, 0.60), L + "HandMiddle1": (x, -0.60, 0.60),
                  L + "HandIndex1": (x + fora * 0.03, -0.59, 0.60), L + "HandPinky1": (x - fora * 0.03, -0.58, 0.60)})
    return {k: np.array(v, float) for k, v in j.items()}


def dobrar_punho(j, graus):
    """Dobra os dois punhos `graus` em volta do eixo de lado a lado (+ = dedos sobem, pro lado da palma de cima)."""
    out = dict(j)
    for L in ("Left", "Right"):
        mao = {n: j[n] for n in (L + "HandMiddle1", L + "HandIndex1", L + "HandPinky1")}
        out.update(girar(mao, graus, (-1, 0, 0), j[L + "Hand"]))
    return out


def test_punho_com_sinal_palma_pra_cima_e_punho_alem_do_joelho_na_rosca_punho():
    """Rosca punho (lote 4): com a palma pra cima, a mão subindo pro lado da palma é flexão (+) e descendo pro lado do
    dorso é extensão (−), nos dois lados e com o boneco virado — o "punho" do checagem3d dá o mesmo número nos dois. A
    palma pra cima mede 0 e só inclina com o punho; pronada (palma pro chão) mede 180. O punho 8 cm além do joelho ao
    longo da coxa = +80 mm."""
    j = antebracos_deitados()
    assert tc.punho_flexao(j) == pytest.approx([0, 0], abs=1e-6)
    assert tc.palma_cima(j) == pytest.approx([0, 0], abs=1e-6)
    assert tc.punho_flexao(dobrar_punho(j, 60)) == pytest.approx([60, 60], abs=1e-6)
    assert tc.punho_flexao(dobrar_punho(j, -55)) == pytest.approx([-55, -55], abs=1e-6)
    assert tc.palma_cima(dobrar_punho(j, 60)) == pytest.approx([60, 60], abs=1e-6)
    assert tc.palma_cima(dobrar_punho(j, -55)) == pytest.approx([55, 55], abs=1e-6)
    virado = girar(dobrar_punho(j, -40), 70, (0, 0, 1))
    assert tc.punho_flexao(virado) == pytest.approx([-40, -40], abs=1e-6)
    pronada = antebracos_deitados(palma_cima=False)
    assert tc.palma_cima(pronada) == pytest.approx([180, 180], abs=1e-6)
    assert tc.punho_flexao(dobrar_punho(pronada, 30)) == pytest.approx([-30, -30], abs=1e-6)   # pronada: subir = dorso
    assert tc.punho_alem_joelho(j)[0] == pytest.approx(80, abs=1e-6)
    assert {"punho_flexao", "palma_cima", "punho_alem_joelho"} <= set(tc.MEDIDAS)


def test_linha_joelho_quadril_cabeca_na_flexao_nordica():
    """Flexão nórdica (lote 4): joelho, quadril e cabeça em linha reta = 0; a cabeça (tronco) indo à frente da linha da coxa
    (dobrou na cintura) dá +, indo pra trás (arqueou) dá −. O mesmo número com o corpo inteiro inclinado 70° à frente em
    volta dos joelhos (a descida da nórdica) ou virado; sem a cabeça no dicionário (testes antigos), nada."""
    j = dict(em_pe(), Head=np.array([0, 0, 1.65]))
    for L, s in (("Left", 1), ("Right", -1)):                  # coxa em pé: joelho embaixo do quadril
        j[L + "Leg"] = np.array([s * 0.09, 0, 0.5])
    assert tc.linha_joelho_quadril_cabeca(j) == pytest.approx([0], abs=1e-6)
    quadril = (j["LeftUpLeg"] + j["RightUpLeg"]) / 2
    dobrou = dict(j, Head=girar({"h": j["Head"]}, 20, (1, 0, 0), quadril)["h"])      # cabeça vai pra −Y (frente)
    arqueou = dict(j, Head=girar({"h": j["Head"]}, -10, (1, 0, 0), quadril)["h"])
    assert tc.linha_joelho_quadril_cabeca(dobrou) == pytest.approx([20], abs=1e-6)
    assert tc.linha_joelho_quadril_cabeca(arqueou) == pytest.approx([-10], abs=1e-6)
    joelhos = (j["LeftLeg"] + j["RightLeg"]) / 2
    inclinado = girar(dobrou, 70, (1, 0, 0), joelhos)                                 # corpo descendo à frente
    assert tc.linha_joelho_quadril_cabeca(inclinado) == pytest.approx([20], abs=1e-6)
    assert tc.linha_joelho_quadril_cabeca(girar(arqueou, 40, (0, 0, 1))) == pytest.approx([-10], abs=1e-6)
    assert tc.linha_joelho_quadril_cabeca(em_pe()) == []
    assert "linha_joelho_quadril_cabeca" in tc.MEDIDAS


def test_quadril_na_reta_e_dedos_da_mao_na_flexao_de_braco():
    """Flexão de braço (lote 7): ombros, quadril e tornozelos numa reta = 0; o quadril 3 cm pras costas (subiu) = +30, pra barriga
    (caiu) = −30; o mesmo número de bruços, inclinado 10° (a cabeça mais alta), ou virado em volta da vertical. Mãos espalmadas no
    chão: dedos na direção da cabeça = 0; virados 10° pro meio do corpo = +10 nas duas mãos; pra fora = −."""
    j = em_pe()                                                   # ombros, quadril e tornozelos no eixo x = 0, y = 0
    assert tc.quadril_linha_ombro_tornozelo(j) == pytest.approx([0], abs=1e-6)
    for mm, dy in ((30, 0.03), (-30, -0.03)):                     # em pé, as costas ficam pra +Y
        k = dict(j, **{L + "UpLeg": j[L + "UpLeg"] + np.array([0, dy, 0]) for L in ("Left", "Right")})
        assert tc.quadril_linha_ombro_tornozelo(k) == pytest.approx([mm], abs=1e-6)
        de_brucos = girar(k, 80, (1, 0, 0))                       # cabeça pra −Y, costas pra cima, a cabeça 10° acima dos pés
        assert de_brucos["Neck"][1] < -1.0 and de_brucos["Neck"][2] > 0.2
        assert tc.quadril_linha_ombro_tornozelo(de_brucos) == pytest.approx([mm], abs=1e-6)
        assert tc.quadril_linha_ombro_tornozelo(girar(de_brucos, 35, (0, 0, 1))) == pytest.approx([mm], abs=1e-6)
    j = girar(em_pe(), 80, (1, 0, 0))
    for L, s in (("Left", 1), ("Right", -1)):                     # mão espalmada no chão, ao lado do ombro
        j[L + "Hand"] = np.array([s * 0.28, -1.20, 0.03])
    for graus in (0, 10, -15):
        for L, s in (("Left", 1), ("Right", -1)):                 # "pra dentro" = −s·x (o esquerdo fica em +X)
            a = math.radians(graus)
            j[L + "HandMiddle1"] = j[L + "Hand"] + 0.11 * np.array([-s * math.sin(a), -math.cos(a), 0.0])
        assert tc.dedos_mao_dentro(j) == pytest.approx([graus, graus], abs=1e-6)
        assert tc.dedos_mao_dentro(girar(j, 50, (0, 0, 1))) == pytest.approx([graus, graus], abs=1e-6)
    assert {"quadril_linha_ombro_tornozelo", "dedos_mao_dentro"} <= set(tc.MEDIDAS)


def sentado_coxas(graus_e, graus_d):
    """Sentado olhando pra −Y: coxas deitadas (joelho na altura do quadril) abertas `graus` pra fora, canelas em pé."""
    j = dict(em_pe())
    for L, s, g in (("Left", 1, graus_e), ("Right", -1, graus_d)):
        a = math.radians(g)
        h = j[L + "UpLeg"]
        j[L + "Leg"] = h + 0.42 * np.array([s * math.sin(a), -math.cos(a), 0.0])
        j[L + "Foot"] = j[L + "Leg"] + np.array([0, 0, -0.44])
    return j


def test_coxa_abertura_sentado_na_abdutora():
    """Cadeira abdutora (lote 4): coxas paralelas pra frente = 0; abertas 40° pro lado = +40 nos dois lados; fechando
    (cruzando pra dentro) = −; o mesmo número com o boneco virado em volta da vertical."""
    assert tc.coxa_abertura(sentado_coxas(0, 0)) == pytest.approx([0, 0], abs=1e-6)
    assert tc.coxa_abertura(sentado_coxas(40, 40)) == pytest.approx([40, 40], abs=1e-6)
    assert tc.coxa_abertura(sentado_coxas(25, -5)) == pytest.approx([25, -5], abs=1e-6)
    assert tc.coxa_abertura(girar(sentado_coxas(40, 30), 65, (0, 0, 1))) == pytest.approx([40, 30], abs=1e-6)
    assert "coxa_abertura" in tc.MEDIDAS


def test_joelho_no_plano_do_pe_e_alem_dos_dedos_no_agachamento_sumo():
    """Agachamento sumô (lote 7): pés virados 45° pra fora. Joelho em cima da linha do pé (tornozelo → base dos dedos) = 0, com o
    pé reto ou virado; joelho 2 cm pra dentro dessa linha (valgo) = −20, 2 cm pra fora = +20; o mesmo número com o boneco virado
    em volta da vertical. O joelho_alem_dos_dedos mede ao longo do pé até a ponta dos dedos: atrás = −, passou = +."""
    j = em_pe()
    for L in ("Left", "Right"):
        j[L + "ToeBase_ponta"] = j[L + "ToeBase"] + np.array([0, -0.05, -0.01])
    assert tc.joelho_plano_pe(j) == pytest.approx([0, 0], abs=1e-6)
    assert tc.joelho_alem_dos_dedos(j) == pytest.approx([-170, -170], abs=1e-6)       # joelho 2 cm à frente do tornozelo
    for L, s in (("Left", 1), ("Right", -1)):                                          # pés 45° pra fora, joelho em cima do pé
        j = pe_virado(j, L, 45)
        j[L + "ToeBase_ponta"] = girar({"t": j[L + "ToeBase_ponta"]}, s * 45, (0, 0, 1), j[L + "Foot"])["t"]
        p = np.array([s * math.sin(math.radians(45)), -math.cos(math.radians(45)), 0.0])
        j[L + "Leg"] = j[L + "Foot"] + 0.12 * p + np.array([0, 0, 0.40])
    assert tc.joelho_plano_pe(j) == pytest.approx([0, 0], abs=1e-6)
    ate_ponta = float(np.linalg.norm((j["LeftToeBase_ponta"] - j["LeftFoot"])[:2]))
    assert tc.joelho_alem_dos_dedos(j) == pytest.approx([(0.12 - ate_ponta) * 1000] * 2, abs=1e-6)
    fora = np.array([math.cos(math.radians(45)), math.sin(math.radians(45)), 0.0])     # normal do pé esquerdo, pra fora
    j2 = dict(j, LeftLeg=j["LeftLeg"] - 0.02 * fora, RightLeg=j["RightLeg"] + 0.02 * fora * np.array([-1, 1, 1]))
    assert tc.joelho_plano_pe(j2) == pytest.approx([-20, 20], abs=1e-6)
    assert tc.joelho_plano_pe(girar(j2, 70, (0, 0, 1))) == pytest.approx([-20, 20], abs=1e-6)
    assert tc.joelho_alem_dos_dedos(em_pe()) == []
    assert {"joelho_plano_pe", "joelho_alem_dos_dedos"} <= set(tc.MEDIDAS)
