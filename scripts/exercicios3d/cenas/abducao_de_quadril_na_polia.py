# Abdução de Quadril na Polia — cena da fábrica 3D (lote 8, 09/10/2026; troca equivalente nos treinos prontos do app).
# t = 0 começo: a perna de fora (a esquerda, a da tornozeleira) quase esticada ao lado da perna de apoio, quase colada nela, um pouco à
# frente e com o pé fora do chão (os pés na largura do quadril) · t = 1 fim: a perna aberta pro lado, longe da torre, ~40° (abdução).
# Técnica (ExRx, Cable Hip Abduction): em pé de lado pra polia baixa, a tornozeleira no tornozelo de fora, um passo pra longe da torre
# e a mão segurando a barra de apoio ("Stand in front of low pulley facing to one side. Attach cable cuff to far ankle. Step out away
# from stack and grasp ballet bar."), o peso no pé de perto ("Stand on near foot [...]"); a perna vai pro lado longe da polia pela
# abdução do quadril e volta ("Move leg to opposite side of low pulley by abduction hip. Return and repeat."); na animação da página, a
# mão de perto segura a barra com o braço esticado pro lado e a outra fica na cintura. Physitrack (fisioterapia): as pernas na largura do
# quadril no começo ("Stand with your legs hips width apart and some slight tension in the band."), o tronco em pé ("Move your outer leg
# outwards to about 45 degrees, keeping your trunk upright."; "Slowly, under control, return it back to the starting position."), as
# costas retas e o quadril nivelado, sem inclinar nem subir o quadril ("Keeping your back straight and your hips level, lift your leg out
# away from your body."; "Ensure you do not lean your body or hitch your hip."), as pernas esticadas e o corpo sem girar ("Grip the
# machine for support and keep body and legs straight."; "Don't let body swing or twist."). ACE (Hip extension and abductions): "lift the
# same leg out to the side (abduction)" "without moving your upper body". Dica do app: "Tornozeleira no cabo baixo, tronco reto segurando
# o apoio; leve a perna para o lado sem inclinar e volte devagar." Amplitude da abdução: 33,0 ± 4,8° (AAOS, tabela 1 de Wichman 2021);
# 42,6/43,2° passiva em praticantes de musculação (Cheatham 2017).
# O ExRx deixa a perna de fora começar cruzando na frente da de apoio ("allow far leg to cross in front"); no boneco (coxas musculosas e
# o quadril de apoio ~8° fechado, com o peso em cima do pé), a coxa que cruza entra na outra (medido, 09/10/2026): −10° de adução com a
# coxa 21° à frente deu 18,5 mm de coxa dentro da outra; −4° a −10° com a coxa de 21° a 33° à frente, de 5 a 18 mm; ao lado, +6° com a coxa
# 9° à frente, 12 mm; +8°, 8 mm; só a partir de +10° de abdução com a coxa ~13° à frente as coxas só encostam (1,5 mm). Fica o começo da
# Physitrack: a perna ao lado da de apoio, quase colada nela.
# Montagem: em pé no pé direito (o de perto), chapado, joelho levemente dobrado (6°); a pelve vai pro lado do pé de apoio até o centro
# de massa ficar em cima dele (5 cm à frente do tornozelo, no eixo do pé, no meio do movimento; tabela de Dempster em Winter 2009) e fica
# PARADA e nivelada; tronco em pé e parado, cabeça na linha dele. A perna que trabalha é um bloco só (joelho parado a 5°, tornozelo no
# repouso, a rótula e a ponta do pé pra frente: a coxa não gira), girando em volta da articulação do quadril: de 10° de abdução (ao lado
# da perna de apoio, a coxa 13° à frente da linha do corpo) a 40° (no plano do corpo). Polia (equip3d.polia, roldana a 0,20 m, a mais
# baixa) do lado direito e um pouco à frente (o cabo passa na frente da perna de apoio), com o garfo que gira (gira=True). Tornozeleira
# (equip3d.tornozeleira_polia): faixa de neoprene na forma da canela, presa no osso dela (APOIO), a argola virada pro cabo. Mão direita
# fechada na barra de apoio da torre (equip3d.barra_apoio_polia, 32 mm, a 1 m do chão), pegada pronada, polegar em volta, cotovelo quase
# esticado; mão esquerda parada na cintura (palma no flanco, dedos juntos pra frente e pra baixo). Modelos: cenas/coice_de_gluteo_na_polia.py
# (perna de apoio, centro de massa, tornozeleira), cenas/triceps_frances_unilateral_na_polia_baixa.py (mão na cintura).
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

