# Rosca Inversa com Barra — cena da fábrica 3D (lote 10, 11/10/2026; um dos 61 novos do scripts/conteudo/novos_61.json: 0 usos nos
# treinos prontos, 6 como troca equivalente). Sem peça nova: a barra curta de rosca da Rosca Direta com Barra (e3.barra, eixo de 29 mm).
# t = 0 em pé, os braços quase esticados e a barra segura POR CIMA (pegada pronada: as palmas viradas pro corpo e o dorso da mão pra
# frente), na largura dos ombros, na frente das coxas · t = 1 os cotovelos dobrados, a barra na altura dos ombros, na frente deles, com
# as palmas viradas pra frente. O app faz a volta (desce até quase esticar de novo).
# Técnica (as fontes, com a frase exata, ficam na ficha):
#   • ExRx, Barbell Reverse Curl (no diretório do braquiorradial): "Grasp bar with shoulder width overhand grip." / "With elbows to
#     side, raise bar until forearms are vertical. Lower until arms are fully extended. Repeat." / "When elbows are fully flexed, they
#     can travel forward slightly, allowing forearms to be no more than vertical."
#   • ACE, Reverse Bicep Curl: "Hold the barbell about shoulder-width apart with the palms facing down and hands in a straight line
#     with shoulders and elbows. Lift the bar towards the shoulders while bending at the elbows and keeping them down close to the
#     sides of the body. Slowly lower the weight to return to the starting position."
#   • free-exercise-db, Reverse Barbell Curl (o "fonte_en" do catálogo): "Stand up with your torso upright while holding a barbell at
#     shoulder width with the elbows close to the torso. The palm of your hands should be facing down (pronated grip)." / "While
#     holding the upper arms stationary, curl the weights [...] Only the forearms should move. Continue the movement until [...] the
#     bar is at shoulder level."
#   • Yessis, Reverse Biceps Curl: "Assume a well-balanced standing position with your feet approximately shoulder-width apart. Hold a
#     barbell with a pronated grip (palms facing down, toward the rear) and with the hands shoulder-width apart." / "Your arms should
#     hang down straight but not locked and your trunk should be erect with the shoulders back." / "Hold the upper arms in place so
#     that the elbows remain alongside the body as you raise the weights." / "maintain the hand in line with the forearm throughout
#     execution. Do not allow the wrist to flex."
#   • NSCA Coach 7.4 (a rosca com barra supinada; não achei texto aberto da NSCA com a pronada): "stand with feet shoulder-width apart,
#     knees slightly flexed" / "squeeze your shoulder blades together and push your chest out" / "Hold the upper arms close to the ribs
#     and do not let them move forward."
# Montagem (a da Rosca Direta com Barra, aprovada em 03/10/2026, com a pegada virada): em pé na pose de repouso (pés chapados na largura
# dos ombros, joelhos soltos), as escápulas um pouco pra trás (RETRAI). Braço e antebraço calculados (ALFA, TETA): o cotovelo um pouco
# pra fora do ombro (LARG_COT, junto do tronco) e o punho na largura da pegada (PEGADA, barra rígida); o braço fica parado em ALFA[0]
# até o antebraço passar de VOLTA_TOPO graus da vertical e só então vai um pouco à frente, até ALFA[1] em cima (ExRx: "When elbows are
# fully flexed, they can travel forward slightly"), como na Rosca Direta com Halteres. O antebraço gira em volta do próprio eixo pra
# palma ficar do lado CONTRÁRIO ao que ele sobe (pronada: virada pro corpo embaixo, pro chão no meio e pra frente em cima). A mão fica
# na linha do antebraço (o punho do repouso, reto) e fecha UMA vez na barra (dedos + polegar dando a volta, pg.usar_polegar("volta")):
# depois disso a mão e a barra andam presas no antebraço — a mão não escorrega na barra e o polegar não salta entre os quadros. A
# barra fica no vão das 2 mãos (o ponto da mão de referência guardado no osso de cada mão).
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
ALFA = (8.0, 16.0)        # braço (ombro → cotovelo) à frente da vertical, graus: parado embaixo, um pouco à frente em cima (o mesmo
                          # da Rosca Direta com Barra/Halteres)
TETA_MIN = 18.0           # antebraço (cotovelo → punho) à frente da vertical embaixo, graus: o de verdade (TETA0) é o 1º, daqui pra
                          # cima, em que a barra fica FOLGA_COXA na frente das coxas (com a pegada pronada a barra fica do lado da palma,
                          # virada pras coxas: o braço todo esticado a punha dentro delas)
