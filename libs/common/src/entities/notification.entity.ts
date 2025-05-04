import { User } from "./user.entity";

export class Notification {
  id: string;
  userId: string;
  type: string;
  content: string;
  isRead: boolean;
  createdAt: Date;

  // Relations
  user?: User;
}