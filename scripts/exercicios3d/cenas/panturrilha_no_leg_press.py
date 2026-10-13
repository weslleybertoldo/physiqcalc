# Panturrilha no Leg Press — cena da fábrica 3D (lote 10, 10/10/2026). Máquina: o Leg Press 45° do lote 4 (equip3d.leg_press_45: trilhos
# a 45°, carrinho com a plataforma ⟂ ao trilho, assento e encosto reclinado com o apoio lombar, pegadores, travas), montado em volta do
# corpo como no Leg Press 45° (cenas/leg_press_45.py): o mesmo encosto a 20°, o mesmo apoio lombar, a cabeça no encosto e as mãos nos
# pegadores. Aqui só a ponta dos pés fica na plataforma, na borda de baixo dela, com os calcanhares pra fora.
# t = 0 calcanhares embaixo, pra fora da plataforma e além do plano dela: tornozelo em 20° de flexão dorsal (panturrilha alongada) ·
# t = 1 na ponta dos pés, com o carrinho empurrado: 30° de flexão plantar.
# Técnica (ExRx, Sled 45° Calf Press): "Sit on seat with back on padded support. Place feet on platform. Grasp handles to sides and
# extend hips and knees. Place toes and balls of feet on lower portion of platform with heels and arches extending off." / "Push sled
# by extending ankles as far as possible. Return by bending ankles until calves are stretched. Repeat." / "Keep knees straight
# throughout exercise". O eixo do movimento é o tornozelo (ExRx, Calf Exercise Analyses: "Calf Press can be seen as a 1st class lever
# system", "Axis: Ankle joint"). Pés na largura do quadril (NASM, Leg Press Calf Raise: "Position your feet hip-width apart") e pontas
# pra frente (ACE, Calf Raises: "with the toes pointed forward"). Amplitude do tornozelo de Kinoshita et al. 2023 ("from 20°
# dorsiflexed to 30° plantarflexed", a da panturrilha em pé com o joelho a 0°, a mesma das 2 panturrilhas prontas).
# Como o rig faz: deitado como no Leg Press 45° (o corpo inclina pra trás em volta do quadril até o glúteo e as costas encostarem juntos
# no encosto a 20°, o rolo lombar encaixa na lombar, o pescoço estende até a nuca encostar). Cada perna é UMA peça (coxa + canela, o
# joelho fixo em JOELHO°, quase esticado), no plano que passa pelo quadril e pelo tornozelo e contém a direção E (a da face da
# plataforma, pros dedos: o joelho dobra pra cima, na direção das pontas dos pés), com o tornozelo a ±PES_X. O pé gira em volta do X no
# tornozelo (só flexão plantar/dorsal, a ponta pra frente) e os dedos ficam deitados na plataforma (orientação fixa no mundo). A base
# dos dedos (MTP, cabeça do osso ToeBase) fica PARADA na plataforma, BORDA acima da borda de baixo dela. Com o joelho e o quadril
# parados ela andaria num arco em volta do tornozelo: a parte ao longo do trilho o carrinho acompanha, mas a parte ao longo da face da
# plataforma a faria escorregar ~5 cm nela. Pra não escorregar, a perna inteira gira ~3° em volta do X no quadril (conta exata: a
# base dos dedos fica parada ao longo de E): o joelho não mexe e o quadril vai de ~69° a ~72°. No meio do movimento (T_ALINHA) a reta
# quadril → tornozelo fica na direção do trilho (as pernas ⟂ à plataforma, o carrinho anda na direção delas): daí sai a altura da
# plataforma em relação ao quadril. O carrinho anda no trilho o mesmo que a base dos dedos. Pelve, tronco, cabeça, braços e mãos não
# mexem. A máquina: os trilhos passam 50 cm abaixo do centro da plataforma (por baixo das pernas e do calcanhar: não tapam o tornozelo
# de lado), a travessa de baixo do carrinho fica atrás da parte de baixo da chapa (os calcanhares descem por baixo dela), as travas 3 cm
# abaixo do curso (o carrinho para ali se o pé escorregar) e a ponta de baixo dos trilhos no mesmo lugar do Leg Press 45°.
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

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
TRILHO = 45.0             # trilho a 45° do chão (Hammer Strength Linear Leg Press: "Featuring a 45-degree angle")
ENCOSTO = 20.0            # encosto 20° acima da horizontal (Golparian et al. 2021: "the backrest of the machine be adjusted at a 20° angle")
ASSENTO_ANG = 20.0        # o assento sobe 20° pra frente (o mesmo do Leg Press 45°)
ESP_ENCOSTO, LARG_ENCOSTO, COMP_ENCOSTO = 0.06, 0.40, 0.98   # estofado de 60 mm (Gym Gear Sterling: "60mm thick pads")
ESP_ASSENTO, LARG_ASSENTO, COMP_ASSENTO = 0.06, 0.40, 0.30
AFUNDA = 0.002            # pele afundando no assento e no apoio lombar
AFUNDA_ENC = 0.004        # costas e glúteo apertando o encosto
Z_QUADRIL = 0.42          # altura das articulações do quadril (a mesma do Leg Press 45°)
T_ALINHA = 0.5            # no meio do movimento a reta quadril → tornozelo fica na direção do trilho (as pernas ⟂ à plataforma, o
                          # carrinho anda na direção delas): daí sai onde a plataforma fica em relação ao quadril
