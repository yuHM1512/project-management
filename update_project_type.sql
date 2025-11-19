-- Update project_type_id cho project có id = 4
UPDATE projects 
SET project_type_id = 2 
WHERE id = 4;

-- Kiểm tra kết quả
SELECT id, name, project_type_id 
FROM projects 
WHERE id = 4;

