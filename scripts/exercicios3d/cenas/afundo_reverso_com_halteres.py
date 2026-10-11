# Afundo Reverso com Halteres — cena da fábrica 3D (lote 11, 11/10/2026; um dos 61 novos do scripts/conteudo/novos_61.json: 0 usos nos
# treinos prontos, 5 vezes como troca equivalente; "fonte_en": "Dumbbell Rear Lunge"). Sem peça nova: 2 halteres de 29 mm (e3.halter)
# pendurados ao lado do corpo, com a pegada neutra e o polegar novo (os da Subida no Banco com Halteres), e as pernas do Afundo com Barra
# com o passo pra TRÁS.
# É o afundo com passo pra trás ALTERNANDO as pernas, no molde da Rosca Alternada com Halteres (t = 0,5 no meio):
#   t = 0 embaixo com a perna direita atrás (coxa da frente paralela ao chão, joelho de trás quase encostando no chão — a mesma pose de
#   baixo do Afundo com Halteres e do Afundo com Barra) · sobe empurrando com a perna da frente e traz o pé direito de volta pro lado do
#   esquerdo · t = 0,5 em pé, os pés lado a lado · o pé esquerdo sai do chão (o calcanhar primeiro), anda pra trás no ar e pisa com a
#   PONTA lá atrás, o calcanhar levantado · desce até t = 1 embaixo com a perna esquerda atrás. O app toca 0 → 1 → 0: a direita sobe e
#   volta pro lado, a esquerda vai pra trás e desce; na volta a esquerda sobe e volta, a direita vai pra trás e desce — uma perna de cada
#   vez, com a parada em pé no meio, como na animação do ExRx.
#   Cada metade é a mesma repetição espelhada: pose(t) com t < 0,5 é o espelho da pose(1 − t) (fora os poucos mm da correção de altura de
#   cada pé na ponta).
# Por que alternando: é o das fontes do afundo reverso — ExRx, Dumbbell Rear Lunge: "Repeat movement with opposite legs alternating
# between sides." (e a animação alterna, com uma parada em pé entre uma perna e a outra); free-exercise-db, Dumbbell Rear Lunge (o
# "fonte_en"): "Now repeat with the opposite leg." logo depois de UMA repetição (o Barbell Lunge da mesma lista diz "Repeat the movement
# for the recommended amount of repetitions and then perform with the left leg." — por isso o Afundo com Barra é uma perna por série);
# ACE (Rohmann 2014, Reverse Lunge with a Shoulder Press): "Repeat this pattern for 10 to 12 repetitions, alternating legs.". A ACE (5047)
# aceita os 2 jeitos e a NSCA põe o alternado como a progressão mais difícil.
# Por que não é o Afundo com Halteres (os pés parados — "Completely Stationary", NSCA) nem o Afundo com Barra (passo à frente, o pé que
# anda pisa com o calcanhar e vira o da FRENTE): aqui o pé da frente NÃO sai do lugar; o que anda vai pra trás e vira o de TRÁS, pisando
# com a ponta (ExRx: "Plant forefoot far back on floor").
# Técnica (as frases das fontes, com a referência, ficam na ficha):
#   • em pé, ereto, um halter em cada mão com os braços esticados ao lado do corpo e as palmas viradas pras coxas (free-exercise-db:
#     "holding two dumbbells in your hands by your sides"; ExRx: "Stand with dumbbells grasped to sides."; ACE, Lunge com halteres: "palms
#     facing each other and the arms straight down by the side"), escápulas pra trás e pra baixo, olhando à frente (NSCA PTQ 4.4);
#   • pés na largura do quadril, pontas pra frente (NSCA: "The feet should be about hip-width apart." / "The toes and knees of both legs
#     should be pointing forward.");
#   • o passo pra trás: o joelho da frente já dobra enquanto o pé vai (ExRx: "Step back with one leg while bending supporting leg."), o
#     pé pisa com a ponta, longe (ExRx: "Plant forefoot far back on floor."; NSCA: "greater than a walking stride"; a passada do Afundo com
#     Halteres e do Afundo com Barra, ≈ o comprimento da perna — Song 2023), o calcanhar de trás levantado (NSCA: "The back heel should be
#     off the ground.") e a base dos dedos parada depois de pisar (NSCA: "The foot placement should be consistent throughout the lunge");
#   • desce até o joelho de trás quase encostar no chão (ExRx: "until knee of rear leg is almost in contact with floor"), os 2 joelhos a
#     ~90° (NSCA), o joelho da frente em cima do tornozelo, na direção do pé, sem passar da ponta (NSCA: "Make sure the front knee is
#     directly above the ankle and not over the toe."; free-exercise-db: "Make sure that you keep your front shin perpendicular to the
#     ground."; ExRx: "Forward knee should point same direction as foot throughout lunge.") — a canela da frente fica como nos outros 2
#     afundos (Comfort 2015: sem diferença de dorsiflexão nem de flexão do joelho entre o afundo pra frente e o pra trás) —, tronco ereto
#     (ExRx: "Keep torso upright during lunge"; free-exercise-db: "keeping the torso upright");
#   • volta empurrando com a perna da frente e trazendo a de trás pro lado dela (ExRx: "Return to original standing position by extending
#     hip and knee of forward supporting leg and return rear leg next to supporting leg."; NSCA: "Push through the front heel").
# Montagem:
#   - tempo: o exportador passa t com o ease seno; a cena desfaz o ease (u = acos(1 − 2t)/π, o tempo de verdade em fração da ida — o do
#     Afundo com Barra) e cada metade da ida tem a sua fase phi (0 em pé → 1 embaixo): u ≥ 0,5 → perna esquerda, phi = 2u − 1; u < 0,5 →
#     perna direita, phi = 1 − 2u. Em cada metade: parado em pé (phi < PHI_SOBE[0]), o calcanhar do pé que anda sobe girando na base dos
#     dedos (PHI_SOBE), a base dos dedos anda no ar e pisa lá atrás (PHI_PASSO) e o corpo desce até embaixo (phi = 1).
#   - pé que anda: a base dos dedos sobe até ALTURA_PASSO, passa lá no alto (PLATO) e só desce no fim, com velocidade vertical zero
#     quando pisa (o pé vai pelo ar e pisa, sem arrastar a ponta); anda pra trás saindo e chegando parada (Y_MEIO_PASSO). O pé vai de
#     THETA_SOBE a THETA_MEIO e THETA_PISA graus do chão (calcanhar pra cima, a ponta na frente pra pisar), num Bézier — explícito: preso
#     à canela ele realimentava (o pé empinava, o joelho dobrava, a canela deitava) e virava um chute pra trás —, e os dedos ficam na
#     linha do pé lá no alto e chapados no chão ao sair e ao pisar (presos à altura da base dos dedos). Pisou, a base dos dedos fica parada
#     e o calcanhar sobe até SOLA_BAIXO o que precisa pra o tornozelo ir do ângulo de quando pisa ao de baixo numa curva suave (sem o
#     calcanhar atrasar e o tornozelo dobrar demais no meio da descida). Cada pé na ponta sobe dz(th) pra a pele mais baixa ficar a
#     SOLA_ALVO_MM do chão (medido na montagem: a malha não é simétrica — o esquerdo afundava ~5 mm a mais). O pé da frente fica chapado
#     e parado a metade inteira.
#   - quadril: em pé, o centro de massa (corpo + halteres) em cima do meio do pé (o do Afundo com Barra e da Subida no Banco); no passo
#     ele vai FRACAO_PISA do caminho pra trás e desce até a perna de trás alcançar o chão lá atrás com o joelho a JOELHO_TRAS_PISA — na
#     metade do passo só QUADRIL_MEIO disso: o joelho da frente dobra junto e o corpo vai pra trás mais no fim, com o pé chegando —, e PARA
#     quando a ponta pisa; depois desce quase reto até embaixo (coxa da frente paralela e canela da frente a CANELA_BAIXO da vertical).
#     Curvas cúbicas monótonas (as do Afundo com Barra), velocidade zero em pé, quando pisa e embaixo.
#   - joelhos: cada um no plano vertical do próprio pé (joelho_no_plano_do_pe): o polo do IK vai pra frente do joelho calculado a cada
#     quadro, então o joelho aponta pro pé mesmo com o pé no ar.
#   - braços e halteres: os da Subida no Banco com Halteres — pendurados na vertical do mundo (ALFA, TETA; cotovelo e punho 6 cm pra fora:
#     o halter passa por fora da coxa com os pés lado a lado), em FK exato, o antebraço girado até a palma virar pra coxa; a mão fecha no
#     halter UMA vez (polegar novo dando a volta no pegador) e o halter vai junto com a mão: a pegada é a mesma em todos os quadros.
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from cena import Cena
from agachamento_sumo_com_halteres import joelho_no_plano_do_pe
from afundo_com_barra import curva

