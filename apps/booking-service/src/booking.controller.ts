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
}
