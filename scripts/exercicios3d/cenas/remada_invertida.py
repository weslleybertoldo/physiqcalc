# Remada Invertida — cena da fábrica 3D (lote 9, 10/10/2026). Peso corporal, pendurado embaixo da barra PARADA do Smith
# (equip3d.smith, a peça do Agachamento no Smith): a barra fica presa no gancho, numa altura baixa, e a pessoa deita de costas
# embaixo dela. As frases das fontes estão na ficha (referencias); aqui, o essencial:
#   ExRx, Inverted Row: "Lay on back under fixed horizontal bar. Grasp bar with wide overhand grip."; "Keeping body straight, pull
#   body up to bar. Pull shoulders back at top of movement with chest high. Return until arms are extended and shoulders are
#   stretched forward."; "Fixed bar should be just high enough to allow arm to fully extend."; NSCA PTQ 10.2 (2023): "The client
#   hangs under a low bar with a grossly horizontal body position"; Snarr e Esco, JEPonline 2013: "The IR is typically performed
#   using a standard fixed-position barbell on a squat rack or smith machine with the exerciser in a supine position directly
#   beneath the bar with the feet on the floor and hands placed on the bar with a pronated grip" e, no estudo, "until the chest
#   reached the level of the hands".
# t = 0 embaixo: braços estendidos (cotovelo 8°/13°), ombros soltos pra frente (escápulas protraídas), corpo reto dos calcanhares
# aos ombros, quase deitado (~14° do chão, só os calcanhares no chão) · t = 1 em cima: o peito chega quase na barra (18 mm, sem
# encostar), cotovelos dobrados (~132°) indo pra trás, pro chão, embaixo das mãos, escápulas retraídas, corpo ainda reto (~32°).
# Como o rig faz: em pé, os joelhos esticam, o quadril estende até o centro dele ficar na reta ombro → tornozelo (a Flexão de
# Braço, lote 7) e o pé fica no ângulo de em pé (tornozelo neutro, a ponta pra cima); o corpo inteiro gira pra trás em volta de
# um eixo que passa pelo ponto de apoio dos DOIS calcanhares (fixo no chão: o calcanhar não escorrega, só gira em cima do ponto) —
# o corpo é uma prancha rígida que sobe e desce girando no calcanhar. Quem anda é o CORPO: as mãos ficam paradas na barra (IK
# analítico do ombro até o vão da mão, _segurar/_ik_braco). A escápula gira em volta do eixo do tronco: protrai embaixo e retrai
# em cima.
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import polegar3d as P3
import checagem3d as ck
import tecnica3d as tc
from maos3d import Maos
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
RAIO = 0.015            # barra de 30 mm na pegada (a do Smith: Titan Smith Machine, "Barbell Shaft Diameter: 30mm")
PINO = 0.90             # altura do pino da coluna em que o gancho da barra fica preso (pinos a cada 10 cm, de 0,40 m pra cima)
SOBRE_PINO = 0.012      # eixo da barra acima do centro do pino (o braço do gancho em cima dele)
Y_BARRA = 0.0           # linha da barra (os trilhos do Smith ficam nela)
JOELHO = 2.0            # flexão do joelho (graus): estendido (ExRx: "Keeping body straight"); em pé o boneco tem 7,5°
PES_X = 0.10            # tornozelos a ±10 cm do meio: pés mais ou menos na largura do quadril (em pé o boneco fica com ±18 cm)
COXAS_MM = 1.0          # ... mas sem uma coxa entrar na outra mais que isso (a checagem aceita 2 mm): se entrar, os pés afastam
                        # (o boneco musculoso não amassa a parte de dentro da coxa; a Flexão de Braço, lote 7)
QUADRIL_LINHA = 0.0     # centro do quadril na reta ombro → tornozelo (mm, tecnica3d.quadril_linha_ombro_tornozelo), com a
                        # escápula no meio do caminho
COTOVELO0 = 6.0         # flexão do cotovelo embaixo (graus): estendido sem travar (ExRx: "Return until arms are extended")
FOLGA_PEITO = 0.018     # em cima, pele do peito → superfície da barra (m): o peito chega na barra sem encostar (ExRx: "pull body up
                        # to bar"; Snarr e Esco 2013: "until the chest reached the level of the hands"); com 10 mm o cotovelo ia a
                        # 136–139° e o antebraço entrava 5–8 mm no bíceps a 13 cm da junta (o boneco é musculoso)
