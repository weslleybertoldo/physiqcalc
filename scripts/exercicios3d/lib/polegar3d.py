# Polegar dando a VOLTA na barra/halter (lote 3, 05/10/2026, decisão dele: "1 mas não precisa corrigir os antigos, só
# para os novos") — a matemática pura (numpy, sem o Blender) do jeito novo do polegar. Quem usa é o
# pegada3d.fechar_em_volta(..., polegar_modo="volta"); o padrão continua o polegar de hoje (os 24 exercícios prontos).
# O polegar do rig (Thumb1 = metacarpo/CMC, Thumb2 = falange proximal/MCP, Thumb3 = falange distal/IP) gira nos eixos
# ANATÔMICOS tirados do próprio rig — CMC: flexão (em volta da normal da palma), abdução palmar (em volta de
# metacarpo × normal) e rotação axial (em volta do metacarpo); MCP e IP: flexão em volta do eixo de flexão do próprio
# polegar (o da dobra da IP em repouso) — e a pele é medida pelo mesmo LBS (linear blend skinning) do Blender e do app:
# alongamento das arestas da base do polegar e triângulos do avesso, contra a malha em repouso.
# Testes sem o Blender: .venv/bin/python -m pytest -q test_polegar.py
import math

import numpy as np


def rodrigues(eixo, graus):
    """Matriz 3×3 que gira `graus` em volta de `eixo` (regra da mão direita)."""
    k = np.asarray(eixo, float)
    k = k / np.linalg.norm(k)
    a = math.radians(graus)
    K = np.array([[0.0, -k[2], k[1]], [k[2], 0.0, -k[0]], [-k[1], k[0], 0.0]])
    return np.eye(3) + math.sin(a) * K + (1 - math.cos(a)) * (K @ K)


def em_volta(R, c):
    """4×4 que gira R (3×3) em volta do ponto c."""
    M = np.eye(4)
    M[:3, :3] = R
    M[:3, 3] = np.asarray(c, float) - R @ np.asarray(c, float)
    return M


def unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def cadeia(cabecas, ponta, rots):
    """Rotações (mundo, 3×3) aplicadas na cabeça de cada osso, da base pra ponta, como no rig (o filho vai junto):
    devolve as 4×4 acumuladas de cada osso e as juntas novas (cabeças + ponta)."""
    acum = np.eye(4)
    Ms, juntas = [], []
    for k, R in enumerate(rots):
        c = (acum @ np.append(cabecas[k], 1.0))[:3]
        acum = em_volta(R, c) @ acum
        Ms.append(acum.copy())
        juntas.append(c)
    juntas.append((acum @ np.append(ponta, 1.0))[:3])
    return Ms, juntas


# Postura do polegar: (cmc_flex, cmc_abd, cmc_rot, mcp_flex, mcp_abd, ip_flex), graus, na convenção de Goislard de
# Monsabert et al. 2012 (MSSE 44:1906, que usa os eixos de Cooney et al. 1981): em cada osso x = eixo do osso, y = dorsal
# (unha), z = eixo de flexão-extensão; "pronation, abduction, and flexion corresponded to positive joint angles";
# Euler "z (F–E), y (A–A), and x (P–S) around fixed axes". O zero da CMC é o metacarpo do rig em repouso em relação à
# mão (o polegar do MakeHuman em repouso já fica de frente pros dedos, como o trapézio: ver pegada3d).
CAMPOS = ("cmc_flex", "cmc_abd", "cmc_rot", "mcp_flex", "mcp_abd", "ip_flex")
# Pegada de força num cilindro de 33 mm (11 homens, força máxima, Vicon) — Goislard de Monsabert B, et al. Med Sci Sports
# Exerc 2012;44(10):1906–16: "TMC joint is slightly extended and adducted with F–E and A–A angles of −9.5° ± 9.0° and
# −10.4° ± 6.5°, respectively. The IP and MP joints were largely flexed with 56.5° ± 14.9° and 43.9° ± 11.4°,
# respectively. MP joint showed a slight adduction with −7.3° ± 11° in A–A." A rotação axial da CMC não foi medida
# (média 0); a amplitude TOTAL dela é 17° (Cooney et al. JBJS Am 1981;63:1371: "17 degrees of axial rotation
# (pronation-supination)") — a faixa de busca é ±8,5°.
REF_33MM = (-9.5, -10.4, 0.0, 43.9, -7.3, 56.5)
DP_33MM = (9.0, 6.5, 8.5, 11.4, 11.0, 14.9)          # desvio-padrão (rotação: meia amplitude total)


