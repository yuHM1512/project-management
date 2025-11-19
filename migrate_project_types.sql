-- Migration script to add project_type to projects table

-- Tạo bảng project_types để quản lý các loại dự án
CREATE TABLE IF NOT EXISTS project_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert các project types mặc định
INSERT INTO project_types (name, description) VALUES
    ('Company', 'Dự án cấp công ty'),
    ('Administration Department', 'Dự án cấp phòng Hành chính'),
    ('Trading Department', 'Dự án cấp phòng Kinh doanh')
ON CONFLICT (name) DO NOTHING;

-- Thêm column project_type_id vào bảng projects
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS project_type_id INTEGER REFERENCES project_types(id);

-- Tạo index cho project_type_id
CREATE INDEX IF NOT EXISTS idx_projects_project_type_id ON projects(project_type_id);

