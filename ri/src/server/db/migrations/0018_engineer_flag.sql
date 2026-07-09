-- Grant ScootFlags.ENGINEER (1<<10=1024) to rocketman (user 1) — the self-stake
-- bootstrap gate requires BOTH this flag AND being ROOT_USER_ID (hardcoded in
-- trust/graph.ts). 156 -> 1180.
UPDATE scoot_members SET user_flags = (user_flags::bigint | 1024)::text
WHERE scoot_id = 34 AND user_id = 1;
