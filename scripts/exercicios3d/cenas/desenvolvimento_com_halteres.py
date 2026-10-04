# Desenvolvimento com Halteres (sentado) — cena da fábrica 3D (lote 1, 04/10/2026).
# t = 0 halteres ao lado da cabeça, na altura das orelhas, com o cotovelo embaixo do punho · t = 1 braços estendidos
# acima da cabeça, sem travar e sem um halter encostar no outro. Sentado no banco com o encosto quase em pé, glúteo
# no assento, costas e cabeça no encosto, pés chapados no chão, pegada pronada (palmas pra frente); o braço sobe no
# plano da escápula (30° à frente do lado, Durall 2001) com o antebraço sempre na vertical.
import math
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import deitado3d as dt
from maos3d import Maos
from cena import Cena

RAIO = 0.0145                  # pegada do halter: 29 mm, o cilindro da mão de referência
PEGADA_H = 0.13                # comprimento da pegada do halter (entre as anilhas)
ANGULO = 85                    # encosto, graus da horizontal (quase em pé)
ASSENTO = 0.44                 # topo do assento (m)
PLANO = 30                     # o braço sobe 30° à frente do lado: plano da escápula (Durall 2001)
BAIXO = -25                    # braço embaixo, graus da horizontal: halter na altura das orelhas, cotovelo a ~115°
COTOVELO_CIMA = 10             # flexão do cotovelo em cima (estendido sem travar)
PUNHO = 5                      # punho quase neutro (ACE: "wrists in a neutral position")
DEDOS_Q = Vector((0, math.sin(math.radians(PUNHO)), math.cos(math.radians(PUNHO))))
PALMA_Q = Vector((0, -math.cos(math.radians(PUNHO)), math.sin(math.radians(PUNHO))))   # palma pra frente


def sentar_no_assento(bon, junta_y):
    """Com o encosto quase em pé, o ponto mais baixo do glúteo (a dobra de baixo, que com o quadril dobrado fica
    atrás) cai no canto da junta do banco e a pele EM CIMA do assento — glúteo e parte de trás das coxas, o que
    apoia sentado — ficava 16 mm acima dele (checagem de 04/10/2026: glúteo 6,8 mm do banco; descendo só pelo
    glúteo as coxas afundavam 21,7 mm). Desce (ou sobe) o corpo até essa pele afundar 2 mm, como o dt.inclinar
    faz com o glúteo todo; a dobra fica no vão entre o assento e o encosto."""
    partes = ("Hips", "LeftUpLeg", "RightUpLeg")
    for _ in range(3):
        v = dt.malha(bon, partes)
        v = v[(v[:, 1] < junta_y - 0.005) & (abs(v[:, 0]) < 0.14)]
        p3.girar_osso(bon.rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, ASSENTO - 0.002 - v[:, 2].min())))
    todos = dt.malha(bon, ("Hips",))
    v = dt.malha(bon, partes)
    v = v[(v[:, 1] < junta_y - 0.005) & (abs(v[:, 0]) < 0.14)]
    print("SENTADO: pele em cima do assento z %.4f | dobra do glúteo z %.4f em y %.3f (junta %.3f)"
          % (v[:, 2].min(), todos[:, 2].min(), todos[todos[:, 2].argmin(), 1], junta_y))


def montar(bon):
    rig = bon.rig
    junta_y = dt.inclinar(bon, ANGULO, ASSENTO)
    sentar_no_assento(bon, junta_y)
    banco = e3.banco_inclinado("banco", ANGULO, ASSENTO, junta_y)
    halteres = {l: e3.halter("halter_" + l, pegada=PEGADA_H, raio=RAIO, raio_anilha=0.055) for l, _ in dt.LADOS}
    maos = Maos(bon, RAIO)
    S = {l: p3.cabeca(rig, l + "Arm") for l, _ in dt.LADOS}
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length       # braço
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length      # antebraço

    off = {}                     # vão da mão − punho com a mão nessa orientação (fixa o movimento todo)
    for lado, s in dt.LADOS:
        g = S[lado] + Vector((s * 0.25, -0.1, 0.35))
        maos.segurar(lado, g, DEDOS_Q, PALMA_Q, polo=S[lado] + Vector((s * 0.5, 0, -0.4)))
        off[lado] = g - p3.cabeca(rig, lado + "Hand")

    # o braço gira em volta do ombro no plano da escápula e o punho fica sempre em cima do cotovelo (antebraço na
    # vertical, "elbows below wrists" do ExRx): a flexão do cotovelo é 90° − o ângulo do braço com a horizontal.
    def maos_no_angulo(fi):
        """Pegada de cada mão com o braço `fi` graus acima da horizontal e o antebraço na vertical."""
        g, p = {}, math.radians(PLANO)
        for lado, s in dt.LADOS:
            f = math.radians(fi)
            cot = S[lado] + Vector((s * math.cos(p) * math.cos(f), -math.sin(p) * math.cos(f), math.sin(f))) * Lb
            g[lado] = cot + Vector((0, 0, La)) + off[lado]
        return g

    fi0, fi1 = BAIXO, 90 - COTOVELO_CIMA
    g0, g1 = maos_no_angulo(fi0), maos_no_angulo(fi1)
    vao = (g1["Left"].x - g1["Right"].x) - PEGADA_H - 2 * 0.06          # entre as anilhas de dentro, em cima
    print("HALTERES braço de %.0f° a %.0f° da horizontal | embaixo E (%.3f %.3f %.3f) em cima E (%.3f %.3f %.3f) | "
          "ombro E (%.3f %.3f %.3f) | halter embaixo %.0f mm acima do ombro | vão entre os halteres em cima ~%.0f mm"
          % (fi0, fi1, *g0["Left"], *g1["Left"], *S["Left"], (g0["Left"].z - S["Left"].z) * 1000, vao * 1000))

    def pose(t):
        """t=0 halteres na altura das orelhas, t=1 braços estendidos acima da cabeça."""
        gs = maos_no_angulo(p3.lerp(fi0, fi1, t))
        for lado, _ in dt.LADOS:
            g = gs[lado]
            maos.segurar(lado, g, DEDOS_Q, PALMA_Q, polo=dt.polo_cotovelo_baixo(S[lado], g - off[lado], Lb, La))
            eixo = pg._base(rig, lado)[1]                   # o halter fica na linha dos nós dos dedos
            h = halteres[lado]
            h.rotation_mode = "QUATERNION"
            h.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(eixo)
            h.location = g
            p3.atualizar()
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, g, eixo, RAIO, polegar_antes=antes)

    pose.dedos = {}

    pose(0.0)                                    # polo certo do cotovelo na pose de baixo
    for lado, _ in dt.LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)

    pegs = [(l, ck.Barra(halteres[l], raio=RAIO, meio_compr=PEGADA_H / 2)) for l, _ in dt.LADOS]
    return Cena(pose, [halteres["Left"], halteres["Right"]], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, 0.05, 1.0),
                camera_video=((2.0, -4.2, 1.25), (0, 0.05, 1.0), 50), info=maos.info, apoios=[banco],
                afunda_apoio_mm=20)
