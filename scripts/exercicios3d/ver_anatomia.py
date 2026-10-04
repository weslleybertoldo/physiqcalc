# Prévia do boneco com a anatomia (visual v4): frente, costas e lado, em repouso.
# $BLENDER -b -P ver_anatomia.py -- <saida_prefixo> [larg] [alt] [amostras]
import bpy, os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
from mathutils import Vector
import boneco3d as b3, personagem

a = sys.argv[sys.argv.index("--") + 1:]
saida = a[0]; larg = int(a[1]) if len(a) > 1 else 300; alt = int(a[2]) if len(a) > 2 else 400; amostras = int(a[3]) if len(a) > 3 else 4
t = time.time()
bon = personagem.criar(alvos=["quadriceps", "gluteo"], secundarios=["adutores", "posterior"])
print("ANATOMIA pronta em %.1fs" % (time.time() - t))
b3.estudio_forte()
b3.render_cfg(amostras=amostras, larg=larg, alt=alt)
cam = b3.camera((0, -4.6, 1.0), (0, 0, 0.92), 50)
for nome, pos in (("frente", (0.0, -4.6, 1.0)), ("costas", (0.0, 4.6, 1.0)), ("lado", (4.6, -0.6, 1.0))):
    cam.location = pos
    cam.rotation_euler = (Vector((0, 0, 0.92)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    t = time.time(); b3.render("%s_%s.png" % (saida, nome)); print("R %s %.1fs" % (nome, time.time() - t))
