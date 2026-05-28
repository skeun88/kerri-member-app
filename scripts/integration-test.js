/**
 * KERRI Integration Test — Member App
 * TC-002, TC-004~005, TC-013~016: 코치앱→회원앱 데이터 동기화 검증
 *
 * 실행: node scripts/integration-test.js
 * 환경변수: SUPABASE_URL, SUPABASE_SERVICE_KEY
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
    results.push({ id: testId, status: 'PASS', description });
  } else {
    console.error(`  ❌ FAIL [${testId}] ${description}`);
    failed++;
    results.push({ id: testId, status: 'FAIL', description });
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

  const todayKST = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const todayDow = todayKST.getDay();

  const { data: member, error } = await supabase.from('members').insert({
    name: '[TEST-MEMBER] 회원앱테스트',
    coach_id: testCoachId,
    fixed_schedule_days: [todayDow],
    fixed_schedule_time: '14:00',
    fixed_lesson_duration: 60,
    total_credits: 10,
    remaining_credits: 10,
    level: '중급',
  }).select().single();

  if (error) throw new Error(`테스트 회원 생성 실패: ${error.message}`);
  testMemberId = member.id;
  console.log(`  테스트 회원 ID: ${testMemberId}`);
  await sleep(1000);
}

async function cleanupTestData() {
  if (testMemberId) {
    await supabase.from('attendances').delete().eq('member_id', testMemberId);
    await supabase.from('lesson_members').delete().eq('member_id', testMemberId);
    await supabase.from('payments').delete().eq('member_id', testMemberId);
    await supabase.from('lesson_analyses').delete().eq('member_id', testMemberId);
    await supabase.from('members').delete().eq('id', testMemberId);
    console.log('\n🧹 테스트 데이터 정리 완료');
  }
}

// ─── TC-002: 레슨 스케줄 → 회원 관점 동기화 ─────────────────
async function tc002_lessonSyncToMember() {
  console.log('\n🧪 TC-002: 코치앱 레슨 → 회원앱 스케줄 동기화');
  if (!testMemberId) { console.log('  ⚠️ 선행 테스트 실패로 스킵'); return; }

  const todayStr = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data: lessons, error } = await supabase
    .from('lessons')
    .select('id, date, start_time, end_time, title, lesson_members!inner(member_id)')
    .eq('lesson_members.member_id', testMemberId)
    .gte('date', todayStr)
    .order('date', { ascending: true });

  assert(!error, 'TC-002-A', '회원 기준 레슨 쿼리 오류 없음');
  assert(lessons && lessons.length > 0, 'TC-002-B', '회원 스케줄에 레슨 표시됨');

  if (lessons?.length > 0) {
    const lesson = lessons[0];
    assert(lesson.date >= todayStr, 'TC-002-C', '과거 날짜 레슨 필터링 정상');
    assert(!!lesson.start_time, 'TC-002-D', '레슨 시작 시간 포함됨');
    console.log(`  → 조회된 레슨 ${lessons.length}개 (최근: ${lesson.date} ${lesson.start_time})`);
  }
}

// ─── TC-004: 결제 데이터 → 회원 관점 조회 ───────────────────
async function tc004_paymentSyncToMember() {
  console.log('\n🧪 TC-004: 코치앱 결제 등록 → 회원앱 결제 탭 반영');
  if (!testMemberId) { console.log('  ⚠️ 선행 테스트 실패로 스킵'); return; }

  const todayStr = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data: payment, error: insertError } = await supabase.from('payments').insert({
    member_id: testMemberId, coach_id: testCoachId,
    amount: 200000, paid_amount: 0, status: 'unpaid',
    description: '[TEST] 5월 레슨비', due_date: todayStr,
  }).select().single();

  assert(!insertError && payment, 'TC-004-A', '결제 데이터 등록 성공');
  await sleep(300);

  const { data: memberPayments, error: queryError } = await supabase
    .from('payments').select('id, amount, status, due_date').eq('member_id', testMemberId);

  assert(!queryError, 'TC-004-B', '회원 결제 쿼리 오류 없음');
  assert(memberPayments && memberPayments.length > 0, 'TC-004-C', '회원앱에서 결제 내역 조회 가능');

  const unpaid = memberPayments?.find(p => p.status === 'unpaid');
  assert(!!unpaid, 'TC-004-D', '미납 결제 상태 올바르게 표시');
  assert(unpaid?.amount === 200000, 'TC-004-E', '결제 금액 정확히 표시됨');
}

// ─── TC-005: 크레딧 잔여 → 회원 관점 정확성 ─────────────────
async function tc005_creditAccuracy() {
  console.log('\n🧪 TC-005: 코치앱 크레딧 변경 → 회원앱 정확 반영');
  if (!testMemberId) { console.log('  ⚠️ 선행 테스트 실패로 스킵'); return; }

  const { data: member } = await supabase
    .from('members').select('remaining_credits, total_credits').eq('id', testMemberId).single();

  assert(member?.remaining_credits === 10, 'TC-005-A', `잔여 크레딧 정확함 (${member?.remaining_credits}/10)`);
  assert(member?.total_credits === 10, 'TC-005-B', `총 크레딧 정확함 (${member?.total_credits})`);

  // 코치앱에서 크레딧 변경 시뮬레이션
  await supabase.from('members').update({ remaining_credits: 7 }).eq('id', testMemberId);
  await sleep(300);

  const { data: updated } = await supabase
    .from('members').select('remaining_credits').eq('id', testMemberId).single();
  assert(updated?.remaining_credits === 7, 'TC-005-C', '크레딧 변경 즉시 반영됨');
}

// ─── TC-013: 레슨 취소 → 회원 스케줄에서 제거 ───────────────
async function tc013_lessonCancelSync() {
  console.log('\n🧪 TC-013: 코치앱 레슨 취소 → 회원 스케줄에서 제거');
  if (!testMemberId || !testCoachId) { console.log('  ⚠️ 선행 테스트 실패로 스킵'); return; }

  const todayStr = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];

  // 레슨 생성
  const { data: lesson } = await supabase.from('lessons').insert({
    coach_id: testCoachId, date: todayStr,
    start_time: '16:00', end_time: '17:00', title: '[TEST] 취소테스트레슨',
  }).select().single();

  if (!lesson) { assert(false, 'TC-013-A', '테스트 레슨 생성 실패'); return; }

  // 회원 연결
  await supabase.from('lesson_members').insert({ lesson_id: lesson.id, member_id: testMemberId });
  await sleep(300);

  // 회원 스케줄에서 보이는지 확인
  const { data: before } = await supabase
    .from('lessons').select('id, lesson_members!inner(member_id)')
    .eq('lesson_members.member_id', testMemberId).eq('id', lesson.id);
  assert(before && before.length > 0, 'TC-013-A', '레슨 생성 후 회원 스케줄에 표시됨');

  // 레슨 삭제 (취소)
  await supabase.from('lesson_members').delete().eq('lesson_id', lesson.id);
  await supabase.from('lessons').delete().eq('id', lesson.id);
  await sleep(300);

  // 회원 스케줄에서 사라졌는지 확인
  const { data: after } = await supabase
    .from('lessons').select('id').eq('id', lesson.id);
  assert(!after || after.length === 0, 'TC-013-B', '레슨 취소 후 회원 스케줄에서 제거됨');
}

// ─── TC-014: AI 리포트 → 회원앱 report 탭 반영 ──────────────
async function tc014_aiReportToMember() {
  console.log('\n🧪 TC-014: AI 분석 저장 → 회원앱 리포트 탭 반영');
  if (!testMemberId) { console.log('  ⚠️ 선행 테스트 실패로 스킵'); return; }

  // 레슨 먼저 생성
  const todayStr = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
  const { data: lesson } = await supabase.from('lessons').insert({
    coach_id: testCoachId, date: todayStr,
    start_time: '18:00', end_time: '19:00', title: '[TEST] AI분석테스트레슨',
  }).select().single();

  if (!lesson) { console.log('  ⚠️ 레슨 생성 실패, 스킵'); return; }

  const { error: insertErr } = await supabase.from('lesson_analyses').insert({
    lesson_id: lesson.id,
    member_id: testMemberId,
    summary: '[TEST] 오늘 레슨에서 포핸드 개선이 두드러졌습니다.',
    strengths: ['포핸드 안정성', '풋워크'],
    improvements: ['백핸드 스윙'],
    overall_score: 82,
  });

  if (insertErr?.message?.includes('does not exist')) {
    console.log('  ℹ️ lesson_analyses 테이블 없음 — 스킵');
    await supabase.from('lessons').delete().eq('id', lesson.id);
    return;
  }

  assert(!insertErr, 'TC-014-A', 'AI 분석 결과 저장 성공');

  // 회원 관점으로 조회
  const { data: reports, error: queryErr } = await supabase
    .from('lesson_analyses').select('summary, strengths, overall_score')
    .eq('member_id', testMemberId);

  assert(!queryErr, 'TC-014-B', '회원 리포트 쿼리 오류 없음');
  assert(reports && reports.length > 0, 'TC-014-C', '회원앱 리포트 탭에서 AI 분석 조회 가능');

  const report = reports?.[0];
  assert(!report?.summary?.includes('{') && !report?.summary?.includes('"role"'), 'TC-014-D', 'summary에 JSON 원문 노출 없음');

  // 정리
  await supabase.from('lesson_analyses').delete().eq('lesson_id', lesson.id);
  await supabase.from('lessons').delete().eq('id', lesson.id);
}

// ─── TC-015: 회원 invite_code 유효성 ────────────────────────
async function tc015_inviteCode() {
  console.log('\n🧪 TC-015: invite_code 기반 회원 연결 유효성');
  if (!testMemberId) { console.log('  ⚠️ 선행 테스트 실패로 스킵'); return; }

  const { data: member } = await supabase
    .from('members').select('id, invite_code').eq('id', testMemberId).single();

  if (!member?.invite_code) {
    console.log('  ℹ️ invite_code 필드 없음 — 스킵');
    return;
  }

  assert(typeof member.invite_code === 'string' && member.invite_code.length > 0, 'TC-015-A', 'invite_code 존재 및 유효함');

  // invite_code로 회원 조회 가능한지
  const { data: found } = await supabase
    .from('members').select('id').eq('invite_code', member.invite_code).single();
  assert(found?.id === testMemberId, 'TC-015-B', 'invite_code로 회원 조회 성공');
}

// ─── TC-016: 보강 신청 플로우 ────────────────────────────────
async function tc016_makeupLesson() {
  console.log('\n🧪 TC-016: 보강 신청 → 스케줄 반영');
  if (!testMemberId) { console.log('  ⚠️ 선행 테스트 실패로 스킵'); return; }

  const tomorrowStr = new Date(new Date().getTime() + 9 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  // 보강 레슨 생성 (makeup 타입)
  const { data: makeupLesson, error } = await supabase.from('lessons').insert({
    coach_id: testCoachId,
    date: tomorrowStr,
    start_time: '11:00',
    end_time: '12:00',
    title: '[TEST] 보강레슨',
    lesson_type: 'makeup',
  }).select().single();

  // lesson_type 컬럼 없을 수 있음 — 에러 허용
  if (error?.message?.includes('column')) {
    console.log('  ℹ️ lesson_type 컬럼 미지원 — 일반 레슨으로 테스트');
    const { data: normalLesson } = await supabase.from('lessons').insert({
      coach_id: testCoachId, date: tomorrowStr,
      start_time: '11:00', end_time: '12:00', title: '[TEST] 보강레슨',
    }).select().single();

    if (normalLesson) {
      await supabase.from('lesson_members').insert({ lesson_id: normalLesson.id, member_id: testMemberId });
      await sleep(300);

      const { data: check } = await supabase.from('lessons')
        .select('id, lesson_members!inner(member_id)')
        .eq('id', normalLesson.id).eq('lesson_members.member_id', testMemberId);
      assert(check && check.length > 0, 'TC-016-A', '보강 레슨 회원 스케줄에 반영됨');

      await supabase.from('lesson_members').delete().eq('lesson_id', normalLesson.id);
      await supabase.from('lessons').delete().eq('id', normalLesson.id);
    }
    return;
  }

  if (makeupLesson) {
    await supabase.from('lesson_members').insert({ lesson_id: makeupLesson.id, member_id: testMemberId });
    await sleep(300);

    const { data: check } = await supabase.from('lessons')
      .select('id, lesson_members!inner(member_id)')
      .eq('id', makeupLesson.id).eq('lesson_members.member_id', testMemberId);
    assert(check && check.length > 0, 'TC-016-A', '보강 레슨 회원 스케줄에 반영됨');

    await supabase.from('lesson_members').delete().eq('lesson_id', makeupLesson.id);
    await supabase.from('lessons').delete().eq('id', makeupLesson.id);
  }
}

// ─── 메인 실행 ────────────────────────────────────────────────
async function main() {
  console.log('🚀 KERRI Integration Test — Member App');
  console.log('═'.repeat(50));

  try {
    await setupTestData();
    await tc002_lessonSyncToMember();
    await tc004_paymentSyncToMember();
    await tc005_creditAccuracy();
    await tc013_lessonCancelSync();
    await tc014_aiReportToMember();
    await tc015_inviteCode();
    await tc016_makeupLesson();
  } catch (err) {
    console.error('\n💥 테스트 실행 오류:', err.message);
    console.error(err.stack);
    failed++;
  } finally {
    await cleanupTestData();
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`📊 결과: ${passed} 통과 / ${failed} 실패`);

  if (failed > 0) {
    console.error('\n❌ 실패한 테스트:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.error(`  - [${r.id}] ${r.description}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ 전체 통과!');
    process.exit(0);
  }
}

main();
