# Encolhimento com Barra — cena da fábrica 3D (lote 12, 11/10/2026; um dos 61 novos do scripts/conteudo/novos_61.json: 0 usos nos
# treinos prontos, 3 como troca equivalente; "fonte_en": "Barbell Shrug"). Sem peça nova: a barra olímpica LONGA do Levantamento Terra
# (e3.barra, eixo de 29 mm, 1,32 m entre as travas, anilhas de 45 cm), a barra das fotos das 3 fontes (free-exercise-db, ExRx, ACE).
# t = 0 em pé, os ombros relaxados embaixo, os braços esticados e a barra segura POR CIMA (pegada pronada: as palmas viradas pras coxas),
# um pouco mais aberta que os ombros (as mãos logo por fora das coxas), na frente das coxas, quase encostando nelas · t = 1 os ombros
# encolhidos em cima (a linha do ombro na horizontal), os cotovelos ainda esticados e a barra subiu junto, raspando nas coxas. O app faz
# a volta (desce devagar até os ombros voltarem embaixo).
# Técnica (as fontes, com a frase exata, ficam na ficha):
#   • free-exercise-db, Barbell Shrug (o "fonte_en"): "Stand up straight with your feet at shoulder width as you hold a barbell with both
#     hands in front of you using a pronated grip (palms facing the thighs). Tip: Your hands should be a little wider than shoulder width
#     apart." / "Raise your shoulders up as far as you can go as you breathe out and hold the contraction for a second. Tip: Refrain from
#     trying to lift the barbell by using your biceps." / "Slowly return to the starting position as you breathe in."
#   • ExRx, Barbell Shrug: "Stand holding barbell with overhand or mixed grip; shoulder width or slightly wider." / "Elevate shoulders as
#     high as possible. Lower and repeat." / "raising shoulders until slope of shoulders becomes horizontal may be considered adequate";
#     Exercise Errors: "Rolling (horizontal movement) is nonsensical" / "It's only necessary to raise and lower the shoulders during shrugs".
#   • ACE, Shrug (barra): "Hold a barbell with a palms-down grip with the hands about shoulder-width apart. Keep the knees slightly bent,
#     the hips straight, and the back tall, and raise the shoulders directly upwards to the ears as high as possible, lowering slowly to
#     the original starting position. (Tip: ... focus on only raising/lowering the shoulders - DO NOT roll the shoulders.)"
#   • Yessis, The Barbbell Shrug: "feet in line with one another and approximately shoulder-width apart" / "Your head should be directly
#     above the shoulders in good spinal alignment and your vision focused directly in front." / "Keep the shoulders back and the chest
#     out as much as possible." / "Hold a barbell with extended arms and with the hands slightly wider than hip-width apart. The bar should
#     rest against your thighs." / "There should be no bending in the elbow as you raise the shoulders."
#   • Peeters et al. (JSES Int 2023;7(1):147-152, online em 2022): "Shrug caused a large clavicular elevation of 25° (SD 5°)".
# Montagem: o corpo fica na pose de repouso (em pé, pés na largura dos ombros e paralelos, joelhos soltos ~7°, tronco e cabeça parados).
# A cintura escapular é a do Encolhimento com Halteres (lote 2, aprovado): o osso Shoulder do Mixamo gira ELEVA graus em volta do eixo
# frente-trás e o ombro sobe RETO (o que sobra de lado vira deslize da base do osso); aqui as escápulas ficam um pouco pra trás o tempo
# todo (RETRAI, parado — Yessis "Keep the shoulders back"), sem andar pra frente nem pra trás na subida (o ombro não rola). Braços e mãos
# são os do fim do Levantamento Terra (lote 7, aprovado): as 2 mãos fecham na barra com a pegada pronada (maos3d.Maos.segurar, polegar
# novo dando a volta numa postura fixa por mão, tirada da própria busca), a barra fica rente às coxas — a pele medida na malha, FOLGA da
# superfície da barra — e pendurada nos braços esticados (o alcance ombro → vão da mão de cada lado sai de uma bissecção no montar(),
# até o cotovelo dar COTOVELO graus). Quando os ombros sobem, a barra sobe o mesmo tanto e acompanha a frente das coxas (que recua um
# pouco subindo pro quadril): sobe 6 cm e vai ~2 cm pra trás, sempre a 6 mm delas.
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
from agachamento_no_smith import _polegar_nos_angulos   # polegar novo numa postura anatômica dada (o Afundo com Barra usa)

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X); o boneco olha pra −Y

