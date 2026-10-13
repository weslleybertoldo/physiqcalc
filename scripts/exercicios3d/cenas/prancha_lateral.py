# Prancha Lateral — cena da fábrica 3D (lote 13, 12/10/2026). Peso corporal, ISOMÉTRICO, deitado de lado no chão (sem equipamento nem
# colchonete: o apoio é o chão, o mesmo da Prancha, do Coice em Quatro Apoios e do Escalador).
# Caminho A (decisão do Weslley, 11/10/2026, "1", a mesma da Prancha): entra na posição, segura e sai. CÍCLICO ("ciclo": true na ficha,
# t = 1 igual a t = 0; o app repete): t = 0 é a PRANCHA LATERAL MONTADA (a foto parada do app); segura 5 s; o QUADRIL desce em 1,5 s até
# a perna de baixo deitar no chão, com o antebraço e a borda do pé de baixo parados, fica 0,5 s (t = 0,5 é o meio do tempo embaixo) e
# sobe de novo em 1,5 s até o corpo ficar reto; segura até o fim do ciclo (que emenda com a segurada do começo).
# Técnica (só o que foi lido; as frases completas e as fontes estão na ficha):
#  · ExRx, Side Plank: "Lie on side on mat. Place forearm on mat under shoulder perpendicular to body. Place upper leg directly on top of
#    lower leg and straighten knees and hips." · "Raise body upward by straightening waist so body is ridged. Hold position."
#  · ACE, Side Plank with Straight Leg (#101): "Lie on your right side on an exercise mat with extended legs, placing your left leg directly
#    over your right leg and and stacking your feet one on top of the other. Place your right elbow directly under your shoulder, align your
#    head with your spine and keep your hips and right knee in contact with the exercise mat." · "lift your hips and knees off the mat,
#    keeping contact with the side of your right foot and keep head aligned with your spine. Keep your right elbow positioned directly under
#    your shoulder." · "Lowering Phase: Inhale and gently return yourself to your starting position."
#  · ACE, McGill's Torso Muscular Endurance Test Battery (Trunk Lateral Endurance Test): "keeping both legs extended and the sides of the
#    feet on the floor. The elbow of the lower arm should be positioned directly under the shoulder with the forearm facing out" · "The
#    hips should be elevated off the mat and the body should be in straight alignment (i.e., head, neck, torso, hips, and legs)" · o teste
#    acaba com "the hips dropping downward" ou "The hips shifting forward or backward".
#  · free-exercise-db, Side Bridge (o fonte_en): sem texto; 2 fotos — o quadril no colchonete → o quadril em cima, o corpo reto; o punho de
#    baixo fechado, de lado, e a mão de cima no quadril.
#  · Youdas et al. 2014 (prancha lateral dinâmica): "A metronome set at 40 beats per minute was used to standardize the rate of movement
#    of the hips" — 1,5 s por batida: o quadril desce numa batida e sobe na outra.
# Decisões: deitado sobre o lado DIREITO (os textos da ACE; as fotos do ExRx, da ACE e da ACE/McGill), o peito pra −Y (a câmera de frente
# vê a cabeça à esquerda, como nessas fotos). Pés EMPILHADOS (ExRx; ACE) — o boneco musculoso não junta as pernas sem a parte de dentro
# das coxas passar uma pela outra (~15 mm: no corpo de verdade ela cede; a ficha registra o limite e o motivo); com as pernas abertas o
# bastante pra não cruzar, o pé de cima ficaria ~18 cm no ar (outra variação: ACE, "raising the upper leg off the lower leg"). Mão de baixo
# FECHADA, de lado (o dedo mínimo no chão, o polegar pra cima; fotos do fonte_en, da ACE e do McGill 1998): os dedos em volta de um
# cilindro de 10 mm (o menor de Shimawaki 2019), sem peça. Mão de cima NO QUADRIL, com o cotovelo dobrado (fotos do fonte_en, do ExRx e da
# ACE/McGill): a palma encosta no quadril e os dedos seguem a linha do antebraço deitada na pele (o punho só estende). Embaixo, a
# panturrilha de baixo (grande, não amassa) encosta no chão antes do quadril: o quadril para a ~3 cm do chão.
# Como o rig faz: em pé, os joelhos esticam, as pernas fecham até o pé de cima encostar no de baixo e o quadril estende até ficar na reta
# ombro → tornozelo; o corpo deita girando em volta da borda de fora do pé de baixo (em Y) e inclina até o braço de baixo, EM PÉ (o
# cotovelo bem embaixo do ombro), levar a pele do antebraço até o chão; o antebraço aponta pra frente (perpendicular ao corpo), de lado
# (antebraço neutro), e desce na ponta até o punho fechado encostar. A mão de cima vai pelo IK até um ponto do quadril guardado no osso
# Hips (anda junto com a pelve). Descida: o antebraço e o pé de baixo ficam PARADOS; a perna de baixo (esticada) gira em Y em volta do
# tornozelo (o pé continua deitado no chão e o tornozelo inverte) até a panturrilha encostar no chão; a pelve desce junto com a
# articulação do quadril de baixo, sem girar (GAMA_B); a coluna dobra de lado o tanto que leva o ombro de baixo de volta a um braço do
# cotovelo parado (o braço inclina um pouco em volta do cotovelo); a perna de cima gira no quadril até o pé dela (ou a canela, embaixo)
# encostar na de baixo. As contas da descida usam a pele da perna presa no osso da coxa (o joelho não mexe), sem avaliar a malha.
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X em pé)
BX, CM = "Right", "Left"                  # o lado de BAIXO (deitado sobre o lado direito) e o de CIMA
# ── pernas e pés ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
JOELHO = 1.5            # joelhos estendidos (ExRx: "straighten knees and hips"; ACE/McGill: "keeping both legs extended"); em pé o
                        # boneco tem 7,5°
