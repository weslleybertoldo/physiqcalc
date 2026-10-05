# Mãos na barra (lotes do 3D, 04/10/2026): a receita do agachamento virou função pra todas as cenas com barra ou halter.
# IK do braço até o punho → congela em FK → gira o antebraço pra palma ir pra direção pedida → o resto no punho →
# corrige o punho até o VÃO da mão de referência (pg.ponto_na_mao) cair no ponto pedido do eixo da barra.
import math
from mathutils import Vector, Matrix
import poses3d as p3
import pegada3d as pg


class Maos:
    def __init__(self, bon, raio_barra, polo_inicial=(0, 0.5, 0), polegar_modo=None):
        # polegar_modo (lote 3, 05/10/2026): "volta" = o polegar dá a volta na barra (pg.polegar_em_volta) em toda
        # chamada de pg.fechar_em_volta da cena — só nos exercícios NOVOS; None = não mexe (o polegar de hoje).
        if polegar_modo is not None:
            pg.usar_polegar(polegar_modo)
        rig = bon.rig
        self.bon, self.rig, self.raio = bon, rig, raio_barra
        self.punhos, self.polos, self.iks, self.furo = {}, {}, {}, {}
        for lado in ("Left", "Right"):       # alvos nascem no punho de repouso (alvo = polo dá NaN)
            self.punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
            self.polos[lado] = p3.vazio("polo_cotovelo_" + lado,
                                        p3.cabeca(rig, lado + "ForeArm") + Vector(polo_inicial))
            self.iks[lado] = p3.ik(rig, lado + "ForeArm", self.punhos[lado], self.polos[lado])
        self.palma = (p3.cabeca(rig, "LeftHandMiddle1") - p3.cabeca(rig, "LeftHand")).length
        for lado in ("Left", "Right"):       # o vão da mão real, guardado no espaço do osso da mão
            pg.mao_de_referencia(rig, lado)
            g, _ = pg.ponto_na_mao(bon, lado, raio_barra)
            self.furo[lado] = p3.mundo_osso(rig, lado + "Hand").inverted() @ g
        self.erro, self.punho = {}, {}

    def segurar(self, lado, g, dedos_q, palma_q, polo=None, voltas=5, alinhar=0.0):
        """Mão `lado` com o vão em g (ponto do eixo da barra), dedos pra `dedos_q` e palma pra `palma_q` (mundo).
        alinhar (0–1): quanto os dedos seguem o antebraço em vez de `dedos_q` — menos punho dobrado quando o
        antebraço inclina (ex.: remada em cima)."""
        rig, PB = self.rig, self.rig.pose.bones
        dedos_q = Vector(dedos_q).normalized()
        palma_q = Vector(palma_q)
        palma_q = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
        if polo is not None:
            self.polos[lado].location = polo
        pg.mao_de_referencia(rig, lado)
        alvo = g - dedos_q * (self.palma * 0.92)        # punho antes do vão, do lado contrário aos dedos
        erro = Vector()
        for _ in range(voltas):
            self.iks[lado].mute = False
            self.punhos[lado].location = alvo
            p3.atualizar()
            nomes = (lado + "Arm", lado + "ForeArm")
            mats = [PB[p3.P + n].matrix.copy() for n in nomes]
            self.iks[lado].mute = True
            for n, M in zip(nomes, mats):
                PB[p3.P + n].matrix = M
                p3.atualizar()
            f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
            ax = (f1 - f0).normalized()                 # 1) antebraço gira (pronação/supinação) pra palma
            quer = palma_q - ax * palma_q.dot(ax)
            tem = pg._base(rig, lado)[0]
            tem = tem - ax * tem.dot(ax)
            if quer.length > 1e-6 and tem.length > 1e-6:
                quer.normalize()
                tem.normalize()
                ang = math.atan2(tem.cross(quer).dot(ax), tem.dot(quer))
                p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(ang, 3, ax))
            h0 = p3.cabeca(rig, lado + "Hand")          # 2) o que sobrar vai no punho
            y_m = (p3.ponta(rig, lado + "Hand") - h0).normalized()
            n_m = pg._base(rig, lado)[0]
            n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
            F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
            dq = (dedos_q * (1 - alinhar) + ax * alinhar).normalized()
            pq = (palma_q - dq * palma_q.dot(dq)).normalized()
            F_quer = Matrix((dq, pq, dq.cross(pq))).transposed()
            p3.girar_osso(rig, lado + "Hand", F_quer @ F_tem.transposed())
            erro = g - p3.mundo_osso(rig, lado + "Hand") @ self.furo[lado]
            alvo = alvo + erro
            if erro.length < 0.002:
                break
        self.erro[lado] = erro.length
        fa = p3.ponta(rig, lado + "ForeArm") - p3.cabeca(rig, lado + "ForeArm")
        mo = p3.ponta(rig, lado + "Hand") - p3.cabeca(rig, lado + "Hand")
        self.punho[lado] = math.degrees(fa.angle(mo))

    def info(self):
        return "punho dobrado E %.0f° D %.0f° | vão da mão E %.1f D %.1f mm" % (
            self.punho.get("Left", 0), self.punho.get("Right", 0),
            self.erro.get("Left", 0) * 1000, self.erro.get("Right", 0) * 1000)
