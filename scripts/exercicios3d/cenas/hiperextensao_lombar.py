# Hiperextensão Lombar — cena da fábrica 3D (lote 3, 05/10/2026).
# Banco de hiperextensão a 45° (o do estudo de Andersen et al., J Sports Sci Med 2021: "45-degree Roman chair (Lower back
# bench PG05, Technogym)"): coxas de bruços no apoio acolchoado, parte de trás dos tornozelos presa sob os rolos e os pés
# chapados na plataforma (ExRx — 45° Hyperextension: "Position thighs prone on padding. Hook heels on platform lip or
# under padded brace"). t = 0 embaixo: tronco dobrado no QUADRIL até ficar perpendicular às pernas (Andersen 2021: "hip
# angle was approximately 90 degrees"; ExRx: "torso is approximately perpendicular to legs"; Contreras et al., Strength
# Cond J 2013: "The hips flex to 90 degrees") · t = 1 em cima: corpo reto, tronco alinhado com as pernas a 45° do chão,
# sem passar da linha (Schoenfeld, Kolber, Contreras e Hanney, Strength Cond J 2017: "limiting spinal motion so that
# end-range spinal hyperextension is avoided"). Coluna e pelve neutras e travadas: o movimento todo é no quadril
# (Contreras 2013: "The spine and pelvis stay locked in neutral positions while the entire movement occurs at the hips";
# Andersen 2021: "The back had to be straight with a natural sway throughout the whole movement"); joelhos quase
# estendidos (Contreras 2013: "The knees stay relatively straight"). Braços cruzados à frente do peito (ExRx: "Cross arms
# across chest"; Schoenfeld 2017: "crossing the arms in the 'mummy' position").
# Como o rig faz isso: os braços cruzam com o boneco EM PÉ (classe Bracos: IK → FK, cada palma apoiada na pele do outro
# lado) e viram filhos do tórax; as pernas ficam paralelas (só abrem o que precisa pra uma coxa não entrar na outra); o
# boneco inteiro inclina 45° em volta do quadril; o banco é montado em volta do corpo (equip3d.banco_hiperextensao): a
# borda de cima do estofado fica onde a barriga não chega na descida (ExRx), os rolos atrás do tendão de Aquiles, a
# plataforma na sola e a estrutura atrás do estofado longe dos braços cruzados. Em cada quadro a pelve (osso Hips, raiz
# do tronco) gira em volta do eixo dos 2 quadris e as coxas giram o contrário: as pernas não saem do lugar e o tronco
# não dobra.
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

TORAX = ("Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder", "Neck")
DOBRA = (22, 18, 10)          # dobra de cada falange (graus × λ) quando o dedo curva pra encostar no corpo
POLEGAR_DOBRA = (10, 20, 20)
FOLGA_PALMA = 0.001           # palma a 1 mm da pele onde ela apoia
FOLGA_DEDO = 0.0006           # cada dedo curva até encostar (0,6 mm)
# braços cruzados (achados com descida por coordenadas, 05/10/2026: nenhuma parte entra em outra, só onde a pele cruza
# de verdade): mão direita no ombro esquerdo (frente do deltoide), dedos por cima dele; mão esquerda no lado direito do
# tronco, embaixo do antebraço direito. As duas mãos em cima uma da outra (palmas no peito, antebraços em X) não cabem
# neste boneco: os antebraços entravam ≥ 20 mm um no outro em todas as combinações testadas.
BRACOS = {"Left": {"x": -0.12, "z": 1.22, "dedos": (-0.6, 0.8, 0.1), "psi": 50},
          "Right": {"x": 0.16, "z": 1.395, "dedos": (0.4, 0.8, 0.4), "psi": 78}}
INCLINA = 45                  # banco a 45°: o corpo reto fica a 45° do chão em cima
QUADRIL_Z = 1.02              # altura da articulação do quadril (m): estofado ~0,85 m do chão (Technogym PG05: 36" de altura)
PE_X = 0.12                   # tornozelos começam a 12 cm do meio (pés na largura do quadril, pernas paralelas) e abrem
                              # até uma coxa não entrar na outra: 16 cm neste boneco musculoso
