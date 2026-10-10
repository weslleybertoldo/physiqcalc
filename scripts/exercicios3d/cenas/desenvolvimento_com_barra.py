# Desenvolvimento com Barra (sentado, pela frente) — cena da fábrica 3D (lote 9, 10/10/2026; 0 usos nos treinos prontos do app, 10
# vezes como troca equivalente). t = 0 barra embaixo, na frente do queixo · t = 1 braços estendidos acima da cabeça. O app faz a volta.
# SENTADO, pela fonte (as frases estão na ficha): o "Barbell Shoulder Press" do ExRx (o fonte_en do catálogo) é sentado ("Position seat
# so bar does not hit uprights"; o em pé é o "Barbell Military Press"); o shoulder press com barra da NSCA (Essentials, no resumo do
# CSCS) é "on a vertical shoulder press bench" com o corpo nos 5 pontos de apoio; o ACE tem os 2 ("Seated Shoulder Press", barra e
# banco, e "Standing Shoulder Press"). Encosto a 85° (quase em pé), como o Desenvolvimento com Halteres.
# Técnica: pegada pronada, um pouco mais aberta que os ombros (ExRx, NSCA, ACE); a barra desce na frente do rosto até a frente dos
# ombros e sobe até os braços estenderem em cima da cabeça; costas, glúteo e cabeça no banco e pés chapados (os 5 pontos da NSCA);
# cotovelos à frente e embaixo da barra (ACE: "keep the elbows pointed forward"; NSCA, Basics: "Keep elbows directly under hands
# throughout the entire lift"); punhos firmes (NSCA: "Keep the wrists stiff and the forearms parallel to each other").
# EMBAIXO a barra para na altura do queixo (ACE: "stopping when the bar is about chin-height"). O ExRx ("near upper chest") e a NSCA
# ("to touch the clavicles and anterior deltoids") descem mais, mas no boneco — braço de 25,4 cm, mais curto que o de uma pessoa da
# mesma altura — a barra nas clavículas pede o braço pendurado com o cotovelo a 138–141°, o antebraço 34–39° deitado e o punho
# dobrado 55–82° (sonda do rascunho, 10/10/2026); na altura do queixo o antebraço fica quase em pé (~8°) e o punho ~35°.
# CAMINHO DA BARRA: sobe reta na frente do rosto, a FOLGA_ROSTO da pele do queixo, da boca e do nariz (a linha sai da pele medida no
# montar()), e só passa pra cima da cabeça (pra trás) depois de passar da testa (a volta y = x**VOLTA fica quase toda na metade de
# cima) — a menor folga do caminho todo (rosto, pescoço, peito e cabelo) é medida no montar() em 400 pontos e impressa. A cabeça
# fica no encosto (5 pontos de apoio) com o pescoço um pouco estendido (o dt.inclinar estende até a nuca encostar; NSCA: "Extend the
# neck slightly so the bar can pass the face"). O info() de cada quadro traz as folgas que a checagem não mede: mão × barra fora da
# pegada, mão × trava/anilha, travas/anilhas × corpo e barra/anilhas × banco.
# Mãos: o vão de cada mão a MEIA do meio da barra, palma pra frente e pra cima com o punho estendido PUNHO graus (embaixo → em
# cima); o cotovelo vai pro ponto mais baixo que o braço deixa (antebraço o mais em pé possível: dt.polo_cotovelo_baixo).
import math
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import deitado3d as dt
from maos3d import Maos
from cena import Cena
from desenvolvimento_com_halteres import sentar_no_assento

RAIO_BARRA = 0.0145            # eixo de 29 mm (a e3.barra)
R_ANILHA = 0.20                # anilha de 0,40 m (a da e3.barra padrão, a dos supinos com barra)
ANGULO = 85                    # encosto, graus da horizontal (quase em pé), como o Desenvolvimento com Halteres
ASSENTO = 0.44                 # topo do assento (m); o sentar_no_assento do Desenvolvimento com Halteres usa o mesmo
MEIA = 0.30                    # vão de cada mão a 30 cm do meio: pegada "slightly wider than shoulder width" (~1,46× a distância
                               # entre as articulações dos ombros, 0,40 m no boneco)
