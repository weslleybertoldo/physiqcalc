# Elevação Frontal com Halteres — cena da fábrica 3D (lote 7, 09/10/2026; dos treinos prontos do app).
# t = 0 começo: braços quase estendidos, pendurados um pouco à frente do corpo, com os halteres logo na frente das coxas e as
# palmas viradas pra elas · t = 1 fim: braços um pouco acima da horizontal, halteres na altura dos ombros e palmas pra baixo.
# Técnica (fontes na ficha, com as frases): em pé, ereto, um halter em cada mão com pegada pronada fechada (polegar em volta) e
# as palmas viradas pras coxas, os halteres na frente delas, quase encostando (ACE, Front Raise: "Stand holding dumbbells in front
# of you thighs using a closed, pronated grip (thumbs around the handles and palms facing your thighs). Position the dumbbells
# lightly touching the fronts of your thighs with your elbows extended or holding a slight bend"; NSCA, Basics of Strength and
# Conditioning Manual, Front Raises: "Let arms hang in front of the thighs"); pés na largura do quadril com as pontas pra frente e
# joelhos levemente dobrados (NSCA: "Position feet hip-width apart with toes pointed straight ahead"; "Slightly flex knees and
# engage the core to stabilize the body and prevent arching of the back (avoid rocking back and forth to complete the lift)";
# ACE: "position your feet slightly wider than hip-width apart"). Os 2 braços sobem JUNTOS pela frente, no plano sagital (ExRx,
# Dumbbell Front Raise: "Raise dumbbells forward and upward until upper arms are above horizontal"; NSCA: "raise dumbbells
# directly to the front until they are at shoulder level"; Coratella 2020: "frontally flex the humerus up to 90°" e "Frontal
# raise was performed on the sagittal plane"), com os cotovelos levemente dobrados e PARADOS (ExRx: "Elbows may be kept straight
# or slightly bent throughout movement"; Coratella 2020: "the elbow was almost fully extended, and the wrist in line with the
# forearm"), punho reto, palmas pra baixo em cima (NSCA: "Keep palms facing the ground"; ExRx, Dumbbell Alternating Front Raise:
# "with palms positioned downward") e, passando de ~60–70° de elevação, o braço gira um pouco pra fora e o lado do polegar do
# halter sobe um pouco (ACE: "As your arms move past 60 - 70 degrees (nearing shoulder level), slowly rotate them upwards
# somewhat so that the inside edge of the dumbbells point slightly upwards"; na descida volta: "rotating them slightly inwards
# as your arms pass that 60-70 degree mark"). Tronco ereto e parado, cabeça na linha da coluna (ACE: "Maintain an erect torso";
# NSCA: "Maintain a constant head, body, and arm position throughout the entire lift").
# Altura do fim: a dica do app diz "até a altura dos olhos"; as 4 fontes param antes — braço um pouco acima da horizontal (ExRx:
# "height just above horizontal may be considered adequate"), halteres na altura dos ombros (NSCA, ACE: "until your arms are
# level with your shoulders and approximately parallel with the floor"; Coratella: 90°). A cena segue as fontes (ELEVA[1]).
# Montagem: braço inteiro como uma peça só subindo em volta do eixo de lado a lado do ombro (flexão do ombro), ABRE graus
# aberto pro lado, parado; o cotovelo fica a COTOVELO graus, dobrando pro meio do corpo e pra frente (DOBRA): embaixo as mãos
# caem na frente das coxas e em cima os cotovelos ficam um pouco por fora das mãos, como na pegada pronada de verdade; a palma
# segue o braço (pra trás embaixo, pra baixo em cima) e gira GIRO graus pra dentro no fim, junto com a dobra do cotovelo (o braço
# todo girando pra fora em volta do próprio eixo). Pernas por IK, tornozelos a ±PES_X do meio, joelhos a JOELHO graus, pés
# chapados (a conta do quadril do crucifixo invertido com halteres, com o tronco em pé). Halteres no vão da mão, na linha dos nós
# dos dedos (como na elevação lateral e no crucifixo invertido com halteres), polegar novo dando a volta no pegador.
import math
import bpy
from mathutils import Vector, Matrix
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from cena import Cena

