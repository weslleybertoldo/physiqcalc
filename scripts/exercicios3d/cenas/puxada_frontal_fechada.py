# Puxada Frontal Fechada — cena da fábrica 3D (lote 7, 08/10/2026). A MESMA estação da Puxada Frontal Aberta (lote 6), sem mudar
# nada nela: equip3d.estacao_puxada (assento, 2 rolos das coxas, torre com a pilha na frente e o braço de cima com a roldana alta) +
# equip3d.barra_puxada (barra longa de 48" com as pontas dobradas a 25°) no cabo da polia (por_acessorio + pol.ligar). Muda a pegada:
# as mãos no RETO do meio da barra, mais perto uma da outra (na largura dos ombros), e o caminho que ela pede.
# t = 0 sentado de frente pra torre, coxas presas embaixo dos rolos, pés chapados, tronco um pouco inclinado pra trás, braços
# esticados pra cima segurando o meio da barra com a pegada pronada fechada (as mãos na largura biacromial, ~1 × a largura dos
# ombros) e as escápulas soltas (um pouco subidas) · t = 1 a barra na frente da parte de cima do peito, quase encostando, os
# cotovelos bem dobrados, descendo pra baixo e um pouco pra trás, junto dos lados do tronco, e as escápulas descidas e pra trás.
# Pegada (o que é "fechada"): na barra reta, pronada, as mãos a 1 × a distância biacromial — Andersen 2014 (puxada pela frente com 3
# larguras PRONADAS: "narrow, medium, and wide grips (1, 1.5, and 2 times the biacromial distance)"), Lusk 2010 ("a narrow grip that
# matched their biacromial diameter"), Lee & Lim 2017 (a largura biacromial = 100%, "양쪽 견봉 거리(어깨너비)를 100% 기준"). O ExRx
# chama de "Cable Close Grip Pulldown" a puxada com o puxador PARALELO ("Grasp parallel cable attachment."; "Exercise can be performed
# with V-Bar or Multi-exercise Bar.") — outro exercício do catálogo (Puxada com Triângulo); o close grip do Signorile 2002 também
# ("The CG pull-down was performed with a V-Bar"). Aqui é a barra longa (a dica fala em "barra"), com as mãos no reto do meio.
# A largura biacromial do boneco sai da altura dele, na proporção medida por Lee & Lim 2017 (Tabela 1: 172,5 cm de altura e 40,3 cm de
# largura biacromial nos homens) — o meio de cada mão a metade disso do meio da barra.
# Técnica: ExRx, Cable Pulldown (https://exrx.net/WeightExercises/LatissimusDorsi/CBFrontPulldown): "Sit with thighs under supports." /
# "Pull down cable bar to upper chest. Return until arms and shoulders are fully extended." ACE, Seated Lat Pulldown: "adjusting the
# thigh pad to fit firmly against the top of your thighs" / "depress and retract your scapulae (pull shoulders back and down)" / "Lean
# back slightly (no more than a 30 degree angle)" / "Maintain your head aligned with your spine" / "initiate the downward pull by first
# depressing (lower) your scapulae, then pulling the bar downward towards the top or mid-section of your chest" / "drives your elbows
# directly down towards the floor, bringing your elbows towards the sides of your torso" / "Avoid any additional backwards lean during
# the pull movement" / "Continue pulling until the bar nears or touches your chest, or more importantly, you observe your elbows no
# longer moving downward, but now beginning to move backwards" / "slowly return to your starting position by allowing the bar to move
# upwards until your elbows are fully extended, then allow your scapule to rise slightly". NSCA (Achievable CSCS, Lat pulldown
# (machine)): "Sit with your thighs under the pads, feet flat, and torso slightly leaned back" / "Fully extend your elbows" / "Pull the
# bar down to your upper chest" (a pegada da NSCA é a comum, "wider than shoulder-width": a fechada é a variação). NFPT, Lat Pulldown:
# "Pull the bar downward with the elbows moving down and back and the chest up and out as the bar is lowered" / "Lean slightly backward
# and extend the neck to create a clear path for the bar to pass by the face" / variação "Close-grip lat pull". Lee & Lim 2017: a barra
# desce até logo antes do esterno ("바가 턱 아래로 내려와 복장뼈(sternum) 직전까지 오게 한 후 천천히 원위치로"). Dica do app: "Peito aberto,
# puxe a barra até a parte alta do peito levando os cotovelos para baixo e para trás. Volte devagar até os braços quase estenderem."
# Como o rig faz: sentado como na Aberta (coxas deitadas e um pouco abertas, canelas em pé, pés chapados) com o tronco TRONCO° pra trás,
# parado; a cabeça na linha do tronco. A barra desce num caminho em pé: de B0 (em cima, na altura em que o cotovelo mais esticado fica
# com COTOVELO0°) até B1 (embaixo, na parte alta do peito: o eixo da barra DZ1 em relação à articulação dos ombros). Com as mãos na
# largura dos ombros, a mão fica NA FRENTE do ombro e o braço não dobra o bastante pra barra encostar no peito na altura dos ombros: o
# fim é onde o cotovelo chega a COTOVELO1° (bem dobrado, o "elbows no longer moving downward" do ACE), sem passar de GAP_MIN da pele do
# peito. Quadro a quadro: escápulas (subidas no começo, descem logo no início da puxada e vão pra trás), a barra no lugar (o engate
# virado pro cabo), o cabo ligado e as 2 mãos no meio da pegada de cada lado: IK do braço a partir do braço de repouso, polo do cotovelo
# pra baixo, pra trás e um pouco pra fora; os dedos ⟂ à barra, na direção do antebraço, e a palma pra frente (pegada pronada); metade
# da torção do antebraço (a pronação) passa pro osso da mão, que fica no mesmo lugar (TORCE). Dedos e polegar fecham UMA vez (mão
# rígida na borracha).
import math
import numpy as np
from mathutils import Matrix, Quaternion, Vector
import bpy
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from maos3d import Maos
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
X = Vector((1.0, 0.0, 0.0))
TRONCO = -15.0            # tronco 15° pra trás da vertical (− = pra trás), parado: "Lean back slightly (no more than a 30 degree
                          # angle)" e "Avoid any additional backwards lean during the pull movement" (ACE); "torso slightly leaned
                          # back" (NSCA) — o mesmo da Puxada Frontal Aberta, na mesma estação
