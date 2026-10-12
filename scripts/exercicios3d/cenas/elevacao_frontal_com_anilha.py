# Elevação Frontal com Anilha — cena da fábrica 3D (lote 14, 12/10/2026; um dos 61 novos do scripts/conteudo/novos_61.json: 0 usos nos
# treinos prontos, 1 como troca equivalente). Peça NOVA: a anilha solta de 10 kg com 2 pegadores vazados (equip3d.anilha, a Eleiko Grip
# Plate Rubber 10 kg: Ø 350 mm, 30 mm).
# t = 0 embaixo: braços quase esticados um pouco à frente do corpo, a anilha na frente da cintura, inclinada (a borda de cima pra frente) ·
# t = 1 em cima: braços um pouco acima da horizontal, a anilha em pé, de frente (o furo pra frente), com o meio um pouco acima da altura dos
# ombros. O app faz a volta (desce devagar pelo mesmo caminho).
# Técnica (as fontes, com a frase exata, ficam na ficha):
#   • free-exercise-db, Front Plate Raise (o "fonte_en" do catálogo): "While standing straight, hold a barbell plate in both hands at the
#     3 and 9 o'clock positions. Your palms should be facing each other and your arms should be extended and locked with a slight bend
#     at the elbows and the plate should be down near your waist in front of you as far as you can go." / "The arms will remain in this
#     position throughout the exercise." / "Slowly raise the plate as you exhale until it is a little above shoulder level." / "make sure
#     that you do not swing the weight or bend at the elbows. Your torso should remain stationary throughout the movement as well."
#   • PureGym, Plate Front Raise: "raise a weight plate from hip height in an arc direction until the arms are straight ahead and the
#     plate is at shoulder height. Due to the shape of the plate, a neutral grip is used" / "placing your hands on the plate at 3 o'clock
#     and 9 o'clock".
#   • ExRx (Barbell Front Raise), ACE e NSCA (Front Raise com halteres), Coratella 2020: braço até um pouco acima da horizontal, cotovelo
#     quase esticado e parado, tronco ereto e parado, pés na largura do quadril com os joelhos levemente dobrados, úmero sem girar
#     ("thumb-to-thumb"), punho na linha do antebraço.
# Pegada: as mãos em 3 e 9 horas, uma de cada lado, as palmas uma pra outra (pegada neutra), cada uma fechada no ARO entre o vazado e a
# borda da anilha (palma na borda de fora, dedos dando a volta pela frente e entrando no vazado, polegar por trás — o polegar novo).
# Montagem: em cima (t = 1, a referência) a anilha fica em pé, de frente, com o meio TOPO_Z acima da articulação dos ombros; cada mão é
# posta no aro pelo maos3d.Maos.segurar(zerar=True) — o aro na linha dos nós dos dedos, a palma virada pro meio e a mão seguindo o
# antebraço visto de cima (sem dobrar o punho pra frente/trás) —, a anilha vai um pouco pra frente/trás até o cotovelo ficar a COTOVELO
# graus e as mãos fecham UMA vez nela (cada dedo fecha até a pele encostar na anilha de verdade: anilha.sdf; o polegar dá a volta por
# trás). Daí, em todo quadro, os 2 braços inteiros (braço, antebraço, mão, dedos e a anilha) giram juntos, rígidos, em volta do eixo de
# lado a lado que passa pelos 2 ombros (a flexão do ombro, no plano sagital) e o punho gira em volta da reta de lado a lado que passa pelos
# 2 punhos (o desvio radial/ulnar — com a pegada neutra é ele que inclina a anilha pra frente e pra trás; a flexão/extensão do punho fica
# parada): o punho vai de ~2° em cima a ~17° pro lado do polegar embaixo (amplitude normal: até 20°, limites.py) e a anilha, de em pé a
# ~59° (a borda de cima pra frente, como na foto do free-exercise-db), parando a ~2 cm das coxas. A anilha anda rígida presa nas 2 mãos
# (as 2 mãos e a anilha fazem o mesmo movimento rígido). Pernas por IK, tornozelos parados a ±PES_X, joelhos a JOELHO graus, pés chapados (como na Elevação Frontal com
# Halteres). Tronco, escápulas e cabeça parados.
import math
import bpy
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

