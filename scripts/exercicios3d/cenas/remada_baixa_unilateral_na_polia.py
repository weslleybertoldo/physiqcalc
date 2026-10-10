# Remada Baixa Unilateral na Polia — cena da fábrica 3D (lote 9, 10/10/2026; troca equivalente nos treinos prontos do app). Sem peça
# nova: o banco da remada baixa (equip3d.banco_remada_baixa, o da Remada Baixa na Polia: assento comprido + 2 chapas inclinadas pros
# pés), a polia() com a roldana BAIXA na frente dos pés, logo acima das chapas, e o garfo que gira (gira=True: a mão sai do meio e o
# cabo sai um pouco de lado da roldana), e o puxador D (equip3d.puxador_polia) na mão ESQUERDA.
# t = 0 braço esquerdo esticado pra frente e um pouco pra baixo, a mão com o puxador na frente dos joelhos, acima deles, o ombro
# esquerdo levado pra frente (escápula aberta) e o tórax um pouco virado pra direita · t = 1 o puxador do lado do abdômen, o cotovelo
# dobrado, junto do corpo e atrás da linha das costas, a escápula esquerda fechada (pra trás e um pouco pra baixo) e o tórax um pouco
# virado pra esquerda.
# Técnica — ExRx, Cable One Arm Seated Row: "Sit slightly forward on platform or secured bench in order to grasp cable stirrup with one
# hand. Position hips back with knees slightly bent. Allow shoulder with stirrup to be pulled forward." / "Pull cable attachment to side
# of torso, slightly twisting through waist. Pull shoulder back and push chest forward during contraction. Return until arm is extended
# and shoulder is stretched forward. Repeat. Continue with opposite arm." (a animação do ExRx mostra a mão livre apoiada na coxa e o
# puxador D com o polegar pra cima). A remada sentada no cabo com as 2 mãos (a Remada Baixa na Polia, com as mesmas referências): NSCA
# (Low-pulley seated row) "Sit on the pad with your feet on the supports and your legs parallel." / "Sit upright with your knees
# slightly flexed and your arms fully extended." / "Pull the handles toward your abdomen without jerking your torso."; ACE (Seated Row)
# "pulling the elbows backwards close to the rib cage"; Ronai 2019 "Feet are placed firmly in a shoulder width position against the
# foot plates with the knees comfortably flexed." / "closed, neutral (midpronated) grip" / "the handlebar remains just above the
# knees/legs" / "the upper arm and elbows should not pass behind the back of the rib cage". O exercício do catálogo ("Seated One-arm
# Cable Pulley Rows", Bodybuilding.com, no free-exercise-db): "The right arm can be kept by the waist." / "pull the handles back towards
# your torso while keeping the arms close to it" / "by the time your hand is by your abdominals". A dica da Remada Baixa na Polia
# (mesmo aparelho, 2 mãos): "Coluna neutra e tronco quase fixo." — aqui o tórax gira pouco (GIRO), como manda o ExRx.
# Como o rig faz: sentado igual à Remada Baixa na Polia (tronco em pé, coxas quase na horizontal, joelhos a JOELHO°, solas chapadas nas
# chapas a 30°, tornozelos a ±X_TORNOZELO); pelve, pernas e pés não mexem. O tórax gira em volta do eixo do tronco (osso Spine, Spine1 e
# Spine2, a cintura e as costas; a cabeça vai junto, na linha do tronco) de GIRO[0]° a GIRO[1]° (+ = pra esquerda, o ombro esquerdo
# vai pra trás). A escápula esquerda gira (clavícula em volta do eixo do tórax) de aberta pra frente (t=0) a fechada pra trás e um
# pouco pra baixo (t=1); a direita fica parada. Braço esquerdo: no começo BRACO0° abaixo da horizontal, quase esticado (COTOVELO0°),
# virado pra dentro o que precisa pra mão ficar em x = X_VAO0 (na frente do meio do corpo, na linha do cabo); no fim o braço fica
# FRENTE1° atrás da vertical do tórax e ABRE1° pro lado, com o antebraço ANTEBRACO1° acima da horizontal, na direção do cabo vista de
# cima (a força do cabo passa reto pelo antebraço). O vão da mão anda em linha reta do começo pro fim; a mão fica na linha do antebraço
# (punho reto) com a palma pro meio (pegada neutra, polegar pra cima) e o pegador do puxador ao longo dos nós dos dedos; o aro gira em
# volta do pegador até o plano do cabo e o mosquetão sai na linha dele (equip3d.Puxador.por). Os dedos e o polegar ("volta") fecham uma
# vez, no começo (a mão fica rígida no pegador). Mão direita: apoiada em cima da coxa direita (palma pra baixo, dedos pra frente),
# parada no mundo; o braço direito acompanha o giro do tórax pelo IK (só o cotovelo e o ombro mexem).
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from maos3d import Maos
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
TRABALHA, LIVRE = "Left", "Right"
S_T = 1                                   # lado (sinal) do braço que trabalha
# ── sentado: igual à Remada Baixa na Polia (o mesmo banco, montado do mesmo jeito) ─────────────────────────────────────────────────
TRONCO = 0.0              # tronco na vertical ("Sit upright", NSCA; "The torso remains perpendicular/vertical with the floor", Ronai)
COXA = 3.0                # coxas 3° acima da horizontal (o joelho um pouco acima do quadril)
JOELHO = 30.0             # joelhos levemente dobrados ("Position hips back with knees slightly bent", ExRx)
X_TORNOZELO = 0.17        # tornozelos a ±17 cm: "Feet are placed firmly in a shoulder width position against the foot plates" (Ronai)
APOIO_ANG = 30.0          # chapas a 30° da vertical (Valor BD-71: "The solid plate sits at a 30 degree angle")
TOPO = 0.44               # topo do assento: o do banco() da fábrica
ESP_ASSENTO, LARG_ASSENTO = 0.06, 0.30
COMP_ASSENTO = 0.97       # assento comprido: Legend 906, "The deep 38.25-inch seat"
FRENTE_ASSENTO = 0.22     # o assento vai até 22 cm à frente do quadril
AFUNDA = 0.002            # pele afundando no estofado
AFUNDA_PE = 0.0005        # sola apertando a chapa
CHAPA = (0.16, 0.30, 0.012)
# ── tórax girando um pouco junto da puxada ("slightly twisting through waist", ExRx) ───────────────────────────────────────────────
GIRO = (-9.0, 5.0)        # giro do tórax em volta do eixo do tronco no começo → no fim (graus, + = pra esquerda: o ombro esquerdo
                          # vai pra trás): no começo o ombro que trabalha fica levado pra frente ("Allow shoulder with stirrup to be
                          # pulled forward"), no fim pra trás ("Pull shoulder back")
