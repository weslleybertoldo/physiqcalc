# Abdominal Completo (sit-up) — cena da fábrica 3D (lote 12, 11/10/2026).
# t = 0 deitado de costas no colchonete, joelhos dobrados (~100°) e pés chapados e SOLTOS na largura do quadril, braços
# esticados ao lado do corpo com as mãos no colchonete · t = 1 sentado, com o tórax na vertical, a lombar arredondada, o
# glúteo e os pés no colchonete e os braços esticados na direção dos lados dos calcanhares (o app faz a volta: desce
# desenrolando a coluna).
# ExRx, Sit-up (arms down): "Lie supine on mat or bench with hips bent and feet on floor or bench. Hook feet under foot
# brace or secure low overhang if required to keep feet down. Extend arms down to sides." / "Raise torso from mat or bench
# by bending waist and hips. Extend hands toward sides of heels. Return until back of shoulders contact mat or bench.";
# Kreighbaum (1996), citado pelo ExRx (Are Sit-ups Safe?): "Positioning the lower body so the legs and hips are in a flexed
# position / Placing the arms down to the sides thereby reducing the resistance torque of the upper body / Curl into the
# upright position by first lifting the head and neck, then lifting the thorax, then lumbar, and finally the pelvis
# regions"; NSCA (Bent-knee sit-up): "Flex your neck to bring your chin toward your chest" / "Curl your torso toward your
# thighs while keeping your lower body in contact with the floor" / "Uncurl your back to return to the starting position".
# PÉS SOLTOS: o free-exercise-db (o fonte_en "Sit-Up" do catálogo) e o ExRx com as mãos na nuca ou com os braços cruzados
# prendem os pés; a NSCA não prende e o ExRx com os braços pra baixo só prende "if required" — fica a que não pede peça.
# BRAÇOS esticados pra baixo (ExRx arms down + Kreighbaum), e não cruzados no peito (NSCA): tentado 3 vezes, o peitoral
# do boneco fica ~4 cm à frente da frente do ombro — com a mão no ombro do outro lado o punho entrava no peito, e o
# antebraço de fora só passava por cima do de dentro com o cotovelo na altura do ombro, empurrando o deltoide pra dentro
# da outra mão. Os braços apontam o tempo todo pra um ponto do chão do lado de fora de cada calcanhar (IK do braço por
# quadro): deitado ficam do lado do corpo, a mão encostando no colchonete e o cotovelo um pouco dobrado e aberto (esticado
# e colado no corpo, o braço entrava no dorsal); subindo, esticam e vão pra frente por fora das coxas e dos joelhos.
# ORDEM (Kreighbaum): rampas suaves que se sobrepõem — pescoço (queixo pro peito) → tórax (Spine2, Spine1) → lombar
# (Spine) → pelve. No começo a pelve vira um pouco pra trás (RETRO, devolvida na lombar: a curva da lombar achata no
# colchonete e o tórax fica onde estava); a lombar só sai do chão com o tórax a ~25–30° (o que o abdominal supra faz) e a
# pelve gira por último, em volta das articulações do quadril, que ficam paradas no lugar (só sobem e descem uns mm com o
# glúteo apoiando: a pele mais baixa do glúteo e do fim da coxa fica 2 mm dentro do colchonete).
# EM CIMA: o tórax na vertical (~89°), a linha pelve → pescoço a ~76° do chão (a lombar fica arredondada), a coxa × a
# linha do tronco a ~128° (o "V-shape with your thighs" do free-exercise-db; o teto do quadril da fábrica é 130°) e a
# coxa × pelve a ~102° (AAOS: 120°). A cabeça volta pra linha do tórax ("space between their chin and sternum", ExRx).
# DIFERENTE DO ABDOMINAL SUPRA (só as escápulas saem do chão, tórax a ~30°, lombar e cóccix no colchonete, mãos atrás da
# cabeça) e do BICICLETA (pernas no ar pedalando, tronco girando): aqui o tronco sobe inteiro, a lombar sai do chão e o
# quadril dobra até sentar, com os braços esticados.
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import deitado3d as dt
from cena import Cena
from abdominal_bicicleta import _congelar, _orientar

