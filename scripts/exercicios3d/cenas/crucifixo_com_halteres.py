# Crucifixo com Halteres — cena da fábrica 3D (lote 2, 04/10/2026).
# t = 0 braços quase estendidos em cima do peito, halteres quase encostando um no outro · t = 1 braços abertos pros
# lados, halteres na altura do peito. Deitado de costas no banco reto (cabeça, costas e glúteo no estofado), pés
# chapados no chão, pegada neutra (palmas uma pra outra em cima, pra cima embaixo; halteres paralelos ao corpo).
# O braço inteiro gira como uma peça só em volta do ombro (adução/abdução horizontal pura, no plano dos ombros):
# cotovelo levemente dobrado e PARADO, apontando pra fora em cima e pro chão embaixo, punho neutro.
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
RAIO_ANILHA = 0.055
TOPO = 0.44                    # altura do estofado (m)
BANCO_Y = (-0.28, 0.92)        # pé e cabeceira do banco
COTOVELO = 25                  # flexão do cotovelo, graus, parada o movimento todo (150–160° por dentro, Solstad 2020)
VAO_CIMA = 0.04                # em cima: folga entre as anilhas de dentro dos 2 halteres (m) — quase juntos, sem encostar
ALTURA_PEITO = 0.0             # embaixo: eixo do halter nessa altura (m) acima da pele mais alta do peito
EIXO = Vector((0, 1, 0))       # o arco gira em volta do eixo cabeça ↔ pés: os halteres ficam paralelos entre si
CIMA = Vector((0, 0, 1))


