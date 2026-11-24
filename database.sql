-- قاعدة بيانات البوابة الرسمية للمعهد الفني الصناعي بالصحافة
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seat_number TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  department TEXT DEFAULT 'شبكات وآلات كهربية',
  academic_year TEXT DEFAULT 'الفرقة الأولى',
  student_group TEXT DEFAULT 'أ',
  grades_json TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id TEXT NOT NULL,
  department_name TEXT NOT NULL,
  year_label TEXT NOT NULL,
  term_label TEXT NOT NULL,
  day_id TEXT NOT NULL,
  day_label TEXT NOT NULL,
  group_name TEXT NOT NULL,
  subject_title TEXT NOT NULL,
  instructor TEXT DEFAULT '',
  room TEXT DEFAULT '',
  start_period INTEGER NOT NULL,
  span_periods INTEGER NOT NULL,
  session_type TEXT DEFAULT 'lecture'
);

CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'إعلان رسمي',
  content TEXT NOT NULL,
  is_pinned INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lectures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_name TEXT NOT NULL,
  title TEXT NOT NULL,
  department_name TEXT DEFAULT 'شبكات وآلات كهربية',
  year_label TEXT DEFAULT 'الصف الأول',
  file_url TEXT NOT NULL,
  file_size TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
