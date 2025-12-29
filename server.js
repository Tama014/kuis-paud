const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- CONFIG UPLOAD ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './public/uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.static('public')); 

// --- DATABASE ---
const db = mysql.createConnection({
    host: 'localhost', user: 'root', password: '', database: 'db_kuis_paud'
});

db.connect(err => {
    if(err) {
        console.error('❌ DB Error:', err);
    } else {
        console.log('✅ Terhubung ke Database MySQL');
        initDb();
    }
});

function initDb() {
    const createTable = `CREATE TABLE IF NOT EXISTS questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category VARCHAR(50), question_text TEXT, image_path VARCHAR(255),
        option_a VARCHAR(100), option_b VARCHAR(100), option_c VARCHAR(100), option_d VARCHAR(100),
        correct_answer CHAR(1)
    )`;

    db.query(createTable, () => {
        db.query("SELECT COUNT(*) as count FROM questions", (err, res) => {
            if(res[0].count === 0) {
                console.log("📥 Mengisi Data Awal...");
                const q1 = `INSERT INTO questions (category, question_text, image_path, option_a, option_b, option_c, option_d, correct_answer) VALUES ('Sains', 'Hewan manakah yang menghasilkan susu?', NULL, 'Ayam', 'Sapi', 'Kucing', 'Ikan', 'b')`;
                const q2 = `INSERT INTO questions (category, question_text, image_path, option_a, option_b, option_c, option_d, correct_answer) VALUES ('Sains', 'Raja hutan yang suaranya mengaum adalah...', NULL, 'Gajah', 'Jerapah', 'Singa', 'Zebra', 'c')`;
                db.query(q1); db.query(q2);
            }
        });
    });
}

