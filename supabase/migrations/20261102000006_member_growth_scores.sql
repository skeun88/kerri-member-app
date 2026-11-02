-- member_growth_scores: 멤버별 레슨 경험치 적립 테이블
-- 미적용 상태 (Karen 승인 후 적용)
--
-- 점수 계산 기준:
--   improved    → 5점
--   maintained / same → 3점
--   needs_work  → 2점
--   regressed   → 1점
--   기록 있고 상태 없음 → 1점
--   기록 자체 없음 → 0점
--   1회당 최대 5점

CREATE TABLE IF NOT EXISTS member_growth_scores (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id         uuid NOT NULL,
  lesson_record_id  uuid NOT NULL UNIQUE,
  change_status     text,
  score             integer NOT NULL DEFAULT 0,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_growth_scores_member_id
  ON member_growth_scores (member_id);

ALTER TABLE member_growth_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read own scores"
  ON member_growth_scores FOR SELECT
  USING (member_id = auth.uid());
