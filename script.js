'use strict';

/* ================== Мобильное меню ================== */
const burger = document.getElementById('burgerBtn');
const mobileMenu = document.getElementById('mobileMenu');
if (burger && mobileMenu) {
  burger.addEventListener('click', () => {
    const open = mobileMenu.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(open));
  });
  mobileMenu.querySelectorAll('a').forEach(a =>
    a.addEventListener('click', () => mobileMenu.classList.remove('open'))
  );
}

/* ================== Хранилище (демо-вариант на localStorage) ==================
   В реальном проекте данные должны жить на сервере: база данных, API,
   хэширование паролей на сервере (bcrypt/argon2), подтверждение email. */
const USERS_KEY = 'mebproekt_users';
const SESSION_KEY = 'mebproekt_session';
const ORDERS_KEY = 'mebproekt_orders';

const getUsers = () => {
  try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; }
  catch { return []; }
};
const saveUsers = users => localStorage.setItem(USERS_KEY, JSON.stringify(users));
const currentEmail = () => sessionStorage.getItem(SESSION_KEY);
const getCurrentUser = () => {
  const email = currentEmail();
  return email ? getUsers().find(u => u.email === email) || null : null;
};

const makeSalt = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');

async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(salt + password);
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  }
  // Запасной вариант, если нет crypto.subtle (например, открытие файла локально)
  let h = 0x811c9dc5;
  for (const b of data) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return 'fnv1a-' + h.toString(16);
}

/* ================== Модальное окно ================== */
const overlay = document.getElementById('authOverlay');
const tabs = overlay ? Array.from(overlay.querySelectorAll('.auth-tab')) : [];
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

function switchTab(name) {
  tabs.forEach(t => {
    const active = t.dataset.tab === name;
    t.classList.toggle('is-active', active);
    t.setAttribute('aria-selected', String(active));
  });
  loginForm.hidden = name !== 'login';
  registerForm.hidden = name !== 'register';
  document.getElementById('loginError').hidden = true;
  document.getElementById('registerError').hidden = true;
}

function openAuth(tab) {
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  switchTab(tab);
  (tab === 'login' ? document.getElementById('loginEmail') : document.getElementById('regName')).focus();
}
function closeAuth() {
  overlay.hidden = true;
  document.body.style.overflow = '';
  loginForm.reset();
  registerForm.reset();
  document.getElementById('loginError').hidden = true;
  document.getElementById('registerError').hidden = true;
}

overlay.addEventListener('click', e => { if (e.target === overlay) closeAuth(); });
document.getElementById('authClose').addEventListener('click', closeAuth);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !overlay.hidden) closeAuth(); });

tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
overlay.querySelectorAll('.auth-switch').forEach(a =>
  a.addEventListener('click', e => { e.preventDefault(); switchTab(a.dataset.tab); })
);

/* ================== Ошибки и уведомления ================== */
function showFormError(form, message) {
  const box = form.querySelector('.auth-error');
  box.textContent = message;
  box.hidden = false;
}
let toastTimer;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}

/* ================== Шапка: вошёл пользователь или нет ================== */
function applySession() {
  const user = getCurrentUser();
  document.querySelectorAll('.js-auth-link').forEach(link => {
    if (user) {
      link.textContent = user.name + ' · выйти';
      link.removeAttribute('data-auth');
      link.dataset.logout = '1';
    } else {
      link.textContent = 'Войти';
      link.setAttribute('data-auth', 'login');
      delete link.dataset.logout;
    }
  });
}

/* ================== Валидация ================== */
const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const isPhone = v => v.replace(/\D/g, '').length >= 10;

/* ================== Регистрация ================== */
const regRole = document.getElementById('regRole');
const regCityField = document.getElementById('regCityField');
regRole.addEventListener('change', () => {
  regCityField.hidden = regRole.value !== 'executor';
  document.getElementById('regCity').required = regRole.value === 'executor';
});

