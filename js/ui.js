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
    img.width = 56;
    img.height = 56;

    // If an icon file is missing, show a generic one instead of a broken image.
    img.onerror = () => {
        img.onerror = null;
        img.src = `${ICON_FOLDER}/${FALLBACK_ICON}.svg`;
    };

    return img;
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

    const place = location.country ? `${location.name}, ${location.country}` : location.name;

    const body = el("div", "current-body");
    body.append(
        main,
        el("p", "current-condition", getWeatherLabel(current.weatherCode)),
        el("p", "current-city", place),
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
    renderCurrent(data, unit);
    renderForecast(data.daily, unit);
    setTheme(getWeatherVisual(data.current.weatherCode, data.current.isDay).theme);
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

        if (location.country) {
            button.append(el("span", "recent-meta", location.country));
        }

        button.addEventListener("click", () => onSelect(location));
        recentEl.append(button);
    });
}