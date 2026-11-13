const express = require('express');
const cors = require('cors');
const multer = require('multer'); 
const path = require('path');
const bcrypt = require('bcryptjs'); 
const db = require('./database');  

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

// --- НАСТРОЙКА MULTER ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'public', 'uploads')); 
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });


// --- МАРШРУТЫ (API) ---

// 1. Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'glavnaya.html'));
});

// 2. Регистрация
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    // Проверка на существующего пользователя
    const existing = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Этот email уже занят!' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    // Вставка нового пользователя (обратите внимание на $1, $2, $3)
    await db.query('INSERT INTO users (username, email, password) VALUES ($1, $2, $3)', [username, email, hashedPassword]);
    res.status(201).json({ message: 'Путешественник успешно создан!' });
  } catch (error) { /* ... */ }
});

// --- ВХОД ---
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        // 1. Ищем пользователя в PostgreSQL
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0]; // 👈 ВАЖНО: данные теперь в .rows[0] (раньше было .get())
        // Если не нашли — выдаем ошибку
        if (!user) {
            return res.status(400).json({ error: 'Путешественник с таким email не найден!' });
        }
        // 2. Сравниваем пароль
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ error: 'Неверный пароль!' });
        }
        // 3. Отправляем данные пользователя
        res.status(200).json({ 
            message: 'С возвращением!', 
            user: { 
                id: user.id, 
                username: user.username, 
                email: user.email, 
                role: user.role 
            } 
        });
    } catch (error) {
        console.error(error); // Если упадет — мы увидим это в логах Railway
        res.status(500).json({ error: 'Ошибка при входе...' });
    }
});

// --- СОЗДАНИЕ СТАТЬИ ---
app.post('/api/articles', upload.single('image'), async (req, res) => {
  try {
    const { title, content, author_id } = req.body;
    let imageUrl = req.file ? '/uploads/' + req.file.filename : null;
    
    const result = await db.query(
      'INSERT INTO articles (title, content, image_url, author_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [title, content, imageUrl, author_id]
    );
    res.status(201).json({ message: 'Статья добавлена!', articleId: result.rows[0].id });
  } catch (error) { /* ... */ }
});

// --- ПОЛУЧЕНИЕ ВСЕХ СТАТЕЙ ---
app.get('/api/articles', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT articles.*, users.username as author_name 
      FROM articles 
      LEFT JOIN users ON articles.author_id = users.id 
      ORDER BY articles.created_at DESC
    `);
    res.status(200).json(result.rows); // Отправляем массив из .rows
  } catch (error) { /* ... */ }
});

// --- ЗАПУСК СЕРВЕРА ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
