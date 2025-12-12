// ===== Configuration =====
const CONFIG = {
    GEOCODING_API: 'https://geocoding-api.open-meteo.com/v1/search',
    WEATHER_API: 'https://api.open-meteo.com/v1/forecast',
    STORAGE_KEY_FAVORITES: 'altus-favorites',
    STORAGE_KEY_THEME: 'altus-theme',
    RAIN_CODES: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99],
    TEMP_THRESHOLD: 10,
    HOURS_TO_FETCH: 12,
    FORECAST_DAYS: 7,
    DEBOUNCE_DELAY: 300
};

// ===== Éléments DOM =====
const elements = {
    cityInput: document.getElementById('city-input'),
    searchBtn: document.getElementById('search-btn'),
    notifyBtn: document.getElementById('notify-btn'),
    themeToggle: document.getElementById('theme-toggle'),
    weatherSection: document.getElementById('weather-section'),
    favoritesSection: document.getElementById('favorites-section'),
    favoritesList: document.getElementById('favorites-list'),
    favoriteBtn: document.getElementById('favorite-btn'),
    cityName: document.getElementById('city-name'),
    temperature: document.getElementById('temperature'),
    weatherIcon: document.getElementById('weather-icon'),
    wind: document.getElementById('wind'),
    humidity: document.getElementById('humidity'),
    feelsLike: document.getElementById('feels-like'),
    hourlyList: document.getElementById('hourly-list'),
    loading: document.getElementById('loading'),
    errorMessage: document.getElementById('error-message'),
    suggestionsList: document.getElementById('suggestions-list'),
    daySelector: document.getElementById('day-selector'),
    forecastLengthToggle: document.getElementById('forecast-length-toggle')
};

// ===== État de l'application =====
let currentCity = null;
let currentWeatherData = null;
let currentDayIndex = 0;
let currentForecastHours = 4;
let debounceTimer = null;

// ===== Initialisation =====
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    updateNotifyButton();
    registerServiceWorker();
    loadFavorites();
    renderFavorites();
    
    // Écouteurs d'événements
    elements.searchBtn.addEventListener('click', handleSearch);
    elements.cityInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSearch();
            hideSuggestions();
        }
    });
    elements.cityInput.addEventListener('input', handleCityInput);
    elements.cityInput.addEventListener('blur', () => {
        setTimeout(hideSuggestions, 200);
    });
    elements.notifyBtn.addEventListener('click', requestNotificationPermission);
    elements.themeToggle.addEventListener('click', toggleTheme);
    elements.favoriteBtn.addEventListener('click', handleFavoriteToggle);
    
    // Toggle forecast length
    elements.forecastLengthToggle.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const hours = parseInt(btn.dataset.hours);
            changeForecastLength(hours);
        });
    });
});

// ===== Service Worker =====
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('./service-worker.js');
            console.log('✅ Service Worker enregistré:', registration.scope);
        } catch (error) {
            console.error('❌ Erreur Service Worker:', error);
        }
    }
}

// ===== Notifications =====
function isNotificationSupported() {
    return 'Notification' in window && typeof Notification !== 'undefined';
}

function updateNotifyButton() {
    if (!isNotificationSupported()) {
        elements.notifyBtn.textContent = '🔔 Non disponible (iOS)';
        elements.notifyBtn.disabled = true;
        return;
    }
    
    if (!('Notification' in window)) {
        elements.notifyBtn.textContent = '🔔 Notifications non supportées';
        elements.notifyBtn.disabled = true;
        return;
    }

    const permission = Notification.permission;
    
    if (permission === 'granted') {
        elements.notifyBtn.textContent = '✅ Notifications activées';
        elements.notifyBtn.classList.add('granted');
        elements.notifyBtn.classList.remove('denied');
    } else if (permission === 'denied') {
        elements.notifyBtn.textContent = '❌ Notifications bloquées';
        elements.notifyBtn.classList.add('denied');
        elements.notifyBtn.classList.remove('granted');
    } else {
        elements.notifyBtn.textContent = '🔔 Activer les notifications';
        elements.notifyBtn.classList.remove('granted', 'denied');
    }
}

