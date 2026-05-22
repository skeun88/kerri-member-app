/**
 * Branch.io 딥링크 - 현재 비활성화 (초대 코드 방식 사용 중)
 * 실제 서비스 배포 시 react-native-branch 설정 후 아래 주석 해제
 */

export async function initBranch(_onMemberLinked?: (memberName: string) => void) {
  // Branch 미설정 상태 — no-op
  return () => {};
}
