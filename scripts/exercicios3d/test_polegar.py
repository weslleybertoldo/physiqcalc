# Polegar dando a volta na barra (polegar3d.py): rotações nos eixos anatômicos, cadeia do rig, pele por LBS, medida da
# pele (arestas e triângulos do avesso) e espelho entre as 2 mãos — sem o Blender.
# .venv/bin/python -m pytest -q test_polegar.py
import math
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
import polegar3d as pl  # noqa: E402

ESPELHO = np.diag([-1.0, 1.0, 1.0])      # esquerda ↔ direita (o boneco é simétrico em X)


def test_rodrigues_gira_na_regra_da_mao_direita():
    R = pl.rodrigues((0, 0, 1), 90)
    assert np.allclose(R @ [1, 0, 0], [0, 1, 0])
    assert np.allclose(R @ R.T, np.eye(3))


def test_cadeia_leva_o_filho_junto_e_nao_estica_os_ossos():
    cab = [np.array([0.0, 0, 0]), np.array([0.03, 0, 0]), np.array([0.07, 0, 0])]
    ponta = np.array([0.10, 0, 0])
    rots = [pl.rodrigues((0, 0, 1), 30), pl.rodrigues((0, 0, 1), 20), pl.rodrigues((0, 0, 1), 40)]
    Ms, j = pl.cadeia(cab, ponta, rots)
    comprimentos = [np.linalg.norm(j[i + 1] - j[i]) for i in range(3)]
    assert np.allclose(comprimentos, [0.03, 0.04, 0.03])
    # dobras no mesmo plano somam: a ponta aponta a 30 + 20 + 40 = 90° do eixo X
    d = j[3] - j[2]
    assert math.degrees(math.atan2(d[1], d[0])) == pytest.approx(90, abs=1e-6)
    # a 4×4 de cada osso leva a cabeça de repouso pra cabeça nova
    for k in range(3):
        assert np.allclose((Ms[k] @ np.append(cab[k], 1))[:3], j[k])


def test_lbs_sem_rotacao_devolve_o_repouso_e_mistura_os_ossos():
    H = np.c_[np.array([[0.01, 0.0, 0.0], [0.05, 0.01, 0.0]]), np.ones(2)]
    W = np.array([[1.0, 0, 0], [0.5, 0.5, 0]])
    fixo = np.zeros((2, 3))
    I = [np.eye(4)] * 3
    assert np.allclose(pl.lbs(H, W, fixo, I), H[:, :3])
    # metade no osso que girou 90° em volta da origem: o vértice cai no meio das duas posições (o LBS de verdade)
    M = pl.em_volta(pl.rodrigues((0, 0, 1), 90), np.zeros(3))
    out = pl.lbs(H, W, fixo, [np.eye(4), M, np.eye(4)])
    assert np.allclose(out[1], 0.5 * H[1, :3] + 0.5 * (M @ H[1])[:3])


def test_razoes_e_triangulos_do_avesso():
    co = np.array([[0.0, 0, 0], [1, 0, 0], [0, 1, 0]])
    E = np.array([[0, 1], [1, 2], [0, 2]])
    T = np.array([[0, 1, 2]])
    assert np.allclose(pl.razoes_arestas(co, co * 2, E), 2.0)
    n0 = pl.normais(co, T)
    R = np.eye(3)[None]
    assert pl.viradas(n0, co, T, R) == 0
    avesso = co.copy()
    avesso[2] = [0, -1, 0]                            # o triângulo dobrou por cima de si
    assert pl.viradas(n0, avesso, T, R) == 1
    # girar o triângulo inteiro junto com o osso não é avesso
    G = pl.rodrigues((1, 0, 0), 170)
    assert pl.viradas(n0, co @ G.T, T, G[None]) == 0


def _mao_esquerda():
    """Juntas de um polegar esquerdo de mentira (palma pra −Z, dedos pra −Y, o polegar do lado de −X) e a mão."""
    palma = np.array([0.0, 0, -1])
    nos = np.array([1.0, 0, 0])                        # indicador → mínimo
    cab = [np.array([-0.03, 0.0, 0.0]), np.array([-0.05, -0.02, -0.02]), np.array([-0.06, -0.05, -0.03])]
    ponta = np.array([-0.06, -0.075, -0.045])
    return palma, nos, cab, ponta


def test_eixos_anatomicos_tem_o_sentido_certo():
    palma, nos, cab, ponta = _mao_esquerda()
    e = pl.eixos_do_polegar(palma, cab, ponta)
    m = pl.unit(cab[1] - cab[0])
    # flexão leva a ponta do metacarpo pra polpa; abdução, pra frente da palma
    for nome, quer in (("flex", e["polpa"]), ("abd", palma)):
        R = pl.rodrigues(e[nome], 20)
        assert (R @ m - m) @ quer > 0, nome
    # pronação (+): a polpa gira pra palma da mão (−normal)
    R = pl.rodrigues(e["rot"], 20)
    assert (R @ e["polpa"] - e["polpa"]) @ (-palma) > 0
    # a flexão da IP (mesmo eixo) continua a dobra de repouso
    R = pl.rodrigues(e["flex"], 20)
    d2, d3 = pl.unit(cab[2] - cab[1]), pl.unit(ponta - cab[2])
    assert (R @ d3) @ d2 < d3 @ d2


def test_mesma_postura_da_a_mao_espelhada():
    palma, nos, cab, ponta = _mao_esquerda()
    eE = pl.eixos_do_polegar(palma, cab, ponta)
    eD = pl.eixos_do_polegar(ESPELHO @ palma, [ESPELHO @ c for c in cab], ESPELHO @ ponta)
    postura = (-9.5, -10.4, 5.0, 43.9, -7.3, 56.5)
    _, jE = pl.cadeia(cab, ponta, pl.rotacoes(eE, postura))
    _, jD = pl.cadeia([ESPELHO @ c for c in cab], ESPELHO @ ponta, pl.rotacoes(eD, postura))
    for a, b in zip(jE, jD):
        assert np.allclose(ESPELHO @ a, b, atol=1e-9)


def test_angulo_em_volta_da_barra():
    centro, eixo, palma = np.zeros(3), np.array([1.0, 0, 0]), np.array([0.0, 0, 1])
    assert pl.angulo_em_volta([0, 0, -0.02], centro, eixo, palma) == pytest.approx(0)       # lado da palma
    assert abs(pl.angulo_em_volta([0, 0, 0.02], centro, eixo, palma)) == pytest.approx(180)


def test_euler_zyx_volta_os_angulos():
    R = pl.rodrigues((1, 0, 0), 12) @ pl.rodrigues((0, 1, 0), -20) @ pl.rodrigues((0, 0, 1), 35)
    assert np.allclose(pl.euler_zyx(R), (35, -20, 12))


def test_angulos_entre_ossos_iguais_nas_2_maos():
    # metacarpo do polegar a 40° de flexão do 3º metacarpo (em volta do eixo radial): mesmo número nas 2 mãos
    # mão direita com a palma pra baixo e os dedos pra −Y: dorsal +Z, polegar (radial) em +X
    osso3, dorsal, radial = np.array([0, -1.0, 0]), np.array([0, 0, 1.0]), np.array([1.0, 0, 0])
    F3 = pl.quadro_cooney(osso3, dorsal, radial)
    assert np.linalg.det(F3) > 0
    Rf = pl.rodrigues(F3[:, 2], 40)                    # flexão: a ponta do osso desce pra palma
    assert (Rf @ osso3) @ (-dorsal) > 0
    F1 = pl.quadro_cooney(Rf @ osso3, Rf @ dorsal, Rf @ radial)
    assert np.allclose(pl.angulos_entre(F3, F1), (40, 0, 0), atol=1e-9)
    E3 = pl.quadro_cooney(ESPELHO @ osso3, ESPELHO @ dorsal, ESPELHO @ radial)
    E1 = pl.quadro_cooney(ESPELHO @ (Rf @ osso3), ESPELHO @ (Rf @ dorsal), ESPELHO @ (Rf @ radial))
    assert np.allclose(pl.angulos_entre(E3, E1), (40, 0, 0), atol=1e-9)


