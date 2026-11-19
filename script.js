'use strict';

// ===== Вспомогательные =====
const $ = (s) => document.querySelector(s);
const USERS_KEY = 'mebproekt_users';
const SESSION_KEY = 'mebproekt_session';
const ORDERS_KEY = 'mebproekt_orders';

const readList = (key) => { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } };
const writeList = (key, list) => localStorage.setItem(key, JSON.stringify(list));

function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.hidden = true; }, 3200);
}

// ===== Хэширование пароля: SHA-256 + соль =====
async function hashPassword(password, salt) {
  const data = salt + ':' + password;
  if (window.crypto && crypto.subtle) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) { /* fallback ниже */ }
  }
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < data.length; i++) {
    h1 = (h1 ^ data.charCodeAt(i)) * 16777619 >>> 0;
    h2 = (h2 + data.charCodeAt(i) * (i + 7)) >>> 0;
  }
  return 'f' + h1.toString(16) + h2.toString(16);
}
function makeSalt() {
  const a = new Uint8Array(8);
  (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => a[i] = Math.floor(Math.random() * 256));
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ===== Мобильное меню =====
$('#burger').addEventListener('click', () => $('#mobile-menu').classList.toggle('open'));
document.querySelectorAll('#mobile-menu a').forEach(a =>
  a.addEventListener('click', () => $('#mobile-menu').classList.remove('open')));

// ===== Модальное окно =====
const overlay = $('#auth-overlay');
function openAuth(mode) {
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  switchTab(mode === 'register' ? 'register' : 'login');
}
function closeAuth() {
  overlay.hidden = true;
  document.body.style.overflow = '';
  ['#li-error', '#rg-error'].forEach(s => { $(s).hidden = true; });
}
function switchTab(name) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  $('#form-login').classList.toggle('active', name === 'login');
  $('#form-register').classList.toggle('active', name === 'register');
}

document.querySelectorAll('[data-auth]').forEach(el =>
  el.addEventListener('click', (e) => { e.preventDefault(); openAuth(el.dataset.auth); }));

$('#auth-close').addEventListener('click', closeAuth);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeAuth(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAuth(); });
document.querySelectorAll('.auth-tab').forEach(t =>
  t.addEventListener('click', () => switchTab(t.dataset.tab)));

// Поле «Город» — только для исполнителя
$('#rg-role').addEventListener('change', (e) => {
  $('#rg-city-field').hidden = e.target.value !== 'executor';
});

// ===== Регистрация =====
$('#form-register').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#rg-error');
  const show = (msg, linkToLogin = false) => {
    err.hidden = false;
    err.innerHTML = msg + (linkToLogin ? ' <button class="error-link" id="to-login">Войти</button>' : '');
    if (linkToLogin) $('#to-login').addEventListener('click', () => {
      switchTab('login');
      $('#li-email').value = $('#rg-email').value.trim();
    });
  };
  err.hidden = true;

  const name = $('#rg-name').value.trim();
  const email = $('#rg-email').value.trim().toLowerCase();
  const phone = $('#rg-phone').value.trim();
  const role = $('#rg-role').value;
  const city = $('#rg-city').value.trim();
  const pass = $('#rg-pass').value;
  const pass2 = $('#rg-pass2').value;

  if (!name || !email || !phone) return show('Заполните имя, email и телефон.');
  if (!/^\S+@\S+\.\S+$/.test(email)) return show('Проверьте формат email.');
  if (pass.length < 6) return show('Пароль должен быть не короче 6 символов.');
  if (pass !== pass2) return show('Пароли не совпадают.');
  if (!$('#rg-consent').checked) return show('Нужно согласие на обработку персональных данных.');

  const users = readList(USERS_KEY);
  if (users.some(u => u.email === email)) {
    return show('Пользователь с таким email уже есть.', true);
  }

  const salt = makeSalt();
  const user = {
    name, email, phone, role,
    city: role === 'executor' ? city : '',
    salt,
    passwordHash: await hashPassword(pass, salt),
    registeredAt: new Date().toISOString()
  };
  users.push(user);
  writeList(USERS_KEY, users);

  sessionStorage.setItem(SESSION_KEY, email);
  e.target.reset();
  $('#rg-city-field').hidden = true;
  closeAuth();
  updateAuthUI();
  toast(role === 'executor'
    ? 'Регистрация исполнителя завершена. Модерация обычно занимает 1–2 дня.'
    : 'Добро пожаловать, ' + name + '!');
});

