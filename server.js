require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'sahafa_institute_1969_super_secret_key';

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname) || '.pdf';
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + ext);
  },
});
const upload = multer({ storage });

const db = new sqlite3.Database(path.join(__dirname, 'sahafa.db'));

// تهيئة الجداول والطلاب تلقائياً عند التشغيل الأول
db.serialize(() => {
  const schema = fs.readFileSync(path.join(__dirname, 'database.sql'), 'utf8');
  db.exec(schema);

  db.get('SELECT id FROM admins WHERE username = ?', ['admin'], (err, row) => {
    if (!row) {
      const hash = bcrypt.hashSync('Sahafa@2026', 10);
      db.run(
        'INSERT INTO admins (username, password_hash, full_name) VALUES (?, ?, ?)',
        ['admin', hash, 'مدير البوابة الإلكترونية']
      );
    }
  });

  db.get('SELECT COUNT(*) AS cnt FROM students', [], (err, row) => {
    if (row && row.cnt === 0 && fs.existsSync(path.join(__dirname, 'students-seed.json'))) {
      const studentsMap = JSON.parse(fs.readFileSync(path.join(__dirname, 'students-seed.json'), 'utf8'));
      const stmt = db.prepare(
        'INSERT OR IGNORE INTO students (seat_number, full_name, department, academic_year, student_group) VALUES (?, ?, ?, ?, ?)'
      );
      for (const [seat, fullName] of Object.entries(studentsMap)) {
        const grp = Number(seat) % 2 === 1 ? 'أ' : 'ب';
        stmt.run(seat, fullName, 'شبكات وآلات كهربية', 'الفرقة الأولى', grp);
      }
      stmt.finalize();
    }
  });
});

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'غير مصرح بالدخول' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول' });
  }
}

// ==================== 1. نظام دخول الطلاب ====================
app.post('/api/student/login', (req, res) => {
  const seat = String(req.body.seatNumber || '').trim();
  if (!seat) return res.status(400).json({ error: 'يرجى إدخال رقم الجلوس' });

  db.get('SELECT * FROM students WHERE seat_number = ?', [seat], (err, student) => {
    if (err) return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
    if (!student) return res.status(404).json({ error: `رقم الجلوس (${seat}) غير مسجل في قاعدة البيانات.` });

    const token = jwt.sign({ seatNumber: student.seat_number }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      student: {
        seatNumber: student.seat_number,
        fullName: student.full_name,
        department: student.department,
        academicYear: student.academic_year,
        group: student.student_group,
        grades: JSON.parse(student.grades_json || '{}'),
      },
    });
  });
});

// ==================== 2. واجهة جلب البيانات الحية للبوابة ====================
app.get('/api/portal-data', (req, res) => {
  db.all('SELECT * FROM news ORDER BY is_pinned DESC, created_at DESC', [], (err, news) => {
    db.all('SELECT * FROM lectures ORDER BY created_at DESC', [], (err2, lectures) => {
      db.all('SELECT * FROM schedules ORDER BY id ASC', [], (err3, schedules) => {
        db.get('SELECT COUNT(*) AS totalStudents FROM students', [], (err4, stCount) => {
          res.json({
            totalStudents: stCount ? stCount.totalStudents : 0,
            news: news || [],
            lectures: lectures || [],
            schedules: schedules || [],
          });
        });
      });
    });
  });
});

// ==================== 3. لوحة الإدارة (CMS APIs) ====================
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM admins WHERE username = ?', [username], (err, admin) => {
    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, fullName: admin.full_name });
  });
});

