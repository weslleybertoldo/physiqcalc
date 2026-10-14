# Alongamento Borboleta — cena da fábrica 3D (lote 15, 13/10/2026). Peso corporal, ALONGAMENTO PARADO, sentado no colchonete de 12 mm
# dos prontos de chão (a caixa é da própria cena, de apoio, ATRAVESSADA como na foto da ACE; nenhuma peça do lib/), com as SOLAS dos pés
# juntas, os calcanhares perto da virilha e os joelhos caídos pros lados.
# Ciclo (regra do lote 15 por coerência com a Prancha — fica pra validação final do Weslley): CÍCLICO ("ciclo": true, t = 1 igual a
# t = 0; o app repete): t = 0 é o ALONGAMENTO SEGURADO (a foto parada do app: o tronco inclinado à frente pelo quadril, as costas retas e
# os antebraços apoiados por dentro das canelas); segura 5 s; no meio do ciclo volta devagar até sentar com o tronco em pé (t = 0,5 é o
# meio do tempo na posição de começo, a foto 1 da ACE) e inclina de novo.
# Técnica (só o que foi lido; as frases completas e as fontes estão na ficha e em lote4/alongamento_borboleta/fontes.md):
#  · ACE, Seated Butterfly Stretch (#216): "Sit upright (i.e., trunk vertical) with your head aligned with your spine and place your hands
#    on the top of your feet." · "gently exhale and slowly bend forward from your hips, lowering your elbows to rest against the inside of
#    your thighs and push the thighs downward. Attempt to maintain a flat back position, avoid rounding your back towards the ceiling (i.e.,
#    move from the hips and not your low back)" · "do not bounce or push to a point of pain. Hold this position for 15 - 30 seconds, then
#    relax by returning to your starting position" · "You may elect to grasp your ankles to hold this position."
#  · ExRx, Seated Groin Stretch: "Sit on floor or mat with soles of feet together on floor and close to body. Grasp feet with both hands
#    and position elbows on inside of lower legs." · "Press knees toward floor with elbows. Hold stretch."
#  · NASM, Static Butterfly Stretch: "Bring the soles of your feet together in front of your body with your knees falling outward to the
#    sides." · "Hold your ankles or the tops of your feet and gently draw your torso forward while maintaining an upright spine." · erro:
#    "Forcing the knees toward the floor aggressively".
#  · NSCA (Achievable CSCS): "Hold your feet with your hands." · "Gently press your knees toward the floor using your elbows." · NHS:
#    "Holding on to your feet, try to lower your knees towards the floor." · Iowa: "holding your feet at the ankle for support".
# Decisões: o alongamento é o da ACE (a única fonte com a foto do começo e a do alongamento): o tronco inteiro inclina ~35° à frente em
# volta das articulações do quadril (a pelve vai junto, a coluna fica reta — a foto 2 da ACE) e os braços descem até apoiar nas pernas,
# empurrando os joelhos uns 3 cm pra baixo sem forçar (NASM). Com as mãos paradas nos pés, o braço do boneco só alcança a perna no meio da
# canela, com o antebraço perto do cotovelo — o "elbows on inside of lower legs" do ExRx (a ACE apoia na coxa: o braço do boneco não chega
# lá com o tronco a 35°). Os pés ficam perto do corpo, os calcanhares a um palmo da virilha (as fotos da ACE; ExRx "close to body"), com o
# joelho a ~139°. As mãos seguram os pés por cima e por fora, perto do tornozelo, com os dedos pra ponta do pé e o polegar por cima
# (ACE "top of your feet"; NASM "Hold your ankles or the tops of your feet"; Iowa "holding your feet at the ankle"): perto do tornozelo
# porque, com o tronco em pé, o braço do boneco não alcança a ponta do pé; virada assim (os dedos 30° pro meio e 25° pra baixo, a palma
# 60° pro meio) a mão divide a mudança de direção do antebraço entre o começo e a segurada: o punho fica ~11° no começo e ~43° de
# extensão (desvio ~10°) segurando.
# Como o rig faz: cada pé gira 90° em volta do Y (a sola vira pro meio), ~8,5° em volta do X (a borda de fora nivelada no chão: calcanhar
# e frente na mesma altura) e ±1° em volta do Z (a sola encosta igual no calcanhar e na frente), com a rotação travada no mundo (o pé não
# mexe); o tornozelo é o alvo do IK da perna, parado, posto até a sola encostar na outra (FOLGA_SOLAS) e a borda de fora no colchonete; o
# polo do joelho gira em volta da reta quadril → tornozelo até o centro do joelho ficar na altura JOELHO_Z (segurando, no começo). O corpo
# desce sem girar até a pele mais baixa do glúteo (o glúteo e a parte de trás das coxas, perto do quadril) afundar AFUNDA_GLUTEO no
# colchonete; o tronco (osso Hips, com a coluna) gira em volta das articulações do quadril e assenta de novo a cada quadro. O braço vai por
# IK do ombro até o punho PARADO, com o polo do cotovelo em volta da reta ombro → punho (psi); a mão vira pela palma e pelos dedos
# (o jeito do Abdominal Russo); cada dedo dobra até encostar no pé (ou no colchonete) e o polegar desce até ficar a POLEGAR_FOLGA do pé.
# Segurando, o cotovelo desce (psi) até o braço encostar na perna; na volta e na entrada, uma tabela (U_TAB) sobe o cotovelo o mínimo pro
# antebraço não entrar na canela.
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from cena import Cena
from abdominal_bicicleta import _congelar, _orientar

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
TOPO = 0.012            # colchonete de 12 mm (o dos prontos de chão: Abdominal Russo, Ponte de Glúteo, Extensão da Coluna)
COLCH = (1.73, 0.61)    # colchonete ATRAVESSADO (m: comprimento em X × largura em Y), como o da foto da ACE
# ── pernas e pés ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
PE_Y = 0.30             # tornozelos a PE_Y m à frente das articulações do quadril
FOLGA_SOLAS = 0.0006    # vão entre as solas (m)
AFUNDA_PE = 0.001       # a borda de fora do pé dentro do colchonete
AFUNDA_GLUTEO = 0.003   # a pele mais baixa do glúteo dentro do colchonete
JOELHO_Z = (0.17, 0.20)  # centro do joelho acima do chão (m): segurando (u = 0), no começo (u = 1)
# ── tronco ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
INCLINA = (35.0, 0.0)   # tronco (pelve + coluna, juntos) à frente da vertical, girando em volta das articulações do quadril (graus):
                        # segurando, no começo
