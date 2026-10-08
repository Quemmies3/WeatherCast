// api.js
// Talks to Open-Meteo. Rules: no DOM access in this file.
// Docs: https://open-meteo.com/en/docs and https://open-meteo.com/en/docs/geocoding-api

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const TIMEOUT_MS = 10000;

/** Thrown when the city search returns no results. */
export class CityNotFoundError extends Error {
    constructor(city) {
        super(`City not found: ${city}`);
        this.name = "CityNotFoundError";
        this.city = city;
    }
}

/** Fetches JSON, with a timeout and an HTTP status check. */
async function getJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(url, { signal: controller.signal });

        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }

        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

/**
 * City name -> { name, country, latitude, longitude }
 * Throws CityNotFoundError when nothing matches.
 */
export async function searchCity(name) {
    const params = new URLSearchParams({
        name,
        count: "1",
        language: "en",
        format: "json"
    });

    const data = await getJson(`${GEOCODING_URL}?${params}`);
    const match = data.results?.[0];

    if (!match) {
        throw new CityNotFoundError(name);
    }

    return {
        name: match.name,
        country: match.country ?? "",
        latitude: match.latitude,
        longitude: match.longitude
    };
}

/**
 * Coordinates -> raw forecast JSON.
 * forecast_days is 6 because day 1 is today (shown in the big card)
 * and the 5 cards show the days after it.
 * Temperatures come back in °C and wind in km/h (the API defaults).
 */
export function fetchWeather({ latitude, longitude }) {
    const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day",
        daily: "weather_code,temperature_2m_max,temperature_2m_min",
        timezone: "auto",
        forecast_days: "6"
    });

    return getJson(`${FORECAST_URL}?${params}`);
}