# ── barra ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
RAIO_BARRA = 0.0145        # eixo de 29 mm (IPF: 28–29 mm): a mão de referência padrão (sem usar_cilindro)
R_ANILHA = 0.225           # anilha de 45 cm (IWF 450 ± 1 mm; IPF ≤ 45 cm), a do Levantamento Terra
FOLGA = 0.006              # pele das coxas → superfície da barra (m): rente, sem encostar (a checagem pede ≥ 3 mm; Yessis "The bar
                           # should rest against your thighs")

# ── cintura escapular ──────────────────────────────────────────────────────────────────────────────────────────────────────────
ELEVA = (0.0, 25.0)        # elevação da clavícula, graus: repouso → encolhido (Peeters et al.: 25°, DP 5°; no boneco, 25° deixam a linha
                           # do ombro na horizontal, o critério do ExRx) — o mesmo do Encolhimento com Halteres
EIXO_ELEVA = Vector((0.0, 1.0, 0.0))   # frente-trás do corpo: girar aqui só sobe/desce o ombro
RETRAI = 3.0               # escápulas um pouco pra trás, paradas o movimento todo (graus de giro da clavícula em volta do eixo do
                           # tronco; Yessis "Keep the shoulders back and the chest out as much as possible")

# ── pegada ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
GRIP_X = 0.28              # meio da mão a 28 cm do meio: 56 cm entre as mãos, logo por fora das coxas (o do Levantamento Terra;
                           # free-exercise-db "a little wider than shoulder width"; ExRx "shoulder width or slightly wider")
PALMA_Q = Vector((0, 1, 0))      # pegada pronada: palma virada pro corpo (pras coxas)
DEDOS_Q = Vector((0, 0, -1))
COTOVELO = 6.0             # flexão do cotovelo (graus) no meio do movimento: esticado sem travar (o mesmo do Encolhimento com
                           # Halteres; Yessis "There should be no bending in the elbow"). O alcance ombro → vão da mão de CADA braço sai
                           # de uma bissecção no montar(): o braço direito do boneco alcança ~3 mm a mais que o esquerdo, então cada mão
                           # fica na sua altura e a barra inclina ~0,3° (invisível) — com a barra na horizontal o direito ficava 4° mais
                           # dobrado que o esquerdo e passava de 12°
