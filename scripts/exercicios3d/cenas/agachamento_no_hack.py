# Agachamento no Hack — cena da fábrica 3D (lote 7, 08/10/2026). Máquina nova: equip3d.hack (2 trilhos a 45°, o carrinho com o encosto,
# o apoio da cabeça, as 2 ombreiras e os pegadores na frente delas, a plataforma dos pés PARADA, travas, postes e base).
# t = 0 em cima, pernas quase esticadas (joelho a ~10°, sem travar) · t = 1 embaixo: joelho a ~100°, a coxa paralela à plataforma.
# Técnica (ExRx, Sled Hack Squat): "Lie supine on back pad with shoulders under shoulder pad. Place feet on platform slightly higher than
# base of sled. Extend hips and knees. Release dock levers." / "To lower sled, bend hips and knees until knees are just short of complete
# flexion. Raise sled by extending knees and hips." / "If insufficient hip flexibility forces pelvis to pull away from back pad at lower
# portions of movement, only lower sled just short of spinal articulation. Keep knees pointed same directions as feet. Do not allow heels
# to raise off of platform, pushing with both heel and forefoot." Profundidade e pés de Clark, Lambert e Hunter (J Strength Cond Res
# 2019; o método lido na tese de Clark, Univ. de Stirling 2018): "Hack squats were performed with the back placed against the padded
# surface, shoulders wedged under the yokes and feet placed shoulder width apart to the front of the footplate." / "a minimum knee flexion
# of 90o" / "the top of the thighs were horizontal in BS and parallel to the footplate in HS". A dica do app pede pelo menos 90° e subir
# sem travar; o fundo fica no agachamento "paralelo" (Escamilla, Med Sci Sports Exerc 2001: "the parallel squat (thighs parallel to
# ground at maximum knee flexion) between 0 and 100 degrees knee flexion"; "performing the parallel squat is recommended over the deep
# squat") — joelho a ~100° com a coxa paralela à plataforma.
# Como o rig faz: o corpo inteiro (em pé, no repouso) deita pra trás em volta do quadril até o glúteo e a parte de cima das costas
# encostarem juntos no encosto, que é paralelo aos trilhos (45° do chão); a cabeça fica neutra (como em pé) e encosta no apoio da cabeça,
# saliente (Sorinex: "Elevated Head Pad"); os braços vão pros pegadores na frente das ombreiras (pegada neutra, punho reto) e as
# ombreiras assentam em cima dos ombros, viradas pro lado como a inclinação deles. No movimento o tronco, a pelve, a cabeça e os braços
# são UM bloco que anda junto com o carrinho no trilho (as costas não escorregam no encosto); só as pernas dobram. Cada tornozelo fica
# PARADO na plataforma, na largura dos ombros (a do boneco em pé); o quadril anda numa reta paralela ao trilho, o joelho fica no plano que
# passa pelo tornozelo e por essa reta, por cima dela, e a ponta do pé gira na plataforma pra esse plano (o joelho vai na direção do pé).
# A coxa e a canela entram com o eixo de dobra do joelho na normal desse plano e o mesmo giro em volta delas que no repouso (o jeito do
# leg_press_45). A plataforma fica como uma cunha de 10° embaixo do calcanhar em relação à reta ⟂ ao trilho (a posição do Hammer
# Strength PL-HSQ2), os pés no meio dela; o quanto os pés ficam à frente da reta do quadril sai da conta: embaixo, joelho a JOELHO1 com a
# coxa paralela à plataforma. A sola fica chapada (a do repouso girada pra plataforma), com a ponta e o calcanhar pisando igual.
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
TRILHO = 45.0             # trilhos a 45° do chão (Hammer Strength Plate Loaded Hack Squat PL-HSQ2: "a 45-degree pressing angle")
CALCO = 10.0              # plataforma = cunha de 10° embaixo do calcanhar em relação à reta ⟂ ao trilho (PL-HSQ2: "the equivalent of
                          # both a 3°and 10° heel wedge"): a plataforma fica a 35° do chão, subindo pras pontas dos pés
JOELHO0, JOELHO1 = 10.0, 100.0   # flexão do joelho: quase esticado em cima, sem travar → ~100° embaixo (a dica: "pelo menos 90°")
COXA_PLAT = 0.0           # embaixo, a coxa (quadril → joelho) paralela à plataforma (Clark et al.: "parallel to the footplate")
Z_QUADRIL = 0.86          # altura das articulações do quadril em cima (escolha da fábrica: a borda de baixo da plataforma fica a
                          # ~30 cm do chão e o alto do carrinho perto dos 153 cm do PL-HSQ2)
