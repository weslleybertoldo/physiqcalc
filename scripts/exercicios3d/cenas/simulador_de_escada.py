# Simulador de Escada — cena da fábrica 3D (lote 14, 12/10/2026). CARDIO no stepper de PEDAIS independentes (e3.stepper, peça nova; o
# StairMaster FreeClimber das fotos do "Stairmaster" do free-exercise-db), NÃO a escada que gira. Em pé nos 2 pedais, as mãos de leve
# nos pegadores da frente, o passo alternado: um pedal desce com o peso do corpo enquanto o outro sobe, sem bater embaixo nem em cima.
# CÍCLICO, como a Corrida, a Caminhada na Esteira e o Elíptico: t = 0 → 1 é UM ciclo — 2 passos, o esquerdo e o direito — e a pose em
# t = 1 é IGUAL à de t = 0 (a ficha tem "ciclo": true e o app repete o clipe). t = 0 = pedal DIREITO embaixo e o esquerdo em cima (a
# troca: o esquerdo vai empurrar); de t = 0 a 0,5 o esquerdo desce e o direito sobe; t = 0,5 = o contrário. 60 passos/min: 1 ciclo =
# 2,0 s (= ida_s).
# Técnica (só o que foi lido):
#  · Pedais: "Pump your legs up and down in an established rhythm, driving the pedals down but not all the way to the floor."
#    (free-exercise-db, Stairmaster); "Place weight on one pedal and allow other pedal to raise. Before lower lever hits bottom or upper
#    lever hits top, alternate with opposite movement." (ExRx, Lever Stair Climber); "Take deep, comfortable steps. Do not let the pedals
#    touch the floor or contact the upper stop." e "stay in the middle of the pedal range of motion" (manual do FreeClimber 4600). Curso
#    de 20 cm (o "8-inch step" que o painel usa pra contar andares), no meio do curso da máquina ("Step Height: 1 - 14" (2.5 - 36cm)",
#    8FC); o pedal desce e vai pra trás, nivelado (patente US 4,708,338: "a lower, rearward position"; "the pad 44 will remain parallel
#    to the floor").
#  · Pés: "Place 3/4 of each foot on the pedals, heels slightly off the edge with your toes facing forward." (manual, figura 5) — o pé
#    chapado no pedal nivelado o ciclo todo (os pés não saem dos pedais: ACE/Consumer Reports, "two paddles that go up and down with your
#    feet, don’t require you to lift your feet").
#  · Pernas: "straightening your legs as far as possible without causing discomfort or letting your knees lock out" e "Keep your knees
#    aligned with your toes. Avoid training with your knees too far past your toes" (manual); joelho no StairMaster 4000 (Graham 1993,
#    Tabela 1): "minimum angle 4.9 ± 7.8", "range of motion 72.0 ± 11.7" → 8° embaixo e ~79° em cima. Com o pé chapado no pedal nivelado
#    a canela inclina ~metade do joelho: o tornozelo chega a ~33° de dorsiflexão em cima (a foto da figura 5 do manual mostra a canela de
#    cima ainda mais inclinada; dorsiflexão com carga normal: Konor 2012, "38.8 ± 5.2°").
#  · Tronco e cabeça: "Although the whole body is in a slightly forward slant, keep your back straight and avoid bending at the waist.",
#    "Keep your shoulders square and centered over your hips with your chest lifted.", "Keep your hips directly under you ... Avoid
#    letting your hips rock from side to side with each step." e "Keep your chin parallel to the floor." (manual, figura 5).
#  · Mãos: "Rest your hands lightly on the side rails or front handlebars." e "Keep both elbows slightly bent." (manual); a foto da
#    figura 5 e a foto 1 do free-exercise-db: as 2 mãos nos pegadores da frente; "Avoid transferring body weight onto handlebars."
#    (ExRx). A mão fecha no pegador sem puxar (o peso fica nas pernas).
#  · O corpo sobe um pouco no meio de cada passo (SOBE): nenhuma fonte dá quanto — escolha da fábrica, 2 cm.
# Como o rig faz: o pé é preso no pedal (a ponta dos dedos PONTA atrás da borda da frente, a sola AFUNDA_PE dentro da borracha) e anda
# com ele, sem girar (o pedal fica nivelado: o pé fica na orientação de repouso); o quadril (articulações) fica parado em y e z, só sobe
# SOBE × sen²(2πt) no meio de cada passo; a altura dele dá o joelho JOELHO_BAIXO na perna de baixo na troca. A pelve e o tórax inclinam
# INCLINA à frente juntos (a coluna fica reta) e a cabeça fica na horizontal. Pernas por IK até o tornozelo (o joelho no plano quadril–
# tornozelo–frente). O pegador de cada lado é desenhado onde a mão fecha com o cotovelo a COTOVELO; em cada quadro as mãos vão por IK
# até ele (Maos.segurar com zerar) e os dedos voltam pra posição fechada (a mão fica rígida no pegador).
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from maos3d import Maos
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 esquerdo (+X)
CADENCIA = 60.0           # passos/min (Butts 1993: cadências do fabricante "60, 77, 95, and 112 steps.min-1"; Zimmermann 1994: 60;
T = 2 * 60.0 / CADENCIA   # Graham 1993: metrônomo de 2 s por movimento completo) → 1 ciclo (2 passos) = 2,0 s (= ida_s da ficha)
# ── a máquina (StairMaster FreeClimber; o resto é escolha da fábrica) ─────────────────────────────────────────────────────────────────
CURSO = 0.20              # o pedal sobe e desce 20 cm (o degrau de 8" do painel do 4600), no meio do curso de 2,5–36 cm do 8FC
BRACO = 0.45              # do eixo ao pino do pedal (figura 11 do manual do 4600: ~42 cm)
TH_BAIXO = 6.0            # o braço 6° acima da horizontal com o pedal embaixo (sem chegar no chão: "not all the way to the floor")
Z_BAIXO = 0.20            # topo do pedal embaixo (m)
ALTURA_PEDAL = 0.11       # topo do pedal acima do pino dele
NIVELADOR = 0.055         # o braço nivelador fica esse tanto acima do braço do pedal (paralelogramo)
PEDAL = (0.21, 0.16, 0.020)   # comprimento, largura e espessura da borracha: 3/4 do pé (25,3 cm) cabe com os dedos a PONTA da borda
X_PEDAL, X_BRACO = 0.115, 0.07   # meio de cada pedal e o plano dos braços (|x|)
PONTA = 0.016             # a ponta dos dedos 1,6 cm atrás da borda da frente do pedal: ~19,4 cm do pé em cima (77%), o calcanhar fora
AFUNDA_PE = 0.0008        # a sola afunda na borracha do pedal
# ── perna, quadril e tronco ──────────────────────────────────────────────────────────────────────────────────────────────────────────
JOELHO_BAIXO = 8.0        # joelho da perna de baixo na troca (Graham 1993: mínimo 4,9 ± 7,8°; o boneco em pé tem 7,5°)
DY_BAIXO = 0.015          # o tornozelo de baixo 1,5 cm à frente do quadril (a perna de baixo quase na vertical, como na figura 5)
SOBE = 0.020              # o quadril sobe 2 cm no meio de cada passo (escolha: nenhuma fonte dá o número)
INCLINA = 5.0             # pelve e tórax juntos à frente (graus): "the whole body is in a slightly forward slant"
ALTO = 1.73               # alto do painel (8FC: "43 x 27 x 68\" (110 x 69 x 173cm)")
# ── braços e mãos ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
BRACO_DESCE = 20.0        # linha ombro → pegador abaixo da horizontal (graus): a mão na altura do peito (foto 1 do free-exercise-db)
COTOVELO = 50.0           # cotovelo dobrado (graus): "Keep both elbows slightly bent"; a figura 5 do manual mostra ~50°
X_MAO = 0.18              # pegadores a ±18 cm do meio
RAIO_PEGADOR = 0.016      # espuma de 32 mm (como o tubo dos corrimãos da esteira)
ALINHA = 0.0              # a linha dos nós sempre ao longo do pegador (a mão fica igual em volta dele em todo quadro)


