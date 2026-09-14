// Общий модуль для всех HTML-страниц: хранение JWT в localStorage
// (сайт — обычное веб-приложение на своём домене, а не встроенный
// в чужой интерфейс виджет, так что localStorage здесь уместен и
// переживает переход между страницами reader.html / admin-users.html).

const AUTH_TOKEN_KEY = 'ai_books_auth_token';

function getToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
}

function setToken(token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function clearToken() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
}

function logout() {
    clearToken();
    location.href = '/login.html';
}

/**
 * Обёртка над fetch: подставляет токен, и если сервер ответил 401
 * (токен невалиден/истёк) — сразу уводит на логин, не оставляя
 * пользователя перед пустой сломанной страницей.
 */
async function authFetch(url, options = {}) {
    const token = getToken();
    if (!token) {
        location.href = '/login.html';
        return Promise.reject(new Error('Нет токена'));
    }

    const res = await fetch(url, {
        ...options,
        headers: {
            ...(options.headers || {}),
            Authorization: 'Bearer ' + token,
        },
    });

    if (res.status === 401) {
        clearToken();
        location.href = '/login.html';
        return Promise.reject(new Error('Сессия истекла'));
    }

    return res;
}

/**
 * Требует авторизацию на странице: если токена нет — сразу редирект.
 * Вызывать в начале x-init на защищённых страницах.
 */
function requireAuthOrRedirect() {
    if (!getToken()) {
        location.href = '/login.html';
        return false;
    }
    return true;
}
