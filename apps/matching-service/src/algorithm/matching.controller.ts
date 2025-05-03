import { Controller, Post, Body, Get, Param, Query } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { FindMatchDto } from './dto/find-match.dto';
import { MatchResponseDto } from './dto/match-response.dto';

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
}