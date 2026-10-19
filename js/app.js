// app.js
// Coordinates the app: connects the form and buttons to api, weather, storage and ui.

import { searchCity, fetchWeather, fetchOtherCities, CityNotFoundError, ApiError } from "./api.js";
import { buildWeatherData, parseOtherCities } from "./weather.js";
import * as storage from "./storage.js";
import * as ui from "./ui.js";

const searchForm = document.getElementById("search-form");
const cityInput = document.getElementById("city-input");
const celsiusBtn = document.getElementById("celsius-btn");
const fahrenheitBtn = document.getElementById("fahrenheit-btn");
const themeToggle = document.getElementById("theme-toggle");
const viewTabs = document.querySelector(".view-tabs");

const TABS = ["today", "tomorrow", "week"]; // left to right, as on the page

let currentUnit = storage.getUnit();
let currentTab = "today";   // the forecast view: "today" | "tomorrow" | "week" (next 5 days)
let currentMode = storage.getMode();
let lastWeather = null;   // most recent clean weather data, used to redraw when the unit changes
let latestRequest = 0;    // lets us ignore slow responses from older searches
let lastSearch = null;    // the last search, so Retry can run it again
let recentState = { list: [], conditions: [] }; // recent searches + their live conditions
let latestRecentRefresh = 0;


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
                cityInput.value = "";
                ui.hideDisambiguation();
                runSearch(async () => selectedLocation);
            });
            return;
        }
        
        const location = locationOrArray;
        const raw = await fetchWeather(location);

        if (requestId !== latestRequest) return; // a newer search has started

        lastWeather = buildWeatherData(location, raw);
        ui.renderWeather(lastWeather, currentUnit, currentTab);

        storage.saveRecentSearch(location);
        refreshRecent();
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
// Recent searches with live conditions ("Other Cities")
// =========================

/**
 * Shows the recent searches right away (names only), then fetches their current
 * conditions in ONE request. If that fails, the names stay and nothing else is shown:
 * this is a nice-to-have, so it never replaces the weather with an error.
 */
async function refreshRecent() {
    const list = storage.getRecentSearches();
    recentState = { list, conditions: [] };
    ui.renderRecent(list, handleRecentSelect);

    if (list.length === 0) return;

    const refreshId = ++latestRecentRefresh;

    try {
        const raw = await fetchOtherCities(list);
        if (refreshId !== latestRecentRefresh) return;

        recentState = { list, conditions: parseOtherCities(raw, list.length) };
        ui.renderRecent(list, handleRecentSelect, recentState.conditions, currentUnit);
    } catch (error) {
        console.error(error);
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

    // Read query into variable, then clear input and close dropdown
    const searchQuery = city;
    cityInput.value = "";
    ui.hideDisambiguation();

    runSearch(async () => {
        const results = await searchCity(searchQuery);
        // If only one result, return it directly; otherwise return array for disambiguation
        return results.length === 1 ? results[0] : results;
    });
});

cityInput.addEventListener("input", () => cityInput.setCustomValidity(""));

function handleRecentSelect(location) {
    cityInput.value = "";
    ui.hideDisambiguation();
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
        ui.renderWeather(lastWeather, currentUnit, currentTab);
    }

    ui.renderRecent(recentState.list, handleRecentSelect, recentState.conditions, currentUnit);
}

celsiusBtn.addEventListener("click", () => setUnit("celsius"));
fahrenheitBtn.addEventListener("click", () => setUnit("fahrenheit"));


// =========================
// Forecast tabs: Today | Tomorrow | Next 5 days
// =========================

function setTab(tab) {
    currentTab = tab;
    ui.setActiveTab(tab);

    if (lastWeather) {
        ui.renderForecast(lastWeather, currentUnit, currentTab);
    }
}

viewTabs.addEventListener("click", (event) => {
    const button = event.target.closest('[role="tab"]');
    if (button) setTab(button.dataset.tab);
});

// Arrow keys move between tabs, as people expect from a tab bar.
viewTabs.addEventListener("keydown", (event) => {
    const here = TABS.indexOf(currentTab);
    let next = -1;

    if (event.key === "ArrowRight") next = (here + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (here - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;

    if (next >= 0) {
        event.preventDefault();
        setTab(TABS[next]);
        ui.focusTab(TABS[next]);
    }
});


// =========================
// Light / Dark Mode Switch
// =========================

themeToggle.addEventListener("click", () => {
    currentMode = currentMode === "dark" ? "light" : "dark";
    storage.saveMode(currentMode);
    ui.setMode(currentMode);
});


// =========================
// Geolocation
// =========================

/**
 * Request browser geolocation once and load weather for that location.
 * Falls back silently if denied or unavailable.
 */
async function tryGeolocation() {
    if (!navigator.geolocation) {
        return false;
    }

    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const { latitude, longitude } = position.coords;
                    const location = await reverseGeocode({ latitude, longitude });
                    
                    // Load weather for the geolocated position
                    runSearch(async () => location);
                    resolve(true);
                } catch (error) {
                    console.error("Geolocation reverse geocode failed:", error);
                    resolve(false);
                }
            },
            (error) => {
                console.log("Geolocation denied or unavailable:", error.message);
                resolve(false);
            },
            { timeout: 10000, enableHighAccuracy: false }
        );
    });
}


// =========================
// Start-up
// =========================

async function initialize() {
    ui.setMode(currentMode);
    ui.setActiveUnit(currentUnit);
    ui.setActiveTab(currentTab);

    const recentSearches = storage.getRecentSearches();
    recentState = { list: recentSearches, conditions: [] };
    ui.renderRecent(recentSearches, handleRecentSelect);

    // Try geolocation first, fall back to last recent search if denied/unavailable
    const geolocated = await tryGeolocation();

    if (!geolocated && recentSearches.length > 0) {
        // Reopen on the last city searched if geolocation failed
        handleRecentSelect(recentSearches[0]);
    }
}

initialize();