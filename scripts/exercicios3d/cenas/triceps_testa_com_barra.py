# Tríceps Testa com Barra — cena da fábrica 3D (lote 2, 04/10/2026).
# t = 0 braços estendidos na vertical, barra em cima dos ombros · t = 1 cotovelos dobrados, barra logo acima da testa,
# sem encostar. Deitado de costas no banco reto (cabeça, costas e glúteo no estofado), pés chapados no chão, pegada
# pronada fechada (palmas pros pés, polegar em volta da barra), mãos um pouco por dentro da largura dos ombros.
# O braço fica PARADO na vertical (cotovelo em cima do ombro, apontando pro teto, sem abrir) e só o cotovelo dobra;
# punho reto (neutro) o movimento todo: a mão gira junto com o antebraço.
import math
import numpy as np
from mathutils import Matrix, Vector
import bpy
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import deitado3d as dt
from maos3d import Maos
from cena import Cena

RAIO_BARRA = 0.0145
COMPR_BARRA = 1.25             # barra reta curta (a mesma da rosca direta), anilhas pequenas
TOPO = 0.44                    # altura do estofado (m)
BANCO_Y = (-0.28, 0.92)        # pé e cabeceira do banco
COTOVELO_CIMA = 5              # flexão do cotovelo em cima (estendido, sem travar)
PEGADA = 0.90                  # distância entre os vãos das mãos ÷ entre as articulações dos ombros
FOLGA_TESTA = 0.030            # embaixo: barra (superfície) → pele ou cabelo mais perto da cabeça (m)
CIMA = Vector((0, 0, 1))


def _cabeca_pontos(bon):
    """Pele da cabeça e do pescoço + cabelo, sobrancelhas e olhos (a cabeça não mexe no exercício): N×3."""
    pts = [dt.malha(bon, ("Head", "Neck"))]
    dg = bpy.context.evaluated_depsgraph_get()
    for o in bpy.data.objects:
        if o.type == "MESH" and o is not bon.corpo and o.parent is not None and not o.name.startswith(("banco", "barra")):
            me = o.evaluated_get(dg).to_mesh()
            co = np.empty(len(me.vertices) * 3)
            me.vertices.foreach_get("co", co)
            M = np.array(o.matrix_world)
            pts.append(co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3])
            o.evaluated_get(dg).to_mesh_clear()
    return np.concatenate(pts)