async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        showError('Les notifications ne sont pas supportées par votre navigateur.');
        return;
    }

    if (Notification.permission === 'denied') {
        showError('Les notifications sont bloquées. Veuillez les réactiver dans les paramètres de votre navigateur.');
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        updateNotifyButton();
        
        if (permission === 'granted') {
            // Notification de test
            new Notification('Altus', {
                body: 'Les notifications sont maintenant activées ! 🎉',
                icon: 'icons/icon-192.png',
                tag: 'welcome'
            });
        }
    } catch (error) {
        console.error('Erreur lors de la demande de permission:', error);
    }
}

function sendWeatherNotification(city, message, type = 'info') {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
        return;
    }
    
    const options = {
        body: message,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-72.png',
        tag: `weather-${type}-${city}`,
        vibrate: [200, 100, 200],
        requireInteraction: false
    };
    
    try {
        new Notification(`Altus - ${city}`, options);
    } catch (error) {
        console.error('Erreur notification:', error);
    }
}

// ===== Autocomplete / Suggestions =====
function handleCityInput(e) {
    const query = e.target.value.trim();
    
    clearTimeout(debounceTimer);
    
    if (query.length < 2) {
        hideSuggestions();
        return;
    }
    
    debounceTimer = setTimeout(() => {
        fetchSuggestions(query);
    }, CONFIG.DEBOUNCE_DELAY);
}

async function fetchSuggestions(query) {
    try {
        const response = await fetch(
            `${CONFIG.GEOCODING_API}?name=${encodeURIComponent(query)}&count=5&language=fr&format=json`
        );
        
        if (!response.ok) throw new Error('Erreur de géocodage');
        
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            renderSuggestions(data.results);
        } else {
            hideSuggestions();
        }
    } catch (error) {
        console.error('Erreur suggestions:', error);
        hideSuggestions();
    }
}

function renderSuggestions(results) {
    const items = results.map(result => {
        const name = result.name;
        const admin = result.admin1 ? `, ${result.admin1}` : '';
        const country = result.country;
        const details = `${admin} - ${country}`;
        
        return `
            <div class="suggestion-item" data-lat="${result.latitude}" data-lon="${result.longitude}" data-name="${name}${admin}, ${country}">
                <span class="suggestion-name">${name}</span>
                <span class="suggestion-details">${details}</span>
            </div>
        `;
    }).join('');
    
    elements.suggestionsList.innerHTML = items;
    elements.suggestionsList.classList.remove('hidden');
    
    // Attacher les événements
    elements.suggestionsList.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            const lat = parseFloat(item.dataset.lat);
            const lon = parseFloat(item.dataset.lon);
            const name = item.dataset.name;
            
            elements.cityInput.value = name;
            hideSuggestions();
            fetchWeather(lat, lon, name);
        });
    });
}

