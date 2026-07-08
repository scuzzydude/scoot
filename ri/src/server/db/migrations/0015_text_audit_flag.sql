-- ScootFlags.TEXT_AUDIT (1<<7 = 128): may view the global sequential SMS log
-- (every user's texts). Grant to Brandon (root/dev). 28 -> 156.
UPDATE scoot_members SET user_flags = (user_flags::bigint | 128)::text
WHERE scoot_id = 34 AND user_id = 1;
