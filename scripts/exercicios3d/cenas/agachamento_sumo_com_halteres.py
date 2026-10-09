# Agachamento Sumô com Halteres — cena da fábrica 3D (lote 7, 08/10/2026; exercício dos treinos prontos do app).
# t = 0 em pé · t = 1 embaixo (coxas paralelas ao chão). O app faz a volta (subida).
# Técnica (ACE, Antoian 2016, "5 Variations of the Body-weight Squat", Dumbbell Sumo Squat): pés mais afastados que o quadril
# e pontas viradas ~45° pra fora ("Stand with the feet wider than the hips and the toes pointed out to the sides about 45
# degrees"), UM halter seguro pelas 2 mãos com os braços estendidos pro chão ("Hold one dumbbell in both hands and extend the
# arms toward the floor"), desce dobrando os joelhos até as coxas ficarem paralelas ao chão ("until the thighs are parallel to
# the floor"), braços retos e perto do corpo o tempo todo ("Keep the arms straight and close to the body throughout the entire
# movement") e joelho em cima do pé, sem passar da frente dele ("keep the knees in line with the ankles while in the squat
# position and do not let the knee cross in front of the foot"). A foto do ACE mostra o jeito de segurar: o halter EM PÉ,
# pendurado entre as pernas, seguro pela cabeça (anilha) de cima — uma palma de cada lado da cabeça e os dedos por baixo dela
# — e, embaixo, a cabeça de baixo quase no chão. ExRx (Dumbbell Squat): costas retas, peito alto, pés chapados e joelhos na
# direção dos pés ("Knees should point same direction as feet throughout movement"); ExRx (Squat Variations): com a base bem
# larga, como no sumô, o quadril não vai tão pra trás e o tronco fica mais em pé. A dica do app pede tronco ereto, joelhos
# alinhados com os pés e pés bem afastados com as pontas pra fora.
# Montagem: tornozelos parados no chão, a X_TORNOZELO do meio, cada pé girado PONTA graus pra fora em volta da vertical (sola
# chapada). O quadril desce e vai um pouco pra trás; o tronco inclina junto com a pelve (coluna neutra) e a cabeça volta pra
# olhar em frente. Cada joelho entra, suave, no plano vertical do próprio pé (o que passa pelo tornozelo na direção da ponta do
# pé) até t = T_ALINHA e fica nele até embaixo — o "joelho em cima do pé" —; em pé, com a perna quase esticada, ele não alcança
# esse plano e fica o mais pra fora que dá. O halter (equip3d.halter: pegada de 13 cm e 33 mm, cabeças redondas de 16 cm × 7 cm
# com a borda arredondada; ~21 kg de ferro) fica em pé e pendurado entre as pernas. Pegada: cada palma encosta no lado da cabeça
# de cima perto dos nós dos dedos (a mão segue um pouco o antebraço, INCLINA_MAO, e a base da palma fica longe da borda de cima),
# os 4 dedos dobram por baixo da cabeça (indicador e mínimo deitam embaixo dela; médio e anelar, que dão no pegador, dobram em
# volta dele) e o polegar encosta na frente da cabeça (busca do polegar novo, polegar3d). Os dedos de cada mão não passam do plano
# do meio do halter (as 2 mãos podem se encostar, sem se atravessar). Braços quase esticados, à frente do corpo (BRACO_FRENTE) e
# com as escápulas um pouco pra frente (PROTRAI): com menos, a parte de baixo do braço entrava nas costelas.
import math
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

LADOS = (("Left", 1), ("Right", -1))
DEDOS = ("Index", "Middle", "Ring", "Pinky")

# ── base e pernas ──────────────────────────────────────────────────────────────────────────────────────────────────────────
X_TORNOZELO = 0.37         # tornozelo a 37 cm do meio: base de 0,74 m (1,85 × os 0,40 m entre os ombros; Escamilla 2001:
                           # base larga de 169 ± 12% da largura dos ombros; Paoli 2009: até 200% da distância entre os trocânteres)
PONTA = 45.0               # ponta de cada pé virada pra fora (graus; ACE: "about 45 degrees")
INCLINA = (2.0, 20.0)      # tronco à frente da vertical, em pé → embaixo (graus): tronco ereto (dica do app, ExRx)
Y_QUADRIL = (0.0, 0.105)   # articulações do quadril: quanto vão pra trás (m, +Y = trás) em pé → embaixo
JOELHO_CIMA = 6.0          # flexão do joelho em pé (graus): pernas esticadas sem travar
COXA_BAIXO = 1.5           # coxa embaixo, graus abaixo da horizontal: coxas paralelas ao chão
PESCOCO = 0.8              # quanto a cabeça volta (fração da inclinação do tronco): olhar em frente
T_ALINHA = 0.35            # até esse t o joelho entra, suave, no plano do pé (em pé ele não alcança: a perna está quase esticada)

# ── halter e mãos ───────────────────────────────────────────────────────────────────────────────────────────────────────────
PEGADA = 0.13              # pegada entre as cabeças (m): 13 cm, como os halteres sextavados de 25 kg do comércio
RAIO = 0.0165              # raio da pegada (m): 33 mm
R_ANILHA = 0.08            # raio da cabeça (m): 16 cm de diâmetro (com 14 cm, as mãos ficavam mais juntas e os braços mais
                           # fechados — pra parte de baixo do braço não entrar nas costelas, o braço tinha que ir 24° à frente)