# ── mãos e braços ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
MAO_FRENTE = 0.03       # o meio da palma a MAO_FRENTE m à frente do centro do tornozelo (ao longo do pé)
DEDOS_PRO_MEIO = 30.0   # dedos: da frente (ponta do pé) girando pro meio (graus)
DEDOS_PRA_BAIXO = 25.0  # e pra baixo (graus)
PALMA_PRO_MEIO = 60.0   # a palma olha pra baixo, girando pro meio (graus) — o resto sai perpendicular aos dedos
COTOVELO_COMECO = (1.0, 0.6)   # no começo o cotovelo aponta pra fora (1,0) e pra trás (0,6)
LAMBDA_SOLTO = 15.0     # dedo que não encosta no pé fica com esta dobra (graus × DOBRA): solto, um pouco dobrado
FOLGA_MAO = 0.0006      # vão entre a palma e o pé (m)
FOLGA_COT = 0.0008      # segurando: vão entre o antebraço/cotovelo e a perna (m)
FOLGA_VOLTA = 0.0015    # na volta e na entrada: o braço fica pelo menos isso longe da perna (m)
U_TAB = tuple(np.linspace(0.0, 1.0, 21))   # a tabela do caminho do cotovelo (u = 0 segurando, 1 no começo)
DOBRA = (1.0, 1.0, 0.8)  # proporção da dobra das 3 falanges quando o dedo curva até encostar no pé
POLEGAR_DOBRA = (10, 20, 20)  # proporção da dobra das 3 falanges do polegar (graus × λ)
POLEGAR_FOLGA = 0.003   # o polegar desce (dobra ou gira na base) até ficar a menos disso do pé, sem entrar
# ── tempos (o ciclo) ───────────────────────────────────────────────────────────────────────────────────────────────────────────
SEGURA_S = 5.0          # s segurando o alongamento por ciclo (a segurada da Prancha e da Extensão da Coluna)
SAI_S = 2.0             # s voltando à posição de começo
COMECO_S = 1.0          # s na posição de começo (sentado ereto)
ENTRA_S = 2.0           # s inclinando de novo
CICLO_S = SEGURA_S + SAI_S + COMECO_S + ENTRA_S
T_SAI = (0.5 - (COMECO_S / 2 + SAI_S) / CICLO_S, 0.5 - COMECO_S / 2 / CICLO_S)
T_ENTRA = (0.5 + COMECO_S / 2 / CICLO_S, 0.5 + (COMECO_S / 2 + ENTRA_S) / CICLO_S)
MAO = {L: (L + "Hand",) + tuple("%sHand%s%d" % (L, d, i) for d in p3.DEDOS + ("Thumb",) for i in (1, 2, 3)) for L, _ in LADOS}
PE = {L: (L + "Foot", L + "ToeBase") for L, _ in LADOS}
PE_PERNA = {L: (L + "Leg", L + "Foot", L + "ToeBase") for L, _ in LADOS}   # superfície fechada em volta do tornozelo: a do pé sozinha é
                                                                           # aberta lá e o sinal "dentro" erra perto da borda


def saida(t):
    """Quanto já saiu do alongamento no quadro t (0 = segurando; 1 = sentado ereto, a posição de começo), suave (seno)."""
    if t <= T_SAI[0] or t >= T_ENTRA[1]:
        return 0.0
    if t < T_SAI[1]:
        return p3.suave((t - T_SAI[0]) / (T_SAI[1] - T_SAI[0]))
    if t <= T_ENTRA[0]:
        return 1.0
    return p3.suave((T_ENTRA[1] - t) / (T_ENTRA[1] - T_ENTRA[0]))


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _arvore(co, tri, m):
    t = tri[m[tri].all(axis=1)]
    return BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in t], all_triangles=True)


def _distancia(bvh, P, alcance=0.05):
    """Menor distância (m, − = dentro) dos pontos P até a superfície da árvore (só até `alcance`)."""
    pior = 1e9
    for p in P:
        v = Vector(p)
        loc, nor, idx, d = bvh.find_nearest(v, alcance)
        if loc is None:
            continue
        pior = min(pior, -d if (d < 0.03 and (v - loc).dot(nor) < 0) else d)    # o jeito do checagem3d.contatos
    return pior