function hideSuggestions() {
    elements.suggestionsList.classList.add('hidden');
    elements.suggestionsList.innerHTML = '';
}
// ===== Recherche et API Météo =====
async function handleSearch() {
    const query = elements.cityInput.value.trim();
    
    if (!query) {
        showError('Veuillez entrer un nom de ville.');
        return;
    }

    showLoading();
    hideError();

    try {
        // 1. Géocodage : trouver les coordonnées de la ville
        const geoResponse = await fetch(
            `${CONFIG.GEOCODING_API}?name=${encodeURIComponent(query)}&count=1&language=fr&format=json`
        );
        
        if (!geoResponse.ok) throw new Error('Erreur de géocodage');
        
        const geoData = await geoResponse.json();
        
        if (!geoData.results || geoData.results.length === 0) {
            throw new Error(`Ville "${query}" non trouvée. Vérifiez l'orthographe.`);
        }

        const location = geoData.results[0];
        const cityName = `${location.name}${location.admin1 ? ', ' + location.admin1 : ''}, ${location.country}`;
        
        // 2. Récupérer la météo
        await fetchWeather(location.latitude, location.longitude, cityName);
        
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

async function fetchWeather(lat, lon, cityName) {
    showLoading();
    hideError();

    try {
        const weatherResponse = await fetch(
            `${CONFIG.WEATHER_API}?latitude=${lat}&longitude=${lon}` +
            `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
            `&hourly=temperature_2m,weather_code,precipitation_probability` +
            `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
            `&timezone=auto&forecast_days=${CONFIG.FORECAST_DAYS}`
        );

        if (!weatherResponse.ok) throw new Error('Erreur lors de la récupération des données météo');

        const weatherData = await weatherResponse.json();
        
        // Sauvegarder la ville courante et les données
        currentCity = { name: cityName, lat, lon };
        currentWeatherData = weatherData;
        currentDayIndex = 0;
        
        // Générer le sélecteur de jours
        renderDaySelector(weatherData);
        
        // Afficher les résultats pour le jour courant
        displayWeather(weatherData, cityName, 0);
        
        // Vérifier les alertes pour les 4 prochaines heures du jour actuel
        checkWeatherAlerts(weatherData, cityName, 0);
        
        // Mettre à jour le bouton favori
        updateFavoriteButton();
        
        hideLoading();
        
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

function displayWeather(data, cityName, dayIndex = 0) {
    const hourly = data.hourly;
    const daily = data.daily;
    
    // Obtenir les données du jour sélectionné
    const selectedDate = new Date(daily.time[dayIndex]);
    const dayStartHour = dayIndex * 24;

    // Si c'est aujourd'hui (jour 0), utiliser les données actuelles
    if (dayIndex === 0) {
        const current = data.current;
        elements.temperature.textContent = Math.round(current.temperature_2m);
        elements.weatherIcon.textContent = getWeatherEmoji(current.weather_code);
        elements.wind.textContent = `${Math.round(current.wind_speed_10m)} km/h`;
        elements.humidity.textContent = `${current.relative_humidity_2m} %`;
        elements.feelsLike.textContent = `${Math.round(current.apparent_temperature)}°C`;
    } else {
        // Pour les jours futurs, utiliser les données horaires à midi (index 12)
        const middayIndex = dayStartHour + 12;
        elements.temperature.textContent = Math.round(hourly.temperature_2m[middayIndex]);
        elements.weatherIcon.textContent = getWeatherEmoji(hourly.weather_code[middayIndex]);
        elements.wind.textContent = `${Math.round(data.current.wind_speed_10m)} km/h`; // Approximatif
        elements.humidity.textContent = `${data.current.relative_humidity_2m} %`; // Approximatif
        elements.feelsLike.textContent = `${Math.round(hourly.temperature_2m[middayIndex])}°C`;
    }

    elements.cityName.textContent = cityName;

    // Prévisions horaires selon la durée sélectionnée
    renderHourlyForecast(hourly, dayStartHour, currentForecastHours);
    
    elements.weatherSection.classList.remove('hidden');
}

function renderHourlyForecast(hourly, startHour, hours) {
    const hourlyItems = [];
    
    for (let i = 0; i < hours; i++) {
        const hourIndex = startHour + i;
        if (hourIndex < hourly.time.length) {
            const time = new Date(hourly.time[hourIndex]);
            const temp = hourly.temperature_2m[hourIndex];
            const code = hourly.weather_code[hourIndex];
            const isRain = CONFIG.RAIN_CODES.includes(code);
            const isHighTemp = temp > CONFIG.TEMP_THRESHOLD;
            
            let alertClass = '';
            if (isRain) alertClass = 'rain-alert';
            else if (isHighTemp) alertClass = 'temp-alert';

            hourlyItems.push(`
                <div class="hourly-item ${alertClass}">
                    <div class="hourly-time">${time.getHours()}h</div>
                    <div class="hourly-icon">${getWeatherEmoji(code)}</div>
                    <div class="hourly-temp">${Math.round(temp)}°C</div>
                </div>
            `);
        }
    }

    elements.hourlyList.innerHTML = hourlyItems.join('');
}

// ===== Day Selector =====
function renderDaySelector(data) {
    const daily = data.daily;
    const dayButtons = [];
    
    const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    
    for (let i = 0; i < CONFIG.FORECAST_DAYS; i++) {
        const date = new Date(daily.time[i]);
        const dayName = i === 0 ? "Aujourd'hui" : dayNames[date.getDay()];
        const dayDate = `${date.getDate()}/${date.getMonth() + 1}`;
        const isActive = i === currentDayIndex ? 'active' : '';
        
        dayButtons.push(`
            <button class="day-btn ${isActive}" data-day="${i}">
                <span class="day-label">${dayName}</span>
                <span class="day-date">${dayDate}</span>
            </button>
        `);
    }
    
    elements.daySelector.innerHTML = dayButtons.join('');
    
    // Attacher les événements
    elements.daySelector.querySelectorAll('.day-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const dayIndex = parseInt(btn.dataset.day);
            changeDaySelection(dayIndex);
        });
    });
}

function changeDaySelection(dayIndex) {
    if (!currentWeatherData) return;
    
    currentDayIndex = dayIndex;
    
    // Mettre à jour l'interface
    displayWeather(currentWeatherData, currentCity.name, dayIndex);
    
    // Mettre à jour les boutons actifs
    elements.daySelector.querySelectorAll('.day-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.day) === dayIndex);
    });
    
    // Vérifier les alertes pour ce jour
    checkWeatherAlerts(currentWeatherData, currentCity.name, dayIndex);
}

