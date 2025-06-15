module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/apps', '<rootDir>/libs'],
  testMatch: ['**/*.spec.ts', '**/*.test.ts'],

  // KEY: Path mapping untuk Jest
  moduleNameMapper: {
    '^@app/common/(.*)$': '<rootDir>/libs/common/src/$1',
    '^@app/common$': '<rootDir>/libs/common/src',
    '^@app/database/(.*)$': '<rootDir>/libs/database/src/$1',
    '^@app/database$': '<rootDir>/libs/database/src',
    '^@app/messaging/(.*)$': '<rootDir>/libs/messaging/src/$1',
    '^@app/messaging$': '<rootDir>/libs/messaging/src',

    '^@app/booking/(.*)$': '<rootDir>/apps/booking-service/src/$1',
    '^@app/booking$': '<rootDir>/apps/booking-service/src',
    '^@app/auth/(.*)$': '<rootDir>/apps/user-service/src/auth/$1',
    '^@app/auth$': '<rootDir>/apps/user-service/src/auth',
    '^@app/user/(.*)$': '<rootDir>/apps/user-service/src/user/$1',
    '^@app/user$': '<rootDir>/apps/user-service/src/user',
  },

  // TypeScript config untuk Jest
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.spec.json',
    },
  },

  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },

  collectCoverageFrom: [
    'apps/**/*.(t|j)s',
    'libs/**/*.(t|j)s',
    '!apps/**/*.spec.ts',
    '!apps/**/*.test.ts',
    '!libs/**/*.spec.ts',
    '!libs/**/*.test.ts',
  ],
};
