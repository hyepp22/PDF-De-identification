# PDF Privacy Cleaner — 이름 탐지 프로토타입

## 시작하기 (Codespaces)

```bash
cd pdf-privacy-cleaner-clean
npm install
npm run build
npm run dev
```

프로젝트 폴더 이름을 바꿨다면 `cd` 경로도 바꿔 주세요. `npm install` 시 PDF.js worker를 `public/`에 로컬 복사합니다. `?url` import를 사용하지 않아 이전 TypeScript 오류를 피합니다.

- 전체 페이지 텍스트 추출 및 가상 학생 이름 명단 대조
- 이메일/전화번호/이름 필드 및 이름 후보 탐지
- 후보 이름별 선택과 페이지 이동
- **영구 삭제 및 익명 PDF 다운로드 기능은 아직 없음**
- 원본 PDF와 학생 명단은 브라우저 내에서 처리되며 별도 업로드 API는 없음

개발 및 테스트에는 가상 개인정보를 사용하세요. 탐지 결과는 오탐과 누락이 있을 수 있습니다.
