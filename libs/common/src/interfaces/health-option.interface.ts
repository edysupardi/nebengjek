export interface HealthOptions {
  serviceName: string;
  additionalChecks: Record<string, () => Promise<boolean>>;
}