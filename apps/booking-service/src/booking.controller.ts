import { BookingService } from '@app/booking/booking.service';
import { CreateBookingDto } from '@app/booking/dto/create-booking.dto';
import { UpdateBookingStatusDto } from '@app/booking/dto/update-booking-status.dto';
import { Roles, UserRole } from '@app/common';
import { CurrentUser } from '@app/common/decorators/current-user.decorator';
import { BookingStatus } from '@app/common/enums/booking-status.enum';
import { TrustedGatewayGuard } from '@app/common/guards/trusted-gateway.guard';
import { Body, Controller, Delete, Get, Logger, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';

@Controller('bookings')
export class BookingController {
  private readonly logger = new Logger(BookingController.name);
  // eslint-disable-next-line no-unused-vars
  constructor(private readonly bookingService: BookingService) {}

  @UseGuards(TrustedGatewayGuard)
  @Post()
  async createBooking(@CurrentUser() user: any, @Body() createBookingDto: CreateBookingDto) {
    this.logger.log(`Creating booking for user ${user.userId}`);
    return this.bookingService.createBooking(user.userId, createBookingDto);
  }

  @UseGuards(TrustedGatewayGuard)
  @Get(':bookingId')
  async getBookingDetails(@Param('bookingId') bookingId: string) {
    this.logger.log(`Fetching booking details for booking ID ${bookingId}`);
    return this.bookingService.getBookingDetails(bookingId);
  }

  @UseGuards(TrustedGatewayGuard)
  @Get()
  async getUserBookings(
    @CurrentUser() user: any,
    @Query('status') status?: BookingStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    this.logger.log(`Fetching bookings for user ${user.userId} with status ${status}`);
    return this.bookingService.getUserBookings(user.userId, status, page, limit);
  }

  @UseGuards(TrustedGatewayGuard)
  @Put(':bookingId/status')
  async updateBookingStatus(
    @CurrentUser() user: any,
    @Param('bookingId') bookingId: string,
    @Body() updateStatusDto: UpdateBookingStatusDto,
  ) {
    this.logger.log(`Updating booking status for booking ID ${bookingId} to ${updateStatusDto.status}`);
    return this.bookingService.updateBookingStatus(bookingId, user.userId, updateStatusDto.status);
  }

  @UseGuards(TrustedGatewayGuard)
  @Put(':bookingId/accept')
  @Roles(UserRole.DRIVER)
  async acceptBooking(@CurrentUser() user: any, @Param('bookingId') bookingId: string) {
    this.logger.log(`Accepting booking for booking ID ${bookingId} by driver ${user.userId}`);
    return this.bookingService.acceptBooking(bookingId, user.userId);
  }

  @UseGuards(TrustedGatewayGuard)
  @Put(':bookingId/reject')
  @Roles(UserRole.DRIVER)
  async rejectBooking(@CurrentUser() user: any, @Param('bookingId') bookingId: string) {
    this.logger.log(`Rejecting booking for booking ID ${bookingId} by driver ${user.userId}`);
    return this.bookingService.rejectBooking(bookingId, user.userId);
  }

  @UseGuards(TrustedGatewayGuard)
  @Put(':bookingId/cancel')
  async cancelBooking(@CurrentUser() user: any, @Param('bookingId') bookingId: string) {
    this.logger.log(`Cancelling booking for booking ID ${bookingId} by user ${user.userId}`);
    return this.bookingService.cancelBooking(bookingId, user.userId);
  }

  @UseGuards(TrustedGatewayGuard)
  @Delete(':bookingId')
  async deleteBooking(@CurrentUser() user: any, @Param('bookingId') bookingId: string) {
    this.logger.log(`Deleting booking for booking ID ${bookingId} by user ${user.userId}`);
    return this.bookingService.deleteBooking(bookingId, user.userId);
  }

  @MessagePattern('booking.ongoingStatus')
  async updateBookingStatusTcp(data: { bookingId: string; userId: string; startedAt?: Date }) {
    try {
      this.logger.log(`[TCP CONTROLLER] Updating booking ${data.bookingId} to ONGOING`);

      const result = await this.bookingService.updateBookingStatus(
        data.bookingId,
        data.userId,
        BookingStatus.ONGOING,
        data.startedAt,
      );

      return {
        success: true,
        message: 'Booking updated to ONGOING',
        data: result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[TCP CONTROLLER] Error: ${errorMessage}`, error);
    }
  }

  @MessagePattern('booking.complete')
  async completeBooking(data: { bookingId: string; completedAt: Date }) {
    try {
      this.logger.log(`[TCP CONTROLLER] Completing booking ${data.bookingId}`);

      const result = await this.bookingService.completeBookingFromTrip(data.bookingId, data.completedAt);

      return {
        success: true,
        message: 'Booking completed',
        data: result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[TCP CONTROLLER] Error: ${errorMessage}`, error);
    }
  }

  @MessagePattern('checkDriversAvailability')
  async checkDriversAvailability(data: { driverIds: string[] }) {
    try {
      this.logger.log(`[TCP] Checking availability for ${data.driverIds.length} drivers`);

      const availability = await this.bookingService.checkMultipleDriversAvailability(data.driverIds);

      return {
        success: true,
        data: availability,
      };
    } catch (error) {
      this.logger.error('[TCP] Error checking drivers availability:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        data: [],
      };
    }
  }

  @MessagePattern('getCustomerBookingHistory')
  async getCustomerBookingHistory(data: { customerId: string; daysBack: number; limit?: number }) {
    try {
      this.logger.log(`[TCP] Getting booking history for customer ${data.customerId}`);

      const history = await this.bookingService.getCustomerBookingHistory(
        data.customerId,
        data.daysBack,
        data.limit || 50,
      );

      return {
        success: true,
        data: history,
      };
    } catch (error) {
      this.logger.error('[TCP] Error getting customer booking history:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        data: [],
      };
    }
  }

  @MessagePattern('getCustomerCancelledBookings')
  async getCustomerCancelledBookings(data: { customerId: string; daysBack: number }) {
    try {
      this.logger.log(`[TCP] Getting cancelled bookings for customer ${data.customerId}`);

      const cancelledBookings = await this.bookingService.getCustomerCancelledBookings(data.customerId, data.daysBack);

      return {
        success: true,
        data: cancelledBookings,
      };
    } catch (error) {
      this.logger.error('[TCP] Error getting cancelled bookings:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        data: [],
      };
    }
  }

  @MessagePattern('getActiveBookingStats')
  async getActiveBookingStats() {
    try {
      this.logger.log('[TCP] Getting active booking statistics');

      const stats = await this.bookingService.getActiveBookingStatistics();

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      this.logger.error('[TCP] Error getting booking stats:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        data: {},
      };
    }
  }

  @MessagePattern('checkDriverActiveBooking')
  async checkDriverActiveBooking(data: { driverId: string }) {
    try {
      this.logger.log(`[TCP] Checking active booking for driver ${data.driverId}`);

      const hasActive = await this.bookingService.hasActiveBooking(data.driverId);

      return {
        success: true,
        data: {
          driverId: data.driverId,
          hasActiveBooking: hasActive,
        },
      };
    } catch (error) {
      this.logger.error('[TCP] Error checking driver active booking:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        data: {
          driverId: data.driverId,
          hasActiveBooking: true, // Fail safe
        },
      };
    }
  }
}
