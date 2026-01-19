export type JwtPayload = {
  sub: string;
  email: string;
  role: string;
  name: string;
  department: string;
  type: 'access' | 'refresh';
};

export type AuthUser = {
  id: string;
  email: string;
  role: string;
  name: string;
  department: string;
};

export type RequestUser = {
  userId: string;
  userEmail?: string;
  userName: string;
  department: string;
  role: string;
};

