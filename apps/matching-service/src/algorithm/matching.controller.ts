import { Controller, Post, Body, Get, Param, Query } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { FindMatchDto } from './dto/find-match.dto';
import { MatchResponseDto } from './dto/match-response.dto';
import { MessagePattern } from '@nestjs/microservices';

@Controller('matching')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Post('find')
  async findMatch(@Body() findMatchDto: FindMatchDto): Promise<MatchResponseDto> {
    return this.matchingService.findDrivers(findMatchDto);
  }

  @Get('drivers/nearby')
  async findNearbyDrivers(
    @Query('latitude') latitude: number,
    @Query('longitude') longitude: number,
    @Query('radius') radius: number = 1
  ): Promise<MatchResponseDto> {
    const findMatchDto: FindMatchDto = {
      customerId: null, // Tidak perlu customerId untuk pencarian umum
      latitude,
      longitude,
      radius
    };
    return this.matchingService.findDrivers(findMatchDto);
  }

  @MessagePattern('findDrivers')
  async findDriversRPC(data: any) {
    const findMatchDto: FindMatchDto = {
      customerId: data.customerId || null,
      latitude: data.latitude,
      longitude: data.longitude,
      radius: data.radius || 1
    };
    
    const result = await this.matchingService.findDrivers(findMatchDto);
    
    // Transform response to match booking service expectations
    if (result.success && result.data.length > 0) {
      return {
        drivers: result.data.map(driver => ({
          driverId: driver.id,        // Map 'id' to 'driverId' 
          distance: driver.distance,
          name: driver.name,
          phone: driver.phone,
          rating: driver.rating,
          vehicleType: driver.vehicleType,
          plateNumber: driver.plateNumber
        }))
      };
    }
    
    // Return empty drivers if no match
    return {
      drivers: []
    };
  }
}