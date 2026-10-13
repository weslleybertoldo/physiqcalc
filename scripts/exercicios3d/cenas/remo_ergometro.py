# Remo Ergômetro — cena da fábrica 3D (lote 14, 12/10/2026). CARDIO no remo ergômetro de ar com monotrilho (e3.remo, peça nova; o
# Concept2 RowErg, o antigo Model D). Sentado no carrinho que corre no trilho, os pés presos nos apoios inclinados, as 2 mãos no manete.
# CÍCLICO, como a Corrida e a Caminhada na Esteira, a Bicicleta e o Elíptico: t = 0 → 1 é UMA remada e a pose em t = 1 é IGUAL à de t = 0
# (a ficha tem "ciclo": true e o app repete o clipe). t = 0 = PEGADA; a PASSADA vai até t = 1/3 (o FINAL) e a VOLTA de 1/3 a 1.
# Cadência de 24 remadas/min: 1 remada = 2,5 s (= ida_s da ficha).
# Técnica (só o que foi lido):
#  · Pegada (Concept2, Indoor Rowing Technique): "Arms are straight; head is neutral; shoulders are level and not hunched." / "Upper body is
#    leaning forward from the hips with the shoulders in front of the hips." / "Shins are vertical, or as close to vertical as is
#    comfortable for you. Shins should not move beyond perpendicular." / "Heels may lift as needed." O joelho perto da axila (Concept2,
#    Getting Comfortable: "you want your knees to be in the general vicinity of your arm pits at the catch position").
#  · Passada, na ordem pernas → tronco → braços (Concept2: "Start the drive by pressing with your legs, and then swing the back through
#    the vertical position before finally adding the arm pull."; ACSM: "The arms remain straight until the knees are mostly extended, and
#    then the elbows flex bringing the oar handle into the upper stomach"; manual dos Models D e E: "Halfway through the drive, the arms are
#    still straight and the shoulders are relaxed."); as mãos em linha reta (Concept2: "Hands move in a straight line to and from the
#    flywheel.").
#  · Final (Concept2): "Upper body is leaning back slightly, using good support from the core muscles." / "Legs are extended and handle is
#    held lightly below your ribs." / "Shoulders should be low with wrists and grip relaxed. Wrists should be flat."; ExRx (Row Ergometer):
#    "pull handlebar to midsection, forearms horizontal"; free-exercise-db: "squeezing your shoulders back".
#  · Volta, na ordem braços → tronco → pernas (Concept2: "Extend your arms until they straighten before leaning from the hips towards the
#    flywheel." / "Once your hands have cleared your knees, allow your knees to bend and gradually slide the seat forward on the
#    monorail."; ACSM: "A common error when rowing on a machine is allowing the knees to flex prior to the hands passing over the knees").
#  · Tempo: a volta leva o dobro da passada (Concept2: "Overall, your drive-recovery ratio should be 1:2"); 24 remadas/min (Concept2:
#    "keep your spm between 24 and 30"; ACE: "24-28 strokes per minute"; ACE/Crosby: "about 24 to 26 strokes per minute (spm)" em
#    intensidade média).
#  · Coluna neutra a remada toda, o tronco inclinando no quadril (Concept2: "leaning forward from the hips"; free-exercise-db: "To avoid
#    straining your back, use primarily your leg and hip muscles.").
# Como o rig faz: o pé fica preso no apoio a 41° (a sola na chapa, o fundo do calcanhar na borda de baixo) e, quando a dorsiflexão do
# tornozelo passaria de DF_MAX, o calcanhar sobe girando na bola do pé (que fica na chapa, embaixo da tira). A pelve (osso Hips) gira em
# volta do meio dos quadris (o tronco inclina no quadril, a coluna fica neutra) e anda com o carrinho; a altura do quadril é a que põe a
# pele do glúteo no assento em todo quadro (a pelve rola no glúteo quando o tronco inclina) e o carrinho anda com o ponto do glúteo que
# encosta (sem escorregar). As pernas vão por IK até o tornozelo (o joelho no plano quadril–tornozelo–frente). A cabeça olha pra frente. As
# escápulas abrem na pegada e fecham no final. O manete anda numa reta horizontal na altura da saída da corrente: com os braços esticados ele
# fica onde os braços alcançam (do ombro do quadro) e, puxando, vai até o ponto do final (preso no tronco); o manete gira em volta do
# comprimento dele seguindo os antebraços e as mãos vão por IK até as manoplas (Maos.segurar com zerar), com os dedos fechados UMA vez
# (a mão fica rígida na manopla). O remo é montado em volta do corpo na pegada: o apoio dos pés onde o calcanhar fica, o assento embaixo
# do glúteo, o manete nas mãos e a carenagem do volante na frente dele.
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

LADOS = (("Left", 1), ("Right", -1))      # s = +1 esquerdo (+X)
CADENCIA = 24.0           # remadas/min (Concept2 24–30; ACE 24–28; ACE/Crosby 24–26 em intensidade média): 2,5 s por remada (= ida_s)
PASSADA = 1.0 / 3.0       # fração da remada na passada: a volta leva o dobro (Concept2: "drive-recovery ratio should be 1:2")
# ── o remo (Concept2 RowErg; o resto é escolha da fábrica, ver equip3d.remo) ───────────────────────────────────────────────────────────
Z_ASSENTO = 0.36          # Concept2: "Seat Height From Floor With standard legs 14in (36 cm)"
ALFA = 41.0               # apoio dos pés × horizontal (Soper & Hume 2005: "41° (currently used angle)" no Concept II)
Y_CALCANHAR = -0.45       # fundo do calcanhar nos apoios (y; o resto do remo sai do corpo)
X_PE = 0.11               # meio de cada pé a ±11 cm (os apoios ficam lado a lado, com a viga da frente no meio; no final as panturrilhas
                          # esticadas passam dos 2 lados do trilho)