PARTES_GIRO = (("Spine", 0.30), ("Spine1", 0.35), ("Spine2", 0.35))   # a cintura e as costas dividem o giro
# ── braço que trabalha (esquerdo) ─────────────────────────────────────────────────────────────────────────────────────────────────
BRACO0 = 20.0             # começo: braço 20° abaixo da horizontal (Ronai: "grasped below shoulder height", "roughly parallel with the
                          # ground", "the handlebar remains just above the knees/legs")
COTOVELO0 = 9.0           # começo: cotovelo dobrado 9°, esticado sem travar ("Return until arm is extended", ExRx)
X_VAO0 = 0.10             # começo: vão da mão a 10 cm do meio do corpo (na frente dele, puxado pro cabo, que sai do meio)
FRENTE1 = -25.0           # fim: braço 25° atrás da vertical do tórax (cotovelo na linha das costas: Ronai)
ABRE1 = 12.0              # fim: braço 12° pro lado ("keeping the arms close to it", catálogo; ACE: "close to the rib cage")
ANTEBRACO1 = 3.0          # fim: antebraço 3° acima da horizontal (a mão do lado do abdômen: "to side of torso", ExRx)
PROTRAI = 10.0            # escápula esquerda aberta no começo ("shoulder is stretched forward", ExRx)
RETRAI, DESCE = 10.0, 2.0 # escápula esquerda fechada no fim ("Pull shoulder back", ExRx)
RAIO = 0.0125             # pegador do puxador D: 25 mm (equip3d.puxador_polia, Synergee Single D Handle)
# ── polia ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Y_RODA = 0.30             # roldana 30 cm à frente do meio das chapas (como na Remada Baixa na Polia)
Z_RODA = 0.60             # eixo da roldana a 60 cm do chão: logo acima das chapas (o cabo passa por cima dos pés)
# ── mão livre (direita) apoiada na coxa direita ───────────────────────────────────────────────────────────────────────────────────
MAO_COXA = 0.60           # centro do apoio da palma em cima da coxa, a 60% do quadril até o joelho
MAO_FORA = 0.03           # e isso pra fora da linha do fêmur (m): o antebraço vem do cotovelo, do lado do quadril, quase reto pra frente
DEDOS_DENTRO = 0.0        # dedos da mão livre na direção do antebraço visto de cima e isso a mais pra dentro (graus): o punho só
                          # estende (a mão deita na coxa), sem dobrar pro lado
AFUNDA_MAO = 0.001        # palma livre afundando na pele da coxa (m)
POLO_LIVRE = (0.12, 0.30, 0.0)   # polo do cotovelo livre em relação ao meio ombro–punho (m: pra fora, pra trás, pra cima): o cotovelo
                                 # fica do lado do quadril, um pouco pra trás e pra fora, e o antebraço vai pra frente por cima da coxa (com
                                 # o cotovelo mais junto, 4–8 cm pra fora, o braço entrava 8 mm na cintura)
MAO = lambda L: [L + "Hand"] + ["%sHand%s%d" % (L, d, i) for d in ("Thumb", "Index", "Middle", "Ring", "Pinky") for i in (1, 2, 3)]


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


def _distancia(bvh, P):
    """Menor distância com sinal (m) dos pontos P até a malha do bvh (− = dentro)."""
    menor = 1e9
    for p in P:
        v = Vector(p)
        loc, nor, idx, dist = bvh.find_nearest(v)
        if loc is None:
            continue
        menor = min(menor, -dist if (dist < 0.03 and (v - loc).dot(nor) < 0) else dist)
    return menor


def montar(bon):
    pg.usar_cilindro(RAIO * 2000)     # mão de referência do pegador de 25 mm (antes do Maos)
    pg.usar_polegar("volta")          # polegar dando a volta no pegador (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    # ── 1) sentado (igual à Remada Baixa na Polia): tronco em pé, coxas quase na horizontal, joelhos levemente dobrados, pés nas chapas
    PERNA = ("Hips",) + tuple(L + o for L, _ in LADOS for o in ("UpLeg", "Leg", "Foot", "ToeBase"))
    repouso = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNA}
    pivo0 = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    pe_rep = {L: p3.mundo_osso(rig, L + "Foot").to_3x3().normalized() for L, _ in LADOS}
    t_rep = cab("Neck") - cab("Hips")
    frente_rep = math.degrees(math.atan2(-t_rep.y, t_rep.z))
    coxa_l = (cab("LeftLeg") - cab("LeftUpLeg")).length
    canela_l = (cab("LeftFoot") - cab("LeftLeg")).length
    x_quadril = cab("LeftUpLeg").x
    a_ap = math.radians(APOIO_ANG)
    nrm = Vector((0.0, math.cos(a_ap), math.sin(a_ap)))         # normal da face das chapas (pra quem senta e pra cima)
    sobe = Vector((0.0, -math.sin(a_ap), math.cos(a_ap)))       # ao longo da chapa, pra cima
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
            eixo_j = direcao(s, 0.0).cross(Vector((0, 0, 1))).normalized()
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

    # ── 2) chapas dos pés e o banco (igual à Remada Baixa na Polia) ───────────────────────────────────────────────────────────────
    chapas = {}
    for L, s in LADOS:
        P = pele((L + "Foot", L + "ToeBase"))
        dn = P @ np.array(nrm)
        F_ = float(dn.min()) + AFUNDA_PE
        sola = P[dn < F_ + 0.02]
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

    # ── 3) tórax girando em volta do eixo do tronco (a pelve parada) e a escápula esquerda ──────────────────────────────────────────
    cima0 = (cab("Neck") - cab("Hips")).normalized()
    base_coluna = {n: PB[p3.P + n].matrix_basis.copy() for n, _ in PARTES_GIRO}
    base_ombro = PB[p3.P + TRABALHA + "Shoulder"].matrix_basis.copy()

    def girar_tronco(t):
        for n, _ in PARTES_GIRO:
            PB[p3.P + n].matrix_basis = base_coluna[n].copy()
        p3.atualizar()
        g = p3.lerp(GIRO[0], GIRO[1], t)
        if g:
            for n, f in PARTES_GIRO:
                p3.girar_osso(rig, n, Matrix.Rotation(math.radians(g * f), 3, cima0))

    def eixos_torax():
        return (Vector(v) for v in tc.eixos_torax(ck.posicoes(rig)))

    def escapula(t):
        PB[p3.P + TRABALHA + "Shoulder"].matrix_basis = base_ombro.copy()
        p3.atualizar()
        cima, _, frente = eixos_torax()
        ret, des = p3.lerp(-PROTRAI, RETRAI, t), p3.lerp(0.0, DESCE, t)
        if ret:
            p3.girar_osso(rig, TRABALHA + "Shoulder", Matrix.Rotation(math.radians(S_T * ret), 3, cima))
        if des:
            p3.girar_osso(rig, TRABALHA + "Shoulder", Matrix.Rotation(math.radians(-S_T * des), 3, frente))

    def tronco(t):
        girar_tronco(t)
        escapula(t)

    S_rep = cab(TRABALHA + "Arm")
    for t in (0.0, 1.0):
        tronco(t)
        jj = ck.posicoes(rig)
        print("TRONCO t=%.0f | giro do tórax %.1f° | ombro E andou (%+.1f %+.1f %+.1f) mm | escapula_frente %s mm | ombros_nivel %.1f° | "
              "tronco %.1f° | coluna %.1f° | cabeça × tronco %.1f°" % (
                  t, tc.tronco_giro(jj)[0], *((cab(TRABALHA + "Arm") - S_rep) * 1000),
                  "/".join("%.0f" % v for v in tc.escapula_frente(jj)), tc.ombros_nivel(jj)[0],
                  ck.angulo_chave(rig, {"medida": "tronco"})[0], tc.coluna(jj)[0], tc.cabeca_tronco(jj)[0]), flush=True)

    # ── 4) mão livre (direita) apoiada em cima da coxa direita: posta uma vez (com o tórax no meio do giro) e guardada no mundo ──────
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")
    tronco(0.5)
    livre = mao_na_coxa(bon, maos, LIVRE, MAO_COXA, MAO_FORA, DEDOS_DENTRO)
    print("MÃO LIVRE | %s" % livre["texto"], flush=True)
    M_mao_livre = p3.mundo_osso(rig, LIVRE + "Hand").to_3x3().normalized()
    W_livre = cab(LIVRE + "Hand")
    polo_livre_rel = maos.polos[LIVRE].location - cab(LIVRE + "Arm")
    dedos_livre = {pb.name: pb.matrix_basis.copy() for pb in PB
                   if pb.name[len(p3.P):].startswith(LIVRE + "Hand") and pb.name[len(p3.P):] != LIVRE + "Hand"}

    def braco_livre():
        """Braço direito: IK até o punho guardado (o polo segue o ombro), congelado em FK; o antebraço gira pra palma guardada e a
        mão fica exatamente com a orientação guardada (parada no mundo); os dedos voltam pro que foi medido encostando na coxa."""
        iks, punhos, polos = maos.iks, maos.punhos, maos.polos
        iks[LIVRE].mute = False
        punhos[LIVRE].location = W_livre
        polos[LIVRE].location = cab(LIVRE + "Arm") + polo_livre_rel
        p3.atualizar()
        nomes_ = (LIVRE + "Arm", LIVRE + "ForeArm")
        mats = [PB[p3.P + n].matrix.copy() for n in nomes_]
        iks[LIVRE].mute = True
        for n, M in zip(nomes_, mats):
            PB[p3.P + n].matrix = M
            p3.atualizar()
        _girar_antebraco(rig, LIVRE, _palma_com(rig, LIVRE, M_mao_livre))
        R = M_mao_livre @ p3.mundo_osso(rig, LIVRE + "Hand").to_3x3().normalized().transposed()
        p3.girar_osso(rig, LIVRE + "Hand", R)
        for n, M in dedos_livre.items():
            PB[n].matrix_basis = M.copy()
        p3.atualizar()

    # ── 5) braço esquerdo: o vão da mão em relação ao punho, no referencial da mão (dedos, palma) ─────────────────────────────────────
    Lb = (cab(TRABALHA + "ForeArm") - cab(TRABALHA + "Arm")).length
    La = (cab(TRABALHA + "Hand") - cab(TRABALHA + "ForeArm")).length
    pux = e3.puxador_polia("puxador", raio=RAIO)
    CIMA = Vector((0, 0, 1))

    def mao_no(f_):
        """Dedos (na linha do antebraço f_: punho reto) e palma (pro meio do corpo, na horizontal: pegada neutra)."""
        dq = f_.normalized()
        pq = (dq.cross(CIMA) * S_T)
        pq = (pq - dq * pq.dot(dq)).normalized()
        return dq, pq

    tronco(0.0)
    dq_r, pq_r = mao_no(Vector((0, -1, -0.2)))
    g_r = cab(TRABALHA + "Arm") + Vector((-S_T * 0.08, -0.52, -0.16))
    maos.segurar(TRABALHA, g_r, dq_r, pq_r, polo=cab(TRABALHA + "Arm") + Vector((S_T * 0.3, 0.3, -0.6)))
    off = g_r - cab(TRABALHA + "Hand")
    OFF = (off.dot(dq_r), off.dot(pq_r), off.dot(dq_r.cross(pq_r)))
    print("MÃO %s | vão − punho %.1f mm ao longo dos dedos, %.1f mm pra palma, %.1f mm de lado | erro do vão %.1f mm | Lb %.3f La %.3f" % (
        TRABALHA, OFF[0] * 1000, OFF[1] * 1000, OFF[2] * 1000, maos.erro[TRABALHA] * 1000, Lb, La), flush=True)

    def vao_menos_punho(dq, pq):
        return dq * OFF[0] + pq * OFF[1] + dq.cross(pq) * OFF[2]

    def comeco():
        """Começo: o braço BRACO0° abaixo da horizontal, o cotovelo dobrado COTOVELO0° (pra baixo), virado pra dentro até o vão da mão
        ficar em x = X_VAO0. Devolve o vão, o cotovelo, o punho e o antebraço."""
        Sx = cab(TRABALHA + "Arm")
        p = math.radians(BRACO0)
        q = math.radians(BRACO0 - COTOVELO0)

        def montar_lat(lat):
            b = Vector((S_T * math.sin(lat) * math.cos(p), -math.cos(lat) * math.cos(p), -math.sin(p)))
            f_ = Vector((S_T * math.sin(lat) * math.cos(q), -math.cos(lat) * math.cos(q), -math.sin(q)))
            E = Sx + b * Lb
            W = E + f_ * La
            dq, pq = mao_no(f_)
            return W + vao_menos_punho(dq, pq), E, W, f_

        lo, hi = math.radians(-40), math.radians(20)
        for _ in range(40):
            meio = (lo + hi) / 2
            if S_T * montar_lat(meio)[0].x < X_VAO0:
                lo = meio
            else:
                hi = meio
        return montar_lat((lo + hi) / 2)

    def fim(pol):
        """Fim: o braço FRENTE1° atrás da vertical do tórax e ABRE1° pro lado; o antebraço ANTEBRACO1° acima da horizontal, apontando
        (visto de cima) pra roldana — na linha do cabo."""
        Sx = cab(TRABALHA + "Arm")
        cima, lado, frente = eixos_torax()
        fora = -lado * S_T
        bf, ab = math.radians(FRENTE1), math.radians(ABRE1)
        b = fora * math.sin(ab) + (-cima * math.cos(bf) + frente * math.sin(bf)) * math.cos(ab)
        E = Sx + b * Lb
        g1 = math.radians(ANTEBRACO1)
        h = 0.0
        for _ in range(4):                       # a direção do cabo depende de onde a mão fica: 4 voltas acertam
            f_ = Vector((math.sin(h) * math.cos(g1), -math.cos(h) * math.cos(g1), math.sin(g1)))
            W = E + f_ * La
            dq, pq = mao_no(f_)
            g = W + vao_menos_punho(dq, pq)
            d = pol.direcao(g)
            h = math.atan2(d.x, -d.y)
        return g, E, W, f_

    # ── 6) a roldana (baixa, na frente das chapas, logo acima delas, com o garfo que gira) e o caminho do vão da mão ────────────────
    y_ch = sum(C.y for C in chapas.values()) / 2
    y_rold = y_ch - Y_RODA
    pol = e3.polia("polia", x=0.0, y=y_rold, altura=Z_RODA, frente=(0, 1, 0), gira=True)
    tronco(0.0)
    G0 = comeco()
    tronco(1.0)
    G1 = fim(pol)
    for nome, Gx in (("COMEÇO", G0), ("FIM", G1)):
        g, E, W, f_ = Gx
        d = pol.direcao(g)
        print("%s | vão (%.4f %.4f %.4f) = %.0f mm acima do quadril | cabo %.1f° abaixo da horizontal e %.1f° de lado | antebraço "
              "%.1f° da horizontal, %.1f° pra dentro | cotovelo (%.3f %.3f %.3f) | punho (%.3f %.3f %.3f)" % (
                  nome, *g, (g.z - H.z) * 1000, math.degrees(math.asin(-d.z)), math.degrees(math.atan2(d.x, -d.y)),
                  math.degrees(math.asin(f_.z)), math.degrees(math.atan2(-S_T * f_.x, -f_.y)), *E, *W), flush=True)
    print("POLIA | roldana y %.3f z %.3f | chapas y %.3f" % (y_rold, Z_RODA, y_ch), flush=True)

    def circulo(Sx, W):
        d = W - Sx
        u = d.normalized()
        a = (Lb ** 2 - La ** 2 + d.length_squared) / (2 * d.length)
        return Sx + u * a, u, math.sqrt(max(Lb ** 2 - a * a, 1e-8))

    POLO = []
    for t_, Gx in ((0.0, G0), (1.0, G1)):
        tronco(t_)
        Sx = cab(TRABALHA + "Arm")
        g, E, W, f_ = Gx
        Cc, uu, rho = circulo(Sx, W)
        v = E - Cc
        POLO.append(E + (v - uu * v.dot(uu)).normalized() * 0.5 - Sx)

    # ── 7) pose: tórax, escápula, mão livre na coxa e o vão da mão esquerda em linha reta; o puxador segue a mão ────────────────────
    estado = {}
    DEDOS = {}

    def pose(t):
        """t=0 braço esquerdo esticado, escápula aberta, tórax virado pra direita; t=1 o puxador do lado do abdômen, o cotovelo
        atrás, a escápula fechada, o tórax virado pra esquerda."""
        if t <= 1e-9:
            estado.clear()
        tronco(t)
        braco_livre()
        c = G0[0].lerp(G1[0], t)
        f = estado.get("f", G0[3].lerp(G1[3], t).normalized())
        Sx = cab(TRABALHA + "Arm")
        polo = Sx + POLO[0].lerp(POLO[1], t)
        for volta in range(2):                 # antebraço de verdade → mão na linha dele (punho reto) → IK
            dq, pq = mao_no(f)
            maos.segurar(TRABALHA, c, dq, pq, polo=polo)
            f = (cab(TRABALHA + "Hand") - cab(TRABALHA + "ForeArm")).normalized()
        estado["f"] = f
        eixo = pg._base(rig, TRABALHA)[1]       # pegador ao longo dos nós dos dedos (indicador → mínimo)
        eng = pux.por(c, eixo, pol.direcao)
        pol.ligar(eng)
        p3.atualizar()
        if DEDOS:                               # dedos e polegar: fechados UMA vez (no começo) e iguais em todo quadro
            for n, M in DEDOS.items():
                PB[n].matrix_basis = M.copy()
        else:
            pose.dedos = pg.fechar_em_volta(bon, TRABALHA, c, eixo, RAIO)
        p3.atualizar()

    pose.dedos = {}
    pose(1.0)                                  # polo certo do cotovelo com ele bem dobrado (fim)
    maos.iks[TRABALHA].mute = False
    e_ = p3.acertar_polo(rig, maos.iks[TRABALHA], TRABALHA + "ForeArm", TRABALHA + "Arm", TRABALHA + "Hand")
    print("polo cotovelo %s erro %.3f ang %d" % (TRABALHA, *e_), flush=True)
    estado.clear()
    pose(0.0)                                  # os dedos e o polegar fecham no começo e ficam assim
    DEDOS.update({pb.name: pb.matrix_basis.copy() for pb in PB
                  if pb.name[len(p3.P):].startswith(TRABALHA + "Hand") and pb.name[len(p3.P):] != TRABALHA + "Hand"})
    print("DEDOS %s | %s" % (TRABALHA, pose.dedos), flush=True)

    # ── 8) medidas pro relatório: folgas da mão, do cabo e da mão livre ─────────────────────────────────────────────────────────────
    co_, tri0, (nomes_, dono_) = _malha(bon)
    pernas_pts = co_[_grupo(nomes_, dono_, ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot",
                                              "LeftToeBase", "RightToeBase"))]
    coxa_d = _grupo(nomes_, dono_, (LIVRE + "UpLeg",))
    bvh_coxa_d = BVHTree.FromPolygons([tuple(p) for p in co_], [tuple(x) for x in tri0[coxa_d[tri0].all(axis=1)]],
                                      all_triangles=True)
    PEGA = ("puxador_cano",)

    def cabo_seg():
        return pol.saida, pol.saida + (pol.cabo.matrix_world.to_3x3() @ Vector((0, 0, 1))).normalized() * pol.comprimento

    def folgas_maos():
        """Mão esquerda × puxador fora do pegador (aro, parafusos, mosquetão, bola) e mão × cabo, mm (− = entrou)."""
        co, tri_, (nomes, dono) = _malha(bon)
        bvh = ck._bvh(co, tri_)
        mao = _grupo(nomes, dono, tuple(MAO(TRABALHA)))
        menor_t, onde = 1e9, ""
        for raiz in (pux.alca, pux.engate):
            for ob in ck._malhas(raiz):
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
        a, b = cabo_seg()
        cabo_m = float(_dist_segmento(co[mao], a, b).min()) - 0.003
        return menor_t * 1000, onde, cabo_m * 1000

    def folgas_corpo():
        """Cabo × pernas e × tronco; mão esquerda × tronco; antebraço esquerdo × tronco; mão livre × coxa direita (mm)."""
        co, tri_, (nomes, dono) = _malha(bon)
        a, b = cabo_seg()
        tronco_pts = co[_grupo(nomes, dono, ("Hips", "Spine", "Spine1", "Spine2"))]
        cabo_p = float(_dist_segmento(pernas_pts, a, b).min()) - 0.003
        cabo_t = float(_dist_segmento(tronco_pts, a, b).min()) - 0.003
        tr = _grupo(nomes, dono, ("Hips", "Spine", "Spine1", "Spine2"))
        bvh_t = ck._bvh(co, tri_[tr[tri_].all(axis=1)])
        mt = _distancia(bvh_t, co[_grupo(nomes, dono, tuple(MAO(TRABALHA)))])
        at = _distancia(bvh_t, co[_grupo(nomes, dono, (TRABALHA + "ForeArm",))])
        ml = _distancia(bvh_coxa_d, co[_grupo(nomes, dono, tuple(MAO(LIVRE)))])
        al = _distancia(bvh_coxa_d, co[_grupo(nomes, dono, (LIVRE + "ForeArm",))])
        return cabo_p * 1000, cabo_t * 1000, mt * 1000, at * 1000, ml * 1000, al * 1000

    def info():
        jj = ck.posicoes(rig)
        jt = ck.medir_juntas(rig)
        c = pux.pegador.matrix_world.to_translation()
        ft, onde, fc = folgas_maos()
        fp, ftr, fmt, fat, fml, fal = folgas_corpo()
        u = pol.direcao(c)
        return ("vão (%.3f %.3f %.3f) | cabo %.1f° abaixo da horizontal | garfo %.1f° | cotovelo E %.0f° | braço × tronco E %.0f° | "
                "abertura E %.0f° | antebraço × horizontal E %.0f° | punho E %.0f° D %.0f° | palma pro meio E %.0f° | escápula %s mm | "
                "giro do tórax %.1f° | tronco %.1f° | coluna %.1f° | mão × puxador fora do pegador %.1f mm (%s) | mão × cabo %.0f mm | "
                "cabo × pernas %.0f mm | cabo × tronco %.0f mm | mão E × tronco %.1f mm | antebraço E × tronco %.1f mm | mão livre × "
                "coxa %.1f mm | antebraço livre × coxa %.1f mm | %s" % (
                    *c, math.degrees(math.asin(-u.z)), pol.giro, jt["cotoveloE"], tc.braco_frente(jj)[0],
                    tc.cotovelo_tronco(jj)[0],
                    ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["ForeArm", "Hand"]})[0], jt["punhoE"], jt["punhoD"],
                    tc.palma_dentro(jj)[0], "/".join("%.0f" % v for v in tc.escapula_frente(jj)), tc.tronco_giro(jj)[0],
                    ck.angulo_chave(rig, {"medida": "tronco"})[0], tc.coluna(jj)[0], ft, onde, fc, fp, ftr, fmt, fat, fml, fal,
                    maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(TRABALHA, ck.Barra(pux.pegador, raio=RAIO, meio_compr=pux.meia))]
    yq = float(H.y)
    return Cena(pose, pux.raizes + pol.raizes + bc.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.5, 0.7),
                camera_video=((3.6, yq + 1.2, 1.5), (0, yq - 0.55, 0.65), 50), info=info, apoios=bc.apoios, afunda_apoio_mm=20)


