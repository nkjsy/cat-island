# Usage: python3 tools/cat_model_gen.py [simplify .93] [texture.png]  (needs numpy, scikit-image, trimesh, fast-simplification, pillow)
# Builds an original rigged chibi cat for 猫猫小岛 from signed-distance shapes.
# Output: cat_model.js (const CAT_GLTF = {...glTF 2.0 with embedded buffer...}).
# Space: y up (paws at 0), z forward (nose), x = the cat's left. Bones point along local +Y.
import json, base64, struct, sys
import numpy as np
from skimage import measure
import trimesh, fast_simplification

V = np.array
def length(p): return np.sqrt((p*p).sum(-1))

# ---------- shapes ----------
def sd_ell(p, c, r):
    q = (p - c) / r; k0 = length(q); k1 = length(q / r)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-6)
def sd_rcone(p, a, b, ra, rb):
    # capsule with radius going from ra (at a) to rb (at b)
    ba = b - a; pa = p - a
    h = np.clip((pa @ ba) / (ba @ ba), 0, 1)
    return length(pa - h[..., None]*ba) - (ra + (rb - ra)*h)
def smin(a, b, k):
    h = np.clip(.5 + .5*(b - a)/k, 0, 1)
    return b*(1-h) + a*h - k*h*(1-h)

EA, EB = V([.5,3.0,1.2]), V([.8,3.74,1.1])   # ear base and tip (left)
# joint positions (bind pose)
J = {
 'root':(0,0,0),
 'torso':(0,1.82,-1.1), 'spine01':(0,1.92,-.42), 'spine02':(0,1.95,.3), 'neck':(0,2.02,.8), 'head':(0,2.24,1.04),
 'earL':(.5,3.22,1.2), 'earR':(-.5,3.22,1.2), 'mouth':(0,2.36,1.86), 'eyeL':(.38,2.72,1.85), 'eyeR':(-.38,2.72,1.85),
 'legupperFL':(.42,1.26,.86), 'leglowerFL':(.43,.62,.88), 'footFL':(.43,.13,.96),
 'legupperFR':(-.42,1.26,.86), 'leglowerFR':(-.43,.62,.88), 'footFR':(-.43,.13,.96),
 'thighBL':(.5,1.38,-.84), 'legupperBL':(.53,.92,-.78), 'leglowerBL':(.53,.56,-.96), 'footBL':(.53,.13,-.92),
 'thighBR':(-.5,1.38,-.84), 'legupperBR':(-.53,.92,-.78), 'leglowerBR':(-.53,.56,-.96), 'footBR':(-.53,.13,-.92),
 'tail':(0,1.86,-1.3), 'tail01':(0,1.86,-1.76), 'tail02':(0,1.83,-2.21), 'tail03':(0,1.78,-2.66), 'tailend':(0,1.72,-3.08),
}
J = {k: V(v, float) for k, v in J.items()}
PARENT = {'torso':'root','spine01':'torso','spine02':'spine01','neck':'spine02','head':'neck',
 'earL':'head','earR':'head','mouth':'head','eyeL':'head','eyeR':'head',
 'legupperFL':'spine02','leglowerFL':'legupperFL','footFL':'leglowerFL',
 'legupperFR':'spine02','leglowerFR':'legupperFR','footFR':'leglowerFR',
 'thighBL':'torso','legupperBL':'thighBL','leglowerBL':'legupperBL','footBL':'leglowerBL',
 'thighBR':'torso','legupperBR':'thighBR','leglowerBR':'legupperBR','footBR':'leglowerBR',
 'tail':'torso','tail01':'tail','tail02':'tail01','tail03':'tail02','tailend':'tail03'}
# where each bone points (its main child, or a tip for leaves)
TIP = {'root':J['torso'],'torso':J['spine01'],'spine01':J['spine02'],'spine02':J['neck'],'neck':J['head'],'head':V([0,3.2,1.3]),
 'earL':V([.8,3.74,1.1]),'earR':V([-.8,3.74,1.1]),'mouth':V([0,2.36,2.3]),'eyeL':V([.4,2.75,2.2]),'eyeR':V([-.4,2.75,2.2]),
 'legupperFL':J['leglowerFL'],'leglowerFL':J['footFL'],'footFL':V([.43,.06,1.3]),
 'legupperFR':J['leglowerFR'],'leglowerFR':J['footFR'],'footFR':V([-.43,.06,1.3]),
 'thighBL':J['legupperBL'],'legupperBL':J['leglowerBL'],'leglowerBL':J['footBL'],'footBL':V([.53,.06,-.58]),
 'thighBR':J['legupperBR'],'legupperBR':J['leglowerBR'],'leglowerBR':J['footBR'],'footBR':V([-.53,.06,-.58]),
 'tail':J['tail01'],'tail01':J['tail02'],'tail02':J['tail03'],'tail03':J['tailend'],'tailend':V([0,1.69,-3.42])}
