require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer'); 
const path = require('path');
const bcrypt = require('bcryptjs'); 
const db = require('./database');  
const s3 = require('./storage');

const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });




app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'glavnaya.html'));
});

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

app.post('/api/articles', upload.single('image'), async (req, res) => {
    try {
        const { title, content, author_id } = req.body;
        let imageUrlKey = null;

        if (req.file) {
            const fileExtension = path.extname(req.file.originalname); 
            const fileKey = `maps/${Date.now()}${fileExtension}`;
            const command = new PutObjectCommand({
                Bucket: process.env.CLOUD_RU_BUCKET_NAME,
                Key: fileKey,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
            });
            await s3.send(command);
            imageUrlKey = fileKey;
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

app.get('/api/articles', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT articles.*, users.username as author_name 
            FROM articles 
            LEFT JOIN users ON articles.author_id = users.id 
            ORDER BY articles.created_at DESC
        `);
        
        const articles = result.rows;

        for (let article of articles) {
            if (article.image_url) {
                article.image_url = `${process.env.CLOUD_RU_ENDPOINT}/${process.env.CLOUD_RU_BUCKET_NAME}/${article.image_url}`;
            }
        }

        res.status(200).json(articles);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить статьи.' });
    }
});

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

        if (article.image_url) {
            article.image_url = `${process.env.CLOUD_RU_ENDPOINT}/${process.env.CLOUD_RU_BUCKET_NAME}/${article.image_url}`;
        }

        res.status(200).json(article);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при получении статьи.' });
    }
});

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

        let newImageUrlKey = currentArticle.image_url; 

        if (req.file) {
            const fileKey = `maps/${Date.now()}_${req.file.originalname}`;
            const uploadCommand = new PutObjectCommand({
                Bucket: process.env.CLOUD_RU_BUCKET_NAME,
                Key: fileKey,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
            });
            await s3.send(uploadCommand);
            newImageUrlKey = fileKey; 

            if (currentArticle.image_url) {
                const deleteCommand = new DeleteObjectCommand({
                    Bucket: process.env.CLOUD_RU_BUCKET_NAME,
                    Key: currentArticle.image_url,
                });
                await s3.send(deleteCommand);
            }
        }

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

        if (article.image_url) {
            const deleteCommand = new DeleteObjectCommand({
                Bucket: process.env.CLOUD_RU_BUCKET_NAME,
                Key: article.image_url,
            });
            await s3.send(deleteCommand);
        }

        await db.query('DELETE FROM articles WHERE id = $1', [articleId]);

        res.status(200).json({ message: 'Статья удалена.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при удалении.' });
    }
});




app.post('/api/maps', upload.single('image'), async (req, res) => {
    try {
        const { title, description, author_id, is_private } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ error: 'Вы должны загрузить изображение карты!' });
        }

        const fileExtension = path.extname(req.file.originalname);
        const fileKey = `maps/${Date.now()}${fileExtension}`;
        
        const command = new PutObjectCommand({
            Bucket: process.env.CLOUD_RU_BUCKET_NAME,
            Key: fileKey,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        });
        await s3.send(command);

         if (!title || title.trim() === '') {
            return res.status(400).json({ error: 'Пожалуйста, придумайте название для вашего мира!' });
        }
        
        const insertResult = await db.query(
            'INSERT INTO maps (title, description, image_url, author_id, is_private) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [title, description, fileKey, author_id, is_private === 'true'] // FormData передает строки
        );
        
        res.status(201).json({ message: 'Карта успешно создана!', mapId: insertResult.rows[0].id });
    } catch (error) {
        console.error("Ошибка при создании карты:", error);
        res.status(500).json({ error: 'Не удалось сохранить карту.' });
    }
});

app.get('/api/maps', async (req, res) => {
    try {
        const authorId = req.query.author_id;
        let query = `
            SELECT maps.*, users.username as author_name 
            FROM maps 
            LEFT JOIN users ON maps.author_id = users.id 
        `;
        let values = [];

        if (authorId) {
            // Если зашел автор, показываем ВСЕ его карты (и приватные, и публичные)
            query += ` WHERE maps.author_id = $1`;
            values.push(authorId);
        } else {
            // Если это общий Атлас, показываем ТОЛЬКО публичные
            query += ` WHERE maps.is_private = false`;
        }

        query += ` ORDER BY maps.created_at DESC`;

        const result = await db.query(query, values);
        const maps = result.rows;

        for (let map of maps) {
            if (map.image_url) {
                map.image_url = `${process.env.CLOUD_RU_ENDPOINT}/${process.env.CLOUD_RU_BUCKET_NAME}/${map.image_url}`;
            }
        }
        res.status(200).json(maps);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить карты.' });
    }
});


app.get('/api/maps/:id', async (req, res) => {
    try {
        const mapId = req.params.id;
        const result = await db.query(`
            SELECT maps.*, users.username as author_name 
            FROM maps 
            LEFT JOIN users ON maps.author_id = users.id 
            WHERE maps.id = $1
        `, [mapId]);
        
        const map = result.rows[0];

        if (!map) {
            return res.status(404).json({ error: 'Карта не найдена' });
        }

        if (map.image_url) {
            map.image_url = `${process.env.CLOUD_RU_ENDPOINT}/${process.env.CLOUD_RU_BUCKET_NAME}/${map.image_url}`;
        }

        res.status(200).json(map);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при получении карты.' });
    }
});

app.get('/api/maps/:id/markers', async (req, res) => {
    try {
        const mapId = req.params.id;
        const result = await db.query('SELECT * FROM markers WHERE map_id = $1', [mapId]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при получении маркеров.' });
    }
});

app.put('/api/maps/:id', upload.single('image'), async (req, res) => {
    try {
        const mapId = req.params.id;
        const { title, description, author_id, is_private } = req.body;

        const result = await db.query('SELECT * FROM maps WHERE id = $1', [mapId]);
        const currentMap = result.rows[0];

        if (!currentMap) return res.status(404).json({ error: 'Карта не найдена' });
        if (currentMap.author_id != author_id) return res.status(403).json({ error: 'Нет прав!' });

        let newImageUrlKey = currentMap.image_url;

        if (req.file) {
            const fileExtension = path.extname(req.file.originalname);
            const fileKey = `maps/${Date.now()}${fileExtension}`;
            const uploadCommand = new PutObjectCommand({
                Bucket: process.env.CLOUD_RU_BUCKET_NAME,
                Key: fileKey,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
            });
            await s3.send(uploadCommand);
            newImageUrlKey = fileKey;

            if (currentMap.image_url) {
                const deleteCommand = new DeleteObjectCommand({
                    Bucket: process.env.CLOUD_RU_BUCKET_NAME,
                    Key: currentMap.image_url,
                });
                await s3.send(deleteCommand);
            }
        }

        await db.query(
            'UPDATE maps SET title = $1, description = $2, image_url = $3, is_private = $4 WHERE id = $5',
            [title, description, newImageUrlKey, is_private === 'true', mapId]
        );

        res.status(200).json({ message: 'Карта обновлена!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при редактировании.' });
    }
});

app.delete('/api/maps/:id', async (req, res) => {
    try {
        const mapId = req.params.id;
        const author_id = req.query.author_id;

        const result = await db.query('SELECT * FROM maps WHERE id = $1', [mapId]);
        const map = result.rows[0];

        if (!map) return res.status(404).json({ error: 'Карта не найдена' });
        if (map.author_id != author_id) return res.status(403).json({ error: 'Нет прав!' });

        if (map.image_url) {
            const deleteCommand = new DeleteObjectCommand({
                Bucket: process.env.CLOUD_RU_BUCKET_NAME,
                Key: map.image_url,
            });
            await s3.send(deleteCommand);
        }

        await db.query('DELETE FROM maps WHERE id = $1', [mapId]);

        res.status(200).json({ message: 'Карта удалена.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при удалении.' });
    }
});

app.delete('/api/maps/:id/markers', async (req, res) => {
    try {
        const mapId = req.params.id;
        const author_id = req.query.author_id;

        const result = await db.query('SELECT author_id FROM maps WHERE id = $1', [mapId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Карта не найдена' });
        if (result.rows[0].author_id != author_id) return res.status(403).json({ error: 'Нет прав!' });

        await db.query('DELETE FROM markers WHERE map_id = $1', [mapId]);
        res.status(200).json({ message: 'Все маркеры удалены.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при очистке маркеров.' });
    }
}); 

app.post('/api/maps/:id/markers', async (req, res) => {
    try {
        const mapId = req.params.id;
        const { x, y, title, description, author_id, icon_url, link_url } = req.body; 
        
        const insertResult = await db.query(
            'INSERT INTO markers (map_id, x, y, title, description, author_id, icon_url, link_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [mapId, x, y, title, description, author_id, icon_url, link_url]
        );
        
        res.status(201).json({ message: 'Маркер добавлен!', markerId: insertResult.rows[0].id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при создании маркера.' });
    }
});

app.delete('/api/markers/:id', async (req, res) => {
    try {
        const markerId = req.params.id;
        await db.query('DELETE FROM markers WHERE id = $1', [markerId]);
        res.status(200).json({ message: 'Маркер удален.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при удалении маркера.' });
    }
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