LADOS = (("Left", 1), ("Right", -1))
DEDOS = ("Index", "Middle", "Ring", "Pinky")

# ── pernas (as da Elevação Frontal com Halteres: NSCA "feet hip-width apart with toes pointed straight ahead", "Slightly flex knees") ─
PES_X = 0.165             # tornozelos a ±PES_X do meio (m): pés na largura do quadril
JOELHO = 10.0             # flexão dos joelhos (graus), parada

# ── braços ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
TOPO_Z = 0.08             # em cima: o meio da anilha (= a altura das mãos, nos pegadores de 3 e 9 h) acima da articulação dos ombros (m)
COTOVELO = 10.0           # flexão do cotovelo (graus), parada: "extended and locked with a slight bend at the elbows"
DESCE = 74.0              # quanto os braços descem (graus, em volta do eixo dos ombros) de cima (t = 1) até embaixo (t = 0)
PUNHO = -15.0             # quanto o punho gira (graus, desvio; − = pro lado do polegar) de cima até embaixo: a anilha gira DESCE + PUNHO
POLO = (0.1, 0.0, -1.0)   # pra onde o cotovelo aponta em cima (pra fora, pra trás, pra baixo): o úmero quase sem girar

# ── mão na anilha ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DIAM_MAO = 33.0           # mão de referência (pegada3d.usar_cilindro, mm): o aro tem seção de 29,5 × 30 mm com as bordas arredondadas
                          # (perímetro ~104 mm = cilindro de ~33 mm)
APERTO = 0.0015           # a pele dos dedos pode afundar na anilha até isso (m)
FUNDO_MAX = 0.0020        # trava: nada da mão afunda mais que isso na anilha (m)


def _malha(bon, niveis=1):
    return ck._avaliar(bon.corpo, niveis)


def _grupo(nomes, dono, pred):
    return np.array([bool(pred(n)) for n in nomes] + [False])[dono]


def _bvh(vs, ts):
    return BVHTree.FromPolygons([tuple(p) for p in vs], [tuple(t) for t in ts], all_triangles=True)


def _menor(bvh, pts, lim):
    """Menor distância (m) dos pontos até a malha, até `lim` (mais longe = lim)."""
    m = lim
    for p in pts:
        r = bvh.find_nearest(Vector(p), lim)
        if r[0] is not None and r[3] < m:
            m = r[3]
    return m


def _com_sinal(bvh, pts, lim=0.5):
    """Menor distância com sinal dos pontos até a superfície (− = dentro), até `lim`."""
    menor = lim
    for p in pts:
        v = Vector(p)
        loc, nor, _, d = bvh.find_nearest(v, lim)
        if loc is not None:
            menor = min(menor, -d if (d < 0.03 and (v - loc).dot(nor) < 0) else d)
    return menor


def fechar_dedos(bon, lado, an, aperto=APERTO):
    """Cada dedo (indicador ao mínimo), a partir da mão de referência (pg.mao_de_referencia, já posta), fecha ou abre inteiro — as 3
    juntas na mesma proporção, como o pg.fechar_em_volta — até a PELE encostar na anilha de verdade (an.sdf: o aro curvo, de seção quase
    quadrada, com as bordas arredondadas), sem entrar nela mais que `aperto`. Devolve {dedo: (λ, folga mínima mm, folga média mm)}."""
    rig = bon.rig
    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 0)
    pos = {n: i for i, n in enumerate(nomes)}
    eixo_nos = pg._base(rig, lado)[1]
    out = {}
    for d in DEDOS:
        ossos = ["%sHand%s%d" % (lado, d, i) for i in (1, 2, 3)]
        pts = {o: co[dono == pos[o]] for o in ossos}
        cab = {o: np.array(p3.cabeca(rig, o)) for o in ossos}
        ponta = np.array(p3.ponta(rig, ossos[-1]))
        ref = pg.ANGULOS_REF[d]
        sinal = pg._SINAL[(lado, d)]
        escolha = None
        for lam in np.arange(0.45, -0.451, -0.01):          # do mais fechado pro mais aberto: o 1º que não entra na anilha
            delta = [lam * ref[k] * sinal for k in range(3)]
            pp = pg._cadeia_pts(pts, cab, ponta, ossos, [eixo_nos] * 3, delta)
            sd = an.sdf(np.concatenate([pp[o] for o in ossos]))
            if float(sd.min()) >= -aperto:
                escolha = (float(lam), delta, sd)
                break
        if escolha is None:
            escolha = (0.0, [0.0] * 3, an.sdf(np.concatenate([pts[o] for o in ossos])))
        lam, delta, sd = escolha
        for k, o in enumerate(ossos):
            if delta[k]:
                p3.girar_osso(rig, o, p3.rot_eixo(delta[k], eixo_nos))
        out[d] = (round(lam, 2), round(float(sd.min()) * 1000, 1), round(float(np.clip(sd, 0, 0.03).mean()) * 1000, 1))
    return out


