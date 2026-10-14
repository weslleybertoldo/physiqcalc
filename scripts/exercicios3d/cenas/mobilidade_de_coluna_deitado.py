# Mobilidade de Coluna Deitado — cena da fábrica 3D (lote 15, 13/10/2026; exercício novo do catálogo, categoria "Alongamento e
# mobilidade", grupo "Mobilidade"). Peso corporal, deitado de costas no colchonete de 12 mm dos prontos de costas (uma caixa da própria
# cena, de apoio; nenhuma peça do lib/): os 2 joelhos, dobrados e juntos, tombam devagar pra um lado com a pelve girando junto e os
# ombros parados no chão, voltam ao meio e tombam pro outro lado (knee rolls / lower back rotational stretch / lower trunk rotation).
# CÍCLICO ("ciclo": true na ficha, t = 1 igual a t = 0; o app repete o ciclo de 11 s):
#   t = 0 (a FOTO parada do app): os joelhos tombados ~45° pra DIREITA, no meio da parada · volta ao meio (1,5 s) · para 0,5 s com os
#   joelhos pro teto · tomba pra ESQUERDA (1,5 s) · para 2 s (t = 0,5 no meio da parada) · volta ao meio · para 0,5 s · tomba pra direita
#   e para (emenda com o começo). Cada ida e cada volta começa e acaba parada (seno).
# Técnica (só o que foi lido; as frases completas e as fontes estão na ficha e em lote4/mobilidade_de_coluna_deitado/fontes.md):
#  · ExRx, Lying Bent Leg Oblique Stretch: "Lie supine on floor or mat. Bend knees and place feet flat on floor." · "Bring both knees and
#    hip to one side. Hold stretch. Repeat with opposite side." · "Keep both shoulders on floor or mat. Allow foot of top leg to rest on
#    foot of lower leg. Arms can be extended to sides." (Target "Obliques", Other "Erector Spinae")
#  · Mayo Clinic, Lower back rotational stretch: "Keep your shoulders firmly on the floor, and slowly roll your bent knees to one side
#    (B). Hold for 5 to 10 seconds. Slowly go back to the starting position (C). Repeat on the other side (D)." — o desenho marca 45°.
#  · NHS inform, Knee rolls: "Begin lying down with your knees pointing towards the ceiling. Slowly roll your knees to the right." ·
#    "Hold for a few seconds and then raise the knees so that they are pointing towards the ceiling again."
#  · Arthritis Research UK, Knee rolls: "let your knees roll to one side, keeping your knees and feet together" — nos desenhos, os braços
#    abertos ~45° do corpo, retos, com as palmas pra baixo, e a cabeça apoiada olhando pro teto (observação).
# Decisões (pelas fontes; as dúvidas vão no relatório): passa pelo meio parando (Mayo, NHS inform); 45° de cada lado (Mayo); parada curta
# de mobilidade (2 s; a segurada da Mayo vai na prescrição); braços abertos ~45° com as palmas pra baixo (Arthritis Research UK; ExRx);
# os 2 pés no colchonete rolando de lado (Mayo, Arthritis Research UK), não o pé de cima deitado no de baixo do ExRx; cabeça parada.
# Como o rig faz: deitado como a Ponte de Glúteo (a pelve e as costas no colchonete pelo giro do bloco em volta de ~T3), tornozelos a
# ±5 cm com o joelho a 100° e os joelhos fechados até as pernas encostarem por dentro (no boneco musculoso as coxas encostam com os
# centros dos joelhos a ~21 cm), braços por IK (o cotovelo desce até a pele de trás encostar, a palma deita e cada dedo dobra na base até
# encostar), o cabelo da nuca no colchonete. O TÓRAX (osso Spine2) fica PARADO o ciclo todo — os ombros, as escápulas, os braços, as mãos
# e a cabeça são filhos dele e não mexem. Quem gira é a PELVE (metade do tombo dos joelhos: ExRx, "Bring both knees and hip to one
# side"), rolando pela metade no glúteo do lado dos joelhos (o meio-termo entre rolar sem escorregar — a pelve andaria ~4,7 cm pro
# lado — e girar no lugar), e a cintura reparte o giro: 40% entre a pelve e a lombar, 50% na lombar (Spine) e 10% no fim do tórax
# (Spine1), cada vértebra em volta do próprio eixo, sem rolar de lado; a base da lombar fica à mesma distância do Spine2 que no meio. As
# pernas vão por IK até os tornozelos: cada pé rola na borda da sola que fica no colchonete (o de baixo na de fora, o de cima na de
# dentro) e o joelho de baixo dá o tombo do par, com o de cima deitado nele (as pernas encostando, sem entrar). Tudo isso é uma TABELA por
# tombo, calculada na montagem; por quadro só se interpola (sem medir a malha).
# DIFERENTE dos prontos de costas: na Ponte de Glúteo (o mesmo começo deitado) o quadril SOBE em linha reta, com os braços ao lado do
# corpo; no Abdominal Oblíquo com Pés no Banco o TÓRAX sobe enrolando e gira, com a pelve parada; no Russo (sentado) e no Bicicleta
# (deitado, pedalando) quem gira é o tórax. Aqui o tórax fica parado no chão e quem gira é a pelve, levando as pernas.
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import deitado3d as dt
import tecnica3d as tc
from cena import Cena

