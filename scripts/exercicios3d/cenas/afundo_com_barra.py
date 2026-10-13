# Afundo com Barra — cena da fábrica 3D (lote 11, 11/10/2026; um dos 61 novos do scripts/conteudo/novos_61.json: 0 usos nos treinos
# prontos, 5 vezes como troca equivalente; "fonte_en": "Barbell Lunge"). Sem peça nova: a barra nas costas do Agachamento Sumô com
# Barra (e3.barra, eixo de 29 mm, apoiada em cima do trapézio) e as pernas do Afundo com Halteres.
# É o afundo COM PASSO (forward lunge "with a stride"), uma perna só por série:
#   t = 0 em pé, a barra nas costas e os pés lado a lado na largura do quadril · o pé esquerdo sai do chão (o calcanhar primeiro), anda
#   pra frente no ar e pisa com o calcanhar, depois a ponta · o corpo desce dobrando os 2 joelhos, o quadril descendo reto e o tronco
#   ereto, até t = 1 embaixo (coxa da frente paralela ao chão, joelho de trás quase encostando no chão). O app faz a volta (a ida ao
#   contrário): sobe empurrando com a perna da frente e traz o pé de volta pro lado do outro — a repetição inteira.
# Por que uma perna só: é o da free-exercise-db, Barbell Lunge (o "fonte_en" do catálogo): "Repeat the movement for the recommended
# amount of repetitions and then perform with the left leg."; a NSCA (PTQ 4.4) põe o afundo alternado como progressão mais difícil
# ("Alternating lunges that require an opposite step forward for each repetition are more challenging") e no Escamilla 2025 cada série
# foi com o mesmo pé. A repetição em si é a mesma quando a série alterna (ExRx e ACE alternam: o app mostraria a mesma coisa).
# Por que não é o Afundo com Halteres: aquele é o estacionário (os pés parados — a NSCA o põe como a versão mais FÁCIL, "Completely
# Stationary"); este é o tradicional com passo (Escamilla 2025: "participants step forward with one limb and then lower the body [...]
# an immediately push backward with the lead limb returns the individual to the standing starting position. This is referred to as
# lunging with stride.").
# Técnica (as frases das fontes, com a referência, ficam na ficha):
#   • a barra apoiada em cima do trapézio, atrás do pescoço, pegada fechada e pronada, mãos por fora dos ombros, peito alto e escápulas
#     juntas (ACE, Forward Lunge com barra; free-exercise-db; ExRx; Achievable/CSCS "closed, pronated grip");
#   • começa em pé com os pés paralelos na largura do quadril (ACE: "Place both feet so that they are about hip-width apart, and step
#     forward with the right leg"; Achievable: "Step under the bar with the feet parallel.");
#   • o passo: "Lunge forward with first leg. Land on heel, then forefoot." (ExRx); "The raised (swing) leg should initiate contact with
#     a heel strike first" (ACE, Forward Lunge); "Plant the lead foot flat, pointing straight ahead" (Achievable); passo longo, maior que
#     uma passada (NSCA: "greater than a walking stride"; Achievable: "Take one exaggerated step forward") — a canela da frente fica quase
#     vertical embaixo (Escamilla 2025, passo longo: "the right leg (tibia) to maintain an approximate vertical position at the lunge
#     lowest position"); o pé de trás fica parado (ACE: "try not to move the stance (supporting) foot") e o calcanhar dele sobe;
#   • desce até o joelho de trás quase encostar no chão (ExRx: "until knee of rear leg is almost in contact with floor"; ACE: "Lower the
#     left knee almost to the floor without touching the ground"), os 2 joelhos a ~90° (NSCA), o quadril descendo reto (NSCA: "the hips
#     should move down and up in a straight line"; ACE: "focus more on dropping your hips towards the floor rather than driving your
#     hips forward"), o joelho da frente em cima do tornozelo, na direção do pé, sem passar da ponta (NSCA; ExRx; free-exercise-db),
#     tronco ereto (ExRx: "Keep torso upright during lunge"; free-exercise-db: "keeping the torso upright");
#   • volta empurrando com a perna da frente até ficar com os pés lado a lado (ExRx: "Return to original standing position by forcibly
#     extending hip and knee of forward leg"; free-exercise-db: "Using mainly the heel of your foot, push up and go back to the starting
#     position"; Escamilla 2025: "returned to the erect standing position with the feet positioned together").
# Montagem:
#   - tempo: o exportador passa t com o ease seno; a cena desfaz o ease (u = acos(1 − 2t)/π, o tempo de verdade em fração da ida) e põe
#     cada fase no tempo dela: o calcanhar da frente sobe (U_SOBE), o pé anda no ar (U_PASSO) e pisa com o calcanhar (fim do U_PASSO), a
#     ponta desce até o pé ficar chapado (U_CHAPA) e o corpo desce até embaixo (u = 1). O pé anda ~0,9 m no ar: o passo leva ~1,2 s (ida
#     de 3 s, 48 quadros) pra nenhum osso passar de 80 mm por quadro (ck.SALTO_MM; o pior é a base dos dedos da frente, ~77 mm) —
#     devagar e controlado (ACE: "slowly lift one foot off the floor" / "slowly transferring your body weight into the leading (forward)
#     foot").
#   - pés: o de trás (direito) fica parado; o calcanhar dele sobe girando em volta da base dos dedos (como no Afundo com Halteres), o
#     quanto precisa pra o joelho de trás seguir quase esticado no passo (sem passar de esticado) e depois até 80° embaixo; o da frente
#     (esquerdo) gira em volta da base dos dedos (calcanhar sobe THETA_SOBE), sai do chão subindo, anda num arco (o tornozelo sobe até
#     ALTURA_PASSO acima da reta) seguindo a canela (o tornozelo perto do neutro no ar), pisa com o calcanhar (pé a THETA_PISA graus do
#     chão, ainda andando um pouco: V_PISA) e gira em volta do calcanhar até chapar; daí fica parado, PASSO à frente da base dos dedos do
#     de trás (a passada do Afundo com Halteres).
#   - quadril: anda pra frente quase todo antes de o pé pisar (a perna da frente só alcança o chão lá na frente com o quadril em cima
#     do meio do passo) e desce um pouco (o joelho de trás dobra de leve — Achievable: "allowing the trailing knee to flex slightly");
#     pisou, desce quase reto até embaixo. Em pé, o quadril fica onde o centro de massa (corpo + barra) cai em cima do meio do pé (o
#     Agachamento Sumô com Barra); embaixo, a coxa da frente paralela e a canela da frente a CANELA_BAIXO graus da vertical. As curvas no
#     tempo são cúbicas monótonas (sem passar dos pontos) com velocidade zero em t = 0 e t = 1 (onde o app volta).
#   - joelhos: cada um no plano vertical do próprio pé (joelho_no_plano_do_pe, do Agachamento Sumô com Halteres): o polo do IK vai pra
#     frente do joelho calculado a cada quadro, então o joelho aponta pro pé mesmo com o pé no ar.
#   - barra e mãos: rígidas com o tronco (BARRA_NO_TRAPEZIO a partir da base do pescoço, a do Agachamento Sumô com Barra), com as
#     escápulas pra trás (RETRAI), os braços e as mãos postos UMA vez no montar() com o polegar novo na postura fixa POLEGAR_VOLTA do
#     Agachamento no Smith: a pegada é a mesma em todos os quadros e nada escorrega.
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from maos3d import Maos
from cena import Cena
from agachamento_sumo_com_halteres import joelho_no_plano_do_pe
from agachamento_no_smith import POLEGAR_VOLTA, _polegar_nos_angulos
from agachamento_sumo_com_barra import sdf_barra, polegar_nos_dedos