FOLGA_COXA = 0.008        # embaixo a barra para 8 mm na frente das coxas (a checagem pede ≥ 3 mm de qualquer peça até o corpo)
TETA_MAX = 150.0          # antebraço em cima, graus da vertical: o de verdade (TETA1) é o maior, daqui pra baixo, em que a pele do
                          # antebraço não entra na do braço além do vinco (ck.corpo_x_corpo ≤ PELE_MAX); com a pronada o lado do
                          # antebraço que fica de frente pro bíceps é outro e ele chega antes que na Rosca Direta com Barra (133°)
PELE_MAX = 1.0            # mm: antebraço × braço fora do vinco do cotovelo (a checagem falha com 2 mm, ck.PENETRA_MM)
VOLTA_TOPO = 95.0         # o braço só sai de ALFA[0] depois que o antebraço passa dessa inclinação (graus da vertical)
LARG_COT = 0.03           # cotovelo 3 cm pra fora do ombro (encostado no tronco), como na Rosca Direta com Barra
PEGADA = 0.235            # meia distância entre os punhos: na largura dos ombros (a mesma da Rosca Direta com Barra)
RETRAI = 4.0              # escápulas um pouco pra trás (graus de giro da clavícula; Yessis "with the shoulders back")
RAIO = 0.0145             # eixo da barra de 29 mm (e3.barra): a mão de referência padrão (sem usar_cilindro)
COMPR_BARRA, R_ANILHA, L_ANILHA, PEGADA_BARRA = 1.25, 0.14, 0.035, 0.95   # a barra curta de rosca da Rosca Direta com Barra
X = Vector((1.0, 0.0, 0.0))


