# Exporta a malha de repouso do boneco (corpo atlético, sem a anatomia) pra gerar as texturas fora do Blender.
# blender -b -P exportar_malha.py -- <saida.npz>
# Sai: posição/normal por vértice, triângulos (vértices + UV), máscara do corpo, pesos dos ossos, cabeça/ponta dos ossos.
import bpy, sys
import numpy as np
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
import boneco3d as b3, anatomia3d as an

saida = sys.argv[sys.argv.index("--") + 1]
OSSOS = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head"] + [
    l + o for l in ("Left", "Right") for o in ("Shoulder", "Arm", "ForeArm", "Hand", "UpLeg", "Leg", "Foot", "ToeBase")]

b3.MACRO.update({"muscle": 1.0, "weight": 0.25})
b3.limpar_cena()
bon = b3.Boneco()
an.corpo_atletico(bon)
co, no = bon._coords_repouso()
me = bon.corpo.data
nv = len(me.vertices)
co = np.array([tuple(v) for v in co], dtype=np.float64)
no = np.array([tuple(v) for v in no], dtype=np.float64)

me.calc_loop_triangles()
nt = len(me.loop_triangles)
tri_v = np.zeros(nt * 3, dtype=np.int32)
me.loop_triangles.foreach_get("vertices", tri_v)
tri_l = np.zeros(nt * 3, dtype=np.int32)
me.loop_triangles.foreach_get("loops", tri_l)
uvl = me.uv_layers["UVMap"].data
uv = np.zeros(len(uvl) * 2, dtype=np.float64)
uvl.foreach_get("uv", uv)
tri_uv = uv.reshape(-1, 2)[tri_l.reshape(-1, 3)]

g_corpo = bon.corpo.vertex_groups["body"].index
col = {"mixamorig:" + o: k for k, o in enumerate(OSSOS)}
idx_grupo = {g.index: col[g.name] for g in bon.corpo.vertex_groups if g.name in col}
W = np.zeros((nv, len(OSSOS)), dtype=np.float32)
corpo = np.zeros(nv, dtype=bool)
for v in me.vertices:
    for g in v.groups:
        if g.group == g_corpo and g.weight > 0.5:
            corpo[v.index] = True
        k = idx_grupo.get(g.group)
        if k is not None:
            W[v.index, k] += g.weight

cab = np.array([tuple(bon.cabeca_osso(o)) for o in OSSOS])
pon = np.array([tuple(bon.ponta_osso(o)) for o in OSSOS])
tri_v = tri_v.reshape(-1, 3)
np.savez_compressed(saida, co=co, no=no, tri_v=tri_v, tri_uv=tri_uv, corpo=corpo, W=W,
                    ossos=np.array(OSSOS), cab=cab, pon=pon)
print("EXPORT ok", saida, "vértices", nv, "triângulos", len(tri_v), "do corpo", int(corpo[tri_v].all(axis=1).sum()))