TRABALHA, APOIO = "Left", "Right"   # a perna de fora (longe da torre) é a esquerda; a torre fica do lado direito (−X)
ABDUZ = (10.0, 40.0)           # coxa × plano sagital da pelve (tecnica3d.coxa_abducao), começo → fim (graus): ao lado da de apoio
                               # (com menos, a coxa entra na outra: ver acima) → aberta
FLEXAO = (18.0, 6.0)           # coxa × linha do tronco no plano sagital (tecnica3d.quadril_sinal), começo → fim (graus): o boneco
                               # em pé mede +5 (a perna começa um pouco à frente e termina no plano do corpo)
JOELHO_TRAB = 5.0              # flexão do joelho da perna que trabalha (graus), parado: perna esticada
JOELHO_APOIO = 6.0             # flexão do joelho de apoio (graus): levemente dobrado, parado
INCLINA = 0.0                  # tronco à frente da vertical (graus): em pé
PE_APOIO = (-0.09, 0.0)        # tornozelo de apoio no chão (x, y), m
CM_ALVO = (0.05, 0.0)          # centro de massa em cima do pé de apoio no meio do movimento: 5 cm à frente do tornozelo, no eixo do pé
T_CM = 0.5                     # quadro em que o centro de massa fica em cima do pé (a pelve não mexe depois)
RAIO_BARRA = 0.016             # barra de apoio de 32 mm (equip3d.barra_apoio_polia)
MEIA_BARRA = 0.40              # meia barra (m)
POSTES = 0.12                  # postes da barra a ±12 cm do meio dela (por fora do carrinho e do pino): longe da mão
BARRA_Z = 1.00                 # altura da barra (m)
COTOVELO = 15.0                # flexão do cotovelo da mão na barra (graus): quase esticado
MAO_FRENTE = 0.06              # a mão na barra fica isso à frente do ombro (m): o braço pro lado, um pouco à frente
POLO_APOIO = (0.0, 0.40, 0.10)  # polo do cotovelo da mão na barra em relação ao cotovelo (m): pra trás (o olécrano)
DF_BARRA = 0.09                # barra à frente do eixo da roldana (m), pro lado da pessoa
POLIA_Y = -0.32                # eixo da roldana à frente do tornozelo de apoio (m): o cabo passa na frente da perna de apoio
POLIA_Z, ALTO = 0.20, 2.15     # roldana na posição mais baixa e altura da coluna
FAIXA_H = 0.08                 # centro da faixa da tornozeleira acima do centro do tornozelo, ao longo da canela (m)
AFUNDA = 2.0                   # a pele pode afundar isso na faixa (mm): o neoprene aperta a perna
# mão esquerda na cintura (como a mão livre do tríceps francês unilateral na polia baixa)
CINTURA_Z = 0.14               # palma na lateral do tronco, isso acima das articulações do quadril (m)
DEDOS_CINTURA = 55.0           # dedos pra frente e isso pra baixo da horizontal (graus): com 40° o punho desviava 31° pro lado do
                               # polegar (passa do desvio radial normal, 20°); com 55°, 13°
PALMA_CIMA = 30.0              # palma virada pro corpo e isso pra cima (graus): o punho dobra pouco
POLO_LIVRE = (0.40, 0.35, 0.10)   # polo do cotovelo da mão na cintura em relação ao ombro (m: pra fora, pra trás, pra cima)
POLEGAR_JUNTO = 12.0           # polegar da mão na cintura a isso do indicador, no plano da palma (graus)
LAMBDA_MAX = 2.0               # dedo da mão na cintura dobra até perfil × isso pra encostar no corpo
APERTA = 0.001                 # a palma da mão na cintura afunda isso na pele (m)
SEGMENTOS = (                  # Winter DA, Biomechanics and Motor Control of Human Movement (2009), tabela de Dempster: (de, até,
                               # fração da massa, centro de massa a partir do de cima)
    ("Arm", "ForeArm", 0.028, 0.436), ("ForeArm", "Hand", 0.016, 0.430), ("Hand", "HandMiddle1", 0.006, 0.506),
    ("UpLeg", "Leg", 0.100, 0.433), ("Leg", "Foot", 0.0465, 0.433), ("Foot", "ToeBase", 0.0145, 0.50))
PERNA_T = ("LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase")
PERNA_A = ("RightUpLeg", "RightLeg", "RightFoot", "RightToeBase")
TRONCO = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder", "LeftArm", "RightArm",
          "LeftForeArm", "RightForeArm")