DZ_QUEIXO = -0.008             # eixo da barra embaixo: 8 mm abaixo do ponto mais baixo do queixo (o topo da barra um pouco acima
                               # dele: "about chin-height", ACE)
FOLGA_ROSTO = 0.014            # pele do rosto (queixo, boca, nariz) → superfície da barra na subida (m)
FOLGA_MIN = 0.012              # a menor folga barra × pele/cabelo que o caminho todo tem que ter (m)
COTOVELO_CIMA = 6              # flexão do cotovelo em cima (graus): "until the elbows are fully extended" (NSCA), sem hiperestender
PUNHO = (24.0, 10.0)           # extensão do punho (graus: dedos inclinados pra trás da vertical) embaixo → em cima. Embaixo, sonda
                               # do rascunho (10/10/2026): 28 passava do limite do punho da ficha (−40/−41 medido; "Keep the wrists
                               # stiff", NSCA); 22 dobrava mais o cotovelo e o antebraço entrava 2,3 mm no braço fora do vinco;
                               # 24 com DZ_QUEIXO −8 mm: punho −34/−36, antebraço × braço 0,9/1,3 mm, cotovelo 135°
VOLTA = 4.0                    # forma da volta pra trás (y = x**VOLTA, x de 0 em z_a a 1 em cima): > 1 deixa a barra na frente do rosto
                               # por mais tempo e a volta pra cima da cabeça acontece na metade de cima, com o braço já alto (0 =
                               # smoothstep). Sonda do rascunho (10/10/2026), maior inclinação do antebraço no caminho: VOLTA 2 → 22°,
                               # 3 → 19,9°, 4 → 18,3°, 5 → 17,6° (a barra voltando cedo tira o cotovelo de baixo da mão no meio)


