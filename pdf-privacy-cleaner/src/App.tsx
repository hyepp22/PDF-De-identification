import { useEffect, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { FileLock2, Upload, ShieldAlert, FileText, CheckCircle2 } from 'lucide-react';
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
type Candidate = { id: string; page: number; kind: string; value: string; selected: boolean };
type PageData = { number: number; text: string; image: string };
function detect(text: string, page: number): Candidate[] {
  const patterns: {kind:string; regex:RegExp}[] = [
    {kind:'이메일',regex:/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi},
    {kind:'전화번호',regex:/(?:01[016789])[- .]?\d{3,4}[- .]?\d{4}/g},
    {kind:'이름 필드',regex:/(?:이름|성명|응답자)\s*[:：]\s*([가-힣]{2,5})/g},
    {kind:'학번 후보',regex:/(?:학번)\s*[:：]\s*([0-9]{3,10})/g}
  ];
  const found: Candidate[] = [];
  for(const {kind,regex} of patterns){for(const match of text.matchAll(regex)){
    const value = (kind==='이름 필드'||kind==='학번 후보') ? match[1] : match[0];
    if(value && !found.some(c=>c.kind===kind && c.value===value && c.page===page)) found.push({id:`${page}-${kind}-${match.index}`,page,kind,value,selected:true});
  }}
  return found;
}
export default function App(){
  const [fileName,setFileName]=useState(''); const [pages,setPages]=useState<PageData[]>([]);
  const [candidates,setCandidates]=useState<Candidate[]>([]); const [mode,setMode]=useState<'preserve'|'rebuild'>('preserve');
  const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [pageIndex,setPageIndex]=useState(0);
  useEffect(()=>()=>{pages.forEach(p=>URL.revokeObjectURL(p.image));},[pages]);
  async function loadFile(file:File){
    setBusy(true);setError('');setPages([]);setCandidates([]);setPageIndex(0);setFileName(file.name);
    try{
      if(file.type!=='application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))throw new Error('PDF 파일만 선택해 주세요.');
      if(file.size>30*1024*1024)throw new Error('첫 버전은 30MB 이하 PDF를 지원합니다.');
      const bytes=new Uint8Array(await file.arrayBuffer()); const pdf=await pdfjs.getDocument({data:bytes}).promise;
      const nextPages:PageData[]=[];const nextCandidates:Candidate[]=[];
      for(let i=1;i<=pdf.numPages;i++){
        const page=await pdf.getPage(i);const content=await page.getTextContent();
        const text=content.items.map(item=>('str' in item?item.str:'')).join(' ');
        const viewport=page.getViewport({scale:1.25});const canvas=document.createElement('canvas');
        canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas를 사용할 수 없습니다.');
        await page.render({canvas,canvasContext:ctx,viewport}).promise;
        nextPages.push({number:i,text,image:canvas.toDataURL('image/png')});
        nextCandidates.push(...detect(text,i));
      }
      setPages(nextPages);setCandidates(nextCandidates);
      if(nextPages.every(p=>!p.text.trim()))setError('텍스트가 추출되지 않았습니다. 스캔 PDF는 현재 지원하지 않습니다.');
    }catch(e){setError(e instanceof Error?e.message:'PDF 처리 중 오류가 발생했습니다.');}
    finally{setBusy(false);}
  }
  return <main className="shell"><header><FileLock2 size={30}/><div><h1>PDF Privacy Cleaner</h1><p>교사용 PDF 개인정보 탐지 · 1단계 프로토타입</p></div></header>
    <div className="notice"><ShieldAlert size={20}/><span><strong>아직 익명화된 PDF를 생성하지 않습니다.</strong> 개인정보 탐지 후보를 확인하는 개발용 버전입니다. 실제 학생 정보로 테스트하지 마세요.</span></div>
    <section className="panel"><h2>1. PDF 불러오기</h2><label className="upload"><Upload/><strong>PDF 파일 선택</strong><span>파일은 브라우저에서 처리되며 앱 서버로 전송하지 않습니다.</span><input type="file" accept="application/pdf,.pdf" onChange={e=>{const f=e.target.files?.[0];if(f)void loadFile(f);e.currentTarget.value='';}}/></label>{busy&&<p role="status">PDF를 분석하고 있습니다…</p>}{error&&<p className="error" role="alert">{error}</p>}{fileName&&<p className="muted">선택 파일: {fileName}</p>}</section>
    <section className="panel"><h2>2. 출력 방식 선택 (향후 구현)</h2><div className="modes"><label><input type="radio" checked={mode==='preserve'} onChange={()=>setMode('preserve')}/> 원본 디자인 유지형</label><label><input type="radio" checked={mode==='rebuild'} onChange={()=>setMode('rebuild')}/> 설문 응답 재구성형</label></div><p className="muted">현재 선택: {mode==='preserve'?'원본 디자인 유지':'응답 재구성'} · PDF 생성 기능은 아직 비활성화되어 있습니다.</p></section>
    {pages.length>0&&<div className="columns"><section className="panel"><h2>3. PDF 미리보기</h2><nav><button disabled={pageIndex===0} onClick={()=>setPageIndex(i=>i-1)}>이전</button><span>{pageIndex+1} / {pages.length} 페이지</span><button disabled={pageIndex===pages.length-1} onClick={()=>setPageIndex(i=>i+1)}>다음</button></nav><img className="preview" src={pages[pageIndex].image} alt={`${pageIndex+1}페이지 PDF 미리보기`}/><details><summary>추출된 텍스트 확인</summary><p className="extracted">{pages[pageIndex].text||'추출된 텍스트 없음'}</p></details></section>
    <section className="panel"><h2>4. 개인정보 탐지 후보</h2><p className="muted">{candidates.length}건 탐지 · 자동 탐지는 누락과 오탐이 있을 수 있습니다.</p>{candidates.length===0?<p>탐지된 후보가 없습니다. 개인정보가 없다는 뜻은 아닙니다.</p>:<div className="results">{candidates.map(c=><label className="result" key={c.id}><input type="checkbox" checked={c.selected} onChange={e=>setCandidates(old=>old.map(x=>x.id===c.id?{...x,selected:e.target.checked}:x))}/><div><strong>{c.value}</strong><small>{c.kind} · {c.page}페이지</small></div></label>)}</div>}<p className="muted">선택한 후보: {candidates.filter(c=>c.selected).length}건</p><button className="disabled" disabled><CheckCircle2 size={17}/> 영구 제거 및 PDF 다운로드 (다음 단계)</button></section></div>}
    <footer><FileText size={16}/> 정적 브라우저 앱 · 업로드 API 및 외부 AI 호출 없음 · 자동 탐지 결과는 검증 전 후보입니다.</footer>
  </main>;
}