TOPO = 0.012          # colchonete de 12 mm no chão (o do supra, do bicicleta e da elevação de pernas)
AFUNDA = 0.004        # pele das costas dentro do colchonete embaixo (igual ao supra)
JOELHO = 100          # flexão do joelho (graus), igual ao supra
PE_X = 0.12           # tornozelo a 12 cm do meio: pés na largura do quadril (igual ao supra)
AFUNDA_PE = 0.001
PELVE = 3             # anteversão da pelve em relação à lombar embaixo (graus), igual ao supra
AFUNDA_GLUTEO = 0.002
AFUNDA_CABELO = 0.002  # o cabelo da nuca encosta no colchonete embaixo (a pele fica embaixo do cabelo)

# braços esticados apontando pro lado dos calcanhares (ExRx, Sit-up (arms down): "Extend arms down to sides" /
# "Extend hands toward sides of heels"): o alvo é um ponto parado no chão, do lado de fora de cada calcanhar
MAO_X = (0.30, 0.37)  # x do ponto alvo (m) embaixo e em cima: embaixo a mão fica em cima do colchonete (0,62 m de
                      # largura, como no supra); subindo o alvo abre um pouco e os braços passam por fora das coxas e dos
                      # joelhos (com 0,30 em cima o braço passava a 3 mm da lateral da coxa)
ESTICA = (0.97, 0.99)  # punho a 97% do comprimento do braço embaixo e 99% em cima: deitado o cotovelo fica um pouco
                      # dobrado e aberto pra fora (com o braço esticado colado no corpo o braço entrava 15 mm no
                      # dorsal); a partir do meio da subida o braço estica na direção dos calcanhares
AFUNDA_MAO = 0.001    # embaixo a mão encosta no colchonete (a altura do alvo sai disso)

# subida (t = 1 em cima): o que cada parte gira no fim, e quando (rampas suaves que se sobrepõem, na ordem do
# Kreighbaum: cabeça e pescoço → tórax → lombar → pelve)
RETRO = 8.0           # retroversão da pelve no começo, devolvida na lombar (a curva da lombar achata no colchonete e
                      # o tórax fica onde estava)
PELVE_CIMA = 39.0     # pelve girando pra frente em volta dos quadris, em cima (graus, a partir de deitado)
LOMBAR = 22.0         # flexão da lombar (osso Spine) em cima, graus (inclui os RETRO da fase 1)
CURL = (("Spine1", 22.0), ("Spine2", 10.0))                  # flexão do tórax em cima (graus)
PESCOCO_MEIO = 24.0   # queixo pro peito no começo da subida (graus, a partir do pescoço estendido de deitado)
PESCOCO_CIMA = 10.0   # em cima a cabeça volta pra linha do tórax
RAMPA = {"Neck": (0.0, 0.30), "Neck_volta": (0.55, 1.0), "Spine2": (0.0, 0.40), "Spine1": (0.03, 0.45),
         "Spine": (0.20, 0.70), "retro": (0.0, 0.25), "pelve": (0.30, 1.0)}
OSSOS_T = ("Hips", "Spine", "Spine1", "Spine2", "Neck")


def _rampa(t, a, b):
    if t <= a:
        return 0.0
    if t >= b:
        return 1.0
    x = (t - a) / (b - a)
    return x * x * (3 - 2 * x)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _arvore(co, tri, m):
    t = tri[m[tri].all(axis=1)]
    return BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in t], all_triangles=True)


def _distancia(bvh, P, alcance=0.15):
    """Menor distância (m, − = dentro) dos pontos P até a superfície da árvore (só até `alcance`)."""
    pior = 1e9
    for p in P:
        v = Vector(p)
        loc, nor, idx, d = bvh.find_nearest(v, alcance)
        if loc is None:
            continue
        pior = min(pior, -d if (d < 0.03 and (v - loc).dot(nor) < 0) else d)    # o jeito do checagem3d.contatos
    return pior


