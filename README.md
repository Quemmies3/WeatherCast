# WeatherCast 🌤️

> 🚧 **Status: In Development**

A responsive weather dashboard providing real-time weather conditions and 5-day forecasts for locations worldwide.

## Tech Stack

- HTML5
- CSS3 (Responsive Grid)
- Vanilla JavaScript
- Fetch API & Async/Await
- Public Weather API

## Features

- 🔍 City search
- 🕒 Recent search history
- 🌡️ Current weather conditions
- 📅 5-day forecast
- 🎨 Dynamic weather-based visuals
- 🌡️ Celsius / Fahrenheit toggle
- 📱 Responsive design

## Project Structure

```text
WeatherCast/
├── assets/
├── css/
│   └── style.css
├── js/
│   ├── api.js
│   ├── app.js
│   ├── storage.js
│   ├── weather.js
│   └── ui.js
├── index.html
├── .gitignore
└── README.md
```

## Getting Started

Clone the repository:

```bash
git clone https://github.com/Quemmies3/WeatherCast.git
cd WeatherCast
```

Open `index.html` in your browser, or use a local development server such as VS Code Live Server.

> **Note:** API configuration will be added as the weather API integration is implemented. Never commit API keys or other sensitive credentials.

## Contributing

We welcome contributions from all team members.

### Branches

- `main` — stable, release-ready code
- `develop` — development and integration branch
- `feature/*` — individual feature development
- `fix/*` — bug fixes

### Workflow

1. Pull the latest changes from `develop`.
2. Create a branch for your work.
3. Make and test your changes.
4. Commit and push your branch.
5. Open a Pull Request into `develop`.
6. Have your changes reviewed before merging.
7. Once `develop` is stable, it will be merged into `main`.

### Branch Naming

Use descriptive feature branches:

```text
type/short-description

Examples:

```text
feature/city-search
fix/mobile-layout
style/weather-card
docs/update-readme
```

Common types:

- `feature/` — new functionality
- `fix/` — bug fixes
- `style/` — styling/UI changes
- `docs/` — documentation


## Architecture

The application is divided into separate responsibilities:

- `api.js` handles communication with the weather API.
- `weather.js` processes and normalizes weather-related data.
- `ui.js` renders data and controls the visual state of the dashboard.
- `storage.js` handles localStorage for recent searches and preferences.
- `app.js` coordinates user interactions and application flow.

API modules should not directly manipulate the DOM, and UI modules should not make API requests directly.


## Repository

https://github.com/Quemmies3/WeatherCast