PEITO_Z = 1.22          # ponto do peito (na linha do meio, altura de em pé; ombro em 1,37 e xifoide em ~1,25) que fica embaixo da
                        # barra em cima: a parte de baixo do peito (ExRx: "lower chest is positioned under bar")
PEGADA = 1.55           # distância entre os vãos das mãos ÷ distância entre as articulações dos ombros: um pouco mais aberta
                        # que os ombros (ExRx: "wide overhand grip"); no boneco ~1,2 = mãos na largura dos ombros
ESCAPULA = (8.0, -18.0) # giro da clavícula em volta do eixo do tronco (graus): + protraída embaixo ("shoulders are stretched
                        # forward") → − retraída em cima ("Pull shoulders back at top of movement"), ExRx
AFUNDA_CALC = 0.0005    # o calcanhar aperta o chão (m) no ponto de apoio
ALINHAR = 1.0           # quanto os dedos seguem o antebraço (maos3d): punho reto (ACE, TRX Back Row: "Keep your wrists neutral
                        # (straight, not bent)"); com 0,8 a mão dependia do "pra cima" e, perto do braço esticado, o IK tinha 2
                        # soluções (cotovelo reto ou 12° dobrado) que trocavam de um quadro pro outro
DEDOS_Q = Vector((0, 0, 1))      # dedos pra cima, por cima da barra
PALMA_Q = Vector((0, -1, 0))     # pegada pronada: palma virada pros pés (o dorso da mão pra cabeça), como a da Barra Fixa
VOLTAS = 40             # voltas da correção do punho (_segurar, amortecida): para antes, com o vão da mão a menos de 0,5 mm
TRONCO = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder")
FORA_PES = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder", "LeftArm", "RightArm",
            "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg")


def _malha(bon, niveis=1):
    return ck._avaliar(bon.corpo, niveis)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _polegar_nos_angulos(bon, lado, q):
    """Polegar da mão `lado` na postura anatômica q = (cmc_flex, cmc_abd, cmc_rot, mcp_flex, mcp_abd, ip_flex), em graus — a mesma
    conta do pg.polegar_em_volta quando ele acha a postura (polegar3d.eixos_do_polegar + rotacoes, osso por osso); a do Agachamento
    no Smith (lote 4)."""
    rig = bon.rig
    ossos = [lado + "HandThumb%d" % i for i in (1, 2, 3)]
    for o in ossos:
        rig.pose.bones[p3.P + o].matrix_basis = Matrix.Identity(4)
    p3.atualizar()
    cab = [np.array(p3.cabeca(rig, o)) for o in ossos]
    eixos = P3.eixos_do_polegar(np.array(pg._base(rig, lado)[0]), cab, np.array(p3.ponta(rig, ossos[2])))
    for o, R in zip(ossos, P3.rotacoes(eixos, q)):
        if not np.allclose(R, np.eye(3)):
            p3.girar_osso(rig, o, Matrix(R.tolist()))


def _ik_braco(rig, lado, W, polo):
    """IK analítico do braço (2 ossos), no lugar do IK do Blender: o punho (cabeça do osso Hand) em W e o cotovelo no plano (ombro,
    W, polo), do lado do polo — sempre, até com o braço quase esticado (o IK do Blender, ali, às vezes dobrava o cotovelo pro outro
    lado: prévia de 10/10, um braço 13° pra trás do outro na mesma pose). Parte do braço de repouso (base zerada): o braço gira até
    o cotovelo, levando o plano da dobra do repouso pro plano novo (o mesmo giro do braço que o IK do Blender faz com o polo), e o
    antebraço gira só na dobra do cotovelo até o punho."""
    S = p3.cabeca(rig, lado + "Arm")
    E0, W0 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
    Lb, La = (E0 - S).length, (W0 - E0).length
    d = W - S
    dl = min(d.length, Lb + La - 1e-6)
    u = d.normalized()
    a = (Lb * Lb - La * La + dl * dl) / (2 * dl)
    h = math.sqrt(max(Lb * Lb - a * a, 0.0))
    v = polo - S
    v = (v - u * v.dot(u)).normalized()
    E = S + u * a + v * h
    # braço: a direção (E − S) e a normal do plano da dobra (v × u: a do repouso, (E0 − S) × (W0 − E0), vira esta)
    b0, n0 = (E0 - S).normalized(), (E0 - S).cross(W0 - E0)
    n0 = (n0 - b0 * n0.dot(b0)).normalized()
    b1, n1 = (E - S).normalized(), v.cross(u)
    n1 = (n1 - b1 * n1.dot(b1)).normalized()
    F0 = Matrix((b0, n0, b0.cross(n0))).transposed()
    F1 = Matrix((b1, n1, b1.cross(n1))).transposed()
    p3.girar_osso(rig, lado + "Arm", F1 @ F0.transposed())
    f0 = p3.cabeca(rig, lado + "Hand") - p3.cabeca(rig, lado + "ForeArm")
    p3.girar_osso(rig, lado + "ForeArm", f0.rotation_difference(W - p3.cabeca(rig, lado + "ForeArm")).to_matrix())


