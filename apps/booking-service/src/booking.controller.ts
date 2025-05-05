import { Controller, Post, Get, Put, Delete, Body, Param, UseGuards, Query } from '@nestjs/common';
import { BookingService } from '@app/booking/booking.service';
import { CreateBookingDto } from '@app/booking/dto/create-booking.dto';
import { UpdateBookingStatusDto } from '@app/booking/dto/update-booking-status.dto';
import { CurrentUser } from '@app/common/decorators/current-user.decorator';
import { BookingStatus } from '@app/common/enums/booking-status.enum';
import { JwtAuthGuard } from '@app/common';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  async createBooking(
    @CurrentUser() user: any,
    @Body() createBookingDto: CreateBookingDto
  ) {
    return this.bookingService.createBooking(user.userId, createBookingDto);
  }

  @Get(':bookingId')
  async getBookingDetails(@Param('bookingId') bookingId: string) {
    return this.bookingService.getBookingDetails(bookingId);
  }

  @Get()
  async getUserBookings(
    @CurrentUser() user: any,
    @Query('status') status?: BookingStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    return this.bookingService.getUserBookings(user.userId, status, page, limit);
  }

  @Put(':bookingId/status')
  async updateBookingStatus(
    @CurrentUser() user: any,
    @Param('bookingId') bookingId: string,
    @Body() updateStatusDto: UpdateBookingStatusDto
  ) {
    return this.bookingService.updateBookingStatus(bookingId, user.userId, updateStatusDto.status);
  }

  @Put(':bookingId/accept')
  async acceptBooking(
    @CurrentUser() user: any,
    @Param('bookingId') bookingId: string
  ) {
    return this.bookingService.acceptBooking(bookingId, user.userId);
  }

  @Put(':bookingId/reject')
  async rejectBooking(
    @CurrentUser() user: any,
    @Param('bookingId') bookingId: string
  ) {
    return this.bookingService.rejectBooking(bookingId, user.userId);
  }

  @Put(':bookingId/cancel')
  async cancelBooking(
    @CurrentUser() user: any,
    @Param('bookingId') bookingId: string
  ) {
    return this.bookingService.cancelBooking(bookingId, user.userId);
  }

  @Put(':bookingId/complete')
  async completeBooking(
    @CurrentUser() user: any,
    @Param('bookingId') bookingId: string
  ) {
    return this.bookingService.completeBooking(bookingId, user.userId);
  }

  @Delete(':bookingId')
  async deleteBooking(
    @CurrentUser() user: any,
    @Param('bookingId') bookingId: string
  ) {
    return this.bookingService.deleteBooking(bookingId, user.userId);
  }
}