def _mao(lado):
    return (lado + "Hand",) + tuple("%sHand%s%d" % (lado, d, i) for d in p3.DEDOS + ("Thumb",) for i in (1, 2, 3))


def _esticar_dedos(rig, lado):
    """Dedos esticados e juntos no plano da palma, o polegar deitado do lado do indicador (a mão de apoio do supra)."""
    p3.soltar_dedos(rig, lado)
    pg.juntar_dedos(rig, lado, 1.0)
    for dd in p3.DEDOS + ("Thumb",):
        for i in (1, 2, 3):
            palma = pg._base(rig, lado)[0]
            o = "%sHand%s%d" % (lado, dd, i)
            f = p3.ponta(rig, o) - p3.cabeca(rig, o)
            plano = f - palma * f.dot(palma)
            if dd == "Thumb":
                plano = plano - palma * 0.10 * f.length
            if plano.length > 1e-6:
                p3.girar_osso(rig, o, f.rotation_difference(plano).to_matrix())


def montar(bon):
    pg.usar_polegar("volta")         # padrão dos exercícios novos; aqui a mão não segura nada (não há fechar_em_volta)
    rig = bon.rig
    PB = rig.pose.bones
    colchonete = e3.caixa("colchonete", (0, 0.0, TOPO / 2), (0.62, 1.90, TOPO), e3.mat_estofado(), chanfro=0.004)
    tornozelo_z = p3.ponta(rig, "LeftLeg").z
    coxa = (p3.cabeca(rig, "LeftLeg") - p3.cabeca(rig, "LeftUpLeg")).length
    canela = (p3.cabeca(rig, "LeftFoot") - p3.cabeca(rig, "LeftLeg")).length
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length

    def pele(partes):
        return dt.malha(bon, partes)

    # em pé: queixo (ponta de baixo do rosto) e fúrcula do esterno (alto da frente do peito, no meio) — pro "queixo
    # longe do peito"
    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    i_cab = np.where(_grupo(nomes, dono, ("Head",)))[0]
    rosto = i_cab[co[i_cab][:, 2] < co[i_cab][:, 2].min() + 0.06]
    i_queixo = rosto[np.argmin(co[rosto][:, 1])]
    i_peito = np.where(_grupo(nomes, dono, ("Spine2",)))[0]
    meio_peito = i_peito[(np.abs(co[i_peito][:, 0]) < 0.015) & (co[i_peito][:, 1] < -0.04)]
    i_furcula = meio_peito[np.argmax(co[meio_peito][:, 2])]

    # ── deitado de costas (o jeito do supra) ─────────────────────────────────────────────────────────────────────
    pivo = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    p3.girar_osso(rig, "Hips", p3.rot_x(-90), pivo=pivo)
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, TOPO - AFUNDA - pele(dt.TRONCO)[:, 2].min())))

    d = math.sqrt(coxa ** 2 + canela ** 2 + 2 * coxa * canela * math.cos(math.radians(JOELHO)))
    alvos, polos, iks = {}, {}, {}
    for lado, s in dt.LADOS:
        alvos[lado] = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))
        polos[lado] = p3.vazio("polo_joelho_" + lado, p3.cabeca(rig, lado + "Leg") + Vector((0, 0, 0.6)))
        iks[lado] = p3.ik(rig, lado + "Leg", alvos[lado], polos[lado])
        p3.travar_rotacao(rig, lado + "Foot")

    def pernas(acertar=False):
        for lado, s in dt.LADOS:
            q = p3.cabeca(rig, lado + "UpLeg")
            tz = TOPO + tornozelo_z - AFUNDA_PE
            dx, dz = s * PE_X - q.x, tz - q.z
            dy = math.sqrt(max(d * d - dx * dx - dz * dz, 1e-6))
            a = Vector((s * PE_X, q.y - dy, tz))
            alvos[lado].location = a
            dd = a - q
            cima = Vector((0, -dd.z, dd.y)).normalized()
            if cima.z < 0:
                cima.negate()
            polos[lado].location = (q + a) / 2 + cima * 0.6 + Vector((s * 0.04, 0, 0))
        p3.atualizar()
        if acertar:
            for lado, _ in dt.LADOS:
                p3.acertar_polo(rig, iks[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")

    pernas(acertar=True)
    q = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    p3.girar_osso(rig, "Hips", p3.rot_x(PELVE), pivo=q)
    p3.girar_osso(rig, "Spine", p3.rot_x(-PELVE))
    for _ in range(3):
        pernas()
        z = pele(("Spine1", "Spine2"))[:, 2].min()
        p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, TOPO - AFUNDA - z)))
    pernas(acertar=True)               # daqui pra frente os tornozelos ficam PARADOS no mundo (pés soltos no chão)

    # cabeça no colchonete: o pescoço estende até o cabelo da nuca encostar
    cabelo_z = lambda: float(ck._avaliar_simples(bon.cabelo)[0][:, 2].min())
    pescoco0 = 0.0
    for passo in (2.0, 0.5, 0.1):
        while cabelo_z() > TOPO - AFUNDA_CABELO and pescoco0 > -40:
            p3.girar_osso(rig, "Neck", p3.rot_x(-passo))
            pescoco0 -= passo
        p3.girar_osso(rig, "Neck", p3.rot_x(passo))
        pescoco0 += passo
    print("DEITADO | pescoço %+.1f° (− estende) | cabelo %+.1f mm | cabeça %+.1f mm | glúteo %+.1f mm | lombar %+.1f mm"
          " | costas %+.1f mm (do topo do colchonete)" % (
              pescoco0, (cabelo_z() - TOPO) * 1000, (pele(("Head",))[:, 2].min() - TOPO) * 1000,
              (pele(("Hips",))[:, 2].min() - TOPO) * 1000, (pele(("Spine",))[:, 2].min() - TOPO) * 1000,
              (pele(("Spine1", "Spine2"))[:, 2].min() - TOPO) * 1000))

    base = {n: PB[p3.P + n].matrix_basis.copy() for n in OSSOS_T}
    quadril0 = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    juntas0 = {L: p3.cabeca(rig, L + "UpLeg").copy() for L, _ in dt.LADOS}
    tornoz0 = {L: p3.cabeca(rig, L + "Foot").copy() for L, _ in dt.LADOS}
    calc_y = sum(p3.cabeca(rig, L + "Foot").y for L, _ in dt.LADOS) / 2        # calcanhar (y do tornozelo)
    CONTATO = ("Hips", "LeftUpLeg", "RightUpLeg")
    COSTAS = ("Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder")   # a retroversão no começo (girando em volta
                      # dos quadris) abaixava as costas: em t = 0,15 elas entravam 9 mm no colchonete (3 mm do chão); agora
                      # afundam no máximo 6 mm e o glúteo sobe até ~2 mm (a pelve virando pra trás)

    # ── braços: IK do braço por quadro, o punho na reta ombro → alvo do lado do calcanhar ─────────────────────────
    punhos, polos_b, iks_b = {}, {}, {}
    for lado, s in dt.LADOS:
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))      # nasce no punho de repouso
        polos_b[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((s * 0.5, 0, 0)))
        iks_b[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos_b[lado])
        _esticar_dedos(rig, lado)
    alvo_z = [0.0]
    acertado = {}
    tq = [0.0]

    def bracos():
        for lado, s in dt.LADOS:
            S = p3.cabeca(rig, lado + "Arm")
            mx = MAO_X[0] + (MAO_X[1] - MAO_X[0]) * _rampa(tq[0], 0.25, 0.85)
            u = (Vector((s * mx, calc_y, alvo_z[0])) - S).normalized()
            iks_b[lado].mute = False
            e = ESTICA[0] + (ESTICA[1] - ESTICA[0]) * _rampa(tq[0], 0.0, 0.6)
            punhos[lado].location = S + u * (Lb + La) * e
            polos_b[lado].location = S + u * 0.25 + Vector((s * 0.5, 0, 0.12))      # cotovelo pra fora e pra cima
            p3.atualizar()
            if lado not in acertado:
                acertado[lado] = p3.acertar_polo(rig, iks_b[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
            _congelar(rig, iks_b[lado], lado)
            palma = Vector((0, 0, -1))
            _orientar(rig, lado, u, (palma - u * palma.dot(u)).normalized())          # palma pra baixo

    def pose(t):
        tq[0] = t
        for n in OSSOS_T:
            PB[p3.P + n].matrix_basis = base[n].copy()
        p3.atualizar()
        r = _rampa(t, *RAMPA["retro"])
        p3.girar_osso(rig, "Hips", p3.rot_x(-RETRO * r + (RETRO + PELVE_CIMA) * _rampa(t, *RAMPA["pelve"])),
                      pivo=quadril0)
        p3.girar_osso(rig, "Spine", p3.rot_x(RETRO * r + (LOMBAR - RETRO) * _rampa(t, *RAMPA["Spine"])))
        for n, g in CURL:
            p3.girar_osso(rig, n, p3.rot_x(g * _rampa(t, *RAMPA[n])))
        p3.girar_osso(rig, "Neck", p3.rot_x(PESCOCO_MEIO * _rampa(t, *RAMPA["Neck"])
                                            - (PESCOCO_MEIO - PESCOCO_CIMA) * _rampa(t, *RAMPA["Neck_volta"])))
        for _ in range(2):            # glúteo encostando no colchonete, sem as costas afundarem mais que embaixo: só na vertical
            sobe = max(TOPO - AFUNDA_GLUTEO - pele(CONTATO)[:, 2].min(), TOPO - AFUNDA - 0.002 - pele(COSTAS)[:, 2].min())
            p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, sobe)))
        bracos()

    # altura do alvo dos braços: embaixo a mão encosta no colchonete (o ponto fica parado o movimento todo)
    for _ in range(4):
        pose(0.0)
        z = pele(_mao("Left") + _mao("Right"))[:, 2].min()
        alvo_z[0] += (TOPO - AFUNDA_MAO - z) * 1.7
    pose(0.0)
    print("BRAÇOS | alvo do lado do calcanhar (±%.2f, %.3f, %.3f) | mão %+.1f mm do topo do colchonete | polo %s" % (
        MAO_X[0], calc_y, alvo_z[0], (pele(_mao("Left") + _mao("Right"))[:, 2].min() - TOPO) * 1000, acertado))

    def medidas():
        j = ck.posicoes(rig)
        co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        m = {"torax": ck.tc.torax_chao(j)[0]}
        d_ = j["Neck"] - j["Hips"]
        m["tronco"] = math.degrees(math.atan2(d_[2], d_[1]))      # linha pelve → pescoço × chão (90 = vertical)
        m["quadril"] = ck.tc.quadril_sinal(j)
        eixo_p = (p3.mundo_osso(rig, "Hips").to_3x3() @ Vector((0, 1, 0))).normalized()   # pelve (osso Hips)
        m["coxa_pelve"] = [math.degrees((p3.cabeca(rig, L + "Leg") - p3.cabeca(rig, L + "UpLeg")).angle(-eixo_p))
                           for L, _ in dt.LADOS]
        m["junta_quadril"] = [tuple((p3.cabeca(rig, L + "UpLeg") - juntas0[L]) * 1000) for L, _ in dt.LADOS]
        m["tornozelo"] = max((p3.cabeca(rig, L + "Foot") - tornoz0[L]).length * 1000 for L, _ in dt.LADOS)
        m["pele"] = {k: (co[_grupo(nomes, dono, (k,))][:, 2].min() - TOPO) * 1000
                     for k in ("Hips", "Spine", "Spine1", "Spine2", "Head")}
        m["coxa_z"] = (co[_grupo(nomes, dono, ("LeftUpLeg", "RightUpLeg"))][:, 2].min() - TOPO) * 1000
        m["mao_z"] = [(co[_grupo(nomes, dono, _mao(L))][:, 2].min() - TOPO) * 1000 for L, _ in dt.LADOS]
        m["cabelo"] = (float(ck._avaliar_simples(bon.cabelo)[0][:, 2].min()) - TOPO) * 1000
        meio = np.abs(co[:, 0]) < 0.04
        tr = _grupo(nomes, dono, ("Hips", "Spine", "Spine1", "Spine2"))
        enc = co[meio & tr & (co[:, 2] < TOPO + 0.005)]
        m["costas_ate"] = float(enc[:, 1].max()) if len(enc) else float("nan")
        m["queixo_furcula"] = np.linalg.norm(co[i_queixo] - co[i_furcula]) * 1000
        bracos_m = _grupo(nomes, dono, ("LeftArm", "LeftForeArm", "RightArm", "RightForeArm") + _mao("Left")
                          + _mao("Right"))
        bvh_pernas = _arvore(co, tri, _grupo(nomes, dono, ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg",
                                                           "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase")))
        m["bracos_pernas"] = _distancia(bvh_pernas, co[bracos_m][::2]) * 1000
        perto = 1e9
        for i in np.where(bracos_m)[0][::2]:
            loc, nor, idx, dd = bvh_pernas.find_nearest(Vector(co[i]), 0.15)
            if loc is not None and dd < perto:
                perto, m["onde"] = dd, "%s × %s" % (nomes[dono[i]], tuple(round(x, 3) for x in loc))
        bvh_tronco = _arvore(co, tri, _grupo(nomes, dono, ("Hips", "Spine", "Spine1")))
        antebr = _grupo(nomes, dono, ("LeftForeArm", "RightForeArm") + _mao("Left") + _mao("Right"))
        m["antebracos_tronco"] = _distancia(bvh_tronco, co[antebr][::2]) * 1000
        m["cotovelo"] = [math.degrees((p3.cabeca(rig, L + "ForeArm") - p3.cabeca(rig, L + "Arm")).angle(
            p3.cabeca(rig, L + "Hand") - p3.cabeca(rig, L + "ForeArm"))) for L, _ in dt.LADOS]
        return m

    def info():
        m = medidas()
        perto = lambda v: ("%.0f" % v) if v < 150 else ">150"
        return ("tórax %.0f° do chão | linha pelve→pescoço %.0f° do chão | quadril com sinal %.0f/%.0f° | coxa × pelve "
                "%.0f/%.0f° | junta do quadril andou E (%+.0f %+.0f %+.0f) D (%+.0f %+.0f %+.0f) mm | tornozelo andou "
                "%.1f mm | pele acima do colchonete (mm): glúteo %.0f lombar %.0f T11-T8 %.0f T7-C7 %.0f cabeça %.0f "
                "coxa %.0f mão E %.0f D %.0f cabelo %.0f | costas no chão até y %.3f | queixo × fúrcula %.0f mm | "
                "braços × pernas %s mm (%s) | antebraços e mãos × tronco %s mm | cotovelo dobrado E %.0f D %.0f°" % (
                    m["torax"], m["tronco"], m["quadril"][0], m["quadril"][1], m["coxa_pelve"][0], m["coxa_pelve"][1],
                    *m["junta_quadril"][0], *m["junta_quadril"][1], m["tornozelo"], m["pele"]["Hips"],
                    m["pele"]["Spine"], m["pele"]["Spine1"], m["pele"]["Spine2"], m["pele"]["Head"], m["coxa_z"],
                    m["mao_z"][0], m["mao_z"][1], m["cabelo"], m["costas_ate"], m["queixo_furcula"],
                    perto(m["bracos_pernas"]), m.get("onde", "-"), perto(m["antebracos_tronco"]), m["cotovelo"][0], m["cotovelo"][1]))

    return Cena(pose, [], pegadas=[], apoio_mm=0.0, foco_luz=(0, 0.0, 0.35),
                camera_video=((3.6, -1.0, 1.1), (0, 0.0, 0.35), 50), info=info, apoios=[colchonete],
                afunda_apoio_mm=20)