// ===== Вход =====
$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#li-error');
  err.hidden = true;

  const email = $('#li-email').value.trim().toLowerCase();
  const pass = $('#li-pass').value;
  const user = readList(USERS_KEY).find(u => u.email === email);

  if (!user) {
    err.hidden = false;
    err.innerHTML = 'Пользователь с таким email не найден. <button class="error-link" id="to-reg">Зарегистрируйтесь</button>';
    $('#to-reg').addEventListener('click', () => {
      switchTab('register');
      $('#rg-email').value = email;
    });
    return;
  }
  if (await hashPassword(pass, user.salt) !== user.passwordHash) {
    err.hidden = false;
    err.textContent = 'Неверный пароль.';
    return;
  }
  sessionStorage.setItem(SESSION_KEY, email);
  e.target.reset();
  closeAuth();
  updateAuthUI();
  toast('Вы вошли как ' + user.name);
});

// ===== Отображение состояния в шапке =====
function currentUser() {
  const email = sessionStorage.getItem(SESSION_KEY);
  return email ? readList(USERS_KEY).find(u => u.email === email) || null : null;
}
function updateAuthUI() {
  const user = currentUser();
  const desktop = $('#link-login');
  const mobile = $('#mobile-login');

  if (user) {
    if (!desktop.classList.contains('user-chip')) {
      const chip = document.createElement('button');
      chip.className = 'user-chip';
      chip.id = 'link-login';
      chip.title = 'Нажмите, чтобы выйти';
      chip.textContent = user.name + ' · выйти';
      chip.addEventListener('click', () => {
        sessionStorage.removeItem(SESSION_KEY);
        updateAuthUI();
        toast('Вы вышли из аккаунта.');
      });
      desktop.replaceWith(chip);
    } else {
      desktop.textContent = user.name + ' · выйти';
    }
    mobile.textContent = 'Выйти';
    mobile.removeAttribute('data-auth');
    mobile.onclick = (e) => {
      e.preventDefault();
      sessionStorage.removeItem(SESSION_KEY);
      updateAuthUI();
      toast('Вы вышли из аккаунта.');
    };
  } else {
    if (desktop.classList.contains('user-chip')) {
      const link = document.createElement('a');
      link.href = '#';
      link.className = 'link-login';
      link.id = 'link-login';
      link.textContent = 'Войти';
      link.dataset.auth = 'login';
      link.addEventListener('click', (e) => { e.preventDefault(); openAuth('login'); });
      desktop.replaceWith(link);
    }
    mobile.textContent = 'Войти';
    mobile.setAttribute('data-auth', 'login');
    mobile.onclick = (e) => { e.preventDefault(); openAuth('login'); };
  }
}

// ===== Кнопки «Купить» =====
const PRODUCTS = {
  'kuhnya-3-0': 'Кухня «Прямая 3.0»',
  'shkaf-2-4': 'Шкаф-купе «Модуль 2.4»',
  'prihozaya-kompakt': 'Прихожая «Компакт»'
};
document.querySelectorAll('[data-product]').forEach(btn =>
  btn.addEventListener('click', () => {
    if (!currentUser()) {
      toast('Сначала войдите или зарегистрируйтесь — покупка привязывается к аккаунту.');
      openAuth('login');
      return;
    }
    toast('Проект «' + (PRODUCTS[btn.dataset.product] || '') + '» добавлен. Здесь будет оплата.');
  }));

// ===== Форма заказа по эскизу =====
$('#of-file').addEventListener('change', (e) => {
  $('#file-name').textContent = e.target.files[0] ? ' — выбран: ' + e.target.files[0].name : '';
});
$('#order-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!$('#of-name').value.trim() || !$('#of-phone').value.trim()) {
    toast('Заполните имя и телефон.');
    return;
  }
  if (!$('#of-consent').checked) {
    toast('Нужно согласие на обработку персональных данных.');
    return;
  }
  const orders = readList(ORDERS_KEY);
  orders.push({
    name: $('#of-name').value.trim(),
    phone: $('#of-phone').value.trim(),
    material: $('#of-material').value,
    edge: $('#of-edge').value,
    hardware: $('#of-hardware').value.trim(),
    notes: $('#of-notes').value.trim(),
    createdAt: new Date().toISOString()
  });
  writeList(ORDERS_KEY, orders);
  e.target.reset();
  $('#file-name').textContent = '';
  $('#order-success').hidden = false;
});

// ===== Инициализация =====
updateAuthUI();