LADOS = (("Left", 1), ("Right", -1))
OUTRO = {"Left": "Right", "Right": "Left"}

# ── base e passo ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
X_PE = 0.14                # tornozelos a ±14 cm do meio: base de 28 cm, cada pé embaixo do seu quadril (a do Afundo com Halteres e do Afundo
                           # com Barra; NSCA: "The feet should be about hip-width apart"; ACE 319: "With the feet about hip-width apart")
PASSO = 0.828              # base dos dedos do pé de trás → tornozelo da frente (m): a passada do Afundo com Halteres e do Afundo com Barra
                           # (≈ o comprimento da perna, 0,86 m — Song 2023), que deixa a canela da frente quase vertical embaixo
JOELHO_CIMA = 6.0          # flexão dos joelhos em pé (graus): pernas esticadas sem travar
CANELA_BAIXO = 6.0         # canela da frente à frente da vertical embaixo (graus): a do Afundo com Halteres e do Afundo com Barra (Comfort
                           # 2015: a dorsiflexão não muda entre o afundo pra frente e o pra trás)
COXA_BAIXO = 0.0           # coxa da frente embaixo, graus abaixo da horizontal: paralela ao chão
SOLA_BAIXO = 81.5          # pé de trás × chão embaixo (graus): quase em pé, dedos dobrados no chão — 1,5° a mais que os 80 do Afundo com
                           # Halteres pra o tornozelo de trás ficar dentro dos 20° de dorsiflexão (Alazzawi 2017) também no pé esquerdo,
                           # que pisa uns 4 mm mais alto (a malha não é simétrica): com 80 ele dava 96,2°