LARG_ENCOSTO, ESP_ENCOSTO = 0.292, 0.070   # encosto de 11,5" de largura e 2,75" de estofado (Titan Plate-Loaded Linear Hack Squat:
                                           # "Back Pad Dimensions 20-in x 11.5-in x 2.75-in.")
ENCOSTO_ABAIXO = 0.12     # o encosto começa 12 cm abaixo do quadril (ao longo do trilho: embaixo do glúteo)
ENCOSTO_ATE = 0.48        # e vai até 48 cm acima dele (a parte de cima das costas; acima ficam as ombreiras e o apoio da cabeça)
GLUTEO_ATE = 0.15         # o encosto em 2 almofadas (como o "Seat Pad" e o "Back Pad" do Titan): a de baixo, do glúteo e do sacro, vai
                          # até 15 cm acima do quadril (antes da lombar); a de cima é a das costas
CAB_DE, CAB_ATE, LARG_CAB = 0.65, 0.86, 0.12   # apoio da cabeça (ao longo do trilho a partir do quadril) e largura (escolha da fábrica)
AFUNDA = 0.002            # pele afundando no apoio da cabeça e na almofada do glúteo (embaixo, onde a pele dele fica mais longe)
AFUNDA_ENC = 0.003        # glúteo e costas apertando o encosto (a carga empurra o corpo contra ele)
AFUNDA_PE = 0.0005        # sola apertando a plataforma (o contato mais raso de cada pé, calcanhar ou ponta)
OMB_COMP, OMB_LARG, OMB_ESP = 0.305, 0.127, 0.076   # ombreira de 12" × 5" (Hoist RPL-5405: "12" X 5" MOLDED PAD"), 3" de estofado
X_OMB = 0.15              # meio da ombreira a 15 cm do meio do corpo: em cima do trapézio e do acrômio, longe do pescoço
AFUNDA_OMB = 0.003        # a pele do ombro afunda na ombreira
RAIO = 0.0155             # pegador de 31 mm e 8" (Titan Plate-Loaded Linear Hack Squat: "Handle Diameter 31mm", "Handle Length 8-in.")
COMP_PEGADOR = 0.203
PEG_FRENTE, PEG_ACIMA, PEG_FORA = 0.26, 0.10, 0.03   # meio do pegador em relação à articulação do ombro, no referencial do trilho:
                          # 26 cm à frente, 10 cm acima, 3 cm por fora — as mãos na altura do queixo, na frente das ombreiras e do lado
                          # da cabeça, os cotovelos embaixo (como na animação do ExRx, Sled Hack Squat, e na foto de Clark 2018)
PLATAFORMA = (0.641, 0.591, 0.02)   # 25,25" × 23,25" (Titan: "Footplate Dimensions 25.25-in x 23.25-in."), chapa de 2 cm
TRILHOS_X, TRILHO_RAIO = 0.21, 0.025   # trilhos Ø 50 mm a ±21 cm (escolha da fábrica; os do leg_press_45 são iguais)
LUVA = (0.33, 0.30)       # luva de 30 cm com o meio a 33 cm da base do encosto (escolha da fábrica)
PINOS = (0.30, 0.025, 0.248)   # pino de anilha de 50 mm e 9,75" (Titan: "Weight Sleeve Diameter 50mm", "Weight Sleeve Length 9.75-in.")


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _ang_em_volta(a, b, n):
    """Ângulo com sinal (rad) de a até b em volta de n (a, b ⟂ n)."""
    return math.atan2(a.cross(b).dot(n), a.dot(b))


