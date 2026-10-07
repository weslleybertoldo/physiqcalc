# Supino Reto na Máquina Deitado — cena da fábrica 3D (lote 5, 07/10/2026). Máquina nova: equip3d.supino_deitado (supino deitado
# articulado de anilhas: banco reto, pórtico atrás da cabeça com o eixo dos 2 braços de alavanca, pegadores em cima do peito e um pino
# com anilha em cada braço).
# t = 0 pegadores em cima da linha do peito, as mãos perto dele; cotovelos dobrados (~128°), abertos ~60° do tronco e ~6 cm abaixo
# do topo do banco · t = 1 braços quase esticados (~10°, sem travar), as mãos em cima dos ombros. Técnica: ExRx, Lever Bench Press (plate
# loaded): "Lie supine on bench with chest under lever bar. Grasp lever bar with wide oblique overhand grip." / "Press bar until arms
# are extended. Lower weight to upper chest." / "Range of motion will be compromised if grip is too wide." NSCA (Achievable CSCS,
# Flat barbell bench press): "Lie on a flat bench with five-point body contact." / "Grasp the bar with a closed, pronated grip,
# slightly wider than shoulder-width." / "Lower the bar to touch your chest at nipple level." / "Push the bar upward and slightly
# backward until your elbows are fully extended."; posição de 5 pontos: "Head on the bench or pad", "Shoulders/upper back on the
# bench", "Buttocks on the bench or seat", "Right foot flat on the floor", "Left foot flat on the floor". ACE, Chest Press (barra,
# banco): "Lie face up on a flat bench, and grip a barbell with the hands slightly wider than shoulder-width." / "Slowly lower the
# bar to the chest by allowing the elbows to bend out to the side. Stop when the elbows are just below the bench". ExRx, Bench Press
# Analyses: "Lowering the bar between the lower to mid-chest will typically result in a 45º to 70º angle between the shoulder and
# torso"; "a 70º upper arm position with the forearms vertical at the lowest bench press position" (Rippetoe); "As the barbell is
# raise, it is positioned over the shoulders in the path of a J."; "Keep the scapula back and down."; "a standard bench press grip
# of 1.5 to 1.7 times the biacromial width".
# Como o rig faz: deitado de costas no banco como no supino reto com barra (dt.deitar: cabeça, costas e glúteo no estofado, pés
# chapados no chão), com as escápulas pra trás e pra baixo (paradas). O pegador anda num ARCO em volta do eixo dos braços da máquina:
# embaixo (t=0) o centro dele fica ACIMA0 acima da pele mais alta do peito, na linha em que o antebraço fica na direção do empurrão
# (a tangente do arco no começo: quase em pé) com o cotovelo aberto ABRE0° do tronco — daí saem a largura da pegada e a linha do
# pegador no peito; em cima (t=1) o cotovelo dobra só COTOVELO1° e o pegador fica FRENTE1 pros pés da linha dos ombros; o eixo fica
# atrás da cabeça (PIVO_ATRAS além do topo dela), à mesma distância dos 2 pontos: o pegador sobe e volta um pouco pra cabeça no
# fim (o J). Quadro a quadro os braços da máquina giram no arco e a mão vai junto com o pegador (IK do braço + mão fechada em volta
# dele); o cotovelo fica no ponto do círculo que o braço deixa com a abertura indo de ABRE0 (começo) à da reta ombro → punho (fim)
# junto com o arco, o antebraço perto da linha do empurrão e sem salto entre quadros; a mão com a palma pros pés (pronada) e o punho
# quase reto. Os dedos e o polegar fecham UMA vez, no começo (mão rígida no pegador redondo). Tronco, escápulas, cabeça, quadril,
# pernas e pés não mexem.
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
import deitado3d as dt
from maos3d import Maos
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
TOPO = 0.44               # topo do estofado do banco (IPF: 42–45 cm, como o banco do supino reto com barra)
LARG_BANCO, ESP_BANCO = 0.30, 0.06        # IPF: 29–32 cm de largura; estofado de 60 mm
BANCO_Y = (-0.26, 0.96)   # do pé à cabeceira do banco: 1,22 m (IPF: "not less than 1.22 m"); o pé fica antes da panturrilha
AFUNDA = 0.006            # costas no estofado (como no supino reto com barra)
PE_X, PE_Y = 0.25, -0.40  # tornozelos no chão (como no supino reto com barra)
ABRE0 = 60.0              # cotovelo × tronco embaixo, vista de cima do peito (ExRx: 45–70°; Rippetoe: 70°)
ACIMA0 = 0.035            # embaixo, o centro do pegador 3,5 cm acima da pele mais alta do peito na linha dele: as mãos na altura da
                          # frente do peito ("Lower weight to upper chest", ExRx; "to touch your chest at nipple level", NSCA)
