"""Deterministic private selector patch. No renderer, network, or shared-repo writes.

Uses the transcript-recovered cap equation and the actual decimated ring anchors.
Subdivision stays inside each original triangle, so projected outline and UV chart
ownership are invariant. A compact C1 normal blend reaches the source cap direction at 1.2 mm.
Geometry is an exact subdivision of the accepted surface, subject only to f32
rounding. This does not restore the original curved cap geometry.
"""
import argparse, copy, gzip, hashlib, json, math, struct
from collections import Counter
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parent
REPO_ROOT=ROOT.parents[1]
BASE=REPO_ROOT/'qa/cabin-preview/r35-contact-ao-static-faces-roughness-uv4.glb.gz'
PIN='ed88ad0eeff561e9c0f36f004fcdd4c3a31601f57865ce335268896e3219f5c0'
CUT=-.00022; SUPPORT=.0012; BANDS=(.0004,SUPPORT)
DTYPES={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}
def load(path):
 raw=gzip.decompress(path.read_bytes()) if path.suffix=='.gz' else path.read_bytes();jl=struct.unpack_from('<I',raw,12)[0]
 return raw,json.loads(raw[20:20+jl]),raw[28+jl:]
def array(j,b,i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];d=np.dtype(DTYPES[a['componentType']]);off=v.get('byteOffset',0)+a.get('byteOffset',0)
 return np.ndarray((a['count'],n),dtype=d,buffer=b,offset=off,strides=(v.get('byteStride',d.itemsize*n),d.itemsize)).copy()
def cap(p,mi):return .541+.004*(mi-163)+.46*p[...,2]-1.7*p[...,0]**2
def profile_weight(t):
 """Compact C1 endpoint constraints for the shading-normal field only."""
 t=float(np.clip(t,0,1));return t*t*(3-2*t)
def norm(p):
 n=np.array([3.4*p[0],1.,-.46]);return n/np.linalg.norm(n)
def boundary_segments(pos,faces,remove):
 counts=Counter(tuple(sorted((int(a),int(b)))) for f in faces[~remove] for a,b in zip(f,np.roll(f,-1)))
 edges=np.array([e for e,n in counts.items() if n==1]);assert len(edges)==88
 return edges,pos[edges][:,:,[0,2]]
def distances(points,segments):
 p=np.asarray(points)[...,[0,2]];a=segments[:,0];v=segments[:,1]-a;t=np.clip(np.einsum('pbi,bi->pb',p[:,None]-a,v)/np.sum(v*v,axis=1),0,1)
 return np.linalg.norm(p[:,None]-a-t[...,None]*v,axis=2).min(axis=1)
def triangulate_polygon(poly):return [[poly[0],poly[i],poly[i+1]] for i in range(1,len(poly)-1)]
def clip(poly,threshold,high):
 out=[]
 for a,b in zip(poly,poly[1:]+poly[:1]):
  ia=a[1]>=threshold-1e-13 if high else a[1]<=threshold+1e-13
  ib=b[1]>=threshold-1e-13 if high else b[1]<=threshold+1e-13
  if ia:out.append(a)
  if ia!=ib:
   t=(threshold-a[1])/(b[1]-a[1]);out.append((a[0]*(1-t)+b[0]*t,threshold))
 # Remove duplicate corner weights from exact threshold hits.
 ded=[]
 for x in out:
  if not ded or np.max(np.abs(ded[-1][0]-x[0]))>1e-11:ded.append(x)
 if len(ded)>1 and np.max(np.abs(ded[0][0]-ded[-1][0]))<1e-11:ded.pop()
 return ded

