# Supino Reto com Barra — cena da fábrica 3D (lote 1, 04/10/2026).
# t = 0 braços estendidos, barra em cima dos ombros · t = 1 barra a poucos mm do peito, na linha dos mamilos.
# Deitado de costas no banco reto (cabeça, costas e glúteo no estofado), pés chapados no chão, pegada pronada;
# embaixo o antebraço fica na vertical (barra em cima do cotovelo) e o cotovelo a ~60° do tronco.
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
TOPO = 0.44                    # altura do estofado (m)
BANCO_Y = (-0.28, 0.92)        # pé e cabeceira do banco (com o pé em -0,34 a panturrilha encostava na quina)
ABRE = 60                      # cotovelo × tronco embaixo, vista de cima do peito (graus; 90 = em T)
FOLGA_PEITO = 0.007            # barra → pele do peito embaixo (toca de leve)
COTOVELO_CIMA = 10             # flexão do cotovelo em cima (estendido sem travar)
PUNHO = 14                     # mão inclinada pra cabeça (extensão do punho): a barra fica em cima do antebraço
DEDOS_Q = Vector((0, math.sin(math.radians(PUNHO)), math.cos(math.radians(PUNHO))))
PALMA_Q = Vector((0, -math.cos(math.radians(PUNHO)), math.sin(math.radians(PUNHO))))   # palma pros pés


def montar(bon):
    rig = bon.rig
    dt.deitar(bon, TOPO)
    banco = e3.banco("banco", *BANCO_Y, topo=TOPO)
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
    print("vão da mão − punho E (%.3f %.3f %.3f)" % tuple(off["Left"]))

    # ── embaixo: antebraço na vertical e cotovelo a ABRE° do tronco → largura da pegada e linha da barra ──
    y1 = S["Left"].y - 0.08
    for _ in range(5):
        z1 = dt.peito(bon, y1) + FOLGA_PEITO + RAIO_BARRA
        gs = {}
        for lado, s in dt.LADOS:
            wz = z1 - off[lado].z
            cot = dt.cotovelo_embaixo(S[lado], wz, Lb, La, ABRE, s)
            gs[lado] = Vector((cot.x, cot.y, wz)) + off[lado]
        y1 = (gs["Left"].y + gs["Right"].y) / 2
    GRIP = (gs["Left"].x - gs["Right"].x) / 2
    # ── em cima: braços quase estendidos, barra em cima das articulações dos ombros ──────────────────────
    y0 = S["Left"].y - 0.01
    D = math.sqrt(Lb ** 2 + La ** 2 + 2 * Lb * La * math.cos(math.radians(COTOVELO_CIMA)))
    w = Vector((GRIP, y0, 0)) - off["Left"]
    z0 = S["Left"].z + math.sqrt(D ** 2 - (w.x - S["Left"].x) ** 2 - (w.y - S["Left"].y) ** 2) + off["Left"].z
    print("PEGADA meia %.3f | barra em cima (y %.3f, z %.3f) embaixo (y %.3f, z %.3f) | ombro y %.3f z %.3f" % (
        GRIP, y0, z0, y1, z1, S["Left"].y, S["Left"].z))

    def pose(t):
        """t=0 braços estendidos em cima, t=1 barra embaixo, quase no peito."""
        centro = Vector((0, p3.lerp(y0, y1, t), p3.lerp(z0, z1, t)))
        barra.location = centro
        p3.atualizar()
        for lado, s in dt.LADOS:
            # cotovelo embaixo da barra o movimento todo (com polo fixo o antebraço deitava 20° no meio da descida)
            g = centro + Vector((s * GRIP, 0, 0))
            maos.segurar(lado, g, DEDOS_Q, PALMA_Q, polo=dt.polo_cotovelo_baixo(S[lado], g - off[lado], Lb, La))
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
    return Cena(pose, [barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0, foco_luz=(0, 0.2, 0.6),
                camera_video=((2.9, -2.3, 1.55), (0, 0.2, 0.6), 50), info=maos.info, apoios=[banco],
                afunda_apoio_mm=20)
