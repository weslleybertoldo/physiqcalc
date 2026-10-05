# Abdominal Supra (crunch) — cena da fábrica 3D (lote 2, 05/10/2026).
# t = 0 deitado de costas no colchonete, joelhos dobrados (~100°) e pés chapados na largura do quadril, mãos atrás da
# cabeça com a cabeça apoiada nelas e os cotovelos abertos pra trás, no colchonete · t = 1 tronco enrolado a ~30° do
# chão (da pelve à base do pescoço; Moura 2011: "flexão controlada do tronco até aproximadamente 30°"), escápulas fora
# do chão (Hildenbrand 2004) e a lombar encostada (ACE: "feet, tailbone and lower back should remain in contact with
# the mat"). Joelho: Hildenbrand 2004 e Moura 2011 usam 90°; o ACE põe o calcanhar a 30–46 cm do cóccix (~105–125°
# neste boneco) — a cena fica no meio. Mãos atrás da cabeça (ACE: "Place your hands behind your head... pulling your
# elbows back... This elbow position should be maintained"; ExRx: "Place hands behind neck or head"), sem entrelaçar:
# palmas pra cima embaixo da nuca, dedos juntos em V pro alto da cabeça encostando no cabelo. Quem sobe é a coluna
# torácica (Spine1/Spine2); a cabeça acompanha a coluna com só 12° de queixo pra dentro (ACE: "allow it to move into
# slight flexion"; ExRx: "space between their chin and sternum") e as mãos seguem a cabeça sem puxá-la. A pelve faz
# retroversão enquanto o tronco sobe e a lombar encosta (o ACE condena o contrário: subir puxando com os flexores do
# quadril "tilts the pelvis anteriorly").
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import deitado3d as dt
from cena import Cena

TOPO = 0.012          # colchonete de 12 mm no chão (igual à elevação de pernas); os pés ficam em cima dele
AFUNDA = 0.004        # pele das costas dentro do colchonete
JOELHO = 100          # flexão do joelho (graus): entre os 90° dos estudos e os ~105–125° do calcanhar do ACE
PE_X = 0.12           # tornozelo a 12 cm do meio: pés na largura do quadril (1,13 × a distância entre os quadris)
AFUNDA_PE = 0.001
PELVE = 3             # anteversão da pelve em relação à lombar embaixo (graus): com o quadril dobrado a pele do
                      # glúteo sobe ~1 cm junto com a coxa; 3° fazem o glúteo encostar com as costas afundando só 4 mm
                      # (descendo o corpo inteiro, as costas afundavam 12 mm no colchonete)
CURL = (("Spine", 2), ("Spine1", 32), ("Spine2", 34))   # flexão de cada vértebra em cima (graus): o tronco fica a
                      # 30° do chão e a pele de baixo das escápulas 19 mm acima do colchonete. Com 6/22/24 o tronco
                      # parava em 21° (a retroversão abaixa o tronco); com mais na lombar (Spine) ela saía do chão
PSI = 40              # dedos em V: do "pro meio" girando pro alto da cabeça (graus) — as pontas chegam no meio da nuca
                      # sem uma mão passar por cima da outra; o punho dobra só ~24°
TAU = 15              # palma virada um pouco pro meio, pra cabeça (graus)
NOS = (0.074, 0.70)   # base do dedo médio (m): x pro lado, y embaixo da parte mais baixa da nuca (occipital)
AFUNDA_MAO = 0.0015   # dorso da mão encostando no colchonete
COTOVELO_Z = 0.030    # altura do centro do cotovelo (chute; acertado pela pele até encostar no colchonete)
AFUNDA_COTOVELO = 0.002
FOLGA_CABELO = 0.001  # o cabelo da nuca encosta nas palmas: o pescoço estende até sobrar 1 mm
ABRACO = (35, 25)     # dobra máxima das 2 últimas falanges de cada dedo (graus): cada dedo dobra até encostar no
                      # cabelo, sem entrar nele mais que 0,5 mm
RETRO = 6             # retroversão da pelve em cima (graus, em volta do sacro no colchonete): a lombar, que embaixo
                      # tem a curva natural (~1,3 cm de vão no meio), encosta no colchonete. Com 8–12° o tronco subia
                      # menos e a lombar afundava 8–23 mm