// --- API ROUTES ---
app.post('/api/questions', upload.single('image_file'), (req, res) => {
    const { category, question_text, option_a, option_b, option_c, option_d, correct_answer } = req.body;
    const image_path = req.file ? req.file.filename : null;
    const sql = `INSERT INTO questions (category, question_text, image_path, option_a, option_b, option_c, option_d, correct_answer) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    db.query(sql, [category, question_text, image_path, option_a, option_b, option_c, option_d, correct_answer], (err, result) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({message: 'Soal berhasil disimpan!', id: result.insertId});
    });
});

app.get('/api/questions', (req, res) => {
    db.query("SELECT * FROM questions ORDER BY id DESC", (err, results) => {
        if(err) return res.status(500).send(err);
        res.json(results);
    });
});

app.put('/api/questions/:id', upload.single('image_file'), (req, res) => {
    const { id } = req.params;
    const { category, question_text, option_a, option_b, option_c, option_d, correct_answer, old_image } = req.body;
    const image_path = req.file ? req.file.filename : old_image;
    const sql = `UPDATE questions SET category=?, question_text=?, image_path=?, option_a=?, option_b=?, option_c=?, option_d=?, correct_answer=? WHERE id=?`;
    db.query(sql, [category, question_text, image_path, option_a, option_b, option_c, option_d, correct_answer, id], (err) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({message: 'Soal berhasil diupdate!'});
    });
});

app.delete('/api/questions/:id', (req, res) => {
    db.query("DELETE FROM questions WHERE id = ?", [req.params.id], (err) => {
        if(err) return res.status(500).send(err);
        res.json({message: 'Terhapus'});
    });
});

app.get('/api/export/:roomCode', async (req, res) => {
    const { roomCode } = req.params;
    const room = activeRooms[roomCode];
    if (!room) return res.status(404).send("Data Room tidak ditemukan.");

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Hasil Kuis');
    worksheet.columns = [
        { header: 'Peringkat', key: 'rank', width: 10 },
        { header: 'Nama Siswa', key: 'name', width: 30 },
        { header: 'Skor Akhir', key: 'score', width: 15 },
        { header: 'Benar', key: 'correct', width: 15 },
        { header: 'Salah', key: 'wrong', width: 15 }
    ];
    const sortedPlayers = room.players.sort((a,b) => b.score - a.score);
    sortedPlayers.forEach((p, index) => {
        worksheet.addRow({ rank: index + 1, name: p.name, score: p.score, correct: p.correctCount || 0, wrong: p.wrongCount || 0 });
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Hasil_${roomCode}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
});

// --- GAME LOGIC ---
let activeRooms = {}; 

io.on('connection', (socket) => {
    console.log('User connect:', socket.id);

    socket.on('create_room', (category) => {
        const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        const sql = "SELECT * FROM questions WHERE category = ?";
        db.query(sql, [category], (err, results) => {
            if(err || results.length === 0) {
                socket.emit('error', 'Tidak ada soal untuk kategori ini!');
                return;
            }
            activeRooms[roomCode] = { 
                teacherSocket: socket.id, 
                players: [], 
                category: category,
                questions: results.sort(() => Math.random() - 0.5),
                status: 'waiting'
            };
            socket.join(roomCode);
            socket.emit('room_created', roomCode);
        });
    });

    socket.on('join_room', ({ roomCode, name }) => {
        const room = activeRooms[roomCode];
        if (room && room.status === 'waiting') {
            const player = { 
                id: socket.id, name: name, score: 0, currentQIndex: 0, correctCount: 0, wrongCount: 0 
            };
            room.players.push(player);
            socket.join(roomCode);
            socket.emit('join_success', room.category);
            io.to(room.teacherSocket).emit('update_player_list', room.players);
        } else {
            socket.emit('error', 'Kode salah atau game sudah mulai!');
        }
    });

    socket.on('start_game', (roomCode) => {
        const room = activeRooms[roomCode];
        if(!room) return;
        room.status = 'playing';
        room.players.forEach(player => sendQuestionToPlayer(roomCode, player.id));
        io.to(room.teacherSocket).emit('game_started_teacher');
        broadcastLeaderboard(roomCode);
    });

    socket.on('submit_answer', ({ roomCode, answer }) => {
        const room = activeRooms[roomCode];
        if(!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if(!player) return;

        const currentQ = room.questions[player.currentQIndex];
        const isCorrect = (answer === currentQ.correct_answer);

        // 1. KIRIM STATUS JAWABAN (ANIMASI)
        io.to(player.id).emit('answer_result', { isCorrect: isCorrect, yourAnswer: answer });

        // 2. JEDA 2 DETIK
        setTimeout(() => {
            if(isCorrect) {
                player.score += 100;
                player.correctCount++;
            } else {
                player.wrongCount++;
            }
            player.currentQIndex++;

            broadcastLeaderboard(roomCode);

            if (player.currentQIndex < room.questions.length) {
                sendQuestionToPlayer(roomCode, player.id);
            } else {
                // HITUNG RANKING DULU SEBELUM KIRIM
                const allPlayers = room.players.sort((a,b) => b.score - a.score);
                const myRank = allPlayers.findIndex(p => p.id === player.id) + 1;

                io.to(player.id).emit('game_finished', {
                    score: player.score,
                    correct: player.correctCount,
                    wrong: player.wrongCount,
                    rank: myRank // <-- KIRIM RANKING KE SISWA
                });
            }
        }, 2000);
    });

    function sendQuestionToPlayer(roomCode, playerId) {
        const room = activeRooms[roomCode];
        const player = room.players.find(p => p.id === playerId);
        const q = room.questions[player.currentQIndex];

        io.to(playerId).emit('new_question', {
            index: player.currentQIndex + 1,
            total: room.questions.length,
            question_text: q.question_text,
            image_path: q.image_path,
            options: { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d }
        });
    }

    function broadcastLeaderboard(roomCode) {
        const room = activeRooms[roomCode];
        if(!room) return;
        const sortedPlayers = room.players.sort((a,b) => b.score - a.score);
        io.to(room.teacherSocket).emit('live_update', { players: sortedPlayers });
        io.to(roomCode).emit('leaderboard_update', sortedPlayers);
    }
});

const PORT = 3000;
server.listen(PORT, () => console.log(`🚀 Server Ready di port ${PORT}`));