def _congelar(rig, maos, L):
    PB = rig.pose.bones
    nomes_ = (L + "Arm", L + "ForeArm")
    mats = [PB[p3.P + n].matrix.copy() for n in nomes_]
    maos.iks[L].mute = True
    for n, M in zip(nomes_, mats):
        PB[p3.P + n].matrix = M
        p3.atualizar()


def _girar_antebraco(rig, L, quer):
    """Prona/supina o antebraço `L` (em volta do eixo dele) pra palma ir pra `quer` (projetado ⟂ ao antebraço)."""
    f0, f1 = p3.cabeca(rig, L + "ForeArm"), p3.cabeca(rig, L + "Hand")
    ax = (f1 - f0).normalized()
    quer = quer - ax * quer.dot(ax)
    tem = pg._base(rig, L)[0]
    tem = tem - ax * tem.dot(ax)
    if quer.length < 1e-6 or tem.length < 1e-6:
        return
    quer.normalize()
    tem.normalize()
    ang = math.atan2(tem.cross(quer).dot(ax), tem.dot(quer))
    p3.girar_osso(rig, L + "ForeArm", Matrix.Rotation(ang, 3, ax))


def _palma_com(rig, L, M_mao):
    """Palma (normal, mundo) que a mão `L` teria com a orientação M_mao (3×3 do osso no mundo): a palma de agora levada pela rotação
    que leva a mão de agora pra M_mao."""
    M_agora = p3.mundo_osso(rig, L + "Hand").to_3x3().normalized()
    return (M_mao @ M_agora.transposed()) @ pg._base(rig, L)[0]