MAO = lambda L: [L + "Hand"] + ["%sHand%s%d" % (L, d, i) for d in ("Thumb", "Index", "Middle", "Ring", "Pinky")
                                for i in (1, 2, 3)]


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
    polo_joelho = p3.vazio("polo_joelho_" + APOIO, Vector((PE_APOIO[0] - 0.03, PE_APOIO[1] - 1.0, 0.55)))
    ik_apoio = p3.ik(rig, APOIO + "Leg", alvo_pe, polo_joelho)
    p3.travar_rotacao(rig, APOIO + "Foot")
    maos = Maos(bon, RAIO_BARRA, polegar_modo="volta")
    quadril0 = {L: c(L + "UpLeg").copy() for L in ("Left", "Right")}
    pivo = (quadril0["Left"] + quadril0["Right"]) / 2

    def pelve(dx, dy):
        """Pelve deslocada (dx, dy), nivelada e sem girar, na altura que dá a flexão JOELHO_APOIO no joelho de apoio (o tornozelo de
        apoio não sai do lugar); tronco INCLINA graus em volta das articulações do quadril."""
        PB[p3.P + "Hips"].matrix_basis = Matrix()
        PB[p3.P + "Spine"].matrix_basis = Matrix()
        p3.atualizar()
        H = quadril0[APOIO] + Vector((dx, dy, 0.0))
        k = math.radians(JOELHO_APOIO)
        L = math.sqrt(Lt ** 2 + Ls ** 2 + 2 * Lt * Ls * math.cos(k))
        A = alvo_pe.location
        dz = A.z + math.sqrt(max(L ** 2 - (H.x - A.x) ** 2 - (H.y - A.y) ** 2, 0.01)) - H.z
        p3.girar_osso(rig, "Hips", p3.rot_x(INCLINA), pivo=pivo, mover=Vector((dx, dy, dz)))

    def eixos_tronco():
        cima = (c("Neck") - c("Hips")).normalized()
        lado = c("RightArm") - c("LeftArm")
        lado = (lado - cima * lado.dot(cima)).normalized()
        return cima, lado, cima.cross(lado)

    def direcao_coxa(t):
        """Coxa que trabalha (unitária, mundo): ABDUZ graus pra fora do plano sagital do tronco e FLEXAO graus à frente da linha dele."""
        cima, lado, frente = eixos_tronco()
        fora = -lado if TRABALHA == "Left" else lado
        a = math.radians(p3.lerp(*ABDUZ, t))
        f = math.radians(p3.lerp(*FLEXAO, t))
        return (-cima * math.cos(a) * math.cos(f) + fora * math.sin(a) + frente * math.cos(a) * math.sin(f)).normalized()

    def perna(t):
        """Perna que trabalha: a coxa vai do repouso pra direção do quadro pelo menor arco, sem girar em volta dela mesma (a rótula e a
        ponta do pé ficam pra frente, como no boneco em pé — o joelho do boneco dobra num plano ~23° aberto: alinhar o eixo do joelho com
        o plano sagital virava o pé ~20° pra fora); joelho parado a JOELHO_TRAB, dobrando no eixo dele; pé no repouso em relação à canela."""
        for n in PERNA_T[:3]:
            PB[p3.P + n].matrix_basis = Matrix()
        p3.atualizar()
        dt = direcao_coxa(t)
        H, K = c(TRABALHA + "UpLeg"), c(TRABALHA + "Leg")
        p3.girar_osso(rig, TRABALHA + "UpLeg", (K - H).normalized().rotation_difference(dt).to_matrix())
        K, A = c(TRABALHA + "Leg"), c(TRABALHA + "Foot")
        cs = (A - K).normalized()
        eixo = dt.cross(cs)
        if eixo.length > 1e-6:                           # gira cs em volta de dt × cs: + = afasta da coxa (dobra mais)
            p3.girar_osso(rig, TRABALHA + "Leg", Matrix.Rotation(math.radians(JOELHO_TRAB) - dt.angle(cs), 3, eixo.normalized()))

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

    b_, a_ = (c(APOIO + "ForeArm") - c(APOIO + "Arm")).length, (c(APOIO + "Hand") - c(APOIO + "ForeArm")).length

    def ombro_punho(graus):
        """Ombro → punho com o cotovelo dobrado `graus` (m)."""
        return math.sqrt(b_ ** 2 + a_ ** 2 + 2 * b_ * a_ * math.cos(math.radians(graus)))

    def x_barra(alcance):
        """x do eixo da barra (na altura BARRA_Z, MAO_FRENTE à frente do ombro) com o vão da mão a `alcance` m do ombro de apoio."""
        S = c(APOIO + "Arm")
        return S.x - math.sqrt(max(alcance ** 2 - (S.z - BARRA_Z) ** 2 - MAO_FRENTE ** 2, 0.01))

    def mao_na_barra(g):
        """Mão de apoio fechada na barra (eixo ao longo de Y), pegada pronada: dedos na linha ombro → barra, palma pra baixo e pro corpo."""
        S = c(APOIO + "Arm")
        a = (g - S).normalized()
        p = Vector((0.0, 1.0, 0.0)).cross(a).normalized()
        if p.z > 0:
            p = -p
        maos.segurar(APOIO, g, a, p, polo=c(APOIO + "ForeArm") + Vector(POLO_APOIO), alinhar=0.6)

    def mao_livre_aprox():
        """Braço esquerdo perto de onde fica com a mão na cintura (só pro centro de massa, antes de pôr a mão de verdade)."""
        s = 1 if TRABALHA == "Left" else -1
        q = (c("LeftUpLeg") + c("RightUpLeg")) / 2
        g = Vector((q.x + s * 0.17, q.y - 0.02, q.z + CINTURA_Z))
        maos.segurar(TRABALHA, g, Vector((0.0, -0.7, -0.7)), Vector((-s, 0.0, 0.3)),
                     polo=c(TRABALHA + "Arm") + Vector((s * POLO_LIVRE[0], POLO_LIVRE[1], POLO_LIVRE[2])))

    # ── 1) pelve e braços: a pelve vai pro lado do pé de apoio até o centro de massa ficar em cima dele (no meio do movimento) ──────
    dx, dy = -0.09, 0.0
    pelve(dx, dy)
    e = p3.acertar_polo(rig, ik_apoio, APOIO + "Leg", APOIO + "UpLeg", APOIO + "Foot")
    print("polo joelho de apoio erro %.3f ang %d" % e)
    xb = None
    for volta in range(10):
        pelve(dx, dy)
        perna(T_CM)
        S = c(APOIO + "Arm")
        xb = x_barra(ombro_punho(40.0) + maos.palma * 0.92)    # cotovelo dobrado (o polo precisa) até a barra ir pro lugar
        mao_na_barra(Vector((xb, S.y - MAO_FRENTE, BARRA_Z)))
        mao_livre_aprox()
        p3.atualizar()
        fr, fo = cm_no_pe()
        print("PELVE volta %d: dx %.3f dy %.3f | CM no pé: %.0f mm à frente do tornozelo, %.0f mm pra fora | barra x %.3f" % (
            volta, dx, dy, fr, fo, xb))
        a, d = pe_apoio_eixo()
        alvo = a + d * CM_ALVO[0]
        cm = centro_de_massa()
        erro = Vector((alvo.x - cm.x, alvo.y - cm.y, 0.0))
        if erro.length < 0.001:
            break
        dx += erro.x * 1.3
        dy += erro.y * 1.3
    maos.iks[APOIO].mute = False                         # polo do cotovelo com o braço quase esticado
    e = p3.acertar_polo(rig, maos.iks[APOIO], APOIO + "ForeArm", APOIO + "Arm", APOIO + "Hand")
    print("polo cotovelo", APOIO, "erro %.3f ang %d" % e)
    # ── 2) barra onde o cotovelo fica a COTOVELO graus (o vão da mão não fica na ponta do antebraço: mede e corrige) ────────────────────
    S = c(APOIO + "Arm")
    for volta in range(8):
        mao_na_barra(Vector((xb, S.y - MAO_FRENTE, BARRA_Z)))
        jt = ck.medir_juntas(rig)
        cot = jt["cotoveloD"]
        print("BARRA volta %d: x %.4f | cotovelo D %.1f° | vão D %.1f mm" % (volta, xb, cot, maos.erro[APOIO] * 1000))
        if abs(cot - COTOVELO) < 0.4:
            break
        D = (Vector((xb, S.y - MAO_FRENTE, BARRA_Z)) - S).length
        xb -= (ombro_punho(COTOVELO) - ombro_punho(cot)) * D / (S.x - xb) * 0.9
    ombro_apoio = S.copy()
    print("TRONCO pronto: dx %.3f dy %.3f | ombro de apoio (%.3f %.3f %.3f) | barra x %.3f z %.3f" % (dx, dy, *ombro_apoio, xb, BARRA_Z))

    # ── 3) polia do lado direito, um pouco à frente; barra de apoio na frente da torre ─────────────────────────────────────────────
    x_rold = xb - DF_BARRA
    pol = e3.polia("polia", x=x_rold, y=POLIA_Y, altura=POLIA_Z, frente=(1, 0, 0), alto=ALTO, gira=True)
    barra = e3.barra_apoio_polia("barra_apoio", pol, altura=BARRA_Z, meia=MEIA_BARRA, raio=RAIO_BARRA, frente=DF_BARRA,
                                 postes=POSTES)
    centro_barra = barra.matrix_world.to_translation()
    g_mao = Vector((centro_barra.x, ombro_apoio.y - MAO_FRENTE, centro_barra.z))
    mao_na_barra(g_mao)
    pg.fechar_em_volta(bon, APOIO, g_mao, Vector((0, 1, 0)), RAIO_BARRA)
    jt = ck.medir_juntas(rig)
    print("MÃO NA BARRA: cotovelo D %.0f° | punho D %.0f° | ombro D %.0f° | mão a %.3f m do meio da barra | %s" % (
        jt["cotoveloD"], jt["punhoD"], jt["ombroD"], g_mao.y - centro_barra.y, maos.info()))

    # ── 4) mão esquerda na cintura (uma vez só: o braço não mexe), com a perna no começo (o quadril mais dobrado: a pele da cintura vem
    #       mais pra fora; nos outros quadros a palma fica a ≤ 1 mm dela) ─────────────────────────────────────────────────────────────
    perna(0.0)
    mao_livre = mao_na_cintura(bon, maos, TRABALHA)
    print("MÃO NA CINTURA %s" % mao_livre)

    # ── 5) tornozeleira: faixa na forma da canela, presa no osso dela ───────────────────────────────────────────────────────────────
    perna(0.5)
    M_canela = p3.mundo_osso(rig, TRABALHA + "Leg")
    A, K = c(TRABALHA + "Foot"), c(TRABALHA + "Leg")
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
    da_perna = np.array([n in (TRABALHA + "Leg", TRABALHA + "Foot") for n in nomes_] + [False])[dono_]
    perfil = e3.perfil_da_canela(bvh, centro0, eixo0, frente0, pontos=co[da_perna])
    alts, angs, raios = perfil
    print("FAIXA: perímetro de dentro %.0f–%.0f mm (de baixo pra cima) | raio %.1f–%.1f mm" % (
        _perimetro(raios[0], angs) * 1000, _perimetro(raios[-1], angs) * 1000, raios.min() * 1000, raios.max() * 1000))
    tz = e3.tornozeleira_polia("tornozeleira", perfil=perfil)

    def canela():
        """Centro, eixo e frente da faixa neste quadro, tirados do osso da canela (a faixa fica rígida com ela)."""
        M = p3.mundo_osso(rig, TRABALHA + "Leg")
        R = M.to_3x3()
        return M @ centro_l, (R @ eixo_l).normalized(), (R @ frente_l).normalized()

    def pele(partes, malha=None):
        """Vértices da pele das `partes` (a malha avaliada do quadro, uma vez só por quadro quando vem em `malha`)."""
        co_, _, (nomes, dono) = malha or ck._avaliar(bon.corpo, 1)
        return co_[np.array([n in partes for n in nomes] + [False])[dono]]

    ref = {}

    def medir_faixa(malha):
        """Faixa × osso da canela (posição e giro em relação ao 1º quadro) e faixa × pele embaixo dela (a pele da canela e do pé,
        no referencial da faixa, contra o lado de dentro dela): a mais funda (− = entrou no neoprene) e, em cada uma das 48 direções
        em volta da perna, a pele mais perto — o maior desses vãos e quantas direções encostam (vão ≤ 1 mm)."""
        M = p3.mundo_osso(rig, TRABALHA + "Leg").inverted() @ tz.faixa.matrix_world
        if "M" not in ref:
            ref["M"] = M.copy()
        d_pos = (M.to_translation() - ref["M"].to_translation()).length * 1000
        d_ang = math.degrees((M.to_3x3() @ ref["M"].to_3x3().transposed()).to_quaternion().angle)
        Mi = np.array(tz.faixa.matrix_world.inverted())
        Q = pele((TRABALHA + "Leg", TRABALHA + "Foot"), malha) @ Mi[:3, :3].T + Mi[:3, 3]
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

    def pe_no_chao(malha):
        """Pele mais baixa do pé que trabalha acima do chão (mm)."""
        P = pele((TRABALHA + "Foot", TRABALHA + "ToeBase"), malha)
        return float(P[:, 2].min()) * 1000

    def pose(t):
        """t=0 perna cruzando na frente da de apoio, t=1 perna aberta pro lado."""
        perna(t)
        centro, eixo, frente = canela()
        eng = tz.por(centro, eixo, frente, pol.direcao)
        pol.ligar(eng)
        p3.atualizar()
        malha = ck._avaliar(bon.corpo, 1)
        pose.faixa = medir_faixa(malha)
        Pa, Pt, Pc = pele(PERNA_A, malha), pele(PERNA_T, malha), pele(TRONCO + tuple(MAO("Left") + MAO("Right")), malha)
        pose.folgas = [float(_dist_segmento(X, pol.saida, eng).min()) * 1000 - 3 for X in (Pa, Pt, Pc)]
        pose.cm = cm_no_pe()
        pose.pe = pe_no_chao(malha)
        u = pol.direcao(eng)
        pose.cabo = math.degrees(math.asin(max(-1.0, min(1.0, -u.z))))

    pose.faixa = (0, 0, 0, 0, 0, 0)
    pose.folgas = [0.0] * 3
    pose.cm = (0.0, 0.0)
    pose.pe = 0.0
    pose.cabo = 0.0

    for t in (0.0, 0.25, 0.5, 0.75, 1.0):
        pose(t)
        tec = ck.tc.medir(ck.posicoes(rig))
        jt = ck.medir_juntas(rig)
        print("ABDUÇÃO t=%.2f | coxa_abducao E %.1f D %.1f | quadril_sinal E %.1f D %.1f | joelho E %.0f° D %.0f° | tronco %.1f° | "
              "pelve %.1f° | ombros %.1f° | argola %.0f° | garfo %.0f° | cabo %.1f° abaixo da horizontal | CM %.0f mm à frente, %.0f mm "
              "pra fora | pé que trabalha %.0f mm do chão | faixa: osso %.2f mm %.2f° | pele %.1f mm (vão em volta até %.1f, encosta em "
              "%d de %d direções) | cabo → perna de apoio %.0f, perna que trabalha %.0f, tronco/braços %.0f mm | ponta_pe %.0f/%.0f" % (
                  t, tec["coxa_abducao"][0], tec["coxa_abducao"][1], tec["quadril_sinal"][0], tec["quadril_sinal"][1],
                  jt["joelhoE"], jt["joelhoD"], math.degrees((c("Neck") - c("Hips")).angle(Vector((0, 0, 1)))),
                  tec["pelve_nivel"][0], tec["ombros_nivel"][0], tz.angulo, pol.giro, pose.cabo, *pose.cm, pose.pe, *pose.faixa,
                  *pose.folgas, *tec["ponta_pe"]))
    print("MÃO NA BARRA: vão %.1f mm" % (maos.erro[APOIO] * 1000))

    def info():
        jt = ck.medir_juntas(rig)
        return ("punho D %.0f° | cotovelo D %.0f° | vão da mão D %.1f mm" % (jt["punhoD"], jt["cotoveloD"], maos.erro[APOIO] * 1000)) + (
            " | abdução %.1f° | argola %.0f° | garfo %.0f° | cabo %.1f° abaixo da horizontal, %.3f m | CM %.0f mm à "
                              "frente do tornozelo de apoio, %.0f mm pra fora | pé que trabalha %.0f mm do chão | faixa × canela "
                              "%.2f mm %.2f° | faixa × pele %.1f mm (vão em volta até %.1f mm, encosta em %d de %d direções) | cabo → "
                              "perna de apoio %.0f mm, perna que trabalha %.0f mm, tronco/braços %.0f mm | mão na cintura %s") % (
            ck.tc.medir(ck.posicoes(rig))["coxa_abducao"][0], tz.angulo, pol.giro, pose.cabo, pol.comprimento, *pose.cm, pose.pe,
            *pose.faixa, *pose.folgas, mao_livre)

    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=MEIA_BARRA)
    return Cena(pose, tz.equipamentos + pol.raizes + [barra], pegadas=[(APOIO, bk)], apoio_mm=0.0,
                foco_luz=(-0.2, -0.1, 0.8), camera_video=((1.6, -4.3, 1.25), (-0.25, -0.1, 0.8), 50), info=info,
                apoios=tz.apoios, afunda_apoio_mm=AFUNDA)