T_CAL = 0.5                # quadro da calibração (no meio: o cotovelo varia ~1° pra cada lado no movimento)


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta na barra (exercícios novos, 05/10/2026); barra de 29 mm = mão padrão
    rig = bon.rig
    PB = rig.pose.bones

    def c(n):
        return p3.cabeca(rig, n)

    for L, _ in LADOS:                 # pés chapados (a pose de repouso já é em pé, pés na largura dos ombros, joelhos soltos)
        p3.travar_rotacao(rig, L + "Foot")

    # ── pele das coxas (paradas o movimento todo): os triângulos sem mãos e braços, pra achar a frente delas em cada altura ──────
    co0, tri0, (nomes0, dono0) = ck._avaliar(bon.corpo, 1)
    sem = np.array([n.startswith(("LeftHand", "RightHand")) or n in ("LeftArm", "RightArm", "LeftForeArm", "RightForeArm")
                    for n in nomes0] + [False])[dono0]
    V0 = co0[tri0[~sem[tri0].any(axis=1)]]                     # (n, 3 vértices, xyz)

    def y_encostada(z, k=0.0):
        """y do eixo da barra o mais perto do corpo com a pele a RAIO_BARRA + FOLGA dele, com o eixo na altura z no meio (x = 0) e
        inclinado k (dz/dx) — nos TRIÂNGULOS da malha (as bordas de cada um amostradas a cada 1/32), como o Levantamento Terra."""
        r = RAIO_BARRA + FOLGA
        zs = V0[:, :, 2]
        V = V0[(zs.min(axis=1) < z + r + 0.01) & (zs.max(axis=1) > z - r - 0.01)]
        u = np.linspace(0.0, 1.0, 33)[:, None, None]
        P = np.concatenate([(V[:, j] + u * (V[:, (j + 1) % 3] - V[:, j])).reshape(-1, 3) for j in range(3)])
        dz = P[:, 2] - (z + k * P[:, 0])
        perto = np.abs(dz) < r
        return float(np.min(P[perto, 1] - np.sqrt(r * r - dz[perto] ** 2)))

    # ── cintura escapular: escápulas um pouco pra trás (paradas) e o ombro subindo reto ─────────────────────────────────────────
    cima0 = (c("Neck") - c("Hips")).normalized()

    def _retrair():
        for L, _ in LADOS:
            PB[p3.P + L + "Shoulder"].matrix_basis = Matrix.Identity(4)
        p3.atualizar()
        for L, s in LADOS:
            p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * RETRAI), 3, cima0))

    ombro_rep = {L: c(L + "Arm") for L, _ in LADOS}
    _retrair()
    ombro0 = {L: c(L + "Arm") for L, _ in LADOS}             # articulação do ombro com as escápulas pra trás, embaixo
    print("ESCÁPULAS | retração %.0f° | ombro E andou %.1f mm pra trás, D %.1f mm" % (
        RETRAI, (ombro0["Left"] - ombro_rep["Left"]).y * 1000, (ombro0["Right"] - ombro_rep["Right"]).y * 1000), flush=True)

    def _ombros(t):
        """Escápulas pra trás (RETRAI) e a clavícula sobe ELEVA graus em volta do eixo frente-trás, com o ombro subindo RETO: o osso
        do boneco vai da base do pescoço ao centro da articulação (caído ~26°), então só girar levava o ombro ~15 mm pra fora; o que
        sobra de lado vira deslize da base do osso (o jeito do Encolhimento com Halteres)."""
        _retrair()
        g = p3.lerp(*ELEVA, t)
        for L, s in LADOS:
            if g:
                R = Matrix.Rotation(math.radians(-s * g), 3, EIXO_ELEVA)
                H = c(L + "Shoulder")
                girado = H + R @ (ombro0[L] - H)
                p3.girar_osso(rig, L + "Shoulder", R, mover=Vector((ombro0[L].x - girado.x, 0, 0)))

    # ── mãos na barra (o jeito do Levantamento Terra) ──────────────────────────────────────────────────────────────────────────
    maos = Maos(bon, RAIO_BARRA, polegar_modo="volta")
    braco = (c("LeftForeArm") - c("LeftArm")).length
    antebraco = (c("LeftHand") - c("LeftForeArm")).length
    alc = {L: braco + antebraco + maos.palma * 0.92 for L, _ in LADOS}   # 1º palpite: braço e mão em linha reta (longo demais)

    def lugar_da_barra():
        """Barra: y do eixo (rente às coxas) e a altura do vão de cada mão (z por lado), pendurada nos 2 ombros pelo alcance de cada
        braço (o vão de cada mão a GRIP_X do meio)."""
        S = {L: c(L + "Arm") for L, _ in LADOS}
        z = {L: S[L].z - alc[L] for L, _ in LADOS}
        y = None
        for _ in range(8):
            y_novo = y_encostada((z["Left"] + z["Right"]) / 2, (z["Left"] - z["Right"]) / (2 * GRIP_X))
            z = {L: S[L].z - math.sqrt(max(alc[L] ** 2 - (s * GRIP_X - S[L].x) ** 2 - (y_novo - S[L].y) ** 2, 1e-4))
                 for L, s in LADOS}
            if y is not None and abs(y_novo - y) < 1e-5:
                y = y_novo
                break
            y = y_novo
        return y, z

    def pegar(y, z):
        """As 2 mãos na barra (o eixo passando por (±GRIP_X, y, z[lado])); devolve quanto falta (m, ao longo do braço) pra cada mão
        chegar no vão (+ = falta: o braço já está todo esticado)."""
        falta = {}
        for L, s in LADOS:
            # a mão volta pro repouso (em relação ao antebraço) antes de cada pegada: o Maos.segurar gira o antebraço pela palma ATUAL
            # e o resto vai no punho, então o giro que sobrou no punho de uma chamada passava pra seguinte e ia aumentando quadro a
            # quadro (checar 24 de 11/10: a pele da base do polegar esticando de 2,37× a 2,66× do 1º ao último quadro, com a postura
            # do polegar fixa). Começando sempre da mão solta, o giro fica no antebraço (pronação) e a pegada é a mesma em todo quadro.
            PB[p3.P + L + "Hand"].matrix_basis = Matrix.Identity(4)
            p3.atualizar()
            S = c(L + "Arm")
            g = Vector((s * GRIP_X, y, z[L])) - PALMA_Q * 0.002   # vão 2 mm atrás do eixo (como no terra e no stiff)
            maos.segurar(L, g, DEDOS_Q, PALMA_Q, polo=S + Vector((s * 0.25, 0.5, 0.2)), alinhar=0.5)
            vao = p3.mundo_osso(rig, L + "Hand") @ maos.furo[L]
            falta[L] = (g - vao).dot((g - S).normalized())
        return falta

    def cotovelos():
        j = ck.medir_juntas(rig)
        return {"Left": j["cotoveloE"], "Right": j["cotoveloD"]}

    def calibrar(rotulo):
        """Alcance ombro → vão de cada braço no quadro T_CAL: 1º o do braço todo esticado (o que falta pra mão chegar), depois a
        bissecção até o cotovelo dar COTOVELO graus (mais alcance = barra mais baixa = cotovelo mais esticado)."""
        for _ in range(2):
            _ombros(T_CAL)
            y, z = lugar_da_barra()
            falta = pegar(y, z)
            for L, _ in LADOS:
                alc[L] -= falta[L]
        lo = {L: alc[L] - 0.010 for L, _ in LADOS}
        hi = {L: alc[L] + 0.001 for L, _ in LADOS}
        for _ in range(16):
            for L, _ in LADOS:
                alc[L] = (lo[L] + hi[L]) / 2
            _ombros(T_CAL)
            y, z = lugar_da_barra()
            pegar(y, z)
            cot = cotovelos()
            for L, _ in LADOS:
                if cot[L] > COTOVELO:
                    lo[L] = alc[L]
                else:
                    hi[L] = alc[L]
        for L, _ in LADOS:
            alc[L] = (lo[L] + hi[L]) / 2
        _ombros(T_CAL)
        y, z = lugar_da_barra()
        falta = pegar(y, z)
        cot = cotovelos()
        print("ALCANCE %s | E %.4f D %.4f m | cotovelo E %.1f D %.1f° | falta E %.1f D %.1f mm | barra y %.4f, vão E z %.4f D z %.4f"
              % (rotulo, alc["Left"], alc["Right"], cot["Left"], cot["Right"], falta["Left"] * 1000, falta["Right"] * 1000, y,
                 z["Left"], z["Right"]), flush=True)

    calibrar("1")

    barra = e3.barra("barra", comprimento=2.0, raio_anilha=R_ANILHA, pegada=1.32)
    barra.rotation_mode = "QUATERNION"
    for o in barra.children:           # o eixo de 2 m em anéis (mesma forma e nomes): a checagem espalhava pontos demais nos
        if o.name == "barra_eixo":     # triângulos compridos dele (como na Rosca Inversa e na Rosca Scott com Barra)
            e3._em_aneis(o)
    estado = {}
    X = Vector((1.0, 0.0, 0.0))

    def pose(t):
        """t=0 ombros relaxados embaixo, t=1 ombros encolhidos (a barra sobe junto, rente às coxas)."""
        _ombros(t)
        y, z = lugar_da_barra()
        subiu, f = 0.0, 0.0
        for volta in range(5):
            falta = pegar(y, z)
            f = max(falta.values())
            if f < 0.0002 or volta == 4:
                break
            for L, _ in LADOS:                               # a mão não chega: aquele lado da barra sobe o que falta
                if falta[L] > 0.0002:
                    S = c(L + "Arm")
                    dz = falta[L] / max(0.5, (S.z - z[L]) / alc[L])
                    z[L] += dz
                    subiu = max(subiu, dz)
            y = y_encostada((z["Left"] + z["Right"]) / 2, (z["Left"] - z["Right"]) / (2 * GRIP_X))
        gE, gD = Vector((GRIP_X, y, z["Left"])), Vector((-GRIP_X, y, z["Right"]))
        centro = (gE + gD) / 2
        eixo_b = (gE - gD).normalized()
        barra.rotation_quaternion = X.rotation_difference(eixo_b)
        barra.location = centro
        p3.atualizar()
        estado.update(barra=centro.copy(), inclina=math.degrees(math.asin(eixo_b.z)), subiu=subiu, falta=f, t=t)
        for L, _ in LADOS:                                   # dedos fecham até a pele encostar na barra; o polegar novo dá a volta
            if pose.polegar:                                 # nela na postura fixa (ver o montar(), no fim)
                pose.dedos[L] = pg.fechar_em_volta(bon, L, centro, eixo_b, RAIO_BARRA, polegar_modo="busca")
                _polegar_nos_angulos(bon, L, pose.polegar[L])
                pose.dedos[L]["Thumb"] = ("volta fixo",) + tuple(pose.polegar[L])
            else:                                            # (só no montar(): a busca do polegar novo, do zero)
                pose.dedos[L] = pg.fechar_em_volta(bon, L, centro, eixo_b, RAIO_BARRA)

    pose.dedos = {}
    pose.polegar = {}
    pose.estado = estado

    pose(T_CAL)                                        # polo certo do cotovelo no meio do movimento
    for L, _ in LADOS:
        maos.iks[L].mute = False
        e = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
        print("polo cotovelo", L, "erro %.3f ang %d" % e, flush=True)
    calibrar("2 (com o polo certo)")

    # ── polegar novo numa postura FIXA por mão, tirada da própria busca (pg.polegar_em_volta) no meio do movimento e repetida nos 25
    # quadros (a lição do Agachamento no Smith: a busca fica na beirada do viável — teto de 2,5× na pele da base — e, refeita quadro a
    # quadro, o polegar podia trocar de postura ou cair no polegar de hoje no meio do movimento). A mão e a barra quase não mudam de
    # jeito no movimento (só os ombros sobem), então a mesma postura serve em todos os quadros. Antes de zerar a mão em cada pegada
    # (pegar()), o giro acumulado no punho fazia a mão DIREITA não achar postura nenhuma (checar 4 v2/v3 de 11/10); se uma mão não
    # achar, ela usa a da outra (polegar3d: "a mão direita sai espelhada da esquerda sem trocar sinal nenhum").
    pose.dedos = {}
    pose(T_CAL)
    for L, _ in LADOS:
        th = pose.dedos[L].get("Thumb")
        if isinstance(th, tuple) and th and th[0] == "volta" and th[-1]:
            pose.polegar[L] = tuple(float(x) for x in th[1:7])
        print("POLEGAR busca %s: %s" % (L, th), flush=True)
    if not pose.polegar:
        raise RuntimeError("polegar novo sem postura viável nas 2 mãos")
    for L, _ in LADOS:
        if L not in pose.polegar:
            pose.polegar[L] = pose.polegar["Right" if L == "Left" else "Left"]
    print("POLEGAR fixo (CMC flex, abd, rot, MCP flex, abd, IP flex): E %s D %s" % (pose.polegar["Left"], pose.polegar["Right"]),
          flush=True)

    # ── medidas à parte (a checagem ignora o que fica DENTRO da mão) ───────────────────────────────────────────────────────────
    pecas = {o.name: o for o in barra.children if o.type == "MESH"}
    M0i = np.array(barra.matrix_world.inverted())
    pts = np.concatenate([ck._amostras(*ck._avaliar_simples(pecas["barra_eixo"]), 0.01)] + [
        ck._avaliar_simples(o)[0] for nm, o in pecas.items() if nm != "barra_eixo"])
    pts_loc = pts @ M0i[:3, :3].T + M0i[:3, 3]           # pontos da barra no referencial dela

    def _grupo(nomes, dono, partes):
        return np.array([n in partes for n in nomes] + [False])[dono]

    def _bvh(vs, ts):
        return BVHTree.FromPolygons([tuple(p) for p in vs], [tuple(t_) for t_ in ts], all_triangles=True)

    def _menor(bvh, pts_, lim):
        m = lim
        for p in pts_:
            r = bvh.find_nearest(Vector(p), lim)
            if r[0] is not None and r[3] < m:
                m = r[3]
        return m

    def _com_sinal(bvh, pts_, lim=0.5):
        menor = lim
        for p in pts_:
            v = Vector(p)
            loc, nor, _, d = bvh.find_nearest(v, lim)
            if loc is not None:
                menor = min(menor, -d if (d < 0.03 and (v - loc).dot(nor) < 0) else d)
        return menor

    X = Vector((1.0, 0.0, 0.0))

    def folgas_extra():
        """Folgas (mm, até 300): barra × coxas, × quadril/barriga, × antebraços; mão × eixo da barra fora da pegada (a pele a mais de
        3,5 cm do meio da mão, ao longo da barra); mãos × travas, miolos e anilhas; mãos × coxas/quadril."""
        co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        Mb = np.array(barra.matrix_world)
        pb = pts_loc @ Mb[:3, :3].T + Mb[:3, 3]
        out = {}
        for chave, partes in (("coxas", ("LeftUpLeg", "RightUpLeg")), ("quadril", ("Hips", "Spine")),
                              ("antebracos", ("LeftForeArm", "RightForeArm"))):
            m = _grupo(nomes, dono, partes)
            out[chave] = _menor(_bvh(co, tri[m[tri].all(axis=1)]), pb[::2], 0.30) * 1000
        M = barra.matrix_world
        c0, ux = np.array(M.to_translation()), np.array((M.to_3x3() @ X).normalized())
        m_coxa = _grupo(nomes, dono, ("LeftUpLeg", "RightUpLeg", "Hips"))
        bvh_coxa = _bvh(co, tri[m_coxa[tri].all(axis=1)])
        fora, travas, coxa = [], [], []
        for L, s in LADOS:
            mv = co[np.array([nm.startswith(L + "Hand") for nm in nomes] + [False])[dono]]
            d = mv - c0
            a = d @ ux
            rad = np.linalg.norm(d - np.outer(a, ux), axis=1) - RAIO_BARRA
            a_c = float(np.median(a[rad < 0.01])) if (rad < 0.01).any() else 0.0
            longe = np.abs(a - a_c) > 0.035                # as beiradas da mão (lado do indicador e do mínimo)
            fora.append(float(rad[longe].min()) * 1000 if longe.any() else 9e3)
            tv = [ck._avaliar_simples(pecas["barra_%s%+d" % (k, s)]) for k in ("trava", "anilha", "miolo")]
            travas.append(min(_com_sinal(_bvh(*t_), mv[::2]) for t_ in tv) * 1000)
            coxa.append(_com_sinal(bvh_coxa, mv[::2]) * 1000)
        pol = []
        for L, s in LADOS:                                  # pele do polegar × superfície da barra (− = dentro dela)
            mt = np.array([nm.startswith(L + "HandThumb") for nm in nomes] + [False])[dono]
            d = co[mt] - c0
            pol.append(float((np.linalg.norm(d - np.outer(d @ ux, ux), axis=1) - RAIO_BARRA).min()) * 1000)
        out.update(fora=fora, travas=travas, coxa_mao=coxa, polegar=pol)
        return out

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        b = estado.get("barra", Vector())
        f = folgas_extra()
        pb = {L: pg.pele_do_polegar(bon, L) for L, _ in LADOS}
        giro = {L: (math.degrees(PB[p3.P + L + "ForeArm"].matrix_basis.to_quaternion().to_swing_twist("Y")[1]),
                    math.degrees(PB[p3.P + L + "Hand"].matrix_basis.to_quaternion().to_swing_twist("Y")[1])) for L, _ in LADOS}
        txt = []
        for L, nome in (("Left", "E"), ("Right", "D")):
            S = c(L + "Arm")
            d = S - c(L + "Shoulder")
            txt.append("ombro %s sobe %+.0f mm (frente %+.1f mm, lado %+.1f mm), linha do ombro %.0f°" % (
                nome, (S.z - ombro0[L].z) * 1000, -(S.y - ombro0[L].y) * 1000, (S.x - ombro0[L].x) * 1000 * (1 if L == "Left" else -1),
                math.degrees(math.atan2(-d.z, math.hypot(d.x, d.y)))))
        return ("%s | cotovelo %.1f/%.1f° | braço à frente %s° | palma × frente %s° | punho %s° desvio %s° | pegada %.2f | barra y %+.4f "
                "z %.4f (inclina %.2f°, subiu %.1f mm, falta %.1f mm) | barra × coxas %.1f, × quadril %.1f, × antebraços %.0f mm | mão × barra fora da "
                "pegada E %.1f D %.1f mm | mão × travas/anilhas E %.0f D %.0f mm | mão × coxas E %.0f D %.0f mm | %s | polegar E %s D %s | "
                "polegar × barra E %.1f D %.1f mm | pele da base do polegar E %.2f× (%d do avesso) D %.2f× (%d do avesso) | giro do antebraço "
                "E %.0f D %.0f°, do punho E %.1f D %.1f°" % (
                    " | ".join(txt), juntas["cotoveloE"], juntas["cotoveloD"], "/".join("%.0f" % v for v in tc.braco_frente(jj)),
                    "/".join("%.0f" % v for v in tc.palma_frente(jj)), "/".join("%.0f" % v for v in tc.punho_flexao(jj)),
                    "/".join("%.0f" % v for v in tc.punho_desvio(jj)), tc.pegada_largura(jj)[0], b.y, b.z,
                    estado.get("inclina", 0), estado.get("subiu", 0) * 1000, estado.get("falta", 0) * 1000, f["coxas"], f["quadril"], f["antebracos"],
                    *f["fora"], *f["travas"], *f["coxa_mao"], maos.info(), pose.dedos.get("Left", {}).get("Thumb"),
                    pose.dedos.get("Right", {}).get("Thumb"), *f["polegar"], pb["Left"]["alonga_max"], pb["Left"]["viradas"],
                    pb["Right"]["alonga_max"], pb["Right"]["viradas"], giro["Left"][0], giro["Right"][0], giro["Left"][1],
                    giro["Right"][1]))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=1.0)
    return Cena(pose, [barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0, foco_luz=(0, 0, 1.1),
                camera_video=((2.5, 3.5, 1.55), (0, 0, 1.1), 50), info=info)
