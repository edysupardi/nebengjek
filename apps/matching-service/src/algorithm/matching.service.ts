import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/database/prisma/prisma.service';
import { RedisService } from '@app/database/redis/redis.service';
import { FindMatchDto } from './dto/find-match.dto';
import { MatchResponseDto, DriverMatchDto } from './dto/match-response.dto';
import { DistanceHelper } from './distance.helper';

@Injectable()
export class MatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  /**
   * Mencari driver terdekat untuk customer
   * @param findMatchDto DTO dengan koordinat customer dan radius pencarian
   * @returns Driver-driver terdekat dalam radius pencarian
   */
  async findDrivers(findMatchDto: FindMatchDto): Promise<MatchResponseDto> {
    const { latitude, longitude, radius } = findMatchDto;

    try {
      // Mengambil driver yang sedang online dari database
      const onlineDrivers = await this.prisma.driverProfile.findMany({
        where: {
          status: true, // hanya driver yang online
          lastLatitude: { not: null },
          lastLongitude: { not: null }
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phone: true
            }
          }
        }
      });

      // Jika tidak ada driver online
      if (onlineDrivers.length === 0) {
        return {
          success: false,
          message: 'Tidak ada driver yang tersedia saat ini',
          data: []
        };
      }

      // Filter driver berdasarkan jarak
      const nearbyDrivers = DistanceHelper.filterByDistance(
        onlineDrivers,
        latitude,
        longitude,
        radius
      );

      // Ubah format data untuk response
      const formattedDrivers: DriverMatchDto[] = nearbyDrivers.map(driver => ({
        id: driver.id,
        userId: driver.userId,
        name: driver.user.name,
        phone: driver.user.phone,
        lastLatitude: driver.lastLatitude,
        lastLongitude: driver.lastLongitude,
        distance: Number(driver.distance.toFixed(2)),
        vehicleType: driver.vehicleType,
        plateNumber: driver.plateNumber,
        rating: driver.rating
      }));

      return {
        success: true,
        message: `Berhasil menemukan ${formattedDrivers.length} driver terdekat`,
        data: formattedDrivers
      };
    } catch (error) {
      console.error('Error finding drivers:', error);
      return {
        success: false,
        message: 'Terjadi kesalahan saat mencari driver',
        data: []
      };
    }
  }
}