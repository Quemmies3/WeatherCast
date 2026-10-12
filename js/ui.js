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
const weatherMainEl = document.querySelector(".weather-main");
const searchInput = document.getElementById("city-input");
const celsiusBtn = document.getElementById("celsius-btn");
const fahrenheitBtn = document.getElementById("fahrenheit-btn");
const themeToggle = document.getElementById("theme-toggle");
const locationText = document.getElementById("location-text");

// Create disambiguation dropdown element
const disambiguationEl = document.createElement("div");
disambiguationEl.id = "disambiguation";
disambiguationEl.hidden = true;
document.querySelector(".dashboard").prepend(disambiguationEl);


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
function makeClockIcon() {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "empty-icon");
    svg.setAttribute("aria-hidden", "true");

    const circle = document.createElementNS(NS, "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "9");

    const hands = document.createElementNS(NS, "polyline");
    hands.setAttribute("points", "12 7 12 12 15.5 14");

    svg.append(circle, hands);
    return svg;
}


// =========================
// Loading / error
// =========================

export function showLoading(isLoading) {
    loadingEl.hidden = !isLoading;
    weatherMainEl.classList.toggle("is-loading", isLoading);
    weatherMainEl.setAttribute("aria-busy", String(isLoading));

    searchInput.disabled = isLoading;
    searchButton.disabled = isLoading;
    searchButton.textContent = isLoading ? "Searching…" : "Search";
}

/**
 * options: { kind, title, message, actionLabel, onAction }
 *   kind         "not-found" | "network" | "error" (picks the icon)
 *   actionLabel  optional button text, e.g. "Try again"
 *   onAction     called when that button is clicked
 */
export function showError(options) {
    // app.js still passes a plain string until Step 6, so accept that too.
    if (typeof options === "string") {
        options = { title: "Something went wrong", message: options };
    }

    const { kind = "error", title, message, actionLabel, onAction } = options;

    const icon = el("div", "error-icon", kind === "not-found" ? "?" : "!");
    icon.setAttribute("aria-hidden", "true");

    const nodes = [icon, el("h2", "error-title", title), el("p", "error-message", message)];

    if (actionLabel && onAction) {
        const button = el("button", "error-action", actionLabel);
        button.type = "button";
        button.addEventListener("click", onAction);
        nodes.push(button);
    }

    errorEl.replaceChildren(...nodes);
    errorEl.hidden = false;
    weatherMainEl.classList.add("has-error");
}

export function hideError() {
    errorEl.replaceChildren();
    errorEl.hidden = true;
    weatherMainEl.classList.remove("has-error");
}

// =========================
// Weather
// =========================

export function setTheme(theme) {
    document.body.dataset.theme = theme;
}

// Store clock interval ID and current data for updates
let clockInterval = null;
let currentWeatherData = null;

function updateClock() {
    if (!currentWeatherData) return;

    const { timezone, utcOffsetSeconds } = currentWeatherData;
    const now = new Date();
    
    // Calculate the local time at the searched location
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    const localTime = new Date(utcTime + (utcOffsetSeconds * 1000));
    
    const day = localTime.toLocaleDateString("en-US", { weekday: "long" });
    const hours = localTime.getHours();
    const minutes = localTime.getMinutes();
    const hour12 = ((hours + 11) % 12) + 1;
    const suffix = hours >= 12 ? "PM" : "AM";
    const time = `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;

    const dayEl = currentEl.querySelector(".current-day");
    const timeEl = currentEl.querySelector(".current-time");
    
    if (dayEl) dayEl.textContent = day;
    if (timeEl) timeEl.textContent = time;
}

export function renderCurrent(data, unit) {
    const { location, current } = data;
    
    // Store data for clock updates
    currentWeatherData = data;
    
    // Clear any existing clock interval
    if (clockInterval) {
        clearInterval(clockInterval);
    }

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
    
    // Start live clock updating every second
    clockInterval = setInterval(updateClock, 1000);
    // Update immediately to show correct time
    updateClock();
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
        const empty = el("div", "recent-empty");
        empty.append(
            makeClockIcon(),
            el("p", "recent-empty-title", "No recent searches"),
            el("p", "recent-empty-hint", "Cities you search for will show up here.")
        );
        recentEl.append(empty);
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


// =========================
// Disambiguation dropdown
// =========================

/**
 * Shows a dropdown of matching cities for the user to choose from
 * @param locations  array of { name, country, admin1, latitude, longitude }
 * @param onSelect   called with the chosen location
 */
export function showDisambiguation(locations, onSelect) {
    const title = el("h3", "disambiguation-title", "Multiple locations found. Choose one:");
    
    const list = el("div", "disambiguation-list");
    
    locations.forEach((location) => {
        const button = el("button", "disambiguation-option");
        button.type = "button";
        
        const nameEl = el("div", "disambiguation-name", location.name);
        const parts = [location.admin1, location.country].filter(Boolean);
        const metaText = parts.join(", ");
        
        button.append(nameEl);
        if (metaText) {
            button.append(el("div", "disambiguation-meta", metaText));
        }
        
        button.addEventListener("click", () => onSelect(location));
        list.append(button);
    });
    
    disambiguationEl.replaceChildren(title, list);
    disambiguationEl.hidden = false;
}

export function hideDisambiguation() {
    disambiguationEl.hidden = true;
    disambiguationEl.replaceChildren();
}