// ===== Forecast Length Toggle =====
function changeForecastLength(hours) {
    currentForecastHours = hours;
    
    // Mettre à jour les boutons actifs
    elements.forecastLengthToggle.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.hours) === hours);
    });
    
    // Re-render les prévisions horaires
    if (currentWeatherData) {
        const dayStartHour = currentDayIndex * 24;
        renderHourlyForecast(currentWeatherData.hourly, dayStartHour, hours);
    }
}

function checkWeatherAlerts(data, cityName, dayIndex = 0) {
    const hourly = data.hourly;
    const dayStartHour = dayIndex * 24;
    
    let rainAlert = false;
    let tempAlert = false;
    let rainHour = null;
    let highTemp = null;

    // Vérifier les 4 prochaines heures du jour sélectionné
    for (let i = 0; i < 4; i++) {
        const hourIndex = dayStartHour + i;
        if (hourIndex < hourly.time.length) {
            const code = hourly.weather_code[hourIndex];
            const temp = hourly.temperature_2m[hourIndex];
            
            // Vérifier la pluie
            if (!rainAlert && CONFIG.RAIN_CODES.includes(code)) {
                rainAlert = true;
                rainHour = i + 1;
            }
            
            // Vérifier la température > 10°C
            if (!tempAlert && temp > CONFIG.TEMP_THRESHOLD) {
                tempAlert = true;
                highTemp = Math.round(temp);
            }
        }
    }

    // Envoyer les notifications seulement pour aujourd'hui
    if (dayIndex === 0) {
        if (rainAlert) {
            sendWeatherNotification(
                cityName,
                `🌧️ Pluie prévue dans ${rainHour} heure${rainHour > 1 ? 's' : ''} !`,
                'rain'
            );
        }

        if (tempAlert) {
            sendWeatherNotification(
                cityName,
                `🌡️ Température supérieure à ${CONFIG.TEMP_THRESHOLD}°C prévue (${highTemp}°C)`,
                'temp'
            );
        }
    }
}

// ===== Utilitaires =====
function getWeatherEmoji(code) {
    const weatherEmojis = {
        0: '☀️',      // Clear sky
        1: '🌤️',     // Mainly clear
        2: '⛅',      // Partly cloudy
        3: '☁️',      // Overcast
        45: '🌫️',    // Fog
        48: '🌫️',    // Depositing rime fog
        51: '🌦️',    // Light drizzle
        53: '🌦️',    // Moderate drizzle
        55: '🌧️',    // Dense drizzle
        56: '🌨️',    // Light freezing drizzle
        57: '🌨️',    // Dense freezing drizzle
        61: '🌧️',    // Slight rain
        63: '🌧️',    // Moderate rain
        65: '🌧️',    // Heavy rain
        66: '🌨️',    // Light freezing rain
        67: '🌨️',    // Heavy freezing rain
        71: '🌨️',    // Slight snow
        73: '🌨️',    // Moderate snow
        75: '❄️',     // Heavy snow
        77: '🌨️',    // Snow grains
        80: '🌦️',    // Slight rain showers
        81: '🌧️',    // Moderate rain showers
        82: '⛈️',     // Violent rain showers
        85: '🌨️',    // Slight snow showers
        86: '❄️',     // Heavy snow showers
        95: '⛈️',     // Thunderstorm
        96: '⛈️',     // Thunderstorm with slight hail
        99: '⛈️'      // Thunderstorm with heavy hail
    };
    
    return weatherEmojis[code] || '🌤️';
}

