# Agachamento Frontal com Barra — cena da fábrica 3D (lote 8, 09/10/2026; 0 usos nos treinos prontos do app, 22 vezes como troca
# equivalente). t = 0 em pé · t = 1 embaixo (coxas um pouco abaixo da paralela). O app faz a volta (subida).
# Técnica (as frases das fontes estão na ficha):
#   NSCA, Basics of Strength and Conditioning Manual (2012), 1b. Barbell Front Squat: a barra apoiada na frente dos ombros, de 2
#     jeitos — "Clean Style: Place hands on the bar slightly wider than shoulder-width and rotate elbows up so they are high in front
#     of the bar" ou "Cross-Arm Style" —; pés na largura dos ombros com as pontas pra frente ("shoulder-width apart with toes pointed
#     straight ahead in a comfortable foot position"); desce empurrando o quadril pra trás e dobrando os joelhos ao mesmo tempo, com
#     o tronco indo só um pouco à frente ("simultaneously push hips back, flex knees, and allow the torso to come forward slightly");
#     peso do corpo da planta aos calcanhares; joelhos na direção dos pés ("Keep knees pointed out, aligned with feet, and behind
#     toes throughout entire lift"); cabeça e olhos à frente. As 3 fotos da sequência do manual (4-51 a 4-53) são na pegada de clean.
#   ExRx, Front Squat (estilo do levantamento olímpico): pegada pronada ABERTA um pouco mais larga que os ombros, a barra na frente
#     dos ombros com os cotovelos à frente o mais alto possível e os dedos embaixo da barra ("overhand open grip"; "elbows placed
#     forward as high as possible and finger under bar to each side"), desce até as coxas passarem um pouco da paralela, os joelhos
#     vão pra fora na direção das pontas dos pés. ExRx, Barbell Front Squat (estilo de musculação): braços cruzados — a outra pegada.
#   Cejudo 2022 (IJERPH 19:12985): rack certo = barra na frente dos ombros, cotovelos pra frente, braço quase paralelo ao chão (≥ 80°
#     de flexão do ombro), pegada relaxada com as mãos e os dedos a meio punho–1 punho do ombro e cotovelos não mais abertos que os
#     ombros; quem faz o rack certo tem ~92° de extensão passiva do punho (83° no grupo que erra).
#   Gullett et al. 2009 (JSCR 23:284): a barra "across the anterior deltoids and clavicles", braços paralelos ao chão, base mais ou
#     menos na largura dos ombros, coxas paralelas embaixo; carga de ~70% da massa do corpo.
#   Diggin et al. 2011 (ISBS): no frontal o tronco fica bem mais em pé que com a barra nas costas (~27° × ~43° da vertical embaixo);
#     Yavuz et al. 2015 (J Sports Sci, só o resumo) e Sinclair et al. 2016 (CEJSSM): idem.
# PEGADA: a de clean (a 1ª da NSCA, a das fotos da NSCA e a do ExRx olímpico): mãos um pouco mais abertas que os ombros, a barra
# nos dedos, com os dedos embaixo dela, e o polegar do MESMO lado dos dedos, sem dar a volta (pegada aberta, ExRx; pegada relaxada,
# Cejudo); cotovelos à frente, altos e mais juntos que os ombros. A MÃO VIRA PRA FORA: neste boneco o braço (ombro → cotovelo,
# 25,4 cm) é mais curto que o antebraço (26,1 cm) e, com o cotovelo à frente e alto e a barra nos deltoides, o antebraço chega no
# punho correndo pra fora e pra trás; com a mão atravessando a barra em ângulo reto (a 1ª montagem, 09/10/2026) o punho dobrava
# ~86° de LADO (pro lado do polegar; o normal é até 20°, AAOS) e não pra trás. Virada pra fora (os dedos apontando pra fora, pra
# trás e pra baixo), a barra atravessa os dedos na diagonal, a palma fica ~4,5 cm abaixo dela (só os dedos a seguram, como no rack
# de "pegada relaxada") e o punho dobra pra trás (extensão ~63–68°) com o desvio de 12–15°.
# Montagem (pernas como no levantamento terra e no agachamento sumô, lote 7): tornozelos parados no chão a ±X_TORNOZELO, pés girados
# PONTA graus pra fora (sola chapada), cada joelho no plano vertical do próprio pé (joelho_no_plano_do_pe); a pelve e o tronco giram
# juntos em volta das articulações do quadril (coluna neutra) e a cabeça volta PESCOCO da inclinação (olhar à frente). A pose sai de
# 3 ângulos — canela (joelho à frente do tornozelo), joelho e tronco —: joelho e tronco andam juntos (t) e a canela sai de uma busca
# em cada quadro que deixa o centro de massa do corpo + barra (frações de massa de de Leva 1996; carga de 70% da massa do corpo,
# Gullett 2009) COM_ALVO à frente do tornozelo — o peso entre o calcanhar e a planta (NSCA, ExRx).
# O RACK é rígido com o tronco: a barra fica parada no referencial do tórax (apoiada nos deltoides, sem entrar no pescoço) e as mãos
# no mesmo lugar da barra em todo quadro (maos3d.Maos.segurar com o "vão" na prega da palma, afastado da palma o tanto que a barra na
# diagonal pede); os cotovelos sobem COTOVELO_SOBE da inclinação do tronco (giro em volta da reta ombro → punho, a mão parada); dedos e
# polegar saem de uma busca no montar() e ficam na mesma postura (em relação à mão) em todos os quadros: nada escorrega entre os quadros.
import math
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import polegar3d as P3
import checagem3d as ck
from maos3d import Maos
from cena import Cena
from levantamento_terra import joelho_no_plano_do_pe

LADOS = (("Left", 1), ("Right", -1))
DEDOS = ("Index", "Middle", "Ring", "Pinky")

# ── barra ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
RAIO_BARRA = 0.0145        # eixo de 29 mm (a e3.barra; IPF: 28–29 mm)
R_ANILHA = 0.225           # anilha de 45 cm (IWF: "450 mm with a tolerance of ± 1 mm"), a do Levantamento Terra

# ── base ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
X_TORNOZELO = 0.215        # tornozelos a 43 cm um do outro: pés na largura dos ombros (NSCA; Diggin 2011: 107 ± 10% da largura
                           # biacromial; no boneco os ombros ficam a 0,40 m e as articulações do quadril a 0,21 m)
PONTA = 10.0               # ponta do pé pra fora (graus): "toes pointed straight ahead in a comfortable foot position" (NSCA)
JOELHO_FORA = 0.005        # centro do joelho 5 mm pra fora do plano vertical do pé (NSCA: "knees pointed out, aligned with feet")

