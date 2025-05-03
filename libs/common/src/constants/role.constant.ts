import { UserRole } from '../enums';

export const ROLE_CONSTANTS = {
  DEFAULT_ROLE: UserRole.CUSTOMER,
  AVAILABLE_ROLES: [UserRole.CUSTOMER, UserRole.DRIVER, UserRole.ADMIN],
};