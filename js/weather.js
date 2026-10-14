// weather.js
// Turns raw Open-Meteo data into clean data the UI can use.
// Rules: no DOM access and no network requests in this file.
//
// Clean data shape used everywhere in the app (temperatures always in °C):
// {
//   timezone, utcOffsetSeconds:  the searched city's time zone (for its live clock)
//   location:   { name, country, latitude, longitude },
//   current:    { time, temperature, feelsLike, humidity, dewPoint, pressure,
//                 windSpeed, windDirection, visibility, weatherCode, isDay },
//   today:      { tempMax, tempMin, sunrise, sunset, uvIndexMax },
//   windSeries: [ wind speed for the next 24 hours, km/h ],
//   rainSeries: [ { time, value } ]   // chance of rain (%) for the next 6 hours
//   hourlyToday:    [ slot ]          // 5 slots, 3 hours apart, starting now
//   hourlyTomorrow: [ slot ]          // 5 slots, 3 hours apart, starting 6 AM
//   daily:      [ { date, weatherCode, tempMax, tempMin } ]   // next 5 days
// }
// slot = { time, temperature, weatherCode, isDay, rainChance }

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

/**
 * The temperature as the API reports it, with one decimal ("26.4°").
 * (formatTemp above rounds to a whole degree, which is what the small cards use.)
 */
export function formatTempExact(celsius, unit) {
    if (!Number.isFinite(celsius)) return "--";

    const value = unit === "fahrenheit" ? (celsius * 9) / 5 + 32 : celsius;
    const text = value.toFixed(1);
    return `${text === "-0.0" ? "0.0" : text}°`;
}

/**
 * What the clock on the wall reads right now in the searched city.
 * Uses the city's time zone name; falls back to its UTC offset; returns null if neither is known.
 * @returns { day: "Thursday", time: "10:58 PM" } | null
 */
export function getLocalNow({ timezone, utcOffsetSeconds } = {}, nowMs = Date.now()) {
    const read = (zone, instant) => {
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: zone,
            weekday: "long",
            hour: "numeric",
            minute: "numeric",
            hourCycle: "h23"
        }).formatToParts(instant);

        const get = (type) => parts.find((part) => part.type === type)?.value;
        const hours = Number(get("hour"));
        const minutes = Number(get("minute"));

        return {
            day: get("weekday"),
            time: `${((hours + 11) % 12) + 1}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`
        };
    };

    if (timezone) {
        try {
            return read(timezone, new Date(nowMs));
        } catch {
            // unknown time zone name: use the offset below
        }
    }

    if (Number.isFinite(utcOffsetSeconds)) {
        return read("UTC", new Date(nowMs + utcOffsetSeconds * 1000));
    }

    return null;
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
    const [datePart] = String(isoLocal).split("T");
    const [year, month, dayOfMonth] = datePart.split("-").map(Number);

    const day = new Date(Date.UTC(year, month - 1, dayOfMonth)).toLocaleDateString("en-US", {
        weekday: "long",
        timeZone: "UTC"
    });

    return { day, time: formatClockTime(isoLocal) };
}

