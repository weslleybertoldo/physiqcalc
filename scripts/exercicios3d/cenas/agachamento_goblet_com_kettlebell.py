# Agachamento Goblet com Kettlebell — cena da fábrica 3D (lote 13, 11/10/2026; 0 usos nos treinos prontos do app, 22 vezes como troca
# equivalente). t = 0 em pé · t = 1 embaixo (o fundo que o boneco deixa). O app faz a volta (subida).
# Técnica (as frases das fontes estão na ficha):
#   free-exercise-db, Goblet Squat (o fonte_en do catálogo): em pé com o kettlebell seguro pelos "horns" (as laterais da alça) junto do
#     peito ("Stand holding a light kettlebell by the horns close to your chest"); desce entre as pernas com o peito e a cabeça altos e
#     as costas retas ("Squat down between your legs until your hamstrings are on your calves. Keep your chest and head up and your back
#     straight."); embaixo os cotovelos empurram os joelhos pra fora ("use your elbows to push your knees out").
#   Dan John (o criador do exercício, Intervention, pp. 135-138): o peso encostado no peito, pelos horns ("hold it against your chest.
#     With a kettlebell, hold at the horns"); cotovelos pra baixo e passando por dentro dos joelhos ("Your elbows are pointed down";
#     "let the elbows glide down by touching the inner knees"); pés chapados, pontas um pouco pra fora, sem abrir demais ("some toe-out";
#     "You don't want to go east and west here").
#   ExRx, Kettlebell Goblet Squat: base na largura dos ombros ou um pouco mais ("shoulder width or wider stance"), o quadril vai pra trás e
#     os joelhos pra frente, na direção dos pés ("bending hips back while allowing knees to bend forward ... knees pointed same direction
#     as feet"), até as coxas passarem da paralela ("just past parallel"), costas retas, peito alto, pés chapados e o peso entre o
#     calcanhar e a planta. ACE (com halter): cotovelos junto das costelas ("Keep the elbows close to the rib cage") e o quadril abaixo
#     dos joelhos ("until the hips are below the knees"). NASM: a carga na frente pede o tronco em pé ("The anterior load in goblet squats
#     requires upright torso positioning to maintain balance and control").
# PROFUNDIDADE: o fundo que o boneco deixa, com o joelho a JOELHO_BAIXO (teto do lib/limites.py: 145°) e o quadril (coxa × tronco, com a
# coluna neutra) a QUADRIL_BAIXO (teto: 130°): o quadril bem abaixo dos joelhos (ACE) e as coxas bem além da paralela (ExRx: o mínimo é
# "just past parallel"). O "hamstrings on calves" do free-exercise-db pede mais dobra no quadril do que a coluna reta deixa (ExRx, Squat
# Analysis: "possibly requiring spinal flexion once maximal hip range of motion is achieved"); e o quadril fica abaixo do teto porque, com
# os cotovelos pra baixo junto do corpo, a raiz da coxa sobe até eles (com 127° o cotovelo entrava ~15 mm na coxa; com QUADRIL_BAIXO e
# os cotovelos abrindo um pouco no fim, eles só encostam por cima da parte de dentro dela — "let the elbows glide down by touching the
# inner knees", Dan John).
# Montagem das pernas e do tronco: a do Agachamento Frontal com Barra (lote 8) — tornozelos parados no chão a ±X_TORNOZELO, pés girados
# PONTA graus pra fora (sola chapada), cada joelho no plano vertical do próprio pé (saindo até JOELHO_FORA_BAIXO pra fora dele no fundo:
# os cotovelos empurram os joelhos pra fora, free-exercise-db e Dan John), a pelve e o tronco girando juntos em volta das articulações
# do quadril (coluna neutra) e a cabeça voltando PESCOCO da inclinação (olhar à frente). Joelho e tronco andam juntos (t: o tronco
# embaixo sai do QUADRIL_BAIXO) e a canela sai de uma busca em cada quadro que deixa o centro de massa do corpo + kettlebell (frações
# de massa de de Leva 1996; os 16 kg na frente do peito) COM_ALVO à frente do tornozelo — o peso entre o calcanhar e a planta (ExRx).
# O KETTLEBELL (equip3d.kettlebell: o de ferro fundido de 16 kg) é rígido com o TRONCO (como a barra do Agachamento Frontal), encostado
# no peito (o corpo dele a FOLGA_PEITO da pele), com o alto da alça logo abaixo do queixo (TOPO_QUEIXO) e inclinado BETA graus com o
# alto pro peito — sem isso, com a lateral em pé, os cotovelos pra baixo e o nó dos dedos ao longo da lateral, o punho desviava 30–40°
# pro lado do mínimo. As mãos ficam nas laterais (os horns), cada uma POR FORA da sua lateral com a palma pro meio e os dedos dando a
# volta pela frente dela (as fotos do free-exercise-db e do Dan John), a mão girada PHI graus em volta da lateral e DELTA acima do meio
# do trecho reto (o mínimo dá a volta acima da bola, o indicador logo abaixo do canto). Os dedos fecham contra a lateral sem entrar no
# kettlebell DE VERDADE (kb.sdf: a bola e o canto da alça), o polegar dá a volta por trás da lateral logo acima do indicador (a busca do
# polegar novo, com o ferro de verdade como obstáculo); dedos e polegar saem da busca no montar() e ficam na mesma postura (em relação
# à mão) em todos os quadros. O cotovelo fica no círculo possível (ombro, punho) o mais perto da direção COTOVELO — braço pendurado, um
# pouco pra frente: cotovelos pra baixo, junto das costelas — e desliza até COTOVELO_BAIXO no fundo (abre um pouco por cima da coxa);
# a cintura escapular sobe ELEVA (ExRx, estático: "Scapula & Clavicle Elevation").
import math
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from maos3d import Maos
from cena import Cena
from levantamento_terra import joelho_no_plano_do_pe

LADOS = (("Left", 1), ("Right", -1))
DEDOS = ("Index", "Middle", "Ring", "Pinky")

# ── kettlebell ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
M_KB = 16.0                # kg: o kettlebell de 16 kg (o "light kettlebell" do free-exercise-db; o das fotos)
DIAM_ALCA_MM = 33          # alça de 33 mm (Titan, Kettlebell Kings): a mão de referência é a de um cilindro de 33 mm
BETA = 25.0                # kettlebell inclinado com o alto pro peito (graus, no referencial do tronco): o punho fica na amplitude
                           # normal com os cotovelos pra baixo (sonda exp/sonda_braco.py, em pé: 0° → desvio ulnar 29–39°; 25° → 16–23°)
