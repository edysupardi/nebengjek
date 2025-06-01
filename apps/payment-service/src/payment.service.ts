// apps/payment-service/src/payment/payment.service.ts
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TransactionRepository } from '@app/payment/repositories/transaction.repository';
import { CalculateFareDto } from '@app/payment/dto/calculate-fare.dto';
import { FinalizePaymentDto } from '@app/payment/dto/finalize-payment.dto';
import { PaymentResponseDto } from '@app/payment/dto/payment-response.dto';
import * as PriceConstant from '@app/common/constants/price.constant';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  constructor(private readonly transactionRepository: TransactionRepository) {}

  async calculateFare(calculateFareDto: CalculateFareDto): Promise<PaymentResponseDto> {
    this.logger.log(`Calculating fare for trip ID: ${calculateFareDto.tripId} with distance: ${calculateFareDto.distanceInKm} km`);
    const { tripId, distanceInKm } = calculateFareDto;
    
    // Calculate total fare based on distance
    const totalFare = distanceInKm * PriceConstant.PRICE_CONSTANTS.PRICE_PER_KM;
    
    // Calculate platform fee (5%)
    const platformFee = totalFare * (PriceConstant.PRICE_CONSTANTS.PLATFORM_FEE_PERCENTAGE / 100);
    
    // Calculate driver share (95%)
    const driverShare = totalFare - platformFee;
    
    // Create initial transaction record with status 'pending'
    const transaction = await this.transactionRepository.create({
      tripId,
      totalFare,
      driverShare,
      platformFee,
      discount: 0, // No discount initially
      finalAmount: totalFare, // Initially, final amount equals total fare
      status: 'pending',
    });
    
    return this.mapToResponseDto(transaction);
  }

  async getTransactionByTripId(tripId: string): Promise<PaymentResponseDto> {
    const transaction = await this.transactionRepository.findByTripId(tripId);
    if (!transaction) {
      this.logger.error(`Transaction for trip ID ${tripId} not found`);
      throw new NotFoundException(`Transaction for trip ${tripId} not found`);
    }
    this.logger.log(`Transaction found for trip ID ${tripId}: ${JSON.stringify(transaction)}`);
    return this.mapToResponseDto(transaction);
  }

  async getDriverTransactions(driverId: string): Promise<PaymentResponseDto[]> {
    this.logger.log(`Fetching transactions for driver ID: ${driverId}`);
    const transactions = await this.transactionRepository.listByDriverId(driverId);
    return transactions.map(transaction => this.mapToResponseDto(transaction));
  }

  async getCustomerTransactions(customerId: string): Promise<PaymentResponseDto[]> {
    this.logger.log(`Fetching transactions for customer ID: ${customerId}`);
    const transactions = await this.transactionRepository.listByCustomerId(customerId);
    return transactions.map(transaction => this.mapToResponseDto(transaction));
  }

  private mapToResponseDto(transaction: any): PaymentResponseDto {
    return {
      id: transaction.id,
      tripId: transaction.tripId,
      totalFare: transaction.totalFare,
      driverShare: transaction.driverShare,
      platformFee: transaction.platformFee,
      discount: transaction.discount,
      finalAmount: transaction.finalAmount,
      status: transaction.status,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    };
  }

  async mockAddDriverBalance(driverId: string, amount: number): Promise<{ success: boolean, message: string, balance: number }> {
    // Mock implementasi, anggap ini berhasil
    const mockNewBalance = 500000 + amount; // Anggap saldo awal 500rb
    
    console.log(`[MOCK] Added ${amount} to driver ${driverId}'s wallet. New balance: ${mockNewBalance}`);
    this.logger.log(`[MOCK] Added ${amount} to driver ${driverId}'s wallet. New balance: ${mockNewBalance}`);
    
    return {
      success: true,
      message: 'Saldo driver berhasil ditambahkan',
      balance: mockNewBalance
    };
  }
  
  // Fungsi mock untuk update saldo customer (mengurangi)
  async mockDeductCustomerBalance(customerId: string, amount: number): Promise<{ success: boolean, message: string, balance: number }> {
    // Mock implementasi, anggap ini berhasil
    const mockInitialBalance = 1000000; // Anggap saldo awal 1jt
    const mockNewBalance = mockInitialBalance - amount;
    
    // Simulate check if customer has enough balance
    if (mockNewBalance < 0) {
      console.log(`[MOCK] Insufficient balance for customer ${customerId}. Current balance: ${mockInitialBalance}`);
      this.logger.log(`[MOCK] Insufficient balance for customer ${customerId}. Current balance: ${mockInitialBalance}`);
      return {
        success: false,
        message: 'Saldo customer tidak mencukupi',
        balance: mockInitialBalance
      };
    }
    
    console.log(`[MOCK] Deducted ${amount} from customer ${customerId}'s wallet. New balance: ${mockNewBalance}`);
    this.logger.log(`[MOCK] Deducted ${amount} from customer ${customerId}'s wallet. New balance: ${mockNewBalance}`);
    
    return {
      success: true,
      message: 'Pembayaran berhasil dilakukan',
      balance: mockNewBalance
    };
  }
  
  async finalizePayment(finalizePaymentDto: FinalizePaymentDto): Promise<PaymentResponseDto> {
    const { tripId, discount = 0 } = finalizePaymentDto;
    
    // Find existing transaction
    const transaction = await this.transactionRepository.findByTripId(tripId);
    if (!transaction) {
      this.logger.error(`Transaction for trip ID ${tripId} not found`);
      throw new NotFoundException(`Transaction for trip ${tripId} not found`);
    }
    
    // Get trip details to get customer and driver IDs
    const trip = transaction.trip;
    if (!trip) {
      this.logger.error(`Trip details not found for trip ID ${tripId}`);
      throw new NotFoundException(`Trip details not found for trip ${tripId}`);
    }
    
    if (!trip.booking) {
      this.logger.error(`Booking details not found for booking ID ${trip.bookingId}`);
      throw new NotFoundException(`Booking details not found for booking ${trip.bookingId}`);
    }
    const booking = trip.booking;
    if (!booking.driverId) {
      this.logger.error(`Driver details not found for booking ID ${booking.id}`);
      throw new NotFoundException(`Driver details not found for booking ${booking.id}`);
    }
    if (!booking.customerId) {
      this.logger.error(`Customer details not found for booking ID ${booking.id}`);
      throw new NotFoundException(`Customer details not found for booking ${booking.id}`);
    }
    
    const customerId = booking.customerId;
    const driverId = booking.driverId;
    
    // Calculate final amount after discount
    const finalAmount = Math.max(0, transaction.totalFare - discount);
    
    // Update driver share and platform fee based on final amount
    const platformFee = finalAmount * (PriceConstant.PRICE_CONSTANTS.PLATFORM_FEE_PERCENTAGE / 100);
    const driverShare = finalAmount - platformFee;
    
    // Mock payment process
    const customerPaymentResult = await this.mockDeductCustomerBalance(customerId, finalAmount);
    if (!customerPaymentResult.success) {
      this.logger.error(`Payment failed for customer ${customerId}: ${customerPaymentResult.message}`);
      throw new BadRequestException(customerPaymentResult.message);
    }

    const driverPaymentResult = await this.mockAddDriverBalance(driverId, driverShare);
    if (!driverPaymentResult.success) {
      this.logger.error(`Payment failed for driver ${driverId}: ${driverPaymentResult.message}`);
      throw new BadRequestException(driverPaymentResult.message);
    }
    this.logger.log(`Payment finalized for trip ID ${tripId}: Customer ${customerId} paid ${finalAmount}, Driver ${driverId} received ${driverShare}`);

    // Update transaction with final values
    const updatedTransaction = await this.transactionRepository.update(transaction.id, {
      discount,
      finalAmount,
      driverShare,
      platformFee,
      status: 'paid',
    });
    
    return this.mapToResponseDto(updatedTransaction);
  }
}