const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');

        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS enquiries (
                                                             id TEXT PRIMARY KEY,
                                                             name TEXT, email TEXT, phone TEXT,
                                                             message TEXT, status TEXT, date TEXT
                    )`);

            db.run(`CREATE TABLE IF NOT EXISTS courses (
                                                           id TEXT PRIMARY KEY,
                                                           name TEXT, duration TEXT, semesters INTEGER,
                                                           fee INTEGER, description TEXT
                    )`);


            db.run(`CREATE TABLE IF NOT EXISTS students (
                id TEXT PRIMARY KEY,
                rollNo TEXT UNIQUE, name TEXT, email TEXT, phone TEXT,
                dob TEXT, gender TEXT, address TEXT, courseId TEXT,
                batch TEXT, admissionDate TEXT, guardianName TEXT,
                guardianPhone TEXT, password TEXT
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS results (
                id TEXT PRIMARY KEY,
                studentId TEXT, semester INTEGER,
                subjects TEXT -- Stored as a JSON string
            )`);

            // Seed a few sample courses so the Courses page has something

            db.get(`SELECT COUNT(*) AS count FROM courses`, [], (err, row) => {
                if (!err && row.count === 0) {
                    const seed = db.prepare(
                        `INSERT INTO courses (id, name, duration, semesters, fee, description) VALUES (?,?,?,?,?,?)`
                    );
                    seed.run('c1', "Bachelor of Arts (B.A.)", "1 Year (Single Sitting)", 2, 25000, "Complete your B.A. in a single sitting. UGC approved degree.");
                    seed.run('c2', "Bachelor of Commerce (B.Com)", "1 Year (Single Sitting)", 2, 28000, "Fast-track B.Com for working professionals, UGC recognized.");
                    seed.run('c3', "Bachelor of Technology (B.Tech)", "2 Years (Distance)", 4, 65000, "Distance B.Tech tailored for working professionals to upgrade technical roles.");
                    seed.run('c4', "Diploma in Management", "6 Months", 1, 15000, "Industry-recognized short-term diploma to boost your management skills.");
                    seed.finalize();
                    console.log('Seeded sample courses.');
                }
            });
        });
    }
});

module.exports = db;