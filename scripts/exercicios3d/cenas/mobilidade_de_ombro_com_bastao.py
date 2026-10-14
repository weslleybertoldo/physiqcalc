# Mobilidade de Ombro com Bastão — cena da fábrica 3D (lote 15, 13/10/2026; exercício NOVO da categoria "Alongamento e mobilidade", da
# migration 20261012150000: sem fonte_en e sem dica). Peça NOVA: o bastão (equip3d.bastao: tubo liso de Ø 25 mm — o cano de PVC de 25 mm,
# NBR 5648 — com 1,42 m, o "Short Training Stick" de 56" da Stick Mobility, e ponteiras de borracha).
# A PASSAGEM DO BASTÃO por cima da cabeça, em pé, com as 2 mãos e os braços esticados (free-exercise-db, Chest And Front Of Shoulder
# Stretch: "Carefully lift the pole up and behind your head."; Physitrack: "Keeping your arms straight lift the stick from the front over
# your head"). Ida e volta do app: t = 0 ATRÁS DA CABEÇA (o bastão acima e atrás da cabeça, os braços esticados pra cima e pra trás em V —
# a foto parada) · t = 1 NA FRENTE DO QUADRIL (os braços esticados pendurados um pouco à frente, o bastão a FOLGA_FRENTE da pele). O app faz
# a volta (sobe pela frente, passa por cima da cabeça e vai pra trás dela de novo).
# Técnica (as fontes, com a frase exata, ficam na ficha):
#   • free-exercise-db (domínio público), Chest And Front Of Shoulder Stretch: "Start off by standing with your legs together, holding a
#     bodybar or a broomstick." / "Take a slightly wider than shoulder width grip on the pole and hold it in front of you with your palms
#     facing down." / "Carefully lift the pole up and behind your head." (fotos: as mãos a ~1,8× a largura de fora a fora dos deltoides; o
#     bastão termina logo acima e atrás da cabeça) · Round The World Shoulder Stretch: "Don't force it if it gets hard to lift further."
#   • Physitrack, Seated Wide Grip Shoulder Flexion (Stick): "Hold a stick in front with both hands wide apart and palms facing down." /
#     "Keeping your arms straight lift the stick from the front over your head and downward behind your back."
#   • ACE, Supine Shoulder Flexion: "fully extend the elbows without arching your low back or shrugging your shoulders" / "avoid any upward
#     shrugging" · ACE, Flexibility Assessment Form (Upper Body): "horizontal extension 45° past neutral", rotação externa 90 (90–100° com o
#     braço a 90°), interna 70–80, pronação 90, supinação 90, desvio radial 20.
# Decisões (as divergências estão na ficha e no relatório):
#   • O FIM DE TRÁS é acima e atrás da cabeça ("up and behind your head", free-exercise-db), não atrás das costas (Physitrack, sentado):
#     com a pegada fixa, os braços esticados e o bastão na horizontal, a mão gira junto com o bastão em volta dele, e levar o bastão por
#     cima até atrás das costas pede ~340° de giro do braço inteiro (úmero + antebraço) — além da rotação externa (90–100°) mais a
#     supinação (90°) da ACE (a conta e as medidas do boneco estão no relatório).
#   • Até onde vai atrás: o braço chega a PLANO_MAX graus atrás do plano do corpo (a "horizontal extension 45° past neutral" da ACE, medida
#     pelo tecnica3d.braco_plano) — bissecção no montar().
#   • A PEGADA (GRIP_X): a da foto 0 do free-exercise-db (~1,8× a largura de fora a fora dos deltoides), mais aberta que o "slightly wider
#     than shoulder width" do texto e "wide apart" como manda o Physitrack. Pronada (as palmas pra baixo/pro corpo na frente), o polegar em
#     volta, a mesma largura o caminho todo.
# Montagem: tronco, escápulas e cabeça parados na pose de repouso (ACE: sem encolher os ombros nem arquear a lombar); pernas por IK com as
# pernas juntas ("legs together", free-exercise-db), joelhos quase esticados e pés chapados. O bastão fica na horizontal com o meio no
# plano do meio do corpo, e o vão de cada mão (a ±GRIP_X do meio) anda num círculo em volta da reta que passa pelos 2 ombros: o ângulo φ do
# círculo (0 = pendurado embaixo, 90 = na frente na altura dos ombros, 180 = em cima, > 180 = atrás) vai de φ_tras (t = 0) a φ_frente
# (t = 1); o raio de cada lado sai de uma conta (o triângulo ombro–cotovelo–punho, sem IK) pro cotovelo daquele braço ficar a COTOVELO
# graus (o braço direito do boneco alcança ~3 mm a mais: o bastão inclina ≤ 0,2°). Cada mão é posta pelo maos3d.Maos.segurar(zerar=True):
# a palma ⟂ ao bastão e ao antebraço (o punho sem dobrar pra frente nem pra trás) e o bastão atravessando a palma OBLIQUA graus inclinado
# (a ponta do lado do dedo mínimo mais pra perto dos dedos: o antebraço chega na mão vindo de dentro, do ombro, e o resto vira desvio do
# punho pro lado do polegar); o VÃO de cada mão é recalculado pro bastão oblíquo (a mesma busca do pegada3d.ponto_na_mao, com o eixo
# girado), senão a beirada da mão entra no bastão. Os dedos fecham em volta do bastão a cada quadro (a conta do pegada3d.fechar_em_volta)
# e o polegar novo dá a volta numa postura FIXA por mão, tirada da própria busca (pegada3d.polegar_em_volta) no meio do caminho (o jeito
# do Encolhimento com Barra). A mão gira em volta do bastão junto com ele (a palma vai de pra trás, na frente do quadril, a pra frente, em
# cima): o antebraço faz uma parte desse giro, em linha reta com φ — pronado PRON_FRENTE na frente a supinado PRON_TRAS atrás da
# cabeça —, e o úmero o resto, girando em volta do próprio eixo (o polo do IK do cotovelo: o olécrano pra trás do braço, girado): de ~50°
# de rotação interna na frente a ~43° de externa em cima e atrás da cabeça — os 2 dentro da amplitude da ACE. Com o úmero girando em linha
# reta (a 1ª versão), o antebraço girava ~90° de uma vez na metade da frente (medir_giro), um giro que o braço de verdade não faz ali (na
# elevação frontal com a barra o antebraço fica parado).
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
from agachamento_no_smith import _polegar_nos_angulos   # polegar novo numa postura anatômica dada (Encolhimento com Barra, Afundo...)

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X); o boneco olha pra −Y
X = Vector((1.0, 0.0, 0.0))
Y = Vector((0.0, 1.0, 0.0))