def _obstaculo(bvh, P):
    """Menor distância (m, − = dentro) dos pontos P até os pés/pernas (árvore) ou até o topo do colchonete."""
    return min(_distancia(bvh, P), float(P[:, 2].min()) - TOPO)


def _giro_pe(s, a, g):
    """Giro (mundo) do pé de pé chapado até de lado: a sola vira pro meio (s·90° em volta do Y), depois `a` graus em volta do X (a
    borda de fora nivelada no chão) e `g` em volta do Z (a sola encostando igual no calcanhar e na frente)."""
    return (Matrix.Rotation(math.radians(g), 3, "Z") @ Matrix.Rotation(math.radians(a), 3, "X")
            @ Matrix.Rotation(math.radians(s * 90.0), 3, "Y"))


def montar(bon):
    pg.usar_polegar("volta")         # padrão dos exercícios novos (aqui a mão não fecha em volta de pegador: ela apoia no pé)
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    def quadris():
        return (c("LeftUpLeg") + c("RightUpLeg")) / 2

    braco_L = (c("LeftForeArm") - c("LeftArm")).length
    antebraco_L = (c("LeftHand") - c("LeftForeArm")).length

    # ── pés de lado, sola com sola: o giro de cada pé (a borda de fora nivelada, a sola reta) sai da malha do pé em pé ───────────
    pe_rep = {L: p3.mundo_osso(rig, L + "Foot").to_3x3() for L, _ in LADOS}
    co0, _, (nomes0, dono0) = _malha(bon)
    giro_pe, rel_pe = {}, {}
    for L, s in LADOS:
        P = co0[_grupo(nomes0, dono0, PE[L])] - np.array(c(L + "Foot"))
        a, g = 0.0, 0.0
        for _ in range(4):
            melhor = None
            for a_ in np.arange(a - 12, a + 12.01, 0.25):
                Q = P @ np.array(_giro_pe(s, a_, g)).T
                med = np.median(Q[:, 1])
                dz = abs(Q[Q[:, 1] > med][:, 2].min() - Q[Q[:, 1] <= med][:, 2].min())
                if melhor is None or dz < melhor[0]:
                    melhor = (dz, a_)
            a = melhor[1]
            melhor = None
            for g_ in np.arange(g - 12, g + 12.01, 0.25):
                Q = P @ np.array(_giro_pe(s, a, g_)).T
                med = np.median(Q[:, 1])
                dx = abs((s * Q[Q[:, 1] > med][:, 0]).min() - (s * Q[Q[:, 1] <= med][:, 0]).min())
                if melhor is None or dx < melhor[0]:
                    melhor = (dx, g_)
            g = melhor[1]
        giro_pe[L] = _giro_pe(s, a, g)
        rel_pe[L] = Q = P @ np.array(giro_pe[L]).T
        med = np.median(Q[:, 1])
        print("PÉ %s | giro em volta do X %.2f° e do Z %.2f° | calcanhar × frente: borda de fora %.1f mm, sola %.1f mm" % (
            L, a, g, (Q[Q[:, 1] > med][:, 2].min() - Q[Q[:, 1] <= med][:, 2].min()) * 1000,
            ((s * Q[Q[:, 1] > med][:, 0]).min() - (s * Q[Q[:, 1] <= med][:, 0]).min()) * 1000))

    # ── sentado: o corpo desce sem girar (o tronco fica em pé) ──────────────────────────────────────────────────────────────────
    H0 = quadris()
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, TOPO + 0.10 - H0.z)))
    H = quadris()
    alvos, polos, iks, travas = {}, {}, {}, {}
    for L, s in LADOS:
        Q = rel_pe[L]
        ax = s * (FOLGA_SOLAS / 2 - (s * Q[:, 0]).min())
        az = TOPO - AFUNDA_PE - Q[:, 2].min()
        alvos[L] = p3.vazio("tornozelo_" + L, p3.ponta(rig, L + "Leg"))       # nasce no tornozelo de repouso (longe do polo)
        polos[L] = p3.vazio("polo_joelho_" + L, c(L + "Leg") + Vector((s * 0.8, -0.2, 0.3)))
        iks[L] = p3.ik(rig, L + "Leg", alvos[L], polos[L])
        travas[L] = p3.vazio("rot_" + L + "Foot")
        travas[L].matrix_world = (giro_pe[L] @ pe_rep[L]).to_4x4()
        cn = PB[p3.P + L + "Foot"].constraints.new("COPY_ROTATION")
        cn.target = travas[L]
        alvos[L].location = Vector((ax, H.y - PE_Y, az))
    p3.atualizar()

    def polo_joelho(L, s, beta):
        """Polo do joelho: perpendicular à reta quadril → tornozelo, pra fora e `beta` graus pra cima."""
        Hq, A = c(L + "UpLeg"), alvos[L].location.copy()
        u = (A - Hq).normalized()
        fora = Vector((s, 0, 0))
        fora = (fora - u * fora.dot(u)).normalized()
        cima = u.cross(fora) if u.cross(fora).z > 0 else fora.cross(u)
        cima.normalize()
        b = math.radians(beta)
        return (Hq + A) / 2 + (fora * math.cos(b) + cima * math.sin(b)) * 0.8

    for L, s in LADOS:
        polos[L].location = polo_joelho(L, s, 10.0)
    p3.atualizar()
    for L, _ in LADOS:
        e = p3.acertar_polo(rig, iks[L], L + "Leg", L + "UpLeg", L + "Foot")
        print("POLO joelho %s: erro %.3f ang %d" % (L, e[0], e[1]))

    GLUTEO = ("Hips", "LeftUpLeg", "RightUpLeg")

    def gluteo_z():
        co, _, (nomes, dono) = _malha(bon)
        m = _grupo(nomes, dono, GLUTEO)
        q = np.array(quadris())
        perto = m & (np.hypot(co[:, 0] - q[0], co[:, 1] - q[1]) < 0.22)
        return float(co[perto][:, 2].min())

    def sentar():
        for _ in range(3):
            dz = (TOPO - AFUNDA_GLUTEO) - gluteo_z()
            if abs(dz) < 0.0002:
                break
            p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, dz)))

    def joelhos(beta):
        for L, s in LADOS:
            polos[L].location = polo_joelho(L, s, beta[L])
        p3.atualizar()

    hips_base = [None]

    def tronco(incl, assentar=True):
        """Tronco (pelve + coluna) `incl` graus à frente da vertical, girando em volta das articulações do quadril; o glúteo assenta."""
        PB[p3.P + "Hips"].matrix_basis = hips_base[0].copy()
        p3.atualizar()
        if incl:
            p3.girar_osso(rig, "Hips", p3.rot_x(incl), pivo=quadris())
        if assentar:
            sentar()

    # 1ª passada: senta com o tronco em pé, acerta os pés (sola com sola, borda de fora no colchonete) e senta de novo
    sentar()
    for volta in range(3):
        co, _, (nomes, dono) = _malha(bon)
        for L, s in LADOS:
            Pp = co[_grupo(nomes, dono, PE[L])]
            dx = s * FOLGA_SOLAS / 2 - (Pp[:, 0].min() if s > 0 else Pp[:, 0].max())
            dz = (TOPO - AFUNDA_PE) - Pp[:, 2].min()
            alvos[L].location += Vector((dx, 0, dz))
        p3.atualizar()
        sentar()
    hips_base[0] = PB[p3.P + "Hips"].matrix_basis.copy()

    # ── joelhos: o polo de cada fase, até o centro do joelho ficar na altura JOELHO_Z ───────────────────────────────────────────
    betas = []
    for fase, incl in ((0, INCLINA[0]), (1, INCLINA[1])):
        tronco(incl)
        beta = {}
        for L, s in LADOS:
            lo, hi = -30.0, 80.0
            for _ in range(30):
                meio = (lo + hi) / 2
                polos[L].location = polo_joelho(L, s, meio)
                p3.atualizar()
                if c(L + "Leg").z > JOELHO_Z[fase]:
                    hi = meio
                else:
                    lo = meio
            beta[L] = (lo + hi) / 2
        joelhos(beta)
        sentar()
        betas.append(beta)
        print("JOELHOS fase %d | beta E %.1f° D %.1f° | joelho z E %.3f D %.3f | quadris (%.3f %.3f %.3f)" % (
            fase, beta["Left"], beta["Right"], c("LeftLeg").z, c("RightLeg").z, *quadris()))

    # ── mãos no peito do pé (posição do começo: a que alcança menos) ────────────────────────────────────────────────────────────
    tronco(INCLINA[1])
    joelhos(betas[1])
    sentar()
    punhos, polos_b, iks_b = {}, {}, {}
    for L, s in LADOS:
        punhos[L] = p3.vazio("punho_" + L, p3.ponta(rig, L + "ForeArm"))
        polos_b[L] = p3.vazio("polo_cotovelo_" + L, c(L + "ForeArm") + Vector((s * 0.5, 0.3, 0)))
        iks_b[L] = p3.ik(rig, L + "ForeArm", punhos[L], polos_b[L])

    def base_cotovelo(L, s, W):
        """Eixo ombro → punho e 2 direções perpendiculares a ele: pra fora (e1) e pra cima (e2)."""
        S = c(L + "Arm")
        a = (W - S).normalized()
        e1 = Vector((s, 0, 0))
        e1 = (e1 - a * e1.dot(a)).normalized()
        e2 = a.cross(e1)
        if e2.z < 0:
            e2.negate()
        return S, a, e1, e2

    def polo_cotovelo(L, s, W, psi):
        """Polo do cotovelo em volta do eixo ombro → punho: psi = 0 pra fora, + pra cima, − pra baixo (graus)."""
        S, a, e1, e2 = base_cotovelo(L, s, W)
        p = math.radians(psi)
        return S + (W - S) * 0.5 + (e1 * math.cos(p) + e2 * math.sin(p)) * 0.6

    acertado = {}
    dedos_dir, palma_dir = {}, {}

    def por_braco(L, s, W, psi):
        for o in (L + "Arm", L + "ForeArm", L + "Hand"):     # o IK parte sempre do repouso (o resultado não depende do quadro anterior)
            PB[p3.P + o].matrix_basis = Matrix()
        iks_b[L].mute = False
        punhos[L].location = W
        polos_b[L].location = polo_cotovelo(L, s, W, psi)
        p3.atualizar()
        if L not in acertado:
            acertado[L] = p3.acertar_polo(rig, iks_b[L], L + "ForeArm", L + "Arm", L + "Hand")
        _congelar(rig, iks_b[L], L)
        _orientar(rig, L, dedos_dir[L], palma_dir[L])

    def esticar_dedos(L):
        p3.soltar_dedos(rig, L)
        pg.juntar_dedos(rig, L, 1.0)
        for dd in p3.DEDOS + ("Thumb",):
            for i in (1, 2, 3):
                palma = pg._base(rig, L)[0]
                o = "%sHand%s%d" % (L, dd, i)
                f = p3.ponta(rig, o) - p3.cabeca(rig, o)
                plano = f - palma * f.dot(palma)
                if dd == "Thumb":
                    plano = plano - palma * 0.10 * f.length
                if plano.length > 1e-6:
                    p3.girar_osso(rig, o, f.rotation_difference(plano).to_matrix())

    def palma_pe(L):
        """Menor distância (m, − = dentro) até o pé da pele da palma (osso Hand) e dos nós dos dedos (a pele das falanges de base até
        1,5 cm do centro da junta: com o dedo esticado ou dobrado ela fica no lugar)."""
        co, tri, (nomes, dono) = _malha(bon)
        m = _grupo(nomes, dono, (L + "Hand",))
        for dd in p3.DEDOS:
            o = "%sHand%s1" % (L, dd)
            m = m | (_grupo(nomes, dono, (o,)) & (np.linalg.norm(co - np.array(c(o)), axis=1) < 0.015))
        return _distancia(_arvore(co, tri, _grupo(nomes, dono, PE_PERNA[L])), co[m])

    W, contato = {}, {}
    psi_comeco = {}
    co, tri, (nomes, dono) = _malha(bon)
    for L, s in LADOS:
        yaw, pitch, roll = (math.radians(a) for a in (DEDOS_PRO_MEIO, DEDOS_PRA_BAIXO, PALMA_PRO_MEIO))
        f = Vector((-s * math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), -math.sin(pitch)))
        d = Vector((-s * math.sin(roll), 0.0, -math.cos(roll)))
        dedos_dir[L] = f
        palma_dir[L] = (d - f * d.dot(f)).normalized()                         # a palma olha pro pé (de cima, girando pro meio)
        fora = -palma_dir[L]
        Pp = co[_grupo(nomes, dono, PE[L])]
        ao_longo = alvos[L].location.y - Pp[:, 1]                              # o pé aponta pra −Y
        faixa = Pp[np.abs(ao_longo - MAO_FRENTE) < 0.006]
        contato[L] = Vector(faixa[np.argmax(faixa @ np.array(fora))])
        esticar_dedos(L)
        # direção do cotovelo no começo: pra fora e pra trás (o braço quase esticado, pendurado até o pé)
        W[L] = contato[L] + fora * 0.03 + Vector((0, 0.05, 0))
        S, a, e1, e2 = base_cotovelo(L, s, W[L])
        quer = Vector((s * COTOVELO_COMECO[0], COTOVELO_COMECO[1], 0.0)).normalized()
        psi_comeco[L] = math.degrees(math.atan2(quer.dot(e2), quer.dot(e1)))
        por_braco(L, s, W[L], psi_comeco[L])
        co2, _, (nomes2, dono2) = _malha(bon)
        H_ = co2[_grupo(nomes2, dono2, (L + "Hand",))]
        meio_palma = Vector(H_[np.argsort(H_ @ np.array(palma_dir[L]))[-40:]].mean(axis=0))   # a pele do lado da palma
        W[L] = W[L] + (contato[L] - meio_palma) + fora * FOLGA_MAO
        for volta in range(10):
            por_braco(L, s, W[L], psi_comeco[L])
            d = palma_pe(L)
            erro = (c(L + "Hand") - W[L]).length
            print("MÃO %s volta %d | palma × pé %.1f mm | punho a %.1f mm do alvo | ombro → punho %.3f m (braço+antebraço %.3f) | "
                  "cotovelo %.0f°" % (L, volta, d * 1000, erro * 1000, (W[L] - c(L + "Arm")).length, braco_L + antebraco_L,
                                       ck.medir_juntas(rig)["cotovelo" + ("E" if s > 0 else "D")]))
            if abs(d - FOLGA_MAO) < 0.0002 and erro < 0.001:
                break
            W[L] = W[L] + fora * max(-0.01, min(0.01, FOLGA_MAO - d))

    def dedos_no_pe(L):
        """Cada dedo (fora o polegar) curva inteiro (as 3 falanges na proporção DOBRA) até a pele encostar no pé sem entrar."""
        co, tri, (nomes, dono) = _malha(bon)
        bvh = _arvore(co, tri, _grupo(nomes, dono, PE_PERNA["Left"] + PE_PERNA["Right"]))
        pos = {nm: i for i, nm in enumerate(nomes)}
        palma, eixo_nos = pg._base(rig, L)[:2]
        out = {}
        for dd in p3.DEDOS:
            ossos = ["%sHand%s%d" % (L, dd, i) for i in (1, 2, 3)]
            pts = {o: co[dono == pos[o]] for o in ossos}
            cab = {o: np.array(c(o)) for o in ossos}
            f = (p3.ponta(rig, ossos[0]) - c(ossos[0])).normalized()
            sinal = 1 if eixo_nos.cross(f).dot(palma) > 0 else -1
            melhor, encostou = None, False
            for lam in np.arange(-25.0, 45.01, 1.0):
                angs = [lam * DOBRA[k] * sinal for k in range(3)]
                pp = pg._cadeia_pts(pts, cab, None, ossos, [eixo_nos] * 3, angs)
                dm = _obstaculo(bvh, np.concatenate([pp[o][::2] for o in ossos]))
                if dm < FOLGA_MAO:
                    encostou = True
                    break
                melhor = (lam, angs, dm)
            if melhor is None:
                out[dd] = "sem solução"
                continue
            if not encostou:                        # não alcança o pé: fica solto, um pouco dobrado (o mínimo entre isso e o que cabe)
                lam = LAMBDA_SOLTO
                angs = [lam * DOBRA[k] * sinal for k in range(3)]
                pp = pg._cadeia_pts(pts, cab, None, ossos, [eixo_nos] * 3, angs)
                melhor = (lam, angs, _obstaculo(bvh, np.concatenate([pp[o][::2] for o in ossos])))
            lam, angs, dm = melhor
            for k, o in enumerate(ossos):
                if angs[k]:
                    p3.girar_osso(rig, o, p3.rot_eixo(angs[k], eixo_nos))
            out[dd] = (round(float(lam), 1), round(dm * 1000, 1))
        return out

    def polegar_no_pe(L, folga=(0.0012, 0.004)):
        """Polegar por cima do pé (a borda de dentro, que fica pra cima): procura o giro na base (em volta da normal da palma) e a dobra
        das 3 falanges que deixam a pele dele encostando de leve no pé, sem entrar; sem solução que encoste, o mais perto sem entrar."""
        co, tri, (nomes, dono) = _malha(bon)
        bvh = _arvore(co, tri, _grupo(nomes, dono, PE_PERNA["Left"] + PE_PERNA["Right"]))
        pos = {nm: i for i, nm in enumerate(nomes)}
        palma = pg._base(rig, L)[0]
        ossos = ["%sHandThumb%d" % (L, i) for i in (1, 2, 3)]
        pts0 = {o: co[dono == pos[o]] for o in ossos}
        cab0 = {o: np.array(c(o)) for o in ossos}
        h1 = cab0[ossos[0]]
        eixos, sinais = [], []
        for o in ossos:
            f = (p3.ponta(rig, o) - c(o)).normalized()
            ex = f.cross(palma).normalized()
            alvo = (c(L + "HandMiddle1") - c(o)).normalized()
            eixos.append(ex)
            sinais.append(1 if ex.cross(f).dot(alvo) > 0 else -1)
        melhor = None
        for b in range(-60, 61, 5):
            pa = {o: pg._rot(pts0[o], h1, palma, b) for o in ossos}
            ca = {o: (pg._rot(cab0[o][None], h1, palma, b)[0] if k else cab0[o]) for k, o in enumerate(ossos)}
            eix = [Vector(pg._rot(np.array(e)[None], np.zeros(3), palma, b)[0]) for e in eixos]
            for lam in np.arange(-0.5, 3.51, 0.1):
                angs = [lam * POLEGAR_DOBRA[k] * sinais[k] for k in range(3)]
                pp = pg._cadeia_pts(pa, ca, None, ossos, eix, angs)
                dm = _obstaculo(bvh, np.concatenate([pp[o][::2] for o in ossos]))
                if dm < folga[0]:
                    continue
                nota = (0 if dm <= folga[1] else 1, abs(b) / 60 + abs(lam - 0.5) / 3, dm)
                if melhor is None or nota < melhor[0]:
                    melhor = (nota, b, lam, dm)
        if melhor is None:
            return "sem solução"
        _, b, lam, dm = melhor
        if b:
            p3.girar_osso(rig, ossos[0], p3.rot_eixo(b, palma))
        for k, o in enumerate(ossos):
            f = (p3.ponta(rig, o) - c(o)).normalized()
            ex = f.cross(palma).normalized()
            alvo = (c(L + "HandMiddle1") - c(o)).normalized()
            sg = 1 if ex.cross(f).dot(alvo) > 0 else -1
            if lam * POLEGAR_DOBRA[k]:
                p3.girar_osso(rig, o, p3.rot_eixo(lam * POLEGAR_DOBRA[k] * sg, ex))
        def real_():
            co, tri, (nomes, dono) = _malha(bon)
            bvh = _arvore(co, tri, _grupo(nomes, dono, PE_PERNA["Left"] + PE_PERNA["Right"]))
            return _obstaculo(bvh, co[_grupo(nomes, dono, tuple(ossos))])

        def dobra_(passo):
            for k, o in enumerate(ossos):
                f = (p3.ponta(rig, o) - c(o)).normalized()
                ex = f.cross(palma).normalized()
                alvo = (c(L + "HandMiddle1") - c(o)).normalized()
                sg = 1 if ex.cross(f).dot(alvo) > 0 else -1
                p3.girar_osso(rig, o, p3.rot_eixo(passo * POLEGAR_DOBRA[k] * sg, ex))

        def base_(g):
            p3.girar_osso(rig, ossos[0], p3.rot_eixo(g, pg._base(rig, L)[0]))

        real = real_()
        for _ in range(12):                       # a pele de verdade (LBS) cai um pouco diferente da conta: dobra ou desdobra (o lado que
            if real >= 0.0003:                    # afasta) até não entrar
                break
            melhor_p = None
            for passo in (-0.1, 0.1):
                dobra_(passo)
                r = real_()
                dobra_(-passo)
                if melhor_p is None or r > melhor_p[1]:
                    melhor_p = (passo, r)
            dobra_(melhor_p[0])
            lam += melhor_p[0]
            real = melhor_p[1]
        for _ in range(20):                       # longe do pé: dobra ou gira a base pro pé até encostar de leve (sem entrar)
            if real <= POLEGAR_FOLGA:
                break
            opcoes = []
            for nome, ida, volta in (("dobra", lambda: dobra_(0.2), lambda: dobra_(-0.2)),
                                     ("base+", lambda: base_(4), lambda: base_(-4)),
                                     ("base-", lambda: base_(-4), lambda: base_(4))):
                ida()
                r = real_()
                volta()
                if r >= 0.0003:
                    opcoes.append((r, nome))
            if not opcoes:
                break
            r, nome = min(opcoes)
            if r >= real - 0.0002:
                break
            {"dobra": lambda: dobra_(0.2), "base+": lambda: base_(4), "base-": lambda: base_(-4)}[nome]()
            if nome == "dobra":
                lam += 0.2
            else:
                b += 4 if nome == "base+" else -4
            real = r
        return (b, round(float(lam), 1), round(dm * 1000, 1), round(real * 1000, 1))

    dedos_pose = {}
    for L, s in LADOS:
        print("DEDOS %s %s | polegar %s" % (L, dedos_no_pe(L), polegar_no_pe(L)))
        dedos_pose[L] = {o: PB[p3.P + o].matrix_basis.copy() for o in MAO[L][1:]}

    def braco_x_perna(L):
        """Menor distância (m, − = dentro) da pele do braço e do antebraço até a coxa e a perna do mesmo lado."""
        co, tri, (nomes, dono) = _malha(bon)
        return _distancia(_arvore(co, tri, _grupo(nomes, dono, (L + "UpLeg", L + "Leg"))),
                          co[_grupo(nomes, dono, (L + "Arm", L + "ForeArm"))], alcance=0.15)

    # ── segurando: o tronco inclinado e os cotovelos descem até encostar por dentro das coxas (ACE) ─────────────────────────────
    tronco(INCLINA[0])
    joelhos(betas[0])
    sentar()
    psi_segura = {}
    for L, s in LADOS:
        livre = None
        for psi in range(60, -91, -5):              # de cima pra baixo: o 1º que encosta
            por_braco(L, s, W[L], psi)
            d = braco_x_perna(L)
            if d < FOLGA_COT:
                break
            livre = (psi, d)
        if livre is None:
            psi_segura[L] = 60.0
            print("COTOVELO %s | já encosta em psi 60 (%.1f mm)" % (L, d * 1000))
            continue
        lo, hi = float(livre[0]) - 5.0, float(livre[0])
        for _ in range(12):
            meio = (lo + hi) / 2
            por_braco(L, s, W[L], meio)
            if braco_x_perna(L) < FOLGA_COT:
                lo = meio
            else:
                hi = meio
        psi_segura[L] = hi
        por_braco(L, s, W[L], hi)
        print("COTOVELO %s | psi %.1f° (o 1º sem encostar: %d°, %.1f mm) | braço × coxa/perna %.1f mm | cotovelo (%.3f %.3f %.3f) %.0f°" % (
            L, hi, livre[0], livre[1] * 1000, braco_x_perna(L) * 1000, *c(L + "ForeArm"),
            ck.medir_juntas(rig)["cotovelo" + ("E" if s > 0 else "D")]))

    # ── o caminho do cotovelo entre a segurada e o começo: o antebraço sai de cima da canela sem entrar nela ──────────────────────
    # (com o psi indo em linha reta, o antebraço, que gira em volta da mão parada, passava até 7 mm dentro da canela no meio da volta:
    # em cada u da tabela o cotovelo sobe o mínimo pra ficar a FOLGA_VOLTA da perna)
    def corpo_u(u):
        tronco(INCLINA[0] + (INCLINA[1] - INCLINA[0]) * u, assentar=False)
        joelhos({L: betas[0][L] + (betas[1][L] - betas[0][L]) * u for L, _ in LADOS})
        sentar()

    psi_tab = {L: [] for L, _ in LADOS}
    for u in U_TAB:
        corpo_u(u)
        for L, s in LADOS:
            psi = psi_segura[L] + (psi_comeco[L] - psi_segura[L]) * u
            por_braco(L, s, W[L], psi)
            if u > 0 and braco_x_perna(L) < FOLGA_VOLTA:
                lo, hi = psi, psi
                while hi < psi + 90:
                    hi += 5.0
                    por_braco(L, s, W[L], hi)
                    if braco_x_perna(L) >= FOLGA_VOLTA:
                        break
                for _ in range(8):
                    meio = (lo + hi) / 2
                    por_braco(L, s, W[L], meio)
                    if braco_x_perna(L) >= FOLGA_VOLTA:
                        hi = meio
                    else:
                        lo = meio
                psi = hi
            psi_tab[L].append(psi)
    print("COTOVELO caminho (psi por u %s): %s" % (
        " ".join("%.2f" % u for u in U_TAB), " | ".join("%s %s" % (L[0], " ".join("%.0f" % a for a in v)) for L, v in psi_tab.items())))

    # ── colchonete atravessado, centrado embaixo do corpo ───────────────────────────────────────────────────────────────────────
    tronco(INCLINA[0])
    joelhos(betas[0])
    co = _malha(bon)[0]
    baixo = co[co[:, 2] < 0.06]
    y0 = (baixo[:, 1].min() + baixo[:, 1].max()) / 2
    print("COLCHONETE %.2f × %.2f m centrado em y %.3f (corpo perto do chão: x %.3f a %.3f, y %.3f a %.3f)" % (
        COLCH[0], COLCH[1], y0, baixo[:, 0].min(), baixo[:, 0].max(), baixo[:, 1].min(), baixo[:, 1].max()))
    colchonete = e3.caixa("colchonete", (0, y0, TOPO / 2), (COLCH[0], COLCH[1], TOPO), e3.mat_estofado(), chanfro=0.004)

    estado = {"t": 0.0, "u": 0.0}

    def pose(t):
        """t = 0 (e 1): segurando o alongamento (tronco inclinado à frente); sai no meio do ciclo (t = 0,5 sentado ereto) e volta."""
        u = saida(t)
        estado["t"], estado["u"] = t, u
        corpo_u(u)
        for L, s in LADOS:
            por_braco(L, s, W[L], float(np.interp(u, U_TAB, psi_tab[L])))
            for o, M in dedos_pose[L].items():
                PB[p3.P + o].matrix_basis = M.copy()
        p3.atualizar()

    def info():
        j = ck.posicoes(rig)
        jn = ck.medir_juntas(rig)
        co, tri, (nomes, dono) = _malha(bon)
        G = lambda partes: _grupo(nomes, dono, partes)
        solas = _distancia(_arvore(co, tri, G(PE_PERNA["Right"])), co[G(PE["Left"])])
        txt = []
        for L, s in LADOS:                       # onde o braço encosta na perna: o vértice da perna mais perto do braço
            bv = _arvore(co, tri, G((L + "Arm", L + "ForeArm")))
            pl = np.where(G((L + "UpLeg", L + "Leg")))[0]
            dist_ = [bv.find_nearest(Vector(co[i]), 0.2)[3] for i in pl[::3]]
            dist_ = [d if d is not None else 9.0 for d in dist_]
            i = pl[::3][int(np.argmin(dist_))]
            txt.append("%s: braço encosta na perna em %s, a %.0f mm do centro do joelho" % (
                L[0], nomes[dono[i]], (Vector(co[i]) - c(L + "Leg")).length * 1000))
        for L, s in LADOS:
            m_pe = _distancia(_arvore(co, tri, G(PE_PERNA[L])), co[G(MAO[L])])
            b_pe = _distancia(_arvore(co, tri, G((L + "UpLeg", L + "Leg"))), co[G((L + "Arm", L + "ForeArm"))], alcance=0.15)
            txt.append("%s: mão × pé %.1f mm, braço × coxa/perna %.1f mm, punho a %.1f mm do alvo, pé planta %+.1f mm, cotovelo (%.0f %.0f %.0f) mm" % (
                L[0], m_pe * 1000, b_pe * 1000, (c(L + "Hand") - W[L]).length * 1000, (co[G(PE[L])][:, 2].min() - TOPO) * 1000,
                *(c(L + "ForeArm") * 1000)))
        mm = _distancia(_arvore(co, tri, G(MAO["Right"])), co[G(MAO["Left"])], alcance=0.1)
        mb = G(MAO["Left"] + MAO["Right"])
        kb = np.argmin(np.where(mb, co[:, 2], 9.0))
        txt.append("punho flexão %s desvio %s | mão mais baixa %.1f mm acima do colchonete (%s)" % (
            tc.valores("punho_flexao", tc.punho_flexao(j)), tc.valores("punho_desvio", tc.punho_desvio(j)),
            (co[kb, 2] - TOPO) * 1000, nomes[dono[kb]]))
        q = np.array(quadris())
        gl = G(GLUTEO) & (np.hypot(co[:, 0] - q[0], co[:, 1] - q[1]) < 0.22)
        k = np.argmin(np.where(gl, co[:, 2], 9.0))
        txt.append("mão × mão %.1f mm | pele mais baixa do glúteo (%.3f %.3f %.3f) %s" % (mm * 1000, *co[k], nomes[dono[k]]))
        return ("u %.3f | tronco %.1f° | quadril %.0f/%.0f° | joelho %.0f/%.0f° | joelho z %.0f/%.0f mm | coxa_abducao %s | coxa_abertura %s | "
                "coluna %.1f | cabeça × tronco %.1f | cotovelo %.0f/%.0f° | punho %.0f/%.0f° | tornozelo %s | solas %.1f mm | glúteo %+.1f mm | %s" % (
                    estado["u"], ck._ang(j["Neck"] - j["Hips"], (0, 0, 1)), jn["quadrilE"], jn["quadrilD"], jn["joelhoE"], jn["joelhoD"],
                    c("LeftLeg").z * 1000, c("RightLeg").z * 1000, tc.valores("coxa_abducao", tc.coxa_abducao(j)),
                    tc.valores("coxa_abertura", tc.coxa_abertura(j)), tc.coluna(j)[0], tc.cabeca_tronco(j)[0],
                    jn["cotoveloE"], jn["cotoveloD"], jn["punhoE"], jn["punhoD"], tc.valores("tornozelo", tc.tornozelo(j)),
                    solas * 1000, (gluteo_z() - TOPO) * 1000, " | ".join(txt)))

    return Cena(pose, [], pegadas=[], apoio_mm=0.0, foco_luz=(0, -0.15, 0.3),
                camera_video=((1.6, -3.0, 1.3), (0, -0.15, 0.3), 50), info=info, apoios=[colchonete], afunda_apoio_mm=10.0)
