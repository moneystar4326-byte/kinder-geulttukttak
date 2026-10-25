; 제거할 때 사용자 자료 삭제는 따로 묻기 (기본: 남김). 업데이트 설치 중에는 묻지 않음
!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION "태권 글뚝딱 자료(글 · 카드 · 도장 정보 · 설정 · API 키 · 네이버 전용 로그인)도 지울까요?$\r$\n[아니요]를 누르면 자료는 컴퓨터에 남고, 다시 설치하면 이어서 쓸 수 있어요." /SD IDNO IDNO keepData
      RMDir /r "$APPDATA\태권 글뚝딱"
    keepData:
  ${endIf}
!macroend