BONES = list(J.keys())

def groups(p):
    """signed distance of every body part, by group"""
    g = {}
    # head: a big soft ball, fluffy cheeks, a little muzzle and chin
    h = sd_ell(p, V([0,2.76,1.42]), V([.95,.84,.97]))
    for s in (1,-1):
        h = smin(h, sd_ell(p, V([.62*s,2.44,1.7]), V([.42,.34,.38])), .18)
    h = smin(h, sd_ell(p, V([0,2.44,2.08]), V([.36,.24,.28])), .14)
    h = smin(h, sd_ell(p, V([0,2.22,1.86]), V([.3,.16,.24])), .12)
    g['head'] = h
    for s, k in ((1,'earL'),(-1,'earR')):
        # ears: rounded cones, flattened front to back
        q = p.copy(); c = V([.5*s,3.2,1.2]); q = (q - c) * V([1,1,2.2]) + c
        g[k] = sd_rcone(q, EA*V([s,1,1]), EB*V([s,1,1]), .46, .1)
    # body: chest, belly, hips, a short neck
    b = sd_ell(p, V([0,1.78,.5]), V([.66,.66,.7]))
    b = smin(b, sd_ell(p, V([0,1.62,-.25]), V([.72,.7,.8])), .25)
    b = smin(b, sd_ell(p, V([0,1.7,-.95]), V([.68,.64,.56])), .25)
    b = smin(b, sd_rcone(p, V([0,1.9,.6]), V([0,2.3,1.1]), .5, .5), .2)
    g['body'] = b
    for s, k in ((1,'L'),(-1,'R')):
        f = sd_rcone(p, V([.42*s,1.3,.84]), V([.43*s,.26,.93]), .29, .23)
        f = smin(f, sd_ell(p, V([.43*s,.15,1.03]), V([.25,.15,.3])), .1)
        g['F'+k] = f
        t = sd_ell(p, V([.5*s,1.15,-.86]), V([.34,.44,.44]))
        t = smin(t, sd_rcone(p, V([.53*s,.82,-.95]), V([.53*s,.26,-.86]), .25, .22), .12)
        t = smin(t, sd_ell(p, V([.53*s,.15,-.8]), V([.25,.15,.3])), .1)
        g['B'+k] = t
    # tail: a fluffy rope that gets a bit thicker toward the round tip
    pts = [J['tail']+V([0,0,.15]), J['tail01'], J['tail02'], J['tail03'], J['tailend'], TIP['tailend']]
    rad = [.2, .23, .27, .3, .32, .26]
    tl = None
    for i in range(len(pts)-1):
        d = sd_rcone(p, pts[i], pts[i+1], rad[i], rad[i+1])
        tl = d if tl is None else smin(tl, d, .06)
    g['tail'] = tl
    return g

BLEND = {'head':.2,'earL':.08,'earR':.08,'body':0,'FL':.12,'FR':.12,'BL':.14,'BR':.14,'tail':.1}
def field(p):
    g = groups(p)
    d = g['body']
    for k, v in g.items():
        if k != 'body': d = smin(d, v, BLEND[k] or .05)
    return d, g

# ---------- surface ----------
step = .028
xs = np.arange(-1.15, 1.15+step, step); ys = np.arange(-.08, 3.9+step, step); zs = np.arange(-3.75, 2.75+step, step)
X, Y, Z = np.meshgrid(xs, ys, zs, indexing='ij')
P = np.stack([X, Y, Z], -1).reshape(-1, 3)
D = np.empty(len(P))
for i in range(0, len(P), 400000): D[i:i+400000] = field(P[i:i+400000])[0]
D = D.reshape(X.shape)
verts, faces, _, _ = measure.marching_cubes(D, 0.0, spacing=(step, step, step))
verts += V([xs[0], ys[0], zs[0]])
# flat paw soles: nothing below the ground
verts[:,1] = np.maximum(verts[:,1], 0.0)
print('mc', len(verts), len(faces), file=sys.stderr)
m = trimesh.Trimesh(verts, faces[:, ::-1] if False else faces, process=True)
target = float(sys.argv[1]) if len(sys.argv) > 1 else .93
v2, f2 = fast_simplification.simplify(m.vertices.astype(np.float32), m.faces.astype(np.int64), target)
m = trimesh.Trimesh(v2, f2, process=True)
trimesh.smoothing.filter_taubin(m, iterations=6)
if m.volume < 0: m.invert()
print('mesh', len(m.vertices), len(m.faces), 'watertight', m.is_watertight, file=sys.stderr)
pos = m.vertices.astype(np.float32); nrm = m.vertex_normals.astype(np.float32); idx = m.faces.astype(np.uint32)

