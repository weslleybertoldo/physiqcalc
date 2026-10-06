# Tríceps Testa na Polia — cena da fábrica 3D (lote 3, 05/10/2026; exercício novo pedido pelo Weslley).
# t = 0 braços estendidos, barra em cima do rosto · t = 1 cotovelos dobrados, barra logo acima da frente da cabeça
# (testa/topo), sem encostar. Deitado de costas no banco reto com a CABEÇA pro lado da polia (roldana na posição baixa,
# atrás da cabeça), cabeça, costas e glúteo no estofado, pés chapados no chão; pegada pronada fechada na barra reta curta
# da polia (polegar em volta da barra: o polegar novo), mãos um pouco por dentro da largura dos ombros.
# O braço fica PARADO, um pouco inclinado pra trás (pra polia), com o cotovelo apontando pro teto sem abrir, e só o
# cotovelo dobra; punho reto (neutro). O cabo sai da roldana e vai em linha reta até o engate da barra em todo quadro
# (equip3d.polia), passando por cima da cabeça e do banco.
# Mesmo jeito do Tríceps Testa com Barra (cenas/triceps_testa_com_barra.py); o que muda: o braço inclinado INCLINA graus
# pra trás, a barra (mais grossa) e a polia.
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

RAIO_BARRA = 0.01524           # pegada de borracha de 1,2" (equip3d.barra_polia)
RAIO_LUVA = 0.020              # luva giratória do meio da barra (a parte mais grossa entre as mãos)
COMPR_BARRA = 0.508            # barra reta de 20"
TOPO = 0.44                    # altura do estofado (m)
BANCO_Y = (-0.28, 0.90)        # pé e cabeceira do banco (a cabeça fica perto da ponta, perto da polia)
POLIA_Y, POLIA_Z = 1.42, 0.25  # eixo da roldana: ~52 cm além da cabeceira, na posição baixa
INCLINA = 10.0                 # braço inclinado pra trás (pra polia), graus da vertical, parado o movimento todo
COTOVELO_CIMA = 5              # flexão do cotovelo em cima (estendido, sem travar)
PEGADA = 0.90                  # distância entre os vãos das mãos ÷ entre as articulações dos ombros
FOLGA_TESTA = 0.030            # embaixo: barra (superfície) → pele ou cabelo mais perto da cabeça (m)
CIMA = Vector((0, 0, 1))
EIXO = Vector((1, 0, 0))


def _cabeca_pontos(bon):
    """Pele da cabeça e do pescoço + cabelo, sobrancelhas e olhos (a cabeça não mexe no exercício): N×3."""
    pts = [dt.malha(bon, ("Head", "Neck"))]
    dg = bpy.context.evaluated_depsgraph_get()
    for o in bpy.data.objects:
        if o.type == "MESH" and o is not bon.corpo and o.parent is not None and not o.name.startswith(
                ("banco", "barra", "polia")):
            me = o.evaluated_get(dg).to_mesh()
            co = np.empty(len(me.vertices) * 3)
            me.vertices.foreach_get("co", co)
            M = np.array(o.matrix_world)
            pts.append(co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3])
            o.evaluated_get(dg).to_mesh_clear()
    return np.concatenate(pts)


def _dist_segmento(Q, a, b):
    """Distância (m) de cada ponto de Q (N×3) ao segmento a–b."""
    a, b = np.array(a), np.array(b)
    d = b - a
    s = np.clip(((Q - a) @ d) / max(d @ d, 1e-12), 0.0, 1.0)
    return np.linalg.norm(Q - (a + np.outer(s, d)), axis=1)