# ── bastão ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
RAIO = 0.0125             # Ø 25 mm: o tubo de PVC rígido de 25 mm (NBR 5648); a mão de referência padrão (29 mm) fecha nele
COMPR = 1.42              # de ponta a ponta: o "Short Training Stick | 56"" da Stick Mobility (Perform Better)

# ── pernas ("Start off by standing with your legs together", free-exercise-db) ─────────────────────────────────────────────────────────
PES_X = 0.09              # tornozelos a ±PES_X do meio (m): as pernas juntas, os joelhos e as coxas se encostando — o mais junto que o
                          # boneco deixa sem uma perna entrar na outra (sonda do rascunho: a ±7,5 cm as coxas entravam 6,6 mm e as
                          # pernas 7,9 mm; a ±9 cm, 0), com as bordas de dentro dos pés a ~10 cm
JOELHO = 4.0              # flexão dos joelhos (graus), parada: em pé, os joelhos soltos ("Stand up straight", free-exercise-db)

# ── braços e pegada ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
GRIP_X = 0.42             # vão de cada mão a GRIP_X do meio (m): 0,84 m vão a vão, 2,1× a distância entre as articulações dos ombros
                          # (0,40 m) — a pegada da foto 0 do free-exercise-db (as mãos a ~1,8× a largura de fora a fora dos deltoides do
                          # modelo da foto); mais aberta, o desvio do punho passava dos 20° da ACE (sonda do rascunho); o montar()
                          # imprime a conta
COTOVELO = 5.0            # flexão do cotovelo (graus), parada: braço esticado ("Keeping your arms straight", Physitrack; ACE "fully extend
                          # the elbows") — um resto de flexão pro IK saber pra onde o cotovelo aponta
PLANO_MAX = 45.0          # atrás: o braço vai até PLANO_MAX graus atrás do plano do corpo (ACE: "horizontal extension 45° past neutral")
FOLGA_FRENTE = 0.012      # na frente: a superfície do bastão a 12 mm da pele (sem encostar; a checagem pede ≥ 3 mm)
OBLIQUA = 12.0            # o bastão atravessa a palma inclinado isso (graus) da reta dos nós dos dedos; o resto do ângulo do antebraço
                          # (que vem de dentro) vira desvio do punho pro lado do polegar (ACE: desvio radial até 20°)
PRON_FRENTE = 125.0       # pronação do antebraço (graus: 0 = supinado, a palma pro lado da dobra do cotovelo; 90 = neutro; 180 = pronado)
PRON_TRAS = 30.0          # com o bastão na frente do quadril e atrás da cabeça, em linha reta com φ: 35° além do neutro pra pronação na
                          # frente e 60° pra supinação atrás (ACE: pronação 90, supinação 90). O úmero faz o resto do giro da mão (o info()
                          # mede: rotação externa 90–100° e interna 70–80° na ACE)
T_POLEGAR = 0.5           # quadro de onde sai a postura fixa do polegar novo


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _bvh(vs, ts):
    return BVHTree.FromPolygons([tuple(p) for p in vs], [tuple(t_) for t_ in ts], all_triangles=True)


def _menor(bvh, pts_, lim):
    m = lim
    for p in pts_:
        r = bvh.find_nearest(Vector(p), lim)
        if r[0] is not None and r[3] < m:
            m = r[3]
    return m


