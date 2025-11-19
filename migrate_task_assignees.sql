-- Migration script to create task_assignees table and migrate data
-- Run this script to migrate from single assignee_id to multiple assignees

-- Step 1: Create task_assignees table if not exists
CREATE TABLE IF NOT EXISTS task_assignees (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tạo unique constraint nếu chưa có
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'task_assignees_task_id_user_id_key'
    ) THEN
        ALTER TABLE task_assignees 
        ADD CONSTRAINT task_assignees_task_id_user_id_key 
        UNIQUE (task_id, user_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_task_assignees_task_id ON task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user_id ON task_assignees(user_id);

-- Step 2: Migrate existing assignee_id data to task_assignees
-- Chỉ migrate những task có assignee_id và chưa có trong task_assignees
-- Dùng NOT EXISTS thay vì ON CONFLICT để tránh lỗi nếu constraint chưa có
INSERT INTO task_assignees (task_id, user_id, assigned_at)
SELECT t.id, t.assignee_id, t.created_at
FROM tasks t
WHERE t.assignee_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM task_assignees ta 
    WHERE ta.task_id = t.id AND ta.user_id = t.assignee_id
  );

-- Step 3: Xóa cột assignee_id sau khi đã migrate xong
-- CHỈ CHẠY SAU KHI ĐÃ XÁC NHẬN DỮ LIỆU ĐÃ ĐƯỢC MIGRATE ĐÚNG VÀ CODE ĐÃ ĐƯỢC CẬP NHẬT!
-- Xóa foreign key constraint trước (nếu có)
DO $$ 
BEGIN
    -- Xóa foreign key constraint nếu tồn tại
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'tasks_assignee_id_fkey'
    ) THEN
        ALTER TABLE tasks DROP CONSTRAINT tasks_assignee_id_fkey;
    END IF;
END $$;

-- Xóa cột assignee_id
ALTER TABLE tasks DROP COLUMN IF EXISTS assignee_id;

