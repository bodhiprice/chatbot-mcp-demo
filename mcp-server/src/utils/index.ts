const NWS_API_BASE = 'https://api.weather.gov';
const USER_AGENT = 'weather-app/1.0';

async function makeNWSRequest<T>(url: string): Promise<T | null> {
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'application/geo+json',
  };

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error('Error making NWS request:', error);
    return null;
  }
}

interface AlertFeature {
  properties: {
    event?: string;
    areaDesc?: string;
    severity?: string;
    status?: string;
    headline?: string;
  };
}

function formatAlert(feature: AlertFeature): string {
  const props = feature.properties;
  return [
    `Event: ${props.event || 'Unknown'}`,
    `Area: ${props.areaDesc || 'Unknown'}`,
    `Severity: ${props.severity || 'Unknown'}`,
    `Status: ${props.status || 'Unknown'}`,
    `Headline: ${props.headline || 'No headline'}`,
    '---',
  ].join('\n');
}

interface ForecastPeriod {
  name?: string;
  temperature?: number;
  temperatureUnit?: string;
  windSpeed?: string;
  windDirection?: string;
  shortForecast?: string;
}

interface AlertsResponse {
  features: AlertFeature[];
}

interface PointsResponse {
  properties: {
    forecast?: string;
  };
}

interface ForecastResponse {
  properties: {
    periods: ForecastPeriod[];
  };
}

export async function handleGetCurrentWeather(args: Record<string, unknown>): Promise<string> {
  const { location } = args;
  if (typeof location !== 'string') {
    return 'Error: Location must be a string';
  }

  const coordMatch = location.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
  if (!coordMatch) {
    return "Error: Location must be in lat,lon format (e.g., '40.7128,-74.0060')";
  }

  const lat = parseFloat(coordMatch[1]);
  const lon = parseFloat(coordMatch[2]);

  const pointsUrl = `${NWS_API_BASE}/points/${lat},${lon}`;
  const pointsData = await makeNWSRequest<PointsResponse>(pointsUrl);

  if (!pointsData?.properties?.forecast) {
    return 'Error: Unable to get forecast data for this location';
  }

  const forecastData = await makeNWSRequest<ForecastResponse>(pointsData.properties.forecast);

  if (!forecastData?.properties?.periods?.length) {
    return 'Error: No forecast data available';
  }

  const current = forecastData.properties.periods[0];

  return [
    `Current conditions for ${lat},${lon}:`,
    `${current.name || 'Now'}: ${current.temperature || 'Unknown'}°${current.temperatureUnit || 'F'}`,
    `Wind: ${current.windSpeed || 'Unknown'} ${current.windDirection || ''}`,
    `Conditions: ${current.shortForecast || 'Unknown'}`,
  ].join('\n');
}

export async function handleGetWeatherForecast(args: Record<string, unknown>): Promise<string> {
  const { location, days = 5 } = args;
  if (typeof location !== 'string') {
    return 'Error: Location must be a string';
  }
  if (typeof days !== 'number' || days < 1 || days > 7) {
    return 'Error: Days must be a number between 1 and 7';
  }

  const coordMatch = location.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
  if (!coordMatch) {
    return "Error: Location must be in lat,lon format (e.g., '40.7128,-74.0060')";
  }

  const lat = parseFloat(coordMatch[1]);
  const lon = parseFloat(coordMatch[2]);

  const pointsUrl = `${NWS_API_BASE}/points/${lat},${lon}`;
  const pointsData = await makeNWSRequest<PointsResponse>(pointsUrl);

  if (!pointsData?.properties?.forecast) {
    return 'Error: Unable to get forecast data for this location';
  }

  const forecastData = await makeNWSRequest<ForecastResponse>(pointsData.properties.forecast);

  if (!forecastData?.properties?.periods?.length) {
    return 'Error: No forecast data available';
  }

  const periods = forecastData.properties.periods.slice(0, days * 2);
  const forecastText = periods
    .map(
      (period) =>
        `${period.name || 'Unknown'}: ${period.temperature || 'Unknown'}°${period.temperatureUnit || 'F'}, ${period.shortForecast || 'Unknown'}`
    )
    .join('\n');

  return `${days}-day forecast for ${lat},${lon}:\n${forecastText}`;
}

export async function handleGetWeatherAlerts(args: Record<string, unknown>): Promise<string> {
  const { location } = args;
  if (typeof location !== 'string') {
    return 'Error: Location must be a string';
  }

  const coordMatch = location.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
  if (!coordMatch) {
    return "Error: Location must be in lat,lon format (e.g., '40.7128,-74.0060')";
  }

  const lat = parseFloat(coordMatch[1]);
  const lon = parseFloat(coordMatch[2]);

  const alertsUrl = `${NWS_API_BASE}/alerts/active?point=${lat},${lon}`;
  const alertsData = await makeNWSRequest<AlertsResponse>(alertsUrl);

  if (!alertsData?.features?.length) {
    return `No active weather alerts for ${lat},${lon}`;
  }

  const alertsText = alertsData.features.map(formatAlert).join('\n');
  return `Active weather alerts for ${lat},${lon}:\n\n${alertsText}`;
}
