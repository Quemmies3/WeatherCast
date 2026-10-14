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

/** Thrown for network, timeout and HTTP failures. kind: network | timeout | rate-limit | server | http | bad-response */
export class ApiError extends Error {
    constructor(kind, status) {
        super(`API error: ${kind}`);
        this.name = "ApiError";
        this.kind = kind;
        this.status = status;
    }
}

/** Fetches JSON, with a timeout and an HTTP status check. */
async function getJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(url, { signal: controller.signal });

        if (!response.ok) {
            if (response.status === 429) throw new ApiError("rate-limit", 429);
            if (response.status >= 500) throw new ApiError("server", response.status);
            throw new ApiError("http", response.status);
        }

        return await response.json();
    } catch (error) {
        if (error instanceof ApiError) throw error;
        if (error.name === "AbortError") throw new ApiError("timeout");
        if (error instanceof SyntaxError) throw new ApiError("bad-response");
        throw new ApiError("network");
    } finally {
        clearTimeout(timer);
    }
}

/**
 * City name -> array of { name, country, latitude, longitude, admin1 }
 * Returns up to 10 matches for disambiguation.
 * Throws CityNotFoundError when nothing matches.
 */
export async function searchCity(name) {
    const params = new URLSearchParams({
        name,
        count: "10",
        language: "en",
        format: "json"
    });

    const data = await getJson(`${GEOCODING_URL}?${params}`);
    
    if (!data.results || data.results.length === 0) {
        throw new CityNotFoundError(name);
    }

    return data.results.map(match => ({
        name: match.name,
        country: match.country ?? "",
        admin1: match.admin1 ?? "",
        latitude: match.latitude,
        longitude: match.longitude
    }));
}

/**
 * Coordinates -> raw forecast JSON.
 * forecast_days is 6 because day 1 is today (shown in the big card)
 * and the 5 cards show the days after it.
 * Temperatures come back in °C and wind in km/h (the API defaults).
 * timezone="auto" returns timezone and utc_offset_seconds for the location.
 */
export function fetchWeather({ latitude, longitude }) {
    const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        current: "temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,pressure_msl,wind_speed_10m,wind_direction_10m,visibility,weather_code,is_day",
        daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max",
        hourly: "temperature_2m,weather_code,is_day,wind_speed_10m,precipitation_probability",
        timezone: "auto",
        forecast_days: "6"
    });

    return getJson(`${FORECAST_URL}?${params}`);
}

/**
 * Current conditions for several cities in ONE request (used by the recent-searches list).
 * With one location the API returns an object, with several it returns a list;
 * weather.js (parseOtherCities) handles both.
 */
export function fetchOtherCities(locations) {
    const params = new URLSearchParams({
        latitude: locations.map((place) => place.latitude).join(","),
        longitude: locations.map((place) => place.longitude).join(","),
        current: "temperature_2m,weather_code,is_day"
    });

    return getJson(`${FORECAST_URL}?${params}`);
}