PESCOCO_CIMA = 12     # flexão do pescoço em cima (graus, além do começo): queixo um pouco pro peito, sem encostar
                      # (queixo × fúrcula do esterno: 71 mm embaixo, 63 mm em cima)
AFUNDA_GLUTEO = 0.002


def montar(bon):
    rig = bon.rig
    PB = rig.pose.bones
    colchonete = e3.caixa("colchonete", (0, 0.0, TOPO / 2), (0.62, 1.90, TOPO), e3.mat_estofado(), chanfro=0.004)
    tornozelo_z = p3.ponta(rig, "LeftLeg").z
    coxa = (p3.cabeca(rig, "LeftLeg") - p3.cabeca(rig, "LeftUpLeg")).length
    canela = (p3.cabeca(rig, "LeftFoot") - p3.cabeca(rig, "LeftLeg")).length
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length

    def pele(partes):
        return dt.malha(bon, partes)

    # ── deitado de costas ─────────────────────────────────────────────────────────────────────────────────────
    pivo = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    p3.girar_osso(rig, "Hips", p3.rot_x(-90), pivo=pivo)
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, TOPO - AFUNDA - pele(dt.TRONCO)[:, 2].min())))

    # ── pernas: joelho dobrado, pé chapado no colchonete ─────────────────────────────────────────────────────────
    d = math.sqrt(coxa ** 2 + canela ** 2 + 2 * coxa * canela * math.cos(math.radians(JOELHO)))
    alvos, polos, iks = {}, {}, {}
    for lado, s in dt.LADOS:
        alvos[lado] = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))
        polos[lado] = p3.vazio("polo_joelho_" + lado, p3.cabeca(rig, lado + "Leg") + Vector((0, 0, 0.6)))
        iks[lado] = p3.ik(rig, lado + "Leg", alvos[lado], polos[lado])
        p3.travar_rotacao(rig, lado + "Foot")

    def pernas(acertar=False):
        for lado, s in dt.LADOS:
            q = p3.cabeca(rig, lado + "UpLeg")
            tz = TOPO + tornozelo_z - AFUNDA_PE
            dx, dz = s * PE_X - q.x, tz - q.z
            dy = math.sqrt(max(d * d - dx * dx - dz * dz, 1e-6))
            a = Vector((s * PE_X, q.y - dy, tz))
            alvos[lado].location = a
            dd = a - q
            cima = Vector((0, -dd.z, dd.y)).normalized()
            if cima.z < 0:
                cima.negate()
            polos[lado].location = (q + a) / 2 + cima * 0.6 + Vector((s * 0.04, 0, 0))
        p3.atualizar()
        if acertar:
            for lado, _ in dt.LADOS:
                p3.acertar_polo(rig, iks[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")

    pernas(acertar=True)
    # com o quadril dobrado o glúteo sobe ~1 cm (a pele de trás da pelve gira com a coxa): a pelve inclina PELVE° pra
    # frente em relação à lombar (a lombar volta o mesmo tanto) e o corpo desce até as costas afundarem AFUNDA
    q = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    p3.girar_osso(rig, "Hips", p3.rot_x(PELVE), pivo=q)
    p3.girar_osso(rig, "Spine", p3.rot_x(-PELVE))
    for _ in range(3):
        pernas()
        z = pele(("Spine1", "Spine2"))[:, 2].min()
        p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, TOPO - AFUNDA - z)))
    pernas(acertar=True)
    print("DEITADO | glúteo %+.1f mm | lombar %+.1f mm | costas %+.1f mm" % (
        (pele(("Hips",))[:, 2].min() - TOPO) * 1000, (pele(("Spine",))[:, 2].min() - TOPO) * 1000,
        (pele(("Spine1", "Spine2"))[:, 2].min() - TOPO) * 1000))

    # ── mãos atrás da cabeça: palmas pra cima embaixo da nuca, dorso no colchonete, dedos pro meio e pro alto da
    # cabeça (em V), cotovelos abertos pra trás, no colchonete ────────────────────────────────────────────────────
    punhos, polos_c, iks_b = {}, {}, {}
    for lado, s in dt.LADOS:
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos_c[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((s * 0.5, 0, 0)))
        iks_b[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos_c[lado])
    MAO = {lado: tuple(n.name[len(p3.P):] for n in PB if n.name.startswith(p3.P + lado + "Hand")) for lado, _ in dt.LADOS}
    cot_z = {lado: COTOVELO_Z for lado, _ in dt.LADOS}
    angulo_polo = {}

    def esticar_dedos(lado):
        """Dedos esticados no plano da palma e o polegar deitado do lado do indicador (como a mão de apoio da remada
        unilateral, lote 2)."""
        p3.soltar_dedos(rig, lado)
        pg.juntar_dedos(rig, lado, 1.0)
        for dd in p3.DEDOS + ("Thumb",):
            for i in (1, 2, 3):
                palma = pg._base(rig, lado)[0]
                o = "%sHand%s%d" % (lado, dd, i)
                f = p3.ponta(rig, o) - p3.cabeca(rig, o)
                plano = f - palma * f.dot(palma)
                if dd == "Thumb":
                    plano = plano - palma * 0.10 * f.length
                if plano.length > 1e-6:
                    p3.girar_osso(rig, o, f.rotation_difference(plano).to_matrix())

    def dedos_no_colchonete(lado, alvo_z):
        """Cada dedo (fora o polegar) dobra ou estica só na base até o dorso encostar no colchonete."""
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        palma, eixo_nos = pg._base(rig, lado)[:2]
        for dd in p3.DEDOS:
            ossos = ["%sHand%s%d" % (lado, dd, i) for i in (1, 2, 3)]
            P = co[np.array([n in ossos for n in nomes] + [False])[dono]]
            h = p3.cabeca(rig, ossos[0])
            f = (p3.ponta(rig, ossos[0]) - h).normalized()
            sinal = 1 if eixo_nos.cross(f).dot(palma) > 0 else -1     # + = dobra pro lado da palma (pra cima)
            escolha = 0.0
            for g in np.arange(30.0, -15.01, -0.5):                     # do mais dobrado (alto) pro mais esticado
                if pg._rot(P, np.array(h), eixo_nos, g * sinal)[:, 2].min() <= alvo_z:
                    escolha = float(g)
                    break
            if escolha:
                p3.girar_osso(rig, ossos[0], p3.rot_eixo(escolha * sinal, eixo_nos))

    def polo_cotovelo(lado, s, W):
        """Polo pro cotovelo ficar na altura cot_z[lado], o mais pra fora possível (cotovelo aberto, pra trás)."""
        S = p3.cabeca(rig, lado + "Arm")
        u = (W - S).normalized()
        dist = (W - S).length
        a = (Lb ** 2 - La ** 2 + dist ** 2) / (2 * dist)
        rho = math.sqrt(max(Lb ** 2 - a ** 2, 1e-8))
        c = S + u * a
        e1 = Vector((s, 0, 0)) - u * (u.x * s)
        e1.normalize()
        e2 = u.cross(e1)
        A, B = e1.z * rho, e2.z * rho
        R = math.hypot(A, B)
        base = math.atan2(B, A)
        k = math.acos(max(-1.0, min(1.0, (cot_z[lado] - c.z) / R)))
        melhor = None
        for fi in (base + k, base - k):
            E = c + (e1 * math.cos(fi) + e2 * math.sin(fi)) * rho
            if melhor is None or E.x * s > melhor.x * s:
                melhor = E
        return c + (melhor - c).normalized() * (rho + 0.4)

    def mao(lado, s, nos_alvo, dedos_q, palma_q, voltas=6):
        dedos_q = Vector(dedos_q).normalized()
        palma_q = Vector(palma_q)
        palma_q = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
        alvo = nos_alvo - dedos_q * 0.10
        nomes = (lado + "Arm", lado + "ForeArm")
        erro = Vector()
        for _ in range(voltas):
            iks_b[lado].mute = False
            punhos[lado].location = alvo
            polos_c[lado].location = polo_cotovelo(lado, s, alvo)
            p3.atualizar()
            if lado not in angulo_polo:
                angulo_polo[lado] = p3.acertar_polo(rig, iks_b[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
            mats = [PB[p3.P + n].matrix.copy() for n in nomes]
            iks_b[lado].mute = True
            for n, M in zip(nomes, mats):
                PB[p3.P + n].matrix = M
                p3.atualizar()
            f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
            ax = (f1 - f0).normalized()
            quer = palma_q - ax * palma_q.dot(ax)
            tem = pg._base(rig, lado)[0]
            tem = tem - ax * tem.dot(ax)
            if quer.length > 1e-6 and tem.length > 1e-6:
                quer.normalize()
                tem.normalize()
                p3.girar_osso(rig, lado + "ForeArm",
                              Matrix.Rotation(math.atan2(tem.cross(quer).dot(ax), tem.dot(quer)), 3, ax))
            h0 = p3.cabeca(rig, lado + "Hand")
            y_m = (p3.ponta(rig, lado + "Hand") - h0).normalized()
            n_m = pg._base(rig, lado)[0]
            n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
            F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
            F_quer = Matrix((dedos_q, palma_q, dedos_q.cross(palma_q))).transposed()
            p3.girar_osso(rig, lado + "Hand", F_quer @ F_tem.transposed())
            esticar_dedos(lado)
            erro = nos_alvo - p3.cabeca(rig, lado + "HandMiddle1")
            alvo = alvo + erro
            if erro.length < 0.001:
                break
        return erro.length

    psi, tau = math.radians(PSI), math.radians(TAU)
    z_nos = {lado: 0.03 for lado, _ in dt.LADOS}
    erros = {}
    for volta in range(4):
        for lado, s in dt.LADOS:
            dedos_q = Vector((-s * math.cos(psi), math.sin(psi), 0))
            palma_q = Vector((-s * math.sin(tau), 0, math.cos(tau)))
            erros[lado] = mao(lado, s, Vector((s * NOS[0], NOS[1], z_nos[lado])), dedos_q, palma_q)
            z_nos[lado] += (TOPO - AFUNDA_MAO) - pele(MAO[lado])[:, 2].min()          # dorso no colchonete
            cot = pele((lado + "ForeArm", lado + "Arm"))
            E = np.array(p3.cabeca(rig, lado + "ForeArm"))
            perto = cot[np.linalg.norm(cot - E, axis=1) < 0.07]
            cot_z[lado] += (TOPO - AFUNDA_COTOVELO) - perto[:, 2].min()             # cotovelo no colchonete
    for lado, s in dt.LADOS:
        dedos_no_colchonete(lado, TOPO - AFUNDA_MAO)
    print("MÃOS | erro E %.1f D %.1f mm | polo E %s D %s" % (erros["Left"] * 1000, erros["Right"] * 1000,
                                                            angulo_polo["Left"], angulo_polo["Right"]))
    for lado, s in dt.LADOS:
        Hm = pele(MAO[lado])
        cot = pele((lado + "ForeArm", lado + "Arm"))
        E = np.array(p3.cabeca(rig, lado + "ForeArm"))
        print("  %s: ombro %s cotovelo %s punho %s nós %s | mão z %.3f..%.3f | cotovelo pele z %.3f" % (
            lado, tuple(round(x, 3) for x in p3.cabeca(rig, lado + "Arm")),
            tuple(round(x, 3) for x in p3.cabeca(rig, lado + "ForeArm")),
            tuple(round(x, 3) for x in p3.cabeca(rig, lado + "Hand")),
            tuple(round(x, 3) for x in p3.cabeca(rig, lado + "HandMiddle1")), Hm[:, 2].min(), Hm[:, 2].max(),
            cot[np.linalg.norm(cot - E, axis=1) < 0.07][:, 2].min()))

    # ── pescoço: a cabeça deita nas mãos (o cabelo da nuca encosta nas palmas) ──────────────────────────────────
    MAOS = MAO["Left"] + MAO["Right"]

    def folgas():
        co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        eh_mao = np.array([n in MAOS for n in nomes] + [False])[dono]
        bvh = ck._bvh(co, tri[eh_mao[tri].all(axis=1)])
        cab = np.array([n in ("Head", "Neck") for n in nomes] + [False])[dono]

        def menor(P):
            perto = 1e9
            for p in P:
                loc, nor, idx, dist = bvh.find_nearest(Vector(p))
                if loc is not None:
                    perto = min(perto, -dist if (Vector(p) - loc).dot(nor) < 0 else dist)
            return perto
        hc, _ = ck._avaliar_simples(bon.cabelo)
        return menor(co[cab]), menor(hc)

    pescoco = 0.0
    for passo in (4.0, 1.0, 0.25):
        for _ in range(40):
            cabelo_m = folgas()[1]
            sentido = -1 if cabelo_m > FOLGA_CABELO else 1        # − estende (cabeça desce), + dobra (sobe)
            if abs(pescoco) > 40:
                break
            p3.girar_osso(rig, "Neck", p3.rot_x(sentido * passo))
            pescoco += sentido * passo
            if (folgas()[1] > FOLGA_CABELO) != (cabelo_m > FOLGA_CABELO):
                break
    pele_m, cabelo_m = folgas()
    print("PESCOÇO %+.2f° (− estende) | cabelo × mãos %.1f mm | pele × mãos %.1f mm | cabeça z min %.3f" % (
        pescoco, cabelo_m * 1000, pele_m * 1000, pele(("Head",))[:, 2].min()))

    # ── dedos abraçando a cabeça: cada dedo dobra as 2 últimas falanges até a ponta encostar no cabelo (sem entrar
    # nele nem na pele, sem passar do colchonete) ────────────────────────────────────────────────────────────────
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    cab = np.array([n in ("Head", "Neck") for n in nomes] + [False])[dono]
    bvh_pele = ck._bvh(co, tri[cab[tri].all(axis=1)])
    hc, ht = ck._avaliar_simples(bon.cabelo)
    bvh_cab = ck._bvh(hc, ht)

    def distancia(P):
        """Menor distância (m) dos pontos até o cabelo/pele: − = entrou (no cabelo ou na pele)."""
        menor = 1e9
        for p in P:
            v = Vector(p)
            for bvh in (bvh_pele, bvh_cab):
                loc, nor, idx, dist = bvh.find_nearest(v)
                if loc is not None:
                    menor = min(menor, -dist if (dist < 0.03 and (v - loc).dot(nor) < 0) else dist)
        return menor

    dobras = {}
    for lado, s in dt.LADOS:
        palma, eixo_nos = pg._base(rig, lado)[:2]
        for dd in p3.DEDOS:
            ossos = ["%sHand%s%d" % (lado, dd, i) for i in (1, 2, 3)]
            P = {o: co[np.array([n == o for n in nomes] + [False])[dono]] for o in ossos}
            cabs = {o: np.array(p3.cabeca(rig, o)) for o in ossos}
            f = (p3.ponta(rig, ossos[0]) - p3.cabeca(rig, ossos[0])).normalized()
            sinal = 1 if eixo_nos.cross(f).dot(palma) > 0 else -1
            escolha = 0.0
            for lam in np.arange(0.0, 1.001, 0.05):
                angs = [0.0, ABRACO[0] * lam * sinal, ABRACO[1] * lam * sinal]
                pp = pg._cadeia_pts(P, cabs, None, ossos, [eixo_nos] * 3, angs)
                Q = np.concatenate([pp[o] for o in ossos[1:]])
                if distancia(Q[::2]) < -0.0005 or Q[:, 2].min() < TOPO - 0.002:
                    break
                escolha = lam
            for k, o in enumerate(ossos[1:]):
                if escolha:
                    p3.girar_osso(rig, o, p3.rot_eixo(ABRACO[k] * escolha * sinal, eixo_nos))
            dobras[lado[0] + dd[0]] = escolha
    print("DEDOS abraçando a cabeça (fração da dobra):", " ".join("%s %.2f" % kv for kv in dobras.items()))

    OSSOS_T = ("Hips", "Spine", "Spine1", "Spine2", "Neck")
    base = {n: PB[p3.P + n].matrix_basis.copy() for n in OSSOS_T}
    gl = pele(("Hips",))
    sacro = Vector(gl[np.argmin(gl[:, 2])])                     # onde o sacro/glúteo encosta no colchonete
    sacro.x = 0.0
    cabeca0 = p3.mundo_osso(rig, "Head")
    mao_rel = {lado: cabeca0.inverted() @ p3.mundo_osso(rig, lado + "Hand") for lado, _ in dt.LADOS}
    tronco0 = p3.mundo_osso(rig, "Spine2")
    polo_rel = {lado: tronco0.inverted() @ polos_c[lado].location.copy() for lado, _ in dt.LADOS}
    palma_rel = {lado: cabeca0.to_3x3().inverted() @ pg._base(rig, lado)[0] for lado, _ in dt.LADOS}
    # queixo (ponta de baixo do rosto) e fúrcula do esterno (alto do peito, no meio): pra medir o "queixo longe do peito"
    i_cab = np.where(np.array([n == "Head" for n in nomes] + [False])[dono])[0]
    rosto = i_cab[co[i_cab][:, 2] > co[i_cab][:, 2].mean() + 0.03]
    i_queixo = rosto[np.argmin(co[rosto][:, 1])]
    i_peito = np.where(np.array([n == "Spine2" for n in nomes] + [False])[dono])[0]
    meio_peito = i_peito[(np.abs(co[i_peito][:, 0]) < 0.015) & (co[i_peito][:, 2] > 0.15)]
    i_furcula = meio_peito[np.argmax(co[meio_peito][:, 1])]

    def bracos():
        """Mãos presas na cabeça (o punho e a mão seguem a cabeça; o cotovelo segue o tronco)."""
        cab = p3.mundo_osso(rig, "Head")
        tr = p3.mundo_osso(rig, "Spine2")
        for lado, s in dt.LADOS:
            Hq = cab @ mao_rel[lado]
            iks_b[lado].mute = False
            punhos[lado].location = Hq.to_translation()
            polos_c[lado].location = tr @ polo_rel[lado]
            p3.atualizar()
            nomes = (lado + "Arm", lado + "ForeArm")
            mats = [PB[p3.P + n].matrix.copy() for n in nomes]
            iks_b[lado].mute = True
            for n, M in zip(nomes, mats):
                PB[p3.P + n].matrix = M
                p3.atualizar()
            f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
            ax = (f1 - f0).normalized()
            quer = cab.to_3x3() @ palma_rel[lado]
            quer = quer - ax * quer.dot(ax)
            tem = pg._base(rig, lado)[0]
            tem = tem - ax * tem.dot(ax)
            if quer.length > 1e-6 and tem.length > 1e-6:
                quer.normalize()
                tem.normalize()
                p3.girar_osso(rig, lado + "ForeArm",
                              Matrix.Rotation(math.atan2(tem.cross(quer).dot(ax), tem.dot(quer)), 3, ax))
            agora = p3.mundo_osso(rig, lado + "Hand").to_3x3()
            p3.girar_osso(rig, lado + "Hand", Hq.to_3x3() @ agora.inverted())

    def pose(t):
        for n in OSSOS_T:
            PB[p3.P + n].matrix_basis = base[n].copy()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(-RETRO * t), pivo=sacro)    # retroversão: a crista ilíaca desce
        for n, g in CURL:
            p3.girar_osso(rig, n, p3.rot_x(g * t))
        p3.girar_osso(rig, "Neck", p3.rot_x(PESCOCO_CIMA * t))
        for _ in range(2):                                              # sacro encostando no colchonete
            z = pele(("Hips",))[:, 2].min()
            p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, TOPO - AFUNDA_GLUTEO - z)))
        bracos()

    def info():
        j = ck.posicoes(rig)
        tronco = math.degrees(math.atan2(j["Neck"][2] - j["Hips"][2], j["Neck"][1] - j["Hips"][1]))
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        costas = {}
        for k in ("Hips", "Spine", "Spine1", "Spine2"):
            m = np.array([n == k for n in nomes] + [False])[dono]
            costas[k] = (co[m][:, 2].min() - TOPO) * 1000
        meio = np.abs(co[:, 0]) < 0.04
        ys = (p3.cabeca(rig, "Spine").y - 0.03, j["Spine1"][1] + 0.03)
        lomb = co[meio & (co[:, 1] > ys[0]) & (co[:, 1] < ys[1])]
        # onde as costas saem do chão: maior y (pra cabeça, antes do pescoço) com a pele do meio a menos de 5 mm do
        # colchonete
        enc = co[meio & (co[:, 2] < TOPO + 0.005) & (co[:, 1] > j["Hips"][1]) & (co[:, 1] < j["Neck"][1])]
        sai = float(enc[:, 1].max()) if len(enc) else float("nan")
        return ("tronco %.0f° do chão | pele acima do colchonete (mm): %s lombar-meio %.0f | costas no chão até y %.3f"
                " | queixo × fúrcula %.0f mm" % (
                    tronco, " ".join("%s %.0f" % kv for kv in costas.items()), (lomb[:, 2].min() - TOPO) * 1000, sai,
                    np.linalg.norm(co[i_queixo] - co[i_furcula]) * 1000))

    return Cena(pose, [], pegadas=[], apoio_mm=0.0, foco_luz=(0, 0.0, 0.3),
                camera_video=((3.6, -1.2, 1.1), (0, 0.0, 0.3), 50), info=info, apoios=[colchonete],
                afunda_apoio_mm=20)
