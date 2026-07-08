-- Grant ScootFlags.LEADER (1<<3 = 8) so oversight is testable: Brandon (owner/dev)
-- and Karen (the real Fonde leader). Karen 52->60, Brandon 20->28.
UPDATE scoot_members SET user_flags = (user_flags::bigint | 8)::text
WHERE scoot_id = 34 AND user_id IN (1, 127);
