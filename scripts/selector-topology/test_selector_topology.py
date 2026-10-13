"""Private artifact contract; baseline is the RED control before candidate exists."""
import gzip, hashlib, json, struct, unittest
from pathlib import Path
from collections import Counter
import numpy as np
ROOT=Path(__file__).resolve().parent
REPO_ROOT=ROOT.parents[1]
BASE=REPO_ROOT/'qa/cabin-preview/r35-contact-ao-static-faces-roughness-uv4.glb.gz'
CAND=REPO_ROOT/'qa/cabin-preview/r35-cabin-selector-topology.glb.gz'
PIN='ed88ad0eeff561e9c0f36f004fcdd4c3a31601f57865ce335268896e3219f5c0'
TARGETS=(163,164)
def load(path):
 raw=gzip.decompress(path.read_bytes()) if path.suffix=='.gz' else path.read_bytes()
 jl=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+jl]);return raw,j,raw[28+jl:]
def array(j,b,i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dtype={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]
 size=np.dtype(dtype).itemsize*n;off=v.get('byteOffset',0)+a.get('byteOffset',0)
 return np.ndarray((a['count'],n),dtype=dtype,buffer=b,offset=off,strides=(v.get('byteStride',size),np.dtype(dtype).itemsize)).copy()
def payload(j,b,i):return array(j,b,i).tobytes()
def data(j,b,mi):
 p=j['meshes'][mi]['primitives'][0];return {k:array(j,b,v) for k,v in p['attributes'].items()},array(j,b,p['indices']).reshape(-1,3)
def cap(p,mi):return .541+.004*(mi-163)+.46*p[:,2]-1.7*p[:,0]**2
def cross2(a,b):return a[:,0]*b[:,1]-a[:,1]*b[:,0]
def normal(p):
 n=np.column_stack((3.4*p[:,0],np.ones(len(p)),np.full(len(p),-.46)));return n/np.linalg.norm(n,axis=1)[:,None]
class Contract(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.br,cls.bj,cls.bb=load(BASE);cls.cr,cls.cj,cls.cb=load(CAND if CAND.exists() else BASE)
 def test_00_source_pin(self):self.assertEqual(hashlib.sha256(self.br).hexdigest(),PIN)
 def test_01_explicit_cap_support_exists(self):
  for mi in TARGETS:
   a,f=data(self.cj,self.cb,mi);p=a['POSITION'];n=a['NORMAL'];on=np.abs(p[:,1]-cap(p,mi))<8e-8;aligned=np.einsum('ij,ij->i',n,normal(p))>1-2e-7
   self.assertGreaterEqual(np.count_nonzero(aligned),120,'Missing source-derived cap-normal supports')
   self.assertGreaterEqual(np.count_nonzero(np.all(aligned[f],axis=1)),80,'Missing cap-normal-only faces bounded by support contours')
 def test_02_unaffected_primitives_and_metadata_exact(self):
  for mi,m in enumerate(self.bj['meshes']):
   if mi in TARGETS:continue
   self.assertEqual(m,self.cj['meshes'][mi])
   for p in m['primitives']:
    for ai in [p['indices'],*p['attributes'].values()]:self.assertEqual(payload(self.bj,self.bb,ai),payload(self.cj,self.cb,ai))
  for key in ['materials','textures','images','samplers','scenes','scene','extensionsUsed','extensionsRequired']:
   self.assertEqual(self.bj.get(key),self.cj.get(key),key)
  for im in self.bj['images']:
   vi=im['bufferView'];a=self.bj['bufferViews'][vi];b=self.cj['bufferViews'][vi]
   self.assertEqual(self.bb[a['byteOffset']:a['byteOffset']+a['byteLength']],self.cb[b['byteOffset']:b['byteOffset']+b['byteLength']])
 def test_03_closed_manifold_no_degenerates(self):
  for mi in TARGETS:
   a,f=data(self.cj,self.cb,mi);p,inv=np.unique(a['POSITION'],axis=0,return_inverse=True);f=inv[f]
   e=Counter(tuple(sorted((int(x),int(y)))) for t in f for x,y in zip(t,np.roll(t,-1)))
   self.assertTrue(all(n==2 for n in e.values()),Counter(e.values()))
   cross=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]])
   self.assertGreater(np.min(np.linalg.norm(cross,axis=1)),1e-12)
   self.assertEqual(len(p)-len(e)+len(f),0)
 def test_04_budget_and_draw_ownership(self):
  nt=lambda j:sum(j['accessors'][p['indices']]['count']//3 for m in j['meshes'] for p in m['primitives'])
  self.assertLessEqual(nt(self.cj)-nt(self.bj),2000);self.assertLessEqual(len(self.cr)-len(self.br),100000)
  self.assertEqual(len(self.bj['meshes']),len(self.cj['meshes']))
  for mi in TARGETS:
   old=self.bj['meshes'][mi]['primitives'];new=self.cj['meshes'][mi]['primitives'];self.assertEqual(len(old),len(new));self.assertEqual(old[0]['material'],new[0]['material']);self.assertEqual(set(old[0]['attributes']),set(new[0]['attributes']))
 def test_05_normals_and_uv_ranges_finite(self):
  for mi in TARGETS:
   a,_=data(self.cj,self.cb,mi);old,_=data(self.bj,self.bb,mi)
   for k,v in a.items():
    self.assertTrue(np.all(np.isfinite(v)))
    if k.startswith('TEXCOORD'):
     self.assertTrue(np.all(v.min(0)>=old[k].min(0)-1e-6));self.assertTrue(np.all(v.max(0)<=old[k].max(0)+1e-6))
   self.assertTrue(np.allclose(np.linalg.norm(a['NORMAL'],axis=1),1,atol=2e-6))
 def test_06_continuous_projected_outline_and_uv_ownership(self):
  prov=json.loads((ROOT/'provenance.json').read_text())
  for r in prov:
   mi=r['mesh'];old,of=data(self.bj,self.bb,mi);new,nf=data(self.cj,self.cb,mi)
   self.assertEqual(len(r['vertices']),len(new['POSITION']))
   for vi,v in enumerate(r['vertices']):
    w=np.array(v['weights']);oi=of[v['face']];self.assertGreaterEqual(w.min(),-1e-12);self.assertAlmostEqual(w.sum(),1,places=12)
    p=w@old['POSITION'][oi].astype(float)
    self.assertTrue(np.allclose(new['POSITION'][vi],p,rtol=0,atol=3.1e-8),'Candidate left original triangle surface')
    if not v['patch']:
     for key in old:self.assertEqual(new[key][vi].tobytes(),(w@old[key][oi].astype(float)).astype(old[key].dtype).tobytes())
    for key in old:
     if key.startswith('TEXCOORD'):
      expected=w@old[key][oi].astype(float)
      if old[key].dtype.kind in 'ui':expected=np.rint(expected)
      self.assertEqual(new[key][vi].tobytes(),expected.astype(old[key].dtype).tobytes(),key)
   # Every projected old top triangle is partitioned with the same positive area.
   # Together with welded manifold proof, this proves the full silhouette boundary,
   # rather than checking only four coordinate extrema.
   oldcross=cross2(old['POSITION'][of[:,1]][:,[0,2]]-old['POSITION'][of[:,0]][:,[0,2]],old['POSITION'][of[:,2]][:,[0,2]]-old['POSITION'][of[:,0]][:,[0,2]])
   newcross=cross2(new['POSITION'][nf[:,1]][:,[0,2]]-new['POSITION'][nf[:,0]][:,[0,2]],new['POSITION'][nf[:,2]][:,[0,2]]-new['POSITION'][nf[:,0]][:,[0,2]])
   sums=np.bincount(r['faceSource'],weights=newcross,minlength=len(of))
   self.assertTrue(np.allclose(sums,oldcross,atol=3e-10,rtol=2e-5),float(np.max(np.abs(sums-oldcross))))
   self.assertTrue(np.all(newcross*oldcross[np.array(r['faceSource'])]>=-1e-16))
   # Every exact shell/outline transition segment remains as an edge in the output.
   p=new['POSITION'];edgepos={tuple(sorted((p[a].tobytes(),p[b].tobytes()))) for f in nf for a,b in zip(f,np.roll(f,-1))}
   for edge in r['boundaryPositions']:
    key=tuple(sorted(np.array(edge,dtype='<f4')[i].tobytes() for i in [0,1]));self.assertIn(key,edgepos)
 def test_07_profile_has_zero_endpoint_slope(self):
  import build_selector
  fn=getattr(build_selector,'profile_weight',lambda t:t)
  h=1e-5
  self.assertEqual(fn(0.),0.);self.assertEqual(fn(1.),1.)
  self.assertLess(abs((fn(h)-fn(0))/h),1e-4,'Missing C1 shell transition')
  self.assertLess(abs((fn(1)-fn(1-h))/h),1e-4,'Missing cap tangency')
 def test_08_cap_and_boundary_normal_coordination(self):
  for r in json.loads((ROOT/'provenance.json').read_text()):
   mi=r['mesh'];old,of=data(self.bj,self.bb,mi);new,nf=data(self.cj,self.cb,mi)
   for vi,v in enumerate(r['vertices']):
    if not v['patch']:continue
    p=new['POSITION'][vi];n=new['NORMAL'][vi]
    if v['distance']>=r['support']-1e-10:
     self.assertGreater(float(n@normal(p[None])[0]),1-2e-7)
    if v['distance']<1e-12:
     target=np.array(v['weights'])@old['NORMAL'][of[v['face']]];target/=np.linalg.norm(target)
     self.assertTrue(np.allclose(n,target,atol=1e-7))
   groups={}
   for p,n in zip(new['POSITION'],new['NORMAL']):groups.setdefault(p.tobytes(),[]).append(n)
   original={}
   for p,n in zip(old['POSITION'],old['NORMAL']):original.setdefault(p.tobytes(),[]).append(n)
   oldseams={k for k,ns in original.items() if np.linalg.norm(np.array(ns)-ns[0],axis=1).max()>5e-6}
   newseams={k for k,ns in groups.items() if np.linalg.norm(np.array(ns)-ns[0],axis=1).max()>5e-6}
   self.assertEqual(newseams,oldseams,'No added or erased hard seams')
   for k in oldseams:self.assertEqual({n.tobytes() for n in original[k]},{n.tobytes() for n in groups[k]})
 def test_09_no_opposed_vertex_normals(self):
  for mi in TARGETS:
   a,f=data(self.cj,self.cb,mi);p=a['POSITION'];n=a['NORMAL'];fn=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]]);fn/=np.linalg.norm(fn,axis=1)[:,None]
   dots=np.einsum('fi,fvi->fv',fn,n[f])
   self.assertGreater(float(dots.min()),0.,'Vertex normal opposes geometric face')
 def test_10_exact_three_axis_extrema(self):
  for mi in TARGETS:
   old,_=data(self.bj,self.bb,mi);new,_=data(self.cj,self.cb,mi)
   self.assertTrue(np.array_equal(old['POSITION'].min(0),new['POSITION'].min(0)))
   self.assertTrue(np.array_equal(old['POSITION'].max(0),new['POSITION'].max(0)))
 def test_11_face_normals_preserve_original_orientation(self):
  for r in json.loads((ROOT/'provenance.json').read_text()):
   mi=r['mesh'];old,of=data(self.bj,self.bb,mi);new,nf=data(self.cj,self.cb,mi)
   def fn(a,f):
    p=a['POSITION'].astype(float);n=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]]);return n/np.linalg.norm(n,axis=1)[:,None]
   dots=np.einsum('ij,ij->i',fn(old,of)[r['faceSource']],fn(new,nf))
   self.assertGreater(float(dots.min()),.999,'Subdivision changed geometric face orientation')
 def test_12_document_scope_and_node_ownership(self):
  import copy
  for key in self.bj:
   if key not in ['accessors','bufferViews','buffers','nodes']:self.assertEqual(self.bj[key],self.cj[key],key)
  cn=copy.deepcopy(self.cj['nodes'])
  for i,node in enumerate(self.bj['nodes']):
   if node.get('mesh') in TARGETS:
    mi=node['mesh'];a,f=data(self.cj,self.cb,mi);part=cn[i]['extras']['parts'][0]
    self.assertEqual(part['vertexCount'],len(a['POSITION']));self.assertEqual(part['indexCount'],f.size)
    part['vertexCount']=node['extras']['parts'][0]['vertexCount'];part['indexCount']=node['extras']['parts'][0]['indexCount']
  self.assertEqual(self.bj['nodes'],cn)
  changed={v for mi in TARGETS for v in [self.bj['meshes'][mi]['primitives'][0]['indices'],*self.bj['meshes'][mi]['primitives'][0]['attributes'].values()]}
  for i,a in enumerate(self.bj['accessors']):
   if i not in changed:self.assertEqual(a,self.cj['accessors'][i])
if __name__=='__main__':unittest.main(verbosity=2)