COTOVELO1 = 10.0          # flexão do cotovelo em cima: quase esticado, sem travar
FRENTE1 = 0.02            # em cima, o pegador 2 cm pros pés da linha dos ombros ("positioned over the shoulders", ExRx)
PIVO_ATRAS = 0.52         # eixo dos braços da máquina 52 cm além do topo da cabeça: a anilha fica atrás da cabeça (com 40 cm ela
                          # tapava a cabeça na vista de lado) e o eixo, 6 cm acima do rosto
X_BRACO = 0.53            # plano dos braços da máquina: por fora das mãos, dos cotovelos e da cabeça
RAIO = 0.0145             # pegador de 29 mm (o cilindro da mão de referência)
COMP_PEGADOR = 0.15
GIRO_PEG = 0.0            # pegadores ao longo do X (pegada pronada, como a barra)
PUNHO = 12.0              # extensão do punho: a mão um pouco pra cabeça da linha do antebraço (o pegador em cima do antebraço)
RETRAI, DESCE = 6.0, 4.0  # escápulas pra trás (retração) e pra baixo (depressão), graus de giro da clavícula (ExRx: "Keep the
                          # scapula back and down"), feito em pé antes de deitar, como nos supinos sentados na máquina


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _abertura(v, cima, lado, s):
    """Abertura do braço (vetor ombro → cotovelo) vista de frente do tronco, graus (a mesma conta do tc.braco_abertura)."""
    return math.degrees(math.atan2(v.dot(s * lado), v.dot(-cima)))


