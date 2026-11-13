// ==========================================
// 1. HTML-ШАБЛОНЫ (Все переменные вверху)
// ==========================================
const registerModalHTML = `
<div class="modal fade" id="registerModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog">
    <div class="modal-content" style="background-color: #fce4d6; font-family: 'Lora', serif;">
      <div class="modal-header">
        <h5 class="modal-title" style="font-family: 'MedievalSharp'; font-size: 200%;">Становление путешественником</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button><br>
      </div>
      <div class="modal-body">
      <img src="registr.png" style="width: 95%; margin-bottom: 5%;">
        <form id="registerForm">
          <div class="mb-3">
            <label for="regUserName" class="form-label">Имя пользователя</label>
            <input type="text" class="form-control" id="regUserName" required>
          </div>
          <div class="mb-3">
            <label for="regEmail" class="form-label">Адрес электронной почты</label>
            <input type="email" class="form-control" id="regEmail" required>
          </div>
          <div class="mb-3">
            <label for="regPassword" class="form-label">Пароль</label>
            <input type="password" class="form-control" id="regPassword" required>
          </div>
          <div class="modal-footer px-0 pb-0">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Остаться наблюдателем</button>
            <button type="submit" class="btn btn-primary" style="background-color: rgb(210, 162, 255); border: none;">Отправиться в путь</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</div>
`;

const loginModalHTML = `
<div class="modal fade" id="loginModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog">
    <div class="modal-content" style="background-color: #fce4d6; font-family: 'Lora', serif;">
      <div class="modal-header">
        <h5 class="modal-title" style="font-family: 'MedievalSharp'; font-size: 200%;">Вход для Путешественника</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <form id="loginForm">
          <div class="mb-3">
            <label for="logEmail" class="form-label">Адрес электронной почты</label>
            <input type="email" class="form-control" id="logEmail" required>
          </div>
          <div class="mb-3">
            <label for="logPassword" class="form-label">Пароль</label>
            <input type="password" class="form-control" id="logPassword" required>
          </div>
          <div class="modal-footer px-0 pb-0">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
            <button type="submit" class="btn btn-primary" style="background-color: rgb(210, 162, 255); border: none;">Войти в мир</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</div>
`;

const articleModalHTML = `
<div class="modal fade" id="addArticleModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-lg">
    <div class="modal-content" style="background-color: #fce4d6; font-family: 'Lora', serif;">
      <div class="modal-header">
        <h5 class="modal-title" style="font-family: 'MedievalSharp'; font-size: 200%;">Новая запись в Архив</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button>
      </div>
      <div class="modal-body">
        <form id="articleForm">
          <div class="mb-3">
            <label for="articleTitle" class="form-label">Заголовок</label>
            <input type="text" class="form-control" id="articleTitle" required>
          </div>
          <div class="mb-3">
            <label for="articleContent" class="form-label">Текст статьи</label>
            <textarea class="form-control" id="articleContent" rows="5" required></textarea>
          </div>
          <div class="mb-3">
            <label for="articleImage" class="form-label">Изображение (необязательно)</label>
            <input type="file" class="form-control" id="articleImage" accept="image/*">
          </div>
          <div class="modal-footer px-0 pb-0">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
            <button type="submit" class="btn btn-primary" style="background-color: rgb(210, 162, 255); border: none;">Сохранить в Архив</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</div>
`;