TOPO_QUEIXO = 0.025        # o ponto mais alto da alça fica isso abaixo do queixo (m; a pele mais baixa da cabeça na frente): "topo da
                           # alça logo abaixo do queixo" (fotos); mais alto, o cotovelo dobrava 145° e o antebraço entrava no braço
FOLGA_PEITO = 0.006        # corpo do kettlebell × pele do peito (m): encostado, sem entrar ("hold it against your chest", Dan John)
DELTA = 0.020              # o vão da mão sobe isso ao longo da lateral, a partir do meio do trecho reto (m): com menos, o mínimo bate
                           # na bola e fica esticado
PHI = 45.0                 # mão girada em volta da lateral (graus): 0 = dedos pra frente, 90 = pro meio (dedos dando a volta pela
                           # frente da lateral, com o dorso da mão virado pra frente e pra fora, como nas fotos)
COTOVELO = (20.0, 5.0)     # direção preferida do braço (ombro → cotovelo), graus a partir do pendurado: pra frente, pro lado
COTOVELO_BAIXO = (20.0, 23.0)   # a mesma direção embaixo (t = 1): entre os 2, o cotovelo desliza junto com a descida — abre um pouco
                                # pro lado e encosta por cima da parte de dentro da coxa (com 18° entrava ~3 mm; com 25°, 9–12 mm de folga)
APERTO = 0.0012            # a pele aperta o ferro até isso (m)
CORPO_ENTRA = 0.0015       # dedos encostando no corpo: a pele pode afundar até isso, entrar não
DIP_PIP = 0.7              # a junta da ponta do dedo (DIP) dobra 0,7 da do meio (PIP)
POR_DEDO = False           # (sondas) True mede cada dedo × kettlebell no info()
VINCO_JOELHO = 0.10        # (m) coxa × panturrilha medida só a mais disso do centro do joelho (perto dele é o vinco da dobra)
SONDA_JOELHOS = ()         # (sondas) joelhos (graus) pra medir coxa × panturrilha no montar()
DEBUG_POLEGAR = False      # (sondas) True imprime as posturas da grade do polegar mais perto do alvo
POLEGAR_ALVO = "alca"      # "alca": a polpa do polegar na lateral, do lado oposto à palma, logo acima do indicador; "dedos": por cima
                           # das falanges médias do indicador e do médio (o alvo do pegada3d)
POLEGAR_ACIMA = 0.012      # (m) quanto o alvo do polegar fica acima do indicador, ao longo da lateral
ELEVA = 6.0                # cintura escapular subindo (graus, osso Shoulder): ExRx, Kettlebell Goblet Squat, estático: "Scapula &
                           # Clavicle Elevation"
PROTRAI = 0.0              # cintura escapular pra frente (graus, osso Shoulder em volta do eixo do tronco)
ELEVA_BAIXO, PROTRAI_BAIXO = ELEVA, PROTRAI    # o mesmo embaixo (vão mudando com a descida)
DENSIDADE = 1000.0         # kg/m³: o volume da malha do boneco × isso = a massa do corpo (~74 kg; a conta do Agachamento Sumô com Barra)

# ── base ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
X_TORNOZELO = 0.25         # tornozelos a 50 cm um do outro: 1,25 × os 0,40 m entre os ombros ("shoulder width or wider stance", ExRx)
PONTA = 25.0               # ponta do pé pra fora (graus): "some toe-out" (Dan John); NSCA (agachamento): "neutral to 30°"
JOELHO_FORA = 0.005        # centro do joelho 5 mm pra fora do plano vertical do pé ("knees pointed same direction as feet", ExRx)
JOELHO_FORA_BAIXO = 0.020  # o mesmo embaixo (o joelho vai saindo com o quadrado da descida): os cotovelos empurram os joelhos pra fora

# ── movimento (graus) ───────────────────────────────────────────────────────────────────────────────────────────────────────────
JOELHO_CIMA = 5.0          # flexão do joelho em pé (sem travar)
TRONCO_CIMA = 2.0          # tronco à frente da vertical em pé
JOELHO_BAIXO = 135.0       # flexão do joelho embaixo (limites.py: até 145°)
QUADRIL_BAIXO = 120.0      # coxa × tronco embaixo (limites.py: até 130°): o tronco embaixo sai daí, com a canela do equilíbrio (~18°);
                           # mais que isso a raiz da coxa sobe até os cotovelos
PESCOCO = 0.9              # a cabeça volta essa fração da inclinação do tronco: olhar à frente ("Keep your chest and head up")
COM_ALVO = 0.030           # centro de massa (corpo + kettlebell) à frente dos tornozelos (m): entre o calcanhar e a base dos dedos
                           # — "equal distribution of weight through forefoot and heel" (ExRx)

# ── centro de massa: frações de massa e centro de cada segmento (de Leva 1996, J Biomech 29:1223, tabela 4, homens) ──────────────
SEGMENTOS = (("VERT", "CERV", 0.0694, 0.5002),      # cabeça: topo da cabeça → C7 (base do pescoço)
             ("CERV", "MIDH", 0.4346, 0.5138))      # tronco: C7 → meio das articulações do quadril
SEGMENTOS_LADO = (("Arm", "ForeArm", 0.0271, 0.5772), ("ForeArm", "Hand", 0.0162, 0.4574), ("Hand", "HandMiddle1", 0.0061, 0.7900),
                  ("UpLeg", "Leg", 0.1416, 0.4095), ("Leg", "Foot", 0.0433, 0.4395))
PE = (0.0137, 0.4415)      # pé: calcanhar → ponta dos dedos


def _pele(bon, niveis=0):
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, niveis)
    return co, tri, nomes, dono


def _mascara(nomes, dono, pred):
    return np.array([bool(pred(n)) for n in nomes] + [False])[dono]


def _bvh(co, tri):
    return BVHTree.FromPolygons([tuple(p) for p in co], [tuple(t) for t in tri], all_triangles=True)


def _perto(bvh, P, limite=0.04):
    """Menor distância com sinal (m; − = dentro) dos pontos P até a malha fechada do bvh."""
    m = 1e9
    for v in P:
        vv = Vector(v)
        loc, nor, _, d = bvh.find_nearest(vv)
        if loc is None:
            continue
        m = min(m, -d if (d < limite and (vv - loc).dot(nor) < 0) else d)
    return m


