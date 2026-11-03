import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '../../lib/theme';

export default function TermsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>서비스 이용약관</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.mainTitle}>KERRI Member 서비스 이용약관</Text>
        <Text style={styles.effectiveDate}>시행일: 2026년 11월 3일</Text>

        <Section title="제1조 목적">
          <Body>본 약관은 케리(이하 "회사")가 제공하는 KERRI Member 서비스의 이용 조건과 회사 및 회원의 권리·의무를 정하는 것을 목적으로 합니다.</Body>
        </Section>

        <Section title="제2조 용어의 정의">
          <Numbered items={[
            '"서비스"란 회사가 KERRI Member 앱을 통해 제공하는 레슨 일정, 출석, 잔여 횟수, 보강 신청, 메시지, 레슨 기록 등의 기능을 말합니다.',
            '"회원"이란 본 약관에 동의하고 서비스를 이용하는 사람을 말합니다.',
            '"코치"란 회원에게 실제 레슨을 제공하고 KERRI Coach를 통해 회원과 레슨 정보를 관리하는 사람을 말합니다.',
            '"레슨 기록"이란 코치가 작성하여 회원에게 공유한 레슨 요약, 교정 포인트, 성장 변화 및 다음 목표 등을 말합니다.',
          ]} />
        </Section>

        <Section title="제3조 약관의 효력 및 변경">
          <Numbered items={[
            '본 약관은 회원이 동의하고 서비스에 가입한 때부터 적용됩니다.',
            '회사는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있습니다.',
            '중요한 변경 사항은 시행일 전에 앱 내 공지 또는 알림으로 안내합니다.',
            '회원에게 불리한 변경은 원칙적으로 시행일 30일 전에 안내합니다.',
          ]} />
        </Section>

        <Section title="제4조 회원가입 및 계정 관리">
          <Numbered items={[
            '회원은 코치에게 받은 초대코드 또는 회사가 제공하는 인증 방식으로 가입할 수 있습니다.',
            '회원은 정확한 정보를 입력해야 하며 타인의 정보를 사용해서는 안 됩니다.',
            '회원은 자신의 계정을 다른 사람에게 양도하거나 공유할 수 없습니다.',
            '계정의 부정 사용을 확인한 경우 즉시 회사에 알려야 합니다.',
            '만 14세 미만 회원은 법정대리인의 동의가 필요한 경우 가입 또는 일부 기능 이용이 제한될 수 있습니다.',
          ]} />
        </Section>

        <Section title="제5조 서비스의 제공">
          <Body>회사는 회원에게 다음 기능을 제공합니다.</Body>
          <Bulleted items={[
            '담당 코치 및 레슨 정보 확인',
            '레슨 일정·잔여 횟수·출석 상태 확인',
            '결석 알림 및 보강 레슨 요청',
            '코치 메시지와 서비스 알림 수신',
            '코치가 공유한 레슨 기록 및 성장 정보 확인',
            '그 밖에 회사가 추가로 제공하는 관련 기능',
          ]} />
          <Body>회사는 서비스 개선을 위해 기능을 변경하거나 추가할 수 있으며 중요한 변경은 사전에 안내합니다.</Body>
        </Section>

        <Section title="제6조 회사와 코치의 역할">
          <Numbered items={[
            '회사는 코치와 회원의 레슨 운영을 지원하는 플랫폼을 제공합니다.',
            '실제 레슨의 내용, 지도 방식, 장소, 레슨비, 환불 및 운영 정책은 코치와 회원 사이의 약정에 따릅니다.',
            '회사가 직접 판매하거나 결제를 중개하는 상품에는 별도로 고지된 결제 및 환불 정책이 적용됩니다.',
            '회사는 코치가 독립적으로 제공하는 레슨의 품질이나 결과를 보증하지 않습니다.',
          ]} />
        </Section>

        <Section title="제7조 일정·결석·보강 요청">
          <Numbered items={[
            '회원은 앱에서 결석을 알리거나 보강 레슨을 요청할 수 있습니다.',
            '\'결석 알리기\'는 코치에게 결석 의사를 전달하는 기능이며 자동으로 취소 또는 환불이 확정되는 것은 아닙니다.',
            '\'보강 신청\'은 예약 확정이 아닌 요청 상태이며 코치가 수락한 이후 일정이 확정됩니다.',
            '결석 시 레슨 횟수 차감, 보강 가능 여부 및 취소 기한은 코치가 사전에 안내한 운영 정책에 따릅니다.',
            '확정된 일정의 변경·수락·거절 결과는 앱 및 푸시 알림으로 안내될 수 있습니다.',
            '회원은 기기의 알림 설정과 관계없이 앱에서 최종 일정을 직접 확인해야 합니다.',
          ]} />
        </Section>

        <Section title="제8조 레슨 기록 및 메시지">
          <Numbered items={[
            '코치는 회원의 레슨 내용과 성장 정보를 기록하여 회원에게 공유할 수 있습니다.',
            '레슨 기록은 코칭을 보조하기 위한 정보이며 의료적 진단이나 전문적인 건강 상담을 대신하지 않습니다.',
            '회원은 레슨 기록을 개인적인 확인 목적으로 이용할 수 있습니다.',
            '회원은 코치 또는 회사의 동의 없이 레슨 기록을 복제·판매하거나 상업적으로 이용해서는 안 됩니다.',
            '회원과 코치는 메시지 기능을 불법·위협·비방 또는 서비스 목적과 무관한 용도로 이용해서는 안 됩니다.',
          ]} />
        </Section>

        <Section title="제9조 알림">
          <Numbered items={[
            '회사는 일정 변경, 결석 처리, 보강 결과, 코치 메시지 등 서비스 운영에 필요한 알림을 발송할 수 있습니다.',
            '광고성 정보는 회원이 별도로 수신에 동의한 경우에만 발송합니다.',
            '회원은 기기 설정에서 푸시 알림을 끌 수 있으나 알림 차단으로 확인하지 못한 일정은 앱에서 직접 확인해야 합니다.',
          ]} />
        </Section>

        <Section title="제10조 회원의 금지행위">
          <Body>회원은 다음 행위를 해서는 안 됩니다.</Body>
          <Bulleted items={[
            '타인의 계정이나 개인정보를 무단으로 사용하는 행위',
            '허위 정보를 입력하거나 레슨 데이터를 조작하는 행위',
            '코치 또는 다른 이용자를 비방·위협하는 행위',
            '서비스 데이터를 무단 복제·판매하는 행위',
            '서비스 운영을 방해하거나 비정상적인 방법으로 접근하는 행위',
            '관련 법령 또는 사회질서에 위반되는 행위',
          ]} />
          <Body>회사는 위반 정도에 따라 이용 제한, 계정 정지 또는 탈퇴 조치를 할 수 있습니다.</Body>
        </Section>

        <Section title="제11조 서비스의 변경 및 중단">
          <Numbered items={[
            '회사는 점검, 장애, 통신 문제 또는 운영상 필요한 사유로 서비스를 일시 중단할 수 있습니다.',
            '회사는 예정된 중단을 사전에 안내하며 긴급한 경우 사후 안내할 수 있습니다.',
            '천재지변, 외부 통신망 장애 등 회사가 통제하기 어려운 사유가 발생한 경우 서비스 제공이 제한될 수 있습니다.',
          ]} />
        </Section>

        <Section title="제12조 회원 탈퇴">
          <Numbered items={[
            '회원은 앱 내 계정 관리 메뉴를 통해 탈퇴를 요청할 수 있습니다.',
            '탈퇴가 완료되면 개인정보는 개인정보 처리방침에 따라 삭제됩니다.',
            '관계 법령에 따라 보관이 필요한 정보는 법정 기간 동안 분리 보관한 후 삭제합니다.',
            '탈퇴하더라도 코치와 회원 사이에 이미 발생한 레슨비, 환불 또는 정산 문제는 별도로 해결해야 합니다.',
          ]} />
        </Section>

        <Section title="제13조 책임의 제한">
          <Body>회사는 회사의 고의 또는 과실이 없는 다음 사유에 대해 책임을 지지 않습니다.</Body>
          <Bulleted items={[
            '회원 또는 코치가 잘못 입력한 정보',
            '회원과 코치 사이의 개별 약정 또는 분쟁',
            '회원의 기기, 통신망 또는 외부 서비스로 발생한 장애',
            '천재지변 등 회사가 통제하기 어려운 사유',
            '회원이 푸시 알림을 확인하지 않아 발생한 일정 착오',
          ]} />
          <Body>회사는 관련 법령에서 허용되지 않는 범위까지 책임을 제한하지 않습니다.</Body>
        </Section>

        <Section title="제14조 분쟁 해결 및 준거법">
          <Numbered items={[
            '본 약관은 대한민국 법률을 따릅니다.',
            '서비스 이용과 관련해 분쟁이 발생하면 회사와 회원은 우선 원만한 해결을 위해 협의합니다.',
            '협의로 해결되지 않는 경우 관련 법령이 정한 관할 법원에서 해결합니다.',
          ]} />
        </Section>

        <View style={styles.bizCard}>
          <Text style={styles.bizTitle}>사업자 정보</Text>
          <BizRow label="상호" value="케리" />
          <BizRow label="대표자" value="정현수" />
          <BizRow label="사업자등록번호" value="214-20-87491" />
          <BizRow label="통신판매업 신고번호" value="제2026-서울양천-1007호" />
          <BizRow label="사업장 주소" value="서울특별시 양천구 목동중앙본로2길 28-41, 202호(목동, 백산제이엘카운티)" />
          <BizRow label="고객 문의 이메일" value="hyunsoo@kerri.co.kr" />
          <BizRow label="전화번호" value="010-4029-6035" last />
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
  effectiveDate: {
    fontSize: 13, color: Colors.mutedFg, marginBottom: 24,
  },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 15, fontWeight: '700', color: Colors.foreground,
    marginBottom: 8,
  },
  body: {
    fontSize: 14, color: Colors.foreground, lineHeight: 22,
    marginBottom: 6,
  },
  listBlock: { gap: 6 },
  listRow: { flexDirection: 'row', gap: 6 },
  listNum: { fontSize: 14, color: Colors.mutedFg, width: 18, lineHeight: 22 },
  listText: { flex: 1, fontSize: 14, color: Colors.foreground, lineHeight: 22 },
  bizCard: {
    backgroundColor: '#fff', borderRadius: 16,
    paddingHorizontal: 16, marginTop: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  bizTitle: {
    fontSize: 14, fontWeight: '700', color: Colors.foreground,
    paddingTop: 14, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
    marginBottom: 2,
  },
  bizRow: {
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
    gap: 2,
  },
  bizRowLast: { borderBottomWidth: 0 },
  bizLabel: { fontSize: 12, color: Colors.mutedFg },
  bizValue: { fontSize: 14, color: Colors.foreground, lineHeight: 20 },
});