MANETE = (0.483, 10.0)    # Concept2: "The handle measures 19" long and features an ergonomic 10-degree bend"
RAIO_PEGADOR = 0.016      # manopla de 32 mm (escolha da fábrica)
COMPR_PEGADOR = 0.19      # as 2 manoplas longas de borracha (a ponte de nylon no meio; foto do manete na loja da Concept2)
Z_M = 0.635               # altura do manete no final: embaixo das costelas, com os antebraços na horizontal (ExRx: "forearms horizontal")
INCLINA_M = 3.0           # a reta do manete sobe 3° pra frente, até a saída da corrente (Concept2: "Hands move in a straight line to and
                          # from the flywheel"; ACSM: "a straight-horizontal plane"): na pegada o manete fica ~5 cm mais alto, acima dos
                          # joelhos
# ── posições-chave ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
K_PEGADA = 120.0          # flexão do joelho na pegada, com a canela vertical (Penichet 2025: perna 56–57° = joelho ~123–124°; Engstrom
                          # 2023, dados brutos: ~128–131°; Cardoso 2024: 135°) — o teto que o boneco deixa sem a coxa entrar no tronco
T_PEGADA = -15.0          # tronco × vertical na pegada (− = à frente; Cardoso 2024: −26,8 ± 4,6 em ritmo moderado; free-exercise-db,
                          # Mazzone: "leaning slightly forward")
K_FINAL = 8.0             # flexão do joelho no final (Penichet 2025: perna 167–169° = ~11–13°; Engstrom: ~5–6°)
T_FINAL = 20.0            # tronco × vertical no final (+ = pra trás; Concept2: "leaning back slightly"; Cardoso: +27,2 ± 7,2)
ABRE_JOELHO = 10.0        # o joelho sai do plano quadril–tornozelo–frente pra fora (graus em volta da reta quadril → tornozelo; tudo na
                          # pegada e nada com a perna esticada): na pegada
                          # o tronco desce entre as coxas (Mazzone/Concept2: "allows the body to flex between the thighs") e a barriga
                          # não entra nelas; o joelho fica "just under or inside your arm pits" (Concept2)
EXT_PEGADA = 0.0          # lombar estendida na pegada (graus; sai junto com o tronco): a barriga sai de cima das coxas
DF_MAX = 30.0             # dorsiflexão máxima do tornozelo: o calcanhar sobe o que passar disso (Concept2: "Heels may lift as needed")
COTOVELO_RETO = 12.0      # cotovelo "esticado" na pegada e na 1ª metade da passada (graus; Engstrom 2023, dados brutos: ~15–17° na
                          # pegada): os braços dobram pelo ÂNGULO do cotovelo (suave), não pela distância — com o braço quase reto,
                          # encurtar 2 mm a distância já balança o cotovelo ~2 cm (o antebraço saltava 78 mm num quadro)
FOLGA_FINAL = 0.06        # o manete (o meio dele) a 6 cm da pele da barriga no final ("held lightly below your ribs")
PROTRAI, RETRAI = 6.0, 8.0    # escápulas: abertas na pegada (braços alcançando) e fechadas no final ("squeezing your shoulders back")
CABECA = 0.6              # a cabeça desfaz 60% da inclinação do tronco (olhando pra frente, pro monitor)
# ── tempo de cada parte dentro da passada (u) e da volta (v), 0 → 1 ───────────────────────────────────────────────────────────────────
PASSADA_PERNAS = (0.0, 0.72)     # as pernas empurram primeiro (o carrinho anda)
PASSADA_TRONCO = (0.12, 0.88)    # o tronco abre passando pela vertical no meio da passada
PASSADA_BRACOS = (0.50, 1.00)    # os braços só dobram depois que os joelhos estão quase esticados
VOLTA_BRACOS = (0.00, 0.25)      # os braços esticam primeiro
VOLTA_TRONCO = (0.20, 0.55)      # depois o tronco vai à frente no quadril
VOLTA_PERNAS = (0.42, 1.00)      # os joelhos só dobram depois que as mãos passam deles; o carrinho volta devagar
AFUNDA_ASSENTO = 0.002           # a pele do glúteo afunda no estofado
ASSENTO_ATRAS = 0.055            # o meio do assento 5,5 cm atrás da articulação do quadril (o carrinho anda preso nela): a borda da frente
                                 # fica 8 cm à frente dela, onde a coxa esticada do final ainda encosta sem afundar demais no estofado
GLUTEO = (-0.06, 0.08)           # a faixa da pele que encosta no assento: de 6 cm à frente a 8 cm atrás da articulação do quadril
AFUNDA_PE = 0.0008               # a sola afunda na chapa
TIRA = dict(largura=0.045, espessura=0.003, folga=0.0015)


def _ang(a, b):
    c = a.normalized().dot(b.normalized())
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def _suave(x):
    x = max(0.0, min(1.0, x))
    return (1.0 - math.cos(math.pi * x)) / 2.0


def _faixa(x, ab):
    return _suave((x - ab[0]) / (ab[1] - ab[0]))


def canais(t):
    """(pernas, tronco, braços) no quadro t, cada um de 0 (pegada) a 1 (final)."""
    t = t % 1.0
    if t < PASSADA:
        u = t / PASSADA
        return _faixa(u, PASSADA_PERNAS), _faixa(u, PASSADA_TRONCO), _faixa(u, PASSADA_BRACOS)
    v = (t - PASSADA) / (1.0 - PASSADA)
    return 1.0 - _faixa(v, VOLTA_PERNAS), 1.0 - _faixa(v, VOLTA_TRONCO), 1.0 - _faixa(v, VOLTA_BRACOS)


def _grupo(nm, partes):
    return np.isin(nm, partes)