L_ANILHA = 0.07            # comprimento da cabeça ao longo do halter (m): a cabeça cabe entre o punho e os nós dos dedos
CHANFRO = 0.003            # borda das cabeças arredondada 3 mm (borracha; e a medida de zona erra o sinal em quina viva)
MEIA_EIXO = (PEGADA + 2 * L_ANILHA + 0.02) / 2    # o eixo de aço passa 1 cm pra fora de cada cabeça (equip3d.halter)
MA = PEGADA / 2 + L_ANILHA / 2                     # centro de cada cabeça a partir do meio do halter
BRACO_FRENTE = (18.0, 12.0)  # ombro → punho à frente da vertical do mundo (graus), em pé → embaixo: o halter passa na frente
                             # da virilha e o braço na frente das costelas (com 13°, a parte de baixo do braço entrava 3–7 mm nas
                             # costelas, a 18–19 cm do ombro); embaixo, com o tronco inclinado, os braços ficam mais em pé
COTOVELO = 8.0             # flexão do cotovelo (graus): braço esticado, sem travar
FRAC_PALMA = 0.90          # ponto da palma que encosta na cabeça: 90% do caminho punho → nós dos dedos (a palma encosta perto
                           # dos nós, logo acima da borda de baixo da cabeça, e os dedos dobram por baixo dela)
APERTO = 0.001             # a pele aperta o halter até isso (m)
APERTO_PALMA = 0.0002      # a palma, com os dedos esticados (quando os dedos dobram, a pele dos nós ainda afunda um pouco)
FUNDO_MAX = 0.0015         # a mão inteira (palma, dedos e polegar) afunda no halter no máximo isso (m); mais que isso, a mão vai
                           # pra fora e os dedos e o polegar fecham de novo
MCP_ABAIXO = 0.009         # nós dos dedos abaixo da face de baixo da cabeça de cima (m): com o dedo dobrado 90° na base, a
                           # pele dele (~9 mm do eixo da junta) fica rente à face de baixo
POLEGAR_ANG = 45.0         # alvo da polpa do polegar na frente da cabeça: graus a partir do lado da mão, pra frente
POLEGAR_Z = 0.010          # altura do alvo do polegar acima do centro da cabeça (m)
POLO_COTOVELO = (0.5, 0.3, 0.0)   # polo do IK do braço a partir do cotovelo (pra fora, pra trás, pra cima; m)
INCLINA_MAO = 12.0         # mão inclinada pro meio do corpo (graus da vertical), seguindo um pouco o antebraço: a palma encosta
                           # na cabeça perto dos nós dos dedos e a base da palma (pele do osso do antebraço, que com a mão reta
                           # encostava na borda de cima da cabeça) fica longe dela
COM_POLEGAR = True         # (sondas) False pula a busca do polegar
PROTRAI = 10.0             # escápulas pra frente (graus em volta do eixo do tronco, osso Shoulder): o ombro vai ~2,4 cm à frente,
                           # como quem segura um peso na frente do corpo com os braços esticados


def dedos_q(s):
    """Pra onde apontam os dedos da mão do lado `s` (+1 esquerda): pra baixo, inclinados INCLINA_MAO graus pro meio."""
    b = math.radians(INCLINA_MAO)
    return Vector((-s * math.sin(b), 0.0, -math.cos(b)))


def palma_q(s):
    """Pra onde a palma olha (⟂ aos dedos): pro halter, no meio do corpo."""
    b = math.radians(INCLINA_MAO)
    return Vector((-s * math.cos(b), 0.0, math.sin(b)))


def sdf_halter(P, M):
    """Distância com sinal (m, − = dentro) dos pontos P (N×3) até o halter (eixo + 2 cabeças com a borda arredondada de
    CHANFRO), pela matriz de mundo M da raiz (eixo do halter = X local)."""
    M = np.asarray(M, float)
    c, w = M[:3, 3], M[:3, 0] / np.linalg.norm(M[:3, 0])
    d = np.asarray(P, float) - c
    a = d @ w
    rho = np.linalg.norm(d - np.outer(a, w), axis=1)

    def cil(a0, meia, R, r=0.0):
        qx, qy = rho - (R - r), np.abs(a - a0) - (meia - r)
        return np.minimum(np.maximum(qx, qy), 0.0) + np.hypot(np.maximum(qx, 0.0), np.maximum(qy, 0.0)) - r

    return np.minimum(np.minimum(cil(0.0, MEIA_EIXO, RAIO), cil(MA, L_ANILHA / 2, R_ANILHA, CHANFRO)),
                      cil(-MA, L_ANILHA / 2, R_ANILHA, CHANFRO))


def _pele(bon, niveis=0):
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, niveis)
    return co, tri, nomes, dono


def _mascara(nomes, dono, pred):
    return np.array([bool(pred(n)) for n in nomes] + [False])[dono]


