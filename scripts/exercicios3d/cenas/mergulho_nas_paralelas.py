# Mergulho nas Paralelas — cena da fábrica 3D (lote 2, 05/10/2026).
# t = 0 em cima: braços estendidos (cotovelo solto, sem travar), ombros em cima das mãos e baixados (sem encolher),
# corpo reto quase na vertical · t = 1 embaixo: cotovelos a ~90°, braço um pouco abaixo da horizontal, cotovelos
# apontando pra trás (sem abrir pro lado), antebraço quase em pé e o tronco um pouco inclinado pra frente.
# Versão de TRÍCEPS (o grupo do catálogo): ExRx — Triceps Dip: "Mount shoulder width dip bar, arms straight with
# shoulders above hands. Keep hips straight." / "Lower body until slight stretch is felt in shoulders. Push body up
# until arms are straight." (a versão de peito, ExRx — Chest Dip, é outra: barras largas, "Bend knees and hips
# slightly", "allowing elbows to flare out to sides"). Çınarlı et al. 2021 (Kinesiologia Slovenica 27(3):57-69), o
# mergulho nas paralelas medido no tríceps: "keep the trunk as straight as possible and keep their elbows close to the
# trunk while descending", de "full extension" até 75–95° de flexão do cotovelo.
# Quem desce é o CORPO: as mãos ficam paradas nas barras (pegada neutra, palmas uma de frente pra outra, punho em cima
# da barra) e o quadril (Hips) anda; os braços vão por IK do ombro até o punho parado. Pernas soltas e quase estendidas,
# em linha com o tronco (quadril reto, ExRx), pés fora do chão o movimento todo.
# Equilíbrio: só as mãos seguram o corpo, então o centro de massa (malha do corpo, densidade uniforme) fica em cima
# delas em todo quadro — o tronco inclina só o que o equilíbrio pede pra o cotovelo ir pra trás com o antebraço quase
# em pé (tronco o mais em pé possível, Çınarlı 2021).
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from maos3d import Maos
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))
RAIO = 0.019            # barra de 38 mm (Lacertosus Training Dip Station: "Overlarge handle diameter of 38 mm")
LARGURA = 0.50          # entre os eixos das barras (m): FIG 42–52 cm; o quadril passa entre elas com folga
COMPR = 1.40            # entre as colunas de cada barra (m): a cabeça na frente e os pés atrás passam longe delas
ALTURA = 1.10           # eixo das barras (m)
YG = 0.0                # as mãos ficam em y = YG nas barras
PHI = (6, 90)           # flexão do cotovelo (graus): em cima solto, sem travar → embaixo ~90°
GAMA = (0, 15)          # antebraço inclinado pra trás (cotovelo atrás do punho), graus da vertical: em pé em cima;
                        # embaixo, com o cotovelo a 90°, o braço fica 15° abaixo da horizontal (McRobert: "parallel
                        # to the floor or just slightly below")
ADUZ = 1                # pernas um pouco fechadas em volta do quadril (graus): pés mais juntos que no repouso
JOELHO = 6              # joelhos soltos, quase estendidos (graus)
PLANTAR = 25            # pés soltos, ponta pra baixo (flexão plantar, graus)
EXTENSAO = None         # extensão do punho (graus); None = a que deixa o punho bem em cima da barra
EIXO = Vector((0, 1, 0))


def centro_de_massa(bon):
    """Centro de massa do corpo (malha fechada, densidade uniforme): soma dos tetraedros origem → triângulo."""
    co, tri, _ = ck._avaliar(bon.corpo, 0)
    v0, v1, v2 = co[tri[:, 0]], co[tri[:, 1]], co[tri[:, 2]]
    vol = np.einsum("ij,ij->i", v0, np.cross(v1, v2)) / 6
    return Vector(((v0 + v1 + v2) * vol[:, None]).sum(axis=0) / 4 / vol.sum())