FRENTE, TRAS = "Left", "Right"     # a perna esquerda dá o passo; a direita fica parada atrás
LADOS = (("Left", 1), ("Right", -1))

# ── barra nas costas: a do Agachamento Sumô com Barra (lote 8), com a mesma barra (as medidas do sdf_barra dele) ────────────────────
RAIO_BARRA = 0.0145        # eixo de 29 mm (o da e3.barra): a mão padrão, sem usar_cilindro
R_ANILHA = 0.225           # anilha de 45 cm (a das anilhas de para-choque de 10 e de 20 kg)
MEIA_TRAVAS = 0.66         # e3.barra(pegada=1.32), como em todas as cenas com barra
M_BARRA = 40.0             # kg: barra de 20 kg + uma anilha de 10 kg de cada lado (a carga de ~12 repetições de quem treina: no
                           # Escamilla 2025 os homens usaram 46 ± 10 kg nos 2 halteres) — só entra no centro de massa
BARRA_NO_TRAPEZIO = Vector((0.0, 0.075, -0.041))   # centro da barra a partir da base do pescoço, no referencial do tronco (o do Sumô)
GRIP_X = 0.43              # meio da mão a 43 cm do meio da barra (o do Agachamento Livre e do Sumô com Barra)
DEDOS_Q = Vector((0.0, 0.12, 1.0)).normalized()    # (tronco) dedos pra cima, um pouco pra trás: a mão atrás da barra
PALMA_Q = Vector((0.0, -1.0, 0.12)).normalized()   # (tronco) palma pra frente, de frente pra barra
ALINHA = 0.15              # quanto os dedos seguem o antebraço (a mão do Agachamento no Smith, onde a POLEGAR_VOLTA foi achada)
POLO_COTOVELO = Vector((0.30, 0.35, -0.40))         # (tronco, a partir do ombro; x pra fora) cotovelos pra baixo, pra trás e pra fora
RETRAI = 8.0               # escápulas pra trás (graus em volta do eixo do tronco; ACE: "squeeze the shoulder blades together")
DENSIDADE = 1000.0         # kg/m³: o volume da malha do boneco × isso = a massa do corpo pro centro de massa (o do Sumô)

# ── base e passo ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
X_PE = 0.14                # tornozelos a ±14 cm do meio: base de 28 cm, cada pé embaixo do seu quadril (a do Afundo com Halteres; NSCA:
                           # "The feet should be about hip-width apart"; ACE: "about hip-width apart") — em pé e no passo
PASSO = 0.828              # base dos dedos do pé de trás → tornozelo da frente (m): a passada do Afundo com Halteres (≈ o comprimento
                           # da perna, 0,86 m — Song 2023), que deixa a canela da frente quase vertical embaixo (Escamilla 2025)
JOELHO_CIMA = 6.0          # flexão dos joelhos em pé (graus): pernas esticadas sem travar
CANELA_BAIXO = 6.0         # canela da frente à frente da vertical embaixo (graus): quase vertical, com a leve inclinação do ACE ("your
                           # tibia (shinbone) is in a slight forward lean") — a do Afundo com Halteres (+6°)
COXA_BAIXO = 0.0           # coxa da frente embaixo, graus abaixo da horizontal: paralela ao chão
SOLA_BAIXO = 80.0          # pé de trás × chão embaixo (graus): quase em pé, dedos dobrados no chão (o do Afundo com Halteres)
INC = (2.0, 4.0, 7.0)      # tronco à frente da vertical (graus): em pé, quando o pé pisa e embaixo — ereto (ExRx: "Keep torso upright
                           # during lunge"); o Afundo com Halteres vai de 3° a 6°
