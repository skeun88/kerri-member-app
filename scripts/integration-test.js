/**
 * KERRI Integration Test — Member App
 * TC-002, TC-004, TC-005: 코치앱 → 회원앱 데이터 동기화 검증
 * 
 * 실행: node scripts/integration-test.js
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, testId, description) {
  if (condition) {
    console.log(`  ✅ PASS [${testId}] ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL [${testId}] ${description}`);
    failed++;
    results.push({ id: testId, description });
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let testCoachId = null;
let testMemberId = null;

async function setupTestData() {
  console.log('\n📋 테스트 데이터 준비 중...');
  const { data: coaches } = await supabase.from('coaches').select('id').limit(1);
  if (!coaches?.length) throw new Error('코치 데이터 없음');
  testCoachId = coaches[0].id;

  // 테스트 회원 생성
  const todayKST = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const todayDow = todayKST.getDay();

  const { data: member, error } = await supabase
    .from('members')
    .insert({
      name: '[TEST-MEMBER] 회원앱테스트',
      coach_id: testCoachId,
      fixed_schedule_days: [todayDow],
      fixed_schedule_time: '14:00',
      fixed_lesson_duration: 60,
      total_credits: 5,
      remaining_credits: 5,
      level: '중급',
    })
    .select()
    .single();

  if (error) throw new Error(`테스트 회원 생성 실패: ${error.message}`);
  testMemberId = member.id;
  console.log(`  테스트 회원 ID: ${testMemberId}`);
}

async function cleanupTestData() {
  if (testMemberId) {
    await supabase.from('lesson_members').delete().eq('member_id', testMemberId);
    await supabase.from('payments').delete().eq('member_id', testMemberId);
    await supabase.from('members').delete().eq('id', testMemberId);
    console.log('\n🧹 테스트 데이터 정리 완료');
  }
}

// TC-002: 코치앱에서 만든 레슨이 회원앱(member 관점)에서 보이는지
async function tc002_lessonSyncToMember() {
  console.log('\n🧪 TC-002: 레슨 데이터 → 회원 관점 조회 가능');

  const todayKST = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const todayStr = todayKST.toISOString().split('T')[0];

  // 회원이 볼 수 있는 방식으로 레슨 조회 (member_id 기반)
  const { data: lessons, error } = await supabase
    .from('lessons')
    .select('id, date, start_time, end_time, title, lesson_members!inner(member_id)')
    .eq('lesson_members.member_id', testMemberId)
    .gte('date', todayStr)
    .order('date', { ascending: true });

  assert(!error, 'TC-002-A', '회원 기준 레슨 쿼리 오류 없음');
  // 오늘 고정스케줄 등록했으므로 레슨이 있어야 함
  assert(lessons && lessons.length > 0, 'TC-002-B', '회원 스케줄에 레슨 표시됨');

  if (lessons?.length > 0) {
    console.log(`  → 조회된 레슨 ${lessons.length}개 (첫번째: ${lessons[0].date} ${lessons[0].start_time})`);
  }
}

// TC-004: 결제 정보가 회원 관점에서 조회되는지
async function tc004_paymentSyncToMember() {
  console.log('\n🧪 TC-004: 결제 등록 → 회원앱 조회 가능');

  const todayStr = new Date(new Date().getTime() + 9 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  // 결제 등록 (코치앱에서 하는 행위)
  const { data: payment, error: insertError } = await supabase
    .from('payments')
    .insert({
      member_id: testMemberId,
      coach_id: testCoachId,
      amount: 200000,
      paid_amount: 0,
      status: 'unpaid',
      description: '[TEST] 5월 레슨비',
      due_date: todayStr,
    })
    .select()
    .single();

  assert(!insertError && payment, 'TC-004-A', '결제 데이터 등록 성공');
  await sleep(300);

  // 회원앱에서 조회 (member_id 기반)
  const { data: memberPayments, error: queryError } = await supabase
    .from('payments')
    .select('id, amount, status, due_date')
    .eq('member_id', testMemberId);

  assert(!queryError, 'TC-004-B', '회원 결제 쿼리 오류 없음');
  assert(memberPayments && memberPayments.length > 0, 'TC-004-C', '회원앱에서 결제 내역 조회 가능');

  // 미납 상태 확인
  const unpaid = memberPayments?.find(p => p.status === 'unpaid');
  assert(!!unpaid, 'TC-004-D', '미납 결제 상태 올바르게 표시');
}

// TC-005: 크레딧 잔여횟수 회원 관점 정확성
async function tc005_creditAccuracy() {
  console.log('\n🧪 TC-005: 잔여 크레딧 → 회원앱 정확성');

  const { data: member, error } = await supabase
    .from('members')
    .select('remaining_credits, total_credits')
    .eq('id', testMemberId)
    .single();

  assert(!error, 'TC-005-A', '회원 크레딧 조회 오류 없음');
  assert(member?.remaining_credits === 5, 'TC-005-B', `잔여 크레딧 정확함 (${member?.remaining_credits}/5)`);
  assert(member?.total_credits === 5, 'TC-005-C', `총 크레딧 정확함 (${member?.total_credits})`);
}

async function main() {
  console.log('🚀 KERRI Member App Integration Test 시작');
  console.log('═'.repeat(50));

  try {
    await setupTestData();
    await tc002_lessonSyncToMember();
    await tc004_paymentSyncToMember();
    await tc005_creditAccuracy();
  } catch (err) {
    console.error('\n💥 테스트 실행 오류:', err.message);
    failed++;
  } finally {
    await cleanupTestData();
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`📊 결과: ${passed} 통과 / ${failed} 실패`);

  if (failed > 0) {
    console.error('\n❌ 실패한 테스트:');
    results.forEach(r => console.error(`  - [${r.id}] ${r.description}`));
    process.exit(1);
  } else {
    console.log('\n✅ 전체 통과!');
    process.exit(0);
  }
}

main();
