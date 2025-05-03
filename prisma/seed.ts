// prisma/seed.ts
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Hash password using the same salt rounds as your application
  const password = 'password123';
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create customers
  const customers = [
    {
      id: '5af040fd-db8c-4f57-b1e9-1df7ac553689',
      name: 'Andi Customer',
      email: 'andi@example.com',
      phone: '081234567890',
      password: hashedPassword,
      role: UserRole.CUSTOMER,
    },
    {
      id: '6bf040fd-db8c-4f57-b1e9-1df7ac553690',
      name: 'Budi Customer',
      email: 'budi@example.com',
      phone: '081234567891',
      password: hashedPassword,
      role: UserRole.CUSTOMER,
    },
  ];

  // Create drivers
  const drivers = [
    {
      id: '7cf040fd-db8c-4f57-b1e9-1df7ac553691',
      name: 'Charlie Driver',
      email: 'charlie@example.com',
      phone: '081234567892',
      password: hashedPassword,
      role: UserRole.DRIVER,
    },
    {
      id: '8df040fd-db8c-4f57-b1e9-1df7ac553692',
      name: 'David Driver',
      email: 'david@example.com',
      phone: '081234567893',
      password: hashedPassword,
      role: UserRole.DRIVER,
    },
  ];

  // Insert customers
  for (const customer of customers) {
    await prisma.user.upsert({
      where: { id: customer.id },
      update: {},
      create: customer,
    });
  }

  console.log('Customers created successfully');

  // Insert drivers and create driver profiles
  for (const driver of drivers) {
    await prisma.user.upsert({
      where: { id: driver.id },
      update: {},
      create: {
        ...driver,
        driverProfile: {
          create: {
            vehicleType: 'MOTORCYCLE',
            plateNumber: `B ${Math.floor(Math.random() * 9000) + 1000} XYZ`,
            status: true,
            rating: 4.5,
            lastLatitude: -6.2088 + (Math.random() * 0.1 - 0.05), // Jakarta area
            lastLongitude: 106.8456 + (Math.random() * 0.1 - 0.05),
          },
        },
      },
    });
  }

  console.log('Drivers created successfully');
  
  // Optionally, create some test bookings
  // const testBooking = await prisma.booking.create({
  //   data: {
  //     customerId: customers[0].id,
  //     driverId: drivers[0].id,
  //     pickupLat: -6.2088,
  //     pickupLng: 106.8456,
  //     destinationLat: -6.1753,
  //     destinationLng: 106.8272,
  //     status: 'COMPLETED',
  //   },
  // });

  // console.log('Test booking created:', testBooking.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });