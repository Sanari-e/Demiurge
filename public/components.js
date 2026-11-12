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

// ==========================================
// 2. ЛОГИКА
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    
    // Вставляем модалки
    const modalContainer = document.getElementById('modal-container');
    if (modalContainer) {
        modalContainer.innerHTML = registerModalHTML + loginModalHTML;
    }

    // --- РЕГИСТРАЦИЯ ---
    const regForm = document.getElementById('registerForm');
    if (regForm) {
        regForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Останавливаем перезагрузку страницы!
            console.log("Отправка регистрации...");
            
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
                    const modal = bootstrap.Modal.getInstance(document.getElementById('registerModal'));
                    modal.hide();
                    regForm.reset();
                } else {
                    alert('⚠️ ' + data.error);
                }
            } catch (error) {
                alert('Ошибка сервера!');
            }
        });
    }

    // --- ВХОД ---
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Останавливаем перезагрузку страницы!
            console.log("Отправка входа...");
            
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
                    const modal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
                    modal.hide();
                    location.reload(); 
                } else {
                    alert('⚠️ ' + data.error);
                }
            } catch (error) {
                alert('Ошибка сервера!');
            }
        });
    }

    // --- МЕНЮ (Гость или Путешественник) ---
    const currentUserString = localStorage.getItem('demiurgeUser');
    
    // Ищем ВСЕ элементы с нужными классами (а не по одному ID)
    const guestItems = document.querySelectorAll('.menu-guest-item');
    const userItems = document.querySelectorAll('.menu-user-item');

    if (currentUserString) {
        // Если пользователь вошел
        const currentUser = JSON.parse(currentUserString); 
        
        guestItems.forEach(item => item.style.display = 'none'); // Скрываем меню гостя
        userItems.forEach(item => item.style.display = 'block'); // Показываем меню юзера

        // Кнопка Выйти
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                localStorage.removeItem('demiurgeUser'); 
                location.reload(); 
            });
        }
    } else {
        // Если пользователь гость
        guestItems.forEach(item => item.style.display = 'block');
        userItems.forEach(item => item.style.display = 'none');
    }
});