TOPO = 0.012            # colchonete de 12 mm (o da Ponte de Glúteo, do Abdominal Supra e do Alongamento de Extensão da Coluna)
AFUNDA = 0.004          # pele das costas dentro do colchonete (supra, ponte)
AFUNDA_GLUTEO = 0.002   # o glúteo encosta no colchonete
AFUNDA_CABELO = 0.002   # o cabelo da nuca encosta no colchonete
AFUNDA_PE = 0.001       # sola (ou a borda dela) encostando no colchonete
AFUNDA_MAO = 0.001      # palma e dedos encostando no colchonete
AFUNDA_BRACO = 0.002    # a pele de trás do braço e do antebraço encostando
PE_X = 0.050            # tornozelos a ±5 cm do meio: pés juntos
JOELHO = 100.0          # flexão do joelho no meio (graus)
FOLGA_PERNAS = 0.0008   # vão entre as 2 pernas (joelho × joelho, coxa × coxa) no meio: joelhos juntos, encostando
T3 = 0.6                # ponto de apoio das costas pra achar a pelve no chão: fração do Spine2 até a base do pescoço (a Ponte)
BRACO_ABRE = 45.0       # braço aberto do corpo, visto de cima (graus; 0 = colado do lado do corpo, 90 = em T)
DEDOS_DESCE = 6.0       # dedos um pouco pra baixo (graus): a base da palma e os dedos encostam
TOMBA = 45.0            # quanto os joelhos tombam de cada lado (graus da vertical)
PELVE_FRAC = 0.5        # giro da pelve ÷ tombo dos joelhos
GIRO_PARTE = (0.60, 0.10)   # giro de cada osso da coluna ÷ giro da pelve: Spine (lombar), Spine1 (~T8–L1); o Spine2 fica parado
PE_ROLA = (0.65, 0.70)  # quanto cada pé rola na borda ÷ tombo dos joelhos: (pé de baixo, pé de cima)
ROLA_PELVE = 0.5        # 1 = a pelve rola sem escorregar (gira em volta da pele no colchonete); 0 = gira em volta do eixo da lombar
ROLA_S = 1.5            # s tombando (ou voltando)
LADO_S = 2.0            # s parado em cada lado
MEIO_S = 0.5            # s parado no meio
CICLO_S = 2 * LADO_S + 4 * ROLA_S + 2 * MEIO_S
TABELA_N = 12           # passos da tabela de 0 até ±TOMBA (3,75° de tombo, ~1,9° de pelve)
OSSOS_T = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "LeftShoulder", "RightShoulder")
COLUNA = ("Hips", "Spine", "Spine1", "Spine2")
PERNA = {L: (L + "UpLeg", L + "Leg") for L in ("Left", "Right")}
PE = {L: (L + "Foot", L + "ToeBase") for L in ("Left", "Right")}


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _mao(lado):
    return (lado + "Hand",) + tuple("%sHand%s%d" % (lado, d, i) for d in p3.DEDOS + ("Thumb",) for i in (1, 2, 3))


def tomba(t):
    """Tombo dos joelhos no quadro t (graus, + = pra ESQUERDA do corpo, − = pra direita): t = 0 no meio da parada do lado direito,
    volta ao meio, para, tomba pra esquerda (t = 0,5 no meio da parada), volta ao meio, para e tomba pra direita (t = 1 = t = 0)."""
    fases = ((LADO_S / 2, -1, -1), (ROLA_S, -1, 0), (MEIO_S, 0, 0), (ROLA_S, 0, 1), (LADO_S, 1, 1), (ROLA_S, 1, 0),
             (MEIO_S, 0, 0), (ROLA_S, 0, -1), (LADO_S / 2, -1, -1))
    s = (t % 1.0) * CICLO_S if t < 1.0 else CICLO_S
    acc = 0.0
    for dur, a, b in fases:
        if s <= acc + dur + 1e-9:
            u = (s - acc) / dur
            return TOMBA * (a + (b - a) * p3.suave(min(max(u, 0.0), 1.0)))
        acc += dur
    return -TOMBA


