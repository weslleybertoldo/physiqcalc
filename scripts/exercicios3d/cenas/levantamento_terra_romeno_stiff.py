# Levantamento Terra Romeno (Stiff) — cena da fábrica 3D (lote 1, 04/10/2026).
# t = 0 em pé, barra na frente das coxas · t = 1 tronco inclinado, barra logo abaixo dos joelhos.
# Joelhos levemente dobrados, coluna neutra, quadril vai pra trás e a barra desce rente às pernas.
import math
from mathutils import Vector, Matrix
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from maos3d import Maos
from cena import Cena

RAIO_BARRA = 0.0145
GRIP_X = 0.23                    # meia pegada pronada (largura dos ombros, mãos por fora das coxas)
INCLINA = (0, 70)                # tronco à frente, graus da vertical: em pé → embaixo
RECUA = (0.0, 0.22)              # quadril pra trás (m)
JOELHO = (15, 20)                # flexão dos joelhos (graus): em pé → embaixo; o quadril desce o que precisar
FOLGA_PERNA = 0.012              # pele da perna → barra (m): rente, sem encostar
RAIO_COXA, RAIO_CANELA = 0.118, 0.05   # do eixo do osso até a pele da frente (medido na checagem: coxa ~11 cm)
PALMA_Q = Vector((0, 1, 0))      # pegada pronada: palma virada pro corpo
DEDOS_Q = Vector((0, 0, -1))


def montar(bon):
    rig = bon.rig
    PB = rig.pose.bones
    pernas = {}
    for lado, s in (("Left", 1), ("Right", -1)):      # tornozelos fixos, joelhos pra frente
        alvo = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))
        polo = p3.vazio("polo_joelho_" + lado, (s * 0.25, -1.2, 0.55))
        pernas[lado] = p3.ik(rig, lado + "Leg", alvo, polo)
        p3.travar_rotacao(rig, lado + "Foot")
    maos = Maos(bon, RAIO_BARRA)
    barra = e3.barra("barra", comprimento=2.0, raio_anilha=0.2, pegada=1.32)
    braco = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length
    antebraco = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length
    alcance = (braco + antebraco + maos.palma * 0.92) * 0.97   # braços quase estendidos
    coxa = (p3.cabeca(rig, "LeftLeg") - p3.cabeca(rig, "LeftUpLeg")).length
    canela = (p3.ponta(rig, "LeftLeg") - p3.cabeca(rig, "LeftLeg")).length
    tornoz = p3.ponta(rig, "LeftLeg")

    def frente_da_perna(z):
        """y da pele da frente da perna esquerda na altura z (coxa ou canela)."""
        q, j, t_ = p3.cabeca(rig, "LeftUpLeg"), p3.cabeca(rig, "LeftLeg"), p3.cabeca(rig, "LeftFoot")
        for a, b, r in ((q, j, RAIO_COXA), (j, t_, RAIO_CANELA)):
            if min(a.z, b.z) <= z <= max(a.z, b.z):
                f = (z - a.z) / (b.z - a.z)
                return a.y + (b.y - a.y) * f - r
        return t_.y - RAIO_CANELA

    def pose(t):
        """t=0 em pé, t=1 tronco inclinado (barra abaixo dos joelhos)."""
        for n in ("Hips", "Neck", "Head"):
            PB[p3.P + n].matrix_basis = Matrix()
        p3.atualizar()
        inclina = p3.lerp(*INCLINA, t)
        # gira a pelve em volta das articulações do quadril (a cabeça do osso Hips fica acima delas: girar ali
        # puxava o quadril pra cima e esticava os joelhos) e desce o quanto precisar pra flexão pedida dos joelhos
        pivo = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
        recua = p3.lerp(*RECUA, t)
        th = math.radians(p3.lerp(*JOELHO, t))
        d = math.sqrt(coxa ** 2 + canela ** 2 + 2 * coxa * canela * math.cos(th))   # quadril → tornozelo
        q = p3.cabeca(rig, "LeftUpLeg")
        dx, dy = q.x - tornoz.x, q.y + recua - tornoz.y
        desce = tornoz.z + math.sqrt(max(d ** 2 - dx ** 2 - dy ** 2, 0.01)) - q.z
        p3.girar_osso(rig, "Hips", p3.rot_x(inclina), pivo=pivo, mover=Vector((0, recua, desce)))
        p3.atualizar()
        p3.girar_osso(rig, "Neck", p3.rot_x(-inclina * 0.3))   # cabeça na linha do tronco
        S = {l: p3.cabeca(rig, l + "Arm") for l in ("Left", "Right")}
        meio = (S["Left"] + S["Right"]) / 2
        z = meio.z - alcance                       # 1ª aproximação: braço na vertical
        for _ in range(3):                         # barra rente à perna; o braço inclina pra trás se precisar
            y = frente_da_perna(z) - RAIO_BARRA - FOLGA_PERNA          # rente à perna (o dorsal puxa a barra)
            dy = y - meio.y
            z = meio.z - math.sqrt(max(alcance ** 2 - dy ** 2, 0.01))
        centro = Vector((0, y, z))
        barra.rotation_mode = "XYZ"
        barra.rotation_euler = (0, 0, 0)
        barra.location = centro
        p3.atualizar()
        for lado, s in (("Left", 1), ("Right", -1)):
            g = centro + Vector((s * GRIP_X, 0, 0))
            maos.segurar(lado, g, DEDOS_Q, PALMA_Q, polo=S[lado] + Vector((s * 0.25, 0.5, 0.2)), alinhar=0.5)
        for lado in ("Left", "Right"):               # dedos e polegar fecham até a pele encostar na barra
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, centro, Vector((1, 0, 0)), RAIO_BARRA,
                                                  polegar_antes=antes)

    pose.dedos = {}

    pose(1.0)                                         # polos certos na pose de baixo
    for lado in ("Left", "Right"):
        e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
        print("polo joelho", lado, "erro %.3f ang %d" % e)
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)

    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=1.0)
    return Cena(pose, [barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0, foco_luz=(0, 0.0, 0.8),
                camera_video=((4.0, -2.83, 1.16), (0, 0.05, 0.8), 50), info=maos.info)