# ── movimento (graus) ───────────────────────────────────────────────────────────────────────────────────────────────────────────
JOELHO_CIMA = 5.0          # flexão do joelho em pé (sem travar); embaixo sai da busca (coxa a COXA_BAIXO da horizontal)
COXA_BAIXO = -2.0          # coxa embaixo (graus; − = joelho acima do quadril): "just past parallel" (ExRx), "parallel" (NSCA)
TRONCO = (2.0, 27.0)       # tronco à frente da vertical: em pé → embaixo (Diggin 2011: ~27° no frontal)
PESCOCO = 0.9              # a cabeça volta essa fração da inclinação do tronco: olhar à frente (NSCA: "head and eyes straight ahead")
COM_ALVO = 0.030           # centro de massa (corpo + barra) à frente dos tornozelos (m): entre o calcanhar (6 cm atrás) e a base
                           # dos dedos (14 cm à frente) — "equal distribution of weight through forefoot and heel" (ExRx)
CARGA = 0.70               # barra + anilhas = 70% da massa do corpo (Gullett 2009, a 70% de 1RM: "almost 70% of their body mass")

# ── rack (pegada de clean, mão virada pra fora) ──────────────────────────────────────────────────────────────────────────────
BARRA_FRENTE = 0.040      # eixo da barra à frente das articulações dos ombros (m, referencial do tronco); a altura sai de uma busca em
                           # cada quadro: a barra pousa nos deltoides e nas clavículas (pele a BARRA_FOLGA dela) — "across the anterior
                           # deltoids and clavicles" (Gullett), "aligned with the clavicular ridge" (Sinclair)
BARRA_FOLGA = 0.001        # pele dos deltoides → superfície da barra (m): encostando
PESCOCO_MIN = 0.010        # pescoço, garganta, queixo e rosto → superfície da barra (m), com a barra pousada: rente, sem encostar
# Cada braço, nos números do ESQUERDO (o direito usa os dele espelhados, x → −x), no referencial do tronco em repouso:
#   x: onde o vão da mão (o eixo da barra, que o montar() afasta da palma: a barra fica nos dedos) fica ao longo da barra (m): a
#   beirada da mão ~1 punho por fora do deltoide (Cejudo 2022: "half a fist width to one fist width from the shoulder")
#   guin, arf, rol (graus): partindo dos dedos pra trás com a palma pra cima, a palma rola `rol` em volta dos dedos, os dedos descem
#   (arf < 0) e viram pra fora (guin < 0, vistos de cima): a palma fica virada pra cima e pra trás e os dedos passam por baixo da
#   barra, na diagonal
#   elev, plano (graus): braço × eixo do tronco (90 = na horizontal do tronco; Cejudo: "the upper arm almost parallel to the floor
#   (≥80° shoulder flexion)") e visto de cima (90 = pra frente, > 90 = pra frente e pro meio: cotovelos mais juntos que os ombros)
# A busca analítica do rascunho (exp/busca_clean5.py, com a pele da mão e do polegar do boneco: vão, base e prega do polegar fora da
# barra, cotovelo até ~138° — mais que isso o antebraço entra no bíceps —, cotovelos a ≥ 9 cm do meio — mais perto o braço entra no
# peito —, braço ≥ 80° do tronco) só achou postura com o punho na amplitude normal e o polegar fora da barra com a mão a ~42 cm do
# meio (~1 punho por fora do deltoide) e virada ~65° pra fora; medido no Blender: extensão 66–68° e desvio 12–15° em pé, 63–65° e
# 13–15° embaixo, cotovelo 138°, braço 81–86° do tronco, palma 35–44° da vertical.
BRACOS = {"Left": dict(x=0.42, guin=-65.0, arf=-42.0, rol=-5.0, elev=87.0, plano=100.0),
          "Right": dict(x=0.42, guin=-65.0, arf=-42.0, rol=-5.0, elev=87.0, plano=100.0)}
DELTA = -0.020             # o eixo da barra fica DELTA m depois da linha dos nós dos dedos (− = antes: na prega da palma)
COTOVELO_SOBE = 0.15       # quanto da inclinação do tronco os cotovelos sobem (giro em volta da reta ombro → punho; a mão fica parada
                           # na barra): "elbows high" o tempo todo (NSCA: "rotate elbows up so they are high in front of the bar";
                           # ExRx: "elbows placed forward as high as possible")
PROTRAI = 8.0              # cintura escapular pra frente (graus, osso Shoulder em volta do eixo do tronco): os ombros vão à frente e
                           # os deltoides fazem a "prateleira" da barra
ELEVA = 6.0                # cintura escapular subindo (graus, osso Shoulder): ExRx (olímpico), estático: "Scapula & Clavicle
                           # Elevation, Upward Rotation"
APERTO = 0.001             # a pele aperta a barra até isso (m)
CORPO_ENTRA = 0.0015       # dedos encostando no ombro/deltoide atrás da barra: a pele pode afundar até isso, entrar não
DIP_PIP = 0.7              # a junta da ponta do dedo (DIP) dobra 0,7 da do meio (PIP)
BASE_POLEGAR = 0.035       # pele da base e da prega do polegar (ossos do polegar, até isso da junta CMC) que fica fora da barra no vão
COM_POLEGAR = True         # (sondas) False pula a busca do polegar
DEBUG_POLEGAR = False      # (sondas) True imprime as medidas das melhores posturas da grade do polegar

# ── centro de massa: frações de massa e centro de cada segmento (de Leva 1996, J Biomech 29:1223, tabela 4, homens) ──────────────
SEGMENTOS = (("VERT", "CERV", 0.0694, 0.5002),      # cabeça: topo da cabeça → C7 (base do pescoço)
             ("CERV", "MIDH", 0.4346, 0.5138))      # tronco: C7 → meio das articulações do quadril
SEGMENTOS_LADO = (("Arm", "ForeArm", 0.0271, 0.5772), ("ForeArm", "Hand", 0.0162, 0.4574), ("Hand", "HandMiddle1", 0.0061, 0.7900),
                  ("UpLeg", "Leg", 0.1416, 0.4095), ("Leg", "Foot", 0.0433, 0.4395))
PE = (0.0137, 0.4415)      # pé: calcanhar → ponta dos dedos


def sdf_barra(P, c, u):
    """Distância com sinal (m, − = dentro) dos pontos P (N×3) até a superfície do eixo da barra (centro c, direção u)."""
    d = np.asarray(P, float) - np.asarray(c, float)
    u = np.asarray(u, float)
    return np.linalg.norm(d - np.outer(d @ u, u), axis=1) - RAIO_BARRA


def _pele(bon, niveis=0):
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, niveis)
    return co, tri, nomes, dono


def _mascara(nomes, dono, pred):
    return np.array([bool(pred(n)) for n in nomes] + [False])[dono]


def _dentro_de(bvh, P, limite=0.03):
    """Quanto o ponto mais fundo de P entra na malha do bvh (m; 0 = nenhum entra)."""
    fundo = 0.0
    for v in P:
        vv = Vector(v)
        loc, nor, _, dist = bvh.find_nearest(vv)
        if loc is not None and dist < limite and (vv - loc).dot(nor) < 0:
            fundo = max(fundo, dist)
    return fundo