def montar(bon):
    pg.usar_polegar("volta")         # padrão dos exercícios novos; aqui a mão não segura nada (fica espalmada no colchonete)
    rig = bon.rig
    PB = rig.pose.bones
    c_ = lambda n: p3.cabeca(rig, n)
    tornozelo_z = p3.ponta(rig, "LeftLeg").z
    L1 = (c_("LeftLeg") - c_("LeftUpLeg")).length
    L2 = (c_("LeftFoot") - c_("LeftLeg")).length
    Lb = (c_("LeftForeArm") - c_("LeftArm")).length
    La = (c_("LeftHand") - c_("LeftForeArm")).length

    def malha():
        return ck._avaliar(bon.corpo, 1)

    def pele(partes):
        return dt.malha(bon, partes)

    def zmin(partes):
        return float(pele(partes)[:, 2].min())

    def cabelo_z():
        return float(ck._avaliar_simples(bon.cabelo)[0][:, 2].min())

    def arvore(co, tri, m):
        t = tri[m[tri].all(axis=1)]
        return BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in t], all_triangles=True)

    def entra(co, ma, bvh_b, alcance=0.05):
        """Menor distância (mm, − = dentro) dos vértices `ma` até a superfície da árvore B (o jeito do checagem3d.contatos)."""
        pior = 1e9
        for p in co[ma]:
            v = Vector(p)
            loc, nor, idx, dist = bvh_b.find_nearest(v, alcance)
            if loc is not None:
                pior = min(pior, -dist if (dist < 0.03 and (v - loc).dot(nor) < 0) else dist)
        return pior * 1000

    def pernas_medidas(co, tri, nd):
        """Pernas uma × a outra: o vão (mm, a menor distância sem sinal, fora da virilha) e quanto uma entra na outra (mm, o jeito do
        checagem3d.corpo_x_corpo: só onde os triângulos se cruzam de verdade)."""
        nomes, dono = nd
        ma = _grupo(nomes, dono, PERNA["Left"] + PE["Left"])
        mb = _grupo(nomes, dono, PERNA["Right"] + PE["Right"])
        fora = np.linalg.norm(co - np.array((c_("LeftUpLeg") + c_("RightUpLeg")) / 2), axis=1) > 0.20
        bvh_b = arvore(co, tri, mb)
        vao, ponto = 1e9, None
        for p in co[ma & fora]:
            loc, nor, idx, dist = bvh_b.find_nearest(Vector(p), 0.08)
            if loc is not None and dist < vao:
                vao, ponto = dist, p
        med, _ = ck.corpo_x_corpo(co, tri, nomes, dono)
        return dict(vao=vao * 1000, ponto=tuple(round(x, 3) for x in ponto) if ponto is not None else None,
                    coxas=med.get("coxaE×coxaD", 0.0), pernas=med.get("pernaE×pernaD", 0.0))

    def distancia(partes_a, partes_b, co=None, tri=None, nd=None, longe_de=None, raio=0.0):
        """Menor distância (mm, − = uma entrando na outra) entre a pele de 2 grupos de partes. `longe_de`/`raio`: só os vértices a mais
        de `raio` m desse ponto entram na conta (a virilha, onde as 2 coxas se emendam na malha, daria um "entra" falso)."""
        if co is None:
            co, tri, nd = malha()
        nomes, dono = nd
        ma, mb = _grupo(nomes, dono, partes_a), _grupo(nomes, dono, partes_b)
        qa, qb = ma, mb
        if longe_de is not None:
            fora = np.linalg.norm(co - np.array(longe_de), axis=1) > raio
            qa, qb = ma & fora, mb & fora
        return min(entra(co, qa, arvore(co, tri, mb)), entra(co, qb, arvore(co, tri, ma)))

    # ── deitado de costas (o jeito da Ponte e do Supra) ─────────────────────────────────────────────────────────────────────
    pivo = (c_("LeftUpLeg") + c_("RightUpLeg")) / 2
    p3.girar_osso(rig, "Hips", p3.rot_x(-90), pivo=pivo)
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, TOPO - AFUNDA - pele(dt.TRONCO)[:, 2].min())))

    # ── pernas: IK até os tornozelos; o joelho vai no círculo em volta da reta quadril → tornozelo (ângulo γ: 0 = pra cima,
    # + = pra esquerda do corpo, +X) ────────────────────────────────────────────────────────────────────────────────────────
    tz = TOPO + tornozelo_z - AFUNDA_PE
    pe_y = [float(pivo.y) - 0.47]
    alvos, polos, iks, rot_pe = {}, {}, {}, {}
    for lado, s in dt.LADOS:
        q = c_(lado + "UpLeg")
        alvos[lado] = p3.vazio("tornozelo_" + lado, Vector((s * PE_X, pe_y[0], tz)))
        polos[lado] = p3.vazio("polo_joelho_" + lado, q + Vector((s * 0.04, -0.25, 0.6)))
        iks[lado] = p3.ik(rig, lado + "Leg", alvos[lado], polos[lado])
        rot_pe[lado] = p3.travar_rotacao(rig, lado + "Foot")
    p3.atualizar()

    def circulo(H, A):
        d = (A - H).length
        u = (A - H) / d
        a = (L1 ** 2 - L2 ** 2 + d ** 2) / (2 * d)
        r = math.sqrt(max(L1 ** 2 - a ** 2, 1e-10))
        c = H + u * a
        e1 = Vector((0, 0, 1)) - u * u.z
        e1.normalize()
        e2 = e1.cross(u)                         # pra +X (esquerda do corpo) com a perna apontando pra −Y
        return c, r, e1, e2

    def joelho_em(lado, g):
        c, r, e1, e2 = circulo(c_(lado + "UpLeg"), alvos[lado].location.copy())
        g = math.radians(g)
        return c + (e1 * math.cos(g) + e2 * math.sin(g)) * r

    gam = {"Left": 0.0, "Right": 0.0}

    def por_joelhos(acertar=False):
        for lado, _ in dt.LADOS:
            c, r, e1, e2 = circulo(c_(lado + "UpLeg"), alvos[lado].location.copy())
            K = joelho_em(lado, gam[lado])
            polos[lado].location = c + (K - c).normalized() * (r + 0.5)
        p3.atualizar()
        if acertar:
            for lado, _ in dt.LADOS:
                p3.acertar_polo(rig, iks[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")

    por_joelhos(acertar=True)

    def joelho_flexao():
        med = ck.medir_juntas(rig)
        return (med["joelhoE"] + med["joelhoD"]) / 2

    # distância dos pés: a que deixa o joelho a JOELHO (secante em pe_y)
    hist = []
    for volta in range(8):
        for lado, s in dt.LADOS:
            alvos[lado].location = Vector((s * PE_X, pe_y[0], tz))
        por_joelhos()
        k = joelho_flexao()
        hist.append((pe_y[0], k))
        if abs(k - JOELHO) < 0.2:
            break
        if len(hist) >= 2 and abs(hist[-1][1] - hist[-2][1]) > 1e-6:
            (y0, k0), (y1, k1) = hist[-2], hist[-1]
            pe_y[0] = y1 + (JOELHO - k1) * (y1 - y0) / (k1 - k0)
        else:
            pe_y[0] += 0.02 if k < JOELHO else -0.02
    por_joelhos(acertar=True)
    print("PÉS | tornozelos y %.4f | joelho %.1f°" % (pe_y[0], joelho_flexao()))

    # ── pelve no chão: tronco e pelve como um bloco girando em volta de um ponto no colchonete (~T3) até o glúteo E as costas
    # encostarem (a Ponte) ─────────────────────────────────────────────────────────────────────────────────────────────────
    base_t = {n: PB[p3.P + n].matrix_basis.copy() for n in OSSOS_T}
    co, _, (nomes, dono) = malha()
    s2, nk = c_("Spine2"), c_("Neck")
    yt3 = float(s2.y + (nk.y - s2.y) * T3)
    m = _grupo(nomes, dono, ("Spine2", "Neck")) & (np.abs(co[:, 0]) < 0.02) & (np.abs(co[:, 1] - yt3) < 0.012)
    pt = co[m][np.argmin(co[m][:, 2])]
    P_T3 = Vector((0.0, float(pt[1]), TOPO - AFUNDA))
    CONTATO = ("Spine1", "Spine2")

    def colocar(th):
        for n in OSSOS_T:
            PB[p3.P + n].matrix_basis = base_t[n].copy()
        p3.atualizar()
        if th:
            p3.girar_osso(rig, "Hips", p3.rot_x(-th), pivo=P_T3)
        for _ in range(2):
            por_joelhos()
            z = zmin(CONTATO)
            p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, TOPO - AFUNDA - z)))
        por_joelhos()

    def dif_gluteo(th):
        colocar(th)
        return (zmin(("Hips",)) - (TOPO - AFUNDA_GLUTEO)) - (zmin(CONTATO) - (TOPO - AFUNDA))

    lo, hi = -12.0, 8.0
    for _ in range(16):
        meio = (lo + hi) / 2
        if dif_gluteo(meio) > 0:
            hi = meio
        else:
            lo = meio
    TH0 = (lo + hi) / 2
    colocar(TH0)
    print("PELVE NO CHÃO | bloco %.2f° | glúteo %+.1f mm | costas %+.1f mm | lombar %+.1f mm" % (
        TH0, (zmin(("Hips",)) - TOPO) * 1000, (zmin(CONTATO) - TOPO) * 1000, (zmin(("Spine",)) - TOPO) * 1000))

    # ── joelhos juntos no meio: os 2 joelhos vêm pro meio (γ simétrico) até as pernas quase encostarem ─────────────────────────
    def vao_pernas(co=None, tri=None, nd=None):
        """Vão entre as pernas (mm): − = uma entrando na outra (o quanto, pelo corpo_x_corpo), + = o vão entre elas."""
        if co is None:
            co, tri, nd = malha()
        m = pernas_medidas(co, tri, nd)
        pen = max(m["coxas"], m["pernas"])
        return -pen if pen > 0 else m["vao"]

    lo, hi = -20.0, 40.0                         # γ de cada joelho pra dentro (graus; − = pra fora)
    for _ in range(12):
        meio = (lo + hi) / 2
        gam["Left"], gam["Right"] = -meio, meio
        por_joelhos()
        if vao_pernas() > FOLGA_PERNAS * 1000:
            lo = meio
        else:
            hi = meio
    G0 = lo
    gam["Left"], gam["Right"] = -G0, G0
    por_joelhos()
    D0 = (c_("LeftLeg") - c_("RightLeg")).length
    print("JOELHOS JUNTOS | γ %.2f° pra dentro | centros a %.1f mm | pernas %.1f mm | pés %.1f mm | joelho %.1f°" % (
        G0, D0 * 1000, vao_pernas(), distancia(PE["Left"], PE["Right"]), joelho_flexao()))

    # ── cabeça no colchonete: o pescoço dobra ou estende até o cabelo da nuca encostar ───────────────────────────────────────────
    neck0 = PB[p3.P + "Neck"].matrix_basis.copy()

    def altura_cab(g):
        PB[p3.P + "Neck"].matrix_basis = neck0.copy()
        p3.atualizar()
        if g:
            p3.girar_osso(rig, "Neck", p3.rot_x(g))
        return cabelo_z()

    lo, hi = -40.0, 60.0
    for _ in range(14):
        g = (lo + hi) / 2
        if altura_cab(g) > TOPO - AFUNDA_CABELO:
            hi = g
        else:
            lo = g
    altura_cab(hi)
    PESCOCO = hi
    print("CABEÇA | pescoço %+.1f° | cabelo %+.1f mm | cabeça × tronco %.1f°" % (
        PESCOCO, (cabelo_z() - TOPO) * 1000, tc.cabeca_tronco(ck.posicoes(rig))[0]))

    # ── braços abertos ~45° do corpo, palmas pra baixo no colchonete (parados: o tórax não mexe) ──────────────────────────────────
    punhos, polos_b, iks_b = {}, {}, {}
    for lado, s in dt.LADOS:
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos_b[lado] = p3.vazio("polo_cotovelo_" + lado, c_(lado + "ForeArm") + Vector((s * 0.4, 0.0, -0.3)))
        iks_b[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos_b[lado])
        iks_b[lado].mute = True
    p3.atualizar()
    polo_ok = {}

    def esticar_dedos(lado):
        """Dedos esticados e juntos no plano da palma, o polegar deitado do lado do indicador (a mão de apoio do supra)."""
        p3.soltar_dedos(rig, lado)
        pg.juntar_dedos(rig, lado, 1.0)
        for d in p3.DEDOS + ("Thumb",):
            for i in (1, 2, 3):
                palma = pg._base(rig, lado)[0]
                o = "%sHand%s%d" % (lado, d, i)
                f = p3.ponta(rig, o) - p3.cabeca(rig, o)
                plano = f - palma * f.dot(palma)
                if d == "Thumb":
                    plano = plano - palma * 0.10 * f.length
                if plano.length > 1e-6:
                    p3.girar_osso(rig, o, f.rotation_difference(plano).to_matrix())

    def por_braco(lado, s, W, E, dedos_q):
        """Punho em W, cotovelo em E (o braço dobra no plano vertical que passa pelo ombro e pelo punho), a palma pra baixo e os dedos
        pra `dedos_q`."""
        S = c_(lado + "Arm")
        iks_b[lado].mute = False
        punhos[lado].location = W
        u = (W - S).normalized()
        fora = (E - S) - u * (E - S).dot(u)
        polos_b[lado].location = E + fora.normalized() * 0.4
        p3.atualizar()
        if lado not in polo_ok:
            polo_ok[lado] = p3.acertar_polo(rig, iks_b[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        nomes_b = (lado + "Arm", lado + "ForeArm")
        mats = [PB[p3.P + n].matrix.copy() for n in nomes_b]
        iks_b[lado].mute = True
        for n, M in zip(nomes_b, mats):
            PB[p3.P + n].matrix = M
            p3.atualizar()
        palma_q = Vector((0, 0, -1))
        palma_q = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
        f0, f1 = c_(lado + "ForeArm"), c_(lado + "Hand")
        ax = (f1 - f0).normalized()                       # 1) antebraço gira (pronação) pra palma ir pra baixo
        quer = palma_q - ax * palma_q.dot(ax)
        tem = pg._base(rig, lado)[0]
        tem = tem - ax * tem.dot(ax)
        if quer.length > 1e-6 and tem.length > 1e-6:
            quer.normalize()
            tem.normalize()
            p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(math.atan2(tem.cross(quer).dot(ax), tem.dot(quer)), 3, ax))
        n_m, _, y_m = pg._base(rig, lado)[:3]             # 2) o resto no punho, pela base da PALMA
        n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
        F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
        F_quer = Matrix((dedos_q, palma_q, dedos_q.cross(palma_q))).transposed()
        p3.girar_osso(rig, lado + "Hand", F_quer @ F_tem.transposed())
        esticar_dedos(lado)

    def dedos_no_chao(lado):
        """Com a palma no colchonete: cada dedo (e o polegar) gira só na base, pro lado da palma, até a pele mais baixa dele encostar."""
        palma, eixo_nos = pg._base(rig, lado)[:2]
        co, _, (nomes, dono) = malha()
        for d in p3.DEDOS + ("Thumb",):
            ossos = ["%sHand%s%d" % (lado, d, i) for i in ((1, 2, 3) if d != "Thumb" else (2, 3))]
            Pd = co[_grupo(nomes, dono, ossos)]
            h = c_(ossos[0])
            f = (p3.ponta(rig, ossos[0]) - h).normalized()
            eixo = eixo_nos if d != "Thumb" else f.cross(palma).normalized()
            sinal = 1 if eixo.cross(f).dot(palma) > 0 else -1
            escolha = None
            for g in np.arange(-25.0, 60.01, 0.5):
                if pg._rot(Pd, np.array(h), eixo, g * sinal)[:, 2].min() <= TOPO - AFUNDA_MAO:
                    escolha = float(g)
                    break
            if escolha is None:
                print("  dedo %s %s não chega no colchonete" % (lado, d))
                continue
            if escolha:
                p3.girar_osso(rig, ossos[0], p3.rot_eixo(escolha * sinal, eixo))

    # o braço sai do ombro na direção h (aberto BRACO_ABRE do corpo, visto de cima) e desce até o cotovelo encostar no colchonete; o
    # antebraço segue deitado até o punho, na altura em que a palma encosta (o cotovelo dobra só o que a descida pede)
    W, E, DQ, cot_z, pun_z = {}, {}, {}, {}, {}
    for lado, s in dt.LADOS:
        a = math.radians(BRACO_ABRE)
        h = Vector((s * math.sin(a), -math.cos(a), 0.0))
        DQ[lado] = Vector((h.x * math.cos(math.radians(DEDOS_DESCE)), h.y * math.cos(math.radians(DEDOS_DESCE)),
                           -math.sin(math.radians(DEDOS_DESCE))))
        cot_z[lado], pun_z[lado] = TOPO + 0.040, TOPO + 0.030

    def braco_no_chao(lado, s):
        S = c_(lado + "Arm")
        a = math.radians(BRACO_ABRE)
        h = Vector((s * math.sin(a), -math.cos(a), 0.0))
        dz = min(S.z - cot_z[lado], Lb * 0.999)
        E[lado] = S + h * math.sqrt(Lb ** 2 - dz ** 2) - Vector((0, 0, dz))
        dz2 = max(min(E[lado].z - pun_z[lado], La * 0.999), -La * 0.999)
        W[lado] = E[lado] + h * math.sqrt(La ** 2 - dz2 ** 2) - Vector((0, 0, dz2))
        por_braco(lado, s, W[lado], E[lado], DQ[lado])

    for volta in range(6):
        for lado, s in dt.LADOS:
            braco_no_chao(lado, s)
            co, _, (nomes, dono) = malha()
            dz_mao = (TOPO - AFUNDA_MAO) - float(co[_grupo(nomes, dono, (lado + "Hand", lado + "HandThumb1"))][:, 2].min())
            Ec = np.array(c_(lado + "ForeArm"))
            perto = _grupo(nomes, dono, (lado + "ForeArm", lado + "Arm")) & (np.linalg.norm(co - Ec, axis=1) < 0.08)
            dz_cot = (TOPO - AFUNDA_BRACO) - float(co[perto][:, 2].min())
            pun_z[lado] += dz_mao
            cot_z[lado] += dz_cot
    for lado, s in dt.LADOS:
        braco_no_chao(lado, s)
        dedos_no_chao(lado)
    med = ck.medir_juntas(rig)
    print("BRAÇOS | cotovelo %.0f/%.0f° | ombro %.0f/%.0f° | punho %.0f/%.0f° | mão E %.1f D %.1f mm | braço E %.1f D %.1f mm" % (
        med["cotoveloE"], med["cotoveloD"], med["ombroE"], med["ombroD"], med["punhoE"], med["punhoD"],
        (zmin(_mao("Left")) - TOPO) * 1000, (zmin(_mao("Right")) - TOPO) * 1000,
        (zmin(("LeftArm", "LeftForeArm")) - TOPO) * 1000, (zmin(("RightArm", "RightForeArm")) - TOPO) * 1000))

    # ── o meio guardado: coluna (Hips → Spine2), pés e tornozelos ────────────────────────────────────────────────────────────
    M0 = {n: PB[p3.P + n].matrix.copy() for n in COLUNA}
    B0, J0, S2 = c_("Spine").copy(), c_("Spine1").copy(), c_("Spine2").copy()
    ls, ls1 = (J0 - B0).length, (S2 - J0).length
    R_LOMBAR = (S2 - B0).length
    corda0 = (S2 - B0).normalized()
    dobra0 = (J0 - B0) - corda0 * (J0 - B0).dot(corda0)
    dobra0.normalize()
    HT0 = p3.ponta(rig, "Hips").copy()
    eixo_ponto = Vector((0.0, HT0.y, HT0.z))     # o giro da pelve: em volta do eixo do corpo (Y) na altura da base da lombar
    A0 = {L: alvos[L].location.copy() for L, _ in dt.LADOS}
    R0 = {L: rot_pe[L].matrix_world.copy() for L, _ in dt.LADOS}
    co, _, (nomes, dono) = malha()
    bordas = {}
    for lado, s in dt.LADOS:                    # bordas da sola: a reta que liga a borda do calcanhar à da frente do pé, de cada lado
        todos = co[_grupo(nomes, dono, PE[lado])]
        ym = np.median(todos[:, 1])                # metade de trás (calcanhar) e da frente, como o checagem3d.pes
        tras, frente = todos[todos[:, 1] > ym], todos[todos[:, 1] <= ym]
        tras = tras[tras[:, 2] < tras[:, 2].min() + 0.006]          # a sola de cada metade (até 6 mm acima do ponto mais baixo dela)
        frente = frente[frente[:, 2] < frente[:, 2].min() + 0.006]
        bordas[lado] = {}
        for lado_x in (1, -1):
            a_ = tras[np.argmax(tras[:, 0] * lado_x)]
            b_ = frente[np.argmax(frente[:, 0] * lado_x)]
            pa = Vector((a_[0], a_[1], a_[2]))     # o pé gira em volta da reta que passa por esses 2 pontos da sola (ficam no lugar)
            pb_ = Vector((b_[0], b_[1], b_[2]))
            d_ = pa - pb_                          # de frente pra trás: aponta pra +Y (o giro + leva o peito do pé pra +X)
            bordas[lado][lado_x] = (pb_, d_.normalized())
        print("SOLA %s | borda +X %s → %s | borda −X %s → %s" % (
            lado, tuple(round(v, 3) for v in bordas[lado][1][0]), tuple(round(v, 3) for v in bordas[lado][1][0] + bordas[lado][1][1] * 0.1),
            tuple(round(v, 3) for v in bordas[lado][-1][0]), tuple(round(v, 3) for v in bordas[lado][-1][0] + bordas[lado][-1][1] * 0.1)))
    print("COLUNA | B0 %s J0 %s S2 %s | ls %.3f ls1 %.3f (alcance %.4f, distância %.4f) | eixo da pelve em %s" % (
        tuple(round(v, 3) for v in B0), tuple(round(v, 3) for v in J0), tuple(round(v, 3) for v in S2), ls, ls1, ls + ls1,
        (S2 - B0).length, tuple(round(v, 3) for v in eixo_ponto)))

    # ── por quadro ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
    estado = {"lift": Vector((0, 0, 0)), "gap": 0.0, "theta": 0.0, "phi": 0.0, "D": 0.0}

    def coluna(phi, lift):
        """Pelve girada `phi` graus em volta do eixo do corpo (+ = a frente da pelve vira pra esquerda) e deslocada `lift`; a lombar
        (Spine) e o fim do tórax (Spine1) giram uma parte em volta do próprio eixo e dobram o mínimo pra ligar a pelve ao Spine2, que
        fica PARADO (os ombros, os braços e a cabeça não mexem)."""
        R = Matrix.Rotation(math.radians(phi), 4, Vector((0, 1, 0)))
        M = Matrix.Translation(eixo_ponto + lift) @ R @ Matrix.Translation(-eixo_ponto) @ M0["Hips"]
        PB[p3.P + "Hips"].matrix = M
        p3.atualizar()
        # a base da lombar (cabeça do Spine, solta da pelve no rig) fica a R_LOMBAR do Spine2, como no meio: a curva da lombar não estica nem
        # encolhe (esticada, o fim do tórax descia e entrava no colchonete); a pelve que sobe ou anda pro lado leva a lombar junto, e o
        # que sobra na direção da coluna fica entre a ponta do Hips e a cabeça do Spine (gap, medido)
        HT = p3.ponta(rig, "Hips").copy()
        B = S2 + (HT - S2).normalized() * R_LOMBAR
        gap = (HT - B).length
        d = R_LOMBAR
        u = (S2 - B).normalized()
        a = (ls ** 2 - ls1 ** 2 + d ** 2) / (2 * d)
        r = math.sqrt(max(ls ** 2 - a ** 2, 0.0))
        p = dobra0 - u * dobra0.dot(u)
        p.normalize()
        J = B + u * a + p * r
        for nome, cab, cab0, pon, pon0, frac in (("Spine", B, B0, J, J0, GIRO_PARTE[0]), ("Spine1", J, J0, S2, S2, GIRO_PARTE[1])):
            v0 = (pon0 - cab0).normalized()
            v = (pon - cab).normalized()
            Rs = v0.rotation_difference(v).to_matrix() @ M0[nome].to_3x3()      # o osso aponta pro novo lugar (sem girar em volta dele)
            # o giro em volta do próprio eixo: a vértebra fica girada frac·phi em volta do eixo do corpo em relação ao meio — a dobra
            # pro lado (a pelve rolando arrasta a lombar) não pode rolar a vértebra junto
            x0 = M0[nome].to_3x3() @ Vector((1, 0, 0))
            quer = Matrix.Rotation(math.radians(frac * phi), 3, Vector((0, 1, 0))) @ x0
            tem = Rs @ Vector((1, 0, 0))
            quer, tem = quer - v * quer.dot(v), tem - v * tem.dot(v)
            T = Matrix.Rotation(math.atan2(tem.cross(quer).dot(v), tem.dot(quer)), 3, v)
            Mn = (T @ Rs).to_4x4()
            Mn.translation = cab
            PB[p3.P + nome].matrix = Mn
            p3.atualizar()
        PB[p3.P + "Spine2"].matrix = M0["Spine2"]
        p3.atualizar()
        return gap

    pe_dz = {"Left": 0.0, "Right": 0.0}
    rola_atual = {"Left": Matrix.Identity(3), "Right": Matrix.Identity(3)}
    FRENTE_PE = {}
    for lado, s in dt.LADOS:
        f = c_(lado + "ToeBase") - c_(lado + "Foot")
        f.z = 0.0
        FRENTE_PE[lado] = f.normalized()

    def tornozelo_lado(lado, s):
        """Canela inclinada de lado em relação ao pé (graus, no plano da frente do pé; + = a canela pro lado de FORA do pé: o pé em
        inversão em relação à canela, − = eversão), sem a do meio (o pé chapado e a canela como ficam no meio)."""
        R = rola_atual[lado]
        f = R @ FRENTE_PE[lado]
        n = R @ Vector((0, 0, 1))
        fora = R @ Vector((s, 0, 0))
        sh = c_(lado + "Leg") - c_(lado + "Foot")
        sh = sh - f * sh.dot(f)
        n = n - f * n.dot(f)
        return math.degrees(math.atan2(sh.dot(fora), sh.dot(n)))

    def pes(theta):
        """Cada pé rola na borda da sola do lado pra onde os joelhos tombam (o de baixo na borda de fora, o de cima na de dentro) e desce
        `pe_dz` (a borda que fica no colchonete encosta nele)."""
        lado_x = 1 if theta >= 0 else -1
        for lado, s in dt.LADOS:
            baixo = (s == lado_x)
            psi = (PE_ROLA[0] if baixo else PE_ROLA[1]) * theta
            E, dvec = bordas[lado][lado_x]
            R = Matrix.Translation(E + Vector((0, 0, pe_dz[lado]))) @ Matrix.Rotation(math.radians(psi), 4, dvec) @ \
                Matrix.Translation(-E)
            rot_pe[lado].matrix_world = R @ R0[lado]
            alvos[lado].location = R @ A0[lado]
            rola_atual[lado] = R.to_3x3()

    def tombo_de(KL, KR):
        H = (c_("LeftUpLeg") + c_("RightUpLeg")) / 2
        A = (alvos["Left"].location + alvos["Right"].location) / 2
        u = (A - H).normalized()
        K = (KL + KR) / 2 - H
        K = K - u * K.dot(u)
        e1 = Vector((0, 0, 1)) - u * u.z
        e1.normalize()
        e2 = e1.cross(u)
        return math.degrees(math.atan2(K.dot(e2), K.dot(e1)))

    def joelhos(theta, D):
        """γ de cada joelho: o par tomba `theta` (o meio dos 2 joelhos em volta da reta quadris → tornozelos) com os centros dos
        joelhos a D (o de cima deitado em cima do de baixo, encostando)."""
        if abs(theta) < 1e-6:
            gam["Left"], gam["Right"] = -G0, G0
            return
        sx = 1 if theta > 0 else -1
        b, t_ = ("Left", "Right") if sx > 0 else ("Right", "Left")
        gb0, gt0 = (-G0, G0) if sx > 0 else (G0, -G0)

        def primeiro(f, g0, passo, n):
            """Primeiro g (de g0 andando `passo`) com f(g) <= 0, refinado por bissecção (f > 0 antes dele)."""
            a_ = g0
            if f(a_) <= 0:
                return a_
            for _ in range(n):
                b_ = a_ + passo
                if f(b_) <= 0:
                    for _ in range(25):
                        m_ = (a_ + b_) / 2
                        if f(m_) > 0:
                            a_ = m_
                        else:
                            b_ = m_
                    return (a_ + b_) / 2
                a_ = b_
            return a_

        def topo_para(gb):
            Kb = joelho_em(b, gb)                # o de cima segue o de baixo pelo lado de dentro, com os centros a D
            return primeiro(lambda g: (joelho_em(t_, g) - Kb).length - D, gt0, sx * 2.0, 90)

        def falta(gb):
            gt = topo_para(gb)
            KL, KR = (joelho_em("Left", gb), joelho_em("Right", gt)) if b == "Left" else (joelho_em("Left", gt), joelho_em("Right", gb))
            return abs(theta) - abs(tombo_de(KL, KR))

        gam[b] = primeiro(falta, gb0, sx * 2.0, 60)
        gam[t_] = topo_para(gam[b])

    PELVE_PELE = ("Hips", "LeftUpLeg", "RightUpLeg")
    eixo_y = Vector((0, 1, 0))

    def aplicar(theta, tr, dzs, D):
        """Monta o quadro do tombo `theta` com a pelve deslocada `tr` (depois do giro em volta do eixo), os pés descidos `dzs` e os
        centros dos joelhos a D."""
        phi = PELVE_FRAC * theta
        gap = coluna(phi, tr)
        pe_dz.update(dzs)
        pes(theta)
        joelhos(theta, D)
        por_joelhos()
        estado.update(lift=tr.copy(), gap=gap, theta=theta, phi=phi, D=D)

    # tabela por tombo (de 0 até ±TOMBA): a pelve ROLA sem escorregar — cada passo gira em volta do ponto da pele que está no colchonete
    # e acerta a altura dele —, os pés descem até a borda da sola encostar e o joelho de cima deita no de baixo até as pernas encostarem
    # (vão FOLGA_PERNAS); por quadro só se interpola (sem medir a malha)
    tab = {}
    for sx in (1, -1):
        tr = Vector((0, 0, 0))
        dzs = {"Left": 0.0, "Right": 0.0}
        D = D0
        C = None
        th_ant = 0.0
        for k in range(TABELA_N + 1):
            theta = sx * TOMBA * k / TABELA_N
            if C is not None:
                # gira em volta de um ponto entre a pele no colchonete (rolar sem escorregar) e o eixo da lombar (girar no lugar)
                piv = C * ROLA_PELVE + (eixo_ponto + tr) * (1.0 - ROLA_PELVE)
                Rd = Matrix.Rotation(math.radians(PELVE_FRAC * (theta - th_ant)), 3, eixo_y)
                tr = piv + Rd @ (eixo_ponto + tr - piv) - eixo_ponto
            for volta in range(4):
                aplicar(theta, tr, dzs, D)
                co, tri, nd = malha()
                nomes, dono = nd
                m = _grupo(nomes, dono, PELVE_PELE) & (co[:, 1] > HT0.y - 0.25)
                i = int(np.argmin(np.where(m, co[:, 2], np.inf)))
                dz = (TOPO - AFUNDA_GLUTEO) - float(co[i, 2])
                tr = tr + Vector((0, 0, dz))
                C = Vector(co[i]) + Vector((0, 0, dz))
                dpe = {L: (TOPO - AFUNDA_PE) - float(co[_grupo(nomes, dono, PE[L])][:, 2].min()) for L, _ in dt.LADOS}
                for L in dpe:
                    dzs[L] += dpe[L]
                g = FOLGA_PERNAS * 1000
                if k:
                    g = vao_pernas(co, tri, nd)
                    D += (FOLGA_PERNAS - g / 1000) * 0.9
                if abs(dz) < 0.0002 and max(abs(v) for v in dpe.values()) < 0.0002 and abs(g / 1000 - FOLGA_PERNAS) < 0.0004:
                    break
            tab[round(theta, 6)] = (tr.copy(), dict(dzs), D)
            th_ant = theta
            print("TABELA tombo %+5.1f | pelve desloca (%+.1f %+.1f %+.1f) mm | pés descem E %+.1f D %+.1f mm | joelhos a %.1f mm | vão "
                  "das pernas %.1f mm | %d voltas" % (theta, tr.x * 1000, tr.y * 1000, tr.z * 1000, dzs["Left"] * 1000,
                                                    dzs["Right"] * 1000, D * 1000, g, volta + 1), flush=True)
    TH_TAB = sorted(tab)

    def colocar_quadro(theta):
        """O quadro do tombo `theta`, interpolando a tabela."""
        theta = max(TH_TAB[0], min(TH_TAB[-1], theta))
        i = int(np.searchsorted(TH_TAB, theta))
        i = min(max(i, 1), len(TH_TAB) - 1)
        a_, b_ = TH_TAB[i - 1], TH_TAB[i]
        f = (theta - a_) / (b_ - a_) if b_ > a_ else 0.0
        (tra, dza, Da), (trb, dzb, Db) = tab[a_], tab[b_]
        aplicar(theta, tra.lerp(trb, f), {L: dza[L] + (dzb[L] - dza[L]) * f for L in dza}, Da + (Db - Da) * f)

    # ── colchonete: do alto da cabeça até a ponta dos pés, e largo o bastante pras mãos ─────────────────────────────────────────
    colocar_quadro(0.0)
    TORN0 = {"Left": tornozelo_lado("Left", 1), "Right": tornozelo_lado("Right", -1)}
    co, _, (nomes, dono) = malha()
    y_pe = float(co[_grupo(nomes, dono, ("LeftToeBase", "RightToeBase"))][:, 1].min())
    y_cab = float(co[_grupo(nomes, dono, ("Head",))][:, 1].max())
    x_mao = float(np.abs(co[_grupo(nomes, dono, _mao("Left") + _mao("Right"))][:, 0]).max())
    largura = 2 * (x_mao + 0.05)
    y_min, y_max = y_pe - 0.08, y_cab + 0.06
    colchonete = e3.caixa("colchonete", (0, (y_min + y_max) / 2, TOPO / 2), (largura, y_max - y_min, TOPO), e3.mat_estofado(),
                          chanfro=0.004)
    print("COLCHONETE %.2f × %.2f m (y %.3f a %.3f) | mãos até |x| %.3f" % (largura, y_max - y_min, y_min, y_max, x_mao))

    # ── medidas ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
    entrada = {}
    ref = {}

    def info():
        j = ck.posicoes(rig)
        co, tri, nd = malha()
        nomes, dono = nd
        encosta = co[:, 2] < TOPO
        escorrega = {}
        for nome, partes in (("costas de cima", ("Spine2",)), ("pelve", ("Hips",)), ("mãos", _mao("Left") + _mao("Right")),
                             ("braços", ("LeftArm", "LeftForeArm", "RightArm", "RightForeArm")),
                             ("pé E", PE["Left"]), ("pé D", PE["Right"])):
            mm = _grupo(nomes, dono, partes) & encosta
            e = entrada.setdefault(nome, np.full(co.shape, np.nan))
            novo = mm & np.isnan(e[:, 0])
            e[novo] = co[novo]
            e[~mm] = np.nan
            escorrega[nome] = float(np.linalg.norm((co[mm] - e[mm])[:, :2], axis=1).max()) * 1000 if mm.any() else 0.0
        if not ref:
            ref["co"] = co.copy()
        sup = ref["co"][:, 1] > S2.y + 0.10          # das escápulas pra cima (no 1º quadro): costas de cima, ombros, braços, cabeça
        anda_sup = float(np.linalg.norm(co[sup] - ref["co"][sup], axis=1).max()) * 1000
        esc = sup & _grupo(nomes, dono, ("Spine2",))
        esc_z = (float(co[esc][:, 2].min()) - TOPO) * 1000
        s2_anda = (c_("Spine2") - S2).length * 1000
        z = {k: (float(co[_grupo(nomes, dono, (k,))][:, 2].min()) - TOPO) * 1000 for k in ("Hips", "Spine", "Spine1", "Spine2")}
        gl = co[_grupo(nomes, dono, ("Hips",))]
        gE = (float(gl[gl[:, 0] > 0.03][:, 2].min()) - TOPO) * 1000
        gD = (float(gl[gl[:, 0] < -0.03][:, 2].min()) - TOPO) * 1000
        s1 = co[_grupo(nomes, dono, ("Spine1",))]
        s1E = (float(s1[s1[:, 0] > 0.03][:, 2].min()) - TOPO) * 1000
        s1D = (float(s1[s1[:, 0] < -0.03][:, 2].min()) - TOPO) * 1000
        pm = pernas_medidas(co, tri, nd)
        pernas_mm = "vão %.1f em %s, coxas entram %.1f, pernas %.1f" % (pm["vao"], pm["ponto"], pm["coxas"], pm["pernas"])
        pes_mm = distancia(PE["Left"], PERNA["Right"] + PE["Right"], co, tri, nd)
        med = ck.medir_juntas(rig)
        rol = tc.corpo_rolagem(j)
        return ("tombo %+.1f° (pedido %+.1f) | pelve: giro %+.1f° (tronco_giro %+.1f) rolagem tórax %.1f pelve %.1f | pelve desloca (%.1f %.1f %.1f) mm "
                "gap %.1f mm | joelhos γ E %+.1f D %+.1f | joelho %.0f/%.0f° quadril %.0f/%.0f° | coxa_abducao %s | pele acima do "
                "colchonete (mm): glúteo E %.1f D %.1f lombar %.1f Spine1 E %.1f D %.1f Spine2 %.1f escápulas %.1f | parte de cima andou %.2f mm "
                "(Spine2 %.2f) | "
                "pernas: %s | pé E × perna D %.1f mm | pés z E %.1f D %.1f | canela × pé de lado (+ = inversão, já sem o meio) E %+.1f D %+.1f "
                "| escorrega (mm) %s" % (
                    tombo_de(c_("LeftLeg"), c_("RightLeg")), estado["theta"], estado["phi"], tc.tronco_giro(j)[0], rol[0], rol[1],
                    estado["lift"].x * 1000, estado["lift"].y * 1000, estado["lift"].z * 1000, estado["gap"] * 1000, gam["Left"],
                    gam["Right"],
                    med["joelhoE"], med["joelhoD"], med["quadrilE"], med["quadrilD"], tc.valores("coxa_abducao", tc.coxa_abducao(j)),
                    gE, gD, z["Spine"], s1E, s1D, z["Spine2"], esc_z, anda_sup, s2_anda, pernas_mm, pes_mm,
                    (float(co[_grupo(nomes, dono, PE["Left"])][:, 2].min()) - TOPO) * 1000,
                    (float(co[_grupo(nomes, dono, PE["Right"])][:, 2].min()) - TOPO) * 1000,
                    tornozelo_lado("Left", 1) - TORN0["Left"], tornozelo_lado("Right", -1) - TORN0["Right"],
                    " ".join("%s %.1f" % kv for kv in escorrega.items())))

    def pose(t):
        colocar_quadro(tomba(t))

    pose(0.0)
    print("MOBILIDADE | %s" % info())
    entrada.clear()
    ref.clear()
    return Cena(pose, [], pegadas=[], apoio_mm=0.0, foco_luz=(0, -0.2, 0.2),
                camera_video=((1.2, -3.4, 1.8), (0, -0.15, 0.15), 50), info=info, apoios=[colchonete], afunda_apoio_mm=20)
