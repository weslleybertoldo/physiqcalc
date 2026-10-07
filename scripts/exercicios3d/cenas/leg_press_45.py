# Leg Press 45° — cena da fábrica 3D (lote 4, 06/10/2026). Máquina nova: equip3d.leg_press_45 (trilhos a 45°, carrinho com a
# plataforma ⟂ ao trilho, assento e encosto reclinado com o apoio lombar, pegadores, travas).
# t = 0 pernas quase esticadas (joelho a ~10°, sem travar; o carrinho em cima) · t = 1 joelho a ~88° (o carrinho embaixo).
# Técnica (ExRx, Sled 45° Leg Press): "Sit on machine with back on padded support. Place feet on platform. Extend hips and knees.
# Release dock lever and grasp handles to sides." / "Lower sled by flexing hips and knees until knees are just short of complete
# flexion. Return by extending knees and hips." / "Keep knees pointed same directions as feet. Do not allow heels to raise off of
# platform, pushing with both heel and forefoot." NSCA (CSCS Textbook da Achievable, Leg press (machine)): "Sit in the machine with
# your back and hips against the pads." / "Place your feet flat and hip-width apart on the platform." / "keep your knees and feet
# aligned." / "Keep your back against the pad, and do not let your hips or heels rise." / "Do not lock out your knees." Fundo a ~90°
# no joelho (pedido; NASM, Leg Press: "returning to approximately 90 degrees of knee flexion"; ACE, Seated Leg Press: "the bend in
# your knees is at approximately 90 degrees with your heels flat") e cabeça no encosto (NASM: "with your back and head firmly
# against the backrest").
# Como o rig faz: o corpo inclina pra trás em volta do quadril até o glúteo e a parte de cima das costas encostarem juntos num
# encosto a 20° do chão (Golparian et al. 2021: "the backrest of the machine be adjusted at a 20° angle"); um apoio lombar (rolo
# achatado embutido no encosto) encaixa na curva da lombar e o pescoço estende até a nuca encostar. Cada tornozelo corre numa reta
# PARALELA ao trilho (os pés não saem do lugar na plataforma, que anda com o carrinho), na largura do quadril; o joelho fica no
# plano que passa pelo quadril e por essa reta, por cima dela, e a ponta do pé gira na plataforma pra esse plano (o joelho vai na
# direção do pé: as pontas ficam ~16° pra fora). A coxa e a canela entram com o eixo de dobra do joelho na normal desse plano e
# o mesmo giro em volta delas que no repouso (sem torcer a coxa). A sola fica chapada na plataforma (a sola do repouso girada −135°
# em X, ⟂ ao trilho), com a ponta e o calcanhar pisando igual. A máquina é montada EM VOLTA do corpo: a plataforma onde as solas
# encostam, o encosto nas costas, o assento embaixo do glúteo e das coxas (pernas quase esticadas), os pegadores onde as mãos
# fecham com os braços quase esticados. No movimento só as pernas e o carrinho mexem: o carrinho anda linear em t no trilho, cada
# tornozelo anda junto com ele e a coxa e a canela giram no plano da perna (2 ossos, de forma exata); pelve, tronco, cabeça,
# braços e mãos não mexem.
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
TRILHO = 45.0             # trilho a 45° do chão (Hammer Strength Linear Leg Press: "Featuring a 45-degree angle"; Precor DPL0601:
                          # "a 45 degree angled carriage sled")
ENCOSTO = 20.0            # encosto 20° acima da horizontal (Golparian et al. 2021: 15°, 20°, 25° e 30° "relative to the horizon";
                          # "the backrest of the machine be adjusted at a 20° angle")
ASSENTO_ANG = 20.0        # o assento sobe 20° pra frente e faz a "concha" com o encosto (escolha da fábrica)
ESP_ENCOSTO, LARG_ENCOSTO, COMP_ENCOSTO = 0.06, 0.40, 0.98   # estofado de 60 mm (Gym Gear Sterling: "60mm thick pads"); 40 cm de
                                                             # largura e do glúteo até passar da cabeça (escolha da fábrica)