def montar(bon):
    rig = bon.rig
    PB = rig.pose.bones
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length       # braço
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length      # antebraço
    pivo = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2      # articulações do quadril
    S0x = {l: p3.cabeca(rig, l + "Arm").x for l, _ in LADOS}                    # o corpo só gira em volta do X

    # ── pernas soltas, quase estendidas, um pouco fechadas, pés com a ponta pra baixo (o quadril fica reto) ──────
    for lado, s in LADOS:
        p3.girar_osso(rig, lado + "UpLeg", p3.rot_eixo(ADUZ, (0, s, 0)))
        p3.girar_osso(rig, lado + "Leg", p3.rot_x(JOELHO))
        p3.girar_osso(rig, lado + "Foot", p3.rot_x(PLANTAR))

    raiz, barras = e3.paralelas("paralelas", largura=LARGURA, altura=ALTURA, comprimento=COMPR, raio=RAIO, y0=YG)
    g = {l: Vector((s * LARGURA / 2, YG, ALTURA)) for l, s in LADOS}             # vão de cada mão no eixo da barra
    print("MÃO DE REFERÊNCIA da barra de %.0f mm (Shimawaki 2019 interpolado): %s" % (
        RAIO * 2000, pg.usar_cilindro(RAIO * 2000)))                             # a de 29 mm não deixa a barra caber
    maos = Maos(bon, RAIO)

    # ── mão na barra: pegada neutra (palma pro meio), parada no mundo o movimento todo ──────────────────────────
    # (1) giro em volta da palma pra linha dos nós dos dedos (onde passa o eixo da barra) ficar ao longo da barra;
    # (2) onde fica o vão da mão em relação ao punho, no referencial da mão; (3) extensão do punho (a mão tomba pra
    # fora em volta da barra) que deixa o punho bem em cima da barra: o peso desce reto pelo antebraço.
    def base(s):
        return Vector((0, 0, -1)), Vector((-s, 0, 0))            # dedos pra baixo, palma pro meio

    giro, off = {}, {}
    for lado, s in LADOS:
        S = p3.cabeca(rig, lado + "Arm")
        gr = S + Vector((s * 0.05, -0.05, -0.50))                # referência: braço pendurado
        dq, pq = base(s)
        polo_ref = p3.cabeca(rig, lado + "ForeArm") + Vector((0, 0.5, 0))
        maos.segurar(lado, gr, dq, pq, polo=polo_ref)
        nos = pg._base(rig, lado)[1]
        nos_p = (nos - pq * nos.dot(pq)).normalized()
        quer = EIXO if nos_p.dot(EIXO) > 0 else -EIXO
        giro[lado] = math.atan2(nos_p.cross(quer).dot(pq), nos_p.dot(quer))
        dq = Matrix.Rotation(giro[lado], 3, pq) @ dq
        maos.segurar(lado, gr, dq, pq, polo=polo_ref)
        o = gr - p3.cabeca(rig, lado + "Hand")
        lat = dq.cross(pq)
        off[lado] = (o.dot(dq), o.dot(pq), o.dot(lat))
        nos2 = pg._base(rig, lado)[1]
        print("REF %s: giro da mão %.1f° | nós × barra antes %.1f° depois %.1f° | vão−punho no referencial da mão "
              "(%.3f %.3f %.3f)" % (lado, math.degrees(giro[lado]), math.degrees(min(nos.angle(quer), nos.angle(-quer))),
                                    math.degrees(min(nos2.angle(EIXO), nos2.angle(-EIXO))), *off[lado]))

    quadro_mao, W, ext = {}, {}, {}
    for lado, s in LADOS:
        dq0, pq0 = base(s)
        dq0 = Matrix.Rotation(giro[lado], 3, pq0) @ dq0
        lat0 = dq0.cross(pq0)
        o = off[lado]
        v0 = dq0 * o[0] + pq0 * o[1] + lat0 * o[2]                 # punho → vão com o punho reto
        b = math.atan(-v0.x / v0.z) if EXTENSAO is None else -s * math.radians(EXTENSAO)   # vão embaixo do punho
        R = Matrix.Rotation(b, 3, EIXO)
        dq, pq = R @ dq0, R @ pq0
        quadro_mao[lado] = (dq, pq)
        W[lado] = g[lado] - R @ v0
        ext[lado] = -s * math.degrees(b)
        print("MÃO %s: punho estendido %.1f° | punho (%.3f %.3f %.3f) | vão (%.3f %.3f %.3f)" % (
            lado, ext[lado], *W[lado], *g[lado]))

    def alvos(t):
        """Ombro e cotovelo calculados de cada lado (vista de lado: antebraço GAMA da vertical, cotovelo PHI)."""
        phi = math.radians(p3.lerp(*PHI, t))
        gam = math.radians(p3.lerp(*GAMA, t))
        D = math.sqrt(Lb ** 2 + La ** 2 + 2 * Lb * La * math.cos(phi))
        out = {}
        for lado, s in LADOS:
            dx = S0x[lado] - W[lado].x
            v = Vector((0, La * math.sin(gam) + Lb * math.sin(gam - phi), La * math.cos(gam) + Lb * math.cos(gam - phi)))
            v *= math.sqrt(max(D ** 2 - dx ** 2, 1e-8)) / v.length
            S = Vector((S0x[lado], W[lado].y + v.y, W[lado].z + v.z))
            E = W[lado] + Vector((dx * 0.5, La * math.sin(gam), La * math.cos(gam)))
            out[lado] = (S, E)
        return out

    def polo(lado, S, E):
        eixo = (W[lado] - S).normalized()
        fora = (E - S) - eixo * (E - S).dot(eixo)
        if fora.length < 1e-3:
            fora = Vector((0, 1, 0))
        return E + fora.normalized() * 0.4

    def por_corpo(theta, S_meio):
        PB[p3.P + "Hips"].matrix_basis = Matrix()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(theta), pivo=pivo)
        m = (p3.cabeca(rig, "LeftArm") + p3.cabeca(rig, "RightArm")) / 2
        p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=S_meio - m)

    def bracos(al):
        for lado, s in LADOS:
            S, E = al[lado]
            dq, pq = quadro_mao[lado]
            maos.segurar(lado, g[lado], dq, pq, polo=polo(lado, S, E))

    def colocar(t):
        """Corpo no quadro t: ombros nos alvos e tronco inclinado até o centro de massa ficar em cima das mãos."""
        al = alvos(t)
        S_meio = (al["Left"][0] + al["Right"][0]) / 2

        def f(th):
            por_corpo(th, S_meio)
            bracos(al)
            return centro_de_massa(bon).y - YG

        a = colocar.theta
        fa = f(a)
        b = a + 2.0
        fb = f(b)
        for _ in range(6):
            if abs(fb) < 0.0015 or abs(fb - fa) < 1e-9:
                break
            a, fa, b = b, fb, b - fb * (b - a) / (fb - fa)
            fb = f(b)
        colocar.theta = b
        colocar.cm = fb
        return b

    colocar.theta = 0.0
    colocar.cm = 0.0

    def pose(t):
        """t=0 em cima (braços estendidos), t=1 embaixo (cotovelos a ~90°)."""
        colocar(t)
        for lado, _ in LADOS:                      # dedos e polegar fecham até a pele encostar na barra
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, g[lado], EIXO, RAIO, polegar_antes=antes)

    pose.dedos = {}

    pose(0.5)                                    # polo certo do cotovelo no meio do movimento
    for lado, _ in LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)
    colocar.theta = 0.0

    def medidas():
        jt = ck.medir_juntas(rig)
        S, E, Wd = (p3.cabeca(rig, "LeftArm"), p3.cabeca(rig, "LeftForeArm"), p3.cabeca(rig, "LeftHand"))
        ante = math.degrees(math.atan2((E - Wd).y, (E - Wd).z))
        braco = math.degrees(math.atan2(S.z - E.z, math.hypot(S.x - E.x, S.y - E.y)))
        tronco = p3.cabeca(rig, "Neck") - p3.cabeca(rig, "Hips")
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        pes = co[np.array([n.endswith(("Foot", "ToeBase")) for n in nomes] + [False])[dono]]
        return dict(cotovelo=jt["cotoveloE"], ante=ante, braco=braco,
                    tronco=math.degrees(math.atan2(-tronco.y, tronco.z)), pe=pes[:, 2].min() * 1000)

    m = medidas()
    print("CENTRO tronco %.1f° | centro de massa %+.1f mm das mãos | cotovelo %.0f° | antebraço %.0f° | braço %.0f° | "
          "pé mais baixo %.0f mm (t=0,5)" % (m["tronco"], colocar.cm * 1000, m["cotovelo"], m["ante"], m["braco"], m["pe"]))

    def info():
        m = medidas()
        return maos.info() + (" | tronco %.1f° à frente | centro de massa %+.1f mm das mãos (+ = atrás) | cotovelo %.0f° |"
                               " antebraço %.0f° pra trás | braço %.0f° abaixo da horizontal (− = acima) | pé mais baixo "
                               "%.0f mm do chão" % (m["tronco"], colocar.cm * 1000, m["cotovelo"], m["ante"], m["braco"],
                                                     m["pe"]))

    pegs = [(l, ck.Barra(b, raio=RAIO, meio_compr=COMPR / 2, eixo=(0, 0, 1))) for (l, _), b in zip(LADOS, barras)]
    return Cena(pose, [raiz], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, 0, 1.2),
                camera_video=((3.9, -3.0, 1.7), (0, 0.05, 1.1), 50), info=info)
