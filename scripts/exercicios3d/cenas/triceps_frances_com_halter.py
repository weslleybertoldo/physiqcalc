# Tríceps Francês com Halter — cena da fábrica 3D (lote 7, 08/10/2026; exercício dos treinos prontos do app).
# t = 0 começo: sentado, braços acima da cabeça com os cotovelos apontando pra cima, cotovelos bem dobrados e o halter
# atrás da cabeça · t = 1 fim: cotovelos estendidos (sem travar), halter acima da cabeça.
# Técnica (ExRx, Dumbbell Triceps Extension — 1 halter com as 2 mãos, sentado): pegada em coração embaixo da anilha de
# cima ("Position one dumbbell over head with both hands under inner plate (heart shaped grip)"), o antebraço desce atrás
# do braço com os cotovelos em cima ("With elbows over head, lower forearm behind upper arm by flexing elbows"), punhos
# dobrados embaixo pro halter não bater na nuca ("Flex wrists at bottom to avoid hitting dumbbell on back of neck"), sobe
# estendendo os cotovelos com os punhos indo pra trás ("Raise dumbbell over head by extending elbows while hyperextending
# wrists"), punhos juntos pros cotovelos não abrirem ("Position wrists closer together to keep elbows from pointing out too
# much"), encosto que não atrapalha o halter descer ("Back support should not be so high that it interferes with dumbbell
# being completely lowered") e corpo reto quando o ombro tem flexibilidade ("Position body more upright if shoulder flexion
# flexibility is adequate"). NFPT (Seated Tricep Extension with Dumbbells): costas retas no encosto, que não passa dos
# ombros ("Back support should not be higher than your shoulders"), mãos espalmadas embaixo do halter com o indicador e o
# polegar das 2 mãos fazendo um triângulo ("Index finger and thumb of both hands should make a triangle"), cotovelos perto
# das orelhas ("Keep your elbows in by your ears during the entire movement"), sem travar em cima. ACE (Triceps
# Extension): braços na vertical e parados ("Attempt to keep your upper arms vertical to the floor"), cotovelos apontando
# pra frente, sem travar ("elbows pointing forward, but not completely locked"), halter em pé ou um pouco inclinado em
# cima ("the dumbbell hanging vertically or angled slightly") e sem encostar na cabeça.
# Montagem: banco com encosto a 85° (equip3d.banco_inclinado), o topo do encosto 40 cm acima do assento, abaixo dos
# ombros (o halter passa longe dele). 1 halter (equip3d.halter, pegador de 29 mm, anilhas com 2 mm de chanfro: o halter é
# APOIO das mãos e a medida de zona erra o sinal em quina viva) em pé, seguro pelas 2 mãos: as palmas embaixo da anilha
# de cima, o pegador na prega polegar–indicador de cada mão, os 2 polegares dando a volta nele por trás (busca do polegar
# novo com a outra mão de obstáculo), os dedos rentes à anilha e curvando na borda dela. Braços PARADOS na vertical (167°
# do tronco, 12° fechados pra perto das orelhas), cintura escapular subida 15° (Ludewig 2009: a clavícula sobe quando o
# braço sobe); só os cotovelos mexem (118° → 12°), como dobradiça e sem o IK do Blender, os 2 antebraços fechando no
# halter; o halter fica em pé até 75° de flexão e inclina até 25° em cima (em pé, com as palmas embaixo da anilha e os
# antebraços na vertical, o punho passaria do teto de 55° do limites.py).
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import polegar3d as P3
import checagem3d as ck
import deitado3d as dt
from maos3d import Maos
from cena import Cena
from desenvolvimento_com_halteres import sentar_no_assento

LADOS = (("Left", 1), ("Right", -1))


class _AmbasMaos(str):
    """As 2 mãos juntas no mesmo pegador (pegada em coração): o checagem3d.quadro mede a pele da mão da pegada com
    n.startswith(lado + "Hand"); aqui lado + "Hand" = ("LeftHand", "RightHand"), então a regra de sempre (encosta até
    3 mm, não afunda mais que 5 mm e envolve 200° ou mais do pegador) vale pras 2 mãos juntas — cada uma, sozinha, cobre
    o lado dela do pegador e o polegar vai até o meio, atrás dele."""

    def __add__(self, outro):
        return ("Left" + outro, "Right" + outro)


AMBAS = _AmbasMaos("Ambas")
RAIO = 0.0145                  # pegador do halter: 29 mm
PEGADA = 0.135                 # pegador entre as anilhas (m)
R_ANILHA = 0.07                # raio das anilhas (m)
L_ANILHA = 0.05                # largura das anilhas (m)
CHANFRO = 0.002                # borda das anilhas arredondada 2 mm (o halter também é apoio das mãos: sem quina viva)
ANGULO = 85.0                  # encosto (graus da horizontal): sentado reto
ASSENTO = 0.44                 # topo do assento (m)
ENCOSTO = 0.40                 # comprimento do encosto a partir do assento (m): o topo fica abaixo dos ombros
ELEVA = 15.0                   # cintura escapular subindo com os braços acima da cabeça (graus, osso Shoulder)
FECHA = 12.0                   # braço inclinado pra dentro (graus da vertical): cotovelos perto das orelhas
FRENTE = -2.0                  # braço inclinado pra frente (graus da vertical; − = um pouco pra trás)
COTOVELO = (118.0, 12.0)       # flexão do cotovelo em t=0 (halter atrás da cabeça) → t=1 (em cima, sem travar)
INCLINA_CIMA = 25.0            # halter inclinado em cima (graus da vertical; a anilha de cima pra frente)
DOBRA_VERTICAL = 75.0          # a partir dessa flexão do cotovelo o halter fica na vertical
PSI = 8.0                      # dedos de cada mão girados pra dentro (graus): os indicadores fecham por cima do pegador
FURO = (0.085, -0.0715)        # eixo do pegador no plano da palma da mão espalmada: (ao longo da mão, de lado a lado) m
APERTO = 0.001                 # a pele aperta o halter até isso (m)
DEDOS = ("Index", "Middle", "Ring", "Pinky")