def _mao_quadro(rig, L, dq, pq):
    """Gira o osso da mão (em volta do punho) pra os dedos irem pra dq e a palma pra pq (mundo)."""
    h0 = p3.cabeca(rig, L + "Hand")
    d = (p3.ponta(rig, L + "Hand") - h0).normalized()
    n = pg._base(rig, L)[0]
    n = (n - d * n.dot(d)).normalized()
    F_tem = Matrix((d, n, d.cross(n))).transposed()
    pq = (pq - dq * pq.dot(dq)).normalized()
    F_quer = Matrix((dq, pq, dq.cross(pq))).transposed()
    p3.girar_osso(rig, L + "Hand", F_quer @ F_tem.transposed())


def mao_na_coxa(bon, maos, L, frac, fora, dentro):
    """Mão `L` (a livre) apoiada em cima da coxa do mesmo lado: palma pra baixo, dedos na direção do antebraço visto de cima (`dentro`
    graus a mais pra dentro), o centro do apoio da palma a `frac` do quadril até o joelho e `fora` m pra fora da linha do fêmur, e a
    pele afundando AFUNDA_MAO; o punho vai por IK (o cotovelo pro lado do polo POLO_LIVRE) e cada dedo (e o polegar) dobra até encostar
    na pele da coxa. Como a mão de descanso da Rosca Punho com Halter. Devolve um dict com as medidas."""
    rig = bon.rig
    PB = rig.pose.bones
    s = 1 if L == "Left" else -1
    H, K = p3.cabeca(rig, L + "UpLeg"), p3.cabeca(rig, L + "Leg")
    alvo = H.lerp(K, frac) + Vector((s * fora, 0.0, 0.0))
    a = math.radians(dentro)
    pq = Vector((0, 0, -1))

    def dedos():
        """Dedos na direção do antebraço visto de cima (o punho só estende pra mão deitar na coxa) e `dentro` graus pra dentro."""
        f = p3.cabeca(rig, L + "Hand") - p3.cabeca(rig, L + "ForeArm")
        h = Vector((f.x, f.y, 0.0)).normalized()
        dentro_v = Vector((0, 0, 1)).cross(h) * -s                    # pro meio do corpo (+X na mão direita)
        return (h * math.cos(a) + dentro_v * math.sin(a)).normalized()

    p3.soltar_dedos(rig, L)
    pg.juntar_dedos(rig, L, 0.6)
    p3.fechar_mao(rig, L, angulos=(6, 8, 4), polegar=(10, 20, 15))     # mão relaxada: dedos quase retos
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    m = _grupo(nomes, dono, (L + "UpLeg",))
    bvh = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in tri[m[tri].all(axis=1)]], all_triangles=True)
    S = p3.cabeca(rig, L + "Arm")
    W = alvo + Vector((0, 0.07, 0.12))
    maos.polos[L].location = (S + W) / 2 + Vector((s * POLO_LIVRE[0], POLO_LIVRE[1], POLO_LIVRE[2]))
    PB[p3.P + L + "Hand"].matrix_basis = Matrix()
    dz = 0.0
    for volta in range(12):
        maos.iks[L].mute = False
        maos.punhos[L].location = W
        p3.atualizar()
        if volta == 0:
            e = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
            print("polo cotovelo livre erro %.3f ang %d" % e, flush=True)
        _congelar(rig, maos, L)
        _girar_antebraco(rig, L, pq)
        _mao_quadro(rig, L, dedos(), pq)
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        P = co[_grupo(nomes, dono, (L + "Hand",))]
        baixo = P[P[:, 2] < P[:, 2].min() + 0.008].mean(axis=0)             # onde a palma apoia
        pol = co[np.array([n.startswith(L + "HandThumb") for n in nomes] + [False])[dono]]
        dz = min(_distancia(bvh, P), _distancia(bvh, pol)) + AFUNDA_MAO     # a base do polegar também apoia
        mexe = Vector((alvo.x - baixo[0], alvo.y - baixo[1], -dz))
        if mexe.length < 0.0007:
            break
        W = W + mexe
    _dedos_encostando(bon, L, bvh)
    pol_ = _polegar_encostando(bon, L, bvh)
    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    jt = ck.medir_juntas(rig)
    mao_d = _distancia(bvh, co[_grupo(nomes, dono, tuple(MAO(L)))])
    ante_d = _distancia(bvh, co[_grupo(nomes, dono, (L + "ForeArm",))])
    return dict(texto="palma → coxa %+.1f mm | mão → coxa %+.1f mm | antebraço → coxa %+.1f mm | punho %.0f° cotovelo %.0f° ombro "
                      "%.0f° | polegar λ %.1f (%+.1f mm) | %d voltas" % (
                          (dz - AFUNDA_MAO) * 1000, mao_d * 1000, ante_d * 1000, jt["punho" + ("E" if s > 0 else "D")],
                          jt["cotovelo" + ("E" if s > 0 else "D")], jt["ombro" + ("E" if s > 0 else "D")], pol_[1], pol_[2] * 1000,
                          volta + 1))


