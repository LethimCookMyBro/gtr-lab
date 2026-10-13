"""Explicit-baseline authoring smoke contract; no server or external state."""
import argparse,gzip,hashlib,tempfile,unittest
from pathlib import Path
import build_selector
RAW='699bea11244bcb695fee412bb4668d074c0330550c62385e235b417e78dba7b2'
GZIP='eff3624270a69066857be4c25b8ddd1e352cc5fc78b3041679f858e1323657be'
BASE=None
class Portable(unittest.TestCase):
 def test_explicit_output_and_exact_rebuild(self):
  with tempfile.TemporaryDirectory() as tmp:
   a=Path(tmp)/'a';b=Path(tmp)/'b'
   try:one=build_selector.build(baseline=BASE,output_dir=a)
   except TypeError as e:self.fail('Missing explicit portable baseline/output API: '+str(e))
   two=build_selector.build(baseline=BASE,output_dir=b)
   self.assertEqual(one,two);self.assertEqual(hashlib.sha256(one).hexdigest(),RAW)
   self.assertEqual(hashlib.sha256((a/'candidate.glb.gz').read_bytes()).hexdigest(),GZIP)
   self.assertEqual((a/'provenance.json').read_bytes(),(b/'provenance.json').read_bytes())
   with self.assertRaises(ValueError):build_selector.build(baseline=BASE,output_dir=a)
 def test_requires_explicit_safe_output(self):
  import inspect
  self.assertIn('output_dir',inspect.signature(build_selector.build).parameters,'Missing portable safe-output contract')
  with self.assertRaises((TypeError,ValueError)):build_selector.build(baseline=BASE)
  with self.assertRaises(ValueError):build_selector.build(baseline=BASE,output_dir=Path(build_selector.__file__).parent)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--baseline',type=Path,required=True);args,rest=p.parse_known_args();BASE=args.baseline;unittest.main(argv=[__file__,*rest],verbosity=2)
