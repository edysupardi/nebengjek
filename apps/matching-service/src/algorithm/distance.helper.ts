export class DistanceHelper {
  /**
   * Menghitung jarak antara dua titik menggunakan formula Haversine
   * @param lat1 latitude titik 1
   * @param lng1 longitude titik 1
   * @param lat2 latitude titik 2
   * @param lng2 longitude titik 2
   * @returns jarak dalam kilometer
   */
  static calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Radius bumi dalam kilometer
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * 
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return distance;
  }

  private static toRad(value: number): number {
    return value * Math.PI / 180;
  }

  /**
   * Memfilter driver berdasarkan jarak maksimum
   * @param drivers array driver dengan koordinat
   * @param lat latitude customer
   * @param lng longitude customer
   * @param maxDistance jarak maksimum dalam kilometer
   * @returns array driver dalam jarak maksimum
   */
  static filterByDistance(
    drivers: any[],
    lat: number,
    lng: number,
    maxDistance: number
  ): any[] {
    return drivers
      .map(driver => ({
        ...driver,
        distance: this.calculateDistance(
          lat,
          lng,
          driver.lastLatitude,
          driver.lastLongitude
        )
      }))
      .filter(driver => driver.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance);
  }
}