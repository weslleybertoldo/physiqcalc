# Coice de Glúteo na Polia — cena da fábrica 3D (lote 8, 09/10/2026; dos treinos prontos do app).
# t = 0 começo: a perna que trabalha (a esquerda) reta e pendurada, um pouco à frente do corpo, com o pé um pouco fora do chão ·
# t = 1 fim: o quadril estendido até o fim da amplitude normal, a perna esticada lá atrás.
# Técnica (ExRx, Cable Standing Hip Extension — a variação do catálogo: "extensão de quadril isolada", só o quadril mexe): a tornozeleira
# presa na roldana BAIXA e no tornozelo da perna que trabalha, as 2 mãos na barra de apoio da torre e a outra perna um passo atrás
# ("Attach ankle cuff to low pulley. With cuff on one ankle, grasp ballet bar with both hands and step back with other foot."), os
# cotovelos esticados ("Elbows remain straight."), a perna da tornozeleira esticada e o pé um pouco fora do chão ("Attached leg is
# straight and foot is slightly off floor."); o quadril estende e leva a perna pra trás ("Pull cable attachment back by extending hip.")
# e volta ("Return leg to original position."). ACE (Single-leg cable extension): de frente pra polia, segurando na estrutura ("Stand
# facing the anchor in an athletic-ready stance and hold onto the handles or a secure pole"), a perna vai pra trás até o fim da amplitude
# sem mexer o tronco ("until you cannot lift your leg anymore, all while keeping an erect torso"). Dica do app: "Tronco levemente inclinado
# e apoiado, estenda o quadril para trás sem arquear a lombar; volte controlado." Amplitude normal da extensão do quadril: 17,0 ± 3,9°
# (AAOS, na tabela 1 de Wichman 2021).
# Montagem: tronco inclinado 15° pra frente e PARADO (a pelve gira em volta das articulações do quadril, a coluna fica neutra e a cabeça
# na linha do tronco), a pelve desloca pro lado do pé de apoio até o centro de massa ficar em cima dele (5 cm à frente do tornozelo e
# 2 cm pra dentro do eixo do pé: o peso no pé de apoio; massa e centro de massa de cada parte da tabela de Dempster em Winter 2009) e
# fica 2° mais alta do lado que trabalha (a lombar desfaz: ombros nivelados) pro pé dela passar fora do chão; o pé de apoio (o direito)
# chapado, joelho levemente dobrado (6°). A perna que trabalha é um bloco só (joelho parado a 10°, tornozelo parado com a ponta do pé
# 10° pra canela) girando em volta da articulação do quadril num plano aberto 8° pra fora do sagital (parado: a perna passa ao lado da de
# apoio sem encostar), sem girar a pelve: de 21° de flexão (quadril_sinal 26: a perna pendurada ~11° à frente da vertical, o pé ~1 cm
# fora do chão) a 17° de extensão (quadril_sinal −12; o boneco em pé mede +5), a média da AAOS. Polia (equip3d.polia, roldana a
# 0,20 m, a mais baixa) na frente da pessoa, na linha do quadril que trabalha, com o garfo que gira (gira=True): o cabo vem quase reto
# pra trás e o garfo vira pro tornozelo, que fica um pouco por fora. Tornozeleira (equip3d.tornozeleira_polia): faixa de
# neoprene de 10 cm, com o lado de dentro na forma da canela (equip3d.perfil_da_canela), de 3 a 13 cm acima do centro do tornozelo,
# presa no osso da canela (não escorrega nem gira em volta da perna; é APOIO na Cena: a pele afunda no máximo AFUNDA); a argola corre
# em volta dela e fica virada pro cabo. Mãos fechadas na barra de apoio da torre (equip3d.barra_apoio_polia, 32 mm, a 1 m do chão), na
# largura dos ombros, pegada pronada, polegar em volta, cotovelos quase esticados (7–10°).
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from maos3d import Maos
from cena import Cena

