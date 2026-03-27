ALTER TABLE health_appointments
ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'confirmed';

UPDATE health_appointments
SET review_status = 'needs_review'
WHERE provider = 'Google Calendar'
  AND review_status = 'confirmed';
