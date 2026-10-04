# Afundo com Halteres — cena da fábrica 3D (lote 2, 04/10/2026).
# Afundo ESTACIONÁRIO (split squat — ExRx "Dumbbell Split Squat"): os pés não saem do lugar, porque o app toca
# t = 0 → 1 → 0 em volta. t = 0 em cima (base afastada, joelho da frente quase estendido) · t = 1 embaixo (coxa da
# frente paralela ao chão, joelho de trás quase encostando no chão, sem bater).
# Perna esquerda à frente, pé chapado e parado. O pé de trás fica na PONTA o tempo todo (NSCA PTQ 4.4: "The back heel
# should be off the ground"; ExRx: "Heel of rear foot can be kept elevated off floor throughout movement"): os dedos
# ficam no chão e o pé gira em volta da base dos dedos (que não sai do lugar), o calcanhar sobe mais na descida.
# O quadril desce em linha reta (NSCA: "the hips should move down and up in a straight line"), tronco ereto.
# Braços pendurados e estendidos com um halter em cada mão, pegada neutra (palmas pro corpo): igual ao encolhimento
# e à rosca martelo (braço e antebraço calculados, mão de referência e o halter no vão da mão).
import math
from mathutils import Vector, Matrix
import numpy as np
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from cena import Cena

FRENTE, TRAS = "Left", "Right"
X_PE = 0.14            # tornozelos a ±14 cm do meio do corpo: base de 28 cm de lado a lado, cada pé embaixo do seu
                       # quadril (NSCA PTQ 4.4: "The feet should be about hip-width apart")
Y_FRENTE = -0.374      # tornozelo da frente (m; o boneco olha pra −Y)
Y_DEDOS_TRAS = 0.454   # base dos dedos do pé de trás (m): passada ≈ comprimento da perna (Song et al. 2023: passo
                       # igual ao comprimento do membro inferior é o mais indicado pro treino de força)
SOLA_BAIXO = 80        # sola do pé de trás × chão embaixo (graus): pé quase em pé, dedos dobrados no chão
JOELHO_FRENTE_CIMA = 10   # flexão do joelho da frente em cima (graus): quase estendido, sem travar
FLEX_TRAS_CIMA = 18       # flexão do joelho de trás em cima (graus): perna de trás quase estendida, sem travar;
                          # a sola de cima sai daqui (com 28° o calcanhar de trás já começava 19 cm no alto)
INCLINA = (3, 6)       # tronco à frente da vertical (graus), em cima → embaixo: ereto (ExRx "Keep torso upright")
ALFA = 2               # braço (ombro → cotovelo) à frente da vertical do MUNDO (o halter pende pra baixo), graus
TETA = 8               # antebraço (cotovelo → punho) à frente da vertical, graus: cotovelo estendido, sem travar
LARG_COT = 0.05        # cotovelo um pouco pra fora do ombro: o halter passa por fora da coxa
FORA_PUNHO = 0.05      # punho um pouco pra fora do cotovelo (ângulo de carregamento ~10°)
RAIO = 0.0145          # pegada do halter: 29 mm, o cilindro da mão de referência (igual à rosca martelo)
PEGADA_H = 0.13        # comprimento da pegada do halter (entre as anilhas)


