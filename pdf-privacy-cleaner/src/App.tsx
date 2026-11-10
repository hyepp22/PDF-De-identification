import { useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { FileLock2, Upload, ShieldAlert, FileText, CheckCircle2 } from 'lucide-react';
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
type Candidate = { id: string; page: number; kind: string; value: string; selected: boolean };
type PageData = { number: number; text: string; image: string };
const unique = (items:string[]) => [...new Set(items.map(x=>x.trim()).filter(Boolean))];
function detect(text:string,page:number,names:string[]):Candidate[] {
  const found:Candidate[]=[];
  const add=(kind:string,value:string)=>{if(!found.some(x=>x.kind===kind&&x.value===value))found.push({id:`${page}-${kind}-${value}`,page,kind,value,selected:true});};
  const patterns:{kind:string;regex:RegExp;group?:number}[]=[
    {kind:'이메일',regex:/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi},
    {kind:'전화번호',regex:/(?:01[016789])[- .]?\d{3,4}[- .]?\d{4}/g},
    {kind:'이름 필드',regex:/(?:이름|성명|응답자|작성자)\s*[:：]?\s*([가-힣]{2,5})/g,group:1},
    {kind:'학번 후보',regex:/(?:학번)\s*[:：]?\s*([0-9]{3,10})/g,group:1}
  ];
  for(const p of patterns)for(const m of text.matchAll(p.regex))add(p.kind,m[p.group??0]);
  // 줄 단위 추출을 활용: 이름 + 응답 점수 형태, 단독 이름(카드 상단) 후보
  const lines=text.split(/\n/).map(x=>x.trim()).filter(Boolean);
  const exclusions=new Set(['자료실','응답자','설문지','질문','참여자','총 응답','매우 관심','관심 없음','전혀 모름','모르겠다','그렇다','아니다','이름','성명','학번']);
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    const score=line.match(/^([가-힣]{2,4})\s+(?:[0-9]{1,3}|[①②③④⑤])(?:\s|$)/);
    if(score&&!exclusions.has(score[1]))add('이름 후보(응답)',score[1]);
    const standalone=line.match(/^([가-힣]{2,4})$/);
    if(standalone&&!exclusions.has(standalone[1]) && (lines[i+1]?.includes('202')||lines[i+1]?.includes('질문')||lines[i+1]?.includes('(')))add('이름 후보(작성자)',standalone[1]);
  }
  for(const name of names){
    // 이름 사이 공백이 PDF 추출 과정에서 들어간 경우까지 탐색
    const pattern=new RegExp([...name].map(ch=>ch.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s*'),'g');
    if(pattern.test(text))add('명단 일치',name);
  }
  return found;
}
export default function App(){
  const [fileName,setFileName]=useState(''); const [pages,setPages]=useState<PageData[]>([]);
  const [candidates,setCandidates]=useState<Candidate[]>([]);const [namesInput,setNamesInput]=useState('');
  const [mode,setMode]=useState<'preserve'|'rebuild'>('preserve');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [pageIndex,setPageIndex]=useState(0);
  const names=unique(namesInput.split(/[\n,;\t]+/).map(x=>x.trim())).filter(x=>/^[가-힣]{2,5}$/.test(x));
  function rescan(data=pages){setCandidates(data.flatMap(p=>detect(p.text,p.number,names)));}
  async function loadFile(file:File){
    setBusy(true);setError('');setPages([]);setCandidates([]);setPageIndex(0);setFileName(file.name);
    try{
      if(file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf'))throw new Error('PDF 파일만 선택해 주세요.');
      if(file.size>30*1024*1024)throw new Error('첫 버전은 30MB 이하 PDF를 지원합니다.');
      const bytes=new Uint8Array(await file.arrayBuffer());const pdf=await pdfjs.getDocument({data:bytes}).promise;
      const next:PageData[]=[];
      for(let i=1;i<=pdf.numPages;i++){
        const page=await pdf.getPage(i);const content=await page.getTextContent();
        // PDF 텍스트 조각의 y좌표를 사용해 행을 복원. 인접 이름/숫자 구분 유지.
        const chunks=content.items.filter((item):item is Extract<typeof content.items[number],{str:string}>=>'str' in item);
        const rows:{y:number;parts:{x:number;str:string}[]}[]=[];
        for(const item of chunks){const x=item.transform[4],y=item.transform[5];let row=rows.find(r=>Math.abs(r.y-y)<3);
          if(!row){row={y,parts:[]};rows.push(row);}row.parts.push({x,str:item.str});}
        rows.sort((a,b)=>b.y-a.y);
        const text=rows.map(r=>r.parts.sort((a,b)=>a.x-b.x).map(p=>p.str).join(' ').replace(/\s+/g,' ').trim()).join('\n');
        const viewport=page.getViewport({scale:1.25});const canvas=document.createElement('canvas');
        canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas를 사용할 수 없습니다.');
        await page.render({canvas,canvasContext:ctx,viewport}).promise;
        next.push({number:i,text,image:canvas.toDataURL('image/png')});
      }
      setPages(next);setCandidates(next.flatMap(p=>detect(p.text,p.number,names)));
      if(next.every(p=>!p.text.trim()))setError('텍스트가 추출되지 않았습니다. 스캔 PDF는 지원하지 않습니다.');
    }catch(e){setError(e instanceof Error?e.message:'PDF 처리 중 오류가 발생했습니다.');}finally{setBusy(false);}
  }
  const groups=unique(candidates.map(c=>c.value));
  return <main className="shell"><header><FileLock2 size={30}/><div><h1>PDF Privacy Cleaner</h1><p>교사용 PDF 개인정보 탐지 · 이름 탐지 개선 버전</p></div></header>
    <div className="notice"><ShieldAlert size={20}/><span><strong>아직 익명화된 PDF를 생성하지 않습니다.</strong> 탐지 후보 확인용 개발 버전입니다. 실제 학생 정보 대신 가상 자료로 테스트하세요.</span></div>
    <section className="panel"><h2>1. PDF 불러오기</h2><label className="upload"><Upload/><strong>PDF 파일 선택</strong><span>브라우저에서 처리하며 앱 서버로 업로드하지 않습니다.</span><input type="file" accept="application/pdf,.pdf" onChange={e=>{const f=e.target.files?.[0];if(f)void loadFile(f);e.currentTarget.value='';}}/></label>{busy&&<p role="status">PDF를 분석하고 있습니다…</p>}{error&&<p className="error" role="alert">{error}</p>}{fileName&&<p className="muted">선택 파일: {fileName}</p>}</section>
    <section className="panel"><h2>2. 학생 이름 명단 대조 (선택)</h2><p className="muted">가상의 이름으로 테스트하세요. 한 줄에 한 명 또는 쉼표로 구분합니다. 명단은 서버로 전송되지 않습니다.</p><textarea value={namesInput} onChange={e=>setNamesInput(e.target.value)} rows={4} placeholder={'김가람\n이하늘\n박도윤'} style={{width:'100%',padding:10,borderRadius:8,border:'1px solid #cbd5e1'}}/><p className="muted">유효한 이름 {names.length}명 · 실제 사람 이름과 일반 단어가 혼동될 수 있습니다.</p><button onClick={()=>rescan()} disabled={!pages.length||busy}>전체 페이지 이름 다시 탐지</button></section>
    <section className="panel"><h2>3. 출력 방식 선택 (향후 구현)</h2><div className="modes"><label><input type="radio" checked={mode==='preserve'} onChange={()=>setMode('preserve')}/> 원본 디자인 유지형</label><label><input type="radio" checked={mode==='rebuild'} onChange={()=>setMode('rebuild')}/> 설문 응답 재구성형</label></div><p className="muted">현재 선택: {mode==='preserve'?'원본 디자인 유지':'응답 재구성'} · PDF 생성은 아직 비활성화되어 있습니다.</p></section>
    {pages.length>0&&<div className="columns"><section className="panel"><h2>4. PDF 미리보기</h2><nav><button disabled={pageIndex===0} onClick={()=>setPageIndex(i=>i-1)}>이전</button><span>{pageIndex+1} / {pages.length} 페이지</span><button disabled={pageIndex===pages.length-1} onClick={()=>setPageIndex(i=>i+1)}>다음</button></nav><img className="preview" src={pages[pageIndex].image} alt={`${pageIndex+1}페이지 PDF 미리보기`}/><details><summary>추출된 텍스트 확인</summary><p className="extracted">{pages[pageIndex].text||'추출된 텍스트 없음'}</p></details></section>
    <section className="panel"><h2>5. 개인정보 탐지 후보</h2><p className="muted">{candidates.length}건 탐지 · 이름 후보 {groups.length}종 · 자동 탐지에는 누락과 오탐이 있을 수 있습니다.</p>{candidates.length===0?<p>탐지된 후보가 없습니다. 개인정보가 없다는 뜻은 아닙니다.</p>:<><div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}><button onClick={()=>setCandidates(old=>old.map(c=>({...c,selected:true})))}>전체 선택</button><button onClick={()=>setCandidates(old=>old.map(c=>({...c,selected:false})))}>전체 해제</button></div><div className="results">{groups.map(value=>{const matches=candidates.filter(c=>c.value===value);const all=matches.every(c=>c.selected);return <div className="result" key={value}><input type="checkbox" checked={all} onChange={e=>setCandidates(old=>old.map(c=>c.value===value?{...c,selected:e.target.checked}:c))}/><div style={{flex:1}}><strong>{value}</strong><small>{matches.length}개 페이지 · {matches.map(x=>x.page).join(', ')}페이지</small><small>{unique(matches.map(x=>x.kind)).join(' / ')}</small><button style={{marginTop:5,fontSize:12}} onClick={()=>setPageIndex(matches[0].page-1)}>첫 위치 페이지 보기</button></div></div>;})}</div></>}<p className="muted">선택한 후보: {candidates.filter(c=>c.selected).length}건</p><button className="disabled" disabled><CheckCircle2 size={17}/> 영구 제거 및 PDF 다운로드 (다음 단계)</button></section></div>}
    <footer><FileText size={16}/> 정적 브라우저 앱 · 업로드 API 없음 · 자동 탐지는 검증 전 후보입니다.</footer>
  </main>;
}