FLEXAO = 90                   # flexão do quadril embaixo (quadril_sinal, graus): tronco perpendicular às pernas
ESPESSURA = 0.075             # estofado de 3" (Body-Solid GHYP345: "Extra-thick 3" DuraFirm support pads")
COMPR_ESTOFADO = 0.30         # estofado ao longo das coxas
AFUNDA_COXA = 0.006           # pele da frente das coxas dentro do estofado
FOLGA_BARRIGA = 0.020         # embaixo a barriga fica ≥ 2 cm da borda do estofado (ExRx: "abdomen should not press on top
                              # side of pad when upper body is lowered")
RAIO_ROLO = 0.05              # rolos de espuma de 10 cm
ACIMA_TORNOZELO = 0.06        # rolo atrás do tendão de Aquiles, 6 cm acima da articulação do tornozelo (ao longo da perna)
AFUNDA_ROLO = 0.003           # pele de trás do tornozelo dentro do rolo
AFUNDA_PE = 0.001             # sola dentro da chapa


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _arvore(co, tri, m):
    t = tri[m[tri].all(axis=1)]
    return BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in t], all_triangles=True)


def _distancia(bvh, P, alcance=0.05):
    """Menor distância (m, − = dentro) dos pontos P até a superfície da árvore (só até `alcance`)."""
    pior = 1e9
    for p in P:
        v = Vector(p)
        loc, nor, idx, d = bvh.find_nearest(v, alcance)
        if loc is None:
            continue
        pior = min(pior, -d if (v - loc).dot(nor) < 0 else d)
    return pior


def _cruza(co, tri, ma, mb, junta=None, raio=0.0):
    """Quanto a pele A entra na pele B (mm), só onde os triângulos se cruzam de verdade (o jeito do
    checagem3d.corpo_x_corpo); perto da `junta` (até `raio` m) é o vinco e não conta."""
    ta, tb = tri[ma[tri].all(axis=1)], tri[mb[tri].all(axis=1)]
    if not len(ta) or not len(tb):
        return 0.0
    ba = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in ta], all_triangles=True)
    bb = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in tb], all_triangles=True)
    pares = ba.overlap(bb)
    fundo = 0.0
    for i in (np.unique(ta[[p_[0] for p_ in pares]].ravel()) if pares else ()):
        v = Vector(co[i])
        if junta is not None and (v - junta).length < raio:
            continue
        loc, nor, idx, d = bb.find_nearest(v, 0.03)
        if loc is not None and (v - loc).dot(nor) < 0 and d > fundo:
            fundo = d
    return fundo * 1000