ESP_ASSENTO, LARG_ASSENTO, COMP_ASSENTO = 0.06, 0.40, 0.30   # idem
AFUNDA = 0.002            # pele afundando no assento e no apoio lombar
AFUNDA_ENC = 0.004        # costas e glúteo apertando o encosto (a carga das pernas empurra o corpo nele: "positioning your back and
                          # sacrum (tailbone) flat against the machine's backrest", ACE)
AFUNDA_PE = 0.0005        # sola apertando a plataforma: a do pé mais raso (o direito do boneco fica ~2 mm mais raso que o
                          # esquerdo, que afunda ~2,3 mm: a sola do calcanhar cede com a carga)
Z_QUADRIL = 0.42          # altura das articulações do quadril (escolha da fábrica: o alto dos postes fica perto dos 145 cm das
                          # máquinas de verdade — Hammer Strength e Precor)
JOELHO0, JOELHO1 = 10.0, 88.0   # flexão do joelho: quase esticado em cima, sem travar → ~90° embaixo
PES_X = 0.14              # tornozelos a ±14 cm (quadris a ±10,6): pés na largura do quadril ("hip-width apart", NSCA e NASM);
                          # com o joelho indo na direção do pé, as pontas ficam ~16° pra fora (NASM: "toes pointing slightly
                          # outward")
PE_ALTO = 0.13            # a reta dos tornozelos passa 13 cm acima do quadril (ao longo da plataforma, pros dedos): onde os pés
                          # ficam em relação ao assento. Mais alto = mais quadril e menos tornozelo (ExRx: "Placing feet slightly
                          # high on platform emphasizes Gluteus Maximus"); com 13 cm o fundo fica com o quadril a ~120° (o normal
                          # da AAOS) e a flexão dorsal a ~27° (dentro dos 27 ± 6° de Hall & Docherty 2017)
