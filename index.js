const express = require('express');
const cors = require('cors');
const crypto = require('crypto'); // Built into Node.js for generating IDs
const bcrypt = require('bcryptjs'); // For hashing student passwords
const db = require('./db');
module.exports = app;
export default app;

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json()); // Allows Express to parse JSON bodies

// Define allowed tables and their columns to prevent SQL injection
const schema = {
    enquiries: ['name', 'email', 'phone', 'message', 'status', 'date'],
    courses: ['name', 'duration', 'semesters', 'fee', 'description'],
    students: ['rollNo', 'name', 'email', 'phone', 'dob', 'gender', 'address', 'courseId', 'batch', 'admissionDate', 'guardianName', 'guardianPhone'],
    results: ['studentId', 'semester', 'subjects']
};

function generateRollNo() {
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `VB${year}${random}`;
}

function stripPassword(row) {
    if (!row) return row;
    const { password, ...safe } = row;
    return safe;
}

// ================================================================
// CUSTOM ROUTES — registered BEFORE the generic CRUD loop so they
// take priority over the generic /api/students POST handler below.
// ================================================================

// ENQUIRE NOW (Contact Us) -> saved to `enquiries`, kept as a thin
// wrapper around the generic table so status/date always get set.
app.post('/api/enquiries', (req, res) => {
    const { name, email, phone, message } = req.body;
    if (!name || !email || !message) {
        return res.status(400).json({ error: 'Name, email and message are required' });
    }
    const id = crypto.randomUUID();
    const date = new Date().toISOString();
    db.run(
        `INSERT INTO enquiries (id, name, email, phone, message, status, date) VALUES (?,?,?,?,?,?,?)`,
        [id, name, email, phone || '', message, 'new', date],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ id, message: 'Enquiry submitted successfully' });
        }
    );
});

