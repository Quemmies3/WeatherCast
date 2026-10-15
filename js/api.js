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
 * City name -> array of { name, country, latitude, longitude, admin1, featureCode }
 * Returns Nigerian locations first, with exact state name matching.
 * Throws CityNotFoundError when nothing matches.
 */
export async function searchCity(name) {
    const params = new URLSearchParams({
        name,
        count: "100", // Get more results to ensure Nigerian matches
        language: "en",
        format: "json"
    });

    const data = await getJson(`${GEOCODING_URL}?${params}`);
    
    console.log("🔍 Geocoding API response for '" + name + "':", data);
    
    if (!data.results || data.results.length === 0) {
        throw new CityNotFoundError(name);
    }

    // Map all results
    const mapped = data.results.map(match => ({
        name: match.name,
        country: match.country ?? "",
        admin1: match.admin1 ?? "",
        latitude: match.latitude,
        longitude: match.longitude,
        featureCode: match.feature_code ?? ""
    }));

    const searchLower = name.toLowerCase().trim();
    
    // Nigerian states list for smart matching
    const nigerianStates = [
        "abia", "adamawa", "akwa ibom", "anambra", "bauchi", "bayelsa", "benue", 
        "borno", "cross river", "delta", "ebonyi", "edo", "ekiti", "enugu", "gombe",
        "imo", "jigawa", "kaduna", "kano", "katsina", "kebbi", "kogi", "kwara",
        "lagos", "nasarawa", "niger", "ogun", "ondo", "osun", "oyo", "plateau",
        "rivers", "sokoto", "taraba", "yobe", "zamfara", "fct"
    ];
    
    const isStateName = nigerianStates.includes(searchLower);
    
    // Filter and rank with INTELLIGENT state matching
    return mapped
        .filter(location => {
            const isNigeria = location.country.toLowerCase() === "nigeria";
            const nameLower = location.name.toLowerCase();
            const admin1Lower = location.admin1.toLowerCase();
            
            // If searching for a Nigerian state name
            if (isStateName && isNigeria) {
                // ONLY show if:
                // 1. The location name matches the state (e.g., "Ogun" = "Ogun State")
                // 2. OR the admin1 field contains the state name (e.g., admin1="Ogun State")
                const nameMatchesState = nameLower === searchLower || nameLower.includes(searchLower + " state");
                const admin1MatchesState = admin1Lower.includes(searchLower);
                return nameMatchesState || admin1MatchesState;
            }
            
            // Always include other Nigerian locations if not searching for a state
            if (isNigeria) return true;
            
            // For non-Nigerian: only include if exact name match
            return nameLower === searchLower;
        })
        .sort((a, b) => {
            const aIsNigeria = a.country.toLowerCase() === "nigeria";
            const bIsNigeria = b.country.toLowerCase() === "nigeria";
            
            // 1. NIGERIA FIRST - always
            if (aIsNigeria && !bIsNigeria) return -1;
            if (!aIsNigeria && bIsNigeria) return 1;
            
            // 2. For Nigerian results: exact name match first
            const aNameMatch = a.name.toLowerCase() === searchLower;
            const bNameMatch = b.name.toLowerCase() === searchLower;
            
            if (aNameMatch && !bNameMatch) return -1;
            if (!aNameMatch && bNameMatch) return 1;
            
            // 3. State-level (ADM1) before cities
            const aIsState = a.featureCode === "ADM1";
            const bIsState = b.featureCode === "ADM1";
            
            if (aIsState && !bIsState) return -1;
            if (!aIsState && bIsState) return 1;
            
            // 4. Capitals and major cities
            const aIsCapital = a.featureCode.startsWith("PPLC") || a.featureCode === "PPLA";
            const bIsCapital = b.featureCode.startsWith("PPLC") || b.featureCode === "PPLA";
            
            if (aIsCapital && !bIsCapital) return -1;
            if (!aIsCapital && bIsCapital) return 1;
            
            return 0;
        })
        .slice(0, 15); // Top 15 after filtering
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