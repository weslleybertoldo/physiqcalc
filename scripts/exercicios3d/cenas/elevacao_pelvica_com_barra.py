# Elevação Pélvica com Barra — cena da fábrica 3D (lote 1, 04/10/2026).
# t = 0 quadril embaixo, glúteo perto do chão · t = 1 quadril estendido: tronco e coxas alinhados e paralelos ao
# chão, joelho a ~90° com a canela vertical (Contreras 2011). Parte de cima das costas (logo abaixo das escápulas)
# apoiada na borda de um banco de ~40 cm (Contreras 2015), atravessado atrás do corpo; pés no chão na largura dos
# ombros, barra na dobra do quadril, mãos na barra por fora do quadril, cabeça na linha do tronco.
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import deitado3d as dt
from maos3d import Maos
from cena import Cena

RAIO_BARRA = 0.0145
TOPO = 0.40                    # banco de ~40 cm ("approximately 16 inches high", Contreras 2015)
BORDA_Y = 0.0                  # borda da frente do banco atravessado (o estofado vai de y 0 a 0,30)
NA_BORDA = 0.012               # o apoio das costas fica 12 mm atrás da quina (chanfrada: na quina a pele não encostava)
AFUNDA = 0.006                 # pele das costas dentro do estofado na borda
PE_X = 0.19                    # tornozelos na largura dos ombros
GLUTEO_CHAO = 0.05             # embaixo: glúteo ~5 cm acima do chão
APOIO_MM = 4.0                 # barra apoiada no quadril: encostar pode, a pele ceder até 4 mm também
ENCOSTA = -0.0015              # barra → pele do quadril (m): apoiada, cedendo 1,5 mm
GRIP_X = 0.27                  # meia pegada: mãos na barra por fora do quadril
PELE_BARRA = ("Hips", "Spine", "Spine1", "Spine2", "LeftUpLeg", "RightUpLeg")   # onde a barra pode encostar