def montar(bon):
    rig = bon.rig
    dt.deitar(bon, TOPO)
    banco = e3.banco("banco", *BANCO_Y, topo=TOPO)
    halteres = {l: e3.halter("halter_" + l, pegada=PEGADA_H, raio=RAIO, raio_anilha=RAIO_ANILHA) for l, _ in dt.LADOS}
    maos = Maos(bon, RAIO)
    S = {l: p3.cabeca(rig, l + "Arm") for l, _ in dt.LADOS}
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length       # braço
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length      # antebraço
    fi = math.radians(COTOVELO)

    def bracos(th):
        """Braço, antebraço e palma (mundo) de cada lado com o braço a `th` graus acima da horizontal, no plano ⟂ EIXO
        que passa pelo ombro. O cotovelo dobra pra dentro do arco (o antebraço vai pro lado que o braço fecha) e a
        palma olha pra esse mesmo lado: o braço todo é uma peça só girando em volta do EIXO."""
        out = {}
        for lado, s in dt.LADOS:
            fora = Vector((s, 0, 0))
            a = math.radians(th)
            braco = fora * math.cos(a) + CIMA * math.sin(a)
            fecha = -fora * math.sin(a) + CIMA * math.cos(a)          # pra onde o braço anda fechando
            ante = braco * math.cos(fi) + fecha * math.sin(fi)
            palma = -braco * math.sin(fi) + fecha * math.cos(fi)
            out[lado] = (braco, ante, palma)
        return out

    def juntas(th):
        """Cotovelo e punho calculados de cada lado (o braço do boneco tem comprimento fixo)."""
        out = {}
        for lado, (braco, ante, palma) in bracos(th).items():
            E = S[lado] + braco * Lb
            out[lado] = (E, E + ante * La)
        return out

    def polo(lado, E, W):
        eixo = (W - S[lado]).normalized()
        fora = (E - S[lado]) - eixo * (E - S[lado]).dot(eixo)
        return E + fora.normalized() * 0.4

    # ── referência (braço a 45°): (1) quanto a mão gira em volta da palma pra linha dos nós dos dedos (onde fica o
    # eixo do halter) ficar paralela ao EIXO — com a mão reta no antebraço ela fica 6–8° torta (medido 04/10/2026) e,
    # girando com o braço, os 2 halteres abririam em V embaixo; o giro fica no punho (6–8°, desvio de lado, sem
    # dobrar pra frente nem pra trás); (2) onde fica o vão da mão em relação ao punho, no referencial da mão (fixo: a
    # mão não mexe em relação ao antebraço)
    TH_REF = 45.0
    dirs = bracos(TH_REF)
    giro, off_local = {}, {}
    for lado, s in dt.LADOS:
        braco, ante, palma = dirs[lado]
        E, W = juntas(TH_REF)[lado]
        maos.segurar(lado, W + ante * 0.08, ante, palma, polo=polo(lado, E, W))
        nos = pg._base(rig, lado)[1]
        nos_p = (nos - palma * nos.dot(palma)).normalized()
        quer = EIXO if nos_p.dot(EIXO) > 0 else -EIXO
        giro[lado] = math.atan2(nos_p.cross(quer).dot(palma), nos_p.dot(quer))
        dq = Matrix.Rotation(giro[lado], 3, palma) @ ante
        maos.segurar(lado, W + dq * 0.08, dq, palma, polo=polo(lado, E, W))
        g = W + dq * 0.08
        mao = p3.cabeca(rig, lado + "Hand")
        off = g - mao
        lat = dq.cross(palma)
        off_local[lado] = (off.dot(dq), off.dot(palma), off.dot(lat))
        nos2 = pg._base(rig, lado)[1]
        print("REF %s: giro da mão %.1f° | nós × EIXO antes %.1f° depois %.1f° | vão−punho no referencial da mão "
              "(%.3f %.3f %.3f)" % (lado, math.degrees(giro[lado]), math.degrees(nos.angle(quer)),
                                    math.degrees(min(nos2.angle(EIXO), nos2.angle(-EIXO))), *off_local[lado]))

    def maos_no_angulo(th):
        """Vão da mão (eixo do halter), direção dos dedos e da palma de cada lado com o braço a `th` graus."""
        out = {}
        for lado, (braco, ante, palma) in bracos(th).items():
            E, W = juntas(th)[lado]
            dq = Matrix.Rotation(giro[lado], 3, palma) @ ante
            lat = dq.cross(palma)
            o = off_local[lado]
            out[lado] = (W + dq * o[0] + palma * o[1] + lat * o[2], dq, palma, E, W)
        return out

    def bisseca(f, a, b, n=40):
        fa = f(a)
        for _ in range(n):
            m = (a + b) / 2
            fm = f(m)
            if (fm > 0) == (fa > 0):
                a, fa = m, fm
            else:
                b = m
        return (a + b) / 2

    # ── em cima: halteres quase juntos, sem encostar (folga VAO_CIMA entre as anilhas de dentro) ─────────────
    def folga_cima(th):
        g = maos_no_angulo(th)
        return (g["Left"][0].x - g["Right"][0].x) - 2 * RAIO_ANILHA - VAO_CIMA
    th0 = bisseca(folga_cima, 45.0, 130.0)
    # ── embaixo: eixo do halter na altura da pele mais alta do peito (na linha dos halteres) ───────────────────
    def altura_baixo(th):
        g = maos_no_angulo(th)["Left"][0]
        return g.z - (dt.peito(bon, g.y) + ALTURA_PEITO)
    th1 = bisseca(altura_baixo, -40.0, 45.0)
    g0, g1 = maos_no_angulo(th0), maos_no_angulo(th1)
    print("CRUCIFIXO braço de %.1f° (em cima) a %.1f° (embaixo) da horizontal | cotovelo %d° | em cima E (%.3f %.3f %.3f)"
          " D (%.3f %.3f %.3f) | embaixo E (%.3f %.3f %.3f) | ombro E (%.3f %.3f %.3f) | peito embaixo z %.3f"
          % (th0, th1, COTOVELO, *g0["Left"][0], *g0["Right"][0], *g1["Left"][0], *S["Left"],
             dt.peito(bon, g1["Left"][0].y)))

    def pose(t):
        """t=0 braços quase estendidos em cima do peito, t=1 braços abertos, halteres na altura do peito."""
        gs = maos_no_angulo(p3.lerp(th0, th1, t))
        for lado, _ in dt.LADOS:
            g, dq, palma, E, W = gs[lado]
            maos.segurar(lado, g, dq, palma, polo=polo(lado, E, W))
            eixo = pg._base(rig, lado)[1]                   # o halter fica na linha dos nós dos dedos
            h = halteres[lado]
            h.rotation_mode = "QUATERNION"
            h.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(eixo)
            h.location = g
            p3.atualizar()
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, g, eixo, RAIO, polegar_antes=antes)
        pose.desvio = {l: (p3.cabeca(rig, l + "ForeArm") - gs[l][3]).length * 1000 for l, _ in dt.LADOS}

    pose.dedos = {}
    pose.desvio = {}

    pose(0.5)                                    # polo certo do cotovelo no meio do arco
    for lado, _ in dt.LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)

    def info():
        return maos.info() + " | cotovelo fora do calculado E %.1f D %.1f mm" % (
            pose.desvio.get("Left", 0), pose.desvio.get("Right", 0))

    pegs = [(l, ck.Barra(halteres[l], raio=RAIO, meio_compr=PEGADA_H / 2)) for l, _ in dt.LADOS]
    return Cena(pose, [halteres["Left"], halteres["Right"]], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, 0.3, 0.7),
                camera_video=((2.2, -2.9, 1.7), (0, 0.3, 0.7), 50), info=info, apoios=[banco],
                afunda_apoio_mm=20)