TRABALHA, APOIO = "Left", "Right"
INCLINA = 15.0                 # tronco à frente da vertical (graus), parado: "levemente inclinado"
JOELHO_APOIO = 6.0             # flexão do joelho de apoio (graus): levemente dobrado, parado
JOELHO_TRAB = 10.0             # flexão do joelho da perna que trabalha (graus): quase esticado ("Attached leg is straight"), parado
QUADRIL = (26.0, -12.0)        # coxa × linha do tronco (medida quadril_sinal, + = à frente), começo → fim (graus)
ABDUZ = 8.0                    # plano da perna que trabalha aberto isso pra fora (graus), parado: a perna passa ao lado da de apoio
DORSI = 10.0                   # tornozelo da perna que trabalha flexionado isso (ponta do pé pra canela), parado
ELEVA_PELVE = 2.0              # pelve um pouco mais alta do lado que trabalha (graus): o pé dela passa fora do chão
PE_APOIO = (-0.09, 0.0)        # tornozelo de apoio no chão (x, y), m
CM_ALVO = (0.05, 0.02)         # centro de massa em cima do pé de apoio: 5 cm à frente do tornozelo (meio do pé), 2 cm pra dentro
RAIO_BARRA = 0.016             # barra de apoio de 32 mm (equip3d.barra_apoio_polia)
MEIA_BARRA = 0.40              # meia barra (m): as mãos ficam na largura dos ombros, com a torre na linha da perna que trabalha
BARRA_Z = 1.00                 # altura da barra (m)
MAOS = 0.19                    # meia distância entre os vãos das mãos (m): ombros a 0,40 m
COTOVELO = 8.0                 # flexão dos cotovelos (graus): quase esticados ("Elbows remain straight")
DF_BARRA = 0.09                # barra à frente do eixo da roldana (m), pro lado da pessoa
POLIA_Z, ALTO = 0.20, 2.15     # roldana na posição mais baixa e altura da coluna
FAIXA_H = 0.08                 # centro da faixa da tornozeleira acima do centro do tornozelo, ao longo da canela (m)
AFUNDA = 2.0                   # a pele pode afundar isso na faixa (mm): o neoprene aperta a perna
SEGMENTOS = (                  # Winter DA, Biomechanics and Motor Control of Human Movement (2009), tabela de Dempster: (de, até,
                               # fração da massa, centro de massa a partir do de cima)
    ("Arm", "ForeArm", 0.028, 0.436), ("ForeArm", "Hand", 0.016, 0.430), ("Hand", "HandMiddle1", 0.006, 0.506),
    ("UpLeg", "Leg", 0.100, 0.433), ("Leg", "Foot", 0.0465, 0.433), ("Foot", "ToeBase", 0.0145, 0.50))
PERNA_T = ("LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase")
PERNA_A = ("RightUpLeg", "RightLeg", "RightFoot", "RightToeBase")
TRONCO = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder", "LeftArm", "RightArm",
          "LeftForeArm", "RightForeArm")


def _dist_segmento(Q, a, b):
    """Distância (m) de cada ponto de Q (N×3) ao segmento a–b."""
    a, b = np.array(a), np.array(b)
    d = b - a
    s = np.clip(((Q - a) @ d) / max(d @ d, 1e-12), 0.0, 1.0)
    return np.linalg.norm(Q - (a + np.outer(s, d)), axis=1)