def joelho_no_plano_do_pe(H, A, f, n, lt, ls, alvo_d=0.0):
    """Joelho da perna quadril H → tornozelo A (coxa lt, canela ls) no círculo de joelhos possíveis, a `alvo_d` m (com sinal, − =
    pra dentro) do plano vertical do pé (passa por A, direção f da ponta do pé, normal n pra fora) — o joelho à frente, em cima
    do pé, das 2 soluções —; quando o círculo não chega lá, o ponto dele mais perto disso. Devolve (joelho, centro do círculo,
    distância ao plano em m). alvo_d = None: o ponto do círculo mais pra fora (o mais perto do plano com a perna quase esticada)."""
    d = (A - H).length
    u = (A - H) / d
    x = (d * d + lt * lt - ls * ls) / (2 * d)
    r = math.sqrt(max(lt * lt - x * x, 0.0))
    C = H + u * x
    e1 = u.cross(Vector((0.0, 0.0, 1.0)))
    if e1.length < 1e-6:
        e1 = u.cross(Vector((0.0, 1.0, 0.0)))
    e1.normalize()
    e2 = u.cross(e1).normalized()
    d0 = n.dot(C - A)
    a1, a2 = n.dot(e1), n.dot(e2)
    m = math.hypot(a1, a2)
    psi0 = math.atan2(a2, a1)                               # o ponto do círculo mais pra fora
    K = lambda ps: C + (e1 * math.cos(ps) + e2 * math.sin(ps)) * r
    q = None if (alvo_d is None or r * m < 1e-9) else (alvo_d - d0) / (r * m)
    if q is not None and abs(q) <= 1.0:
        da = math.acos(q)
        Kj = max([K(psi0 + da), K(psi0 - da)], key=lambda k: (k - A).dot(f))   # o joelho à frente, em cima do pé
    else:
        Kj = K(psi0 if (q is None or q > 1.0) else psi0 + math.pi)
    return Kj, C, n.dot(Kj - A)


def _dentro_de(bvh, P, limite=0.03):
    """Quanto o ponto mais fundo de P entra na malha do bvh (m; 0 = nenhum entra): o mais perto na superfície com a normal
    apontando pra fora dela."""
    fundo = 0.0
    for v in P:
        vv = Vector(v)
        loc, nor, _, dist = bvh.find_nearest(vv)
        if loc is not None and dist < limite and (vv - loc).dot(nor) < 0:
            fundo = max(fundo, dist)
    return fundo


def _bvh_mao(bon, lado):
    """BVH da pele da mão `lado` (palma e dedos, com o polegar) na pose atual."""
    co, tri, nomes, dono = _pele(bon)
    m = _mascara(nomes, dono, lambda nm: nm.startswith(lado + "Hand"))
    t = tri[m[tri].all(axis=1)]
    return BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in t], all_triangles=True)


DIP_PIP = 0.7               # a junta da ponta do dedo (DIP) dobra ~2/3 da do meio (PIP): elas andam juntas
MCP_MAX, PIP_MAX = 90, 100  # amplitude usada na busca dos dedos (graus)


def fechar_dedos(bon, lado, M, outra=None, aperto=APERTO, antes=None, folga_meio=0.001):
    """Cada dedo (indicador ao mínimo), a partir da mão aberta com os dedos juntos, dobra na base (MCP, m graus) e no meio (PIP, p
    graus; a ponta, DIP, segue DIP_PIP × p) — busca em grade de 5° e depois de 1° — pra postura que deixa a pele do dedo inteira o
    mais rente possível do halter (média da folga, até 3 cm) e o mais perto possível da face de baixo da cabeça de cima (média de
    quanto a pele fica abaixo dela, peso 0,5), sem entrar no halter mais que `aperto`, sem passar do plano do meio dele (a outra
    mão vem do outro lado) nem entrar na `outra` mão (BVH): o dedo deita por baixo da cabeça e encosta nela (ou no pegador, o
    médio e o anelar, que ficam na frente dele). Desempate:
    menos dobra e, com `antes` ({dedo: (m, p)} do quadro anterior), perto da postura anterior (o dedo não pula entre quadros).
    Devolve {dedo: (m, p, folga mínima mm, folga média mm)}."""
    rig = bon.rig
    s_lado = 1 if lado == "Left" else -1
    x_meio = float(np.asarray(M)[0, 3])               # plano do meio do halter (o halter fica em pé, no x do meio do corpo)
    z_face = float(np.asarray(M)[2, 3]) + MA - L_ANILHA / 2   # face de baixo da cabeça de cima
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
        ant = (antes or {}).get(d)

        def avaliar(m, p):
            pp = pg._cadeia_pts(pts, cab, ponta, ossos, [eixo_nos] * 3, [m * sinal, p * sinal, DIP_PIP * p * sinal])
            P = np.concatenate([pp[o] for o in ossos])
            return P, sdf_halter(P, M)

        def custo(m, p, P, sd):
            c = (float(np.clip(sd, 0.0, 0.03).mean()) + 0.5 * float(np.clip(z_face - P[:, 2], 0.0, None).mean())
                 + 0.00002 * (m + p))
            if ant is not None:
                c += 0.0004 * (abs(m - ant[0]) + abs(p - ant[1])) / 5.0
            return c

        melhor = None
        grade = [(m, p) for m in range(0, MCP_MAX + 1, 5) for p in range(0, PIP_MAX + 1, 5)]
        for passo, cands in ((5, grade), (1, None)):
            if cands is None:
                if melhor is None:
                    break
                m0, p0 = melhor[1], melhor[2]
                cands = [(m, p) for m in range(max(0, m0 - 4), min(MCP_MAX, m0 + 4) + 1)
                         for p in range(max(0, p0 - 4), min(PIP_MAX, p0 + 4) + 1)]
            for m, p in cands:
                P, sd = avaliar(m, p)
                if float(sd.min()) < -aperto or float((s_lado * (P[:, 0] - x_meio)).min()) < -folga_meio:
                    continue
                cc = custo(m, p, P, sd)
                if melhor is not None and cc >= melhor[0]:
                    continue
                if outra is not None and _dentro_de(outra, P[::3]) > aperto:
                    continue
                melhor = (cc, m, p, float(sd.min()), float(np.clip(sd, 0.0, 0.03).mean()))
        if melhor is None:
            melhor = (0.0, 0, 0, float("nan"), float("nan"))
        _, m, p, mn, md = melhor
        for k, (o, a) in enumerate(zip(ossos, (m, p, DIP_PIP * p))):
            if a:
                p3.girar_osso(rig, o, p3.rot_eixo(a * sinal, eixo_nos))
        out[d] = (m, p, round(mn * 1000, 1), round(md * 1000, 1))
    return out