def rebuild(j,b,mi):
 prim=j['meshes'][mi]['primitives'][0];attrs={k:array(j,b,ai) for k,ai in prim['attributes'].items()};rawpos=attrs['POSITION'];rawfaces=array(j,b,prim['indices']).reshape(-1,3)
 pos,inv=np.unique(rawpos,axis=0,return_inverse=True);faces=inv[rawfaces];res=pos[:,1]-cap(pos,mi);remove=(res[faces]>CUT).any(axis=1)
 edges,segments=boundary_segments(pos,faces,remove);dist=distances(pos,segments);dist[np.unique(edges)]=0
 topedges={tuple(sorted((int(a),int(b)))) for f in faces[remove] for a,b in zip(f,np.roll(f,-1))}
 split={}
 for a,c in sorted(topedges):
  mid=(pos[a].astype(float)+pos[c])/2;dm=float(distances(mid[None],segments)[0])
  if dist[a]<SUPPORT and dist[c]<SUPPORT and dm>SUPPORT:split[(a,c)]=dm
 keys=list(attrs);out={k:[] for k in keys};outfaces=[];face_source=[];provenance=[];lookup={};anchor_rows=set(np.unique(edges));cap_count=0
 # Float64 interpolation is canonicalized in geometric space before float32 export.
 def vertex(fi,w,u,patch):
  nonlocal cap_count
  old=rawfaces[fi];values={k:w@v[old].astype(float) for k,v in attrs.items()};p=values['POSITION'];original=p.copy();t=float(np.clip(u/SUPPORT,0,1));blend=profile_weight(t)
  if patch:
   n=values['NORMAL'];n=n/np.linalg.norm(n);n=n*(1-blend)+norm(p)*blend;values['NORMAL']=n/np.linalg.norm(n)
  row={}
  for k,v in values.items():
   dt=attrs[k].dtype
   if dt.kind in 'ui':v=np.rint(v)
   row[k]=v.astype(dt)
  # Shared positions are rounded to f32 identically independent of face barycentric order.
  key=b''.join(row[k].tobytes() for k in keys)
  if key not in lookup:
   ix=len(provenance);lookup[key]=ix
   for k in keys:out[k].append(row[k])
   provenance.append({'face':int(fi),'weights':w.tolist(),'distance':u,'patch':bool(patch),'blend':blend})
  return lookup[key]
 for fi,(face,old) in enumerate(zip(faces,rawfaces)):
  if not remove[fi]:
   tr=[vertex(fi,np.eye(3)[k],float(dist[face[k]]),False) for k in range(3)];outfaces.append(tr);face_source.append(fi);continue
  # Split only cap-crossing edges whose original endpoints both sit in bevel strips.
  polys=[[(np.eye(3)[i],float(dist[face[i]])) for i in range(3)]]
  for edge,dm in split.items():
   if edge[0] not in face or edge[1] not in face:continue
   ia=int(np.flatnonzero(face==edge[0])[0]);ib=int(np.flatnonzero(face==edge[1])[0]);wa=np.eye(3)[ia];wb=np.eye(3)[ib];wm=(wa+wb)/2
   for pi,poly in enumerate(polys):
    ids=[k for k,x in enumerate(poly) if np.array_equal(x[0],wa) or np.array_equal(x[0],wb)]
    if len(ids)==2:
     other=next(x for k,x in enumerate(poly) if k not in ids);a=poly[ids[0]];c=poly[ids[1]]
     # Preserve winding using original barycentric determinant later.
     polys[pi:pi+1]=[[(wm,dm),a,other],[(wm,dm),other,c]];break
  for tri in polys:
   for lo,hi in [(None,BANDS[0]),(BANDS[0],BANDS[1]),(BANDS[1],None)]:
    poly=tri
    if lo is not None:poly=clip(poly,lo,True)
    if hi is not None:poly=clip(poly,hi,False)
    for q in triangulate_polygon(poly):
     ws=np.array([x[0] for x in q]);det=float(np.linalg.det(ws))
     if abs(det)<1e-11:continue
     if det<0:q=[q[0],q[2],q[1]]
     outfaces.append([vertex(fi,w,u,True) for w,u in q]);face_source.append(fi)
 out={k:np.array(v,dtype=attrs[k].dtype) for k,v in out.items()};outfaces=np.array(outfaces,dtype='<u2')
 return out,outfaces,{'mesh':mi,'oldVertices':len(rawpos),'newVertices':len(out['POSITION']),'oldTriangles':len(rawfaces),'newTriangles':len(outfaces),'removedTopFaces':int(sum(remove)),'boundaryEdges':edges.tolist(),'boundaryPositions':pos[edges].tolist(),'vertices':provenance,'faceSource':face_source,'support':SUPPORT,'bands':BANDS,'cutResidual':CUT}
