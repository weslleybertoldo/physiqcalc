# Desenvolvimento Arnold — cena da fábrica 3D (lote 3, 05/10/2026).
# t = 0 halteres na frente dos ombros, na altura do queixo, palmas viradas pro rosto (pegada supinada, como no topo da
# rosca), cotovelos dobrados, embaixo dos punhos e na frente do tronco · t = 1 braços estendidos acima da cabeça, palmas
# pra frente, sem um halter encostar no outro. No caminho os cotovelos abrem pro lado enquanto os halteres sobem
# (ExRx: "Initiate movement by bringing elbows out to sides. Continue to raise elbows outward while pressing dumbbells
# overhead") e a palma gira junto, passando pelo meio (palmas uma pra outra) até ficar de frente em cima (BarBend:
# "Don't twist your arms and then press; do both at the same time"). Sentado como no Desenvolvimento com Halteres do
# lote 1 (mesmo banco e mesmo jeito de sentar): encosto quase em pé, glúteo no assento, costas e cabeça no encosto,
# pés chapados no chão.
import math
from mathutils import Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import deitado3d as dt
from maos3d import Maos
from cena import Cena
from desenvolvimento_com_halteres import sentar_no_assento, ANGULO, ASSENTO

RAIO = 0.0145                  # pegada do halter: 29 mm, o cilindro da mão de referência
PEGADA_H = 0.13                # comprimento da pegada do halter (entre as anilhas)
RAIO_ANILHA = 0.055
LARG_ANILHA = 0.05
# braço (ombro → cotovelo): `f` graus acima da horizontal e `p` graus à frente do lado (0 = pro lado, 90 = pra frente)
F0, F1 = -55, 80               # embaixo: cotovelo na frente e abaixo do ombro · em cima: braço quase na vertical
P0, P1 = 98, 30                # embaixo: cotovelo na frente, um pouco pra dentro do ombro (cotovelos fechados) · em
                               # cima: plano da escápula (cotovelos pro lado)
ABRE_ATE = 0.55                # os cotovelos terminam de abrir pro lado nesse t (o resto é só empurrar pra cima)
INCL0, INCL_ATE = 12, 0.35     # antebraço embaixo: graus à frente da vertical (punho um pouco à frente do cotovelo),
                               # chegando na vertical nesse t
PHI0, PHI1 = 10, 180           # palma: 0 = virada pro corpo, 90 = pro meio, 180 = pra frente
GIRO_ATE = 0.85                # a palma termina de girar nesse t
PUNHO = 5                      # punho quase neutro: 5° de extensão, como no desenvolvimento com halteres
CIMA = Vector((0, 0, 1))