def montar(bon):
    rig = bon.rig
    dt.deitar(bon, TOPO)
    banco = e3.banco("banco", *BANCO_Y, topo=TOPO)
    cabeca = _cabeca_pontos(bon)
    barra = e3.barra("barra", comprimento=COMPR_BARRA, raio_anilha=0.14, larg_anilha=0.035, pegada=0.95)
    maos = Maos(bon, RAIO_BARRA)
    S = {l: p3.cabeca(rig, l + "Arm") for l, _ in dt.LADOS}
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length       # braço
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length      # antebraço
    E = {l: S[l] + CIMA * Lb for l, _ in dt.LADOS}       # cotovelo em cima do ombro, parado o movimento todo
    meia = PEGADA * (S["Left"] - S["Right"]).length / 2  # meia distância entre os vãos das mãos (ao longo da barra)

    def mao_sagital(th):
        """Dedos e palma (mundo) com o antebraço a `th` graus da vertical, no plano cabeça ↔ pés: th = 0 dedos pra
        cima e palma pros pés, th = 90 dedos pra cabeça e palma pra cima (o punho não dobra pra frente nem pra trás)."""
        a = math.radians(th)
        return Vector((0, math.sin(a), math.cos(a))), Vector((0, -math.cos(a), math.sin(a)))

    def polo(lado, Ec, W):
        eixo = (W - S[lado]).normalized()
        fora = (Ec - S[lado]) - eixo * (Ec - S[lado]).dot(eixo)
        return Ec + fora.normalized() * 0.4

    # ── referência (antebraço a 60°): (1) quanto a mão gira em volta da palma pra linha dos nós dos dedos (onde fica
    # o eixo da barra) ficar paralela à barra — o giro fica no punho, de lado (desvio radial/ulnar), sem dobrar pra
    # frente nem pra trás; (2) onde fica o vão da mão em relação ao punho, no referencial da mão (fixo o movimento todo)
    TH_REF = 60.0
    giro, off_local = {}, {}
    for lado, s in dt.LADOS:
        dq, pq = mao_sagital(TH_REF)
        W = E[lado] + dq * La
        maos.segurar(lado, W + dq * 0.09, dq, pq, polo=polo(lado, E[lado], W))
        nos = pg._base(rig, lado)[1]
        nos_p = (nos - pq * nos.dot(pq)).normalized()
        quer = Vector((1, 0, 0)) if nos_p.x > 0 else Vector((-1, 0, 0))
        giro[lado] = math.atan2(nos_p.cross(quer).dot(pq), nos_p.dot(quer))
        dq2 = Matrix.Rotation(giro[lado], 3, pq) @ dq
        maos.segurar(lado, W + dq2 * 0.09, dq2, pq, polo=polo(lado, E[lado], W))
        g = W + dq2 * 0.09
        off = g - p3.cabeca(rig, lado + "Hand")
        lat = dq2.cross(pq)
        off_local[lado] = (off.dot(dq2), off.dot(pq), off.dot(lat))
        nos2 = pg._base(rig, lado)[1]
        print("REF %s: giro da mão %.1f° | nós × barra antes %.1f° depois %.1f° | vão−punho no referencial da mão "
              "(%.3f %.3f %.3f)" % (lado, math.degrees(giro[lado]), math.degrees(min(nos.angle(quer), nos.angle(-quer))),
                                    math.degrees(min(nos2.angle(quer), nos2.angle(-quer))), *off_local[lado]))

    def mao(lado, th):
        dq, pq = mao_sagital(th)
        dq = Matrix.Rotation(giro[lado], 3, pq) @ dq
        return dq, pq, dq.cross(pq)

    # o punho fica sempre na mesma largura: x do antebraço fixo (o vão da mão cai em ±meia na barra)
    fx = {}
    for lado, s in dt.LADOS:
        dq, pq, lat = mao(lado, TH_REF)
        o = off_local[lado]
        k = (dq * o[0] + pq * o[1] + lat * o[2]).x
        fx[lado] = (s * meia - E[lado].x - k) / La

    def juntas(th):
        """Por lado: punho W, vão da mão g, dedos e palma, com o antebraço a `th` graus da vertical (vista de lado)."""
        out = {}
        a = math.radians(th)
        for lado, s in dt.LADOS:
            c = math.sqrt(1 - fx[lado] ** 2)
            W = E[lado] + Vector((fx[lado], c * math.sin(a), c * math.cos(a))) * La
            dq, pq, lat = mao(lado, th)
            o = off_local[lado]
            out[lado] = (W, W + dq * o[0] + pq * o[1] + lat * o[2], dq, pq)
        return out

    def centro(th):
        j = juntas(th)
        g = (j["Left"][1] + j["Right"][1]) / 2
        return Vector((0, g.y, g.z))

    def folga(th):
        """Barra (superfície) → pele/cabelo mais perto, entre as mãos (m)."""
        c = centro(th)
        P = cabeca[np.abs(cabeca[:, 0]) < meia - 0.04]
        return float(np.hypot(P[:, 1] - c.y, P[:, 2] - c.z).min()) - RAIO_BARRA

    def flexao(th):
        """Ângulo do cotovelo (braço × antebraço, graus) com o antebraço a `th` graus da vertical."""
        c = math.sqrt(1 - fx["Left"] ** 2)
        return math.degrees(math.acos(max(-1.0, min(1.0, c * math.cos(math.radians(th))))))

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

    th0 = bisseca(lambda th: flexao(th) - COTOVELO_CIMA, 0.0, 30.0) if flexao(0.0) < COTOVELO_CIMA else 0.0
    th1 = bisseca(lambda th: folga(th) - FOLGA_TESTA, 60.0, 150.0)
    c0, c1 = centro(th0), centro(th1)
    print("TESTA antebraço de %.1f° a %.1f° da vertical | cotovelo %.0f° → %.0f° | barra em cima (y %.3f z %.3f) "
          "embaixo (y %.3f z %.3f), folga da cabeça %.0f mm | ombro E (%.3f %.3f %.3f) | meia pegada %.3f | "
          "antebraço pra dentro %.1f°" % (th0, th1, flexao(th0), flexao(th1), c0.y, c0.z, c1.y, c1.z,
                                         folga(th1) * 1000, *S["Left"], meia, math.degrees(math.asin(fx["Left"]))))

    def pose(t):
        """t=0 braços estendidos na vertical, t=1 cotovelos dobrados, barra logo acima da testa."""
        th = p3.lerp(th0, th1, t)
        j = juntas(th)
        c = centro(th)
        barra.location = c
        p3.atualizar()
        for lado, s in dt.LADOS:
            W, g, dq, pq = j[lado]
            maos.segurar(lado, Vector((s * meia, c.y, c.z)), dq, pq, polo=polo(lado, E[lado], W))
        for lado, _ in dt.LADOS:                  # dedos e polegar fecham até a pele encostar na barra
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, c, Vector((1, 0, 0)), RAIO_BARRA, polegar_antes=antes)
        pose.desvio = {l: (p3.cabeca(rig, l + "ForeArm") - E[l]).length * 1000 for l, _ in dt.LADOS}
        pose.folga = folga(th) * 1000

    pose.dedos = {}
    pose.desvio = {}
    pose.folga = 0.0

    pose(0.5)                                    # polo certo do cotovelo no meio do movimento
    for lado, _ in dt.LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)

    def info():
        return maos.info() + " | cotovelo fora do calculado E %.1f D %.1f mm | barra → cabeça %.0f mm" % (
            pose.desvio.get("Left", 0), pose.desvio.get("Right", 0), pose.folga)

    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=COMPR_BARRA / 2)
    return Cena(pose, [barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0, foco_luz=(0, 0.45, 0.75),
                camera_video=((3.0, 0.2, 1.4), (0, 0.45, 0.75), 50), info=info, apoios=[banco],
                afunda_apoio_mm=20)