/** "2026-10-08T05:30" -> "5:30 AM" (local time at the searched city). "--" if missing. */
export function formatClockTime(isoLocal) {
    const timePart = String(isoLocal ?? "").split("T")[1];
    if (!timePart) return "--";

    const [hours, minutes] = timePart.split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return "--";

    const hour12 = ((hours + 11) % 12) + 1;
    const suffix = hours >= 12 ? "PM" : "AM";
    return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function formatPressure(hpa) {
    if (!Number.isFinite(hpa)) return "--";
    return `${Math.round(hpa)} hPa`;
}

/** Degrees -> "N", "NE", "E", ... (8 compass points). "" if unknown. */
export function getCompassDirection(degrees) {
    if (!Number.isFinite(degrees)) return "";
    const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const normalised = ((degrees % 360) + 360) % 360;
    return points[Math.round(normalised / 45) % 8];
}

/** UV index -> WHO category name. */
export function describeUv(index) {
    if (!Number.isFinite(index)) return "";
    if (index < 3) return "Low";
    if (index < 6) return "Moderate";
    if (index < 8) return "High";
    if (index < 11) return "Very high";
    return "Extreme";
}

/** How full the UV gauge is, 0-100. The gauge is full at UV 12. */
export function uvGaugePercent(index) {
    if (!Number.isFinite(index)) return 0;
    return Math.min(Math.max(index, 0) / 12, 1) * 100;
}

/** Visibility in metres -> kilometres as text without the unit: "10" or "4.2". */
export function visibilityKm(meters) {
    if (!Number.isFinite(meters)) return "--";
    const km = meters / 1000;
    return km >= 10 ? String(Math.round(km)) : km.toFixed(1);
}

/** Plain-language label. These thresholds are this app's own choice, not an official scale. */
export function describeVisibility(meters) {
    if (!Number.isFinite(meters)) return "";
    const km = meters / 1000;
    if (km >= 10) return "Excellent";
    if (km >= 5) return "Good";
    if (km >= 2) return "Moderate";
    if (km >= 1) return "Poor";
    return "Very poor";
}

/** Values -> bar heights in percent (tallest = 100). Never below minPercent so every bar stays visible. */
export function getBarHeights(values, minPercent = 12) {
    if (!values.length) return [];
    const max = Math.max(...values, 1); // at least 1, so a calm day doesn't divide by zero
    return values.map((v) => Math.max(minPercent, Math.round((v / max) * 100)));
}

/** "2026-10-10" -> "Sat" */
export function formatShortDay(isoDate) {
    const [year, month, dayOfMonth] = String(isoDate).split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, dayOfMonth)).toLocaleDateString("en-US", {
        weekday: "short",
        timeZone: "UTC"
    });
}


/** "2026-10-08T15:00" -> "3 PM" (compact: "3PM"). "--" if the time is missing. */
export function formatHourLabel(isoLocal, compact = false) {
    const timePart = String(isoLocal ?? "").split("T")[1];
    if (!timePart) return "--";

    const hours = Number(timePart.split(":")[0]);
    if (!Number.isFinite(hours)) return "--";

    return `${((hours + 11) % 12) + 1}${compact ? "" : " "}${hours >= 12 ? "PM" : "AM"}`;
}


// =========================
// Chance-of-rain chart (pure geometry; ui.js draws it)
// =========================

/**
 * Points -> a smooth SVG path ("M x y C ..."). Control points are kept between
 * minY and maxY so the curve never leaves the chart.
 */
export function smoothPath(points, minY = -Infinity, maxY = Infinity) {
    if (points.length < 2) return "";

    const clamp = (y) => Math.min(Math.max(y, minY), maxY);
    const round = (n) => Math.round(n * 100) / 100;
    let d = `M ${round(points[0].x)} ${round(points[0].y)}`;

    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] ?? points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] ?? p2;

        const c1x = p1.x + (p2.x - p0.x) / 6;
        const c1y = clamp(p1.y + (p2.y - p0.y) / 6);
        const c2x = p2.x - (p3.x - p1.x) / 6;
        const c2y = clamp(p2.y - (p3.y - p1.y) / 6);

        d += ` C ${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${round(p2.x)} ${round(p2.y)}`;
    }

    return d;
}

/**
 * series: [ { time, value } ] where value is a chance of rain in percent (or null).
 * Returns everything needed to draw the chart: grid lines, points, and the curve.
 */