def _ss(x):
    """Rampa suave 0 → 1 (smoothstep) com x preso em [0, 1]."""
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


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


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta na barra (exercícios novos, 05/10/2026); barra de 29 mm = mão padrão
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    for L, _ in LADOS:                 # pés chapados (a pose de repouso já é em pé, pés na largura dos ombros, joelhos soltos)
        p3.travar_rotacao(rig, L + "Foot")

    # ── 1) escápulas um pouco pra trás, paradas o movimento todo (Yessis: "with the shoulders back") ─────────────────────────────
    cima0 = (cab("Neck") - cab("Hips")).normalized()
    ombro_antes = cab("LeftArm")
    for L, s in LADOS:
        p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * RETRAI), 3, cima0))
    print("ESCÁPULAS | retração %.0f° | ombro E andou %.1f mm pra trás" % (RETRAI, (cab("LeftArm") - ombro_antes).y * 1000), flush=True)

    # ── 2) braços: IK até o punho calculado (cotovelo junto do tronco, punho na largura da pegada) ─────────────────────────────────
    punhos, polos, iks = {}, {}, {}
    for L, _ in LADOS:                 # alvos nascem no punho de repouso (alvo = polo dá NaN)
        punhos[L] = p3.vazio("punho_" + L, p3.ponta(rig, L + "ForeArm"))
        polos[L] = p3.vazio("polo_cotovelo_" + L, cab(L + "ForeArm") + Vector((0, 0.6, 0)))
        iks[L] = p3.ik(rig, L + "ForeArm", punhos[L], polos[L])
    S = {L: cab(L + "Arm") for L, _ in LADOS}
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length       # braço
    La = (cab("LeftHand") - cab("LeftForeArm")).length      # antebraço
    barra = e3.barra("barra", comprimento=COMPR_BARRA, raio_anilha=R_ANILHA, larg_anilha=L_ANILHA, pegada=PEGADA_BARRA)
    for o in barra.children:           # o eixo de 1,25 m em anéis (mesma forma e nomes), como na Rosca Scott com Barra: a checagem
        if o.name == "barra_eixo":     # espalhava pontos demais nos triângulos compridos dele
            e3._em_aneis(o)
    estado = {"giro": {}, "cot": {}, "twist": {}}
    par = {"teta0": TETA_MIN, "teta1": TETA_MAX}     # sai das buscas do passo 4

    def _teta(t):
        return p3.lerp(par["teta0"], par["teta1"], t)

    def _topo(teta_g):
        """0 até o antebraço passar de VOLTA_TOPO graus da vertical, 1 em cima (suave nas 2 pontas)."""
        return _ss((teta_g - VOLTA_TOPO) / (par["teta1"] - VOLTA_TOPO))

    def _alvos(t):
        """Alvos do IK: cotovelo e punho calculados (braço e antebraço com o comprimento exato)."""
        teta_g = _teta(t)
        teta = math.radians(teta_g)
        alfa = math.radians(p3.lerp(*ALFA, _topo(teta_g)))
        cots = {}
        for L, s in LADOS:
            E = S[L] + Vector((s * LARG_COT, -math.sin(alfa) * Lb, -math.cos(alfa) * Lb)).normalized() * Lb
            dx = s * PEGADA - E.x
            rho = math.sqrt(La ** 2 - dx ** 2)
            W = E + Vector((dx, -math.sin(teta) * rho, -math.cos(teta) * rho))
            iks[L].mute = False
            punhos[L].location = W
            eixo = (W - S[L]).normalized()
            fora = (E - S[L]) - eixo * (E - S[L]).dot(eixo)
            polos[L].location = E + fora.normalized() * 0.4
            cots[L] = E
        p3.atualizar()
        return teta, cots

    def _braco(t):
        """Braço e antebraço no quadro t (IK congelado em FK) e o antebraço girado pra pegada pronada."""
        teta, cots = _alvos(t)
        for L, _ in LADOS:
            nomes = (L + "Arm", L + "ForeArm")
            mats = [PB[p3.P + n].matrix.copy() for n in nomes]
            iks[L].mute = True
            for n, M in zip(nomes, mats):
                PB[p3.P + n].matrix = M
                p3.atualizar()
            # pronação: a palma vira pro lado CONTRÁRIO ao que o antebraço sobe (pro corpo embaixo, pra frente em cima)
            f0, f1 = cab(L + "ForeArm"), cab(L + "Hand")
            ax = (f1 - f0).normalized()
            quer = Vector((0.0, math.cos(teta), -math.sin(teta)))
            quer = (quer - ax * quer.dot(ax)).normalized()
            tem = pg._base(rig, L)[0]
            tem = (tem - ax * tem.dot(ax)).normalized()
            ang = math.atan2(tem.cross(quer).dot(ax), tem.dot(quer))
            p3.girar_osso(rig, L + "ForeArm", Matrix.Rotation(ang, 3, ax))
            estado["giro"][L] = math.degrees(ang)
            estado["cot"][L] = (cab(L + "ForeArm") - cots[L]).length
            estado["twist"][L] = math.degrees(PB[p3.P + L + "ForeArm"].matrix_basis.to_quaternion().to_swing_twist("Y")[1])
        return teta

    furo = {}

    def _barra_nas_maos():
        g = {L: p3.mundo_osso(rig, L + "Hand") @ furo[L] for L, _ in LADOS}
        eixo_b = (g["Left"] - g["Right"]).normalized()
        barra.rotation_mode = "QUATERNION"
        barra.rotation_quaternion = X.rotation_difference(eixo_b)
        barra.location = (g["Left"] + g["Right"]) / 2
        p3.atualizar()
        return g, eixo_b

    def pose(t):
        """t=0 braços quase esticados (barra na frente das coxas), t=1 cotovelos dobrados (barra na altura dos ombros)."""
        _braco(t)
        _barra_nas_maos()
        estado["t"] = t

    _alvos(0.5)                         # polo certo do cotovelo no meio do movimento
    for L, _ in LADOS:
        e = p3.acertar_polo(rig, iks[L], L + "ForeArm", L + "Arm", L + "Hand")
        print("polo cotovelo", L, "erro %.3f ang %d" % e, flush=True)

    # ── 3) as 2 mãos fecham UMA vez na barra (no meio do movimento, longe do corpo): o vão da mão de referência fica guardado no osso
    #    da mão; como a mão anda presa no antebraço (punho reto o movimento todo), a pegada é a mesma em todos os quadros ─────────────
    _braco(0.5)
    for L, _ in LADOS:
        pg.mao_de_referencia(rig, L)
    for L, _ in LADOS:
        g, env = pg.ponto_na_mao(bon, L, RAIO)
        furo[L] = p3.mundo_osso(rig, L + "Hand").inverted() @ g
    g, eixo_b = _barra_nas_maos()
    dedos = {}
    for L, _ in LADOS:
        dedos[L] = pg.fechar_em_volta(bon, L, barra.location, eixo_b, RAIO)
    pol = {L: dedos[L].get("Thumb") for L, _ in LADOS}
    print("MÃOS | vão a vão %.1f mm | vão no osso da mão E (%.4f %.4f %.4f) D (%.4f %.4f %.4f) | dedos E %s | D %s | polegar E %s | D %s" % (
        (g["Left"] - g["Right"]).length * 1000, *furo["Left"], *furo["Right"],
        {k: v for k, v in dedos["Left"].items() if k != "Thumb"}, {k: v for k, v in dedos["Right"].items() if k != "Thumb"},
        pol["Left"], pol["Right"]), flush=True)

    # ── 4) até onde o cotovelo estica embaixo e dobra em cima ─────────────────────────────────────────────────────────────────────
    pecas = {o.name: o for o in barra.children if o.type == "MESH"}
    M0i = np.array(barra.matrix_world.inverted())
    pts = np.concatenate([ck._amostras(*ck._avaliar_simples(pecas["barra_eixo"]), 0.01)] + [
        ck._avaliar_simples(o)[0] for nm, o in pecas.items() if nm != "barra_eixo"])
    pts_loc = pts @ M0i[:3, :3].T + M0i[:3, 3]           # pontos da barra no referencial dela

    def folga_barra_corpo():
        """Menor distância com sinal (m) da barra (todas as peças) até o corpo sem as mãos — o que a checagem mede (peso × corpo)."""
        co, tri, (nomes, dono) = _malha(bon)
        mao = np.array([n.startswith(("LeftHand", "RightHand")) for n in nomes] + [False])[dono]
        bvh = _bvh(co, tri[~mao[tri].any(axis=1)])
        Mb = np.array(barra.matrix_world)
        return _com_sinal(bvh, pts_loc @ Mb[:3, :3].T + Mb[:3, 3], 0.2)

    #    embaixo: o antebraço desce de TETA_MIN pra cima até a barra ficar FOLGA_COXA na frente das coxas
    par["teta0"] = TETA_MIN
    while True:
        _braco(0.0)
        _barra_nas_maos()
        fb = folga_barra_corpo()
        if fb >= FOLGA_COXA or par["teta0"] >= 40.0:
            break
        par["teta0"] += 0.5
    print("EMBAIXO | antebraço a %.1f° da vertical (cotovelo %.1f°) | barra a %.1f mm do corpo" % (
        par["teta0"], ck.medir_juntas(rig)["cotoveloE"], fb * 1000), flush=True)

    #    em cima: o antebraço sobe de TETA_MAX pra baixo até a pele dele não entrar na do braço além do vinco (PELE_MAX)
    par["teta1"] = TETA_MAX
    while True:
        _braco(1.0)
        co, tri, (nomes, dono) = _malha(bon)
        ck.posicoes_das_juntas(rig)
        cxc = ck.corpo_x_corpo(co, tri, nomes, dono)[0]
        pele = max(cxc.get("antebracoE×bracoE", 0.0), cxc.get("antebracoD×bracoD", 0.0))
        if pele <= PELE_MAX or par["teta1"] <= 120.0:
            break
        par["teta1"] -= 0.5
    print("EM CIMA | antebraço a %.1f° da vertical (cotovelo %.1f°) | antebraço × braço fora do vinco %.1f mm" % (
        par["teta1"], ck.medir_juntas(rig)["cotoveloE"], pele), flush=True)

    # ── 5) medidas à parte (a checagem ignora o que fica DENTRO da mão) ─────────────────────────────────────────────────────────────

    def folgas_extra():
        """Folgas (mm, até 300): barra × coxas, × tronco, × rosto/pescoço, × antebraços e × cabelo; mão × eixo da barra fora da pegada
        (a pele a mais de 3,5 cm do meio da mão, ao longo da barra); mãos × travas, miolos e anilhas; mãos × peito, ombros, pescoço e
        rosto (+ cabelo); mãos × coxas."""
        co, tri, (nomes, dono) = _malha(bon)
        Mb = np.array(barra.matrix_world)
        pb = pts_loc @ Mb[:3, :3].T + Mb[:3, 3]
        out = {}
        for chave, partes in (("coxas", ("LeftUpLeg", "RightUpLeg")), ("tronco", ("Hips", "Spine", "Spine1", "Spine2")),
                              ("rosto", ("Head", "Neck")), ("antebracos", ("LeftForeArm", "RightForeArm"))):
            m = _grupo(nomes, dono, partes)
            out[chave] = _menor(_bvh(co, tri[m[tri].all(axis=1)]), pb[::2], 0.30) * 1000
        bvh_cabelo = ck._bvh(*ck._avaliar_simples(bon.cabelo))
        out["cabelo"] = _menor(bvh_cabelo, pb[::2], 0.30) * 1000
        M = barra.matrix_world
        c0, ux = np.array(M.to_translation()), np.array((M.to_3x3() @ X).normalized())
        m_peito = _grupo(nomes, dono, ("Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder"))
        bvh_peito = _bvh(co, tri[m_peito[tri].all(axis=1)])
        m_coxa = _grupo(nomes, dono, ("LeftUpLeg", "RightUpLeg", "Hips"))
        bvh_coxa = _bvh(co, tri[m_coxa[tri].all(axis=1)])
        fora, travas, peito, cabelo, coxa = [], [], [], [], []
        for L, s in LADOS:
            mv = co[np.array([nm.startswith(L + "Hand") for nm in nomes] + [False])[dono]]
            d = mv - c0
            a = d @ ux
            rad = np.linalg.norm(d - np.outer(a, ux), axis=1) - RAIO
            a_c = float(np.median(a[rad < 0.01])) if (rad < 0.01).any() else 0.0
            longe = np.abs(a - a_c) > 0.035                # as beiradas da mão (lado do indicador e do mínimo)
            fora.append(float(rad[longe].min()) * 1000 if longe.any() else 9e3)
            tv = [ck._avaliar_simples(pecas["barra_%s%+d" % (k, s)]) for k in ("trava", "anilha", "miolo")]
            travas.append(min(_com_sinal(_bvh(*t_), mv[::2]) for t_ in tv) * 1000)
            peito.append(_com_sinal(bvh_peito, mv[::2]) * 1000)
            cabelo.append(_menor(bvh_cabelo, mv[::3], 0.30) * 1000)
            coxa.append(_com_sinal(bvh_coxa, mv[::2]) * 1000)
        out.update(fora=fora, travas=travas, peito=peito, cabelo_mao=cabelo, coxa_mao=coxa)
        return out

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        bc = barra.matrix_world.to_translation()
        Sm = (S["Left"] + S["Right"]) / 2
        f = folgas_extra()
        return ("cotovelo %.1f/%.1f° | braço à frente %s° | antebraço %s° da vertical | palma × frente %s° | palma pro meio %s° | punho "
                "%s° | desvio %s° | pegada %.2f | barra %.0f mm acima e %.0f mm à frente dos ombros | barra × coxas %.0f, × tronco %.0f, "
                "× rosto/pescoço %.0f, × antebraços %.0f, × cabelo %.0f mm | mão × barra fora da pegada E %.1f D %.1f mm | mão × "
                "travas/anilhas E %.0f D %.0f mm | mão × peito/ombros/rosto E %.0f D %.0f mm, × cabelo E %.0f D %.0f mm | mão × coxas "
                "E %.0f D %.0f mm | giro do antebraço E %.0f D %.0f° (rel. repouso E %.0f D %.0f°) | cotovelo fora do alvo E %.1f D %.1f mm"
                % (juntas["cotoveloE"], juntas["cotoveloD"], "/".join("%.0f" % v for v in tc.braco_frente(jj)),
                   "/".join("%.0f" % v for v in tc.antebraco_vertical(jj)), "/".join("%.0f" % v for v in tc.palma_frente(jj)),
                   "/".join("%.0f" % v for v in tc.palma_dentro(jj)), "/".join("%.0f" % v for v in tc.punho_flexao(jj)),
                   "/".join("%.0f" % v for v in tc.punho_desvio(jj)), tc.pegada_largura(jj)[0], (bc.z - Sm.z) * 1000,
                   (Sm.y - bc.y) * 1000, f["coxas"], f["tronco"], f["rosto"], f["antebracos"], f["cabelo"], *f["fora"], *f["travas"],
                   *f["peito"], *f["cabelo_mao"], *f["coxa_mao"], estado["giro"]["Left"], estado["giro"]["Right"],
                   estado["twist"]["Left"], estado["twist"]["Right"], estado["cot"]["Left"] * 1000, estado["cot"]["Right"] * 1000))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    bk = ck.Barra(barra, raio=RAIO, meio_compr=COMPR_BARRA / 2)
    return Cena(pose, [barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0, foco_luz=(0, 0, 1.0),
                camera_video=((2.7, -4.0, 1.25), (0, 0, 1.0), 50), info=info)
