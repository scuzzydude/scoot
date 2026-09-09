-- Which render-prompt framing block applies to this card's subject
-- ('male' | 'female'); the driver/worker read it. Default keeps the roster as-is.
ALTER TABLE player_cards ADD COLUMN IF NOT EXISTS framing text NOT NULL DEFAULT 'male';
