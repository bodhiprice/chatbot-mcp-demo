# Weather MCP Server

MCP (Model Context Protocol) server providing weather data access via National Weather Service API.

## Features

- **Current Weather**: Real-time weather conditions for coordinate locations
- **Weather Forecast**: Multi-day forecasts (1-7 days) with detailed periods  
- **Weather Alerts**: Active weather warnings and alerts
- **Coordinate Input**: Requires latitude,longitude coordinates
- **No API Keys Required**: Uses free National Weather Service API

## Tools Available

### get_current_weather
Get current weather conditions for a specified coordinate location.

**Input**: `{ location: string }`
**Example**: `{ "location": "41.8781,-87.6298" }`

### get_weather_forecast  
Get weather forecast for a specified coordinate location.

**Input**: `{ location: string, days?: number }`
**Example**: `{ "location": "40.7128,-74.0060", "days": 3 }`

### get_weather_alerts
Get active weather alerts and warnings for a specified coordinate location.

**Input**: `{ location: string }`
**Example**: `{ "location": "25.7617,-80.1918" }`

## Location Format

All tools require coordinates in latitude,longitude format:
- **Format**: "latitude,longitude"  
- **Example**: "40.7128,-74.0060" (New York City)
- **Example**: "34.0522,-118.2437" (Los Angeles)

The National Weather Service API requires precise coordinates to determine the appropriate weather office and grid points for accurate forecasts.

## Development

```bash
npm run dev     # Start development server
npm run build   # Build for production
npm run start   # Start production server
npm run test    # Run tests
npm run lint    # Lint code
```

## Environment Variables

```
PORT=3000
NODE_ENV=development
```

## API Response Format

All tools return JSON responses with consistent structure:
- Success responses include location, coordinates, and relevant weather data
- Error responses include error message and original location
- All responses include source attribution to National Weather Service