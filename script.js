document.addEventListener('DOMContentLoaded', () => {
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  const toggleUnitBtn = document.getElementById('toggle-unit-btn');
  const unitTargetLabel = document.getElementById('unit-target-label');
  
  const tempValue = document.getElementById('temperature-value');
  const unitSymbol = document.getElementById('unit-symbol');
  const weatherDesc = document.getElementById('weather-description');
  const cityName = document.getElementById('city-name');
  const forecastTemps = document.querySelectorAll('.forecast-temp');

  let currentUnit = 'C'; // 'C' or 'F'

  // Helper function to animate content changes without breaking layout/logic
  function animateValueUpdate(elements, updateCallback) {
    const list = Array.isArray(elements) || elements instanceof NodeList ? elements : [elements];
    
    // Step 1: Fade out
    list.forEach(el => el.classList.add('fade-out'));

    // Step 2: Swap content mid-transition and fade back in
    setTimeout(() => {
      updateCallback();
      list.forEach(el => el.classList.remove('fade-out'));
    }, 150); // Matches CSS transition speed
  }

  // Task: Smooth Celsius/Fahrenheit visual transitions
  toggleUnitBtn.addEventListener('click', () => {
    const targetUnit = currentUnit === 'C' ? 'F' : 'C';
    const fadeTargets = document.querySelectorAll('.fade-target');

    animateValueUpdate(fadeTargets, () => {
      if (targetUnit === 'F') {
        tempValue.textContent = '72';
        unitSymbol.textContent = '°F';
        unitTargetLabel.textContent = '°C';
        
        forecastTemps.forEach(el => {
          el.textContent = `${el.dataset.tempF}°F`;
        });

        currentUnit = 'F';
      } else {
        tempValue.textContent = '22';
        unitSymbol.textContent = '°C';
        unitTargetLabel.textContent = '°F';

        forecastTemps.forEach(el => {
          el.textContent = `${el.dataset.tempC}°C`;
        });

        currentUnit = 'C';
      }
    });
  });

  // Task: Subtle transitions when weather data is rendered
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = searchInput.value.trim();
    if (!query) return;

    const fadeTargets = document.querySelectorAll('.fade-target');

    animateValueUpdate(fadeTargets, () => {
      cityName.textContent = query.charAt(0).toUpperCase() + query.slice(1);
      
      // Example data change maintaining app logic without API modifications
      if (currentUnit === 'C') {
        tempValue.textContent = '19';
        weatherDesc.textContent = 'Scattered Clouds';
      } else {
        tempValue.textContent = '66';
        weatherDesc.textContent = 'Scattered Clouds';
      }
    });

    searchInput.value = '';
  });
});