def eixos_do_polegar(palma, cabecas, ponta):
    """Eixos anatômicos do polegar solto (repouso em relação à mão), no mundo, com o sentido + de cada ângulo:
    m = metacarpo (CMC → MCP); flex = eixo de flexão do polegar (o da dobra da IP em repouso — a IP é uma dobradiça; a
    seção da falange distal da malha, mais larga de um lado ao outro, dá o mesmo eixo), + leva a ponta pra polpa;
    abd = eixo dorsal (unha) do metacarpo, + leva o metacarpo pra frente da palma (abdução palmar); rot = ±m, + =
    PRONAÇÃO (a polpa gira pra palma da mão, como na oposição). Os sentidos saem da geometria, então a mão direita sai
    espelhada da esquerda sem trocar sinal nenhum."""
    c1, c2, c3 = (np.asarray(x, float) for x in cabecas)
    tip = np.asarray(ponta, float)
    palma = unit(palma)
    m = unit(c2 - c1)
    flex = unit(np.cross(c3 - c2, tip - c3))                 # +θ continua a dobra de repouso da IP (flexão)
    polpa = np.cross(flex, tip - c3)                        # pra onde a ponta vai quando a IP dobra
    polpa = unit(polpa - m * (polpa @ m))
    dorsal = -polpa
    abd = dorsal if np.cross(dorsal, m) @ palma > 0 else -dorsal
    rot = m if np.cross(m, polpa) @ (-palma) > 0 else -m
    return dict(m=m, flex=flex, abd=abd, rot=rot, polpa=polpa)


def rotacoes(eixos, postura):
    """postura (CAMPOS, graus) → [R_CMC, R_MCP, R_IP] (3×3, mundo), cada uma aplicada na cabeça do seu osso (cadeia).
    CMC: Euler z (flexão), y (abdução), x (rotação) em eixos fixos do metacarpo em repouso; MCP: flexão e abdução em
    volta dos eixos do metacarpo já girado; IP: flexão em volta do eixo de flexão levado pela CMC e pela MCP."""
    cf, ca, cr, mf, ma, ipf = postura
    R1 = rodrigues(eixos["rot"], cr) @ rodrigues(eixos["abd"], ca) @ rodrigues(eixos["flex"], cf)
    R2 = rodrigues(R1 @ eixos["abd"], ma) @ rodrigues(R1 @ eixos["flex"], mf)
    R3 = rodrigues(R2 @ R1 @ eixos["flex"], ipf)
    return [R1, R2, R3]


def euler_zyx(R):
    """Ângulos (graus) da rotação R = Rx·Ry·Rz (Euler z, depois y, depois x, em eixos fixos — Goislard/Cooney):
    devolve (z, y, x) = (flexão, abdução, rotação)."""
    y = math.degrees(math.asin(max(-1.0, min(1.0, R[0, 2]))))
    z = math.degrees(math.atan2(-R[0, 1], R[0, 0]))
    x = math.degrees(math.atan2(-R[1, 2], R[2, 2]))
    return z, y, x


def quadro_cooney(osso, dorsal, radial):
    """Referencial de um osso como em Cooney/Goislard: x = eixo do osso pra trás (proximal), y = dorsal, z = radial
    (o eixo de flexão-extensão), ortonormalizado. Devolve a 3×3 (colunas x, y, z); na mão esquerda ela sai espelhada
    (det −1) — angulos_entre() corrige o sentido."""
    x = -unit(osso)
    y = unit(np.asarray(dorsal, float) - x * (np.asarray(dorsal, float) @ x))
    z = np.asarray(radial, float) - x * (np.asarray(radial, float) @ x) - y * (np.asarray(radial, float) @ y)
    return np.column_stack([x, y, unit(z)])


def angulos_entre(F_prox, F_dist):
    """(flexão, abdução, rotação) do osso distal em relação ao proximal (graus), Euler z-y-x em eixos fixos. Na mão
    esquerda os 2 referenciais saem espelhados juntos, então a conta dá os mesmos números da direita espelhada."""
    return euler_zyx(F_prox.T @ F_dist)


def lbs(H, W, fixo, Ms):
    """Pele por linear blend skinning (igual ao Armature do Blender e ao skinning do app): H = vértices em repouso
    (N×4, homogêneos), W = pesos dos 3 ossos do polegar (N×3), fixo = o que os outros ossos já põem (N×3), Ms = 4×4
    relativas (pose × repouso⁻¹) de cada osso do polegar."""
    out = np.array(fixo, float, copy=True)
    for j, M in enumerate(Ms):
        out += W[:, j:j + 1] * (H @ M.T)[:, :3]
    return out


def razoes_arestas(co_rep, co_pose, E):
    """Comprimento posado ÷ em repouso de cada aresta (E = pares de índices)."""
    l0 = np.linalg.norm(co_rep[E[:, 0]] - co_rep[E[:, 1]], axis=1)
    l1 = np.linalg.norm(co_pose[E[:, 0]] - co_pose[E[:, 1]], axis=1)
    return l1 / np.maximum(l0, 1e-12)