ABRE_COXA = 8.0           # coxas abertas 8° pra fora: o poste dos rolos sobe entre as pernas
ESP_ASSENTO, LARG_ASSENTO, PROF_ASSENTO = 0.06, 0.38, 0.34   # estofado de 60 mm, como o das remadas
AFUNDA = 0.002            # pele afundando no estofado do assento e dos rolos
RAIO_ROLO, COMP_ROLO, X_ROLO = 0.0635, 0.21, 0.035           # rolo de 5" e 21 cm, de |x| = 3,5 cm pra fora (o poste no meio)
ROLO_JOELHO = 0.09        # eixo dos rolos 9 cm atrás do centro do joelho (em cima da coxa, logo antes do joelho)
COMPR_BARRA, RETO, DOBRA = 1.219, 0.74, 25.0                  # barra de 48", reto de 74 cm, pontas dobradas a 25° (a da Aberta)
RAIO_BARRA = 0.01524      # borracha de 1,2" (30,5 mm) onde a mão fecha
BIACROMIAL_ALTURA = 40.3 / 172.5   # largura biacromial ÷ altura (Lee & Lim 2017, Tabela 1, homens): a pegada fechada = 1 × ela
COTOVELO0 = 6.0           # começo: cotovelo estendido sem travar ("Fully extend your elbows", NSCA; "quase estenderem", dica)
DY0 = 0.0                 # começo: a barra em cima do ponto do fim (caminho em pé, o cabo quase vertical o movimento todo)
DZ1 = -0.05               # fim: eixo da barra 5 cm abaixo da articulação dos ombros (parte alta do peito)
COTOVELO1 = 137.0         # fim: o cotovelo mais dobrado dos 2 (a mão na frente do ombro pede o cotovelo bem dobrado): com 137° a
                          # barra para a ~3 cm do peito ("until the bar nears or touches your chest", ACE); com 134° ficava a ~4 cm
GAP_MIN = 0.010           # fim: a barra (superfície) nunca mais perto que 1 cm da pele do peito (o peso não encosta no corpo)
ELEVA0, DESCE1 = 12.0, 4.0    # escápulas subidas no começo (clavícula 12° pra cima) e descidas no fim (4° pra baixo)
RETRAI1 = 16.0            # escápulas pra trás no fim (16° em volta do eixo do tronco: "pull shoulders back and down", ACE; "Peito
                          # aberto", dica) — o ombro vai ~3 cm pra trás da base do pescoço
ESCAPULA_ATE, RETRAI_ATE = 0.35, 0.75     # descem logo no começo da puxada (ACE: "first depressing") e vão pra trás até t = 0,75
POLO = (0.10, 0.17, -0.47)    # polo do cotovelo a partir do ombro, no referencial do tronco (m: pra fora, pra trás, pra cima): os
                              # cotovelos descem pela frente e terminam junto dos lados do tronco ("bringing your elbows towards the
                              # sides of your torso", ACE; cotovelo × tronco ~12° no fim) com o punho quase reto (~8° de desvio); com
                              # o polo mais aberto (0,20 pra fora) o cotovelo abria 24° e o punho desviava 19° (sondas de 08/10)
TORCE = 0.5               # parte da torção do antebraço (pronação) que vai pro osso da mão — a mão fica onde está, igual. No braço de
                          # verdade quem gira na pronação é o rádio em volta da ulna: perto do cotovelo o antebraço quase não gira e
                          # perto do punho gira tudo. O rig tem UM osso no antebraço: com a torção toda nele, a carne perto do
                          # cotovelo torce junto e, com o cotovelo a 137° e a palma pra frente (pronação ~170°), o antebraço entrava
                          # 10–11 mm no braço; com metade da torção na mão (como os ossos de torção dos rigs) não entra (0 mm)
