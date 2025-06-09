// apps/payment-service/src/payment/payment.controller.ts
import { Controller, Post, Body, Get, Param, UseGuards, Logger } from '@nestjs/common';
import { PaymentService } from '@app/payment/payment.service';
import { CalculateFareDto } from './dto/calculate-fare.dto';
import { FinalizePaymentDto } from './dto/finalize-payment.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { JwtAuthGuard, RolesGuard } from '@app/common/guards';
import { Roles } from '@app/common/decorators';
import { UserRole } from '@app/common/enums';
import { TrustedGatewayGuard } from '@app/common/guards/trusted-gateway.guard';
import { FinalPaymentDto } from './dto/final-payment.dto';
import { MessagePattern } from '@nestjs/microservices';

@Controller('payments')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);
  constructor(private readonly paymentService: PaymentService) {}

  @UseGuards(TrustedGatewayGuard)
  @Post('calculate')
  async calculateFare(@Body() calculateFareDto: CalculateFareDto): Promise<PaymentResponseDto> {
    this.logger.log(
      `Calculating fare for trip ID: ${calculateFareDto.tripId} with distance: ${calculateFareDto.distanceInKm} km`,
    );
    return this.paymentService.calculateFare(calculateFareDto);
  }

  @UseGuards(TrustedGatewayGuard)
  @Post('finalize')
  async finalizePayment(@Body() finalizePaymentDto: FinalizePaymentDto): Promise<PaymentResponseDto> {
    this.logger.log(
      `Finalizing payment for trip ID: ${finalizePaymentDto.tripId} with discount: ${finalizePaymentDto.discount}`,
    );
    return this.paymentService.finalizePayment(finalizePaymentDto);
  }

  @UseGuards(TrustedGatewayGuard)
  @Get('trip/:tripId')
  async getTransactionByTripId(@Param('tripId') tripId: string): Promise<PaymentResponseDto> {
    this.logger.log(`Fetching transaction for trip ID: ${tripId}`);
    return this.paymentService.getTransactionByTripId(tripId);
  }

  @UseGuards(TrustedGatewayGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @Get('driver/:driverId')
  async getDriverTransactions(@Param('driverId') driverId: string): Promise<PaymentResponseDto[]> {
    this.logger.log(`Fetching transactions for driver ID: ${driverId}`);
    return this.paymentService.getDriverTransactions(driverId);
  }

  @UseGuards(TrustedGatewayGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  @Get('customer/:customerId')
  async getCustomerTransactions(@Param('customerId') customerId: string): Promise<PaymentResponseDto[]> {
    this.logger.log(`Fetching transactions for customer ID: ${customerId}`);
    return this.paymentService.getCustomerTransactions(customerId);
  }

  @UseGuards(TrustedGatewayGuard)
  @Get('wallet/driver/:driverId')
  async getDriverWalletStatus(@Param('driverId') driverId: string) {
    const mockBalance = 500000; // Fixed amount for demo
    this.logger.log(`Fetching wallet status for driver ID: ${driverId}`);
    return {
      driverId,
      balance: mockBalance,
      currency: 'IDR',
      lastUpdated: new Date(),
    };
  }

  @UseGuards(TrustedGatewayGuard)
  @Get('wallet/customer/:customerId')
  async getCustomerWalletStatus(@Param('customerId') customerId: string) {
    const mockBalance = 1000000; // Fixed amount for demo
    this.logger.log(`Fetching wallet status for customer ID: ${customerId}`);
    return {
      customerId,
      balance: mockBalance,
      currency: 'IDR',
      lastUpdated: new Date(),
    };
  }

  @MessagePattern('payment.processTrip')
  async processTripPayment(data: FinalPaymentDto) {
    this.logger.log(`TCP Message: Processing payment for trip ${data.tripId}`);
    return this.paymentService.processTripPayment(data);
  }

  // Optional: HTTP endpoint untuk testing
  @Post('process-trip')
  async processTripPaymentHttp(@Body() data: FinalPaymentDto) {
    this.logger.log(`HTTP endpoint: Processing payment for trip ${data.tripId}`);
    return this.paymentService.processTripPayment(data);
  }
}
