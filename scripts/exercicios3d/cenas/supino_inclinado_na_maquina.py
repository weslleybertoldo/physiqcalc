# Supino Inclinado na Máquina — cena da fábrica 3D (lote 15, 13/10/2026; exercício novo do catálogo, PR #190). Máquina nova:
# equip3d.supino_inclinado_maquina, o desenho da Hammer Strength Plate-Loaded Iso-Lateral Incline Press (IL-IP): 2 braços de alavanca
# independentes PENDURADOS de um eixo em cima de cada coluna de trás, ACIMA e ATRÁS da cabeça, descendo pra frente até os pegadores
# na frente da parte de cima do peito; cada braço gira no SEU eixo, virado no plano do chão, e os pegadores CONVERGEM no fim; pino com
# anilha perto da ponta de cada braço; assento numa coluna com pino; encosto comprido e fixo; pés no chão.
# t = 0 pegadores perto da parte de cima do peito (o vão da mão ALTO0 abaixo das articulações dos ombros, ao longo do tronco, e
# FRENTE0 à frente do peito), cotovelos dobrados, abertos pro lado e abaixo das mãos · t = 1 braços quase esticados (COTOVELO1°, sem
# travar), a mão INCL° acima da perpendicular ao tronco, na altura da testa/topo da cabeça, mais perto do meio.
# Técnica (frases exatas na ficha): free-exercise-db, Leverage Incline Chest Press: "The handles should be near the top of the
# pectorals at the beginning of the motion. Your chest and head should be up and your shoulder blades retracted." / "Press the handles
# forward by extending through the elbow." / "return the weight just above the start position"; ExRx, Lever Incline Chest Press: "Sit
# on seat with upper chest just above grips on lever." / "Grasp handles with wide oblique overhand grip and position elbows out to
# sides." / "Press lever until arms are extended. Return weight until shoulders or chest feels slightly stretched."; ACE, Seated
# Incline Cable Press: "position your hands level with your upper chest or shoulders, maintaining a neutral wrist position" / "Position
# your feet firmly on the floor" / "Depress and retract your scapulae (pull shoulders back and down)" / "extending your arms forward to
# a level with your forehead or top of your head" / "until your elbows are fully extended, but not locked" / "stopping when they
# lightly touch, or are close to, your upper chest"; Life Fitness, IL-IP: "The ergonomic handles ... sit perfectly between a neutral
# and overhand grip."; MTS Iso-Lateral Incline Press: "The overhead pivot provides a natural arc of shoulder motion"; "independently
# diverging and converging pressing motions"; Rodríguez-Ridao et al. 2020: "An inclination of 30° produces greater activation of the
# upper portion of the pectoralis major."
# Como o rig faz: sentado como no supino sentado (o corpo inclina pra trás em volta do quadril até o glúteo e a parte de cima das
# costas encostarem juntos no encosto ENCOSTO° atrás da vertical; coxas na horizontal e um pouco abertas, canelas em pé, pés chapados
# no chão; escápulas pra trás e pra baixo, paradas). No começo o vão da mão (o meio do pegador) fica na parte de cima do peito, em
# |x| = X_PEG0; o pegador é girado GIRO_PEGADA° da pegada pronada pra neutra em volta do antebraço do começo (a ponta do polegar pra
# dentro e pra cima: "between a neutral and overhand grip") e inclinado INCLINA_PEGADA° do perpendicular a ele (o pegador é fixo no
# braço da máquina e gira junto: assim o punho dobra de lado um pouco pros 2 lados no arco, em vez de tudo no fim); o cotovelo fica no
# círculo que o braço deixa (ombro e punho dados) com a abertura ABRE0 e o antebraço perto da linha do empurrão. O eixo de cada braço
# fica Z_EIXO no alto, com o cubo em |x| = X_EIXO, e vira PSI° no plano do chão (a ponta de fora pra frente): o pegador sobe, vai pra
# frente e vem um pouco pro meio. A cena acha o y do eixo (atrás da cabeça) que leva a mão, com o cotovelo dobrado só COTOVELO1°, a
# INCL° acima da perpendicular ao tronco. Quadro a quadro os braços da máquina giram no arco e a mão vai junto com o pegador (IK do
# braço + mão fechada em volta dele); o cotovelo fica no círculo que o braço deixa sempre na mesma posição do "relógio" em volta da
# reta ombro → punho (THETA0, a do começo: abaixo dela e pro lado de fora), então ele sobe por baixo da linha da mão e vem pro meio
# quando o braço estica, sem salto entre quadros. Os dedos e o polegar fecham UMA vez, no começo (mão rígida no pegador redondo, de
# 38 mm). Tronco, escápulas, cabeça, quadril, pernas e pés não mexem.
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
ENCOSTO = 15.0            # encosto 15° atrás da vertical (IL-IP não publica; na foto de lado do fabricante o tronco fica ~14°)
ALT_ENCOSTO, LARG_ENCOSTO, ESP_ENCOSTO = 0.826, 0.286, 0.06   # "PAD, BACK 32-1/2 X 11-1/4" (manual de peças MTSIP); estofado de 60 mm
ESP_ASSENTO, LARG_ASSENTO = 0.06, 0.38    # estofado de 60 mm; largura: escolha da fábrica
PROF_ASSENTO = 0.34       # do encosto até a borda da frente (a coxa passa da borda, o joelho fica livre)
AFUNDA = 0.002            # pele afundando no estofado do assento e do encosto
ABRE_COXA = 5.0           # coxas abertas 5° pra fora: pés um pouco mais abertos que o quadril
ALTO0 = -0.03             # começo: o vão da mão 3 cm abaixo das articulações dos ombros, ao longo do tronco (a parte de cima do peito:
                          # "near the top of the pectorals", fedb; "upper chest just above grips", ExRx)