PLATAFORMA = (0.72, 0.51, 0.02)   # 28,35" × 19,92" (BodyKore G277: "Platform Size : 28.35 X 19.92"), chapa de 2 cm
TRILHOS = (0.26, 0.30, 0.025)     # trilhos Ø 50 mm a ±26 cm, 30 cm abaixo do centro da plataforma (escolha da fábrica)
RAIO = 0.0145             # pegador de 29 mm (o cilindro da mão de referência)
COMP_PEGADOR = 0.14
X_PEG = 0.30              # pegadores 10 cm pra fora da borda do assento
COTOVELO = 20.0           # braços quase esticados nos pegadores ("grasp handles to sides", ExRx): a posição do pegador sai daí
LOMBAR_A, LOMBAR_B, LOMBAR_MAX = 0.11, 0.045, 0.04   # apoio lombar: rolo achatado de 22 × 9 cm, saindo no máximo 4 cm da face
                                                     # (Hammer Strength: "The extra-wide lumbar pad provides optimal lower back
                                                     # support"; o tamanho é escolha da fábrica)


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _ang_em_volta(a, b, n):
    """Ângulo com sinal (rad) de a até b em volta de n (a, b ⟂ n)."""
    return math.atan2(a.cross(b).dot(n), a.dot(b))


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta no pegador (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    repouso = {pb.name: pb.matrix_basis.copy() for pb in PB}
    pe_rep = {L: p3.mundo_osso(rig, L + "Foot").to_3x3().normalized() for L, _ in LADOS}      # sola chapada no chão (repouso)

    def anatomico(y, x):
        """Referencial (colunas X, Y, Z) com Y ao longo do osso e X no eixo de dobra (⟂ a Y)."""
        y = y.normalized()
        x = (x - y * x.dot(y)).normalized()
        return Matrix((x, y, x.cross(y))).transposed()

    # cada osso da perna em relação ao seu referencial anatômico de repouso (Y ao longo do osso, X no eixo do joelho, que em pé é
    # o X do mundo): a coxa e a canela entram na pose com esse mesmo giro em volta delas mesmas, com o eixo do joelho = a normal
    # do plano da perna (sem torcer a coxa: com o rotation_difference puro a coxa ficava ~50° torcida e as coxas entravam uma na
    # outra perto da virilha)
    rel = {}
    for L, _ in LADOS:
        for osso in ("UpLeg", "Leg"):
            F = p3.mundo_osso(rig, L + osso).to_3x3().normalized()
            rel[L + osso] = anatomico(F.col[1], Vector((1, 0, 0))).inverted() @ F
    pe_vet = {L: p3.cabeca(rig, L + "ToeBase") - p3.cabeca(rig, L + "Foot") for L, _ in LADOS}
    pivo0 = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    ae = math.radians(ENCOSTO)
    u_e = Vector((0, math.cos(ae), math.sin(ae)))           # ao longo do encosto, subindo pra trás
    n_e = Vector((0, -math.sin(ae), math.cos(ae)))          # normal da face do encosto (pro corpo)
    a_t = math.radians(TRILHO)
    D = Vector((0, -math.cos(a_t), math.sin(a_t)))          # ao longo do trilho, subindo (pra longe de quem empurra)
    E = Vector((0, math.sin(a_t), math.cos(a_t)))           # na face da plataforma, pra cima (pros dedos)
    X = Vector((1, 0, 0))

    # ── 1) deitado no encosto: o corpo inclina pra trás em volta do quadril até o glúteo e as costas encostarem juntos ──────────
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
        if dg < dc:            # o glúteo chega antes: as costas estão longe → inclina mais
            lo = r
        else:
            hi = r
    reclina = (lo + hi) / 2
    deitar(reclina)
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, Z_QUADRIL)) - pivo0)
    H_c = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    dg, dc = costas()
    F_e = min(dg, dc) + AFUNDA_ENC                 # face do encosto: n_e·P = F_e
    print("DEITADO | inclina %.2f° | glúteo × costas %.1f mm | quadril (%.4f %.4f %.4f)" % (reclina, (dg - dc) * 1000, *H_c),
          flush=True)

    # ── 2) apoio lombar: rolo achatado embutido no encosto que encaixa na curva da lombar ──────────────────────────────────────
    # no plano do encosto: s ao longo dele a partir do pé da normal do quadril, h = altura acima da face
    b0 = H_c - n_e * (H_c.dot(n_e) - F_e)          # ponto da face embaixo do quadril
    P = pele(("Hips", "Spine", "Spine1"))
    P = P[np.abs(P[:, 0]) < 0.10]
    sP, hP = (P - np.array(b0)) @ np.array(u_e), P @ np.array(n_e) - F_e
    a_l, b_l = LOMBAR_A - AFUNDA, LOMBAR_B - AFUNDA      # elipse um pouco menor: a pele entra AFUNDA na de verdade

    def sai_do_rolo(s0, s_l, sai):
        x = (s0 - s_l) / LOMBAR_A
        return sai - LOMBAR_B + LOMBAR_B * math.sqrt(1 - x * x) if abs(x) < 1 else 0.0

    melhor = None
    for s_l in np.arange(0.06, 0.26, 0.005):     # onde o rolo encaixa mais fundo na curva, sem entrar mais que AFUNDA na pele
        m = np.abs(sP - s_l) < a_l
        c_h = float((hP[m] - b_l * np.sqrt(1 - ((sP[m] - s_l) / a_l) ** 2)).min())
        sai = min(c_h + LOMBAR_B, LOMBAR_MAX)
        if melhor is None or sai > melhor[0] + 1e-4:
            melhor = (sai, s_l)
    sai_l, s_l = melhor
    for s0 in np.arange(0.0, 0.40, 0.04):
        mm = np.abs(sP - s0) < 0.02
        if mm.any():
            print("   LOMBAR s %+.2f: pele %.1f mm acima da face | rolo sai %.1f mm" % (
                s0, hP[mm].min() * 1000, max(0.0, sai_do_rolo(s0, s_l, sai_l)) * 1000))
    print("LOMBAR | rolo achatado %.0f × %.0f mm em s %.3f saindo %.1f mm da face" % (
        2000 * LOMBAR_A, 2000 * LOMBAR_B, s_l, sai_l * 1000), flush=True)

    # ── 3) cabeça no encosto: estende o pescoço até a nuca encostar ────────────────────────────────────────────────────────
    pescoco = 0
    while float((pele(("Head",)) @ np.array(n_e)).min()) > F_e + 0.001 and pescoco < 25:
        p3.girar_osso(rig, "Neck", p3.rot_x(-1))
        pescoco += 1
    print("CABEÇA | pescoço estendido %d° | nuca %.1f mm acima da face" % (
        pescoco, (float((pele(("Head",)) @ np.array(n_e)).min()) - F_e) * 1000), flush=True)

    # ── 4) pernas: tornozelo numa reta paralela ao trilho, PE_ALTO acima do quadril (ao longo de E), joelho por cima ──────────
    l1 = (p3.cabeca(rig, "LeftLeg") - p3.cabeca(rig, "LeftUpLeg")).length
    l2 = (p3.cabeca(rig, "LeftFoot") - p3.cabeca(rig, "LeftLeg")).length
    H = {L: p3.cabeca(rig, L + "UpLeg") for L, _ in LADOS}
    Q = {L: Vector((s * PES_X, H_c.y, H_c.z)) + E * PE_ALTO for L, s in LADOS}    # um ponto da reta de cada tornozelo

    def u_da_distancia(L, dist):
        v = Q[L] - H[L]                                # |v + u D| = dist → u² + 2 u (v·D) + |v|² − dist² = 0
        b, c = v.dot(D), v.length_squared - dist ** 2
        return -b + math.sqrt(b * b - c)

    def dist_joelho(j):
        return math.sqrt(l1 ** 2 + l2 ** 2 + 2 * l1 * l2 * math.cos(math.radians(j)))

    u0 = u_da_distancia("Left", dist_joelho(JOELHO0))
    u1 = u_da_distancia("Left", dist_joelho(JOELHO1))
    normal = {}                                        # normal do plano de cada perna (quadril + reta do tornozelo)
    for L, s in LADOS:
        n = D.cross(Q[L] + D * u0 - H[L]).normalized()
        normal[L] = n if n.x > 0 else -n

    def alvo(L, t):
        """Tornozelo e joelho no quadro t (o carrinho anda linear em t ao longo do trilho)."""
        A = Q[L] + D * p3.lerp(u0, u1, t)
        d = A - H[L]
        u = d.normalized()
        w = normal[L].cross(u)
        if w.dot(E) < 0:
            w = -w
        a = (l1 ** 2 - l2 ** 2 + d.length_squared) / (2 * d.length)
        h = math.sqrt(max(l1 ** 2 - a * a, 0.0))
        return A, H[L] + u * a + w * h

    # pé chapado na plataforma (⟂ ao trilho): a sola do repouso girada −135° em X, e a ponta do pé no plano da perna (o joelho
    # vai na direção do pé)
    R_pl = Matrix.Rotation(math.radians(-135.0), 3, "X")
    pe_alvo = {}
    for L, s in LADOS:
        v1 = R_pl @ pe_vet[L]
        v1 = v1 - D * v1.dot(D)
        m = D.cross(normal[L]).normalized()
        if m.dot(E) < 0:
            m = -m
        giro = _ang_em_volta(v1.normalized(), m, D)
        pe_alvo[L] = Matrix.Rotation(giro, 3, D) @ R_pl @ pe_rep[L]
        print("PÉ %s | ponta do pé girada %.1f° na plataforma pro plano da perna" % (L, math.degrees(giro)))

    def por_pe(L):
        F = p3.mundo_osso(rig, L + "Foot").to_3x3().normalized()
        p3.girar_osso(rig, L + "Foot", pe_alvo[L] @ F.inverted())

    def pisada(L):
        """Calcanhar − ponta do pé (m, ao longo do trilho): > 0 = a ponta não pisa tanto quanto o calcanhar."""
        return float((pele((L + "Foot",)) @ np.array(D)).max() - (pele((L + "ToeBase",)) @ np.array(D)).max())

    # base das pernas: o fim do movimento (t=1)
    def alinhar(L, osso, direcao):
        """Osso com o Y ao longo de `direcao` e o eixo de dobra na normal do plano da perna (o giro de repouso em volta dele)."""
        F = p3.mundo_osso(rig, L + osso).to_3x3().normalized()
        p3.girar_osso(rig, L + osso, anatomico(direcao, normal[L]) @ rel[L + osso] @ F.inverted())

    for L, s in LADOS:
        A, K = alvo(L, 1.0)
        alinhar(L, "UpLeg", K - H[L])
        alinhar(L, "Leg", A - K)
        por_pe(L)
        print("PERNA %s | joelho %.1f mm do alvo, tornozelo %.1f mm | normal (%.3f %.3f %.3f)" % (
            L, (p3.cabeca(rig, L + "Leg") - K).length * 1000, (p3.cabeca(rig, L + "Foot") - A).length * 1000, *normal[L]))
    for L, s in LADOS:                              # a ponta do pé pisa como o calcanhar ("pushing with both heel and forefoot")
        giro_pe = 0.0
        for _ in range(4):
            dif = pisada(L)
            if abs(dif) < 0.0002:
                break
            g = dif / 0.19                          # alavanca calcanhar → planta ~19 cm
            pe_alvo[L] = Matrix.Rotation(g, 3, normal[L]) @ pe_alvo[L]
            por_pe(L)
            if abs(pisada(L)) > abs(dif):           # girou pro lado errado: volta e gira pro outro
                pe_alvo[L] = Matrix.Rotation(-2 * g, 3, normal[L]) @ pe_alvo[L]
                por_pe(L)
                g = -g
            giro_pe += g
        print("PÉ %s | calcanhar × ponta %.1f mm (pé girado %.2f°)" % (L, pisada(L) * 1000, math.degrees(giro_pe)), flush=True)
    base = {n: PB[p3.P + n].matrix_basis.copy() for L, _ in LADOS for n in (L + "UpLeg", L + "Leg", L + "Foot")}
    coxa_base = {L: (p3.cabeca(rig, L + "Leg") - H[L]).normalized() for L, _ in LADOS}

    def pernas(t):
        """Coxa e canela de cada lado giram no plano da perna até o joelho e o tornozelo do quadro t; o pé fica chapado."""
        for n, M in base.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        for L, _ in LADOS:
            A, K = alvo(L, t)
            n = normal[L]
            p3.girar_osso(rig, L + "UpLeg", Matrix.Rotation(_ang_em_volta(coxa_base[L], (K - H[L]).normalized(), n), 3, n))
            k, a = p3.cabeca(rig, L + "Leg"), p3.cabeca(rig, L + "Foot")
            p3.girar_osso(rig, L + "Leg", Matrix.Rotation(_ang_em_volta((a - k).normalized(), (A - k).normalized(), n), 3, n))
            por_pe(L)

    # ── 5) plataforma (no começo, t=0): face ⟂ ao trilho onde as solas encostam, centrada nos pés ──────────────────────────────
    pernas(0.0)
    fundos = [float((pele((L + "Foot", L + "ToeBase")) @ np.array(D)).max()) for L, _ in LADOS]
    F_p = min(fundos) - AFUNDA_PE                  # a sola mais rasa (a do pé direito, ~2 mm mais rasa) afunda AFUNDA_PE
    eS = pele(("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase")) @ np.array(E)
    e_meio = float((eS.min() + eS.max()) / 2)
    c_p = H_c + E * (e_meio - H_c.dot(E)) + D * (F_p - H_c.dot(D))
    c_p.x = 0.0
    print("PLATAFORMA | solas E %.1f / D %.1f mm | pés de %.3f a %.3f ao longo dela | centro (%.4f %.4f %.4f) | curso %.3f m" % (
        (fundos[0] - F_p) * 1000, (fundos[1] - F_p) * 1000, eS.min() - e_meio, eS.max() - e_meio, *c_p, u1 - u0), flush=True)

    # ── 6) assento: estofado subindo ASSENTO_ANG pra frente, embaixo do glúteo e das coxas com as pernas quase esticadas ───────
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
        """Mão `lado` no pegador `ao_longo` m do quadril ao longo do encosto (IK + mão na pegada, sem fechar os dedos): o pegador
        fica ⟂ à reta ombro → mão, os dedos ao longo dela e a palma pro corpo. Devolve a flexão do cotovelo."""
        S_ = p3.cabeca(rig, lado + "Arm")
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

    for lado, s in LADOS:                            # polo certo com o cotovelo bem dobrado (pegador perto do ombro)
        mao_no_pegador(lado, s, 0.15, acertar=True)
    lo, hi = -0.15, 0.20                            # mais pra frente (−) = braço mais esticado
    for _ in range(7):
        x_ = (lo + hi) / 2
        if mao_no_pegador("Left", 1, x_) > COTOVELO:
            hi = x_
        else:
            lo = x_
    ao_longo = (lo + hi) / 2
    for lado, s in LADOS:                            # as mãos não mexem: dedos e polegar fecham uma vez só
        mao_no_pegador(lado, s, ao_longo)
        g, a_g = peg[s]
        pg.fechar_em_volta(bon, lado, g, a_g, RAIO)
    print("MÃOS | pegador %.3f m ao longo do encosto a partir do quadril | %s | cotovelo %s | punho %s" % (
        ao_longo, maos.info(), "/".join("%.0f" % ck.medir_juntas(rig)[k] for k in ("cotoveloE", "cotoveloD")),
        "/".join("%.0f" % ck.medir_juntas(rig)[k] for k in ("punhoE", "punhoD"))), flush=True)

    # ── 8) a máquina em volta do corpo (montada no começo, t=0: o carrinho desce o curso até t=1) ──────────────────────────────
    lp = e3.leg_press_45("leg_press", angulo=TRILHO, plataforma=(c_p, *PLATAFORMA), trilhos=TRILHOS, curso=(u1 - u0, 0.0),
                         assento=(c_s, ASSENTO_ANG, COMP_ASSENTO, LARG_ASSENTO, ESP_ASSENTO),
                         encosto=(b_e, ENCOSTO, COMP_ENCOSTO, LARG_ENCOSTO, ESP_ENCOSTO),
                         lombar=((b0 - b_e).dot(u_e) + s_l, LOMBAR_A, LOMBAR_B, sai_l),
                         pegadores=({s: peg[s][0] for s in (1, -1)}, {s: peg[s][1] for s in (1, -1)}, COMP_PEGADOR, RAIO))
    tornozelo0 = {L: lp.raizes["plataforma"].matrix_world.inverted() @ p3.cabeca(rig, L + "Foot") for L, _ in LADOS}

    def pose(t):
        """t=0 pernas quase esticadas (carrinho em cima), t=1 joelho a ~88° (carrinho embaixo)."""
        pernas(t)
        lp.mover(p3.lerp(0.0, u1 - u0, t))       # o carrinho anda o mesmo que os tornozelos, no trilho

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        Mi = lp.raizes["plataforma"].matrix_world.inverted()
        escorrega = max((Mi @ p3.cabeca(rig, L + "Foot") - tornozelo0[L]).length for L, _ in LADOS) * 1000
        return ("joelho %.1f/%.1f° | quadril %.0f/%.0f° | tornozelo %s° | carrinho %.3f m | pé × plataforma %.1f mm | "
                "tronco %.1f° | coluna %.1f° | valgo %s mm | base %.2f | cotovelo %.0f/%.0f° | %s" % (
                    juntas["joelhoE"], juntas["joelhoD"], juntas["quadrilE"], juntas["quadrilD"],
                    "/".join("%.0f" % v for v in tc.tornozelo(jj)), lp.deslocamento, escorrega,
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