def montar(bon):
    rig = bon.rig
    PB = rig.pose.bones
    # ── pernas por IK: alvos nascem no tornozelo de repouso (alvo = polo dá NaN) e os polos ficam à frente ────────
    pernas, tornozelos = {}, {}
    for lado, s in (("Left", 1), ("Right", -1)):
        tornozelos[lado] = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))
        # polo bem à frente, no x que deixa o joelho em cima da linha do pé embaixo: o joelho dobra pra frente, na
        # direção do pé (polo a 0,20 do meio: joelho de trás 58 mm pra fora; no meio da perna, 0,123: o da frente
        # ficava 2 cm pra dentro do pé e o de trás 3 cm pra fora)
        x_polo = s * (X_PE + 0.03 if lado == FRENTE else X_PE - 0.055)
        polo = p3.vazio("polo_joelho_" + lado, (x_polo, -1.2, 0.55 if lado == FRENTE else 0.30))
        pernas[lado] = p3.ik(rig, lado + "Leg", tornozelos[lado], polo)
    p3.travar_rotacao(rig, FRENTE + "Foot")              # pé da frente chapado, apontando pra frente
    rot_pe_tras = p3.travar_rotacao(rig, TRAS + "Foot")  # pé de trás: gira em volta da base dos dedos (abaixo)
    M_pe_tras = rot_pe_tras.matrix_world.copy()
    p3.travar_rotacao(rig, TRAS + "ToeBase")             # dedos do pé de trás chapados no chão
    tz0 = p3.cabeca(rig, TRAS + "Foot")                   # tornozelo e base dos dedos no repouso
    mtp0 = p3.cabeca(rig, TRAS + "ToeBase")
    v_pe = tz0 - mtp0                                     # base dos dedos → tornozelo, pé chapado
    dedos_tras = Vector((-X_PE + (mtp0.x - tz0.x), Y_DEDOS_TRAS, mtp0.z))
    tornozelo_frente = Vector((X_PE, Y_FRENTE, p3.cabeca(rig, FRENTE + "Foot").z))
    co0, _, (nomes0, dono0) = ck._avaliar(bon.corpo, 1)   # repouso: o vértice do calcanhar de trás (pro info)
    pe0 = np.where(np.array([n in (TRAS + "Foot", TRAS + "ToeBase") for n in nomes0] + [False])[dono0])[0]
    baixo0 = pe0[co0[pe0, 2] < 0.02]
    calcanhar = int(baixo0[np.argmax(co0[baixo0, 1])])  # o ponto mais de trás da sola

    # ── braços por IK (igual ao encolhimento) ───────────────────────────────────────────────────────────────
    punhos, polos, iks = {}, {}, {}
    for lado in ("Left", "Right"):
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((0, 0.6, 0)))
        iks[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos[lado])
    braco = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length
    antebraco = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length
    halteres = {l: e3.halter("halter_" + l, pegada=PEGADA_H, raio=RAIO, raio_anilha=0.055) for l in ("Left", "Right")}

    def _pernas(z, inclina, sola):
        """Quadril com as articulações do quadril na altura z (sem andar pra frente nem pra trás), tronco inclinado
        `inclina` graus e a sola do pé de trás a `sola` graus do chão (o pé gira em volta da base dos dedos)."""
        for n in ("Hips", "Neck", "Head"):
            PB[p3.P + n].matrix_basis = Matrix()
        p3.atualizar()
        pivo = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
        p3.girar_osso(rig, "Hips", p3.rot_x(inclina), pivo=pivo, mover=Vector((0, 0, z - pivo.z)))
        R = p3.rot_x(sola)
        tornozelos[FRENTE].location = tornozelo_frente
        tornozelos[TRAS].location = dedos_tras + R @ v_pe
        rot_pe_tras.matrix_world = R.to_4x4() @ M_pe_tras
        p3.atualizar()
        p3.girar_osso(rig, "Neck", p3.rot_x(-inclina * 0.8))   # cabeça em pé, olhando pra frente

    def _medir():
        j = ck.posicoes(rig)
        f = ck.medir_juntas(rig)
        d = j[FRENTE + "Leg"] - j[FRENTE + "UpLeg"]
        coxa = math.degrees(math.atan2(-d[2], math.hypot(d[0], d[1])))
        return f["joelhoE" if FRENTE == "Left" else "joelhoD"], f["joelhoD" if TRAS == "Right" else "joelhoE"], coxa

    def _bissecao(f, lo, hi, alvo, voltas=40):
        """x em [lo, hi] com f(x) = alvo (f monótona)."""
        flo = f(lo) - alvo
        for _ in range(voltas):
            m = (lo + hi) / 2
            fm = f(m) - alvo
            if (fm > 0) == (flo > 0):
                lo, flo = m, fm
            else:
                hi = m
        return (lo + hi) / 2

    # alturas do quadril: embaixo a coxa da frente fica paralela ao chão; em cima o joelho da frente fica a 10°.
    # Antes, os polos dos joelhos certos na pose de baixo (o polo gira o joelho em volta da reta quadril → tornozelo
    # e muda a inclinação da coxa); 2 voltas: polo → alturas → polo de novo.
    z_baixo = 0.51
    for _ in range(2):
        _pernas(z_baixo, INCLINA[1], SOLA_BAIXO)
        for lado in ("Left", "Right"):
            e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
            print("polo joelho", lado, "erro %.3f ang %d" % e)
        z_baixo = _bissecao(lambda z: (_pernas(z, INCLINA[1], SOLA_BAIXO), _medir()[2])[1], 0.40, 0.65, 0.0)
    z_cima = _bissecao(lambda z: (_pernas(z, INCLINA[0], SOLA_BAIXO), _medir()[0])[1], 0.70, 0.90,
                       JOELHO_FRENTE_CIMA)
    sola_cima = _bissecao(lambda a: (_pernas(z_cima, INCLINA[0], a), _medir()[1])[1], 20.0, 75.0, FLEX_TRAS_CIMA)
    print("AFUNDO quadril z %.3f → %.3f | sola de trás %.1f° → %d°" % (z_cima, z_baixo, sola_cima, SOLA_BAIXO))

    def _bracos():
        """Braços pendurados na vertical do mundo (o halter pende pra baixo), a partir do ombro já posto."""
        alfa, teta = math.radians(ALFA), math.radians(TETA)
        for lado, s in (("Left", 1), ("Right", -1)):
            S = p3.cabeca(rig, lado + "Arm")
            E = S + Vector((s * LARG_COT, -math.sin(alfa) * braco, -math.cos(alfa) * braco)).normalized() * braco
            dx = s * FORA_PUNHO
            rho = math.sqrt(antebraco ** 2 - dx ** 2)
            W = E + Vector((dx, -math.sin(teta) * rho, -math.cos(teta) * rho))
            iks[lado].mute = False
            punhos[lado].location = W
            eixo = (W - S).normalized()                # polo do lado em que o cotovelo calculado fica
            fora = (E - S) - eixo * (E - S).dot(eixo)
            polos[lado].location = E + fora.normalized() * 0.4
        p3.atualizar()

    def pose(t):
        """t=0 em cima, t=1 embaixo (coxa da frente paralela, joelho de trás quase no chão)."""
        _pernas(p3.lerp(z_cima, z_baixo, t), p3.lerp(*INCLINA, t), p3.lerp(sola_cima, SOLA_BAIXO, t))
        _bracos()
        for lado, s in (("Left", 1), ("Right", -1)):
            nomes = (lado + "Arm", lado + "ForeArm")       # congela o IK em FK pra girar o antebraço
            mats = [PB[p3.P + n].matrix.copy() for n in nomes]
            iks[lado].mute = True
            for n, M in zip(nomes, mats):
                PB[p3.P + n].matrix = M
                p3.atualizar()
            pg.mao_de_referencia(rig, lado)
            f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
            ax = (f1 - f0).normalized()
            quer = Vector((-s, 0, 0))                     # pegada neutra: palma pro corpo (pra coxa)
            quer = (quer - ax * quer.dot(ax)).normalized()
            tem = pg._base(rig, lado)[0]
            tem = (tem - ax * tem.dot(ax)).normalized()
            ang = math.atan2(tem.cross(quer).dot(ax), tem.dot(quer))
            p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(ang, 3, ax))
            pg.mao_de_referencia(rig, lado)
            g, _ = pg.ponto_na_mao(bon, lado, RAIO)
            eixo = pg._base(rig, lado)[1]                  # o halter fica na linha dos nós dos dedos
            h = halteres[lado]
            h.rotation_mode = "QUATERNION"
            h.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(eixo)
            h.location = g
            p3.atualizar()
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, g, eixo, RAIO, polegar_antes=antes)

    pose.dedos = {}

    def _tornozelo_dedos(j, lado, ponta):
        """Ângulo canela × pé (tornozelo) e pé × dedos (base dos dedos), graus, das posições das juntas."""
        canela = j[lado + "Foot"] - j[lado + "Leg"]
        pe = j[lado + "ToeBase"] - j[lado + "Foot"]
        dedos = ponta - j[lado + "ToeBase"]
        return math.degrees(canela.angle(pe)), math.degrees(pe.angle(dedos))

    repouso = {}
    for lado in ("Left", "Right"):                      # os mesmos ângulos no repouso (pé chapado = 0)
        jr = {n: bon.cabeca_osso(lado + n) for n in ("Leg", "Foot", "ToeBase")}
        repouso[lado] = _tornozelo_dedos({lado + n: v for n, v in jr.items()}, lado, bon.ponta_osso(lado + "ToeBase"))

    def info():
        """Pele do joelho de trás até o chão, calcanhar de trás, tornozelos (dorsiflexão + / flexão plantar −, em
        relação ao pé chapado em pé), dedos de trás dobrados e a canela da frente."""
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        j = {n: p3.cabeca(rig, n) for n in ("LeftLeg", "RightLeg", "LeftFoot", "RightFoot", "LeftToeBase",
                                             "RightToeBase")}
        perna_t = np.array([n in (TRAS + "Leg", TRAS + "UpLeg") for n in nomes] + [False])[dono]
        P = co[perna_t]
        P = P[np.linalg.norm(P - np.array(j[TRAS + "Leg"]), axis=1) < 0.09]      # só a pele em volta do joelho
        ang = {l: _tornozelo_dedos(j, l, p3.ponta(rig, l + "ToeBase")) for l in ("Left", "Right")}
        d = j[FRENTE + "Leg"] - j[FRENTE + "Foot"]
        return "joelho de trás: pele a %.0f mm do chão (centro %.0f) | calcanhar de trás %.0f mm | tornozelo frente " \
               "%+.0f° trás %+.0f° | dedos de trás dobrados %.0f° | canela da frente %+.0f°" % (
                   P[:, 2].min() * 1000, j[TRAS + "Leg"].z * 1000, co[calcanhar, 2] * 1000,
                   ang[FRENTE][0] - repouso[FRENTE][0], ang[TRAS][0] - repouso[TRAS][0],
                   ang[TRAS][1] - repouso[TRAS][1], math.degrees(math.atan2(-d.y, d.z)))

    # polo certo dos cotovelos no meio do movimento
    _pernas(p3.lerp(z_cima, z_baixo, 0.5), p3.lerp(*INCLINA, 0.5), p3.lerp(sola_cima, SOLA_BAIXO, 0.5))
    _bracos()
    for lado in ("Left", "Right"):
        e = p3.acertar_polo(rig, iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)

    pegs = [(l, ck.Barra(halteres[l], raio=RAIO, meio_compr=PEGADA_H / 2)) for l in ("Left", "Right")]
    return Cena(pose, [halteres["Left"], halteres["Right"]], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, 0, 0.75),
                camera_video=((4.2, -2.4, 0.95), (0, 0.03, 0.70), 50), info=info)
