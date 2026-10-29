# Renders a turntable of the brain surfaces (FreeSurfer lh.stl + rh.stl) into one grid sprite sheet for bg.js:
# FRAMES frames, COLS per row, each W x H, grey brain on black (bg.js counts brightness above black as brain).
# Headless, nothing is saved but the sheet:
#   blender -b --factory-startup -P tools/render-brain.py -- <folder with lh.stl, rh.stl> <out.jpg> [frames]
# Then make BRAIN in bg.js match FRAMES / COLS / W / H.
import bpy, math, os, sys
import numpy as np
from mathutils import Vector

FRAMES, COLS, W, H = 64, 8, 448, 336
ELEVATION = math.radians(18)  # camera looks down a little
LENS = 70                     # mm; long lens = gentle perspective

args = sys.argv[sys.argv.index('--') + 1:]
src, out = args[0], args[1]
frames = int(args[2]) if len(args) > 2 else FRAMES  # pass 1 for a quick test frame

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# both hemispheres → one mesh, centred on the origin and scaled to radius 1 (FreeSurfer is in mm, z = up)
for side in ('lh', 'rh'):
    bpy.ops.wm.stl_import(filepath=os.path.join(src, side + '.stl'))
for o in scene.objects:
    o.select_set(True)
bpy.context.view_layer.objects.active = scene.objects[0]
bpy.ops.object.join()
brain = bpy.context.view_layer.objects.active
bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
brain.location = (0, 0, 0)
brain.scale = (1 / max(v.co.length for v in brain.data.vertices),) * 3
bpy.ops.object.shade_smooth()

mat = bpy.data.materials.new('brain')
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.8, 0.8, 0.8, 1)
bsdf.inputs['Roughness'].default_value = 0.55
brain.data.materials.append(mat)

# camera in front, far enough that the brain fits the frame width at every angle
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
cam.data.lens = LENS
scene.collection.objects.link(cam)
scene.camera = cam
d = 1.2 / math.tan(math.atan(cam.data.sensor_width / 2 / LENS))
cam.location = (0, -d * math.cos(ELEVATION), d * math.sin(ELEVATION))
cam.rotation_euler = (math.pi / 2 - ELEVATION, 0, 0)
cam.data.shift_y = -0.04  # the brain's underside sits lower than its bounding-box centre

def light(name, energy, loc):
    o = bpy.data.objects.new(name, bpy.data.lights.new(name, 'AREA'))
    o.data.energy, o.data.size = energy, 3
    o.location = loc
    o.rotation_euler = (-Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(o)

light('key', 250, (-3, -4, 4))  # upper left, in front: shades the folds
light('rim', 200, (3, 4, 2))    # behind right: separates the edge from the background
scene.world = bpy.data.worlds.new('world')  # default dim grey ambient fills the shadows a touch

scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = W, H, 100
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'

rows = math.ceil(frames / COLS)
sheet = np.zeros((rows * H, min(frames, COLS) * W, 4), np.float32)
tmp = os.path.join(os.path.dirname(os.path.abspath(out)), '_frame.png')
scene.render.filepath = tmp
for i in range(frames):
    brain.rotation_euler.z = 2 * math.pi * i / FRAMES
    bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(tmp, check_existing=False)
    px = np.empty(W * H * 4, np.float32)
    im.pixels.foreach_get(px)
    bpy.data.images.remove(im)
    px = px.reshape(H, W, 4)[::-1]            # Blender stores rows bottom-up
    px[..., :3] *= px[..., 3:]                # flatten onto black
    r, c = divmod(i, COLS)
    sheet[r * H:(r + 1) * H, c * W:(c + 1) * W] = px
    print(f'frame {i + 1}/{frames}', flush=True)
os.remove(tmp)

sheet[..., 3] = 1
img = bpy.data.images.new('sheet', sheet.shape[1], sheet.shape[0])
img.pixels.foreach_set(sheet[::-1].ravel())
scene.render.image_settings.file_format = 'JPEG'
scene.render.image_settings.color_mode = 'BW'
scene.render.image_settings.quality = 90
img.save_render(out, scene=scene)
print('wrote', out, flush=True)