def _ossos_dedos(lado):
    return ["%sHand%s%d" % (lado, d, i) for d in DEDOS + ("Thumb",) for i in (1, 2, 3)]


def sentar(bon):
    """Sentado no banco com o encosto a ANGULO graus, glúteo no assento, lombar no encosto, pés chapados no chão e a
    cabeça na linha do tronco (o dt.inclinar estende o pescoço pra cabeça encostar no encosto alto: aqui o encosto é
    baixo e a cabeça fica livre). Devolve junta_y (onde o encosto cruza o assento)."""
    rig = bon.rig
    junta_y = dt.inclinar(bon, ANGULO, ASSENTO)
    rig.pose.bones[p3.P + "Neck"].matrix_basis = Matrix()
    p3.atualizar()
    sentar_no_assento(bon, junta_y)
    return junta_y


def cintura_escapular(rig, graus=ELEVA):
    """Os 2 ombros sobem com os braços acima da cabeça: o osso Shoulder (clavícula + escápula num osso só) gira `graus`
    em volta do eixo frente-trás do tronco, na base do pescoço, e a articulação do ombro sobe sem abrir pro lado (como
    no tríceps francês unilateral, lote 3)."""
    cima = (p3.cabeca(rig, "Neck") - p3.cabeca(rig, "Hips")).normalized()
    eixo = Vector((0.0, 1.0, 0.0))
    eixo = (eixo - cima * eixo.dot(cima)).normalized()
    sobe = {}
    for lado, s in LADOS:
        S0 = p3.cabeca(rig, lado + "Arm")
        R = Matrix.Rotation(math.radians(-s * graus), 3, eixo)
        H = p3.cabeca(rig, lado + "Shoulder")
        girado = H + R @ (S0 - H)
        p3.girar_osso(rig, lado + "Shoulder", R, mover=Vector((S0.x - girado.x, 0.0, 0.0)))
        sobe[lado] = (p3.cabeca(rig, lado + "Arm") - S0)
    return sobe


def braco_parado(rig, lado, s):
    """Ombro, direção do braço (parado: vertical, FECHA graus pra dentro e FRENTE pra frente) e cotovelo."""
    S = p3.cabeca(rig, lado + "Arm")
    Lb = (p3.cabeca(rig, lado + "ForeArm") - S).length
    La = (p3.cabeca(rig, lado + "Hand") - p3.cabeca(rig, lado + "ForeArm")).length
    k, f = math.radians(FECHA), math.radians(FRENTE)
    a = Vector((-s * math.sin(k), -math.sin(f), math.cos(k) * math.cos(f))).normalized()
    return dict(S=S, a=a, E=S + a * Lb, Lb=Lb, La=La)


def eixos_halter(th):
    """w = eixo do halter (da anilha de baixo pra de cima, onde ficam as palmas), hd = pra onde os dedos apontam."""
    t = math.radians(th)
    return Vector((0.0, -math.sin(t), math.cos(t))), Vector((0.0, math.cos(t), math.sin(t)))


def inclinacao(b):
    """Inclinação do halter (graus) com o cotovelo a b graus: INCLINA_CIMA em cima, vertical de DOBRA_VERTICAL pra baixo."""
    b1 = COTOVELO[1]
    x = max(0.0, min(1.0, (DOBRA_VERTICAL - b) / (DOBRA_VERTICAL - b1)))
    return INCLINA_CIMA * x * x * (3 - 2 * x)


def dedos_q(s, hd, w):
    ps = math.radians(PSI)
    d = hd * math.cos(ps) - Vector((s * math.sin(ps), 0.0, 0.0))
    return (d - w * d.dot(w)).normalized()


def sdf_halter(P, M):
    """Distância com sinal (m, − = dentro) dos pontos P (N×3) até o halter (pegador + 2 anilhas: 3 cilindros), com a
    matriz de mundo M da raiz (eixo local X)."""
    M = np.array(M)
    c, w = M[:3, 3], M[:3, 0] / np.linalg.norm(M[:3, 0])
    d = np.asarray(P, float) - c
    a = d @ w
    rho = np.linalg.norm(d - np.outer(a, w), axis=1)

    def cil(a0, meia, R):
        qx, qy = rho - R, np.abs(a - a0) - meia
        return np.minimum(np.maximum(qx, qy), 0.0) + np.hypot(np.maximum(qx, 0.0), np.maximum(qy, 0.0))

    meia_eixo = (PEGADA + 2 * L_ANILHA + 0.02) / 2
    ma = PEGADA / 2 + L_ANILHA / 2
    return np.minimum(np.minimum(cil(0.0, meia_eixo, RAIO), cil(ma, L_ANILHA / 2, R_ANILHA)),
                      cil(-ma, L_ANILHA / 2, R_ANILHA))