registerForm.addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const phone = document.getElementById('regPhone').value.trim();
  const city = document.getElementById('regCity').value.trim();
  const pass = document.getElementById('regPassword').value;
  const pass2 = document.getElementById('regPassword2').value;
  const consent = document.getElementById('regConsent').checked;

  if (name.length < 2) return showFormError(registerForm, 'Укажите имя (минимум 2 символа).');
  if (!isEmail(email)) return showFormError(registerForm, 'Введите корректный email.');
  if (!isPhone(phone)) return showFormError(registerForm, 'Введите корректный телефон.');
  if (regRole.value === 'executor' && city.length < 2) return showFormError(registerForm, 'Укажите город — он нужен для ленты заказов.');
  if (pass.length < 6) return showFormError(registerForm, 'Пароль должен быть не короче 6 символов.');
  if (pass !== pass2) return showFormError(registerForm, 'Пароли не совпадают.');
  if (!consent) return showFormError(registerForm, 'Нужно согласие на обработку персональных данных.');

  const users = getUsers();
  if (users.some(u => u.email === email)) return showFormError(registerForm, 'Пользователь с таким email уже зарегистрирован. Войдите.');

  const salt = makeSalt();
  users.push({
    name, email, phone,
    role: regRole.value,
    city: regRole.value === 'executor' ? city : '',
    salt,
    passwordHash: await hashPassword(pass, salt),
    registeredAt: new Date().toISOString()
  });
  saveUsers(users);
  sessionStorage.setItem(SESSION_KEY, email);
  applySession();
  closeAuth();
  showToast('Регистрация завершена. Добро пожаловать, ' + name + '!');
});

/* ================== Вход ================== */
loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass = document.getElementById('loginPassword').value;
  if (!isEmail(email)) return showFormError(loginForm, 'Введите корректный email.');
  if (!pass) return showFormError(loginForm, 'Введите пароль.');

  const user = getUsers().find(u => u.email === email);
  if (!user) return showFormError(loginForm, 'Пользователь с таким email не найден. Зарегистрируйтесь.');
  const hash = await hashPassword(pass, user.salt);
  if (hash !== user.passwordHash) return showFormError(loginForm, 'Неверный пароль.');

  sessionStorage.setItem(SESSION_KEY, email);
  applySession();
  closeAuth();
  showToast('Вы вошли как ' + user.name);
});

/* ================== Выход ================== */
function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  applySession();
  showToast('Вы вышли из аккаунта.');
}

/* ================== Купить ================== */
document.querySelectorAll('.js-buy').forEach(btn =>
  btn.addEventListener('click', () => {
    if (!getCurrentUser()) {
      openAuth('register');
      showToast('Чтобы купить проект, войдите или зарегистрируйтесь.');
      return;
    }
    showToast('Демо-режим: оплата проекта «' + btn.dataset.product + '» подключается на стороне сервера.');
  })
);

/* ================== Заказ по эскизу ================== */
const orderForm = document.getElementById('orderForm');
orderForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = document.getElementById('orderName').value.trim();
  const phone = document.getElementById('orderPhone').value.trim();
  if (name.length < 2 || !isPhone(phone)) {
    showToast('Заполните имя и корректный телефон.');
    return;
  }
  const orders = (() => {
    try { return JSON.parse(localStorage.getItem(ORDERS_KEY)) || []; } catch { return []; }
  })();
  orders.push({
    name, phone,
    material: document.getElementById('orderMaterial').value,
    edge: document.getElementById('orderEdge').value,
    hardware: document.getElementById('orderHardware').value.trim(),
    notes: document.getElementById('orderNotes').value.trim(),
    createdAt: new Date().toISOString()
  });
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  document.getElementById('orderSuccess').hidden = false;
  orderForm.reset();
  /* Здесь будет реальная отправка: fetch('/api/orders', { method: 'POST', body: JSON.stringify(order) }) */
});

/* ================== Единая обработка кликов ================== */
document.addEventListener('click', e => {
  const auth = e.target.closest('[data-auth]');
  if (auth) { e.preventDefault(); openAuth(auth.dataset.auth); return; }
  const out = e.target.closest('[data-logout]');
  if (out) { e.preventDefault(); logout(); }
});

applySession();