def _orientacao(f, u, s):
    """Pegada neutra no pegador de eixo u: os dedos na direção do antebraço f (⟂ a u), a palma ⟂ aos dois, virada pro meio."""
    dq = (f - u * f.dot(u)).normalized()
    pq = u.cross(dq).normalized()
    if pq.x * s > 0:
        pq = -pq
    return dq, pq


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta no pegador (padrão dos exercícios novos)
    pg.usar_cilindro(2000 * RAIO)     # mão de referência de um cilindro de 31 mm
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

    rel = {}                          # cada osso da perna em relação ao seu referencial anatômico de repouso (leg_press_45)
    for L, _ in LADOS:
        for osso in ("UpLeg", "Leg"):
            Fm = p3.mundo_osso(rig, L + osso).to_3x3().normalized()
            rel[L + osso] = anatomico(Fm.col[1], Vector((1, 0, 0))).inverted() @ Fm
    pe_vet = {L: p3.cabeca(rig, L + "ToeBase") - p3.cabeca(rig, L + "Foot") for L, _ in LADOS}
    pivo0 = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    a_t = math.radians(TRILHO)
    D = Vector((0, math.cos(a_t), math.sin(a_t)))           # ao longo do trilho, subindo (pra trás de quem está no hack)
    F = Vector((0, -math.sin(a_t), math.cos(a_t)))          # normal da face do encosto (pro corpo): a "frente" no referencial do trilho
    X = Vector((1, 0, 0))
    w_c = math.radians(CALCO)
    N_p = D * math.cos(w_c) + F * math.sin(w_c)              # normal da plataforma (pros pés)
    P_f = X.cross(N_p).normalized()                          # ao longo da plataforma, pra frente (pras pontas dos pés)

    # ── 1) deitado no encosto: o corpo inclina pra trás em volta do quadril até o glúteo e as costas encostarem juntos ──────────────
    def deitar(r):
        for pb in PB:
            pb.matrix_basis = repouso[pb.name].copy()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(-r), pivo=pivo0)

    def costas():
        """Quanto o glúteo e a parte de cima das costas chegam no encosto (F·p, m; menor = mais pra trás)."""
        co, _, (nomes, dono) = _malha(bon)
        nn = np.array(F)
        g = co[_grupo(nomes, dono, ("Hips",))]
        g = g[np.abs(g[:, 0]) < 0.16]
        c = co[_grupo(nomes, dono, ("Spine1", "Spine2", "LeftShoulder", "RightShoulder"))]
        c = c[np.abs(c[:, 0]) < LARG_ENCOSTO / 2 - 0.02]
        return float((g @ nn).min()), float((c @ nn).min())

    lo, hi = 30.0, 60.0
    for _ in range(14):
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
    H0 = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    dg, dc = costas()
    F_e = min(dg, dc) + AFUNDA_ENC                 # face do encosto: F·P = F_e
    b_e = H0 - F * (H0.dot(F) - F_e) - D * ENCOSTO_ABAIXO     # base da face do encosto (no meio, x = 0)
    b_e.x = 0.0
    print("DEITADO | inclina %.2f° | glúteo × costas %.1f mm | quadril (%.4f %.4f %.4f), %.1f mm na frente da face do encosto" % (
        reclina, (dg - dc) * 1000, *H0, (H0.dot(F) - F_e) * 1000), flush=True)

    # ── 2) braços: as mãos nos pegadores na frente das ombreiras (pegada neutra: palmas pro meio, os dedos na linha do antebraço) ─────
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")
    alvos = {}

    def eixo_pegador(f):
        """Eixo do pegador ⟂ ao antebraço f no plano de frente-trás (punho reto na pegada neutra), descendo pra frente."""
        e = F * f.dot(D) - D * f.dot(F)
        return e.normalized() if e.dot(F) > 0 else -e.normalized()

    def bracos(acertar=False):
        for L, s in LADOS:
            sh = p3.cabeca(rig, L + "Arm")
            g = sh + X * (s * PEG_FORA) + F * PEG_FRENTE + D * PEG_ACIMA
            polo = sh + X * (s * 0.30) + F * 0.20 - D * 0.60      # cotovelo embaixo (ao longo do trilho), na frente e pra fora
            f = (g - (sh + X * (s * 0.03) + F * 0.08 - D * 0.22)).normalized()   # antebraço saindo de um cotovelo chutado
            for k in range(3):
                u = eixo_pegador(f)
                dq, pq = _orientacao(f, u, s)
                maos.segurar(L, g, dq, pq, polo=polo)
                if acertar and k == 0:
                    maos.iks[L].mute = False
                    p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
                    maos.segurar(L, g, dq, pq, polo=polo)
                f = (p3.cabeca(rig, L + "Hand") - p3.cabeca(rig, L + "ForeArm")).normalized()
            alvos[s] = (g, u)

    bracos(acertar=True)
    dedos = {}
    for L, s in LADOS:                            # as mãos não mexem em relação ao carrinho: dedos e polegar fecham uma vez só
        g, u = alvos[s]
        dedos[L] = pg.fechar_em_volta(bon, L, g, u, RAIO)
    jm = ck.medir_juntas(rig)
    print("MÃOS | %s | cotovelo %.0f/%.0f° | punho %.0f/%.0f° | polegar %s / %s" % (
        maos.info(), jm["cotoveloE"], jm["cotoveloD"], jm["punhoE"], jm["punhoD"],
        dedos["Left"].get("Thumb"), dedos["Right"].get("Thumb")), flush=True)

    # ── 3) ombreiras em cima dos ombros, viradas pro lado como a inclinação do ombro (com os braços já nos pegadores: o braço posado
    #    muda a pele do topo do ombro) ──────────────────────────────────────────────────────────────────────────────────────────────
    G = pele(("LeftShoulder", "LeftArm", "Spine2", "Neck"))
    perto = G[np.abs(G[:, 0] - X_OMB) < 0.008]
    topo = perto[int(np.argmax(perto @ np.array(D)))]
    c0 = Vector((X_OMB, float(topo[1]), float(topo[2])))
    melhor = None
    for k in range(0, 41):                        # inclinação da ombreira pro lado (graus): a face assenta nos 2 lados
        ang = math.radians(k)
        n = X * math.sin(ang) + D * math.cos(ang)
        wv = F.cross(n)
        relv = G - np.array(c0)
        sw, su, sn = relv @ np.array(wv), relv @ np.array(F), relv @ np.array(n)
        dentro = (np.abs(sw) < OMB_LARG / 2 - 0.012) & (np.abs(su) < OMB_COMP / 2 - 0.012)
        hmax = float(sn[dentro].max())
        folga = hmax - sn[dentro]
        lados = [folga[sw[dentro] < -0.02], folga[sw[dentro] > 0.02]]
        if min(len(f_) for f_ in lados) < 5:
            continue
        ruim = max(float(np.percentile(f_, 3)) for f_ in lados)
        if melhor is None or ruim < melhor[0]:
            melhor = (ruim, k, hmax, n)
    _, k_omb, hmax, n_omb = melhor
    c_omb = c0 + n_omb * (hmax - AFUNDA_OMB)
    print("OMBREIRA | inclinada %d° pro lado | face de baixo (%.4f %.4f %.4f), %.1f mm na frente da face do encosto e %.1f mm acima "
          "do quadril ao longo do trilho | folga dos 2 lados %.1f mm" % (
              k_omb, *c_omb, (c_omb.dot(F) - F_e) * 1000, (c_omb - H0).dot(D) * 1000, melhor[0] * 1000), flush=True)

    # ── 4) cabeça neutra (como em pé) encostada no apoio da cabeça, saliente na frente do encosto ──────────────────────────────────
    Hd = pele(("Head",))
    Hd = Hd[np.abs(Hd[:, 0]) < LARG_CAB / 2 - 0.01]
    sH = (Hd - np.array(H0)) @ np.array(D)
    Hd = Hd[(sH > CAB_DE + 0.01) & (sH < CAB_ATE - 0.01)]
    nuca = float((Hd @ np.array(F)).min()) - F_e
    sai_cab = nuca + AFUNDA                       # a face do apoio fica AFUNDA na frente da nuca: a pele afunda nele
    print("CABEÇA | nuca %.1f mm na frente da face do encosto: apoio da cabeça saliente %.1f mm" % (nuca * 1000, sai_cab * 1000),
          flush=True)

    # ── 5) pernas: cada tornozelo parado na plataforma; o quadril anda na reta paralela ao trilho; o joelho por cima ─────────────────
    l1 = (p3.cabeca(rig, "LeftLeg") - p3.cabeca(rig, "LeftUpLeg")).length
    l2 = (p3.cabeca(rig, "LeftFoot") - p3.cabeca(rig, "LeftLeg")).length
    Hq = {L: p3.cabeca(rig, L + "UpLeg") for L, _ in LADOS}
    Ax = {L: p3.cabeca(rig, L + "Foot").x for L, _ in LADOS}    # tornozelos na largura do repouso (a dos ombros)

    def dist_joelho(j):
        return math.sqrt(l1 ** 2 + l2 ** 2 + 2 * l1 * l2 * math.cos(math.radians(j)))

    def geometria(f):
        """Com o tornozelo f m à frente da reta do quadril (ao longo de F): tornozelos, curso e a coxa × plataforma embaixo."""
        A, nrm = {}, {}
        for L, s in LADOS:
            dx = Ax[L] - Hq[L].x
            a = math.sqrt(dist_joelho(JOELHO0) ** 2 - dx * dx - f * f)
            A[L] = Hq[L] + X * dx - D * a + F * f
            n = D.cross(A[L] - Hq[L]).normalized()
            nrm[L] = n if n.x > 0 else -n
        v = A["Left"] - Hq["Left"]                    # |v + D u| = dist(JOELHO1) → u (o quanto o quadril desce)
        b, c = v.dot(D), v.length_squared - dist_joelho(JOELHO1) ** 2
        u1 = -b - math.sqrt(b * b - c) if -b - math.sqrt(b * b - c) > 0 else -b + math.sqrt(b * b - c)
        return A, nrm, u1

    def joelho_em(L, A, nrm, H):
        d = A - H
        u = d.normalized()
        w = nrm.cross(u)
        if w.dot(F) < 0:
            w = -w
        a = (l1 ** 2 - l2 ** 2 + d.length_squared) / (2 * d.length)
        h = math.sqrt(max(l1 ** 2 - a * a, 0.0))
        return H + u * a + w * h

    def coxa_plat(f):
        A, nrm, u1 = geometria(f)
        H = Hq["Left"] - D * u1
        K = joelho_em("Left", A["Left"], nrm["Left"], H)
        return math.degrees(math.asin((K - H).normalized().dot(N_p)))

    lo, hi = 0.10, 0.40                               # pés mais pra frente → coxa embaixo mais "acima" da paralela
    for _ in range(30):
        m_ = (lo + hi) / 2
        if coxa_plat(m_) > COXA_PLAT:
            hi = m_
        else:
            lo = m_
    PE_FRENTE = (lo + hi) / 2
    A_t, normal, U1 = geometria(PE_FRENTE)
    print("PÉS | tornozelo %.3f m à frente da reta do quadril | curso %.3f m | coxa × plataforma embaixo %.2f°" % (
        PE_FRENTE, U1, coxa_plat(PE_FRENTE)), flush=True)

    def alvo(L, t):
        """Tornozelo (parado) e joelho no quadro t (o quadril desce linear em t ao longo do trilho)."""
        H = Hq[L] - D * p3.lerp(0.0, U1, t)
        return A_t[L], joelho_em(L, A_t[L], normal[L], H)

    # pé chapado na plataforma: a sola do repouso girada pra plataforma (35° do chão) e a ponta do pé no plano da perna
    R_pl = Matrix.Rotation(-(a_t - w_c), 3, "X")
    pe_alvo = {}
    for L, s in LADOS:
        v1 = R_pl @ pe_vet[L]
        v1 = v1 - N_p * v1.dot(N_p)
        m = N_p.cross(normal[L]).normalized()
        if m.dot(P_f) < 0:
            m = -m
        giro = _ang_em_volta(v1.normalized(), m, N_p)
        pe_alvo[L] = Matrix.Rotation(giro, 3, N_p) @ R_pl @ pe_rep[L]
        print("PÉ %s | ponta do pé girada %.1f° na plataforma pro plano da perna" % (L, math.degrees(giro)))

    def por_pe(L):
        Fm = p3.mundo_osso(rig, L + "Foot").to_3x3().normalized()
        p3.girar_osso(rig, L + "Foot", pe_alvo[L] @ Fm.inverted())

    def pisada(L):
        """Calcanhar − ponta do pé (m, pra dentro da plataforma): > 0 = a ponta não pisa tanto quanto o calcanhar."""
        nn = -np.array(N_p)
        return float((pele((L + "Foot",)) @ nn).max() - (pele((L + "ToeBase",)) @ nn).max())

    def alinhar(L, osso, direcao):
        """Osso com o Y ao longo de `direcao` e o eixo de dobra na normal do plano da perna (o giro de repouso em volta dele)."""
        Fm = p3.mundo_osso(rig, L + osso).to_3x3().normalized()
        p3.girar_osso(rig, L + osso, anatomico(direcao, normal[L]) @ rel[L + osso] @ Fm.inverted())

    hips0 = PB[p3.P + "Hips"].matrix_basis.copy()      # o tronco em cima (t = 0)

    def descer(u):
        """Tronco, pelve, cabeça e braços (um bloco só) `u` m abaixo de onde ficam em cima, ao longo do trilho."""
        PB[p3.P + "Hips"].matrix_basis = hips0.copy()
        p3.atualizar()
        if u:
            p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=-D * u)

    # base das pernas: o fim do movimento (t = 1)
    descer(U1)
    for L, s in LADOS:
        A, K = alvo(L, 1.0)
        H = p3.cabeca(rig, L + "UpLeg")
        alinhar(L, "UpLeg", K - H)
        alinhar(L, "Leg", A - K)
        por_pe(L)
        print("PERNA %s | joelho %.1f mm do alvo, tornozelo %.1f mm | normal (%.3f %.3f %.3f)" % (
            L, (p3.cabeca(rig, L + "Leg") - K).length * 1000, (p3.cabeca(rig, L + "Foot") - A).length * 1000, *normal[L]))
    for L, s in LADOS:                              # a ponta do pé pisa como o calcanhar ("pushing with both heel and forefoot")
        eixo_p = N_p.cross(pe_alvo[L] @ (pe_rep[L].inverted() @ pe_vet[L])).normalized()
        giro_pe = 0.0
        for _ in range(4):
            dif = pisada(L)
            if abs(dif) < 0.0002:
                break
            g_ = dif / 0.19                         # alavanca calcanhar → planta ~19 cm
            pe_alvo[L] = Matrix.Rotation(g_, 3, eixo_p) @ pe_alvo[L]
            por_pe(L)
            if abs(pisada(L)) > abs(dif):           # girou pro lado errado: volta e gira pro outro
                pe_alvo[L] = Matrix.Rotation(-2 * g_, 3, eixo_p) @ pe_alvo[L]
                por_pe(L)
                g_ = -g_
            giro_pe += g_
        print("PÉ %s | calcanhar × ponta %.1f mm (pé girado %.2f°)" % (L, pisada(L) * 1000, math.degrees(giro_pe)), flush=True)
    base = {n: PB[p3.P + n].matrix_basis.copy() for L, _ in LADOS for n in (L + "UpLeg", L + "Leg", L + "Foot")}
    coxa_base = {L: (p3.cabeca(rig, L + "Leg") - p3.cabeca(rig, L + "UpLeg")).normalized() for L, _ in LADOS}

    def pernas(t):
        """O bloco de cima desce até o quadro t; coxa e canela giram no plano da perna até o joelho e o tornozelo; o pé fica chapado."""
        for n, M in base.items():
            PB[p3.P + n].matrix_basis = M.copy()
        descer(p3.lerp(0.0, U1, t))
        for L, _ in LADOS:
            A, K = alvo(L, t)
            n = normal[L]
            H = p3.cabeca(rig, L + "UpLeg")
            p3.girar_osso(rig, L + "UpLeg", Matrix.Rotation(_ang_em_volta(coxa_base[L], (K - H).normalized(), n), 3, n))
            k, a = p3.cabeca(rig, L + "Leg"), p3.cabeca(rig, L + "Foot")
            p3.girar_osso(rig, L + "Leg", Matrix.Rotation(_ang_em_volta((a - k).normalized(), (A - k).normalized(), n), 3, n))
            por_pe(L)

    # ── 5b) as 2 solas no mesmo plano (antes do glúteo e da plataforma, que dependem das pernas) ──────────────────────────────────
    pernas(0.0)
    nn = -np.array(N_p)

    def contatos(L):
        """Calcanhar e ponta do pé pra dentro da plataforma ((−N_p)·P mais fundo de cada um, m)."""
        return float((pele((L + "Foot",)) @ nn).max()), float((pele((L + "ToeBase",)) @ nn).max())

    # a malha dos 2 pés não é igual (o pé esquerdo descia ~3,5 mm a mais que o direito); o contato mais raso de cada pé (calcanhar
    # ou ponta) vai pro mesmo nível, subindo o tornozelo do pé mais fundo ao longo da normal da plataforma — e escorregando ele uns
    # milímetros ao longo dela (pra ponta do pé) até a distância quadril → tornozelo voltar à do começo: só subir encurtava a perna
    # e o joelho de cima dobrava ~3° a mais que o do outro lado
    rasos = {L: min(contatos(L)) for L, _ in LADOS}
    for L, _ in LADOS:
        sobe = rasos[L] - min(rasos.values())
        if sobe > 0.0002:
            w = A_t[L] + N_p * sobe - Hq[L]
            b = w.dot(P_f)
            desliza = -b + math.sqrt(b * b - (w.length_squared - dist_joelho(JOELHO0) ** 2))
            A_t[L] = A_t[L] + N_p * sobe + P_f * desliza
            print("PÉ %s | sobe %.1f mm e desliza %.1f mm na plataforma (a sola desce igual à do outro pé)" % (
                L, sobe * 1000, desliza * 1000), flush=True)
    pernas(0.0)
    rasos = {L: min(contatos(L)) for L, _ in LADOS}
    fundos = [max(contatos(L)) for L, _ in LADOS]

    # ── 6) almofada do glúteo: a pelve fica parada no encosto, mas a pele do glúteo do boneco sai pra frente quando o quadril dobra
    #    (ela é puxada pela coxa): a almofada de baixo fica saliente o bastante pro glúteo seguir encostado embaixo (o mais longe) e
    #    afundar uns milímetros em cima ───────────────────────────────────────────────────────────────────────────────────────────────
    def gluteo_longe(t):
        pernas(t)
        P = pele(("Hips",))
        Hc = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
        s_ = (P - np.array(Hc)) @ np.array(D)
        m = (np.abs(P[:, 0]) < LARG_ENCOSTO / 2 - 0.02) & (s_ > -ENCOSTO_ABAIXO + 0.02) & (s_ < GLUTEO_ATE - 0.02)
        return float((P[m] @ np.array(F)).min()) - F_e

    g_t = [gluteo_longe(k / 4) for k in range(5)]
    sai_g = max(g_t) + AFUNDA                     # embaixo (o mais longe) a pele afunda AFUNDA na almofada; em cima, mais (o estofado cede)
    print("GLÚTEO | pele do glúteo × face do encosto %s mm (t = 0, ¼, ½, ¾, 1) → almofada do glúteo saliente %.1f mm" % (
        "/".join("%.1f" % (g * 1000) for g in g_t), sai_g * 1000), flush=True)

    # ── 7) plataforma: face onde as solas encostam (inclinada CALCO° da reta ⟂ ao trilho), centrada nos pés ─────────────────────────
    pernas(0.0)
    prof_face = min(rasos.values()) - AFUNDA_PE    # (−N_p)·P da face: o contato mais raso de cada pé afunda AFUNDA_PE
    eS = pele(("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase")) @ np.array(P_f)
    e_meio = float((eS.min() + eS.max()) / 2)
    ref = Vector((0.0, 0.0, 0.0))
    c_pl = ref + P_f * (e_meio - ref.dot(P_f)) - N_p * (prof_face - (-N_p).dot(ref))
    c_pl = c_pl - X * c_pl.x
    print("PLATAFORMA | solas E %.1f / D %.1f mm | pés de %.3f a %.3f ao longo dela | centro (%.4f %.4f %.4f) | borda de baixo z %.3f" % (
        (fundos[0] - prof_face) * 1000, (fundos[1] - prof_face) * 1000, eS.min() - e_meio, eS.max() - e_meio, *c_pl,
        (c_pl - P_f * PLATAFORMA[1] / 2 - N_p * PLATAFORMA[2]).z), flush=True)

    # ── 8) a máquina em volta do corpo (montada em cima, t = 0: o carrinho desce o curso até t = 1) ───────────────────────────────
    g_e, u_e = alvos[1]
    hk = e3.hack("hack", angulo=TRILHO, encosto=(b_e, ENCOSTO_ABAIXO + ENCOSTO_ATE, LARG_ENCOSTO, ESP_ENCOSTO),
                 gluteo=(ENCOSTO_ABAIXO + GLUTEO_ATE, sai_g),
                 cabeceira=(ENCOSTO_ABAIXO + CAB_DE, CAB_ATE - CAB_DE, LARG_CAB, sai_cab),
                 ombreiras=(c_omb, n_omb, (OMB_COMP, OMB_LARG, OMB_ESP)), pegadores=(g_e, u_e, COMP_PEGADOR, RAIO),
                 plataforma=(c_pl, N_p, *PLATAFORMA), trilhos=(TRILHOS_X, ESP_ENCOSTO + 0.036 + 0.05 + TRILHO_RAIO + 0.022, TRILHO_RAIO),
                 curso=(-U1, 0.0), luva=LUVA, pinos=PINOS)
    tornozelo0 = {L: p3.cabeca(rig, L + "Foot") for L, _ in LADOS}
    M0_enc = hk.raizes["encosto"].matrix_world.inverted()
    for t_ in (0.0, 1.0):                         # conferência das zonas de apoio na montagem (as da checagem)
        pernas(t_)
        hk.mover(-p3.lerp(0.0, U1, t_))
        co_, _, (nomes_, dono_) = _malha(bon)
        txt = []
        for nome_z, partes_z, raiz_z in (("glúteo", ("Hips",), "encosto"), ("costas", ("Spine1", "Spine2"), "encosto"),
                                         ("cabeça", ("Head",), "encosto"), ("ombro E", ("LeftShoulder", "LeftArm"), "ombreiras"),
                                         ("calcanhar E", ("LeftFoot",), "plataforma"), ("planta E", ("LeftToeBase",), "plataforma"),
                                         ("canela E", ("LeftLeg",), "plataforma")):
            V = co_[_grupo(nomes_, dono_, partes_z)]
            txt.append("%s %.1f" % (nome_z, ck._zona_no_apoio(V, [hk.raizes[raiz_z]], "hack_" + raiz_z) * 1000))
        print("ZONAS t=%.0f | %s mm" % (t_, " | ".join(txt)), flush=True)

    def pose(t):
        """t=0 em cima (pernas quase esticadas), t=1 embaixo (joelho a ~100°, coxa paralela à plataforma)."""
        pernas(t)
        hk.mover(-p3.lerp(0.0, U1, t))            # o carrinho desce o mesmo que o quadril, no trilho

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        escorrega = max((p3.cabeca(rig, L + "Foot") - tornozelo0[L]).length for L, _ in LADOS) * 1000
        Mi = hk.raizes["encosto"].matrix_world.inverted()
        hp = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
        desliza = ((Mi @ hp) - (M0_enc @ ((Hq["Left"] + Hq["Right"]) / 2))).length * 1000
        coxa = [math.degrees(math.asin((jj[L + "Leg"] - jj[L + "UpLeg"]).dot(np.array(N_p)) /
                                       np.linalg.norm(jj[L + "Leg"] - jj[L + "UpLeg"]))) for L, _ in LADOS]
        return ("joelho %.1f/%.1f° | quadril %.0f/%.0f° | tornozelo %s° | coxa × plataforma %.1f/%.1f° | carrinho %.3f m | "
                "tornozelo × chão parado %.1f mm | quadril × encosto %.1f mm | tronco %.1f° | coluna %.1f° | cabeça %.0f° | valgo %s mm | "
                "base %.2f | cotovelo %.0f/%.0f° | %s" % (
                    juntas["joelhoE"], juntas["joelhoD"], juntas["quadrilE"], juntas["quadrilD"],
                    "/".join("%.0f" % v for v in tc.tornozelo(jj)), *coxa, hk.deslocamento, escorrega, desliza,
                    ck.angulo_chave(rig, {"medida": "tronco"})[0], tc.coluna(jj)[0], tc.cabeca_tronco(jj)[0],
                    "/".join("%.0f" % v for v in tc.joelho_valgo(jj)), tc.pes_base_lateral(jj)[0],
                    juntas["cotoveloE"], juntas["cotoveloD"], maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)
    for L, _ in LADOS:                            # meio do pé parado na plataforma: o alvo REAL do close do pé no foto.py
        print("PÉ MEIO %s | (%.4f %.4f %.4f)" % (L, *((p3.cabeca(rig, L + "Foot") + p3.cabeca(rig, L + "ToeBase")) / 2)), flush=True)

    pegs = [(L, ck.Barra(hk.pegadores[s], RAIO, COMP_PEGADOR / 2, eixo=(0, 0, 1))) for L, s in LADOS]
    yq = float(H0.y)
    return Cena(pose, hk.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.25, 0.75),
                camera_video=((3.6, yq - 1.2, 1.5), (0, yq - 0.25, 0.72), 50), info=info, apoios=hk.apoios,
                afunda_apoio_mm=20)