def _com_sinal(bvh, pts_, lim=0.5):
    menor = lim
    for p in pts_:
        v = Vector(p)
        loc, nor, _, d = bvh.find_nearest(v, lim)
        if loc is not None:
            menor = min(menor, -d if (d < 0.03 and (v - loc).dot(nor) < 0) else d)
    return menor


def _angulo(u, v, eixo):
    """Ângulo (graus) de u até v em volta de `eixo` (os 2 projetados no plano ⟂ eixo), com sinal pela regra da mão direita."""
    e = eixo.normalized()
    a = (u - e * u.dot(e)).normalized()
    b = (v - e * v.dot(e)).normalized()
    return math.degrees(math.atan2(a.cross(b).dot(e), a.dot(b)))


def vao_obliquo(bon, lado, s, raio, obliqua, aperto=pg.APERTO):
    """O vão da mão de referência (pg.mao_de_referencia, já posta) pra um bastão que atravessa a palma `obliqua` graus inclinado: a mesma
    busca do pg.ponto_na_mao (o eixo encosta na pele sem entrar mais que `aperto`, com a mão abraçando o máximo), com o eixo no plano da
    palma girado da reta ⟂ ao osso da mão pro lado dos dedos na ponta do dedo mínimo — o eixo que o Maos.segurar deixa quando os dedos vão
    pra s·sen(obliqua) ao longo do bastão. Devolve o vão (mundo) e o eixo."""
    rig = bon.rig
    palma, _, dir_mao, nos, _ = pg._base(rig, lado)
    h0 = p3.cabeca(rig, lado + "Hand")
    y_m = (p3.ponta(rig, lado + "Hand") - h0).normalized()
    n_m = (palma - y_m * palma.dot(y_m)).normalized()
    x_m = y_m.cross(n_m)
    o = math.radians(obliqua)
    u = np.array((s * math.sin(o) * y_m + math.cos(o) * x_m).normalized())
    co, nomes, dono = pg._malha(bon)
    da_mao = np.array([n.startswith(lado + "Hand") and "Thumb" not in n for n in nomes] + [False])[dono]
    rel = co[da_mao] - np.array(nos)
    P, D = np.meshgrid(np.arange(0.0, 0.05, 0.001), np.arange(-0.03, 0.04, 0.001))
    cand = np.outer(P.ravel(), np.array(palma)) + np.outer(D.ravel(), np.array(dir_mao))
    e1 = np.array(palma) - u * (np.array(palma) @ u)
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(u, e1)
    melhor = None
    for q in cand:
        d = rel - q
        rad = d - np.outer(d @ u, u)
        rho = np.linalg.norm(rad, axis=1)
        if rho.min() < raio - aperto:
            continue
        cola = rho - raio < 0.006
        if cola.sum() < 3:
            continue
        ang = np.sort(np.degrees(np.arctan2(rad[cola] @ e2, rad[cola] @ e1)) % 360)
        envolve = 360 - np.diff(np.concatenate([ang, [ang[0] + 360]])).max()
        nota = (envolve, -(rho.min() - raio))
        if melhor is None or nota > melhor[0]:
            melhor = (nota, q)
    return Vector(np.array(nos) + melhor[1]), Vector(u), melhor[0][0]


