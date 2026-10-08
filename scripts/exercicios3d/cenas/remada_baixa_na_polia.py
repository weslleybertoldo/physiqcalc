# Remada Baixa na Polia — cena da fábrica 3D (lote 6, 08/10/2026; dos treinos prontos do app). Peças novas: equip3d.banco_remada_baixa
# (o banco da estação de remada baixa: assento comprido + 2 chapas inclinadas pros pés, com o vão do cabo no meio) e
# equip3d.triangulo_polia (o triângulo: puxador em V de pegada neutra fechada), com a polia() de sempre — a roldana BAIXA, na frente
# dos pés, logo acima das chapas.
# t = 0 braços esticados pra frente e um pouco pra baixo, segurando o triângulo acima dos joelhos, com as escápulas abertas (ombros
# levados pra frente) · t = 1 o triângulo no alto do abdômen, os cotovelos dobrados, junto do corpo e na linha das costas, as escápulas
# fechadas (pra trás e um pouco pra baixo).
# Técnica (a dica do app: "Coluna neutra e tronco quase fixo. Puxe até o abdômen levando o cotovelo para trás e volte alongando as
# escápulas para a frente."): ExRx, Cable Straight Back Seated Row: "Sit slightly forward on bench with feet on foot bar or vertical
# platform. Grasp close grip cable attachment. Straighten torso upright and slide hips back so knees are slightly bent." / "Pull cable
# attachment to waist. Pull shoulders back and lift chest by arching back. Return until arms are extended, back is straight, and
# shoulders are stretched forward." NSCA (Low-pulley seated row, no resumo do Achievable CSCS): "Sit on the pad with your feet on the
# supports and your legs parallel." / "Grasp the handles with a closed grip (neutral or pronated)." / "Sit upright with your knees
# slightly flexed and your arms fully extended." / "Pull the handles toward your abdomen without jerking your torso." / "Keep a slight
# bend in your knees and maintain an upright torso." / "Maintain the same posture throughout." ACE (Seated Row, cabo/elástico): "Use a
# seated pulley cable machine and a narrow handle" / "maintain a straight back" / "lift the chest while slowly pulling the elbows
# backwards close to the rib cage until the handle touches the front of the stomach". Ronai 2019 (ACSM's Health & Fitness Journal,
# Do It Right: The Seated Cable Row Exercise): "Feet are placed firmly in a shoulder width position against the foot plates with the
# knees comfortably flexed." / "Handlebars are grasped below shoulder height with a narrower than shoulder width, closed, neutral
# (midpronated) grip. Elbows are fully extended, roughly parallel with the ground, and the handlebar remains just above the
# knees/legs." / "The torso remains perpendicular/vertical with the floor." / "To prevent excessive stress on anterior shoulder joint
# structures, the upper arm and elbows should not pass behind the back of the rib cage" / "pull the bar into the lower chest or upper
# abdomen" / "keep the trunk motionless". O ExRx da versão com a coluna articulando (Cable Seated Row: "lower back is flexed forward" na
# volta) é outra variação: a dica pede o tronco quase fixo, como o ExRx de costas retas, a NSCA, a ACE e o Ronai.
# Como o rig faz: sentado no assento comprido com o tronco em pé (TRONCO°), as coxas quase na horizontal (COXA° pra cima), um pouco
# abertas, os joelhos dobrados JOELHO° e as solas chapadas nas chapas inclinadas a 30° da vertical, os tornozelos a ±X_TORNOZELO (pés
# um pouco mais abertos que o quadril, as pernas paralelas); tronco, quadril, pernas, pés e cabeça não mexem. As escápulas giram
# (clavícula em volta do eixo do tronco) de abertas pra frente (t=0) a fechadas pra trás e um pouco pra baixo (t=1). No começo o braço
# fica BRACO0° abaixo da horizontal, quase esticado (COTOVELO0°), com as mãos no triângulo (os pegadores a 14 cm um do outro); no fim o
# braço fica FRENTE1° atrás da vertical do tronco e ABRE1° pro lado, com o antebraço ANTEBRACO1° da horizontal (− = a mão abaixo do
# cotovelo). O meio do triângulo anda em linha reta do começo pro fim; a cada quadro os pegadores ficam ⟂ aos antebraços (o punho reto:
# os 2 antebraços convergem igual pro triângulo) e o mosquetão gira no furo da chapa até a linha do cabo (equip3d.Triangulo.por); as
# mãos vão nos pegadores pelo IK do braço, com o polo do cotovelo andando em linha reta (relativo ao ombro) do polo do começo pro do fim,
# e ficam rígidas neles (os dedos e o polegar fecham uma vez, no começo). A roldana fica parada a Z_RODA do chão, Y_RODA à frente das
# chapas: a roldana de baixo da estação, logo acima dos pés, como na Skelcore Power Series Cable Low Row e na Gymleco 210 (desenho e foto
# dos fabricantes).
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from maos3d import Maos
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
TRONCO = 0.0              # tronco na vertical ("Sit upright", NSCA; "torso remains perpendicular/vertical with the floor", Ronai)
COXA = 3.0                # coxas 3° acima da horizontal (o joelho um pouco acima do quadril)
JOELHO = 30.0             # joelhos levemente dobrados ("knees slightly flexed", NSCA; "knees slightly bent", ExRx)
X_TORNOZELO = 0.17        # tornozelos a ±17 cm (quadris a ±10,6; ombros a ±20): "shoulder width position against the foot plates"
                          # (Ronai), as pernas paralelas (NSCA) e as coxas sem encostar uma na outra
