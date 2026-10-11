# Subida no Banco com Halteres — cena da fábrica 3D (lote 11, 11/10/2026; um dos 61 novos do scripts/conteudo/novos_61.json: 0 usos nos
# treinos prontos, 5 vezes como troca equivalente; "fonte_en": "Dumbbell Step Ups"). Sem peça nova: o banco reto de 44 cm (e3.banco, o dos
# supinos e do Agachamento Búlgaro com Halteres) ATRAVESSADO na frente da pessoa (só a raiz girada 90° em Z) e 2 halteres de 29 mm
# (e3.halter) pendurados ao lado do corpo, com a pegada neutra e o polegar novo.
# É a subida com UMA perna só por série (free-exercise-db, Dumbbell Step Ups — o "fonte_en": "Repeat with the right leg for the recommended
# amount of repetitions and then perform with the left leg."), como o Afundo com Barra (o passo inteiro na ida):
#   t = 0 em pé no chão, de frente pro lado comprido do banco, os pés lado a lado na largura do quadril · o pé esquerdo sai do chão (o
#   calcanhar primeiro), sobe e pisa INTEIRO em cima do banco (joelho e quadril a ~90°) · o peso passa pra perna esquerda (o quadril vai à
#   frente, o tronco inclina um pouco e a canela de cima passa um pouco da vertical; o pé direito fica chapado no lugar) · a perna esquerda
#   estende e levanta o corpo; o pé direito sai do chão sem empurrar (é a perna que o levanta) e, quando a de cima termina de esticar, pisa
#   no banco ao lado do outro · t = 1 em pé em cima do banco, ereto. O app faz a volta (a ida ao contrário), que é a descida das fontes: o
#   pé de trás (direito) desce primeiro e volta pro lugar de onde saiu, o peso volta pra ele e só então o pé esquerdo sai do banco e volta
#   pro lado do outro (NSCA/CSCS: "Step off the box with the trailing leg." · "Place the trailing foot at the same distance as the start." ·
#   "Shift weight to the trailing leg." · "Step off the box with the lead leg."; free-exercise-db: "Step down with the left leg by flexing
#   the hip and knee of the right leg [...] Return to the original standing position by placing the right foot of to next to the left foot
#   on the initial position.").
# Técnica (as frases das fontes, com a referência, ficam na ficha):
#   • em pé, ereto, um halter em cada mão com os braços esticados ao lado do corpo e as palmas viradas pras coxas; escápulas pra trás e pra
#     baixo, sem encolher os ombros (free-exercise-db; ExRx "dumbbells grasped to sides"; ACE "palms facing inwards", "Depress and retract
#     your scapulae");
#   • de frente pro LADO do banco (ExRx: "facing side of bench"; a foto 1 da free-exercise-db mostra o banco reto atravessado), perto dele
#     (NSCA: "Move to a spot near the front of the box"), pés na largura do quadril, pontas pra frente (NSCA: "Place the feet hip-width apart
#     with the toes pointed ahead.");
#   • o banco de 44 cm cabe nos 30–46 cm da NSCA, e o pé de cima pisa onde o joelho e o quadril ficam a ~90° (NSCA: "high enough to create a
#     90-degree angle at the knee and hip joints when the lead foot is on the box"; CSCS: "to reach a 90° knee angle"); o pé INTEIRO toca o
#     banco de uma vez, com folga atrás do calcanhar e à frente dos dedos (NSCA: "The initial contact of the lead foot with the top of the box
#     must be made by the entire foot; do not allow the heel to hang off the edge of the box"; "extra space behind the heel and ahead of the
#     toe") — o pé (25,3 cm) fica no meio dos 30 cm do estofado;
#   • o pé de trás fica no lugar enquanto o peso passa pra perna de cima (NSCA: "Keep the trailing foot in the starting position, but shift
#     the body's weight to the lead leg.") — o quadril vai 13 cm à frente, até a perna de trás ficar quase esticada, uns 8° atrás da
#     vertical (o Simenz 2012 começa com a de trás em ~10° de extensão do quadril: "trail leg in 10-degree hyperextension at the hip") —, o
#     tronco e a canela de cima passam um pouco da vertical (ACE: "your torso and your right tibia (shinbone) will move slightly forward past
#     vertical, but try to avoid excessive forward movement"): o tronco até 10° e a canela até 18°, o joelho sempre atrás da ponta do pé;
#   • sobe estendendo o quadril e o joelho de cima, SEM impulso da perna de baixo (NSCA: "do not push off or hop up with the trailing leg or
#     foot"; free-exercise-db: "Use the heel mainly to lift the rest of your body up") — o pé de trás sai do chão chapado, sem ficar na
#     ponta, levantado pela perna — e, com a perna de cima esticada, o pé de trás pisa ao lado do outro (NSCA: "As the hip and knee of the
#     lead leg fully extend to a standing position on top of the box, bring the trailing foot up and place it next to the lead foot.");
#   • joelho de cima na direção do pé (ExRx: "Lead knee should point same direction as foot throughout movement"; ACE: "aligning your knee
#     over your second toe"), tronco ereto (ExRx: "Keep torso upright"; NSCA: "Keep the torso erect; do not lean forward.").
# Montagem:
#   - tempo: o exportador passa t com o ease seno; a cena desfaz o ease (u = acos(1 − 2t)/π, o tempo de verdade em fração da ida — o do
#     Afundo com Barra) e põe cada fase no tempo dela: o calcanhar esquerdo sobe (U_SOBE), o pé anda no ar e pisa no banco (U_PASSO), o
#     peso passa (U_TRANSF), o corpo sobe até U_TOPO e o pé direito anda no ar de U_DECOLA a U_POUSA.
#   - pés: no ar, o tornozelo faz um caminho em 3 partes (caminho()): sobe (o de trás, atrás do corpo, sem raspar na face do banco), anda
#     à frente por cima da borda e desce reto em cima do lugar onde pisa, cada parte com velocidade zero nas pontas; o pé acompanha a canela
#     (o tornozelo vai de onde saiu pra uma dorsiflexão D_MEIO no meio e pro pé chapado na chegada — o jeito do Afundo com Barra), nivela antes
#     de tocar o banco (CHAPA_F/CHAPA_T: o pé inteiro pisa de uma vez) sem passar de DORSI_MAX/PLANTAR_MAX no tornozelo, e a base dos dedos não
#     desce abaixo de onde estava ao sair do chão; parado, o pé fica chapado (no chão ou com a sola AFUNDA mm dentro do estofado). O pé de trás
#     nunca estica a perna além de JOELHO_TRAS_TRANSF: se o caminho dele ficar mais longe, ele é levantado pela própria perna (o "sem impulso").
#   - quadril: em pé (o centro de massa corpo + halteres em cima do meio do pé, como no Afundo com Barra) e parado enquanto o pé esquerdo anda
#     no ar; do pé pisar até em cima, sai da perna de cima — o joelho dela dobrado phi graus e a canela sigma graus à frente da vertical, com o
#     tornozelo parado no banco (phi: 92 → 108 no fim da passagem do peso → 6 em cima; sigma: 0 → 17,5 → SIGMA_MAX → 2), resolvido por Newton —,
#     em curvas cúbicas monótonas (as do Afundo com Barra) com velocidade zero quando o pé pisa e em cima; em cima é a posição de baixo
#     transladada pro banco.
#   - joelhos: cada um no plano vertical do próprio pé (joelho_no_plano_do_pe, do Agachamento Sumô com Halteres): o polo do IK vai pra
#     frente do joelho calculado a cada quadro, então o joelho aponta pro pé mesmo com o pé no ar.
#   - braços e halteres: pendurados na vertical do MUNDO (ALFA e TETA do Agachamento Búlgaro com Halteres, 1 cm mais abertos pra o halter
#     passar por fora da coxa com os pés lado a lado), em FK exato (braco_fk: perto de esticado o IK do Blender muda de um quadro pro outro),
#     o antebraço girado até a palma virar pra coxa; a mão fecha no halter UMA vez (o halter no vão da mão de referência, na linha dos nós dos
#     dedos, e o polegar novo dando a volta no pegador — o jeito do Tríceps Testa com Halteres) e o halter vai junto com a mão em todos os
#     quadros: a pegada é a mesma do começo ao fim e nada escorrega.
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
from agachamento_sumo_com_halteres import joelho_no_plano_do_pe
from afundo_com_barra import curva