def polegar_na_cabeca(bon, lado, M, alvo, outra=None, antes=None, aperto=APERTO, base_livre=0.022):
    """Polegar da mão `lado` dando a volta na FRENTE da cabeça de cima do halter, com os 4 dedos já postos. É a busca do polegar
    novo (pg.polegar_em_volta: eixos anatômicos do polegar tirados do rig, pele por LBS, MCP e IP perto da pegada medida de
    Goislard 2012, pele da base sem esticar mais que pg.POLEGAR_ALONGA_MAX nem virar do avesso, continuidade com o quadro
    anterior) com outro alvo e outros obstáculos: a polpa (falange distal) vai pro `alvo` (na superfície da frente da cabeça)
    encostando no halter, e nada do polegar entra no halter, nos dedos/palma da própria mão nem na `outra` mão (BVH). Põe o
    polegar no Blender e devolve (postura, viável, polpa × halter mm, polpa × alvo mm, alongamento, fundo no halter mm)."""
    rig = bon.rig
    ossos = [lado + "HandThumb%d" % i for i in (1, 2, 3)]
    for o in ossos:
        rig.pose.bones[p3.P + o].matrix_basis = Matrix.Identity(4)
    p3.atualizar()
    pele = pg._pele(bon)
    pesos = pele["pesos"]
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 0)
    pos = {nm: i for i, nm in enumerate(nomes)}
    M = np.asarray(M, float)
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
    k_pol = np.array([linha[int(i)] for i in idx if dono[i] in d_pol])
    k_teste = np.array([linha[int(i)] for i in idx if dono[i] in d_pol and not any(
        nm in pesos[int(i)] for nm in (lado + "Hand", lado + "HandIndex1", lado + "ForeArm"))])
    k_ponta = np.array([linha[int(i)] for i in idx if dono[i] == d_pol[2]])
    alvo = np.asarray(alvo, float)
    q_antes = tuple(antes) if antes is not None else None
    P = co.copy()

    def medir(q):
        rots = P3.rotacoes(eixos, q)
        Mc, juntas = P3.cadeia(cab, ponta, rots)
        Ms = [Mc[k] @ M0[k] for k in range(3)]
        Q = P3.lbs(H, W, fixo, Ms)
        halt = max(0.0, -float(sdf_halter(Q[k_pol], M).min()))        # a pele toda do polegar, com a base
        D = Q[k_pol]
        D = D[np.linalg.norm(D - juntas[0], axis=1) > base_livre]
        P[idx] = Q
        alonga = float((np.linalg.norm(P[Eb[:, 0]] - P[Eb[:, 1]], axis=1) / l0).max())
        R = R_fixo.copy()
        for k in range(3):
            R[dono_k == k] = Ms[k][:3, :3]
        vir = P3.viradas(n0, P, Tb, R)
        entra = _dentro_de(bvh, Q[k_teste])
        fora = _dentro_de(outra, D[::2]) if outra is not None else 0.0
        polpa = Q[k_ponta]
        gap = max(0.0, float(sdf_halter(polpa, M).min()))
        d_alvo = float(np.linalg.norm(polpa.mean(axis=0) - alvo))
        return dict(rots=rots, halt=halt, alonga=alonga, viradas=vir, entra=entra, outra=fora, gap=gap, alvo=d_alvo)

    def custo(q):
        m = medir(q)
        viola = (10 * max(0.0, m["halt"] - aperto) + 10 * max(0.0, m["entra"] - pg.POLEGAR_ENTRA) +
                 10 * max(0.0, m["outra"] - aperto) + 0.05 * max(0.0, m["alonga"] - pg.POLEGAR_ALONGA_MAX) +
                 0.003 * m["viradas"])
        return m["gap"] + 0.3 * m["alvo"] + viola + P3.custo_postura(q, antes=q_antes), viola == 0

    if q_antes is not None:
        sementes = [q_antes]
    else:
        grade = [(cf, ca, cr, mf, P3.REF_33MM[4], ipf) for cf in (-30, 0, 30) for ca in (0, 25, 50)
                 for cr in (-30, 0, 30) for mf in (10, 40) for ipf in (10, 50)]
        sementes = [q for _, q in sorted((custo(q)[0], q) for q in grade)[:8]] + [P3.REF_33MM]
    q, J, viavel, n = P3.buscar(custo, sementes, pg.POLEGAR_FAIXAS)
    if not viavel and q_antes is not None:
        return polegar_na_cabeca(bon, lado, M, alvo, outra=outra, antes=None, aperto=aperto, base_livre=base_livre)
    m = medir(q)
    for o, R in zip(ossos, m["rots"]):     # sem postura viável, fica a de menor custo (perto da anterior), não a de repouso
        if not np.allclose(R, np.eye(3)):
            p3.girar_osso(rig, o, Matrix(R.tolist()))
    return (tuple(round(float(x), 1) for x in q), bool(viavel), round(m["gap"] * 1000, 1), round(m["alvo"] * 1000, 1),
            round(m["alonga"], 2), round(m["halt"] * 1000, 1))