def malha_do_kb(kb):
    """Vértices e triângulos (mundo) do corpo e da alça do kettlebell, juntos numa malha só (as 2 são fechadas)."""
    (c1, t1), (c2, t2) = ck._avaliar_simples(kb.corpo), ck._avaliar_simples(kb.alca)
    return np.concatenate([c1, c2]), np.concatenate([t1, t2 + len(c1)])


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
    return _bvh(co, tri[~da_mao[tri].any(axis=1)])


def fechar_dedos(bon, lado, sdf, c, u, raio, aperto=APERTO, corpo=None):
    """Cada dedo (indicador ao mínimo), a partir dos dedos esticados e juntos, dobra na base (MCP, m graus) e no meio (PIP, p; a ponta,
    DIP, segue DIP_PIP × p) — grade de 5° e depois de 1° — pra postura que deixa a pele do dedo inteira o mais rente possível da
    LATERAL (o cilindro de raio `raio` em volta do eixo c, u; média da folga até 3 cm), sem entrar no kettlebell DE VERDADE (sdf = kb.sdf:
    a lateral, o canto da alça e a bola) mais que `aperto` nem no corpo (BVH `corpo`) mais que CORPO_ENTRA: o dedo dá a volta na lateral
    e, se a bola ou o canto da alça estiverem no caminho, para encostando neles. É a conta do Agachamento Frontal (lote 8), com o
    kettlebell no lugar da barra. Desempate: menos dobra. Devolve {dedo: (m, p, folga mínima mm, folga média mm)} (as folgas, até o
    kettlebell de verdade)."""
    c, u = np.asarray(c, float), np.asarray(u, float) / np.linalg.norm(u)
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
            dd = P - c
            return P, sdf(P), np.linalg.norm(dd - np.outer(dd @ u, u), axis=1) - raio

        melhor = None
        grade = [(m, p) for m in range(-10, 91, 5) for p in range(0, 106, 5)]
        for cands in (grade, None):
            if cands is None:
                if melhor is None:
                    break
                m0, p0 = melhor[1], melhor[2]
                cands = [(m, p) for m in range(m0 - 4, m0 + 5) for p in range(max(0, p0 - 4), min(105, p0 + 4) + 1)]
            for m, p in cands:
                P, sd, cil = avaliar(m, p)
                if float(sd.min()) < -aperto:
                    continue
                cc = float(np.clip(cil, 0.0, 0.03).mean()) + 0.00002 * (abs(m) + p)
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


def polegar_na_alca(bon, lado, sdf, c, u, aperto=APERTO, base_livre=0.022, alvo=None, peso_alvo=0.3):
    """Polegar da mão `lado` dando a VOLTA na lateral (eixo c, u), com os 4 dedos já postos: a busca do polegar novo do
    pg.polegar_em_volta (eixos anatômicos do polegar tirados do rig, pele por LBS, MCP e IP perto da pegada medida de Goislard 2012 num
    cilindro de 33 mm, pele da base sem esticar mais que pg.POLEGAR_ALONGA_MAX nem virar do avesso; a polpa vai encostar por cima das
    falanges médias do indicador e do médio — Napier: "the thumb, which is wrapped over the dorsum of the fingers"), com o obstáculo
    trocado: nada do polegar entra no kettlebell DE VERDADE (sdf = kb.sdf, a lateral e o canto da alça) mais que `aperto` — a conta do
    pegada3d usa o cilindro reto, e perto do canto a alça já se afasta dele. Põe o polegar no Blender e devolve (postura, viável, polpa ×
    falanges médias mm, polpa × alvo mm, alongamento, fundo no kettlebell mm)."""
    import polegar3d as P3
    rig = bon.rig
    ossos = [lado + "HandThumb%d" % i for i in (1, 2, 3)]
    for o in ossos:
        rig.pose.bones[p3.P + o].matrix_basis = Matrix.Identity(4)
    p3.atualizar()
    pele = pg._pele(bon)
    pesos = pele["pesos"]
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 0)
    pos = {nm: i for i, nm in enumerate(nomes)}
    c, u = np.asarray(c, float), P3.unit(u)
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
    bvh = _bvh(co, t_ok)
    medias = tri[np.isin(dono[tri], [pos[lado + "HandIndex2"], pos[lado + "HandMiddle2"]]).all(axis=1)]
    bvh_media = _bvh(co, medias)
    linha = {int(i): k for k, i in enumerate(idx)}
    d_pol = [pos[o] for o in ossos]
    k_pol = np.array([linha[int(i)] for i in idx if dono[i] in d_pol])
    k_teste = np.array([linha[int(i)] for i in idx if dono[i] in d_pol and not any(
        nm in pesos[int(i)] for nm in (lado + "Hand", lado + "HandIndex1", lado + "ForeArm"))])
    k_ponta = np.array([linha[int(i)] for i in idx if dono[i] == d_pol[2]])
    if alvo is None:
        meio2 = co[(dono == pos[lado + "HandIndex2"]) | (dono == pos[lado + "HandMiddle2"])].mean(axis=0)
        rad = (meio2 - c) - u * ((meio2 - c) @ u)
        alvo = meio2 + rad / np.linalg.norm(rad) * 0.011                                # o mesmo alvo do pegada3d
    alvo = np.asarray(alvo, float)
    P = co.copy()

    def medir(q):
        rots = P3.rotacoes(eixos, q)
        Mc, juntas = P3.cadeia(cab, ponta, rots)
        Ms = [Mc[k] @ M0[k] for k in range(3)]
        Q = P3.lbs(H, W, fixo, Ms)
        D = Q[k_pol]
        D = D[np.linalg.norm(D - juntas[0], axis=1) > base_livre]
        ferro = max(0.0, -float(sdf(D).min())) if len(D) else 0.0
        P[idx] = Q
        alonga = float((np.linalg.norm(P[Eb[:, 0]] - P[Eb[:, 1]], axis=1) / l0).max())
        R = R_fixo.copy()
        for k in range(3):
            R[dono_k == k] = Ms[k][:3, :3]
        vir = P3.viradas(n0, P, Tb, R)
        entra = _dentro_de(bvh, Q[k_teste])
        vao = min(bvh_media.find_nearest(Vector(v))[3] for v in Q[k_ponta])
        d_alvo = float(np.linalg.norm(Q[k_ponta].mean(axis=0) - alvo))
        gap = max(0.0, float(sdf(Q[k_ponta]).min()))
        return dict(rots=rots, ferro=ferro, alonga=alonga, viradas=vir, entra=entra, vao=vao, alvo=d_alvo, gap=gap)

    def custo(q):
        m = medir(q)
        viola = (10 * max(0.0, m["ferro"] - aperto) + 10 * max(0.0, m["entra"] - pg.POLEGAR_ENTRA) +
                 0.05 * max(0.0, m["alonga"] - pg.POLEGAR_ALONGA_MAX) + 0.003 * m["viradas"])
        encosto = m["vao"] if POLEGAR_ALVO == "dedos" else m["gap"]     # polpa encostando nos dedos (padrão) ou no ferro
        return encosto + peso_alvo * m["alvo"] + viola + P3.custo_postura(q), viola == 0

    grade = [(cf, ca, cr, mf, P3.REF_33MM[4], ipf) for cf in (-20, 0, 20, 40) for ca in (0, 20, 40, 60)
             for cr in (-30, -15, 0, 15, 30, 45) for mf in (20, 40) for ipf in (35, 60)]
    sementes = [q for _, q in sorted((custo(q)[0], q) for q in grade)[:8]] + [P3.REF_33MM]
    if DEBUG_POLEGAR:
        for q in sorted(grade, key=lambda q: medir(q)["alvo"])[:10] + sementes[:4]:
            m = medir(q)
            print("POLEGAR? %s: ferro %.1f entra %.1f alonga %.2f viradas %d vão %.1f alvo %.1f polpa×ferro %.1f custo %.4f" % (
                q, m["ferro"] * 1000, m["entra"] * 1000, m["alonga"], m["viradas"], m["vao"] * 1000, m["alvo"] * 1000,
                m["gap"] * 1000, custo(q)[0]), flush=True)
    q, J, viavel, n = P3.buscar(custo, sementes, pg.POLEGAR_FAIXAS)
    m = medir(q)
    if viavel:
        for o, R in zip(ossos, m["rots"]):
            if not np.allclose(R, np.eye(3)):
                p3.girar_osso(rig, o, Matrix(R.tolist()))
    return (tuple(round(float(x), 1) for x in q), bool(viavel), round(m["vao"] * 1000, 1), round(m["alvo"] * 1000, 1),
            round(m["alonga"], 2), round(m["ferro"] * 1000, 1), round(m["gap"] * 1000, 1))