function showLoading() {
    elements.loading.classList.remove('hidden');
    elements.weatherSection.classList.add('hidden');
}

function hideLoading() {
    elements.loading.classList.add('hidden');
}

function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorMessage.classList.remove('hidden');
}

function hideError() {
    elements.errorMessage.classList.add('hidden');
}

// ===== Dark Mode =====
function initTheme() {
    const savedTheme = localStorage.getItem(CONFIG.STORAGE_KEY_THEME);
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        elements.themeToggle.textContent = '☀️';
    } else {
        elements.themeToggle.textContent = '🌙';
    }
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    
    localStorage.setItem(CONFIG.STORAGE_KEY_THEME, isDark ? 'dark' : 'light');
    elements.themeToggle.textContent = isDark ? '☀️' : '🌙';
}

// ===== Gestion des Favoris =====
let favorites = [];

function loadFavorites() {
    const stored = localStorage.getItem(CONFIG.STORAGE_KEY_FAVORITES);
    favorites = stored ? JSON.parse(stored) : [];
}

function saveFavorites(favList) {
    favorites = favList;
    localStorage.setItem(CONFIG.STORAGE_KEY_FAVORITES, JSON.stringify(favList));
}

function renderFavorites() {
    if (favorites.length === 0) {
        elements.favoritesList.innerHTML = '<p class="empty-message">Aucun favori pour le moment</p>';
        return;
    }
    
    const items = favorites.map(fav => `
        <div class="favorite-item" data-lat="${fav.lat}" data-lon="${fav.lon}" data-name="${fav.name}">
            <span class="favorite-name">${fav.name}</span>
            <button class="favorite-remove" data-name="${fav.name}" aria-label="Supprimer">❌</button>
        </div>
    `).join('');
    
    elements.favoritesList.innerHTML = items;
    
    // Écouteurs pour charger la météo
    elements.favoritesList.querySelectorAll('.favorite-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('favorite-remove')) {
                const lat = parseFloat(item.dataset.lat);
                const lon = parseFloat(item.dataset.lon);
                const name = item.dataset.name;
                fetchWeather(lat, lon, name);
            }
        });
    });
    
    // Écouteurs pour supprimer
    elements.favoritesList.querySelectorAll('.favorite-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const name = btn.dataset.name;
            const newFavorites = favorites.filter(f => f.name !== name);
            saveFavorites(newFavorites);
            renderFavorites();
            updateFavoriteButton();
        });
    });
}

function updateFavoriteButton() {
    if (!currentCity) {
        elements.favoriteBtn.style.opacity = '0.5';
        return;
    }
    
    elements.favoriteBtn.style.opacity = '1';
    const isFavorite = favorites.some(f => f.name === currentCity.name);
    
    if (isFavorite) {
        elements.favoriteBtn.textContent = '⭐';
        elements.favoriteBtn.classList.add('active');
        elements.favoriteBtn.setAttribute('aria-label', 'Retirer des favoris');
    } else {
        elements.favoriteBtn.textContent = '☆';
        elements.favoriteBtn.classList.remove('active');
        elements.favoriteBtn.setAttribute('aria-label', 'Ajouter aux favoris');
    }
}

function handleFavoriteToggle() {
    if (!currentCity) return;
    
    const existingIndex = favorites.findIndex(f => f.name === currentCity.name);
    
    if (existingIndex >= 0) {
        // Supprimer des favoris
        const newFavorites = favorites.filter(f => f.name !== currentCity.name);
        saveFavorites(newFavorites);
    } else {
        // Ajouter aux favoris
        const newFavorites = [...favorites, currentCity];
        saveFavorites(newFavorites);
    }
    
    renderFavorites();
    updateFavoriteButton();
}