def _perimetro(raios, angs):
    P = np.stack([raios * np.cos(angs), raios * np.sin(angs)], 1)
    return float(np.sum(np.linalg.norm(np.diff(np.vstack([P, P[:1]]), axis=0), axis=1)))


def mao_na_cintura(bon, maos, L):
    """Mão `L` parada na cintura: palma no flanco, CINTURA_Z acima das articulações do quadril, dedos juntos pra frente e DEDOS_CINTURA
    graus pra baixo, polegar junto do indicador; o cotovelo aponta pro lado e um pouco pra trás. O braço vai por IK até o punho e fica
    congelado (FK); o antebraço gira pra palma e o punho põe os dedos na direção; a palma afunda APERTA na pele e cada dedo (e o polegar)
    dobra até a pele encostar no corpo. É a mão livre do cenas/triceps_frances_unilateral_na_polia_baixa.py, com o lado de parâmetro.
    Devolve um texto com as medidas."""
    rig = bon.rig
    PB = rig.pose.bones
    s = -1 if L == "Right" else 1                 # lado de fora do corpo (x)
    sl = "D" if L == "Right" else "E"
    c = lambda n: p3.cabeca(rig, n)
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    tronco = np.array([n in ("Hips", "Spine", "Spine1") for n in nomes] + [False])[dono]
    T = co[tronco]
    quadril = (c("LeftUpLeg") + c("RightUpLeg")) / 2
    zc = quadril.z + CINTURA_Z
    faixa = T[np.abs(T[:, 2] - zc) < 0.006]
    lateral = faixa[np.argmax(s * faixa[:, 0])]   # ponto mais de fora do flanco nessa altura
    meio_y = float(np.median(faixa[s * faixa[:, 0] > s * lateral[0] - 0.015][:, 1]))
    alvo_pele = Vector((float(lateral[0]), meio_y, zc))
    bvh_t = ck._bvh(co, tri[tronco[tri].all(axis=1)])           # pele do tronco (parada)
    pc = math.radians(PALMA_CIMA)
    palma_q = Vector((-s * math.cos(pc), 0.0, math.sin(pc)))
    a_ = math.radians(DEDOS_CINTURA)
    dedos_q = Vector((0.0, -math.cos(a_), -math.sin(a_)))
    dedos_q = (dedos_q - palma_q * dedos_q.dot(palma_q)).normalized()

    def _congelar():
        nomes_ = (L + "Arm", L + "ForeArm")
        mats = [PB[p3.P + n].matrix.copy() for n in nomes_]
        maos.iks[L].mute = True
        for n, M in zip(nomes_, mats):
            PB[p3.P + n].matrix = M
            p3.atualizar()

    def _orientar():
        f0, f1 = c(L + "ForeArm"), c(L + "Hand")
        ax = (f1 - f0).normalized()               # 1) antebraço gira pra palma
        quer = palma_q - ax * palma_q.dot(ax)
        tem = pg._base(rig, L)[0]
        tem = tem - ax * tem.dot(ax)
        if quer.length > 1e-6 and tem.length > 1e-6:
            quer.normalize()
            tem.normalize()
            ang = math.atan2(tem.cross(quer).dot(ax), tem.dot(quer))
            p3.girar_osso(rig, L + "ForeArm", Matrix.Rotation(ang, 3, ax))
        h0 = c(L + "Hand")                        # 2) o resto no punho
        y_m = (p3.ponta(rig, L + "Hand") - h0).normalized()
        n_m = pg._base(rig, L)[0]
        n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
        F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
        pq = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
        F_quer = Matrix((dedos_q, pq, dedos_q.cross(pq))).transposed()
        p3.girar_osso(rig, L + "Hand", F_quer @ F_tem.transposed())

    def _esticar_dedos():
        """Dedos juntos, esticados e deitados no plano da palma; o polegar também, encostado no indicador."""
        p3.soltar_dedos(rig, L)
        pg.juntar_dedos(rig, L, 1.0)
        for d_ in p3.DEDOS + ("Thumb",):
            for i in (1, 2, 3):
                palma = pg._base(rig, L)[0]
                o = "%sHand%s%d" % (L, d_, i)
                f = p3.ponta(rig, o) - p3.cabeca(rig, o)
                plano = f - palma * f.dot(palma)
                if plano.length > 1e-6:
                    p3.girar_osso(rig, o, f.rotation_difference(plano).to_matrix())

    def _pele(partes):
        co_, _, (nomes_, dono_) = ck._avaliar(bon.corpo, 1)
        return co_, nomes_, dono_, co_[np.array([n in partes for n in nomes_] + [False])[dono_]]

    def _dist(P):
        """Menor distância com sinal (m) dos pontos P até a pele do tronco (− = dentro)."""
        menor = 1e9
        for p in P:
            v = Vector(p)
            loc, nor, idx, dist = bvh_t.find_nearest(v)
            if loc is None:
                continue
            menor = min(menor, -dist if (dist < 0.03 and (v - loc).dot(nor) < 0) else dist)
        return menor

    def _dobrar_ate_encostar(ossos, eixos, perfil):
        """Dobra a cadeia (falange 1 → 3) pro corpo com os ângulos perfil × λ até a pele encostar nele: a partir de λ = 0 (dedo no
        plano da palma), dobra até o 1º λ em que encosta (≤ 0,5 mm; no máximo λ = LAMBDA_MAX) ou, se já entra (< −1 mm), estica até o
        1º λ em que sai (no mínimo λ = −0,5). Devolve λ."""
        co_, nomes_, dono_, _ = _pele(ossos)
        pos = {n: i for i, n in enumerate(nomes_)}
        pts = {o: co_[dono_ == pos[o]] for o in ossos}
        cab = {o: np.array(c(o)) for o in ossos}
        ponta = np.array(p3.ponta(rig, ossos[-1]))

        def dist(lam):
            pp = pg._cadeia_pts(pts, cab, ponta, ossos, eixos, [lam * a for a in perfil])
            return _dist(np.concatenate([pp[o] for o in ossos]))

        escolha = 0.0
        if dist(0.0) < -0.001:
            for lam in np.arange(-0.02, -0.5001, -0.02):
                escolha = float(lam)
                if dist(lam) >= -0.0005:
                    break
        else:
            for lam in np.arange(0.0, LAMBDA_MAX + 0.0001, 0.02):
                escolha = float(lam)
                if dist(lam) <= 0.0005:
                    break
        for k, o in enumerate(ossos):
            if escolha * perfil[k]:
                p3.girar_osso(rig, o, Matrix.Rotation(math.radians(escolha * perfil[k]), 3, Vector(eixos[k])))
        return escolha

    def _polegar_junto():
        """Polegar fechando pro lado do indicador, no plano da palma, até ficar a POLEGAR_JUNTO graus dele."""
        palma = pg._base(rig, L)[0]
        o = L + "HandThumb1"
        t_ = p3.ponta(rig, L + "HandThumb3") - c(o)
        i_ = p3.ponta(rig, L + "HandIndex3") - c(L + "HandIndex1")
        t_ -= palma * t_.dot(palma)
        i_ -= palma * i_.dot(palma)
        ang = math.atan2(t_.cross(i_).dot(palma), t_.dot(i_))
        falta = ang - math.copysign(math.radians(POLEGAR_JUNTO), ang)
        if ang * falta > 0:
            p3.girar_osso(rig, o, Matrix.Rotation(falta, 3, palma))

    def _dedos_no_corpo():
        palma, eixo_nos = pg._base(rig, L)[:2]
        lams = {}
        for d_ in p3.DEDOS:
            ossos = ["%sHand%s%d" % (L, d_, i) for i in (1, 2, 3)]
            f = (p3.ponta(rig, ossos[0]) - c(ossos[0])).normalized()
            sinal = 1 if eixo_nos.cross(f).dot(palma) > 0 else -1     # + = dobra pro lado da palma (pro corpo)
            lams[d_] = _dobrar_ate_encostar(ossos, [np.array(eixo_nos * sinal)] * 3, (30.0, 25.0, 15.0))
        _polegar_junto()
        ossos = ["%sHand%s%d" % (L, "Thumb", i) for i in (1, 2, 3)]
        eixos = []
        for o in ossos:                           # polegar: dobra em volta de (direção dele × palma) → vai pra palma
            f = (p3.ponta(rig, o) - c(o)).normalized()
            eixos.append(np.array(f.cross(palma).normalized()))
        lams["Thumb"] = _dobrar_ate_encostar(ossos, eixos, (10.0, 20.0, 20.0))
        return lams

    S_l = c(L + "Arm")
    W = alvo_pele - dedos_q * 0.055 - palma_q * 0.02
    maos.polos[L].location = S_l + Vector((s * POLO_LIVRE[0], POLO_LIVRE[1], POLO_LIVRE[2]))
    for volta in range(8):
        maos.iks[L].mute = False
        maos.punhos[L].location = W
        p3.atualizar()
        if volta == 0:
            e = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
            print("polo cotovelo da mão na cintura erro %.3f ang %d" % e)
        _congelar()
        _orientar()
        _esticar_dedos()
        palma_pts = _pele((L + "Hand",))[3]
        palma_n = pg._base(rig, L)[0]
        centro_mao = np.array(palma_pts.mean(axis=0))
        lado_palma = palma_pts[(palma_pts - centro_mao) @ np.array(palma_n) > 0.004]
        centro_palma = Vector(lado_palma.mean(axis=0))
        dist = _dist(lado_palma)
        erro_alvo = alvo_pele - centro_palma
        erro_alvo -= palma_q * erro_alvo.dot(palma_q)                      # no plano da pele: centro da palma no alvo
        W = W + erro_alvo + palma_q * (dist + APERTA)                     # e a palma encostando (afundando APERTA)
        print("MÃO NA CINTURA volta %d: palma → pele %.1f mm | centro da palma fora do alvo %.1f mm" % (
            volta, dist * 1000, erro_alvo.length * 1000))
        if abs(dist + APERTA) < 0.0004 and erro_alvo.length < 0.003:
            break
    lams = _dedos_no_corpo()
    mao_pts = _pele(tuple(MAO(L)))[3]
    jt = ck.medir_juntas(rig)
    return "punho %s %.0f° cotovelo %s %.0f° ombro %s %.0f° | mão → cintura %.1f mm | dedos λ %s" % (
        sl, jt["punho" + sl], sl, jt["cotovelo" + sl], sl, jt["ombro" + sl], _dist(mao_pts) * 1000,
        " ".join("%s %.2f" % (k[0], v) for k, v in lams.items()))