def sdf_pegador(P, M):
    """Distância com sinal (m) só até o pegador (cilindro infinito do eixo)."""
    M = np.array(M)
    c, w = M[:3, 3], M[:3, 0] / np.linalg.norm(M[:3, 0])
    d = np.asarray(P, float) - c
    a = d @ w
    return np.linalg.norm(d - np.outer(a, w), axis=1) - RAIO


PERFIL_1 = (15.0, 15.0, 10.0)  # dedo inteiro fechando (+) ou abrindo (−), graus por unidade, a partir do repouso do MakeHuman
PERFIL_2 = (0.0, 50.0, 40.0)   # só a falange média e a distal curvando (o dedo em volta da borda da anilha)
PERFIL_3 = (0.0, 0.0, 50.0)    # só a falange distal (a ponta do dedo enganchando na borda da anilha)
PHI_POLEGAR = 15.0             # polpa de cada polegar atrás do pegador (do lado do punho), isso pro lado da própria mão
                               # (graus): as 2 pontas se encontram atrás do pegador (o "triângulo" da NFPT)
FUNDO_POLEGAR = (0.010, 0.010)  # polpa do polegar esquerdo / direito abaixo da face da anilha (m)


def _pts_dedo(bon, lado, dedo):
    """Pele (nível 0) de cada falange do dedo, cabeças das juntas e a ponta."""
    rig = bon.rig
    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 0)
    pos = {n: i for i, n in enumerate(nomes)}
    ossos = ["%sHand%s%d" % (lado, dedo, i) for i in (1, 2, 3)]
    return (ossos, {o: co[dono == pos[o]] for o in ossos}, {o: np.array(p3.cabeca(rig, o)) for o in ossos},
            np.array(p3.ponta(rig, ossos[-1])))


def fechar_dedos_no_halter(bon, lado, M):
    """Cada dedo (indicador ao mínimo) da mão espalmada encosta no halter, em 3 etapas: 1) o dedo inteiro fecha (ou
    abre, até reto) até a pele encostar sem entrar (dedos rentes à face de baixo da anilha) — se não alcança nada, fica
    só um pouco curvado; 2) a falange média e a distal curvam em volta da borda da anilha; 3) só a distal (a ponta
    engancha na borda). As etapas 2 e 3 só ficam se o dedo encosta no halter (senão o dedo fecharia no ar). Devolve
    {dedo: (λ1, λ2, λ3, folga mm)}: a folga é a pele do dedo mais perto do halter (− = afundando)."""
    rig = bon.rig
    palma, eixo_nos = pg._base(rig, lado)[:2]
    eixos = [np.array(eixo_nos)] * 3
    out = {}
    for d in DEDOS:
        ossos = ["%sHand%s%d" % (lado, d, i) for i in (1, 2, 3)]
        f = (p3.ponta(rig, ossos[0]) - p3.cabeca(rig, ossos[0])).normalized()
        sinal = 1 if eixo_nos.cross(f).dot(palma) > 0 else -1
        lams = []
        for perfil, de, ate, so_encostando in ((PERFIL_1, 0.8, -1.2, False), (PERFIL_2, 1.4, 0.0, True),
                                                (PERFIL_3, 1.4, 0.0, True)):
            ossos, pts, cab, ponta = _pts_dedo(bon, lado, d)
            escolha = ate
            for lam in np.arange(de, ate - 1e-4, -0.02):
                pp = pg._cadeia_pts(pts, cab, ponta, ossos, eixos, [lam * a * sinal for a in perfil])
                sd = float(sdf_halter(np.concatenate([pp[o] for o in ossos]), M).min())
                if sd >= -APERTO:
                    escolha = float(lam) if (sd <= 0.003 or not so_encostando) else 0.0
                    break
            for k, o in enumerate(ossos):
                if escolha * perfil[k]:
                    p3.girar_osso(rig, o, p3.rot_eixo(escolha * perfil[k] * sinal, eixo_nos))
            lams.append(round(escolha, 2))
        ossos, pts, cab, ponta = _pts_dedo(bon, lado, d)
        out[d] = tuple(lams) + (round(float(sdf_halter(np.concatenate([pts[o] for o in ossos]), M).min()) * 1000, 1),)
    return out