FRENTE, TRAS = "Left", "Right"     # a perna esquerda sobe primeiro (a "lead leg"); a direita é a de trás
LADOS = (("Left", 1), ("Right", -1))

# ── banco e base ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
TOPO = 0.44                # altura do estofado (m): o e3.banco padrão (supinos, Búlgaro) — dentro dos 30–46 cm da NSCA, quase os
                           # 45,72 cm do Simenz 2012
LARG_BANCO = 0.30          # largura do estofado (o pé sobe por ela, com o banco atravessado)
COMPR_BANCO = 1.20         # comprimento do banco (o padrão do e3.banco)
AFUNDA = 0.003             # a sola afunda 3 mm no estofado (o Búlgaro usa 4 mm no peito do pé)
X_PE = 0.14                # tornozelos a ±14 cm do meio: base de 28 cm, cada pé embaixo do seu quadril (a do Afundo com Barra e do Afundo
                           # com Halteres; NSCA: "Place the feet hip-width apart"; ACE: "about hip width apart")
JOELHO_CIMA = 6.0          # flexão dos joelhos em pé (graus), no chão e em cima do banco: pernas esticadas sem travar
JOELHO_PISA = 92.0         # joelho de cima quando o pé pisa no banco (graus), com o quadril ainda onde estava em pé: o "90-degree angle at
                           # the knee and hip joints when the lead foot is on the box" da NSCA (o quadril fica a ~93°)
TRANSF = 0.13              # o quadril vai 13 cm à frente com o pé de trás chapado no chão: a perna de trás fica quase esticada, ~8° atrás
                           # da vertical (o Simenz 2012 começa com "the trail leg in 10-degree hyperextension at the hip"); mais que isso o
                           # pé de trás não alcança o chão chapado
JOELHO_TRAS_TRANSF = 2.0   # joelho de trás no fim da passagem do peso (graus): quase esticado; o pé de trás nunca estica a perna além disso
INC = (2.0, 10.0)          # tronco à frente da vertical (graus): em pé (no chão e em cima) e no começo da subida — ereto, no máximo um
                           # pouco à frente (NSCA "Keep the torso erect"; ACE "slightly forward past vertical")
SIGMA_MAX = 18.0           # a canela de cima passa da vertical até 18° no começo da subida (ACE: "your right tibia (shinbone) will move
                           # slightly forward past vertical, but try to avoid excessive forward movement"): o joelho fica atrás da ponta do
                           # pé e o tornozelo dentro dos 20° de dorsiflexão normal
PESCOCO = 0.8              # quanto a cabeça volta (fração da inclinação do tronco): olhando à frente (o do Afundo com Barra)
RETRAI = 6.0               # escápulas pra trás (graus em volta do eixo do tronco; ACE: "Depress and retract your scapulae")
M_HALTER = 10.0            # kg de cada halter (só entra no centro de massa da posição em pé)
DENSIDADE = 1000.0         # kg/m³: o volume da malha do boneco × isso = a massa do corpo (o do Afundo com Barra)

# ── o tempo (u = fração do tempo da ida, sem o ease) ─────────────────────────────────────────────────────────────────────────────
U_SOBE = (0.02, 0.08)      # o calcanhar esquerdo sobe (o pé gira em volta da base dos dedos, que fica no chão)
U_PASSO = (0.08, 0.42)     # o pé esquerdo anda no ar; no fim pisa inteiro no banco
U_TRANSF = (0.42, 0.56)    # o peso passa pra perna esquerda (o quadril vai à frente; o pé direito chapado)
U_DECOLA = 0.56            # o pé direito sai do chão (no fim da passagem do peso, quando o corpo começa a subir)
U_INC = 0.60               # o tronco no máximo da inclinação (começo da subida)
U_SIGMA = 0.63             # a canela de cima no máximo (SIGMA_MAX)
U_POUSA = 0.93             # o pé direito pisa no banco
U_TOPO = 0.95              # o quadril chega em cima
THETA_SOBE = 15.0          # pé esquerdo × chão quando os dedos saem do chão (graus, calcanhar pra cima)
# caminho do tornozelo no ar: (pico acima de onde pisa (m), fração do caminho em que chega no pico, fração em que começa a ir à frente,
# fração em que termina de ir à frente — daí só desce reto e pisa)
CAMINHO_F = (0.07, 0.60, 0.35, 0.85)
CAMINHO_T = (0.10, 0.60, 0.40, 0.85)
# o pé fica chapado (pé × chão → 0) entre essas frações do caminho, antes de tocar o banco: o esquerdo só no fim; o direito, que sobe atrás
# do corpo com o joelho dobrado (a ponta pra baixo), nivela antes de passar por cima da borda
CHAPA_F = (0.70, 0.95)
CHAPA_T = (0.50, 0.80)
D_MEIO = 15.0              # dorsiflexão do tornozelo esquerdo no meio do caminho (graus, em relação ao pé chapado em pé)
D_MEIO_TRAS = 12.0         # dorsiflexão do tornozelo direito no meio do caminho (graus)
DORSI_MAX = 18.0           # no ar, o tornozelo não passa disso de dorsiflexão nem de PLANTAR_MAX de flexão plantar (amplitude normal 20° e
PLANTAR_MAX = 45.0         # 50°: Alazzawi 2017, a do Agachamento Búlgaro): o pé só nivela até onde o tornozelo deixa

