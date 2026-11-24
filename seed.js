const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'sahafa.db'));
const schema = fs.readFileSync(path.join(__dirname, 'database.sql'), 'utf8');
const studentsMap = JSON.parse(fs.readFileSync(path.join(__dirname, 'students-seed.json'), 'utf8'));

db.serialize(() => {
  db.exec(schema);

  const hash = bcrypt.hashSync('Sahafa@2026', 10);
  db.run(
    'INSERT OR IGNORE INTO admins (username, password_hash, full_name) VALUES (?, ?, ?)',
    ['admin', hash, 'مدير البوابة الإلكترونية']
  );

  const stmt = db.prepare(
    'INSERT OR IGNORE INTO students (seat_number, full_name, department, academic_year, student_group) VALUES (?, ?, ?, ?, ?)'
  );
  let count = 0;
  for (const [seat, fullName] of Object.entries(studentsMap)) {
    const grp = Number(seat) % 2 === 1 ? 'أ' : 'ب';
    stmt.run(seat, fullName, 'شبكات وآلات كهربية', 'الفرقة الأولى', grp);
    count++;
  }
  stmt.finalize(() => {
    console.log(`تمت تهيئة قاعدة البيانات وإدراج ${count} طالباً بنجاح.`);
    db.close();
  });
});
