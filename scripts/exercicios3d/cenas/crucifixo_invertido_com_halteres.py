# Crucifixo Invertido com Halteres — cena da fábrica 3D (lote 3, 06/10/2026).
# t = 0 braços pendurados pro chão, perpendiculares ao tronco, halteres com pegada neutra (palmas uma pra outra) ·
# t = 1 braços abertos pros lados até os cotovelos ficarem na altura dos ombros e bem do lado deles, escápulas
# aproximadas. Em pé, pés na largura do quadril, joelhos levemente dobrados e o tronco inclinado à frente quase paralelo
# ao chão, dobrando no quadril com as costas retas (coluna neutra) e a cabeça na linha da coluna, olhando pro chão;
# tronco e pernas não mexem (ExRx — Dumbbell Rear Lateral Raise; NSCA PTQ 8.4 e 9.4).
# O braço inteiro gira como uma peça só em volta do eixo do tronco (abdução horizontal pura, no plano perpendicular ao
# tronco, sem girar o úmero — ExRx: "Dumbbells are raised by shoulder transverse abduction, not external rotation, nor
# extension"): cotovelo levemente dobrado e PARADO, dobrando pra dentro do arco e um pouco pra cabeça — embaixo os
# halteres ficam por dentro dos cotovelos (perto um do outro, sem encostar), em cima o punho fica abaixo do cotovelo
# (ExRx: "Maintain height of elbows above wrists by raising "pinkie finger" side up"); a palma olha pra dentro do arco
# (uma pra outra embaixo, pro chão em cima) e, perto do fim, vira um pouco pros pés: o lado do dedo mínimo sobe.
import math
from mathutils import Vector, Matrix
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from cena import Cena

INCLINA = 80          # tronco, graus da vertical: quase paralelo ao chão (ExRx: "close to horizontal"; "Positioning
                      # torso at 45° is not sufficient angle to target rear deltoids")
JOELHO = 20           # flexão dos joelhos (graus), parada: "Bend knees" (ExRx), "slight bend in the knees" (NSCA)
RECUA = 0.23          # quadril pra trás (m): o centro de massa fica em cima do meio do pé (medido na exploração)
PES_X = 0.14          # tornozelos a ±PES_X do meio (m): pés na largura do quadril (NSCA PTQ 8.4: "feet hip-width
                      # apart"); o repouso do boneco deixa os tornozelos a ±0,195 m, na largura dos ombros
PESCOCO = 0           # extensão do pescoço (graus): 0 = cabeça na linha do tronco, olhando pro chão (NSCA PTQ 9.4)
COTOVELO = 20         # flexão do cotovelo (graus), a mesma do começo ao fim (ExRx: "fixed elbow position (10° to 30°)")
DOBRA = 55            # pra onde o antebraço dobra (graus): 0 = pra cabeça (frente), 90 = pra dentro do arco (embaixo
                      # pro meio do corpo, em cima pro chão: o punho fica abaixo do cotovelo)
MINIMO = 20           # em cima a palma vira esse tanto pros pés (graus, aos poucos): o lado do dedo mínimo sobe
ABRE = (0, 90)        # abdução horizontal (graus, no plano ⟂ tronco): 0 = braço apontando pro chão, 90 = pro lado
ESCAPULA = (3, -8)    # giro da escápula em volta do eixo do tronco (graus): + protração → − retração (aproxima)
RAIO = 0.0145         # pegada do halter: 29 mm, o cilindro da mão de referência
PEGADA_H = 0.13       # comprimento da pegada do halter (entre as anilhas)
RAIO_ANILHA = 0.055
LADOS = (("Left", 1), ("Right", -1))