def fechar_dedos(bon, lado, centro, eixo, raio, aperto=pg.APERTO):
    """Os 4 dedos fecham em volta do bastão (a conta do pg.fechar_em_volta, sem o polegar): cada dedo, a partir da mão de referência
    (pg.mao_de_referencia, já posta), fecha ou abre inteiro — as 3 juntas na mesma proporção — até a pele encostar no bastão sem entrar mais
    que `aperto`. Devolve {dedo: λ}."""
    rig = bon.rig
    c, u = np.array(centro), np.array(Vector(eixo).normalized())
    eixo_nos = pg._base(rig, lado)[1]
    co, nomes, dono = pg._malha(bon)
    pos = {n: i for i, n in enumerate(nomes)}
    out = {}
    for d in p3.DEDOS:
        ossos = ["%sHand%s%d" % (lado, d, i) for i in (1, 2, 3)]
        pts = {o: co[dono == pos[o]] for o in ossos}
        cab = {o: np.array(p3.cabeca(rig, o)) for o in ossos}
        ponta = np.array(p3.ponta(rig, ossos[-1]))
        ref = pg.ANGULOS_REF[d]
        sinal = pg._SINAL[(lado, d)]
        escolha = (0.0, [0.0] * 3)
        for lam in np.arange(0.25, -0.31, -0.01):     # do mais fechado pro mais aberto: o 1º que não entra no bastão
            delta = [lam * ref[k] * sinal for k in range(3)]
            pp = pg._cadeia_pts(pts, cab, ponta, ossos, [eixo_nos] * 3, delta)
            if pg._radial(np.concatenate([pp[x] for x in ossos]), c, u).min() >= raio - aperto:
                escolha = (float(lam), delta)
                break
        lam, delta = escolha
        for k, o in enumerate(ossos):
            if delta[k]:
                p3.girar_osso(rig, o, p3.rot_eixo(delta[k], eixo_nos))
        out[d] = round(lam, 2)
    return out


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta no bastão (exercícios novos, 05/10/2026); Ø 25 mm = mão padrão
    rig = bon.rig
    PB = rig.pose.bones

    def c(n):
        return p3.cabeca(rig, n)

    # ── largura de fora a fora dos deltoides (repouso), pra comparar a pegada com a foto do free-exercise-db ─────────────────────────────
    co_r, _, (nomes_r, dono_r) = ck._avaliar(bon.corpo, 1)
    m_delt = _grupo(nomes_r, dono_r, ("LeftArm", "RightArm", "LeftShoulder", "RightShoulder"))
    perto = m_delt & (co_r[:, 2] > c("LeftArm").z)                  # a capa do ombro, da altura da articulação pra cima
    deltoides = 2 * float(np.abs(co_r[perto][:, 0]).max())

    # ── a dobra do cotovelo (frente do braço) no referencial do osso do braço, tirada do repouso (o cotovelo dobrado pra frente) ──────
    dobra_loc = {}
    for L, _ in LADOS:
        a = (c(L + "ForeArm") - c(L + "Arm")).normalized()
        f = c(L + "Hand") - c(L + "ForeArm")
        d = (f - a * f.dot(a)).normalized()
        dobra_loc[L] = p3.mundo_osso(rig, L + "Arm").to_3x3().inverted() @ d

    def dobra(L):
        return (p3.mundo_osso(rig, L + "Arm").to_3x3() @ dobra_loc[L]).normalized()

    # ── pernas por IK: tornozelos parados a ±PES_X do meio, joelhos pra frente, pés chapados (a Elevação Frontal com Anilha) ──────────
    coxa = (c("LeftLeg") - c("LeftUpLeg")).length
    canela = (p3.ponta(rig, "LeftLeg") - c("LeftLeg")).length
    tornoz = p3.ponta(rig, "LeftLeg")
    q0 = c("LeftUpLeg")
    pivo = (c("LeftUpLeg") + c("RightUpLeg")) / 2
    pernas = {}
    for L, s in LADOS:
        tz = p3.ponta(rig, L + "Leg")
        alvo = p3.vazio("tornozelo_" + L, Vector((s * PES_X, tz.y, tz.z)))
        polo = p3.vazio("polo_joelho_" + L, (s * 0.15, -1.2, 0.55))
        pernas[L] = p3.ik(rig, L + "Leg", alvo, polo)
        p3.travar_rotacao(rig, L + "Foot")
    PB[p3.P + "Hips"].matrix_basis = Matrix()
    p3.atualizar()
    th = math.radians(JOELHO)
    dq_ = math.sqrt(coxa ** 2 + canela ** 2 + 2 * coxa * canela * math.cos(th))   # quadril → tornozelo
    dx, dy = q0.x - PES_X, q0.y - tornoz.y
    desce = tornoz.z + math.sqrt(max(dq_ ** 2 - dx ** 2 - dy ** 2, 0.01)) - q0.z
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), pivo=pivo, mover=Vector((0, 0, desce)))
    for L, _ in LADOS:
        e = p3.acertar_polo(rig, pernas[L], L + "Leg", L + "UpLeg", L + "Foot")
        print("polo joelho", L, "erro %.3f ang %d" % e, flush=True)

    # ── pele do corpo sem braços e mãos (parada): pra folga do bastão na frente do quadril ────────────────────────────────────────────
    co0, tri0, (nomes0, dono0) = ck._avaliar(bon.corpo, 1)
    sem = np.array([n.startswith(("LeftHand", "RightHand")) or n in ("LeftArm", "RightArm", "LeftForeArm", "RightForeArm")
                    for n in nomes0] + [False])[dono0]
    V0 = co0[tri0[~sem[tri0].any(axis=1)]]                     # (n, 3 vértices, xyz)
    u_ = np.linspace(0.0, 1.0, 17)[:, None, None]
    P0 = np.concatenate([(V0[:, j] + u_ * (V0[:, (j + 1) % 3] - V0[:, j])).reshape(-1, 3) for j in range(3)])
    P0 = P0[np.abs(P0[:, 0]) < GRIP_X - 0.06]                  # a parte do bastão entre as mãos

    def folga_corpo(y, z):
        """Menor distância (m) da superfície do bastão (eixo ao longo de X em (y, z)) até a pele do corpo sem braços e mãos."""
        return float(np.min(np.hypot(P0[:, 1] - y, P0[:, 2] - z))) - RAIO

    # ── mãos no bastão: o vão de cada mão pro bastão oblíquo, no referencial da mão que o Maos.segurar alinha ──────────────────────────
    maos = Maos(bon, RAIO, polegar_modo="volta")
    furo_loc = {}                                              # vão a partir do punho, em (osso da mão, palma, osso × palma)
    for L, s in LADOS:
        pg.mao_de_referencia(rig, L)
        g, u, env = vao_obliquo(bon, L, s, RAIO, OBLIQUA)
        antes = (p3.mundo_osso(rig, L + "Hand") @ maos.furo[L] - g).length
        maos.furo[L] = p3.mundo_osso(rig, L + "Hand").inverted() @ g
        W0 = c(L + "Hand")
        y_m = (p3.ponta(rig, L + "Hand") - W0).normalized()
        n_m = pg._base(rig, L)[0]
        n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
        furo_loc[L] = Vector(((g - W0).dot(y_m), (g - W0).dot(n_m), (g - W0).dot(y_m.cross(n_m))))
        print("VÃO %s | bastão %.0f° oblíquo na palma: abraça %.0f°, o vão andou %.1f mm do da barra ao longo dos nós" % (
            L, OBLIQUA, env, antes * 1000), flush=True)
    S = {L: c(L + "Arm") for L, _ in LADOS}                    # ombros (o tronco e as escápulas não mexem)
    Sm = (S["Left"] + S["Right"]) / 2
    Lb = {L: (c(L + "ForeArm") - c(L + "Arm")).length for L, _ in LADOS}     # braço
    La = {L: (c(L + "Hand") - c(L + "ForeArm")).length for L, _ in LADOS}    # antebraço
    jj0 = ck.posicoes(rig)
    cima_t, lado_t, frente_t = (Vector(v) for v in tc.eixos_tronco(jj0))    # o tronco não mexe: os eixos dele ficam parados


    def vao_alvo(phi, R, s):
        f = math.radians(phi)
        return Vector((s * GRIP_X, Sm.y - R * math.sin(f), Sm.z - R * math.cos(f)))

    def mao_dir(phi, s):
        """Dedos e palma (mundo) no ângulo φ: a palma ⟂ ao bastão (e ao antebraço visto de lado) e os dedos no plano da palma, ⟂ ao bastão
        girados OBLIQUA graus pro lado de fora (s·X)."""
        f = math.radians(phi)
        pq = Vector((0.0, math.cos(f), -math.sin(f)))           # φ = 0: palma pra trás (pro corpo); 90: pra baixo; 180: pra frente
        d0 = Vector((0.0, -math.sin(f), -math.cos(f)))          # dedos ⟂ ao bastão, na direção do antebraço visto de lado
        o = math.radians(OBLIQUA)
        return (d0 * math.cos(o) + s * X * math.sin(o)).normalized(), pq

    def punho_previsto(L, g, dq, pq):
        """Onde o punho fica com o vão em g e a mão em (dedos, palma) — sem mexer no Blender (o Maos.segurar põe o vão exatamente lá)."""
        f = furo_loc[L]
        return g - dq * f.x - pq * f.y - dq.cross(pq) * f.z

    def rot_umero(L, s, g, phi, fi):
        """Rotação do úmero (graus, + = externa) no ângulo φ, com o vão da mão em g: a que deixa o antebraço com a pronação pedida (de
        PRON_FRENTE em φ_frente a PRON_TRAS em φ_tras, em linha reta com φ) — a pronação com o úmero sem girar (a dobra do cotovelo reto
        pra frente do braço × a palma, em volta do braço) menos a pedida. O braço é a reta ombro → punho (o cotovelo dobra só 5°)."""
        dq, pq = mao_dir(phi, s)
        a = (punho_previsto(L, g, dq, pq) - S[L]).normalized()
        ref = -(Y - a * Y.dot(a)).normalized()                  # a dobra do cotovelo reto pra frente do braço (rotação 0)
        u = (phi - fi["frente"]) / max(fi["tras"] - fi["frente"], 1e-6)
        return p3.lerp(PRON_FRENTE, PRON_TRAS, u) - s * _angulo(ref, pq, a)

    def polo_de(L, s, g, phi, fi):
        """Polo do IK do cotovelo: pra trás do braço (o olécrano pra trás), girado em volta do braço pela rotação do úmero."""
        dq, pq = mao_dir(phi, s)
        a = (punho_previsto(L, g, dq, pq) - S[L]).normalized()
        d = (Y - a * Y.dot(a)).normalized()                     # o olécrano reto pra trás (a dobra pra frente): rotação 0
        R = Matrix.Rotation(math.radians(-s * rot_umero(L, s, g, phi, fi)), 3, a)   # externa: a dobra vai pra fora (−s em volta do braço)
        return S[L] + (R @ d) * 0.6

    def braco_previsto(L, s, phi, R, fi):
        """Cotovelo (flexão, graus) e o osso do braço (ombro → cotovelo) previstos pra mão `L` no ângulo φ e no raio R: o triângulo
        ombro–cotovelo–punho com o cotovelo pro lado do polo (o que o IK faz), sem mexer no Blender."""
        g = vao_alvo(phi, R, s)
        dq, pq = mao_dir(phi, s)
        W = punho_previsto(L, g, dq, pq)
        dv = W - S[L]
        d = dv.length
        e = dv / d
        cosi = max(-1.0, min(1.0, (Lb[L] ** 2 + La[L] ** 2 - d * d) / (2 * Lb[L] * La[L])))
        flex = 180.0 - math.degrees(math.acos(cosi))
        x = (Lb[L] ** 2 - La[L] ** 2 + d * d) / (2 * d)
        h = math.sqrt(max(Lb[L] ** 2 - x * x, 0.0))
        P = polo_de(L, s, g, phi, fi) - S[L]
        p_ = P - e * P.dot(e)
        cotovelo = S[L] + e * x + (p_.normalized() * h if p_.length > 1e-9 else Vector())
        return flex, cotovelo - S[L]

    def por_mao(L, s, phi, R, fi):
        g = vao_alvo(phi, R, s)
        dq, pq = mao_dir(phi, s)
        maos.segurar(L, g, dq, pq, polo=polo_de(L, s, g, phi, fi), zerar=True)
        return g

    fi = {"frente": 15.0, "tras": 210.0}
    # polo certo do cotovelo (o pole_angle do IK de cada braço) com o bastão na frente, na altura dos ombros, e o cotovelo bem dobrado
    for L, s in LADOS:
        por_mao(L, s, 90.0, 0.40, fi)
        maos.iks[L].mute = False
        e = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
        maos.iks[L].mute = True
        print("polo cotovelo", L, "erro %.3f ang %d" % e, flush=True)

    def raio_do(L, s):
        """Raio do círculo do vão da mão `L` (m, do eixo dos ombros ao eixo do bastão) com o cotovelo a COTOVELO graus (o mesmo em todo φ:
        a mão fica igual em volta do bastão)."""
        lo, hi = 0.35, 0.65
        for _ in range(30):
            m = (lo + hi) / 2
            if braco_previsto(L, s, 180.0, m, fi)[0] > COTOVELO:
                lo = m
            else:
                hi = m
        return (lo + hi) / 2

    raios = {L: raio_do(L, s) for L, s in LADOS}

    def plano_previsto(phi):
        """Quanto o braço fica atrás do plano do corpo (graus, média dos 2 lados; a mesma conta do tecnica3d.braco_plano)."""
        v = 0.0
        for L, s in LADOS:
            b = braco_previsto(L, s, phi, raios[L], fi)[1]
            v += -math.degrees(math.atan2(b.dot(frente_t), b.dot(-s * lado_t)))
        return v / 2

    lo, hi = 180.0, 270.0                                        # atrás: o braço PLANO_MAX graus atrás do plano do corpo
    for _ in range(30):
        m = (lo + hi) / 2
        if plano_previsto(m) < PLANO_MAX:
            lo = m
        else:
            hi = m
    fi["tras"] = (lo + hi) / 2
    R_m = (raios["Left"] + raios["Right"]) / 2
    lo, hi = 0.0, 90.0                                           # na frente: o bastão a FOLGA_FRENTE da pele
    for _ in range(30):
        m = (lo + hi) / 2
        g = vao_alvo(m, R_m, 1)
        if folga_corpo(g.y, g.z) < FOLGA_FRENTE:
            lo = m
        else:
            hi = m
    fi["frente"] = (lo + hi) / 2
    g_tras = vao_alvo(fi["tras"], R_m, 1)
    topo_cabelo = float(ck._avaliar_simples(bon.cabelo)[0][:, 2].max())
    print("CÍRCULO | raio E %.4f D %.4f m | φ atrás %.2f° (braço %.0f° atrás do plano do corpo: o bastão %.0f mm atrás dos ombros e o "
          "alto dele %+.0f mm do alto do cabelo), φ na frente %.2f° | pegada %.3f m vão a vão = %.2f× a distância entre os ombros "
          "(%.3f m) e %.2f× os deltoides de fora a fora (%.3f m)" % (
              raios["Left"], raios["Right"], fi["tras"], PLANO_MAX, (g_tras.y - Sm.y) * 1000, (g_tras.z + RAIO - topo_cabelo) * 1000,
              fi["frente"], 2 * GRIP_X, 2 * GRIP_X / (S["Left"] - S["Right"]).length, (S["Left"] - S["Right"]).length,
              2 * GRIP_X / deltoides, deltoides), flush=True)

    rots = [(phi, rot_umero("Left", 1, vao_alvo(phi, raios["Left"], 1), phi, fi))
            for phi in np.linspace(fi["frente"], fi["tras"], 9)]
    print("ÚMERO | rotação (+ = externa) prevista do braço esquerdo: %s" % " ".join("φ %.0f° %+.0f°" % r for r in rots), flush=True)

    def por(phi):
        for L, s in LADOS:
            por_mao(L, s, phi, raios[L], fi)

    bastao = e3.bastao("bastao", comprimento=COMPR, raio=RAIO)
    bastao.rotation_mode = "QUATERNION"
    bk = ck.Barra(bastao, raio=RAIO, meio_compr=COMPR / 2)
    estado = {}

    def pose(t):
        """t=0 o bastão acima e atrás da cabeça (braços esticados pra cima e pra trás), t=1 na frente do quadril (braços pendurados à
        frente)."""
        phi = p3.lerp(fi["tras"], fi["frente"], t)
        por(phi)
        gs = {L: p3.mundo_osso(rig, L + "Hand") @ maos.furo[L] for L, _ in LADOS}
        eixo = (gs["Left"] - gs["Right"]).normalized()
        meio = (gs["Left"] + gs["Right"]) / 2
        bastao.rotation_quaternion = X.rotation_difference(eixo)
        bastao.location = meio
        p3.atualizar()
        estado.update(bastao=meio.copy(), eixo=eixo.copy(), phi=phi, t=t)
        for L, _ in LADOS:                                   # dedos fecham até a pele encostar no bastão; o polegar novo na postura fixa
            pose.dedos[L] = fechar_dedos(bon, L, meio, eixo, RAIO)
            if pose.polegar.get(L):
                _polegar_nos_angulos(bon, L, pose.polegar[L])
                pose.dedos[L]["Thumb"] = ("volta fixo",) + tuple(pose.polegar[L])

    pose.dedos = {}
    pose.polegar = {}
    pose.estado = estado
    pose.fi = fi

    # ── polegar novo numa postura FIXA por mão, tirada da própria busca (pg.polegar_em_volta) no quadro T_POLEGAR e repetida em todos (o
    # jeito do Encolhimento com Barra: a mão fica igual em volta do bastão o caminho todo; refeita quadro a quadro, a busca podia trocar de
    # postura). Se uma mão não achar, ela usa a da outra (polegar3d: "a mão direita sai espelhada da esquerda sem trocar sinal nenhum").
    pose(T_POLEGAR)
    for L, _ in LADOS:
        th = pg.polegar_em_volta(bon, L, estado["bastao"], estado["eixo"], RAIO)
        if th[-1]:
            pose.polegar[L] = tuple(float(x) for x in th[1:7])
        print("POLEGAR busca %s: %s" % (L, th), flush=True)
    if not pose.polegar:
        raise RuntimeError("polegar novo sem postura viável nas 2 mãos")
    for L, _ in LADOS:
        if L not in pose.polegar:
            pose.polegar[L] = pose.polegar["Right" if L == "Left" else "Left"]
    print("POLEGAR fixo (CMC flex, abd, rot, MCP flex, abd, IP flex): E %s D %s" % (pose.polegar["Left"], pose.polegar["Right"]),
          flush=True)

    # ── medidas à parte (a checagem ignora o que fica DENTRO da mão) ───────────────────────────────────────────────────────────────────
    pecas = {o.name: o for o in bastao.children if o.type == "MESH"}
    M0i = np.array(bastao.matrix_world.inverted())
    pts = np.concatenate([ck._amostras(*ck._avaliar_simples(o), 0.01) for o in pecas.values()])
    pts_loc = pts @ M0i[:3, :3].T + M0i[:3, 3]           # pontos do bastão no referencial dele

    pont_bvh = {}                                             # ponteiras no referencial do bastão (o bastão é rígido)
    for s_ in (-1, 1):
        v_, f_ = ck._avaliar_simples(pecas["bastao_ponteira%+d" % s_])
        pont_bvh[s_] = (v_ @ M0i[:3, :3].T + M0i[:3, 3], f_)

    def folgas_extra():
        """Folgas (mm, até 300): bastão × tronco/coxas, × rosto/pescoço, × antebraços e × cabelo; mão × bastão fora da pegada (a pele a
        mais de 3,5 cm do meio da mão, ao longo do bastão); mão × ponteira (− = dentro); pele do polegar × bastão (− = dentro)."""
        co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        Mb = np.array(bastao.matrix_world)
        pb = pts_loc @ Mb[:3, :3].T + Mb[:3, 3]
        out = {}
        for chave, partes in (("tronco", ("Hips", "Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder", "LeftUpLeg",
                                          "RightUpLeg")),
                              ("rosto", ("Head", "Neck")), ("antebracos", ("LeftForeArm", "RightForeArm"))):
            m = _grupo(nomes, dono, partes)
            out[chave] = _menor(_bvh(co, tri[m[tri].all(axis=1)]), pb[::2], 0.30) * 1000
        out["cabelo"] = _menor(ck._bvh(*ck._avaliar_simples(bon.cabelo)), pb[::2], 0.30) * 1000
        M = bastao.matrix_world
        c0, ux = np.array(M.to_translation()), np.array((M.to_3x3() @ X).normalized())
        fora, ponteira, pol = [], [], []
        for L, s in LADOS:
            mv = co[np.array([nm.startswith(L + "Hand") for nm in nomes] + [False])[dono]]
            d = mv - c0
            a = d @ ux
            rad = np.linalg.norm(d - np.outer(a, ux), axis=1) - RAIO
            a_c = float(np.median(a[rad < 0.01])) if (rad < 0.01).any() else s * GRIP_X
            longe = np.abs(a - a_c) > 0.035                # as beiradas da mão (lado do indicador e do mínimo)
            fora.append(float(rad[longe].min()) * 1000 if longe.any() else 9e3)
            v_, f_ = pont_bvh[s]
            ponteira.append(_com_sinal(_bvh(v_ @ Mb[:3, :3].T + Mb[:3, 3], f_), mv[::2]) * 1000)
            mt = np.array([nm.startswith(L + "HandThumb") for nm in nomes] + [False])[dono]
            dt = co[mt] - c0
            pol.append(float((np.linalg.norm(dt - np.outer(dt @ ux, ux), axis=1) - RAIO).min()) * 1000)
        out["pegada"] = [ck._pegada(co, nomes, dono, L, bk) for L, _ in LADOS]
        out.update(fora=fora, ponteira=ponteira, polegar=pol)
        return out

    def giros():
        """Rotação do úmero (graus, + = externa: a dobra do cotovelo × a dobra 'reta pra frente' do braço, em volta do braço) e pronação
        do antebraço (graus: 0 = supinado, a palma pro mesmo lado da dobra do cotovelo; 90 = neutro; 180 = pronado — a palma × a dobra do
        cotovelo, em volta do antebraço), por lado."""
        jj = ck.posicoes(rig)
        out = {}
        for L, s in LADOS:
            a = (c(L + "ForeArm") - c(L + "Arm")).normalized()
            ref = -(Y - a * Y.dot(a)).normalized()               # a dobra "reta pra frente" (rotação 0)
            db = dobra(L)
            rot = -s * _angulo(ref, db, a)
            f = (c(L + "Hand") - c(L + "ForeArm")).normalized()
            palma = Vector(tc._palma(jj, L))
            pron = s * _angulo(db, palma, f)
            out[L] = (rot, pron)
        return out

    def info():
        jj = ck.posicoes(rig)
        ck.posicoes_das_juntas(rig)
        juntas = ck.medir_juntas(rig)
        b = estado.get("bastao", Vector())
        f = folgas_extra()
        g = giros()
        pb = {L: pg.pele_do_polegar(bon, L) for L, _ in LADOS}
        tw = {L: (math.degrees(PB[p3.P + L + "ForeArm"].matrix_basis.to_quaternion().to_swing_twist("Y")[1]),
                  math.degrees(PB[p3.P + L + "Hand"].matrix_basis.to_quaternion().to_swing_twist("Y")[1])) for L, _ in LADOS}
        incl = math.degrees(math.asin(max(-1.0, min(1.0, estado.get("eixo", X).z))))
        return ("φ %.1f° | mão no bastão E encosto %+.1f mm envolve %.0f° D encosto %+.1f mm envolve %.0f° | cotovelo %.1f/%.1f° | braço "
                "elevação %s° plano %s° (− = atrás) | rotação do úmero (+ ext) E %+.0f D %+.0f° | pronação do antebraço E %.0f D %.0f° | "
                "punho flexão %s° desvio %s° (junta %.0f/%.0f°) | pegada %.2f | bastão y %+.4f z %.4f (inclina %.2f°) | bastão × tronco "
                "%.1f, × rosto %.1f, × cabelo %.1f, × antebraços %.1f mm | mão × bastão fora da pegada E %.1f D %.1f mm | mão × ponteira "
                "E %.0f D %.0f mm | %s | dedos E %s D %s | polegar × bastão E %.1f D %.1f mm | pele "
                "da base do polegar E %.2f× (%d do avesso) D %.2f× (%d do avesso) | giro (matrix_basis) do antebraço E %.0f D %.0f°, "
                "da mão E %.1f D %.1f°" % (
                    estado.get("phi", 0.0), f["pegada"][0]["encosto"], f["pegada"][0]["envolve"], f["pegada"][1]["encosto"],
                    f["pegada"][1]["envolve"], juntas["cotoveloE"], juntas["cotoveloD"],
                    "/".join("%.0f" % v for v in tc.braco_elevacao(jj)), "/".join("%.0f" % v for v in tc.braco_plano(jj)),
                    g["Left"][0], g["Right"][0], g["Left"][1], g["Right"][1],
                    "/".join("%.0f" % v for v in tc.punho_flexao(jj)), "/".join("%.0f" % v for v in tc.punho_desvio(jj)),
                    juntas["punhoE"], juntas["punhoD"], tc.pegada_largura(jj)[0], b.y, b.z, incl, f["tronco"], f["rosto"],
                    f["cabelo"], f["antebracos"], *f["fora"], *f["ponteira"], maos.info(), pose.dedos.get("Left"),
                    pose.dedos.get("Right"), *f["polegar"], pb["Left"]["alonga_max"], pb["Left"]["viradas"],
                    pb["Right"]["alonga_max"], pb["Right"]["viradas"], tw["Left"][0], tw["Right"][0], tw["Left"][1], tw["Right"][1]))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    return Cena(pose, [bastao], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0, foco_luz=(0, 0, 1.2),
                camera_video=((2.6, -3.4, 1.7), (0, 0, 1.25), 50), info=info)