def _cruza(co, tri, ma, mb, junta=None, raio=0.0):
    """Quanto a pele A entra na pele B (mm), só onde os triângulos se cruzam (o jeito do checagem3d.corpo_x_corpo); perto da `junta`
    (até `raio` m) é o vinco e não conta. Devolve (mm, ponto ou None)."""
    ta, tb = tri[ma[tri].all(axis=1)], tri[mb[tri].all(axis=1)]
    if not len(ta) or not len(tb):
        return 0.0, None
    ba = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in ta], all_triangles=True)
    bb = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in tb], all_triangles=True)
    pares = ba.overlap(bb)
    fundo, onde = 0.0, None
    for i in np.unique(ta[[p_[0] for p_ in pares]].ravel()) if pares else ():
        v = Vector(co[i])
        if junta is not None and (v - junta).length < raio:
            continue
        loc, nor, idx, dist = bb.find_nearest(v, 0.03)
        if loc is not None and (v - loc).dot(nor) < 0 and dist > fundo:
            fundo, onde = dist, co[i]
    return fundo * 1000, onde


def _distancia(bvh, P, alcance=0.5):
    """Menor distância (m, − = dentro) dos pontos P até a superfície da árvore."""
    menor = 1e9
    for p in P:
        v = Vector(p)
        loc, nor, idx, dist = bvh.find_nearest(v, alcance)
        if loc is not None:
            menor = min(menor, -dist if (dist < 0.03 and (v - loc).dot(nor) < 0) else dist)
    return menor


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta na manopla (padrão dos exercícios novos)
    pg.usar_cilindro(RAIO_PEGADOR * 2000)   # mão de referência de um cilindro de 32 mm (antes do Maos)
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)

    # ── 1) medidas do boneco em repouso ────────────────────────────────────────────────────────────────────────────────────────────
    L1 = (bon.cabeca_osso("LeftLeg") - bon.cabeca_osso("LeftUpLeg")).length
    L2 = (bon.cabeca_osso("LeftFoot") - bon.cabeca_osso("LeftLeg")).length
    H0 = {L: bon.cabeca_osso(L + "UpLeg") for L, _ in LADOS}
    M0 = (H0["Left"] + H0["Right"]) / 2
    X_H = (H0["Left"] - H0["Right"]).length / 2
    A0 = {L: bon.cabeca_osso(L + "Foot") for L, _ in LADOS}
    T0 = {L: bon.cabeca_osso(L + "ToeBase") for L, _ in LADOS}
    co0, tri0, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    nm = np.array(nomes + ["?"])[dono]
    pe_m = {L: _grupo(nm, [L + "Foot", L + "ToeBase"]) for L, _ in LADOS}
    calc0 = {}
    for L, _ in LADOS:
        P = co0[pe_m[L]]
        calc0[L] = Vector((float(np.median(P[:, 0])), float(P[:, 1].max()), float(P[:, 2].min()) + AFUNDA_PE))
    TORN0 = _ang(A0["Left"] - bon.cabeca_osso("LeftLeg"), T0["Left"] - A0["Left"])
    print("BONECO coxa %.4f canela %.4f quadris ±%.4f | tornozelo neutro %.1f°" % (L1, L2, X_H, TORN0), flush=True)

    # ── 2) o pé no apoio: sola na chapa a ALFA, fundo do calcanhar no ponto P0 (y, z); calcanhar levantado phi graus na bola do pé ────
    a = math.radians(ALFA)
    R_apoio = Matrix.Rotation(a, 4, "X")
    if (R_apoio.to_3x3() @ Vector((0.0, -1.0, 0.0))).z < 0:  # a ponta do pé (−Y) tem que subir
        R_apoio = Matrix.Rotation(-a, 4, "X")
    sobe_calc = 1.0 if (Matrix.Rotation(math.radians(5), 3, "X") @ Vector((0.0, 1.0, 0.0))).z > 0 else -1.0
    P0 = {"y": Y_CALCANHAR, "z": 0.06}

    def pe_mundo(L, phi):
        s = 1 if L == "Left" else -1
        M = Matrix.Translation(Vector((s * X_PE, P0["y"], P0["z"]))) @ R_apoio @ Matrix.Translation(-calc0[L])
        if phi:
            b = M @ T0[L]
            M = Matrix.Translation(b) @ Matrix.Rotation(math.radians(sobe_calc * phi), 4, "X") @ Matrix.Translation(-b) @ M
        return M

    def joelho(H, A):
        """Joelho (mundo) da perna com o quadril em H e o tornozelo em A, no plano que contém H, A e a frente (−Y) girado ABRE_JOELHO
        pra fora em volta da reta quadril → tornozelo."""
        d = A - H
        dl = min(d.length, L1 + L2 - 1e-6)
        u = d.normalized()
        f = Vector((0.0, -1.0, 0.0))
        w = (f - u * f.dot(u)).normalized()
        s_ = 1.0 if H.x > 0 else -1.0
        flex = 180.0 - math.degrees(math.acos(max(-1.0, min(1.0, (L1 * L1 + L2 * L2 - dl * dl) / (2 * L1 * L2)))))
        abre = ABRE_JOELHO * max(0.0, min(1.0, (flex - 10.0) / (K_PEGADA - 10.0)))   # só com o joelho dobrado: esticada, a perna
        w2 = Matrix.Rotation(math.radians(abre), 3, u) @ w                            # fica no plano (as panturrilhas não se tocam)
        if (w2.x - w.x) * s_ < 0:
            w2 = Matrix.Rotation(math.radians(-abre), 3, u) @ w
        w = w2
        ca = (L1 * L1 + dl * dl - L2 * L2) / (2 * L1 * dl)
        an = math.acos(max(-1.0, min(1.0, ca)))
        return H + (u * math.cos(an) + w * math.sin(an)) * L1

    def df(H, L, phi):
        """Dorsiflexão do tornozelo (graus) com o quadril em H e o calcanhar levantado phi; e o tornozelo e o joelho."""
        M = pe_mundo(L, phi)
        A, B = M @ A0[L], M @ T0[L]
        K = joelho(H, A)
        return _ang(A - K, B - A) - TORN0, A, K

    def calcanhar(H, L):
        """Quanto o calcanhar sobe (graus) pra dorsiflexão ficar em DF_MAX (0 se já fica)."""
        if df(H, L, 0.0)[0] <= DF_MAX:
            return 0.0
        lo, hi = 0.0, 45.0
        for _ in range(32):
            m = (lo + hi) / 2
            if df(H, L, m)[0] > DF_MAX:
                lo = m
            else:
                hi = m
        return (lo + hi) / 2

    # ── 3) pernas por IK (alvos nascem no tornozelo de repouso, polos bem à frente), pé e dedos com o giro posto a cada quadro ──────────
    alvos, polos, iks, rot_pe, rot_dedos = {}, {}, {}, {}, {}
    for L, s in LADOS:
        alvos[L] = p3.vazio("tornozelo_" + L, p3.ponta(rig, L + "Leg"))
        polos[L] = p3.vazio("polo_joelho_" + L, (s * 0.13, -1.6, 1.2))
        iks[L] = p3.ik(rig, L + "Leg", alvos[L], polos[L])
        rot_pe[L] = p3.travar_rotacao(rig, L + "Foot")
        rot_dedos[L] = p3.travar_rotacao(rig, L + "ToeBase")
    M_pe0 = {L: rot_pe[L].matrix_world.copy() for L, _ in LADOS}
    M_dedos0 = {L: rot_dedos[L].matrix_world.copy() for L, _ in LADOS}
    estado = {"t": 0.0, "phi": {"Left": 0.0, "Right": 0.0}}

    def girar_x(n, graus, **kw):
        """Gira o osso n em volta do X do mundo: graus > 0 leva o alto dele pra trás (+Y)."""
        g = Matrix.Rotation(math.radians(graus), 3, "X")
        if graus and ((g @ Vector((0, 0, 1))).y > 0) != (graus > 0):
            g = Matrix.Rotation(math.radians(-graus), 3, "X")
        p3.girar_osso(rig, n, g, **kw)

    def tronco_ang():
        d = c("Neck") - c("Hips")
        return math.degrees(math.atan2(d.y, d.z))

    def pelve(T, Hm, ext=0.0):
        """Pelve (Hips) girada em volta do meio dos quadris, que vai pra Hm, pra o tronco (quadril → pescoço) ficar a T graus da vertical
        (+ = pra trás); com a lombar estendida ext graus (Spine e Spine1 pra trás, metade cada) a pelve gira o que precisa a mais."""
        for n in ("Spine", "Spine1"):
            PB[p3.P + n].matrix_basis = Matrix()
        Tp = T
        for _ in range(3 if ext else 1):
            PB[p3.P + "Hips"].matrix_basis = Matrix()
            p3.atualizar()
            girar_x("Hips", Tp, pivo=M0, mover=Hm - M0)
            if ext:
                for n in ("Spine", "Spine1"):
                    PB[p3.P + n].matrix_basis = Matrix()
                p3.atualizar()
                for n in ("Spine", "Spine1"):
                    girar_x(n, ext / 2)
                Tp += T - tronco_ang()

    def pernas():
        for L, s in LADOS:
            H = c(L + "UpLeg")
            phi = calcanhar(H, L)
            M = pe_mundo(L, phi)
            A = M @ A0[L]
            alvos[L].location = A
            rot_pe[L].matrix_world = M.to_3x3().to_4x4() @ M_pe0[L]
            rot_dedos[L].matrix_world = pe_mundo(L, 0.0).to_3x3().to_4x4() @ M_dedos0[L]
            K = joelho(H, A)
            polos[L].location = K + ((K - H).normalized() + (K - A).normalized()).normalized() * 0.8
            estado["phi"][L] = phi
        p3.atualizar()

    def acertar_polos():
        for L, s in LADOS:
            e = p3.acertar_polo(rig, iks[L], L + "Leg", L + "UpLeg", L + "Foot")
            H, A = c(L + "UpLeg"), alvos[L].location.copy()
            Kc = joelho(H, A)
            melhor = None
            for k in range(-40, 41):
                iks[L].pole_angle = math.radians(e[1] + 0.25 * k)
                p3.atualizar()
                d = (c(L + "Leg") - Kc).length
                if melhor is None or d < melhor[0]:
                    melhor = (d, e[1] + 0.25 * k)
            iks[L].pole_angle = math.radians(melhor[1])
            p3.atualizar()
            print("POLO joelho %s: %.2f° (joelho a %.1f mm do da conta)" % (L, melhor[1], melhor[0] * 1000), flush=True)

    # ── 4) tronco e cabeça: a coluna fica como no repouso (neutra); a cabeça desfaz parte da inclinação (olha pra frente) ─────────────
    def cabeca(T):
        for n in ("Neck", "Head"):
            PB[p3.P + n].matrix_basis = Matrix()
        p3.atualizar()
        corr = -T * CABECA
        for n, fr in (("Neck", 0.5), ("Head", 0.5)):
            g = Matrix.Rotation(math.radians(corr * fr), 3, "X")
            if corr and ((corr > 0) != ((g @ Vector((0, 0, 1))).y > 0)):
                g = Matrix.Rotation(math.radians(-corr * fr), 3, "X")
            p3.girar_osso(rig, n, g)

    # escápulas: a clavícula gira em volta do eixo do tronco (pra frente = abre, pra trás = fecha), como na Remada Baixa na Polia
    base_ombro = {L: PB[p3.P + L + "Shoulder"].matrix_basis.copy() for L, _ in LADOS}

    def escapulas(k):
        """k de −1 (abertas, PROTRAI) a +1 (fechadas, RETRAI)."""
        for L, _ in LADOS:
            PB[p3.P + L + "Shoulder"].matrix_basis = base_ombro[L].copy()
        p3.atualizar()
        cima = (c("Neck") - c("Hips")).normalized()
        g = PROTRAI * k if k < 0 else RETRAI * k
        if g:
            for L, s in LADOS:
                p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * g), 3, cima))

    # ── 5) a altura do quadril que põe o glúteo no assento e a pegada (canela vertical, joelho K_PEGADA) ────────────────────────────────
    def gluteo():
        """Pele mais baixa do glúteo (Hips e coxas) embaixo do quadril (|x| < 0,12, na faixa GLUTEO em volta da articulação) e o meio
        do contato."""
        co, _, _ = ck._avaliar(bon.corpo, 1)
        Hm = (c("LeftUpLeg") + c("RightUpLeg")) / 2
        dy = co[:, 1] - Hm.y
        m = (_grupo(nm, ["Hips", "LeftUpLeg", "RightUpLeg"]) & (np.abs(co[:, 0]) < 0.12) & (dy > GLUTEO[0]) & (dy < GLUTEO[1]))
        P = co[m]
        zmin = float(P[:, 2].min())
        perto = P[P[:, 2] < zmin + 0.004]
        return zmin, float(perto[:, 1].mean())

    th = math.radians(K_PEGADA - 90.0)
    zH = 0.39
    for volta in range(4):
        for _ in range(60):                                   # P0 z: o tornozelo embaixo do joelho, o joelho a K_PEGADA
            Ay = (pe_mundo("Left", 0.0) @ A0["Left"]).y
            H = Vector((X_H, Ay + L1 * math.cos(th), zH))
            phi = calcanhar(H, "Left")
            A = pe_mundo("Left", phi) @ A0["Left"]
            H = Vector((X_H, A.y + L1 * math.cos(th), zH))
            K = joelho(H, A)
            erro = (zH + L1 * math.sin(th)) - K.z                # o joelho tem que ficar a L1 sin th acima do quadril
            erro2 = K.y - A.y                                     # e em cima do tornozelo (canela vertical)
            P0["z"] += erro + 0.0
            if abs(erro) < 1e-6:
                break
        Hm = Vector((0.0, A.y + L1 * math.cos(th), zH))
        pelve(T_PEGADA, Hm, EXT_PEGADA)
        pernas()
        if volta == 0:
            acertar_polos()
            pernas()
        zmin, yc = gluteo()
        zH += (Z_ASSENTO - AFUNDA_ASSENTO) - zmin
    HC = Vector((0.0, Hm.y, zH))
    print("PEGADA quadril (y %.4f z %.4f) | fundo do calcanhar (y %.4f z %.4f) | calcanhar sobe %.1f°" % (
        HC.y, HC.z, P0["y"], P0["z"], phi), flush=True)

    # ── 6) o final: calcanhar no fundo, joelho K_FINAL, tronco T_FINAL; o glúteo no assento ──────────────────────────────────────────
    A_f = pe_mundo("Left", 0.0) @ A0["Left"]
    d_f = math.sqrt(L1 * L1 + L2 * L2 + 2 * L1 * L2 * math.cos(math.radians(K_FINAL)))
    zHf = zH
    for volta in range(3):
        yHf = A_f.y + math.sqrt(d_f * d_f - (A_f.z - zHf) ** 2 - (A_f.x - X_H) ** 2)
        pelve(T_FINAL, Vector((0.0, yHf, zHf)))
        pernas()
        zmin, _ = gluteo()
        zHf += (Z_ASSENTO - AFUNDA_ASSENTO) - zmin
    HF = Vector((0.0, yHf, zHf))
    print("FINAL quadril (y %.4f z %.4f): o carrinho anda %.3f m" % (HF.y, HF.z, HF.y - HC.y), flush=True)

    # ── 7) tabela por quadro (periódica): a altura do quadril que põe a pele do glúteo no assento (a pelve rola no glúteo quando o tronco
    #    inclina) — 2 voltas, a 2ª com a altura corrigida; o carrinho anda preso na articulação do quadril ───────────────────────────────
    NQ = 48
    ts = np.linspace(0.0, 1.0, NQ + 1)
    dz = np.zeros(NQ + 1)
    ycont = np.zeros(NQ + 1)

    def corpo_base(t, dz_t):
        """Pelve, cabeça e pernas no quadro t (sem os braços), com a altura do quadril corrigida em dz_t."""
        p, q, b = canais(t)
        T = T_PEGADA + (T_FINAL - T_PEGADA) * q
        Hm = Vector((0.0, HC.y + (HF.y - HC.y) * p, HC.z + (HF.z - HC.z) * q + dz_t))
        pelve(T, Hm, EXT_PEGADA * (1.0 - q))
        cabeca(T)
        pernas()
        return p, q, b, T, Hm

    for volta in range(2):
        for k, t in enumerate(ts[:-1]):
            p_, q_, b_, T_, Hm_ = corpo_base(t, dz[k])
            zmin, y_ = gluteo()
            dz[k] += (Z_ASSENTO - AFUNDA_ASSENTO) - zmin
            ycont[k] = y_ - Hm_.y
        dz[-1], ycont[-1] = dz[0], ycont[0]
    print("QUADRIL corrige a altura de %+.1f a %+.1f mm na remada; o contato do glúteo fica de %+.3f a %+.3f m da articulação (y)" % (
        dz.min() * 1000, dz.max() * 1000, ycont.min(), ycont.max()), flush=True)

    def interp(tab, t):
        return float(np.interp(t % 1.0, ts, tab))

    # ── 8) mãos e manete ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
    maos = Maos(bon, RAIO_PEGADOR, polo_inicial=(0, 0.5, 0), polegar_modo="volta")
    b_ = math.radians(MANETE[1] / 2)
    XG = (MANETE[0] / 2 - COMPR_PEGADOR / 2) * math.cos(b_)   # meio de cada manopla, de lado (a origem do manete fica no meio da corda)

    def manete_M(Hc, rho):
        """Matriz do manete: origem no meio da corda das manoplas, girado rho rad em volta de X (+ = a frente desce)."""
        R = Matrix.Rotation(rho, 4, "X")
        if (R.to_3x3() @ Vector((0.0, -1.0, 0.0))).z > 0 and rho > 0:
            R = Matrix.Rotation(-rho, 4, "X")
        return Matrix.Translation(Hc) @ R

    def mao_local(s):
        """Dedos e palma da mão do lado s no referencial do manete: dedos ⟂ à manopla, pra frente; palma pra baixo (pegada pronada)."""
        eixo = Vector((s * math.cos(b_), math.sin(b_), 0.0))
        dq = Vector((0.0, -1.0, 0.0))
        dq = (dq - eixo * dq.dot(eixo)).normalized()
        pq = dq.cross(eixo).normalized()
        if pq.z > 0:
            pq = -pq
        return dq, pq

    polo_braco = {"k": 0.0}

    def polo(L, s):
        """Polo do cotovelo: pra fora, pra trás e pra baixo (no final o cotovelo vai pra trás, perto do corpo)."""
        return c(L + "Arm") + Vector((s * 0.22, 0.45, -0.45))

    def segurar(Hc, rho):
        M = manete_M(Hc, rho)
        R3 = M.to_3x3()
        for L, s in LADOS:
            g = M @ Vector((s * XG, 0.0, 0.0))
            dq, pq = mao_local(s)
            maos.segurar(L, g, R3 @ dq, R3 @ pq, polo=polo(L, s), alinhar=0.0, zerar=True)
        return M

    def antebraco_pitch():
        """Inclinação média dos antebraços pra baixo (rad, + = o punho abaixo do cotovelo), no plano de lado."""
        v = sum(((c(L + "Hand") - c(L + "ForeArm")).normalized() for L, _ in LADOS), Vector())
        return math.atan2(-v.z, -v.y)

    def maos_no_manete(Hc, rho0):
        rho = rho0
        for _ in range(3):
            M = segurar(Hc, rho)
            rho = antebraco_pitch()
        M = segurar(Hc, rho)
        return M, rho

    reta = {"y_f": 0.0}

    def z_reta(y):
        """Altura da reta do manete em y: Z_M no ponto do final, subindo INCLINA_M graus pra frente (−Y)."""
        return Z_M + (reta["y_f"] - y) * math.tan(math.radians(INCLINA_M))

    # alcance do braço "esticado" (cotovelo a COTOVELO_RETO): do ombro até o meio da manopla, medido na pegada
    corpo_base(0.0, dz[0])
    escapulas(-1.0)
    segurar(Vector((0.0, c("LeftArm").y - 0.5, Z_M + 0.05)), 0.3)
    polo_certo = {}
    for L, s in LADOS:                                        # pole_angle de cada braço (os ossos dos 2 lados não são espelhados)
        maos.iks[L].mute = False
        polo_certo[L] = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
    S = c("LeftArm")
    lo, hi = S.y - 0.85, S.y - 0.25
    rho = 0.3
    for _ in range(18):
        m = (lo + hi) / 2
        M, rho = maos_no_manete(Vector((0.0, m, Z_M + 0.05)), rho)
        if ck.medir_juntas(rig)["cotoveloE"] < COTOVELO_RETO:
            lo = m
        else:
            hi = m
    G = Vector((0.0, (lo + hi) / 2, Z_M + 0.05))
    M, rho = maos_no_manete(G, rho)
    R_RETO = (c("LeftArm") - M @ Vector((XG, 0.0, 0.0))).length
    print("BRAÇO esticado: ombro → meio da manopla %.4f m (cotovelo %.1f°) | polos dos braços %s" % (
        R_RETO, ck.medir_juntas(rig)["cotoveloE"], polo_certo), flush=True)

    # o braço como 2 segmentos: ombro → cotovelo (A_BR) e cotovelo → meio da manopla (C_BR, o antebraço e a mão); C_BR sai do alcance
    # medido com o cotovelo a COTOVELO_RETO
    A_BR = (c("LeftForeArm") - c("LeftArm")).length
    cr = math.cos(math.radians(COTOVELO_RETO))
    C_BR = -A_BR * cr + math.sqrt(A_BR * A_BR * cr * cr - A_BR * A_BR + R_RETO * R_RETO)

    def alcance(graus):
        """Distância ombro → meio da manopla com o cotovelo dobrado `graus`."""
        g = math.radians(graus)
        return math.sqrt(A_BR * A_BR + C_BR * C_BR + 2 * A_BR * C_BR * math.cos(g))

    def na_reta(r):
        """y do manete na reta dele com o meio de cada manopla a r do ombro do mesmo lado (à frente do ombro; média dos 2 lados)."""
        ys = []
        for L, s in LADOS:
            Sx = c(L + "Arm")
            lo, hi = Sx.y - r - 0.05, Sx.y                    # à frente do ombro: mais pra frente = mais longe
            for _ in range(40):
                y_ = (lo + hi) / 2
                if (Vector((s * XG, y_, z_reta(y_))) - Sx).length > r:
                    lo = y_
                else:
                    hi = y_
            ys.append((lo + hi) / 2)
        return sum(ys) / 2

    # o ponto do final, preso na pelve: o meio do manete FOLGA_FINAL à frente da pele da barriga, na altura Z_M
    corpo_base(PASSADA, interp(dz, PASSADA))
    escapulas(1.0)
    co, _, _ = ck._avaliar(bon.corpo, 1)
    barriga = co[_grupo(nm, ["Hips", "Spine", "Spine1", "Spine2"]) & (np.abs(co[:, 0]) < 0.06) & (np.abs(co[:, 2] - Z_M) < 0.012)]
    y_pele = float(barriga[:, 1].min())
    H_FIM = Vector((0.0, y_pele - FOLGA_FINAL, Z_M))
    reta["y_f"] = H_FIM.y
    r_f = sum((c(L + "Arm") - (H_FIM + Vector((s * XG, 0.0, 0.0)))).length for L, s in LADOS) / 2
    COT_FIM = math.degrees(math.acos(max(-1.0, min(1.0, (r_f * r_f - A_BR * A_BR - C_BR * C_BR) / (2 * A_BR * C_BR)))))
    print("FINAL manete em y %.4f z %.4f (pele da barriga em y %.4f) | braço %.4f + %.4f m, cotovelo do final %.1f°" % (
        H_FIM.y, H_FIM.z, y_pele, A_BR, C_BR, COT_FIM), flush=True)

    def manete_y(b):
        """y do manete: o cotovelo vai de COTOVELO_RETO (b = 0) a COT_FIM (b = 1) e o manete fica na reta, ao alcance dos braços."""
        return na_reta(alcance(COTOVELO_RETO + (COT_FIM - COTOVELO_RETO) * b))

    # ── 9) a pose de um quadro ───────────────────────────────────────────────────────────────────────────────────────────────────────
    DEDOS = {}
    remo_ = {}

    def pose(t):
        """t = 0 pegada; t = 1/3 final; t = 1 igual a t = 0 (ciclo)."""
        estado["t"] = t
        p, q, b, T, Hm = corpo_base(t, interp(dz, t))
        escapulas(-1.0 + 2.0 * b)
        y_ = manete_y(b)
        Hc = Vector((0.0, y_, z_reta(y_)))
        M, rho = maos_no_manete(Hc, estado.get("rho", 0.3))
        estado["rho"] = rho
        estado["manete"] = M
        for L, _ in LADOS:
            if L in DEDOS:
                for n, Mb in DEDOS[L].items():
                    PB[n].matrix_basis = Mb.copy()
        p3.atualizar()
        if remo_:
            remo_["rm"].mover(Hm.y - HC.y, M)

    # ── 10) o remo em volta do corpo, na pegada ──────────────────────────────────────────────────────────────────────────────────────
    pose(0.0)
    M_c = estado["manete"].copy()
    H_c = M_c.to_translation()
    y_s = H_c.y - 0.15                                        # a corrente sai 15 cm à frente do meio das manoplas na pegada (~8 cm
                                                              # de corrente pra fora: o engate fica 7 cm à frente das manoplas)
    z_s = z_reta(y_s)
    R_V = 0.242                                               # tambor de ~48 cm (medido no desenho de lado do manual)
    Z_V = z_s - 0.02
    y_v = y_s - 0.015 - math.sqrt(R_V ** 2 - (z_s - Z_V) ** 2)
    y_as = HC.y + ASSENTO_ATRAS                               # o meio do assento embaixo do quadril (o carrinho anda preso nele)
    curso = HF.y - HC.y
    y_tf = P0["y"] + 0.06                                     # a ponta do trilho 6 cm atrás do fundo do calcanhar
    rm = e3.remo("remo", calcanhar=(P0["y"], P0["z"]), x_pe=X_PE, angulo_apoio=ALFA, assento=(y_as, Z_ASSENTO),
                 assento_forma=(0.27, 0.27, 0.05),
                 trilho=(y_tf, y_tf + 1.37), carenagem=(y_v, Z_V, R_V), saida=(y_s, z_s), manete=M_c, manete_forma=MANETE,
                 raio_pegador=RAIO_PEGADOR, compr_pegador=COMPR_PEGADOR)
    remo_["rm"] = rm
    print("REMO: calcanhar (y %.3f z %.3f), assento y %.3f (curso %.3f), trilho y %.3f → %.3f, carenagem y %.3f z %.3f, saída y %.3f | "
          "comprimento total %.3f m" % (P0["y"], P0["z"], y_as, curso, y_tf, y_tf + 1.37, y_v, Z_V, y_s,
                                        (y_tf + 1.37 + 0.004) - (y_v - R_V)), flush=True)

    # dedos fechados UMA vez em volta da manopla (na pegada) e iguais em todo quadro
    pose(0.0)
    dedos_info = {}
    for L, s in LADOS:
        g = rm.pegadores[s].matrix_world.to_translation()
        eixo = (rm.pegadores[s].matrix_world.to_3x3() @ Vector((0.0, 0.0, 1.0))).normalized()
        dedos_info[L] = pg.fechar_em_volta(bon, L, g, eixo, RAIO_PEGADOR)
        DEDOS[L] = {pb.name: pb.matrix_basis.copy() for pb in PB
                    if pb.name[len(p3.P):].startswith(L + "Hand") and pb.name[len(p3.P):] != L + "Hand"}
        print("DEDOS %s | %s" % (L, str(dedos_info[L])[:160]), flush=True)

    # tira de cada apoio por cima da bola do pé, na forma da pele (a mais alta na remada; o pé gira na bola quando o calcanhar sobe)
    alto = {L: {} for L, _ in LADOS}
    for k in range(12):
        pose(k / 12)
        co, _, _ = ck._avaliar(bon.corpo, 1)
        for L, s in LADOS:
            Minv = np.array(rm.medidas["chapa_M"][s].inverted())
            Pl = co[pe_m[L]] @ Minv[:3, :3].T + Minv[:3, 3]
            Pl = Pl[np.abs(Pl[:, 1] - rm.medidas["u_tira"]) < TIRA["largura"] / 2 + 0.002]
            for x, n in zip(np.round(Pl[:, 0] / 0.002).astype(int), Pl[:, 2]):
                alto[L][x] = max(alto[L].get(x, -1.0), float(n))
    for L, s in LADOS:
        xs = sorted(alto[L])
        perfil = [(i * 0.002, max(alto[L].get(j, -1.0) for j in (i - 1, i, i + 1))) for i in xs]
        rm.alca(s, perfil, largura=TIRA["largura"], espessura=TIRA["espessura"], folga=TIRA["folga"])
        print("TIRA %s: pé de x %.4f a %.4f na chapa, alto %.4f" % (L[0], xs[0] * 0.002, xs[-1] * 0.002, max(n for _, n in perfil)),
              flush=True)

    # ── diagnóstico de cada quadro ──────────────────────────────────────────────────────────────────────────────────────────────────
    def info():
        t = estado["t"]
        j = ck.medir_juntas(rig)
        jj = ck.posicoes(rig)
        co, tri, _ = ck._avaliar(bon.corpo, 1)
        p, q, b = canais(t)
        tron = ck.angulo_chave(rig, {"medida": "tronco"})[0]
        sinal = 1.0 if (c("Neck") - c("Hips")).y > 0 else -1.0
        partes = ["pernas %.2f tronco %.2f braços %.2f" % (p, q, b),
                  "tronco %+.1f°" % (sinal * tron), "coluna %.1f°" % tc.coluna(jj)[0],
                  "joelho %.1f/%.1f°" % (j["joelhoE"], j["joelhoD"]), "quadril %.1f/%.1f°" % (j["quadrilE"], j["quadrilD"]),
                  "cotovelo %.0f/%.0f°" % (j["cotoveloE"], j["cotoveloD"]),
                  "tornozelo DF %+.1f/%+.1f° (calcanhar %.1f/%.1f°)" % (tc.tornozelo(jj)[0] - TORN0, tc.tornozelo(jj)[1] - TORN0,
                                                                      estado["phi"]["Left"], estado["phi"]["Right"])]
        canela = [math.degrees(math.atan2(-float((jj[L + "Leg"] - jj[L + "Foot"])[1]), float((jj[L + "Leg"] - jj[L + "Foot"])[2])))
                  for L, _ in LADOS]
        partes.append("canela %+.1f/%+.1f° (+ = joelho à frente)" % tuple(canela))
        M = estado["manete"]
        Hc = M.to_translation()
        partes.append("manete (%.3f %.3f %.3f) giro %.1f° corrente %.3f m" % (*Hc, math.degrees(estado["rho"]), rm.comprimento))
        joelhos = [c(L + "Leg") for L, _ in LADOS]
        partes.append("manete − joelho %+.0f mm (y; + = à frente)" % ((min(k.y for k in joelhos) - Hc.y) * 1000))
        if info.completo:                                    # medidas lentas (sondas): coxa × tronco, braço/manete/corrente × corpo
            tronco_m = _grupo(nm, ["Spine", "Spine1", "Spine2"])
            ct = [_cruza(co, tri, nm == L + "UpLeg", tronco_m, c(L + "UpLeg"), R)[0] for L, _ in LADOS for R in (0.10, 0.20)]
            partes.append("coxa cruzando tronco (fora de 10 / 20 cm da virilha) E %.1f/%.1f D %.1f/%.1f mm" % tuple(ct))
            pernas_m = _grupo(nm, ["LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"])
            bvh_p = BVHTree.FromPolygons([tuple(x) for x in co], [tuple(x) for x in tri[pernas_m[tri].all(axis=1)]],
                                         all_triangles=True)
            for L, s in LADOS:
                braco = co[_grupo(nm, [L + "Arm", L + "ForeArm"]) | np.char.startswith(nm.astype(str), L + "Hand")]
                partes.append("braço/mão %s × pernas %.0f mm" % (L[0], _distancia(bvh_p, braco[::3]) * 1000))
            malhas_m = ck._malhas(rm.raizes["manete"])
            pts_m = np.concatenate([ck._amostras(*ck._avaliar_simples(o), 0.01) for o in malhas_m])
            partes.append("manete × pernas %.0f mm" % (_distancia(bvh_p, pts_m[::3]) * 1000))
            corpo_sem_maos = ~np.char.startswith(nm.astype(str), "LeftHand") & ~np.char.startswith(nm.astype(str), "RightHand")
            bvh_c = BVHTree.FromPolygons([tuple(x) for x in co], [tuple(x) for x in tri[corpo_sem_maos[tri].all(axis=1)]],
                                         all_triangles=True)
            pts_c = ck._amostras(*ck._avaliar_simples(rm.raizes["corrente"]), 0.01)
            partes.append("corrente × corpo %.0f mm" % (_distancia(bvh_c, pts_c[::2]) * 1000))
        partes.append("antebraço × horizontal %s°" % "/".join(
            "%.0f" % v for v in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["ForeArm", "Hand"]})))
        partes.append("punho desvio %s flexão %s" % (tc.valores("punho_desvio", tc.punho_desvio(jj)),
                                                      tc.valores("punho_flexao", tc.punho_flexao(jj))))
        partes.append("cotovelo_tronco %s braco_frente %s" % (tc.valores("cotovelo_tronco", tc.cotovelo_tronco(jj)),
                                                              tc.valores("braco_frente", tc.braco_frente(jj))))
        ass = rm.raizes["carrinho"].matrix_world.to_translation().y + y_as      # o meio do assento agora
        gl = (_grupo(nm, ["Hips", "LeftUpLeg", "RightUpLeg"]) & (np.abs(co[:, 0]) < 0.13) & (np.abs(co[:, 1] - ass) < 0.14))
        P = co[gl]
        baixo = P[P[:, 2] < Z_ASSENTO + 0.004]
        partes.append("carrinho %.3f | glúteo: pele mais baixa %.1f mm do topo do assento, encosta de y %+.3f a %+.3f do meio dele" % (
            rm.andado, (float(P[:, 2].min()) - Z_ASSENTO) * 1000, (baixo[:, 1].min() - ass) if len(baixo) else float("nan"),
            (baixo[:, 1].max() - ass) if len(baixo) else float("nan")))
        partes.append(maos.info())
        return " | ".join(partes)

    info.completo = False                                     # o exportador chama info() em todo quadro: só as medidas rápidas
    for t in (0.0, PASSADA):
        pose(t)
        print("t=%.3f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(rm.pegadores[s], RAIO_PEGADOR, rm.meia_pegador, eixo=(0, 0, 1))) for L, s in LADOS]
    yq = float(HC.y)
    return Cena(pose, rm.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.3, 0.6),
                camera_video=((3.6, yq - 0.9, 1.3), (0, yq - 0.3, 0.55), 50), info=info, apoios=rm.apoios, afunda_apoio_mm=20)
