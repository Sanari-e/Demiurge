require('dotenv').config(); // Читаем .env
const express = require('express');
const cors = require('cors');
const multer = require('multer'); 
const path = require('path');
const bcrypt = require('bcryptjs'); 
const db = require('./database');  
const s3 = require('./storage'); // Наш файл с настройками

const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

// --- НАСТРОЙКА MULTER ---
const storage = multer.memoryStorage();
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
        let imageUrl = null;

        // Загружаем картинку в Filebase
        if (req.file) {
            const fileKey = `maps/${Date.now()}_${req.file.originalname}`;
            const command = new PutObjectCommand({
                Bucket: process.env.FILEBASE_BUCKET_NAME,
                Key: fileKey,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
            });
            await s3.send(command);
            imageUrl = fileKey; // Сохраняем в БД только имя файла
        }

        if (!title || !content) {
            return res.status(400).json({ error: 'Заголовок и текст статьи обязательны!' });
        }

        // (Здесь предполагается, что ты уже перешел на PostgreSQL. Если SQLite - используй свой старый код)
        const insertArticle = db.prepare('INSERT INTO articles (title, content, image_url, author_id) VALUES (?, ?, ?, ?)');
        const info = insertArticle.run(title, content, imageUrl, author_id);

        res.status(201).json({ message: 'Статья добавлена!', articleId: info.lastInsertRowid });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось сохранить статью.' });
    }
});

// --- ПОЛУЧЕНИЕ ВСЕХ СТАТЕЙ ---
app.get('/api/articles', async (req, res) => {
    try {
        // Получаем статьи из базы (код зависит от того, SQLite у тебя или PostgreSQL)
        // Для PostgreSQL:
        const result = await db.query(`
            SELECT articles.*, users.username as author_name 
            FROM articles 
            LEFT JOIN users ON articles.author_id = users.id 
            ORDER BY articles.created_at DESC
        `);
        
        const articles = result.rows;

        // Генерируем временные ссылки на картинки
        for (let article of articles) {
            if (article.image_url) {
                const command = new GetObjectCommand({
                    Bucket: process.env.FILEBASE_BUCKET_NAME,
                    Key: article.image_url,
                });
                // Ссылка будет жить 1 час (3600 секунд)
                article.image_url = await getSignedUrl(s3, command, { expiresIn: 3600 });
            }
        }

        res.status(200).json(articles);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить статьи.' });
    }
});

// Получение ОДНОЙ статьи по ID
app.get('/api/articles/:id', async (req, res) => {
    try {
        const articleId = req.params.id;
        // В PostgreSQL (или SQLite, если используешь его)
        const result = await db.query(`
            SELECT articles.*, users.username as author_name 
            FROM articles 
            LEFT JOIN users ON articles.author_id = users.id 
            WHERE articles.id = $1
        `, [articleId]);
        
        const article = result.rows[0];

        if (!article) {
            return res.status(404).json({ error: 'Статья не найдена' });
        }

        // Генерируем ссылку на картинку, если она есть
        if (article.image_url) {
            const command = new GetObjectCommand({
                Bucket: process.env.FILEBASE_BUCKET_NAME,
                Key: article.image_url,
            });
            article.image_url = await getSignedUrl(s3, command, { expiresIn: 3600 });
        }

        res.status(200).json(article);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при получении статьи.' });
    }
});




// Редактирование статьи
app.put('/api/articles/:id', upload.single('image'), async (req, res) => {
    try {
        const articleId = req.params.id;
        const { title, content, author_id } = req.body; // Ловим author_id с фронта

        // 1. Получаем статью
        const result = await db.query('SELECT * FROM articles WHERE id = $1', [articleId]);
        const currentArticle = result.rows[0];

        if (!currentArticle) {
            return res.status(404).json({ error: 'Статья не найдена' });
        }

        // ПРОВЕРКА ПРАВ: удалять/менять может только автор
        if (currentArticle.author_id != author_id) {
            return res.status(403).json({ error: 'У вас нет прав на редактирование этой статьи!' });
        }

        let newImageUrl = currentArticle.image_url;

        // 2. Если загружена новая картинка
        if (req.file) {
            const fileKey = `maps/${Date.now()}_${req.file.originalname}`;
            const uploadCommand = new PutObjectCommand({
                Bucket: process.env.FILEBASE_BUCKET_NAME,
                Key: fileKey,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
            });
            await s3.send(uploadCommand);
            newImageUrl = fileKey;

            // Удаляем старую картинку из облака, если она была
            if (currentArticle.image_url) {
                const deleteCommand = new DeleteObjectCommand({
                    Bucket: process.env.FILEBASE_BUCKET_NAME,
                    Key: currentArticle.image_url,
                });
                await s3.send(deleteCommand);
            }
        }

        // 3. Обновляем в базе
        await db.query(
            'UPDATE articles SET title = $1, content = $2, image_url = $3 WHERE id = $4',
            [title, content, newImageUrl, articleId]
        );

        res.status(200).json({ message: 'Статья успешно обновлена!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при редактировании.' });
    }
});


// Удаление статьи
app.delete('/api/articles/:id', async (req, res) => {
    try {
        const articleId = req.params.id;
        const author_id = req.query.author_id; // Ловим ID из ссылки

        // 1. Находим статью
        const result = await db.query('SELECT * FROM articles WHERE id = $1', [articleId]);
        const article = result.rows[0];

        if (!article) {
            return res.status(404).json({ error: 'Статья не найдена' });
        }

        // ПРОВЕРКА ПРАВ
        if (article.author_id != author_id) {
            return res.status(403).json({ error: 'У вас нет прав на удаление этой статьи!' });
        }

        // 2. Удаляем картинку из Filebase
        if (article.image_url) {
            const deleteCommand = new DeleteObjectCommand({
                Bucket: process.env.FILEBASE_BUCKET_NAME,
                Key: article.image_url,
            });
            await s3.send(deleteCommand);
        }

        // 3. Удаляем из базы
        await db.query('DELETE FROM articles WHERE id = $1', [articleId]);

        res.status(200).json({ message: 'Статья и её изображение удалены.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при удалении.' });
    }
});


// --- ЗАПУСК СЕРВЕРА ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