// ==========================================
// 2. ЛОГИКА (Всё внутри DOMContentLoaded)
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    
    // 1. Вставляем ВСЕ ТРИ модальных окна
    const modalContainer = document.getElementById('modal-container');
    if (modalContainer) {
        modalContainer.innerHTML = registerModalHTML + loginModalHTML + articleModalHTML;
    }

    // --- РЕГИСТРАЦИЯ ---
    const regForm = document.getElementById('registerForm');
    if (regForm) {
        regForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('regUserName').value;
            const email = document.getElementById('regEmail').value;
            const password = document.getElementById('regPassword').value;

            try {
                const response = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, password })
                });
                const data = await response.json();
                if (response.ok) {
                    alert('🎉 ' + data.message);
                    bootstrap.Modal.getInstance(document.getElementById('registerModal')).hide();
                    regForm.reset();
                } else { alert('⚠️ ' + data.error); }
            } catch (error) { alert('Ошибка сервера!'); }
        });
    }

    // --- ВХОД ---
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('logEmail').value;
            const password = document.getElementById('logPassword').value;
            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await response.json();
                if (response.ok) {
                    alert('🎉 ' + data.message);
                    localStorage.setItem('demiurgeUser', JSON.stringify(data.user));
                    bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
                    location.reload(); 
                } else { alert('⚠️ ' + data.error); }
            } catch (error) { alert('Ошибка сервера!'); }
        });
    }

    // --- СОЗДАНИЕ СТАТЬИ ---
    const articleForm = document.getElementById('articleForm');
    if (articleForm) {
        articleForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('articleTitle').value;
            const content = document.getElementById('articleContent').value;
            const imageFile = document.getElementById('articleImage').files[0];

            const formData = new FormData();
            formData.append('title', title);
            formData.append('content', content);

            const userString = localStorage.getItem('demiurgeUser');
            if (userString) {
                const user = JSON.parse(userString);
                formData.append('author_id', user.id);
            } else {
                alert("Вы должны быть авторизованы, чтобы писать статьи!");
                return;
            }

            if (imageFile) formData.append('image', imageFile);

            try {
                const response = await fetch('/api/articles', {
                    method: 'POST',
                    body: formData 
                });
                const data = await response.json();
                if (response.ok) {
                    alert('🎉 ' + data.message);
                    bootstrap.Modal.getInstance(document.getElementById('addArticleModal')).hide();
                    location.reload(); 
                } else { alert('⚠️ ' + data.error); }
            } catch (error) { 
                console.error(error);
                alert('Ошибка сервера при сохранении статьи!'); 
            }
        });
    }
    loadArticles();

    // --- МЕНЮ (Гость или Путешественник) ---
    const currentUserString = localStorage.getItem('demiurgeUser');
    const guestItems = document.querySelectorAll('.menu-guest-item');
    const userItems = document.querySelectorAll('.menu-user-item');

    if (currentUserString) {
        guestItems.forEach(item => item.style.display = 'none'); 
        userItems.forEach(item => item.style.display = 'block'); 
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                localStorage.removeItem('demiurgeUser'); 
                location.reload(); 
            });
        }
    } else {
        guestItems.forEach(item => item.style.display = 'block');
        userItems.forEach(item => item.style.display = 'none');
    }
});

// 3. ЛОГИКА ЗАГРУЗКИ И ОТРИСОВКИ АРХИВА
// ==========================================

// Эта функция идет на сервер и забирает статьи
async function loadArticles() {
    try {
        const response = await fetch('/api/articles');
        const articles = await response.json();
        
        // Передаем полученный массив в функцию отрисовки
        updateArchiveDisplay(articles);
    } catch (error) {
        console.error("Ошибка при загрузке статей:", error);
    }
}

// Эта функция рисует карточки
function updateArchiveDisplay(articlesArray) {
    const emptyState = document.getElementById('emptyState');
    const articlesGrid = document.getElementById('articlesGrid');

    // Если мы не на странице архива — выходим
    if (!emptyState || !articlesGrid) return;

    if (articlesArray.length === 0) {
        emptyState.style.display = 'flex';
        articlesGrid.style.display = 'none';
    } else {
        emptyState.style.display = 'none';
        articlesGrid.style.display = 'grid';
        articlesGrid.innerHTML = '';

        articlesArray.forEach(article => {
            const card = document.createElement('div');
            card.className = 'article-card';
            
            // Проверяем, есть ли картинка у статьи
            let imgHTML = '';
            if (article.image_url) {
                // Если есть, выводим тег img
                imgHTML = `<img src="${article.image_url}" style="width: 100%; height: 150px; object-fit: cover; border-radius: 5px; margin-bottom: 10px;">`;
            }

            // Собираем карточку
            card.innerHTML = `
                ${imgHTML}
                <h3 style="font-family: 'MedievalSharp'; color: #2b1140; font-size: 24px;">${article.title}</h3>
                <p style="font-size: 14px; color: #555;">${article.content.substring(0, 100)}...</p>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px;">
                    <small style="color: #888;">Автор: ${article.author_name || 'Неизвестен'}</small>
                    <button class="btn btn-sm btn-primary" style="background-color: #d5a9ff; border: none; color: #2b1140;">Читать</button>
                </div>
            `;
            
            articlesGrid.appendChild(card);
        });
    }
}