def polegar_coracao(bon, lado, M, alvo, outra, com_polegar_da_outra, aperto=APERTO, com_anilha=True):
    """Polegar da mão `lado` dando a volta no pegador na pegada em coração (palma embaixo da anilha de cima, pegador na
    prega entre o polegar e o indicador). É a busca do pegada3d.polegar_em_volta (eixos anatômicos do polegar, pele por
    LBS, MCP e IP perto da pegada medida de Goislard 2012, pele da base sem esticar mais que 2,5× nem virar do avesso)
    com outro alvo e outros obstáculos: a polpa vai pro `alvo` (na volta do pegador) encostando nele, e nada do polegar
    entra no halter (pegador e anilhas), nos dedos e na palma da própria mão nem na `outra` mão (com o polegar dela, se
    `com_polegar_da_outra`: os 2 polegares se cruzam em volta do pegador, um embaixo do outro). Põe o polegar no Blender
    e devolve as medidas."""
    rig = bon.rig
    ossos = [lado + "HandThumb%d" % i for i in (1, 2, 3)]
    for o in ossos:
        rig.pose.bones[p3.P + o].matrix_basis = Matrix.Identity(4)
    p3.atualizar()
    pele = pg._pele(bon)
    pesos = pele["pesos"]
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 0)
    pos = {n: i for i, n in enumerate(nomes)}
    M = np.array(M)
    idx = np.array(sorted(i for i, gs in pesos.items() if any(o in gs for o in ossos)))
    W = np.array([[pesos[i].get(o, 0.0) for o in ossos] for i in idx])
    H = np.c_[pele["co"][idx], np.ones(len(idx))]
    fixos = {}
    fixo = np.zeros((len(idx), 3))
    for k, i in enumerate(idx):
        for n, w_ in pesos[i].items():
            if n not in ossos:
                if n not in fixos:
                    fixos[n] = pg._rel(rig, n)
                fixo[k] += w_ * (fixos[n] @ H[k])[:3]
    M0 = [pg._rel(rig, o) for o in ossos]
    cab = [np.array(p3.cabeca(rig, o)) for o in ossos]
    ponta = np.array(p3.ponta(rig, ossos[2]))
    eixos = P3.eixos_do_polegar(np.array(pg._base(rig, lado)[0]), cab, ponta)
    base = P3.base_do_polegar(pesos, lado)
    E_, T_ = pele["E"], pele["tri"]
    Eb = E_[np.isin(E_, list(base)).any(axis=1)]
    Tb = T_[np.isin(T_, list(base)).any(axis=1)]
    l0 = np.linalg.norm(pele["co"][Eb[:, 0]] - pele["co"][Eb[:, 1]], axis=1)
    n0 = P3.normais(pele["co"], Tb)
    donos = P3.dono_dos_triangulos(Tb, pesos)
    dono_k = np.array([ossos.index(n) if n in ossos else -1 for n in donos])
    R_fixo = np.array([fixos.get(n, pg._rel(rig, n) if n else np.eye(4))[:3, :3] if n not in ossos else np.eye(3)
                       for n in donos])
    tem = np.zeros(len(co), bool)
    tem[idx] = True
    ok = {pos[lado + "Hand"]} | {pos["%sHand%s%d" % (lado, d, i)] for d in p3.DEDOS for i in (1, 2, 3)}
    t_ok = tri[np.isin(dono[tri], list(ok)).all(axis=1) & ~tem[tri].any(axis=1)]
    bvh = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(t) for t in t_ok], all_triangles=True)
    oo = {i for i, n in enumerate(nomes) if n.startswith(outra + "Hand") and (com_polegar_da_outra or "Thumb" not in n)}
    t_outra = tri[np.isin(dono[tri], list(oo)).all(axis=1)]
    bvh_o = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(t) for t in t_outra], all_triangles=True)
    linha = {int(i): k for k, i in enumerate(idx)}
    d_pol = [pos[o] for o in ossos]
    k_pol = np.array([linha[int(i)] for i in idx if dono[i] in d_pol])
    k_teste = np.array([linha[int(i)] for i in idx if dono[i] in d_pol and not any(
        n in pesos[int(i)] for n in (lado + "Hand", lado + "HandIndex1", lado + "ForeArm"))])
    k_ponta = np.array([linha[int(i)] for i in idx if dono[i] == d_pol[2]])
    k_prox = np.array([linha[int(i)] for i in idx if dono[i] == d_pol[1]])
    alvo = np.asarray(alvo, float)
    wv = M[:3, 0] / np.linalg.norm(M[:3, 0])
    face = M[:3, 3] + wv * (PEGADA / 2)
    P = co.copy()

    def medir(q):
        rots = P3.rotacoes(eixos, q)
        Mc, juntas = P3.cadeia(cab, ponta, rots)
        Ms = [Mc[k] @ M0[k] for k in range(3)]
        Q = P3.lbs(H, W, fixo, Ms)
        D = Q[k_pol]
        halt = max(0.0, -float((sdf_halter(D, M) if com_anilha else sdf_pegador(D, M)).min()))
        acima = max(0.0, float(((D - face) @ wv).max()) + aperto)
        P[idx] = Q
        alonga = float((np.linalg.norm(P[Eb[:, 0]] - P[Eb[:, 1]], axis=1) / l0).max())
        R = R_fixo.copy()
        for k in range(3):
            R[dono_k == k] = Ms[k][:3, :3]
        vir = P3.viradas(n0, P, Tb, R)
        entra = fora = 0.0
        for v in Q[k_teste]:
            vv = Vector(v)
            loc, nor, _, dist = bvh.find_nearest(vv)
            if loc is not None and dist < 0.03 and (vv - loc).dot(nor) < 0:
                entra = max(entra, dist)
        for v in D[::2]:
            vv = Vector(v)
            loc, nor, _, dist = bvh_o.find_nearest(vv)
            if loc is not None and dist < 0.03 and (vv - loc).dot(nor) < 0:
                fora = max(fora, dist)
        sd_D = sdf_halter(D, M)
        sp_D = sdf_pegador(D, M)
        return dict(rots=rots, halt=halt, acima=acima, alonga=alonga, viradas=vir, entra=entra, outra=fora,
                    no_pegador=max(0.0, -float(sp_D.min())), na_anilha=max(0.0, -float(np.where(sp_D > 0.001, sd_D, 1).min())),
                    vao_d=max(0.0, float(sdf_pegador(Q[k_ponta], M).min())),
                    vao_p=max(0.0, float(sdf_pegador(Q[k_prox], M).min())),
                    alvo=float(np.linalg.norm(Q[k_ponta].mean(axis=0) - alvo)))

    def custo(q):
        m = medir(q)
        viola = (10 * max(0.0, m["halt"] - aperto) + 10 * max(0.0, m["entra"] - pg.POLEGAR_ENTRA) +
                 10 * max(0.0, m["outra"] - aperto) + 0.05 * max(0.0, m["alonga"] - pg.POLEGAR_ALONGA_MAX) +
                 0.003 * m["viradas"])
        return (m["vao_d"] + 0.5 * m["vao_p"] + 0.3 * m["alvo"] + (0 if com_anilha else 0.5 * m["acima"]) + viola +
                P3.custo_postura(q), viola == 0)

    grade = [(cf, ca, cr, mf, P3.REF_33MM[4], ipf) for cf in (-40, -20, 0, 20, 40) for ca in (-30, -10, 10, 30, 50)
             for cr in (-30, 0, 30) for mf in (10, 35, 60) for ipf in (20, 50, 80)]
    sementes = [q for _, q in sorted((custo(q)[0], q) for q in grade)[:10]] + [P3.REF_33MM]
    q, J, viavel, n = P3.buscar(custo, sementes, pg.POLEGAR_FAIXAS)
    m = medir(q)
    if viavel:
        for o, R in zip(ossos, m["rots"]):
            if not np.allclose(R, np.eye(3)):
                p3.girar_osso(rig, o, Matrix(R.tolist()))
    return dict(q=tuple(round(float(x), 1) for x in q), viavel=bool(viavel), avaliacoes=n,
                **{k: (round(v * 1000, 1) if k in ("halt", "entra", "outra", "vao_d", "vao_p", "alvo", "no_pegador",
                                                   "na_anilha", "acima") else v)
                   for k, v in m.items() if k != "rots"})


