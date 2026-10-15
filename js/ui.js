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
    formatShortDay,
    formatHourLabel,
    formatClockTime,
    formatPressure,
    buildRainChart,
    getCompassDirection,
    describeUv,
    uvGaugePercent,
    visibilityKm,
    describeVisibility,
    getBarHeights
} from "./weather.js";

const ICON_FOLDER = "assets/icons";
const FALLBACK_ICON = "overcast";

const currentEl = document.getElementById("current-weather");
const forecastEl = document.getElementById("forecast");
const tilesEl = document.querySelector("#overview .tiles");
const rainChartEl = document.querySelector("#rain .rain-chart");
const tabsEl = document.querySelector(".view-tabs");
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
    
    // Only update DOM if the values actually changed (prevents blinking)
    if (dayEl && dayEl.textContent !== day) dayEl.textContent = day;
    if (timeEl && timeEl.textContent !== time) timeEl.textContent = time;
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

    const direction = getCompassDirection(current.windDirection);
    const details = el("dl", "current-details");
    details.append(
        detailRow("Feels like", formatTemp(current.feelsLike, unit)),
        detailRow("Wind", direction ? `${formatWind(current.windSpeed)} ${direction}` : formatWind(current.windSpeed)),
        detailRow("Pressure", formatPressure(current.pressure)),
        detailRow("Humidity", formatHumidity(current.humidity)),
        detailRow("Sunrise", formatClockTime(data.today?.sunrise)),
        detailRow("Sunset", formatClockTime(data.today?.sunset))
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

const FORECAST_LABELS = {
    week: "5-day forecast",
    today: "Hourly forecast for today",
    tomorrow: "Hourly forecast for tomorrow"
};

function dayCard(day, unit) {
    const card = el("div", "forecast-card");
    card.append(
        el("span", "forecast-day", formatShortDay(day.date)),
        makeIcon(day.weatherCode, 1, "wx-icon"),
        el("span", "forecast-temp", formatTemp(day.tempMax, unit)),
        el("span", "forecast-range", `Low ${formatTemp(day.tempMin, unit)}`)
    );
    return card;
}

function hourCard(slot, label, unit) {
    const rain = Number.isFinite(slot.rainChance) ? `Rain ${Math.round(slot.rainChance)}%` : "Rain --";

    const card = el("div", "forecast-card");
    card.append(
        el("span", "forecast-day", label),
        makeIcon(slot.weatherCode, slot.isDay, "wx-icon"),
        el("span", "forecast-temp", formatTemp(slot.temperature, unit)),
        el("span", "forecast-range", rain)
    );
    return card;
}

/** "Now" for the first slot of Today; "Sat 1 AM" when a Today slot runs past midnight; else "3 PM". */
function slotLabel(slot, index, tab, currentDate) {
    if (tab === "today" && index === 0) return "Now";

    const hour = formatHourLabel(slot.time);
    const date = String(slot.time).slice(0, 10);
    return tab === "today" && date !== currentDate ? `${formatShortDay(date)} ${hour}` : hour;
}

/**
 * tab: "week" (the next 5 days, default), "today" (next hours) or "tomorrow".
 */
export function renderForecast(data, unit, tab = "week") {
    let cards;

    if (tab === "week") {
        cards = data.daily.map((day) => dayCard(day, unit));
    } else {
        const slots = tab === "today" ? data.hourlyToday : data.hourlyTomorrow;
        const currentDate = String(data.current.time).slice(0, 10);

        cards = (slots ?? []).map((slot, i) => {
            // "Now" shows the same current reading as the big card; its rain chance still comes from the hourly data.
            const shown = tab === "today" && i === 0
                ? { ...slot, temperature: data.current.temperature, weatherCode: data.current.weatherCode, isDay: data.current.isDay }
                : slot;

            return hourCard(shown, slotLabel(slot, i, tab, currentDate), unit);
        });
    }

    if (cards.length === 0) {
        cards = [el("p", "forecast-empty", "The hourly forecast isn't available for this location.")];
    }

    forecastEl.setAttribute("aria-label", FORECAST_LABELS[tab] ?? FORECAST_LABELS.week);
    forecastEl.replaceChildren(...cards);
}

/** Highlights the chosen tab ("today" | "tomorrow" | "week"). */
export function setActiveTab(tab) {
    tabsEl.querySelectorAll('[role="tab"]').forEach((button) => {
        const selected = button.dataset.tab === tab;
        button.setAttribute("aria-selected", String(selected));
        button.tabIndex = selected ? 0 : -1;
    });
}

export function focusTab(tab) {
    tabsEl.querySelector(`[data-tab="${tab}"]`)?.focus();
}

/** Draws everything for one search result and applies the weather theme. */
export function renderWeather(data, unit, tab = "week") {
    setLocationLabel(formatPlace(data.location));
    renderCurrent(data, unit);
    renderForecast(data, unit, tab);
    renderOverview(data, unit);
    renderRain(data);
    setTheme(getWeatherVisual(data.current.weatherCode, data.current.isDay).theme);
}


// =========================
// Today's Overview tiles: Wind, UV Index, Humidity, Visibility
// =========================

const SVG_NS = "http://www.w3.org/2000/svg";
const GAUGE_ARC = "M 10 50 A 40 40 0 0 1 90 50"; // a half circle, drawn left to right

function svgEl(tag, attributes = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
    return node;
}

/** A simple line icon: shapes is a list of [tag, attributes]. */
function makeLineIcon(shapes) {
    const svg = svgEl("svg", { viewBox: "0 0 24 24", class: "tile-icon", "aria-hidden": "true" });
    shapes.forEach(([tag, attributes]) => svg.append(svgEl(tag, attributes)));
    return svg;
}

function makeTile(title, subtitle) {
    const tile = el("article", "tile");
    tile.append(el("h3", "tile-title", title));
    if (subtitle) tile.append(el("p", "tile-sub", subtitle));
    return tile;
}

/** Bottom row of a tile: big value (+ small unit) on the left, a short note on the right. */
function makeTileFoot(value, unit, note) {
    const foot = el("div", "tile-foot");
    const valueEl = el("span", "tile-value", value);
    if (unit) valueEl.append(el("small", "", unit));
    foot.append(valueEl);
    if (note) foot.append(el("span", "tile-note", note));
    return foot;
}

function wholeNumber(value) {
    return Number.isFinite(value) ? String(Math.round(value)) : "--";
}

function windTile(current, series) {
    const tile = makeTile("Wind Status", "Next 24 hours");
    const visual = el("div", "tile-visual");

    if (series.length > 0) {
        const low = Math.round(Math.min(...series));
        const high = Math.round(Math.max(...series));

        const bars = el("div", "wind-bars");
        bars.setAttribute("role", "img");
        bars.setAttribute("aria-label", `Wind speed over the next 24 hours, from ${low} to ${high} km/h`);

        getBarHeights(series).forEach((height) => {
            const bar = el("span", "wind-bar");
            bar.style.height = `${height}%`;
            bars.append(bar);
        });

        visual.append(bars);
    } else {
        visual.append(el("span", "placeholder", "--"));
    }

    tile.append(visual, makeTileFoot(wholeNumber(current.windSpeed), " km/h", getCompassDirection(current.windDirection)));
    return tile;
}

function uvTile(today) {
    const uv = today?.uvIndexMax;
    const hasUv = Number.isFinite(uv);

    const tile = makeTile("UV Index", "Today's peak");
    const visual = el("div", "tile-visual");

    const gauge = svgEl("svg", { viewBox: "0 0 100 56", class: "uv-gauge", "aria-hidden": "true" });
    gauge.append(svgEl("path", { d: GAUGE_ARC, class: "gauge-track" }));

    if (hasUv && uv > 0) {
        gauge.append(svgEl("path", {
            d: GAUGE_ARC,
            class: "gauge-fill",
            pathLength: "100",
            "stroke-dasharray": `${uvGaugePercent(uv)} 100`
        }));
    }

    visual.append(gauge);
    tile.append(visual, makeTileFoot(hasUv ? uv.toFixed(1) : "--", " UV", describeUv(uv)));
    return tile;
}

function humidityTile(current, unit) {
    const tile = makeTile("Humidity");
    const visual = el("div", "tile-visual");

    // A water drop
    visual.append(makeLineIcon([["path", { d: "M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" }]]));

    const note = Number.isFinite(current.dewPoint) ? `Dew point ${formatTemp(current.dewPoint, unit)}` : "";
    tile.append(visual, makeTileFoot(wholeNumber(current.humidity), "%", note));
    return tile;
}

function visibilityTile(current) {
    const tile = makeTile("Visibility");
    const visual = el("div", "tile-visual");

    // An eye
    visual.append(makeLineIcon([
        ["path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }],
        ["circle", { cx: "12", cy: "12", r: "3" }]
    ]));

    tile.append(visual, makeTileFoot(visibilityKm(current.visibility), " km", describeVisibility(current.visibility)));
    return tile;
}

export function renderOverview(data, unit) {
    tilesEl.replaceChildren(
        windTile(data.current, data.windSeries ?? []),
        uvTile(data.today),
        humidityTile(data.current, unit),
        visibilityTile(data.current)
    );
}


// =========================
// Chance of Rain chart
// =========================

export function renderRain(data) {
    const series = data.rainSeries ?? [];

    if (!series.some((item) => Number.isFinite(item.value))) {
        const message = series.length ? "Chance of rain isn't available for this location." : "--";
        rainChartEl.replaceChildren(el("p", series.length ? "rain-empty" : "placeholder", message));
        return;
    }

    const chart = buildRainChart(series);
    const summary = chart.points
        .map((point) => `${point.label} ${point.value === null ? "unknown" : `${Math.round(point.value)}%`}`)
        .join(", ");

    const svg = svgEl("svg", {
        viewBox: `0 0 ${chart.width} ${chart.height}`,
        class: "rain-svg",
        role: "img",
        "aria-label": `Chance of rain over the next ${series.length} hours: ${summary}`
    });

    // Grid lines and the % labels on the left
    chart.grid.forEach((line) => {
        svg.append(svgEl("line", { x1: chart.left, x2: chart.right, y1: line.y, y2: line.y, class: "rain-grid" }));

        const label = svgEl("text", { x: chart.left - 6, y: line.y + 3.5, "text-anchor": "end", class: "rain-axis" });
        label.textContent = line.label;
        svg.append(label);
    });

    // One bar per hour (nothing to draw at 0%: the dot sits on the baseline)
    chart.points.forEach((point) => {
        if (point.y === null || point.value <= 0) return;
        svg.append(svgEl("rect", {
            x: point.x - 2.5,
            y: point.y,
            width: 5,
            height: chart.baseline - point.y,
            rx: 2.5,
            class: "rain-bar"
        }));
    });

    if (chart.path) svg.append(svgEl("path", { d: chart.path, class: "rain-line" }));

    chart.points.forEach((point) => {
        if (point.y !== null) svg.append(svgEl("circle", { cx: point.x, cy: point.y, r: 3.5, class: "rain-dot" }));
    });

    // Hour labels along the bottom
    chart.points.forEach((point) => {
        const label = svgEl("text", { x: point.x, y: chart.height - 6, "text-anchor": "middle", class: "rain-axis" });
        label.textContent = point.label;
        svg.append(label);
    });

    rainChartEl.replaceChildren(svg);
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
 * @param list        array of { name, country, latitude, longitude }
 * @param onSelect    called with the clicked location
 * @param conditions  optional, one per city: { temperature, weatherCode, isDay } or null
 *                    (live conditions; the cards show names only until they arrive)
 * @param unit        "celsius" | "fahrenheit" for the temperatures
 */
export function renderRecent(list, onSelect, conditions = [], unit = "celsius") {
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

    list.forEach((location, index) => {
        const info = conditions[index];

        const button = el("button", "recent-city");
        button.type = "button";

        // Left: country (small), city name, and the condition once we have it
        const text = el("span", "recent-text");
        if (location.country && location.country.toLowerCase() !== location.name.toLowerCase()) {
            text.append(el("span", "recent-meta", location.country));
        }
        text.append(el("span", "recent-name", location.name));
        if (info) text.append(el("span", "recent-condition", getWeatherLabel(info.weatherCode)));
        button.append(text);

        // Right: icon and temperature
        if (info) {
            const icon = makeIcon(info.weatherCode, info.isDay, "wx-icon");
            icon.alt = ""; // the condition is already written next to it
            const side = el("span", "recent-side");
            side.append(icon, el("span", "recent-temp", formatTemp(info.temperature, unit)));
            button.append(side);
        }

        // Spoken name, in the same order as the visible text: "Nigeria, Lagos, Overcast, 29°"
        const spoken = [];
        if (location.country && location.country.toLowerCase() !== location.name.toLowerCase()) spoken.push(location.country);
        spoken.push(location.name);
        if (info) spoken.push(getWeatherLabel(info.weatherCode), formatTemp(info.temperature, unit));
        button.setAttribute("aria-label", spoken.join(", "));

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
    // Remove duplicates based on name, country, and admin1
    const seen = new Set();
    const uniqueLocations = locations.filter((location) => {
        const key = `${location.name}|${location.country}|${location.admin1}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    const title = el("h3", "disambiguation-title", "Multiple locations found. Choose one:");
    
    const list = el("div", "disambiguation-list");
    
    uniqueLocations.forEach((location) => {
        const button = el("button", "disambiguation-option");
        button.type = "button";
        
        const nameEl = el("div", "disambiguation-name", location.name);
        
        // Build "region, country" or just "country" if no region
        const parts = [];
        if (location.admin1) parts.push(location.admin1);
        if (location.country) parts.push(location.country);
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