// ENROLL NOW (Admission form) -> saved to `students`, password hashed.
app.post('/api/students', async (req, res) => {
    try {
        const data = req.body;
        // 1. Removed 'password' from required array
        const required = ['name', 'email', 'phone', 'courseId'];
        const missing = required.filter((f) => !data[f]);
        if (missing.length) {
            return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
        }

        const id = crypto.randomUUID();
        const rollNo = generateRollNo();
        // 2. Set a default password if missing, so the DB doesn't break.
        // Admin will change this later.
        const plainPassword = data.password || 'vertex123';
        const hashedPassword = await bcrypt.hash(String(plainPassword), 10);
        const admissionDate = new Date().toISOString().split('T')[0];

        const cols = ['id', 'rollNo', 'name', 'email', 'phone', 'dob', 'gender', 'address', 'courseId', 'batch', 'admissionDate', 'guardianName', 'guardianPhone', 'password'];
        const values = [
            id, rollNo, data.name, data.email, data.phone,
            data.dob || '', data.gender || '', data.address || '',
            data.courseId, data.batch || '', admissionDate,
            data.guardianName || '', data.guardianPhone || '', hashedPassword
        ];
        const placeholders = cols.map(() => '?').join(',');

        db.run(`INSERT INTO students (${cols.join(',')}) VALUES (${placeholders})`, values, function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({
                id, rollNo, name: data.name,
                message: 'Admission successful. Save your Roll Number — you will need it to log in and view results.'
            });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// UPDATE STUDENT (Admin Dashboard) -> handles hashing new passwords
app.put('/api/students/:id', async (req, res) => {
    try {
        const data = req.body;
        let assignments = [];
        let values = [];

        // All updatable columns except password
        const cols = ['rollNo', 'name', 'email', 'phone', 'dob', 'gender', 'address', 'courseId', 'batch', 'admissionDate', 'guardianName', 'guardianPhone'];

        cols.forEach(col => {
            if (data[col] !== undefined) {
                assignments.push(`${col} = ?`);
                values.push(data[col]);
            }
        });

        // If the admin typed a new password, hash it and add it to the update list
        if (data.password && data.password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(String(data.password), 10);
            assignments.push(`password = ?`);
            values.push(hashedPassword);
        }

        if (assignments.length === 0) return res.json({ id: req.params.id, message: 'No changes' });

        const sql = `UPDATE students SET ${assignments.join(', ')} WHERE id = ?`;
        values.push(req.params.id);

        db.run(sql, values, function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Student not found' });
            res.json({ id: req.params.id, ...data });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// LOGIN (Roll No + Password) -> used by the Results page.
app.post('/api/login', (req, res) => {
    const { rollNo, password } = req.body;
    if (!rollNo || !password) {
        return res.status(400).json({ error: 'Roll number and password are required' });
    }
    db.get(`SELECT * FROM students WHERE rollNo = ?`, [rollNo], async (err, student) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!student) return res.status(401).json({ error: 'Invalid roll number or password' });

        const match = await bcrypt.compare(String(password), student.password);
        if (!match) return res.status(401).json({ error: 'Invalid roll number or password' });

        res.json({ success: true, student: stripPassword(student) });
    });
});

// RESULTS for one logged-in student.
app.get('/api/results/:studentId', (req, res) => {
    db.all(`SELECT * FROM results WHERE studentId = ?`, [req.params.studentId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        rows.forEach((r) => {
            if (r.subjects) {
                try { r.subjects = JSON.parse(r.subjects); } catch (_) { /* leave as-is */ }
            }
        });
        res.json(rows);
    });
});

// ================================================================
// GENERIC CRUD ROUTES (unchanged from the original) — these still
// power GET /api/courses, GET /api/enquiries, GET/PUT/DELETE for
// students, and all of the `results` table's list/update/delete.
// Because they're registered AFTER the custom routes above, the
// custom POST /api/students and POST /api/enquiries win for those
// two paths; everything else falls through to here.
// ================================================================
Object.keys(schema).forEach((table) => {
    const columns = schema[table];

    // 1. LIST (GET)
    app.get(`/api/${table}`, (req, res) => {
        db.all(`SELECT * FROM ${table}`, [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });

            if (table === 'results') {
                rows.forEach(r => { if (r.subjects) r.subjects = JSON.parse(r.subjects); });
            }
            if (table === 'students') {
                rows = rows.map(stripPassword);
            }
            res.json(rows);
        });
    });

    // 2. CREATE (POST) — students & enquiries are overridden above.
    app.post(`/api/${table}`, (req, res) => {
        const id = crypto.randomUUID();
        const data = req.body;

        if (table === 'results' && data.subjects) {
            data.subjects = JSON.stringify(data.subjects);
        }

        const keys = columns.filter(col => data[col] !== undefined);
        const values = keys.map(col => data[col]);
        const placeholders = keys.map(() => '?').join(',');

        const sql = `INSERT INTO ${table} (id, ${keys.join(',')}) VALUES (?, ${placeholders})`;

        db.run(sql, [id, ...values], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ id, ...req.body });
        });
    });

    // 3. UPDATE (PUT)
    app.put(`/api/${table}/:id`, (req, res) => {
        const data = req.body;

        if (table === 'results' && data.subjects) {
            data.subjects = JSON.stringify(data.subjects);
        }
        if (table === 'students' && data.password) {
            return res.status(400).json({ error: 'Use a dedicated change-password route; refusing to store a plain-text password.' });
        }

        const keys = columns.filter(col => data[col] !== undefined);
        const values = keys.map(col => data[col]);
        const assignments = keys.map(col => `${col} = ?`).join(', ');

        const sql = `UPDATE ${table} SET ${assignments} WHERE id = ?`;

        db.run(sql, [...values, req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Record not found' });
            res.json({ id: req.params.id, ...req.body });
        });
    });

    // 4. DELETE
    app.delete(`/api/${table}/:id`, (req, res) => {
        db.run(`DELETE FROM ${table} WHERE id = ?`, [req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, deleted: this.changes });
        });
    });
});

app.listen(port, () => {
    console.log(`API Server is running at http://localhost:${port}`);
});

export default app;