AFUNDA_PE = 0.0008      # o pé de cima apertando o de baixo (pés empilhados: ExRx "Place upper leg directly on top of lower leg")
AFUNDA_CHAO_PE = 0.001  # a borda de fora do pé de baixo apertando o chão (ACE: "keeping contact with the side of your right foot")
QUADRIL_LINHA = 0.0     # centro do quadril na reta ombro → tornozelo no eixo da FRENTE do tronco (mm): sem ir pra frente nem pra trás
X_PE = 0.80             # a borda do pé de baixo fica em x = X_PE: o corpo fica centrado perto de x = 0
# ── braços e mãos ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
AFUNDA_ANTEBRACO = 0.0008   # a pele do antebraço de baixo (perto do cotovelo) apertando o chão
AFUNDA_MAO = 0.0008     # o punho fechado (o lado do dedo mínimo) apertando o chão
PERTO_COTOVELO = 0.13   # a parte do antebraço "perto do cotovelo" (m, a partir do centro do cotovelo): é onde o peso apoia
PUNHO_MM = 10.0         # a mão fechada sem peça: os dedos em volta de um cilindro de 10 mm (o menor de Shimawaki 2019)
Z_MAO = 0.99            # em pé: altura (m) do meio da palma de cima no lado de fora do quadril (logo abaixo da crista ilíaca)
AFUNDA_MAO_QUADRIL = 0.0006   # a mão de cima apertando o quadril (encosta sem entrar)
DEDOS_MAX = 15.0        # a mão de cima: cada dedo dobra na base no máximo isso pra encostar no quadril (mais vira garra)
# ── descida e subida (Caminho A) ───────────────────────────────────────────────────────────────────────────────────────────────────
SEGURA_S = 5.0          # s na prancha lateral montada por ciclo (a mesma segurada da Prancha; NSCA "Hold for 20 s", ACE "for the desired
                        # amount of time", testes "as long as possible": uma segurada representativa, o app repete o ciclo)
DESCE_S = 1.5           # s descendo e subindo: uma batida do metrônomo de 40/min do Youdas 2014 ("to standardize the rate of movement of
SOBE_S = 1.5            # the hips"); ACE: "gently return yourself to your starting position"
EMBAIXO_S = 0.5         # s com a perna no chão (o mesmo instante embaixo da Prancha)
CICLO_S = SEGURA_S + DESCE_S + EMBAIXO_S + SOBE_S
GAMA_B = 0.0            # embaixo: quanto a pelve gira (graus, em Y; + = a ponta da cabeça sobe). 0 = a pelve só desce junto com o quadril
                        # de baixo, sem girar: os quadris fazem ~9° (o de baixo aduz, o de cima abduz — ExRx, Side Bridge: "lower hip
                        # abducts and upper hip adducts" na subida; adução normal 13,8 ± 6,3°, Wichman 2021) e a coluna dobra de lado ~22°
                        # (ExRx: "Raise hips upward by lateral flexion of spine"; normal 36,3 ± 6,4°, Apti 2023). Com os 2 pés parados
                        # (−4,8°) a coluna dobraria 28° e o braço de baixo inclinaria 12°; girando junto com o tronco o braço ficaria em
                        # pé, mas o quadril de baixo passaria da adução normal e o pé de cima deslizaria ~9 cm por cima do de baixo
LOMBAR_DIV = (0.6, 0.4)  # como a flexão lateral da coluna se divide entre os ossos Spine e Spine1
AFUNDA_PERNA = 0.001    # embaixo: a pele mais baixa da perna de baixo encostando no chão

# janela de cada fase no ciclo (t de 0 a 1): o meio do tempo embaixo fica em t = 0,5 (os prints de t = 0,5 mostram a perna no chão)
T_DESCE = (0.5 - (EMBAIXO_S / 2 + DESCE_S) / CICLO_S, 0.5 - EMBAIXO_S / 2 / CICLO_S)
T_SOBE = (0.5 + EMBAIXO_S / 2 / CICLO_S, 0.5 + (EMBAIXO_S / 2 + SOBE_S) / CICLO_S)


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _bvh(co, tri, m):
    t = tri[m[tri].all(axis=1)]
    return BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in t], all_triangles=True)


def distancia(co, tri, nomes, dono, partes, com):
    """Menor distância com sinal (m) da pele de `partes` até a pele de `com` (− = entrou), como o contatos() da checagem."""
    b = _bvh(co, tri, _grupo(nomes, dono, com))
    menor = 1e9
    for p in co[_grupo(nomes, dono, partes)]:
        v = Vector(p)
        loc, nor, idx, dist = b.find_nearest(v)
        if loc is None:
            continue
        menor = min(menor, -dist if (dist < 0.03 and (v - loc).dot(nor) < 0) else dist)
    return menor


def descida(t):
    """Quanto o quadril já desceu no quadro t (0 = prancha lateral montada, 1 = embaixo), com saída e chegada suaves (seno)."""
    if t <= T_DESCE[0] or t >= T_SOBE[1]:
        return 0.0
    if t < T_DESCE[1]:
        return p3.suave((t - T_DESCE[0]) / (T_DESCE[1] - T_DESCE[0]))
    if t <= T_SOBE[0]:
        return 1.0
    return p3.suave((T_SOBE[1] - t) / (T_SOBE[1] - T_SOBE[0]))