def ss(x):
    """Rampa suave 0 → 1 (smoothstep) com x preso em [0, 1]."""
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def montar(bon):
    rig = bon.rig
    junta_y = dt.inclinar(bon, ANGULO, ASSENTO)
    sentar_no_assento(bon, junta_y)
    banco = e3.banco_inclinado("banco", ANGULO, ASSENTO, junta_y)
    halteres = {l: e3.halter("halter_" + l, pegada=PEGADA_H, raio=RAIO, raio_anilha=RAIO_ANILHA,
                             larg_anilha=LARG_ANILHA) for l, _ in dt.LADOS}
    maos = Maos(bon, RAIO)
    S = {l: p3.cabeca(rig, l + "Arm") for l, _ in dt.LADOS}
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length       # braço
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length      # antebraço

    def juntas(t):
        """Cotovelo, punho e direção do antebraço de cada lado no instante t."""
        f = math.radians(p3.lerp(F0, F1, t))
        p = math.radians(P0 + (P1 - P0) * ss(t / ABRE_ATE))
        b = math.radians(INCL0 * (1 - ss(t / INCL_ATE)))
        out = {}
        for lado, s in dt.LADOS:
            h = Vector((s * math.cos(p), -math.sin(p), 0))                 # pro lado em que o braço aponta (chão)
            E = S[lado] + Vector((s * math.cos(p) * math.cos(f), -math.sin(p) * math.cos(f), math.sin(f))) * Lb
            a = CIMA * math.cos(b) + h * math.sin(b)
            out[lado] = (E, E + a * La, a)
        return out

    def giro(t):
        return PHI0 + (PHI1 - PHI0) * ss(t / GIRO_ATE)

    def mao_dirs(phi, s, a):
        """Dedos e palma (mundo): palma girada `phi` graus de virada pro corpo (0) pra frente (180) passando pelo meio
        (90), com o punho PUNHO graus estendido em relação ao antebraço `a`; s = +1 esquerdo, −1 direito."""
        w = math.radians(phi)
        ph = Vector((-s * math.sin(w), math.cos(w), 0))                   # o boneco olha pra −Y
        n = (ph - a * ph.dot(a)).normalized()
        k = math.radians(PUNHO)
        return a * math.cos(k) - n * math.sin(k), n * math.cos(k) + a * math.sin(k)

    def polo(lado, E, W):
        """Polo do lado em que o cotovelo calculado fica (o IK põe o cotovelo nele)."""
        eixo = (W - S[lado]).normalized()
        fora = (E - S[lado]) - eixo * (E - S[lado]).dot(eixo)
        return E + fora.normalized() * 0.4

    # vão da mão − punho no referencial da mão (dedos, palma, dedos × palma): fixo, a mão não mexe no antebraço
    off_local = {}
    js = juntas(0.0)
    for lado, s in dt.LADOS:
        E, W, a = js[lado]
        d, n = mao_dirs(giro(0.0), s, a)
        g = W + d * 0.08
        maos.segurar(lado, g, d, n, polo=polo(lado, E, W))
        off = g - p3.cabeca(rig, lado + "Hand")
        off_local[lado] = (off.dot(d), off.dot(n), off.dot(d.cross(n)))

    def pegada(lado, s, t, js):
        E, W, a = js[lado]
        d, n = mao_dirs(giro(t), s, a)
        o = off_local[lado]
        return W + d * o[0] + n * o[1] + d.cross(n) * o[2], d, n, E, W

    def pontos_halter(h):
        """Pontos na superfície das 2 anilhas do halter (as 2 faces: borda e centro) e nas pontas do eixo."""
        M = h.matrix_world.to_3x3()
        c = h.matrix_world.to_translation()
        ex, e1, e2 = (M @ Vector(v) for v in ((1, 0, 0), (0, 1, 0), (0, 0, 1)))
        pts = [c + ex * (PEGADA_H / 2 + LARG_ANILHA + 0.01) * sg for sg in (-1, 1)]
        for sg in (-1, 1):
            for x in (PEGADA_H / 2, PEGADA_H / 2 + LARG_ANILHA):
                f = c + ex * (sg * x)
                pts.append(f)
                pts += [f + (e1 * math.cos(a) + e2 * math.sin(a)) * RAIO_ANILHA
                        for a in (math.radians(k * 15) for k in range(24))]
        return pts

    def vao_halteres():
        """Menor distância entre os pontos das superfícies dos 2 halteres (anilhas e pontas do eixo): perto de 0 =
        batem."""
        a = pontos_halter(halteres["Left"])
        b = pontos_halter(halteres["Right"])
        return min((p - q).length for p in a for q in b)

    def pose(t):
        """t=0 halteres na frente dos ombros, palmas pro rosto; t=1 braços estendidos em cima, palmas pra frente."""
        js = juntas(t)
        for lado, s in dt.LADOS:
            g, d, n, E, W = pegada(lado, s, t, js)
            maos.segurar(lado, g, d, n, polo=polo(lado, E, W))
            eixo = pg._base(rig, lado)[1]                   # o halter fica na linha dos nós dos dedos
            h = halteres[lado]
            h.rotation_mode = "QUATERNION"
            h.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(eixo)
            h.location = g
            p3.atualizar()
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, g, eixo, RAIO, polegar_antes=antes)
        pose.diag = dict(giro=giro(t), vao=vao_halteres() * 1000,
                         cot={l: (p3.cabeca(rig, l + "ForeArm") - js[l][0]).length * 1000 for l, _ in dt.LADOS},
                         pron={l: pronacao(l, s) for l, s in dt.LADOS})

    def pronacao(lado, s):
        """Giro do antebraço em relação ao plano em que o cotovelo dobra, graus: 0 = neutro (polegar pra cima com o
        cotovelo dobrado do lado do corpo), + = pronação, − = supinação (palma pro rosto no começo). Diagnóstico."""
        b = p3.cabeca(rig, lado + "ForeArm") - p3.cabeca(rig, lado + "Arm")
        a = (p3.cabeca(rig, lado + "Hand") - p3.cabeca(rig, lado + "ForeArm")).normalized()
        neutra = b.cross(a) * s
        palma = pg._base(rig, lado)[0]
        neutra = (neutra - a * neutra.dot(a)).normalized()
        palma = (palma - a * palma.dot(a)).normalized()
        return s * math.degrees(math.atan2(neutra.cross(palma).dot(a), neutra.dot(palma)))

    pose.dedos = {}
    pose.diag = {}

    pose(0.0)                                    # polo certo do cotovelo na pose de baixo
    for lado, _ in dt.LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)

    for t in (0.0, 0.5, 1.0):
        js = juntas(t)
        g, d, n, E, W = pegada("Left", 1, t, js)
        print("ARNOLD t=%.1f: pegada E (%.3f %.3f %.3f) = ombro %+.0f %+.0f %+.0f mm | cotovelo E (%.3f %.3f %.3f) | "
              "giro da palma %.0f°" % (t, *g, *((g - S["Left"]) * 1000), *E, giro(t)))
    print("ARNOLD ombro E (%.3f %.3f %.3f) | braço %.3f m | antebraço %.3f m | vão−punho na mão (%.3f %.3f %.3f)"
          % (*S["Left"], Lb, La, *off_local["Left"]))

    def info():
        d = pose.diag
        return maos.info() + " | palma girada %.0f° | antebraço (+ pronação, − supinação) E %.0f° D %.0f° | vão entre " \
            "os halteres %.0f mm | cotovelo fora do calculado E %.1f D %.1f mm" % (
                d.get("giro", 0), d.get("pron", {}).get("Left", 0), d.get("pron", {}).get("Right", 0), d.get("vao", 0),
                d.get("cot", {}).get("Left", 0), d.get("cot", {}).get("Right", 0))

    pegs = [(l, ck.Barra(halteres[l], raio=RAIO, meio_compr=PEGADA_H / 2)) for l, _ in dt.LADOS]
    return Cena(pose, [halteres["Left"], halteres["Right"]], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, 0.05, 1.0),
                camera_video=((2.0, -4.2, 1.25), (0, 0.05, 1.0), 50), info=info, apoios=[banco],
                afunda_apoio_mm=20)