def montar(bon):
    pg.usar_cilindro(RAIO_BARRA * 2000)          # mão de referência da pegada de 30,5 mm (antes do Maos)
    rig = bon.rig
    dt.deitar(bon, TOPO)
    banco = e3.banco("banco", *BANCO_Y, topo=TOPO)
    cabeca = _cabeca_pontos(bon)
    pol = e3.polia("polia", y=POLIA_Y, altura=POLIA_Z)
    barra = e3.barra_polia("barra_polia", comprimento=COMPR_BARRA, raio=RAIO_BARRA)
    maos = Maos(bon, RAIO_BARRA, polegar_modo="volta")
    S = {l: p3.cabeca(rig, l + "Arm") for l, _ in dt.LADOS}
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length       # braço
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length      # antebraço
    braco = Vector((0, math.sin(math.radians(INCLINA)), math.cos(math.radians(INCLINA))))
    E = {l: S[l] + braco * Lb for l, _ in dt.LADOS}      # cotovelo parado o movimento todo
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

    # ── referência (antebraço a 60°), como no tríceps testa com barra: (1) giro da mão em volta da palma pra linha dos
    # nós dos dedos ficar paralela à barra (desvio de lado, sem dobrar o punho pra frente/trás); (2) vão da mão em
    # relação ao punho, no referencial da mão (fixo o movimento todo)
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

    perto_meio = cabeca[np.abs(cabeca[:, 0]) < 0.04]     # cabeça embaixo do engate e do cabo (x = 0)

    def folga(th):
        """Barra (superfície, a luva do meio é a parte mais grossa) → pele/cabelo mais perto, entre as mãos (m)."""
        c = centro(th)
        P = cabeca[np.abs(cabeca[:, 0]) < meia - 0.04]
        return float(np.hypot(P[:, 1] - c.y, P[:, 2] - c.z).min()) - RAIO_LUVA

    def folga_engate(th):
        """Engate (orelha → mosquetão → ponteira → bola, raio ~12 mm) e cabo reto → pele/cabelo do meio (m)."""
        c = centro(th)
        u = pol.direcao(c)
        A = c + u * e3.ENGATE_BARRA_POLIA
        T = pol.tangente(A)[0]
        eng = float(_dist_segmento(perto_meio, c + u * 0.02, c + u * (e3.ENGATE_BARRA_POLIA + 0.007)).min()) - 0.012
        cabo = float(_dist_segmento(perto_meio, A, T).min()) - 0.003
        return eng, cabo

    def flexao(th):
        """Ângulo do cotovelo (braço × antebraço, graus) com o antebraço a `th` graus da vertical."""
        c = math.sqrt(1 - fx["Left"] ** 2)
        a = math.radians(th)
        return math.degrees(math.acos(max(-1.0, min(1.0, c * (braco.y * math.sin(a) + braco.z * math.cos(a))))))

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

    th0 = bisseca(lambda th: flexao(th) - COTOVELO_CIMA, INCLINA, INCLINA + 30.0) \
        if flexao(INCLINA) < COTOVELO_CIMA else INCLINA
    th1 = bisseca(lambda th: folga(th) - FOLGA_TESTA, 60.0, 150.0)
    c0, c1 = centro(th0), centro(th1)
    piores = [folga_engate(th) for th in np.linspace(th0, th1, 25)]
    print("TESTA NA POLIA antebraço de %.1f° a %.1f° da vertical | cotovelo %.0f° → %.0f° | barra em cima (y %.3f z %.3f) "
          "embaixo (y %.3f z %.3f), folga da cabeça %.0f mm | engate → cabeça pior %.0f mm (embaixo %.0f) | cabo → cabeça "
          "pior %.0f mm | ombro E (%.3f %.3f %.3f) | meia pegada %.3f | antebraço pra dentro %.1f°" % (
              th0, th1, flexao(th0), flexao(th1), c0.y, c0.z, c1.y, c1.z, folga(th1) * 1000,
              min(p[0] for p in piores) * 1000, piores[-1][0] * 1000, min(p[1] for p in piores) * 1000,
              *S["Left"], meia, math.degrees(math.asin(fx["Left"]))))

    def pose(t):
        """t=0 braços estendidos, t=1 cotovelos dobrados, barra logo acima da frente da cabeça."""
        th = p3.lerp(th0, th1, t)
        j = juntas(th)
        c = centro(th)
        u = pol.direcao(c)
        e3.por_acessorio(barra, c, EIXO, u)               # gancho virado pro cabo (gira livre na barra)
        pol.ligar(c + u * e3.ENGATE_BARRA_POLIA)          # cabo reto da saída da roldana até o engate
        p3.atualizar()
        for lado, s in dt.LADOS:
            W, g, dq, pq = j[lado]
            maos.segurar(lado, Vector((s * meia, c.y, c.z)), dq, pq, polo=polo(lado, E[lado], W))
        for lado, _ in dt.LADOS:                  # dedos e polegar fecham até a pele encostar na barra
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, c, EIXO, RAIO_BARRA, polegar_antes=antes)
        pose.desvio = {l: (p3.cabeca(rig, l + "ForeArm") - E[l]).length * 1000 for l, _ in dt.LADOS}
        pose.folga = folga(th) * 1000
        pose.engate = [x * 1000 for x in folga_engate(th)]

    pose.dedos = {}
    pose.desvio = {}
    pose.folga = 0.0
    pose.engate = [0.0, 0.0]

    pose(0.5)                                    # polo certo do cotovelo no meio do movimento
    for lado, _ in dt.LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)

    def info():
        pol_ = " ".join("%s %s" % (l[0], pose.dedos.get(l, {}).get("Thumb")) for l, _ in dt.LADOS)
        return maos.info() + (" | cotovelo fora do calculado E %.1f D %.1f mm | barra → cabeça %.0f mm | engate → cabeça "
                              "%.0f mm | cabo → cabeça %.0f mm | cabo %.3f m | polegar %s") % (
            pose.desvio.get("Left", 0), pose.desvio.get("Right", 0), pose.folga, pose.engate[0], pose.engate[1],
            pol.comprimento, pol_)

    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=COMPR_BARRA / 2)
    return Cena(pose, [barra] + pol.raizes, pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0,
                foco_luz=(0, 0.6, 0.8), camera_video=((3.3, 0.1, 1.5), (0, 0.65, 0.8), 50), info=info, apoios=[banco],
                afunda_apoio_mm=20)
