import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '../../lib/theme';

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>개인정보 처리방침</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.mainTitle}>케리 멤버 개인정보 처리방침</Text>
        <Text style={styles.effectiveDate}>시행일: 2026년 11월 3일</Text>
        <Body>케리(이하 "회사")는 케리 멤버 앱 및 이에 연결된 서비스(이하 "서비스")를 제공하면서 이용자의 개인정보를 중요하게 보호합니다. 회사는 「개인정보 보호법」 등 관계 법령을 준수하며, 개인정보의 처리 목적, 처리 항목, 보유 기간, 위탁 및 국외 이전에 관한 사항을 다음과 같이 공개합니다.</Body>

        <Section title="제1조 개인정보의 처리 목적">
          <Body>회사는 다음 목적을 위해 개인정보를 처리합니다.</Body>
          <Numbered items={[
            '회원 식별, 본인 확인, 계정 생성·관리 및 서비스 이용 자격 확인',
            '담당 코치 연결, 레슨 일정·출석·결석·보강·잔여 횟수 및 결제 상태 관리',
            '코치와 회원 간 메시지, 알림 및 고객 문의 처리',
            '레슨 기록, 코칭 피드백, 이전 레슨 대비 변화 및 AI 레슨 리포트 제공',
            '서비스 안정성 확보, 부정 이용 방지, 오류 확인 및 법적 분쟁 대응',
            '법령상 의무 이행 및 이용자의 권리 행사 처리',
          ]} />
        </Section>

        <Section title="제2조 처리하는 개인정보 항목">
          <SubSection title="1. 회원 및 프로필 정보">
            <InfoRow label="처리 항목" value="이름, 이메일, 생년월일, 거주 지역(동 단위), 프로필 이미지, 회원 등급" />
            <InfoRow label="처리 목적" value="계정·프로필 관리와 맞춤형 서비스 제공" />
          </SubSection>
          <SubSection title="2. 레슨 운영 정보">
            <InfoRow label="처리 항목" value="담당 코치, 레슨 일정·장소·시간, 출석·결석·취소·보강 신청, 잔여 레슨 횟수, 레슨권 및 이용 상태" />
            <InfoRow label="처리 목적" value="레슨 예약·운영·이력 관리" />
          </SubSection>
          <SubSection title="3. 결제 및 정산 정보">
            <InfoRow label="처리 항목" value="결제 금액·일시·상태, 미납·완납·환불 및 거래 기록" />
            <InfoRow label="처리 목적" value="결제 확인, 환불 및 분쟁 대응" />
          </SubSection>
          <SubSection title="4. 메시지 및 알림 정보">
            <InfoRow label="처리 항목" value="코치·회원 간 메시지 내용, 알림 내용, 읽음 여부" />
            <InfoRow label="처리 목적" value="소통, 서비스 알림 및 문의 대응" />
          </SubSection>
          <SubSection title="5. 레슨 기록">
            <InfoRow label="처리 항목" value="레슨 요약, 교정 포인트, 다음 목표, 이전 레슨 대비 변화, 코치 작성 기록, AI 분석 결과" />
            <InfoRow label="처리 목적" value="레슨 리포트와 성장 기록 제공" />
          </SubSection>
          <SubSection title="6. AI 음성 분석 정보">
            <InfoRow label="처리 항목" value="레슨 음성 파일, 음성에서 변환된 텍스트" />
            <InfoRow label="처리 목적" value="음성 인식과 AI 레슨 리포트 생성" />
            <Body>AI 음성 분석 정보는 이용자의 선택 동의를 받은 경우에만 처리합니다.</Body>
          </SubSection>
          <SubSection title="7. 자동 생성 정보">
            <InfoRow label="처리 항목" value="푸시 토큰, 운영체제, 기기 종류, 앱 버전, IP 주소, 접속 일시 및 이용 기록" />
            <InfoRow label="처리 목적" value="푸시 알림, 보안 및 장애 대응" />
          </SubSection>
          <SubSection title="8. 고객 문의 정보">
            <InfoRow label="처리 항목" value="문의 내용, 연락처 및 처리 내역" />
            <InfoRow label="처리 목적" value="문의 접수와 답변" />
          </SubSection>
          <Body>회사는 현재 맞춤형 광고 또는 이용행태 분석을 위한 제3자 분석·오류 추적 SDK를 사용하지 않습니다. 향후 관련 도구를 도입하는 경우 개인정보 처리방침을 개정하고 필요한 동의를 받겠습니다.</Body>
        </Section>

        <Section title="제3조 개인정보의 수집 방법">
          <Body>회사는 다음 방법으로 개인정보를 수집합니다.</Body>
          <Numbered items={[
            '회원가입, 초대 코드 입력, 온보딩, 프로필 수정 및 서비스 이용 과정에서 이용자가 직접 입력',
            '담당 코치가 레슨 운영과 기록 작성 과정에서 입력',
            '레슨 예약, 출석, 결제, 메시지 및 푸시 알림 이용 과정에서 자동 생성',
            '고객 문의, 카카오톡 채널 등 이용자가 선택한 상담 채널을 통해 제공',
          ]} />
          <Body>카카오톡 채널로 이동한 이후의 개인정보 처리에는 카카오의 개인정보 처리방침이 적용될 수 있습니다.</Body>
        </Section>

        <Section title="제4조 개인정보의 보유 및 이용 기간">
          <Body>회사는 원칙적으로 개인정보의 처리 목적이 달성되거나 회원이 탈퇴하면 지체 없이 개인정보를 파기합니다. 다만 관계 법령에 따라 보존해야 하는 정보는 해당 기간 동안 다른 개인정보와 분리하여 보관합니다.</Body>
          <RetentionTable items={[
            { item: '회원·프로필·레슨·메시지·AI 분석 결과', period: '회원 탈퇴 또는 처리 목적 달성 시까지' },
            { item: 'AI 분석용 원본 음성', period: '분석 완료 시까지 보관 후 지체 없이 삭제' },
            { item: '계약 또는 청약철회 등에 관한 기록', period: '5년' },
            { item: '대금결제 및 재화·서비스 공급에 관한 기록', period: '5년' },
            { item: '소비자 불만 또는 분쟁 처리에 관한 기록', period: '3년' },
            { item: '표시·광고에 관한 기록', period: '6개월' },
          ]} />
          <Body>법령에 따른 보관 기간이 끝나면 해당 정보는 지체 없이 파기합니다. 탈퇴 후에도 법령상 보관 대상 정보는 별도로 보관하며 서비스 이용 목적으로 사용하지 않습니다.</Body>
        </Section>

        <Section title="제5조 개인정보의 제3자 제공">
          <Body>회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만 레슨 서비스 제공을 위해 이용자가 연결한 담당 코치에게 다음 정보를 제공할 수 있으며, 회원 연결 또는 별도 동의를 통해 제공합니다.</Body>
          <View style={styles.thirdPartyCard}>
            <InfoRow label="제공받는 자" value="회원이 연결한 담당 코치" />
            <InfoRow label="제공 항목" value="이름, 프로필 정보, 생년월일, 거주 지역, 레슨 일정, 출석 정보, 결제 상태, 메시지 및 레슨 기록" />
            <InfoRow label="제공 목적" value="레슨 운영, 회원과의 소통 및 코칭 기록 작성" />
            <InfoRow label="보유 기간" value="코치 연결 종료, 회원 탈퇴 또는 처리 목적 달성 시까지" last />
          </View>
          <Body>이용자는 개인정보 제3자 제공 동의를 거부할 수 있으나, 이 경우 담당 코치 연결과 레슨 관리 기능 이용이 제한될 수 있습니다.</Body>
          <Body>수사기관 등 관계 기관이 법률에 정한 절차에 따라 요청하는 경우에는 이용자의 동의 없이 개인정보가 제공될 수 있습니다.</Body>
        </Section>

        <Section title="제6조 개인정보 처리의 위탁">
          <Body>회사는 원활한 서비스 제공을 위해 다음과 같이 개인정보 처리 업무를 외부 전문업체에 위탁합니다.</Body>
          <DelegateTable items={[
            { org: 'Supabase Pte. Ltd. 및 관련 하위처리자', task: '데이터베이스, 회원 인증, 파일 저장, 서버 운영 및 지원', data: '서비스 제공 과정에서 처리되는 회원 정보' },
            { org: '650 Industries, Inc. (Expo)', task: '푸시 알림 중계', data: '푸시 토큰, 기기 플랫폼 및 알림 내용' },
            { org: 'Apple Inc. 및 Google LLC', task: 'iOS 및 Android 푸시 알림 최종 전송', data: '푸시 토큰 및 알림 내용' },
            { org: 'OpenAI, L.L.C.', task: '레슨 음성의 텍스트 변환', data: '레슨 음성 파일' },
            { org: 'Anthropic PBC', task: 'AI 레슨 리포트 생성', data: '음성에서 변환된 텍스트' },
          ]} />
          <Body>회사는 수탁자를 계약과 점검을 통해 관리하며, 위탁 내용 또는 업체가 변경되는 경우 본 개인정보 처리방침에 반영합니다.</Body>
        </Section>

        <Section title="제7조 개인정보의 국외 이전">
          <Body>회사는 클라우드 인프라, 푸시 알림 및 AI 분석 기능 제공을 위해 개인정보를 국외에서 처리합니다. 핵심 데이터베이스의 주 저장 리전은 일본 도쿄(ap-northeast-1)입니다.</Body>

          <SubSection title="1. Supabase 및 관련 하위처리자">
            <InfoRow label="이전받는 자" value="Supabase Pte. Ltd., Supabase Inc., Amazon Web Services 등 관련 하위처리자" />
            <InfoRow label="이전 국가" value="싱가포르, 미국, 일본 등" />
            <InfoRow label="이전 항목" value="회원정보, 인증정보, 레슨정보, 결제 상태, 메시지, 레슨 기록 및 파일 등 서비스 데이터" />
            <InfoRow label="이전 목적" value="데이터베이스, 회원 인증, 파일 저장 및 서버 운영 지원" />
            <InfoRow label="이전 방법" value="회원가입 및 서비스 이용 시 암호화된 통신망을 통해 전송" />
            <InfoRow label="보유 기간" value="회원 탈퇴 또는 처리 목적 달성 시까지. 백업 데이터는 제공업체의 삭제 주기에 따라 삭제됩니다." />
          </SubSection>
          <SubSection title="2. Expo, Apple 및 Google">
            <InfoRow label="이전받는 자" value="650 Industries, Inc., Apple Inc., Google LLC" />
            <InfoRow label="이전 국가" value="미국" />
            <InfoRow label="이전 항목" value="푸시 토큰, 기기 플랫폼 및 알림 내용" />
            <InfoRow label="이전 목적" value="푸시 알림 중계 및 최종 전달" />
            <InfoRow label="이전 방법" value="알림 발송 시 암호화된 통신망을 통해 전송" />
            <InfoRow label="보유 기간" value="알림 전송 완료 등 처리 목적 달성에 필요한 기간. Expo는 알림 전달에 필요한 기간을 초과하여 알림 내용을 저장하지 않습니다." />
          </SubSection>
          <SubSection title="3. OpenAI">
            <InfoRow label="이전받는 자" value="OpenAI, L.L.C." />
            <InfoRow label="이전 국가" value="미국" />
            <InfoRow label="이전 항목" value="레슨 음성 파일" />
            <InfoRow label="이전 목적" value="레슨 음성을 텍스트로 변환" />
            <InfoRow label="이전 방법" value="AI 음성 분석 요청 시 암호화된 통신망을 통해 전송" />
            <InfoRow label="보유 기간" value="원칙적으로 API 처리 후 최대 30일. 다만 별도의 보관 계약, 법령 준수 또는 오남용 방지 사유가 있는 경우 보관 기간이 달라질 수 있습니다." />
          </SubSection>
          <SubSection title="4. Anthropic">
            <InfoRow label="이전받는 자" value="Anthropic PBC" />
            <InfoRow label="이전 국가" value="미국" />
            <InfoRow label="이전 항목" value="레슨 음성에서 변환된 텍스트" />
            <InfoRow label="이전 목적" value="AI 레슨 리포트 생성" />
            <InfoRow label="이전 방법" value="AI 리포트 생성 요청 시 암호화된 통신망을 통해 전송" />
            <InfoRow label="보유 기간" value="원칙적으로 API 입력·출력의 수령 또는 생성 후 30일 이내 삭제. 다만 별도의 계약, 법령 준수 또는 오남용 방지 사유가 있는 경우 보관 기간이 달라질 수 있습니다." />
          </SubSection>
          <Body>이용자는 개인정보의 국외 이전을 거부할 수 있습니다. 푸시 알림은 기기 설정에서 해제할 수 있으며, AI 분석은 별도 동의를 철회할 수 있습니다. 다만 핵심 클라우드 인프라의 국외 처리를 거부하는 경우 서비스 제공이 어려워 회원 탈퇴가 필요할 수 있습니다. 국외 이전 거부 또는 동의 철회는 앱의 마이 화면 또는 개인정보 보호책임자에게 요청할 수 있습니다.</Body>
        </Section>

        <Section title="제8조 AI 음성 분석에 관한 사항">
          <Numbered items={[
            'AI 음성 분석은 이용자의 별도 선택 동의를 받은 경우에만 처리합니다.',
            '원본 음성은 OpenAI API를 통해 텍스트로 변환되며, 변환된 텍스트는 Anthropic API를 통해 AI 레슨 리포트로 생성됩니다.',
            'AI 서비스 제공업체는 상업용 API 입력·출력을 기본적으로 모델 학습에 사용하지 않습니다. 다만 각 업체의 정책과 계약에 따른 예외가 있을 수 있습니다.',
            '이용자는 AI 분석 동의를 거부하거나 철회할 수 있습니다.',
            'AI 분석에 동의하지 않더라도 기본적인 레슨 일정, 출석 및 메시지 기능은 이용할 수 있습니다. 다만 AI 레슨 리포트는 제공되지 않을 수 있습니다.',
          ]} />
        </Section>

        <Section title="제9조 이용자와 법정대리인의 권리 및 행사 방법">
          <Body>이용자는 자신의 개인정보에 대해 다음 권리를 행사할 수 있습니다.</Body>
          <Bulleted items={[
            '개인정보 열람',
            '개인정보 정정',
            '개인정보 삭제',
            '개인정보 처리정지',
            '개인정보 수집·이용 동의 철회',
            '회원 탈퇴',
          ]} />
          <Body>권리 행사는 앱의 마이 화면에서 직접 처리하거나 회사에 이메일 또는 전화로 요청할 수 있습니다.</Body>
          <View style={styles.rightCard}>
            <InfoRow label="프로필 수정" value="마이 화면의 수정 기능" />
            <InfoRow label="회원 탈퇴 및 삭제" value="마이 > 계정 관리 > 계정 삭제" />
            <InfoRow label="푸시 알림 철회" value="앱 또는 기기의 알림 설정" />
            <InfoRow label="AI 분석 동의 철회 및 기타" value="이메일 hyunsoo@kerri.co.kr / 전화 010-4029-6035" last />
          </View>
          <Body>회사는 만 14세 미만 아동의 개인정보를 법정대리인의 동의가 확인되지 않는 한 수집하지 않습니다.</Body>
        </Section>

        <Section title="제10조 개인정보의 파기 절차 및 방법">
          <Body>개인정보의 보유 기간이 경과하거나 처리 목적이 달성되면 지체 없이 파기합니다. 전자적 파일은 복구 또는 재생이 어렵도록 안전한 방식으로 삭제합니다. 출력물 등 종이 문서는 분쇄하거나 소각합니다. 관계 법령에 따라 일정 기간 보존해야 하는 개인정보는 다른 개인정보와 분리하여 보관하며, 보관 목적 외의 용도로 이용하지 않습니다.</Body>
        </Section>

        <Section title="제11조 개인정보의 안전성 확보 조치">
          <Body>회사는 개인정보를 안전하게 보호하기 위해 다음 조치를 시행합니다.</Body>
          <Numbered items={[
            '개인정보 접근 권한을 업무상 필요한 범위로 제한',
            '접근 권한의 정기적인 점검',
            '개인정보 전송 구간 암호화',
            '인증정보의 안전한 관리',
            '개인정보 접근 기록의 보관과 이상 접근 모니터링',
            '개발 환경과 운영 환경의 분리',
            '보안 업데이트 및 취약점 점검',
            '수탁자와 임직원에 대한 개인정보 보호 의무 부여',
          ]} />
        </Section>

        <Section title="제12조 자동 수집 장치와 맞춤형 광고">
          <Body>서비스는 로그인 유지, 보안, 푸시 알림 및 장애 대응을 위해 기기 정보, IP 주소, 접속 기록과 푸시 토큰을 자동으로 처리할 수 있습니다. 회사는 현재 맞춤형 광고를 제공하지 않으며, 광고 식별자를 이용하여 이용자를 추적하지 않습니다.</Body>
        </Section>

        <Section title="제13조 개인정보 보호책임자와 권익침해 구제">
          <View style={styles.bizCard}>
            <Text style={styles.bizTitle}>개인정보 보호책임자</Text>
            <BizRow label="책임자" value="정현수 대표" />
            <BizRow label="상호" value="케리" />
            <BizRow label="사업자등록번호" value="214-20-87491" />
            <BizRow label="통신판매업 신고번호" value="제2026-서울양천-1007호" />
            <BizRow label="사업장 주소" value="서울특별시 양천구 목동중앙본로2길 28-41, 202호(목동, 백산제이엘카운티)" />
            <BizRow label="이메일" value="hyunsoo@kerri.co.kr" />
            <BizRow label="전화번호" value="010-4029-6035" last />
          </View>
          <Body>개인정보 침해에 대한 상담이나 신고가 필요한 경우 다음 기관에 문의할 수 있습니다.</Body>
          <Bulleted items={[
            '개인정보침해신고센터: 국번 없이 118',
            '개인정보분쟁조정위원회: 1833-6972',
            '경찰청: 국번 없이 182',
            '대검찰청: 국번 없이 1301',
          ]} />
        </Section>

        <Section title="제14조 개인정보 처리방침의 변경">
          <Body>법령, 서비스 또는 개인정보 처리 내용이 변경되는 경우 회사는 변경 사항을 앱 또는 서비스 화면을 통해 안내합니다. 이용자의 권리에 중대한 영향을 미치는 변경은 시행일 전에 충분한 기간을 두고 알리며, 필요한 경우 이용자의 동의를 다시 받습니다.</Body>
        </Section>

        <View style={styles.annexCard}>
          <Text style={styles.annexTitle}>부칙</Text>
          <Text style={styles.annexBody}>이 개인정보 처리방침은 2026년 11월 3일부터 시행합니다.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.subSection}>
      <Text style={styles.subSectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Body({ children }: { children: string }) {
  return <Text style={styles.body}>{children}</Text>;
}

function Numbered({ items }: { items: string[] }) {
  return (
    <View style={styles.listBlock}>
      {items.map((item, i) => (
        <View key={i} style={styles.listRow}>
          <Text style={styles.listNum}>{i + 1}.</Text>
          <Text style={styles.listText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function Bulleted({ items }: { items: string[] }) {
  return (
    <View style={styles.listBlock}>
      {items.map((item, i) => (
        <View key={i} style={styles.listRow}>
          <Text style={styles.listNum}>•</Text>
          <Text style={styles.listText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function RetentionTable({ items }: { items: { item: string; period: string }[] }) {
  return (
    <View style={styles.tableCard}>
      {items.map((row, i) => (
        <View key={i} style={[styles.tableRow, i === items.length - 1 && styles.tableRowLast]}>
          <Text style={[styles.tableCell, styles.tableCellLeft]}>{row.item}</Text>
          <Text style={[styles.tableCell, styles.tableCellRight]}>{row.period}</Text>
        </View>
      ))}
    </View>
  );
}

function DelegateTable({ items }: { items: { org: string; task: string; data: string }[] }) {
  return (
    <View style={styles.tableCard}>
      {items.map((row, i) => (
        <View key={i} style={[styles.delegateRow, i === items.length - 1 && styles.tableRowLast]}>
          <Text style={styles.delegateOrg}>{row.org}</Text>
          <Text style={styles.delegateDetail}>위탁 업무: {row.task}</Text>
          <Text style={styles.delegateDetail}>처리 정보: {row.data}</Text>
        </View>
      ))}
    </View>
  );
}

function BizRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.bizRow, last && styles.bizRowLast]}>
      <Text style={styles.bizLabel}>{label}</Text>
      <Text style={styles.bizValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingTop: Platform.OS === 'ios' ? 4 : 16,
    paddingHorizontal: 16, paddingBottom: 8,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.background,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.foreground },
  content: { padding: 20, paddingBottom: 48 },
  mainTitle: {
    fontSize: 18, fontWeight: '800', color: Colors.foreground,
    marginBottom: 4, lineHeight: 26,
  },
  effectiveDate: { fontSize: 13, color: Colors.mutedFg, marginBottom: 12 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.foreground, marginBottom: 8 },
  subSection: { marginTop: 10, marginBottom: 4 },
  subSectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.foreground, marginBottom: 6 },
  body: { fontSize: 14, color: Colors.foreground, lineHeight: 22, marginBottom: 6 },
  listBlock: { gap: 6, marginBottom: 6 },
  listRow: { flexDirection: 'row', gap: 6 },
  listNum: { fontSize: 14, color: Colors.mutedFg, width: 18, lineHeight: 22 },
  listText: { flex: 1, fontSize: 14, color: Colors.foreground, lineHeight: 22 },
  infoRow: {
    paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
    gap: 2,
  },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { fontSize: 12, color: Colors.mutedFg },
  infoValue: { fontSize: 13, color: Colors.foreground, lineHeight: 19 },
  thirdPartyCard: {
    backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 8,
  },
  rightCard: {
    backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14,
    borderWidth: 1, borderColor: Colors.border, marginVertical: 8,
  },
  tableCard: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: 8, overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  tableRowLast: { borderBottomWidth: 0 },
  tableCell: { padding: 10, fontSize: 13, color: Colors.foreground, lineHeight: 19 },
  tableCellLeft: { flex: 3, borderRightWidth: 1, borderRightColor: Colors.borderLight },
  tableCellRight: { flex: 2, color: Colors.mutedFg },
  delegateRow: {
    padding: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
    gap: 3,
  },
  delegateOrg: { fontSize: 13, fontWeight: '700', color: Colors.foreground },
  delegateDetail: { fontSize: 12, color: Colors.mutedFg, lineHeight: 18 },
  bizCard: {
    backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 12,
  },
  bizTitle: {
    fontSize: 13, fontWeight: '700', color: Colors.foreground,
    paddingTop: 12, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
    marginBottom: 2,
  },
  bizRow: {
    paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
    gap: 2,
  },
  bizRowLast: { borderBottomWidth: 0 },
  bizLabel: { fontSize: 12, color: Colors.mutedFg },
  bizValue: { fontSize: 13, color: Colors.foreground, lineHeight: 19 },
  annexCard: {
    backgroundColor: Colors.mutedBg, borderRadius: 14,
    padding: 16, marginTop: 8,
  },
  annexTitle: { fontSize: 14, fontWeight: '700', color: Colors.foreground, marginBottom: 6 },
  annexBody: { fontSize: 13, color: Colors.foreground, lineHeight: 20 },
});
