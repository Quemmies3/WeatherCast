// WeatherCast application logic

const searchForm = document.getElementById("search-form");
const cityInput = document.getElementById("city-input");
const errorMessage = document.getElementById("error");

const celsiusBtn = document.getElementById("celsius-btn");
const fahrenheitBtn = document.getElementById("fahrenheit-btn");

let currentUnit = "celsius";


// =========================
// City Search
// =========================

searchForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const city = cityInput.value.trim();

    if (!city) {
        errorMessage.textContent = "Please enter a city.";
        errorMessage.hidden = false;
        return;
    }

    errorMessage.hidden = true;

    console.log(`Searching for: ${city}`);
});


// =========================
// Temperature Unit Toggle
// =========================

celsiusBtn.addEventListener("click", () => {
    currentUnit = "celsius";

    celsiusBtn.classList.add("active");
    fahrenheitBtn.classList.remove("active");

    console.log("Temperature unit: Celsius");
});

fahrenheitBtn.addEventListener("click", () => {
    currentUnit = "fahrenheit";

    fahrenheitBtn.classList.add("active");
    celsiusBtn.classList.remove("active");

    console.log("Temperature unit: Fahrenheit");
});