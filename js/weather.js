// weather.js
// Turns raw Open-Meteo data into clean data the UI can use.
// Rules: no DOM access and no network requests in this file.
//
// Clean data shape used everywhere in the app (temperatures always in °C):
// {
//   location: { name, country, latitude, longitude },
//   current:  { time, temperature, feelsLike, humidity, windSpeed, weatherCode, isDay },
//   daily:    [ { date, weatherCode, tempMax, tempMin } ]   // next 5 days
// }

// WMO weather code -> text. List copied from the Open-Meteo docs.
const WEATHER_LABELS = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snowfall",
    73: "Moderate snowfall",
    75: "Heavy snowfall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    97: "Heavy thunderstorm",
    99: "Thunderstorm with heavy hail"
};

export function getWeatherLabel(code) {
    return WEATHER_LABELS[code] ?? "Unknown conditions";
}

/**
 * Picks an icon file name (in assets/icons/) and a page theme for a weather code.
 * Themes match the body[data-theme="..."] rules in style.css:
 * clear | cloudy | rain | snow | storm
 */
export function getWeatherVisual(code, isDay = 1) {
    const day = Boolean(isDay);

    if (code === 0 || code === 1) {
        return { icon: day ? "clear-day" : "clear-night", theme: "clear" };
    }
    if (code === 2) {
        return { icon: day ? "partly-cloudy-day" : "partly-cloudy-night", theme: "cloudy" };
    }
    if (code === 3) {
        return { icon: "overcast", theme: "cloudy" };
    }
    if (code === 45 || code === 48) {
        return { icon: "fog", theme: "cloudy" };
    }
    if (code >= 51 && code <= 57) {
        return { icon: "drizzle", theme: "rain" };
    }
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
        return { icon: "rain", theme: "rain" };
    }
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
        return { icon: "snow", theme: "snow" };
    }
    if (code >= 95 && code <= 99) {
        return { icon: "thunderstorms", theme: "storm" };
    }

    return { icon: "overcast", theme: "cloudy" };
}


// =========================
// Formatting
// =========================

/** Converts a °C value to the chosen unit ("celsius" or "fahrenheit") and rounds it. */
export function toDisplayTemp(celsius, unit) {
    const value = unit === "fahrenheit" ? (celsius * 9) / 5 + 32 : celsius;
    return Math.round(value);
}

export function formatTemp(celsius, unit) {
    if (!Number.isFinite(celsius)) return "--";
    return `${toDisplayTemp(celsius, unit)}°`;
}

export function formatWind(kmh) {
    if (!Number.isFinite(kmh)) return "--";
    return `${Math.round(kmh)} km/h`;
}

export function formatHumidity(percent) {
    if (!Number.isFinite(percent)) return "--";
    return `${Math.round(percent)}%`;
}

/**
 * "2026-10-08T11:45" (local time at the searched city) -> { day: "Thursday", time: "11:45 AM" }
 */
export function formatLocalDayTime(isoLocal) {
    const [datePart, timePart = "00:00"] = String(isoLocal).split("T");
    const [year, month, dayOfMonth] = datePart.split("-").map(Number);
    const [hours, minutes] = timePart.split(":").map(Number);

    const day = new Date(Date.UTC(year, month - 1, dayOfMonth)).toLocaleDateString("en-US", {
        weekday: "long",
        timeZone: "UTC"
    });

    const hour12 = ((hours + 11) % 12) + 1;
    const suffix = hours >= 12 ? "PM" : "AM";
    const time = `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;

    return { day, time };
}

/** "2026-10-10" -> "Sat" */
export function formatShortDay(isoDate) {
    const [year, month, dayOfMonth] = String(isoDate).split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, dayOfMonth)).toLocaleDateString("en-US", {
        weekday: "short",
        timeZone: "UTC"
    });
}


// =========================
// Raw API data -> clean data
// =========================

/**
 * @param location  { name, country, latitude, longitude } from searchCity()
 * @param raw       the JSON returned by fetchWeather()
 */
export function buildWeatherData(location, raw) {
    if (!raw || !raw.current || !raw.daily || !Array.isArray(raw.daily.time)) {
        throw new Error("Unexpected weather data format");
    }

    const { current, daily } = raw;

    const allDays = daily.time.map((date, i) => ({
        date,
        weatherCode: daily.weather_code[i],
        tempMax: daily.temperature_2m_max[i],
        tempMin: daily.temperature_2m_min[i]
    }));

    return {
        location: {
            name: location.name,
            country: location.country,
            latitude: location.latitude,
            longitude: location.longitude
        },
        current: {
            time: current.time,
            temperature: current.temperature_2m,
            feelsLike: current.apparent_temperature,
            humidity: current.relative_humidity_2m,
            windSpeed: current.wind_speed_10m,
            weatherCode: current.weather_code,
            isDay: current.is_day
        },
        // The first entry is today (shown in the big card), so the cards show the next 5 days.
        daily: allDays.slice(1, 6)
    };
}