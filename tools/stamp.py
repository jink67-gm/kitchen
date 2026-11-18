"""업데이트할 때마다 파일 주소에 버전 표시(?v=...)를 붙임.
브라우저(특히 웨일북·크롬북)가 새 화면과 옛 프로그램 파일을 섞어 쓰다 멈추는 것을 막음.
사용: python3 tools/stamp.py  (올리기 직전에 실행. vendor·tests 폴더는 건드리지 않음)"""
import re, pathlib, datetime, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
V = sys.argv[1] if len(sys.argv) > 1 else datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M')
IMP = re.compile(r"""((?:\bfrom|\bimport)\s*\(?\s*)(['"])(\.{1,2}/(?!vendor/)[^'"?]+\.js)(?:\?v=[\w.-]+)?\2""")
n = 0
for f in ROOT.rglob('*.js'):
    rel = f.relative_to(ROOT).as_posix()
    if rel.startswith(('vendor/', 'tests/', 'node_modules/', 'tools/')): continue
    s = f.read_text(encoding='utf-8'); t = IMP.sub(lambda m: f"{m.group(1)}{m.group(2)}{m.group(3)}?v={V}{m.group(2)}", s)
    if t != s: f.write_text(t, encoding='utf-8'); n += 1
h = ROOT / 'index.html'; s = h.read_text(encoding='utf-8')
t = re.sub(r'((?:src|href)=")((?:game|qr)\.js|(?:style|theme)\.css)(?:\?v=[\w.-]+)?"', lambda m: f'{m.group(1)}{m.group(2)}?v={V}"', s)
if t != s: h.write_text(t, encoding='utf-8'); n += 1
print(f'버전 {V} 표시: 파일 {n}개')
# 올리기 전 문법 검사: 하나라도 틀리면 알려 주고 실패로 끝냄 (3D가 꺼지는 등의 사고 방지)
import subprocess
bad = []
for f in sorted(ROOT.glob('*.js')) + [ROOT / 'assets/icons/map.js']:
    r = subprocess.run(['node', '--input-type=module', '--check'], stdin=open(f, 'rb'), capture_output=True, text=True)
    if r.returncode: bad.append(f'{f.name}: {r.stderr.strip().splitlines()[-1] if r.stderr.strip() else "오류"}')
if bad: print('문법 오류!\n' + '\n'.join(bad)); sys.exit(1)
print('문법 검사 통과')
