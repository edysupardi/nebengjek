import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TripService } from '../trip/trip.service';
import { LocationService } from '../location/location.service';

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private tripService: TripService,
    private locationService: LocationService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async recoverIncompleteTrips() {
    this.logger.log('Starting incomplete trips recovery...');
    try {
      const result = await this.tripService.recoverIncompleteTrips();
      this.logger.log(`Recovery completed: ${JSON.stringify(result)}`);
    } catch (error) {
      this.logger.error('Failed to recover incomplete trips:', error);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldLocationData() {
    this.logger.log('Starting old location data cleanup...');
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // This method would need to be implemented in LocationService
      // const result = await this.locationService.deleteOldLocations(thirtyDaysAgo);
      // this.logger.log(`Cleanup completed: ${result} records deleted`);
    } catch (error) {
      this.logger.error('Failed to cleanup old location data:', error);
    }
  }
}