ELEVA = (15.0, 95.0)  # flexão do ombro (braço × vertical do tronco, pra frente), começo → fim (graus): embaixo os halteres na
                      # frente das coxas, quase encostando (com 16° a anilha ficava a 17 mm da coxa; com 15°, a ~9 mm); em
                      # cima o braço passa um pouco da horizontal (ExRx "above horizontal") e os halteres ficam na altura dos
                      # ombros (NSCA), uns 8 cm acima da articulação do ombro e uns 16 cm abaixo dos olhos
ABRE = 1.5            # braço aberto pro lado (graus), parado: embaixo o braço passa rente à lateral do tronco sem entrar nela
COTOVELO = 12.0       # flexão do cotovelo (graus), parada o movimento todo: quase estendido ("slightly bent")
DOBRA = 30.0          # pra onde o cotovelo dobra, em volta do braço (graus): 0 = pro meio do corpo, 90 = pra frente embaixo e
                      # pra cima em cima (úmero neutro). Com 30 as mãos caem na frente das coxas, com as pontas de dentro dos 2
                      # halteres a ~5 cm uma da outra (com 45 as mãos ficavam por fora da coxa e os halteres a ~9 cm); em cima o
                      # cotovelo fica um pouco por fora e abaixo das mãos (a dobra do cotovelo virada pra dentro e pra cima)
GIRO = (65.0, 15.0)   # (a partir de quantos graus de elevação, quanto): o braço gira pra fora em volta do próprio eixo e o lado
                      # do polegar sobe (ACE: depois de 60–70°, "slightly upwards"); antes disso, nada
JOELHO = 12.0         # flexão dos joelhos (graus), parada: "Slightly flex knees" (NSCA)
PES_X = 0.165         # tornozelos a ±PES_X do meio (m): pés na largura do quadril (NSCA), um pouco mais abertos que as
                      # articulações do quadril (ACE); o repouso do boneco deixa a ±0,195 m
RECUA = 0.0           # quadril pra trás (m): com o joelho só um pouco dobrado, o corpo fica em cima do meio do pé
RAIO = 0.0145         # pegada do halter: 29 mm, o cilindro da mão de referência
PEGADA_H = 0.13       # comprimento da pegada do halter (entre as anilhas)
RAIO_ANILHA = 0.055
LARG_ANILHA = 0.05
LADOS = (("Left", 1), ("Right", -1))


def giro(th):
    """Rotação externa do braço (graus) com o braço a `th` graus de elevação: 0 até GIRO[0], depois sobe suave até GIRO[1] no
    fim (ACE: "As your arms move past 60 - 70 degrees ... slowly rotate them upwards somewhat")."""
    x = max(0.0, min(1.0, (th - GIRO[0]) / (ELEVA[1] - GIRO[0])))
    return GIRO[1] * x * x * (3 - 2 * x)


