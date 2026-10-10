# 경로노트 Android 앱

웹 화면을 APK 안에 포함하는 Capacitor 8 앱입니다. 주소창이나 Vercel 링크를 열지 않으며 `server.url`을 사용하지 않습니다. 앱 이름은 **경로노트**, 패키지는 `com.plucky775.routenote`입니다. Android 7.0(API 24) 이상과 최신 Android System WebView를 사용하세요.

## APK 받기

1. GitHub 저장소의 **Actions → Android APK**를 엽니다.
2. 초록색으로 완료된 실행을 누릅니다. 필요하면 **Run workflow**로 새 빌드를 실행합니다.
3. **Artifacts → RouteNote-Android-test-APK**를 다운로드하고 압축을 풉니다.
4. 안드로이드 휴대폰에 `app-debug.apk`를 전달해 설치합니다. 휴대폰에서 해당 파일 앱의 앱 설치 허용을 요청할 수 있습니다.

아이폰·아이패드는 APK를 설치할 수 없습니다. 빌드 결과는 30일간 보관되며, 만료되면 다시 빌드할 수 있습니다.

## 사용

- 앱 아이콘으로 실행 → 엑셀 불러오기 → 구간별 위치 확인·거리 계산.
- 지도 포함 엑셀 / 엑셀·지도 ZIP / PNG를 만든 뒤 **기기에 파일 저장**을 누르면 Android 파일 저장 위치 선택창이 열립니다.
- **다른 앱으로 공유**로 메일·메신저 등 원하는 앱을 선택할 수 있습니다. 상대방에게 웹주소 대신 APK와 결과 파일을 전달하면 됩니다.
- 최대 50구간, 미계산 행 보존 및 완료된 경로만 그림 생성하는 동작은 웹 버전과 같습니다.
- 앱 화면은 기기에 포함되어 있지만 지도·주소검색·도로경로 계산은 인터넷이 필요합니다. 주소와 좌표는 기존 공개 Photon·OSRM·OpenStreetMap 서비스로 전송됩니다.
- 업데이트는 새 APK를 설치해야 반영됩니다. 웹 배포만으로 설치된 앱이 자동 업데이트되지는 않습니다.

## PC에서 만들기

Node.js 22 이상, JDK 21, Android Studio Otter(2025.2.1) 이상, Android SDK 36을 준비합니다.

```sh
npm ci
npm test
npm run android:open
```

Android Studio에서 기기를 연결해 Run 하거나 Build 메뉴에서 APK를 생성합니다. macOS/Linux 명령줄에서는 `npm run android:apk`, Windows에서는 `npm run android:sync` 후 `cd android` 및 `gradlew.bat assembleDebug`를 실행합니다.

`dist`가 웹 원본입니다. `npm run android:sync`는 이를 `mobile-www`로 복사하고 네이티브 저장·공유 기능을 연결한 뒤 Android assets로 동기화합니다. 생성된 웹 자산과 `node_modules`는 커밋하지 않습니다.

## 정식 배포

GitHub 자동 빌드는 **설치·기능 확인용 debug APK**입니다. 공개 Play Store 등록본이나 고정 서명으로 유지되는 정식 배포본이 아닙니다. CI 실행마다 debug 서명 키가 달라질 수 있어 이전 시험 앱을 삭제한 뒤 설치해야 할 수 있습니다. 삭제 전에 필요한 결과를 저장하세요.

지속적으로 배포하려면 Android Studio의 **Generate Signed Bundle / APK**에서 본인 소유의 서명 키를 만들어 보관하고 동일한 키로 서명합니다. 버전을 올릴 때 `android/app/build.gradle`의 `versionCode`와 `versionName`을 변경하세요. 서명 키·암호·`local.properties`는 GitHub에 올리지 않습니다.

## 주소 노출의 범위

이 앱은 기존 웹사이트 주소 없이 실행됩니다. 그러나 앱을 만들었다고 기존 공개 웹사이트나 GitHub 저장소가 비공개로 바뀌지는 않습니다. 공개 웹서비스를 차단하려면 따로 비공개 처리해야 합니다. APK 분석이나 네트워크 분석까지 막는 보안 기능은 아닙니다. 지도 출처 표시는 유지합니다.

## 검증

`npm test`는 기존 엑셀·50구간·PNG/ZIP 검증에 더해 Android 저장/공유 분기, 취소·실패·중복 탭을 검사합니다. GitHub Actions는 Android 코드 컴파일 및 APK 패키징을 검증합니다. 실제 Android 기기의 파일 선택·저장 위치·공유 앱·지도 서비스 연결은 설치 후 확인해야 합니다.