export function buildRainChart(series, { width = 240, height = 150 } = {}) {
    const pad = { left: 36, right: 10, top: 12, bottom: 24 };
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const yFor = (percent) => pad.top + plotHeight * (1 - Math.min(Math.max(percent, 0), 100) / 100);

    const points = series.map((item, i) => ({
        x: pad.left + (plotWidth * (i + 0.5)) / series.length,
        y: Number.isFinite(item.value) ? yFor(item.value) : null,
        value: Number.isFinite(item.value) ? item.value : null,
        label: formatHourLabel(item.time, true)
    }));

    return {
        width,
        height,
        left: pad.left,
        right: width - pad.right,
        baseline: yFor(0),
        grid: [100, 50, 0].map((value) => ({ value, y: yFor(value), label: `${value}%` })),
        points,
        path: smoothPath(points.filter((p) => p.y !== null), pad.top, pad.top + plotHeight)
    };
}


// =========================
// Other cities (recent searches with live conditions)
// =========================

/**
 * The API returns one object for a single location, or a list for several.
 * Returns one entry per requested city: { temperature, weatherCode, isDay } or null.
 */
export function parseOtherCities(raw, expected) {
    const items = Array.isArray(raw) ? raw : [raw];

    return Array.from({ length: expected }, (_, i) => {
        const current = items[i]?.current;
        if (!current) return null;
        return {
            temperature: current.temperature_2m,
            weatherCode: current.weather_code,
            isDay: current.is_day
        };
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

    // ---- Hourly data: wind bars, chance of rain, and the Today / Tomorrow tabs ----
    const hourly = raw.hourly ?? {};
    const hourTimes = Array.isArray(hourly.time) ? hourly.time.map(String) : [];
    const thisHour = String(current.time).slice(0, 13);                  // "2026-10-08T12"
    const nowIndex = hourTimes.findIndex((t) => t.slice(0, 13) === thisHour);

    const slotAt = (i) => ({
        time: hourTimes[i],
        temperature: hourly.temperature_2m?.[i],
        weatherCode: hourly.weather_code?.[i],
        isDay: hourly.is_day?.[i],
        rainChance: hourly.precipitation_probability?.[i]
    });

    // count slots, `step` hours apart, starting at hour-index `start`
    const slotsFrom = (start, count, step) => {
        const out = [];
        if (start < 0) return out;
        for (let k = 0; k < count; k++) {
            const i = start + k * step;
            if (i >= hourTimes.length) break;
            out.push(slotAt(i));
        }
        return out;
    };

    const tomorrow = allDays[1]?.date;
    const tomorrowStart = tomorrow ? hourTimes.indexOf(`${tomorrow}T06:00`) : -1;

    const windSeries = nowIndex >= 0 && Array.isArray(hourly.wind_speed_10m)
        ? hourly.wind_speed_10m.slice(nowIndex, nowIndex + 24).map((v) => (Number.isFinite(v) ? v : 0))
        : [];

    const rainSeries = slotsFrom(nowIndex, 6, 1).map((slot) => ({ time: slot.time, value: slot.rainChance }));

    return {
        timezone: typeof raw.timezone === "string" ? raw.timezone : null,
        utcOffsetSeconds: Number.isFinite(raw.utc_offset_seconds) ? raw.utc_offset_seconds : null,
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
            dewPoint: current.dew_point_2m,
            pressure: current.pressure_msl,
            windSpeed: current.wind_speed_10m,
            windDirection: current.wind_direction_10m,
            visibility: current.visibility,
            weatherCode: current.weather_code,
            isDay: current.is_day
        },
        today: {
            tempMax: allDays[0]?.tempMax,
            tempMin: allDays[0]?.tempMin,
            sunrise: daily.sunrise?.[0] ?? null,
            sunset: daily.sunset?.[0] ?? null,
            uvIndexMax: daily.uv_index_max?.[0] ?? null
        },
        windSeries,
        rainSeries,
        hourlyToday: slotsFrom(nowIndex, 5, 3),
        hourlyTomorrow: slotsFrom(tomorrowStart, 5, 3),
        // The first entry is today (shown in the big card), so the cards show the next 5 days.
        daily: allDays.slice(1, 6)
    };
}