# ---------- skin weights ----------
_, G = field(pos.astype(float))
gn = list(G.keys()); GV = np.stack([G[k] for k in gn], 1)
ALLOW = {'head':['head','neck'], 'earL':['earL','head'], 'earR':['earR','head'],
 'body':['torso','spine01','spine02','neck'],
 'FL':['legupperFL','leglowerFL','footFL','spine02'], 'FR':['legupperFR','leglowerFR','footFR','spine02'],
 'BL':['thighBL','legupperBL','leglowerBL','footBL','torso'], 'BR':['thighBR','legupperBR','leglowerBR','footBR','torso'],
 'tail':['tail','tail01','tail02','tail03','tailend','torso']}
def seg_dist(p, a, b):
    ba = b - a; h = np.clip(((p - a) @ ba) / (ba @ ba), 0, 1); return length(p - a - h[:, None]*ba)
BD = {b: seg_dist(pos.astype(float), J[b], TIP[b]) for b in BONES}
nV = len(pos); W = np.zeros((nV, len(BONES)))
gmin = GV.min(1)
for gi, g in enumerate(gn):
    # this group's influence fades out over a short band past where it stops being the nearest surface
    infl = np.clip(1 - (GV[:, gi] - gmin)/.14, 0, 1)**2
    for b in ALLOW[g]:
        bi = BONES.index(b)
        main = 1.0 if b in ALLOW[g][:len(ALLOW[g])-1] or g == 'body' else .35   # the attach bone only helps at the seam
        W[:, bi] = np.maximum(W[:, bi], infl * main / (BD[b] + .05)**4)
# head and ears stay rigid: no spine pull on the face
hd = BONES.index('head')
headish = (gn.index('head') == GV.argmin(1)) & (pos[:, 1] > 2.3)
W[headish] = 0; W[headish, hd] = 1
for e in ('earL', 'earR'):
    ei = BONES.index(e); ear = (GV.argmin(1) == gn.index(e)) & (pos[:, 1] > 3.1)
    W[ear] = 0; W[ear, ei] = 1
top = np.argsort(-W, 1)[:, :4]
tw = np.take_along_axis(W, top, 1); tw /= tw.sum(1, keepdims=True)
tw[tw < .02] = 0; tw /= tw.sum(1, keepdims=True)
joints = top.astype(np.uint16); weights = tw.astype(np.float32)

# ---------- uv: column 0 = fur, column 5 = inner ear (pink) ----------
uv = np.full((nV, 2), [.06, .5], np.float32)
for e, s in (('earL', 1), ('earR', -1)):
    a, b = EA*V([s,1,1]), EB*V([s,1,1])
    ear = GV.argmin(1) == gn.index(e)
    ax = (b - a)/np.linalg.norm(b - a); rel = pos - a; along = rel @ ax
    radial = length(rel - along[:, None]*ax[None]); frac = along/np.linalg.norm(b-a)
    inner = ear & (nrm[:, 2] > .3) & (frac > .05) & (frac < .85) & (radial < (.46 - .36*frac)*.78)
    uv[inner, 0] = 5.5/8

# ---------- bones: local +Y along the bone ----------
def frame(b):
    y = TIP[b] - J[b]; y = y/np.linalg.norm(y)
    x = V([1., 0, 0]) if abs(y[0]) < .9 else V([0, 0, 1.])
    x = x - y*(x @ y); x /= np.linalg.norm(x); z = np.cross(x, y)
    M = np.eye(4); M[:3, 0], M[:3, 1], M[:3, 2], M[:3, 3] = x, y, z, J[b]; return M