// إضافة أو تحديث طالب واحد
app.post('/api/admin/students', requireAdmin, (req, res) => {
  const { seatNumber, fullName, department, academicYear, group, grades } = req.body;
  if (!seatNumber || !fullName) return res.status(400).json({ error: 'رقم الجلوس واسم الطالب مطلوبان' });
  db.run(
    `INSERT INTO students (seat_number, full_name, department, academic_year, student_group, grades_json)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(seat_number) DO UPDATE SET
       full_name=excluded.full_name,
       department=excluded.department,
       academic_year=excluded.academic_year,
       student_group=excluded.student_group,
       grades_json=excluded.grades_json`,
    [
      String(seatNumber).trim(),
      fullName.trim(),
      department || 'شبكات وآلات كهربية',
      academicYear || 'الفرقة الأولى',
      group || 'أ',
      JSON.stringify(grades || {}),
    ],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// استيراد جماعي للطلاب
app.post('/api/admin/students/bulk', requireAdmin, (req, res) => {
  const students = req.body.students || [];
  const stmt = db.prepare(
    `INSERT INTO students (seat_number, full_name, department, academic_year, student_group, grades_json)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(seat_number) DO UPDATE SET
       full_name=excluded.full_name,
       department=excluded.department,
       academic_year=excluded.academic_year,
       student_group=excluded.student_group,
       grades_json=excluded.grades_json`
  );
  db.serialize(() => {
    students.forEach((s) => {
      stmt.run(
        String(s.seatNumber).trim(),
        s.fullName,
        s.department || 'شبكات وآلات كهربية',
        s.academicYear || 'الفرقة الأولى',
        s.group || 'أ',
        JSON.stringify(s.grades || {})
      );
    });
    stmt.finalize();
    res.json({ success: true, count: students.length });
  });
});

app.get('/api/admin/students', requireAdmin, (req, res) => {
  const q = '%' + String(req.query.q || '').trim() + '%';
  db.all(
    'SELECT * FROM students WHERE seat_number LIKE ? OR full_name LIKE ? ORDER BY CAST(seat_number AS INTEGER) ASC LIMIT 100',
    [q, q],
    (err, rows) => {
      res.json({ students: rows || [] });
    }
  );
});

app.delete('/api/admin/students/:seat', requireAdmin, (req, res) => {
  db.run('DELETE FROM students WHERE seat_number = ?', [req.params.seat], () => res.json({ success: true }));
});

// إدارة الأخبار
app.post('/api/admin/news', requireAdmin, (req, res) => {
  const { title, category, content, isPinned } = req.body;
  db.run(
    'INSERT INTO news (title, category, content, is_pinned) VALUES (?, ?, ?, ?)',
    [title, category || 'إعلان رسمي', content, isPinned ? 1 : 0],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

app.delete('/api/admin/news/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM news WHERE id = ?', [req.params.id], () => res.json({ success: true }));
});

// إدارة الجداول
app.post('/api/admin/schedules', requireAdmin, (req, res) => {
  const s = req.body;
  db.run(
    `INSERT INTO schedules (department_id, department_name, year_label, term_label, day_id, day_label, group_name, subject_title, instructor, room, start_period, span_periods, session_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      s.departmentId || 'networks-y1-t1',
      s.departmentName || 'شبكات وآلات كهربية',
      s.yearLabel || 'الفرقة الأولى',
      s.termLabel || 'الفصل الدراسي الأول',
      s.dayId,
      s.dayLabel,
      s.groupName,
      s.subjectTitle,
      s.instructor || '',
      s.room || '',
      Number(s.startPeriod),
      Number(s.spanPeriods),
      s.sessionType || 'lecture',
    ],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

app.delete('/api/admin/schedules/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM schedules WHERE id = ?', [req.params.id], () => res.json({ success: true }));
});

// رفع وإدارة المحاضرات PDF
app.post('/api/admin/lectures', requireAdmin, upload.single('pdfFile'), (req, res) => {
  const { subjectName, title, departmentName, yearLabel, summary } = req.body;
  const fileUrl = req.file ? `/uploads/${req.file.filename}` : req.body.fileUrl;
  const fileSize = req.file ? `${Math.round(req.file.size / 1024)} KB` : '';

  db.run(
    'INSERT INTO lectures (subject_name, title, department_name, year_label, file_url, file_size, summary) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [subjectName, title, departmentName || 'شبكات وآلات كهربية', yearLabel || 'الصف الأول', fileUrl, fileSize, summary || ''],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, fileUrl });
    }
  );
});

app.delete('/api/admin/lectures/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM lectures WHERE id = ?', [req.params.id], () => res.json({ success: true }));
});

app.get('/admin', (_, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'public', 'omar-ai-v6.html')));

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`البوابة الرسمية للمعهد الفني الصناعي بالصحافة تعمل الآن:`);
  console.log(`الموقع الرئيسي: http://localhost:${PORT}`);
  console.log(`لوحة الإدارة (CMS): http://localhost:${PORT}/admin`);
  console.log(`====================================================`);
});