def encode(j,b):
 jb=json.dumps(j,separators=(',',':'),ensure_ascii=False).encode();jb+=b' '*(-len(jb)%4);b+=b'\0'*(-len(b)%4)
 return struct.pack('<4sII',b'glTF',2,28+len(jb)+len(b))+struct.pack('<II',len(jb),0x4e4f534a)+jb+struct.pack('<II',len(b),0x004e4942)+b
def build(*,baseline=BASE,output_dir=None):
 if output_dir is None:raise ValueError('An explicit output_dir is required')
 output_dir=Path(output_dir).resolve();baseline=Path(baseline).resolve()
 if output_dir==ROOT or output_dir==REPO_ROOT or output_dir in baseline.parents:raise ValueError('Output directory must not overwrite source or baseline directories')
 if output_dir.exists() and any(output_dir.iterdir()):raise ValueError('Output directory must be new or empty; existing files are never overwritten')
 raw,j,b=load(baseline);assert hashlib.sha256(raw).hexdigest()==PIN;output_dir.mkdir(parents=True,exist_ok=True);outpath=output_dir/'candidate.glb';new=copy.deepcopy(j);replacement={};reports=[]
 for mi in [163,164]:
  attrs,idx,report=rebuild(j,b,mi);reports.append(report);p=new['meshes'][mi]['primitives'][0]
  for key,arr in [*attrs.items(),('indices',idx.reshape(-1,1))]:
   ai=p['indices'] if key=='indices' else p['attributes'][key];acc=new['accessors'][ai];assert acc.get('byteOffset',0)==0;replacement[acc['bufferView']]=arr.tobytes();acc['count']=len(arr)
   for ext in ['min','max']:
    if ext in acc:acc[ext]=(arr.min(0) if ext=='min' else arr.max(0)).tolist()
  for node in new['nodes']:
   if node.get('mesh')==mi:
    part=node['extras']['parts'][0];part['vertexCount']=len(attrs['POSITION']);part['indexCount']=idx.size
 out=bytearray()
 for vi,view in enumerate(new['bufferViews']):
  ov=j['bufferViews'][vi];data=replacement.get(vi,b[ov.get('byteOffset',0):ov.get('byteOffset',0)+ov['byteLength']]);out.extend(b'\0'*(-len(out)%4));view['byteOffset']=len(out);view['byteLength']=len(data);out.extend(data)
 new['buffers'][0]['byteLength']=len(out);candidate=encode(new,bytes(out));outpath.write_bytes(candidate)
 (output_dir/'provenance.json').write_text(json.dumps(reports,separators=(',',':'))+'\n')
 manifest={'baseline':{'sha256':PIN,'rawBytes':len(raw)},'candidate':{'sha256':hashlib.sha256(candidate).hexdigest(),'rawBytes':len(candidate)},'rawDelta':len(candidate)-len(raw),'targets':[{k:v for k,v in r.items() if k not in ['vertices','faceSource','boundaryEdges','boundaryPositions']} for r in reports],'sourceStatus':'Transcript-reconstructed source, not historical master or factory CAD','privateOnly':True,'construction':'Accepted-surface subdivision with compact source-derived shading-normal support; no restored quadratic cap geometry'}
 compressed=gzip.compress(candidate,compresslevel=9,mtime=0);Path(str(outpath)+'.gz').write_bytes(compressed)
 manifest['candidate'].update(gzipBytes=len(compressed),gzipSha256=hashlib.sha256(compressed).hexdigest())
 (output_dir/'build-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps(manifest,indent=2))
 return candidate
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--baseline',type=Path,default=BASE);parser.add_argument('--out-dir',type=Path,required=True,help='New or empty directory for the rebuilt candidate and proof files')
 args=parser.parse_args();build(baseline=args.baseline,output_dir=args.out_dir)