def _segurar(maos, lado, g, dedos_q, palma_q, polo, alinhar=0.0, voltas=40, passo=0.6, eixo=None):
    """O maos3d.Maos.segurar (IK do braço até o punho → antebraço gira pra palma → o resto no punho → corrige o punho até o vão da mão
    cair em g), com 3 mudanças: o IK é o analítico (_ik_braco), partindo do repouso a cada volta (o resultado não depende do quadro
    anterior); a correção é AMORTECIDA (`passo` < 1: perto do braço esticado a mão, que segue o antebraço, anda quase o mesmo tanto
    que o punho, e a correção cheia oscilava — o vão da mão pulava entre 1 e 13 mm); e, com `eixo` (o da barra), os dedos ficam ⟂ a
    ele — a linha dos nós dos dedos fica ao longo da barra e o punho desvia pro lado o que o antebraço sair do plano ⟂ à barra (com os
    dedos seguindo o antebraço inteiro, embaixo, com o braço aberto ~11° pra fora, a barra cortava a mão na diagonal: entrava 6,7 mm).
    A pronação fica toda no antebraço: a mão volta pro repouso antes do giro dele (sem isso o giro dependia da mão da volta anterior e
    a pele da base do polegar torcia embaixo)."""
    rig, PB = maos.rig, maos.rig.pose.bones
    dedos_q = Vector(dedos_q).normalized()
    palma_q = Vector(palma_q)
    palma_q = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
    maos.iks[lado].mute = True                       # o IK do Blender fica desligado (o _ik_braco faz o braço)
    pg.mao_de_referencia(rig, lado)
    alvo = g - dedos_q * (maos.palma * 0.92)
    erro = Vector()
    for _ in range(voltas):
        for n in ("Arm", "ForeArm", "Hand"):
            PB[p3.P + lado + n].matrix_basis = Matrix()
        p3.atualizar()
        _ik_braco(rig, lado, alvo, polo)
        f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
        ax = (f1 - f0).normalized()
        quer = palma_q - ax * palma_q.dot(ax)
        tem = pg._base(rig, lado)[0]
        tem = tem - ax * tem.dot(ax)
        if quer.length > 1e-6 and tem.length > 1e-6:
            quer.normalize()
            tem.normalize()
            p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(math.atan2(tem.cross(quer).dot(ax), tem.dot(quer)), 3, ax))
        h0 = p3.cabeca(rig, lado + "Hand")
        y_m = (p3.ponta(rig, lado + "Hand") - h0).normalized()
        n_m = pg._base(rig, lado)[0]
        n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
        F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
        dq = (dedos_q * (1 - alinhar) + ax * alinhar).normalized()
        if eixo is not None:
            dq = (dq - eixo * dq.dot(eixo)).normalized()
        pq = (palma_q - dq * palma_q.dot(dq)).normalized()
        F_quer = Matrix((dq, pq, dq.cross(pq))).transposed()
        p3.girar_osso(rig, lado + "Hand", F_quer @ F_tem.transposed())
        erro = g - p3.mundo_osso(rig, lado + "Hand") @ maos.furo[lado]
        if erro.length < 0.0003:
            break
        alvo = alvo + erro * passo
    maos.erro[lado] = erro.length
    fa = p3.ponta(rig, lado + "ForeArm") - p3.cabeca(rig, lado + "ForeArm")
    mo = p3.ponta(rig, lado + "Hand") - p3.cabeca(rig, lado + "Hand")
    maos.punho[lado] = math.degrees(fa.angle(mo))