def _dedos_encostando(bon, L, bvh):
    """Cada dedo (fora o polegar) dobra as 3 juntas na proporção da mão de referência, do mais esticado pro mais dobrado, até a
    pele encostar na pele da coxa (sem entrar) — como na Rosca Punho com Halter."""
    rig = bon.rig
    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    pos = {n: i for i, n in enumerate(nomes)}
    palma_n, eixo_nos = pg._base(rig, L)[:2]
    for d in p3.DEDOS:
        ossos = ["%sHand%s%d" % (L, d, i) for i in (1, 2, 3)]
        pts = {o: co[dono == pos[o]] for o in ossos}
        cab = {o: np.array(p3.cabeca(rig, o)) for o in ossos}
        ponta = np.array(p3.ponta(rig, ossos[-1]))
        f = (p3.ponta(rig, ossos[0]) - p3.cabeca(rig, ossos[0])).normalized()
        sinal = 1 if eixo_nos.cross(f).dot(palma_n) > 0 else -1
        ref = pg.ANGULOS_REF[d]
        escolha = None
        for lam in np.arange(-0.10, 0.61, 0.02):
            angs = [lam * ref[k] * sinal for k in range(3)]
            pp = pg._cadeia_pts(pts, cab, ponta, ossos, [eixo_nos] * 3, angs)
            dmin = _distancia(bvh, np.concatenate([pp[o] for o in ossos])[::2])
            if dmin < -0.0015:                               # entrou: fica no anterior
                break
            escolha = angs
            if dmin < 0.001:                                 # encostou
                break
        for k, o in enumerate(ossos):
            if escolha and escolha[k]:
                p3.girar_osso(rig, o, p3.rot_eixo(escolha[k], eixo_nos))


def _polegar_encostando(bon, L, bvh):
    """Polegar solto do lado do indicador: dobra (ou abre) até encostar na pele da coxa sem entrar — como na Rosca Punho."""
    rig = bon.rig
    PB = rig.pose.bones
    ossos = [L + "HandThumb%d" % i for i in (1, 2, 3)]
    melhor = None
    for lam in np.arange(-1.5, 1.51, 0.1):
        for o in ossos:
            PB[p3.P + o].matrix_basis = Matrix()
        p3.atualizar()
        p3.fechar_mao(rig, L, angulos=(0, 0, 0), polegar=tuple(lam * g for g in (10, 20, 15)))
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        d = _distancia(bvh, co[np.array([n in ossos for n in nomes] + [False])[dono]])
        nota = abs(d - 0.0005) if d >= -0.0015 else 1 + abs(d)
        if melhor is None or nota < melhor[0]:
            melhor = (nota, lam, d)
    for o in ossos:
        PB[p3.P + o].matrix_basis = Matrix()
    p3.atualizar()
    p3.fechar_mao(rig, L, angulos=(0, 0, 0), polegar=tuple(melhor[1] * g for g in (10, 20, 15)))
    return melhor