def normais(co, T):
    n = np.cross(co[T[:, 1]] - co[T[:, 0]], co[T[:, 2]] - co[T[:, 0]])
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-15)


def viradas(n_rep, co_pose, T, R_dom):
    """Quantos triângulos ficaram do avesso: a normal posada aponta contra a normal de repouso girada pelo osso de maior
    peso do triângulo (R_dom: 3×3 de cada triângulo, M×3×3)."""
    n1 = normais(co_pose, T)
    esperada = np.einsum("tij,tj->ti", R_dom, n_rep)
    return int((np.einsum("ti,ti->t", n1, esperada) < 0).sum())


def angulo_em_volta(p, centro, eixo, palma):
    """Ângulo (graus, −180…180) do ponto p em volta do eixo da barra, 0 = lado da palma."""
    u = unit(eixo)
    e1 = -(np.asarray(palma, float) - u * (np.asarray(palma, float) @ u))
    e1 = unit(e1)
    e2 = np.cross(u, e1)
    d = np.asarray(p, float) - np.asarray(centro, float)
    return math.degrees(math.atan2(d @ e2, d @ e1))


def custo_postura(q, ref=REF_33MM, dp=DP_33MM, antes=None, passo_antes=0.002):
    """Regularização (m equivalentes) da postura: perto da pegada medida na MCP e IP (0,5 mm por DP², Goislard 2012),
    CMC perto do repouso só como desempate (0,1 mm por (15°)²) e perto do quadro anterior (2 mm a cada 5°, como o
    POLEGAR_PASSO de hoje — a ponta não salta)."""
    q = np.asarray(q, float)
    z = (q[3:] - np.asarray(ref[3:], float)) / np.asarray(dp[3:], float)
    J = 0.0005 * float(z @ z) + 0.0001 * float(((q[:3] / 15.0) ** 2).sum())
    if antes is not None:
        J += passo_antes * float(np.abs(q - np.asarray(antes, float)).sum()) / 5.0
    return J


def buscar(custo, sementes, faixas, passos=(8.0, 4.0, 2.0, 1.0)):
    """Busca de padrão determinística: de cada semente, anda uma coordenada por vez (+passo/−passo), aceita o que
    baixa o custo e diminui o passo quando nada melhora. custo(q) → (J, viável). Devolve (q, J, viável) da melhor
    postura VIÁVEL avaliada (ou da melhor de todas, se nenhuma for viável) e quantas avaliações fez."""
    feitos = {}

    def J(q):
        k = tuple(round(min(max(float(x), a), b), 4) for x, (a, b) in zip(q, faixas))
        if k not in feitos:
            feitos[k] = custo(k)
        return k, feitos[k][0]

    for s in sementes:
        q, Jq = J(s)
        for passo in passos:
            mudou = True
            while mudou:
                mudou = False
                for i in range(len(q)):
                    for sinal in (1.0, -1.0):
                        qq = list(q)
                        qq[i] += sinal * passo
                        k, Jn = J(qq)
                        if Jn < Jq - 1e-9:
                            q, Jq, mudou = k, Jn, True
    viaveis = [(v[0], k) for k, v in feitos.items() if v[1]]
    if viaveis:
        Jb, kb = min(viaveis)
        return kb, Jb, True, len(feitos)
    Jb, kb = min((v[0], k) for k, v in feitos.items())
    return kb, Jb, False, len(feitos)


def arestas(tri):
    """Arestas únicas (pares de índices, menor primeiro) dos triângulos."""
    e = np.concatenate([tri[:, [0, 1]], tri[:, [1, 2]], tri[:, [2, 0]]])
    e.sort(axis=1)
    return np.unique(e, axis=0)


def base_do_polegar(pesos, lado):
    """Vértices da pele da BASE do polegar (eminência tenar e a prega entre polegar e indicador): os que têm peso no
    metacarpo (Thumb1), ou na falange proximal (Thumb2) junto com a palma ou o indicador. pesos = {vértice: {osso: peso}}."""
    L = lado + "Hand"
    out = set()
    for i, gs in pesos.items():
        if gs.get(L + "Thumb1", 0) > 0 or (gs.get(L + "Thumb2", 0) > 0 and (gs.get(L, 0) > 0 or gs.get(L + "Index1", 0) > 0)):
            out.add(int(i))
    return out


def dono_dos_triangulos(T, pesos):
    """Osso de maior peso somado nos 3 vértices de cada triângulo (None se nenhum tem peso)."""
    out = []
    for t in T:
        soma = {}
        for i in t:
            for n, w in pesos.get(int(i), {}).items():
                soma[n] = soma.get(n, 0.0) + w
        out.append(max(soma, key=soma.get) if soma else None)
    return out