INC = (2.0, 5.0, 7.0)      # tronco à frente da vertical (graus): em pé, quando o pé pisa e embaixo — ereto (ExRx: "Keep torso upright
                           # during lunge"); o Afundo com Barra vai de 2° a 7° e o Afundo com Halteres de 3° a 6°
PESCOCO = 0.8              # quanto a cabeça volta (fração da inclinação do tronco): olhando à frente (NSCA: "eyes looking forward")
RETRAI = 6.0               # escápulas pra trás (graus em volta do eixo do tronco; NSCA: "The scapula should be retracted and depressed")
M_HALTER = 10.0            # kg de cada halter (só entra no centro de massa da posição em pé)
DENSIDADE = 1000.0         # kg/m³: o volume da malha do boneco × isso = a massa do corpo (o do Afundo com Barra)

# ── o passo no tempo de uma metade (phi: 0 em pé → 1 embaixo) ──────────────────────────────────────────────────────────────────────
PHI_SOBE = (0.02, 0.11)    # o calcanhar do pé que anda sobe (o pé gira em volta da base dos dedos, que fica no chão)
PHI_PASSO = (0.11, 0.56)   # a base dos dedos anda no ar; no fim pisa lá atrás
THETA_SOBE = 20.0          # pé × chão quando os dedos saem do chão (graus, calcanhar pra cima): o do Afundo com Barra
THETA_MEIO = 35.0          # pé × chão no meio do passo (o calcanhar sobe um pouco mais no ar: a ponta vai na frente, pra pisar)
THETA_PISA = 40.0          # pé × chão quando a ponta pisa (graus, calcanhar pra cima; ExRx: "Plant forefoot far back on floor")
ALTURA_PASSO = 0.05        # a base dos dedos sobe até 5 cm acima do chão no ar
PLATO = (0.30, 0.70)       # ...em [0, PLATO[0]] do caminho no ar, fica no alto e desce em [PLATO[1], 1] (velocidade vertical zero quando
                           # pisa): o pé passa no ar e só desce pra pisar no fim, sem arrastar a ponta no chão
Y_MEIO_PASSO = 0.56        # fração do caminho pra trás que a base dos dedos já andou na metade do tempo do passo (sai e chega parada)
JOELHO_TRAS_PISA = 25.0    # joelho de trás quando a ponta pisa (graus): a perna chega lá atrás quase esticada, sem travar
FRACAO_PISA = 0.90         # quanto do caminho pra trás o quadril já andou quando a ponta pisa (daí desce quase reto até embaixo)
QUADRIL_MEIO = (0.30, 0.30)   # na metade do passo o quadril andou 30% do recuo e 30% da descida até a pisada: o joelho da frente
                           # dobra junto com o passo (ExRx: "Step back with one leg while bending supporting leg") e o corpo vai pra trás
                           # mais no fim, quando o pé já está chegando
SOLA_ALVO_MM = 1.0         # pé na ponta: a pele mais baixa do pé fica 1 mm acima do chão (cada pé medido: a malha não é simétrica)

# ── braços e halteres (os da Subida no Banco com Halteres) ────────────────────────────────────────────────────────────────────────
ALFA = 3.0                 # braço (ombro → cotovelo) à frente da vertical do MUNDO (o halter pende pra baixo), graus
TETA = 8.0                 # antebraço (cotovelo → punho) à frente da vertical, graus: cotovelo estendido, sem travar
LARG_COT = 0.06            # cotovelo 6 cm pra fora do ombro e punho 6 cm pra fora do cotovelo (ângulo de carregamento): com os pés lado a
FORA_PUNHO = 0.06          # lado, o halter passa por fora da coxa (a medida da Subida no Banco com Halteres: 12 mm de folga em pé)
RAIO = 0.0145              # pegador do halter: 29 mm, o cilindro da mão de referência (sem usar_cilindro)
PEGADA_H = 0.13            # pegador entre as anilhas (m)
RAIO_ANILHA = 0.055
LARG_ANILHA = 0.05         # a do e3.halter() padrão


