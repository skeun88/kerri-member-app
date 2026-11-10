-- notification_settings에 보강 결과 및 결제 안내 토글 컬럼 추가
ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS bogan_result boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_notice boolean DEFAULT true;
