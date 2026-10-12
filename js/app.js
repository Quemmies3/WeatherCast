// app.js
// Coordinates the app: connects the form and buttons to api, weather, storage and ui.

import { searchCity, fetchWeather, CityNotFoundError, ApiError } from "./api.js";
import { buildWeatherData } from "./weather.js";
import * as storage from "./storage.js";
import * as ui from "./ui.js";

const searchForm = document.getElementById("search-form");
const cityInput = document.getElementById("city-input");
const celsiusBtn = document.getElementById("celsius-btn");
const fahrenheitBtn = document.getElementById("fahrenheit-btn");
const themeToggle = document.getElementById("theme-toggle");

let currentUnit = storage.getUnit();
let currentMode = storage.getMode();
let lastWeather = null;   // most recent clean weather data, used to redraw when the unit changes
let latestRequest = 0;    // lets us ignore slow responses from older searches
let lastSearch = null;    // the last search, so Retry can run it again


// =========================
// Loading weather
// =========================

/**
 * Runs one search from start to finish.
 * @param getLocation  async function that returns { name, country, latitude, longitude } or array of locations
 */
/** Turns any error into what the user should see. */
function describeError(error) {
    if (error instanceof CityNotFoundError) {
        return {
            kind: "not-found",
            title: "City not found",
            message: `We couldn't find "${error.city}". Check the spelling or try a larger nearby city.`,
            actionLabel: "Try another city",
            onAction: () => { cityInput.focus(); cityInput.select(); },
            refocus: true
        };
    }

    const retry = { actionLabel: "Try again", onAction: () => runSearch(lastSearch) };
    const kind = error instanceof ApiError ? error.kind : "unknown";

    if (kind === "network" || navigator.onLine === false) {
        return { kind: "network", title: "No connection",
            message: "We couldn't reach the weather service. Check your internet connection and try again.", ...retry };
    }
    if (kind === "timeout") {
        return { kind: "network", title: "Taking too long",
            message: "The request timed out. Your connection may be slow, so try again.", ...retry };
    }
    if (kind === "rate-limit") {
        return { kind: "error", title: "Too many requests",
            message: "The weather service is busy. Wait a moment, then try again.", ...retry };
    }
    if (kind === "server") {
        return { kind: "error", title: "Service unavailable",
            message: "The weather service is having problems. Try again in a few minutes.", ...retry };
    }
    return { kind: "error", title: "Couldn't load weather",
        message: "Something went wrong while loading the weather. Please try again.", ...retry };
}

async function runSearch(getLocation) {
    const requestId = ++latestRequest;
    lastSearch = getLocation;

    ui.hideError();
    ui.showLoading(true);

    let failure = null;

    try {
        const locationOrArray = await getLocation();
        
        // If we get multiple locations, show disambiguation dropdown
        if (Array.isArray(locationOrArray)) {
            if (requestId !== latestRequest) return;
            
            ui.showLoading(false);
            ui.showDisambiguation(locationOrArray, (selectedLocation) => {
                ui.hideDisambiguation();
                runSearch(async () => selectedLocation);
            });
            return;
        }
        
        const location = locationOrArray;
        const raw = await fetchWeather(location);

        if (requestId !== latestRequest) return; // a newer search has started

        lastWeather = buildWeatherData(location, raw);
        ui.renderWeather(lastWeather, currentUnit);

        storage.saveRecentSearch(location);
        ui.renderRecent(storage.getRecentSearches(), handleRecentSelect);
    } catch (error) {
        if (requestId !== latestRequest) return;

        console.error(error); // details stay in the console, not on screen
        failure = describeError(error);
        ui.showError(failure);
    } finally {
        if (requestId === latestRequest) {
            ui.showLoading(false);
            // The input was disabled during loading, so focus it only after re-enabling.
            if (failure?.refocus) {
                cityInput.focus();
                cityInput.select();
            }
        }
    }
}


// =========================
// City Search
// =========================

searchForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const city = cityInput.value.trim();

    if (city.length < 2) {
        cityInput.setCustomValidity("Enter at least 2 characters.");
        cityInput.reportValidity();
        return;
    }

    runSearch(async () => {
        const results = await searchCity(city);
        // If only one result, return it directly; otherwise return array for disambiguation
        return results.length === 1 ? results[0] : results;
    });
});

cityInput.addEventListener("input", () => cityInput.setCustomValidity(""));

function handleRecentSelect(location) {
    cityInput.value = location.name;
    runSearch(async () => location);
}


// =========================
// Temperature Unit Toggle
// =========================

function setUnit(unit) {
    currentUnit = unit;
    storage.saveUnit(unit);
    ui.setActiveUnit(unit);

    if (lastWeather) {
        ui.renderWeather(lastWeather, currentUnit);
    }
}

celsiusBtn.addEventListener("click", () => setUnit("celsius"));
fahrenheitBtn.addEventListener("click", () => setUnit("fahrenheit"));


// =========================
// Light / Dark Mode Switch
// =========================

themeToggle.addEventListener("click", () => {
    currentMode = currentMode === "dark" ? "light" : "dark";
    storage.saveMode(currentMode);
    ui.setMode(currentMode);
});


// =========================
// Start-up
// =========================

ui.setMode(currentMode);
ui.setActiveUnit(currentUnit);

const recentSearches = storage.getRecentSearches();
ui.renderRecent(recentSearches, handleRecentSelect);

// Reopen on the last city searched, so a refresh doesn't empty the dashboard.
// (Delete these 3 lines if you'd rather start on the empty "Search for a city" screen.)
if (recentSearches.length > 0) {
    handleRecentSelect(recentSearches[0]);
}