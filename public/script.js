// --- KONEKSI KE SERVER ---
const socket = io();

// --- VARIABEL GAME (STATE) ---
let allQuestions = [];      // Menampung semua soal dari database
let currentQuestions = [];  // Soal yang sedang dimainkan (sesuai kategori)
let currentIndex = 0;       // Kita sedang di soal nomor berapa?
let score = 0;              // Skor siswa
let timerInterval;          // Untuk hitung mundur

// --- AMBIL ELEMEN DARI HTML (DOM SELECTION) ---
const screenWelcome = document.getElementById('welcome-screen');
const screenCategory = document.getElementById('category-screen');
const screenQuiz = document.getElementById('quiz-screen');

const txtUsername = document.getElementById('username');
const txtQuestion = document.getElementById('q-text');
const imgQuestion = document.getElementById('q-image');
const txtTimer = document.getElementById('timer');
const txtScore = document.getElementById('score');

// --- FUNGSI 1: MULAI & MINTA DATA ---
function startQuiz() {
    const name = txtUsername.value;
    if (name.trim() === "") {
        alert("Halo adik manis, isi namamu dulu ya! 😊");
        return;
    }

    // Pindah ke layar kategori
    screenWelcome.classList.remove('active');
    screenCategory.classList.add('active');

    // Minta soal ke server (PENTING!)
    socket.emit('request_questions');
}

// Saat server mengirim data soal
socket.on('send_questions', (data) => {
    console.log("Soal diterima dari database:", data);
    allQuestions = data; // Simpan semua soal di memori
});

// --- FUNGSI 2: PILIH KATEGORI ---
function selectCategory(categoryName) {
    // Filter soal sesuai kategori yang dipilih (misal: hanya 'Matematika')
    currentQuestions = allQuestions.filter(q => q.category === categoryName);

    if (currentQuestions.length === 0) {
        alert("Maaf, belum ada soal untuk pelajaran ini. Coba yang lain ya!");
        return;
    }

    // Reset permainan
    currentIndex = 0;
    score = 0;
    txtScore.innerText = "⭐ 0";

    // Pindah ke layar kuis
    screenCategory.classList.remove('active');
    screenQuiz.classList.add('active');

    showQuestion();
}

// --- FUNGSI 3: TAMPILKAN SOAL ---
function showQuestion() {
    // Bersihkan timer lama jika ada
    clearInterval(timerInterval);
    
    // Cek apakah soal sudah habis?
    if (currentIndex >= currentQuestions.length) {
        endGame();
        return;
    }

    const q = currentQuestions[currentIndex];

    // Tampilkan Teks & Gambar
    txtQuestion.innerText = q.question_text;
    
    // Logika gambar: Jika ada url gambar, tampilkan. Jika tidak, sembunyikan.
    if (q.image_url && q.image_url !== 'null') {
        imgQuestion.src = "/images/" + q.image_url; // Pastikan folder images ada nanti
        imgQuestion.classList.remove('hidden');
    } else {
        imgQuestion.classList.add('hidden');
    }

    // Masukkan pilihan jawaban ke tombol
    document.getElementById('opt-a').innerText = q.option_a;
    document.getElementById('opt-b').innerText = q.option_b;
    document.getElementById('opt-c').innerText = q.option_c;
    document.getElementById('opt-d').innerText = q.option_d;

    // Reset warna tombol
    resetButtons();

    // Mulai Timer 30 detik
    startTimer(30);
}

// --- FUNGSI 4: CEK JAWABAN ---
function checkAnswer(selectedOption) {
    const q = currentQuestions[currentIndex];
    const correct = q.correct_answer; // 'a', 'b', 'c', atau 'd'

    // Kunci tombol agar tidak diklik 2 kali
    disableButtons(true);

    if (selectedOption === correct) {
        // JIKA BENAR
        score += 100;
        txtScore.innerText = "⭐ " + score;
        // Ubah warna tombol jadi hijau (feedback visual)
        document.querySelector(`button[onclick="checkAnswer('${selectedOption}')"]`).style.backgroundColor = "#4ECDC4"; 
    } else {
        // JIKA SALAH
        // Ubah tombol yang diklik jadi merah
        document.querySelector(`button[onclick="checkAnswer('${selectedOption}')"]`).style.backgroundColor = "#FF6B6B";
        // Beritahu jawaban yang benar (hijau)
        document.querySelector(`button[onclick="checkAnswer('${correct}')"]`).style.backgroundColor = "#4ECDC4";
    }

    // Tunggu 1 detik, lalu lanjut ke soal berikutnya
    setTimeout(() => {
        currentIndex++;
        disableButtons(false);
        showQuestion();
    }, 1500);
}

// --- UTILITIES (Fungsi Bantuan) ---

function startTimer(seconds) {
    let timeLeft = seconds;
    txtTimer.innerText = "⏳ " + timeLeft;
    
    timerInterval = setInterval(() => {
        timeLeft--;
        txtTimer.innerText = "⏳ " + timeLeft;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            // Waktu habis, anggap salah & lanjut
            checkAnswer('wrong'); 
        }
    }, 1000);
}

function resetButtons() {
    const buttons = document.querySelectorAll('.btn-answer');
    buttons.forEach(btn => {
        btn.style.backgroundColor = "#1A535C"; // Kembali ke warna asal
        btn.disabled = false;
    });
}

function disableButtons(state) {
    const buttons = document.querySelectorAll('.btn-answer');
    buttons.forEach(btn => btn.disabled = state);
}

function endGame() {
    alert("Hore! Permainan Selesai! Skor Akhirmu: " + score);
    location.reload(); // Refresh halaman untuk main lagi
}