def _ss(x):
    """Rampa suave 0 → 1 (smoothstep) com x preso em [0, 1]."""
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def _fase(u, faixa):
    """0 → 1 dentro da faixa [u0, u1], preso nas pontas."""
    return max(0.0, min(1.0, (u - faixa[0]) / (faixa[1] - faixa[0])))


def tempo_real(t):
    """O t do exportador vem com o ease seno (p3.suave); u é o tempo de verdade, em fração da ida (o do Afundo com Barra)."""
    return math.acos(max(-1.0, min(1.0, 1.0 - 2.0 * t))) / math.pi


def metade(u):
    """Perna que anda e a fase phi (0 em pé → 1 embaixo) no instante u da ida: a direita na 1ª metade (vem de baixo e sobe), a esquerda
    na 2ª (vai pra trás e desce)."""
    if u >= 0.5:
        return "Left", 2.0 * u - 1.0
    return "Right", 1.0 - 2.0 * u


def _pele(bon, niveis=1):
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, niveis)
    return co, tri, nomes, dono


def _mascara(nomes, dono, pred):
    return np.array([bool(pred(n)) for n in nomes] + [False])[dono]


def _sdf_halter(P, M):
    """Distância com sinal (m, − = dentro) dos pontos P (N×3) até o halter (pegador + 2 anilhas: 3 cilindros), com a matriz de mundo M
    da raiz (eixo local X); devolve (pegador, anilhas) — a conta da Subida no Banco com Halteres."""
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
    y_calc = float(V_pe[:, 1].max())                            # fundo do calcanhar × tornozelo (+ = atrás)
    i_calc = {}                                                 # o vértice do calcanhar de cada pé (o mais de trás da sola)
    for L, _ in LADOS:
        pe = np.where(_mascara(nomes, dono, lambda nm, L=L: nm in (L + "Foot", L + "ToeBase")))[0]
        bx = pe[co[pe, 2] < sola_z + 0.004]
        i_calc[L] = int(bx[np.argmax(co[bx, 1])])

    # ── pés: em pé chapados lado a lado (x = ±X_PE); o de trás pisa com a base dos dedos PASSO atrás do tornozelo da frente ─────────────
    def espelho(v):
        return Vector((-v.x, v.y, v.z))

    VPE = {"Left": v_pe.copy(), "Right": espelho(v_pe)}         # base dos dedos → tornozelo de cada pé (chapado)
    A0 = {"Left": Vector((X_PE, tz0.y, tz0.z)), "Right": Vector((-X_PE, tz0.y, tz0.z))}   # tornozelos em pé (o da frente fica aí)
    MTP0 = {L: A0[L] - VPE[L] for L in A0}                      # base dos dedos em pé
    MTP_C = {L: Vector((MTP0[L].x, tz0.y + PASSO, MTP0[L].z)) for L in A0}   # onde a base dos dedos pisa lá atrás

    def tornozelo_na_ponta(mtp, th, v):
        """Tornozelo do pé apoiado na base dos dedos `mtp`, com o pé th graus do chão (calcanhar pra cima); v = base dos dedos →
        tornozelo do pé chapado."""
        return mtp + p3.rot_x(th) @ v

    # pé na ponta: a base dos dedos sobe dz[L](th) pra a pele mais baixa do pé ficar a SOLA_ALVO_MM do chão (medido mais abaixo, em cada
    # pé — o esquerdo afunda uns 5 mm a mais que o direito com o calcanhar levantado); zero até medir
    dz = {L: (lambda th: 0.0) for L in A0}

    def bola(L, mtp, th):
        """Base dos dedos do pé L apoiada em `mtp` com o pé a th graus do chão (já com a correção de altura do pé)."""
        return mtp + Vector((0.0, 0.0, dz[L](th)))

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

    geo = {}                                                    # o que sai das contas abaixo (sola depois de pisar)
    fy_passo = curva([0.0, 0.5, 1.0], [0.0, Y_MEIO_PASSO, 1.0])   # fração do caminho pra trás no tempo do passo (sai e chega parada)
    C_TH = 2 * THETA_MEIO - (THETA_SOBE + THETA_PISA) / 2         # controle do Bézier do pé no ar (th na metade = THETA_MEIO)

    def pe_andando(W, phi):
        """Pé W (o que anda) na fase phi: (tornozelo, pé × chão em graus — + = calcanhar pra cima —, dedos × chão, fase, base dos dedos)."""
        if phi <= PHI_PASSO[0]:                                  # em pé / calcanhar subindo, dedos no chão
            th = THETA_SOBE * _ss(_fase(phi, PHI_SOBE))
            B = bola(W, MTP0[W], th)
            return tornozelo_na_ponta(B, th, VPE[W]), th, 0.0, ("calcanhar sobe" if th > 0 else "em pé"), B
        if phi < PHI_PASSO[1]:                                   # no ar
            lam = _fase(phi, PHI_PASSO)
            if lam <= PLATO[0]:
                h = _ss(lam / PLATO[0])
            elif lam <= PLATO[1]:
                h = 1.0
            else:
                h = 1.0 - _ss((lam - PLATO[1]) / (1.0 - PLATO[1]))
            B0, B1 = bola(W, MTP0[W], THETA_SOBE), bola(W, MTP_C[W], THETA_PISA)
            B = Vector((B0.x, B0.y + (B1.y - B0.y) * fy_passo(lam), B0.z + (B1.z - B0.z) * lam + ALTURA_PASSO * h))
            th = (1 - lam) ** 2 * THETA_SOBE + 2 * lam * (1 - lam) * C_TH + lam ** 2 * THETA_PISA
            dedos = th * h                                       # na linha do pé lá no alto; chapados ao sair e ao pisar
            return tornozelo_na_ponta(B, th, VPE[W]), th, dedos, "no ar %.2f" % lam, B
        th = geo["sola"](phi) if "sola" in geo else SOLA_BAIXO   # pisou: a base dos dedos parada, o calcanhar subindo
        B = bola(W, MTP_C[W], th)
        return tornozelo_na_ponta(B, th, VPE[W]), th, 0.0, "na ponta", B

    def pes(u, Hs):
        """Pés no instante u: posiciona os alvos do IK e o giro de cada pé; devolve (perna que anda, phi, {L: (tornozelo, pé × chão,
        fase)})."""
        W, phi = metade(u)
        F = OUTRO[W]
        A, th, dedos, fase, B = pe_andando(W, phi)
        alvos[W].location = A
        rot_pe[W].matrix_world = p3.rot_x(th).to_4x4() @ M_pe[W]
        rot_dedos[W].matrix_world = p3.rot_x(dedos).to_4x4() @ M_dedos[W]
        alvos[F].location = A0[F]                                # o da frente: chapado e parado
        rot_pe[F].matrix_world = M_pe[F].copy()
        rot_dedos[F].matrix_world = M_dedos[F].copy()
        return W, phi, {W: (A.copy(), th, fase, B.copy()), F: (A0[F].copy(), 0.0, "frente", MTP0[F].copy())}

    estado = {}

    def corpo(u, y, z, inc):
        """Pés, pelve e tronco (giram juntos: coluna neutra) com o meio das articulações do quadril em (0, y, z), joelhos (IK com o polo
        na frente do joelho calculado) e a cabeça olhando à frente."""
        for nome in ("Hips", "Neck", "Head"):
            PB[p3.P + nome].matrix_basis = Matrix()
        Hs = quadris(y, z)
        W, phi, P = pes(u, Hs)
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
        estado.update(u=u, W=W, phi=phi, y=y, z=z, inc=inc, K=K, pes=P)

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

    # ── embaixo (perna direita atrás, t = 0): coxa da frente paralela ao chão e canela da frente a CANELA_BAIXO da vertical (o y e o z
    #    do quadril saem das 2 condições — a conta do Afundo com Barra); a esquerda atrás (t = 1) é o espelho ───────────────────────────
    def coxa_canela(y, z, F="Left"):
        H = quadris(y, z)[F]
        Kj = joelho(F, H, A0[F])[0]
        d = Kj - H
        e = Kj - A0[F]
        return math.degrees(math.atan2(-d.z, math.hypot(d.x, d.y))), math.degrees(math.atan2(-e.y, e.z))

    def z_paralela(y):
        return bissecao(lambda z: coxa_canela(y, z)[0], 0.35, 0.75, COXA_BAIXO)

    y_b = bissecao(lambda y: coxa_canela(y, z_paralela(y))[1], A0["Left"].y + 0.25, A0["Left"].y + 0.50, CANELA_BAIXO)
    z_b = z_paralela(y_b)
    corpo(0.0, y_b, z_b, INC[2])
    for L, _ in LADOS:                 # polo certo dos joelhos (pole_angle em 0,5°, o joelho no lugar calculado), embaixo
        e = p3.acertar_polo(rig, pernas[L], L + "Leg", L + "UpLeg", L + "Foot")
        melhor = (1e9, None)
        for k in range(-10, 11):
            ang = e[1] + k * 0.5
            pernas[L].pole_angle = math.radians(ang)
            p3.atualizar()
            melhor = min(melhor, ((c(L + "Leg") - estado["K"][L][0]).length, ang))
        pernas[L].pole_angle = math.radians(melhor[1])
        p3.atualizar()
        print("polo joelho %s %.1f° | joelho a %.1f mm do alvo (embaixo, perna direita atrás)" % (L, melhor[1], melhor[0] * 1000),
              flush=True)
    corpo(1.0, y_b, z_b, INC[2])       # o espelho: os 2 joelhos no lugar com o mesmo polo?
    print("embaixo com a esquerda atrás: joelho E a %.1f mm, D a %.1f mm do alvo" % tuple(
        (c(L + "Leg") - estado["K"][L][0]).length * 1000 for L in ("Left", "Right")), flush=True)

    # ── em pé (pés chapados lado a lado): joelhos a JOELHO_CIMA ───────────────────────────────────────────────────────────────────────
    z_em_pe = lambda y: bissecao(lambda z: flexao(quadris(y, z)["Right"], A0["Right"]), 0.75, 0.99, JOELHO_CIMA)
    y0 = meio0.y
    z0 = z_em_pe(y0)
    corpo(0.5, y0, z0, INC[0])
    if RETRAI:                         # escápulas pra trás (o corpo() não mexe no osso Shoulder: fica assim em todos os quadros)
        cima = (c("Neck") - c("Hips")).normalized()
        for L, s in LADOS:
            p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * RETRAI), 3, cima))

    # ── braços pendurados na vertical do mundo, em FK exato (os da Subida no Banco com Halteres): uma referência com o cotovelo dobrado
    #    (IK uma vez só) e, a cada quadro, o braço gira em volta do ombro até o cotovelo cair em E e o antebraço dobra como dobradiça até
    #    o punho cair em W; depois gira em volta do próprio eixo até a palma virar pra coxa. A mão fecha no halter uma vez ──────────────
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
        Wp = E + Vector((dx, -math.sin(te) * rho, -math.cos(te) * rho))
        return S, E, Wp

    REF_COT = 60.0                                              # antebraço da referência, graus à frente da vertical
    ref = {}
    for L, s in LADOS:
        S, E, Wp = alvos_braco(L, s, REF_COT)
        iks_b[L].mute = False
        punhos[L].location = Wp
        eixo = (Wp - S).normalized()
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

    def braco_fk(L, E, Wp):
        """Braço L com o cotovelo em E e o punho em Wp, exato (gira a referência em volta do ombro e dobra o antebraço na dobradiça)."""
        r = ref[L]
        S = c(L + "Arm")
        u = (E - S).normalized()
        f = (Wp - E).normalized()
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

    # ── em pé: o quadril vai pra frente/trás até o centro de massa (corpo + halteres) ficar em cima do meio do pé (entre o fundo do
    #    calcanhar e a base dos dedos, como no Afundo com Barra e na Subida no Banco) ──────────────────────────────────────────────────
    Y_MEIO_PE = (tz0.y + y_calc + mtp0.y) / 2

    def erro_em_pe(y):
        corpo(0.5, y, z_em_pe(y), INC[0])
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

    # ── quando a ponta pisa: o quadril andou FRACAO_PISA do caminho pra trás e está na altura em que a perna de trás alcança o chão com o
    #    joelho a JOELHO_TRAS_PISA (pé a THETA_PISA); aí ele PARA (velocidade zero) e desce quase reto até embaixo ──────────────────────
    def a_pisa(L):
        return tornozelo_na_ponta(bola(L, MTP_C[L], THETA_PISA), THETA_PISA, VPE[L])

    y_p = y0 + (y_b - y0) * FRACAO_PISA
    z_p = bissecao(lambda z: flexao(quadris(y_p, z)["Right"], a_pisa("Right")), 0.55, 0.95, JOELHO_TRAS_PISA)
    phi_m = (PHI_PASSO[0] + PHI_PASSO[1]) / 2
    fy1 = curva([0.0, PHI_PASSO[0], phi_m, PHI_PASSO[1]], [y0, y0, y0 + (y_p - y0) * QUADRIL_MEIO[0], y_p])
    fz1 = curva([0.0, PHI_PASSO[0], phi_m, PHI_PASSO[1]], [z0, z0, z0 + (z_p - z0) * QUADRIL_MEIO[1], z_p])
    fy2, fz2 = curva([PHI_PASSO[1], 1.0], [y_p, y_b]), curva([PHI_PASSO[1], 1.0], [z_p, z_b])
    fy = lambda phi: fy1(phi) if phi <= PHI_PASSO[1] else fy2(phi)
    fz = lambda phi: fz1(phi) if phi <= PHI_PASSO[1] else fz2(phi)
    finc = curva([0.0, PHI_PASSO[0], PHI_PASSO[1], 1.0], [INC[0], INC[0], INC[1], INC[2]])

    def tornozelo_ang(L, phi, th):
        """Ângulo canela × pé do pé L na ponta lá atrás (a medida tc.tornozelo: joelho → tornozelo × tornozelo → base dos dedos)."""
        B = bola(L, MTP_C[L], th)
        A = tornozelo_na_ponta(B, th, VPE[L])
        K = joelho(L, quadris(fy(phi), fz(phi))[L], A)[0]
        return math.degrees((A - K).angle(B - A))

    def montar_sola():
        """Sola do pé de trás depois de pisar: o calcanhar sobe o que precisa pra o tornozelo ir do ângulo de quando pisa ao de baixo
        (sola a SOLA_BAIXO) numa curva suave — sem o calcanhar atrasar e o tornozelo dobrar além do de baixo no meio da descida —; o
        calcanhar só sobe."""
        a0, a1 = tornozelo_ang("Right", PHI_PASSO[1], THETA_PISA), tornozelo_ang("Right", 1.0, SOLA_BAIXO)
        us_, vs_ = [], []
        for k in range(51):
            phi = PHI_PASSO[1] + (1.0 - PHI_PASSO[1]) * k / 50
            alvo = a0 + (a1 - a0) * _ss(k / 50)
            # o tornozelo fecha conforme o calcanhar sobe (com menos que THETA_PISA a perna não alcança: a conta não vale)
            if tornozelo_ang("Right", phi, THETA_PISA) <= alvo:
                th = THETA_PISA
            else:
                th = bissecao(lambda a: tornozelo_ang("Right", phi, a), THETA_PISA, 89.0, alvo)
            us_.append(phi)
            vs_.append(max(th, vs_[-1]) if vs_ else th)
        vs_[0], vs_[-1] = THETA_PISA, SOLA_BAIXO
        geo["sola"] = curva(us_, vs_)
        return a0, a1

    def medir_dz():
        """Pele mais baixa de cada pé na ponta (calcanhar subindo em pé e depois de pisar lá atrás) e a correção dz[L](th) que a deixa a
        SOLA_ALVO_MM do chão; devolve o pior desvio (mm) de antes da correção."""
        pior = 0.0
        for L, s in LADOS:
            amostras = [(PHI_SOBE[0] + (PHI_PASSO[0] - PHI_SOBE[0]) * k / 4) for k in range(1, 5)]
            amostras += [PHI_PASSO[1] + (1.0 - PHI_PASSO[1]) * k / 12 for k in range(13)]
            ths, corr = [], []
            for phi in amostras:
                u = (1.0 + phi) / 2 if L == "Left" else (1.0 - phi) / 2
                corpo(u, fy(phi), fz(phi), finc(phi))
                co_, _, nomes_, dono_ = _pele(bon, 1)
                baixo = float(co_[_mascara(nomes_, dono_, lambda nm, L=L: nm in (L + "Foot", L + "ToeBase")), 2].min())
                th = estado["pes"][L][1]
                ths.append(th)
                corr.append(dz[L](th) + SOLA_ALVO_MM / 1000 - baixo)
                pior = max(pior, abs(SOLA_ALVO_MM / 1000 - baixo) * 1000)
            ordem = np.argsort(ths)
            ths_o, corr_o = list(np.array(ths)[ordem]), list(np.array(corr)[ordem])
            dz[L] = (lambda th, a=ths_o, b=corr_o: float(np.interp(th, a, b)) * _ss(th / 10.0))
            print("pé %s na ponta: correção de altura %s" % (L[0], " ".join("%.0f°:%+.1f" % (a, b * 1000) for a, b in zip(ths_o, corr_o))),
                  flush=True)
        return pior

    montar_sola()
    for volta in range(2):             # mede, corrige, refaz a sola com a correção e confere
        print("pé na ponta, volta %d: pior desvio da pele mais baixa %.1f mm" % (volta, medir_dz()), flush=True)
        a_pisa_ang, a_baixo_ang = montar_sola()
    k_pisa = {L: flexao(quadris(y_p, z_p)[L], a_pisa(L)) for L, _ in LADOS}
    print("AFUNDO REVERSO quadril (meio): em pé y %+.4f z %.4f | pisa y %+.4f z %.4f | embaixo y %+.4f z %.4f | base dos dedos de trás "
          "pisa em y %+.4f | quando pisa: joelho de trás E %.1f° D %.1f°, joelho da frente %.1f°, canela da frente %+.1f° | tornozelo de "
          "trás (canela × pé) pisa %.1f → embaixo %.1f" % (
              y0, z0, y_p, z_p, y_b, z_b, MTP_C["Right"].y, k_pisa["Left"], k_pisa["Right"], flexao(quadris(y_p, z_p)["Left"], A0["Left"]),
              canela("Left", quadris(y_p, z_p)["Left"], A0["Left"]), a_pisa_ang, a_baixo_ang), flush=True)

    def pose(t):
        """t=0 embaixo com a perna direita atrás, t=0,5 em pé (pés lado a lado), t=1 embaixo com a esquerda atrás."""
        u = tempo_real(t)
        phi = metade(u)[1]
        corpo(u, fy(phi), fz(phi), finc(phi))
        bracos()
        estado["t"] = t

    pose.estado = estado
    pose.geo = geo

    # ── medidas à parte (a checagem não vê): pés parados sem escorregar, pé no ar × chão, joelho de trás × chão, centro de massa × pé da
    #    frente, halter × corpo e × chão, mão × anilhas, polegar ────────────────────────────────────────────────────────────────────────
    def plantado(L, W, phi):
        """(osso, onde ele fica parado) do pé L nesse instante, ou None se está andando no ar."""
        if L != W:
            return "Foot", A0[L]
        if phi <= PHI_PASSO[0]:
            return "ToeBase", MTP0[L]
        if phi >= PHI_PASSO[1]:
            return "ToeBase", MTP_C[L]
        return None

    def info():
        u, W, phi = estado.get("u", 0.5), estado.get("W", "Left"), estado.get("phi", 0.0)
        F = OUTRO[W]
        co_, _, nomes_, dono_ = _pele(bon, 1)
        j = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        cm, cc, m = centro_de_massa()
        P = estado.get("pes", {})
        txt = ["u %.3f anda %s phi %.3f (%s) | tronco %.1f° | quadril y %+.4f z %.4f" % (
            u, W[0], phi, P.get(W, (0, 0, "?"))[2], estado.get("inc", 0), estado.get("y", 0), estado.get("z", 0))]
        partes = []
        for L, s in LADOS:
            pe = _mascara(nomes_, dono_, lambda nm, L=L: nm in (L + "Foot", L + "ToeBase"))
            dd = _mascara(nomes_, dono_, lambda nm, L=L: nm == L + "ToeBase")
            A_real = Vector(j[L + "Foot"])
            pl = plantado(L, W, phi)
            escorrega = "%.2f (%s)" % ((Vector(j[L + pl[0]]) - pl[1]).xy.length * 1000, pl[0]) if pl else "-"
            partes.append("pé %s: mais baixo %+.1f mm, calcanhar %+.1f, dedos %+.1f | tornozelo × alvo %.1f mm | parado × onde fica (xy) "
                          "%s mm" % (L[0], co_[pe, 2].min() * 1000, co_[i_calc[L], 2] * 1000, co_[dd, 2].min() * 1000,
                                     (A_real - alvos[L].location).length * 1000, escorrega))
        txt.append(" | ".join(partes))
        perna_t = _mascara(nomes_, dono_, lambda nm: nm in (W + "Leg", W + "UpLeg"))
        Pk = co_[perna_t]
        Pk = Pk[np.linalg.norm(Pk - np.array(j[W + "Leg"]), axis=1) < 0.09]
        e = j[F + "Leg"] - j[F + "Foot"]
        k_alem = tc.joelho_alem_dos_dedos(j)
        txt.append("joelho E %.0f° D %.0f° | quadril E %.0f° D %.0f° | joelho de trás (%s): pele a %.0f mm do chão (centro %.0f) | canela da "
                   "frente %+.1f° | joelho da frente × ponta dos dedos %+.0f mm | tornozelo (canela × pé) E %.1f D %.1f" % (
                       juntas["joelhoE"], juntas["joelhoD"], juntas["quadrilE"], juntas["quadrilD"], W[0], Pk[:, 2].min() * 1000,
                       j[W + "Leg"][2] * 1000, math.degrees(math.atan2(-e[1], e[2])), k_alem[0 if F == "Left" else 1],
                       *tc.tornozelo(j)))
        # centro de massa × pé da frente (o fundo do calcanhar e a base dos dedos dele) e × a base dos dedos de trás (− = à frente)
        calc_f = A0[F].y + y_calc
        txt.append("centro de massa (corpo %.0f kg + halteres %.0f kg) y %+.4f z %.4f | × calcanhar da frente %+.0f mm, × base dos dedos da "
                   "frente %+.0f mm, × base dos dedos de trás %+.0f mm (+ = atrás)" % (
                       m, 2 * M_HALTER, cm.y, cm.z, (cm.y - calc_f) * 1000, (cm.y - MTP0[F].y) * 1000, (cm.y - MTP_C[W].y) * 1000))
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
            hs.append("halter %s: × corpo (fora as mãos) %+.1f mm (%s), × chão %.0f mm, mão × anilhas %+.1f mm" % (
                L[0], float(dd[i]) * 1000, nomes_[dono_[fora_mao[i]]], pts[:, 2].min() * 1000, float(an_mao.min()) * 1000))
        txt.append(" | ".join(hs))
        pol = {L: dedos[L].get("Thumb") for L, _ in LADOS}
        volta = {L: isinstance(p, tuple) and len(p) > 10 and p[0] == "volta" and p[10] for L, p in pol.items()}
        vao = {L: (p[8] if volta[L] else float("nan")) for L, p in pol.items()}
        txt.append("polegar em volta E %s D %s, × falange média E %.1f D %.1f mm | palma dentro %s | cotovelo E %.0f D %.0f" % (
            "sim" if volta["Left"] else "NÃO", "sim" if volta["Right"] else "NÃO", vao["Left"], vao["Right"],
            "/".join("%.0f" % v for v in tc.palma_dentro(j)), juntas["cotoveloE"], juntas["cotoveloD"]))
        return " | ".join(txt)

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(halteres[L], raio=RAIO, meio_compr=PEGADA_H / 2)) for L, _ in LADOS]
    return Cena(pose, [halteres["Left"], halteres["Right"]], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, 0.25, 0.75),
                camera_video=((4.2, -2.1, 1.0), (0, 0.30, 0.72), 50), info=info)
