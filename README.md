# 농가 경영진단 AI 대시보드

농촌진흥청 작목별 경영 데이터(2024, 29작목)를 기반으로 한 농가 경영진단·판매경로 컨설팅 대시보드.

- **데이터**: 농진청 농사로 작목별 평균 경영지표(공개 데이터)
- **기능**: 작목별 수익성 비교 · 내농가 진단 · 판매경로 진단(TOPSIS) · 공공데이터 카탈로그
- **운영**: 대전중앙청과(주) × 송자비스 AI 교차검증

## 보기

GitHub Pages: https://songt-50.github.io/agr-dashboard/

스마트폰에서 "홈 화면에 추가"하면 앱처럼 아이콘으로 실행됩니다 (PWA).

## 로컬 실행

```bash
python -m http.server 8765
# http://localhost:8765/
```

데이터는 `fetch`로 로드되어 `file://` 직접 열기는 안 됩니다 (HTTP 서버 필요).

## 구조

- `index.html` — 단일 페이지 앱 (탭 기반)
- `data/income_2024.json` — 작목별 경영지표 (29작목, 단일 소스)
- `data/pubdata-catalog.json` — 공공데이터 카탈로그
- `data/rda-cases.sample.json` — 판매경로 진단 케이스 샘플
- `manifest.json` / `sw.js` — PWA (홈화면 설치 + 오프라인)