def montar(bon):
    pg.usar_cilindro(DIAM_ALCA_MM)        # a alça de 33 mm (> 29 mm): a mão de referência do cilindro de 33 mm (Shimawaki 2019)
    pg.usar_polegar("volta")              # polegar novo (dá a volta na lateral)
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda nome: p3.cabeca(rig, nome)
    lt = (c("LeftLeg") - c("LeftUpLeg")).length
    ls = (c("LeftFoot") - c("LeftLeg")).length
    meio0 = (c("LeftUpLeg") + c("RightUpLeg")) / 2
    meia_quadril = (c("LeftUpLeg") - c("RightUpLeg")).length / 2
    tz0 = c("LeftFoot")
    neck0 = c("Neck")
    hips0 = c("Hips")
    vert0 = p3.ponta(rig, "Head")

    # massa do corpo: volume da malha (em repouso) × DENSIDADE
    co, tri, _, _ = _pele(bon)
    v0, v1, v2 = co[tri[:, 0]], co[tri[:, 1]], co[tri[:, 2]]
    m_corpo = float(np.einsum("ij,ij->i", v0, np.cross(v1, v2)).sum() / 6.0) * DENSIDADE
    CARGA = M_KB / m_corpo
    print("GOBLET massa do corpo %.1f kg | kettlebell %.0f kg = %.3f da massa do corpo" % (m_corpo, M_KB, CARGA), flush=True)

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
        proj = (P - rest) @ np.array((0.0, -1.0, 0.0))     # em repouso o pé aponta pra −Y
        PEPELE[lado] = (float(proj.min()), float(proj.max()))

    def quadril(canela, joelho):
        """Meio das articulações do quadril (y, z) com a canela `canela` graus à frente da vertical e o joelho dobrado `joelho`
        graus, no plano sagital; z corrigido pra distância de verdade quadril → tornozelo (com o afastamento de lado)."""
        a, k = math.radians(canela), math.radians(joelho)
        y = ya - ls * math.sin(a) + lt * math.sin(k - a)
        d = math.sqrt(ls * ls + lt * lt + 2 * ls * lt * math.cos(k))
        z = za + math.sqrt(max(d * d - dx * dx - (y - ya) ** 2, 1e-6))
        return y, z

    def joelhos(y, z, joelho=None):
        """Joelhos no plano do pé, JOELHO_FORA pra fora dele — e, descendo, até JOELHO_FORA_BAIXO embaixo: os cotovelos empurram os
        joelhos pra fora ("use your elbows to push your knees out", free-exercise-db; "pushing your knees out as you descend", Dan John)."""
        fora = JOELHO_FORA
        if joelho is not None and JOELHO_BAIXO > JOELHO_CIMA:
            f_ = min(1.0, max(0.0, (joelho - JOELHO_CIMA) / (JOELHO_BAIXO - JOELHO_CIMA)))
            fora += (JOELHO_FORA_BAIXO - JOELHO_FORA) * f_ * f_
        return {lado: joelho_no_plano_do_pe(Vector((s * meia_quadril, y, z)), pes[lado]["A"], pes[lado]["f"], pes[lado]["n"],
                                            lt, ls, fora) for lado, s in LADOS}

    estado = {}

    def corpo(canela, joelho, tronco):
        """Pelve e tronco (giram juntos: coluna neutra), joelhos no plano dos pés, cabeça olhando à frente."""
        for nome in ("Hips", "Neck", "Head", "LeftShoulder", "RightShoulder"):
            PB[p3.P + nome].matrix_basis = Matrix()
        p3.atualizar()
        y, z = quadril(canela, joelho)
        p3.girar_osso(rig, "Hips", p3.rot_x(tronco), pivo=meio0, mover=Vector((0.0, y - meio0.y, z - meio0.z)))
        K = joelhos(y, z, joelho)
        for lado, _ in LADOS:
            Kj, C, _ = K[lado]
            v = Kj - C
            polos[lado].location = Kj + (v.normalized() if v.length > 1e-6 else pes[lado]["f"]) * 0.6
        p3.atualizar()
        p3.girar_osso(rig, "Neck", p3.rot_x(-tronco * PESCOCO))
        R = p3.rot_x(tronco)
        f_ = min(1.0, max(0.0, (joelho - JOELHO_CIMA) / (JOELHO_BAIXO - JOELHO_CIMA))) if JOELHO_BAIXO > JOELHO_CIMA else 0.0
        eleva, protrai = ELEVA + (ELEVA_BAIXO - ELEVA) * f_, PROTRAI + (PROTRAI_BAIXO - PROTRAI) * f_
        for lado, s in LADOS:                       # cintura escapular: sobe (eixo frente-trás) e vai à frente (eixo do tronco)
            if eleva:
                p3.girar_osso(rig, lado + "Shoulder", Matrix.Rotation(math.radians(-s * eleva), 3, R @ Vector((0, 1, 0))))
            if protrai:
                p3.girar_osso(rig, lado + "Shoulder", Matrix.Rotation(math.radians(-s * protrai), 3, R @ Vector((0, 0, 1))))
        estado.update(canela=canela, joelho=joelho, tronco=tronco, K={l: K[l][0] for l, _ in LADOS}, O=Vector((0.0, y, z)), R=R)

    def tronco_mundo():
        """Matriz 4×4 que leva o tronco em pé (repouso) pro tronco de agora."""
        O, R = estado["O"], estado["R"]
        return Matrix.Translation(O - R @ meio0) @ R.to_4x4()

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

    # ── referência (em pé): o kettlebell encostado no peito, o alto da alça logo abaixo do queixo ─────────────────────────────────
    corpo(2.0, JOELHO_CIMA, TRONCO_CIMA)
    kb = e3.kettlebell("kettlebell")
    co, tri, nomes, dono = _pele(bon, 1)                       # a pele da checagem (nível 1 da subdivisão)
    tronco_pele = _mascara(nomes, dono, lambda n_: n_ in ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head"))
    bvh_tronco = _bvh(co, tri[tronco_pele[tri].all(axis=1)])
    cab = co[_mascara(nomes, dono, lambda n_: n_ == "Head") & (np.abs(co[:, 0]) < 0.02)]
    z_queixo = float(cab[cab[:, 1] < c("Neck").y - 0.05][:, 2].min())
    T0 = tronco_mundo()
    Rb = T0.to_3x3() @ Matrix.Rotation(math.radians(-BETA), 3, "X")      # o alto do kettlebell pro peito (+Y = pra trás)
    eco0 = [np.asarray(ck._avaliar_simples(o)[0]) for o in (kb.corpo, kb.alca)]   # vértices no referencial da raiz (raiz na origem)
    kb_loc = np.concatenate(eco0) - np.array(kb.raiz.matrix_world.to_translation())
    alto = max(float((np.array(Rb) @ p)[2]) for p in kb_loc)
    zc = z_queixo - TOPO_QUEIXO - alto

    def kb_em(y_):
        kb.raiz.matrix_world = Matrix.Translation((0.0, y_, zc)) @ Rb.to_4x4()
        bpy.context.view_layer.update()

    def folga_peito(y_):
        kb_em(y_)
        P = np.concatenate([ck._avaliar_simples(o)[0] for o in (kb.corpo, kb.alca)])
        return _perto(bvh_tronco, P)

    lo, hi = -0.60, -0.10                                      # o kettlebell anda pra trás até a FOLGA_PEITO da pele
    for _ in range(22):
        m_ = (lo + hi) / 2
        if folga_peito(m_) > FOLGA_PEITO:
            lo = m_
        else:
            hi = m_
    kb_em(lo)
    KB_REL = T0.inverted() @ kb.raiz.matrix_world.copy()       # o kettlebell no referencial do tronco em pé (repouso)
    print("KETTLEBELL: centro do corpo y %.3f z %.3f (queixo z %.3f) | inclinado %.0f° pro peito | folga do peito %.1f mm" % (
        lo, zc, z_queixo, BETA, folga_peito(lo) * 1000), flush=True)

    def kb_no_quadro():
        kb.raiz.matrix_world = tronco_mundo() @ KB_REL
        bpy.context.view_layer.update()

    # ── mãos nas laterais ───────────────────────────────────────────────────────────────────────────────────────────────────────────
    maos = Maos(bon, kb.raio, polo_inicial=(0.3, 0.1, -0.5), polegar_modo="volta")
    pg.mao_de_referencia(rig, "Left")
    W0 = c("LeftHand")
    g_ref = p3.mundo_osso(rig, "LeftHand") @ maos.furo["Left"]
    y_m = (p3.ponta(rig, "LeftHand") - W0).normalized()
    n_m = pg._base(rig, "Left")[0]
    n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
    x_m = y_m.cross(n_m)
    FL = Vector(((g_ref - W0).dot(y_m), (g_ref - W0).dot(n_m), (g_ref - W0).dot(x_m)))   # vão nos eixos (dedos, palma, lado)
    L1 = (c("LeftForeArm") - c("LeftArm")).length
    L2 = (c("LeftHand") - c("LeftForeArm")).length

    def pegada_rep(s):
        """Vão (ponto do eixo da lateral), dedos e palma da mão do lado s, no referencial do tronco em pé (repouso)."""
        Mk = KB_REL
        p, u = kb.laterais[s]
        g = Mk @ (p + u * DELTA)
        u = (Mk.to_3x3() @ u).normalized()
        ef = Vector((0.0, -1.0, 0.0))
        ef = (ef - u * ef.dot(u)).normalized()                 # pra frente, ⟂ à lateral
        med = -(u.cross(ef)).normalized() * s                  # pro meio, ⟂ à lateral
        ph = math.radians(PHI)
        return g, ef * math.cos(ph) + med * math.sin(ph), -ef * math.sin(ph) + med * math.cos(ph), u

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

    PEG = {s: pegada_rep(s) for _, s in LADOS}
    posturas = {}                      # matrix_basis dos dedos e do polegar (relativos à mão), da busca no montar()

    def bracos():
        """As 2 mãos nas laterais do kettlebell, com o tronco de agora (o kettlebell já no lugar)."""
        T = tronco_mundo()
        R3 = T.to_3x3()
        for lado, s in LADOS:
            g, h, p, _ = PEG[s]
            g, h, p = T @ g, (R3 @ h).normalized(), (R3 @ p).normalized()
            W = g - h * FL.x - p * FL.y - h.cross(p) * FL.z
            k_ = estado.get("t", 0.0)                       # o cotovelo desliza pra frente e pro meio na descida (COTOVELO → COTOVELO_BAIXO)
            fr, la = (math.radians(a_ + (b_ - a_) * k_) for a_, b_ in zip(COTOVELO, COTOVELO_BAIXO))
            quer = Vector((s * math.sin(la), -math.sin(fr), 0.0))
            quer.z = -math.sqrt(max(0.0, 1.0 - quer.x ** 2 - quer.y ** 2))
            E, C = cotovelo_no_circulo(c(lado + "Arm"), W, (R3 @ quer).normalized())
            for nm in ("Arm", "ForeArm", "Hand"):           # o IK parte da pose atual: zera pra não "andar" entre os quadros
                PB[p3.P + lado + nm].matrix_basis = Matrix()
            p3.atualizar()
            maos.segurar(lado, g, h, p, polo=E + (E - C).normalized() * 0.4)
            for nm, M in posturas.get(lado, {}).items():
                PB[p3.P + nm].matrix_basis = M
        p3.atualizar()

    # polo do IK de cada braço calibrado uma vez (pole_angle): o cotovelo no plano ombro–punho–polo, do lado do polo
    T = tronco_mundo()
    for lado, s in LADOS:
        g, h, p, _ = PEG[s]
        maos.segurar(lado, T @ g, T.to_3x3() @ h, T.to_3x3() @ p, polo=c(lado + "Arm") + Vector((s * 0.2, -0.1, -0.6)))
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        maos.iks[lado].mute = True
        print("polo cotovelo %s erro %.3f ang %d" % (lado, *e), flush=True)
    bracos()
    ossos_mao = {lado: ["%sHand%s%d" % (lado, d, i) for d in DEDOS + ("Thumb",) for i in (1, 2, 3)] for lado, _ in LADOS}
    resumo = {}
    for lado, s in LADOS:                              # dedos em volta da lateral e polegar dando a volta (contra o kettlebell de verdade)
        cg, ug = kb.mundo(s)
        cg = cg + ug * DELTA
        p3.soltar_dedos(rig, lado)
        pg.juntar_dedos(rig, lado)
        p3.atualizar()
        dd = fechar_dedos(bon, lado, kb.sdf, cg, ug, kb.raio, corpo=corpo_sem_mao(bon, lado))
        p3.atualizar()
        alvo_pol = None
        if POLEGAR_ALVO == "alca":                     # polpa na lateral, no lado oposto à palma, POLEGAR_ACIMA acima do indicador
            ind = np.array(c(lado + "HandIndex1"))
            eixo_ind = np.array(cg) + np.array(ug) * float((ind - np.array(cg)) @ np.array(ug))
            _, _, pq, _ = PEG[s]
            pq = (tronco_mundo().to_3x3() @ pq).normalized()
            alvo_pol = eixo_ind + np.array(ug) * POLEGAR_ACIMA + np.array(pq) * (kb.raio + 0.008)
        pol = polegar_na_alca(bon, lado, kb.sdf, cg, ug, alvo=alvo_pol, peso_alvo=0.3 if POLEGAR_ALVO == "dedos" else 0.1)
        p3.atualizar()
        posturas[lado] = {nm: PB[p3.P + nm].matrix_basis.copy() for nm in ossos_mao[lado]}
        resumo[lado] = (dd, pol)
        print("DEDOS %s %s" % (lado, " ".join("%s %d/%d° %.1f/%.1fmm" % (k[0], *v) for k, v in dd.items())), flush=True)
        print("POLEGAR %s %s viável %s: polpa × falanges médias %.1f mm, × alvo %.1f mm, pele %.2f×, entra no ferro %.1f mm, polpa × "
              "ferro %.1f mm" % (lado, *pol), flush=True)
    bracos()
    REP = {lado: {nm: T.inverted() @ c(lado + nm) for nm in ("Arm", "ForeArm", "Hand", "HandMiddle1")} for lado, _ in LADOS}
    KB_CM_REP = KB_REL @ kb.centro_de_massa                    # centro de massa do kettlebell no tronco em pé

    # ── centro de massa (corpo + kettlebell), analítico: pernas pelas contas, tronco/cabeça/braços/kettlebell rígidos com o tronco ─
    def centro_de_massa(canela, joelho, tronco):
        y, z = quadril(canela, joelho)
        O, R = Vector((0.0, y, z)), p3.rot_x(tronco)
        tr = lambda p_: O + R @ (Vector(p_) - meio0)
        K = joelhos(y, z, joelho)
        pts = {"MIDH": O, "CERV": tr(neck0)}
        pts["VERT"] = pts["CERV"] + p3.rot_x(tronco * (1.0 - PESCOCO)) @ (vert0 - neck0)
        soma, massa = Vector(), 0.0
        for a_, b_, m_, f_ in SEGMENTOS:
            soma += (pts[a_] + (pts[b_] - pts[a_]) * f_) * m_
            massa += m_
        for lado, s in LADOS:
            J = {nm: tr(p_) for nm, p_ in REP[lado].items()}
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
        soma += tr(KB_CM_REP) * CARGA
        massa += CARGA
        cm = soma / massa
        return -(cm.y - A_meio.y), cm

    def canela_do_equilibrio(joelho, tronco, lo=-5.0, hi=55.0):
        """Canela (graus à frente) que deixa o centro de massa COM_ALVO à frente dos tornozelos."""
        for _ in range(30):
            m = (lo + hi) / 2
            if centro_de_massa(m, joelho, tronco)[0] < COM_ALVO:
                lo = m
            else:
                hi = m
        return (lo + hi) / 2

    def angulo_quadril(canela, joelho, tronco):
        """Coxa × tronco (graus) como o checagem3d.medir_juntas mede (coxa: quadril → joelho; tronco: Hips → Neck), média dos 2 lados."""
        y, z = quadril(canela, joelho)
        K = joelhos(y, z, joelho)
        t_ = p3.rot_x(tronco) @ (neck0 - hips0)
        out = []
        for lado, s in LADOS:
            out.append(math.degrees((K[lado][0] - Vector((s * meia_quadril, y, z))).angle(-t_)))
        return sum(out) / 2

    def coxa(canela, joelho):
        """Inclinação da coxa (graus; + = joelho abaixo do quadril), média dos 2 lados, pelas contas."""
        y, z = quadril(canela, joelho)
        K = joelhos(y, z, joelho)
        out = []
        for lado, s in LADOS:
            d = K[lado][0] - Vector((s * meia_quadril, y, z))
            out.append(math.degrees(math.atan2(-d.z, math.hypot(d.x, d.y))))
        return sum(out) / 2

    # embaixo: o tronco (com a canela do equilíbrio) que deixa o quadril em QUADRIL_BAIXO com o joelho em JOELHO_BAIXO
    for tr_ in range(0, 46, 5):
        cn = canela_do_equilibrio(JOELHO_BAIXO, tr_)
        print("TABELA joelho %.0f° tronco %2d° → canela %.1f° quadril %.1f° coxa %.1f°" % (
            JOELHO_BAIXO, tr_, cn, angulo_quadril(cn, JOELHO_BAIXO, tr_), coxa(cn, JOELHO_BAIXO)), flush=True)
    lo, hi = 0.0, 60.0
    for _ in range(30):
        m = (lo + hi) / 2
        if angulo_quadril(canela_do_equilibrio(JOELHO_BAIXO, m), JOELHO_BAIXO, m) < QUADRIL_BAIXO:
            lo = m
        else:
            hi = m
    TRONCO_BAIXO = (lo + hi) / 2
    CANELA_BAIXO = canela_do_equilibrio(JOELHO_BAIXO, TRONCO_BAIXO)
    CANELA_CIMA = canela_do_equilibrio(JOELHO_CIMA, TRONCO_CIMA)
    print("GOBLET em pé: canela %.1f° | embaixo: joelho %.1f° tronco %.1f° canela %.1f° quadril %.1f° coxa %.1f°" % (
        CANELA_CIMA, JOELHO_BAIXO, TRONCO_BAIXO, CANELA_BAIXO, angulo_quadril(CANELA_BAIXO, JOELHO_BAIXO, TRONCO_BAIXO),
        coxa(CANELA_BAIXO, JOELHO_BAIXO)), flush=True)
    polo_dos_joelhos(CANELA_BAIXO, JOELHO_BAIXO, TRONCO_BAIXO)

    def coxa_panturrilha():
        """Coxa × perna na pose de agora, nos 2 lados (a pele da coxa a mais de VINCO_JOELHO do centro do joelho): se os triângulos se
        cruzam, quanto o vértice mais fundo da coxa entra na perna (m, negativo — a conta do checagem3d.corpo_x_corpo); se não, a menor
        distância entre as 2 peles (m, positivo)."""
        co, tri, nomes, dono = _pele(bon, 1)
        out = []
        for lado, _ in LADOS:
            K = np.array(c(lado + "Leg"))
            mu = _mascara(nomes, dono, lambda nm, L=lado: nm == L + "UpLeg") & (np.linalg.norm(co - K, axis=1) > VINCO_JOELHO)
            ml = _mascara(nomes, dono, lambda nm, L=lado: nm == L + "Leg")
            ta, tb = tri[mu[tri].all(axis=1)], tri[ml[tri].all(axis=1)]
            bb = _bvh(co, tb)
            pares = _bvh(co, ta).overlap(bb)
            if not pares:
                out.append(min(bb.find_nearest(Vector(v))[3] for v in co[np.unique(ta.ravel())]))
                continue
            fundo = 0.0
            for i in np.unique(ta[[p_[0] for p_ in pares]].ravel()):
                v = Vector(co[i])
                loc, nor, _, d = bb.find_nearest(v)
                if loc is not None and d < 0.05 and (v - loc).dot(nor) < 0:
                    fundo = max(fundo, d)
            out.append(-fundo)
        return min(out)

    for item in SONDA_JOELHOS:                         # (sondas) coxa × panturrilha, braço × coxa com o joelho k_ e o quadril q_
        k_, q_ = item if isinstance(item, (tuple, list)) else (item, QUADRIL_BAIXO)
        lo_, hi_ = -10.0, 60.0
        for _ in range(25):
            m_ = (lo_ + hi_) / 2
            if angulo_quadril(canela_do_equilibrio(k_, m_), k_, m_) < q_:
                lo_ = m_
            else:
                hi_ = m_
        estado["t"] = 1.0
        cn_ = canela_do_equilibrio(k_, lo_)
        corpo(cn_, k_, lo_)
        p3.atualizar()
        co_, tri_, nomes_, dono_ = _pele(bon, 1)
        K_ = np.array(c("LeftLeg"))
        mu_ = _mascara(nomes_, dono_, lambda nm: nm == "LeftUpLeg")
        ml_ = _mascara(nomes_, dono_, lambda nm: nm == "LeftLeg")
        ta_, tb_ = tri_[mu_[tri_].all(axis=1)], tri_[ml_[tri_].all(axis=1)]
        bb_ = _bvh(co_, tb_)
        pares_ = _bvh(co_, ta_).overlap(bb_)
        faixas_ = {}
        for i in (np.unique(ta_[[p_[0] for p_ in pares_]].ravel()) if pares_ else []):
            v = Vector(co_[i])
            loc, nor, _, d = bb_.find_nearest(v)
            if loc is not None and d < 0.05 and (v - loc).dot(nor) < 0:
                r_ = int(np.linalg.norm(co_[i] - K_) * 50) * 2       # faixa de 2 cm
                faixas_[r_] = max(faixas_.get(r_, 0.0), d)
        kb_no_quadro()
        bracos()
        bc_ = []
        co_, tri_, nomes_, dono_ = _pele(bon, 1)
        for lado, _ in LADOS:
            mb = _mascara(nomes_, dono_, lambda nm, L=lado: nm in (L + "Arm", L + "ForeArm"))
            mc = _mascara(nomes_, dono_, lambda nm, L=lado: nm in (L + "UpLeg", L + "Leg"))
            ta, tb = tri_[mb[tri_].all(axis=1)], tri_[mc[tri_].all(axis=1)]
            bb = _bvh(co_, tb)
            pares = _bvh(co_, ta).overlap(bb)
            if pares:
                fundo = 0.0
                for i in np.unique(ta[[p_[0] for p_ in pares]].ravel()):
                    v = Vector(co_[i])
                    loc, nor, idx, d = bb.find_nearest(v)
                    if loc is not None and d < 0.06 and (v - loc).dot(nor) < 0:
                        fundo = max(fundo, d)
                bc_.append(-fundo)
            else:
                bc_.append(min(bb.find_nearest(Vector(v))[3] for v in co_[np.unique(ta.ravel())]))
        jn_ = ck.medir_juntas(rig)
        print("SONDA joelho %.1f° quadril %.1f° tronco %.1f° canela %.1f° coxa %.1f° cotovelo %.0f/%.0f° | braço × coxa %s mm | coxa × "
              "panturrilha (cm do joelho: mm) %s" % (
            k_, q_, lo_, cn_, coxa(cn_, k_), jn_["cotoveloE"], jn_["cotoveloD"], "/".join("%+.1f" % (x * 1000) for x in bc_),
            " ".join("%d:%.1f" % (r_, faixas_[r_] * 1000) for r_ in sorted(faixas_))), flush=True)

    def pose(t):
        """t=0 em pé, t=1 embaixo."""
        joelho, tronco = p3.lerp(JOELHO_CIMA, JOELHO_BAIXO, t), p3.lerp(TRONCO_CIMA, TRONCO_BAIXO, t)
        canela = canela_do_equilibrio(joelho, tronco)
        estado["t"] = t
        corpo(canela, joelho, tronco)
        kb_no_quadro()
        bracos()
        estado["com"] = centro_de_massa(canela, joelho, tronco)[0]

    pose.estado = estado
    pose.resumo = resumo
    pose.kb = kb

    def medidas_maos(por_dedo=False):
        """Pele das mãos × kettlebell (malha de verdade; mm, − = entra) — o corpo (a bola) e a alça à parte —, mão × mão, mãos ×
        peito/pescoço/cabeça. por_dedo: cada dedo à parte."""
        co, tri, nomes, dono = _pele(bon, 1)
        bvh_c = _bvh(*ck._avaliar_simples(kb.corpo))
        bvh_a = _bvh(*ck._avaliar_simples(kb.alca))
        out = {}
        for lado, _ in LADOS:
            partes = [("palma", lambda nm, L=lado: nm == L + "Hand"),
                      ("dedos", lambda nm, L=lado: nm.startswith(L + "Hand") and "Thumb" not in nm and nm != L + "Hand"),
                      ("polegar", lambda nm, L=lado: nm.startswith(L + "HandThumb"))]
            if por_dedo:
                partes += [(d.lower(), lambda nm, L=lado, d=d: nm.startswith(L + "Hand" + d)) for d in DEDOS]
            for rot, pred in partes:
                P = co[_mascara(nomes, dono, pred)]
                out["%s %s" % (rot, lado[0])] = "%+.1f/%+.1f" % (_perto(bvh_c, P) * 1000, _perto(bvh_a, P) * 1000)
        mE = _mascara(nomes, dono, lambda nm: nm.startswith("LeftHand"))
        mD = _mascara(nomes, dono, lambda nm: nm.startswith("RightHand"))
        out["mão×mão"] = "%+.1f" % (_perto(_bvh(co, tri[mD[tri].all(axis=1)]), co[mE]) * 1000)
        mt = _mascara(nomes, dono, lambda nm: nm in ("Spine1", "Spine2", "Neck", "Head"))
        out["mãos×peito"] = "%+.1f" % (_perto(_bvh(co, tri[mt[tri].all(axis=1)]), co[mE | mD]) * 1000)
        return out

    def info():
        juntas = ck.medir_juntas(rig)
        txt = ["canela %.1f° joelho %.1f° tronco %.1f° | centro de massa %+.0f mm à frente do tornozelo" % (
            estado.get("canela", 0), estado.get("joelho", 0), estado.get("tronco", 0), estado.get("com", 0) * 1000)]
        txt.append("mãos × kettlebell, corpo/alça (mm): " + " ".join("%s %s" % kv for kv in medidas_maos(POR_DEDO).items()))
        for lado, s in LADOS:
            K = c(lado + "Leg")
            E = c(lado + "ForeArm")
            txt.append("%s: cotovelo × centro do joelho %.0f mm (lado %+.0f, frente %+.0f, altura %+.0f) | quadril %.0f°" % (
                lado[0], (K - E).length * 1000, s * (K.x - E.x) * 1000, -(K.y - E.y) * 1000, (K.z - E.z) * 1000,
                juntas["quadril" + ("E" if s > 0 else "D")]))
        co, tri, nomes, dono = _pele(bon, 1)
        P_kb = np.concatenate([ck._amostras(*ck._avaliar_simples(o), 0.012) for o in (kb.corpo, kb.alca)])
        for rot, partes in (("kb × coxas/joelhos", ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg")),
                            ("kb × braços/antebraços", ("LeftArm", "RightArm", "LeftForeArm", "RightForeArm")),
                            ("kb × pescoço/cabeça", ("Neck", "Head")), ("kb × peito/barriga", ("Spine", "Spine1", "Spine2", "Hips"))):
            m = _mascara(nomes, dono, lambda nm, ps=partes: nm in ps)
            txt.append("%s %+.1f mm" % (rot, _perto(_bvh(co, tri[m[tri].all(axis=1)]), P_kb) * 1000))
        for lado, s in LADOS:
            mb = _mascara(nomes, dono, lambda nm, L=lado: nm in (L + "Arm", L + "ForeArm"))
            mc = _mascara(nomes, dono, lambda nm, L=lado: nm in (L + "UpLeg", L + "Leg"))
            ta, tb = tri[mb[tri].all(axis=1)], tri[mc[tri].all(axis=1)]
            bb = _bvh(co, tb)
            pares = _bvh(co, ta).overlap(bb)
            if pares:
                vs = np.unique(ta[[p_[0] for p_ in pares]].ravel())
                fundo, onde = 0.0, None
                for i in vs:
                    v = Vector(co[i])
                    loc, nor, idx, d = bb.find_nearest(v)
                    if loc is not None and d < 0.06 and (v - loc).dot(nor) < 0 and d > fundo:
                        fundo, onde = d, (nomes[dono[i]], nomes[dono[tb[idx][0]]], tuple(round(float(x), 3) for x in co[i]))
                txt.append("%s: braço/antebraço × coxa/perna CRUZA (%d pares) entra %.1f mm %s" % (lado[0], len(pares), fundo * 1000, onde))
            else:
                txt.append("%s: braço/antebraço × coxa/perna %+.1f mm" % (lado[0], min(bb.find_nearest(Vector(v))[3]
                                                                                    for v in co[np.unique(ta.ravel())]) * 1000))
        txt.append("coxa × panturrilha (a > %.0f cm do joelho) %+.1f mm" % (VINCO_JOELHO * 100, coxa_panturrilha() * 1000))
        txt.append(maos.info())
        return " | ".join(txt)

    kb_no_quadro()
    return Cena(pose, [kb.raiz], pegadas=[("Left", ck.Barra(kb.pegadores[1], kb.raio, kb.meia)),
                                          ("Right", ck.Barra(kb.pegadores[-1], kb.raio, kb.meia))],
                apoio_mm=0.0, foco_luz=(0, 0.0, 0.9), camera_video=((3.3, -2.9, 1.15), (0, 0.0, 0.85), 50), info=info)
