// ui.js
// Renders and updates the DOM. Rules: no API requests and no LocalStorage in this file.
// Elements are built with textContent (not innerHTML), so city names can't inject HTML.

import {
    getWeatherVisual,
    getWeatherLabel,
    formatTemp,
    formatWind,
    formatHumidity,
    formatLocalDayTime,
    formatShortDay
} from "./weather.js";

const ICON_FOLDER = "assets/icons";
const FALLBACK_ICON = "overcast";

const currentEl = document.getElementById("current-weather");
const forecastEl = document.getElementById("forecast");
const recentEl = document.getElementById("recent-searches");
const loadingEl = document.getElementById("loading");
const errorEl = document.getElementById("error");
const searchButton = document.querySelector("#search-form button");
const celsiusBtn = document.getElementById("celsius-btn");
const fahrenheitBtn = document.getElementById("fahrenheit-btn");
const themeToggle = document.getElementById("theme-toggle");
const locationText = document.getElementById("location-text");


// =========================
// Small helpers
// =========================

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function makeIcon(code, isDay, className) {
    const { icon } = getWeatherVisual(code, isDay);
    const label = getWeatherLabel(code);

    const img = el("img", className);
    img.src = `${ICON_FOLDER}/${icon}.svg`;
    img.alt = label;
    img.width = 64;
    img.height = 64;

    // If an icon file is missing, show a generic one instead of a broken image.
    img.onerror = () => {
        img.onerror = null;
        img.src = `${ICON_FOLDER}/${FALLBACK_ICON}.svg`;
    };

    return img;
}

/** "Berlin, Germany" - but just "Poland" when the name and country are the same. */
function formatPlace(location) {
    const sameAsCountry = (location.country ?? "").toLowerCase() === location.name.toLowerCase();
    return location.country && !sameAsCountry ? `${location.name}, ${location.country}` : location.name;
}

function detailRow(label, value) {
    const row = el("div");
    row.append(el("dt", "", label), el("dd", "", value));
    return row;
}


// =========================
// Loading / error
// =========================

export function showLoading(isLoading) {
    loadingEl.hidden = !isLoading;
    searchButton.disabled = isLoading;
}

export function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
}

export function hideError() {
    errorEl.textContent = "";
    errorEl.hidden = true;
}


// =========================
// Weather
// =========================

export function setTheme(theme) {
    document.body.dataset.theme = theme;
}

export function renderCurrent(data, unit) {
    const { location, current } = data;
    const { day, time } = formatLocalDayTime(current.time);

    const header = el("div", "current-header");
    header.append(el("span", "current-day", day), el("span", "current-time", time));

    const main = el("div", "current-main");
    main.append(
        el("span", "current-temp", formatTemp(current.temperature, unit)),
        makeIcon(current.weatherCode, current.isDay, "wx-icon wx-icon--lg")
    );

    const details = el("dl", "current-details");
    details.append(
        detailRow("Feels like", formatTemp(current.feelsLike, unit)),
        detailRow("Humidity", formatHumidity(current.humidity)),
        detailRow("Wind", formatWind(current.windSpeed))
    );

    const body = el("div", "current-body");
    body.append(
        main,
        el("p", "current-condition", getWeatherLabel(current.weatherCode)),
        el("p", "current-city", formatPlace(location)),
        details
    );

    currentEl.replaceChildren(header, body);
}

export function renderForecast(daily, unit) {
    const cards = daily.map((day) => {
        const card = el("div", "forecast-card");
        card.append(
            el("span", "forecast-day", formatShortDay(day.date)),
            makeIcon(day.weatherCode, 1, "wx-icon"),
            el("span", "forecast-temp", formatTemp(day.tempMax, unit)),
            el("span", "forecast-range", `Low ${formatTemp(day.tempMin, unit)}`)
        );
        return card;
    });

    forecastEl.replaceChildren(...cards);
}

/** Draws everything for one search result and applies the weather theme. */
export function renderWeather(data, unit) {
    setLocationLabel(formatPlace(data.location));
    renderCurrent(data, unit);
    renderForecast(data.daily, unit);
    setTheme(getWeatherVisual(data.current.weatherCode, data.current.isDay).theme);
}


// =========================
// Navbar: location label and light/dark switch
// =========================

export function setLocationLabel(text) {
    locationText.textContent = text;
}

/** mode is "dark" or "light". The look itself comes from CSS (:root[data-mode]). */
export function setMode(mode) {
    document.documentElement.dataset.mode = mode;
    themeToggle.setAttribute("aria-checked", String(mode === "dark"));
}


// =========================
// Temperature toggle
// =========================

export function setActiveUnit(unit) {
    celsiusBtn.classList.toggle("active", unit === "celsius");
    fahrenheitBtn.classList.toggle("active", unit === "fahrenheit");
}


// =========================
// Recent searches
// =========================

/**
 * @param list      array of { name, country, latitude, longitude }
 * @param onSelect  called with the clicked location
 */
export function renderRecent(list, onSelect) {
    // Keep the <h2>; remove only what we added before.
    recentEl.querySelectorAll(".recent-city, .recent-empty").forEach((node) => node.remove());

    if (list.length === 0) {
        recentEl.append(el("p", "recent-empty", "No searches yet."));
        return;
    }

    list.forEach((location) => {
        const button = el("button", "recent-city");
        button.type = "button";
        button.append(el("span", "recent-name", location.name));

        if (location.country && location.country.toLowerCase() !== location.name.toLowerCase()) {
            button.append(el("span", "recent-meta", location.country));
        }

        button.addEventListener("click", () => onSelect(location));
        recentEl.append(button);
    });
}