def corpo_sem_mao(bon, lado):
    """BVH da pele do corpo inteiro menos a mão `lado` (mão, dedos e polegar): o que os dedos dela não podem atravessar."""
    co, tri, nomes, dono = _pele(bon)
    da_mao = _mascara(nomes, dono, lambda n_: n_.startswith(lado + "Hand"))
    t = tri[~da_mao[tri].any(axis=1)]
    return BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in t], all_triangles=True)


def fechar_dedos(bon, lado, c, u, aperto=APERTO, corpo=None):
    """Cada dedo (indicador ao mínimo), a partir dos dedos esticados e juntos, dobra na base (MCP, m graus) e no meio (PIP, p; a
    ponta, DIP, segue DIP_PIP × p) — grade de 5° e depois de 1° — pra postura que deixa a pele do dedo inteira o mais rente
    possível da barra (média da folga até 3 cm), sem entrar nela mais que `aperto` nem no corpo (BVH `corpo`) mais que CORPO_ENTRA:
    o dedo deita em cima da barra e dobra em volta dela até onde o ombro deixa. Desempate: menos dobra. Devolve {dedo: (m, p,
    folga mínima mm, folga média mm)}."""
    rig = bon.rig
    palma, eixo_nos = pg._base(rig, lado)[:2]
    co, _, nomes, dono = _pele(bon)
    pos = {nm: i for i, nm in enumerate(nomes)}
    out = {}
    for d in DEDOS:
        ossos = ["%sHand%s%d" % (lado, d, i) for i in (1, 2, 3)]
        pts = {o: co[dono == pos[o]] for o in ossos}
        cab = {o: np.array(p3.cabeca(rig, o)) for o in ossos}
        ponta = np.array(p3.ponta(rig, ossos[-1]))
        f = (p3.ponta(rig, ossos[0]) - p3.cabeca(rig, ossos[0])).normalized()
        sinal = 1 if eixo_nos.cross(f).dot(palma) > 0 else -1

        def avaliar(m, p):
            pp = pg._cadeia_pts(pts, cab, ponta, ossos, [eixo_nos] * 3, [m * sinal, p * sinal, DIP_PIP * p * sinal])
            P = np.concatenate([pp[o] for o in ossos])
            return P, sdf_barra(P, c, u)

        melhor = None
        grade = [(m, p) for m in range(-10, 81, 5) for p in range(0, 101, 5)]
        for passo, cands in ((5, grade), (1, None)):
            if cands is None:
                if melhor is None:
                    break
                m0, p0 = melhor[1], melhor[2]
                cands = [(m, p) for m in range(m0 - 4, m0 + 5) for p in range(max(0, p0 - 4), min(100, p0 + 4) + 1)]
            for m, p in cands:
                P, sd = avaliar(m, p)
                if float(sd.min()) < -aperto:
                    continue
                cc = float(np.clip(sd, 0.0, 0.03).mean()) + 0.00002 * (abs(m) + p)
                if melhor is not None and cc >= melhor[0]:
                    continue
                if corpo is not None and _dentro_de(corpo, P[::2]) > CORPO_ENTRA:
                    continue
                melhor = (cc, m, p, float(sd.min()), float(np.clip(sd, 0.0, 0.03).mean()))
        if melhor is None:
            melhor = (0.0, 0, 0, float("nan"), float("nan"))
        _, m, p, mn, md = melhor
        for o, a in zip(ossos, (m, p, DIP_PIP * p)):
            if a:
                p3.girar_osso(rig, o, p3.rot_eixo(a * sinal, eixo_nos))
        out[d] = (m, p, round(mn * 1000, 1), round(md * 1000, 1))
    return out