FRENTE0 = 0.05            # começo: o vão da mão 5 cm à frente da frente do peito, nessa altura ("lightly touch, or are close to, your
                          # upper chest", ACE)
X_PEG0 = 0.27             # começo: vão da mão em |x| = 0,27 m (um pouco por fora dos ombros)
GIRO_PEGADA = 45.0        # pegador girado 45° da pegada pronada pra neutra ("between a neutral and overhand grip", IL-IP)
INCLINA_PEGADA = 12.0     # e inclinado 12° do perpendicular ao antebraço do começo (a ponta do polegar pra frente, no sentido do
                          # antebraço): o desvio do punho fica dividido entre o começo do arco (pro lado do mindinho) e o fim (pro lado
                          # do polegar), em vez de ir todo pro fim
ABRE0 = 60.0              # abertura do braço no começo (vista de frente do tronco): cotovelos pro lado, abaixo das mãos
COTOVELO1 = 12.0          # flexão do cotovelo no fim: quase esticado, sem travar
INCL = 28.0               # fim: a reta ombro → punho 28° acima da perpendicular ao tronco (no plano do meio do corpo)
Z_EIXO = 1.55             # eixo dos braços: 1,55 m do chão, ~62 cm acima dos ombros (na foto de lado da IL-IP: ~57 cm)
X_EIXO = 0.62             # cubo de cada braço em |x| = 0,62 (por fora da coluna e do mancal)
PSI = 18.0                # eixo de cada braço virado 18° no plano do chão: os pegadores convergem no fim
X_COLUNA = 0.50           # colunas de trás e trilhos da base em |x| = 0,50
X_BRACO = 0.50            # ponta de cada braço (onde a barra do pegador entra) em |x| = 0,50, por fora dos cotovelos
ANILHA = (0.175, 0.040)   # anilha de 10 kg em cada braço: Ø 350 mm (Eleiko 10 kg: "Diameter 350 mm"), 40 mm de espessura
RAIO = 0.019              # pegador de 38 mm ("Grip 1.5" OD", manual de peças MTSIP; a IL-IP não publica)
COMP_PEGADOR = 0.14
PUNHO = 10.0              # extensão do punho: a mão um pouco pro lado do dorso ("neutral wrist position", ACE)
RETRAI, DESCE = 6.0, 4.0  # escápulas pra trás (retração) e pra baixo (depressão), graus de giro da clavícula (ACE: "Depress and
                          # retract your scapulae")


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _abertura(v, cima, lado, s):
    """Abertura do braço (vetor ombro → cotovelo) vista de frente do tronco, graus (a mesma conta do tc.braco_abertura)."""
    return math.degrees(math.atan2(v.dot(s * lado), v.dot(-cima)))


def _gira(v, c, a, graus):
    """Ponto v girado `graus` em volta do eixo que passa por c na direção a (regra da mão direita)."""
    return c + Matrix.Rotation(math.radians(graus), 3, a) @ (v - c)


