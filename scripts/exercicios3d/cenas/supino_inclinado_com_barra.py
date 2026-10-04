# Supino Inclinado com Barra — cena da fábrica 3D (lote 1, 04/10/2026).
# t = 0 braços estendidos, barra em cima dos ombros · t = 1 barra a poucos mm do peito, na parte de cima dele.
# Encosto a 30° (Rodríguez-Ridao 2020: a 30° o peitoral de cima trabalha mais; acima disso sobe o deltoide
# anterior), glúteo no assento, cabeça e costas no encosto, pés no chão, pegada pronada; embaixo o antebraço
# fica na vertical e o cotovelo a ~60° do tronco.
import math
from mathutils import Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import deitado3d as dt
from maos3d import Maos
from cena import Cena

RAIO_BARRA = 0.0145
ANGULO = 30                    # encosto, graus da horizontal
ASSENTO = 0.44                 # topo do assento (m)
ABRE = (45, 72)                # faixa do cotovelo × tronco (graus; a técnica pede 45–70°, 90 = em T)
PEGADA = 1.74                  # distância entre as mãos ÷ entre as articulações dos ombros (igual ao reto)
ABAIXO = 0.005                 # barra embaixo: logo abaixo das clavículas (m abaixo dos ombros, ao longo do tronco)
FOLGA_PEITO = 0.007            # barra → pele do peito embaixo (toca de leve)
COTOVELO_CIMA = 10             # flexão do cotovelo em cima (estendido sem travar)
PUNHO = 14                     # mão inclinada pra cabeça (extensão do punho): a barra fica em cima do antebraço
DEDOS_Q = Vector((0, math.sin(math.radians(PUNHO)), math.cos(math.radians(PUNHO))))
PALMA_Q = Vector((0, -math.cos(math.radians(PUNHO)), math.sin(math.radians(PUNHO))))   # palma pros pés


def montar(bon):
    rig = bon.rig
    junta_y = dt.inclinar(bon, ANGULO, ASSENTO)
    banco = e3.banco_inclinado("banco", ANGULO, ASSENTO, junta_y)
    barra = e3.barra("barra", comprimento=2.0, raio_anilha=0.2, pegada=1.32)
    maos = Maos(bon, RAIO_BARRA)
    S = {l: p3.cabeca(rig, l + "Arm") for l, _ in dt.LADOS}
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length       # braço
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length      # antebraço

    off = {}                     # vão da mão − punho com a mão nessa orientação (fixa o movimento todo)
    for lado, s in dt.LADOS:
        g = S[lado] + Vector((s * 0.15, 0, 0.55))
        maos.segurar(lado, g, DEDOS_Q, PALMA_Q, polo=S[lado] + Vector((s * 0.5, -0.3, -0.3)))
        off[lado] = g - p3.cabeca(rig, lado + "Hand")

    # ── embaixo: barra encostando de leve na parte de cima do peito, logo abaixo das clavículas (ABAIXO m abaixo
    # das articulações dos ombros, ao longo do tronco). O braço curto do boneco não deixa antebraço em pé + cotovelo
    # a 45–70° com a barra mais baixa no peito: medido 04/10 (modelo + checagem), a 6 cm o antebraço deitava 25°
    # com o cotovelo a 46°; a 1 cm fica ~13°. Pegada igual à do supino reto (150% da biacromial em todas as
    # inclinações, Rodríguez-Ridao 2020).
    GRIP = PEGADA * (S["Left"] - S["Right"]).length / 2
    cima, _ = dt.eixos_tronco(rig)
    frente = Vector((0, -cima.z, cima.y))       # pro peito, ⟂ ao tronco
    meio = (S["Left"] + S["Right"]) / 2
    _, y1, z1 = dt.barra_acima_do_peito(bon, meio - cima * ABAIXO, RAIO_BARRA + FOLGA_PEITO, cima=frente)
    # ── em cima: braços quase estendidos, barra na vertical das articulações dos ombros ──────────────────
    y0 = S["Left"].y
    D = math.sqrt(Lb ** 2 + La ** 2 + 2 * Lb * La * math.cos(math.radians(COTOVELO_CIMA)))
    w = Vector((GRIP, y0, 0)) - off["Left"]
    z0 = S["Left"].z + math.sqrt(D ** 2 - (w.x - S["Left"].x) ** 2 - (w.y - S["Left"].y) ** 2) + off["Left"].z
    print("PEGADA meia %.3f | barra em cima (y %.3f, z %.3f) embaixo (y %.3f, z %.3f) | ombro y %.3f z %.3f | "
          "barra embaixo a %.0f mm do ombro ao longo do tronco" % (GRIP, y0, z0, y1, z1, S["Left"].y, S["Left"].z,
                                                                   (Vector((0, y1, z1)) - S["Left"]).dot(-cima) * 1000))

    def pose(t):
        """t=0 braços estendidos em cima, t=1 barra embaixo, quase no peito."""
        centro = Vector((0, p3.lerp(y0, y1, t), p3.lerp(z0, z1, t)))
        barra.location = centro
        p3.atualizar()
        for lado, s in dt.LADOS:
            g = centro + Vector((s * GRIP, 0, 0))
            maos.segurar(lado, g, DEDOS_Q, PALMA_Q,
                         polo=dt.polo_cotovelo_faixa(rig, S[lado], g - off[lado], Lb, La, s, ABRE))
        for lado, _ in dt.LADOS:                  # dedos e polegar fecham até a pele encostar na barra
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, centro, Vector((1, 0, 0)), RAIO_BARRA,
                                                  polegar_antes=antes)

    pose.dedos = {}

    pose(1.0)                                    # polo certo do cotovelo na pose de baixo
    for lado, _ in dt.LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)

    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=1.0)
    return Cena(pose, [barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0, foco_luz=(0, 0.1, 0.8),
                camera_video=((3.0, -2.2, 1.6), (0, 0.1, 0.8), 50), info=maos.info, apoios=[banco],
                afunda_apoio_mm=20)