def montar(bon):
    pg.usar_polegar("volta")
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)
    junta_y = sentar(bon)
    banco = e3.banco_inclinado("banco", ANGULO, ASSENTO, junta_y, encosto=ENCOSTO)
    sobe = cintura_escapular(rig)
    G = {lado: braco_parado(rig, lado, s) for lado, s in LADOS}
    print("OMBROS sobem E %.1f mm D %.1f mm | ombro E (%.3f %.3f %.3f) cotovelo E (%.3f %.3f %.3f)" % (
        sobe["Left"].length * 1000, sobe["Right"].length * 1000, *G["Left"]["S"], *G["Left"]["E"]))

    halter = e3.halter("halter", pegada=PEGADA, raio=RAIO, raio_anilha=R_ANILHA, larg_anilha=L_ANILHA, chanfro=CHANFRO)
    halter.rotation_mode = "QUATERNION"
    maos = Maos(bon, RAIO, polegar_modo="volta")

    # vão da pegada em coração: o eixo do pegador atravessa o plano da palma na prega polegar–indicador (mão espalmada)
    for lado, _ in LADOS:
        p3.soltar_dedos(rig, lado)
        pg.juntar_dedos(rig, lado)
        palma, eixo_nos, dir_mao, nos, larg = pg._base(rig, lado)
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 0)
        m = np.array([n == lado + "Hand" for n in nomes] + [False])[dono]
        O = c(lado + "Hand")
        n_pele = float(((co[m] - np.array(O)) @ np.array(palma)).max())
        g = O + dir_mao * FURO[0] + eixo_nos * FURO[1] + palma * (n_pele - APERTO)
        maos.furo[lado] = p3.mundo_osso(rig, lado + "Hand").inverted() @ g
        print("FURO %s n_pele %.4f | furo local (%.4f %.4f %.4f)" % (lado, n_pele, *maos.furo[lado]))

    def colocar_halter(g, w, hd):
        R = Matrix((w, Vector((1.0, 0.0, 0.0)), hd)).transposed()
        halter.rotation_quaternion = R.to_quaternion()
        halter.location = g - w * (PEGADA / 2)

    # punho em relação ao vão (fixo o movimento todo), no referencial (dedos, palma, lado), de uma pose de referência
    off = {}
    w0, hd0 = eixos_halter(0.0)
    g0 = Vector((0.0, 0.25, 1.15))
    for lado, s in LADOS:
        dq = dedos_q(s, hd0, w0)
        maos.segurar(lado, g0, dq, w0, polo=G[lado]["E"] + Vector((s * 0.3, -0.3, 0.0)))
        W = c(lado + "Hand")
        lat = dq.cross(w0)
        off[lado] = ((W - g0).dot(dq), (W - g0).dot(w0), (W - g0).dot(lat))
        print("REF %s punho − vão (%.4f %.4f %.4f) | erro do vão %.1f mm" % (lado, *off[lado], maos.erro[lado] * 1000))

    def punho_rel(lado, s, w, hd):
        dq = dedos_q(s, hd, w)
        o = off[lado]
        return dq, dq * o[0] + w * o[1] + dq.cross(w) * o[2]

    def resolver(b, th):
        """Vão g (no eixo do pegador, na face de dentro da anilha de cima) e punhos com o cotovelo esquerdo a b graus e o
        halter inclinado th, com os 2 cotovelos parados (E) e cada antebraço do seu comprimento: começa pela solução
        simétrica (g no plano do meio) e acerta o g em 3D (as mãos do boneco não são espelho perfeito: ~3 mm)."""
        w, hd = eixos_halter(th)
        g_E = G["Left"]
        dq, v = punho_rel("Left", 1, w, hd)
        a, La, E = g_E["a"], g_E["La"], g_E["E"]
        c1 = (v.x - E.x) / La
        c2 = math.cos(math.radians(b)) - a.x * c1
        ayz = math.hypot(a.y, a.z)
        u = Vector((a.y, a.z)) / ayz
        perp = Vector((-u.y, u.x))
        d0 = c2 / ayz
        h = math.sqrt(max(1.0 - c1 * c1 - d0 * d0, 0.0))
        fyz = max([u * d0 + perp * h, u * d0 - perp * h], key=lambda q: q.x)   # o antebraço vai pra trás da cabeça
        g = E + Vector((c1, fyz.x, fyz.y)) * La - v
        vs = {lado: punho_rel(lado, s, w, hd)[1] for lado, s in LADOS}

        def F(gg):
            fl = gg + vs["Left"] - G["Left"]["E"]
            fr = gg + vs["Right"] - G["Right"]["E"]
            return Vector((fl.length - G["Left"]["La"], fl.dot(G["Left"]["a"]) - G["Left"]["La"] * math.cos(math.radians(b)),
                           fr.length - G["Right"]["La"]))

        for _ in range(8):                               # Newton com jacobiano numérico
            f0 = F(g)
            if f0.length < 1e-6:
                break
            J = Matrix.Identity(3)
            for k in range(3):
                dg = Vector((0.0, 0.0, 0.0))
                dg[k] = 1e-5
                col = (F(g + dg) - f0) / 1e-5
                for i in range(3):
                    J[i][k] = col[i]
            g = g - J.inverted() @ f0
        Ws = {lado: g + vs[lado] for lado, _ in LADOS}
        return g, Ws, w, hd

    def polo(lado, W):
        S, E = G[lado]["S"], G[lado]["E"]
        eixo = (W - S).normalized()
        fora = (E - S) - eixo * (E - S).dot(eixo)
        return E + fora.normalized() * 0.4

    pose_dedos = {}
    braco_ref = {}

    def braco_fk(lado, W):
        """Braço parado (o osso do braço só gira em volta do próprio eixo: rotação do úmero) e o cotovelo dobrando como
        dobradiça (eixo fixo no braço) até o punho cair em W — exato, sem o IK do Blender (perto de esticado o IK
        trava o braço reto: 12° de flexão encurtam o braço só 2,8 mm)."""
        r = braco_ref[lado]
        S, E, a = G[lado]["S"], G[lado]["E"], G[lado]["a"]
        f = (W - E).normalized()
        n = a.cross(f)
        n = n.normalized() if n.length > 1e-6 else r["n"]
        fi = math.atan2(r["n"].cross(n).dot(a), r["n"].dot(n))
        Rt = Matrix.Translation(S) @ Matrix.Rotation(fi, 4, a) @ Matrix.Translation(-S)
        Rh = Matrix.Translation(E) @ Matrix.Rotation(a.angle(f) - r["b"], 4, n) @ Matrix.Translation(-E)
        PB[p3.P + lado + "Arm"].matrix = Rt @ r["MA"]
        p3.atualizar()
        PB[p3.P + lado + "ForeArm"].matrix = Rh @ Rt @ r["MF"]
        p3.atualizar()

    def mao_fk(lado, dq, pq):
        """Antebraço gira (pronação/supinação) pra palma e o resto vai no punho, como no maos3d.Maos.segurar."""
        pq = (pq - dq * pq.dot(dq)).normalized()
        ax = (c(lado + "Hand") - c(lado + "ForeArm")).normalized()
        quer = pq - ax * pq.dot(ax)
        tem = pg._base(rig, lado)[0]
        tem = tem - ax * tem.dot(ax)
        if quer.length > 1e-6 and tem.length > 1e-6:
            quer.normalize()
            tem.normalize()
            p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(math.atan2(tem.cross(quer).dot(ax), tem.dot(quer)), 3, ax))
        y_m = (p3.ponta(rig, lado + "Hand") - c(lado + "Hand")).normalized()
        n_m = pg._base(rig, lado)[0]
        n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
        F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
        F_quer = Matrix((dq, pq, dq.cross(pq))).transposed()
        p3.girar_osso(rig, lado + "Hand", F_quer @ F_tem.transposed())

    def pose(t):
        """t=0 cotovelos dobrados (halter atrás da cabeça), t=1 braços estendidos acima da cabeça."""
        b = p3.lerp(*COTOVELO, t)
        th = inclinacao(b)
        g, Ws, w, hd = resolver(b, th)
        colocar_halter(g, w, hd)
        for lado, s in LADOS:
            if lado in braco_ref:                       # braço parado + cotovelo como dobradiça, sem o IK do Blender
                maos.iks[lado].mute = True
                braco_fk(lado, Ws[lado])
                mao_fk(lado, dedos_q(s, hd, w), w)
                maos.erro[lado] = (g - p3.mundo_osso(rig, lado + "Hand") @ maos.furo[lado]).length
            else:
                maos.segurar(lado, g, dedos_q(s, hd, w), w, polo=polo(lado, Ws[lado]))
        for nome, M in pose_dedos.items():
            PB[p3.P + nome].matrix_basis = M
        p3.atualizar()
        pose.b, pose.th = b, th
        pose.alcance = {lado: ((Ws[lado] - G[lado]["S"]).length - G[lado]["Lb"] - G[lado]["La"]) * 1000 for lado, _ in LADOS}
        pose.punho_fora = {lado: (c(lado + "Hand") - Ws[lado]).length * 1000 for lado, _ in LADOS}
        pose.desvio = {lado: (c(lado + "ForeArm") - G[lado]["E"]).length * 1000 for lado, _ in LADOS}

    pose.b = pose.th = 0.0
    pose.desvio = {}

    pose(0.5)
    for lado, _ in LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)
    pose(0.5)
    for lado, _ in LADOS:                              # referência do FK: o braço dobrado que o IK achou em t=0,5
        S, a = G[lado]["S"], G[lado]["a"]
        R = (c(lado + "ForeArm") - S).normalized().rotation_difference(a).to_matrix().to_4x4()
        Rs = Matrix.Translation(S) @ R @ Matrix.Translation(-S)       # cotovelo exatamente em E
        MA, MF = Rs @ PB[p3.P + lado + "Arm"].matrix, Rs @ PB[p3.P + lado + "ForeArm"].matrix
        f = (Rs @ c(lado + "Hand") - Rs @ c(lado + "ForeArm")).normalized()
        braco_ref[lado] = dict(MA=MA, MF=MF, n=a.cross(f).normalized(), b=a.angle(f))
    # pegada em coração, uma vez só (a mão não mexe em relação ao halter): dedos rentes à anilha de cima e curvando na
    # borda dela, polegares dando a volta no pegador (o esquerdo colado na anilha, o direito por baixo dele)
    pose(0.5)
    Mh = halter.matrix_world.copy()
    w_, hd_ = Mh.to_3x3() @ Vector((1.0, 0.0, 0.0)), Mh.to_3x3() @ Vector((0.0, 0.0, 1.0))
    for lado, _ in LADOS:
        p3.soltar_dedos(rig, lado)
        pg.juntar_dedos(rig, lado)
    p3.atualizar()
    face = Mh.to_translation() + w_ * (PEGADA / 2)
    fi = math.radians(PHI_POLEGAR)
    for (lado, s), fundo, outra, com in ((LADOS[0], FUNDO_POLEGAR[0], "Right", False),
                                          (LADOS[1], FUNDO_POLEGAR[1], "Left", True)):
        alvo = face - w_ * fundo + (-hd_ * math.cos(fi) + Vector((s * math.sin(fi), 0.0, 0.0))) * (RAIO + 0.008)
        r = polegar_coracao(bon, lado, Mh, alvo, outra, com, com_anilha=False)
        print("POLEGAR %s %s" % (lado, r))
    # a anilha de cima encosta na pele mais alta da mão embaixo dela (eminência tenar, polegar, base dos dedos): sobe o
    # halter ao longo do eixo (o vão de cada mão sobe junto) até nada entrar mais que APERTO
    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 0)
    sobe = -1.0
    for lado, _ in LADOS:
        m = np.array([n == lado + "Hand" or n.startswith(lado + "HandThumb") or (n.startswith(lado + "Hand") and n.endswith("1"))
                      for n in nomes] + [False])[dono]
        Pm = co[m] - np.array(face)
        ax = Pm @ np.array(w_)
        rho = np.linalg.norm(Pm - np.outer(ax, np.array(w_)), axis=1)
        sob = (rho < R_ANILHA + 0.002) & (ax > -0.03)
        sobe = max(sobe, float(ax[sob].max()) - APERTO if sob.any() else -1.0)
    for lado, _ in LADOS:
        nl = (p3.mundo_osso(rig, lado + "Hand").inverted().to_3x3() @ w_).normalized()
        maos.furo[lado] = maos.furo[lado] + nl * sobe
        o = off[lado]
        off[lado] = (o[0], o[1] - sobe, o[2])
    print("HALTER sobe %.1f mm pra anilha encostar na mão sem entrar" % (sobe * 1000))
    salvo = {nome: PB[p3.P + nome].matrix_basis.copy() for lado, _ in LADOS for nome in _ossos_dedos(lado)}
    pose(0.5)
    for nome, M in salvo.items():
        PB[p3.P + nome].matrix_basis = M
    p3.atualizar()
    Mh = halter.matrix_world.copy()
    for lado, _ in LADOS:
        print("DEDOS %s (λ1, λ2, λ3, folga mm) %s" % (lado, fechar_dedos_no_halter(bon, lado, Mh)))
    for lado, _ in LADOS:
        for nome in _ossos_dedos(lado):
            pose_dedos[nome] = PB[p3.P + nome].matrix_basis.copy()

    for t in (0.0, 0.5, 1.0):
        pose(t)
        j = ck.medir_juntas(rig)
        print("POSE t=%.1f | cotovelo E %.0f D %.0f | punho E %.0f D %.0f | ombro E %.0f D %.0f | halter %.0f° | "
              "cotovelo fora E %.1f D %.1f mm | vão (%.3f %.3f %.3f) | erro vão E %.1f D %.1f mm | alcance E %.1f D %.1f mm"
              " | punho fora E %.1f D %.1f mm" % (
                  t, j["cotoveloE"], j["cotoveloD"], j["punhoE"], j["punhoD"], j["ombroE"], j["ombroD"], pose.th,
                  pose.desvio["Left"], pose.desvio["Right"], *(halter.location + halter.matrix_world.to_3x3() @
                                                               Vector((PEGADA / 2, 0, 0))),
                  maos.erro["Left"] * 1000, maos.erro["Right"] * 1000, pose.alcance["Left"], pose.alcance["Right"],
                  pose.punho_fora["Left"], pose.punho_fora["Right"]))

    cab_co, cab_tri = ck._avaliar_simples(bon.cabelo)
    bvh_cabelo = BVHTree.FromPolygons([tuple(x) for x in cab_co], [tuple(t) for t in cab_tri], all_triangles=True)
    barra = ck.Barra(halter, raio=RAIO, meio_compr=PEGADA / 2)

    def medidas():
        """Mãos × halter (pele, nível 1, até o halter analítico: − = afundando), pegada de cada mão e das 2 juntas no
        pegador, mão × mão, antebraço/mão × cabelo e halter × cabelo (mm)."""
        co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        Mh = halter.matrix_world
        out = {}
        mao = {}
        for lado, _ in LADOS:
            mao[lado] = np.array([n.startswith(lado + "Hand") for n in nomes] + [False])[dono]
            out["mao%s_halter" % lado[0]] = float(sdf_halter(co[mao[lado]], Mh).min()) * 1000
            g = ck._pegada(co, nomes, dono, lado, barra)
            out["peg%s" % lado[0]] = (g["encosto"], g["envolve"])
        g = ck._pegada(co, nomes, dono, AMBAS, barra)
        out["peg2"] = (g["encosto"], g["envolve"])
        tri_d = tri[mao["Right"][tri].all(axis=1)]
        bvh_d = BVHTree.FromPolygons([tuple(x) for x in co], [tuple(t) for t in tri_d], all_triangles=True)
        menor = 1e9
        for v in co[mao["Left"]][::2]:
            vv = Vector(v)
            loc, nor, _, d = bvh_d.find_nearest(vv)
            if loc is not None:
                menor = min(menor, -d if (d < 0.03 and (vv - loc).dot(nor) < 0) else d)
        out["mao_mao"] = menor * 1000
        bm = np.array([n.endswith("ForeArm") or n.startswith(("LeftHand", "RightHand")) for n in nomes] + [False])[dono]
        out["antebraco_cabelo"] = min(bvh_cabelo.find_nearest(Vector(v))[3] for v in co[bm][::3]) * 1000
        out["halter_cabelo"] = float(sdf_halter(cab_co, Mh).min()) * 1000
        return out

    def info():
        j = ck.medir_juntas(rig)
        m = medidas()
        return ("punho E %.0f° D %.0f° | erro do vão E %.1f D %.1f mm | cotovelo %.1f° | halter %.1f° | cotovelo fora do "
                "calculado E %.1f D %.1f mm | mão × halter E %.1f D %.1f mm | pegada E %+.1f mm %.0f° · D %+.1f mm %.0f° · "
                "as 2 %+.1f mm %.0f° | mão × mão %.1f mm | antebraço/mão × cabelo %.0f mm | halter × cabelo %.0f mm") % (
            j["punhoE"], j["punhoD"], maos.erro["Left"] * 1000, maos.erro["Right"] * 1000, pose.b, pose.th,
            pose.desvio.get("Left", 0), pose.desvio.get("Right", 0), m["maoL_halter"], m["maoR_halter"], *m["pegL"],
            *m["pegR"], *m["peg2"], m["mao_mao"], m["antebraco_cabelo"], m["halter_cabelo"])

    # o halter é o peso (equipamento: a checagem de peso × corpo vale pra ele) e também o APOIO das mãos — as palmas o
    # seguram por baixo da anilha de cima: assim as zonas mão × halter da ficha medem da pele de cada mão até as 3
    # peças do halter (cilindros fechados e convexos), o jeito da checagem pro banco. Medido do halter até a pele (o
    # jeito do equipamento), o sinal errava embaixo da ponta dos polegares (−26 mm falsos, 08/10/2026: o pegador passa
    # a 2–3 cm da ponta do polegar e o triângulo mais perto é o de cima dela). Sem pegadas de barra: a regra de envolver
    # 200° do pegador é da pegada de força (dedos em volta da barra); aqui as palmas ficam embaixo da anilha, os dedos na
    # borda dela e os 2 polegares fecham o pegador por trás (ExRx: "heart shaped grip"; NFPT: "Index finger and thumb of
    # both hands should make a triangle") — as 2 mãos juntas envolvem ~170° dele (info: "as 2").
    return Cena(pose, [halter], pegadas=[], apoio_mm=0.0, foco_luz=(0, 0.1, 1.2),
                camera_video=((3.6, -1.6, 1.4), (0, 0.1, 1.15), 50), info=info, apoios=[banco, halter], afunda_apoio_mm=20)