FOLGA_ROSTO = 0.025       # barra e engate (superfície) → pele/cabelo da cabeça e do pescoço: mínimo no caminho todo
ROLDANA_FRENTE = 0.005    # roldana 5 mm à frente (−Y) do ponto mais à frente do caminho da barra (o cabo nunca vira de lado)
Z_ROLDANA = 2.10          # eixo da roldana alta a 2,10 m (máquina de 2,26 m: Titan 87", Legend 90")
RAIO_ROLDANA = 0.045
TORRE_PES = 0.12          # frente da torre 12 cm à frente da ponta dos pés


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _suave(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def _dist_segmento(Q, a, b):
    """Distância (m) de cada ponto de Q (N×3) ao segmento a–b."""
    a, b = np.array(a), np.array(b)
    d = b - a
    s = np.clip(((Q - a) @ d) / max(d @ d, 1e-12), 0.0, 1.0)
    return np.linalg.norm(Q - (a + np.outer(s, d)), axis=1)


def montar(bon):
    pg.usar_cilindro(RAIO_BARRA * 2000)       # mão de referência da borracha de 30,5 mm (antes do Maos)
    pg.usar_polegar("volta")                  # polegar dando a volta na barra (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    # ── 0) a pegada fechada: 1 × a largura biacromial do boneco (pela altura dele, em pé, antes de sentar) ─────────────────────────
    co0, _, _ = _malha(bon)
    altura = float(co0[:, 2].max() - co0[:, 2].min())
    biacromial = BIACROMIAL_ALTURA * altura
    PEGADA = biacromial / 2                   # do meio da barra ao meio de cada mão, no reto (≤ RETO/2)
    ombros0 = (cab("LeftArm") - cab("RightArm")).length
    print("PEGADA | altura do boneco %.3f m → largura biacromial %.3f m (Lee & Lim 2017: 40,3/172,5) | meio de cada mão a %.3f m do "
          "meio da barra | entre as articulações dos ombros %.3f m (pegada_largura esperada %.2f)" % (
              altura, biacromial, PEGADA, ombros0, biacromial / ombros0), flush=True)

    # ── 1) sentado: tronco TRONCO° pra trás, coxas deitadas e um pouco abertas, canelas em pé, pés chapados no chão ──────────────────
    PERNA = ("Hips",) + tuple(L + o for L, _ in LADOS for o in ("UpLeg", "Leg", "Foot", "ToeBase"))
    repouso = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNA}
    pivo0 = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    pe_rep = {L: p3.mundo_osso(rig, L + "Foot").to_3x3().normalized() for L, _ in LADOS}   # sola chapada (repouso)
    f_rep = {L: cab(L + "ToeBase") - cab(L + "Foot") for L, _ in LADOS}
    t_rep = cab("Neck") - cab("Hips")
    frente_rep = math.degrees(math.atan2(-t_rep.y, t_rep.z))   # o tronco do boneco em pé, no repouso, já inclina isso pra frente

    def sentar(inclina):
        for n, M in repouso.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(inclina - frente_rep), pivo=pivo0)
        for L, s in LADOS:
            h, k = cab(L + "UpLeg"), cab(L + "Leg")
            alvo = Vector((s * math.sin(math.radians(ABRE_COXA)), -math.cos(math.radians(ABRE_COXA)), 0.0))
            p3.girar_osso(rig, L + "UpLeg", (k - h).rotation_difference(alvo).to_matrix())
            k, a = cab(L + "Leg"), cab(L + "Foot")
            p3.girar_osso(rig, L + "Leg", (a - k).rotation_difference(Vector((0, 0, -1))).to_matrix())
            f = cab(L + "ToeBase") - cab(L + "Foot")       # a canela gira em volta dela mesma até o pé apontar como no repouso
            giro = math.atan2(f_rep[L].x, -f_rep[L].y) - math.atan2(f.x, -f.y)
            p3.girar_osso(rig, L + "Leg", Matrix.Rotation(giro, 3, (cab(L + "Foot") - cab(L + "Leg")).normalized()))
            F = p3.mundo_osso(rig, L + "Foot").to_3x3().normalized()
            p3.girar_osso(rig, L + "Foot", pe_rep[L] @ F.inverted())    # sola chapada, como em pé
        pes = pele(("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"))
        p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, -0.0005 - float(pes[:, 2].min()))))

    sentar(TRONCO)
    H = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    tt = cab("Neck") - cab("Hips")
    G = pele(("Hips", "LeftUpLeg", "RightUpLeg"))
    gl = G[np.abs(G[:, 0]) < LARG_ASSENTO / 2]
    y_tras = float(gl[gl[:, 2] < float(gl[:, 2].min()) + 0.06][:, 1].max()) + 0.04
    y_frente = y_tras - PROF_ASSENTO
    Gs = gl[(gl[:, 1] > y_frente) & (gl[:, 1] < y_tras)]
    topo = float(Gs[:, 2].min()) + AFUNDA
    print("SENTADO | tronco %.1f° (− = pra trás; repouso %.1f°) | quadril (%.4f %.4f %.4f) | assento topo %.4f, y %.3f → %.3f" % (
        math.degrees(math.atan2(-tt.y, tt.z)), frente_rep, *H, topo, y_frente, y_tras), flush=True)

    # rolos das coxas: eixo ROLO_JOELHO atrás do centro do joelho, encostando em cima das coxas (a pele afunda AFUNDA)
    joelho = (cab("LeftLeg") + cab("RightLeg")) / 2
    y_r = joelho.y + ROLO_JOELHO
    C = pele(("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"))
    C = C[(np.abs(C[:, 0]) > X_ROLO) & (np.abs(C[:, 0]) < X_ROLO + COMP_ROLO) & (np.abs(C[:, 1] - y_r) < RAIO_ROLO)]
    z_r = float((C[:, 2] + np.sqrt(RAIO_ROLO ** 2 - (C[:, 1] - y_r) ** 2)).max()) - AFUNDA
    pes = pele(("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"))
    y_torre = float(pes[:, 1].min()) - TORRE_PES
    coxa_dentro = pele(("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"))
    perto = coxa_dentro[np.abs(coxa_dentro[:, 1] - y_r) < 0.06]
    print("ROLOS | joelho (%.4f %.4f %.4f) | eixo dos rolos y %.4f z %.4f | coxa mais perto do meio na altura dos rolos |x| %.3f | "
          "ponta dos pés y %.3f → frente da torre y %.3f" % (*joelho, y_r, z_r, float(np.abs(perto[:, 0]).min()),
                                                              float(pes[:, 1].min()), y_torre), flush=True)

    # ── 2) escápulas: sobem no começo, descem logo no início da puxada e vão pra trás (giro da clavícula em volta dos eixos do tronco) ─
    base_ombro = {L: PB[p3.P + L + "Shoulder"].matrix_basis.copy() for L, _ in LADOS}
    cima0 = (cab("Neck") - cab("Hips")).normalized()
    lado0 = cab("RightShoulder") - cab("LeftShoulder")
    lado0 = (lado0 - cima0 * lado0.dot(cima0)).normalized()
    frente0 = cima0.cross(lado0)

    def perfil(t):
        return p3.lerp(ELEVA0, -DESCE1, _suave(t / ESCAPULA_ATE)), p3.lerp(0.0, RETRAI1, _suave(t / RETRAI_ATE))

    def escapulas(t):
        for L, _ in LADOS:
            PB[p3.P + L + "Shoulder"].matrix_basis = base_ombro[L].copy()
        p3.atualizar()
        sobe, ret = perfil(t)
        for L, s in LADOS:
            if ret:
                p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * ret), 3, cima0))
            if sobe:
                p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * sobe), 3, frente0))

    S_rep = {L: cab(L + "Arm") for L, _ in LADOS}
    for t in (0.0, 1.0):
        escapulas(t)
        jj = ck.posicoes(rig)
        print("ESCÁPULAS t=%.0f | ombro E andou %+.1f mm pra frente, %+.1f mm pra cima, %+.1f mm pra fora | escapula_frente %s mm | "
              "clavícula %s°" % (
                  t, (cab("LeftArm") - S_rep["Left"]).dot(frente0) * 1000, (cab("LeftArm") - S_rep["Left"]).dot(cima0) * 1000,
                  (cab("LeftArm") - S_rep["Left"]).dot(-lado0) * 1000, "/".join("%.0f" % v for v in tc.escapula_frente(jj)),
                  "/".join("%.0f" % v for v in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["Shoulder", "Arm"]}))),
              flush=True)

    # ── 3) a barra (planejada sem a máquina: a roldana entra depois) e as mãos ─────────────────────────────────────────────────────
    barra = e3.barra_puxada("barra_puxada", comprimento=COMPR_BARRA, reto=RETO, dobra=DOBRA, raio=RAIO_BARRA, pegada=PEGADA)
    maos = Maos(bon, RAIO_BARRA, polo_inicial=(0, 0.5, 0), polegar_modo="volta")
    estado, DEDOS = {}, {}
    roldana = [None]                                         # eixo da roldana (Vector) quando já se sabe

    def direcao(B):
        """Direção do cabo saindo do meio da barra B pra roldana (antes dela existir: pra cima)."""
        if roldana[0] is None:
            return Vector((0.0, 0.0, 1.0))
        return e3.Polia(None, None, roldana[0], RAIO_ROLDANA, (0, 1, 0)).direcao(B)

    def por_barra(B):
        u = direcao(B)
        e3.por_acessorio(barra.raiz, B, X, u)
        p3.atualizar()
        return u

    def eixos_tronco():
        return (Vector(v) for v in tc.eixos_tronco(ck.posicoes(rig)))

    def polo(L, s):
        cima, lado, frente = eixos_tronco()
        return cab(L + "Arm") - lado * (s * POLO[0]) - frente * POLO[1] + cima * POLO[2]

    def orientacao(a, f):
        """Dedos ⟂ à barra (eixo a), na direção do antebraço f (o punho não dobra pra frente nem pra trás); palma pra frente (pegada
        pronada: o dorso da mão virado pro rosto)."""
        dq = (f - a * f.dot(a)).normalized()
        pq = a.cross(dq).normalized()
        if pq.y > 0:
            pq = -pq
        return dq, pq

    def maos_na_barra(voltas=4):
        for L, s in LADOS:
            g, a = barra.mundo(s)
            f = estado[L] if L in estado else (g - cab(L + "Arm")).normalized()
            for _ in range(voltas):                # antebraço ↔ orientação da mão (converge em 2–3 voltas)
                dq, pq = orientacao(a, f)
                for n in ("Arm", "ForeArm", "Hand"):   # o IK parte sempre do braço de repouso (cotovelo dobrado pra frente)
                    PB[p3.P + L + n].matrix_basis = Matrix()
                p3.atualizar()
                maos.segurar(L, g, dq, pq, polo=polo(L, s))
                f2 = (cab(L + "Hand") - cab(L + "ForeArm")).normalized()
                pronto = f2.angle(f) < math.radians(0.3)
                f = f2
                if pronto:
                    break
            estado[L] = f
            if L in DEDOS:                          # mão rígida na borracha: os dedos e o polegar fechados no começo, iguais
                for n, M in DEDOS[L].items():
                    PB[n].matrix_basis = M.copy()
                p3.atualizar()

    def torcer():
        """Passa TORCE da torção do antebraço (giro em volta do próprio eixo, o Y do osso) pro osso da mão: o antebraço aponta igual
        e gira menos; a mão fica no mesmo lugar e virada igual (os dedos vão junto com ela)."""
        if not TORCE:
            return
        for L, _ in LADOS:
            pb_f = PB[p3.P + L + "ForeArm"]
            loc, q, esc = pb_f.matrix_basis.decompose()
            tau = 2 * math.atan2(q.y, q.w)                 # torção (swing-twist: q = swing @ twist em volta do Y)
            tau = (tau + math.pi) % (2 * math.pi) - math.pi
            q_sw = q @ Quaternion((math.cos(tau / 2), 0.0, math.sin(tau / 2), 0.0)).inverted()
            fica = tau * (1 - TORCE)
            Mh = PB[p3.P + L + "Hand"].matrix.copy()
            pb_f.matrix_basis = Matrix.LocRotScale(loc, q_sw @ Quaternion((math.cos(fica / 2), 0.0, math.sin(fica / 2), 0.0)), esc)
            p3.atualizar()
            PB[p3.P + L + "Hand"].matrix = Mh
            p3.atualizar()
            torcer.tau[L] = (math.degrees(tau), math.degrees(fica))

    torcer.tau = {}

    def cotovelos():
        j = ck.medir_juntas(rig)
        return j["cotoveloE"], j["cotoveloD"]

    def S_meio():
        return (cab("LeftArm") + cab("RightArm")) / 2

    def acertar_polos():
        for L, _ in LADOS:
            maos.iks[L].mute = False
            e_ = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
            print("polo cotovelo %s erro %.3f ang %d" % (L, *e_), flush=True)

    # vão da mão − punho no referencial da mão (dedos, palma, lado): medido uma vez, com a mão de referência (o Maos põe sempre a
    # mesma), pra conta do braço sem IK no planejamento
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length
    La = (cab("LeftHand") - cab("LeftForeArm")).length
    OFF = {}
    escapulas(0.0)
    for L, s in LADOS:
        Sx = cab(L + "Arm")
        dq_r, pq_r = orientacao(Vector((s, 0.0, 0.0)), Vector((0.0, 0.0, 1.0)))
        g_r = Sx + Vector((s * 0.02, -0.05, 0.50))
        for n in ("Arm", "ForeArm", "Hand"):
            PB[p3.P + L + n].matrix_basis = Matrix()
        p3.atualizar()
        maos.segurar(L, g_r, dq_r, pq_r, polo=polo(L, s))
        off = g_r - cab(L + "Hand")
        OFF[L] = (off.dot(dq_r), off.dot(pq_r), off.dot(dq_r.cross(pq_r)))
        print("MÃO %s | vão − punho %.1f mm ao longo dos dedos, %.1f mm pra palma, %.1f mm de lado | erro do vão %.1f mm | braço %.4f "
              "antebraço %.4f" % (L, OFF[L][0] * 1000, OFF[L][1] * 1000, OFF[L][2] * 1000, maos.erro[L] * 1000, Lb, La), flush=True)

    def punho_de(L, g, a, f):
        dq, pq = orientacao(a, f)
        o = OFF[L]
        return g - (dq * o[0] + pq * o[1] + dq.cross(pq) * o[2])

    def alcance(L, s):
        """Ombro → punho (m) com a mão no meio da pegada do lado s e o braço quase reto (antebraço ≈ na reta ombro → punho)."""
        g, a = barra.mundo(s)
        Sx = cab(L + "Arm")
        f = (g - Sx).normalized()
        for _ in range(4):
            W = punho_de(L, g, a, f)
            f = (W - Sx).normalized()
        return (W - Sx).length

    # começo: a barra DY0 atrás do ponto do fim (B1), na altura que deixa o cotovelo mais esticado dos 2 com COTOVELO0° (conta do braço)
    def comeco(B1):
        escapulas(0.0)
        S = S_meio()
        d0 = math.sqrt(Lb * Lb + La * La + 2 * Lb * La * math.cos(math.radians(COTOVELO0)))
        lo, hi = S.z + 0.20, S.z + 0.90
        for _ in range(30):
            meio = (lo + hi) / 2
            por_barra(Vector((0.0, B1.y + DY0, meio)))
            if max(alcance(L, s) for L, s in LADOS) < d0:
                lo = meio                          # o braço ainda dobra mais que COTOVELO0: a barra sobe
            else:
                hi = meio
        B = Vector((0.0, B1.y + DY0, lo))
        por_barra(B)
        g = (barra.mundo(1)[0] + barra.mundo(-1)[0]) / 2
        print("COMEÇO | barra (%.4f %.4f) | reta ombro → mão %.1f° à frente da vertical (vista de lado)" % (
            B.y, B.z, math.degrees(math.atan2(S.y - g.y, g.z - S.z))), flush=True)
        return B

    def tronco_pts():
        co, _, (nomes, dono) = _malha(bon)
        T = co[_grupo(nomes, dono, ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder"))]
        return T[np.abs(T[:, 0]) < RETO / 2 + 0.01]

    def folga_peito(T, y, z):
        """Barra (superfície, a luva do engate no meio) com o eixo em (y, z) → pele do tronco/pescoço/cabeça (m)."""
        raio_x = np.where(np.abs(T[:, 0]) < 0.036, 0.020, RAIO_BARRA + 0.0012)
        return float((np.hypot(T[:, 1] - y, T[:, 2] - z) - raio_x).min())

    # fim: o eixo da barra DZ1 em relação à articulação dos ombros; na frente, até o cotovelo mais dobrado chegar a COTOVELO1° — sem
    # passar de GAP_MIN da pele do peito (se o braço deixar, a barra para a GAP_MIN do peito)
    def fim():
        escapulas(1.0)
        S = S_meio()
        z1 = S.z + DZ1
        T = tronco_pts()
        lo, hi = S.y - 0.50, S.y + 0.10
        for _ in range(30):
            meio = (lo + hi) / 2
            if folga_peito(T, meio, z1) > GAP_MIN:
                lo = meio                          # longe do peito: a barra vai pra trás (+Y)
            else:
                hi = meio
        y_gap = lo

        def flex(y):
            por_barra(Vector((0.0, y, z1)))
            maos_na_barra()
            return max(cotovelos())

        if flex(y_gap) <= COTOVELO1:
            y1 = y_gap
        else:
            lo, hi = S.y - 0.50, y_gap             # lo: bem na frente (braço esticado); hi: perto do peito (cotovelo dobrado demais)
            for _ in range(18):
                meio = (lo + hi) / 2
                if flex(meio) > COTOVELO1:
                    hi = meio
                else:
                    lo = meio
            y1 = lo
        print("FIM | ombros (%.4f %.4f) | barra z %.4f: encostando (GAP_MIN) em y %.4f, cotovelo %.0f° em y %.4f → y %.4f, folga ao "
              "peito %.1f mm" % (S.y, S.z, z1, y_gap, COTOVELO1, y1 if y1 != y_gap else float("nan"), y1,
                                 folga_peito(T, y1, z1) * 1000), flush=True)
        return Vector((0.0, y1, z1))

    # o caminho da barra: reta de B0 a B1 em z, com um bojo pra frente (−Y) no meio se o rosto pedir
    caminho = {"B0": None, "B1": None, "bojo": 0.0}

    def ponto(t):
        B0, B1 = caminho["B0"], caminho["B1"]
        return Vector((0.0, p3.lerp(B0.y, B1.y, t) - caminho["bojo"] * math.sin(math.pi * t), p3.lerp(B0.z, B1.z, t)))

    extras = [o for o in bpy.data.objects if o.type == "MESH" and o is not bon.corpo and o.parent is rig]

    rosto_pts = {}

    def rosto(t):
        """Pele da cabeça e do pescoço + cabelo, sobrancelhas e olhos (N×3) com as escápulas de t, só a faixa da barra."""
        k = round(t, 3)
        if k not in rosto_pts:
            escapulas(t)
            co, _, (nomes, dono) = _malha(bon)
            P = np.concatenate([co[_grupo(nomes, dono, ("Neck", "Head"))]] + [ck._avaliar_simples(o)[0] for o in extras])
            rosto_pts[k] = P[np.abs(P[:, 0]) < RETO / 2 + 0.01]
        return rosto_pts[k]

    def folgas(P, B, u, saida):
        """Barra, engate e cabo (superfície) → os pontos P (m): a barra como um cilindro ao longo do X (a luva do engate no meio), o
        engate como um tubo de 2 cm de raio do eixo até o começo do cabo e o cabo até a saída da roldana (None: sem cabo)."""
        raio_x = np.where(np.abs(P[:, 0]) < 0.036, 0.020, RAIO_BARRA + 0.0012)
        d_barra = float((np.hypot(P[:, 1] - B.y, P[:, 2] - B.z) - raio_x).min())
        d_eng = float(_dist_segmento(P, B + u * 0.02, B + u * (barra.engate + 0.02)).min()) - 0.020
        d_cabo = 1e9 if saida is None else float(_dist_segmento(P, B + u * barra.engate, saida).min()) - 0.003
        return d_barra, d_eng, d_cabo

    def folga_rosto(t):
        """Barra, engate e cabo → rosto (cabeça, pescoço, cabelo; m) com a barra em ponto(t). O peito fica de fora: a barra chega
        perto dele no fim."""
        B = ponto(t)
        u = direcao(B)
        saida = None
        if roldana[0] is not None:
            saida = e3.Polia(None, None, roldana[0], RAIO_ROLDANA, (0, 1, 0)).tangente(B + u * barra.engate)[0]
        return folgas(rosto(t), B, u, saida)

    def planejar():
        if caminho["B1"] is None:                   # as mãos ficam no reto da barra, no eixo X dela: girar a barra em volta desse
            caminho["B1"] = fim()                   # eixo (o engate seguindo o cabo, que muda com a roldana) não mexe nelas — o
            caminho["B0"] = comeco(caminho["B1"])   # começo e o fim saem iguais com ou sem a roldana (planeja uma vez só)
        caminho["bojo"] = 0.0
        ts = [i / 10 for i in range(11)]
        for _ in range(12):
            piores = [(min(folga_rosto(t)[:2]), t) for t in ts]
            pf, tp = min(piores)
            if pf >= FOLGA_ROSTO or caminho["bojo"] > 0.15:
                break
            caminho["bojo"] += (FOLGA_ROSTO - pf) / max(math.sin(math.pi * tp), 0.3) + 0.002
        pts = [ponto(t) for t in [i / 40 for i in range(41)]]
        return min(p.y for p in pts), pf, tp

    # polo certo do cotovelo, com ele dobrado, antes de medir o cotovelo no planejamento do fim (o IK muda com o polo)
    escapulas(1.0)
    S1 = S_meio()
    por_barra(Vector((0.0, S1.y - 0.30, S1.z + DZ1)))
    maos_na_barra()
    acertar_polos()
    estado.clear()

    y_min, pf, tp = planejar()
    for volta in range(3):                          # a roldana à frente do caminho; com ela, a barra gira e o caminho muda um pouco
        roldana[0] = Vector((0.0, y_min - ROLDANA_FRENTE, Z_ROLDANA))
        y_min, pf, tp = planejar()
        print("CAMINHO volta %d | B0 (%.4f %.4f) B1 (%.4f %.4f) bojo %.1f mm | pior folga barra/engate → rosto %.1f mm em t=%.1f | "
              "roldana y %.4f, caminho mais à frente y %.4f" % (
                  volta, caminho["B0"].y, caminho["B0"].z, caminho["B1"].y, caminho["B1"].z, caminho["bojo"] * 1000, pf * 1000,
                  tp, roldana[0].y, y_min), flush=True)
        if y_min - roldana[0].y >= ROLDANA_FRENTE - 0.002:
            break

    # ── 4) a máquina em volta do corpo ───────────────────────────────────────────────────────────────────────────────────────────
    R = roldana[0]
    est = e3.estacao_puxada("puxada", roldana=(R.y, R.z), assento=(y_frente, y_tras, topo, LARG_ASSENTO, ESP_ASSENTO),
                            rolos=(y_r, z_r, RAIO_ROLO, COMP_ROLO, X_ROLO), torre=y_torre, raio_roldana=RAIO_ROLDANA)
    pol = est.pol

    # ── 5) pose ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
    def pose(t):
        """t=0 braços esticados pra cima segurando o meio da barra, escápulas subidas; t=1 barra na frente da parte de cima do peito,
        cotovelos bem dobrados descendo pra baixo e um pouco pra trás, escápulas descidas e pra trás."""
        if t <= 1e-9:
            estado.clear()                           # o começo não depende do quadro anterior
        escapulas(t)
        B = ponto(t)
        u = pol.direcao(B)
        e3.por_acessorio(barra.raiz, B, X, u)
        pol.ligar(B + u * barra.engate)
        p3.atualizar()
        maos_na_barra()
        torcer()
        pose.B, pose.u = B, u

    pose.B, pose.u = Vector(), Vector((0, 0, 1))
    # polo certo do cotovelo com ele dobrado (fim) e os dedos fechados UMA vez, no começo
    pose(1.0)
    acertar_polos()
    estado.clear()
    pose(0.0)
    pose.dedos = {}
    for L, s in LADOS:
        g, a = barra.mundo(s)
        pose.dedos[L] = pg.fechar_em_volta(bon, L, g, a, RAIO_BARRA)
        DEDOS[L] = {pb.name: pb.matrix_basis.copy() for pb in PB
                    if pb.name[len(p3.P):].startswith(L + "Hand") and pb.name[len(p3.P):] != L + "Hand"}
        print("DEDOS %s | %s" % (L, pose.dedos[L]), flush=True)
    estado.clear()

    # ── 6) medidas do quadro (info) ──────────────────────────────────────────────────────────────────────────────────────────────
    pecas_barra = [o for o in [barra.raiz] + list(barra.raiz.children_recursive) if o.type == "MESH"]

    def maos_fora_da_pegada():
        """Mão × barra FORA da pegada (a checagem ignora o que fica dentro da mão): a menor distância com sinal (− = entrou) da
        superfície da barra, fora de um cilindro de 7 cm de cada lado do meio da mão e 6 mm por fora da borracha, até a pele da mão
        do mesmo lado; mão × cabo (o segmento do engate à saída da roldana) — mm, [E, D]; e mão × mão (a pele de uma até a da
        outra, com sinal) — mm."""
        co, tri, (nomes, dono) = _malha(bon)
        out, bvhs, maos_m = [], {}, {}
        for L, s in LADOS:
            g, a = barra.mundo(s)
            mao = _grupo(nomes, dono, tuple(n for n in nomes if n.startswith(L + "Hand")))
            maos_m[L] = mao
            bvh = ck._bvh(co, tri[mao[tri].all(axis=1)])
            bvhs[L] = bvh
            menor = 1e9
            for o in pecas_barra:
                pts = ck._amostras(*ck._avaliar_simples(o), 0.006)
                d = pts - np.array(g)
                ax = d @ np.array(a)
                rad = np.linalg.norm(d - np.outer(ax, np.array(a)), axis=1)
                pts = pts[~((np.abs(ax) < 0.07) & (rad < RAIO_BARRA + 0.006))]
                lo_, hi_ = co[mao].min(axis=0) - 0.03, co[mao].max(axis=0) + 0.03
                pts = pts[((pts >= lo_) & (pts <= hi_)).all(axis=1)]
                for p in pts:
                    v = Vector(p)
                    loc, nor, idx, dist = bvh.find_nearest(v)
                    if loc is not None:
                        menor = min(menor, -dist if (v - loc).dot(nor) < 0 else dist)
            cabo = float(_dist_segmento(co[mao], pose.B + pose.u * barra.engate, pol.saida).min()) - 0.003
            out.append((menor * 1000, cabo * 1000))
        mm = 1e9
        for p in co[maos_m["Left"]]:
            v = Vector(p)
            loc, nor, idx, dist = bvhs["Right"].find_nearest(v)
            if loc is not None:
                mm = min(mm, -dist if (v - loc).dot(nor) < 0 else dist)
        return out, mm * 1000

    def info():
        jj = ck.posicoes(rig)
        jt = ck.medir_juntas(rig)
        fr = folga_rosto_agora()
        fm, mm_maos = maos_fora_da_pegada()
        cabo_v = math.degrees(pose.u.angle(Vector((0, 0, 1))))
        fp = folga_peito(tronco_pts(), pose.B.y, pose.B.z)
        return ("barra (%.3f %.3f) | cabo %.1f° da vertical, %.3f m | barra → peito/tronco %.0f mm | barra → rosto %.0f mm, engate → "
                "rosto %.0f mm, cabo → rosto %.0f mm | cotovelo %.0f/%.0f° | elevação %s° | braço à frente %s° | abertura %s° | "
                "cotovelo × tronco %s° | antebraço × vertical %s° | punho %.0f/%.0f° (flexão %s) | palma × frente %s° | pegada %.2f | "
                "escápula %s mm, clavícula %s° | tronco %.1f° | coluna %.1f° | cabeça %s° | mão × barra fora da pegada E %.1f D %.1f mm | "
                "mão × cabo E %.0f D %.0f mm | mão × mão %.0f mm | torção do antebraço E %.0f→%.0f° D %.0f→%.0f° | %s" % (
                    pose.B.y, pose.B.z, cabo_v, pol.comprimento, fp * 1000, fr[0] * 1000, fr[1] * 1000, fr[2] * 1000,
                    jt["cotoveloE"], jt["cotoveloD"], "/".join("%.0f" % v for v in tc.braco_elevacao(jj)),
                    "/".join("%.0f" % v for v in tc.braco_frente(jj)), "/".join("%.0f" % v for v in tc.braco_abertura(jj)),
                    "/".join("%.0f" % v for v in tc.cotovelo_tronco(jj)),
                    "/".join("%.0f" % v for v in tc.antebraco_vertical(jj)), jt["punhoE"], jt["punhoD"],
                    "/".join("%+.0f" % v for v in tc.punho_flexao(jj)), "/".join("%.0f" % v for v in tc.palma_frente(jj)),
                    tc.pegada_largura(jj)[0], "/".join("%.0f" % v for v in tc.escapula_frente(jj)),
                    "/".join("%.0f" % v for v in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["Shoulder", "Arm"]})),
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    tc.coluna(jj)[0], "/".join("%.0f" % v for v in tc.cabeca_tronco(jj)), fm[0][0], fm[1][0], fm[0][1], fm[1][1],
                    mm_maos, *torcer.tau.get("Left", (0, 0)), *torcer.tau.get("Right", (0, 0)), maos.info()))

    def folga_rosto_agora():
        """folga_rosto do quadro atual, sem mexer na pose (barra e escápulas já no lugar)."""
        co, _, (nomes, dono) = _malha(bon)
        P = np.concatenate([co[_grupo(nomes, dono, ("Neck", "Head"))]] + [ck._avaliar_simples(o)[0] for o in extras])
        return folgas(P[np.abs(P[:, 0]) < RETO / 2 + 0.01], pose.B, pose.u, pol.saida)

    print("MÁQUINA | roldana (y %.4f z %.4f) | assento topo %.3f | rolos y %.3f z %.3f | torre y %.3f | pegada a %.3f m do meio "
          "(no reto, %.0f mm antes da dobra)" % (R.y, R.z, topo, y_r, z_r, y_torre, PEGADA, (RETO / 2 - PEGADA) * 1000), flush=True)
    for t in (0.0, 0.25, 0.5, 0.75, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(barra.pegadores[s], RAIO_BARRA, barra.meia)) for L, s in LADOS]
    yq = float(H.y)
    return Cena(pose, est.equipamentos + [barra.raiz], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.2, 1.2),
                camera_video=((3.0, yq + 2.9, 1.9), (0, yq - 0.2, 1.15), 45), info=info, apoios=est.apoios, afunda_apoio_mm=20)