def montar(bon):
    rig = bon.rig
    PB = rig.pose.bones
    pg.usar_polegar("volta")                       # polegar dando a volta no halter (jeito novo, lote 3)
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length       # braço
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length      # antebraço
    coxa = (p3.cabeca(rig, "LeftLeg") - p3.cabeca(rig, "LeftUpLeg")).length
    canela = (p3.ponta(rig, "LeftLeg") - p3.cabeca(rig, "LeftLeg")).length
    tornoz = p3.ponta(rig, "LeftLeg")
    q0 = p3.cabeca(rig, "LeftUpLeg")
    pivo = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2

    # ── pernas por IK: tornozelos parados a ±PES_X do meio (altura e y do repouso), joelhos pra frente, pés chapados ─
    pernas = {}
    for lado, s in LADOS:
        tz = p3.ponta(rig, lado + "Leg")
        alvo = p3.vazio("tornozelo_" + lado, Vector((s * PES_X, tz.y, tz.z)) if PES_X else tz)
        polo = p3.vazio("polo_joelho_" + lado, (s * 0.25, -1.2, 0.55))
        pernas[lado] = p3.ik(rig, lado + "Leg", alvo, polo)
        p3.travar_rotacao(rig, lado + "Foot")

    # ── braços por IK: alvos nascem no punho de repouso (alvo = polo dá NaN) ────────────────────────────────────────
    punhos, polos, iks = {}, {}, {}
    for lado, _ in LADOS:
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((0, 0.6, 0)))
        iks[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos[lado])
    halteres = {l: e3.halter("halter_" + l, pegada=PEGADA_H, raio=RAIO, raio_anilha=RAIO_ANILHA) for l, _ in LADOS}

    def corpo():
        """Tronco inclinado INCLINA graus em volta das articulações do quadril, que vão RECUA pra trás e descem o que
        for preciso pros joelhos dobrarem JOELHO graus com os tornozelos parados (a conta do terra romeno)."""
        for n in ("Hips", "Neck", "Head", "LeftShoulder", "RightShoulder"):
            PB[p3.P + n].matrix_basis = Matrix()
        p3.atualizar()
        th = math.radians(JOELHO)
        d = math.sqrt(coxa ** 2 + canela ** 2 + 2 * coxa * canela * math.cos(th))   # quadril → tornozelo
        dx, dy = q0.x - (PES_X or tornoz.x), q0.y + RECUA - tornoz.y
        desce = tornoz.z + math.sqrt(max(d ** 2 - dx ** 2 - dy ** 2, 0.01)) - q0.z
        p3.girar_osso(rig, "Hips", p3.rot_x(INCLINA), pivo=pivo, mover=Vector((0, RECUA, desce)))
        if PESCOCO:
            p3.girar_osso(rig, "Neck", p3.rot_x(-PESCOCO))

    def eixos():
        """Referencial do tórax (preso nele: as escápulas não mexem nos eixos) — cima, lado (esq. → dir.), frente."""
        cima = (p3.cabeca(rig, "Neck") - p3.cabeca(rig, "Hips")).normalized()
        lado = p3.cabeca(rig, "RightShoulder") - p3.cabeca(rig, "LeftShoulder")
        lado = (lado - cima * lado.dot(cima)).normalized()
        return cima, lado, cima.cross(lado)

    def escapulas(t):
        """As duas escápulas giram juntas em volta do eixo do tronco: + protração (afastam), − retração (aproximam)."""
        g = p3.lerp(*ESCAPULA, t)
        if not g:
            return
        cima = eixos()[0]
        for lado, s in LADOS:
            p3.girar_osso(rig, lado + "Shoulder", Matrix.Rotation(math.radians(-s * g), 3, cima))

    def direcoes(th, s, ax):
        """Braço, antebraço e palma (mundo) do lado s com a abdução horizontal th (graus). O braço todo é uma peça só
        girando em volta do eixo do tronco (abdução horizontal pura, sem girar o úmero): o braço anda no plano ⟂ ao
        tronco; o antebraço dobra COTOVELO graus pra cabeça e pra dentro do arco (DOBRA); a palma olha pra dentro do
        arco — embaixo uma pra outra (pegada neutra), em cima pro chão (+ MINIMO pros pés)."""
        cima, lado, frente = ax
        fora = -s * lado
        frac = (th - ABRE[0]) / (ABRE[1] - ABRE[0])
        a, psi, fi = math.radians(th), math.radians(DOBRA), math.radians(COTOVELO)
        u = frente * math.cos(a) + fora * math.sin(a)
        fecha = frente * math.sin(a) - fora * math.cos(a)        # pra onde o braço anda fechando
        d = cima * math.cos(psi) + fecha * math.sin(psi)
        ante = u * math.cos(fi) + d * math.sin(fi)
        k = math.radians(MINIMO * frac)
        palma = fecha * math.cos(k) - cima * math.sin(k)
        palma = (palma - ante * palma.dot(ante)).normalized()
        return u, ante, palma

    def _alvos(t):
        corpo()
        ax = eixos()
        escapulas(t)
        th = p3.lerp(*ABRE, t)
        palmas = {}
        for lado, s in LADOS:
            S = p3.cabeca(rig, lado + "Arm")
            u, ante, palmas[lado] = direcoes(th, s, ax)
            E = S + u * Lb
            W = E + ante * La
            iks[lado].mute = False
            punhos[lado].location = W
            eixo = (W - S).normalized()                # polo do lado em que o cotovelo calculado fica
            fora = (E - S) - eixo * (E - S).dot(eixo)
            polos[lado].location = E + fora.normalized() * 0.4
        p3.atualizar()
        return palmas

    def pose(t):
        """t=0 braços pendurados pro chão, t=1 braços abertos com os cotovelos na altura dos ombros."""
        palmas = _alvos(t)
        for lado, _ in LADOS:
            nomes = (lado + "Arm", lado + "ForeArm")       # congela o IK em FK pra girar o antebraço
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
            eixo = pg._base(rig, lado)[1]                  # o halter fica na linha dos nós dos dedos
            h = halteres[lado]
            h.rotation_mode = "QUATERNION"
            h.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(eixo)
            h.location = g
            p3.atualizar()
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, g, eixo, RAIO, polegar_antes=antes)

    pose.dedos = {}

    corpo()
    for lado, _ in LADOS:
        e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
        print("polo joelho", lado, "erro %.3f ang %d" % e)
    _alvos(0.5)                                        # polo certo do cotovelo no meio do movimento
    for lado, _ in LADOS:
        e = p3.acertar_polo(rig, iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)

    def info():
        """Cotovelo × ombro e punho × cotovelo (altura), punho dobrado, distância entre os halteres e o polegar."""
        jt = ck.medir_juntas(rig)
        txt = []
        for lado, _ in LADOS:
            S, E = p3.cabeca(rig, lado + "Arm"), p3.cabeca(rig, lado + "ForeArm")
            W = p3.cabeca(rig, lado + "Hand")
            ld = "E" if lado == "Left" else "D"
            txt.append("%s: cotovelo %+.0f mm acima do ombro, punho %+.0f mm abaixo do cotovelo, punho dobrado %.0f°" % (
                ld, (E.z - S.z) * 1000, (E.z - W.z) * 1000, jt["punho" + ld]))
        gl, gr = halteres["Left"].location, halteres["Right"].location
        polegar = " ".join("%s %s" % ("E" if l == "Left" else "D", pose.dedos.get(l, {}).get("Thumb")) for l, _ in LADOS)
        return " | ".join(txt) + " | halteres a %.0f mm (eixo a eixo) | polegar %s" % ((gl - gr).length * 1000, polegar)

    pegs = [(l, ck.Barra(halteres[l], raio=RAIO, meio_compr=PEGADA_H / 2)) for l, _ in LADOS]
    return Cena(pose, [halteres["Left"], halteres["Right"]], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.2, 0.8),
                camera_video=((2.6, -3.4, 1.5), (0, -0.25, 0.75), 50), info=info)
