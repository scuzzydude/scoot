-- Per-card appearance sentence for the render pipeline's prompt ("He is Black
-- with dark brown skin, bald, gray goatee"). Explicit wording is what makes
-- skin tone / hair survive generation -- generic "preserve ethnicity" has
-- failed repeatedly. Set by the member ("set my look: ...") or a leader.
ALTER TABLE player_cards ADD COLUMN IF NOT EXISTS appearance text;