PLATAFORMA = (0.72, 0.51, 0.02)   # 28,35" × 19,92" (BodyKore G277: "Platform Size : 28.35 X 19.92"), chapa de 2 cm
TRILHOS = (0.26, 0.50, 0.025)     # trilhos Ø 50 mm a ±26 cm (como no Leg Press 45°), 50 cm abaixo do centro da plataforma (lá: 30): com
                                  # os pés na borda de baixo, as pernas passam por cima dos trilhos e das vigas deles, que não tapam o
                                  # tornozelo de lado (só a coluna do carrinho, atrás da chapa, tapa a ponta do calcanhar que passa do
                                  # plano dela embaixo, na vista de lado)
CHASSI_BAIXO = -0.225     # travessa de baixo do carrinho atrás da parte de baixo da chapa, na mesma altura do Leg Press 45° (lá ela fica
                          # logo acima das luvas): os calcanhares descem por baixo dela, pra fora da plataforma
D_TRILHO = 0.58           # ponta de baixo dos trilhos a 58 cm do quadril ao longo do trilho, no mesmo lugar do Leg Press 45° (57,9 cm),
                          # como numa máquina de verdade (o curso aqui é de poucos cm e a trava fica logo abaixo dele)
JOELHO = 10.0             # joelho quase esticado e PARADO (ExRx: "Keep knees straight throughout exercise"; sem travar, como o Leg
                          # Press 45° em cima)
DORSI, PLANTAR = 20.0, 30.0   # tornozelo: 20° de flexão dorsal embaixo → 30° de flexão plantar em cima, a partir do neutro (o pé chapado
                              # em pé; Kinoshita et al. 2023: "from 20° dorsiflexed to 30° plantarflexed")
PES_X = 0.14              # tornozelos a ±14 cm (quadris a ±10,6): pés na largura do quadril, como no Leg Press 45°
BORDA = 0.012             # a borda de baixo da plataforma fica 1,2 cm abaixo da base dos dedos (as cabeças dos metatarsos em cima dela)
AFUNDA_PE = 0.006         # a planta embaixo da base dos dedos afunda até 6 mm na plataforma (o coxim do antepé, como nas 2 panturrilhas
                          # prontas no degrau)
RAIO = 0.0145             # pegador de 29 mm (o cilindro da mão de referência)
COMP_PEGADOR = 0.14
X_PEG = 0.30              # pegadores 10 cm pra fora da borda do assento
COTOVELO = 20.0           # braços quase esticados nos pegadores ("Grasp handles to sides", ExRx)
LOMBAR_A, LOMBAR_B, LOMBAR_MAX = 0.11, 0.045, 0.04   # apoio lombar: rolo achatado de 22 × 9 cm, saindo no máximo 4 cm da face
X = Vector((1.0, 0.0, 0.0))


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _ang(a, b):
    return math.degrees(a.angle(b))


