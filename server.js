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

        const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (existingUser) {
            return res.status(400).json({ error: 'Этот email уже занят другим путешественником!' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const insertUser = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)');
        insertUser.run(username, email, hashedPassword);

        res.status(201).json({ message: 'Путешественник успешно создан!' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Что-то пошло не так на сервере...' });
    }
});

// 3. Вход
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        
        if (!user) {
            return res.status(400).json({ error: 'Путешественник с таким email не найден!' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
            return res.status(400).json({ error: 'Неверный пароль!' });
        }

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
        console.error(error);
        res.status(500).json({ error: 'Ошибка при входе...' });
    }
}); // 👈 ВОТ ЗДЕСЬ МЫ ПРАВИЛЬНО ЗАКРЫЛИ МАРШРУТ ВХОДА!

// 4. Создание статьи с картинкой
app.post('/api/articles', upload.single('image'), (req, res) => {
    try {
        const { title, content, author_id } = req.body;
        
        let imageUrl = null;
        if (req.file) {
            imageUrl = '/uploads/' + req.file.filename;
        }

        if (!title || !content) {
            return res.status(400).json({ error: 'Заголовок и текст статьи обязательны!' });
        }

        const insertArticle = db.prepare('INSERT INTO articles (title, content, image_url, author_id) VALUES (?, ?, ?, ?)');
        const info = insertArticle.run(title, content, imageUrl, author_id);

        res.status(201).json({ message: 'Статья с картинкой добавлена!', articleId: info.lastInsertRowid });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось сохранить статью.' });
    }
});

// 5. Получение всех статей
app.get('/api/articles', (req, res) => {
    try {
        const articles = db.prepare(`
            SELECT articles.*, users.username as author_name 
            FROM articles 
            LEFT JOIN users ON articles.author_id = users.id 
            ORDER BY articles.created_at DESC
        `).all();

        res.status(200).json(articles);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить статьи.' });
    }
});


// --- ЗАПУСК СЕРВЕРА ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, (0.0.0.0) => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