APOIO_ANG = 30.0          # chapas a 30° da vertical (Valor BD-71: "The solid plate sits at a 30 degree angle")
TOPO = 0.44               # topo do assento: o do banco() da fábrica
ESP_ASSENTO, LARG_ASSENTO = 0.06, 0.30    # estofado de 60 mm e 30 cm de largura (o banco() da fábrica)
COMP_ASSENTO = 0.97       # assento comprido: Legend 906, "The deep 38.25-inch seat"
FRENTE_ASSENTO = 0.22     # o assento vai até 22 cm à frente do quadril (embaixo das coxas; o resto fica atrás)
AFUNDA = 0.002            # pele afundando no estofado
AFUNDA_PE = 0.0005        # sola apertando a chapa
CHAPA = (0.16, 0.30, 0.012)   # chapa de cada pé: 16 × 30 cm (Ironmaster: 15 cm de largura; Gymleco 210: "Large footplate"), 12 mm
BRACO0 = 20.0             # começo: braço 20° abaixo da horizontal ("roughly parallel with the ground", "grasped below shoulder height", Ronai)
COTOVELO0 = 9.0           # começo: cotovelo dobrado 9°, esticado sem travar ("arms fully extended", NSCA)
FRENTE1 = -20.0           # fim: braço 20° atrás da vertical do tronco (o cotovelo vai pra trás sem passar muito da linha das costas: Ronai)
ABRE1 = 18.0              # fim: braço 18° pro lado ("pulling the elbows backwards close to the rib cage", ACE)
ANTEBRACO1 = 5.0          # fim: antebraço 5° acima da horizontal (o triângulo no alto do abdômen: "until the handle touches the front of
                          # the stomach", ACE; "pull the bar into the lower chest or upper abdomen", Ronai)
PROTRAI = 8.0             # escápulas abertas no começo ("shoulders are stretched forward", ExRx; "alongando as escápulas para a frente", dica)
RETRAI, DESCE = 8.0, 2.0  # escápulas fechadas no fim ("Pull shoulders back", ExRx; "retracting the scapulae", Ronai)
RAIO = 0.015              # pegador do triângulo: 30 mm (Corength: "Handle diameter: 30 mm")
Y_RODA = 0.30             # roldana 30 cm à frente do meio das chapas (a base da polia não encosta na estrutura delas)
Z_RODA = 0.60             # eixo da roldana a 60 cm do chão: logo acima das chapas (o cabo passa por cima dos pés)


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _dist_segmento(Q, a, b):
    """Distância (m) de cada ponto de Q (N×3) ao segmento a–b."""
    a, b = np.array(a), np.array(b)
    d = b - a
    s = np.clip(((Q - a) @ d) / max(d @ d, 1e-12), 0.0, 1.0)
    return np.linalg.norm(Q - (a + np.outer(s, d)), axis=1)


