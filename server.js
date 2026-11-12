const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs'); 
const db = require('./database');  

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'glavnaya.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('Сервер запущен на порту ${PORT}');
});





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



app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Ищем пользователя по email
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        
        // Если не нашли — выдаем ошибку
        if (!user) {
            return res.status(400).json({ error: 'Путешественник с таким email не найден!' });
        }

        // 2. Сравниваем пароль (который ввел пользователь) с зашифрованным в базе
        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
            return res.status(400).json({ error: 'Неверный пароль!' });
        }

        // 3. Если всё верно — отправляем данные пользователя (кроме пароля!)
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