def test_busca_acha_o_melhor_viavel_e_respeita_as_faixas():
    # mínimo em (3, −2), mas só é viável com q0 ≤ 1 (o custo cobra a violação, como o polegar_em_volta): a busca fica
    # no melhor viável, (1, −2)
    custo = lambda q: ((q[0] - 3) ** 2 + (q[1] + 2) ** 2 + 100 * max(0.0, q[0] - 1), q[0] <= 1)
    q, J, viavel, n = pl.buscar(custo, [(0, 0), (-10, 5)], [(-20, 20), (-20, 20)])
    assert viavel and q == (1.0, -2.0) and J == pytest.approx(4.0)
    q, _, _, _ = pl.buscar(lambda q: (-q[0], True), [(0, 0)], [(-5, 5), (-5, 5)])
    assert q[0] == 5                                   # não passa da faixa
    assert pl.buscar(custo, [(0, 0)], [(-20, 20), (-20, 20)]) == pl.buscar(custo, [(0, 0)], [(-20, 20), (-20, 20)])


def test_busca_sem_nada_viavel_avisa():
    q, J, viavel, n = pl.buscar(lambda q: (abs(q[0]), False), [(4, 0)], [(-9, 9), (-9, 9)])
    assert not viavel and q[0] == 0


def test_custo_da_postura_zera_na_referencia_e_cobra_o_salto():
    ref = (0.0, 0.0, 0.0) + tuple(pl.REF_33MM[3:])
    assert pl.custo_postura(ref) == pytest.approx(0.0)
    um_dp = list(ref)
    um_dp[5] += pl.DP_33MM[5]                          # IP 1 DP acima da média medida
    assert pl.custo_postura(um_dp) == pytest.approx(0.0005)
    assert pl.custo_postura(ref, antes=um_dp) == pytest.approx(0.002 * pl.DP_33MM[5] / 5)


def test_referencia_e_a_de_goislard_2012():
    # "TMC joint is slightly extended and adducted with F–E and A–A angles of −9.5° ± 9.0° and −10.4° ± 6.5° ... The IP
    # and MP joints were largely flexed with 56.5° ± 14.9° and 43.9° ± 11.4° ... MP joint ... −7.3° ± 11° in A–A."
    assert pl.REF_33MM == (-9.5, -10.4, 0.0, 43.9, -7.3, 56.5)
    assert pl.DP_33MM[:2] == (9.0, 6.5) and pl.DP_33MM[3:] == (11.4, 11.0, 14.9)


def test_base_do_polegar_e_dono_dos_triangulos():
    pesos = {0: {"LeftHand": 1.0}, 1: {"LeftHand": 0.6, "LeftHandThumb1": 0.4}, 2: {"LeftHandThumb2": 1.0},
             3: {"LeftHandThumb2": 0.7, "LeftHandIndex1": 0.3}, 4: {"RightHandThumb1": 1.0}}
    assert pl.base_do_polegar(pesos, "Left") == {1, 3}
    assert pl.base_do_polegar(pesos, "Right") == {4}
    T = np.array([[0, 1, 2], [2, 3, 4]])
    assert pl.dono_dos_triangulos(T, pesos) == ["LeftHand", "LeftHandThumb2"]
    E = pl.arestas(np.array([[0, 1, 2], [2, 1, 3]]))
    assert E.tolist() == [[0, 1], [0, 2], [1, 2], [1, 3], [2, 3]]