def montar(bon):
    pg.usar_cilindro(RAIO * 2000)     # mão de referência do pegador de 30 mm (antes do Maos)
    pg.usar_polegar("volta")          # polegar dando a volta no pegador (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    # ── 1) sentado: tronco em pé, coxas quase na horizontal, joelhos levemente dobrados, pés pra cima nas chapas ──────────────────
    PERNA = ("Hips",) + tuple(L + o for L, _ in LADOS for o in ("UpLeg", "Leg", "Foot", "ToeBase"))
    repouso = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNA}
    pivo0 = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    pe_rep = {L: p3.mundo_osso(rig, L + "Foot").to_3x3().normalized() for L, _ in LADOS}   # sola chapada no chão (repouso)
    t_rep = cab("Neck") - cab("Hips")
    frente_rep = math.degrees(math.atan2(-t_rep.y, t_rep.z))
    coxa_l = (cab("LeftLeg") - cab("LeftUpLeg")).length
    canela_l = (cab("LeftFoot") - cab("LeftLeg")).length
    x_quadril = cab("LeftUpLeg").x
    a_ap = math.radians(APOIO_ANG)
    nrm = Vector((0.0, math.cos(a_ap), math.sin(a_ap)))         # normal da face das chapas (pra quem senta e pra cima)
    sobe = Vector((0.0, -math.sin(a_ap), math.cos(a_ap)))       # ao longo da chapa, pra cima
    # abertura da perna (vista de cima) que põe o tornozelo em ±X_TORNOZELO: a perna fica num plano vertical girado em Z
    alcance = coxa_l * math.cos(math.radians(COXA)) + canela_l * math.cos(math.radians(JOELHO - COXA))
    ABRE_PERNA = math.degrees(math.asin((X_TORNOZELO - x_quadril) / alcance))
    R_chapa = Matrix.Rotation(math.radians(APOIO_ANG - 90.0), 3, "X")     # sola do chão → sola na chapa (ponta pra cima)

    def direcao(s, elev):
        a, e = math.radians(ABRE_PERNA), math.radians(elev)
        return Vector((s * math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))

    giro_pe = {L: 0.0 for L, _ in LADOS}

    def sentar():
        for n, M in repouso.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(TRONCO - frente_rep), pivo=pivo0)
        for L, s in LADOS:
            h, k = cab(L + "UpLeg"), cab(L + "Leg")
            p3.girar_osso(rig, L + "UpLeg", (k - h).rotation_difference(direcao(s, COXA)).to_matrix())
            k, a = cab(L + "Leg"), cab(L + "Foot")
            p3.girar_osso(rig, L + "Leg", (a - k).rotation_difference(direcao(s, COXA - JOELHO)).to_matrix())
            F = p3.mundo_osso(rig, L + "Foot").to_3x3().normalized()
            eixo_j = direcao(s, 0.0).cross(Vector((0, 0, 1))).normalized()     # eixo de dobra do tornozelo (de lado)
            alvo = Matrix.Rotation(giro_pe[L], 3, eixo_j) @ R_chapa @ pe_rep[L]
            p3.girar_osso(rig, L + "Foot", alvo @ F.inverted())

    def pisada(L):
        """Calcanhar − ponta (m, ao longo da normal da chapa): > 0 = a ponta do pé afunda mais que o calcanhar."""
        cal = pele((L + "Foot",)) @ np.array(nrm)
        pon = pele((L + "ToeBase",)) @ np.array(nrm)
        return float(cal.min() - pon.min())

    sentar()
    for L, s in LADOS:                       # sola chapada: calcanhar e planta afundam igual na chapa
        for _ in range(6):
            dif = pisada(L)
            if abs(dif) < 0.0003:
                break
            giro_pe[L] += math.atan2(dif, 0.17) * (1 if s > 0 else -1)
            sentar()
            if abs(pisada(L)) > abs(dif):
                giro_pe[L] -= 2 * math.atan2(dif, 0.17) * (1 if s > 0 else -1)
                sentar()
        print("PÉ %s | calcanhar − ponta %.1f mm | pé girado %.1f°" % (L, pisada(L) * 1000, math.degrees(giro_pe[L])), flush=True)
    # altura: o glúteo (a pele mais baixa no pedaço do assento) afunda AFUNDA no estofado com o topo em TOPO
    H0 = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    y_frente = H0.y - FRENTE_ASSENTO
    y_tras = y_frente + COMP_ASSENTO
    G = pele(("Hips", "LeftUpLeg", "RightUpLeg"))
    G = G[(np.abs(G[:, 0]) < LARG_ASSENTO / 2) & (G[:, 1] > y_frente) & (G[:, 1] < y_tras)]
    sobe_z = TOPO - AFUNDA - float(G[:, 2].min())
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, sobe_z)))
    H = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    tt = cab("Neck") - cab("Hips")
    jt = ck.medir_juntas(rig)
    print("SENTADO | tronco %.1f° (repouso %.1f°) | quadril (%.4f %.4f %.4f) | joelho %.0f/%.0f° | quadril %.0f/%.0f° | abertura "
          "da perna %.1f° | assento topo %.3f, y %.3f → %.3f" % (
              math.degrees(math.atan2(-tt.y, tt.z)), frente_rep, *H, jt["joelhoE"], jt["joelhoD"], jt["quadrilE"], jt["quadrilD"],
              ABRE_PERNA, TOPO, y_frente, y_tras), flush=True)

    # ── 2) chapas dos pés: a face de cada uma na sola (a planta afunda AFUNDA_PE), no meio do pé ao longo dela ──────────────────────
    chapas = {}
    for L, s in LADOS:
        P = pele((L + "Foot", L + "ToeBase"))
        dn = P @ np.array(nrm)
        F_ = float(dn.min()) + AFUNDA_PE
        sola = P[dn < F_ + 0.02]                     # a pele da sola (perto da chapa)
        su = sola @ np.array(sobe)
        meio = sola.mean(axis=0)
        C = Vector(meio) - nrm * (float(Vector(meio).dot(nrm)) - F_)
        C = C + sobe * (float((su.min() + su.max()) / 2) - C.dot(sobe))
        C.x = float(sola[:, 0].mean())
        chapas[s] = C
        print("CHAPA %s | face (%.4f %.4f %.4f) | sola de %.3f a %.3f ao longo dela (%.0f mm) | calcanhar z %.3f" % (
            L, *C, su.min() - C.dot(sobe), su.max() - C.dot(sobe), (su.max() - su.min()) * 1000, float(P[:, 2].min())), flush=True)
    for L, _ in LADOS:                       # pro close dos pés (o exportar_exercicio.py põe z = 0,05: pé no chão)
        meio = (cab(L + "Foot") + cab(L + "ToeBase")) / 2
        print("PÉ MEIO %s (%.4f %.4f %.4f)" % (L, *meio), flush=True)
    bc = e3.banco_remada_baixa("remada_baixa", assento=(y_frente, y_tras, TOPO, LARG_ASSENTO, ESP_ASSENTO),
                               chapas={s: tuple(C) for s, C in chapas.items()}, angulo=APOIO_ANG, chapa=CHAPA)

    # ── 3) escápulas: clavícula girando em volta do eixo do tronco (pra frente = abre, pra trás = fecha) e um pouco pra baixo ───────
    base_ombro = {L: PB[p3.P + L + "Shoulder"].matrix_basis.copy() for L, _ in LADOS}
    cima0 = (cab("Neck") - cab("Hips")).normalized()
    lado0 = cab("RightShoulder") - cab("LeftShoulder")
    lado0 = (lado0 - cima0 * lado0.dot(cima0)).normalized()
    frente0 = cima0.cross(lado0)

    def escapulas(t):
        for L, _ in LADOS:
            PB[p3.P + L + "Shoulder"].matrix_basis = base_ombro[L].copy()
        p3.atualizar()
        ret, des = p3.lerp(-PROTRAI, RETRAI, t), p3.lerp(0.0, DESCE, t)
        for L, s in LADOS:
            if ret:
                p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * ret), 3, cima0))
            if des:
                p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(-s * des), 3, frente0))

    S_rep = {L: cab(L + "Arm") for L, _ in LADOS}
    for t in (0.0, 1.0):
        escapulas(t)
        jj = ck.posicoes(rig)
        print("ESCÁPULAS t=%.0f | ombro E andou %+.1f mm pra frente, %+.1f mm pra cima | escapula_frente %s mm" % (
            t, (cab("LeftArm") - S_rep["Left"]).dot(frente0) * 1000, (cab("LeftArm") - S_rep["Left"]).dot(cima0) * 1000,
            "/".join("%.0f" % v for v in tc.escapula_frente(jj))), flush=True)

    # ── 4) mãos: o vão da mão em relação ao punho, no referencial da mão (dedos, palma) ───────────────────────────────────────────
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length
    La = (cab("LeftHand") - cab("LeftForeArm")).length
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")
    tri = e3.triangulo_polia("triangulo", raio=RAIO)
    X_VAO = tri.entre / 2

    def mao_no(u, s, f_):
        """Dedos (o antebraço f_ tirado o que ele tem ao longo do pegador u) e palma (pro meio) da mão do lado s."""
        dq = (f_ - u * f_.dot(u)).normalized()
        return dq, (dq.cross(u) * s).normalized()

    OFF = {}
    escapulas(0.0)
    for L, s in LADOS:
        u_r = Vector((0, 0, 1))
        dq_r, pq_r = mao_no(u_r, s, Vector((0, -1, 0)))
        g_r = cab(L + "Arm") + Vector((-s * 0.10, -0.50, -0.10))
        maos.segurar(L, g_r, dq_r, pq_r, polo=cab(L + "Arm") + Vector((s * 0.3, 0.3, -0.6)))
        off = g_r - cab(L + "Hand")
        OFF[L] = (off.dot(dq_r), off.dot(pq_r), off.dot(dq_r.cross(pq_r)))
        print("MÃO %s | vão − punho %.1f mm ao longo dos dedos, %.1f mm pra palma, %.1f mm de lado | erro do vão %.1f mm" % (
            L, OFF[L][0] * 1000, OFF[L][1] * 1000, OFF[L][2] * 1000, maos.erro[L] * 1000), flush=True)

    def vao_menos_punho(L, dq, pq):
        o = OFF[L]
        return dq * o[0] + pq * o[1] + dq.cross(pq) * o[2]

    def eixos_tronco():
        return (Vector(v) for v in tc.eixos_tronco(ck.posicoes(rig)))

    def pegador_no(f_):
        """Eixo dos pegadores (pra cima), no plano vertical do meio, ⟂ ao antebraço f_ visto de lado (o punho reto: os 2 antebraços
        convergem pro meio igual, então os 2 ficam ⟂ ao mesmo eixo)."""
        fs = Vector((0.0, f_.y, f_.z)).normalized()
        u = Vector((0, 0, 1)) - fs * fs.z
        return u.normalized()

    def comeco(L, s):
        """Começo: o braço BRACO0° abaixo da horizontal, o cotovelo dobrado COTOVELO0° (pra baixo) e o vão da mão em x = s·X_VAO.
        Devolve o vão, o cotovelo, o punho, o antebraço e o eixo do pegador."""
        Sx = cab(L + "Arm")
        p = math.radians(BRACO0)
        q = math.radians(BRACO0 - COTOVELO0)

        def montar_lat(lat):
            b = Vector((s * math.sin(lat) * math.cos(p), -math.cos(lat) * math.cos(p), -math.sin(p)))
            f_ = Vector((s * math.sin(lat) * math.cos(q), -math.cos(lat) * math.cos(q), -math.sin(q)))
            E = Sx + b * Lb
            W = E + f_ * La
            u = pegador_no(f_)
            dq, pq = mao_no(u, s, f_)
            return W + vao_menos_punho(L, dq, pq), E, W, f_, u

        lo, hi = math.radians(-40), math.radians(20)
        for _ in range(40):
            meio = (lo + hi) / 2
            if s * montar_lat(meio)[0].x < X_VAO:
                lo = meio
            else:
                hi = meio
        return montar_lat((lo + hi) / 2)

    def fim(L, s):
        """Fim: o braço FRENTE1° atrás da vertical do tronco e ABRE1° pro lado; o antebraço ANTEBRACO1° da horizontal, virado pra
        dentro o que precisa pra o vão da mão ficar em x = s·X_VAO."""
        Sx = cab(L + "Arm")
        cima, lado, frente = eixos_tronco()
        fora = -lado * s
        bf, ab = math.radians(FRENTE1), math.radians(ABRE1)
        b = fora * math.sin(ab) + (-cima * math.cos(bf) + frente * math.sin(bf)) * math.cos(ab)
        E = Sx + b * Lb
        g1 = math.radians(ANTEBRACO1)

        def montar_h(h):
            f_ = Vector((s * math.sin(h) * math.cos(g1), -math.cos(h) * math.cos(g1), math.sin(g1)))
            W = E + f_ * La
            u = pegador_no(f_)
            dq, pq = mao_no(u, s, f_)
            return W + vao_menos_punho(L, dq, pq), E, W, f_, u

        lo, hi = math.radians(-80), math.radians(40)
        for _ in range(40):
            meio = (lo + hi) / 2
            if s * montar_h(meio)[0].x < X_VAO:
                lo = meio
            else:
                hi = meio
        return montar_h((lo + hi) / 2)

    # ── 5) a roldana (baixa, na frente das chapas, logo acima delas) e o caminho do meio do triângulo ─────────────────────────────
    y_ch = sum(C.y for C in chapas.values()) / 2
    y_rold = y_ch - Y_RODA
    pol = e3.polia("polia", x=0.0, y=y_rold, altura=Z_RODA, frente=(0, 1, 0))
    escapulas(0.0)
    G0 = {L: comeco(L, s) for L, s in LADOS}
    c0 = (G0["Left"][0] + G0["Right"][0]) / 2
    escapulas(1.0)
    G1 = {L: fim(L, s) for L, s in LADOS}
    c1 = (G1["Left"][0] + G1["Right"][0]) / 2
    for nome, c, G in (("COMEÇO", c0, G0), ("FIM", c1, G1)):
        d = pol.direcao(c)
        print("%s | meio do triângulo (%.4f %.4f %.4f) = %.0f mm acima do quadril | cabo %.1f° abaixo da horizontal | antebraço E "
              "%.1f° da horizontal (o mosquetão gira %.1f° no furo) | vão E (%.3f %.3f %.3f) | cotovelo E (%.3f %.3f %.3f)" % (
                  nome, *c, (c.z - H.z) * 1000, math.degrees(math.asin(-d.z)), math.degrees(math.asin(G["Left"][3].z)),
                  math.degrees(math.asin(-d.z)) + math.degrees(math.asin(G["Left"][3].z)), *G["Left"][0], *G["Left"][1]),
              flush=True)
    print("POLIA | roldana y %.3f z %.3f | chapas y %.3f" % (y_rold, Z_RODA, y_ch), flush=True)

    # ── 6) pose: o meio do triângulo anda em linha reta; os pegadores ficam ⟂ aos antebraços (punho reto) e o mosquetão gira no
    #    furo até a linha do cabo; as mãos fecham nos pegadores ──────────────────────────────────────────────────────────────────
    def circulo(Sx, W):
        d = W - Sx
        u = d.normalized()
        a = (Lb ** 2 - La ** 2 + d.length_squared) / (2 * d.length)
        return Sx + u * a, u, math.sqrt(max(Lb ** 2 - a * a, 1e-8))

    POLO = {}
    for L, s in LADOS:
        rel = []
        for t_, Gx in ((0.0, G0[L]), (1.0, G1[L])):
            escapulas(t_)
            Sx = cab(L + "Arm")
            g, E, W, f_, u_ = Gx
            Cc, uu, rho = circulo(Sx, W)
            v = E - Cc
            rel.append(E + (v - uu * v.dot(uu)).normalized() * 0.5 - Sx)
        POLO[L] = rel

    estado = {}

    def pose(t):
        """t=0 braços esticados, escápulas abertas; t=1 o triângulo no alto do abdômen, cotovelos atrás, escápulas fechadas."""
        if t <= 1e-9:
            estado.clear()
        escapulas(t)
        c = c0.lerp(c1, t)
        fs = {L: estado.get(L, G0[L][3].lerp(G1[L][3], t).normalized()) for L, _ in LADOS}
        for volta in range(2):                 # antebraços de verdade → eixo dos pegadores ⟂ a eles → IK
            u = pegador_no((fs["Left"] + fs["Right"]) / 2)
            for L, s in LADOS:
                Sx = cab(L + "Arm")
                polo = Sx + POLO[L][0].lerp(POLO[L][1], t)
                g = c + Vector((s * X_VAO, 0.0, 0.0))
                dq, pq = mao_no(u, s, fs[L])
                maos.segurar(L, g, dq, pq, polo=polo)
                fs[L] = (cab(L + "Hand") - cab(L + "ForeArm")).normalized()
        u = pegador_no((fs["Left"] + fs["Right"]) / 2)
        estado.update(fs)
        eng = tri.por(c, u, pol.direcao)
        pol.ligar(eng)
        p3.atualizar()
        for L, s in LADOS:                     # dedos e polegar: fechados UMA vez (no começo) e iguais em todo quadro — a mão fica
            if L in DEDOS:                     # sempre igual em volta do pegador (vão no eixo, dedos ⟂ a ele), então a pele encosta
                for n, M in DEDOS[L].items():  # igual (mão rígida no pegador, como na Remada Fechada na Máquina)
                    PB[n].matrix_basis = M.copy()
            else:
                g = tri.pegadores[s].matrix_world.to_translation()
                pose.dedos[L] = pg.fechar_em_volta(bon, L, g, u, RAIO)
        p3.atualizar()

    DEDOS = {}
    pose.dedos = {}
    pose(1.0)                                  # polo certo do cotovelo com ele bem dobrado (fim)
    for L, _ in LADOS:
        maos.iks[L].mute = False
        e_ = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
        print("polo cotovelo %s erro %.3f ang %d" % (L, *e_), flush=True)
    estado.clear()
    pose(0.0)                                  # os dedos e o polegar fecham no começo e ficam assim
    for L, _ in LADOS:
        DEDOS[L] = {pb.name: pb.matrix_basis.copy() for pb in PB
                    if pb.name[len(p3.P):].startswith(L + "Hand") and pb.name[len(p3.P):] != L + "Hand"}
        print("DEDOS %s | %s" % (L, pose.dedos[L]), flush=True)

    # pontos do corpo pra medir as folgas (o corpo de baixo não mexe; o tronco também não)
    co_, _, (nomes_, dono_) = _malha(bon)
    pernas_pts = co_[_grupo(nomes_, dono_, ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot",
                                              "LeftToeBase", "RightToeBase"))]
    tronco_pts = co_[_grupo(nomes_, dono_, ("Hips", "Spine", "Spine1", "Spine2"))]
    PEGA = ("triangulo_pegada+1", "triangulo_pegada-1")

    def folgas_maos():
        """Mão × triângulo fora dos pegadores (hastes, chapa, tampas, mosquetão) e mão × cabo, mm (− = entrou)."""
        co, tri_, (nomes, dono) = _malha(bon)
        bvh = ck._bvh(co, tri_)
        mao = _grupo(nomes, dono, tuple(n for n in nomes if n.startswith(("LeftHand", "RightHand"))))
        Pm = co[mao]
        menor_t, onde = 1e9, ""
        for ob in ck._malhas(tri.raiz) + ck._malhas(tri.engate):
            if ob.name in PEGA:
                continue
            eco, etri = ck._avaliar_simples(ob)
            for p in ck._amostras(eco, etri, 0.004):
                v = Vector(p)
                loc, nor, idx, dist = bvh.find_nearest(v)
                if loc is None or not mao[tri_[idx][0]]:
                    continue
                d_ = -dist if (v - loc).dot(nor) < 0 else dist
                if d_ < menor_t:
                    menor_t, onde = d_, ob.name
        A = pol.saida + (pol.cabo.matrix_world.to_3x3() @ Vector((0, 0, 1))).normalized() * pol.comprimento
        cabo_m = float(_dist_segmento(Pm, pol.saida, A).min()) - 0.003
        return menor_t * 1000, onde, cabo_m * 1000

    def folgas_corpo():
        A = pol.saida + (pol.cabo.matrix_world.to_3x3() @ Vector((0, 0, 1))).normalized() * pol.comprimento
        cabo_p = float(_dist_segmento(pernas_pts, pol.saida, A).min()) - 0.003
        cabo_t = float(_dist_segmento(tronco_pts, pol.saida, A).min()) - 0.003
        co, tri_, (nomes, dono) = _malha(bon)
        tronco = _grupo(nomes, dono, ("Hips", "Spine", "Spine1", "Spine2"))
        coxas = _grupo(nomes, dono, ("LeftUpLeg", "RightUpLeg"))
        maos_ = _grupo(nomes, dono, tuple(n for n in nomes if n.startswith(("LeftHand", "RightHand"))))
        bvh_t = ck._bvh(co, tri_[tronco[tri_].all(axis=1)])
        mt = 1e9
        for v in co[maos_]:
            loc, nor, idx, dist = bvh_t.find_nearest(Vector(v))
            if loc is not None:
                mt = min(mt, -dist if (dist < 0.03 and (Vector(v) - loc).dot(nor) < 0) else dist)
        antebr = _grupo(nomes, dono, ("LeftForeArm", "RightForeArm"))
        ma, onde_a = 1e9, None
        for v in co[antebr]:
            loc, nor, idx, dist = bvh_t.find_nearest(Vector(v))
            if loc is not None:
                d_ = -dist if (dist < 0.03 and (Vector(v) - loc).dot(nor) < 0) else dist
                if d_ < ma:
                    ma, onde_a = d_, Vector(v)
        folgas_corpo.antebraco = (ma * 1000, onde_a)
        bvh_c = ck._bvh(co, tri_[coxas[tri_].all(axis=1)])
        tc_ = 1e9
        for ob in ck._malhas(tri.raiz):
            eco, etri = ck._avaliar_simples(ob)
            for v in eco:
                loc, nor, idx, dist = bvh_c.find_nearest(Vector(v))
                if loc is not None:
                    tc_ = min(tc_, -dist if (dist < 0.03 and (Vector(v) - loc).dot(nor) < 0) else dist)
        return cabo_p * 1000, cabo_t * 1000, mt * 1000, tc_ * 1000

    def info():
        jj = ck.posicoes(rig)
        jt = ck.medir_juntas(rig)
        c = tri.raiz.matrix_world.to_translation()
        ft, onde, fc = folgas_maos()
        fp, ftr, fmt, ftc = folgas_corpo()
        dev = []
        u = (tri.raiz.matrix_world.to_3x3() @ Vector((1, 0, 0))).normalized()
        for L, s in LADOS:
            fa = (Vector(jj[L + "Hand"]) - Vector(jj[L + "ForeArm"])).normalized()
            dev.append(90.0 - math.degrees(fa.angle(u)))
        return ("triângulo (%.3f %.3f %.3f) | cabo %.1f° | cotovelo %.0f/%.0f° | abertura %s° | braço × tronco %s° | antebraço × "
                "horizontal %s° | pegador × antebraço %s° | punho %.0f/%.0f° | palma pro meio %s° | pegada %.2f | escápula %s mm | "
                "tronco %.1f° | coluna %.1f° | mão × triângulo fora da pegada %.1f mm (%s) | mão × cabo %.0f mm | cabo × pernas %.0f "
                "mm | cabo × tronco %.0f mm | mãos × tronco %.1f mm | antebraços × tronco %.1f mm em (%.3f %.3f %.3f) | triângulo × coxas %.1f "
                "mm | %s" % (
                    *c, math.degrees(math.asin(-pol.direcao(c).z)), jt["cotoveloE"], jt["cotoveloD"],
                    "/".join("%.0f" % v for v in tc.cotovelo_tronco(jj)), "/".join("%.0f" % v for v in tc.braco_frente(jj)),
                    "/".join("%.0f" % v for v in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["ForeArm", "Hand"]})),
                    "/".join("%+.1f" % v for v in dev), jt["punhoE"], jt["punhoD"],
                    "/".join("%.0f" % v for v in tc.palma_dentro(jj)), tc.pegada_largura(jj)[0],
                    "/".join("%.0f" % v for v in tc.escapula_frente(jj)),
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    tc.coluna(jj)[0], ft, onde, fc, fp, ftr, fmt, folgas_corpo.antebraco[0], *folgas_corpo.antebraco[1], ftc,
                    maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(tri.pegadores[s], tri.raio, tri.meia, eixo=(1, 0, 0))) for L, s in LADOS]
    yq = float(H.y)
    return Cena(pose, tri.raizes + pol.raizes + bc.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.5, 0.7),
                camera_video=((3.6, yq + 1.2, 1.5), (0, yq - 0.55, 0.65), 50), info=info, apoios=bc.apoios, afunda_apoio_mm=20)