def montar(bon):
    pg.usar_polegar("volta")             # polegar dando a volta na barra (padrão dos exercícios novos)
    pg.usar_cilindro(RAIO * 2000)        # mão de referência da barra de 30 mm (Shimawaki 2019, interpolada) — antes do Maos
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)

    def pele(partes, niveis=1):
        co, _, (nomes, dono) = _malha(bon, niveis)
        return co[_grupo(nomes, dono, partes)]

    # ── em pé: joelhos esticados (a Flexão de Braço, lote 7) ──────────────────────────────────────────────────────────────────
    for lado, _ in LADOS:
        Hq, K, A = (c(lado + n) for n in ("UpLeg", "Leg", "Foot"))
        coxa, canela = (K - Hq).normalized(), (A - K).normalized()
        flex = math.degrees(coxa.angle(canela))
        quer = coxa.slerp(canela, JOELHO / flex) if flex > JOELHO else canela
        p3.girar_osso(rig, lado + "Leg", canela.rotation_difference(quer).to_matrix())
    p3.atualizar()
    coxas_soltas = {L: PB[p3.P + L + "UpLeg"].matrix_basis.copy() for L, _ in LADOS}

    def fechar_pernas(px):
        """Cada coxa fecha em volta do quadril até o tornozelo ficar a `px` m do meio; devolve quanto uma coxa entra na outra
        (mm). A Flexão de Braço (lote 7)."""
        for lado, s in LADOS:
            PB[p3.P + lado + "UpLeg"].matrix_basis = coxas_soltas[lado].copy()
        p3.atualizar()
        for lado, s in LADOS:
            Hq, A = c(lado + "UpLeg"), c(lado + "Foot")
            v = A - Hq
            dx = s * px - Hq.x
            quer = Vector((dx, v.y, -math.sqrt(max(v.length ** 2 - dx ** 2 - v.y ** 2, 1e-6))))
            p3.girar_osso(rig, lado + "UpLeg", v.rotation_difference(quer).to_matrix())
        co, tri, (nomes, dono) = _malha(bon)
        return ck.corpo_x_corpo(co, tri, nomes, dono)[0]["coxaE×coxaD"]

    px = PES_X
    if fechar_pernas(px) > COXAS_MM:
        lo, hi = PES_X, 0.20
        for _ in range(10):
            meio = (lo + hi) / 2
            if fechar_pernas(meio) > COXAS_MM:
                lo = meio
            else:
                hi = meio
        px = hi
    print("PÉS | tornozelos a ±%.3f m do meio | coxa × coxa %.1f mm" % (px, fechar_pernas(px)), flush=True)

    def escapula(g):
        """Clavícula (osso Shoulder) girada `g` graus em volta do eixo do tronco: + = protração (o ombro vai pra frente do peito)."""
        cima = (c("Neck") - c("Hips")).normalized()
        for lado, s in LADOS:
            PB[p3.P + lado + "Shoulder"].matrix_basis = Matrix()
        p3.atualizar()
        if g:
            for lado, s in LADOS:
                p3.girar_osso(rig, lado + "Shoulder", Matrix.Rotation(math.radians(-s * g), 3, cima))

    # quadril estendido até o centro dele ficar na reta ombro → tornozelo (com a escápula no meio do caminho)
    escapula((ESCAPULA[0] + ESCAPULA[1]) / 2)
    g_q = 0.0
    for _ in range(5):
        m0 = tc.quadril_linha_ombro_tornozelo(ck.posicoes(rig))[0]
        if abs(m0 - QUADRIL_LINHA) < 0.2:
            break
        for lado, _ in LADOS:
            p3.girar_osso(rig, lado + "UpLeg", p3.rot_x(0.5))
        m1 = tc.quadril_linha_ombro_tornozelo(ck.posicoes(rig))[0]
        passo = 0.5 * (QUADRIL_LINHA - m1) / (m1 - m0) if abs(m1 - m0) > 1e-6 else 0.0
        for lado, _ in LADOS:
            p3.girar_osso(rig, lado + "UpLeg", p3.rot_x(passo))
        g_q += 0.5 + passo
    escapula(0.0)
    j = ck.posicoes(rig)
    print("PERNAS | joelho %s | quadril estendeu %.2f° | pés base lateral %.2f | tornozelo %s | linha jqc %.1f° | quadril×tronco "
          "%s | quadril na reta %.1f mm" % (
              "/".join("%.1f" % ck.medir_juntas(rig)["joelho" + l] for l in "ED"), g_q, tc.pes_base_lateral(j)[0],
              "/".join("%.1f" % a for a in tc.tornozelo(j)), tc.linha_joelho_quadril_cabeca(j)[0],
              "/".join("%.1f" % a for a in tc.quadril_sinal(j)), tc.quadril_linha_ombro_tornozelo(j)[0]), flush=True)

    # ── deitado de costas: o corpo gira pra trás em volta do eixo dos calcanhares ────────────────────────────────────────────────
    base_hips = PB[p3.P + "Hips"].matrix_basis.copy()
    pe_pele = {L: _grupo(*_malha(bon)[2], (L + "Foot", L + "ToeBase")) for L, _ in LADOS}
    co_pe = _malha(bon)[0]                    # pele em pé (com as pernas acertadas): o ponto de apoio sai daqui
    TH_MEIO = 20.0                            # ~ meio do caminho (embaixo ~14°, em cima ~32°)

    def girado(th):
        """Matriz (mundo, em volta da origem) que leva o corpo de em pé pro deitado a `th` graus do chão (a cabeça pra +Y)."""
        return p3.rot_x(-(90.0 - th))

    # o ponto de apoio de cada calcanhar: o vértice mais baixo do pé com o corpo no meio do caminho (o calcanhar gira em cima dele)
    R = np.array(girado(TH_MEIO))
    apoio = {}
    for L, _ in LADOS:
        V = co_pe[pe_pele[L]]
        i = int(np.argmin((V @ R.T)[:, 2]))
        apoio[L] = Vector(V[i])
    P0 = (apoio["Left"] + apoio["Right"]) / 2  # eixo do giro: passa pelos 2 pontos de apoio (ao longo do X)
    y_calc = [-1.0]                            # onde fica o eixo dos calcanhares no chão (y), acertado pelo peito em cima

    def deitar(th):
        """Corpo deitado de costas a `th` graus do chão (girado pra trás em volta do eixo dos calcanhares), com o eixo em
        (y_calc, −AFUNDA_CALC)."""
        PB[p3.P + "Hips"].matrix_basis = base_hips.copy()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", girado(th), pivo=P0,
                      mover=Vector((0.0, y_calc[0] - P0.y, -AFUNDA_CALC - P0.z)))

    def corpo(th, g):
        deitar(th)
        escapula(g)

    def peito_na_barra(z_barra, niveis=1):
        """Pele do tronco (sem os braços) → superfície da barra (m), a menor, e onde."""
        P = pele(TRONCO, niveis)
        P = P[np.abs(P[:, 0]) < 0.20]
        d = np.hypot(P[:, 1] - Y_BARRA, P[:, 2] - z_barra) - RAIO
        i = int(d.argmin())
        return float(d[i]), P[i]

    # vértice do peito que vai ficar embaixo da barra em cima (linha do meio, na frente, na altura PEITO_Z de em pé)
    co0, _, (nomes0, dono0) = _malha(bon)
    idx_tr = np.where(_grupo(nomes0, dono0, ("Spine1", "Spine2")) & (np.abs(co0[:, 0]) < 0.012))[0]
    frente = idx_tr[np.abs(co0[idx_tr, 2] - PEITO_Z) < 0.012]
    I_PEITO = int(frente[np.argmin(co0[frente, 1])])           # o mais à frente (−Y) nessa altura
    print("PEITO | vértice %d em pé (%.3f %.3f %.3f) | apoio dos calcanhares em pé E (%.3f %.3f %.3f) D (%.3f %.3f %.3f)" % (
        I_PEITO, *co0[I_PEITO], *apoio["Left"], *apoio["Right"]), flush=True)

    def ponto_peito():
        return Vector(_malha(bon)[0][I_PEITO])

    z_barra = PINO + SOBRE_PINO

    # ── em cima: a parte de baixo do peito bem embaixo da barra (acerta o y dos calcanhares) e a FOLGA_PEITO da barra ──────────────
    def em_cima(th):
        """Corpo a `th` graus com o vértice do peito bem embaixo do eixo da barra (o y dos calcanhares anda junto); devolve a folga
        peito → barra com sinal (− = a barra entrou no peito; o vértice acima do eixo = barra dentro do tronco)."""
        corpo(th, ESCAPULA[1])
        y_calc[0] += Y_BARRA - ponto_peito().y
        corpo(th, ESCAPULA[1])
        if ponto_peito().z >= z_barra:
            return -1.0
        return peito_na_barra(z_barra)[0]

    lo, hi = 0.0, 60.0
    for _ in range(20):
        meio = (lo + hi) / 2
        if em_cima(meio) > FOLGA_PEITO:
            lo = meio
        else:
            hi = meio
    TH1 = (lo + hi) / 2
    f1 = em_cima(TH1)
    print("EM CIMA | corpo a %.2f° | peito → barra %.1f mm | vértice do peito %.1f mm da linha da barra" % (
        TH1, f1 * 1000, (ponto_peito().y - Y_BARRA) * 1000), flush=True)

    # ── braços: IK do ombro ao vão da mão, parado na barra; a mão segue o antebraço (ALINHAR), com os dedos ⟂ à barra ──────────────
    maos = Maos(bon, RAIO)
    for lado, _ in LADOS:                 # o IK do Blender do Maos fica desligado: o braço é o _ik_braco
        maos.iks[lado].mute = True
    corpo(TH1, ESCAPULA[1])
    meia_pegada = PEGADA * (c("LeftArm") - c("RightArm")).length / 2
    G = {L: Vector((s * meia_pegada, Y_BARRA, z_barra)) for L, s in LADOS}

    # polo do cotovelo: ⟂ à reta ombro → mão, do lado das costas (pro chão), `graus` pra fora e um pouco pros pés, no referencial do
    # tronco do quadro (o _ik_braco põe o cotovelo nesse lado). O ângulo sai de uma busca em cima: o cotovelo EMBAIXO da mão
    # (antebraço no plano ⟂ à barra, sem o punho desviar pro lado) — com a pegada um pouco mais aberta que os ombros, o braço abre só
    # o que a mão abriu (ACE, TRX Back Row: "Your elbows should move towards your sides and remain close to your body"); com o polo
    # fixo 45° pra fora, o cotovelo passava 12 cm por fora da mão (prévia de 10/10)
    POLO_A = {}

    def polo(lado, s, graus):
        cima, lado_t, frente_t = (Vector(v) for v in tc.eixos_tronco(ck.posicoes(rig)))
        S = c(lado + "Arm")
        u = (G[lado] - S).normalized()
        a = math.radians(graus)
        d = -frente_t * math.cos(a) + (-s * lado_t) * math.sin(a) - cima * 0.25
        d = (d - u * d.dot(u)).normalized()
        return S + (G[lado] - S) * 0.5 + d * 0.6

    def braco(lado, s, graus):
        for n in ("Arm", "ForeArm", "Hand"):
            PB[p3.P + lado + n].matrix_basis = Matrix()
        p3.atualizar()
        _segurar(maos, lado, G[lado], DEDOS_Q, PALMA_Q, polo(lado, s, graus), alinhar=ALINHAR, voltas=VOLTAS,
                 eixo=Vector((1, 0, 0)))

    def bracos():
        for lado, s in LADOS:
            braco(lado, s, POLO_A[lado])

    corpo(TH1, ESCAPULA[1])
    for lado, s in LADOS:
        lo_a, hi_a = -60.0, 60.0          # o cotovelo vai pra fora com o ângulo: busca o cotovelo na mesma linha (x) do punho
        for _ in range(16):
            meio = (lo_a + hi_a) / 2
            braco(lado, s, meio)
            if s * (c(lado + "ForeArm").x - c(lado + "Hand").x) > 0:
                hi_a = meio
            else:
                lo_a = meio
        POLO_A[lado] = (lo_a + hi_a) / 2
        braco(lado, s, POLO_A[lado])
        print("POLO %s | %.1f° pra fora | cotovelo − punho em x %.1f mm" % (
            lado, POLO_A[lado], s * (c(lado + "ForeArm").x - c(lado + "Hand").x) * 1000), flush=True)
    bracos()

    # ── embaixo: o corpo desce até o cotovelo ficar a COTOVELO0 (o braço mais esticado dos dois) ─────────────────────────────────
    lo, hi = -5.0, TH1
    for _ in range(18):
        meio = (lo + hi) / 2
        corpo(meio, ESCAPULA[0])
        bracos()
        jj = ck.medir_juntas(rig)
        if min(jj["cotoveloE"], jj["cotoveloD"]) < COTOVELO0 or max(maos.erro.values()) > 0.001:
            lo = meio
        else:
            hi = meio
    TH0 = hi
    corpo(TH0, ESCAPULA[0])
    bracos()
    jj = ck.medir_juntas(rig)
    print("EMBAIXO | corpo a %.2f° | cotovelo %.1f/%.1f° | vão da mão %.1f/%.1f mm" % (
        TH0, jj["cotoveloE"], jj["cotoveloD"], maos.erro["Left"] * 1000, maos.erro["Right"] * 1000), flush=True)

    def perfil(t):
        return p3.lerp(TH0, TH1, t), p3.lerp(ESCAPULA[0], ESCAPULA[1], t)

    # polegar NOVO dando a volta na barra, FIXO em todos os quadros (cada mão com a sua postura): a busca do pg.polegar_em_volta,
    # refeita quadro a quadro, ficava na beirada do viável embaixo (prévia de 10/10: na mão direita, em t = 0, nenhuma postura
    # viável e o polegar caía no de hoje, trocando no 1º quadro) — o Agachamento no Smith (lote 4) achou o mesmo e fixou a postura.
    # Aqui ela sai da própria busca, feita embaixo, no meio e em cima; de cada mão fica a que menos entra na barra nos 3 (a pegada é
    # a mesma em todo quadro — só a mão rola um pouco em volta da barra junto com o antebraço).
    POLEGAR = {}
    CENTRO, EIXO = Vector((0, Y_BARRA, z_barra)), Vector((1, 0, 0))

    def polegar_na_barra(lado):
        """Pele do polegar → superfície da barra (m), a mais funda (− = entrou na barra)."""
        co, _, (nomes, dono) = _malha(bon)
        T = co[_grupo(nomes, dono, tuple(lado + "HandThumb%d" % i for i in (1, 2, 3)))]
        return float((np.hypot(T[:, 1] - Y_BARRA, T[:, 2] - z_barra) - RAIO).min())

    def pose(t):
        """t=0 embaixo (braços estendidos), t=1 em cima (peito na barra)."""
        th, g = perfil(t)
        corpo(th, g)
        bracos()
        for lado, _ in LADOS:              # os 4 dedos fecham até a pele encostar na barra; o polegar novo, fixo
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, CENTRO, EIXO, RAIO, polegar_modo="busca")
            _polegar_nos_angulos(bon, lado, POLEGAR[lado])
            pose.dedos[lado]["Thumb"] = ("volta fixo",) + POLEGAR[lado]
        pose.t = t

    pose.dedos = {}
    pose.t = 0.0
    pose.calc = {}
    AMOSTRAS = (0.0, 0.5, 1.0)
    cands = {L: [] for L, _ in LADOS}
    for tt in AMOSTRAS:                    # a busca do polegar novo embaixo, no meio e em cima
        corpo(*perfil(tt))
        bracos()
        for lado, _ in LADOS:
            r = pg.fechar_em_volta(bon, lado, CENTRO, EIXO, RAIO, polegar_modo="volta")["Thumb"]
            if isinstance(r, tuple) and r and r[0] == "volta" and r[-1]:
                cands[lado].append((tuple(float(x) for x in r[1:7]), tt, r[7], r[8], r[9]))
    fundo = {L: [[0.0] * len(AMOSTRAS) for _ in cands[L]] for L, _ in LADOS}
    for k, tt in enumerate(AMOSTRAS):      # cada postura achada, posta nos 3 quadros: quanto o polegar entra na barra
        corpo(*perfil(tt))
        bracos()
        for lado, _ in LADOS:
            pg.fechar_em_volta(bon, lado, CENTRO, EIXO, RAIO, polegar_modo="busca")
            for i, cand in enumerate(cands[lado]):
                _polegar_nos_angulos(bon, lado, cand[0])
                fundo[lado][i][k] = polegar_na_barra(lado)
    for lado, _ in LADOS:
        if not cands[lado]:
            raise RuntimeError("polegar novo sem postura viável na mão %s (t = 0; 0,5; 1)" % lado)
        i = max(range(len(cands[lado])), key=lambda i: min(fundo[lado][i]))
        q, tt, alvo_mm, vao_mm, alonga = cands[lado][i]
        POLEGAR[lado] = q
        print("POLEGAR %s | %d postura(s) viável(is) | fica a achada em t = %.1f: (CMC flex, abd, rot, MCP flex, abd, IP flex) %s | "
              "alvo %.1f mm, vão %.1f mm, pele da base %.2f× | polegar → barra embaixo/meio/em cima %s mm" % (
                  lado, len(cands[lado]), tt, q, alvo_mm, vao_mm, alonga,
                  "/".join("%+.1f" % (x * 1000) for x in fundo[lado][i])), flush=True)

    def calcanhares():
        """Pele mais baixa de cada calcanhar: (x, y, z) em m."""
        co, _, (nomes, dono) = _malha(bon)
        out = {}
        for L, _ in LADOS:
            V = co[_grupo(nomes, dono, (L + "Foot",))]
            out[L] = V[int(np.argmin(V[:, 2]))]
        return out

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        co, _, (nomes, dono) = _malha(bon)
        G_ = lambda partes: co[_grupo(nomes, dono, partes)]
        th, g = perfil(pose.t)
        f, p = peito_na_barra(z_barra)
        resto = G_(FORA_PES)
        k = int(np.argmin(resto[:, 2]))
        cal = calcanhares()
        anda = []
        for L, _ in LADOS:
            a = pose.calc.get(L)
            anda.append((np.linalg.norm((cal[L] - a)[:2]) * 1000) if a is not None else 0.0)
            pose.calc[L] = cal[L]

        def pol(lado):
            v = pose.dedos.get(lado, {}).get("Thumb", ())
            pp = pg.pele_do_polegar(bon, lado)
            return "%s, pele da base %.2f× e %d triângulo(s) do avesso, polegar → barra %+.1f mm" % (
                v[0] if isinstance(v, tuple) and v else v, pp["alonga_max"], pp["viradas"], polegar_na_barra(lado) * 1000)
        return ("corpo %.1f° | cotovelo %.0f/%.0f° | punho %.0f/%.0f° | braço×tronco (abertura) %s° | cotovelo_tronco %s° | "
                "braço_frente %s° | escápula %s mm (giro %.1f°) | quadril × reta ombro-tornozelo %+.1f mm | quadril×tronco %s° | "
                "linha jqc %.1f° | joelho %.1f/%.1f° | tornozelo %s° | cabeça×tronco %.1f° | peito → barra %.1f mm (%.3f %.3f %.3f) | "
                "pele mais baixa fora os pés %.0f mm (%s) | calcanhar E z %+.2f mm (%.4f %.4f) andou %.2f mm, D z %+.2f mm (%.4f %.4f) "
                "andou %.2f mm | %s | polegar E %s D %s" % (
                    th, juntas["cotoveloE"], juntas["cotoveloD"], juntas["punhoE"], juntas["punhoD"],
                    "/".join("%.0f" % a for a in tc.braco_abertura(jj)), "/".join("%.0f" % a for a in tc.cotovelo_tronco(jj)),
                    "/".join("%.0f" % a for a in tc.braco_frente(jj)), "/".join("%+.0f" % a for a in tc.escapula_frente(jj)), g,
                    tc.quadril_linha_ombro_tornozelo(jj)[0], "/".join("%.1f" % a for a in tc.quadril_sinal(jj)),
                    tc.linha_joelho_quadril_cabeca(jj)[0], juntas["joelhoE"], juntas["joelhoD"],
                    "/".join("%.0f" % a for a in tc.tornozelo(jj)), tc.cabeca_tronco(jj)[0], f * 1000, *p,
                    resto[k, 2] * 1000, nomes[dono[np.where(_grupo(nomes, dono, FORA_PES))[0][k]]],
                    cal["Left"][2] * 1000, cal["Left"][0], cal["Left"][1], anda[0],
                    cal["Right"][2] * 1000, cal["Right"][0], cal["Right"][1], anda[1], maos.info(), pol("Left"), pol("Right")))

    # ── o Smith em volta do corpo: barra PARADA (curso de 0), presa no gancho na altura do pino, sem anilha ──────────────────────
    sm = e3.smith("smith", y=Y_BARRA, z=z_barra, curso=(z_barra, z_barra), anilha=None)
    print("BARRA | pino %.2f m, eixo em z %.3f | calcanhares em y %.3f (%.3f m antes da linha da barra) | corpo %.2f° embaixo → %.2f° "
          "em cima | meia pegada %.3f m" % (PINO, z_barra, y_calc[0], Y_BARRA - y_calc[0], TH0, TH1, meia_pegada), flush=True)
    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose.calc.clear()
    pose(0.0)

    bk = ck.Barra(sm.barra, raio=RAIO, meio_compr=sm.meia)
    # a barra é EQUIPAMENTO (não apoio): o corpo só se pendura nela pelas mãos (a pegada tem a checagem dela) e o peito chega perto
    # sem encostar — com a barra de equipamento a checagem cobra 3 mm de folga dela até o resto do corpo em todo quadro
    return Cena(pose, sm.equipamentos + [sm.barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0,
                foco_luz=(0, Y_BARRA - 0.35, 0.40), camera_video=((3.3, -2.6, 1.35), (0, Y_BARRA - 0.40, 0.42), 45),
                info=info, apoios=[])