def montar(bon):
    pg.usar_cilindro(RAIO_BARRA * 2000)          # mão de referência da barra de 32 mm (antes do Maos)
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)
    Lt = (c("LeftLeg") - c("LeftUpLeg")).length
    Ls = (c("LeftFoot") - c("LeftLeg")).length
    ankle_z = c("RightFoot").z
    # perna de apoio: tornozelo fixo no chão (pé chapado na orientação de repouso), joelho pra frente
    alvo_pe = p3.vazio("tornozelo_" + APOIO, Vector((PE_APOIO[0], PE_APOIO[1], ankle_z)))
    polo_joelho = p3.vazio("polo_joelho_" + APOIO, Vector((PE_APOIO[0] - 0.05, PE_APOIO[1] - 1.0, 0.55)))
    ik_apoio = p3.ik(rig, APOIO + "Leg", alvo_pe, polo_joelho)
    p3.travar_rotacao(rig, APOIO + "Foot")
    maos = Maos(bon, RAIO_BARRA, polegar_modo="volta")
    quadril0 = {L: c(L + "UpLeg").copy() for L in ("Left", "Right")}
    pivo = (quadril0["Left"] + quadril0["Right"]) / 2

    def pelve(dx, dy):
        """Tronco inclinado INCLINA graus em volta das articulações do quadril, pelve deslocada (dx, dy) e na altura que dá a flexão
        JOELHO_APOIO no joelho de apoio (o tornozelo de apoio não sai do lugar)."""
        PB[p3.P + "Hips"].matrix_basis = Matrix()
        PB[p3.P + "Spine"].matrix_basis = Matrix()
        p3.atualizar()
        H = quadril0[APOIO] + Vector((dx, dy, 0.0))
        k = math.radians(JOELHO_APOIO)
        L = math.sqrt(Lt ** 2 + Ls ** 2 + 2 * Lt * Ls * math.cos(k))
        A = alvo_pe.location
        dz = A.z + math.sqrt(max(L ** 2 - (H.x - A.x) ** 2 - (H.y - A.y) ** 2, 0.01)) - H.z
        p3.girar_osso(rig, "Hips", p3.rot_x(INCLINA), pivo=pivo, mover=Vector((dx, dy, dz)))
        if ELEVA_PELVE:                                  # lado que trabalha um pouco mais alto, girando em volta do quadril de apoio;
            p3.girar_osso(rig, "Hips", Matrix.Rotation(-math.radians(ELEVA_PELVE), 3, "Y"), pivo=c(APOIO + "UpLeg"))
            p3.girar_osso(rig, "Spine", Matrix.Rotation(math.radians(ELEVA_PELVE), 3, "Y"))   # a lombar desfaz: ombros nivelados

    def eixos_tronco():
        cima = (c("Neck") - c("Hips")).normalized()
        lado = c("RightArm") - c("LeftArm")
        lado = (lado - cima * lado.dot(cima)).normalized()
        return cima, lado, cima.cross(lado)

    def perna(t):
        """Perna que trabalha: coxa a QUADRIL (quadril_sinal) graus da linha do tronco, num plano aberto ABDUZ graus pra fora do
        sagital do tronco; joelho parado a JOELHO_TRAB e tornozelo parado com a ponta do pé DORSI graus pra canela."""
        for n in PERNA_T[:3]:
            PB[p3.P + n].matrix_basis = Matrix()
        p3.atualizar()
        cima, lado, frente = eixos_tronco()
        phi = math.radians(QUADRIL[0] + (QUADRIL[1] - QUADRIL[0]) * t)
        k = math.radians(JOELHO_TRAB)
        ab = math.radians(ABDUZ)
        baixo = (-cima * math.cos(ab) - lado * math.sin(ab)).normalized()     # −lado = pra fora do lado esquerdo
        dt = (baixo * math.cos(phi) + frente * math.sin(phi)).normalized()
        ds = (baixo * math.cos(phi - k) + frente * math.sin(phi - k)).normalized()
        H, K, A = c("LeftUpLeg"), c("LeftLeg"), c("LeftFoot")
        ct, cs = (K - H).normalized(), (A - K).normalized()
        eixo_c = ct.cross(cs)
        eixo_c = (eixo_c - ct * eixo_c.dot(ct)).normalized()
        eixo_q = dt.cross(ds).normalized()
        F_tem = Matrix((ct, eixo_c, ct.cross(eixo_c))).transposed()
        F_quer = Matrix((dt, eixo_q, dt.cross(eixo_q))).transposed()
        p3.girar_osso(rig, "LeftUpLeg", F_quer @ F_tem.transposed())
        K, A = c("LeftLeg"), c("LeftFoot")
        cs = (A - K).normalized()
        p3.girar_osso(rig, "LeftLeg", cs.rotation_difference(ds).to_matrix())
        if DORSI:                                        # ponta do pé pra canela (o ângulo canela × pé abre)
            K, A, T = c("LeftLeg"), c("LeftFoot"), c("LeftToeBase")
            R = Matrix.Rotation(math.radians(DORSI), 3, eixo_q)
            if (A - K).angle(R @ (T - A)) < (A - K).angle(T - A):
                R = Matrix.Rotation(-math.radians(DORSI), 3, eixo_q)
            p3.girar_osso(rig, "LeftFoot", R)

    def centro_de_massa():
        """Centro de massa do corpo (tabela de Dempster em Winter 2009): braços, pernas, tronco (do meio dos quadris ao meio dos
        ombros, 49,7%, no meio) e cabeça + pescoço (8,1%, na altura da orelha)."""
        cm = Vector()
        for L in ("Left", "Right"):
            for a, b, m, f in SEGMENTOS:
                pa, pb_ = c(L + a), c(L + b)
                cm += (pa + (pb_ - pa) * f) * m
        q, o = (c("LeftUpLeg") + c("RightUpLeg")) / 2, (c("LeftArm") + c("RightArm")) / 2
        cm += (q + (o - q) * 0.5) * 0.497
        cm += (c("Head") + (p3.ponta(rig, "Head") - c("Head")) * 0.3) * 0.081
        return cm

    def pe_apoio_eixo():
        """Ponto do eixo do pé de apoio (tornozelo → base dos dedos, no chão) e a direção dele."""
        a, b = c(APOIO + "Foot"), c(APOIO + "ToeBase")
        d = Vector((b.x - a.x, b.y - a.y, 0.0)).normalized()
        return Vector((a.x, a.y, 0.0)), d

    def cm_no_pe():
        """Centro de massa em relação ao pé de apoio, no chão (mm): à frente do tornozelo ao longo do pé e de lado (+ = pra fora)."""
        cm = centro_de_massa()
        a, d = pe_apoio_eixo()
        v = Vector((cm.x, cm.y, 0.0)) - a
        fora = Vector((-d.y, d.x, 0.0))
        if fora.x > 0:                                 # pé direito: "pra fora" é −X
            fora = -fora
        return v.dot(d) * 1000, v.dot(fora) * 1000

    def maos_na_barra(centro_barra):
        """As 2 mãos fechadas na barra (eixo ao longo de X), pegada pronada, na largura dos ombros do tronco já inclinado."""
        meio = (c("LeftArm") + c("RightArm")) / 2
        for L, s in (("Left", 1), ("Right", -1)):
            g = Vector((meio.x + s * MAOS, centro_barra.y, centro_barra.z))
            S = c(L + "Arm")
            a = (g - S).normalized()
            al = math.asin(max(-1.0, min(1.0, -a.z)))
            palma = Vector((0.0, math.sin(al), -math.cos(al)))
            maos.segurar(L, g, a, palma, polo=c(L + "ForeArm") + Vector((s * 0.35, 0.35, 0.1)), alinhar=0.6)
        return meio

    b_, a_ = (c("LeftForeArm") - c("LeftArm")).length, (c("LeftHand") - c("LeftForeArm")).length

    def ombro_punho(graus):
        """Ombro → punho com o cotovelo dobrado `graus` (m)."""
        return math.sqrt(b_ ** 2 + a_ ** 2 + 2 * b_ * a_ * math.cos(math.radians(graus)))

    def y_barra(S, alcance):
        """y do eixo da barra (na altura BARRA_Z) com o vão das mãos a `alcance` m dos ombros."""
        lat = (c("LeftArm") - S).length - MAOS
        return S.y - math.sqrt(max(alcance ** 2 - (S.z - BARRA_Z) ** 2 - lat ** 2, 0.01))

    # ── 1) tronco, pelve e braços: a pelve vai pro lado do pé de apoio até o centro de massa ficar em cima dele ──────────────────────
    dx, dy = -0.10, 0.02
    for volta in range(8):
        pelve(dx, dy)
        perna(0.5)
        S = (c("LeftArm") + c("RightArm")) / 2
        yb = y_barra(S, ombro_punho(40.0) + maos.palma * 0.92)    # cotovelos dobrados (o polo precisa) até a barra ir pro lugar
        maos_na_barra(Vector((S.x, yb, BARRA_Z)))
        p3.atualizar()
        fr, fo = cm_no_pe()
        print("PELVE volta %d: dx %.3f dy %.3f | CM no pé: %.0f mm à frente do tornozelo, %.0f mm pra fora | barra y %.3f" % (
            volta, dx, dy, fr, fo, yb))
        a, d = pe_apoio_eixo()
        dentro = Vector((d.y, -d.x, 0.0))
        if dentro.x < 0:                                 # pé direito: "pra dentro" é +X
            dentro = -dentro
        alvo = a + d * CM_ALVO[0] + dentro * CM_ALVO[1]
        cm = centro_de_massa()
        erro = Vector((alvo.x - cm.x, alvo.y - cm.y, 0.0))
        if erro.length < 0.001:
            break
        dx += erro.x * 1.3
        dy += erro.y * 1.3
    for L in ("Left", "Right"):                          # polo dos cotovelos com o braço dobrado
        maos.iks[L].mute = False
        e = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
        print("polo cotovelo", L, "erro %.3f ang %d" % e)
    # ── 2) barra onde os cotovelos ficam a COTOVELO graus (o vão da mão não fica na ponta do antebraço: mede e corrige) ──────────────
    S = (c("LeftArm") + c("RightArm")) / 2
    for volta in range(8):
        maos_na_barra(Vector((S.x, yb, BARRA_Z)))
        jt = ck.medir_juntas(rig)
        cot = (jt["cotoveloE"] + jt["cotoveloD"]) / 2
        print("BARRA volta %d: y %.4f | cotovelo E %.1f° D %.1f° | vão E %.1f D %.1f mm" % (
            volta, yb, jt["cotoveloE"], jt["cotoveloD"], maos.erro["Left"] * 1000, maos.erro["Right"] * 1000))
        if abs(cot - COTOVELO) < 0.4:
            break
        D = math.sqrt((S.y - yb) ** 2 + (S.z - BARRA_Z) ** 2)
        yb -= (ombro_punho(COTOVELO) - ombro_punho(cot)) * D / (S.y - yb) * 0.9
    meio_ombros = S
    print("TRONCO pronto: dx %.3f dy %.3f | ombros (%.3f %.3f %.3f) | barra y %.3f z %.3f" % (dx, dy, *meio_ombros, yb, BARRA_Z))

    # ── 3) polia na linha da perna que trabalha, barra de apoio na frente da torre ──────────────────────────────────────────────────
    perna(0.5)
    x_perna = c("LeftUpLeg").x                           # a roldana na linha do quadril que trabalha; o garfo gira pro cabo
    y_rold = yb - DF_BARRA
    pol = e3.polia("polia", x=x_perna, y=y_rold, altura=POLIA_Z, frente=(0, 1, 0), alto=ALTO, gira=True)
    barra = e3.barra_apoio_polia("barra_apoio", pol, altura=BARRA_Z, meia=MEIA_BARRA, raio=RAIO_BARRA, frente=DF_BARRA)
    centro_barra = barra.matrix_world.to_translation()
    maos_na_barra(centro_barra)
    for L in ("Left", "Right"):                          # dedos e polegar fecham em volta da barra (parados: as mãos não mexem)
        g = Vector((meio_ombros.x + (MAOS if L == "Left" else -MAOS), centro_barra.y, centro_barra.z))
        pg.fechar_em_volta(bon, L, g, Vector((1, 0, 0)), RAIO_BARRA)
    jt = ck.medir_juntas(rig)
    print("MÃOS: cotovelo E %.0f° D %.0f° | punho E %.0f° D %.0f° | ombro E %.0f° D %.0f° | %s" % (
        jt["cotoveloE"], jt["cotoveloD"], jt["punhoE"], jt["punhoD"], jt["ombroE"], jt["ombroD"], maos.info()))
    e = p3.acertar_polo(rig, ik_apoio, APOIO + "Leg", APOIO + "UpLeg", APOIO + "Foot")
    print("polo joelho de apoio erro %.3f ang %d" % e)
    pelve(dx, dy)

    # ── 4) tornozeleira: faixa na forma da canela, presa no osso dela ───────────────────────────────────────────────────────────────
    perna(0.5)
    M_canela = p3.mundo_osso(rig, "LeftLeg")
    A, K = c("LeftFoot"), c("LeftLeg")
    eixo0 = (K - A).normalized()
    centro0 = A + eixo0 * FAIXA_H
    cima, lado, frente_t = eixos_tronco()
    frente0 = frente_t - eixo0 * frente_t.dot(eixo0)
    Minv = M_canela.inverted()
    centro_l = Minv @ centro0
    eixo_l = (Minv.to_3x3() @ eixo0).normalized()
    frente_l = (Minv.to_3x3() @ frente0).normalized()
    co, tri, (nomes_, dono_) = ck._avaliar(bon.corpo, 1)
    bvh = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(t) for t in tri], all_triangles=True)
    da_perna = np.array([n in ("LeftLeg", "LeftFoot") for n in nomes_] + [False])[dono_]
    perfil = e3.perfil_da_canela(bvh, centro0, eixo0, frente0, pontos=co[da_perna])
    alts, angs, raios = perfil
    print("FAIXA: perímetro de dentro %.0f–%.0f mm (de baixo pra cima) | raio %.1f–%.1f mm" % (
        _perimetro(raios[0], angs) * 1000, _perimetro(raios[-1], angs) * 1000, raios.min() * 1000, raios.max() * 1000))
    tz = e3.tornozeleira_polia("tornozeleira", perfil=perfil)

    def canela():
        """Centro, eixo e frente da faixa neste quadro, tirados do osso da canela (a faixa fica rígida com ela)."""
        M = p3.mundo_osso(rig, "LeftLeg")
        R = M.to_3x3()
        return M @ centro_l, (R @ eixo_l).normalized(), (R @ frente_l).normalized()

    # pontos do corpo pras folgas medidas na cena (o cabo é reto: segmento da saída da roldana até o começo do cabo)
    def pele(partes, malha=None):
        """Vértices da pele das `partes` (a malha avaliada do quadro, uma vez só por quadro quando vem em `malha`)."""
        co_, _, (nomes, dono) = malha or ck._avaliar(bon.corpo, 1)
        return co_[np.array([n in partes for n in nomes] + [False])[dono]]

    ref = {}

    def medir_faixa(malha):
        """Faixa × osso da canela (posição e giro em relação ao 1º quadro) e faixa × pele embaixo dela (a pele da canela e do pé,
        no referencial da faixa, contra o lado de dentro dela): a mais funda (− = entrou no neoprene) e, em cada uma das 48 direções
        em volta da perna, a pele mais perto — o maior desses vãos e quantas direções encostam (vão ≤ 1 mm)."""
        M = p3.mundo_osso(rig, "LeftLeg").inverted() @ tz.faixa.matrix_world
        if "M" not in ref:
            ref["M"] = M.copy()
        d_pos = (M.to_translation() - ref["M"].to_translation()).length * 1000
        d_ang = math.degrees((M.to_3x3() @ ref["M"].to_3x3().transposed()).to_quaternion().angle)
        Mi = np.array(tz.faixa.matrix_world.inverted())
        Q = pele(("LeftLeg", "LeftFoot"), malha) @ Mi[:3, :3].T + Mi[:3, 3]
        Q = Q[np.abs(Q[:, 2]) <= alts[-1] - 0.003]                 # embaixo do lado de dentro (fora das bordas redondas)
        r = np.hypot(Q[:, 0], Q[:, 1])
        a = np.arctan2(Q[:, 1], Q[:, 0]) % (2 * math.pi)
        n = len(angs)
        f = a / (2 * math.pi) * n
        j0 = np.floor(f).astype(int) % n
        w = f - np.floor(f)
        rin = np.empty(len(Q))
        for k in np.unique(j0):
            m = j0 == k
            r0 = np.interp(Q[m, 2], alts, raios[:, k])
            r1 = np.interp(Q[m, 2], alts, raios[:, (k + 1) % n])
            rin[m] = r0 * (1 - w[m]) + r1 * w[m]
        vao = rin - r
        perto = np.array([vao[j0 == k].min() for k in range(n) if (j0 == k).any()])
        return d_pos, d_ang, float(vao.min()) * 1000, float(perto.max()) * 1000, int((perto <= 0.001).sum()), len(perto)

    def pose(t):
        """t=0 perna pendurada um pouco à frente, t=1 quadril estendido."""
        perna(t)
        centro, eixo, frente = canela()
        eng = tz.por(centro, eixo, frente, pol.direcao)
        pol.ligar(eng)
        p3.atualizar()
        malha = ck._avaliar(bon.corpo, 1)
        pose.faixa = medir_faixa(malha)
        Pa, Pt, Pc = pele(PERNA_A, malha), pele(PERNA_T, malha), pele(TRONCO, malha)
        pose.folgas = [float(_dist_segmento(X, pol.saida, eng).min()) * 1000 - 3 for X in (Pa, Pt, Pc)]
        pose.cm = cm_no_pe()
        u = pol.direcao(eng)
        pose.cabo = math.degrees(math.asin(max(-1.0, min(1.0, -u.z))))

    pose.faixa = (0, 0, 0, 0, 0, 0)
    pose.folgas = [0.0] * 3
    pose.cm = (0.0, 0.0)
    pose.cabo = 0.0

    for t in (0.0, 0.5, 1.0):
        pose(t)
        tec = ck.tc.medir(ck.posicoes(rig))
        jt = ck.medir_juntas(rig)
        print("COICE t=%.1f | quadril_sinal E %.1f D %.1f | joelho E %.0f° D %.0f° | tronco %.1f° | argola %.0f° | cabo %.1f° abaixo "
              "da horizontal | CM %.0f mm à frente, %.0f mm pra fora | faixa: osso %.2f mm %.2f° | pele %.1f mm (vão em volta até %.1f, "
              "encosta em %d de %d direções) | cabo → perna de apoio %.0f, perna que trabalha %.0f, tronco %.0f mm" % (
                  t, tec["quadril_sinal"][0], tec["quadril_sinal"][1], jt["joelhoE"], jt["joelhoD"],
                  math.degrees((c("Neck") - c("Hips")).angle(Vector((0, 0, 1)))), tz.angulo, pose.cabo, *pose.cm, *pose.faixa,
                  *pose.folgas))
    print("MÃOS %s" % maos.info())

    def info():
        return maos.info() + (" | quadril %.1f° | argola %.0f° | cabo %.1f° abaixo da horizontal, %.3f m | CM %.0f mm à frente do "
                              "tornozelo de apoio, %.0f mm pra fora | faixa × canela %.2f mm %.2f° | faixa × pele %.1f mm (vão em "
                              "volta até %.1f mm, encosta em %d de %d direções) | cabo → perna de apoio %.0f mm, perna que trabalha "
                              "%.0f mm, tronco %.0f mm") % (
            ck.tc.medir(ck.posicoes(rig))["quadril_sinal"][0], tz.angulo, pose.cabo, pol.comprimento, *pose.cm, *pose.faixa,
            *pose.folgas)

    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=MEIA_BARRA)
    return Cena(pose, tz.equipamentos + pol.raizes + [barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0,
                foco_luz=(0, -0.1, 0.8), camera_video=((4.2, 0.6, 1.2), (0.05, -0.15, 0.75), 50), info=info,
                apoios=tz.apoios, afunda_apoio_mm=AFUNDA)


def _perimetro(raios, angs):
    P = np.stack([raios * np.cos(angs), raios * np.sin(angs)], 1)
    return float(np.sum(np.linalg.norm(np.diff(np.vstack([P, P[:1]]), axis=0), axis=1)))
