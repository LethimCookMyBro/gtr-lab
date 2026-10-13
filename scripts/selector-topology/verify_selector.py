"""Run the CPU-only frozen selector contract; emits one JSON report on stdout."""
import argparse,gzip,hashlib,io,json,unittest
from pathlib import Path
import test_selector_topology as contract
RAW_PIN='699bea11244bcb695fee412bb4668d074c0330550c62385e235b417e78dba7b2'
GZIP_PIN='eff3624270a69066857be4c25b8ddd1e352cc5fc78b3041679f858e1323657be'
def inspect_selector_candidate(baseline,candidate,provenance=None):
 contract.BASE=Path(baseline);contract.CAND=Path(candidate)
 if provenance is not None:
  if Path(provenance).name!='provenance.json':raise ValueError('The frozen inspector requires the exact provenance.json basename')
  contract.ROOT=Path(provenance).parent
 raw=contract.CAND.read_bytes()
 if contract.CAND.suffix=='.gz':
  if hashlib.sha256(raw).hexdigest()!=GZIP_PIN:raise AssertionError('Compressed input is not the frozen gzip artifact')
  raw=gzip.decompress(raw)
 if hashlib.sha256(raw).hexdigest()!=RAW_PIN:raise AssertionError('Candidate is not the frozen private model')
 stream=io.StringIO();result=unittest.TextTestRunner(stream=stream,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(contract.Contract))
 if not result.wasSuccessful():raise AssertionError(stream.getvalue())
 report={'baseline':{'sha256':contract.PIN},'candidate':{'sha256':RAW_PIN,'rawBytes':len(raw)},'construction':'Accepted-surface subdivision with compact source-derived shading-normal support; no restored quadratic cap geometry'}
 report['verified']=True;report['tests']=result.testsRun;report['testLog']=stream.getvalue()
 return report
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--baseline',type=Path,default=contract.BASE);p.add_argument('--candidate',type=Path,default=contract.CAND);p.add_argument('--provenance',type=Path,default=contract.ROOT/'provenance.json');args=p.parse_args()
 print(json.dumps(inspect_selector_candidate(args.baseline,args.candidate,args.provenance),indent=2))