GM = {b: frame(b) for b in BONES}
def quat(R):
    t = np.trace(R)
    if t > 0: s = np.sqrt(t+1)*2; return [(R[2,1]-R[1,2])/s, (R[0,2]-R[2,0])/s, (R[1,0]-R[0,1])/s, .25*s]
    i = int(np.argmax(np.diag(R)))
    if i == 0: s = np.sqrt(1+R[0,0]-R[1,1]-R[2,2])*2; return [.25*s, (R[0,1]+R[1,0])/s, (R[0,2]+R[2,0])/s, (R[2,1]-R[1,2])/s]
    if i == 1: s = np.sqrt(1+R[1,1]-R[0,0]-R[2,2])*2; return [(R[0,1]+R[1,0])/s, .25*s, (R[1,2]+R[2,1])/s, (R[0,2]-R[2,0])/s]
    s = np.sqrt(1+R[2,2]-R[0,0]-R[1,1])*2; return [(R[0,2]+R[2,0])/s, (R[1,2]+R[2,1])/s, .25*s, (R[1,0]-R[0,1])/s]

# ---------- glTF ----------
blob = bytearray(); views = []; accs = []
def add(arr, target=None, typ='VEC3', ctype=5126, minmax=False):
    while len(blob) % 4: blob.append(0)
    off = len(blob); data = arr.tobytes(); blob.extend(data)
    v = {'buffer':0, 'byteOffset':off, 'byteLength':len(data)}
    if target: v['target'] = target
    views.append(v)
    a = {'bufferView':len(views)-1, 'componentType':ctype, 'count':int(arr.shape[0]), 'type':typ}
    if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    accs.append(a); return len(accs)-1
aP = add(pos, 34962, minmax=True); aN = add(nrm, 34962); aT = add(uv, 34962, 'VEC2')
aJ = add(joints, 34962, 'VEC4', 5123); aW = add(weights, 34962, 'VEC4')
aI = add(idx.reshape(-1), 34963, 'SCALAR', 5125)
ibm = np.stack([np.linalg.inv(GM[b]).T.reshape(-1) for b in BONES]).astype(np.float32)   # column-major
aB = add(ibm, None, 'MAT4')
nodes = [{'name':'Cat', 'mesh':0, 'skin':0}, {'name':'Rig', 'scale':[100,100,100], 'children':[]}]
base = len(nodes); ni = {b: base+i for i, b in enumerate(BONES)}
for b in BONES:
    par = PARENT.get(b); L = GM[b] if par is None else np.linalg.inv(GM[par]) @ GM[b]
    nd = {'name':b, 'translation':[float(x) for x in L[:3, 3]], 'rotation':[float(x) for x in quat(L[:3, :3])]}
    kids = [ni[c] for c in BONES if PARENT.get(c) == b]
    if kids: nd['children'] = kids
    nodes.append(nd)
nodes[1]['children'] = [ni['root']]
if len(sys.argv) > 2: png = base64.b64encode(open(sys.argv[2], 'rb').read()).decode()
else:  # a plain white texture: the game's coat shader paints the cat
    import io; from PIL import Image; buf = io.BytesIO(); Image.new('RGBA', (4, 4), (255, 255, 255, 255)).save(buf, 'PNG'); png = base64.b64encode(buf.getvalue()).decode()
G = {'asset':{'version':'2.0', 'generator':'猫猫小岛 cat builder'},
 'scene':0, 'scenes':[{'nodes':[0, 1]}], 'nodes':nodes,
 'meshes':[{'name':'Cat', 'primitives':[{'attributes':{'POSITION':aP, 'NORMAL':aN, 'TEXCOORD_0':aT, 'JOINTS_0':aJ, 'WEIGHTS_0':aW}, 'indices':aI, 'material':0}]}],
 'skins':[{'joints':[ni[b] for b in BONES], 'inverseBindMatrices':aB, 'skeleton':ni['root']}],
 'materials':[{'name':'Cat', 'pbrMetallicRoughness':{'baseColorTexture':{'index':0}, 'metallicFactor':0, 'roughnessFactor':.6}}],
 'textures':[{'source':0, 'sampler':0}], 'samplers':[{}], 'images':[{'uri':'data:image/png;base64,'+png}],
 'accessors':accs, 'bufferViews':views,
 'buffers':[{'byteLength':len(blob), 'uri':'data:application/octet-stream;base64,'+base64.b64encode(bytes(blob)).decode()}]}
open('cat_model.js', 'w').write('// 猫猫小岛 cat: an original rigged mesh generated by tools/cat_model_gen.py\nconst CAT_GLTF = ' + json.dumps(G, separators=(',', ':')) + ';\n')
print('verts', nV, 'tris', len(idx), 'bytes', len(blob), file=sys.stderr)
