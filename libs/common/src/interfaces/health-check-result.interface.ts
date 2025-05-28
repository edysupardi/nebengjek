export interface HealthCheckResult {
  status: 'up' | 'down';
  error?: string;
}