# ── braços e halteres (os do Agachamento Búlgaro com Halteres, um pouco mais abertos) ───────────────────────────────────────────────
ALFA = 3.0                 # braço (ombro → cotovelo) à frente da vertical do MUNDO (o halter pende pra baixo), graus
TETA = 8.0                 # antebraço (cotovelo → punho) à frente da vertical, graus: cotovelo estendido, sem travar
LARG_COT = 0.06            # cotovelo um pouco pra fora do ombro e punho um pouco pra fora do cotovelo (ângulo de carregamento): com os pés
FORA_PUNHO = 0.06          # lado a lado, os 5 cm do Búlgaro punham a anilha de trás 10 mm dentro da coxa em pé (sonda_halter, 11/10); com
                           # 6 cm o halter passa por fora da coxa com 12 mm de folga (braço 14° aberto, mãos a 1,69× a largura dos ombros)
RAIO = 0.0145              # pegador do halter: 29 mm, o cilindro da mão de referência (sem usar_cilindro)
PEGADA_H = 0.13            # pegador entre as anilhas (m)
RAIO_ANILHA = 0.055
LARG_ANILHA = 0.05         # a do e3.halter() padrão


def _ss(x):
    """Rampa suave 0 → 1 (smoothstep) com x preso em [0, 1]."""
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def _fase(u, faixa):
    """0 → 1 dentro da faixa [u0, u1] do tempo, preso nas pontas."""
    return max(0.0, min(1.0, (u - faixa[0]) / (faixa[1] - faixa[0])))


def caminho(Ps, Pe, prm, lam):
    """Tornozelo no ar, na fração lam do tempo do caminho de Ps (sai do chão) a Pe (pisa): sobe até prm[0] acima de Pe na fração prm[1] e
    desce até Pe; anda de Ps.y a Pe.y entre as frações prm[2] e prm[3] (antes só sobe, depois só desce, reto). Cada parte com velocidade
    zero nas pontas (smoothstep)."""
    alto, lz, ly0, ly1 = prm
    z_pk = Pe.z + alto
    if lam <= lz:
        z = Ps.z + (z_pk - Ps.z) * _ss(lam / lz)
    else:
        z = z_pk + (Pe.z - z_pk) * _ss((lam - lz) / (1 - lz))
    y = Ps.y + (Pe.y - Ps.y) * _ss((lam - ly0) / (ly1 - ly0))
    x = Ps.x + (Pe.x - Ps.x) * _ss(lam)
    return Vector((x, y, z))


def tempo_real(t):
    """O t do exportador vem com o ease seno (p3.suave); u é o tempo de verdade, em fração da ida (o do Afundo com Barra)."""
    return math.acos(max(-1.0, min(1.0, 1.0 - 2.0 * t))) / math.pi


def t_do_u(u):
    """O t do exportador (com o ease) no instante u: o que as regras da ficha usam."""
    return p3.suave(u)


def _pele(bon, niveis=1):
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, niveis)
    return co, tri, nomes, dono


def _mascara(nomes, dono, pred):
    return np.array([bool(pred(n)) for n in nomes] + [False])[dono]