def polegar_na_barra(bon, lado, c, u, alvo, aperto=APERTO, base_livre=0.015):
    """Polegar da mão `lado` do MESMO lado dos dedos (pegada aberta), com a polpa encostando embaixo da barra no `alvo` — a busca do
    polegar novo (eixos anatômicos tirados do rig, pele por LBS, MCP e IP perto da pegada medida de Goislard 2012, pele da base sem
    esticar mais que pg.POLEGAR_ALONGA_MAX nem virar do avesso), com o alvo e o obstáculo desta pegada: nada do polegar entra na
    barra nem nos dedos/palma da própria mão. A mesma conta do agachamento sumô (lote 7), com a barra no lugar do halter. Põe o
    polegar no Blender e devolve (postura, viável, polpa × barra mm, polpa × alvo mm, alongamento, fundo na barra mm)."""
    rig = bon.rig
    ossos = [lado + "HandThumb%d" % i for i in (1, 2, 3)]
    for o in ossos:
        rig.pose.bones[p3.P + o].matrix_basis = Matrix.Identity(4)
    p3.atualizar()
    pele = pg._pele(bon)
    pesos = pele["pesos"]
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 0)
    pos = {nm: i for i, nm in enumerate(nomes)}
    idx = np.array(sorted(i for i, gs in pesos.items() if any(o in gs for o in ossos)))
    W = np.array([[pesos[i].get(o, 0.0) for o in ossos] for i in idx])
    H = np.c_[pele["co"][idx], np.ones(len(idx))]
    fixos = {}
    fixo = np.zeros((len(idx), 3))
    for k, i in enumerate(idx):
        for nm, w_ in pesos[i].items():
            if nm not in ossos:
                if nm not in fixos:
                    fixos[nm] = pg._rel(rig, nm)
                fixo[k] += w_ * (fixos[nm] @ H[k])[:3]
    M0 = [pg._rel(rig, o) for o in ossos]
    cab = [np.array(p3.cabeca(rig, o)) for o in ossos]
    ponta = np.array(p3.ponta(rig, ossos[2]))
    eixos = P3.eixos_do_polegar(np.array(pg._base(rig, lado)[0]), cab, ponta)
    base = P3.base_do_polegar(pesos, lado)
    E_, T_ = pele["E"], pele["tri"]
    Eb = E_[np.isin(E_, list(base)).any(axis=1)]
    Tb = T_[np.isin(T_, list(base)).any(axis=1)]
    l0 = np.linalg.norm(pele["co"][Eb[:, 0]] - pele["co"][Eb[:, 1]], axis=1)
    n0 = P3.normais(pele["co"], Tb)
    donos = P3.dono_dos_triangulos(Tb, pesos)
    dono_k = np.array([ossos.index(nm) if nm in ossos else -1 for nm in donos])
    R_fixo = np.array([fixos.get(nm, pg._rel(rig, nm) if nm else np.eye(4))[:3, :3] if nm not in ossos else np.eye(3)
                       for nm in donos])
    tem = np.zeros(len(co), bool)
    tem[idx] = True
    ok = {pos[lado + "Hand"]} | {pos["%sHand%s%d" % (lado, d, i)] for d in DEDOS for i in (1, 2, 3)}
    t_ok = tri[np.isin(dono[tri], list(ok)).all(axis=1) & ~tem[tri].any(axis=1)]
    bvh = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(t) for t in t_ok], all_triangles=True)
    linha = {int(i): k for k, i in enumerate(idx)}
    d_pol = [pos[o] for o in ossos]
    cmc = np.array(p3.cabeca(rig, ossos[0]))
    k_pol = np.array([linha[int(i)] for i in idx if dono[i] in d_pol and np.linalg.norm(co[i] - cmc) > base_livre])   # a base
    # (até base_livre da CMC) não sai do lugar com o polegar: quem a deixa fora da barra é o vão (montar)
    k_teste = np.array([linha[int(i)] for i in idx if dono[i] in d_pol and not any(
        nm in pesos[int(i)] for nm in (lado + "Hand", lado + "HandIndex1", lado + "ForeArm"))])
    k_ponta = np.array([linha[int(i)] for i in idx if dono[i] == d_pol[2]])
    alvo = np.asarray(alvo, float)
    P = co.copy()

    def medir(q):
        rots = P3.rotacoes(eixos, q)
        Mc, juntas = P3.cadeia(cab, ponta, rots)
        Ms = [Mc[k] @ M0[k] for k in range(3)]
        Q = P3.lbs(H, W, fixo, Ms)
        barra = max(0.0, -float(sdf_barra(Q[k_pol], c, u).min()))
        P[idx] = Q
        alonga = float((np.linalg.norm(P[Eb[:, 0]] - P[Eb[:, 1]], axis=1) / l0).max())
        R = R_fixo.copy()
        for k in range(3):
            R[dono_k == k] = Ms[k][:3, :3]
        vir = P3.viradas(n0, P, Tb, R)
        entra = _dentro_de(bvh, Q[k_teste])
        polpa = Q[k_ponta]
        gap = max(0.0, float(sdf_barra(polpa, c, u).min()))
        d_alvo = float(np.linalg.norm(polpa.mean(axis=0) - alvo))
        return dict(rots=rots, barra=barra, alonga=alonga, viradas=vir, entra=entra, gap=gap, alvo=d_alvo)

    # a pele da base do polegar já estica e dobra com o indicador dobrado em volta da barra (polegar3d: os dedos fechados de hoje
    # esticam as arestas dos nós até 2,1–3,9×): o teto do alongamento é o maior entre pg.POLEGAR_ALONGA_MAX e 1,10 × o que ela já
    # tem com o polegar em repouso, e só contam os triângulos do avesso além dos que o repouso já tem — o polegar não piora a pele
    rep = medir((0.0,) * 6)
    alonga_max = max(pg.POLEGAR_ALONGA_MAX, rep["alonga"] * 1.10)
    viradas_rep = rep["viradas"]

    def custo(q):
        m = medir(q)
        viola = (10 * max(0.0, m["barra"] - aperto) + 10 * max(0.0, m["entra"] - pg.POLEGAR_ENTRA) +
                 0.05 * max(0.0, m["alonga"] - alonga_max) + 0.003 * max(0, m["viradas"] - viradas_rep))
        return m["gap"] + 0.05 * m["alvo"] + viola + P3.custo_postura(q), viola == 0

    grade = [(cf, ca, cr, mf, P3.REF_33MM[4], ipf) for cf in (-60, -30, 0, 30) for ca in (-45, -20, 0, 25, 50)
             for cr in (-30, 0, 30) for mf in (0, 20, 40) for ipf in (0, 25, 50)]
    if DEBUG_POLEGAR:
        for q in sorted(grade, key=lambda q: custo(q)[0])[:12] + [(0.0,) * 6]:
            m = medir(q)
            print("POLEGAR? %s: barra %.1f entra %.1f alonga %.2f (teto %.2f) viradas %d gap %.1f alvo %.1f" % (
                q, m["barra"] * 1000, m["entra"] * 1000, m["alonga"], alonga_max, m["viradas"], m["gap"] * 1000, m["alvo"] * 1000),
                flush=True)
    sementes = [q for _, q in sorted((custo(q)[0], q) for q in grade)[:8]] + [P3.REF_33MM, (0.0,) * 6]
    q, J, viavel, n = P3.buscar(custo, sementes, pg.POLEGAR_FAIXAS)
    if not viavel:                         # nenhuma postura viável encosta: o polegar fica solto (o do repouso), do lado dos dedos
        q = (0.0,) * 6
    m = medir(q)
    for o, R in zip(ossos, m["rots"]):
        if not np.allclose(R, np.eye(3)):
            p3.girar_osso(rig, o, Matrix(R.tolist()))
    return (tuple(round(float(x), 1) for x in q), bool(viavel), round(m["gap"] * 1000, 1), round(m["alvo"] * 1000, 1),
            round(m["alonga"], 2), round(m["barra"] * 1000, 1))


def mao_dir(cfg, s):
    """Dedos e palma da mão (referencial do tronco em repouso) pelos ângulos de BRACOS; s = −1 espelha (braço direito)."""
    gu, ar, ro = (math.radians(cfg[k]) for k in ("guin", "arf", "rol"))
    D0, P0 = Vector((0.0, 1.0, 0.0)), Vector((0.0, 0.0, 1.0))
    P1 = P0 * math.cos(ro) + D0.cross(P0) * math.sin(ro)
    M = Matrix.Rotation(gu, 3, "Z") @ Matrix.Rotation(ar, 3, "X")
    D, P = M @ D0, M @ P1
    if s < 0:
        D, P = Vector((-D.x, D.y, D.z)), Vector((-P.x, P.y, P.z))
    return D, P


def braco_dir(cfg, s):
    """Direção do braço (ombro → cotovelo) pelos ângulos de BRACOS (referencial do tronco em repouso); s = −1 espelha."""
    el, pl = math.radians(cfg["elev"]), math.radians(cfg["plano"])
    return Vector((s * math.sin(el) * math.cos(pl), -math.sin(el) * math.sin(pl), -math.cos(el)))


def punho_anatomico(rig, lado):
    """Punho decomposto (graus): extensão (−) / flexão (+) no plano da mão (= tecnica3d.punho_flexao), desvio (+ = pro lado do
    polegar, radial; − = ulnar) no plano da palma, e o ângulo total mão × antebraço."""
    c = lambda n: p3.cabeca(rig, n)
    s = 1.0 if lado == "Left" else -1.0
    a = (c(lado + "Hand") - c(lado + "ForeArm")).normalized()
    d = (c(lado + "HandMiddle1") - c(lado + "Hand")).normalized()
    h = c(lado + "Hand")
    palma = (-s * (c(lado + "HandIndex1") - h).cross(c(lado + "HandPinky1") - h)).normalized()
    r = c(lado + "HandIndex1") - c(lado + "HandPinky1")
    r = (r - d * r.dot(d)).normalized()
    k = d.cross(palma).normalized()
    ext = math.degrees(math.atan2(a.cross(d).dot(k), a.dot(d)))
    aq = a - palma * a.dot(palma)
    dev = math.degrees(math.atan2(-aq.dot(r), aq.dot(d)))
    return ext, dev, math.degrees(a.angle(d))