def montar(bon):
    pg.usar_cilindro(DIAM_MAO)                    # mão de referência do aro (~33 mm), antes do Maos
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda nome: p3.cabeca(rig, nome)
    coxa = (c("LeftLeg") - c("LeftUpLeg")).length
    canela = (p3.ponta(rig, "LeftLeg") - c("LeftLeg")).length
    tornoz = p3.ponta(rig, "LeftLeg")
    q0 = c("LeftUpLeg")
    pivo = (c("LeftUpLeg") + c("RightUpLeg")) / 2

    # ── pernas por IK: tornozelos parados a ±PES_X do meio, joelhos pra frente, pés chapados (a Elevação Frontal com Halteres) ───────
    pernas = {}
    for lado, s in LADOS:
        tz = p3.ponta(rig, lado + "Leg")
        alvo = p3.vazio("tornozelo_" + lado, Vector((s * PES_X, tz.y, tz.z)))
        polo = p3.vazio("polo_joelho_" + lado, (s * 0.22, -1.2, 0.55))
        pernas[lado] = p3.ik(rig, lado + "Leg", alvo, polo)
        p3.travar_rotacao(rig, lado + "Foot")
    PB[p3.P + "Hips"].matrix_basis = Matrix()
    p3.atualizar()
    th = math.radians(JOELHO)
    d = math.sqrt(coxa ** 2 + canela ** 2 + 2 * coxa * canela * math.cos(th))   # quadril → tornozelo
    dx, dy = q0.x - PES_X, q0.y - tornoz.y
    desce = tornoz.z + math.sqrt(max(d ** 2 - dx ** 2 - dy ** 2, 0.01)) - q0.z
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), pivo=pivo, mover=Vector((0, 0, desce)))
    for lado, _ in LADOS:
        e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
        print("polo joelho", lado, "erro %.3f ang %d" % e, flush=True)

    # ── a anilha e as mãos ─────────────────────────────────────────────────────────────────────────────────────────────────────────
    an = e3.anilha("anilha")
    R_ARO = an.medidas["r_aro"]
    maos = Maos(bon, an.raio + 0.0015, polegar_modo="volta")   # o vão da mão pro aro (~32 mm) e o polegar novo
    S = {L: c(L + "Arm") for L, _ in LADOS}                    # ombros (o tronco não mexe)
    Sm = (S["Left"] + S["Right"]) / 2
    Lb = (c("LeftForeArm") - c("LeftArm")).length
    La = (c("LeftHand") - c("LeftForeArm")).length
    D_ALVO = math.sqrt(Lb * Lb + La * La + 2 * Lb * La * math.cos(math.radians(COTOVELO)))   # ombro → punho com o cotovelo a COTOVELO

    # em cima (t = 1): anilha em pé e de frente (X = de lado a lado, Y = a normal da face, Z = em pé), com o meio TOPO_Z acima dos ombros
    ref = {"y": Sm.y - 0.55, "z": Sm.z + TOPO_Z}
    quer = {L: (Vector((0.0, -1.0, 0.0)), Vector((-s, 0.0, 0.0))) for L, s in LADOS}   # (dedos, palma) pedidos ao segurar
    Z = Vector((0.0, 0.0, 1.0))

    def por_maos():
        for L, s in LADOS:
            g = Vector((s * R_ARO, ref["y"], ref["z"]))
            E = c(L + "ForeArm")
            maos.segurar(L, g, quer[L][0], quer[L][1], polo=E + Vector((s * POLO[0], POLO[1], POLO[2])) * 0.4, zerar=True,
                         voltas=8)

    por_maos()
    for L, _ in LADOS:                                         # polo certo do cotovelo (o cotovelo dobra pro lado do polo)
        maos.iks[L].mute = False
        e = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
        maos.iks[L].mute = True
        print("polo cotovelo %s erro %.3f ang %d" % (L, *e), flush=True)
    for volta in range(30):
        por_maos()
        mexeu = 0.0
        for L, s in LADOS:
            palma, k, _, _, _ = pg._base(rig, L)
            dq, pq = quer[L]
            # 1) o aro na linha dos nós dos dedos, em pé (o mínimo embaixo): gira a mão em volta da palma
            kp = (k - palma * k.dot(palma)).normalized()
            a1 = math.atan2(kp.cross(-Z).dot(palma), kp.dot(-Z))
            R1 = Matrix.Rotation(a1, 3, palma)
            # 2) sem dobrar o punho pra frente/trás: a palma ⟂ antebraço (gira em volta do aro, em pé)
            f = (c(L + "Hand") - c(L + "ForeArm")).normalized()
            pr = (R1 @ palma)
            A = pr.x * f.x + pr.y * f.y
            B = -pr.y * f.x + pr.x * f.y
            a2 = math.atan2(-A, B)
            if abs(a2) > math.pi / 2:
                a2 -= math.copysign(math.pi, a2)
            R2 = Matrix.Rotation(a2, 3, Z)
            R = Matrix.Rotation(0.6 * a2, 3, Z) @ Matrix.Rotation(0.6 * a1, 3, palma)    # meio passo: sem oscilar
            quer[L] = ((R @ dq).normalized(), (R @ pq).normalized())
            mexeu = max(mexeu, abs(a1), abs(a2))
        # 3) o cotovelo a COTOVELO graus: a anilha vai pra frente/trás até o ombro → punho ficar com D_ALVO
        W = c("LeftHand")
        dD = D_ALVO - (W - S["Left"]).length
        ref["y"] += 0.6 * dD * (W - S["Left"]).length / min((W - S["Left"]).y, -0.05)
        print("REF volta %d | giro da mão %.2f° | ombro→punho %.1f mm do alvo | anilha y %.4f z %.4f | vão E %.1f D %.1f mm" % (
            volta, math.degrees(mexeu), -dD * 1000, ref["y"], ref["z"], maos.erro["Left"] * 1000, maos.erro["Right"] * 1000),
            flush=True)
        if math.degrees(mexeu) < 0.05 and abs(dD) < 0.00005:
            break
    por_maos()

    # a anilha nas mãos de verdade: o meio entre os 2 vãos, X de um vão pro outro, Z = a linha dos nós dos dedos (média das 2 mãos)
    gs = {L: p3.mundo_osso(rig, L + "Hand") @ maos.furo[L] for L, _ in LADOS}
    X = (gs["Left"] - gs["Right"]).normalized()
    kz = -(pg._base(rig, "Left")[1] + pg._base(rig, "Right")[1])
    kz = (kz - X * kz.dot(X)).normalized()
    M_an = Matrix((X, kz.cross(X), kz)).transposed().to_4x4()
    M_an.translation = (gs["Left"] + gs["Right"]) / 2
    an.raiz.matrix_world = M_an
    p3.atualizar()
    print("ANILHA em cima | meio (%.4f %.4f %.4f) | vão a vão %.1f mm (aro a aro %.1f) | eixo do aro E × D %.2f°" % (
        *M_an.translation, (gs["Left"] - gs["Right"]).length * 1000, 2 * R_ARO * 1000,
        math.degrees(pg._base(rig, "Left")[1].angle(pg._base(rig, "Right")[1]))), flush=True)

    # ── as 2 mãos fecham UMA vez na anilha (em cima): dedos pela anilha de verdade, polegar novo por trás do aro ────────────────────
    estado = {"dedos": {}, "polegar": {}}
    for L, s in LADOS:
        pg.mao_de_referencia(rig, L)
        estado["dedos"][L] = fechar_dedos(bon, L, an)
        p, e = an.mundo(1 if L == "Left" else -1)
        estado["polegar"][L] = pg.polegar_em_volta(bon, L, p, e, an.raio + 0.0015, aperto=APERTO)
        print("MÃO %s | dedos %s | polegar %s" % (L, estado["dedos"][L], estado["polegar"][L]), flush=True)
    # trava: nada da mão (palma, dedos, polegar) afunda na anilha mais que FUNDO_MAX, e o polegar novo achou postura
    co0, _, (nomes0, dono0) = ck._avaliar(bon.corpo, 0)
    for L, _ in LADOS:
        sd = float(an.sdf(co0[_grupo(nomes0, dono0, lambda n, L=L: n.startswith(L + "Hand"))]).min())
        if sd < -FUNDO_MAX or not estado["polegar"][L][-1]:
            raise RuntimeError("TRAVA: mão %s afunda %.1f mm na anilha (máx. %.1f) ou polegar sem postura (%s)" % (
                L, -sd * 1000, FUNDO_MAX * 1000, estado["polegar"][L]))

    # ── referência guardada (em cima): braço, mão e anilha no mundo, e os eixos de lado a lado dos ombros e dos punhos ───────────────
    M_ref = {L: {n: PB[p3.P + L + n].matrix.copy() for n in ("Arm", "Hand")} for L, _ in LADOS}
    W_ref = (c("LeftHand") + c("RightHand")) / 2
    Mi_an = an.raiz.matrix_world.copy()

    def girar_em_x(graus, ponto):
        return Matrix.Translation(ponto) @ Matrix.Rotation(math.radians(graus), 4, "X") @ Matrix.Translation(-ponto)

    def pose(t):
        """t=0 embaixo (anilha na frente da cintura), t=1 em cima (anilha um pouco acima da altura dos ombros)."""
        a = (1.0 - t) * DESCE                     # os braços descem (extensão do ombro: +X gira a frente pra baixo)
        b = (1.0 - t) * PUNHO                     # o punho gira (− = a anilha gira menos que o braço)
        A = girar_em_x(a, Sm)
        B = girar_em_x(b, W_ref)
        for L, _ in LADOS:
            PB[p3.P + L + "Arm"].matrix = A @ M_ref[L]["Arm"]
            p3.atualizar()
            PB[p3.P + L + "Hand"].matrix = A @ B @ M_ref[L]["Hand"]
            p3.atualizar()
        an.raiz.matrix_world = A @ B @ Mi_an
        p3.atualizar()
        estado["t"] = t

    # ── medidas à parte (a checagem ignora o que fica DENTRO da mão) ──────────────────────────────────────────────────────────────────
    disco = [o for o in an.raiz.children if o.type == "MESH"]
    pts_loc = np.concatenate([ck._amostras(*ck._avaliar_simples(o), 0.008) for o in disco])
    Mi0 = np.array(an.raiz.matrix_world.inverted())
    pts_loc = pts_loc @ Mi0[:3, :3].T + Mi0[:3, 3]           # pontos da anilha no referencial dela

    def pontos_anilha():
        M = np.array(an.raiz.matrix_world)
        return pts_loc @ M[:3, :3].T + M[:3, 3]

    def medidas():
        """mm: anilha × coxas, × tronco, × rosto/pescoço, × cabelo, × antebraços e braços; mão × anilha (pele mais funda: palma, dedos,
        polegar de cada mão), mão × mão, mão × coxas e mão × tronco."""
        co, tri, (nomes, dono) = _malha(bon)
        pa = pontos_anilha()
        out = {}
        for chave, partes in (("coxas", ("LeftUpLeg", "RightUpLeg")), ("tronco", ("Hips", "Spine", "Spine1", "Spine2")),
                              ("rosto", ("Head", "Neck")), ("antebracos", ("LeftForeArm", "RightForeArm")),
                              ("bracos", ("LeftArm", "RightArm"))):
            m = _grupo(nomes, dono, lambda n, P=partes: n in P)
            out[chave] = _com_sinal(_bvh(co, tri[m[tri].all(axis=1)]), pa[::2], 0.3) * 1000
        out["cabelo"] = _menor(ck._bvh(*ck._avaliar_simples(bon.cabelo)), pa[::2], 0.3) * 1000
        co0, tri0, (nomes0, dono0) = ck._avaliar(bon.corpo, 0)
        for L, _ in LADOS:
            for rot, pred in (("palma", lambda n, L=L: n == L + "Hand"),
                              ("dedos", lambda n, L=L: n.startswith(L + "Hand") and "Thumb" not in n and n != L + "Hand"),
                              ("polegar", lambda n, L=L: n.startswith(L + "HandThumb"))):
                out["%s %s" % (rot, L[0])] = float(an.sdf(co0[_grupo(nomes0, dono0, pred)]).min()) * 1000
        mE = _grupo(nomes, dono, lambda n: n.startswith("LeftHand"))
        mD = _grupo(nomes, dono, lambda n: n.startswith("RightHand"))
        out["mão×mão"] = _menor(_bvh(co, tri[mD[tri].all(axis=1)]), co[mE][::3], 0.5) * 1000
        for chave, partes in (("mão×coxa", ("LeftUpLeg", "RightUpLeg", "Hips")), ("mão×tronco", ("Spine", "Spine1", "Spine2"))):
            m = _grupo(nomes, dono, lambda n, P=partes: n in P)
            bv = _bvh(co, tri[m[tri].all(axis=1)])
            out[chave] = min(_com_sinal(bv, co[mE][::2], 0.5), _com_sinal(bv, co[mD][::2], 0.5)) * 1000
        return out

    olho = bpy.data.objects.get("olho_l")                         # só pro info: altura do meio do olho (malha do olho)
    olhos = (sum((olho.matrix_world @ Vector(v)).z for v in olho.bound_box) / 8 if olho is not None
             else (c("Head").z + p3.ponta(rig, "Head").z) / 2)

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        M = an.raiz.matrix_world
        meio = M.translation
        em_pe = M.to_3x3() @ Vector((0.0, 0.0, 1.0))
        incl = math.degrees(math.atan2(-em_pe.y, em_pe.z))         # a borda de cima da anilha pra frente (+) da vertical
        f = medidas()
        return ("braço à frente %s° | elevação %s° | cotovelo %.1f/%.1f° | punho flexão %s° desvio %s° | palma pro meio %s° | "
                "anilha: meio %+.0f mm do ombro (altura) e %.0f mm à frente, %+.0f mm dos olhos, inclinada %.0f° | anilha × coxas %.0f, "
                "× tronco %.0f, × rosto %.0f, × cabelo %.0f, × antebraços %.0f, × braços %.0f mm | pele × anilha (mm, − = entra) %s | "
                "mão × mão %.0f, × coxas %.0f, × tronco %.0f mm | pegada %.2f | joelhos %.0f/%.0f°" % (
                    "/".join("%.0f" % v for v in tc.braco_frente(jj)), "/".join("%.0f" % v for v in tc.braco_elevacao(jj)),
                    juntas["cotoveloE"], juntas["cotoveloD"], "/".join("%.0f" % v for v in tc.punho_flexao(jj)),
                    "/".join("%.0f" % v for v in tc.punho_desvio(jj)), "/".join("%.0f" % v for v in tc.palma_dentro(jj)),
                    (meio.z - Sm.z) * 1000, (Sm.y - meio.y) * 1000, (meio.z - olhos) * 1000, incl, f["coxas"], f["tronco"],
                    f["rosto"], f["cabelo"], f["antebracos"], f["bracos"],
                    " ".join("%s %+.1f" % (k, v) for k, v in f.items() if k.split()[0] in ("palma", "dedos", "polegar")),
                    f["mão×mão"], f["mão×coxa"], f["mão×tronco"], tc.pegada_largura(jj)[0], juntas["joelhoE"], juntas["joelhoD"]))

    for t in (1.0, 0.5, 0.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [("Left", ck.Barra(an.pegadores[1], an.raio, an.meia)), ("Right", ck.Barra(an.pegadores[-1], an.raio, an.meia))]
    return Cena(pose, [an.raiz], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.3, 1.1),
                camera_video=((3.4, -2.6, 1.3), (0, -0.3, 1.05), 50), info=info)