def montar(bon):
    rig = bon.rig
    PB = rig.pose.bones
    banco = e3.banco("banco", -0.6, 0.6, topo=TOPO)       # atravessado: gira 90° e a borda da frente fica em BORDA_Y
    banco.rotation_euler = (0, 0, math.radians(90))
    banco.location = (0, BORDA_Y + 0.15, 0)
    barra = e3.barra("barra", comprimento=2.0, raio_anilha=0.2, pegada=1.32)
    maos = Maos(bon, RAIO_BARRA)
    tornozelo_z = p3.ponta(rig, "LeftLeg").z                   # altura do tornozelo em pé (pé chapado)
    coxa = (p3.cabeca(rig, "LeftLeg") - p3.cabeca(rig, "LeftUpLeg")).length
    canela = (p3.ponta(rig, "LeftLeg") - p3.cabeca(rig, "LeftLeg")).length
    p3.atualizar()

    def eixos():
        cima, lado = dt.eixos_tronco(rig)
        return cima, cima.cross(lado)                          # frente = pro peito

    def colocar(th):
        """Tronco `th` graus acima da horizontal (quadril embaixo, cabeça pro banco) com a parte de cima das costas
        (meio das escápulas, "slightly lower than the low-bar position") na borda do banco, AFUNDA m dentro do estofado; o
        resto das costas em cima do banco não afunda mais que isso. Cabeça na linha do tronco: se a nuca entrar
        no estofado, encolhe o queixo até sair."""
        for n in ("Hips", "Neck", "Head"):
            PB[p3.P + n].matrix_basis = Matrix()
        p3.atualizar()
        pivo = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
        p3.girar_osso(rig, "Hips", p3.rot_x(-(90 - th)), pivo=pivo)
        for _ in range(3):
            cima, frente = eixos()
            costas = dt.malha(bon, ("Spine1", "Spine2"))
            s2, pe = p3.cabeca(rig, "Spine2"), p3.cabeca(rig, "Neck")
            u = (costas - np.array(s2 + (pe - s2) * 0.45)) @ np.array(cima)   # meio das escápulas (~T4–T5)
            faixa = costas[np.abs(u) < 0.015]
            b = faixa[np.argmin(faixa @ np.array(frente))]       # pele mais de trás nessa altura
            dy, dz = BORDA_Y + NA_BORDA - b[1], TOPO - AFUNDA - b[2]
            # em cima (tronco deitado) o resto das costas fica em cima do estofado: não afunda mais que AFUNDA
            # (só a pele na altura do estofado conta; embaixo a lombar fica na frente da borda)
            p = costas + np.array((0.0, dy, dz))
            sobre = p[(p[:, 1] >= BORDA_Y + 0.015) & (p[:, 2] >= TOPO - 0.06)]   # depois do chanfro da quina
            if len(sobre):
                dz += max(0.0, TOPO - AFUNDA - float(sobre[:, 2].min()))
            p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, dy, dz)))
        pescoco = 0
        while pescoco < 30:
            cab = dt.malha(bon, ("Head",))
            cab = cab[(cab[:, 1] >= BORDA_Y) & (cab[:, 1] <= BORDA_Y + 0.30)]
            if not len(cab) or cab[:, 2].min() >= TOPO + 0.003:
                break
            p3.girar_osso(rig, "Neck", p3.rot_x(1))
            pescoco += 1
        colocar.pescoco = pescoco

    # ── pés: em cima (tronco na horizontal) o joelho fica em cima do tornozelo, canela vertical ───────────────
    colocar(0)
    pernas = {}
    for lado, s in dt.LADOS:
        q = p3.cabeca(rig, lado + "UpLeg")
        kz = tornozelo_z + canela
        ky = q.y - math.sqrt(max(coxa ** 2 - (kz - q.z) ** 2 - (s * PE_X - q.x) ** 2, 0.01))
        tz = Vector((s * PE_X, ky, tornozelo_z))
        alvo = p3.vazio("tornozelo_" + lado, tz)
        d = tz - q
        cima = Vector((0, -d.z, d.y)).normalized()
        if cima.z < 0:
            cima.negate()
        polo = p3.vazio("polo_joelho_" + lado, (q + tz) / 2 + cima * 0.6 + Vector((s * 0.04, 0, 0)))
        pernas[lado] = p3.ik(rig, lado + "Leg", alvo, polo)
        p3.travar_rotacao(rig, lado + "Foot")
    p3.atualizar()
    for lado, _ in dt.LADOS:
        e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
        print("polo joelho", lado, "erro %.3f ang %d" % e)

    # ── embaixo: o tronco desce em volta da borda até o glúteo ficar GLUTEO_CHAO acima do chão ──────────────
    th0, antes, tabela = None, None, []
    for th in range(0, 86, 5):
        colocar(th)
        gz = float(dt.malha(bon, ("Hips",))[:, 2].min())
        tabela.append("%d°:%.3f" % (th, gz))
        if gz <= GLUTEO_CHAO:
            th0 = th - 5 * (GLUTEO_CHAO - gz) / (antes - gz) if antes is not None and antes > gz else th
            break
        antes = gz
    print("glúteo × tronco:", " ".join(tabela))
    if th0 is None:
        raise RuntimeError("o glúteo não chegou perto do chão até 85°")
    print("ELEVAÇÃO PÉLVICA tronco de %.1f° (embaixo) a 0° (em cima) da horizontal | tornozelos y %.3f | "
          "coxa %.3f canela %.3f" % (th0, pernas["Left"].target.location.y, coxa, canela))

    def barra_no_quadril():
        """Barra na dobra do quadril como ela fica com o peso: desce de cima até a pele (abdômen, quadril e coxas)
        e, numa janela de ±6 cm em volta da articulação do quadril (ao longo do chão), fica no ponto mais baixo — o
        vão entre o abdômen e as coxas ("crease of the hips", Contreras 2011). Vindo pela frente do tronco, com o
        quadril dobrado embaixo ela parava nos joelhos (checagem de 04/10/2026)."""
        pivo = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
        co = dt.malha(bon, PELE_BARRA)
        co = co[np.abs(co[:, 0]) < GRIP_X - 0.05]
        r = RAIO_BARRA + ENCOSTA
        melhor = None
        for mm in range(-60, 61, 2):
            y = pivo.y + mm / 1000
            perto = co[np.abs(co[:, 1] - y) < r]
            if not len(perto):
                continue
            z = float(np.max(perto[:, 2] + np.sqrt(np.maximum(r * r - (perto[:, 1] - y) ** 2, 0.0))))
            if melhor is None or z < melhor[1]:
                melhor = (y, z)
        return Vector((0, melhor[0], melhor[1]))

    def pose(t):
        """t=0 quadril embaixo, t=1 quadril estendido (tronco e coxas na horizontal)."""
        colocar(p3.lerp(th0, 0.0, t))
        centro = barra_no_quadril()
        barra.location = centro
        p3.atualizar()
        cima, frente = eixos()
        for lado, s in dt.LADOS:                  # pegada pronada por cima da barra, dedos pros pés
            S = p3.cabeca(rig, lado + "Arm")
            polo = S + Vector((s * 0.4, 0, 0)) + frente * 0.1 - cima * 0.3     # cotovelo pra fora, longe do banco
            # vão da mão 4 mm pra cima do eixo: com a palma em cima da barra ela atravessava a mão 5–7 mm
            maos.segurar(lado, centro + Vector((s * GRIP_X, 0, 0)) + frente * 0.004, -cima, -frente, polo=polo,
                         alinhar=0.6)
        for lado, _ in dt.LADOS:                  # dedos e polegar fecham até a pele encostar na barra
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, centro, Vector((1, 0, 0)), RAIO_BARRA,
                                                  polegar_antes=antes)

    pose.dedos = {}

    pose(0.5)                                    # polos certos no meio do movimento
    for lado, _ in dt.LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)
    for t in (0.0, 1.0):
        pose(t)
        print("t=%g | barra z %.3f (anilha %.0f mm do chão) | glúteo z %.3f | pescoço encolhido %d°"
              % (t, barra.location.z, (barra.location.z - 0.2) * 1000,
                 float(dt.malha(bon, ("Hips",))[:, 2].min()), colocar.pescoco))

    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=1.0)
    return Cena(pose, [barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=APOIO_MM, foco_luz=(0, -0.3, 0.4),
                camera_video=((3.6, -2.4, 1.1), (0, -0.3, 0.35), 50), info=maos.info, apoios=[banco],
                afunda_apoio_mm=20)