def _ang(a, b):
    c = a.normalized().dot(b.normalized())
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def z_pedal(s, t):
    """Altura do topo do pedal do lado s no quadro t: o direito embaixo em t = 0 e em cima em t = 0,5; o esquerdo ao contrário."""
    fase = 2 * math.pi * (t + (0.5 if s > 0 else 0.0))
    return Z_BAIXO + CURSO * (1 - math.cos(fase)) / 2


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta no pegador (padrão dos exercícios novos)
    pg.usar_cilindro(RAIO_PEGADOR * 2000)   # mão de referência de um cilindro de 32 mm (antes do Maos)
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)

    # ── 1) medidas do boneco em repouso ────────────────────────────────────────────────────────────────────────────────────────────
    L1 = (bon.cabeca_osso("LeftLeg") - bon.cabeca_osso("LeftUpLeg")).length
    L2 = (bon.cabeca_osso("LeftFoot") - bon.cabeca_osso("LeftLeg")).length
    quadris0 = {L: bon.cabeca_osso(L + "UpLeg") for L, _ in LADOS}
    M0 = (quadris0["Left"] + quadris0["Right"]) / 2
    X_H = (quadris0["Left"] - quadris0["Right"]).length / 2
    co0, _, (nomes0, dono0) = ck._avaliar(bon.corpo, 1)
    A0, ancora = {}, {}
    for L, s in LADOS:
        A0[L] = bon.cabeca_osso(L + "Foot")
        T0 = bon.cabeca_osso(L + "ToeBase")
        m = np.array([n in (L + "Foot", L + "ToeBase") for n in nomes0] + [False])[dono0]
        P = co0[m]
        fatia = P[np.abs(P[:, 1] - T0.y) < 0.006]
        xc = float(fatia[:, 0].min() + fatia[:, 0].max()) / 2           # meio do pé na base dos dedos
        ancora[L] = Vector((xc, float(P[:, 1].min()), float(P[:, 2].min())))   # (meio, ponta dos dedos, sola)
    TORN0 = _ang(A0["Left"] - bon.cabeca_osso("LeftLeg"), bon.cabeca_osso("LeftToeBase") - A0["Left"])
    print("BONECO coxa %.4f canela %.4f quadris ±%.4f | pé: ponta y %.4f sola z %.4f meio x %.4f | tornozelo %.4f %.4f %.4f | "
          "tornozelo neutro %.1f°" % (L1, L2, X_H, ancora["Left"].y, ancora["Left"].z, ancora["Left"].x, *A0["Left"], TORN0), flush=True)

    # ── 2) o stepper (só a conta): eixo do braço, pedal embaixo a Z_BAIXO com o braço a TH_BAIXO; o quadril fica em y = 0 ─────────────
    Z_PIVO = Z_BAIXO - ALTURA_PEDAL - BRACO * math.sin(math.radians(TH_BAIXO))
    TH_CIMA = math.degrees(math.asin((Z_BAIXO + CURSO - Z_PIVO - ALTURA_PEDAL) / BRACO))
    no_pe_y = -PEDAL[0] / 2 + PONTA                                       # ponta dos dedos em relação ao meio do pedal
    # tornozelo de baixo DY_BAIXO à frente do quadril (y = 0): y do meio do pedal embaixo → y do eixo
    yc_baixo = -DY_BAIXO - (A0["Right"].y - ancora["Right"].y) - no_pe_y
    Y_PIVO = yc_baixo - BRACO * math.cos(math.radians(TH_BAIXO))

    def topo(s, z):
        """Meio do topo da borracha do pedal do lado s com o topo na altura z (a mesma conta do e3.Stepper.pedal)."""
        th = math.asin((z - Z_PIVO - ALTURA_PEDAL) / BRACO)
        return Vector((s * X_PEDAL, Y_PIVO + BRACO * math.cos(th), z))

    p_b, p_c = topo(-1, Z_BAIXO), topo(-1, Z_BAIXO + CURSO)
    print("STEPPER eixo do braço em y %.4f z %.4f | braço de %.1f° a %.1f° | topo do pedal de (y %.4f z %.4f) a (y %.4f z %.4f): desce "
          "%.3f m e vai %.3f m pra trás" % (Y_PIVO, Z_PIVO, TH_BAIXO, TH_CIMA, p_b.y, p_b.z, p_c.y, p_c.z, CURSO, p_b.y - p_c.y), flush=True)

    def no_pe(L, s, t):
        """Matriz 4x4 que leva o pé de repouso pro lugar dele no quadro t: preso no pedal, sem girar (o pedal fica nivelado)."""
        alvo = topo(s, z_pedal(s, t)) + Vector((0.0, no_pe_y, -AFUNDA_PE))
        return Matrix.Translation(Vector((alvo.x, alvo.y, alvo.z)) - ancora[L])

    # ── 3) o quadril (articulações): y = 0; a altura dá o joelho JOELHO_BAIXO na perna de baixo na troca (t = 0, o direito) ────────────
    A_b = no_pe("Right", -1, 0.0) @ A0["Right"]
    d_b = math.sqrt(L1 * L1 + L2 * L2 + 2 * L1 * L2 * math.cos(math.radians(JOELHO_BAIXO)))
    dx = -X_H - A_b.x
    Y_Q = 0.0
    Z_Q0 = A_b.z + math.sqrt(d_b * d_b - dx * dx - (Y_Q - A_b.y) ** 2)

    def z_quadril(t):
        return Z_Q0 + SOBE * math.sin(2 * math.pi * t) ** 2

    def H_mundo(L, t):
        s = 1 if L == "Left" else -1
        return Vector((s * X_H, Y_Q, z_quadril(t)))

    def joelho_da_conta(L, t):
        """Joelho no plano quadril–tornozelo–frente (IK de 2 ossos feita na mão) e a flexão dele."""
        s = 1 if L == "Left" else -1
        A = no_pe(L, s, t) @ A0[L]
        H = H_mundo(L, t)
        d = A - H
        dl_ = min(d.length, L1 + L2 - 1e-6)
        u_ = d.normalized()
        f_ = Vector((0.0, -1.0, 0.0))
        w_ = (f_ - u_ * f_.dot(u_)).normalized()
        a_ = math.acos(max(-1.0, min(1.0, (L1 * L1 + dl_ * dl_ - L2 * L2) / (2 * L1 * dl_))))
        flex = 180.0 - math.degrees(math.acos(max(-1.0, min(1.0, (L1 * L1 + L2 * L2 - dl_ * dl_) / (2 * L1 * L2)))))
        return H + (u_ * math.cos(a_) + w_ * math.sin(a_)) * L1, flex

    for t_ in (0.0, 0.125, 0.25, 0.375, 0.5):
        _, fe = joelho_da_conta("Left", t_)
        _, fd = joelho_da_conta("Right", t_)
        print("CONTA t=%.3f | quadril z %.4f | pedal E %.3f D %.3f | joelho E %.1f° D %.1f°" % (
            t_, z_quadril(t_), z_pedal(1, t_), z_pedal(-1, t_), fe, fd), flush=True)

    # ── 4) pelve no lugar (inclinada INCLINA, sobe SOBE no meio do passo); tórax junto e cabeça na horizontal ──────────────────────────
    def pelve(t):
        PB[p3.P + "Hips"].matrix_basis = Matrix()
        p3.atualizar()
        alvo = Vector((0.0, Y_Q, z_quadril(t)))
        p3.girar_osso(rig, "Hips", Matrix.Rotation(math.radians(INCLINA), 3, "X"), pivo=M0, mover=alvo - M0)

    def tronco():
        for n in ("Spine", "Spine1", "Spine2", "Neck", "Head"):
            PB[p3.P + n].matrix_basis = Matrix()
        p3.atualizar()
        # cabeça olhando pra frente, na horizontal: desfaz a inclinação que veio da pelve (metade no pescoço)
        cab = p3.mundo_osso(rig, "Head").to_3x3()
        cab0 = (rig.matrix_world @ rig.data.bones[p3.P + "Head"].matrix_local).to_3x3()
        corr = (cab0 @ cab.inverted()).to_quaternion()
        p3.girar_osso(rig, "Neck", Matrix.Identity(3).to_quaternion().slerp(corr, 0.5).to_matrix())
        cab = p3.mundo_osso(rig, "Head").to_3x3()
        p3.girar_osso(rig, "Head", cab0 @ cab.inverted())

    pelve(0.0)
    for L, s in LADOS:
        print("QUADRIL %s no lugar: (%.4f %.4f %.4f) — queria (%.4f %.4f %.4f)" % (L[0], *c(L + "UpLeg"), *H_mundo(L, 0.0)), flush=True)

    # ── 5) pernas por IK (alvos nascem no tornozelo de repouso, polos bem à frente), pé e dedos na orientação de repouso ───────────────
    alvos, polos, iks = {}, {}, {}
    for L, s in LADOS:
        alvos[L] = p3.vazio("tornozelo_" + L, p3.ponta(rig, L + "Leg"))
        polos[L] = p3.vazio("polo_joelho_" + L, (s * 0.12, -1.6, 0.8))
        iks[L] = p3.ik(rig, L + "Leg", alvos[L], polos[L])
        p3.travar_rotacao(rig, L + "Foot")                     # o pedal não inclina: o pé fica chapado, como em repouso
        p3.travar_rotacao(rig, L + "ToeBase")
    estado = {"t": 0.0}

    def pernas(t):
        for L, s in LADOS:
            A = no_pe(L, s, t) @ A0[L]
            alvos[L].location = A
            polos[L].location = (H_mundo(L, t) + A) / 2 + Vector((0.0, -1.5, 0.0))
        p3.atualizar()

    tronco()
    for L, s in LADOS:                                       # pole_angle de cada joelho: o joelho no plano (quadril, tornozelo, polo)
        t_ = 0.0 if s > 0 else 0.5                            # a perna em cima, bem dobrada
        pernas(t_)
        e = p3.acertar_polo(rig, iks[L], L + "Leg", L + "UpLeg", L + "Foot")
        melhor = None
        for k in range(-20, 21):
            iks[L].pole_angle = math.radians(e[1] + 0.25 * k)
            p3.atualizar()
            dk = (c(L + "Leg") - joelho_da_conta(L, t_)[0]).length
            if melhor is None or dk < melhor[0]:
                melhor = (dk, e[1] + 0.25 * k)
        iks[L].pole_angle = math.radians(melhor[1])
        p3.atualizar()
        print("POLO joelho %s: %.2f° (joelho a %.1f mm do da conta)" % (L, melhor[1], melhor[0] * 1000), flush=True)

    # ── 6) mãos: o pegador de cada lado é desenhado onde a mão fecha com o cotovelo a COTOVELO (quadro de referência: o quadril no meio
    #       do sobe-e-desce, t = 0,125) ────────────────────────────────────────────────────────────────────────────────────────────────
    maos = Maos(bon, RAIO_PEGADOR, polo_inicial=(0, 0.5, 0), polegar_modo="volta")
    T_REF = 0.125
    pelve(T_REF)
    tronco()
    pernas(T_REF)
    S_ref = c("LeftArm")
    b = math.radians(BRACO_DESCE)
    alc = {"r": (S_ref - c("LeftForeArm")).length + (c("LeftForeArm") - c("LeftHand")).length + maos.palma * 0.92}
    polo_braco = {L: Vector((s * 0.10, 0.55, -0.40)) for L, s in LADOS}   # cotovelo pra baixo e pra trás, perto do corpo
    eixo_ref = {"a": Vector((0.0, 0.0, 1.0))}

    def mao_no(L, s, a_eixo, f_):
        """Dedos e palma da mão L no pegador de eixo a_eixo: os dedos pra onde o antebraço aponta (⟂ ao pegador), a palma pro meio."""
        dq = (f_ - a_eixo * f_.dot(a_eixo)).normalized()
        pq = a_eixo.cross(dq).normalized()
        if pq.x * s > 0:                                      # palma virada pro meio do corpo (o polegar fica em cima)
            pq = -pq
        return dq, pq

    def segurar(L, s, g, a_eixo):
        f_ = (g - (c(L + "Arm") + Vector((s * 0.03, -0.10, -0.24)))).normalized()   # 1ª volta: antebraço vindo de um cotovelo baixo
        for _ in range(2):
            dq, pq = mao_no(L, s, a_eixo, f_)
            maos.segurar(L, g, dq, pq, polo=c(L + "Arm") + polo_braco[L], alinhar=ALINHA, zerar=True)
            f_ = (c(L + "Hand") - c(L + "ForeArm")).normalized()

    def ponto_ref():
        return Vector((X_MAO, S_ref.y - alc["r"] * math.cos(b), S_ref.z - alc["r"] * math.sin(b)))

    polo_certo = {}
    for volta in range(2):                                    # o eixo do pegador ⟂ ao antebraço; o alcance que dá o cotovelo pedido
        lo_r, hi_r = alc["r"] - 0.30, alc["r"] + 0.005
        for _ in range(16):
            alc["r"] = (lo_r + hi_r) / 2
            segurar("Left", 1, ponto_ref(), eixo_ref["a"])
            if "Left" not in polo_certo:                      # pole_angle de cada braço (os ossos dos 2 lados não são espelhados)
                for L, s in LADOS:
                    maos.iks[L].mute = False
                    polo_certo[L] = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
                segurar("Left", 1, ponto_ref(), eixo_ref["a"])
            cot = ck.medir_juntas(rig)["cotoveloE"]
            if cot > COTOVELO:
                lo_r = alc["r"]
            else:
                hi_r = alc["r"]
        alc["r"] = (lo_r + hi_r) / 2
        segurar("Left", 1, ponto_ref(), eixo_ref["a"])
        f_ = (c("LeftHand") - c("LeftForeArm")).normalized()
        a_ = Vector((0.0, -f_.z, f_.y))                       # ⟂ ao antebraço no plano de lado, apontando pra cima
        if a_.z < 0:
            a_ = -a_
        eixo_ref["a"] = a_.normalized()
    G_ref = ponto_ref()
    print("PEGADOR esquerdo (t %.3f): (%.4f %.4f %.4f), eixo (%.3f %.3f %.3f) | alcance %.4f | cotovelo %.1f° | ombro (%.4f %.4f %.4f)" % (
        T_REF, *G_ref, *eixo_ref["a"], alc["r"], ck.medir_juntas(rig)["cotoveloE"], *S_ref), flush=True)

    # ── 7) o stepper em volta do corpo: pedais embaixo dos pés, pegadores onde as mãos fecham, painel na frente e acima deles ─────────
    a_g = eixo_ref["a"]
    coluna = (G_ref.y - 0.08, G_ref.z - 0.13)
    a_p = math.radians(32)                                    # o painel do e3.stepper (32° virado pra quem sobe, 0,26 × 0,06 m)
    painel = (G_ref.y - 0.18, ALTO - math.cos(a_p) * 0.13 - math.sin(a_p) * 0.03 - 0.004)
    st = e3.stepper("stepper", pivo=(Y_PIVO, Z_PIVO), braco=BRACO, nivelador=NIVELADOR, x_braco=X_BRACO, x_pedal=X_PEDAL, pedal=PEDAL,
                    altura_pedal=ALTURA_PEDAL, pegadores=(G_ref, a_g), raio_pegador=RAIO_PEGADOR, coluna=coluna, painel=painel)
    erro_pedal = max((st.pedal(s, z_pedal(s, k / 16)).to_translation() - topo(s, z_pedal(s, k / 16))).length
                     for s in (1, -1) for k in range(16))
    print("STEPPER montado: painel %s | coluna %s | carenagem %s | base y %.3f a %.3f | pedal da peça × da conta: %.2e m" % (
        tuple(round(x, 3) for x in st.medidas["painel"]), tuple(round(x, 3) for x in coluna),
        tuple(round(x, 3) for x in st.medidas["carenagem"]), st.medidas["y_frente"], st.medidas["y_tras"], erro_pedal), flush=True)

    # ── 8) dedos fechados UMA vez em volta do pegador (no quadro de referência) e iguais em todo quadro ───────────────────────────────
    DEDOS = {}

    def maos_no_pegador():
        for L, s in LADOS:
            g, a_eixo = st.medidas["pegador_local"][s]
            segurar(L, s, g, a_eixo)
            if L in DEDOS:
                for n, Mb in DEDOS[L].items():
                    PB[n].matrix_basis = Mb.copy()
        p3.atualizar()

    def pose(t):
        """t = 0 pedal direito embaixo e o esquerdo em cima; 0,5 o contrário; t = 1 igual a t = 0 (ciclo)."""
        estado["t"] = t
        pelve(t)
        tronco()
        pernas(t)
        st.pedais(z_pedal(1, t), z_pedal(-1, t))
        maos_no_pegador()

    pose(T_REF)
    dedos_info = {}
    for L, s in LADOS:
        g, a_eixo = st.medidas["pegador_local"][s]
        dedos_info[L] = pg.fechar_em_volta(bon, L, g, a_eixo, RAIO_PEGADOR)
        DEDOS[L] = {pb.name: pb.matrix_basis.copy() for pb in PB
                    if pb.name[len(p3.P):].startswith(L + "Hand") and pb.name[len(p3.P):] != L + "Hand"}
        print("DEDOS %s | %s" % (L, str(dedos_info[L])[:160]), flush=True)

    # ── diagnóstico de cada quadro ──────────────────────────────────────────────────────────────────────────────────────────────────
    def info():
        t = estado["t"]
        j = ck.medir_juntas(rig)
        jj = ck.posicoes(rig)
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        partes = []
        for L, s in LADOS:
            m = np.array([n in (L + "Foot", L + "ToeBase") for n in nomes] + [False])[dono]
            Minv = np.array(st.pedal(s).inverted())
            loc = co[m] @ Minv[:3, :3].T + Minv[:3, 3]
            sob = loc[(np.abs(loc[:, 0]) < PEDAL[1] / 2) & (np.abs(loc[:, 1]) < PEDAL[0] / 2)]
            sola = float(sob[:, 2].min()) * 1000 if len(sob) else float("nan")
            fora = float(loc[:, 1].max() - PEDAL[0] / 2) * 1000                 # o quanto o calcanhar passa da borda de trás
            K = c(L + "Leg") - c(L + "UpLeg")
            cx = math.degrees(math.atan2(-K.y, -K.z))
            lado = "E" if s > 0 else "D"
            partes.append("%s pedal %.3f joelho %.1f° coxa %+.1f° tornozelo %.0f (DF %+.1f) sola×pedal %+.1f mm calcanhar fora %.0f mm "
                          "IK %.1f mm cotovelo %.0f°" % (
                              L[0], st.z[s], j["joelho" + lado], cx, tc.tornozelo(jj)[0 if s > 0 else 1],
                              tc.tornozelo(jj)[0 if s > 0 else 1] - TORN0, sola, fora, (c(L + "Foot") - alvos[L].location).length * 1000,
                              j["cotovelo" + lado]))
        tron = ck.angulo_chave(rig, {"medida": "tronco"})[0]
        return " | ".join(partes) + " | tronco %.1f° quadril z %.4f | %s" % (tron, (c("LeftUpLeg").z + c("RightUpLeg").z) / 2, maos.info())

    for t in (0.0, 0.125, 0.25, 0.375, 0.5, 0.75):
        pose(t)
        print("t=%.3f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(st.manoplas[s], RAIO_PEGADOR, st.meia_pegador, eixo=(0, 0, 1))) for L, s in LADOS]
    return Cena(pose, st.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.15, 1.1),
                camera_video=((3.8, -2.0, 1.55), (0, -0.15, 1.05), 45), info=info, apoios=st.apoios, afunda_apoio_mm=20)
