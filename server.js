require('dotenv').config(); // Читаем .env
const express = require('express');
const cors = require('cors');
const multer = require('multer'); 
const path = require('path');
const bcrypt = require('bcryptjs'); 
const db = require('./database');  
const s3 = require('./storage');

// Импортируем только то, что нужно для Cloud.ru
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

// --- НАСТРОЙКА MULTER (Храним файл в памяти) ---
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
    
    const existing = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Этот email уже занят!' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query('INSERT INTO users (username, email, password) VALUES ($1, $2, $3)', [username, email, hashedPassword]);
    
    res.status(201).json({ message: 'Путешественник успешно создан!' });
  } catch (error) { 
    console.error("Ошибка регистрации:", error);
    res.status(500).json({ error: 'Ошибка сервера при регистрации.' });
  }
});

// 3. Вход
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0]; 

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
});

// 4. СОЗДАНИЕ СТАТЬИ
app.post('/api/articles', upload.single('image'), async (req, res) => {
    try {
        const { title, content, author_id } = req.body;
        let imageUrlKey = null; // Здесь будет храниться только имя файла

        if (req.file) {
            const fileExtension = path.extname(req.file.originalname); // берет только .png или .jpg
            const fileKey = `maps/${Date.now()}${fileExtension}`;
            const command = new PutObjectCommand({
                Bucket: process.env.CLOUD_RU_BUCKET_NAME,
                Key: fileKey,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
            });
            await s3.send(command);
            imageUrlKey = fileKey; // Сохраняем в БД ТОЛЬКО ключ
        }

        if (!title || !content) {
            return res.status(400).json({ error: 'Заголовок и текст статьи обязательны!' });
        }

        const insertResult = await db.query(
            'INSERT INTO articles (title, content, image_url, author_id) VALUES ($1, $2, $3, $4) RETURNING id',
            [title, content, imageUrlKey, author_id]
        );
        
        res.status(201).json({ message: 'Статья добавлена!', articleId: insertResult.rows[0].id });
    } catch (error) {
        console.error("Ошибка при создании:", error);
        res.status(500).json({ error: 'Не удалось сохранить статью.' });
    }
});

// 5. ПОЛУЧЕНИЕ ВСЕХ СТАТЕЙ
app.get('/api/articles', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT articles.*, users.username as author_name 
            FROM articles 
            LEFT JOIN users ON articles.author_id = users.id 
            ORDER BY articles.created_at DESC
        `);
        
        const articles = result.rows;

        // Проходимся по статьям и "собираем" полную ссылку для картинок
        for (let article of articles) {
            if (article.image_url) {
                // Формируем ссылку: https://s3.cloud.ru/имя-бакета/ключ
                article.image_url = `${process.env.CLOUD_RU_ENDPOINT}/${process.env.CLOUD_RU_BUCKET_NAME}/${article.image_url}`;
            }
        }

        res.status(200).json(articles);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить статьи.' });
    }
});

// 6. ПОЛУЧЕНИЕ ОДНОЙ СТАТЬИ
app.get('/api/articles/:id', async (req, res) => {
    try {
        const articleId = req.params.id;
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

        // Собираем полную ссылку на картинку
        if (article.image_url) {
            article.image_url = `${process.env.CLOUD_RU_ENDPOINT}/${process.env.CLOUD_RU_BUCKET_NAME}/${article.image_url}`;
        }

        res.status(200).json(article);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при получении статьи.' });
    }
});

// 7. РЕДАКТИРОВАНИЕ СТАТЬИ
app.put('/api/articles/:id', upload.single('image'), async (req, res) => {
    try {
        const articleId = req.params.id;
        const { title, content, author_id } = req.body; 

        const result = await db.query('SELECT * FROM articles WHERE id = $1', [articleId]);
        const currentArticle = result.rows[0];

        if (!currentArticle) {
            return res.status(404).json({ error: 'Статья не найдена' });
        }

        if (currentArticle.author_id != author_id) {
            return res.status(403).json({ error: 'У вас нет прав на редактирование!' });
        }

        let newImageUrlKey = currentArticle.image_url; // По умолчанию оставляем старую картинку

        if (req.file) {
            const fileKey = `maps/${Date.now()}_${req.file.originalname}`;
            const uploadCommand = new PutObjectCommand({
                Bucket: process.env.CLOUD_RU_BUCKET_NAME,
                Key: fileKey,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
            });
            await s3.send(uploadCommand);
            newImageUrlKey = fileKey; // Запоминаем ключ новой картинки

            // Удаляем старую картинку из Cloud.ru (если она была)
            if (currentArticle.image_url) {
                const deleteCommand = new DeleteObjectCommand({
                    Bucket: process.env.CLOUD_RU_BUCKET_NAME,
                    Key: currentArticle.image_url,
                });
                await s3.send(deleteCommand);
            }
        }

        // Обновляем базу данных. В колонку image_url пишем ТОЛЬКО ключ.
        await db.query(
            'UPDATE articles SET title = $1, content = $2, image_url = $3 WHERE id = $4',
            [title, content, newImageUrlKey, articleId]
        );

        res.status(200).json({ message: 'Статья успешно обновлена!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при редактировании.' });
    }
});

// 8. УДАЛЕНИЕ СТАТЬИ
app.delete('/api/articles/:id', async (req, res) => {
    try {
        const articleId = req.params.id;
        const author_id = req.query.author_id;

        const result = await db.query('SELECT * FROM articles WHERE id = $1', [articleId]);
        const article = result.rows[0];

        if (!article) {
            return res.status(404).json({ error: 'Статья не найдена' });
        }

        if (article.author_id != author_id) {
            return res.status(403).json({ error: 'У вас нет прав на удаление!' });
        }

        // Удаляем картинку из Cloud.ru
        if (article.image_url) {
            const deleteCommand = new DeleteObjectCommand({
                Bucket: process.env.CLOUD_RU_BUCKET_NAME,
                Key: article.image_url,
            });
            await s3.send(deleteCommand);
        }

        // Удаляем из базы данных
        await db.query('DELETE FROM articles WHERE id = $1', [articleId]);

        res.status(200).json({ message: 'Статья удалена.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при удалении.' });
    }
});

// --- ЗАПУСК СЕРВЕРА ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