def _gira_x(v, graus):
    """Vetor v girado `graus` em volta do +X (y → z), como os braços da máquina."""
    a = math.radians(graus)
    return Vector((v.x, v.y * math.cos(a) - v.z * math.sin(a), v.y * math.sin(a) + v.z * math.cos(a)))


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta no pegador (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    # ── 1) escápulas pra trás e pra baixo, paradas o movimento todo (ExRx, Bench Press Analyses: "Keep the scapula back and down"):
    # cada clavícula gira RETRAI° em volta do eixo do tronco e DESCE° em volta do eixo da frente, em pé, antes de deitar ───────────
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

    # ── 2) deitado de costas no banco: cabeça, costas e glúteo no estofado, pés chapados no chão (5 pontos de contato, NSCA) ──────
    dt.deitar(bon, TOPO, afunda=AFUNDA, pe_x=PE_X, pe_y=PE_Y)
    S = {L: cab(L + "Arm") for L, _ in LADOS}
    H = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    cima, lado, frente = (Vector(v) for v in tc.eixos_tronco(ck.posicoes(rig)))
    co, _, (nomes, dono) = _malha(bon)
    Hd = co[_grupo(nomes, dono, ("Head",))]
    y_topo_cabeca, z_rosto = float(Hd[:, 1].max()), float(Hd[:, 2].max())
    T = co[_grupo(nomes, dono, ("Spine", "Spine1", "Spine2"))]
    rel = T - np.array(S["Left"])
    f = T[(np.abs(np.abs(T[:, 0]) - 0.11) < 0.02) & (rel @ np.array(cima) > -0.20) & (rel @ np.array(cima) < 0.0)]
    mam = Vector(f[(f @ np.array(frente)).argmax()])         # meio do peito: a parte mais saliente do peitoral (como no supino sentado)
    print("DEITADO | ombro E (%.4f %.4f %.4f) D (%.4f %.4f %.4f) | quadril (%.4f %.4f %.4f) | topo da cabeça y %.4f, rosto z %.4f | "
          "meio do peito (%.4f %.4f %.4f) = %.0f mm pros pés do ombro" % (
              *S["Left"], *S["Right"], *H, y_topo_cabeca, z_rosto, *mam, (S["Left"].y - mam.y) * 1000), flush=True)

    def peito_z(y):
        """Pele mais alta do peito numa faixa de y (dt.peito: entre os ombros)."""
        return dt.peito(bon, y)

    # ── 3) braços: o vão da mão em relação ao punho, no referencial da mão (dedos, palma) ──────────────────────────────────────
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length
    La = (cab("LeftHand") - cab("LeftForeArm")).length
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")
    g_rad = math.radians(GIRO_PEG)
    eixo_peg = {s: Vector((-s * math.cos(g_rad), math.sin(g_rad), 0.0)) for _, s in LADOS}   # de fora pra dentro

    def orientacao(s, u, f):
        """Dedos e palma da mão no pegador de eixo u (de fora pra dentro) com o antebraço na direção f: dedos ⟂ ao pegador, na
        direção do antebraço, PUNHO° pro lado do dorso (extensão: a mão inclina pra cabeça); palma pros pés (pegada pronada de quem
        está deitado, como na barra do supino)."""
        u = Vector(u).normalized()
        d = (f - u * f.dot(u)).normalized()
        p0 = u.cross(d)
        if p0.y > 0:
            p0 = -p0                                  # palma pros pés (−Y)
        dq = (d * math.cos(math.radians(PUNHO)) - p0 * math.sin(math.radians(PUNHO))).normalized()
        pq = u.cross(dq).normalized()
        if pq.y > 0:
            pq = -pq
        return dq, pq

    OFF = {}
    for L, s in LADOS:
        dq_r, pq_r = orientacao(s, eixo_peg[s], Vector((0, 0, 1)))
        g_r = S[L] + Vector((s * 0.20, -0.08, 0.45))
        maos.segurar(L, g_r, dq_r, pq_r, polo=S[L] + Vector((s * 0.5, -0.3, -0.3)))
        off = g_r - cab(L + "Hand")
        OFF[L] = (off.dot(dq_r), off.dot(pq_r), off.dot(dq_r.cross(pq_r)))
        print("MÃO %s | vão − punho %.1f mm ao longo dos dedos, %.1f mm pra palma, %.1f mm de lado | erro do vão %.1f mm" % (
            L, OFF[L][0] * 1000, OFF[L][1] * 1000, OFF[L][2] * 1000, maos.erro[L] * 1000), flush=True)

    def vao_menos_punho(L, dq, pq):
        o = OFF[L]
        return dq * o[0] + pq * o[1] + dq.cross(pq) * o[2]

    def cotovelo(L, s, W, D, alvo, antes=None):
        """Cotovelo no círculo que o braço deixa (ombro e punho dados): o ponto que deixa a abertura do cotovelo mais perto de
        `alvo` graus, com o antebraço perto da direção D (a do empurrão, meio peso) e perto do quadro anterior (`antes`, direção do
        cotovelo: sem salto). Devolve o centro do círculo, a direção do cotovelo (a partir do centro) e o raio."""
        d = W - S[L]
        u = d.normalized()
        a = (Lb ** 2 - La ** 2 + d.length_squared) / (2 * d.length)
        rho = math.sqrt(max(Lb ** 2 - a * a, 1e-8))
        Cc = S[L] + u * a
        e1 = -(D - u * u.dot(D)).normalized()
        e2 = u.cross(e1)
        melhor = None
        for k in range(-120, 121):
            e = e1 * math.cos(math.radians(k)) + e2 * math.sin(math.radians(k))
            E = Cc + e * rho
            custo = abs(_abertura(E - S[L], cima, lado, -s) - alvo) + 0.5 * math.degrees((W - E).angle(D))
            if antes is not None:
                custo += 20.0 * max(0.0, math.degrees(e.angle(antes)) - 15.0)
            if melhor is None or custo < melhor[0]:
                melhor = (custo, e)
        return Cc, melhor[1], rho

    def tangente(g, C, para):
        """Direção (mundo) em que o pegador anda no arco em volta do eixo C (y, z), no sentido de `para` (o empurrão)."""
        v = Vector((0.0, g.y - C.x, g.z - C.y))
        t_ = Vector((0.0, -v.z, v.y)).normalized()
        return t_ if t_.dot(para) > 0 else -t_

    # ── 4) embaixo (t=0): o antebraço na direção D (o empurrão), o cotovelo aberto ABRE0° do tronco (vista de cima do peito) e o
    # centro do pegador ACIMA0 acima da pele mais alta do peito na linha dele; em cima (t=1): cotovelo dobrado COTOVELO1°, o
    # pegador FRENTE1 pros pés da linha dos ombros, no mesmo x. O eixo dos braços da máquina fica PIVO_ATRAS além do topo da
    # cabeça, à mesma distância dos 2 pontos (no plano YZ); o empurrão do começo é a tangente do arco — 5 voltas até parar de mudar.
    fora_E = -lado                                            # pro lado de fora do braço esquerdo (+X)

    def comeco(L, s, D):
        dq, pq = orientacao(s, eixo_peg[s], D)
        o = vao_menos_punho(L, dq, pq)
        h = -0.10                                             # cotovelo abaixo do ombro, ao longo da frente do tronco (chute)
        for _ in range(30):
            r = math.sqrt(max(Lb ** 2 - h * h, 1e-8))
            a = math.radians(ABRE0)
            E = S[L] + (-cima) * (r * math.cos(a)) + (fora_E * s) * (r * math.sin(a)) + frente * h
            g = E + D * La + o
            erro = g.z - (peito_z(g.y) + ACIMA0)
            if abs(erro) < 1e-5:
                break
            h -= erro
        W = E + D * La
        return g, E, W

    d1 = math.sqrt(Lb ** 2 + La ** 2 + 2 * Lb * La * math.cos(math.radians(COTOVELO1)))

    def fim(L, s, g0):
        g1 = Vector((g0.x, S[L].y - FRENTE1, S[L].z + 0.5))
        for _ in range(10):
            dq, pq = orientacao(s, eixo_peg[s], (g1 - S[L]).normalized())
            o = vao_menos_punho(L, dq, pq)
            w = g1 - o - S[L]
            wz = math.sqrt(max(d1 ** 2 - w.x ** 2 - w.y ** 2, 0.0))
            g1 = Vector((g0.x, S[L].y - FRENTE1, S[L].z + wz + o.z))
        return g1

    def eixo_dos_bracos(g0, g1):
        """(y, z) do eixo: na mediatriz dos 2 pontos (plano YZ), PIVO_ATRAS além do topo da cabeça."""
        a0, a1 = Vector((g0.y, g0.z)), Vector((g1.y, g1.z))
        m, c_ = (a0 + a1) / 2, a1 - a0
        yc = y_topo_cabeca + PIVO_ATRAS
        return Vector((yc, m.y - (yc - m.x) * c_.x / c_.y))

    D0 = Vector((0, 0, 1))
    for volta in range(6):
        g0, E0, W0 = comeco("Left", 1, D0)
        g1 = fim("Left", 1, g0)
        C = eixo_dos_bracos(g0, g1)
        D_novo = tangente(g0, C, g1 - g0)
        print("   volta %d | antebraço no começo %.1f° da vertical (+ = pra cabeça) → tangente %.1f°" % (
            volta, math.degrees(math.atan2(D0.y, D0.z)), math.degrees(math.atan2(D_novo.y, D_novo.z))))
        D0 = D_novo
    g0, E0, W0 = comeco("Left", 1, D0)
    g1 = fim("Left", 1, g0)
    C = eixo_dos_bracos(g0, g1)
    x_peg = g0.x
    flex0 = math.degrees((E0 - S["Left"]).angle(W0 - E0))
    print("COMEÇO | pegador (%.4f %.4f %.4f) = %.0f mm acima da pele mais alta do peito, %.0f mm pros pés do ombro | cotovelo "
          "(%.3f %.3f %.3f) dobrado %.0f°, %.0f mm abaixo do ombro e %.0f mm abaixo do topo do banco | abertura %.0f° | antebraço "
          "%.1f° da vertical | pegada %.2f × ombros" % (
              *g0, (g0.z - peito_z(g0.y)) * 1000, (S["Left"].y - g0.y) * 1000, *E0, flex0, (S["Left"].z - E0.z) * 1000,
              (TOPO - E0.z) * 1000, _abertura(E0 - S["Left"], cima, lado, -1), math.degrees(math.atan2(D0.y, D0.z)),
              2 * x_peg / (S["Left"] - S["Right"]).length), flush=True)
    a0, a1 = Vector((g0.y, g0.z)) - C, Vector((g1.y, g1.z)) - C
    R_alav = a0.length
    ARCO = math.degrees(math.atan2(a0.x * a1.y - a0.y * a1.x, a0.dot(a1)))         # giro em volta do +X (y → z)
    meio_arco = C + (a0 + a1).normalized() * R_alav
    corda_meio = (Vector((g0.y, g0.z)) + Vector((g1.y, g1.z))) / 2
    print("FIM | pegador (%.4f %.4f %.4f), %.0f mm pros pés do ombro | curso %.3f m | eixo dos braços y %.4f z %.4f (%.0f mm além do "
          "topo da cabeça, %.0f mm acima do rosto) | braço da alavanca %.3f m | arco %.1f° | no meio o pegador passa %.0f mm pros pés "
          "da reta | braço da máquina começa %.1f° e termina %.1f° da horizontal (+ = pra cima)" % (
              *g1, (S["Left"].y - g1.y) * 1000, (g1 - g0).length, C.x, C.y, (C.x - y_topo_cabeca) * 1000, (C.y - z_rosto) * 1000,
              R_alav, ARCO, (corda_meio.x - meio_arco.x) * 1000, math.degrees(math.atan2(a0.y, -a0.x)),
              math.degrees(math.atan2(a1.y, -a1.x))), flush=True)

    # ── 5) a máquina em volta do corpo ────────────────────────────────────────────────────────────────────────────────────────
    mq = e3.supino_deitado("deitado", eixo=(C.x, C.y), x_braco=X_BRACO,
                           pegadores=(g0.y, g0.z, x_peg, COMP_PEGADOR, RAIO), giro_pegador=GIRO_PEG,
                           banco=(BANCO_Y[0], BANCO_Y[1], TOPO, LARG_BANCO, ESP_BANCO))

    # ── 6) pose: os braços da máquina giram no arco e cada mão vai junto com o pegador ─────────────────────────────────────────
    # o cotovelo vai de ABRE0 (começo) até a abertura da reta ombro → punho no fim, junto com o arco
    dq1, pq1 = orientacao(1, eixo_peg[1], (g1 - S["Left"]).normalized())
    ABRE1 = _abertura(g1 - vao_menos_punho("Left", dq1, pq1) - S["Left"], cima, lado, -1)
    print("ABERTURA do cotovelo: %.1f° no começo → %.1f° no fim (junto com o arco)" % (ABRE0, ABRE1), flush=True)
    DEDOS, estado = {}, {}

    def maos_no_pegador(acertar=False):
        frac = mq.angulo / ARCO if ARCO else 0.0
        for L, s in LADOS:
            g, u = mq.pegada(s)
            D = tangente(g, C, g1 - g0)
            f, antes = estado.get(L, (D, None))
            for _ in range(3):                  # antebraço ↔ cotovelo ↔ orientação da mão (converge em 2–3 voltas)
                dq, pq = orientacao(s, u, f)
                W = g - vao_menos_punho(L, dq, pq)
                Cc, e, rho = cotovelo(L, s, W, D, alvo=ABRE0 + (ABRE1 - ABRE0) * frac, antes=antes)
                f = (W - (Cc + e * rho)).normalized()
            estado[L] = (f, e)
            maos.segurar(L, g, dq, pq, polo=Cc + e * (rho + 0.4))
            if acertar:
                maos.iks[L].mute = False
                p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
                maos.segurar(L, g, dq, pq, polo=Cc + e * (rho + 0.4))
            if L in DEDOS:                      # mão rígida no pegador redondo: os dedos e o polegar fechados no começo
                for n, M in DEDOS[L].items():
                    PB[n].matrix_basis = M.copy()
                p3.atualizar()

    def pose(t):
        """t=0 pegadores em cima da linha do peito, cotovelos dobrados; t=1 braços quase esticados, as mãos em cima dos ombros."""
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

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        g, _ = mq.pegada(1)
        cot = cab("LeftForeArm")
        return ("braços da máquina %.1f° | pegador E (%.3f %.3f %.3f), %.0f mm acima do peito, %.0f mm pros pés do ombro | cotovelo "
                "%.0f/%.0f°, E %.0f mm abaixo do topo do banco | abertura %s° | elevação %s° | antebraço × vertical %s° | punho "
                "%.0f/%.0f° (flexão %s) | palma: cima %s°, frente %s°, dentro %s° | pegada %.2f | escápula %s mm | tronco %.1f° | "
                "coluna %.1f° | cabeça %s° | %s" % (
                    mq.angulo, *g, (g.z - peito_z(g.y)) * 1000, (S["Left"].y - g.y) * 1000, juntas["cotoveloE"],
                    juntas["cotoveloD"], (TOPO - cot.z) * 1000, "/".join("%.0f" % v for v in tc.braco_abertura(jj)),
                    "/".join("%.0f" % v for v in tc.braco_elevacao(jj)),
                    "/".join("%.0f" % v for v in tc.antebraco_vertical(jj)), juntas["punhoE"], juntas["punhoD"],
                    "/".join("%.0f" % v for v in tc.punho_flexao(jj)), "/".join("%.0f" % v for v in tc.palma_cima(jj)),
                    "/".join("%.0f" % v for v in tc.palma_frente(jj)), "/".join("%.0f" % v for v in tc.palma_dentro(jj)),
                    tc.pegada_largura(jj)[0], "/".join("%.0f" % v for v in tc.escapula_frente(jj)),
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    tc.coluna(jj)[0], "/".join("%.0f" % v for v in tc.cabeca_tronco(jj)), maos.info()))

    for t in (0.0, 0.25, 0.5, 0.75, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(mq.pegadores[s], RAIO, COMP_PEGADOR / 2, eixo=(0, 0, 1))) for L, s in LADOS]
    yq = float(S["Left"].y)
    return Cena(pose, mq.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.1, 0.75),
                camera_video=((3.0, yq - 2.5, 1.6), (0, yq - 0.15, 0.72), 50), info=info, apoios=mq.apoios,
                afunda_apoio_mm=20)