def montar(bon):
    pg.usar_polegar("volta")          # padrão dos exercícios novos
    pg.usar_cilindro(PUNHO_MM)        # a mão de baixo fecha num punho (cilindro de 10 mm, sem peça)
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    Lb = (c(BX + "ForeArm") - c(BX + "Arm")).length
    La = (c(BX + "Hand") - c(BX + "ForeArm")).length
    PEB = (BX + "Foot", BX + "ToeBase")
    PEC = (CM + "Foot", CM + "ToeBase")

    # ── pernas: joelhos estendidos e as pernas fechando até o pé de cima encostar no de baixo (em pé, antes de deitar) ──────────────
    for lado, _ in LADOS:
        Hq, K, A = (c(lado + n) for n in ("UpLeg", "Leg", "Foot"))
        coxa, canela = (K - Hq).normalized(), (A - K).normalized()
        flex = math.degrees(coxa.angle(canela))
        quer = coxa.slerp(canela, JOELHO / flex) if flex > JOELHO else canela
        p3.girar_osso(rig, lado + "Leg", canela.rotation_difference(quer).to_matrix())
    coxas_soltas = {L: PB[p3.P + L + "UpLeg"].matrix_basis.copy() for L, _ in LADOS}
    Y0 = c(BX + "Foot").y

    def fechar_pernas(s):
        """Cada coxa fecha em volta do quadril até o tornozelo ficar a s/2 m do meio; devolve o pé × pé (m, − = entrou)."""
        for L, _ in LADOS:
            PB[p3.P + L + "UpLeg"].matrix_basis = coxas_soltas[L].copy()
        p3.atualizar()
        for L, sg in LADOS:
            Hq, A = c(L + "UpLeg"), c(L + "Foot")
            v = A - Hq
            q = Vector((sg * s / 2 - Hq.x, Y0 - Hq.y, 0.0))
            q.z = -math.sqrt(max(v.length ** 2 - q.x ** 2 - q.y ** 2, 1e-6))
            p3.girar_osso(rig, L + "UpLeg", v.rotation_difference(q).to_matrix())
        co, tri, (nomes, dono) = _malha(bon)
        return distancia(co, tri, nomes, dono, PEC, PEB)

    lo, hi = 0.05, 0.20
    for _ in range(12):
        meio = (lo + hi) / 2
        if fechar_pernas(meio) < -AFUNDA_PE:
            lo = meio
        else:
            hi = meio
    S_PES = hi
    pp = fechar_pernas(S_PES)
    co, tri, (nomes, dono) = _malha(bon)
    ck.posicoes_das_juntas(rig)
    cxc = ck.corpo_x_corpo(co, tri, nomes, dono)[0]
    print("PERNAS | tornozelos a %.4f m (de lado a lado) | pé × pé %.2f mm | coxa×coxa %.1f mm perna×perna %.1f mm" % (
        S_PES, pp * 1000, cxc["coxaE×coxaD"], cxc["pernaE×pernaD"]))

    # ── o quadril estende (+) ou dobra até o centro dele ficar na reta ombro → tornozelo (no eixo da frente do tronco) ───────────────
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
    co, tri, (nomes, dono) = _malha(bon)
    print("QUADRIL | estendeu %.2f° | quadril × reta (frente) %+.1f mm | pé × pé %.2f mm" % (
        g_q, tc.quadril_linha_ombro_tornozelo(ck.posicoes(rig))[0], distancia(co, tri, nomes, dono, PEC, PEB) * 1000))

    # ── a mão de cima no quadril: o ponto mais de fora da pele do quadril esquerdo na altura Z_MAO (em pé), guardado no osso Hips ──────
    QUAD = ("Hips", "Spine", CM + "UpLeg")
    Pq = co[_grupo(nomes, dono, QUAD)]
    faixa = Pq[(np.abs(Pq[:, 2] - Z_MAO) < 0.006) & (Pq[:, 0] > 0)]
    P_MAO = Vector(faixa[np.argmax(faixa[:, 0])])
    loc, N_MAO, _, _ = _bvh(co, tri, _grupo(nomes, dono, QUAD)).find_nearest(P_MAO + Vector((0.02, 0, 0)))
    H0i = p3.mundo_osso(rig, "Hips").inverted()
    MAO_LOCAL = (H0i @ P_MAO, H0i.to_3x3() @ N_MAO, H0i.to_3x3() @ Vector((0.0, -1.0, -0.7)).normalized())
    print("MÃO NO QUADRIL | ponto em pé %s | normal %s" % (tuple(round(v, 4) for v in P_MAO), tuple(round(v, 3) for v in N_MAO)))

    # ── de lado: o corpo gira em volta da borda de fora do pé de baixo (eixo Y) — o lado direito pro chão, a cabeça pra −X ──────────────
    Pd = pele(PEB)
    PIVO = Vector(Pd[Pd[:, 0] < Pd[:, 0].min() + 0.006].mean(axis=0))
    base_hips = PB[p3.P + "Hips"].matrix_basis.copy()

    def deitar(phi):
        """Corpo deitado sobre o lado direito com a cabeça `phi` graus acima dos pés, a borda do pé de baixo no chão em x = X_PE."""
        PB[p3.P + "Hips"].matrix_basis = base_hips.copy()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", Matrix.Rotation(math.radians(phi - 90.0), 3, "Y"), pivo=PIVO)
        z = float(pele(PEB)[:, 2].min())
        p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((X_PE - PIVO.x, 0.0, -AFUNDA_CHAO_PE - z)))

    # ── braços: IK do ombro ao punho; o antebraço gira até a linha dos nós ficar na direção pedida e o punho acerta a palma ──────────
    punhos, polos, iks = {}, {}, {}
    for lado, s in LADOS:                 # alvo nasce no punho de repouso e o polo afastado (alvo = polo dá NaN)
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((s * 0.3, 0.3, 0.3)))
        iks[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos[lado])
        iks[lado].mute = True
    p3.atualizar()
    BRACO = {L: [pb.name[len(p3.P):] for pb in PB if pb.name[len(p3.P):].startswith((L + "Arm", L + "ForeArm", L + "Hand"))]
             for L, _ in LADOS}
    braco_solto = {L: {n: PB[p3.P + n].matrix_basis.copy() for n in BRACO[L]} for L in BRACO}
    DEDOS = {L: [n for n in BRACO[L] if n.startswith(L + "Hand") and n != L + "Hand"] for L in BRACO}
    dedos_pose = {}
    polo_ok = {}

    def por_mao(lado, W, dedos_q, palma_q, polo):
        """Punho em W, dedos pra `dedos_q` e palma pra `palma_q` (mundo), cotovelo do lado do `polo` (a Flexão de Braço e a Prancha):
        o antebraço gira (pronação/supinação) até a linha dos nós (indicador → mínimo) ficar na direção certa e o punho só acerta a
        palma, sem torcer."""
        for n, M in braco_solto[lado].items():
            PB[p3.P + n].matrix_basis = M.copy()
        iks[lado].mute = False
        punhos[lado].location = W
        polos[lado].location = polo
        p3.atualizar()
        if lado not in polo_ok:
            polo_ok[lado] = p3.acertar_polo(rig, iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        nomes_ = (lado + "Arm", lado + "ForeArm")
        mats = [PB[p3.P + n].matrix.copy() for n in nomes_]
        iks[lado].mute = True
        for n, M in zip(nomes_, mats):
            PB[p3.P + n].matrix = M
            p3.atualizar()
        dedos_q = Vector(dedos_q).normalized()
        palma_q = Vector(palma_q)
        palma_q = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
        f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
        nos_q = dedos_q.cross(palma_q) * (1 if lado == "Left" else -1)
        ax = (f1 - f0).normalized()
        quer = nos_q - ax * nos_q.dot(ax)
        tem = pg._base(rig, lado)[1]
        tem = tem - ax * tem.dot(ax)
        if quer.length > 1e-6 and tem.length > 1e-6:
            quer.normalize()
            tem.normalize()
            p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(math.atan2(tem.cross(quer).dot(ax), tem.dot(quer)), 3, ax))
        n_m, _, y_m = pg._base(rig, lado)[:3]
        n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
        F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
        pq = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
        F_quer = Matrix((dedos_q, pq, dedos_q.cross(pq))).transposed()
        p3.girar_osso(rig, lado + "Hand", F_quer @ F_tem.transposed())
        if lado in dedos_pose:
            for n, M in dedos_pose[lado].items():
                PB[p3.P + n].matrix_basis = M.copy()
            p3.atualizar()
        return (p3.cabeca(rig, lado + "Hand") - W).length

    # ── braço de baixo: EM PÉ (o cotovelo bem embaixo do ombro), o antebraço deitado pra frente (−Y, perpendicular ao corpo), de lado
    # (neutro: a palma virada pros pés, o polegar pra cima, o dedo mínimo no chão) e o punho fechado ─────────────────────────────────────
    PALMA_Q = Vector((1.0, 0.0, 0.0))
    ALFA = [0.0]                          # o antebraço descendo pra frente (graus abaixo da horizontal, do cotovelo ao punho)

    def braco_baixo():
        S = c(BX + "Arm")
        E = S - Vector((0, 0, Lb))
        a = math.radians(ALFA[0])
        dq = Vector((0.0, -math.cos(a), -math.sin(a)))
        W = E + dq * La
        polo = E + Vector((0, 0.40, -0.30))
        return por_mao(BX, W, dq, PALMA_Q, polo), W, polo, dq

    def antebraco_z(lado):
        """Pele mais baixa do antebraço (z, m): a da parte perto do cotovelo (até PERTO_COTOVELO do centro do cotovelo) e a do resto."""
        co, _, (nomes, dono) = _malha(bon)
        A = co[_grupo(nomes, dono, (lado + "ForeArm",))]
        perto = np.linalg.norm(A - np.array(c(lado + "ForeArm")), axis=1) <= PERTO_COTOVELO
        return float(A[perto][:, 2].min()), float(A[~perto][:, 2].min())

    MAO_B = tuple([BX + "Hand"] + DEDOS[BX])

    def mao_z():
        return float(pele(MAO_B)[:, 2].min())

    def fechar_punho():
        """Os dedos de baixo fecham em volta de um cilindro de PUNHO_MM no vão da mão (pg.fechar_em_volta), com o polegar novo dando a
        volta por cima: a mão fechada sem segurar nada. A pose dos dedos fica guardada (vale em todo quadro)."""
        pg.mao_de_referencia(rig, BX)
        r = PUNHO_MM / 2000.0
        g, env = pg.ponto_na_mao(bon, BX, r)
        angs = pg.fechar_em_volta(bon, BX, g, pg._base(rig, BX)[1], r)
        dedos_pose[BX] = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[BX]}
        print("PUNHO | cilindro de %.0f mm no vão da mão (envolve %.0f°) | dedos %s" % (PUNHO_MM, env, angs))

    def resolver_phi():
        """Inclinação do corpo (graus) em que a pele do antebraço perto do cotovelo encosta no chão (−AFUNDA_ANTEBRACO), com o braço em
        pé: mais inclinação = ombro mais alto."""
        lo, hi = 2.0, 35.0
        for _ in range(16):
            meio = (lo + hi) / 2
            deitar(meio)
            braco_baixo()
            if antebraco_z(BX)[0] > -AFUNDA_ANTEBRACO:
                hi = meio
            else:
                lo = meio
        return hi

    for volta in range(4):
        phi = resolver_phi()
        deitar(phi)
        braco_baixo()
        if volta == 0:
            fechar_punho()
            braco_baixo()
        lo, hi = -15.0, 25.0                 # o antebraço desce na ponta até o punho fechado encostar
        for _ in range(12):
            ALFA[0] = (lo + hi) / 2
            braco_baixo()
            if mao_z() > -AFUNDA_MAO:
                lo = ALFA[0]
            else:
                hi = ALFA[0]
        ALFA[0] = hi
        braco_baixo()
        print("LADO volta %d | corpo inclina %.3f° | antebraço desce %.2f° | antebraço perto/longe do cotovelo %s mm | punho %.1f mm" % (
            volta, phi, ALFA[0], "/".join("%.1f" % (z * 1000) for z in antebraco_z(BX)), mao_z() * 1000))
    PHI = phi
    deitar(PHI)
    e_b, W_B, POLO_B, DQ_B = braco_baixo()

    # ── braço de cima: a mão no quadril (a palma no lado de fora do quadril), o cotovelo pra cima e pra trás; os dedos seguem a linha do
    # antebraço deitada no plano da pele (o punho só estende, sem desviar de lado) ─────────────────────────────────────────────────────
    OFF_D = 0.045                         # o punho fica OFF_D m antes do ponto do quadril (pros dedos)
    H_rot = lambda: p3.mundo_osso(rig, "Hips").to_3x3()
    MAO = {"d_loc": MAO_LOCAL[2].copy(), "n_off": 0.03}   # direção dos dedos (no osso Hips) e o quanto o punho fica fora da pele

    def alvo_mao():
        Hw = p3.mundo_osso(rig, "Hips")
        P = Hw @ MAO_LOCAL[0]
        n = (Hw.to_3x3() @ MAO_LOCAL[1]).normalized()
        d = Hw.to_3x3() @ MAO["d_loc"]
        d = (d - n * d.dot(n)).normalized()
        return P, n, d

    def braco_cima():
        P, n, d = alvo_mao()
        W = P + n * MAO["n_off"] - d * OFF_D
        polo = (c(CM + "Arm") + W) / 2 + Vector((0.0, 0.15, 0.35))      # o cotovelo pra cima e pra trás
        return por_mao(CM, W, d, -n, polo)

    def alinhar_mao():
        """Os dedos de cima passam a apontar pra linha do antebraço deitada no plano da pele do quadril (o punho sem desviar de lado)."""
        P, n, _ = alvo_mao()
        f = c(CM + "Hand") - c(CM + "ForeArm")
        f = (f - n * f.dot(n)).normalized()
        MAO["d_loc"] = H_rot().inverted() @ f

    MAO_C = tuple([CM + "Hand"] + DEDOS[CM])

    def mao_quadril(so_palma=False):
        """Menor distância com sinal (m) da mão de cima (ou só da palma) até a pele do quadril."""
        co, tri, (nomes, dono) = _malha(bon)
        return distancia(co, tri, nomes, dono, (CM + "Hand",) if so_palma else MAO_C, QUAD)

    p3.soltar_dedos(rig, CM)              # dedos soltos, lado a lado (a mão espalmada no quadril)
    pg.juntar_dedos(rig, CM, 0.6)
    dedos_pose[CM] = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[CM]}
    def encostar_mao(so_palma=True):
        """A mão (a PALMA, ou a mão inteira) chega na pele do quadril (o punho anda na normal da pele) até encostar (−AFUNDA_MAO_QUADRIL)."""
        lo, hi = MAO["n_off"] - 0.04, MAO["n_off"] + 0.04
        for _ in range(15):
            MAO["n_off"] = (lo + hi) / 2
            braco_cima()
            if mao_quadril(so_palma) < -AFUNDA_MAO_QUADRIL:
                lo = MAO["n_off"]
            else:
                hi = MAO["n_off"]
        MAO["n_off"] = hi
        return braco_cima()

    def dedos_no_quadril():
        """Com a palma encostada: cada dedo (fora o polegar) gira só na base, do mais esticado (−20°) pro mais dobrado (DEDOS_MAX), até a pele
        dele encostar na do quadril (−AFUNDA_MAO_QUADRIL) — os dedos acompanham a curva do quadril (a mão relaxada); se não chega, fica em
        DEDOS_MAX."""
        palma, eixo_nos = pg._base(rig, CM)[:2]
        co, tri, (nomes, dono) = _malha(bon)
        b = _bvh(co, tri, _grupo(nomes, dono, QUAD))

        def perto(P):
            menor = 1e9
            for p in P:
                v = Vector(p)
                loc, nor, idx, dist = b.find_nearest(v)
                if loc is not None:
                    menor = min(menor, -dist if (dist < 0.03 and (v - loc).dot(nor) < 0) else dist)
            return menor
        out = []
        for d in p3.DEDOS:
            ossos = ["%sHand%s%d" % (CM, d, i) for i in (1, 2, 3)]
            Pd = co[_grupo(nomes, dono, ossos)]
            h = p3.cabeca(rig, ossos[0])
            f = (p3.ponta(rig, ossos[0]) - h).normalized()
            sinal = 1 if eixo_nos.cross(f).dot(palma) > 0 else -1          # + = gira pro lado da palma (pro quadril)
            escolha = DEDOS_MAX
            for g in np.arange(-20.0, DEDOS_MAX + 0.01, 0.5):
                if perto(pg._rot(Pd, np.array(h), eixo_nos, g * sinal)) <= -AFUNDA_MAO_QUADRIL:
                    escolha = float(g)
                    break
            if escolha:
                p3.girar_osso(rig, ossos[0], p3.rot_eixo(escolha * sinal, eixo_nos))
            out.append("%s %+.1f°" % (d, escolha))
        dedos_pose[CM] = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[CM]}
        return out

    for _ in range(3):
        braco_cima()
        alinhar_mao()
        encostar_mao()
    giros = dedos_no_quadril()
    e_c = encostar_mao(so_palma=False)            # a mão inteira (palma ou dedos) encostando
    jj = ck.posicoes(rig)
    print("MÃO DE CIMA | punho a %.1f mm do alvo | afastada %.1f mm da pele | mão × quadril %.2f mm | dedos %s | cotovelo %.1f° | punho "
          "%.1f° (flexão %.1f, desvio %.1f)" % (e_c * 1000, MAO["n_off"] * 1000, mao_quadril() * 1000, ", ".join(giros),
                                               ck.medir_juntas(rig)["cotoveloE"], ck.medir_juntas(rig)["punhoE"], tc.punho_flexao(jj)[0],
                                               tc.punho_desvio(jj)[0]))
    jj = ck.posicoes(rig)
    print("PRANCHA LATERAL | inclina %.2f° | ombro de baixo z %.3f | punho a %.1f mm do alvo | quadril × reta lado %+.1f frente %+.1f mm | "
          "cotovelo %.1f° | braço × horizontal %.1f | rolagem %s | coluna %.1f | cabeça × tronco %.1f, de lado %.1f" % (
              PHI, c(BX + "Arm").z, e_b * 1000, tc.quadril_linha_lateral(jj)[0], tc.quadril_linha_ombro_tornozelo(jj)[0],
              ck.medir_juntas(rig)["cotoveloD"], ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["Arm", "ForeArm"]})[1],
              "/".join("%.1f" % a for a in tc.corpo_rolagem(jj)), tc.coluna(jj)[0], tc.cabeca_tronco(jj)[0], tc.cabeca_lado(jj)[0]))

    # ── descida: o antebraço e o pé de baixo PARADOS. A perna de baixo (esticada) gira em Y em volta do tornozelo (ψ) — o pé fica deitado
    # na borda de fora no chão e o tornozelo vira (inversão) —; a pelve vai com a articulação do quadril de baixo e gira γ; a coluna
    # dobra de lado (λ) o tanto que leva o ombro de baixo de volta a um braço do cotovelo parado; a perna de cima gira no quadril até o pé
    # dela (ou a canela) encostar na de baixo (o pé de cima só desliza um pouco por cima do de baixo, sem virar). Embaixo: ψ até a
    # panturrilha de baixo encostar no chão; γ = GAMA_B. A pose de cada tentativa sai direto das matrizes da posição de cima (contas, sem
    # mexer no Blender) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
    MEXE = ("Hips", "Spine", "Spine1", "Neck") + tuple(L + n for L, _ in LADOS for n in ("UpLeg", "Leg", "Foot", "ToeBase"))
    cima_pose = {n: PB[p3.P + n].matrix_basis.copy() for n in MEXE}
    PE_B0 = np.array(c(BX + "Foot")), np.array(c(BX + "ToeBase"))        # os pés na posição de cima (pro "andou" do info)
    PE_C0 = np.array(c(CM + "Foot")), np.array(c(CM + "ToeBase"))
    S0 = c(BX + "Arm")
    E0 = c(BX + "ForeArm")                 # o cotovelo de baixo (parado no chão)
    LB0 = (S0 - E0).length
    H1, H2 = c("Spine"), c("Spine1")       # onde a coluna dobra (as cabeças dos ossos)
    A0 = {L: np.array(c(L + "Foot")) for L, _ in LADOS}      # os tornozelos na posição de cima (o de baixo fica parado)
    Q0 = {L: np.array(c(L + "UpLeg")) for L, _ in LADOS}     # as articulações do quadril na posição de cima
    co0, tri0, (nomes0, dono0) = _malha(bon)

    def _np4(M):
        return np.array([list(r) for r in M])

    def _ry(g):
        return np.array(Matrix.Rotation(math.radians(g), 3, "Y"))

    def _ang_y(a, b):
        """Ângulo (graus) do giro em Y que leva a direção de `a` até a de `b` (no plano XZ)."""
        return math.degrees(math.atan2(a[2] * b[0] - a[0] * b[2], a[0] * b[0] + a[2] * b[2]))

    M_COXA0 = _np4(p3.mundo_osso(rig, BX + "UpLeg"))
    Mi = np.linalg.inv(M_COXA0)
    ic = np.where(_grupo(nomes0, dono0, (BX + "UpLeg",)))[0]
    ic = ic[np.linalg.norm(co0[ic] - Q0[BX], axis=1) > 0.15]
    RESTO = co0[np.concatenate([ic, np.where(_grupo(nomes0, dono0, (BX + "Leg",)))[0]])] @ Mi[:3, :3].T + Mi[:3, 3]
    m_pb = _grupo(nomes0, dono0, PEB)
    BVH_PB = BVHTree.FromPolygons([tuple(p) for p in co0], [tuple(x) for x in tri0[m_pb[tri0].all(axis=1)]], all_triangles=True)
    P_PC0 = co0[_grupo(nomes0, dono0, PEC)]

    def perna_z(psi):
        """Pele mais baixa (z, m) da perna de baixo (a coxa longe do quadril, o joelho e a perna) girada `psi` em volta do tornozelo."""
        R = _ry(psi)
        M = M_COXA0.copy()
        M[:3, :3] = R @ M[:3, :3]
        M[:3, 3] = R @ (M[:3, 3] - A0[BX]) + A0[BX]
        return float((RESTO @ M[:3, :3].T + M[:3, 3])[:, 2].min())

    def pelve(psi, gam):
        """(R, t) da pelve (x → R x + t): a articulação do quadril de baixo vai pro lugar dela na perna de baixo girada `psi` em volta do
        tornozelo, e a pelve gira `gam`."""
        qb = A0[BX] + _ry(psi) @ (Q0[BX] - A0[BX])
        Rg = _ry(gam)
        return Rg, qb - Rg @ Q0[BX]

    def ombro_em(psi, gam, lam):
        """O ombro de baixo com a pelve de pelve(psi, gam) e a coluna dobrada `lam` (Spine e Spine1 girando em Y nas cabeças)."""
        Rg, t = pelve(psi, gam)
        R1, R2 = _ry(lam * LOMBAR_DIV[0]), _ry(lam * LOMBAR_DIV[1])
        h1, h2, s0 = np.array(H1), np.array(H2), np.array(S0)
        return Rg @ h1 + t + R1 @ Rg @ (h2 - h1) + R2 @ R1 @ Rg @ (s0 - h2)

    def lambda_do_braco(psi, gam):
        """A flexão lateral da coluna (graus) que deixa o ombro de baixo a um braço (LB0) do cotovelo parado; de 2 soluções, a do braço
        mais perto da vertical. Devolve (λ, δ = quanto o braço inclina em Y em volta do cotovelo, + = o ombro pros pés)."""
        e0 = np.array(E0)
        f = lambda lam: float(np.linalg.norm(ombro_em(psi, gam, lam) - e0)) - LB0
        raizes = []
        grade = np.arange(-20.0, 45.01, 1.0)
        vals = [f(x) for x in grade]
        for a, b, fa, fb in zip(grade[:-1], grade[1:], vals[:-1], vals[1:]):
            if fa == 0 or fa * fb < 0:
                lo, hi, flo = a, b, fa
                for _ in range(40):
                    meio = (lo + hi) / 2
                    fm = f(meio)
                    if (fm > 0) == (flo > 0):
                        lo, flo = meio, fm
                    else:
                        hi = meio
                lam = (lo + hi) / 2
                raizes.append((abs(_ang_y(np.array(S0 - E0), ombro_em(psi, gam, lam) - e0)), lam))
        if not raizes:
            print("AVISO: sem flexão da coluna que leve o ombro a um braço do cotovelo (ψ %.2f° γ %.2f°)" % (psi, gam))
            return 0.0, 0.0
        lam = min(raizes)[1]
        return lam, _ang_y(np.array(S0 - E0), ombro_em(psi, gam, lam) - e0)

    def pe_x_pe(desl):
        """Menor distância com sinal (m) do pé de cima (andado `desl`, sem virar) até a pele do pé de baixo parado (− = entrou)."""
        menor = 1e9
        for p in P_PC0 + desl:
            v = Vector(p)
            loc, nor, idx, dist = BVH_PB.find_nearest(v)
            if loc is not None:
                menor = min(menor, -dist if (dist < 0.03 and (v - loc).dot(nor) < 0) else dist)
        return menor

    M_COXA0_C = _np4(p3.mundo_osso(rig, CM + "UpLeg"))
    Mi_c = np.linalg.inv(M_COXA0_C)
    CANELA_C = co0[_grupo(nomes0, dono0, (CM + "Leg",))] @ Mi_c[:3, :3].T + Mi_c[:3, 3]     # a canela de cima, presa na coxa de cima
    m_lb = _grupo(nomes0, dono0, (BX + "Leg",))
    co_lb = co0 @ Mi[:3, :3].T + Mi[:3, 3]                                                  # a canela de baixo, na coxa de baixo
    BVH_LB = BVHTree.FromPolygons([tuple(p) for p in co_lb], [tuple(x) for x in tri0[m_lb[tri0].all(axis=1)]], all_triangles=True)

    def canela_x_canela(Mt, Mb):
        """Menor distância com sinal (m) da canela de cima até a pele da de baixo (− = entrou), no referencial da coxa de baixo."""
        A = np.linalg.inv(Mb) @ Mt
        menor = 1e9
        for p in CANELA_C @ A[:3, :3].T + A[:3, 3]:
            v = Vector(p)
            loc, nor, idx, dist = BVH_LB.find_nearest(v)
            if loc is not None:
                menor = min(menor, -dist if (dist < 0.03 and (v - loc).dot(nor) < 0) else dist)
        return menor

    def perna_cima(psi, gam):
        """Giro (graus, em Y, no quadril) da perna de cima, além do da pelve, até o pé dela encostar no de baixo (−AFUNDA_PE) — ou a canela
        dela na de baixo, o que vier primeiro; e o quanto o pé de cima andou (m)."""
        Rg, t = pelve(psi, gam)
        T = Rg @ Q0[CM] + t
        v0 = Rg @ (A0[CM] - Q0[CM])
        Mb = M_COXA0.copy()                                   # a coxa de baixo girada psi em volta do tornozelo
        Rp = _ry(psi)
        Mb[:3, :3] = Rp @ Mb[:3, :3]
        Mb[:3, 3] = Rp @ (Mb[:3, 3] - A0[BX]) + A0[BX]
        Mt0 = M_COXA0_C.copy()                                # a coxa de cima levada pela pelve
        Mt0[:3, :3] = Rg @ Mt0[:3, :3]
        Mt0[:3, 3] = Rg @ Mt0[:3, 3] + t

        def m_cima(b):
            M = Mt0.copy()
            Rb = _ry(b)
            M[:3, :3] = Rb @ M[:3, :3]
            M[:3, 3] = Rb @ (M[:3, 3] - T) + T
            return M
        lo, hi = psi - gam - 8.0, psi - gam + 8.0     # perto do giro da perna de baixo (a distância com sinal só vale perto da pele)
        for _ in range(20):
            meio = (lo + hi) / 2
            if min(pe_x_pe(T + _ry(meio) @ v0 - A0[CM]), canela_x_canela(m_cima(meio), Mb)) > -AFUNDA_PE:
                lo = meio
            else:
                hi = meio
        bt = (lo + hi) / 2
        return bt, T + _ry(bt) @ v0 - A0[CM]

    estado = {"t": 0.0, "u": 0.0, "psi": 0.0, "gam": 0.0, "lam": 0.0, "delta": 0.0, "bt": 0.0, "desl": 0.0}

    def pose_descida(psi, gam):
        lam, delta = lambda_do_braco(psi, gam) if (psi or gam) else (0.0, 0.0)
        bt, desl = perna_cima(psi, gam) if (psi or gam) else (0.0, np.zeros(3))
        Rg, t = pelve(psi, gam)
        for n, M in cima_pose.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        if psi or gam:
            q = Vector(Q0[BX])
            p3.girar_osso(rig, "Hips", Matrix(Rg.tolist()), pivo=q, mover=Vector(Rg @ Q0[BX] + t) - q)
            for n, f in zip(("Spine", "Spine1"), LOMBAR_DIV):
                p3.girar_osso(rig, n, Matrix.Rotation(math.radians(lam * f), 3, "Y"))
            # perna de baixo: gira ψ no mundo (a pelve já girou γ) e o pé volta pro lugar (gira −ψ no tornozelo)
            p3.girar_osso(rig, BX + "UpLeg", Matrix.Rotation(math.radians(psi - gam), 3, "Y"))
            p3.girar_osso(rig, BX + "Foot", Matrix.Rotation(math.radians(-psi), 3, "Y"))
            # perna de cima: gira `bt` além da pelve até o pé encostar no de baixo; o pé fica sem virar (gira de volta no tornozelo)
            p3.girar_osso(rig, CM + "UpLeg", Matrix.Rotation(math.radians(bt), 3, "Y"))
            p3.girar_osso(rig, CM + "Foot", Matrix.Rotation(math.radians(-(gam + bt)), 3, "Y"))
        S = c(BX + "Arm")                  # polo no plano (ombro, punho, cotovelo parado): o cotovelo fica no mesmo lugar
        a = W_B - S
        nrm = (E0 - S) - a * ((E0 - S).dot(a) / a.length_squared)
        por_mao(BX, W_B, DQ_B, PALMA_Q, E0 + nrm.normalized() * 0.3 if nrm.length > 1e-6 else POLO_B)
        braco_cima()
        estado.update(psi=psi, gam=gam, lam=lam, delta=delta, bt=bt, desl=float(np.linalg.norm(desl)))

    # ── embaixo: a perna de baixo gira até a pele mais baixa dela (a panturrilha) encostar no chão ───────────────────────────────────────
    lo, hi = 0.0, -25.0                   # − = a ponta do quadril desce (o quadril fica pra −X dos tornozelos)
    for _ in range(30):
        meio = (lo + hi) / 2
        if perna_z(meio) > -AFUNDA_PERNA:
            lo = meio
        else:
            hi = meio
    PSI_B = (lo + hi) / 2
    LAM_B, DELTA_B = lambda_do_braco(PSI_B, GAMA_B)
    print("EMBAIXO | a perna de baixo gira %.2f° no tornozelo | a pelve gira %.2f° | a coluna dobra %.2f° | o braço de baixo inclina %+.2f° | "
          "o pé de cima desliza %.1f mm" % (PSI_B, GAMA_B, LAM_B, DELTA_B, np.linalg.norm(perna_cima(PSI_B, GAMA_B)[1]) * 1000))

    # ── a mão de cima em 5 pontos da descida: os dedos na linha do antebraço e a mão encostada na pele (a pele do quadril mexe um pouco com
    # a coluna dobrando); no meio, interpolado ──────────────────────────────────────────────────────────────────────────────────────────
    TAB_MAO = []
    for u_ in (0.0, 0.25, 0.5, 0.75, 1.0):
        pose_descida(PSI_B * u_, GAMA_B * u_)
        for _ in range(2):
            alinhar_mao()
            encostar_mao()
        encostar_mao(so_palma=False)
        TAB_MAO.append((u_, MAO["d_loc"].copy(), MAO["n_off"]))
    print("MÃO DE CIMA NA DESCIDA | afastada da pele %s mm" % "/".join("%.1f" % (x[2] * 1000) for x in TAB_MAO))

    def mao_em(u):
        for (u0, d0, n0), (u1, d1, n1) in zip(TAB_MAO[:-1], TAB_MAO[1:]):
            if u <= u1 + 1e-9:
                f = (u - u0) / (u1 - u0)
                MAO["d_loc"], MAO["n_off"] = d0.lerp(d1, f).normalized(), n0 + (n1 - n0) * f
                return

    def pose(t):
        """t = 0 (e 1): prancha lateral montada; o quadril desce no meio do ciclo (t = 0,5 embaixo) e sobe."""
        u = descida(t)
        estado["t"], estado["u"] = t, u
        mao_em(u)
        pose_descida(PSI_B * u, GAMA_B * u)

    def baixo_z():
        """Pele mais baixa (z, m) do quadril (Hips e a coxa de baixo até 18 cm da articulação), da coxa de baixo e da perna de baixo."""
        co, _, (nomes, dono) = _malha(bon)
        H = np.array(c(BX + "UpLeg"))
        Pc = co[_grupo(nomes, dono, (BX + "UpLeg",))]
        zq = min(float(co[_grupo(nomes, dono, ("Hips",))][:, 2].min()), float(Pc[np.linalg.norm(Pc - H, axis=1) < 0.18][:, 2].min()))
        return zq, float(Pc[:, 2].min()), float(co[_grupo(nomes, dono, (BX + "Leg",))][:, 2].min())


    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        co, tri, (nomes, dono) = _malha(bon)
        pp = distancia(co, tri, nomes, dono, PEC, PEB)
        mq = distancia(co, tri, nomes, dono, MAO_C, QUAD)
        zp, zl = antebraco_z(BX)
        zq, zc, zr = baixo_z()
        anda = lambda L, P0: max(float(np.linalg.norm(np.array(c(L + "Foot")) - P0[0])), float(np.linalg.norm(np.array(c(L + "ToeBase")) - P0[1])))
        return ("u %.3f | perna de baixo gira %.2f° pelve %.2f° coluna %.2f° braço %+.2f° perna de cima %+.2f° | quadril × reta lado %+.0f frente %+.0f mm | "
                "rolagem %s | coluna %.1f | cabeça × tronco %.1f de lado %.1f | joelho %.0f/%.0f° | coxa_abducao %s | cotovelo de baixo %.0f°"
                " de cima %.0f° | braço × horizontal %.1f | antebraço × frente %.0f | cotovelo andou %.1f mm | punho %+.1f mm | antebraço "
                "perto/longe %+.1f/%+.1f mm | pé de baixo z %+.1f mm, andou %.2f mm | pé de cima andou %.2f mm | pé × pé %+.1f mm | mão × "
                "quadril %+.1f mm | quadril z %.1f coxa %.1f perna %.1f mm" % (
                    estado["u"], estado["psi"], estado["gam"], estado["lam"], estado["delta"], estado["bt"],
                    tc.quadril_linha_lateral(jj)[0], tc.quadril_linha_ombro_tornozelo(jj)[0],
                    "/".join("%.1f" % a for a in tc.corpo_rolagem(jj)), tc.coluna(jj)[0], tc.cabeca_tronco(jj)[0], tc.cabeca_lado(jj)[0],
                    juntas["joelhoE"], juntas["joelhoD"], "/".join("%.1f" % a for a in tc.coxa_abducao(jj)), juntas["cotoveloD"],
                    juntas["cotoveloE"], ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["Arm", "ForeArm"]})[1],
                    tc.antebraco_frente(jj)[1], (c(BX + "ForeArm") - E0).length * 1000, mao_z() * 1000, zp * 1000, zl * 1000,
                    float(pele(PEB)[:, 2].min()) * 1000, anda(BX, PE_B0) * 1000, anda(CM, PE_C0) * 1000, pp * 1000, mq * 1000,
                    zq * 1000, zc * 1000, zr * 1000))

    for t in (0.0, T_DESCE[0], (T_DESCE[0] + T_DESCE[1]) / 2, 0.5, (T_SOBE[0] + T_SOBE[1]) / 2, 1.0):
        pose(t)
        co = _malha(bon)[0]
        print("t=%.3f | corpo x %.3f → %.3f, y %.3f → %.3f, z %.3f → %.3f | %s" % (
            t, co[:, 0].min(), co[:, 0].max(), co[:, 1].min(), co[:, 1].max(), co[:, 2].min(), co[:, 2].max(), info()), flush=True)

    return Cena(pose, [], pegadas=[], apoio_mm=0.0, foco_luz=(0, -0.1, 0.3),
                camera_video=((0.6, -3.6, 1.0), (0, 0, 0.3), 50), info=info)