def montar(bon):
    pg.usar_polegar("volta")                       # polegar novo (dá a volta na barra), padrão dos exercícios novos
    rig = bon.rig
    c = lambda n: p3.cabeca(rig, n)
    junta_y = dt.inclinar(bon, ANGULO, ASSENTO)
    sentar_no_assento(bon, junta_y)
    banco = e3.banco_inclinado("banco", ANGULO, ASSENTO, junta_y)
    barra = e3.barra("barra", comprimento=2.0, raio_anilha=R_ANILHA, pegada=1.32)
    e3._em_aneis(bpy.data.objects["barra_eixo"])   # só a malha do eixo de 2 m em anéis (a forma não muda): checagem ~10× mais rápida
    maos = Maos(bon, RAIO_BARRA)
    S = {l: c(l + "Arm") for l, _ in dt.LADOS}
    Lb = (c("LeftForeArm") - c("LeftArm")).length       # braço
    La = (c("LeftHand") - c("LeftForeArm")).length      # antebraço

    # vão da mão (eixo da barra) no referencial da mão que o Maos.segurar alinha (dedos, palma, dedos × palma), a partir do punho:
    # com ele o punho de cada quadro sai sem mexer no Blender (o polo do cotovelo depende só do quadro, não do anterior)
    furo_loc = {}
    for lado, _ in dt.LADOS:
        pg.mao_de_referencia(rig, lado)
        W0 = c(lado + "Hand")
        y_m = (p3.ponta(rig, lado + "Hand") - W0).normalized()
        n_m = pg._base(rig, lado)[0]
        n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
        x_m = y_m.cross(n_m)
        g0 = p3.mundo_osso(rig, lado + "Hand") @ maos.furo[lado]
        furo_loc[lado] = Vector(((g0 - W0).dot(y_m), (g0 - W0).dot(n_m), (g0 - W0).dot(x_m)))

    PB = rig.pose.bones

    def segurar(lado, g, dq, pq):
        """Mão `lado` com o vão em g e o cotovelo no ponto mais baixo que o braço deixa. O IK do Blender parte da pose atual: o
        braço volta ao repouso antes (como no agachamento frontal), senão a solução de um quadro depende do anterior (com os braços
        em cima, a busca do Z1 deixava o braço direito virar pra cima no quadro de baixo)."""
        for nm in ("Arm", "ForeArm", "Hand"):
            PB[p3.P + lado + nm].matrix_basis = Matrix()
        p3.atualizar()
        W = punho_previsto(lado, g, dq, pq)
        maos.segurar(lado, g, dq, pq, polo=dt.polo_cotovelo_baixo(S[lado], W, Lb, La))

    def mao_dir(t):
        """Dedos e palma (mundo) no instante t: palma pra frente e pra cima, dedos pra cima e pra trás (punho estendido)."""
        k = math.radians(p3.lerp(PUNHO[0], PUNHO[1], t))
        return Vector((0.0, math.sin(k), math.cos(k))), Vector((0.0, -math.cos(k), math.sin(k)))

    def punho_previsto(lado, g, dq, pq):
        f = furo_loc[lado]
        return g - dq * f.x - pq * f.y - dq.cross(pq) * f.z

    # ── pele que a barra não pode encostar: rosto, pescoço, peito (|x| < 0,22: fora braços e mãos) e o cabelo ───────────────────
    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    m_rosto = np.array([n in ("Head", "Neck") for n in nomes] + [False])[dono]
    m_peito = np.array([n in ("Spine2", "Spine1", "LeftShoulder", "RightShoulder") for n in nomes] + [False])[dono]
    rosto = co[m_rosto & (np.abs(co[:, 0]) < 0.22)]
    peito = co[m_peito & (np.abs(co[:, 0]) < 0.22)]
    cab_co, _ = ck._avaliar_simples(bon.cabelo)
    cabelo = cab_co[np.abs(cab_co[:, 0]) < 0.22]
    pele = np.concatenate([rosto, peito, cabelo])
    cabeca = co[np.array([n == "Head" for n in nomes] + [False])[dono]]
    frente = cabeca[cabeca[:, 1] < cabeca[:, 1].min() + 0.025]    # a frente do rosto (queixo, boca, nariz, testa)
    z_queixo = float(frente[:, 2].min())                           # ponto mais baixo do queixo
    Z0 = z_queixo + DZ_QUEIXO
    perto = rosto[(rosto[:, 2] > Z0 - RAIO_BARRA) & (rosto[:, 2] < Z0 + 0.15)]
    Y_LINHA = float(perto[:, 1].min()) - RAIO_BARRA - FOLGA_ROSTO  # a barra sobe nessa linha, na frente do queixo, boca e nariz

    def folga_no_caminho(ys, zs, P=pele):
        """Menor distância (m) da superfície da barra (ao longo de X) até os pontos P, em cada posição (ys, zs) do eixo."""
        d = np.sqrt((P[None, :, 1] - ys[:, None]) ** 2 + (P[None, :, 2] - zs[:, None]) ** 2) - RAIO_BARRA
        return d.min(axis=1)

    # ── em cima: braços estendidos (cotovelo a COTOVELO_CIMA), barra na vertical das articulações dos ombros ──────────────────────
    Y1 = (S["Left"].y + S["Right"].y) / 2
    dq1, pq1 = mao_dir(1.0)

    def cotovelo_com_barra_em(z):
        for lado, s in dt.LADOS:
            segurar(lado, Vector((s * MEIA, Y1, z)), dq1, pq1)
        return ck.medir_juntas(rig)["cotoveloE"]

    def caminho(z_a, Z1):
        """y do eixo da barra pra cada altura: reta Y_LINHA até z_a e, dali até Z1, vai pra trás até Y1 (x**VOLTA)."""
        def y_de(z):
            x = np.clip((np.asarray(z, float) - z_a) / (Z1 - z_a), 0.0, 1.0)
            return Y_LINHA + (Y1 - Y_LINHA) * (x ** VOLTA if VOLTA else x * x * (3 - 2 * x))
        return y_de

    # polo do cotovelo acertado com a barra embaixo (o IK tem o pole_angle certo pros 2 lados)
    dq0, pq0 = mao_dir(0.0)
    for lado, s in dt.LADOS:
        segurar(lado, Vector((s * MEIA, Y_LINHA, Z0)), dq0, pq0)
    for lado, _ in dt.LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e, flush=True)

    lo, hi = Z0 + 0.25, Z0 + 0.75                  # altura do eixo em cima: o cotovelo a COTOVELO_CIMA (mais alto = mais esticado)
    for _ in range(18):
        m = (lo + hi) / 2
        if cotovelo_com_barra_em(m) > COTOVELO_CIMA:
            lo = m
        else:
            hi = m
    Z1 = (lo + hi) / 2
    # começo da volta pra trás: o mais baixo que deixa a barra a FOLGA_MIN de tudo (rosto, testa, cabelo) no caminho
    zs = np.linspace(Z0, Z1, 400)
    z_a = Z0
    while z_a < Z1 - 0.05 and folga_no_caminho(caminho(z_a, Z1)(zs), zs).min() < FOLGA_MIN:
        z_a += 0.005
    y_de = caminho(z_a, Z1)
    f_todo = folga_no_caminho(y_de(zs), zs)
    k = int(f_todo.argmin())
    print("BARRA embaixo: eixo y %.4f z %.4f (queixo z %.4f) | sobe reta até z %.3f e vai pra trás até y %.4f, z %.4f em cima | "
          "folga barra × pele/cabelo no caminho: mínima %.1f mm em z %.3f | só rosto %.1f, peito %.1f, cabelo %.1f mm" % (
              Y_LINHA, Z0, z_queixo, z_a, Y1, Z1, f_todo[k] * 1000, zs[k], folga_no_caminho(y_de(zs), zs, rosto).min() * 1000,
              folga_no_caminho(y_de(zs), zs, peito).min() * 1000, folga_no_caminho(y_de(zs), zs, cabelo).min() * 1000), flush=True)

    estado = {}

    def pose(t):
        """t=0 barra na altura do queixo, t=1 braços estendidos acima da cabeça."""
        z = p3.lerp(Z0, Z1, t)
        B = Vector((0.0, float(y_de(z)), z))
        barra.location = B
        p3.atualizar()
        dq, pq = mao_dir(t)
        for lado, s in dt.LADOS:
            segurar(lado, B + Vector((s * MEIA, 0.0, 0.0)), dq, pq)
        for lado, _ in dt.LADOS:                  # dedos e polegar fecham até a pele encostar na barra
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, B, Vector((1, 0, 0)), RAIO_BARRA, polegar_antes=antes)
        estado.update(barra=B.copy(), t=t)

    pose.dedos = {}
    pose.estado = estado

    # ── folgas que a checagem não mede (ela ignora o que fica DENTRO da mão e não mede peça × peça), no info() de cada quadro ───────
    pecas = {o.name: o for o in barra.children if o.type == "MESH"}
    ponta = [pecas["barra_%s%+d" % (k, s)] for k in ("trava", "miolo", "anilha") for s in (-1, 1)]
    co_bc, tri_bc, n_bc = [], [], 0
    for o in [banco] + list(banco.children_recursive):
        if o.type == "MESH":
            v_, f_ = ck._avaliar_simples(o)
            co_bc.append(v_)
            tri_bc.append(f_ + n_bc)
            n_bc += len(v_)
    bvh_banco = ck._bvh(np.concatenate(co_bc), np.concatenate(tri_bc))     # o banco fica parado

    def _menor_com_sinal(bvh, P):
        """Menor distância (m) dos pontos P até a superfície (− = dentro, pela normal, até 3 cm)."""
        m = 9.0
        for p in P:
            v = Vector(p)
            loc, nor, _, d = bvh.find_nearest(v)
            if loc is not None:
                m = min(m, -d if (d < 0.03 and (v - loc).dot(nor) < 0) else d)
        return m

    def folgas_extra(co_, nm_, dn_, b):
        """mm: mão × eixo da barra fora da pegada (a pele a mais de 3,5 cm do meio da mão, ao longo da barra: lado do indicador e
        do mínimo), mão × trava/miolo/anilha do mesmo lado, travas/anilhas × corpo (vértice a vértice) e barra/anilhas × banco."""
        fora, travas = [], []
        nomes_v = np.array(list(nm_) + ["?"], dtype=object)[dn_]
        for L, s in dt.LADOS:
            m_mao = np.array([n.startswith(L + "Hand") for n in nm_] + [False])[dn_]
            mv = co_[m_mao]
            a = mv[:, 0] - b.x
            rad = np.hypot(mv[:, 1] - b.y, mv[:, 2] - b.z) - RAIO_BARRA
            a_c = float(np.median(a[rad < 0.01])) if (rad < 0.01).any() else s * MEIA
            longe = np.abs(a - a_c) > 0.035
            if longe.any():
                i = int(np.flatnonzero(longe)[np.argmin(rad[longe])])
                fora.append("%.1f (%s, %.0f mm do meio da mão)" % (rad[i] * 1000, nomes_v[m_mao][i].replace(L + "Hand", "") or "palma",
                                                                    abs(a[i] - a_c) * 1000))
            else:
                fora.append("-")
            lado = [ck._bvh(*ck._avaliar_simples(pecas["barra_%s%+d" % (k, s)])) for k in ("trava", "miolo", "anilha")]
            travas.append(min(_menor_com_sinal(bv, mv[::2]) for bv in lado) * 1000)
        pts = np.concatenate([ck._avaliar_simples(o)[0] for o in ponta])
        kd = KDTree(len(pts))
        for i, p in enumerate(pts):
            kd.insert(p, i)
        kd.balance()
        corpo_lado = co_[np.abs(co_[:, 0]) > 0.30]                     # só braço/mão chegam perto das pontas da barra
        d_corpo = min((kd.find(p)[2] for p in corpo_lado), default=9.0) * 1000
        eixo = np.stack([np.linspace(-1.0, 1.0, 101) + b.x, np.full(101, b.y), np.full(101, b.z)], axis=1)
        d_banco = min(_menor_com_sinal(bvh_banco, eixo) - RAIO_BARRA, _menor_com_sinal(bvh_banco, pts)) * 1000
        return fora, travas, d_corpo, d_banco

    def info():
        b = estado.get("barra", Vector())
        co_, _, (nm, dn) = ck._avaliar(bon.corpo, 1)
        rosto_ = co_[np.array([n in ("Head", "Neck") for n in nm] + [False])[dn]]
        folga = folga_no_caminho(np.array([b.y]), np.array([b.z]), rosto_[np.abs(rosto_[:, 0]) < 0.22])[0]
        fora, travas, d_corpo, d_banco = folgas_extra(co_, nm, dn, b)
        pol = " ".join("%s %s" % (l[0], str(pose.dedos.get(l, {}).get("Thumb"))[:60]) for l, _ in dt.LADOS)
        return ("%s | barra y %+.3f z %.3f | rosto/pescoço × barra %.1f mm | mão × barra fora da pegada E %s D %s mm | mão × "
                "trava/anilha E %.0f D %.0f mm | travas/anilhas × corpo %.0f mm | barra/anilhas × banco %.0f mm | polegar %s" % (
                    maos.info(), b.y, b.z, folga * 1000, *fora, *travas, d_corpo, d_banco, pol))

    pose(0.0)
    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=1.0)
    return Cena(pose, [barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0, foco_luz=(0, 0.0, 1.1),
                camera_video=((2.6, -3.9, 1.35), (0, 0.0, 1.1), 50), info=info, apoios=[banco], afunda_apoio_mm=20)