def montar(bon):
    pg.usar_polegar("volta")
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda nome: p3.cabeca(rig, nome)
    lt = (c("LeftLeg") - c("LeftUpLeg")).length
    ls = (c("LeftFoot") - c("LeftLeg")).length
    meio0 = (c("LeftUpLeg") + c("RightUpLeg")) / 2              # meio das articulações do quadril no repouso
    meia_quadril = (c("LeftUpLeg") - c("RightUpLeg")).length / 2
    tz0 = c("LeftFoot")                                         # tornozelo no repouso (altura e y)

    # ── pés: tornozelos no lugar, sola chapada e ponta virada PONTA graus pra fora (em volta da vertical) ─────────────────
    pes, pernas, polos, tornozelos = {}, {}, {}, {}
    for lado, s in LADOS:
        th = math.radians(PONTA)
        f = Vector((s * math.sin(th), -math.cos(th), 0.0))
        n = Vector((s * math.cos(th), math.sin(th), 0.0))
        A = Vector((s * X_TORNOZELO, tz0.y, tz0.z))
        pes[lado] = dict(A=A, f=f, n=n)
        tornozelos[lado] = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))   # nasce no tornozelo (alvo ≠ polo)
        polos[lado] = p3.vazio("polo_joelho_" + lado, (s * 0.6, -1.0, 0.5))
        pernas[lado] = p3.ik(rig, lado + "Leg", tornozelos[lado], polos[lado])
        b = rig.data.bones[p3.P + lado + "Foot"]
        rot = p3.vazio("rot_" + lado + "Foot")
        rot.matrix_world = Matrix.Rotation(s * th, 4, "Z") @ (rig.matrix_world @ b.matrix_local)
        cn = PB[p3.P + lado + "Foot"].constraints.new("COPY_ROTATION")
        cn.target = rot
        tornozelos[lado].location = A
    p3.atualizar()

    def quadris(y, z):
        """Articulações do quadril (E, D) com o meio delas em (0, y, z): a pelve gira em volta da reta que passa por elas."""
        meio = Vector((0.0, y, z))
        return {lado: meio + Vector((s * meia_quadril, 0.0, 0.0)) for lado, s in LADOS}

    alinha = {"topo": None}

    def joelhos(y, z, t):
        """Joelhos com o quadril em (y, z) no instante t: em pé, o mais pra fora que dá (a perna quase esticada não alcança o
        plano do pé); daí entram suave no plano do pé até t = T_ALINHA e ficam nele (joelho em cima do pé)."""
        Hs = quadris(y, z)
        if alinha["topo"] is None:
            alvo = {lado: None for lado, _ in LADOS}
        else:
            k = min(1.0, t / T_ALINHA)
            alvo = {lado: alinha["topo"][lado] * (1.0 - k * k * (3 - 2 * k)) for lado, _ in LADOS}
        return {lado: joelho_no_plano_do_pe(Hs[lado], pes[lado]["A"], pes[lado]["f"], pes[lado]["n"], lt, ls, alvo[lado])
                for lado, _ in LADOS}, Hs

    def flexao_joelho(y, z, t):
        K, Hs = joelhos(y, z, t)
        k, H, A = K["Left"][0], Hs["Left"], pes["Left"]["A"]
        return math.degrees((k - H).angle(A - k))

    def coxa_inclinacao(y, z, t):
        K, Hs = joelhos(y, z, t)
        d = K["Left"][0] - Hs["Left"]
        return math.degrees(math.atan2(-d.z, math.hypot(d.x, d.y)))

    def bissecao(f, lo, hi, alvo, voltas=50):
        flo = f(lo) - alvo
        for _ in range(voltas):
            m = (lo + hi) / 2
            fm = f(m) - alvo
            if (fm > 0) == (flo > 0):
                lo, flo = m, fm
            else:
                hi = m
        return (lo + hi) / 2

    y_cima, y_baixo = meio0.y + Y_QUADRIL[0], meio0.y + Y_QUADRIL[1]
    z_cima = bissecao(lambda z: flexao_joelho(y_cima, z, 0.0), 0.70, 0.95, JOELHO_CIMA)
    alinha["topo"] = {lado: joelhos(y_cima, z_cima, 0.0)[0][lado][2] for lado, _ in LADOS}   # em pé: o mais pra fora que dá
    z_baixo = bissecao(lambda z: coxa_inclinacao(y_baixo, z, 1.0), 0.30, 0.70, COXA_BAIXO)
    print("SUMO quadril (meio) z %.3f → %.3f, y %.3f → %.3f | coxa %.1f° | joelho em cima %.1f° | joelho em pé a %.0f mm "
          "do plano do pé" % (z_cima, z_baixo, y_cima, y_baixo, coxa_inclinacao(y_baixo, z_baixo, 1.0),
                              flexao_joelho(y_cima, z_cima, 0.0), alinha["topo"]["Left"] * 1000), flush=True)

    estado = {}

    def corpo(t):
        """Pelve e tronco (giram juntos: coluna neutra), joelhos no plano do pé e a cabeça olhando em frente."""
        for nome in ("Hips", "Neck", "Head", "LeftShoulder", "RightShoulder"):
            PB[p3.P + nome].matrix_basis = Matrix()
        p3.atualizar()
        y, z = p3.lerp(y_cima, y_baixo, t), p3.lerp(z_cima, z_baixo, t)
        inc = p3.lerp(*INCLINA, t)
        p3.girar_osso(rig, "Hips", p3.rot_x(inc), pivo=meio0, mover=Vector((0.0, y - meio0.y, z - meio0.z)))
        K, Hs = joelhos(y, z, t)
        estado["K"], estado["H"] = K, Hs
        for lado, _ in LADOS:
            Kj, C, _ = K[lado]
            v = Kj - C
            polos[lado].location = Kj + (v.normalized() if v.length > 1e-6 else pes[lado]["f"]) * 0.6
        p3.atualizar()
        p3.girar_osso(rig, "Neck", p3.rot_x(-inc * PESCOCO))
        if PROTRAI:                                 # escápulas um pouco pra frente (braços pendurados na frente do corpo)
            cima = (c("Neck") - c("Hips")).normalized()
            for lado, s in LADOS:
                p3.girar_osso(rig, lado + "Shoulder", Matrix.Rotation(math.radians(-s * PROTRAI), 3, cima))
        estado["inc"] = inc

    # polo certo dos joelhos (o pole_angle do IK: o joelho no plano quadril–tornozelo–polo, do lado do polo), em 0,5°
    corpo(1.0)
    for lado, _ in LADOS:
        e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
        melhor = (1e9, None)
        for k in range(-10, 11):
            ang = e[1] + k * 0.5
            pernas[lado].pole_angle = math.radians(ang)
            p3.atualizar()
            erro = (c(lado + "Leg") - estado["K"][lado][0]).length
            melhor = min(melhor, (erro, ang))
        pernas[lado].pole_angle = math.radians(melhor[1])
        p3.atualizar()
        print("polo joelho %s %.1f° | joelho a %.1f mm do alvo" % (lado, melhor[1], melhor[0] * 1000), flush=True)

    # ── halter ───────────────────────────────────────────────────────────────────────────────────────────────────────────
    halter = e3.halter("halter", pegada=PEGADA, raio=RAIO, raio_anilha=R_ANILHA, larg_anilha=L_ANILHA, chanfro=CHANFRO)
    halter.rotation_mode = "QUATERNION"
    halter.rotation_quaternion = Vector((1.0, 0.0, 0.0)).rotation_difference(Vector((0.0, 0.0, 1.0)))   # em pé
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")

    # ponto da palma que encosta na cabeça do halter (mão aberta, dedos juntos), guardado no espaço do osso da mão
    for lado, _ in LADOS:
        p3.soltar_dedos(rig, lado)
        pg.juntar_dedos(rig, lado)
        palma, eixo_nos, dir_mao, nos, larg = pg._base(rig, lado)
        co, _, nomes, dono = _pele(bon)
        m = _mascara(nomes, dono, lambda nm: nm == lado + "Hand")
        O = c(lado + "Hand")
        base = O + (nos - O) * FRAC_PALMA
        V = co[m] - np.array(base)
        lateral = np.abs(V @ np.array(eixo_nos))
        perto = V[(lateral < 0.012) & (np.abs(V @ np.array(dir_mao)) < 0.012)]
        h = float((perto @ np.array(palma)).max())
        g = base + palma * h
        maos.furo[lado] = p3.mundo_osso(rig, lado + "Hand").inverted() @ g
        print("PALMA %s: pele a %.1f mm do eixo da mão | ponto (local) %s" % (
            lado, h * 1000, tuple(round(x, 4) for x in maos.furo[lado])))

    # punho e nós dos dedos em relação ao ponto da palma, com a mão na pegada (dedos pra baixo, palma pro halter), e quanto o
    # ponto da palma fica pra fora da cabeça pra nenhuma parte da palma entrar nela mais que APERTO (a palma não é plana)
    off, recuo = {}, {}
    for lado, s in LADOS:
        g0 = Vector((s * 0.2, -0.3, 0.9))
        maos.segurar(lado, g0, dedos_q(s), palma_q(s), polo=g0 + Vector((s * 0.3, 0.5, 0.4)))
        p3.soltar_dedos(rig, lado)
        pg.juntar_dedos(rig, lado)
        nos = pg._base(rig, lado)[3]
        off[lado] = dict(punho=c(lado + "Hand") - g0, nos=nos - g0)
        zc_rel = off[lado]["nos"].z + MCP_ABAIXO + L_ANILHA / 2
        co, _, nomes, dono = _pele(bon)
        P = co[_mascara(nomes, dono, lambda nm: nm == lado + "Hand")]

        def fundo(dx):
            cab = g0 + Vector((-s * (R_ANILHA + dx), 0.0, zc_rel))
            Mv = Matrix.Translation(cab - Vector((0.0, 0.0, MA))) @ halter.rotation_quaternion.to_matrix().to_4x4()
            return float(sdf_halter(P, Mv).min())

        recuo[lado] = bissecao(fundo, -0.01, 0.03, -APERTO)
        print("REF %s punho − palma %s | nós − palma %s | erro %.1f mm | palma %.1f mm pra fora da cabeça" % (
            lado, tuple(round(x, 4) for x in off[lado]["punho"]), tuple(round(x, 4) for x in off[lado]["nos"]),
            maos.erro[lado] * 1000, recuo[lado] * 1000), flush=True)

    Lb = (c("LeftForeArm") - c("LeftArm")).length
    La = (c("LeftHand") - c("LeftForeArm")).length

    def lugar_do_halter(t):
        """Centro da cabeça de cima: o ponto da palma de cada mão encosta no lado dela (pra fora, ±X), na altura em que os nós
        dos dedos ficam MCP_ABAIXO abaixo da face de baixo; o braço esquerdo vai do ombro ao punho com o cotovelo a COTOVELO
        graus e BRACO_FRENTE graus à frente da vertical."""
        S = c("LeftArm")
        alfa = math.radians(p3.lerp(*BRACO_FRENTE, t))
        D = math.sqrt(Lb * Lb + La * La + 2 * Lb * La * math.cos(math.radians(COTOVELO)))
        dz_nos = off["Left"]["nos"].z                      # nós dos dedos abaixo do ponto da palma
        zc_rel = dz_nos + MCP_ABAIXO + L_ANILHA / 2        # centro da cabeça − ponto da palma (z)
        xw = R_ANILHA + recuo["Left"] + off["Left"]["punho"].x   # x do punho (palma encostada no lado da cabeça)
        dx = xw - S.x
        dy = -D * math.sin(alfa)
        dz = -math.sqrt(max(D * D - dx * dx - dy * dy, 1e-9))
        W = S + Vector((dx, dy, dz))
        g = W - off["Left"]["punho"]                       # ponto da palma
        return Vector((0.0, g.y, g.z + zc_rel)), g

    # polo certo dos cotovelos (o pole_angle do IK do braço: o cotovelo dobra pro lado do polo) no meio do movimento
    corpo(0.5)
    cab, _ = lugar_do_halter(0.5)
    for lado, s in LADOS:
        zc_rel = off["Left"]["nos"].z + MCP_ABAIXO + L_ANILHA / 2
        g = cab + Vector((s * (R_ANILHA + recuo[lado]), 0.0, -zc_rel))
        pc = POLO_COTOVELO
        maos.segurar(lado, g, dedos_q(s), palma_q(s),
                     polo=c(lado + "ForeArm") + Vector((s * pc[0], pc[1], pc[2])))
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        maos.iks[lado].mute = True
        print("polo cotovelo %s erro %.3f ang %d" % (lado, *e), flush=True)

    def maos_no_halter(cab, M, extra):
        """Cada mão com o ponto da palma encostado no lado da cabeça de cima (mais extra[lado] pra fora), dedos esticados e juntos;
        a palma (com os dedos esticados) não entra na cabeça mais que APERTO_PALMA (a pele muda com o punho)."""
        for lado, s in LADOS:
            zc_rel = off["Left"]["nos"].z + MCP_ABAIXO + L_ANILHA / 2
            g = cab + Vector((s * (R_ANILHA + recuo[lado] + extra[lado]), 0.0, -zc_rel))
            E = c(lado + "ForeArm")
            pc = POLO_COTOVELO
            for _ in range(3):
                maos.segurar(lado, g, dedos_q(s), palma_q(s), polo=E + Vector((s * pc[0], pc[1], pc[2])))
                p3.soltar_dedos(rig, lado)
                pg.juntar_dedos(rig, lado)
                co, _, nomes, dono = _pele(bon)
                sd = float(sdf_halter(co[_mascara(nomes, dono, lambda nm, L=lado: nm == L + "Hand")], M).min())
                if sd >= -APERTO_PALMA - 1e-4:
                    break
                g = g + Vector((s * (-sd - APERTO_PALMA * 0.5), 0.0, 0.0))
        p3.atualizar()

    def pose(t):
        """t=0 em pé, t=1 embaixo (coxas paralelas)."""
        corpo(t)
        cab, _ = lugar_do_halter(t)
        halter.location = cab - Vector((0.0, 0.0, MA))
        p3.atualizar()
        M = np.array(halter.matrix_world)
        estado["M"] = M
        extra = {"Left": 0.0, "Right": 0.0}            # quanto cada mão vai pra fora (m) se a pele entrar no halter
        for volta in range(4):
            maos_no_halter(cab, M, extra)
            ant = estado.get("dedos", {}) if t > 0 else {}
            dd = {}
            dd["Left"] = fechar_dedos(bon, "Left", M, antes={k: v[:2] for k, v in ant.get("Left", {}).items()})
            dd["Right"] = fechar_dedos(bon, "Right", M, outra=_bvh_mao(bon, "Left"),
                                       antes={k: v[:2] for k, v in ant.get("Right", {}).items()})
            estado["dedos"] = dd
            p3.atualizar()
            pol = estado.setdefault("polegar", {})
            for lado, s in (LADOS if COM_POLEGAR else ()):  # polegar na frente da cabeça (a outra mão já com os dedos postos)
                ph = math.radians(POLEGAR_ANG)
                alvo = cab + Vector((s * R_ANILHA * math.cos(ph), -R_ANILHA * math.sin(ph), POLEGAR_Z))
                antes = pol[lado][0] if (t > 0 and lado in pol and pol[lado][1]) else None
                pol[lado] = polegar_na_cabeca(bon, lado, M, alvo, outra=_bvh_mao(bon, "Right" if s > 0 else "Left"),
                                              antes=antes)
            p3.atualizar()
            co, _, nomes, dono = _pele(bon)                 # a mão inteira (palma, dedos e polegar) não afunda além de FUNDO_MAX
            mexeu = False
            for lado, _ in LADOS:
                sd = float(sdf_halter(co[_mascara(nomes, dono, lambda nm, L=lado: nm.startswith(L + "Hand") and (
                    COM_POLEGAR or "Thumb" not in nm))], M).min())
                if sd < -FUNDO_MAX:
                    extra[lado] += -sd - FUNDO_MAX + 0.0003
                    mexeu = True
            if not mexeu:
                break
        estado["voltas"] = volta + 1
        estado["extra"] = dict(extra)
        # trava (a checagem de zona erra o sinal perto da abertura da malha da mão, no punho): a medida exata da pele (nível 0)
        # contra o halter — nada da mão afunda mais que FUNDO_MAX; palma, dedos e polegar de cada mão encostam (até 3 mm)
        co, _, nomes, dono = _pele(bon)
        for lado, _ in LADOS:
            for rot, pred in (("palma", lambda nm, L=lado: nm == L + "Hand"),
                              ("dedos", lambda nm, L=lado: nm.startswith(L + "Hand") and "Thumb" not in nm and nm != L + "Hand"),
                              ("polegar", lambda nm, L=lado: nm.startswith(L + "HandThumb"))):
                if rot == "polegar" and not COM_POLEGAR:
                    continue
                sd = float(sdf_halter(co[_mascara(nomes, dono, pred)], M).min())
                if sd < -FUNDO_MAX - 0.0005 or sd > 0.003:
                    raise RuntimeError("TRAVA t=%.3f: %s %s × halter %.1f mm (esperado %.1f a 3)" % (
                        t, rot, lado, sd * 1000, -(FUNDO_MAX + 0.0005) * 1000))

    def info():
        juntas = ck.medir_juntas(rig)
        co, _, nomes, dono = _pele(bon, 1)
        M = estado.get("M")
        txt = []
        for lado, s in LADOS:
            A, f, n = pes[lado]["A"], pes[lado]["f"], pes[lado]["n"]
            K = c(lado + "Leg")
            txt.append("joelho %s: %+.0f mm do plano do pé, %+.0f mm à frente do tornozelo" % (
                lado[0], n.dot(K - A) * 1000, f.dot(K - A) * 1000))
        if M is not None:
            low = float(M[2, 3]) - MEIA_EIXO
            partes = []
            for lado, _ in LADOS:
                for rot, pred in (("palma", lambda nm, L=lado: nm == L + "Hand"),
                                  ("dedos", lambda nm, L=lado: nm.startswith(L + "Hand") and "Thumb" not in nm and nm != L + "Hand"),
                                  ("polegar", lambda nm, L=lado: nm.startswith(L + "HandThumb"))):
                    sd = sdf_halter(co[_mascara(nomes, dono, pred)], M)
                    partes.append("%s %+.1f" % (rot, sd.min() * 1000))
            fundo = float(M[2, 3]) + MA - L_ANILHA / 2
            nos = (c("LeftHandIndex1") + c("LeftHandPinky1")) / 2
            v = nos - Vector(M[:3, 3])
            ex = estado.get("extra", {})
            txt.append("halter: ponta de baixo a %.0f mm do chão | pele × halter (mm, − = entra) E %s D %s | nós E a %.0f mm do eixo, "
                       "%.0f mm abaixo da cabeça | mão pra fora E %.1f D %.1f mm (%d voltas)" % (
                           low * 1000, " ".join(partes[:3]), " ".join(partes[3:]), math.hypot(v.x, v.y) * 1000,
                           (fundo - nos.z) * 1000, ex.get("Left", 0) * 1000, ex.get("Right", 0) * 1000, estado.get("voltas", 0)))
            for lado, _ in LADOS:
                dd = estado.get("dedos", {}).get(lado, {})
                txt.append("dedos %s %s" % (lado[0], " ".join("%s %d/%d° %.1f/%.1fmm" % (k[0], *v) for k, v in dd.items())))
                pp = estado.get("polegar", {}).get(lado)
                if pp:
                    txt.append("polegar %s %s viável %s: polpa × halter %.1f mm, × alvo %.1f mm, pele %.2f×, entra %.1f mm" % (
                        lado[0], pp[0], pp[1], pp[2], pp[3], pp[4], pp[5]))
        txt.append("tronco %.1f° | joelho %.0f/%.0f° | quadril %.0f/%.0f° | cotovelo %.0f/%.0f° | %s" % (
            estado.get("inc", 0), juntas["joelhoE"], juntas["joelhoD"], juntas["quadrilE"], juntas["quadrilD"],
            juntas["cotoveloE"], juntas["cotoveloD"], maos.info()))
        return " | ".join(txt)

    return Cena(pose, [halter], pegadas=[], apoio_mm=0.0, foco_luz=(0, 0, 0.75),
                camera_video=((3.2, -3.2, 1.1), (0, 0.0, 0.72), 50), info=info)