def _bissec(f, lo, hi, n=60):
    flo = f(lo)
    for _ in range(n):
        m = (lo + hi) / 2
        fm = f(m)
        if (fm > 0) == (flo > 0):
            lo, flo = m, fm
        else:
            hi = m
    return (lo + hi) / 2


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta no pegador (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    repouso = {pb.name: pb.matrix_basis.copy() for pb in PB}
    TAU0 = sum(tc.tornozelo(ck.posicoes(rig))) / 2           # tornozelo neutro (pé chapado em pé), ~76°
    pe_rep = {L: p3.mundo_osso(rig, L + "Foot").to_3x3().normalized() for L, _ in LADOS}
    dedo_rep = {L: p3.mundo_osso(rig, L + "ToeBase").to_3x3().normalized() for L, _ in LADOS}
    pe_vet = {L: cab(L + "ToeBase") - cab(L + "Foot") for L, _ in LADOS}

    def anatomico(y, x):
        """Referencial (colunas X, Y, Z) com Y ao longo do osso e X no eixo de dobra (⟂ a Y)."""
        y = y.normalized()
        x = (x - y * x.dot(y)).normalized()
        return Matrix((x, y, x.cross(y))).transposed()

    # cada osso da perna em relação ao seu referencial anatômico de repouso (como no Leg Press 45°: sem torcer a coxa)
    rel = {}
    for L, _ in LADOS:
        for osso in ("UpLeg", "Leg"):
            F = p3.mundo_osso(rig, L + osso).to_3x3().normalized()
            rel[L + osso] = anatomico(F.col[1], Vector((1, 0, 0))).inverted() @ F
    pivo0 = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    ae = math.radians(ENCOSTO)
    u_e = Vector((0, math.cos(ae), math.sin(ae)))           # ao longo do encosto, subindo pra trás
    n_e = Vector((0, -math.sin(ae), math.cos(ae)))          # normal da face do encosto (pro corpo)
    a_t = math.radians(TRILHO)
    D = Vector((0, -math.cos(a_t), math.sin(a_t)))          # ao longo do trilho, subindo (pra longe de quem empurra)
    E = Vector((0, math.sin(a_t), math.cos(a_t)))           # na face da plataforma, pra cima (pros dedos)

    # ── 1) deitado no encosto: o corpo inclina pra trás em volta do quadril até o glúteo e as costas encostarem juntos ──────────────
    def deitar(r):
        for pb in PB:
            pb.matrix_basis = repouso[pb.name].copy()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(-r), pivo=pivo0)

    def costas():
        """Quanto o glúteo e a parte de cima das costas chegam no encosto (n·p, m; menor = mais pra trás)."""
        co, _, (nomes, dono) = _malha(bon)
        nn = np.array(n_e)
        g = co[_grupo(nomes, dono, ("Hips",))]
        g = g[np.abs(g[:, 0]) < 0.16]
        c = co[_grupo(nomes, dono, ("Spine1", "Spine2", "LeftShoulder", "RightShoulder"))]
        c = c[np.abs(c[:, 0]) < LARG_ENCOSTO / 2 - 0.02]
        return float((g @ nn).min()), float((c @ nn).min())

    lo, hi = 50.0, 85.0
    for _ in range(12):
        r = (lo + hi) / 2
        deitar(r)
        dg, dc = costas()
        if dg < dc:
            lo = r
        else:
            hi = r
    reclina = (lo + hi) / 2
    deitar(reclina)
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, Z_QUADRIL)) - pivo0)
    H_c = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    dg, dc = costas()
    F_e = min(dg, dc) + AFUNDA_ENC                 # face do encosto: n_e·P = F_e
    print("DEITADO | inclina %.2f° | glúteo × costas %.1f mm | quadril (%.4f %.4f %.4f)" % (reclina, (dg - dc) * 1000, *H_c),
          flush=True)

    # ── 2) apoio lombar: rolo achatado embutido no encosto que encaixa na curva da lombar (como no Leg Press 45°) ─────────────────
    b0 = H_c - n_e * (H_c.dot(n_e) - F_e)          # ponto da face embaixo do quadril
    P = pele(("Hips", "Spine", "Spine1"))
    P = P[np.abs(P[:, 0]) < 0.10]
    sP, hP = (P - np.array(b0)) @ np.array(u_e), P @ np.array(n_e) - F_e
    a_l, b_l = LOMBAR_A - AFUNDA, LOMBAR_B - AFUNDA
    melhor = None
    for s_l in np.arange(0.06, 0.26, 0.005):
        m = np.abs(sP - s_l) < a_l
        c_h = float((hP[m] - b_l * np.sqrt(1 - ((sP[m] - s_l) / a_l) ** 2)).min())
        sai = min(c_h + LOMBAR_B, LOMBAR_MAX)
        if melhor is None or sai > melhor[0] + 1e-4:
            melhor = (sai, s_l)
    sai_l, s_l = melhor
    print("LOMBAR | rolo achatado %.0f × %.0f mm em s %.3f saindo %.1f mm da face" % (
        2000 * LOMBAR_A, 2000 * LOMBAR_B, s_l, sai_l * 1000), flush=True)

    # ── 3) cabeça no encosto: estende o pescoço até a nuca encostar ────────────────────────────────────────────────────────────
    pescoco = 0
    while float((pele(("Head",)) @ np.array(n_e)).min()) > F_e + 0.001 and pescoco < 25:
        p3.girar_osso(rig, "Neck", p3.rot_x(-1))
        pescoco += 1
    print("CABEÇA | pescoço estendido %d° | nuca %.1f mm acima da face" % (
        pescoco, (float((pele(("Head",)) @ np.array(n_e)).min()) - F_e) * 1000), flush=True)

    # ── 4) pernas: cada perna é uma peça só (joelho fixo em JOELHO°) que gira em volta do X no quadril; o pé gira em volta do X no
    #    tornozelo; os dedos ficam deitados na plataforma ────────────────────────────────────────────────────────────────────────
    l1 = (cab("LeftLeg") - cab("LeftUpLeg")).length
    l2 = (cab("LeftFoot") - cab("LeftLeg")).length
    dist = math.sqrt(l1 ** 2 + l2 ** 2 + 2 * l1 * l2 * math.cos(math.radians(JOELHO)))
    H = {L: cab(L + "UpLeg") for L, _ in LADOS}
    R_pl = Matrix.Rotation(math.radians(-135.0), 3, "X")     # do chão pra plataforma: +Z → −D (a sola na face), −Y → +E (dedos)
    pe_flat = {L: R_pl @ pe_rep[L] for L, _ in LADOS}       # pé deitado na plataforma (a sola do repouso girada −135° em X)
    dedo_flat = {L: R_pl @ dedo_rep[L] for L, _ in LADOS}   # dedos deitados na plataforma, pontas pra cima dela (E)
    f_flat = {L: R_pl @ pe_vet[L] for L, _ in LADOS}        # tornozelo → base dos dedos com o pé deitado na plataforma

    def base_da_perna(L, s, phi):
        """Tornozelo e joelho com a perna a `phi` rad de D (girando pra E), joelho em JOELHO°, no plano que contém E."""
        dx = s * PES_X - H[L].x
        dyz = math.sqrt(dist ** 2 - dx ** 2)
        A = H[L] + X * dx + (D * math.cos(phi) + E * math.sin(phi)) * dyz
        d = A - H[L]
        u = d.normalized()
        n = u.cross(E).normalized()
        w = n.cross(u)
        if w.dot(E) < 0:
            w = -w
        a = (l1 ** 2 - l2 ** 2 + d.length_squared) / (2 * d.length)
        h = math.sqrt(max(l1 ** 2 - a * a, 0.0))
        return A, H[L] + u * a + w * h, (n if n.x > 0 else -n)

    def alinhar(L, osso, direcao, normal):
        F = p3.mundo_osso(rig, L + osso).to_3x3().normalized()
        p3.girar_osso(rig, L + osso, anatomico(direcao, normal) @ rel[L + osso] @ F.inverted())

    def por_mundo(L, osso, R):
        F = p3.mundo_osso(rig, L + osso).to_3x3().normalized()
        p3.girar_osso(rig, L + osso, R @ F.inverted())

    PHI0 = 0.0                                    # base: a reta quadril → tornozelo na direção do trilho (a de T_ALINHA)
    geo = {}
    for L, s in LADOS:
        A, K, n = base_da_perna(L, s, PHI0)
        alinhar(L, "UpLeg", K - H[L], n)
        alinhar(L, "Leg", A - K, n)
        por_mundo(L, "Foot", pe_flat[L])
        por_mundo(L, "ToeBase", dedo_flat[L])
        A_r, K_r = cab(L + "Foot"), cab(L + "Leg")
        geo[L] = dict(A=A_r, K=K_r, s=(A_r - K_r), a=A_r - H[L])
        print("PERNA %s | joelho %.1f mm do alvo, tornozelo %.1f mm | normal (%.3f %.3f %.3f) | joelho %.1f°" % (
            L, (K_r - K).length * 1000, (A_r - A).length * 1000, *n, ck.medir_juntas(rig)["joelho" + ("E" if s > 0 else "D")]),
            flush=True)
    PERNA = [L + o for L, _ in LADOS for o in ("UpLeg", "Leg", "Foot", "ToeBase")]
    base = {n_: PB[p3.P + n_].matrix_basis.copy() for n_ in PERNA}

    def rx(v, ang):
        return Matrix.Rotation(ang, 3, X) @ v

    def beta_de(L, alvo):
        """Giro do pé (rad, em volta do X, a partir do pé deitado, com a perna na base) que dá o tornozelo `alvo` graus."""
        g = geo[L]
        return _bissec(lambda b: _ang(g["s"], rx(f_flat[L], b)) - alvo, math.radians(-80), math.radians(80))

    # a base dos dedos fica, ao longo de E, onde ela está com a perna na base e o tornozelo no ângulo de T_ALINHA
    T_E = sum((geo[L]["a"] + rx(f_flat[L], beta_de(L, p3.lerp(TAU0 + DORSI, TAU0 - PLANTAR, T_ALINHA)))).dot(E)
              for L, _ in LADOS) / 2
    PLAT_E = T_E + PLATAFORMA[1] / 2 - BORDA      # a reta do centro da plataforma ao longo de E, a partir do quadril
    print("ALINHA | base dos dedos %.1f mm ao longo de E a partir do quadril | centro da plataforma %.1f mm (Leg Press 45°: 196)" % (
        T_E * 1000, PLAT_E * 1000), flush=True)

    def theta_de(L, beta):
        """Giro da perna inteira (rad, em volta do X no quadril) que deixa a base dos dedos em E·(M − H) = T_E."""
        v = geo[L]["a"] + rx(f_flat[L], beta)
        P_ = E.y * v.y + E.z * v.z
        Q_ = E.z * v.y - E.y * v.z
        R_ = math.hypot(P_, Q_)
        f0 = math.atan2(Q_, P_)
        c = max(-1.0, min(1.0, T_E / R_))
        sol = [f0 + math.acos(c), f0 - math.acos(c)]
        sol = [math.atan2(math.sin(x_), math.cos(x_)) for x_ in sol]
        return min(sol, key=abs)

    def resolver(L, t):
        alvo = p3.lerp(TAU0 + DORSI, TAU0 - PLANTAR, t)
        b = beta_de(L, alvo)
        th = theta_de(L, b)
        return th, th + b

    def posar(L, th, psi):
        for n_ in (L + "UpLeg", L + "Leg", L + "Foot", L + "ToeBase"):
            PB[p3.P + n_].matrix_basis = base[n_].copy()
        p3.atualizar()
        p3.girar_osso(rig, L + "UpLeg", Matrix.Rotation(th, 3, X))
        por_mundo(L, "Foot", Matrix.Rotation(psi, 3, X) @ pe_flat[L])
        por_mundo(L, "ToeBase", dedo_flat[L])

    def pernas(t):
        out = {}
        for L, _ in LADOS:
            th, psi = resolver(L, t)
            posar(L, th, psi)
            out[L] = (th, psi)
        return out

    def mtp():
        return (cab("LeftToeBase") + cab("RightToeBase")) / 2

    giros = pernas(0.0)
    M0 = {L: cab(L + "ToeBase") for L, _ in LADOS}
    M0m = mtp()
    for t in (0.0, 0.25, 0.5, 0.75, 1.0):
        g = pernas(t)
        jj = ck.posicoes(rig)
        print("PERNAS t=%.2f | tornozelo %s | joelho %s | quadril %s | perna girada %s° | pé %s° | base dos dedos E: ao longo de E "
              "%+.2f mm, X %+.2f mm, carrinho %+.1f mm" % (
                  t, "/".join("%.2f" % v for v in tc.tornozelo(jj)),
                  "/".join("%.2f" % ck.medir_juntas(rig)[k] for k in ("joelhoE", "joelhoD")),
                  "/".join("%.2f" % ck.medir_juntas(rig)[k] for k in ("quadrilE", "quadrilD")),
                  "/".join("%+.2f" % math.degrees(g[L][0]) for L, _ in LADOS),
                  "/".join("%+.1f" % math.degrees(g[L][1]) for L, _ in LADOS),
                  (cab("LeftToeBase") - M0["Left"]).dot(E) * 1000, (cab("LeftToeBase") - M0["Left"]).x * 1000,
                  (mtp() - M0m).dot(D) * 1000), flush=True)
    th0 = {L: giros[L][0] for L, _ in LADOS}       # com a perna parada (o giro de t=0), a base dos dedos escorregaria ao longo de E:
    escorrega = [(rx(geo[L]["a"] + rx(f_flat[L], beta_de(L, p3.lerp(TAU0 + DORSI, TAU0 - PLANTAR, t))), th0[L])).dot(E) - T_E
                 for t in (0.0, 0.25, 0.5, 0.75, 1.0) for L, _ in LADOS]
    print("SEM GIRAR A PERNA | a base dos dedos andaria de %.1f a %.1f mm ao longo da face da plataforma" % (
        min(escorrega) * 1000, max(escorrega) * 1000), flush=True)
    pernas(1.0)
    d1 = float((mtp() - M0m).dot(D))
    pernas(0.0)

    # ── 5) plataforma (montada no começo, t=0): face ⟂ ao trilho, a borda de baixo BORDA abaixo da base dos dedos e a reta do centro
    #    PLAT_E acima do quadril. A face fica onde a pele mais funda da ponta do pé (ossos Foot e ToeBase, em cima da plataforma), no
    #    movimento todo, afunda AFUNDA_PE nela: a pele embaixo da base dos dedos dobra quando o calcanhar sobe (no pé esquerdo do boneco
    #    a planta embaixo do 1º metatarso é do osso do pé e desce uns mm a mais) e os dedos ficam encostados ou a ~1 mm ─────────────
    e_borda = T_E - BORDA                         # a borda de baixo ao longo de E, a partir do quadril

    def fundo_da_ponta():
        co, _, (nomes, dono) = _malha(bon)
        out = {}
        for L, _ in LADOS:
            P_ = co[_grupo(nomes, dono, (L + "Foot", L + "ToeBase"))]
            P_ = P_[(P_ - np.array(H_c)) @ np.array(E) > e_borda]
            out[L] = float((P_ @ np.array(D)).max())
        return out

    amostras = []
    for k in range(9):
        pernas(k / 8)
        dt = float((mtp() - M0m).dot(D))
        amostras.append((k / 8, dt, fundo_da_ponta()))
    F_p = max(f[L] - dt for _, dt, f in amostras for L, _ in LADOS) - AFUNDA_PE     # a face no começo (t=0), ao longo de D
    print("PONTA DO PÉ × FACE (mm, + = afundado) | %s" % " ".join(
        "t%.3f %.1f/%.1f" % (t, (f["Left"] - dt - F_p) * 1000, (f["Right"] - dt - F_p) * 1000) for t, dt, f in amostras), flush=True)
    pernas(0.0)
    c_p = H_c + E * PLAT_E + D * (F_p - H_c.dot(D))
    c_p.x = 0.0
    print("PLATAFORMA | base dos dedos ao longo de E: E %+.1f D %+.1f mm da borda de baixo | centro (%.4f %.4f %.4f) | curso %.1f mm" % (
        ((M0["Left"] - c_p).dot(E) + PLATAFORMA[1] / 2) * 1000, ((M0["Right"] - c_p).dot(E) + PLATAFORMA[1] / 2) * 1000,
        *c_p, d1 * 1000), flush=True)

    # ── 6) assento: estofado subindo ASSENTO_ANG pra frente, embaixo do glúteo e das coxas (como no Leg Press 45°) ──────────────────
    a_s = math.radians(ASSENTO_ANG)
    n_s = Vector((0, math.sin(a_s), math.cos(a_s)))
    v_s = Vector((0, -math.cos(a_s), math.sin(a_s)))
    G = pele(("Hips", "LeftUpLeg", "RightUpLeg"))
    G = G[(np.abs(G[:, 0]) < LARG_ASSENTO / 2) & ((G - np.array(b0)) @ np.array(u_e) < 0.05)]
    F_s = float((G @ np.array(n_s)).min()) + AFUNDA
    M2 = Matrix(((n_s.y, n_s.z), (n_e.y, n_e.z)))
    yz = M2.inverted() @ Vector((F_s, F_e))
    J = Vector((0.0, yz[0], yz[1]))                # canto entre o assento e o encosto
    c_s = J + v_s * (COMP_ASSENTO / 2 + 0.005)
    b_e = J + u_e * 0.005
    print("ASSENTO | canto (%.4f %.4f) | centro (%.4f %.4f) | encosto começa %.3f m antes do quadril" % (
        J.y, J.z, c_s.y, c_s.z, (b0 - b_e).dot(u_e)), flush=True)

    # ── 7) mãos nos pegadores dos lados do assento (pegada neutra, palma pro corpo), braços quase esticados ─────────────────────
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")
    peg = {}

    def mao_no_pegador(lado, s, ao_longo, acertar=False):
        S_ = cab(lado + "Arm")
        g = H_c + u_e * ao_longo + n_e * 0.02
        g.x = s * X_PEG
        d = (g - S_).normalized()
        a_g = (n_e - d * d.dot(n_e)).normalized()
        pq = Vector((-s, 0, 0))
        pq = (pq - d * pq.dot(d)).normalized()
        polo = S_ + Vector((s * 0.35, 0.1, -0.1)) + n_e * 0.2
        maos.segurar(lado, g, d, pq, polo=polo)
        if acertar:
            maos.iks[lado].mute = False
            p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
            maos.segurar(lado, g, d, pq, polo=polo)
        peg[s] = (g, a_g)
        return ck.medir_juntas(rig)["cotovelo" + ("E" if s > 0 else "D")]

    for lado, s in LADOS:
        mao_no_pegador(lado, s, 0.15, acertar=True)
    lo, hi = -0.15, 0.20
    for _ in range(7):
        x_ = (lo + hi) / 2
        if mao_no_pegador("Left", 1, x_) > COTOVELO:
            hi = x_
        else:
            lo = x_
    ao_longo = (lo + hi) / 2
    for lado, s in LADOS:
        mao_no_pegador(lado, s, ao_longo)
        g, a_g = peg[s]
        pg.fechar_em_volta(bon, lado, g, a_g, RAIO)
    print("MÃOS | pegador %.3f m ao longo do encosto a partir do quadril | %s | cotovelo %s | punho %s" % (
        ao_longo, maos.info(), "/".join("%.0f" % ck.medir_juntas(rig)[k] for k in ("cotoveloE", "cotoveloD")),
        "/".join("%.0f" % ck.medir_juntas(rig)[k] for k in ("punhoE", "punhoD"))), flush=True)

    # ── 8) a máquina em volta do corpo (montada no começo, t=0: o carrinho embaixo; sobe d1 até t=1) ─────────────────────────────
    trilho_baixo = D_TRILHO - (c_p - H_c).dot(D)
    lp = e3.leg_press_45("leg_press", angulo=TRILHO, plataforma=(c_p, *PLATAFORMA), trilhos=TRILHOS, curso=(0.0, d1),
                         assento=(c_s, ASSENTO_ANG, COMP_ASSENTO, LARG_ASSENTO, ESP_ASSENTO),
                         encosto=(b_e, ENCOSTO, COMP_ENCOSTO, LARG_ENCOSTO, ESP_ENCOSTO),
                         lombar=((b0 - b_e).dot(u_e) + s_l, LOMBAR_A, LOMBAR_B, sai_l),
                         pegadores=({s: peg[s][0] for s in (1, -1)}, {s: peg[s][1] for s in (1, -1)}, COMP_PEGADOR, RAIO),
                         trilho_baixo=trilho_baixo, chassi_baixo=CHASSI_BAIXO)
    M_pl0 = {L: lp.raizes["plataforma"].matrix_world.inverted() @ M0[L] for L, _ in LADOS}

    def pose(t):
        """t=0 calcanhares embaixo, além do plano da plataforma (alongado); t=1 na ponta dos pés (flexão plantar)."""
        g = pernas(t)
        lp.mover(float((mtp() - M0m).dot(D)))    # o carrinho anda o mesmo que a base dos dedos, no trilho
        pose.giros = g

    pose.giros = giros

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        Mi = lp.raizes["plataforma"].matrix_world.inverted()
        escorrega = max((Mi @ cab(L + "ToeBase") - M_pl0[L]).length for L, _ in LADOS) * 1000
        pes = pele(("LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"))
        face = F_p + lp.deslocamento                 # face da plataforma ao longo de D (anda com o carrinho)
        e_pes = (pes - np.array(H_c)) @ np.array(E)
        fora = pes[e_pes < e_borda]                  # pele do pé abaixo da borda de baixo (pra fora da plataforma: arco e calcanhar)
        em_cima = pes[e_pes > e_borda]               # pele do pé em cima da plataforma
        pontas = []                                   # dedos (base → ponta) na face da plataforma: graus pra fora (+) de E
        for L, s_ in LADOS:
            v = p3.ponta(rig, L + "ToeBase") - cab(L + "ToeBase")
            v = v - D * v.dot(D)
            pontas.append(math.degrees(math.atan2(s_ * v.x, v.dot(E))))
        return ("tornozelo %s° | joelho %.1f/%.1f° | quadril %.1f/%.1f° | perna girada %s° | carrinho %.1f mm | base dos dedos × "
                "plataforma %.2f mm | calcanhar além do plano %+.1f mm | ponta do pé afundada %.1f mm | dedos %s° pra fora | tronco "
                "%.1f° | coluna %.1f° | valgo %s mm | "
                "base %.2f | cotovelo %.0f/%.0f° | %s" % (
                    "/".join("%.1f" % v for v in tc.tornozelo(jj)), juntas["joelhoE"], juntas["joelhoD"], juntas["quadrilE"],
                    juntas["quadrilD"], "/".join("%+.2f" % math.degrees(pose.giros[L][0]) for L, _ in LADOS),
                    lp.deslocamento * 1000, escorrega, (float((fora @ np.array(D)).max()) - face) * 1000,
                    (float((em_cima @ np.array(D)).max()) - face) * 1000,
                    "/".join("%+.0f" % v for v in pontas),
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    tc.coluna(jj)[0], "/".join("%.0f" % v for v in tc.joelho_valgo(jj)), tc.pes_base_lateral(jj)[0],
                    juntas["cotoveloE"], juntas["cotoveloD"], maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(lp.pegadores[s], RAIO, COMP_PEGADOR / 2, eixo=(0, 0, 1))) for L, s in LADOS]
    yq = float(H_c.y)
    return Cena(pose, lp.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.3, 0.75),
                camera_video=((3.5, yq + 1.35, 1.85), (0, yq - 0.3, 0.78), 50), info=info, apoios=lp.apoios,
                afunda_apoio_mm=20)
