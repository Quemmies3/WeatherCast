// app.js
// Coordinates the app: connects the form and buttons to api, weather, storage and ui.

import { searchCity, fetchWeather, CityNotFoundError } from "./api.js";
import { buildWeatherData } from "./weather.js";
import * as storage from "./storage.js";
import * as ui from "./ui.js";

const searchForm = document.getElementById("search-form");
const cityInput = document.getElementById("city-input");
const celsiusBtn = document.getElementById("celsius-btn");
const fahrenheitBtn = document.getElementById("fahrenheit-btn");

let currentUnit = storage.getUnit();
let lastWeather = null;   // most recent clean weather data, used to redraw when the unit changes
let latestRequest = 0;    // lets us ignore slow responses from older searches


// =========================
// Loading weather
// =========================

/**
 * Runs one search from start to finish.
 * @param getLocation  async function that returns { name, country, latitude, longitude }
 */
async function runSearch(getLocation) {
    const requestId = ++latestRequest;

    ui.hideError();
    ui.showLoading(true);

    try {
        const location = await getLocation();
        const raw = await fetchWeather(location);

        if (requestId !== latestRequest) return; // a newer search has started

        lastWeather = buildWeatherData(location, raw);
        ui.renderWeather(lastWeather, currentUnit);

        storage.saveRecentSearch(location);
        ui.renderRecent(storage.getRecentSearches(), handleRecentSelect);
    } catch (error) {
        if (requestId !== latestRequest) return;

        if (error instanceof CityNotFoundError) {
            ui.showError(`We couldn't find "${error.city}". Check the spelling and try again.`);
        } else {
            console.error(error); // details stay in the console, not on screen
            ui.showError("We couldn't load the weather right now. Check your connection and try again.");
        }
    } finally {
        if (requestId === latestRequest) ui.showLoading(false);
    }
}


// =========================
// City Search
// =========================

searchForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const city = cityInput.value.trim();

    if (city.length < 2) {
        ui.showError("Please enter a city name (at least 2 characters).");
        return;
    }

    runSearch(() => searchCity(city));
});

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
// Start-up
// =========================

ui.setActiveUnit(currentUnit);
ui.renderRecent(storage.getRecentSearches(), handleRecentSelect);