class Bracos:
    """Braços cruzados à frente do peito, montados com o boneco EM PÉ (IK do braço → FK): o braço vira filho do tórax
    e acompanha o tronco o movimento todo, sem a mão sair do lugar. Cada mão apoia a palma na pele do outro lado
    (cfg: x, z = ponto do peito/ombro onde a palma encosta, dedos = direção dos dedos, psi = giro do cotovelo em volta
    do eixo ombro → punho, 0 = cotovelo embaixo, + = pra frente)."""

    def __init__(self, bon):
        self.bon, self.rig = bon, bon.rig
        rig, PB = self.rig, self.rig.pose.bones
        self.Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length
        self.La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length
        self.punhos, self.polos, self.iks, self.ang_polo = {}, {}, {}, {}
        for lado, s in dt.LADOS:                     # alvo nasce no punho de repouso (alvo = polo dá NaN)
            self.punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
            self.polos[lado] = p3.vazio("polo_cotovelo_" + lado,
                                        p3.cabeca(rig, lado + "ForeArm") + Vector((s * 0.3, -0.3, -0.2)))
            self.iks[lado] = p3.ik(rig, lado + "ForeArm", self.punhos[lado], self.polos[lado])
            self.iks[lado].mute = True
        p3.atualizar()
        self.ossos = {L: [pb.name for pb in PB if pb.name[len(p3.P):].startswith((L + "Arm", L + "ForeArm", L + "Hand"))]
                      for L in ("Left", "Right")}
        self.repouso = {L: {n: PB[n].matrix_basis.copy() for n in self.ossos[L]} for L in self.ossos}
        self.diag = {}

    def repor(self):
        PB = self.rig.pose.bones
        for L in self.ossos:
            self.iks[L].mute = True
            for n, M in self.repouso[L].items():
                PB[n].matrix_basis = M.copy()
        p3.atualizar()

    # ── peças ───────────────────────────────────────────────────────────────────────────────────────────────────
    def _congelar(self, lado):
        PB = self.rig.pose.bones
        nomes = (lado + "Arm", lado + "ForeArm")
        mats = [PB[p3.P + n].matrix.copy() for n in nomes]
        self.iks[lado].mute = True
        for n, M in zip(nomes, mats):
            PB[p3.P + n].matrix = M
            p3.atualizar()

    def _orientar(self, lado, dedos_q, palma_q):
        """Antebraço gira (pronação/supinação) pra palma ir pra palma_q; o resto no punho até os dedos irem pra
        dedos_q (o jeito do maos3d.Maos.segurar, sem fechar a mão)."""
        rig = self.rig
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
        pq = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
        F_quer = Matrix((dedos_q, pq, dedos_q.cross(pq))).transposed()
        p3.girar_osso(rig, lado + "Hand", F_quer @ F_tem.transposed())

    def _esticar_dedos(self, lado):
        """Dedos juntos e esticados no plano da palma, polegar deitado do lado do indicador (mão de apoio da remada
        unilateral, lote 2)."""
        rig = self.rig
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

    def _polo(self, lado, W, psi):
        """Polo do IK pro cotovelo ficar no giro `psi` (graus) do círculo onde ele pode estar com o ombro e o punho
        dados: 0 = o ponto mais baixo, + = pra frente."""
        S = p3.cabeca(self.rig, lado + "Arm")
        d = W - S
        u = d.normalized()
        a = (self.Lb ** 2 - self.La ** 2 + d.length ** 2) / (2 * d.length)
        rho = math.sqrt(max(self.Lb ** 2 - a ** 2, 1e-8))
        e1 = (Vector((0, 0, -1)) + u * u.z).normalized()
        e2 = u.cross(e1)
        if e2.y > 0:
            e2.negate()
        ps = math.radians(psi)
        r = (e1 * math.cos(ps) + e2 * math.sin(ps)).normalized()
        return S + u * a + r * (rho + 0.4)

    def _onde_apoia(self, lado):
        """Pele onde a mão `lado` apoia: o tronco e o braço do outro lado (o deltoide é pele do osso Arm)."""
        outro = "Right" if lado == "Left" else "Left"
        co, tri, (nomes, dono) = _malha(self.bon)
        m = _grupo(nomes, dono, TORAX + (outro + "Arm",))
        return co[m], _arvore(co, tri, m)

    def _em_volta(self, lado):
        """Tudo que os dedos e o polegar da mão `lado` podem encostar (sem entrar)."""
        outro = "Right" if lado == "Left" else "Left"
        co, tri, (nomes, dono) = _malha(self.bon)
        m = np.array([(n in TORAX + (outro + "Arm", outro + "ForeArm", "Head")) or n.startswith(outro + "Hand")
                      for n in nomes] + [False])[dono]
        return co, (nomes, dono), _arvore(co, tri, m)

    # ── mão apoiada ─────────────────────────────────────────────────────────────────────────────────────────────
    def por_mao(self, lado, cfg, voltas=8):
        rig = self.rig
        V, bvh = self._onde_apoia(lado)
        f = V[(np.abs(V[:, 0] - cfg["x"]) < 0.008) & (np.abs(V[:, 2] - cfg["z"]) < 0.008)]
        pc = Vector(f[np.argmin(f[:, 1])])                       # pele mais da frente nesse ponto
        loc, nor, idx, d = bvh.find_nearest(pc + Vector((0, -0.03, 0)))
        n = nor.normalized()
        base = Vector(cfg["dedos"]).normalized()
        dedos_q = (base - n * base.dot(n)).normalized()
        W = pc - dedos_q * 0.055 + n * 0.025
        dp = 1.0
        for k in range(voltas):
            self.iks[lado].mute = False
            self.punhos[lado].location = W
            self.polos[lado].location = self._polo(lado, W, cfg["psi"])
            p3.atualizar()
            if lado not in self.ang_polo:
                self.ang_polo[lado] = p3.acertar_polo(rig, self.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
            self._congelar(lado)
            self._orientar(lado, dedos_q, -n)
            self._esticar_dedos(lado)
            co, tri, (nomes, dono) = _malha(self.bon)
            dp = _distancia(bvh, co[_grupo(nomes, dono, (lado + "Hand",))])
            W = W - n * (dp - FOLGA_PALMA)
            if abs(dp - FOLGA_PALMA) < 0.0004:
                break
        self.diag[lado] = dict(contato=tuple(round(x, 3) for x in pc), normal=tuple(round(x, 2) for x in n),
                               palma=dp * 1000)
        return dp

    def dedos(self, lado):
        """Cada dedo (fora o polegar) curva inteiro (3 falanges na proporção DOBRA) até a pele encostar onde a mão
        apoia, sem entrar."""
        rig = self.rig
        co, (nomes, dono), bvh = self._em_volta(lado)
        palma, eixo_nos = pg._base(rig, lado)[:2]
        pos = {nn: i for i, nn in enumerate(nomes)}
        esc = {}
        for d in p3.DEDOS:
            ossos = ["%sHand%s%d" % (lado, d, i) for i in (1, 2, 3)]
            pts = {o: co[dono == pos[o]] for o in ossos}
            cab = {o: np.array(p3.cabeca(rig, o)) for o in ossos}
            f = (p3.ponta(rig, ossos[0]) - p3.cabeca(rig, ossos[0])).normalized()
            sinal = 1 if eixo_nos.cross(f).dot(palma) > 0 else -1
            melhor = None
            for lam in np.arange(-1.5, 3.01, 0.05):              # do mais esticado pro mais dobrado
                angs = [lam * DOBRA[k] * sinal for k in range(3)]
                pp = pg._cadeia_pts(pts, cab, None, ossos, [eixo_nos] * 3, angs)
                if _distancia(bvh, np.concatenate([pp[o][::2] for o in ossos])) < FOLGA_DEDO:
                    break
                melhor = (lam, angs)
            if melhor is None:
                esc[d] = "sem solução"
                continue
            lam, angs = melhor
            for k, o in enumerate(ossos):
                if angs[k]:
                    p3.girar_osso(rig, o, p3.rot_eixo(angs[k], eixo_nos))
            esc[d] = round(float(lam), 2)
        self.diag.setdefault(lado, {})["dedos"] = esc
        return esc

    def polegar(self, lado, folga=(0.0005, 0.003)):
        """Polegar do lado do indicador: procura o giro na base (em volta da normal da palma) e a dobra das 3 falanges
        que deixam a PONTA dele (última falange) encostando de leve (folga[0] a folga[1]) onde a mão apoia, sem nenhuma
        parte entrar; sem isso, a ponta o mais perto possível sem entrar (o jeito do polegar_na_cabeca do abdominal
        bicicleta, lote 2). Medindo o polegar inteiro, a base encostava e a ponta ficava espetada pra fora."""
        rig = self.rig
        co, (nomes, dono), bvh = self._em_volta(lado)
        pos = {nn: i for i, nn in enumerate(nomes)}
        palma = pg._base(rig, lado)[0]
        ossos = ["%sHandThumb%d" % (lado, i) for i in (1, 2, 3)]
        pts0 = {o: co[dono == pos[o]] for o in ossos}
        cab0 = {o: np.array(p3.cabeca(rig, o)) for o in ossos}
        h1 = cab0[ossos[0]]
        eixos, sinais = [], []
        for o in ossos:
            f = (p3.ponta(rig, o) - p3.cabeca(rig, o)).normalized()
            ex = f.cross(palma).normalized()
            alvo = (p3.cabeca(rig, lado + "HandMiddle1") - p3.cabeca(rig, o)).normalized()
            eixos.append(ex)
            sinais.append(1 if ex.cross(f).dot(alvo) > 0 else -1)
        melhor = None
        for b in range(-30, 31, 5):
            pa = {o: pg._rot(pts0[o], h1, palma, b) for o in ossos}
            ca = {o: (pg._rot(cab0[o][None], h1, palma, b)[0] if k else cab0[o]) for k, o in enumerate(ossos)}
            eix = [Vector(pg._rot(np.array(e)[None], np.zeros(3), palma, b)[0]) for e in eixos]
            for lam in np.arange(-0.5, 2.51, 0.1):
                angs = [lam * POLEGAR_DOBRA[k] * sinais[k] for k in range(3)]
                pp = pg._cadeia_pts(pa, ca, None, ossos, eix, angs)
                if _distancia(bvh, np.concatenate([pp[o][::2] for o in ossos])) < folga[0]:
                    continue
                dm = _distancia(bvh, pp[ossos[2]], alcance=0.08)          # só a ponta (última falange)
                nota = (0, abs(b) / 30 + abs(lam), dm) if dm <= folga[1] else (1, dm, abs(b) / 30 + abs(lam))
                if melhor is None or nota < melhor[0]:
                    melhor = (nota, b, lam, dm)
        if melhor is None:
            self.diag.setdefault(lado, {})["polegar"] = "sem solução"
            return None
        _, b, lam, dm = melhor
        if b:
            p3.girar_osso(rig, ossos[0], p3.rot_eixo(b, palma))
        for k, o in enumerate(ossos):
            f = (p3.ponta(rig, o) - p3.cabeca(rig, o)).normalized()
            ex = f.cross(palma).normalized()
            alvo = (p3.cabeca(rig, lado + "HandMiddle1") - p3.cabeca(rig, o)).normalized()
            sg = 1 if ex.cross(f).dot(alvo) > 0 else -1
            if lam * POLEGAR_DOBRA[k]:
                p3.girar_osso(rig, o, p3.rot_eixo(lam * POLEGAR_DOBRA[k] * sg, ex))
        self.diag.setdefault(lado, {})["polegar"] = (b, round(float(lam), 1), round(dm * 1000, 1))
        return b, lam, dm

    def montar(self, cfg, ordem=("Left", "Right")):
        for lado in ordem:
            self.por_mao(lado, cfg[lado])
        for lado in ordem:
            self.dedos(lado)
            self.polegar(lado)

    # ── medidas ─────────────────────────────────────────────────────────────────────────────────────────────────
    def medir(self):
        """Quanto cada parte dos braços entra no resto (mm, só onde cruza de verdade) e o vão de cada mão até onde
        ela apoia (mm, − = dentro)."""
        rig = self.rig
        co, tri, (nomes, dono) = _malha(self.bon)
        G = lambda partes: _grupo(nomes, dono, partes)
        mao = {L: np.array([n.startswith(L + "Hand") for n in nomes] + [False])[dono] for L in ("Left", "Right")}
        T = G(TORAX)
        tronco = G(("Hips", "Spine", "Spine1", "Spine2"))
        braco = {L: G((L + "Arm",)) for L in ("Left", "Right")}
        ante = {L: G((L + "ForeArm",)) for L in ("Left", "Right")}
        cab = G(("Head",))
        m = {}
        for L, X in (("Left", "E"), ("Right", "D")):
            O = "Right" if L == "Left" else "Left"
            m["ante%s×tronco" % X] = _cruza(co, tri, ante[L], T)
            m["mao%s×tronco" % X] = _cruza(co, tri, mao[L], T)
            m["braco%s×tronco>18cm" % X] = _cruza(co, tri, braco[L], tronco, p3.cabeca(rig, L + "Arm"), 0.18)
            m["mao%s×braco%s" % (X, "D" if X == "E" else "E")] = _cruza(co, tri, mao[L], braco[O])
            m["ante%s×braco%s" % (X, "D" if X == "E" else "E")] = _cruza(co, tri, ante[L], braco[O])
            m["mao%s×cabeca" % X] = _cruza(co, tri, mao[L], cab)
            apoio = _arvore(co, tri, G(TORAX + (O + "Arm",)))
            m["vao_mao%s" % X] = _distancia(apoio, co[mao[L]]) * 1000
        m["anteE×anteD"] = _cruza(co, tri, ante["Left"], ante["Right"])
        m["maoE×anteD"] = _cruza(co, tri, mao["Left"], ante["Right"])
        m["maoD×anteE"] = _cruza(co, tri, mao["Right"], ante["Left"])
        m["maoE×maoD"] = _cruza(co, tri, mao["Left"], mao["Right"])
        j = ck.medir_juntas(rig)
        m["punhoE"], m["punhoD"] = j["punhoE"], j["punhoD"]
        m["cotoveloE"], m["cotoveloD"] = j["cotoveloE"], j["cotoveloD"]
        return m


PERNAS = ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase")


def montar(bon):
    rig = bon.rig
    PB = rig.pose.bones

    # ── braços cruzados, com o boneco em pé (viram filhos do tórax) ───────────────────────────────────────────────
    bracos = Bracos(bon)
    bracos.montar(BRACOS)
    mb = bracos.medir()
    print("BRAÇOS CRUZADOS | %s" % " ".join("%s %.1f" % kv for kv in mb.items()))
    print("  mãos: %s" % bracos.diag)

    # ── pernas paralelas: cada coxa fecha (em volta do eixo Y do quadril) até o tornozelo ficar a pe_x do meio; o pé
    # volta a ficar reto (sola paralela ao chão de antes, que vira a plataforma). Começa na largura do quadril e abre de
    # 1 em 1 cm enquanto uma coxa entrar na outra (as coxas musculosas se encostam por dentro) ─────────────────────────
    pernas_repouso = {lado + n: PB[p3.P + lado + n].matrix_basis.copy() for lado, _ in dt.LADOS for n in ("UpLeg", "Foot")}
    pe_x = PE_X
    while True:
        for n, M in pernas_repouso.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        fechou = {}
        for lado, s in dt.LADOS:
            H, A = p3.cabeca(rig, lado + "UpLeg"), p3.cabeca(rig, lado + "Foot")
            r = A - H
            beta = math.atan2(r.x, -r.z) - math.asin((s * pe_x - H.x) / math.hypot(r.x, r.z))
            p3.girar_osso(rig, lado + "UpLeg", Matrix.Rotation(beta, 3, "Y"))
            p3.girar_osso(rig, lado + "Foot", Matrix.Rotation(-beta, 3, "Y"))
            fechou[lado] = math.degrees(beta)
        co, tri, (nomes, dono) = _malha(bon)
        ck.posicoes_das_juntas(rig)
        coxas_mm = ck.corpo_x_corpo(co, tri, nomes, dono)[0]["coxaE×coxaD"]
        print("PERNAS tornozelos a %.0f cm do meio (fecharam %.1f°/%.1f°) | coxa × coxa %.1f mm" % (
            pe_x * 100, fechou["Left"], fechou["Right"], coxas_mm))
        if coxas_mm <= 0.5 or pe_x > 0.2:
            break
        pe_x += 0.01

    # ── o boneco inteiro inclina 90 − INCLINA graus pra frente em volta dos quadris, com o quadril em (0, 0, QUADRIL_Z) ──
    def centro_quadril():
        return (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2

    hc = centro_quadril()
    p3.girar_osso(rig, "Hips", p3.rot_x(90 - INCLINA), pivo=hc, mover=Vector((-hc.x, -hc.y, QUADRIL_Z - hc.z)))
    HIP = centro_quadril()
    base = {n: PB[p3.P + n].matrix_basis.copy() for n in ("Hips", "LeftUpLeg", "RightUpLeg")}

    def flexionar(phi):
        """Quadril dobrado `phi` graus a partir do corpo reto: a pelve (e o tronco junto, sem dobrar a coluna) gira em
        volta do eixo dos 2 quadris e as coxas giram o contrário em volta da cabeça delas, que fica nesse eixo — as
        pernas não saem do lugar."""
        for n, M in base.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        if phi:
            p3.girar_osso(rig, "Hips", p3.rot_x(phi), pivo=HIP)
            for lado, _ in dt.LADOS:
                p3.girar_osso(rig, lado + "UpLeg", p3.rot_x(-phi))

    def quadril():
        return tc.quadril_sinal(ck.posicoes(rig))

    flexionar(0.0)
    q_cima = quadril()
    phi_baixo = FLEXAO - float(np.mean(q_cima))
    for _ in range(2):
        flexionar(phi_baixo)
        phi_baixo += FLEXAO - float(np.mean(quadril()))
    flexionar(phi_baixo)
    print("QUADRIL (com sinal) em cima %s | embaixo %s | pelve gira %.1f°" % (
        "/".join("%.1f" % q for q in q_cima), "/".join("%.1f" % q for q in quadril()), phi_baixo))

    # ── banco montado em volta do corpo: s ao longo do corpo (pra cabeça), d pra frente dele (pro chão) ──────────────
    th = math.radians(90 - INCLINA)
    U = np.array((0.0, -math.sin(th), math.cos(th)))
    D = np.array((0.0, -math.cos(th), -math.sin(th)))

    def sd(P):
        rel = P - np.array(HIP)
        return rel @ U, rel @ D

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    # pernas paradas: medidas no corpo reto
    flexionar(0.0)
    coxas = pele(("LeftUpLeg", "RightUpLeg"))
    pes = pele(("LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"))
    tornozelo_s = float(sd(np.array([p3.cabeca(rig, "LeftFoot"), p3.cabeca(rig, "RightFoot")]))[0].mean())
    # descendo: tudo que não é perna (tronco, braços cruzados, cabeça), em 6 pontos da descida
    resto, quem = [], []
    for f_ in np.linspace(0.0, 1.0, 6):
        flexionar(f_ * phi_baixo)
        co, _, (nomes, dono) = _malha(bon)
        m = ~np.array([n in PERNAS for n in nomes] + [False])[dono]
        resto.append(co[m])
        quem += [nomes[k] if k >= 0 else "?" for k in dono[m]]
    resto = np.concatenate(resto)
    s_res, d_res = sd(resto)
    s_cox, d_cox = sd(coxas)
    s_cima, d_topo = -0.12, 0.12
    for _ in range(3):
        faixa = (s_cox > s_cima - COMPR_ESTOFADO) & (s_cox < s_cima) & (np.abs(coxas[:, 0]) < 0.19)
        d_topo = float(d_cox[faixa].max()) - AFUNDA_COXA          # topo do estofado: a frente das coxas afunda nele
        # borda de cima: nada do tronco chega nela na descida (ExRx: a barriga não aperta o estofado embaixo); só conta o
        # que passa na espessura do estofado
        perto = (d_res > d_topo - 0.01) & (d_res < d_topo + ESPESSURA + 0.003) & (np.abs(resto[:, 0]) < 0.22)
        s_cima = float(s_res[perto].min()) - FOLGA_BARRIGA
    s_baixo = s_cima - COMPR_ESTOFADO
    viga = d_topo + ESPESSURA + 0.09
    # a estrutura atrás do estofado (travessa e viga) fica 4 cm abaixo de tudo que o tronco e os braços cruzados varrem
    # na descida, na faixa de d dela
    atras = (d_res > d_topo + ESPESSURA - 0.01) & (d_res < viga + 0.07) & (np.abs(resto[:, 0]) < 0.32)
    s_estrutura = float(s_res[atras].min()) - 0.04 if atras.any() else s_cima - 0.05
    i_e, i_a = np.where(perto)[0][np.argmin(s_res[perto])], np.where(atras)[0][np.argmin(s_res[atras])]
    print("BORDA DO ESTOFADO limitada por %s (s %.3f d %.3f) | estrutura por %s (s %.3f d %.3f)" % (
        quem[i_e], s_res[i_e], d_res[i_e], quem[i_a], s_res[i_a], d_res[i_a]))
    s_alto = min(s_cima - 0.05, s_estrutura)
    s_trav = min((s_baixo + s_cima) / 2, s_alto - 0.03)
    # rolos atrás do tendão de Aquiles: a pele de trás da perna, ACIMA_TORNOZELO acima da articulação do tornozelo
    s_rolo = tornozelo_s + ACIMA_TORNOZELO
    d_rolo = -1e9
    for lado, s in dt.LADOS:
        P = pele((lado + "Leg", lado + "Foot"))
        sp, dp = sd(P)
        f = (np.abs(sp - s_rolo) < 0.012) & (np.abs(P[:, 0] - s * pe_x) < 0.05)
        d_rolo = max(d_rolo, float(dp[f].min()) - RAIO_ROLO + AFUNDA_ROLO)
    # plataforma: o topo da chapa na sola (pé chapado), do calcanhar até passar dos dedos
    s_pe, d_pe = sd(pes)
    s_plat = float(s_pe.min()) + AFUNDA_PE
    d0, d1 = float(d_pe.min()) - 0.035, float(d_pe.max()) + 0.035
    pecas = e3.banco_hiperextensao("banco_hiper", origem=HIP, angulo=INCLINA,
                                   estofado=(s_baixo, s_cima, d_topo, ESPESSURA, 0.40),
                                   rolos=(s_rolo, d_rolo, RAIO_ROLO, 0.14, pe_x),
                                   plataforma=(s_plat, d0, d1, 0.015, 0.46), viga=viga, frente=s_alto - 0.10,
                                   alto=s_alto, travessa=s_trav)
    p3.atualizar()
    estofado, rolos, plataforma, estrutura = (pecas[k] for k in ("estofado", "rolos", "plataforma", "estrutura"))
    print("BANCO 45° | quadril (%.3f %.3f %.3f) | estofado s %.3f → %.3f (borda de cima %.0f mm abaixo do quadril), topo d "
          "%.3f | estrutura até s %.3f, travessa s %.3f | rolos s %.3f d %.3f | plataforma s %.3f, d %.3f → %.3f | viga d "
          "%.3f" % (*HIP, s_baixo, s_cima, -s_cima * 1000, d_topo, s_alto, s_trav, s_rolo, d_rolo, s_plat, d0, d1, viga))

    def pose(t):
        """t=0 embaixo (quadril dobrado, tronco perpendicular às pernas), t=1 em cima (corpo reto, tronco alinhado com
        as pernas)."""
        flexionar((1.0 - t) * phi_baixo)

    def info():
        j = ck.posicoes(rig)
        q = tc.quadril_sinal(j)
        tronco = math.degrees(math.atan2(j["Neck"][2] - j["Hips"][2], math.hypot(*(j["Neck"][:2] - j["Hips"][:2]))))
        co, _, (nomes, dono) = _malha(bon)
        G = lambda partes: co[_grupo(nomes, dono, partes)]
        def ate_estofado(partes):
            mm = ck._zona_no_apoio(G(partes), [estofado], estofado.name) * 1000
            return "%.0f mm" % mm if mm < 50 else "> 50 mm"
        return ("quadril (com sinal) E %.0f° D %.0f° | tronco %+.0f° do chão | coluna %.0f° | tronco × estofado %s | "
                "braços × estofado %s | cabeça %.0f mm do chão" % (
                    q[0], q[1], tronco, tc.coluna(j)[0], ate_estofado(("Hips", "Spine", "Spine1", "Spine2")),
                    ate_estofado(tuple(L + o for L in ("Left", "Right") for o in ("Arm", "ForeArm", "Hand"))),
                    G(("Head",))[:, 2].min() * 1000))

    for t in (0.0, 1.0):
        pose(t)
        print("t=%g | %s" % (t, info()))

    return Cena(pose, [estrutura], pegadas=[], apoio_mm=0.0, foco_luz=(0, 0.1, 0.75),
                camera_video=((3.5, -1.8, 1.3), (0, 0.1, 0.75), 50), info=info, apoios=[estofado, rolos, plataforma],
                afunda_apoio_mm=20)