PESCOCO = 0.8              # quanto a cabeça volta (fração da inclinação do tronco): olhando à frente (NSCA PTQ 4.4: "eyes looking
                           # forward"), como no Afundo com Halteres

# ── o passo no tempo (u = fração do tempo da ida, sem o ease) ──────────────────────────────────────────────────────────────────────
U_SOBE = (0.02, 0.11)      # o calcanhar da frente sobe (o pé gira em volta da base dos dedos, que fica no chão)
U_PASSO = (0.11, 0.50)     # o pé anda no ar; no fim pisa com o calcanhar
U_CHAPA = (0.50, 0.58)     # a ponta desce: o pé gira em volta do calcanhar até chapar
U_Y_FIM = 0.68             # o quadril termina de ir pra frente (daí só desce, reto)
V_PISA = 0.35              # velocidade do pé quando o calcanhar pisa, em fração da média do passo: ele desacelera no fim mas ainda
                           # chega andando (parado lá na frente, o quadril que ainda vinha esticava a perna da frente além do esticado)
THETA_SOBE = 20.0          # pé da frente × chão quando os dedos saem do chão (graus, calcanhar pra cima): com mais, a dobra da
                           # sola embaixo da base dos dedos entra no chão (pele da dobra presa ao pé e aos dedos)
THETA_PISA = 20.0          # pé da frente × chão quando o calcanhar pisa (graus, ponta pra cima)
ALTURA_PASSO = 0.08        # o tornozelo sobe até 8 cm acima da reta do passo (o pé passa ~8 cm acima do chão), no 1º terço
JOELHO_PISA = 12.0         # joelho da frente quando o calcanhar pisa (graus): quase esticado, sem travar
FRACAO_PISA = 0.90         # quanto do caminho pra frente o quadril já andou quando o calcanhar pisa
JOELHO_TRAS_PASSO = 9.0    # o joelho de trás no fim do passo (graus): dobra de leve (Achievable: "allowing the trailing knee to flex
                           # slightly"); no passo o calcanhar de trás sobe o que precisar pra ele não passar de esticado


def _ss(x):
    """Rampa suave 0 → 1 (smoothstep) com x preso em [0, 1]."""
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def _passo(x):
    """Quanto do caminho do pé no ar já foi (0 → 1) na fração x do tempo do passo: sai parado (velocidade zero) e chega com V_PISA
    vezes a velocidade média (a cúbica a·x² + b·x³ com essas 2 condições; o pico fica em ~1,4× a média)."""
    x = max(0.0, min(1.0, x))
    a, b = 3.0 - V_PISA, V_PISA - 2.0
    return a * x * x + b * x ** 3


def _fase(u, faixa):
    """0 → 1 dentro da faixa [u0, u1] do tempo, preso nas pontas."""
    return max(0.0, min(1.0, (u - faixa[0]) / (faixa[1] - faixa[0])))


