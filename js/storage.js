// storage.js
// LocalStorage only. Rules: no API logic and no DOM access in this file.

const RECENT_KEY = "weathercast:recent";
const UNIT_KEY = "weathercast:unit";
const MODE_KEY = "weathercast:mode"; // plain text ("light"/"dark"); index.html reads this key before the page paints
const MAX_RECENT = 5;

// Storage can fail (private mode, blocked cookies, corrupted data),
// so every read/write is wrapped and falls back safely.

function readJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Ignore: the app still works, it just won't remember.
    }
}

// Same city = same name + country, ignoring upper/lower case.
function sameCity(a, b) {
    return (
        a.name.toLowerCase() === b.name.toLowerCase() &&
        (a.country ?? "").toLowerCase() === (b.country ?? "").toLowerCase()
    );
}


// =========================
// Recent searches
// =========================

/** Returns an array of { name, country, latitude, longitude }, newest first. */
export function getRecentSearches() {
    const list = readJson(RECENT_KEY, []);

    if (!Array.isArray(list)) return [];

    return list.filter(
        (item) =>
            item &&
            typeof item.name === "string" &&
            Number.isFinite(item.latitude) &&
            Number.isFinite(item.longitude)
    );
}

/** Saves a successful search: newest first, no duplicates, capped length. */
export function saveRecentSearch(location) {
    const entry = {
        name: location.name,
        country: location.country ?? "",
        latitude: location.latitude,
        longitude: location.longitude
    };

    const updated = [entry, ...getRecentSearches().filter((item) => !sameCity(item, entry))];

    writeJson(RECENT_KEY, updated.slice(0, MAX_RECENT));
}


// =========================
// Temperature unit
// =========================

/** Returns "celsius" (default) or "fahrenheit". */
export function getUnit() {
    const unit = readJson(UNIT_KEY, "celsius");
    return unit === "fahrenheit" ? "fahrenheit" : "celsius";
}

export function saveUnit(unit) {
    writeJson(UNIT_KEY, unit);
}


// =========================
// Light / dark mode
// =========================

/** Returns "dark" (default) or "light". */
export function getMode() {
    try {
        return localStorage.getItem(MODE_KEY) === "light" ? "light" : "dark";
    } catch {
        return "dark";
    }
}

export function saveMode(mode) {
    try {
        localStorage.setItem(MODE_KEY, mode);
    } catch {
        // Ignore: the app still works, it just won't remember.
    }
}