def montar(bon):
    pg.usar_polegar("volta")                       # polegar dando a volta no halter (jeito novo, lote 3)
    rig = bon.rig
    PB = rig.pose.bones
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length       # braço
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length      # antebraço
    coxa = (p3.cabeca(rig, "LeftLeg") - p3.cabeca(rig, "LeftUpLeg")).length
    canela = (p3.ponta(rig, "LeftLeg") - p3.cabeca(rig, "LeftLeg")).length
    tornoz = p3.ponta(rig, "LeftLeg")
    q0 = p3.cabeca(rig, "LeftUpLeg")
    pivo = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2

    # ── pernas por IK: tornozelos parados a ±PES_X do meio (altura e y do repouso), joelhos pra frente, pés chapados ──────────
    pernas = {}
    for lado, s in LADOS:
        tz = p3.ponta(rig, lado + "Leg")
        alvo = p3.vazio("tornozelo_" + lado, Vector((s * PES_X, tz.y, tz.z)))
        polo = p3.vazio("polo_joelho_" + lado, (s * 0.22, -1.2, 0.55))
        pernas[lado] = p3.ik(rig, lado + "Leg", alvo, polo)
        p3.travar_rotacao(rig, lado + "Foot")

    def corpo():
        """Tronco em pé; o quadril desce o que for preciso pros joelhos dobrarem JOELHO graus com os tornozelos parados."""
        PB[p3.P + "Hips"].matrix_basis = Matrix()
        p3.atualizar()
        th = math.radians(JOELHO)
        d = math.sqrt(coxa ** 2 + canela ** 2 + 2 * coxa * canela * math.cos(th))   # quadril → tornozelo
        dx, dy = q0.x - PES_X, q0.y + RECUA - tornoz.y
        desce = tornoz.z + math.sqrt(max(d ** 2 - dx ** 2 - dy ** 2, 0.01)) - q0.z
        p3.girar_osso(rig, "Hips", Matrix.Identity(3), pivo=pivo, mover=Vector((0, RECUA, desce)))
        return desce

    desce = corpo()
    for lado, _ in LADOS:
        e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
        print("polo joelho", lado, "erro %.3f ang %d" % e)

    # ── braços por IK: alvos nascem no punho de repouso (alvo = polo dá NaN) ───────────────────────────────────────────────
    punhos, polos, iks = {}, {}, {}
    for lado, _ in LADOS:
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((0, 0.6, 0)))
        iks[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos[lado])
    S = {l: p3.cabeca(rig, l + "Arm") for l, _ in LADOS}      # ombros (o tronco não mexe)
    halteres = {l: e3.halter("halter_" + l, pegada=PEGADA_H, raio=RAIO, raio_anilha=RAIO_ANILHA, larg_anilha=LARG_ANILHA)
                for l, _ in LADOS}
    olho = bpy.data.objects.get("olho_l")                         # só pro info: altura do meio do olho (malha do olho)
    olhos = (sum((olho.matrix_world @ Vector(v)).z for v in olho.bound_box) / 8 if olho is not None
             else (p3.cabeca(rig, "Head").z + p3.ponta(rig, "Head").z) / 2)

    def direcoes(th, s):
        """Braço (ombro → cotovelo), antebraço (cotovelo → punho) e palma (mundo), unitários, do lado s (+1 esquerdo) com o
        braço a `th` graus à frente da vertical. O braço sobe girando em volta do eixo x do ombro (só flexão, plano sagital),
        ABRE graus aberto; o antebraço dobra COTOVELO graus pra DOBRA (+ o giro do fim) em volta do braço; a palma fica pra trás
        embaixo (pras coxas) e pra baixo em cima, e gira pra dentro junto com o giro (o lado do polegar sobe)."""
        a, t = math.radians(ABRE), math.radians(th)
        u = Vector((s * math.sin(a), -math.cos(a) * math.sin(t), -math.cos(a) * math.cos(t)))
        n = Vector((0.0, -math.cos(t), math.sin(t)))              # ⟂ braço no plano sagital: pra frente embaixo, pra cima em cima
        m = Vector((-s, 0.0, 0.0))
        m = (m - u * m.dot(u)).normalized()                       # ⟂ braço, pro meio do corpo
        k = math.radians(giro(th))
        psi = math.radians(DOBRA) + k
        b = m * math.cos(psi) + n * math.sin(psi)                 # pra onde o antebraço dobra
        fi = math.radians(COTOVELO)
        f = (u * math.cos(fi) + b * math.sin(fi)).normalized()
        palma = -n * math.cos(k) + m * math.sin(k)
        return u, f, palma.normalized()

    def _alvos(t):
        th = p3.lerp(*ELEVA, t)
        palmas = {}
        for lado, s in LADOS:
            u, f, palmas[lado] = direcoes(th, s)
            E = S[lado] + u * Lb
            W = E + f * La
            iks[lado].mute = False
            punhos[lado].location = W
            eixo = (W - S[lado]).normalized()                     # polo do lado em que o cotovelo calculado fica
            fora = (E - S[lado]) - eixo * (E - S[lado]).dot(eixo)
            polos[lado].location = E + fora.normalized() * 0.4
        p3.atualizar()
        return palmas

    def pose(t):
        """t=0 braços quase estendidos com os halteres na frente das coxas, t=1 braços um pouco acima da horizontal."""
        palmas = _alvos(t)
        for lado, _ in LADOS:
            nomes = (lado + "Arm", lado + "ForeArm")              # congela o IK em FK pra girar o antebraço
            mats = [PB[p3.P + n].matrix.copy() for n in nomes]
            iks[lado].mute = True
            for n, M in zip(nomes, mats):
                PB[p3.P + n].matrix = M
                p3.atualizar()
            pg.mao_de_referencia(rig, lado)
            f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
            ax = (f1 - f0).normalized()
            quer = palmas[lado]
            quer = (quer - ax * quer.dot(ax)).normalized()
            tem = pg._base(rig, lado)[0]
            tem = (tem - ax * tem.dot(ax)).normalized()
            ang = math.atan2(tem.cross(quer).dot(ax), tem.dot(quer))
            p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(ang, 3, ax))
            pg.mao_de_referencia(rig, lado)
            g, _ = pg.ponto_na_mao(bon, lado, RAIO)
            eixo = pg._base(rig, lado)[1]                         # o halter fica na linha dos nós dos dedos
            h = halteres[lado]
            h.rotation_mode = "QUATERNION"
            h.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(eixo)
            h.location = g
            p3.atualizar()
            # polegar perto do quadro anterior (sem salto); t=0 recomeça do zero (checagem e captura saem iguais)
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, g, eixo, RAIO, polegar_antes=antes)

    pose.dedos = {}

    _alvos(0.5)                                                   # polo certo do cotovelo no meio do movimento
    for lado, _ in LADOS:
        e = p3.acertar_polo(rig, iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)
    print("GEOMETRIA ombro E (%.3f %.3f %.3f) | braço %.3f antebraço %.3f | quadril desce %.1f mm" % (
        *S["Left"], Lb, La, desce * 1000), flush=True)

    def pontas(lado):
        """As 2 pontas do eixo do halter do lado (mundo): a de dentro (mais perto do meio do corpo) primeiro."""
        h = halteres[lado]
        u = h.matrix_world.to_3x3() @ Vector((1, 0, 0))
        c = h.matrix_world.to_translation()
        meio = PEGADA_H / 2 + LARG_ANILHA + 0.01
        a, b = c + u * meio, c - u * meio
        return (a, b) if abs(a.x) < abs(b.x) else (b, a)

    def info():
        """Elevação e cotovelo, halter × ombro e × olhos (altura), vão entre as pontas de dentro dos 2 halteres, inclinação do
        halter (lado de dentro subindo), punho dobrado e o polegar."""
        jt = ck.medir_juntas(rig)
        j = ck.posicoes(rig)
        bf = ck.tc.braco_frente(j)
        txt = []
        for lado, _ in LADOS:
            ld = "E" if lado == "Left" else "D"
            c = halteres[lado].location
            dentro, fora = pontas(lado)
            incl = math.degrees(math.atan2(dentro.z - fora.z, (dentro - fora).xy.length))
            txt.append("%s: braço %.0f° cotovelo %.0f° punho %.0f° | halter (x %.3f y %.3f z %.3f) %+.0f mm do ombro, %+.0f mm "
                       "dos olhos | ponta de dentro %+.0f° | polegar %s" % (
                           ld, bf[0 if lado == "Left" else 1], jt["cotovelo" + ld], jt["punho" + ld], c.x, c.y, c.z,
                           (c.z - S[lado].z) * 1000, (c.z - olhos) * 1000, incl, pose.dedos.get(lado, {}).get("Thumb")))
        vao = (pontas("Left")[0] - pontas("Right")[0]).length
        return " | ".join(txt) + " | pontas de dentro dos halteres a %.0f mm | joelhos E %.0f° D %.0f°" % (
            vao * 1000, jt["joelhoE"], jt["joelhoD"])

    pegs = [(l, ck.Barra(halteres[l], raio=RAIO, meio_compr=PEGADA_H / 2)) for l, _ in LADOS]
    return Cena(pose, [halteres["Left"], halteres["Right"]], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.2, 1.0),
                camera_video=((3.4, -2.6, 1.3), (0, -0.25, 1.0), 50), info=info)