def curva(us, vs):
    """Cúbica de Hermite monótona (Fritsch–Carlson) pelos pontos (us, vs), com velocidade zero na 1ª e na última: não passa dos
    pontos (nada vai e volta) e emenda suave entre eles."""
    n = len(us)
    h = [us[i + 1] - us[i] for i in range(n - 1)]
    s = [(vs[i + 1] - vs[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    for i in range(1, n - 1):
        if s[i - 1] * s[i] > 0:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / s[i - 1] + w2 / s[i])

    def f(u):
        if u <= us[0]:
            return vs[0]
        if u >= us[-1]:
            return vs[-1]
        i = max(k for k in range(n - 1) if us[k] <= u)
        x = (u - us[i]) / h[i]
        h00, h10 = 2 * x ** 3 - 3 * x ** 2 + 1, x ** 3 - 2 * x ** 2 + x
        h01, h11 = -2 * x ** 3 + 3 * x ** 2, x ** 3 - x ** 2
        return h00 * vs[i] + h10 * h[i] * m[i] + h01 * vs[i + 1] + h11 * h[i] * m[i + 1]

    return f


def _pele(bon, niveis=0):
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, niveis)
    return co, tri, nomes, dono


def _mascara(nomes, dono, pred):
    return np.array([bool(pred(n)) for n in nomes] + [False])[dono]


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta na barra (padrão dos exercícios novos); barra de 29 mm = mão padrão
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda nome: p3.cabeca(rig, nome)
    lt = (c("LeftLeg") - c("LeftUpLeg")).length
    ls = (c("LeftFoot") - c("LeftLeg")).length
    meio0 = (c("LeftUpLeg") + c("RightUpLeg")) / 2              # meio das articulações do quadril no repouso
    meia_quadril = (c("LeftUpLeg") - c("RightUpLeg")).length / 2
    tz0, mtp0 = c("LeftFoot"), c("LeftToeBase")                 # tornozelo e base dos dedos no repouso (pé chapado)
    v_pe = tz0 - mtp0                                           # base dos dedos → tornozelo, pé chapado (os 2 pés são iguais)
    # o calcanhar: o ponto da sola mais de trás que ainda fica no chão com o pé chapado (repouso) — o pé da frente gira em volta dele
    # quando pisa (o resto do calcanhar, arredondado, fica acima do chão com a ponta pra cima)
    co, _, nomes, dono = _pele(bon)
    i_calc = {}                                                 # o vértice do calcanhar de cada pé (pro info)
    for L, _ in LADOS:
        pe = np.where(_mascara(nomes, dono, lambda nm, L=L: nm in (L + "Foot", L + "ToeBase")))[0]
        bx = pe[co[pe, 2] < 0.004]
        i_calc[L] = int(bx[np.argmax(co[bx, 1])])
    calc0 = Vector(co[i_calc["Left"]])
    v_calc = tz0 - calc0                                        # calcanhar → tornozelo, pé chapado
    V_pe = co[np.where(_mascara(nomes, dono, lambda nm: nm in ("LeftFoot", "LeftToeBase")))[0]] - np.array(tz0)   # pele do pé esquerdo
                                                                # em relação ao tornozelo, chapado (pra achar o ponto que toca o chão)
    y_calc_tras = float(co[np.where(_mascara(nomes, dono, lambda nm: nm in ("LeftFoot", "LeftToeBase")))[0], 1].max())  # pele mais
                                                                # de trás do pé (o "calcanhar" do meio do pé, como no Sumô com Barra)

    # ── pés: base dos dedos do de trás parada; o da frente anda; os 2 giram em volta do eixo X (o pé aponta pra −Y) ──────────────
    v_pe_t = Vector((-v_pe.x, v_pe.y, v_pe.z))                  # o mesmo vetor no pé direito (espelho)
    MTP_T = Vector((-X_PE - (mtp0.x - tz0.x), mtp0.y, mtp0.z))  # base dos dedos do pé de trás (direito), parada a ida inteira
    MTP_F0 = Vector((X_PE + (mtp0.x - tz0.x), mtp0.y, mtp0.z))  # base dos dedos do pé da frente em pé, ao lado do outro
    A_F = Vector((X_PE, MTP_T.y - PASSO, tz0.z))                # tornozelo da frente depois de pisar (chapado)
    CALC_F = A_F - v_calc                                       # onde o calcanhar da frente pisa
    A_T0 = MTP_T + v_pe_t                                       # tornozelo de trás em pé (chapado)

    def tornozelo_na_ponta(mtp, th, v=v_pe):
        """Tornozelo do pé apoiado na base dos dedos `mtp`, com o pé th graus do chão (calcanhar pra cima); v = base dos dedos →
        tornozelo do pé chapado (o do pé esquerdo por padrão)."""
        return mtp + p3.rot_x(th) @ v

    def tornozelo_no_calcanhar(calc, th):
        """Tornozelo do pé apoiado no calcanhar `calc`, com o pé th graus do chão (ponta pra cima: th > 0): gira em volta do calcanhar
        e fica na altura em que o ponto mais baixo do pé (o calcanhar arredondado, que muda com o giro) encosta no chão."""
        A = calc + p3.rot_x(-th) @ v_calc
        a = math.radians(th)
        A.z = -float((-V_pe[:, 1] * math.sin(a) + V_pe[:, 2] * math.cos(a)).min())
        return A

    A_SOBE = tornozelo_na_ponta(MTP_F0, THETA_SOBE)             # os dedos da frente saem do chão
    A_PISA = tornozelo_no_calcanhar(CALC_F, THETA_PISA)         # o calcanhar da frente pisa

    pernas, polos, alvos, rot_pe, rot_dedos, M_pe, M_dedos = {}, {}, {}, {}, {}, {}, {}
    for L, s in LADOS:
        alvos[L] = p3.vazio("tornozelo_" + L, p3.ponta(rig, L + "Leg"))      # nasce no tornozelo (alvo ≠ polo)
        polos[L] = p3.vazio("polo_joelho_" + L, (s * 0.25, -1.2, 0.5))
        pernas[L] = p3.ik(rig, L + "Leg", alvos[L], polos[L])
        rot_pe[L] = p3.travar_rotacao(rig, L + "Foot")
        rot_dedos[L] = p3.travar_rotacao(rig, L + "ToeBase")
        M_pe[L], M_dedos[L] = rot_pe[L].matrix_world.copy(), rot_dedos[L].matrix_world.copy()

    passo = {}                                                   # tornozelo da frente (canela × pé) quando sai do chão e quando pisa

    def canela(H, A):
        """Canela da perna quadril H → tornozelo A inclinada à frente (graus da vertical, + = joelho à frente do tornozelo), com o joelho
        no plano do pé (o mesmo do corpo())."""
        Kj = joelho_no_plano_do_pe(H, A, Vector((0.0, -1.0, 0.0)), Vector((1.0, 0.0, 0.0)), lt, ls, 0.0)[0]
        e = Kj - A
        return math.degrees(math.atan2(-e.y, e.z))

    def pes(u, sola_tras, H_f=None):
        """Pés no instante u: o de trás com a sola a `sola_tras` graus do chão (em volta da base dos dedos, dedos chapados); o da frente
        na fase do passo (H_f: articulação do quadril da frente, pro pé no ar seguir a canela). Devolve (tornozelo da frente, pé da
        frente × chão em graus — + = calcanhar pra cima —, fase)."""
        alvos[TRAS].location = tornozelo_na_ponta(MTP_T, sola_tras, v_pe_t)
        rot_pe[TRAS].matrix_world = p3.rot_x(sola_tras).to_4x4() @ M_pe[TRAS]
        dedos = 0.0                                              # dedos da frente × chão (0 = chapados no chão)
        if u <= U_PASSO[0]:                                      # calcanhar subindo, dedos no chão
            th = THETA_SOBE * _ss(_fase(u, U_SOBE))
            A, dedos, fase = tornozelo_na_ponta(MTP_F0, th), 0.0, "calcanhar sobe" if th > 0 else "em pé"
        elif u < U_PASSO[1]:                                     # no ar
            lam = _passo(_fase(u, U_PASSO))
            A = A_SOBE.lerp(A_PISA, lam) + Vector((0.0, 0.0, ALTURA_PASSO * 6.75 * lam * (1 - lam) ** 2))
            # o pé no ar segue a canela: o tornozelo (canela × pé) vai da flexão plantar de quando os dedos saem do chão pro neutro no
            # meio do passo e pro ângulo de quando o calcanhar pisa (sem isso o pé ficava dobrado pra cima ~17° no meio do passo, com a
            # canela pra trás e o pé quase deitado)
            if passo and H_f is not None:
                D = (1 - lam) ** 2 * passo["D0"] + 2 * lam * (1 - lam) * passo["Dm"] + lam ** 2 * passo["D1"]
                th = canela(H_f, A) - D
            else:
                th = THETA_SOBE + (-THETA_PISA - THETA_SOBE) * lam
            # os dedos saem do chão subindo: a base dos dedos não desce abaixo de onde estava (com o joelho dobrando, a ponta do pé
            # girava pra baixo mais rápido que o tornozelo subia e a dobra da sola entrava ~5 mm no chão); sobe até 6 mm no começo
            sobe = mtp0.z + 0.006 * _ss(_fase(u, (U_PASSO[0], U_PASSO[0] + 0.06))) - (A - p3.rot_x(th) @ v_pe).z
            if sobe > 0:
                A = A + Vector((0.0, 0.0, sobe))
            dedos = th * _ss(lam / 0.3)                          # os dedos voltam pra linha do pé logo depois de sair do chão
            fase = "no ar"
        elif u < U_CHAPA[1]:                                     # calcanhar no chão, a ponta descendo
            th = -THETA_PISA * (1 - _ss(_fase(u, U_CHAPA)))
            A, dedos, fase = tornozelo_no_calcanhar(CALC_F, -th), th, "pisou, ponta descendo"
        else:
            th, A, dedos, fase = 0.0, A_F.copy(), 0.0, "chapado"
        alvos[FRENTE].location = A
        rot_pe[FRENTE].matrix_world = p3.rot_x(th).to_4x4() @ M_pe[FRENTE]
        rot_dedos[FRENTE].matrix_world = p3.rot_x(dedos).to_4x4() @ M_dedos[FRENTE]
        return A, th, fase

    def quadris(y, z):
        meio = Vector((0.0, y, z))
        return {L: meio + Vector((s * meia_quadril, 0.0, 0.0)) for L, s in LADOS}

    def flexao(H, A):
        """Flexão do joelho (graus) com o quadril em H e o tornozelo em A (0 = esticado; a perna não passa de esticada)."""
        d = min((A - H).length, lt + ls - 1e-9)
        return 180.0 - math.degrees(math.acos(max(-1.0, min(1.0, (lt * lt + ls * ls - d * d) / (2 * lt * ls)))))

    def joelhos(Hs, As):
        """Joelho de cada perna no plano vertical do próprio pé (o pé aponta pra −Y)."""
        out = {}
        for L, s in LADOS:
            out[L] = joelho_no_plano_do_pe(Hs[L], As[L], Vector((0.0, -1.0, 0.0)), Vector((s * 1.0, 0.0, 0.0)), lt, ls, 0.0)
        return out

    estado = {}

    def corpo(u, y, z, inc, sola_tras):
        """Pés, pelve e tronco (giram juntos: coluna neutra) com o meio das articulações do quadril em (0, y, z), joelhos (IK com o
        polo na frente do joelho calculado) e a cabeça olhando à frente. Braços e barra vão junto com o tronco."""
        for nome in ("Hips", "Neck", "Head"):
            PB[p3.P + nome].matrix_basis = Matrix()
        A_f, th, fase = pes(u, sola_tras, quadris(y, z)[FRENTE])
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(inc), pivo=meio0, mover=Vector((0.0, y - meio0.y, z - meio0.z)))
        Hs = quadris(y, z)
        As = {FRENTE: A_f, TRAS: alvos[TRAS].location.copy()}
        K = joelhos(Hs, As)
        for L, _ in LADOS:
            Kj, C, _ = K[L]
            v = Kj - C
            polos[L].location = Kj + (v.normalized() if v.length > 1e-6 else Vector((0.0, -1.0, 0.0))) * 0.6
        p3.atualizar()
        p3.girar_osso(rig, "Neck", p3.rot_x(-inc * PESCOCO))
        estado.update(u=u, y=y, z=z, inc=inc, sola=sola_tras, th=th, fase=fase, K=K, A_f=A_f.copy())

    def centro_da_barra(inc):
        return c("Neck") + p3.rot_x(inc) @ BARRA_NO_TRAPEZIO

    def centro_de_massa(inc):
        """Centro de massa do corpo (volume da malha posada, densidade uniforme) + barra; devolve (sistema, corpo, massa do corpo)."""
        co, tri, _ = ck._avaliar(bon.corpo, 0)
        v0, v1, v2 = co[tri[:, 0]], co[tri[:, 1]], co[tri[:, 2]]
        vol = np.einsum("ij,ij->i", v0, np.cross(v1, v2)) / 6.0
        V = float(vol.sum())
        cc = Vector(((v0 + v1 + v2) / 4.0 * vol[:, None]).sum(axis=0) / V)
        m = V * DENSIDADE
        return (cc * m + centro_da_barra(inc) * M_BARRA) / (m + M_BARRA), cc, m

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

    # ── em pé: joelhos a JOELHO_CIMA com os 2 pés chapados lado a lado; o quadril vai pra frente/trás até o centro de massa (corpo +
    #    barra) ficar em cima do meio do pé (entre o calcanhar e a base dos dedos — o "equal distribution of weight throughout forefoot
    #    and heel" do ExRx, como no Agachamento Sumô com Barra). 1º palpite no y do repouso; as mãos vão na barra antes do equilíbrio ──
    Y_MEIO_PE = (y_calc_tras + mtp0.y) / 2
    z_em_pe = lambda y: bissecao(lambda z: flexao(quadris(y, z)[TRAS], A_T0), 0.70, 0.98, JOELHO_CIMA)
    y0 = meio0.y
    z0 = z_em_pe(y0)
    corpo(0.0, y0, z0, INC[0], 0.0)
    if RETRAI:                         # escápulas pra trás (o corpo() não mexe no osso Shoulder: fica assim em todos os quadros)
        cima = (c("Neck") - c("Hips")).normalized()
        for L, s in LADOS:
            p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * RETRAI), 3, cima))
    barra = e3.barra("barra", comprimento=2.0, raio_anilha=R_ANILHA, pegada=2 * MEIA_TRAVAS)
    for o in barra.children:           # o eixo de 2 m em anéis (mesma forma e nomes): a checagem fica ~10× mais rápida (README)
        if o.name == "barra_eixo":
            e3._em_aneis(o)
    barra.rotation_mode = "XYZ"
    R = p3.rot_x(INC[0])
    centro = centro_da_barra(INC[0])
    barra.location = centro
    barra.rotation_euler = R.to_euler()
    p3.atualizar()
    maos = Maos(bon, RAIO_BARRA, polegar_modo="volta")
    eixo = (R @ Vector((1.0, 0.0, 0.0))).normalized()

    def pegar():
        for L, s in LADOS:
            g = centro + eixo * (s * GRIP_X)
            polo = c(L + "Arm") + R @ Vector((s * POLO_COTOVELO.x, POLO_COTOVELO.y, POLO_COTOVELO.z))
            maos.segurar(L, g, R @ DEDOS_Q, R @ PALMA_Q, polo=polo, alinhar=ALINHA)

    pegar()
    for L, _ in LADOS:                 # polo certo do cotovelo (o cotovelo dobra pro lado do polo)
        maos.iks[L].mute = False
        e = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
        maos.iks[L].mute = True
        print("polo cotovelo %s erro %.3f ang %d" % (L, *e), flush=True)
    pegar()
    # os 4 dedos fecham até a pele encostar na barra; o polegar é o NOVO, dando a volta por baixo da barra (pegada fechada), na
    # postura fixa POLEGAR_VOLTA do Agachamento no Smith — a mesma pegada (mão atrás da barra nas costas), a mesma do Sumô com Barra.
    dedos = {}
    for L, _ in LADOS:
        dedos[L] = pg.fechar_em_volta(bon, L, centro, eixo, RAIO_BARRA, polegar_modo="busca")
        _polegar_nos_angulos(bon, L, POLEGAR_VOLTA)
        dedos[L]["Thumb"] = ("volta fixo",) + POLEGAR_VOLTA
        print("DEDOS %s %s" % (L, dedos[L]), flush=True)
    p3.atualizar()
    # o vão de cada mão em relação ao centro da barra, no referencial do tronco (tem que ficar igual em todo quadro: nada escorrega)
    estado["mao_ref"] = {L: R.transposed() @ (p3.mundo_osso(rig, L + "Hand") @ maos.furo[L] - centro) for L, _ in LADOS}

    def y_equilibrio(y_ini):
        def erro(y):
            corpo(0.0, y, z_em_pe(y), INC[0], 0.0)
            return centro_de_massa(INC[0])[0].y - Y_MEIO_PE
        ya, ea = y_ini, erro(y_ini)
        yb = y_ini + 0.01
        eb = erro(yb)
        for _ in range(10):
            if abs(eb) < 2e-5 or abs(eb - ea) < 1e-9:
                break
            yn = yb - eb * (yb - ya) / (eb - ea)
            ya, ea = yb, eb
            yb, eb = yn, erro(yn)
        return yb

    # ── embaixo: coxa da frente paralela ao chão e canela da frente a CANELA_BAIXO graus da vertical (o y e o z do quadril saem das 2
    #    condições), pé de trás a SOLA_BAIXO ───────────────────────────────────────────────────────────────────────────────────────

    def coxa_canela(y, z):
        H = quadris(y, z)[FRENTE]
        Kj = joelho_no_plano_do_pe(H, A_F, Vector((0.0, -1.0, 0.0)), Vector((1.0, 0.0, 0.0)), lt, ls, 0.0)[0]
        d = Kj - H
        coxa = math.degrees(math.atan2(-d.z, math.hypot(d.x, d.y)))
        e = Kj - A_F
        canela = math.degrees(math.atan2(-e.y, e.z))          # + = joelho à frente do tornozelo
        return coxa, canela

    def z_paralela(y):
        return bissecao(lambda z: coxa_canela(y, z)[0], 0.35, 0.75, COXA_BAIXO)

    y_b = bissecao(lambda y: coxa_canela(y, z_paralela(y))[1], A_F.y + 0.25, A_F.y + 0.50, CANELA_BAIXO)
    z_b = z_paralela(y_b)
    corpo(1.0, y_b, z_b, INC[2], SOLA_BAIXO)
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
        print("polo joelho %s %.1f° | joelho a %.1f mm do alvo" % (L, melhor[1], melhor[0] * 1000), flush=True)

    for volta in range(2):             # em pé, com o polo dos joelhos já certo e as mãos na barra
        y0 = y_equilibrio(y0)
        z0 = z_em_pe(y0)

    # ── quando o calcanhar pisa: o quadril andou FRACAO_PISA do caminho e está na altura que deixa o joelho da frente a JOELHO_PISA ──
    y_p = y0 + (y_b - y0) * FRACAO_PISA
    z_p = bissecao(lambda z: flexao(quadris(y_p, z)[FRENTE], A_PISA), 0.60, 0.95, JOELHO_PISA)
    fy = curva([0.0, U_PASSO[1], U_Y_FIM, 1.0], [y0, y_p, y_b, y_b])
    fz = curva([0.0, U_PASSO[1], 1.0], [z0, z_p, z_b])
    finc = curva([0.0, U_PASSO[1], 1.0], list(INC))
    D0 = canela(quadris(fy(U_PASSO[0]), fz(U_PASSO[0]))[FRENTE], A_SOBE) - THETA_SOBE     # tornozelo quando os dedos saem do chão
    D1 = canela(quadris(fy(U_PASSO[1]), fz(U_PASSO[1]))[FRENTE], A_PISA) + THETA_PISA     # e quando o calcanhar pisa
    passo.update(D0=D0, D1=D1, Dm=-(D0 + D1) / 2)                # neutro no meio do passo
    print("PASSO tornozelo da frente (dorsiflexão +, em relação ao pé chapado em pé): sai do chão %+.1f° → meio 0 → pisa %+.1f°" % (
        D0, D1), flush=True)

    # ── pé de trás: no passo, o calcanhar sobe o que precisa pra o joelho de trás seguir a curva fjt (de JOELHO_CIMA a
    #    JOELHO_TRAS_PASSO; com o pé chapado ele já dobra mais que isso = calcanhar no chão); depois sobe até SOLA_BAIXO embaixo ───────
    fjt = curva([0.0, U_PASSO[1]], [JOELHO_CIMA, JOELHO_TRAS_PASSO])
    us_sola, sola = [], []
    for k in range(0, int(round(U_PASSO[1] * 100)) + 1, 2):
        u = k / 100
        H = quadris(fy(u), fz(u))[TRAS]
        alvo = fjt(u)
        if flexao(H, tornozelo_na_ponta(MTP_T, 0.0, v_pe_t)) >= alvo:
            th = 0.0
        else:
            th = bissecao(lambda a: flexao(H, tornozelo_na_ponta(MTP_T, a, v_pe_t)), 0.0, 85.0, alvo)
        us_sola.append(u)
        sola.append(max(th, sola[-1]) if sola else th)       # o calcanhar só sobe
    fsola = curva(us_sola + [1.0], sola + [SOLA_BAIXO])

    def tempo_real(t):
        """O t do exportador vem com o ease seno (p3.suave); u é o tempo de verdade, em fração da ida."""
        return math.acos(max(-1.0, min(1.0, 1.0 - 2.0 * t))) / math.pi

    def pose(t):
        """t=0 em pé (pés lado a lado), t=1 embaixo (pé esquerdo na frente, coxa da frente paralela, joelho de trás quase no chão)."""
        u = tempo_real(t)
        corpo(u, fy(u), fz(u), finc(u), fsola(u))
        R = p3.rot_x(estado["inc"])
        barra.location = centro_da_barra(estado["inc"])
        barra.rotation_euler = R.to_euler()
        p3.atualizar()
        estado["t"] = t

    pose.estado = estado
    print("AFUNDO BARRA quadril (meio): em pé y %+.4f z %.4f | pisa y %+.4f z %.4f | embaixo y %+.4f z %.4f | tornozelo da frente: "
          "sobe %s pisa %s chapado %s | base dos dedos de trás %s | sola de trás pisa %.1f° → %.0f°" % (
              y0, z0, y_p, z_p, y_b, z_b, tuple(round(x, 3) for x in A_SOBE), tuple(round(x, 3) for x in A_PISA),
              tuple(round(x, 3) for x in A_F), tuple(round(x, 3) for x in MTP_T), fsola(U_PASSO[1]), SOLA_BAIXO), flush=True)

    # ── medidas à parte (a checagem não vê): o pé da frente depois de pisar, o calcanhar dele girando, a mão fora da pegada ────────
    def info():
        u, inc = estado.get("u", 0.0), estado.get("inc", 0.0)
        R = p3.rot_x(inc)
        M = np.array(barra.matrix_world)
        co, _, nomes, dono = _pele(bon, 1)
        cm, cc, m = centro_de_massa(inc)
        j = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        txt = ["u %.3f %s | tronco %.1f° | quadril y %+.4f z %.4f | sola de trás %.1f°" % (
            u, estado.get("fase", ""), inc, estado.get("y", 0), estado.get("z", 0), estado.get("sola", 0))]
        # centro de massa: entre o meio do pé da frente e a base dos dedos de trás (0 = em cima do meio do pé da frente, 1 = da base
        # dos dedos de trás); em pé, em relação ao meio do pé
        meio_f = (A_F.y - v_calc.y + mtp0.y - tz0.y + A_F.y) / 2
        txt.append("centro de massa (corpo %.0f kg + barra %.0f kg) y %+.4f | em pé: %+.0f mm do meio do pé | no passo: %.2f do meio "
                   "do pé da frente à base dos dedos de trás" % (m, M_BARRA, cm.y, (cm.y - Y_MEIO_PE) * 1000,
                                                                  (cm.y - meio_f) / (MTP_T.y - meio_f)))
        # pés: planta e calcanhar (mm acima do chão), o tornozelo da frente × onde ele fica chapado e o calcanhar da frente × onde pisa
        for L, s in LADOS:
            P = co[_mascara(nomes, dono, lambda nm, L=L: nm in (L + "Foot", L + "ToeBase"))]
            dd = co[_mascara(nomes, dono, lambda nm, L=L: nm == L + "ToeBase")]
            txt.append("pé %s: mais baixo %+.1f mm, calcanhar %+.1f mm, dedos %+.1f mm" % (
                L[0], P[:, 2].min() * 1000, co[i_calc[L], 2] * 1000, dd[:, 2].min() * 1000))
        tz_f = Vector(j[FRENTE + "Foot"])
        ck_f = Vector(co[i_calc[FRENTE]])
        txt.append("tornozelo da frente × chapado %.1f mm (xy %.1f) | calcanhar da frente × onde pisa xy %.1f mm | base dos dedos de "
                   "trás × parada xy %.1f mm" % (
                       (tz_f - A_F).length * 1000, (tz_f - A_F).xy.length * 1000, (ck_f - CALC_F).xy.length * 1000,
                       (Vector(j[TRAS + "ToeBase"]) - MTP_T).xy.length * 1000))
        # joelho de trás: a pele mais baixa (em volta do joelho) até o chão; canela da frente
        perna_t = _mascara(nomes, dono, lambda nm: nm in (TRAS + "Leg", TRAS + "UpLeg"))
        P = co[perna_t]
        P = P[np.linalg.norm(P - np.array(j[TRAS + "Leg"]), axis=1) < 0.09]
        e = j[FRENTE + "Leg"] - j[FRENTE + "Foot"]
        txt.append("joelho %.0f/%.0f° | joelho de trás: pele a %.0f mm do chão (centro %.0f) | canela da frente %+.1f° | quadril "
                   "%.0f/%.0f°" % (juntas["joelhoE"], juntas["joelhoD"], P[:, 2].min() * 1000, j[TRAS + "Leg"][2] * 1000,
                                   math.degrees(math.atan2(-e[1], e[2])), juntas["quadrilE"], juntas["quadrilD"]))
        Rt = R.transposed()
        rel = Rt @ (barra.location - c("Neck"))
        eixo_d, pontas_d = sdf_barra(co, M)
        partes = []
        for nome, pred in (("pescoço", lambda nm: nm == "Neck"), ("cabeça", lambda nm: nm == "Head"),
                           ("trapézio/ombros", lambda nm: nm in ("Spine2", "LeftShoulder", "RightShoulder")),
                           ("braços", lambda nm: nm in ("LeftArm", "RightArm")),
                           ("antebraços", lambda nm: nm in ("LeftForeArm", "RightForeArm"))):
            mk = _mascara(nomes, dono, pred)
            partes.append("%s %+.1f" % (nome, float(eixo_d[mk].min()) * 1000))
        txt.append("barra no tronco %+.1f/%+.1f/%+.1f mm | barra (eixo) × pele (mm, − = entra): %s" % (
            *(x * 1000 for x in rel), " ".join(partes)))
        co0, _, nomes0, dono0 = _pele(bon, 0)
        eixo0 = sdf_barra(co0, M)[0]
        c0, ux = M[:3, 3], M[:3, 0] / np.linalg.norm(M[:3, 0])
        for L, s in LADOS:
            mk = _mascara(nomes, dono, lambda nm, L=L: nm.startswith(L + "Hand"))
            agora = Rt @ (p3.mundo_osso(rig, L + "Hand") @ maos.furo[L] - barra.location)
            # a mão fora da pegada: a pele a mais de 3,5 cm do meio da mão, ao longo da barra (as beiradas da mão)
            d = co[mk] - c0
            a = d @ ux
            rad = np.linalg.norm(d - np.outer(a, ux), axis=1) - RAIO_BARRA
            a_c = float(np.median(a[rad < 0.01])) if (rad < 0.01).any() else 0.0
            longe = np.abs(a - a_c) > 0.035
            pol = _mascara(nomes0, dono0, lambda nm, L=L: nm.startswith(L + "HandThumb"))
            polpa = _mascara(nomes0, dono0, lambda nm, L=L: nm == L + "HandThumb3")
            pele = pg.pele_do_polegar(bon, L)
            txt.append("mão %s: pele mais funda na barra %+.1f mm, fora da pegada %+.1f mm, × travas/anilhas %+.0f mm, o vão andou %.2f "
                       "mm na barra | polegar %s: pele × barra %+.1f mm (polpa %+.1f), entra nos dedos %.1f mm, pele da base %.2f× com "
                       "%d triângulos do avesso" % (
                           L[0], float(eixo_d[mk].min()) * 1000, float(rad[longe].min()) * 1000 if longe.any() else 9e3,
                           float(pontas_d[mk].min()) * 1000, (agora - estado["mao_ref"][L]).length * 1000, dedos[L]["Thumb"][0],
                           float(eixo0[pol].min()) * 1000, float(eixo0[polpa].min()) * 1000, polegar_nos_dedos(bon, L) * 1000,
                           pele["alonga_max"], pele["viradas"]))
        # mão × ombro e cabeça (a mão fica atrás da barra, perto deles)
        perto = []
        for L, s in LADOS:
            mv = co[_mascara(nomes, dono, lambda nm, L=L: nm.startswith(L + "Hand"))]
            for nome, pred in (("ombro", lambda nm, L=L: nm in (L + "Arm", L + "Shoulder")), ("cabeça", lambda nm: nm in ("Head", "Neck"))):
                Q = co[_mascara(nomes, dono, pred)]
                dist = np.sqrt(((mv[::4, None, :] - Q[None, ::4, :]) ** 2).sum(axis=2)).min()
                perto.append("%s×%s %.0f" % (L[0], nome, dist * 1000))
        nao_mao = _mascara(nomes, dono, lambda nm: not nm.startswith(("LeftHand", "RightHand")))
        i = int(np.argmin(np.where(nao_mao, pontas_d, 1e9)))
        txt.append("mão × ombro/cabeça (mm, ponto a ponto): %s | travas/anilhas × corpo (fora as mãos) %+.0f mm (%s) | anilhas a %.0f mm "
                   "do chão | %s" % (" ".join(perto), float(pontas_d[i]) * 1000, nomes[dono[i]] if dono[i] >= 0 else "?",
                                     (barra.location.z - R_ANILHA) * 1000, maos.info()))
        return " | ".join(txt)

    for t in (0.0, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=1.0)
    return Cena(pose, [barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=4.0, foco_luz=(0, -0.3, 0.75),
                camera_video=((3.6, -3.4, 1.1), (0, -0.3, 0.80), 50), info=info)
