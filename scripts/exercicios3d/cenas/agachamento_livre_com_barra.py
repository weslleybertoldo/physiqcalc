# Agachamento Livre com Barra — cena da fábrica 3D. Movimento aprovado pelo Weslley em 04/10/2026
# ("Sim, agachamento ficou bom"). t = 0 em pé · t = 1 embaixo (coxa paralela ao chão).
import math
from mathutils import Vector, Matrix
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from cena import Cena

RAIO_BARRA = 0.0145
GRIP_X = 0.43                                     # meia pegada (do meio da barra ao meio da mão)


def montar(bon):
    rig = bon.rig
    # ── pernas: tornozelos fixos, joelhos apontando pra frente e um pouco pra fora ──────────────────
    pernas = {}
    for lado, s in (("Left", 1), ("Right", -1)):
        tornozelo = p3.ponta(rig, lado + "Leg")
        alvo = p3.vazio("tornozelo_" + lado, tornozelo)
        polo = p3.vazio("polo_joelho_" + lado, (s * 0.32, -1.2, 0.55))
        c = p3.ik(rig, lado + "Leg", alvo, polo)
        p3.travar_rotacao(rig, lado + "Foot")
        pernas[lado] = c

    # ── barra nas costas + braços por IK ─────────────────────────────────────────────────────────────
    barra = e3.barra("barra", comprimento=2.0, raio_anilha=0.2, pegada=1.32)
    bracos = {}
    punhos = {}
    polos_cot = {}
    for lado, s in (("Left", 1), ("Right", -1)):
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos_cot[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((0, 0.5, 0)))
        bracos[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos_cot[lado])

    PB = rig.pose.bones
    PALMA = (p3.cabeca(rig, "LeftHandMiddle1") - p3.cabeca(rig, "LeftHand")).length

    # mão (03/10 23:30, pedido dele: "a mão não está pegando no peso… sempre valide"): dedos nos ângulos da mão real
    # (pg.ANGULOS_REF) e o VÃO dessa mão (pg.ponto_na_mao), guardado no espaço do osso da mão, é levado até a barra:
    # o punho anda até o vão cair no eixo da barra; o antebraço gira pra palma ficar de frente pra barra.
    furo = {}
    for lado in ("Left", "Right"):
        pg.mao_de_referencia(rig, lado)
        g, _ = pg.ponto_na_mao(bon, lado, RAIO_BARRA)
        furo[lado] = p3.mundo_osso(rig, lado + "Hand").inverted() @ g


    def _bracos(R, centro):
        """Põe as mãos na barra: IK → congela em FK → gira o antebraço (palma pra barra) → corrige o punho."""
        eixo = (R @ Vector((1, 0, 0))).normalized()
        for lado, s in (("Left", 1), ("Right", -1)):
            g = centro + eixo * (s * GRIP_X)
            alvo = g + R @ Vector((0, 0.012, -PALMA * 0.92))
            for _ in range(4):
                bracos[lado].mute = False
                punhos[lado].location = alvo
                p3.atualizar()
                nomes = (lado + "Arm", lado + "ForeArm")
                mats = [PB[p3.P + n].matrix.copy() for n in nomes]
                bracos[lado].mute = True
                for n, M in zip(nomes, mats):
                    PB[p3.P + n].matrix = M
                    p3.atualizar()
                # mão no agachamento: atrás da barra, dedos pra cima, palma de frente e linha dos nós ao longo da barra
                # (03/10 00:55: a versão anterior deixava o punho dobrado 150° — mão virada pra baixo)
                dedos_q = R @ Vector((0, 0.12, 1)).normalized()
                palma_q = R @ Vector((0, -1, 0.12)).normalized()
                palma_q = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
                f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
                ax = (f1 - f0).normalized()                   # 1) antebraço gira pra palma ir pra frente
                quer = palma_q - ax * palma_q.dot(ax)
                tem = pg._base(rig, lado)[0]
                tem = tem - ax * tem.dot(ax)
                if quer.length > 1e-6 and tem.length > 1e-6:
                    quer.normalize()
                    tem.normalize()
                    ang = math.atan2(tem.cross(quer).dot(ax), tem.dot(quer))
                    p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(ang, 3, ax))
                h0 = p3.cabeca(rig, lado + "Hand")            # 2) o resto (só o que sobrar) vai no punho
                y_m = (p3.ponta(rig, lado + "Hand") - h0).normalized()
                n_m = pg._base(rig, lado)[0]
                n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
                F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
                F_quer = Matrix((dedos_q, palma_q, dedos_q.cross(palma_q))).transposed()
                p3.girar_osso(rig, lado + "Hand", F_quer @ F_tem.transposed())
                erro = g - p3.mundo_osso(rig, lado + "Hand") @ furo[lado]
                alvo = alvo + erro
                if erro.length < 0.002:
                    break
            _bracos.erro[lado] = erro.length
            fa = p3.ponta(rig, lado + "ForeArm") - p3.cabeca(rig, lado + "ForeArm")
            mo = p3.ponta(rig, lado + "Hand") - p3.cabeca(rig, lado + "Hand")
            _bracos.punho[lado] = math.degrees(fa.angle(mo))


    _bracos.erro = {}
    _bracos.punho = {}


    def pose(t):
        """t=0 em pé, t=1 embaixo (coxa paralela)."""
        for n in ("Hips", "Neck", "Head"):
            PB[p3.P + n].matrix_basis = Matrix()
        p3.atualizar()
        inclina = p3.lerp(0, 40, t)              # tronco à frente (graus)
        desce = p3.lerp(0, -0.45, t)             # quadril desce (m)
        recua = p3.lerp(0, 0.20, t)              # quadril vai pra trás (m)
        p3.girar_osso(rig, "Hips", p3.rot_x(inclina), mover=Vector((0, recua, desce)))
        R = p3.rot_x(inclina)
        pesc = p3.cabeca(rig, "Neck")
        centro = pesc + R @ Vector((0, 0.075, -0.039))   # apoiada no trapézio (zona da ficha: 0–5 mm)
        barra.location = centro
        barra.rotation_mode = "XYZ"
        barra.rotation_euler = R.to_euler()
        for lado, s in (("Left", 1), ("Right", -1)):
            ombro = p3.cabeca(rig, lado + "Arm")
            polos_cot[lado].location = ombro + R @ Vector((s * 0.30, 0.35, -0.40))
            pg.mao_de_referencia(rig, lado)
        p3.atualizar()
        p3.girar_osso(rig, "Neck", p3.rot_x(-inclina * 0.75))
        _bracos(R, centro)
        eixo = (R @ Vector((1, 0, 0))).normalized()
        for lado in ("Left", "Right"):               # dedos e polegar: ajuste fino até a pele encostar na barra
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, centro, eixo, RAIO_BARRA)


    pose.dedos = {}


    # polos certos (joelho na pose de baixo, cotovelo no meio)
    pose(1.0)
    for lado in ("Left", "Right"):
        e = p3.acertar_polo(rig, pernas[lado], "LeftLeg".replace("Left", lado), lado + "UpLeg", lado + "Foot")
        print("polo joelho", lado, "erro %.3f ang %d" % e)
        bracos[lado].mute = False
        e = p3.acertar_polo(rig, bracos[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)

    def info():
        return "punho dobrado E %.0f° D %.0f° | vão da mão E %.1f D %.1f mm" % (
            _bracos.punho["Left"], _bracos.punho["Right"], _bracos.erro["Left"] * 1000, _bracos.erro["Right"] * 1000)

    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=1.0)
    return Cena(pose, [barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=4.0, foco_luz=(0, 0.05, 0.75),
                camera_video=((4.0, -2.83, 1.16), (0, 0.10, 0.86), 50), info=info)
