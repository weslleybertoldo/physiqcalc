# Encolhimento com Halteres — cena da fábrica 3D (lote 2, 04/10/2026).
# t = 0 ombros relaxados embaixo, braços estendidos ao lado do corpo · t = 1 ombros encolhidos (subindo em direção às
# orelhas). Só a cintura escapular sobe: o osso Shoulder do Mixamo (clavícula + escápula) gira em volta do eixo
# frente-trás, na base do pescoço (articulação esternoclavicular), e o ombro sobe reto: nem pro lado, nem pra frente,
# nem pra trás (o ombro não rola).
# Braços pendurados e estendidos, pegada neutra (palmas pro corpo), halteres ao lado das coxas, tronco e cabeça parados.
# Igual à rosca martelo (cena aprovada) com o antebraço parado: braço e antebraço calculados a partir do ombro já
# elevado, mão de referência e o halter no vão da mão.
import math
from mathutils import Vector, Matrix
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from cena import Cena

ELEVA = (0, 25)      # elevação da clavícula, graus: repouso → encolhido. Peeters et al. 2022 (JSES Int 7(1):147-152):
                     # o encolhimento eleva a clavícula 25° (DP 5°) no esternoclavicular; no boneco, 25° deixam a linha
                     # do ombro (base do pescoço → ombro) na horizontal, o critério de amplitude do ExRx
ALFA = 2             # braço (ombro → cotovelo) à frente da vertical, graus: pendurado ao lado do corpo
TETA = 8             # antebraço (cotovelo → punho) à frente da vertical, graus: cotovelo estendido (ACE: "elbows fully
                     # extended"; os ~5° que sobram são o cotovelo solto, sem travar)
LARG_COT = 0.05      # cotovelo um pouco pra fora do ombro (braço ~11° aberto): o halter fica ao lado da coxa sem
                     # encostar (com 0,025 a anilha entrava 13 mm na coxa; com 0,04 o braço encostava 4 mm no dorsal
                     # com o ombro em cima)
FORA_PUNHO = 0.045   # punho um pouco pra fora do cotovelo (ângulo de carregamento ~10°): o halter passa por fora da coxa
RAIO = 0.0145        # pegada do halter: 29 mm, o cilindro da mão de referência (igual à rosca martelo)
PEGADA_H = 0.13      # comprimento da pegada do halter (entre as anilhas)
EIXO_ELEVA = Vector((0, 1, 0))   # frente-trás do corpo (o boneco olha pra −Y): girar aqui só sobe/desce o ombro


def montar(bon):
    rig = bon.rig
    PB = rig.pose.bones
    for lado in ("Left", "Right"):                     # pés chapados (a pose de repouso já é em pé)
        p3.travar_rotacao(rig, lado + "Foot")
    punhos, polos, iks = {}, {}, {}
    for lado in ("Left", "Right"):                     # alvos nascem no punho de repouso (alvo = polo dá NaN)
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((0, 0.6, 0)))
        iks[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos[lado])
    braco = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length
    antebraco = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length
    ombro0 = {l: p3.cabeca(rig, l + "Arm") for l in ("Left", "Right")}       # articulação do ombro no repouso
    halteres = {l: e3.halter("halter_" + l, pegada=PEGADA_H, raio=RAIO, raio_anilha=0.055) for l in ("Left", "Right")}

    def _ombros(t):
        """Escápula sobe ELEVA graus em volta do eixo frente-trás e o ombro sobe RETO, sem abrir pro lado: o osso do
        boneco vai da base do pescoço ao centro da articulação (caído 26°), então só girar levava o ombro 15 mm pra
        fora; na clavícula de verdade (quase horizontal) o acrômio sobe e chega um pouco pra dentro. O que sobra de
        lado vira deslize da base do osso (até 15 mm, pele com peso ≤ 0,2 nesse osso)."""
        g = p3.lerp(*ELEVA, t)
        for lado in ("Left", "Right"):
            PB[p3.P + lado + "Shoulder"].matrix_basis = Matrix.Identity(4)
        p3.atualizar()
        for lado, s in (("Left", 1), ("Right", -1)):
            if g:
                R = Matrix.Rotation(math.radians(-s * g), 3, EIXO_ELEVA)
                H = p3.cabeca(rig, lado + "Shoulder")
                girado = H + R @ (ombro0[lado] - H)
                p3.girar_osso(rig, lado + "Shoulder", R, mover=Vector((ombro0[lado].x - girado.x, 0, 0)))

    def _alvos(t):
        _ombros(t)
        alfa, teta = math.radians(ALFA), math.radians(TETA)
        for lado, s in (("Left", 1), ("Right", -1)):
            S = p3.cabeca(rig, lado + "Arm")             # ombro já elevado: o braço pendura a partir dele
            E = S + Vector((s * LARG_COT, -math.sin(alfa) * braco, -math.cos(alfa) * braco)).normalized() * braco
            dx = s * FORA_PUNHO
            rho = math.sqrt(antebraco ** 2 - dx ** 2)
            W = E + Vector((dx, -math.sin(teta) * rho, -math.cos(teta) * rho))
            iks[lado].mute = False
            punhos[lado].location = W
            eixo = (W - S).normalized()                # polo do lado em que o cotovelo calculado fica (igual à
            fora = (E - S) - eixo * (E - S).dot(eixo)  # rosca martelo)
            polos[lado].location = E + fora.normalized() * 0.4
        p3.atualizar()

    def pose(t):
        """t=0 ombros relaxados embaixo, t=1 ombros encolhidos."""
        _alvos(t)
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

    def info():
        txt = []
        for lado, L in (("Left", "E"), ("Right", "D")):
            S = p3.cabeca(rig, lado + "Arm")
            d = S - p3.cabeca(rig, lado + "Shoulder")
            txt.append("ombro %s sobe %+.0f mm (frente %+.0f mm), linha do ombro %.0f° abaixo da horizontal" % (
                L, (S.z - ombro0[lado].z) * 1000, -(S.y - ombro0[lado].y) * 1000,
                math.degrees(math.atan2(-d.z, math.hypot(d.x, d.y)))))
        return " | ".join(txt)

    _alvos(0.5)                                        # polo certo do cotovelo no meio do movimento
    for lado in ("Left", "Right"):
        e = p3.acertar_polo(rig, iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)

    pegs = [(l, ck.Barra(halteres[l], raio=RAIO, meio_compr=PEGADA_H / 2)) for l in ("Left", "Right")]
    return Cena(pose, [halteres["Left"], halteres["Right"]], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, 0, 1.15),
                camera_video=((2.3, 3.7, 1.6), (0, 0, 1.15), 50), info=info)