def montar(bon):
    pg.usar_cilindro(RAIO * 2000)     # mão de referência do pegador de 38 mm (antes do Maos)
    pg.usar_polegar("volta")          # polegar dando a volta no pegador (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    # ── 1) sentado: coxas na horizontal e um pouco abertas, canelas em pé, pés chapados no chão (a planta no chão) ──────────────
    PERNA_OSSOS = ("Hips",) + tuple(L + o for L, _ in LADOS for o in ("UpLeg", "Leg", "Foot", "ToeBase"))
    repouso = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNA_OSSOS}
    pivo0 = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    pe_rep = {L: p3.mundo_osso(rig, L + "Foot").to_3x3().normalized() for L, _ in LADOS}   # sola chapada (repouso)
    f_rep = {L: cab(L + "ToeBase") - cab(L + "Foot") for L, _ in LADOS}
    a_enc = math.radians(ENCOSTO)
    n_enc = Vector((0, -math.cos(a_enc), math.sin(a_enc)))   # normal da face do encosto (pro corpo)

    def sentar(reclina):
        for n, M in repouso.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(-reclina), pivo=pivo0)
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

    def costas():
        """Quanto o glúteo e a parte de cima das costas chegam no encosto (n·p, m; menor = mais pra trás)."""
        co, _, (nomes, dono) = _malha(bon)
        g = co[_grupo(nomes, dono, ("Hips",))]
        c = co[_grupo(nomes, dono, ("Spine1", "Spine2", "LeftShoulder", "RightShoulder"))]
        c = c[np.abs(c[:, 0]) < LARG_ENCOSTO / 2]
        nn = np.array(n_enc)
        return float((g @ nn).min()), float((c @ nn).min())

    # escápulas pra trás e pra baixo, paradas o movimento todo (fedb: "your shoulder blades retracted"; ACE: "Depress and retract your
    # scapulae (pull shoulders back and down) and attempt to hold this position throughout the exercise"): cada clavícula gira RETRAI°
    # em volta do eixo do tronco e DESCE° em volta do eixo da frente, feito em pé, antes de sentar (como no supino sentado)
    cima0 = (cab("Neck") - cab("Hips")).normalized()
    lado0 = cab("RightShoulder") - cab("LeftShoulder")
    lado0 = (lado0 - cima0 * lado0.dot(cima0)).normalized()
    frente0 = cima0.cross(lado0)
    ombro_antes = {L: cab(L + "Arm") for L, _ in LADOS}
    for L, s in LADOS:
        if RETRAI:
            p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * RETRAI), 3, cima0))
        if DESCE:
            p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(-s * DESCE), 3, frente0))
    print("ESCÁPULAS | retração %.0f° e depressão %.0f° | ombro E andou %.1f mm pra trás e %.1f mm pra baixo" % (
        RETRAI, DESCE, (cab("LeftArm") - ombro_antes["Left"]).dot(-frente0) * 1000,
        -(cab("LeftArm") - ombro_antes["Left"]).dot(cima0) * 1000), flush=True)

    # o quanto o corpo inclina pra trás: o glúteo e as costas encostam JUNTOS no encosto ("contact with your back and shoulder blades
    # against the backrest", ACE)
    lo, hi = -5.0, 35.0
    for _ in range(13):
        meio = (lo + hi) / 2
        sentar(meio)
        dg, dc = costas()
        if dg < dc:            # o glúteo chega antes: as costas estão longe → inclina mais
            lo = meio
        else:
            hi = meio
    reclina = (lo + hi) / 2
    sentar(reclina)
    dg, dc = costas()
    d_enc = min(dg, dc) + AFUNDA                             # face do encosto: n·p = d_enc
    H = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    # assento: embaixo do glúteo (a pele mais baixa no pedaço do assento afunda AFUNDA); o encosto cruza o topo dele em y_base
    G = pele(("Hips", "LeftUpLeg", "RightUpLeg"))
    topo = float(G[:, 2].min()) + AFUNDA
    for _ in range(3):
        y_base = (math.sin(a_enc) * topo - d_enc) / math.cos(a_enc)
        y_tras, y_frente = y_base + 0.06, y_base - (PROF_ASSENTO - 0.06)
        Gs = G[(G[:, 1] > y_frente) & (G[:, 1] < y_tras) & (np.abs(G[:, 0]) < LARG_ASSENTO / 2)]
        topo = float(Gs[:, 2].min()) + AFUNDA
    y_base = (math.sin(a_enc) * topo - d_enc) / math.cos(a_enc)
    y_tras, y_frente = y_base + 0.06, y_base - (PROF_ASSENTO - 0.06)
    co, _, (nomes, dono) = _malha(bon)
    cabeca_p = co[_grupo(nomes, dono, ("Head",))]
    print("SENTADO | reclina %.2f° | glúteo × costas %.1f mm | quadril (%.4f %.4f %.4f) | assento topo %.4f, y %.3f → %.3f | "
          "encosto y_base %.4f | cabeça %.1f mm à frente da face do encosto" % (
              reclina, (dg - dc) * 1000, *H, topo, y_frente, y_tras, y_base,
              ((cabeca_p @ np.array(n_enc)).min() - d_enc) * 1000), flush=True)

    # ── 2) ombros, referencial do tronco, a parte de cima do peito e a cabeça (testa, topo) ao longo do tronco ─────────────────────
    S = {L: cab(L + "Arm") for L, _ in LADOS}
    cima, lado, frente = (Vector(v) for v in tc.eixos_tronco(ck.posicoes(rig)))
    So = (S["Left"] + S["Right"]) / 2                        # meio dos ombros
    T = co[_grupo(nomes, dono, ("Spine", "Spine1", "Spine2"))]
    Tr = T - np.array(So)
    nivel = Tr @ np.array(cima)                              # altura ao longo do tronco, a partir dos ombros
    na_faixa = Tr[(np.abs(nivel - ALTO0) < 0.01) & (np.abs(T[:, 0]) < 0.15)]
    frente_peito0 = float((na_faixa @ np.array(frente)).max())   # frente do peito (pele mais à frente) nessa altura
    Hr = cabeca_p - np.array(So)
    topo_cabeca = float((Hr @ np.array(cima)).max())         # topo da cabeça, ao longo do tronco
    print("OMBROS | E (%.4f %.4f %.4f) D (%.4f %.4f %.4f) | tronco: cima (%.3f %.3f %.3f) frente (%.3f %.3f %.3f) | peito %.0f mm à "
          "frente dos ombros na altura do pegador (%.0f mm) | topo da cabeça %.0f mm acima dos ombros (ao longo do tronco)" % (
              *S["Left"], *S["Right"], *cima, *frente, frente_peito0 * 1000, ALTO0 * 1000, topo_cabeca * 1000), flush=True)

    # ── 3) mãos: o vão da mão em relação ao punho, no referencial da mão (dedos, palma) ──────────────────────────────────────────
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length
    La = (cab("LeftHand") - cab("LeftForeArm")).length
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")

    def orientacao(s, u, f):
        """Dedos e palma da mão no pegador de eixo u (do lado do mindinho pro do polegar) com o antebraço na direção f: dedos ⟂ ao
        pegador, na direção do antebraço, PUNHO° pro lado do dorso (extensão); a palma do lado que a mão `s` fecha (dedos × polegar)."""
        u = Vector(u).normalized()
        d = (f - u * f.dot(u)).normalized()
        p0 = d.cross(u) * s
        dq = (d * math.cos(math.radians(PUNHO)) - p0 * math.sin(math.radians(PUNHO))).normalized()
        pq = (dq.cross(u) * s).normalized()
        return dq, pq

    def eixo_pegada(s, f):
        """Eixo do pegador (do mindinho pro polegar) ⟂ ao antebraço f, GIRO_PEGADA° da pegada pronada (polegar pro meio do corpo) pra
        neutra (polegar pra cima)."""
        m = Vector((-s, 0.0, 0.0))
        u_pr = (m - f * m.dot(f)).normalized()
        u_ne = f.cross(u_pr).normalized()
        if u_ne.dot(cima) < 0:
            u_ne = -u_ne
        g, i = math.radians(GIRO_PEGADA), math.radians(INCLINA_PEGADA)
        u = (u_pr * math.cos(g) + u_ne * math.sin(g)).normalized()
        return (u * math.cos(i) + f * math.sin(i)).normalized()

    # vão − punho no referencial (dedos, palma, dedos × palma) de cada mão: igual em qualquer pose dela (o vão é fixo no osso)
    OFF = {}
    for L, s in LADOS:
        f_r = (frente + cima * 0.5).normalized()
        dq_r, pq_r = orientacao(s, eixo_pegada(s, f_r), f_r)
        g_r = S[L] + Vector((s * 0.08, 0.0, 0.0)) + frente * 0.30 + cima * 0.05
        maos.segurar(L, g_r, dq_r, pq_r, polo=S[L] + Vector((s * 0.4, 0.3, -0.3)), zerar=True)
        off = g_r - cab(L + "Hand")
        OFF[L] = (off.dot(dq_r), off.dot(pq_r), off.dot(dq_r.cross(pq_r)))
        print("MÃO %s | vão − punho %.1f mm ao longo dos dedos, %.1f mm pra palma, %.1f mm de lado | erro do vão %.1f mm" % (
            L, OFF[L][0] * 1000, OFF[L][1] * 1000, OFF[L][2] * 1000, maos.erro[L] * 1000), flush=True)

    def vao_menos_punho(L, dq, pq):
        o = OFF[L]
        return dq * o[0] + pq * o[1] + dq.cross(pq) * o[2]

    def cotovelo(L, s, W, D, alvo=None):
        """Cotovelo no círculo que o braço deixa (ombro e punho dados): sem `alvo`, o ponto em que o antebraço fica o mais perto
        da direção D (a do empurrão naquele ponto do arco); com `alvo`, o que deixa a abertura do cotovelo mais perto de `alvo`
        graus, com o antebraço perto de D (meio peso). Devolve o centro do círculo, a direção do cotovelo (a partir do centro) e o
        raio."""
        d = W - S[L]
        u = d.normalized()
        a = (Lb ** 2 - La ** 2 + d.length_squared) / (2 * d.length)
        rho = math.sqrt(max(Lb ** 2 - a * a, 1e-8))
        Cc = S[L] + u * a
        e1 = -(D - u * u.dot(D)).normalized()
        if alvo is None:
            return Cc, e1, rho
        e2 = u.cross(e1)
        melhor = None
        for k in range(-120, 121):
            e = e1 * math.cos(math.radians(k)) + e2 * math.sin(math.radians(k))
            E = Cc + e * rho
            custo = abs(_abertura(E - S[L], cima, lado, -s) - alvo) + 0.5 * math.degrees((W - E).angle(D))
            if melhor is None or custo < melhor[0]:
                melhor = (custo, e)
        return Cc, melhor[1], rho

    def relogio(L, s, W):
        """Círculo que o braço deixa (ombro e punho dados): centro, raio e as 2 direções de referência no plano dele — `baixo` (o
        pra baixo do tronco, ⟂ à reta ombro → punho) e `fora` (pro lado de fora do corpo, ⟂ às duas)."""
        d = W - S[L]
        u = d.normalized()
        a = (Lb ** 2 - La ** 2 + d.length_squared) / (2 * d.length)
        rho = math.sqrt(max(Lb ** 2 - a * a, 1e-8))
        baixo = -cima - u * u.dot(-cima)
        baixo.normalize()
        fora = -s * lado
        fora = (fora - u * u.dot(fora) - baixo * baixo.dot(fora)).normalized()
        return S[L] + u * a, rho, baixo, fora

    def cotovelo_relogio(L, s, W, theta):
        """Cotovelo no círculo que o braço deixa, na posição `theta` graus do "relógio" (0 = embaixo da reta ombro → punho, 90 = pro
        lado de fora): o mesmo theta o movimento todo = o cotovelo fica sempre do mesmo jeito em relação à reta ombro → mão."""
        Cc, rho, baixo, fora = relogio(L, s, W)
        t_ = math.radians(theta)
        return Cc, baixo * math.cos(t_) + fora * math.sin(t_), rho

    # ── 4) o começo (t=0), o eixo do braço esquerdo e o fim (t=1) ──────────────────────────────────────────────────────────────
    g0 = {s: So + cima * ALTO0 + frente * (frente_peito0 + FRENTE0) + Vector((s * X_PEG0, 0.0, 0.0)) for _, s in LADOS}
    psi = math.radians(PSI)
    a_L = Vector((-math.cos(psi), math.sin(psi), 0.0))      # eixo do braço esquerdo: girar > 0 = empurrar (sobe, vai pra frente
                                                             # e pro meio)
    d1 = math.sqrt(Lb ** 2 + La ** 2 + 2 * Lb * La * math.cos(math.radians(COTOVELO1)))   # ombro → punho com o cotovelo em COTOVELO1

    def tangente(g, P, a):
        """Direção em que o pegador anda no arco em volta do eixo (P, a) quando o braço gira > 0: o empurrão."""
        return a.cross(g - P).normalized()

    def comeco(L, s, D):
        """Cotovelo, punho, antebraço e eixo do pegador no começo, com o antebraço perto da linha do empurrão D."""
        f = D.copy()
        for _ in range(10):                        # antebraço ↔ eixo do pegador ↔ orientação da mão ↔ cotovelo
            u = eixo_pegada(s, f)
            dq, pq = orientacao(s, u, f)
            W = g0[s] - vao_menos_punho(L, dq, pq)
            Cc, e, rho = cotovelo(L, s, W, D, alvo=ABRE0)
            E = Cc + e * rho
            f = (W - E).normalized()
        return E, W, f, u

    def no_arco(P, u0, beta):
        """Pegador esquerdo (centro e eixo) com o braço girado `beta` graus em volta do eixo (P, a_L)."""
        g = _gira(g0[1], P, a_L, beta)
        u = Matrix.Rotation(math.radians(beta), 3, a_L) @ u0
        return g, u

    def punho_no(g, u):
        dq, pq = orientacao(1, u, (g - S["Left"]).normalized())
        return g - vao_menos_punho("Left", dq, pq)

    def fim(P, u0):
        """Arco (graus) em que o cotovelo esquerdo fica dobrado só COTOVELO1° e o ângulo da reta ombro → punho acima da
        perpendicular ao tronco, no plano do meio do corpo."""
        lo, hi = 0.0, 90.0
        for _ in range(50):
            meio = (lo + hi) / 2
            if (punho_no(*no_arco(P, u0, meio)) - S["Left"]).length < d1:
                lo = meio
            else:
                hi = meio
        arco = (lo + hi) / 2
        w = punho_no(*no_arco(P, u0, arco)) - S["Left"]
        w = w - lado * w.dot(lado)
        return arco, math.degrees(math.atan2(w.dot(cima), w.dot(frente)))

    D0 = (frente * math.cos(math.radians(30)) + cima * math.sin(math.radians(30))).normalized()
    for volta in range(6):
        E0, W0, f0, u0 = comeco("Left", 1, D0)
        lo, hi = So.y - 0.30, So.y + 1.50                    # y do eixo: mais pra trás = o arco sobe mais (INCL maior)
        for _ in range(40):
            meio = (lo + hi) / 2
            if fim(Vector((X_EIXO, meio, Z_EIXO)), u0)[1] < INCL:
                lo = meio
            else:
                hi = meio
        P_L = Vector((X_EIXO, (lo + hi) / 2, Z_EIXO))
        ARCO, incl = fim(P_L, u0)
        D_novo = tangente(g0[1], P_L, a_L)
        print("   volta %d | eixo y %.4f | arco %.1f° | fim %.1f° acima da perpendicular | empurrão no começo %.1f° → %.1f° acima da "
              "perpendicular ao tronco" % (volta, P_L.y, ARCO, incl,
                                           math.degrees(math.atan2(D0.dot(cima), D0.dot(frente))),
                                           math.degrees(math.atan2(D_novo.dot(cima), D_novo.dot(frente)))), flush=True)
        D0 = D_novo
    E0, W0, f0, u0 = comeco("Left", 1, D0)
    Cl, el_, rl = cotovelo("Left", 1, W0, D0)                # comparação: o antebraço NA linha do empurrão
    print("COMEÇO (comparação) | antebraço na linha do empurrão: cotovelo dobrado %.0f°, %.0f mm abaixo do ombro (ao longo do "
          "tronco), abertura %.0f°" % (math.degrees((Cl + el_ * rl - S["Left"]).angle(W0 - (Cl + el_ * rl))),
                                      -(Cl + el_ * rl - S["Left"]).dot(cima) * 1000,
                                      _abertura(Cl + el_ * rl - S["Left"], cima, lado, -1)), flush=True)
    g1, _ = no_arco(P_L, u0, ARCO)
    flex0 = math.degrees((E0 - S["Left"]).angle(W0 - E0))
    R_alav = (g0[1] - P_L).length

    def ao_longo(v):
        """(frente, cima) do ponto v em relação aos ombros, no referencial do tronco (m)."""
        r = v - So
        return r.dot(frente), r.dot(cima)

    print("COMEÇO | pegador E (%.4f %.4f %.4f): %.0f mm à frente da frente do peito, %.0f mm abaixo dos ombros (ao longo do tronco) | "
          "cotovelo (%.3f %.3f %.3f) dobrado %.0f°, %.0f mm abaixo do ombro (ao longo do tronco) | abertura %.0f° | antebraço %.1f° "
          "acima da perpendicular ao tronco (%.1f° da linha do empurrão, que sai %.1f° acima dela) | pegada %.2f × ombros | eixo do "
          "pegador (%.3f %.3f %.3f)" % (
              *g0[1], (ao_longo(g0[1])[0] - frente_peito0) * 1000, -ao_longo(g0[1])[1] * 1000, *E0, flex0,
              -(E0 - S["Left"]).dot(cima) * 1000, _abertura(E0 - S["Left"], cima, lado, -1),
              math.degrees(math.atan2(f0.dot(cima), f0.dot(frente))), math.degrees(f0.angle(D0)),
              math.degrees(math.atan2(D0.dot(cima), D0.dot(frente))), 2 * X_PEG0 / (S["Left"] - S["Right"]).length, *u0), flush=True)
    print("FIM | pegador E (%.4f %.4f %.4f): %.0f mm à frente dos ombros e %.0f mm acima (ao longo do tronco; topo da cabeça a %.0f) | "
          "|x| %.3f (convergiu %.0f mm) | curso %.3f m | arco %.1f° | reta ombro → punho %.1f° acima da perpendicular ao tronco | eixo "
          "do braço E: cubo (%.3f %.4f %.3f), %.0f mm atrás dos ombros e %.0f mm acima (no mundo) | braço da alavanca %.3f m" % (
              *g1, ao_longo(g1)[0] * 1000, ao_longo(g1)[1] * 1000, topo_cabeca * 1000, g1.x, (X_PEG0 - g1.x) * 1000,
              (g1 - g0[1]).length, ARCO, incl, *P_L, (P_L.y - So.y) * 1000, (P_L.z - So.z) * 1000, R_alav), flush=True)

    # ── 5) a máquina em volta do corpo: o braço vai reto do cubo até a ponta, que fica por fora da ponta de baixo do pegador ───────
    baixo0 = g0[1] - u0 * (COMP_PEGADOR / 2)
    dobra0 = baixo0 - u0 * 0.025
    ponta = Vector((X_BRACO, dobra0.y, dobra0.z))
    mq = e3.supino_inclinado_maquina("inclinado", eixo=tuple(P_L), direcao=tuple(a_L), braco=[tuple(ponta)],
                                     pegadores=(tuple(g0[1]), tuple(u0), COMP_PEGADOR, RAIO),
                                     assento=(y_frente, y_tras, topo, LARG_ASSENTO, ESP_ASSENTO),
                                     encosto=(y_base, ENCOSTO, ALT_ENCOSTO, LARG_ENCOSTO, ESP_ENCOSTO), x_coluna=X_COLUNA,
                                     y_frente=float(H.y) - 0.48, anilha=ANILHA)
    print("MÁQUINA | cubo E (%.3f %.3f %.3f), eixo (%.3f %.3f %.3f) | ponta do braço E (%.3f %.3f %.3f) | braço %.3f m, %.1f° abaixo "
          "da horizontal no começo" % (*P_L, *a_L, *ponta, (ponta - P_L).length,
                                       math.degrees(math.atan2(P_L.z - ponta.z, (P_L - ponta).xy.length))), flush=True)

    # ── 6) pose: os braços da máquina giram no arco e cada mão vai junto com o pegador ─────────────────────────────────────────
    Cc0, _, baixo0, fora0 = relogio("Left", 1, W0)
    e0_ = (E0 - Cc0).normalized()
    THETA0 = math.degrees(math.atan2(e0_.dot(fora0), e0_.dot(baixo0)))
    print("COTOVELO no relógio da reta ombro → punho: %.1f° (0 = embaixo dela, 90 = pro lado de fora) — fica assim o movimento todo"
          % THETA0, flush=True)
    DEDOS, estado = {}, {}

    def maos_no_pegador(acertar=False):
        for L, s in LADOS:
            g, u = mq.pegada(s)
            P, a = mq.eixos[s]
            f = estado.get(L, tangente(g, P, a))
            for _ in range(4):                  # antebraço ↔ cotovelo ↔ orientação da mão (converge em 2–3 voltas)
                dq, pq = orientacao(s, u, f)
                W = g - vao_menos_punho(L, dq, pq)
                Cc, e, rho = cotovelo_relogio(L, s, W, THETA0)
                f = (W - (Cc + e * rho)).normalized()
            estado[L] = f
            maos.segurar(L, g, dq, pq, polo=Cc + e * (rho + 0.4), zerar=True)
            if acertar:
                maos.iks[L].mute = False
                p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
                maos.segurar(L, g, dq, pq, polo=Cc + e * (rho + 0.4), zerar=True)
            if L in DEDOS:                      # mão rígida no pegador redondo: os dedos e o polegar fechados no começo
                for n, M in DEDOS[L].items():
                    PB[n].matrix_basis = M.copy()
                p3.atualizar()

    def pose(t):
        """t=0 pegadores perto da parte de cima do peito, cotovelos dobrados; t=1 braços quase esticados, pra cima e pra frente."""
        if t <= 1e-9:
            estado.clear()                       # o começo não depende do quadro anterior
        mq.girar(p3.lerp(0.0, ARCO, t))
        maos_no_pegador()

    mq.girar(0.0)
    maos_no_pegador(acertar=True)               # polo certo do cotovelo com ele bem dobrado (embaixo)
    estado.clear()
    pose(0.0)
    pose.dedos = {}
    for L, s in LADOS:                          # dedos e polegar fecham UMA vez (o pegador é redondo: a mão gira em volta dele igual)
        g, u = mq.pegada(s)
        pose.dedos[L] = pg.fechar_em_volta(bon, L, g, u, RAIO)
        DEDOS[L] = {pb.name: pb.matrix_basis.copy() for pb in PB
                    if pb.name[len(p3.P):].startswith(L + "Hand") and pb.name[len(p3.P):] != L + "Hand"}
        print("DEDOS %s | %s" % (L, pose.dedos[L]), flush=True)

    def desvio_geo():
        """asin(antebraço · eixo do pegador), graus [E, D]: o quanto o antebraço sai do perpendicular ao pegador."""
        out = []
        for L, s in LADOS:
            f = (cab(L + "Hand") - cab(L + "ForeArm")).normalized()
            out.append(math.degrees(math.asin(max(-1.0, min(1.0, f.dot(mq.pegada(s)[1]))))))
        return out

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        g, _ = mq.pegada(1)
        fr, ci = ao_longo(g)
        cE = cab("LeftForeArm") - S["Left"]
        wE = cab("LeftHand") - S["Left"]
        return ("cotovelo E: frente %.0f cima %.0f fora %.0f mm, punho E: frente %.0f cima %.0f fora %.0f mm (tronco) | "
                "braços da máquina %.1f° | pegador E (%.3f %.3f %.3f), %.0f mm à frente e %.0f mm acima dos ombros (tronco) | "
                "cotovelo %.0f/%.0f° | abertura %s° | braço à frente %s° | antebraço × horizontal %s° | punho %.0f/%.0f° (flexão %s, "
                "desvio %s, antebraço × pegador %s) | palma × cima %s° | palma pro meio %s° | pegada %.2f | escápula %s mm | tronco %.1f° | coluna %.1f° | "
                "cabeça %s° | %s" % (
                    cE.dot(frente) * 1000, cE.dot(cima) * 1000, -cE.dot(lado) * 1000, wE.dot(frente) * 1000,
                    wE.dot(cima) * 1000, -wE.dot(lado) * 1000,
                    mq.angulo, *g, fr * 1000, ci * 1000, juntas["cotoveloE"], juntas["cotoveloD"],
                    "/".join("%.0f" % v for v in tc.braco_abertura(jj)), "/".join("%.0f" % v for v in tc.braco_frente(jj)),
                    "/".join("%.0f" % v for v in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["ForeArm", "Hand"]})),
                    juntas["punhoE"], juntas["punhoD"], "/".join("%.0f" % v for v in tc.punho_flexao(jj)),
                    "/".join("%.0f" % v for v in tc.punho_desvio(jj)), "/".join("%.0f" % v for v in desvio_geo()),
                    "/".join("%.0f" % v for v in tc.palma_cima(jj)),
                    "/".join("%.0f" % v for v in tc.palma_dentro(jj)), tc.pegada_largura(jj)[0],
                    "/".join("%.0f" % v for v in tc.escapula_frente(jj)),
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    tc.coluna(jj)[0], "/".join("%.0f" % v for v in tc.cabeca_tronco(jj)), maos.info()))

    for k in range(25):                         # os 25 quadros da exportação (o cotovelo segue o quadro anterior)
        t = p3.suave(k / 24)
        pose(t)
        if k % 3 == 0:
            print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(mq.pegadores[s], RAIO, COMP_PEGADOR / 2, eixo=(0, 0, 1))) for L, s in LADOS]
    yq = float(H.y)
    return Cena(pose, mq.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.1, 1.0),
                camera_video=((3.4, yq - 2.8, 1.65), (0, yq - 0.1, 0.95), 50), info=info, apoios=mq.apoios,
                afunda_apoio_mm=20)
