-- Indexes to keep D1 row reads low (free tier: 5M rows read per day)
CREATE INDEX IF NOT EXISTS idx_activity_user   ON activity(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity(action);
CREATE INDEX IF NOT EXISTS idx_edu_user        ON education(user_id);
CREATE INDEX IF NOT EXISTS idx_certs_user      ON certifications(user_id);
CREATE INDEX IF NOT EXISTS idx_usersubj_user   ON user_subjects(user_id);
CREATE INDEX IF NOT EXISTS idx_users_share     ON users(role, share_profile);
CREATE INDEX IF NOT EXISTS idx_shortlist_rec   ON shortlist(recruiter_id);
