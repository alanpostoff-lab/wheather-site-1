
import { useState, useEffect } from "react";
import "./App.css";

const API_KEY = import.meta.env.VITE_WEATHER_API_KEY;
const BASE_URL = "https://api.openweathermap.org/data/2.5";
const GEO_URL = "https://api.openweathermap.org/geo/1.0";

function App() {
  const [city, setCity] = useState("");
  const [weather, setWeather] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [recent, setRecent] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("recentCities")) || [];
    } catch {
      return [];
    }
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState("default");

  // Save recent searches
  useEffect(() => {
    localStorage.setItem("recentCities", JSON.stringify(recent));
  }, [recent]);

  // Autocomplete location suggestions
  useEffect(() => {
    if (city.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `${GEO_URL}/direct?q=${encodeURIComponent(city)}&limit=5&appid=${API_KEY}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          setSuggestions([]);
          return;
        }

        const data = await response.json();
        setSuggestions(data);
      } catch (err) {
        if (err.name !== "AbortError") {
          setSuggestions([]);
        }
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [city]);

  // Dynamic weather background
  const getTheme = (condition, icon) => {
    const type = condition?.toLowerCase() || "";

    if (type.includes("thunder")) return "thunder";
    if (type.includes("rain") || type.includes("drizzle"))
      return "rainy";
    if (type.includes("snow")) return "snowy";
    if (type.includes("cloud")) return "cloudy";
    if (
      type.includes("mist") ||
      type.includes("fog") ||
      type.includes("haze")
    ) return "misty";

    return icon?.endsWith("n") ? "night" : "sunny";
  };

  // Format sunrise and sunset in the city's local time
  const formatTime = (timestamp, timezone) => {
    const date = new Date((timestamp + timezone) * 1000);

    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC"
    });
  };

  // Prepare five-day forecast
  const getFiveDayForecast = (list, timezone) => {
    const days = {};

    list.forEach((item) => {
      const date = new Date((item.dt + timezone) * 1000);
      const key = date.toISOString().split("T")[0];

      if (!days[key]) days[key] = [];
      days[key].push(item);
    });

    return Object.values(days).slice(0, 5).map((items) => {
      const selected = items.reduce((best, item) => {
        const hour = new Date(
          (item.dt + timezone) * 1000
        ).getUTCHours();

        const bestHour = new Date(
          (best.dt + timezone) * 1000
        ).getUTCHours();

        return Math.abs(hour - 12) < Math.abs(bestHour - 12)
          ? item
          : best;
      });

      const date = new Date((selected.dt + timezone) * 1000);

      return {
        day: date.toLocaleDateString("en-IN", {
          weekday: "short",
          timeZone: "UTC"
        }),
        temp: Math.round(selected.main.temp),
        description: selected.weather[0].description,
        icon: selected.weather[0].icon
      };
    });
  };

  // Fetch weather using exact coordinates
  const fetchWeather = async (location) => {
    if (!API_KEY) {
      setError("API key missing. Please check your .env file.");
      return;
    }

    setLoading(true);
    setError("");
    setSuggestions([]);

    try {
      const query = `lat=${location.lat}&lon=${location.lon}`;

      const [weatherResponse, forecastResponse] =
        await Promise.all([
          fetch(
            `${BASE_URL}/weather?${query}&appid=${API_KEY}&units=metric`
          ),
          fetch(
            `${BASE_URL}/forecast?${query}&appid=${API_KEY}&units=metric`
          )
        ]);

      if (!weatherResponse.ok || !forecastResponse.ok) {
        throw new Error(
          "Unable to get weather. Check your API key or try again."
        );
      }

      const currentData = await weatherResponse.json();
      const forecastData = await forecastResponse.json();

      setWeather(currentData);

      setForecast(
        getFiveDayForecast(
          forecastData.list,
          currentData.timezone
        )
      );

      setTheme(
        getTheme(
          currentData.weather[0].main,
          currentData.weather[0].icon
        )
      );

      setCity(currentData.name);

      setRecent((previous) => [
        currentData.name,
        ...previous.filter(
          (item) =>
            item.toLowerCase() !== currentData.name.toLowerCase()
        )
      ].slice(0, 5));

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Select location from autocomplete suggestions
  const selectLocation = (place) => {
    setCity(place.name);
    setSuggestions([]);

    fetchWeather({
      lat: place.lat,
      lon: place.lon
    });
  };

  // Search city
  const searchCity = () => {
    if (!city.trim()) {
      setError("Please enter a city name.");
      return;
    }

    if (suggestions.length > 0) {
      selectLocation(suggestions[0]);
      return;
    }

    setError("Please select a location from the suggestions.");
  };

  // Current GPS location
  const getLocationWeather = () => {
    if (!navigator.geolocation) {
      setError("Location is not supported by your browser.");
      return;
    }

    setLoading(true);
    setError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        fetchWeather({
          lat: position.coords.latitude,
          lon: position.coords.longitude
        });
      },
      () => {
        setLoading(false);
        setError(
          "Location permission denied. Please allow location access."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000
      }
    );
  };

  // Search recent city using geocoding
  const searchRecent = async (name) => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `${GEO_URL}/direct?q=${encodeURIComponent(name)}&limit=5&appid=${API_KEY}`
      );

      if (!response.ok) {
        throw new Error("Unable to find this location.");
      }

      const places = await response.json();

      if (places.length === 0) {
        throw new Error("Location not found.");
      }

      const place = places[0];

      fetchWeather({
        lat: place.lat,
        lon: place.lon
      });

    } catch (err) {
      setLoading(false);
      setError(err.message);
    }
  };

  return (
    <main className={`app-shell ${theme}`}>
      <div className="container">

        {/* Header */}
        <header className="header">
          <h1>☁️ Weather Today</h1>
          <p>Your Personal Weather Dashboard</p>
        </header>

        {/* Search and suggestions */}
        <div className="search-area">

          <div className="search">
            <input
              type="text"
              placeholder="Search city, state or country..."
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") searchCity();
                if (e.key === "Escape") setSuggestions([]);
              }}
            />

            <button onClick={searchCity}>
              Search
            </button>
          </div>

          {suggestions.length > 0 && (
            <div className="suggestions">

              <p className="suggestion-heading">
                Suggested Locations
              </p>

              {suggestions.map((place, index) => (
                <button
                  className="suggestion-item"
                  key={`${place.lat}-${place.lon}-${index}`}
                  onClick={() => selectLocation(place)}
                >
                  <span>📍</span>

                  <span className="suggestion-details">
                    <strong>{place.name}</strong>
                    <small>
                      {[place.state, place.country]
                        .filter(Boolean)
                        .join(", ")}
                    </small>
                  </span>
                </button>
              ))}

            </div>
          )}

        </div>

        {/* Current location */}
        <button
          className="location-btn"
          onClick={getLocationWeather}
        >
          📍 Use My Current Location
        </button>

        {loading && (
          <p className="status">Loading weather...</p>
        )}

        {error && (
          <p className="error">{error}</p>
        )}

        {/* Current weather */}
        {weather && (
          <>
            <section className="weather-card">

              <h2>
                {weather.name}, {weather.sys.country}
              </h2>

              <p className="date">Current Weather</p>

              <img
                src={`https://openweathermap.org/img/wn/${weather.weather[0].icon}@4x.png`}
                alt={weather.weather[0].description}
              />

              <h1 className="temperature">
                {Math.round(weather.main.temp)}°C
              </h1>

              <h3 className="description">
                {weather.weather[0].description}
              </h3>

              <div className="details">

                <div className="detail-card">
                  <span>💧</span>
                  <p>Humidity</p>
                  <h3>{weather.main.humidity}%</h3>
                </div>

                <div className="detail-card">
                  <span>💨</span>
                  <p>Wind Speed</p>
                  <h3>{weather.wind.speed} m/s</h3>
                </div>

                <div className="detail-card">
                  <span>🌡️</span>
                  <p>Feels Like</p>
                  <h3>
                    {Math.round(weather.main.feels_like)}°C
                  </h3>
                </div>

              </div>

              {/* Sunrise and sunset */}
              <div className="sun-section">

                <div className="sun-card">
                  <span>🌅</span>
                  <p>Sunrise</p>
                  <h3>
                    {formatTime(
                      weather.sys.sunrise,
                      weather.timezone
                    )}
                  </h3>
                </div>

                <div className="sun-card">
                  <span>🌇</span>
                  <p>Sunset</p>
                  <h3>
                    {formatTime(
                      weather.sys.sunset,
                      weather.timezone
                    )}
                  </h3>
                </div>

              </div>

            </section>

            {/* Five-day forecast */}
            <section className="forecast-section">

              <h2>📅 5-Day Weather Forecast</h2>

              <div className="forecast-grid">

                {forecast.map((day, index) => (
                  <div className="forecast-card" key={index}>

                    <h3>{day.day}</h3>

                    <img
                      src={`https://openweathermap.org/img/wn/${day.icon}@2x.png`}
                      alt={day.description}
                    />

                    <h2>{day.temp}°C</h2>

                    <p>{day.description}</p>

                  </div>
                ))}

              </div>

            </section>
          </>
        )}

        {/* Recent searches */}
        {recent.length > 0 && (
          <section className="recent-section">

            <div className="recent-heading">
              <h2>🕘 Recent Searches</h2>

              <button
                className="clear-btn"
                onClick={() => setRecent([])}
              >
                Clear
              </button>
            </div>

            <div className="recent-list">

              {recent.map((item, index) => (
                <button
                  className="recent-city"
                  key={index}
                  onClick={() => searchRecent(item)}
                >
                  📍 {item}
                </button>
              ))}

            </div>

          </section>
        )}

        <footer>
          <p>Weather data powered by OpenWeather</p>
        </footer>

      </div>
    </main>
  );
}

export default App;
