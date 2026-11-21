# 오프라인 실행용 외부 라이브러리

이 폴더에는 SKY STRIKE의 3D 화면과 물리 계산에 필요한 외부 라이브러리가 들어 있습니다. 인터넷 연결 없이 게임을 실행할 수 있도록 라이브러리를 게임과 함께 제공합니다. 실행에 필요한 폴더이므로 삭제하지 마세요.

## 파일 구성

| 파일 | 역할 및 원본 패키지 | 버전 | 라이선스 |
| --- | --- | --- | --- |
| [three.js](three.js) | 3D 화면 렌더링. `three`와 모델 해석용 `addons/loaders/GLTFLoader.js` 포함 | 0.180.0 (r180) | MIT |
| [rapier.js](rapier.js) | 기체 이동과 충돌 계산. `@dimforge/rapier3d-compat` | 0.19.1 | Apache-2.0 |
| [SHA256SUMS.txt](SHA256SUMS.txt) | 라이브러리 파일의 무결성을 확인하는 SHA-256 체크섬 | — | — |
| [licenses/](licenses/) | 외부 라이브러리의 라이선스 원문 | — | — |

## 게임에서 사용하는 방식

두 JavaScript 파일은 각각 필요한 코드를 하나로 묶은 **일반 스크립트 형식의 즉시 실행 함수(IIFE)**입니다.

- Three.js는 `window.THREE`를 제공하며, 여기에 `THREE.GLTFLoader`가 포함되어 있습니다.
- Rapier는 `window.RAPIER`를 제공합니다.
- 게임 자체 코드는 별도의 `window.SkyStrike`를 사용합니다.

게임 실행에는 모듈 스크립트, 실행 중 `import`, CDN 접속, 별도 WASM 파일 요청이나 빌드 과정이 필요하지 않습니다.

Rapier의 호환 패키지에는 WebAssembly(WASM) 데이터가 Base64 형태로 포함되어 있습니다. `RAPIER.init()`은 이 내장 데이터를 해석하고 물리 엔진을 초기화합니다. 별도의 `.wasm` 파일을 다운로드하지 않습니다.

라이브러리 내부에는 범용 네트워크 로딩 기능도 있지만, 게임에서는 이를 호출하지 않습니다. 모델은 메모리에 있는 `ArrayBuffer`를 `GLTFLoader.parse()`에 전달해 읽습니다. GLB 안에 메시 데이터가 모두 포함되어 있으며, 외부 텍스처나 외부 파일 주소를 참조하지 않습니다.

## 개발 중 수행한 라이브러리 변환

다음 작업은 개발 단계에서 한 번 수행한 것입니다. 게임을 실행하는 사용자가 다시 진행할 필요는 없습니다.

원본 패키지는 배포용 게임 폴더 밖의 임시 개발 폴더에 npm으로 내려받았습니다. 이후 **esbuild 0.25.10**으로 두 개의 임시 진입 파일을 변환했습니다.

사용한 옵션은 다음과 같습니다.

```text
--bundle --format=iife --minify --legal-comments=eof
```

- **Three.js 진입 파일:** `three`의 전체 내보내기와 `three/addons/loaders/GLTFLoader.js`의 `GLTFLoader`를 가져온 뒤, 두 내용을 합쳐 `window.THREE`에 할당했습니다.
- **Rapier 진입 파일:** `@dimforge/rapier3d-compat`의 기본 내보내기를 가져와 `window.RAPIER`에 할당했습니다.

이 폴더의 코드는 외부 라이브러리를 압축한 배포 파일입니다. 게임 기능을 수정할 때는 일반적으로 [src/](../src/)의 코드를 수정합니다.

## 라이선스와 초기화 경고

라이선스 원문은 다음 파일에 보관되어 있습니다. 게임을 재배포할 때도 함께 유지하세요.

- [Three.js MIT 라이선스](licenses/THREE-MIT.txt)
- [Rapier Apache-2.0 라이선스](licenses/RAPIER-APACHE-2.0.txt)

Apache 라이선스 원문은 공식 `dimforge/rapier.js` 저장소에서 가져왔습니다.

현재 Rapier 호환 번들은 초기화 과정에서 내부 인자 전달 방식에 관한 사용 중단 예정 경고를 출력할 수 있습니다. 확인된 검사에서는 초기화가 정상적으로 완료되었으며, 이 경고는 네트워크 요청을 의미하지 않습니다.

## 검증 범위

초기에는 Node VM에서 네트워크 API가 호출되면 예외가 발생하도록 설정한 뒤, 실제 번들의 `RAPIER.init()`과 GLB 모델 3종의 해석을 확인했습니다.

이후 통합 브라우저에서도 `file://`로 진단을 실행했습니다. 2026-11-21 코드 서식 정리 후 검사에서는 네트워크 API를 차단한 상태로 **43개 항목이 모두 통과**했습니다. 검사에는 물리·전투, WebGL 렌더링, 오디오 PCM 및 주요 기능 연동이 포함됩니다.

이 결과가 다른 모든 브라우저의 호환성, 장시간 성능 또는 실제 스피커 청감을 보장하는 것은 아닙니다.

[오프라인 진단 페이지](../tests.html)를 열면 설치나 서버 없이 현재 브라우저에서 검사할 수 있습니다. 자세한 검사 내용과 한계는 [TESTING.md](../TESTING.md)를 참고하세요.
