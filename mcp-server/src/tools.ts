import { z } from 'zod';
import { handleGetCurrentWeather, handleGetWeatherForecast, handleGetWeatherAlerts } from './utils/index.js';

export interface Tool {
  name: string;
  description: string;
  enabled: boolean;
  inputSchema: z.ZodObject<Record<string, z.ZodTypeAny>>;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

export const tools: Tool[] = [
  {
    name: 'get_current_weather',
    description: 'Get current weather conditions for a specified location using National Weather Service data',
    enabled: true,
    inputSchema: z.object({
      location: z.string().describe('Location coordinates in lat,lon format (e.g., "40.7128,-74.0060")'),
    }),
    handler: handleGetCurrentWeather,
  },
  {
    name: 'get_weather_forecast',
    description: 'Get weather forecast for a specified location using National Weather Service data',
    enabled: true,
    inputSchema: z.object({
      location: z.string().describe('Location coordinates in lat,lon format (e.g., "40.7128,-74.0060")'),
      days: z.number().min(1).max(7).optional().describe('Number of forecast days (1-7, default: 5)'),
    }),
    handler: handleGetWeatherForecast,
  },
  {
    name: 'get_weather_alerts',
    description: 'Get active weather alerts and warnings for a specified location using National Weather Service data',
    enabled: true,
    inputSchema: z.object({
      location: z.string().describe('Location coordinates in lat,lon format (e.g., "40.7128,-74.0060")'),
    }),
    handler: handleGetWeatherAlerts,
  },
];