def _sdf_halter(P, M):
    """Distância com sinal (m, − = dentro) dos pontos P (N×3) até o halter (pegador + 2 anilhas: 3 cilindros), com a matriz de mundo M
    da raiz (eixo local X); devolve (pegador, anilhas) — a conta do Tríceps Testa com Halteres."""
    M = np.array(M)
    c0, w = M[:3, 3], M[:3, 0] / np.linalg.norm(M[:3, 0])
    d = np.asarray(P, float) - c0
    a = d @ w
    rho = np.linalg.norm(d - np.outer(a, w), axis=1)

    def cil(a0, meia, R):
        qx, qy = rho - R, np.abs(a - a0) - meia
        return np.minimum(np.maximum(qx, qy), 0.0) + np.hypot(np.maximum(qx, 0.0), np.maximum(qy, 0.0))

    ma = PEGADA_H / 2 + LARG_ANILHA / 2
    eixo = cil(0.0, (PEGADA_H + 2 * LARG_ANILHA + 0.02) / 2, RAIO)
    anilhas = np.minimum(cil(-ma, LARG_ANILHA / 2, RAIO_ANILHA), cil(ma, LARG_ANILHA / 2, RAIO_ANILHA))
    return eixo, anilhas


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta no halter (padrão dos exercícios novos); halter de 29 mm = mão padrão
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda nome: p3.cabeca(rig, nome)
    lt = (c("LeftLeg") - c("LeftUpLeg")).length
    ls = (c("LeftFoot") - c("LeftLeg")).length
    meio0 = (c("LeftUpLeg") + c("RightUpLeg")) / 2              # meio das articulações do quadril no repouso
    meia_quadril = (c("LeftUpLeg") - c("RightUpLeg")).length / 2
    tz0, mtp0 = c("LeftFoot"), c("LeftToeBase")                 # tornozelo e base dos dedos no repouso (pé chapado)
    v_pe = tz0 - mtp0                                           # base dos dedos → tornozelo, pé chapado
    co, _, nomes, dono = _pele(bon, 1)
    pe_e = np.where(_mascara(nomes, dono, lambda nm: nm in ("LeftFoot", "LeftToeBase")))[0]
    V_pe = co[pe_e] - np.array(tz0)                              # pele do pé esquerdo em relação ao tornozelo (chapado)
    sola_z = float(co[pe_e, 2].min())                           # o ponto mais baixo da sola no repouso (níveis 1)
    y_dedos, y_calc = float(V_pe[:, 1].min()), float(V_pe[:, 1].max())   # ponta dos dedos (−) e fundo do calcanhar (+) × tornozelo
    i_calc = {}                                                 # o vértice do calcanhar de cada pé (o mais de trás da sola)
    for L, _ in LADOS:
        pe = np.where(_mascara(nomes, dono, lambda nm, L=L: nm in (L + "Foot", L + "ToeBase")))[0]
        bx = pe[co[pe, 2] < sola_z + 0.004]
        i_calc[L] = int(bx[np.argmax(co[bx, 1])])
    L_TRAS = math.sqrt(lt * lt + ls * ls + 2 * lt * ls * math.cos(math.radians(JOELHO_TRAS_TRANSF)))

    # ── pés: chapados no chão em pé (x = ±X_PE), chapados no banco em cima ──────────────────────────────────────────────────────────
    def espelho(v):
        return Vector((-v.x, v.y, v.z))

    VPE = {FRENTE: v_pe.copy(), TRAS: espelho(v_pe)}            # base dos dedos → tornozelo de cada pé (chapado)
    A0 = {FRENTE: Vector((X_PE, tz0.y, tz0.z)), TRAS: Vector((-X_PE, tz0.y, tz0.z))}   # tornozelos em pé, no chão
    MTP0 = {L: A0[L] - VPE[L] for L in A0}                      # base dos dedos em pé
    z_banco = tz0.z - sola_z + TOPO - AFUNDA                    # tornozelo com o pé chapado em cima do estofado
    geo = {}                                                    # o que sai das contas abaixo (onde pisa, curvas, caminhos)

    def tornozelo_na_ponta(mtp, th, v):
        """Tornozelo do pé apoiado na base dos dedos `mtp`, com o pé th graus do chão (calcanhar pra cima); v = base dos dedos →
        tornozelo do pé chapado."""
        return mtp + p3.rot_x(th) @ v

    pernas, polos, alvos, rot_pe, rot_dedos, M_pe, M_dedos = {}, {}, {}, {}, {}, {}, {}
    for L, s in LADOS:
        alvos[L] = p3.vazio("tornozelo_" + L, p3.ponta(rig, L + "Leg"))      # nasce no tornozelo (alvo ≠ polo)
        polos[L] = p3.vazio("polo_joelho_" + L, (s * 0.25, -1.2, 0.5))
        pernas[L] = p3.ik(rig, L + "Leg", alvos[L], polos[L])
        rot_pe[L] = p3.travar_rotacao(rig, L + "Foot")
        rot_dedos[L] = p3.travar_rotacao(rig, L + "ToeBase")
        M_pe[L], M_dedos[L] = rot_pe[L].matrix_world.copy(), rot_dedos[L].matrix_world.copy()

    def quadris(y, z):
        meio = Vector((0.0, y, z))
        return {L: meio + Vector((s * meia_quadril, 0.0, 0.0)) for L, s in LADOS}

    def flexao(H, A):
        """Flexão do joelho (graus) com o quadril em H e o tornozelo em A (0 = esticado; a perna não passa de esticada)."""
        d = min((A - H).length, lt + ls - 1e-9)
        return 180.0 - math.degrees(math.acos(max(-1.0, min(1.0, (lt * lt + ls * ls - d * d) / (2 * lt * ls)))))

    def joelho(L, H, A):
        """Joelho da perna L no plano vertical do próprio pé (o pé aponta pra −Y): (joelho, centro do círculo, distância ao plano)."""
        s = 1.0 if L == "Left" else -1.0
        return joelho_no_plano_do_pe(H, A, Vector((0.0, -1.0, 0.0)), Vector((s, 0.0, 0.0)), lt, ls, 0.0)

    def canela(L, H, A):
        """Canela da perna L (quadril H → tornozelo A) inclinada à frente, graus da vertical (+ = joelho à frente do tornozelo)."""
        e = joelho(L, H, A)[0] - A
        return math.degrees(math.atan2(-e.y, e.z))

    def no_ar(L, u, H, faixa, P, D, saida_z):
        """Pé L andando no ar no instante u (faixa de tempo do caminho P = (sai, pisa, parâmetros, chapa); D = dorsiflexão em 3 pontos — saída,
        meio, chegada): tornozelo, pé × chão (graus, + = calcanhar pra cima), dedos × chão, fração do caminho e se a perna levantou o pé."""
        lam = _fase(u, faixa)
        A = caminho(P[0], P[1], P[2], lam)
        puxado = False
        if L == TRAS:                                            # o pé de trás não estica a perna: é ela que o levanta (sem impulso)
            d = A - H
            if d.length > L_TRAS:
                A = H + d.normalized() * L_TRAS
                puxado = True
        dd = (1 - lam) ** 2 * D[0] + 2 * lam * (1 - lam) * D[1] + lam ** 2 * D[2]
        can = canela(L, H, A)
        th = (can - dd) * (1.0 - _ss(_fase(lam, P[3])))          # chapado antes de tocar o banco (o pé inteiro pisa de uma vez)
        th = max(can - DORSI_MAX, min(can + PLANTAR_MAX, th))     # sem passar da amplitude do tornozelo (dorsiflexão = can − th)
        # a base dos dedos não desce abaixo de onde estava ao sair do chão (com o joelho dobrando, a ponta do pé girava pra baixo mais
        # rápido que o tornozelo subia); só vale perto do chão
        sobe = saida_z - (A - p3.rot_x(th) @ VPE[L]).z
        if sobe > 0 and A.z < 0.30:
            A = A + Vector((0.0, 0.0, sobe))
        dedos = th * _ss(lam / 0.3)                              # os dedos voltam pra linha do pé logo depois de sair do chão
        return A, th, dedos, lam, puxado

    def pes(u, Hs):
        """Pés no instante u: posiciona os alvos do IK e o giro de cada pé; devolve {L: (tornozelo, pé × chão, fase)}."""
        out = {}
        # pé esquerdo (sobe primeiro)
        L = FRENTE
        if u <= U_PASSO[0]:
            th = THETA_SOBE * _ss(_fase(u, U_SOBE))
            A, dedos, fase = tornozelo_na_ponta(MTP0[L], th, VPE[L]), 0.0, ("calcanhar sobe" if th > 0 else "em pé")
        elif u < U_PASSO[1] and "P_F" in geo:
            A, th, dedos, lam, _ = no_ar(L, u, Hs[L], U_PASSO, geo["P_F"], geo["D_F"], MTP0[L].z)
            fase = "no ar %.2f" % lam
        elif u < U_PASSO[1]:
            th, dedos, A, fase = THETA_SOBE, 0.0, tornozelo_na_ponta(MTP0[L], THETA_SOBE, VPE[L]), "no ar (sem caminho)"
        else:
            th, dedos, A, fase = 0.0, 0.0, geo["A_L"].copy(), "no banco"
        out[L] = (A, th, dedos, fase)
        # pé direito (fica no chão, sai sem impulso e pisa ao lado do outro)
        L = TRAS
        if u <= U_DECOLA or "P_T" not in geo:
            th, dedos, A, fase = 0.0, 0.0, A0[L].copy(), "chão"
        elif u < U_POUSA:
            A, th, dedos, lam, puxado = no_ar(L, u, Hs[L], (U_DECOLA, U_POUSA), geo["P_T"], geo["D_T"], MTP0[L].z)
            fase = "no ar %.2f%s" % (lam, " (perna)" if puxado else "")
        else:
            th, dedos, A, fase = 0.0, 0.0, geo["A_TL"].copy(), "no banco"
        out[L] = (A, th, dedos, fase)
        for L, (A, th, dedos, _) in out.items():
            alvos[L].location = A
            rot_pe[L].matrix_world = p3.rot_x(th).to_4x4() @ M_pe[L]
            rot_dedos[L].matrix_world = p3.rot_x(dedos).to_4x4() @ M_dedos[L]
        return out

    estado = {}

    def corpo(u, y, z, inc):
        """Pés, pelve e tronco (giram juntos: coluna neutra) com o meio das articulações do quadril em (0, y, z), joelhos (IK com o polo
        na frente do joelho calculado) e a cabeça olhando à frente."""
        for nome in ("Hips", "Neck", "Head"):
            PB[p3.P + nome].matrix_basis = Matrix()
        Hs = quadris(y, z)
        P = pes(u, Hs)
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(inc), pivo=meio0, mover=Vector((0.0, y - meio0.y, z - meio0.z)))
        K = {}
        for L, _ in LADOS:
            K[L] = joelho(L, Hs[L], P[L][0])
            Kj, C, _ = K[L]
            v = Kj - C
            polos[L].location = Kj + (v.normalized() if v.length > 1e-6 else Vector((0.0, -1.0, 0.0))) * 0.6
        p3.atualizar()
        p3.girar_osso(rig, "Neck", p3.rot_x(-inc * PESCOCO))
        estado.update(u=u, y=y, z=z, inc=inc, K=K, pes={L: (P[L][0].copy(), P[L][1], P[L][3]) for L in P})

    # ── polo dos joelhos: acertado com os 2 joelhos dobrados (agachado, os pés chapados no chão), o joelho no lugar calculado ─────────
    corpo(0.0, meio0.y - 0.06, 0.62, 0.0)
    for L, _ in LADOS:
        e = p3.acertar_polo(rig, pernas[L], L + "Leg", L + "UpLeg", L + "Foot")
        melhor = (1e9, None)
        for k in range(-10, 11):
            ang = e[1] + k * 0.5
            pernas[L].pole_angle = math.radians(ang)
            p3.atualizar()
            melhor = min(melhor, ((c(L + "Leg") - estado["K"][L][0]).length, ang))
        pernas[L].pole_angle = math.radians(melhor[1])
        p3.atualizar()
        print("polo joelho %s %.1f° | joelho a %.1f mm do alvo (agachado)" % (L, melhor[1], melhor[0] * 1000), flush=True)

    def bissecao(fn, lo, hi, alvo, voltas=50):
        flo = fn(lo) - alvo
        for _ in range(voltas):
            m = (lo + hi) / 2
            fm = fn(m) - alvo
            if (fm > 0) == (flo > 0):
                lo, flo = m, fm
            else:
                hi = m
        return (lo + hi) / 2

    z_em_pe = lambda y: bissecao(lambda z: flexao(quadris(y, z)[TRAS], A0[TRAS]), 0.75, 0.99, JOELHO_CIMA)
    y0 = meio0.y
    z0 = z_em_pe(y0)
    corpo(0.0, y0, z0, INC[0])
    if RETRAI:                         # escápulas pra trás (o corpo() não mexe no osso Shoulder: fica assim em todos os quadros)
        cima = (c("Neck") - c("Hips")).normalized()
        for L, s in LADOS:
            p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * RETRAI), 3, cima))

    # ── braços pendurados na vertical do mundo, em FK exato: perto de esticado o IK do Blender não fecha no alvo e muda de um quadro pro
    #    outro (o Tríceps Testa com Halteres e o Tríceps Coice com Halter também fazem por FK). Uma referência com o cotovelo dobrado
    #    (IK uma vez só) e, a cada quadro, o braço gira em volta do ombro até o cotovelo cair em E com o eixo da dobra ⟂ ao braço e ao
    #    antebraço, e o antebraço dobra como dobradiça até o punho cair em W; depois gira em volta do próprio eixo até a palma virar pra
    #    coxa. A mão fecha no halter uma vez e o halter vai junto com ela ─────────────────────────────────────────────────────────────
    punhos, polos_b, iks_b = {}, {}, {}
    for L, _ in LADOS:                                          # alvos nascem no punho de repouso (alvo = polo dá NaN)
        punhos[L] = p3.vazio("punho_" + L, p3.ponta(rig, L + "ForeArm"))
        polos_b[L] = p3.vazio("polo_cotovelo_" + L, c(L + "ForeArm") + Vector((0, 0.6, 0)))
        iks_b[L] = p3.ik(rig, L + "ForeArm", punhos[L], polos_b[L])
    Lb = (c("LeftForeArm") - c("LeftArm")).length
    La = (c("LeftHand") - c("LeftForeArm")).length
    halteres = {L: e3.halter("halter_" + L, pegada=PEGADA_H, raio=RAIO, raio_anilha=RAIO_ANILHA, larg_anilha=LARG_ANILHA)
                for L, _ in LADOS}
    for h in halteres.values():
        h.rotation_mode = "QUATERNION"

    def alvos_braco(L, s, teta):
        """Ombro S (já posto), cotovelo E (braço ALFA à frente da vertical do MUNDO, um pouco pra fora) e punho W (antebraço teta graus à
        frente da vertical, o punho FORA_PUNHO pra fora do cotovelo)."""
        alfa, te = math.radians(ALFA), math.radians(teta)
        S = c(L + "Arm")
        E = S + Vector((s * LARG_COT, -math.sin(alfa) * Lb, -math.cos(alfa) * Lb)).normalized() * Lb
        dx = s * FORA_PUNHO
        rho = math.sqrt(La * La - dx * dx)
        W = E + Vector((dx, -math.sin(te) * rho, -math.cos(te) * rho))
        return S, E, W

    REF_COT = 60.0                                              # antebraço da referência, graus à frente da vertical
    ref = {}
    for L, s in LADOS:
        S, E, W = alvos_braco(L, s, REF_COT)
        iks_b[L].mute = False
        punhos[L].location = W
        eixo = (W - S).normalized()
        fora = (E - S) - eixo * (E - S).dot(eixo)
        polos_b[L].location = E + fora.normalized() * 0.4
        p3.atualizar()
        e = p3.acertar_polo(rig, iks_b[L], L + "ForeArm", L + "Arm", L + "Hand")
        nomes_b = (L + "Arm", L + "ForeArm")
        mats = [PB[p3.P + n].matrix.copy() for n in nomes_b]
        iks_b[L].mute = True
        for n, M in zip(nomes_b, mats):
            PB[p3.P + n].matrix = M
            p3.atualizar()
        S0, E0, W0 = c(L + "Arm"), c(L + "ForeArm"), c(L + "Hand")
        u0, f0 = (E0 - S0).normalized(), (W0 - E0).normalized()
        ref[L] = dict(S0=S0, u0=u0, n0=u0.cross(f0).normalized(), MA=mats[0], MF=mats[1])
        print("braço %s: referência por IK (polo %d°, erro %.3f), cotovelo da referência %.0f°" % (
            L, e[1], e[0], math.degrees(u0.angle(f0))), flush=True)

    def braco_fk(L, E, W):
        """Braço L com o cotovelo em E e o punho em W, exato (gira a referência em volta do ombro e dobra o antebraço na dobradiça)."""
        r = ref[L]
        S = c(L + "Arm")
        u = (E - S).normalized()
        f = (W - E).normalized()
        n = u.cross(f)
        n = n.normalized() if n.length > 1e-6 else r["n0"]
        F0 = Matrix((r["u0"], r["n0"], r["u0"].cross(r["n0"]))).transposed()
        F1 = Matrix((u, n, u.cross(n))).transposed()
        T = Matrix.Translation(S) @ (F1 @ F0.transposed()).to_4x4() @ Matrix.Translation(-r["S0"])
        PB[p3.P + L + "Arm"].matrix = T @ r["MA"]
        p3.atualizar()
        PB[p3.P + L + "ForeArm"].matrix = T @ r["MF"]
        p3.atualizar()
        E1 = c(L + "ForeArm")
        cur = (c(L + "Hand") - E1).normalized()
        ang = math.atan2(cur.cross(f).dot(n), cur.dot(f))
        PB[p3.P + L + "ForeArm"].matrix = (Matrix.Translation(E1) @ Matrix.Rotation(ang, 4, n) @ Matrix.Translation(-E1)
                                           @ PB[p3.P + L + "ForeArm"].matrix)
        p3.atualizar()

    def virar_palma(L, s):
        """Gira o antebraço em volta do próprio eixo até a palma virar pra coxa (pegada neutra)."""
        f0, f1 = c(L + "ForeArm"), c(L + "Hand")
        ax = (f1 - f0).normalized()
        quer = Vector((-s, 0.0, 0.0))                           # palma pro meio do corpo (pra coxa)
        quer = (quer - ax * quer.dot(ax)).normalized()
        tem = pg._base(rig, L)[0]
        tem = (tem - ax * tem.dot(ax)).normalized()
        ang = math.atan2(tem.cross(quer).dot(ax), tem.dot(quer))
        p3.girar_osso(rig, L + "ForeArm", Matrix.Rotation(ang, 3, ax))

    for L, s in LADOS:
        braco_fk(L, *alvos_braco(L, s, TETA)[1:])
        virar_palma(L, s)
    pose_dedos, H_rel, dedos = {}, {}, {}
    for L, _ in LADOS:
        pg.mao_de_referencia(rig, L)
        g, envolve = pg.ponto_na_mao(bon, L, RAIO)
        eixo_h = pg._base(rig, L)[1]                            # o halter fica na linha dos nós dos dedos
        h = halteres[L]
        h.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(eixo_h)
        h.location = g
        p3.atualizar()
        dedos[L] = pg.fechar_em_volta(bon, L, g, eixo_h, RAIO)
        print("PEGADA %s vão (%.3f %.3f %.3f) envolve %.0f° | dedos %s" % (L, *g, envolve, dedos[L]), flush=True)
        ossos_mao = [pb.name for pb in PB if pb.name[len(p3.P):].startswith(L + "Hand") and pb.name != p3.P + L + "Hand"]
        pose_dedos[L] = {n: PB[n].matrix_basis.copy() for n in ossos_mao}
        H_rel[L] = p3.mundo_osso(rig, L + "Hand").inverted() @ h.matrix_world

    def bracos():
        """Braços pendurados a partir dos ombros do quadro, palma pra coxa, a mão fechada do jeito de sempre e o halter junto com ela."""
        for L, s in LADOS:
            braco_fk(L, *alvos_braco(L, s, TETA)[1:])
            virar_palma(L, s)
            for n, M in pose_dedos[L].items():
                PB[n].matrix_basis = M
        p3.atualizar()
        for L, _ in LADOS:
            loc, rot, _ = (p3.mundo_osso(rig, L + "Hand") @ H_rel[L]).decompose()
            halteres[L].location = loc
            halteres[L].rotation_quaternion = rot
        p3.atualizar()

    def centro_de_massa():
        """Centro de massa do corpo (volume da malha posada, densidade uniforme) + os 2 halteres; devolve (sistema, corpo, massa)."""
        co_, tri_, _ = ck._avaliar(bon.corpo, 0)
        v0, v1, v2 = co_[tri_[:, 0]], co_[tri_[:, 1]], co_[tri_[:, 2]]
        vol = np.einsum("ij,ij->i", v0, np.cross(v1, v2)) / 6.0
        V = float(vol.sum())
        cc = Vector(((v0 + v1 + v2) / 4.0 * vol[:, None]).sum(axis=0) / V)
        m = V * DENSIDADE
        ch = halteres["Left"].matrix_world.to_translation() + halteres["Right"].matrix_world.to_translation()
        return (cc * m + ch * M_HALTER) / (m + 2 * M_HALTER), cc, m

    # ── em pé no chão: joelhos a JOELHO_CIMA; o quadril vai pra frente/trás até o centro de massa (corpo + halteres) ficar em cima do
    #    meio do pé (entre o fundo do calcanhar e a base dos dedos, como no Afundo com Barra) ───────────────────────────────────────────
    Y_MEIO_PE = (tz0.y + y_calc + mtp0.y) / 2

    def erro_em_pe(y):
        corpo(0.0, y, z_em_pe(y), INC[0])
        bracos()
        return centro_de_massa()[0].y - Y_MEIO_PE

    ya, ea = y0, erro_em_pe(y0)
    yb = y0 + 0.01
    eb = erro_em_pe(yb)
    for _ in range(10):
        if abs(eb) < 2e-5 or abs(eb - ea) < 1e-9:
            break
        yn = yb - eb * (yb - ya) / (eb - ea)
        ya, ea = yb, eb
        yb, eb = yn, erro_em_pe(yn)
    y0 = yb
    z0 = z_em_pe(y0)

    # ── onde o pé esquerdo pisa: o joelho dele a JOELHO_PISA com o quadril ainda em pé (NSCA: ~90° no joelho e no quadril) ──────────
    y_L = bissecao(lambda y: flexao(quadris(y0, z0)[FRENTE], Vector((X_PE, y, z_banco))), y0 - 0.70, y0 - 0.15, JOELHO_PISA)
    geo["A_L"] = Vector((X_PE, y_L, z_banco))
    geo["A_TL"] = Vector((-X_PE, y_L, z_banco))
    # o banco atravessado: o pé (pele de y_dedos a y_calc do tornozelo) no meio dos LARG_BANCO do estofado
    margem = (LARG_BANCO - (y_calc - y_dedos)) / 2
    y_perto, y_longe = y_L + y_calc + margem, y_L + y_dedos - margem
    y_c = (y_perto + y_longe) / 2
    banco = e3.banco("banco", -COMPR_BANCO / 2, COMPR_BANCO / 2, topo=TOPO, largura=LARG_BANCO)
    banco.rotation_mode = "XYZ"
    banco.rotation_euler = (0.0, 0.0, math.pi / 2)          # o comprimento do banco vai pro X: a pessoa fica de frente pro lado dele
    banco.location = (0.0, y_c, 0.0)
    p3.atualizar()

    # ── fim da passagem do peso: o quadril TRANSF à frente, na altura em que a perna de trás fica a JOELHO_TRAS_TRANSF (pé chapado) ───
    y_t = y0 - TRANSF
    z_t = bissecao(lambda z: flexao(quadris(y_t, z)[TRAS], A0[TRAS]), 0.75, 0.99, JOELHO_TRAS_TRANSF)
    # ── em cima: a posição de baixo transladada pro banco ──────────────────────────────────────────────────────────────────────────────
    y_top, z_top = y0 + (y_L - tz0.y), z0 + (z_banco - tz0.z)
    # ── do pé esquerdo pisar até em cima, o quadril sai da perna de cima: o joelho dela dobrado phi graus e a canela sigma graus à frente
    #    da vertical (o tornozelo parado no banco). phi vai de JOELHO_PISA ao fim da passagem do peso e estica até em cima; sigma vai da
    #    vertical ao fim da passagem, chega em SIGMA_MAX no começo da subida e volta pra quase vertical em cima — o quadril sobe sem a
    #    canela passar muito da vertical (curvas monótonas, velocidade zero quando o pé pisa e em cima) ─────────────────────────────────
    lt_s = math.sqrt(lt * lt - (X_PE - meia_quadril) ** 2)    # coxa no plano da perna (o joelho fica no plano do pé, x = X_PE)

    def phi_sigma(y, z):
        H_ = quadris(y, z)[FRENTE]
        return flexao(H_, geo["A_L"]), canela(FRENTE, H_, geo["A_L"])

    def quadril_da_perna(phi, sigma):
        """(y, z) do meio do quadril com o joelho de cima a phi graus e a canela a sigma graus da vertical: a conta plana da perna dá o
        1º palpite e o Newton acerta (com a perna quase esticada o joelho sai do plano do pé e a conta plana erra ~16 mm)."""
        A = geo["A_L"]
        s_, c_ = math.sin(math.radians(sigma)), math.cos(math.radians(sigma))
        a = math.radians(phi - sigma)
        y, z = A.y - ls * s_ + lt_s * math.sin(a), A.z + ls * c_ + lt_s * math.cos(a)
        h = 1e-5
        for _ in range(12):
            f1, f2 = phi_sigma(y, z)
            r1, r2 = f1 - phi, f2 - sigma
            if abs(r1) < 1e-5 and abs(r2) < 1e-5:
                break
            gy, gz = phi_sigma(y + h, z), phi_sigma(y, z + h)
            a11, a21 = (gy[0] - f1) / h, (gy[1] - f2) / h
            a12, a22 = (gz[0] - f1) / h, (gz[1] - f2) / h
            det = a11 * a22 - a12 * a21
            if abs(det) < 1e-12:
                break
            y, z = y - (a22 * r1 - a12 * r2) / det, z - (-a21 * r1 + a11 * r2) / det
        return y, z

    ps0, pst, pstop = phi_sigma(y0, z0), phi_sigma(y_t, z_t), phi_sigma(y_top, z_top)
    fphi = curva([U_TRANSF[0], U_TRANSF[1], U_TOPO], [ps0[0], pst[0], pstop[0]])
    if pst[1] < SIGMA_MAX - 0.5:
        fsig = curva([U_TRANSF[0], U_TRANSF[1], U_SIGMA, U_TOPO], [ps0[1], pst[1], SIGMA_MAX, pstop[1]])
    else:
        fsig = curva([U_TRANSF[0], U_TRANSF[1], U_TOPO], [ps0[1], pst[1], pstop[1]])
    finc = curva([0.0, U_TRANSF[0], U_INC, U_TOPO, 1.0], [INC[0], INC[0], INC[1], INC[0], INC[0]])
    erro_y, erro_z = [], []
    for (y_, z_), ps in (((y0, z0), ps0), ((y_t, z_t), pst), ((y_top, z_top), pstop)):
        yy, zz = quadril_da_perna(*ps)
        erro_y.append((yy - y_) * 1000)
        erro_z.append((zz - z_) * 1000)
    print("QUADRIL pela perna de cima: phi/sigma pisa %.1f/%.1f, fim da passagem %.1f/%.1f, em cima %.1f/%.1f | volta da conta (mm) y %s "
          "z %s" % (*ps0, *pst, *pstop, ["%.2f" % e for e in erro_y], ["%.2f" % e for e in erro_z]), flush=True)

    def quadril(u):
        """Meio das articulações do quadril (y, z) no instante u."""
        if u <= U_TRANSF[0]:
            return y0, z0
        if u >= U_TOPO:
            return y_top, z_top
        return quadril_da_perna(fphi(u), fsig(u))

    H = lambda u, L: quadris(*quadril(u))[L]

    # ── caminhos dos pés ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
    A_S = tornozelo_na_ponta(MTP0[FRENTE], THETA_SOBE, VPE[FRENTE])       # tornozelo esquerdo quando os dedos saem do chão
    geo["P_F"] = (A_S, geo["A_L"], CAMINHO_F, CHAPA_F)
    d0 = canela(FRENTE, H(U_PASSO[0], FRENTE), A_S) - THETA_SOBE
    d1 = canela(FRENTE, H(U_PASSO[1], FRENTE), geo["A_L"])
    geo["D_F"] = (d0, 2 * D_MEIO - (d0 + d1) / 2, d1)
    geo["P_T"] = (A0[TRAS], geo["A_TL"], CAMINHO_T, CHAPA_T)
    d0 = canela(TRAS, H(U_DECOLA, TRAS), A0[TRAS])
    d1 = canela(TRAS, H(U_POUSA, TRAS), geo["A_TL"])
    geo["D_T"] = (d0, 2 * D_MEIO_TRAS - (d0 + d1) / 2, d1)
    print("SUBIDA quadril (meio): em pé y %+.4f z %.4f | fim da passagem y %+.4f z %.4f | em cima y %+.4f z %.4f | pé esquerdo pisa "
          "com o tornozelo em y %+.4f z %.4f (joelho %.1f°) | banco: borda de perto y %+.4f, de longe %+.4f (margem %.1f mm) | "
          "dorsiflexão esq %s dir %s" % (
              y0, z0, y_t, z_t, y_top, z_top, y_L, z_banco, flexao(quadris(y0, z0)[FRENTE], geo["A_L"]), y_perto, y_longe,
              margem * 1000, tuple(round(x, 1) for x in geo["D_F"]), tuple(round(x, 1) for x in geo["D_T"])), flush=True)

    def pose(t):
        """t=0 em pé no chão (pés lado a lado), t=1 em pé em cima do banco (pés lado a lado)."""
        u = tempo_real(t)
        corpo(u, *quadril(u), finc(u))
        bracos()
        estado["t"] = t

    pose.estado = estado
    pose.geo = geo

    # ── medidas à parte (a checagem não vê): pés × banco e × chão, pé parado sem escorregar, canelas × borda, halter × banco/coxas,
    #    mão × anilhas, centro de massa ──────────────────────────────────────────────────────────────────────────────────────────────
    banco_bvh = []
    for o in ck._malhas(banco):
        bco, btri = ck._avaliar_simples(o)
        banco_bvh.append((o.name, bco.min(axis=0), bco.max(axis=0),
                          BVHTree.FromPolygons([tuple(p) for p in bco], [tuple(t) for t in btri], all_triangles=True)))

    def ao_banco(P):
        """Menor distância com sinal (m, − = dentro) dos pontos P até o banco (pontos a mais de 10 cm da caixa de uma peça: a caixa)."""
        melhor = 9.0
        for _, lo, hi, bvh in banco_bvh:
            dentro = ((P >= lo - 0.10) & (P <= hi + 0.10)).all(axis=1)
            if not dentro.any():
                gap = float(np.linalg.norm(np.maximum(0.0, np.maximum(lo[None] - P, P - hi[None])), axis=1).min())
                melhor = min(melhor, gap)
                continue
            for v in P[dentro]:
                loc, nor, _, d = bvh.find_nearest(Vector(v))
                if loc is None:
                    continue
                if (Vector(v) - loc).dot(nor) < 0:
                    d = -d
                melhor = min(melhor, d)
        return melhor

    def plantado(L, u):
        """Onde o pé L fica parado nesse instante (tornozelo), ou None se ele está andando."""
        if L == FRENTE:
            if u <= U_SOBE[0]:
                return A0[L]
            if u >= U_PASSO[1]:
                return geo["A_L"]
            return None
        if u <= U_DECOLA:
            return A0[L]
        if u >= U_POUSA:
            return geo["A_TL"]
        return None

    def info():
        u = estado.get("u", 0.0)
        co_, _, nomes_, dono_ = _pele(bon, 1)
        j = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        cm, cc, m = centro_de_massa()
        P = estado.get("pes", {})
        txt = ["u %.3f E %s / D %s | tronco %.1f° | quadril y %+.4f z %.4f" % (
            u, P.get(FRENTE, (0, 0, "?"))[2], P.get(TRAS, (0, 0, "?"))[2], estado.get("inc", 0), estado.get("y", 0), estado.get("z", 0))]
        partes = []
        for L, s in LADOS:
            pe = _mascara(nomes_, dono_, lambda nm, L=L: nm in (L + "Foot", L + "ToeBase"))
            dd = _mascara(nomes_, dono_, lambda nm, L=L: nm == L + "ToeBase")
            calc = co_[i_calc[L]]
            A_real = Vector(j[L + "Foot"])
            A_alvo = alvos[L].location
            pl = plantado(L, u)
            escorrega = "%.2f" % ((A_real - pl).xy.length * 1000) if pl is not None else "-"
            partes.append("pé %s: mais baixo %+.1f mm, calcanhar %+.1f, dedos %+.1f | × banco %+.1f mm | tornozelo × alvo %.1f mm | "
                          "parado × onde pisou (xy) %s mm" % (
                              L[0], co_[pe, 2].min() * 1000, calc[2] * 1000, co_[dd, 2].min() * 1000, ao_banco(co_[pe]) * 1000,
                              (A_real - A_alvo).length * 1000, escorrega))
        txt.append(" | ".join(partes))
        canelas = []
        for L, _ in LADOS:
            perna = _mascara(nomes_, dono_, lambda nm, L=L: nm == L + "Leg")
            coxa = _mascara(nomes_, dono_, lambda nm, L=L: nm == L + "UpLeg")
            canelas.append("canela %s × banco %+.0f mm, coxa %s × banco %+.0f mm" % (
                L[0], ao_banco(co_[perna]) * 1000, L[0], ao_banco(co_[coxa]) * 1000))
        txt.append(" | ".join(canelas))
        e = j[FRENTE + "Leg"] - j[FRENTE + "Foot"]
        qs = tc.quadril_sinal(j)
        txt.append("joelho E %.0f° D %.0f° | quadril E %.0f° D %.0f° (com sinal E %+.0f D %+.0f) | canela E %+.1f° | joelho E × ponta dos "
                   "dedos %+.0f mm | tornozelo (canela × pé) E %.0f D %.0f" % (
                       juntas["joelhoE"], juntas["joelhoD"], juntas["quadrilE"], juntas["quadrilD"], qs[0], qs[1],
                       math.degrees(math.atan2(-e[1], e[2])), tc.joelho_alem_dos_dedos(j)[0], *tc.tornozelo(j)))
        # centro de massa × apoio: o meio do pé esquerdo em cima do banco e o meio do pé direito no chão
        meio_E = geo["A_L"].y + (y_calc + (mtp0.y - tz0.y)) / 2
        meio_D = A0[TRAS].y + (y_calc + (mtp0.y - tz0.y)) / 2
        txt.append("centro de massa (corpo %.0f kg + halteres %.0f kg) y %+.4f z %.4f | × meio do pé esquerdo no banco %+.0f mm, × meio do "
                   "pé direito no chão %+.0f mm (− = à frente)" % (m, 2 * M_HALTER, cm.y, cm.z, (cm.y - meio_E) * 1000,
                                                                   (cm.y - meio_D) * 1000))
        hs = []
        fora_mao = np.where(_mascara(nomes_, dono_, lambda nm: not nm.startswith(("LeftHand", "RightHand"))))[0]
        for L, s in LADOS:
            M = halteres[L].matrix_world
            pts = np.concatenate([ck._amostras(*ck._avaliar_simples(o), 0.01) for o in ck._malhas(halteres[L])])
            mao = _mascara(nomes_, dono_, lambda nm, L=L: nm.startswith(L + "Hand"))
            _, an_mao = _sdf_halter(co_[mao], M)
            eixo_c, an_c = _sdf_halter(co_[fora_mao], M)
            dd = np.minimum(eixo_c, an_c)
            i = int(np.argmin(dd))
            hs.append("halter %s: × banco %+.0f mm, × corpo (fora as mãos) %+.1f mm (%s), × chão %.0f mm, mão × anilhas %+.1f mm" % (
                L[0], ao_banco(pts) * 1000, float(dd[i]) * 1000, nomes_[dono_[fora_mao[i]]], pts[:, 2].min() * 1000,
                float(an_mao.min()) * 1000))
        txt.append(" | ".join(hs))
        pol = {L: dedos[L].get("Thumb") for L, _ in LADOS}
        volta = {L: isinstance(p, tuple) and len(p) > 10 and p[0] == "volta" and p[10] for L, p in pol.items()}
        vao = {L: (p[8] if volta[L] else float("nan")) for L, p in pol.items()}
        txt.append("polegar em volta E %s D %s, × falange média E %.1f D %.1f mm | palma dentro %s | cotovelo E %.0f D %.0f" % (
            "sim" if volta["Left"] else "NÃO", "sim" if volta["Right"] else "NÃO", vao["Left"], vao["Right"],
            "/".join("%.0f" % v for v in tc.palma_dentro(j)), juntas["cotoveloE"], juntas["cotoveloD"]))
        return " | ".join(txt)

    for t in (0.0, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(halteres[L], raio=RAIO, meio_compr=PEGADA_H / 2)) for L, _ in LADOS]
    return Cena(pose, [halteres["Left"], halteres["Right"]], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.25, 0.9),
                camera_video=((3.9, -2.2, 1.35), (0, -0.25, 0.95), 50), info=info, apoios=[banco], afunda_apoio_mm=20)