def montar(bon):
    pg.usar_polegar("volta")              # padrão dos exercícios novos (o polegar desta pegada sai da busca própria, abaixo)
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda nome: p3.cabeca(rig, nome)
    lt = (c("LeftLeg") - c("LeftUpLeg")).length
    ls = (c("LeftFoot") - c("LeftLeg")).length
    meio0 = (c("LeftUpLeg") + c("RightUpLeg")) / 2
    meia_quadril = (c("LeftUpLeg") - c("RightUpLeg")).length / 2
    tz0 = c("LeftFoot")
    neck0 = c("Neck")
    vert0 = p3.ponta(rig, "Head")

    # ── pés: tornozelos no lugar, sola chapada e ponta virada PONTA graus pra fora ─────────────────────────────────────────────────
    pes, pernas, polos, tornozelos = {}, {}, {}, {}
    for lado, s in LADOS:
        th = math.radians(PONTA)
        f = Vector((s * math.sin(th), -math.cos(th), 0.0))
        n = Vector((s * math.cos(th), math.sin(th), 0.0))
        A = Vector((s * X_TORNOZELO, tz0.y, tz0.z))
        pes[lado] = dict(A=A, f=f, n=n)
        tornozelos[lado] = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))
        polos[lado] = p3.vazio("polo_joelho_" + lado, A + f * 1.2 + Vector((0.0, 0.0, 0.45)))
        pernas[lado] = p3.ik(rig, lado + "Leg", tornozelos[lado], polos[lado])
        b = rig.data.bones[p3.P + lado + "Foot"]
        rot = p3.vazio("rot_" + lado + "Foot")
        rot.matrix_world = Matrix.Rotation(s * th, 4, "Z") @ (rig.matrix_world @ b.matrix_local)
        cn = PB[p3.P + lado + "Foot"].constraints.new("COPY_ROTATION")
        cn.target = rot
        tornozelos[lado].location = A
    p3.atualizar()
    ya, za = tz0.y, tz0.z
    dx = X_TORNOZELO - meia_quadril
    A_meio = (pes["Left"]["A"] + pes["Right"]["A"]) / 2

    # pé (pele, em repouso, ao longo da direção do pé): calcanhar e ponta dos dedos — o centro de massa do pé
    co, _, nomes, dono = _pele(bon)
    PEPELE = {}
    for lado, s in LADOS:
        P = co[_mascara(nomes, dono, lambda n_, L=lado: n_ in (L + "Foot", L + "ToeBase"))]
        rest = np.array((s * tz0.x, tz0.y, tz0.z))
        th = math.radians(PONTA)
        f0 = np.array((0.0, -1.0, 0.0))                      # em repouso o pé aponta pra −Y
        proj = (P - rest) @ f0
        PEPELE[lado] = (float(proj.min()), float(proj.max()))  # (calcanhar, ponta) ao longo do pé, a partir do tornozelo

    def quadril(canela, joelho):
        """Meio das articulações do quadril (y, z) com a canela `canela` graus à frente da vertical e o joelho dobrado `joelho`
        graus, no plano sagital; z corrigido pra distância de verdade quadril → tornozelo (com o afastamento de lado)."""
        a, k = math.radians(canela), math.radians(joelho)
        y = ya - ls * math.sin(a) + lt * math.sin(k - a)
        d = math.sqrt(ls * ls + lt * lt + 2 * ls * lt * math.cos(k))
        z = za + math.sqrt(max(d * d - dx * dx - (y - ya) ** 2, 1e-6))
        return y, z

    def joelhos(y, z):
        return {lado: joelho_no_plano_do_pe(Vector((s * meia_quadril, y, z)), pes[lado]["A"], pes[lado]["f"], pes[lado]["n"],
                                            lt, ls, JOELHO_FORA) for lado, s in LADOS}

    estado = {}

    def corpo(canela, joelho, tronco):
        """Pelve e tronco (giram juntos: coluna neutra), joelhos no plano dos pés, cabeça olhando à frente."""
        for nome in ("Hips", "Neck", "Head", "LeftShoulder", "RightShoulder"):
            PB[p3.P + nome].matrix_basis = Matrix()
        p3.atualizar()
        y, z = quadril(canela, joelho)
        p3.girar_osso(rig, "Hips", p3.rot_x(tronco), pivo=meio0, mover=Vector((0.0, y - meio0.y, z - meio0.z)))
        K = joelhos(y, z)
        for lado, _ in LADOS:
            Kj, C, _ = K[lado]
            v = Kj - C
            polos[lado].location = Kj + (v.normalized() if v.length > 1e-6 else pes[lado]["f"]) * 0.6
        p3.atualizar()
        p3.girar_osso(rig, "Neck", p3.rot_x(-tronco * PESCOCO))
        R = p3.rot_x(tronco)
        for lado, s in LADOS:                       # cintura escapular: sobe (eixo frente-trás) e vai à frente (eixo do tronco)
            if ELEVA:
                p3.girar_osso(rig, lado + "Shoulder", Matrix.Rotation(math.radians(-s * ELEVA), 3, R @ Vector((0, 1, 0))))
            if PROTRAI:
                p3.girar_osso(rig, lado + "Shoulder", Matrix.Rotation(math.radians(-s * PROTRAI), 3, R @ Vector((0, 0, 1))))
        estado.update(canela=canela, joelho=joelho, tronco=tronco, K={l: K[l][0] for l, _ in LADOS}, O=Vector((0.0, y, z)), R=R)

    def no_tronco(p_rep):
        """Ponto do tronco em pé (repouso) → mundo, com o tronco de agora."""
        return estado["O"] + estado["R"] @ (Vector(p_rep) - meio0)

    def do_tronco(p):
        """Mundo → ponto equivalente do tronco em pé (repouso)."""
        return estado["R"].transposed() @ (Vector(p) - estado["O"]) + meio0

    rel = {"barra": Vector((0.0, -0.10, -0.045))}     # eixo da barra × base do pescoço (repouso); a busca no montar() acerta

    def barra_centro():
        return no_tronco(neck0 + rel["barra"])

    def polo_dos_joelhos(canela, joelho, tronco):
        """pole_angle do IK de cada perna (joelho no plano quadril–tornozelo–polo, do lado do polo), em 0,5°."""
        corpo(canela, joelho, tronco)
        for lado, _ in LADOS:
            e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
            melhor = (1e9, None)
            for k in range(-10, 11):
                ang = e[1] + k * 0.5
                pernas[lado].pole_angle = math.radians(ang)
                p3.atualizar()
                melhor = min(melhor, ((c(lado + "Leg") - estado["K"][lado]).length, ang))
            pernas[lado].pole_angle = math.radians(melhor[1])
            p3.atualizar()
            print("polo joelho %s %.1f° | joelho a %.1f mm do alvo" % (lado, melhor[1], melhor[0] * 1000), flush=True)

    # ── mãos: o "vão" (onde fica o eixo da barra) na prega da palma, no espaço do osso da mão ──────────────────────────────────────
    maos = Maos(bon, RAIO_BARRA, polo_inicial=(0, -0.5, 0), polegar_modo="volta")
    furo_loc = {}                     # o vão nos eixos que o segurar() usa (dedos, palma, dedos × palma): prevê o punho
    for lado, s in LADOS:
        p3.soltar_dedos(rig, lado)
        pg.juntar_dedos(rig, lado)
        palma, eixo_nos, dir_mao, nos, larg = pg._base(rig, lado)
        co, _, nomes, dono = _pele(bon)
        V = co[_mascara(nomes, dono, lambda n_, L=lado: n_.startswith(L + "Hand") and "Thumb" not in n_)] - np.array(nos)
        perto = V[(np.abs(V @ np.array(eixo_nos)) < 0.02) & (np.abs(V @ np.array(dir_mao) - DELTA) < 0.006)]
        h = float((perto @ np.array(palma)).max())
        g = nos + dir_mao * DELTA + palma * (h + RAIO_BARRA)
        maos.furo[lado] = p3.mundo_osso(rig, lado + "Hand").inverted() @ g
        W0 = c(lado + "Hand")
        y_m = (p3.ponta(rig, lado + "Hand") - W0).normalized()
        n_m = (palma - y_m * palma.dot(y_m)).normalized()
        x_m = y_m.cross(n_m)
        furo_loc[lado] = Vector(((g - W0).dot(y_m), (g - W0).dot(n_m), (g - W0).dot(x_m)))
        # a barra atravessa a mão na DIAGONAL (a mão vira pra fora): o vão medido com a barra na linha dos nós deixa a palma
        # (eminências tenar e hipotenar) entrando nela — o eixo da barra se afasta da palma (normal) até nada da pele do osso da mão
        # nem da base e da prega do polegar (a pele dos ossos do polegar a até BASE_POLEGAR da junta CMC, que o polegar não tira do
        # lugar) entrar mais que APERTO (os dedos e o polegar dobram depois, cada um com a sua busca)
        D, P = mao_dir(BRACOS[lado], s)
        u_loc = Vector((Vector((1.0, 0.0, 0.0)).dot(D), Vector((1.0, 0.0, 0.0)).dot(P), Vector((1.0, 0.0, 0.0)).dot(D.cross(P))))
        base_pol = co[_mascara(nomes, dono, lambda n_, L=lado: n_.startswith(L + "HandThumb"))]
        base_pol = base_pol[np.linalg.norm(base_pol - np.array(c(lado + "HandThumb1")), axis=1) < BASE_POLEGAR]
        Q = np.concatenate([co[_mascara(nomes, dono, lambda n_, L=lado: n_ == L + "Hand")], base_pol]) - np.array(W0)
        Q = np.c_[Q @ np.array(y_m), Q @ np.array(n_m), Q @ np.array(x_m)]
        entra = lambda k: -float(sdf_barra(Q, np.array(furo_loc[lado] + Vector((0.0, k, 0.0))), np.array(u_loc)).min())
        k0, k1 = 0.0, 0.0
        antes = entra(0.0)
        if antes > APERTO:
            k1 = 0.002
            while entra(k1) > APERTO and k1 < 0.05:
                k1 += 0.002
            for _ in range(20):
                km = (k0 + k1) / 2
                if entra(km) > APERTO:
                    k0 = km
                else:
                    k1 = km
        furo_loc[lado] = furo_loc[lado] + Vector((0.0, k1, 0.0))
        g = W0 + y_m * furo_loc[lado].x + n_m * furo_loc[lado].y + x_m * furo_loc[lado].z
        maos.furo[lado] = p3.mundo_osso(rig, lado + "Hand").inverted() @ g
        print("VÃO %s: pele da base dos dedos a %.1f mm do eixo dos nós; barra na diagonal: o eixo sai %.1f mm da palma (entrava "
              "%.1f mm) | vão nos eixos da mão %s" % (lado, h * 1000, k1 * 1000, antes * 1000,
                                                   tuple(round(x, 4) for x in furo_loc[lado])), flush=True)

    D_REL, P_REL, B_REL = {}, {}, {}
    for lado, s in LADOS:
        D_REL[lado], P_REL[lado] = mao_dir(BRACOS[lado], s)
        B_REL[lado] = braco_dir(BRACOS[lado], s)
    L1 = (c("LeftForeArm") - c("LeftArm")).length
    L2 = (c("LeftHand") - c("LeftForeArm")).length

    def cotovelo_no_circulo(S, W, quer):
        """Ponto do círculo do cotovelo (braço L1, antebraço L2, ombro S, punho W) com o braço mais perto da direção `quer`."""
        sw = W - S
        Dd = sw.length
        a = (L1 * L1 + Dd * Dd - L2 * L2) / (2 * Dd)
        rc = math.sqrt(max(L1 * L1 - a * a, 0.0))
        C = S + sw.normalized() * a
        e1 = sw.cross(Vector((1, 0, 0))).normalized()
        e2 = sw.cross(e1).normalized()
        melhor = None
        for k in range(0, 720):
            th = math.radians(k * 0.5)
            E = C + (e1 * math.cos(th) + e2 * math.sin(th)) * rc
            d = ((E - S).normalized() - quer).length
            if melhor is None or d < melhor[0]:
                melhor = (d, E)
        return melhor[1], C

    def alvos_dos_bracos():
        """Pra cada lado: (ponto do eixo da barra no vão da mão, dedos, palma, polo do cotovelo, punho previsto), no tronco de agora."""
        R = estado["R"]
        B = barra_centro()
        Rq = p3.rot_x(estado["tronco"] * (1.0 - COTOVELO_SOBE))    # os cotovelos sobem parte da inclinação do tronco
        out = {}
        for lado, s in LADOS:
            g = B + R @ Vector((s * BRACOS[lado]["x"], 0.0, 0.0))
            dq, pq = R @ D_REL[lado], R @ P_REL[lado]
            f = furo_loc[lado]
            W = g - dq * f.x - pq * f.y - dq.cross(pq) * f.z
            S = c(lado + "Arm")
            E, C = cotovelo_no_circulo(S, W, Rq @ braco_dir(BRACOS[lado], s))
            out[lado] = (g, dq, pq, E + (E - C).normalized() * 0.4, W)
        return B, out

    posturas = {}                      # matrix_basis dos dedos e do polegar (relativos à mão), da busca no montar()

    def bracos():
        B, alvos = alvos_dos_bracos()
        for lado, s in LADOS:
            g, dq, pq, polo, _ = alvos[lado]
            for nm in ("Arm", "ForeArm", "Hand"):    # o IK do Blender parte da pose atual: sem zerar, o giro do antebraço que o segurar()
                PB[p3.P + lado + nm].matrix_basis = Matrix()   # deixa num quadro muda a solução do seguinte (o braço "anda" na sequência)
            p3.atualizar()
            maos.segurar(lado, g, dq, pq, polo=polo)
            for nm, M in posturas.get(lado, {}).items():
                PB[p3.P + nm].matrix_basis = M
        p3.atualizar()
        return B

    # ── referência (em pé): polos dos cotovelos, braços no rack ────────────────────────────────────────────────────────────────────
    corpo(2.0, JOELHO_CIMA, TRONCO[0])
    B, alvos = alvos_dos_bracos()
    for lado, _ in LADOS:
        g, dq, pq, polo, W = alvos[lado]
        maos.polos[lado].location = polo
        maos.punhos[lado].location = W
        maos.iks[lado].mute = False
        p3.atualizar()
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo %s erro %.3f ang %d" % (lado, *e), flush=True)
    B = bracos()

    frente_barra = {"m": BARRA_FRENTE}

    def pousar_barra(achar_frente=False):
        """A barra desce (no eixo "cima" do tronco, a frente_barra m à frente das articulações dos ombros) até a pele da prateleira —
        deltoides (osso Arm) e clavículas/peito (Spine2) — ficar a BARRA_FOLGA dela: a 1ª pele que encosta, de cima pra baixo (passos
        de 2 mm e bissecção no último; a cabeça não conta: a barra entra no rack pela frente). achar_frente: anda a barra pra frente
        (2 mm por vez) até o pescoço/cabeça ficar a PESCOCO_MIN dela com a barra pousada — a barra fica no sulco, rente à garganta
        sem encostar. Devolve (pescoço/cabeça mm, deltoides mm, prateleira mm, altura m, frente m)."""
        co, _, nomes, dono = _pele(bon, 1)
        m_prat = _mascara(nomes, dono, lambda n_: n_ in ("LeftArm", "RightArm", "LeftShoulder", "RightShoulder", "Spine2"))
        m_pesc = _mascara(nomes, dono, lambda n_: n_ in ("Neck", "Head"))
        m_delt = _mascara(nomes, dono, lambda n_: n_ in ("LeftArm", "RightArm"))
        P_prat, P_pesc, P_delt = co[m_prat], co[m_pesc], co[m_delt]
        R = estado["R"]
        u = np.array(R @ Vector((1.0, 0.0, 0.0)))
        S = (c("LeftArm") + c("RightArm")) / 2
        frente = R @ Vector((0.0, -1.0, 0.0))
        cima = R @ Vector((0.0, 0.0, 1.0))

        def pouso(fr):
            base = S + frente * fr
            folga = lambda h, P: float(sdf_barra(P, np.array(base + cima * h), u).min())
            perto = lambda h: folga(h, P_prat)          # a barra entra no rack pela frente: só a prateleira conta pra pousar
            h = 0.25
            while h > -0.10 and perto(h) > BARRA_FOLGA:
                h -= 0.002
            lo, hi = h, h + 0.002
            for _ in range(20):
                m_ = (lo + hi) / 2
                if perto(m_) > BARRA_FOLGA:
                    hi = m_
                else:
                    lo = m_
            h = hi
            return h, folga(h, P_pesc), folga(h, P_delt), folga(h, P_prat), base

        fr = frente_barra["m"]
        h, fp, fd, fpr, base = pouso(fr)
        while achar_frente and fp < PESCOCO_MIN and fr < BARRA_FRENTE + 0.10:
            fr += 0.002
            h, fp, fd, fpr, base = pouso(fr)
        frente_barra["m"] = fr
        rel["barra"] = do_tronco(base + cima * h) - neck0
        return fp * 1000, fd * 1000, fpr * 1000, h, fr

    for volta in range(3):                         # barra pousada nos ombros com os braços no rack (a pele muda com os braços)
        f_pesc, f_delt, f_prat, h, fr = pousar_barra(achar_frente=True)
        B = bracos()
        print("BARRA volta %d: %.0f mm à frente e %.1f mm acima das articulações dos ombros | pescoço/cabeça a %.1f mm, deltoides a "
              "%.1f mm, prateleira a %.1f mm | rel %s" % (volta, fr * 1000, h * 1000, f_pesc, f_delt, f_prat,
                                                         tuple(round(x, 4) for x in rel["barra"])), flush=True)
    REL0 = rel["barra"].copy()
    B = bracos()
    ossos_mao = {lado: ["%sHand%s%d" % (lado, d, i) for d in DEDOS + ("Thumb",) for i in (1, 2, 3)] for lado, _ in LADOS}
    u_barra = estado["R"] @ Vector((1.0, 0.0, 0.0))
    resumo = {}
    for lado, s in LADOS:                          # dedos embaixo da barra (sem entrar no deltoide atrás dela) e polegar do lado deles
        p3.soltar_dedos(rig, lado)
        pg.juntar_dedos(rig, lado)
        p3.atualizar()
        dd = fechar_dedos(bon, lado, B, u_barra, corpo=corpo_sem_mao(bon, lado))
        p3.atualizar()
        pol = None
        if COM_POLEGAR:                            # polegar do lado dos dedos (pegada aberta), a polpa encostando embaixo da barra
            co, _, nomes, dono = _pele(bon)
            polpa = co[_mascara(nomes, dono, lambda n_, L=lado: n_ == L + "HandThumb3")].mean(axis=0)
            d_ = polpa - np.array(B)
            rad = d_ - np.array(u_barra) * (d_ @ np.array(u_barra))
            alvo = np.array(B) + np.array(u_barra) * (d_ @ np.array(u_barra)) + rad / np.linalg.norm(rad) * RAIO_BARRA
            pol = polegar_na_barra(bon, lado, B, u_barra, alvo)
        p3.atualizar()
        posturas[lado] = {nm: PB[p3.P + nm].matrix_basis.copy() for nm in ossos_mao[lado]}
        resumo[lado] = (dd, pol)
        print("DEDOS %s %s" % (lado, " ".join("%s %d/%d° %.1f/%.1fmm" % (k[0], *v) for k, v in dd.items())), flush=True)
        if pol:
            print("POLEGAR %s %s viável %s: polpa × barra %.1f mm, × alvo %.1f mm, pele %.2f×, entra %.1f mm" % (lado, *pol),
                  flush=True)
    B = bracos()
    rack = {lado: {nm: do_tronco(c(lado + nm)) for nm in ("Arm", "ForeArm", "Hand", "HandMiddle1")} for lado, _ in LADOS}

    # ── centro de massa (corpo + barra), analítico: pernas pelas contas, tronco/cabeça/braços/barra rígidos com o tronco ───────────
    def centro_de_massa(canela, joelho, tronco):
        y, z = quadril(canela, joelho)
        O, R = Vector((0.0, y, z)), p3.rot_x(tronco)
        tr = lambda p: O + R @ (Vector(p) - meio0)
        K = joelhos(y, z)
        pts = {"MIDH": O, "CERV": tr(neck0)}
        pts["VERT"] = pts["CERV"] + p3.rot_x(tronco * (1.0 - PESCOCO)) @ (vert0 - neck0)
        soma, massa = Vector(), 0.0
        for a_, b_, m_, f_ in SEGMENTOS:
            soma += (pts[a_] + (pts[b_] - pts[a_]) * f_) * m_
            massa += m_
        for lado, s in LADOS:
            J = {nm: tr(p) for nm, p in rack[lado].items()}
            J["UpLeg"] = Vector((s * meia_quadril, y, z))
            J["Leg"] = K[lado][0]
            J["Foot"] = pes[lado]["A"]
            for a_, b_, m_, f_ in SEGMENTOS_LADO:
                soma += (J[a_] + (J[b_] - J[a_]) * f_) * m_
                massa += m_
            calc = pes[lado]["A"] + pes[lado]["f"] * PEPELE[lado][0]
            ponta = pes[lado]["A"] + pes[lado]["f"] * PEPELE[lado][1]
            soma += (calc + (ponta - calc) * PE[1]) * PE[0]
            massa += PE[0]
        soma += tr(neck0 + rel["barra"]) * CARGA
        massa += CARGA
        cm = soma / massa
        return -(cm.y - A_meio.y), cm

    def canela_do_equilibrio(joelho, tronco, lo=-5.0, hi=45.0):
        """Canela (graus à frente) que deixa o centro de massa COM_ALVO à frente dos tornozelos."""
        for _ in range(30):
            m = (lo + hi) / 2
            if centro_de_massa(m, joelho, tronco)[0] < COM_ALVO:
                lo = m
            else:
                hi = m
        return (lo + hi) / 2

    def coxa(canela, joelho):
        """Inclinação da coxa (graus; + = joelho abaixo do quadril), média dos 2 lados, pelas contas."""
        y, z = quadril(canela, joelho)
        K = joelhos(y, z)
        out = []
        for lado, s in LADOS:
            d = K[lado][0] - Vector((s * meia_quadril, y, z))
            out.append(math.degrees(math.atan2(-d.z, math.hypot(d.x, d.y))))
        return sum(out) / 2

    lo, hi = 90.0, 140.0                 # embaixo: o joelho que deixa a coxa a COXA_BAIXO, com a canela do equilíbrio
    for _ in range(30):
        k = (lo + hi) / 2
        if coxa(canela_do_equilibrio(k, TRONCO[1]), k) > COXA_BAIXO:
            lo = k
        else:
            hi = k
    JOELHO_BAIXO = (lo + hi) / 2
    CANELA_BAIXO = canela_do_equilibrio(JOELHO_BAIXO, TRONCO[1])
    CANELA_CIMA = canela_do_equilibrio(JOELHO_CIMA, TRONCO[0])
    print("FRONTAL em pé: canela %.1f° | embaixo: joelho %.1f° canela %.1f° coxa %.1f°" % (
        CANELA_CIMA, JOELHO_BAIXO, CANELA_BAIXO, coxa(CANELA_BAIXO, JOELHO_BAIXO)), flush=True)
    polo_dos_joelhos(CANELA_BAIXO, JOELHO_BAIXO, TRONCO[1])

    barra = e3.barra("barra", comprimento=2.0, raio_anilha=R_ANILHA, pegada=1.32)
    barra.rotation_mode = "XYZ"
    e3._em_aneis(bpy.data.objects["barra_eixo"])     # só a malha do eixo de 2 m em anéis (a forma não muda): checagem ~10× mais rápida

    def pose(t):
        """t=0 em pé, t=1 embaixo."""
        joelho, tronco = p3.lerp(JOELHO_CIMA, JOELHO_BAIXO, t), p3.lerp(*TRONCO, t)
        canela = canela_do_equilibrio(joelho, tronco)
        corpo(canela, joelho, tronco)
        rel["barra"] = REL0.copy()
        bracos()
        for _ in range(2):                         # a barra pousada nos ombros com os braços deste quadro (os cotovelos sobem)
            estado["pousa"] = pousar_barra()
            bracos()
        B = barra_centro()
        estado["barra_rel"] = (rel["barra"] - REL0) * 1000
        barra.location = B
        barra.rotation_euler = (math.radians(tronco), 0.0, 0.0)
        p3.atualizar()
        estado["com"] = centro_de_massa(canela, joelho, tronco)[0]

    pose.estado = estado
    pose.resumo = resumo

    def info():
        juntas = ck.medir_juntas(rig)
        co, _, nomes, dono = _pele(bon, 1)
        B = Vector(barra.matrix_world.to_translation())
        u = np.array(barra.matrix_world.to_3x3() @ Vector((1, 0, 0)))
        br = estado.get("barra_rel", Vector())
        po = estado.get("pousa", (0, 0, 0))
        eixo = (c("Neck") - c("Hips")).normalized()
        txt = ["canela %.1f° joelho %.1f° tronco %.1f° | centro de massa %+.0f mm à frente do tornozelo | barra × tronco (em relação "
               "a t=0, mm) %+.1f/%+.1f/%+.1f, pescoço/cabeça a %.1f mm" % (
                   estado.get("canela", 0), estado.get("joelho", 0), estado.get("tronco", 0), estado.get("com", 0) * 1000,
                   br.x, br.y, br.z, po[0])]
        for lado, s in LADOS:
            S, E = c(lado + "Arm"), c(lado + "ForeArm")
            ext, dev, tot = punho_anatomico(rig, lado)
            partes = []
            for rot, pred in (("palma", lambda nm, L=lado: nm == L + "Hand"),
                              ("dedos", lambda nm, L=lado: nm.startswith(L + "Hand") and "Thumb" not in nm and nm != L + "Hand"),
                              ("polegar", lambda nm, L=lado: nm.startswith(L + "HandThumb"))):
                partes.append("%s %+.1f" % (rot, sdf_barra(co[_mascara(nomes, dono, pred)], B, u).min() * 1000))
            txt.append("%s: braço %.1f° do eixo do tronco, cotovelo %.0f°, punho extensão(−)/flexão(+) %+.0f° desvio radial(+)/ulnar(−) "
                       "%+.0f° total %.0f° | pele × barra (mm): %s" % (
                           lado[0], math.degrees((E - S).angle(-eixo)), juntas["cotovelo" + ("E" if s > 0 else "D")], ext, dev, tot,
                           " ".join(partes)))
        txt.append(maos.info())
        return " | ".join(txt)

    # a barra é APOIO dos ombros (como a barra do Smith, lote 4): o checagem3d mede as zonas da pele até a malha fechada dela (o sinal
    # sai da barra, não de um pedaço aberto da pele) e o corpo pode afundar nela até afunda_apoio_mm (a pele dos deltoides e da mão
    # encostando); sem pegadas: na pegada aberta a mão não fecha 200° em volta da barra (a ficha mede a mão à parte)
    return Cena(pose, [], pegadas=[], apoio_mm=0.0, foco_luz=(0, 0.0, 1.0),
                camera_video=((3.4, -2.8, 1.2), (0, 0.0, 0.95), 50), info=info, apoios=[barra], afunda_apoio_mm=4.0)
